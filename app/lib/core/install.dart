// install.dart - port of legacy/web-src/js/install.js. Install help and shortcuts.
class InstallState {
  InstallState(this.kind, this.title, this.text, this.steps);
  final String kind;
  final String title;
  final String text;
  final List<String> steps;

  Map<String, Object?> toJson() => <String, Object?>{
        'kind': kind,
        'title': title,
        'text': text,
        'steps': steps,
      };
}

/// Can this page be installed as an app, and what should it tell you?
InstallState installState({
  String protocol = '',
  String host = '',
  bool standalone = false,
  bool canPrompt = false,
}) {
  if (standalone) {
    return InstallState(
      'installed',
      'Installed',
      'Nexus is running as an app on this device.',
      <String>[],
    );
  }
  if (protocol == 'file:') {
    return InstallState(
      'file',
      'This is a saved file',
      'Chrome cannot install a file from your storage. Installing needs the app version on an https address, once. After that it also works offline.',
      <String>[
        'Unzip Nexus-app and put the folder on a free host (GitHub Pages, or Netlify Drop which takes the folder as it is).',
        'Open that https address in Chrome.',
        'Tap the menu (three dots), then Install app. Or come back here and press Install.',
        'Your data stays on each device. Move it with a backup file.',
      ],
    );
  }
  if (protocol == 'http:' && !RegExp(r'^(localhost|127\.0\.0\.1|\[::1\])$').hasMatch(host)) {
    return InstallState(
      'insecure',
      'Needs https',
      'Chrome only installs apps from https addresses. This one is plain http.',
      <String>['Put the app on an https host, then open that address.'],
    );
  }
  if (canPrompt) {
    return InstallState(
      'ready',
      'Ready to install',
      'Chrome can install Nexus now. It opens in its own window, works offline, and can show a count on its icon.',
      <String>[],
    );
  }
  return InstallState(
    'menu',
    'Install from the Chrome menu',
    'Chrome has not offered an Install button here. That happens when the app is already installed, or the browser is not Chrome.',
    <String>[
      'Open the Chrome menu (three dots).',
      'Choose Install app, or Add to Home screen.',
      'Open Nexus from there.',
    ],
  );
}

num? _number(Object? v) {
  if (v is num) return v.isFinite ? v : null;
  if (v is String) {
    final n = num.tryParse(v.trim());
    return n != null && n.isFinite ? n : null;
  }
  return null;
}

/// The number to show on the app icon: whole, 0 to 99.
int badgeCount(Object? n) {
  final value = _number(n);
  if (value == null) return 0;
  final whole = value.floor();
  if (whole < 0) return 0;
  if (whole > 99) return 99;
  return whole;
}

bool _truthy(Object? v) => v != null && v != false && v != 0 && v != '';

/// Is this key press meant for a shortcut? Not while typing, not with
/// Ctrl/Alt/Meta, and only the keys we use.
String shortcutFor(Object? event, bool typing) {
  final e = event is Map ? event : const <Object?, Object?>{};
  if (typing || _truthy(e['ctrlKey']) || _truthy(e['metaKey']) || _truthy(e['altKey'])) {
    return '';
  }
  switch (e['key']) {
    case '/':
      return 'search';
    case 'n':
    case 'N':
      return 'add';
    case '?':
      return 'help';
  }
  return '';
}
