import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'errors.dart';

/// A single request to the VeroXM public API, relative to a
/// [VeroXMApp]'s `apiBase` (already scoped to one project). Mirrors the
/// JS SDK's `RawRequestOptions`.
class RawRequestOptions {
  final String method;
  final String path;

  /// Query params. A null value is omitted (mirrors the JS SDK dropping
  /// `undefined` query values) so callers can pass optional filters
  /// straight through without conditional spreading.
  final Map<String, String?>? query;
  final Map<String, String>? headers;

  /// Encoded as a JSON body with `Content-Type: application/json` when
  /// set. Mutually exclusive with [multipart].
  final Object? json;

  /// Set only by [MediaResource.upload] -- a pre-built multipart body
  /// (bytes + filename + optional caption field).
  final MultipartUpload? multipart;

  const RawRequestOptions({
    this.method = 'GET',
    required this.path,
    this.query,
    this.headers,
    this.json,
    this.multipart,
  });
}

class MultipartUpload {
  final List<int> bytes;
  final String filename;
  final String? contentType;
  final String? caption;

  const MultipartUpload({
    required this.bytes,
    required this.filename,
    this.contentType,
    this.caption,
  });
}

dynamic _safeJsonDecode(String text) {
  try {
    return jsonDecode(text);
  } catch (_) {
    return text;
  }
}

/// Performs one request against [apiBase] and returns the decoded JSON
/// body, throwing [VeroXMApiError] on any non-2xx response. Used by both
/// [VeroXMAuth] (unauthenticated login/refresh calls) and [VeroXMApp]
/// (authenticated content/media calls).
Future<dynamic> rawRequest(String apiBase, RawRequestOptions opts) async {
  final base = apiBase.endsWith('/') ? apiBase : '$apiBase/';
  final relative = opts.path.startsWith('/') ? opts.path.substring(1) : opts.path;
  final uri = Uri.parse(base).resolveUri(Uri(path: relative)).replace(
        queryParameters: {
          if (opts.query != null)
            for (final entry in opts.query!.entries)
              if (entry.value != null) entry.key: entry.value!,
        },
      );

  http.Response res;
  if (opts.multipart != null) {
    final m = opts.multipart!;
    final request = http.MultipartRequest(opts.method, uri);
    request.headers.addAll(opts.headers ?? const {});
    request.files.add(http.MultipartFile.fromBytes(
      'file',
      m.bytes,
      filename: m.filename,
      contentType: m.contentType != null ? MediaType.parse(m.contentType!) : null,
    ));
    if (m.caption != null) request.fields['caption'] = m.caption!;
    final streamed = await request.send();
    res = await http.Response.fromStream(streamed);
  } else {
    final request = http.Request(opts.method, uri);
    request.headers.addAll(opts.headers ?? const {});
    if (opts.json != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(opts.json);
    }
    final streamed = await request.send();
    res = await http.Response.fromStream(streamed);
  }

  final parsed = res.body.isNotEmpty ? _safeJsonDecode(res.body) : null;
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw VeroXMApiError(res.statusCode, parsed ?? res.body);
  }
  return parsed;
}
