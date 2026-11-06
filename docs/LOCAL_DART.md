# LOCAL_DART.md - compile and run the pure-Dart tests without Flutter

The phone/this folder has no Flutter SDK. It does have a real Dart 3 VM. This runner
compiles and runs every `app/test/golden/*_test.dart` against a **strict stand-in** for
`flutter_test`, so a wrong type or a failing golden case fails here before CI.

## Run

```bash
DART_BIN=/path/to/dart bash tools/dart_test.sh
```

`DART_BIN` is the `dart` executable (Dart 3). If `dart` is already in `PATH`, omit it:

```bash
bash tools/dart_test.sh
```

Run only some modules:

```bash
DART_BIN=/path/to/dart bash tools/dart_test.sh tidy tags week
```

Normal run: exit 0 only if every executed test passed. Skipped golden cases are printed
as `SKIP` and counted; they do not fail the run (same as Flutter). A compile error, a
thrown exception, or an `expect` failure exits non-zero.

## Self-test (must fail)

```bash
DART_BIN=/path/to/dart bash tools/dart_test.sh --self-test
echo "exit=$?"
```

It runs `tools/selftest/failing_test.dart`, which deliberately expects `1 == 2`.
The output must show `FAIL`, the `SUMMARY ... failed=1 ...` line, and exit 1. This proves
the runner and the stand-in cannot pass failures silently.

## How it works

- `tools/dart_test.sh` makes a temporary package, copies `app/lib/core`, the golden tests
  and `fixtures/golden`, and adds `tools/flutter_test_stub` as a path dependency.
- `tools/flutter_test_stub` is not Flutter. It implements only `test`, `group`, `expect`,
  `fail`, and the matchers used by these tests (`equals`, `isNull`, `isNotNull`, `isTrue`,
  `isFalse`, `isEmpty`, `isNotEmpty`, `contains`, `hasLength`). Missing APIs fail to
  compile; a non-`Matcher` expected value is compared with deep equality.
- Test bodies must be synchronous. There are no widgets, `testWidgets`, goldens-by-image,
  `setUp`/`tearDown`, or async tests in this stand-in.
- The real `fixtures/golden/*.json` files are the source of truth. This runner does not
  edit them.

## Limits

This is a fast local gate, not CI. It does not run `flutter analyze`, `flutter test`, the
web build, the APK build, or any widget/plugin code. GitHub Actions remains the proof that
the real Flutter app compiles.

At the time this runner was added, `tidy_test.dart` had 28 passing cases and 1 skipped
(`tidyFindings`, waiting for T1.2). After T1.2 it must be 29/29.
