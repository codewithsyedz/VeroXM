import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CdnPurgeController } from './cdn-purge.controller.js';
import { CdnPurgeConfigsService } from './cdn-purge-configs.service.js';
import { CdnPurgeProcessor } from './cdn-purge.processor.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { CDN_PURGE_QUEUE } from './queue-names.js';

@Module({
  imports: [
    AuthModule,
    AuthzModule,
    BullModule.registerQueue({
      name: CDN_PURGE_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    }),
  ],
  controllers: [CdnPurgeController],
  // CdnPurgeConfigsService is both the CRUD service AND the @OnEvent
  // listener that enqueues purges (see its own comment) -- same
  // single-provider-does-both shape as WebhooksService.
  // CdnPurgeProcessor is the queue's worker-side consumer.
  providers: [CdnPurgeConfigsService, CdnPurgeProcessor],
})
export class CdnPurgeModule {}
