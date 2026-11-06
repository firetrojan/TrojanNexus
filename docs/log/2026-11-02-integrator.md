# 2026-11-02 - Integrator audit (Phase 0)

## What I read
`AGENTS.md`, `docs/STATE.md`, `docs/PLAN.md` (Phase 0), `docs/DATA_MODEL.md`, all six Dart files,
both workflows, all six tools, `app/pubspec.yaml`, and `legacy/web-src/js/tidy.js` with `fixtures/golden/tidy.json`.

## Existence check (all present)
- `app/pubspec.yaml`
- `app/lib/main.dart`, `app/lib/app.dart`, `app/lib/core/tidy.dart`
- `app/test/golden/golden.dart`, `app/test/golden/tidy_test.dart`, `app/test/smoke_test.dart`
- `.github/workflows/ci.yml`, `.github/workflows/bootstrap.yml`
- `tools/check.sh`, `tools/ci_log.sh`, `tools/commit.sh`, `tools/gen_golden.mjs`, `tools/lint_dart.mjs`, `tools/sync.sh`
- `fixtures/golden/*.json` (21 module files + `_shared_links.json`), `fixtures/sample-backup.json`

## `bash tools/check.sh`
All six steps passed; no failing line:
1. `lint_dart`: 6 files, 0 errors, 0 warnings.
2. Tool syntax: all 6 scripts OK.
3. JSON: 23 files valid.
4. Golden files: unchanged after `TZ=UTC node tools/gen_golden.mjs`.
5. Secrets/personal files: none found.
6. Workflow tabs: none.
Ended with `CHECK PASSED`.

## Dart and workflow audit
I found no line that I am sure will fail to compile, fail `flutter analyze`, or fail in GitHub Actions.
The Dart is plain and all imports are used. `tidy.dart` follows `tidy.js` function by function; I checked the
three implemented functions against every relevant golden case by reading. `tidyFindings` is correctly skipped.

Unproven items are in `docs/STATE.md` under "Suspect" (pub versions, `flutter create` on an existing project,
`Directory` API, Unicode regex, Pages without `configure-pages`, bootstrap push, APK signing, `ci_log.sh`,
`grep -P` on Termux, and one `cleanUrl` edge case).

## Changes
- Updated `docs/STATE.md` with the audit, suspects, CI/version placeholders, and phone steps.
- Updated the four Phase 0 rows in `docs/PLAN.md`.
- No Dart or workflow change: there was no failure I was sure about, and guessing edits without a compiler is worse.

## Tools tested (T0.4, in a throwaway repo under /tmp)
- `commit.sh`: exact-path commit, commit + push to a local bare remote, secret refusal, and path refusal all behaved.
- `sync.sh`: `git add -A` + secret refusal behaved (it correctly refused a test token file).
- `ci_log.sh`: correctly refuses when `gh` is absent (exit 2). The real gh path was not tested.
- `lint_dart.mjs`: 0 errors in the kit.
This was not the real Termux shared-storage test; the repo and remote do not exist yet.

## Not verified
- No Dart compiler, no `flutter pub get`, no `flutter analyze`, no `flutter test`.
- No GitHub Actions run, no Pages deploy, no bootstrap run, no APK.
- No push: this copy has no `.git`, no `origin`, and `gh` is not installed.
- No real phone/Termux shared-storage test of git.

## Next
The owner follows `docs/STATE.md` > "Owner to do" steps 1-7 and sends the first CI result. Only then can T0.2
be completed and T0.3/T0.4 verified. Do not start the bake-off before the first green CI run.
