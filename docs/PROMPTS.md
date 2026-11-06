# PROMPTS.md - who does what, and what to paste

## 1. Roles (decided by limits, not by hype: I have not seen these models write Dart)
| harness | model | role | what it does | what it must NOT do |
|---|---|---|---|---|
| Opencode (Termux) | **Nemotron 3 Ultra 550B** (1M, verified) | **Integrator** | Phase 0, shared files, store, reviews, fixes CI errors that cross files, keeps PLAN/STATE true | Hours of typing boilerplate (wastes the best context) |
| Opencode | **Space Bunny alpha** (1M, verified) | **Reviewer / second opinion** | Reads a whole phase and lists bugs and gaps; compares two ports | Be the only writer of shared files (it is "alpha") |
| Opencode | Mimo, DeepSeek, GLM, LongCat (context capped by Opencode) | spare workers | Small sliced tasks (reading <= ~30K tokens) when Freebuff quota is out | Anything that needs many files at once |
| Freebuff (Termux) | **DeepSeek v4.1 flash** (~1 h/day) | **Burst builder: logic** | T1.5 model, T1.7, big ports with full context | Planning, exploring, reading the whole repo |
| Freebuff | **Mimo v2.6 flash** (~1 h/day) | **Burst builder: screens** | T1.4, T2.2, T2.3, T2.5 (big widgets) | Same |
| Freebuff | GLM 5.3 flash (costs ~2 h of the others) | fallback only | If both above fail the same task | Daily use |
| Android harness (Kilo Gateway free + NVIDIA NIM) | **Solar Pro 4** (free, long hours) | **Workhorse** | Small ports, widget tests, fixing analyzer errors from `docs/CI_LAST.txt`, docs | Shared files, anything over ~400 lines |
| Android harness | Solar mini / NIM models | tiny edits, bake-off entrants | Renames, comments, test data | - |
Unverified on purpose: model quality. The bake-off (section 3) decides. If the numbers disagree with this table, the numbers win.

## 2. Quota rules for Freebuff (~25 units/day by your count = about 1 h DeepSeek + 1 h Mimo, or 1 h GLM instead of both)
- Never start a Freebuff session without a task that is already sliced: PLAN row, legacy file, golden file, paths. Planning is free elsewhere.
- Do not start until CI is green once (T0.2). Before that, a bad pubspec burns the hour on errors that are not the model's.
- Order: DeepSeek hour -> T1.5 (model classes), then T1.7. Mimo hour -> T1.4, then screens. Stop at the last 5 minutes: push, log, claim nothing new.
- At the end of every hour the model must have pushed and written its log. A half-written file that is not pushed is a lost hour.

## 3. Bake-off (do it once, ~30 min per model, after T0.2 is green)
Same prompt, same task (T-BAKE: port `jump.js`), each model in its own files `bake/jump_<model>`. Score from CI, not from the model's own report:
analyzer errors in its file (lower is better) | golden tests passed of 38 | fix rounds needed | minutes.
Winner of "logic port" gets T1.5/T1.7. Best score per hour of quota wins Freebuff slots. Record the table in `docs/STATE.md`.

Bake-off prompt (paste, replace <model>):
```
You are entrant "<model>" in a bake-off on the Nexus Flutter port. Read AGENTS.md. Do not read anything else except:
legacy/web-src/js/jump.js, fixtures/golden/jump.json, app/lib/core/tidy.dart and app/test/golden/tidy_test.dart and app/test/golden/golden.dart (they show the pattern).
Task: port jump.js to Dart. Write ONLY: app/lib/bake/jump_<model>.dart and app/test/bake/jump_<model>_test.dart.
Cases that need a function you did not port must be skipped, not deleted. The golden file is the truth. Run node tools/lint_dart.mjs.
Then bash tools/commit.sh "bake <model>" with those two files and docs/log/bake-<model>.md, run bash tools/ci_log.sh, fix at most 2 rounds.
In the log write: minutes taken, rounds of fixes, what you were unsure of. Do not touch any other file.
```

## 4. First prompt: Opencode, Nemotron 3 Ultra (Integrator)
```
You are the INTEGRATOR on the Nexus Flutter port. Work only inside this folder.
1. Read AGENTS.md fully, then docs/STATE.md, docs/PLAN.md (Phase 0 only), docs/DATA_MODEL.md.
2. Do not write features yet. First audit the kit. Nobody here can run Dart, so read carefully:
   - confirm these exist: app/pubspec.yaml, app/lib/main.dart, app/lib/core/tidy.dart, app/test/golden/golden.dart, app/test/golden/tidy_test.dart,
     .github/workflows/*.yml, tools/*, fixtures/golden/*.json, fixtures/sample-backup.json
   - run: bash tools/check.sh   (lint, tool syntax, json, golden files unchanged, secrets). Tell me every line that fails and why.
   - read the Dart files and the workflow files line by line. List every line you believe will fail to compile, fail analyze, or fail in GitHub Actions.
     Fix the ones you are sure about. For the ones you are not sure about, write them in docs/STATE.md under "Suspect".
3. Then do T0.1 to T0.4 in PLAN.md. Anything only the owner can do (GitHub login, enabling Pages, running the bootstrap workflow) goes into
   docs/STATE.md under "Owner to do", as exact numbered steps for a phone, and then you stop and tell me.
4. Work one task at a time. Claim it in PLAN.md, edit, run node tools/lint_dart.mjs, push with bash tools/commit.sh, read the result with bash tools/ci_log.sh, fix.
5. When done or stopped: write docs/log/<date>-integrator.md, update docs/STATE.md (Flutter version CI used, package versions that resolved, what is next).
Reply with at most 12 lines: what is done, what is verified by CI, what is not, what I must do.
Rules that matter most: CI green is the only proof. Never invent API names; if unsure, use something simpler. Never touch legacy/ or fixtures/golden/.
```

## 5. Task prompt: Freebuff (Burst builder). Fill the <>.
```
You are a BUILDER on the Nexus Flutter port. I have limited time on you, so work fast and push before the end. Task: <T1.5>.
Read ONLY: AGENTS.md; the <T1.5> row in docs/PLAN.md; docs/DATA_MODEL.md; <legacy files>; <golden files>; app/lib/core/tidy.dart + app/test/golden/ (the pattern).
1. Claim the task: edit its row in docs/PLAN.md, then bash tools/commit.sh "claim <T1.5>" docs/PLAN.md.
2. Write the Dart files for your paths only. Port function by function, same names and behaviour as the JS. The golden file is the truth.
3. Run node tools/lint_dart.mjs after each file. Fix what it reports.
4. Push with bash tools/commit.sh "<T1.5> ..." <your paths>. Run bash tools/ci_log.sh. Fix at most 2 rounds.
5. Set the row to review. Write docs/log/<date>-<you>.md: files, tests expected to pass, anything unverified, next task suggestion.
Do not touch other files. If blocked, write docs/requests/blocked-<T1.5>.md and stop.
```

## 6. Task prompt: Android harness (Workhorse). Small and exact.
```
You are the WORKHORSE on the Nexus Flutter port. Small, exact tasks only. Read AGENTS.md and docs/STATE.md first.
Task: <fix the analyzer errors listed in docs/CI_LAST.txt for file(s) <paths> | write test <x> | port module <T1.6 part> | update docs>.
Read ONLY the files named in the task. Edit ONLY the paths named in the task. After editing: node tools/lint_dart.mjs (if you can run shell) and tell me the exact command output.
If you cannot run shell: say so, list the files you changed, and I will run the tools. Do not claim CI passed.
Finish with: files changed, what you were unsure of.
```

## 7. Habits that save quota
- One task per session. Fresh session per task (they have no memory anyway; the files do).
- If a model produces a plan instead of code: reply "No plan. Edit the files now, then run the lint tool."
- If a model "fixes" a golden file or a test to make it pass: reject it. Golden files are read-only.
- Paste CI errors verbatim (`docs/CI_LAST.txt`), not a summary.
