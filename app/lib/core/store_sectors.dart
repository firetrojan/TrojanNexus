// store_sectors.dart - sectors (jobs), layout slots and mission threads.
import 'dart:math' as math;

import 'model/job.dart';
import 'model/thread.dart';
import 'rules.dart';
import 'store_base.dart';
import 'store_types.dart';

mixin StoreSectors on StoreBase {
  // ---------- jobs ----------
  double sectorRadius(int n) => 12 + 3.0 * math.sqrt(math.max(1, n));

  List<double> sectorAnchor(int slot) {
    final k = slot + 0.5;
    final a = k * 2.399963229728653;
    final rad = 44 * math.sqrt(k);
    return <double>[
      math.cos(a) * rad * 0.8,
      math.sin(slot * 1.7) * 14 + math.cos(slot * 0.6) * 6,
      math.sin(a) * rad * 1.05,
    ];
  }

  int pickSlot() {
    final used = jobs.where((j) => j.slot != null).map((j) => j.slot!).toSet();
    final r0 = sectorRadius(0);
    final others = jobs
        .map((j) => <Object>[
              sectorAnchor(j.slot ?? 0),
              sectorRadius(j.members.length),
            ])
        .toList();
    var best = -1;
    var bestGap = -1e9;
    for (var slot = 0; slot < 60; slot++) {
      if (used.contains(slot)) continue;
      final a = sectorAnchor(slot);
      var gap = 1e9;
      for (final o in others) {
        final b = o[0] as List<double>;
        final d = math.sqrt(
          math.pow(a[0] - b[0], 2) + math.pow(a[2] - b[2], 2),
        );
        final g = d - r0 - (o[1] as double);
        if (g < gap) gap = g;
      }
      final score = math.min(gap, 40) - slot * 0.35;
      if (score > bestGap) {
        bestGap = score;
        best = slot;
      }
    }
    return best;
  }

  Job addJob([Map<String, Object?> data = const <String, Object?>{}]) {
    final slot = pickSlot();
    final name = storeText(data['name']).trim();
    final color = storeText(data['color']);
    final planet = storeText(data['planetColor']);
    final j = Job(
      id: idGen('j'),
      name: name.isEmpty ? 'New sector' : name,
      color: color.isNotEmpty ? color : jobColors[slot % jobColors.length],
      planetColor: RegExp(r'^#[0-9a-f]{6}$', caseSensitive: false).hasMatch(planet) ? planet : '',
      icon: storeText(data['icon']).isEmpty ? 'star' : storeText(data['icon']),
      slot: slot,
      sealed: storeTruthy(data['sealed']),
      rule: normRule(data['rule']),
    );
    jobs.add(j);
    changed('job');
    return j;
  }

  Job ensureInbox() {
    for (final j in jobs) {
      if (j.name == 'Inbox') return j;
    }
    final j = addJob(<String, Object?>{'name': 'Inbox', 'color': '#8da2c8'});
    j.note = 'New finds waiting for a proper sector.';
    return j;
  }

  Job? updateJob(String id, Map<String, Object?> patch) {
    final j = jobById(id);
    if (j == null) return null;
    if (patch.containsKey('rule')) j.rule = normRule(patch['rule']);
    for (final k in <String>['name', 'color', 'planetColor', 'icon', 'sealed', 'note']) {
      if (!patch.containsKey(k)) continue;
      final v = patch[k];
      if (k == 'sealed') {
        j.sealed = storeTruthy(v);
      } else if (k == 'planetColor') {
        final s = storeText(v);
        j.planetColor = RegExp(r'^#[0-9a-f]{6}$', caseSensitive: false).hasMatch(s) ? s : '';
      } else if (k == 'name') {
        j.name = storeText(v);
      } else if (k == 'color') {
        j.color = storeText(v);
      } else if (k == 'icon') {
        j.icon = storeText(v);
      } else {
        j.note = storeText(v);
      }
    }
    changed('job');
    return j;
  }

  void deleteJob(String id) {
    before('Before deleting a sector');
    jobs.removeWhere((j) => j.id == id);
    changed('job');
  }

  void addToJob(String jobId, String rid, [bool silent = false]) {
    final j = jobById(jobId);
    if (j == null || byId(rid) == null || j.rule != null) return;
    if (!j.members.contains(rid)) j.members.add(rid);
    if (!silent) changed('job', <String>[rid]);
  }

  int placeMany(List<Object?> pairs) {
    final todo = <List<String>>[];
    for (final pair in pairs) {
      if (pair is! List || pair.length < 2) continue;
      final rid = pair[0].toString();
      final jid = pair[1].toString();
      final j = jobById(jid);
      if (j == null || j.rule != null || byId(rid) == null || j.members.contains(rid)) {
        continue;
      }
      todo.add(<String>[rid, jid]);
    }
    if (todo.isEmpty) return 0;
    if (todo.length > 1) before('Before auto-sort');
    for (final p in todo) {
      jobById(p[1])!.members.add(p[0]);
    }
    changed('job', todo.map((x) => x[0]).toList());
    return todo.length;
  }

  Job createSector(String name, List<String> ids, [Object? color]) {
    before('Before creating a sector');
    final j = addJob(<String, Object?>{
      'name': name,
      if (color != null) 'color': color,
    });
    final keep = <String>[];
    for (final id in ids) {
      if (byId(id) != null && !keep.contains(id)) keep.add(id);
    }
    j.members = keep;
    changed('job', keep);
    return j;
  }

  void removeFromJob(String jobId, String rid, [bool silent = false]) {
    final j = jobById(jobId);
    if (j == null || j.rule != null) return;
    j.members.removeWhere((x) => x == rid);
    if (!silent) changed('job', <String>[rid]);
  }

  void moveToJob(String fromId, String toId, String rid) {
    if (isSmart(jobById(toId))) return;
    removeFromJob(fromId, rid, true);
    addToJob(toId, rid, true);
    changed('job', <String>[rid]);
  }

  // ---------- threads ----------
  Thread addThread(String name, [List<Object?> steps = const []]) {
    final t = normalizeThread(<String, Object?>{
      'id': idGen('t'),
      'name': name.isEmpty ? 'New mission' : name,
      'steps': steps,
    });
    threads.add(t);
    sanitize();
    changed('thread');
    return t;
  }

  void renameThread(String id, String name) {
    final t = threadById(id);
    if (t == null) return;
    final trimmed = name.trim();
    if (trimmed.isNotEmpty) t.name = trimmed;
    changed('thread');
  }

  void deleteThread(String id) {
    threads.removeWhere((t) => t.id == id);
    changed('thread');
  }

  void addStep(String tid, String rid, [String note = '']) {
    final t = threadById(tid);
    if (t == null || byId(rid) == null) return;
    t.steps.add(Step(rid: rid, note: note));
    changed('thread', <String>[rid]);
  }

  void removeStep(String tid, int i) {
    final t = threadById(tid);
    if (t == null || i < 0 || i >= t.steps.length) return;
    t.steps.removeAt(i);
    changed('thread');
  }

  void moveStep(String tid, int i, int dir) {
    final t = threadById(tid);
    if (t == null) return;
    final j = i + dir;
    if (j < 0 || j >= t.steps.length || i < 0 || i >= t.steps.length) return;
    final tmp = t.steps[i];
    t.steps[i] = t.steps[j];
    t.steps[j] = tmp;
    changed('thread');
  }

  bool setStepDone(String tid, int i, [bool v = true]) {
    final t = threadById(tid);
    if (t == null || i < 0 || i >= t.steps.length) return false;
    final st = t.steps[i];
    st.done = v;
    st.doneAt = v ? instantNow(clock) : '';
    if (v) t.lastDone = st.doneAt;
    changed('thread');
    return true;
  }

  void resetThread(String tid) {
    final t = threadById(tid);
    if (t == null) return;
    for (final st in t.steps) {
      st.done = false;
      st.doneAt = '';
    }
    changed('thread');
  }

  void setStepNote(String tid, int i, String note) {
    final t = threadById(tid);
    if (t == null || i < 0 || i >= t.steps.length) return;
    t.steps[i].note = note;
    queueSave();
  }

}
