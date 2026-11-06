import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/tidy.dart';

import 'golden.dart';

void main() {
  runGolden('tidy', {
    'cleanUrl': (a) => cleanUrl(a[0] as String?),
    'droppedParams': (a) => droppedParams(a[0] as String?),
    'cleanTitle': (a) => cleanTitle(a[0] as String?, a[1] as String?),
    'tidyFindings': (a) {
      final raw = a[0] as List<dynamic>;
      final resources = raw.map((x) => normalizeResource(x)).toList();
      return tidyFindings(resources).toJson();
    },
  });
}
