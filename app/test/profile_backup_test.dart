// profile_backup_test.dart - the Profile page: settings wording and the two backup actions.
// In-memory storage only. The picker and the share sheet are platform plugins, so this test checks
// what the page shows and that the store-visible settings round-trip; fixtures/sample-backup.json
// is used for the counts (no real data).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/app.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/store_core.dart';

void main() {
  testWidgets('the profile page shows the appearance settings and both backup actions',
      (tester) async {
    final seed = jsonDecode(File('fixtures/sample-backup.json').readAsStringSync()) as Map;
    await tester.pumpWidget(NexusApp(
      storage: MemoryStorage(),
      clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
      seed: seed.cast<String, Object?>(),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.account_circle_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Theme'), findsOneWidget);
    for (final label in <String>['Auto', 'Light', 'Dark']) {
      expect(find.text(label), findsOneWidget, reason: '$label is missing');
    }
    for (final label in <String>['Normal', 'Large', 'Larger']) {
      expect(find.text(label), findsOneWidget, reason: '$label is missing');
    }
    expect(find.text('Your data'), findsOneWidget);
    expect(find.text('Load a backup file'), findsOneWidget);
    expect(find.text('Save a backup'), findsOneWidget);
    // The web app's wording for the two hints.
    expect(find.text('Auto follows your phone setting.'), findsOneWidget);
    expect(find.text('Makes the writing bigger everywhere.'), findsOneWidget);
  });

  testWidgets('the settings chosen on the profile page survive a restart', (tester) async {
    final storage = MemoryStorage();
    await tester.pumpWidget(NexusApp(
      storage: storage,
      clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
      seed: const <String, Object?>{},
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.account_circle_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Larger'));
    await tester.pumpAndSettle();

    // A new app over the same storage starts up with the saved settings.
    await tester.pumpWidget(NexusApp(
      storage: storage,
      clock: Clock(now: () => DateTime.utc(2026, 10, 31, 12)),
      seed: const <String, Object?>{},
    ));
    await tester.pumpAndSettle();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.dark,
    );
    final scale = tester.widget<MediaQuery>(find.byType(MediaQuery).first).data.textScaler.scale(14);
    expect(scale, greaterThan(1.0));
  });
}
