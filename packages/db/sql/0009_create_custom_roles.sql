-- docs/RBAC-TENANT-RECOMMENDATION.md section 5.6, section 8 step 2
-- (follow-up): custom, composable roles. A Tenant Admin or Department
-- Admin can compose a named role from a checklist of permissions (see
-- apps/api/src/authz/permissions.ts's CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS
-- for the deliberately narrower assignable subset -- excludes
-- tenant:manage/department:manage/roles:configure/impersonate:user/
-- workflow:configure, since letting a custom role carry any of those
-- would let whoever configures custom roles mint themselves or anyone
-- else an equivalent-or-greater-privileged role without ever holding
-- tenant_admin{id}/department_admin{id} directly) scoped to one
-- Department. The concrete motivating case (per the doc) is a "Content
-- Approver" who holds content:approve/content:read without
-- content:write or members:manage.
--
-- department_id gets a REAL foreign key to departments.id -- same
-- bigint unsigned / FK-safe precedent already established for
-- approval_workflows.department_id in 0007 (this is a brand-new table
-- referencing an existing FK-compatible column, not the "no FK to
-- legacy tables" situation that applies to content/project ids
-- elsewhere in this file).
--
-- permissions is stored as a JSON-encoded array of Permission strings in
-- a TEXT column (not MySQL's native JSON type, matching how this schema
-- avoids native JSON support questions elsewhere) -- validated against
-- the assignable-permission checklist in CustomRolesService, not by a DB
-- constraint.
--
-- Granting a custom role to a user reuses the EXISTING roles/
-- model_has_roles mechanism unchanged -- a role named `custom_role{id}`
-- (matching the admin{id}/editor{id}/department_admin{id}/
-- tenant_admin{id} naming convention already established), rather than
-- a new grant-storage table. This table only holds the role's own
-- definition (name + permission set + Department scope).
--
-- Run via:
--   docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0009_create_custom_roles.sql

CREATE TABLE `custom_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `department_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `permissions` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `custom_roles_department_id_name_unique` (`department_id`, `name`),
  CONSTRAINT `custom_roles_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify: table exists, empty, no existing data touched.
SELECT COUNT(*) AS custom_roles_rows FROM `custom_roles`;
