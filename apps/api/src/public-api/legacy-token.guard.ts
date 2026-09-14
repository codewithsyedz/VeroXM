import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicApiAuthService } from './public-api-auth.service.js';
import { ABILITY_KEY } from './require-ability.decorator.js';

// Guards the v1 compatibility shim. Deliberately mirrors the legacy public
// API's habit of returning 404 (not 401/403) for every auth failure —
// wrong/missing token, project mismatch, or missing ability — since that's
// the response shape existing external integrations were built against.
// See PublicApiV2Guard for the same checks with conventional status codes.
@Injectable()
export class LegacyTokenGuard implements CanActivate {
  constructor(
    private readonly authService: PublicApiAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const resolved = await this.authService.resolveToken(token);
    if (!resolved) {
      throw new NotFoundException({ error: 'Project not found!' });
    }

    const ability = this.reflector.get<string | undefined>(ABILITY_KEY, context.getHandler());
    if (ability && !this.authService.can(resolved.abilities, ability)) {
      throw new NotFoundException({ error: "API token doesn't have the right permissions!" });
    }

    if (request.params?.uuid && request.params.uuid !== resolved.project.uuid) {
      throw new NotFoundException({ error: 'Project not found!' });
    }

    request.projectToken = resolved;
    return true;
  }
}
