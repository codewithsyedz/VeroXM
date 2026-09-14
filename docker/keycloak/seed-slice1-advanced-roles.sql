-- Advanced-role verification seed (docs/RBAC-TENANT-RECOMMENDATION.md
-- §5.1, §5.5, §8 step 1-2) — my own recommended next step after the
-- Tenant + permission-model foundation was verified for the existing
-- admin{id}/editor{id} project-level branches only. This exercises the
-- two branches that hadn't been touched at all yet: tenant_admin{id} and
-- department_admin{id}, including the two-hop project -> department ->
-- tenant lookup in RolesService.getPermissionsForProjectId (previously
-- only the one-hop project -> department lookup for departmentId ran,
-- and its result was never actually matched against any role, since no
-- tenant_admin/department_admin role existed anywhere yet).
--
-- Same discipline as every other Slice 1 seed file: test-scoped only,
-- idempotent, no real user or role touched.
--
--   * dept-admin@example.test keeps its existing admin{17}/admin{18}
--     grants and additionally gets department_admin{<Nami Test
--     Department's id>} — expected new permissions on top of the Admin
--     bundle: members:manage, workflow:configure (the two department_admin
--     grants admin doesn't already have — see permissions.ts).
--   * dept-editor@example.test keeps its existing editor{17}/editor{18}
--     grants and additionally gets tenant_admin{<VeroXM tenant's id>} —
--     expected result: the full Tenant Admin bundle (a superset of
--     Editor's), since content:approve/api-tokens:manage/members:manage/
--     workflow:configure/department:manage/impersonate:user are all new
--     relative to what Editor alone grants.
--
-- Prerequisites: packages/db/sql/0006_create_tenants.sql and
-- docker/keycloak/seed-slice1-tenant-link.sql have both already run.
--
-- Run via:
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/keycloak/seed-slice1-advanced-roles.sql

INSERT INTO roles (name, guard_name, created_at, updated_at)
SELECT CONCAT('department_admin', d.id), 'web', NOW(), NOW()
FROM departments d
WHERE d.slug = 'nami-test-department'
ON DUPLICATE KEY UPDATE updated_at = NOW();

INSERT INTO roles (name, guard_name, created_at, updated_at)
SELECT CONCAT('tenant_admin', t.id), 'web', NOW(), NOW()
FROM tenants t
WHERE t.slug = 'veroxm'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- dept-admin additionally gets department_admin on the Nami Test Department.
INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
SELECT r.id, 'App\\Models\\User', u.id
FROM roles r
JOIN departments d ON r.name = CONCAT('department_admin', d.id)
JOIN users u ON u.email = 'dept-admin@example.test'
WHERE d.slug = 'nami-test-department'
  AND r.guard_name = 'web';

-- dept-editor additionally gets tenant_admin on the VeroXM tenant.
INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
SELECT r.id, 'App\\Models\\User', u.id
FROM roles r
JOIN tenants t ON r.name = CONCAT('tenant_admin', t.id)
JOIN users u ON u.email = 'dept-editor@example.test'
WHERE t.slug = 'veroxm'
  AND r.guard_name = 'web';

-- Verify: dept-admin should now show 3 role rows (admin17, admin18,
-- department_adminN); dept-editor should now show 3 (editor17, editor18,
-- tenant_adminN).
SELECT u.email, r.name AS role
FROM model_has_roles mhr
JOIN users u ON u.id = mhr.model_id AND mhr.model_type = 'App\\Models\\User'
JOIN roles r ON r.id = mhr.role_id
WHERE u.email IN ('dept-admin@example.test', 'dept-editor@example.test')
ORDER BY u.email, r.name;
