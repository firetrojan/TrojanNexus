// store_backup.dart - backup preview, export and import.
import 'constants.dart' show SCHEMA;
import 'model/job.dart';
import 'store_base.dart';
import 'store_types.dart';
import 'util.dart';

mixin StoreBackup on StoreBase {
  // ---------- backup ----------
  Map<String, Object?> exportData() => <String, Object?>{
        'app': 'nexus',
        'schema': SCHEMA,
        'exportedAt': instantNow(clock),
        'resources': resources,
        'jobs': jobs,
        'threads': threads,
        'settings': settings.toJson(),
        'game': game,
      };

  Map<String, Object?> previewBackup(Object? obj) {
    if (obj is List) {
      return <String, Object?>{
        'ok': true,
        'resources': obj.length,
        'jobs': 0,
        'threads': 0,
        'full': false,
      };
    }
    if (obj is Map) {
      final res = obj['resources'];
      if (res is List) {
        final jobsRaw = obj['jobs'];
        final threadsRaw = obj['threads'];
        return <String, Object?>{
          'ok': true,
          'resources': res.length,
          'jobs': jobsRaw is List ? jobsRaw.length : 0,
          'threads': threadsRaw is List ? threadsRaw.length : 0,
          'full': true,
        };
      }
    }
    return <String, Object?>{
      'ok': false,
      'error': 'No resources array found in this JSON.',
    };
  }

  Map<String, Object?> importBackup(Object? obj, [String mode = 'merge']) {
    final pv = previewBackup(obj);
    if (pv['ok'] != true) throw StoreError(storeText(pv['error']));
    before(mode == 'replace' ? 'Before restoring a backup' : 'Before merging a backup');
    final data = obj is List ? <String, Object?>{'resources': obj} : storeMap(obj);
    if (mode == 'replace') {
      applyData(data);
      changed('import');
      return <String, Object?>{'added': resources.length, 'skipped': 0};
    }
    final keys = resources
        .where((r) => r.url.isNotEmpty)
        .map((r) => normUrl(r.url))
        .toSet();
    final added = <String>[];
    var skipped = 0;
    final rawResources = data['resources'];
    for (final raw in (rawResources is List ? rawResources : const <Object?>[])) {
      final r = normRes(raw);
      if (byId(r.id) != null || (r.url.isNotEmpty && keys.contains(normUrl(r.url)))) {
        skipped++;
        continue;
      }
      if (r.url.isNotEmpty) keys.add(normUrl(r.url));
      resources.add(r);
      idx[r.id] = r;
      added.add(r.id);
    }
    final rawJobs = data['jobs'];
    if (rawJobs is List) {
      for (var i = 0; i < rawJobs.length; i++) {
        final j = normJob(rawJobs[i], i);
        Job? ex = jobById(j.id);
        if (ex == null) {
          for (final x in jobs) {
            if (x.name.toLowerCase() == j.name.toLowerCase()) {
              ex = x;
              break;
            }
          }
        }
        if (ex != null) {
          for (final m in j.members) {
            if (byId(m) != null && !ex.members.contains(m)) ex.members.add(m);
          }
        } else {
          jobs.add(j);
        }
      }
    }
    final rawThreads = data['threads'];
    if (rawThreads is List) {
      for (final raw in rawThreads) {
        final t = normThread(raw);
        if (threadById(t.id) == null) threads.add(t);
      }
    }
    sanitize();
    changed('import', added);
    return <String, Object?>{'added': added.length, 'skipped': skipped};
  }

}
