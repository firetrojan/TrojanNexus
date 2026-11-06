# Integrator log - round H: storage backend, app shell, profile page, APK readiness

Date: 2026-11-05
Builder of this round: AndroidHarness (Code) - taking the Integrator scaffold work (PLAN T2.1 + T3.1).
CI is still the only Flutter compiler. **Nothing in this round was compiled by Flutter.** Every
`flutter analyze` / `flutter test` result below is unknown until CI runs.

## Item 1 - storage

- `app/lib/core/storage_file.dart` (mobile, `dart:io`) is untouched and still the mobile backend.
- NEW `app/lib/core/storage_prefs.dart`: `PrefsStorage implements Storage`, one JSON string under
  the key `nexus.v1` (the same key the web app uses: `legacy/web-src/js/store.js` `STORAGE_KEY`).
- NEW `app/lib/core/storage_pick.dart`: the one small file that picks, with a conditional import:

```dart
import 'storage_pick_stub.dart'
    if (dart.library.io) 'storage_pick_io.dart'
    if (dart.library.html) 'storage_pick_web.dart';

export 'storage.dart';
```

  Because a conditional import can only satisfy the same symbols from every branch, the three
  branches each declare `Storage createDefaultStorage(String path)`:
  `storage_pick_io.dart` -> `FileStorage(path)`, `storage_pick_web.dart` -> `PrefsStorage('nexus.v1')`
  (the path is ignored on web), `storage_pick_stub.dart` -> `MemoryStorage()` (tests, and anything
  that is neither io nor html).
- `Storage` in `storage.dart` is unchanged, so the store's interface is unchanged. `StoreCore`
  and `NexusStore` were not touched.

## Item 2 - shell

NEW files (all under `app/lib/ui/`):

- `store_scope.dart` (22 lines): `StoreScope extends InheritedNotifier<NexusStore>` with
  `static NexusStore of(BuildContext)`. One notifier for the whole tree, so a store change rebuilds
  each listener once. No state-management package, plain Flutter.
- `tabs.dart` (69 lines): the five tabs and the plain count each one will own. Labels and order
  come from `legacy/web-src/js/ui/hud.js` L10 `TABS`, minus `Galaxy` (the 3D map is not in this
  port's scope yet):
  `[['home','Home'],['sectors','Sectors'],['vault','Vault'],['missions','Missions'],['alerts','Alerts']]`
  Home shows `resources, sectors, missions, to review`; the others show their own count.
- `shell.dart` (62 lines): `AppBar` (title `Nexus`, Profile button with tooltip `Profile`),
  `IndexedStack` body so each tab keeps its scroll position, `NavigationBar` with the five labels.
  The store is passed in already loaded.

REWRITTEN `app/lib/app.dart` (73 lines, Integrator-only file): `NexusApp` is now a `StatefulWidget`
that builds the `StoreCore`, awaits `store.load(seed)` in `initState`, shows
`CircularProgressIndicator` while waiting and the real app afterwards. `themeMode` comes from
`store.settings.theme`, and the text scale from `store.settings.textSize` through a
`MediaQuery` override, so both follow the system by default and the store afterwards.

`app/lib/main.dart` is unchanged: it still only calls `runApp(const NexusApp())`.

Theme and text-size values are the web app's (`legacy/web-src/js/ui/core.js` L122-124):
theme `auto|light|dark`, textSize `m|l|xl`, and those are the values already in
`app/lib/core/defaultSettings`.

## Item 3 - profile page

NEW `app/lib/ui/profile_page.dart` (150 lines). Wording from `legacy/web-src/js/ui/core.js`:

| here | legacy string |
|---|---|
| title | `Profile` (`openPanel('core', { kind:'view', title:'Profile' ...})`, L26) |
| `Theme` + `Auto`/`Light`/`Dark` + `Auto follows your phone setting.` | verbatim, L122 |
| `Text size` + `Normal`/`Large`/`Larger` + `Makes the writing bigger everywhere.` | verbatim, L124 |
| `Load a backup file`, sub `Bookmarks, Instagram following list, CSV, OPML` | `Restore a backup file` + `Import files` sub (L56/181-ish) |
| `Save a backup`, sub `Best: keeps a copy off this phone` | `Share backup (Drive, email, chat)` sub `Best: keeps a copy off this phone` (L175) |
| Merge/Replace dialog | `Merge: add what is missing` / `Replace everything` (L49-50) |
| counts after an import | `plural(n,'resource') + ...` style, the same three counts as the footer on the last line of core.js |

Flow: `Load a backup file` -> `FilePicker.platform.pickFiles(type: FileType.any, withData: true)`
-> `jsonDecode(String.fromCharCodes(bytes))` -> a dialog with **Merge** and **Replace** (the two
legacy choices; legacy confirms "Replace everything" only when the file is a full backup, and
`store.importBackup(data, mode)` throws `StoreError` for a file that is not one) ->
`store.importBackup(data, mode)` -> `store.save()` -> the message shows
`N resources, N sectors, N missions`.
`Save a backup` -> `const JsonEncoder.withIndent('  ').convert(store.exportData())` ->
`utf8.encode` -> `Share.shareXFiles([XFile.fromData(bytes, name:'nexus-backup.json',
mimeType:'application/json')], subject:'Nexus backup')`, then the same three counts.

## Item 4 - tests

NEW `app/test/app_test.dart` (102 lines, 5 tests) and `app/test/profile_backup_test.dart`
(73 lines, 2 tests). Both use `MemoryStorage` and a frozen `Clock`, so no plugin and no disk are
touched. `fixtures/sample-backup.json` (44 resources, 4 sectors, 2 missions) is the only fixture.

| test | what it checks |
|---|---|
| `the app starts and shows the 5 tabs` | the app builds, `Nexus` title, all five tab labels present, Profile button present |
| `tapping each tab shows its title` | tapping Home/Sectors/Vault/Missions/Alerts opens that tab |
| `loading the sample backup shows its counts` | with the sample backup as the seed, Home shows `44 resources, 4 sectors, 2 missions, 0 to review` (counts equal to the fixture's) |
| `dark theme works` | Profile -> Dark sets `themeMode` to dark; Light sets it back to light |
| `text size changes the text scale` | Larger gives `textScaler.scale(14) > 1.0`, Normal gives exactly 1.0 |
| `the profile page shows the appearance settings and both backup actions` | Profile title, Theme row, all six option labels, both backup rows, the two legacy hint strings |
| `the settings chosen on the profile page survive a restart` | Dark + Larger are saved through the storage backend and a second app start reads them back |

## Item 5 - APK readiness (and the workflow)

`.github/workflows/ci.yml` was read and **not edited**. Two facts matter:

1. The `apk` job creates the platform folders itself:
   `if [ ! -d android ] || [ ! -d web ]; then flutter create --platforms=android,web --project-name nexus --org app.nexus . ; fi`
   `android/` is generated by CI, never committed. So **any hand edit to `android/app/build.gradle`
   is thrown away on the next CI run.** To control minSdk (or a manifest permission) you either
   commit `android/` or add a post-`flutter create` step to the workflow.
2. The `apk` job runs `flutter build apk --release` and uploads it as an artifact. It only runs on
   `workflow_dispatch` or when the commit message contains `[apk]`.

### What the CI-created `android/` needs

- `minSdkVersion`: both plugins use the Android Storage Access Framework
  (`ACTION_OPEN_DOCUMENT` / `ACTION_OPEN_DOCUMENT_TREE`), which is API 19+; the Android
  implementations of both ship `minSdkVersion 21`. **Not verified**: I could not fetch either
  `android/build.gradle` (raw.githubusercontent.com 404 for both), so treat 21 as "almost certainly
  right, confirm on the first APK build". `flutter create` writes Flutter's own default
  (`flutter.minSdkVersion`); if that is already >= 21 nothing has to change.
- **No storage permission is needed.** Verified from the packages' own READMEs: file_picker's
  Android implementation (`android_file_picker`) is "supporting file picking, saving, and Storage
  Access Framework (SAF) URI grants" - SAF hands the app a per-URI grant, so
  `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` are not declared and not needed. share_plus
  shares through `ACTION_SEND`, which needs no permission either. Adding either permission would
  be a Google Play policy problem, not just noise.
- Java: the CI APK job already uses `setup-java` with `java-version: '17'`, which is what the
  plugins need.
- One plugin note for later (PLAN T3.3, share target): `android_file_picker`'s README says if the
  app overrides `onActivityResult` in a custom `MainActivity` it must call
  `super.onActivityResult(...)`, otherwise picking a file fails silently. The default
  `flutter create` MainActivity is fine.

### Does the workflow have to change?

**Yes, one thing, and only if you want to control minSdk or add a manifest permission**: because
`android/` is regenerated by the workflow, a change to `android/app/build.gradle` or
`android/app/src/main/AndroidManifest.xml` cannot survive. Either
(a) commit `android/` and drop the `flutter create` step, or (b) add a step after it that edits
`minSdk` / the manifest, or (c) leave it alone and accept Flutter's defaults. I did not edit
`.github/` in this round. Everything else in the workflow already fits: `flutter pub get` runs
before the build, and `flutter analyze` + `flutter test` run in the `test` job, so the new widget
tests will be compiled and run by CI.

### Packages added to `app/pubspec.yaml`

- `file_picker: ^8.1.2`
- `share_plus: ^10.1.2`

Chosen on the 8.x / 10.x majors deliberately: those are the majors whose `XFile` is re-exported
from `package:share_plus/share_plus.dart`, so the code needs no third package (the rules allow only
`file_picker` and `share_plus`). The newer majors (file_picker 13, share_plus 13) require importing
`package:cross_file/cross_file.dart` directly and rewriting both call sites to the new instance API.

## What this round could NOT verify

- Nothing was compiled by Flutter: no `flutter analyze`, no `flutter test`, no build.
- The conditional import was not exercised on the web target (no Flutter, so no
  `flutter build web`); it is plain `dart.library.io` / `dart.library.html` syntax, but the branch
  selection is unproven here.
- `file_picker` and `share_plus` were never called: no `flutter pub get` ran, so it is unverified
  that the two versions resolve under the Dart SDK CI uses.
- The widget tests may still fail on exact finder behaviour (for example `find.byType(MediaQuery).first`
  picking the wrong MediaQuery, or `SegmentedButton` label matching). CI will say.
