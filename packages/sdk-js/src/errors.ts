/**
 * Thrown for any non-2xx response from the VeroXM public API. Carries the
 * HTTP status and whatever the API's own error body contained -- every
 * route in this API returns errors as either `{ error: string }` (the
 * shape NestJS's various *Exception classes use when constructed with a
 * plain object, e.g. `new UnauthorizedException({ error: '...' })`) or
 * the framework's own default `{ statusCode, message, error }` shape for
 * anything Nest itself rejects.
 */
export class VeroXMApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(VeroXMApiError.messageFrom(status, body));
    this.name = 'VeroXMApiError';
    this.status = status;
    this.body = body;
  }

  private static messageFrom(status: number, body: unknown): string {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.error === 'string') return b.error;
      if (typeof b.message === 'string') return b.message;
      if (Array.isArray(b.message)) return b.message.join(', ');
      if (b.errors) return JSON.stringify(b.errors);
    }
    return `Request failed with status ${status}`;
  }
}

/** Thrown when a request needs an authenticated client but no credentials have been provided yet. */
export class VeroXMNotAuthenticatedError extends Error {
  constructor() {
    super('Not signed in -- call auth.signInWithCredentials() or auth.signInWithApiKey() first.');
    this.name = 'VeroXMNotAuthenticatedError';
  }
}
