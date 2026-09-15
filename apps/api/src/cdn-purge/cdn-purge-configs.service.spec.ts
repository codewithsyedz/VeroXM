import { describe, expect, it, vi } from 'vitest';

// See webhooks.service.spec.ts / content.service.spec.ts for why this
// mock exists: an unrelated, pre-existing Prisma-engine-binary/host
// mismatch in this environment, not anything about the code under test.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { CdnPurgeConfigsService } from './cdn-purge-configs.service.js';

function buildService() {
  const prisma = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
    cdnPurgeConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const queue = { add: vi.fn().mockResolvedValue({}) };
  const service = new CdnPurgeConfigsService(prisma as any, queue as any);
  return { service, prisma, queue };
}

describe('CdnPurgeConfigsService', () => {
  it('get() returns null when unconfigured, and never exposes the api token', async () => {
    const { service, prisma } = buildService();
    prisma.cdnPurgeConfig.findUnique.mockResolvedValueOnce(null);
    await expect(service.get(1)).resolves.toBeNull();

    prisma.cdnPurgeConfig.findUnique.mockResolvedValueOnce({
      provider: 'cloudflare',
      zoneId: 'zone-1',
      apiToken: 'super-secret',
      enabled: true,
      updatedAt: null,
    });
    const summary = await service.get(1);
    expect(summary).toEqual({ provider: 'cloudflare', zoneId: 'zone-1', enabled: true, hasApiToken: true, updatedAt: null });
    expect(summary).not.toHaveProperty('apiToken');
  });

  it('upsert() rejects an unsupported provider', async () => {
    const { service } = buildService();
    await expect(service.upsert(1, { provider: 'fastly', zoneId: 'z', apiToken: 't', enabled: true })).rejects.toThrow(/Unsupported CDN provider/);
  });

  it('upsert() rejects a missing zone id', async () => {
    const { service } = buildService();
    await expect(service.upsert(1, { provider: 'cloudflare', zoneId: '  ', apiToken: 't', enabled: true })).rejects.toThrow(/zone id/);
  });

  it('upsert() requires an api token on first-time setup', async () => {
    const { service, prisma } = buildService();
    prisma.cdnPurgeConfig.findUnique.mockResolvedValue(null);
    await expect(service.upsert(1, { provider: 'cloudflare', zoneId: 'z', enabled: true })).rejects.toThrow(/API token is required/);
  });

  it('upsert() keeps the existing api token when updating without one', async () => {
    const { service, prisma } = buildService();
    prisma.cdnPurgeConfig.findUnique.mockResolvedValue({ provider: 'cloudflare', zoneId: 'old-zone', apiToken: 'existing', enabled: true });
    prisma.cdnPurgeConfig.upsert.mockResolvedValue({ provider: 'cloudflare', zoneId: 'new-zone', apiToken: 'existing', enabled: false, updatedAt: null });

    await service.upsert(1, { provider: 'cloudflare', zoneId: 'new-zone', enabled: false });

    const call = prisma.cdnPurgeConfig.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('apiToken');
    expect(call.update.zoneId).toBe('new-zone');
  });

  it('event listener enqueues a coalesced, delayed purge job when a config is enabled', async () => {
    const { service, prisma, queue } = buildService();
    prisma.cdnPurgeConfig.findUnique.mockResolvedValue({ enabled: true });

    await service.onContentPublished({ projectId: 1, contentId: 2 });

    expect(queue.add).toHaveBeenCalledWith('purge', { projectId: 1 }, { jobId: 'purge-1', delay: 5_000 });
  });

  it('event listener does nothing when no config exists or it is disabled', async () => {
    const { service, prisma, queue } = buildService();
    prisma.cdnPurgeConfig.findUnique.mockResolvedValueOnce(null);
    await service.onContentUpdated({ projectId: 1, contentId: 2 });

    prisma.cdnPurgeConfig.findUnique.mockResolvedValueOnce({ enabled: false });
    await service.onContentDeleted({ projectId: 1, contentId: 2 });

    expect(queue.add).not.toHaveBeenCalled();
  });
});
