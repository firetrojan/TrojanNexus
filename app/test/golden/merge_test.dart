import 'package:nexus/core/merge.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('merge', {
    'mergePatch': (a) => mergePatch(
          normalizeResource(a[0]),
          normalizeResource(a[1]),
        ).toJson(),
    'dupeGroups': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      final ignore = (a[1] as List<dynamic>).map((x) => x.toString()).toList();
      return dupeGroups(resources, ignore).map((x) => x.toJson()).toList();
    },
  });
}
