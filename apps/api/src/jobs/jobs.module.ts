import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3 -- the BullMQ/Redis
// background job queue, last P0 foundation piece. This module owns the
// one shared Redis connection (docker-compose.yml's new `redis` service,
// reachable at REDIS_URL inside the internal network only, same
// isolation convention as `db`) and registers it application-wide via
// `forRoot`, so a feature module only ever has to call
// `BullModule.registerQueue({ name: ... })` for the queue(s) it owns --
// see webhooks.module.ts for the first consumer.
//
// @Global() + exporting BullModule is what makes `forRoot`'s connection
// visible to `registerQueue` calls in other modules without every one of
// them re-importing JobsModule's providers by hand.
@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
