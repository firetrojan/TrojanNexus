# Builder checklist - round F: week.js local midnight + stray dates

Date: 2026-11-05
Builder: AndroidHarness (Code)
Status: all items DONE. Full log: `docs/log/2026-11-05-builder-f.md`.

- [x] 1. week.js L64: `week.dart:283` already built the midnight with `DateTime(y,m,d)` (local, no Z)
      and was left unchanged. `tz.json` gained `week.weekDigest` (4 resources, `openedAt` as LOCAL
      wall-time strings "2026-10-24T23:59:59.999" / "2026-10-25T00:00:00.000" /
      "2026-10-25T00:00:00.001" / "not-a-date", `today` = 2026-10-31 so `from` = 2026-10-25);
      the generator converts with `new Date(str).getTime()`, the Dart test with a locally built
      `DateTime(y,m,d,h,mi,s,ms)`. Expected `opened` = 2 from the real JS. Whole suite green in
      3 zones. BITE: copy with `DateTime.utc` -> RED in Kolkata (opened 0) and LA (opened 3).
- [x] 2a. The grep over app/lib is fully tabulated with a verdict per hit in the log:
      (a) clock-hook / todayISO 22, (b) intentionally UTC as in the JS 15, (c) wrong 0.
- [x] 2b. legacy store.js clock reads: 32 hits, each mapped to its Dart counterpart with a verdict
      (same table). Real-JS parity proof for `importers.toISODate` pasted from the legacy file in
      3 zones - the Dart port answers identically, so the `toUtc()` lines are (b) not bugs.
- [x] 2c. tz.json gained 6 store cases at both wall times (addResource, markChecked, startTrial,
      setVerdict, snooze, setStepDone) - 6 functions that write today's date, more than the 4 asked
      for. Smallest wrapper: `St.resetToSeed(seed)` in the generator (a second `St.load()` replays
      the saved localStorage state instead of the seed - proved), fresh `StoreCore` per case in Dart.
- [x] 2d. Two latent bugs found by those cases and fixed: `store_sectors.dart` setStepDone and
      `store_backup.dart` exportedAt used `clock.now().toUtc()`, which shifts a LOCAL DateTime into
      the real zone; both now go through the shared `instantNow(Clock)` helper (the same rule
      round E used for icsFor DTSTAMP). No Dart rule was changed to fit a golden case.
- [x] 3. Final: full suite 3 zones (`total=1122 passed=1122 failed=0` each, 33 files),
      `node tools/lint_dart.mjs` -> `lint_dart: 94 file(s), 0 error(s), 0 warning(s)`,
      `bash tools/check.sh` -> CHECK PASSED; `gen_golden_tz` regenerated 3x, identical.

## Note on the two `DateTime.utc` fixes

`store_sectors.dart` setStepDone and `store_backup.dart` exportedAt wrote a UTC instant. The JS
source for both is `new Date().toISOString()`, an instant of the frozen clock, and the golden is
generated with the generator running under TZ=UTC - the wall clock read as UTC. The Dart port's
`toUtc()` shifted the local wall clock into the device's real zone, so under LA it stamped
2026-11-01T06:30:00.000Z where the JS stamps 2026-11-01T23:30:00.000Z. `instantNow()` reads the
clock's own wall fields as UTC instead, matching the JS in every zone.

## The bite proof (item 1)

On a copy of the folder, `week.dart:283` changed to `DateTime.utc`:

```
##### week.dart COPY with DateTime.utc, TZ=Asia/Kolkata
FAIL tz golden week.weekDigest @02:00 #15
  expected: {"added":4,"opened":2,...}
  actual:   {"added":4,"opened":0,...}
##### week.dart COPY with DateTime.utc, TZ=America/Los_Angeles
FAIL tz golden week.weekDigest @02:00 #15
  expected: {"added":4,"opened":2,...}
  actual:   {"added":4,"opened":3,...}
```

## Files touched this round

`tools/gen_golden_tz.mjs`, `app/lib/core/store_types.dart`, `app/lib/core/store_sectors.dart`,
`app/lib/core/store_backup.dart`, `app/test/golden/tz_test.dart`,
`docs/log/f-checklist.md`, `docs/log/2026-11-05-builder-f.md`, `fixtures/golden/tz.json`.
