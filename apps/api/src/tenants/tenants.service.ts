import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService, USER_MODEL_TYPE, type UserRoles } from '../authz/roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.10 -- the Tenant-level
// counterpart to departments/, closing the gap §11.1/§11.2 both flagged
// and deferred: "Tenant Admin assignment still has none (still only one
// real Tenant, so this stays low-priority)." There's still only one real
// Tenant, but "low-priority" isn't "never" — Super Admin was, until this
// module, the ONLY way to grant or revoke tenant_admin{id} at all (the
// legacy Laravel admin, same as every other role before role-management/
// and departments/ existed).
//
// Deliberately narrower in scope than DepartmentsService, matching the
// fact that Tenant sits one tier above Department: view and manage are
// the SAME check here (Super Admin, or Tenant Admin of this exact
// Tenant) -- unlike Departments, there is no intermediate tier below
// Tenant Admin that should see this Tenant's admin list without being
// able to manage it (a Department Admin has no standing reason to see
// who administers the Tenant above their Department; if that changes,
// this is the one place to add it, alongside its own tests).
export interface TenantSummary {
  id: number;
  name: string;
  slug: string;
}

export interface TenantDetail extends TenantSummary {
  // Same reason as DepartmentDetail.canManageAdmins: lets the frontend
  // show/hide the grant form without re-deriving canManageAdmins itself.
  // Here it's identical to canView, but kept as its own field for the
  // same reason DepartmentDetail keeps its own -- the two checks are
  // conceptually different questions even where they happen to coincide.
  canManageAdmins: boolean;
  // docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- renaming the Tenant
  // record itself is a different question from managing its admin
  // roster, even though both happen to gate on the exact same
  // canAccess check today (Super Admin, or Tenant Admin of this
  // Tenant). Kept as its own field rather than reusing
  // canManageAdmins, matching this file's own established discipline
  // above.
  canEditDetails: boolean;
  // Deliberately narrower than canEditDetails/canManageAdmins: a
  // Tenant Admin can rename their own Tenant or manage its admin
  // roster, but only a Super Admin can delete it outright. Deleting a
  // Tenant is a one-way structural change (every Department, Project,
  // and role grant beneath it stops having a home), which is a step
  // above what any single Tenant Admin should be able to do to their
  // own tenant alone -- the same reasoning §11.13 used to keep a
  // Department Admin from weakening their own Department's approval
  // gate.
  canDelete: boolean;
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- a bare TenantSummary[]
// can't also carry "is the requesting user allowed to create a new
// Tenant," so the list endpoint returns this envelope instead, the
// same pattern §11.13's ProjectApprovalWorkflowResult established for
// the same reason.
export interface TenantsListResult {
  canCreate: boolean;
  tenants: TenantSummary[];
}

// Only lowercase letters, digits, and single internal hyphens --
// matches the shape of every slug already seeded in this database
// (e.g. "nami-test-department"), and avoids a slug that reads
// differently in a URL than it does in this form.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface TenantAdmin {
  userId: number;
  name: string;
  email: string;
}

const TENANT_DEPARTMENT_SELECT = {
  id: true,
  name: true,
  slug: true,
} as const;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  // View and manage are the same gate for Tenants -- see this file's own
  // top comment for why that's a deliberate difference from Departments'
  // separate canView/canManageAdmins.
  private canAccess(roles: UserRoles, tenantId: number): boolean {
    if (roles.isSuperAdmin) return true;
    return roles.tenantAdminTenantIds.includes(tenantId);
  }

  private async requireTenant(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
    return tenant;
  }

  // Entry point for a Tenants list screen: Super Admin sees every Tenant;
  // a Tenant Admin sees only the Tenant(s) they administer; everyone else
  // (including a Department Admin with no Tenant Admin grant of their
  // own) gets an empty list, not a 403 -- matching
  // DepartmentsService.listVisibleDepartments' own "no scope, no rows"
  // convention.
  async listVisibleTenants(userId: number): Promise<TenantsListResult> {
    const roles = await this.rolesService.getUserRoles(userId);
    // Creating a brand-new Tenant establishes a new top-level
    // organizational boundary -- there's no tier between Tenant Admin
    // and Super Admin the way there is between Department Admin and
    // Tenant Admin, so this is Super Admin only, full stop (see
    // createTenant's own guard for the same check enforced server-side).
    const canCreate = roles.isSuperAdmin;

    if (!roles.isSuperAdmin && roles.tenantAdminTenantIds.length === 0) {
      return { canCreate, tenants: [] };
    }

    const tenants = await this.prisma.tenant.findMany({
      where: roles.isSuperAdmin ? {} : { id: { in: roles.tenantAdminTenantIds } },
      orderBy: { name: 'asc' },
    });

    return { canCreate, tenants: tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug })) };
  }

  async getTenant(userId: number, tenantId: number): Promise<TenantDetail> {
    const tenant = await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`No access to tenant ${tenantId}`);
    }
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      canManageAdmins: true, // reaching this point already required canAccess, which IS canManageAdmins here
      canEditDetails: true, // same reasoning -- canAccess is canEditDetails's gate too, today
      canDelete: roles.isSuperAdmin,
    };
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.14. Super Admin only -- see
  // TenantDetail.canEditDetails/canDelete's own comments for why
  // creation in particular can't be delegated to a Tenant Admin the way
  // renaming or managing the admin roster can be: there is no existing
  // Tenant to be "Tenant Admin of" yet.
  async createTenant(userId: number, name: string, slug: string): Promise<TenantSummary> {
    const roles = await this.rolesService.getUserRoles(userId);
    if (!roles.isSuperAdmin) {
      throw new ForbiddenException('Only a Super Admin can create a new tenant');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Tenant name is required');
    }

    const trimmedSlug = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(trimmedSlug)) {
      throw new BadRequestException(
        'Slug must be lowercase letters, numbers, and single hyphens only (e.g. "acme-corp")',
      );
    }

    const existing = await this.prisma.tenant.findUnique({ where: { slug: trimmedSlug } });
    if (existing) {
      throw new ConflictException(`Slug "${trimmedSlug}" is already in use by another tenant`);
    }

    const tenant = await this.prisma.tenant.create({ data: { name: trimmedName, slug: trimmedSlug } });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug };
  }

  // Name-only, deliberately: slug is immutable once a tenant exists. A
  // slug is a stable identifier a future integration (e.g. a Keycloak
  // Organization alias, per IDENTITY-PLATFORM-RECOMMENDATION.md §7) could
  // come to depend on -- changing it out from under such a reference
  // has no upside a rename doesn't already provide, so this form simply
  // doesn't expose a way to do it.
  async updateTenant(userId: number, tenantId: number, name: string): Promise<TenantSummary> {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`Only a Tenant Admin (or Super Admin) can edit tenant ${tenantId}`);
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Tenant name is required');
    }

    const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: { name: trimmedName } });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug };
  }

  // Super Admin only -- see TenantDetail.canDelete's own comment for
  // why this is a stricter gate than canAccess/canEditDetails. Blocks
  // (rather than cascades) when Departments still reference this
  // Tenant: `departments.tenant_id` has a plain FK with no ON DELETE
  // clause (packages/db/sql/0006_create_tenants.sql), which MySQL/InnoDB
  // defaults to RESTRICT -- this check exists so the caller gets a
  // clear, actionable message instead of a raw SQL 1451 error bubbling
  // up through the API.
  async deleteTenant(userId: number, tenantId: number): Promise<void> {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!roles.isSuperAdmin) {
      throw new ForbiddenException('Only a Super Admin can delete a tenant');
    }

    const departmentCount = await this.prisma.department.count({ where: { tenantId } });
    if (departmentCount > 0) {
      const noun = departmentCount === 1 ? 'department' : 'departments';
      const verb = departmentCount === 1 ? 'belongs' : 'belong';
      const pronoun = departmentCount === 1 ? 'it' : 'them';
      throw new ConflictException(
        `Cannot delete this tenant: ${departmentCount} ${noun} still ${verb} to it. `
          + `Reassign or remove ${pronoun} first.`,
      );
    }

    // The tenant is going away for good, so also clean up its
    // tenant_admin{id} Role row (and any lingering grants of it) rather
    // than leaving a permanently-orphaned, never-again-grantable role
    // name behind -- unlike revokeTenantAdmin, which only ever removes
    // the ModelHasRole join and deliberately leaves the Role itself in
    // place for future re-grants.
    const roleName = `tenant_admin${tenantId}`;
    const role = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });
    if (role) {
      await this.prisma.modelHasRole.deleteMany({ where: { roleId: role.id, modelType: USER_MODEL_TYPE } });
      await this.prisma.role.delete({ where: { id: role.id } });
    }

    await this.prisma.tenant.delete({ where: { id: tenantId } });
  }

  // Same shape DepartmentsService.listDepartmentProjects returns for its
  // rows -- each row links into that Department's own existing detail
  // page (departments/[departmentId]) rather than duplicating Department
  // management here.
  async listTenantDepartments(userId: number, tenantId: number) {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`No access to tenant ${tenantId}`);
    }

    return this.prisma.department.findMany({
      where: { tenantId },
      select: TENANT_DEPARTMENT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async listTenantAdmins(userId: number, tenantId: number): Promise<TenantAdmin[]> {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`No access to tenant ${tenantId}`);
    }

    const roleName = `tenant_admin${tenantId}`;
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

  async grantTenantAdmin(userId: number, tenantId: number, email: string): Promise<TenantAdmin> {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`Only a Tenant Admin (or Super Admin) can grant Tenant Admin for tenant ${tenantId}`);
    }

    // Same "grant to an existing account, don't create one" discipline as
    // DepartmentsService.grantDepartmentAdmin / RoleManagementService.
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `No user with email "${email}" — they need an existing account before a role can be granted`,
      );
    }

    const roleName = `tenant_admin${tenantId}`;
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

  async revokeTenantAdmin(userId: number, tenantId: number, targetUserId: number): Promise<void> {
    await this.requireTenant(tenantId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canAccess(roles, tenantId)) {
      throw new ForbiddenException(`Only a Tenant Admin (or Super Admin) can revoke Tenant Admin for tenant ${tenantId}`);
    }

    const roleName = `tenant_admin${tenantId}`;
    const role = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });
    if (!role) return; // nothing to revoke

    await this.prisma.modelHasRole.deleteMany({
      where: { roleId: role.id, modelId: targetUserId, modelType: USER_MODEL_TYPE },
    });
  }
}
