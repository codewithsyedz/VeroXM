import { describe, expect, it, vi } from 'vitest';

// RolesService's constructor param is typed `PrismaService` and the class
// carries `@Injectable()`, so with emitDecoratorMetadata on, the compiled
// output references the real PrismaService class as a *value* (Nest's DI
// needs it in `design:paramtypes` at runtime), not just as a type -- even
// though every test below passes a hand-built fake object cast `as any`
// and never touches it. PrismaService `extends PrismaClient` from
// `@mycms/db`, and merely loading that real class in this environment
// eagerly tries to load the Prisma query engine binary, which was
// generated on the developer's Mac (darwin-arm64) and doesn't match this
// shell's linux-arm64 host -- an unrelated, pre-existing environment
// mismatch (see docs/RBAC-TENANT-RECOMMENDATION.md's Prisma-generate note),
// not anything about RolesService's own logic. Mocking the module out
// keeps that irrelevant failure from leaking into this suite as an
// unhandled rejection.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { RolesService, type UserRoles } from './roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 -- the first automated test
// coverage for this engagement's authorization surface. RolesService is
// the one place every role-name string in `model_has_roles` gets turned
// into the structured UserRoles object every other authorization check in
// this codebase (ProjectRoleGuard, PermissionGuard, ContentService's
// approval checks, MyApprovalsController's cross-project scan) reads --
// a silent regression here would silently misauthorize everywhere at
// once, which is exactly why it's the first thing covered rather than,
// say, a single controller.
//
// Unit-level only, with a hand-built fake PrismaService (no real DB
// connection -- this dev environment's local shell can't reach the
// Dockerized MySQL instance at all, only the running api/web containers
// can, so a real integration/e2e suite has to run inside the api
// container itself; see this section's own note in the doc for why that
// wasn't attempted here).
function fakePrisma(overrides: {
  modelHasRole?: unknown[];
  customRole?: unknown[];
  project?: unknown[];
}) {
  return {
    modelHasRole: { findMany: vi.fn().mockResolvedValue(overrides.modelHasRole ?? []) },
    customRole: { findMany: vi.fn().mockResolvedValue(overrides.customRole ?? []) },
    project: { findMany: vi.fn().mockResolvedValue(overrides.project ?? []) },
  };
}

function roleRow(name: string) {
  return { role: { name } };
}

describe('RolesService.getUserRoles', () => {
  it('parses direct project-tier grants and leaves the expansion queries untouched', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('editor18'), roleRow('viewer5')],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(42);

    expect(roles.isSuperAdmin).toBe(false);
    expect(roles.editorProjectIds).toEqual([18]);
    expect(roles.viewerProjectIds).toEqual([5]);
    expect(roles.adminProjectIds).toEqual([]);
    expect(roles.directAdminProjectIds).toEqual([]);
    // No Tenant/Department Admin grant at all -- the inherited-project
    // expansion query must never fire, since it exists purely to widen
    // scoped-admin access into adminProjectIds.
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('a super_admin grant short-circuits the inherited-project expansion even alongside a department_admin grant', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('super_admin'), roleRow('department_admin3')],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(1);

    expect(roles.isSuperAdmin).toBe(true);
    expect(roles.departmentAdminDepartmentIds).toEqual([3]);
    // The expansion guard is `!isSuperAdmin && (...)` -- a Super Admin's
    // access is already unconditional (every check starts with an
    // isSuperAdmin bypass), so running the expansion query for them would
    // be pure waste, not a correctness issue, but it's still the
    // documented intent worth pinning down.
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('expands a Department Admin grant into adminProjectIds without touching directAdminProjectIds', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('department_admin3')],
      project: [{ id: 10 }, { id: 11 }],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(2);

    expect(roles.departmentAdminDepartmentIds).toEqual([3]);
    expect(roles.adminProjectIds.sort()).toEqual([10, 11]);
    // This is the whole reason directAdminProjectIds exists separately --
    // see satisfiesRoleKind's own tests below for why the distinction
    // matters.
    expect(roles.directAdminProjectIds).toEqual([]);
  });

  it('expands a Tenant Admin grant into adminProjectIds via the department.tenantId filter', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('tenant_admin7')],
      project: [{ id: 50 }],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(3);

    expect(roles.tenantAdminTenantIds).toEqual([7]);
    expect(roles.adminProjectIds).toEqual([50]);
  });

  it('de-duplicates a project id already held directly against one the expansion also returns', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('admin5'), roleRow('department_admin3')],
      // The DB would legitimately return project 5 again here (it really
      // is in Department 3), plus a genuinely new project 6.
      project: [{ id: 5 }, { id: 6 }],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(4);

    expect(roles.directAdminProjectIds).toEqual([5]);
    expect(roles.adminProjectIds.sort()).toEqual([5, 6]);
  });

  it('parses a custom_role grant into customRoleGrants with its permissions JSON decoded', async () => {
    const prisma = fakePrisma({
      modelHasRole: [roleRow('custom_role9')],
      customRole: [{ id: 9, departmentId: 4, permissions: '["content:read","content:approve"]' }],
    });
    const service = new RolesService(prisma as any);

    const roles = await service.getUserRoles(5);

    expect(roles.customRoleGrants).toEqual([
      { customRoleId: 9, departmentId: 4, permissions: ['content:read', 'content:approve'] },
    ]);
  });
});

describe('RolesService.satisfiesRoleKind', () => {
  const service = new RolesService({} as any);

  function roles(overrides: Partial<UserRoles>): UserRoles {
    return {
      isSuperAdmin: false,
      adminProjectIds: [],
      editorProjectIds: [],
      tenantAdminTenantIds: [],
      departmentAdminDepartmentIds: [],
      developerProjectIds: [],
      viewerProjectIds: [],
      directAdminProjectIds: [],
      customRoleGrants: [],
      ...overrides,
    };
  }

  it('a Super Admin satisfies every kind regardless of context', () => {
    const r = roles({ isSuperAdmin: true });
    expect(service.satisfiesRoleKind(r, 'admin', {})).toBe(true);
    expect(service.satisfiesRoleKind(r, 'department_admin', {})).toBe(true);
    expect(service.satisfiesRoleKind(r, 'tenant_admin', {})).toBe(true);
  });

  it("'admin' kind checks directAdminProjectIds, not the inherited adminProjectIds", () => {
    // A Department Admin whose scope was expanded to include project 7
    // (adminProjectIds), but who was never granted admin{7} directly.
    const r = roles({ adminProjectIds: [7], directAdminProjectIds: [] });
    expect(service.satisfiesRoleKind(r, 'admin', { projectId: 7 })).toBe(false);

    const direct = roles({ adminProjectIds: [7], directAdminProjectIds: [7] });
    expect(service.satisfiesRoleKind(direct, 'admin', { projectId: 7 })).toBe(true);
  });

  it("'department_admin' kind has no fallback to tenantAdminTenantIds -- a Tenant Admin alone does not satisfy it", () => {
    // Live-verified during §11.8: a pure Tenant Admin (no direct
    // Department Admin grant) does NOT satisfy a department_admin-kind
    // approval step -- there is no such hierarchy in this file. Pinning
    // that down here so it can't quietly regress into "helpfully" wider.
    const tenantOnly = roles({ tenantAdminTenantIds: [1] });
    expect(service.satisfiesRoleKind(tenantOnly, 'department_admin', { departmentId: 1, tenantId: 1 })).toBe(
      false,
    );

    const deptAdmin = roles({ departmentAdminDepartmentIds: [1] });
    expect(service.satisfiesRoleKind(deptAdmin, 'department_admin', { departmentId: 1 })).toBe(true);
  });

  it("'tenant_admin' kind checks tenantAdminTenantIds only", () => {
    const r = roles({ tenantAdminTenantIds: [9] });
    expect(service.satisfiesRoleKind(r, 'tenant_admin', { tenantId: 9 })).toBe(true);
    expect(service.satisfiesRoleKind(r, 'tenant_admin', { tenantId: 10 })).toBe(false);
  });

  it('returns false when the relevant context field is missing entirely', () => {
    const r = roles({ directAdminProjectIds: [1], departmentAdminDepartmentIds: [1], tenantAdminTenantIds: [1] });
    expect(service.satisfiesRoleKind(r, 'admin', {})).toBe(false);
    expect(service.satisfiesRoleKind(r, 'department_admin', {})).toBe(false);
    expect(service.satisfiesRoleKind(r, 'tenant_admin', {})).toBe(false);
  });
});
