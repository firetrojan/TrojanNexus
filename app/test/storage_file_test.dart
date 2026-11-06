// storage_file_test.dart - the file backend must survive a half-finished write
// and keep only the newest copies.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/storage_file.dart';

void main() {
  late Directory dir;
  late String path;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('nexus-storage-');
    path = '${dir.path}${Platform.pathSeparator}store.json';
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  test('write and read one document', () async {
    final s = FileStorage(path);
    await s.write('{"a":1}');
    expect(await s.read(), '{"a":1}');
  });

  test('a failed write leaves the old file readable', () async {
    final good = FileStorage(path);
    await good.write('first');
    final crashing = FileStorage(
      path,
      beforeRename: (_) => throw StateError('crash'),
    );
    await expectLater(crashing.write('second'), throwsStateError);
    expect(await good.read(), 'first');
  });

  test('keeps only the last five copies', () async {
    final s = FileStorage(path);
    for (var i = 1; i <= 8; i++) {
      await s.write('v$i');
    }
    expect(await s.read(), 'v8');
    final copies = dir
        .listSync()
        .whereType<File>()
        .where((f) => f.uri.pathSegments.last.contains('.bak.'))
        .length;
    expect(copies, 5);
  });

  test('falls back to the newest copy if the main file is gone', () async {
    final s = FileStorage(path);
    await s.write('old');
    await s.write('new');
    await File(path).delete();
    expect(await s.read(), 'old');
  });
}
