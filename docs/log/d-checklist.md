# Builder checklist - last round on the Nexus Flutter port

Date: 2026-11-04
Builder: AndroidHarness (Code)

Status: all six items DONE. Full log: `docs/log/2026-11-04-builder-c2.md`.

Dart SDK 3.13.7 is installed and runnable:
`/data/local/tmp/androidharness/com.androidharness.app/linux/lib/dart-sdk/bin/dart`
(the PATH shim `.../linux/bin/dart` execs the separate Termux app's private dart-sdk and fails with
"Permission denied" for uid 2000, so every run sets DART_BIN to the real SDK path).

- [x] 1. game (store-backed state, JS pct rounding `(x+0.5).floor()`, unlock returns badge objects,
      clear-sky = checks >= 1 AND overdue == 0, full-atlas = total >= 10 AND drafts == 0 AND reviews >= 1,
      stats from store_stats.dart, xp 29/30/1000/999999/1000000/1000001 added to the generator,
      game_test.dart 46 lines, no special cases: the grep prints nothing)
      -> `SUMMARY total=50 passed=50 failed=0 skipped=0` / `DART TESTS PASSED`
- [x] 2. Test count: every golden case is its own test; whole suite
      `total=1021 passed=1021 failed=0 skipped=0` over 31 files
      (1030 golden cases - 12 snap cases without a Dart port + 3 hand-written dupes tests = 1021)
- [x] 3. Mutation check, one per module, run on a COPY in the scratch dir, all 8 RED:
      watch 2, importers 1, exporters 6, sharein 1, suggest 16, topics 7, pageparse 1, game 4 failures
- [x] 4. Time zones: whole suite under UTC / Asia/Kolkata / America/Los_Angeles ->
      1021/1021/0 in each, `DART TESTS PASSED`. Dart honours TZ (Kolkata offset 5:30).
- [x] 5. Gaps: BEFORE -> AFTER never-run lines: watch 0 -> 0, importers 64 -> 40, exporters 16 -> 0,
      sharein 4 -> 3, suggest 0 -> 0, topics 2 -> 1, pageparse 24 -> 4, game 6 -> 1.
      Replay mismatches 0 for all 8 (WRAP gained the exporters and game call shapes).
      Generator run twice -> identical; `bash tools/check.sh` -> CHECK PASSED.
      The lines that stay are documented in the log: 5 proven dead in the legacy JS, 7 need a hand
      test (MAX_ENTRIES 6000, focus cap 400), the rest are cap-limited or V8 constant-pool artefacts.
- [x] 6. docs/IDEAS.md: the wrong "codeUnitAt vs runes" note was not in the file; the a-z0-9 parity
      note was added.
