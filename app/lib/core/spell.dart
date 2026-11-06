// spell.dart - port of legacy/web-src/js/spell.js. "Did you mean" using words you own.
import 'dart:math' as math;

import 'model/resource.dart';
import 'search.dart';

/// Every word of 3+ letters in names, tags, abilities and "use it when" lines,
/// with how often it appears.
Map<String, int> vocabulary(List<Resource> resources) {
  final counts = <String, int>{};
  for (final r in resources) {
    final text = <String>[
      r.title,
      r.tags.join(' '),
      r.capabilities.join(' '),
      r.useWhen.join(' '),
    ].join(' ');
    for (final w in tokenize(text)) {
      if (w.length >= 3) counts[w] = (counts[w] ?? 0) + 1;
    }
  }
  return counts;
}

/// Number of edits (add, remove, change a letter, swap neighbours) to turn
/// [a] into [b], stopping at max + 1 once it is clearly larger.
int editDistance(String a, String b, [int max = 2]) {
  final aa = a.runes.toList();
  final bb = b.runes.toList();
  if ((aa.length - bb.length).abs() > max) return max + 1;
  List<int>? prev2;
  var prev = List<int>.generate(bb.length + 1, (j) => j);
  for (var i = 1; i <= aa.length; i++) {
    final cur = List<int>.filled(bb.length + 1, 0);
    cur[0] = i;
    var low = i;
    for (var j = 1; j <= bb.length; j++) {
      var v = math.min(
        math.min(prev[j] + 1, cur[j - 1] + 1),
        prev[j - 1] + (aa[i - 1] == bb[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && aa[i - 1] == bb[j - 2] && aa[i - 2] == bb[j - 1]) {
        v = math.min(v, prev2![j - 2] + 1);
      }
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[bb.length];
}

bool _known(String t, List<String> words, Set<String> stems) {
  if (stems.contains(stem(t))) return true;
  if (t.length >= 4) {
    for (final w in stems) {
      if (w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return true;
    }
  }
  for (final w in words) {
    if (w == t) return true;
    if (t.length >= 4 && w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) {
      return true;
    }
    if (t.length >= 3 && w.contains(t)) return true;
  }
  return false;
}

class SpellChange {
  SpellChange(this.from, this.to);
  final String from;
  final String to;
  Map<String, Object?> toJson() =>
      <String, Object?>{'from': from, 'to': to};
}

class SpellFix {
  SpellFix(this.q, this.changes);
  final String q;
  final List<SpellChange> changes;
  Map<String, Object?> toJson() => <String, Object?>{
        'q': q,
        'changes': changes.map((x) => x.toJson()).toList(),
      };
}

class SpellSuggestion {
  SpellSuggestion(this.q, this.changes, this.n);
  final String q;
  final List<SpellChange> changes;
  final int n;
  Map<String, Object?> toJson() => <String, Object?>{
        'q': q,
        'changes': changes.map((x) => x.toJson()).toList(),
        'n': n,
      };
}

/// The query with typos fixed, or null when every word is fine or nothing
/// close exists. Words under 4 letters are never changed.
SpellFix? didYouMean(String query, Map<String, int> vocab) {
  final raw = tokenize(query);
  if (raw.isEmpty) return null;
  final words = vocab.keys.toList();
  final stems = words.map(stem).toSet();
  final fix = <String, String>{};
  for (final t in raw) {
    if (STOP.contains(t) || t.length < 4 || fix.containsKey(t)) continue;
    if (_known(t, words, stems)) continue;
    final max = t.length >= 6 ? 2 : 1;
    String? best;
    var bestDistance = max + 1;
    for (final w in words) {
      if (w == t || w.length < 3) continue;
      final d = editDistance(t, w, max);
      if (d > max) continue;
      var better = best == null || d < bestDistance;
      if (!better && d == bestDistance) {
        final count = vocab[w]!;
        final bestCount = vocab[best]!;
        if (count > bestCount) {
          better = true;
        } else if (count == bestCount) {
          final wFirst = w.isNotEmpty && w[0] == t[0];
          final bestFirst = best.isNotEmpty && best[0] == t[0];
          if (wFirst != bestFirst) {
            better = wFirst;
          } else if (w.compareTo(best) < 0) {
            better = true;
          }
        }
      }
      if (better) {
        best = w;
        bestDistance = d;
      }
    }
    if (best != null) fix[t] = best;
  }
  if (fix.isEmpty) return null;
  return SpellFix(
    raw.map((t) => fix[t] ?? t).join(' '),
    fix.entries.map((e) => SpellChange(e.key, e.value)).toList(),
  );
}

/// A fix that really helps: suggestions plus how many links the fixed words
/// find. Null when there is no fix or it finds nothing.
SpellSuggestion? suggestFix(
  List<Resource> resources,
  String query, [
  SearchOptions opts = const SearchOptions(),
]) {
  final dm = didYouMean(query, vocabulary(resources));
  if (dm == null) return null;
  final n = search(
    resources,
    dm.q,
    SearchOptions(mode: opts.mode, types: opts.types, statuses: opts.statuses),
  ).results.length;
  if (n == 0) return null;
  return SpellSuggestion(dm.q, dm.changes, n);
}
