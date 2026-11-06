// insights.dart - port of legacy/web-src/js/insights.js. Plain facts from your data.
import 'model/job.dart';
import 'model/resource.dart';
import 'util.dart';

const int IDLE_DAYS = 60;
const List<String> _months = <String>[
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// The links you open most (opened at least once), most first.
List<Resource> mostUsed(List<Resource> resources, [int n = 6]) {
  final out = resources
      .where((r) => r.opens > 0 && r.status != 'archived')
      .toList();
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final x = a.value;
    final y = b.value;
    if (x.opens != y.opens) return y.opens - x.opens;
    if (x.openedAt != y.openedAt) return y.openedAt - x.openedAt;
    final byTitle = x.title.compareTo(y.title);
    return byTitle != 0 ? byTitle : a.key.compareTo(b.key);
  });
  return indexed.take(n).map((e) => e.value).toList();
}

class CullContext {
  CullContext({
    required this.today,
    this.opensSince = '',
    this.inMission,
  });
  final String today;
  final String opensSince;
  final Set<String>? inMission;
}

class CullItem {
  CullItem(this.r, this.idle);
  final Resource r;
  final int? idle;
  Map<String, Object?> toJson() => <String, Object?>{
        'r': r.toJson(),
        'idle': idle,
      };
}

class CullInfo {
  CullInfo(this.ready, this.daysTracked, this.waitDays, this.since, this.list);
  final bool ready;
  final int daysTracked;
  final int waitDays;
  final String since;
  final List<CullItem> list;
  Map<String, Object?> toJson() => <String, Object?>{
        'ready': ready,
        'daysTracked': daysTracked,
        'waitDays': waitDays,
        'since': since,
        'list': list.map((x) => x.toJson()).toList(),
      };
}

/// Links you probably do not use any more. Not ready until Nexus has counted
/// opens for [IDLE_DAYS].
CullInfo cullInfo(List<Resource> resources, CullContext ctx) {
  final since = ctx.opensSince.isNotEmpty && parseISO(ctx.opensSince) != null
      ? ctx.opensSince
      : '';
  final daysTracked = since.isEmpty ? 0 : _max(0, daysBetween(since, ctx.today));
  final ready = daysTracked >= IDLE_DAYS;
  final waitDays = ready ? 0 : IDLE_DAYS - daysTracked;
  if (!ready) return CullInfo(ready, daysTracked, waitDays, since, <CullItem>[]);
  final inMission = ctx.inMission ?? <String>{};
  final list = <CullItem>[];
  for (final r in resources) {
    if (r.status == 'archived' ||
        r.pinned ||
        r.locked ||
        r.keep ||
        r.draft ||
        r.src == 'following' ||
        r.url.isEmpty) {
      continue;
    }
    if (r.watch != null && _truthy(r.watch!['on'])) continue;
    if (r.trialEnd.isNotEmpty || r.status == 'testing' || inMission.contains(r.id)) {
      continue;
    }
    final idle = r.openedAt != 0
        ? daysBetween(
            iso(DateTime.fromMillisecondsSinceEpoch(r.openedAt)),
            ctx.today,
          )
        : null;
    if (idle == null) {
      list.add(CullItem(r, null));
    } else if (idle >= IDLE_DAYS) {
      list.add(CullItem(r, idle));
    }
  }
  list.sort((a, b) {
    final ai = a.idle ?? -1;
    final bi = b.idle ?? -1;
    final byIdle = bi.compareTo(ai);
    return byIdle != 0 ? byIdle : a.r.title.compareTo(b.r.title);
  });
  return CullInfo(ready, daysTracked, waitDays, since, list);
}

int _max(int a, int b) => a > b ? a : b;

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

class SectorShareItem {
  SectorShareItem(this.id, this.name, this.color, this.n, this.drafts, this.smart);
  final String id;
  final String name;
  final String color;
  final int n;
  final int drafts;
  final bool smart;
  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'name': name,
        'color': color,
        'n': n,
        'drafts': drafts,
        'smart': smart,
      };
}

/// Resources per sector you fill yourself, biggest first.
List<SectorShareItem> sectorShare(
  List<Job> jobs,
  Resource? Function(String id) byId,
) {
  final out = <SectorShareItem>[];
  for (final j in jobs) {
    final rs = j.members.map(byId).whereType<Resource>().where((r) => r.status != 'archived');
    final list = rs.toList();
    if (list.isEmpty) continue;
    out.add(SectorShareItem(
      j.id,
      j.name,
      j.color,
      list.length,
      list.where((r) => r.draft).length,
      j.rule != null,
    ));
  }
  out.sort((a, b) {
    final byN = b.n - a.n;
    return byN != 0 ? byN : a.name.compareTo(b.name);
  });
  return out;
}

class MonthCount {
  MonthCount(this.key, this.label, this.n);
  final String key;
  final String label;
  int n;
  Map<String, Object?> toJson() =>
      <String, Object?>{'key': key, 'label': label, 'n': n};
}

/// New links per month for the last [months] months, oldest first.
List<MonthCount> addedPerMonth(
  List<Resource> resources,
  String today, [
  int months = 6,
]) {
  final t = parseISO(today) ?? nowClock();
  final out = <MonthCount>[];
  for (var i = months - 1; i >= 0; i--) {
    final d = DateTime(t.year, t.month - i, 1);
    final key = '${d.year}-${d.month.toString().padLeft(2, '0')}';
    out.add(MonthCount(key, _months[d.month - 1], 0));
  }
  final idx = <String, MonthCount>{};
  for (final o in out) {
    idx[o.key] = o;
  }
  for (final r in resources) {
    final source = r.createdAt.isEmpty ? r.added : r.createdAt;
    final k = source.length > 7 ? source.substring(0, 7) : source;
    final o = idx[k];
    if (o != null) o.n++;
  }
  return out;
}

class LooseEnds {
  LooseEnds(this.noSector, this.noWords);
  final List<Resource> noSector;
  final List<Resource> noWords;
  Map<String, Object?> toJson() => <String, Object?>{
        'noSector': noSector.map((r) => r.id).toList(),
        'noWords': noWords.map((r) => r.id).toList(),
      };
}

/// Things left lying around: links with no hand-filled sector, and links with
/// no words describing what they do.
LooseEnds looseEnds(
  List<Resource> resources,
  List<String> Function(String id) manualJobsOf,
) {
  final live = resources
      .where((r) => r.status != 'archived' && r.src != 'following')
      .toList();
  return LooseEnds(
    live.where((r) => manualJobsOf(r.id).isEmpty).toList(),
    live
        .where((r) => !r.draft && r.useWhen.isEmpty && r.capabilities.isEmpty)
        .toList(),
  );
}

class StorageInfo {
  StorageInfo(this.kb, this.pct, this.label);
  final int kb;
  final int pct;
  final String label;
  Map<String, Object?> toJson() =>
      <String, Object?>{'kb': kb, 'pct': pct, 'label': label};
}

/// Saved-data size against the browser's usual 5 MB limit.
StorageInfo storageInfo(num bytes, [int cap = 5 * 1024 * 1024]) {
  final kb = (bytes / 1024).round();
  final pct = (100 * bytes / cap).round();
  return StorageInfo(
    kb,
    pct > 100 ? 100 : pct,
    kb >= 1024 ? '${(kb / 1024).toStringAsFixed(1)} MB' : '$kb KB',
  );
}
