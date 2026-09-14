import 'dart:async';
import 'errors.dart';
import 'http.dart';
import 'token_storage.dart';

const int _refreshSkewMs = 30000;

/// Authentication for one [VeroXMApp] -- either a static API key (no
/// expiry, no refresh) or a username/password session (short-lived access
/// token, auto-refreshed via a long-lived refresh token). Mirrors the JS
/// SDK's `VeroXMAuth` class method-for-method.
class VeroXMAuth {
  final String _apiBase;
  final TokenStorage _storage;

  String? _apiKey;
  StoredSession? _session;
  bool _loadedFromStorage = false;
  Future<void>? _refreshInFlight;
  final StreamController<String?> _tokenChanges = StreamController<String?>.broadcast();

  VeroXMAuth(this._apiBase, this._storage);

  /// Emits the current access token every time it changes (sign-in,
  /// refresh, sign-out emits null) -- e.g. to mirror it into your own app
  /// state. Prefer this over polling [currentAbilities] or the session.
  Stream<String?> get tokenChanges => _tokenChanges.stream;

  /// Static-key mode: no login round-trip, no expiry, no refresh token.
  void signInWithApiKey(String apiKey) {
    _apiKey = apiKey;
    _session = null;
    _loadedFromStorage = true;
    _tokenChanges.add(apiKey);
  }

  /// Username/password mode -- exchanges credentials for an access+refresh
  /// token pair and persists it via the configured [TokenStorage].
  Future<void> signInWithCredentials(String username, String password) async {
    final data = await rawRequest(
      _apiBase,
      RawRequestOptions(
        method: 'POST',
        path: '/auth/token',
        json: {'username': username, 'password': password},
      ),
    );
    _apiKey = null;
    await _persistSession(data as Map<String, dynamic>);
  }

  Future<void> signOut() async {
    _apiKey = null;
    _session = null;
    _loadedFromStorage = true;
    await _storage.clear();
    _tokenChanges.add(null);
  }

  /// The abilities (`read`/`create`/`update`/`delete`, or `['*']`) the
  /// current credential carries, or null if signed out or in static-key
  /// mode (a key's abilities aren't known client-side -- only the API
  /// enforces them).
  List<String>? currentAbilities() => _session?.abilities;

  /// True while a refresh-token session (not static-key mode) is
  /// available to retry a request with.
  bool canRefresh() => _apiKey == null && _session?.refreshToken != null;

  /// Forces a refresh regardless of expiry and returns the new access
  /// token -- used by [VeroXMApp] to retry a request that came back 401
  /// despite the proactive expiry check in [getAccessToken].
  Future<String> forceRefreshAndGetToken() async {
    await _refresh();
    return _session!.accessToken;
  }

  /// Resolves the bearer token for the next request, transparently
  /// refreshing a near-expired session first. Throws
  /// [VeroXMNotAuthenticatedError] if nothing has signed in yet.
  Future<String> getAccessToken() async {
    if (_apiKey != null) return _apiKey!;
    if (!_loadedFromStorage) {
      _session = await _storage.read();
      _loadedFromStorage = true;
    }
    final session = _session;
    if (session == null) throw VeroXMNotAuthenticatedError();
    if (DateTime.now().millisecondsSinceEpoch >= session.expiresAtMs - _refreshSkewMs) {
      await _refresh();
    }
    return _session!.accessToken;
  }

  Future<void> _refresh() async {
    final current = _session;
    if (current?.refreshToken == null) throw VeroXMNotAuthenticatedError();

    // Refresh tokens are single-use (rotated server-side on every call),
    // so two callers refreshing concurrently would otherwise race and one
    // would come back 401 on the token the other just burned. Coalesce
    // into one shared in-flight refresh instead.
    _refreshInFlight ??= () async {
      final data = await rawRequest(
        _apiBase,
        RawRequestOptions(
          method: 'POST',
          path: '/auth/refresh',
          json: {'refreshToken': current!.refreshToken},
        ),
      );
      await _persistSession(data as Map<String, dynamic>);
    }()
        .whenComplete(() => _refreshInFlight = null);

    await _refreshInFlight;
  }

  Future<void> _persistSession(Map<String, dynamic> data) async {
    final session = StoredSession(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
      expiresAtMs: DateTime.now().millisecondsSinceEpoch + (data['expiresIn'] as num).toInt() * 1000,
      abilities: (data['abilities'] as List?)?.cast<String>(),
    );
    _session = session;
    _loadedFromStorage = true;
    await _storage.write(session);
    _tokenChanges.add(session.accessToken);
  }

  void dispose() {
    _tokenChanges.close();
  }
}
