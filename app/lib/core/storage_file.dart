// storage_file.dart - the file backend: one JSON file, written atomically,
// with the last few copies kept next to it.
import 'dart:io';

import 'storage.dart';

class FileStorage implements Storage {
  FileStorage(
    this.path, {
    this.keep = 5,
    this.beforeRename,
  });

  final String path;
  final int keep;

  /// Test hook: runs after the temp file is complete and before the rename.
  final void Function(File temp)? beforeRename;

  File get _file => File(path);
  String get _name => path.split(Platform.pathSeparator).last;

  @override
  Future<String?> read() async {
    final f = _file;
    if (await f.exists()) return f.readAsString();
    final copies = await _copies();
    if (copies.isNotEmpty) return copies.first.readAsString();
    return null;
  }

  @override
  Future<void> write(String json) async {
    final f = _file;
    await f.parent.create(recursive: true);
    final temp = File(
      '$path.tmp.${DateTime.now().microsecondsSinceEpoch}.$pid',
    );
    await temp.writeAsString(json, flush: true);
    beforeRename?.call(temp);
    if (await f.exists()) {
      final copy = File(
        '$path.bak.${DateTime.now().microsecondsSinceEpoch}',
      );
      await f.copy(copy.path);
    }
    await temp.rename(path);
    await _prune();
  }

  Future<List<File>> _copies() async {
    final dir = _file.parent;
    if (!await dir.exists()) return <File>[];
    final prefix = '$_name.bak.';
    final out = <File>[];
    await for (final e in dir.list()) {
      if (e is File && e.uri.pathSegments.last.startsWith(prefix)) out.add(e);
    }
    out.sort((a, b) => _stamp(b).compareTo(_stamp(a)));
    return out;
  }

  Future<void> _prune() async {
    final copies = await _copies();
    for (var i = keep < 0 ? 0 : keep; i < copies.length; i++) {
      try {
        await copies[i].delete();
      } catch (_) {}
    }
  }

  int _stamp(File f) {
    final name = f.uri.pathSegments.last;
    final i = name.lastIndexOf('.bak.');
    if (i < 0) return 0;
    return int.tryParse(name.substring(i + 5)) ?? 0;
  }
}
