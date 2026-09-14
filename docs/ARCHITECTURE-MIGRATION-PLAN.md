# myCMS: Next.js + Node.js Migration — Architecture Audit & Roadmap

**Prepared for:** Syed Raza
**Subject system:** `cms.node2cloud.com` ("myCMS") — Laravel 8 + Vue 2 headless CMS
**Target:** Next.js frontend, Node.js (NestJS + Prisma) backend
**Migration approach:** Incremental, strangler-fig (old and new systems run side by side; the public content API is redesigned in a v2, with a v1 compatibility shim for existing consumers)

---

## 1. Executive summary

myCMS is a small, well-structured headless CMS: **Projects** contain **Collections**, each Collection has a set of user-defined **Fields** (an EAV/schema-builder pattern), and each Field's actual data lives per content record in a generic **Content / Content Meta** key-value table. A **Media Library** handles file uploads (local disk or S3), and a public, token-authenticated **Content API** lets other applications read and write content per project. The admin panel is a Vue 2 single-page app served from one Laravel Blade shell; the backend is a conventional Laravel 8 MVC app using Sanctum (session + API tokens), Spatie permissions, and Eloquent.

The system is small enough (6 core tables, ~10 controllers, ~25 Vue views/components) that a full rewrite is realistic, but because it's a **production system with external consumers of the public API**, the recommended path is incremental: stand up the new Next.js + NestJS stack behind the same domain, migrate module by module behind a reverse proxy, and only decommission Laravel once every consumer — internal admin users and external API clients — has been moved over.

This document covers: what exists today, what the target architecture looks like, the phase-by-phase migration plan, and the risks and open decisions that need your sign-off before implementation starts.

---

## 2. Current system audit

### 2.1 Stack & entry points

| Layer | Technology |
|---|---|
| Backend framework | Laravel 8 (PHP 7.3/8.0) |
| Frontend | Vue 2.6 SPA (Vue Router 3, Vuex 3 + `vuex-persistedstate`), built with Laravel Mix (webpack), Tailwind CSS |
| Auth | Laravel session auth (Breeze-scaffolded) for the admin panel; Laravel Sanctum personal-access-tokens issued **per Project** for the public Content API |
| Authorization | `spatie/laravel-permission` (role `super_admin` gates project creation/deletion and project settings) |
| Database | MySQL (via Eloquent) |
| File storage | Local disk or S3 (`league/flysystem-aws-s3-v3`), selectable per project; thumbnails generated with `intervention/image` |
| Rich text | Quill (`vue2-editor` / `vue-quill-editor`) |
| Deployment | Single PHP app, assets built to `public_html/`, `.htaccess` present (Apache) |

The whole admin experience is one Blade view (`resources/views/app.blade.php`) that boots a Vue app; Vue Router owns all client-side navigation. Laravel only renders server-side for auth pages (login/register/password reset — standard Breeze views) and for the SPA shell itself.

### 2.2 Domain model

Six tables carry the entire product:

| Table | Key columns | Purpose |
|---|---|---|
| `projects` | `uuid` (public identifier), `name`, `default_locale`, `locales`, `disk` | Tenant/workspace. Also doubles as a **Sanctum token owner** — API tokens for the public Content API are issued against the Project, not a User. |
| `collections` | `name`, `slug`, `project_id`, `order` | A content type within a project (e.g. "Blog Posts"). |
| `collection_fields` | `type`, `label`, `name`, `options` (JSON), `validations` (JSON), `collection_id`, `order` | The schema-builder: defines one field on a Collection. `type` is one of `text, richtext, email, number, enumeration, boolean, date, media, relation, json, password`. `options` holds type-specific config (enum choices, related collection). `validations` holds a `charcount` rule (`Min`/`Max`/`Between`). |
| `content` | `project_id`, `collection_id`, `locale`, `created_by`, `updated_by`, `published_at`, `published_by`, soft-deletes | One row per content record. Holds **no field data itself** — just metadata (locale, publish state, audit fields, trash state via `deleted_at`). |
| `content_meta` | `content_id`, `field_name`, `value` (longtext), soft-deletes | The EAV table: one row per field-value pair for a content record. `value` is a string/JSON-encoded blob whose shape depends on the field's `type`. |
| `media` | `project_id`, `name`, `type`, `size`, `width`, `height`, `caption`, `disk` | Uploaded files; `getFullUrlAttribute`/`getFullUrlThumbAttribute` compute URLs based on `disk` (local route vs S3 URL). |

Supporting tables: `users`, `personal_access_tokens` (Sanctum), Spatie's `roles`/`permissions`/`model_has_roles` tables.

This is a genuine EAV design — deliberate, since Collections/Fields are user-defined at runtime. The migration must **preserve this pattern** (or an equivalent), not "normalize it away," because collection schemas are data, not code.

### 2.3 Auth & authorization model

There are two distinct authentication surfaces, and this distinction is important to carry into the new stack:

1. **Admin panel auth** (`routes/web.php`, `auth:web` middleware): standard Laravel session/cookie auth for human users logging into the SPA. Roles come from `spatie/laravel-permission` — only `super_admin` can create/delete Projects or touch Project settings (locales, users, API tokens).
2. **Public Content API auth** (`routes/api.php`, `auth:sanctum` middleware): tokens are issued **per Project** (`Project` model uses `HasApiTokens`), with abilities like `read`/`write` checked via `tokenCan()`. A request authenticates as a *Project*, not a User — `$auth->uuid` is compared against the `{uuid}` route segment. This is how external sites/apps pull and push content without a human login.

CORS is currently wide open (`allowed_origins => ['*']`, `supports_credentials => false`) for the `api/*` and `sanctum/csrf-cookie` paths — fine for a token-based public API, but worth tightening deliberately in the redesign rather than carrying forward by default.

### 2.4 Backend module map

| Module | Web routes (admin, session auth) | Public API routes (token auth) |
|---|---|---|
| Users | `/admin/user/*` (profile, email, password) | — |
| Projects | `/admin/projects/*` (CRUD, `super_admin`-gated create/delete), locales, user assignment, API token management | `GET /api/{uuid}` (project info) |
| Collections | `/admin/collections/*` (CRUD, reordering) | — (collections are structural, not exposed directly) |
| Collection Fields | `/admin/collections/fields/*` (CRUD, reordering, char-count validation) | — |
| Content | `/admin/content/*` (list, new/edit forms, publish/unpublish/trash/delete, bulk actions, "get selected records/files" for relation pickers) | `GET/POST/DELETE /api/{uuid}/{slug}[/{id}]` — full CRUD, plus a rich **`where` query language** (see below) |
| Media | `/admin/media/*` (list, upload, delete, update caption) | `/api/{uuid}/project-media/*` (list, get by id/name, upload, delete) |

The public `getContent` endpoint supports a nontrivial filter DSL: `?where[field][op]=value` with operators `not`, `in`, `not_in`, `lt`, `lte`, `gt`, `gte`, `between`, `not_between`, plus an `or`-combination mode that builds a raw multi-join SQL query across aliased `content_meta` rows. Any redesign of this endpoint needs to either preserve this expressiveness or offer a documented equivalent (see §3.6).

### 2.5 Frontend SPA structure

Vue Router (`resources/js/routes.js`) maps 1:1 onto the admin's information architecture:

```
/                                          Home (project list)
/profile                                   User profile
/projects/:project_id                      Project overview
/projects/:project_id/settings             Project settings (locales, users, API tokens as tabs)
/projects/:project_id/collections          Collection list
/projects/:project_id/collections/:col_id  Collection schema builder (fields)
/projects/:project_id/content              Content root
/projects/:project_id/content/:col_id      Content list (table view) for a collection
/projects/:project_id/content/:col_id/new  New content form
/projects/:project_id/content/:col_id/edit/:content_id  Edit content form
/projects/:project_id/media_library        Media library
```

State: Vuex store (`resources/js/store`) persisted via `vuex-persistedstate`. Key heavy components: `CollectionShow.vue` (the field-type schema builder — the most complex UI in the app, ~55KB), `ContentEdit.vue`/`ContentNew.vue` (dynamic form rendering per field type, ~40-50KB each), `ContentTable.vue` (list/bulk actions, ~45KB), `MediaLibrary.vue`.

The field-type system is the crux of the frontend: for each `collection_fields.type`, the form renderer switches between a plain input, a Quill rich-text editor, a number input, an enumeration `<select>`, a boolean toggle, a date picker (`v-calendar`), a media picker (opens the Media Library), a relation picker (`v-select` querying another collection's content), and JSON. This switch-per-type pattern is exactly what needs to be reproduced as a component registry in Next.js.

### 2.6 Media & storage

Files are stored either on local disk (served via a signed-less `Route::get('uploads/{dir}/{file}', ...)` that streams from `storage/app/public`) or S3 (direct URL via Flysystem), selectable **per project** via `projects.disk` / `media.disk`. Thumbnails are pre-generated and stored alongside originals in a `thumbnails/` subfolder. URL generation is computed on the model (`Media::getFullUrlAttribute`), not stored — so the new backend needs equivalent logic, not a stored URL column.

---

## 2. Current system audit — status: complete

*(Sections above; proceeding to target architecture.)*

## 3. Target architecture

### 3.1 Decisions already agreed

- **Backend:** NestJS + Prisma (chosen for its structural similarity to Laravel — modules/controllers/providers ~ Laravel's controllers/services, Guards ~ middleware/policies — which keeps the port close to a 1:1 translation rather than a redesign-while-porting).
- **Migration approach:** incremental strangler-fig. Laravel stays live in production throughout; new modules are stood up alongside it and cut over one at a time.
- **Public Content API:** this migration is the chance to redesign it (versioned, cleaner conventions) rather than reproduce the current ad-hoc `where[]` DSL verbatim — with a v1 compatibility shim kept in front of it for as long as existing external consumers need it.

### 3.2 Proposed repository layout

A monorepo keeps the shared type contracts (DTOs, Prisma-generated types, field-type enums) in one place instead of duplicated across two repos:

```
mycms/
├── apps/
│   ├── web/              # Next.js admin panel (App Router)
│   └── api/              # NestJS backend
├── packages/
│   ├── db/                # Prisma schema + generated client, migrations
│   ├── shared-types/       # Field-type enums, DTO/zod schemas shared by web + api
│   └── ui/                 # Shared design-system components (optional)
├── legacy/                 # Laravel app, kept running during migration, then archived
└── infra/                  # Reverse-proxy config, deploy scripts, CI
```

### 3.3 Backend module map (NestJS)

Each Laravel controller maps onto a NestJS module, keeping the same responsibility boundaries so the port is traceable line-by-line during code review:

| NestJS module | Mirrors | Notes |
|---|---|---|
| `AuthModule` | Breeze auth controllers + Sanctum | Session-based admin auth (see §3.5) |
| `UsersModule` | `UsersController` | Profile self-service |
| `ProjectsModule` | `ProjectsController` (web) + `API/ProjectsController` | Includes locales, user-assignment, and API-token sub-resources as nested routes/services |
| `CollectionsModule` | `CollectionsController` | CRUD + ordering |
| `CollectionFieldsModule` | `CollectionFieldsController` | CRUD + ordering + the char-count validation rules (ported as a Nest pipe/validator) |
| `ContentModule` | `ContentController` (web) + `API/ContentController` | Admin CRUD/bulk actions **and** the public content API v2 (see §3.6), sharing one query-building service |
| `MediaModule` | `MediaLibraryController` + `API/MediaController` | Upload, list, delete, thumbnailing |
| `PermissionsModule` | `spatie/laravel-permission` | Role/permission tables ported as-is; enforced via a `RolesGuard` |

Cross-cutting: a `ProjectContextGuard` resolves `{uuid}` → Project once and attaches it to the request, replacing the repeated `Project::find()` + uuid-check boilerplate seen in every current API controller method.

### 3.4 Data layer

The existing MySQL schema is sound and should be **kept, not redesigned**, at least through the migration. Prisma introspects the current database directly (`prisma db pull`), so day one requires no data migration — only a generated schema layer on top of the live tables. Illustrative shape (abbreviated):

```prisma
model Project {
  id             Int       @id @default(autoincrement())
  uuid           String    @unique
  name           String
  description    String?
  defaultLocale  String    @default("en") @map("default_locale")
  locales        String?
  disk           String?
  collections    Collection[]
  media          Media[]
  content        Content[]
  deletedAt      DateTime? @map("deleted_at")
  @@map("projects")
}

model CollectionField {
  id            Int      @id @default(autoincrement())
  type          String   // text | richtext | email | number | enumeration | boolean | date | media | relation | json | password
  label         String
  name          String
  options       Json?
  validations   Json?
  collectionId  Int      @map("collection_id")
  order         Int?
  @@map("collection_fields")
}

model Content {
  id           Int           @id @default(autoincrement())
  projectId    Int           @map("project_id")
  collectionId Int           @map("collection_id")
  locale       String?
  publishedAt  DateTime?     @map("published_at")
  deletedAt    DateTime?     @map("deleted_at")
  meta         ContentMeta[]
  @@map("content")
}

model ContentMeta {
  id           Int      @id @default(autoincrement())
  contentId    Int      @map("content_id")
  fieldName    String   @map("field_name")
  value        String?  @db.LongText
  deletedAt    DateTime? @map("deleted_at")
  @@map("content_meta")
}
```

The EAV pattern is preserved deliberately — Collections/Fields remain user-definable at runtime, which a fixed relational schema can't support without becoming its own schema-migration engine. Prisma's `Json` fields handle `options`/`validations` cleanly; raw SQL (`prisma.$queryRaw`) replaces the current hand-built multi-join `where` queries, with parameter binding instead of string concatenation (the current implementation interpolates project/collection IDs directly into SQL strings — safe today because those are internal integers, but worth tightening in the port).

### 3.5 Auth strategy

Two separate mechanisms, matching the two surfaces identified in §2.3:

- **Admin panel:** NextAuth.js (Auth.js) with a Credentials provider backed by the `users` table (bcrypt-compatible password hashing — Laravel's bcrypt hashes are drop-in compatible with Node's `bcrypt`/`bcryptjs`, so existing user passwords keep working without a forced reset). Sessions as httpOnly cookies, matching today's session-cookie model rather than introducing token refresh complexity for human users.
- **Public Content API:** project-scoped API keys, same concept as today's Sanctum personal-access-tokens-on-Project. Store as hashed tokens with `read`/`write` abilities, validated by a NestJS Guard that resolves token → Project in one step (replacing today's `auth()->user()` + manual uuid comparison).
- **Roles/permissions:** port the Spatie tables as-is (`roles`, `permissions`, `model_has_roles`) and enforce with a `RolesGuard` + decorator (`@Roles('super_admin')`), mirroring the current `->middleware(['role:super_admin'])` usage exactly.

### 3.6 Public Content API v2 (+ v1 compatibility)

Recommended redesign, since you opted to open this up rather than freeze the contract:

- **Versioned base path:** `/api/v2/projects/:uuid/collections/:slug/content` instead of the current positional `/{uuid}/{slug}`, which reads ambiguously and can't be extended without breaking.
- **Filtering:** replace the bespoke `where[field][op]=value` querystring DSL with a documented, typed filter syntax (e.g. `filter[field][gte]=2024-01-01`, keeping the same operator vocabulary you already have — `eq, ne, in, not_in, lt, lte, gt, gte, between, not_between` — plus `and`/`or` groups expressed as nested JSON in the request body for complex queries, since deeply nested filters don't belong in a querystring). This keeps every current capability while giving it a real spec (OpenAPI) instead of implicit behavior discovered by reading the controller.
- **Pagination & sorting:** add first-class `page`/`per_page` and `sort` parameters — the current API has no visible pagination on `getContent`, which is worth confirming isn't already a production issue (see §5, Risks).
- **Response shape:** keep resolved field values keyed by field name (as `ContentResource` does today) so consumers' parsing logic barely changes, but add a stable `meta.locale`, `meta.status` envelope.
- **v1 compatibility shim:** a thin NestJS module (or an nginx rewrite + adapter controller) that accepts the old `/api/{uuid}/{slug}` shape and internally calls the v2 service, translating the `where[]` syntax to the new filter format. This is what lets existing external consumers keep working unmodified while you migrate them to v2 on their own timeline — retire the shim only after confirming (via access logs) that nothing still calls v1.

### 3.7 Frontend (Next.js)

- **Routing:** App Router, with the route tree mirroring §2.5 almost exactly (`/projects/[projectId]/collections/[collectionId]`, etc.) — this is a case where the existing IA is good and shouldn't be redesigned, only re-platformed.
- **Data/state:** TanStack Query for server state (replacing Vuex for anything that's really "cached API data") + a light client-state store (Zustand) for UI-only state (open modals, selected rows). This removes the biggest source of Vuex boilerplate without introducing a heavier replacement.
- **Field-type renderer:** a single `FieldRenderer` component keyed on `field.type`, dispatching to per-type subcomponents (`TextField`, `RichTextField`, `EnumerationField`, `BooleanField`, `DateField`, `MediaField`, `RelationField`, `JsonField`) — a direct port of the `v-if` chain in `ContentEdit.vue`/`ContentNew.vue`/`CollectionShow.vue`, but as a proper registry so adding a tenth field type later doesn't mean editing three 40KB files again.
- **Rich text:** Tiptap (React-native, actively maintained) as the Quill replacement; store the same HTML-in-`content_meta.value` shape so no data migration is needed.
- **Forms/validation:** React Hook Form + Zod, with the char-count `Min`/`Max`/`Between` validation rules ported as Zod refinements generated from the field's `validations` JSON — same rule engine, framework-native implementation.
- **Drag/reorder:** `@dnd-kit` replacing `vuedraggable` for field and collection ordering.
- **i18n:** two distinct concerns to keep separate — the **admin UI's own language** (currently `en`/`tr` via Laravel lang files, handled with `next-intl` or similar) versus **content locales** (`projects.locales`, a per-project, user-defined list — this stays pure data, not a UI i18n concern, exactly as it is today).

### 3.8 Media & storage

- Local + S3 storage abstraction ported as a small storage-provider interface (`LocalStorageProvider`, `S3StorageProvider`) selected per project, matching `media.disk`/`projects.disk` today.
- `sharp` replaces `intervention/image` for thumbnail generation — faster and the de facto Node standard.
- Preserve the **computed URL** approach (`getFullUrlAttribute` equivalent as a Prisma computed field or a service method), not a stored URL column, so moving a project between disks doesn't require a data backfill.
- Existing local files under `storage/app/public/{uuid}/...` and thumbnails need either a straight filesystem copy to wherever the new backend serves uploads from, or continued dual-read during the transition window — flagged in §5.

---

## 4. Migration roadmap (strangler fig)

The guiding rule: **Laravel stays the system of record until a module is fully verified in the new stack**, and traffic is routed by URL path at the reverse-proxy layer so cutover per module is a config change, not a deploy-and-pray event.

```
                        ┌─────────────────────┐
   cms.node2cloud.com → │  nginx / API gateway │
                        └──────────┬───────────┘
                     path-based routing rules
              ┌──────────────┴───────────────┐
              ▼                               ▼
      Laravel (legacy)                 NestJS + Next.js (new)
   (shrinks over each phase)         (grows over each phase)
```

| Phase | Scope | What ships | Exit criteria |
|---|---|---|---|
| **0. Foundations** | Repo, CI/CD, environments | Monorepo scaffolded; Prisma introspects prod DB read-replica; NestJS + Next.js skeletons deployed behind the proxy, serving nothing live yet | New stack deploys green in staging against a copy of prod data |
| **1. Auth, Users, Projects (read)** | Login, profile, project list/detail (read-only) | NextAuth wired to existing `users` table; Projects module read paths live in Next.js/NestJS behind `/beta` or a feature-flagged path | Admins can log in and browse projects on the new stack in staging; passwords verified compatible |
| **2. Media Library** | Upload/list/delete/caption, local + S3 | Self-contained module, low coupling to Content — good second target | Parallel-run: uploads via new stack are visible in old stack's media library and vice versa |
| **3. Collections & Fields (schema builder)** | CRUD + reordering + validation rules | `CollectionShow.vue` equivalent rebuilt as the `FieldRenderer` registry's admin counterpart | A collection created in the new UI is usable (content can be added) in the still-live Laravel content screens |
| **4. Content CRUD** | List/new/edit/publish/trash/bulk actions | The EAV read/write engine, ported field-by-field type | Content authored in new stack renders correctly in old stack's content table (and vice versa) — proves `content_meta` compatibility |
| **5. Public Content API v2 + v1 shim** | External-facing API | v2 API live; v1 shim proxies legacy consumers; access logs monitored per token to find which external consumers haven't migrated | Zero v1 traffic for 2+ consecutive weeks, or all known consumers confirmed migrated |
| **6. Cutover & decommission** | Full traffic switch | 100% of `cms.node2cloud.com` served by the new stack; Laravel app archived (not deleted) for a rollback window | New stack has run as sole system for an agreed burn-in period (recommend 2-4 weeks) with no P1 incidents |

Within each phase, the pattern is: build the module → run it in staging against a snapshot of prod data → enable it for internal/test accounts only via a path or feature flag → verify parity → cut real traffic → keep the Laravel equivalent as instant fallback for one release cycle before removing it.

---

## 5. Risks & mitigations

- **EAV query parity (highest risk).** The current `where[]` DSL, especially its raw-SQL multi-join `or` mode, is the single most complex piece of logic in the codebase. Any external consumer relying on an undocumented edge case of that DSL is a risk during the v1→v2 transition. *Mitigation:* write a parity test suite that replays real production query patterns (pulled from access logs) against both the legacy endpoint and the v1 shim before touching a single external consumer.
- **No visible pagination on `getContent`.** If collections have grown large, this could already be a latent performance issue independent of the migration, and the new v2 API's pagination default needs to not silently change behavior consumers depend on (e.g. "give me everything"). *Mitigation:* confirm actual collection sizes in production before finalizing the v2 default page size.
- **Media URL compatibility.** Existing content likely has stored references (in rich text, in `relation`/`media` field values) pointing at `https://cms.node2cloud.com/uploads/...` and S3 URLs. The new stack must serve these same URL shapes, or a redirect/rewrite layer is needed. *Mitigation:* keep the URL-computation logic and route shape identical, not just "equivalent."
- **Session vs JWT semantics.** Moving admin auth to NextAuth is straightforward, but any place the Vue SPA currently relies on Laravel's CSRF-cookie + session behavior (rather than a bearer token) needs an explicit equivalent, or cross-origin admin requests will silently 419/401 during the parallel-run window.
- **Spatie role/permission port.** Only one role (`super_admin`) appears to be actively used today; confirm there isn't a second tier of permissions configured only in the database (not visible in code) before assuming the port is a straight copy.
- **Unknown external API consumers.** Per-project tokens mean "who consumes this API" is a data question, not a code question. *Mitigation:* before Phase 5, pull a list of active tokens and, where possible, identify their owners/consumers so nobody is surprised by the v1 deprecation.

## 6. Testing & validation strategy

- **Contract tests** for the public API: capture real request/response pairs from the live Laravel API (sanitized) and replay them against the new NestJS endpoints (both v1-shim and native v2) as a regression suite.
- **Dual-write/shadow-read verification** during Phases 2-4: for a defined window, writes go to both stacks' database layer (same DB, so this is really "verify both codepaths produce identical `content_meta` rows"), with a diff job flagging mismatches.
- **Field-type golden tests:** for each of the 11 field types, one fixture content record exercised through create/edit/publish/read in both stacks, diffed byte-for-byte on the public API response.
- **Auth parity tests:** existing user passwords must authenticate successfully against the new stack without a reset; a same-password login test against a copy of the `users` table is a cheap, high-value check to run early (Phase 1).
- **Load/perf smoke test** on the v2 Content API before Phase 5 cutover, given the EAV joins are the most expensive queries in the system.

## 7. Rough effort sizing

Assuming one focused full-stack engineer (or two working in parallel across frontend/backend), and treating this as a rough planning input rather than a commitment:

| Phase | Estimate |
|---|---|
| 0. Foundations | 1–1.5 weeks |
| 1. Auth, Users, Projects (read) | 1.5–2 weeks |
| 2. Media Library | 1–1.5 weeks |
| 3. Collections & Fields | 2–3 weeks (most complex admin UI) |
| 4. Content CRUD (EAV engine) | 3–4 weeks (highest-risk module) |
| 5. Public API v2 + v1 shim + consumer migration | 2–3 weeks build + open-ended consumer-migration tail |
| 6. Cutover & burn-in | 0.5 week + 2–4 week observation window |
| **Total build effort** | **~11–15 weeks**, plus whatever tail Phase 5's external-consumer migration takes |

## 8. Open decisions needed from you

1. **Password hashing confirmation:** confirm the `users.password` column uses standard Laravel `bcrypt` (default) and not `argon2`, so the Node-side bcrypt compatibility assumption in §3.5 holds.
2. **External API consumer list:** do you have a record of who holds Project API tokens today (e.g. other Veroke/client projects consuming this CMS's content API), so Phase 5's migration-tail can be scoped rather than open-ended?
3. **Pagination behavior:** should the v2 Content API default to paginated responses (breaking "fetch everything" callers) or keep an explicit opt-in, given point above about unknown consumers?
4. **Hosting target for the new stack:** staying on the current host, or moving to something with native Next.js/Node support (Vercel, a Node-friendly VPS/container platform)? This affects the reverse-proxy design in §4.
5. **Team size/timeline:** the estimate in §7 assumes 1–2 engineers; if you want this compressed, the phases can run more in parallel (e.g. Media Library and Collections/Fields have little coupling and could be built simultaneously by two people).
