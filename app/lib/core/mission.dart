// mission.dart - port of legacy/web-src/js/mission.js. Mission progress helpers.
import 'model/thread.dart';

class LiveStep {
  LiveStep(this.s, this.i);
  final Step s;
  final int i;
  Map<String, Object?> toJson() => <String, Object?>{
        's': s.toJson(),
        'i': i,
      };
}

/// Steps of a mission that still have a resource, each with its place in the
/// full list.
List<LiveStep> liveSteps(Thread t, [bool Function(String rid)? has]) {
  final keep = has ?? (_) => true;
  final out = <LiveStep>[];
  for (var i = 0; i < t.steps.length; i++) {
    if (keep(t.steps[i].rid)) out.add(LiveStep(t.steps[i], i));
  }
  return out;
}

class MissionProgress {
  MissionProgress(this.total, this.done, this.left, this.pct, this.next, this.complete);
  final int total;
  final int done;
  final int left;
  final int pct;
  final LiveStep? next;
  final bool complete;

  Map<String, Object?> toJson() => <String, Object?>{
        'total': total,
        'done': done,
        'left': left,
        'pct': pct,
        'next': next?.toJson(),
        'complete': complete,
      };
}

/// Total/done/left/pct, the first unfinished live step, and whether done.
MissionProgress progress(Thread t, [bool Function(String rid)? has]) {
  final st = liveSteps(t, has);
  final done = st.where((x) => x.s.done).length;
  final total = st.length;
  LiveStep? next;
  for (final x in st) {
    if (!x.s.done) {
      next = x;
      break;
    }
  }
  return MissionProgress(
    total,
    done,
    total - done,
    total == 0 ? 0 : (100 * done / total).round(),
    next,
    total > 0 && done == total,
  );
}

/// The mission Home should show: chosen if it still has work, else worked on
/// last, else furthest along, else the first with any steps.
Thread? pickActive(
  List<Thread> threads, [
  String activeId = '',
  bool Function(String rid)? has,
]) {
  final keep = has ?? (_) => true;
  final open = <_OpenThread>[];
  for (var k = 0; k < threads.length; k++) {
    final p = progress(threads[k], keep);
    if (p.total > 0 && !p.complete) open.add(_OpenThread(threads[k], k, p));
  }
  if (open.isEmpty) return null;
  for (final x in open) {
    if (x.t.id == activeId) return x.t;
  }
  open.sort((a, b) {
    final byLast = (b.t.lastDone).compareTo(a.t.lastDone);
    if (byLast != 0) return byLast;
    final byDone = b.p.done - a.p.done;
    return byDone != 0 ? byDone : a.k.compareTo(b.k);
  });
  return open.first.t;
}

class _OpenThread {
  _OpenThread(this.t, this.k, this.p);
  final Thread t;
  final int k;
  final MissionProgress p;
}
