# PLAN.md - phases and tasks

Status words: `todo` | `claimed by <name> <date>` | `review` | `done` | `blocked`.
Roles: **I** = Integrator (Opencode, big context) | **B** = Burst builder (Freebuff, limited daily hours) | **W** = Workhorse (Android harness, Kilo/NIM free models).
Read for each task: only the files listed. Everything marked `golden:` lives in `fixtures/golden/`.

## Switch-over rule (when does the web app stop being the daily driver?)
Not before ALL of: Phase 2 done; the owner loads his OWN real backup file on his own phone and the counts match (resources, sectors, missions);
a backup made by Flutter loads in the web app; Phase 3 data-safety tasks done. The owner does this check himself. Agents never see his real data.

## Phase 0 - make the pipeline real (Integrator)
| id | task | role | paths | status |
|---|---|---|---|---|
| T0.1 | Owner pushes this folder to GitHub (START-HERE.md steps 1-5). `ci` makes the platform folders on the fly, so it can go green without anything else. After the first green run the owner starts workflow `bootstrap` once, which commits `app/android` and `app/web` (needed for T3.x). Integrator records the Flutter version CI used in STATE.md. | I | `docs/STATE.md` | blocked |
| T0.2 | Get `ci` green on the skeleton: analyze, test, web build, APK. Fix pubspec versions if pub fails. Skeleton was written WITHOUT a compiler: expect small errors. | I | `app/pubspec.yaml`, `app/lib/**`, `app/test/**`, `.github/**` | claimed by integrator 2026-11-02 |
| T0.3 | Pages deploy works (owner enables Settings > Pages > Source: GitHub Actions). Record the URL in STATE.md. | I | `docs/STATE.md` | blocked |
| T0.4 | Test `bash tools/commit.sh`, `bash tools/ci_log.sh`, `tools/lint_dart.mjs` in Termux; fix what breaks (for example git on shared storage: `git config core.fileMode false`). | I | `tools/**` | claimed by integrator 2026-11-02 |
| T-BAKE | Bake-off: every model ports `jump.js` (data + `jumpMatches`, 38 golden cases, no model classes needed) on its own: `app/lib/bake/jump_<model>.dart` + `app/test/bake/jump_<model>_test.dart` + `docs/log/bake-<model>.md`. Judged by CI: analyze errors, tests passed / total, fix cycles, minutes. The Integrator keeps the best file as `core/jump.dart` and deletes `bake/`. | all | `app/lib/bake/**`, `app/test/bake/**`, `docs/log/bake-*.md` | todo |

## Phase 1 - logic port (parallel; each task = one Dart file + one golden test)
Order does not matter unless `needs:` says so. Done when the golden test has no skipped case for that module and CI is green.
| id | module (legacy file -> Dart) | golden | needs | role | paths | status |
|---|---|---|---|---|---|---|
| T1.1 | util.js (dates, normUrl, domainOf, shortUrl, plural, isHttpUrl) + dupes.siteKey -> `core/util.dart` | util, dupes | - | B/W | `app/lib/core/util.dart`, `app/test/golden/util_test.dart` | review |
| T1.2 | tidy.js -> `core/tidy.dart` (3 of 4 functions done as the reference; finish `tidyFindings` after T1.5) | tidy | T1.5 | W | `app/lib/core/tidy.dart` | review |
| T1.3 | tags.js -> `core/tags.dart` | tags | T1.5 | W | `app/lib/core/tags.dart`, test | review |
| T1.4 | search.js (tokenize, stem, search) + spell.js -> `core/search.dart`, `core/spell.dart` | search, spell | T1.5 | B | those + tests | review |
| T1.5 | MODEL: Resource, Job, Thread, Rule, Settings classes, `normalizeResource`, `normFields`, `normRule`, `matches` -> `core/model/*.dart`, `core/rules.dart` | normalize, fields, rules | T1.1 | B (DeepSeek) | `app/lib/core/model/**`, `app/lib/core/rules.dart`, tests | review |
| T1.6 | week.js, time.js, history.js, recent.js, choices.js -> `core/week.dart` etc. | week, time, history, recent, choices | T1.5 | W | those + tests | review |
| T1.7 | jump.js, install.js (pure parts), mission.js, insights.js, home.js (pure parts), ideas.js, merge.js, dupes.js | jump, install, mission, insights, home, ideas, merge, dupes | T1.5 | B | those + tests | review |
| T1.8 | STORE: `NexusStore` (ChangeNotifier): load/save, exportData, importBackup (replace/merge), add/update/bulkUpdate/delete, sectors, missions, mergeResources, createSector, safety copies (`before(reason)`), `Storage` interface + file and web backends. Port from `legacy/web-src/js/store.js` + `snap.js`. | - | T1.5, T1.7 | I | `app/lib/core/store.dart`, `app/lib/core/storage*.dart`, tests | review |
| T1.9 | Round trip test: load `fixtures/sample-backup.json`, export, compare (ignoring `exportedAt`). Also loads a bare list and an old-format step list. | - | T1.8 | W | `app/test/roundtrip_test.dart` | review |
| T1.10 | Not golden yet (extend `tools/gen_golden.mjs` first, then port): suggest.js, topics.js, exporters.js, watch.js, fields.js (rest), game.js | add cases | T1.5 | B | per module | todo |
| T1.11 | round-2 golden: finish every skipped case (util, dupes, search, insights, home, fields, rules, week/time/history/recent/choices constants) and add store buckets/constants | util, dupes, search, insights, home, fields, rules, week, time, history, recent, choices, store | - | B (DeepSeek) | `app/lib/core/**`, `app/test/golden/**` | review |

## Phase 2 - screens (each: widget + one widget test; text and behaviour from the legacy `ui/*.js` file)
Look and layout: read `legacy/web-src/css/` only for the screen you build. Keep the plain wording of the web app.
| id | screen | legacy file | needs | role |
|---|---|---|---|---|
| T2.1 | App shell: bottom bar (Home, Sectors, Vault, Missions, Alerts), Profile button, light/dark theme, text size | `ui/hud.js`, `ui/app.js` | T1.8 | I |
| T2.2 | Home: tiles needs, week, mission, continue, launch, shelves, time, review, sectors + search with "Go to" and "Did you mean" | `ui/home.js`, `ui/jump.js` | T2.1 | B |
| T2.3 | Detail page (view, edit, history, learned, merge, more menu) | `ui/detail.js` | T2.1 | B |
| T2.4 | Vault (list, filter, sort, select many, bulk actions) | `ui/vault.js` | T2.1 | W |
| T2.5 | Sectors board + sector card + rules editor | `ui/sectors.js`, `ui/rules.js` | T2.1 | B |
| T2.6 | Missions | `ui/missions.js` | T2.1 | W |
| T2.7 | Alerts (due, trials, changed pages, to review, stale) | `ui/alerts.js`, `ui/fit.js` | T2.1 | W |
| T2.8 | Quick add | `ui/quickadd.js` | T2.1 | W |
| T2.9 | Weekly reset, Insights, Tidy up, Tags, Ideas, Duplicates | `ui/reset.js`, `ui/insights.js`, `ui/tidy.js`, `ui/tags.js`, `ui/ideas.js`, `ui/merge.js` | T2.1 | B/W |
| T2.10 | Profile and settings, What's new, safety copies screen | `ui/core.js`, `ui/safety.js` | T2.1 | W |

## Phase 3 - data safety and platform (the reason to leave the browser)
| id | task | role |
|---|---|---|
| T3.1 | Backup file: save + share sheet; restore from file (`file_picker`, `share_plus` - Integrator adds packages) | I |
| T3.2 | Safety copies on disk + Undo, same behaviour as web `snap.js` | I |
| T3.3 | Android: receive a shared link (share target), app shortcuts (Add, Search, Review, Due) | I |
| T3.4 | Local notifications for due checks | B |
| T3.5 | Auto-backup to a folder the owner picks | I |

## Phase 4 - importers and online lookup
T4.1 bookmarks (Netscape html, Chrome JSON, Firefox JSON), T4.2 Pocket/Raindrop/Pinboard csv/json, T4.3 OPML, T4.4 Instagram following (zip + json), T4.5 lookup.js + pageparse.js (read a page title/description). Legacy: `importers.js` (428 lines), `lookup.js`, `pageparse.js`, tests `import.test.mjs`, `lookup.test.mjs`. Extend golden first.

## Phase 5 - the galaxy (decide AFTER Phase 3)
The web app has a WebGL 3D map (`scene.js`, `gfx.js`, `shaders.js`, `layout3d.js`, `controls.js`, ~1,150 dense lines). Flutter has no stable equivalent.
Plan: T5.1 a 2D "map" with `CustomPainter` (sectors as clusters, tap a dot, search lights matches) using the same layout maths (`layout3d.js`, port it with golden cases). 3D only if the owner still wants it.

## Phase 6 - polish and release
Icons, splash, signing (owner creates the keystore and adds GitHub secrets - agents never see them), Play/TestFlight optional, iOS and desktop builds via CI (macOS runner), performance on 2,000 links, accessibility, copy review.

## Parity checklist (v3.3 features; tick when the Flutter screen does it)
Add and paste a link - Search ("Can I...") with Did you mean - Go to - Vault filters - Detail edit - Sectors board and smart sectors - Missions with progress - Alerts (due, trials, limits, changed pages) - To review: swipe, chips, auto-sort hint - Weekly reset and This week - Time I have - Continue and Shelves - Merge and Duplicates - Tidy up - Tags manager - Sector ideas - Insights - Backup and restore - Safety copies with Undo - Import files - Online lookup - Profile settings - Text size - Light/dark.
