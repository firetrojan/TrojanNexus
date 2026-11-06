// importers_text.dart - text helpers and dates for the link importers.
// Same behaviour as the top of legacy/web-src/js/importers.js.
const int importerMaxEntries = 6000;

const Map<String, String> _entities = <String, String>{
  'amp': '&',
  'lt': '<',
  'gt': '>',
  'quot': '"',
  'apos': "'",
  'nbsp': ' ',
};

/// JavaScript-like truthiness for values that come from JSON.
bool importerTruthy(Object? value) {
  if (value == null || value == false) return false;
  if (value is String) return value.isNotEmpty;
  if (value is num) return value != 0;
  return true;
}

/// JavaScript-like String(value), for the simple JSON values used here.
String importerStr(Object? value) {
  if (value == null) return 'null';
  if (value is String) return value;
  if (value is bool) return value ? 'true' : 'false';
  if (value is int) return '$value';
  if (value is double) {
    if (value == value.truncateToDouble() && value.isFinite) return '${value.toInt()}';
    return '$value';
  }
  return '$value';
}

String _fromCodePoint(int n) {
  if (n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) {
    throw RangeError('Invalid code point');
  }
  if (n <= 0xffff) return String.fromCharCode(n);
  final x = n - 0x10000;
  return String.fromCharCodes(<int>[0xd800 + (x >> 10), 0xdc00 + (x & 0x3ff)]);
}

/// Decode HTML entities: named, decimal and hex. Unknown names stay as they are.
String decode(Object? value) {
  final s = importerStr(value);
  final re = RegExp(r'&(#x[0-9a-f]+|#\d+|[a-z]+);', caseSensitive: false);
  return s.replaceAllMapped(re, (m) {
    final e = m[1]!;
    if (e.startsWith('#')) {
      final radix = e.length > 1 && e[1].toLowerCase() == 'x' ? 16 : 10;
      final digits = radix == 16 ? e.substring(2) : e.substring(1);
      final n = int.tryParse(digits, radix: radix);
      if (n == null) return m[0]!;
      try {
        return _fromCodePoint(n);
      } catch (_) {
        return m[0]!;
      }
    }
    return _entities[e.toLowerCase()] ?? m[0]!;
  });
}

String importerStripBom(Object? value) =>
    importerTruthy(value) ? importerStr(value).replaceFirst(RegExp(r'^\uFEFF'), '') : '';

/// Dates in many shapes -> yyyy-mm-dd or ''. Seconds, milliseconds, Chrome's 1601 microseconds and date text.
String toISODate(Object? value) {
  if (value == null || value == '') return '';
  DateTime d;
  final text = importerStr(value).trim();
  if (value is num || RegExp(r'^\d{9,19}$').hasMatch(text)) {
    var n = double.tryParse(text) ?? 0;
    if (n > 1e16) {
      n = n / 1e6 - 11644473600;
    } else if (n > 1e14) {
      n = n / 1e6;
    } else if (n > 1e11) {
      n = n / 1e3;
    }
    try {
      d = DateTime.fromMillisecondsSinceEpoch((n * 1000).truncate(), isUtc: true);
    } catch (_) {
      return '';
    }
  } else {
    try {
      d = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text)
          ? DateTime.utc(
              int.parse(text.substring(0, 4)),
              int.parse(text.substring(5, 7)),
              int.parse(text.substring(8, 10)),
            )
          : DateTime.parse(text);
    } catch (_) {
      return '';
    }
  }
  final year = d.toUtc().year;
  if (year < 1995 || year > 2100) return '';
  return d.toUtc().toIso8601String().substring(0, 10);
}

List<String> importerToTagList(Object? value) {
  if (value is List) {
    return value.map((x) => importerStr(x).trim()).where((x) => x.isNotEmpty).toList();
  }
  final s = importerTruthy(value) ? importerStr(value).trim() : '';
  if (s.isEmpty) return <String>[];
  final parts = s.contains(',') || s.contains(';') ? s.split(RegExp(r'[,;]')) : s.split(RegExp(r'\s+'));
  return parts.map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
}

/// Strip tags and squeeze spaces.
String importerClean(Object? value) =>
    decode(importerStr(value).replaceAll(RegExp(r'<[^>]*>'), '')).replaceAll(RegExp(r'\s+'), ' ').trim();

/// Read one attribute from an HTML/XML tag. Quotes may be double, single or absent.
String importerAttr(String s, String name) {
  final re = RegExp(
    '\\b$name\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))',
    caseSensitive: false,
  );
  final m = re.firstMatch(s);
  if (m == null) return '';
  final raw = m[1] ?? m[2] ?? m[3] ?? '';
  return decode(raw);
}

final RegExp importerRootFolder = RegExp(
  r'^(bookmarks?( bar| menu| toolbar)?|other bookmarks|mobile bookmarks|favou?rites( bar)?|menu|toolbar|unfiled|mobile|unsorted|root|bookmarks bar)$',
  caseSensitive: false,
);
