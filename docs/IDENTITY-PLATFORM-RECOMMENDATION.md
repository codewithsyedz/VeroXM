# Identity Platform Recommendation: Authentication, Authorization & Session Management

**Prepared for:** VeroXM (mycms-nextjs-nodejs)
**Scope:** Per-project (per-tenant) auth, authz, and session management — native identity plus the ability to federate to a customer's own Keycloak (or other enterprise IdP)
**Status:** Recommendation for review — no code changes made as part of this document

---

## 1. Executive summary

**Recommendation: adopt self-hosted Keycloak as the identity platform, using Keycloak's Organizations feature to map one Organization per `Department` — a new tenant layer above `Project` (see §3.2) — with `Project` staying exactly what it is today, as a resource created inside a Department's workspace.**

This gets you both halves of what you asked for essentially "for free," rather than building them:

- **"Something like Keycloak, native":** every Project gets its own member roster, native email/password (or social) accounts, roles, and sessions — provided by Keycloak itself, not a custom clone of it.
- **"Ability to integrate with Keycloak":** Keycloak's built-in **Identity Brokering** lets any Organization link an external OIDC or SAML identity provider — including a customer's own separately-hosted Keycloak realm — with no custom federation code. A customer who already runs Keycloak (or Okta, Azure AD/Entra ID, Google Workspace, generic SAML) just gets an Identity Provider record pointed at their IdP; their staff then SSO in with corporate credentials, brokered transparently into a VeroXM session.

This also directly retires several real gaps this session's own research turned up in the current stack: no server-side session revocation, no refresh-token flow, no user-management UI/API (role assignment still requires the legacy Laravel admin), and a fragile string-parsed role model (`admin{projectId}` / `editor{projectId}` rows matched by prefix-parsing a role name). Keycloak replaces all of that with production-grade, standards-based infrastructure instead of code VeroXM would otherwise have to write and maintain itself.

The trade-off, stated plainly up front: Keycloak is infrastructure you run and operate (a stateful service, ideally HA, that needs upgrades and monitoring), not a SaaS API call. Section 7 covers the managed alternative (WorkOS/Auth0/Ory) if you'd rather not own that operational surface, with the concrete cost/control trade-off spelled out.

---

## 2. Current state (as of this review)

This grounds the recommendation in what's actually in the codebase today, not assumptions:

- **Tenant boundary today is `Project`.** There is no Organization/Workspace layer above it in the schema.
- **Two disconnected auth systems exist today, with zero shared identity:**
  - *Dashboard (human) auth:* NextAuth v4, a single `CredentialsProvider` (email/bcrypt password checked directly against the `User` table), stateless JWT session (`session: { strategy: "jwt" }`, default 30-day cookie). On every request, the NextAuth `jwt` callback mints a **second**, separate short-lived (15 min) HS256 JWT (`API_JWT_SECRET`) that the NestJS API actually verifies — this exists specifically because NextAuth's own JWE session cookie format isn't meant to be parsed by another service.
  - *Public content API (machine) auth:* Sanctum-compatible opaque tokens (`{id}|{secret}`), scoped to a **Project**, not a user — there is no user identity anywhere in this path. This is working well for its purpose (a project-scoped API key a customer's own backend uses) and is **out of scope for this recommendation** — it should stay as-is.
- **Authorization** is enforced per-route today via a clean `JwtAuthGuard` + `ProjectRoleGuard` + `@RequireProjectRole('editor'|'admin'|'super_admin')` decorator pattern in NestJS — this pattern itself is sound and worth keeping. What's fragile is *where the roles come from*: a `Role`/`ModelHasRole` pair of tables (ported as-is from the legacy Laravel/Spatie schema) where project membership is encoded as a role name string like `admin42`, parsed with `name.startsWith('admin')` / `Number(name.slice(5))`. No permission-level (only role-level) checks exist. **There is no API or UI anywhere in the current stack to grant a role** — that still only happens through the legacy Laravel admin, a real, tracked, operational dependency.
- **Session management is fully stateless**, with no server-side revocation: the 30-day NextAuth cookie can't be invalidated early if a user is deleted or de-roled mid-session; there's no refresh-token grant (the "refresh" that exists is really "re-sign the inner 15-minute JWT from the still-valid outer cookie"); logout is client-side cookie-clearing only.
- **No SSO/OIDC/SAML/Keycloak integration exists anywhere today** — zero code, zero config, zero mention in any planning doc. The one relevant fact: `next-auth@4` (already an installed dependency) ships a ready-made `next-auth/providers/keycloak` OIDC provider that isn't currently wired up — meaning the dashboard side of a Keycloak integration is largely configuration, not a new dependency.


---

## 3. Target architecture

### 3.1 Identity platform: self-hosted Keycloak

Keycloak (Apache 2.0, CNCF/Red Hat-backed, no per-user or per-connection licensing cost) becomes the single source of truth for human identity — both your own dashboard users and, for enterprise customers, their own staff logging in via their own IdP. The public content API's project-scoped tokens are untouched.

### 3.2 Tenant hierarchy: `Department` → `Project` → API Collection

This is a deliberate extension beyond the original ask, worth stating explicitly since it changes the schema's tenant model: introduce **`Department`** as a new top-level tenant unit *above* `Project` (today, `Project` is the top-level boundary — see §2), rather than replacing `Project` with it.

- **`Department` → Keycloak Organization.** A department gets its own member roster, its own optional linked external IdP, and its own department-level roles (e.g. `department-admin`). This is where "super admin defines departments, each with its own workspace" lives — Keycloak's **Organizations** feature (technology preview at Keycloak 25, targeted for GA at 26; current line is 26.7.x as of 2026 — confirm exact GA/stability status on whichever version you deploy) exists specifically for this shape of problem: many tenants sharing one realm, each mixing native member accounts with an optional linked identity provider.
  - **Native accounts:** a Department's members can be plain Keycloak-native accounts (email/password, optionally + TOTP/WebAuthn) — the "something like Keycloak, native" half of the ask.
  - **Federated accounts:** a Department can *also* link an external Identity Provider (OIDC or SAML) with domain matching, including a customer's own separately-hosted Keycloak realm (Keycloak-to-Keycloak brokering is a first-class case), Okta, Azure AD/Entra ID, Google Workspace, or generic SAML — the "integrate with Keycloak" half.
  - **Scale:** Organizations in one realm are designed for hundreds-to-thousands of tenants; a dedicated Keycloak *realm* per tenant degrades somewhere around dozens-to-~100 realms. Recommendation: **Organizations by default per Department**, with a dedicated realm reserved only for your largest, most security-sensitive enterprise customers needing full data-plane isolation.
- **`Project` stays exactly what it is today, becoming a child resource of a Department** (`Project.departmentId` FK, new). A department-admin/member generates Projects inside their department's workspace. Each Project keeps its own `admin{id}`/`editor{id}`-equivalent roles — sourced from Keycloak group/role claims (§3.3) rather than department-wide roles applying uniformly across every project in the department.
- **API collections and tokens (the Developer Module already built) stay Project-scoped, exactly as today — no change to that model at all.** See §3.2a for why that's correct, not a gap to close.
- **`super_admin`** stays a single global role outside every department, exactly as today — able to create/manage Departments themselves.

**Sequencing note, directly answering "RBAC first or Keycloak first":** don't build this hierarchy as new custom Prisma tables and role-name strings first, then bolt Keycloak on afterward — that means designing the same membership/role model twice, and is the "build it yourself" path already advised against in §5. Model Departments and their membership **directly in Keycloak's own terms** (Organizations, groups, roles) from the start. VeroXM's own schema only needs to add `Project.departmentId`; the per-project role-claim consumption is already described in §3.3.

### 3.2a Platform login and API collection tokens are meant to stay different systems — that's correct, not a gap

Directly answering "should platform login and API collections use the same auth, or is it fine to have both": **it's fine, and it's the right design, to keep these permanently separate:**

- **Platform login** — a human (a department member, a project editor) signing into the VeroXM dashboard — becomes a Keycloak-issued OIDC session: real sessions, MFA, SSO federation. This is what this recommendation changes.
- **API collections** — a customer's own backend calling the public Content API, with no human present — keep the existing Sanctum-style opaque bearer token, scoped to a Project with abilities (`read`/`create`/`update`/`delete`). This should **stay exactly as it is**: it's the correct shape for machine-to-machine credentials (a long-lived static key), not an OAuth/OIDC session that expects a human to refresh it, and it already works well. Forcing API collection auth through the same session machinery as human login would be a step backward — the same split exists deliberately at, e.g., Stripe or GitHub (dashboard login vs. API keys are different systems there too).

There's no unification to do here — both running simultaneously, indefinitely, is the intended end state, not a temporary compromise.

### 3.3 Authorization: keep the guard pattern, replace the source of truth

`ProjectRoleGuard` + `@RequireProjectRole(...)` is a good, idiomatic NestJS pattern — keep its shape. What changes is where `RolesService.getUserRoles()` gets its data from:

- Today: parse `model_has_roles` rows joined to `roles`, matching `admin{projectId}` / `editor{projectId}` / `super_admin` by string prefix.
- Target: the access token Keycloak issues carries **Organization membership + realm/client roles as real claims** (e.g. an `organization` claim identifying the Project, plus realm roles `project-admin` / `project-editor`, or Organization-scoped roles if you adopt Keycloak's per-organization role mapping). `RolesService` becomes "read claims already verified by JWT signature," not "parse a string and hope the prefix matches" — the exact brittleness flagged in the current code goes away, and you get real typed role data instead of a name you slice a substring out of.
- `super_admin` maps naturally to a realm-level role granted outside any Organization.

### 3.4 Session management

Keycloak gives you, out of the box, everything the current stack is missing: real server-side sessions with configurable SSO idle/max lifetimes, a standard OAuth2 refresh-token grant (rotating refresh tokens, not "re-sign a JWT from a still-valid cookie"), per-user or per-session revocation via the Admin REST API ("log out everywhere" becomes one API call), brute-force detection, and optional MFA/WebAuthn step-up — all configurable per realm and, with Organizations, overridable in some respects per tenant. This is the single biggest concrete gap this closes versus the current design.

### 3.5 Integration points in the existing codebase

- **`apps/web/src/lib/auth.ts`:** swap `CredentialsProvider` for `next-auth/providers/keycloak` (already installed, unused). NextAuth's Keycloak provider handles the OIDC Authorization Code + PKCE flow against your Keycloak realm.
- **`apps/api/src/auth/jwt-auth.guard.ts`:** instead of verifying a locally HS256-signed `API_JWT_SECRET` token, verify the Keycloak-issued access token as a standard OIDC resource server would — RS256 signature checked against Keycloak's JWKS endpoint (`jwks-rsa` + `jsonwebtoken`, or `nest-keycloak-connect` if you want a ready-made NestJS integration). This retires the current "mint a second internal JWT on every request" design entirely — one real access token, verified the standard way, on both sides.
- **`packages/db/prisma/schema.prisma`:** `User`, `Role`, `ModelHasRole` stop being the source of truth for *authentication* and *project membership* — Keycloak owns both. You likely keep a lightweight local `User` mirror (for foreign keys like `Content.createdBy`, `Project.createdBy` etc. that already reference a numeric user id) synced from Keycloak (e.g. via its user-created/updated webhooks, or lazily on first-seen-token), but stop storing passwords or role-membership locally at all.
- **Role assignment / user management:** this closes the standing "no UI or API to grant a role" gap for free — Keycloak ships a full Admin REST API and Account/Admin consoles. VeroXM's own dashboard can call the Admin REST API to invite/manage Organization members and roles from within your existing UI, rather than building bespoke user-management screens from scratch.


---

## 4. Migration plan (phased)

Framed to match this project's existing phase-note convention (`docs/PHASE-N-NOTES.md`) without presuming an exact phase number:

1. **Stand up Keycloak** (docker-compose service for local dev, alongside `gateway`/`api`/`web`/`db`; a managed or self-managed HA deployment for staging/prod). Create the realm, enable Organizations.
2. **Legacy password migration — do it just-in-time, not as a bulk import.** Keycloak supports a custom User Storage SPI (or a simple "verify against legacy, then set native Keycloak credential and mark migrated" flow on first login) so existing bcrypt-hashed users log in once against the old hash and are transparently upgraded to a native Keycloak credential — no forced password reset for your existing users.
3. **Wire up the dashboard:** swap the NextAuth provider, remove the internal `apiToken`-minting logic.
4. **Wire up the API:** switch `JwtAuthGuard` to JWKS/RS256 verification; update `RolesService` to read Organization/role claims from the verified token instead of the `ModelHasRole` string-parse.
5. **Re-model membership** as Keycloak Organization (Department) membership + roles; add `Project.departmentId` and backfill every existing Project into a Department (a single default Department is a reasonable starting bucket for existing data); backfill existing `admin{id}`/`editor{id}`/`super_admin` assignments into Keycloak roles as a one-time migration script.
6. **Build (or extend) the in-app "manage project members" screen** against Keycloak's Admin REST API — this is the moment to close the standing role-assignment gap.
7. **Per-project SSO onboarding:** add a simple UI for a Project admin to register their organization's IdP (OIDC discovery URL, or SAML metadata) — this becomes a thin wrapper over the Keycloak Admin REST API's Identity Provider endpoints, not custom federation code.
8. **Cut over, then remove** the old `User.password`/`Role`/`ModelHasRole` write paths once Keycloak is the confirmed source of truth (keep the tables read-only/archived through a transition window, matching how `PersonalAccessToken` was already treated as legacy-owned-then-adopted in this codebase).

---

## 5. Alternatives considered

| Option | What you get | Trade-off vs. Keycloak |
|---|---|---|
| **Build it yourself** (extend `User`/`Role` tables, hand-roll OIDC client + SAML support, build session revocation) | Full control, no new infra | You end up re-implementing large parts of Keycloak — session security, token rotation, SAML/OIDC brokering, MFA — as first-party code you must maintain and security-audit indefinitely. Not recommended given the scope of what's being asked for. |
| **Managed IDaaS with BYO-enterprise-IdP** (WorkOS, Auth0, Ory Network, Clerk) | Same native + federate-to-customer's-IdP capability, zero infrastructure to operate, faster initial setup | Recurring cost that scales with usage — several of these charge specifically **per SSO connection** (i.e., per enterprise customer you federate), which is exactly the feature being requested here, so cost scales directly with your enterprise customer count. No Keycloak-specific "integrate with Keycloak" story beyond generic OIDC (which does still cover it, just via a paid connection rather than free brokering). |
| **Self-hosted Keycloak (recommended)** | Everything above, natively, with no per-tenant/per-connection fee, full data control | You own the operational surface: a stateful service to run, upgrade, and monitor (or a managed-Keycloak vendor like Phase Two to offload just the ops while keeping the open-source core). |

---

## 6. Open decisions to confirm before implementation

- **Keycloak deployment model:** self-operated (you run it, e.g. in the same docker-compose/infra as `api`/`web`/`db`) vs. a managed-Keycloak vendor (e.g. Phase Two) that runs it for you while you keep full portability.
- **Organizations feature maturity check:** confirm its exact GA/stability status on whichever Keycloak version you actually deploy before relying on it in production — it was still marketed as maturing through the 26.x line as of this review.
- **Realm-per-large-customer threshold:** define the criteria (contract size, compliance requirement, etc.) for when a Department gets a dedicated realm instead of an Organization in the shared realm.
- **Who can create a Department:** today, `Project` creation is intentionally ungated (matching a legacy behavior — see the codebase's own `PHASE-6-NOTES.md`). Decide explicitly whether Department creation should be `super_admin`-only (most likely, given "super admin defines departments" in the ask) versus open, rather than inheriting the Project behavior by default.
- **Local `User` mirror strategy:** exact sync mechanism (webhook vs. lazy-provision-on-first-token) for keeping the numeric `User.id` foreign keys (`Content.createdBy`, etc.) resolvable without Keycloak being the join target for every query.

---

## 7. Slice 1 scope — Keycloak + Department, proof of concept

Goal: prove the target architecture (§3) works end-to-end against a couple of throwaway test projects, with zero risk to real users or real project data, before committing to the 8-step migration plan in §4. Nothing here is meant to survive contact with production — see "Teardown" below.

### 7.1 In scope

**Infrastructure — `docker-compose.yml`**
- New `keycloak` service (`quay.io/keycloak/keycloak`, `start-dev` command — dev mode only, no TLS/hardening needed for this slice), admin bootstrap via `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` env vars in a new `apps/keycloak/.env` (matching the `env_file` convention `api`/`web` already use).
- New `keycloak-db` service (`postgres:16-alpine`, Keycloak's own recommended store) on its own named volume (`keycloak_db_data`) — kept entirely separate from the existing `db`/`db_data` (MySQL, real seeded content). This is the main safety property of the whole slice: Keycloak cannot see or touch real application data because it has no connection to `db` at all.
- Both new services join the existing `internal` network. For this slice, give `keycloak` a direct dev-only host port mapping (e.g. `8081:8080`) so the admin console and login screen are reachable without extending `docker/nginx/gateway.conf` yet — routing Keycloak through `gateway` is a nice-to-have that can happen later, not a Slice 1 blocker.
- A new `docker/keycloak/` directory (mirroring the existing `docker/mysql/init` convention) holding a realm export JSON that seeds: one realm, one Organization (representing a test Department), one OIDC client for the `web` app, and 2 test users with passwords — so `docker compose up` reproduces the whole test setup from a clean volume with no manual clicking.

**Schema — `packages/db/prisma/schema.prisma`**
- New `Department` model (id, name, slug, `keycloakOrgId`) — additive only.
- New nullable `Project.departmentId` FK. Nullable specifically so every existing real `Project` row is left untouched; nothing gets backfilled in this slice (that's step 5 of the §4 plan, explicitly deferred).

**Code — additive, parallel to what exists today**
- `apps/web/src/lib/auth.ts`: add `KeycloakProvider` from `next-auth/providers/keycloak` as a *second* provider alongside the existing `CredentialsProvider` — both available on the login screen simultaneously. No change to the existing double-JWT (`apiToken`) minting logic yet.
- `apps/api/src/auth/`: add a new, separate guard (e.g. `KeycloakAuthGuard`) that verifies Keycloak-issued RS256 tokens via JWKS (`jwks-rsa` or `@nestjs/jwt` with a JWKS key provider). This runs alongside the existing HS256 `JwtAuthGuard`, not instead of it. One small test-only controller endpoint (e.g. `GET /auth/keycloak-whoami`) to prove a Keycloak access token verifies and its Organization/role claims are readable — not wired into any real route yet.
- A short seed/setup script (or the realm-export JSON above) that creates 2 test `Project` rows pointed at the seeded Department, for testing the hierarchy end-to-end.

### 7.2 Explicitly out of scope (for this slice)

- No real `User` password migration or User Storage SPI work (§4 step 2).
- No removal of `CredentialsProvider`, the `apiToken` HS256 flow, or the existing `JwtAuthGuard` — both auth paths keep working, unmodified, throughout.
- No backfilling `departmentId` onto any real/existing `Project` row.
- No changes to the public API's Sanctum-style project tokens (`PersonalAccessToken`) — confirmed out of scope in §3.2a and unaffected here.
- No staging/production Keycloak deployment, no TLS, no HA, no managed-vendor evaluation (§6) — local dev only.
- No UI beyond what's needed to demonstrate login (no "manage members" screen yet — that's §4 step 6).

### 7.3 Acceptance criteria

1. `docker compose up` brings up `keycloak` + `keycloak-db` alongside the existing four services with no changes to their behavior; `docker compose down -v` tears down everything Keycloak-related (including seeded test data) without touching the `db_data` volume.
2. The seeded realm, Organization (Department), OIDC client, and 2 test users exist automatically after a fresh `docker compose up` — no manual admin-console setup required to reproduce the test.
3. A test user can log into the Next.js app via the new Keycloak option on the login screen (existing `CredentialsProvider` login continues to work, untouched, for existing accounts) and reach an authenticated session.
4. `GET /auth/keycloak-whoami` (or equivalent) verifies a Keycloak-issued access token via JWKS and returns the user's Organization (Department) and role claims from the token.
5. The 2 test `Project` rows correctly resolve back to their seeded `Department` via `departmentId`.
6. Existing test suites and the existing login/session flow show zero regressions.

### 7.4 Go/no-go

Approved — Postgres-for-Keycloak / MySQL-for-app split and the direct dev port are confirmed. See §7.5 for what's built.

### 7.5 Implementation status

All of §7.1 is written:

- `docker-compose.yml` — `keycloak` + `keycloak-db` services, `keycloak_db_data` volume.
- `.env.example` (root), `apps/web/.env.example`, `apps/api/.env.example` — new Slice 1 vars, documented inline.
- `packages/db/prisma/schema.prisma` — additive `Department` model + nullable `Project.departmentId`.
- `apps/web/src/lib/auth.ts` — additive `keycloakProvider()`, spread into `providers` alongside the untouched `CredentialsProvider`. Two fixes came out of live testing: `wellKnown` must stay unset (next-auth v4 otherwise does its own OIDC discovery against the *internal* issuer and silently ignores the explicit external `authorization.url`, sending the real browser to an unreachable `http://keycloak:8080/...`); and the manual `issuer` field must be the *external* issuer, not internal — Keycloak stamps every token's `iss` claim from whichever URL the browser used to authorize, not from whichever URL the server later uses to reach the token endpoint.
- `apps/web/src/app/login/page.tsx` + new `apps/web/src/app/register/page.tsx` + shared `apps/web/src/components/auth/AuthShell.tsx` — redesigned per a later request in chat (VeroXM-branded two-column layout, Keycloak promoted to the primary CTA on both screens). `/register`'s form is visual-parity only — there is no self-serve workspace-creation endpoint in `apps/api`, so its submit stays disabled with an inline explanation rather than pretending to create an account.
- `apps/api/src/auth/keycloak-auth.guard.ts` + `keycloak-whoami.controller.ts` — the JWKS verification guard and its one test route, wired into the existing `AuthModule` alongside (not instead of) `JwtAuthGuard`.
- `docker/keycloak/import/mycms-dev-realm.json` — realm/client/test-user import.
- `docker/keycloak/setup-department.mjs` — one-time Admin REST API script that creates the Organization and adds the 2 test users (`npm run keycloak:setup`).
- `docker/keycloak/seed-slice1-test-data.sql` — creates the matching `Department` row + 2 brand-new test `Project` rows; never touches real seeded content.
- `docker/keycloak/seed-slice1-identity-link.sql` — added after live testing surfaced the gap noted below: creates matching `users` rows for the 2 Keycloak test accounts and grants them `admin{id}`/`editor{id}` on *only* the 2 seeded test projects, via the exact same role mechanism every other user goes through.
- `apps/web/src/lib/auth.ts`'s `jwt()` callback — updated again to resolve a Keycloak sign-in to the matching legacy `users` row by email (rather than using Keycloak's own UUID `sub`), so `RolesService` can find real role data for it.
- `docs/DOCKER-DEV-SETUP.md` — a new "Slice 1" section with the exact run order.

**Update — verified live, against a real running stack (not just `tsc`/`oxlint`), via §7.3's acceptance criteria:**

1. **Pass (by construction, not explicitly re-tested with `down -v`).** `keycloak` + `keycloak-db` came up cleanly alongside the existing four services with no changes to their behavior. `keycloak_db_data` is a separate top-level volume from `db_data`, so a `docker compose down -v` cannot touch the app database — this wasn't re-verified by actually running that command, but it's true by construction of the compose file.
2. **Pass, with one caveat.** The realm/client/2 test users import automatically via `--import-realm` on `docker compose up` — no manual admin-console work. The Organization itself, though, still needs one explicit `npm run keycloak:setup` run (an automated script, not manual console work, but not fully "up and done" either) — worth knowing if this slice ever needs to survive a from-scratch `docker compose up` with zero extra steps.
3. **Pass.** A test user (`dept-admin`) logs in via the Keycloak button and reaches a real authenticated NextAuth session — confirmed live, after fixing two real bugs surfaced only by an actual browser round-trip (see "Incidents & fixes" below). Existing `CredentialsProvider` login was independently confirmed still working, untouched, on the redesigned login page.
4. **Pass** (confirmed in the previous session/segment): `GET /auth/keycloak-whoami` verified a live Keycloak access token via JWKS and returned `"organization": ["nami-test-department"]` and `"realm_access": {"roles": ["department-member"]}`.
5. **Pass.** The 2 seeded test `Project` rows (ids 17, 18) resolve back to the seeded `Department` via `departmentId`, confirmed via the seed script's own verification join.
6. **Pass, after a real detour.** The existing `CredentialsProvider` login flow and `/projects` both work with zero regressions from anything in this slice — but getting there required fixing an unrelated, pre-existing problem (see "Incidents & fixes"). No automated test suite was run (none was identified in this repo as part of this pass); this criterion was verified by hand through the actual login + dashboard flows.

**Update — the identity-mapping gap above is now addressed, deliberately minimally.** A Keycloak-authenticated identity has no row in the legacy `users` table and no `model_has_roles` assignments by default, so `RolesService.getUserRoles()` threw once such a session reached any role-gated screen. Per a decision made explicitly in chat (one of three options offered — the others being a separate claims-derived authorization path, or leaving this out of scope entirely), the fix seeds real `users` rows for the 2 Keycloak test accounts and grants them roles through the exact same `model_has_roles` mechanism every other user already goes through — no new authorization code path. `auth.ts`'s `jwt()` callback now resolves a Keycloak sign-in to that matching legacy user by email. Confirmed live: `dept-admin` now reaches `/projects` and sees exactly the 2 seeded test projects, matching its `admin17`/`admin18` grants.

This is still a narrow, test-scoped fix, not a general identity-provisioning design — it only works because the 2 Keycloak test accounts have matching seeded `users` rows. A real Keycloak identity with no matching legacy email still can't reach any role-gated screen, and that broader question (JIT provisioning vs. an admin-driven linking flow vs. deriving authorization directly from Organization/role claims) remains a genuine design decision for whichever slice tackles real (non-test) Keycloak users.

**Incidents & fixes, in case any of this recurs:**

- **`prisma db push` caused real, partially-committed data loss.** `schema.prisma` has pre-existing drift from the live database (ids declared as Prisma `Int` vs. the real `bigint unsigned`; `Project.slug`/`Project.status` declared in the schema file with no real columns backing them at the time). Running `db push` tried to reconcile *all* of that drift at once — not just this slice's additions — and because MySQL DDL isn't transactional, it got partway through (dropping `migrations`/`password_resets`, altering primary keys on several tables) before failing on an incompatible FK cast. Recovered by restoring `db` from `docker/mysql/init/01-mycms_backup_20260910_213100.sql.gz` (explicit user approval obtained first). **Lesson: never run `prisma db push`/`migrate dev` against this database — hand-write narrowly-scoped SQL matching the live schema exactly, the same pattern `packages/db/sql/*.sql` already uses.**
- **The restore itself rolled back schema, not just the Slice 1 change.** `packages/db/sql/0001`–`0005` (project `status`/`slug`, collection `description`/`options`, `collection_versions`, `api_request_logs`) were all written and applied to the live database *before* the incident, per their file timestamps — the restore-from-backup rolled the database back to a point before they'd run, which is what actually caused the post-restore `/projects` 500 (`slug`/`status` don't exist), not anything Slice 1 touched. Re-running all 5 in order fixed it. Worth checking for the same pattern any time a restore-from-backup happens on this database.
- **next-auth v4 silently ignores an explicit `authorization.url` when `wellKnown` is set.** `KeycloakProvider(...)` sets `wellKnown` automatically; `node_modules/next-auth/core/lib/oauth/client.js` does OIDC discovery whenever it's present and uses *only* the discovered endpoints, dropping any explicit override. Fix: explicitly set `wellKnown: undefined` on the spread provider object to force next-auth's manual-`Issuer` code path, which does honor `authorization`/`token`/`userinfo`/`jwks_endpoint` exactly as given.
- **ID token `iss` is stamped from the authorization URL, not the token-endpoint URL.** Even with the browser correctly reaching the external Keycloak URL to authorize, the manual `Issuer`'s `issuer` field still needs to be that *external* URL for next-auth's own `iss` validation to pass — it doesn't matter that the actual token exchange happens server-to-server against the internal hostname.

---

## Sources

- [Keycloak Organizations announcement](https://www.keycloak.org/2024/06/announcement-keycloak-organizations)
- [Keycloak multi-tenancy options — realms vs. Organizations, scale trade-offs](https://phasetwo.io/blog/multi-tenancy-options-keycloak/)
- [Keycloak 26.7.1 release notes](https://www.keycloak.org/2026/08/keycloak-2671-released)
- [Keycloak vs. WorkOS comparison](https://phasetwo.io/keycloak-alternatives/workos/)
