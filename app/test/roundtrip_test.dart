// roundtrip_test.dart - a real backup must load and come back out unchanged.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/store_core.dart';

import 'golden/golden.dart';

void main() {
  test('sample backup round trips (exportedAt ignored)', () {
    final raw = jsonDecode(_fixture('fixtures/sample-backup.json').readAsStringSync())
        as Map<String, Object?>;
    final store = _store();
    store.load(raw);
    final actual = _snapshot(store)..remove('exportedAt');
    final expected = Map<String, Object?>.from(raw)..remove('exportedAt');
    expect(jsonEquals(actual, expected), isTrue);
  });

  test('a bare list of resources still loads', () {
    final store = _store();
    store.load(<Object?>[
      <String, Object?>{'id': 'b1', 'title': 'Bare', 'url': 'https://bare.test/'},
    ]);
    expect(store.resources.length, 1);
    expect(store.resources.single.title, 'Bare');
  });

  test('old-format mission steps that are plain ids still load', () {
    final store = _store();
    store.load(<String, Object?>{
      'resources': <Object?>[
        <String, Object?>{'id': 'r1', 'title': 'R', 'url': 'https://r.test/'},
      ],
      'threads': <Object?>[
        <String, Object?>{
          'id': 't1',
          'name': 'Old mission',
          'steps': <Object?>['r1'],
        },
      ],
    });
    final thread = store.threadById('t1');
    expect(thread, isNotNull);
    expect(thread!.steps.single.rid, 'r1');
  });
}

StoreCore _store() {
  var n = 0;
  return StoreCore(
    clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
    idGen: (kind) => '${kind}rt${++n}',
    storage: MemoryStorage(),
  );
}

Map<String, Object?> _snapshot(StoreCore s) => <String, Object?>{
      ...s.exportData(),
      'resources': s.resources.map((x) => x.toJson()).toList(),
      'jobs': s.jobs.map((x) => x.toJson()).toList(),
      'threads': s.threads.map((x) => x.toJson()).toList(),
    };

File _fixture(String name) {
  var d = Directory.current.absolute;
  for (var i = 0; i < 7; i++) {
    final f = File('${d.path}${Platform.pathSeparator}$name');
    if (f.existsSync()) return f;
    d = d.parent;
  }
  throw StateError('$name not found above ${Directory.current.path}');
}
