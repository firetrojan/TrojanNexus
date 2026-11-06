// store_ops_test.dart - the whole-store scenarios from fixtures/golden/store_ops.json.
// Each case loads a start backup, runs operations through StoreCore and compares
// returns, events, safety-copy reasons and the final state.
import 'dart:convert';

import 'package:nexus/core/model/job.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/thread.dart';
import 'package:nexus/core/store_core.dart';
import 'package:nexus/core/storage.dart';

import 'golden.dart';

void main() {
  final startFile = readGolden('_store_start.json') as Map<String, dynamic>;
  final starts = startFile['starts'] as Map<String, dynamic>;
  final note = (startFile['note'] as String?) ?? '';
  final pMatch = RegExp(r'P for generated ids: ([0-9a-z]+)').firstMatch(note);
  final prefix = pMatch?.group(1) ?? 'cmtc0';
  runGolden('store_ops', <String, GoldenFn>{
    'scenario': (args) => _runScenario(args, starts, prefix),
  });
}

Object? _runScenario(List<dynamic> args, Map<String, dynamic> starts, String prefix) {
  final sc = (args[0] as Map).cast<String, dynamic>();
  final rawStart = sc['start'];
  final seed = rawStart is String ? starts[rawStart] : rawStart;
  var serial = 0;
  String nextId(String kind) {
    serial++;
    return '$kind$prefix${_base36(serial).padLeft(5, '0')}';
  }

  final store = StoreCore(
    clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
    idGen: nextId,
    storage: MemoryStorage(),
  );
  store.load(seed);
  final returns = <Object?>[];
  final events = <Object?>[];
  final before = <Object?>[];
  store.onChange = (kind, ids) => events.add(<Object?>[kind, ids]);
  store.onBefore = (reason) => before.add(reason);
  store.onSettings = (key) => events.add(<Object?>['settings', <String>[key]]);

  final ops = (sc['ops'] as List).cast<List<dynamic>>();
  for (final op in ops) {
    try {
      returns.add(_dig(_runOp(store, op[0] as String, op.sublist(1))));
    } catch (e) {
      returns.add(<String, Object?>{'throws': e.toString()});
    }
  }

  final out = <String, Object?>{
    'returns': returns,
    'events': events,
    'before': before,
  };
  if (sc['state'] != false) {
    out['state'] = <String, Object?>{
      'resources': store.resources.map((x) => x.toJson()).toList(),
      'jobs': store.jobs.map((x) => x.toJson()).toList(),
      'threads': store.threads.map((x) => x.toJson()).toList(),
      'settings': store.settings.toJson(),
      'game': store.game,
    };
  }
  return _mask(jsonDecode(jsonEncode(out)), prefix);
}

Object? _runOp(StoreCore s, String name, List<dynamic> a) {
  switch (name) {
    case 'addResource':
      return s.addResource(
        _m(a[0]),
        a.length > 1 ? _ls(a[1]) : const <String>[],
      );
    case 'addMany':
      return s.addMany(
        a[0] as List,
        a.length > 1 ? _ls(a[1]) : const <String>[],
      );
    case 'updateResource':
      return s.updateResource(
        a[0] as String,
        _m(a[1]),
        a.length > 2 && a[2] == true,
      );
    case 'bulkUpdate':
      return s.bulkUpdate(
        _ls(a[0]),
        _m(a[1]),
        a.length > 2 ? _m(a[2]) : const <String, dynamic>{},
      );
    case 'setField':
      return s.setField(a[0] as String, a[1] as String, a[2]);
    case 'deleteResource':
      return s.deleteResource(a[0] as String);
    case 'deleteMany':
      return s.deleteMany(_ls(a[0]));
    case 'findByUrl':
      return s.findByUrl(a[0] as String?);
    case 'wasDeleted':
      return s.wasDeleted(a[0] as String?);
    case 'deletedCount':
      return s.deletedCount();
    case 'link':
      s.link(a[0] as String, a[1] as String);
      return null;
    case 'unlink':
      s.unlink(a[0] as String, a[1] as String);
      return null;
    case 'mergeResources':
      return s.mergeResources(
        a[0] as String,
        a[1] as String,
        a.length > 2 ? _m(a[2]) : const <String, dynamic>{},
      );
    case 'duplicateResource':
      return s.duplicateResource(a[0] as String);
    case 'setLocked':
      return s.setLocked(a[0] as String, a[1]);
    case 'setPinned':
      return s.setPinned(a[0] as String, a[1]);
    case 'markOpened':
      return s.markOpened(a[0] as String);
    case 'markChecked':
      return s.markChecked(a[0] as String);
    case 'snooze':
      return s.snooze(a[0] as String, a[1]);
    case 'startTrial':
      return s.startTrial(a[0] as String, a.length > 1 ? a[1] : 14);
    case 'extendTrial':
      return s.extendTrial(a[0] as String, a[1]);
    case 'setVerdict':
      return s.setVerdict(a[0] as String, a[1] as String, a.length > 2 ? a[2] : '');
    case 'setWatch':
      return s.setWatch(a[0] as String, a[1]);
    case 'markWatchSeen':
      return s.markWatchSeen(a[0] as String);
    case 'addJob':
      return s.addJob(a.isEmpty ? const <String, dynamic>{} : _m(a[0]));
    case 'ensureInbox':
      return s.ensureInbox();
    case 'updateJob':
      return s.updateJob(a[0] as String, _m(a[1]));
    case 'addToJob':
      s.addToJob(a[0] as String, a[1] as String);
      return null;
    case 'removeFromJob':
      s.removeFromJob(a[0] as String, a[1] as String);
      return null;
    case 'moveToJob':
      s.moveToJob(a[0] as String, a[1] as String, a[2] as String);
      return null;
    case 'placeMany':
      return s.placeMany(a[0] as List);
    case 'createSector':
      return s.createSector(
        a[0] as String,
        _ls(a[1]),
        a.length > 2 ? a[2] : null,
      );
    case 'deleteJob':
      s.deleteJob(a[0] as String);
      return null;
    case 'refreshSmart':
      return a.isEmpty ? s.refreshSmart() : s.refreshSmart(a[0] as String);
    case 'jobsOf':
      return s.jobsOf(a[0] as String);
    case 'threadsOf':
      return s.threadsOf(a[0] as String);
    case 'addThread':
      return s.addThread(
        a[0] as String,
        a.length > 1 ? a[1] as List : const <dynamic>[],
      );
    case 'renameThread':
      s.renameThread(a[0] as String, a[1] as String);
      return null;
    case 'deleteThread':
      s.deleteThread(a[0] as String);
      return null;
    case 'addStep':
      s.addStep(a[0] as String, a[1] as String, a.length > 2 ? a[2] as String : '');
      return null;
    case 'removeStep':
      s.removeStep(a[0] as String, a[1] as int);
      return null;
    case 'moveStep':
      s.moveStep(a[0] as String, a[1] as int, a[2] as int);
      return null;
    case 'setStepDone':
      return s.setStepDone(a[0] as String, a[1] as int, a.length > 2 ? a[2] as bool : true);
    case 'setStepNote':
      s.setStepNote(a[0] as String, a[1] as int, a[2] as String);
      return null;
    case 'resetThread':
      s.resetThread(a[0] as String);
      return null;
    case 'previewBackup':
      return s.previewBackup(a[0]);
    case 'exportData':
      return s.exportData();
    case 'importBackup':
      return s.importBackup(a[0], a.length > 1 ? a[1] as String : 'merge');
    case 'noteJobUsed':
      s.noteJobUsed(a[0] as String);
      return null;
    case 'noteVisit':
      s.noteVisit(a[0] as String, a[1] as String);
      return null;
    case 'setSetting':
      s.setSetting(a[0] as String, a[1]);
      return null;
    case 'getSetting':
      return s.getSetting(a[0] as String);
    case 'clearDeleted':
      s.clearDeleted();
      return null;
    case 'allTags':
      return s.allTags();
    case 'stats':
      return a.isEmpty ? s.stats() : s.stats(a[0] as String);
    case 'backupNudge':
      return a.isEmpty ? s.backupNudge() : s.backupNudge(a[0] as String);
  }
  throw StateError('store op not in test: $name');
}

Map<String, dynamic> _m(Object? v) => (v as Map).cast<String, dynamic>();

List<String> _ls(Object? v) => (v as List).cast<String>();

Object? _dig(Object? v) {
  if (v is Resource) return <String, Object?>{'id': v.id};
  if (v is Job) return <String, Object?>{'id': v.id};
  if (v is Thread) return <String, Object?>{'id': v.id};
  if (v is Map) {
    final out = <String, Object?>{};
    v.forEach((k, value) => out[k.toString()] = _dig(value));
    return out;
  }
  if (v is List) return v.map(_dig).toList();
  return v;
}

Object? _mask(Object? value, String prefix) {
  var text = jsonEncode(value);
  final re = RegExp('"[rjt]${RegExp.escape(prefix)}[0-9a-z]{5}"');
  final ids = <String>{};
  for (final m in re.allMatches(text)) {
    final q = m.group(0)!;
    ids.add(q.substring(1, q.length - 1));
  }
  final sorted = ids.toList()..sort();
  for (var i = 0; i < sorted.length; i++) {
    text = text.replaceAll('"${sorted[i]}"', '"\$N${i + 1}"');
  }
  return jsonDecode(text);
}

const String _digits = '0123456789abcdefghijklmnopqrstuvwxyz';

String _base36(int n) {
  if (n == 0) return '0';
  var x = n;
  var out = '';
  while (x > 0) {
    out = '${_digits[x % 36]}$out';
    x ~/= 36;
  }
  return out;
}
