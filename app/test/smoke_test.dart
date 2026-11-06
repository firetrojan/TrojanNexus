// smoke_test.dart - the smallest check that the app builds and shows its name.
// In-memory storage, so the real backend is never touched and no file is written.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/app.dart';
import 'package:nexus/core/storage.dart';
import 'package:nexus/core/store_core.dart';

void main() {
  testWidgets('the app starts and shows its name', (WidgetTester tester) async {
    await tester.pumpWidget(NexusApp(
      storage: MemoryStorage(),
      clock: Clock(now: () => DateTime(2026, 10, 31, 12)),
      seed: const <String, Object?>{},
    ));
    // The store loads asynchronously: one frame for it, then settle.
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Nexus'), findsOneWidget);
  });
}
