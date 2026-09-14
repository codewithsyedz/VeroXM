# veroxm_sdk

A small client for VeroXM's public API -- authenticate, read/write content,
and manage media from any Dart or Flutter project. Plain Dart package (no
Flutter SDK dependency), so it works in a Flutter app, a command-line Dart
tool, or a Dart server alike. Its only real dependency is `package:http`
(plus `http_parser`, which `http` already pulls in) -- mirrors
`@veroxm/sdk`, the JS/TS package in this monorepo, feature-for-feature.

## Install

This package lives in the `mycms-nextjs-nodejs` monorepo under
`packages/sdk-flutter`. From another Dart or Flutter project, add a path or
git dependency in `pubspec.yaml`:

```yaml
dependencies:
  veroxm_sdk:
    path: ../mycms-nextjs-nodejs/packages/sdk-flutter
    # or, from another machine/repo:
    # git:
    #   url: <git-url-to>/mycms-nextjs-nodejs
    #   path: packages/sdk-flutter
```

(Publishing it to a private pub server, if you set one up later, is a
drop-in replacement for either of the above -- nothing about the package
itself needs to change.)

## Quickstart

```dart
import 'package:veroxm_sdk/veroxm_sdk.dart';

final app = VeroXMApp.initializeApp(VeroXMAppOptions(
  baseUrl: 'https://your-veroxm-host',
  projectId: 'YOUR-PROJECT-UUID', // Developer tab > API Keys, in the dashboard
));

// Option A -- username/password (the Developer > Authentication tab).
// Refreshes silently in the background; you never call /auth/refresh yourself.
await app.auth.signInWithCredentials('a-username', 'a-password');

// Option B -- a static API key (the Developer > API Keys tab). No login
// step, no expiry, no refresh.
app.auth.signInWithApiKey('40|abcdef...');

// Typed access to one content collection (the slug from your Content
// Model screen). Pass fromJson for your own model, or leave it off for
// plain Map<String, dynamic> entries.
class Post {
  final int id;
  final String title;
  final String body;
  Post({required this.id, required this.title, required this.body});
  factory Post.fromJson(Map<String, dynamic> j) =>
      Post(id: j['id'] as int, title: j['title'] as String, body: j['body'] as String);
}

final posts = app.content<Post>('posts', fromJson: Post.fromJson);

final latest = await posts.list(ListOptions(limit: 10, sort: 'created_at:desc'));
final one = await posts.get(42);
final created = await posts.create({'title': 'Hello', 'body': '...'});
await posts.update(created.id, {'title': 'Hello, updated'});
await posts.delete(created.id);

// The where/whereRelation filter DSL -- see your project's SDK Docs tab
// (dashboard) for the full operator list (like/in/between/gte/...).
final drafts = await posts.search(ListOptions(
  where: [{'title': {'like': 'Hello'}}],
  state: 'only_draft',
));

// Media
final media = app.media();
final page = await media.list(page: 1);
final uploaded = await media.upload(
  UploadableFile(bytes: myPngBytes, filename: 'photo.png', contentType: 'image/png'),
  caption: 'a caption',
);
await media.updateCaption(uploaded.id, 'a new caption');
await media.delete(uploaded.id);
```

## Drafts & publishing

Two real API behaviors worth knowing before you rely on them:

- `content(...).get(id)` only ever returns a **published** record -- there's
  no way to fetch a draft by id (it 404s), even right after
  `create({..., 'draft': true})`. To find or inspect drafts, use
  `list(ListOptions(state: 'only_draft'))` /
  `search(ListOptions(..., state: 'only_draft'))` instead.
- `update(id, data)` follows the same rule as `create()`: omitting `draft`
  (or passing `draft: false`) in `data` **publishes the record
  immediately**, even if the update itself doesn't touch any content fields
  and the record was previously a draft. Pass `data['draft'] = true`
  explicitly if you want the update to leave it (or put it back)
  unpublished.

## Auth modes

- **Static API key** (`auth.signInWithApiKey`) -- simplest option, good for
  a trusted backend/CLI. No expiry, so nothing to refresh; the server
  enforces whatever abilities the key was issued with (`auth.currentAbilities()`
  is always null in this mode -- the SDK doesn't know a key's abilities,
  only the API does, and it just returns 403 if a call oversteps them).
- **Username/password** (`auth.signInWithCredentials`) -- exchanges
  credentials for a short-lived access token (1 hour) plus a refresh token
  (30 days). `VeroXMApp.request()` (used by every `content()`/`media()`
  call) proactively refreshes when the access token is within 30 seconds of
  expiry, and reactively refreshes-and-retries once if a call still somehow
  comes back 401 (clock skew, or a token revoked server-side). Refresh
  tokens are single-use/rotated on every refresh; concurrent refreshes are
  coalesced into one in-flight call so they don't race each other.

By default, a signed-in session only lives as long as the `VeroXMApp`
instance does (`InMemoryTokenStorage`) -- fine for scripts and tests, but a
real app almost always wants sign-in to survive an app restart. Implement
`TokenStorage` against persistent storage and pass it to
`VeroXMApp.initializeApp`:

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:veroxm_sdk/veroxm_sdk.dart';
import 'dart:convert';

class SecureTokenStorage implements TokenStorage {
  final _storage = const FlutterSecureStorage();
  static const _key = 'veroxm_session';

  @override
  Future<StoredSession?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    return StoredSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  @override
  Future<void> write(StoredSession session) =>
      _storage.write(key: _key, value: jsonEncode(session.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}
```

(`flutter_secure_storage` is recommended over `shared_preferences` since
these are bearer credentials -- but the interface is the same either way,
so swap in whatever your app already uses for secrets.)

## Errors

Every non-2xx response throws `VeroXMApiError` (`status`, `body`, and a
best-effort human-readable `message`). Not signed in yet? Every
`content()`/`media()` call throws `VeroXMNotAuthenticatedError` instead of
making a doomed request.

```dart
try {
  await posts.create({'title': 'Hello'});
} on VeroXMApiError catch (e) {
  print('${e.status}: ${e.message}'); // e.g. "403: This token cannot perform 'create' actions"
} on VeroXMNotAuthenticatedError {
  // prompt sign-in
}
```

## Building / testing

```bash
cd packages/sdk-flutter
dart pub get
dart analyze
dart test
```

**Not yet verified in this environment** -- the above three commands have
not been run against this package; no `dart`/`flutter` toolchain was
reachable when it was written, so please run them yourself before relying
on this package. `test/veroxm_sdk_test.dart` covers the pure-logic pieces
(error-message parsing, the in-memory token store) with no network calls,
so `dart test` alone is a reasonable first smoke check.
