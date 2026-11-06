import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/model/job.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/settings.dart';
import 'package:nexus/core/model/thread.dart';
import 'package:nexus/core/rules.dart';

void main() {
  test('a resource survives a json round trip', () {
    final r = normalizeResource(
      <String, Object?>{
        'id': 'r1',
        'title': '  A link  ',
        'url': 'https://a.test',
      },
      '2026-10-31',
    );
    final again = Resource.fromJson(r.toJson());
    expect(again.id, 'r1');
    expect(again.title, 'A link');
    expect(again.createdAt, '2026-10-31');
  });

  test('a job and a thread normalize their input', () {
    final j = Job.fromJson(<String, Object?>{
      'id': 'j1',
      'name': ' Design ',
      'members': <String>['r1'],
    });
    expect(j.name, 'Design');
    expect(j.members, <String>['r1']);

    final t = Thread.fromJson(<String, Object?>{
      'id': 't1',
      'steps': <Object?>[
        'r1',
        <String, Object?>{'id': 'r2', 'done': true},
      ],
    });
    expect(t.steps.length, 2);
    expect(t.steps[0].rid, 'r1');
    expect(t.steps[1].rid, 'r2');
    expect(t.steps[1].done, isTrue);
  });

  test('settings keep unknown keys', () {
    final s = Settings.fromJson(<String, Object?>{
      'theme': 'dark',
      'futureKey': 'keep',
    });
    expect(s.theme, 'dark');
    expect(s.toJson()['futureKey'], 'keep');
  });

  test('a rule is cleaned and can be matched', () {
    final rule = normRule(<String, Object?>{
      'match': 'any',
      'conds': <Object?>[
        <String, Object?>{'f': 'type', 'op': 'is', 'v': 'docs'},
      ],
    });
    expect(rule, isNotNull);
    expect(rule!.match, 'any');
    final r = normalizeResource(<String, Object?>{
      'id': 'r9',
      'type': 'docs',
      'createdAt': '2026-10-01',
    }, '2026-10-31');
    expect(matches(r, rule, '2026-10-31'), isTrue);
  });
}
