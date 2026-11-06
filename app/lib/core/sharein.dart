// sharein.dart - turn what another app shares (title, text, url) into text for Quick Add.
// Port of legacy/web-src/js/sharein.js.
final RegExp _urlRx = RegExp(r'''https?://[^\s<>"'`]+''', caseSensitive: false);

String _trimUrl(Object? value) =>
    (value == null ? '' : value.toString()).replaceFirst(RegExp(r'''[)\].,;:!?'"]+$'''), '');

String _clip(Object? value, int n) {
  final s = (value == null ? '' : value.toString()).replaceAll(RegExp(r'\s+'), ' ').trim();
  return s.length > n ? s.substring(0, n) : s;
}

String _first(List<Object?> values) {
  for (final value in values) {
    final m = _urlRx.firstMatch(value == null ? '' : value.toString());
    if (m != null) return _trimUrl(m[0]);
  }
  return '';
}

Map<String, String>? _params(String search) {
  try {
    final s = search.startsWith('?') ? search.substring(1) : search;
    return Uri.splitQueryString(s);
  } catch (_) {
    return null;
  }
}

/// search = location.search. Returns text/url/title for Quick Add, or null when nothing was shared.
Map<String, String>? parseShare(String search) {
  final p = _params(search);
  if (p == null) return null;
  final title = _clip(p['title'], 200);
  final text = (p['text'] ?? '').substring(0, (p['text'] ?? '').length < 4000 ? (p['text'] ?? '').length : 4000);
  final raw = (p['url'] ?? '').trim();
  if (title.isEmpty && text.isEmpty && raw.isEmpty) return null;
  final url = RegExp(r'^https?://', caseSensitive: false).hasMatch(raw) ? _trimUrl(raw) : _first(<Object?>[raw, text, title]);
  if (url.isEmpty) {
    final note = _clip(<String>[title, text].where((x) => x.isNotEmpty).join(' - '), 600);
    return note.isEmpty ? null : <String, String>{'text': note, 'url': '', 'title': title};
  }
  final left = _clip(
    text
        .split(url)
        .join(' ')
        .replaceAllMapped(RegExp(r'\s+([,;.!?])'), (m) => m[1]!)
        .replaceFirst(RegExp(r'\s*[-:|]\s*$'), ''),
    120,
  );
  final name = (title.isNotEmpty && !_urlRx.hasMatch(title) ? title : '').isNotEmpty
      ? (title.isNotEmpty && !_urlRx.hasMatch(title) ? title : '')
      : (left.isNotEmpty && !_urlRx.hasMatch(left) ? left : '');
  final cleanName = name.replaceAll('|', '-');
  return <String, String>{
    'text': cleanName.isNotEmpty && cleanName != url ? '$cleanName | $url' : url,
    'url': url,
    'title': cleanName,
  };
}

/// App shortcuts open the app at ?do=add, search, review or due. Anything else is ignored.
String parseAction(String search) {
  final p = _params(search);
  if (p == null) return '';
  final v = (p['do'] ?? '').toLowerCase();
  return <String>['add', 'search', 'review', 'due'].contains(v) ? v : '';
}
