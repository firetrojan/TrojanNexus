// merge.dart - port of legacy/web-src/js/merge.js. What the survivor gets.
import 'dupes.dart';
import 'model/resource.dart';
import 'util.dart';

String _key(String s) => s.trim().toLowerCase();

List<String> _union(List<String> a, List<String> b) {
  final seen = a.map(_key).toSet();
  final out = List<String>.from(a);
  for (final x in b) {
    if (seen.add(_key(x))) out.add(x);
  }
  return out;
}

class MergePatch {
  MergePatch({
    required this.url,
    required this.tags,
    required this.capabilities,
    required this.useWhen,
    required this.inputs,
    required this.outputs,
    required this.notes,
    required this.learned,
    required this.fields,
    required this.pinned,
    required this.keep,
    required this.opens,
    required this.openedAt,
    required this.draft,
    required this.createdAt,
    required this.watch,
    required this.scan,
  });

  final String url;
  final List<String> tags;
  final List<String> capabilities;
  final List<String> useWhen;
  final String inputs;
  final String outputs;
  final String notes;
  final String learned;
  final Map<String, String> fields;
  final bool pinned;
  final bool keep;
  final int opens;
  final int openedAt;
  final bool draft;
  final String createdAt;
  final Object? watch;
  final Scan? scan;

  Map<String, Object?> toJson() => <String, Object?>{
        'url': url,
        'tags': tags,
        'capabilities': capabilities,
        'useWhen': useWhen,
        'inputs': inputs,
        'outputs': outputs,
        'notes': notes,
        'learned': learned,
        'fields': fields,
        'pinned': pinned,
        'keep': keep,
        'opens': opens,
        'openedAt': openedAt,
        'draft': draft,
        'createdAt': createdAt,
        'watch': watch,
        'scan': scan?.toJson(),
      };
}

/// The fields the survivor [keep] gets from the one being removed [drop].
/// Nothing of keep is overwritten except by adding.
MergePatch mergePatch(Resource keep, Resource drop) {
  final extra = <String>[];
  if (drop.notes.isNotEmpty && !keep.notes.contains(drop.notes)) {
    extra.add('From "${drop.title}": ${drop.notes}');
  }
  if (drop.url.isNotEmpty &&
      keep.url.isNotEmpty &&
      normUrl(drop.url) != normUrl(keep.url) &&
      !keep.notes.contains(drop.url)) {
    extra.add('Also: ${drop.url}');
  }
  final fields = <String, String>{...drop.fields};
  for (final e in keep.fields.entries) {
    if (e.value.isNotEmpty) fields[e.key] = e.value;
  }
  final learned = keep.learned.isNotEmpty &&
          drop.learned.isNotEmpty &&
          !keep.learned.contains(drop.learned)
      ? '${keep.learned}\n${drop.learned}'
      : (keep.learned.isNotEmpty ? keep.learned : drop.learned);
  final created = <String>[keep.createdAt, drop.createdAt]
      .where((x) => x.isNotEmpty)
      .toList()
    ..sort();
  final opens = keep.opens + drop.opens;
  return MergePatch(
    url: keep.url.isNotEmpty ? keep.url : drop.url,
    tags: _union(keep.tags, drop.tags),
    capabilities: _union(keep.capabilities, drop.capabilities),
    useWhen: _union(keep.useWhen, drop.useWhen),
    inputs: keep.inputs.isNotEmpty ? keep.inputs : drop.inputs,
    outputs: keep.outputs.isNotEmpty ? keep.outputs : drop.outputs,
    notes: <String>[keep.notes, ...extra].where((x) => x.isNotEmpty).join('\n\n'),
    learned: learned,
    fields: fields,
    pinned: keep.pinned || drop.pinned,
    keep: keep.keep || drop.keep,
    opens: opens > 1000000 ? 1000000 : opens,
    openedAt: keep.openedAt > drop.openedAt ? keep.openedAt : drop.openedAt,
    draft: keep.draft && drop.draft,
    createdAt: created.isEmpty ? keep.createdAt : created.first,
    watch: keep.watch ?? drop.watch,
    scan: keep.scan ?? drop.scan,
  );
}

class DupeGroup {
  DupeGroup(this.key, this.items, this.exact);
  final String key;
  final List<Resource> items;
  final bool exact;
  Map<String, Object?> toJson() => <String, Object?>{
        'key': key,
        'ids': items.map((r) => r.id).toList(),
        'exact': exact,
      };
}

/// Sites where you saved more than one link, biggest groups first. Archived
/// links and ignored site keys are left out.
List<DupeGroup> dupeGroups(
  List<Resource> resources, [
  List<String> ignore = const <String>[],
]) {
  final skip = ignore.toSet();
  final out = <DupeGroup>[];
  for (final e in siteIndex(
    resources.where((r) => r.status != 'archived').toList(),
  ).entries) {
    if (e.value.length < 2 || skip.contains(e.key)) continue;
    final seen = <String>{};
    var exact = false;
    for (final r in e.value) {
      final u = normUrl(r.url);
      if (!seen.add(u)) exact = true;
    }
    out.add(DupeGroup(e.key, e.value, exact));
  }
  out.sort((a, b) {
    final byExact = (b.exact ? 1 : 0) - (a.exact ? 1 : 0);
    if (byExact != 0) return byExact;
    final byLength = b.items.length - a.items.length;
    return byLength != 0 ? byLength : a.key.compareTo(b.key);
  });
  return out;
}
