// pageparse.dart - read what a page says about itself. Port of legacy/web-src/js/pageparse.js.
// Pure text work; fetched text is never put into the app as HTML.
import 'dart:convert';

import 'importers_text.dart' show decode, importerTruthy;

const int _maxHtml = 600000;

String _text(Object? value) => value == null ? '' : value.toString();

String _squash(Object? value) => decode(_text(value).replaceAll(RegExp(r'<[^>]*>'), ' ')).replaceAll(RegExp(r'\s+'), ' ').trim();

String _attrOf(String tag, String name) {
  final m = RegExp(
    '\\b$name\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))',
    caseSensitive: false,
  ).firstMatch(tag);
  if (m == null) return '';
  final raw = m[1] ?? m[2] ?? m[3] ?? '';
  return decode(raw);
}

String _abs(Object? href, Object? base) {
  try {
    final b = Uri.parse(_text(base));
    if (!b.hasScheme) return '';
    return b.resolve(_text(href)).toString();
  } catch (_) {
    return '';
  }
}

final List<(RegExp, String)> _walls = <(RegExp, String)>[
  (RegExp(r'just a moment|attention required|checking your browser|verify you are (a )?human|are you a robot|captcha|access denied|request blocked|unusual traffic', caseSensitive: false), 'bot'),
  (RegExp(r'log ?in to|sign ?in to|log in or sign up|create an account to|login\s*[•|·-]\s*instagram|you must be logged in|sign up to see|join to view', caseSensitive: false), 'login'),
  (RegExp(r'enable javascript|javascript is (disabled|required)|please turn on javascript', caseSensitive: false), 'js'),
];

/// 'bot' | 'login' | 'js' when the text is a wall, not the real page.
String wallKind(Object? title, Object? text) {
  final t = '${_text(title)} ${_text(text).length > 500 ? _text(text).substring(0, 500) : _text(text)}';
  if (_text(text).length > 1800) return '';
  for (final wall in _walls) {
    if (wall.$1.hasMatch(t)) return wall.$2;
  }
  return '';
}

final RegExp _keywordBad = RegExp(r'[^\p{L}\p{N}+#.-]', unicode: true);

/// Comma / pipe / newline list of keywords -> short lower-case tags.
List<String> cleanKeywords(Object? v) {
  final list = v is List ? v : _text(v).split(RegExp(r'[,;|\n]'));
  final out = <String>[];
  for (final x in list) {
    final k = _text(x)
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '-')
        .replaceAll(_keywordBad, '');
    if (k.length >= 2 && k.length <= 24 && !out.contains(k)) out.add(k);
  }
  return out.take(8).toList();
}

/// Drop " | Site name" and " - Site name" endings when a real title remains.
String tidyTitle(Object? t, Object? site) {
  var s = _squash(t);
  if (s.isEmpty) return '';
  final parts = s.split(RegExp(r'\s+[|·•–—-]\s+'));
  if (parts.length > 1) {
    final sn = _text(site).toLowerCase();
    final last = parts.last.toLowerCase();
    final first = parts.first;
    if ((sn.isNotEmpty && (last.contains(sn) || sn.contains(last))) ||
        (last.split(' ').length <= 3 && first.length >= 12)) {
      s = parts.sublist(0, parts.length - 1).join(' - ');
    }
  }
  return s.length > 140 ? s.substring(0, 140) : s;
}

/// Parse an HTML string into the fields Nexus keeps.
Map<String, Object?> parseHTML(Object? html, [String url = '']) {
  final raw = _text(html).length > _maxHtml ? _text(html).substring(0, _maxHtml) : _text(html);
  final meta = <String, String>{};
  for (final m in RegExp(r'<meta\b[^>]*>', caseSensitive: false).allMatches(raw)) {
    final tag = m[0]!;
    final key = _firstText(<Object?>[_attrOf(tag, 'property'), _attrOf(tag, 'name'), _attrOf(tag, 'itemprop'), _attrOf(tag, 'http-equiv')]).toLowerCase();
    final c = _attrOf(tag, 'content');
    if (key.isNotEmpty && c.isNotEmpty && !meta.containsKey(key)) meta[key] = c;
  }
  final tm = RegExp(r'<title[^>]*>([\s\S]*?)</title>', caseSensitive: false).firstMatch(raw);
  final htmlTag = RegExp(r'<html\b[^>]*>', caseSensitive: false).firstMatch(raw);
  final rss = <String>[];
  for (final m in RegExp(r'<link\b[^>]*>', caseSensitive: false).allMatches(raw)) {
    final t = m[0]!;
    if (RegExp(r'alternate', caseSensitive: false).hasMatch(_attrOf(t, 'rel')) &&
        RegExp(r'(rss|atom)\+xml', caseSensitive: false).hasMatch(_attrOf(t, 'type'))) {
      final u = _abs(_attrOf(t, 'href'), url);
      if (u.isNotEmpty && !rss.contains(u)) rss.add(u);
    }
  }
  var canon = '';
  for (final m in RegExp(r'<link\b[^>]*>', caseSensitive: false).allMatches(raw)) {
    if (RegExp(r'canonical', caseSensitive: false).hasMatch(_attrOf(m[0]!, 'rel'))) {
      canon = _abs(_attrOf(m[0]!, 'href'), url);
      break;
    }
  }
  final ld = <Map>[];
  for (final m in RegExp(r'<script\b[^>]*application/ld\+json[^>]*>([\s\S]*?)</script>', caseSensitive: false).allMatches(raw)) {
    try {
      final j = jsonDecode(m[1]!.trim());
      final items = j is List ? j : ((j is Map && j['@graph'] is List) ? j['@graph'] as List : <Object?>[j]);
      for (final x in items) {
        if (x is Map) ld.add(x);
      }
    } catch (_) {}
  }
  final bodyMatch = RegExp(r'<body\b[\s\S]*</body>', caseSensitive: false).firstMatch(raw);
  final body = bodyMatch?[0] ?? raw;
  final pickMatch = RegExp(r'<(main|article)\b[\s\S]*?</\1>', caseSensitive: false).firstMatch(body);
  final pick = pickMatch?[0] ?? body;
  final stripped = pick
      .replaceAll(RegExp(r'<(script|style|noscript|svg|template|iframe|nav|footer|form)\b[\s\S]*?</\1>', caseSensitive: false), ' ')
      .replaceAll(RegExp(r'<!--[\s\S]*?-->'), ' ');
  final headings = <String>[];
  for (final m in RegExp(r'<h([1-3])\b[^>]*>([\s\S]*?)</h\1>', caseSensitive: false).allMatches(stripped)) {
    final t = _squash(m[2]);
    if (t.length > 2 && t.length < 140 && !headings.contains(t)) headings.add(t);
    if (headings.length >= 8) break;
  }
  final text = _squash(stripped);
  final org = ld.where((x) => RegExp(r'Organization|WebSite|Person|Blog|Course|SoftwareApplication|WebApplication|Product|Article', caseSensitive: false).hasMatch(_text(x['@type']))).firstOrNull;
  final langTag = htmlTag == null ? '' : (htmlTag[0] ?? '');
  final description = _squash(_firstText(<Object?>[
    meta['og:description'],
    meta['description'],
    meta['twitter:description'],
    org?['description'],
    '',
  ]));
  final page = <String, Object?>{
    'title': _squash(tm?[1]),
    'ogTitle': _squash(_firstText(<Object?>[meta['og:title'], meta['twitter:title'], ''])),
    'site': _squash(_firstText(<Object?>[meta['og:site_name'], meta['application-name'], ''])),
    'description': description.length > 500 ? description.substring(0, 500) : description,
    'ogType': meta['og:type'] ?? '',
    'lang': langTag.isNotEmpty ? _attrOf(langTag, 'lang') : (meta['og:locale'] ?? ''),
    'keywords': cleanKeywords(_firstText(<Object?>[meta['keywords'], meta['news_keywords'], org?['keywords'], ''])),
    'headings': headings,
    'text': text.length > 5000 ? text.substring(0, 5000) : text,
    'rss': rss.take(3).toList(),
    'canonical': canon,
    'ldType': org == null ? '' : (org['@type'] is List ? (org['@type'] as List).join(',') : _text(org['@type'])),
    'author': _squash(_firstText(<Object?>[meta['author'], meta['article:author'], ''])),
  };
  page['wall'] = wallKind(page['title'], page['text']);
  return page;
}

String _firstText(List<Object?> values) {
  for (final v in values) {
    final s = _text(v);
    if (s.isNotEmpty) return s;
  }
  return '';
}

Map<String, Object?> _fromMarkdown(String md) {
  final headings = <String>[];
  for (final m in RegExp(r'^\s{0,3}#{1,3}\s+(.+)$', multiLine: true).allMatches(md)) {
    final t = _squash(m[1]!.replaceAll(RegExp(r'[*_`\[\]()]'), ''));
    if (t.isNotEmpty && t.length < 140 && !headings.contains(t)) headings.add(t);
    if (headings.length >= 8) break;
  }
  var text = md
      .replaceAll(RegExp(r'!\[[^\]]*\]\([^)]*\)'), ' ')
      .replaceAllMapped(RegExp(r'\[([^\]]*)\]\([^)]*\)'), (m) => m[1]!)
      .replaceAll(RegExp(r'https?://\S+'), ' ')
      .replaceAll(RegExp(r'^\s{0,3}#{1,6}\s+', multiLine: true), '')
      .replaceAll(RegExp(r'[*_`>|~]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (text.length > 5000) text = text.substring(0, 5000);
  return <String, Object?>{'headings': headings, 'text': text};
}

/// Reader service output: JSON, a Title/Markdown block, or HTML.
Map<String, Object?> parseReader(Object? body, [String url = '']) {
  final t = _text(body).trim();
  if (t.isEmpty) return <String, Object?>{'empty': true};
  Map? j;
  if (t[0] == '{') {
    try {
      final x = jsonDecode(t);
      if (x is Map) j = x;
    } catch (_) {
      j = null;
    }
  }
  if (j != null) {
    final d = j['data'] is Map ? j['data'] as Map : j;
    final code = j['code'];
    if (code is num && code >= 400 && !importerTruthy(d['content'])) {
      return <String, Object?>{
        'error': <String, Object?>{
          'code': code,
          'msg': _firstText(<Object?>[j['message'], j['readableMessage'], j['name'], '']),
        },
      };
    }
    final md = _fromMarkdown(_text(d['content']));
    final p = <String, Object?>{
      'title': _squash(d['title']),
      'ogTitle': '',
      'site': '',
      'description': _squash(d['description']).length > 500 ? _squash(d['description']).substring(0, 500) : _squash(d['description']),
      'ogType': '',
      'lang': '',
      'keywords': <String>[],
      'headings': md['headings'],
      'text': md['text'],
      'rss': <String>[],
      'canonical': _text(d['url']),
      'ldType': '',
      'author': '',
    };
    p['wall'] = wallKind(p['title'], p['text']);
    return p;
  }
  final head = RegExp(r'^Title:\s*(.*)$', multiLine: true).firstMatch(t);
  final first2000 = t.length > 2000 ? t.substring(0, 2000) : t;
  if (head != null && RegExp(r'Markdown Content:|URL Source:').hasMatch(first2000)) {
    final warn = RegExp(r'^Warning:\s*Target URL returned error (\d{3})[:\s]*(.*)$', multiLine: true).firstMatch(t);
    final src = RegExp(r'^URL Source:\s*(\S+)', multiLine: true).firstMatch(t);
    final pos = t.indexOf('Markdown Content:');
    final md = _fromMarkdown(pos >= 0 ? t.substring(pos + 17) : t);
    final p = <String, Object?>{
      'title': _squash(head[1]),
      'ogTitle': '',
      'site': '',
      'description': '',
      'ogType': '',
      'lang': '',
      'keywords': <String>[],
      'headings': md['headings'],
      'text': md['text'],
      'rss': <String>[],
      'canonical': src?[1] ?? '',
      'ldType': '',
      'author': '',
    };
    if (warn != null) p['targetError'] = <String, Object?>{'code': int.parse(warn[1]!), 'msg': warn[2]};
    p['wall'] = wallKind(p['title'], p['text']);
    return p;
  }
  final first3000 = t.length > 3000 ? t.substring(0, 3000) : t;
  if (RegExp(r'<(html|head|body|title|meta|div|p)\b', caseSensitive: false).hasMatch(first3000)) {
    return parseHTML(t, url);
  }
  final md = _fromMarkdown(t);
  final p = <String, Object?>{
    'title': '',
    'ogTitle': '',
    'site': '',
    'description': '',
    'ogType': '',
    'lang': '',
    'keywords': <String>[],
    'headings': md['headings'],
    'text': md['text'],
    'rss': <String>[],
    'canonical': '',
    'ldType': '',
    'author': '',
  };
  p['wall'] = wallKind('', p['text']);
  return p;
}

/// Instagram profile: name, bio and counts from the page description.
Map<String, Object?> parseInstagramPage(Map<String, Object?> page, [String handle = '']) {
  final out = <String, Object?>{
    'handle': handle,
    'name': '',
    'bio': '',
    'followers': '',
    'following': '',
    'posts': '',
    'private': false,
    'shown': false,
  };
  final src = <Object?>[page['description'], page['ogTitle'], page['title'], page['text']]
      .map(_text)
      .where((x) => x.isNotEmpty)
      .join(' \n ');
  final counts = RegExp(r'([\d.,]+[KMkm]?)\s+Followers?,\s*([\d.,]+[KMkm]?)\s+Following,\s*([\d.,]+[KMkm]?)\s+Posts?', caseSensitive: false).firstMatch(src);
  if (counts != null) {
    out['followers'] = counts[1];
    out['following'] = counts[2];
    out['posts'] = counts[3];
  }
  final nm1 = RegExp(r'(?:from|-)\s+([^()@\n]{2,60}?)\s*\(@([A-Za-z0-9._]+)\)', caseSensitive: false).firstMatch(src);
  final nm2 = RegExp(r'^([^()\n]{2,60}?)\s*\(@([A-Za-z0-9._]+)\)').firstMatch(_firstText(<Object?>[page['ogTitle'], page['title'], '']));
  final nm = nm1 ?? nm2;
  if (nm != null && (handle.isEmpty || nm[2]!.toLowerCase() == handle.toLowerCase())) {
    out['name'] = nm[1]!.trim().replaceFirst(RegExp(r'^See Instagram photos and videos from\s*', caseSensitive: false), '');
  }
  final bio = RegExp(r'on Instagram:\s*["“]([\s\S]{2,500}?)["”]\s*$', caseSensitive: false).firstMatch(_text(page['description']).trim());
  if (bio != null) {
    out['bio'] = bio[1]!.replaceAll(RegExp(r'\s+'), ' ').trim();
    out['shown'] = true;
  }
  if (RegExp(r'this account is private', caseSensitive: false).hasMatch(src)) out['private'] = true;
  return out;
}

/// GitHub API JSON -> page-like object.
Map<String, Object?>? parseGithub(Object? j) {
  if (j is! Map || importerTruthy(j['message'])) return null;
  final topics = j['topics'] is List ? (j['topics'] as List).cast<Object?>() : <Object?>[];
  final desc = _firstText(<Object?>[j['description'], j['bio'], '']);
  final textParts = <Object?>[desc, j['homepage'], j['company'], j['blog']].map(_text).where((x) => x.isNotEmpty).join(' . ');
  final owner = j['owner'];
  return <String, Object?>{
    'title': _firstText(<Object?>[j['full_name'], j['name'], j['login'], '']),
    'ogTitle': '',
    'site': 'GitHub',
    'description': _squash(desc),
    'ogType': importerTruthy(j['full_name']) ? 'repo' : 'profile',
    'lang': '',
    'keywords': cleanKeywords(topics + (importerTruthy(j['language']) ? <Object?>[j['language']] : <Object?>[])),
    'headings': <String>[],
    'text': _squash(textParts),
    'rss': <String>[],
    'canonical': _text(j['html_url']),
    'ldType': '',
    'author': owner is Map ? _text(owner['login']) : '',
    'archived': j['archived'] == true,
    'wall': '',
  };
}

/// Wikipedia REST summary -> page-like object.
Map<String, Object?>? parseWikipedia(Object? j) {
  if (j is! Map || !importerTruthy(j['title']) || j['type'] == 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return null;
  final desc = _squash(j['description']);
  final extract = _squash(j['extract']);
  return <String, Object?>{
    'title': _squash(j['title']),
    'ogTitle': '',
    'site': 'Wikipedia',
    'description': desc.length > 300 ? desc.substring(0, 300) : desc,
    'ogType': 'article',
    'lang': _text(j['lang']),
    'keywords': <String>[],
    'headings': <String>[],
    'text': extract.length > 3000 ? extract.substring(0, 3000) : extract,
    'rss': <String>[],
    'canonical': '',
    'ldType': '',
    'author': '',
    'wall': '',
  };
}
