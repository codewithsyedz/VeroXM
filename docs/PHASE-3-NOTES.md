# Phase 3 — Collections & Fields

What's built, the legacy parity decisions worth knowing before touching this code, and what's deliberately left for later.

## What's built

- **NestJS (`apps/api`)**: a `CollectionsModule` (`/projects/:projectId/collections` — list, create, show, update, delete, reorder) and a `CollectionFieldsModule` (`/projects/:projectId/collections/:collectionId/fields` — create, update, delete, reorder), both behind `JwtAuthGuard`.
- **Next.js (`apps/web`)**: a Collections screen per project (`/projects/[projectId]/collections`) — inline create/rename/delete, up/down reordering — and a Collection detail "schema builder" screen (`/projects/[projectId]/collections/[collectionId]`) for adding, editing, reordering, and deleting fields across all 11 field types, including the enumeration-options and relation-target UI and the character-count validation toggle. The Projects list now links to both Collections and Media Library per project.

## Legacy parity decisions

- **`order = id` self-assignment.** Same pattern as Media/Projects before it: a new collection or field gets `order` set to its own freshly-created `id` right after insert, so new rows land at the end without a separate `max(order)` query — mirrors the legacy `store()` methods exactly.
- **Reserved slug.** `project-media` can't be used as a collection slug, matching the legacy app's reservation of that path for a project's built-in media route. Slugs are otherwise unique per project (ignoring soft-deleted rows), enforced the same way on create and update.
- **Cascading delete.** Deleting a collection hard-deletes its fields, then force-deletes (hard-delete, not the soft `deletedAt` used elsewhere in this schema) all `content` and `content_meta` rows scoped to that collection, then deletes the collection row itself — same order and same "actually gone, not soft-deleted" behavior as the legacy `delete()`.
- **Two different reorder behaviors, on purpose, both kept.** Collections' reorder rejects the whole batch if any `id` doesn't resolve to a collection in that project (mirrors the legacy `firstOrFail` per item). Fields' reorder silently skips any `id` that doesn't resolve (mirrors the legacy loop, which has no `firstOrFail` and just moves on) — implemented here via `updateMany` scoped to `{id, collectionId, projectId}`, so a non-matching id naturally updates zero rows instead of needing a try/catch.
- **The `validations.charcount` cross-check.** Ported by hand, since this is the one piece of the legacy validation that isn't a simple "required" rule: if `status` is true, `Between` requires both `min` and `max` (with `min ≤ max`), `Min` requires `min`, `Max` requires `max`. The **behavior** matches the legacy controller; the **error message wording** is our own — the legacy messages come from Laravel's default validator strings, which weren't reproduced verbatim here. Worth a look if the frontend or a QA pass expects specific text.
- **`options.enumeration` / `options.relation.collection`.** Still required conditionally on `type`, same as the legacy app. The enumeration UI is a newline-separated textarea (one value per line, blank lines dropped) rather than trying to guess the legacy Vue UI's exact widget; the relation UI is a `<select>` populated from the project's other collections.

## One tightening beyond the legacy behavior

Field `type` is now validated against a shared whitelist (`FIELD_TYPES` in `packages/shared-types`, re-exported from `@mycms/shared-types` and used by both the NestJS validator and the Next.js type `<select>`) — `text, richtext, email, number, enumeration, boolean, date, media, relation, json, password`. The legacy controllers didn't appear to re-validate `type` against a fixed list server-side (the Vue admin UI only ever sent one of these, so it was never exercised) — this closes that gap rather than replicating an omission. Flagging it since it's a behavior change, not a straight port: a request with an unrecognized `type` now gets a 400 here where the legacy API would likely have accepted it.

## Deliberately not in this phase

- **Per-project role authorization** — the same gap flagged in `docs/PHASE-2-NOTES.md`. The legacy `CollectionsController` and `CollectionFieldsController` both require `super_admin`, or an `admin{project_id}`/`editor{project_id}` role, on every method. `JwtAuthGuard` here only checks "is this a valid logged-in user" — any authenticated user can currently manage any project's collections and fields. This is now three modules deep (Media, Collections, Fields) with the same gap; it's worth porting the Spatie roles/permissions tables into Prisma and adding a real project-scoped guard before any of this replaces the Laravel admin for a team with more than one project.
- **Drag-and-drop reordering.** Both the Collections and Fields screens use simple up/down buttons rather than a drag library — a deliberate dependency-free choice for this pass, not a limitation of the API (the reorder endpoints accept an arbitrary `{id, order}[]`, so a future drag-and-drop UI is a frontend-only change).
- **Validation rule types beyond `charcount`.** The legacy controllers, as read, only had a manual cross-check for `validations.charcount` — if there are other validation shapes elsewhere in the legacy admin UI that weren't visible from the two controllers audited for this phase, they aren't modeled here yet.
- **Aperture visual design** — same as Phases 1 and 2, these screens are plain Tailwind defaults, not yet the cinematic-luxury design system in `docs/ART-DIRECTION.md`. Still an explicit, standing offer whenever you want that folded in.

## The recurring caveat, still true

Same Prisma-stub situation described in `docs/PHASE-2-NOTES.md`: `prisma generate` hasn't completed in this environment, so these services are syntax-checked but not type-checked against the real schema. `CollectionsService` and `CollectionFieldsService` don't import Prisma-generated model types for the same reason `MediaService` doesn't — once `npm run db:generate` succeeds with real network access, re-run `nest build` and `npx tsc --noEmit` in `apps/web` once more.

## Build verification

Both `apps/api` (`npx nest build`) and `apps/web` (`npx tsc --noEmit`) compile cleanly with this phase's changes.

## Suggested next step

Phase 4 (Content CRUD — the EAV engine tying `Content`/`ContentMeta` to the collections and fields built here) is the next module per the roadmap. Closing the per-project role authorization gap is worth doing before or alongside it, since Phase 4 will be the first place actual content data — not just schema — is exposed through the new stack.
