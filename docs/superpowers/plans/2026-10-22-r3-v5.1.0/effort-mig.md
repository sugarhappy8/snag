# R3 plan, Effort migration track: every research system on one engine (track `effort-mig`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0` (`main` at v5.0.0, 85e147b; R0-3, a0e36d3, is already in it and deleted `executive-foresight.ts`). Code read in `/Users/saeed/projects/anotherlife/wt/r3-release`; nothing was edited except this file. Every path marked "modify" exists today; "create" paths do not. Plain hyphens only (no U+2014, no U+2013). The Effort core is another planner's (`effort-core.md`): its names are consumed here as the lead fixed them (`quote`, `step`, `flags['effort.you']`), and every other name I assume from it is listed in section 2 and in the open questions for the cross-check.

## 1. Track summary

**Items covered (12 tasks).** C.3, one system per task: R3-M2 Product R&D, R3-M3 Heavy R&D, R3-M4 Operations R&D with the research team, R3-M5 deep tech, R3-M6 AI capability tracks, R3-M7 studio engines, R3-M8 the Workshop's build and brainstorm odds; R3-M0 the parity oracle and R3-M1 the shared business seam are the two things every system needs. C.4: R3-M9 gives the Workshop the engine's inputs (focus weeks, tools and lab access, a bench assistant, ambition). J.8: R3-M10 the top-CEO benefit. R3-M11 is the sweep that owns the cross-system acceptance.

**Not in this track.** `src/game/effort/*`, the company and personal knowledge stores, `flags['effort.you']`, the focus-week pool, burnout, the `why` text builder (Effort core); `know`, `Estimate`, Exact mode (Knowledge); `g.world.frontier` and the "rival first" failure cause (Frontier); the digest hooks `s`, `a`, `w` (Quiet years); the hint sites (Fog). J7 (staff skill into R&D odds) is C.3 itself (roadmap line 108). J4 is careers onto the kit (R6 and later), not here. School, lessons, athletics and kit practice (C.5) are R6. `business/yearly.ts` is listed as a hot file in the roadmap; this track does not edit it (nothing here is a new yearly step: the migrated functions stay where `economy.evolve`, `bookLabYear`, `simulateDeepTechYear` and `simulateStudioYear` already call them).

**What I measured** (this worktree, 2026-10-22, by grep and reading):

| Fact | Value | Where |
|---|---|---|
| Draw sites that must keep their order | Product `chance(odds)`, `chance(HIT_P)`, `rand` | `business/rd.ts:457,463,464` |
| | Heavy the same three | `business/heavy-rd.ts:507,512,513` |
| | Ops one `chance` per finished program, in track order | `business/lab-year.ts:178` |
| | deep tech one `chance(finalOdds)` per finished program or trial | `business/deeptech-rd.ts:209` |
| | studio development draws nothing (only licensing does) | `business/gamestudio-engines.ts:93,98,106` |
| | Workshop build: `rand` for kaboom (:139), for quality (:144), for the health loss on a kaboom (:171), and the text pick (:103) | `workshop/build.ts:103,139,144,171` |
| Systems that already take a list of named inputs | none; five different odds formulas | `rd.ts:30,172`, `heavy-rd.ts:329`, `lab-rules.ts:38`, `deeptech-rd.ts:61,177`, `deeptech-data.ts:1296-1298`, `build.ts:48` |
| Modules of the 59-module `business/` cycle among the files to edit | `rd.ts`, `heavy-rd.ts`, `lab-rules.ts`, `lab-year.ts`, `deeptech-core.ts`, `gamestudio-engines.ts`, `economy.ts`, `board-ceo.ts`, `manage.ts`, `product-market.ts` | `test/architecture-baseline.json` |
| Files to edit that are not in a cycle | `lab-state.ts`, `lab-data.ts`, `deeptech-rd.ts`, `deeptech-data.ts`, `deeptech-state.ts`, `ai-bench.ts`, `gamestudio-engine-state.ts`, `board-state.ts`, `dynamics.ts`, `leadership.ts`, `util.ts`, all of `workshop/` | same |
| Other places that start an `RdProject` besides `startRd` | the hired CEO pushes one directly, from `bestRdWithin`'s odds | `business/board-ceo.ts:566` |
| Counters the focus-week pool replaces in R3 | `workshop.build` (3, genius 5), `workshop.brainstorm` (2); `workshop.launch` stays | `workshop/build.ts:23-28,135,210,220` |
| Tests that pin a hard stop at the counter | one: the fourth build is refused | `test/workshop.test.ts:199-201` |
| Tests that reset the year by `g.yearActions = {}` | 6 sites in 3 files | `test/workshop.test.ts:47,588,590`, `workshop-money.test.ts:148,150`, `workshop-balance.test.ts:36` |
| Strings tests pin exactly (so they must not change) | log `X's Y flopped.` (array `toContain`); `Y flopped in testing (money of R&D)` (substring); `Coding research stalled. The same level costs the same again.` (`toBe`); the Heavy `R&D Underway` notice is at most 120 characters | `heavy-story.test.ts:263,462`, `ai-bench-research.test.ts:27`, `heavy-voice.test.ts:47` |

**Line budget.** About 3,900 source lines against the roadmap's 3,800 (C.3 2,500, C.4 1,000, J.8 300); "source" counts `src/` plus kit and guard code under `test/`, as in the R2 plans. C.3 runs 15% over (the oracle kit and the seam are shared work the 2,500 did not name), C.4 and J.8 run under. Tests about 4,300 lines (ratio 1.1, under the roadmap's 1.16). Data: `test/fixtures/effort-parity.json` (about 3,000 rows, one per line, about 250 KB) and one doc, `docs/EFFORT-MIGRATION.md` (about 120).

| Task | Item | Lane | Source | Tests |
|---|---|---|---|---|
| R3-M0 parity oracle | C.3 | main | 400 | 140 |
| R3-M1 business seam | C.3 | main | 220 | 200 |
| R3-M2 Product R&D | C.3 | main | 440 | 520 |
| R3-M3 Heavy R&D | C.3 | ops | 230 | 330 |
| R3-M4 Ops and the research team | C.3 | ops | 330 | 460 |
| R3-M10 top CEO | J.8 | ops | 260 | 300 |
| R3-M5 deep tech | C.3 | dt | 380 | 420 |
| R3-M6 AI capability tracks | C.3 | dt | 260 | 300 |
| R3-M7 studio engines | C.3 | dt | 250 | 300 |
| R3-M8 Workshop on quote | C.3 | ws | 360 | 380 |
| R3-M9 Workshop inputs | C.4 | ws | 650 | 640 |
| R3-M11 sweep | C.3, J.8 | main | 120 | 330 |
| Total | | | 3,900 | 4,320 |

**Acceptance criteria of the R3 block that this track owns, and the test that proves each** (the rest of the R3 acceptance is the core's, Knowledge's, Quiet's and Fog's).

| Criterion | Proven by | Task |
|---|---|---|
| "Parity grid within 1 point for Product, Heavy, Ops, deep tech, AI caps, studio and workshop": 1 percentage point on odds, 1 on quality, exact years and exact price | `test/effort-<system>.test.ts` against `test/fixtures/effort-parity.json`, recorded on the unmodified code in M0 | M2 to M8 (one system each) |
| "No seeded run shifts": at default ambition (A 50, steady, no fatigue, K 0) the migrated code is exact, and each system's scripted lifecycle leaves `g.rng` and the products or levels it made identical to the oracle | the `lifecycle` rows of the same fixture | M2 to M8 |
| Failed research banks knowledge, at most 15 odds points on the next try in that field, and shows it (the R3 probe "failed research banks at most 15 odds points"; "research must pay visibly") | per system: a forced flop, then the same field's next quote is higher by more than 0 and at most 15 points, another field's quote is unchanged, and the reasons name it | M2 to M8 |
| "No g.rng in any read" and "`quote` never reads `u`" for the systems migrated | per system: `noDraw` around every quote, hint and menu row it feeds, and a deep-frozen state through the existing fuzz walk | M2 to M9 |
| "Money buys odds and speed, never a lower price; k at most 4"; "no money beyond the market" | a 100x probe in the sweep: each task cost is unchanged by 100x cash, valuation and headcount, `k` never passes the task's `kmax`, and the odds stay under the legacy clamp | M11 |
| J.8: a top hired CEO gets a real benefit that moves no money | `test/effort-top-ceo.test.ts`: the benefit shows as a named reason, is at most 3 odds points, the ledger and `strategicIncome` are untouched | M10 |
| Old saves load; every new saved field is optional, validated, bounded | `test/old-saves.test.ts` plus the round-trip rows in each task that adds a field (`fx` on `RdProject`, `TechProgram`, `StudioEngine`, `LabProgram`; `helper` in the workshop record) | M2, M3, M4, M5, M7, M9, M11 |

**Lanes** (4; different lanes edit different files, so they run at the same time in separate worktrees and merge at the end):

| Lane | Tasks, in order | Source | Why one lane |
|---|---|---|---|
| `main` | M0, M1, M2, M7, then M11 last | 1,180 | M0 and M1 gate the others; M2 owns `rd.ts` |
| `ops` | M3, M4, M10 | 820 | `heavy-rd.ts`, `lab-*.ts`, `board-ceo.ts`; J.8 is tested on Heavy and Ops quotes |
| `dt` | M5, M6 | 890 | `deeptech-*.ts`, `ai-bench.ts`, `gamestudio-engines.ts`; M6 builds on M5's `finalOdds` |
| `ws` | M8, M9 | 1,010 | all of `workshop/`; needs no business seam |

**Hot files and who touches them** (every edit is additive and in its own hunk):

| File | Touched by | Note |
|---|---|---|
| `business/rd.ts` (491) | M1 (lines 29-32 `launchP`, one new function after it), M2 (167-184, 338-374, 432-491) | M3, M4, M10 only import from it |
| `business/state.ts` | M2 (`RdProject` 68-93, `projectExtras` 637-642) | one optional field |
| `business/manage.ts` | M2 (`rdPreview` 483-496), M3 (`heavyAction` 569-584) | one appended phrase each; Fog edits other hunks of this file (hints 497-640) |
| `business/heavy-rd.ts` | M3 (329-336, 409-444, 503-538) | |
| `business/lab-rules.ts`, `lab-year.ts`, `lab-state.ts`, `lab-menu.ts` | M4 (`lab-rules.ts` 28-41; `lab-year.ts` 126-160, 164-197; `lab-state.ts` 30-70; `lab-menu.ts` 97) | |
| `business/board-ceo.ts` | M10 (one letter line before `ceoLetter`, :725) | |
| `business/deeptech-rd.ts` | M0 (`export` on `finalOdds`, line 177), M5 (61-68, 177-188, 191-250), M6 (one note in the loss branch, 231-239) | M5 then M6, same lane |
| `business/deeptech-state.ts`, `deeptech-menu.ts` | M5 (`TechProgram` 53-73, `readProgram` 331-346; preview 170-178) | |
| `business/deeptech-data.ts`, `ai-bench.ts` | M6 (`capProgram` 1288-1312; `modelRating` 146-157) | |
| `business/gamestudio-engines.ts`, `gamestudio-engine-state.ts` | M7 (dev branch 70-85; `StudioEngine` 30-48, `normalizeEngines` 62) | |
| `workshop/build.ts` | M8 (48-60, 63-67, 128-196, 203-205), M9 (23-28, 81-87, 135, 207-221) | same lane, in order |
| `workshop/state.ts`, `menu.ts`, `yearly.ts` | M9 (record 32-51 and `normalizeWorkshop` 145-175; rows 91 and 229; wage in `yearlyWorkshop` 211-238) | |
| `test/ceiling-list.json`, `test/ceiling-kit.ts` | M9 (after the `adaptation-royalty` row), M10 (after the `pay-scale` row) | different anchors on purpose; if they still conflict at the merge keep both rows, order is free |
| `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` | every lane, under its own heading | the lead creates the file with four headings first (lead action 2) |
| `src/game/modules/index.ts`, `world-flags.ts`, `save-slices.ts`, `aging.ts`, `yearly.ts` | nobody | no new yearly step, flag or slice here (the new fields live inside `assets[].details`, which the assets slice already covers, and inside `flags.workshop`) |

**Order and schedule** (at most 3 test-running agents at once):

1. R3-M0 starts at once, on the unmodified code, in parallel with the Effort core, Knowledge and Quiet years. It merges alone first.
2. R3-M1 starts when the Effort core's `quote`, `step` and `effort/contract.ts` are on `release/v5.1.0` and M0 is merged; it merges alone second (it is small).
3. Then four lanes at once: `main` M2, `ops` M3, `dt` M5, and `ws` M8 (M8 needs M0 and the core, not M1). Each lane's worktree starts from the head that holds M0, M1 and the core.
4. R3-M11 starts after the lead has merged `ops`, `dt` and `ws` into `main`'s worktree, because it checks the systems together.
5. The track merges into `release/v5.1.0` after Frontier and before Fog; Fog and this track both touch `business/` menus, so the two merges are serialized (roadmap line 228).

**Lead actions** (none can be done by an implementer):

1. Start M0 now. Tell the other lanes' agents to wait for M0, M1 and the core's merge.
2. Create `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` on `release/v5.1.0` before the lanes start: the header `| file | test | before | after | why |` and four headings `## main`, `## ops`, `## dt`, `## ws`, so the lanes' rows land in different hunks.
3. Run `node scripts/golden.mjs check` under Node 22 once, after M11 merges. Expected: no digest moves in the `pr` plan. If the `assets` slice moves, it can only be because a golden life's company flopped an R&D project and banked knowledge; update with `--reason` naming that, never otherwise.
4. Add `test/effort-*.test.ts` to `scripts/test-timings.json` at the next timing refresh (each about 20 to 40 s on a free machine; they weigh the 5 s default until then).
5. Reconcile section 2 with `effort-core.md` and `knowledge.md` (open questions 1 to 9), and settle the other tracks' task ids for the `dependsOn` fields (open question 12).
6. Decide open question 10 (the J.8 threshold) and 11 (the Workshop's soft limit) before M9 and M10 start; both change a rule the owner may want to see.

## 2. Contracts

**Consumed from the Effort core.** Fixed by the lead: `quote(g, task, inputs)` returns `{ p, reasons }`, never reads the roll and never draws; `step(g, task, outcome)` books a result; the player's record is `flags['effort.you']`, owner-stamped (ambition, posture, fatigue, focus weeks, banked knowledge); company research knowledge lives with the company. Everything else in this table is **assumed** (the audit's `Task` and `Input`, design 5.2 to 5.6); `effort-core.md` wins and the cross-check reconciles. Rule (c) of the layer ratchet means `business/` and `workshop/` reach the core only through its `contract.ts`, so every import below is `from '../effort/contract'`.

```ts
// src/game/effort/contract.ts (assumed names)
export type Posture = 'lean' | 'steady' | 'push'
export interface EffortCalib { p0: number; oddsExp: number; yearsExp: number; minYears: number; maxYears: number; pMin: number; pMax: number } // today's numbers (design 5.11 "each system sets p0, years, exponent")
export interface EffortTask { id: string; field: string; mode: 'project' | 'practice' | 'study' | 'intel'; cost: number; hardness: number; baseYears: number; ceiling: number; kmax: number; calib?: EffortCalib }
export interface EffortPerson { fte: number; skill: number; morale: number; drive: number; fatigue: number }
export interface EffortReason { key: string; label: string; pts: number }            // pts are odds points; the line "team +9, funding +7, hard field -12, tired -4"
export interface EffortInputs { people: readonly EffortPerson[]; k: number; knowledge: number; tools: number; posture: Posture; owner: EntityRef; extra?: readonly EffortReason[] }
export interface EffortQuote { p: number; years: number; quality: number; cost: number; reasons: readonly EffortReason[] }
export interface EffortRecord { /* the optional `fx` object: progress, quality, spent, setbacks, insight, fatigue, last */ }
export type EffortOutcome = { owner: EntityRef; ok: boolean; hit?: boolean; margin?: number; fx?: EffortRecord; now?: EffortInputs }
export function quote(g: GameState, task: EffortTask, inputs: EffortInputs): EffortQuote
export function step(g: GameState, task: EffortTask, o: EffortOutcome): { learned: number; cause: EffortCause | null }
export function startRecord(q: EffortQuote, year: number): EffortRecord
export function readFx(raw: unknown): EffortRecord | undefined                       // validated, bounded, undefined when absent or damaged
export function companyKnowledge(g: GameState, owner: EntityRef, field: string): number   // 0-100
export function playerPosture(g: GameState): Posture                                 // from flags['effort.you'], steady by default
export function causeWords(c: EffortCause): string                                   // at most 60 characters
export function whyText(reasons: readonly EffortReason[], max?: number): string      // "Odds 62%: team +9, ..." 
export function focusLeft(g: GameState): number                                      // weeks left in this year's pool of about 12
export function useFocus(g: GameState, weeks: number): { over: number }              // weeks past the pool become fatigue, not a refusal
export function burnedOut(g: GameState): boolean
```

What I rely on the core to do: at default inputs (A 50, steady, no fatigue, K 0) `quote` returns exactly the `calib` numbers (that is what makes parity exact); every deviation is a labeled reason; K adds at most 15 odds points and fades 5% a year idle; `step` draws nothing and is idempotent by the record's `last`; the player's pool is year-stamped (`{ y, used }`), so a new `g.year` is a fresh pool (open question 4).

**Provided by this track** (other tracks may rely on these exact names):

| Provided | By | Used by |
|---|---|---|
| `test/effort-parity-kit.ts`: `SYSTEMS`, `GRIDS`, `probe(system)`, `lifecycle(system)`, `parityDiff(system, file)`, `TOL`, `recordParity()`; `test/fixtures/effort-parity.json`; `RECORD_EFFORT_PARITY=1` | R3-M0 | every system test of this track; R6 (school, lessons) and R9 (domains) add a system id and a grid the same way |
| `business/research-effort.ts`: `ResearchSnap`, `launchSkill`, `launchTeam`, `researchPeople`, `researchActor`, `researchInputs`, `bookResearch` | R3-M1 | M2 to M7, M10 |
| `business/rd.ts`: `researchState(g, b): ResearchSnap`; `RdQuote.why` | R3-M1, M2 | the Fog and People-UI tracks (a research screen's "why") |
| `heavyWhy`, `opsWhy`, `programWhy`, `buildWhy` (each returns `readonly EffortReason[]`, pure) | M3, M4, M5, M8 | the core's C.11 panels |
| `opsKnowledge(b, track): number` and `capKnowledge(t, cap): number` (0-100 views of the lab level and the capability research level) | M4, M6 | Knowledge ("look closer" rows) |
| `workshopTools(g): number` (0-1) and `workshopHelpers(g): number` (0-2) | M8, M9 | School tiers in R6 |
| `topCeoSteady(skill: number): number` (0-1) in `business/ceo-edge.ts` | M10 | any later track that wants the same bounded edge |
| ceiling rows `top-ceo-edge`, `workshop-overtime`, `workshop-tools` | M9, M10 | `test/ceiling-probe.test.ts` |
| `docs/EFFORT-MIGRATION.md` | M11 | R6 and R9 |

**The adapter rule** (every task obeys it; `test/architecture.test.ts`, `layers.test.ts` and `layers-domains.test.ts` prove it).

1. Each system gets a leaf adapter file (`rd-effort.ts`, `heavy-effort.ts`, `lab-effort.ts`, `deeptech-effort.ts`, `aicap-effort.ts`, `studio-effort.ts`, `workshop/effort.ts`). It exports a task builder and an input builder as pure functions of **numbers and plain records**, and imports only modules outside the 59-module cycle (`util`, `state`, `lab-state`, `lab-data`, `leadership`, `dynamics`, `board-state`, `deeptech-state`, the core's `contract`). The cycle members (`ceoSkill`, `staffPower`, `rdCost`) are called by the legacy function, which passes their results in. A new file that joined the cycle would fail the architecture ratchet.
2. The legacy exports keep their names and signatures (`rdQuote`, `launchP`, `heavyOdds`, `opsOdds`, `programTerms`, `finalOdds`, `buildOdds`, `brainstormOdds`, `simulateStudioEngines`, `modelRating`) and become wrappers over `quote`. The 207 hint sites and every menu row stay as they are; no call site changes.
3. No module-level `const X = importedValue` in an adapter (rule d); literals only.
4. Every draw stays where it is, in today's order. `quote` and `step` are called around the draws, never between two of them in a way that adds one. `quote` is called from reads (menus, hints, planners), so adapters write nothing and draw nothing.
5. Only the player's own companies bank knowledge: `advanceRd(g, b, year)` finds the asset (`rd.ts:438`); with no asset it is an NPC company and `bookResearch` does nothing, so the NPC economy and the golden digests keep today's bytes.
6. A new `fx` key is written only when it carries information (a stored posture other than steady, a setback, a banked cause). At default the saved shape is byte for byte today's, which keeps `toEqual` pins such as `test/growth.test.ts:647` and the old-save fixtures as they are.
7. New text follows `docs/VOICE.md`: a log line at most 90 characters, an outcome 120, no U+2014 or U+2013. Existing strings that tests pin (section 1) are never edited; a cause is appended to a notice line after them, never to a log line.

**How parity works.** `GRIDS[system]` is a list of input points built from the existing kits (`labGame`, `adult`, `company`, `lab()` of `test/ai-bench-kit.ts`, `makeTestGame`) with the life seed as a function argument or a named constant, never `seed: <digits>`. `probe(system)` runs today's exported functions over the grid and returns rows `{ key, v[] }`; every float is cut to 9 significant digits (Mac and Linux differ in the last bit). `lifecycle(system)` runs a scripted case to its end (projects started together so their stored odds do not feed each other) and digests the lines on sale, brand, levels, notes and `g.rng`. The fixture holds both and a hash of the grids, so a shrunk grid fails. `TOL = { pct: 1, quality: 1, years: 0, usd: 1, topCeoSlack: 3 }`: a hired manager rated 90 or more may sit up to `topCeoSlack` odds points above the oracle once J.8 lands (open question 10), nowhere else.

## 3. Tasks

Check commands in every task: `/Users/saeed/projects/anotherlife/wt/bin/tc` from the worktree root, then `/Users/saeed/projects/anotherlife/wt/bin/vt22 <files>`, a few files at a time (named per task). Never the full suite, never `npm install`. Commit with explicit paths and the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

### R3-M0 The parity oracle (C.3)

**Lane** `main`. **Depends** none (it must run before any other track merges a change to the research files). **Goal** a golden file of today's research functions over an input grid, recorded on the unmodified code under Node 22.

**Files.**
- create `test/effort-parity-kit.ts`: the vocabulary of section 2 ("How parity works").
- create `test/fixtures/effort-parity.json` (data).
- create `test/effort-parity-kit.test.ts`: the kit's own tests and an all-systems check (green on unmodified code by construction).
- modify `src/game/business/deeptech-rd.ts:177`: the word `export` on `finalOdds` (no behavior change; the recorder needs it).
- create `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` if the lead has not (header and the four headings).

**Grids** (the kit builds each point with the real state, not a mock):

| System | Points | Fields | Lifecycle |
|---|---|---|---|
| `rd` | hired-manager skill {20,50,80,100} x quality {20,50,80} x scientists {0,1,3} x budget {.5,.75,1,1.5,2,3,4} (252), plus one trade per `baseYears` branch (`rd.ts:119-125`) x budget (28), plus quality-staff power {0,1} x 3 budgets, plus 0 and 2 projects already running (crowding, `rd.ts:114`) | `launchP`, `rdQuote` odds, years, quality, `rdCost` | three projects started together and run to the end: lines on sale, brand, `g.rng` |
| `heavy` | trades {restaurant, water, brewery} x skill {20,60,100} x scientists {0,2,4} | `heavyOdds`, `heavyYears`, `heavyCost`, `heavyQuality` | one breakthrough started and resolved: line, record, news ids, `g.rng` |
| `ops` | 9 programs x 3 tiers (one trade each) x skill {20,60,100} x scientists {0,3} | `opsOdds`, `opsPrice`, `opsYears` | two programs on different tracks run to the end: levels, `g.rng` |
| `deeptech` | 12 trades x 3 programs (first, one with a state-dependent cost, one trial): `programTerms` x budget {.5,1,2,3} (144 rows); `finalOdds` x lead skill {20,50,80,100} x pace {lean,steady,blitz} (432 rows) | `programTerms` cost, years, odds; `finalOdds` | four programs run to the end: stage, `ipBook`, notes, `g.rng` |
| `aicaps` | 8 capabilities x level {0,1,5,10,19}; `modelRating` over capability x year {2026,2030,2040} x level x compute x research x roll x released | `capProgram` cost, odds; `modelRating` | one track won, one lost: levels, hype, `g.rng` |
| `studio` | 3 tiers x team ratio {.25,.5,1,1.5,3} x operations {.6,1} x open {0,.5,1} x quality {30,70} x leadership {0,1} | `simulateStudioEngines` progress and quality after one year | one engine built to the end, years and quality |
| `workshop` | skill {0,20,50,90} x smarts {40,70,95} x genius {no,yes} x difficulty 1 to 5 x builds {0,1,3} x approach {safe,bold,cheap} (1,080); brainstorm over smarts x genius x skill; `skillGain` over skill x difficulty x result | `buildOdds` kaboom, master, low, high; `brainstormOdds`; `skillGain`; `buildCost` | one inventor year: three builds and two brainstorms, `g.rng` |

**Steps.**
1. Red: `test/effort-parity-kit.test.ts` fails because the fixture is absent, and because `probe('rd')` is not defined.
2. Write the kit, the `export`, and the test.
3. Record: `RECORD_EFFORT_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/effort-parity-kit.test.ts`. The recorder refuses to run unless `RECORD_EFFORT_PARITY=1`, writes `{ v: 1, node, systems }` and the grid hashes, and names the HEAD it ran on. The commit message says "recorded on the unmodified research code at <hash>".
4. Run without the variable: the kit test is green (today's code equals today's file). Check `tc`.

**Proves** the oracle exists, is deterministic (two probes give the same rows), cannot shrink silently (grid hash), and is recorded under the CI Node. **Lines** source 400, tests 140.

### R3-M1 The business seam (C.3)

**Lane** `main`. **Depends** R3-M0, R3-E3 (quote), R3-E5 (step), R3-F6 (frontier terms). **Goal** the one place where a company's research state becomes engine inputs, and `launchP` split into the two parts the engine needs, with the same value.

**Files.**
- create `src/game/business/research-effort.ts` (a leaf, section 2 rule 1).
- modify `src/game/business/rd.ts:29-32`: `launchP` becomes `clampN(launchSkill(s) + launchTeam(s.scientists), 0.1, 0.9)` with `s = researchState(g, b)`; add `researchState` right after it.
- create `test/effort-research-inputs.test.ts`.

**Interfaces.**
```ts
export interface ResearchSnap { year: number; skill: number; quality: number; qualityStaff: number; scientists: number; managed: boolean; managerSkill: number; morale: number; mandate: 'growth' | 'balanced' | 'profit' | 'cash' }
export function researchState(g: GameState, b: BizState): ResearchSnap            // rd.ts: ceoSkill, staffPower('quality'), readLab(b).team.length, boardOf(b).mandate
export function launchSkill(s: ResearchSnap): number                              // .25 + skill/250 + quality/300 + .1 * qualityStaff   (today's terms, rd.ts:31)
export function launchTeam(scientists: number): number                            // TEAM_ODDS * teamPower(n)   (lab-data.ts TEAM_ODDS, lab-state.ts:348)
export function researchPeople(s: ResearchSnap): EffortPerson[]                   // the CEO or owner, the quality staff, each scientist (fte 1, skill, morale)
export function researchActor(g: GameState, s: ResearchSnap, a: Asset | null): { owner: EntityRef; posture: Posture; people: EffortPerson[] }
export function researchInputs(g: GameState, s: ResearchSnap, a: Asset | null, field: string, k: number, tools?: number): EffortInputs
export function bookResearch(g: GameState, a: Asset | null, task: EffortTask, o: Omit<EffortOutcome, 'owner'>): { cause: string | null }   // null and a no-op when a is null (an NPC company)
```
Posture: an owner-run company takes `playerPosture(g)`; a hired CEO's takes the board mandate (`growth` push, `balanced` and `profit` steady, `cash` lean); a deep-tech company overrides it with its pace (M5).

**Steps.**
1. Red (`test/effort-research-inputs.test.ts`): `launchP` equals `clampN(launchSkill + launchTeam)` over a 60-point grid and equals the oracle's `launchP` rows; `researchInputs` for a hired-manager company with a `growth` mandate says `push`, for the default says `steady`; `bookResearch(g, null, ...)` leaves `g.flags` untouched; the seam file imports nothing from the cycle (a token scan with `test/scan-kit`).
2. Write the seam and the `launchP` split.
3. `tc`; `vt22 test/effort-research-inputs.test.ts test/lab-team.test.ts test/effort-parity-kit.test.ts`; `vt22 test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts`.

**Proves** `launchP` is unchanged (so Heavy, Ops and every lane that imports it can start), and the seam is a leaf. **Lines** source 220, tests 200.

### R3-M2 Product R&D on the engine (C.3)

**Lane** `main`. **Depends** R3-M1, R3-E8. **Goal** `rdQuote`, `startRd` and `advanceRd` run on `quote` and `step`; odds carry named reasons; a flop has a cause and teaches.

**Files.**
- create `src/game/business/rd-effort.ts`: `rdTask(cost, baseYears, family, kmax): EffortTask` with `calib { p0: launchP, oddsExp .4, yearsExp .5, minYears 1, maxYears 4, pMin .05, pMax .95 }` (rd.ts:172-173); `rdInputs(...)`.
- modify `business/rd.ts:168-184` `rdQuote`: odds, years and quality come from `quote`; `cost` stays `rdCost` (rd.ts:89); `k` still `budget / (cost x rdCrowding)` (rd.ts:170); add `why: readonly EffortReason[]` to `RdQuote` (rd.ts:145). `rdValue`, `bestRdBudget`, `bestRdIdea` and the hired CEO keep calling `rdQuote`.
- modify `rd.ts:338-374` `startRd`: store `fx` (`startRecord`) only when it carries something; the `R&D Underway` text is unchanged.
- modify `rd.ts:432-491` `advanceRd`: after the roll at :457 call `bookResearch` for the player's own companies; the flop line keeps `flopped in testing (money of R&D)` and gains a cause after it (`causeWords`, at most 60 characters); the log line `X's Y flopped.` is untouched; draws stay `chance`, `chance(HIT_P)`, `rand` in that order.
- modify `business/state.ts:68-93,637-642`: `RdProject.fx?: EffortRecord` read through the core's `readFx` in `projectExtras`; a damaged one is dropped.
- modify `business/manage.ts:484-496` `rdPreview`: append `whyText(q.why)` to the caption.
- tests read: `test/lab-team.test.ts:242-248`, `test/growth.test.ts:260-272,647`, `test/heavy-engine.test.ts:674-686`.

**Interfaces.** `rdTask(cost: number, baseYears: number, family: string, kmax: number): EffortTask`; `rdInputs(s: ResearchSnap, a: Asset | null, family: string, k: number): EffortInputs`; `RdQuote.why: readonly EffortReason[]`; `RdProject.fx?: EffortRecord`. `rdQuote`, `startRd`, `advanceRd`, `launchP` keep their signatures.

**Steps.**
1. Red, `test/effort-rd.test.ts`: (a) a spy on the core's `quote` (`vi.mock` wrapping the real one) sees at least one call per `rdQuote` (fails before); (b) `rdQuote(...).why` names `skill`, `team` and `funding`, and `whyText` matches `/^Odds \d+%: /`; (c) the parity block for `rd` against the oracle, and the `lifecycle` row exact; (d) a forced flop (a seed found with `findSeed`, label `rd flop`) raises the same family's next quote by more than 0 and at most 15 points and not another family's; (e) an NPC company (`advanceRd` with no asset) leaves `g.flags` byte for byte; (f) `noDraw` around `rdQuote`, `rdValue`, `bestRdIdea`; (g) a project with no `fx` (a hired CEO's, a v5.0.0 save) resolves and banks; a damaged `fx` is dropped by `normalizeBiz`; (h) 100x cash leaves `rdCost` unchanged and `k` at most `RD_MAX`.
2. Change the code. 3. `tc`; `vt22 test/effort-rd.test.ts test/lab-team.test.ts test/growth.test.ts`; `vt22 test/heavy-engine.test.ts test/products-market.test.ts test/rd-retired.test.ts test/business-save-normalization.test.ts`. Expect no moved test; any that moves gets a row under `## main`.

**Proves** the Product row of the parity criterion, the banking criterion, the NPC rule. **Lines** source 440, tests 520.

### R3-M3 Heavy R&D on the engine (C.3)

**Lane** `ops`. **Depends** R3-M1, R3-E8. **Goal** the breakthrough's odds, years, price and quality come from `quote` with a fixed budget (`kmax` 1: money buys nothing here, the 8x price is the whole lever).

**Files.**
- create `business/heavy-effort.ts`: `heavyTask` (`calib.p0 = clampN(0.55 x launchP, 0.08, 0.6)` from `heavy-rd.ts:329-331`; years `ceil(baseYears x 3)` clamped 4 to 6, :324-326; quality `min(97, rdQuality(2.5) + 14)`, :334-336).
- modify `heavy-rd.ts:329-336,409-444,503-538`: `heavyOdds` and `heavyQuality` wrap `quote`; `startHeavy` stores the odds as today (`round3`) and an `fx` only when informative; `advanceHeavy` books after the roll at :507 (the draw order :507, :512, :513 is untouched); the flop line keeps `flopped in testing (money of R&D)` and the log keeps `X's Y flopped.`, and the cause goes into the line the R&D Results notice shows.
- modify `manage.ts:569-584` `heavyAction`: append the `why` to the confirm text (the `R&D Underway` notice is capped at 120 characters by `test/heavy-voice.test.ts:47` and does not change).

**Interfaces.** `heavyTask(g, b): EffortTask`; `heavyWhy(g, b): readonly EffortReason[]`; `heavyOdds`, `heavyQuality`, `heavyYears`, `heavyCost`, `startHeavy`, `advanceHeavy` keep their signatures.

**Steps.** Red `test/effort-heavy.test.ts`: the `quote` spy; parity and `lifecycle` for `heavy`; a flop banks knowledge in the breakthrough's field, the next `heavyOdds` for that name is higher by 0 to 15 points, and the five-year cooldown (`HEAVY_COOLDOWN`, :302) still blocks the next start; `heavyOdds` keeps its clamp (.08 to .6) at 100x inputs; `noDraw`. Then change the code. Check: `tc`; `vt22 test/effort-heavy.test.ts test/heavy-project.test.ts test/heavy-voice.test.ts`; `vt22 test/heavy-story.test.ts test/heavy-handoff.test.ts test/heavy-none.test.ts`.

**Proves** the Heavy parity row and banking. **Lines** source 230, tests 330.

### R3-M4 Operations R&D and the research team on the engine (C.3)

**Lane** `ops`. **Depends** R3-M1, R3-M3 (lane order). **Goal** `opsOdds`, `opsYears`, `opsPrice` and the scientists' effect run on `quote`; the lab level is the track's knowledge as a view; a failed program teaches.

**Files.**
- create `business/lab-effort.ts`: `opsTask(rung, track, price, years)` with `calib.p0 = clampN(0.9 x launchP + OPS_TIER.odds - RUNG_PENALTY, 0.15, 0.92)` (`lab-rules.ts:38-41`), `kmax` 1; `opsKnowledge(b, track)` = `round(100 x levelOf / LAB_LEVEL_MAX)` (`lab-state.ts:300`, `lab-data.ts` `LAB_LEVEL_MAX`).
- modify `lab-rules.ts:28-41`: the three wrappers over `quote`; `teamValue` (:187-205) is unchanged and keeps working through `bestRdIdea`.
- modify `lab-year.ts:126-160` `startOps` (odds stored as today, rounded to 3 places) and `:164-197` `advanceLab` (the roll at :178, track order unchanged; a win still calls `applyWin`; a flop banks knowledge in `ops.<track>`; `stepped` still makes a replayed year inert).
- modify `lab-state.ts:30-70`: `LabProgram.fx?` optional, read through `readFx`; `lab-menu.ts:97`: the odds shown are unchanged, a `why` row is added.
- decision recorded here: the lab level already acts on the track's effect (`opsEffectsOf`), so the quote's knowledge input is the banked knowledge only, not the level. That keeps odds exact at default after wins; `opsKnowledge` is a view for the Knowledge screens ("LabLevel becomes K" as a read, not a second boost).

**Interfaces.** `opsTask(b: BizState, rung: 1 | 2 | 3, track: LabTrack): EffortTask`; `opsWhy(g, b, rung): readonly EffortReason[]`; `opsKnowledge(b, track): number` (0-100); `LabProgram.fx?: EffortRecord`; `opsOdds`, `opsYears`, `opsPrice` keep their signatures.

**Steps.** Red `test/effort-ops.test.ts`: the `quote` spy; parity and `lifecycle` for `ops` (the nine programs); the scientists' labor shows as `team` in the reasons and `launchTeam` is still `TEAM_ODDS x teamPower`; a flop banks knowledge and the next try on that track is higher by 0 to 15; a program on another track is not; `opsKnowledge` is 0 at a fresh lab and rises with `applyWin`; a replayed year draws nothing (`lab-kit` `noDraw`); old saves with no `fx`. Check: `tc`; `vt22 test/effort-ops.test.ts test/lab-ops.test.ts test/lab-team.test.ts`; `vt22 test/lab-hints.test.ts test/lab-state.test.ts test/lab-story.test.ts test/lab-patents.test.ts`.

**Proves** the Ops parity row, the team's labor, banking. **Lines** source 330, tests 460.

### R3-M5 Deep tech on the engine (C.3)

**Lane** `dt`. **Depends** R3-M1, R3-E8. **Goal** `programTerms` and `finalOdds` run on `quote`; the pace is the posture; a lost program teaches.

**Files.**
- create `business/deeptech-effort.ts`: `programTask(def, planCost, years)` with `calib.p0 = def.odds(t)`, `oddsExp .35`, `yearsExp .55`, `minYears .5`, `maxYears 10`, `pMin .02`, `pMax .98` (`deeptech-rd.ts:61-68`), `kmin .5`, `kmax 3` (`BUDGET_MIN`, `BUDGET_MAX`, :54-55); `paceToPosture` (lean to lean, steady to steady, blitz to push); the pace table (`deeptech-core.ts:113-117`: speed .75/1/1.5, cost .65/1/1.55, team .85/1/1.15) stays the calibration, so the first year at any pace is exact.
- modify `deeptech-rd.ts:61-68` `programTerms`; `:177-188` `finalOdds` (skill factor `.75 + skill/200`, blitz .96, the two 1.05 talent factors, clamp .03 to .95 all stay as named reasons: `skill`, `pace`, `talent`); `:191-250` `advancePrograms` (the roll at :209 first, then `bookResearch`; `ipBook` rules `0.25 x spent` on a loss stay exactly: valuation does not move).
- modify `deeptech-state.ts:53-73,331-346`: `TechProgram.fx?`; `deeptech-menu.ts:170-178`: the line gains the `why`.
- the new thing a player feels: staying at `blitz` year after year builds the lab's fatigue (core), which lowers odds by a few points; the first year is unchanged.

**Interfaces.** `programTask(b: BizState, t: TechState, def: ProgramDef): EffortTask`; `paceToPosture(p: Pace): Posture`; `programWhy(g, a, b, t, p): readonly EffortReason[]`; `TechProgram.fx?: EffortRecord`; `finalOdds` is exported (M0); `programTerms`, `advancePrograms` keep their signatures.

**Steps.** Red `test/effort-deeptech.test.ts`: the spy; parity and `lifecycle` for `deeptech` including a trial (`resolveTrial`); pace to posture; two blitz years cost more odds points than one (fatigue), and a steady year after recovers; a loss banks knowledge in `dt.<trade>` and the lab report gets one extra note; `ipBook` after a loss equals the oracle's; `noDraw`; the autopilot (`deeptech-manager.ts`) still starts programs. Check: `tc`; `vt22 test/effort-deeptech.test.ts test/deeptech.test.ts test/deeptech-review.test.ts`; `vt22 test/growth.test.ts test/deeptech-autopilot.test.ts test/deeptech-fusion.test.ts test/deeptech-new-trades.test.ts`.

**Proves** the deep-tech parity row, pace as posture. **Lines** source 380, tests 420.

### R3-M6 AI capability tracks on the engine (C.3)

**Lane** `dt`. **Depends** R3-M5. **Goal** the capability tracks are tasks whose hardness is the research level, with the research level as their knowledge; `modelRating`'s ceiling is the one the engine shares.

**Files.**
- create `business/aicap-effort.ts`: `capTask(cap, level)` (`calib.p0 .65` flat, cost `3_000_000 x 1.4^level`, `deeptech-data.ts:1296-1298`); `capKnowledge(t, cap)` = `round(100 x level / 20)` (the `Fully researched.` gate is 20, :1301).
- modify `deeptech-data.ts:1288-1312` `capProgram`: `cost` and `odds` read the task; `win` and `lose` bodies and strings are untouched (`test/ai-bench-research.test.ts:27` pins the loss line with `toBe`).
- modify `deeptech-rd.ts:231-239` (the loss branch): one extra note when knowledge was banked: "The team learned from it. The next try is likelier."
- modify `ai-bench.ts:146-157` `modelRating`: if the core exports its soft-ceiling function (open question 8) the expression `ceiling - room x e^(-(raw - ref)/room)` is replaced by the call, with the same arithmetic; otherwise unchanged. Either way the `modelRating` grid is exact.

**Interfaces.** `capTask(cap: CapId, level: number): EffortTask`; `capKnowledge(t: TechState, cap: CapId): number` (0-100); `capProgram`, `modelRating` keep their signatures.

**Steps.** Red `test/effort-aicaps.test.ts`: the spy on `capProgram` odds; parity and `lifecycle` for `aicaps`; a lost track at level 4 banks knowledge in `dt.aiLab.cap.<cap>`, the level-4 retry is higher by 0 to 15 points, a different capability is not; the cost curve is unchanged (`3M x 1.4^n`); `modelRating` never passes the market best plus 90 at 100x research and compute; `bestCapTrack` (`deeptech-rd.ts:342`) draws nothing. Check: `tc`; `vt22 test/effort-aicaps.test.ts test/ai-bench-research.test.ts test/ai-bench-train.test.ts test/ai-bench.test.ts`.

**Proves** the AI-caps parity row and the shared ceiling. **Lines** source 260, tests 300.

### R3-M7 Studio engines on the engine (C.3)

**Lane** `main`. **Depends** R3-M2 (lane order; the seam is R3-M1). **Goal** the only labor-driven build runs on the engine: progress from the team, no failure roll at default, a setback hazard only under `push`, and a finished engine teaches the next.

**Files.**
- create `business/studio-effort.ts`: `engineTask(tier)` from `ENGINE_TIERS` (`gamestudio-engine-state.ts:9-13`), progress `(100 / years) x ratio^0.8 x operations x open` with `ratio = clampN(team / tier.team, 0, 3)`; quality `clampN(30 + quality x .45 + leadership x .2 + min(10, ratio x 5), 20, 98)` (`gamestudio-engines.ts:73,78`).
- modify `gamestudio-engines.ts:70-85`: the dev branch reads `quote`; `research` cost, `x.spent`, the `ready` notice are unchanged; the licensing branch (:87-110, the three `randFloat` draws) is not touched.
- modify `gamestudio-engine-state.ts:30-48,62`: `StudioEngine.fx?` read through `readFx`, bounded.
- on `ready`: `bookResearch` banks knowledge in `studio.engine`; a later engine of the same tier needs a little less time (the core's K to years, open question 9).

**Interfaces.** `engineTask(tier: EngineTier): EffortTask`; `StudioEngine.fx?: EffortRecord`; `simulateStudioEngines`, `startStudioEngine` keep their signatures.

**Steps.** Red `test/effort-studio.test.ts`: the spy; parity and `lifecycle` for `studio` (progress and quality exact); at default no engine ever fails; under `push` a setback is possible and costs progress but never the team; a second engine builds faster after the first; the 32-engine and 999,999,999 guards still hold. Check: `tc`; `vt22 test/effort-studio.test.ts test/studio-engines.test.ts`; `vt22 test/studio-scale.test.ts test/studio-awards-clamp.test.ts`.

**Proves** the studio parity row. **Lines** source 250, tests 300.

### R3-M8 The Workshop's odds on the engine (C.3)

**Lane** `ws`. **Depends** R3-M0, R3-E3, R3-E5, R3-E8 (not M1). **Goal** `buildOdds` and `brainstormOdds` run on `quote`; a kaboom teaches; no new saved state.

**Files.**
- create `workshop/effort.ts` (leaf: imports `./state`, `./catalog`, `../effort/contract`): `buildTask(def, approach)` (field = the idea's category, hardness = difficulty `def.d`, cost `BUILD_COST[def.d]`); `buildInputs(g, ws, builds)` with posture from `playerPosture(g)`; the centre `18 + skill x .55 + smarts x .15 + (genius 20) - (d - 1) x 10 + min(9, builds x 3) + shift`, the spread and the kaboom chance `build.ts:48-60` are `calib`.
- modify `workshop/build.ts:48-60` `buildOdds`, `:203-205` `brainstormOdds`, `:128-196` `resolveBuild`: the same two `rand` draws at :139 and :144, then `bookResearch`-style `step` for the player (owner `person:you`); `skillGain` (:63-67) is unchanged.
- `buildWhy(g, ws, def, builds, approach)` is exported for the core's panels.

**Interfaces.** `buildTask(def: IdeaDef, approach: Approach): EffortTask`; `buildInputs(g, ws, builds): EffortInputs`; `buildWhy(g, ws, def, builds, approach): readonly EffortReason[]`; `buildOdds`, `brainstormOdds`, `resolveBuild`, `skillGain` keep their signatures and `BuildOdds` its four fields.

**Steps.** Red `test/effort-workshop.test.ts`: the spy; parity for `workshop` (kaboom, master, low, high exact; `brainstormOdds`, `skillGain`, `buildCost` unchanged) and `lifecycle`; a kaboom banks knowledge in the idea's category, so the next build of that category has a lower kaboom (by at most 15 points of its own risk, never below the 1% floor at `build.ts:55`) and another category does not; `noDraw` around `buildOdds`; `test/workshop-balance.test.ts` earnings bands unchanged. Check: `tc`; `vt22 test/effort-workshop.test.ts test/workshop.test.ts test/workshop-balance.test.ts`; `vt22 test/workshop-money.test.ts test/ledger-flows-law.test.ts`.

**Proves** the Workshop parity row. **Lines** source 360, tests 380.

### R3-M9 The Workshop gets the engine's inputs (C.4)

**Lane** `ws`. **Depends** R3-M8, R3-E6 (spendFocus, focusLeft) and R3-E4 (burnedOut). **Goal** the yearly build and brainstorm counters become the focus-week pool; the inventor can use tools and lab access and hire a bench assistant; ambition and fatigue matter.

**Files.**
- modify `workshop/build.ts:23-28,81-87,135,207-221`: `buildWeeks(g)` is 3 (genius 2) and `BRAINSTORM_WEEKS` is 1, so three builds and two brainstorms are 11 of the 12 weeks and a genius's five builds and two brainstorms are 12; `buildsLeft`, `buildLimit` become derived (`floor(focusLeft / weeks)`), the menu subtitle (`menu.ts:91`) says weeks; `useFocus` replaces the two `useYearAction` calls; weeks past the pool become fatigue (the core), at most `MAX_OVERTIME_BUILDS` (2) past `buildLimit`; `burnedOut(g)` blocks with a plain reason.
- modify `workshop/effort.ts` (M8): `workshopTools(g)` (0 to 1: 0.4 enrolled at university or graduate level, 0.6 for a founder or officer of a company with a research lab or a deep-tech lab, the larger of the two; read only) and `workshopHelpers(g)` (0 to 2, the hired assistant plus none other); both enter `buildInputs` as `tools` and a person (`fte` .5); their gains are bounded: tools add at most 5 to the centre and cut the kaboom chance to .85x, an assistant adds at most 3 and .92x.
- modify `workshop/state.ts:32-51,145-175`: `Workshop.helper?: { since: number; skill: number }`, optional, `fin`-bounded; `workshop/menu.ts` (row near :229 "Bench assistant": hire or let go; wage `round(4000 x goodsMult)` through `spend(g, wage, 'payroll')`, no assistant when it cannot be paid) and `menu.ts:229` the brainstorm subtitle; `workshop/yearly.ts` `yearlyWorkshop` (:211-238): the assistant's wage once a year (year-stamped), the assistant leaves if unpaid.
- edit as mechanism only (the year reset): `test/workshop.test.ts:47,588,590`, `test/workshop-money.test.ts:148,150`, `test/workshop-balance.test.ts:36` if the pool is not year-stamped (open question 4); `test/workshop.test.ts:199-201` changes meaning: builds 4 and 5 are allowed with fatigue, the 6th is refused (row under `## ws`).
- add ceiling rows `workshop-overtime` (`MAX_OVERTIME_BUILDS`) and `workshop-tools` (`WORKSHOP_TOOLS_MAX`) with probe rows in `test/ceiling-kit.ts`.
- doc: `docs/INVENTOR-CAREER.md` one paragraph on weeks.

**Interfaces.** `buildWeeks(g): number`, `BRAINSTORM_WEEKS = 1`, `MAX_OVERTIME_BUILDS = 2`, `WORKSHOP_TOOLS_MAX = 5` (centre points), `workshopTools(g): number`, `workshopHelpers(g): number`, `Workshop.helper?: { since: number; skill: number }`, `buildLimit(g)` and `buildsLeft(g)` kept as derived readers.

**Steps.** Red `test/effort-workshop-inputs.test.ts`: three builds and two brainstorms at default leave 1 week and no fatigue; the fourth build is allowed and adds fatigue; the sixth is refused; a burned-out inventor cannot build; a student inventor's `buildOdds` beats the same inventor outside school by at most 5 quality points; the assistant's wage is one `payroll` ledger flow a year and the assistant leaves when it cannot be paid; ambition at 50 steady changes nothing, `push` widens the spread; `test/money-ratchet.test.ts` shows no unreasoned call; old saves have no `helper`. Balance guard: run `test/workshop-balance.test.ts`; the earnings bands must hold. If a soft limit lifts them, tune the overtime cost per week over the pool (the core's constant, passed as `overtimeWeeks`), never the band. Check: `tc`; `vt22 test/effort-workshop-inputs.test.ts test/workshop.test.ts test/workshop-balance.test.ts`; `vt22 test/money-ratchet.test.ts test/ceiling-list.test.ts test/ceiling-probe.test.ts test/old-saves.test.ts`.

**Proves** C.4: the Workshop runs on the engine's inputs, the pool replaces the counters, and the added terms are capped. **Lines** source 650, tests 640.

### R3-M10 Top CEOs make the research steady (J.8)

**Lane** `ops`. **Depends** R3-M1, R3-M4. **Goal** the real, non-monetary benefit for a top hired CEO, through the engine, in place of the foresight income R0-3 removed.

**Files.**
- create `business/ceo-edge.ts` (a leaf; imports `util`): `topCeoSteady(skill: number): number` = `clampN((skill - 90) / 10, 0, 1)` (0 at 90, 1 at 100; open question 10); `TOP_CEO_DRIVE = 10`, `TOP_CEO_CALM = 0.25`, `TOP_CEO_MAX_PTS = 3`.
- modify `business/research-effort.ts` (`researchActor`): a hired CEO, or a division under an autonomous group CEO, gives its research people `drive + 10 x s` and `fatigue x (1 - .25 x s)`, and adds the reason `{ key: 'ceo', label: 'steady CEO' }`. The group case is passed in as a number by the caller (`conglomerate-state.ts` is in the cycle). The old rule is at `git show a0e36d3^:src/game/business/executive-foresight.ts`.
- modify `business/board-ceo.ts` before :725: when the steady value is above 0 and the company has research going, one letter line "Kept the lab steady: research odds run N points better." (10 words, under `LETTER_WORDS`).
- ceiling row `top-ceo-edge` (`TOP_CEO_MAX_PTS`) and its probe row.
- `executive.ts` `executiveOperations` (:113) is not touched: its quality, morale and brand gains for skill 85 and up stay.

**Interfaces.** `topCeoSteady(skill: number): number`; `TOP_CEO_DRIVE`, `TOP_CEO_CALM`, `TOP_CEO_MAX_PTS`; the reason key `ceo`.

**Steps.** Red `test/effort-top-ceo.test.ts`: before, a 100-rated manager's `heavyOdds` and `opsOdds` reasons have no `ceo` line; after, they have one of at most 3 points and a 89-rated manager has none; a 90-rated has none and a 95-rated half; the oracle rows for skill 90 and up pass within `TOL.topCeoSlack`; cash, the ledger flows and `Statement.strategicIncome` are unchanged (20 seeded firms, 5 years); the letter line appears once and only with research going; `noDraw`. Check: `tc`; `vt22 test/effort-top-ceo.test.ts test/effort-heavy.test.ts test/effort-ops.test.ts test/elite-business-v2.test.ts`; `vt22 test/ceo-letters.test.ts test/ceo-letter-voice.test.ts test/ceiling-list.test.ts test/ceiling-probe.test.ts`.

**Proves** J.8 and its bound. **Lines** source 260, tests 300.

### R3-M11 The sweep (C.3, J.8)

**Lane** `main`, last. **Depends** R3-M2, M4, M6, M7, M9, M10 (all lanes merged into the lane's worktree). **Goal** the cross-system checks and the written record.

**Files.**
- create `test/effort-mig-acceptance.test.ts`, `docs/EFFORT-MIGRATION.md`.
- check the file `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md`: every row has all five cells and a reason.

**Steps.**
1. The fixture has all 7 systems with the recorded grid sizes and no gap.
2. A token scan (`test/scan-kit`) finds `quote(` in each system's file or adapter and finds none of the old inline formulas in the wrappers (`Math.pow(k, -0.4)` in `rd.ts`, `HEAVY_ODDS_X *` in `heavy-rd.ts`, `0.9 * launchP` in `lab-rules.ts`, `0.75 + skill / 200` in `deeptech-rd.ts`).
3. The 100x probe over the six task builders: cost unchanged under 100x cash, valuation and headcount, `k` at most `kmax`, odds at most the legacy clamp (.95, .6, .92, .98, .65 flat, no failure for studio).
4. Run the guards: `vt22 test/old-saves.test.ts test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts` and `vt22 test/voice-guards.test.ts test/money-ratchet.test.ts test/world-streams.test.ts test/seed-pins.test.ts`; then every `test/effort-*.test.ts` of the track, a few at a time.
5. `docs/EFFORT-MIGRATION.md`: the parity method, how to record (`RECORD_EFFORT_PARITY=1`, Node 22, with a reason), the adapter rule, how a later system joins.

**Proves** the money, ceiling and no-draw criteria across systems and that the record is complete. **Lines** source 120, tests 330, docs 120.

## 4. Open questions for the cross-check

1. `EffortQuote` must carry `years`, `quality` and `cost` as well as `{ p, reasons }` (the audit's `quote` returns odds, years, quality, cost and `why[]`). If the core ships only `p` and `reasons`, each adapter keeps computing years and quality from its calibration and uses `quote` for `p` and `reasons`; parity still holds by construction, but knowledge cannot shorten a project.
2. Parity by construction needs `EffortTask.calib` (base odds, the two exponents, the clamps), design 5.11 line 492. If the core fixes one sigmoid, exact parity is lost and only the 1-point grid holds, and the `lifecycle` rows (exact) would fail; say so now.
3. The door: this plan assumes `effort/contract.ts` is the only file `business/` and `workshop/` import (rule c). Rename here if the core names it otherwise.
4. The focus-week pool should be year-stamped (`{ y, used }`) so a new `g.year` is a fresh pool and no yearly hook or test reset is needed. If it is reset by a registered yearly step, the six `g.yearActions = {}` test sites need a reset helper from the core's kit.
5. `step`'s owner: this plan passes an `EntityRef` (`firm:<assetId>`, `person:you`). Confirm the company knowledge record is keyed by it and survives heirs for companies, resets per owner for the person (roadmap line 229, audit risks).
6. `startRecord`, `readFx` and `EffortRecord` (the `fx` object) are assumed to be the core's; this track only adds an optional `fx` field to `RdProject`, `TechProgram`, `StudioEngine`, `LabProgram`.
7. `whyText` and `causeWords`: C.11 (Effort core) is assumed to export them; the cause list in R3 is dead end, starved budget, team churn, shortcut, tired. "Rival first" arrives with Frontier.
8. Does the core export the AI-bench soft-ceiling function (design 5.3, "Quality uses the AI-bench ceiling")? If not, `modelRating` stays as it is and M6 loses one hunk.
9. Studio engines have no odds, so knowledge has to act on years there. Proposal: years x (1 - 0.15 K/100). A core decision.
10. J.8 threshold: the removed rule fired only at exactly 100. This plan ramps from 90 (the letter's "elite") to 100 and bounds the odds gain at 3 points, with a drive and calm effect through the engine, no money. The owner may prefer 100 only.
11. The Workshop's counters become a soft pool (design 5.6, decision D16). Past the pool each build costs fatigue, not a refusal; this plan adds a hard backstop of two extra builds so a 160-year inventor cannot grind. That is the one place the balance could drift (`test/workshop-balance.test.ts`); M9 says what to tune.
12. Other tracks' task ids are not known to this planner. The `dependsOn` fields name the track (`track:effort-core`) where an id is needed; replace with the core's task ids at the cross-check.
13. Posture of a hired-CEO company from the board mandate (`growth` push, `cash` lean) is an assumption of M1; a deep-tech company is always its pace.

---

## Cross-check amendments (2026-10-22)

These override the text above, in particular the assumed interface of section 2. Numbered decisions are in `00-crosscheck.md` section 6. Open questions 1 to 13 are answered there (decisions 5 to 18).

- **M-A Door and names (D5).** `business/` and `workshop/` import from `src/game/effort` (its `index.ts` barrel, layer 2). There is no `effort/contract.ts`. The assumed names map to the core's like this:

| This plan assumed | The core provides |
|---|---|
| `EffortTask` with `calib {p0, oddsExp, yearsExp, minYears, maxYears, pMin, pMax}`, `id`, `ceiling` | `Task` built with `defineTask(spec)`: flat `p0`, `oddsExp`, `yearsExp`, `minYears`, `maxYears`, `oddsLo`, `oddsHi`; `quality.ceiling` and `quality.room`; no `id`; `field` is the know-how key (`ops.<track>`, `dt.<trade>`, `dt.aiLab.cap.<cap>`, `studio.engine`, a family or category) |
| `EffortInputs`, `EffortPerson`, `owner: EntityRef` | `EffortInput`, `Worker {fte, skill, morale, drive?, fatigue?}`; the player is `who: 'you'`; a company's know-how map is `BizState.knowHow`, passed to `step` as `StepCtx.know` and to `quote` as `knowledge: knowHowOf(map, field)` |
| `EffortQuote {p, years, quality, cost, reasons}` | `Quote`; cost is `Quote.spend` (`k * task.cost`) |
| `EffortRecord`, `startRecord`, `readFx` | `Fx`, `newFx(year)`, `normalizeFx(raw)` |
| `EffortOutcome`, `step(g, task, o)` | `resolve(q, u, opts)` returns `Outcome`; `step(g, task, outcome, ctx)` returns `StepResult {replay, knowledge, learned, shift, reveals}` |
| `whyText`, `causeWords` | `oddsLine(q, policy?)`, `causeLine(cause, field)`, `payoffLine(task, outcome, result)` |
| `playerPosture`, `focusLeft`, `useFocus`, `burnedOut` | `postureOf`, `focusLeft`, `spendFocus`, `burnedOut` |
| `companyKnowledge(g, owner, field)` | `knowHowOf(b.knowHow, field)` |

- **M-B R3-M0 (D7).** M0 owns the oracle and the whole harness, because it runs first on unmodified code and cannot import `src/game/effort`. File `test/fixtures/effort-parity.json`; kit `test/effort-parity-kit.ts` exports `SYSTEMS`, `GRIDS`, `inputGrid(axes)` (cartesian product, keys sorted, stable ids), `roundSig`, `probe`, `lifecycle`, `readOracle(system)`, `compareParity(rows, run, tol)`, `expectParity(system, run, tol?)`, `parityDiff`, `TOL`, `recordParity`. Header `{ v: 1, node, head, digits: 9, systems }`; a system is `{ gridHash, grid, rows, lifecycle }`; a row is `{ id, input, odds?, years?, quality?, cost?, extra? }` with `odds` a fraction in the file and the tolerance in points. `TOL = { odds: 1, quality: 1, years: 0, usd: 1, topCeoSlack: 3 }`. Grid states set the hidden traits to willpower 55 and discipline 55 (ambition 50, `neutralAmbition(g)` in the kit) so the grid is the default actor; no `seed: <digits>`.
- **M-C R3-M1.** Also adds, in `business/state.ts`: `BizState.knowHow?: Record<string, number>` (normalized with `readKnowHow`, bounded to `KNOW_HOW_FIELDS`) and `RdProject.fx?: Fx` (through `normalizeFx` in `projectExtras`), so M2 and M3, which run in different lanes, both use fields M1 created. `research-effort.ts` builds `EffortInput` for a company: an owner-run company uses `who: 'you'` (the persona's ambition, posture and fatigue) with `knowledge` from the company's map; a hired-CEO or NPC company is posture `steady`, ambition 50, fatigue 0 (the board mandate does not set a posture: push would be a free edge with nobody to tire, D11). Frontier: `frontierInputs(g, field)` returns `{ spill, rival }` from `frontierTerms(g, fieldOfTrade(industry) ?? fieldOfCap(cap))` (zero without a shard). Source about 280.
- **M-D R3-M2, M3, M4, M5 (D11, D12).** Results lines append `payoffLine` and, on a failure, `causeLine` (notices and results lines only; every pinned log string stays untouched). The preview shows `oddsLine(q)`. No `risk` roll, no `payrollX`. Deep tech (M5) passes posture `steady` to `quote` so odds and years stay exact; pace remains the calibration of cost, speed and team. The pace's strain (`POSTURE_STRAIN[paceToPosture(pace)]`: lean -4, steady 0, push +10) is added to the program's `fx.fatigue` each year (0 to 100) and read back as the `fatigue` input, so two blitz years cost more odds points than one. Ops (M4): `opsKnowledge` is a view only.
- **M-E R3-M6.** `modelRating` is NOT touched (D17): its grid stays in the oracle as a regression guard. The task is the capability track on `quote` and `step`, the `Fully researched.` gate, the banked retry, and a `why` line in the program preview (`oddsLine`).
- **M-F R3-M7 (lane `main` after M2, D13).** Studio engine task sets `knowYears` .15. Under posture `push` of an owner-run studio a setback is possible: one draw from `outcomeStream(g, 'effort.risk', g.year, 'studio:' + engine.id)` (literal tag), only when the posture is push, so no seeded run changes; the task adds the `effort.risk` row to `test/stream-tap.ts` (`driven: true`) and the driver to `test/stream-isolation.test.ts`.
- **M-G R3-M8 and R3-M9.** `buildWhy` is shown by M9 as an `oddsLine` info row under the build action (the core has `whyNodes`). The kaboom stays `buildOdds().kaboom`; the engine's `risk.explosion` adds to it only when the plan is bold (ambition above 50 or push), no new draw. M9 spends weeks with `spendFocus(g, 'workshop.build', fullWeeks, buildWeeks(g))` and `spendFocus(g, 'workshop.brainstorm', ..., BRAINSTORM_WEEKS)`; the counters count weeks (R3-E6 amendment A7). The six `g.yearActions = {}` test sites need no helper: the pool is derived from `yearActions`.
- **M-H R3-M10 (D15).** The benefit is one labelled term: `researchActor` adds `{ key: 'ceo', label: 'steady CEO', pts }` to `baseTerms` and to `base`, `pts = TOP_CEO_MAX_PTS * topCeoSteady(skill)` (0 at 89 and below, 3 at 100). Drop `TOP_CEO_DRIVE` and `TOP_CEO_CALM` (`Worker.drive` is not read by J.8). No money, no `strategicIncome`.
- **M-I R3-M11.** Adds: (1) a 200-year direct-step probe at maximum inputs on one founder with a product company, heavy, ops, deep tech, studio and a Workshop (`k` at most `kmax` and 4, know-how at most 100, odds inside the legacy clamp, quality inside each system's ceiling, `checkLedger` ok, no money created by the engine); (2) `fx` and `knowHow` node totals for 12 companies over 50 years at most 3,000; (3) every migrated screen shows `oddsLine` or a `why` row and every results line a `payoffLine` or `causeLine`; (4) `TERM_LABEL.spill` and `.rival` equal `FRONTIER_REASONS`; (5) completeness of `test/fixtures/effort-parity.json` (seven systems, grid hashes).
- **M-J Moved tests (D38).** Existing exact-odds tests for an owner-run company use a character whose ambition is not 50. Prefer `neutralAmbition(g)` in the test setup (a row in `moved-tests.md`) over editing an expected number. `test/workshop.test.ts:199-201` moves as listed.
