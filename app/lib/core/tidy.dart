// tidy.dart - port of legacy/web-src/js/tidy.js (small clean-ups for saved links and titles).
// cleanUrl, droppedParams, cleanTitle and tidyFindings.
// This file is the REFERENCE for how to port a module: same names as the JS, same behaviour, plain Dart.
import 'model/resource.dart';
import 'util.dart';

/// Parameters that only say "this click came from X". Removing them never changes the page.
final RegExp _track = RegExp(
  r'^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|yclid|igshid|igsh|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|ref_url|twclid|ttclid|vero_id|oly_enc_id|oly_anon_id|gbraid|wbraid|irclickid|irgwc|from_src)$',
  caseSensitive: false,
);

/// Tracking ids that YouTube and Spotify add to shared links.
final RegExp _shareId = RegExp(r'^(si|feature|pp)$', caseSensitive: false);
final RegExp _shareHost = RegExp(r'(^|\.)(youtube\.com|youtu\.be|spotify\.com)$', caseSensitive: false);

/// The address without tracking parameters, or the same string when there is nothing to remove.
/// Everything else is kept exactly as saved.
String cleanUrl(String? url) {
  final s = (url ?? '').trim();
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(s) || !s.contains('?')) return s;
  String host = '';
  try {
    host = Uri.parse(s).host;
  } catch (_) {
    return s;
  }
  if (host.isEmpty) return s;
  final hashAt = s.indexOf('#');
  final hash = hashAt >= 0 ? s.substring(hashAt) : '';
  final main = hashAt >= 0 ? s.substring(0, hashAt) : s;
  final q = main.indexOf('?');
  final base = main.substring(0, q);
  final pairs = main.substring(q + 1).split('&').where((x) => x.isNotEmpty).toList();
  final keep = pairs.where((p) {
    var k = p.split('=').first;
    try {
      k = Uri.decodeComponent(k);
    } catch (_) {
      // keep the raw name
    }
    final drop = _track.hasMatch(k) || (_shareId.hasMatch(k) && _shareHost.hasMatch(host));
    return !drop;
  }).toList();
  if (keep.length == pairs.length) return s;
  return base + (keep.isNotEmpty ? '?${keep.join('&')}' : '') + hash;
}

List<String> _paramNames(String u) {
  final parts = u.split('#').first.split('?');
  if (parts.length < 2 || parts[1].isEmpty) return <String>[];
  return parts[1].split('&').where((x) => x.isNotEmpty).map((x) => x.split('=').first).toList();
}

/// The names of the tracking parameters cleanUrl removes, e.g. ["utm_source", "fbclid"].
List<String> droppedParams(String? url) {
  final from = (url ?? '').trim();
  final to = cleanUrl(url);
  if (to == from) return <String>[];
  final kept = _paramNames(to).toList();
  final out = <String>[];
  for (final n in _paramNames(url ?? '')) {
    final i = kept.indexOf(n);
    if (i >= 0) {
      kept.removeAt(i);
    } else {
      out.add(n);
    }
  }
  return out;
}

String _brand(String s) => s.toLowerCase().replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '');

const Map<String, String> _entities = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

const Set<String> _generic = {
  'www', 'www2', 'm', 'news', 'docs', 'blog', 'app', 'web', 'mail',
  'support', 'help', 'shop', 'store', 'en', 'learn', 'wiki',
};

/// The words of the address that name the site: news.mit.edu -> ["mit"]; bbc.co.uk -> ["bbc"].
List<String> _siteWords(String url) {
  String host = '';
  try {
    final u = Uri.parse(url);
    if (!u.hasScheme) return <String>[];
    host = u.host.toLowerCase();
  } catch (_) {
    return <String>[];
  }
  final parts = host.split('.');
  parts.removeLast();
  return parts.where((w) => w.length >= 3 && !_generic.contains(w)).map(_brand).toList();
}

final RegExp _titleTail = RegExp(r'^(.{4,}?)\s+(?:\||-|–|—|·|:)\s+([^|\-–—·:]{2,40})$');

/// A tidier title, or the same one. Removes: a "(3)" alert count at the start, a site name tacked on
/// the end ("Great article | Medium") when it matches the site's own address, web-page symbols such as &amp;, extra spaces.
String cleanTitle(String? title, String? url) {
  var t = (title ?? '')
      .replaceAllMapped(RegExp(r'&(amp|lt|gt|quot|#39|apos|nbsp);'), (m) => _entities[m[0]!]!)
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  t = t.replaceFirst(RegExp(r'^\(\d{1,3}\+?\)\s+'), '');
  final words = _siteWords(url ?? '');
  final m = _titleTail.firstMatch(t);
  if (m != null && words.isNotEmpty) {
    final sb = _brand(m[2]!);
    final same = sb.isNotEmpty &&
        words.any((w) => sb == w || sb.contains(w) || (w.contains(sb) && sb.length >= 4));
    if (same) t = m[1]!.trim();
  }
  return t;
}

class TidyLink {
  TidyLink(this.r, this.to);
  final Resource r;
  final String to;
  Map<String, Object?> toJson() => <String, Object?>{'id': r.id, 'to': to};
}

class TidyTitle {
  TidyTitle(this.r, this.to);
  final Resource r;
  final String to;
  Map<String, Object?> toJson() => <String, Object?>{'id': r.id, 'to': to};
}

class TidyFindings {
  TidyFindings(this.links, this.titles, this.nowSame);
  final List<TidyLink> links;
  final List<TidyTitle> titles;
  final int nowSame;
  Map<String, Object?> toJson() => <String, Object?>{
        'links': links.map((x) => x.toJson()).toList(),
        'titles': titles.map((x) => x.toJson()).toList(),
        'nowSame': nowSame,
      };
}

/// What could be tidied (archived, followed and locked links are left out):
/// `links: [{ r, to }], titles: [{ r, to }], nowSame`. Same as tidyFindings in tidy.js.
TidyFindings tidyFindings(List<Resource> resources) {
  final count = <String, int>{};
  for (final r in resources) {
    if (r.url.isNotEmpty && r.status != 'archived') {
      final k = normUrl(r.url);
      count[k] = (count[k] ?? 0) + 1;
    }
  }
  final links = <TidyLink>[];
  final titles = <TidyTitle>[];
  var nowSame = 0;
  for (final r in resources) {
    if (r.status == 'archived' || r.src == 'following' || r.locked) continue;
    if (r.url.isNotEmpty) {
      final to = cleanUrl(r.url);
      if (to != r.url) {
        links.add(TidyLink(r, to));
        if ((count[normUrl(r.url)] ?? 0) > 1) nowSame++;
      }
    }
    final tt = cleanTitle(r.title, r.url);
    if (tt.isNotEmpty && tt != r.title) titles.add(TidyTitle(r, tt));
  }
  return TidyFindings(links, titles, nowSame);
}
