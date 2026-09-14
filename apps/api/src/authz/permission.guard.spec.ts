import { describe, expect, it, vi } from 'vitest';

// Same reason as project-role.guard.spec.ts / roles.service.spec.ts:
// PermissionGuard's decorator metadata forces the real RolesService (and
// transitively PrismaService, which extends PrismaClient) to load as a
// runtime value, which crashes in this environment over an unrelated,
// pre-existing Prisma binary/host mismatch. Mocking PrismaService avoids it.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { PermissionGuard } from './permission.guard.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 (extended) -- PermissionGuard
// mirrors ProjectRoleGuard's request-shape handling exactly (see that
// guard's own spec for the shared assumptions) but checks a specific
// permission from the §5.4 catalog via getPermissionsForProjectId instead
// of a role tier via canAccess -- covering that distinct code path here
// rather than assuming it behaves identically just because it looks similar.

function fakeReflector(required: unknown) {
  return { get: vi.fn().mockReturnValue(required) } as any;
}

function fakeContext(request: Record<string, unknown>) {
  return {
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function makeGuard(required: unknown, permissions: Set<string>) {
  const rolesService = {
    getPermissionsForProjectId: vi.fn().mockResolvedValue(permissions),
  };
  const reflector = fakeReflector(required);
  const guard = new PermissionGuard(rolesService as any, reflector);
  return { guard, rolesService, reflector };
}

describe('PermissionGuard', () => {
  it('passes through untouched when the route never opted in (no @RequirePermission metadata)', async () => {
    const { guard, rolesService } = makeGuard(undefined, new Set());
    const request = { user: undefined, params: {} };

    const result = await guard.canActivate(fakeContext(request));

    expect(result).toBe(true);
    expect(rolesService.getPermissionsForProjectId).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before resolving permissions', async () => {
    const { guard, rolesService } = makeGuard('content:approve', new Set(['content:approve']));
    const request = { user: undefined, params: { projectId: '17' } };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow('Not authenticated');
    expect(rolesService.getPermissionsForProjectId).not.toHaveBeenCalled();
  });

  it('rejects when neither :projectId nor :id is present on the route', async () => {
    const { guard, rolesService } = makeGuard('content:approve', new Set(['content:approve']));
    const request = { user: { sub: '5' }, params: {} };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow('No project context for this route');
    expect(rolesService.getPermissionsForProjectId).not.toHaveBeenCalled();
  });

  it('resolves permissions for the request user/project and grants access when the required permission is present', async () => {
    const { guard, rolesService } = makeGuard('content:approve', new Set(['content:read', 'content:approve']));
    const request: Record<string, unknown> = { user: { sub: '5' }, params: { projectId: '17' } };

    const result = await guard.canActivate(fakeContext(request));

    expect(result).toBe(true);
    expect(rolesService.getPermissionsForProjectId).toHaveBeenCalledWith(5, 17);
    expect(request.permissions).toEqual(new Set(['content:read', 'content:approve']));
  });

  it('falls back to :id when :projectId is absent', async () => {
    const { guard, rolesService } = makeGuard('content:approve', new Set(['content:approve']));
    const request = { user: { sub: '5' }, params: { id: '9' } };

    await guard.canActivate(fakeContext(request));

    expect(rolesService.getPermissionsForProjectId).toHaveBeenCalledWith(5, 9);
  });

  it('throws a permission- and project-specific ForbiddenException when the permission is missing', async () => {
    const { guard } = makeGuard('content:approve', new Set(['content:read']));
    const request = { user: { sub: '5' }, params: { projectId: '17' } };

    await expect(guard.canActivate(fakeContext(request))).rejects.toThrow(
      'Requires content:approve on project 17',
    );
  });
});
