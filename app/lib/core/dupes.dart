// dupes.dart - the parts of legacy/web-src/js/dupes.js that work on saved
// resources. siteKey itself is in util.dart because T1.1 needed it there.
import 'model/resource.dart';
import 'util.dart';

export 'util.dart' show siteKey;

/// Map of site key -> resources. Links without an address, or from the
/// Instagram follow list, are left out.
Map<String, List<Resource>> siteIndex(List<Resource> resources) {
  final m = <String, List<Resource>>{};
  for (final r in resources) {
    if (r.url.isEmpty || r.src == 'following') continue;
    final k = siteKey(r.url);
    if (k.isEmpty) continue;
    m.putIfAbsent(k, () => <Resource>[]).add(r);
  }
  return m;
}

class SameSite {
  SameSite(this.r, this.same);
  final Resource r;
  final bool same;
  Map<String, Object?> toJson() => <String, Object?>{
        'r': r.toJson(),
        'same': same,
      };
}

/// Other resources from the same site as [r].
List<SameSite> sameSite(Resource? r, Map<String, List<Resource>> index) {
  if (r == null || r.url.isEmpty) return <SameSite>[];
  final k = siteKey(r.url);
  if (k.isEmpty || r.src == 'following') return <SameSite>[];
  final me = normUrl(r.url);
  return (index[k] ?? const <Resource>[])
      .where((o) => o.id != r.id)
      .map((o) => SameSite(o, normUrl(o.url) == me))
      .toList();
}

class ImportEntry {
  ImportEntry({this.url = '', this.title = '', this.src = ''});
  final String url;
  final String title;
  final String src;
}

class FlaggedEntry {
  FlaggedEntry(this.entry, this.others);
  final ImportEntry entry;
  final List<FlaggedOther> others;
}

class FlaggedOther {
  FlaggedOther(this.title, this.url, this.saved);
  final String title;
  final String url;
  final bool saved;
  Map<String, Object?> toJson() => <String, Object?>{
        'title': title,
        'url': url,
        'saved': saved,
      };
}

/// For an import: which new entries sit on a site you already have, or that
/// another entry in the same list uses.
List<FlaggedEntry> flagEntries(
  List<ImportEntry> entries,
  List<Resource> resources,
) {
  final idx = siteIndex(resources);
  final batch = <String, List<ImportEntry>>{};
  for (final e in entries) {
    final k = e.src == 'following' ? '' : siteKey(e.url);
    if (k.isEmpty) continue;
    batch.putIfAbsent(k, () => <ImportEntry>[]).add(e);
  }
  final out = <FlaggedEntry>[];
  for (final e in entries) {
    final k = e.src == 'following' ? '' : siteKey(e.url);
    if (k.isEmpty) continue;
    final saved = (idx[k] ?? const <Resource>[])
        .map((r) => FlaggedOther(r.title, r.url, true))
        .toList();
    final mine = normUrl(e.url);
    final peers = (batch[k] ?? const <ImportEntry>[])
        .where((o) => normUrl(o.url) != mine)
        .map((o) => FlaggedOther(o.title.isEmpty ? o.url : o.title, o.url, false))
        .toList();
    if (saved.isNotEmpty || peers.isNotEmpty) {
      out.add(FlaggedEntry(e, <FlaggedOther>[...saved, ...peers]));
    }
  }
  return out;
}
