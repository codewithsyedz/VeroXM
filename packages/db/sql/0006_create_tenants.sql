-- docs/RBAC-TENANT-RECOMMENDATION.md §3.1, §8 step 1 — hand-written,
-- narrowly-scoped schema addition, deliberately NOT `prisma db push`
-- (see docker/keycloak/add-department-schema.sql for why: schema.prisma
-- has known, accepted drift from the real database, and `db push` tries
-- to reconcile all of it at once, which is what caused the incident
-- documented in docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7.5).
--
-- This script touches exactly two things: a new `tenants` table, and a
-- new nullable `departments.tenant_id` column + FK. Column types/charset
-- match the `departments`/`projects` tables exactly (bigint unsigned ids,
-- utf8mb4_unicode_ci strings, nullable timestamp columns) per
-- docker/keycloak/add-department-schema.sql's own precedent.
--
-- Run via (only containers can reach `db` — no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0006_create_tenants.sql

CREATE TABLE `tenants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `departments`
  ADD COLUMN `tenant_id` bigint unsigned DEFAULT NULL AFTER `id`,
  ADD KEY `departments_tenant_id_index` (`tenant_id`),
  ADD CONSTRAINT `departments_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

-- Verify: new table exists, no existing row touched (tenant_id is NULL for
-- every pre-existing department, including the Slice 1 test Department —
-- that link happens separately in seed-slice1-tenant-link.sql, not here).
SELECT COUNT(*) AS tenant_rows FROM tenants;
DESCRIBE departments;
