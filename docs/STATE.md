# STATE.md - the one page that says where we are (Integrator updates it; everyone reads it)

Updated: 2026-11-02 (Integrator audited the kit; no GitHub run yet)

## Facts
- Legacy web app: v3.3, 44 JS files, ~8,300 dense lines. Pure logic ~2,000 lines. 3D galaxy ~1,150 lines.
- Golden test vectors: 323 cases in 21 files (`fixtures/golden/`), made by running the real JS. Regenerate: `TZ=UTC node tools/gen_golden.mjs`.
- Flutter port: skeleton only. `app/lib/core/tidy.dart` has 3 of 4 tidy functions as the reference pattern.
- The kit is **not a git repository yet** in this copy. There is no `origin`, no `gh`, and no Flutter/Dart installed here. So no push and no CI run happened in this session.
- Audit 2026-11-02: every required file exists (see the log). `bash tools/check.sh` passed every step:
  6 Dart files linted with 0 errors/warnings; 6 tool scripts syntax OK; 23 JSON files valid;
  golden files unchanged after regeneration; no secrets; no tabs in workflows.

## Compile / analyze / GitHub Actions audit (2026-11-02)
- I found **no line in the Dart files or workflow files that I am sure will fail** to compile, analyze, or run.
- The Dart is small and conservative. `tidy.dart` matches `legacy/web-src/js/tidy.js` line by line for the three ported functions.
- `flutter analyze` has `--no-fatal-infos`; all imports are used and there are no known warnings.
- The real proof is still missing: Flutter has never compiled this code, and the workflows have never run on GitHub.

## Suspect (not sure; watch the first CI run)
1. `app/pubspec.yaml:12-14` - `path_provider ^2.1.0`, `shared_preferences ^2.2.0`, `url_launcher ^6.2.0` are lower bounds only. `flutter pub get` may resolve newer versions or need a different SDK floor. Not tested.
2. `.github/workflows/ci.yml:56,82,130` - `flutter create ... .` runs on an existing project. I believe it skips existing `lib/main.dart`, `pubspec.yaml` and `analysis_options.yaml` (no `--overwrite`), but this was not run. If it rewrites them, the smoke test or pubspec can change.
3. `app/test/golden/golden.dart:20-28` - `Directory.current.absolute`, `Directory.parent` and the 6-level search for `fixtures/golden` are believed correct, but were not compiled.
4. `app/lib/core/tidy.dart:72` - `RegExp(..., unicode: true)` with `\p{L}\p{N}` needs a Dart 3 VM. Believed supported; not compiled here.
5. `.github/workflows/ci.yml:88-90` - Pages upload/deploy without `actions/configure-pages`. The deploy job is `continue-on-error`, so a green run does not prove Pages works. The owner enabling Pages is the real test.
6. `.github/workflows/bootstrap.yml:38` - plain `git push` depends on the Actions checkout having an upstream `main`. Believed true; not run.
7. Android `flutter build apk --release` uses the template debug signing. Fine for the owner's phone, not for a store. Not verified.
8. `tools/ci_log.sh` uses `gh run list/view --json`; `gh` is not installed here, so only the "gh is not installed" path was tested.
9. `tools/check.sh` uses `grep -P` and GNU `diff`; it passed in this PRoot. On real Termux, if they are missing: `pkg install diffutils grep`.
10. `app/lib/core/tidy.dart:28-45` - `cleanUrl` takes the text before `#` and assumes the `?` is in that part. A URL like `https://a.test/p#?x` would throw. No golden case does this, so it is not a CI failure, but it is a real edge case for T1.2.

## CI status and versions
- CI has **not run**. Flutter stable version used by CI: unknown.
- Package versions that resolved: unknown (`flutter pub get` has not run).
- First green run must record here: Flutter version, Dart version, resolved package versions, and the Pages URL.
- `tools/ci_log.sh` writes the success summary to `docs/CI_LAST.txt`; the owner can run it after the first push.

## Owner to do (phone; do these in order)
1. In Termux, once: `termux-setup-storage` then `pkg update` and `pkg install git gh nodejs diffutils grep`.
2. Still in Termux: `gh auth login` (GitHub.com > HTTPS > paste the token), then `gh auth setup-git`, then
   `git config --global --add safe.directory '*'`, `git config --global user.name "Nexus"`,
   `git config --global user.email "nexus@users.noreply.github.com"`.
3. On github.com in the phone browser: create a repo named `nexus`, **no README**. For the free web link (Pages) choose **public**; private is allowed but Pages will not work on a free account. Keep the repo URL.
4. Make a token: profile photo > Settings > Developer settings > Fine-grained tokens > Generate. Repository access: only `nexus`.
   Permissions: Contents Read and write, Workflows Read and write, Actions Read-only. Expiry 90 days. Never paste it into a chat or a file.
5. Go to the folder that contains `AGENTS.md` (here `/sdcard/Nexus/nexus-kit`; **not** the parent `/sdcard/Nexus`, which holds the zip):
   `cd /sdcard/Nexus/nexus-kit` and run `bash tools/check.sh`. It must print `CHECK PASSED`.
6. First push: `git init -b main` (if git complains about permissions use
   `git init -b main --separate-git-dir "$HOME/nexus.git"`), then `git config core.fileMode false`,
   `git remote add origin https://github.com/<your-username>/nexus.git`, then `bash tools/sync.sh "first push"`.
7. Watch the first `ci` run: `bash tools/ci_log.sh` (or github.com > Actions > ci). If it is red, send me the exact red lines
   (or `docs/CI_LAST.txt`). Do not start Freebuff until CI is green once.
8. After the first green run: Actions > `bootstrap` > Run workflow > branch `main`, **once**. Wait for it to finish.
   Then in Termux, while no agent is writing: `git pull --rebase --autostash`.
9. Pages (public repo only): Settings > Pages > Source: **GitHub Actions**. Re-run `ci`. Open the `deploy` job, copy the
   published URL, and send it to me (or put it in this file under "CI status and versions").
10. APK: Actions > `ci` > Run workflow > branch `main`. When done: run > Artifacts > `nexus-apk`, unzip and install;
    allow installs from this source. It is debug-signed, fine for your phone only.
11. T0.4 check: in Termux run `node tools/lint_dart.mjs`, `bash tools/check.sh`, and after a manual `ci` run
    `bash tools/ci_log.sh 600`. If any command fails, send the exact output. This is the phone test of the tools.

## Decisions log
- 2026-11-01: Flutter port staged. Web app stays the product until the switch-over rule in PLAN.md passes.
- 2026-11-01: No codegen, no state package, three allowed packages. Golden files are the spec for logic.
- 2026-11-02: Integrator audit found no sure compile/analyze/Actions failure. No Dart or workflow change was made;
  only docs were written. The next real step is the owner's first push and first CI run.

## Bake-off results
(empty)

## Next
Owner steps 1-7 (first push and first CI run), then step 8 (bootstrap). The Integrator can only continue after the first
CI log or a pasted error. Then T0.2, T0.3, T0.4, then T-BAKE, then Phase 1.
