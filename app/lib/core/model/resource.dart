// resource.dart - the Resource model and normalizeResource, ported from store.js.
// JSON is only read at this edge; the rest of the app uses real types.
import '../util.dart';
import 'fields.dart';
import 'values.dart';

export 'values.dart';

const List<String> resourceTypes = <String>[
  'web-tool', 'article-site', 'youtube-channel', 'ai-source', 'social',
  'community', 'feed', 'catalogue', 'docs', 'other',
];
const List<String> resourceStatuses = <String>[
  'candidate', 'testing', 'active', 'archived',
];
const List<String> checkCadences = <String>[
  'daily', 'weekly', 'monthly', 'none',
];
const Map<String, int> cadenceDays = <String, int>{
  'daily': 1, 'weekly': 7, 'monthly': 30, 'none': 0,
};

class Resource {
  Resource({
    this.id = '',
    this.title = '',
    this.url = '',
    this.type = 'other',
    List<String>? tags,
    List<String>? capabilities,
    List<String>? useWhen,
    this.inputs = '',
    this.outputs = '',
    this.status = 'active',
    this.checkCadence = 'none',
    this.lastChecked = '',
    this.nextCheck = '',
    this.rssUrl = '',
    List<String>? related,
    this.notes = '',
    this.draft = false,
    this.src = 'user',
    this.research = 'user',
    this.folder = '',
    this.added = '',
    this.createdAt = '',
    this.statusSince = '',
    this.hidden = false,
    this.scan,
    Map<String, String>? fields,
    this.trialEnd = '',
    this.verdict,
    this.watch,
    this.locked = false,
    this.pinned = false,
    this.keep = false,
    this.learned = '',
    List<LogEvent>? log,
    this.opens = 0,
    this.openedAt = 0,
  })  : tags = tags ?? <String>[],
        capabilities = capabilities ?? <String>[],
        useWhen = useWhen ?? <String>[],
        related = related ?? <String>[],
        fields = fields ?? <String, String>{},
        log = log ?? <LogEvent>[];

  String id;
  String title;
  String url;
  String type;
  List<String> tags;
  List<String> capabilities;
  List<String> useWhen;
  String inputs;
  String outputs;
  String status;
  String checkCadence;
  String lastChecked;
  String nextCheck;
  String rssUrl;
  List<String> related;
  String notes;
  bool draft;
  String src;
  String research;
  String folder;
  String added;
  String createdAt;
  String statusSince;
  bool hidden;
  Scan? scan;
  Map<String, String> fields;
  String trialEnd;
  Verdict? verdict;
  Map<String, dynamic>? watch;
  bool locked;
  bool pinned;
  bool keep;
  String learned;
  List<LogEvent> log;
  int opens;
  int openedAt;

  factory Resource.fromJson(Map<String, dynamic> json) => normalizeResource(json);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'url': url,
        'type': type,
        'tags': tags,
        'capabilities': capabilities,
        'useWhen': useWhen,
        'inputs': inputs,
        'outputs': outputs,
        'status': status,
        'checkCadence': checkCadence,
        'lastChecked': lastChecked,
        'nextCheck': nextCheck,
        'rssUrl': rssUrl,
        'related': related,
        'notes': notes,
        'draft': draft,
        'src': src,
        'research': research,
        'folder': folder,
        'added': added,
        'createdAt': createdAt,
        'statusSince': statusSince,
        'hidden': hidden,
        'scan': scan?.toJson(),
        'fields': fields,
        'trialEnd': trialEnd,
        'verdict': verdict?.toJson(),
        'watch': watch,
        'locked': locked,
        'pinned': pinned,
        'keep': keep,
        'learned': learned,
        'log': log.map((e) => e.toJson()).toList(),
        'opens': opens,
        'openedAt': openedAt,
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

String _trim(Object? v) => _orEmpty(v).trim();

String _cut(String s, int n) => s.length > n ? s.substring(0, n) : s;

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

String _isoOr(Object? v) {
  final s = v == null ? '' : v.toString();
  if (parseISO(s) == null) return '';
  return s.length > 10 ? s.substring(0, 10) : s;
}

List<String> _lines(Object? v) {
  if (v is List) {
    return v
        .map((x) => x.toString().trim())
        .where((x) => x.isNotEmpty)
        .toList();
  }
  if (v is String) {
    return v
        .split(RegExp(r'\r?\n|;'))
        .map((x) => x.trim())
        .where((x) => x.isNotEmpty)
        .toList();
  }
  return <String>[];
}

List<String> _tags(Object? v) {
  final raw = v is List ? v : (v is String ? v.split(RegExp(r'[,\n]')) : <Object?>[]);
  final out = <String>[];
  for (final x in raw) {
    var s = x.toString().trim().toLowerCase();
    if (s.startsWith('#')) s = s.substring(1);
    if (s.isNotEmpty) out.add(s);
  }
  return uniq(out);
}

Scan? _normScan(Object? s) {
  if (s is! Map) return null;
  final m = _map(s);
  final at = _isoOr(m['at']);
  if (at.isEmpty) return null;
  final conf = m['conf'];
  return Scan(
    at: at,
    via: _cut(_orEmpty(m['via']), 12),
    topic: _cut(_orEmpty(m['topic']), 16),
    topic2: _cut(_orEmpty(m['topic2']), 16),
    conf: (conf == 'clear' || conf == 'maybe' || conf == 'none')
        ? conf.toString()
        : 'none',
    basis: _cut(_orEmpty(m['basis']), 8),
    desc: _cut(_orEmpty(m['desc']), 300),
    site: _cut(_orEmpty(m['site']), 80),
  );
}

Verdict? _normVerdict(Object? v) {
  if (v is! Map) return null;
  final m = _map(v);
  final result = m['result'];
  if (result != 'keep' && result != 'drop') return null;
  final at = _isoOr(m['at']);
  if (at.isEmpty) return null;
  return Verdict(
    at: at,
    result: result.toString(),
    note: _cut(_orEmpty(m['note']), 300),
  );
}

const Set<String> _logKinds = <String>{
  'reviewed', 'status', 'checked', 'verdict', 'merged', 'learned',
};

List<LogEvent> _normLog(Object? v) {
  if (v is! List) return <LogEvent>[];
  final out = <LogEvent>[];
  for (final item in v) {
    if (item is! Map) continue;
    final m = _map(item);
    final at = _orEmpty(m['at']);
    final k = _orEmpty(m['k']);
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(at) || !_logKinds.contains(k)) continue;
    out.add(LogEvent(at: at, k: k, t: _cut(_orEmpty(m['t']), 120)));
  }
  if (out.length > 25) out.removeRange(0, out.length - 25);
  return out;
}

Map<String, dynamic>? _normWatch(Object? v) {
  if (v is! Map) return null;
  final out = <String, dynamic>{};
  v.forEach((key, value) => out[key.toString()] = value);
  return out.isEmpty ? null : out;
}

/// YouTube channel feed from a /channel/UC... url or a bare channel id.
String deriveRssUrl(String? url, [String? hint]) {
  final text = '${url ?? ''} ${hint ?? ''}';
  final m = RegExp(r'(?:channel/|channel_id=|\b)(UC[\w-]{22})\b').firstMatch(text);
  return m == null
      ? ''
      : 'https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}';
}

String computeNextCheck(Object? raw, [String? today]) {
  var cadence = '';
  var lastChecked = '';
  if (raw is Resource) {
    cadence = raw.checkCadence;
    lastChecked = raw.lastChecked;
  } else if (raw is Map) {
    final m = _map(raw);
    cadence = _orEmpty(m['checkCadence']);
    lastChecked = _isoOr(m['lastChecked']);
  }
  final days = cadenceDays[cadence] ?? 0;
  if (days == 0) return '';
  return lastChecked.isEmpty ? (today ?? todayISO()) : addDays(lastChecked, days);
}

int _intValue(Object? v) {
  num? n;
  if (v is num) {
    n = v;
  } else if (v is String) {
    final s = v.trim();
    n = int.tryParse(s) ?? double.tryParse(s);
  }
  if (n == null || n.isNaN) return 0;
  return n.floor();
}

int _clampInt(Object? v, int low, int high) {
  final n = _intValue(v);
  if (n < low) return low;
  if (n > high) return high;
  return n;
}

int _nonNegInt(Object? v) {
  final n = _intValue(v);
  return n < 0 ? 0 : n;
}

/// Clean any Resource-shaped map (a backup, a form). Everything is repaired, never thrown.
/// Same field names and behaviour as normalizeResource in legacy/web-src/js/store.js.
Resource normalizeResource(Object? raw, [String? today]) {
  final r = _map(raw);
  final day = today ?? todayISO();
  var created = _isoOr(r['createdAt']);
  if (created.isEmpty) created = day;
  var title = _trim(r['title']);
  final typeValue = r['type'];
  final statusValue = r['status'];
  final cadenceValue = r['checkCadence'];
  final srcValue = r['src'];
  final researchValue = r['research'];
  final relatedRaw = r['related'];
  final related = relatedRaw is List
      ? relatedRaw.map((x) => x.toString())
      : <String>[];
  final idValue = r['id'];
  var rss = _trim(r['rssUrl']);
  final out = Resource(
    id: _truthy(idValue) ? idValue.toString() : uid('r'),
    title: title,
    url: _trim(r['url']),
    type: resourceTypes.contains(typeValue) ? typeValue.toString() : 'other',
    tags: _tags(r['tags']),
    capabilities: _lines(r['capabilities']),
    useWhen: _lines(r['useWhen']),
    inputs: _trim(r['inputs']),
    outputs: _trim(r['outputs']),
    status: resourceStatuses.contains(statusValue) ? statusValue.toString() : 'active',
    checkCadence: checkCadences.contains(cadenceValue) ? cadenceValue.toString() : 'none',
    lastChecked: _isoOr(r['lastChecked']),
    nextCheck: _isoOr(r['nextCheck']),
    rssUrl: rss,
    related: uniq(related),
    notes: _orEmpty(r['notes']),
    draft: _truthy(r['draft']),
    src: _truthy(srcValue) ? srcValue.toString() : 'user',
    research: _truthy(researchValue) ? researchValue.toString() : 'user',
    folder: _orEmpty(r['folder']),
    added: _isoOr(r['added']),
    createdAt: created,
    statusSince: _isoOr(r['statusSince']).isEmpty ? created : _isoOr(r['statusSince']),
    hidden: _truthy(r['hidden']),
    scan: _normScan(r['scan']),
    fields: normFields(r['fields']),
    trialEnd: _isoOr(r['trialEnd']),
    verdict: _normVerdict(r['verdict']),
    watch: _normWatch(r['watch']),
    locked: _truthy(r['locked']),
    pinned: _truthy(r['pinned']),
    keep: _truthy(r['keep']),
    learned: _cut(_orEmpty(r['learned']), 800),
    log: _normLog(r['log']),
    opens: _clampInt(r['opens'], 0, 1000000),
    openedAt: _nonNegInt(r['openedAt']),
  );

  if (out.title.isEmpty) {
    var t = out.url.replaceFirst(
      RegExp(r'^https?:\/\/(www\.)?', caseSensitive: false),
      '',
    );
    t = t.replaceFirst(RegExp(r'/$'), '');
    out.title = t.isEmpty ? 'Untitled' : t;
  }
  if (out.rssUrl.isEmpty && out.type == 'youtube-channel') {
    out.rssUrl = deriveRssUrl(out.url);
  }
  if (out.checkCadence == 'none') {
    out.nextCheck = '';
  } else if (out.nextCheck.isEmpty) {
    out.nextCheck = computeNextCheck(out, day);
  }
  return out;
}
