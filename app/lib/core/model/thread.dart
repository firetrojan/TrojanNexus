// thread.dart - a mission (Thread) and its steps, normalized like normalizeThread in store.js.
import '../util.dart';

class Step {
  Step({this.rid = '', this.note = '', this.done = false, this.doneAt = ''});

  String rid;
  String note;
  bool done;
  String doneAt;

  factory Step.fromJson(Map<String, dynamic> json) => Step(
        rid: json['rid']?.toString() ?? '',
        note: json['note']?.toString() ?? '',
        done: json['done'] == true,
        doneAt: json['doneAt']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'rid': rid,
        'note': note,
        'done': done,
        'doneAt': doneAt,
      };
}

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

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

class Thread {
  Thread({
    this.id = '',
    this.name = 'Mission',
    this.note = '',
    this.lastDone = '',
    List<Step>? steps,
  }) : steps = steps ?? <Step>[];

  String id;
  String name;
  String note;
  String lastDone;
  List<Step> steps;

  factory Thread.fromJson(Map<String, dynamic> json) => normalizeThread(json);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'name': name,
        'note': note,
        'lastDone': lastDone,
        'steps': steps.map((s) => s.toJson()).toList(),
      };
}

/// Clean a Thread map. Old files may have plain step id strings.
Thread normalizeThread(Object? raw) {
  final t = _map(raw);
  final idValue = t['id'];
  final nameValue = t['name'];
  final rawSteps = t['steps'];
  final steps = <Step>[];
  if (rawSteps is List) {
    for (final item in rawSteps) {
      if (item is String) {
        if (item.isNotEmpty) steps.add(Step(rid: item));
      } else if (item is Map) {
        final s = _map(item);
        final rid = _orEmpty(s['rid'] ?? s['id']);
        if (rid.isEmpty) continue;
        steps.add(Step(
          rid: rid,
          note: _orEmpty(s['note']),
          done: _truthy(s['done']),
          doneAt: _orEmpty(s['doneAt']),
        ));
      }
    }
  }
  return Thread(
    id: _truthy(idValue) ? idValue.toString() : uid('t'),
    name: _truthy(nameValue) ? nameValue.toString().trim() : 'Mission',
    note: _orEmpty(t['note']),
    lastDone: _orEmpty(t['lastDone']),
    steps: steps,
  );
}
