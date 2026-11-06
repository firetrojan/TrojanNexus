// jump.dart - port of legacy/web-src/js/jump.js. "Go to" places and matcher.
class JumpCommand {
  const JumpCommand(this.id, this.label, this.sub, this.words, this.icon);
  final String id;
  final String label;
  final String sub;
  final String words;
  final String icon;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'label': label,
        'sub': sub,
        'words': words,
        'icon': icon,
      };
}

const List<JumpCommand> COMMANDS = <JumpCommand>[
  JumpCommand('backup', 'Back up my data', 'Save a copy off this phone',
      'backup back up save copy export download safe', 'download'),
  JumpCommand('restore', 'Restore a backup', 'Bring a saved copy back',
      'restore recover import backup file undo copy', 'upload'),
  JumpCommand('safety', 'Safety copies', 'Automatic copies made before big changes',
      'safety snapshot undo recover lost copies', 'lock'),
  JumpCommand('insights', 'Insights', 'What you use and what you do not',
      'insights stats numbers usage most used idle cull balance storage', 'sigma'),
  JumpCommand('reset', 'Weekly reset', 'A short checklist and 3 picks',
      'weekly week reset review checklist picks routine', 'check'),
  JumpCommand('dupes', 'Duplicates', 'Merge links about the same thing',
      'duplicates duplicate merge same site twice', 'layers'),
  JumpCommand('tags', 'Tags', 'Rename, merge or delete tags',
      'tags tag rename merge clean labels', 'tag'),
  JumpCommand('ideas', 'New sector ideas', 'Groups of links that have no sector yet',
      'ideas suggest sectors group organise organize new categories', 'sectors'),
  JumpCommand('tidy', 'Tidy up links', 'Remove tracking junk and fix bad titles',
      'tidy clean links tracking utm titles fix junk', 'spark'),
  JumpCommand('import', 'Import links', 'Bookmarks, Instagram list, CSV, OPML',
      'import bookmarks instagram csv opml upload file', 'upload'),
  JumpCommand('add', 'Add a link', 'Save a new link',
      'add new link save paste create', 'plus'),
  JumpCommand('review', 'Review new links', 'The links waiting for you',
      'review inbox new unreviewed drafts waiting confirm', 'scan'),
  JumpCommand('due', 'What is due', 'Checks, trials, limits, changes',
      'due alerts overdue today trials checks needs', 'alert'),
  JumpCommand('stale', 'Old links', 'Not checked in a while',
      'old stale unchecked outdated', 'clock'),
  JumpCommand('missions', 'Missions', 'Your step-by-step routes',
      'missions mission route steps threads plan', 'mission'),
  JumpCommand('sectors', 'Sectors', 'Your sectors in columns',
      'sectors sector folders groups columns', 'sectors'),
  JumpCommand('vault', 'Vault', 'Every link in one table',
      'vault table all links list filter sort', 'library'),
  JumpCommand('galaxy', 'Galaxy', 'The 3D map',
      'galaxy map 3d space stars', 'target'),
  JumpCommand('calendar', 'Put dates in my calendar', 'Due dates, trial ends, limit resets',
      'calendar dates reminders ics schedule trial', 'clock'),
  JumpCommand('focus', 'Focus run', 'A timed work session',
      'focus timer run session work pomodoro', 'play'),
  JumpCommand('profile', 'Profile and settings', 'Theme, text size, open on, lookups',
      'profile settings theme dark light text size options preferences open on', 'core'),
  JumpCommand('whatsnew', "What's new", 'What changed in this version',
      'whats new changes version update release notes', 'star'),
  JumpCommand('install', 'Install the app', 'Add Nexus to your home screen',
      'install app home screen chrome pwa shortcut', 'download'),
];

const Set<String> _stop = <String>{
  'how', 'do', 'i', 'my', 'the', 'a', 'an', 'to', 'can', 'where', 'is', 'go',
  'show', 'me', 'please', 'want', 'open', 'take', 'find', 'need', 'get', 'of',
  'and', 'for', 'in',
};

List<String> _words(String? s) => (s ?? '')
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .trim()
    .split(' ')
    .where((x) => x.isNotEmpty)
    .toList();

/// Places that match what was typed, best first (at most [n]). Every typed
/// word must match the start of a word in the name or keywords.
List<JumpCommand> jumpMatches(
  String? query, [
  int n = 4,
  bool Function(String id)? has,
  List<JumpCommand> commands = COMMANDS,
]) {
  final toks = _words(query).where((t) => !_stop.contains(t)).toList();
  if (toks.isEmpty || toks.join().length < 2) return <JumpCommand>[];
  final keep = has ?? (_) => true;
  final out = <_ScoredJump>[];
  for (final c in commands) {
    if (!keep(c.id)) continue;
    final label = _words(c.label);
    final kw = _words(c.words);
    var score = 0.0;
    var all = true;
    for (final t in toks) {
      var best = 0.0;
      if (label.join().startsWith(t) || label[0].startsWith(t)) {
        best = 3;
      } else if (label.any((w) => w.startsWith(t))) {
        best = 2.5;
      } else if (kw.any((w) => w.startsWith(t))) {
        best = 1.5;
      }
      if (best == 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (all) out.add(_ScoredJump(c, score));
  }
  out.sort((a, b) {
    final byScore = b.score.compareTo(a.score);
    return byScore != 0 ? byScore : a.c.label.compareTo(b.c.label);
  });
  return out.take(n).map((x) => x.c).toList();
}

class _ScoredJump {
  _ScoredJump(this.c, this.score);
  final JumpCommand c;
  final double score;
}
