import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

// Slice 1 proof of concept (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7):
// verifies a Keycloak-issued RS256 access token against the realm's JWKS
// endpoint. Runs alongside — never instead of — JwtAuthGuard, which still
// verifies this app's own HS256 apiToken; nothing about that guard or the
// routes it protects changes here. Not applied to any real route yet — see
// KeycloakWhoamiController for the one test endpoint that uses it.
//
// KEYCLOAK_ISSUER_INTERNAL is deliberately read lazily (inside
// canActivate), not in a field initializer or the constructor: this guard
// is registered as a Nest provider unconditionally, so an eager read would
// throw at app startup for every environment that hasn't set up Keycloak
// locally yet. Left unset, this guard just 401s the one route that uses
// it — the rest of the app is unaffected.
@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private jwks: JWTVerifyGetKey | undefined;
  private jwksIssuer: string | undefined;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const issuer = process.env.KEYCLOAK_ISSUER_INTERNAL;
    if (!issuer) {
      throw new UnauthorizedException('Keycloak is not configured in this environment');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const token =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    // Re-create the JWKS set if the issuer ever changes between requests
    // (it won't in practice — env vars don't change at runtime — but this
    // avoids a stale key set silently surviving a config change). The JWKS
    // endpoint itself is always fetched over the internal hostname — it's
    // the same signing keys regardless of which URL a caller used to reach
    // Keycloak, and only the internal hostname is reachable from inside
    // this container.
    if (!this.jwks || this.jwksIssuer !== issuer) {
      this.jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
      this.jwksIssuer = issuer;
    }

    // This realm doesn't pin a fixed KC_HOSTNAME (Slice 1 is dev-only —
    // docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7), so Keycloak stamps
    // `iss` with whatever URL a token was actually requested through:
    // internal (container-to-container — what the real NextAuth browser
    // login flow produces) or external (KEYCLOAK_ISSUER_EXTERNAL — what a
    // host-side script like docker/keycloak/setup-department.mjs
    // necessarily uses, since only the internal hostname resolves inside
    // a container). Both are the same realm/keys, so both are accepted.
    const acceptedIssuers = [issuer, process.env.KEYCLOAK_ISSUER_EXTERNAL].filter(
      (value): value is string => Boolean(value),
    );

    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: acceptedIssuers });
      request.keycloakClaims = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired Keycloak token');
    }
  }
}
