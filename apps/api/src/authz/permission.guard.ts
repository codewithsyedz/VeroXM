import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from './roles.service.js';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator.js';
import type { Permission } from './permissions.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.2, §8 step 2. Mirrors
// ProjectRoleGuard's shape exactly (same request assumptions: runs after
// JwtAuthGuard, reads a `:projectId` or `:id` route param) but checks a
// permission from the §5.4 catalog instead of a role tier. Purely
// additive — no existing @RequireProjectRole route is touched by this.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly rolesService: RolesService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Permission | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) return true; // route didn't opt in — unchanged behavior

    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.sub);
    if (!userId) throw new ForbiddenException('Not authenticated');

    const projectId = Number(request.params?.projectId ?? request.params?.id);
    if (!projectId) throw new ForbiddenException('No project context for this route');

    const permissions = await this.rolesService.getPermissionsForProjectId(userId, projectId);
    if (!permissions.has(required)) {
      throw new ForbiddenException(`Requires ${required} on project ${projectId}`);
    }

    request.permissions = permissions;
    return true;
  }
}
