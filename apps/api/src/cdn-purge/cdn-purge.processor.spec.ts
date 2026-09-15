import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { CdnPurgeProcessor } from './cdn-purge.processor.js';

function fakeJob(data: { projectId: number }, attemptsMade = 0) {
  return { data, attemptsMade, opts: { attempts: 3 } } as any;
}

function buildProcessor(config: unknown) {
  const prisma = { cdnPurgeConfig: { findUnique: vi.fn().mockResolvedValue(config) } };
  const processor = new CdnPurgeProcessor(prisma as any);
  return { processor, prisma };
}

describe('CdnPurgeProcessor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops when the config was deleted or disabled since the job was enqueued', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { processor: noneProcessor } = buildProcessor(null);
    await expect(noneProcessor.process(fakeJob({ projectId: 1 }))).resolves.toBeUndefined();

    const { processor: disabledProcessor } = buildProcessor({ enabled: false, provider: 'cloudflare' });
    await expect(disabledProcessor.process(fakeJob({ projectId: 1 }))).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips (does not throw) an unsupported provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { processor } = buildProcessor({ enabled: true, provider: 'fastly', zoneId: 'z', apiToken: 't' });

    await expect(processor.process(fakeJob({ projectId: 1 }))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Cloudflare purge_cache endpoint with the zone id and bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const { processor } = buildProcessor({ enabled: true, provider: 'cloudflare', zoneId: 'zone-abc', apiToken: 'tok-123' });

    await processor.process(fakeJob({ projectId: 1 }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-abc/purge_cache');
    expect(init.headers.authorization).toBe('Bearer tok-123');
    expect(JSON.parse(init.body)).toEqual({ purge_everything: true });
  });

  it('throws on a non-2xx response so BullMQ retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { processor } = buildProcessor({ enabled: true, provider: 'cloudflare', zoneId: 'z', apiToken: 't' });

    await expect(processor.process(fakeJob({ projectId: 1 }, 1))).rejects.toThrow(/status=503/);
  });

  it('onFailed() only warns once retries are actually exhausted', () => {
    const { processor } = buildProcessor(null);
    const logger = { warn: vi.fn() };
    (processor as any).logger = logger;

    processor.onFailed(fakeJob({ projectId: 1 }, 1));
    expect(logger.warn).not.toHaveBeenCalled();

    processor.onFailed(fakeJob({ projectId: 1 }, 3));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
