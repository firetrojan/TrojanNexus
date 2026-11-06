// job.dart - a sector (Job) model, normalized like normalizeJob in store.js.
import '../rules.dart';
import '../util.dart';
import 'rule.dart';

const List<String> jobColors = <String>[
  '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#FFCC00',
  '#32ADE6', '#FF3B30', '#00C7BE', '#5856D6', '#A2845E', '#8E8E93',
];

final RegExp _hexColor = RegExp(r'^#[0-9a-f]{6}$', caseSensitive: false);

Map<String, dynamic> _map(Object? raw) {
  if (raw is Map) {
    final out = <String, dynamic>{};
    raw.forEach((key, value) => out[key.toString()] = value);
    return out;
  }
  return <String, dynamic>{};
}

String _orEmpty(Object? v) {
  if (v == null || v == false || v == 0 || v == '') return '';
  return v.toString();
}

String _trim(Object? v) => _orEmpty(v).trim();

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

class Job {
  Job({
    this.id = '',
    this.name = 'Sector',
    this.color = '#007AFF',
    this.planetColor = '',
    this.icon = 'star',
    List<String>? members,
    this.slot,
    this.sealed = false,
    this.note = '',
    this.rule,
  }) : members = members ?? <String>[];

  String id;
  String name;
  String color;
  String planetColor;
  String icon;
  List<String> members;
  int? slot;
  bool sealed;
  String note;
  Rule? rule;

  factory Job.fromJson(Map<String, dynamic> json, [int index = 0]) =>
      normalizeJob(json, index);

  Map<String, dynamic> toJson() {
    final out = <String, dynamic>{
      'id': id,
      'name': name,
      'color': color,
      'planetColor': planetColor,
      'icon': icon,
      'members': members,
      'sealed': sealed,
      'note': note,
      'rule': rule?.toJson(),
    };
    if (slot != null) out['slot'] = slot;
    return out;
  }
}

/// Clean a Job map. Same field names and behaviour as normalizeJob in store.js.
Job normalizeJob(Object? raw, [int index = 0]) {
  final j = _map(raw);
  final idValue = j['id'];
  final colorValue = j['color'];
  final planetValue = j['planetColor'];
  final iconValue = j['icon'];
  final nameValue = j['name'];
  final membersRaw = j['members'];
  final members = membersRaw is List
      ? membersRaw.map((x) => x.toString()).toList()
      : <String>[];
  final slotValue = j['slot'];
  int? slot;
  if (slotValue is int) {
    slot = slotValue;
  } else if (slotValue is double && slotValue == slotValue.roundToDouble()) {
    slot = slotValue.toInt();
  }
  return Job(
    id: _truthy(idValue) ? idValue.toString() : uid('j'),
    name: _truthy(nameValue) ? _trim(nameValue) : 'Sector',
    color: colorValue is String && _hexColor.hasMatch(colorValue)
        ? colorValue
        : jobColors[index % jobColors.length],
    planetColor:
        planetValue is String && _hexColor.hasMatch(planetValue) ? planetValue : '',
    icon: _truthy(iconValue) ? iconValue.toString() : 'star',
    members: members,
    slot: slot,
    sealed: _truthy(j['sealed']),
    note: _orEmpty(j['note']),
    rule: normRule(j['rule']),
  );
}
