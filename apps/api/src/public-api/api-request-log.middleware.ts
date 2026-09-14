import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

interface TokenAwareRequest extends Request {
  projectToken?: { project: { id: number }; tokenId?: number };
}

// Buckets a literal request path into something meaningful to group by:
// the project uuid and any trailing numeric record id become placeholders,
// so `/public/v2/projects/<uuid>/collections/posts/content/482` and its
// sibling for id 483 both roll up under the same "endpoint" row. Collection
// slugs are left as-is on purpose — each collection is a distinct thing a
// caller is hitting, and analytics by endpoint should reflect that.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TRAILING_ID_RE = /\/\d+(?=\/|$)/g;

export function normalizeEndpoint(path: string): string {
  return path.replace(UUID_RE, ':uuid').replace(TRAILING_ID_RE, '/:id');
}

// Applied only to the public v1/v2 controllers (see PublicApiModule),
// mounted as Express middleware rather than a Nest interceptor for one
// deliberate reason: an interceptor never runs when a guard throws, so a
// bad-token 401 or a missing-permission 403 would vanish from the log
// entirely. Middleware runs before the guard and the `res.on('finish')`
// listener fires after the whole request lifecycle completes regardless of
// outcome, so every call — success, auth failure, thrown error — gets one
// row. Never lets a logging failure affect the response it's describing:
// both writes below are fire-and-forget from the request's point of view.
@Injectable()
export class ApiRequestLogMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: TokenAwareRequest, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    const path = req.originalUrl.split('?')[0];
    const apiVersion = path.startsWith('/public/v1')
      ? 'v1'
      : path.startsWith('/public/v2')
        ? 'v2'
        : 'unknown';

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const projectToken = req.projectToken;

      this.prisma.apiRequestLog
        .create({
          data: {
            projectId: projectToken?.project?.id ?? null,
            tokenId: projectToken?.tokenId ?? null,
            apiVersion,
            method: req.method,
            path,
            endpoint: normalizeEndpoint(path),
            statusCode: res.statusCode,
            durationMs: Math.max(0, Math.round(durationMs)),
            ip: req.ip ?? req.socket?.remoteAddress ?? null,
          },
        })
        .catch(() => {
          // Best-effort — a logging failure must never surface to the caller.
        });

      // Mirrors Sanctum's own behavior (it stamps last_used_at on every
      // authenticated request) — the legacy app never surfaced this from a
      // UI, but AccessTokens.tsx's "Last used" column has been showing
      // "Never" for every token regardless of real traffic until now.
      if (projectToken?.tokenId) {
        this.prisma.personalAccessToken
          .update({ where: { id: projectToken.tokenId }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
      }
    });

    next();
  }
}
