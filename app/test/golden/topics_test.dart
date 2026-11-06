import 'package:nexus/core/topics.dart';

import 'golden.dart';

Map<String, Object?> _map(Object? value) => (value as Map).cast<String, Object?>();

List<Map<String, Object?>> _topicsOut() => TOPICS
    .map((t) => <String, Object?>{
          'id': t.id,
          'label': t.label,
          'use': t.use,
          'cap': t.cap,
          'words': t.words.map((w) => <String, Object?>{'text': w.text, 'w': w.w}).toList(),
        })
    .toList();

Map<String, Object?>? _guess(Object? value) => value is Map ? _map(value) : null;

void main() {
  runGolden('topics', <String, GoldenFn>{
    'TOPICS': (a) => _topicsOut(),
    'BASIS_LABEL': (a) => BASIS_LABEL,
    'guessTopic': (a) => guessTopic(a.isEmpty ? const <String, Object?>{} : _map(a[0])),
    'describeGuess': (a) => describeGuess(
          _guess(a[0]),
          a.length > 1 ? _map(a[1]) : const <String, Object?>{},
        ),
    'guessFields': (a) => guessFields(
          _guess(a[0]),
          a.length > 1 ? _map(a[1]) : const <String, Object?>{},
        ),
  });
}
