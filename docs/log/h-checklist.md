# Integrator checklist - round H: storage, shell, profile, apk readiness

Date: 2026-11-05
Builder of this round: AndroidHarness (Code) - acting as Integrator for the scaffold rows
(PLN T2.1 storage/shell/profile). CI is still the only Flutter compiler: nothing here was compiled
by Flutter. Log: `docs/log/2026-11-05-integrator-h.md`.

- [x] 1. STORAGE: `storage_file.dart` kept as the mobile backend. `storage_prefs.dart` added for
      web; `storage_pick.dart` picks between them with a conditional import (plus
      `storage_pick_io.dart`, `storage_pick_web.dart`, `storage_pick_stub.dart` for the branches).
      The `Storage` interface and the store's own API are unchanged.
- [x] 2. SHELL: `app/lib/ui/shell.dart` (+ `store_scope.dart`, `tabs.dart`) and `app.dart` rewritten.
      `NexusApp` loads the store asynchronously (CircularProgressIndicator, then the app), gives it
      to widgets through an InheritedNotifier (`StoreScope`), 5 tabs (Home, Sectors, Vault,
      Missions, Alerts), each body a placeholder with the plain counts it will own, a Profile
      button in the app bar, light/dark following the system, text scale from the store's settings.
- [x] 3. PROFILE: `app/lib/ui/profile_page.dart` - theme (auto/light/dark), text size
      (normal/large/larger), "Load a backup file" (file_picker, Replace or Merge, then the counts
      resources/sectors/missions), "Save a backup" (exportData to a file, then the share sheet).
      Wording taken from `legacy/web-src/js/ui/core.js`.
- [x] 4. TESTS: `app/test/app_test.dart` (5 tests) and `app/test/profile_backup_test.dart` (2 tests),
      in-memory storage, `fixtures/sample-backup.json`.
- [x] 5. APK READINESS: what `android/` needs is written in the log. `.github/` was NOT edited.
      The workflow DOES need one change (see the log, "Does the workflow have to change").

## Round-F leftovers fixed in this same round

The CI errors and warnings of the previous round were fixed first (they were on the desk when this
round started):

- `app/test/model_test.dart`: `import 'package:flutter_test/flutter_test.dart' hide matches;`
- `app/lib/core/importers_formats.dart`: unused `_cell` deleted
- `app/test/golden/store_ops_test.dart`: unused `flutter_test` import deleted
- `node tools/lint_dart.mjs` -> 0 errors; whole suite green under TZ=UTC and TZ=Asia/Kolkata.
