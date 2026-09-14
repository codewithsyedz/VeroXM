import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.10 -- the Tenant-level
// counterpart to departments/. Only JwtAuthGuard at the class level, same
// reasoning as DepartmentsController: these routes are shaped around a
// :tenantId (or no id at all, for the list route), not a :projectId, so
// the project-scoped PermissionGuard doesn't apply -- each method
// resolves its own authorization via TenantsService.
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  // Entry point for a Tenants list screen: every Tenant the requesting
  // user administers (or every Tenant, for a Super Admin).
  @Get()
  listVisible(@Req() req: AuthedRequest) {
    return this.tenantsService.listVisibleTenants(this.userId(req));
  }

  // §11.14 -- Super Admin only; TenantsService.createTenant enforces
  // this itself, this route is just the pass-through.
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: { name: string; slug: string }) {
    return this.tenantsService.createTenant(this.userId(req), body.name, body.slug);
  }

  @Get(':tenantId')
  getOne(@Req() req: AuthedRequest, @Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.tenantsService.getTenant(this.userId(req), tenantId);
  }

  // Links each row into that Department's own existing detail page
  // (departments/[departmentId]) rather than duplicating Department
  // management here.
  // §11.14 -- name-only edit; slug is immutable (see
  // TenantsService.updateTenant's own comment for why).
  @Patch(':tenantId')
  update(
    @Req() req: AuthedRequest,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: { name: string },
  ) {
    return this.tenantsService.updateTenant(this.userId(req), tenantId, body.name);
  }

  // §11.14 -- Super Admin only; see TenantsService.deleteTenant for the
  // department-count guard against the underlying FK RESTRICT.
  @Delete(':tenantId')
  async remove(@Req() req: AuthedRequest, @Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.tenantsService.deleteTenant(this.userId(req), tenantId);
    return { success: true };
  }

  @Get(':tenantId/departments')
  listDepartments(@Req() req: AuthedRequest, @Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.tenantsService.listTenantDepartments(this.userId(req), tenantId);
  }

  @Get(':tenantId/admins')
  listAdmins(@Req() req: AuthedRequest, @Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.tenantsService.listTenantAdmins(this.userId(req), tenantId);
  }

  @Post(':tenantId/admins')
  grantAdmin(
    @Req() req: AuthedRequest,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: { email: string },
  ) {
    return this.tenantsService.grantTenantAdmin(this.userId(req), tenantId, body.email);
  }

  @Delete(':tenantId/admins/:userId')
  async revokeAdmin(
    @Req() req: AuthedRequest,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    await this.tenantsService.revokeTenantAdmin(this.userId(req), tenantId, targetUserId);
    return { success: true };
  }
}
