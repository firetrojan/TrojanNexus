import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/app.dart';

void main() {
  testWidgets('the app starts and shows its name', (WidgetTester tester) async {
    await tester.pumpWidget(const NexusApp());
    expect(find.text('Nexus'), findsOneWidget);
  });
}
