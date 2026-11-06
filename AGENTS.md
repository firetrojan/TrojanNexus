# AGENTS.md - read this first, every session

You are one of three coding agents working in this folder. You do NOT share memory with the others.
**The files in this folder are the only memory.** Trust files, not your own recollection.

## 1. What we are building
Nexus is a personal resource manager (saved links, sectors, missions, weekly reset, search, "go to").
It exists today as a web app (v3.3, in `legacy/web-src/`). We are porting it to **Flutter** (in `app/`) so it runs
on Android, in any browser (installable web app) and later iOS/desktop.
The web app stays the product until the parity checklist in `docs/PLAN.md` passes. Do not break `legacy/`.

## 2. Every session, in this order
1. Read this file. 2. Read `docs/STATE.md`. 3. Open `docs/PLAN.md` and take ONE task you are allowed to take.
4. Read only the files that task names (legacy file + golden file + the Dart files it touches). Do NOT read all of `legacy/`.
5. Work. 6. Check (section 5). 7. Commit with `bash tools/commit.sh`. 8. Write `docs/log/<date>-<yourname>.md`.

## 3. The hard truth about this environment
- **Nobody here can run Flutter.** The phone has no Flutter SDK. The compiler and test runner is GitHub Actions (`.github/workflows/ci.yml`).
- So: write small, plain, conservative Dart. When unsure whether an API exists, use a simpler one you are sure of.
- After you push, read the CI result with `bash tools/ci_log.sh` (writes `docs/CI_LAST.txt`). Fix what it says. Never claim "it works" before CI is green.
- If the same CI error survives 2 of your attempts: STOP. Write `docs/requests/blocked-<task>.md` (error, what you tried), pick another task.

## 4. Decisions already made (do not change them)
- Flutter stable, Dart 3, null safety. App code in `app/`, package name `nexus`, imports as `package:nexus/...`.
- **No code generation anywhere**: no build_runner, freezed, json_serializable, riverpod_generator, drift. Write `fromJson/toJson` by hand.
- **No state-management package.** One `NexusStore extends ChangeNotifier` (mirrors `legacy/web-src/js/store.js`), shown with `ListenableBuilder`.
- Navigation: plain `Navigator` (push/pop). No go_router.
- Allowed packages: `path_provider`, `shared_preferences`, `url_launcher` (already in pubspec). Anything else: ask via `docs/requests/` (Integrator adds it).
- Storage: one JSON document (same shape as the web backup, see `docs/DATA_MODEL.md`) behind an interface `Storage`. Files on Android/desktop (atomic write: temp file then rename, keep the last 5 copies), `shared_preferences` on web at first.
- Dates are text `YYYY-MM-DD`. Times are milliseconds since 1970 (int). Tags are lower case with no `#`.
- Keep a file under ~400 lines. One idea per file. No `part` files. No `dynamic` except at the JSON edge.
- UI look: iOS-like, light and dark, Material 3 widgets are fine. Text must stay plain and short (the owner reads simple English).

## 5. How to port a module (the pattern, see `app/lib/core/tidy.dart` and `app/test/golden/tidy_test.dart`)
1. Read the legacy `.js` file and `fixtures/golden/<module>.json`.
2. Write `app/lib/core/<module>.dart` with the same function names (camelCase as in JS) and the same behaviour.
3. Write `app/test/golden/<module>_test.dart` using `test/golden/golden.dart`. Cases for functions you have not ported must be `skip`ped, not deleted.
4. **The golden file is the truth.** If your reading of the JS disagrees with a golden case, the golden case wins. Never edit anything in `fixtures/golden/`.
5. Do not "improve" behaviour while porting. Write ideas into `docs/IDEAS.md`.
6. Before pushing run `node tools/lint_dart.mjs` (catches unbalanced brackets, missing imports, packages not in pubspec, banned patterns). It needs only Node. `bash tools/check.sh` runs it plus more checks. Run pure-Dart golden tests with `DART_BIN=/path/to/dart bash tools/dart_test.sh` (strict local `flutter_test` stand-in; not Flutter, but it compiles the real Dart).

## 6. Who may touch what (single-writer rule)
- Each task in `docs/PLAN.md` has `paths:`. You may edit ONLY the paths of the task you claimed.
- **Integrator-only files**: `app/pubspec.yaml`, `app/lib/main.dart`, `app/lib/app.dart`, `app/lib/core/store.dart`, `.github/`, `tools/`, `AGENTS.md`, `docs/PLAN.md` (except your own task row), `docs/STATE.md`.
  Need a change there? Write `docs/requests/<yourname>-<n>.md` (what, why, exact text).
- Read-only for everyone: `legacy/`, `fixtures/`.
- Claim a task: set its row to `claimed by <name> <date>` in `docs/PLAN.md`, then `bash tools/commit.sh "claim T1.3" docs/PLAN.md` at once.
  Finished: set `review`. Only the Integrator sets `done`, after CI is green.

## 7. Git
- Only `bash tools/commit.sh "message" path1 path2 ...` (it takes a lock, adds only the paths you list, commits, pushes).
- Never `git add -A`, never force push, never rewrite history, never edit `.git`.

## 8. Privacy
- Never put the owner's real data, notes, accounts, tokens or API keys in this folder. Use `fixtures/sample-backup.json`.
- Free model providers may keep prompts. Never paste personal text into a prompt.

## 9. Be honest
- In your log say what you did NOT verify. "CI green" is the only proof that Dart compiles.
- If a task is bigger than your context, split it in `docs/PLAN.md` instead of half-doing it.
