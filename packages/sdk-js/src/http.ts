import { VeroXMApiError } from './errors.js';

export interface RawRequestOptions {
  method?: string;
  /** Path relative to the client's api base, e.g. "/auth/token" or "/collections/posts/content". */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent as an `application/json` body. Mutually exclusive with `form`. */
  json?: unknown;
  /** Sent as a `multipart/form-data` body (file uploads) -- fetch sets the boundary Content-Type itself, so never set one manually alongside this. */
  form?: FormData;
  headers?: Record<string, string>;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The one place an HTTP request actually goes out. Deliberately built on
 * the platform's own global `fetch`/`FormData` -- available in every
 * environment this SDK targets (browsers, Node 18+, React Native 0.71+)
 * without adding a runtime dependency the way `axios` or `dio`-equivalent
 * libraries would.
 */
export async function rawRequest(apiBase: string, opts: RawRequestOptions): Promise<unknown> {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  const url = new URL(opts.path.replace(/^\//, ''), base);

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;

  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(url.toString(), { method: opts.method ?? 'GET', headers, body });
  const text = await res.text();
  const parsed = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    throw new VeroXMApiError(res.status, parsed ?? text);
  }
  return parsed;
}
