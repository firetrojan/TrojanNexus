import 'package:nexus/core/history.dart';

import 'golden.dart';

void main() {
  runGolden('history', {
    'normLog': (a) => normLog(a[0]).map((e) => e.toJson()).toList(),
    'pushLog': (a) => pushLog(a[0], a[1], a[2] as String)
        .map((e) => e.toJson())
        .toList(),
    'showLog': (a) => showLog(a[0]).map((e) => e.toJson()).toList(),
    'LOG_MAX': (a) => LOG_MAX,
    'LOG_KINDS': (a) => LOG_KINDS,
  });
}
