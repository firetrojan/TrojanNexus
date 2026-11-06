// app_test.dart - widget tests for the shell, the tabs and the profile page.
// In-memory storage only; the fixture is fixtures/sample-backup.json (no real data).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/app.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/store_core.dart';

Map<String, Object?> _sample() {
  final raw = File('fixtures/sample-backup.json').readAsStringSync();
  return (jsonDecode(raw) as Map).cast<String, Object?>();
}

Clock _frozenClock() => Clock(now: () => DateTime.utc(2026, 10, 31, 12));

Widget _app({Map<String, Object?>? seed}) => NexusApp(
      storage: MemoryStorage(),
      clock: _frozenClock(),
      seed: seed ?? const <String, Object?>{},
    );

/// The tab labels in order.
const List<String> _tabLabels = <String>['Home', 'Sectors', 'Vault', 'Missions', 'Alerts'];

void main() {
  testWidgets('the app starts and shows the 5 tabs', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    expect(find.text('Nexus'), findsOneWidget);
    for (final label in _tabLabels) {
      expect(find.text(label), findsOneWidget, reason: 'tab $label is missing');
    }
    expect(find.byIcon(Icons.account_circle_outlined), findsOneWidget);
  });

  testWidgets('tapping each tab shows its title', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    for (final label in _tabLabels) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(find.text(label), findsWidgets, reason: 'tab $label did not open');
    }
  });

  testWidgets('loading the sample backup shows its counts', (tester) async {
    final data = _sample();
    await tester.pumpWidget(_app(seed: data));
    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);
    expect(
      find.text('${data['resources']!.length} resources'),
      findsNothing,
      reason: 'the count comes from the store, not from a label on its own',
    );
    // Home shows resources, sectors, missions and to-review counts from the fixture.
    final expected = '${(data['resources'] as List).length} resources, '
        '${(data['jobs'] as List).length} sectors, '
        '${(data['threads'] as List).length} missions, '
        '${(data['resources'] as List).where((r) => (r as Map)['draft'] == true).length} to review';
    expect(find.text(expected), findsOneWidget);
  });

  testWidgets('dark theme works', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.account_circle_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.dark,
    );
    // and it survives a store reload, because it is saved in the settings
    await tester.tap(find.text('Light'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.light,
    );
  });

  testWidgets('text size changes the text scale', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.account_circle_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Larger'));
    await tester.pumpAndSettle();
    final scaler = tester.widget<MediaQuery>(find.byType(MediaQuery).first).data.textScaler;
    expect(scaler.scale(14), greaterThan(1.0));
    await tester.tap(find.text('Normal'));
    await tester.pumpAndSettle();
    final back = tester.widget<MediaQuery>(find.byType(MediaQuery).first).data.textScaler;
    expect(back.scale(14), 1.0);
  });
}
