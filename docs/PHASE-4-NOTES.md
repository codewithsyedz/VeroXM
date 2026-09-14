# Phase 4 — Content CRUD (the EAV engine)

What's built, the legacy parity decisions worth knowing, the deliberate deviations, and what's left for later. This is the phase the roadmap flagged as the most complex remaining piece — it's what actually ties the schema built in Phase 3 to real content records.

## What's built

- **NestJS (`apps/api`)**: a `ContentModule` (`/projects/:projectId/collections/:collectionId/content`) — list (search, status filter, sort, pagination), create, show, update, publish, unpublish, trash (soft-delete), restore, and permanent delete. All behind `JwtAuthGuard`.
- **Next.js (`apps/web`)**: a Content list screen per collection (status tabs — All/Published/Draft/Trashed — with counts, search, pagination, and row actions), a New content form, and an Edit content form. Both forms render one input per collection field, adapted to all 11 field types.
- **A retroactive extension to Phase 3's field editor.** The legacy Content validation reads `validations.required` and `validations.unique` off each field, alongside `validations.charcount` — but Phase 3's field editor only ever exposed charcount. Without a way to *set* required/unique on a field, Phase 4's validation logic would have nothing to enforce. `FieldsEditor.tsx` (Phase 3) now has required/unique toggles with optional custom messages, alongside charcount, matching the full validations shape the legacy Content controllers actually read.

## The EAV read/write model, and why it's shaped this way

Each `content` row is just the record's metadata (project, collection, locale, who created/published it, soft-delete state) — the actual field values live in `content_meta`, one row per non-empty field, keyed by `field_name`. Reading a content record means joining its meta rows back onto the collection's field list by name; writing means diffing submitted field values against existing meta rows. This is exactly the legacy shape (see `ContentController::store/update` in the legacy app) — deliberately not normalized into a wider table, since collections and fields are user-defined at runtime and this schema has to hold whatever shape a project's admin invents.

Two per-field-type behaviors are ported byte-for-byte from the legacy controllers because they're genuinely surprising if you don't know them going in:

- **A field only gets a meta row if its value is "non-empty".** On create, an omitted or blank field simply has no `content_meta` row — not a row holding `''`. This mirrors PHP's `empty()` check in the legacy `store()`, and it's the reason a boolean field set to `false` is indistinguishable, in storage, from a boolean field that was never touched. It's a real quirk in the schema this migration inherited, not something introduced here.
- **Update behaves differently from create for the same field.** If a meta row already exists, updating it always writes the new value (even blank) rather than deleting the row. Only a genuinely new field/value pair needs to be non-empty to get created. This asymmetry is exactly what the legacy `update()` does — flagging it because it reads like a bug on first glance and isn't one.

Per-type value encoding also matches the legacy transforms: `password` fields are bcrypt-hashed (via `bcryptjs`, newly added to `apps/api`'s dependencies) and a blank value on update keeps the existing hash rather than re-hashing an empty string; `media` and `relation` fields store a comma-joined list of ids; `json` fields are `JSON.stringify`'d on the way in and parsed back on the way out. Password values are never sent back to the client on read — the edit form always shows a blank password field, matching the legacy edit screen's "leave blank to keep it" convention.

## Validation

Ported from `ContentController::store/update`: `required` (with an optional custom message), an implicit email-format check for `email` fields, an implicit numeric check for `number` fields, the `charcount` Between/Min/Max cross-check (now dependent on the Phase 3 extension above), and a `unique` check against other `content_meta` rows for the same field in the same collection. One deliberate consolidation: the legacy app returns these as **two separate** 422 responses — a Laravel `Validator` pass first, then a second manual pass just for uniqueness. Both are merged into a single `{message, errors}` response here, which is a simpler contract for the frontend and doesn't change what gets validated, just how many round trips reporting it takes.

## Listing: search, status, sort, pagination

Status tabs (All/Published/Draft/Trashed) and their counts match the legacy `index()` exactly: "All/Published/Draft" all mean **not soft-deleted**, and "Trashed" means the opposite — soft-deleted rows are otherwise invisible everywhere else. Search matches against any `content_meta.value` in the collection, same as the legacy `LIKE` scan. Sorting by a direct content column (`createdAt`, `updatedAt`, `publishedAt`, `id`) is done at the database level with proper `skip`/`take` pagination. Sorting by a *field's* value (the legacy app's `sbm` "sort by meta" mode) is supported, but — unlike the column-sort path — it loads every matching row and sorts in application code, because ordering by a dynamic field's value isn't a plain column sort Prisma can express directly. That's fine at admin-UI row counts; it won't scale to a very large collection the way the legacy app's DB-level subquery order did, and is worth revisiting with a raw query if that becomes a real bottleneck.

**Not ported:** sorting by `created_by`/`updated_by`/`published_by`'s resolved user email via a join subquery — the legacy app supports this, this phase only resolves those ids to `{id, email}` for *display*, not as a sort key.

## Deliberately not in this phase

- **Bulk actions.** The legacy app has `getSelectedRecords`, `getSelectedFiles`, `publishSelected`, `unPublishSelected`, `moveToTrashSelected`, `deleteSelected`, and `restoreSelected` — all multi-select operations over a `selected: number[]` list. None of these are ported; every action here is single-item, consistent with Phase 2's "bulk delete deferred" precedent. The single-item equivalents (`publish`, `unpublish`, `trash`, `restore`, `remove` — one content id each) cover the same ground one row at a time.
- **A single-item `restore` endpoint** doesn't exist in the legacy app at all (only `restoreSelected`, bulk-only) — added here anyway for UI symmetry with `trash()`, since a Trashed tab with no way to un-trash one row would be a dead end. Flagging it as an addition, not a port.
- **`remove()` (permanent delete) works on trashed content, not just active content.** The legacy single `delete()` only operates on non-trashed rows (its query has no `withTrashed()`); only the bulk `deleteSelected` can permanently delete something already in the trash. Since bulk actions aren't ported, the single `remove()` here intentionally allows deleting from the Trashed tab too — otherwise trashed content could never be purged one at a time. A deliberate behavior change, not an oversight.
- **A real media/relation picker.** Both field types render as a plain comma-separated id input for now, with a hint pointing at the Media Library. Building an actual picker modal (search + thumbnail grid for media, search + preview for relation targets) is real UI work saved for a follow-up pass rather than folded into an already-large phase.
- **Rich text editing.** `richtext` fields render as a plain `<textarea>`, not a WYSIWYG editor — the legacy Vue admin's actual rich-text widget wasn't visible from the controllers audited for this phase, so a plain textarea is the honest placeholder rather than a guess at parity.
- **Aperture visual design** — same standing note as every phase so far: still plain Tailwind defaults, not yet the design system in `docs/ART-DIRECTION.md`.

## The recurring caveats, still true

- **Per-project role authorization** is now four modules deep with the same gap (Media, Collections, Fields, Content) — `JwtAuthGuard` only checks "is this a valid logged-in user," not the legacy's `super_admin`/`admin{project_id}`/`editor{project_id}` role check. This is the single most important thing to close before any of this replaces the Laravel admin for a team with more than one project.
- **The Prisma-stub situation** from `docs/PHASE-2-NOTES.md` is still true — `ContentService` avoids importing Prisma-generated model types for the same reason `MediaService` and `CollectionsService` do. Re-run `nest build` and `npx tsc --noEmit` in `apps/web` once `npm run db:generate` succeeds with real network access.

## Build verification

Both `apps/api` (`npx nest build`) and `apps/web` (`npx tsc --noEmit`) compile cleanly with this phase's changes, including the Phase 3 `FieldsEditor.tsx` extension.

## Suggested next step

Phase 5 (Public Content API v2 + a v1 shim) is next per the roadmap — the public-facing `where[]` filter DSL that external sites actually query against. Closing the per-project role authorization gap remains the standing recommendation before any of Phases 1-4 goes near a real multi-user project, and is arguably more urgent now that real content — not just schema — is reachable through the new stack.
