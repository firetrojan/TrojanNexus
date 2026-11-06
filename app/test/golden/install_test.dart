import 'package:nexus/core/install.dart';

import 'golden.dart';

void main() {
  runGolden('install', {
    'installState': (a) {
      final m = a[0] as Map<String, dynamic>;
      return installState(
        protocol: m['protocol']?.toString() ?? '',
        host: m['host']?.toString() ?? '',
        standalone: m['standalone'] == true,
        canPrompt: m['canPrompt'] == true,
      ).toJson();
    },
    'badgeCount': (a) => badgeCount(a[0]),
    'shortcutFor': (a) => shortcutFor(a[0], a[1] == true),
  });
}
