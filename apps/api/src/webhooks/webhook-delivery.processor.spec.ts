import { describe, expect, it, vi } from 'vitest';

// See webhooks.service.spec.ts / content.service.spec.ts for why this
// mock exists: webhook-delivery.processor.ts imports WebhooksService,
// whose constructor-typed PrismaService param forces Nest's
// decorator-metadata emission to reference the real PrismaService class
// as a *value* at import time, which eagerly loads a Prisma query engine
// binary built for the developer's Mac, not this shell's host -- an
// unrelated, pre-existing environment mismatch, not anything about the
// code under test.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { WebhookDeliveryProcessor } from './webhook-delivery.processor.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3 -- the one piece of
// behavior that actually matters here: process() must throw on a failed
// delivery (that's the only signal BullMQ has to schedule a retry /
// eventually give up), and must NOT throw on success. Everything else
// (signing, logging, retry count) belongs to WebhooksService.deliverAttempt,
// already covered in webhooks.service.spec.ts.

function fakeJob(data: { webhookId: number; event: string; payload: unknown }, attemptsMade = 0) {
  return { data, attemptsMade, opts: { attempts: 5 } } as any;
}

describe('WebhookDeliveryProcessor', () => {
  it('does not throw when the delivery attempt succeeds', async () => {
    const webhooksService = { deliverAttempt: vi.fn().mockResolvedValue({ ok: true, responseStatus: 200 }) };
    const processor = new WebhookDeliveryProcessor(webhooksService as any);

    await expect(processor.process(fakeJob({ webhookId: 1, event: 'content.published', payload: {} }, 0))).resolves.toBeUndefined();
    expect(webhooksService.deliverAttempt).toHaveBeenCalledWith(1, 'content.published', {}, 1);
  });

  it('throws when the delivery attempt fails, so BullMQ retries/gives up', async () => {
    const webhooksService = { deliverAttempt: vi.fn().mockResolvedValue({ ok: false, responseStatus: 500 }) };
    const processor = new WebhookDeliveryProcessor(webhooksService as any);

    await expect(processor.process(fakeJob({ webhookId: 2, event: 'content.updated', payload: {} }, 2))).rejects.toThrow(/attempt=3/);
    expect(webhooksService.deliverAttempt).toHaveBeenCalledWith(2, 'content.updated', {}, 3);
  });

  it('only logs a warning once retries are actually exhausted', () => {
    const webhooksService = { deliverAttempt: vi.fn() };
    const processor = new WebhookDeliveryProcessor(webhooksService as any);
    const logger = { warn: vi.fn() };
    (processor as any).logger = logger;

    processor.onFailed(fakeJob({ webhookId: 3, event: 'content.deleted', payload: {} }, 2));
    expect(logger.warn).not.toHaveBeenCalled();

    processor.onFailed(fakeJob({ webhookId: 3, event: 'content.deleted', payload: {} }, 5));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
