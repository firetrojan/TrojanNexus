// util.dart - port of legacy/web-src/js/util.js, the pure parts only.
// No DOM helpers here: the Flutter app does not build HTML strings.
import 'dart:math';

String _pad2(int n) => n.toString().padLeft(2, '0');

/// Parse the "YYYY-MM-DD" start of a date text, or null. Same as parseISO in util.js.
DateTime? parseISO(String? s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s ?? '');
  if (m == null) return null;
  final y = int.tryParse(m[1]!);
  final mo = int.tryParse(m[2]!);
  final d = int.tryParse(m[3]!);
  if (y == null || mo == null || d == null) return null;
  return DateTime(y, mo, d);
}

/// "YYYY-MM-DD" in local time, same as iso() in util.js.
String iso(DateTime d) => '${d.year}-${_pad2(d.month)}-${_pad2(d.day)}';

/// The clock. Tests override this to freeze "now"; the app leaves the default.
DateTime Function() nowClock = DateTime.now;

String todayISO() => iso(nowClock());

/// Add n days to a date text. An invalid or empty text means today (same as util.js).
String addDays(String? s, int n) {
  final d = parseISO(s) ?? nowClock();
  return iso(DateTime(d.year, d.month, d.day + n));
}

/// Whole days from a to b. Invalid dates give 0 (same as util.js).
int daysBetween(String? a, String? b) {
  final x = parseISO(a);
  final y = parseISO(b);
  if (x == null || y == null) return 0;
  final ux = DateTime.utc(x.year, x.month, x.day);
  final uy = DateTime.utc(y.year, y.month, y.day);
  return uy.difference(ux).inDays;
}

const List<String> _months = <String>[
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "31 Oct", or "" for a bad date.
String fmtDate(String? s) {
  final d = parseISO(s);
  return d == null ? '' : '${d.day} ${_months[d.month - 1]}';
}

/// "today", "tomorrow", "in 3 days", "2 days ago".
String relDays(int n) {
  if (n == 0) return 'today';
  if (n == 1) return 'tomorrow';
  if (n == -1) return 'yesterday';
  return n > 0 ? 'in $n days' : '${n.abs()} days ago';
}

/// "1 link", "2 links", or a custom plural: plural(2, 'match', 'matches').
String plural(num n, String w, [String? many]) =>
    '$n ${n == 1 ? w : ((many == null || many.isEmpty) ? '${w}s' : many)}';

int _uidCounter = 0;
final Random _random = Random();

/// A short random id with a prefix, like uid() in util.js.
String uid([String p = 'r']) {
  final t = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  final tail = t.length > 5 ? t.substring(t.length - 5) : t;
  _uidCounter++;
  final r = (_random.nextInt(1 << 30) + _uidCounter).toRadixString(36);
  final rand = r.length >= 5 ? r.substring(r.length - 5) : r.padLeft(5, '0');
  return '$p$tail$rand';
}

/// Keep the first occurrence of each value, in order (same as Array.from(new Set(a))).
List<T> uniq<T>(Iterable<T> values) => values.toSet().toList();

// ---------- math (web-safe 32-bit) ----------

/// Keep [v] between [a] and [b].
num clamp(num v, num a, num b) => min(b, max(a, v));

/// Linear interpolation.
num lerp(num a, num b, num t) => a + (b - a) * t;

/// Frame-rate independent smoothing: move [a] toward [b].
num damp(num a, num b, num lambda, num dt) =>
    a + (b - a) * (1 - exp(-lambda * dt));

/// 32-bit multiply without relying on platform-sized integers. Math.imul on
/// the web truncates to 32 bits; splitting into 16-bit halves gives the same
/// bits on the VM and in the browser.
int _imul32(int a, int b) {
  final a0 = a & 0xffff;
  final a1 = (a >> 16) & 0xffff;
  final b0 = b & 0xffff;
  final b1 = (b >> 16) & 0xffff;
  final low = a0 * b0;
  final cross = a0 * b1 + a1 * b0;
  return (low + ((cross & 0xffff) << 16)) & 0xffffffff;
}

/// FNV-1a, returned as an unsigned 32-bit number (same as hash32 in util.js).
int hash32(String? s) {
  final text = s ?? '';
  var x = 2166136261;
  for (final code in text.codeUnits) {
    x = (x ^ code) & 0xffffffff;
    x = _imul32(x, 16777619);
  }
  return x >>> 0;
}

/// Escape text before putting it inside HTML strings.
String esc(Object? s) => (s == null ? '' : s.toString()).replaceAllMapped(
      RegExp("[&<>\"']"),
      (m) =>
          const <String, String>{
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          }[m[0]]!,
    );

// ---------- urls ----------

final RegExp _trackQuery = RegExp(
  r'^(utm_|fbclid$|gclid$|irclickid$|irgwc$|afsrc$|subid1$|from_src$|ref$|igshid$|mc_)',
  caseSensitive: false,
);

/// Normalised key for spotting duplicate links: no www, no trailing slash,
/// no tracking query params, no #fragment. Same as normUrl in util.js.
String normUrl(String? u) {
  final raw = (u ?? '').trim();
  try {
    final x = Uri.parse(raw);
    if (!x.hasScheme || x.host.isEmpty) return raw.toLowerCase();
    final host = x.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
    final path = x.path.replaceFirst(RegExp(r'/+$'), '');
    final pairs = <List<String>>[];
    x.queryParametersAll.forEach((k, values) {
      for (final v in values) {
        if (!_trackQuery.hasMatch(k)) pairs.add(<String>[k, v]);
      }
    });
    pairs.sort((a, b) => a[0].compareTo(b[0]));
    final query = pairs.map((p) => '${p[0]}=${p[1]}').join('&');
    return host + path + (query.isEmpty ? '' : '?$query');
  } catch (_) {
    return raw.toLowerCase();
  }
}

/// "example.com" for a valid http(s) address, or "".
String domainOf(String? url) {
  try {
    final x = Uri.parse((url ?? '').trim());
    if (!x.hasScheme || x.host.isEmpty) return '';
    return x.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  } catch (_) {
    return '';
  }
}

/// "example.com/some/page": no https://, no www., no trailing slash, cut to n.
String shortUrl(String? u, [int n = 46]) {
  var s = (u ?? '')
      .trim()
      .replaceFirst(RegExp(r'^https?:\/\/(www\.)?', caseSensitive: false), '')
      .replaceFirst(RegExp(r'[?#].*$'), '')
      .replaceFirst(RegExp(r'/+$'), '');
  if (n > 0 && s.length > n) s = s.substring(0, n - 1) + '…';
  return s;
}

bool isHttpUrl(String? u) =>
    RegExp(r'^https?:\/\/\S+$', caseSensitive: false).hasMatch((u ?? '').trim());

// ---------- siteKey (from legacy/web-src/js/dupes.js) ----------

const Map<String, Object> _platform = <String, Object>{
  'github.com': 1, 'gitlab.com': 1, 'bitbucket.org': 1, 'x.com': 1,
  'twitter.com': 1, 'instagram.com': 1, 'tiktok.com': 1, 'facebook.com': 1,
  'threads.net': 1, 't.me': 1, 'medium.com': 1, 'kaggle.com': 1,
  'dev.to': 1, 'linktr.ee': 1, 'pinterest.com': 1,
  'linkedin.com': 2, 'reddit.com': 2, 'youtube.com': 'yt', 'huggingface.co': 'hf',
};

const List<String> _noisy = <String>[
  'google.com', 'wikipedia.org', 'stackoverflow.com', 'stackexchange.com',
  'arxiv.org', 'doi.org', 'amazon.com', 'amazon.in', 'bit.ly', 't.co',
  'goo.gl', 'tinyurl.com', 'notion.so', 'figma.com', 'canva.com',
  'archive.org', 'ycombinator.com', 'apple.com', 'quora.com', 'imdb.com',
  'wikimedia.org', 'fandom.com', 'yahoo.com', 'bing.com', 'duckduckgo.com',
];

const List<String> _hosting = <String>[
  'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app',
  'firebaseapp.com', 'herokuapp.com', 'onrender.com', 'streamlit.app',
  'hf.space', 'gradio.live', 'blogspot.com', 'wordpress.com', 'substack.com',
  'notion.site', 'carrd.co', 'wixsite.com', 'weebly.com', 'tumblr.com',
  'ghost.io', 'beehiiv.com', 'bubbleapps.io', 'framer.website', 'webflow.io',
  'repl.co', 'replit.app', 'glitch.me', 'itch.io',
];

const Set<String> _secondLevel = <String>{
  'co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'go',
};

bool _endsWithHost(String host, List<String> domains) =>
    domains.any((d) => host == d || host.endsWith('.$d'));

String _registrable(String host) {
  final p = host.split('.');
  if (p.length <= 2) return host;
  final tld = p[p.length - 1];
  final sld = p[p.length - 2];
  if (tld.length == 2 && _secondLevel.contains(sld)) {
    return p.sublist(p.length - 3).join('.');
  }
  return p.sublist(p.length - 2).join('.');
}

/// The site an address belongs to, as a short key, or "" when it cannot be told.
String siteKey(String? url) {
  Uri x;
  try {
    x = Uri.parse((url ?? '').trim());
  } catch (_) {
    return '';
  }
  if (x.scheme != 'http' && x.scheme != 'https') return '';
  var host = x.host.toLowerCase().replaceFirst(RegExp(r'^(www|m|mobile|old|new)\.'), '');
  if (host.isEmpty || !host.contains('.')) return '';
  if (host == 'youtu.be') return '';
  if (host.endsWith('youtube.com')) host = 'youtube.com';
  if (_endsWithHost(host, _noisy)) return '';

  final seg = x.path.split('/').where((s) => s.isNotEmpty).map((s) => s.toLowerCase()).toList();
  final rule = _platform[host];
  if (rule != null) {
    if (rule == 'yt') {
      final first = seg.isEmpty ? '' : seg[0];
      if (first.startsWith('@')) return '$host/$first';
      if (const <String>['channel', 'c', 'user'].contains(first) && seg.length >= 2) {
        return '$host/$first/${seg[1]}';
      }
      return '';
    }
    if (rule == 'hf') {
      final o = seg.isNotEmpty && const <String>['spaces', 'datasets', 'models'].contains(seg[0])
          ? (seg.length >= 2 ? seg[1] : '')
          : (seg.isEmpty ? '' : seg[0]);
      return o.isEmpty ? '' : '$host/$o';
    }
    if (seg.isEmpty) return '';
    if (rule == 2) {
      return seg.length >= 2 ? '$host/${seg[0]}/${seg[1]}' : '';
    }
    return '$host/${seg[0]}';
  }
  if (_endsWithHost(host, _hosting)) return host;
  return _registrable(host);
}
