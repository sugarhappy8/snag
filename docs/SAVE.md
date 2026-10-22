# Saves

How a life is stored since R2 (v5.0.0, save schema 3), what keeps an old save loading, and the numbers the format is held to.

## Why

A late save was one 2 MB string. Every tap copied all of it and wrote all of it, although most of it (the world economy, the finished
years of the life log) changes once a year or never. Schema 3 splits a save into a small head that changes on every tap and chunks
that change when their content does. A tap now costs the core, and a slice of state has one declared home.

## Three shapes, all readable

| Shape | Written by | Notes |
|---|---|---|
| v2, plain JSON | every build up to v4.1.1 | `schemaVersion` 2 or absent. Read by `migrateSave` through `STEPS[2]`. Never written again |
| v3 inline | backups, `spillSave`, exports, a backend with no chunk store, a quarantine copy | `JSON.stringify(g)` with `schemaVersion` 3, no `chunks` key. Valid on its own |
| v3 head and chunks | `saveGame` on a backend with a chunk store | what a player's browser holds |

An older build reading a v3 head sees `schemaVersion` 3 above its 2 and files it as `newer`, keeps it and plays nothing (never
`damaged`). So a player who goes back a version loses nothing.

## The head

`JSON.parse(head)` is the core: every player-side field in the key order of `GameState`, with a placeholder string `"~<slice key>"`
(`"~flags.worldEconomy"`) where a slice moved out, then two members spliced in last:

- `chunks`: the manifest, `{ "<name>": { "id": "<name>.<sum>", "len": <characters> } }`;
- `sv`: `{ "<slice key>": <version> }` for every declared slice, the shape each was written at.

The head keeps the key order of `JSON.stringify(g)`, so "reload gives identical JSON" is a string comparison. Only a plain, non-empty
object or array is moved out, so a placeholder can never be a real value.

## Chunks

| Name | Holds | Changes |
|---|---|---|
| `world` | the economy (`flags.worldEconomy`) and every `world.<shard>` that is a replace root | once a year |
| `log.<n>` | the completed life-log years of age decade n (n = floor(age / 10)), as an array | once, when the decade fills |
| `e.<kind>.<n>` | one shard of an entity record, split by a hash of the key | when an entry in it changes |

The current log year stays in the core (`LOG_TAIL` is 1). An id is `<name>.<textSum>`, the two 32-bit FNV variants and the length in
base 36, so a chunk is written once and a second life of the same text is the same id. The grammar is
`^(world|log\.[0-9]{1,2}|e\.[a-z0-9]{1,16}\.[0-9]{1,2})\.[0-9a-z]{6,32}$`. At most 96 chunks, at most 4,000,000 characters each.

Where they live: localStorage keys `anotherlife.save.v1.c3.<id>` beside the head under `anotherlife.save.v1`; in IndexedDB, rows of
the same `saves` store under the same prefixed key (the database version stays 1, so an older build still opens it). The `c3` is the
generation of the format: a later format's chunks are never listed, and so never swept, by this one.

The write order is the whole safety story: chunks the storage does not hold yet, then the head (the one atomic commit), then a sweep
of the chunks the new head no longer names. A failed step never loses the save that was there.

Which chunks the storage holds is asked of the storage on every chunked save, not remembered: a second tab on the same storage plays
a year, writes its own head and sweeps what that head does not name, so a page that trusted its memory would commit a head naming a
chunk that is gone. A synchronous backend lists the chunk records at the start of the write (one key walk, a few dozen keys); IndexedDB
lists them once more after the head is encoded and just before it is written, and puts back any chunk the head names that is missing.
Two tabs still overwrite each other (the later head wins, as in v4.1.1), but neither leaves a head with a missing part. What is left
is a window of one IndexedDB write between that listing and the head landing; closing it would take a lock across tabs.

## Slices

A slice is one piece of saved state with a declared home (`src/game/kernel/slices.ts`, the table in `src/game/save-slices.ts`):

```ts
defineSlice({ key: 'flags.worldEconomy', version: 2, chunk: 'world', caps: { nodes: 150_000, chars: 2_000_000 },
  normalize: (raw) => ..., migrate: (from, json, game) => ..., write: 'replace', pack: 'shapes' })
```

- `key`: a path of one or two segments. `chunk`: `core`, `world`, `log` or `entities`. `caps`: the nodes and characters a loader allows.
- `normalize`: applied when a chunk is read. Pure, idempotent, never throws; `undefined` drops the key.
- `version` and `migrate(from, json, game)`: a slice whose shape changes bumps `version` and brings an older value up in one call. The
  head's `sv` says what was written; a v2 record counts as version 1. `migrateSlices` never throws (a throwing migrate drops the key).
- `write: 'replace'`: the writer builds a new root and never edits the old one. This is the rule other tracks can break, so read it twice.
  The codec caches the text and checksum of a replace root by object identity, and `cloneForAct` hands every draft the committed
  state's replace roots, deep-frozen. An in-place write into one is a `TypeError` at the line that wrote it, in every build. If a
  writer turns up, make it build a new root (`storeEconomy` is the pattern). Never unfreeze.
- `write: 'inplace'` (the default): cloned with the core on every tap, stringified every time. Its chunk id is content addressed, so an
  unchanged text is not written again.
- `pack: 'shapes'` (`kernel/shapes.ts`): a value with repeated object shapes is stored with its key lists once, and read back exactly.

**The world.** `g.world` stays in the core as a shallow container; each own key is a `world.<name>` replace sub-slice in the `world`
chunk, whatever its name (no table row is needed: `hasSlice('world.facts')` is true). The one exception is `world.ledger`: every
booking edits it in place, so it is a `core` and `inplace` row and stays inline in the head's `world` object. A shard that changes
more than once a year does not belong in the `world` chunk: its id would change on every tap and the whole chunk would be written
again. Declare it a core row like the ledger. `test/save-budget.test.ts` measures the bytes a tap writes and names the shard.

The `world` row reads what it is given through `normalizeWorld` (only registered shards, each through its own reader, at most
40,000 nodes), with the keys left in the order they had; `world.ledger` reads through `normalizeLedger`. `save-slices.ts` imports the
world's registration hub (`world/shards.ts`) for effect, so a process that reads a save without loading the game's modules still
keeps every shard. A new shard registers itself in that hub, and a module that owns one lists `world.<name>` in `ModuleDef.slices`.

## Reading

`assembleSave(head, texts)` rebuilds the record and never throws. A chunk is checked before anything is built from it: the manifest
entry against the grammar, the text against its length and checksum, then `JSON.parse`, then the caps of the slices that live in the
chunk (nodes and characters, summed per decade or shard group, at most 100 levels deep, finite numbers), then the shape its kind has.
A chunk that fails is a `LostChunk` (`missing`, `hostile`, `size`) and is never half applied. A packed slice is unpacked within its own
limits before `normalize`. A placeholder nothing replaced is deleted, so the slice reads as absent: the economy re-seeds at the
current year with no retroactive earnings. Keys that reach the prototype chain are never written.

The boot then runs `migrateSave(game, { versions })`. A game with lost chunks plays; a copy of what was lost is kept in quarantine as
`{ al: 'partial-save', head, chunks }` and Home lists a `partial` notice ("Part of your save didn't load"). A head whose core is
unreadable is `damaged` and quarantined whole. A head from a later schema is `newer` and left untouched. The Time Machine restores
through the same two calls, and a snapshot with a lost part restores as nothing rather than as a life with a missing economy.

A release rolled back to v4.1.1 and forward again: v4.1.1 knows no chunks, so it files a v5 head it cannot read as `newer` by copying
the head text alone to quarantine, writes its own save, and leaves the chunk records in storage. The boot of v5 finds that copy first
(before any save, so before the sweep), and if every chunk it names is still stored it rewrites the copy as the whole game
(`standAloneCopies`, which swaps the text in place and reads it back). A head with a chunk already gone stays as it was: there is
nothing left to make it from. Our own copies of a head are made whole when they are made (`copyOf` in `save-hydrate.ts`).

## The Time Machine

A snapshot is the codec's head plus chunks under its own keys (`s|<life>|<rec>`, `l|<life>|<chunk id>`), compressed (`gz2`) from 1,000
characters. Two snapshots that share a part store it once. Every restore, the v4.1.1 layout included, passes through `migrateSave`
(F39), and a schema 2 snapshot comes back as schema 3.

## Budgets

Asserted in `test/save-budget.test.ts` and `test/save-perf.test.ts` on a 1950 founder with twelve companies kept alive to 80 (the
roadmap's 50-year probe). The "measured" column is what R2-S12 saw on the dev desktop; the tests are the authority.

| Budget | Limit | Measured |
|---|---|---|
| head (core), heavy and light | 400,000 characters | 217,600 and 10,400 |
| `world` chunk | 1,000,000 characters, 600,000 bytes gzipped | 520,200 characters, 137,100 bytes |
| chunks written by ten taps between two birthdays | 150,000 characters | 0 (the head is written every tap) |
| clone plus encode of the core, per tap (`test/save-tap-cost.test.ts`) | 8 ms | 0.9 ms |
| v4.1.1 heavy fixture, stored size | at most 0.8 of the old, raw and gzipped | 0.35 raw, 0.51 gzipped |
| light-life `ageUp` | 160 ms | 17 ms |
| clone, `ageUp` and encode of a light life | 200 ms | 28 ms |
| `economyFocus` on the heavy life | 15 ms | 0.2 ms |
| loading the heavy v4.1.1 fixture | 400 ms | 15 ms |
| ten Time Machine snapshots, ages 61 to 70 | at most what v4.1.1 stored (1,227,273 characters) | 1,002,500 (66.8% of the localStorage budget) |

Times are written for the desktop and multiplied by `machineFactor()` (`test/perf-kit.ts`), a fixed loop's time here over its time on
the machine that set the numbers, never below 1. The mobile line (median `ageUp` times 250/160, printed with "mobile target 250 ms")
is not asserted until a real device run exists. The audit's "Time Machine budget 45.9% used" is the figure of a lighter life: on this
life v4.1.1 used 81.8% of the 1,500,000 characters, so the budget is held to the old engine's own figure for the same life.

`scripts/save-size.ts` prints the same parts for a 100-year life: the table by slice, then one row per record (head, `world`, each
`log.<n>`, each entity shard) with raw and gzip, and their sum.

### The node cap, reviewed

`MAX_JSON_NODES` stays 500,000 (`save-schema.ts`). The heavy 50-year life holds about 85,500 nodes (budget 250,000, half the cap), the
economy is inside its own 150,000, and each chunk is inside the caps of the slices it holds (the log 120,000, the world chunk the sum
of the economy and the world rows). The per-chunk caps are the S1 table; a chunk past its cap is `size`, a lost chunk, not a crash.

## The save diet

`flags.worldEconomy` is version 2: `previous` (last year's frame) is kept for the countries a reader can name (`economyFocus`: the
residence, birth country, citizenships and every country id found in the character, assets, people and flags; at most 40), and the
history is 16 years (`HISTORY_YEARS`). A reader that asks last year's frame of a country with no tie gets the baseline, the answer
`economyOf` already gives for a missing frame. The simulation still reads the whole opening frame. The slice's `migrate` cuts a
version 1 economy the same way on load.

## One fixture per release

A fixture is a real old save, written by the engine that made it, never regenerated from a later tree. `scripts/save-fixtures.ts`
holds the recipe in its header:

```
git archive v5.0.0 | tar -x -C <scratch>/v500
ln -s <worktree>/node_modules <scratch>/v500/node_modules
cp scripts/save-fixtures.ts <scratch>/v500/scripts/
cd <scratch>/v500 && node_modules/.bin/esbuild scripts/save-fixtures.ts --bundle --platform=node --format=esm --outfile=<scratch>/fx500.mjs
node <worktree>/../bin/slot.mjs heavy -- node <scratch>/fx500.mjs heavy test/fixtures/save-v5.0.0-heavy.json.gz
```

The modes are `v402`, `heavy`, `tm` and `idb`. `test/save-v3-schema.test.ts` loads every fixture, brings it up and plays five
years, in CI every release. The next release adds one fixture and one line there.

## Adding saved state

1. Add the field to `GameState` as optional, and a row to `save-slices.ts` (or a shard in the world's hub). `test/save-slices.test.ts`
   fails on a top-level key with no home.
2. Pick the write rule. If the value is replaced as a whole (once a year, on a rare action), say `replace` and write it by building a
   new root. If it is edited in place on taps, it stays a core row.
3. Write `normalize` so a hostile value reads as absent or as a safe value, and bound every list (a cap in one place, a test that names it).
4. Change the shape later by bumping `version` and adding `migrate`. Never rename a key a fixture holds.
5. Run `test/save-budget.test.ts`: the bytes a tap writes and the size of the head name the lever if the new slice is too big or too busy.

## Contract

| Name | File |
|---|---|
| `defineSlice`, `listSlices`, `sliceOf`, `hasSlice`, `migrateSlices`, `getAt`, `setAt`, `deleteAt`, `countNodes`, `freezeRoot` | `kernel/slices.ts` |
| the slice table, `CORE_SCALARS`, `ensureSliceTable` | `save-slices.ts` |
| `encodeSave`, `assembleSave`, `inlineSave`, `isChunkedHead`, `neededChunkIds`, `textSum`, `ChunkManifest`, `LostChunk` | `save-codec.ts` |
| `packShapes`, `unpackShapes` | `kernel/shapes.ts` |
| `cloneForAct` | `save-clone.ts` |
| `SAVE_SCHEMA`, `migrateSave(raw, { minSchema?, versions? })` | `core.ts`, `save-schema.ts` |
| `SyncChunkStore`, `AsyncChunkStore`, `SaveBackend.chunks`, `chunkKey` | `save-backends.ts` |
| `saveRecord(json, chunked?)`, `readChunk` | `save-store.ts` |
| `economyFocus`, `HISTORY_YEARS` | `economy/focus.ts` |
