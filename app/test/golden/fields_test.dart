import 'package:nexus/core/model/fields.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

List<FieldDef> _custom(Object? raw) =>
    (raw as List<dynamic>? ?? <dynamic>[])
        .map((x) => FieldDef.fromJson(x))
        .toList();

List<String>? _validTypes(Object? raw) => raw == null
    ? null
    : (raw as List<dynamic>).map((x) => x.toString()).toList();

void main() {
  runGolden('fields', {
    'normFields': (a) => normFields(a[0]),
    'keyFor': (a) => keyFor(a[0]),
    'normCustom': (a) => normCustom(a[0], _validTypes(a[1]))
        .map((x) => x.toJson())
        .toList(),
    'defsFor': (a) => defsFor(a[0] as String, _custom(a[1]))
        .map((x) => x.key)
        .toList(),
    'allDefs': (a) => allDefs(_custom(a[0])).map((x) => x.key).toList(),
    'defOf': (a) => defOf(a[0] as String, _custom(a[1]))?.toJson(),
    'labelOf': (a) => labelOf(a[0] as String, _custom(a[1])),
    'filled': (a) => filled(normalizeResource(a[0]), _custom(a[1]))
        .map((x) => x.toJson())
        .toList(),
    'summaryOf': (a) => summaryOf(
          normalizeResource(a[0]),
          _custom(a[1]),
          (a[2] as List<dynamic>).map((x) => x.toString()).toList(),
        ),
    'BUILTIN': (a) => BUILTIN.map((x) => x.toJson()).toList(),
    'CUSTOM_KINDS': (a) => CUSTOM_KINDS,
    'KIND_LABEL': (a) => KIND_LABEL,
  });
}
