// game.dart - quiet progress layer: XP, rank, badges, focus runs.
// Port of legacy/web-src/js/game.js. The state lives in the store, like store.js does in the web app.
import 'dart:math';

import 'store_core.dart';
import 'util.dart';

const List<String> RANKS = <String>[
  'Cadet',
  'Pilot',
  'Navigator',
  'Cartographer',
  'Captain',
  'Commander',
  'Admiral',
  'Architect',
];

const Map<String, int> XP = <String, int>{
  'add': 6,
  'review': 4,
  'check': 10,
  'archive': 3,
  'thread': 10,
  'step': 4,
  'missionDone': 25,
  'link': 3,
  'backup': 20,
  'focus20': 15,
  'focus30': 25,
  'sector': 8,
  'import': 1,
  'scan': 1,
  'reset': 15,
};

/// One badge. The JS keeps a test function on it; here the rule is the switch in [_earned].
class GameBadge {
  const GameBadge({required this.id, required this.name, required this.desc});

  final String id;
  final String name;
  final String desc;

  Map<String, Object?> toJson() => <String, Object?>{'id': id, 'name': name, 'desc': desc};
}

const List<GameBadge> BADGES = <GameBadge>[
  GameBadge(id: 'first-contact', name: 'First Contact', desc: 'Add your first own resource'),
  GameBadge(id: 'watchkeeper', name: 'Watchkeeper', desc: 'Check 5 resources'),
  GameBadge(id: 'cartographer', name: 'Cartographer', desc: 'Review 25 resources'),
  GameBadge(id: 'full-atlas', name: 'Full Atlas', desc: 'Clear every "To review" item'),
  GameBadge(id: 'archivist', name: 'Archivist', desc: 'Export a backup'),
  GameBadge(id: 'route-maker', name: 'Route Maker', desc: 'Create a mission'),
  GameBadge(id: 'finisher', name: 'Finisher', desc: 'Complete every step of a mission'),
  GameBadge(id: 'founder', name: 'Sector Founder', desc: 'Create your own sector'),
  GameBadge(id: 'broadcast', name: 'Broadcast', desc: 'Import 10 links at once'),
  GameBadge(id: 'deep-focus', name: 'Deep Focus', desc: 'Finish 3 focus runs'),
  GameBadge(id: 'clear-sky', name: 'Clear Sky', desc: 'No overdue signals'),
];

/// XP a level starts at. Level 1 starts at 0, level 2 at 30.
int levelStart(int l) => (30 * pow(l < 1 ? 0 : l - 1, 1.6)).round();

/// The level a total of XP reaches.
int levelOf(int xp) {
  int l = 1;
  while (levelStart(l + 1) <= xp) {
    l++;
  }
  return l;
}

/// The rank name of a level. Levels 1-3 are Cadet, 4-6 Pilot, and so on.
String? rankOf(int level) {
  final i = ((level - 1) / 3).floor();
  if (i < 0) return null;
  return RANKS[i > RANKS.length - 1 ? RANKS.length - 1 : i];
}

/// Math.round in JavaScript: floor(x + 0.5).
int _jsRound(double v) => (v + 0.5).floor();

/// Today, as the local date of the store clock (JS uses local date parts).
String _today(StoreCore store) => iso(store.clock.now().toLocal());

/// The game state with the same defaults the JS fills in.
Map<String, Object?> _g(StoreCore store) {
  final x = store.game;
  if (x['xp'] is! num) x['xp'] = 0;
  if (x['days'] is! List) x['days'] = <Object?>[];
  if (x['focus'] is! List) x['focus'] = <Object?>[];
  if (x['log'] is! List) x['log'] = <Object?>[];
  if (x['badges'] is! Map) x['badges'] = <String, Object?>{};
  if (x['counters'] is! Map) x['counters'] = <String, Object?>{};
  final counters = x['counters'] as Map;
  for (final k in const <String>[
    'adds',
    'checks',
    'reviews',
    'imported',
    'backups',
    'sectors',
    'threads',
    'links',
    'steps',
    'missions',
  ]) {
    if (counters[k] is! num) counters[k] = 0;
  }
  return x;
}

int _xp(Map<String, Object?> x) => x['xp'] is num ? (x['xp'] as num).toInt() : 0;

int _count(Map<String, Object?> x, String key) {
  final counters = x['counters'];
  if (counters is! Map) return 0;
  final v = counters[key];
  return v is num ? v.toInt() : 0;
}

int _stat(Map<String, Object?> stats, String key) {
  final v = stats[key];
  return v is num ? v.toInt() : 0;
}

/// How far the owner is: xp, level, rank and how much of this level is used.
Map<String, Object?> progress(StoreCore store) {
  final x = _g(store);
  final xp = _xp(x);
  final level = levelOf(xp);
  final a = levelStart(level);
  final b = levelStart(level + 1);
  final days = x['days'] as List;
  final badges = x['badges'] as Map;
  return <String, Object?>{
    'xp': xp,
    'level': level,
    'rank': rankOf(level),
    'into': xp - a,
    'span': b - a,
    'pct': _jsRound(100 * (xp - a) / (b - a)),
    'days': days.length,
    'badges': badges.length,
  };
}

/// The badge rules of the JS, one by one.
bool _earned(String id, Map<String, Object?> x, Map<String, Object?> stats) {
  switch (id) {
    case 'first-contact':
      return _count(x, 'adds') >= 1;
    case 'watchkeeper':
      return _count(x, 'checks') >= 5;
    case 'cartographer':
      return _count(x, 'reviews') >= 25;
    case 'full-atlas':
      return _stat(stats, 'total') >= 10 &&
          _stat(stats, 'drafts') == 0 &&
          _count(x, 'reviews') >= 1;
    case 'archivist':
      return _count(x, 'backups') >= 1;
    case 'route-maker':
      return _count(x, 'threads') >= 1;
    case 'finisher':
      return _count(x, 'missions') >= 1;
    case 'founder':
      return _count(x, 'sectors') >= 1;
    case 'broadcast':
      return _count(x, 'imported') >= 10;
    case 'deep-focus':
      return (x['focus'] as List).length >= 3;
    case 'clear-sky':
      return _count(x, 'checks') >= 1 && _stat(stats, 'overdue') == 0;
  }
  return false;
}

/// Check the badges and unlock the new ones. Returns the new badges.
List<Map<String, Object?>> unlock(StoreCore store) {
  final x = _g(store);
  final stats = store.stats();
  final badges = x['badges'] as Map;
  final fresh = <Map<String, Object?>>[];
  for (final b in BADGES) {
    if (badges.containsKey(b.id)) continue;
    if (!_earned(b.id, x, stats)) continue;
    badges[b.id] = _today(store);
    fresh.add(b.toJson());
  }
  return fresh;
}

/// Award XP for an action. Returns the gain, the new level (if any) and the new badges.
Map<String, Object?> award(StoreCore store, String kind, [int times = 1, String label = '']) {
  const Map<String, String> countKey = <String, String>{
    'add': 'adds',
    'check': 'checks',
    'review': 'reviews',
    'import': 'imported',
    'backup': 'backups',
    'sector': 'sectors',
    'thread': 'threads',
    'link': 'links',
    'step': 'steps',
    'missionDone': 'missions',
  };
  final x = _g(store);
  final before = levelOf(_xp(x));
  final key = countKey[kind];
  if (key != null) {
    final counters = x['counters'] as Map;
    counters[key] = _count(x, key) + times;
  }
  var gain = (XP[kind] ?? 0) * times;
  if (kind == 'import' || kind == 'scan') {
    gain = min(20, gain);
  }
  x['xp'] = _xp(x) + gain;
  final today = _today(store);
  final days = x['days'] as List;
  if (!days.contains(today)) {
    days.add(today);
  }
  final log = x['log'] as List;
  log.insert(0, <String, Object?>{
    't': store.clock.nowMs(),
    'kind': kind,
    'gain': gain,
    'label': label,
  });
  if (log.length > 30) {
    log.removeRange(30, log.length);
  }
  final newBadges = unlock(store);
  final after = levelOf(_xp(x));
  Map<String, Object?>? levelUp;
  if (after > before) {
    final rank = rankOf(after);
    levelUp = <String, Object?>{
      'level': after,
      'rank': rank,
      'rankUp': rank != rankOf(before),
    };
  }
  return <String, Object?>{
    'gain': gain,
    'kind': kind,
    'label': label,
    'levelUp': levelUp,
    'newBadges': newBadges,
  };
}

/// Record a finished focus run (minutes). 20+ min counts, 30+ earns more.
Map<String, Object?> focusDone(StoreCore store, int minutes) {
  final x = _g(store);
  final focus = x['focus'] as List;
  focus.add(<String, Object?>{'date': _today(store), 'minutes': minutes.round()});
  if (focus.length > 400) {
    focus.removeRange(0, focus.length - 400);
  }
  final kind = minutes >= 30 ? 'focus30' : (minutes >= 20 ? 'focus20' : 'review');
  return award(store, kind, 1, 'Focus run ${minutes.round()} min');
}

/// Focus minutes of today.
int focusToday(StoreCore store) {
  final x = _g(store);
  final today = _today(store);
  var sum = 0;
  for (final f in x['focus'] as List) {
    if (f is Map && f['date'] == today) {
      final m = f['minutes'];
      sum += m is num ? m.toInt() : 0;
    }
  }
  return sum;
}
