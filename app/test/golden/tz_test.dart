// tz_test.dart - the clock-reading functions at two LOCAL wall times (2026-10-31 02:00 and
// 23:30), from fixtures/golden/tz.json. The Dart clock is frozen with LOCALLY built
// DateTime(2026,10,31,2,0) / DateTime(2026,10,31,23,30) - NOT DateTime.utc - because the
// JS iso()/todayISO() use local date parts. Under TZ=Asia/Kolkata or America/Los_Angeles
// a UTC-getter port would answer the wrong day and this test goes RED.
//
// One exception: exporters.icsFor prints `now` as a UTC instant (DTSTAMP), and the golden was
// generated with the generator running under TZ=UTC, so the recorded DTSTAMP is the wall clock
// read as UTC. The adapter therefore hands icsFor that same instant explicitly instead of the
// frozen local clock, which is the only way the answer can be zone independent. Everything else
// in that file (DTSTART, DTEND, UID, SUMMARY) comes from the event dates, which do not move.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/buckets.dart';
import 'package:nexus/core/exporters.dart';
import 'package:nexus/core/export_calendar.dart';
import 'package:nexus/core/game.dart';
import 'package:nexus/core/home.dart';
import 'package:nexus/core/insights.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/rule.dart';
import 'package:nexus/core/rules.dart';
import 'package:nexus/core/store_core.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/util.dart';
import 'package:nexus/core/week.dart';
import 'dart:convert';

import 'golden.dart';

final List<dynamic> _cases = (readGolden('tz.json') as Map<String, dynamic>)['cases'] as List<dynamic>;

DateTime _wall(String wall) {
  final h = int.parse(wall.split(':')[0]);
  final m = int.parse(wall.split(':')[1]);
  return DateTime(2026, 10, 31, h, m); // LOCAL wall time, on purpose
}

/// The same wall time as an INSTANT (the generator froze Date at Date.UTC(...)).
DateTime _instant(String wall) {
  final h = int.parse(wall.split(':')[0]);
  final m = int.parse(wall.split(':')[1]);
  return DateTime.utc(2026, 10, 31, h, m);
}

List<Resource> _resources(Object? raw) =>
    (raw as List).map((x) => normalizeResource((x as Map).cast<String, Object?>())).toList();

void main() {
  group('tz golden', () {
    var n = 0;
    for (final c in _cases) {
      n++;
      final cm = c as Map<String, dynamic>;
      final fn = cm['fn'] as String;
      final wall = cm['wall'] as String;
      final args = (cm['in'] as List<dynamic>);
      final out = cm['out'];
      test('$fn @$wall #$n', () {
        nowClock = () => _wall(wall);
        final actual = _run(fn, wall, args);
        if (!jsonEquals(actual, out)) {
          fail('$fn @$wall\n  expected: ${jsonEncode(out)}\n  actual:   ${jsonEncode(actual)}');
        }
      });
    }
  });
}

Object? _run(String fn, String wall, List<dynamic> a) {
  switch (fn) {
    case 'util.todayISO':
      return todayISO();
    case 'util.addDays':
      return addDays(a[0] as String?, (a[1] as num).toInt());
    case 'exporters.markdownAll':
      return markdownAll(ExportState.fromJson(a[0]));
    case 'exporters.upcomingEvents':
      return upcomingEvents(_resources(a[0]));
    case 'exporters.icsFor':
      final w = _wall(wall);
      return icsFor((a[0] as List).map((x) => (x as Map).cast<String, Object?>()).toList(),
          <String, Object?>{'now': DateTime.utc(w.year, w.month, w.day, w.hour, w.minute)});

    case 'home.needsItems':
      final fns = HomeNeedsFns(
        trialBucket: (r, day) => trialBucket(r, day) ?? '',
        dueBucket: (r, day) => dueBucket(r, day) ?? '',
        resetBucket: (r, day) => resetBucket(r, day) ?? '',
        watchChanged: watchChanged,
      );
      return needsItems(_resources(a[0]), fns)
          .map((x) => <String, Object?>{
                'kind': x.kind,
                'rank': x.rank,
                'sub': x.sub,
                'r': <String, Object?>{'id': x.r.id},
              })
          .toList();
    case 'rules.condMatches':
      final c = (a[1] as Map).cast<String, Object?>();
      return condMatches(normalizeResource((a[0] as Map).cast<String, Object?>()),
          Cond(f: c['f']?.toString() ?? '', op: c['op']?.toString() ?? '', v: c['v']?.toString() ?? ''));
    case 'rules.matches':
      final rule = (a[1] as Map).cast<String, dynamic>();
      return matchesRaw(normalizeResource((a[0] as Map).cast<String, Object?>()), rule);
    case 'insights.addedPerMonth':
      return addedPerMonth(_resources(a[0]), a[1] as String)
          .map((m) => <String, Object?>{'key': m.key, 'label': m.label, 'n': m.n})
          .toList();
    case 'game.award':
      final s = _gameStore();
      return award(s, a[0] as String, a.length > 1 ? (a[1] as num).toInt() : 1);
    case 'game.focusDone':
      final s = _gameStore();
      s.game['focus'] = [
        <String, Object?>{'date': '2026-10-30', 'minutes': 20},
      ];
      final result = focusDone(s, (a[0] as num).toInt());
      return <String, Object?>{'result': result, 'focus': s.game['focus'], 'today': focusToday(s)};
    case 'game.focusToday':
      final s = _gameStore();
      s.game['focus'] = [
        <String, Object?>{'date': '2026-10-30', 'minutes': 20},
      ];
      return focusToday(s);
    case 'game.unlock':
      final s = _gameStore();
      s.game['counters'] = <String, Object?>{'checks': 1};
      return unlock(s);
    case 'week.weekDigest':
      // The golden carries openedAt as a LOCAL wall-time string ("2026-10-25T00:00:00.000").
      // The JS reads it with new Date(str).getTime(); that string has no zone, so JS parses it
      // as LOCAL time. Here it must become a locally built DateTime, not DateTime.parse (which
      // would read it as UTC) and not DateTime.utc.
      final list = (a[0] as List).cast<Map<String, Object?>>();
      final resources = list.map((m) {
        final raw = Map<String, Object?>.from(m);
        final at = raw['openedAt'];
        if (at is String) {
          raw['openedAt'] = _localWallMs(at);
        }
        return normalizeResource(raw);
      }).toList();
      return weekDigest(resources, a[1], a[2] as String).toJson();
    case 'store.addResource':
      final s = _storeWithSeed(wall);
      final r = s.addResource((a[0] as Map).cast<String, Object?>());
      return _pick(r.toJson(), <String>['id', 'createdAt', 'statusSince', 'added', 'nextCheck']);
    case 'store.markChecked':
      final s = _storeWithSeed(wall);
      final r = s.markChecked(a[0] as String)!;
      return _pick(r.toJson(), <String>['lastChecked', 'nextCheck']);
    case 'store.startTrial':
      final s = _storeWithSeed(wall);
      final r = s.startTrial(a[0] as String, a.length > 1 ? a[1] : 14)!;
      return _pick(r.toJson(), <String>['statusSince', 'trialEnd']);
    case 'store.setVerdict':
      final s = _storeWithSeed(wall);
      final r = s.setVerdict(a[0] as String, a[1] as String, a.length > 2 ? a[2] : '')!;
      return _pick(r.toJson(), <String>['statusSince', 'verdict']);
    case 'store.snooze':
      final s = _storeWithSeed(wall);
      final r = s.snooze(a[0] as String, a[1])!;
      return _pick(r.toJson(), <String>['nextCheck']);
    case 'store.setStepDone':
      final s = _storeWithSeed(wall);
      s.setStepDone(a[0] as String, a[1] as int, a.length > 2 ? a[2] as bool : true);
      final t = s.threads.first;
      return <String, Object?>{'doneAt': t.steps.first.doneAt, 'lastDone': t.lastDone};
  }
  throw StateError('tz fn not in test: $fn');
}

/// "2026-10-25T00:00:00.000" -> the ms of that LOCAL wall time (JS: new Date(str).getTime()).
int _localWallMs(String text) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?')
      .firstMatch(text);
  if (m == null) return 0;
  final ms = int.parse(m[7]?.padRight(3, '0') ?? '0');
  return DateTime(
    int.parse(m[1]!),
    int.parse(m[2]!),
    int.parse(m[3]!),
    int.parse(m[4]!),
    int.parse(m[5]!),
    int.parse(m[6]!),
    ms,
  ).millisecondsSinceEpoch;
}

Map<String, Object?> _pick(Map<String, Object?> m, List<String> keys) =>
    <String, Object?>{for (final k in keys) k: m[k]};

/// A store with the frozen clock and one resource plus one mission step.
///
/// The clock here freezes an INSTANT, not a wall time: the generator freezes the JS Date at
/// Date.UTC(2026,10,31,2,0) and store.js writes new Date().toISOString(), so the two instant
/// fields (exportedAt, doneAt) carry that instant. A local wall clock would be a different
/// point in time in every zone, so the instant has to be the same everywhere.
StoreCore _storeWithSeed(String wall) {
  final store = StoreCore(
    clock: Clock(now: () => _instant(wall)),
    idGen: (p) => p,
    storage: MemoryStorage(),
  );
  store.load(<String, Object?>{
    'resources': <Object?>[
      <String, Object?>{
        'id': 's1',
        'title': 'Sample s1',
        'url': 'https://s1.example.org/',
        'status': 'candidate',
        'checkCadence': 'weekly',
      },
    ],
    'jobs': <Object?>[],
    'threads': <Object?>[
      <String, Object?>{
        'id': 'th1',
        'name': 'Sample mission',
        'steps': <Object?>[
          <String, Object?>{'rid': 's1', 'note': '', 'done': false, 'doneAt': ''},
        ],
        'lastDone': '',
      },
    ],
    'settings': <String, Object?>{},
    'game': <String, Object?>{},
  });
  return store;
}

/// A store whose clock is the frozen local wall time (game reads the store clock).
StoreCore _gameStore() {
  final store = StoreCore(
    clock: Clock(now: () => nowClock()),
    idGen: (p) => p,
    storage: MemoryStorage(),
  );
  store.load(<String, Object?>{});
  return store;
}
