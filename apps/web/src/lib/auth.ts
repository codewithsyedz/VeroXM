import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import KeycloakProvider from "next-auth/providers/keycloak";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@mycms/db";

// Slice 1 (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7): a second, additive
// login option alongside Credentials below — unset KEYCLOAK_CLIENT_ID/
// KEYCLOAK_CLIENT_SECRET locally and this array entry simply doesn't exist;
// nothing about the existing Credentials login changes either way.
function keycloakProvider(): Provider[] {
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const issuerInternal = process.env.KEYCLOAK_ISSUER_INTERNAL;
  const issuerExternal = process.env.KEYCLOAK_ISSUER_EXTERNAL;

  if (!clientId || !clientSecret || !issuerInternal || !issuerExternal) {
    return [];
  }

  return [
    {
      // The server's own token/userinfo/JWKS calls use the internal
      // compose hostname (this container talking to `keycloak` directly,
      // for network reachability) — but the `issuer` string below is
      // deliberately the *external* one. This is not about reachability:
      // Keycloak stamps every token's `iss` claim based on whichever URL
      // was used for the *authorization* redirect (the real browser, via
      // `localhost:8081`), regardless of which hostname the server later
      // uses to call the token endpoint — confirmed live in chat via the
      // exact next-auth error: "iss mismatch, expected
      // http://keycloak:8080/realms/mycms-dev, got:
      // http://localhost:8081/realms/mycms-dev". So `issuer` here must
      // match the external issuer, or next-auth's own iss validation
      // (openid-client) rejects every real token Keycloak actually issues.
      //
      // Also: `wellKnown` must stay unset. next-auth v4's OAuth client
      // (node_modules/next-auth/core/lib/oauth/client.js) branches on
      // `provider.wellKnown`: if it's set, next-auth performs OIDC
      // discovery and uses *only* the discovered endpoints, silently
      // ignoring any explicit `authorization.url` — which is the earlier
      // bug hit in chat (clicking "Sign in with Keycloak" sent the real
      // browser to `http://keycloak:8080/...`, unreachable outside the
      // docker network, because discovery ran server-side against the
      // internal issuer and its discovered authorization_endpoint is
      // internal too). Unsetting `wellKnown` forces next-auth's manual-
      // Issuer path instead, which honors each endpoint below exactly as
      // given.
      ...KeycloakProvider({
        clientId,
        clientSecret,
        issuer: issuerExternal,
      }),
      wellKnown: undefined,
      authorization: {
        url: `${issuerExternal}/protocol/openid-connect/auth`,
        params: { scope: "openid email profile" },
      },
      token: { url: `${issuerInternal}/protocol/openid-connect/token` },
      userinfo: { url: `${issuerInternal}/protocol/openid-connect/userinfo` },
      jwks_endpoint: `${issuerInternal}/protocol/openid-connect/certs`,
    },
  ];
}

// docs/RBAC-TENANT-RECOMMENDATION.md §8 step 4 / §11.7 — Keycloak claims
// wiring for Tenant Admin / Department Admin. §3.3 recommended these two
// roles be read "from claims, not model_has_roles strings" once Keycloak
// is the real identity source — but every other guard, controller and
// service in this codebase (19 call sites at last count) calls
// RolesService.getUserRoles(userId) with nothing but a numeric legacy
// user id, and none of them have any notion of "the live JWT payload" to
// thread a claims object through. Rather than change that signature
// everywhere (real risk of quietly breaking one of 19 call sites for a
// feature meant to be purely additive), this syncs Keycloak's claims INTO
// the exact same model_has_roles table getUserRoles already reads —
// RolesService itself, and every one of those 19 call sites, is
// completely unchanged. This mirrors what this same callback already does
// for identity (resolving a Keycloak profile to a real legacy user by
// email) — just extended to roles too.
//
// Deliberately ADDITIVE ONLY: this only ever creates a department_admin{id}
// / tenant_admin{id} row, never deletes one. Revoking in Keycloak alone
// would NOT revoke access — an admin has to also remove the row via the
// existing DepartmentAdminsPanel (department_admin) or a direct DB/API
// action (tenant_admin, which has no revoke UI yet). A destructive sync
// (delete whatever the current claim set doesn't include) was considered
// and rejected: model_has_roles has no "granted by Keycloak vs. granted by
// a human via the UI" column to tell the two apart, so a destructive sync
// would silently wipe out a manually-granted role the next time that same
// person happened to log in via Keycloak with a token that didn't (yet,
// or ever) carry the matching realm role. Additive-only means Keycloak
// and the existing admin UI are two independent ways to grant these
// roles, both landing in the same table, both visible/revocable through
// the same existing panels — never a reason for the same login to
// silently lose access it had a moment ago.
//
// Realm role naming deliberately mirrors the existing model_has_roles
// convention exactly (`department_admin{departmentId}`, `tenant_admin{tenantId}`)
// rather than inventing a different shape for Keycloak — same meaning,
// same id, just a different place it can be granted from. See
// docker/keycloak/setup-tenant-department-admin-roles.mjs for how these
// realm roles get created and assigned in Keycloak.
//
// Signature verification is deliberately skipped here (plain
// `jwt.decode()`, not `jwtVerify`): `accessToken` is the direct result of
// this server's own token-endpoint call to Keycloak moments earlier
// (next-auth's OAuth exchange, authenticated with our client secret) —
// not a bearer token handed in by an arbitrary caller the way
// KeycloakAuthGuard's own jose-based verification has to defend against.
// The email/sub this same callback already trusts from `user`/`profile`
// comes from that identical exchange with no extra verification either.
const KC_ROLE_PATTERN = /^(department_admin|tenant_admin)(\d+)$/;

async function syncKeycloakRoleClaims(legacyUserId: number, accessToken: string | undefined): Promise<void> {
  if (!accessToken) return;

  let claims: { realm_access?: { roles?: string[] } };
  try {
    claims = jwt.decode(accessToken) as typeof claims;
  } catch {
    return;
  }

  const roleNames = claims?.realm_access?.roles ?? [];
  const matches = roleNames.filter((name) => KC_ROLE_PATTERN.test(name));
  if (matches.length === 0) return;

  // Matches apps/api/src/authz/roles.service.ts's USER_MODEL_TYPE exactly
  // — both apps read/write the same legacy model_has_roles table, so this
  // has to be the identical literal, not just "some string".
  const USER_MODEL_TYPE = "App\\Models\\User";

  for (const roleName of matches) {
    try {
      const role = await prisma.role.upsert({
        where: { name_guardName: { name: roleName, guardName: "web" } },
        update: {},
        create: { name: roleName, guardName: "web" },
      });
      await prisma.modelHasRole.upsert({
        where: {
          roleId_modelId_modelType: { roleId: role.id, modelId: legacyUserId, modelType: USER_MODEL_TYPE },
        },
        update: {},
        create: { roleId: role.id, modelId: legacyUserId, modelType: USER_MODEL_TYPE },
      });
    } catch (err) {
      // Best-effort: a sync failure should never block sign-in. Whatever
      // access the user already has (direct grants, or roles synced on a
      // previous successful login) is untouched either way.
      console.error(`Failed to sync Keycloak role claim "${roleName}" for user ${legacyUserId}:`, err);
    }
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        // The legacy app hashes passwords with Laravel's default bcrypt
        // ($2y$ prefix). bcryptjs compares $2y$/$2a$/$2b$ hashes identically,
        // so existing users log in with their current password — no reset
        // required. Verify this against a real account before relying on it.
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return { id: String(user.id), email: user.email, name: user.name };
      },
    }),
    ...keycloakProvider(),
  ],
  callbacks: {
    // Re-signs the API token on *every* call, not just at initial sign-in.
    // This callback runs on every getServerSession()/getToken() resolution
    // (every server-rendered page, every server action), so re-signing here
    // is what keeps a long-lived NextAuth session backed by an always-fresh
    // 15-minute API token — without this, the token minted once at login
    // quietly expired after 15 minutes while the outer session (and the
    // "logged in" UI) kept working, and every API call started failing with
    // a 401 for the rest of that session. `token.userId`/`token.email`
    // persist in the encrypted session cookie for the life of the outer
    // session, so they're available here long after the original `user`
    // object from sign-in is gone.
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        if (account?.provider === "keycloak") {
          // Slice 1 identity link (docs/IDENTITY-PLATFORM-RECOMMENDATION.md
          // §7, "Known, explicitly out-of-scope gap" in §7.5 — now
          // addressed per chat). A Keycloak profile's `id` is
          // `profile.sub`, a Keycloak-internal UUID with no meaning to
          // this app's legacy authorization tables (`users`/
          // `model_has_roles`, both keyed by numeric legacy ids). Resolve
          // to the *real* legacy user by matching email instead — seeded
          // for the two Slice 1 test accounts in
          // docker/keycloak/seed-slice1-identity-link.sql. If no matching
          // `users` row exists, token.userId stays unset and this session
          // simply can't reach any role-gated screen, rather than
          // silently operating under a fabricated identity.
          const matchedUser = user.email
            ? await prisma.user.findUnique({ where: { email: user.email } })
            : null;
          token.userId = matchedUser ? String(matchedUser.id) : undefined;
          token.email = user.email;

          if (matchedUser) {
            await syncKeycloakRoleClaims(matchedUser.id, account.access_token);
          }
        } else {
          token.userId = user.id;
          token.email = user.email;
        }
        token.impersonating = undefined;
      }

      if (trigger === "update" && session && "impersonating" in session) {
        token.impersonating = session.impersonating ?? undefined;
      }

      if (token.impersonating) {
        token.apiToken = jwt.sign(
          {
            sub: token.impersonating.userId,
            email: token.impersonating.email,
            actingAs: token.userId,
          },
          process.env.API_JWT_SECRET as string,
          { expiresIn: "15m" },
        );
        return token;
      }

      if (token.userId) {
        token.apiToken = jwt.sign(
          { sub: token.userId, email: token.email },
          process.env.API_JWT_SECRET as string,
          { expiresIn: "15m" },
        );
      } else {
        token.apiToken = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
      }
      session.apiToken = token.apiToken;
      session.impersonating = token.impersonating ?? null;
      return session;
    },
  },
};
