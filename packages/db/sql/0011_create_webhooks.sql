-- docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- the webhook/event
-- engine, item #1, first P0 foundation piece of the advanced-use-cases
-- plan. Hand-written, narrowly-scoped migration, same discipline as
-- 0001-0010 -- no `prisma db push` (see 0006_create_tenants.sql's comment
-- for why).
--
-- Two new tables:
--   webhooks           -- one row per registered subscription: which
--                         project, which URL, which event types, a
--                         per-webhook HMAC signing secret.
--   webhook_deliveries -- an append-only delivery log: one row per
--                         attempt, so a future retry (plan item #3, the
--                         BullMQ queue) shows up as additional rows
--                         rather than overwriting the last attempt's
--                         outcome.
--
-- project_id is INT UNSIGNED with NO foreign key constraint against
-- `projects`, matching the established convention from
-- 0004_create_collection_versions.sql / 0007_create_approval_workflows.sql
-- (that table's exact column type is uncertain enough to have hit MySQL
-- error 3780 previously) -- relationship is enforced at the
-- Prisma/application layer only, same as ContentApprovalRequest.projectId
-- already does. webhook_id DOES get a real FK with ON DELETE CASCADE,
-- since it references this migration's own brand-new `webhooks` table.
--
-- Run via (only containers can reach `db` -- no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0011_create_webhooks.sql
-- Then regenerate the Prisma client and restart api/web (see
-- RBAC-TENANT-RECOMMENDATION.md §11's own reproducible-steps pattern):
--   docker compose exec api npm run db:generate && docker compose exec web npm run db:generate
--   docker compose restart api web

CREATE TABLE `webhooks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `url` varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `secret` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `subscribed_events` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `webhooks_project_id_idx` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `webhook_deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `webhook_id` bigint unsigned NOT NULL,
  `event` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `response_status` int NULL,
  `attempt` int NOT NULL DEFAULT 1,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `webhook_deliveries_webhook_id_idx` (`webhook_id`),
  CONSTRAINT `webhook_deliveries_webhook_id_foreign` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify: both tables exist, empty, no existing data touched.
SELECT COUNT(*) AS webhook_rows FROM webhooks;
SELECT COUNT(*) AS delivery_rows FROM webhook_deliveries;
