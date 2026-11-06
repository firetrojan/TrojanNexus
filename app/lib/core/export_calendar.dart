// export_calendar.dart - calendar files, Google Calendar, WhatsApp and mailto links.
// Port of the calendar and link section in legacy/web-src/js/exporters.js.
import 'dart:convert';

import 'model/resource.dart';
import 'util.dart';

/// Dates worth putting in a calendar: next checks, limit resets, trial ends.
List<Map<String, Object?>> upcomingEvents(List<Resource> resources, [Map<String, Object?> o = const <String, Object?>{}]) {
  final from = o['from'] is String && (o['from'] as String).isNotEmpty ? o['from'] as String : todayISO();
  final days = o['days'] is num ? (o['days'] as num).toInt() : 90;
  final to = addDays(from, days);
  final out = <Map<String, Object?>>[];

  void add(Resource r, String kind, String date, String what) {
    if (date.isEmpty || parseISO(date) == null || date.compareTo(from) < 0 || date.compareTo(to) > 0) return;
    final details = <String>[
      r.useWhen.isNotEmpty ? r.useWhen.first : '',
      r.url,
    ].where((x) => x.isNotEmpty).join('\n');
    out.add(<String, Object?>{
      'rid': r.id,
      'kind': kind,
      'date': date,
      'title': '$what: ${r.title}',
      'details': details,
      'url': r.url,
    });
  }

  for (final r in resources) {
    if (r.status == 'archived') continue;
    if (r.checkCadence != 'none') add(r, 'check', r.nextCheck, 'Check');
    add(r, 'resets', r.fields['resets'] ?? '', 'Limit resets or offer ends');
    if (r.status == 'testing') add(r, 'trial', r.trialEnd, 'Trial ends - keep or drop');
  }
  out.sort((a, b) {
    final d = (a['date'] as String).compareTo(b['date'] as String);
    return d != 0 ? d : (a['title'] as String).compareTo(b['title'] as String);
  });
  return out;
}

String _icsEsc(Object? value) => (value == null ? '' : value.toString())
    .replaceAll('\\', '\\\\')
    .replaceAll(RegExp(r'\r?\n'), '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');

String _d8(String date) => date.replaceAll('-', '');

String _fold(String line) {
  final out = <String>[];
  var cur = '';
  var bytes = 0;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    final n = utf8.encode(ch).length;
    final limit = out.isNotEmpty ? 74 : 75;
    if (bytes + n > limit) {
      out.add(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.add(cur);
  final parts = <String>[];
  for (var i = 0; i < out.length; i++) {
    parts.add('${i > 0 ? ' ' : ''}${out[i]}');
  }
  return parts.join('\r\n');
}

/// A calendar file of all-day events.
String icsFor(List<Map<String, Object?>> events, [Map<String, Object?> o = const <String, Object?>{}]) {
  final now = o['now'] is DateTime ? o['now'] as DateTime : nowClock().toUtc();
  final stamp = now.toUtc().toIso8601String().replaceAll(RegExp(r'[-:]'), '').replaceFirst(RegExp(r'\.\d+'), '');
  final lines = <String>[
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexus//Resources//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  ];
  for (final e in events) {
    final date = e['date']?.toString() ?? '';
    final url = e['url']?.toString() ?? '';
    lines.addAll(<String>[
      'BEGIN:VEVENT',
      'UID:nexus-${e['rid']}-${e['kind']}-${_d8(date)}@nexus.local',
      'DTSTAMP:$stamp',
      'DTSTART;VALUE=DATE:${_d8(date)}',
      'DTEND;VALUE=DATE:${_d8(addDays(date, 1))}',
      'SUMMARY:${_icsEsc(e['title'])}',
      (e['details']?.toString() ?? '').isNotEmpty ? 'DESCRIPTION:${_icsEsc(e['details'])}' : '',
      RegExp(r'^https?://', caseSensitive: false).hasMatch(url) ? 'URL:$url' : '',
      'END:VEVENT',
    ]);
  }
  lines.add('END:VCALENDAR');
  return '${lines.where((x) => x.isNotEmpty).map(_fold).join('\r\n')}\r\n';
}

/// A link that opens Google Calendar with the event filled in.
String gcalLink(Map<String, Object?> e) {
  final date = e['date']?.toString() ?? '';
  final q = <String>[
    'action=TEMPLATE',
    'text=${Uri.encodeQueryComponent(e['title']?.toString() ?? '')}',
    'dates=${_d8(date)}%2F${_d8(addDays(date, 1))}',
    'details=${Uri.encodeQueryComponent(e['details']?.toString() ?? '')}',
  ].join('&');
  return 'https://calendar.google.com/calendar/render?$q';
}

String whatsappLink(String text) => 'https://wa.me/?text=${Uri.encodeComponent(text)}';

/// mailto: links break when very long, so the body is cut. `cut` tells you it happened.
Map<String, Object?> mailtoLink(String subject, String text, [int max = 1800]) {
  final cut = text.length > max;
  final body = cut ? '${text.substring(0, max)}\n...(cut, copy the full text instead)' : text;
  return <String, Object?>{
    'href': 'mailto:?subject=${Uri.encodeComponent(subject)}&body=${Uri.encodeComponent(body)}',
    'cut': cut,
  };
}
