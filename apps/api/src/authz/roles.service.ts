import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLE_PERMISSIONS, type Permission, type RoleKind } from './permissions.js';

// The legacy app's User model is the Spatie "model" role assignments are
// made against (`use HasRoles;` on App\Models\User) — this is the morph
// type stored in `model_has_roles.model_type`, same kind of assumption as
// PublicApiAuthService's PROJECT_TOKENABLE_TYPE (Phase 5), and for the same
// reason: no morph map override exists in the legacy AppServiceProvider.
export const USER_MODEL_TYPE = 'App\\Models\\User';

export interface UserRoles {
  isSuperAdmin: boolean;
  adminProjectIds: number[];
  editorProjectIds: number[];
  // docs/RBAC-TENANT-RECOMMENDATION.md §3.1, §5.1, §5.5, §8 step 1-2 —
  // additive. Existing callers (ProjectRoleGuard, canAccess) only ever
  // read the three fields above and are unaffected by these.
  tenantAdminTenantIds: number[];
  departmentAdminDepartmentIds: number[];
  developerProjectIds: number[];
  viewerProjectIds: number[];
  // docs/RBAC-TENANT-RECOMMENDATION.md §6.1 — adminProjectIds above is the
  // EFFECTIVE list (direct admin{id} grants PLUS every project inherited
  // via Department/Tenant Admin scope, see the expansion below). This is
  // the un-expanded, direct-grant-only list, needed so approval-workflow
  // steps can tell a genuine project Admin apart from a Department/Tenant
  // Admin acting on a project only through inherited scope — see
  // RolesService.satisfiesRoleKind.
  directAdminProjectIds: number[];
  // docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- resolved once here
  // (same place adminProjectIds' inherited-scope expansion happens) so
  // getPermissionsForProject stays a pure, synchronous function reading
  // pre-resolved data rather than doing its own DB lookups per call.
  customRoleGrants: { customRoleId: number; departmentId: number; permissions: Permission[] }[];
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // Role ASSIGNMENT (creating a project's admin{id}/editor{id} roles,
  // granting them to a user) still only happens through the legacy
  // Laravel admin — there's no user-management screen in this stack yet
  // (flagged since Phase 1). This only reads what's already assigned, the
  // same "enforce, don't yet manage" scope Phase 5 drew around API tokens.
  async getUserRoles(userId: number): Promise<UserRoles> {
    const assignments = await this.prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, modelId: userId },
      include: { role: true },
    });

    let isSuperAdmin = false;
    const adminProjectIds: number[] = [];
    const editorProjectIds: number[] = [];
    const tenantAdminTenantIds: number[] = [];
    const departmentAdminDepartmentIds: number[] = [];
    const developerProjectIds: number[] = [];
    const viewerProjectIds: number[] = [];
    const customRoleIds: number[] = [];

    // Longer, more specific prefixes ('tenant_admin', 'department_admin')
    // are checked before the plain 'admin' prefix they'd otherwise also
    // match under a naive startsWith — order matters here.
    for (const a of assignments as { role: { name: string } }[]) {
      const name = a.role.name;
      if (name === 'super_admin') {
        isSuperAdmin = true;
      } else if (name.startsWith('tenant_admin')) {
        const id = Number(name.slice('tenant_admin'.length));
        if (Number.isInteger(id)) tenantAdminTenantIds.push(id);
      } else if (name.startsWith('department_admin')) {
        const id = Number(name.slice('department_admin'.length));
        if (Number.isInteger(id)) departmentAdminDepartmentIds.push(id);
      } else if (name.startsWith('admin')) {
        const id = Number(name.slice('admin'.length));
        if (Number.isInteger(id)) adminProjectIds.push(id);
      } else if (name.startsWith('editor')) {
        const id = Number(name.slice('editor'.length));
        if (Number.isInteger(id)) editorProjectIds.push(id);
      } else if (name.startsWith('developer')) {
        const id = Number(name.slice('developer'.length));
        if (Number.isInteger(id)) developerProjectIds.push(id);
      } else if (name.startsWith('viewer')) {
        const id = Number(name.slice('viewer'.length));
        if (Number.isInteger(id)) viewerProjectIds.push(id);
      } else if (name.startsWith('custom_role')) {
        const id = Number(name.slice('custom_role'.length));
        if (Number.isInteger(id)) customRoleIds.push(id);
      }
    }

    // Captured BEFORE the expansion below adds inherited project ids —
    // see the `directAdminProjectIds` field comment on UserRoles.
    const directAdminProjectIds = [...adminProjectIds];

    // docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- resolve each
    // custom_role{id} grant to its stored Department scope + permission
    // checklist once here, so getPermissionsForProject can stay
    // synchronous (see the UserRoles.customRoleGrants field comment).
    let customRoleGrants: { customRoleId: number; departmentId: number; permissions: Permission[] }[] = [];
    if (customRoleIds.length > 0) {
      const customRoles = await this.prisma.customRole.findMany({ where: { id: { in: customRoleIds } } });
      customRoleGrants = customRoles.map((cr) => ({
        customRoleId: cr.id,
        departmentId: cr.departmentId,
        permissions: JSON.parse(cr.permissions) as Permission[],
      }));
    }

    // docs/RBAC-TENANT-RECOMMENDATION.md §5.5, §8 step 2 (follow-up) — a
    // Tenant/Department Admin grant is otherwise invisible to every
    // pre-existing project-scoped check (ProjectRoleGuard, canAccess,
    // ProjectsService.findAll), which only ever read adminProjectIds/
    // editorProjectIds. Expanding the scoped grant into adminProjectIds
    // here, once, means all of those callers pick it up automatically
    // with zero changes on their end, and a Department/Tenant Admin sees
    // (and can manage) every project in their scope without needing a
    // separate direct per-project role. Purely additive: this can only
    // ever add ids on top of whatever was already resolved above, so it
    // cannot narrow or change any previously-granted access.
    if (!isSuperAdmin && (tenantAdminTenantIds.length > 0 || departmentAdminDepartmentIds.length > 0)) {
      const scopeFilters = [
        departmentAdminDepartmentIds.length > 0
          ? { departmentId: { in: departmentAdminDepartmentIds } }
          : undefined,
        tenantAdminTenantIds.length > 0
          ? { department: { tenantId: { in: tenantAdminTenantIds } } }
          : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const scopedProjects = await this.prisma.project.findMany({
        where: {
          deletedAt: null,
          OR: scopeFilters,
        },
        select: { id: true },
      });

      for (const p of scopedProjects) {
        if (!adminProjectIds.includes(p.id)) adminProjectIds.push(p.id);
      }
    }

    return {
      isSuperAdmin,
      adminProjectIds,
      editorProjectIds,
      tenantAdminTenantIds,
      departmentAdminDepartmentIds,
      developerProjectIds,
      viewerProjectIds,
      directAdminProjectIds,
      customRoleGrants,
    };
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §5.2, §5.4, §8 step 2 — new,
  // additive permission-based check, alongside (not replacing) canAccess
  // below. Scope is applied here, not in permissions.ts: a role KIND's
  // permission bundle is fixed data, but whether it applies to *this*
  // project depends on which Tenant/Department/Project it was granted for.
  getPermissionsForProject(
    roles: UserRoles,
    context: { projectId: number; departmentId?: number; tenantId?: number },
  ): Set<Permission> {
    const permissions = new Set<Permission>();
    const grant = (kind: RoleKind) => ROLE_PERMISSIONS[kind].forEach((p) => permissions.add(p));

    if (roles.isSuperAdmin) {
      grant('super_admin');
      return permissions;
    }
    if (context.tenantId && roles.tenantAdminTenantIds.includes(context.tenantId)) {
      grant('tenant_admin');
    }
    if (context.departmentId && roles.departmentAdminDepartmentIds.includes(context.departmentId)) {
      grant('department_admin');
    }
    // docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- a custom role's
    // permission checklist applies whenever this request's Department
    // matches the role's own Department scope, on top of (not instead
    // of) whatever project-tier role the user separately holds here.
    for (const cr of roles.customRoleGrants) {
      if (context.departmentId && cr.departmentId === context.departmentId) {
        cr.permissions.forEach((p) => permissions.add(p));
      }
    }
    if (roles.adminProjectIds.includes(context.projectId)) grant('admin');
    if (roles.editorProjectIds.includes(context.projectId)) grant('editor');
    if (roles.developerProjectIds.includes(context.projectId)) grant('developer');
    if (roles.viewerProjectIds.includes(context.projectId)) grant('viewer');

    return permissions;
  }

  // Convenience wrapper: looks up the project's Department/Tenant so a
  // caller (PermissionGuard, the my-permissions proof-of-concept route)
  // only needs a userId and a projectId, matching how canAccess/
  // ProjectRoleGuard are already called today.
  async getPermissionsForProjectId(userId: number, projectId: number): Promise<Set<Permission>> {
    const roles = await this.getUserRoles(userId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { department: true },
    });

    return this.getPermissionsForProject(roles, {
      projectId,
      departmentId: project?.department?.id,
      tenantId: project?.department?.tenantId ?? undefined,
    });
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §6.1 — approval-workflow steps
  // name a ROLE, not a raw permission (see ApprovalStep's own comment for
  // why: content:approve alone can't distinguish an Admin's sign-off from
  // a Department Admin's, since both hold it identically). This is the
  // one shared check both workflow configuration (Tenant Admin/Super
  // Admin only) and per-step approval reuse — a Super Admin always
  // satisfies every kind, matching the blanket override every other check
  // in this file already applies.
  satisfiesRoleKind(
    roles: UserRoles,
    kind: 'admin' | 'department_admin' | 'tenant_admin',
    context: { projectId?: number; departmentId?: number; tenantId?: number },
  ): boolean {
    if (roles.isSuperAdmin) return true;
    if (kind === 'admin') {
      // Deliberately directAdminProjectIds, NOT adminProjectIds — the
      // latter also includes projects a Department/Tenant Admin only
      // reaches through inherited scope (§5.5/§8 step 2 follow-up's
      // expansion), which would otherwise make an 'admin'-kind step
      // satisfiable by someone who was never actually granted admin{id}
      // directly, collapsing the distinction this whole feature needs.
      return context.projectId !== undefined && roles.directAdminProjectIds.includes(context.projectId);
    }
    if (kind === 'department_admin') {
      return context.departmentId !== undefined && roles.departmentAdminDepartmentIds.includes(context.departmentId);
    }
    return context.tenantId !== undefined && roles.tenantAdminTenantIds.includes(context.tenantId);
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7 -- every Tenant a
  // user touches in ANY way: directly (tenantAdminTenantIds), via a
  // Department they administer, or via any project-scoped role at all
  // (admin/editor/developer/viewer). Uses the *effective* adminProjectIds
  // (not directAdminProjectIds) deliberately -- unlike satisfiesRoleKind's
  // 'admin' branch, this isn't distinguishing a direct grant from an
  // inherited one, it's just asking "does this user's reach ever touch
  // this Tenant," so the broader effective list is exactly right here.
  async resolveTenantFootprint(roles: UserRoles): Promise<Set<number>> {
    const tenantIds = new Set<number>(roles.tenantAdminTenantIds);

    if (roles.departmentAdminDepartmentIds.length > 0) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: roles.departmentAdminDepartmentIds } },
        select: { tenantId: true },
      });
      for (const d of departments) {
        if (d.tenantId) tenantIds.add(d.tenantId);
      }
    }

    const projectIds = [
      ...new Set([
        ...roles.adminProjectIds,
        ...roles.editorProjectIds,
        ...roles.developerProjectIds,
        ...roles.viewerProjectIds,
      ]),
    ];
    if (projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        include: { department: true },
      });
      for (const p of projects) {
        if (p.department?.tenantId) tenantIds.add(p.department.tenantId);
      }
    }

    return tenantIds;
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7 -- the actor must be
  // a Super Admin, or a Tenant Admin whose tenant footprint overlaps the
  // target's own tenant footprint (docs' "impersonate:user" permission is
  // granted to super_admin/tenant_admin in permissions.ts, but a raw
  // permission alone can't express "only within a Tenant Admin's own
  // Tenant," so that scoping lives here, matching the satisfiesRoleKind
  // convention of putting scope resolution in RolesService rather than
  // in permissions.ts). Nobody can impersonate themselves, and nobody can
  // impersonate a Super Admin (no scope is ever "above" one).
  async canImpersonate(
    actorId: number,
    targetUserId: number,
  ): Promise<{ allowed: boolean; targetRoles: UserRoles }> {
    const targetRoles = await this.getUserRoles(targetUserId);

    if (actorId === targetUserId || targetRoles.isSuperAdmin) {
      return { allowed: false, targetRoles };
    }

    const actorRoles = await this.getUserRoles(actorId);
    if (actorRoles.isSuperAdmin) {
      return { allowed: true, targetRoles };
    }
    if (actorRoles.tenantAdminTenantIds.length === 0) {
      return { allowed: false, targetRoles };
    }

    const targetFootprint = await this.resolveTenantFootprint(targetRoles);
    const allowed = actorRoles.tenantAdminTenantIds.some((t) => targetFootprint.has(t));
    return { allowed, targetRoles };
  }

  canAccess(roles: UserRoles, projectId: number, tier: 'viewer' | 'editor' | 'admin' | 'super_admin'): boolean {
    if (roles.isSuperAdmin) return true;
    if (tier === 'super_admin') return false;
    if (tier === 'admin') return roles.adminProjectIds.includes(projectId);
    if (tier === 'editor') {
      return roles.adminProjectIds.includes(projectId) || roles.editorProjectIds.includes(projectId);
    }
    // 'viewer' — any project-scoped role at all, including the
    // previously-unreachable developer{id}/viewer{id} grants.
    return (
      roles.adminProjectIds.includes(projectId) ||
      roles.editorProjectIds.includes(projectId) ||
      roles.developerProjectIds.includes(projectId) ||
      roles.viewerProjectIds.includes(projectId)
    );
  }
}
