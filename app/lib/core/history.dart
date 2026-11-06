// history.dart - port of legacy/web-src/js/history.js. One resource's short log.
import 'model/values.dart';

const int LOG_MAX = 25;
const Map<String, String> LOG_KINDS = <String, String>{
  'reviewed': 'Reviewed',
  'status': 'Stage',
  'checked': 'Checked',
  'verdict': 'Decision',
  'merged': 'Merged',
  'learned': 'Learned',
};

final RegExp _iso = RegExp(r'^\d{4}-\d{2}-\d{2}$');

String _text(Object? v) {
  if (v == null || v == false || v == 0 || v == '') return '';
  final s = v.toString();
  return s.length > 120 ? s.substring(0, 120) : s;
}

/// Clean a saved log: known kinds only, real dates, short text, newest last,
/// at most 25. Safe for null and old data.
List<LogEvent> normLog(Object? v) {
  if (v is! List) return <LogEvent>[];
  final out = <LogEvent>[];
  for (final e in v) {
    if (e is! Map) continue;
    final k = e['k'];
    final at = e['at'];
    if (k is! String || !LOG_KINDS.containsKey(k)) continue;
    if (at is! String || !_iso.hasMatch(at)) continue;
    out.add(LogEvent(at: at, k: k, t: _text(e['t'])));
  }
  if (out.length > LOG_MAX) {
    return out.sublist(out.length - LOG_MAX);
  }
  return out;
}

/// Add events ([[kind, text], ...]) dated today. The same event twice in a row
/// on one day is kept once, and a run of "checked" is kept as one line.
List<LogEvent> pushLog(Object? log, Object? events, String today) {
  final out = normLog(log);
  if (events is List) {
    for (final event in events) {
      if (event is! List || event.isEmpty) continue;
      final k = event[0];
      if (k is! String || !LOG_KINDS.containsKey(k)) continue;
      final text = _text(event.length > 1 ? event[1] : null);
      final last = out.isEmpty ? null : out.last;
      if (last != null && last.k == k && last.t == text && last.at == today) {
        continue;
      }
      if (last != null && last.k == 'checked' && k == 'checked') {
        out.removeLast();
      }
      out.add(LogEvent(at: today, k: k, t: text));
    }
  }
  if (out.length > LOG_MAX) {
    return out.sublist(out.length - LOG_MAX);
  }
  return out;
}

/// Newest first, ready to show.
List<LogEvent> showLog(Object? log) => normLog(log).reversed.toList();
