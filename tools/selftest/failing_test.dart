// Deliberately failing test, used only by `bash tools/dart_test.sh --self-test`.
// It proves the stand-in reports failures and the runner exits non-zero.
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('deliberate failure for the runner self-test', () {
    expect(1, 2);
  });
}
