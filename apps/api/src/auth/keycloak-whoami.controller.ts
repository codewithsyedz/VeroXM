import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { KeycloakAuthGuard } from './keycloak-auth.guard.js';

// Slice 1 proof-of-concept only (docs/IDENTITY-PLATFORM-RECOMMENDATION.md
// §7) — proves a Keycloak-issued access token verifies via JWKS and that
// its Organization/role claims are readable end to end. Not linked to any
// real resource, and nothing else in the app depends on this route; safe
// to delete once the slice is reviewed.
@Controller('auth')
export class KeycloakWhoamiController {
  @Get('keycloak-whoami')
  @UseGuards(KeycloakAuthGuard)
  whoami(@Req() request: Request & { keycloakClaims?: Record<string, unknown> }) {
    return { claims: request.keycloakClaims };
  }
}
