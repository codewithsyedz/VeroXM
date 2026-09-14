import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from './roles.service.js';
import { PROJECT_ROLE_KEY, type ProjectRoleTier } from './require-project-role.decorator.js';

// Closes the recurring gap flagged in every admin module since Phase 2:
// JwtAuthGuard alone only checks "is this a valid logged-in user," not
// which projects they're allowed to touch. This runs after JwtAuthGuard
// (see each controller's @UseGuards order) and reads the user id it
// attaches to the request.
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly rolesService: RolesService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<ProjectRoleTier | undefined>(
      PROJECT_ROLE_KEY,
      context.getHandler(),
    );
    if (!required) return true; // route didn't opt in — unchanged behavior

    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.sub);
    if (!userId) throw new ForbiddenException('Not authenticated');

    // Every guarded controller scopes its routes under a `:projectId`
    // param, except ProjectsController, which uses `:id` for the project
    // itself — both are accepted here rather than forcing every route to
    // rename its param just for this guard.
    const projectId = Number(request.params?.projectId ?? request.params?.id);
    if (!projectId) throw new ForbiddenException('No project context for this route');

    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.rolesService.canAccess(roles, projectId, required)) {
      throw new ForbiddenException(`Requires ${required} access to project ${projectId}`);
    }

    request.projectRoles = roles;
    return true;
  }
}
