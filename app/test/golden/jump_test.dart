import 'package:nexus/core/jump.dart';

import 'golden.dart';

void main() {
  runGolden('jump', {
    'COMMANDS': (a) => COMMANDS.map((x) => x.toJson()).toList(),
    'jumpMatches': (a) {
      final missing = ((a[2] as Map<String, dynamic>)['missing'] as List<dynamic>? ??
              <dynamic>[])
          .map((x) => x.toString())
          .toSet();
      return jumpMatches(
        a[0] as String,
        (a[1] as num).toInt(),
        (id) => !missing.contains(id),
      ).map((x) => x.id).toList();
    },
  });
}
