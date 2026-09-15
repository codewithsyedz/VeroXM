import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReadCacheService } from '../read-cache/read-cache.service.js';

interface FieldRow {
  id: number;
  type: string;
  name: string;
  options: {
    hiddenInAPI?: boolean;
    media?: { type?: 1 | 2 };
    relation?: { collection?: number; type?: 1 | 2 };
    [key: string]: unknown;
  } | null;
}

interface ContentRow {
  id: number;
  projectId: number;
  collectionId: number;
  locale: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  publishedAt: Date | null;
}

interface ContentMetaRow {
  contentId: number;
  fieldName: string;
  value: string | null;
}

// Narrower shape for the two call sites below that only ever `select:
// { contentId: true, value: true }` (fieldName is already fixed/known from
// the query's own `where`, so there's no need to select it back out).
// Using ContentMetaRow there was a latent type error masked all along by
// this environment's untyped Prisma stub (see docs/PHASE-2-NOTES.md) — it
// only surfaced once `prisma generate` ran for real against an actual
// schema.
interface ContentIdValueRow {
  contentId: number;
  value: string | null;
}

const CONTENT_COLUMN_MAP: Record<string, string> = {
  id: 'id',
  locale: 'locale',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  published_at: 'publishedAt',
};
const DATE_COLUMNS = new Set(['created_at', 'updated_at', 'published_at']);

export interface ListOptions {
  where?: unknown;
  whereRelation?: Record<string, Record<string, string>>;
  sort?: string;
  state?: string;
  offset?: number;
  limit?: number;
  count?: boolean;
  first?: boolean;
  timestamps?: boolean;
}

function splitCsv(v: string): string[] {
  return v.split(',').map((s) => s.trim());
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  return new Set([...a].filter((x) => b.has(x)));
}
function union(a: Set<number>, b: Set<number>): Set<number> {
  return new Set([...a, ...b]);
}

@Injectable()
export class PublicContentService {
  constructor(
    private readonly prisma: PrismaService,
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- cache-aside
    // read path; see list()/getById() below and
    // ReadCacheInvalidationListener for the other half.
    private readonly cache: ReadCacheService,
  ) {}

  private async loadCollection(projectId: number, slug: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { projectId, slug, deletedAt: null },
      include: { fields: true },
    });
    if (!collection) throw new NotFoundException({ error: 'Collection not found!' });
    return collection;
  }

  // Builds a Prisma filter for a direct `content` column (id/locale/
  // created_at/updated_at/published_at) — always AND'ed onto the base
  // query directly, exactly like the legacy app: these never participate
  // in the meta multi-dimension AND/OR grouping below.
  private buildColumnFilter(key: string, value: unknown): Record<string, unknown> {
    const isDate = DATE_COLUMNS.has(key);

    if (value !== null && typeof value === 'object') {
      const v = value as Record<string, string>;
      if ('not' in v) return { not: v.not };
      if ('in' in v) return { in: splitCsv(v.in) };
      if ('not_in' in v) return { notIn: splitCsv(v.not_in) };
      if ('lt' in v) return { lt: v.lt };
      if ('lte' in v) return { lte: v.lte };
      if ('gt' in v) return { gt: v.gt };
      if ('gte' in v) return { gte: v.gte };
      if ('between' in v) {
        const parts = splitCsv(v.between);
        if (parts.length !== 2) throw new BadRequestException({ error: 'Incorrect where statement' });
        return { gte: parts[0], lte: parts[1] };
      }
      if ('not_between' in v) {
        const parts = splitCsv(v.not_between);
        if (parts.length !== 2) throw new BadRequestException({ error: 'Incorrect where statement' });
        return { NOT: { gte: parts[0], lte: parts[1] } };
      }
      throw new BadRequestException({ error: 'Incorrect where statement' });
    }

    // Scalar equality — the legacy app uses whereDate() for the three
    // timestamp columns (a day-level match); id/locale compare exactly.
    if (isDate) {
      const day = new Date(String(value));
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      return { gte: day, lt: next };
    }
    return { equals: key === 'id' ? Number(value) : value };
  }

  // Resolves one meta-field clause (a single {fieldName: value} pair,
  // possibly with an operator object) to the set of matching content ids.
  // Kept independent per field, then intersected across a clause's keys —
  // deliberately NOT reusing the legacy app's single shared SQL alias per
  // clause, which breaks (matches nothing) once a clause has more than one
  // field key. See docs/PHASE-5-NOTES.md.
  private async resolveFieldCondition(
    projectId: number,
    collectionId: number,
    fieldsByName: Map<string, FieldRow>,
    universe: number[],
    fieldName: string,
    rawValue: unknown,
  ): Promise<Set<number>> {
    const field = fieldsByName.get(fieldName);

    if (rawValue === 'null' || rawValue === 'not_null') {
      const withValue = await this.prisma.contentMeta.findMany({
        where: { projectId, collectionId, fieldName, deletedAt: null, NOT: { value: '' } },
        select: { contentId: true },
      });
      const withValueIds = new Set<number>(withValue.map((r: { contentId: number }) => r.contentId));
      return rawValue === 'not_null' ? withValueIds : new Set(universe.filter((id) => !withValueIds.has(id)));
    }

    // Relation-type fields store a comma-joined id list — containment is
    // checked in application code (exact membership) rather than a SQL
    // FIND_IN_SET/LIKE, which avoids both the substring false-positive risk
    // ("12" inside "123") and any raw-SQL string interpolation.
    if (field?.type === 'relation' && (rawValue === null || typeof rawValue !== 'object')) {
      const rows = await this.prisma.contentMeta.findMany({
        where: { projectId, collectionId, fieldName, deletedAt: null },
        select: { contentId: true, value: true },
      });
      const needle = String(rawValue);
      return new Set(
        rows
          .filter((r: ContentIdValueRow) => (r.value ?? '').split(',').includes(needle))
          .map((r: ContentIdValueRow) => r.contentId),
      );
    }

    const valueFilter: Record<string, unknown> = {};
    if (rawValue !== null && typeof rawValue === 'object') {
      const v = rawValue as Record<string, string>;
      if ('like' in v) valueFilter.contains = v.like;
      else if ('not' in v) valueFilter.not = v.not;
      else if ('in' in v) valueFilter.in = splitCsv(v.in);
      else if ('not_in' in v) valueFilter.notIn = splitCsv(v.not_in);
      else if ('lt' in v) valueFilter.lt = v.lt;
      else if ('lte' in v) valueFilter.lte = v.lte;
      else if ('gt' in v) valueFilter.gt = v.gt;
      else if ('gte' in v) valueFilter.gte = v.gte;
      else if ('between' in v || 'not_between' in v) {
        const raw = (v.between ?? v.not_between) as string;
        const parts = splitCsv(raw);
        if (parts.length !== 2) throw new BadRequestException({ error: 'Incorrect where statement' });
        if ('between' in v) {
          valueFilter.gte = parts[0];
          valueFilter.lte = parts[1];
        }
      }
    } else {
      valueFilter.equals = String(rawValue);
    }

    const rows = await this.prisma.contentMeta.findMany({
      where: { projectId, collectionId, fieldName, deletedAt: null, value: valueFilter },
      select: { contentId: true },
    });
    let ids = new Set<number>(rows.map((r: { contentId: number }) => r.contentId));

    // `not_between` on a meta value needs the NOT applied post-hoc since it
    // isn't a single Prisma comparator.
    if (
      rawValue !== null &&
      typeof rawValue === 'object' &&
      'not_between' in (rawValue as Record<string, unknown>)
    ) {
      const parts = splitCsv((rawValue as Record<string, string>).not_between);
      const excluded = await this.prisma.contentMeta.findMany({
        where: { projectId, collectionId, fieldName, deletedAt: null, value: { gte: parts[0], lte: parts[1] } },
        select: { contentId: true },
      });
      const excludedIds = new Set(excluded.map((r: { contentId: number }) => r.contentId));
      ids = new Set(universe.filter((id) => !excludedIds.has(id)));
    }

    return ids;
  }

  // Normalizes the incoming `where` payload into an ordered list of
  // {clause, combine} pairs. An array is the clean, recommended shape
  // (every clause AND'ed together, one distinct field per clause). An
  // object whose keys include a literal "or" is the legacy PHP-array-key
  // form (mixed numeric/'or' keys) — supported for v1-shim fidelity, where
  // a clause literally keyed 'or' combines with a union instead of an
  // intersection. New v2 callers should just use the array form.
  private normalizeWhere(where: unknown): { clause: Record<string, unknown>; combine: 'and' | 'or' }[] {
    if (Array.isArray(where)) {
      return where.map((clause) => ({ clause, combine: 'and' as const }));
    }
    if (where && typeof where === 'object') {
      const entries = Object.entries(where as Record<string, unknown>);
      const isMultiDim = entries.length > 0 && (entries[0][0] === 'or' || /^\d+$/.test(entries[0][0]));
      if (isMultiDim) {
        return entries.map(([k, v], i) => ({
          clause: v as Record<string, unknown>,
          combine: i > 0 && k === 'or' ? ('or' as const) : ('and' as const),
        }));
      }
      return [{ clause: where as Record<string, unknown>, combine: 'and' as const }];
    }
    throw new BadRequestException({ error: 'Incorrect where statement' });
  }

  private async applyWhere(
    projectId: number,
    collectionId: number,
    fieldsByName: Map<string, FieldRow>,
    universe: number[],
    where: unknown,
    columnFilters: Record<string, unknown>,
  ): Promise<number[] | null> {
    const groups = this.normalizeWhere(where);
    let result: Set<number> | null = null;

    for (const { clause, combine } of groups) {
      let groupIds: Set<number> | null = null;

      for (const [key, value] of Object.entries(clause)) {
        if (key in CONTENT_COLUMN_MAP) {
          columnFilters[CONTENT_COLUMN_MAP[key]] = this.buildColumnFilter(key, value);
          continue;
        }
        if (!fieldsByName.has(key)) {
          throw new BadRequestException({ error: `Field not found [${key}]` });
        }
        const ids = await this.resolveFieldCondition(
          projectId,
          collectionId,
          fieldsByName,
          universe,
          key,
          value,
        );
        groupIds = groupIds ? intersect(groupIds, ids) : ids;
      }

      if (groupIds === null) continue; // clause had only content-column keys
      if (result === null) result = groupIds;
      else result = combine === 'or' ? union(result, groupIds) : intersect(result, groupIds);
    }

    return result ? [...result] : null;
  }

  private async applyWhereRelation(
    projectId: number,
    collectionId: number,
    fieldsByName: Map<string, FieldRow>,
    whereRelation: Record<string, Record<string, string>>,
  ): Promise<number[]> {
    let ids: number[] | null = null;

    for (const [key, subConditions] of Object.entries(whereRelation)) {
      const mainField = fieldsByName.get(key);
      if (!mainField) throw new BadRequestException({ error: `Field not found [${key}]` });
      if (mainField.type !== 'relation') {
        throw new BadRequestException({ error: 'This field is not a relation type field.' });
      }
      const targetCollectionId = mainField.options?.relation?.collection;
      if (!targetCollectionId) throw new BadRequestException({ error: `Field not found [${key}]` });

      for (const [rKey, rValue] of Object.entries(subConditions)) {
        const relationMeta = await this.prisma.contentMeta.findFirst({
          where: {
            projectId,
            collectionId: Number(targetCollectionId),
            fieldName: rKey,
            value: { contains: rValue },
            deletedAt: null,
          },
          select: { contentId: true },
        });
        if (!relationMeta) throw new NotFoundException({ error: 'Record not found!' });

        const rows = await this.prisma.contentMeta.findMany({
          where: { projectId, collectionId, fieldName: key, deletedAt: null },
          select: { contentId: true, value: true },
        });
        const needle = String(relationMeta.contentId);
        const matching = rows
          .filter((r: ContentIdValueRow) => (r.value ?? '').split(',').includes(needle))
          .map((r: ContentIdValueRow) => r.contentId);

        ids = ids === null ? matching : ids.filter((id) => matching.includes(id));
      }
    }

    return ids ?? [];
  }

  // Field-value shaping — mirrors the legacy ContentResource exactly:
  // booleans become real true/false, numbers are cast, passwords are
  // omitted entirely, `options.hiddenInAPI` drops a field from the
  // response, media/relation fields resolve to nested objects (single vs
  // array per `options.media.type` / `options.relation.type`). Unlike the
  // legacy resource, relation resolution here is depth-limited (see
  // maxDepth) — the legacy app has no such guard and could recurse
  // unboundedly on a pair of collections that relate to each other.
  private async shapeContent(
    content: ContentRow,
    meta: ContentMetaRow[],
    fields: FieldRow[],
    includeTimestamps: boolean,
    maxDepth = 2,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { id: content.id, locale: content.locale };
    if (includeTimestamps) {
      if (content.createdAt) out.created_at = content.createdAt;
      if (content.updatedAt) out.updated_at = content.updatedAt;
    }
    if (content.publishedAt) out.published_at = content.publishedAt;

    const byName = new Map(meta.map((m) => [m.fieldName, m.value]));

    for (const field of fields) {
      if (!byName.has(field.name)) continue;
      if (field.options?.hiddenInAPI) continue;
      const value = byName.get(field.name) ?? '';

      switch (field.type) {
        case 'password':
          break; // never exposed
        case 'boolean':
          out[field.name] = value === '1' || value === 'true';
          break;
        case 'number':
          out[field.name] = value === '' ? null : Number(value);
          break;
        case 'multi_enumeration':
          out[field.name] = value ? value.split(',') : [];
          break;
        case 'media': {
          const ids = value ? value.split(',').map((s) => Number(s)) : [];
          const media = ids.length
            ? await this.prisma.media.findMany({ where: { id: { in: ids } } })
            : [];
          out[field.name] = field.options?.media?.type === 1 ? (media[0] ?? null) : media;
          break;
        }
        case 'relation': {
          const targetCollectionId = field.options?.relation?.collection;
          if (!targetCollectionId || maxDepth <= 0) {
            out[field.name] = field.options?.relation?.type === 1 ? null : [];
            break;
          }
          const ids = value ? value.split(',').map((s) => Number(s)) : [];
          const relatedFields = await this.prisma.collectionField.findMany({
            where: { collectionId: Number(targetCollectionId) },
          });
          const related = ids.length
            ? await this.prisma.content.findMany({
                where: { id: { in: ids }, publishedAt: { not: null } },
                include: { meta: { where: { deletedAt: null } } },
              })
            : [];
          const shaped = await Promise.all(
            related.map((r: ContentRow & { meta: ContentMetaRow[] }) =>
              this.shapeContent(r, r.meta, relatedFields as unknown as FieldRow[], includeTimestamps, maxDepth - 1),
            ),
          );
          out[field.name] = field.options?.relation?.type === 1 ? (shaped[0] ?? null) : shaped;
          break;
        }
        default:
          out[field.name] = value;
      }
    }

    return out;
  }

  async list(projectId: number, slug: string, options: ListOptions) {
    const collection = await this.loadCollection(projectId, slug);

    // Cache-aside: a hit skips every query below entirely (universe scan,
    // where/whereRelation resolution, the actual findMany). Keyed on the
    // full, order-normalized `options` object, so two requests are only
    // ever considered "the same query" if every filter/sort/paging
    // parameter actually matches -- see ReadCacheService.listKey.
    const cacheKey = ReadCacheService.listKey(projectId, collection.id, options);
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== undefined) return cached;

    const fields = collection.fields as unknown as FieldRow[];
    const fieldsByName = new Map(fields.map((f) => [f.name, f]));

    const universeRows = await this.prisma.content.findMany({
      where: { projectId, collectionId: collection.id },
      select: { id: true },
    });
    const universe = universeRows.map((r: { id: number }) => r.id);

    const columnFilters: Record<string, unknown> = {};

    let idFilter: number[] | null = null;
    if (options.where !== undefined) {
      idFilter = await this.applyWhere(projectId, collection.id, fieldsByName, universe, options.where, columnFilters);
    }

    if (options.whereRelation) {
      const relIds = await this.applyWhereRelation(projectId, collection.id, fieldsByName, options.whereRelation);
      idFilter = idFilter === null ? relIds : idFilter.filter((id) => relIds.includes(id));
    }

    // Publication state: only 'only_draft' unlocks unpublished content —
    // any other/garbage `state` value falls back to published-only, unlike
    // the legacy app, where an unrecognized `state` value accidentally
    // exposes both published and draft content. See docs/PHASE-5-NOTES.md.
    const publishedFilter =
      options.state === 'only_draft' ? { publishedAt: null } : { publishedAt: { not: null } };

    const where: Record<string, unknown> = {
      projectId,
      collectionId: collection.id,
      ...publishedFilter,
      ...columnFilters,
      ...(idFilter !== null ? { id: { in: idFilter } } : {}),
    };

    if (options.count) {
      const total = await this.prisma.content.count({ where });
      await this.cache.set(cacheKey, total);
      return total;
    }

    if (options.offset !== undefined && options.limit === undefined) {
      throw new BadRequestException({ error: 'offset must be used with limit' });
    }

    // Sort: content columns sort at the DB level; a meta-field sort key
    // loads matches and sorts in application code (same tradeoff as the
    // admin Content list's "sbm" mode — see docs/PHASE-4-NOTES.md).
    let orderBy: { column: string; direction: 'asc' | 'desc' }[] = [];
    let metaSort: { field: string; direction: 'asc' | 'desc' } | null = null;
    if (options.sort) {
      for (const part of options.sort.split(',')) {
        const [field, dir] = part.split(':');
        if (!field || !dir) throw new BadRequestException({ error: 'Incorrect sort statement' });
        const direction = dir.toLowerCase() === 'desc' ? 'desc' : 'asc';
        if (field in CONTENT_COLUMN_MAP) {
          orderBy.push({ column: CONTENT_COLUMN_MAP[field], direction });
        } else {
          metaSort = { field, direction }; // only the first meta sort key is honored
        }
      }
    }

    let rows: (ContentRow & { meta: ContentMetaRow[] })[];

    if (metaSort) {
      const all = await this.prisma.content.findMany({
        where,
        include: { meta: { where: { deletedAt: null } } },
      });
      const field = metaSort.field;
      const dir = metaSort.direction;
      all.sort((a: any, b: any) => {
        const av = a.meta.find((m: ContentMetaRow) => m.fieldName === field)?.value ?? '';
        const bv = b.meta.find((m: ContentMetaRow) => m.fieldName === field)?.value ?? '';
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      const offset = options.offset ?? 0;
      rows = options.limit !== undefined ? all.slice(offset, offset + options.limit) : all.slice(offset);
    } else {
      rows = await this.prisma.content.findMany({
        where,
        include: { meta: { where: { deletedAt: null } } },
        orderBy: orderBy.length ? orderBy.map((o) => ({ [o.column]: o.direction })) : undefined,
        skip: options.offset,
        take: options.limit,
      });
    }

    const shaped = await Promise.all(
      rows.map((r) => this.shapeContent(r, r.meta, fields, !!options.timestamps)),
    );

    if (options.first) {
      // A miss (nothing matched) is NOT cached -- newly published content
      // matching an existing `first` query should show up as soon as it
      // exists, not wait out the TTL of a previously-cached "not found".
      if (!shaped.length) throw new NotFoundException({ error: 'Not found!' });
      await this.cache.set(cacheKey, shaped[0]);
      return shaped[0];
    }
    await this.cache.set(cacheKey, shaped);
    return shaped;
  }

  async getById(projectId: number, slug: string, id: number, timestamps: boolean) {
    const collection = await this.loadCollection(projectId, slug);

    const cacheKey = ReadCacheService.byIdKey(projectId, collection.id, id, timestamps);
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== undefined) return cached;

    const fields = collection.fields as unknown as FieldRow[];

    const content = await this.prisma.content.findFirst({
      where: { id, projectId, collectionId: collection.id, publishedAt: { not: null } },
      include: { meta: { where: { deletedAt: null } } },
    });
    if (!content) throw new NotFoundException({ error: 'Not found!' });

    const shaped = await this.shapeContent(content, content.meta, fields, timestamps);
    await this.cache.set(cacheKey, shaped);
    return shaped;
  }
}
