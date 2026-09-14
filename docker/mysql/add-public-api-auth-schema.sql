-- Public API "authenticate as a user" flow (username/password -> access +
-- refresh token) -- see packages/db/prisma/schema.prisma's ProjectApiUser /
-- ProjectApiRefreshToken models for the full design rationale. Brand new
-- tables, no legacy-Laravel equivalent, so there's no existing-column-type
-- drift to navigate the way docker/keycloak/add-department-schema.sql had
-- to -- but the same rule still applies: do NOT run `prisma db push` or
-- `prisma migrate dev` against this database (see docs/DOCKER-DEV-SETUP.md's
-- Slice 1 section for why -- it previously dropped tables and altered
-- primary keys reconciling unrelated drift on schema.prisma's other models).
-- This script only adds two new tables; nothing existing is touched.
--
-- `project_id` is declared bigint unsigned to match the real `projects.id`
-- column (see add-department-schema.sql's own note on this), not the `Int`
-- Prisma declares it as in schema.prisma -- same intentional, pre-existing
-- drift, not something this script introduces.
--
-- Run via (only containers can reach `db` -- no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/mysql/add-public-api-auth-schema.sql

CREATE TABLE `project_api_users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `username` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_api_users_project_id_username_unique` (`project_id`, `username`),
  CONSTRAINT `project_api_users_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_api_refresh_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `api_user_id` bigint unsigned NOT NULL,
  `token_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_api_refresh_tokens_token_hash_unique` (`token_hash`),
  KEY `project_api_refresh_tokens_api_user_id_index` (`api_user_id`),
  CONSTRAINT `project_api_refresh_tokens_api_user_id_foreign` FOREIGN KEY (`api_user_id`)
    REFERENCES `project_api_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify: both new tables exist, nothing existing touched.
SELECT COUNT(*) AS project_api_user_rows FROM project_api_users;
SELECT COUNT(*) AS project_api_refresh_token_rows FROM project_api_refresh_tokens;
