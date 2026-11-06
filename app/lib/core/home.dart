// home.dart - port of the pure Home layout, launch-pad and review helpers.
import 'model/resource.dart';
import 'util.dart';

class HomeTile {
  const HomeTile(this.id, this.label, this.sub);
  final String id;
  final String label;
  final String sub;
  Map<String, Object?> toJson() =>
      <String, Object?>{'id': id, 'label': label, 'sub': sub};
}

const List<HomeTile> TILES = <HomeTile>[
  HomeTile('needs', 'Needs you', 'Trials, changed pages and checks that are due'),
  HomeTile('week', 'This week', 'Your 3 picks for the week and the weekly reset'),
  HomeTile('mission', 'Mission', 'The next step of the mission you are working on'),
  HomeTile('continue', 'Continue', 'The last links, sectors and missions you looked at'),
  HomeTile('launch', 'Launch pad', 'Your pinned and most-opened links'),
  HomeTile('shelves', 'Shelves', 'Sectors you pinned to Home as launch buttons'),
  HomeTile('time', 'Time I have', 'Tell Nexus 10 minutes, an hour or tired, get a short list'),
  HomeTile('review', 'Quick review', 'Go through new links one at a time'),
  HomeTile('sectors', 'Sectors', 'Jump into a sector'),
];

const List<String> _tileIds = <String>[
  'needs', 'week', 'mission', 'continue', 'launch', 'shelves', 'time', 'review', 'sectors',
];

class HomeLayout {
  HomeLayout(this.order, this.hide);
  final List<String> order;
  final List<String> hide;
  Map<String, Object?> toJson() =>
      <String, Object?>{'order': order, 'hide': hide};
}

/// Clean the saved layout: known tiles only, no repeats, nothing missing.
HomeLayout normHome(Object? v) {
  final o = v is Map ? v : const <Object?, Object?>{};
  final order = <String>[];
  final seen = <String>{};
  final rawOrder = o['order'];
  if (rawOrder is List) {
    for (final id in rawOrder) {
      if (id is String && _tileIds.contains(id) && seen.add(id)) order.add(id);
    }
  }
  for (final id in _tileIds) {
    if (!seen.contains(id)) order.add(id);
  }
  final hide = <String>[];
  final rawHide = o['hide'];
  if (rawHide is List) {
    for (final id in rawHide) {
      if (id is String && _tileIds.contains(id) && !hide.contains(id)) hide.add(id);
    }
  }
  return HomeLayout(order, hide);
}

/// Tiles to draw, in order, without the hidden ones.
List<String> visibleTiles(Object? layout) {
  final l = normHome(layout);
  return l.order.where((id) => !l.hide.contains(id)).toList();
}

bool launchable(Resource r) =>
    r.url.isNotEmpty && r.status != 'archived' && (r.pinned || r.src != 'following');

List<Resource> _stableSort(
  List<Resource> list,
  int Function(Resource a, Resource b) compare,
) {
  final indexed = list.asMap().entries.toList();
  indexed.sort((a, b) {
    final c = compare(a.value, b.value);
    return c != 0 ? c : a.key.compareTo(b.key);
  });
  return indexed.map((e) => e.value).toList();
}

int _byUse(Resource a, Resource b) {
  if (a.opens != b.opens) return b.opens - a.opens;
  if (a.openedAt != b.openedAt) return b.openedAt - a.openedAt;
  return a.title.compareTo(b.title);
}

/// mode 'fav': pinned first, then most opened. mode 'recent': last opened.
List<Resource> launchList(
  List<Resource> resources, [
  String mode = 'fav',
  int n = 8,
]) {
  final pool = resources.where(launchable).toList();
  List<Resource> list;
  if (mode == 'recent') {
    list = _stableSort(
      pool.where((r) => r.openedAt != 0).toList(),
      (a, b) {
        final byOpen = b.openedAt.compareTo(a.openedAt);
        return byOpen != 0 ? byOpen : _byUse(a, b);
      },
    );
  } else {
    final pinned = _stableSort(pool.where((r) => r.pinned).toList(), _byUse);
    final used = _stableSort(
      pool.where((r) => !r.pinned && r.opens > 0).toList(),
      _byUse,
    );
    list = <Resource>[...pinned, ...used];
  }
  return list.take(n).toList();
}

class ShelfRef {
  ShelfRef(this.job);
  final String job;
  Map<String, Object?> toJson() => <String, Object?>{'job': job};
}

const int MAX_SHELVES = 4;

/// Clean saved shelves: [{ job }] with a real id, no repeats, at most 4.
List<ShelfRef> normShelves(Object? v) {
  final seen = <String>{};
  final out = <ShelfRef>[];
  if (v is List) {
    for (final e in v) {
      if (e is! Map) continue;
      final job = e['job'];
      if (job is String && job.isNotEmpty && seen.add(job) && out.length < MAX_SHELVES) {
        out.add(ShelfRef(job));
      }
    }
  }
  return out;
}

/// Links on a shelf: pinned first, then most opened, then name. Only links
/// that can open.
List<Resource> shelfList(
  List<String> memberIds,
  Resource? Function(String id) byId, [
  int n = 8,
]) {
  final pool = <Resource>[];
  for (final id in memberIds) {
    final r = byId(id);
    if (r != null && launchable(r)) pool.add(r);
  }
  final sorted = _stableSort(pool, (a, b) {
    final byPinned = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (byPinned != 0) return byPinned;
    return _byUse(a, b);
  });
  return sorted.take(n).toList();
}

class HomeNeedsFns {
  HomeNeedsFns({
    required this.trialBucket,
    required this.dueBucket,
    required this.resetBucket,
    required this.watchChanged,
  });
  final String Function(Resource r, String today) trialBucket;
  final String Function(Resource r, String today) dueBucket;
  final String Function(Resource r, String today) resetBucket;
  final bool Function(Resource r) watchChanged;
}

class NeedItem {
  NeedItem(this.kind, this.rank, this.sub, this.r);
  final String kind;
  final int rank;
  final String sub;
  final Resource r;
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': kind,
        'rank': rank,
        'sub': sub,
        'r': r.toJson(),
      };
}

String? _watchWhat(Resource r) {
  final what = r.watch?['what'];
  if (what is List && what.isNotEmpty) return what.first?.toString();
  if (what is String && what.isNotEmpty) return what.substring(0, 1);
  return null;
}

/// One line per resource that needs you, most urgent first.
List<NeedItem> needsItems(
  List<Resource> resources,
  HomeNeedsFns fns, [
  String? today,
]) {
  final day = today ?? todayISO();
  final out = <NeedItem>[];
  for (final r in resources) {
    if (r.status == 'archived') continue;
    final tb = fns.trialBucket(r, day);
    final due = fns.dueBucket(r, day);
    final rb = fns.resetBucket(r, day);
    NeedItem? item;
    if (tb.isNotEmpty) {
      final d = daysBetween(day, r.trialEnd);
      final sub = d < 0
          ? 'Trial ended ${-d} ${d == -1 ? 'day' : 'days'} ago'
          : (d == 0
              ? 'Trial ends today'
              : 'Trial ends in $d ${d == 1 ? 'day' : 'days'}');
      item = NeedItem('trial', tb == 'overdue' ? 0 : 1, sub, r);
    } else if (fns.watchChanged(r)) {
      item = NeedItem('changed', 2, _watchWhat(r) ?? 'The page changed', r);
    } else if (due == 'overdue' || due == 'today') {
      final d = daysBetween(day, r.nextCheck);
      item = NeedItem(
        'check',
        due == 'overdue' ? 3 : 4,
        due == 'overdue'
            ? 'Check is ${-d} ${d == -1 ? 'day' : 'days'} late'
            : 'Check is due today',
        r,
      );
    } else if (rb == 'soon' || rb == 'past') {
      final d = daysBetween(day, r.fields['resets'] ?? '');
      final limit = r.fields['limit'];
      item = NeedItem(
        'limit',
        5,
        '${limit != null && limit.isNotEmpty ? '$limit · ' : ''}'
            '${d < 0 ? 'Reset date passed' : (d == 0 ? 'Resets today' : 'Resets in $d ${d == 1 ? 'day' : 'days'}')}',
        r,
      );
    }
    if (item != null) out.add(item);
  }
  final indexed = out.asMap().entries.toList();
  indexed.sort((a, b) {
    final x = a.value;
    final y = b.value;
    if (x.rank != y.rank) return x.rank - y.rank;
    final xd = x.r.nextCheck.isNotEmpty ? x.r.nextCheck : x.r.trialEnd;
    final yd = y.r.nextCheck.isNotEmpty ? y.r.nextCheck : y.r.trialEnd;
    final byDate = (xd.isEmpty ? '\u{FFFF}' : xd)
        .compareTo(yd.isEmpty ? '\u{FFFF}' : yd);
    if (byDate != 0) return byDate;
    final byTitle = x.r.title.compareTo(y.r.title);
    return byTitle != 0 ? byTitle : a.key.compareTo(b.key);
  });
  return indexed.map((e) => e.value).toList();
}

class NextActionContext {
  NextActionContext(this.drafts, this.stale, this.total, this.pins);
  final int drafts;
  final int stale;
  final int total;
  final int pins;
}

class NextAction {
  NextAction(this.id, this.text, this.button);
  final String id;
  final String text;
  final String button;
  Map<String, Object?> toJson() =>
      <String, Object?>{'id': id, 'text': text, 'button': button};
}

/// When nothing is urgent: the one most useful thing to do next.
NextAction nextAction(NextActionContext ctx) {
  if (ctx.drafts > 0) {
    return NextAction(
      'review',
      '${ctx.drafts} ${ctx.drafts == 1 ? 'link is' : 'links are'} still '
          'unreviewed. Two minutes in Quick review clears a few.',
      'Review now',
    );
  }
  if (ctx.stale > 0) {
    return NextAction(
      'stale',
      '${ctx.stale} ${ctx.stale == 1 ? 'resource has' : 'resources have'} '
          'not been looked at in a while.',
      'See them',
    );
  }
  if (ctx.total >= 4 && ctx.pins == 0) {
    return NextAction(
      'pin',
      'Pin the links you use most, so they are one tap away here.',
      'Pin some',
    );
  }
  if (ctx.total < 5) {
    return NextAction(
      'add',
      'Add the links you use. Share them to Nexus, paste them, or import a '
          'bookmarks file.',
      'Add links',
    );
  }
  return NextAction('clear', 'Nothing needs you right now.', '');
}

/// Unreviewed links, best-informed first, skipped ones last.
List<Resource> reviewQueue(List<Resource> resources, [List<String> skipped = const []]) {
  final skip = <String, int>{};
  for (var i = 0; i < skipped.length; i++) {
    skip[skipped[i]] = i;
  }
  int info(Resource r) =>
      (r.scan != null && r.scan!.desc.isNotEmpty) ? 0 : (r.notes.isNotEmpty ? 1 : 2);
  final pool = resources
      .where((r) => r.draft && r.src != 'following')
      .toList();
  return _stableSort(pool, (a, b) {
    final aSkip = skip.containsKey(a.id);
    final bSkip = skip.containsKey(b.id);
    if (aSkip != bSkip) return aSkip ? 1 : -1;
    if (aSkip) return skip[a.id]!.compareTo(skip[b.id]!);
    final byInfo = info(a) - info(b);
    if (byInfo != 0) return byInfo;
    final byCreated = a.createdAt.compareTo(b.createdAt);
    if (byCreated != 0) return byCreated;
    return a.title.compareTo(b.title);
  });
}

/// Examples for the search box, taken from the user's own "use it when" lines.
List<String> exampleQueries(
  List<Resource> resources, [
  int n = 3,
  int seed = 0,
]) {
  final lines = <String>[];
  for (final r in resources) {
    if (r.draft || r.status == 'archived') continue;
    for (final l in r.useWhen) {
      if (l.length >= 8 && l.length <= 48) lines.add(l);
    }
  }
  if (lines.isEmpty) return <String>[];
  final out = <String>[];
  var i = seed.abs() % lines.length;
  for (var k = 0; k < lines.length && out.length < n; k++) {
    if (!out.contains(lines[i])) out.add(lines[i]);
    i = (i + 7) % lines.length;
  }
  return out;
}
