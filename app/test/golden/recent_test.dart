import 'package:nexus/core/recent.dart';

import 'golden.dart';

void main() {
  runGolden('recent', {
    'normRecent': (a) => normRecent(a[0]).map((e) => e.toJson()).toList(),
    'pushVisit': (a) => pushVisit(a[0], a[1] as String, a[2] as String, a[3])
        .map((e) => e.toJson())
        .toList(),
    'liveVisits': (a) {
      final exists = (a[1] as List<dynamic>).map((x) => x.toString()).toSet();
      final n = a.length > 2 ? (a[2] as num).toInt() : 5;
      return liveVisits(
        a[0],
        (k, id) => exists.contains('$k:$id'),
        n,
      ).map((e) => e.toJson()).toList();
    },
    'agoText': (a) => agoText(a[0], a[1]),
    'RECENT_MAX': (a) => RECENT_MAX,
  });
}
