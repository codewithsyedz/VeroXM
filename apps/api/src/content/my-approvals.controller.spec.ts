import { describe, expect, it, vi } from 'vitest';

// Same reason as content.service.spec.ts: MyApprovalsController's own
// `@Controller()` + constructor param typed `ContentService` forces the
// real ContentService -> RolesService -> PrismaService chain to load as
// runtime values, and PrismaService extends the real PrismaClient, which
// crashes in this environment over a pre-existing binary/host mismatch
// unrelated to this controller. Mocking PrismaService avoids it.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { MyApprovalsController } from './my-approvals.controller.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 (extended) -- the one piece of
// logic MyApprovalsController owns itself (everything else is
// ContentService.getPendingApprovalsForUser, already covered) is turning
// the JWT's `sub` claim into the numeric userId that query is keyed on.
// `Number(req.user?.sub) || 0` has two easy-to-get-wrong edges -- a
// missing user, and a non-numeric sub -- both of which silently fall
// through to userId 0 rather than throwing, so pinning down that exact
// behavior (rather than assuming it "just works") matters here.

function makeController(pendingResult: unknown = []) {
  const contentService = {
    getPendingApprovalsForUser: vi.fn().mockResolvedValue(pendingResult),
  };
  const controller = new MyApprovalsController(contentService as any);
  return { controller, contentService };
}

describe('MyApprovalsController.getPending', () => {
  it("extracts the numeric userId from the JWT's sub claim and delegates to ContentService", () => {
    const { controller, contentService } = makeController();

    controller.getPending({ user: { sub: '42' } } as any);

    expect(contentService.getPendingApprovalsForUser).toHaveBeenCalledWith(42);
  });

  it('accepts sub already as a number, not only a string', () => {
    const { controller, contentService } = makeController();

    controller.getPending({ user: { sub: 42 } } as any);

    expect(contentService.getPendingApprovalsForUser).toHaveBeenCalledWith(42);
  });

  it('falls back to userId 0 -- rather than throwing -- when the request has no user at all', () => {
    const { controller, contentService } = makeController();

    controller.getPending({} as any);

    expect(contentService.getPendingApprovalsForUser).toHaveBeenCalledWith(0);
  });

  it('falls back to userId 0 when sub is present but not numeric', () => {
    const { controller, contentService } = makeController();

    controller.getPending({ user: { sub: 'not-a-number' } } as any);

    expect(contentService.getPendingApprovalsForUser).toHaveBeenCalledWith(0);
  });

  it("returns whatever ContentService resolves, unmodified", async () => {
    const items = [{ requestId: 1 }, { requestId: 2 }];
    const { controller } = makeController(items);

    const result = await controller.getPending({ user: { sub: '1' } } as any);

    expect(result).toBe(items);
  });
});
