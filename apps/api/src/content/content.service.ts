import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../authz/roles.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
// Field-level encode/decode, emptiness, and validation are shared with the
// public API's write endpoints (see content-field-codec.ts's own doc
// comment) — this used to keep its own copy of all of it, which is exactly
// the kind of drift that let the public API's partial-update bugs go
// unnoticed here too. Importing the real shared implementation instead of
// a parallel copy means a fix like that one now covers both surfaces.
import {
  decodeFieldValue,
  encodeFieldValue,
  isEmptyValue,
  validateContentData as validateContentDataFields,
  type FieldRow,
} from './content-field-codec.js';

// Local types mirroring the `content` / `content_meta` / `collection_fields`
// columns — not imported from Prisma's generated models, for the same
// reason MediaService/CollectionsService avoid it (see docs/PHASE-2-NOTES.md).
interface ContentRow {
  id: number;
  projectId: number;
  collectionId: number;
  locale: string | null;
  createdAt: Date | null;
  createdBy: number | null;
  updatedAt: Date | null;
  updatedBy: number | null;
  publishedAt: Date | null;
  publishedBy: number | null;
  deletedAt: Date | null;
}

interface ContentMetaRow {
  id: number;
  contentId: number;
  fieldName: string;
  value: string | null;
}

export interface ContentListQuery {
  page?: number;
  each?: number;
  search?: string;
  orderBy?: string;
  cr?: 'ASC' | 'DESC';
  sbm?: boolean; // "sort by meta" — order by a field's value instead of a content column
  getItems?: 'all' | 'published' | 'draft' | 'trashed';
}

export interface ContentInput {
  locale?: string;
  published?: boolean;
  data?: Record<string, unknown>;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- fires the
    // content.published/content.updated/content.deleted/approval.requested
    // events WebhooksService listens for. Optional-by-injection-token isn't
    // needed: EventEmitterModule.forRoot() in AppModule is global, so
    // EventEmitter2 is always available here.
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async loadCollectionOrThrow(projectId: number, collectionId: number) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!collection) {
      throw new NotFoundException(`Collection ${collectionId} not found in project ${projectId}`);
    }
    return collection;
  }

  private toFlatContent(content: ContentRow, meta: ContentMetaRow[], fields: FieldRow[]) {
    const byName = new Map(meta.map((m) => [m.fieldName, m.value]));
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      data[field.name] = decodeFieldValue(field, byName.get(field.name));
    }

    return {
      id: content.id,
      locale: content.locale,
      createdAt: content.createdAt,
      createdBy: content.createdBy,
      updatedAt: content.updatedAt,
      updatedBy: content.updatedBy,
      publishedAt: content.publishedAt,
      publishedBy: content.publishedBy,
      data,
    };
  }

  // Delegates to the shared validateContentData (content-field-codec.ts) —
  // required/email/numeric/charcount/unique, identical to the legacy
  // store()/update() validation and to the public API's write path. Only
  // this wrapper's error shape (`data.<field>` keys, thrown as one 400) is
  // specific to the admin API's frontend contract.
  //
  // `ignoreContentId` is only ever passed by update() (see below), so its
  // presence doubles as the partial-update signal: an edit shouldn't have
  // to resend every required field just to change one — the same fix
  // applied to the public API's PATCH after Explorer testing turned up the
  // same gap here.
  private async validateContentData(
    fields: FieldRow[],
    data: Record<string, unknown>,
    collectionId: number,
    ignoreContentId?: number,
  ) {
    const errors = await validateContentDataFields(
      fields,
      data,
      async (fieldName, value) => {
        const clash = await this.prisma.contentMeta.findFirst({
          where: {
            collectionId,
            fieldName,
            value: String(value),
            deletedAt: null,
            ...(ignoreContentId ? { contentId: { not: ignoreContentId } } : {}),
          },
        });
        return !!clash;
      },
      'data.',
      { partial: ignoreContentId !== undefined },
    );

    if (errors) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
  }

  async list(projectId: number, collectionId: number, query: ContentListQuery) {
    const collection = await this.loadCollectionOrThrow(projectId, collectionId);
    const fields = collection.fields as unknown as FieldRow[];

    const page = query.page && query.page > 0 ? query.page : 1;
    const perPage = query.each && query.each > 0 ? query.each : 15;
    const direction = query.cr === 'DESC' ? ('desc' as const) : ('asc' as const);
    const orderColumn = query.orderBy ?? 'createdAt';
    const getItems = query.getItems ?? 'all';

    // Search matches the legacy behavior: any content_meta value LIKE the
    // query narrows the result set, scoped to this collection.
    let searchedContentIds: number[] | null = null;
    if (query.search) {
      const rows = await this.prisma.contentMeta.findMany({
        where: { collectionId, value: { contains: query.search }, deletedAt: null },
        select: { contentId: true },
      });
      searchedContentIds = Array.from(new Set<number>(rows.map((r: { contentId: number }) => r.contentId)));
    }

    const baseWhere = {
      collectionId,
      ...(searchedContentIds ? { id: { in: searchedContentIds } } : {}),
    };

    const [total, published, draft, trashed] = await Promise.all([
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null, publishedAt: { not: null } } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null, publishedAt: null } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: { not: null } } }),
    ]);

    const statusWhere =
      getItems === 'published'
        ? { ...baseWhere, deletedAt: null, publishedAt: { not: null } }
        : getItems === 'draft'
          ? { ...baseWhere, deletedAt: null, publishedAt: null }
          : getItems === 'trashed'
            ? { ...baseWhere, deletedAt: { not: null } }
            : { ...baseWhere, deletedAt: null };

    let rows: (ContentRow & { meta: ContentMetaRow[] })[];

    if (query.sbm && orderColumn) {
      // "Sort by meta": ordering by a dynamic field's value isn't a plain
      // column sort, so unlike the column-orderBy path below (which sorts
      // and paginates at the DB level), this loads every matching row and
      // sorts in application code. Fine at the row counts an admin UI like
      // this deals in; flagged in docs/PHASE-4-NOTES.md as the one path
      // that doesn't scale to a very large collection the way the legacy
      // DB-level subquery order did.
      const all = await this.prisma.content.findMany({
        where: statusWhere,
        include: { meta: { where: { deletedAt: null } } },
      });
      all.sort((a: any, b: any) => {
        const av = a.meta.find((m: ContentMetaRow) => m.fieldName === orderColumn)?.value ?? '';
        const bv = b.meta.find((m: ContentMetaRow) => m.fieldName === orderColumn)?.value ?? '';
        return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      rows = all.slice((page - 1) * perPage, page * perPage);
    } else {
      // Only direct content columns are supported for DB-level sort — the
      // legacy app additionally supports sorting by created_by/updated_by/
      // published_by's resolved user email via a join subquery, which isn't
      // ported here (see docs/PHASE-4-NOTES.md).
      const sortableColumns = new Set(['id', 'createdAt', 'updatedAt', 'publishedAt']);
      const column = sortableColumns.has(orderColumn) ? orderColumn : 'createdAt';

      rows = await this.prisma.content.findMany({
        where: statusWhere,
        include: { meta: { where: { deletedAt: null } } },
        orderBy: { [column]: direction },
        skip: (page - 1) * perPage,
        take: perPage,
      });
    }

    const userIds = [
      ...new Set(
        rows.flatMap((r) => [r.createdBy, r.updatedBy, r.publishedBy]).filter((id): id is number => !!id),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const userById = new Map(users.map((u: { id: number; email: string }) => [u.id, u]));

    // §11.3 built the approval-status panel on a single content item's own
    // edit page; the list view had no equivalent, so a pending item was
    // invisible unless you opened it. One batched query for this page's
    // rows (never one query per row) — `resolvePublishIntent` reuses an
    // in-flight request rather than creating a second one, so `status:
    // 'pending'` alone is enough to know a row is currently gated, no need
    // to join workflow/step details just to render a badge.
    const pendingContentIds = new Set(
      (
        await this.prisma.contentApprovalRequest.findMany({
          where: { contentId: { in: rows.map((r) => r.id) }, status: 'pending' },
          select: { contentId: true },
        })
      ).map((r) => r.contentId),
    );

    const displayField = fields.find((f) => ['title', 'name'].includes(f.name)) ?? fields[0];

    return {
      data: rows.map((row) => {
        const flat = this.toFlatContent(row, row.meta, fields);
        return {
          ...flat,
          title: displayField ? flat.data[displayField.name] : `#${row.id}`,
          createdBy: row.createdBy ? (userById.get(row.createdBy) ?? null) : null,
          updatedBy: row.updatedBy ? (userById.get(row.updatedBy) ?? null) : null,
          publishedBy: row.publishedBy ? (userById.get(row.publishedBy) ?? null) : null,
          trashed: !!row.deletedAt,
          pendingApproval: pendingContentIds.has(row.id),
        };
      }),
      page,
      perPage,
      total,
      published,
      draft,
      trashed,
    };
  }

  // Project-wide entry list, across every collection in the project.
  //
  // The admin API has always been scoped per-collection (the legacy app has
  // no equivalent screen), so this is genuinely new — added for the Content
  // screen, which shows one stream of recent work rather than making an
  // editor pick a collection first. It reuses the same search / status /
  // pagination semantics as list() above so the two screens can't drift.
  async listForProject(projectId: number, query: ContentListQuery) {
    const collections = await this.prisma.collection.findMany({
      where: { projectId, deletedAt: null },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    const page = query.page && query.page > 0 ? query.page : 1;
    const perPage = query.each && query.each > 0 ? query.each : 20;
    const direction = query.cr === 'ASC' ? ('asc' as const) : ('desc' as const);
    const getItems = query.getItems ?? 'all';

    let searchedContentIds: number[] | null = null;
    if (query.search) {
      const rows = await this.prisma.contentMeta.findMany({
        where: { projectId, value: { contains: query.search }, deletedAt: null },
        select: { contentId: true },
      });
      searchedContentIds = Array.from(new Set<number>(rows.map((r: { contentId: number }) => r.contentId)));
    }

    const baseWhere = {
      projectId,
      ...(searchedContentIds ? { id: { in: searchedContentIds } } : {}),
    };

    const [total, published, draft, trashed] = await Promise.all([
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null, publishedAt: { not: null } } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: null, publishedAt: null } }),
      this.prisma.content.count({ where: { ...baseWhere, deletedAt: { not: null } } }),
    ]);

    const statusWhere =
      getItems === 'published'
        ? { ...baseWhere, deletedAt: null, publishedAt: { not: null } }
        : getItems === 'draft'
          ? { ...baseWhere, deletedAt: null, publishedAt: null }
          : getItems === 'trashed'
            ? { ...baseWhere, deletedAt: { not: null } }
            : { ...baseWhere, deletedAt: null };

    const sortableColumns = new Set(['id', 'createdAt', 'updatedAt', 'publishedAt']);
    const column = sortableColumns.has(query.orderBy ?? '') ? query.orderBy! : 'updatedAt';

    // Annotated rather than inferred, for the same reason list() above
    // annotates its own `rows` — this service deliberately doesn't depend
    // on Prisma's generated model types (see the note at the top of this file).
    const rows: (ContentRow & { meta: ContentMetaRow[] })[] = await this.prisma.content.findMany({
      where: statusWhere,
      include: { meta: { where: { deletedAt: null } } },
      orderBy: { [column]: direction },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.createdBy, r.updatedBy, r.publishedBy])
          .filter((id): id is number => !!id),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const userById = new Map(users.map((u: { id: number; email: string }) => [u.id, u]));

    type CollectionWithFields = (typeof collections)[number];
    const collectionById = new Map<number, CollectionWithFields>(
      collections.map((c: CollectionWithFields) => [c.id, c]),
    );

    // Same batched pending-approval flag as list() above (see that
    // comment) — one query for this page's rows, not one per row.
    const pendingContentIds = new Set(
      (
        await this.prisma.contentApprovalRequest.findMany({
          where: { contentId: { in: rows.map((r) => r.id) }, status: 'pending' },
          select: { contentId: true },
        })
      ).map((r) => r.contentId),
    );

    return {
      data: rows.map((row) => {
        const collection = collectionById.get(row.collectionId);
        const fields = (collection?.fields ?? []) as unknown as FieldRow[];
        const flat = this.toFlatContent(row, row.meta, fields);

        // Which field stands in for the entry's title, one-line summary and
        // path is a naming convention, not something the schema records —
        // list() already picks the title this way. A collection that uses
        // none of these names simply shows no summary or slug rather than
        // getting a made-up one.
        const titleField = fields.find((f) => ['title', 'name'].includes(f.name)) ?? fields[0];
        const summaryField = fields.find((f) =>
          ['description', 'summary', 'excerpt', 'subtitle'].includes(f.name),
        );
        const slugField = fields.find((f) => ['slug', 'path', 'url', 'permalink'].includes(f.name));

        const asText = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

        return {
          id: row.id,
          collectionId: row.collectionId,
          collectionName: collection?.name ?? null,
          collectionSlug: collection?.slug ?? null,
          title: titleField ? (flat.data[titleField.name] ?? null) : null,
          summary: summaryField ? asText(flat.data[summaryField.name]) : null,
          slug: slugField ? asText(flat.data[slugField.name]) : null,
          locale: row.locale,
          publishedAt: row.publishedAt,
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
          trashed: !!row.deletedAt,
          updatedBy: row.updatedBy ? (userById.get(row.updatedBy) ?? null) : null,
          createdBy: row.createdBy ? (userById.get(row.createdBy) ?? null) : null,
          pendingApproval: pendingContentIds.has(row.id),
        };
      }),
      page,
      perPage,
      total,
      published,
      draft,
      trashed,
    };
  }

  async findOne(projectId: number, collectionId: number, contentId: number) {
    const collection = await this.loadCollectionOrThrow(projectId, collectionId);
    const fields = collection.fields as unknown as FieldRow[];

    const content = await this.prisma.content.findFirst({
      where: { id: contentId, projectId, collectionId },
      include: { meta: { where: { deletedAt: null } } },
    });
    if (!content) throw new NotFoundException(`Content ${contentId} not found`);

    return this.toFlatContent(content, content.meta, fields);
  }

  async create(projectId: number, collectionId: number, userId: number, input: ContentInput) {
    const collection = await this.loadCollectionOrThrow(projectId, collectionId);
    const fields = collection.fields as unknown as FieldRow[];
    const data = input.data ?? {};

    await this.validateContentData(fields, data, collectionId);

    // Always created as Draft first — resolvePublishIntent below decides
    // whether "published: true" actually publishes it or, if this
    // Project's Department has an approval workflow configured (docs
    // RBAC-TENANT-RECOMMENDATION.md §6), gates it behind one instead.
    const created = await this.prisma.content.create({
      data: {
        projectId,
        collectionId,
        locale: input.locale ?? null,
        createdBy: userId,
        publishedAt: null,
        publishedBy: null,
      },
    });

    // Matches the legacy store(): a meta row is only written for fields
    // that aren't "empty" (see isEmptyValue) — an omitted/blank field just
    // has no row at all rather than a row holding an empty string.
    for (const field of fields) {
      const raw = data[field.name];
      if (isEmptyValue(raw)) continue;

      const value = await encodeFieldValue(field, raw, null);
      await this.prisma.contentMeta.create({
        data: {
          projectId,
          collectionId,
          contentId: created.id,
          fieldName: field.name,
          value,
        },
      });
    }

    if (input.published) {
      const { publishedAt, publishedBy, pendingApproval } = await this.resolvePublishIntent(
        projectId,
        created.id,
        userId,
        true,
        false,
      );
      await this.prisma.content.update({
        where: { id: created.id },
        data: { publishedAt, publishedBy },
      });

      // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- a brand-new
      // Draft that was never published emits nothing (no prior state to
      // "change" yet); only an actual publish-on-create transition does.
      if (pendingApproval) {
        this.eventEmitter.emit('approval.requested', { projectId, contentId: created.id, collectionId });
      } else if (publishedAt) {
        this.eventEmitter.emit('content.published', { projectId, contentId: created.id, collectionId });
      }
    }

    return this.findOne(projectId, collectionId, created.id);
  }

  async update(
    projectId: number,
    collectionId: number,
    contentId: number,
    userId: number,
    input: ContentInput,
  ) {
    const collection = await this.loadCollectionOrThrow(projectId, collectionId);
    const fields = collection.fields as unknown as FieldRow[];
    const data = input.data ?? {};

    const content = await this.prisma.content.findFirst({
      where: { id: contentId, projectId, collectionId },
      include: { meta: { where: { deletedAt: null } } },
    });
    if (!content) throw new NotFoundException(`Content ${contentId} not found`);

    await this.validateContentData(fields, data, collectionId, contentId);

    // §6 gating applies here too, not just to the dedicated /publish
    // route — the form's "Published" checkbox is another path to the
    // same intent, and both need to go through the same workflow check.
    const wasPublished = content.publishedAt !== null;
    const { publishedAt, publishedBy, pendingApproval } = await this.resolvePublishIntent(
      projectId,
      contentId,
      userId,
      !!input.published,
      wasPublished,
    );

    await this.prisma.content.update({
      where: { id: contentId },
      data: {
        locale: input.locale ?? null,
        updatedBy: userId,
        publishedAt,
        publishedBy,
      },
    });

    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- exactly one
    // of these fires: a fresh approval submission, a genuine Draft-to-
    // Published transition, or (everything else -- a plain field edit, or
    // a republish of already-published content) a generic update.
    if (pendingApproval) {
      this.eventEmitter.emit('approval.requested', { projectId, contentId, collectionId });
    } else if (!wasPublished && publishedAt) {
      this.eventEmitter.emit('content.published', { projectId, contentId, collectionId });
    } else {
      this.eventEmitter.emit('content.updated', { projectId, contentId, collectionId });
    }

    const existingByName = new Map<string, ContentMetaRow>(
      content.meta.map((m: ContentMetaRow) => [m.fieldName, m]),
    );

    // Matches the legacy update(): if a meta row already exists it's always
    // updated (even to an empty value) — only a *new* row requires the
    // value to be non-empty to get created at all. That asymmetry with
    // create() is a real legacy quirk, kept here on purpose.
    for (const field of fields) {
      if (!(field.name in data)) continue;

      const raw = data[field.name];
      const existing = existingByName.get(field.name);
      const value = await encodeFieldValue(field, raw, existing?.value ?? null);

      if (existing) {
        await this.prisma.contentMeta.update({ where: { id: existing.id }, data: { value } });
      } else if (!isEmptyValue(raw)) {
        await this.prisma.contentMeta.create({
          data: { projectId, collectionId, contentId, fieldName: field.name, value },
        });
      }
    }

    return this.findOne(projectId, collectionId, contentId);
  }

  async publish(projectId: number, collectionId: number, contentId: number, userId: number) {
    const existing = await this.mustExist(projectId, collectionId, contentId);
    const wasPublished = existing.publishedAt !== null;
    const { publishedAt, publishedBy, pendingApproval } = await this.resolvePublishIntent(
      projectId,
      contentId,
      userId,
      true,
      wasPublished,
    );
    await this.prisma.content.update({ where: { id: contentId }, data: { publishedAt, publishedBy } });

    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- same
    // three-way split as update() above.
    if (pendingApproval) {
      this.eventEmitter.emit('approval.requested', { projectId, contentId, collectionId });
    } else if (!wasPublished && publishedAt) {
      this.eventEmitter.emit('content.published', { projectId, contentId, collectionId });
    } else {
      this.eventEmitter.emit('content.updated', { projectId, contentId, collectionId });
    }

    return { pendingApproval };
  }

  async unpublish(projectId: number, collectionId: number, contentId: number) {
    await this.mustExist(projectId, collectionId, contentId);
    const { publishedAt, publishedBy } = await this.resolvePublishIntent(projectId, contentId, 0, false, false);
    await this.prisma.content.update({
      where: { id: contentId },
      data: { publishedAt, publishedBy },
    });
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §6 — the one place every "publish"
  // entry point funnels through (create()'s published checkbox, update()'s,
  // and the dedicated /publish route). If the content's Project has no
  // Department, or its Department has no ApprovalWorkflow configured,
  // this behaves exactly as it always did: direct publish, no gate
  // (§6.1's "additive, not a breaking change" requirement). Otherwise a
  // publish intent creates (or reuses an already-in-flight)
  // ContentApprovalRequest instead of actually publishing — content stays
  // Draft (publishedAt stays null) until every configured step approves,
  // in order (approveContent/rejectContent below).
  //
  // wasPublished lets already-published content stay published on a
  // plain re-save without re-triggering the gate (matches this method's
  // pre-existing "republish bumps the timestamp" behavior) — only a
  // genuine Draft-to-Published transition is ever gated.
  private async resolvePublishIntent(
    projectId: number,
    contentId: number,
    userId: number,
    wantsPublished: boolean,
    wasPublished: boolean,
  ): Promise<{ publishedAt: Date | null; publishedBy: number | null; pendingApproval: boolean }> {
    if (!wantsPublished) {
      // Explicit Draft/unpublish intent also withdraws any request still
      // in flight — a Draft with a stray 'pending' request hanging off it
      // would be a confusing, inconsistent state to leave behind.
      await this.prisma.contentApprovalRequest.updateMany({
        where: { contentId, status: 'pending' },
        data: { status: 'withdrawn', decidedAt: new Date() },
      });
      return { publishedAt: null, publishedBy: null, pendingApproval: false };
    }

    if (wasPublished) {
      return { publishedAt: new Date(), publishedBy: userId, pendingApproval: false };
    }

    const workflow = await this.getActiveWorkflow(projectId);
    if (!workflow) {
      return { publishedAt: new Date(), publishedBy: userId, pendingApproval: false };
    }

    // Idempotent: re-submitting while a request is already pending
    // doesn't create a second one.
    const existingPending = await this.prisma.contentApprovalRequest.findFirst({
      where: { contentId, status: 'pending' },
    });
    if (!existingPending) {
      await this.prisma.contentApprovalRequest.create({
        data: {
          contentId,
          projectId,
          workflowId: workflow.id,
          status: 'pending',
          currentStepOrder: 1,
          submittedBy: userId,
          submittedAt: new Date(),
        },
      });
    }

    return { publishedAt: null, publishedBy: null, pendingApproval: true };
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.6 — a Project's own
  // approval-workflow override, when configured, REPLACES its
  // Department's workflow entirely for this project — checked first, and
  // used as-is if found, regardless of whether the Department also has
  // one configured. This is also what makes "remove the override" fall
  // back to the Department's workflow for free, with no extra state to
  // track: removing the override row just means this lookup finds
  // nothing and falls through to the Department lookup below, exactly as
  // if the override had never existed.
  private async getActiveWorkflow(projectId: number) {
    const projectWorkflow = await this.prisma.approvalWorkflow.findUnique({
      where: { projectId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (projectWorkflow) return projectWorkflow;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { department: true },
    });
    const departmentId = project?.department?.id;
    if (!departmentId) return null;

    return this.prisma.approvalWorkflow.findUnique({
      where: { departmentId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  private async getProjectScopeContext(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { department: true },
    });
    return {
      projectId,
      departmentId: project?.department?.id,
      tenantId: project?.department?.tenantId ?? undefined,
    };
  }

  // Read-only status + audit trail for a content item's most recent
  // approval request (or null if it was never submitted through a
  // workflow, or its Department has none configured). Any editor-tier
  // user can read this — same as the rest of ContentController — it's
  // the acting (approve/reject) that's gated by role.
  async getApprovalStatus(projectId: number, collectionId: number, contentId: number, userId: number) {
    await this.mustExist(projectId, collectionId, contentId, true);

    const request = await this.prisma.contentApprovalRequest.findFirst({
      where: { contentId },
      orderBy: { id: 'desc' },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { id: 'asc' } },
      },
    });
    if (!request) return null;

    // docs/RBAC-TENANT-RECOMMENDATION.md §11.3's flagged display gap:
    // Approve/Reject used to render for anyone with editor-tier project
    // access — the real gate only ran inside approveContent/rejectContent
    // themselves, so an unauthorized click surfaced as an inline error
    // AFTER the fact instead of the buttons never appearing. Compute the
    // exact same check those two methods use, here, once, so the caller
    // can hide the buttons instead — reusing satisfiesRoleKind rather
    // than inventing a second notion of "can this user act" that could
    // drift from the real enforcement.
    let canAct = false;
    if (request.status === 'pending') {
      const currentStep = request.workflow.steps.find((s) => s.stepOrder === request.currentStepOrder);
      if (currentStep) {
        const roles = await this.rolesService.getUserRoles(userId);
        const scope = await this.getProjectScopeContext(projectId);
        canAct = this.rolesService.satisfiesRoleKind(
          roles,
          currentStep.requiredRoleKind as 'admin' | 'department_admin' | 'tenant_admin',
          scope,
        );
      }
    }

    return {
      id: request.id,
      status: request.status,
      currentStepOrder: request.currentStepOrder,
      totalSteps: request.workflow.steps.length,
      steps: request.workflow.steps.map((s) => ({
        stepOrder: s.stepOrder,
        requiredRoleKind: s.requiredRoleKind,
      })),
      submittedBy: request.submittedBy,
      submittedAt: request.submittedAt,
      decidedAt: request.decidedAt,
      canAct,
      history: request.actions.map((a) => ({
        stepOrder: a.stepOrder,
        actorId: a.actorId,
        action: a.action,
        comment: a.comment,
        createdAt: a.createdAt,
      })),
    };
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.8 -- the dashboard-wide
  // "awaiting your approval" nav-bar notification list. Unlike
  // getApprovalStatus above (one specific content item, checked against
  // that one item's project scope), this scans every PENDING request
  // system-wide and keeps only the ones whose current step this user
  // actually satisfies -- reusing the exact same satisfiesRoleKind check
  // approveContent/rejectContent enforce, so nothing surfaced here could
  // ever 403 if acted on. Two queries total (roles, then every pending
  // request with its workflow/content/collection/project/department
  // already joined) -- no per-request query. Fine at the in-flight
  // approval-queue sizes this is meant for; would want narrowing (e.g. by
  // the caller's own department/tenant ids) if that queue ever grew large
  // in a real deployment.
  async getPendingApprovalsForUser(userId: number) {
    const roles = await this.rolesService.getUserRoles(userId);

    // Live-verified gap (§11.8): trash() never touches an in-flight
    // ContentApprovalRequest -- it only soft-deletes the Content/ContentMeta
    // rows (see trash() above). Without this filter, trashing a submitted
    // item leaves its request sitting at status 'pending' forever, and it
    // would keep surfacing here as a ghost notification pointing at
    // content nobody can act on anymore. content.deletedAt: null excludes
    // it the same way every other list in this file already excludes
    // trashed rows from its default view.
    const requests = await this.prisma.contentApprovalRequest.findMany({
      where: { status: 'pending', content: { deletedAt: null } },
      include: {
        workflow: { include: { steps: true } },
        content: {
          include: {
            meta: { where: { deletedAt: null } },
            collection: { include: { fields: { orderBy: { order: 'asc' } } } },
            project: { include: { department: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const items: Array<{
      requestId: number;
      contentId: number;
      projectId: number;
      projectName: string;
      collectionId: number;
      collectionName: string;
      title: string;
      requiredRoleKind: string;
      stepOrder: number;
      totalSteps: number;
      submittedAt: Date | null;
      href: string;
    }> = [];

    for (const request of requests) {
      const currentStep = request.workflow.steps.find((s) => s.stepOrder === request.currentStepOrder);
      if (!currentStep) continue;

      const project = request.content.project;
      const scope = {
        projectId: project.id,
        departmentId: project.department?.id,
        tenantId: project.department?.tenantId ?? undefined,
      };
      const kind = currentStep.requiredRoleKind as 'admin' | 'department_admin' | 'tenant_admin';
      if (!this.rolesService.satisfiesRoleKind(roles, kind, scope)) continue;

      const fields = request.content.collection.fields as unknown as FieldRow[];
      const displayField = fields.find((f) => ['title', 'name'].includes(f.name)) ?? fields[0];
      const flat = this.toFlatContent(request.content, request.content.meta, fields);
      const rawTitle = displayField ? flat.data[displayField.name] : undefined;
      const title =
        rawTitle === null || rawTitle === undefined || rawTitle === ''
          ? `#${request.content.id}`
          : String(rawTitle);

      items.push({
        requestId: request.id,
        contentId: request.content.id,
        projectId: project.id,
        projectName: project.name,
        collectionId: request.content.collectionId,
        collectionName: request.content.collection.name,
        title,
        requiredRoleKind: kind,
        stepOrder: request.currentStepOrder,
        totalSteps: request.workflow.steps.length,
        submittedAt: request.submittedAt,
        href: `/projects/${project.id}/collections/${request.content.collectionId}/content/${request.content.id}`,
      });
    }

    return items;
  }

  private async loadPendingRequestOrThrow(contentId: number) {
    const request = await this.prisma.contentApprovalRequest.findFirst({
      where: { contentId, status: 'pending' },
      include: { workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
    if (!request) throw new NotFoundException('No pending approval request for this content');

    const currentStep = request.workflow.steps.find((s) => s.stepOrder === request.currentStepOrder);
    if (!currentStep) {
      throw new NotFoundException(`Workflow step ${request.currentStepOrder} not found`);
    }
    return { request, currentStep };
  }

  // Approves the CURRENT step only — sequential, single-approver-per-step
  // for this first version (§6.1/§6.4: no parallel/branching graphs).
  // Reaching the last step's approval is what actually calls Content
  // publish for the first time; every earlier step just advances
  // currentStepOrder.
  async approveContent(
    projectId: number,
    collectionId: number,
    contentId: number,
    userId: number,
    comment?: string,
  ) {
    await this.mustExist(projectId, collectionId, contentId);
    const { request, currentStep } = await this.loadPendingRequestOrThrow(contentId);

    const roles = await this.rolesService.getUserRoles(userId);
    const scope = await this.getProjectScopeContext(projectId);
    const kind = currentStep.requiredRoleKind as 'admin' | 'department_admin' | 'tenant_admin';
    if (!this.rolesService.satisfiesRoleKind(roles, kind, scope)) {
      throw new ForbiddenException(`Approving step ${request.currentStepOrder} requires the ${kind} role`);
    }

    await this.prisma.contentApprovalAction.create({
      data: {
        requestId: request.id,
        stepOrder: request.currentStepOrder,
        actorId: userId,
        action: 'approved',
        comment: comment ?? null,
      },
    });

    const isLastStep = request.currentStepOrder >= request.workflow.steps.length;
    if (isLastStep) {
      await this.prisma.$transaction([
        this.prisma.contentApprovalRequest.update({
          where: { id: request.id },
          data: { status: 'approved', decidedAt: new Date() },
        }),
        this.prisma.content.update({
          where: { id: contentId },
          data: { publishedAt: new Date(), publishedBy: userId },
        }),
      ]);
      return { status: 'published' as const };
    }

    await this.prisma.contentApprovalRequest.update({
      where: { id: request.id },
      data: { currentStepOrder: request.currentStepOrder + 1 },
    });
    return {
      status: 'pending_approval' as const,
      currentStepOrder: request.currentStepOrder + 1,
      totalSteps: request.workflow.steps.length,
    };
  }

  // Rejects at the current step — the whole request ends (not just the
  // step), returning the content to Draft with the reviewer's comment as
  // feedback (§6.1: "Rejected ... as a branch off Pending Approval").
  // Resubmitting afterward (checking "Published" again, or /publish)
  // starts a brand-new request at step 1 — no partial credit for steps
  // already passed before the rejection, matching §6.4's "no workflow
  // versioning/no resuming mid-flight" simplicity bar.
  async rejectContent(
    projectId: number,
    collectionId: number,
    contentId: number,
    userId: number,
    comment?: string,
  ) {
    await this.mustExist(projectId, collectionId, contentId);
    const { request, currentStep } = await this.loadPendingRequestOrThrow(contentId);

    const roles = await this.rolesService.getUserRoles(userId);
    const scope = await this.getProjectScopeContext(projectId);
    const kind = currentStep.requiredRoleKind as 'admin' | 'department_admin' | 'tenant_admin';
    if (!this.rolesService.satisfiesRoleKind(roles, kind, scope)) {
      throw new ForbiddenException(`Rejecting step ${request.currentStepOrder} requires the ${kind} role`);
    }

    await this.prisma.$transaction([
      this.prisma.contentApprovalAction.create({
        data: {
          requestId: request.id,
          stepOrder: request.currentStepOrder,
          actorId: userId,
          action: 'rejected',
          comment: comment ?? null,
        },
      }),
      this.prisma.contentApprovalRequest.update({
        where: { id: request.id },
        data: { status: 'rejected', decidedAt: new Date() },
      }),
    ]);
    return { status: 'rejected' as const };
  }

  // Soft-delete — mirrors the legacy moveToTrash(): content and its meta
  // rows get `deletedAt` set, not actually removed.
  async trash(projectId: number, collectionId: number, contentId: number) {
    await this.mustExist(projectId, collectionId, contentId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.contentMeta.updateMany({ where: { contentId }, data: { deletedAt: now } }),
      this.prisma.content.update({ where: { id: contentId }, data: { deletedAt: now } }),
    ]);
  }

  // The legacy app only exposes bulk restore (restoreSelected) — a single-
  // item restore is a natural, low-risk addition kept for UI symmetry with
  // trash(); see docs/PHASE-4-NOTES.md.
  async restore(projectId: number, collectionId: number, contentId: number) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, projectId, collectionId, deletedAt: { not: null } },
    });
    if (!content) throw new NotFoundException(`Trashed content ${contentId} not found`);

    await this.prisma.$transaction([
      this.prisma.contentMeta.updateMany({ where: { contentId }, data: { deletedAt: null } }),
      this.prisma.content.update({ where: { id: contentId }, data: { deletedAt: null } }),
    ]);
  }

  // Hard delete — mirrors the legacy delete(): force-deletes meta then content.
  async remove(projectId: number, collectionId: number, contentId: number) {
    await this.mustExist(projectId, collectionId, contentId, true);
    await this.prisma.$transaction([
      this.prisma.contentMeta.deleteMany({ where: { contentId } }),
      this.prisma.content.delete({ where: { id: contentId } }),
    ]);
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1
    this.eventEmitter.emit('content.deleted', { projectId, contentId, collectionId });
  }

  private async mustExist(
    projectId: number,
    collectionId: number,
    contentId: number,
    includeTrashed = false,
  ) {
    const content = await this.prisma.content.findFirst({
      where: {
        id: contentId,
        projectId,
        collectionId,
        ...(includeTrashed ? {} : { deletedAt: null }),
      },
    });
    if (!content) throw new NotFoundException(`Content ${contentId} not found`);
    return content;
  }
}
