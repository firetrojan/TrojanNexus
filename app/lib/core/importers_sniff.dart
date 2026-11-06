// importers_sniff.dart - recognise pasted text, read one source and parse anything.
// Port of the bottom of legacy/web-src/js/importers.js.
import 'dart:convert';
import 'dart:math';

import 'importers_csv.dart';
import 'importers_formats.dart';
import 'importers_instagram.dart';
import 'importers_text.dart';

const Map<String, String> igListNames = <String, String>{
  'followers': 'followers',
  'following': 'following',
  'blocked': 'blocked profiles',
  'close': 'close friends',
  'unfollowed': 'recently unfollowed profiles',
  'requests': 'follow requests',
  'restricted': 'restricted profiles',
  'hidden': 'hidden-story list',
};

/// Work out what a piece of text is.
Map<String, Object?> sniff(String text, [String name = '']) {
  final t = importerStripBom(text).trim();
  final fn = name.toLowerCase();
  if (t.isEmpty) return <String, Object?>{'kind': 'empty'};
  if (RegExp(r'^\[InternetShortcut\]', caseSensitive: false).hasMatch(t)) {
    return <String, Object?>{'kind': 'shortcut'};
  }
  if (RegExp(r'^[\[{]').hasMatch(t)) {
    Object? j;
    try {
      j = jsonDecode(t);
    } catch (_) {
      return <String, Object?>{'kind': 'json-broken'};
    }
    if (j is List) {
      if (j.isNotEmpty && j.first is Map && (j.first as Map)['string_list_data'] is List) {
        return <String, Object?>{
          'kind': 'instagram',
          'igKind': igKindFromName(fn).isEmpty ? 'followers' : igKindFromName(fn),
          'data': j,
        };
      }
      return <String, Object?>{'kind': 'json-list', 'data': j};
    }
    if (j is Map) {
      if (j['resources'] is List) return <String, Object?>{'kind': 'backup', 'data': j};
      String? key;
      for (final k in j.keys) {
        if (k is String && RegExp(r'^relationships_').hasMatch(k)) {
          key = k;
          break;
        }
      }
      if (key != null && j[key] is List) {
        return <String, Object?>{'kind': 'instagram', 'igKind': igKindFromKey(key), 'data': j[key]};
      }
      final roots = j['roots'];
      if (j['roots'] is Map && roots is Map && (importerTruthy(roots['bookmark_bar']) || importerTruthy(roots['other']))) {
        return <String, Object?>{'kind': 'bookmarks-json', 'data': j, 'flavor': 'chrome'};
      }
      if (importerTruthy(j['children']) &&
          (importerTruthy(j['root']) ||
              importerTruthy(j['typeCode']) ||
              RegExp(r'moz-place').hasMatch(importerStr(j['type'])))) {
        return <String, Object?>{'kind': 'bookmarks-json', 'data': j, 'flavor': 'firefox'};
      }
      if (j['bookmarks'] is List) return <String, Object?>{'kind': 'json-list', 'data': j['bookmarks']};
      if (j['items'] is List) return <String, Object?>{'kind': 'json-list', 'data': j['items']};
      return <String, Object?>{'kind': 'json-other', 'data': j};
    }
    return <String, Object?>{'kind': 'json-other', 'data': j};
  }
  final first2000 = t.substring(0, min(2000, t.length));
  if (RegExp(r'<opml[\s>]', caseSensitive: false).hasMatch(first2000)) {
    return <String, Object?>{'kind': 'opml'};
  }
  final first300 = t.substring(0, min(300, t.length));
  final first600 = t.substring(0, min(600, t.length));
  if (RegExp(r'\[InternetShortcut\]', caseSensitive: false).hasMatch(first300) ||
      (RegExp(r'<plist', caseSensitive: false).hasMatch(first600) &&
          RegExp(r'<key>URL</key>').hasMatch(t))) {
    return <String, Object?>{'kind': 'shortcut'};
  }
  final first4000 = t.substring(0, min(4000, t.length));
  final looksHtml = RegExp(
        r'^<(!doctype|html|head|body|meta|title|h1|dl|ul|div)',
        caseSensitive: false,
      ).hasMatch(t) ||
      RegExp(r'<a\s[^>]*href', caseSensitive: false).hasMatch(first4000);
  if (looksHtml) {
    if (RegExp(r'NETSCAPE-Bookmark-file', caseSensitive: false).hasMatch(first600) ||
        RegExp(r'<DT>\s*<A\s', caseSensitive: false).hasMatch(t)) {
      return <String, Object?>{'kind': 'bookmarks'};
    }
    final igHead = igKindFromHeading(t);
    final first20000 = t.substring(0, min(20000, t.length));
    final igLinks = RegExp(r'instagram\.com/(?:_u/)?[A-Za-z0-9._]+').allMatches(t).length;
    final igHint = igHead.isNotEmpty || RegExp(r'_a6-[a-z]|instagram').hasMatch(first20000);
    if (igHint && RegExp(r'<h2', caseSensitive: false).hasMatch(t) && igLinks >= 1) {
      return <String, Object?>{
        'kind': 'instagram',
        'igKind': igHead.isNotEmpty ? igHead : (igKindFromName(fn).isEmpty ? 'following' : igKindFromName(fn)),
      };
    }
    if (RegExp(r'''<a\s[^>]*href=["']?https?:''', caseSensitive: false).allMatches(t).isNotEmpty) {
      return <String, Object?>{'kind': 'links-html'};
    }
    return <String, Object?>{'kind': 'unknown'};
  }
  final firstLine = t.split(RegExp(r'\r?\n')).first;
  if (RegExp(r'\.csv$|\.tsv$').hasMatch(fn) ||
      (RegExp(r'[,;\t]').hasMatch(firstLine) &&
          RegExp(r'''(^|[,;\t"])\s*(url|link|href|uri|address|website)\s*($|[,;\t"])''', caseSensitive: false)
              .hasMatch(firstLine))) {
    return <String, Object?>{'kind': 'csv'};
  }
  return <String, Object?>{'kind': 'urls'};
}

/// Old name kept for callers and tests.
String detectFormat(String text) {
  final s = sniff(text);
  final kind = s['kind'];
  if (kind == 'json-list') return 'json-array';
  if (kind == 'instagram') {
    final igKind = s['igKind'];
    if (igKind == 'following' || !importerTruthy(igKind)) {
      return RegExp(r'^\s*[\[{]').hasMatch(text) ? 'instagram-json' : 'instagram-html';
    }
    return 'instagram-other';
  }
  if (kind == 'urls') return 'url-list';
  return importerStr(kind);
}

const Map<String, String> kindLabel = <String, String>{
  'bookmarks': 'Browser bookmarks file',
  'bookmarks-json': 'Browser bookmarks file (JSON)',
  'instagram': 'Instagram following list',
  'csv': 'CSV list of links',
  'opml': 'Feed list (OPML)',
  'shortcut': 'Link file',
  'links-html': 'Web page with links',
  'json-list': 'JSON list of links',
  'urls': 'Text with links',
  'backup': 'Nexus backup',
};

/// Read one file or one pasted text.
Map<String, Object?> readSource(String name, String text) {
  final sn = sniff(text, name);
  final kind = importerStr(sn['kind']);
  final r = <String, Object?>{
    'name': name.isEmpty ? 'Pasted text' : name,
    'kind': kind,
    'label': kindLabel[kind] ?? '',
    'entries': <Map<String, Object?>>[],
    'note': '',
    'skip': false,
  };
  try {
    switch (kind) {
      case 'bookmarks':
        r['entries'] = parseBookmarksHTML(importerStripBom(text));
        break;
      case 'bookmarks-json':
        r['entries'] = parseBookmarksJSON((sn['data'] as Map).cast<Object?, Object?>());
        break;
      case 'instagram':
        final igKind = importerTruthy(sn['igKind']) ? sn['igKind'] : 'following';
        r['igKind'] = igKind;
        if (igKind != 'following') {
          r['skip'] = true;
          r['label'] = 'Instagram ${igListNames[igKind] ?? 'list'}';
          r['note'] = 'This is not your following list, so it was left out. Look for following.json or following.html.';
          break;
        }
        final x = parseInstagramList(sn['data'] ?? importerStripBom(text));
        r['entries'] = x['entries'];
        r['skipped'] = x['skipped'];
        final skipped = x['skipped'] as Map;
        final deleted = skipped['deleted'] as int? ?? 0;
        if (deleted > 0) r['note'] = '${_plural1(deleted, 'deleted account')} skipped.';
        break;
      case 'csv':
        r['entries'] = parseCSV(text);
        if ((r['entries'] as List).isEmpty) r['note'] = 'No link column found. The file needs a column called url or link.';
        break;
      case 'opml':
        r['entries'] = parseOPML(text);
        break;
      case 'shortcut':
        r['entries'] = parseShortcut(text, name);
        break;
      case 'links-html':
        r['entries'] = parseLinksHTML(text);
        break;
      case 'json-list':
        r['entries'] = parseJSONArray(sn['data']);
        if ((r['entries'] as List).isEmpty) r['note'] = 'The list has no links in it.';
        break;
      case 'urls':
        r['entries'] = parseUrlList(importerStripBom(text));
        if ((r['entries'] as List).isEmpty) r['note'] = 'No links found in this text.';
        break;
      case 'backup':
        r['skip'] = true;
        r['backup'] = true;
        r['note'] = 'This is a full Nexus backup. It is restored with "Import a backup", not as links.';
        break;
      case 'json-broken':
        r['skip'] = true;
        r['note'] = 'This JSON is damaged or cut off.';
        break;
      case 'json-other':
        r['skip'] = true;
        r['label'] = 'JSON file';
        r['note'] = 'Not a list of links, so nothing was imported.';
        break;
      case 'empty':
        r['skip'] = true;
        r['note'] = 'The file is empty.';
        break;
      default:
        r['skip'] = true;
        r['note'] = 'Could not recognise this file.';
    }
  } catch (e) {
    r['skip'] = true;
    final raw = e is StateError ? e.message : '$e';
    r['note'] = 'Could not read it: ${importerStr(raw).substring(0, min(80, importerStr(raw).length))}';
    r['entries'] = <Map<String, Object?>>[];
  }
  final parsed = <Map<String, Object?>>[];
  for (final e in (r['entries'] as List)) {
    if (e is Map) parsed.add(entryToResource(e.cast<String, Object?>()));
  }
  r['entries'] = parsed;
  if (r['skip'] != true && parsed.isEmpty) {
    r['skip'] = true;
    if (importerStr(r['note']).isEmpty) r['note'] = 'No links found.';
  }
  return r;
}

String _plural1(int n, String word) => '$n $word${n == 1 ? '' : 's'}';

/// Detect + parse anything pasted.
Map<String, Object?> parseAny(String text) {
  final r = readSource('', text);
  final f = detectFormat(text);
  final note = r['backup'] == true
      ? 'This is a full backup. Use "Import backup".'
      : (r['kind'] == 'empty' ? '' : importerStr(r['note'] ?? ''));
  return <String, Object?>{
    'format': f,
    'entries': r['entries'],
    'note': note,
    'kind': r['kind'],
    'label': r['label'],
    'skip': r['skip'],
  };
}
