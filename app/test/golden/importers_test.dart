import 'package:nexus/core/importers.dart';

import 'golden.dart';

Object? _throws(Object? Function() body) {
  try {
    return body();
  } catch (e) {
    if (e is TypeError) return <String, Object?>{'throws': 'TypeError'};
    if (e is FormatException) return <String, Object?>{'throws': 'SyntaxError'};
    if (e is StateError) return <String, Object?>{'throws': 'Error'};
    return <String, Object?>{'throws': e.runtimeType.toString()};
  }
}

Map<Object?, Object?> _map(Object? value) => (value as Map).cast<Object?, Object?>();

void main() {
  runGolden('importers', <String, GoldenFn>{
    'decode': (a) => decode(a[0]),
    'toISODate': (a) => toISODate(a[0]),
    'sniff': (a) => sniff(a[0] as String, a.length > 1 ? a[1] as String : ''),
    'detectFormat': (a) => detectFormat(a[0] as String),
    'parseBookmarksHTML': (a) => parseBookmarksHTML(a[0] as String),
    'parseBookmarksJSON': (a) => parseBookmarksJSON(_map(a[0])),
    'parseOPML': (a) => parseOPML(a[0] as String),
    'parseCSVRows': (a) => parseCSVRows(a[0] as String),
    'parseCSV': (a) => parseCSV(a[0] as String),
    'parseShortcut': (a) => parseShortcut(a[0] as String, a.length > 1 ? a[1] as String : ''),
    'parseLinksHTML': (a) => parseLinksHTML(a[0] as String),
    'parseUrlList': (a) => parseUrlList(a[0] as String),
    'parseJSONArray': (a) => _throws(() => parseJSONArray(a[0])),
    'parseInstagramList': (a) => parseInstagramList(a[0]),
    'parseInstagramFollowing': (a) => parseInstagramFollowing(a[0]),
    'inferType': (a) => inferType(a[0] as String, a.length > 1 ? a[1] as String : ''),
    'inferTags': (a) => inferTags(a[0] as String, a.length > 1 ? a[1] as String : ''),
    'entryToResource': (a) => entryToResource(_map(a[0]).cast<String, Object?>()),
    'readSource': (a) => readSource(a[0] as String, a[1] as String),
    'parseAny': (a) => parseAny(a[0] as String),
    'KIND_LABEL': (a) => kindLabel,
    'stem': (a) => stem(importerStr(a[0])),
  });
}
