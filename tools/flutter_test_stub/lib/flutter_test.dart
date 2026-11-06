// flutter_test.dart - STRICT local stand-in for the tiny part of flutter_test used by
// the pure-Dart golden tests. It is not Flutter. Anything it does not implement must
// fail at compile time (missing name) or at runtime (UnsupportedError), never pass.
import 'dart:async';
import 'dart:io';

int _total = 0;
int _passed = 0;
int _failed = 0;
int _skipped = 0;
bool _summaryScheduled = false;
final List<String> _groups = <String>[];

void _scheduleSummary() {
  if (_summaryScheduled) return;
  _summaryScheduled = true;
  Timer.run(() {
    print('SUMMARY total=$_total passed=$_passed failed=$_failed skipped=$_skipped');
    if (_failed > 0) exitCode = 1;
  });
}

void _noAsync(Object? result, String what) {
  if (result is Future) {
    throw UnsupportedError('$what are synchronous only in flutter_test stand-in');
  }
}

void group(String description, Function body) {
  _groups.add(description);
  try {
    _noAsync(body(), 'groups');
  } finally {
    _groups.removeLast();
  }
}

/// Supports only synchronous test bodies. An async body fails loudly.
void test(String description, Function body, {String? skip}) {
  _scheduleSummary();
  final name = <String>[..._groups, description].join(' ');
  _total++;
  if (skip != null) {
    _skipped++;
    print('SKIP $name ($skip)');
    return;
  }
  try {
    _noAsync(body(), 'tests');
    _passed++;
    print('PASS $name');
  } catch (e, st) {
    _failed++;
    print('FAIL $name');
    print(e);
    print(st);
  }
}

class TestFailure implements Exception {
  TestFailure(this.message);
  final String message;
  @override
  String toString() => 'TestFailure: $message';
}

Never fail(String message) => throw TestFailure(message);

abstract class Matcher {
  bool matches(Object? actual);
  String describe();
}

class _Equals implements Matcher {
  const _Equals(this.expected);
  final Object? expected;
  @override
  bool matches(Object? actual) => _deepEquals(actual, expected);
  @override
  String describe() => 'equals(${_show(expected)})';
}

class _IsNull implements Matcher {
  const _IsNull();
  @override
  bool matches(Object? actual) => actual == null;
  @override
  String describe() => 'isNull';
}

class _IsNotNull implements Matcher {
  const _IsNotNull();
  @override
  bool matches(Object? actual) => actual != null;
  @override
  String describe() => 'isNotNull';
}

class _IsTrue implements Matcher {
  const _IsTrue();
  @override
  bool matches(Object? actual) => actual == true;
  @override
  String describe() => 'isTrue';
}

class _IsFalse implements Matcher {
  const _IsFalse();
  @override
  bool matches(Object? actual) => actual == false;
  @override
  String describe() => 'isFalse';
}

class _IsEmpty implements Matcher {
  const _IsEmpty();
  @override
  bool matches(Object? actual) {
    if (actual == null) return false;
    if (actual is String) return actual.isEmpty;
    if (actual is List) return actual.isEmpty;
    if (actual is Map) return actual.isEmpty;
    if (actual is Set) return actual.isEmpty;
    throw UnsupportedError('isEmpty does not support ${actual.runtimeType}');
  }

  @override
  String describe() => 'isEmpty';
}

class _IsNotEmpty implements Matcher {
  const _IsNotEmpty();
  @override
  bool matches(Object? actual) {
    if (actual == null) return false;
    if (actual is String) return actual.isNotEmpty;
    if (actual is List) return actual.isNotEmpty;
    if (actual is Map) return actual.isNotEmpty;
    if (actual is Set) return actual.isNotEmpty;
    throw UnsupportedError('isNotEmpty does not support ${actual.runtimeType}');
  }

  @override
  String describe() => 'isNotEmpty';
}

class _Contains implements Matcher {
  const _Contains(this.value);
  final Object? value;
  @override
  bool matches(Object? actual) {
    if (actual is String) return actual.contains(value.toString());
    if (actual is List) return actual.any((x) => _deepEquals(x, value));
    if (actual is Set) return actual.any((x) => _deepEquals(x, value));
    if (actual is Map) return actual.containsKey(value);
    throw UnsupportedError('contains does not support ${actual.runtimeType}');
  }

  @override
  String describe() => 'contains(${_show(value)})';
}

class _HasLength implements Matcher {
  const _HasLength(this.length);
  final int length;
  @override
  bool matches(Object? actual) {
    if (actual is String) return actual.length == length;
    if (actual is List) return actual.length == length;
    if (actual is Map) return actual.length == length;
    if (actual is Set) return actual.length == length;
    throw UnsupportedError('hasLength does not support ${actual.runtimeType}');
  }

  @override
  String describe() => 'hasLength($length)';
}

Matcher equals(Object? expected) => _Equals(expected);
const Matcher isNull = _IsNull();
const Matcher isNotNull = _IsNotNull();
const Matcher isTrue = _IsTrue();
const Matcher isFalse = _IsFalse();
const Matcher isEmpty = _IsEmpty();
const Matcher isNotEmpty = _IsNotEmpty();
Matcher contains(Object? value) => _Contains(value);
Matcher hasLength(int length) => _HasLength(length);

void expect(Object? actual, Object? matcherOrValue) {
  final ok = matcherOrValue is Matcher
      ? matcherOrValue.matches(actual)
      : _deepEquals(actual, matcherOrValue);
  if (!ok) {
    final label =
        matcherOrValue is Matcher ? matcherOrValue.describe() : 'equals(${_show(matcherOrValue)})';
    throw TestFailure('Expected: $label\n  Actual: ${_show(actual)}\n  Which: does not match');
  }
}

bool _deepEquals(Object? a, Object? b) {
  if (a == null && b == null) return true;
  if (a is num && b is num) return (a - b).abs() < 0.000001;
  if (a is String && b is String) return a == b;
  if (a is bool && b is bool) return a == b;
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_deepEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final k in a.keys) {
      if (!b.containsKey(k) || !_deepEquals(a[k], b[k])) return false;
    }
    return true;
  }
  if (a is Set && b is Set) {
    if (a.length != b.length) return false;
    return a.every((x) => b.any((y) => _deepEquals(x, y)));
  }
  return a == b;
}

String _show(Object? v) => v == null ? 'null' : v.toString();
