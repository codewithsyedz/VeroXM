# Local Docker development setup

This is a docker-compose stack for running the new stack locally: the
NestJS `api`, the Next.js `web` app, and a MySQL `db`, each in their own
container, seeded with a real copy of production data, with an nginx
`gateway` container as the only thing reachable from your machine. It's a
convenience for local development — it is **not** the production
deployment. The real strangler-fig cutover routing lives in
`infra/nginx.conf.sample` and is covered in `docs/PHASE-6-NOTES.md`; that
config also routes to the legacy Laravel app, which this compose stack
deliberately does not touch or contain.

## Why it's shaped this way

- **`db` has no published port.** It's reachable only from `api` and `web`
  over the compose-internal network. Nothing on your host, and nothing on
  the public internet, can open a connection straight to it — every path
  in goes through `gateway`, mirroring the architecture you'd want in a
  real deployment (a database should never be directly internet-facing).
- **`gateway` is the only published port** (`http://localhost:8080`). It
  routes `/api/` and `/public/` to the NestJS container and everything else
  to the Next.js container — see `docker/nginx/gateway.conf`.
- **`api` and `web` run their dev-mode watchers**, not production builds
  (`nest start --watch` / `next dev`), with the repo bind-mounted in so
  edits reload live. This matches the "local/dev environment" scope this
  was built for. A real production image would need a different Dockerfile
  entirely: a compiled build (`nest build` / `next build` with
  `output: "standalone"`), a multi-stage image without dev tooling, and —
  importantly — `packages/db` would need its own compiled output, since
  right now its `package.json` `main` field points at raw `index.ts`, which
  only works because the dev watchers (`nest start`, `next dev`) transpile
  on the fly. `node dist/main.js` against a real production build does not
  have that luxury. Flagging this now since it'll matter whenever an actual
  production image gets built, but it's out of scope for this local setup.

## First-time setup

1. Copy the env file templates if you haven't already:
   ```
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```
   Fill in real secrets in `apps/api/.env` / `apps/web/.env` as usual
   (`API_JWT_SECRET` must match between the two). The root `.env` only
   holds the `db` container's credentials (`MYSQL_*`) — pick real passwords
   there too, don't leave the placeholders.

2. **To seed `db` with a real copy of production data**, see
   `docker/mysql/init/README.md` — short version: export a `mysqldump`,
   drop it in `docker/mysql/init/`, and it auto-imports the first time the
   volume is created. That directory's dump files are gitignored — this is
   real client data and must never reach git history.

3. Bring the stack up:
   ```
   docker compose up --build
   ```
   First run installs dependencies and runs `prisma generate` inside each
   image (needs normal internet access to `binaries.prisma.sh` — this
   works from a normal dev machine even though it was blocked in the
   sandboxed session that built most of this migration).

4. Open `http://localhost:8080`. That's the dashboard/marketing site
   (routed to `web`) and the public content API (routed to `api`), both
   through the same gateway port — matching how a browser or an external
   API caller would actually reach either one in production.

## Day to day

- `docker compose up` — bring the stack back up; `db_data` persists across
  restarts (the import in step 2 only runs the first time that volume is
  created).
- `docker compose logs -f api` / `web` / `db` / `gateway` — tail one
  service's logs.
- `docker compose down` — stop everything, keep the data volume.
- `docker compose down -v` — stop everything **and delete `db_data`** (the
  next `up` re-imports whatever's currently in `docker/mysql/init/`).
- Editing code on the host reloads live in both `api` and `web` (bind
  mount + each app's own watch mode) — no rebuild needed for source
  changes.
- **Adding a dependency (a `package.json` change) needs more than a
  rebuild.** `api_node_modules`/`web_node_modules` are named volumes,
  which Docker only ever seeds from the image the *first* time each is
  created — a later `docker compose up --build` correctly bakes the new
  dependency into the image, but the running container keeps mounting
  the old volume's contents over it, so the new package silently isn't
  there. Drop the specific service's volume too (never `db_data` —
  that's your imported data):
  ```
  docker compose rm -sf web       # or api
  docker volume rm mycms-nextjs-nodejs_web_node_modules
  docker compose up -d --build web
  ```
  A Dockerfile change alone (no new dependency) just needs the plain
  rebuild, no volume drop.
- **Restarting `web` or `api` on their own can 502 through the gateway.**
  `gateway.conf` routes to `web`/`api` by re-resolving their names through
  Docker's embedded DNS on every request (`resolver 127.0.0.11`), so this
  self-heals within a few seconds on its own — but if you hit a 502 (nginx
  logs will show `connect() failed ... Connection refused` to an internal
  `172.x` address) right after a restart, that's what's happening: the
  container came back with a new IP and nginx hasn't re-resolved it yet.
  Reload the page in a moment, or force it immediately with
  `docker compose restart gateway`.

## Security notes

- Real production/client data lives in the `db_data` volume once you've
  imported a dump — treat your local machine accordingly (disk encryption,
  don't leave the dump `.sql` file lying around after importing it).
- The root `.env` and both apps' `.env` files hold real secrets once
  filled in; all three are gitignored, but double-check `git status` if
  something looks off before committing.
- This setup does not change anything about the still-open pre-cutover
  checklist in `docs/PHASE-6-NOTES.md` (password/token/role verification
  against real data, etc.) — if anything, a local copy of real data is
  exactly what makes several of those checklist items finally testable
  end-to-end, without touching production traffic.

## Slice 1: Keycloak + Department (proof of concept)

Full design/rationale: `docs/IDENTITY-PLATFORM-RECOMMENDATION.md` §7. Short
version — this adds a `keycloak` + `keycloak-db` service pair alongside the
four above, additive only: nothing about `db`/`api`/`web`/`gateway`
changes, and the existing Credentials login keeps working throughout.

1. Add the Keycloak vars to your root `.env` (see `.env.example` — pick
   real passwords, don't leave the placeholders) and the
   `KEYCLOAK_CLIENT_ID`/`KEYCLOAK_CLIENT_SECRET`/`KEYCLOAK_ISSUER_*`/
   `NEXT_PUBLIC_KEYCLOAK_ENABLED` vars to `apps/web/.env`, plus
   `KEYCLOAK_ISSUER_INTERNAL` to `apps/api/.env` (see each file's
   `.env.example`).

2. Apply the schema change (new `Department` table, new nullable
   `projects.department_id`) to your dev database. **Do not use
   `prisma db push` or `prisma migrate dev` for this** — `schema.prisma`
   has pre-existing drift from the real database (id columns declared as
   Prisma `Int` vs the real `bigint unsigned`; `Project.slug`/
   `Project.status` declared in the schema file but not present as real
   columns at all), and either command tries to reconcile the *entire*
   schema against the database, not just new additions. Running `db push`
   here once already caused real damage (dropped the `migrations`/
   `password_resets` tables and altered primary keys on most other tables
   before failing partway through on a foreign-key error — recovered from
   the `docker/mysql/init` backup). Use the hand-written, narrowly-scoped
   SQL instead, which touches only the two new things and matches the real
   `projects` table's exact column types:
   ```
   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
     < docker/keycloak/add-department-schema.sql
   ```

3. `docker compose up --build` — brings up `keycloak` (admin console +
   login at `http://localhost:8081`, dev-only direct port, deliberately not
   routed through `gateway` yet) and `keycloak-db` alongside the existing
   four services. The realm, client, and 2 test users
   (`docker/keycloak/import/mycms-dev-realm.json`) import automatically on
   first boot.

4. Create the test Organization ("Department") and add the 2 test users to
   it — a one-time script against Keycloak's Admin REST API, not manual
   admin-console clicking:
   ```
   KEYCLOAK_ADMIN_PASSWORD=<your root .env value> npm run keycloak:setup
   ```

5. Seed the matching `Department` row and 2 test `Project` rows (brand new
   rows — this never touches real seeded content, including the "Nami
   Website" project):
   ```
   docker compose exec -T db mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
     < docker/keycloak/seed-slice1-test-data.sql
   ```

6. Verify: log into `http://localhost:8080/login` via the new "Sign in
   with Keycloak" button (`dept-admin` / `dev-password-change-me`, or
   whatever you changed those to in the realm import), and check
   `GET http://localhost:8080/api/auth/keycloak-whoami` with that session's
   token returns the Organization/role claims. See §7.3 in the
   recommendation doc for the full acceptance criteria.

Explicitly out of scope for this slice (§7.2): no real user/password
migration, no removal of the existing Credentials/apiToken flow, no
backfilling `departmentId` on any real Project, no staging/production
Keycloak. Tear it all down without touching `db_data`:
`docker compose down -v` removes `keycloak_db_data` but leaves the real
MySQL volume alone.

## Brand assets and theme color

The favicon (`apps/web/src/app/favicon.ico`, `icon.png`, `apple-icon.png` — Next's file-convention icons, no code wiring needed) and the header/footer logo (`apps/web/public/brand/veroxm-mark*.png`) are generated from the actual VeroXM mark, not placeholders.

The dashboard's whole color palette was re-derived from that mark's real gradient (sampled directly from the image: indigo `#343fd3` at the top fading to azure `#0d70fe` at the bottom) rather than eyeballed. `--db-sapphire` (button fills) and `--db-sapphire-soft` (links, active states, badges, status dot) in `globals.css` carry the two ends of that gradient; every neutral (background, surfaces, borders, muted text) was hue-shifted from the old green theme to a matching blue-violet cast at the same lightness/alpha, so contrast and hierarchy are unchanged — only the hue is. If the mark ever changes, re-sampling it and updating those two custom properties (plus the handful of literal Tailwind arbitrary-value colors listed in this file's git history) is the whole job — the design in `.dashboard-theme` doesn't need to change shape.
