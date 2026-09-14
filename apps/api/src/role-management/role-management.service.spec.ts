import { describe, expect, it, vi } from 'vitest';

// See roles.service.spec.ts for why this mock exists: PrismaService
// `extends PrismaClient`, and RoleManagementService's own `@Injectable()`
// + constructor-typed `PrismaService` param force Nest's decorator-metadata
// emission to reference the real PrismaService class as a *value* at
// import time (not just a type), which eagerly loads a Prisma query engine
// binary generated for the developer's Mac (darwin-arm64) that doesn't
// match this shell's linux-arm64 host -- the same pre-existing, unrelated
// environment mismatch documented throughout docs/RBAC-TENANT-RECOMMENDATION.md,
// not anything about the code under test.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { RoleManagementService } from './role-management.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.15 -- the first dedicated unit
// coverage for this module, added alongside the fix it verifies: closing
// the self-grant question §11.13 flagged as real but distinct from the
// privilege-escalation bug that section actually fixed. Covers exactly
// the guard assignProjectRole gained -- 'admin' self-grants blocked,
// everything else (other role kinds to yourself, 'admin' to someone else,
// the pre-existing not-found/invalid-role-kind checks) left working
// unchanged.
function fakePrisma(overrides: { users?: Record<string, { id: number; name: string; email: string }> }) {
  const users = overrides.users ?? {};
  return {
    user: {
      findUnique: vi.fn(({ where: { email } }: { where: { email: string } }) =>
        Promise.resolve(users[email] ?? null),
      ),
    },
    role: {
      upsert: vi.fn(({ where }: { where: { name_guardName: { name: string; guardName: string } } }) =>
        Promise.resolve({ id: 1, name: where.name_guardName.name, guardName: where.name_guardName.guardName }),
      ),
    },
    modelHasRole: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

const SELF = { id: 42, name: 'Self Admin', email: 'self-admin@example.test' };
const OTHER = { id: 99, name: 'Other User', email: 'other-user@example.test' };

describe('RoleManagementService.assignProjectRole', () => {
  it("blocks a caller granting the 'admin' role kind to their own email", async () => {
    const prisma = fakePrisma({ users: { [SELF.email]: SELF } });
    const service = new RoleManagementService(prisma as any);

    await expect(
      service.assignProjectRole(17, SELF.id, SELF.email, 'admin'),
    ).rejects.toThrow(/grant yourself the Admin role/);

    // Nothing should have been written -- the guard runs before any
    // role/grant upsert.
    expect(prisma.role.upsert).not.toHaveBeenCalled();
    expect(prisma.modelHasRole.upsert).not.toHaveBeenCalled();
  });

  it.each(['editor', 'developer', 'viewer'] as const)(
    "still allows a caller granting the '%s' role kind to their own email",
    async (roleKind) => {
      const prisma = fakePrisma({ users: { [SELF.email]: SELF } });
      const service = new RoleManagementService(prisma as any);

      const result = await service.assignProjectRole(17, SELF.id, SELF.email, roleKind);

      expect(result).toEqual({ userId: SELF.id, name: SELF.name, email: SELF.email, roleKind, source: 'direct' });
      expect(prisma.role.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.modelHasRole.upsert).toHaveBeenCalledTimes(1);
    },
  );

  it("still allows granting 'admin' to someone other than the caller", async () => {
    const prisma = fakePrisma({ users: { [OTHER.email]: OTHER } });
    const service = new RoleManagementService(prisma as any);

    const result = await service.assignProjectRole(17, SELF.id, OTHER.email, 'admin');

    expect(result).toEqual({ userId: OTHER.id, name: OTHER.name, email: OTHER.email, roleKind: 'admin', source: 'direct' });
    expect(prisma.role.upsert).toHaveBeenCalledTimes(1);
  });

  it('still rejects an unknown roleKind before touching the database', async () => {
    const prisma = fakePrisma({ users: { [OTHER.email]: OTHER } });
    const service = new RoleManagementService(prisma as any);

    await expect(
      service.assignProjectRole(17, SELF.id, OTHER.email, 'super_editor'),
    ).rejects.toThrow(/roleKind must be one of/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('still rejects a grant to an email with no matching account', async () => {
    const prisma = fakePrisma({ users: {} });
    const service = new RoleManagementService(prisma as any);

    await expect(
      service.assignProjectRole(17, SELF.id, 'nobody@example.test', 'editor'),
    ).rejects.toThrow(/No user with email/);
  });
});
