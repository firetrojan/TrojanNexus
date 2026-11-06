// importers_instagram.dart - Instagram "Download your information" following lists.
// Port of the Instagram section in legacy/web-src/js/importers.js.
import 'dart:convert';

import 'importers_text.dart';

final RegExp _igOk = RegExp(r'^[A-Za-z0-9._]{1,30}$');
final RegExp _igHref = RegExp(r'instagram\.com/(?:_u/)?([A-Za-z0-9._]+)', caseSensitive: false);

String igHandleFromHref(Object? href) {
  final m = _igHref.firstMatch(importerStr(href));
  return m == null ? '' : m[1]!;
}

String igKindFromKey(Object? key) {
  final k = importerStr(key);
  if (RegExp(r'following').hasMatch(k)) return 'following';
  if (RegExp(r'followers?').hasMatch(k)) return 'followers';
  if (RegExp(r'block').hasMatch(k)) return 'blocked';
  if (RegExp(r'close_friends').hasMatch(k)) return 'close';
  if (RegExp(r'unfollow').hasMatch(k)) return 'unfollowed';
  if (RegExp(r'request').hasMatch(k)) return 'requests';
  if (RegExp(r'restrict').hasMatch(k)) return 'restricted';
  if (RegExp(r'hide').hasMatch(k)) return 'hidden';
  return 'other';
}

String igKindFromName(Object? name) {
  final n = importerStr(name).toLowerCase();
  if (RegExp(r'following').hasMatch(n)) return 'following';
  if (RegExp(r'followers?').hasMatch(n)) return 'followers';
  if (RegExp(r'blocked').hasMatch(n)) return 'blocked';
  if (RegExp(r'close_friends').hasMatch(n)) return 'close';
  if (RegExp(r'unfollow').hasMatch(n)) return 'unfollowed';
  if (RegExp(r'request').hasMatch(n)) return 'requests';
  return '';
}

String igKindFromHeading(String text) {
  final m = RegExp(r'<h1[^>]*>([^<]*)</h1>', caseSensitive: false).firstMatch(text);
  final h = m == null ? '' : decode(m[1]).trim().toLowerCase();
  if (h.isEmpty) return '';
  if (RegExp(r'^following$').hasMatch(h)) return 'following';
  if (RegExp(r'follower').hasMatch(h)) return 'followers';
  if (RegExp(r'block').hasMatch(h)) return 'blocked';
  if (RegExp(r'close friends').hasMatch(h)) return 'close';
  if (RegExp(r'unfollow').hasMatch(h)) return 'unfollowed';
  if (RegExp(r'request').hasMatch(h)) return 'requests';
  if (RegExp(r'restrict').hasMatch(h)) return 'restricted';
  if (RegExp(r'hide|hidden').hasMatch(h)) return 'hidden';
  return 'other';
}

Map<String, Object?> _igEntry(String handle, String date) => <String, Object?>{
      'title': '@$handle',
      'url': 'https://www.instagram.com/$handle/',
      'type': 'feed',
      'tags': <String>['instagram', 'following'],
      'src': 'following',
      'research': 'user',
      'added': date,
    };

/// Instagram data export: following.json (old and new layout) or following.html.
Map<String, Object?> parseInstagramList(Object? input, [Map<String, Object?> opts = const <String, Object?>{}]) {
  final out = <Map<String, Object?>>[];
  final seen = <String>{};
  final skipped = <String, int>{'deleted': 0, 'bad': 0};

  void push(String h, String date) {
    if (h.isEmpty) {
      skipped['bad'] = skipped['bad']! + 1;
      return;
    }
    if (RegExp(r'^__deleted__', caseSensitive: false).hasMatch(h)) {
      skipped['deleted'] = skipped['deleted']! + 1;
      return;
    }
    if (!_igOk.hasMatch(h)) {
      skipped['bad'] = skipped['bad']! + 1;
      return;
    }
    final key = h.toLowerCase();
    if (seen.contains(key)) return;
    seen.add(key);
    out.add(_igEntry(h, date));
  }

  Object? t = input is String ? importerStripBom(input).trim() : input;
  if (t is String && t.isNotEmpty && (t[0] == '{' || t[0] == '[')) {
    t = jsonDecode(t);
  }
  if (t is! String) {
    List<Object?> list = t is List ? t.cast<Object?>() : <Object?>[];
    if (t is! List && importerTruthy(t) && t is Map) {
      String? key;
      for (final k in t.keys) {
        if (k is String && RegExp(r'^relationships_').hasMatch(k)) {
          key = k;
          break;
        }
      }
      final v = key == null ? null : t[key];
      list = v is List ? v.cast<Object?>() : <Object?>[];
    }
    for (final it in list) {
      final raw = it is Map ? it['string_list_data'] : null;
      final d = raw is List && raw.isNotEmpty ? raw.first : null;
      if (d is! Map) {
        skipped['bad'] = skipped['bad']! + 1;
        continue;
      }
      final rawHandle = importerTruthy(d['value'])
          ? d['value']
          : (it is Map && importerTruthy(it['title'])
              ? it['title']
              : (importerTruthy(d['href']) ? igHandleFromHref(d['href']) : ''));
      final h = importerStr(rawHandle).trim();
      final date = importerTruthy(d['timestamp']) ? toISODate(d['timestamp']) : '';
      push(h, date);
    }
    return <String, Object?>{'entries': out, 'skipped': skipped};
  }

  final h2 = RegExp(r'<h2[^>]*>([^<]*)</h2>([\s\S]*?)(?=<h2|$)', caseSensitive: false);
  var any = false;
  for (final m in h2.allMatches(t)) {
    any = true;
    var h = decode(m[1]).trim();
    if (h.isEmpty) {
      final hm = RegExp(r'href="([^"]+)"').firstMatch(m[2]!);
      h = hm == null ? '' : igHandleFromHref(hm[1]);
    }
    final dm = RegExp(r'([A-Z][a-z]{2} \d{1,2}, \d{4})').firstMatch(m[2]!);
    var date = '';
    if (dm != null) {
      final x = _parseIgDate(dm[1]!);
      if (x != null) date = x.toUtc().toIso8601String().substring(0, 10);
    }
    push(h, date);
  }
  if (!any) {
    final re2 = RegExp(
      r'href="https?://(?:www\.)?instagram\.com/(?:_u/)?([A-Za-z0-9._]+)/?"',
      caseSensitive: false,
    );
    for (final m in re2.allMatches(t)) {
      push(m[1]!, '');
    }
  }
  return <String, Object?>{'entries': out, 'skipped': skipped};
}

DateTime? _parseIgDate(String text) {
  final m = RegExp(r'^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$').firstMatch(text);
  if (m == null) return null;
  const months = <String, int>{
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
  };
  final mo = months[m[1]];
  if (mo == null) return null;
  return DateTime(int.parse(m[3]!), mo, int.parse(m[2]!), 12);
}

/// Old name: returns just the entries.
List<Map<String, Object?>> parseInstagramFollowing(Object? text) =>
    (parseInstagramList(text)['entries'] as List).cast<Map<String, Object?>>();
