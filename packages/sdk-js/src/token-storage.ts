export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms this access token stops being valid. */
  expiresAt: number;
  abilities: string[];
}

/**
 * Where the SDK persists the current session between calls -- mirrors how
 * Firebase Auth needs a platform-specific persistence layer, except here
 * it's a plain three-method interface instead of a whole plugin system.
 * `MemoryTokenStorage` (used automatically outside a browser) only lasts
 * for the life of the VeroXMApp instance; `BrowserLocalStorageTokenStorage`
 * (used automatically when `window.localStorage` exists) survives a page
 * reload. For Node/React Native code that wants disk persistence across
 * process restarts, implement this interface against whatever storage
 * that environment offers and pass it as `tokenStorage` to initializeApp().
 */
export interface TokenStorage {
  get(): Promise<StoredSession | null>;
  set(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryTokenStorage implements TokenStorage {
  private session: StoredSession | null = null;

  async get(): Promise<StoredSession | null> {
    return this.session;
  }

  async set(session: StoredSession): Promise<void> {
    this.session = session;
  }

  async clear(): Promise<void> {
    this.session = null;
  }
}

/**
 * Persists the session in `window.localStorage` under a project-scoped
 * key, so a signed-in user stays signed in across a page reload -- the
 * same convenience Firebase Auth's default browser persistence gives you.
 * VeroXMApp.initializeApp picks this automatically when `window.localStorage`
 * is present and no `tokenStorage` option was given.
 */
export class BrowserLocalStorageTokenStorage implements TokenStorage {
  private readonly key: string;

  constructor(projectId: string) {
    this.key = `veroxm:session:${projectId}`;
  }

  async get(): Promise<StoredSession | null> {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  async set(session: StoredSession): Promise<void> {
    window.localStorage.setItem(this.key, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    window.localStorage.removeItem(this.key);
  }
}
