// importers_csv.dart - small CSV reader and header mapping for link lists.
// Port of the CSV section in legacy/web-src/js/importers.js.
import 'dart:math';

import 'importers_text.dart';
import 'util.dart';

String _cell(List<String> row, int? index) {
  if (index == null || index < 0 || index >= row.length) return '';
  return row[index];
}

// ---------- CSV ----------

/// Small CSV reader: quotes, doubled quotes, line breaks inside quotes, comma / semicolon / tab.
List<List<String>> parseCSVRows(String text) {
  final t = importerStripBom(text);
  final first = t.split(RegExp(r'\r?\n')).first;
  var delim = ',';
  var best = -1;
  for (final d in <String>[',', ';', '\t']) {
    final n = first.split(d).length;
    if (n > best) {
      best = n;
      delim = d;
    }
  }
  final rows = <List<String>>[];
  var row = <String>[];
  var cell = '';
  var quote = false;
  var i = 0;
  while (i < t.length) {
    final c = t[i];
    if (quote) {
      if (c == '"') {
        if (i + 1 < t.length && t[i + 1] == '"') {
          cell += '"';
          i++;
        } else {
          quote = false;
        }
      } else {
        cell += c;
      }
      i++;
      continue;
    }
    if (c == '"' && cell.isEmpty) {
      quote = true;
    } else if (c == delim) {
      row.add(cell);
      cell = '';
    } else if (c == '\n' || c == '\r') {
      if (c == '\r' && i + 1 < t.length && t[i + 1] == '\n') i++;
      row.add(cell);
      cell = '';
      if (row.any((x) => x.trim().isNotEmpty)) rows.add(row);
      row = <String>[];
      if (rows.length > importerMaxEntries + 1) break;
    } else {
      cell += c;
    }
    i++;
  }
  if (cell.isNotEmpty || row.isNotEmpty) {
    row.add(cell);
    if (row.any((x) => x.trim().isNotEmpty)) rows.add(row);
  }
  return rows;
}

final Map<String, RegExp> _columns = <String, RegExp>{
  'url': RegExp(r'^(url|link|href|uri|address|web ?address|website|page url|resolved_url)$', caseSensitive: false),
  'title': RegExp(r'^(title|name|page|page title|resolved_title)$', caseSensitive: false),
  'folder': RegExp(r'^(folder|collection|category|group|list|path|board)$', caseSensitive: false),
  'tags': RegExp(r'^(tags?|labels?|keywords?)$', caseSensitive: false),
  'notes': RegExp(r'^(notes?|excerpt|comments?|summary|extended|description)$', caseSensitive: false),
  'date': RegExp(r'^(created|created at|created_at|date|date added|added|added at|time_added|timestamp|saved|saved at|time)$', caseSensitive: false),
};

List<Map<String, Object?>> parseCSV(String text) {
  final rows = parseCSVRows(text);
  if (rows.length < 2) return <Map<String, Object?>>[];
  final head = rows[0].map((x) => x.trim()).toList();
  final idx = <String, int>{};
  for (var h = 0; h < head.length; h++) {
    for (final k in _columns.keys) {
      if (!idx.containsKey(k) && _columns[k]!.hasMatch(head[h])) idx[k] = h;
    }
  }
  final body = rows.sublist(1);
  if (!idx.containsKey('url')) {
    final n = min(body.length, 20);
    var best = -1;
    var bs = 0;
    for (var c = 0; c < head.length; c++) {
      var s = 0;
      for (var r = 0; r < n; r++) {
        if (isHttpUrl(_cell(body[r], c).trim())) s++;
      }
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    if (best < 0 || bs < max(1, n / 2)) return <Map<String, Object?>>[];
    idx['url'] = best;
    if (!idx.containsKey('title')) {
      var o = -1;
      for (var i = 0; i < head.length; i++) {
        if (i != best) {
          o = i;
          break;
        }
      }
      if (o >= 0 && !isHttpUrl(_cell(body[0], o).trim())) idx['title'] = o;
    }
  }
  if (!idx.containsKey('title') &&
      idx.containsKey('notes') &&
      head[idx['notes']!].toLowerCase() == 'description') {
    idx['title'] = idx['notes']!;
    idx.remove('notes');
  }
  final out = <Map<String, Object?>>[];
  for (final r in body) {
    final url = _cell(r, idx['url']).trim();
    if (!isHttpUrl(url)) continue;
    final e = <String, Object?>{
      'title': idx.containsKey('title') ? _cell(r, idx['title']).trim() : '',
      'url': url,
      'folder': idx.containsKey('folder') ? _cell(r, idx['folder']).trim() : '',
      'added': idx.containsKey('date') ? toISODate(_cell(r, idx['date']).trim()) : '',
    };
    if (idx.containsKey('tags') && _cell(r, idx['tags']).trim().isNotEmpty) {
      e['tags'] = importerToTagList(_cell(r, idx['tags']));
    }
    if (idx.containsKey('notes') && _cell(r, idx['notes']).trim().isNotEmpty) {
      final notes = _cell(r, idx['notes']).trim();
      e['notes'] = notes.substring(0, min(400, notes.length));
    }
    out.add(e);
    if (out.length >= importerMaxEntries) break;
  }
  return out;
}
