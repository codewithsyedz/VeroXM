-- Phase 7: Developer module — API Analytics.
-- New table, no legacy equivalent (the legacy admin never logged public API
-- traffic at all). Every request through /public/v1 and /public/v2 is
-- recorded here by ApiRequestLogMiddleware so the API Analytics dashboard
-- reads real data instead of anything hardcoded. See docs/PHASE-6-NOTES.md
-- ("Developer module" section).
--
-- project_id/token_id are INT UNSIGNED to match `projects`/
-- `personal_access_tokens`' own id columns (see
-- 0004_create_collection_versions.sql's comment for why this matters — a
-- signed/unsigned mismatch is a hard MySQL 8 foreign-key error). No FK
-- constraint is declared here on purpose: a log row should survive its
-- project or token being deleted, not be blocked by or cascade with it.

CREATE TABLE `api_request_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NULL,
  `token_id` INT UNSIGNED NULL,
  `api_version` VARCHAR(8) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `path` VARCHAR(500) NOT NULL,
  `endpoint` VARCHAR(500) NOT NULL,
  `status_code` SMALLINT NOT NULL,
  `duration_ms` INT NOT NULL,
  `ip` VARCHAR(45) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `api_request_logs_project_id_created_at_idx` (`project_id`, `created_at`),
  KEY `api_request_logs_endpoint_idx` (`endpoint`(191)),
  KEY `api_request_logs_ip_idx` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
