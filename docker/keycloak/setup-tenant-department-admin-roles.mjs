#!/usr/bin/env node
// docs/RBAC-TENANT-RECOMMENDATION.md §8 step 4 / §11.7 — Keycloak claims
// wiring for Tenant Admin / Department Admin. Companion to
// docker/keycloak/setup-department.mjs (which creates the Organization and
// adds members) — this script creates the two REALM ROLES those roles are
// keyed on and assigns them to the same two test users that already hold
// the equivalent legacy model_has_roles grant, so you can compare the two
// paths side by side: dept-admin already holds department_admin1 (legacy
// table, via docker/keycloak/seed-slice1-advanced-roles.sql) and will now
// ALSO hold it via a Keycloak realm role; dept-editor already holds
// tenant_admin1 the same way. apps/web/src/lib/auth.ts's
// syncKeycloakRoleClaims() is what turns "this Keycloak token's
// realm_access.roles includes department_admin1" into an actual
// model_has_roles row on next login — see that function's own comment for
// why this is additive-only (never revokes), and why the role names below
// mirror the legacy model_has_roles convention exactly rather than
// inventing a different shape.
//
// Safe to re-run — every step here checks for existing state first.
//
// Usage:
//   KEYCLOAK_ADMIN_PASSWORD=... npm run keycloak:setup-admin-roles

const KEYCLOAK_URL = process.env.KEYCLOAK_URL_EXTERNAL ?? "http://localhost:8081";
const REALM = "mycms-dev";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN ?? "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
const CLIENT_ID = "mycms-web";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "dev-client-secret-change-me";

// { username, password, roleName } — mirrors each user's existing legacy
// grant from docker/keycloak/seed-slice1-advanced-roles.sql exactly, so the
// two paths (legacy table vs. Keycloak claim) land on the identical role.
const ASSIGNMENTS = [
  {
    username: "dept-admin",
    password: process.env.KEYCLOAK_DEPT_ADMIN_PASSWORD ?? "dev-password-change-me",
    roleName: "department_admin1",
  },
  {
    username: "dept-editor",
    password: process.env.KEYCLOAK_DEPT_EDITOR_PASSWORD ?? "dev-password-change-me",
    roleName: "tenant_admin1",
  },
];

if (!ADMIN_PASSWORD) {
  console.error(
    "Set KEYCLOAK_ADMIN_PASSWORD (the same value you put in the root .env's " +
      "KEYCLOAK_ADMIN_PASSWORD) before running this script, e.g.:\n" +
      "  KEYCLOAK_ADMIN_PASSWORD=your-value npm run keycloak:setup-admin-roles",
  );
  process.exit(1);
}

async function getAdminToken() {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get admin token: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function adminFetch(token, path, options = {}) {
  return fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function ensureRealmRole(token, roleName) {
  const getRes = await adminFetch(token, `/roles/${encodeURIComponent(roleName)}`);
  if (getRes.ok) {
    return getRes.json();
  }
  if (getRes.status !== 404) {
    throw new Error(`Failed to look up realm role "${roleName}": ${getRes.status} ${await getRes.text()}`);
  }

  const createRes = await adminFetch(token, "/roles", {
    method: "POST",
    body: JSON.stringify({ name: roleName }),
  });
  if (createRes.status !== 201) {
    throw new Error(`Failed to create realm role "${roleName}": ${createRes.status} ${await createRes.text()}`);
  }
  console.log(`Created realm role "${roleName}".`);

  const refetchRes = await adminFetch(token, `/roles/${encodeURIComponent(roleName)}`);
  if (!refetchRes.ok) {
    throw new Error(`Created "${roleName}" but couldn't re-fetch it: ${refetchRes.status}`);
  }
  return refetchRes.json();
}

async function findUserId(token, username) {
  const res = await adminFetch(token, `/users?username=${encodeURIComponent(username)}&exact=true`);
  if (!res.ok) {
    throw new Error(`Failed to look up user "${username}": ${res.status} ${await res.text()}`);
  }
  const users = await res.json();
  if (!users[0]) {
    throw new Error(`User "${username}" not found in realm "${REALM}" — did the realm import run?`);
  }
  return users[0].id;
}

async function assignRealmRole(token, userId, username, role) {
  const existingRes = await adminFetch(token, `/users/${userId}/role-mappings/realm`);
  const existing = existingRes.ok ? await existingRes.json() : [];
  if (Array.isArray(existing) && existing.some((r) => r.id === role.id)) {
    console.log(`${username} already has realm role "${role.name}" — skipping.`);
    return;
  }

  const res = await adminFetch(token, `/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (res.status !== 204) {
    throw new Error(`Failed to assign "${role.name}" to ${username}: ${res.status} ${await res.text()}`);
  }
  console.log(`Assigned realm role "${role.name}" to ${username}.`);
}

// Same defensive pattern setup-department.mjs's ensureOrganizationClientScopeAssigned
// already established for the "organization" scope: don't assume a scope
// is wired up, check and fix it. "roles" is one of Keycloak's built-in
// default client scopes for a freshly-created client, so this is normally
// a no-op — but the realm-export JSON doesn't pin defaultClientScopes
// explicitly (checked directly), so this confirms it rather than assumes it.
async function ensureRolesClientScopeAssigned(token, clientUuid) {
  const scopesRes = await adminFetch(token, "/client-scopes");
  if (!scopesRes.ok) {
    throw new Error(`Failed to list client scopes: ${scopesRes.status} ${await scopesRes.text()}`);
  }
  const scopes = await scopesRes.json();
  const rolesScope = Array.isArray(scopes) ? scopes.find((s) => s.name === "roles") : undefined;
  if (!rolesScope) {
    console.log('No built-in "roles" client scope found on this realm — skipping assignment check.');
    return;
  }

  const assignedRes = await adminFetch(token, `/clients/${clientUuid}/default-client-scopes`);
  const assigned = assignedRes.ok ? await assignedRes.json() : [];
  if (Array.isArray(assigned) && assigned.some((s) => s.id === rolesScope.id)) {
    return;
  }

  const putRes = await adminFetch(token, `/clients/${clientUuid}/default-client-scopes/${rolesScope.id}`, {
    method: "PUT",
  });
  if (putRes.status !== 204) {
    throw new Error(`Failed to assign "roles" client scope: ${putRes.status} ${await putRes.text()}`);
  }
  console.log(`Assigned the "roles" client scope to "${CLIENT_ID}" as a default scope (was missing).`);
}

async function findClientByClientId(token) {
  const res = await adminFetch(token, `/clients?clientId=${encodeURIComponent(CLIENT_ID)}`);
  if (!res.ok) {
    throw new Error(`Failed to look up client "${CLIENT_ID}": ${res.status} ${await res.text()}`);
  }
  const clients = await res.json();
  if (!clients[0]) {
    throw new Error(`Client "${CLIENT_ID}" not found — did the realm import run?`);
  }
  return clients[0];
}

async function getUserToken(username, password) {
  const res = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username,
      password,
      scope: "openid email profile",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get a token for "${username}": ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const token = await getAdminToken();

const webClient = await findClientByClientId(token);
await ensureRolesClientScopeAssigned(token, webClient.id);

for (const { username, password, roleName } of ASSIGNMENTS) {
  const role = await ensureRealmRole(token, roleName);
  const userId = await findUserId(token, username);
  await assignRealmRole(token, userId, username, role);
}

console.log(
  "\nDone. Next: sign in as dept-admin or dept-editor via Keycloak in the dashboard " +
    "(not the Credentials form) — apps/web/src/lib/auth.ts's syncKeycloakRoleClaims() " +
    "runs on that login and creates the matching model_has_roles row automatically.",
);

// Direct-grant smoke test (mirrors setup-department.mjs's own final check):
// confirms the realm role actually shows up in realm_access.roles before
// you go test the real login flow, so a config gap here surfaces
// immediately instead of as a confusing "sync didn't do anything" later.
console.log("\nVerifying realm_access.roles on a fresh token for each user...");
for (const { username, password, roleName } of ASSIGNMENTS) {
  try {
    const userToken = await getUserToken(username, password);
    const claims = decodeJwtPayload(userToken);
    const roles = claims.realm_access?.roles ?? [];
    const has = roles.includes(roleName);
    console.log(`${username}: realm_access.roles = [${roles.join(", ")}] — expected "${roleName}": ${has ? "present" : "MISSING"}`);
  } catch (err) {
    console.log(`${username}: could not verify (${err instanceof Error ? err.message : err})`);
  }
}
