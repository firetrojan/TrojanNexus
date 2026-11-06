// choices.dart - port of legacy/web-src/js/choices.js. Sector buttons for a link.
import 'model/resource.dart';

const int RECENT_MAX = 8;

/// Put a sector id first in the "used lately" list, no repeats of [id],
/// at most 8.
List<String> pushRecent(Object? list, String id) {
  final out = <String>[];
  void add(Object? x) {
    if (x is String && x.isNotEmpty) out.add(x);
  }

  add(id);
  if (list is List) {
    for (final x in list) {
      if (x != id) add(x);
    }
  }
  return out.take(RECENT_MAX).toList();
}

class SectorJob {
  SectorJob(this.id, this.name, this.rule, this.members);
  final String id;
  final String name;
  final bool rule;
  final List<String> members;

  factory SectorJob.fromJson(Object? raw) {
    final m = raw is Map ? raw : const <Object?, Object?>{};
    final membersRaw = m['members'];
    final members = <String>[];
    if (membersRaw is List) {
      for (final x in membersRaw) {
        members.add(x.toString());
      }
    }
    return SectorJob(
      m['id']?.toString() ?? '',
      m['name']?.toString() ?? '',
      m['rule'] != null,
      members,
    );
  }
}

class SectorChoice {
  SectorChoice(this.job, this.kind);
  final SectorJob job;
  final String kind;

  Map<String, Object?> toJson() =>
      <String, Object?>{'job': job.id, 'kind': kind};
}

/// Up to [n] sectors: first the ones that fit the link, then the ones used
/// lately, then the biggest. Only hand-filled sectors, not ones the link is
/// already in.
List<SectorChoice> sectorChoices(
  Resource r,
  List<SectorJob> jobs, {
  List<Object?> fits = const <Object?>[],
  List<String> recent = const <String>[],
  int n = 4,
}) {
  bool ok(SectorJob? j) =>
      j != null && !j.rule && !j.members.contains(r.id);
  final byId = <String, SectorJob>{};
  for (final j in jobs) {
    byId[j.id] = j;
  }
  final out = <SectorChoice>[];
  final seen = <String>{};
  void add(SectorJob? j, String kind) {
    if (ok(j) && !seen.contains(j!.id) && out.length < n) {
      seen.add(j.id);
      out.add(SectorChoice(j, kind));
    }
  }

  for (final f in fits) {
    if (f is SectorJob) {
      add(f, 'fit');
    } else if (f is Map) {
      add(byId[f['id']?.toString()], 'fit');
    }
  }
  for (final id in recent) {
    add(byId[id], 'recent');
  }
  final big = jobs.toList()
    ..sort((a, b) {
      if (a.members.length != b.members.length) {
        return b.members.length - a.members.length;
      }
      return a.name.compareTo(b.name);
    });
  for (final j in big) {
    add(j, 'big');
  }
  return out;
}
