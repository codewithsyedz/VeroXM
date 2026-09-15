import type { VeroXMApp } from './client.js';

export interface ListOptions {
  /** Field-value filter -- an array of `{field: value}` clauses (AND'ed together), each value either a scalar or an operator object like `{like: '...'}`, `{gte: '...'}`, `{in: 'a,b,c'}`, etc. See the project's SDK Docs tab for the full operator list. */
  where?: unknown;
  whereRelation?: Record<string, Record<string, string>>;
  /** e.g. "created_at:desc" or "title:asc,created_at:desc". */
  sort?: string;
  /** Pass "only_draft" to include unpublished entries; anything else (including omitted) returns published-only. */
  state?: 'only_draft' | string;
  offset?: number;
  limit?: number;
  /** When true, the API returns a single number (the match count) instead of a list -- see count() below for a typed shortcut. */
  count?: boolean;
  /** search() only -- returns the first match directly instead of an array (404s if there are none). */
  first?: boolean;
  /** Include created_at/updated_at in each returned entry. */
  timestamps?: boolean;
  /**
   * docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.2 -- filter to one
   * locale's entries. Omitted matches the project's default locale (and
   * any entry created before multi-locale existed, which has no locale
   * tag at all) -- not "every locale mixed together". Combine with
   * `first` (via search()) to fetch one specific logical entry's
   * translation, e.g. `search({where: {slug: 'my-post'}, first: true,
   * locale: 'ar'})` -- if no `ar` row exists for that filter, the API
   * falls back to the default locale once before 404ing, so this never
   * silently returns a translation you didn't ask for EXCEPT as an
   * explicit last resort.
   */
  locale?: string;
}

/**
 * Typed access to one content collection's entries. `T` is whatever
 * shape you expect back (the API's actual response is a plain object per
 * the collection's own fields, so this is a cast you opt into, not
 * something the SDK can verify -- see your project's SDK Docs tab for
 * that collection's real field list).
 */
export class ContentResource<T = Record<string, unknown>> {
  constructor(
    private readonly app: VeroXMApp,
    private readonly slug: string,
  ) {}

  private root(): string {
    return `/collections/${this.slug}/content`;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    return this.app.request({
      path: this.root(),
      query: {
        limit: options.limit,
        offset: options.offset,
        sort: options.sort,
        state: options.state,
        count: options.count ? '1' : undefined,
        timestamps: options.timestamps ? '1' : undefined,
        locale: options.locale,
      },
    }) as Promise<T[]>;
  }

  /** Same filters as list(), sent as a JSON body -- use this for `where`/`whereRelation`, which are awkward to express as query-string params. */
  async search(options: ListOptions): Promise<T[]> {
    return this.app.request({
      method: 'POST',
      path: `${this.root()}/search`,
      json: options,
    }) as Promise<T[]>;
  }

  /** A typed shortcut for search({...options, count: true}) -- the API returns a bare number for a counting query, not a list. */
  async count(options: Omit<ListOptions, 'count' | 'first'> = {}): Promise<number> {
    const result = await this.search({ ...options, count: true });
    return result as unknown as number;
  }

  /**
   * Only ever returns a PUBLISHED record -- the API's single-item lookup
   * has no `state` override, so a draft id 404s here even right after
   * create({draft: true}); use list({state: 'only_draft'}) to find/inspect
   * drafts instead.
   *
   * No `locale` option here (unlike list()/search()/count()) -- `id`
   * already identifies one exact row, which has exactly one locale;
   * there's no "translation of this same id" to select between. To fetch
   * a specific locale's entry, filter list()/search() by whatever field
   * identifies the logical entry (e.g. `slug`) plus `locale`, not by id.
   */
  async get(id: number, options: { timestamps?: boolean } = {}): Promise<T> {
    return this.app.request({
      path: `${this.root()}/${id}`,
      query: { timestamps: options.timestamps ? '1' : undefined },
    }) as Promise<T>;
  }

  /** Fields are sent flat (no wrapper). Pass `draft: true` to create without publishing; omit it (or pass false) to publish immediately. */
  async create(data: Record<string, unknown>): Promise<T> {
    return this.app.request({ method: 'POST', path: this.root(), json: data }) as Promise<T>;
  }

  /**
   * A partial update -- only the fields present in `data` are changed.
   * Publish state follows the same rule as create(): omitting `draft` (or
   * passing `draft: false`) PUBLISHES the record immediately, even if it
   * was previously a draft and this update doesn't touch content fields.
   * Pass `draft: true` explicitly to keep (or return) it unpublished.
   */
  async update(id: number, data: Record<string, unknown>): Promise<T> {
    return this.app.request({ method: 'PATCH', path: `${this.root()}/${id}`, json: data }) as Promise<T>;
  }

  async delete(id: number): Promise<void> {
    await this.app.request({ method: 'DELETE', path: `${this.root()}/${id}` });
  }
}
