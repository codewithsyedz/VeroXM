import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleManagementService } from './role-management.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../authz/permission.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.3, §8 step 5. First real (non
// proof-of-concept) route gated by @RequirePermission/PermissionGuard —
// mirrors ApiTokensController's shape (JwtAuthGuard + a project guard at
// the class level, a tier/permission per method) but splits GET from
// POST/DELETE onto two different permissions rather than one tier:
// viewing the team only needs content:read (anyone with any access to
// the project can see who else has access), granting/revoking needs
// members:manage.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/members')
export class RoleManagementController {
  constructor(private readonly roleManagementService: RoleManagementService) {}

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.15 -- `assign` needs to know
  // who's calling now (to block granting 'admin' to yourself), matching
  // the same private-helper pattern DepartmentsController/
  // TenantsController already use.
  private userId(req: { user?: { sub?: number } }): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  @Get()
  @RequirePermission('content:read')
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.roleManagementService.listProjectMembers(projectId);
  }

  @Post()
  @RequirePermission('members:manage')
  assign(
    @Req() req: { user?: { sub?: number } },
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { email: string; roleKind: string },
  ) {
    return this.roleManagementService.assignProjectRole(
      projectId,
      this.userId(req),
      body.email,
      body.roleKind,
    );
  }

  @Delete(':userId')
  @RequirePermission('members:manage')
  async revoke(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('roleKind') roleKind: string,
  ) {
    await this.roleManagementService.revokeProjectRole(projectId, userId, roleKind);
    return { success: true };
  }
}
