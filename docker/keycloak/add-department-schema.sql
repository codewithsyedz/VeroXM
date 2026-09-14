-- Slice 1 (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7): hand-written,
-- narrowly-scoped schema addition — deliberately NOT `prisma db push`.
-- `schema.prisma` has pre-existing drift from the real database that
-- predates this change (id columns declared as Prisma `Int` vs the real
-- `bigint unsigned`; `Project.slug`/`Project.status` declared in the
-- schema file but not present as real columns at all) — running
-- `db push` tries to reconcile ALL of that drift, not just new
-- additions, which is exactly what caused an incident earlier in this
-- slice (dropped the `migrations`/`password_resets` tables and altered
-- primary keys on most other tables before failing partway through).
--
-- This script touches exactly two things: a new `departments` table, and
-- a new nullable `projects.department_id` column + FK. Nothing else.
-- Column types/charset match the real `projects` table exactly, per
-- `SHOW CREATE TABLE projects` run against the restored database.
--
-- Run via (only containers can reach `db` — no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/keycloak/add-department-schema.sql

CREATE TABLE `departments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `keycloak_org_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `departments_slug_unique` (`slug`),
  UNIQUE KEY `departments_keycloak_org_id_unique` (`keycloak_org_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `projects`
  ADD COLUMN `department_id` bigint unsigned DEFAULT NULL AFTER `disk`,
  ADD KEY `projects_department_id_index` (`department_id`),
  ADD CONSTRAINT `projects_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`);

-- Verify: both new schema objects exist, no existing row touched.
SELECT COUNT(*) AS department_rows FROM departments;
SELECT COUNT(*) AS projects_rows FROM projects;
DESCRIBE projects;
