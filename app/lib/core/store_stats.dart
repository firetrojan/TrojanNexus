// store_stats.dart - derived counts and the backup reminder.
import 'buckets.dart';

import 'store_base.dart';
import 'util.dart';

mixin StoreStats on StoreBase {
  // ---------- derived info ----------
  Map<String, Object?> stats([String? today]) {
    final day = today ?? clock.today();
    var total = 0, active = 0, drafts = 0, overdue = 0, todayCount = 0;
    var upcoming = 0, events = 0, changes = 0, stale = 0;
    for (final r in resources) {
      total++;
      if (r.status != 'archived') active++;
      if (r.draft) drafts++;
      final b = dueBucket(r, day);
      if (b == 'overdue') overdue++;
      if (b == 'today') todayCount++;
      if (b == 'upcoming') upcoming++;
      if (staleInfo(r, day) != null) stale++;
      final rb = resetBucket(r, day);
      if (trialBucket(r, day) != null || rb == 'soon' || rb == 'past') events++;
      if (watchChanged(r)) changes++;
    }
    final due = overdue + todayCount;
    final attention = due + events + changes;
    final mapped = total == 0 ? 100 : (100 * (total - drafts) / total).round();
    return <String, Object?>{
      'total': total,
      'active': active,
      'drafts': drafts,
      'overdue': overdue,
      'today': todayCount,
      'upcoming': upcoming,
      'due': due,
      'events': events,
      'changes': changes,
      'attention': attention,
      'stale': stale,
      'mapped': mapped,
    };
  }

  Map<String, Object?> backupNudge([String? today]) {
    final day = today ?? clock.today();
    final n = resources.length;
    final last = game['lastBackup'];
    final snoozeDate = settings['backupSnooze'];
    final days = last is String && parseISO(last) != null ? daysBetween(last, day) : null;
    final later = snoozeDate is String &&
        parseISO(snoozeDate) != null &&
        snoozeDate.compareTo(day) > 0;
    return <String, Object?>{
      'due': n >= 10 && (days == null || days >= 7) && !later,
      'days': days,
      'n': n,
    };
  }
}
