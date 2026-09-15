-- docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- one new table
-- for the read-cache item's "reference integration proving the pattern
-- end-to-end": per-project CDN purge configuration (Cloudflare zone +
-- API token), purged automatically by CdnPurgeProcessor on the same
-- content.published/updated/deleted events the read-cache invalidation
-- listener and the webhook engine already key off of.
--
-- One row per project (UNIQUE project_id, not a one-to-many like
-- webhooks) -- a project has at most one CDN in front of it.
--
-- project_id is INT UNSIGNED with NO foreign key constraint against
-- `projects`, same established convention as 0011_create_webhooks.sql /
-- 0007_create_approval_workflows.sql (see those files' own comments) --
-- enforced at the Prisma/application layer only.
--
-- Run via (only containers can reach `db` -- no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0012_create_cdn_purge_configs.sql
-- Then regenerate the Prisma client and restart api/web, same as every
-- migration in this repo (see 0011's own comment / RBAC-TENANT-RECOMMENDATION.md §11):
--   docker compose exec api npm run db:generate && docker compose exec web npm run db:generate
--   docker compose restart api web

CREATE TABLE `cdn_purge_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `provider` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `api_token` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cdn_purge_configs_project_id_unique` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify: table exists, empty, no existing data touched.
SELECT COUNT(*) AS cdn_purge_config_rows FROM cdn_purge_configs;
