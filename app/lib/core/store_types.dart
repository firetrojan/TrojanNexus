// store_types.dart - small shared types and JSON-edge helpers for the store.
import 'util.dart';

/// The clock is injected so tests can freeze "now" and "today".
class Clock {
  Clock({DateTime Function()? now}) : _now = now ?? DateTime.now;

  final DateTime Function() _now;

  DateTime now() => _now();

  int nowMs() => now().millisecondsSinceEpoch;

  String today() => iso(now());
}

/// The moment something happened, as an ISO instant (same as new Date().toISOString() in store.js).
/// `clock.now()` is a DateTime that holds a real point in time; `.toUtc()` moves that point to UTC
/// without changing it, so the printed instant is the real one - never the local wall time with a
/// Z glued on.
String instantNow(Clock clock) => clock.now().toUtc().toIso8601String();

typedef IdGen = String Function(String prefix);

class StoreError implements Exception {
  StoreError(this.message);
  final String message;

  @override
  String toString() => message;
}

Map<String, Object?> storeMap(Object? raw) {
  if (raw is! Map) return <String, Object?>{};
  final out = <String, Object?>{};
  raw.forEach((key, value) => out[key.toString()] = value);
  return out;
}

bool storeTruthy(Object? v) => v != null && v != false && v != 0 && v != '';

String storeText(Object? v) => v == null ? '' : v.toString();

const Map<String, String> storeStageLabels = <String, String>{
  'candidate': 'To try',
  'testing': 'Trial',
  'active': 'Active',
  'archived': 'Archived',
};

String cutText(String s, int n) => s.length > n ? s.substring(0, n) : s;
