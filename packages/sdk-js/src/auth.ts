import { rawRequest } from './http.js';
import { VeroXMNotAuthenticatedError } from './errors.js';
import type { StoredSession, TokenStorage } from './token-storage.js';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  abilities: string[];
}

// Refresh a little before the token actually expires, not exactly at the
// deadline -- covers clock skew and the time an in-flight request spends
// on the wire between "token looked valid" and "server received it".
const REFRESH_SKEW_MS = 30_000;

/**
 * Handles both auth modes this SDK supports:
 *  - `signInWithApiKey` -- a static project API key (Sanctum-style,
 *    never expires, no refresh needed). Matches pasting a key into the
 *    dashboard's API Keys tab.
 *  - `signInWithCredentials` -- the username/password login flow (a
 *    project's Authentication tab), which returns a short-lived access
 *    token plus a refresh token; this class refreshes silently and
 *    transparently as needed, the same "just works" feel as Firebase
 *    Auth's token refresh.
 */
export class VeroXMAuth {
  private apiKey: string | null = null;
  private session: StoredSession | null = null;
  private loadedFromStorage = false;
  private refreshInFlight: Promise<void> | null = null;
  private readonly listeners = new Set<(accessToken: string | null) => void>();

  constructor(
    private readonly apiBase: string,
    private readonly storage: TokenStorage,
  ) {}

  /** Static-key mode: no login round-trip, no expiry, no refresh token. */
  signInWithApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.session = null;
    this.loadedFromStorage = true; // nothing left to load -- api-key mode short-circuits getAccessToken()
    this.notify(apiKey);
  }

  /** Username/password mode -- exchanges credentials for an access+refresh token pair and persists it via the configured TokenStorage. */
  async signInWithCredentials(username: string, password: string): Promise<void> {
    const data = (await rawRequest(this.apiBase, {
      method: 'POST',
      path: '/auth/token',
      json: { username, password },
    })) as LoginResponse;
    this.apiKey = null;
    await this.persistSession(data);
  }

  async signOut(): Promise<void> {
    this.apiKey = null;
    this.session = null;
    this.loadedFromStorage = true;
    await this.storage.clear();
    this.notify(null);
  }

  /** Returns the abilities (read/create/update/delete, or ['*']) the current credential carries, or null if signed out or in static-key mode (a key's abilities aren't known client-side -- only the API enforces them). */
  currentAbilities(): string[] | null {
    return this.session?.abilities ?? null;
  }

  /** Notified with the current access token whenever it changes (sign-in, refresh, sign-out) -- e.g. to mirror it into your own app state. Returns an unsubscribe function. */
  onTokenChange(listener: (accessToken: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** True while a refresh-token session (not static-key mode) is available to retry a request with. */
  canRefresh(): boolean {
    return !this.apiKey && !!this.session?.refreshToken;
  }

  /** Forces a refresh regardless of expiry and returns the new access token -- used by VeroXMApp to retry a request that came back 401 despite the proactive expiry check below. */
  async forceRefreshAndGetToken(): Promise<string> {
    await this.refresh();
    return this.session!.accessToken;
  }

  /** Resolves the bearer token for the next request, transparently refreshing a near-expired session first. Throws VeroXMNotAuthenticatedError if nothing has signed in yet. */
  async getAccessToken(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    if (!this.loadedFromStorage) {
      this.session = await this.storage.get();
      this.loadedFromStorage = true;
    }

    if (!this.session) throw new VeroXMNotAuthenticatedError();

    if (Date.now() >= this.session.expiresAt - REFRESH_SKEW_MS) {
      await this.refresh();
    }

    return this.session!.accessToken;
  }

  private async refresh(): Promise<void> {
    if (!this.session?.refreshToken) throw new VeroXMNotAuthenticatedError();

    // Coalesce concurrent refreshes: several in-flight requests hitting a
    // near-expired token at the same moment should trigger exactly one
    // refresh call, not one each -- the API's refresh tokens are single-use
    // (rotated on every call), so a second concurrent call would just fail.
    if (!this.refreshInFlight) {
      const refreshToken = this.session.refreshToken;
      this.refreshInFlight = (async () => {
        const data = (await rawRequest(this.apiBase, {
          method: 'POST',
          path: '/auth/refresh',
          json: { refreshToken },
        })) as LoginResponse;
        await this.persistSession(data);
      })().finally(() => {
        this.refreshInFlight = null;
      });
    }
    await this.refreshInFlight;
  }

  private async persistSession(data: LoginResponse): Promise<void> {
    const session: StoredSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
      abilities: data.abilities,
    };
    this.session = session;
    this.loadedFromStorage = true;
    await this.storage.set(session);
    this.notify(session.accessToken);
  }

  private notify(accessToken: string | null): void {
    for (const listener of this.listeners) listener(accessToken);
  }
}
