// topics.dart - "what is this about?" guesser. Port of legacy/web-src/js/topics.js.
// It only scores words the owner gave it, and says "not clear" when the words do not say.
import 'dart:math';

import 'search.dart';
import 'topics_data.dart';

class TopicWord {
  TopicWord(this.text, this.w);

  final String text;
  final double w;
}

class Topic {
  Topic(this.id, this.label, this.use, this.cap, this.words);

  final String id;
  final String label;
  final String use;
  final String cap;
  final List<TopicWord> words;
}

List<Topic> _parseTopics() {
  final out = <Topic>[];
  for (final line in topicRaw.trim().split('\n')) {
    final p = line.split('|');
    if (p.length < 5) continue;
    final words = <TopicWord>[];
    for (final raw in p[4].trim().split(RegExp(r'\s+'))) {
      final bits = raw.split(':');
      final w = bits.length > 1 ? (double.tryParse(bits[1]) ?? 1.0) : 1.0;
      words.add(TopicWord(bits[0].replaceAll('_', ' '), w));
    }
    out.add(Topic(p[0], p[1], p[2], p[3], words));
  }
  return out;
}

final List<Topic> TOPICS = _parseTopics();
final Map<String, Topic> topicById = <String, Topic>{for (final t in TOPICS) t.id: t};

const Map<String, String> BASIS_LABEL = <String, String>{
  'bio': 'the bio or description',
  'page': 'the page text',
  'name': 'the name only',
  'link': 'the link only',
  'none': '',
};

class _Hit {
  _Hit(this.t, this.w, this.word);

  final String t;
  final double w;
  final String word;
}

class _Entry {
  _Entry();

  double score = 0;
  final Set<String> words = <String>{};
}

final Map<String, List<_Hit>> _word = <String, List<_Hit>>{};
final List<_Phrase> _phrase = <_Phrase>[];
final List<_Long> _long = <_Long>[];

class _Phrase {
  _Phrase(this.t, this.w, this.text);

  final String t;
  final double w;
  final String text;
}

class _Long {
  _Long(this.t, this.w, this.text, this.s);

  final String t;
  final double w;
  final String text;
  final String s;
}

const Set<String> _shortOk = <String>{
  'edu', 'uni', 'mit', 'iit', 'iim', 'ai', 'ml', 'ui', 'ux', 'ev', 'dj', 'cv',
  'f1', 'tv', 'dr', 'fc', '3d', 'ps5', 'gym', 'art', 'diy', 'dog', 'cat', 'car',
  'sat', 'gre', 'ipl', 'nba', 'nfl', 'bbc', 'cnn', 'esa', 'ngo', 'rti', 'sip',
  'cgi', 'vfx', 'api', 'mma', 'ufc', 'god', 'law', 'job', 'tax', 'sea',
};

bool _init = false;

void _buildIndex() {
  if (_init) return;
  _init = true;
  for (final t in TOPICS) {
    for (final w in t.words) {
      if (w.text.contains(' ')) {
        _phrase.add(_Phrase(t.id, w.w, w.text));
        continue;
      }
      final s = stem(w.text);
      (_word[s] ??= <_Hit>[]).add(_Hit(t.id, w.w, w.text));
      if (w.text.length >= 4) _long.add(_Long(t.id, w.w, w.text, s));
    }
  }
}

String _text(Object? value) => value == null ? '' : value.toString();

String _clean(Object? value) => _text(value).replaceAll(RegExp(r'\s+'), ' ').trim();

({String raw, List<String> parts}) _handleParts(Object? handle) {
  final raw = _text(handle).toLowerCase().replaceFirst(RegExp(r'^@'), '');
  final parts = raw.split(RegExp(r'[._\-\d]+')).where((x) => x.length > 1).toList();
  return (raw: raw, parts: parts);
}

void _scoreText(Object? text, double weight, Map<String, _Entry> acc, {int max = 6000}) {
  final value = _text(text);
  if (value.isEmpty) return;
  _buildIndex();
  final limit = max <= 0 ? 6000 : max;
  final toks = tokenize(value.length > limit ? value.substring(0, limit) : value);
  final seen = <String, int>{};
  for (final tk in toks) {
    final s = stem(tk);
    seen[s] = (seen[s] ?? 0) + 1;
    if (tk != s) seen[tk] = (seen[tk] ?? 0) + 1;
  }
  void add(String t, double w, String word, int count) {
    final e = acc[t] ?? _Entry();
    acc[t] = e;
    if (e.words.contains(word)) return;
    e.words.add(word);
    e.score += weight * w * min(1 + 0.35 * (count - 1), 1.7);
  }

  seen.forEach((s, count) {
    final hit = _word[s];
    if (hit != null) {
      for (final x in hit) {
        add(x.t, x.w, x.word, count);
      }
    }
  });
  if (_phrase.isNotEmpty) {
    final flat = ' ${toks.join(' ')} ';
    for (final p in _phrase) {
      if (flat.contains(' ${p.text} ')) add(p.t, p.w, p.text, 1);
    }
  }
}

class _Match {
  _Match(this.t, this.w, this.word, this.a, this.b, this.order);

  final String t;
  final double w;
  final String word;
  final int a;
  final int b;
  final int order;
}

String _scoreHandle(Object? handle, double weight, Map<String, _Entry> acc) {
  _buildIndex();
  final hp = _handleParts(handle);
  void add(String t, double w, String word) {
    final e = acc[t] ?? _Entry();
    acc[t] = e;
    if (e.words.contains(word)) return;
    e.words.add(word);
    e.score += weight * w;
  }

  for (final part in hp.parts) {
    final s = stem(part);
    final hit = _word[s] ?? _word[part];
    if (hit != null && (part.length >= 3 || _shortOk.contains(part))) {
      for (final x in hit) {
        add(x.t, x.w, x.word);
      }
      continue;
    }
    final found = <_Match>[];
    for (final l in _long) {
      final needles = l.s != l.text && l.s.length >= 5 ? <String>[l.text, l.s] : <String>[l.text];
      for (final needle in needles) {
        final i = part.indexOf(needle);
        if (i < 0 || part == needle) continue;
        final atStart = i == 0;
        final atEnd = i + needle.length == part.length;
        final n = needle.length;
        final f = n >= 6 ? 1.0 : (atStart || atEnd ? (n >= 5 ? 0.8 : 0.7) : 0.0);
        if (f > 0) {
          found.add(_Match(l.t, l.w * f, l.text, i, i + n, found.length));
          break;
        }
      }
    }
    found.sort((x, y) {
      final d = (y.b - y.a) - (x.b - x.a);
      return d != 0 ? d : x.order - y.order;
    });
    final kept = <_Match>[];
    for (final m in found) {
      if (!kept.any((k) => k.word != m.word && k.a <= m.a && k.b >= m.b)) kept.add(m);
    }
    for (final m in kept) {
      add(m.t, m.w, m.word);
    }
  }
  return hp.raw;
}

String _urlWords(Object? url) {
  try {
    final u = Uri.parse(_text(url));
    if (u.host.isEmpty) return '';
    final host = u.host.replaceFirst(RegExp(r'^www\.'), '').replaceFirst(RegExp(r'\.[a-z]{2,}$', caseSensitive: false), '');
    var path = u.path;
    try {
      path = Uri.decodeComponent(path);
    } catch (_) {}
    return '$host ${path.replaceAll(RegExp(r'[/_\-.+]+'), ' ')}'.trim();
  } catch (_) {
    return '';
  }
}

/// Guess up to three topics from the fields the owner has.
Map<String, Object?> guessTopic([Map<String, Object?> inp = const <String, Object?>{}]) {
  _buildIndex();
  final acc = <String, _Entry>{};
  final src = <String, Map<String, _Entry>>{};

  void run(String key, double weight, void Function(Map<String, _Entry>) fn) {
    final m = <String, _Entry>{};
    fn(m);
    src[key] = m;
    m.forEach((t, e) {
      final a = acc[t] ?? _Entry();
      acc[t] = a;
      a.score += e.score;
      a.words.addAll(e.words);
    });
  }

  final bioish = _clean(<Object?>[inp['bio'], inp['desc']].where((x) => _text(x).isNotEmpty).join(' . '));
  run('bio', 3, (m) => _scoreText(bioish, 3, m));
  run('title', 2.5, (m) => _scoreText(_clean(_text(inp['title']).isNotEmpty ? inp['title'] : inp['name']), 2.5, m));
  final keywords = inp['keywords'];
  run('keywords', 2.5, (m) => _scoreText(keywords is List ? keywords.join(' . ') : _clean(keywords), 2.5, m));
  final headings = inp['headings'];
  run('headings', 2, (m) => _scoreText(headings is List ? headings.join(' . ') : _clean(headings), 2, m));
  run('text', 1, (m) => _scoreText(_clean(inp['text']), 1, m, max: 5000));
  final tags = inp['tags'];
  final tagList = tags is List ? tags : const <Object?>[];
  run('tags', 1.8, (m) => _scoreText(
        tagList
            .map(_text)
            .where((t) => !RegExp(r'^(instagram|following|youtube|feed|import)$').hasMatch(t))
            .join(' . '),
        1.8,
        m,
      ));
  run('link', 1.2, (m) => _scoreText(_urlWords(inp['url']), 1.2, m));
  run('handle', 2, (m) {
    if (_text(inp['handle']).isNotEmpty) {
      _scoreHandle(inp['handle'], 2, m);
      _scoreText(_text(inp['handle']).replaceAll(RegExp(r'[._]+'), ' '), 0, m);
    }
  });

  final ranked = acc.entries.map((e) {
    final t = topicById[e.key]!;
    return <String, Object?>{
      'id': t.id,
      'label': t.label,
      'score': (e.value.score * 100).round() / 100,
      'words': e.value.words.take(6).toList(),
    };
  }).toList();
  var order = 0;
  final ordered = <MapEntry<int, Map<String, Object?>>>[];
  for (final r in ranked) {
    ordered.add(MapEntry(order++, r));
  }
  ordered.sort((a, b) {
    final x = (a.value['score'] as num).toDouble();
    final y = (b.value['score'] as num).toDouble();
    final d = y.compareTo(x);
    return d != 0 ? d : a.key - b.key;
  });
  final sorted = ordered.map((e) => e.value).toList();
  final top = sorted.isEmpty ? null : sorted[0];
  final second = sorted.length > 1 ? sorted[1] : null;

  var basis = 'none';
  if (top != null) {
    final id = top['id'] as String;
    double from(String k) => src[k]?[id]?.score ?? 0;
    final hasBody = _text(inp['bio']).isNotEmpty || _text(inp['desc']).isNotEmpty || _text(inp['text']).isNotEmpty;
    final strong = from('bio') + from('keywords') + from('headings') + from('text') + from('title') * (hasBody ? 1 : 0);
    final nameish = from('handle') + ((_text(inp['handle']).isNotEmpty || _text(inp['text']).isEmpty) ? from('title') : 0);
    if (strong >= max(1.5, nameish * 0.8)) {
      basis = from('bio') >= from('text') ? 'bio' : 'page';
    } else if (nameish >= 1.5) {
      basis = 'name';
    } else {
      basis = from('link') > 0 ? 'link' : 'name';
    }
  }
  final nameOnly = basis == 'name' || basis == 'link';
  var conf = 'none';
  if (top != null) {
    final topScore = (top['score'] as num).toDouble();
    final secondScore = second == null ? 0.0 : (second['score'] as num).toDouble();
    final clearScore = nameOnly ? 99.0 : 5.0;
    final maybeScore = nameOnly ? 1.5 : 2.6;
    if (topScore >= clearScore && (second == null || secondScore <= topScore * 0.65)) {
      conf = 'clear';
    } else if (topScore >= maybeScore) {
      conf = 'maybe';
    }
  }
  if (conf == 'none') {
    return <String, Object?>{'top': null, 'second': null, 'conf': conf, 'basis': 'none', 'words': <String>[], 'ranked': sorted.take(3).toList()};
  }
  final topScore = (top!['score'] as num).toDouble();
  final secondScore = second == null ? 0.0 : (second['score'] as num).toDouble();
  final sec = second != null && secondScore >= topScore * 0.6 && secondScore >= (nameOnly ? 1.5 : 2.2) ? second : null;
  return <String, Object?>{
    'top': top,
    'second': sec,
    'conf': conf,
    'basis': basis,
    'words': top['words'],
    'ranked': sorted.take(3).toList(),
  };
}

String _basisText(String basis, Object? kind) =>
    basis == 'name' && kind == 'site' ? 'the title and link only' : (BASIS_LABEL[basis] ?? '');

/// One plain sentence about a guess.
String describeGuess(Map<String, Object?>? g, [Map<String, Object?> ctx = const <String, Object?>{}]) {
  if (g == null || g['conf'] == 'none') {
    return ctx['read'] == true
        ? 'Not clear. What was read does not say what it is about.'
        : 'Not clear from the ${_text(ctx['handle']).isNotEmpty ? 'name' : 'title'} alone. A bio or the page itself would be needed.';
  }
  final top = g['top'] as Map?;
  final second = g['second'] as Map?;
  final topics = second != null ? '${top?['label']} and ${second['label']}' : _text(top?['label']);
  final words = (g['words'] as List?) ?? const <Object?>[];
  return '${g['conf'] == 'clear' ? '' : 'Probably '}$topics (from ${_basisText(_text(g['basis']), ctx['kind'])}${words.isNotEmpty ? ': ${words.take(4).join(', ')}' : ''}).';
}

/// Tags, use-when and can-do lines for a guess.
Map<String, Object?> guessFields(Map<String, Object?>? g, [Map<String, Object?> ctx = const <String, Object?>{}]) {
  if (g == null || g['conf'] == 'none' || g['top'] == null) {
    return <String, Object?>{'tags': <String>[], 'useWhen': <String>[], 'capabilities': <String>[]};
  }
  final top = g['top'] as Map;
  final second = g['second'] as Map?;
  final ts = <Map>[top, if (second != null) second];
  final kind = ctx['kind'] == 'account' ? 'account' : 'site';
  return <String, Object?>{
    'tags': ts.map((t) => t['id'] == 'maths' ? 'maths' : t['id']).toList(),
    'useWhen': ts.take(2).map((t) => topicById[_text(t['id'])]?.use ?? '').toList(),
    'capabilities': ts.take(1).map((t) {
      final topic = topicById[_text(t['id'])];
      final base = topic?.cap ?? '';
      return kind == 'account' && g['basis'] == 'name' ? '$base (guessed from the name)' : base;
    }).toList(),
  };
}
