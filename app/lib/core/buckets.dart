// buckets.dart - the small date buckets from legacy/web-src/js/store.js that
// Home and Insights ask about. Pure data in, plain answer out.
import 'constants.dart';
import 'model/resource.dart';
import 'util.dart';

/// Due checks: overdue, due today, upcoming within a week, or null.
String? dueBucket(Resource r, [String? today]) {
  final day = today ?? todayISO();
  if (r.status == 'archived' || r.checkCadence == 'none' || r.nextCheck.isEmpty) {
    return null;
  }
  if (r.nextCheck.compareTo(day) < 0) return 'overdue';
  if (r.nextCheck == day) return 'today';
  if (r.nextCheck.compareTo(addDays(day, 7)) <= 0) return 'upcoming';
  return null;
}

class StaleReason {
  StaleReason(this.kind, this.days);
  final String kind;
  final int days;
  Map<String, Object?> toJson() =>
      <String, Object?>{'kind': kind, 'days': days};
}

class StaleInfo {
  StaleInfo(this.reasons, this.days);
  final List<StaleReason> reasons;
  final int days;
  Map<String, Object?> toJson() => <String, Object?>{
        'reasons': reasons.map((x) => x.toJson()).toList(),
        'days': days,
      };
}

/// Null when fine, else the reasons a link has gone quiet.
StaleInfo? staleInfo(Resource r, [String? today]) {
  final day = today ?? todayISO();
  if (r.status == 'archived') return null;
  if (r.status == 'candidate') {
    final d = daysBetween(
      r.statusSince.isNotEmpty ? r.statusSince : r.createdAt,
      day,
    );
    return d > STALE_CANDIDATE_DAYS
        ? StaleInfo(<StaleReason>[StaleReason('candidate', d)], d)
        : null;
  }
  final reasons = <StaleReason>[];
  if (r.status == 'testing') {
    final d = daysBetween(
      r.statusSince.isNotEmpty ? r.statusSince : r.createdAt,
      day,
    );
    if (d > STALE_TESTING_DAYS) reasons.add(StaleReason('testing', d));
  }
  final d2 = daysBetween(
    r.lastChecked.isNotEmpty ? r.lastChecked : r.createdAt,
    day,
  );
  if (d2 > STALE_UNCHECKED_DAYS) {
    reasons.add(StaleReason(r.lastChecked.isNotEmpty ? 'unchecked' : 'never', d2));
  }
  if (reasons.isEmpty) return null;
  var max = 0;
  for (final x in reasons) {
    if (x.days > max) max = x.days;
  }
  return StaleInfo(reasons, max);
}

/// A trial with an end date: overdue once passed, soon in the last 3 days.
String? trialBucket(Resource r, [String? today]) {
  final day = today ?? todayISO();
  if (r.status != 'testing' || r.trialEnd.isEmpty) return null;
  final d = daysBetween(day, r.trialEnd);
  return d < 0 ? 'overdue' : (d <= 3 ? 'soon' : null);
}

/// A free limit reset or offer end: past for 3 days after, soon in the next 7.
String? resetBucket(Resource r, [String? today]) {
  final day = today ?? todayISO();
  final x = r.fields['resets'] ?? '';
  if (r.status == 'archived' || x.isEmpty || parseISO(x) == null) return null;
  final d = daysBetween(day, x);
  return d < -3 ? null : (d < 0 ? 'past' : (d <= 7 ? 'soon' : null));
}

/// A watched page changed and the link is still live.
bool watchChanged(Resource r) =>
    r.watch != null &&
    _truthy(r.watch!['on']) &&
    _truthy(r.watch!['changed']) &&
    r.status != 'archived';

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';
