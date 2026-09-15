import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ReadCacheService } from './read-cache.service.js';

// Mirrors WebhooksService's own ContentEventPayload shape
// (apps/api/src/webhooks/webhooks.service.ts) -- redefined locally rather
// than imported so this module has no compile-time dependency on the
// webhooks feature; both listen to the same global EventEmitter2 events,
// emitted by ContentService/PublicContentWriteService, without either
// module needing to import the other.
interface ContentEventPayload {
  projectId: number;
  contentId: number;
  collectionId?: number;
}

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- the invalidation
// half of the read-path cache. Deliberately coarse: any real state change
// to a collection's content clears every cached read for that
// project+collection (see ReadCacheService.deleteByPrefix's own comment),
// rather than trying to reason about which cached query results a single
// content row's change could have affected.
@Injectable()
export class ReadCacheInvalidationListener {
  private readonly logger = new Logger(ReadCacheInvalidationListener.name);

  constructor(private readonly cache: ReadCacheService) {}

  @OnEvent('content.published')
  async onContentPublished(payload: ContentEventPayload): Promise<void> {
    await this.invalidate(payload);
  }

  @OnEvent('content.updated')
  async onContentUpdated(payload: ContentEventPayload): Promise<void> {
    await this.invalidate(payload);
  }

  @OnEvent('content.deleted')
  async onContentDeleted(payload: ContentEventPayload): Promise<void> {
    await this.invalidate(payload);
  }

  private async invalidate(payload: ContentEventPayload): Promise<void> {
    if (payload.collectionId === undefined) {
      // Every real emitter always sets this -- but the shared type marks
      // it optional, and silently skipping invalidation on a missing id
      // would be a worse failure mode (stale cached reads with no visible
      // signal) than just logging and moving on.
      this.logger.warn(
        `content event for project ${payload.projectId} had no collectionId -- skipping cache invalidation`,
      );
      return;
    }
    const prefix = ReadCacheService.projectCollectionPrefix(payload.projectId, payload.collectionId);
    await this.cache.deleteByPrefix(prefix);
  }
}
