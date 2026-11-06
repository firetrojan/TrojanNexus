import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('normalize', {
    'normalizeResource': (a) =>
        normalizeResource(a[0], a[1] as String?).toJson(),
    'computeNextCheck': (a) =>
        computeNextCheck(a[0], a[1] as String?),
    'deriveRssUrl': (a) =>
        deriveRssUrl(a[0] as String?, a[1] as String?),
  });
}
