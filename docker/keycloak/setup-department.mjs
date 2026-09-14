#!/usr/bin/env node
// Slice 1 one-time setup (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7):
// creates the test Organization ("Department") in the seeded `mycms-dev`
// realm and adds the two test users (from
// docker/keycloak/import/mycms-dev-realm.json) as members, via Keycloak's
// Admin REST API. Run once after `docker compose up` has Keycloaj up —
// safe to re-run, it skips creation if the organization already exists.
//
// Why this is a script and not baked into the realm-export JSON: Keycloak's
// Organizations feature is new enough (docs/IDENTITY-PLATFORM-RECOMMENDATION.md
// §5/§6) that hand-authoring its realm-export shape untested risked getting
// it subtly wrong in a way that could fail the whole realm import silently.
// The Admin REST API used here is stable and well-documented, and this
// script's own console output is how you verify it actually worked.
//
// Usage:
//   KEYCLOAK_ADMIN_PASSWORD=... npm run keycloak:setup
// (KEYCLOAK_ADMIN_PASSWORD must match the root .env value used to bring
// Keycloak up.)

const KEYCLOAK_URL = process.env.KEYCLOAK_URL_EXTERNAL ?? "http://localhost:8081";
const REALM = "mycms-dev";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN ?? "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
const ORG_NAME = "Nami Test Department";
const ORG_ALIAS = "nami-test-department";
const MEMBER_USERNAMES = ["dept-admin", "dept-editor"];

// Slice 1 smoke test only (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7):
// after the organization/members are set up, this script also fetches a
// real access token for TEST_USERNAME so you have something to curl
// GET /auth/keycloak-whoami with, without hand-rolling that yourself.
// mycms-web has directAccessGrantsEnabled: false in the realm import (it's
// meant to be used via the browser login flow only) — this script flips
// that on via the Admin API first. Leaving it on is harmless for a local
// dev-only realm; turn it back off yourself if that bothers you.
const CLIENT_ID = "mycms-web";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "dev-client-secret-change-me";
const TEST_USERNAME = process.env.KEYCLOAK_TEST_USERNAME ?? "dept-admin";
const TEST_PASSWORD = process.env.KEYCLOAK_TEST_PASSWORD ?? "dev-password-change-me";
const WEB_ORIGIN_EXTERNAL = process.env.WEB_ORIGIN_EXTERNAL ?? "http://localhost:8080";

if (!ADMIN_PASSWORD) {
  console.error(
    "Set KEYCLOAK_ADMIN_PASSWORD (the same value you put in the root .env's " +
      "KEYCLOAK_ADMIN_PASSWORD) before running this script, e.g.:\n" +
      "  KEYCLOAK_ADMIN_PASSWORD=your-value npm run keycloak:setup",
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
  const body = await res.json();
  return body.access_token;
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

async function ensureOrganizationsEnabled(token) {
  // The server-level --features=organization flag (docker-compose.yml)
  // only unlocks the capability — each realm still needs its own
  // organizationsEnabled: true. The realm-export JSON now sets that for a
  // *fresh* import, but this realm was already imported before that fix,
  // and re-importing means wiping Keycloak's data — so patch it live
  // instead via the Admin API, which is safe to run repeatedly.
  const res = await adminFetch(token, "");
  if (!res.ok) {
    throw new Error(`Failed to read realm "${REALM}": ${res.status} ${await res.text()}`);
  }
  const realm = await res.json();
  if (realm.organizationsEnabled) {
    return;
  }

  const patchRes = await adminFetch(token, "", {
    method: "PUT",
    body: JSON.stringify({ ...realm, organizationsEnabled: true }),
  });
  if (patchRes.status !== 204) {
    throw new Error(
      `Failed to enable organizations on realm "${REALM}": ${patchRes.status} ${await patchRes.text()}`,
    );
  }
  console.log(`Enabled the Organizations feature on realm "${REALM}" (wasn't on by default — now is).`);
}

async function findOrganizationByAlias(token) {
  // Keycloak's `search` query param matches organization `name`/`domain`,
  // not `alias` — searching by ORG_ALIAS here silently found nothing even
  // though the organization existed, which made this script try (and
  // 409-conflict on) creating a duplicate. List and filter client-side
  // instead, which works regardless of what `search` actually matches on.
  const res = await adminFetch(token, "/organizations");
  if (!res.ok) return undefined;
  const orgs = await res.json();
  return Array.isArray(orgs) ? orgs.find((org) => org.alias === ORG_ALIAS) : undefined;
}

async function createOrganization(token) {
  const res = await adminFetch(token, "/organizations", {
    method: "POST",
    body: JSON.stringify({
      name: ORG_NAME,
      alias: ORG_ALIAS,
      enabled: true,
      domains: [{ name: "nami-test.local", verified: false }],
    }),
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create organization: ${res.status} ${await res.text()}`);
  }
  const location = res.headers.get("location");
  const id = location?.split("/").pop();
  if (!id) {
    throw new Error("Organization was created but no id came back in the Location header");
  }
  return id;
}

async function findUserId(token, username) {
  const res = await adminFetch(token, `/users?username=${encodeURIComponent(username)}&exact=true`);
  if (!res.ok) {
    throw new Error(`Failed to look up user "${username}": ${res.status} ${await res.text()}`);
  }
  const users = await res.json();
  if (!users[0]) {
    throw new Error(
      `User "${username}" not found in realm "${REALM}" — did the realm import run? ` +
        `Check \`docker compose logs keycloak\` for import errors.`,
    );
  }
  return users[0].id;
}

async function addMember(token, orgId, userId, username) {
  const res = await adminFetch(token, `/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify(userId),
  });
  if (res.status === 201 || res.status === 204) {
    console.log(`Added ${username} to "${ORG_ALIAS}".`);
    return;
  }
  const text = await res.text();
  if (text.toLowerCase().includes("already a member")) {
    console.log(`${username} is already a member of "${ORG_ALIAS}" — skipping.`);
    return;
  }
  throw new Error(`Failed to add ${username} (${userId}) to the organization: ${res.status} ${text}`);
}

const token = await getAdminToken();

await ensureOrganizationsEnabled(token);

const existing = await findOrganizationByAlias(token);
let orgId = existing?.id;
if (orgId) {
  console.log(`Organization "${ORG_ALIAS}" already exists (${orgId}) — skipping creation.`);
} else {
  orgId = await createOrganization(token);
  console.log(`Created organization "${ORG_ALIAS}" (id: ${orgId}).`);
}

for (const username of MEMBER_USERNAMES) {
  const userId = await findUserId(token, username);
  await addMember(token, orgId, userId, username);
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

async function ensureDirectAccessGrantsEnabled(token, client) {
  if (client.directAccessGrantsEnabled) {
    return;
  }
  const res = await adminFetch(token, `/clients/${client.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...client, directAccessGrantsEnabled: true }),
  });
  if (res.status !== 204) {
    throw new Error(
      `Failed to enable direct access grants on "${CLIENT_ID}": ${res.status} ${await res.text()}`,
    );
  }
  console.log(`Enabled direct access grants on "${CLIENT_ID}" (was off — that's expected/fine).`);
}

async function ensureOrganizationClientScopeAssigned(token, clientUuid) {
  // Turning on Organizations (ensureOrganizationsEnabled above) doesn't by
  // itself put anything about a user's organization membership into their
  // tokens — Keycloak ships a built-in "organization" client scope for
  // that, but it has to be explicitly assigned to the client. Without
  // this, GET /auth/keycloak-whoami verifies the token fine but never
  // sees an `organization` claim, only realm roles.
  const scopesRes = await adminFetch(token, "/client-scopes");
  if (!scopesRes.ok) {
    throw new Error(`Failed to list client scopes: ${scopesRes.status} ${await scopesRes.text()}`);
  }
  const scopes = await scopesRes.json();
  const orgScope = Array.isArray(scopes) ? scopes.find((s) => s.name === "organization") : undefined;
  if (!orgScope) {
    console.log(
      'No built-in "organization" client scope found on this realm yet — skipping assignment. ' +
        "(This can happen if the realm was imported before Organizations was enabled; Keycloak " +
        "should create this scope once the feature is on. Re-run this script if it's still missing.)",
    );
    return;
  }

  const assignedRes = await adminFetch(token, `/clients/${clientUuid}/default-client-scopes`);
  const assigned = assignedRes.ok ? await assignedRes.json() : [];
  if (Array.isArray(assigned) && assigned.some((s) => s.id === orgScope.id)) {
    return;
  }

  const putRes = await adminFetch(token, `/clients/${clientUuid}/default-client-scopes/${orgScope.id}`, {
    method: "PUT",
  });
  if (putRes.status !== 204) {
    throw new Error(
      `Failed to assign "organization" client scope: ${putRes.status} ${await putRes.text()}`,
    );
  }
  console.log(`Assigned the "organization" client scope to "${CLIENT_ID}" as a default scope.`);
}

async function getTestUserToken() {
  const res = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      // "organization" is assigned as a default client scope above, which
      // should be enough on its own — requesting it explicitly too is
      // belt-and-suspenders in case this Keycloak version's direct-grant
      // flow needs it spelled out even for default scopes.
      scope: "openid email profile organization",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to get a token for "${TEST_USERNAME}": ${res.status} ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body.access_token;
}

const webClient = await findClientByClientId(token);
await ensureDirectAccessGrantsEnabled(token, webClient);
await ensureOrganizationClientScopeAssigned(token, webClient.id);
const userAccessToken = await getTestUserToken();

console.log(
  "\nDone. Next: run docker/keycloak/seed-slice1-test-data.sql inside the `db` " +
    "container to create the matching Department row and 2 test Projects — " +
    "see that file's header comment for the exact command.",
);

// Call the whoami endpoint directly (this script runs on your machine, so
// it can reach the published gateway port itself) instead of printing a
// curl command to copy — a token this long is easy to mangle by hand.
console.log(`\nCalling GET ${WEB_ORIGIN_EXTERNAL}/auth/keycloak-whoami as "${TEST_USERNAME}"...`);
try {
  const whoamiRes = await fetch(`${WEB_ORIGIN_EXTERNAL}/auth/keycloak-whoami`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  const whoamiBody = await whoamiRes.text();
  console.log(`Status: ${whoamiRes.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(whoamiBody), null, 2));
  } catch {
    console.log(whoamiBody);
  }
} catch (err) {
  console.log(
    `Could not reach ${WEB_ORIGIN_EXTERNAL} (${err instanceof Error ? err.message : err}) — ` +
      "is the gateway container up?",
  );
}
