import { describe, expect, it, vi } from 'vitest';

// See roles.service.spec.ts for why this mock exists: PrismaService
// `extends PrismaClient`, and ContentService's own `@Injectable()` +
// constructor-typed `PrismaService`/`RolesService` params force Nest's
// decorator-metadata emission to reference the real PrismaService class as
// a *value* at import time (not just a type), which eagerly loads a Prisma
// query engine binary that was generated for the developer's Mac
// (darwin-arm64) and doesn't match this shell's linux-arm64 host. This is
// the same pre-existing, unrelated environment mismatch documented in
// docs/RBAC-TENANT-RECOMMENDATION.md's Prisma-generate note, not anything
// about the code under test -- and it happens transitively (ContentService
// -> RolesService -> PrismaService), so mocking PrismaService alone is
// enough to keep it out of every layer.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { ContentService } from './content.service.js';
import type { FieldRow } from './content-field-codec.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 -- covers
// ContentService.getPendingApprovalsForUser, the query backing the nav-bar
// approvals bell (§11.8). Three things matter enough here to pin down with
// tests rather than trust by inspection alone: (1) it must actually reuse
// satisfiesRoleKind's real authorization decision per request, not some
// parallel check that could drift from it; (2) the trashed-content
// exclusion that fixed a real live ghost-notification bug must not
// regress; (3) the title-resolution fallback (missing/empty display field
// -> `#<id>`) must degrade the same way ContentService.list() already does,
// not show something misleading in a notification a user can't dismiss.
//
// Unit-level only, with hand-built fake Prisma/RolesService objects --
// see roles.service.spec.ts's own note on why no real DB connection is
// available to this shell.

function fieldRow(overrides: Partial<FieldRow> & Pick<FieldRow, 'id' | 'name'>): FieldRow {
  return { type: 'text', validations: null, ...overrides };
}

function metaRow(contentId: number, fieldName: string, value: string | null) {
  return { id: 1, contentId, fieldName, value };
}

interface BuildRequestOptions {
  requestId: number;
  contentId: number;
  currentStepOrder: number;
  stepOrders: number[];
  requiredRoleKind: string;
  projectId: number;
  departmentId?: number;
  tenantId?: number;
  contentDeletedAt?: Date | null;
  fields: FieldRow[];
  meta: Array<{ id: number; contentId: number; fieldName: string; value: string | null }>;
  submittedAt?: Date | null;
}

function buildRequest(opts: BuildRequestOptions) {
  return {
    id: opts.requestId,
    currentStepOrder: opts.currentStepOrder,
    submittedAt: opts.submittedAt ?? new Date('2026-01-01T00:00:00Z'),
    workflow: {
      steps: opts.stepOrders.map((stepOrder) => ({ stepOrder, requiredRoleKind: opts.requiredRoleKind })),
    },
    content: {
      id: opts.contentId,
      collectionId: 900,
      deletedAt: opts.contentDeletedAt ?? null,
      meta: opts.meta,
      collection: { name: 'Articles', fields: opts.fields },
      project: {
        id: opts.projectId,
        name: `Project ${opts.projectId}`,
        department:
          opts.departmentId === undefined
            ? null
            : { id: opts.departmentId, tenantId: opts.tenantId ?? null },
      },
    },
  };
}

function makeService(requests: unknown[], satisfies: (kind: string, scope: unknown) => boolean) {
  const prisma = {
    contentApprovalRequest: { findMany: vi.fn().mockResolvedValue(requests) },
  };
  const rolesService = {
    getUserRoles: vi.fn().mockResolvedValue({ fake: 'roles' }),
    satisfiesRoleKind: vi.fn((_roles: unknown, kind: string, scope: unknown) => satisfies(kind, scope)),
  };
  const service = new ContentService(prisma as any, rolesService as any);
  return { service, prisma, rolesService };
}

describe('ContentService.getPendingApprovalsForUser', () => {
  it('queries only pending requests on non-trashed content -- regression guard for the live ghost-notification fix', async () => {
    const { service, prisma } = makeService([], () => true);

    await service.getPendingApprovalsForUser(7);

    expect(prisma.contentApprovalRequest.findMany).toHaveBeenCalledTimes(1);
    const call = prisma.contentApprovalRequest.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ status: 'pending', content: { deletedAt: null } });
  });

  it('keeps a request only when satisfiesRoleKind approves its current step, using the real per-request scope', async () => {
    const requests = [
      buildRequest({
        requestId: 1,
        contentId: 101,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'department_admin',
        projectId: 17,
        departmentId: 1,
        tenantId: 3,
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [metaRow(101, 'title', 'Needs Dept Admin')],
      }),
      buildRequest({
        requestId: 2,
        contentId: 102,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'tenant_admin',
        projectId: 18,
        departmentId: 2,
        tenantId: 4,
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [metaRow(102, 'title', 'Needs Tenant Admin')],
      }),
    ];
    // Only the department_admin-kind request (scoped to department 1) is
    // satisfied -- proves filtering is per-request, not all-or-nothing.
    const { service, rolesService } = makeService(requests, (kind, scope: any) => {
      return kind === 'department_admin' && scope.departmentId === 1;
    });

    const items = await service.getPendingApprovalsForUser(9);

    expect(items).toHaveLength(1);
    expect(items[0].requestId).toBe(1);
    expect(items[0].title).toBe('Needs Dept Admin');
    // The scope passed to satisfiesRoleKind must reflect this request's own
    // project/department/tenant, not a stale or shared object.
    expect(rolesService.satisfiesRoleKind).toHaveBeenCalledWith(
      { fake: 'roles' },
      'department_admin',
      { projectId: 17, departmentId: 1, tenantId: 3 },
    );
    expect(rolesService.satisfiesRoleKind).toHaveBeenCalledWith(
      { fake: 'roles' },
      'tenant_admin',
      { projectId: 18, departmentId: 2, tenantId: 4 },
    );
  });

  it('skips a request whose currentStepOrder no longer matches any step on its workflow', async () => {
    const requests = [
      buildRequest({
        requestId: 3,
        contentId: 103,
        currentStepOrder: 5, // workflow only has step 1 -- e.g. steps were edited after submission
        stepOrders: [1],
        requiredRoleKind: 'admin',
        projectId: 20,
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [metaRow(103, 'title', 'Orphaned step')],
      }),
    ];
    const { service } = makeService(requests, () => true);

    const items = await service.getPendingApprovalsForUser(1);

    expect(items).toHaveLength(0);
  });

  it('falls back to the first field\'s value when there is no title/name field at all', async () => {
    // displayField is `fields.find(title|name) ?? fields[0]` -- with no
    // title/name field, it's the collection's first field, not an
    // automatic '#<id>'. The '#<id>' fallback only kicks in when whatever
    // displayField resolves to is itself empty (covered below).
    const requests = [
      buildRequest({
        requestId: 4,
        contentId: 104,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'admin',
        projectId: 21,
        fields: [fieldRow({ id: 1, name: 'summary' })],
        meta: [metaRow(104, 'summary', 'not a title field')],
      }),
    ];
    const { service } = makeService(requests, () => true);

    const items = await service.getPendingApprovalsForUser(1);

    expect(items[0].title).toBe('not a title field');
  });

  it('falls back to "#<contentId>" when there is no title/name field and the first field\'s value is empty', async () => {
    const requests = [
      buildRequest({
        requestId: 8,
        contentId: 108,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'admin',
        projectId: 25,
        fields: [fieldRow({ id: 1, name: 'summary' })],
        meta: [], // no meta row for 'summary' -> decodeFieldValue returns ''
      }),
    ];
    const { service } = makeService(requests, () => true);

    const items = await service.getPendingApprovalsForUser(1);

    expect(items[0].title).toBe('#108');
  });

  it('falls back to "#<contentId>" when the title field exists but decodes to an empty value', async () => {
    const requests = [
      buildRequest({
        requestId: 5,
        contentId: 105,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'admin',
        projectId: 22,
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [], // no meta row for 'title' at all -> decodeFieldValue returns ''
      }),
    ];
    const { service } = makeService(requests, () => true);

    const items = await service.getPendingApprovalsForUser(1);

    expect(items[0].title).toBe('#105');
  });

  it('uses the real stored title when present, and builds the href from project/collection/content ids', async () => {
    const requests = [
      buildRequest({
        requestId: 6,
        contentId: 106,
        currentStepOrder: 2,
        stepOrders: [1, 2],
        requiredRoleKind: 'tenant_admin',
        projectId: 23,
        departmentId: 8,
        tenantId: 99,
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [metaRow(106, 'title', 'Q3 Announcement')],
      }),
    ];
    const { service } = makeService(requests, () => true);

    const items = await service.getPendingApprovalsForUser(1);

    expect(items[0]).toMatchObject({
      requestId: 6,
      contentId: 106,
      projectId: 23,
      collectionId: 900,
      collectionName: 'Articles',
      title: 'Q3 Announcement',
      requiredRoleKind: 'tenant_admin',
      stepOrder: 2,
      totalSteps: 2,
      href: '/projects/23/collections/900/content/106',
    });
  });

  it('treats a project with no department as departmentId/tenantId undefined in the scope, not a thrown error', async () => {
    const requests = [
      buildRequest({
        requestId: 7,
        contentId: 107,
        currentStepOrder: 1,
        stepOrders: [1],
        requiredRoleKind: 'admin',
        projectId: 24,
        // no departmentId passed -> department: null on the fake project
        fields: [fieldRow({ id: 1, name: 'title' })],
        meta: [metaRow(107, 'title', 'No department')],
      }),
    ];
    const { service, rolesService } = makeService(requests, () => true);

    await service.getPendingApprovalsForUser(1);

    expect(rolesService.satisfiesRoleKind).toHaveBeenCalledWith(
      { fake: 'roles' },
      'admin',
      { projectId: 24, departmentId: undefined, tenantId: undefined },
    );
  });
});

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 (extended) -- approveContent,
// rejectContent, and trash. Unlike getPendingApprovalsForUser (a read that
// can only ever surface something a user could act on), these are the
// actual write paths -- the tests below focus on exactly what could make
// them unsafe or silently wrong: acting without the authorization check
// passing, advancing past the true last step, and (for trash) not
// actually stamping the deletedAt the approvals-bell notification query
// (§11.8) depends on to exclude trashed content.

interface PendingRequestSpec {
  id: number;
  currentStepOrder: number;
  stepOrders: number[];
  requiredRoleKind: string;
}

function makeApprovalActionService(opts: {
  content: { id: number; projectId: number; collectionId: number; deletedAt: Date | null } | null;
  pendingRequest: PendingRequestSpec | null;
  project?: { id: number; departmentId?: number; tenantId?: number };
  satisfies: boolean;
}) {
  const requestRow = opts.pendingRequest
    ? {
        id: opts.pendingRequest.id,
        currentStepOrder: opts.pendingRequest.currentStepOrder,
        workflow: {
          steps: opts.pendingRequest.stepOrders.map((stepOrder) => ({
            stepOrder,
            requiredRoleKind: opts.pendingRequest!.requiredRoleKind,
          })),
        },
      }
    : null;

  const prisma = {
    content: {
      findFirst: vi.fn().mockResolvedValue(opts.content),
      update: vi.fn().mockResolvedValue(undefined),
    },
    contentApprovalRequest: {
      findFirst: vi.fn().mockResolvedValue(requestRow),
      update: vi.fn().mockResolvedValue(undefined),
    },
    contentApprovalAction: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    contentMeta: {
      updateMany: vi.fn().mockResolvedValue(undefined),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(
        opts.project
          ? {
              id: opts.project.id,
              department:
                opts.project.departmentId === undefined
                  ? null
                  : { id: opts.project.departmentId, tenantId: opts.project.tenantId ?? null },
            }
          : null,
      ),
    },
    // Real Prisma's array-form $transaction awaits already-created
    // operation promises -- Promise.all mirrors that closely enough for
    // these tests, which only assert on the individual mocked calls.
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const rolesService = {
    getUserRoles: vi.fn().mockResolvedValue({ fake: 'roles' }),
    satisfiesRoleKind: vi.fn().mockReturnValue(opts.satisfies),
  };

  const service = new ContentService(prisma as any, rolesService as any);
  return { service, prisma, rolesService };
}

describe('ContentService.approveContent', () => {
  it('throws NotFoundException when the content itself does not exist (or is trashed) in this project/collection', async () => {
    const { service, prisma } = makeApprovalActionService({ content: null, pendingRequest: null, satisfies: true });

    await expect(service.approveContent(1, 2, 123, 9)).rejects.toThrow('Content 123 not found');
    expect(prisma.contentApprovalRequest.findFirst).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when there is no pending approval request for this content', async () => {
    const { service } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: null,
      satisfies: true,
    });

    await expect(service.approveContent(1, 2, 123, 9)).rejects.toThrow(
      'No pending approval request for this content',
    );
  });

  it('throws NotFoundException when currentStepOrder does not match any step on the workflow', async () => {
    const { service } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 55, currentStepOrder: 5, stepOrders: [1], requiredRoleKind: 'admin' },
      satisfies: true,
    });

    await expect(service.approveContent(1, 2, 123, 9)).rejects.toThrow('Workflow step 5 not found');
  });

  it('throws ForbiddenException naming the required role kind, and creates no action, when the actor does not satisfy the current step', async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 55, currentStepOrder: 1, stepOrders: [1, 2], requiredRoleKind: 'department_admin' },
      project: { id: 1 },
      satisfies: false,
    });

    await expect(service.approveContent(1, 2, 123, 9)).rejects.toThrow(
      'Approving step 1 requires the department_admin role',
    );
    expect(prisma.contentApprovalAction.create).not.toHaveBeenCalled();
  });

  it('advances to the next step (without publishing) when approving a non-final step', async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 55, currentStepOrder: 1, stepOrders: [1, 2], requiredRoleKind: 'admin' },
      project: { id: 1 },
      satisfies: true,
    });

    const result = await service.approveContent(1, 2, 123, 9, 'looks good');

    expect(prisma.contentApprovalAction.create).toHaveBeenCalledWith({
      data: { requestId: 55, stepOrder: 1, actorId: 9, action: 'approved', comment: 'looks good' },
    });
    expect(prisma.contentApprovalRequest.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { currentStepOrder: 2 },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'pending_approval', currentStepOrder: 2, totalSteps: 2 });
  });

  it('publishes the content via a transaction when approving the final step', async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 55, currentStepOrder: 2, stepOrders: [1, 2], requiredRoleKind: 'admin' },
      project: { id: 1 },
      satisfies: true,
    });

    const result = await service.approveContent(1, 2, 123, 9);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contentApprovalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 }, data: expect.objectContaining({ status: 'approved' }) }),
    );
    expect(prisma.content.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 123 }, data: expect.objectContaining({ publishedBy: 9 }) }),
    );
    expect(result).toEqual({ status: 'published' });
  });
});

describe('ContentService.rejectContent', () => {
  it('throws ForbiddenException and creates no record when the actor does not satisfy the current step', async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 60, currentStepOrder: 1, stepOrders: [1], requiredRoleKind: 'tenant_admin' },
      project: { id: 1 },
      satisfies: false,
    });

    await expect(service.rejectContent(1, 2, 123, 9)).rejects.toThrow(
      'Rejecting step 1 requires the tenant_admin role',
    );
    expect(prisma.contentApprovalAction.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a rejected action and marks the whole request rejected via a transaction, not just the step', async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: { id: 60, currentStepOrder: 1, stepOrders: [1, 2], requiredRoleKind: 'admin' },
      project: { id: 1 },
      satisfies: true,
    });

    const result = await service.rejectContent(1, 2, 123, 9, 'not ready');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contentApprovalAction.create).toHaveBeenCalledWith({
      data: { requestId: 60, stepOrder: 1, actorId: 9, action: 'rejected', comment: 'not ready' },
    });
    expect(prisma.contentApprovalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 60 }, data: expect.objectContaining({ status: 'rejected' }) }),
    );
    expect(result).toEqual({ status: 'rejected' });
  });
});

describe('ContentService.trash', () => {
  it('throws NotFoundException when the content does not exist in this project/collection, and updates nothing', async () => {
    const { service, prisma } = makeApprovalActionService({ content: null, pendingRequest: null, satisfies: true });

    await expect(service.trash(1, 2, 123)).rejects.toThrow('Content 123 not found');
    expect(prisma.contentMeta.updateMany).not.toHaveBeenCalled();
    expect(prisma.content.update).not.toHaveBeenCalled();
  });

  it("soft-deletes both content and its meta rows with a real deletedAt timestamp -- what the approvals-bell trash exclusion (§11.8) depends on", async () => {
    const { service, prisma } = makeApprovalActionService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      pendingRequest: null,
      satisfies: true,
    });

    await service.trash(1, 2, 123);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contentMeta.updateMany).toHaveBeenCalledWith({
      where: { contentId: 123 },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.content.update).toHaveBeenCalledWith({
      where: { id: 123 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9 (third pass) -- restore/remove
// (the same mustExist-then-mutate shape as trash, but each with its own
// twist on which content is even visible to look up) and
// getApprovalStatus's own canAct/history-shaping logic, which the earlier
// passes only exercised indirectly through satisfiesRoleKind itself.

function makeRestoreRemoveService(opts: {
  content: { id: number; projectId: number; collectionId: number; deletedAt: Date | null } | null;
}) {
  const prisma = {
    content: {
      findFirst: vi.fn().mockResolvedValue(opts.content),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    contentMeta: {
      updateMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const rolesService = { getUserRoles: vi.fn(), satisfiesRoleKind: vi.fn() };
  const service = new ContentService(prisma as any, rolesService as any);
  return { service, prisma };
}

describe('ContentService.restore', () => {
  it('throws NotFoundException naming the content id when no trashed content matches', async () => {
    const { service, prisma } = makeRestoreRemoveService({ content: null });

    await expect(service.restore(1, 2, 123)).rejects.toThrow('Trashed content 123 not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only looks for content that is actually trashed (deletedAt not null) -- restoring only makes sense for trashed content', async () => {
    const { service, prisma } = makeRestoreRemoveService({ content: null });

    await expect(service.restore(1, 2, 123)).rejects.toThrow();

    expect(prisma.content.findFirst).toHaveBeenCalledWith({
      where: { id: 123, projectId: 1, collectionId: 2, deletedAt: { not: null } },
    });
  });

  it('clears deletedAt on both content and its meta rows via a transaction when trashed content is found', async () => {
    const { service, prisma } = makeRestoreRemoveService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: new Date() },
    });

    await service.restore(1, 2, 123);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contentMeta.updateMany).toHaveBeenCalledWith({
      where: { contentId: 123 },
      data: { deletedAt: null },
    });
    expect(prisma.content.update).toHaveBeenCalledWith({ where: { id: 123 }, data: { deletedAt: null } });
  });
});

describe('ContentService.remove', () => {
  it('throws NotFoundException when the content does not exist at all (trashed or not), and deletes nothing', async () => {
    const { service, prisma } = makeRestoreRemoveService({ content: null });

    await expect(service.remove(1, 2, 123)).rejects.toThrow('Content 123 not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('looks up content WITHOUT excluding trashed rows -- remove() must be able to hard-delete something already in the trash', async () => {
    const { service, prisma } = makeRestoreRemoveService({ content: null });

    await expect(service.remove(1, 2, 123)).rejects.toThrow();

    expect(prisma.content.findFirst).toHaveBeenCalledWith({
      where: { id: 123, projectId: 1, collectionId: 2 },
    });
  });

  it('hard-deletes meta rows then the content row itself via a transaction', async () => {
    const { service, prisma } = makeRestoreRemoveService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
    });

    await service.remove(1, 2, 123);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contentMeta.deleteMany).toHaveBeenCalledWith({ where: { contentId: 123 } });
    expect(prisma.content.delete).toHaveBeenCalledWith({ where: { id: 123 } });
  });
});

interface ApprovalStatusRequestSpec {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  currentStepOrder: number;
  workflowSteps: { stepOrder: number; requiredRoleKind: string }[];
  submittedBy?: number | null;
  submittedAt?: Date | null;
  decidedAt?: Date | null;
  actions?: { stepOrder: number; actorId: number; action: string; comment: string | null; createdAt: Date }[];
}

function makeApprovalStatusService(opts: {
  content: { id: number; projectId: number; collectionId: number; deletedAt: Date | null } | null;
  request: ApprovalStatusRequestSpec | null;
  project?: { id: number; departmentId?: number; tenantId?: number };
  satisfies: boolean;
}) {
  const prisma = {
    content: { findFirst: vi.fn().mockResolvedValue(opts.content) },
    contentApprovalRequest: {
      findFirst: vi.fn().mockResolvedValue(
        opts.request
          ? {
              id: opts.request.id,
              status: opts.request.status,
              currentStepOrder: opts.request.currentStepOrder,
              submittedBy: opts.request.submittedBy ?? null,
              submittedAt: opts.request.submittedAt ?? null,
              decidedAt: opts.request.decidedAt ?? null,
              workflow: { steps: opts.request.workflowSteps },
              actions: opts.request.actions ?? [],
            }
          : null,
      ),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(
        opts.project
          ? {
              id: opts.project.id,
              department:
                opts.project.departmentId === undefined
                  ? null
                  : { id: opts.project.departmentId, tenantId: opts.project.tenantId ?? null },
            }
          : null,
      ),
    },
  };
  const rolesService = {
    getUserRoles: vi.fn().mockResolvedValue({ fake: 'roles' }),
    satisfiesRoleKind: vi.fn().mockReturnValue(opts.satisfies),
  };
  const service = new ContentService(prisma as any, rolesService as any);
  return { service, prisma, rolesService };
}

describe('ContentService.getApprovalStatus', () => {
  it('throws NotFoundException when the content does not exist, looking it up WITHOUT excluding trashed content', async () => {
    const { service, prisma } = makeApprovalStatusService({ content: null, request: null, satisfies: false });

    await expect(service.getApprovalStatus(1, 2, 123, 9)).rejects.toThrow('Content 123 not found');
    // Deliberately includeTrashed=true here -- status should still be
    // readable for content that was trashed after being submitted.
    expect(prisma.content.findFirst).toHaveBeenCalledWith({ where: { id: 123, projectId: 1, collectionId: 2 } });
  });

  it('returns null when the content was never submitted through any approval workflow', async () => {
    const { service } = makeApprovalStatusService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      request: null,
      satisfies: false,
    });

    const result = await service.getApprovalStatus(1, 2, 123, 9);

    expect(result).toBeNull();
  });

  it('canAct is false without even resolving roles when the most recent request is no longer pending', async () => {
    const { service, rolesService } = makeApprovalStatusService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      request: {
        id: 1,
        status: 'approved',
        currentStepOrder: 2,
        workflowSteps: [
          { stepOrder: 1, requiredRoleKind: 'admin' },
          { stepOrder: 2, requiredRoleKind: 'admin' },
        ],
      },
      // satisfies: true would make canAct true if this were ever reached --
      // proving the false result comes from the status short-circuit, not
      // from a coincidentally-false role check.
      satisfies: true,
    });

    const result = await service.getApprovalStatus(1, 2, 123, 9);

    expect(result?.canAct).toBe(false);
    expect(rolesService.getUserRoles).not.toHaveBeenCalled();
  });

  it('canAct is false without resolving roles when a pending request points at a step no longer on the workflow', async () => {
    const { service, rolesService } = makeApprovalStatusService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      request: {
        id: 1,
        status: 'pending',
        currentStepOrder: 5,
        workflowSteps: [{ stepOrder: 1, requiredRoleKind: 'admin' }],
      },
      satisfies: true,
    });

    const result = await service.getApprovalStatus(1, 2, 123, 9);

    expect(result?.canAct).toBe(false);
    expect(rolesService.getUserRoles).not.toHaveBeenCalled();
  });

  it('resolves canAct via satisfiesRoleKind, using this project\'s own scope, when a pending request is at a real step', async () => {
    const { service, rolesService, prisma } = makeApprovalStatusService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      request: {
        id: 1,
        status: 'pending',
        currentStepOrder: 1,
        workflowSteps: [{ stepOrder: 1, requiredRoleKind: 'department_admin' }],
      },
      project: { id: 1, departmentId: 4, tenantId: 9 },
      satisfies: true,
    });

    const result = await service.getApprovalStatus(1, 2, 123, 9);

    expect(result?.canAct).toBe(true);
    expect(rolesService.getUserRoles).toHaveBeenCalledWith(9);
    expect(rolesService.satisfiesRoleKind).toHaveBeenCalledWith(
      { fake: 'roles' },
      'department_admin',
      { projectId: 1, departmentId: 4, tenantId: 9 },
    );
    expect(prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, include: { department: true } });
  });

  it('shapes the response from the workflow and action history -- totalSteps, per-step role kinds, and history in original order', async () => {
    const submittedAt = new Date('2026-01-01T00:00:00Z');
    const decidedAt = new Date('2026-01-02T00:00:00Z');
    const { service } = makeApprovalStatusService({
      content: { id: 123, projectId: 1, collectionId: 2, deletedAt: null },
      request: {
        id: 7,
        status: 'approved',
        currentStepOrder: 2,
        workflowSteps: [
          { stepOrder: 1, requiredRoleKind: 'admin' },
          { stepOrder: 2, requiredRoleKind: 'tenant_admin' },
        ],
        submittedBy: 3,
        submittedAt,
        decidedAt,
        actions: [
          { stepOrder: 1, actorId: 3, action: 'approved', comment: 'fine', createdAt: submittedAt },
          { stepOrder: 2, actorId: 9, action: 'approved', comment: null, createdAt: decidedAt },
        ],
      },
      satisfies: false,
    });

    const result = await service.getApprovalStatus(1, 2, 123, 9);

    expect(result).toMatchObject({
      id: 7,
      status: 'approved',
      currentStepOrder: 2,
      totalSteps: 2,
      steps: [
        { stepOrder: 1, requiredRoleKind: 'admin' },
        { stepOrder: 2, requiredRoleKind: 'tenant_admin' },
      ],
      submittedBy: 3,
      submittedAt,
      decidedAt,
      history: [
        { stepOrder: 1, actorId: 3, action: 'approved', comment: 'fine', createdAt: submittedAt },
        { stepOrder: 2, actorId: 9, action: 'approved', comment: null, createdAt: decidedAt },
      ],
    });
  });
});
