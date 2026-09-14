-- docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6 — Configurable
-- approval workflows for content publishing, scoped per Department (§6.3:
-- Department-level is the recommended first-slice configuration point;
-- an optional Project-level override is an explicitly deferred
-- fast-follow, not built here). Hand-written, narrowly-scoped migration,
-- same discipline as 0001-0006 — no `prisma db push`.
--
-- Four new tables, all additive:
--   approval_workflows        — one per Department (unique department_id):
--                                the fact that Department has approvals
--                                configured at all.
--   approval_steps            — its ordered, sequential steps (§6.1's
--                                "sequential for a first version" —
--                                enforced by a unique (workflow_id,
--                                step_order) pair, not by app code alone).
--                                Each step names a REQUIRED ROLE KIND
--                                ('admin' | 'department_admin' |
--                                'tenant_admin') rather than a raw
--                                permission string — every one of those
--                                role kinds already holds content:approve
--                                (apps/api/src/authz/permissions.ts), so a
--                                permission alone can't distinguish "an
--                                Admin approves step 1" from "a Department
--                                Admin gives final sign-off at step 2",
--                                which is exactly the "advanced use cases
--                                for approvals like user roles" scenario
--                                this was asked for. A Super Admin can
--                                always act at any step regardless (same
--                                blanket override RolesService.
--                                getPermissionsForProject already applies
--                                everywhere else), so it's deliberately
--                                not one of the choices here.
--   content_approval_requests — one row per submission-for-publish; the
--                                content stays in Draft (publishedAt
--                                stays NULL) until its request reaches
--                                'approved' at the final step.
--   content_approval_actions  — the audit trail every configurable-
--                                approval feature needs: who acted, when,
--                                approve or reject, with what comment.
--
-- content_id/project_id are legacy-table references — per
-- 0004_create_collection_versions.sql's own documented finding (MySQL
-- error 3780, real column type uncertain/likely BIGINT UNSIGNED), NO
-- foreign key constraint is declared against `content` or `projects`
-- here either, matching that same established convention: a plain
-- INT UNSIGNED column, relationship enforced at the Prisma/application
-- layer only. workflow_id/request_id/department_id DO get real FK
-- constraints — they reference brand-new tables (this migration's own,
-- or 0006's `tenants`/`departments`, already confirmed BIGINT UNSIGNED
-- and FK-compatible in 0006).
--
-- Run via (only containers can reach `db` — no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0007_create_approval_workflows.sql

CREATE TABLE `approval_workflows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `department_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Approval workflow',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `approval_workflows_department_id_unique` (`department_id`),
  CONSTRAINT `approval_workflows_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `approval_steps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint unsigned NOT NULL,
  `step_order` int NOT NULL,
  `required_role_kind` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `approval_steps_workflow_id_step_order_unique` (`workflow_id`, `step_order`),
  CONSTRAINT `approval_steps_workflow_id_foreign` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `content_approval_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `content_id` int unsigned NOT NULL,
  `project_id` int unsigned NOT NULL,
  `workflow_id` bigint unsigned NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `current_step_order` int NOT NULL DEFAULT 1,
  `submitted_by` int unsigned NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `decided_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `content_approval_requests_content_id_status_idx` (`content_id`, `status`),
  KEY `content_approval_requests_project_id_status_idx` (`project_id`, `status`),
  CONSTRAINT `content_approval_requests_workflow_id_foreign` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `content_approval_actions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint unsigned NOT NULL,
  `step_order` int NOT NULL,
  `actor_id` int unsigned NOT NULL,
  `action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `content_approval_actions_request_id_idx` (`request_id`),
  CONSTRAINT `content_approval_actions_request_id_foreign` FOREIGN KEY (`request_id`) REFERENCES `content_approval_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify: all four tables exist, empty, no existing data touched.
SELECT COUNT(*) AS workflow_rows FROM approval_workflows;
SELECT COUNT(*) AS step_rows FROM approval_steps;
SELECT COUNT(*) AS request_rows FROM content_approval_requests;
SELECT COUNT(*) AS action_rows FROM content_approval_actions;
