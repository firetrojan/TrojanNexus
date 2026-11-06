// importers_formats.dart - browser bookmarks, OPML, CSV, link files and JSON lists.
// Port of the format parsers in legacy/web-src/js/importers.js.
import 'dart:convert';
import 'dart:math';

import 'importers_text.dart';
import 'search.dart';
import 'util.dart';

Object? _firstTruthy(List<Object?> values) {
  for (final v in values) {
    if (importerTruthy(v)) return v;
  }
  return values.isEmpty ? null : values.last;
}

String _cell(List<String> row, int? index) {
  if (index == null || index < 0 || index >= row.length) return '';
  return row[index];
}

// ---------- browser bookmarks ----------

/// Browser bookmarks export (Netscape format). Keeps the folder path in `folder`.
List<Map<String, Object?>> parseBookmarksHTML(String text) {
  final re = RegExp(
    r'<DL[^>]*>|</DL>|<H3([^>]*)>([\s\S]*?)</H3>|<A\s+([^>]*)>([\s\S]*?)</A>|<DD>([\s\S]*?)(?=<DT|</DL|<DD|$)',
    caseSensitive: false,
  );
  final stack = <String>[];
  String? pending;
  Map<String, Object?>? last;
  final out = <Map<String, Object?>>[];
  for (final m in re.allMatches(text)) {
    final tok = m[0]!.toUpperCase();
    if (tok.startsWith('<DL')) {
      stack.add(pending ?? '');
      pending = null;
    } else if (tok.startsWith('</DL')) {
      if (stack.isNotEmpty) stack.removeLast();
    } else if (tok.startsWith('<H3')) {
      pending = importerClean(m[2]);
    } else if (tok.startsWith('<DD')) {
      if (last != null) last['notes'] = importerClean(m[5]).substring(0, min(400, importerClean(m[5]).length));
    } else {
      final url = importerAttr(m[3] ?? '', 'href');
      if (!isHttpUrl(url)) {
        last = null;
        continue;
      }
      final filtered = stack.where((p) => p.isNotEmpty).toList();
      final path = <String>[];
      for (var i = 0; i < filtered.length; i++) {
        if (i == 0 && importerRootFolder.hasMatch(filtered[i])) continue;
        path.add(filtered[i]);
      }
      final e = <String, Object?>{
        'title': importerClean(m[4]),
        'url': url,
        'folder': path.join(' / '),
        'added': toISODate(importerAttr(m[3] ?? '', 'add_date')),
      };
      final tags = importerAttr(m[3] ?? '', 'tags');
      if (tags.isNotEmpty) e['tags'] = importerToTagList(tags);
      out.add(e);
      last = e;
      if (out.length >= importerMaxEntries) break;
    }
  }
  return out;
}

/// Firefox and Chrome bookmark trees.
List<Map<String, Object?>> parseBookmarksJSON(Map<Object?, Object?> data) {
  final out = <Map<String, Object?>>[];

  void walk(Object? node, List<String> path, int depth) {
    if (node is! Map || out.length >= importerMaxEntries) return;
    final url = _firstTruthy(<Object?>[node['uri'], node['url'], '']);
    final type = node['type'];
    if (importerTruthy(url) &&
        RegExp(r'^https?://', caseSensitive: false).hasMatch(importerStr(url)) &&
        (type == 'url' ||
            node['typeCode'] == 1 ||
            RegExp(r'moz-place$').hasMatch(importerStr(type)) ||
            importerTruthy(node['uri']))) {
      final e = <String, Object?>{
        'title': importerStr(_firstTruthy(<Object?>[node['title'], node['name'], ''])).trim(),
        'url': url,
        'folder': path.join(' / '),
        'added': toISODate(_firstTruthy(<Object?>[node['dateAdded'], node['date_added']])),
      };
      if (importerTruthy(node['tags'])) e['tags'] = importerToTagList(node['tags']);
      out.add(e);
      return;
    }
    final roots = node['roots'];
    final kids = importerTruthy(node['children'])
        ? node['children']
        : (importerTruthy(roots) && roots is Map ? roots.values.toList() : null);
    if (kids is! List) return;
    final name = importerStr(_firstTruthy(<Object?>[node['title'], node['name'], ''])).trim();
    final next = depth > 0 && name.isNotEmpty && !(depth <= 2 && importerRootFolder.hasMatch(name))
        ? <String>[...path, name]
        : path;
    for (final k in kids) {
      walk(k, next, depth + 1);
    }
  }

  final roots = data['roots'];
  if (importerTruthy(roots) && roots is Map) {
    for (final r in roots.values) {
      walk(r, <String>[], 1);
    }
  } else {
    walk(data, <String>[], 0);
  }
  return out;
}

// ---------- OPML feed lists ----------

List<Map<String, Object?>> parseOPML(String text) {
  final re = RegExp(r'<outline\b([^>]*?)(/?)>|</outline>', caseSensitive: false);
  final out = <Map<String, Object?>>[];
  final stack = <String>[];
  for (final m in re.allMatches(text)) {
    if (m[0]!.toLowerCase() == '</outline>') {
      if (stack.isNotEmpty) stack.removeLast();
      continue;
    }
    final a = m[1] ?? '';
    final xml = importerAttr(a, 'xmlUrl');
    final html = importerAttr(a, 'htmlUrl');
    final url = importerAttr(a, 'url');
    final name = decode(_firstTruthy(<Object?>[importerAttr(a, 'text'), importerAttr(a, 'title'), ''])).trim();
    final link = _firstTruthy(<Object?>[html, url, xml, '']);
    if (importerTruthy(link) && isHttpUrl(importerStr(link))) {
      final e = <String, Object?>{
        'title': name,
        'url': link,
        'type': 'feed',
        'folder': stack.where((x) => x.isNotEmpty).join(' / '),
      };
      if (xml.isNotEmpty && isHttpUrl(xml)) e['rssUrl'] = xml;
      out.add(e);
    }
    if (m[2] != '/') stack.add(importerTruthy(link) ? '' : name);
    if (out.length >= importerMaxEntries) break;
  }
  return out;
}

// ---------- link files ----------

List<Map<String, Object?>> parseShortcut(String text, [String name = '']) {
  var m = RegExp(r'^\s*URL\s*=\s*(\S+)', caseSensitive: false, multiLine: true).firstMatch(text);
  m ??= RegExp(r'<key>URL</key>\s*<string>([^<]+)</string>', caseSensitive: false).firstMatch(text);
  if (m == null || !isHttpUrl(decode(m[1]))) return <Map<String, Object?>>[];
  return <Map<String, Object?>>[
    <String, Object?>{
      'title': importerStr(name).replaceFirst(RegExp(r'\.(url|webloc)$', caseSensitive: false), '').trim(),
      'url': decode(m[1]),
    },
  ];
}

/// An HTML page that is just a list of links.
List<Map<String, Object?>> parseLinksHTML(String text) {
  final re = RegExp(r'<a\s+([^>]*)>([\s\S]*?)</a>', caseSensitive: false);
  final out = <Map<String, Object?>>[];
  for (final m in re.allMatches(text)) {
    final url = importerAttr(m[1]!, 'href');
    if (!isHttpUrl(url)) continue;
    final e = <String, Object?>{
      'title': importerClean(m[2]),
      'url': url,
      'added': toISODate(_firstTruthy(<Object?>[
        importerAttr(m[1]!, 'time_added'),
        importerAttr(m[1]!, 'add_date'),
        '',
      ])),
    };
    final tags = importerAttr(m[1]!, 'tags');
    if (tags.isNotEmpty) e['tags'] = importerToTagList(tags);
    out.add(e);
    if (out.length >= importerMaxEntries) break;
  }
  return out;
}

/// One link per line: "Title | url", "url Title", "[Title](url)" or just a url / domain.
List<Map<String, Object?>> parseUrlList(String text) {
  final out = <Map<String, Object?>>[];
  for (var raw in text.split(RegExp(r'\r?\n'))) {
    var line = raw.trim();
    if (line.isEmpty || RegExp(r'^(#|//)').hasMatch(line)) continue;
    var url = '';
    var title = '';
    final md = RegExp(r'\[([^\]]*)\]\((https?://[^)\s]+)\)', caseSensitive: false).firstMatch(line);
    if (md != null) {
      title = md[1]!;
      url = md[2]!;
    } else {
      final m = RegExp(r'''(https?://[^\s<>"'|]+)''', caseSensitive: false).firstMatch(line);
      if (m != null) {
        url = m[1]!;
        title = '${line.substring(0, m.start)} ${line.substring(m.end)}';
      } else {
        final a = RegExp(
          r'^((?:[a-z0-9-]+\.)+[a-z]{2,24}(?:/\S*)?)(?:\s+(.*))?$',
          caseSensitive: false,
        ).firstMatch(line);
        final b = RegExp(
          r'^(.*?)\s*[|,:–—-]\s*((?:[a-z0-9-]+\.)+[a-z]{2,24}(?:/\S*)?)$',
          caseSensitive: false,
        ).firstMatch(line);
        if (a != null) {
          url = 'https://${a[1]}';
          title = a[2] ?? '';
        } else if (b != null) {
          url = 'https://${b[2]}';
          title = b[1]!;
        } else {
          continue;
        }
      }
    }
    url = url.replaceFirst(RegExp(r'[),.;]+$'), '');
    title = title
        .replaceFirst(RegExp(r'^[\s|,;:–—-]+'), '')
        .replaceFirst(RegExp(r'[\s|,;:–—-]+$'), '')
        .replaceAll(RegExp(r'[<>"]'), '')
        .trim();
    if (isHttpUrl(url)) out.add(<String, Object?>{'title': title, 'url': url});
    if (out.length >= importerMaxEntries) break;
  }
  return out;
}

/// JSON array of strings (urls) or objects with a link.
List<Map<String, Object?>> parseJSONArray(Object? input) {
  final data = input is String ? jsonDecode(input) : input;
  if (data is! List) throw StateError('JSON must be an array');
  final out = <Map<String, Object?>>[];
  for (final x in data) {
    if (x is String) {
      final s = x.trim();
      if (isHttpUrl(s)) out.add(<String, Object?>{'title': '', 'url': s});
      continue;
    }
    if (x is Map) {
      final url = _firstTruthy(<Object?>[x['url'], x['href'], x['link'], x['uri'], '']);
      final description = x['description'];
      final descriptionTitle = description is String &&
          description.length < 160 &&
          !RegExp(r'^https?:').hasMatch(description);
      final title = _firstTruthy(<Object?>[
        x['title'],
        x['name'],
        descriptionTitle ? description : '',
        '',
      ]);
      final e = <String, Object?>{};
      for (final entry in x.entries) {
        if (entry.key is String) e[entry.key as String] = entry.value;
      }
      e['title'] = title;
      e['url'] = url;
      if (x['tags'] is String) e['tags'] = importerToTagList(x['tags']);
      if (!importerTruthy(e['notes']) && (importerTruthy(x['extended']) || importerTruthy(x['note']))) {
        final notes = importerStr(_firstTruthy(<Object?>[x['extended'], x['note'], '']));
        e['notes'] = notes.substring(0, min(400, notes.length));
      }
      if (!importerTruthy(e['added']) &&
          (importerTruthy(x['time']) || importerTruthy(x['created']) || importerTruthy(x['date']))) {
        e['added'] = toISODate(_firstTruthy(<Object?>[x['time'], x['created'], x['date']]));
      }
      if (importerTruthy(url)) out.add(e);
    }
  }
  return out.take(importerMaxEntries).toList();
}

// ---------- guessing type and tags ----------

final RegExp _toolWords = RegExp(r'\b(tool|tools|convert|converter|generator|editor|maker|downloader|checker|finder|calculator|optimizer|translator|compressor|extractor|viewer|builder|planner|tracker|app|apps|map|maps|cyberchef|toolkit)\b');
final RegExp _catWords = RegExp(r'\b(awesome|catalog|catalogue|directory|index|collection|database|archive|library|list of|roadmaps?)\b');
const Set<String> _generic = <String>{
  'home', 'homepage', 'official', 'welcome', 'free', 'online', 'website', 'page',
  'google', 'site', 'with', 'from', 'your', 'that', 'this', 'what', 'best', 'more',
};
const Map<String, String> _tldTag = <String, String>{
  'edu': 'education', 'gov': 'government', 'ac': 'academic', 'ai': 'ai', 'in': 'india', 'uk': 'uk',
};

String inferType(String url, [String title = '']) {
  final host = domainOf(url);
  final t = title.toLowerCase();
  var path = '';
  try {
    final u = Uri.parse(url);
    if (u.hasScheme) path = u.path.toLowerCase();
  } catch (_) {}
  if (RegExp(r'(^|\.)(youtube\.com|youtu\.be)$').hasMatch(host)) return 'youtube-channel';
  if (RegExp(r'(^|[/._-])(rss|feed|atom)([/._-]|$)|\.xml$').hasMatch('$host$path')) return 'feed';
  if (RegExp(r'^docs\.|(^|\.)readthedocs\.io$|^/docs?(/|$)').hasMatch('$host|') ||
      RegExp(r'^/docs?(/|$)').hasMatch(path) ||
      RegExp(r'\bdocumentation\b').hasMatch(t)) {
    return 'docs';
  }
  if (_catWords.hasMatch(t)) return 'catalogue';
  if (_toolWords.hasMatch(t)) return 'web-tool';
  return 'article-site';
}

List<String> inferTags(String url, [String title = '']) {
  final tags = <String>[];
  final parts = domainOf(url).split('.');
  final core = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  if (core.length > 2 && !<String>['com', 'org', 'net', 'co', 'gov', 'edu'].contains(core)) tags.add(core);
  final tld = parts[parts.length - 1];
  if (_tldTag[tld] != null) tags.add(_tldTag[tld]!);
  for (final w in tokenize(title)) {
    if (w.length >= 4 && !_generic.contains(w) && !RegExp(r'^\d+$').hasMatch(w) && !RegExp(r'^https?').hasMatch(w)) tags.add(w);
  }
  return uniq(tags.map((x) => x.toLowerCase())).take(6).toList();
}

/// Entry -> resource fields. Imported items are drafts so the user can review them.
Map<String, Object?> entryToResource(Map<String, Object?> e) {
  final url = e['url'] ?? '';
  final title = e['title'] ?? '';
  final out = <String, Object?>{};
  for (final entry in e.entries) {
    out[entry.key] = entry.value;
  }
  out['title'] = title;
  out['url'] = url;
  out['type'] = importerTruthy(e['type']) ? e['type'] : inferType(importerStr(url), importerStr(title));
  final tags = e['tags'];
  final hasTags = importerTruthy(tags) && (tags is! List || tags.isNotEmpty);
  out['tags'] = hasTags ? tags : inferTags(importerStr(url), importerStr(title));
  out['draft'] = e.containsKey('draft') ? e['draft'] : true;
  out['src'] = importerTruthy(e['src']) ? e['src'] : 'import';
  out['research'] = importerTruthy(e['research']) ? e['research'] : 'title-only';
  return out;
}
