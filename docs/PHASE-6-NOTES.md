# Phase 6 — Cutover & Decommission Legacy

This phase is different in kind from Phases 1-5. Those were modules to build; this one is an operational runbook — the actual traffic switch happens on your infrastructure, over a real burn-in window, against real production data none of this session ever had access to. What follows is split into what got built here (closing the last open code gap) and the runbook for what you do next.

## What's built: the per-project role authorization gap, finally closed

Every phase since Phase 2 flagged the same thing: `JwtAuthGuard` only checks "is this a valid logged-in user," not which projects they're allowed to touch. That's closed now.

**The role model**, read from the legacy app's own `User.php`, `ProjectsController.php`, and its Spatie `laravel-permission` usage across every controller:

- A global `super_admin` role — can do anything, anywhere.
- One `admin{project_id}` role and one `editor{project_id}` role auto-created per project (see `ProjectsController::store`). `admin{project_id}` can manage schema (Collections/Fields), content, media, and the project itself; `editor{project_id}` can manage content and media but **not** schema or the project's own settings. This distinction is real and was verified by grepping every controller's authorization check, not assumed — `CollectionsController` and `CollectionFieldsController` require `admin{project_id}` specifically (no `editor` fallback) on every method, while `ContentController` and `MediaLibraryController` accept either. `ProjectsController::delete` requires `super_admin` specifically — not even a project's own admin can delete it.
- `ProjectsController::index` (the project list) filters to only projects the caller holds a role in, unless they're `super_admin` — this was a real, live gap: `ProjectsService.findAll()` returned every project to any authenticated user until this phase.

**How it's ported:** `apps/api/src/authz/` adds a `RolesService` (reads Spatie's existing `roles` and `model_has_roles` tables — added to `packages/db/prisma/schema.prisma` as read-only models, same pattern as Phase 5's `PersonalAccessToken`) and a `ProjectRoleGuard` + `@RequireProjectRole('editor' | 'admin' | 'super_admin')` decorator. It's applied to every route in `MediaController` (editor), `CollectionsController` (admin), `CollectionFieldsController` (admin), `ContentController` (editor), and `ProjectsController.findOne` (editor) — closing the gap in all five admin modules at once. `ProjectsController.findAll` isn't gated by the guard (there's no single project to scope a list-of-projects to); instead `ProjectsService.findAll()` filters its own result set, matching the legacy `index()` exactly.

**What's still Laravel-only, on purpose:** this only *enforces* roles that already exist — it doesn't add a way to *create* a project, or to *assign* a user to `admin{project_id}`/`editor{project_id}` from the new stack. That whole surface (project creation, user invitation, role assignment) was flagged as out of scope back in Phase 1 ("API token management... still Laravel-only for now") and stays that way; building it is real, separate admin-UI work, not a cutover blocker, since the legacy admin can keep doing it until decommissioned.

## The cutover runbook

### Before touching any traffic routing

This list consolidates every caveat flagged across Phases 1-5 into one pre-flight checklist — several of these were explicitly impossible to verify from this session (no live database connection, no real production traffic), so they're genuinely still open, not just formalities:

1. **Generate real Prisma types.** `prisma generate` never completed in this session's environment (`binaries.prisma.sh` was unreachable) — every Prisma-touching service was syntax-checked, never type-checked against the real schema. Run `npm run db:generate` from a machine with normal network access, pointed at a **staging copy** of the production database, then re-run `npx nest build` and `npx tsc --noEmit` in `apps/web` once more. This is the single most important item on this list — everything else assumes this has happened.
2. **Verify password compatibility** against a handful of real accounts (not just the schema-level assumption from Phase 1) — log in through the new stack's `/login` with existing users' current passwords.
3. **Verify the API token compatibility claim** from Phase 5 end-to-end: take one project's real, already-issued API token and confirm it authenticates identically against both the legacy `/api/{uuid}/{slug}` endpoint and this stack's `/public/v1/{uuid}/{slug}` (and `/public/v2/...`) — this was implemented against Sanctum's source code, not tested against a live token, since no live database was available here.
4. **Verify the role authorization port** (this phase) the same way: pick a real user with an `editor{project_id}` role and confirm they can manage content but get a 403 attempting a schema change; pick a `super_admin` and confirm unrestricted access; confirm `ProjectsService.findAll()` returns the right subset for a non-admin user.
5. **Media URL compatibility.** Confirm existing content's stored `media`/`relation` field values and rich-text bodies referencing `https://cms.node2cloud.com/uploads/...` still resolve — the new stack's `LocalStorageProvider.urlFor()` was built to point at the same URL shape (Phase 2), but this needs a real check against real stored content, not just the code path.
6. **Pull the list of active API tokens and, where possible, their owners** (Phase 0's open question #2) — this scopes how long the v1 shim needs to stay up, and tells you who to warn before flipping `/api/` over.
7. **Confirm actual collection/content row counts in production** before finalizing whether the v2 API's endpoints need enforced pagination — Phase 5 built pagination support but didn't change any default behavior, per the migration plan's flagged risk about silently breaking a "fetch everything" caller.
8. **Replay real `where[]` query patterns from access logs** against both the legacy endpoint and the v1 shim. This matters more than usual here: Phase 5 deliberately did **not** reproduce two things found in the legacy code — a single `where` clause with more than one meta-field key silently matched nothing (a bug, fixed here to actually work), and an unrecognized `state` value accidentally exposed draft content (a bug, fixed here to stay safe). If some existing integration is unknowingly depending on either of those exact behaviors, this is where that would surface — before real traffic moves, not after.
9. **Fill in real environment values** across `packages/db/.env`, `apps/api/.env`, `apps/web/.env` for staging, then production. `API_JWT_SECRET` must be identical between `apps/api` and `apps/web`; `NEXTAUTH_SECRET` only needs to be in `apps/web`.

### Cutover sequence

`infra/nginx.conf.sample` has one commented-out `location` block per module — uncomment them in this order, reloading nginx after each and watching for a burn-in period before the next:

1. **Admin screens** (`location /projects/`) — Phases 1-4's work: auth, projects, media, collections/fields, content. Recommend enabling for internal/test accounts first (a path prefix or a feature-flagged cookie check in front of this location block, removed once confidence is high) before all admin users move over. **Uncomment the `location /api/auth/` block in the same step, not later** — NextAuth mounts its own session/signin/callback endpoints under `/api/auth/*` inside the Next.js app itself, and without this the admin login breaks immediately (its own requests either fall through to Laravel, which has no such route, or — once step 2 below is live — get swallowed by the NestJS v1 shim instead). This was found by actually running the stack end-to-end for the first time via `docker/nginx/gateway.conf` (see `docs/DOCKER-DEV-SETUP.md`), not by code review — worth remembering as a reason to actually rehearse each cutover step against a real gateway before doing it for real.
2. **Public API v1** (`location /api/` with the `rewrite ^/api/(.*)$ /public/v1/$1 break;` shown in the sample) — this is the highest-risk single step per the original migration plan (the EAV `where[]` DSL is "the single most complex piece of logic in the codebase"). Don't take this step until checklist items 6 and 8 above are done.
3. **Public API v2** (`location /public/v2/`) — this is additive (a new contract, not replacing traffic), so it can go live any time after Phase 5's build was verified; it doesn't need to wait for the v1 cutover.
4. **Everything else** (the `location /` default) — once every prior block is live and stable, there's nothing left on Laravel to route around; this default block becomes dead weight rather than a live fallback.

At each step, the rollback is just commenting the location block back out and reloading nginx — nothing to undo on the data side, since **both stacks have been reading and writing the exact same MySQL database this entire migration** (that's the point of matching the legacy schema exactly in `packages/db/prisma/schema.prisma` from Phase 0 onward). Cutover here is a routing change, not a data migration.

### Burn-in and decommission

The original migration plan's exit criterion for this phase: **the new stack runs as the sole system for 2-4 weeks with no P1 incidents** before Laravel is touched. During that window, watch for:

- Any request still reaching `legacy_laravel` in nginx's access log after the final cutover step — that's a missed consumer or an un-migrated path, not noise.
- 401/403/404 rates on the admin API and both public API versions — a spike right after cutover most likely means an auth or role-mapping edge case this session couldn't test against real data (see checklist items 3-4).
- Response times on Content list/read endpoints specifically — the EAV joins are the most expensive queries in the system per the original risk assessment, and this is where a production-scale collection would first show it.

**Decommissioning Laravel means archiving it, not deleting it** — keep the codebase (a tag or a separate read-only branch/repo) and keep it deployable for a rollback window even after traffic has fully moved, per the original plan's exit criterion. The database stays exactly where it is; it was never Laravel's alone to begin with once this migration started.

## What this phase deliberately doesn't do

- **It doesn't touch any of your actual infrastructure.** No traffic was rerouted, no environment was verified against production, no burn-in period ran — this document is the plan you execute, not a report that it happened.
- **It doesn't build a project-creation or user/role-management UI.** Flagged above — still Laravel-only, and that's fine until the legacy admin is actually decommissioned.
- **It doesn't add automated contract/parity tests** for the `where[]` DSL replay mentioned in checklist item 8 — the original migration plan calls for a proper test suite here (§6, "Testing & validation strategy"); this session wrote the runbook step but not the test harness itself, which needs real access-log data to be meaningful.

## Build verification

`apps/api` (`npx nest build`) and `apps/web` (`npx tsc --noEmit`) both compile cleanly with this phase's role-authorization changes.

## Post-Phase-6 follow-up: real API token management

`projects/:projectId/tokens` (list/issue/revoke) was added after this phase closed, as a follow-on request — it's real functionality, not a restyle: `apps/api/src/api-tokens/` issues and revokes Sanctum-compatible tokens (`"{id}|{secret}"`, sha256-hex stored in `personal_access_tokens.token`) using the exact verification format `PublicApiAuthService.resolveToken()` already checks, so a token issued here works against `/public/v1/` and `/public/v2/` exactly like a legacy-issued one. Guarded the same way as Collections/Fields (`admin` project-role tier — issuing a key is a project-settings action, not something editors do).

The frontend "Access" page (`apps/web/.../projects/[projectId]/access/`) shows the project's UUID and public-API endpoint, and lets an admin issue/revoke real keys — the plaintext token is only ever shown once, at issuance, matching how Sanctum itself behaves and how the reference design's own "Access" screen worked. The reference screenshot this was built from also showed "Locales" and "People" tabs; those were deliberately left out since there's no real backend for either yet (still Laravel-only, same as project creation/user assignment above) — building a placeholder tab for either would have been exactly the kind of faked functionality this migration has been avoiding throughout.

## Post-Phase-6 follow-up: the Projects, Content model and Content screens

Built from three screenshots of the design reference, in one pass, with the same rule the Access page followed: build what's real, leave out what isn't.

**New backend, all of it small and additive.** `ProjectsService.findAll` now returns each project's real collection and entry counts and its `updated_at`; `CollectionsService.findAllForProject` does the same for field and entry counts, and `findOne` adds an entry count. These are explicit grouped counts rather than Prisma's `_count` relation filter, because the relation-filtered form quietly includes soft-deleted rows unless the preview feature is enabled — the `groupBy` says plainly what it excludes. `ContentService.listForProject` and `GET /projects/:projectId/content` are genuinely new: the admin API has always been scoped per-collection (the legacy app has no project-wide entry list), and the Content screen shows one stream across every collection. It reuses list()'s search/status/pagination semantics so the two views can't drift apart.

**A section nav that fills a real gap.** The five-card band (Projects / Content model / Content / Media / Access) is the reference's, plus a Media card it didn't have — Media is a real screen here, and before this there was no way to move between a project's screens without going back out to the projects list. It renders only inside a project, since three of the five cards need a `projectId` to point anywhere.

**What was deliberately left out**, and why — worth keeping straight, because each of these looks like a missing feature rather than a decision:

- **The Live / Staging / Enterprise pills.** There is no status column on `projects`. Adding one is possible but it's a migration on a table Laravel also writes to, during a parallel run — a decision to take on its own, not a side effect of a restyle.
- **The "Schema v3.4" badge.** There's no schema versioning in this system at all. The Generated contract block underneath it is real — it's a projection of the collection's actual field definitions, regenerated on every render, and it excludes fields flagged `hiddenInAPI` exactly as the public API excludes them.
- **A "Create project" button.** Project creation is still Laravel-only (see `ProjectsController`), so the button would have had nothing behind it.
- **The reference's footer links** ("Design notes", "Principles", "Workspace status: normal") — two were pages of that prototype, the third a hardcoded label.

**One thing that reads as a shortcut but isn't:** the bulk actions on the Content screen genuinely issue one request per entry, in order, because there's no bulk endpoint. The UI says so, and the action returns a succeeded/failed count rather than throwing on the first error, so a partial failure is visible instead of silent. If bulk publishing ever needs to be atomic, that's a real endpoint to build, not a frontend fix.

The entry editor (`ContentForm`) and the Media screen were restyled in the same pass. Neither was in the mocks, but the new nav puts both one click away, and leaving them on the old light theme would have made the dashboard look half-finished.

### On the palette

The reference screenshots these were built from are the blue variant of that prototype's brand theme; what's implemented here is the green one ported in the previous pass. Every colour lives in the `.dashboard-theme` custom properties at the top of `apps/web/src/app/globals.css` — swapping the palette is editing that one block, not the components.

## Bugfix: the API token silently expired mid-session

`apps/web/src/lib/auth.ts`'s `jwt` callback only signed the short-lived (15-minute) token it hands to the NestJS API inside `if (user)` — which only runs once, at the moment of sign-in. The outer NextAuth session lasts far longer than that, so the app kept showing you as logged in while every server-side API call quietly started failing with a real `401` the moment that inner token passed 15 minutes old (surfaced during this session's own testing, after a stretch of Docker restart troubleshooting left a browser tab open well past that window).

Fixed by re-signing the API token on every invocation of the callback (not just at sign-in), keyed off `token.userId`/`token.email` rather than the `user` object — those two fields persist in the session for as long as the outer session does, so a fresh 15-minute token gets minted on every server-rendered page load and server action for the entire life of the session, with no re-login needed. If you hit `Projects API responded 401` (or the equivalent on any other page) after this fix, it means something else is wrong — not this.

## Header layout, take two: the section band moved back out

The four-card Model/Content/Access band was briefly folded into the sticky TopNav (see the entry above this one), then moved back out on request — it now renders inside each project's own pages instead, via a new `apps/web/src/app/(dashboard)/projects/[projectId]/layout.tsx` that wraps every route under a project (Model, Content, Media, Access, and the nested collection/entry-editing pages) with `ProjectNav`. It scrolls with the page rather than sitting permanently in the header, and — because it's a Next.js layout keyed to the `[projectId]` segment — it doesn't need to touch each page individually, and it naturally never renders on `/projects` (a sibling route, not a child of this layout). TopNav went back to identity-bar-only: logo, the one truly global "Projects" link, and account controls.

## Post-Phase-6 follow-up: real Create Project, and real Live/Staging

The previous entry listed both of these as deliberately left out ("still Laravel-only", "no status column"); this follow-up builds them for real, on your explicit request, with three decisions confirmed with you first since both touch things no prior phase had:

**Create project — `POST /projects`.** Ports the legacy `store()` faithfully: the same `name` validation (required, max 255, and — a real legacy quirk, not a typo here — a blacklist regex that rejects hyphens along with `#$%^&*()+=[]';,/{}|":<>?~\`), the same `default_locale` validation (required, max 255), `locales` set equal to `default_locale` at creation, and the same `admin{id}`/`editor{id}` role rows created alongside the project. Two things were confirmed with you rather than assumed:
- **Authorization.** Legacy's `store()` has no role check at all — any authenticated user can create a project today. You asked to match that rather than tighten it, so this endpoint is `JwtAuthGuard` only, no `ProjectRoleGuard` (there's no project yet to scope one to anyway). Worth knowing if you ever tighten this: legacy also never assigns the new `admin{id}` role to the creating user, so — same as legacy — a non-super-admin who creates a project can't yet manage it until someone assigns them that role from the Laravel admin (role *assignment* stays out of scope, same as every module before this one; see `RolesService`'s own comment).
- **The blog-template auto-seed.** Legacy's `store()` has an optional `type == 2` path that seeds 7 default collections (Pages, Posts, Categories, Authors, Tags, Comments, Globals) with a full set of pre-defined fields. You asked to omit this for now — `ProjectsService.create` doesn't accept a `type` at all. Straightforward to add later if you want the option back.

**Live/Staging — a genuinely new column.** Unlike everything built so far this phase (which only ever read existing columns), this is the first schema change: `projects.status` (`VARCHAR(20) NOT NULL DEFAULT 'live'`), added by hand in `packages/db/sql/0001_add_project_status.sql` rather than through `prisma migrate`, because this schema is introspected from the live database (`prisma db pull`) and Laravel owns this table too. It's additive and default-backed, so Laravel's own queries are unaffected — but **you need to apply it yourself**, this sandbox has no way to reach your database or run `prisma generate`:

```
docker compose exec db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < packages/db/sql/0001_add_project_status.sql

docker compose exec api npx prisma generate --schema=packages/db/prisma/schema.prisma
docker compose exec web npx prisma generate --schema=packages/db/prisma/schema.prisma

docker compose restart api web
```

(Corrected after hitting this live: `api` and `web` each keep their own
`node_modules` in a named Docker volume — `api_node_modules` /
`web_node_modules` in `docker-compose.yml` — separate from the host and
from each other, so `prisma generate` has to run *inside* each container,
not on the host. Running it on the host silently regenerates a client
nothing actually uses. `web` needs it too, not just `api` — `lib/auth.ts`
imports the Prisma client directly for credential lookups.)

Filtering (`GET /projects?status=live|staging`) and setting it (`PATCH /projects/:id/status`, admin-tier — the one part of this that *is* `ProjectRoleGuard`-scoped, same tier as every other schema/settings write in this codebase) are both real. The Projects screen's All/Live/Staging pills are real query-string filters, not client-side toggling, and each project card's status pill doubles as the control — clicking it flips the value through that endpoint; if you're not an admin on that project it comes back as a visible inline error rather than silently doing nothing.

**Frontend:** `CreateProjectPanel` (an inline expanding form, matching the same pattern `FieldsEditor` uses rather than a modal) and `ProjectStatusBadge` (the toggleable pill) both live in `apps/web/src/app/(dashboard)/projects/`, alongside a new `actions.ts` for the two server actions (`createProject`, `setProjectStatus`).

**A sandbox limitation worth flagging:** this environment has no network access and can't run `prisma generate` or reach your MySQL container, so `apps/api`'s typecheck here still shows the same pre-existing `Prisma.InputJsonValue`/`TransactionClient` staleness this sandbox's checked-in Prisma client already had (unrelated to this change) — `oxlint` is clean, and `apps/web`'s `tsc --noEmit` and `eslint` are both clean. Once you run the three commands above on your machine, `apps/api`'s typecheck should be clean too; let me know if it isn't.

## Add Field: a real type-picker modal

`FieldsEditor.tsx`'s "Add field" button now opens a type-picker modal (`AddFieldTypeModal`) before the existing inline form, matching the reference design's "Select a field type to add" step. It lists all 11 field types this stack fully supports end to end — storage, validation, and content-form rendering — reusing the same `TYPE_LABELS`/`typeLabel()` this screen already had (so `richtext` already read as "Long Text" here before this change) plus a new `TYPE_DESCRIPTIONS` map, both now shared from `@/lib/fields` alongside `TYPE_ICONS` (moved there from this file so the picker and the field-list rows can't drift).

Left out, deliberately, not by oversight:

- **`time`** — a real legacy field type (`openNewFieldModal('time')` in the old Vue admin) that was never ported into `@mycms/shared-types`' `FIELD_TYPES` registry at any earlier phase. The `collection_fields.type` column is a plain unconstrained `varchar(60)`, so adding it needs no schema change — just the type registry, validation, and a time-picker in the content-entry form.
- **plain `longtext`** — legacy actually has two distinct multi-line text types: `longtext` (a plain textarea) and `richtext` (the WYSIWYG editor this stack already has and labels "Long Text"). The reference design's "Long Text" card ("multi line text like descriptions") reads as the former; this stack only has the latter.
- **`slug`** — a real legacy type (auto-derived URL field, readonly-capable) not shown in the reference screenshot but also not yet ported.
- **"Color" and "Multi Enumeration"** — these appear in some design references but have never existed anywhere, legacy or here. Building either means designing new storage/rendering from scratch, not porting something real.

All four are real, scoped follow-ups if you want them — none are in this pass. `apps/web`'s `tsc --noEmit` and `eslint` are both clean with this change.

## Create Project became a real modal, plus a real Edit Project (Project Settings) modal

Following up on the two design references you shared: Create Project moved from the inline expanding panel to an actual modal dialog (`CreateProjectPanel.tsx`, styled like `AddFieldTypeModal`), and there's now a real Edit Project / "Project Settings" modal (`EditProjectModal.tsx`) opened from a pencil icon next to each project's status badge.

**Slug is new** — `projects.slug` (`packages/db/sql/0002_add_project_slug.sql`), nullable so existing projects aren't forced to backfill one. It has no legacy equivalent at all; this stack invented it, reusing the exact `slugify()` + "touched" pattern `CollectionsList.tsx` already uses for collection slugs (auto-fills from the name, stops auto-filling the moment you edit it directly). `ProjectsService.create` validates its shape (lowercase, hyphenated) and uniqueness. It's set once at creation and **immutable after** — `ProjectsService.update` doesn't accept it at all, matching the Project Settings reference screen's own "Slug cannot be changed."

**Tenant was left out of Create Project entirely**, per your note that it's a future feature — no placeholder, no disabled dropdown, nothing. Same reasoning throughout this migration: don't build chrome for a feature that doesn't exist yet.

**"Environment" in the Edit modal is Live/Staging**, not a new concept — same `status` column from the earlier Live/Staging pass, just relabeled to match this reference's wording. Worth flagging: that reference screenshot's own dropdown showed "Development" as a value, which isn't one of the two this stack actually stores (`live`/`staging`). Only real, stored values are offered here; if you want a third environment tier, that's worth its own decision rather than adding a value nothing backs.

**"API Key" in the reference became a "Manage API tokens" link to the project's Access page instead of a field.** The reference shows a single fixed, always-visible key — this stack's real access-token model (built earlier this phase, `apps/api/src/api-tokens/`) is different on purpose: multiple named, revocable tokens, each shown in plaintext only once at issuance. Faking a single persistent key here would have meant either exposing a secret that shouldn't be redisplayed or inventing a value with nothing behind it — so this links to the real thing instead of imitating a shape that doesn't match how tokens actually work in this system.

**Consolidated one endpoint.** The previous `PATCH /projects/:id/status` is gone — folded into a general `PATCH /projects/:id` (admin-tier) that accepts `name`, `description`, and/or `status`. `ProjectStatusBadge`'s toggle and the new Edit modal both go through it now; nothing else referenced the old route.

Both `apps/web`'s `tsc --noEmit`/`eslint` and `apps/api`'s `oxlint` are clean. `apps/api`'s full `tsc --noEmit` still can't pick up `slug` in this sandbox (same pre-existing stale-Prisma-client limitation as the `status` column before it — no network here to run `prisma generate`). You'll need one more round of the by-hand steps before this works on your machine:

```
docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < packages/db/sql/0002_add_project_slug.sql

docker compose exec api npx prisma generate --schema=packages/db/prisma/schema.prisma
docker compose exec web npx prisma generate --schema=packages/db/prisma/schema.prisma

docker compose restart api web
```

## Project Templates

The Projects screen now has two tabs — "My Projects" (the existing screen, unchanged) and "Templates" (`?tab=templates`) — with 18 starter templates (`templates-data.ts`) matching the reference gallery you shared: 3 featured (Blog Platform, E-Commerce Store, Real Estate Platform) plus 15 more spanning Healthcare, Education, Events, HR, Productivity, Social, Booking, a second E-Commerce variant (Multi-Vendor Marketplace), SaaS, Finance, Legal, Personal, Documentation, Media, and Food & Beverage.

**What "Use Template" actually does, and the deliberate limit on it:** it creates a real project, then creates exactly the collections listed under each template's "Includes" — real `Collection` rows, empty, no fields. It does not invent field-level schemas (what fields would "Legal Case Management → Court Dates" have? there's no source of truth for that), so using a template gets you to the same starting point as creating each collection by hand, just batched into one step. The one case with a real legacy precedent here is the original blog-template auto-seed (`ProjectsController::store()`'s `type == 2` path, 7 collections with fully fleshed-out fields) — that was already left un-ported earlier in this phase, and this feature deliberately doesn't reach for that same depth for any of the 18 either, to stay honest about what's actually being generated versus promised by a card.

**A real gap this surfaced and fixed:** legacy's `store()` creates a project's `admin{id}`/`editor{id}` roles but never assigns either to the creating user — previously ported faithfully as-is. Wiring up "Use Template" (create project → immediately create collections in it) exposed that as more than a faithful-but-harmless quirk: a non-super-admin using a template would have the collection-creation step 403 immediately, since they'd hold no role on the project they just made. `ProjectsService.create` now assigns the new `admin{id}` role to the creating user as part of the same transaction — a deliberate deviation from legacy, made because the alternative is a template (and honestly, plain Create Project too) that's broken for anyone who isn't already a super_admin. Role assignment for anyone else remains exactly as out of scope as before.

**Project cards now also show real Slug, Project ID, Environment, and API Endpoint** (the same `{NEXTAUTH_URL}/public/v2/projects/{uuid}` shape the Access page already computes) in a small info grid — no new data, just surfacing what was already being fetched.

`apps/web`'s `tsc --noEmit`/`eslint` and `apps/api`'s `oxlint` are all clean with this change.

## Fields: two new types, a redesigned Add Field form, and a real media picker

Following up on the six Add Field reference screenshots (Text, Long Text, Relation, Enumeration, Multi Enumeration, Media, plus the JSON upload-fields modal): the Add/Edit Field form was redesigned to match, and two new field types were added end to end.

**`time` and `multi_enumeration` are now real, wired field types** — `@mycms/shared-types`' `FIELD_TYPES` gained both, so they show up automatically in the Add Field type picker (which reads straight off that array). `time` needed **zero** storage changes: `content.service.ts`'s encode/decode already fall through to the plain-string passthrough case for any type it doesn't special-case, and a time-of-day string (`"14:30"`) round-trips through that exactly like `date` or `text` do. `multi_enumeration` needed one small, real addition: `content.service.ts` now has explicit encode/decode cases for it (comma-joined string array, same storage shape `relation`/`media` already use for their ID lists — just strings instead of numbers), and `collection-fields.service.ts`'s options-required check now covers it alongside plain `enumeration`.

Worth being explicit about since it reverses something said earlier this phase: **`multi_enumeration` has no legacy precedent anywhere** — legacy's enumeration UI is a plain list of values with no "select multiple" flag, confirmed by re-reading that section of the old Vue code. An earlier pass in this phase recommended omitting it for that reason. It's built now because you asked for it directly, with a mockup, which is a different bar than "does legacy have this" — same reasoning `slug` (projects) got applied under, just flagged again here since it's the more consequential of the two decisions.

**The Add/Edit Field form itself was restructured** (`FieldsEditor.tsx`) to match the reference layout order — Label/Field Name/Description, per-type configuration, Basic Validation, Advanced Configuration, Length Validation:
- **Field Name now auto-derives from Label** (camelCase, e.g. "Publish Date" → `publishDate`), the same touched-override pattern already used for project/collection slugs elsewhere — it stops auto-following the moment you edit the Field Name box directly.
- **Basic Validation** (Required, Unique) is now a labeled card, separate from "Hide from public API" (which stayed a standalone toggle — it's an API-visibility setting, not a validation rule).
- **Advanced Configuration is new**: Placeholder Text (already real, just repositioned), plus four genuinely new settings — Help Text, Default Value, Tooltip, Admin Notes. All four live as freeform keys inside the existing `options` JSON column (`helpText`, `defaultValue`, `tooltip`, `adminNotes`), so none of this needed a migration — that column has no fixed shape already, same reasoning that let the earlier project/collection slug work skip a schema change for other freeform settings.
- **Length Validation was rebuilt as one "Validation Type" select** (No validation / Minimum / Maximum / Between) replacing the old separate enable-toggle-plus-dropdown, and **extended to `number` fields**, not just `text`/`richtext`. That extension is backed, not invented: `validateCharCount` (both `collection-fields.service.ts` and `content.service.ts`) already special-cases numbers with a magnitude check (`Number(value)` compared against min/max, instead of a string length) — the UI just wasn't exposing that gate for numbers before. It's labeled "Value Range Validation" for number fields so it doesn't say "length" about something that isn't a string.
- **Enumeration's options block (one value per line) now also drives `multi_enumeration`** — the reference mockup shows comma-separated values, but the one-per-line textarea was already built, tested, and identical in effect, so `multi_enumeration` reuses it rather than introducing a second parsing convention for the same kind of data.

**What "images... covering all advance level usecases" became for Media fields:** `ContentForm.tsx`'s media inputs went from a raw "paste comma-separated IDs" textbox to an actual picker (`MediaPickerField`) — a modal with search-as-you-type against the project's real Media Library (`GET /projects/:projectId/media`, the same endpoint the Media Library screen itself uses), thumbnail grid, and single/multiple selection honoring each field's `options.media.type`. A new `searchMedia` server action in `content/actions.ts` backs it. One honest limit: it's a single page of results per search (`MediaService.list`'s existing `PAGE_SIZE`, no picker-side pagination yet), and a selected id shows as a friendly filename + thumbnail only once it's been seen in a search result this session — otherwise (e.g. reopening an entry without having searched yet) it shows as a plain "Media #\<id\>" chip until you do. Both are real, working states, not placeholders — just a scoped-down v1 rather than a full media browser.

**Help Text, Tooltip, and Default Value are now actually read, not just stored:** `ContentForm.tsx` renders Help Text as a caption under the field's input, Tooltip as a small info icon next to the label (native `title` attribute), and Default Value seeds `data[field.name]` for any entry — new or existing — that doesn't already have a value for that key, without ever overwriting a real value (including an intentionally empty one). **Admin Notes is deliberately surfaced in `FieldsEditor.tsx`'s field list instead of the content form** — it's a note for whoever manages the schema, not something a content editor filling in an entry should see.

**Calendar/Date got no new subsystem.** `date` already renders as a native date picker and now shares the same Advanced Configuration (help text, tooltip, default value, admin notes) and Basic Validation as every other type — there was no reference call for date ranges or a custom calendar widget, so none was invented.

Verified: `apps/api`'s `oxlint` and `apps/web`'s `tsc --noEmit`/`eslint` are all clean across every file this section touched (`packages/shared-types/src/index.ts`, `apps/api/src/content/content.service.ts`, `apps/api/src/collection-fields/collection-fields.service.ts`, `apps/web/src/lib/fields.ts`, `FieldsEditor.tsx`, `ContentForm.tsx`, `content/actions.ts`, and both the new-entry and edit-entry pages that pass `projectId` into `ContentForm`).

Not in this pass, and worth calling out since they came up earlier in this phase: plain `longtext` (a non-rich textarea, distinct from `richtext`'s WYSIWYG) and `slug` (an auto-derived URL field) both have real legacy precedent but weren't part of this request, so they're still not ported.

## Relation fields: one-to-one / one-to-many, a real picker, and a codec drift bug fixed

You asked what the story is for relation fields' one-to-one vs one-to-many. Short answer: the cardinality itself was already real, built in an earlier phase — this pass gave it the same admin-UI polish the media picker just got, and fixed a genuine gap the earlier `multi_enumeration` work had left in two places it didn't touch.

**Already real, not new:** `options.relation.type` (1 = single, 2 = many — set via the Toggle in the Add/Edit Field form) already drives both storage and the public API. Storage is the same either way — a comma-joined list of related content ids in `content_meta` — but `PublicContentService.shapeContent` (`apps/api/src/public-api/public-content.service.ts`) already resolves those ids into the *actual related entries*, recursively (depth-limited to 2, so two collections that relate to each other can't recurse forever), and returns a single object (or `null`) for `type: 1` versus an array for anything else. So a "one-to-one" relation field really does behave like one in the public API response — one nested object, not a one-element array. There's no modeling of the *reverse* side, worth being explicit about: the target collection has no automatic "referenced by" field showing who points at it, since nothing asked for that and it's a meaningfully bigger feature (an implicit inverse-relation index) rather than a UI gap.

**What changed here:** `ContentForm.tsx`'s relation input went from a raw "type in the content id" textbox to `RelationPickerField` — a real search-and-select picker against the *target* collection's own entries, reusing `ContentService.list`'s existing search/pagination (the same endpoint the Content screen itself calls) via a new `searchRelationContent` action in `content/actions.ts`. It respects `single` (one-to-one fields close the picker and replace the selection on pick; one-to-many fields toggle entries in and out of a growing list) and shows each selected entry with a real label — reusing the exact "title field" convention `ContentService` already uses for its own list/summary views (a field named `title` or `name`, falling back to the first field; a collection using neither name shows `#<id>` rather than a made-up label, same rule the Content list follows). Same honest scope note as the media picker: one page of results per search, and a selected id shows its real label only once it's been seen in a search result this session.

**A real bug this surfaced and fixed:** `multi_enumeration`'s encode/decode was only added to `ContentService`'s own private methods when it was built — not to `content-field-codec.ts` (the copy the *public* API's write endpoints share) or to `PublicContentService.shapeContent`'s own separate switch (the public *read* path). That meant a `multi_enumeration` value written or read through the public API would fall through to the generic string case: encoding happened to work by accident (`Array.prototype.join` and the default `String(array)` cast both produce the same comma-joined text), but decoding didn't — a public GET would have returned the raw `"a,b,c"` string instead of `["a","b","c"]`. Both are fixed now (`content-field-codec.ts` and `public-content.service.ts`), so all three surfaces — admin API, public write response, public read response — decode it the same way.

Verified: `apps/api`'s `oxlint` and `apps/web`'s `tsc --noEmit`/`eslint` are clean across every file this section touched.

## Delete Project — a real, cascading delete, not just a legacy port

Read legacy's `ProjectsController::delete()` in full before building this, since a project delete touches almost every table this migration has models for, and legacy's own version turned out to have real gaps worth not repeating.

**What legacy actually does, precisely (from reading the models, not just the controller):** super_admin-only (not admin{id} — a stricter gate than every other project-scoped write). It hard-deletes `collection_fields` and `collections` (neither has a `SoftDeletes` trait in legacy — collections have no trash concept there at all), force-deletes `content` and `content_meta` (both DO use `SoftDeletes`, so `->forceDelete()` on the relation only reaches rows that aren't *already* trashed — any previously-trashed content is silently left behind forever), deletes the `admin{id}`/`editor{id}` `roles` rows (relying on a real `ON DELETE CASCADE` foreign key from `model_has_roles.role_id`, confirmed in the Spatie permission tables' own migration — not application code), and finally hard-deletes the `projects` row itself (`Project` has no `SoftDeletes` either). It never touches `media` or `personal_access_tokens` at all — both are left as permanently orphaned rows (and, for media, orphaned files on disk/S3 too).

**What this port does differently, and why, one at a time:**
- **The project row is soft-deleted, not hard-deleted.** `projects.deleted_at` is this stack's own addition (from the Live/Staging work earlier this phase), and every read path already filters on it being null — this uses the column that's already there rather than fighting it, and means a mistaken delete isn't unrecoverable at the database level even though there's no restore UI for it yet.
- **Collections are soft-deleted, not hard-deleted**, matching how `Collection.deletedAt` already works everywhere else in this stack (the Content Model screen, collection counts on the Projects screen) — hard-deleting them here while treating them as soft-deletable everywhere else would be an inconsistency this migration has otherwise avoided.
- **Content and content_meta are force-deleted without legacy's trashed-row blind spot** — this deletes all of it for the project, previously-trashed or not, rather than leaving already-trashed rows behind the way legacy's default-scoped `forceDelete()` does.
- **Media rows and their actual stored files are deleted** (via the same `StorageFactory`/`deleteOriginal`/`deleteThumbnail` calls `MediaService.remove()` already uses for a single file). Legacy's silence on `media` reads as an oversight, not a decision — leaving files on disk/S3 forever for a project that no longer exists isn't a behavior worth preserving.
- **The project's issued API tokens are deleted too** (`personal_access_tokens` where `tokenableType` is the Project morph type) — same reasoning as media: legacy leaves them as dead rows, this cleans them up.
- **`model_has_roles` cleanup is done explicitly**, in the same transaction, before the `roles` rows themselves are deleted — rather than assuming the real database's `ON DELETE CASCADE` foreign key still exists on this stack's own (hand-maintained, `db pull`-introspected-once-then-edited-by-hand) `ModelHasRole.role` relation. Doing it explicitly is correct regardless of whether that FK is actually present, so there's no need to verify it one way or the other.

**Authorization:** `DELETE /projects/:id` is `@RequireProjectRole('super_admin')` — this was already anticipated in `require-project-role.decorator.ts`'s own tier comment from earlier this phase ("`super_admin` — super_admin only (e.g. Project delete)"), so no guard work was needed beyond wiring the route to it.

**The UI** is a Danger Zone section in the Edit Project ("Project Settings") modal — a Delete Project button that expands into a type-the-project-name-to-confirm field before the real "Delete Permanently" button enables, matching the weight of what it does. It's shown regardless of the viewer's actual role (this screen doesn't currently know a viewer's per-project role, same reasoning `ProjectStatusBadge`'s own comment already gives for its status toggle) — a non-super-admin's attempt comes back as a plain error message inline rather than a hidden button, which is the honest outcome given the real check is server-side either way.

Verified: `apps/api`'s `oxlint` and `apps/web`'s `tsc --noEmit`/`eslint` are clean across every file this section touched (`ProjectsService`, `ProjectsController`, `MediaModule`, and the frontend's `actions.ts`/`EditProjectModal.tsx`). `apps/api`'s own full `tsc --noEmit` remains blocked by this sandbox's stale, unregeneratable Prisma client — the same pre-existing, unrelated limitation flagged since Phase 2, not something new from this change.

## Content Model screen: clone/fork, dependencies, versions/comparison, blueprints, conditional logic, field groups, filters, visual preview, validation, documentation

The request was "cover all use-cases and features" for the content-model detail screen, against three reference screenshots (a header with badges/action icons, a 14-tab strip, a "Configure Conditional Logic" modal, and a "Versions" tab). Two things were agreed with you up front, by explicit choice rather than assumption: Analytics, Performance, Migration, AI Insights, Auto-Optimize, and Health are **skipped entirely** — nothing in this stack could back them with real data, and building fake placeholders for them would be worse than not having the tabs — while Field Groups, Filters, Clone/Fork (collection- and field-level), Conditional Logic, Dependencies, Documentation, Versions + Comparison, and Validation are **built in full, for real**. Visual Preview and Blueprints weren't named explicitly in your answer but were reasoned as implied by "all use-cases" and built too.

None of this has legacy precedent — this whole feature area is new to this stack, not a port.

### Schema

Two new migrations (`packages/db/sql/0003_add_collection_description_options.sql`, `0004_create_collection_versions.sql`) — run these by hand against the database, then `prisma generate` inside both the `api` and `web` containers, then restart both, same sequence as every prior schema change this phase:
- `collections.description` (text) and `collections.options` (JSON) — description is the header's free-text blurb; options is a freeform bucket holding `{ fieldGroups?: [{id, name}] }` today.
- `collection_versions` — one row per explicit "Create Version" click: `label`, a `snapshot` JSON array (a plain copy of that collection's field rows at that moment — never a live reference), `created_by`, `created_at`.

Because the Prisma client in this sandbox can't be regenerated (no network — the same limitation flagged since Phase 2), `apps/api`'s own `tsc --noEmit` still shows type errors against the new `Collection.description`/`options` columns and the new `collectionVersion` model. These are exactly the shape of every other "awaiting `prisma generate`" gap this phase has had — the code is written against the *target* schema, not the currently-generated client — and will disappear once you run the migrations and regenerate.

### Backend (`collections.service.ts` / `.controller.ts`, `collection-fields.service.ts` / `.controller.ts`)

- **Clone** (`POST /collections/:id/clone`) duplicates a collection and every one of its fields within the *same* project, appending `(Copy)` to the name and `-copy`/`-copy-2`/… to the slug until one's free.
- **Fork** (`POST /collections/:id/fork`, body `{targetProjectId}`) duplicates into a *different* project. This is the one place in the whole phase where a route's `ProjectRoleGuard` isn't the whole authorization story: the guard only ever checks the URL's `:projectId` (the source), so `fork()` itself re-checks `'admin'` access against the target project explicitly before writing anything there.
- Both share a `duplicateInto()` helper. A relation field's `options.relation.collection` is copied as-is — it keeps pointing at whatever it originally pointed at, not a duplicate of it. Cloning/forking one collection never cascades into duplicating everything it relates to; that's a deliberate scope limit, not an oversight.
- **Field-level clone/fork** (`collection-fields.service.ts`) mirror the same pattern at the single-field grain: clone duplicates within the same collection (renamed on clash); fork copies one field's definition onto a different collection, same-project or cross-project, with the same target-project admin re-check when it's the latter.
- **Dependencies** (`GET /collections/:id/dependencies`) finds every relation field in the project whose `options.relation.collection` points at this collection. There's no indexed JSON path in this schema, so rather than a fragile `JSON_EXTRACT` query this fetches the project's relation-type fields (never a large set) and filters in memory.
- **Versions** (`GET`/`POST`/`DELETE /collections/:id/versions[/:versionId]`) list/create/delete snapshots. **Comparison** (`GET /collections/:id/versions/:id/compare?to=<id|current>`) diffs one version against another version or the live fields, by field `name` (the stable identifier across edits) — added/removed/changed, with the actual before/after field definitions for anything changed. There's no restore-from-version; this is inspection, not undo.

### Frontend

- **`CollectionHeader.tsx`** — name/slug/"Custom" badge, an inline click-to-edit description, and the Clone/Fork/Delete actions. Delete requires typing the collection's name to confirm, same weight as Project delete's own Danger Zone. Fork opens a small modal listing your other projects (a new `listMyProjects()` action) to pick a target.
- **`CollectionTabs.tsx`** — a plain anchor-link strip driven by a `?tab=` search param `page.tsx` already reads server-side; no client JS needed for navigation itself. Eight tabs, matching the "build in full" list above.
- **Field Manager** (`FieldsEditor.tsx`, extended, not replaced): a "Field Groups" manager (add/remove named groups, persisted into `collections.options.fieldGroups`; a field joins one via `options.fieldGroupId` on the field itself, editable from its Advanced Configuration); a filter bar (search/type/group, client-side only); per-field Clone/Fork icons; and a "Configure Conditional Logic" icon per field opening a modal to set `{action: show|hide, dependsOn, operator, value}` — stored as another freeform key in the field's existing `options` JSON, no migration needed. When groups exist, the field list renders in named sections with an "Ungrouped" bucket last; with none defined, it's the same flat list as before.
- **`ContentForm.tsx`** now actually evaluates each visible field's conditional-logic rule against the form's live values and hides fields that don't currently match — a small local `isFieldVisible()` (same rule shape and semantics as `@/lib/fields`' own `isFieldVisible`, kept as an intentional duplicate since this file already keeps its own self-contained field-schema type rather than importing the editor's). This is a display-only concern: a hidden field's stored value is untouched, and server-side required-field validation isn't aware of visibility — a required field hidden by a rule is still enforced by the API, same as before this feature existed.
- **Visual Preview** (`VisualPreviewTab.tsx`) — the *real* `ContentForm` component, rendered against a blank draft, with a no-op submit handler that confirms nothing was saved rather than posting to the real create-content endpoint.
- **Validation** (`ValidationTab.tsx`) — a read-only rollup of every field's actual Required/Unique/length-or-range rules in one table; nothing new is stored.
- **Documentation** (`DocumentationTab.tsx`) — a human-readable field reference table plus the existing `GeneratedContract` (the public-API-shape JSON), both generated from the live schema each render — no stored prose.
- **Versions / Comparison** (`VersionsPanel.tsx`, `ComparisonPanel.tsx`) — create/list/delete versions; pick a "from" and "to" (another version, or "Current fields") and see the real diff.
- **Dependencies** (`DependenciesTab.tsx`) — read-only list of which fields, in which collections, reference this one.
- **Blueprints** (`BlueprintsPanel.tsx`) — four hardcoded, curated field-set bundles (SEO Basics, Author Byline, Publishing Schedule, Social Sharing) applied via the same loop-create-field call the project-level "Use Template" flow already uses, just at the field grain instead of the collection grain. This is a fixed list, not a user-saveable blueprint library — that would be a materially bigger feature (its own storage, its own management UI) than "cover this use-case" implied.

Verified: `apps/api`'s `oxlint` is clean across every touched backend file; `apps/web`'s `oxlint`, `eslint`, and `tsc --noEmit` are clean across every touched/new frontend file. `apps/api`'s own `tsc --noEmit` shows only the expected "awaiting `prisma generate`" gaps described above, plus the same two pre-existing, unrelated items flagged before (an unused variable in `public-content-write.service.ts`, and a stale `Project.slug` typing gap from an earlier phase's own not-yet-regenerated client) — nothing new or in scope here.

## Developer module — API Keys, API Analytics, API Explorer, SDK Docs

The request was four reference screenshots of a "Developer" sidebar section (API Keys / API Analytics / API Explorer / SDK Docs), scoped down through four explicit choices rather than assumptions: reuse the existing Access/API-tokens screen for API Keys instead of a second parallel screen; build real request logging + analytics rather than skipping it; build the request builder + multi-language code generation for API Explorer but skip its "AI Assistant" panel (Generate/Validate/Optimize/Explain, which would need a real LLM integration nobody asked for); and build the whole module. None of this has legacy precedent — the legacy admin never had anything like it.

### Where it lives

No fifth `ProjectNav` card. The existing `/projects/:id/access` screen — previously just API-token management — is now the Developer module's home, restructured into four tabs (`DeveloperTabs.tsx`, the same `?tab=` anchor-link pattern as `CollectionTabs.tsx`): **API Keys** (the pre-existing `AccessTokens.tsx`, unchanged), **API Analytics**, **API Explorer**, **SDK Docs**. The `ProjectNav.tsx` card itself is relabeled "Access" → "Developer" (icon swapped from `KeyRound` to `Terminal`) since that's what it now is. Project tokens *are* the API keys the reference design's "API Keys" page manages — building a second, separate key-management UI would only create two ways to do the same thing.

### API Analytics — real logging, not sampled or hardcoded data

**New table** (`packages/db/sql/0005_create_api_request_logs.sql`, Prisma's `ApiRequestLog`): `project_id`, `token_id`, `api_version` (v1/v2), `method`, `path` (literal), `endpoint` (path with the project uuid and any trailing numeric id normalized to placeholders, so `/collections/posts/content/482` and `/…/483` roll up together — collection slugs are left alone on purpose, since each collection is a distinct thing being called), `status_code`, `duration_ms`, `ip`, `created_at`.

**How every request gets logged** (`apps/api/src/public-api/api-request-log.middleware.ts`, wired via `PublicApiModule.configure()` onto both `V1ContentController` and `V2ContentController`): this is Express middleware, not a Nest interceptor, for one specific reason — an interceptor never runs when a guard throws, so a bad-token 401 or a missing-ability 403 would silently vanish from the log. Middleware runs *before* the guard, and its `res.on('finish')` listener fires after the entire request lifecycle completes regardless of outcome, so success, auth failure, and thrown errors all produce exactly one row. Logging is fire-and-forget (`.catch(() => {})`) — it can never break or slow down the request it's describing.

**A real bug fixed as a side effect:** `PersonalAccessToken.lastUsedAt` was never written anywhere in this stack, so `AccessTokens.tsx`'s "Last used" column has shown "Never" for every token regardless of actual traffic since Phase 5. The logging middleware now stamps it on every authenticated call, matching Sanctum's own real behavior. `PublicApiAuthService.resolveToken()` was extended to return the resolved `tokenId` so both the middleware and (indirectly) this fix have something to key off.

**The dashboard** (`ApiAnalyticsService`/`ApiAnalyticsController` at `GET /projects/:id/analytics/{summary,timeseries,endpoints,ips,logs}`, all `RequireProjectRole('admin')` — same tier as token management) reads only this table: total requests, success rate, average response time, and failed-request count for a selectable range (1h/24h/7d/30d); a daily-volume bar chart; a requests-by-endpoint breakdown with per-endpoint average latency and error count; an IP breakdown; and a filterable, paginated recent-calls log — matching the reference's own Overview / Detailed Logs / IP Analytics sub-tabs. Every number is a live aggregate query (`groupBy`/`aggregate`/one raw `GROUP BY DATE(created_at)` for the daily chart, since Prisma's `groupBy` has no date-truncation of its own) — nothing sampled, seeded, or hardcoded. A brand-new project or one that hasn't taken any public-API traffic yet in the selected range shows honestly empty states, not placeholder numbers.

### API Explorer — a real request builder against this stack's real v2 API

`ApiExplorerTab.tsx` builds a request against the actual routes in `v2-content.controller.ts` (list / search / get-by-id / create / update / delete), lets you pick a real collection from the project, fills in a schema-derived example JSON body for create/update, and executes it through a new server action (`executeExplorerRequest`) that proxies the call server-side — this keeps the browser call same-origin (no CORS configuration needed for what's meant to be an external-facing API) and guarantees the request uses *only* whatever token you typed in, never this dashboard session's own credentials. The response panel shows the real status, timing, and body. Multi-language code generation (curl/JavaScript/Python/PHP/Go) is generated locally from the current request state — real snippets for the request actually being built, not canned examples.

**Two deliberate departures from the reference screenshots, because this stack's real API doesn't match them:**
- The reference shows `x-api-key: YOUR_API_KEY`. This stack's actual `V2TokenGuard` (and `LegacyTokenGuard`) only ever reads `Authorization: Bearer <token>` — there is no `x-api-key` support anywhere in the code. The explorer and every generated snippet use `Bearer`, since building it the reference's way would produce copy-pasteable code that fails against the real API.
- The reference implies picking an existing key from a dropdown. `ApiTokensService.issue()` is the *only* place a token's plaintext ever exists — `list()` never returns it again, by design (Phase 5). There is no way to reconstruct "the key named Production" into a fillable value after the fact, so the explorer's API-key field is a manual paste-in with a note pointing back at the API Keys tab, not a dropdown that can't actually work.

The AI Assistant panel from the reference (Generate Request / Validate Request / Optimize / Explain Response) is not built — per your explicit answer, since it would need a real LLM integration this request didn't ask for and nothing here fakes.

### SDK Docs — the real API, not a Supabase SDK that doesn't exist for this stack

The reference's SDK Docs page shows `@supabase/supabase-js` snippets. This stack has no first-party client SDK at all — only the plain REST v2 API — so `SdkDocsTab.tsx` documents *that*: the real bearer-auth header, this project's real base URL, and, generated live from each of the project's actual content models (via a new `getCollectionsWithFields` action, same "derived from what's really there" approach as the content-model screen's own `GeneratedContract`), a fields table plus real list/create/update/delete curl examples with schema-accurate example payloads. A project with no content models yet gets an honest empty state rather than a generic example.

### Schema migration

Run `packages/db/sql/0005_create_api_request_logs.sql` against the database, same way as `0003`/`0004` (remember `-T` on `docker compose exec` when piping a file into it), then `prisma generate` inside both the `api` and `web` containers separately (each keeps its own `node_modules` volume), then `docker compose restart api web`. No image rebuild needed — same reasoning as every prior schema change this phase.

Because this sandbox's Prisma client can't be regenerated (no network — the same limitation flagged since Phase 2), `apps/api`'s own `tsc --noEmit` shows the expected "awaiting `prisma generate`" errors against `ApiRequestLog` (same shape as the already-flagged `CollectionVersion`/`Collection.description` gaps), plus a few cascading "implicit any" errors in `api-analytics.service.ts` that are a direct consequence of the same missing types — all of these resolve once the client is regenerated, and none were treated as real bugs.

Verified: `apps/api`'s `oxlint` and `apps/web`'s `oxlint`/`eslint`/`tsc --noEmit` are clean across every file this section touched. `apps/api`'s own `tsc --noEmit` shows only the "awaiting `prisma generate`" gaps described above plus the same pre-existing, unrelated items flagged in every prior phase (the unused variable in `public-content-write.service.ts`, and the stale `Project.slug`/`ProjectWhereInput` typing gap) — nothing new or in scope here.

### Fix: `collection_versions` foreign-key type mismatch (MySQL error 3780)

Running `0004_create_collection_versions.sql` against the real database failed with `ERROR 3780 ... incompatible` on `collection_versions_collection_id_fk`. Cause: `collections.id`/`projects.id` are `INT UNSIGNED` (Laravel's `increments('id')`, same as every other legacy primary key this stack ports), but the migration declared `collection_id`/`project_id` as plain signed `INT` — MySQL 8.0.19+ rejects a foreign key between columns of different signedness outright, rather than the older behavior of silently allowing it.

Fixed in place (not a new migration file, since `0004` had not successfully applied anywhere yet): `project_id`, `collection_id`, and `created_by` in `0004_create_collection_versions.sql` are now `INT UNSIGNED`, and `CollectionVersion`'s corresponding Prisma fields got `@db.UnsignedInt` to match. Applied the same fix preemptively to `0005_create_api_request_logs.sql`/`ApiRequestLog` (`project_id`, `token_id`) before you hit the identical error there — that table declares no FK constraints (a log row should outlive its project or token being deleted), so it wasn't broken, just inconsistent with the real column types it references.

Re-run `0004_create_collection_versions.sql` (same `-T` exec command as before) before `0005_create_api_request_logs.sql` — nothing else in the apply sequence changes.

### Follow-up: dropped the FK constraints entirely

Matching `collection_id`'s signedness to `INT UNSIGNED` didn't fix it — the same statement failed again with the identical error, meaning `collections.id` isn't a plain `INT UNSIGNED` either (most likely `BIGINT UNSIGNED`, Laravel's modern `$table->id()` helper, though this is now a guess rather than something confirmed against the live schema; this session has no direct way to inspect it).

Rather than guess a third time, `0004_create_collection_versions.sql` no longer declares any `FOREIGN KEY` constraint at all. This is also the more consistent fix: grepping the whole schema shows this migration was the *only* place anywhere in this codebase that ever tried to add a real DB-level foreign key — every other relation `Project`/`Collection`/`Content`/etc. carry in `schema.prisma` (`@relation(fields: [...], references: [...])`) is enforced at the Prisma/application layer only, with a plain indexed integer column underneath and no actual `REFERENCES` clause in the database. `collection_versions.project_id`/`collection_id` now match that same convention — indexed, but not constrained — rather than being the one outlier table trying to enforce referential integrity the database itself was never set up for.

If you'd rather have the real constraint, the actual fix is finding out `collections.id`'s and `projects.id`'s exact real column type first (`SHOW CREATE TABLE collections;` / `SHOW CREATE TABLE projects;` against your database) and telling me — happy to add the FK back once that's confirmed rather than guessed.
