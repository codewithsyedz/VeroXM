-- Tenant-link seed (docs/RBAC-TENANT-RECOMMENDATION.md §3.1, §8 step 1).
--
-- Creates exactly one Tenant row ("VeroXM" — matching how the recommendation
-- doc itself describes VeroXM's own current usage as tenant #1, §3.1) and
-- links the single existing Slice 1 test Department to it. It never touches
-- any other row: no real Department has been backfilled with a tenant_id by
-- this or any other script, matching the same "additive, not backfilled"
-- discipline docker/keycloak/add-department-schema.sql already used for
-- Project.department_id.
--
-- Safe to re-run: both statements are ON DUPLICATE KEY UPDATE / keyed off
-- the unique slug.
--
-- Prerequisites:
--   1. packages/db/sql/0006_create_tenants.sql has already run (creates the
--      `tenants` table and `departments.tenant_id` column this file needs).
--   2. docker/keycloak/seed-slice1-test-data.sql has already run (the
--      'nami-test-department' row must exist for the UPDATE below to do
--      anything).
--
-- Run it from the host, piped into the `db` container (never against a
-- production database):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/keycloak/seed-slice1-tenant-link.sql

INSERT INTO tenants (name, slug, created_at, updated_at)
VALUES ('VeroXM', 'veroxm', NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

UPDATE departments d
JOIN tenants t ON t.slug = 'veroxm'
SET d.tenant_id = t.id
WHERE d.slug = 'nami-test-department';

-- Verify: the test Department should now resolve back to the VeroXM Tenant.
SELECT d.name AS department_name, t.name AS tenant_name, t.slug AS tenant_slug
FROM departments d
JOIN tenants t ON t.id = d.tenant_id
WHERE d.slug = 'nami-test-department';
