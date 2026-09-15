import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitGuard as RateLimitGuardType } from './rate-limit.guard.js';

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.2 -- WINDOW_MS/
// MAX_REQUESTS are read from process.env once, at module load, so each
// test that needs a specific limit stubs the env vars and re-imports the
// module fresh (vi.resetModules()) rather than relying on whatever the
// first import happened to see.
async function freshGuard(maxRequests: number, windowMs: number) {
  vi.resetModules();
  vi.stubEnv('PUBLIC_API_RATE_LIMIT_MAX', String(maxRequests));
  vi.stubEnv('PUBLIC_API_RATE_LIMIT_WINDOW_MS', String(windowMs));
  const { RateLimitGuard } = await import('./rate-limit.guard.js');
  return new RateLimitGuard();
}

function fakeContext(request: Record<string, unknown>) {
  const response = { setHeader: vi.fn() };
  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any,
    response,
  };
}

describe('RateLimitGuard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows requests up to the configured limit, then throws 429', async () => {
    const guard: RateLimitGuardType = await freshGuard(3, 60_000);
    const { context, response } = fakeContext({ projectToken: { project: { id: 1 }, tokenId: 42 } });

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow();
    try {
      guard.canActivate(context);
    } catch (e: any) {
      expect(e.getStatus()).toBe(429);
    }
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('tracks tokenId, project id, and IP as independent counters', async () => {
    const guard: RateLimitGuardType = await freshGuard(1, 60_000);

    const byToken = fakeContext({ projectToken: { project: { id: 1 }, tokenId: 42 } }).context;
    const byProject = fakeContext({ projectToken: { project: { id: 1 } } }).context;
    const byIp = fakeContext({ ip: '10.0.0.5' }).context;

    // Each identity gets its own budget of 1 -- none of these should
    // interfere with each other even though two share project id 1.
    expect(guard.canActivate(byToken)).toBe(true);
    expect(guard.canActivate(byProject)).toBe(true);
    expect(guard.canActivate(byIp)).toBe(true);

    // A second call against any one of them, though, is now over budget.
    expect(() => guard.canActivate(byToken)).toThrow();
  });

  it('resets the counter once the window elapses', async () => {
    vi.useFakeTimers();
    try {
      const guard: RateLimitGuardType = await freshGuard(1, 1_000);
      const { context } = fakeContext({ projectToken: { project: { id: 7 }, tokenId: 99 } });

      expect(guard.canActivate(context)).toBe(true);
      expect(() => guard.canActivate(context)).toThrow();

      vi.advanceTimersByTime(1_001);

      expect(guard.canActivate(context)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
