# DATA_MODEL.md - the saved data (same shape as the web app's backup file)

Authority order: `fixtures/golden/normalize.json` (exact behaviour) > `fixtures/sample-backup.json` (exact shape) > this page.
Source of truth in the web code: `legacy/web-src/js/store.js` (`normalizeResource`, `normalizeJob`, `normalizeThread`, `DEFAULT_SETTINGS`).
The Flutter app must LOAD any backup the web app made, and WRITE backups the web app can load (schema 1).

## Backup file (envelope)
```
{ "app": "nexus", "schema": 1, "exportedAt": "2026-10-31T12:00:00.000Z",
  "resources": [Resource], "jobs": [Job], "threads": [Thread], "settings": {Settings}, "game": {Game} }
```
Loading also accepts a bare list of resources, or an object with only `resources`. Everything is cleaned on load (`normalizeResource` etc.), so bad or missing fields never crash.
Unknown fields in a file are dropped on load, except `settings` keys you do not know: keep them (future versions).

## Resource (one saved link)
| field | type | default / rule |
|---|---|---|
| id | string | generated `r` + time + random when missing |
| title | string | trimmed; if empty: the url without `https://www.` and trailing `/`; if still empty `Untitled` |
| url | string | trimmed |
| type | string | one of `web-tool, article-site, youtube-channel, ai-source, social, community, feed, catalogue, docs, other`; else `other` |
| tags | [string] | comma or newline text allowed on load; lower case, leading `#` removed, no repeats |
| capabilities, useWhen | [string] | text allowed on load: split on newline or `;`; trimmed; empty dropped |
| inputs, outputs, notes, folder, rssUrl | string | trimmed (notes is not trimmed) |
| status | string | `candidate, testing, active, archived`; else `active` |
| checkCadence | string | `daily, weekly, monthly, none`; else `none`. Days: 1, 7, 30, 0 |
| lastChecked, nextCheck, trialEnd, added | date text | `YYYY-MM-DD` or empty. If cadence is `none`, nextCheck is empty. If cadence set and nextCheck empty: lastChecked + days, or today when never checked |
| createdAt, statusSince | date text | createdAt = given or today; statusSince = given or createdAt |
| related | [string] | resource ids, no repeats |
| draft, hidden, locked, pinned, keep | bool | "draft" = still to review |
| src, research | string | `user` by default (`following` = an Instagram follow) |
| scan | object or null | `{at, via, topic, topic2, conf: clear/maybe/none, basis, desc(<=300), site(<=80)}`; needs a valid `at` else null |
| fields | {string: string} | small extra details (limit, resets, plan, ...); see `fields.json` |
| verdict | object or null | `{at, result: keep/drop, note(<=300)}` |
| watch | object or null | page-change record `{on, at, fp, changed, what}`; see `legacy/web-src/js/watch.js` (port later) |
| learned | string | max 800 chars |
| log | [LogEvent] | `{at: date, k: reviewed/status/checked/verdict/merged/learned, t: text<=120}`, newest last, max 25 |
| opens | int | 0..1,000,000 |
| openedAt | int | ms since 1970, 0 = never |
| rssUrl | string | for `youtube-channel`, derived from a `/channel/UC...` url when empty |

## Job (a "sector")
`{id, name, color(#rrggbb, else a palette colour), planetColor(#rrggbb or ""), icon("star"), members:[resource id], slot:int, sealed:bool, note, rule: Rule|null}`.
A job with a `rule` is a smart sector: its `members` are recomputed from the rule (see `rules.json`), never edited by hand.
Palette (iOS system colours): `#007AFF #34C759 #FF9500 #AF52DE #FF2D55 #FFCC00 #32ADE6 #FF3B30 #00C7BE #5856D6 #A2845E #8E8E93`.

## Thread (a "mission")
`{id, name, note, lastDone: date text, steps: [{rid, note, done, doneAt}]}`. Old files may have steps as plain id strings: accept them. Steps without `rid` are dropped.

## Rule
`{match: "all"|"any", conds: [{f: field key, op, v}]}` (max 8 conditions). `normRule` in `rules.json`.

## Settings (all keys, with defaults)
`theme:"auto" sound:false quality:"auto" intro:true notify:false tethers:true space:true calm:false haptics:true web:true webMode:"auto" webReader:"" webSkip:["filen.io"] customFields:[] deletedKeys:[] startOn:"home" home:null activeMission:"" textSize:"m" seenVersion:"" opensSince:"" weekly:null dupeIgnore:[] recentJobs:[] recent:[] shelves:[] siteIcons:false badge:true`
Notes: `home` = `{order:[tile ids], hide:[tile ids]}` (see `home.json` normHome/TILES). `weekly` = `{doneAt, pickedAt, snooze, picks:[{rid, done}]}` (see `week.json`). `recent` = visits `{k: r|s|m, id, at(ms)}`.
`deletedKeys` = normalised urls the owner deleted (so re-imports skip them). Not every key matters in Flutter on day one: keep them all when saving.

## Game
`{xp, days, counters, focus, badges, ...}` - progress layer (`legacy/web-src/js/game.js`). Keep it as a free-form map until the screens that use it are built; never delete it on save.

## Where things are computed (so you know what is stored and what is not)
- Stored: everything above. Smart sector `members` are stored but recomputed on every change.
- Not stored: search indexes, suggestions, "needs you" lists, home tiles - all computed from the data.
