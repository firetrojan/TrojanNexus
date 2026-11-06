import 'package:nexus/core/model/job.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/thread.dart';
import 'package:nexus/core/search.dart';

import 'golden.dart';

SearchOptions _options(Object? raw) {
  final m = raw is Map ? raw : const <Object?, Object?>{};
  Set<String>? strings(Object? value) {
    if (value is! List) return null;
    return value.map((x) => x.toString()).toSet();
  }

  return SearchOptions(
    mode: m['mode']?.toString() ?? 'and',
    types: strings(m['types']),
    statuses: strings(m['statuses']),
  );
}

List<Resource> _resources(Object? raw) =>
    (raw as List<dynamic>).map((x) => normalizeResource(x)).toList();

void main() {
  runGolden('search', {
    'tokenize': (a) => tokenize(a[0] as String?),
    'stem': (a) => stem(a[0] as String),
    'search': (a) {
      final raw = a[0] as List<dynamic>;
      final resources = raw.map((x) => normalizeResource(x)).toList();
      return search(resources, a[1] as String?, _options(a[2])).toJson();
    },
    'highlight': (a) => highlight(
          a[0] as String?,
          (a[1] as List<dynamic>).map((x) => x.toString()).toList(),
        ),
    'threadsFor': (a) {
      final ids = (a[0] as List<dynamic>).map((x) => x.toString()).toList();
      final threads = (a[1] as List<dynamic>)
          .map((x) => normalizeThread(x))
          .toList();
      return threadsFor(ids, threads).map((x) => x.toJson()).toList();
    },
    'suggestLinks': (a) {
      final resources = _resources(a[1]);
      final r = resources.firstWhere((x) => x.id == a[0]);
      return suggestLinks(r, resources, (a[2] as num).toInt())
          .map((x) => x.toJson())
          .toList();
    },
    'suggestJobs': (a) {
      final resources = _resources(sharedLinks());
      final byId = <String, Resource>{for (final r in resources) r.id: r};
      final r = byId[a[0]]!;
      final jobs = (a[1] as List<dynamic>)
          .map((x) => normalizeJob(x))
          .toList();
      return suggestJobs(r, jobs, (id) => byId[id], (a[2] as num).toInt())
          .map((x) => x.toJson())
          .toList();
    },
    'STOP': (a) => STOP.toList(),
    'FIELD_LABEL': (a) => FIELD_LABEL,
    'FIELD_WEIGHT': (a) => FIELD_WEIGHT,
  });
}
