import 'package:nexus/core/time.dart';

import 'golden.dart';

TimeContext _context(Map<String, dynamic> m) => TimeContext(
      drafts: (m['drafts'] as num?)?.toInt() ?? 0,
      easy: (m['easy'] as num?)?.toInt() ?? 0,
      attention: (m['attention'] as num?)?.toInt() ?? 0,
      overdueTrials: (m['overdueTrials'] as num?)?.toInt() ?? 0,
      missionLeft: (m['missionLeft'] as num?)?.toInt() ?? 0,
      missionName: m['missionName']?.toString() ?? '',
      stale: (m['stale'] as num?)?.toInt() ?? 0,
      backupDue: m['backupDue'] == true,
    );

void main() {
  runGolden('time', {
    'timePlan': (a) => timePlan(
          a[0] as String,
          _context(a[1] as Map<String, dynamic>),
        ).toJson(),
    'MODES': (a) => MODES
        .map((x) => <String, Object?>{'v': x.v, 'l': x.l})
        .toList(),
  });
}
