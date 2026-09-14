-- Slice 1 test-data seed (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7).
--
-- Creates exactly one Department row and two brand-new test Projects
-- pointed at it — it never touches any existing row (real seeded content,
-- including the "Nami Website" project used for the Developer Module
-- testing, is untouched by this file). Safe to re-run: the Department
-- insert is `ON DUPLICATE KEY UPDATE` (slug is unique); the two Project
-- inserts use `WHERE NOT EXISTS` instead, since `projects` has no unique
-- key on name/slug to key off (the real table doesn't even have a `slug`
-- or `status` column — see docker/keycloak/add-department-schema.sql's
-- header comment for why this schema has more drift than just Department).
--
-- Prerequisites:
--   1. docker/keycloak/add-department-schema.sql has already run against
--      this database (creates the `departments` table and
--      `projects.department_id` column this file relies on). Do NOT use
--      `prisma db push` for this — see that file's header comment and
--      docs/DOCKER-DEV-SETUP.md's Slice 1 section for why.
--   2. docker/keycloak/setup-department.mjs has already run (so the
--      Keycloak Organization these rows describe actually exists).
--
-- Run it from the host, piped into the `db` container (never against a
-- production database):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/keycloak/seed-slice1-test-data.sql

INSERT INTO departments (name, slug, keycloak_org_id, created_at, updated_at)
VALUES ('Nami Test Department', 'nami-test-department', 'nami-test-department', NOW(), NOW())
ON DUPLICATE KEY UPDATE keycloak_org_id = VALUES(keycloak_org_id), updated_at = NOW();

INSERT INTO projects (uuid, name, description, department_id, created_at, updated_at)
SELECT UUID(), 'Slice 1 Test Project A',
       'Keycloak/Department proof-of-concept test project — safe to delete once Slice 1 is reviewed.',
       d.id, NOW(), NOW()
FROM departments d
WHERE d.slug = 'nami-test-department'
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.name = 'Slice 1 Test Project A');

INSERT INTO projects (uuid, name, description, department_id, created_at, updated_at)
SELECT UUID(), 'Slice 1 Test Project B',
       'Keycloak/Department proof-of-concept test project — safe to delete once Slice 1 is reviewed.',
       d.id, NOW(), NOW()
FROM departments d
WHERE d.slug = 'nami-test-department'
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.name = 'Slice 1 Test Project B');

-- Verify: both test projects should resolve back to the seeded department.
SELECT p.id, p.name, d.name AS department_name, d.keycloak_org_id
FROM projects p
JOIN departments d ON d.id = p.department_id
WHERE p.name IN ('Slice 1 Test Project A', 'Slice 1 Test Project B');
