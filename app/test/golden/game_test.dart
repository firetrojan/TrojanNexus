import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/game.dart';
import 'package:nexus/core/store_core.dart';
import 'package:nexus/core/storage.dart';

import 'golden.dart';

/// The store the JS ran against: the state from the case, clock frozen at 2026-10-31 12:00 UTC.
StoreCore _store(Object? raw) {
  final m = (raw as Map).cast<String, Object?>();
  final store = StoreCore(
    clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
    idGen: (p) => p,
    storage: MemoryStorage(),
  );
  store.load(<String, Object?>{
    'resources': (m['resources'] as List?) ?? const <Object?>[],
    'game': m['game'],
  });
  return store;
}

void main() {
  runGolden('game', <String, GoldenFn>{
    'levelStart': (a) => levelStart(a[0] as int),
    'levelOf': (a) => levelOf(a[0] as int),
    'rankOf': (a) => rankOf(a[0] as int),
    'RANKS': (a) => RANKS,
    'XP': (a) => XP,
    'BADGES': (a) => BADGES.map((b) => b.toJson()).toList(),
    'progress': (a) => progress(_store(a[0])),
    'award': (a) => award(_store(a[0]), a[1] as String,
        a.length > 2 ? a[2] as int : 1, a.length > 3 ? a[3] as String : ''),
    'focusDone': (a) {
      final s = _store(a[0]);
      final result = focusDone(s, a[1] as int);
      return <String, Object?>{
        'result': result,
        'focus': s.game['focus'],
        'today': focusToday(s),
      };
    },
    'focusToday': (a) => focusToday(_store(a[0])),
    'unlock': (a) => unlock(_store(a[0])),
  });

  // Hand test: game.js L65 keeps only the last 400 focus runs. A golden case would need 401 runs
  // inside one case, so the cap is tested here.
  test('focusDone keeps the last 400 runs (game.js L65)', () {
    final store = StoreCore(
      clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
      idGen: (p) => p,
      storage: MemoryStorage(),
    );
    store.load(<String, Object?>{
      'game': <String, Object?>{
        'focus': List.generate(
          400,
          (i) => <String, Object?>{'date': '2026-10-0${i % 9 + 1}', 'minutes': 25},
        ),
      },
    });
    expect((store.game['focus'] as List).length, 400);
    focusDone(store, 30);
    final focus = store.game['focus'] as List;
    expect(focus.length, 400);
    expect((focus.last as Map)['minutes'], 30);
    expect((focus.last as Map)['date'], '2026-10-31');
  });
}
