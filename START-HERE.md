# START-HERE.md - for the owner (you). Phone only. About 30-40 minutes the first time.

## What this is
- A folder that three coding agents (Opencode, Freebuff, your Android harness) share, to rebuild Nexus in **Flutter**.
- Nobody can run Flutter on your phone. **GitHub Actions** (free, online) compiles and tests the code. That is the only proof it works.
- Your web app v3.3 stays your daily app until the switch-over rule in `docs/PLAN.md` passes. Nothing here puts it at risk.
- Expect the **first CI run to be red.** The Dart code was written without a compiler. Fixing that is the Integrator's first job.

## What you must do yourself (agents cannot)
GitHub login, the token, enabling Pages, tapping "Run workflow", installing the APK, and the final check with YOUR real backup.

## Step 0 - put the folder where all three can reach it
- Unzip it in shared storage, for example `/sdcard/nexus-kit` (in Termux that is `~/storage/shared/nexus-kit`; run `termux-setup-storage` once).
- Point Opencode, Freebuff and the Android harness at this same folder.

## Step 1 - GitHub account and repo (phone browser, github.com)
- Make a free account if you have none. Create a repo named `nexus`. **Do not** tick "add README".
- **Private or public?**
  - Private (my advice for the first weeks): safest if an agent ever pastes something it should not. Free CI minutes are limited (about 2,000 a month). Pages (the web link) does **not** work on a private repo with a free account.
  - Public: unlimited CI, and Pages works, so Nexus gets a link anyone can open. The kit holds only app code and made-up sample data, nothing of yours. You can switch later: Settings > Danger Zone > Change visibility.
  - If you want the web link early, go public. Your choice; nothing in the kit depends on it.

## Step 2 - a token so Termux can push (github.com > profile photo > Settings > Developer settings)
- "Fine-grained tokens" > Generate. Repository access: only `nexus`. Permissions: **Contents: Read and write**, **Workflows: Read and write**, **Actions: Read-only**. Expiry: 90 days.
- Copy it once. Never paste it into a chat, a prompt or a file in the folder.
- If gh later complains about scopes, make a classic token with `repo` and `workflow` instead.

## Step 3 - Termux, once
```
pkg update
pkg install git gh nodejs
gh auth login        # GitHub.com > HTTPS > paste the token
gh auth setup-git
git config --global --add safe.directory '*'
git config --global user.name "Nexus"
git config --global user.email "nexus@users.noreply.github.com"
```
Use that no-reply email, not your Gmail: commits are public if the repo is.
Scripts on shared storage cannot be made executable, so always run them as `bash tools/<name>.sh`.

## Step 4 - first push
```
cd ~/storage/shared/nexus-kit
bash tools/check.sh                  # must say CHECK PASSED
git init -b main
git config core.fileMode false
git remote add origin https://github.com/<your-username>/nexus.git
bash tools/sync.sh "first push"
```
- If `git init` complains about permissions on shared storage, use this instead of the plain `git init`:
  `git init -b main --separate-git-dir "$HOME/nexus.git"` (the history then lives in Termux, the files stay shared).
- The Android harness app usually cannot push. After it has written files, run `bash tools/sync.sh "what changed"` yourself, or let the Integrator do it.

## Step 5 - watch the first CI run
- github.com > your repo > **Actions** > `ci`. Or in Termux: `bash tools/ci_log.sh` (waits, then writes `docs/CI_LAST.txt`).
- Jobs: `check` (about 1 min) > `test` > `web build` > `deploy`. `deploy` fails until Step 7: that is allowed and does not turn the run red.

## Step 6 - start the first agent (the important one)
- Open **Opencode** in this folder. Model: **Nemotron 3 Ultra** (the 1M one). Space Bunny alpha as the reviewer later.
- Paste **Prompt A** from `docs/PROMPTS.md` (section 4). Do nothing else yet.
- It will audit the kit, fix what it is sure about, get CI green, and then write "Owner to do" steps into `docs/STATE.md`.
- Freebuff: do not start it until CI is green once. Its hours are limited and a broken setup wastes them.

## Step 7 - after CI is green
1. Actions > `bootstrap` > Run workflow (once). It commits the Android and web folders. Then in Termux: `git pull --rebase --autostash` while no agent is writing.
2. Optional web link (public repo only): Settings > Pages > Source: **GitHub Actions**. Re-run `ci`. The link appears in the `deploy` job.
3. Android app: Actions > `ci` > Run workflow > main (or put `[apk]` in a commit message). When finished, open the run > Artifacts > `nexus-apk`, unzip, install. Android will ask to allow installs from this source.
   Or in Termux: `gh run download <run-id> -n nexus-apk -D ~/storage/downloads`.
   It is signed with a debug key: fine for your phone, not for the Play Store.

## Step 8 - the bake-off (30 minutes per model, once)
- Same small task for every model you plan to use (port `jump.js`). The prompt is in `docs/PROMPTS.md` section 3.
- Score it from CI numbers, not from what the model says. Write the table in `docs/STATE.md`. Then give the big tasks to the winner.

## The daily loop
1. Pick the model for the job (table in `docs/PROMPTS.md`). One task, one fresh session.
2. Paste the task prompt (sections 5 and 6 there). The agent claims a task in `docs/PLAN.md`, edits, runs `node tools/lint_dart.mjs`, then `bash tools/commit.sh`.
3. CI answers in a few minutes. The agent reads `docs/CI_LAST.txt` and fixes.
4. Once a day: open `docs/STATE.md`. If it does not match what you see, the Integrator updates it.

## Privacy rules (short)
- Your real backup, your notes, accounts, tokens, API keys: **never** in this folder, never in a prompt. Free models may keep what you send.
- Test data is `fixtures/sample-backup.json` (made up). The final check with your own data happens only on your phone, by you.
- If a token ever lands in a file: revoke it on GitHub first, then clean the file.

## When you are stuck
- CI red and the agent loops: ask it to write `docs/requests/blocked-<task>.md`, then switch to another task or another model.
- An agent "fixes" tests by editing `fixtures/golden/`: reject it. Those files come from the real web code (`bash tools/check.sh` catches this).
- Quota nearly gone: tell the agent to push and write its log now (last 5 minutes rule).

## Files
- `AGENTS.md` rules every agent reads first | `docs/PLAN.md` tasks | `docs/STATE.md` where we are | `docs/PROMPTS.md` what to paste
- `docs/DATA_MODEL.md` the saved data | `docs/IDEAS.md` later ideas | `docs/log/` and `docs/requests/` agent notes
- `legacy/` the web app v3.3 source and tests (read only) | `fixtures/` answer keys and sample data (read only)
- `app/` the Flutter app | `tools/` the helper scripts | `.github/workflows/` CI
