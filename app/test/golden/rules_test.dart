import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/rule.dart';
import 'package:nexus/core/rules.dart';

import 'golden.dart';

Rule? _rule(Object? raw) =>
    raw is Map ? Rule.fromJson(raw.cast<String, dynamic>()) : null;

Map<String, Object?>? _ctx(Object? raw) =>
    raw is Map ? raw.cast<String, Object?>() : null;

void main() {
  runGolden('rules', {
    'normRule': (a) => normRule(a[0])?.toJson(),
    'matches': (a) {
      final raw = a[0] as List<dynamic>;
      final rawRule = a[1];
      final rule = rawRule is Map ? rawRule.cast<String, Object?>() : null;
      final today = a[2] as String?;
      final out = <String>[];
      for (final item in raw) {
        final r = normalizeResource(item, today);
        if (matchesRaw(r, rule, today)) out.add(r.id);
      }
      return out;
    },
    'OPS': (a) => OPS,
    'PRESETS': (a) => PRESETS.map((x) => x.toJson()).toList(),
    'needsValue': (a) => needsValue(a[0] as String),
    'opsFor': (a) => opsFor(a[0] as String),
    'ruleFields': (a) => ruleFields(_ctx(a[0]))
        .map((x) => x.toJson())
        .toList(),
    'condMatches': (a) {
      final r = normalizeResource(a[0], a[2] as String?);
      final c = Cond.fromJson((a[1] as Map).cast<String, dynamic>());
      return condMatches(r, c, a[2] as String?);
    },
    'mentionsStatus': (a) => mentionsStatus(_rule(a[0])),
    'describeRule': (a) => describeRule(_rule(a[0]), _ctx(a[1])),
  });
}
