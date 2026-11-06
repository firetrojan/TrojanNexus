import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/search.dart';
import 'package:nexus/core/spell.dart';

import 'golden.dart';

SearchOptions _options(Object? raw) {
  final m = raw is Map ? raw : const <Object?, Object?>{};
  Set<String>? strings(Object? value) {
    if (value is! List) return null;
    return value.map((x) => x.toString()).toSet();
  }

  return SearchOptions(
    mode: m['mode']?.toString() ?? 'and',
    types: strings(m['types']),
    statuses: strings(m['statuses']),
  );
}

List<Resource> _resources(Object? raw) =>
    (raw as List<dynamic>).map((x) => normalizeResource(x)).toList();

void main() {
  runGolden('spell', {
    'vocabulary': (a) => vocabulary(_resources(a[0])),
    'editDistance': (a) => editDistance(
          a[0] as String,
          a[1] as String,
          (a[2] as num?)?.toInt() ?? 2,
        ),
    'didYouMean': (a) {
      final resources = _resources(a[0]);
      final fix = didYouMean(a[1] as String, vocabulary(resources));
      return fix?.toJson();
    },
    'suggestFix': (a) {
      final resources = _resources(a[0]);
      final fix = suggestFix(resources, a[1] as String, _options(a[2]));
      return fix?.toJson();
    },
  });
}
