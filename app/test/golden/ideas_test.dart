import 'package:nexus/core/ideas.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('ideas', {
    'sectorIdeas': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      final jobNames = (a[1] as List<dynamic>).map((x) => x.toString()).toList();
      final manual = a[2] as Map<String, dynamic>;
      final labels = a[3] as Map<String, dynamic>;
      final opts = a.length > 4 ? a[4] as Map<String, dynamic> : const <String, dynamic>{};
      return sectorIdeas(
        resources,
        jobNames,
        (id) => (manual[id] as List<dynamic>? ?? <dynamic>[])
            .map((x) => x.toString())
            .toList(),
        typeLabel: (t) => labels[t]?.toString() ?? t,
        min: (opts['min'] as num?)?.toInt() ?? 3,
        max: (opts['max'] as num?)?.toInt() ?? 4,
      ).map((x) => x.toJson()).toList();
    },
  });
}
