import 'client.dart';
import 'http.dart';

/// One item in the project's media library, as returned by the API.
class MediaItem {
  final int id;
  final String fileName;
  final String fullUrl;
  final String thumbUrl;
  final String? caption;
  final int size;
  final int? width;
  final int? height;

  const MediaItem({
    required this.id,
    required this.fileName,
    required this.fullUrl,
    required this.thumbUrl,
    required this.size,
    this.caption,
    this.width,
    this.height,
  });

  factory MediaItem.fromJson(Map<String, dynamic> json) => MediaItem(
        id: json['id'] as int,
        fileName: json['fileName'] as String,
        fullUrl: json['fullUrl'] as String,
        thumbUrl: json['thumbUrl'] as String,
        caption: json['caption'] as String?,
        size: json['size'] as int,
        width: json['width'] as int?,
        height: json['height'] as int?,
      );
}

/// A page of [MediaItem]s, as returned by [MediaResource.list].
class MediaPage {
  final List<MediaItem> data;
  final int? total;
  final int? page;

  const MediaPage({required this.data, this.total, this.page});

  factory MediaPage.fromJson(Map<String, dynamic> json) => MediaPage(
        data: (json['data'] as List)
            .map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: json['total'] as int?,
        page: json['page'] as int?,
      );
}

/// A file to upload -- raw bytes plus the filename/content-type the
/// server should store it as. Build this from `File.readAsBytes()`
/// (dart:io, non-web), an `XFile`/`image_picker` result's `.readAsBytes()`,
/// or a `<input type=file>` pick on Flutter web -- this package doesn't
/// depend on any of those, so wiring up the actual file picker is your
/// app's job.
class UploadableFile {
  final List<int> bytes;
  final String filename;

  /// e.g. `'image/png'`. Images are thumbnailed server-side automatically;
  /// other file types are stored as-is.
  final String? contentType;

  const UploadableFile({required this.bytes, required this.filename, this.contentType});
}

/// This project's media library (list/upload/updateCaption/delete).
class MediaResource {
  final VeroXMApp _app;

  MediaResource(this._app);

  Future<MediaPage> list({int? page, String? search}) async {
    final result = await _app.request(RawRequestOptions(
      path: '/media',
      query: {'page': page?.toString(), 'search': search},
    ));
    return MediaPage.fromJson(result as Map<String, dynamic>);
  }

  /// Max size is whatever this project's server allows (commonly 20MB).
  Future<MediaItem> upload(UploadableFile file, {String? caption}) async {
    final result = await _app.request(RawRequestOptions(
      method: 'POST',
      path: '/media/upload',
      multipart: MultipartUpload(
        bytes: file.bytes,
        filename: file.filename,
        contentType: file.contentType,
        caption: caption,
      ),
    ));
    return MediaItem.fromJson(result as Map<String, dynamic>);
  }

  Future<MediaItem> updateCaption(int id, String caption) async {
    final result = await _app.request(RawRequestOptions(
      method: 'PATCH',
      path: '/media/$id',
      json: {'caption': caption},
    ));
    return MediaItem.fromJson(result as Map<String, dynamic>);
  }

  Future<void> delete(int id) async {
    await _app.request(RawRequestOptions(method: 'DELETE', path: '/media/$id'));
  }
}
