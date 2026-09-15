import { afterEach, describe, expect, it, vi } from 'vitest';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- ReadCacheService
// opens a real ioredis connection in its constructor (lazyConnect: true,
// so no socket is actually opened until a command runs) -- this shell has
// no Redis to connect to, so the 'ioredis' module itself is mocked the
// same way PrismaService is mocked elsewhere in this test suite: a fake
// standing in for the real client, with every command a plain vi.fn().
const redisInstances: any[] = [];
vi.mock('ioredis', () => {
  class FakeRedis {
    get = vi.fn();
    set = vi.fn();
    scan = vi.fn();
    del = vi.fn();
    on = vi.fn();
    quit = vi.fn().mockResolvedValue(undefined);
    constructor(..._args: unknown[]) {
      redisInstances.push(this);
    }
  }
  return { Redis: FakeRedis };
});

import { ReadCacheService } from './read-cache.service.js';

function lastRedis() {
  return redisInstances[redisInstances.length - 1];
}

describe('ReadCacheService', () => {
  afterEach(() => {
    redisInstances.length = 0;
  });

  it('get() parses a JSON hit and returns undefined on a miss', async () => {
    const cache = new ReadCacheService();
    const redis = lastRedis();

    redis.get.mockResolvedValueOnce(JSON.stringify({ hello: 'world' }));
    await expect(cache.get('some-key')).resolves.toEqual({ hello: 'world' });

    redis.get.mockResolvedValueOnce(null);
    await expect(cache.get('missing-key')).resolves.toBeUndefined();
  });

  it('get() degrades to a miss (not a throw) when Redis errors', async () => {
    const cache = new ReadCacheService();
    const redis = lastRedis();
    redis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(cache.get('some-key')).resolves.toBeUndefined();
  });

  it('set() stores JSON with an EX ttl, and swallows Redis errors', async () => {
    const cache = new ReadCacheService();
    const redis = lastRedis();

    await cache.set('k', { a: 1 }, 30);
    expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 30);

    redis.set.mockRejectedValueOnce(new Error('down'));
    await expect(cache.set('k2', { b: 2 }, 30)).resolves.toBeUndefined();
  });

  it('deleteByPrefix() walks every SCAN cursor and deletes all matching keys', async () => {
    const cache = new ReadCacheService();
    const redis = lastRedis();

    redis.scan
      .mockResolvedValueOnce(['17', ['read-cache:project:1:collection:2:list:a']])
      .mockResolvedValueOnce(['0', ['read-cache:project:1:collection:2:list:b']]);
    redis.del.mockResolvedValue(1);

    const deleted = await cache.deleteByPrefix('read-cache:project:1:collection:2:');

    expect(redis.scan).toHaveBeenCalledTimes(2);
    expect(redis.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'read-cache:project:1:collection:2:*', 'COUNT', 200);
    expect(redis.scan).toHaveBeenNthCalledWith(2, '17', 'MATCH', 'read-cache:project:1:collection:2:*', 'COUNT', 200);
    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(deleted).toBe(2);
  });

  it('deleteByPrefix() degrades to zero deleted (not a throw) when Redis errors', async () => {
    const cache = new ReadCacheService();
    const redis = lastRedis();
    redis.scan.mockRejectedValueOnce(new Error('down'));

    await expect(cache.deleteByPrefix('read-cache:project:1:')).resolves.toBe(0);
  });

  it('listKey()/byIdKey() are stable regardless of options key order', () => {
    const keyA = ReadCacheService.listKey(1, 2, { limit: 10, sort: 'id:asc' });
    const keyB = ReadCacheService.listKey(1, 2, { sort: 'id:asc', limit: 10 });
    expect(keyA).toBe(keyB);
    expect(keyA.startsWith(ReadCacheService.projectCollectionPrefix(1, 2))).toBe(true);

    const keyDifferent = ReadCacheService.listKey(1, 2, { limit: 20, sort: 'id:asc' });
    expect(keyDifferent).not.toBe(keyA);

    const byId1 = ReadCacheService.byIdKey(1, 2, 5, true);
    const byId2 = ReadCacheService.byIdKey(1, 2, 5, false);
    expect(byId1).not.toBe(byId2);
  });
});
