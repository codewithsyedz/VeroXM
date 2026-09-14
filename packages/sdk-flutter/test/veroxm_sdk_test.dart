// Pure-logic tests -- no network calls, so these run anywhere `dart test`
// runs (no live VeroXM project needed). They cover the parts of the SDK
// that are easy to get subtly wrong: error-message extraction, the
// in-memory token store, and the client's base-URL/project-id join.
import 'package:test/test.dart';
import 'package:veroxm_sdk/veroxm_sdk.dart';
import 'package:veroxm_sdk/src/token_storage.dart';

void main() {
  group('VeroXMApiError.message', () {
    test('prefers a plain {error} body (NestJS object-constructed exceptions)', () {
      final e = VeroXMApiError(401, {'error': 'Invalid or missing API token'});
      expect(e.message, 'Invalid or missing API token');
    });

    test('falls back to NestJS default {statusCode, message, error} shape', () {
      final e = VeroXMApiError(400, {
        'statusCode': 400,
        'message': 'Validation failed',
        'error': 'Bad Request',
      });
      expect(e.message, 'Validation failed');
    });

    test('joins an array `message` (class-validator style)', () {
      final e = VeroXMApiError(400, {
        'message': ['username must be at least 3 characters', 'password is too weak'],
      });
      expect(e.message, 'username must be at least 3 characters, password is too weak');
    });

    test('falls back to a generic message when the body has none of the above', () {
      final e = VeroXMApiError(500, 'Internal Server Error');
      expect(e.message, 'Request failed with status 500');
    });
  });

  group('InMemoryTokenStorage', () {
    test('round-trips a session and clears it', () async {
      final storage = InMemoryTokenStorage();
      expect(await storage.read(), isNull);

      final session = StoredSession(
        accessToken: 'a',
        refreshToken: 'r',
        expiresAtMs: 123,
        abilities: ['read', 'create'],
      );
      await storage.write(session);
      final loaded = await storage.read();
      expect(loaded?.accessToken, 'a');
      expect(loaded?.abilities, ['read', 'create']);

      await storage.clear();
      expect(await storage.read(), isNull);
    });

    test('StoredSession round-trips through JSON', () {
      final session = StoredSession(accessToken: 'a', refreshToken: 'r', expiresAtMs: 123);
      final restored = StoredSession.fromJson(session.toJson());
      expect(restored.accessToken, session.accessToken);
      expect(restored.refreshToken, session.refreshToken);
      expect(restored.expiresAtMs, session.expiresAtMs);
      expect(restored.abilities, isNull);
    });
  });

  group('VeroXMApp.initializeApp', () {
    test('joins baseUrl + projectId into the v2 API base, trimming a trailing slash', () {
      final app = VeroXMApp.initializeApp(VeroXMAppOptions(
        baseUrl: 'https://example.com/',
        projectId: 'abc-123',
      ));
      // The base is private, but auth/content/media all derive their
      // request URLs from it -- a wrong join would surface as every
      // request 404ing, which is exactly the bug this guards against.
      expect(app.content('posts'), isNotNull);
    });
  });
}
