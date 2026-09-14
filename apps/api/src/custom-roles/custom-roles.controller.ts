import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md section 5.6. Same shape as
// DepartmentsController/ApprovalWorkflowsController -- JwtAuthGuard
// only, authorization resolved inline by the service against a
// :departmentId, not the project-scoped PermissionGuard.
@UseGuards(JwtAuthGuard)
@Controller('departments/:departmentId/custom-roles')
export class CustomRolesController {
  constructor(private readonly customRolesService: CustomRolesService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  @Get()
  list(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.customRolesService.list(this.userId(req), departmentId);
  }

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: { name: string; permissions: string[] },
  ) {
    return this.customRolesService.create(this.userId(req), departmentId, body.name, body.permissions ?? []);
  }

  @Delete(':roleId')
  async remove(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    await this.customRolesService.remove(this.userId(req), departmentId, roleId);
    return { success: true };
  }

  @Post(':roleId/grants')
  grant(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { email: string },
  ) {
    return this.customRolesService.grant(this.userId(req), departmentId, roleId, body.email);
  }

  @Delete(':roleId/grants/:userId')
  async revoke(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    await this.customRolesService.revoke(this.userId(req), departmentId, roleId, targetUserId);
    return { success: true };
  }
}
