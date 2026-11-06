// suggest.dart - which of my sectors does this link belong in?
// Port of legacy/web-src/js/suggest.js. It only learns from links the owner filed himself.
import 'model/job.dart';
import 'model/resource.dart';
import 'util.dart';

const int _minMembers = 3;
const double _minScore = 2.0;

String _norm(Object? value) => (value == null ? '' : value.toString())
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .trim();

void _bump(Map<String, int> map, String key) {
  if (key.isEmpty) return;
  map[key] = (map[key] ?? 0) + 1;
}

class SuggestProfile {
  SuggestProfile({
    required this.job,
    required this.n,
    required this.ids,
    required this.tags,
    required this.sites,
    required this.folders,
    required this.topics,
    required this.types,
    required this.words,
  });

  final Job job;
  final int n;
  final Set<String> ids;
  final Map<String, int> tags;
  final Map<String, int> sites;
  final Map<String, int> folders;
  final Map<String, int> topics;
  final Map<String, int> types;
  final List<String> words;
}

class SuggestProfiles {
  SuggestProfiles(this.profiles, this.common);

  final List<SuggestProfile> profiles;
  final Set<String> common;
}

class SuggestResult {
  SuggestResult({
    required this.job,
    required this.score,
    required this.why,
    required this.unsure,
    required this.also,
  });

  final Job job;
  final double score;
  final List<String> why;
  final bool unsure;
  final List<Job> also;
}

class SuggestPair {
  SuggestPair(this.r, this.s);

  final Resource r;
  final SuggestResult s;
}

/// One profile per sector the owner filled himself (not rule-based, not sealed, 3+ links).
SuggestProfiles buildProfiles(List<Job> jobs, Map<String, Resource> byId) {
  final out = <SuggestProfile>[];
  for (final job in jobs) {
    if (job.rule != null || job.sealed) continue;
    final members = job.members
        .map((id) => byId[id])
        .whereType<Resource>()
        .where((r) => r.status != 'archived' && !r.draft)
        .toList();
    if (members.length < _minMembers) continue;
    final p = SuggestProfile(
      job: job,
      n: members.length,
      ids: job.members.toSet(),
      tags: <String, int>{},
      sites: <String, int>{},
      folders: <String, int>{},
      topics: <String, int>{},
      types: <String, int>{},
      words: _norm(job.name).split(' ').where((w) => w.length >= 4).toList(),
    );
    for (final r in members) {
      for (final tag in r.tags.toSet()) {
        _bump(p.tags, tag);
      }
      _bump(p.sites, siteKey(r.url));
      _bump(p.folders, _norm(r.folder));
      _bump(p.types, r.type);
      if (r.scan != null && r.scan!.topic.isNotEmpty && r.scan!.conf != 'none') {
        _bump(p.topics, r.scan!.topic);
      }
    }
    out.add(p);
  }
  final homes = <String, int>{};
  for (final p in out) {
    p.tags.forEach((tag, count) {
      if (count / p.n >= 0.15) _bump(homes, tag);
    });
  }
  final common = homes.entries.where((e) => e.value >= 3).map((e) => e.key).toSet();
  return SuggestProfiles(out, common);
}

class _TagHit {
  _TagHit(this.t, this.f, this.w);

  final String t;
  final double f;
  final double w;
}

class _Scored {
  _Scored(this.score, this.why);

  final double score;
  final List<String> why;
}

_Scored _scoreOne(Resource r, SuggestProfile p, String key, String folder, Set<String> common) {
  var score = 0.0;
  final why = <MapEntry<double, String>>[];
  void add(double v, String text) {
    if (v > 0) {
      score += v;
      why.add(MapEntry(v, text));
    }
  }

  final tagHits = r.tags
      .map((t) => _TagHit(t, (p.tags[t] ?? 0) / p.n, common.contains(t) ? 0.4 : 1.5))
      .where((x) => x.f > 0)
      .toList()
    ..sort((a, b) => (b.f * b.w).compareTo(a.f * a.w));
  if (tagHits.isNotEmpty) {
    var sum = 0.0;
    for (final x in tagHits) {
      sum += (3 * x.f < 1 ? 3 * x.f : 1) * x.w;
    }
    add(sum < 3.3 ? sum : 3.3, 'tags ${tagHits.take(3).map((x) => '#${x.t}').join(' ')}');
  }
  final sameSite = key.isNotEmpty ? (p.sites[key] ?? 0) : 0;
  if (sameSite > 0) {
    add(3 + (sameSite * 0.5 < 2 ? sameSite * 0.5 : 2),
        sameSite == 1 ? 'same website as 1 link here' : 'same website as $sameSite links here');
  }
  if (folder.isNotEmpty) {
    final f = (p.folders[folder] ?? 0) / p.n;
    if (f > 0) add(5 * f < 2.6 ? 5 * f : 2.6, 'same bookmark folder');
    if (folder == _norm(p.job.name)) add(4, "bookmark folder has the sector's name");
  }
  if (r.scan != null && r.scan!.topic.isNotEmpty && r.scan!.conf != 'none') {
    final f = (p.topics[r.scan!.topic] ?? 0) / p.n;
    if (f > 0) add(5 * f < 2.5 ? 5 * f : 2.5, 'same topic');
  }
  final tf = (p.types[r.type] ?? 0) / p.n;
  score += 0.8 * tf;
  if (p.words.isNotEmpty) {
    final hay = _norm('${r.title} ${r.tags.join(' ')}');
    final hit = p.words.any((w) {
      final end = 4 > w.length - 2 ? 4 : w.length - 2;
      return hay.contains(w.substring(0, end));
    });
    if (hit) add(1.5, 'its name fits "${p.job.name}"');
  }
  why.sort((a, b) => b.key.compareTo(a.key));
  return _Scored(score, why.map((e) => e.value).toList());
}

class _Ranked {
  _Ranked(this.p, this.score, this.why);

  final SuggestProfile p;
  final double score;
  final List<String> why;
}

List<_Ranked> _rank(Resource? r, SuggestProfiles profiles, List<Job> Function(String)? jobsOf) {
  if (r == null || r.status == 'archived') return <_Ranked>[];
  if (jobsOf != null && jobsOf(r.id).any((j) => j.rule == null)) return <_Ranked>[];
  final key = siteKey(r.url);
  final folder = _norm(r.folder);
  final ranked = <MapEntry<int, _Ranked>>[];
  for (var i = 0; i < profiles.profiles.length; i++) {
    final p = profiles.profiles[i];
    if (p.ids.contains(r.id)) continue;
    final s = _scoreOne(r, p, key, folder, profiles.common);
    if (s.score > 0) ranked.add(MapEntry(i, _Ranked(p, s.score, s.why)));
  }
  ranked.sort((a, b) {
    final d = b.value.score.compareTo(a.value.score);
    return d != 0 ? d : a.key - b.key;
  });
  return ranked.map((e) => e.value).toList();
}

/// The best few sectors for a link, strongest first.
List<SuggestResult> suggestTop(
  Resource? r,
  SuggestProfiles profiles,
  List<Job> Function(String)? jobsOf, [
  int n = 3,
]) {
  final out = <SuggestResult>[];
  for (final x in _rank(r, profiles, jobsOf)) {
    if (out.length >= n) break;
    if (x.score < _minScore) continue;
    out.add(SuggestResult(job: x.p.job, score: x.score, why: x.why.take(2).toList(), unsure: false, also: <Job>[]));
  }
  return out;
}

/// The best sector for a link, or null.
SuggestResult? suggest(Resource? r, SuggestProfiles profiles, List<Job> Function(String)? jobsOf) {
  final ranked = _rank(r, profiles, jobsOf);
  if (ranked.isEmpty) return null;
  final best = ranked[0];
  if (best.score < _minScore) return null;
  if (ranked.length < 2) {
    return SuggestResult(job: best.p.job, score: best.score, why: best.why.take(2).toList(), unsure: false, also: <Job>[]);
  }
  final second = ranked[1];
  if (second.score > best.score * 0.85 && best.score - second.score < 1) {
    return SuggestResult(job: best.p.job, score: best.score, why: best.why.take(2).toList(), unsure: true, also: <Job>[second.p.job]);
  }
  return SuggestResult(
    job: best.p.job,
    score: best.score,
    why: best.why.take(2).toList(),
    unsure: false,
    also: second.score >= _minScore ? <Job>[second.p.job] : <Job>[],
  );
}

/// Suggestions for many links at once. Unsure fits are left out.
List<SuggestPair> suggestMany(
  List<Resource> list,
  List<Job> jobs,
  Map<String, Resource> byId,
  List<Job> Function(String)? jobsOf,
) {
  final profiles = buildProfiles(jobs, byId);
  final out = <SuggestPair>[];
  for (final r in list) {
    final s = suggest(r, profiles, jobsOf);
    if (s != null && !s.unsure) out.add(SuggestPair(r, s));
  }
  return out;
}
