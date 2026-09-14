-- docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7: audited user
-- impersonation. New table, no legacy equivalent -- the legacy admin has
-- no impersonation feature at all.
--
-- actor_id/target_user_id are INT UNSIGNED to match `users.id` (see
-- 0004_create_collection_versions.sql's comment for why a signed/
-- unsigned mismatch matters), but deliberately have NO foreign key to
-- `users` -- same "log rows outlive the thing they reference" reasoning
-- as api_request_logs.project_id/token_id in
-- 0005_create_api_request_logs.sql: an audit trail entry must survive a
-- user account being deleted, not be blocked by or cascade with it.
--
-- started_at/ended_at bracket one impersonation session: a row is
-- inserted with ended_at NULL when impersonation starts
-- (ImpersonationService.start) and stamped with ended_at when it ends
-- (ImpersonationService.end) -- matching how the frontend's "End
-- impersonation" control works (see apps/web/.../TopNav.tsx).

CREATE TABLE `impersonation_audit_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `actor_id` INT UNSIGNED NOT NULL,
  `target_user_id` INT UNSIGNED NOT NULL,
  `reason` VARCHAR(500) NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `impersonation_audit_log_actor_id_idx` (`actor_id`),
  KEY `impersonation_audit_log_target_user_id_idx` (`target_user_id`),
  KEY `impersonation_audit_log_started_at_idx` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT COUNT(*) AS impersonation_audit_log_rows FROM `impersonation_audit_log`;
