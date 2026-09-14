import 'auth.dart';
import 'content.dart';
import 'errors.dart';
import 'http.dart';
import 'media.dart';
import 'token_storage.dart';

/// Options for [VeroXMApp.initializeApp].
class VeroXMAppOptions {
  /// e.g. `'https://your-veroxm-host'` -- no trailing slash needed.
  final String baseUrl;

  /// The project's UUID (Developer tab > API Keys > Project API endpoint,
  /// in the dashboard).
  final String projectId;

  /// Defaults to [InMemoryTokenStorage] -- pass your own [TokenStorage]
  /// (e.g. backed by `flutter_secure_storage`) so sign-in survives an app
  /// restart. See the README for a drop-in example.
  final TokenStorage? tokenStorage;

  const VeroXMAppOptions({required this.baseUrl, required this.projectId, this.tokenStorage});
}

/// Entry point -- one instance per VeroXM project. Mirrors the JS SDK's
/// `VeroXMApp` (Firebase-style: `VeroXMApp.initializeApp()` once, then
/// `app.auth`, `app.content(slug)`, `app.media()`).
class VeroXMApp {
  final String _apiBase;
  late final VeroXMAuth auth;

  VeroXMApp._(this._apiBase, TokenStorage tokenStorage) {
    auth = VeroXMAuth(_apiBase, tokenStorage);
  }

  static VeroXMApp initializeApp(VeroXMAppOptions options) {
    final base =
        options.baseUrl.endsWith('/') ? options.baseUrl.substring(0, options.baseUrl.length - 1) : options.baseUrl;
    final apiBase = '$base/public/v2/projects/${options.projectId}';
    return VeroXMApp._(apiBase, options.tokenStorage ?? InMemoryTokenStorage());
  }

  /// Typed access to one content collection's entries
  /// (list/get/create/update/delete/search/count). Pass `fromJson` to
  /// decode into your own model; omit it for plain `Map<String, dynamic>`
  /// entries.
  ContentResource<T> content<T>(String collectionSlug, {T Function(Map<String, dynamic>)? fromJson}) =>
      ContentResource<T>(this, collectionSlug, fromJson: fromJson);

  /// This project's media library (list/upload/updateCaption/delete).
  MediaResource media() => MediaResource(this);

  /// Used internally by [ContentResource]/[MediaResource] -- attaches the
  /// current bearer token and, if the very first attempt still comes back
  /// 401 (clock skew, or a token revoked server-side since the last
  /// proactive refresh), forces one refresh and retries exactly once
  /// before giving up.
  Future<dynamic> request(RawRequestOptions opts) async {
    final token = await auth.getAccessToken();
    try {
      return await rawRequest(_apiBase, _withAuth(opts, token));
    } on VeroXMApiError catch (e) {
      if (e.status == 401 && auth.canRefresh()) {
        final retryToken = await auth.forceRefreshAndGetToken();
        return rawRequest(_apiBase, _withAuth(opts, retryToken));
      }
      rethrow;
    }
  }

  RawRequestOptions _withAuth(RawRequestOptions opts, String token) => RawRequestOptions(
        method: opts.method,
        path: opts.path,
        query: opts.query,
        headers: {...?opts.headers, 'Authorization': 'Bearer $token'},
        json: opts.json,
        multipart: opts.multipart,
      );
}
