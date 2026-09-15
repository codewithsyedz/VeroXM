import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { WEBHOOK_DELIVERY_QUEUE } from '../jobs/queue-names.js';
import type { WebhookDeliveryJobData } from './webhook-delivery.processor.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- the webhook/event
// engine, first P0 item of the advanced-use-cases plan. This is the
// generic mechanism only: per-project subscriptions, signed delivery, and
// a delivery log. The recommendation doc's own §4A point (pushing into a
// CRM, Slack, a search index, ...) needs no VeroXM-side code once this
// exists -- that's just a customer pointing a subscription's `url` at
// their own endpoint (or a Zapier/Make.com webhook trigger).
export const WEBHOOK_EVENT_TYPES = [
  'content.published',
  'content.updated',
  'content.deleted',
  'approval.requested',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookSummary {
  id: number;
  url: string;
  subscribedEvents: string[];
  enabled: boolean;
  createdAt: Date | null;
}

export interface IssuedWebhook extends WebhookSummary {
  // Only ever returned once, at creation -- same discipline as
  // ApiTokensService's plainTextToken: never stored in plaintext, never
  // returned again by list().
  secret: string;
}

export interface WebhookDeliverySummary {
  id: number;
  event: string;
  responseStatus: number | null;
  attempt: number;
  deliveredAt: Date | null;
  failedAt: Date | null;
  createdAt: Date | null;
}

// Fired by ContentService/PublicContentWriteService at the point a real
// state transition happens -- see those files' own comments for exactly
// which branch emits which event.
export interface ContentEventPayload {
  projectId: number;
  contentId: number;
  collectionId?: number;
}

function parseEvents(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isValidEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3 -- real (non-test)
    // deliveries are enqueued here rather than fetch()'d inline; see
    // webhook-delivery.processor.ts for the consumer side.
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly deliveryQueue: Queue<WebhookDeliveryJobData>,
  ) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private async loadOwned(projectId: number, webhookId: number) {
    await this.loadProjectOrThrow(projectId);
    const row = await this.prisma.webhook.findFirst({ where: { id: webhookId, projectId } });
    if (!row) throw new NotFoundException(`Webhook ${webhookId} not found for this project`);
    return row;
  }

  async list(projectId: number): Promise<WebhookSummary[]> {
    await this.loadProjectOrThrow(projectId);
    const rows = await this.prisma.webhook.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row: { id: number; url: string; subscribedEvents: string; enabled: boolean; createdAt: Date | null }) => ({
      id: row.id,
      url: row.url,
      subscribedEvents: parseEvents(row.subscribedEvents),
      enabled: row.enabled,
      createdAt: row.createdAt,
    }));
  }

  async create(projectId: number, url: string, subscribedEvents: string[]): Promise<IssuedWebhook> {
    await this.loadProjectOrThrow(projectId);

    const trimmedUrl = url?.trim();
    if (!trimmedUrl) throw new ForbiddenException('A webhook URL is required');
    let parsed: URL;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      throw new ForbiddenException('The webhook URL is not valid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ForbiddenException('The webhook URL must be http or https');
    }

    const events = (subscribedEvents ?? []).filter(isValidEventType);
    if (!events.length) throw new ForbiddenException('At least one valid event type is required');

    // 32 random bytes, hex-encoded -- same "any sufficiently random source
    // is fine" reasoning ApiTokensService.issue() already documents for
    // its own secret; this one signs deliveries (HMAC) rather than
    // authenticating requests, but the randomness requirement is the same.
    const secret = crypto.randomBytes(32).toString('hex');

    const row = await this.prisma.webhook.create({
      data: {
        projectId,
        url: trimmedUrl,
        secret,
        subscribedEvents: JSON.stringify(events),
        enabled: true,
      },
    });

    return {
      id: row.id,
      url: row.url,
      subscribedEvents: events,
      enabled: row.enabled,
      createdAt: row.createdAt,
      secret,
    };
  }

  async update(
    projectId: number,
    webhookId: number,
    patch: { url?: string; subscribedEvents?: string[]; enabled?: boolean },
  ): Promise<WebhookSummary> {
    const row = await this.loadOwned(projectId, webhookId);
    const data: Record<string, unknown> = {};

    if (patch.url !== undefined) {
      const trimmed = patch.url.trim();
      try {
        new URL(trimmed);
      } catch {
        throw new ForbiddenException('The webhook URL is not valid');
      }
      data.url = trimmed;
    }
    if (patch.subscribedEvents !== undefined) {
      const events = patch.subscribedEvents.filter(isValidEventType);
      if (!events.length) throw new ForbiddenException('At least one valid event type is required');
      data.subscribedEvents = JSON.stringify(events);
    }
    if (patch.enabled !== undefined) data.enabled = patch.enabled;

    const updated = await this.prisma.webhook.update({ where: { id: row.id }, data });
    return {
      id: updated.id,
      url: updated.url,
      subscribedEvents: parseEvents(updated.subscribedEvents),
      enabled: updated.enabled,
      createdAt: updated.createdAt,
    };
  }

  async remove(projectId: number, webhookId: number): Promise<void> {
    const row = await this.loadOwned(projectId, webhookId);
    await this.prisma.webhook.delete({ where: { id: row.id } });
  }

  async deliveries(projectId: number, webhookId: number): Promise<WebhookDeliverySummary[]> {
    await this.loadOwned(projectId, webhookId);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(
      (row: {
        id: number;
        event: string;
        responseStatus: number | null;
        attempt: number;
        deliveredAt: Date | null;
        failedAt: Date | null;
        createdAt: Date | null;
      }) => ({
        id: row.id,
        event: row.event,
        responseStatus: row.responseStatus,
        attempt: row.attempt,
        deliveredAt: row.deliveredAt,
        failedAt: row.failedAt,
        createdAt: row.createdAt,
      }),
    );
  }

  // Manual "send test event" action -- proves a URL/secret pair is wired
  // correctly before anything real fires, same role `sendTest` plays for
  // any comparable integrations feature.
  async sendTest(projectId: number, webhookId: number): Promise<void> {
    const row = await this.loadOwned(projectId, webhookId);
    // Deliberately NOT queued -- "send test" is a manual, synchronous
    // action in the dashboard UI; the person clicking it wants an
    // immediate pass/fail, not "check back in a minute." Real events
    // (fanOut(), below) go through the queue instead.
    await this.deliverAttempt(row.id, 'content.published', { test: true, projectId }, 1);
  }

  // --- Event listeners ---------------------------------------------
  // One handler per event name rather than a single catch-all listener --
  // @OnEvent pattern-matches on the string Nest routes to this method, and
  // this keeps each handler's payload shape unambiguous (all four happen
  // to share ContentEventPayload today, but that's not guaranteed to stay
  // true as more event types are added).

  @OnEvent('content.published')
  async onContentPublished(payload: ContentEventPayload): Promise<void> {
    await this.fanOut('content.published', payload);
  }

  @OnEvent('content.updated')
  async onContentUpdated(payload: ContentEventPayload): Promise<void> {
    await this.fanOut('content.updated', payload);
  }

  @OnEvent('content.deleted')
  async onContentDeleted(payload: ContentEventPayload): Promise<void> {
    await this.fanOut('content.deleted', payload);
  }

  @OnEvent('approval.requested')
  async onApprovalRequested(payload: ContentEventPayload): Promise<void> {
    await this.fanOut('approval.requested', payload);
  }

  private async fanOut(event: WebhookEventType, payload: ContentEventPayload): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { projectId: payload.projectId, enabled: true },
    });
    for (const webhook of webhooks as Array<{ id: number; url: string; secret: string; subscribedEvents: string }>) {
      if (!parseEvents(webhook.subscribedEvents).includes(event)) continue;
      // Enqueue and move on -- retry/backoff (attempts + exponential
      // backoff configured on the queue in webhooks.module.ts) and the
      // actual delivery attempt both live in
      // webhook-delivery.processor.ts now, not here. Only the webhook id
      // crosses into the job payload (not its secret/url) so a later
      // attempt always re-reads current data -- a webhook disabled or
      // deleted between enqueue and processing is handled there, not by
      // trying to cancel an already-queued job.
      await this.deliveryQueue.add('deliver', { webhookId: webhook.id, event, payload });
    }
  }

  // The one place an HTTP delivery attempt actually happens -- called
  // directly (attempt: 1, no queue) by sendTest(), and by
  // WebhookDeliveryProcessor for real, queued, potentially-retried
  // events. Every attempt (successful or not) gets its own
  // WebhookDelivery row, per 0011_create_webhooks.sql's own comment about
  // retries showing up as additional rows rather than overwritten state.
  //
  // Re-reads the webhook by id rather than trusting a passed-in object:
  // a queued job's data crosses a delay (the whole point of backoff), so
  // by the time a later attempt runs, the webhook may have been disabled
  // or deleted since it was enqueued -- re-checking `enabled` here is
  // what makes that correct, not something the caller has to remember to
  // do.
  async deliverAttempt(
    webhookId: number,
    event: string,
    payload: unknown,
    attempt: number,
  ): Promise<{ ok: boolean; responseStatus: number | null }> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.enabled) {
      // Deleted or disabled since this attempt was scheduled -- nothing
      // to deliver, and (for the deleted case) nowhere to log it: a
      // WebhookDelivery row requires a live `webhook_id` FK. Reporting
      // `ok: true` tells the caller (queue processor or sendTest) there
      // is nothing left to retry, which is correct: this isn't a
      // delivery failure, the subscription just no longer exists/applies.
      return { ok: true, responseStatus: null };
    }

    const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

    let responseStatus: number | null = null;
    let deliveredAt: Date | null = null;
    let failedAt: Date | null = null;
    let ok = false;

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Same X-<Product>-Event/X-<Product>-Signature shape Stripe and
          // GitHub both use -- a receiver verifies authenticity by
          // recomputing this HMAC over the raw body with its own copy of
          // the secret, never by trusting the payload alone.
          'x-veroxm-event': event,
          'x-veroxm-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = res.status;
      ok = res.ok;
      if (res.ok) {
        deliveredAt = new Date();
      } else {
        failedAt = new Date();
      }
    } catch {
      // Network error, timeout, DNS failure, etc. -- responseStatus stays
      // null, which the delivery log renders distinctly from a real
      // non-2xx HTTP response.
      failedAt = new Date();
    }

    await this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: body,
        responseStatus,
        attempt,
        deliveredAt,
        failedAt,
      },
    });

    return { ok, responseStatus };
  }
}
