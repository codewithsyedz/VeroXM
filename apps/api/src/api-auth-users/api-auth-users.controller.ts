import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiAuthUsersService } from './api-auth-users.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../authz/permission.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';

// Manages username/password credentials for the public API's login+refresh
// flow (ProjectApiAuthController) -- gated on the same api-tokens:manage
// permission as ApiTokensController, since both are "who can hand out
// public-API access to this project" concerns. See that controller's own
// comment for why this is a permission, not a role-tier, check.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/api-users')
export class ApiAuthUsersController {
  constructor(private readonly apiAuthUsersService: ApiAuthUsersService) {}

  @Get()
  @RequirePermission('api-tokens:manage')
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.apiAuthUsersService.list(projectId);
  }

  @Post()
  @RequirePermission('api-tokens:manage')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { username: string; password: string; abilities?: string[] },
  ) {
    return this.apiAuthUsersService.create(projectId, body.username, body.password, body.abilities ?? []);
  }

  @Delete(':id')
  @RequirePermission('api-tokens:manage')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.apiAuthUsersService.remove(projectId, id);
    return { success: true };
  }
}
