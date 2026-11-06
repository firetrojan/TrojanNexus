import 'package:nexus/core/choices.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('choices', {
    'pushRecent': (a) => pushRecent(a[0], a[1] as String),
    'sectorChoices': (a) {
      final r = normalizeResource(a[0]);
      final jobs = (a[1] as List<dynamic>).map(SectorJob.fromJson).toList();
      final opts = a[2] as Map<String, dynamic>;
      final fits = opts['fits'] as List<dynamic>? ?? <dynamic>[];
      final recent = (opts['recent'] as List<dynamic>? ?? <dynamic>[])
          .map((x) => x.toString())
          .toList();
      final n = a.length > 3 ? (a[3] as num).toInt() : 4;
      return sectorChoices(r, jobs, fits: fits, recent: recent, n: n)
          .map((x) => x.toJson())
          .toList();
    },
    'RECENT_MAX': (a) => RECENT_MAX,
  });
}
