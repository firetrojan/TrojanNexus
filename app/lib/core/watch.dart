// watch.dart - port of legacy/web-src/js/watch.js (notice when a page changed).
// Pure functions: compare only the title, description and headings a page shows.
import 'util.dart';

String _clip(Object? value, int n) {
  final s = (value == null ? '' : '$value').replaceAll(RegExp(r'\s+'), ' ').trim();
  return s.length > n ? s.substring(0, n) : s;
}

bool _truthy(Object? value) {
  if (value == null || value == false) return false;
  if (value is String) return value.isNotEmpty;
  if (value is num) return value != 0;
  return true;
}

/// For comparing: lower case, numbers masked (counters, dates and prices change all the time), spaces squeezed.
String norm(Object? value) {
  var s = _clip(value, 400).toLowerCase();
  s = s.replaceAll(RegExp(r'\d[\d,.:/\-]*'), '#');
  return s.replaceAll(RegExp(r'\s+'), ' ').trim();
}

/// The small record kept for a page. via = how it was read ('direct' or 'reader').
Map<String, Object?> fingerprint(Object? page, [Object? via]) {
  final p = page is Map ? page : const <String, Object?>{};
  final headings = p['headings'];
  final raw = headings is List ? headings : const <Object?>[];
  final h = <String>[];
  for (final x in raw) {
    final v = _clip(x, 90);
    if (v.isNotEmpty) h.add(v);
    if (h.length >= 12) break;
  }
  final title = _truthy(p['ogTitle']) ? p['ogTitle'] : p['title'];
  return <String, Object?>{
    't': _clip(title, 160),
    'd': _clip(p['description'], 300),
    'h': h,
    'via': _slice(via == null ? '' : '$via', 12),
  };
}

String _slice(String s, int n) => s.length > n ? s.substring(0, n) : s;

/// Enough to compare against? A page with no title and no headings is not watchable.
bool usable(Object? fp) {
  if (fp == null) return false;
  final m = fp as Map;
  final headings = m['h'] as List;
  final t = m['t'];
  return _truthy(t) || headings.isNotEmpty;
}

/// What changed between two fingerprints. rebase means the page was read a different way.
Map<String, Object?> compare(Object? left, Object? right) {
  if (!usable(right)) {
    return <String, Object?>{'same': true, 'what': <String>[], 'unreadable': true};
  }
  if (!usable(left)) {
    return <String, Object?>{'same': true, 'what': <String>[], 'rebase': true};
  }
  final a = (left as Map).cast<String, Object?>();
  final b = (right as Map).cast<String, Object?>();
  if (_truthy(a['via']) && _truthy(b['via']) && '${a['via']}' != '${b['via']}') {
    return <String, Object?>{'same': true, 'what': <String>[], 'rebase': true};
  }
  final what = <String>[];
  if (norm(a['t']) != norm(b['t'])) {
    what.add('The title changed: "${_clip(a['t'], 60)}" is now "${_clip(b['t'], 60)}".');
  }
  if (norm(a['d']) != norm(b['d']) && (_truthy(a['d']) || _truthy(b['d']))) {
    if (_truthy(a['d']) && _truthy(b['d'])) {
      what.add('The description changed.');
    } else if (_truthy(b['d'])) {
      what.add('A description appeared.');
    } else {
      what.add('The description is gone.');
    }
  }
  final ha = <String, String>{};
  final hb = <String, String>{};
  final ah = a['h'];
  final bh = b['h'];
  for (final x in (ah is List ? ah : const <Object?>[])) {
    ha[norm(x)] = '$x';
  }
  for (final x in (bh is List ? bh : const <Object?>[])) {
    hb[norm(x)] = '$x';
  }
  final added = <String>[];
  final gone = <String>[];
  for (final e in hb.entries) {
    if (!ha.containsKey(e.key)) added.add(e.value);
  }
  for (final e in ha.entries) {
    if (!hb.containsKey(e.key)) gone.add(e.value);
  }
  if (added.isNotEmpty) {
    what.add((added.length == 1 ? 'New heading: ' : '${added.length} new headings, like ') +
        '"${_clip(added.first, 60)}".');
  }
  if (gone.isNotEmpty) {
    what.add((gone.length == 1 ? 'A heading is gone: ' : '${gone.length} headings are gone, like ') +
        '"${_clip(gone.first, 60)}".');
  }
  return <String, Object?>{'same': what.isEmpty, 'what': what.length > 4 ? what.sublist(0, 4) : what};
}

/// The part stored on a resource. null = not watched.
Map<String, Object?>? normWatch(Object? value) {
  if (value == null || value is! Map || !_truthy(value['on'])) return null;
  final w = value.cast<String, Object?>();
  final rawFp = w['fp'];
  Map<String, Object?>? fp;
  if (rawFp != null && rawFp is Map) {
    final h = <String>[];
    final rawH = rawFp['h'];
    for (final x in (rawH is List ? rawH : const <Object?>[])) {
      final v = _clip(x, 90);
      if (v.isNotEmpty) h.add(v);
      if (h.length >= 12) break;
    }
    fp = <String, Object?>{
      't': _clip(rawFp['t'], 160),
      'd': _clip(rawFp['d'], 300),
      'h': h,
      'via': _slice(rawFp['via'] == null ? '' : '${rawFp['via']}', 12),
    };
    if (!usable(fp)) fp = null;
  }
  final rawWhat = w['what'];
  final what = <String>[];
  for (final x in (rawWhat is List ? rawWhat : const <Object?>[])) {
    final v = _clip(x, 200);
    if (v.isNotEmpty) what.add(v);
    if (what.length >= 4) break;
  }
  return <String, Object?>{
    'on': true,
    'at': _day(w['at']),
    'fp': fp,
    'changed': _day(w['changed']),
    'what': what,
  };
}

String _day(Object? value) {
  final s = value == null ? '' : '$value';
  return parseISO(s) == null ? '' : _slice(s, 10);
}
