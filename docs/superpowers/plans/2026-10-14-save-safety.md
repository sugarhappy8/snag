# Save safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A life is never silently lost: the main save moves to IndexedDB with gzip, carries a schema version with a migration chain, and any record that can't be read is kept byte-exact and offered back from Home.

**Architecture:** Four new modules under `src/game/`: `save-schema.ts` (migration chain, plus the structural check moved out of `save.ts`), `save-backends.ts` (IndexedDB, localStorage, memory), `save-quarantine.ts` (byte-exact copies of unreadable records) and `save-store.ts` (cache, write queue, hydrate, status). `save.ts` stays the public facade with unchanged `saveGame` and `loadGame` signatures. IndexedDB writes are async and coalesced. The localStorage fallback keeps today's synchronous plain-JSON behavior, so existing tests keep passing untouched. The economy state does not change.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 5 (node environment), native `CompressionStream` through `src/game/snapshot-codec.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-save-safety-design.md`

## Global Constraints

- `npm run typecheck`, `npm test` and `npm run build` stay green. No `any`, no `@ts-ignore`, no new dependencies, no `Math.random` in `src/game`.
- Old saves must still load. The key `anotherlife.save.v1` is never renamed. `GAME_VERSION` stays 1. `SAVE_SCHEMA = 2`.
- The economy state (`flags.worldEconomy`, including `previous`) is not changed by this plan.
- The game sends nothing anywhere: no network code, no `eval`, no `innerHTML`.
- Player-facing strings (Task 8 only) follow the v2.5 house style: contractions, plain sentences, no em-dashes, colons only for prices and labels, no disclaimers.
- One commit per task, on branch `claude/new-session-1vdxk8`, after typecheck and that task's tests pass. Every commit message ends with these two lines: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_019Jn6WVL2xH6BetgH1qFb78`. Push after Tasks 2, 5, 7 and 9. CI takes about 19 minutes, so run targeted tests in the loop and the full suite only in Task 9.
- Tests run with `npx vitest run <files>`. Typecheck is `npm run typecheck`. Test files are `.ts` (vitest includes only `test/**/*.test.ts`, so no JSX; use `createElement`). Tests that touch the save store call `resetSaveStoreForTests()` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`.

## Review Focus

Inputs the spec implies but its test list doesn't cover, most likely first. Each has a test in the task named.

- A save from a newer build whose shape this build doesn't know stays untouched, shows the `newer` notice, and is never called damaged or deleted (Tasks 2 and 6).
- A failed write that later succeeds clears the warning, and `loadGame()` returns the newest save, not the stale stored one (Task 5).
- `hydrateSaves()` called after the session already saved, or twice, must not replace the newer in-memory save with an older stored one (Task 6).
- First visit with empty storage, and with localStorage disabled: no notices, no crash, no Continue; disabled storage shows the existing "Progress isn't saved" warning (Tasks 5 and 6).
- `schemaVersion` that is a string, 2.5, NaN, 0 or negative is damaged and quarantined, never a throw (Task 2).

---

### Task 1: Baseline, probe life, size probe and the v2.4.0 fixture

**Files:**
- Create: `test/probe-life.ts`, `test/probe-life.test.ts`, `scripts/save-size.ts`, `docs/RELEASE-v2.5.0.md`, `test/fixtures/save-v1.json.gz`

**Interfaces:**
- Produces: `interface ProbeOptions { seed: number; birthYear: number; businesses: number; years: number }` and `function probeLife(opts: ProbeOptions): GameState` in `test/probe-life.ts`. It calls `createNewLife({ seed, year: birthYear })`, makes the character an adult as `fuzzBusiness` does in `test/fuzz-kit.ts` (queue cleared, age 30 with `g.year = birthYear + 30` because `createNewLife`'s `year` is the birth year, money 5e6, smarts 75, a licence, `bindMoneyContext`), founds `businesses` companies the way `addCompany` does in `test/asset-hooks.test.ts:26-37` (`newBiz`, `createBusinessAsset`, `g.assets.push`, `installManager`, `bestPlan`), using distinct ids from `INDUSTRY_IDS` for which `industryProblem(g, id)` is null in list order, then runs `years` times `g.queue = []; ageUp(g)`.

- [ ] **Step 1: Baseline.** Run `npm ci`, `npm run typecheck`, and `npx vitest run test/store.test.ts test/time-machine.test.ts test/gameplay-persistence.test.ts`. Expected: all clean. The full suite is not re-run here: CI's `test` job is already green on this base (PR #16, commit c5dc6e1) and takes about 20 to 25 minutes.
- [ ] **Step 2: Write the failing test** `test/probe-life.test.ts`, test `'builds an adult with the requested companies and a populated previous-year economy'`: `const g = probeLife({ seed: 7, birthYear: 1996, businesses: 2, years: 3 })`; assert `g.character.alive` is true, `businessAssets(g)` has length 2, and `Object.keys(economyState(g)!.previous).length` is greater than 100.
- [ ] **Step 3: Run it.** `npx vitest run test/probe-life.test.ts`. Expected: FAIL, module `./probe-life` not found.
- [ ] **Step 4: Implement `probeLife`** as above. Run the test again. Expected: PASS.
- [ ] **Step 5: Write `scripts/save-size.ts`** with the esbuild-and-node header used by `scripts/fuzz-engine.ts`. Default mode: for seeds 1 to 20, `probeLife({ seed, birthYear: 1926, businesses: 12, years: 70 })` (adult at 30, so age 100 at the end) until the character is alive, then print a table (label, raw characters, gzip bytes at level 6 from `node:zlib`, percent of raw) for the whole save, `flags.worldEconomy.countries`, `.previous`, `.history`, `log`, `assets`, and everything else, plus the seed used. `--fixture <path>` instead writes `gzipSync(JSON.stringify(probeLife({ seed: 7, birthYear: 1996, businesses: 2, years: 3 })))` to the path.
- [ ] **Step 6: Run the probe.** Bundle with `node_modules/.bin/esbuild scripts/save-size.ts --bundle --platform=node --format=esm --outfile=<scratchpad>/save-size.mjs`, then `node <scratchpad>/save-size.mjs`. If esbuild is not in `node_modules/.bin`, report it and use `npx --yes esbuild` for this step only. Create `docs/RELEASE-v2.5.0.md` with `# AnotherLife v2.5.0`, a `## Save safety` section and a `### Before (v2.4.0)` table holding the printed numbers and the seed.
- [ ] **Step 7: Write the fixture.** Run the script with `--fixture test/fixtures/save-v1.json.gz`. Check `gunzip -c test/fixtures/save-v1.json.gz | head -c 400` shows `"version":1` and `gunzip -c ... | grep -c schemaVersion` prints 0.
- [ ] **Step 8: Commit.** `git add test/probe-life.ts test/probe-life.test.ts scripts/save-size.ts docs/RELEASE-v2.5.0.md test/fixtures/save-v1.json.gz` and commit `test: save-size probe, v2.4.0 save fixture and baseline numbers`.

### Task 2: Schema version and migration chain

**Files:**
- Create: `src/game/save-schema.ts`, `test/save-schema.test.ts`
- Modify: `src/game/core.ts:21`, `src/game/types.ts:662`, `src/game/life.ts:710`, `src/game/save.ts`

**Interfaces:**
- Consumes: `test/fixtures/save-v1.json.gz` (Task 1).
- Produces, in `src/game/core.ts`: `export const SAVE_SCHEMA = 2`. In `src/game/save-schema.ts`:
  - `export const MIN_SCHEMA = 1`
  - `export type MigrationResult = { kind: 'ready'; game: GameState; from: number } | { kind: 'newer' | 'tooOld'; version: number } | { kind: 'invalid' }`
  - `export function migrateSave(raw: unknown, opts?: { minSchema?: number }): MigrationResult`
  - `export function isGameShell(value: unknown): value is Record<string, unknown>`, `export function isLoadableGame(value: unknown): value is GameState`, `export function migrateLegacyAi(g: GameState): GameState` (all three moved from `save.ts`).
  - `GameState.schemaVersion?: number` in `types.ts`; `createNewLife` sets `schemaVersion: SAVE_SCHEMA`.

- [ ] **Step 1: Write the failing tests** in `test/save-schema.test.ts`, with `fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString())`:
  - `'migrates the real v2.4.0 save and keeps it playable'`: `migrateSave(structuredClone(fixture))` has `kind: 'ready'`, `from: 1`, `game.schemaVersion === SAVE_SCHEMA`, `isLoadableGame(game)` true, and three iterations of `game.queue = []; ageUp(game)` leave `game.character.alive` true.
  - `'treats a missing schemaVersion as 1 and migrating twice changes nothing'`: the second `migrateSave(JSON.parse(JSON.stringify(first.game)))` returns `from: SAVE_SCHEMA` and a game whose JSON equals the first.
  - `'rejects an unusable schemaVersion as invalid without throwing'`: `it.each(['2', 2.5, NaN, 0, -1, null])` sets it on a clone of the fixture and expects `{ kind: 'invalid' }`.
  - `'reports a newer schema without touching it, even for an unknown shape'`: `const junk = { version: 1, schemaVersion: SAVE_SCHEMA + 1, extra: { nested: true } }`; result equals `{ kind: 'newer', version: SAVE_SCHEMA + 1 }` and `JSON.stringify(junk)` is unchanged.
  - `'reports tooOld below an injected floor'`: `migrateSave(clone, { minSchema: 2 })` equals `{ kind: 'tooOld', version: 1 }`.
  - `'returns invalid for non-objects and damaged shells'`: `it.each([null, 5, 'x', [], {}, { version: 1, character: {} }])` gives `{ kind: 'invalid' }`.
  - `'has a fixture for every schema below the current one'`: for each `v` from `MIN_SCHEMA` to `SAVE_SCHEMA - 1`, `existsSync(`test/fixtures/save-v${v}.json.gz`)` is true.
- [ ] **Step 2: Run them.** `npx vitest run test/save-schema.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Move the validators.** Cut from `save.ts` the constants at lines 15-21 and everything from `migrateLegacyAi` through `isLoadableGame` (lines 73-522) into `save-schema.ts` with no edits except `export` on the three functions above. Add `SAVE_SCHEMA` to `core.ts` next to `GAME_VERSION`, re-exported from `save-schema.ts`. Add `migrateSave` with this check order: not a plain object → `invalid`; `schemaVersion` absent → 1, present but not a positive safe integer → `invalid`; greater than `SAVE_SCHEMA` → `newer`; below `opts.minSchema ?? MIN_SCHEMA` → `tooOld`; `!isGameShell` → `invalid`; run the steps table keyed by source version (step 1 calls `migrateLegacyAi` and sets `schemaVersion = 2`); `!isLoadableGame` → `invalid`; else `ready`. Add the `schemaVersion` field and the `createNewLife` stamp. In `save.ts`, `loadGame` becomes `read(SAVE_KEY)` → `migrateSave` → `refreshRoyalCareers`/`refreshFamilyTalents` on `ready`, else null; `loadSnapshot` imports `isGameShell` and `migrateLegacyAi` from `save-schema.ts` for now; `save.ts` re-exports `migrateLegacyAi`.
- [ ] **Step 4: Run.** `npx vitest run test/save-schema.test.ts test/store.test.ts test/offline.test.ts test/royal-careers.test.ts test/gameplay-persistence.test.ts test/life.test.ts test/time-machine.test.ts` and `npm run typecheck`. Expected: PASS and clean.
- [ ] **Step 5: Commit** `feat: save schema version and migration chain`, then push.

### Task 3: Storage backends

**Files:**
- Create: `src/game/save-backends.ts`, `test/save-kit.ts`, `test/save-backends.test.ts`

**Interfaces:**
- Produces, in `save-backends.ts`:
  - `export const SAVE_KEY = 'anotherlife.save.v1'`
  - `export interface SyncSaveBackend { readonly kind: 'sync'; readonly name: 'local' | 'memory'; read(): string | null; write(record: string): boolean; remove(): void }`
  - `export interface AsyncSaveBackend { readonly kind: 'async'; readonly name: 'idb'; read(): Promise<string | null>; write(record: string): Promise<void>; remove(): Promise<void>; readonly overflow: { put(key: string, record: string): Promise<void>; get(key: string): Promise<string | null>; keys(): Promise<string[]>; remove(key: string): Promise<void> } }`
  - `export type SaveBackend = SyncSaveBackend | AsyncSaveBackend`
  - `export function memorySaveBackend(initial?: string): SyncSaveBackend`, `export function localSaveBackend(evict?: () => boolean): SyncSaveBackend`, `export function idbSaveBackend(factory?: IDBFactory, timeoutMs?: number): Promise<AsyncSaveBackend>` (defaults: `globalThis.indexedDB`, 3000).
- Produces, in `test/save-kit.ts`: `memoryLocalStorage(initial?: Record<string, string>): Storage & { data: Map<string, string> }`; `fakeIndexedDb(opts?: { failOpen?: boolean; hang?: 'open' | 'read'; failWrite?: boolean; corruptReadback?: boolean }): IDBFactory` (a hand-written fake of exactly the calls `idbSaveBackend` makes); `controlledBackend(initial?: string): AsyncSaveBackend & { writes: string[]; stored: string | null; settle(i?: number): void; fail(i?: number, err?: Error): void }` whose `write` returns a promise the test settles or rejects by hand and whose `overflow` is an in-memory map.

- [ ] **Step 1: Write the failing tests** in `test/save-backends.test.ts` (install `memoryLocalStorage()` with `vi.stubGlobal('localStorage', ...)`):
  - memory: `write('a')` is true, `read()` is `'a'`, `remove()` then `read()` is null.
  - local: `write('{"x":1}')` stores plain text under `SAVE_KEY` synchronously; with `setItem` throwing `QuotaExceededError` and an evictor returning false, `write` returns false and storage is unchanged; with an evictor that returns true once, the evictor is called exactly once and `write` returns true; `read()` is null when `getItem` throws.
  - idb: write then read round-trips and `remove` clears; `overflow.put('bad-1', 'x')` leaves `read()` null and `overflow.keys()` equal to `['bad-1']`; `idbSaveBackend()` with no factory rejects with `'IndexedDB unavailable'`; with `fakeIndexedDb({ hang: 'open' })` and fake timers advanced by 3000 it rejects with `'IndexedDB timed out'`.
- [ ] **Step 2: Run them.** `npx vitest run test/save-backends.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the backends. `idbSaveBackend` follows `openIdb` in `src/game/save.ts:849-916` (open timeout, `onblocked`, `onerror`, a transaction wrapper), opening database `anotherlife-save` version 1 and creating object stores `saves` and `quarantine`. The local backend's `write` loops `setItem`, calling `evict()` on a throw and retrying until `evict()` returns false.
- [ ] **Step 4: Run** the same command and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: save storage backends`.

### Task 4: Quarantine

**Files:**
- Create: `src/game/save-quarantine.ts`, `test/save-quarantine.test.ts`

**Interfaces:**
- Consumes: `SAVE_KEY`, `SaveBackend` (Task 3).
- Produces, in `save-quarantine.ts`:
  - `export const QUARANTINE_SLOTS: readonly string[]` = `['anotherlife.save.v1.bad', 'anotherlife.save.v1.bad.2', 'anotherlife.save.v1.bad.3']`; `export const QUARANTINE_MAX = 5`
  - `export type SaveNoticeKind = 'damaged' | 'stale' | 'tooOld' | 'newer'`
  - `export interface SaveNotice { readonly id: string; readonly kind: SaveNoticeKind; readonly bytes: number; readonly version?: number }`
  - `export function quarantineRecord(backend: SaveBackend, raw: string, kind: SaveNoticeKind, version?: number): Promise<SaveNotice | null>` (null when refused)
  - `export function scanQuarantine(backend: SaveBackend, diagnose: (raw: string) => Promise<{ kind: SaveNoticeKind; version?: number }>): Promise<SaveNotice[]>`
  - `export function readQuarantine(backend: SaveBackend, id: string): Promise<string | null>`, `export function deleteQuarantine(backend: SaveBackend, id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** in `test/save-quarantine.test.ts` (localStorage via `memoryLocalStorage`, IndexedDB via `idbSaveBackend(fakeIndexedDb())`):
  - the first three copies land byte-exact in the three slots in order, and each returned notice has `bytes === raw.length`.
  - with the async backend, copies four and five go to `overflow` keys `bad-1` and `bad-2`; the sixth returns null and nothing changes.
  - with a local backend only, the fourth returns null.
  - a slot whose `setItem` throws falls through to overflow on the async backend and returns null on the local backend.
  - after `deleteQuarantine` of slot 2, the next copy lands in slot 2 and slots 1 and 3 are untouched; no copy is ever overwritten.
  - `readQuarantine` returns the exact string for a slot id and an overflow id; `deleteQuarantine` removes exactly that one.
  - `scanQuarantine` returns one notice per copy with the kind from the `diagnose` callback and `bytes` from the stored text.
- [ ] **Step 2: Run them.** `npx vitest run test/save-quarantine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** A copy is confirmed by reading it back and comparing before `quarantineRecord` returns a notice. The count of kept copies is occupied slots plus overflow keys. Overflow keys are `bad-<n>` with the smallest unused integer `n`.
- [ ] **Step 4: Run** the same command and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: byte-exact quarantine for unreadable saves`.

### Task 5: Store core and the save facade

**Files:**
- Create: `src/game/save-store.ts`, `test/save-store.test.ts`
- Modify: `src/game/save.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4; `encodeSnapshotRecord`, `decodeSnapshotRecord` from `src/game/snapshot-codec.ts`.
- Produces, in `save-store.ts`:
  - `export interface SaveStatus { readonly notices: readonly SaveNotice[]; readonly persistFailed: boolean }`
  - `export function setSaveBackend(backend: SaveBackend | null): void` (null returns to the default, a `localSaveBackend` using the injected evictor)
  - `export function setLocalQuotaEvictor(fn: () => boolean): void`
  - `export function saveRecord(json: string): boolean`, `export function readRecord(): string | null`, `export function removeRecord(): void`, `export function flushSave(): Promise<boolean>`
  - `export function protectNewerRecord(raw: string, version: number): void`
  - `export function getSaveStatus(): SaveStatus`, `export function subscribeSaveStatus(listener: () => void): () => void`
  - `export function readSaveCopy(id: string): Promise<string | null>` (id `SAVE_KEY` reads the main slot), `export function deleteSaveCopy(id: string): Promise<void>`
  - `export function activeBackendName(): 'idb' | 'local' | 'memory'`, `export function resetSaveStoreForTests(): void`
- Produces, in `save.ts`: unchanged `saveGame(g: GameState): boolean`, `loadGame(): GameState | null`, `clearSave(): void` as thin wrappers (`saveGame` stringifies and returns false on a throw), plus re-exports of `flushSave`, `getSaveStatus`, `subscribeSaveStatus`, `readSaveCopy`, `deleteSaveCopy`, and the types `SaveNotice`, `SaveStatus`. `save.ts` calls `setLocalQuotaEvictor(evictLocalSnapshot)` and drops its own `SAVE_KEY`.

Rules the implementation follows: a sync backend writes inside `saveRecord` and returns its result; an async backend sets the cache and queues one coalesced write (latest wins; encode with `encodeSnapshotRecord`, then `write`); `readRecord()` reads a sync backend live and returns, for an async backend, the newest save while the last write succeeded and the last stored record after a failure; `persistFailed` flips on every failed or recovered write and notifies listeners; `removeRecord()` bumps a generation counter, and a queued write that sees it change discards itself and the removal runs after any write in flight; while a `newer` record is protected, `removeRecord()` leaves the main slot alone and the first write goes through the queue, calling `quarantineRecord(backend, raw, 'newer', version)` first and failing closed (`persistFailed` true, no write) when it returns null.

- [ ] **Step 1: Write the failing tests** in `test/save-store.test.ts` (call `resetSaveStoreForTests()` in `beforeEach`; async cases use `controlledBackend`):
  - `'sync backend: save, read and a refused write'`: with `memorySaveBackend()`, `saveRecord('{"a":1}')` is true and `readRecord()` is that JSON. With a local backend whose `setItem` throws, `saveRecord` is false, `getSaveStatus().persistFailed` is true and `readRecord()` still returns the previous record.
  - `'a failed write that later succeeds clears the warning and returns the newest save'`: continue from a refused write; once `setItem` works again, `saveRecord(next)` is true, `persistFailed` is false and `readRecord()` is `next`.
  - `'async backend: five rapid saves make at most two writes and the last wins'`: after five `saveRecord` calls, `backend.writes.length` is at most 2; settling every write and awaiting `flushSave()` gives `true` and `backend.stored` decodes to the fifth JSON.
  - `'async backend: a failed write sets persistFailed and the next save retries'`: `fail(0)`, `await flushSave()` is false, `persistFailed` is true, `readRecord()` is the last stored record; a new `saveRecord` then `settle` gives `flushSave()` true, `persistFailed` false and `readRecord()` equal to the newest JSON; a subscribed listener was called on each flip.
  - `'removeRecord during a write leaves no save'`: call `removeRecord()` while a write is pending, settle it, `await flushSave()`, and `backend.stored` is null and `readRecord()` is null.
  - `'records of 100,000 characters or more are stored as gz2 and round-trip'`: the string handed to the backend starts with `gz2:` and `decodeSnapshotRecord` returns the original; a short JSON is stored plain.
  - `'a protected newer record is copied before the first write, and fails closed without room'`: after `protectNewerRecord(raw, 3)`, `saveRecord(json)` leads to `readSaveCopy` of the new notice returning exactly `raw`, then a write; with the quarantine full (five copies), no write happens and `persistFailed` is true; `removeRecord()` while protected leaves the backend record unchanged.
  - facade: with `memoryLocalStorage` holding the v1 fixture string under `SAVE_KEY`, `loadGame()` returns a game with `schemaVersion === SAVE_SCHEMA`; with a `schemaVersion: 3` string, `loadGame()` is null and the key is unchanged; with localStorage disabled (every call throws), `saveGame` is false and `getSaveStatus().persistFailed` is true.
- [ ] **Step 2: Run them.** `npx vitest run test/save-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `save-store.ts` and the `save.ts` facade as specified above.
- [ ] **Step 4: Run** `npx vitest run test/save-store.test.ts test/store.test.ts test/time-machine.test.ts test/royal-careers.test.ts test/fuzz-regressions.test.ts test/gameplay-persistence.test.ts` and `npm run typecheck`. Expected: all PASS (the existing tests must pass untouched) and clean.
- [ ] **Step 5: Commit** `feat: save store with a coalesced IndexedDB write queue`, then push.

### Task 6: Hydrate, legacy import and the newer-save guard

**Files:**
- Modify: `src/game/save-store.ts`, `src/game/save.ts` (re-export `hydrateSaves`)
- Test: `test/save-hydrate.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Produces, in `save-store.ts`:
  - `export type Diagnosis = { kind: 'ready'; game: GameState; from: number } | { kind: 'newer' | 'tooOld'; version: number } | { kind: 'damaged' }`
  - `export function diagnoseRecord(raw: string, opts?: { minSchema?: number }): Promise<Diagnosis>` (decode, `JSON.parse`, `migrateSave`; any throw is `damaged`)
  - `export interface HydrateOptions { backend?: SaveBackend; timeoutMs?: number; minSchema?: number }`
  - `export function hydrateSaves(opts?: HydrateOptions): Promise<void>` (never rejects)

Algorithm (spec section 1, "Boot"): choose the backend (`opts.backend`, else an injected one, else IndexedDB when `typeof indexedDB !== 'undefined'` and it opens and reads within `timeoutMs` default 3000, else localStorage); for IndexedDB also read the legacy localStorage key; both present means IndexedDB wins and the legacy blob goes to quarantine as `stale`; diagnose; `ready` fills the cache from `JSON.stringify(game)` and, when the record came from the legacy key, was migrated, or is `gz2:` text in a sync backend, writes it back (IndexedDB: encode, write, read back, compare, then delete the legacy key; mismatch keeps it); `newer` calls `protectNewerRecord` and adds a notice with id `SAVE_KEY`; `tooOld` and `damaged` are quarantined then cleared from the main slot, and when quarantine returns null the record stays and the notice gets id `SAVE_KEY`; finally merge `scanQuarantine` results for copies already kept, with a `diagnose` that maps `ready` to `stale` and passes `newer`, `tooOld` and `damaged` through. If the session has already saved, return immediately.

- [ ] **Step 1: Write the failing tests** in `test/save-hydrate.test.ts` (backends from `save-kit`):
  - `'first visit: empty storage gives no notices, no save, and saving works'`; and with localStorage throwing everywhere, `hydrateSaves()` resolves, notices are empty and `saveRecord('{}')` is false with `persistFailed` true.
  - `'falls back to localStorage when IndexedDB fails to open'` (`fakeIndexedDb({ failOpen: true })` as `indexedDB`; `activeBackendName()` is `'local'`), and `'when it hangs'` (`hang: 'open'`, fake timers advanced by 3000; also `hang: 'read'`).
  - `'imports a legacy plain-JSON save into IndexedDB'`: the v1 fixture in localStorage and an empty fake IndexedDB; afterwards the stored record decodes to a game with `schemaVersion === SAVE_SCHEMA`, the legacy key is gone, and `loadGame()` works.
  - `'keeps the legacy key when read-back verification fails'`: `fakeIndexedDb({ corruptReadback: true })`; the legacy key is still present.
  - `'both present: IndexedDB wins and the legacy blob is kept as a stale copy'`: one `stale` notice whose `readSaveCopy(id)` equals the legacy string.
  - `'a damaged record is quarantined byte-exact and cleared'`, `it.each` over corrupt JSON, a truncated `gz2:` string and valid JSON failing validation: `readSaveCopy(notice.id)` equals the raw string, the main slot is empty, kind is `damaged`; a later `saveRecord('{}')` (a New Life) leaves `readSaveCopy(notice.id)` still equal to the raw string.
  - `'tooOld'`: `hydrateSaves({ minSchema: 2 })` on the v1 fixture quarantines it with kind `tooOld` and `version: 1`.
  - `'a newer record is left in place with a newer notice'`: a `{ version: 1, schemaVersion: SAVE_SCHEMA + 1, extra: {} }` record stays byte-identical in the backend, `loadGame()` is null, the notice has id `SAVE_KEY`, kind `newer`; the first `saveRecord` afterwards copies it to a slot and then writes.
  - `'a second hydrate after the session saved does not replace the newer save'`: `saveRecord(a)`, then `hydrateSaves()`, and `readRecord()` is still `a`.
  - `'gz2 text in a sync backend is normalised to plain JSON'`: a `gz2:` record in the local slot ends up as plain JSON that `loadGame()` reads.
  - `'copies kept by an earlier session show up as notices'`: two preloaded slots produce two notices with kinds from diagnosis.
- [ ] **Step 2: Run them.** `npx vitest run test/save-hydrate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `diagnoseRecord` and `hydrateSaves` as above.
- [ ] **Step 4: Run** `npx vitest run test/save-hydrate.test.ts test/save-store.test.ts test/store.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: hydrate saves at boot with legacy import and newer-save guard`.

### Task 7: Time Machine, app store and boot wiring

**Files:**
- Modify: `src/game/save.ts` (`loadSnapshot`), `src/ui/store.ts`, `src/main.tsx`
- Test: `test/save-integration.test.ts`

**Interfaces:**
- Consumes: `flushSave`, `getSaveStatus`, `subscribeSaveStatus`, `hydrateSaves`, `SaveNotice` from `src/game/save.ts` (Tasks 5 and 6).
- Produces: `AppState.saveNotices: readonly SaveNotice[]` in `src/ui/store.ts`, initialised from `getSaveStatus().notices`.

- [ ] **Step 1: Write the failing tests** in `test/save-integration.test.ts` (hoist the `localStorage` stub exactly as `test/store.test.ts:10-41` does, import the store afterwards, call `setSnapshotBackend(memorySnapshotBackend())`):
  - `'an old Time Machine snapshot without schemaVersion loads migrated'`: `const g = createNewLife({ seed: 3, year: 2026 }); delete g.schemaVersion`; `startTimeline(g.lifeId, g.character.age)`, `await takeSnapshot(g)`, `await snapshotWritesSettled()`; `(await loadSnapshot(g.lifeId, g.character.age))?.schemaVersion` is `SAVE_SCHEMA`.
  - `'an asynchronous write failure shows the save warning and a retry clears it'`: `const b = controlledBackend(); setSaveBackend(b)`; `store.startNewLife({ seed: 3, year: 2026 })`; `b.fail(0)`, `await flushSave()`; `store.getApp().saveError` is true; `store.retrySave()` and `saveError` is still true while that retry is pending; settle the newest write, `await flushSave()`; `saveError` is false.
  - `'a Time Machine jump is called off when the save does not reach storage'`: mirror the setup of the jump test at `test/time-machine.test.ts:640-665`, but with `controlledBackend` failing the arrival write; `await store.travelBack(age)` is false and `store.getApp().timeTravel.error` contains `'storage is full'`.
- [ ] **Step 2: Run them.** `npx vitest run test/save-integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `loadSnapshot`, replace the `isGameShell` plus `migrateLegacyAi` plus `isLoadableGame` sequence with `migrateSave(g)`, returning null unless `kind === 'ready'`, then keep the lifeId, age and alive checks and the two refresh calls. In `store.ts`: add `saveNotices` to `AppState`; at module level `subscribeSaveStatus(() => { const s = getSaveStatus(); setState({ saveNotices: s.notices, saveError: s.persistFailed }) })`; in `commit` set `saveError: !saved || getSaveStatus().persistFailed`, so an earlier asynchronous failure keeps the warning on until a write succeeds; in `travelBack` replace `if (!saveGame(arrived))` with `if (!saveGame(arrived) || !(await flushSave()))`. In `main.tsx`: `hydrateSaves().then(start, start)` where `start` renders `<App />` under `StrictMode` as today, plus `pagehide` and `visibilitychange` (hidden) listeners calling `void flushSave()`.
- [ ] **Step 4: Run** `npx vitest run test/save-integration.test.ts test/time-machine.test.ts test/store.test.ts test/world2-supply-world.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: wire hydrate, async save warnings and snapshot migration`, then push.

### Task 8: Home notices and downloads

**Files:**
- Create: `src/ui/download.ts`, `src/ui/components/SaveNotice.tsx`, `test/save-notice.test.ts`
- Modify: `src/ui/store.ts`, `src/ui/screens/HomeScreen.tsx`, `src/ui/styles/global.css` (next to `.save-warning`, line 2040)

**Interfaces:**
- Consumes: `SaveNotice`, `readSaveCopy`, `deleteSaveCopy`, `SAVE_KEY` (Tasks 3 to 5).
- Produces: `saveCopyFilename(now: Date, text: string): string` and `downloadText(filename: string, text: string): void` in `src/ui/download.ts`; `noticeCopy(n: SaveNotice): { title: string; text: string }`, `noticeActions(n: SaveNotice): readonly ('download' | 'delete' | 'reload')[]` and `SaveNotices(props: { notices: readonly SaveNotice[]; onDownload(id: string): void; onDelete(id: string): void; onReload(): void })` in `SaveNotice.tsx`; `downloadSaveCopy(id: string): Promise<void>` and `removeSaveCopy(id: string): Promise<void>` in `store.ts`.

- [ ] **Step 1: Write the failing tests** in `test/save-notice.test.ts`:
  - `noticeCopy` equals the spec table exactly: damaged `{ title: "Your save didn't load", text: 'A copy is kept on this device. Download it before you start a new life.' }`; tooOld with `version: 1` `{ title: 'This save is too old to open', text: "It's from version 1. A copy is kept. Download it." }`; newer `{ title: 'This save is from a newer version', text: 'Reload to update, or download a copy. New Life keeps a copy too.' }`; stale `{ title: 'Found an older copy of your save', text: "It's kept in case you need it." }`.
  - `noticeActions`: newer is `['reload', 'download']`; any other kind with `id === SAVE_KEY` is `['download']`; otherwise `['download', 'delete']`.
  - `saveCopyFilename(new Date('2026-10-14T12:00:00Z'), '{}')` is `'anotherlife-save-2026-10-14.json'` and for `'not json'` ends in `.txt`.
  - `renderToStaticMarkup(createElement(SaveNotices, props))` (tests are `.ts` files, so no JSX) contains the title and the button labels `Download copy` and `Delete copy` for a slot-id damaged notice, `Reload` for newer, and is empty for no notices. React escapes the apostrophe in static markup, so assert on `didn&#x27;t`.
  - Home: after `hydrateSaves({ backend: memorySaveBackend('not json') })`, `renderToStaticMarkup(createElement(HomeScreen))` (as `test/screens.test.ts` does) contains the damaged title and not `Continue Life`.
  - `downloadSaveCopy(id)` calls `downloadText` (mock `src/ui/download` with `vi.mock`) with a `saveCopyFilename(...)` name and exactly the text `readSaveCopy(id)` returns; `removeSaveCopy(id)` drops that notice from `getApp().saveNotices`.
- [ ] **Step 2: Run them.** `npx vitest run test/save-notice.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `downloadText` builds a Blob, clicks a temporary `<a download>` and revokes the object URL. Buttons read "Download copy", "Delete copy" and "Reload". In `HomeScreen.tsx` replace the `hasSavedGame()` then `loadGame()` pair with one `loadGame()` call (and drop the unused `hasSavedGame` import), read `useApp((s) => s.saveNotices)` and render `SaveNotices` above the menu with handlers `downloadSaveCopy`, `removeSaveCopy` and `window.location.reload()`. Style `.save-notice` after `.save-warning`.
- [ ] **Step 4: Run** `npx vitest run test/save-notice.test.ts test/screens.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: Home notices for unreadable saves with download and delete`.

### Task 9: Docs, final numbers and full verification

**Files:**
- Modify: `docs/ARCHITECTURE.md` (the `save.ts` entries near lines 18 and 38-39, the sentences at lines 161 and 167, and a new "Saving" section), `docs/RELEASE-v2.5.0.md`
- Create: `test/save-size.test.ts`

- [ ] **Step 1: Update `ARCHITECTURE.md`.** Replace the `save.ts` entries and the "Main saves remain plain JSON" and "State is plain JSON ... saved to localStorage" sentences with the new reality (IndexedDB record, localStorage fallback, snapshots unchanged), and add a "Saving" section covering the four modules, hydrate at boot, the rule "any change to saved state adds a migration step and a fixture test", and quarantine.
- [ ] **Step 2: Measure after.** Re-run `scripts/save-size.ts` as in Task 1 Step 6. Write the `### After` table and one plain sentence in `RELEASE-v2.5.0.md` saying whether the stored size of the 100-year, 12-business life is at or under 400 KB, and that Part C #4's tiering is what guarantees it if it isn't.
- [ ] **Step 3: Write `test/save-size.test.ts`.** Test `'the 100-year, 12-business save compresses to the measured ratio'` with a 120000 ms timeout: build the life with the seed the script printed and the same options (`birthYear: 1926, businesses: 12, years: 70, keepAlive: true`), `const json = JSON.stringify(g)`, assert `gzipSync(json).length / json.length` is below the measured ratio times 1.1, rounded up to two decimals (write the literal into the test with a comment naming the measurement).
- [ ] **Step 4: Full gate.** Run `npm run typecheck`, `npm run build`, and `npm test` (about 15 minutes; run it in the background and read the summary). Expected: all green, including every pre-existing test untouched.
- [ ] **Step 5: Real-browser check (not committed).** `npm i --no-save playwright`, `npm run build`, `npx vite preview --port 4341 --strictPort &`, `PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/e2e-play.mjs http://localhost:4341/ --years 25`. Then with a scratch Playwright script in the scratchpad: reload and assert the `Continue Life` button exists and `indexedDB.databases()` lists `anotherlife-save`; overwrite the record in that database with garbage, reload, assert the "Your save didn't load" notice shows and that Download copy yields a file whose text equals the garbage. Report the results; the e2e script already fails on any network request leaving the origin.
- [ ] **Step 6: Commit and publish.** Commit `docs: save safety architecture, release notes and size test`, push, update PR #16's title to `v2.5 save safety (Part C #1–#3)` and its body with the measured numbers, keep it a draft, and watch CI to green.
