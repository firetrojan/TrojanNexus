// golden.dart - reads the answer key in fixtures/golden/<module>.json and runs it as tests.
// Used by every module test. Integrator-only: if you need a change here, write docs/requests/.
// "dynamic" is allowed in this file because JSON has no types.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// A function under test: takes the "in" list of a case, returns what the JS returned (as plain JSON-like data).
typedef GoldenFn = Object? Function(List<dynamic> args);

class GoldenCase {
  GoldenCase(this.fn, this.args, this.out, this.note);
  final String fn;
  final List<dynamic> args;
  final dynamic out;
  final String note;
}

Directory _goldenDir() {
  var d = Directory.current.absolute;
  for (var i = 0; i < 6; i++) {
    final g = Directory('${d.path}${Platform.pathSeparator}fixtures${Platform.pathSeparator}golden');
    if (g.existsSync()) return g;
    d = d.parent;
  }
  throw StateError('fixtures/golden not found above ${Directory.current.path}');
}

dynamic _readJson(String name) {
  final f = File('${_goldenDir().path}${Platform.pathSeparator}$name');
  return jsonDecode(f.readAsStringSync());
}

/// Read another fixture file, for multi-file modules such as the store.
dynamic readGolden(String name) => _readJson(name);

/// The shared link list that many cases mean when their input says "$RS".
List<dynamic> sharedLinks() {
  final m = _readJson('_shared_links.json') as Map<String, dynamic>;
  return m['resources'] as List<dynamic>;
}

List<GoldenCase> loadGolden(String module) {
  final m = _readJson('$module.json') as Map<String, dynamic>;
  final shared = sharedLinks();
  final out = <GoldenCase>[];
  for (final c in m['cases'] as List<dynamic>) {
    final cm = c as Map<String, dynamic>;
    final args = (cm['in'] as List<dynamic>).map((a) => a == r'$RS' ? shared : a).toList();
    out.add(GoldenCase(cm['fn'] as String, args, cm['out'], (cm['note'] as String?) ?? ''));
  }
  return out;
}

/// Same data? Numbers compare by value (2 equals 2.0), maps by keys, lists by order.
bool jsonEquals(dynamic a, dynamic b) {
  if (a == null && b == null) return true;
  if (a is num && b is num) return (a - b).abs() < 0.000001;
  if (a is String && b is String) return a == b;
  if (a is bool && b is bool) return a == b;
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!jsonEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    final keys = <dynamic>{...a.keys, ...b.keys};
    for (final k in keys) {
      final av = a.containsKey(k) ? a[k] : null;
      final bv = b.containsKey(k) ? b[k] : null;
      if (!jsonEquals(av, bv)) return false;
    }
    return true;
  }
  return false;
}

String _show(dynamic v) {
  try {
    return jsonEncode(v, toEncodable: (o) => o.toString());
  } catch (_) {
    return v.toString();
  }
}

/// Runs every golden case of [module]. A case whose function is not in [impl] is SKIPPED (not ported yet), never deleted.
/// [impl] maps the JS function name to a Dart adapter, for example:
///   'cleanUrl': (a) => cleanUrl(a[0] as String?)
void runGolden(String module, Map<String, GoldenFn> impl) {
  final cases = loadGolden(module);
  group('golden $module', () {
    var n = 0;
    for (final c in cases) {
      n++;
      final f = impl[c.fn];
      final label = '${c.fn} #$n';
      if (f == null) {
        test(label, () {}, skip: 'not ported yet');
        continue;
      }
      test(label, () {
        final actual = f(c.args);
        if (!jsonEquals(actual, c.out)) {
          fail('${c.fn}(${_show(c.args)})\n  expected: ${_show(c.out)}\n  actual:   ${_show(actual)}\n  ${c.note}');
        }
      });
    }
  });
}
