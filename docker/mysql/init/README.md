# `db` container: seeding it with real data

Files in this directory run automatically, in filename order, the *first*
time the `db_data` volume is created (the official MySQL image's own
behavior — it never re-runs them against an existing volume). Use this to
load a real copy of production data into your local `db` container:

1. Export a dump from the real database (from wherever you can already
   reach it — a bastion host, a staging replica, whatever your team
   normally uses). For example:
   ```
   mysqldump --single-transaction --routines --triggers \
     -h <real-host> -u <user> -p mycms > docker/mysql/init/01-dump.sql
   ```
2. Drop the resulting `.sql` (or `.sql.gz` — the entrypoint script
   auto-decompresses gzipped dumps) file in this directory.
3. `docker compose up` — on first run, after the `db` container creates the
   `MYSQL_DATABASE` from `.env`, it imports every `.sql`/`.sql.gz`/`.sh`
   file here in order.

**This directory's dump files are gitignored on purpose** (see the root
`.gitignore`) — they'll contain real data from your one live client
project, and that must never end up in the repo's git history. Treat the
file itself like a credential: delete it once you're done with it if you
don't need it lying around locally, and don't email/Slack it around
outside whatever channel you'd normally use for a production data export.

To start over with a clean/empty schema instead (Prisma migrations only,
no real data), just don't put anything here and run
`npm run db:generate` / `prisma migrate dev` against the running container
instead.

To re-import after changing the dump file, you have to drop the existing
volume first (the init scripts only run once per volume):
```
docker compose down
docker volume rm mycms-nextjs-nodejs_db_data
docker compose up
```
