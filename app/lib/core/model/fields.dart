// fields.dart - the extra facts each kind of resource carries (cost, free
// limit, handle ...) plus the fields you add yourself. Port of fields.js.
import '../util.dart';
import 'resource.dart';

const List<String> _toolish = <String>[
  'web-tool',
  'ai-source',
  'article-site',
  'catalogue',
  'docs',
  'other',
];

class FieldDef {
  const FieldDef({
    required this.key,
    required this.label,
    required this.kind,
    this.options = const <String>[],
    this.types,
    this.ph,
    this.custom = false,
  });

  final String key;
  final String label;
  final String kind;
  final List<String> options;

  /// null means every resource type.
  final List<String>? types;
  final String? ph;
  final bool custom;

  factory FieldDef.fromJson(Object? raw) {
    final m = raw is Map ? raw : const <Object?, Object?>{};
    final options = m['options'];
    final types = m['types'];
    return FieldDef(
      key: m['key']?.toString() ?? '',
      label: m['label']?.toString() ?? '',
      kind: m['kind']?.toString() ?? 'text',
      options: options is List
          ? options.map((x) => x.toString()).toList()
          : const <String>[],
      types: types is List
          ? types.map((x) => x.toString()).toList()
          : null,
      ph: m['ph']?.toString(),
      custom: true,
    );
  }

  Map<String, Object?> toJson() {
    final out = <String, Object?>{
      'key': key,
      'label': label,
      'kind': kind,
    };
    if (options.isNotEmpty || custom) out['options'] = options;
    if (ph != null) out['ph'] = ph;
    out['types'] = types;
    return out;
  }
}

const List<FieldDef> BUILTIN = <FieldDef>[
  FieldDef(
    key: 'cost',
    label: 'Cost',
    kind: 'choice',
    options: <String>['Free', 'Free with limits', 'Paid', 'Unknown'],
  ),
  FieldDef(
    key: 'login',
    label: 'Login needed',
    kind: 'choice',
    options: <String>['No', 'Yes', 'Not sure'],
    types: _toolish,
  ),
  FieldDef(
    key: 'device',
    label: 'Works on',
    kind: 'choice',
    options: <String>['Phone', 'Computer', 'Both'],
    types: <String>['web-tool', 'ai-source'],
  ),
  FieldDef(
    key: 'limit',
    label: 'Free limit',
    kind: 'text',
    ph: 'e.g. 1.3M tokens free',
    types: <String>['ai-source', 'web-tool'],
  ),
  FieldDef(
    key: 'resets',
    label: 'Limit resets or offer ends',
    kind: 'date',
    types: <String>['ai-source', 'web-tool'],
  ),
  FieldDef(
    key: 'models',
    label: 'Models or features you use',
    kind: 'text',
    ph: 'e.g. DeepSeek, GLM',
    types: <String>['ai-source'],
  ),
  FieldDef(
    key: 'handle',
    label: 'Handle or channel name',
    kind: 'text',
    ph: '@name',
    types: <String>['social', 'youtube-channel', 'community'],
  ),
  FieldDef(
    key: 'purpose',
    label: 'What you use it for',
    kind: 'choice',
    options: <String>[
      'Reminders',
      'Opportunities',
      'Learning',
      'Inspiration',
      'News',
    ],
    types: <String>['social'],
  ),
  FieldDef(
    key: 'platform',
    label: 'Platform',
    kind: 'choice',
    options: <String>[
      'Discord',
      'WhatsApp',
      'Telegram',
      'Slack',
      'Forum',
      'Other',
    ],
    types: <String>['community'],
  ),
  FieldDef(
    key: 'askFor',
    label: 'Ask here about',
    kind: 'text',
    ph: 'e.g. scholarships, maths help',
    types: <String>['community'],
  ),
  FieldDef(
    key: 'focus',
    label: 'Watch it for',
    kind: 'text',
    ph: 'e.g. study methods',
    types: <String>['youtube-channel'],
  ),
  FieldDef(
    key: 'watch',
    label: 'How often you watch',
    kind: 'choice',
    options: <String>['Daily', 'Weekly', 'When needed'],
    types: <String>['youtube-channel'],
  ),
];

final Map<String, FieldDef> BUILTIN_BY_KEY = <String, FieldDef>{
  for (final d in BUILTIN) d.key: d,
};

const List<String> CUSTOM_KINDS = <String>['text', 'choice', 'date'];

const Map<String, String> KIND_LABEL = <String, String>{
  'text': 'Text',
  'choice': 'Choice',
  'date': 'Date',
};

final RegExp _keyRx = RegExp(r'^[a-zA-Z][A-Za-z0-9_]{0,24}$');
final RegExp _customKeyRx = RegExp(r'^c_[a-z0-9_]{1,22}$');

/// Key for a field you add: c_ plus the label in lower case letters and digits.
String keyFor(Object? label) {
  var s = (label == null ? '' : label.toString())
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');
  if (s.length > 20) s = s.substring(0, 20);
  return 'c_$s';
}

/// Clean the list of your own fields. Drops anything malformed, never throws.
List<FieldDef> normCustom(Object? list, [List<String>? validTypes]) {
  final out = <FieldDef>[];
  final seen = BUILTIN.map((d) => d.key).toSet();
  final source = list is List ? list : const <dynamic>[];
  for (final x in source) {
    if (x is! Map) continue;
    var label = (x['label'] ?? '').toString().trim();
    if (label.length > 30) label = label.substring(0, 30);
    if (label.isEmpty) continue;
    final lower = label.toLowerCase();
    if (BUILTIN.any((d) => d.label.toLowerCase() == lower) ||
        out.any((d) => d.label.toLowerCase() == lower)) {
      continue;
    }
    var key = (x['key'] ?? '').toString().trim();
    if (!_customKeyRx.hasMatch(key)) key = keyFor(label);
    if (key == 'c_' || seen.contains(key)) continue;
    final rawKind = x['kind']?.toString() ?? '';
    final kind = CUSTOM_KINDS.contains(rawKind) ? rawKind : 'text';
    var options = <String>[];
    if (kind == 'choice') {
      final rawOptions = x['options'];
      final pieces = rawOptions is List
          ? rawOptions
          : (rawOptions ?? '').toString().split(',');
      options = pieces
          .map((o) => o.toString().trim())
          .map((o) => o.length > 24 ? o.substring(0, 24) : o)
          .where((o) => o.isNotEmpty)
          .toSet()
          .take(12)
          .toList();
      if (options.isEmpty) continue;
    }
    final rawTypes = x['types'];
    final types = (rawTypes is List ? rawTypes : const <dynamic>[])
        .map((t) => t.toString())
        .where((t) => validTypes == null || validTypes.contains(t))
        .toList();
    seen.add(key);
    out.add(FieldDef(
      key: key,
      label: label,
      kind: kind,
      options: options,
      types: types,
      custom: true,
    ));
    if (out.length >= 12) break;
  }
  return out;
}

/// Keep only short text under safe keys. A "resets" value must be a real date.
/// Same as normFields in legacy/web-src/js/fields.js.
Map<String, String> normFields(Object? f) {
  final out = <String, String>{};
  if (f is! Map) return out;
  for (final entry in f.entries) {
    final key = entry.key.toString();
    if (!_keyRx.hasMatch(key)) continue;
    final value = entry.value;
    if (value is! String && value is! num) continue;
    var s = value.toString().trim();
    if (s.length > 200) s = s.substring(0, 200);
    if (s.isEmpty) continue;
    if (key == 'resets' && parseISO(s) == null) continue;
    out[key] = key == 'resets' && s.length > 10 ? s.substring(0, 10) : s;
  }
  return out;
}

/// Fields that apply to a type: built-ins first, then your own that cover it.
List<FieldDef> defsFor(String type, [List<FieldDef> custom = const []]) => <
    FieldDef>[
  ...BUILTIN.where((d) => d.types == null || d.types!.contains(type)),
  ...custom.where((d) => d.types == null || d.types!.isEmpty || d.types!.contains(type)),
];

List<FieldDef> allDefs([List<FieldDef> custom = const []]) => <FieldDef>[
      ...BUILTIN,
      ...custom,
    ];

FieldDef? defOf(String key, [List<FieldDef> custom = const []]) {
  final built = BUILTIN_BY_KEY[key];
  if (built != null) return built;
  for (final d in custom) {
    if (d.key == key) return d;
  }
  return null;
}

String labelOf(String key, [List<FieldDef> custom = const []]) =>
    defOf(key, custom)?.label ?? key;

class FilledField {
  FilledField(this.def, this.value);
  final FieldDef def;
  final String value;
  Map<String, Object?> toJson() =>
      <String, Object?>{'key': def.key, 'value': value};
}

/// [{def, value}] for fields that have a value, in a stable order.
List<FilledField> filled(Resource r, [List<FieldDef> custom = const []]) {
  final f = r.fields;
  final seen = <String>{};
  final out = <FilledField>[];
  for (final d in defsFor(r.type, custom)) {
    seen.add(d.key);
    final value = f[d.key];
    if (value != null && value.isNotEmpty) out.add(FilledField(d, value));
  }
  for (final key in f.keys) {
    if (seen.contains(key)) continue;
    final d = defOf(key, custom);
    if (d != null) out.add(FilledField(d, f[key]!));
  }
  return out;
}

/// One line of facts, for lists and exports: "Free · 1.3M tokens free".
String summaryOf(
  Resource r, [
  List<FieldDef> custom = const [],
  List<String> skip = const [],
]) =>
    filled(r, custom)
        .where((x) => !skip.contains(x.def.key))
        .map((x) => x.value)
        .join(' · ');
