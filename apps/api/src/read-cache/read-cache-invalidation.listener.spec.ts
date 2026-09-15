import { describe, expect, it, vi } from 'vitest';
import { ReadCacheInvalidationListener } from './read-cache-invalidation.listener.js';
import { ReadCacheService } from './read-cache.service.js';

describe('ReadCacheInvalidationListener', () => {
  it('invalidates the project+collection prefix on content.published/updated/deleted', async () => {
    const cache = { deleteByPrefix: vi.fn() };
    const listener = new ReadCacheInvalidationListener(cache as any);
    const payload = { projectId: 1, contentId: 5, collectionId: 9 };
    const expectedPrefix = ReadCacheService.projectCollectionPrefix(1, 9);

    await listener.onContentPublished(payload);
    await listener.onContentUpdated(payload);
    await listener.onContentDeleted(payload);

    expect(cache.deleteByPrefix).toHaveBeenCalledTimes(3);
    expect(cache.deleteByPrefix).toHaveBeenCalledWith(expectedPrefix);
  });

  it('logs and skips (does not throw) when a payload is missing collectionId', async () => {
    const cache = { deleteByPrefix: vi.fn() };
    const listener = new ReadCacheInvalidationListener(cache as any);

    await expect(listener.onContentUpdated({ projectId: 1, contentId: 5 })).resolves.toBeUndefined();
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });
});
