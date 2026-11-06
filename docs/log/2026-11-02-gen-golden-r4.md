# Golden fixtures R4: pure legacy modules

Date: 2026-11-02
Generator: `tools/gen_golden_r4.mjs`

R4 imports the real web modules from `legacy/web-src/js/` and freezes the clock at
`2026-10-31T12:00:00.000Z`, exactly like `gen_golden.mjs`. It installs a fake
`localStorage` for the modules that import `store.js`. No input uses a real
person, account, or production link; all names and URLs are made up.

## Generated files

| Module | Cases | File bytes |
| --- | ---: | ---: |
| suggest | 14 | 56,553 |
| topics | 22 | 417,136 |
| exporters | 43 | 62,923 |
| watch | 21 | 6,740 |
| game | 38 | 10,615 |
| pageparse | 31 | 26,684 |
| importers | 79 | 34,137 |
| sharein | 10 | 1,593 |
| snap | 12 | 1,680 |

Total: 270 cases. Every non-skipped exported function has at least three
cases. Constants also have three recorded cases, even though they take no
input, so the R4 rule "at least three cases" applies to every covered export.
File sizes are from `wc -c`; the large `topics.json` is mostly the `TOPICS` and
`TOPIC_BY_ID` constants.

## Skipped exports

Only `snap.js` has browser-only exports. These are not called by R4, because
IndexedDB, `navigator.storage`, timers, or DOM/browser lifecycle are required:

- `available` - probes `indexedDB`.
- `list`, `take`, `get`, `remove`, `restore`, `newestFor`, `mirror`,
  `mirrorInfo`, `restoreMirror`, `storageInfo` - read or write IndexedDB
  snapshots/mirrors.
- `askPersist` - uses `navigator.storage.persist`.
- `start` - installs timers and store event handlers around browser storage.

The pure snap exports are covered instead: `KEEP_HARD`, `KEEP_SOFT`, `SOFT`,
and `currentSig` (with empty, small, and large unicode store states).

No other R4 module has a skipped export. `game` stateful functions were run
with a fake `localStorage` and a directly assigned store state; this is still
deterministic and does not need a DOM or network.

## Deliberate error cases

Three answer-key cases record a thrown error as `{ "throws": "TypeError" }`
or `{ "throws": "SyntaxError" }` rather than a normal value:

- `watch.usable` with missing `h` headings (two cases).
- `importers.parseJSONArray` with broken JSON.

These are odd/missing-field inputs that intentionally exercise the legacy
guard behavior, not fixture-generation failures.

## Verification

Run twice; both runs and all nine file hashes were identical:

```sh
TZ=UTC node tools/gen_golden_r4.mjs
TZ=UTC node tools/gen_golden_r4.mjs
```

`tools/check.sh` step 4 now regenerates both `gen_golden.mjs` and
`gen_golden_r4.mjs` and fails if `fixtures/` changes.
