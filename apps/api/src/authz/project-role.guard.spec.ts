import { describe, expect, it, vi } from 'vitest';

// See roles.service.spec.ts's own note: ProjectRoleGuard's `@Injectable()`
// + constructor param typed `RolesService` forces Nest's decorator
// metadata to reference the real RolesService class as a runtime value,
// which in turn references the real PrismaService (which extends
// PrismaClient) the same way -- eagerly loading a Prisma query engine
// binary that doesn't match this shell's host. Mocking PrismaService here
// keeps that unrelated, pre-existing environment issue out of this suite.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { ProjectRoleGuard } from './project-role.guard.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 (extended) -- ProjectRoleGuard
// is the gate every admin-module route relies on to turn "is this a valid
// logged-in user" into "is this user allowed to touch THIS project."
// Getting any of its request-shape assumptions wrong (which param holds
// the project id, what counts as authenticated, when the route opted out
// entirely) would open or close every guarded route at once.

function fakeReflector(required: unknown) {
  return { get: vi.fn().mockReturnValue(required) } as any;
}

function fakeContext(request: Record<string, unknown>) {
  return {
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function makeGuard(required: unknown, canAccessResult: boolean, rolesResult: unknown = { fake: 'roles' }) {
  const rolesService = {
    getUserRoles: vi.fn().mockResolvedValue(rolesResult),
    canAccess: vi.fn().mockReturnValue(canAccessResult),
  };
  const reflector = fakeReflector(required);
  const guard = new ProjectRoleGuard(rolesService as any, reflector);
  return { guard, rolesService, reflector };
}

describe('ProjectRoleGuard', () => {
  it('passes through untouched when the route never opted in (no @RequireProjectRole metadata)', async () => {
    const { guard, rolesService } = makeGuard(undefined, true);
    const request = { user: undefined, params: {} };

    const result = await guard.canActivate(fakeContext(request));

    expect(result).toBe(true);
    expect(rolesService.getUserRoles).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before ever resolving roles', async () => {
    const { guard, rolesService } = makeGuard('editor', true);
    const request = { user: undefined, params: { projectId: '17' } };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow('Not authenticated');
    expect(rolesService.getUserRoles).not.toHaveBeenCalled();
  });

  it('rejects when neither :projectId nor :id is present on the route', async () => {
    const { guard, rolesService } = makeGuard('editor', true);
    const request = { user: { sub: '5' }, params: {} };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow('No project context for this route');
    expect(rolesService.getUserRoles).not.toHaveBeenCalled();
  });

  it('reads the project id from :projectId when present', async () => {
    const { guard, rolesService } = makeGuard('editor', true);
    const request = { user: { sub: '5' }, params: { projectId: '17' } };

    const result = await guard.canActivate(fakeContext(request));

    expect(result).toBe(true);
    expect(rolesService.canAccess).toHaveBeenCalledWith({ fake: 'roles' }, 17, 'editor');
  });

  it("falls back to :id when :projectId is absent -- ProjectsController's own route shape", async () => {
    const { guard, rolesService } = makeGuard('admin', true);
    const request = { user: { sub: '5' }, params: { id: '9' } };

    await guard.canActivate(fakeContext(request));

    expect(rolesService.canAccess).toHaveBeenCalledWith({ fake: 'roles' }, 9, 'admin');
  });

  it('grants access and attaches the resolved roles to the request when canAccess approves', async () => {
    const roles = { fake: 'roles', marker: 'attached' };
    const { guard } = makeGuard('editor', true, roles);
    const request: Record<string, unknown> = { user: { sub: '5' }, params: { projectId: '17' } };

    const result = await guard.canActivate(fakeContext(request));

    expect(result).toBe(true);
    expect(request.projectRoles).toBe(roles);
  });

  it('throws a tier- and project-specific ForbiddenException when canAccess denies', async () => {
    const { guard } = makeGuard('admin', false);
    const request = { user: { sub: '5' }, params: { projectId: '17' } };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow('Requires admin access to project 17');
  });
});
