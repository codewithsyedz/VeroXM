import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- read-path cache,
// reusing the Redis instance §3.3 already stood up for the job queue (same
// docker-compose `redis` service, different key namespace: `read-cache:`
// here vs. BullMQ's own internal keys). A SEPARATE ioredis connection from
// BullMQ's -- sharing a raw client with a library that issues its own
// blocking/streaming commands is asking for subtle contention bugs, and a
// plain client is all a cache needs.
//
// Deliberately best-effort: every method swallows Redis errors and logs a
// warning rather than throwing. A cache is a speed optimization -- if
// Redis is down, degrading to "every read hits MySQL" is correct;
// breaking the public API because the cache is unavailable is not.
@Injectable()
export class ReadCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadCacheService.name);
  private readonly redis: Redis;
  private readonly defaultTtlSeconds: number;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      // Don't let a cache lookup hang a request on a stuck connection --
      // fail fast and treat it as a miss instead.
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    this.redis.on('error', (err: Error) => {
      this.logger.warn(`Read-cache Redis error (degrading to cache-miss): ${err.message}`);
    });
    this.defaultTtlSeconds = Number(process.env.READ_CACHE_TTL_SECONDS ?? 60);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Read-cache GET failed for ${key}: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Read-cache SET failed for ${key}: ${(err as Error).message}`);
    }
  }

  // Invalidates every cached read for one project+collection in a single
  // call -- deliberately coarse (not per-query-string) so a
  // content.published/updated/deleted event never has to know which exact
  // cached queries it might have affected. Uses SCAN (cursor-based,
  // non-blocking) rather than KEYS, which is fine at dev/demo data volumes
  // but would want a maintained secondary index (a Redis SET of live keys
  // per collection) if the keyspace ever grows large enough for SCAN's
  // O(N) full-keyspace walk to matter.
  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [nextCursor, keys]: [string, string[]] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          200,
        );
        cursor = nextCursor;
        if (keys.length) {
          deleted += await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Read-cache invalidation failed for prefix ${prefix}: ${(err as Error).message}`);
    }
    return deleted;
  }

  static projectCollectionPrefix(projectId: number, collectionId: number): string {
    return `read-cache:project:${projectId}:collection:${collectionId}:`;
  }

  static listKey(projectId: number, collectionId: number, options: unknown): string {
    return `${ReadCacheService.projectCollectionPrefix(projectId, collectionId)}list:${stableHash(options)}`;
  }

  static byIdKey(projectId: number, collectionId: number, id: number, timestamps: boolean): string {
    return `${ReadCacheService.projectCollectionPrefix(projectId, collectionId)}byId:${id}:${timestamps ? 't1' : 't0'}`;
  }
}

// Stable regardless of key insertion order -- two logically-identical
// ListOptions objects (same fields, different property order depending on
// how the caller built the query object) must hash to the same cache key,
// or every request would look like a unique query and nothing would ever
// hit.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableHash(value: unknown): string {
  const json = JSON.stringify(sortKeysDeep(value));
  return crypto.createHash('sha1').update(json).digest('hex');
}
