import 'package:nexus/core/sharein.dart';

import 'golden.dart';

void main() {
  runGolden('sharein', <String, GoldenFn>{
    'parseShare': (a) => parseShare(a[0] as String),
    'parseAction': (a) => parseAction(a[0] as String),
  });
}
