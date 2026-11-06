# Builder checklist - round E: importers gaps without a cap, date blind spot

Date: 2026-11-05
Builder: AndroidHarness (Code)
Status: all items DONE. Full log: `docs/log/2026-11-05-builder-e.md`.

- [x] 1. IMPORTERS GAPS: `node tools/golden_gaps.mjs importers` BEFORE never-run lines 40;
      AFTER 8 (all six MAX_ENTRIES guards covered by hand tests + two proven dead lines).
      The four listed readSource cases + Firefox JSON, opml/csv/plist/links-html/json-list sniff,
      Instagram HTML with and without h2, followers via relationships_followers - all added and
      verified reachable. Regenerate twice (identical), `bash tools/check.sh` -> CHECK PASSED,
      Dart tests pass (205/205 importers).
- [x] 1b. Same proof standard for sharein L3/L12/L26 (dead: JSON `in` cannot carry a
      URLSearchParams, probe output pasted), topics L63 (dead: call site guarded at topics.js:131),
      pageparse (4 -> 0, all four reachable and covered), game L65 (hand test).
- [x] 1c. The 7 hand tests written: `app/test/golden/importers_caps_test.dart` (MAX_ENTRIES 6000
      for bookmarks HTML, bookmarks JSON, OPML, CSV rows+CSV, links HTML, URL list, JSON array)
      + the focus cap 400 test in `game_test.dart`. All pass.
- [x] 2a. Clock-reading legacy exports listed in `docs/log/2026-11-05-builder-e.md`:
      util todayISO/addDays/uid, exporters markdownAll/upcomingEvents/icsFor, home needsItems,
      insights addedPerMonth; watch/week/recent/time/mission read no clock.
- [x] 2b. tools/gen_golden_tz.mjs -> fixtures/golden/tz.json, 28 cases (14 per wall time),
      in tools/check.sh step 4; run twice -> identical; check.sh reports `unchanged`.
- [x] 2c. app/test/golden/tz_test.dart freezes the Dart clock LOCALLY (DateTime(2026,10,31,2,0)
      / (23,30), not .utc). No new hook needed: core/util.dart already has `nowClock`.
      Files touched: tools/gen_golden_r4.mjs, app/lib/core/importers_sniff.dart,
      app/test/golden/importers_caps_test.dart, app/test/golden/game_test.dart,
      app/test/golden/tz_test.dart, docs/log/* (full list in the log).
- [x] 2d. Whole suite under TZ=UTC / Asia/Kolkata / America/Los_Angeles:
      each `SUMMARY` totals 1108/1108/0 over 33 files, `DART TESTS PASSED`.
- [x] 2e. PROVE IT BITES: on a COPY, `iso()` switched to UTC getters only ->
      RED under Kolkata: `FAIL tz golden util.todayISO @02:00 #1 expected "2026-10-31" actual "2026-10-30"`;
      RED under Los Angeles: `FAIL tz golden util.todayISO @23:30 #15 expected "2026-10-31" actual "2026-11-01"`.
- [x] 3. Final: full suite 3 zones (all PASSED), `node tools/lint_dart.mjs` ->
      `lint_dart: 94 file(s), 0 error(s), 0 warning(s)`, `bash tools/check.sh` -> CHECK PASSED.
