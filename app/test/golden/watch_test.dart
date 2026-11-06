import 'package:nexus/core/watch.dart';

import 'golden.dart';

Object? _throws(Object? Function() body) {
  try {
    return body();
  } catch (e) {
    if (e is TypeError) return <String, dynamic>{'throws': 'TypeError'};
    return <String, dynamic>{'throws': e.runtimeType.toString()};
  }
}

void main() {
  runGolden('watch', <String, GoldenFn>{
    'norm': (a) => norm(a[0]),
    'fingerprint': (a) => fingerprint(a[0], a.length > 1 ? a[1] : null),
    'usable': (a) => _throws(() => usable(a[0])),
    'compare': (a) => compare(a[0], a[1]),
    'normWatch': (a) => normWatch(a[0]),
  });
}
