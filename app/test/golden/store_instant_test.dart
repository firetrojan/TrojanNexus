// store_instant_test.dart - hand test (NOT a golden): the store must stamp the REAL instant.
//
// The two fields that carry an instant (not a calendar date) are:
//   - exportData()['exportedAt']  (store.js:585  new Date().toISOString())
//   - a mission step's doneAt     (store.js:575  new Date().toISOString())
//
// Both must be the real point in time, printed in UTC. They must NOT be the local wall clock with
// a Z glued on: under TZ=Asia/Kolkata that would be 5h30 too late, under TZ=America/Los_Angeles
// 7h too early.
//
// This test uses the REAL clock (DateTime.now), so it needs no frozen date and no golden file.
// It runs in whatever zone the suite runs in; the whole suite is run under UTC, Asia/Kolkata and
// America/Los_Angeles.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/store_core.dart';
import 'package:nexus/core/storage.dart';

StoreCore _realClockStore() {
  final store = StoreCore(
    clock: Clock(), // the real clock: DateTime.now
    idGen: (p) => '${p}1',
    storage: MemoryStorage(),
  );
  store.load(<String, Object?>{
    'resources': <Object?>[
      <String, Object?>{
        'id': 's1',
        'title': 'Sample s1',
        'url': 'https://s1.example.org/',
        'status': 'active',
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

/// The second the stamp belongs to (milliseconds dropped).
int _seconds(String iso) => DateTime.parse(iso).toUtc().millisecondsSinceEpoch ~/ 1000;

void main() {
  test('exportedAt and doneAt are the real instant, to the second', () {
    final store = _realClockStore();

    final before = DateTime.now().toUtc();
    final exportedAt = store.exportData()['exportedAt'] as String;
    store.setStepDone('th1', 0, true);
    final doneAt = store.threads.first.steps.first.doneAt;
    final after = DateTime.now().toUtc();

    for (final stamp in <String>[exportedAt, doneAt]) {
      expect(stamp.endsWith('Z'), isTrue);
      final sec = _seconds(stamp);
      final ok = sec == _seconds(before.toIso8601String()) || sec == _seconds(after.toIso8601String());
      expect(ok, isTrue);
    }
  });

  test('exportedAt equals DateTime.now().toUtc().toIso8601String() to the second', () {
    final store = _realClockStore();
    final reference = DateTime.now().toUtc();
    final exportedAt = store.exportData()['exportedAt'] as String;
    final after = DateTime.now().toUtc();
    final sec = _seconds(exportedAt);
    final ok = sec == _seconds(reference.toIso8601String()) || sec == _seconds(after.toIso8601String());
    expect(ok, isTrue);
  });
}
