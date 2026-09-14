import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicApiAuthService } from './public-api-auth.service.js';
import { ABILITY_KEY } from './require-ability.decorator.js';

// Guards the redesigned v2 API. Same underlying token check as the v1 shim
// (see LegacyTokenGuard) — this stack doesn't have its own key-issuance UI
// yet, so v2 authenticates against the same legacy-issued Sanctum tokens —
// but with conventional HTTP status codes instead of the legacy app's
// blanket 404-for-everything.
@Injectable()
export class V2TokenGuard implements CanActivate {
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
      throw new UnauthorizedException({ error: 'Invalid or missing API token' });
    }

    if (request.params?.uuid && request.params.uuid !== resolved.project.uuid) {
      throw new NotFoundException({ error: 'Project not found' });
    }

    const ability = this.reflector.get<string | undefined>(ABILITY_KEY, context.getHandler());
    if (ability && !this.authService.can(resolved.abilities, ability)) {
      throw new ForbiddenException({ error: `This token cannot perform '${ability}' actions` });
    }

    request.projectToken = resolved;
    return true;
  }
}
