import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/week.dart';

import 'golden.dart';

void main() {
  runGolden('week', {
    'normWeekly': (a) => normWeekly(a[0]).toJson(),
    'resetDue': (a) => resetDue(a[0], a[1] as String, (a[2] as num).toInt()).toJson(),
    'activePicks': (a) {
      final exists = (a[2] as List<dynamic>).map((x) => x.toString()).toSet();
      return activePicks(a[0], a[1] as String, exists.contains)
          .map((p) => p.toJson())
          .toList();
    },
    'setPicks': (a) {
      final rids = (a[1] as List<dynamic>).map((x) => x.toString()).toList();
      return setPicks(a[0], rids, a[2] as String).toJson();
    },
    'togglePick': (a) => togglePick(a[0], a[1] as String).toJson(),
    'finishReset': (a) => finishReset(a[0], a[1] as String).toJson(),
    'snoozeReset': (a) {
      final days = a.length > 2 ? (a[2] as num).toInt() : 2;
      return snoozeReset(a[0], a[1] as String, days).toJson();
    },
    'suggestPicks': (a) {
      final raw = a[0] as Map<String, dynamic>;
      final needs = <WeekNeed>[];
      for (final x in (raw['needs'] as List<dynamic>? ?? <dynamic>[])) {
        final m = x as Map<String, dynamic>;
        needs.add(WeekNeed(
          Resource(id: m['rid']?.toString() ?? ''),
          m['kind']?.toString() ?? '',
          m['sub']?.toString() ?? '',
        ));
      }
      final missionRaw = raw['mission'];
      WeekMission? mission;
      if (missionRaw is Map) {
        mission = WeekMission(
          Resource(id: missionRaw['rid']?.toString() ?? ''),
          missionRaw['name']?.toString() ?? '',
        );
      }
      final stale = (raw['stale'] as List<dynamic>? ?? <dynamic>[])
          .map((x) => Resource(id: x.toString()))
          .toList();
      final drafts = (raw['drafts'] as List<dynamic>? ?? <dynamic>[])
          .map((x) => Resource(id: x.toString()))
          .toList();
      return suggestPicks(SuggestContext(
        needs: needs,
        mission: mission,
        stale: stale,
        drafts: drafts,
      )).map((x) => x.toJson()).toList();
    },
    'weekDigest': (a) {
      final raw = a[0] as List<dynamic>;
      final resources = raw.map((x) => normalizeResource(x)).toList();
      return weekDigest(resources, a[1], a[2] as String).toJson();
    },
    'RESET_EVERY': (a) => RESET_EVERY,
    'PICKS_LIVE': (a) => PICKS_LIVE,
    'MAX_PICKS': (a) => MAX_PICKS,
  });
}
