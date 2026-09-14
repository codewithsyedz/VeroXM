import 'client.dart';
import 'http.dart';

/// Options shared by [ContentResource.list] and [ContentResource.search].
class ListOptions {
  /// Field-value filter -- an array of `{field: value}` clauses (AND'ed
  /// together), each value either a scalar or an operator map like
  /// `{'like': '...'}`, `{'gte': '...'}`, `{'in': 'a,b,c'}`, etc. See your
  /// project's SDK Docs tab (dashboard) for the full operator list. Only
  /// meaningful for [ContentResource.search] -- [ContentResource.list]
  /// sends everything as query params, and `where`/`whereRelation` don't
  /// have a clean query-string form.
  final Object? where;
  final Map<String, Map<String, String>>? whereRelation;

  /// e.g. `"created_at:desc"` or `"title:asc,created_at:desc"`.
  final String? sort;

  /// Pass `"only_draft"` to include unpublished entries; anything else
  /// (including omitted) returns published-only. This is the ONLY
  /// recognized value -- unlike some CMS APIs, there's no `"all"` or
  /// `"published"` literal, and an unrecognized value silently falls back
  /// to published-only rather than erroring.
  final String? state;
  final int? offset;
  final int? limit;

  /// When true, the API returns a single number (the match count) instead
  /// of a list -- see [ContentResource.count] for a typed shortcut.
  final bool? count;

  /// search() only -- returns the first match directly instead of a list
  /// (404s if there are none).
  final bool? first;

  /// Include created_at/updated_at in each returned entry.
  final bool? timestamps;

  const ListOptions({
    this.where,
    this.whereRelation,
    this.sort,
    this.state,
    this.offset,
    this.limit,
    this.count,
    this.first,
    this.timestamps,
  });

  Map<String, dynamic> _toSearchBody() => {
        if (where != null) 'where': where,
        if (whereRelation != null) 'whereRelation': whereRelation,
        if (sort != null) 'sort': sort,
        if (state != null) 'state': state,
        if (offset != null) 'offset': offset,
        if (limit != null) 'limit': limit,
        if (count != null) 'count': count,
        if (first != null) 'first': first,
        if (timestamps != null) 'timestamps': timestamps,
      };

  ListOptions copyWith({bool? count}) => ListOptions(
        where: where,
        whereRelation: whereRelation,
        sort: sort,
        state: state,
        offset: offset,
        limit: limit,
        count: count ?? this.count,
        first: first,
        timestamps: timestamps,
      );
}

/// Typed access to one content collection's entries. `T` is whatever
/// shape you expect back; pass [fromJson] to decode into your own model,
/// or leave it unset to get plain `Map<String, dynamic>` entries (`T`
/// then defaults to that). The API's actual response is a flat object per
/// the collection's own fields -- see your project's SDK Docs tab
/// (dashboard) for that collection's real field list.
///
/// Two behaviors worth knowing before you rely on them (found by testing
/// against the real API, not documented anywhere else):
///  - [get] only ever returns a PUBLISHED record -- there's no way to
///    fetch a draft by id (it 404s), even right after
///    `create({..., 'draft': true})`. Use
///    `list(ListOptions(state: 'only_draft'))` /
///    `search(ListOptions(state: 'only_draft'))` to find or inspect drafts
///    instead.
///  - [update] follows the same publish rule as [create]: omitting
///    `draft` (or passing `draft: false`) in `data` PUBLISHES the record
///    immediately, even if the update doesn't touch any content fields
///    and the record was previously a draft. Pass `draft: true`
///    explicitly to keep (or put back) a record unpublished.
class ContentResource<T> {
  final VeroXMApp _app;
  final String _slug;
  final T Function(Map<String, dynamic>)? _fromJson;

  ContentResource(this._app, this._slug, {T Function(Map<String, dynamic>)? fromJson})
      : _fromJson = fromJson;

  String get _root => '/collections/$_slug/content';

  T _decode(dynamic raw) {
    final map = raw as Map<String, dynamic>;
    if (_fromJson != null) return _fromJson!(map);
    return map as T;
  }

  Future<List<T>> list([ListOptions options = const ListOptions()]) async {
    final result = await _app.request(RawRequestOptions(
      path: _root,
      query: {
        'limit': options.limit?.toString(),
        'offset': options.offset?.toString(),
        'sort': options.sort,
        'state': options.state,
        'count': options.count == true ? '1' : null,
        'timestamps': options.timestamps == true ? '1' : null,
      },
    ));
    return (result as List).map(_decode).toList();
  }

  /// Same filters as [list], sent as a JSON body -- use this for
  /// `where`/`whereRelation`, which are awkward to express as
  /// query-string params.
  Future<List<T>> search(ListOptions options) async {
    final result = await _app.request(RawRequestOptions(
      method: 'POST',
      path: '$_root/search',
      json: options._toSearchBody(),
    ));
    return (result as List).map(_decode).toList();
  }

  /// A typed shortcut for `search(options.copyWith(count: true))` -- the
  /// API returns a bare number for a counting query, not a list.
  Future<int> count([ListOptions options = const ListOptions()]) async {
    final result = await _app.request(RawRequestOptions(
      method: 'POST',
      path: '$_root/search',
      json: options.copyWith(count: true)._toSearchBody(),
    ));
    return (result as num).toInt();
  }

  Future<T> get(int id, {bool timestamps = false}) async {
    final result = await _app.request(RawRequestOptions(
      path: '$_root/$id',
      query: {'timestamps': timestamps ? '1' : null},
    ));
    return _decode(result);
  }

  /// Fields are sent flat (no wrapper). Pass `data['draft'] = true` to
  /// create without publishing; omit it (or pass false) to publish
  /// immediately.
  Future<T> create(Map<String, dynamic> data) async {
    final result = await _app.request(RawRequestOptions(method: 'POST', path: _root, json: data));
    return _decode(result);
  }

  /// A partial update -- only the fields present in `data` are changed.
  /// See the class doc above for the publish-state footgun.
  Future<T> update(int id, Map<String, dynamic> data) async {
    final result =
        await _app.request(RawRequestOptions(method: 'PATCH', path: '$_root/$id', json: data));
    return _decode(result);
  }

  Future<void> delete(int id) async {
    await _app.request(RawRequestOptions(method: 'DELETE', path: '$_root/$id'));
  }
}
