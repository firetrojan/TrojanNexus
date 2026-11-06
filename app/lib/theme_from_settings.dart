// theme_from_settings.dart - theme mode and text scale, read from the store's settings.
// Values are the web app's (legacy/web-src/js/ui/core.js): theme auto/light/dark,
// textSize m/l/xl.
import 'package:flutter/material.dart';

ThemeMode themeModeFor(String theme) {
  switch (theme) {
    case 'light':
      return ThemeMode.light;
    case 'dark':
      return ThemeMode.dark;
    default:
      return ThemeMode.system;
  }
}

double textScaleFor(String textSize) {
  switch (textSize) {
    case 'l':
      return 1.15;
    case 'xl':
      return 1.3;
    default:
      return 1.0;
  }
}
