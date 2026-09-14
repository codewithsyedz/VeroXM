-- Adds the "status" column the Live/Staging feature needs.
--
-- This schema is introspected from the live MySQL database (`prisma db
-- pull`, see packages/db/package.json) rather than managed by Prisma
-- Migrate, and Laravel owns the `projects` table too — so this column is
-- applied by hand, here, instead of through `prisma migrate`. It's a new
-- nullable-by-default, additive column: Laravel's own queries don't
-- reference it and keep working unchanged.
--
-- Apply against your local dev database with:
--   docker compose exec db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0001_add_project_status.sql
--
-- After applying, run `npm run generate --workspace=@mycms/db` (or your
-- usual prisma generate step) so the Prisma client picks up the new field
-- — schema.prisma already declares it (see the Project model).

ALTER TABLE `projects`
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'live' AFTER `disk`;
