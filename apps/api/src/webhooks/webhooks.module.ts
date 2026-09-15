import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { WEBHOOK_DELIVERY_QUEUE } from '../jobs/queue-names.js';

@Module({
  imports: [
    AuthModule,
    AuthzModule,
    // JobsModule (imported once, globally, in AppModule) already
    // registered the shared Redis connection via BullModule.forRoot() --
    // this is the feature-owned half: the queue itself, plus the default
    // retry policy every job enqueued via WebhooksService.fanOut() picks
    // up automatically. docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md
    // §3.3.
    BullModule.registerQueue({
      name: WEBHOOK_DELIVERY_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        // 2s, 4s, 8s, 16s, 32s between attempts -- roughly half a minute
        // of retrying before a delivery is given up on, same order of
        // magnitude Stripe/GitHub both use for webhook retries.
        backoff: { type: 'exponential', delay: 2000 },
        // Keep the most recent 1000 finished jobs of each kind around
        // (rather than the library default of "forever" or "none") --
        // enough to inspect recent activity without the queue growing
        // unbounded. WebhookDelivery rows in MySQL are the durable,
        // queryable log; this is only the queue's own short-term view.
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    }),
  ],
  controllers: [WebhooksController],
  // WebhooksService is the CRUD/delivery service AND the @OnEvent
  // listener target -- Nest instantiates it once as a normal provider and
  // wires its @OnEvent-decorated methods up to the global EventEmitter2
  // registered in AppModule (EventEmitterModule.forRoot()), no separate
  // registration needed here. WebhookDeliveryProcessor is the queue's
  // worker-side consumer (see webhook-delivery.processor.ts) -- it must
  // be a provider here too, or BullMQ never starts a worker for this
  // queue and enqueued jobs simply sit unprocessed.
  providers: [WebhooksService, WebhookDeliveryProcessor],
})
export class WebhooksModule {}
