import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService, USER_MODEL_TYPE, type UserRoles } from '../authz/roles.service.js';
import { CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS, type Permission } from '../authz/permissions.js';

// docs/RBAC-TENANT-RECOMMENDATION.md section 5.6, section 8 step 2
// (follow-up). This module owns CONFIGURING a Department's custom roles
// (define, edit, delete) and GRANTING them to users -- the same split
// ApprovalWorkflowsModule draws between "who configures" and "who acts",
// except a custom role has no separate "acting" surface of its own: its
// permissions simply feed into RolesService.getPermissionsForProject
// (see that file's own comment) wherever a Department-scoped permission
// check already happens.

function roleNameFor(customRoleId: number): string {
  return `custom_role${customRoleId}`;
}

export interface CustomRoleGrant {
  userId: number;
  name: string;
  email: string;
}

export interface CustomRoleSummary {
  id: number;
  name: string;
  permissions: Permission[];
  grants: CustomRoleGrant[];
}

@Injectable()
export class CustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  // Same view-access rule as DepartmentsService.canView/
  // ApprovalWorkflowsService.canView (duplicated rather than shared
  // across modules, matching this codebase's existing preference for
  // small per-module checks) -- Super Admin, the Tenant Admin of this
  // Department's Tenant, or a Department Admin of this exact Department.
  private canView(roles: UserRoles, department: { id: number; tenantId: number | null }): boolean {
    if (roles.isSuperAdmin) return true;
    if (department.tenantId && roles.tenantAdminTenantIds.includes(department.tenantId)) return true;
    return roles.departmentAdminDepartmentIds.includes(department.id);
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md section 5.6: "Only members:manage-
  // holding roles (Tenant Admin, Department Admin) can create or edit
  // custom roles" -- UNLIKE ApprovalWorkflowsService.canConfigure (which
  // reserves configuring the approval gate to Tenant Admin only), a
  // Department Admin IS allowed to configure custom roles for their own
  // Department, so this is deliberately the same rule as canView above,
  // not a stricter one.
  private canConfigure(roles: UserRoles, department: { id: number; tenantId: number | null }): boolean {
    return this.canView(roles, department);
  }

  private async requireDepartment(departmentId: number) {
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`No department with id ${departmentId}`);
    return department;
  }

  private validatePermissions(permissions: string[]): Permission[] {
    const unique = [...new Set(permissions)];
    const invalid = unique.filter((p) => !CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS.includes(p as Permission));
    if (unique.length === 0 || invalid.length > 0) {
      throw new BadRequestException(
        `Custom roles may only be composed from: ${CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS.join(', ')}`,
      );
    }
    return unique as Permission[];
  }

  private async withGrants(role: { id: number; name: string; permissions: string }): Promise<CustomRoleSummary> {
    const roleName = roleNameFor(role.id);
    const assignments = await this.prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: roleName, guardName: 'web' } },
    });

    let grants: CustomRoleGrant[] = [];
    if (assignments.length > 0) {
      const userIds = [...new Set(assignments.map((a) => a.modelId))];
      const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
      grants = users
        .map((u) => ({ userId: u.id, name: u.name, email: u.email }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      id: role.id,
      name: role.name,
      permissions: JSON.parse(role.permissions) as Permission[],
      grants,
    };
  }

  async list(userId: number, departmentId: number): Promise<CustomRoleSummary[]> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canView(roles, department)) {
      throw new ForbiddenException(`No access to department ${departmentId}`);
    }

    const customRoles = await this.prisma.customRole.findMany({ where: { departmentId }, orderBy: { name: 'asc' } });
    return Promise.all(customRoles.map((r) => this.withGrants(r)));
  }

  async create(userId: number, departmentId: number, name: string, permissions: string[]): Promise<CustomRoleSummary> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin or Department Admin can configure custom roles for department ${departmentId}`,
      );
    }

    const trimmedName = name.trim();
    if (!trimmedName) throw new BadRequestException('Custom role name is required');
    const validated = this.validatePermissions(permissions);

    const existing = await this.prisma.customRole.findUnique({
      where: { departmentId_name: { departmentId, name: trimmedName } },
    });
    if (existing) {
      throw new ConflictException(`A custom role named "${trimmedName}" already exists in this department`);
    }

    const created = await this.prisma.customRole.create({
      data: { departmentId, name: trimmedName, permissions: JSON.stringify(validated) },
    });
    return this.withGrants(created);
  }

  // Deletes the role's own definition AND its underlying roles/
  // model_has_roles grant rows in one transaction -- otherwise a deleted
  // CustomRole would leave a `custom_role{id}` legacy role row and its
  // grants dangling: harmless (RolesService simply finds no matching
  // CustomRole to expand permissions from) but pointless clutter.
  async remove(userId: number, departmentId: number, roleId: number): Promise<void> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin or Department Admin can configure custom roles for department ${departmentId}`,
      );
    }

    const role = await this.prisma.customRole.findUnique({ where: { id: roleId } });
    if (!role || role.departmentId !== departmentId) return;

    const roleName = roleNameFor(roleId);
    const legacyRole = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });

    const ops = [];
    if (legacyRole) {
      ops.push(this.prisma.modelHasRole.deleteMany({ where: { roleId: legacyRole.id, modelType: USER_MODEL_TYPE } }));
      ops.push(this.prisma.role.delete({ where: { id: legacyRole.id } }));
    }
    ops.push(this.prisma.customRole.delete({ where: { id: roleId } }));
    await this.prisma.$transaction(ops);
  }

  async grant(userId: number, departmentId: number, roleId: number, email: string): Promise<CustomRoleGrant> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin or Department Admin can configure custom roles for department ${departmentId}`,
      );
    }

    const customRole = await this.prisma.customRole.findUnique({ where: { id: roleId } });
    if (!customRole || customRole.departmentId !== departmentId) {
      throw new NotFoundException(`No custom role ${roleId} in department ${departmentId}`);
    }

    // Same "grant to an existing account, don't create one" discipline as
    // DepartmentsService.grantDepartmentAdmin/RoleManagementService.
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `No user with email "${email}" -- they need an existing account before a role can be granted`,
      );
    }

    const roleName = roleNameFor(roleId);
    const legacyRole = await this.prisma.role.upsert({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
      update: {},
      create: { name: roleName, guardName: 'web' },
    });
    await this.prisma.modelHasRole.upsert({
      where: {
        roleId_modelId_modelType: { roleId: legacyRole.id, modelId: user.id, modelType: USER_MODEL_TYPE },
      },
      update: {},
      create: { roleId: legacyRole.id, modelId: user.id, modelType: USER_MODEL_TYPE },
    });

    return { userId: user.id, name: user.name, email: user.email };
  }

  async revoke(userId: number, departmentId: number, roleId: number, targetUserId: number): Promise<void> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin or Department Admin can configure custom roles for department ${departmentId}`,
      );
    }

    const roleName = roleNameFor(roleId);
    const legacyRole = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });
    if (!legacyRole) return;

    await this.prisma.modelHasRole.deleteMany({
      where: { roleId: legacyRole.id, modelId: targetUserId, modelType: USER_MODEL_TYPE },
    });
  }
}
