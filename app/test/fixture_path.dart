
// fixture_path.dart - finds a file under the kit's fixtures/ folder from any working directory.
// `flutter test` runs with the working directory set to app/, while the pure-Dart golden runner
// runs from a temp folder with fixtures copied beside it, so walk up until the file is found.
// Same idea as _goldenDir() in test/golden/golden.dart.
import 'dart:io';

File fixtureFile(String name) {
  var dir = Directory.current;
  for (var i = 0; i < 6; i++) {
    final f = File('${dir.path}/fixtures/$name');
    if (f.existsSync()) return f;
    final parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError('fixtures/$name not found above ${Directory.current.path}');
}
