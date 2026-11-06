// store_resources.dart - resource create, update, delete, merge and duplicate.
import 'history.dart';
import 'merge.dart';
import 'model/resource.dart';
import 'model/thread.dart';
import 'store_base.dart';
import 'store_sectors.dart';
import 'store_types.dart';
import 'util.dart';

mixin StoreResources on StoreBase, StoreSectors {
  // ---------- resources ----------
  Resource addResource(Map<String, Object?> partial, [List<String> jobIds = const []]) {
    final raw = Map<String, Object?>.from(partial);
    raw['id'] = storeTruthy(raw['id']) ? raw['id'].toString() : idGen('r');
    final r = normalizeResource(raw, clock.today());
    resources.add(r);
    idx[r.id] = r;
    forgetDeleted(<String>[r.url]);
    for (final j in jobIds) {
      addToJob(j, r.id, true);
    }
    changed('add', <String>[r.id]);
    return r;
  }

  Map<String, Object?> addMany(List<Object?> entries, [List<String> jobIds = const []]) {
    if (entries.length > 1) before('Before an import');
    final keys = resources
        .where((r) => r.url.isNotEmpty)
        .map((r) => normUrl(r.url))
        .toSet();
    final added = <String>[];
    var skipped = 0;
    for (final entry in entries) {
      final e = storeMap(entry);
      final url = storeText(e['url']);
      final k = url.isEmpty ? '' : normUrl(url);
      if (k.isNotEmpty && keys.contains(k)) {
        skipped++;
        continue;
      }
      if (k.isNotEmpty) keys.add(k);
      e['id'] = idGen('r');
      final r = normalizeResource(e, clock.today());
      resources.add(r);
      idx[r.id] = r;
      added.add(r.id);
      forgetDeleted(<String>[r.url]);
      for (final j in jobIds) {
        addToJob(j, r.id, true);
      }
    }
    if (added.isNotEmpty) changed('add', added);
    return <String, Object?>{'added': added, 'skipped': skipped};
  }

  Resource? updateResource(String id, Map<String, Object?> patch, [bool silent = false]) {
    final r = byId(id);
    if (r == null) return null;
    final raw = Map<String, Object?>.from(r.toJson());
    raw.addAll(patch);
    raw['id'] = r.id;
    final next = normalizeResource(raw, clock.today());
    if (!patch.containsKey('nextCheck') &&
        (patch.containsKey('checkCadence') || patch.containsKey('lastChecked'))) {
      next.nextCheck = computeNextCheck(next, clock.today());
    }
    final today = clock.today();
    final ev = <List<String>>[];
    if (patch['status'] != null && patch['status'] != r.status) {
      next.statusSince = today;
    }
    if (r.draft && !next.draft) ev.add(<String>['reviewed', 'Marked as reviewed']);
    if (next.status != r.status) {
      ev.add(<String>['status', '${storeStageLabels[r.status]} to ${storeStageLabels[next.status]}']);
    }
    if (next.learned != r.learned && next.learned.isNotEmpty) {
      ev.add(<String>['learned', r.learned.isNotEmpty ? 'Updated what I learned' : 'Wrote what I learned']);
    }
    if (ev.isNotEmpty) {
      next.log = pushLog(next.log.map((x) => x.toJson()).toList(), ev, today);
    }
    final i = resources.indexWhere((x) => x.id == id);
    if (i >= 0) resources[i] = next;
    idx[id] = next;
    if (!silent) changed('update', <String>[id]);
    return next;
  }

  Map<String, Object?> bulkUpdate(
    List<String> ids,
    Map<String, Object?> patch, [
    Map<String, Object?> o = const <String, Object?>{},
  ]) {
    final includeLocked = o['includeLocked'] == true;
    final todo = <String>[];
    var skipped = 0;
    for (final id in ids) {
      final r = byId(id);
      if (r == null) continue;
      if (includeLocked || !r.locked) {
        todo.add(id);
      } else {
        skipped++;
      }
    }
    if (todo.length > 1 || o['reason'] != null) {
      before(storeText(o['reason']).isEmpty ? 'Before a bulk change' : storeText(o['reason']));
    }
    for (final id in todo) {
      updateResource(id, patch, true);
    }
    changed('update', todo);
    return <String, Object?>{'changed': todo.length, 'skipped': skipped};
  }

  bool deleteResource(String id) {
    final r = byId(id);
    if (r == null || r.locked) return false;
    before('Before a delete');
    rememberDeleted(<String>[r.url]);
    resources.removeWhere((x) => x.id == id);
    for (final x in resources) {
      x.related.removeWhere((v) => v == id);
    }
    for (final j in jobs) {
      j.members.removeWhere((v) => v == id);
    }
    for (final t in threads) {
      t.steps.removeWhere((s) => s.rid == id);
    }
    reindex();
    changed('delete', <String>[id]);
    return true;
  }

  Map<String, Object?> deleteMany(List<String> ids) {
    final gone = <String>{};
    var skipped = 0;
    for (final id in ids) {
      final r = byId(id);
      if (r == null) continue;
      if (r.locked) {
        skipped++;
      } else {
        gone.add(id);
      }
    }
    if (gone.isEmpty) return <String, Object?>{'deleted': 0, 'skipped': skipped};
    before('Before deleting several');
    rememberDeleted(resources.where((r) => gone.contains(r.id)).map((r) => r.url).toList());
    resources.removeWhere((r) => gone.contains(r.id));
    for (final r in resources) {
      r.related.removeWhere(gone.contains);
    }
    for (final j in jobs) {
      j.members.removeWhere(gone.contains);
    }
    for (final t in threads) {
      t.steps.removeWhere((s) => gone.contains(s.rid));
    }
    reindex();
    changed('delete', gone.toList());
    return <String, Object?>{'deleted': gone.length, 'skipped': skipped};
  }

  Map<String, Object?>? mergeResources(
    String keepId,
    String dropId, [
    Map<String, Object?> o = const <String, Object?>{},
  ]) {
    final keep = byId(keepId);
    final drop = byId(dropId);
    if (keep == null || drop == null || keepId == dropId || drop.locked) return null;
    if (o['quiet'] != true) before('Before merging links');
    final today = clock.today();
    final patch = mergePatch(keep, drop);
    final moved = <String, Object?>{
      'tags': patch.tags.length - keep.tags.length,
      'sectors': 0,
      'steps': 0,
    };
    final patchMap = Map<String, Object?>.from(patch.toJson());
    patchMap['log'] = pushLog(
      keep.log.map((x) => x.toJson()).toList(),
      <List<String>>[
        <String>['merged', 'Merged in "${cutText(drop.title, 60)}"'],
      ],
      today,
    ).map((x) => x.toJson()).toList();
    updateResource(keepId, patchMap, true);
    for (final j in jobs) {
      if (j.rule != null || !j.members.contains(dropId)) continue;
      j.members = uniq(j.members.map((x) => x == dropId ? keepId : x));
      moved['sectors'] = (moved['sectors'] as int) + 1;
    }
    for (final t in threads) {
      final seen = <String, Step>{};
      final steps = <Step>[];
      for (final st in t.steps) {
        final rid = st.rid == dropId ? keepId : st.rid;
        if (st.rid == dropId) moved['steps'] = (moved['steps'] as int) + 1;
        final first = seen[rid];
        if (first != null) {
          if (st.done && !first.done) {
            first.done = true;
            first.doneAt = st.doneAt;
          }
          continue;
        }
        final x = Step(rid: rid, note: st.note, done: st.done, doneAt: st.doneAt);
        seen[rid] = x;
        steps.add(x);
      }
      t.steps = steps;
    }
    for (final r in resources) {
      if (r.related.contains(dropId)) {
        r.related = uniq(r.related.map((x) => x == dropId ? keepId : x))
            .where((x) => x != r.id)
            .toList();
      }
    }
    final w = settings['weekly'];
    if (w is Map) {
      final picks = w['picks'];
      if (picks is List) {
        final seen = <String>{};
        final out = <Object?>[];
        for (final p in picks) {
          if (p is! Map) continue;
          final copy = storeMap(p);
          if (copy['rid'] == dropId) copy['rid'] = keepId;
          final rid = storeText(copy['rid']);
          if (seen.add(rid)) out.add(copy);
        }
        w['picks'] = out;
      }
    }
    final survivor = byId(keepId)!;
    if (survivor.url.isEmpty || normUrl(drop.url) != normUrl(survivor.url)) {
      rememberDeleted(<String>[drop.url]);
    }
    resources.removeWhere((r) => r.id == dropId);
    reindex();
    changed('merge', <String>[keepId, dropId]);
    return <String, Object?>{'keep': byId(keepId), 'moved': moved};
  }

  Resource? duplicateResource(String id) {
    final r = byId(id);
    if (r == null) return null;
    final raw = Map<String, Object?>.from(r.toJson());
    raw.remove('id');
    raw['title'] = '${r.title} (copy)';
    raw['lastChecked'] = '';
    raw['nextCheck'] = '';
    raw['related'] = <String>[];
    raw['draft'] = true;
    return addResource(raw, jobsOf(id).map((j) => j.id).toList());
  }

  Resource? setPinned(String id, Object? v) =>
      updateResource(id, <String, Object?>{'pinned': v == true});
  Resource? setField(String id, String key, Object? value) {
    final r = byId(id);
    if (r == null) return null;
    return updateResource(id, <String, Object?>{
      'fields': <String, Object?>{...r.fields, key: value},
    });
  }
}
