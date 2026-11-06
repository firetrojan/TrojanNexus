// exporters.dart - resources to text for other tools: tasks, Markdown, CSV, an AI brief, calendar files and links.
// Port of legacy/web-src/js/exporters.js.
import 'dart:math';

import 'model/fields.dart';
import 'model/job.dart';
import 'model/resource.dart';
import 'model/thread.dart';
import 'util.dart';

export 'export_calendar.dart';

class ExportState {
  ExportState({
    this.resources = const <Resource>[],
    this.jobs = const <Job>[],
    this.threads = const <Thread>[],
    this.custom = const <FieldDef>[],
  });

  factory ExportState.fromJson(Object? raw) {
    final m = raw is Map ? raw : const <Object?, Object?>{};
    List<Object?> list(String key) => m[key] is List ? (m[key] as List).cast<Object?>() : const <Object?>[];
    final settings = m['settings'] is Map ? m['settings'] as Map : const <Object?, Object?>{};
    final customRaw = settings['customFields'] is List ? settings['customFields'] as List : const <Object?>[];
    return ExportState(
      resources: list('resources')
          .whereType<Map>()
          .map((x) {
            final r = normalizeResource(x.cast<String, Object?>());
            r.src = x['src'] is String ? x['src'] as String : '';
            r.type = x['type'] is String ? x['type'] as String : '';
            r.nextCheck = x['nextCheck'] is String ? x['nextCheck'] as String : '';
            return r;
          })
          .toList(),
      jobs: list('jobs').whereType<Map>().toList().asMap().entries
          .map((e) => normalizeJob(e.value.cast<String, Object?>(), e.key))
          .toList(),
      threads: list('threads').whereType<Map>().map((x) => normalizeThread(x.cast<String, Object?>())).toList(),
      custom: customRaw.map(FieldDef.fromJson).toList(),
    );
  }

  final List<Resource> resources;
  final List<Job> jobs;
  final List<Thread> threads;
  final List<FieldDef> custom;
}

const Map<String, String> _typeNames = <String, String>{
  'web-tool': 'Tool',
  'article-site': 'Articles',
  'youtube-channel': 'YouTube',
  'ai-source': 'AI',
  'social': 'Social',
  'community': 'Community',
  'feed': 'Feed',
  'catalogue': 'Catalogue',
  'docs': 'Docs',
  'other': 'Other',
};
const Map<String, String> _stageNames = <String, String>{
  'candidate': 'To try',
  'testing': 'Trial',
  'active': 'Active',
  'archived': 'Archived',
};

String typeName(Object? t) => _typeNames[t] ?? (t == null ? '' : t.toString());
String stageName(Object? s) => _stageNames[s] ?? (s == null ? '' : s.toString());

String _one(Object? value) =>
    (value == null ? '' : value.toString()).replaceAll(RegExp(r'\s+'), ' ').trim();

String _mdEsc(Object? value) => _one(value).replaceAllMapped(RegExp(r'([\[\]\\])'), (m) => '\\${m[0]}');

List<FieldDef> _custom(Map<String, Object?> o, ExportState state) {
  final raw = o['custom'];
  if (raw is List) {
    return raw.map((x) => x is FieldDef ? x : FieldDef.fromJson(x)).toList();
  }
  return state.custom;
}

/// Resources in a sector (or all when no sector given), archived left out unless asked.
List<Resource> pick(ExportState state, [Map<String, Object?> o = const <String, Object?>{}]) {
  var list = List<Resource>.from(state.resources);
  final ids = o['ids'];
  final jobId = o['jobId'];
  if (ids is List && ids.isNotEmpty) {
    final set = ids.map((x) => x.toString()).toSet();
    list = list.where((r) => set.contains(r.id)).toList();
  } else if (jobId != null && jobId.toString().isNotEmpty) {
    final found = state.jobs.where((j) => j.id == jobId.toString()).toList();
    final set = (found.isEmpty ? <String>[] : found.first.members).toSet();
    list = list.where((r) => set.contains(r.id)).toList();
  }
  if (o['archived'] != true) list = list.where((r) => r.status != 'archived').toList();
  if (o['following'] == false) list = list.where((r) => r.src != 'following').toList();
  return list;
}

/// One task: first line is the title, the rest is a Markdown note.
String taskText(Object? items, [Map<String, Object?> o = const <String, Object?>{}]) {
  final list = items is List ? items.whereType<Resource>().toList() : <Resource>[if (items is Resource) items];
  final first = list.isEmpty ? null : list.first;
  final title = _one(o['title']).isNotEmpty
      ? _one(o['title'])
      : (first == null ? 'Task' : 'Use ${first.title}');
  final lines = <String>[title, ''];
  if (_one(o['goal']).isNotEmpty) {
    lines.add('Goal: ${_one(o['goal'])}');
    lines.add('');
  }
  lines.add(list.length > 1 ? 'Use these:' : 'Use this:');
  for (final r in list) {
    final why = r.useWhen.isNotEmpty ? ' (${_one(r.useWhen.first)})' : '';
    final link = r.url.isNotEmpty ? '[${_mdEsc(r.title)}](${r.url})' : _mdEsc(r.title);
    lines.add('- $link$why');
  }
  final steps = o['steps'];
  if (steps is List && steps.isNotEmpty) {
    lines.add('');
    lines.add('Steps:');
    for (final s in steps) {
      lines.add('- [ ] ${_one(s)}');
    }
  }
  return '${lines.join('\n').replaceAll(RegExp(r'\n{3,}'), '\n\n').trim()}\n';
}

/// A mission as one task with a checklist, one line per step.
String missionTask(Thread thread, Map<String, Resource> byId) {
  final items = <Resource>[];
  final steps = <String>[];
  for (final s in thread.steps) {
    final r = byId[s.rid];
    if (r == null) continue;
    items.add(r);
    final prefix = s.done ? '(done) ' : '';
    final note = s.note.isNotEmpty ? '${_one(s.note)} - ' : 'Use ';
    final link = r.url.isNotEmpty ? ' (${r.url})' : '';
    steps.add('$prefix$note${r.title}$link');
  }
  return taskText(items, <String, Object?>{'title': thread.name, 'goal': thread.note, 'steps': steps});
}

/// Markdown notes for all resources, grouped by sector.
String markdownAll(ExportState state, [Map<String, Object?> o = const <String, Object?>{}, String? today]) {
  final custom = _custom(o, state);
  final day = today ?? todayISO();
  final out = <String>['# My resources', '', 'Exported from Nexus on $day.', ''];
  final inSector = <String>{};
  final byId = <String, Resource>{for (final r in state.resources) r.id: r};

  List<String> block(Resource r) {
    final l = <String>[];
    final bits = <String>[
      typeName(r.type),
      r.status != 'active' ? stageName(r.status) : '',
      ...filled(r, custom).map((x) => x.value),
    ].where((x) => x.isNotEmpty).toList();
    final title = r.url.isNotEmpty ? '[${_mdEsc(r.title)}](${r.url})' : '**${_mdEsc(r.title)}**';
    l.add('- $title${bits.isNotEmpty ? ' - ${bits.map(_one).join(' · ')}' : ''}');
    if (r.useWhen.isNotEmpty) l.add('  - Use it when: ${r.useWhen.map(_one).join('; ')}');
    if (r.capabilities.isNotEmpty) l.add('  - Can do: ${r.capabilities.map(_one).join('; ')}');
    if (r.inputs.isNotEmpty || r.outputs.isNotEmpty) {
      l.add('  - In: ${_one(r.inputs)}${r.outputs.isNotEmpty ? ' / Out: ${_one(r.outputs)}' : ''}');
    }
    if (r.tags.isNotEmpty) l.add('  - Tags: ${r.tags.map((t) => '#$t').join(' ')}');
    if (r.notes.isNotEmpty) l.add('  - Notes: ${_one(r.notes).substring(0, min(400, _one(r.notes).length))}');
    final v = r.verdict;
    if (v != null) {
      l.add('  - Verdict: ${v.result} on ${v.at}${v.note.isNotEmpty ? ' - ${_one(v.note)}' : ''}');
    }
    return l;
  }

  for (final j in state.jobs) {
    final rs = j.members
        .map((id) => byId[id])
        .whereType<Resource>()
        .where((r) => (o['archived'] == true || r.status != 'archived') && (o['following'] != false || r.src != 'following'))
        .toList();
    if (rs.isEmpty) continue;
    out.add('## ${j.name}');
    out.add('');
    if (j.note.isNotEmpty) {
      out.add(_one(j.note));
      out.add('');
    }
    for (final r in rs) {
      out.addAll(block(r));
      inSector.add(r.id);
    }
    out.add('');
  }
  final rest = state.resources
      .where((r) => !inSector.contains(r.id) && (o['archived'] == true || r.status != 'archived') && (o['following'] != false || r.src != 'following'))
      .toList();
  if (rest.isNotEmpty) {
    out.add('## Not in a sector');
    out.add('');
    for (final r in rest) {
      out.addAll(block(r));
    }
    out.add('');
  }
  if (state.threads.isNotEmpty) {
    out.add('## Missions');
    out.add('');
    for (final t in state.threads) {
      out.add('### ${t.name}');
      if (t.note.isNotEmpty) out.add(_one(t.note));
      for (var i = 0; i < t.steps.length; i++) {
        final s = t.steps[i];
        final r = byId[s.rid];
        if (r != null) out.add('${i + 1}. ${s.done ? '[x] ' : ''}${r.title}${s.note.isNotEmpty ? ' - ${_one(s.note)}' : ''}');
      }
      out.add('');
    }
  }
  return '${out.join('\n').replaceAll(RegExp(r'\n{3,}'), '\n\n').trim()}\n';
}

String _cell(Object? value) {
  var t = (value == null ? '' : value.toString()).replaceAll(RegExp(r'\r?\n'), ' ');
  if (RegExp(r'^[=+\-@\t\r]').hasMatch(t)) t = "'$t";
  return RegExp(r'[",]').hasMatch(t) ? '"${t.replaceAll('"', '""')}"' : t;
}

/// A CSV table of all resources.
String csvAll(ExportState state, [Map<String, Object?> o = const <String, Object?>{}]) {
  final custom = _custom(o, state);
  final defs = allDefs(custom);
  final head = <String>[
    'Title', 'Link', 'Type', 'Stage', 'Sectors', 'Tags',
    ...defs.map((d) => d.label),
    'Use it when', 'Can do', 'Notes', 'Last checked', 'Next check', 'Trial ends', 'Saved from',
  ];
  final sectors = <String, List<String>>{};
  for (final j in state.jobs) {
    for (final m in j.members) {
      (sectors[m] ??= <String>[]).add(j.name);
    }
  }
  final rows = pick(state, <String, Object?>{'archived': o['archived'], 'following': o['following'] != false}).map((r) {
    return <Object?>[
      r.title,
      r.url,
      typeName(r.type),
      stageName(r.status),
      (sectors[r.id] ?? <String>[]).join('; '),
      r.tags.join('; '),
      ...defs.map((d) => r.fields[d.key] ?? ''),
      r.useWhen.join('; '),
      r.capabilities.join('; '),
      _one(r.notes).substring(0, min(500, _one(r.notes).length)),
      r.lastChecked,
      r.nextCheck,
      r.trialEnd,
      r.src,
    ];
  }).toList();
  return '${<List<Object?>>[head, ...rows].map((row) => row.map(_cell).join(',')).join('\r\n')}\r\n';
}

int estimateTokens(String text) => (text.length / 4).ceil();

/// A short brief to paste into an AI chat. Links are left out by default.
Map<String, Object?> aiBrief(ExportState state, [Map<String, Object?> o = const <String, Object?>{}]) {
  final custom = _custom(o, state);
  final full = o['detail'] == 'full';
  final rawMax = o['maxChars'];
  final maxChars = rawMax is num && rawMax > 0 ? rawMax.toInt() : (full ? 24000 : 12000);
  var list = pick(state, <String, Object?>{'jobId': o['jobId'] ?? '', 'following': false});
  final scored = <MapEntry<double, int>>[];
  for (var i = 0; i < list.length; i++) {
    final r = list[i];
    final score = ((r.useWhen.isNotEmpty ? 2 : 0) +
            (r.capabilities.isNotEmpty ? 1 : 0) +
            (filled(r, custom).isNotEmpty ? 1 : 0) +
            (r.status == 'active' ? 0.5 : 0))
        .toDouble();
    scored.add(MapEntry(score, i));
  }
  scored.sort((a, b) => b.key.compareTo(a.key) != 0 ? b.key.compareTo(a.key) : a.value - b.value);
  list = scored.map((e) => list[e.value]).toList();
  const head = 'These are my own resources: tools, sources, channels and communities I already use or plan to use.\n'
      'When I ask how to do a job, choose from this list first. Name the resource, say why it fits, and give the first steps.\n'
      'Respect the free limits and costs shown. If nothing here fits, say so, then suggest something outside the list.\n';

  String line(Resource r) {
    final facts = <String>[
      typeName(r.type),
      r.status != 'active' ? stageName(r.status) : '',
      ...filled(r, custom).map((x) => x.def.kind == 'date' ? '${x.def.label} ${x.value}' : x.value),
    ].where((x) => x.isNotEmpty).join(', ');
    final bits = <String>[];
    if (r.useWhen.isNotEmpty) bits.add('use when: ${r.useWhen.take(full ? 5 : 2).map(_one).join('; ')}');
    if (r.capabilities.isNotEmpty) bits.add('can do: ${r.capabilities.take(full ? 6 : 2).map(_one).join('; ')}');
    if (full && r.notes.isNotEmpty) bits.add('note: ${_one(r.notes).substring(0, min(160, _one(r.notes).length))}');
    final link = o['links'] == true && r.url.isNotEmpty
        ? ', ${r.url}'
        : (domainOf(r.url).isNotEmpty ? ', ${domainOf(r.url)}' : '');
    return '- ${r.title} ($facts$link)${bits.isNotEmpty ? ': ${bits.join('. ')}' : ''}';
  }

  final lines = <String>[];
  var size = head.length;
  var cut = 0;
  for (final r in list) {
    final l = line(r);
    if (size + l.length + 1 > maxChars) {
      cut = list.length - lines.length;
      break;
    }
    lines.add(l);
    size += l.length + 1;
  }
  final tail = cut > 0 ? '\n($cut more resources were left out to keep this short.)' : '';
  final text = '$head${lines.join('\n')}$tail\n';
  return <String, Object?>{'text': text, 'count': lines.length, 'left': cut, 'tokens': estimateTokens(text)};
}

