import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService, USER_MODEL_TYPE, type UserRoles } from '../authz/roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.5, §8 step 5 (follow-up) — the
// Department-level counterpart to role-management/. That module answers
// "who has what role on this ONE project"; this one answers "what
// Departments can I see, what's in them, and who administers them,"
// which is exactly the visibility boundary the user asked for: a
// Department's own admins should see everything inside it, and nothing
// outside it should be visible to them at all.
//
// Deliberately NOT gated by the project-scoped PermissionGuard — these
// routes aren't about a :projectId, they're about a :departmentId (or no
// id at all, for the list route), so authorization is checked inline
// against the same UserRoles RolesService already resolves, the same way
// ProjectRoleGuard/PermissionGuard do internally.
export interface DepartmentSummary {
  id: number;
  name: string;
  slug: string;
  tenantId: number | null;
  tenantName: string | null;
}

export interface DepartmentDetail extends DepartmentSummary {
  // Lets the frontend show/hide the grant-admin form without re-deriving
  // the same Tenant-Admin-or-Super-Admin check DepartmentsService.
  // canManageAdmins already makes server-side on every write route.
  canManageAdmins: boolean;
}

export interface DepartmentAdmin {
  userId: number;
  name: string;
  email: string;
}

const DEPARTMENT_PROJECT_SELECT = {
  id: true,
  uuid: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  // Can this user see anything about this Department at all? Super Admin,
  // the Tenant Admin of its Tenant, or a Department Admin of this exact
  // Department — matches getPermissionsForProject's own tenant_admin/
  // department_admin resolution in authz/roles.service.ts.
  private canView(roles: UserRoles, department: { id: number; tenantId: number | null }): boolean {
    if (roles.isSuperAdmin) return true;
    if (department.tenantId && roles.tenantAdminTenantIds.includes(department.tenantId)) return true;
    return roles.departmentAdminDepartmentIds.includes(department.id);
  }

  // Can this user grant/revoke this Department's admins? Deliberately
  // narrower than canView: a Department Admin can see their own admin
  // list but not add to it themselves (docs §8 step 2 follow-up note —
  // "prevent uncontrolled scope growth"). Only a Tenant Admin of the
  // covering Tenant, or a Super Admin, may manage this list.
  private canManageAdmins(roles: UserRoles, department: { tenantId: number | null }): boolean {
    if (roles.isSuperAdmin) return true;
    return !!department.tenantId && roles.tenantAdminTenantIds.includes(department.tenantId);
  }

  private async requireDepartment(departmentId: number) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { tenant: true },
    });
    if (!department) throw new NotFoundException(`No department with id ${departmentId}`);
    return department;
  }

  // Entry point for a "Departments" list screen: Super Admin sees every
  // Department; a Tenant Admin sees every Department in their Tenant(s);
  // a Department Admin sees just the Department(s) they administer.
  // Nobody else has any reason to hit this route, so an empty list (not
  // a 403) is the right response for a user with none of the above.
  async listVisibleDepartments(userId: number): Promise<DepartmentSummary[]> {
    const roles = await this.rolesService.getUserRoles(userId);

    // Deliberately NOT relying on Prisma's `OR: []` behavior for the "no
    // scope at all" case (an ordinary project admin/editor/viewer with no
    // Tenant/Department Admin grant) — an empty OR array's semantics have
    // differed across Prisma versions, and getting this wrong here means
    // every authenticated user seeing every Department. Short-circuit
    // instead: no scope, no rows, full stop.
    if (!roles.isSuperAdmin && roles.tenantAdminTenantIds.length === 0 && roles.departmentAdminDepartmentIds.length === 0) {
      return [];
    }

    const departments = await this.prisma.department.findMany({
      where: roles.isSuperAdmin
        ? {}
        : {
            OR: [
              roles.tenantAdminTenantIds.length > 0
                ? { tenantId: { in: roles.tenantAdminTenantIds } }
                : undefined,
              roles.departmentAdminDepartmentIds.length > 0
                ? { id: { in: roles.departmentAdminDepartmentIds } }
                : undefined,
            ].filter((c): c is NonNullable<typeof c> => c !== undefined),
          },
      include: { tenant: true },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      tenantId: d.tenantId,
      tenantName: d.tenant?.name ?? null,
    }));
  }

  async getDepartment(userId: number, departmentId: number): Promise<DepartmentDetail> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canView(roles, department)) {
      throw new ForbiddenException(`No access to department ${departmentId}`);
    }
    return {
      id: department.id,
      name: department.name,
      slug: department.slug,
      tenantId: department.tenantId,
      tenantName: department.tenant?.name ?? null,
      canManageAdmins: this.canManageAdmins(roles, department),
    };
  }

  // Same shape ProjectsService.findAll returns for its list rows, scoped
  // to a single Department instead of by admin/editor role — this is the
  // list a Department Admin/Tenant Admin lands on, and each row links
  // into that project's own existing /members page (role-management/).
  async listDepartmentProjects(userId: number, departmentId: number) {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canView(roles, department)) {
      throw new ForbiddenException(`No access to department ${departmentId}`);
    }

    return this.prisma.project.findMany({
      where: { departmentId, deletedAt: null },
      select: DEPARTMENT_PROJECT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async listDepartmentAdmins(userId: number, departmentId: number): Promise<DepartmentAdmin[]> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canView(roles, department)) {
      throw new ForbiddenException(`No access to department ${departmentId}`);
    }

    const roleName = `department_admin${departmentId}`;
    const assignments = await this.prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: roleName, guardName: 'web' } },
      include: { role: true },
    });
    if (assignments.length === 0) return [];

    const userIds = [...new Set(assignments.map((a) => a.modelId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    return users
      .map((u) => ({ userId: u.id, name: u.name, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async grantDepartmentAdmin(userId: number, departmentId: number, email: string): Promise<DepartmentAdmin> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canManageAdmins(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can grant Department Admin for department ${departmentId}`,
      );
    }

    // Same "grant to an existing account, don't create one" discipline as
    // RoleManagementService.assignProjectRole.
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `No user with email "${email}" — they need an existing account before a role can be granted`,
      );
    }

    const roleName = `department_admin${departmentId}`;
    const role = await this.prisma.role.upsert({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
      update: {},
      create: { name: roleName, guardName: 'web' },
    });

    await this.prisma.modelHasRole.upsert({
      where: {
        roleId_modelId_modelType: { roleId: role.id, modelId: user.id, modelType: USER_MODEL_TYPE },
      },
      update: {},
      create: { roleId: role.id, modelId: user.id, modelType: USER_MODEL_TYPE },
    });

    return { userId: user.id, name: user.name, email: user.email };
  }

  async revokeDepartmentAdmin(userId: number, departmentId: number, targetUserId: number): Promise<void> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canManageAdmins(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can revoke Department Admin for department ${departmentId}`,
      );
    }

    const roleName = `department_admin${departmentId}`;
    const role = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });
    if (!role) return; // nothing to revoke

    await this.prisma.modelHasRole.deleteMany({
      where: { roleId: role.id, modelId: targetUserId, modelType: USER_MODEL_TYPE },
    });
  }
}
