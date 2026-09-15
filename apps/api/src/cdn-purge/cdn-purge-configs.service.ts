import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { CDN_PURGE_QUEUE } from './queue-names.js';
import type { CdnPurgeJobData } from './cdn-purge.processor.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- "reference
// integration proving the pattern end-to-end" for the read-cache work.
// Only "cloudflare" is actually implemented server-side (see
// cdn-purge.processor.ts) -- this is intentional, matching how the plan
// itself scopes every other multi-vendor item (Meilisearch first for
// search, Shopify first for e-commerce): pick one real vendor, prove the
// pattern, add the next one later.
export const SUPPORTED_CDN_PROVIDERS = ['cloudflare'] as const;
export type CdnProvider = (typeof SUPPORTED_CDN_PROVIDERS)[number];

function isSupportedProvider(value: string): value is CdnProvider {
  return (SUPPORTED_CDN_PROVIDERS as readonly string[]).includes(value);
}

export interface CdnPurgeConfigSummary {
  provider: string;
  zoneId: string;
  enabled: boolean;
  // Never the token itself -- same discipline as Webhook.secret /
  // PersonalAccessToken: a credential a caller already knows (they typed
  // it in) is never echoed back, only whether one is on file.
  hasApiToken: boolean;
  updatedAt: Date | null;
}

interface ContentEventPayload {
  projectId: number;
  contentId: number;
  collectionId?: number;
}

@Injectable()
export class CdnPurgeConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CDN_PURGE_QUEUE) private readonly purgeQueue: Queue<CdnPurgeJobData>,
  ) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private toSummary(row: { provider: string; zoneId: string; apiToken: string; enabled: boolean; updatedAt: Date | null }): CdnPurgeConfigSummary {
    return {
      provider: row.provider,
      zoneId: row.zoneId,
      enabled: row.enabled,
      hasApiToken: !!row.apiToken,
      updatedAt: row.updatedAt,
    };
  }

  async get(projectId: number): Promise<CdnPurgeConfigSummary | null> {
    await this.loadProjectOrThrow(projectId);
    const row = await this.prisma.cdnPurgeConfig.findUnique({ where: { projectId } });
    return row ? this.toSummary(row) : null;
  }

  // Upsert rather than separate create/update -- this is a one-row-per-
  // project settings form, not a list like Webhook, so there's no
  // meaningful "create vs. edit" distinction from the caller's side.
  // `apiToken` is optional on this call: omitting it keeps whatever
  // token is already on file (the "leave password blank to keep it
  // unchanged" pattern), since the UI never has the current token to
  // send back.
  async upsert(
    projectId: number,
    input: { provider: string; zoneId: string; apiToken?: string; enabled: boolean },
  ): Promise<CdnPurgeConfigSummary> {
    await this.loadProjectOrThrow(projectId);

    if (!isSupportedProvider(input.provider)) {
      throw new ForbiddenException(`Unsupported CDN provider "${input.provider}" -- supported: ${SUPPORTED_CDN_PROVIDERS.join(', ')}`);
    }
    const zoneId = input.zoneId?.trim();
    if (!zoneId) throw new ForbiddenException('A zone id is required');

    const existing = await this.prisma.cdnPurgeConfig.findUnique({ where: { projectId } });
    const trimmedToken = input.apiToken?.trim();
    if (!existing && !trimmedToken) {
      throw new ForbiddenException('An API token is required to configure CDN purging for the first time');
    }

    const row = await this.prisma.cdnPurgeConfig.upsert({
      where: { projectId },
      // Prisma's JS client builds BOTH `create` and `update` objects
      // before deciding which one the DB actually needs -- so
      // `create.apiToken` must be a real string even on an update-only
      // call (where `trimmedToken` is undefined). The `?? ''` fallback is
      // never actually persisted in that case: Prisma only uses `create`
      // when `!existing`, and the validation just above already
      // guarantees `trimmedToken` is set whenever `!existing` is true.
      create: {
        projectId,
        provider: input.provider,
        zoneId,
        apiToken: trimmedToken ?? '',
        enabled: input.enabled,
      },
      update: {
        provider: input.provider,
        zoneId,
        enabled: input.enabled,
        ...(trimmedToken ? { apiToken: trimmedToken } : {}),
      },
    });

    return this.toSummary(row);
  }

  async remove(projectId: number): Promise<void> {
    await this.loadProjectOrThrow(projectId);
    await this.prisma.cdnPurgeConfig.deleteMany({ where: { projectId } });
  }

  // --- Event listener --------------------------------------------------
  // Same three events the webhook engine and the read-cache invalidation
  // listener both already key off of. Coalesced via a stable jobId + a
  // short delay: several content changes to the same project in quick
  // succession (a bulk import, a burst of edits) collapse into one purge
  // rather than one Cloudflare API call per row -- BullMQ treats adding a
  // job with a jobId that's already waiting/delayed as a no-op, it does
  // NOT reset that job's delay or duplicate it.
  @OnEvent('content.published')
  async onContentPublished(payload: ContentEventPayload): Promise<void> {
    await this.maybeEnqueuePurge(payload.projectId);
  }

  @OnEvent('content.updated')
  async onContentUpdated(payload: ContentEventPayload): Promise<void> {
    await this.maybeEnqueuePurge(payload.projectId);
  }

  @OnEvent('content.deleted')
  async onContentDeleted(payload: ContentEventPayload): Promise<void> {
    await this.maybeEnqueuePurge(payload.projectId);
  }

  private async maybeEnqueuePurge(projectId: number): Promise<void> {
    const config = await this.prisma.cdnPurgeConfig.findUnique({ where: { projectId } });
    if (!config || !config.enabled) return;

    await this.purgeQueue.add(
      'purge',
      { projectId },
      {
        jobId: `purge-${projectId}`,
        delay: 5_000,
      },
    );
  }
}
