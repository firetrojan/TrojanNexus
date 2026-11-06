// rules.dart - smart sector rules: cleaning, reading and matching.
// Port of the pure parts of legacy/web-src/js/rules.js.
import 'model/fields.dart';
import 'model/resource.dart';
import 'model/rule.dart';
import 'util.dart';

const Set<String> ruleOps = <String>{
  'is', 'not', 'contains', 'has', 'nohas', 'filled', 'empty',
  'soon', 'older', 'yes', 'no',
};

const Set<String> _needsValue = <String>{
  'is', 'not', 'contains', 'has', 'nohas', 'soon', 'older',
};

bool needsValue(String op) => _needsValue.contains(op);

final RegExp _condField = RegExp(r'^[A-Za-z][A-Za-z0-9_]*$');

String _text(Object? v) {
  if (v == null || v == false || v == 0 || v == '') return '';
  return v.toString();
}

String _cut(String s, int n) => s.length > n ? s.substring(0, n) : s;

int _leadingInt(String s) {
  final m = RegExp(r'^\s*([+-]?\d+)').firstMatch(s);
  return m == null ? 0 : (int.tryParse(m[1]!) ?? 0);
}

/// Clean a rule from a backup or a form. Returns null when it cannot be used.
Rule? normRule(Object? x) {
  if (x is! Map) return null;
  final m = x.cast<String, Object?>();
  final rawConds = m['conds'];
  if (rawConds is! List) return null;
  final conds = <Cond>[];
  for (final item in rawConds) {
    if (item is! Map) continue;
    final c = item.cast<String, Object?>();
    final f = _cut(_text(c['f']), 30);
    final op = c['op'] == null ? '' : c['op'].toString();
    if (!_condField.hasMatch(f) || !ruleOps.contains(op)) continue;
    var v = (c['v'] == null ? '' : c['v'].toString()).trim();
    if (v.length > 60) v = v.substring(0, 60);
    if (_needsValue.contains(op) && v.isEmpty) continue;
    conds.add(Cond(f: f, op: op, v: _needsValue.contains(op) ? v : ''));
    if (conds.length >= 8) break;
  }
  if (conds.isEmpty) return null;
  return Rule(match: m['match'] == 'any' ? 'any' : 'all', conds: conds);
}

bool mentionsStatus(Rule? rule) =>
    rule != null && rule.conds.any((c) => c.f == 'status');

bool _mentionsStatusRaw(Map<String, Object?> rule) {
  final conds = rule['conds'];
  if (conds is! List) return false;
  for (final item in conds) {
    if (item is Map && item['f'] == 'status') return true;
  }
  return false;
}

String _norm(Object? v) {
  if (v is List) {
    return v.map((x) => x.toString().trim().toLowerCase()).join(',');
  }
  return (v == null ? '' : v.toString()).trim().toLowerCase();
}

Object? _read(Resource r, String key, String today) {
  switch (key) {
    case 'type':
      return r.type;
    case 'status':
      return r.status;
    case 'tag':
      return r.tags;
    case 'topic':
      return r.scan?.topic ?? '';
    case 'cadence':
      return r.checkCadence;
    case 'draft':
      return r.draft;
    case 'text':
      return '${r.title} ${r.url} ${r.notes}';
    case 'lastChecked': {
      final from = r.lastChecked.isNotEmpty
          ? r.lastChecked
          : (r.createdAt.isNotEmpty ? r.createdAt : today);
      return daysBetween(from, today);
    }
    case 'trialEnd':
      return r.trialEnd;
    default:
      return r.fields[key] ?? '';
  }
}

bool _condMatchesValue(Object? v, String op, String rawWant, String today) {
  final want = _norm(rawWant);
  switch (op) {
    case 'is':
      return _norm(v) == want;
    case 'not':
      return _norm(v) != want;
    case 'contains':
      return want.isNotEmpty && _norm(v).contains(want);
    case 'has': {
      final tagWant = want.startsWith('#') ? want.substring(1) : want;
      return v is List && v.any((t) => _norm(t) == tagWant);
    }
    case 'nohas': {
      final tagWant = want.startsWith('#') ? want.substring(1) : want;
      return v is List && !v.any((t) => _norm(t) == tagWant);
    }
    case 'filled':
      return _norm(v).isNotEmpty;
    case 'empty':
      return _norm(v).isEmpty;
    case 'soon': {
      if (v is! String || v.isEmpty || parseISO(v) == null) return false;
      final n = _leadingInt(rawWant);
      return v.compareTo(addDays(today, n < 0 ? 0 : n)) <= 0;
    }
    case 'older': {
      final n = _leadingInt(rawWant);
      return v is num && v > (n < 0 ? 0 : n);
    }
    case 'yes':
      return v == true;
    case 'no':
      return v == false;
    default:
      return false;
  }
}

bool condMatches(Resource r, Cond c, [String? today]) {
  final day = today ?? todayISO();
  return _condMatchesValue(_read(r, c.f, day), c.op, c.v, day);
}

/// Match a raw rule map exactly as JS matches() does. Used by the golden test.
bool matchesRaw(Resource r, Map<String, Object?>? rule, [String? today]) {
  if (rule == null) return false;
  final conds = rule['conds'];
  if (conds is! List || conds.isEmpty) return false;
  if (r.status == 'archived' && !_mentionsStatusRaw(rule)) return false;
  final day = today ?? todayISO();
  bool one(Object? item) {
    if (item is! Map) return false;
    final c = item.cast<String, Object?>();
    return _condMatchesValue(
      _read(r, _text(c['f']), day),
      c['op'] == null ? '' : c['op'].toString(),
      c['v'] == null ? '' : c['v'].toString(),
      day,
    );
  }

  return rule['match'] == 'any' ? conds.any(one) : conds.every(one);
}

/// Does this resource match the rule? Same as matches(r, rule, today) in rules.js.
bool matches(Resource r, Rule? rule, [String? today]) =>
    rule == null
        ? false
        : matchesRaw(r, rule.toJson().cast<String, Object?>(), today);

const Map<String, String> OPS = <String, String>{
  'is': 'is', 'not': 'is not', 'contains': 'contains',
  'has': 'has the tag', 'nohas': 'does not have the tag',
  'filled': 'is filled in', 'empty': 'is empty',
  'soon': 'is within the next (days) or has passed',
  'older': 'not checked for more than (days)', 'yes': 'is yes', 'no': 'is no',
};

const Map<String, List<String>> _byKind = <String, List<String>>{
  'choice': <String>['is', 'not', 'filled', 'empty'],
  'text': <String>['contains', 'is', 'not', 'filled', 'empty'],
  'tags': <String>['has', 'nohas'], 'date': <String>['soon', 'filled', 'empty'],
  'age': <String>['older'], 'bool': <String>['yes', 'no'],
};

List<String> opsFor(String kind) => _byKind[kind] ?? const <String>[];

class FieldOption {
  const FieldOption(this.v, this.l);
  final String v;
  final String l;
  Map<String, Object?> toJson() => <String, Object?>{'v': v, 'l': l};
}

class RuleField {
  RuleField({
    required this.key,
    required this.label,
    required this.kind,
    this.options,
  });

  final String key;
  final String label;
  final String kind;
  final List<FieldOption>? options;

  Map<String, Object?> toJson() => <String, Object?>{
        'key': key,
        'label': label,
        'kind': kind,
        'options': options?.map((x) => x.toJson()).toList(),
      };
}

class Topic {
  const Topic(this.id, this.label);
  final String id;
  final String label;
}

const List<Topic> TOPICS = <Topic>[
  Topic('health', 'Health & wellness'), Topic('fitness', 'Fitness & training'),
  Topic('nature', 'Nature & wildlife'), Topic('space', 'Space & astronomy'),
  Topic('science', 'Science & research'), Topic('maths', 'Maths'),
  Topic('tech', 'Technology & coding'), Topic('ai', 'AI & machine learning'),
  Topic('business', 'Business & startups'), Topic('finance', 'Money & investing'),
  Topic('education', 'Study & exams'), Topic('jobs', 'Jobs & opportunities'),
  Topic('languages', 'Language learning'), Topic('art', 'Art & illustration'),
  Topic('design', 'Design'), Topic('animation', 'Animation & film'),
  Topic('photography', 'Photography & video'), Topic('music', 'Music & audio'),
  Topic('books', 'Books & writing'), Topic('history', 'History & culture'),
  Topic('mind', 'Philosophy & psychology'),
  Topic('motivation', 'Motivation & self-improvement'),
  Topic('news', 'News & politics'), Topic('food', 'Food & cooking'),
  Topic('travel', 'Travel & places'), Topic('fashion', 'Fashion & beauty'),
  Topic('sports', 'Sports'), Topic('gaming', 'Gaming'),
  Topic('humor', 'Humour & memes'), Topic('spirit', 'Spirituality & religion'),
  Topic('machines', 'Cars, bikes & aviation'), Topic('diy', 'DIY & crafts'),
  Topic('society', 'Society & causes'), Topic('pets', 'Pets'),
];

FieldOption _option(Object? x) {
  if (x is Map) {
    final v = x['v']?.toString() ?? '';
    return FieldOption(v, x['l']?.toString() ?? v);
  }
  final v = x?.toString() ?? '';
  return FieldOption(v, v);
}

List<FieldOption> _options(Object? raw) =>
    (raw is List ? raw : const <Object?>[]).map(_option).toList();

/// Everything a rule can look at. Labels come from the screens through ctx.
List<RuleField> ruleFields([Map<String, Object?>? ctx]) {
  final c = ctx ?? const <String, Object?>{};
  final rawCustom = c['custom'];
  final custom = rawCustom is List
      ? rawCustom.map((x) => FieldDef.fromJson(x)).toList()
      : <FieldDef>[];
  final out = <RuleField>[
    RuleField(
      key: 'type',
      label: 'Type',
      kind: 'choice',
      options: _options(c['types']),
    ),
    RuleField(
      key: 'status',
      label: 'Stage',
      kind: 'choice',
      options: _options(c['statuses']),
    ),
    RuleField(key: 'tag', label: 'Tag', kind: 'tags'),
    RuleField(
      key: 'topic',
      label: 'Topic (what it is about)',
      kind: 'choice',
      options: TOPICS.map((t) => FieldOption(t.id, t.label)).toList(),
    ),
    RuleField(
      key: 'cadence',
      label: 'Check schedule',
      kind: 'choice',
      options: _options(c['cadences']),
    ),
    RuleField(key: 'draft', label: 'To review', kind: 'bool'),
    RuleField(key: 'text', label: 'Name, link or notes', kind: 'text'),
    RuleField(key: 'lastChecked', label: 'Last checked', kind: 'age'),
    RuleField(key: 'trialEnd', label: 'Trial ends', kind: 'date'),
  ];
  for (final d in allDefs(custom)) {
    out.add(RuleField(
      key: d.key,
      label: d.label,
      kind: d.kind,
      options: d.kind == 'choice'
          ? d.options.map((x) => FieldOption(x, x)).toList()
          : null,
    ));
  }
  return out;
}

class RulePreset {
  RulePreset(this.id, this.label, this.rule);
  final String id;
  final String label;
  final Rule rule;
  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'label': label,
        'rule': rule.toJson(),
      };
}

final List<RulePreset> PRESETS = <RulePreset>[
  RulePreset(
    'free-ai',
    'Free AI sources',
    Rule(match: 'all', conds: <Cond>[
      Cond(f: 'type', op: 'is', v: 'ai-source'),
      Cond(f: 'cost', op: 'not', v: 'Paid'),
    ]),
  ),
  RulePreset(
    'attention',
    'Needs attention this week',
    Rule(match: 'any', conds: <Cond>[
      Cond(f: 'resets', op: 'soon', v: '7'),
      Cond(f: 'trialEnd', op: 'soon', v: '7'),
      Cond(f: 'lastChecked', op: 'older', v: '60'),
    ]),
  ),
  RulePreset('trials', 'Trials running',
      Rule(conds: <Cond>[Cond(f: 'status', op: 'is', v: 'testing')])),
  RulePreset('totry', 'Still to try',
      Rule(conds: <Cond>[Cond(f: 'status', op: 'is', v: 'candidate')])),
  RulePreset('ask', 'Places to ask people',
      Rule(conds: <Cond>[Cond(f: 'type', op: 'is', v: 'community')])),
  RulePreset('freephone', 'Free and works on a phone',
      Rule(conds: <Cond>[
        Cond(f: 'cost', op: 'is', v: 'Free'),
        Cond(f: 'device', op: 'not', v: 'Computer'),
      ])),
];

const Map<String, String> _opWord = <String, String>{
  'is': 'is',
  'not': 'is not',
  'contains': 'contains',
  'has': 'has tag',
  'nohas': 'has no tag',
  'filled': 'is filled in',
  'empty': 'is empty',
  'yes': 'is yes',
  'no': 'is no',
};

/// "Type is AI and Cost is not Paid".
String describeRule(Rule? rule, [Map<String, Object?>? ctx]) {
  if (rule == null || rule.conds.isEmpty) return 'No rule yet';
  final fields = <String, RuleField>{
    for (final f in ruleFields(ctx)) f.key: f,
  };
  String one(Cond c) {
    final f = fields[c.f];
    final label = f?.label ?? c.f;
    var shown = c.v;
    if (f?.options != null) {
      for (final o in f!.options!) {
        if (o.v == c.v) {
          shown = o.l;
          break;
        }
      }
    }
    if (c.op == 'soon') return '$label within ${c.v} days or passed';
    if (c.op == 'older') return '$label more than ${c.v} days ago';
    return '$label ${_opWord[c.op] ?? c.op}'
        '${needsValue(c.op) ? ' $shown' : ''}';
  }

  return rule.conds
      .map(one)
      .join(rule.match == 'any' ? ' or ' : ' and ');
}
