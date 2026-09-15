import { beforeEach, describe, expect, it, vi } from 'vitest';

// See content.service.spec.ts for why this mock exists: a real
// PrismaService import transitively loads a Prisma query engine binary
// built for the developer's Mac, not this shell's host -- an unrelated,
// pre-existing environment mismatch, not anything about the code under
// test.
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class FakePrismaServiceForDecoratorMetadata {},
}));

import { PublicContentService } from './public-content.service.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- proves the
// cache-aside wiring actually short-circuits the DB on a hit, not just
// that ReadCacheService's own methods work in isolation (see
// read-cache.service.spec.ts for that). Uses a trivial collection (no
// fields, no meta) so shapeContent()'s per-field-type branches (media,
// relation, ...) never come into play -- those are pre-existing,
// untouched by this work, and out of scope here.

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

function buildService() {
  const collection = { id: 9, fields: [] as unknown[] };
  const prisma = {
    collection: { findFirst: vi.fn().mockResolvedValue(collection) },
    content: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  };
  const cache = fakeCache();
  const service = new PublicContentService(prisma as any, cache as any);
  return { service, prisma, cache };
}

describe('PublicContentService cache-aside read path', () => {
  it('list(): a second identical query is served from cache without hitting the DB again', async () => {
    const { service, prisma } = buildService();
    const contentRow = { id: 1, projectId: 1, collectionId: 9, locale: 'en', createdAt: null, updatedAt: null, publishedAt: new Date(), meta: [] };
    prisma.content.findMany
      .mockResolvedValueOnce([{ id: 1 }]) // universe scan
      .mockResolvedValueOnce([contentRow]) // main query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([contentRow]);

    const first = await service.list(1, 'articles', {});
    expect(prisma.content.findMany).toHaveBeenCalledTimes(2);

    const second = await service.list(1, 'articles', {});
    // No new calls -- the second call was answered entirely from cache.
    expect(prisma.content.findMany).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it('list(): different query options produce independent cache entries', async () => {
    const { service, prisma } = buildService();
    prisma.content.findMany.mockResolvedValue([]);

    await service.list(1, 'articles', { limit: 10 });
    await service.list(1, 'articles', { limit: 20 });

    // Two genuinely different queries -- both must hit the DB, neither
    // should collide on the other's cache key.
    expect(prisma.content.findMany).toHaveBeenCalledTimes(4);
  });

  it('list(): count queries are cached too', async () => {
    const { service, prisma } = buildService();
    prisma.content.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.content.count.mockResolvedValue(42);

    const first = await service.list(1, 'articles', { count: true });
    const second = await service.list(1, 'articles', { count: true });

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(prisma.content.count).toHaveBeenCalledTimes(1);
  });

  it('getById(): a hit is served from cache; a 404 is never cached', async () => {
    const { service, prisma } = buildService();
    const contentRow = { id: 5, projectId: 1, collectionId: 9, locale: 'en', createdAt: null, updatedAt: null, publishedAt: new Date(), meta: [] };
    prisma.content.findFirst.mockResolvedValueOnce(contentRow);

    const first = await service.getById(1, 'articles', 5, false);
    expect(prisma.content.findFirst).toHaveBeenCalledTimes(1);

    const second = await service.getById(1, 'articles', 5, false);
    expect(prisma.content.findFirst).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    prisma.content.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById(1, 'articles', 999, false)).rejects.toThrow();
    prisma.content.findFirst.mockResolvedValueOnce(null);
    // A repeated miss hits the DB again -- confirms the earlier
    // NotFoundException was never written to the cache.
    await expect(service.getById(1, 'articles', 999, false)).rejects.toThrow();
    expect(prisma.content.findFirst).toHaveBeenCalledTimes(3);
  });
});
