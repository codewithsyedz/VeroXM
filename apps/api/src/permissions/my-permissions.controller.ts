import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesService } from '../authz/roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.2, §8 step 2 — proof-of-concept
// only, same role in this slice that GET /auth/keycloak-whoami played for
// Slice 1: proves the new permission-based RolesService resolves an
// end-to-end permission set for a real user/project, before anything else
// in the app depends on it. Not wired into any real route yet. Safe to
// delete once this slice is reviewed.
@Controller('permissions')
export class MyPermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('my-permissions/:projectId')
  @UseGuards(JwtAuthGuard)
  async myPermissions(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request & { user?: { sub?: number } },
  ) {
    const userId = Number(request.user?.sub);
    const permissions = await this.rolesService.getPermissionsForProjectId(userId, projectId);
    return { projectId, permissions: [...permissions] };
  }
}
