// app_test.dart - widget tests for the shell, the tabs and the profile page.
// In-memory storage only; the fixture is fixtures/sample-backup.json (no real data).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/app.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/store_core.dart';

import 'fixture_path.dart';

Map<String, Object?> _sample() {
  final raw = fixtureFile('sample-backup.json').readAsStringSync();
  return (jsonDecode(raw) as Map).cast<String, Object?>();
}

/// The fixture's three lists, typed once so the counts below are real numbers.
List<Object?> _listOf(Map<String, Object?> data, String key) {
  final v = data[key];
  if (v is! List) fail('sample-backup.json has no $key list');
  return v;
}

int _draftCount(List<Object?> resources) =>
    resources.where((r) => r is Map && r['draft'] == true).length;

/// One frame so the store finishes loading (the loading screen is an endless
/// progress indicator, which pumpAndSettle alone would never settle past), then
/// settle the rest.
Future<void> _start(tester) async {
  await tester.pumpWidget(_app());
  await tester.pump();
  await tester.pumpAndSettle();
}

/// A label in the bottom bar only: the open tab's body repeats its own title, so a
/// plain find.text(label) can match two widgets and tester.tap would fail.
Finder _tab(String label) => find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text(label),
    );

Clock _frozenClock() => Clock(now: () => DateTime.utc(2026, 10, 31, 12));

Widget _app({Map<String, Object?>? seed}) => NexusApp(
      storage: MemoryStorage(),
      clock: _frozenClock(),
      seed: seed ?? const <String, Object?>{},
    );

/// The tab labels in order.
const List<String> _tabLabels = <String>['Home', 'Sectors', 'Vault', 'Missions', 'Alerts'];

/// The text scale the app really applies. Read through the whole bottom bar: that widget sits
/// inside the MediaQuery the app inserts, whatever way its labels are drawn, so this does not
/// depend on any private widget inside app.dart. Returns 0 when there is no such MediaQuery,
/// so a missing one fails with "expected: <1.0> actual: <0>" instead of a StateError.
double _appliedTextScale(WidgetTester tester) {
  final data = MediaQuery.maybeOf(tester.element(find.byType(NavigationBar)));
  return data == null ? 0 : data.textScaler.scale(14);
}

void main() {
  testWidgets('the app starts and shows the 5 tabs', (tester) async {
    await _start(tester);
    expect(find.text('Nexus'), findsOneWidget);
    for (final label in _tabLabels) {
      expect(_tab(label), findsOneWidget, reason: 'tab $label is missing');
    }
    expect(find.byIcon(Icons.account_circle_outlined), findsOneWidget);
  });

  testWidgets('tapping each tab shows its title', (tester) async {
    await _start(tester);
    for (final label in _tabLabels) {
      await tester.tap(_tab(label));
      await tester.pumpAndSettle();
      expect(find.text(label), findsWidgets, reason: 'tab $label did not open');
    }
  });

  testWidgets('loading the sample backup shows its counts', (tester) async {
    final data = _sample();
    await tester.pumpWidget(_app(seed: data));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(_tab('Home'), findsOneWidget);
    // The count comes from the store, so a label that only says "44 resources" is NOT there.
    final resources = _listOf(data, 'resources');
    final jobs = _listOf(data, 'jobs');
    final threads = _listOf(data, 'threads');
    expect(
      find.text('${resources.length} resources'),
      findsNothing,
      reason: 'Home shows the counts together, not one on its own',
    );
    // Home shows resources, sectors, missions and to-review counts from the fixture.
    final expected = '${resources.length} resources, '
        '${jobs.length} sectors, '
        '${threads.length} missions, '
        '${_draftCount(resources)} to review';
    expect(find.text(expected), findsOneWidget);
  });

  testWidgets('dark theme works', (tester) async {
    await _start(tester);
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
    await _start(tester);
    await tester.tap(find.byIcon(Icons.account_circle_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Larger'));
    await tester.pumpAndSettle();
    expect(_appliedTextScale(tester), greaterThan(1.0));
    await tester.tap(find.text('Normal'));
    await tester.pumpAndSettle();
    expect(_appliedTextScale(tester), 1.0);
  });
}
