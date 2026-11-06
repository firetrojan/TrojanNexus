import 'package:nexus/core/mission.dart';
import 'package:nexus/core/model/thread.dart';

import 'golden.dart';

Set<String> _ids() => sharedLinks()
    .map((r) => (r as Map<String, dynamic>)['id'].toString())
    .toSet();

Map<String, Object?> _threadJson(Thread t) => <String, Object?>{
      'id': t.id,
      'name': t.name,
      'steps': t.steps.map((s) => s.toJson()).toList(),
    };

void main() {
  runGolden('mission', {
    'progress': (a) {
      final t = normalizeThread(a[0]);
      return progress(t, _ids().contains).toJson();
    },
    'liveSteps': (a) {
      final t = normalizeThread(a[0]);
      return liveSteps(t, _ids().contains).map((x) => x.toJson()).toList();
    },
    'pickActive': (a) {
      final threads = (a[0] as List<dynamic>)
          .map((x) => normalizeThread(x))
          .toList();
      final picked = pickActive(threads, a[1] as String, _ids().contains);
      return picked == null ? null : _threadJson(picked);
    },
  });
}
