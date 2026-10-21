# R2 plan, Platform: golden digests, the nightly deep tier and the text-repeat work (track `platform`)

Base: `release/v5.0.0` at a65349a (v4.1.1: R1 merged, then the Vite security update). Code read there; nothing was edited. Wave 0 has not landed: `src/game/kernel/` and `test/seed-kit.ts` do not exist, and the wave 0 worktree (`/Users/saeed/projects/anotherlife/wt/r2-wave0`) holds no change, so every wave 0 name below is the lead's fixed name, not read code. Every path marked "modify" exists today; every "create" path does not. Numbers marked "measured" come from throwaway probes run on this tree (esbuild bundles of the repo's own kits, under the machine semaphore); the tasks give the commands that reproduce them. All text uses plain hyphens (no U+2014, no U+2013) and no emoji. Line numbers are at a65349a; after wave 0 and the other tracks merge they drift, so the conversion tasks also quote the text to grep for.

## 1. Track summary

**Items covered (11 tasks).** K.7b in seven tasks: R2-P1 (the golden kit), R2-P2 (plans, runner, the regeneration script with a written reason, the first golden file, the PR-tier test), R2-P3 (the mandatory stream-isolation test and the replay, reload and fork checks), R2-P4 (old saves migrated and run, 100x ceiling probes), R2-P5 (nightly metrics library, CLI and probes), R2-P6 (`nightly.yml` and the CI doc), R2-P11 (the integration pass after the other three tracks merge). The E.T3 leftovers in four tasks: R2-P7 (the 13-life repeat probe and the R1 baseline), R2-P8 (`stateLine` and its memory), R2-P9 and R2-P10 (convert the lines that repeat, then turn the threshold on).

**Not in this track.** The pick codemod, `kernel/streams.ts`, the text stream, `test/seed-kit.ts` (`findSeed`) and the global seed rebaseline are wave 0. `g.world` and the ledger are Ledger-world, the registry and bus are Kernel, save v3 and the new fixtures are Save. This plan consumes them and edits none of their files.

**Line budget.** The roadmap gives Platform 2,400 lines (K.7b 1,500 plus E.T3 900). This plan needs about 3,150 lines of source, kits, scripts and workflow (K.7b about 2,210, E.T3 about 940), plus about 2,700 test lines, about 125 doc lines and about 110 lines of generated data (the golden file, the R1 baseline). K.7b is about 700 lines over: "the nightly deep tier switched on" costs the metrics library, CLI and probe scripts (715), the ceiling and old-save kits (250) and the workflow YAML (270), which the roadmap's 1,500 does not cover. E.T3 is within 5% of its 900.

By area: `src/` about 660 (R2-P8 221, R2-P9 and P10 about 440); scripts and workflow about 890 (golden launcher 45, `nightly-lib` 230, its `.d.mts` 45, `nightly.mjs` 170, the two bundled entries 40 and 90, `nightly.yml` 270); test kits about 1,550 (`golden-kit` 270, `golden-run` 230, `golden-cli` 260, `stream-tap` 90, `ceiling-kit` 210, `nightly-metrics` 40, `nightly-probes` 230, `text-probe` 150, the `onYear` and `scale` hooks 24, the R1 baseline 40).

Cut list, about 300 lines, if the lead wants less: drop the deep golden plan (60), the life-level 100x ceiling probe (130), the soft `rel` diff rules (50), the pool lint of R2-P10 (60). Holding 2,400 would mean dropping the nightly metrics diff and probes (R2-P5, 715), which is the part of K.7b the roadmap lists the most items for; I do not recommend it.

**Acceptance criteria owned** (R2 Acceptance and F.1):

1. One extra draw on a named stream changes only that slice's golden digest (today one extra `rand()` changes all of them): R2-P3, on the golden kit of R2-P1 and P2.
2. Replay, reload and a Time Machine fork give identical JSON (RF5): R2-P3 (the roadmap gives no owner; this track takes it because the golden kit makes it a few lines).
3. The v4.0.2 fixture, and every later `test/fixtures/save-*.json.gz`, migrates and runs 5 years: R2-P4 (Save owns the migration, this track owns the run).
4. The golden-digest job and the nightly deep tier switched on (`FUZZ=1` 40 seeds by 160 years, 200-seed balance probes with net-worth percentiles, 100x ceiling probes, anachronism over 400 lives, every old save fixture migrated and run, a metric diff against the previous night): R2-P2 and R2-P4 to R2-P6.
5. The repeated-line rate of E.T2's 13-life probe is at most half of R1's: R2-P7 (probe and baseline), R2-P9 and R2-P10 (the conversions and the gate).
6. F.1 Ceilings ("scale each input by 100 and assert a real-world cap"): R2-P4 (function-level table) and R2-P5 (life-level probe). The R1 ceiling list has 10 entries; Ledger-world adds the mint and burn caps at integration (R2-P11).

**Hot files and who touches them** (every edit additive, in its own hunk):

| File | Touched by | How |
|---|---|---|
| `test/play-kit.ts` (22-30, 203-224) | wave 0 R2-A1 (the optional `onYear`); R2-P2 only reuses it | already in place when this track rebases |
| `test/probe-life.ts` (17-31, 33-74) | wave 0 R2-A1 (`onYear`), R2-P5 (`scale`) | two optional options, about 4 lines each, defaults leave every caller unchanged |
| `src/game/text/memory.ts` (10, 29, 102, 125) | wave 0 R2-B2 first (`TextMem.c?`, `clean`, `writableTextMem` and its validity cache: the same three places), then R2-P8 | `TEXT_MEM_LIMITS.states`, `TextMem.s?` beside `c?`, one branch in `clean` beside the `c` branch, two helpers; rebase onto wave 0 and keep both fields independent and bounded |
| `src/game/text/index.ts` | R2-P8 | one export line |
| `src/game/economy/index.ts` (47-50) | R2-P9 | one hunk (the "Around me" line) |
| `src/game/events/wealth.ts` (141, 163) | R2-P9 | two single-line hunks |
| `src/game/investments.ts` (2738-2739) | R2-P9 | one hunk (the two index lines) |
| `src/game/special/sports-core.ts` (600) | R2-P9 | one line |
| `src/game/special/athlete.ts` (1025) | R2-P10 | one line |
| `src/game/events/wealth-world.ts` (237, 289) | R2-P10 | two single-line hunks |
| `src/game/events/wealth-resolve.ts` (299) | R2-P10 | one line |
| `src/game/npc-lives.ts` (110) | R2-P10 | one line (inside `milestone`) |
| `src/game/history/events-future.ts` (131-136) | R2-P10 | one hunk (the two rhythm headlines) |
| `test/text-kit.test.ts` (53-62, 81) | R2-P10 | `enforce` split into an always-on part and the opt-in rest |
| `docs/CI.md` | R2-P2, R2-P6, R2-P11 | new sections appended at the end |
| `.github/workflows/` | R2-P6 | one new file, `nightly.yml`; `ci.yml` is not edited (the golden test is in the fast tier) |
| `package.json`, `scripts/test-timings.json`, `vite.config.ts` | nobody | the lead refreshes the timings after merge (lead action 3) |

Platform merges last (wave 0, then Ledger-world, Kernel, Save, Platform), so the other tracks' hunks near mine are already in when I rebase. The files where that matters: Ledger-world's money-call migration touches `wealth.ts`, `sports-core.ts`, `athlete.ts`, `investments.ts` within 10 lines of my hunks (R2-P9 and R2-P10 re-apply on top, they never fight it), and Save's thinning of `economy/*` is 6 lines from my `economy/index.ts` hunk.

**Order and schedule** (three test-running slots; every task is test first):

1. Chain A: R2-P1, R2-P2, R2-P3 (R2-P3 also needs wave 0's streams). Chain B: R2-P7, R2-P8, then R2-P9 and R2-P10 (they need R2-P2's `golden.mjs check` as their tripwire). Chain C: R2-P4, R2-P5 (needs P2's `onYear` and P4's metrics writer), R2-P6. Each chain is about 4 to 6 agent-hours.
2. R2-P11 runs last, after Ledger-world, Kernel and Save are merged: it rebases, adds the rows only they can name, regenerates the golden file once on the merged tree and refreshes the docs.
3. The roadmap puts the E.T3 codemod and the rebaseline in the first 4 hours, alone. Nothing here starts before that merges.

**Lead actions** (none can be done by an implementer):

1. Golden file regeneration needs the Node major CI uses (22; `.github/workflows/ci.yml` pins it). Run `node scripts/golden.mjs update --plan all --reason "..."` under Node 22 only, at integration and after any release train that moves a digest on purpose. The script records the Node major in the file and refuses another major without `--allow-node`.
2. `nightly.yml` is scheduled only when it is on the default branch (`main`), and `workflow_dispatch` is offered only for a workflow on the default branch. Until the release merges, a pull request that touches `nightly.yml`, `scripts/nightly*` or `test/nightly-*` runs the whole workflow at smoke size (R2-P6), which is the proof that it works. To run the full size earlier, land that one file on `main` first.
3. After merge, refresh `scripts/test-timings.json` once (`gh run download` then `node scripts/ci-shard.mjs --source ci:run-<id> --update ...`, as `docs/CI.md` says). The new files weigh the 5 second default until then: `golden-digest` and `stream-isolation` are fast-tier (about 20 s each), the rest are sharded (`text-repeat` about 35 s, `old-saves` 5 s, `ceiling-probe` 5 s, `golden-cli` 8 s, the others under 3 s).
4. After the first scheduled full nightly: read its run time against the roadmap's 90 minutes and, if it is long, change the sizes in `scripts/nightly-lib.mjs` (one function, `nightlySizes`) and nothing else.
5. No branch-protection change: the golden digests run in the existing `fast` job, which `CI gate` already requires.

## 2. Cross-track contracts

**Provided by this track (other tracks may rely on these exact names):**

| Provided | By | Used by |
|---|---|---|
| `test/golden-kit.ts`: `SLICES`, `SliceName`, `SliceDigests`, `TOP_KEYS`, `canonicalJson`, `fnv`, `sliceView`, `sliceViews`, `sliceDigests`, `movedSlices`, `explainMove`, `unclassified` | R2-P1 | the lead's contract name `sliceDigests(g)`; every track that adds a top-level `GameState` key adds one `TOP_KEYS` row |
| `test/golden-run.ts` (`GOLDEN_PLANS`, `playGolden`, `runPlan`, `readGolden`), `scripts/golden.mjs` (`check`, `update --reason`, `show`), `test/fixtures/golden-digests.json` | R2-P2 | every later release: a change that moves a digest regenerates the file with a written reason |
| `STREAM_SLICES` in `test/stream-tap.ts`: one row per stream tag, naming the slices an extra draw may move; the guard test fails on a tag with no row | R2-P3 | Ledger-world, Kernel and every later world module: a new `stream(g, 'tag', ...)` call needs a row in the same commit |
| `CEILING_PROBES` in `test/ceiling-kit.ts`: one row per entry of `test/ceiling-list.json`, or an exemption with a reason (at most 3) | R2-P4 | Ledger-world (mint and burn caps), R3 (effort `k`, knowledge), every release that adds a growth term |
| `test/nightly-metrics.ts` (`writeMetrics`), `scripts/nightly-lib.mjs` (`nightlySizes`, `RULES`, `diffMetrics`), `scripts/nightly.mjs`, `test/nightly-probes.ts`, `.github/workflows/nightly.yml` | R2-P4 to R2-P6 | R12 (7-day history), every release that adds a metric: write it with `writeMetrics`, add a rule if it has a hard cap |
| `src/game/text/state.ts`: `stateLine`, `fillSlots`, `bandBy`, `logBand`; `src/game/text/state-table.ts`: `STATE_TABLE`, `StateKey`; `TextMem.s?` | R2-P8 | every yearly status line from now on (R3 year card, R4 people, R5 Paper): add a table row, never a hand-written "once in five years" gate |
| `test/text-probe.ts` (`probeLives`, `playProbe`, `summarize`), `scripts/text-probe.ts`, `test/fixtures/text-baseline-13.json` | R2-P7 | R3 and R5 turn on more E.T2 thresholds against the same probe |

**Consumed (names marked "assumed" are checked when the task starts):**

- Wave 0: `src/game/kernel/streams.ts` exports `stream(g, tag, year, id?)` returning `() => number`, and `worldSeed(g)` (the lead's fixed names). Wave 0's plan (read by the cross-check) fixes the rest: `outcomeStream(g, tag, year, id?)`, `streamUnit`, `textStreamKey`, `textUnit(g, year, n)` in `kernel/streams.ts`; the text cursor `textRand(g)`, `textRng`, `skipTextDraws` in `src/game/text/draw.ts`; `pickLine` draws from `textRand`, and the toddler milestone from `outcomeStream(g, 'flavor.milestone', g.year, id)`. So the text stream is tapped through `textRand` (R2-P3's `wrapTextDraw`), not through `stream`, and `STREAM_SLICES` has rows for `text`, `flavor.milestone` and (idle) `lod`. `pickLine` draws from that stream, not from `g.rng` (the lead's decision; design 9.2's older "keeps one `g.rng` draw" is superseded). R2-P3 and R2-P10 both fail loudly if that is not so (the extra draw is not seen, or `rng` moves when a line is converted), and say who to ask. `test/seed-kit.ts` `findSeed(pred, opts?)`: this track's new tests play fixed specs (a plan, not an outcome), so none needs it; R2-P11 greps for any `seed: N` this track added.
- Ledger-world: `GameState.world?: WorldState` (absent digests as `null`); the declared mints and burns are `MINTS` and `BURNS` in `src/game/kernel/reasons.ts`, re-exported by `src/game/kernel/ledger.ts` (names fixed by the cross-check from the Ledger-world plan); `shardNames()` from `src/game/world/state.ts`.
- Save: `migrateSave` (`src/game/save-schema.ts:44`) keeps its signature; new fixtures appear as `test/fixtures/save-*.json.gz` and are picked up by a directory listing, so Save edits no file of mine. The Time Machine entry points `startTimeline`, `takeSnapshot`, `loadSnapshot` (`src/game/save.ts:701, 742, 755`) keep their names.
- R1 (read, not edited): `scripts/ci-shard.mjs` and its `// ci: fast` marker, `test/scan-kit.ts`, `test/text-metrics.ts` (`textMetrics`, `mergeMetrics`, `normalize`), `test/play-kit.ts` (`playLife`), `test/probe-life.ts` (`probeLife`), `scripts/r1-parity-lib.mjs` (`lifeSpecs` line 19, `firstDiff` 63, `countNodes` 70), `scripts/fuzz-engine.ts`, `src/game/world-flags.ts` (`classifyFlag` 130), `src/game/text/*` (the E.T1 kit, used by nothing in the game yet except `events/flavor.ts` rings).

---

## 3. Tasks

### R2-P1 K.7b (a): the golden kit

**Goal.** `sliceDigests(g)`: one canonical-JSON FNV digest per slice of a played state, so a failing run names the slice that moved.

**Items covered.** K.7b, design 13.6 "Golden digests per slice", F.1 Determinism.

**Files.**
- Create: `test/golden-kit.ts`, `test/golden-kit.test.ts` (first line `// ci: fast`).
- Reads: `src/game/types.ts:685-714` (`GameState`), `src/game/world-flags.ts:130` (`classifyFlag`), `test/helpers.ts:66` (`makeTestGame`), `test/fuzz-kit.ts:513` (`deepFreeze`), `scripts/r1-parity-lib.mjs:63` (`firstDiff`, typed by `scripts/r1-parity-lib.d.mts`).
- Nothing in `src/` changes.

**Interfaces.**

```ts
// test/golden-kit.ts  (no vitest imports: the same kit runs under vitest and as a bundled node script)
export const SLICES: readonly ['rng', 'character', 'people', 'assets', 'world', 'economy', 'flagsWorld', 'flagsPersonal', 'text']
export type SliceName = (typeof SLICES)[number]
export type SliceDigests = Record<SliceName, string>
/** Where each top-level key of GameState goes. 'flags' is split by key, 'ignore' is the build's own constants. */
export const TOP_KEYS: Readonly<Record<string, SliceName | 'flags' | 'ignore'>>
export function canonicalJson(value: unknown): string
export function fnv(text: string): string                       // 16 lower-case hex characters
export function sliceView(g: GameState, name: SliceName): unknown
export function sliceViews(g: GameState): Record<SliceName, unknown>   // one pass over the state
export function sliceDigests(g: GameState): SliceDigests
export function movedSlices(a: SliceDigests, b: SliceDigests): SliceName[]   // SLICES order
export function explainMove(a: GameState, b: GameState, slice: SliceName): string   // JSON pointer of the first difference, both values cut to 120 characters
export function unclassified(g: GameState): { topKeys: string[]; flags: string[] }
```

**Slice rules** (the lead's nine names, fixed; the leftovers the lead's list does not place are routed here and the guard test below makes any new one a deliberate choice):

| Slice | Holds |
|---|---|
| `rng` | `g.rng` and `g.nextId` (the two counters every draw and every `uid()` moves) |
| `character` | `g.character` without `memories`; `g.lifeId`, `g.year`, `g.generation`, `g.counters`, `g.yearActions`, `g.ancestors`, `g.ribbon` |
| `people` | `g.people`, each person without `notes` |
| `assets` | `g.assets` |
| `world` | `g.world` (absent digests as `null`), and any top-level key not in `TOP_KEYS` (new world-side state is the likely newcomer) |
| `economy` | `g.flags.worldEconomy` |
| `flagsWorld` | every other flag with `classifyFlag(key) === 'world'` |
| `flagsPersonal` | flags classified `personal`, and flags nobody classified (the registry's own rule: "when in doubt, personal") |
| `text` | `g.log`, `g.queue`, `g.obituary`, `g.flags.textMem`, every flag classified `cache` (by definition only repeated text or popups depend on them), `people[].notes` as `[id, notes]` pairs, `character.memories` |
| (ignored) | `g.version`, `g.schemaVersion`: constants of the build, so a schema bump moves no digest |

The lead's `text` is "log, queue text, flags.textMem". The extension (cache flags, person notes, character memories, obituary) is the prose that no rule reads back; without it an extra text draw would show up as a move of `people` or `character` and the isolation test of R2-P3 could never pass. Open point 1 asks the lead to confirm.

**Behaviour.**
- `canonicalJson`: keys sorted by code unit, no whitespace, an `undefined` value skipped in an object and written `null` in an array (like `JSON.stringify`), `-0` written `0`, and a non-finite number written as the string `"__num:NaN"` (`Infinity`, `-Infinity`) so it can never hide as `null`. A function, symbol or bigint is treated as `undefined`. Iterative on arrays and objects of normal depth (the load limit is 128).
- `fnv`: two 32-bit FNV-1a lanes with different offset bases (`0x811c9dc5` and `0x9747b28c`), the text length mixed into both, written as 16 hex characters. It is "FNV" with 64 bits, built on `Math.imul` because a BigInt FNV-64 costs about 20 times more on a 2 MB state.
- `sliceViews` partitions `g.flags` once: `worldEconomy` to `economy`, `textMem` to `text`, then by `classifyFlag` (`world` to `flagsWorld`, `cache` to `text`, `personal` or `null` to `flagsPersonal`).
- `explainMove` builds both views of the slice and returns `firstDiff` of them, so a leak is reported as a path ("/people/3/relationship: 61 -> 58") and not as two hashes.

**Tests** (`test/golden-kit.test.ts`; write first, red because the kit is missing):
1. `SLICES` is exactly the lead's nine names in that order; `TOP_KEYS` covers every key of `makeTestGame()` and of a `createNewLife({ seed: PLAN_SEED, year: 1990 })` aged 3 years (`const PLAN_SEED = 1` in the test file; wave 0's pin ratchet forbids a new `seed: <digits>` literal in `test/`).
2. `canonicalJson`: key order does not matter; `undefined` handling as above; `NaN` and `null` give different text; `-0` equals `0`; a nested structure equals `JSON.stringify` of an hand-ordered copy.
3. `fnv`: 16 hex characters; stable (pin one vector after writing it); a one-character change, a swap (`ab` and `ba`) and the empty string all differ; no collision among 20,000 distinct strings.
4. Partition: over a life aged 12 years, every flag key lands in exactly one of `economy`, `flagsWorld`, `flagsPersonal`, `text`, and the union of their keys is `Object.keys(g.flags)`; `textMem` is in `text`, `worldEconomy` in `economy`, a `cache` key in `text`, an unclassified key (synthetic `zzNew`) in `flagsPersonal` and listed by `unclassified(g).flags`; an unknown top-level key (synthetic) lands in `world` and is listed in `unclassified(g).topKeys`.
5. Sensitivity, one mutation per slice and only that slice's digest moves: `g.character.money += 1` moves `character`; `g.people[0].relationship += 1` moves `people`; a pushed asset moves `assets`; `g.rng += 1` moves `rng`; `g.flags.worldEconomy.year += 1` moves `economy`; a world-class flag moves `flagsWorld`; a personal flag moves `flagsPersonal`; `g.world = { x: 1 }` moves `world`; a changed log line, a pushed `people[0].notes` entry and a pushed `character.memories` entry each move `text` only; `version` and `schemaVersion` move nothing.
6. `g.world` absent, `undefined` and the digest of `null` agree.
7. Purity: `sliceDigests(deepFreeze(structuredClone(g)))` does not throw, equals the unfrozen digests, and the state's JSON is unchanged after the call.
8. `explainMove` returns a path that starts with the slice's own root (for example `/people/0/`) and names both values.

**Steps.**
1. Write the test file; `/Users/saeed/projects/anotherlife/wt/bin/vt test/golden-kit.test.ts` is red.
2. Write `test/golden-kit.ts`.
3. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/golden-kit.test.ts test/world-flags.test.ts` (the second proves the classification table was not disturbed).

**Acceptance it proves.** The "failure names the slice" half of K.7b; the partition is total (guard 4) and sensitive (guard 5).
**Flag.** None. **Depends on.** Wave 0 merged (the base the tests build their lives on).
**Hot-file notes.** All new files.
**Size.** About 270 kit lines, about 260 test lines.
**Risks.** Performance of canonical JSON on a late-game state (about 2 MB): measure one `sliceDigests` on a 12-company probe life and note it (expect well under 150 ms); if it is slower, cache nothing and cut the checkpoints of the deep plan instead. A top-level key added by another track lands in `world` silently, which is why test 1 and `unclassified` exist: R2-P11 reads them.

---

### R2-P2 K.7b (b, c): plans, runner, the regeneration script, the first golden file, the PR-tier test

**Goal.** N seeded lives by Y years, digested at checkpoints, compared with a committed file; a script that regenerates the file only with a written reason; the check runs in the fast tier.

**Items covered.** K.7b ("the golden-digest job ... compared with a committed golden file ... plus a script to regenerate it with a written reason"), F.1 fast tier ("3 seeds by 20 years").

**Files.**
- Create: `test/golden-run.ts`, `test/golden-cli.ts`, `scripts/golden.mjs`, `test/fixtures/golden-digests.json` (generated by the script), `test/golden-digest.test.ts` (first line `// ci: fast`), `test/golden-cli.test.ts`.
- Modify: `docs/CI.md` (append "Golden digests"). `test/play-kit.ts` and `test/probe-life.ts` need no edit here: wave 0's R2-A1 already added the optional `onYear(g, yearsPlayed)` to `PlayOptions` and `ProbeOptions` with exactly this signature (cross-check finding, wave 0 plan section 1.7 point 2); run `grep -n onYear test/play-kit.ts test/probe-life.ts` first and add nothing if both hits are there, never a second hook.
- Reads: `scripts/r1-parity.mjs` (`bundleTo`, the esbuild-then-run pattern to copy), `test/text-kit.test.ts:23-28` (the four lives the deep plan reuses).

**Interfaces.**

```ts
// test/play-kit.ts, test/probe-life.ts (additive; every caller unchanged)
//   PlayOptions.onYear?: (g: GameState, yearsPlayed: number) => void    // 0 after birth, then after each year's popups were drained
//   ProbeOptions.onYear?: (g: GameState, yearsPlayed: number) => void   // 0 before the first year, then after each ageUp

// test/golden-run.ts  (no vitest imports)
export type PlanName = 'pr' | 'deep'
export interface GoldenLife { id: string; kind: 'birth' | 'founder'; seed: number; birthYear: number; years: number; rich?: boolean; businesses?: number }
export interface GoldenPlan { checkpoints: readonly number[]; lives: readonly GoldenLife[] }
export const GOLDEN_PLANS: Readonly<Record<PlanName, GoldenPlan>>
export type LifeDigests = Record<string, SliceDigests>          // key: String(years played) or 'end'
export interface GoldenHistory { at: string; plan: PlanName | 'all'; reason: string; moved: SliceName[] }
export interface GoldenFile {
  v: 1; node: number; hash: string
  plans: Record<PlanName, { checkpoints: number[]; lives: GoldenLife[] }>
  digests: Record<PlanName, Record<string, LifeDigests>>        // plan -> life id -> digests
  history: GoldenHistory[]                                      // at most 40, newest last
}
export const GOLDEN_FILE: string                                // absolute path of test/fixtures/golden-digests.json
export function playGolden(life: GoldenLife, checkpoints: readonly number[], onYear?: (g: GameState, yearsPlayed: number) => void): LifeDigests   // the optional hook runs after the digests of that year were taken, so a test can perturb the next year
export function runPlan(name: PlanName, only?: readonly string[]): Record<string, LifeDigests>
export function readGolden(file?: string): GoldenFile | null
export function serializeGolden(f: GoldenFile): string          // one line per life and checkpoint, keys in a fixed order, final newline
export interface Moved { slice: SliceName; life: string; at: string; golden: string; now: string }
export function compareGolden(golden: Record<string, LifeDigests>, now: Record<string, LifeDigests>): Moved[]
```

```ts
// test/golden-cli.ts  (no vitest imports; the launcher bundles it)
export function checkReason(reason: string | undefined): string | null     // null when fine, else why not
export interface CliDeps { run(plan: PlanName): Record<string, LifeDigests>; read(): GoldenFile | null; write(f: GoldenFile): void; node: number; at(): string; out(line: string): void }
export function runCli(argv: readonly string[], deps?: CliDeps): number      // 0 ok, 1 digests moved or a problem, 2 bad usage
```

**The plans.** Both play `playLife` (birth lives, popups answered by the kit's own driver) or `probeLife` (founders, queue cleared each year). Checkpoints are years played; every life also records `end` (death or the last year). Cross-check rule: wave 0's pin ratchet (`test/seed-pins.test.ts`) counts `seed: <digits>` in every `test/**/*.ts`, so `GOLDEN_PLANS` is written with a small helper, `life('birth-1950', 'birth', 1, 1950, 20)`, never as an object literal with `seed: 1` (the same trick wave 0's `PARITY_LIVES` uses); R2-P11 greps for the pattern and expects no hit.

| Plan | Lives (id: seed, born, years, extras) | Checkpoints | Cost (measured per kit) |
|---|---|---|---|
| `pr` | `birth-1950`: 1, 1950, 20. `rich-1990`: 2, 1990, 32, `rich`. `founder-1975`: 3, 1975, 20, 2 companies | 5, 10, 20 | about 8 s of play, 20 s with import |
| `deep` | eight birth lives to age 90: seeds 1 to 4 as `test/text-kit.test.ts` (1950, 1990, 2005, 1975 rich) and seeds 21 to 24 (1925, 1935 rich, 1962, 2026 rich); four founders for 60 years: seeds 31 to 34 born 1926, 1950, 1975, 1990 with 12, 6, 3, 1 companies | 10, 20, 40, 60, 90 | about 1 minute (13 birth lives to 85 took 20.7 s; a 12-company year is about 108 ms) |

`probeLife` throws when fewer industries are open than asked ("only N of M industries are open to a founder"); if a founder spec throws, lower `businesses` (never the years) and say so in the plan's comment.

**The file.** `test/fixtures/golden-digests.json`: `{ "v": 1, "node": 22, "hash": "canonical-json,fnv1a-32x2", "plans": {...}, "digests": {...}, "history": [...] }`. `serializeGolden` writes each (life, checkpoint) digest object on one line, so two branches that move different lives merge line by line. JSON has no comments, so the rule "regenerate, never hand-merge" is said in `docs/CI.md` and in the `update` output.

**CLI** (`node scripts/golden.mjs <command>`; Node builtins plus esbuild, which the repo has as a devDependency; the launcher bundles `test/golden-cli.ts` to a temp `.mjs` with `platform: 'node'`, sets `GOLDEN_CLI=1` and runs it, passing the exit code on):

```
check  [--plan pr|deep|all]                       play, compare, print one line per slice, exit 1 if any moved
update --reason "text" [--plan pr|deep|all] [--at LABEL] [--allow-node]
show   [--plan pr|deep]                           print the committed digests as a table (plays nothing)
help
```
- `check` prints, per moved slice, the first (life, checkpoint) it differs at and how many lives it differs in, then the line `If this is intended: node scripts/golden.mjs update --reason "<why>"`. Default plan `pr`.
- `update` plays the plans, compares with the old file, and if nothing moved prints "no digest moved, file unchanged" and exits 0 without writing (the reason is not recorded for a no-op). Otherwise it writes the new digests, appends `{ at, plan, reason, moved }` (`moved` = the slices that changed in any life or checkpoint, in `SLICES` order; all nine for a first file), keeps the newest 40 entries, and prints the commit line to paste: `Golden: moved <slices>: <reason>`. `--plan` leaves the other plan's digests untouched. `at` defaults to `git rev-parse --short HEAD` when available, else `working tree`.
- `checkReason`: 20 to 200 characters after trimming, at least four words, no U+2014 or U+2013, and not only a stock phrase (`rebaseline`, `update golden`, `regenerate`, `fix tests`). It is typed with `String.fromCharCode` in the test so the test file carries neither character.
- Exit 2 for an unknown command, a missing or bad `--reason`, a bad `--plan`, or `update` under a Node major different from the one in the file without `--allow-node`.

**Tests.**
- `test/golden-digest.test.ts` (fast tier; each life is played once and shared by the cases; explicit 120 s timeouts, because the first case plays the plan and the default is 15 s):
  1. The file's `plans` equal `GOLDEN_PLANS` (lives, checkpoints); on a mismatch the message says "the plan changed: run node scripts/golden.mjs update".
  2. `it.each(SLICES)`: "slice %s matches the golden file for every life and checkpoint" (`pr` plan, one slice per case so the output names the slice). The message names the first (life, checkpoint), the golden and current digest, the Node major of the file against the running one, and the `update` command.
  3. `history` is non-empty, every reason passes `checkReason`, every `moved` entry is a subset of `SLICES`, and at most 40 entries.
  4. `playGolden` on a 3-year life with checkpoints `[1, 2, 3, 9]` has keys `1`, `2`, `3` and `end` and no `9`; the `onYear` hook saw years 0 to 3 in order.
  5. Purity of the harness: the same life played twice in one process gives identical digests (no hidden module state), and a life played after another gives the digests it gives alone.
  6. `describe.skipIf(process.env.GOLDEN_DEEP !== '1')`: the deep plan against the file, same shape (the nightly sets it; R2-P6's workflow test greps for the string).
- `test/golden-cli.test.ts` (injected deps, no lives played): `checkReason` accept and reject table (19 and 201 characters, three words, a dash, `rebaseline` alone); `update` on a missing file writes all nine slices as moved; a second `update` with the same digests writes nothing and exits 0; a changed `text` digest records `moved: ['text']`; `--plan pr` keeps the deep digests; history is capped at 40; `serializeGolden` round trips through `JSON.parse` and has exactly one line per (life, checkpoint); `check` names the first moved checkpoint and exits 1; a Node major mismatch exits 2; usage errors exit 2. One smoke through the real launcher: `node scripts/golden.mjs show` exits 0 and prints the nine slice names, `node scripts/golden.mjs bogus` exits 2 (this bundles once, about 4 s).

**Steps.**
1. Write both test files (red).
2. Confirm wave 0's `onYear` hooks are in `play-kit.ts` and `probe-life.ts` (they must be: do not add a second); run `/Users/saeed/projects/anotherlife/wt/bin/vt test/notice-probe.test.ts test/text-kit.test.ts` to show the existing kits still work.
3. Write `test/golden-run.ts`, `test/golden-cli.ts`, `scripts/golden.mjs`.
4. Generate the first file under Node 22: `node scripts/golden.mjs update --plan all --reason "first golden digests, recorded on the wave 0 base before the R2 tracks merge"`.
5. Prove the two runtimes agree: `node scripts/golden.mjs check --plan pr` (esbuild bundle) exits 0, and so does `/Users/saeed/projects/anotherlife/wt/bin/vt test/golden-digest.test.ts` (vite transform). A difference between them is a hidden-state bug, not a flake: stop and report it.
6. Append the "Golden digests" section to `docs/CI.md` (what a failure means, `check` and `update`, the written reason, Node 22, never hand-merge: rebase, then regenerate).
7. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/golden-digest.test.ts test/golden-cli.test.ts test/ci-shard.test.ts` (the last proves the new files are covered: `golden-digest` is fast-tier, `golden-cli` is sharded).

**Acceptance it proves.** The golden-digest job (D.11 criterion on determinism): the plan is committed, checked on every PR in under a minute, and a moved digest names its slice and needs a written reason.
**Flag.** None. **Depends on.** R2-P1.
**Hot-file notes.** `play-kit.ts` and `probe-life.ts` hunks are 3 to 6 lines. The golden file is new; the other tracks never touch it, so it cannot conflict, only go stale (R2-P11).
**Size.** About 550 lines (`golden-run` 230, `golden-cli` 260, launcher 45, hooks 16), about 330 test lines, about 70 lines of generated JSON, 35 lines of doc.
**Risks.** Cross-machine determinism of `Math` functions: the repo already depends on it (119 pinned seeds pass on a laptop and on Linux CI), and the file records the Node major. A vitest run and a bundled run disagreeing (step 5) would mean module state outside `g`. Golden file churn: every release that moves a digest regenerates it; that is the point, and the reasons are the written list the R2 exit gate asks for.

---

### R2-P3 K.7b (d): one extra draw on a named stream moves only that slice; replay, reload and fork

**Goal.** The mandatory test: an extra draw on a named stream changes only the golden digests of the slices that stream feeds, an extra `rand(g)` still changes everything downstream (the "before" that proves the digest is sensitive), and replay, reload and a Time Machine fork give identical digests.

**Items covered.** K.7b ("the mandatory test"), R2 Acceptance bullet "One extra draw on a named stream changes only that slice's golden digest ... Replay, reload and a Time Machine fork give identical JSON", RF5.

**Files.**
- Create: `test/stream-tap.ts`, `test/stream-isolation.test.ts` (first line `// ci: fast`), `test/replay-purity.test.ts`.
- Reads: `src/game/kernel/streams.ts` (wave 0; **read it first**), `src/game/text/pick.ts:49` (`pickLine`, which wave 0 moves onto the text stream), `src/game/save.ts:701-760` (`startTimeline`, `takeSnapshot`, `loadSnapshot`), `src/game/save-schema.ts:44` (`migrateSave`), `test/fuzz-kit.ts:689` (`installStorageShim`) and `:930-955` (the round trip fuzz already checks per year), `test/scan-kit.ts` (lexer scan).

**Interfaces.**

```ts
// test/stream-tap.ts  (no vitest imports; the test wraps the module with it from inside vi.mock)
export interface TapRule { tag: string; year: number }           // year is the calendar year the caller passes
export const tap: { rule: TapRule | null; hits: number }
/** Wraps every function exported by kernel/streams.ts: when a call matches `tap.rule`, the PRNG it returns is advanced once (one extra draw) before the caller sees it, and `hits` counts it. */
export function wrapStreams<M extends Record<string, unknown>>(actual: M): M
/** How to read (tag, year) from the arguments of each wrapped export of kernel/streams.ts: `stream` and `outcomeStream` are `(g, tag, year, id?)`. The text stream is not a PRNG (cross-check finding, wave 0 plan section 1.7): wave 0 gives it as the pure `textUnit(g, year, n)` in kernel/streams.ts and its cursor as `textRand(g)` in src/game/text/draw.ts, so `wrapTextDraw` below taps `textRand`, not `stream`. */
export const EXPORT_TAGS: Record<string, (args: readonly unknown[]) => TapRule | null>
/** For `vi.mock('../src/game/text/draw', ...)`: when `g.year` equals `tap.rule.year` and the tag is `text`, a call of `textRand(g)` first calls the original once more (one extra text draw: the cursor in `flags.textMem.c` moves by one) and counts a hit. */
export function wrapTextDraw<M extends Record<string, unknown>>(actual: M): M
/** The table the guard test enforces: for each stream tag a module draws from, the slices one more draw may move. */
export const STREAM_SLICES: Readonly<Record<string, { slices: readonly SliceName[]; why: string; age?: number; idle?: boolean }>>   // age: the age of a birth life at which to tap (default 5); idle: no code draws from the tag yet, so the tap cannot hit (the row exists so the guard passes; remove `idle` when a caller lands)
```

`STREAM_SLICES` starts with three rows: `text: { slices: ['text'], why: 'lines and popups are prose; nothing reads them back into a roll' }`; `'flavor.milestone': { slices: ['text'], why: 'wave 0 keys the toddler milestone age on outcomeStream; the age lands in flags.milestonesLogged, a cache flag, which the golden kit files under text', age: 1 }` (only the birth life can hit it); and `lod: { slices: [], why: 'Ledger-world R2-L16 seededEntity draws from stream(g, "lod", 0, kind:key) and nothing calls it in R2', idle: true }`. Every track that adds `stream(g, 'tag', ...)` adds a row in the same commit; a row says honestly which slices the module's output reaches (a war stream: `world`, `economy`, `text`).

**The injection.** `vi.mock('../src/game/kernel/streams', async (importOriginal) => { const { wrapStreams } = await import('./stream-tap'); return wrapStreams(await importOriginal<typeof import('../src/game/kernel/streams')>()) })` and, for the text stream, a second `vi.mock('../src/game/text/draw', ...)` with `wrapTextDraw` in the same shape. With `tap.rule` null the wrapper changes nothing (the baseline is played through it too, so the wrapper itself is proved inert).

**Tests.**
- `test/stream-isolation.test.ts`: the two `pr` lives `birth-1950` and `founder-1975`, each played as a copy with `years: 12` through `playGolden(life, [6, 12], onYear)`, so the digests are those after year 6 and year 12 (`end` is year 12). Every variant plays the same two lives:
  1. Baseline played twice: identical (determinism through the wrapper).
  2. For every row of `STREAM_SLICES`: tap `(tag, year)` where `year` is the calendar year after the row's `age` (default 5) years played (`life.birthYear + 5` for a birth life, `life.birthYear + 30 + 5` for a founder, whose first year is age 30). Assert `tap.hits > 0` over the two lives together, unless the row is `idle` (else the message is "no module drew from stream '<tag>' in <year>: the stream is not wired, or the tap does not see it; ask the lead whether wave 0 moved pickLine onto it"), `movedSlices(base, tapped)` is a subset of the row's slices, and, for the `text` row, includes `text` (the extra draw did something). On a slice outside the row moving, the failure prints `explainMove` for it and the rule: a leak is either prose that is really simulation state (a name, a number: restore its `g.rng` draw in the owning module, wave 0's codemod scope) or prose the kit forgot to mask (add it to the `text` rule of R2-P1); never widen the row to make the test pass.
  3. The "before": an extra `rand(g)` drawn from the `onYear` hook when `yearsPlayed` is 5 moves `rng`, `character` and `text` in each life and at least four distinct slices over the two lives.
  4. Guard: scan `src` with `loadSources()` for calls of `stream` and of `outcomeStream` whose second argument is a string literal; every tag found has a `STREAM_SLICES` row, and no call has a non-literal tag (a ratchet at zero: "write the tag as a literal so the table can see it").
- `test/replay-purity.test.ts` (the `pr` lives `birth-1950` at year 12 and `founder-1975` at year 8, then 5 more years each way):
  1. Replay: `structuredClone(g)` then `ageUp` on the clone and on the original give identical digests for all nine slices at each of the 5 years.
  2. Reload: `JSON.parse(JSON.stringify(g))` through `migrateSave(...)` then 5 years equals the original 5 years, slice by slice (the JSON round trip is what a saved game suffers: `undefined` keys and `NaN` are exactly the bugs this finds).
  3. Fork: `installStorageShim()`, `setSnapshotBackend(memorySnapshotBackend())`, `startTimeline(lifeId, null)`, `await takeSnapshot(g)`, `await loadSnapshot(lifeId, age)`, then 5 years equals the original (same age, so no `outcomeTag` reroll).
  A failure prints `explainMove`. If a check finds a real purity bug, fix it when the fix is under 20 lines in the owner's file and say so; otherwise stop and report it to the lead; the test is never weakened.

**Steps.**
1. Read `kernel/streams.ts` and `src/game/text/draw.ts`; confirm the names above (`textRand`, `outcomeStream`) and how `pickLine` calls them; if wave 0 renamed one, change `EXPORT_TAGS` and `wrapTextDraw` first.
2. Write the two test files and `stream-tap.ts` (the tests are red only where wave 0's wiring is missing; on a correct base they are green on the first run, and that is the evidence).
3. Prove the test can fail: temporarily draw from `g.rng` inside `pickLine` and see variant 2 fail with `rng` named, then revert. (A temporary edit, never committed; say so in the PR.)
4. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/stream-isolation.test.ts test/replay-purity.test.ts test/golden-digest.test.ts`.

**Acceptance it proves.** Criteria 1 and 2 of this track's list.
**Flag.** None. **Depends on.** R2-P2, wave 0 (streams and the text stream).
**Hot-file notes.** New files only; no `src/` edit.
**Size.** About 90 lines (`stream-tap`), about 360 test lines.
**Risks.** If wave 0 left `pickLine` on `g.rng`, variant 2 fails by design and the fix is wave 0's, not this test's. `vi.mock` is hoisted: keep the factory free of top-level references (it imports `./stream-tap` dynamically). The two lives play about 8 times in total (about 15 s).

---

### R2-P4 K.7b (e, f): old saves migrated and run; the 100x ceiling probes

**Goal.** Every old save fixture loads and runs, and every capped growth term holds when its inputs are scaled by 100.

**Items covered.** K.7b (nightly: "every old save fixture migrated and run 5 years", "100x ceiling probes"), R2 Acceptance "the v4.0.2 fixture runs 5 years", F.1 Old saves and Ceilings.

**Files.**
- Create: `test/old-saves.test.ts`, `test/ceiling-kit.ts`, `test/ceiling-probe.test.ts`, `test/nightly-metrics.ts`.
- Reads: `test/fixtures/save-v1.json.gz` (the file six tests call "the v4.0.2 fixture"; it is a v2.4.0 shape), `src/game/save-schema.ts:44` (`migrateSave`, `{ kind: 'ready', game }`), `scripts/r1-parity-lib.mjs:70` (`countNodes`), `test/ceiling-list.json` (10 entries) and `test/ceiling-list.test.ts`, `src/game/events/wealth-core.ts` (`typicalIncome(g, countryId?)`, `US_TYPICAL_INCOME`), `src/game/special/pay-scale.ts:13` (`payScale`), `src/game/special/sports-core.ts:465` (`dealCeiling`), `src/game/history/events-people.ts:90` (`realWealthFactor`), `src/game/special/gamedev-core.ts:236-247, 257` (`titleCopiesCap`, `publisherCopiesCap`, `nextTail`), `src/game/special/author-career.ts:248-261` and `test/author.test.ts:1213` (how a released work is built), `src/game/special/fame.ts:988` (`yearlyFame`) and `test/fame-career.test.ts:48` (how a podcast is built), `test/fuzz-kit.ts` (`deepFreeze`).

**Interfaces.**

```ts
// test/nightly-metrics.ts  (no vitest imports)
/** When NIGHTLY_METRICS_DIR is set, writes <dir>/<job>-<NIGHTLY_SHARD or 0>.json as { v: 1, job, shard, metrics, samples? }; otherwise does nothing. */
export function writeMetrics(job: string, metrics: Record<string, number>, samples?: Record<string, number[]>): void

// test/ceiling-kit.ts
export interface CeilingProbe {
  id: string                                                    // an id of test/ceiling-list.json, or 'extra.<name>'
  cap: string                                                   // the sentence the cap protects
  run: (scale: number) => { value: number; limit: number }      // inputs scaled by `scale`; value must be at most limit
  exempt?: string                                               // a reason, when no function-level probe is possible
}
export const SCALES: { light: readonly number[]; deep: readonly number[] }   // [1, 100] and [1, 10, 100, 1000]
export const CEILING_PROBES: readonly CeilingProbe[]
```

**Behaviour: old saves** (`test/old-saves.test.ts`; env `OLD_SAVES_YEARS` default 5, `OLD_SAVES_RESEEDS` default 1):
- Fixtures are the files of `test/fixtures` matching `^save-.*\.json\.gz$`, found by `readdirSync`, so Save's new fixtures are included without an edit. At least one exists and `save-v1.json.gz` is among them.
- Per fixture: `migrateSave(structuredClone(raw))` is `ready`; the game has fewer than 500,000 JSON nodes (`countNodes`); `migrateSave` of its own result is a no-op (idempotent, equal JSON). Then for each reseed `k` (`k = 0` keeps the saved `rng`, `k > 0` sets `g.rng` to a mix of `k`) on a `structuredClone`: `YEARS` times `g.queue = []; ageUp(g)`; after each year every number in the state is finite, the state is plain JSON (a stringify and parse round trip is stable), the node count stays under the cap, and the character is alive or the death was recorded (`ribbon` set).
- `writeMetrics('old-saves', { 'oldsaves.fixtures.sum': n, 'oldsaves.years.sum': years played, 'oldsaves.failures.sum': 0 })` (a failure throws instead).
- Integration (R2-P11, once Save and Ledger-world are merged): if `readWorld`/`ensureWorld` exist, add "a fixture without `g.world` has no `world` key after `migrateSave`, and `readWorld(g)` reads as empty".

**Behaviour: ceilings** (`test/ceiling-probe.test.ts`):
- Every row runs at `SCALES.light` always and at `SCALES.deep` when `CEILING_PROBE=deep` (the nightly). Each row's `value` is at most its `limit` at every scale; the message names the id, the scale, the value, the limit and the cap sentence.
- Guard: every id in `test/ceiling-list.json` has a probe row or an `exempt` row with a reason sentence; at most 3 exemptions in all (a ratchet: a fourth needs the lead); no row names an id that is not in the list unless it starts `extra.`.
- Rows to write now (the function is exported; read the quoted setup in the named test and copy it). `pay-scale`: for every country of `COUNTRIES` (`src/game/world.ts`) and the years 1900, 1950, 2000, 2026 and 2100, multiply that country's `getCountry(id).wealth` by `scale` for the call and restore it in `finally` (`countryWealth` reads that field, `wealth-core.ts:48`): `payScale(g)` at most 1.6 and `typicalIncome(g, id, year)` at most `US_TYPICAL_INCOME * 1.6` (`wealth-core.ts:55` clamps the wealth at 1.6). `endorsement-deal`: `dealCeiling(g, { fame: 10 }) / typicalIncome(g)` at most 400 (`sports-core.ts:465`), same wealth scaling. `olympic-bonus`: `realWealthFactor(year)` at most 1 for the years `1800` to `3000` and for `2026 * scale`. `studio-title-copies`: `titleCopiesCap(y) / gamersIn(y)` at most 0.0801 and `publisherCopiesCap(y) / gamersIn(y)` at most 0.1001 for years 1900 to 3000 (`gamedev-core.ts:236-247`). `studio-tail`: `nextTail(copies * scale, players, scope)` at most `0.6 * copies * scale` for players 0 to 100 and both scopes (the keep share is clamped to 0.6 at `gamedev-core.ts:253`; the quarter cap `TAIL_SWING` lives in the yearly loop at `gamestudio.ts:388`, which the life-level probe of R2-P5 covers). `adaptation-fee` and `adaptation-royalty`: build the released work as `test/author.test.ts:1213` does and set `copies` and `readers` to `5_000_000 * scale`: `fee` at most `150 * typicalIncome(g, w.countryId)` and `annual` at most `15 * typicalIncome(...)` (`author-career.ts:248-261`). `podcast-audience` and `fame-ledger`: write a podcast with `listeners` and every ledger value at `100 * cap` into the fame flag as `test/fame-career.test.ts:48` does, run `yearlyFame(g)` and read it back: listeners at most `30_000_000`, every ledger value at most `1e12` (`fame.ts:69-72`). A row that cannot be built in about 40 lines is exempt with a reason sentence ("the cap is a module-private constant inside a yearly loop; the life-level probe of R2-P5 covers it"), within the budget of 3.
- A life-level 100x probe is R2-P5; it lives in the nightly because a life takes seconds.

**Tests.** The two files above are the tests; plus, in `ceiling-probe.test.ts`, the kit's own: a synthetic row that exceeds its limit fails with the message (the harness can fail), a throwing `run` is reported with the id, and an exempt row without a reason is rejected.

**Steps.**
1. Write `test/old-saves.test.ts` and `test/ceiling-probe.test.ts` with the guards first (red: no kit).
2. Write `test/nightly-metrics.ts`, `test/ceiling-kit.ts` and the rows.
3. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/old-saves.test.ts test/ceiling-probe.test.ts test/ceiling-list.test.ts test/save-schema.test.ts`.
4. Run the deep variants once by hand and note the times: `CEILING_PROBE=deep OLD_SAVES_YEARS=20 OLD_SAVES_RESEEDS=8 /Users/saeed/projects/anotherlife/wt/bin/vt test/old-saves.test.ts test/ceiling-probe.test.ts`.

**Acceptance it proves.** Criterion 3 (fixtures run 5 years) and the function-level half of criterion 6.
**Flag.** None. **Depends on.** Nothing (wave 0 base).
**Hot-file notes.** New files only.
**Size.** About 250 lines (`ceiling-kit` 210, `nightly-metrics` 40), about 340 test lines.
**Risks.** A fixture that cannot run on the merged tree is the finding, not a flake: it goes to the Save track. `ageUp` on the v2.4.0 fixture has not been exercised for 5 years by an existing test (they migrate and render), so the first run may expose a real crash; fix only in the owner's file when it is under 20 lines, else report. Ceiling rows read module code that other tracks will move (`gamedev-core`, `author-career`): they import exported functions only.

---

### R2-P5 K.7b (f): the nightly metrics library, CLI and probes

**Goal.** Everything the nightly workflow runs that is not a vitest file: sizes, the balance and ceiling life probes, metrics merging with percentiles, the diff against the previous night.

**Items covered.** K.7b nightly ("200-seed balance probes with net-worth percentiles", "100x ceiling probes", "a metric diff against the previous night"), F.1 Performance and size budgets.

**Files.**
- Create: `scripts/nightly-lib.mjs`, `scripts/nightly-lib.d.mts` (`tsc` checks `test/` and cannot import an untyped `.mjs`, the repo's precedent is `scripts/ci-shard.d.mts`), `scripts/nightly.mjs`, `test/nightly-probes.ts` (typechecked: `tsconfig.json` includes `test/` but not `scripts/*.ts`), `scripts/nightly-probes.ts` (a thin entry of about 40 lines, bundled by esbuild, as `scripts/fuzz-engine.ts` is), `test/nightly-lib.test.ts` (first line `// ci: fast`).
- Modify: `test/probe-life.ts` (`ProbeOptions` and lines 40 and 53: optional `scale`, default 1, multiplying `g.character.money` (5e6) and each company's `cash` (3,000,000)).
- Reads: `scripts/fuzz-engine.ts` (flags at 29-63, the `TOTAL:` line at 113), `scripts/r1-parity-lib.mjs:19` (`lifeSpecs`), `src/game/core.ts:423` (`netWorth`), `test/play-kit.ts` (`playLife`, with R2-P2's `onYear`), `test/text-metrics.ts:78` (the nearest-rank percentile this file matches).

**Interfaces.**

```ts
// scripts/nightly-lib.d.mts
export type Scale = 'full' | 'smoke'
export interface NightlySizes {
  fuzz: { shards: number; seedsPerShard: number; years: number; budgetSeconds: number }
  balance: { shards: number; lives: number; years: number }
  ceiling: { shards: number; lives: number; years: number; scale: number }
  anachronism: { lives: number; slices: number }
  text: { lives: number }
  oldSaves: { years: number; reseeds: number }
}
export function nightlySizes(scale: Scale): NightlySizes
export interface MetricsFile { v: 1; job: string; shard: number; metrics: Record<string, number>; samples?: Record<string, number[]> }
export function percentile(xs: readonly number[], p: number): number          // nearest rank: sorted[ceil(p * n / 100) - 1], NaN for []
export function mergeMetricFiles(files: readonly MetricsFile[]): Record<string, number>
export interface Rule { match: string; kind: 'cap' | 'rel'; limit: number; hard: boolean; why: string }
export const RULES: readonly Rule[]
export interface DiffRow { name: string; prev: number | null; cur: number; verdict: 'ok' | 'warn' | 'fail' | 'new' | 'gone'; why: string }
export function diffMetrics(prev: Record<string, number> | null, cur: Record<string, number>, rules?: readonly Rule[]): DiffRow[]
export function diffMarkdown(rows: readonly DiffRow[], failedJobs: readonly string[]): string
export function parseFuzzTotal(log: string): Record<string, number>
```

```ts
// test/nightly-probes.ts
export function balanceProbe(opts: { start: number; count: number }): MetricsFile    // lives seed start .. start+count-1 of lifeSpecs()
export function ceilingProbe(opts: { start: number; count: number; years: number; scale: number }): MetricsFile
```

**Sizes.** `nightlySizes('full')` is the roadmap's list, exactly: fuzz 8 shards of 5 seeds, 160 years, a budget of 600 s per life (40 seeds by 160 years); balance 4 shards of 50 lives (200); ceiling 4 shards of 6 lives, 20 years, scale 100 (24 lives); anachronism 400 lives in 8 slices; text 20 lives; old saves 20 years and 8 reseeds (the roadmap's 5 years is the always-on default of R2-P4). `'smoke'`: 1 seed by 3 years per fuzz shard, 2 lives per balance and ceiling shard, 2 years, 16 anachronism lives, 2 text lives, 3 years and 2 reseeds: the whole workflow in a few minutes.

**Merge rules** (`mergeMetricFiles`): a name ending `.sum` is added over files, `.max` takes the maximum, a `samples` entry is pooled over files and expanded to `name.n`, `.p10`, `.p50`, `.p90`, `.p99`, `.max`; any other name that two files both write is an error (a shard must not guess how to combine it). Names are dotted, lower case.

**Rules** (`RULES`, first match wins; `*` matches any run of characters):

| match | kind, limit | hard | why |
|---|---|---|---|
| `fuzz.failures.sum` | cap 0 | yes | a fuzz failure is a bug |
| `balance.*.max` | cap 1e13 | yes | the richest person ever held about 5e11; this is 20 times that, a runaway loop is far above it |
| `ceiling.life.maxNetWorth.max` | cap 1e12 | yes | measured 4.1e9 at 100x on 8 founder lives (R1 head) |
| `ceiling.life.growth.max` | cap 40 | yes | measured 8.2 at 100x, 24.1 at 1x: growth must fall as inputs rise |
| `balance.birth.msYear.p95` | cap 160 | yes | F.1: light-life year step at most 160 ms on desktop; measured p95 25 ms |
| `text.repeatedShare` | cap 0.0415 | yes | R2 acceptance: at most half of R1's 0.0831 (R2-P10) |
| `oldsaves.failures.sum`, `anachronism.findings.sum` | cap 0 | yes | |
| `balance.*.p50` | rel 0.25 | no | a drift of a quarter in a median is worth a look |
| anything else | rel 0.5 | no | |

A hard cap fails the metrics job; a `rel` rule only prints a `WARN` row. A metric new tonight is `new`, one missing is `gone` (a warning), and a failed job is listed first and fails the run.

**Behaviour of the probes.**
- `balanceProbe`: spec `i` of `lifeSpecs(200, 40)` (odd seeds birth lives, even seeds founders with 1 to 3 companies; birth years cycle 1925, 1950, 1975, 1990, 2010). A birth life is `playLife({ seed, birthYear, untilAge: 80, onYear })` (popups answered by the kit's driver, so wealth events and choices are exercised); a founder is `probeLife({ seed, birthYear, businesses, years: 40, onYear })`. `onYear` samples `netWorth(g)` at ages 25, 40, 60 and 80 of a birth life, the final and peak net worth of both kinds, and the milliseconds between calls (a year including popup answering). Samples: `balance.birth.age25|40|60|80`, `balance.birth.final`, `balance.founder.final`, `balance.founder.peak`, `balance.birth.msYear`, `balance.founder.msYear` (per-life maxima); sums: `balance.lives.sum`, `balance.alive80.sum`.
- `ceilingProbe`: founder lives (`probeLife` with `scale: 100`, 3 to 12 companies, 20 years, `keepAlive`), sampling per life the maximum net worth (`ceiling.life.maxNetWorth`) and that over the starting net worth (`ceiling.life.growth`).
- Measured on this tree (40 mixed lives, 45 s): passive birth lives hold net worth 0 at the median at 25 and 40; founders (40 years) p10 0.85e6, p50 16.2e6, p90 38.1e6, max 66.4e6; the year step of a birth life p50 21.5 ms, p95 24.8 ms, max 83 ms (1,239 years). Founder lives at 100x (8 lives, 20 years): net worth at most 4.1e9, growth 2.6 to 8.2 times, against 2.9 to 24.1 times at 1x.

**CLI** (`node scripts/nightly.mjs ...`, dependency-free Node ESM, exit 0 ok, 1 a hard failure, 2 bad usage):

```
sizes <full|smoke> [--shard i/n]               KEY=VALUE lines for $GITHUB_ENV (FUZZ_START, FUZZ_SEEDS, FUZZ_YEARS, FUZZ_BUDGET,
                                               BALANCE_START, BALANCE_COUNT, CEILING_*, ANACHRONISM_LIVES, TEXT_PROBE_LIVES, OLD_SAVES_*)
fuzz-metrics --shard n --log FILE --json FILE --out FILE   metrics file from fuzz-engine's TOTAL line and --json list
merge --out FILE [--result job=outcome ...] FILE...         pool the metrics files; failed jobs recorded as failedJobs
diff --prev FILE|none --cur FILE                            markdown to stdout; exit 1 on a hard failure or a failed job
```
`scripts/nightly-probes.ts` is the bundled entry: `balance --start N --count N --out FILE` and `ceiling --start N --count N --years N --scale N --out FILE`.

**Tests** (`test/nightly-lib.test.ts`; write first, red):
1. `nightlySizes('full')` equals the roadmap: 8 x 5 = 40 fuzz seeds by 160 years, 4 x 50 = 200 balance lives, scale 100, 400 anachronism lives in 8 slices, oldSaves years at least 5; `'smoke'` is strictly smaller everywhere.
2. `percentile` on fixed lists (even, odd, one element, empty gives NaN) agrees with `spread` in `test/text-metrics.ts` on the same numbers.
3. `mergeMetricFiles`: `.sum` adds, `.max` maxes, samples pool and expand to the six names, a name two files both write throws and names both.
4. `diffMetrics`: a cap breach is `fail` and hard; a `rel` move beyond its limit is `warn`; `new` and `gone`; a null previous marks everything `new` and fails nothing; the first matching rule wins (a test with two overlapping rules); a NaN current value fails.
5. `diffMarkdown` lists failed jobs first and contains each `warn` and `fail` row with its reason.
6. `parseFuzzTotal` on the real line shape (`TOTAL: 5 seeds, 800 life-years, ...`) and on a log without one (returns zero counts and a `fuzz.nototal.sum` of 1).
7. `balanceProbe({ start: 1, count: 2 })` and `ceilingProbe({ start: 2, count: 1, years: 2, scale: 100 })` return the documented metric names with finite numbers and a replay is identical; `probeLife` with `scale: 1` gives the same JSON as before the option existed (run it on seed 2 against `scale` omitted).
8. CLI smoke through `spawnSync(process.execPath, ['scripts/nightly.mjs', ...])`: `sizes smoke --shard 2/8` prints the `FUZZ_START=` and `FUZZ_SEEDS=` lines; `merge` then `diff --prev none` on two tiny metrics files exits 0; a cap breach exits 1 and names the metric; a bad command exits 2.

**Steps.**
1. Write `test/nightly-lib.test.ts` (red).
2. Add `scale` to `test/probe-life.ts` (default 1).
3. Write `scripts/nightly-lib.mjs`, `.d.mts`, `scripts/nightly.mjs`, `test/nightly-probes.ts`, `scripts/nightly-probes.ts`.
4. Bundle and run once by hand: `node_modules/.bin/esbuild scripts/nightly-probes.ts --bundle --platform=node --format=esm --outfile=/tmp/nightly-probes.mjs` then `node /tmp/nightly-probes.mjs balance --start 1 --count 4 --out /tmp/b.json`; note the seconds per life.
5. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/nightly-lib.test.ts test/ci-shard.test.ts`.

**Acceptance it proves.** The metric diff, the net-worth percentiles and the 100x life probe of K.7b exist and are unit-tested; the hard caps are the F.1 budgets and the R2 repetition gate.
**Flag.** None. **Depends on.** R2-P2 (`onYear`), R2-P4 (`writeMetrics` and its file shape).
**Hot-file notes.** `probe-life.ts`: one optional field, four lines.
**Size.** About 715 lines (`nightly-lib` 230, `.d.mts` 45, CLI 170, probes 230, entry 40), about 300 test lines.
**Risks.** Fuzz time per seed at 160 years has never been measured (the header only says "for long runs"): the full size caps a life with `--budget 600` and records the years actually played, so a slow night shows as fewer years, and the lead resizes `nightlySizes` after the first run (lead action 4). Percentiles of 50 samples per shard are pooled across shards, never averaged.

---

### R2-P6 K.7b (f): `nightly.yml` and the CI doc

**Goal.** The workflow that runs the deep tier, and the proof that it runs before it reaches `main`.

**Items covered.** K.7b ("a `.github/workflows/nightly.yml`"), F.1 Nightly deep.

**Files.**
- Create: `.github/workflows/nightly.yml`, `test/nightly-workflow.test.ts` (first line `// ci: fast`).
- Modify: `docs/CI.md` (append "The nightly deep tier").
- Reads: `test/shard-kit.ts` (`readSlice` takes `i/n` up to 64 slices and `merge`; `test/anachronism.test.ts` already slices its lint lives with it, so the nightly needs no change to that file), `.github/workflows/ci.yml` (the `test` job at 54 and the `aggregate` job at 94 are the slice recipe to copy; `actions/checkout@v5`, `setup-node@v5`, `upload-artifact@v4`, node 22, `cache: npm`), `scripts/fuzz-engine.ts:1-12` (the build and run commands), `test/anachronism.test.ts:242` (`ANACHRONISM_LIVES`), `test/fuzz-deep.test.ts`.
- `ci.yml` is not edited.

**Shape** (write the top part exactly; each job below is described by its comment, and every job repeats the checkout, node and `npm ci` steps):

```yaml
name: Nightly

# The deep tier (docs/CI.md). Scheduled runs happen on the default branch only; a pull request that touches this file
# or its scripts runs the same jobs at smoke size, which is how a change to it is proved before it reaches main.
on:
  schedule:
    - cron: '23 3 * * *'
  workflow_dispatch:
    inputs:
      scale:
        description: full or smoke
        type: choice
        options: [full, smoke]
        default: full
  pull_request:
    paths: ['.github/workflows/nightly.yml', 'scripts/nightly*', 'test/nightly-*']

concurrency:
  group: nightly-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref_name }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
  actions: read

env:
  NIGHTLY_SCALE: ${{ github.event_name == 'pull_request' && 'smoke' || inputs.scale || 'full' }}

jobs:
  fuzz:            # matrix shard [1..8]: sizes, esbuild scripts/fuzz-engine.ts, node fuzz-engine.mjs --start --seeds --years --budget --fork --quiet --json
  balance:         # matrix shard [1..4]: esbuild scripts/nightly-probes.ts; balance then ceiling, each --out metrics/<job>-<shard>.json
  deep:            # matrix include: ceilings, old-saves, text, golden; run: env ${{ matrix.env }} NIGHTLY_METRICS_DIR=metrics npx vitest run --maxWorkers=1 ${{ matrix.files }}
  anachronism:     # matrix slice [1..8]: SLICE=i/8 SLICE_DIR=test-slices ANACHRONISM_LIVES=$ANACHRONISM_LIVES; upload the slice files
  anachronism-merge: # needs anachronism; downloads slice-* (merge-multiple), SLICE=merge, the same recipe as ci.yml's aggregate job
  metrics:         # needs all, if: ${{ always() }}: download metrics-*, find and download the previous night, merge, diff, upload
```

- Every job: `runs-on: ubuntu-latest`, `timeout-minutes` (fuzz 120, balance 45, deep 45, anachronism 60, merge 20, metrics 15), `actions/checkout@v5`, `setup-node@v5` with `node-version: 22` and `cache: npm`, `npm ci`, then `node scripts/nightly.mjs sizes "$NIGHTLY_SCALE" --shard ${{ matrix.shard }}/N >> "$GITHUB_ENV"`.
- Steps that pipe (`| tee`) set `shell: bash` so `pipefail` is on and a failing fuzzer fails the step.
- `deep` matrix rows (`name`, `files`, `env`): `ceilings`: `test/ceiling-probe.test.ts`, `CEILING_PROBE=deep`; `old-saves`: `test/old-saves.test.ts`, `OLD_SAVES_YEARS=$OLD_SAVES_YEARS OLD_SAVES_RESEEDS=$OLD_SAVES_RESEEDS`; `text`: `test/text-repeat.test.ts test/text-kit.test.ts`, `TEXT_PROBE_LIVES=$TEXT_PROBE_LIVES`; `golden`: `test/golden-digest.test.ts`, `GOLDEN_DEEP=1`.
- Previous night, in the `metrics` job (`continue-on-error: true` on the fetch): `prev="$(gh run list --workflow nightly.yml --event schedule --status success --limit 1 --json databaseId --jq '.[0].databaseId')"`, then `gh run download "$prev" -n nightly-metrics -D previous` when it is a number, with `GH_TOKEN: ${{ github.token }}`. The diff step runs `node scripts/nightly.mjs diff --prev previous/nightly-metrics.json --cur metrics/all.json >> "$GITHUB_STEP_SUMMARY"` (`--prev none` when the download found nothing), and the job uploads `metrics/all.json` as `nightly-metrics` with `retention-days: 30` (R12 wants 7 nights).
- Artifacts: `metrics-<job>-<shard>` (retention 14), `fuzz-<shard>` (the JSON and log, 14), `slices-<i>` (14).

**Tests** (`test/nightly-workflow.test.ts`, text checks like R1's `ci-shard.test.ts` 11; write first, red): first line `name: Nightly`; has `schedule`, a cron line, `workflow_dispatch` and a `pull_request` trigger with `paths` naming the three patterns; the six job keys exist; `metrics` has `if: ${{ always() }}`; every job has `timeout-minutes`; no line runs `npm test`; every `uses:` is one of `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`; the strings `FUZZ_YEARS`, `GOLDEN_DEEP=1`, `CEILING_PROBE=deep`, `SLICE: merge` and `ANACHRONISM_LIVES` appear; every `$NAME` env variable the run lines read is printed by `node scripts/nightly.mjs sizes full --shard 1/8` or is defined in the file (the contract between the YAML and `nightlySizes`); every file named in a `files:` value exists; every `--shard` count equals the matrix length of its job.

**Docs** (`docs/CI.md`, appended): a table of the nightly jobs with their full and smoke sizes (from `nightlySizes`), what each hard rule means, how to read the summary, how to run one job by hand (the exact commands of R2-P4 step 4 and R2-P5 step 4), the default-branch rule, the PR smoke, and the artifact names.

**Steps.**
1. Write `test/nightly-workflow.test.ts` (red).
2. Write `nightly.yml`.
3. `/Users/saeed/projects/anotherlife/wt/bin/vt test/nightly-workflow.test.ts test/ci-shard.test.ts`; `/Users/saeed/projects/anotherlife/wt/bin/tc`.
4. The proof that the workflow runs is the pull request itself: the smoke run starts because the PR changes `nightly.yml`. The implementer notes the run id and its wall time in the PR.

**Acceptance it proves.** Criterion 4 ("the nightly deep tier switched on").
**Flag.** None. **Depends on.** R2-P4, R2-P5.
**Hot-file notes.** New workflow; `ci.yml` untouched.
**Size.** About 270 YAML lines, about 130 test lines, about 70 doc lines.
**Risks.** The schedule does nothing until the file is on `main` (lead action 2). Billed time: 26 jobs a night (fuzz 8, balance 4, deep 4, anachronism 8, merge and metrics 2); about 160 runner-minutes at the planned sizes, free on a public repo (K's open question 1, default yes). `gh run list` needs `actions: read`, set above.

---

### R2-P7 E.T3 (a): the 13-life repeat probe and the R1 baseline

**Goal.** Measure the number the R2 acceptance names, on the tree before any R2 text change, and keep the tool that re-measures it.

**Items covered.** E.T2 "13-life probe" (the R2 acceptance bullet "the repeated-line rate of E.T2's 13-life probe is at most half of R1's"), E.T3 worklist.

**Why this task exists.** The repo has no 13-life repeat probe. The R1 harness (`test/text-kit.test.ts`) plays 4 lives; the 13 lives are `test/notice-probe.test.ts:16-19` (seeds 101 to 113). The probe below uses those seeds and birth years, to age 85 as the notice probe does, with every second life given 60,000,000 at 25 (the harness's `rich`, so that half the lives are rich as in digest E). R1's number is measured here on a65349a, before wave 0 and before any R2 change.

**Files.**
- Create: `test/text-probe.ts`, `scripts/text-probe.ts` (an entry of about 90 lines, bundled with esbuild like `scripts/fuzz-engine.ts`), `test/fixtures/text-baseline-13.json`, `test/text-probe.test.ts`, `test/text-repeat.test.ts` (the 13-life run; only the sanity cases now, R2-P9 and R2-P10 add the rest).
- Reads: `test/text-kit.test.ts`, `test/text-metrics.ts` (`textMetrics` 129, `mergeMetrics` 200, `normalize` 73), `test/play-kit.ts` (`playLife` 203), `test/fixtures/text-baseline.json` (the 4-life R1 record, left as is).

**Interfaces.**

```ts
// test/text-probe.ts  (no vitest imports)
export interface ProbeLife { seed: number; birthYear: number; rich: boolean }
export const PROBE_UNTIL_AGE = 85
/** The first 13 are the R1 baseline's lives; more extend the same recipe (the nightly plays 20). */
export function probeLives(n?: number): ProbeLife[]            // seed 101 + i, birth year [1925, 1950, 1975, 1990, 2010, 2026][i % 6], rich when i is odd
export interface Family { text: string; extra: number; total: number; lives: number }   // text is normalize()d and cut to 100 characters
export interface ProbeResult { lives: TextMetrics[]; merged: TextMetrics; repeated: number; families: Family[] }
export function summarize(traces: readonly LifeTrace[]): ProbeResult   // pure
export function playProbe(n?: number): ProbeResult
export interface R1Baseline { v: 1; recordedAt: string; spec: {...}; merged: { lines: number; repeated: number; repeatedShare: number; sameWithin10: number; over3: { distinct: number; max: number } }; perLife: { lines: number; share: number; in10: number; max: number; over3: number }[] }
export function readBaseline(): R1Baseline
export function ratioToR1(r: ProbeResult): number              // merged.repeatedShare / baseline.merged.repeatedShare
```

**The R1 baseline** (measured on a65349a with the exact spec above, `merge` weighting of `test/text-metrics.ts`; this is what `test/fixtures/text-baseline-13.json` holds):

- 13 lives, 5,093 log lines, 423 repeated lines: `repeatedShare` 0.08305517376791675. `sameWithin10` 266, `over3` 41 distinct lines with a highest count of 17, `openerShare` 0.4879, popups a year mean 3.69, p90 6.32, max 14. The half the acceptance asks for is 0.0415 (212 repeats at the same line count).
- Per life (lines, share): 365 0.0932; 479 0.0731; 159 0.0126; 406 0.0985; 271 0.0369; 444 0.1374; 368 0.1196; 597 0.0754; 410 0.0805; 452 0.0951; 320 0.0563; 348 0.0977; 474 0.0506. The 20.7 s of play for the 13 lives (1.3 to 2.5 s each) is the cost of one run.
- The heaviest families (repeats beyond the first, summed over the 13 lives; normalized text) are the worklist of R2-P9 and R2-P10: "around me: energy & resources ..." 36, the news line "The Summer Olympics open" 32 and "The World Cup kicks off" 17, "I earned $N from endorsements this year" 16 (+5 with a comma amount), the pro-season recap 10 + 10, "I lost $N to a scam" 8, "I paid $N in taxes" 7, "X: earned a promotion and higher pay" about 25 over many names, a relative's "paid back $N of what ... owes me" about 16, "I set money boundaries with X" about 30 over many names, the index days ("The X crashed N% this year. Good thing I had nothing in it." and "boomed ... I wish I had invested") about 30, the health pools (4, 4, 3, 3, 2, 2, 2) about 25, donations about 15. About 250 of the 423 are in the families R2-P9 and R2-P10 convert.

**Tests.**
- `test/text-probe.test.ts` (pure, fast, written first, red): `probeLives(13)` returns the 13 specs (seed 101 to 113, the six birth years in turn, `rich` on odd indexes) and `probeLives(20)` starts with the same 13; `summarize` on two synthetic traces counts `extra` as repeats beyond the first within a life, sums over lives, sorts by `extra` then text, and counts a line repeated in two lives once per life; `repeated` equals the sum of `extra`; `ratioToR1` of a result with half the baseline share is 0.5; `readBaseline` returns the 13 per-life rows and `merged.repeated` 423; replaying the shortest life (seed 103, 159 lines) gives byte-identical metrics.
- `test/text-repeat.test.ts` (sanity only for now): the 13 lives play to age 85 or death; every number in the metrics is finite; no log line contains `{` or `}` (an unfilled slot); `JSON.stringify` of a replay of life 3 is identical; prints the table (`repeatedShare` per life, merged, ratio to R1, top 15 families). With `NIGHTLY_METRICS_DIR` set it writes `text.repeatedShare`, `text.sameWithin10.sum`, `text.lines.sum` (R2-P10 adds the gate).

**CLI** (`scripts/text-probe.ts`; bundled, run by hand while converting): `node_modules/.bin/esbuild scripts/text-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/text-probe.mjs && node /tmp/text-probe.mjs [--lives 13] [--top 40] [--json out.json]` prints the pooled share, the ratio to R1, each life's share and the top families as `extra total lives text`. It does not write the baseline: the baseline file is only ever created by this task.

**Steps.**
1. Write both test files (red: no kit).
2. Write `test/text-probe.ts` and `scripts/text-probe.ts`.
3. Re-measure R1's number: on a tree with no R2 text change the probe must print 5,093 lines and 423 repeats. After wave 0 that tree is gone, so the numbers above are the record: write the fixture from them (a checked-in constant), and confirm that `playProbe` on the wave 0 base is within a few points of 0.083 (it differs, the seeds moved; a result far from 0.08 means the probe spec is wrong, not the game).
4. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-probe.test.ts test/text-repeat.test.ts test/text-kit.test.ts test/text-metrics.test.ts`.

**Acceptance it proves.** The measure behind criterion 5 and its recorded R1 number.
**Flag.** None. **Depends on.** Wave 0 (for the base); nothing else.
**Hot-file notes.** New files only.
**Size.** About 280 lines (`text-probe` 150, CLI 90, fixture 40), about 200 test lines.
**Risks.** The rebaseline moves every seed, so the post-wave-0 share of the same 13 specs differs from 0.083 by sampling noise of about one point (the 13 per-life shares have a standard deviation near 3 points, so the pooled share about 1): treat 0.0415 as the bar and 0.035 as the working target (R2-P10). The spec is a fixed list of lives, not an outcome pinned to a seed, so it does not break the "no new `seed: N` pin" rule; the rule's own spirit (outcomes found with `findSeed`) does not apply to a ratio over 13 lives.

---

### R2-P8 E.T3 (b): state lines

**Goal.** `stateLine(g, key, value)`: a status line speaks when its state crosses a threshold, or when it has been quiet for 5 years and the state still holds, in three variants that never repeat the last two. The hand-written gates in the game become table rows.

**Items covered.** E.T3 ("state lines `stateLine(g, key, value)` that print on a threshold change or every 5 years with 3 variants"), design 9.2.

**What exists today** (the same idea written by hand, six times): `changedALot` (`src/game/finance.ts:573`, a 25% change), `livingLineAge` and `chance(g, 0.35)` (`finance.ts:640-643`, every 5 years), `homelessLineAge` (`finance.ts:656-661`), `t.marks.avoid` (`src/game/events/wealth.ts:168-171`, R0-10), `freshLine` (`src/game/health.ts:284`) and `freshPick` (`finance.ts:581`, last three picks). They are not touched here (finance.ts is also Ledger-world's hot file); new status lines use the table.

**Files.**
- Create: `src/game/text/state.ts`, `src/game/text/state-table.ts`, `test/text-state.test.ts`, `test/text-lines.test.ts` (the table lint; R2-P10 adds the pools to it).
- Modify: `src/game/text/memory.ts` (`TEXT_MEM_LIMITS` at 10, `TextMem` at 29, `clean` at 102, plus two helpers), `src/game/text/index.ts` (one export line).
- Reads: `src/game/text/hash.ts` (`hunit`), `src/game/text/pick.ts:49` (the kit's style), `scripts/voice/rules.mjs` (`unitFlags`, `staticLength`, `LIMITS.log` 90), `test/text-memory.test.ts` (the exact-shape tests that constrain `TextMem`).

**Interfaces.**

```ts
// src/game/text/state-table.ts  (data only, imports nothing: any module may read it without joining a cycle)
export interface StateSpec {
  /** Three to six lines; {name} slots are filled by stateLine. Plain narrator, log cap 90 static characters. */
  readonly variants: readonly string[]
  /** The threshold bucket of a value, a whole number 0..99. A change of bucket is a change of state. */
  readonly band: (value: number) => number
  /** Years of silence after which an unchanged state speaks again. Default 5; 0 means never. */
  readonly every?: number
  /** Fewest years between two lines when the bucket changed. Default 2. */
  readonly gap?: number
}
export const STATE_TABLE = {} as const satisfies Record<string, StateSpec>   // starts empty, R2-P9 adds the rows; the literal keys make StateKey a union
export type StateKey = keyof typeof STATE_TABLE                    // a typo in a key is a compile error

// src/game/text/state.ts  (imports ./memory, ./hash, ./state-table and types)
export const STATE_LIMITS: Readonly<{ exclude: 2; every: 5; gap: 2 }>   // the 120-record cap is TEXT_MEM_LIMITS.states
export function bandBy(...edges: number[]): (value: number) => number   // number of edges at or below the value
export function logBand(ratio?: number): (value: number) => number      // 0 for <= 0, else 1 + floor(log(value) / log(ratio)), at most 99; ratio default 1.25
export function fillSlots(line: string, slots?: Readonly<Record<string, string>>): string   // {name} -> slots.name, a missing slot -> ''
export function stateLine(g: GameState, key: StateKey, value: number, opts?: { id?: string; slots?: Readonly<Record<string, string>> }): string | null
export function stateLineWith(table: Readonly<Record<string, StateSpec>>, g: GameState, key: string, value: number, opts?: {...}): string | null   // the engine; stateLine binds STATE_TABLE (tests inject theirs)
```

```ts
// src/game/text/memory.ts (additive)
// TEXT_MEM_LIMITS.states: 120
// TextMem.s?: Record<string, string>   // state key (or key.id) -> '<year>,<band>,<variant>,<previous variant or ->'; absent when empty
// readState(mem, key, year): { year: number; band: number; v1: number; v2: number } | null   // null when missing, damaged, or from a year after `year` (no foresight)
// rememberState(mem, key, rec): void   // touches the key (moves it last), evicts the oldest past 120; creates `s` lazily
```

**Behaviour.** `stateLine` is pure presentation: no `g.rng`, no stream, no draw of any kind. The variant is `hunit(g.lifeId, g.year, memKey)` over the variants not among the last two used (so three variants cycle), where `memKey` is `key` or `key.id` (the id lets one row serve one person: `allowance.one.p42`; a key that fails `isMemKey`, such as a hostile id, returns null).
1. Band `b` of the value (a non-finite value or a band outside 0..99 is 0 and clamped).
2. No record, or a record from a year after `g.year`: speak.
3. Same band: speak only when `every > 0` and at least `every` years passed.
4. Different band: speak only when at least `gap` years passed; otherwise stay quiet and leave the record alone, so the change still counts next year (a deferred change is not a lost one).
5. Speaking writes `{ year: g.year, band, variant, previous variant }` through `writableTextMem` and returns `fillSlots(variant, slots)`; staying quiet writes nothing, so the call is idempotent within a year (a second call in the same year can never speak: the year gap is 0).
`TextMem.s` is added only when a state is first remembered, so `{ v: 1, p: {}, f: {}, r: {} }` stays exactly what an untouched life holds (`test/text-memory.test.ts:20, 399-400` compare that shape with `toEqual`). The reader accepts only `^\d{1,6},\d{1,2},\d,(\d|-)$` for a value and a valid key, drops the rest, caps at 120 keys; an old save has no `s` and reads as empty. A heir starts clean (`textMem` is personal, `src/game/world-flags.ts:104`).

**Tests.**
- `test/text-state.test.ts` (written first, red; injected table of two rows plus one `every: 0` row; lives from `makeTestGame`): the first call speaks and writes `s`; the same call again in the same year is null; an unchanged band is quiet for 4 years and speaks in the fifth; `every: 0` never speaks again; a band change after 1 year is deferred and speaks after 2 (and the deferred change is not lost: the record still holds the old band at year 1); a band change after 3 years speaks at once; consecutive lines never repeat either of the last two variants and with three variants cycle through all three (30 years); the same life, year and key give the same line in a replay and in a `structuredClone` (no rng); `g.rng` and `g.nextId` are unchanged after 200 calls; `id` keeps two people independent and a hostile id (`'x y'`, 60 characters, `__proto__`) returns null; 300 distinct ids leave at most 120 records and the newest survive; a record from a year after `g.year` is read as none; hostile `textMem.s` (junk values, wrong types, a 10,000,000-character string, a 500-key object) is sanitized to valid records only and `readTextMem` never throws; an untouched life's `textMem` is exactly `{ v: 1, p: {}, f: {}, r: {} }`; `bandBy(1, 5)` gives 0, 1, 2 at 0.5, 1, 5; `logBand(2)` steps when the value doubles; `fillSlots` leaves no brace for a missing slot and does not recurse into a slot value that holds braces.
- `test/text-lines.test.ts` (the table lint): every row of `STATE_TABLE` has 3 to 6 variants; each variant is at most 90 static characters (`staticLength`, a `{slot}` counting 0) and has `unitFlags(text, 'log')` empty with every `{slot}` replaced by the hole `${...}`; no U+2014 or U+2013 (typed with `String.fromCharCode`); every slot name used by one variant is a plain word; `band` is total (a finite value, 0, a negative, `NaN`, `1e12` give an integer 0 to 99); each key is at most 32 characters and a valid memory key. With the table empty the loop is vacuous and a synthetic row exercises the checks.

**Steps.**
1. Write both test files (red).
2. Write `state-table.ts` (empty table, the type), `state.ts`, the `memory.ts` hunks and the `index.ts` line.
3. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-state.test.ts test/text-lines.test.ts test/text-memory.test.ts test/text-pick.test.ts test/text-hash.test.ts test/flavor-memory.test.ts test/world-flags.test.ts test/architecture.test.ts` (the last two prove no new flag key and no new cycle).

**Acceptance it proves.** The kit half of E.T3; the old text tests stay green, so the memory change is invisible to every life that does not use a state line.
**Flag.** None (no consumer yet).
**Depends on.** Nothing (R1's text kit is on the base); wave 0 may have edited `pick.ts`, which this task does not touch.
**Hot-file notes.** `memory.ts` hunks are additive; `index.ts` one line (append: if wave 0 appended too, rebase trivially).
**Size.** About 221 lines (`state.ts` 150, `state-table.ts` 20, `memory.ts` 50, `index.ts` 1), about 320 test lines.
**Risks.** A bucket edge that a value hovers around makes the band flip each year; the 2-year gap and the variant exclusion bound the noise to one line in two years, which is still repetition, so rows whose value hovers should use a wider `logBand` ratio (R2-P9 uses 1.25 to 2). `s` costs at most 120 nodes (the memory stays under about 810 nodes).

---

### R2-P9 E.T3 (c): the status lines that repeat (part 1: state lines)

**Goal.** Put the yearly status lines of the worklist on `stateLine`, with no simulation change: the golden digests may move only for the `text` slice.

**Items covered.** E.T3 ("every file with a status line that repeats yearly"), RF6, R2 acceptance bullet on repeated lines.

**The worklist** (repeats beyond the first in the 13-life R1 baseline; sites at a65349a, find them again by the quoted text):

| Family | R1 repeats | Site | Row and call |
|---|---|---|---|
| "Around me: ..." | 36 (+2) | `src/game/economy/index.ts:47-50`, the `log` call whose text is `Around me: ` followed by `local.causes[0]` | `around.growth`, `around.credit`, `around.supply`; value the indicator that crossed (`local.growth`, `local.credit`, `local.supply`); band `() => 0`, because the caller already fires only on a crossing and the row's job is to stop the same crossing speaking again within 5 years; slot `{cause}`. The caller picks the kind of the first condition that crossed and skips the line when `causes[0]` is empty |
| Index days | about 30 | `src/game/investments.ts:2738-2739` (`crashed ... Good thing I had nothing in it`, `boomed ... I wish I had invested`) | `index.crash`, `index.boom`, value `Math.abs(m.pct)`, band `bandBy(0.2, 0.35)`, slots `{index}` (`idx`) and `{move}` (`moveText(m, 0)`) |
| Endorsement income | 16 (+5) | `src/game/special/sports-core.ts:600` (`I earned ${short(total)} from endorsements this year.`) | `endorse.income`, value `total`, band `logBand(1.5)`, slot `{money}`; the renewed and ended deal lines stay |
| Allowance | 22 in 10 lives | `src/game/events/wealth.ts:141` (`I paid ... in allowance this year.`) | `allowance.one` and `allowance.many`, value `paid`, `logBand(1.25)`, slots `{money}`, `{count}` |
| Loan paid back (part) | about 16 | `src/game/events/wealth.ts:163` (`paid back ... of what ... owes me (... to go)`) | `loan.back`, id `p.id`, value `left`, `logBand(2)` (speaks each time the debt halves), slots `{who}` (`cap(myOf(p))`), `{he}`, `{money}`, `{left}`. The line for the last payment (`left` is 0) stays as it is |

Not converted, on purpose: the tax, rent, living and homeless lines (`finance.ts:616, 628, 640-661`) already thin themselves and are Ledger-world's hot file; the "avoiding me" line (`wealth.ts:171`, R0-10) already comes once in five years per person and now counts 2 repeats in 13 lives.

Found by a static scan and left alone (39 `log` lines match "this year", "again", "still", "has been" outside the era packs and data; the ones below are yearly reports of a career or a market that the 13 generic lives rarely reach, so the probe does not rank them, and each belongs to the track that owns that career's log in R3 to R6): `src/game/special/hustler.ts:811` ("I made $N hustling on the streets this year"), `special/sports-fight.ts:2069` ("I made $N fighting this year"), `special/gamedev-make.ts:1170-1172` ("My games sold N copies this year ..."), `business/hedge-year.ts:71` ("My fund rose N% this year"), `crime.ts:3551` ("{family} paid me $N this year"), `assets.ts:4464-4465` (the housing market lines), `computer/online.ts:200` (the dial-up bill), `shops/everyday.ts:1607` and `shops/memberships.ts:862` (savings lines). Each is one `STATE_TABLE` row and one call when its owner wants it; the rule for them is the one above (no `rng`, `character`, `people`, `assets` or flag digest may move).

**Variants** (drafts, each checked against `staticLength` and `unitFlags(text, 'log')` and clean; the test of R2-P8 is the judge; keep them in plain narrator voice):

- `around.growth`: "Money got tight around me. {cause}" / "Times got harder in my town. {cause}" / "The squeeze reached my whole street. {cause}". `around.credit`: "Banks stopped lending around me. {cause}" / "Credit dried up where I live. {cause}" / "Borrowing got hard for the people I knew. {cause}". `around.supply`: "Shortages hit the shops around me. {cause}" / "Prices jumped on everything I buy. {cause}" / "Stores near me ran short of goods. {cause}".
- `index.crash`: "The {index} crashed {move} this year. Good thing I had nothing in it." / "The {index} fell {move}. I was glad to be out of it." / "The {index} dropped {move}, and I had nothing to lose." `index.boom`: "The {index} boomed {move} this year. I wish I had invested." / "The {index} jumped {move}, and I watched it from the sidelines." / "The {index} gained {move} without me."
- `endorse.income`: "I earned {money} from endorsements this year." / "The brands paid me {money} this year." / "Endorsements brought in {money}."
- `allowance.one`: "I paid {money} in allowance this year." / "My allowance cost me {money} this year." / "I handed out {money} in allowance." `allowance.many`: "I paid {money} in allowances and support to {count} people this year." / "I supported {count} people with {money} this year." / "{count} people leaned on me for {money} this year."
- `loan.back`: "{who} paid back {money} of what {he} owes me ({left} to go)." / "{who} sent {money} toward the loan. {left} to go." / "I got {money} back from {who}. {left} still owed."

The word-list rules flag "Everyone ..." and "Nobody ..." openers; the drafts above avoid them (two earlier drafts were rejected for exactly that).

**Files.**
- Modify: `src/game/text/state-table.ts` (the nine rows above, one hunk), `src/game/economy/index.ts`, `src/game/events/wealth.ts`, `src/game/investments.ts`, `src/game/special/sports-core.ts` (one import and one call each; the pattern is `const line = stateLine(g, 'key', value, { slots: {...} }); if (line) log(g, line, tone)` with the tone the old call had).
- Modify (tests): `test/text-repeat.test.ts` (the families table).
- Reads: `scripts/text-probe.ts` (R2-P7), `scripts/golden.mjs` (R2-P2).

**Tests** (`test/text-repeat.test.ts`, extended; write first). A table `FAMILIES: { name; re: RegExp; maxExtra: number }[]` over the 13-life result of `playProbe()`, matched against the normalized text: `around me:` (maxExtra 6), `crashed|boomed|fell|dropped|jumped|gained ... index|the .* (crashed|boomed)` for the index days (6), `endorsements` (4), `allowance` (3), `paid back|sent .* toward the loan|back from` (4). Each row asserts the pooled `extra` over the 13 lives is at most `maxExtra`. A row is red at the R1 numbers (36 against 6, 16 against 4, ...). If a family is already green because the post-wave-0 lives do not repeat it, keep the row and say so in the commit: the call site is still converted, because the source pattern is the bug. The table-lint test of R2-P8 covers the nine new rows automatically.

**Steps.**
1. Add the five table rows to `test/text-repeat.test.ts`; `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-repeat.test.ts` is red.
2. Add the rows to `state-table.ts`, then convert the five sites, one commit per site, each with its own measurement from the probe CLI (`node /tmp/text-probe.mjs --top 30`, see R2-P7) in the commit message.
3. After every conversion: `node scripts/golden.mjs check --plan pr`, and once at the end of the task `check --plan all` (the deep plan plays 90-year lives and reaches more sites; the `pr` plan may never hit a site, and then nothing moves at all, which is fine). It must report that at most `text` moved (the conversion changes prose and `textMem`, nothing else). If `rng` moves, the edit added or removed a draw (`stateLine` draws nothing, and none of these five sites drew): revert it. If `flagsPersonal`, `character` or `people` moves, the edit leaked into state: revert it. Then `node scripts/golden.mjs update --plan all --reason "text only: <site> on a state line"` and keep the `moved` list in the commit message.
4. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-repeat.test.ts test/text-lines.test.ts test/text-state.test.ts test/golden-digest.test.ts test/money-ratchet.test.ts test/foresight-scan.test.ts test/architecture.test.ts test/voice-guards.test.ts` (the ratchets prove no new money call, no future read, no new cycle, no new em-dash).

**Acceptance it proves.** About 110 of the 423 repeats are gone without moving a simulation slice.
**Flag.** None. **Depends on.** R2-P7, R2-P8, R2-P2 (`golden.mjs check`).
**Hot-file notes.** Each call site is one hunk of a few lines; see the hot-file table for the neighbours Ledger-world edits.
**Size.** About 230 lines (the nine rows about 110, the five call sites about 120), about 150 test lines.
**Risks.** A line that disappears in a year it used to print is the design (the log is the story, the books are in Books): note it in the release text. The `loan.back` slot `{left}` needs the money formatter already used on that line. After other tracks migrate `addMoney` near `wealth.ts:156` and `sports-core.ts:590`, re-apply the hunk by quoted text.

---

### R2-P10 E.T3 (d): the lines that need variants, and the threshold on

**Goal.** Give the single-template event lines and the scripted rhythm headlines variants, then turn the R2 repetition gate on and close the gap with the probe.

**Items covered.** E.T3, "turning on the E.T2 repetition threshold", R2 acceptance bullet 5.

**The worklist** (R1 repeats in the 13 lives; the first four do not suit a state line because each is an event or a report, not a state):

| Family | R1 repeats | Site | Change |
|---|---|---|---|
| "The Summer Olympics open" / "The World Cup kicks off" (news line, years after 2034) | 32 and 17 | `src/game/history/events-future.ts:131-136` (`futureHeadlines`) | three variants each by edition (`Math.floor((year - 2036) / 4) % 3` for the Games, `Math.floor((year - 2038) / 4) % 3` for the World Cup), pure functions of the year, no draw: "The Summer Olympics open" / "The Games open and the world tunes in" / "Athletes arrive for the Summer Games"; "The World Cup kicks off" / "The World Cup returns and fans pack the streets" / "Fans fill the stadiums as the World Cup starts" (the Winter Games line stays) |
| Pro-season recap | 10 + 10 | `src/game/special/athlete.ts:1025` | `pickLine(g, PRO_SEASON_LINES)` over three frames with `{nth}`, `{team}`, `{stats}` (the stats sentence already differs by sport) |
| "I lost $N to a scam." | 8 | `src/game/events/wealth-world.ts:237` | `pickLine(g, SCAM_LINES)`, slot `{money}` |
| "I spent $N on an admirer who left ..." | 4 | `src/game/events/wealth-world.ts:289` | `pickLine(g, ADMIRER_LINES)`, slot `{money}` |
| "I set money boundaries with X." | about 30 over many names | `src/game/events/wealth-resolve.ts:299` | `pickLine(g, BOUNDARY_LINES)`, slot `{who}` |
| "X: earned a promotion and higher pay" | about 25 | `src/game/npc-lives.ts:106-112` (`milestone`, the log line at 110; the promotion call at 278) | the logged text only: for the exact text `earned a promotion and higher pay`, log `pickLine(g, PROMO_LINES)`; the saved `l.history` keeps the original text, so no `people` digest moves |

Variants (drafts, voice-checked): `PRO_SEASON_LINES`: "I played my {nth} pro season with the {team}. {stats}" / "That was my {nth} pro season, still with the {team}. {stats}" / "Another year with the {team}, my {nth} as a pro. {stats}". `SCAM_LINES`: "I lost {money} to a scam." / "The {money} I sent was gone for good." / "I got scammed out of {money}." `ADMIRER_LINES`: the current line / "An admirer took {money} in gifts and then vanished." / "I paid {money} for an admirer who was never serious." `BOUNDARY_LINES`: the current line / "I told {who} no more money talk for a while." / "I said no to {who} and meant it." `PROMO_LINES`: the current text / "moved up at work and got a raise" / "was promoted and paid more". Each is exported from its module as `defineLines('<area>.<name>', [...])` so a test can import it, and filled with `fillSlots` (R2-P8).

**Files.**
- Modify: `src/game/history/events-future.ts`, `src/game/special/athlete.ts`, `src/game/events/wealth-world.ts`, `src/game/events/wealth-resolve.ts`, `src/game/npc-lives.ts`, `test/text-kit.test.ts` (53-62 and 81), `test/text-repeat.test.ts`, `test/text-lines.test.ts`.
- Reads: `src/game/text/pick.ts:49` (`pickLine`, on the text stream after wave 0), `src/game/text/registry.ts` (`defineLines`), `test/text-kit.test.ts:23-28`, `scripts/text-probe.ts`.

**Tests** (write first; red):
1. `test/text-lines.test.ts`: every exported pool (`PRO_SEASON_LINES`, `SCAM_LINES`, `ADMIRER_LINES`, `BOUNDARY_LINES`, `PROMO_LINES`, and the headline pools) has at least 3 lines, is registered under its id in `registeredLines()`, each line is at most 90 static characters (headline pools at most 70, the `headline` role), has `unitFlags` empty for its role with slots as holes, and no U+2014 or U+2013.
2. `futureHeadlines`: for each year 2036 to 2100, the Games line of two consecutive editions differ and the same line never returns within 3 editions; same for the World Cup; the line of a year is the same on every call (pure); the Winter Olympics line is unchanged; a year before 2035 gives the old pool.
3. `test/text-repeat.test.ts`, families (maxExtra): the news rhythm lines (4), the pro season (3), `scam` (2), `admirer` (2), `boundaries` (4), `promotion` (4).
4. **The gate** (red first, green last): `ratioToR1(playProbe(13)) <= 0.5`, i.e. the pooled repeated-line share of the 13 lives is at most half of R1's 0.0831 (0.0415). The message prints the share, the ratio, the top 10 families and "convert the next heaviest family (scripts/text-probe.ts), do not move the baseline".
5. `test/text-kit.test.ts`: `enforce` splits into `enforceAlways` (`repeatedShare` at the design 5% and 8% for rich lives) and `enforceAll` (the rest, still under `TEXT_KIT_ENFORCE=1`). `enforceAlways` goes on only if the four lives pass it with the conversions in; if one does not (the R1 rich life was 9.2%), leave `repeatedShare` under the opt-in, record the four numbers in the PR and say so. Nothing is deleted or loosened: the opt-in set only ever grows.

**Steps.**
1. Write tests 1 to 5; `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-lines.test.ts test/text-repeat.test.ts` is red (gate and families).
2. Convert the six sites, one commit each, with the probe numbers in the message. A `pickLine` conversion draws on the text stream only; if `rng` moves after one, `pickLine` is still on `g.rng` (wave 0's gap): stop and report. After each: `node scripts/golden.mjs check --plan pr` may say `text` moved and nothing else (the news headlines are log lines, so `text` is right), and `check --plan all` once at the end of the task; update with a reason as in R2-P9.
3. Run the gate. If it is red, read the probe table: `node /tmp/text-probe.mjs --top 40`, convert the next heaviest family with the same pattern (the candidates, in the R1 order: the health pools in `src/game/health.ts:427` and `:580` (add two lines to each small pool; `freshLine` there already excludes the last three), the donation causes in `src/game/events/wealth-world.ts:58`, "I re-signed with ..." in the sports modules, the tax line `finance.ts:616` (only if Ledger-world's hunks allow it)) until the pooled share is at most 0.035, which leaves the margin the gate needs against seed noise. Each family converted this way gets a row in `FAMILIES`.
4. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-repeat.test.ts test/text-lines.test.ts test/text-kit.test.ts test/text-metrics.test.ts test/golden-digest.test.ts test/voice-guards.test.ts test/history.test.ts test/year-integration.test.ts` (the last two read the future headlines: `history.test.ts:133` walks `FUTURE_POOL_SIZE` years past 2026 through `allHeadlines`, `src/game/history/events.ts:101`).

**Acceptance it proves.** Criterion 5: the repeated-line rate of the 13-life probe is at most half of R1's, in a test that fails the build when it is not, and the simulation did not move (golden: `text` only).
**Flag.** None. **Depends on.** R2-P9 (the table and the families table).
**Hot-file notes.** One-line or small hunks as listed; `events-future.ts` changes one hunk and `FUTURE_POOL_SIZE` is untouched.
**Size.** About 210 lines (call sites 140, pools 70), about 220 test lines.
**Risks.** The bar is tight: the conversions listed account for about 250 of 423 repeats, and wave 0's `pickLine` removes more in the pools it covers, so 0.035 is reachable but not guaranteed; the loop in step 3 is the plan for that, and the probe table is the evidence the lead reads. A rewritten line must stay within the era rules (`anachronismsIn`): none of these lines names a technology. The headlines reach the log through `allHeadlines` (`src/game/history/events.ts:101`), which `test/history.test.ts` and `test/year-integration.test.ts` walk: they run in step 4.

---

### R2-P11 K.7b (g): the integration pass

**Goal.** After Ledger-world, Kernel and Save have merged, make every new kit true of the merged tree and regenerate the golden file once.

**Items covered.** The R2 exit gate ("a written list of every seeded test that moved and why"), F.1.

**Files.**
- Modify: `test/stream-tap.ts` (`STREAM_SLICES`, one row per stream tag the other tracks introduced), `test/ceiling-kit.ts` (`CEILING_PROBES`: one row per new entry of `test/ceiling-list.json`, the seven Ledger-world adds, see step 3), `test/golden-kit.ts` (`TOP_KEYS`, one row per new top-level `GameState` key), `test/old-saves.test.ts` (the `world` absent check, and a store-level reload if Save's loader has a testable entry), `test/replay-purity.test.ts` (a second reload leg through the new save store if one is exported), `test/fixtures/golden-digests.json`, `docs/CI.md` (the golden and nightly sections brought in line with what shipped), `docs/superpowers/plans/2026-10-21-r2-v5.0.0/moved-seeds.md` (wave 0's R2-C file; a new section is appended, step 8).

**Steps.**
1. Rebase onto the integrated `release/v5.0.0`. Re-apply any hunk of R2-P9 or R2-P10 that a money-call migration moved (quoted text, not line numbers).
2. Run the guards the other tracks could not see: `/Users/saeed/projects/anotherlife/wt/bin/vt test/golden-kit.test.ts test/stream-isolation.test.ts test/ceiling-probe.test.ts test/old-saves.test.ts test/replay-purity.test.ts`. Each failure names what is missing (an unclassified top key, a stream tag without a row, a ceiling-list id without a probe, a fixture that does not run); fix by adding the row, with a one-line `why`.
3. Ledger-world's seven new ceiling-list entries (cross-check: the first draft named only the mints and burns, but the guard of R2-P4 needs a probe row or an exemption for every id, and at most 3 exemptions are allowed): `mint-caps`, `burn-caps`, `ledger-caps`, `pool-spreads` (R2-L2), `bond-par`, `transaction-levy` (R2-L13), `lod-caps` (R2-L16). One `CeilingProbe` each, none exempt: `mint-caps` and `burn-caps` book `scale` times each cap's volume through `bookMint` and `bookBurn` and assert the year's total is at most `MINTS[name].cap` and `BURNS[name].cap` (both tables live in `src/game/kernel/reasons.ts` and are re-exported by `kernel/ledger.ts`); `ledger-caps` books `500 * scale` distinct accounts and `480 * scale` flow keys and asserts at most 500 accounts and 480 flow rows; `pool-spreads` buys and sells `scale * 10_000` in every pool of `SPREADS` and asserts the round trip loses at least `2 * s` of the mid price; `bond-par` redeems a bond holding of `scale * 1_000` units through the yearly investment move with `dep` 0 and asserts the payout is at most `units * BOND_PAR`; `transaction-levy` asserts `transactionsLevy(g, amount * scale)` is at most `0.003 * amount * scale` at level 3; `lod-caps` promotes `scale * 400` ids of each kind through `promote` and `lodSweep` and asserts the rows left are at most the cap `lodSweep` enforces for the kind. Import names from the merged tree and fix a changed name here, not in the other track.
4. Regenerate once, under Node 22: `node scripts/golden.mjs update --plan all --reason "R2 integration: ledger, registry and save v3 merged; moved <slices>: <one clause each>"`, and paste the `moved` list into the PR. Then `node scripts/golden.mjs check --plan all` exits 0.
5. `grep -rnE "seed: [0-9]" test/golden-*.ts test/stream-*.ts test/ceiling-*.ts test/old-saves.test.ts test/nightly-*.ts test/text-probe.ts test/text-repeat.test.ts test/replay-purity.test.ts` shows nothing (plans are written with the `life(...)` helper, so wave 0's pin ratchet `test/seed-pins.test.ts` stays at its baseline); run that test too.
6. `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/ci-shard.test.ts test/golden-digest.test.ts test/nightly-workflow.test.ts test/nightly-lib.test.ts test/text-repeat.test.ts`.
7. Tell the lead the file-time list for the timings refresh (lead action 3), the measured wall time of the smoke nightly (R2-P6), and which hard rules of `RULES` the merged tree already trips, if any.
8. The exit gate's "written list of every seeded test that moved and why" is split by owner: wave 0's R2-C writes `moved-seeds.md` for the rebaseline; this task appends a section "Pinned numbers moved by the other tracks" from the commit messages of the merged tracks and checks each line against the tree: Ledger-world R2-L3 (`erodeCash` rounds cash to whole dollars: `character` digests), R2-L6 (same-year house resale capped at the sellers' spread), R2-L13 (`test/investments.test.ts:294` renamed and tightened to the capital gains rate, bond maturity at eroded par), Save R2-S2 (ten tests pinned `SAVE_SCHEMA` at 2, plus `save-store.test.ts:1220`), R2-S9 (`time-machine.test.ts:223-224`, the world frame count), R2-S10 (`probe-life.test.ts:12`, `living-economy.test.ts:142`, `world2-trade-invariants.test.ts:153`, `world2-performance.test.ts:94`: `previous` pruned, history 16), Kernel (none: its two parity fixtures stay unchanged), and this track's own golden regeneration (the `moved` list of step 4).

**Acceptance it proves.** Every acceptance bullet of this track on the merged tree; the golden history now holds the written list the exit gate asks for.
**Flag.** None. **Depends on.** Ledger-world, Kernel and Save merged; R2-P1 to R2-P10.
**Hot-file notes.** Rows are added to data tables in my own files; the golden JSON is regenerated whole.
**Size.** About 150 lines of rows (seven ceiling probes, the stream rows), about 60 test lines.
**Risks.** A real finding here (a fixture that no longer runs, a stream that leaks into another slice) is a bug in another track's merge, not a reason to widen a row or exempt a probe: report it to the lead with the failing slice and `explainMove` output.

---

## 4. Plan vs code (where the roadmap and the code differ, and what I did)

1. **The 13-life probe does not exist.** The roadmap and design name "E.T2's 13-life probe", but the R1 harness plays 4 lives (`test/text-kit.test.ts:23-28`) and its baseline records 4 (`test/fixtures/text-baseline.json`). The only 13-life set in the repo is the notice probe (`test/notice-probe.test.ts:16-19`, seeds 101 to 113). R2-P7 builds the repeat probe on those lives and records R1's number from this tree: 423 repeats in 5,093 lines, 0.0831.
2. **The worst repeat today is not the sister line.** "My sister N has been avoiding me ever since I lent her money" (48 times in 10 lives in digest E) was gated by R0-10 (`src/game/events/wealth.ts:168-171`, once in five years per person) and counts 2 repeats in 13 lives now. The measured worst families are "Around me: ..." (36), the Olympics and World Cup news lines (49 together), endorsement income (21) and the pro-season recap (20).
3. **State lines already exist six times by hand.** `changedALot` (`finance.ts:573`), the `livingLineAge` and `homelessLineAge` gates (`finance.ts:640-661`), `marks.avoid` (`wealth.ts:168`), `freshLine` (`health.ts:284`) and `freshPick` (`finance.ts:581`). `stateLine` is their one replacement; this release converts only the families the probe ranks, and leaves `finance.ts` alone because Ledger-world owns its money calls.
4. **`src/game/text/` exists and is unused.** R1 shipped `pickLine`, `hpick`, `defineLines`, the memory and the rings; only `events/flavor.ts` uses the rings (`flavor.ts:576, 645`). No `defineLines` voice test exists (the design's "registry test" is not in the repo); R2-P8 and R2-P10 add the lint for the pools they introduce.
5. **The golden slice list leaves fields out.** `GameState` also holds `version`, `schemaVersion`, `lifeId`, `nextId`, `year`, `generation`, `counters`, `yearActions`, `ancestors`, `ribbon`, `obituary` (`src/game/types.ts:685-714`), and person notes and character memories are prose inside `people` and `character`. R2-P1 places each and extends `text` with the prose; the guard test makes any new key a deliberate choice.
6. **Platform merges last.** So the golden gate protects nothing until the end of this release train: the three earlier tracks cannot run it, the first file is recorded on the wave 0 base, and R2-P11 regenerates it on the merged tree. Tracks add their `STREAM_SLICES` and `TOP_KEYS` rows at integration, not in their own branches.
7. **"The v4.0.2 fixture" is `save-v1.json.gz`.** Six tests (`books-menu`, `chart-books`, ...) call that file "the v4.0.2 fixture"; it has the v2.4.0 shape. `test/save-schema.test.ts:86` expects a `save-v<n>.json.gz` for every schema below the current one. Save adds the new fixtures; `old-saves.test.ts` finds them by listing the directory.
8. **`scripts/*.ts` is not type-checked.** `tsconfig.json` includes `src`, `test` and `vite.config.ts` only, so logic that is bundled for the nightly (`nightly-probes`, the golden CLI) lives in `test/` and the `scripts` entry is a thin file; `.mjs` scripts get a `.d.mts` (as `scripts/ci-shard.d.mts` does).
9. **A scheduled workflow runs only from the default branch.** `release/v5.0.0` is not it, so `nightly.yml` carries a `pull_request` trigger on its own files at smoke size; that is the only way to prove it before release.
10. **No CI workflow edit for the golden job.** The roadmap says "golden-digest job"; the test is in the fast tier (`// ci: fast`, `.github/workflows/ci.yml:52`), runs in about 20 s and its failure names the slice, so a separate job would only duplicate a checkout and install. The `CI gate` already requires `fast`.
11. **Measured costs** (this tree, Node 22, one process): 13 lives to age 85, 20.7 s (1.3 to 2.5 s a life); 40 mixed balance lives, 44.6 s; a birth-life year step p50 21.5 ms, p95 24.8 ms, max 83 ms (1,239 years); 100x founder lives, 8.7 s for 8 lives of 20 years.
12. **The roadmap's `findSeed` rule.** The new tests play lists of lives (plans and specs), never an outcome pinned to one seed, so none uses `findSeed`; R2-P11 greps to prove it.

## 5. Assumptions, risks and open points

**Assumptions.**
- Wave 0 lands `src/game/kernel/streams.ts` with `stream(g, tag, year, id?)` and moves `pickLine`'s draw onto the text stream, as the lead's brief says. If not, R2-P3 and R2-P9 fail loudly and name the cause; this plan never loosens them.
- The Node major in `ci.yml` (22) is the one the golden file is written with.
- The repo is public (free CI) and the nightly may use about 160 runner-minutes a night.
- The `fast` job can take the two new fast-tier files (`golden-digest` and `stream-isolation`, about 20 s each, the tier's budget is 5 minutes).

**Risks (collected).**
1. A real leak found by R2-P3 or R2-P4 (text that is really state, a fixture that no longer runs) belongs to the owning track; the fix is small and local or it is reported. No test is weakened to pass.
2. R2-P10's bar (half of R1) is tight; the probe table and the "next heaviest family" loop are the plan for it, and the target (0.035) leaves margin for the seed noise the rebaseline adds.
3. Golden file churn: each release that moves a digest regenerates it; merges are by regeneration, never by hand, and one line per (life, checkpoint) keeps accidental conflicts small.
4. Nightly sizes are estimates (fuzz time per seed at 160 years is unmeasured): the budget flag caps a life, the metrics record what was played, and one function resizes it.
5. Ledger-world and Save edit lines within 10 of my conversion hunks; Platform rebases last and re-applies by quoted text.

**Open points for the lead.**
1. Confirm the routing of the leftover `GameState` fields (R2-P1 table) and that `text` includes cache flags, person notes, character memories and the obituary.
2. Should the deep golden plan gate pull requests? Here it runs only nightly (a PR that moves a digest regenerates both plans with `--plan all`, but only the `pr` plan is checked before merge).
3. Over budget by about 750 lines against the roadmap's 2,400 (K.7b 700, E.T3 40); the cut list is in section 1.
4. The golden test plays 3 lives by 20 to 32 years in the fast tier (about 20 s). If the tier must stay under 3 minutes, move `stream-isolation` to a shard (one `// ci: fast` line).
5. Replay, reload and fork (R2-P3) have no owner in the roadmap; this track took them. Drop them from R2-P3 if another track owns RF5.
