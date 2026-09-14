import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';

// The exact class name the legacy app's Project model registers as its
// Sanctum morph type (no morph map override was found in the legacy
// AppServiceProvider, so Eloquent falls back to the fully-qualified class
// name). If a future legacy change registers a morph map alias, this is
// the one line that needs to follow it.
export const PROJECT_TOKENABLE_TYPE = 'App\\Models\\Project';

export interface ResolvedProjectToken {
  project: { id: number; uuid: string; defaultLocale: string };
  abilities: string[];
  // Only set when the caller authenticated with a static Sanctum-style
  // key (see the PersonalAccessToken branch below). ApiRequestLogMiddleware
  // uses this to bump PersonalAccessToken.lastUsedAt -- there's no
  // matching row to stamp for a ProjectApiUser login/refresh access
  // token, so that branch deliberately leaves this undefined rather than
  // reusing it for a different id space.
  tokenId?: number;
}

// Claims minted by ProjectApiAuthController on a successful
// username/password login or refresh (see that file) -- kept here, next
// to the verification side, so issuance and verification never drift on
// shape.
export interface PublicApiAccessTokenClaims {
  typ: 'public-api-access';
  projectId: number;
  apiUserId: number;
  abilities: string[];
}

@Injectable()
export class PublicApiAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // A username/password login (ProjectApiAuthController) mints one of
  // these instead of a static Sanctum-style key. Verifies the
  // signature/expiry via the same API_JWT_SECRET the dashboard's own
  // JwtAuthGuard uses, then re-checks the claimed project still exists
  // (mirrors the PersonalAccessToken branch below) so a deleted project
  // can't still be reached just because an access token hasn't expired
  // yet. The `typ` discriminator is what keeps this from ever accepting
  // a dashboard-session JWT (same secret, different claim shape) --
  // PermissionGuard separately rejects a public-api-access token used
  // against a dashboard route, since it carries no `sub`.
  private async resolveAccessTokenJwt(token: string): Promise<ResolvedProjectToken | null> {
    let claims: PublicApiAccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<PublicApiAccessTokenClaims>(token);
    } catch {
      return null;
    }
    if (!claims || claims.typ !== 'public-api-access') return null;

    const project = await this.prisma.project.findFirst({
      where: { id: claims.projectId, deletedAt: null },
      select: { id: true, uuid: true, defaultLocale: true },
    });
    if (!project) return null;

    return { project, abilities: Array.isArray(claims.abilities) ? claims.abilities : [] };
  }

  // Reimplements Laravel Sanctum 2.x's PersonalAccessToken::findToken()
  // exactly (verified against the legacy app's own vendor/laravel/sanctum
  // source — see docs/PHASE-5-NOTES.md): a presented token of the form
  // "{id}|{secret}" is looked up by id, then the secret is verified with a
  // constant-time SHA-256 comparison against the stored hash. A bare token
  // with no "|" is supported too (Sanctum's fallback for older callers) via
  // a direct hash lookup. This is what makes an API token issued by the
  // *legacy* Laravel admin keep working against this stack unchanged — no
  // token re-issuance needed during the strangler-fig cutover.
  async resolveToken(bearerToken: string | undefined): Promise<ResolvedProjectToken | null> {
    if (!bearerToken) return null;

    // A login-issued access token is a JWT (three dot-separated segments);
    // a Sanctum-style static key never contains a dot. resolveAccessTokenJwt
    // safely returns null for anything that isn't actually a validly-signed,
    // correctly-typed token, so a static key always falls through to the
    // lookup below unchanged.
    if (bearerToken.split('.').length === 3) {
      const viaJwt = await this.resolveAccessTokenJwt(bearerToken);
      if (viaJwt) return viaJwt;
    }

    let row: { id: number; token: string; tokenableId: number; tokenableType: string; abilities: string | null } | null =
      null;

    if (bearerToken.includes('|')) {
      const [idPart, secret] = bearerToken.split('|', 2);
      const id = Number(idPart);
      if (!Number.isInteger(id)) return null;

      const candidate = await this.prisma.personalAccessToken.findUnique({ where: { id } });
      if (!candidate) return null;

      const expected = Buffer.from(candidate.token, 'hex');
      const actual = crypto.createHash('sha256').update(secret).digest();
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
      row = candidate;
    } else {
      const hash = crypto.createHash('sha256').update(bearerToken).digest('hex');
      row = await this.prisma.personalAccessToken.findUnique({ where: { token: hash } });
    }

    if (!row || row.tokenableType !== PROJECT_TOKENABLE_TYPE) return null;

    const project = await this.prisma.project.findFirst({
      where: { id: row.tokenableId, deletedAt: null },
      select: { id: true, uuid: true, defaultLocale: true },
    });
    if (!project) return null;

    let abilities: string[] = [];
    try {
      abilities = row.abilities ? JSON.parse(row.abilities) : [];
    } catch {
      abilities = [];
    }

    return { project, abilities, tokenId: row.id };
  }

  can(abilities: string[], ability: string): boolean {
    return abilities.includes('*') || abilities.includes(ability);
  }
}
