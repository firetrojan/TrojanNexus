// tags.dart - port of legacy/web-src/js/tags.js. Counts, rename/merge/delete, similar tags.
import 'model/resource.dart';

/// A tag the way Nexus stores it: lower case, no leading #, no commas,
/// single spaces, at most 40 letters.
String cleanTag(String? s) {
  var t = (s ?? '').toLowerCase();
  t = t.replaceAll(RegExp(r'[,;\n]+'), ' ');
  t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
  t = t.replaceFirst(RegExp(r'^#+\s*'), '').trim();
  if (t.length > 40) t = t.substring(0, 40);
  return t.trim();
}

class TagCount {
  TagCount(this.tag, this.n, this.live);
  final String tag;
  final int n;
  final int live;

  factory TagCount.fromJson(Object? raw) {
    final m = raw is Map ? raw : const <String, Object?>{};
    final n = m['n'];
    final live = m['live'];
    return TagCount(
      m['tag'] == null ? '' : m['tag'].toString(),
      n is num ? n.toInt() : 0,
      live is num ? live.toInt() : 0,
    );
  }

  Map<String, Object?> toJson() => <String, Object?>{
        'tag': tag,
        'n': n,
        'live': live,
      };
}

class TagGroup {
  TagGroup(this.tags);
  final List<TagCount> tags;

  Map<String, Object?> toJson() => <String, Object?>{
        'tags': tags.map((x) => x.toJson()).toList(),
      };
}

/// Most used first, then A to Z. n = every link with it, live = not archived.
List<TagCount> tagCounts(List<Resource> resources) {
  final counts = <String, TagCount>{};
  for (final r in resources) {
    for (final t in r.tags) {
      final e = counts[t] ?? TagCount(t, 0, 0);
      counts[t] = TagCount(e.tag, e.n + 1, e.live + (r.status == 'archived' ? 0 : 1));
    }
  }
  final out = counts.values.toList();
  out.sort((a, b) {
    if (a.live != b.live) return b.live - a.live;
    if (a.n != b.n) return b.n - a.n;
    return a.tag.compareTo(b.tag);
  });
  return out;
}

/// For rename, join and delete: { [resource id]: new tag list } for links that
/// have any tag in [from]. to = '' deletes them. Order is kept and no tag appears
/// twice. Links without those tags are left out.
Map<String, List<String>> retag(List<Resource> resources, Object? from, Object? to) {
  final source = from is List ? from : <Object?>[from];
  final set = source.toSet();
  final dest = cleanTag(to == null ? null : to.toString());
  final out = <String, List<String>>{};
  for (final r in resources) {
    if (!r.tags.any(set.contains)) continue;
    final next = <String>[];
    for (final t in r.tags) {
      final x = set.contains(t) ? dest : t;
      if (x.isNotEmpty && !next.contains(x)) next.add(x);
    }
    out[r.id] = next;
  }
  return out;
}

String _tagKey(String tag) {
  var k = tag
      .toLowerCase()
      .replaceAll(RegExp(r'[^\p{L}\p{M}\p{N}]+', unicode: true), '');
  k = k.replaceAll(RegExp(r'(ies)$'), 'y');
  k = k.replaceAll(RegExp(r'(es|s)$'), '');
  return k;
}

/// Groups of tags that probably mean the same thing (case, hyphens, plural),
/// the most used first in each group.
List<TagGroup> similarTags(List<TagCount> counts) {
  final groups = <String, List<TagCount>>{};
  for (final c in counts) {
    final k = _tagKey(c.tag);
    if (k.length < 3) continue;
    groups.putIfAbsent(k, () => <TagCount>[]).add(c);
  }
  final out = <TagGroup>[];
  for (final group in groups.values) {
    if (group.length < 2) continue;
    group.sort((a, b) {
      if (a.n != b.n) return b.n - a.n;
      return a.tag.compareTo(b.tag);
    });
    out.add(TagGroup(group));
  }
  out.sort((a, b) {
    final an = a.tags.fold<int>(0, (s, x) => s + x.n);
    final bn = b.tags.fold<int>(0, (s, x) => s + x.n);
    return bn - an;
  });
  return out;
}
