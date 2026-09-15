import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WEBHOOK_DELIVERY_QUEUE } from '../jobs/queue-names.js';
import { WebhooksService } from './webhooks.service.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3 -- the retrying
// half of the webhook engine. WebhooksService.fanOut() (the @OnEvent
// listeners) only ever enqueues; this is the one place that actually
// performs an HTTP delivery attempt for a real (non-test) event. Kept as
// a thin wrapper around WebhooksService.deliverAttempt() rather than its
// own copy of the fetch/HMAC/log logic, so sendTest() (immediate,
// unqueued, single-attempt) and this (queued, retried, N attempts) share
// exactly one implementation of "what a delivery attempt is."
export interface WebhookDeliveryJobData {
  webhookId: number;
  event: string;
  payload: unknown;
}

@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { webhookId, event, payload } = job.data;
    // BullMQ's attemptsMade is 0 on a job's first run -- +1 so the
    // WebhookDelivery.attempt column reads 1, 2, 3, ... like a human
    // would count them, matching sendTest()'s own `attempt: 1`.
    const attempt = job.attemptsMade + 1;
    const result = await this.webhooksService.deliverAttempt(webhookId, event, payload, attempt);
    if (!result.ok) {
      // Throwing is how BullMQ learns this attempt failed: it schedules
      // the next retry per the queue's defaultJobOptions backoff
      // (registered in webhooks.module.ts), or -- once `attempts` is
      // exhausted -- moves the job into its own failed set. The
      // WebhookDelivery row for this attempt was already written by
      // deliverAttempt() regardless, so nothing here is lost either way.
      throw new Error(
        `Webhook ${webhookId} delivery failed (event=${event}, attempt=${attempt}, status=${result.responseStatus ?? 'network error'})`,
      );
    }
  }

  // Fires on every failed attempt, not only the final one (BullMQ quirk:
  // a job that will still be retried briefly passes through the same
  // 'failed' worker event before being re-delayed) -- only log once the
  // configured attempts are actually exhausted, so this isn't just noisy
  // duplicate logging of what's already in the WebhookDelivery table.
  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookDeliveryJobData> | undefined): void {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `Webhook ${job.data.webhookId} delivery gave up after ${job.attemptsMade} attempt(s) (event=${job.data.event})`,
      );
    }
  }
}
