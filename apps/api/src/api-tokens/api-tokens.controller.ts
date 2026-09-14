import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../authz/permission.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';

// Gated on the api-tokens:manage PERMISSION (authz/permissions.ts), not a
// role tier — this used to be 'admin'-tier only via ProjectRoleGuard,
// which meant Developer (whose whole defining permission, per the
// catalog, IS api-tokens:manage) could never actually manage tokens.
// Admin/Department Admin/Tenant Admin/Super Admin all still hold
// api-tokens:manage in their own bundle, so this is strictly additive —
// nobody who could reach these routes before loses access, and this
// mirrors the same PermissionGuard pattern RoleManagementController and
// ApprovalWorkflowsController already use for a permission that isn't a
// clean role-tier boundary.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/tokens')
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Get()
  @RequirePermission('api-tokens:manage')
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.apiTokensService.list(projectId);
  }

  @Post()
  @RequirePermission('api-tokens:manage')
  issue(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { name: string; abilities?: string[] },
  ) {
    return this.apiTokensService.issue(projectId, body.name, body.abilities ?? []);
  }

  @Delete(':id')
  @RequirePermission('api-tokens:manage')
  async revoke(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.apiTokensService.revoke(projectId, id);
    return { success: true };
  }
}
