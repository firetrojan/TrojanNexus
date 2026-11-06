// recent.dart - port of legacy/web-src/js/recent.js. "Continue where you left off".
const int RECENT_MAX = 8;
const Set<String> KINDS = <String>{'r', 's', 'm'};

class Visit {
  Visit(this.k, this.id, this.at);
  final String k;
  final String id;
  final num at;

  Map<String, Object?> toJson() =>
      <String, Object?>{'k': k, 'id': id, 'at': at};
}

num? _num(Object? v) {
  if (v is num) return v.isFinite ? v : null;
  if (v is String) {
    final n = num.tryParse(v.trim());
    return n != null && n.isFinite ? n : null;
  }
  return null;
}

Visit? _visit(Object? e) {
  if (e is Visit) return e;
  if (e is! Map) return null;
  final k = e['k'];
  final id = e['id'];
  final at = _num(e['at']);
  if (k is! String || !KINDS.contains(k)) return null;
  if (id is! String || id.isEmpty || at == null) return null;
  return Visit(k, id, at);
}

/// Clean a saved list: known kinds, real ids and times, newest first, no
/// repeats, at most 8.
List<Visit> normRecent(Object? v) {
  if (v is! List) return <Visit>[];
  final seen = <String>{};
  final out = <Visit>[];
  for (final e in v) {
    final visit = _visit(e);
    if (visit == null) continue;
    final key = '${visit.k}:${visit.id}';
    if (!seen.add(key)) continue;
    out.add(visit);
  }
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final byTime = b.value.at.compareTo(a.value.at);
    return byTime != 0 ? byTime : a.key.compareTo(b.key);
  });
  return indexed.take(RECENT_MAX).map((e) => e.value).toList();
}

/// Note that you just looked at something. It moves to the front.
List<Visit> pushVisit(Object? list, String k, String id, Object? now) {
  final at = _num(now);
  if (!KINDS.contains(k) || id.isEmpty || at == null) return normRecent(list);
  final others = normRecent(list)
      .where((e) => !(e.k == k && e.id == id))
      .toList();
  return normRecent(<Visit>[Visit(k, id, at), ...others]);
}

/// The ones that still exist, newest first.
List<Visit> liveVisits(
  Object? list,
  bool Function(String k, String id) exists, [
  int n = 5,
]) =>
    normRecent(list).where((e) => exists(e.k, e.id)).take(n).toList();

/// "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago".
String agoText(Object? at, Object? now) {
  final a = _num(at) ?? 0;
  final n = _num(now) ?? 0;
  final m = ((n - a) / 60000).floor();
  if (m < 2) return 'just now';
  if (m < 60) return '$m min ago';
  final h = (m / 60).floor();
  if (h < 24) return '$h h ago';
  final d = (h / 24).floor();
  return d == 1 ? 'yesterday' : '$d days ago';
}
