import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@mycms/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../authz/roles.service.js';

// Matches the `collections` table's columns — kept as an explicit local
// type rather than importing Prisma's generated `Collection` model, since
// this repo's Prisma client hasn't actually been generated against the real
// schema in every environment (see docs/PHASE-2-NOTES.md).
export interface CollectionInput {
  name?: string;
  slug?: string;
  // Both new (see docs/PHASE-6-NOTES.md) — description is free text shown
  // on the content-model screen's header; options is a freeform bucket
  // (field groups today: `{ fieldGroups?: { id: string; name: string }[] }`).
  description?: string | null;
  options?: Record<string, unknown> | null;
}

// The legacy app reserves this slug for a project's own built-in media
// route (see CollectionsController::store/update in the legacy app) — a
// collection can't claim it.
const RESERVED_SLUGS = ['project-media'];

type CollectionRecord = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  options: unknown;
};

type FieldRecord = {
  type: string;
  label: string;
  name: string;
  description: string | null;
  placeholder: string | null;
  options: unknown;
  validations: unknown;
};

type SnapshotField = {
  id: number;
  type: string;
  label: string;
  name: string;
  description: string | null;
  placeholder: string | null;
  options: unknown;
  validations: unknown;
};

// A recursive, key-order-independent JSON serialization — used only to
// compare two field snapshots for equality (see compareVersions below).
// Plain JSON.stringify is order-sensitive, and the two sides being
// compared don't share an origin: a version's snapshot round-trips
// through MySQL's native JSON column, which re-serializes (and reorders)
// object keys on storage, while "current" fields are built fresh as plain
// JS object literals in code. Comparing those with JSON.stringify made
// every field look "changed" even seconds after taking a snapshot with no
// edits in between — this fixes that by sorting keys recursively before
// comparing, so only real content differences are reported.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private async loadCollectionOrThrow(projectId: number, collectionId: number) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
    });
    if (!collection) throw new NotFoundException(`Collection ${collectionId} not found`);
    return collection;
  }

  private async validate(projectId: number, input: CollectionInput, ignoreId?: number) {
    const errors: Record<string, string[]> = {};

    if (!input.name || !input.name.trim()) {
      errors.name = ['The name field is required.'];
    }

    if (!input.slug || !input.slug.trim()) {
      errors.slug = ['The slug field is required.'];
    } else if (RESERVED_SLUGS.includes(input.slug)) {
      errors.slug = ['This slug is reserved and cannot be used.'];
    } else {
      const clash = await this.prisma.collection.findFirst({
        where: {
          projectId,
          slug: input.slug,
          deletedAt: null,
          ...(ignoreId ? { id: { not: ignoreId } } : {}),
        },
      });
      if (clash) {
        errors.slug = ['This slug is already in use for this project.'];
      }
    }

    if (Object.keys(errors).length) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
  }

  // Appends "-copy", then "-copy-2", "-copy-3", ... until a free slug is
  // found in the TARGET project — used by both clone() (target === source
  // project) and fork() (target is a different project, so a plain
  // "-copy" often already resolves on the first try there).
  private async uniqueSlug(targetProjectId: number, baseSlug: string): Promise<string> {
    let candidate = `${baseSlug}-copy`;
    let suffix = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.collection.findFirst({
        where: { projectId: targetProjectId, slug: candidate, deletedAt: null },
      });
      if (!clash) return candidate;
      candidate = `${baseSlug}-copy-${suffix}`;
      suffix += 1;
    }
  }

  // Shared by clone() and fork() — creates a new collection in
  // `targetProjectId` from `source`, then copies every one of `fields`
  // verbatim onto it. A relation field's `options.relation.collection` is
  // copied as-is: it keeps pointing at whatever collection it originally
  // pointed at (the source's sibling, not the new copy) — this does not
  // attempt to duplicate a whole graph of related collections, only the
  // one being cloned/forked. That's a deliberate scope limit, called out
  // in docs/PHASE-6-NOTES.md.
  private async duplicateInto(
    source: CollectionRecord,
    fields: FieldRecord[],
    targetProjectId: number,
    nameSuffix: string,
  ) {
    const slug = await this.uniqueSlug(targetProjectId, source.slug);

    const created = await this.prisma.collection.create({
      data: {
        projectId: targetProjectId,
        name: `${source.name}${nameSuffix}`,
        slug,
        description: source.description,
        options: (source.options ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.prisma.collection.update({
      where: { id: created.id },
      data: { order: created.id },
    });

    for (const field of fields) {
      const createdField = await this.prisma.collectionField.create({
        data: {
          projectId: targetProjectId,
          collectionId: created.id,
          type: field.type,
          label: field.label,
          name: field.name,
          description: field.description,
          placeholder: field.placeholder,
          options: (field.options ?? undefined) as Prisma.InputJsonValue | undefined,
          validations: (field.validations ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      await this.prisma.collectionField.update({
        where: { id: createdField.id },
        data: { order: createdField.id },
      });
    }

    return this.findOne(targetProjectId, created.id);
  }

  // Each row carries a real field/entry count so the content-model screen
  // can show them without inventing numbers. Grouped counts rather than
  // Prisma's `_count` relation filter, for the same reason ProjectsService
  // does it this way — soft-deleted rows have to be excluded explicitly.
  async findAllForProject(projectId: number) {
    await this.loadProjectOrThrow(projectId);

    const collections = await this.prisma.collection.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    if (collections.length === 0) return [];

    const ids = collections.map((c: { id: number }) => c.id);

    const [fieldCounts, contentCounts] = await Promise.all([
      this.prisma.collectionField.groupBy({
        by: ['collectionId'],
        where: { collectionId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.content.groupBy({
        by: ['collectionId'],
        where: { collectionId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    type CountRow = { collectionId: number; _count: { _all: number } };
    const fieldsByCollection = new Map<number, number>(
      (fieldCounts as CountRow[]).map((r) => [r.collectionId, r._count._all]),
    );
    const contentByCollection = new Map<number, number>(
      (contentCounts as CountRow[]).map((r) => [r.collectionId, r._count._all]),
    );

    return collections.map((collection: (typeof collections)[number]) => ({
      ...collection,
      fieldCount: fieldsByCollection.get(collection.id) ?? 0,
      contentCount: contentByCollection.get(collection.id) ?? 0,
    }));
  }

  async create(projectId: number, input: CollectionInput) {
    await this.loadProjectOrThrow(projectId);
    await this.validate(projectId, input);

    const created = await this.prisma.collection.create({
      data: {
        projectId,
        name: input.name!.trim(),
        slug: input.slug!,
        description: input.description ?? undefined,
        options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // Mirrors the legacy store() — order defaults to the row's own id, so
    // new collections land at the end without a separate max() query.
    return this.prisma.collection.update({
      where: { id: created.id },
      data: { order: created.id },
    });
  }

  async findOne(projectId: number, collectionId: number) {
    await this.loadProjectOrThrow(projectId);

    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
      include: {
        fields: { orderBy: { order: 'asc' } },
        project: {
          include: {
            collections: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!collection) throw new NotFoundException(`Collection ${collectionId} not found`);

    const contentCount = await this.prisma.content.count({
      where: { collectionId, deletedAt: null },
    });

    // Prisma's `options` / `validations` columns are native Json — unlike
    // the legacy PHP, which stores them as text and has to json_decode()
    // each field by hand in show(), no decode step is needed here.
    return { ...collection, contentCount };
  }

  async update(projectId: number, collectionId: number, input: CollectionInput) {
    await this.loadProjectOrThrow(projectId);
    const existing = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Collection ${collectionId} not found`);

    await this.validate(projectId, input, collectionId);

    return this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        name: input.name!.trim(),
        slug: input.slug!,
        // Both optional: omitted entirely (key not sent at all) leaves the
        // column untouched, so the existing rename-only form (name/slug)
        // doesn't accidentally wipe these. Note this can't distinguish
        // "clear it back to null" from "don't touch it" for `options` —
        // an explicit `null` collapses to "don't touch" here, the same
        // lenient `?? undefined` behavior collection-fields.service.ts
        // already uses for its own JSON columns.
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.options !== undefined
          ? { options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined }
          : {}),
      },
    });
  }

  async remove(projectId: number, collectionId: number) {
    await this.loadProjectOrThrow(projectId);
    const existing = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Collection ${collectionId} not found`);

    // Cascades exactly like the legacy delete(): fields, then content+meta
    // are hard-deleted (force-delete, not the soft `deletedAt` used
    // elsewhere in this schema), then the collection row itself.
    const contentRows = await this.prisma.content.findMany({
      where: { collectionId },
      select: { id: true },
    });
    const contentIds = contentRows.map((c: { id: number }) => c.id);

    await this.prisma.$transaction([
      this.prisma.collectionField.deleteMany({ where: { collectionId } }),
      this.prisma.contentMeta.deleteMany({ where: { contentId: { in: contentIds } } }),
      this.prisma.content.deleteMany({ where: { collectionId } }),
      this.prisma.collectionVersion.deleteMany({ where: { collectionId } }),
      this.prisma.collection.delete({ where: { id: collectionId } }),
    ]);
  }

  async reorder(projectId: number, items: Array<{ id: number; order: number }>) {
    await this.loadProjectOrThrow(projectId);

    // Matches the legacy updateOrder()'s firstOrFail per item — an id that
    // doesn't belong to this project throws and the whole batch is rejected.
    for (const item of items) {
      const existing = await this.prisma.collection.findFirst({
        where: { id: item.id, projectId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Collection ${item.id} not found in project ${projectId}`);
      }
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.collection.update({ where: { id: item.id }, data: { order: item.order } }),
      ),
    );
  }

  // Clone = duplicate within the SAME project (see docs/PHASE-6-NOTES.md —
  // no legacy precedent, this is new for this stack).
  async clone(projectId: number, collectionId: number) {
    await this.loadProjectOrThrow(projectId);
    const source = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!source) throw new NotFoundException(`Collection ${collectionId} not found`);

    return this.duplicateInto(source, source.fields as FieldRecord[], projectId, ' (Copy)');
  }

  // Fork = duplicate into a DIFFERENT project (see docs/PHASE-6-NOTES.md).
  // Unlike every other method here, the acting user's access to the
  // *target* project isn't already covered by this route's own
  // ProjectRoleGuard (that guard only checks the URL's :projectId, which is
  // the SOURCE project) — so this explicitly re-checks 'admin' tier against
  // targetProjectId itself before writing anything there.
  async fork(projectId: number, collectionId: number, targetProjectId: number, actorUserId: number) {
    await this.loadProjectOrThrow(projectId);
    await this.loadProjectOrThrow(targetProjectId);

    if (targetProjectId === projectId) {
      throw new BadRequestException(
        'Fork target must be a different project — use Clone to duplicate within this project.',
      );
    }

    const roles = await this.rolesService.getUserRoles(actorUserId);
    if (!this.rolesService.canAccess(roles, targetProjectId, 'admin')) {
      throw new ForbiddenException(`Requires admin access to project ${targetProjectId}`);
    }

    const source = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!source) throw new NotFoundException(`Collection ${collectionId} not found`);

    return this.duplicateInto(source, source.fields as FieldRecord[], targetProjectId, '');
  }

  // Dependencies — new, no legacy precedent. A "dependent" is any relation
  // field (anywhere in this project) whose `options.relation.collection`
  // points at this collection. `options` is a JSON column with no indexed
  // path in this schema, so rather than a fragile JSON_EXTRACT query this
  // fetches every relation-type field in the project (bounded by the
  // project's own field count, never large) and filters in memory.
  async dependencies(projectId: number, collectionId: number) {
    await this.loadProjectOrThrow(projectId);
    await this.loadCollectionOrThrow(projectId, collectionId);

    const relationFields = await this.prisma.collectionField.findMany({
      where: { projectId, type: 'relation' },
      include: { collection: true },
    });

    type RelationField = {
      id: number;
      name: string;
      label: string;
      options: unknown;
      collection: { id: number; name: string; slug: string };
    };

    const dependents = (relationFields as RelationField[])
      .filter((f) => Number((f.options as { relation?: { collection?: unknown } } | null)?.relation?.collection) === collectionId)
      .map((f) => ({
        fieldId: f.id,
        fieldName: f.name,
        fieldLabel: f.label,
        collectionId: f.collection.id,
        collectionName: f.collection.name,
        collectionSlug: f.collection.slug,
      }));

    return { collectionId, dependents };
  }

  // Versions — a point-in-time snapshot of this collection's field
  // definitions (see docs/PHASE-6-NOTES.md; no legacy precedent). The
  // snapshot is a plain copy of the current field rows, not a reference to
  // them, so a later edit to the live fields never changes what an
  // already-taken version shows.
  async listVersions(projectId: number, collectionId: number) {
    await this.loadProjectOrThrow(projectId);
    await this.loadCollectionOrThrow(projectId, collectionId);

    return this.prisma.collectionVersion.findMany({
      where: { collectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVersion(
    projectId: number,
    collectionId: number,
    label: string | undefined,
    actorUserId?: number,
  ) {
    await this.loadProjectOrThrow(projectId);
    await this.loadCollectionOrThrow(projectId, collectionId);

    const fields = await this.prisma.collectionField.findMany({
      where: { collectionId },
      orderBy: { order: 'asc' },
    });

    const snapshot: SnapshotField[] = (fields as (FieldRecord & { id: number })[]).map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      name: f.name,
      description: f.description,
      placeholder: f.placeholder,
      options: f.options,
      validations: f.validations,
    }));

    return this.prisma.collectionVersion.create({
      data: {
        projectId,
        collectionId,
        label: label?.trim() || `Version ${new Date().toISOString()}`,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdBy: actorUserId ?? undefined,
      },
    });
  }

  async deleteVersion(projectId: number, collectionId: number, versionId: number) {
    await this.loadProjectOrThrow(projectId);
    await this.loadCollectionOrThrow(projectId, collectionId);

    const existing = await this.prisma.collectionVersion.findFirst({
      where: { id: versionId, collectionId },
    });
    if (!existing) throw new NotFoundException(`Version ${versionId} not found`);

    await this.prisma.collectionVersion.delete({ where: { id: versionId } });
  }

  // Comparison — diffs one version's field snapshot against either another
  // version or the collection's current live fields (`toVersionId` omitted
  // or 'current'). Diffed by field `name` (the stable identifier a field
  // keeps across edits, unlike its numeric id in a fresh snapshot).
  async compareVersions(
    projectId: number,
    collectionId: number,
    fromVersionId: number,
    toVersionId?: number | 'current',
  ) {
    await this.loadProjectOrThrow(projectId);
    await this.loadCollectionOrThrow(projectId, collectionId);

    const fromVersion = await this.prisma.collectionVersion.findFirst({
      where: { id: fromVersionId, collectionId },
    });
    if (!fromVersion) throw new NotFoundException(`Version ${fromVersionId} not found`);

    const fromFields = fromVersion.snapshot as unknown as SnapshotField[];

    let toFields: SnapshotField[];
    let toMeta: { id: number | null; label: string };

    if (!toVersionId || toVersionId === 'current') {
      const liveFields = await this.prisma.collectionField.findMany({
        where: { collectionId },
        orderBy: { order: 'asc' },
      });
      toFields = (liveFields as (FieldRecord & { id: number })[]).map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        name: f.name,
        description: f.description,
        placeholder: f.placeholder,
        options: f.options,
        validations: f.validations,
      }));
      toMeta = { id: null, label: 'Current' };
    } else {
      const toVersion = await this.prisma.collectionVersion.findFirst({
        where: { id: toVersionId, collectionId },
      });
      if (!toVersion) throw new NotFoundException(`Version ${toVersionId} not found`);
      toFields = toVersion.snapshot as unknown as SnapshotField[];
      toMeta = { id: toVersion.id, label: toVersion.label };
    }

    const fromByName = new Map(fromFields.map((f) => [f.name, f]));
    const toByName = new Map(toFields.map((f) => [f.name, f]));

    const added = toFields.filter((f) => !fromByName.has(f.name));
    const removed = fromFields.filter((f) => !toByName.has(f.name));
    const changed: Array<{ name: string; from: SnapshotField; to: SnapshotField }> = [];
    for (const [name, fromField] of fromByName) {
      const toField = toByName.get(name);
      if (toField && stableStringify(fromField) !== stableStringify(toField)) {
        changed.push({ name, from: fromField, to: toField });
      }
    }

    return {
      from: { id: fromVersion.id, label: fromVersion.label },
      to: toMeta,
      added,
      removed,
      changed,
    };
  }
}
