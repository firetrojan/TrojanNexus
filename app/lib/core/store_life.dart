// store_life.dart - opening, checks, trials, verdicts, watch, locks and links.
import 'history.dart';
import 'model/resource.dart';
import 'store_base.dart';
import 'store_types.dart';
import 'util.dart';
import 'watch.dart';

mixin StoreLife on StoreBase {
  Resource? markOpened(String id) {
    final r = byId(id);
    if (r == null) return null;
    r.opens = r.opens + 1 > 1000000 ? 1000000 : r.opens + 1;
    r.openedAt = clock.nowMs();
    if (storeText(settings['opensSince']).isEmpty) settings['opensSince'] = clock.today();
    queueSave();
    return r;
  }

  Resource? markChecked(String id) {
    final r = byId(id);
    if (r == null) return null;
    r.lastChecked = clock.today();
    r.nextCheck = computeNextCheck(r, clock.today());
    r.log = pushLog(
      r.log.map((x) => x.toJson()).toList(),
      <List<String>>[
        <String>['checked', 'Checked it still works'],
      ],
      r.lastChecked,
    );
    changed('check', <String>[id]);
    return r;
  }

  Resource? snooze(String id, Object? days) {
    final r = byId(id);
    if (r == null || r.checkCadence == 'none') return null;
    r.nextCheck = addDays(clock.today(), days is num ? days.toInt() : 0);
    changed('snooze', <String>[id]);
    return r;
  }

  Resource? startTrial(String id, [Object? days = 14]) {
    final r = byId(id);
    if (r == null) return null;
    final today = clock.today();
    final n = days is num ? days.toInt() : 14;
    r.status = 'testing';
    r.statusSince = today;
    r.trialEnd = addDays(today, n < 1 ? 1 : n);
    r.verdict = null;
    r.log = pushLog(
      r.log.map((x) => x.toJson()).toList(),
      <List<String>>[
        <String>['status', 'Trial started, ends ${r.trialEnd}'],
      ],
      today,
    );
    changed('update', <String>[id]);
    return r;
  }

  Resource? extendTrial(String id, Object? days) {
    final r = byId(id);
    if (r == null || r.status != 'testing') return null;
    final base = r.trialEnd.isNotEmpty && r.trialEnd.compareTo(clock.today()) > 0
        ? r.trialEnd
        : clock.today();
    final n = days is num ? days.toInt() : 0;
    r.trialEnd = addDays(base, n < 1 ? 1 : n);
    changed('update', <String>[id]);
    return r;
  }

  Resource? setVerdict(String id, String result, [Object? note = '']) {
    final r = byId(id);
    if (r == null || (result != 'keep' && result != 'drop')) return null;
    final today = clock.today();
    r.status = result == 'keep' ? 'active' : 'archived';
    r.statusSince = today;
    r.trialEnd = '';
    final noteText = note == null ? '' : note.toString();
    r.verdict = Verdict(
      at: today,
      result: result,
      note: noteText.length > 300 ? noteText.substring(0, 300) : noteText,
    );
    r.log = pushLog(
      r.log.map((x) => x.toJson()).toList(),
      <List<String>>[
        <String>['verdict', result == 'keep' ? 'Decided to keep it' : 'Decided to drop it'],
      ],
      today,
    );
    changed('update', <String>[id]);
    return r;
  }

  Resource? setWatch(String id, Object? on) {
    final r = byId(id);
    if (r == null) return null;
    r.watch = on == true
        ? (r.watch ?? <String, Object?>{
            'on': true,
            'at': '',
            'fp': null,
            'changed': '',
            'what': <Object?>[],
          })
        : null;
    changed('update', <String>[id]);
    return r;
  }

  String? recordWatch(String id, Object? fp, [String? today]) {
    final r = byId(id);
    if (r == null || r.watch == null) return null;
    final day = today ?? clock.today();
    final w = r.watch!;
    final next = normWatch(<String, Object?>{'on': true, 'fp': fp});
    if (next == null || next['fp'] == null) {
      w['at'] = day;
      changed('update', <String>[id]);
      return 'unreadable';
    }
    final fresh = next['fp'];
    final old = w['fp'];
    if (old == null) {
      w['fp'] = fresh;
      w['at'] = day;
      changed('update', <String>[id]);
      return 'baseline';
    }
    Map<String, Object?> c;
    try {
      c = compare(old, fresh);
    } catch (_) {
      c = <String, Object?>{'same': true, 'what': <Object?>[], 'rebase': true};
    }
    if (c['unreadable'] == true) {
      w['at'] = day;
      changed('update', <String>[id]);
      return 'unreadable';
    }
    if (c['rebase'] == true) {
      w['fp'] = fresh;
      w['at'] = day;
      w['changed'] = '';
      w['what'] = <Object?>[];
      changed('update', <String>[id]);
      return 'rebase';
    }
    if (c['same'] == true) {
      w['at'] = day;
      changed('update', <String>[id]);
      return 'same';
    }
    w['changed'] = day;
    w['what'] = c['what'];
    w['fp'] = fresh;
    w['at'] = day;
    changed('update', <String>[id]);
    return 'changed';
  }

  Resource? markWatchSeen(String id) {
    final r = byId(id);
    if (r == null || r.watch == null) return null;
    r.watch!['changed'] = '';
    r.watch!['what'] = <Object?>[];
    changed('update', <String>[id]);
    return r;
  }

  Resource? setLocked(String id, Object? on) {
    final r = byId(id);
    if (r == null) return null;
    r.locked = on == true;
    changed('update', <String>[id]);
    return r;
  }

  void link(String a, String b) {
    final x = byId(a), y = byId(b);
    if (x == null || y == null || a == b) return;
    if (!x.related.contains(b)) x.related.add(b);
    if (!y.related.contains(a)) y.related.add(a);
    changed('link', <String>[a, b]);
  }

  void unlink(String a, String b) {
    final x = byId(a), y = byId(b);
    if (x == null || y == null) return;
    x.related.removeWhere((v) => v == b);
    y.related.removeWhere((v) => v == a);
    changed('link', <String>[a, b]);
  }

}
