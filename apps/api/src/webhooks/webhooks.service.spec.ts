import { afterEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';

// See content.service.spec.ts / roles.service.spec.ts for why this mock
// exists: PrismaService `extends PrismaClient`, and a real import
// transitively loads a Prisma query engine binary built for the
// developer's Mac, not this shell's host -- an unrelated, pre-existing
// environment mismatch, not anything about the code under test.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { WebhooksService } from './webhooks.service.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1/§3.3 -- covers the
// three things worth pinning down with a real test rather than trusting
// by inspection: (1) deliverAttempt() signs the body correctly and logs
// every outcome (success, non-2xx, network error) as its own
// WebhookDelivery row; (2) a webhook that's been deleted or disabled
// since a job was enqueued is treated as "nothing to retry", not a
// failure; (3) fanOut() (exercised via the @OnEvent handlers) enqueues
// one job per enabled, subscribed webhook -- and only sendTest() ever
// delivers synchronously/unqueued.

function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    webhook: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({}),
    },
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 42 }),
    },
    ...prismaOverrides,
  };
  const queue = { add: vi.fn().mockResolvedValue({}) };
  const service = new WebhooksService(prisma as any, queue as any);
  return { service, prisma, queue };
}

describe('WebhooksService.deliverAttempt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs the request body with the webhook secret and logs a successful delivery', async () => {
    const { service, prisma } = buildService();
    prisma.webhook.findUnique.mockResolvedValue({ id: 7, url: 'https://example.com/hook', secret: 'topsecret', enabled: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.deliverAttempt(7, 'content.published', { contentId: 1 }, 1);

    expect(result).toEqual({ ok: true, responseStatus: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(init.headers['x-veroxm-event']).toBe('content.published');

    const expectedSignature = crypto.createHmac('sha256', 'topsecret').update(init.body).digest('hex');
    expect(init.headers['x-veroxm-signature']).toBe(expectedSignature);

    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ webhookId: 7, event: 'content.published', attempt: 1, responseStatus: 200 }),
    });
    const loggedData = prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(loggedData.deliveredAt).toBeInstanceOf(Date);
    expect(loggedData.failedAt).toBeNull();
  });

  it('logs a non-2xx response as a failed attempt without throwing', async () => {
    const { service, prisma } = buildService();
    prisma.webhook.findUnique.mockResolvedValue({ id: 8, url: 'https://example.com/hook', secret: 's', enabled: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await service.deliverAttempt(8, 'content.updated', {}, 2);

    expect(result).toEqual({ ok: false, responseStatus: 500 });
    const loggedData = prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(loggedData.attempt).toBe(2);
    expect(loggedData.failedAt).toBeInstanceOf(Date);
    expect(loggedData.deliveredAt).toBeNull();
  });

  it('logs a network error (fetch throws) as a failed attempt with a null response status', async () => {
    const { service, prisma } = buildService();
    prisma.webhook.findUnique.mockResolvedValue({ id: 9, url: 'https://example.com/hook', secret: 's', enabled: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await service.deliverAttempt(9, 'content.deleted', {}, 1);

    expect(result).toEqual({ ok: false, responseStatus: null });
    const loggedData = prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(loggedData.responseStatus).toBeNull();
    expect(loggedData.failedAt).toBeInstanceOf(Date);
  });

  it('treats a deleted webhook as nothing left to retry, and logs nothing', async () => {
    const { service, prisma } = buildService();
    prisma.webhook.findUnique.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.deliverAttempt(123, 'content.published', {}, 3);

    expect(result).toEqual({ ok: true, responseStatus: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it('treats a disabled webhook the same way -- no delivery attempt, nothing logged', async () => {
    const { service, prisma } = buildService();
    prisma.webhook.findUnique.mockResolvedValue({ id: 10, url: 'https://example.com/hook', secret: 's', enabled: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.deliverAttempt(10, 'content.published', {}, 1);

    expect(result).toEqual({ ok: true, responseStatus: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
  });
});

describe('WebhooksService event fan-out', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enqueues one job per enabled webhook subscribed to the fired event, and skips the rest', async () => {
    const { service, prisma, queue } = buildService();
    prisma.webhook.findMany.mockResolvedValue([
      { id: 1, url: 'https://a.example/hook', secret: 's1', subscribedEvents: JSON.stringify(['content.published']) },
      { id: 2, url: 'https://b.example/hook', secret: 's2', subscribedEvents: JSON.stringify(['content.deleted']) },
      { id: 3, url: 'https://c.example/hook', secret: 's3', subscribedEvents: JSON.stringify(['content.published', 'content.updated']) },
    ]);

    await service.onContentPublished({ projectId: 42, contentId: 99 });

    expect(prisma.webhook.findMany).toHaveBeenCalledWith({ where: { projectId: 42, enabled: true } });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('deliver', { webhookId: 1, event: 'content.published', payload: { projectId: 42, contentId: 99 } });
    expect(queue.add).toHaveBeenCalledWith('deliver', { webhookId: 3, event: 'content.published', payload: { projectId: 42, contentId: 99 } });
  });

  it('sendTest() delivers immediately (attempt 1) and never touches the queue', async () => {
    const { service, prisma, queue } = buildService();
    prisma.webhook.findFirst.mockResolvedValue({ id: 5, projectId: 42, url: 'https://example.com/hook', secret: 's' });
    prisma.webhook.findUnique.mockResolvedValue({ id: 5, url: 'https://example.com/hook', secret: 's', enabled: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await service.sendTest(42, 5);

    expect(queue.add).not.toHaveBeenCalled();
    const loggedData = prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(loggedData.attempt).toBe(1);
  });
});
