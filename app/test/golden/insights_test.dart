import 'package:nexus/core/insights.dart';
import 'package:nexus/core/model/job.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('insights', {
    'mostUsed': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      return mostUsed(resources, (a[1] as num).toInt())
          .map((r) => r.id)
          .toList();
    },
    'addedPerMonth': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      return addedPerMonth(resources, a[1] as String, (a[2] as num).toInt())
          .map((x) => x.toJson())
          .toList();
    },
    'looseEnds': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      final map = a[1] as Map<String, dynamic>;
      return looseEnds(
        resources,
        (id) => (map[id] as List<dynamic>? ?? <dynamic>[])
            .map((x) => x.toString())
            .toList(),
      ).toJson();
    },
    'storageInfo': (a) => storageInfo(
          a[0] as num,
          a.length > 1 ? (a[1] as num).toInt() : 5 * 1024 * 1024,
        ).toJson(),
    'cullInfo': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      final ctx = a[1] as Map<String, dynamic>;
      final missions = (ctx['inMission'] as List<dynamic>? ?? <dynamic>[])
          .map((x) => x.toString())
          .toSet();
      final info = cullInfo(
        resources,
        CullContext(
          today: ctx['today']?.toString() ?? '',
          opensSince: ctx['opensSince']?.toString() ?? '',
          inMission: missions,
        ),
      );
      return <String, Object?>{
        'ready': info.ready,
        'daysTracked': info.daysTracked,
        'waitDays': info.waitDays,
        'since': info.since,
        'list': info.list
            .map((x) => <String, Object?>{'id': x.r.id, 'idle': x.idle})
            .toList(),
      };
    },
    'sectorShare': (a) {
      final jobs = (a[0] as List<dynamic>)
          .map((x) => normalizeJob(x))
          .toList();
      final byId = <String, Resource>{};
      for (final x in sharedLinks()) {
        final r = normalizeResource(x);
        byId[r.id] = r;
      }
      return sectorShare(jobs, (id) => byId[id])
          .map((x) => x.toJson())
          .toList();
    },
    'IDLE_DAYS': (a) => IDLE_DAYS,
  });
}
