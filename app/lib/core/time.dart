// time.dart - port of legacy/web-src/js/time.js. "How much time do I have?"
import 'dart:math' as math;

class TimeMode {
  const TimeMode(this.v, this.l);
  final String v;
  final String l;
}

const List<TimeMode> MODES = <TimeMode>[
  TimeMode('quick', '10 min'),
  TimeMode('hour', '1 hour'),
  TimeMode('tired', 'Tired'),
];

String _many(int n, String one, String more) => '$n ${n == 1 ? one : more}';

class TimeContext {
  TimeContext({
    this.drafts = 0,
    this.easy = 0,
    this.attention = 0,
    this.overdueTrials = 0,
    this.missionLeft = 0,
    this.missionName = '',
    this.stale = 0,
    this.backupDue = false,
  });

  final int drafts;
  final int easy;
  final int attention;
  final int overdueTrials;
  final int missionLeft;
  final String missionName;
  final int stale;
  final bool backupDue;
}

class TimeItem {
  TimeItem(this.id, this.text);
  final String id;
  final String text;

  Map<String, Object?> toJson() => <String, Object?>{'id': id, 'text': text};
}

class TimePlan {
  TimePlan(this.lead, this.items);
  final String lead;
  final List<TimeItem> items;

  Map<String, Object?> toJson() => <String, Object?>{
        'lead': lead,
        'items': items.map((x) => x.toJson()).toList(),
      };
}

/// A short list for the time you have. [mode] is quick, hour or tired.
TimePlan timePlan(String mode, TimeContext c) {
  final items = <TimeItem>[];
  void add(String id, String text) => items.add(TimeItem(id, text));
  final left = c.missionLeft;
  late String lead;
  if (mode == 'quick') {
    lead = 'Short on time. Do these, then stop.';
    if (c.attention > 0) {
      add(
        'needs',
        'Clear ${_many(math.min(3, c.attention), 'thing', 'things')} from Needs you'
            '${c.attention > 3 ? ' (${c.attention} waiting)' : ''}',
      );
    }
    if (left > 0) {
      add('mission', 'Do the next step of ${c.missionName.isEmpty ? 'your mission' : c.missionName}');
    }
    if (c.drafts > 0) {
      add(
        'review',
        'Review ${_many(math.min(5, c.drafts), 'new link', 'new links')}'
            '${c.drafts > 5 ? ' (${c.drafts} waiting)' : ''}',
      );
    }
  } else if (mode == 'hour') {
    lead = 'A full hour. In this order:';
    if (c.backupDue) add('backup', 'Back up your data');
    if (c.attention > 0) {
      add('needs', 'Clear ${c.attention > 8 ? 'the first 8 of ${c.attention}' : 'all ${c.attention}'} in Needs you');
    }
    if (left > 0) {
      add(
        'mission',
        'Do the next ${_many(math.min(3, left), 'step', 'steps')} of '
            '${c.missionName.isEmpty ? 'your mission' : c.missionName}',
      );
    }
    if (c.drafts > 0) {
      add(
        'review',
        'Review ${_many(math.min(15, c.drafts), 'new link', 'new links')}'
            '${c.drafts > 15 ? ' (${c.drafts} waiting)' : ''}',
      );
    }
    if (c.stale > 0) {
      add('stale', 'Look at ${_many(math.min(5, c.stale), 'old resource', 'old resources')}');
    }
  } else {
    lead = 'Tired. Only easy jobs: one tap each, no thinking.';
    if (c.overdueTrials > 0) {
      add(
        'needs',
        'Decide on ${_many(c.overdueTrials, 'trial', 'trials')} that already ended. They can cost money.',
      );
    }
    if (c.easy > 0) {
      add(
        'review',
        'Keep or archive ${_many(math.min(5, c.easy), 'link', 'links')} that already show what they are',
      );
    }
  }
  if (items.isEmpty) {
    lead = mode == 'tired' ? 'Nothing easy is waiting. Rest.' : 'Nothing is waiting. You are clear.';
  }
  return TimePlan(lead, items);
}
