import 'package:nexus/core/buckets.dart';
import 'package:nexus/core/home.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

List<Resource> _resources(Object? raw) =>
    (raw as List<dynamic>).map((x) => normalizeResource(x)).toList();

Map<String, Resource> _byId() {
  final out = <String, Resource>{};
  for (final x in sharedLinks()) {
    final r = normalizeResource(x);
    out[r.id] = r;
  }
  return out;
}

void main() {
  runGolden('home', {
    'normShelves': (a) => normShelves(a[0]).map((x) => x.toJson()).toList(),
    'shelfList': (a) {
      final ids = (a[0] as List<dynamic>).map((x) => x.toString()).toList();
      final byId = _byId();
      return shelfList(ids, (id) => byId[id], (a[1] as num).toInt())
          .map((r) => r.id)
          .toList();
    },
    'launchable': (a) => _resources(a[0])
        .map((r) => <String, Object?>{'id': r.id, 'v': launchable(r)})
        .toList(),
    'launchList': (a) => launchList(
          _resources(a[0]),
          a[1] as String,
          (a[2] as num).toInt(),
        ).map((r) => r.id).toList(),
    'reviewQueue': (a) => reviewQueue(
          _resources(a[0]),
          (a[1] as List<dynamic>).map((x) => x.toString()).toList(),
        ).map((r) => r.id).toList(),
    'normHome': (a) => normHome(a[0]).toJson(),
    'visibleTiles': (a) => visibleTiles(a[0]),
    'TILES': (a) => TILES.map((x) => x.toJson()).toList(),
    'needsItems': (a) {
      final fns = HomeNeedsFns(
        trialBucket: (r, day) => trialBucket(r, day) ?? '',
        dueBucket: (r, day) => dueBucket(r, day) ?? '',
        resetBucket: (r, day) => resetBucket(r, day) ?? '',
        watchChanged: watchChanged,
      );
      return needsItems(_resources(a[0]), fns, a[1] as String)
          .map((x) => <String, Object?>{
                'id': x.r.id,
                'kind': x.kind,
                'rank': x.rank,
                'sub': x.sub,
              })
          .toList();
    },
    'nextAction': (a) {
      final m = a[0] as Map<String, dynamic>;
      return nextAction(NextActionContext(
        (m['drafts'] as num).toInt(),
        (m['stale'] as num).toInt(),
        (m['total'] as num).toInt(),
        (m['pins'] as num).toInt(),
      )).toJson();
    },
    'exampleQueries': (a) {
      final raw = a[0];
      final resources =
          raw == r'$RS' ? _resources(sharedLinks()) : _resources(raw);
      return exampleQueries(
        resources,
        (a[1] as num).toInt(),
        (a[2] as num).toInt(),
      );
    },
    'MAX_SHELVES': (a) => MAX_SHELVES,
  });
}
