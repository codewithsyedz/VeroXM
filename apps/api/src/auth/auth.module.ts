import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { KeycloakAuthGuard } from './keycloak-auth.guard.js';
import { KeycloakWhoamiController } from './keycloak-whoami.controller.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.API_JWT_SECRET,
    }),
  ],
  // KeycloakWhoamiController/KeycloakAuthGuard are Slice 1 proof-of-concept
  // additions (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7) — additive only,
  // nothing above this line changed.
  controllers: [KeycloakWhoamiController],
  providers: [JwtAuthGuard, KeycloakAuthGuard],
  exports: [JwtModule, JwtAuthGuard, KeycloakAuthGuard],
})
export class AuthModule {}
