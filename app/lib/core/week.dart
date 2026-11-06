// week.dart - port of legacy/web-src/js/week.js. Weekly reset and "3 things for this week".
import 'model/resource.dart';
import 'util.dart';

const int RESET_EVERY = 7;
const int PICKS_LIVE = 7;
const int MAX_PICKS = 3;

String _isoOrEmpty(Object? s) =>
    s is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s) ? s : '';

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

class WeeklyPick {
  WeeklyPick(this.rid, this.done);
  final String rid;
  final bool done;

  Map<String, Object?> toJson() => <String, Object?>{'rid': rid, 'done': done};
}

class Weekly {
  Weekly({
    this.doneAt = '',
    this.pickedAt = '',
    this.snooze = '',
    List<WeeklyPick>? picks,
  }) : picks = picks ?? <WeeklyPick>[];

  final String doneAt;
  final String pickedAt;
  final String snooze;
  final List<WeeklyPick> picks;

  Map<String, Object?> toJson() => <String, Object?>{
        'doneAt': doneAt,
        'pickedAt': pickedAt,
        'snooze': snooze,
        'picks': picks.map((p) => p.toJson()).toList(),
      };
}

/// Clean what was saved. Safe for null and old data.
Weekly normWeekly(Object? v) {
  if (v is Weekly) {
    final picks = <WeeklyPick>[];
    final seen = <String>{};
    for (final p in v.picks) {
      if (p.rid.isNotEmpty && seen.add(p.rid) && picks.length < MAX_PICKS) {
        picks.add(WeeklyPick(p.rid, p.done));
      }
    }
    return Weekly(
      doneAt: _isoOrEmpty(v.doneAt),
      pickedAt: _isoOrEmpty(v.pickedAt),
      snooze: _isoOrEmpty(v.snooze),
      picks: picks,
    );
  }
  final o = v is Map ? v : const <Object?, Object?>{};
  final picks = <WeeklyPick>[];
  final seen = <String>{};
  final rawPicks = o['picks'];
  if (rawPicks is List) {
    for (final p in rawPicks) {
      if (p is! Map) continue;
      final rid = p['rid'];
      if (rid is String && rid.isNotEmpty && seen.add(rid) && picks.length < MAX_PICKS) {
        picks.add(WeeklyPick(rid, _truthy(p['done'])));
      }
    }
  }
  return Weekly(
    doneAt: _isoOrEmpty(o['doneAt']),
    pickedAt: _isoOrEmpty(o['pickedAt']),
    snooze: _isoOrEmpty(o['snooze']),
    picks: picks,
  );
}

class ResetDue {
  ResetDue(this.due, this.days);
  final bool due;
  final int? days;
  Map<String, Object?> toJson() => <String, Object?>{'due': due, 'days': days};
}

/// Should Home nudge for a reset? Only once there is something worth resetting
/// (10+ links), 7+ days after the last one, and not snoozed.
ResetDue resetDue(Object? weekly, String today, int count) {
  final w = normWeekly(weekly);
  final days = w.doneAt.isNotEmpty ? daysBetween(w.doneAt, today) : null;
  final later = w.snooze.isNotEmpty && w.snooze.compareTo(today) > 0;
  return ResetDue(
    count >= 10 && (days == null || days >= RESET_EVERY) && !later,
    days,
  );
}

/// Picks to show on Home: only if picked within the last 7 days, and only
/// links that still exist.
List<WeeklyPick> activePicks(
  Object? weekly,
  String today, [
  bool Function(String rid)? has,
]) {
  final w = normWeekly(weekly);
  if (w.pickedAt.isEmpty) return <WeeklyPick>[];
  final age = daysBetween(w.pickedAt, today);
  if (age < 0 || age >= PICKS_LIVE) return <WeeklyPick>[];
  final keep = has ?? (_) => true;
  return w.picks.where((p) => keep(p.rid)).toList();
}

Weekly setPicks(Object? weekly, List<String> rids, String today) {
  final w = normWeekly(weekly);
  final seen = <String>{};
  final picks = <WeeklyPick>[];
  for (final rid in rids) {
    if (seen.add(rid) && picks.length < MAX_PICKS) {
      picks.add(WeeklyPick(rid, false));
    }
  }
  return Weekly(
    doneAt: w.doneAt,
    pickedAt: today,
    snooze: w.snooze,
    picks: picks,
  );
}

Weekly togglePick(Object? weekly, String rid) {
  final w = normWeekly(weekly);
  return Weekly(
    doneAt: w.doneAt,
    pickedAt: w.pickedAt,
    snooze: w.snooze,
    picks: w.picks
        .map((p) => p.rid == rid ? WeeklyPick(p.rid, !p.done) : p)
        .toList(),
  );
}

Weekly finishReset(Object? weekly, String today) {
  final w = normWeekly(weekly);
  return Weekly(
    doneAt: today,
    pickedAt: w.pickedAt,
    snooze: '',
    picks: w.picks,
  );
}

Weekly snoozeReset(Object? weekly, String today, [int days = 2]) {
  final w = normWeekly(weekly);
  return Weekly(
    doneAt: w.doneAt,
    pickedAt: w.pickedAt,
    snooze: addDays(today, days),
    picks: w.picks,
  );
}

class WeekNeed {
  WeekNeed(this.r, this.kind, this.sub);
  final Resource r;
  final String kind;
  final String sub;
}

class WeekMission {
  WeekMission(this.r, this.name);
  final Resource r;
  final String name;
}

class SuggestContext {
  SuggestContext({
    List<WeekNeed>? needs,
    this.mission,
    List<Resource>? stale,
    List<Resource>? drafts,
  })  : needs = needs ?? <WeekNeed>[],
        stale = stale ?? <Resource>[],
        drafts = drafts ?? <Resource>[];
  final List<WeekNeed> needs;
  final WeekMission? mission;
  final List<Resource> stale;
  final List<Resource> drafts;
}

class WeekSuggestion {
  WeekSuggestion(this.rid, this.why);
  final String rid;
  final String why;
  Map<String, Object?> toJson() => <String, Object?>{'rid': rid, 'why': why};
}

/// Up to 3 things worth doing this week, with the reason for each.
List<WeekSuggestion> suggestPicks(SuggestContext ctx, [int n = MAX_PICKS]) {
  final out = <WeekSuggestion>[];
  final seen = <String>{};
  void add(Resource? r, String why) {
    if (r == null || seen.contains(r.id) || out.length >= n) return;
    seen.add(r.id);
    out.add(WeekSuggestion(r.id, why));
  }

  for (final x in ctx.needs.where((x) => x.kind == 'trial').take(1)) {
    add(x.r, 'Trial: decide keep or drop');
  }
  if (ctx.mission != null) {
    add(ctx.mission!.r, 'Next step of ${ctx.mission!.name}');
  }
  for (final x in ctx.needs.where((x) => x.kind != 'trial').take(1)) {
    add(x.r, x.sub);
  }
  for (final r in ctx.stale.take(1)) {
    add(r, 'Not checked in a while');
  }
  for (final r in ctx.drafts.take(2)) {
    add(r, 'Still to review');
  }
  for (final x in ctx.needs) {
    add(x.r, x.sub);
  }
  return out;
}

class PicksDigest {
  PicksDigest(this.done, this.total, this.at);
  final int done;
  final int total;
  final String at;
  Map<String, Object?> toJson() =>
      <String, Object?>{'done': done, 'total': total, 'at': at};
}

class WeekDigest {
  WeekDigest({
    this.added = 0,
    this.opened = 0,
    this.reviewed = 0,
    this.checked = 0,
    this.learned = 0,
    this.merged = 0,
    this.stage = 0,
    this.picks,
  });

  int added;
  int opened;
  int reviewed;
  int checked;
  int learned;
  int merged;
  int stage;
  PicksDigest? picks;

  Map<String, Object?> toJson() => <String, Object?>{
        'added': added,
        'opened': opened,
        'reviewed': reviewed,
        'checked': checked,
        'learned': learned,
        'merged': merged,
        'stage': stage,
        'picks': picks?.toJson(),
      };
}

/// What happened in the last [days] days (today included), for the weekly reset.
WeekDigest weekDigest(
  List<Resource> resources,
  Object? weekly,
  String today, [
  int days = 7,
]) {
  final from = addDays(today, -(days - 1));
  final start = parseISO(from);
  final fromMs = start == null
      ? 0
      : DateTime(start.year, start.month, start.day).millisecondsSinceEpoch;
  final d = WeekDigest();
  const kinds = <String, String>{
    'reviewed': 'reviewed',
    'checked': 'checked',
    'learned': 'learned',
    'merged': 'merged',
    'status': 'stage',
  };
  for (final r in resources) {
    if (r.createdAt.compareTo(from) >= 0 && r.createdAt.compareTo(today) <= 0) {
      d.added++;
    }
    if (r.openedAt >= fromMs) d.opened++;
    for (final e in r.log) {
      if (e.at.compareTo(from) >= 0 && e.at.compareTo(today) <= 0) {
        final k = kinds[e.k];
        if (k == 'reviewed') {
          d.reviewed++;
        } else if (k == 'checked') {
          d.checked++;
        } else if (k == 'learned') {
          d.learned++;
        } else if (k == 'merged') {
          d.merged++;
        } else if (k == 'stage') {
          d.stage++;
        }
      }
    }
  }
  final w = normWeekly(weekly);
  if (w.picks.isNotEmpty && w.pickedAt.isNotEmpty) {
    d.picks = PicksDigest(
      w.picks.where((p) => p.done).length,
      w.picks.length,
      w.pickedAt,
    );
  }
  return d;
}
