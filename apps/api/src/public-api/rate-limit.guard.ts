import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.2 -- API rate
// limiting for the public API.
//
// Hand-rolled rather than `@nestjs/throttler`: as of this writing that
// package's latest release (6.5.0) declares a peer dependency on
// `@nestjs/common@^7 || ^8 || ^9 || ^10 || ^11` only -- this repo is
// already on `@nestjs/common@^12`, so installing it means either forcing
// past an unvalidated peer-dependency mismatch (`--legacy-peer-deps`) or
// waiting for that package to catch up. A fixed-window counter is a small
// enough piece of logic that it isn't worth carrying that risk in a public,
// third-party-facing API's dependency tree for it -- revisit this file if
// @nestjs/throttler ships a v12-compatible release later, or once
// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3's Redis instance
// exists (a Redis-backed limiter is the right fix for running more than
// one api container -- this in-memory one only enforces a limit correctly
// within a single instance, which matches how this stack runs today; see
// docker-compose.yml -- one `api` container, no replicas).
//
// Fixed window, not sliding: simpler, and "up to `limit` requests in any
// given wall-clock window" is a perfectly fine public-API guarantee --
// nothing here claims smoother per-second smoothing than that.
const WINDOW_MS = Number(process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.PUBLIC_API_RATE_LIMIT_MAX ?? 120);

interface WindowState {
  count: number;
  windowStart: number;
}

// Request shape after V2TokenGuard/LegacyTokenGuard has already run --
// this guard is always applied second (see the @UseGuards order on
// V1ContentController/V2ContentController/V2MediaController), so
// `projectToken` is already populated by the time getTrackerKey runs.
interface TokenAwareRequest {
  projectToken?: { project: { id: number }; tokenId?: number };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  // One Map for the lifetime of this (singleton) provider -- shared across
  // every public-API controller it's applied to, so a token's budget is
  // one combined limit across content AND media routes, not a separate
  // budget per controller.
  private readonly windows = new Map<string, WindowState>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TokenAwareRequest>();
    const key = this.getTrackerKey(request);
    const now = Date.now();

    let state = this.windows.get(key);
    if (!state || now - state.windowStart >= WINDOW_MS) {
      state = { count: 0, windowStart: now };
      this.windows.set(key, state);
    }

    state.count += 1;

    if (state.count > MAX_REQUESTS) {
      const response = context.switchToHttp().getResponse();
      const retryAfterSeconds = Math.ceil((state.windowStart + WINDOW_MS - now) / 1000);
      response.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      throw new HttpException(
        { error: 'Too many requests -- slow down and try again shortly.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  // Prefer the most specific identity available: the static key's own id
  // (tokenId, only set for Sanctum-style keys -- see ResolvedProjectToken's
  // own comment) is the tightest scope; a login-issued access token has no
  // tokenId, so its whole Project is the next best scope; only an
  // unauthenticated request (shouldn't reach here at all, since the token
  // guard runs first and would already have rejected it) falls back to IP.
  private getTrackerKey(request: TokenAwareRequest): string {
    if (request.projectToken?.tokenId) return `token:${request.projectToken.tokenId}`;
    if (request.projectToken?.project?.id) return `project:${request.projectToken.project.id}`;
    return `ip:${request.ip ?? 'unknown'}`;
  }
}
