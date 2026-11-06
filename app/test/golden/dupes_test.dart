import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/dupes.dart';
import 'package:nexus/core/model/resource.dart';

void main() {
  group('dupes helpers', () {
    test('siteIndex groups by owner and skips follows and empty urls', () {
      final a = normalizeResource(<String, dynamic>{
        'id': 'a',
        'url': 'https://github.com/alice/a',
      });
      final b = normalizeResource(<String, dynamic>{
        'id': 'b',
        'url': 'https://github.com/alice/b',
      });
      final following = normalizeResource(<String, dynamic>{
        'id': 'c',
        'url': 'https://github.com/alice/c',
        'src': 'following',
      });
      final empty = normalizeResource(<String, dynamic>{'id': 'd'});
      final index = siteIndex(<Resource>[a, b, following, empty]);
      expect(index.keys.toList(), <String>['github.com/alice']);
      expect(index['github.com/alice']!.map((r) => r.id).toList(), <String>['a', 'b']);
    });

    test('sameSite compares normalised addresses', () {
      final a = normalizeResource(<String, dynamic>{
        'id': 'a',
        'url': 'https://github.com/alice/a',
      });
      final b = normalizeResource(<String, dynamic>{
        'id': 'b',
        'url': 'https://github.com/alice/a?utm_source=x',
      });
      final index = siteIndex(<Resource>[a, b]);
      final other = sameSite(a, index);
      expect(other, hasLength(1));
      expect(other.first.r.id, 'b');
      expect(other.first.same, isTrue);
    });

    test('flagEntries reports already saved and batch peers', () {
      final saved = normalizeResource(<String, dynamic>{
        'id': 'a',
        'title': 'Saved',
        'url': 'https://github.com/alice/a',
      });
      final entries = <ImportEntry>[
        ImportEntry(url: 'https://github.com/alice/b', title: 'B'),
        ImportEntry(url: 'https://github.com/alice/c', title: 'C'),
      ];
      final flagged = flagEntries(entries, <Resource>[saved]);
      expect(flagged, hasLength(2));
      expect(flagged.first.others.first.saved, isTrue);
      expect(flagged.first.others.last.title, 'C');
      expect(flagged.first.others.last.saved, isFalse);
    });
  });
}
