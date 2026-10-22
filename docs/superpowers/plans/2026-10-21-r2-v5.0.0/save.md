# R2 plan: the Save track (save v3 with versioned slices and chunks, the save diet, the per-tap cost) (track `save`)

Base: `release/v5.0.0` after wave 0 (named RNG streams, `test/seed-kit.ts`, `src/game/kernel/streams.ts`). Code read at v4.1.1 (`a65349a`, the base before wave 0); nothing was edited. Every path marked "modify" exists today; "create" paths do not. Line numbers are v4.1.1 and can shift by a few lines after wave 0 (re-grep before editing a test file wave 0 touched). All text below uses plain hyphens (no U+2014, no U+2013).

## 1. Track summary

**Items covered (12 tasks, R2-S1 to R2-S12).** K.5 save v3 (S1 to S9, S11), A.K9 the save diet (S10, with its probes in S12), F39 snapshot restores through `migrateSave` (S9). K.5 is the roadmap's "Opus candidate"; this plan uses Sonnet only and cuts it into ten sequential tasks of at most about 1,000 source lines (S1 to S9 and S11), the two riskiest (the store and the boot) each in their own task. A.K9 is S10 and S12 proves the acceptance.

**Line budget.** About 5,600 source lines (S1 500, S2 420, S3 560, S4 520, S5 330, S6 450, S7 480, S8 350, S9 720, S10 380, S11 450, S12 470) and about 7,000 test lines, plus about 400 KB of binary fixtures. The roadmap says 7,000 source lines (K.5 6,000, A.K9 1,000). The difference is a reserve, not scope that was dropped: design 13.5 says "R2 takes the skeleton and the first chunks, and the full columnar world chunk follows when the registry shards exist", so the entity chunks ship as a tested mechanism and adopt the A.K2 shards in S12 only if their shape qualifies. Source lines include comments (the repo's files are about 30% comment).

**Design in one paragraph (read this first).** A save is a **head record** plus **chunk records**. The head is valid JSON with `schemaVersion: 3`: the `core` chunk (everything player-side, in the same key order as `GameState`) with a placeholder string `"~<slice key>"` where a bigger slice was moved out, plus a `chunks` manifest and an `sv` map of slice versions. The head is stored under the unchanged `SAVE_KEY` (`save-backends.ts:5`), so an older build reading it sees `schemaVersion` 3 above its 2 and files it as `newer` (`save-schema.ts:48`), never as `damaged`. Chunks are content-addressed (`world.<sum>`, `log.<n>.<sum>`, `e.<kind>.<n>.<sum>`), stored beside the head (localStorage keys, or keys in the same IndexedDB `saves` store, so the database version stays 1), written before the head (the head write is the one atomic commit point) and swept after it. A slice declares `{ key, version, chunk, caps, normalize, migrate, write }` (`kernel/slices.ts`). A `write: 'replace'` slice (the world economy, completed log years, the `world` shards) is never mutated in place, so its text and checksum are cached by object identity: a tap re-stringifies only the core, and `act()` clones only the core and shares the replace roots by reference (frozen, so a stray in-place write throws in tests instead of corrupting a save). Everything that does not go to storage as chunks (backups, `spillSave`, exports, a backend with no chunk store, a quarantine copy) uses the **inline** form: plain `JSON.stringify(g)`, which is a valid v3 record with no `chunks` key. Old v2 records (plain JSON) and v3 records (head+chunks or inline) are both read for one release; v3 is written.

**D.11 and roadmap acceptance this track owns, and the task that proves it.**

| Acceptance | Proven by |
|---|---|
| 50-year probe: core at most 400 KB, world at most 1 MB raw and 600 KB gzipped | R2-S12 `test/save-budget.test.ts` (needs S10 and S11) |
| per-tap clone plus stringify at most 8 ms for the core | R2-S8 `test/save-tap-cost.test.ts`, again on the heavy probe in S12 |
| light-life `ageUp` at most 160 ms desktop (250 ms mobile target, measured on desktop with a factor) | R2-S12 `test/save-perf.test.ts` |
| saves 20 to 30% smaller | R2-S10 (the diet on the v4.1.1 heavy fixture) and R2-S12 (the whole pipeline on the same fixture) |
| the v4.0.2 fixture and `save-v1.json.gz` load and run 5 years | R2-S2 `test/save-v3-schema.test.ts` (runs in CI every release) |
| a Time Machine fixture and an IndexedDB fixture | R2-S9 (Time Machine), R2-S7 (IndexedDB boot) |
| reload and Time Machine fork give identical JSON | R2-S4 (reload), R2-S9 (fork), R2-S12 (50 years) |
| hostile chunks and a missing chunk load safely (quarantine, never a crash) | R2-S4 (pure), R2-S7 (boot and quarantine) |
| F39: restores of Time Machine snapshots pass through `migrateSave` (schema-2 snapshot test) | R2-S9 |
| A.K9: `previous` pruned, history 16 years, `pack()` chunks any world shard, node-cap review, perf probe | R2-S10, R2-S9, R2-S12 |

**Rules for every task** (restated because the run prompt is not in the repo; there is no `CLAUDE.md`, `git ls-files` has none). Test first, red, then the change. One commit per task with explicit pathspecs (never `git add -A` or `git add .`), message ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Typecheck with `/Users/saeed/projects/anotherlife/wt/bin/tc` from the worktree root. Run tests only as `/Users/saeed/projects/anotherlife/wt/bin/vt <files>` (it waits for one of three machine-wide slots; never run the full suite, never loop-poll). Any ad hoc node script (the fixture generator) runs as `node /Users/saeed/projects/anotherlife/wt/bin/slot.mjs heavy -- node <script>`. No `npm install`. No em-dash or en-dash character in any file (`src` is capped at exactly 24 em-dashes by `test/voice-guards.test.ts:35`; docs have none). Text the player can read (the partial-load notice in S7) follows `docs/VOICE.md` (contractions, plain narrator). New code draws nothing from `g.rng`; this track draws no random numbers at all. A pinned number changes only when the new rule legitimately changes it, with the reason in the commit message (this plan lists every such number, in the task that moves it). New modules must not join an import cycle (`test/architecture.test.ts`, baseline `test/architecture-baseline.json`): `kernel/slices.ts` and `kernel/shapes.ts` are leaves that import only types.

**Hot files and who touches them** (every edit additive, in its own hunk):

| File | Touched by | Note |
|---|---|---|
| `src/game/core.ts` | S2 (line 28 `SAVE_SCHEMA = 2` to 3 and its comment, lines 24 to 27) | Ledger-world edits the money primitives at lines 62 and up: different hunk |
| `src/game/save-schema.ts` | S2 (`STEPS` 30-36, `migrateSave` 44-58, two imports) | nothing else touches it |
| `src/game/save-backends.ts` (255) | S5 only | optional `chunks` member on both backend interfaces, three implementations, one key helper |
| `src/game/save-store.ts` (561) | S6 (`saveRecord` and the queue), S7 (`readSaveCopy` 523-530 only) | `saveRecord` gains an optional second argument; every existing call and test keeps working |
| `src/game/save-hydrate.ts` (375) | S7 only | `diagnoseRecord` 26-33, `boot` 255-354, `importLegacy` 192-215, `removeLegacyIf` 110 |
| `src/game/save-quarantine.ts` (185) | S7 (an optional `partial` field on `SaveNotice` 25-37, carried by `notice` 39-41 and `scanQuarantine` 149-171) | |
| `src/game/snapshot-codec.ts` (81) | S7 (one optional `maxChars` parameter on `decodeSnapshotRecord`, line 62) | the 20 MB cap stays the default |
| `src/game/save.ts` (834) | S6 (`saveGame` 48-56, `loadGame` 59-73, one import), S9 (`pack` 578-613, `loadSnapshot` 755-796, `hashText` 556-566, `writeSnapshot` 646-693) | S6 then S9, never together |
| `src/game/timeMachine.ts` | read only (`stopOf` 38, `arriveInPast` 226) | |
| `src/game/economy/model.ts` | S10 (`economyState` 149-175: lines 162 and 164) | |
| `src/game/economy/index.ts` | S10 (`yearlyEconomy` 24-52: lines 34 and 43; `economyMarketFactor` 68-77 only if a test needs it) | Kernel converts `aging.ts` hooks, not this body |
| `src/game/world-flags.ts` | S3, S8 (one `WHOLE_FLAGS_SITES` entry each, table at 163-174) | R1-P6's ratchet counts spreads of `flags` in new files |
| `src/ui/store.ts` | S8 only (`act` 425-440, line 428) | |
| `test/fuzz-kit.ts` | S8 (one line, 807: `structuredClone(g)` to `cloneForAct(g)`) | Ledger-world also edits this file; keep it to that line |
| `test/save-kit.ts` (295) | S5 (chunk-aware doubles, additive) | |
| `test/time-machine.test.ts`, `test/probe-life.test.ts`, `test/living-economy.test.ts`, `test/world2-trade-invariants.test.ts`, `test/world2-performance.test.ts`, ten `SAVE_SCHEMA` pins, `test/save-store.test.ts:1220` | S2, S9, S10 | each pinned number is named in its task |
| `scripts/save-size.ts` (108) | S12 | chunk table |

**Order and schedule** (three test-running agents at most; every task is test first). Sequential spine: S1, S2, S3, S4, S5 (S5 only needs the old code, so it can run beside S1 to S4), S6, S7, S8 (needs S3 only), S9 (needs S4), S10 (needs S2, runs beside S5 to S9; it touches only `economy/` and one hunk in `save-slices.ts`), S11 (needs S4), S12 last. Expected wall time with two agents: about 11 hours. Merge order of tracks into `release/v5.0.0`: wave 0, Ledger-world, Kernel, Save, Platform. This track merges after Ledger-world and Kernel and starts from the wave 0 base: until then `g.world` and the registry do not exist, so S1 declares the `world` slice generically (a path read, no type import) and S12 does the rebase check and the one adapter hunk.

**Lead actions** (none can be done by an implementer):

1. Broadcast to every track, at S2 merge: no new test may assert `SAVE_SCHEMA` equals a literal (ten do today and S2 moves them); use the exported constant.
2. Settle the three cross-check questions in section 5 (ModuleDef `slices`, write discipline of `g.world` shards, which shards change per tap) before S12 starts.
3. The bundle budget (`scripts/bundle-baseline.json`: 60,000 bytes gzip of growth allowed): this track adds roughly 30 to 40 KB of the shared allowance (an estimate from the line count; S12 measures it with `vb` and prints the figure). If R2 as a whole will exceed it, the lead moves the baseline or lazy-loads the Time Machine code; this plan does not.
4. Platform's golden digests (K.7b) are generated after this track merges (merge order), so the `economy` digest already has the diet in it. If Platform merges first, regenerate the `economy` slice digest.
5. At the release commit: nothing for this track. There is no flag (a save format change is not presentation, and the cutover is the S2 constant plus the S6 writer). If the lead wants a kill switch it is one `FLAG_DEFS` key read in `saveGame` (section 5, point 1).

## 2. Cross-track contracts

**Provided by this track:**

| Provided | By | Used by |
|---|---|---|
| `src/game/kernel/slices.ts`: `defineSlice`, `SliceDef`, `listSlices`, `sliceOf`, `hasSlice`, `migrateSlices`, `getAt`, `setAt`, `deleteAt`, `countNodes`, `freezeRoot`, `LOG_TAIL`, `LOG_GROUP_YEARS` | S1 | Kernel's registry guard (`ModuleDef.slices` entries must be defined slices), Ledger-world (declares `world` sub-slices), every later track that adds saved state |
| `src/game/save-slices.ts`: the R2 slice table and `ensureSliceTable()` | S1 | the codec, `save-schema.ts`, `act()` |
| `SAVE_SCHEMA = 3`, `STEPS[2]`, `migrateSave(raw, { minSchema?, versions? })` | S2 | every loader, every fixture |
| `src/game/save-codec.ts`: `encodeSave`, `assembleSave`, `inlineSave`, `isChunkedHead`, `neededChunkIds`, `textSum`, `ChunkManifest`, `LostChunk` | S3, S4 | store, hydrate, Time Machine, `scripts/save-size.ts` |
| `SyncChunkStore`, `AsyncChunkStore`, `SaveBackend.chunks?`, `chunkKey(id)` | S5 | store, hydrate |
| `saveRecord(json, chunked?)`, `readChunk(id)`; `saveGame`/`loadGame` write and read chunks | S6 | `ui/store.ts` (unchanged call sites), tests |
| `partial?: true` on `SaveNotice`, `decodeSnapshotRecord(value, maxChars?)` | S7 | Home notices |
| `src/game/save-clone.ts`: `cloneForAct(g)` | S8 | `ui/store.ts act()`, `test/fuzz-kit.ts` |
| `src/game/economy/focus.ts`: `economyFocus(g)`, `HISTORY_YEARS = 16`, `pruneToFocus` | S10 | economy readers; Platform's `economy` golden digest moves |
| `src/game/kernel/shapes.ts`: `packShapes(json)`, `unpackShapes(packed, limits)` | S11 | the codec (`pack: 'shapes'` slices) |
| Fixtures: `test/fixtures/save-v4.0.2.json.gz`, `save-v4.1.1-heavy.json.gz`, `tm-v4.1.1.json.gz`, `idb-v4.1.1.json.gz`; generator `scripts/save-fixtures.ts` | S2 | S7, S9, S10, S12, CI (5-year run every release), R3 onward add one each |
| `test/save-kit.ts`: `chunkedBackend()`, `memoryChunkStore()` | S5 | S6, S7, S12 |

**The write-discipline contract (the one other tracks can break).** A slice declared `write: 'replace'` must never be mutated in place: writers build a new root (`storeEconomy` in `economy/model.ts:177` already does; the log never edits a completed year, `core.ts:433`). From S8 `act()` hands the draft the same root objects as the committed state, deep-frozen, so an in-place write throws a `TypeError` (in every build, because the identity cache is only sound if the root is frozen). Ledger-world's `worldShard(g, name)` is expected to be the single writer door for `g.world.<name>` and to copy a frozen shard before it returns it for writing; S12 tests this and, if it does not, adds the copy as one additive hunk in `src/game/world/` with the reason in the commit.

**Consumed (by exact name; each has a fallback so the track can start before the others merge):**

- `GameState.world?: WorldState`, `ensureWorld(g)`, `readWorld(g)`, `worldShard(g, name)` from `src/game/world/` (Ledger-world, A.K2). Fallback: the `world` slice reads `g.world` with `getAt(g, 'world')` (no type), declares each own key of it as a `world.<key>` replace sub-slice, and an absent `g.world` encodes to nothing. No file in `src/game/world/` is imported until S12.
- `registerModule(def)` and the sorted list in `src/game/modules/index.ts` (Kernel, K.3). Fallback: none needed at runtime; the guard test in S12 reads the list and, for any module whose def has a `slices` array, asserts each entry passes `hasSlice`. If neither file exists when S12 runs, that one test is skipped with the reason printed.
- `test/seed-kit.ts` `findSeed(pred, opts?)` (wave 0, exists at my start). Used wherever a test needs a life with a property; the old pinned `seed: N` in any test file this track edits moves to it.
- `classifyFlag` from `src/game/world-flags.ts` (R1-P6): the slice test asserts `worldEconomy` is class `world`, so heirs keep it.

---

## 3. Tasks

### R2-S1 K.5 (a): the slice registry and the R2 slice table (no behaviour change)

**Goal.** Give every saved piece of state a declared home before anything reads the table. `kernel/slices.ts` is the lead's fixed `defineSlice({ key, version, normalize, caps, chunk })` plus the few optional fields the later tasks need; `save-slices.ts` is the table. Nothing in the game reads it yet, so this task changes no behaviour and proves the table is complete.

**Items covered.** K.5 (slices declare `{key, version, normalize, caps, chunk}`; per-slice `migrate(from, json)`), design 13.5.

**Files.**
- Create: `src/game/kernel/slices.ts` (about 240 lines), `src/game/save-slices.ts` (about 260), `test/save-slices.test.ts` (first line `// ci: fast`).
- Reads (verified): `src/game/types.ts:674-710` (`GameState`, 17 keys), `src/game/world-flags.ts` (`classifyFlag`), `src/game/save-schema.ts:30-36`.

**Interfaces.**

```ts
// src/game/kernel/slices.ts  (L0 leaf: only `import type`)
export type SliceChunk = 'core' | 'world' | 'log' | 'entities'
/** 'whole': one value at `key`. 'logYears': the life log, split into the core tail and decade chunks. 'subkeys': an object whose own keys are sub-slices `${key}.${name}` (g.world). */
export type SliceShape = 'whole' | 'logYears' | 'subkeys'
export interface SliceCaps { readonly nodes: number; readonly chars: number }
export interface EntityShards { readonly kind: string; readonly shards: number }   // kind /^[a-z0-9]{1,16}$/, shards 1..16
export interface SliceDef {
  /** Dotted path into GameState, one or two segments: 'character', 'flags.worldEconomy', 'world'. A longer key carves itself out of its parent's text. */
  readonly key: string
  /** The saved shape of this slice. Starts at 1 (the v4.1.1 shape). Bumps with a `migrate` step. */
  readonly version: number
  readonly chunk: SliceChunk
  readonly caps: SliceCaps
  /** Applied when a chunk is read. Pure, idempotent, never throws; undefined drops the key. */
  readonly normalize: (raw: unknown) => unknown
  /** Brings a value stored at `from` (< version) to `version` in one call. `game` is the whole record being loaded (read only). */
  readonly migrate?: (from: number, json: unknown, game: Readonly<Record<string, unknown>>) => unknown
  /** 'replace' (writers build a new root; identity-cached, shared by act()) or 'inplace' (default). */
  readonly write?: 'replace' | 'inplace'
  readonly shape?: SliceShape                         // default 'whole'
  readonly entities?: EntityShards                    // only with chunk 'entities'
  /** What a lost chunk does: 'fresh' (default, the key is dropped and the game goes on) or 'fatal' (core only). */
  readonly onLost?: 'fresh' | 'fatal'
}
export const LOG_TAIL = 1            // log years that stay in the core: the current one
export const LOG_GROUP_YEARS = 10    // completed log years per `log.<n>` chunk, grouped by floor(age / 10)
export function defineSlice(def: SliceDef): SliceDef            // throws on a duplicate or malformed key, version < 1, caps <= 0, entities without chunk 'entities', shape 'logYears' off key 'log', onLost 'fatal' off 'core'
export function listSlices(): readonly SliceDef[]               // sorted by key
export function sliceOf(key: string): SliceDef | undefined
export function hasSlice(key: string): boolean                // also true for `<parent>.<name>` when `<parent>` is a declared `subkeys` slice and `name` matches /^[a-z][a-z0-9]{0,15}$/ (a dynamic sub-slice such as `world.facts`: the Kernel track's `ModuleDef.slices` guard needs it; cross-check addition)
export function getAt(root: unknown, path: string): unknown     // own properties only; undefined when any step is missing
export function setAt(root: Record<string, unknown>, path: string, value: unknown): void   // an existing key keeps its position; refuses '__proto__', 'constructor', 'prototype'
export function deleteAt(root: Record<string, unknown>, path: string): void
export function countNodes(value: unknown, limit: number): number   // iterative; returns limit + 1 as soon as the count passes limit
export function freezeRoot(root: object): void                  // deep-freezes once per object (WeakSet); cheap on a second call
export function migrateSlices(game: Record<string, unknown>, versions: Readonly<Record<string, number>> | null, missing: number | 'current'): void
```

`migrateSlices` calls `def.migrate(from, getAt(game, key), game)` for every slice whose stored version (`versions?.[key]`, else `missing`, where `'current'` means no migration) is below `def.version`, and writes the result with `setAt` (undefined deletes). It never throws: a throwing `migrate` drops the key and the loop goes on.

```ts
// src/game/save-slices.ts
export const CORE_SCALARS = ['version', 'schemaVersion', 'lifeId', 'rng', 'nextId', 'year', 'generation', 'ribbon', 'obituary'] as const
export function ensureSliceTable(): void     // idempotent; the table is declared at module load, this is the import hook for callers
```

The table (each row one `defineSlice`; versions all 1 here):

| key | chunk | write | shape | caps (nodes, chars) | note |
|---|---|---|---|---|---|
| `character`, `people`, `assets`, `queue`, `ancestors`, `counters`, `yearActions` | core | inplace | whole | 60,000 / 600,000 each (assets 120,000 / 1,200,000) | `normalize` is identity: `isLoadableGame` (`save-schema.ts:522`) validates them |
| `flags` | core | inplace | whole | 150,000 / 1,500,000 | the rest of the flags; a child slice carves itself out |
| `flags.worldEconomy` | world | replace | whole | 150,000 / 2,000,000 | `normalize`: a plain object or undefined |
| `log` | log | replace | logYears | 120,000 / 1,200,000 | completed years only; the tail stays in the core |
| `world` | world | replace | subkeys | 60,000 / 700,000 | absent today (A.K2); `normalize`: a plain object or undefined. The `g.world` container itself stays in the core as a shallow object; each own key is a sub-slice |
| `world.ledger` | core | inplace | whole | 12,000 / 150,000 | cross-check addition. Ledger-world's `book()` edits the ledger shard in place on every booking, so it cannot be a frozen shared `replace` root and must not sit in the `world` chunk (the chunk id would change on every tap and the whole chunk would be rewritten). It stays inline in the core's `world` object: cloned by `cloneForAct` on every tap, written with the head, never frozen. `normalize` here is a plain-object check; R2-S12 swaps in Ledger-world's `normalizeLedger` through an arrow |

**Steps (test first).**
1. Write `test/save-slices.test.ts` (red: the module is missing). Cases: (a) `listSlices()` is sorted, keys unique and well formed, versions at least 1, caps positive, `flags.worldEconomy` is `world` and `replace`, `log` is shape `logYears`; (b) every top-level key of `makeTestGame()` and of a 15-year `probeLife({ seed: SLICE_LIFE_SEED, birthYear: 1990, businesses: 2, years: 15 })` (`const SLICE_LIFE_SEED = 3` in the file: wave 0's pin ratchet forbids a new `seed: <digits>` literal in `test/`) is in `CORE_SCALARS`, a declared slice key, or the first segment of one (this is the "table is complete" guard: a field added to `GameState` without a home fails here); (c) `classifyFlag('worldEconomy')` is `'world'` (heirs keep a chunked-out flag); (d) `defineSlice` rejects the six malformed cases; (e) `getAt`/`setAt`/`deleteAt` on nested paths, `setAt` keeps the key position (`Object.keys` order unchanged), refuses `__proto__`; (f) `countNodes` counts objects, arrays and leaves and stops at the limit without walking the rest; (g) `freezeRoot` freezes deeply, a second call does not walk again (spy on `Object.freeze`), frozen input is accepted; (h) `migrateSlices` calls `migrate` only for stored versions below current, treats `'current'` as no migration, survives a throwing `migrate`, and is idempotent; (i) `hasSlice('world.facts')` and `hasSlice('world.ledger')` are true, `hasSlice('world.Bad')`, `hasSlice('character.x')` and `hasSlice('world.a.b')` are false; `sliceOf('world.ledger')` is the explicit core row, `sliceOf('world.facts')` is a derived `replace` sub-slice of `world`.
2. Create `kernel/slices.ts` to the interface; keep it a leaf (`import type` only).
3. Create `save-slices.ts` with the table. No flag, no import into the game.
4. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-slices.test.ts test/architecture.test.ts test/world-flags.test.ts test/voice-guards.test.ts`.
5. Commit: `git add src/game/kernel/slices.ts src/game/save-slices.ts test/save-slices.test.ts`, message "R2-S1 K.5: the slice registry and the R2 slice table".

**Acceptance proved.** The slice table covers every field of `GameState`; the registry rejects malformed declarations; no existing test moves.

**Size.** Source about 500, tests about 450.

**Risks.** The architecture ratchet fails if `slices.ts` imports a value from outside `kernel/`. A `defineSlice` call that runs at module load needs the importer to import `save-slices.ts` (S2 and S3 do); a slice declared in a file nobody imports is silently absent, which is why `ensureSliceTable()` exists and `save-schema.ts`, the codec and `save-clone.ts` each call it.

---

### R2-S2 K.5 (b): SAVE_SCHEMA 3, the dual-read chain and the fixtures

**Goal.** Make the schema 3 and keep every older save loading: `STEPS[2]` brings a v2 record up, `migrateSave` accepts the slice versions of a v3 head, and the four fixtures that every later task and every later release load are created from the real old engines. No chunk is written yet: until S6 the game writes the **inline** v3 form (plain `JSON.stringify(g)` with `schemaVersion: 3`).

**Items covered.** K.5 (SAVE_SCHEMA becomes 3; per-slice migrate; dual-read; one new fixture per release), acceptance "the v4.0.2 fixture and save-v1.json.gz load and run 5 years".

**Files.**
- Modify: `src/game/core.ts` (line 28 `export const SAVE_SCHEMA = 2` to `3`; the comment at 24-27 gets "3 from v5.0.0: versioned slices and chunks"), `src/game/save-schema.ts` (`STEPS` at 30-36, `migrateSave` at 44-58, add `import { migrateSlices } from './kernel/slices'` and `import './save-slices'`).
- Create: `scripts/save-fixtures.ts`, `test/save-v3-schema.test.ts`, `test/fixtures/save-v4.0.2.json.gz` (about 40 KB), `test/fixtures/save-v4.1.1-heavy.json.gz` (about 250 KB), `test/fixtures/tm-v4.1.1.json.gz` (about 60 KB), `test/fixtures/idb-v4.1.1.json.gz` (about 40 KB).
- Modify (the pinned numbers that legitimately move; each is `expect(SAVE_SCHEMA).toBe(2)` or an equal pair, a release statement that stopped being true): `test/devices-save.test.ts:116`, `test/ai-bench-save.test.ts:51-53` (the test name and the pair `[TECH_VERSION, SAVE_SCHEMA]`), `test/sector-state.test.ts:138`, `test/model-state.test.ts:260-261`, `test/music-state.test.ts:408-421` (name and line 421), `test/silicon-state.test.ts:45`, `test/wave-stocks-story.test.ts:62`, `test/notice-acceptance.test.ts:760`, `test/tech-waves-wiring.test.ts:125-126`, `test/inbox-state.test.ts:596-601` (`SAVE_SCHEMA` 3 and `schemaVersion` 3, test renamed "still loads the v4.0.2 fixture at schema 3"), and `test/save-store.test.ts:1220-1225` (the "schemaVersion 3 is a later version" case becomes `SAVE_SCHEMA + 1`; the record, not the number, is the point). Change only the literal and the test name; keep every other assertion. These files are touched, so any pinned `seed: N` in them moves to `findSeed(pred)`.
- Reads: `scripts/save-size.ts:91-100` (the `--fixture` mode), `:26` (`LONG_LIFE`) and `:29` (`FIXTURE_LIFE`), `test/probe-life.ts:33-73` (`probeLife`).

**Interfaces.**

```ts
// src/game/save-schema.ts
export function migrateSave(raw: unknown, opts?: { minSchema?: number; versions?: unknown }): MigrationResult
// STEPS[2]: (g) => { migrateSlices(g as unknown as Record<string, unknown>, null, 1); g.schemaVersion = 3; return g }
// For a record already at schema 3 the chain does nothing, and after it: migrateSlices(game, cleanVersions(opts?.versions), 'current')
// cleanVersions: a plain object whose values are integers in 1..1000; anything else is ignored (a v3 inline record has no `sv`, so every slice counts as current).
```

```ts
// scripts/save-fixtures.ts (not typechecked: tsconfig includes src, test and vite.config.ts only)
//   node fx.mjs v402 <out.json.gz>        probeLife({ seed: 11, birthYear: 1990, businesses: 3, years: 12 })
//   node fx.mjs heavy <out.json.gz>       probeLife({ seed: 7, birthYear: 1950, businesses: 6, years: 40, keepAlive: true })
//   node fx.mjs tm <out.json.gz>          { lifeId, index, entries, states }: a 6-year life, 4 snapshots through takeSnapshot on a memory backend; `index` is the text the engine wrote to localStorage['anotherlife.timemachine.v1'], `entries` every backend key and value, `states[age]` JSON.stringify(g) at each snapshot
//   node fx.mjs idb <out.json.gz>         { saves: { 'anotherlife.save.v1': <gz2 record from encodeSnapshotRecord(json, 1000)> }, marker: '1', state: <the plain JSON> } for the 12-year life
```

**Steps (test first; fixtures first because they come from old engines, not from this tree).**
1. Create `scripts/save-fixtures.ts` (modes above; a `localStorage` shim in memory; `await snapshotWritesSettled()` before the dump).
2. Generate the fixtures. In a scratch directory outside the repo: `git archive v4.0.2 | tar -x -C <scratch>/v402` and `git archive v4.1.1 | tar -x -C <scratch>/v411`; `ln -s <worktree>/node_modules <scratch>/v402/node_modules` (same for v411); copy `scripts/save-fixtures.ts` into each tree's `scripts/`; bundle with `node_modules/.bin/esbuild scripts/save-fixtures.ts --bundle --platform=node --format=esm --outfile=<scratch>/fx402.mjs` (the same as the header of `scripts/save-size.ts`); run each mode under `slot.mjs heavy --`: `v402` from the v4.0.2 tree, `heavy`, `tm` and `idb` from the v4.1.1 tree. Copy the four outputs to `test/fixtures/`. A fixture is a real old save: never regenerate it from a later engine (the header of `save-size.ts` says the same of `save-v1.json.gz`). Record in the commit message the tag and the generator invocation of each.
3. Write `test/save-v3-schema.test.ts` (red: `SAVE_SCHEMA` is still 2). Cases: (a) the v4.0.2 fixture: `migrateSave` is `ready`, `from` is 2, `schemaVersion` is 3, `isLoadableGame`, then five `ageUp`s with the queue cleared, alive, `economyState(g)` present and `year` equal to `g.year`; (b) the same for `save-v1.json.gz` (`from` 1); (c) the heavy v4.1.1 fixture: ready, `from` 2, five years, and its `flags.worldEconomy` still has `previous` for more than 100 countries before S10 (S10 changes this assertion, on purpose); (d) migrating twice: `JSON.stringify` equal; a migrated game re-serialized (the inline v3 form) loads with `from` 3 and equal JSON; (e) `schemaVersion` 4 is `newer`, 2.5 and `'3'` are `invalid`, and a record with `schemaVersion: 3` and a junk shape is `invalid` without a throw; (f) `opts.versions`: a non-object, an array, values of 0, -1, 1.5, 'x' and 1001 are all ignored, and a real map reaches `migrateSlices` (spy on a slice defined in the test with `version: 2` and a counting `migrate`); (g) a v2 record calls that `migrate` with `from` 1; a v3 record with `versions: { key: 2 }` does not call it; (h) the older-build rule: every record this code writes has `schemaVersion` equal to `SAVE_SCHEMA`, which is above 2, and a v4.1.1 build files anything above its schema 2 as `newer` and keeps it (`save-schema.ts:48` returns before the shape check at `:50`); the test re-implements those two lines on the fixture's migrated record to pin the property, and a v3 record with a `chunks` key and no `sv` passes through `migrateSave` untouched (the codec owns it, S4).
4. Change `core.ts:28`, `save-schema.ts`. Update the ten pinned tests and `save-store.test.ts:1220`.
5. Run `/Users/saeed/projects/anotherlife/wt/bin/tc`, then in three batches `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-v3-schema.test.ts test/save-schema.test.ts test/save-store.test.ts test/save-hydrate.test.ts`, `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-boot.test.ts test/save-quarantine.test.ts test/save-backends.test.ts test/save-notice.test.ts test/snapshot-codec.test.ts test/inbox-state.test.ts`, `/Users/saeed/projects/anotherlife/wt/bin/vt test/devices-save.test.ts test/ai-bench-save.test.ts test/sector-state.test.ts test/model-state.test.ts test/music-state.test.ts test/silicon-state.test.ts test/wave-stocks-story.test.ts test/notice-acceptance.test.ts test/tech-waves-wiring.test.ts test/time-machine.test.ts`.
6. Commit: `git add src/game/core.ts src/game/save-schema.ts scripts/save-fixtures.ts test/save-v3-schema.test.ts test/fixtures/save-v4.0.2.json.gz test/fixtures/save-v4.1.1-heavy.json.gz test/fixtures/tm-v4.1.1.json.gz test/fixtures/idb-v4.1.1.json.gz` plus the eleven edited test files by name. Message: "R2-S2 K.5: SAVE_SCHEMA 3, dual read, four fixtures; ten tests pinned SAVE_SCHEMA at 2 as a release statement, now 3".

**Acceptance proved.** The v4.0.2 fixture and `save-v1.json.gz` load and run five years (CI runs this every release; a new fixture is added each release); every old save keeps loading; a later version's save is still `newer`.

**Size.** Source about 420 (script 330, schema 90), tests about 500, fixtures about 400 KB.

**Risks.** `save-schema.ts` must stay free of storage and of `economy/*` imports (it imports `kernel/slices` and `save-slices`, both leaves); S10 registers the economy slice from `economy/slice.ts`, which `save-slices.ts` imports then. The heavy fixture takes about 6 seconds to run five years; keep that test to one `it`. Do not "fix" `inbox-state.test.ts` by deleting the schema line.

---

### R2-S3 K.5 (c): the chunk encoder (head, chunks, caches, manifest)

**Goal.** Turn a `GameState` into a head string and a map of chunk strings, with the text and checksum of every `replace` slice cached by object identity, so a tap re-stringifies only the core. Pure: no storage, no decode (S4), nothing calls it yet.

**Items covered.** K.5 (chunks core, world, entities/<kind>/<shard>, log; a chunk manifest; world written yearly; dirty tracking for entities), design 13.5.

**Files.**
- Create: `src/game/save-codec.ts` (the encode half and the shared helpers, about 560 lines), `test/save-codec.test.ts` (S4 extends it).
- Modify: `src/game/world-flags.ts` (add `'src/game/save-codec.ts': N,` to `WHOLE_FLAGS_SITES`, table at 163-174, N from the failing ratchet message; the encoder copies `g.flags` once).
- Reads: `src/game/save.ts:556-566` (`hashText`, the checksum shape to reuse), `src/game/core.ts:433-440` (`currentLogYear`: only the last log year is ever written), `src/game/economy/model.ts:177-180` (`storeEconomy` replaces the root).

**Interfaces.**

```ts
// src/game/save-codec.ts
export const HEAD_CHUNKS_KEY = 'chunks'
export const HEAD_VERSIONS_KEY = 'sv'
export const MAX_CHUNKS = 96
export const MAX_CHUNK_CHARS = 4_000_000
export interface ChunkRef { readonly id: string; readonly len: number }          // len = text.length (UTF-16 units)
export type ChunkManifest = Readonly<Record<string, ChunkRef>>                    // by chunk name
export interface EncodedSave {
  readonly head: string                                  // core with placeholders, then "chunks" and "sv"; valid JSON
  readonly chunks: ReadonlyMap<string, string>          // chunk id to plain text, every non-core chunk
  readonly manifest: ChunkManifest
  readonly stats: { readonly coreChars: number; readonly chunkChars: Readonly<Record<string, number>>; readonly stringified: number }  // stringified: JSON.stringify calls this encode made on slice values (tests assert 0 on a warm cache)
}
export function encodeSave(g: GameState): EncodedSave
export function inlineSave(g: GameState): string       // JSON.stringify(g): the self-contained form (a valid v3 record, no `chunks` key)
export function textSum(text: string): string           // two 32-bit FNV variants plus the length, base 36 (the shape of save.ts hashText, moved here; S9 imports it)
export function resetCodecCachesForTests(): void
```

Chunk names: `world`, `log.<n>` (n = floor(age / 10), 0 to 12), `e.<kind>.<n>`. Chunk id: `<name>.<textSum>`; the grammar is `^(world|log\.[0-9]{1,2}|e\.[a-z0-9]{1,16}\.[0-9]{1,2})\.[0-9a-z]{6,32}$`. Placeholder in a text: the string `"~" + slice key`, for example `"~flags.worldEconomy"`. Only a plain object or array is ever moved out, so a placeholder can never collide with a real value.

**Behaviour.**
- `ensureSliceTable()`; core view: `Object.assign({}, g)`, and when any non-core slice lives under `flags.`, `view.flags = Object.assign({}, g.flags)` (one shallow copy of about 190 keys). For each non-core slice present in `g`: replace its value in the view with its placeholder via `setAt` (the key keeps its position, so the head's key order equals `JSON.stringify(g)`'s and "identical JSON" can be asserted as string equality, the way `test/world2-performance.test.ts:83-85` does). `log`: the view holds only the last `LOG_TAIL` years; the older (completed) years are grouped by decade of `age` into `log.<n>` chunks, each a JSON array. Head text: `JSON.stringify(view)` with `,"chunks":<manifest>,"sv":<versions>}` spliced in before the final `}` (string surgery, no second stringify of the core).
- `replace` slices: text and sum cached in a `WeakMap<object, { text, sum }>` keyed by the root; a hit costs nothing; a miss calls `freezeRoot(root)` then stringifies once. Completed log years: a `WeakMap<LogYear, string>`; a decade chunk's joined text and id are kept in a single-entry memo per group keyed by the identity list of its years (about ten identity compares). The `world` chunk's text is the concatenation `{"flags.worldEconomy":<text>,"world":{"<shard>":<text>,...}}` of cached slice texts; a single-entry memo keyed by the tuple of roots returns the whole chunk and its id with no work when every root is unchanged. `inplace` slices outside the core are re-stringified on every encode, but their chunk id is content-addressed, so an unchanged text still gives an unchanged id and is not rewritten.
- `shape: 'subkeys'` (`world`): each own key of the object is a sub-slice (`world.<key>`) with its own identity cache; a key with an explicit row whose chunk is `core` (today only `world.ledger`, an `inplace` slice) is not moved out: it stays inline in the container in the head, is re-stringified with the core on every encode, and never touches a chunk id (cross-check addition: the ledger is edited in place by every booking); a sub-slice declared with `chunk: 'entities'` and `entities: { kind, shards }` is a `Record<string, object>` whose keys are in ascending UTF-16 order: it is split by `fnv(key) % shards` into `e.<kind>.<n>` chunks (each a JSON object; an empty shard writes nothing) and leaves `"~world.<name>"` in the world object. A record whose keys are not in ascending order is not eligible and rides whole in the `world` chunk (counted in a test-visible `stats` field so a producer that unsorts is caught). A shard's text and id are recomputed only when one of its entries' identities changed.
- `sv`: `{ [slice key]: slice version }` for every declared slice. Chunk record count is capped at `MAX_CHUNKS` (a life that would exceed it keeps the extra entity shards in the `world` chunk); a chunk text over `MAX_CHUNK_CHARS` is a bug and throws (the caller treats a throw as "save failed", `save.ts:50-54` already does).
- Never mutates `g` and never reads a random number. Works on a deep-frozen `g` (the fuzz kit freezes it, `test/fuzz-kit.ts:422`).

**Steps (test first).**
1. Write `test/save-codec.test.ts` (red). Cases, with the synthetic slices defined inside the file under keys `flags.testChunk`, `world` shards `testRec` (replace), `testHot` (inplace) and an entity slice over a record of 40 entries: (a) the head is valid JSON, `Object.keys(JSON.parse(head))` is `Object.keys(g)` plus `chunks` and `sv`, `schemaVersion` keeps its position, and the economy flag sits where it was and holds `"~flags.worldEconomy"`; (b) a golden head string for a tiny hand-made game (exact expected text, so the layout cannot drift unseen); (c) the second `encodeSave` of the same `g` returns the same head string and `stats.stringified` is 0; a structural clone that shares the economy root (the S8 shape) also gives 0 for the economy and equal chunk ids; (d) changing one number in a fresh economy root changes the world chunk id and nothing else; replacing a completed log year changes one `log.<n>` id only; (e) `LOG_TAIL`: the last log year is in the head, the completed ones in chunks, an empty and a one-year log encode with no `log` chunk; decade grouping by `age`; (f) entity shards: 40 entries split into at most 4 chunks, one entry changed re-stringifies one shard (spy on `JSON.stringify`), an unsorted record rides whole in `world`, an empty record writes nothing; (g) `inplace` slice: re-stringified every time, id unchanged when the text is; (h) manifest `len` equals `text.length` for every chunk, ids match the grammar and `textSum`, count at most `MAX_CHUNKS`; (i) a frozen `g` encodes; `g` is deep-equal before and after; (j) `inlineSave(g)` equals `JSON.stringify(g)` and has no `chunks` key; (j2) a synthetic `world.ledger` (declared core and `inplace` in the test table, as in S1) stays inline in the head's `world` object: editing it in place changes the head text and no chunk id, while editing a `replace` shard changes the world chunk id and not the head's inline part; (k) a 15-year `probeLife` (two companies): world chunk plus core plus log chunks total fewer characters than `inlineSave` of the same game, and the head is under a third of it.
2. Create `save-codec.ts`. Add the `WHOLE_FLAGS_SITES` entry the failing `test/world-flags.test.ts` names.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-codec.test.ts test/save-slices.test.ts test/world-flags.test.ts test/architecture.test.ts`.
4. Commit: `git add src/game/save-codec.ts src/game/world-flags.ts test/save-codec.test.ts`, message "R2-S3 K.5: the chunk encoder, identity caches and manifest".

**Acceptance proved.** The head has the same key order as the state; unchanged `replace` slices cost no stringify (the per-tap budget of S8 rests on this); chunk ids are content-addressed.

**Size.** Source about 560, tests about 600.

**Risks.** Cache soundness is the whole point: a `replace` root mutated in place would be served stale. `freezeRoot` makes that a `TypeError`; the test for it is in S8 (the clone) and S12 (the world shards). Do not cache an `inplace` slice. `textSum` must stay a pure function of the text (the Time Machine and the store compare ids across sessions).

---

### R2-S4 K.5 (d): the chunk decoder, the hostile-chunk policy and reload identity

**Goal.** `assembleSave(head, texts)` rebuilds the `GameState` record from a head and its chunk texts, exactly (same JSON string as the state that was encoded), and turns every hostile or missing chunk into a bounded loss instead of a crash.

**Items covered.** K.5 (chunk manifest, per-slice normalize and migrate on read, dual-read), acceptance "hostile chunks and a missing chunk load safely" and "reload gives identical JSON".

**Files.**
- Modify: `src/game/save-codec.ts` (the decode half, about 520 lines), `test/save-codec.test.ts` (extend), `src/game/save-slices.ts` (nothing new; the cap numbers are used here).
- Reads: `src/game/save-schema.ts:222-239` (`finiteJsonTree`, `MAX_JSON_NODES` at 60), `:511-538` (`isGameShell`, `isLoadableGame`).

**Interfaces.**

```ts
export interface LostChunk { readonly name: string; readonly why: 'missing' | 'hostile' | 'size'; readonly raw?: string }  // raw: the hostile text, at most 2,000,000 chars, kept for the quarantine copy
export type Assembled =
  | { readonly kind: 'ready'; readonly game: Record<string, unknown>; readonly versions: Readonly<Record<string, number>>; readonly lost: readonly LostChunk[] }
  | { readonly kind: 'invalid'; readonly reason: string }
export function isChunkedHead(value: unknown): value is Record<string, unknown>   // a plain object, schemaVersion an integer >= 3, own `chunks` a plain object (not an array)
export function neededChunkIds(head: Record<string, unknown>): string[]          // the valid manifest ids, in manifest order, at most MAX_CHUNKS; [] for a bad manifest
export function assembleSave(head: Record<string, unknown>, texts: ReadonlyMap<string, string | null>): Assembled
```

**Behaviour.**
1. Manifest check: a plain object of at most `MAX_CHUNKS` entries; every name and id matches the grammar of S3 and the id starts with `<name>.`; `len` an integer from 0 to `MAX_CHUNK_CHARS`. An entry that fails is dropped and counted lost `hostile`. A manifest that is not an object is `invalid`.
2. For each entry: text `null` or absent is lost `missing`; `text.length !== len` or `textSum(text) !== id suffix` is lost `hostile` (with `raw`); `JSON.parse` failure is `hostile`; a parsed value whose `countNodes` passes the sum of its slices' `caps.nodes` is `size`. A chunk that fails is never half-applied.
3. Splice: for each slice of a good chunk, `normalize` the value; `undefined` drops it; otherwise `setAt` it where the core holds its placeholder (the key keeps its position). A placeholder with no good chunk behind it deletes the key (the slice reads as absent: the economy re-seeds at the current year, `economy/index.ts:18-22`, with no retroactive earnings). `log`: the lost decades are skipped and the core tail stays; the log is the chunk years in age order followed by the tail. Entity shards merge into one record with keys in ascending order; a missing shard drops only its entries. A key in the core that still holds a `"~<key>"` string after the splice is deleted. A core value at a chunked slice's path that is not its placeholder is kept as is (normalized), and the manifest entry is ignored for that slice. This is also how an inline core sub-slice (`world.ledger`) round-trips: it is in the head, normalized by its own slice, and no manifest entry exists for it.
4. `sv`: sanitized like `cleanVersions` in S2 and returned as `versions`; `chunks` and `sv` are removed from the game. The result is a v2-shaped record plus `schemaVersion`, ready for `migrateSave(game, { versions })`; `assembleSave` itself never runs the migration.
5. Never throws: the whole function is inside one `try`, and a thrown error is `invalid`.

**Steps (test first).**
1. Extend `test/save-codec.test.ts` (red). Round trip: `JSON.stringify(assembleSave(JSON.parse(head), texts).game)` equals `inlineSave(g)` for `makeTestGame`, a 15-year `probeLife` (two companies), the heavy fixture migrated by `migrateSave`, and a game with the synthetic slices and the 40-entry entity record (this is "reload gives identical JSON", S12 repeats it at 50 years). Hostile table (each case asserts no throw, a `ready` result with the loss named, or `invalid`, and that `isLoadableGame(migrateSave(game).game)` still holds for the ready ones): manifest an array, a string, null; 97 entries; a name outside the grammar; an id that does not start with its name; `len` negative, fractional, huge; text one character short; text altered with the right length (sum mismatch); text that is not JSON; chunk value of the wrong type for its slice; node bomb (a chunk of nested arrays past its cap); `__proto__`, `constructor` and `prototype` keys in a chunk object (the key is not set on the result's prototype: `Object.getPrototypeOf(game.flags)` stays `Object.prototype`, and the game has no polluted key); a placeholder with no manifest entry; a manifest entry for a slice whose core value is not a placeholder; a head whose `schemaVersion` is 2 with a `chunks` key (not a chunked head); the missing world chunk gives a game with no `flags.worldEconomy` that then plays a year; the missing log decade gives the tail only; a lost `core`-only slice cannot happen (the core is the head). Then a 30-case junk table (random-looking objects, arrays, numbers, deeply nested objects, a 10,000-key flat object) that must return `invalid` or `ready` and never throw.
2. Implement the decode half.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-codec.test.ts test/save-slices.test.ts test/save-v3-schema.test.ts`.
4. Commit: `git add src/game/save-codec.ts test/save-codec.test.ts`, message "R2-S4 K.5: the chunk decoder, hostile and missing chunks, exact reload".

**Acceptance proved.** Reload gives identical JSON for the encoded states; hostile chunks and a missing chunk give a bounded loss, never a crash (the quarantine half is S7).

**Size.** Source about 520, tests about 650.

**Risks.** Prototype pollution through chunk keys: build objects only through `setAt` (which refuses the three names) or `JSON.parse` output, never `obj[key] = value` with a key from the file. A `normalize` that is not idempotent breaks the exact round trip: the test normalizes twice and compares. Ordering: the entity merge must sort exactly the way the producer's precondition says (default `Array.prototype.sort`, UTF-16 order), and integer-like keys iterate numerically in any object, so the S3 eligibility check must run on the same iteration order.

---

### R2-S5 K.5 (e): chunk stores in the backends

**Goal.** Give each backend somewhere to put chunk records, without changing how the head is stored and without breaking a test double that has no chunk store.

**Items covered.** K.5 (chunks stored beside the head; wire the IndexedDB backend), X17.

**Files.**
- Modify: `src/game/save-backends.ts` (255 lines: interfaces 8-35, `memorySaveBackend` 38-52, `localSaveBackend` 60-89, `idbBackend` return object at 242-254), `test/save-kit.ts` (295 lines; additive).
- Create: `test/save-chunk-backends.test.ts`.
- Reads: `src/game/save-quarantine.ts:12` (slot keys `anotherlife.save.v1.bad`, `.bad.2`, `.bad.3`: the chunk prefix must not collide), `test/save-kit.ts:99-248` (the fake IndexedDB supports `get`, `put`, `delete`, `getAllKeys` on one store, which is all this needs).

**Interfaces.**

```ts
export const CHUNK_PREFIX = `${SAVE_KEY}.c3.`        // 'anotherlife.save.v1.c3.' : the generation is in the key, so a later format's chunks are never swept by this one
export function chunkKey(id: string): string           // CHUNK_PREFIX + id
export function isOurChunkKey(key: string): boolean    // starts with CHUNK_PREFIX and the rest matches the id grammar of save-codec

export interface SyncChunkStore {
  ids(): string[]                                      // ids (prefix removed) of every stored chunk of this generation
  get(id: string): string | null
  /** False when the record could not be stored (quota). A local store asks `evict` for room first, exactly as the head write does. */
  put(id: string, record: string): boolean
  remove(ids: readonly string[]): void                 // never throws
}
export interface AsyncChunkStore {
  ids(): Promise<string[]>
  get(ids: readonly string[]): Promise<(string | null)[]>
  /** All or nothing, in one transaction. */
  put(entries: readonly (readonly [id: string, record: string])[]): Promise<void>
  remove(ids: readonly string[]): Promise<void>
}
// SyncSaveBackend gains `readonly chunks?: SyncChunkStore`; AsyncSaveBackend gains `readonly chunks?: AsyncChunkStore`.
// memorySaveBackend(initial?) and localSaveBackend(evict?) and idbBackend all provide it; a backend written by a test without it is "inline only".
```

**Steps (test first).**
1. Write `test/save-chunk-backends.test.ts` (red): (a) memory store: put/get/ids/remove, `ids()` lists only this generation (a key `anotherlife.save.v1.c4.x`, the head key and the quarantine slots are never listed or removed); (b) local store over `memoryLocalStorage`: same, `put` returns false on a full storage after `evict` says it freed nothing, retries while `evict` frees room, `remove` and `ids` survive a `disabledStorage()`-style localStorage that throws (the helper at `test/save-store.test.ts:44-55`); (c) IDB store over `fakeIndexedDb()`: keys are `saves`-store keys `chunkKey(id)`, `put` of several entries is one transaction (all or nothing: with `failWrite: true` none of them stick), `get` returns null for a missing id and for a non-string row, `ids()` ignores the head key and quarantine rows, a dropped connection is reopened once like the head calls (`dropConnections()`), the database version stays 1 (`opens` and the factory's version: assert `idb.open` was called with version 1); (d) `isOurChunkKey` accepts the grammar, rejects `.c4.`, `.bad`, `.bad.2`, a path with `..`, and an id over 64 characters.
2. Implement in `save-backends.ts`. Share one id-grammar constant with `save-codec.ts` (export it from the codec, import here as a type-light regex: if that makes a cycle, copy the regex and add a test that the two are equal).
3. Extend `test/save-kit.ts`: `memoryChunkStore()` (a `SyncChunkStore` over a Map that records put sizes) and `chunkedBackend(initial?)` (a `ControlledBackend` at `test/save-kit.ts:251` with an in-memory `chunks` store whose `put` is held until the test settles it, like `write`).
4. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-chunk-backends.test.ts test/save-backends.test.ts test/save-store.test.ts test/save-quarantine.test.ts`.
5. Commit: `git add src/game/save-backends.ts test/save-kit.ts test/save-chunk-backends.test.ts`, message "R2-S5 K.5: chunk stores in the memory, localStorage and IndexedDB backends".

**Acceptance proved.** The three real backends can store, list and remove chunks; the database version stays 1, so an older build still opens it; no existing backend test changes.

**Size.** Source about 330, tests about 450.

**Risks.** The IndexedDB version must not change: `save-backends.ts:132` opens version 1 and an older build that sees version 2 would fail to open and fall back to localStorage (a silent loss of the life it cannot see). That is why chunks live in the `saves` store under a prefix. `ids()` on localStorage walks `localStorage.length`; keep it off the per-tap path (S6 calls it once per page).

---

### R2-S6 K.5 (f): the store writes chunks; `saveGame` and `loadGame` use them

**Goal.** The main save becomes head plus chunks. The store's one-string queue (latest write wins, one write in flight, removal after it, quarantine of a newer record, backup to the legacy key) keeps working unchanged for a string; the chunks ride beside the head and are written before it.

**Items covered.** K.5 (chunks written yearly, dirty tracking, gz2 for the main save's big chunks, v3 written).

**Files.**
- Modify: `src/game/save-store.ts` (`State` 34-64, `saveRecord` 207-230, `readRecord` 237-245, `removeRecord` 254-275, `backUp` 297-307, `spillSave` 327-334, `primeCache` 353-357, `writeQueued` 461-514, `resetSaveStoreForTests` 554-561; one new export `readChunk`), `src/game/save.ts` (`saveGame` 48-56, `loadGame` 59-73, one import line).
- Create: `test/save-chunk-store.test.ts`.
- Reads: `src/game/snapshot-codec.ts:51-59` (`encodeSnapshotRecord(json, minimum = 100000)`: used for IndexedDB chunk records with the default minimum), `test/save-store.test.ts` (the patterns for controlled backends and generations).

**Interfaces.**

```ts
// src/game/save-store.ts
export interface ChunkedWrite {
  /** Every chunk the head refers to (id to plain text), not only the new ones: the store writes what storage does not have yet. */
  readonly chunks: ReadonlyMap<string, string>
  /** The self-contained form of the same game, for backups, spill and reads: computed lazily, at most once. */
  readonly plain: () => string
}
export function saveRecord(json: string, chunked?: ChunkedWrite): boolean       // json is the head when `chunked` is given
export function readChunk(id: string): string | null                              // sync backends only (a chunk of the record readRecord returns); null otherwise
// save.ts
export function saveGame(g: GameState): boolean
export function loadGame(): GameState | null
```

**Behaviour.**
- A side table `extras: Map<head string, ChunkedWrite>` keeps at most the newest, stored and pending heads. `plainText(head)` is `extras.get(head)?.plain() ?? head`. Every place that hands a record to a reader or to the legacy key goes through it: the async branch of `readRecord` (so `loadGame` always parses an inline v3 text there, never a chunked head), `backUp` (lines 226, 418, 511 call it with `s.newest`), `spillSave`, and the comparison `s.backup === json`.
- `persisted: Set<string>`: chunk ids known to be in storage. Primed once per page from `chunks.ids()` the first time a chunked save arrives (sync: at once; async: inside the queue), and by `primeCache(json, ids?)` at boot. Cleared by `removeRecord` and `resetSaveStoreForTests`.
- Sync backend, queue idle, nothing newer waiting (`saveRecord` 212): for each referenced id not in `persisted`, `chunks.put(id, text)` (plain text: localStorage cannot await a gzip); any false means the save failed and the head is not written; then `backend.write(head)`; then, if any chunk was put, sweep: `chunks.remove(ids)` for every stored id that is ours and not referenced. No sweep while `s.newer !== null` (a later version's records must not be touched). A backend with no `chunks` writes `plainText(head)` as one record.
- Async backend: the queue step (`writeQueued`) encodes each missing chunk with `encodeSnapshotRecord(text)`, `await watched(s, backend.chunks.put(entries))`, encodes the head, `await watched(s, backend.write(record))`, adds the ids to `persisted`, then sweeps with `await watched(...)`. Each `await` is followed by the existing `current()` generation check. On any failure `setPersistFailed(true, connectionLost(failure))` and `backUp(s, plainText(s.newest ?? json))` as today. Coalescing is safe because every write sends the full referenced set against `persisted`, never "the new ones since the last encode" (a coalesced intermediate save's chunks are written by the next one).
- Removal: after `backend.remove()`, `chunks.remove(chunks.ids())` (sync at once; async in the removal step). `deleteSaveCopy` is untouched.
- `saveGame(g)`: if the active backend has a chunk store, `encodeSave(g)` then `saveRecord(enc.head, { chunks: enc.chunks, plain: () => inlineSave(g) })`; otherwise `saveRecord(inlineSave(g))`. A throw from the encoder is `false`, as `JSON.stringify` is today. `loadGame()`: parse the record; a head whose `schemaVersion` is above `SAVE_SCHEMA` returns null before any chunk is read (the later version's record stays untouched); otherwise, if `isChunkedHead`, read `neededChunkIds` through `readChunk`, `assembleSave`, then `migrateSave(game, { versions })`; a plain record goes straight to `migrateSave`.

**Steps (test first).**
1. Write `test/save-chunk-store.test.ts` (red). Sync (memory and local backends): (a) a save writes chunks then head (record the call order on a double), a second save with the economy unchanged writes only the head (assert the put count), a year step writes one new world chunk and one new decade chunk and the sweep removes the two they replaced; (b) a chunk put that fails (quota) leaves the old head and old chunks intact, returns false, sets `persistFailed`, and a later save succeeds; (c) the sweep never removes a chunk the stored head references, checked as a property over a 200-step random sequence of saves, failed saves and removals (after every step, every id the stored head names is in storage); (d) `protectNewerRecord` on a record that has chunk keys of a generation `c4` leaves them alone through a save; (e) `removeRecord` removes the head and every `c3` chunk and nothing else (a `.bad` slot survives); (f) `loadGame` after `saveGame` returns a game with `JSON.stringify` equal to the saved one, from a head with chunks, from an inline record, and from a v2 plain record; a missing chunk gives a loadable game (the loss is reported in S7); (g) a quota-full local storage frees Time Machine room through the evictor for a chunk put exactly as for the head (`test/time-machine.test.ts:263-277` is the pattern). Async (the new `chunkedBackend`): (h) the queue writes chunks, then the head, in that order, one transaction for the chunks; a held chunk put blocks the head write; (i) two saves made while a write is in flight coalesce to the latest and the second one's chunks are written; (j) a failing chunk put sets `persistFailed`, writes the plain backup to the legacy key (the inline form, loadable), and `flushSave` resolves false; (k) `readRecord` on an async backend returns the inline text, parseable by `loadGame` with no chunk read; (l) `spillSave` writes the inline text; (m) a removal discards a save made before it, chunks included; (n) stale cache: after a failed write `readRecord` answers with the last stored save's inline text. Existing tests: none change.
2. Implement the store changes and the two facade functions.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-chunk-store.test.ts test/save-store.test.ts test/save-boot.test.ts test/save-hydrate.test.ts test/time-machine.test.ts` (the last one exercises the real store through `ui/store.ts`).
4. Commit: `git add src/game/save-store.ts src/game/save.ts test/save-chunk-store.test.ts`, message "R2-S6 K.5: the store writes and sweeps chunks; saveGame and loadGame use head plus chunks".

**Acceptance proved.** The main save is written as head plus chunks on localStorage and IndexedDB; an unchanged world costs no write; a failed chunk never loses the previous save; the backup and the spill stay self-contained.

**Size.** Source about 450, tests about 800.

**Risks.** This is the riskiest task of the track. The one invariant that matters is "every id the stored head names exists": the sweep runs only after a successful head write, only on ids of this generation, and never while a newer record is protected. If the agent stalls twice, split here: S6a the sync path with `loadGame`, S6b the async queue. Keep `saveRecord(json)` with one argument byte-for-byte what it was (the 1,265-line `save-store.test.ts` is the guard). The side table must not grow: assert its size is at most 3 after 50 saves.

---

### R2-S7 K.5 (g): the boot reads chunks; partial loads, quarantine and the IndexedDB fixture

**Goal.** Boot, import and the notices handle a head with chunks: a save with a hostile or missing chunk loads with that part fresh and a byte-exact copy kept; a save whose core is unreadable is quarantined whole, as today.

**Items covered.** K.5 (hostile chunks and a missing chunk load safely, quarantine), the IndexedDB fixture.

**Files.**
- Modify: `src/game/save-hydrate.ts` (`diagnoseRecord` 26-33, `removeLegacyIf` 110-113, `chooseBackend` 164-185, `importLegacy` 192-215, `boot` 255-354), `src/game/save-quarantine.ts` (`SaveNotice` at 25-37: add `readonly partial?: true`; `notice` at 39-41 and `scanQuarantine` at 149-171: the `diagnose` callback may answer `partial: true`, which is carried onto the notice), `src/game/snapshot-codec.ts` (`decodeSnapshotRecord` at 62: add `maxChars = MAX_SNAPSHOT_BYTES`, checked in the stream loop at line 76), `src/ui/components/SaveNotices.tsx` (`noticeCopy`, the `damaged` case: a `partial` variant), `src/game/save-store.ts` (`readSaveCopy` at 523-530 returns an assembled inline text when the main-slot record is a head and every chunk is present, else the head; `save.ts:14` re-exports it unchanged).
- Create: `test/save-chunk-boot.test.ts`.
- Reads: `test/save-hydrate.test.ts:122-160, 201-285, 344-410` (patterns), the IDB fixture from S2.

**Interfaces.**

```ts
// save-hydrate.ts
export type ChunkSource = (ids: readonly string[]) => Promise<ReadonlyMap<string, string | null>>
export type Diagnosis =
  | { kind: 'ready'; game: GameState; from: number; lost?: readonly LostChunk[] }
  | { kind: 'newer' | 'tooOld'; version: number }
  | { kind: 'damaged' }
export function diagnoseRecord(raw: string, opts?: { minSchema?: number; chunks?: ChunkSource }): Promise<Diagnosis>
// snapshot-codec.ts
export async function decodeSnapshotRecord(value: string, maxChars?: number): Promise<string>
// save-quarantine.ts
export interface SaveNotice { /* existing fields */ readonly partial?: true }
export function scanQuarantine(backend: SaveBackend, diagnose: (raw: string) => Promise<{ kind: SaveNoticeKind; version?: number; partial?: true }>, onFound?: (found: SaveNotice) => void): Promise<SaveNotice[]>
```

**Behaviour.**
- `diagnoseRecord`: decode and parse as today; if `isChunkedHead`, fetch `neededChunkIds` through `opts.chunks` (each record decoded with `decodeSnapshotRecord(record, len + 1024)`, so a hostile gz2 chunk cannot inflate to 20 MB), `assembleSave`, then `migrateSave(game, { versions })`. Any throw is `damaged`. A head whose `schemaVersion` is above `SAVE_SCHEMA` is `newer` before any chunk is fetched (the later version's chunks are never read or touched). Without a `chunks` source a chunked head is read as if every chunk were missing.
- `boot`: the candidate from IndexedDB reads its chunks with `backend.chunks.get`; the candidates `legacy` and `local` read with the sync local chunk store; `sameGame`/`newerOf` compare assembled games. `primeCache(JSON.stringify(winner.found.game), idsOfTheHead)` as today plus the stored ids, so the first save does not rewrite chunks the database already has. A `ready` winner with `lost` chunks: build a dump `JSON.stringify({ al: 'partial-save', head, chunks: { [id]: rawText } })` (hostile texts only, each at most 2,000,000 chars, total at most 3,000,000), `quarantineRecord(backend, dump, 'damaged')`, and list the returned notice with `partial: true` (the game plays; the copy is what the player can download). `listKeptCopies` (`save-hydrate.ts:357-375`) rescans the copies at the end of boot and replaces each notice by id, so its `diagnose` recognizes the dump (`al: 'partial-save'`) and answers `{ kind: 'damaged', partial: true }`; otherwise the rescan would erase the flag. If five copies are kept already, nothing is copied and no notice is added, the game still plays (the loss is real, the copy is best effort).
- `importLegacy`: the migrated game is written as `encodeSave(game)`: chunks first (`backend.chunks.put`), then the head, then the read-back check (`diagnoseRecord` of the stored head with the database chunk source gives a game whose JSON equals), and only then `removeLegacyIf(raw)` plus a sweep of the legacy local chunk keys of this generation. A refused or mismatching write keeps the legacy record and plays from localStorage, as today.
- `noticeCopy`, `partial` variant: title "Part of your save didn't load", text "That part started fresh, and a copy is kept on this device. Download it if you want to look." (92 characters, voice cap 120).

**Steps (test first).**
1. Write `test/save-chunk-boot.test.ts` (red). Cases on the fake IndexedDB and on localStorage: (a) the IDB fixture of S2 (`idb-v4.1.1.json.gz`: seed the fake database from `saves`, set the marker) boots, loads as `ready` from `idb`, plays five years, and the first save writes a head with chunks; the stored v4.1.1 record is replaced; (b) a v3 head with chunks written by `saveGame` in the previous page boots to a game with equal JSON (`source: 'idb'`), and the next save writes no chunk (all in `persisted`); (c) a missing world chunk: boot is `ready`, the game has no `flags.worldEconomy`, plays a year (the economy re-seeds), one `partial` notice is listed, the copy is kept and `readSaveCopy(id)` returns the dump with the head in it; (d) a hostile world chunk (sum mismatch, then not JSON, then a node bomb, then a 20 MB gz2 claim): same outcome, nothing crashes, memory stays bounded (the oversize gz2 record is refused by `maxChars` before inflation: assert `decodeSnapshotRecord` rejects it); (e) a missing log decade: the game loads with the tail, a notice; (f) a head whose core is damaged (a required field missing): `damaged`, quarantined whole, not `partial`; (g) five copies kept already: a partial load still plays and adds no notice; (h) a head with `schemaVersion: 4` and chunk keys of generation `c4`: `newer`, protected, the chunk keys survive a save; (i) legacy v4.1.1 record in localStorage plus an empty database: imported as head and chunks, read back identical, the localStorage record and its chunks gone; with the database refusing the head write the legacy record stays and the page plays from localStorage; (j) `readSaveCopy(SAVE_KEY)` returns an inline text equal to the game's when all chunks are there; (k) `noticeCopy` returns the partial variant and respects the 120-character cap (`test/save-notice.test.ts` gets the same case); (l) after the whole boot, including `listKeptCopies`, the partial notice is still `partial`, and `deleteSaveCopy(id)` removes the dump and its notice as for any copy.
2. Implement. `decodeSnapshotRecord`'s second parameter defaults to the current constant, so `test/snapshot-codec.test.ts` is unchanged.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-chunk-boot.test.ts test/save-hydrate.test.ts test/save-boot.test.ts test/save-notice.test.ts test/snapshot-codec.test.ts test/save-quarantine.test.ts`.
4. Commit: `git add src/game/save-hydrate.ts src/game/save-quarantine.ts src/game/snapshot-codec.ts src/game/save-store.ts src/ui/components/SaveNotices.tsx test/save-chunk-boot.test.ts test/save-notice.test.ts`, message "R2-S7 K.5: boot reads chunks, partial loads keep a copy, the IndexedDB fixture loads".

**Acceptance proved.** The IndexedDB fixture loads and runs; hostile chunks and a missing chunk load safely with a kept copy; a damaged core is quarantined whole; a later version's record is untouched.

**Size.** Source about 480, tests about 750.

**Risks.** Boot has a budget and a "never rejects" rule (`save-hydrate.ts:82-102`): every added await sits inside `within(...)` with the existing `timeoutMs`, and reading chunks counts toward the same boot budget. Quarantine is best effort and must not change the winner. The dump can be 3 MB: the localStorage slots count characters against a 5 MB site quota, so the dump is built only when the copy would fit (try the slot, fall back to the overflow store, else skip, exactly like `quarantineRecord`'s existing contract).

---

### R2-S8 K.5 (h): the per-tap cost: `cloneForAct` shares the replace roots

**Goal.** A tap clones and stringifies only the core. `act()` builds the draft from the committed state by cloning everything except the `replace` roots and the completed log years, which it shares by reference (deep-frozen), and `saveGame` already re-uses their cached text (S3). This is where the "faster taps" of the roadmap come from.

**Items covered.** K.5 (core chunk clone 3.8 ms against 24, stringify 2.3 ms against 25), acceptance "per-tap clone plus stringify at most 8 ms for the core".

**Files.**
- Create: `src/game/save-clone.ts` (about 330 lines), `test/save-clone.test.ts`, `test/save-tap-cost.test.ts`, `test/perf-kit.ts` (about 40 lines: `machineFactor()`, imported by S11 and S12 too).
- Modify: `src/ui/store.ts` (`act` at 425-440: line 428 `const draft = structuredClone(current)` becomes `const draft = cloneForAct(current)` and one import), `test/fuzz-kit.ts` (line 807, one line: `structuredClone(g)` to `cloneForAct(g)`; the fuzz kit freezes `g` first, line 806, which is the shape `cloneForAct` expects), `src/game/world-flags.ts` (`'src/game/save-clone.ts': N` in `WHOLE_FLAGS_SITES`).
- Reads: `src/ui/store.ts:378-389` (`commit`), `src/game/economy/model.ts:149-180` (the root cache and `storeEconomy`), `src/game/aging.ts:96-120` (`ageUp` writes through `yearlyEconomy`, which replaces the root).

**Interfaces.**

```ts
// src/game/save-clone.ts
export function cloneForAct(g: GameState): GameState
```
```ts
// test/perf-kit.ts
export function machineFactor(): number   // calibrationMs / REFERENCE_MS for a fixed 2,000,000-step integer loop; clamped to at least 1
```

Result of `cloneForAct`: deep-equal to `structuredClone(g)` with `JSON.stringify` identical (same key order: the shared slots are cloned as placeholders and reattached with `setAt`), except that every `write: 'replace'` slice value and every completed log year (`g.log.slice(0, -LOG_TAIL)`) is the same object as in `g`, deep-frozen by `freezeRoot`. For a `subkeys` slice (`world`) the container is a new shallow object and each shard is shared, except a key declared `core` and `inplace` (`world.ledger`), which is deep-cloned like the rest of the core and left writable: Ledger-world's `book()` edits it in place.

**Steps (test first).**
1. Write `test/save-clone.test.ts` (red): (a) `JSON.stringify(cloneForAct(g))` equals `JSON.stringify(g)` for `makeTestGame` and a 15-year probe life; (b) `cloneForAct(g).flags.worldEconomy === g.flags.worldEconomy` and completed log years are identical objects, the tail year and `character`, `people`, `assets` and the other flags are not, and mutating them on the draft leaves `g` equal to its earlier JSON; (c) writing into the shared economy root, a shared log year, or a shared world shard (a synthetic `g.world` built in the test) on the draft throws a `TypeError` (strict mode); (d) a draft whose `flags.worldEconomy` is absent, whose `log` has one year or none, and whose `world` is absent clones without error; (e) a deep-frozen `g` clones (the fuzz kit shape); (f) the yearly path under sharing: six `ageUp`s on a probe life, each on `cloneForAct(previous)`, finish with no throw, `economyState(draft)` is a new root each year, and the result's JSON equals six `ageUp`s on structured clones of the same start (this proves `yearlyEconomy`, `recordEconomicActivity` and `enactEconomicPolicy` replace roots, as `economy/model.ts:176` says); (g) the fuzz kit's own action probe on the new draft path: with the one-line hunk below, `probeActions(g, log, seed, { depth: 1, max: 150 })` (`test/fuzz-kit.ts:856`, exported; it deep-freezes `g` and runs every enabled menu action on a draft made at line 807) on a mid-life probe state (age 40, three companies, built with `probeLife`) ends with `log.list()` empty: a write into a shared frozen root is classified by the kit as `action-stale-throw` (`isFrozenWrite`, defined at `test/fuzz-kit.ts:523` and used at `:815`), so this is the detector for an in-place writer of a replace slice (time limit 120 s). Then `test/save-tap-cost.test.ts`: (h) on a heavy probe life (age 70, 6 companies, built once) time 30 rounds of `cloneForAct` plus `encodeSave` with a warm cache after warming up 5 rounds; the median is at most 8 ms times `machineFactor()` (the reference time is recorded in `perf-kit.ts` from the dev desktop; a factor below 1 is clamped to 1 so a fast machine is not held to less); print the median, the factor and the old cost (`structuredClone` plus `JSON.stringify` of the whole state, for the record) as one line; (i) bytes: the head is at most 400,000 characters; (j) `stats.stringified` is 0 for the shared slices on the second tap.
2. Create `save-clone.ts` (algorithm: build a shallow view of `g` with placeholders at the shared slots, `structuredClone(view)`, reattach shared values with `setAt`, `freezeRoot` each shared root, `log = [...completed, ...clonedTail]`). Edit `ui/store.ts:428`, `fuzz-kit.ts:807`, add the `WHOLE_FLAGS_SITES` entry.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-clone.test.ts test/save-tap-cost.test.ts test/save-codec.test.ts test/world-flags.test.ts test/architecture.test.ts test/time-machine.test.ts test/save-boot.test.ts`.
4. Optional smoke, one file, not the suite: `FUZZ=1 FUZZ_SEEDS=2 FUZZ_YEARS=30 /Users/saeed/projects/anotherlife/wt/bin/vt test/fuzz-deep.test.ts` (the fuzz kit now plays through `cloneForAct`; a `TypeError: Cannot assign to read only property` here is a real in-place write to a replace slice: fix the writer, not the freeze).
5. Commit: `git add src/game/save-clone.ts src/ui/store.ts test/fuzz-kit.ts src/game/world-flags.ts test/save-clone.test.ts test/save-tap-cost.test.ts test/perf-kit.ts`, message "R2-S8 K.5: act() clones only the core and shares the frozen replace roots".

**Acceptance proved.** Per-tap clone plus stringify of the core at most 8 ms; the economy root keeps its identity across taps (so `economyState`'s `WeakMap` cache at `economy/model.ts:148` also hits, a cost the digest did not count: the root was re-normalized after every tap); a stray in-place write to a shared root fails loudly in tests.

**Size.** Source about 350, tests about 550.

**Risks.** The freeze is deliberate in every build: the identity cache of S3 is sound only for frozen roots, and silent staleness (a world slice that is not saved) is worse than a visible error. The cost is that any rarely used code path that mutates `economyOf(g)`'s return value in place now throws; the yearly path and the fuzz kit's action probe (up to 150 enabled actions on a mid-life state) are tested, the fuzz run in step 4 widens it, and S12 runs it once more. If a legitimate in-place writer of the economy turns up, change it to build a new root (the `storeEconomy` pattern); do not unfreeze. Keep `act()`'s catch-and-rethrow (`ui/store.ts:432-435`) as it is.

---

### R2-S9 K.5 (i) and F39: the Time Machine over slices, and snapshot restores through `migrateSave`

**Goal.** `pack()` stops special-casing `worldEconomy` and stores a snapshot as the codec's head plus content-addressed chunks, so any slice (any `world.*` shard included) is shared between snapshots when unchanged. `loadSnapshot` passes every restore through `migrateSave` (F39), and a schema-2 snapshot already in a player's storage still restores.

**Items covered.** K.5 ("the Time Machine pack() is generalized to chunk any world.* shard"), A.K9 (Time Machine `pack()` chunks any `world.*` shard), F39, the Time Machine fixture, "a Time Machine fork gives identical JSON".

**Files.**
- Modify: `src/game/save.ts` (`hashText` 556-566 becomes a re-export of `textSum`; `Packed` 568-576 and `pack` 578-613 rewritten; `writeSnapshot` 646-693 compresses every chunk of 1,000 characters or more; `loadSnapshot` 755-796: line 790 `migrateLegacyAi(g)` becomes the `migrateSave` path; the old restore code at 764-788 moves into `unpackLegacySnapshot` and is kept for old snapshots), `test/time-machine.test.ts` (line 223-224, see below).
- Create: `test/time-machine-v3.test.ts`.
- Reads: `src/game/timeMachine.ts:38` (`stopOf`), `:226-240` (`arriveInPast`: `structuredClone(snapshot)`), `src/game/save.ts:242-247, 270-287` (`StoredStop`, `readStop`: `chunks` is the id list the sweep uses), the Time Machine fixture of S2.

**Interfaces.**

```ts
// save.ts internals
interface Packed { lifeId: string; age: number; stop: TimeStop; record: string /* the head */; rec: string; chunks: [string, string][] /* id, plain text */ }
function pack(g: GameState): Packed                       // encodeSave(g): record = head, chunks = [...enc.chunks]
async function unpackLegacySnapshot(g: GameState, lifeId: string, b: SnapshotBackend): Promise<GameState | null>   // the v4.1.1 layout: log ids and worldEconomy frames
// loadSnapshot(lifeId, age): record -> JSON -> isChunkedHead ? assembleSave via the backend chunks : unpackLegacySnapshot; then migrateSave(game, { versions }); 'newer' or 'invalid' gives null
```

**Behaviour.** `pack` calls `encodeSave(g)` and stores its head as the snapshot record and each chunk under `chunkKey(lifeId, id)` (`save.ts:551`, `l|<lifeId>|<id>`): identical chunks across snapshots (the same decade of log, an unchanged shard) are one stored copy, because the id is the content hash, so the sweep (`save.ts:632-636`) and the index (`StoredStop.chunks`) work unchanged. The encoder's caches make the main save and the snapshot share one stringify per year. `loadSnapshot` fetches `neededChunkIds(head)`, a missing or hostile chunk makes the snapshot unreadable (null, so `forgetStop` runs, `ui/store.ts:314`), because a snapshot with a lost economy is not "exactly the life as it was". A legacy record (no `chunks` key, `log` an array of ids) goes through `unpackLegacySnapshot`. Both paths end in `migrateSave`: a schema-2 snapshot is migrated, a current one is left untouched (`from` 3 changes no byte), a `newer` one is null.

**Steps (test first).**
1. Write `test/time-machine-v3.test.ts` (red). Cases: (a) the F39 case: restore the schema-2 snapshot of the S2 fixture (seed a memory snapshot backend and the index from `tm-v4.1.1.json.gz`): the restored game has `schemaVersion` 3, `isLoadableGame`, plays a year, and its `JSON.stringify` equals the fixture's `states[age]` with `schemaVersion` set to 3 and nothing else different (the diet of S10 changes `previous`, so this assertion is written as "equals after migrateSave of the fixture state", computed in the test with `migrateSave(JSON.parse(states[age]))`); a snapshot whose `schemaVersion` is 4 restores as null; (b) a current snapshot (taken in the test by `takeSnapshot`) restores with `JSON.stringify` equal to the state at snapshot time (the property `test/time-machine.test.ts:210-212` already asserts, now through the chunk path); (c) the fork: `arriveInPast(from, snapshot)` of a restored snapshot saved with `saveGame`, reloaded with `loadGame`, gives JSON equal to the arrived state ("reload and Time Machine fork give identical JSON"); (d) sharing: ten snapshots of a 24-year life store each completed log decade once (count stored keys with a `log.` id), and an unchanged `flags.worldEconomy` root across a mid-year snapshot pair stores one world chunk; (e) a snapshot of a life with a synthetic `world` shard restores it; (f) a missing chunk, a hostile chunk and a chunk with a wrong sum each give null and leave the other snapshots intact; (g) every stored chunk of 1,000 characters or more is gz2 when `CompressionStream` exists; (h) `forgetFuture`, `forgetStop`, `startTimeline` sweeps still remove exactly the chunks no stop references.
2. Update `test/time-machine.test.ts:223-224`: the old assertion "world frames (`world.` keys) number `TIME_MACHINE_STOPS + 1`" described the v4.1.1 frame sharing (this year's closing world is next year's `previous`); there is now one `world.<sum>` chunk per snapshot because the world changes every year and `previous` is gone (S10). Set the expected count to what the new rule gives (at most `TIME_MACHINE_STOPS`), keep the lines 219-222 and 226 assertions (one record per stop, gz2 records, index summary), and put the reason in the commit message. Convert any pinned `seed:` in the file to `findSeed(pred)`.
3. Rewrite `pack`, `writeSnapshot`'s compression rule, `loadSnapshot`, add `unpackLegacySnapshot`. Replace `hashText` by the `textSum` import.
4. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/time-machine-v3.test.ts test/time-machine.test.ts test/save-chunk-store.test.ts test/save-codec.test.ts`.
5. Commit: `git add src/game/save.ts test/time-machine.test.ts test/time-machine-v3.test.ts`, message "R2-S9 K.5 and F39: snapshots are head plus shared chunks, restores pass through migrateSave; world frame count 11 becomes at most 10 because previous is gone".

**Acceptance proved.** F39 (a schema-2 snapshot restores through `migrateSave`); the Time Machine fixture restores; a fork reloads to identical JSON; snapshots share unchanged chunks; no snapshot restores with a lost part.

**Size.** Source about 720 (the rewrite is bigger than the old `pack`; about 120 lines of old restore code move), tests about 650.

**Risks.** Old snapshots in the field use the v4.1.1 layout (record with `log: string[]` ids and `worldEconomy.countries` as `world.<hash>` ids): the legacy restore must stay byte-for-byte what it was, and the fixture test is its guard. The Time Machine's localStorage fallback budget is 1.5M characters (`save.ts:238`): the S12 probe prints snapshot characters at age 70 and must show at most the 45.9% of v4.1.1 (the digest figure). The snapshot index stores `chunks` ids per stop: with decade log chunks and one world chunk that is about 15 ids, smaller than today's per-year log ids (up to 80).

---

### R2-S10 A.K9: the save diet (`previous` for the countries that matter, 16 years of history)

**Goal.** Pay for the world chunk. `worldEconomy.previous` (562 KB of 1.82 MB at age 80, a copy of last year's 102 countries) shrinks to the countries any year-minus-one reader can ask about, and `history` goes from 32 to 16 years (456 KB to about 228 KB). The first real use of a slice `migrate`.

**Items covered.** A.K9 (drop `worldEconomy.previous` or keep only the fields its readers use; history 32 to 16), acceptance "saves 20 to 30% smaller".

**Files.**
- Create: `src/game/economy/focus.ts` (about 160 lines), `src/game/economy/slice.ts` (about 130: the economy slice with `version: 2` and its `migrate`), `test/economy-diet.test.ts`.
- Modify: `src/game/economy/model.ts` (`economyState` 149-175: line 164 `rows.slice(-32)` becomes `slice(-HISTORY_YEARS)`; line 162 keeps reading whatever countries are present), `src/game/economy/index.ts` (`yearlyEconomy` 24-52: line 34 `previous: opening` becomes `previous: pruneToFocus(opening, economyFocus(g))`, line 43 `slice(-32)` becomes `slice(-HISTORY_YEARS)`), `src/game/save-slices.ts` (import `./economy/slice` so the registration happens; the `flags.worldEconomy` row's version becomes 2), `test/probe-life.test.ts` (line 12), `test/living-economy.test.ts` (line 142), `test/world2-trade-invariants.test.ts` (line 153), `test/world2-performance.test.ts` (line 94), `test/save-v3-schema.test.ts` (case (c) of S2).
- Reads (the readers of the previous-year frame, verified by grep): `economy/model.ts:185` (`economyOf` returns `previous[country]` when `year` is last year: the whole `CountryEconomy`, and 40 call sites in `business/`, `investments.ts`, `landlord.ts`, `npc-lives.ts` pass a `year`), `economy/index.ts:74` (`economyMarketFactor`: only `housing` and `market`, and line 76 already falls back to the history point of that year, which carries the same two fields), `nation/yearly.ts:107` (the State of the Nation report: the player's own country), `business/economic-actors.ts:147-148` (`previousRivals`, separate, untouched here).

**Interfaces.**

```ts
// src/game/economy/focus.ts  (imports ../world and types only: no business, no cycle)
export const HISTORY_YEARS = 16
/** Every country a reader of last year's frame can name: residence, birth country, citizenships, immigration, plus every string equal to a country id anywhere in character, people and assets, and in every flag except worldEconomy (a company's countries, outlets, holdings, houses, politics). A superset on purpose: an extra country costs about 5 KB. At most 40 ids. */
export function economyFocus(g: Readonly<Pick<GameState, 'character' | 'people' | 'assets' | 'flags'>>): ReadonlySet<string>
export function pruneToFocus<T>(frame: Readonly<Record<string, T>>, focus: ReadonlySet<string>): Record<string, T>   // keeps the focus ids in the frame's key order
```

`economy/slice.ts` registers `defineSlice({ key: 'flags.worldEconomy', version: 2, chunk: 'world', write: 'replace', caps, normalize, migrate })`; `migrate(from, json, game)` for `from < 2`: a copy of the object with `previous` pruned to `economyFocus(game)` (residence country always kept) and every `history[id]` cut to the last `HISTORY_YEARS` points; idempotent; a non-object is returned as is for the reader to reject.

**Steps (test first).**
1. Write `test/economy-diet.test.ts` (red): (a) `economyFocus` contains residence, birth country, citizenships and immigration country, the countries of a business's outlets (a 3-country company built like `test/probe-life.ts:49-65`), a house in another country, a held foreign security (`details.home`), and excludes a country nothing mentions; at most 40 ids for the heavy fixture's life; the walk is bounded (a 200,000-node synthetic flag does not run it past 50 ms); (b) the migration on the v4.1.1 heavy fixture: `previous` holds only the focus countries (fewer than 40), `history` rows at most 16, the `flags.worldEconomy` text is at least 35% shorter than before (about 0.76 MB of 1.73 MB: `previous` 562 KB less a focus remainder of about 30 KB, history 456 KB to 228 KB), and migrating twice gives equal JSON; (c) **the equivalence probe**: two copies of one 12-year life (companies in three countries, a foreign REIT, one emigration) are aged, one normally and one with `economyFocus` spied to return every country: the JSON of the two games is identical once `flags.worldEconomy.previous` is removed from both, and the focus game's `previous` equals the full one restricted to its keys (this proves the pruning is invisible to every reader the life exercises; it is the safety argument for dropping data, so keep it at 12 years and three seeds from `findSeed`); (d) the documented fallback: `economyOf(g, 'zz-unrelated', g.year - 1)` is `initialCountry` (the existing missing-previous behaviour, `economy/model.ts:186-195`), `economyMarketFactor` for last year in an unrelated country still returns the history point's value; (e) hostile history of 40 rows normalizes to 16, hostile `previous` with unknown ids is dropped as today; (f) `yearlyEconomy` stays idempotent by its year stamp (`economy/index.ts:28`): two calls give equal JSON; (g) the first `previous` after the migration still supports `economyMarketFactor(g, 'us', g.year - 1)` equal to `previous.us.market`.
2. Update the pinned numbers, each for a reason that goes in the commit message: `test/probe-life.test.ts:12` asserted `Object.keys(previous).length > 100` (the old copy of every country): it now asserts the residence country is present and the count is at most 40 (and its pinned `seed: 226` at line 18 moves to `findSeed`, the file being touched); `test/living-economy.test.ts:142` and `test/world2-trade-invariants.test.ts:153` assert `history.us` has length 32: now `HISTORY_YEARS`; `test/world2-performance.test.ts:94` tightens `<= 32` to `<= HISTORY_YEARS`; `test/living-economy.test.ts:43,146` keep their assertions (the life lives in `us`) and must still pass; S2's case (c) changes from "more than 100 previous countries" to the migrated expectation.
3. Create `focus.ts` and `slice.ts`; edit the two economy files and `save-slices.ts`.
4. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/economy-diet.test.ts test/probe-life.test.ts test/living-economy.test.ts test/save-v3-schema.test.ts test/world2-trade-invariants.test.ts test/save-slices.test.ts test/architecture.test.ts test/heir-world-flags.test.ts` and, separately, `/Users/saeed/projects/anotherlife/wt/bin/vt test/world2-performance.test.ts test/world2-reports.test.ts test/world2-banking.test.ts test/time-machine-v3.test.ts`.
4b. Two canaries record the `economy` slice and this task moves it on purpose (`previous` pruned, history 16): wave 0's `test/fixtures/r2-parity.json` and the Kernel track's `test/fixtures/kernel-parity.json` (both are on the merged base by then). Run `vt test/r2-codemod-parity.test.ts test/kernel-parity.test.ts`: each must fail on the `economy` digests only (a failure on `rng` or any other slice is a real change of play: stop and find it). Then `R2_PARITY_RECORD=update vt test/r2-codemod-parity.test.ts` and `RECORD_KERNEL_PARITY=1 vt test/kernel-parity.test.ts`, check with `git diff --stat` that only digests of `economy` changed, and put "moved economy: previous pruned to the focus countries, history 32 to 16" in the commit message. Platform's golden file is regenerated by its R2-P11, after this track.
5. Commit: `git add src/game/economy/focus.ts src/game/economy/slice.ts src/game/economy/model.ts src/game/economy/index.ts src/game/save-slices.ts test/economy-diet.test.ts test/probe-life.test.ts test/living-economy.test.ts test/world2-trade-invariants.test.ts test/world2-performance.test.ts test/save-v3-schema.test.ts test/fixtures/r2-parity.json test/fixtures/kernel-parity.json`, message "R2-S10 A.K9: previous kept for the focus countries only, history 32 to 16 years; previous had 102 countries, history 32 rows pinned in three tests".

**Acceptance proved.** The world economy loses about 0.8 MB at age 80 (562 KB of `previous` less about 30 KB kept, 228 KB of history); the v4.1.1 heavy fixture's `flags.worldEconomy` is at least 35% smaller after migration; no reader the probe life exercises sees a difference.

**Size.** Source about 380, tests about 550.

**Risks.** "Keep only the fields its readers use" is not decidable by grep: `economyOf` returns a whole `CountryEconomy` and about 40 call sites pass a year, so this plan keeps the whole frame for the countries a reader can name and nothing for the rest, and proves it with the equivalence probe instead of an assumption. The one behaviour change is for a reader that asks last year's frame of a country with no tie to the player: it gets the baseline instead of the true value (the existing fallback). A country that becomes relevant mid-year (the player moves in a year hook after `yearlyEconomy` ran) has no previous frame until the next year; the focus is computed at the top of the year step, so a country entered by an action before the age-up is in. `economyFocus` costs a walk of the core once a year (about 5 ms); the S12 perf probe counts it. Platform's `economy` golden digest moves; that is expected and noted in the lead actions.

---

### R2-S11 K.5 (j): shape tables for the big world slices (the columnar lever)

**Goal.** Bring the world chunk under 1 MB raw once the registry shards are added. Key names are 53% of the bytes of a late save (digest K): `packShapes` replaces the key list of a repeated object shape by a table entry, so a country, a sector row, a history point or a rival stores its values only.

**Items covered.** K.5 ("world ... columnar"), acceptance "world at most 1 MB raw and 600 KB gzipped".

**Files.**
- Create: `src/game/kernel/shapes.ts` (about 260 lines, a leaf), `test/save-shapes.test.ts`.
- Modify: `src/game/kernel/slices.ts` (`SliceDef` gains `readonly pack?: 'shapes'`), `src/game/save-codec.ts` (encode: a slice with `pack: 'shapes'` is packed once, after its identity cache miss, and the cached text is the packed text; decode: `unpackShapes` before `normalize`; the manifest `len` and sum are of the packed text), `src/game/economy/slice.ts` (`pack: 'shapes'`), `src/game/save-slices.ts` (`world` sub-slices default to `pack: 'shapes'` when they are plain objects of records).
- Reads: `src/game/economy/actors-state.ts:37-44` (rivals have 6-snapshot histories), `economy/model.ts:30-52` (`CountryEconomy` shape).

**Interfaces.**

```ts
// src/game/kernel/shapes.ts
export interface ShapeLimits { readonly maxNodes: number; readonly maxShapes: number; readonly maxKeys: number; readonly maxKeyChars: number }
export const DEFAULT_SHAPE_LIMITS: ShapeLimits   // 400,000 nodes, 256 shapes, 128 keys, 64 chars
export function packShapes(value: unknown): unknown            // { "$s": [[...keys], ...], "$v": tree }; a value with nothing worth packing is returned as { "$s": [], "$v": value }
export function unpackShapes(packed: unknown, limits?: ShapeLimits): unknown   // throws a plain Error on anything malformed; the codec turns a throw into a hostile chunk
```
Format: in `$v`, an object whose key list (in iteration order) has at least 4 keys and appears at least 3 times in the value becomes `{"$":<shape index>,"v":[values...]}` (each value packed recursively); everything else is unchanged. An object that has an own `$` key, or the key `__proto__`, is never packed (a wrapper `{"$":-1,"v":original}` escapes an own `$` key). Arrays and primitives are untouched.

**Steps (test first).**
1. Write `test/save-shapes.test.ts` (red): (a) round trip is exact (`JSON.stringify` equal) for a country frame from `initialCountry('us', 2030)` repeated for 102 ids, for a rivals list, for 16-point histories, for a value with nothing packable, for nested arrays of objects, objects with integer-like keys, unicode keys, and a key named `$`; (b) the packed text of 102 countries is at most 60% of the plain text (key names are about half of it; the digest measured 56% off the columnar fields, and each wrapper costs 13 characters against 40 or more of key names); (c) hostile packed input never throws anything but `Error` and never allocates past the limits: unknown shape index, `v` shorter or longer than the shape, a shape with a duplicate key, a key `__proto__`, 257 shapes, a 129-key shape, nesting 200 deep, a 10-million-node expansion built from 30 nested wrappers sharing one shape (the node counter stops it), a non-object input; (d) the unpacked result has no polluted prototype; (e) the codec: a slice with `pack: 'shapes'` gives a smaller chunk than the S3 baseline for the same game, the round trip of S4 still equals `inlineSave`, a hostile packed chunk is a lost chunk (`hostile`), not a crash; (f) packing cost: packing the economy of the heavy probe life takes at most 25 ms times `machineFactor()` (`test/perf-kit.ts`, created in S8) and unpacking at most 25 ms times the factor.
2. Implement `shapes.ts` and the codec hooks. Add `pack` to `SliceDef`.
3. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-shapes.test.ts test/save-codec.test.ts test/save-slices.test.ts test/save-chunk-boot.test.ts test/architecture.test.ts`.
4. Commit: `git add src/game/kernel/shapes.ts src/game/kernel/slices.ts src/game/save-codec.ts src/game/economy/slice.ts src/game/save-slices.ts test/save-shapes.test.ts`, message "R2-S11 K.5: shape tables cut the world chunk's key names".

**Acceptance proved.** The economy's stored text is at most 60% of its plain JSON; a hostile packed chunk cannot allocate past the limits.

**Size.** Source about 450, tests about 450.

**Risks.** Decode is the attack surface: every limit is checked before the allocation it guards. Packing changes the chunk text but not the in-memory state (`moneyContextOf` at `core.ts:187-195` still reads `flags.worldEconomy.countries` unpacked). gzip already removes most repeated keys, so the win is raw size and parse time, not gzip bytes; the 600 KB gzip budget is met by the diet alone.

---

### R2-S12 K.5 and A.K9: the acceptance probes, the world adapter, the node-cap review and the docs

**Goal.** Prove the budgets on a 50-year life, reconcile the slice table with the shards Ledger-world actually merged, price the whole pipeline, and write the track's doc.

**Items covered.** The roadmap's save acceptance (50-year probe budgets, per-tap, light `ageUp`, 20 to 30% smaller, identical JSON), A.K9 (node-cap review, perf probe), "one new fixture per release".

**Files.**
- Create: `test/save-budget.test.ts`, `test/save-perf.test.ts`, `docs/SAVE.md` (about 170 lines). Both tests import `machineFactor` from `test/perf-kit.ts` (S8).
- Modify: `scripts/save-size.ts` (the `rowsOf` table at 75-89 gains one row per chunk: core, world, each log decade, each entity shard, with raw and gzip), `src/game/save-slices.ts` and, only if the rebase check below finds them, `src/game/world/*` (one additive hunk).
- Reads: `test/probe-life.ts:33-73`, `scripts/save-size.ts:26` (`LONG_LIFE`) and `:46-58` (`pickLife`), the S2 heavy fixture.

**Rebase check (first step).** After rebasing on the merged Ledger-world and Kernel tracks (both exist by the merge order: wave 0, Ledger-world, Kernel, Save, Platform): `ls src/game/world src/game/modules src/game/kernel`. (1) Ledger-world's shard API is known from its plan (`ensureWorld`, `readWorld`, `worldShard`, `registerShard`, `normalizeWorld`, `shardNames` in `src/game/world/state.ts`; `worldShard` is a pure reader, `ensureWorld(g)` is the writer door, and rule 7 of that plan says every shard except `ledger` is written by replacing its root). Shards are plain properties of `g.world`, so they are already `world.<name>` replace sub-slices (S1); `world.ledger` is the explicit core and `inplace` row of S1. Do these steps: (a) in `save-slices.ts` import `./world/shards` (Ledger-world's registration hub: it registers `ledger`, `people`, `firms`, `homes`, `holdings`, `lod` and, after R2-K7, imports `./facts`) for effect, so `normalizeWorld` keeps every shard in a process that has not loaded `modules/index.ts` (R2-K7's load-order rule), and switch the `world` and `world.ledger` `normalize` functions to arrows over `normalizeWorld` (from `./world/state`) and `normalizeLedger` (from `./kernel/ledger`) (an arrow, not the bare name, so R2-K4's eager-read ratchet stays quiet); (b) read `shardNames()` and declare as `chunk: 'entities'` any shard that is a `Record<string, object>` in ascending key order and changes on player actions; none of Ledger-world's R2 shards has that shape (their rows are arrays), so expect none, and leave the rest in the `world` chunk; (c) run the S8 cases (b), (c), (g) again with the real shards (`people`, `facts`, `lod`, and `ledger` writable) and a 40-year probe life through `cloneForAct`: a TypeError from a shard writer is a Ledger-world bug against its rule 7, fixed in that shard's file with a regression test, never by unfreezing; (d) if a shard that changes on every tap (the bytes-per-tap test names it) sits in the `world` chunk, move it to the core the same way `world.ledger` is. (2) Add the guard test: for every module def in `src/game/modules/index.ts` with a `slices` array, each entry passes `hasSlice` and, for a `world.<name>` entry, `<name>` is in `shardNames()` (`factsModule` declares `world.facts`). (3) If a file named above does not exist when this task runs, say so in the commit message and skip only the steps that need it; nothing else depends on them.

**Steps (test first).**
1. Write `test/save-budget.test.ts` first: it is the budget gate, and whichever assertion fails names the lever. Lives built once in `beforeAll` (one `it` per assertion, so a failure names the budget): the **heavy** life `probeLife({ seed, birthYear: 1950, businesses: 12, years: 50, keepAlive: true })` with `seed` chosen by `findSeed` as the first one alive at the end (the same rule as `scripts/save-size.ts:46-58`), and the **light** life (`businesses: 0`, same years). Assertions on `encodeSave`: (a) `head` at most 400,000 characters (core), heavy and light; (b) the `world` chunk text at most 1,000,000 characters and its gzip (`gzipSync(text, { level: 6 })`, as `scripts/save-size.ts:69-73`) at most 600,000 bytes; (c) bytes written per tap: through `memoryChunkStore()` and `saveRecord`, a 10-tap sequence of typical actions between two age-ups writes the head each tap and at most 150,000 characters of chunks in total (a shard that changes per tap and was left in the `world` chunk fails here: the number names it); (d) reload identity: `JSON.stringify(assembleSave(...).game)` equals `inlineSave(g)` for both lives; (e) the whole thing is smaller than v4.1.1: take the heavy v4.1.1 fixture, `migrateSave` it, `encodeSave`, and require total stored characters (head plus chunks) at most 0.8 times the fixture's raw length and gzip (head and each chunk gzipped separately and summed) at most 0.8 times the fixture's gzip, the roadmap's "20 to 30% smaller"; (f) node-cap review: `countNodes` of the assembled heavy game is at most 250,000 (half of `MAX_JSON_NODES`, `save-schema.ts:60`), and each chunk's nodes are at most its slice caps; the review's outcome (cap stays 500,000, per-chunk caps from the table of S1) is written in `docs/SAVE.md`; (g) the Time Machine: ten snapshots of the heavy life at ages 61 to 70 cost at most the characters v4.1.1 used (record the v4.1.1 figure from the TM fixture's scale in a comment; the assertion is at most 0.459 times the 1.5M localStorage budget, the digest's 45.9%); (h) the guard test of the rebase check.
2. Write `test/save-perf.test.ts`: on the light life at age 40 to 50, 12 `ageUp`s each timed after 3 warm-up years; the median `ageUp` divided by `machineFactor()` is at most 160 ms (desktop budget, hard), the median of `cloneForAct` + `ageUp` + `encodeSave` is at most 200 ms times `machineFactor()`, and the mobile line is printed, not asserted: median times 1.56 (250/160) with the sentence "mobile target 250 ms". Also: (i) `economyFocus` takes at most 15 ms times the factor on the heavy life; (j) loading the heavy fixture (decode, migrate, `isLoadableGame`) takes at most 400 ms times the factor.
3. Update `scripts/save-size.ts` (chunk rows). Write `docs/SAVE.md`: the formats (v2 plain, v3 inline, v3 head and chunks), the head layout and chunk grammar, how a slice is declared and the `replace` rule, the hostile policy, the budgets and how to read the probe, how to add a fixture each release (the generator and the git-archive recipe of S2), and the contract in section 2 of this plan. No dashes of either kind.
4. Print the bundle figure: `/Users/saeed/projects/anotherlife/wt/bin/vb` then `node scripts/bundle-budget.mjs`; put the gzip delta of this track (build before and after is not needed: the lead's baseline is the v4.0.3 figure; report the number and the lines this track added) in the PR text. This is a report, not a gate.
5. Run `/Users/saeed/projects/anotherlife/wt/bin/tc` and, in two batches, `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-budget.test.ts test/save-perf.test.ts` and `/Users/saeed/projects/anotherlife/wt/bin/vt test/save-codec.test.ts test/save-chunk-store.test.ts test/save-chunk-boot.test.ts test/time-machine-v3.test.ts test/save-clone.test.ts test/world-flags.test.ts test/voice-guards.test.ts`. The opt-in fuzz smoke of S8 step 4 runs once more here with `FUZZ_YEARS=40`.
6. Commit: `git add test/save-budget.test.ts test/save-perf.test.ts scripts/save-size.ts docs/SAVE.md src/game/save-slices.ts` plus any `src/game/world/*` file the adapter touched, message "R2-S12 K.5 and A.K9: 50-year budgets, per-tap and ageUp probes, node-cap review, SAVE.md".

**Acceptance proved.** Core at most 400 KB; world at most 1 MB raw and 600 KB gzipped at 50 years; bytes written per tap bounded; saves at least 20% smaller than v4.1.1 on the same life; reload gives identical JSON; light `ageUp` at most 160 ms desktop-equivalent; the node cap reviewed.

**Size.** Source about 470 (adapters 160, script 140, docs 170), tests about 650.

**Risks.** The 1 MB world assertion depends on what the registry holds at 50 years (Ledger-world's budget is 250 to 400 KB at its caps): if it fails, the number names the shard and the lever is S11's `pack` on that shard, or moving it to an entity chunk. Timing assertions on a shared CI runner are noisy: the calibration factor handles a uniformly slow machine, not a noisy one, so each timed assertion uses the median of at least 12 runs. If `worldShard` cannot be wrapped without changing Ledger-world's contract, stop and report: that is a cross-check decision, not a local fix.

---

## 4. Plan vs code (where the roadmap and the code differ, and what I did)

1. **`pack()` is at `save.ts:578`, not 572,** and it special-cases only `flags.worldEconomy` v1 and v2: `countries` and `previous` as `world.<hash>` frames, `history` as one frame per year (`save.ts:589-609`). With `previous` gone (S10) that frame sharing has nothing left to share, which is why S9 replaces it by the codec's content-addressed chunks instead of generalizing the frame code.
2. **The gz2 codec is already wired for three paths** (`save-store.ts:486` for every asynchronous main-save write, `save-hydrate.ts:196` for the import, `save.ts:650-651` for snapshots), with a 100,000-character floor on the main save. "Wire gz2 for the main save" therefore means: IndexedDB chunk records and the chunked head use it (S6), and a hostile gz2 claim is bounded per chunk (S7's `maxChars`). localStorage chunks stay plain: its API is synchronous and cannot wait for `CompressionStream`.
3. **The main save is one record under `SAVE_KEY` today** (`save-store.ts:207`, `save-backends.ts:5`), and the store, the boot, the quarantine and the tests treat it as one opaque string. Chunking the storage layer itself would rewrite about 1,400 lines of tested state machine. The plan keeps the string queue and adds a side table of chunks beside it (S6), and makes the head valid JSON with `schemaVersion: 3` so an older build files it as `newer` (`save-schema.ts:48` returns before `isGameShell` at `:50`), never `damaged`.
4. **Digest K's "core 320 KB: clone 3.8 ms, stringify 2.3 ms" includes the whole life log** (2.14 MB total minus the 1.82 MB economy = 320 KB, of which the log is about 214 KB and assets about 85 KB). This plan keeps only the current log year in the core and moves completed years to decade chunks, so the core is about 100 to 130 KB and the per-tap numbers should come in under the digest's; the 400 KB core budget has a wide margin.
5. **"Keep only the fields its readers use" is not decidable by reading.** `economyOf` (`economy/model.ts:182-196`) returns the whole `CountryEconomy` for last year, and about 40 call sites pass a year (`business/gamestudio.ts`, `business/bank-model.ts`, `investments.ts:2435`, `landlord.ts:162`, among others). Only three code sites read `previous` directly (`model.ts:185`, `index.ts:74`, `nation/yearly.ts:107`). S10 keeps whole frames for the countries a reader can name and proves invisibility with a twin-run probe.
6. **`economyMarketFactor` does not need `previous`:** its fallback at `economy/index.ts:76` reads the history point of the year, which holds the same `housing` and `market`. Only the `economyOf` fallback and the State of the Nation report need the frame.
7. **"World at most 1 MB" is not reachable by the diet alone.** After S10 the economy is about 1.0 MB (countries 562 KB, history about 228 KB, rivals 239 KB, a focus `previous` of about 30 KB) and design 4.2.8 adds 250 to 400 KB for the registry at its caps. Hence S11 (shape tables, expected 40 to 50% off the economy's raw size). gzip is met by the diet alone.
8. **Ten tests pin `SAVE_SCHEMA` at 2** (`devices-save`, `ai-bench-save`, `sector-state`, `model-state`, `music-state`, `silicon-state`, `wave-stocks-story`, `notice-acceptance`, `tech-waves-wiring`, `inbox-state`), plus `inbox-state.test.ts:600` (`schemaVersion` 2) and `save-store.test.ts:1220` (3 as "a later version"). The roadmap's "SAVE_SCHEMA stays 2 until this lands" was true as a release statement in each; S2 moves them and says why.
9. **The IndexedDB database version must stay 1** (`save-backends.ts:132`). A version bump to add a `chunks` store would make an older build fail to open the database (VersionError) and fall back to localStorage where it sees no life. Chunks live in the existing `saves` store under a prefixed key.
10. **Time Machine snapshots stay outside the main save** (own database `anotherlife-timemachine`, `save.ts:239-240`) and keep their own backend and queue; only the packing format changes. The roadmap's "pack() generalized to any `world.*` shard" is delivered by using the same encoder, so a shard declared once is chunked in both.
11. **Draft sharing needs frozen roots in every build.** `act()` (`ui/store.ts:425-440`) clones the whole state per tap, and the economy root's normalized view is cached in a `WeakMap` by root identity (`economy/model.ts:148`): today the first economy read after every tap re-normalizes 102 countries because the clone has a new root. Sharing the root fixes both costs, and the freeze is what makes identity a sound cache key. The writers I checked replace roots (`storeEconomy` 177, `recordEconomicActivity` `economy/index.ts:81-109`, `enactEconomicPolicy` 111-118, `supply-resilience.ts:26-39` builds a copy); S8's tests and the fuzz smoke widen that evidence.
12. **`test/world-flags.test.ts` ratchets spreads of `flags`** (`world-flags.ts:163-174`): `save.ts` is listed at 3 and `save-schema.ts` at 4, and a new file with a spread of `g.flags` fails the test until it is added. S3 and S8 each add one entry. S9 may lower the `save.ts` count when it deletes the old `pack` spread at `save.ts:589`: lower the figure, as the file's header asks.
13. **R1 already wired the IndexedDB boot** (`main.tsx:15`, `FLAGS.idbSaves` default true in `flags.ts`), so K.5a is not in this track. Chunks therefore reach players on IndexedDB first; localStorage players (IndexedDB missing, refusing or hanging) get the same format through the sync chunk store.
14. **There is no v4.0.2 fixture in the repo** (`test/fixtures/` holds `save-v1.json.gz` from v2.4.0 and unrelated JSON), although `test/inbox-state.test.ts:596` is named after one. S2 makes it, plus the heavy v4.1.1 save that the size and migration-time acceptance need, from `git archive` of the two tags.
15. **`CLAUDE.md` does not exist in the repo** (also noted by the R1 plan); the rules the tasks need are restated in section 1.
16. **Bundle budget.** `scripts/bundle-baseline.json` allows 60,000 bytes of gzip growth for all of R2 (`scripts/bundle-budget.mjs`); this track is about 5,600 source lines, roughly 30 to 40 KB, an estimate S12 replaces with a measurement.

## 5. Assumptions and open points

1. **No flag for save v3.** The roadmap says SAVE_SCHEMA becomes 3 and v3 is written; I read that as a cutover with no switch (S2 bumps the constant, S6 changes the writer). Once a browser holds a v3 record only a build that reads v3 can use it, so a flag that turns the writer off would write the inline form (still v3), not v2; it would save the chunk code path only. If the lead wants that, it is one `FLAG_DEFS` key (the R1 rule that "these eight keys are the complete set" is the lead's to lift) read in `saveGame`.
2. **`ModuleDef.slices` (Kernel).** I assume it is `readonly string[]` of slice keys the module owns and writes. The Kernel track merges before this one, so it cannot import `kernel/slices.ts`; the guard test in S12 is the first place the two meet. If the registry wants a different shape (for example slice defs themselves), only the S12 test and a re-export change.
3. **Write discipline of `g.world` shards (Ledger-world).** Resolved by the cross-check: rule 7 of the Ledger-world plan says every shard is written by replacing its root, with `ledger` the one in-place exception; R2-S1 declares `world.ledger` as a core and `inplace` slice (cloned every tap, never frozen), and each Ledger-world shard writer carries a test on deep-frozen shards. S12 still re-runs S8's cases with the real shards.
4. **Which shards change per tap.** Resolved for the ledger by the same row (it rides in the core, so the world chunk id does not change per tap). `facts`, `people`, `firms`, `homes`, `holdings` and `lod` change at most once a year or on a rare action. The S12 bytes-per-tap test remains the detector for any later shard.
5. **Entity shards in R2.** The mechanism (S3 and S4, sorted-key records, `fnv(key) % shards`) ships tested with a synthetic slice; it adopts a real registry shard only if S12 finds one of the right shape. Columnar encoding of entity rows beyond shape tables waits until the registry shards exist (design 13.5, last bullet).
6. **`LOG_TAIL = 1` and `LOG_GROUP_YEARS = 10`** are my choices; a larger tail costs per-tap clone bytes, a smaller group costs more chunk records (at most 13 for a 130-year life, far under `MAX_CHUNKS`).
7. **Fixture weight.** Four binary fixtures, about 400 KB (the heavy v4.1.1 life is about 250 KB). The roadmap asks for one fixture per release and for the Time Machine and IndexedDB fixtures; the heavy one is what makes "20 to 30% smaller" and the load-time probe measurable against a real old save rather than a number in a comment. If the lead would rather not commit 250 KB, shrink it to 20 years and 4 companies (about 90 KB) and lower nothing else.
8. **Mobile factor.** The 250 ms mobile target is checked as desktop-equivalent milliseconds (measured, divided by a calibration factor) against the 160 ms desktop budget, and the mobile figure is printed with the 1.56 ratio; the digest's "phones are 3 to 5 times slower" is an assumption, not a measurement, and the lead's "year step at most 400 ms on a 2022 mid-range Android" is checked only by that ratio until a device run exists.
9. **Opus.** None. The two tasks most likely to stall a Sonnet agent are S6 (the store) and S7 (the boot); S6 has a marked split (sync path, then async queue), and S7's quarantine dump can ship in a follow-up commit if the notice copy needs the lead.
10. **Heirs.** `continueAsChild` (`life.ts:1143`) clones the whole state once and carries `worldEconomy` by whitelist (`life.ts:1533`); with `previous` pruned the heir keeps the pruned frame, which is correct (the focus is recomputed on the first year step). `schemaVersion` is copied with the clone, so an heir of a v3 life is v3.
