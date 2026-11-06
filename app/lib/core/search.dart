// search.dart - port of the search part of legacy/web-src/js/search.js.
// Words must match (AND) unless mode is 'or'. "Use when" and "can do" outrank notes.
import 'dart:math' as math;

import 'model/job.dart';
import 'model/resource.dart';
import 'model/thread.dart';
import 'util.dart';

const Set<String> STOP = <String>{
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'is',
  'are', 'was', 'be', 'been', 'can', 'could', 'do', 'does', 'did', 'how', 'i',
  'me', 'my', 'we', 'you', 'your', 'it', 'its', 'this', 'that', 'these',
  'those', 'with', 'from', 'by', 'as', 'into', 'about', 'what', 'which', 'who',
  'where', 'when', 'why', 'get', 'use', 'using', 'need', 'want', 'help', 'make',
  'please', 'some', 'any', 'there', 'here', 'also', 'just', 'find', 'looking',
  'look', 'search',
};

const Map<String, double> FIELD_WEIGHT = <String, double>{
  'useWhen': 5,
  'capabilities': 4,
  'title': 3,
  'tags': 3,
  'inputs': 1.5,
  'outputs': 1.5,
  'type': 1.5,
  'fields': 2,
  'notes': 1,
};

const Map<String, String> FIELD_LABEL = <String, String>{
  'useWhen': 'use when',
  'capabilities': 'can do',
  'title': 'name',
  'tags': 'tag',
  'inputs': 'input',
  'outputs': 'output',
  'type': 'type',
  'fields': 'details',
  'notes': 'notes',
};

final RegExp _wordPart = RegExp(r"[\p{L}\p{N}][\p{L}\p{N}+#._'-]*", unicode: true);
final RegExp _trailing = RegExp(r"[._'-]+$");

List<String> tokenize(String? q) {
  final text = (q ?? '').toLowerCase();
  final out = <String>[];
  for (final m in _wordPart.allMatches(text)) {
    final t = m[0]!.replaceFirst(_trailing, '');
    if (t.isNotEmpty) out.add(t);
  }
  return out;
}

/// Very light stemmer: slides -> slide, converting -> convert.
String stem(String w) {
  var s = w.toLowerCase();
  if (s.length <= 3) return s;
  if (s.endsWith('ies') && s.length > 4) return '${s.substring(0, s.length - 3)}y';
  if (s.endsWith('sses')) return s.substring(0, s.length - 2);
  if (s.endsWith('ss')) return s;
  if (s.endsWith('s') && !s.endsWith('us') && !s.endsWith('is')) {
    s = s.substring(0, s.length - 1);
  }
  if (s.length > 5 && s.endsWith('ing')) {
    s = s.substring(0, s.length - 3);
  } else if (s.length > 4 && s.endsWith('ed')) {
    s = s.substring(0, s.length - 2);
  }
  return s;
}

String _fieldText(Resource r, String f) {
  switch (f) {
    case 'useWhen':
      return r.useWhen.join(' · ');
    case 'capabilities':
      return r.capabilities.join(' · ');
    case 'tags':
      return r.tags.join(' ');
    case 'type':
      return r.type.replaceAll('-', ' ');
    case 'fields':
      return r.fields.values.join(' · ');
    case 'notes':
      return '${r.notes} ${r.learned}';
    case 'title':
      return r.title;
    case 'inputs':
      return r.inputs;
    case 'outputs':
      return r.outputs;
    default:
      return '';
  }
}

class _FieldIndex {
  _FieldIndex(String text)
      : text = text.toLowerCase(),
        words = tokenize(text).map(stem).toList();
  final String text;
  final List<String> words;
}

Map<String, _FieldIndex> _index(Resource r) {
  final f = <String, _FieldIndex>{};
  for (final k in FIELD_WEIGHT.keys) {
    f[k] = _FieldIndex(_fieldText(r, k));
  }
  return f;
}

/// 1 = whole word, .85 = same word start, .6 = inside a word, 0 = no match.
double _matchField(_FieldIndex fi, String tok, String ts) {
  for (final w in fi.words) {
    if (w == ts) return 1;
  }
  if (ts.length >= 4) {
    for (final w in fi.words) {
      if (w.length >= 4 && (w.startsWith(ts) || ts.startsWith(w))) return 0.85;
    }
  }
  if (tok.length >= 3 && fi.text.contains(tok)) return 0.6;
  return 0;
}

class SearchOptions {
  const SearchOptions({
    this.mode = 'and',
    this.types,
    this.statuses,
  });
  final String mode;
  final Set<String>? types;
  final Set<String>? statuses;
}

class SearchResult {
  SearchResult(this.r, this.score, this.matched, this.hit, this.fields);
  final Resource r;
  final double score;
  final int matched;
  final Map<String, List<int>> hit;
  final List<String> fields;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': r.id,
        'score': score,
        'matched': matched,
        'fields': fields,
        'hit': hit.map((k, v) => MapEntry(k, v)),
      };
}

class SearchOutput {
  SearchOutput(this.tokens, this.results);
  final List<String> tokens;
  final List<SearchResult> results;

  Map<String, Object?> toJson() => <String, Object?>{
        'tokens': tokens,
        'results': results.map((x) => x.toJson()).toList(),
      };
}

SearchOutput search(
  List<Resource> resources,
  String? query, [
  SearchOptions opts = const SearchOptions(),
]) {
  final raw = tokenize(query);
  var toks = raw.where((t) => !STOP.contains(t)).toList();
  if (toks.isEmpty) toks = raw;
  if (toks.isEmpty) return SearchOutput(<String>[], <SearchResult>[]);
  final stems = toks.map(stem).toList();
  final phrase = toks.join(' ');
  final results = <SearchResult>[];
  for (final r in resources) {
    if (opts.types != null && opts.types!.isNotEmpty && !opts.types!.contains(r.type)) {
      continue;
    }
    if (opts.statuses != null && opts.statuses!.isNotEmpty && !opts.statuses!.contains(r.status)) {
      continue;
    }
    final c = _index(r);
    var score = 0.0;
    var matched = 0;
    final hit = <String, List<int>>{};
    for (var i = 0; i < toks.length; i++) {
      var any = false;
      for (final k in FIELD_WEIGHT.keys) {
        final m = _matchField(c[k]!, toks[i], stems[i]);
        if (m > 0) {
          score += FIELD_WEIGHT[k]! * m;
          hit.putIfAbsent(k, () => <int>[]).add(i);
          any = true;
        }
      }
      if (any) matched++;
    }
    if (opts.mode == 'and' ? matched < toks.length : matched == 0) continue;
    if (toks.length > 1) {
      if (c['useWhen']!.text.contains(phrase) ||
          c['capabilities']!.text.contains(phrase) ||
          c['title']!.text.contains(phrase)) {
        score += 4;
      }
      for (final k in <String>['useWhen', 'capabilities']) {
        if (hit[k] != null && hit[k]!.length == toks.length) score += 3;
      }
    }
    if (r.status == 'archived') score *= 0.5;
    final keys = hit.keys.toList();
    final indexed = keys.asMap().entries.toList();
    indexed.sort((a, b) {
      final byWeight = FIELD_WEIGHT[b.value]!.compareTo(FIELD_WEIGHT[a.value]!);
      return byWeight != 0 ? byWeight : a.key.compareTo(b.key);
    });
    results.add(SearchResult(
      r,
      score,
      matched,
      hit,
      indexed.map((e) => e.value).toList(),
    ));
  }
  final indexed = results.asMap().entries.toList();
  indexed.sort((a, b) {
    final x = a.value;
    final y = b.value;
    if (x.matched != y.matched) return y.matched - x.matched;
    final byScore = y.score.compareTo(x.score);
    if (byScore != 0) return byScore;
    final byTitle = x.r.title.compareTo(y.r.title);
    return byTitle != 0 ? byTitle : a.key.compareTo(b.key);
  });
  return SearchOutput(toks, indexed.map((e) => e.value).toList());
}

String _escapeRegex(String s) => s.replaceAllMapped(
      RegExp(r'([.*+?^${}()|\[\]\\])'),
      (m) => '\\${m[0]}',
    );

/// Escape text and wrap query words in <mark>. Safe to put into innerHTML.
String highlight(String? text, List<String>? toks) {
  final t = text ?? '';
  if (toks == null || toks.isEmpty) return esc(t);
  final pats = toks.map((w) {
    final s = stem(w);
    final base = _escapeRegex(s.length >= 3 ? s : w);
    return base.length < 3 ? '\\b$base\\b' : base;
  }).toList()
    ..sort((a, b) => b.length.compareTo(a.length));
  final re = RegExp('(${pats.join('|')})', caseSensitive: false);
  final out = StringBuffer();
  var last = 0;
  for (final m in re.allMatches(t)) {
    final hit = m[0]!;
    if (hit.isEmpty) continue;
    out.write(esc(t.substring(last, m.start)));
    out.write('<mark>${esc(hit)}</mark>');
    last = m.end;
  }
  out.write(esc(t.substring(last)));
  return out.toString();
}

class ThreadMatch {
  ThreadMatch(this.t, this.n);
  final Thread t;
  final int n;
  Map<String, Object?> toJson() => <String, Object?>{'id': t.id, 'n': n};
}

/// Threads that contain at least one of the given resource ids, best first.
List<ThreadMatch> threadsFor(List<String> ids, List<Thread> threads) {
  final set = ids.toSet();
  final out = <ThreadMatch>[];
  for (final t in threads) {
    final n = t.steps.where((s) => set.contains(s.rid)).length;
    if (n > 0) out.add(ThreadMatch(t, n));
  }
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final byN = b.value.n.compareTo(a.value.n);
    return byN != 0 ? byN : a.key.compareTo(b.key);
  });
  return indexed.map((e) => e.value).toList();
}

class LinkSuggestion {
  LinkSuggestion(this.r, this.score);
  final Resource r;
  final double score;
  Map<String, Object?> toJson() =>
      <String, Object?>{'id': r.id, 'score': score};
}

/// Links that look related to a newly added one (shared tags, domain, title).
List<LinkSuggestion> suggestLinks(
  Resource r,
  List<Resource> resources, [
  int k = 4,
]) {
  final tags = r.tags.toSet();
  final dom = domainOf(r.url);
  final words = tokenize(r.title)
      .where((w) => w.length > 3 && !STOP.contains(w))
      .map(stem)
      .toSet();
  final out = <LinkSuggestion>[];
  for (final o in resources) {
    if (o.id == r.id || r.related.contains(o.id)) continue;
    var s = 0.0;
    for (final t in o.tags) {
      if (tags.contains(t)) s += 3;
    }
    if (dom.isNotEmpty && domainOf(o.url) == dom) s += 4;
    for (final w in tokenize(o.title)) {
      if (words.contains(stem(w))) s += 1;
    }
    if (s >= 3) out.add(LinkSuggestion(o, s));
  }
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final byScore = b.value.score.compareTo(a.value.score);
    return byScore != 0 ? byScore : a.key.compareTo(b.key);
  });
  return indexed.take(k).map((e) => e.value).toList();
}

class JobSuggestion {
  JobSuggestion(this.j, this.score);
  final Job j;
  final double score;
  Map<String, Object?> toJson() =>
      <String, Object?>{'id': j.id, 'score': score};
}

/// Sectors whose links share tags or type with a newly added link.
List<JobSuggestion> suggestJobs(
  Resource r,
  List<Job> jobs,
  Resource? Function(String id) byId, [
  int k = 3,
]) {
  final tags = r.tags.toSet();
  final out = <JobSuggestion>[];
  for (final j in jobs) {
    if (j.members.contains(r.id)) continue;
    var s = 0.0;
    for (final m in j.members) {
      final o = byId(m);
      if (o == null) continue;
      for (final t in o.tags) {
        if (tags.contains(t)) s += 1;
      }
      if (o.type == r.type) s += 0.2;
    }
    s /= math.sqrt(math.max(1, j.members.length));
    if (s > 0) out.add(JobSuggestion(j, s));
  }
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final byScore = b.value.score.compareTo(a.value.score);
    return byScore != 0 ? byScore : a.key.compareTo(b.key);
  });
  return indexed.take(k).map((e) => e.value).toList();
}
