/// Thrown for any non-2xx response from the VeroXM public API.
///
/// [message] is the best human-readable string the SDK could pull out of
/// the response body -- mirrors the JS SDK's `VeroXMApiError.messageFrom`:
/// NestJS returns a plain `{error: "..."}` body for exceptions constructed
/// with an object, or `{statusCode, message, error}` for one constructed
/// with a string (message may be a string or an array of validation
/// messages). [body] is the raw decoded JSON (or raw text if it wasn't
/// JSON) in case you need more than the message.
class VeroXMApiError implements Exception {
  final int status;
  final dynamic body;
  final String message;

  VeroXMApiError(this.status, this.body) : message = _messageFrom(status, body);

  static String _messageFrom(int status, dynamic body) {
    if (body is Map) {
      final error = body['error'];
      if (error is String) return error;
      final message = body['message'];
      if (message is String) return message;
      if (message is List) return message.join(', ');
      final errors = body['errors'];
      if (errors != null) return errors.toString();
    }
    return 'Request failed with status $status';
  }

  @override
  String toString() => 'VeroXMApiError($status): $message';
}

/// Thrown by [VeroXMAuth.getAccessToken] (and anything that calls it --
/// i.e. every [VeroXMApp.request]) when nothing has signed in yet.
class VeroXMNotAuthenticatedError implements Exception {
  @override
  String toString() =>
      "Not signed in -- call auth.signInWithCredentials() or auth.signInWithApiKey() first.";
}
