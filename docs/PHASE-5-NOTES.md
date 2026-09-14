# Phase 5 — Public Content API v2 + a v1 compatibility shim

What's built, the one genuinely good find in this phase (existing API tokens keep working, unreissued), the deliberate redesigns, and what's deferred.

## What's built

- **A v1 compatibility shim** (`apps/api/src/public-api/v1`) reproducing the legacy public content API's behavior: list with the `where`/`whereRelation`/`sort`/`state`/`offset`/`limit`/`count`/`first`/`timestamps` query DSL, get-by-id, create, update, delete.
- **A redesigned v2 API** (`apps/api/src/public-api/v2`) — same underlying data and field-shaping rules, but filters travel as a JSON body to `POST .../content/search` instead of bracketed query-string params, and simple listing is a plain `GET .../content`.
- **Existing API tokens keep working, with no re-issuance.** This is the one piece of this phase worth understanding before touching anything else in it.

## Auth: reusing the legacy Sanctum tokens, not replacing them

The legacy public API authenticates via Laravel Sanctum, but not the way it's usually described — the "user" a token belongs to is a `Project` row itself (`Project` uses Sanctum's `HasApiTokens` trait), and abilities (`read`/`create`/`update`/`delete`) are checked per token. Rather than build a parallel API-key system that nobody could issue keys for yet (Phase 1 already flagged "API token management" as still Laravel-only — there's no admin screen in the new stack to mint a *new*-format key), `PublicApiAuthService` reads the **same** `personal_access_tokens` table Sanctum already writes to, and reimplements Sanctum 2.x's `PersonalAccessToken::findToken()` exactly — verified by reading the legacy app's own `vendor/laravel/sanctum` source rather than reconstructing it from memory: a token of the form `"{id}|{secret}"` is looked up by id, then the secret is checked with a constant-time SHA-256 comparison against the stored hash; a bare token with no `|` falls back to a direct hash lookup. `personal_access_tokens` is added to `packages/db/prisma/schema.prisma` as a new model, read-only from this stack's perspective.

**Practical effect:** a project's existing API token, issued from the legacy admin months ago, authenticates against both the v1 shim and the v2 API today, unchanged. Both auth guards (`LegacyTokenGuard`, `V2TokenGuard`) share this one resolution path; they differ only in what they do when it fails — the v1 guard returns a bare 404 for every auth failure (wrong token, project mismatch, missing ability), matching the legacy app's own habit exactly, since some existing integration might depend on that status code; the v2 guard uses conventional 401/403/404.

## The where[] filter DSL: what's ported, and one thing rebuilt safer

The legacy query builder for meta-field filters (`not`, `in`, `not_in`, `lt`, `lte`, `gt`, `gte`, `between`, `not_between`, `like`, plus `null`/`not_null` and relation-field containment) is ported for both single-field and multi-field ("multi-dimensional") `where` shapes. Two things worth flagging:

- **The legacy multi-dimensional mode builds a raw SQL string, with `in`/`not_in`/`between` values concatenated directly into the query** rather than bound as parameters — a real SQL-injection surface in the code being migrated away from. This phase's version resolves each field condition independently (its own parameterized Prisma query) and combines the resulting content-id sets in application code (intersect for AND, union for the legacy's `'or'`-keyed clause groups) — same observable behavior, no string-built SQL anywhere. This is the one place in this phase where "port the behavior, not the implementation" mattered most.
- **A single-clause `where` object with more than one meta-field key doesn't work correctly in the legacy app** — every key in one clause reuses the same `content_meta` table alias, so asking for two different fields to both match in one clause impossibly requires one row's `field_name` to equal two different strings at once, and silently matches nothing. This is a real, reproducible limitation in the code being replaced, not a design choice worth preserving — this phase's version resolves each key independently and intersects, so "match field A and field B" actually works. Flagging this as a deliberate improvement, not a compatibility gap, since nothing that depended on the old (broken) behavior could have been relying on it matching anything.
- **`whereRelation`** (filtering by a condition on a *related* collection's content) is ported.
- **`state`**: only `state=only_draft` unlocks unpublished content, same as the legacy app's intent — but the legacy app has a real bug here worth not reproducing: any *other* non-empty `state` value (a typo, garbage input) accidentally skips the published-only filter entirely and exposes draft content publicly, because its `else` branch only covers "no `state` param at all," not "an unrecognized one." This phase's version treats any value other than `only_draft` as "published only," closing that hole rather than preserving it, even in the v1 shim.
- **Sorting by a meta field's value** (as opposed to a content column) has the same tradeoff as the admin Content list's "sbm" mode from Phase 4 — it loads matches and sorts in application code rather than at the database level. Only the first meta sort key is honored if more than one is given (the legacy app supports chained multi-key sort across mixed column/meta keys; this version keeps the primary key only for the meta case).

## Field-value shaping, and three more field options that had nowhere to live until now

The legacy `ContentResource` (the class actually shaping every public API response) does more than the admin API's flat `data` object: it returns fields at the top level (no wrapper), casts booleans to real `true`/`false` and numbers to floats, **omits password fields entirely**, and — this is the part that mattered for this phase — resolves `media` and `relation` fields into nested objects, with three field-level options nothing before this phase had a way to set:

- `options.hiddenInAPI` — drops a field from every public API response (admin screens still show it).
- `options.media.type` — `1` means a media field resolves to a single object; anything else, an array.
- `options.relation.type` — same single-vs-array split, for relation fields, resolving to nested content objects recursively.

None of these were exposed in Phase 3's field editor, because nothing needed them until the public API had to read them. `FieldsEditor.tsx` now has toggles for all three, alongside the required/unique toggles Phase 4 added for the same reason. **One deliberate deviation:** the legacy `ContentResource` recurses into a related collection's content with no depth limit at all — two collections that relate to each other could recurse without bound. This phase's version caps relation resolution at 2 levels deep as a safety net; the legacy app doesn't have one.

## Deliberately not in this phase

- **A real API-key management screen.** Both v1 and v2 authenticate against tokens the *legacy* admin already issued — there's still no way to mint a new one from the new stack. This is the same gap Phase 1 flagged; it's more visible now that the public API actually depends on it.
- **De-duplicating Phase 4's inline copy of the field-value encode/validate logic.** This phase factored that logic out into `apps/api/src/content/content-field-codec.ts` for its own write endpoints (since the public API's create/update needs the identical required/email/number/charcount/unique validation and password/media/relation/json encoding Phase 4 already built), but Phase 4's `ContentService` still has its own inline copy rather than being refactored to import the shared one — a low-risk choice to avoid touching already-verified Phase 4 code in the same pass. Worth doing as a follow-up so the two can't drift apart.
- **Multi-key chained sort on a meta field** and the legacy's exact day-truncated `whereDate()` semantics for timestamp-column range operators are both approximated rather than reproduced exactly (see above).
- **Per-project role authorization** doesn't apply here at all — the public API was never gated by admin roles in the legacy app either, only by token abilities, which this phase does enforce. The recurring gap in every admin module (Media/Collections/Fields/Content) is unrelated to this phase and still open.

## Build verification

Both `apps/api` (`npx nest build`) and `apps/web` (`npx tsc --noEmit`, covering the `FieldsEditor.tsx` extension) compile cleanly with this phase's changes.

## Suggested next step

Phase 6 (Cutover & decommission legacy) is the last item on the original roadmap — deciding the actual traffic cutover sequence module by module using `infra/nginx.conf.sample`, verifying against a real staging database (the Prisma-stub caveat that's applied to every phase so far), and finally closing the per-project role authorization gap that's been flagged since Phase 2. Building a real API-key issuance screen in the new admin (mentioned above) is also worth doing before Phase 6, since it's the one piece of Phase 5 that still has no path forward without the legacy admin.
