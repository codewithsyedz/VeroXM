/// A signed-in session as persisted by a [TokenStorage] implementation.
class StoredSession {
  final String accessToken;
  final String refreshToken;

  /// Epoch-millis expiry of [accessToken] (matches the JS SDK's
  /// `Date.now() + expiresIn * 1000`), so a session round-trips through
  /// JSON without needing a DateTime (de)serializer.
  final int expiresAtMs;

  /// The abilities this credential carries (e.g. `['read', 'create']`, or
  /// `['*']` for full access). Only ever set for a username/password
  /// session -- see [VeroXMAuth.currentAbilities].
  final List<String>? abilities;

  const StoredSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAtMs,
    this.abilities,
  });

  factory StoredSession.fromJson(Map<String, dynamic> json) => StoredSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresAtMs: json['expiresAtMs'] as int,
        abilities: (json['abilities'] as List?)?.cast<String>(),
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAtMs': expiresAtMs,
        if (abilities != null) 'abilities': abilities,
      };
}

/// Pluggable persistence for a signed-in session. Mirrors the JS SDK's
/// `TokenStorage` interface.
///
/// This package ships only [InMemoryTokenStorage] (the default) so it has
/// no dependency beyond `package:http` and works identically in a Flutter
/// app, a command-line tool, or a Dart server. A Flutter app that wants
/// sign-in to survive an app restart should implement this against
/// `flutter_secure_storage` (recommended, since these are bearer
/// credentials) or `shared_preferences` -- see the README for a drop-in
/// example of both.
abstract class TokenStorage {
  Future<StoredSession?> read();
  Future<void> write(StoredSession session);
  Future<void> clear();
}

/// Default storage: lives only as long as the [VeroXMAuth] instance does.
/// Fine for short-lived scripts/servers and for testing; a long-lived
/// Flutter app almost always wants a persistent [TokenStorage] instead so
/// the user doesn't have to sign in again on every app launch.
class InMemoryTokenStorage implements TokenStorage {
  StoredSession? _session;

  @override
  Future<StoredSession?> read() async => _session;

  @override
  Future<void> write(StoredSession session) async {
    _session = session;
  }

  @override
  Future<void> clear() async {
    _session = null;
  }
}
