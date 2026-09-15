import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { CDN_PURGE_QUEUE } from './queue-names.js';

export interface CdnPurgeJobData {
  projectId: number;
}

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- the worker side
// of the CDN-purge reference integration. Re-reads the config at run time
// (rather than trusting anything passed in the job) for the same reason
// WebhookDeliveryProcessor re-reads its webhook: the job sat in a delay
// queue for a few seconds (the coalescing window
// CdnPurgeConfigsService.maybeEnqueuePurge sets up), during which the
// config could have been disabled or deleted.
//
// Only Cloudflare is implemented -- see
// CdnPurgeConfigsService.SUPPORTED_CDN_PROVIDERS's own comment on why
// that's a deliberate scope decision, not a gap.
@Processor(CDN_PURGE_QUEUE)
export class CdnPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(CdnPurgeProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CdnPurgeJobData>): Promise<void> {
    const { projectId } = job.data;
    const config = await this.prisma.cdnPurgeConfig.findUnique({ where: { projectId } });
    if (!config || !config.enabled) {
      // Disabled/deleted since this was enqueued -- nothing to purge, and
      // not a failure: there's nothing left to retry either.
      return;
    }

    if (config.provider !== 'cloudflare') {
      this.logger.warn(`CDN purge config for project ${projectId} has unsupported provider "${config.provider}" -- skipping`);
      return;
    }

    // Cloudflare's purge_cache API: https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache
    // `purge_everything: true` is the blunt option -- a targeted
    // (by-URL/by-tag) purge would need this codebase to track which CDN
    // URLs correspond to which cached content, which doesn't exist yet;
    // "purge everything for this zone on any change" is what actually
    // proves the pattern end-to-end without inventing a URL-mapping layer
    // this plan never scoped.
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const attempt = job.attemptsMade + 1;
      throw new Error(`CDN purge failed for project ${projectId} (status=${res.status}, attempt=${attempt})`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CdnPurgeJobData> | undefined): void {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(`CDN purge for project ${job.data.projectId} gave up after ${job.attemptsMade} attempt(s)`);
    }
  }
}
