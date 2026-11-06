import 'package:nexus/core/model/job.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/rule.dart';
import 'package:nexus/core/suggest.dart';

import 'golden.dart';

Resource _resource(Object? raw) {
  final x = raw as Map;
  final r = normalizeResource(x.cast<String, Object?>());
  final scan = x['scan'];
  if (scan is Map) {
    final conf = scan['conf'];
    r.scan = Scan(
      topic: scan['topic']?.toString() ?? '',
      conf: conf == 'clear' || conf == 'maybe' ? conf.toString() : 'none',
    );
  }
  return r;
}

Map<String, Resource> _byId(Object? raw) {
  final out = <String, Resource>{};
  for (final e in (raw as Map).entries) {
    out[e.key.toString()] = _resource(e.value);
  }
  return out;
}

List<Job> _jobs(Object? raw) => (raw as List).asMap().entries.map((e) {
      final x = e.value as Map;
      final j = normalizeJob(x.cast<String, Object?>(), e.key);
      if (x['rule'] != null && j.rule == null) j.rule = Rule();
      return j;
    }).toList();

Resource _r(Object? raw) => _resource(raw);

List<Job> Function(String) _jobsOf(List<Job> jobs, Object? ids) {
  final set = (ids as List).map((x) => x.toString()).toSet();
  return (rid) => jobs.where((j) => set.contains(j.id)).toList();
}

Object? _profileOut(SuggestProfiles ps) => <String, Object?>{
      'profiles': ps.profiles
          .map((p) => <String, Object?>{
                'job': p.job.id,
                'n': p.n,
                'ids': p.ids.toList(),
                'tags': p.tags,
                'sites': p.sites,
                'folders': p.folders,
                'topics': p.topics,
                'types': p.types,
                'words': p.words,
              })
          .toList(),
      'common': ps.common.toList(),
    };

Map<String, Object?>? _sOut(SuggestResult? s) => s == null
    ? null
    : <String, Object?>{
        'job': s.job.id,
        'score': s.score,
        'why': s.why,
        'unsure': s.unsure,
        'also': s.also.map((j) => j.id).toList(),
      };

void main() {
  runGolden('suggest', <String, GoldenFn>{
    'buildProfiles': (a) => _profileOut(buildProfiles(_jobs(a[0]), _byId(a[1]))),
    'suggestTop': (a) {
      final jobs = _jobs(a[1]);
      final ps = buildProfiles(jobs, _byId(a[2]));
      final n = a.length > 4 ? a[4] as int : 3;
      return suggestTop(_r(a[0]), ps, _jobsOf(jobs, a[3]), n)
          .map((s) => <String, Object?>{'job': s.job.id, 'score': s.score, 'why': s.why})
          .toList();
    },
    'suggest': (a) {
      final jobs = _jobs(a[1]);
      final ps = buildProfiles(jobs, _byId(a[2]));
      return _sOut(suggest(_r(a[0]), ps, _jobsOf(jobs, a[3])));
    },
    'suggestMany': (a) {
      final jobs = _jobs(a[1]);
      final byId = _byId(a[2]);
      final list = (a[0] as List).map(_r).toList();
      return suggestMany(list, jobs, byId, _jobsOf(jobs, a[3]))
          .map((x) => <String, Object?>{'r': x.r.id, 's': _sOut(x.s)})
          .toList();
    },
  });
}
