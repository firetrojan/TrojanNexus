// store_base.dart - StoreCore state, normalising, lookups, saving and loading.
import 'dart:convert';

import 'choices.dart' show pushRecent;
import 'constants.dart' show SCHEMA;
import 'home.dart';
import 'model/fields.dart';
import 'model/job.dart';
import 'model/resource.dart';
import 'model/settings.dart';
import 'model/thread.dart';
import 'recent.dart';
import 'rules.dart';
import 'storage.dart';
import 'store_types.dart';
import 'util.dart';
import 'week.dart';

class StoreBase {
  StoreBase({
    required this.clock,
    required this.idGen,
    required this.storage,
  }) : settings = Settings.fromJson(<String, Object?>{}) {
    applyData(const <String, Object?>{});
  }

  final Clock clock;
  final IdGen idGen;
  final Storage storage;

  final List<Resource> resources = <Resource>[];
  final List<Job> jobs = <Job>[];
  final List<Thread> threads = <Thread>[];
  Settings settings;
  Map<String, Object?> game = <String, Object?>{};

  void Function(String kind, List<String> ids)? onChange;
  void Function(String reason)? onBefore;
  void Function(String key)? onSettings;

  Map<String, Resource> idx = <String, Resource>{};
  Set<String>? _deletedCache;
  bool firstRun = false;
  Future<void>? _pendingSave;

  // ---------- normalising ----------
  Resource normRes(Object? raw) {
    final m = storeMap(raw);
    if (!storeTruthy(m['id'])) m['id'] = idGen('r');
    return normalizeResource(m, clock.today());
  }

  Job normJob(Object? raw, int index) {
    final m = storeMap(raw);
    if (!storeTruthy(m['id'])) m['id'] = idGen('j');
    return normalizeJob(m, index);
  }

  Thread normThread(Object? raw) {
    final m = storeMap(raw);
    if (!storeTruthy(m['id'])) m['id'] = idGen('t');
    return normalizeThread(m);
  }

  List<String> normKeys(Object? v) {
    if (v is! List) return <String>[];
    final out = <String>[];
    for (final x in v) {
      if (x is String && x.isNotEmpty) out.add(x);
    }
    return out.length > 3000 ? out.sublist(out.length - 3000) : out;
  }

  void applyData(Object? data) {
    final d = data is List
        ? <String, Object?>{'resources': data}
        : storeMap(data);
    final today = clock.today();
    final seen = <String>{};
    resources.clear();
    final rawResources = d['resources'];
    if (rawResources is List) {
      for (final raw in rawResources) {
        final r = normRes(raw);
        if (seen.add(r.id)) resources.add(r);
      }
    }
    jobs.clear();
    final rawJobs = d['jobs'];
    if (rawJobs is List) {
      for (var i = 0; i < rawJobs.length; i++) {
        jobs.add(normJob(rawJobs[i], i));
      }
    }
    threads.clear();
    final rawThreads = d['threads'];
    if (rawThreads is List) {
      for (final raw in rawThreads) {
        threads.add(normThread(raw));
      }
    }
    settings = Settings.fromJson(storeMap(d['settings']).cast<String, Object?>());
    settings['customFields'] =
        normCustom(settings['customFields'], resourceTypes)
            .map((x) => x.toJson())
            .toList();
    settings['deletedKeys'] = normKeys(settings['deletedKeys']);
    settings['home'] = normHome(settings['home']).toJson();
    if (settings['weekly'] != null) {
      settings['weekly'] = normWeekly(settings['weekly']).toJson();
    }
    settings['siteIcons'] = settings['siteIcons'] == true;
    settings['badge'] = settings['badge'] != false;
    settings['recent'] =
        normRecent(settings['recent']).map((x) => x.toJson()).toList();
    settings['shelves'] =
        normShelves(settings['shelves']).map((x) => x.toJson()).toList();
    final rj = settings['recentJobs'];
    settings['recentJobs'] = (rj is List ? rj : const <Object?>[])
        .whereType<String>()
        .take(8)
        .toList();
    final di = settings['dupeIgnore'];
    settings['dupeIgnore'] = (di is List ? di : const <Object?>[])
        .whereType<String>()
        .where((x) => x.isNotEmpty)
        .toList();
    final dkeys = settings['dupeIgnore'] as List<String>;
    if (dkeys.length > 300) {
      settings['dupeIgnore'] = dkeys.sublist(dkeys.length - 300);
    }
    final g = d['game'];
    game = g is Map ? storeMap(g).cast<String, Object?>() : <String, Object?>{};
    _deletedCache = null;
    reindex();
    sanitize();
    refreshSmart(today);
  }

  // ---------- lookups ----------
  Resource? byId(String id) => idx[id];
  Job? jobById(String id) {
    for (final j in jobs) {
      if (j.id == id) return j;
    }
    return null;
  }

  List<Job> jobsOf(String rid) => jobs.where((j) => j.members.contains(rid)).toList();
  Thread? threadById(String id) {
    for (final t in threads) {
      if (t.id == id) return t;
    }
    return null;
  }

  List<Thread> threadsOf(String rid) =>
      threads.where((t) => t.steps.any((s) => s.rid == rid)).toList();

  Set<String> deletedSet() {
    final cached = _deletedCache;
    if (cached != null) return cached;
    final v = settings['deletedKeys'];
    final out = v is List ? v.whereType<String>().toSet() : <String>{};
    _deletedCache = out;
    return out;
  }

  bool wasDeleted(String? url) => url != null && url.isNotEmpty && deletedSet().contains(normUrl(url));

  int deletedCount() => (settings['deletedKeys'] as List<Object?>).length;

  void rememberDeleted(List<String> urls) {
    final gone = deletedSet();
    final keys = urls
        .where((x) => x.isNotEmpty)
        .map(normUrl)
        .where((k) => k.isNotEmpty && !gone.contains(k))
        .toList();
    if (keys.isEmpty) return;
    final current = (settings['deletedKeys'] as List<Object?>).whereType<String>();
    settings['deletedKeys'] = normKeys(<String>[...current, ...keys]);
    _deletedCache = null;
  }

  void forgetDeleted(List<String> urls) {
    final gone = deletedSet();
    final keys = urls
        .where((x) => x.isNotEmpty)
        .map(normUrl)
        .where(gone.contains)
        .toSet();
    if (keys.isEmpty) return;
    settings['deletedKeys'] =
        (settings['deletedKeys'] as List<Object?>).whereType<String>().where((k) => !keys.contains(k)).toList();
    _deletedCache = null;
  }

  void clearDeleted() {
    settings['deletedKeys'] = <String>[];
    _deletedCache = null;
    queueSave();
  }

  Resource? findByUrl(String? url) {
    final k = normUrl(url);
    for (final r in resources) {
      if (r.url.isNotEmpty && normUrl(r.url) == k) return r;
    }
    return null;
  }

  List<List<Object?>> allTags() {
    final counts = <String, int>{};
    for (final r in resources) {
      for (final t in r.tags) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    final entries = counts.entries.toList()
      ..sort((a, b) {
        final byCount = b.value.compareTo(a.value);
        return byCount != 0 ? byCount : a.key.compareTo(b.key);
      });
    return entries.map((e) => <Object?>[e.key, e.value]).toList();
  }

  Object? getSetting(String key) => settings[key];

  void noteJobUsed(String id) {
    if (jobById(id) == null) return;
    settings['recentJobs'] = pushRecent(settings['recentJobs'], id);
    queueSave();
  }

  void noteVisit(String k, String id) {
    settings['recent'] = pushVisit(settings['recent'], k, id, clock.nowMs())
        .map((x) => x.toJson())
        .toList();
    queueSave();
  }

  void setSetting(String key, Object? value) {
    var v = value;
    if (key == 'customFields') {
      v = normCustom(v, resourceTypes).map((x) => x.toJson()).toList();
    }
    settings[key] = v;
    onSettings?.call(key);
    queueSave();
  }

  void reindex() {
    idx = <String, Resource>{for (final r in resources) r.id: r};
  }

  void changed(String kind, [List<String>? ids]) {
    refreshSmart();
    onChange?.call(kind, ids == null ? <String>[] : List<String>.from(ids));
    queueSave();
  }

  void before(String reason) => onBefore?.call(reason);

  // ---------- smart sectors ----------
  bool isSmart(Job? j) => j?.rule != null;

  bool refreshSmart([String? today]) {
    final day = today ?? clock.today();
    var any = false;
    for (final j in jobs) {
      final rule = j.rule;
      if (rule == null) continue;
      final ids = resources
          .where((r) => matches(r, rule, day))
          .map((r) => r.id)
          .toList();
      if (ids.length != j.members.length ||
          ids.asMap().entries.any((e) => j.members[e.key] != e.value)) {
        j.members = ids;
        any = true;
      }
    }
    return any;
  }

  List<Object?> customFields() {
    final v = settings['customFields'];
    return v is List ? v : <Object?>[];
  }

  // ---------- saving and loading ----------
  Map<String, Object?> document() => <String, Object?>{
        'schema': SCHEMA,
        'resources': resources.map((x) => x.toJson()).toList(),
        'jobs': jobs.map((x) => x.toJson()).toList(),
        'threads': threads.map((x) => x.toJson()).toList(),
        'settings': settings.toJson(),
        'game': game,
      };

  Future<void> queueSave() {
    final text = jsonEncode(document());
    _pendingSave = storage.write(text);
    return _pendingSave!;
  }

  Future<void> flush() async {
    final p = _pendingSave;
    if (p != null) await p;
  }

  Future<void> save() => queueSave();

  void load(Object? seed) {
    applyData(seed);
    firstRun = false;
  }

  Future<void> loadFromStorage(Object? seed) async {
    Object? data;
    try {
      final raw = await storage.read();
      if (raw != null) data = jsonDecode(raw);
    } catch (_) {}
    if (data is Map && data['resources'] is List) {
      applyData(data);
      firstRun = false;
    } else {
      applyData(seed);
      firstRun = true;
      await save();
    }
  }

  void resetToSeed(Object? seed) {
    before('Before reset');
    applyData(seed);
    firstRun = true;
    queueSave();
    changed('reset');
  }
  // ---------- internals ----------
  void sanitize() {
    final ids = resources.map((r) => r.id).toSet();
    for (final r in resources) {
      r.related = r.related.where((x) => ids.contains(x) && x != r.id).toList();
    }
    for (final j in jobs) {
      j.members = uniq(j.members.where(ids.contains));
    }
    for (final t in threads) {
      t.steps = t.steps.where((s) => ids.contains(s.rid)).toList();
    }
    var slot = -1;
    for (final j in jobs) {
      if (j.slot != null && j.slot! > slot) slot = j.slot!;
    }
    final used = <int>{};
    for (final j in jobs) {
      if (j.slot == null || used.contains(j.slot)) {
        slot++;
        j.slot = slot;
      }
      used.add(j.slot!);
    }
  }
}
