import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §5.5, §8 step 5 (follow-up). Only
// JwtAuthGuard at the class level — unlike role-management/, these routes
// aren't scoped to a :projectId, so the project-scoped PermissionGuard
// doesn't apply here; each method resolves its own authorization via
// DepartmentsService, reading the same UserRoles data ProjectRoleGuard/
// PermissionGuard read internally (see DepartmentsService.canView/
// canManageAdmins).
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  // Entry point for a Departments list screen: every Department the
  // requesting user is either Tenant Admin or Department Admin over (or
  // every Department at all, for a Super Admin).
  @Get()
  listVisible(@Req() req: AuthedRequest) {
    return this.departmentsService.listVisibleDepartments(this.userId(req));
  }

  @Get(':departmentId')
  getOne(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.departmentsService.getDepartment(this.userId(req), departmentId);
  }

  // Links each row into that project's own existing /members page
  // (role-management/) rather than duplicating per-project role UI here.
  @Get(':departmentId/projects')
  listProjects(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.departmentsService.listDepartmentProjects(this.userId(req), departmentId);
  }

  @Get(':departmentId/admins')
  listAdmins(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.departmentsService.listDepartmentAdmins(this.userId(req), departmentId);
  }

  // Grant/revoke is intentionally narrower than view access — see
  // DepartmentsService.canManageAdmins: a Department Admin can see this
  // list but not add to it, only a Tenant Admin (or Super Admin) can.
  @Post(':departmentId/admins')
  grantAdmin(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: { email: string },
  ) {
    return this.departmentsService.grantDepartmentAdmin(this.userId(req), departmentId, body.email);
  }

  @Delete(':departmentId/admins/:userId')
  async revokeAdmin(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    await this.departmentsService.revokeDepartmentAdmin(this.userId(req), departmentId, targetUserId);
    return { success: true };
  }
}
