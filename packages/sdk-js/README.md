# @veroxm/sdk

A small client for VeroXM's public API -- authenticate, read/write content, and
manage media from any JavaScript/TypeScript project (a web app, a Node
backend, or React Native). No runtime dependencies: it's built entirely on
the platform's own `fetch`/`FormData`, which every target environment
already has (Node 18+, every modern browser, React Native 0.71+).

## Install

This package lives in the `mycms-nextjs-nodejs` monorepo under
`packages/sdk-js`. From another project:

```bash
npm install <path-or-git-url-to>/mycms-nextjs-nodejs#workspace=packages/sdk-js
# or, simplest for now: copy packages/sdk-js/dist + package.json into your
# project's node_modules/@veroxm/sdk, or `npm link` it locally.
```

(Publishing it to a private npm registry, if you set one up later, is a
drop-in replacement for either of the above -- nothing about the package
itself needs to change.)

## Quickstart

```ts
import { VeroXMApp } from '@veroxm/sdk';

const app = VeroXMApp.initializeApp({
  baseUrl: 'https://your-veroxm-host',
  projectId: 'YOUR-PROJECT-UUID', // Developer tab > Connection, in the dashboard
});

// Option A -- username/password (the Developer > Authentication tab).
// Refreshes silently in the background; you never call /auth/refresh yourself.
await app.auth.signInWithCredentials('a-username', 'a-password');

// Option B -- a static API key (the Developer > API Keys tab). No login
// step, no expiry, no refresh.
app.auth.signInWithApiKey('40|abcdef...');

// Typed access to one content collection (the slug from your Content
// Model screen). `T` is whatever shape you expect back -- the API's
// response shape follows that collection's own field list.
interface Post {
  id: number;
  title: string;
  body: string;
}
const posts = app.content<Post>('posts');

const latest = await posts.list({ limit: 10, sort: 'created_at:desc' });
const one = await posts.get(42);
const created = await posts.create({ title: 'Hello', body: '...' });
await posts.update(created.id, { title: 'Hello, updated' });
await posts.delete(created.id);

// The where[]/whereRelation filter DSL -- see your project's SDK Docs tab
// for the full operator list (like/in/between/gte/...).
const drafts = await posts.search({
  where: [{ title: { like: 'Hello' } }],
  state: 'only_draft',
});

// Media
const media = app.media();
const page = await media.list({ page: 1 });
const uploaded = await media.upload(fileFromAnInput, 'a caption'); // browser: a File/Blob
await media.updateCaption(uploaded.id, 'a new caption');
await media.delete(uploaded.id);
```

## Drafts & publishing

Two real API behaviors worth knowing before you rely on them:

- `content(...).get(id)` only ever returns a **published** record -- there's
  no way to fetch a draft by id (it 404s), even right after
  `create({..., draft: true})`. To find or inspect drafts, use
  `list({state: 'only_draft'})` / `search({..., state: 'only_draft'})` instead.
- `update(id, data)` follows the same rule as `create()`: omitting `draft`
  (or passing `draft: false`) **publishes the record immediately**, even if
  the update itself doesn't touch any content fields and the record was
  previously a draft. Pass `draft: true` explicitly if you want the update
  to leave it (or put it back) unpublished.

## Auth modes

- **`signInWithApiKey(key)`** -- a static project API key. Simplest option
  for server-to-server use where there's no per-user identity; never
  expires, nothing to refresh.
- **`signInWithCredentials(username, password)`** -- the login flow from a
  project's Authentication tab. Returns a 1-hour access token plus a
  30-day refresh token; `VeroXMAuth` refreshes automatically, a little
  before actual expiry, and again on demand if a request still comes back
  `401` (clock skew, or a token revoked server-side). You never need to
  call the refresh endpoint yourself.

Either way, `app.content(...)`/`app.media()` calls just work -- the SDK
attaches whichever credential is active.

### Persisting sign-in across page reloads / app restarts

`initializeApp` picks `BrowserLocalStorageTokenStorage` automatically when
`window.localStorage` exists, and falls back to an in-memory store
(`MemoryTokenStorage`, cleared whenever the VeroXMApp instance is garbage
collected) everywhere else -- Node, React Native, SSR. To persist a
session across a Node process restart or in React Native, implement the
three-method `TokenStorage` interface against whatever that environment
offers (a file, `AsyncStorage`, etc.) and pass it as `tokenStorage` when
calling `initializeApp`.

```ts
app.auth.onTokenChange((accessToken) => {
  // accessToken is null right after signOut(), and after a successful
  // sign-in/refresh otherwise -- mirror it into your own app state if useful.
});
```

## Errors

Every non-2xx response throws `VeroXMApiError` (`.status`, `.body`, and a
`.message` extracted from whichever error shape the API used). A request
made before any sign-in call throws `VeroXMNotAuthenticatedError`.

```ts
import { VeroXMApiError } from '@veroxm/sdk';

try {
  await posts.delete(1);
} catch (e) {
  if (e instanceof VeroXMApiError && e.status === 403) {
    // this credential's abilities don't include 'delete'
  }
}
```

## Building

```bash
npm run build   # tsc -> dist/
```
