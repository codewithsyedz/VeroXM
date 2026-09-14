-- Adds the "slug" column the Create/Edit Project modals need (a
-- URL-friendly project identifier, set once at creation and immutable
-- after — same story as 0001_add_project_status.sql: this schema is
-- introspected from the live database rather than Prisma-Migrate-managed,
-- so it's applied by hand here.
--
-- Existing rows get NULL (there's no reliable, collision-free way to
-- backfill a slug from `name` for projects that predate this column), so
-- the column is nullable; only newly-created projects populate it.
--
-- Apply with:
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0002_add_project_slug.sql
--   docker compose exec api npx prisma generate --schema=packages/db/prisma/schema.prisma
--   docker compose exec web npx prisma generate --schema=packages/db/prisma/schema.prisma
--   docker compose restart api web

ALTER TABLE `projects`
  ADD COLUMN `slug` VARCHAR(80) NULL AFTER `name`,
  ADD UNIQUE INDEX `projects_slug_unique` (`slug`);
