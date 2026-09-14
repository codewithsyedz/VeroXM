-- Slice 1 identity-link seed (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7,
-- "Known, explicitly out-of-scope gap" in §7.5 — now addressed per chat).
--
-- Keycloak-authenticated identities have no row in this legacy `users`
-- table and no `model_has_roles` assignments, so RolesService.getUserRoles
-- throws once such a session reaches any role-gated screen. This creates
-- matching `users` rows for the two seeded Keycloak test accounts
-- (dept-admin@example.test, dept-editor@example.test) and grants them
-- access to *only* the 2 seeded Slice 1 test projects, via the exact same
-- admin{id}/editor{id} role mechanism every other user already goes
-- through — no new authorization code path, just matching rows.
--
-- These two users' passwords are an unguessable placeholder — they are
-- never meant to log in via the Credentials form, only via Keycloak (see
-- apps/web/src/lib/auth.ts's jwt() callback, which resolves a Keycloak
-- sign-in to one of these rows by matching email).
--
-- Prerequisites: docker/keycloak/seed-slice1-test-data.sql has already run
-- (the two test Project rows must exist for the role names below to mean
-- anything).
--
-- Run via:
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < docker/keycloak/seed-slice1-identity-link.sql

INSERT INTO users (name, email, password, created_at, updated_at)
VALUES ('Dept Admin (Keycloak)', 'dept-admin@example.test',
        '$2a$10$/oarTYCKOd7osoLpyLyBnOpqDBaHoY4yKmw9MGUBnqzATkj0qQ7Qu', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW();

INSERT INTO users (name, email, password, created_at, updated_at)
VALUES ('Dept Editor (Keycloak)', 'dept-editor@example.test',
        '$2a$10$/oarTYCKOd7osoLpyLyBnOpqDBaHoY4yKmw9MGUBnqzATkj0qQ7Qu', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW();

-- The 2 seeded test projects, matched by name rather than a hardcoded id
-- (ids depend on this environment's own seeding history).
INSERT INTO roles (name, guard_name, created_at, updated_at)
SELECT CONCAT('admin', p.id), 'web', NOW(), NOW()
FROM projects p
WHERE p.name IN ('Slice 1 Test Project A', 'Slice 1 Test Project B')
ON DUPLICATE KEY UPDATE updated_at = NOW();

INSERT INTO roles (name, guard_name, created_at, updated_at)
SELECT CONCAT('editor', p.id), 'web', NOW(), NOW()
FROM projects p
WHERE p.name IN ('Slice 1 Test Project A', 'Slice 1 Test Project B')
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- dept-admin gets admin{id} on both test projects.
INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
SELECT r.id, 'App\\Models\\User', u.id
FROM roles r
JOIN projects p ON r.name = CONCAT('admin', p.id)
JOIN users u ON u.email = 'dept-admin@example.test'
WHERE p.name IN ('Slice 1 Test Project A', 'Slice 1 Test Project B')
  AND r.guard_name = 'web';

-- dept-editor gets editor{id} on both test projects.
INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
SELECT r.id, 'App\\Models\\User', u.id
FROM roles r
JOIN projects p ON r.name = CONCAT('editor', p.id)
JOIN users u ON u.email = 'dept-editor@example.test'
WHERE p.name IN ('Slice 1 Test Project A', 'Slice 1 Test Project B')
  AND r.guard_name = 'web';

-- Verify: each account should show exactly 2 role rows, one per test project.
SELECT u.email, r.name AS role
FROM model_has_roles mhr
JOIN users u ON u.id = mhr.model_id AND mhr.model_type = 'App\\Models\\User'
JOIN roles r ON r.id = mhr.role_id
WHERE u.email IN ('dept-admin@example.test', 'dept-editor@example.test')
ORDER BY u.email, r.name;
