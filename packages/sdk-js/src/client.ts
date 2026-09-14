import { rawRequest, type RawRequestOptions } from './http.js';
import { VeroXMApiError } from './errors.js';
import { VeroXMAuth } from './auth.js';
import { ContentResource } from './content.js';
import { MediaResource } from './media.js';
import { MemoryTokenStorage, BrowserLocalStorageTokenStorage, type TokenStorage } from './token-storage.js';

export interface VeroXMAppOptions {
  /** Your VeroXM deployment's origin, e.g. "https://cms.example.com" -- no trailing /public/... needed, VeroXMApp builds that itself. */
  baseUrl: string;
  /** The project's UUID (Developer tab > Connection > Project UUID in the dashboard). */
  projectId: string;
  /** Defaults to browser localStorage when available, otherwise an in-memory store that only lasts for this VeroXMApp instance's lifetime. Pass your own TokenStorage implementation for disk persistence in Node/React Native. */
  tokenStorage?: TokenStorage;
}

function defaultTokenStorage(projectId: string): TokenStorage {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return new BrowserLocalStorageTokenStorage(projectId);
  }
  return new MemoryTokenStorage();
}

/**
 * The SDK's entry point -- one `initializeApp()` call, Firebase-style,
 * then `app.auth`, `app.content(slug)`, and `app.media()` for everything
 * else. See this package's README for a full quickstart.
 */
export class VeroXMApp {
  readonly auth: VeroXMAuth;
  private readonly apiBase: string;

  private constructor(apiBase: string, tokenStorage: TokenStorage) {
    this.apiBase = apiBase;
    this.auth = new VeroXMAuth(apiBase, tokenStorage);
  }

  static initializeApp(options: VeroXMAppOptions): VeroXMApp {
    const base = options.baseUrl.replace(/\/$/, '');
    const apiBase = `${base}/public/v2/projects/${options.projectId}`;
    return new VeroXMApp(apiBase, options.tokenStorage ?? defaultTokenStorage(options.projectId));
  }

  /** Typed access to one content collection's entries (list/get/create/update/delete/search). */
  content<T = Record<string, unknown>>(collectionSlug: string): ContentResource<T> {
    return new ContentResource<T>(this, collectionSlug);
  }

  /** This project's media library (list/upload/updateCaption/delete). */
  media(): MediaResource {
    return new MediaResource(this);
  }

  /**
   * Used internally by ContentResource/MediaResource -- attaches the
   * current bearer token and, if the very first attempt still comes back
   * 401 (clock skew, or a token revoked server-side since the last
   * proactive refresh), forces one refresh and retries exactly once
   * before giving up.
   */
  async request(opts: RawRequestOptions): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    try {
      return await rawRequest(this.apiBase, withAuth(opts, token));
    } catch (e) {
      if (e instanceof VeroXMApiError && e.status === 401 && this.auth.canRefresh()) {
        const retryToken = await this.auth.forceRefreshAndGetToken();
        return rawRequest(this.apiBase, withAuth(opts, retryToken));
      }
      throw e;
    }
  }
}

function withAuth(opts: RawRequestOptions, token: string): RawRequestOptions {
  return { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } };
}
