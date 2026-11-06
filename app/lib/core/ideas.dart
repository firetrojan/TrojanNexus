// ideas.dart - port of legacy/web-src/js/ideas.js. Groups of links that could be a sector.
import 'model/resource.dart';

const Set<String> _skipTypes = <String>{'other', 'web-tool'};

String _title(String s) => s.replaceAllMapped(
      RegExp(r'(^|[\s-])(\p{L})', unicode: true),
      (m) => '${m[1]}${m[2]!.toUpperCase()}',
    );

class SectorIdea {
  SectorIdea(this.key, this.name, this.ids, this.n, this.how);
  final String key;
  final String name;
  final List<String> ids;
  final int n;
  final String how;
  Map<String, Object?> toJson() => <String, Object?>{
        'key': key,
        'name': name,
        'ids': ids,
        'n': n,
        'how': how,
      };
}

class _IdeaGroup {
  _IdeaGroup(this.key, this.name, this.how);
  final String key;
  final String name;
  final String how;
  final List<String> ids = <String>[];
}

/// Up to [max] ideas: groups sharing a tag or type, best first, with no link
/// in two ideas. Needs at least [min] links in a group.
List<SectorIdea> sectorIdeas(
  List<Resource> resources,
  List<String> jobNames,
  List<String> Function(String id) manualJobsOf, {
  String Function(String type)? typeLabel,
  int min = 3,
  int max = 4,
}) {
  final label = typeLabel ?? (t) => t;
  final taken = jobNames.map((n) => n.trim().toLowerCase()).toSet();
  var pool = resources
      .where((r) =>
          r.status != 'archived' &&
          r.src != 'following' &&
          !r.draft &&
          manualJobsOf(r.id).isEmpty)
      .toList();
  final out = <SectorIdea>[];
  while (out.length < max && pool.length >= min) {
    final groups = <String, _IdeaGroup>{};
    void add(String key, String name, String how, Resource r) {
      groups.putIfAbsent(key, () => _IdeaGroup(key, name, how)).ids.add(r.id);
    }

    for (final r in pool) {
      for (final t in r.tags) {
        if (t.length >= 2 &&
            !RegExp(r'^\d+$').hasMatch(t) &&
            !taken.contains(t.toLowerCase())) {
          add('t:$t', _title(t), 'tag #$t', r);
        }
      }
      if (!_skipTypes.contains(r.type)) {
        final name = label(r.type);
        if (!taken.contains(name.toLowerCase())) {
          add('y:${r.type}', name, 'type $name', r);
        }
      }
    }
    final candidates = groups.values
        .where((e) => e.ids.length >= min && !out.any((o) => o.key == e.key))
        .toList();
    candidates.sort((a, b) {
      final byCount = b.ids.length - a.ids.length;
      if (byCount != 0) return byCount;
      final byKind =
          (a.key.startsWith('t:') ? 0 : 1) - (b.key.startsWith('t:') ? 0 : 1);
      if (byKind != 0) return byKind;
      return a.name.compareTo(b.name);
    });
    if (candidates.isEmpty) break;
    final best = candidates.first;
    out.add(SectorIdea(
      best.key,
      best.name,
      List<String>.from(best.ids),
      best.ids.length,
      best.how,
    ));
    final used = best.ids.toSet();
    pool = pool.where((r) => !used.contains(r.id)).toList();
  }
  return out;
}
