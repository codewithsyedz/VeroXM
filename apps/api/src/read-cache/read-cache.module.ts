import { Global, Module } from '@nestjs/common';
import { ReadCacheService } from './read-cache.service.js';
import { ReadCacheInvalidationListener } from './read-cache-invalidation.listener.js';

// @Global() + exported, same convention as JobsModule: PublicContentService
// (and any future consumer) injects ReadCacheService directly without
// re-importing this module, and ReadCacheInvalidationListener's @OnEvent
// handlers wire up to the app-wide EventEmitter2 (EventEmitterModule.forRoot()
// in AppModule) the same way WebhooksService's listeners already do.
@Global()
@Module({
  providers: [ReadCacheService, ReadCacheInvalidationListener],
  exports: [ReadCacheService],
})
export class ReadCacheModule {}
