import 'package:nexus/core/pageparse.dart';

import 'golden.dart';

Map<String, Object?> _map(Object? value) => (value as Map).cast<String, Object?>();

void main() {
  runGolden('pageparse', <String, GoldenFn>{
    'wallKind': (a) => wallKind(a[0], a[1]),
    'cleanKeywords': (a) => cleanKeywords(a[0]),
    'tidyTitle': (a) => tidyTitle(a[0], a[1]),
    'parseHTML': (a) => parseHTML(a[0], a.length > 1 ? a[1].toString() : ''),
    'parseReader': (a) => parseReader(a[0], a.length > 1 ? a[1].toString() : ''),
    'parseInstagramPage': (a) => parseInstagramPage(_map(a[0]), a.length > 1 ? a[1].toString() : ''),
    'parseGithub': (a) => parseGithub(a[0]),
    'parseWikipedia': (a) => parseWikipedia(a[0]),
  });
}
