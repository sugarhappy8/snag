# R3 plan, Effort core track: the effort engine, the player's ambition and the focus weeks (track `effort-core`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0` cut from `main` 85e147b (v5.0.0, R2). Code read at v5.0.0 in `/Users/saeed/projects/anotherlife/wt/r3-release`; nothing was edited except this file. Every "modify" path exists today; every "create" path does not (`src/game/effort/` is absent). All text below uses plain hyphens (no U+2014, no U+2013).

## 1. Track summary

**Items covered (10 tasks).**
- C.1, the engine: R3-E1 contract seed (types, constants, task builder, knowledge map), R3-E2 curves and world terms, R3-E3 factors and `quote`, R3-E5 `resolve`, `step` and the `fx` record, R3-E7 parity harness.
- C.2, the person: R3-E4 persona record, hidden ambition, posture, staff drive; R3-E6 focus weeks, the yearly settle, fatigue, the posture rows, the four counter sites and the Profile row.
- C.11: R3-E8 the "why" lines, cause and payoff lines, and the reveal port.
- C.12: R3-E9 conservation, purity, the 200-year probe and the ceiling rows; R3-E10 barrel, docs, fixtures and the acceptance sweep.

**Not in this track.** The parity oracle (captured on unmodified v5.0.0 by the first Effort migration task); every migration (`business/rd.ts`, `heavy-rd.ts`, `lab-*.ts`, `deeptech-*.ts`, `ai-bench*.ts`, `gamestudio-engines.ts`, `workshop/*`); `g.world.frontier`; `know`, `estimate` and the Exact setting (Knowledge); the year digest (Quiet); protection and leaks (C.7); the new domains (C.8 to C.10); school, thesis, lessons and kit practice (C.5, R6). This track draws no random number and books no dollar: nothing under `src/game/effort/` calls `rand`, a stream, `cash`, `ledger` or `spend`.

**Design in five lines.**
1. `effort/` is layer 2 (R3-E1 adds `'effort'` to `WORLD_DIRS`, `test/layer-kit.ts:61`). Domains import it downward with no `contract.ts`; it may not import `household.ts` or `business/` (layer 3), so the player's fatigue is read raw from `flags.household`.
2. Odds are the system's own `p0`, then money by the task's own exponent, then deviations in logit space that are all zero at the defaults (ambition 50, steady, fatigue 0, knowledge 0, no crew). So every old formula is reproduced bit for bit and the migration parity grid is a check, not a hope.
3. Every term is a labelled line in odds points, attributed in order so the lines sum to `round(p*100) - round(base*100)`.
4. The only saved state is `flags['effort.you']` (personal, owner-stamped, created on first use, so an untouched life has no key and no golden digest moves), plus an `Fx` record and a knowledge map that the callers keep on their own projects and companies.
5. The focus pool is derived from `g.yearActions`, which `aging.ts:37` already resets every year, so it needs no new saved field.

**What I measured** (this worktree, by grep and reading):

| Fact | Value | Where |
|---|---|---|
| `useYearAction(` call sites | 385 in 107 files (the lead's "339" is older); definition `core.ts:521`, yearly reset `aging.ts:37` | `grep -rn "useYearAction(" src` |
| Counter sites this track moves | `study` 3 `education.ts:2937`; `practice:${id}` 2 `education.ts:3117`; `act.lesson.${id}` 3 `activities/mindBody.ts:949,962`; `computer.dev.tutorial` 3 `computer/dev-learn.ts:188` | read |
| Product R&D formulas to reproduce | odds `rd.ts:172`, years `rd.ts:173`, `budgetQuality` `rd.ts:133`, `launchP` `rd.ts:30`; `TEAM_ODDS` `lab-data.ts:124`, `teamPower` `lab-state.ts:348` | read |
| Player fatigue | `householdView().fatigue` `household.ts:21`; formula `household.ts:61`; owner string `household.ts:17` (`${generation}:${character.id}`) | read |
| Hidden traits | `willpower`, `discipline` in `HiddenKey` `types.ts:16`; both start `bell(10,100)`, mean 55 (`life.ts:770`, `rng.ts:66`) | read |
| Staff traits to map to a drive | 13 ids, `business/flavor.ts:130`; leadership power `business/leadership.ts:10` | read |
| Yearly seam | phase `life` holds `household` at order 30 (`modules/yearly-aging.ts:65`); phases `kernel/registry.ts:30` | read |
| Guards that bite new files | layer table `test/layer-kit.ts:61`; flag classes `world-flags.ts:81`; ceiling rows `test/ceiling-kit.ts:486`; the `aging` list (36 hooks) in `test/fixtures/kernel-parity.json` | read |
| Tests that pin what moves | `test/education.test.ts:146` (the 4th Study Harder is refused); `test/living-economy.test.ts:35` walks `lifePrioritiesMenu` and needs a pure read | grep |

**Line budget.** About 4,000 source lines against the roadmap's 4,400 (C.1 2,500, C.2 800, C.11 300, C.12 800). "Source" is `src/` plus kit and guard code under `test/`; "tests" are `*.test.ts` (about 4,400).

| Task | Item | Source | Tests | Lane |
|---|---|---|---|---|
| R3-E1 | C.1 | 390 | 330 | main |
| R3-E2 | C.1 | 360 | 450 | main |
| R3-E3 | C.1 | 620 | 640 | main |
| R3-E4 | C.2, C.1 | 400 | 500 | you |
| R3-E5 | C.1 | 480 | 600 | you |
| R3-E6 | C.2 | 560 | 640 | you |
| R3-E7 | C.1 | 150 | 150 | kit |
| R3-E8 | C.11 | 340 | 380 | why |
| R3-E9 | C.12 | 400 | 460 | kit |
| R3-E10 | C.12 | 90 | 100 | kit |
| Total | | 4,020 | 4,400 | |

**Acceptance owned** (R3 block of the roadmap), and the test that proves each:

| Criterion | Proven by | Task |
|---|---|---|
| Parity grid within 1 point (here: the harness, and the engine reproducing the product R&D odds, years and quality over a k grid; the oracle and every system are Effort migration's) | `test/effort-kit.ts` `expectParity`; `test/effort-quote.test.ts` | R3-E7, R3-E3 |
| 200-year probe at maximum inputs: `k` at most 4, knowledge at most 100, quality at most the task ceiling, no money (the "no field above frontier plus headroom" half needs the frontier ledgers: Frontier and Effort migration own it) | `test/effort-longrun.test.ts`; `ceiling-probe.test.ts` rows | R3-E9 |
| `quote` never reads `u`, draws nothing, reads under a deep-frozen state; no `g.rng` in any read of this track (quote, why lines, menus, Profile row) | `test/effort-pure.test.ts` (rng trap, `deepFreeze`, a `u` trap) | R3-E9 |
| Ambition widens variance and never adds a free edge (at most plus 25%); failed research banks at most 15 odds points; spillover at most 6 points | `effort-curves`, `effort-step`, `effort-longrun` tests | R3-E2, E5, E9 |
| "Odds 62%: team +9, funding +7, hard field -12, tired -4", causes, a visible payoff; posture and burnout; ambition from 18 | `effort-why`, `effort-focus` tests | R3-E8, E6 |
| Conservation: the engine moves no money | `test/effort-conservation.test.ts` | R3-E9 |
| Old saves load | `test/old-saves.test.ts` unchanged; hostile `effort.you` reads | R3-E4, E10 |

Not owned: popup and repeat-line rates (Quiet), the 80% band and "same source twice" (Knowledge), the golden parity of each system (Effort migration), spill waves and the frontier (Frontier).

**Hot files** (the roadmap lists only `src/game/effort/*` for this track; these edits outside it are small and additive, listed for the lead):

| File | Task | Edit |
|---|---|---|
| `test/layer-kit.ts:61` (and the layer table in the comment above `layerOf`) | E1 | `'effort'` joins `WORLD_DIRS`; one comment line |
| `src/game/world-flags.ts:81` | E4 | `'effort.you'` into `PERSONAL` after `'edu.moments'` |
| `src/game/household.ts:61, 72` | E6 | one added term in the fatigue formula; `...postureNodes(g)` at the end of `lifePrioritiesMenu.children`; two imports |
| `src/game/modules/index.ts:15` | E6 | `effortModule` first in `MODULES` (sorted by id) |
| `src/game/education.ts:2937, 3117`; `activities/mindBody.ts:949, 962`; `computer/dev-learn.ts:188` | E6 | counter -> `spendFocus` |
| `src/ui/components/ProfileSheet.tsx:457` | E6 | an Ambition row from age 18 |
| `test/education.test.ts:146` | E6 | the one moved test |
| `test/ceiling-list.json` (end), `test/ceiling-kit.ts:486` | E9 | 8 entries; `...EFFORT_ROWS` |
| `test/fixtures/kernel-parity.json` | E10 | re-recorded once (`aging` gains `effort.you`; the Life Priorities tree gains rows) |
| `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` | E6, E10 | rows (create it if missing: `\| file \| test \| before \| after \| why \|`) |

**Lanes and order** (4 lanes; a dependency on another lane means that lane's head is merged into this lane's worktree before the task starts):

| Lane | Tasks in order | Source |
|---|---|---|
| `main` (the engine) | E1, E2, E3 | 1,370 |
| `you` (the person) | E4, E5, E6 | 1,440 |
| `kit` (proof) | E7, E9, E10 | 870 |
| `why` (text) | E8 | 340 |

E1 first: it is only types and constants. Then E2, E4, E7 and E8 run together. E3 waits for E2 and E4; E5 for E2 and E4; E6 for E5. E9 waits for E3, E5, E6, E7 and E8; E10 closes. Critical path: E1, E2 or E4, E5, E6, E9, E10.

**Lead actions** (none can be done by an implementer).
1. Reconcile the open questions in section 4 at the cross-check, above all 1 (oracle format) and 2 (who binds the reveal port).
2. Merge effort-core first as planned; Knowledge then binds `revealPolicy` (R3-E8).
3. After all lanes are merged, R3-E10 re-records `kernel-parity.json` under `/Users/saeed/projects/anotherlife/wt/bin/vt22` (Node 22.23.3) with `RECORD_KERNEL_PARITY=1`, the reason in the commit message.
4. Add the new test files to `scripts/test-timings.json` at the next refresh (all are fast; the light ones carry `// ci: fast`).
5. No flag flips, no `seed: <digits>` pin, no golden digest move is expected: a life that never picks a posture, never studies past 3 times and never banks knowledge has no `effort.you` key.

## 2. Cross-track contracts

**Provided by this track** (other tracks may rely on these exact names):

| Provided | By | Used by |
|---|---|---|
| `effort/types.ts` types, `effort/limits.ts` constants, `defineTask`, `normalizeTask` | E1 | Effort migration (one `Task` per system), Frontier (`K_MAX`, `SPILL_PTS_MAX`), Knowledge |
| `readKnow`, `knowOf`, `learnKnow`, `fadeKnow`, `KNOW_FIELDS` (`effort/know.ts`) | E1 | migration (`b.know`, `TechProgram`), persona |
| `quote(g, task, input): Quote` (the labelled lines are `Quote.reasons`) | E3 | migration (every `*Quote` function), menus |
| `resolve`, `landQuality`, `step`, `newFx`, `normalizeFx` | E5 | migration (the `advance*` year steps): one `rand(g)` per project, in today's order |
| `ambitionOf`, `ambitionReveal`, `postureOf`, `setPosture`, `youInput`, `staffDrive`, `effortStrain`, `readYou`, `YOU_KEY` | E4 | migration (owner and staff inputs), Knowledge (persona reader), R4 (moves the record into `persona.me`) |
| `spendFocus`, `focusPreview`, `focusLeft`, `FOCUS_WEEKS`, `effortModule` | E6 | R6 (school, lessons, kit practice move their counters one line each) |
| `oddsLine`, `whyLines`, `causeLine`, `payoffLine`, `revealPolicy` (port `effort.reveal`), `EXACT_POLICY` | E8 | migration menus, Fog migration, Knowledge (binds the port once) |
| `test/effort-kit.ts`: `inputGrid`, `readOracle`, `expectParity`, `compareParity`, `roundSig`, `trapRng`, `frozenGame` | E7 | Effort migration (oracle `test/fixtures/effort-oracle.json`) |

**Consumed.** Nothing from another track: this track merges first. Soft links: Frontier and Effort migration map `g.world.frontier` to the numbers `quote` takes (`rival`, `spill`, the task's `quality.ceiling`); Knowledge binds the reveal port and calls `know(g, key, truth)` for each `Reveal` that `step` returns.

**Signatures** (E1 writes the types; the others are filled by the task named in the comment):

```ts
// src/game/effort/types.ts (E1)
export type EffortMode = 'project' | 'practice' | 'study' | 'intel'
export type Posture = 'lean' | 'steady' | 'push'
export type OutcomeKind = 'fail' | 'partial' | 'works' | 'hit'
export type CauseKind = 'deadEnd' | 'starved' | 'churn' | 'shortcut' | 'rival' | 'tired'
export type TermKey = 'team' | 'funding' | 'crew' | 'tools' | 'know' | 'hard' | 'rival' | 'spill' | 'bold' | 'tired'
export interface QualityCurve { up: number; down: number; exp: number; ceiling: number; room: number; lo: number; hi: number }
export interface Task { field: string; mode: EffortMode; cost: number; hardness: number; baseYears: number; minYears: number; maxYears: number
  kmax: number; p0: number; oddsExp: number; yearsExp: number; oddsLo: number; oddsHi: number; fteCap: number
  refCrew: { fte: number; skill: number } | null; crewPts: number; quality: QualityCurve | null
  hit: { p: number; bonus: number } | null; spread: number; partial: number; learn: number }
export type TaskSpec = Partial<Omit<Task, 'field' | 'mode' | 'cost'>> & Pick<Task, 'field' | 'mode' | 'cost'>
export interface Worker { fte: number; skill: number; morale: number; drive?: number; fatigue?: number }
export interface Reason { key: TermKey; label: string; pts: number }
export interface EffortInput { who?: 'you'; k?: number; base?: number; baseTerms?: readonly Reason[]; quality0?: number
  people?: readonly Worker[]; tools?: number; knowledge?: number; ambition?: number; posture?: Posture; fatigue?: number
  rival?: number; spill?: number }
export interface Quote { p: number; hitP: number; years: number; yearsExact: number; quality: number | null; spread: number
  k: number; spend: number; payrollX: number; reasons: Reason[]
  effort: { crew: number; tools: number; rho: number; phi: number; speed: number }
  risk: { shortcut: number; explosion: number; scandal: number }; burnout: boolean; capped: string[] }
export interface Outcome { kind: OutcomeKind; margin: number; cause: CauseKind | null; done: number }
export interface Fx { v: 1; progress: number; quality: number; spent: number; hours: number; setbacks: number; insight: number; fatigue: number; last: number }
export interface Reveal { field: string; strength: number; kind: OutcomeKind }
export interface StepCtx { year: number; who?: 'you'; know?: Record<string, number>; fx?: Fx; k?: number; weeks?: number; quality?: number }
export interface StepResult { replay: boolean; knowledge: number; learned: number; shift: number; reveals: Reveal[] }

// engine.ts (E3), step.ts (E5)
export function quote(g: GameState, task: Task, input: EffortInput): Quote   // pure; never reads u; draws nothing
export function resolve(q: Quote, u: number, opts?: { drawHit?: () => number; done?: number }): Outcome  // works iff u < q.p, like chance()
export function landQuality(q: Quote, task: Task, r: number, hit: boolean, bounds?: { lo: number; hi: number }): number
export function step(g: GameState, task: Task, outcome: Outcome, ctx: StepCtx): StepResult  // idempotent by fx.last or at[field]
// persona.ts (E4), focus.ts (E6), why.ts (E8)
export function ambitionOf(g: GameState): number   // 0..100
export function ambitionReveal(g: GameState): { shown: boolean; word: string; value: number }   // shown from age 18
export function youInput(g: GameState, field: string): Required<Pick<EffortInput, 'ambition' | 'posture' | 'fatigue' | 'knowledge'>>
export interface FocusUse { ok: boolean; mult: number; left: number; overtime: number }
export function spendFocus(g: GameState, key: string, full: number, weeks?: number): FocusUse
export interface RevealPolicy { exact: boolean; knows(term: TermKey): boolean; band(p: number): string }
export const revealPolicy: Port<[g: GameState], RevealPolicy>   // definePort('effort.reveal', () => EXACT_POLICY)
export function oddsLine(q: Quote, policy?: RevealPolicy): string
```

**Constants** (`effort/limits.ts`, E1; documented in `docs/EFFORT.md`): `K_MIN .01`, `K_MAX 4`, `KNOW_MAX 100`, `KNOW_FIELDS 40`, `KNOW_FADE .95`, `KNOW_BANK .35`, `KNOW_ODDS_MAX 15`, `SPILL_PTS_MAX 6`, `TOOLS_PTS 6`, `HARD_PTS 30`, `TIRED_PTS 40`, `RIVAL_PTS 8`, `CREW_PTS_MAX 12`, `RHO_MIN .85`, `RHO_MAX 1.25`, `POSTURE_FACTOR {lean .6, steady 1, push 1.3}`, `POSTURE_STRAIN {lean -4, steady 0, push 10}`, `OVERTIME_PAY 1.15`, `FATIGUE_KNEE 35`, `FATIGUE_SLOPE .004`, `BURNOUT_F 85`, `FTE_CAP_MAX 40`, `RISK_MAX .08`, `SHIFT_MAX 12`, `WIN_SHIFT .4`, `BURNOUT_SHIFT -1`, `AMBITION_BASE 6`, `AGE_REVEAL 18`, `FOCUS_WEEKS 12`, `FOCUS_OVERTIME_MAX 12`, `OVERTIME_STRAIN 1.5`. Rule (d) of `test/layer-kit.ts` flags a module-level `const` that reads an import, so derived constants live in `limits.ts` and every other file reads constants inside functions.

---

## 3. Tasks

Every task: the red test file first (it fails because the code or the behaviour is missing), then the change, then `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt22 <files>`. Copy obeys `docs/VOICE.md`: contractions, no dash, a culture line at most 110 characters, a log line at most 90.

### R3-E1 (lane main, no deps): the contract seed

**Goal.** Types, constants, the task builder, the knowledge map and the layer row, so every other lane compiles against fixed shapes. **Items.** C.1.

**Files.**
- Create: `src/game/effort/types.ts`, `limits.ts`, `task.ts`, `know.ts`; `test/effort-task.test.ts`.
- Modify: `test/layer-kit.ts:61` (`WORLD_DIRS` gains `'effort'`; the layer table in the comment above `layerOf` names the directory).

**Interfaces.**
- The `types.ts` block above.
- `defineTask(spec)` fills defaults (`hardness 1`, `minYears 1`, `maxYears 6`, `kmax 4`, `oddsExp .4`, `yearsExp .5`, `oddsLo .02`, `oddsHi .98`, `fteCap 6`, `crewPts 6`, `spread 8`, `partial 0`, `learn 12`) and throws on a `cost` not above 0, a `kmax` above `K_MAX`, a `hardness` outside .5 to 2, a `fteCap` above `FTE_CAP_MAX`, or a `field` that fails `/^[a-z][a-z0-9.]{0,31}$/`. `normalizeTask(raw)` is total (null on garbage).
- `know.ts`: `readKnow(raw): Record<string, number>` (at most `KNOW_FIELDS` keys, field-shaped keys, values 0 to 100 rounded to 2 places), `knowOf(map, field)`, `learnKnow(map, field, gain)` and `fadeKnow(map, idle)` (both clamp at `KNOW_MAX`, drop values under .5).

**Steps.**
1. Red: `effort-task.test.ts` asserts `layerOf('src/game/effort/engine.ts') === 2`, each `defineTask` throw, hostile `readKnow` (strings, NaN, 500 keys, `__proto__`), and that `limits.ts` holds every constant of the table.
2. Write the four files and the one-word layer edit.
3. `tc`, then `vt22 test/effort-task.test.ts test/layers.test.ts test/layers-domains.test.ts`.

**Proves.** The layer row (so no `contract.ts` is needed) and the task and map bounds. **Estimate.** Source 390, tests 330.

### R3-E2 (lane main, deps E1): curves and world terms

**Goal.** Every pure curve of the production function, each with its real-world ceiling. **Items.** C.1.

**Files.** Create `src/game/effort/curves.ts`, `world.ts`; `test/effort-curves.test.ts`.

**Interfaces.**
- `softCeil(raw, ceiling, room)`: identity up to `ceiling - room`, then `ceiling - room*exp(-(raw-(ceiling-room))/room)`. Monotone and below `ceiling`, so parity holds under the knee.
- `laborOf(fte, cap) = cap*(1-exp(-fte/cap))`; `crewRatio(task, people)` is 1 with no crew or no `refCrew`, else `(L^.8*q)/(Lref^.8*qref)` with `q = skill/100*(.35+.95*morale/100)` (the shape of `leadership.ts:10`).
- `rhoOf(ambition, posture) = clamp(.85 + .30*(A/100)*POSTURE_FACTOR[posture], RHO_MIN, RHO_MAX)`: 1 at 50 steady, at most 1.24 at 100 push. `boldOf(ambition, posture) = clamp((A-50)/50,-1,1)*POSTURE_FACTOR[posture]`. `phiOf(F) = 1 - FATIGUE_SLOPE*max(0, F-FATIGUE_KNEE)`.
- `budgetQuality(k, curve)`: `up*(1-k^-exp)` from k=1, `down*log2(k)` below, the shape of `rd.ts:133` with its constants as fields.
- `knowGain(K, gain) = gain*(1-K/110)^1.3`; `knowBank(K, done, learn)` is `KNOW_BANK*100*done` damped the same way; `knowOdds(K)` in points, at most `KNOW_ODDS_MAX`.
- `spillPts(s)` at most `SPILL_PTS_MAX`; `rivalPts(r)` at most `RIVAL_PTS`; `ceilingOf(frontier, headroom)`.

**Steps.**
1. Red: grid tests: identity under the knee; never above `ceiling` at raw 1e6; `rhoOf` bounds and monotone in A; `phiOf(35) = 1`; `budgetQuality` equals the `rd.ts` function over k .05 to 4 with the product constants (import the real one); `knowOdds(100) <= 15`; `laborOf` saturates at `cap`.
2. Write. 3. Checks.

**Proves.** Ambition as built: linear in A, hard-capped at 1.25, paid for by the fatigue it builds (see E9). **Estimate.** Source 360, tests 450.

### R3-E3 (lane main, deps E2, E4): factors and `quote`

**Goal.** `quote(g, task, input)`: odds, years, quality and the labelled reasons. **Items.** C.1.

**Files.** Create `src/game/effort/factors.ts`, `engine.ts`; `test/effort-quote.test.ts`.

**Interfaces.**
- `quote` fills `who: 'you'` from `youInput` (E4) for the fields the caller left out, and clamps `k` to `[K_MIN, min(task.kmax, K_MAX)]`.
- Money: `pk = 1-(1-base)*k^-oddsExp`, with `base = input.base ?? task.p0`.
- Deviations, each given in odds points and zero at the defaults: tools `+TOOLS_PTS*tools`; crew `crewPts*log2(crew)` clamped to `CREW_PTS_MAX`; knowledge `knowOdds(K)`; hard `-HARD_PTS*(hardness-1)`; rival `-rivalPts`; spill `+spillPts`; bold `-.25*bold*logit(pk)` expressed in points (a bold plan pulls toward 50%, a cautious one pushes away); tired `-TIRED_PTS*(1-phi)`. Each point value becomes a logit shift `pts/(100*max(.05, pk*(1-pk)))`, clamped to +-2, and `p = clamp(sigmoid(logit(pk)+sum), oddsLo, oddsHi)`; with a zero sum `p` is exactly `pk`.
- Reasons are attributed in order team (the caller's `baseTerms`, passed through), funding, crew, tools, know, hard, rival, spill, bold, tired; the engine lines sum to `round(p*100)-round(base*100)` (the remainder goes to the largest). Labels: team, funding, crew, tools, know-how, hard field (easy field when positive), rivals, open research, bold plan, tired.
- Speed `R = crew*(1+.3*tools)*rho*phi`; `yearsExact = baseYears/(k^yearsExp*R)`; `years = clamp(ceil(yearsExact-1e-9), minYears, maxYears)`.
- Quality `round(softCeil(clamp(quality0 + budgetQuality(k) + 3*K/100, lo, hi), ceiling, room))`; `spread = task.spread*(1+.5*bold)`; `hitP = clamp(hit.p*(1+.4*bold), 0, .5)`; `payrollX = posture === 'push' ? OVERTIME_PAY : 1`; `risk` is reported, not rolled, each at most `RISK_MAX`, all 0 at the defaults (`shortcut .04*max(0,bold)`, `explosion .03*max(0,bold)*hardness`, `scandal` only on push); `burnout = fatigue >= BURNOUT_F`; `capped` lists the ceilings that bound (`k`, `fte`, `knowledge`, `quality`, `rho`).

**Steps.**
1. Red, in `effort-quote.test.ts`: with default actor values the odds, years and quality equal the `rd.ts:172-173` formulas over k .5 to 4 and p0 .1 to .9 (copied into the test with the line numbers); the reasons sum; a `u` getter on the input never fires; the same input twice gives equal `Quote`s; each term moves its own reason only; `k` 400 is clamped and `capped` says so.
2. Write. 3. Checks.

**Proves.** Parity at the defaults for the product shape; "inputs buy odds and speed, never a lower price" (`spend = k*cost`, nothing reads cash). **Estimate.** Source 620, tests 640.

### R3-E4 (lane you, deps E1): the persona record

**Goal.** `flags['effort.you']`, derived ambition, the age-18 reveal, posture, staff drive. **Items.** C.2, C.1 (actor).

**Files.**
- Create: `src/game/effort/persona.ts`; `test/effort-persona.test.ts`.
- Modify: `src/game/world-flags.ts:81` (`'effort.you'` in `PERSONAL`).

**Interfaces.**
- `YOU_KEY = 'effort.you'`. `EffortYou { v:1; owner; shift; posture; effective; over; fieldK; at; burnouts; burnAt; last }`: `owner` is `${generation}:${character.id}` (the `household.ts:17` string), `fieldK` and `at` hold at most `KNOW_FIELDS` keys, `shift` stays within +-`SHIFT_MAX`, `over` within 0 to 60.
- `readYou(g)` is total, never writes, and returns the defaults for a missing or another owner's record. `writeYou(g, y)` bounds the record and stores nothing when it equals the defaults.
- `ambitionOf(g) = clamp(.5*willpower + .3*discipline + AMBITION_BASE + talentBonus + shift, 0, 100)`: the 6 centres a mean life (55 and 55) on 50; Inventor, Business, Leadership, Academics and Athletics add 4 each, Main Character 8, at most 10 (`hasTalent`, `talents.ts:176`).
- `ambitionReveal(g)`: shown at age 18 or more; words Easygoing under 25, Steady under 45, Driven under 65, Hungry under 85, else Relentless.
- `postureOf(g)` is the `effective` one ('steady' under 18); `setPosture(g, p)` (age 18 or more) sets the choice, which takes effect at the next age-up like the priorities in `household.ts`; `POSTURE_LABELS`; `effortStrain(g)` is the closing year's `POSTURE_STRAIN[effective]` plus `OVERTIME_STRAIN*over`; `recordWin`, `recordBurnout`; `fatigueOf(g)` reads `g.flags.household` raw with the owner check, 0 to 100.
- `staffDrive(traitId)`: a table over the 13 `STAFF_TRAITS` (workaholic 85, visionary 80, perfectionist 70, and so on down to lazy 15; unknown 50). `youInput(g, field)` returns `{ ambition, posture, fatigue, knowledge: fieldK[field] ?? 0 }`.

**Steps.**
1. Red: hostile records (strings, NaN, 1e9, 500 keys, a foreign owner) read as defaults and bounded; an untouched life never gets the key over 40 `ageUp` calls (JSON compare); `ambitionOf` is 46 at willpower 50 and discipline 50; the reveal is false at 17 and true at 18; `fatigueOf` equals `householdView(g).fatigue`; `staffDrive` has an entry for every id in `STAFF_TRAITS`; `world-flags` and `heir-world-flags` tests pass (personal: the heir starts clean).
2. Write. 3. Checks plus `vt22 test/world-flags.test.ts test/heir-world-flags.test.ts`.

**Proves.** D15 as far as this track goes (hidden, derived, revealed at 18); old saves have no key and load. **Estimate.** Source 400, tests 500.

### R3-E5 (lane you, deps E2, E4): `resolve`, `step` and the `fx` record

**Goal.** Turn the caller's single draw into an outcome and book what it taught. **Items.** C.1.

**Files.** Create `src/game/effort/step.ts`, `fx.ts`; `test/effort-step.test.ts`.

**Interfaces.**
- `resolve(q, u, opts)`: `works` iff `u < q.p` (the same test as `chance()`, `rng.ts:32`); `partial` iff `task.partial > 0` and `u < p + partial`; `opts.drawHit()` is called only when it works and `hitP > 0`, so the caller's draw order is today's; `margin = (q.p - u)*100`; a failure's `cause` is the largest negative reason (funding -> starved, crew -> churn, rival, tired, bold -> shortcut, else deadEnd), a pure function of `Quote.reasons`.
- `landQuality(q, task, r, hit, bounds)` is `round(clamp(q.quality + (2r-1)*q.spread + (hit ? task.hit.bonus : 0), lo, hi))`, the launch roll of `rd.ts` with the caller's draw.
- `newFx(year)`, `normalizeFx(raw)`: total, nine numbers within caps.
- `step`: for `who: 'you'` it edits `readYou(g).fieldK`, `at` and `shift` (`WIN_SHIFT` on works or hit); otherwise it edits `ctx.know`. On a failure it banks `knowBank` (so at most +15 odds points later through `knowOdds`). It updates `ctx.fx` (`progress`, `quality`, `spent`, `hours`, `setbacks`, `insight`, `last`). It returns one `Reveal` (strength `.35*done` on a failure, `.5 + .5*done` on a win) so research pays visibly. A replay (same `fx.last` or `at[field]` year) changes nothing and returns `replay: true`.

**Steps.**
1. Red: 10,000 seeded draws give the same win count as `chance(g, p)`; the second draw happens only on a win; `step` twice in one year equals once; K never above 100 over 400 failures; banked odds points never above 15; a win adds .4 to the shift (cap `SHIFT_MAX`); hostile `fx` reads.
2. Write. 3. Checks.

**Proves.** "Each project still draws one `g.rng` number in today's order"; the 15-point bank. **Estimate.** Source 480, tests 600.

### R3-E6 (lane you, deps E4, E5): focus weeks, the settle, fatigue, rows and sites

**Goal.** The pool of 12 weeks, posture and burnout in play, and four counters moved onto the pool. **Items.** C.2.

**Files.**
- Create: `src/game/effort/focus.ts`, `menu.ts`, `module.ts`; `test/effort-focus.test.ts`.
- Modify: `src/game/household.ts:61` (`+ effortStrain(g)` in the fatigue formula, imports) and `:72` (`...postureNodes(g)` after the priority rows); `src/game/modules/index.ts:15`; `education.ts:2937, 3117`; `activities/mindBody.ts:949, 962`; `computer/dev-learn.ts:188`; `src/ui/components/ProfileSheet.tsx:457` (`<KV rows={[['Ambition', word]]}>` after the bars, age 18 or more); `test/education.test.ts:146`.

**Interfaces.**
- The pool is derived: `focusUsed(g)` sums `g.yearActions` over `FOCUS_KEYS` (`study`, `practice:`, `act.lesson.`, `computer.dev.tutorial`; one week a use), so `aging.ts:37` resets it and no field is added.
- `focusPreview(g, key, full, weeks)` is the pure check (for `disabledReason` and the pre-payment test in `takeLesson`); `spendFocus` records the use the way `useYearAction` (`core.ts:521`) does and returns `FocusUse`.
- `mult` is 1 while the key's uses are within `full` (today's caps: study 3, practice 2, lessons 3, tutorial 3, so today's numbers hold) and .5 beyond. Once 12 weeks are used, each extra week adds 1 to `EffortYou.over` (written lazily) and `ok` stays true until 24 weeks, when the site says "You can't fit another week into this year."
- `effortModule` (id `effort.you`, layer 2) has one yearly entry in the aging seam, phase `life`, order 35, after `household`. `yearlyEffort` is idempotent by `last`, rolls `effective` from `posture`, fades idle `fieldK` by `KNOW_FADE`, clears `over`, and at fatigue 85 or more records a burnout (shift -1, lean for the year, one notice at most every 3 years: "You pushed past your limit. You're easing off this year."). It does nothing when no record exists.
- `postureNodes(g)` returns an info row (ambition word, posture, weeks left) and three actions (ids `effort.posture.lean|steady|push`) for age 18 or more; pure to read.

**Steps.**
1. Red, in `effort-focus.test.ts`: three studies are unchanged (gain, `counters.studied`); the 4th runs at half value instead of being refused; the 25th week is refused; fatigue after a push year is 10 higher than steady in `householdView`; the settle twice equals once; a life that stays within the caps is JSON-identical to the pre-change run over 20 years; walking `lifePrioritiesMenu` leaves `JSON.stringify(g)` unchanged (`living-economy.test.ts:35`); the Profile row shows the word at 18 and nothing at 17.
2. Write; update `education.test.ts:146` to the new rule and add the `moved-tests.md` row (before: the 4th study is refused and `studied` stays 3; after: it runs at half value, `studied` is 4, the 25th week is refused; why: D16, overdoing becomes fatigue instead of a refusal).
3. `tc`, then `vt22 test/effort-focus.test.ts test/education.test.ts test/living-economy.test.ts test/activities.test.ts test/kernel-aging.test.ts test/talents-ui.test.ts test/main-character-ui.test.ts`.

**Proves.** D16 (pool; overdoing is fatigue), posture and burnout, ambition from 18. **Estimate.** Source 560, tests 640.

### R3-E7 (lane kit, no deps): the purity kit

**Goal.** The test tools that prove "quote never reads u", "no g.rng in a read" and "bounded under a frozen state", built before any caller exists. The parity harness (oracle file, inputGrid, readOracle, compareParity, expectParity) moved to R3-M0 so the oracle can be recorded on unmodified code at the start (`00-crosscheck.md` decision 7). **Items.** C.1.

**Files.** Create `test/effort-kit.ts`, `test/effort-kit.test.ts`.

**Interfaces.** `trapRng(g)`: a state whose `rng` read or write throws. `frozenGame(seed)`: `makeTestGame` under `deepFreeze` (`test/fuzz-kit.ts:516`) and the trap. `uTrap(input)`: the same input with a `u` property whose getter throws, so a quote that reads it fails the test. `roundSig(x, digits = 9)`: the 9-significant-digit cut the fixtures use.

**Steps.** 1. Red: each tool throws where it should and is silent where it should not (a read of another field, a clone, a JSON.stringify of the frozen state). 2. Write. 3. Checks: `tc`; `vt22 test/effort-kit.test.ts`.

**Proves.** The tools R3-E9 uses. **Estimate.** Source 150, tests 150.

---

### R3-E8 (lane why, deps E1): the "why" lines and the reveal port

**Goal.** The text of research: the odds line, causes, payoffs, and the seam Knowledge binds. **Items.** C.11.

**Files.** Create `src/game/effort/why.ts`; `test/effort-why.test.ts`.

**Interfaces.**
- `EXACT_POLICY` (the test suite and Exact mode); `revealPolicy = definePort<[g: GameState], RevealPolicy>('effort.reveal', () => EXACT_POLICY)` (`kernel/ports.ts`). Knowledge binds it once, so this track imports nothing from Knowledge.
- `oddsLine(q, policy)`: "Odds 62%: team +9, funding +7, hard field -12, tired -4": the four largest by size and "other +2" for the rest, at most 110 characters. A realistic policy writes "about 60%" and shows a term it doesn't know as "unknown factors".
- `whyLines(q, policy)` (one short line per non-zero term); `causeLine(cause, field)` (for example "The budget was too thin for a field this hard."); `payoffLine(task, outcome, result)` ("You learned the field better: know-how 34."); `whyNodes(g, q)` (info rows, pure).

**Steps.**
1. Red, on hand-built `Quote` literals: the example line verbatim; the folding; the 110 limit over a 10-term quote; no U+2013 or U+2014; a policy that hides a term; the fallback is exact; every `CauseKind` has a line.
2. Write. 3. Checks.

**Proves.** The player-sees line of the R3 block; "research must pay visibly" (a payoff line for every outcome). **Estimate.** Source 340, tests 380.

### R3-E9 (lane kit, deps E3, E5, E6, E7, E8): conservation, purity, the 200-year probe, the ceilings

**Goal.** The proofs of C.12. **Items.** C.12.

**Files.**
- Create: `test/effort-conservation.test.ts`, `test/effort-pure.test.ts`, `test/effort-longrun.test.ts`, `test/effort-ceilings.ts` (exports `EFFORT_ROWS: CeilingProbe[]`).
- Modify: `test/ceiling-list.json` (8 entries: `effort-k-max` `K_MAX`, `effort-knowledge` `KNOW_MAX`, `effort-know-odds` `KNOW_ODDS_MAX`, `effort-quality` `softCeil`, `effort-rho` `RHO_MAX`, `effort-labor` `FTE_CAP_MAX`, `effort-spill` `SPILL_PTS_MAX`, `effort-focus` `FOCUS_OVERTIME_MAX`); `test/ceiling-kit.ts:486` (`...EFFORT_ROWS`).

**Steps.**
1. Red:
   - Conservation: `booksOf` and `character.money` are identical around 500 `quote` and `step` calls and a played 30-year life; a token scan shows `src/game/effort/` imports no `cash`, `ledger`, `spend` or `book`.
   - Purity: a trapped `g.rng` and a deep-frozen state survive `quote`, `oddsLine`, `postureNodes`, `ambitionReveal` and `readYou`; a `u` trap on the input never fires; no `rand`, `chance`, `.rng`, `Math.random` or `Date` token in the folder.
   - 200 years at maximum inputs (`k` 400, fte 4,000, tools 1, ambition 100, push, knowledge fed back through `step`): `k` at most 4, K at most 100, quality at most the ceiling, banked points at most 15, rho at most 1.25; a 10-year push builds fatigue that puts `rho*phi` below steady for ambition under 50.
   - Idempotence of `step` and `yearlyEffort`; hostile `effort.you` through `old-saves.test.ts`.
2. Write the ceiling rows (each scales its inputs by 1 and 100) and the list entries.
3. `tc`, then `vt22 test/ceiling-list.test.ts test/ceiling-probe.test.ts test/old-saves.test.ts test/money-ratchet.test.ts` and the three new files.

**Proves.** The engine half of the 200-year probe, "quote never reads u", conservation, the three probe numbers. **Estimate.** Source 400, tests 460.

### R3-E10 (lane kit, deps E9): barrel, docs, fixtures, sweep

**Goal.** Close the track. **Items.** C.12.

**Files.**
- Create: `src/game/effort/index.ts` (re-exports the names of section 2), `docs/EFFORT.md` (the model, the constants table, and "how to migrate a system": set `p0`, years, exponents and the quality curve to today's numbers, pass no `people` until its crew is modelled, keep the parity grid green), `test/effort-api.test.ts` (the barrel exports every contract name; the doc names every constant of `limits.ts`).
- Modify: `test/fixtures/kernel-parity.json` (re-record); `moved-tests.md`.

**Steps.**
1. Red: the API test.
2. Write.
3. Re-record: `RECORD_KERNEL_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/kernel-parity.test.ts`; commit message: "adds the effort.you yearly hook and the posture rows to the parity fixture".
4. The sweep, a few files at a time, never the full suite: every `test/effort-*.test.ts`, then `world-flags`, `heir-world-flags`, `save-slices`, `layers`, `layers-domains`, `architecture`, `voice-guards`, `world-streams`, `kernel-registry`, `kernel-aging`, `old-saves`, `ceiling-list`, `ceiling-probe`, `money-ratchet`.

**Proves.** The list above is green. **Estimate.** Source 90, tests 100.

---

## 4. Open questions (for the cross-check)

1. **Oracle format and name.** This plan fixes `test/fixtures/effort-oracle.json` and the row shape in R3-E7. The Effort migration planner must record the oracle in it, or both change together.
2. **Who binds the reveal port and who calls `know()`.** Knowledge binds `revealPolicy` once and calls `know(g, key, truth)` for each `Reveal` that `step` returns (a glue line in the migrated year steps). If Knowledge would rather own the call, `step` can emit a fact instead. This track imports nothing from Knowledge because it merges first.
3. **Who rolls the risks.** `Quote.risk` (shortcut, explosion, scandal) is reported, not rolled. The roll belongs to Effort migration, from a named stream (`outcomeStream(g, 'effort.risk', year, id)` plus a row in `test/stream-tap.ts`), so this track adds no stream row. The overtime pay (`Quote.payrollX`) is booked by the caller as payroll through the ledger.
4. **"Concave, at most plus 25%".** Built as: linear in ambition (the owner's formula), hard-capped at 1.25 (`RHO_MAX`), and paid for by the fatigue push builds, proven by the E9 probe. If the owner wants a curved response in A itself, `rhoOf` is the one function to change.
5. **Company knowledge and `fx` fields.** `b.know` on `BizState`, and `fx` on `RdProject` and `TechProgram`, are added by Effort migration (it owns `business/state.ts`); this track gives the readers (`readKnow`, `normalizeFx`) and takes the map by reference.
6. **Layer row.** `'effort'` joins `WORLD_DIRS` in `test/layer-kit.ts`. If Frontier or Knowledge edit that line too, the merge is a one-word conflict. The alternative (layer 3 plus a `contract.ts`) would make every migrated domain a new domain pair in `test/layers-baseline.json`.
7. **Study Harder and the moved test.** The owner's rule (overdoing is fatigue, not a refusal) makes the 4th study legal, so `education.test.ts:146` moves. Gym and the special-career practice counters stay on `useYearAction` until R6.
8. **Ambition on the Profile.** Shown as a word. If Knowledge wants the exact number in Exact mode, the row moves to its helper later; no change here.

---

## Cross-check amendments (2026-10-22)

These override the text above. Numbered decisions (D1, D2, ...) are in `00-crosscheck.md` section 6. Task ids and lanes are unchanged; R3-E7 is smaller and has no dependency.

- **A1 Names (D6).** `effort/know.ts` becomes `effort/knowhow.ts`; `readKnow`, `knowOf`, `learnKnow`, `fadeKnow`, `KNOW_FIELDS` become `readKnowHow`, `knowHowOf`, `learnKnowHow`, `fadeKnowHow`, `KNOW_HOW_FIELDS` (the Knowledge track owns `readKnow`, `learn`, `KNOW_FLAG`, `KNOW_LIMITS`). A company keeps its map as `BizState.knowHow` (added by R3-M1). `EffortInput.knowledge` and the `KNOW_*` limits keep their names.
- **A2 Hooks, not ports (D8).** R3-E1 also creates `src/game/effort/hooks.ts`: `RevealPolicy` and `EXACT_POLICY` (moved here from `why.ts`), `bindRevealed(fn)` with `revealedSink(g, reveals)` (default: nothing) and `bindRevealPolicy(fn)` with `revealPolicyOf(g)` (default: `EXACT_POLICY`). A second bind of the same function is fine, a different one throws, as in `kernel/ports.ts`. They are NOT kernel ports: `test/hub-entry.test.ts` fails when a defined port is unbound after the real entry points, and the binders (Knowledge R3-H5, Fog R3-G7) merge later. R3-E8 reads `revealPolicyOf(g)` and does not call `definePort`; drop the port `effort.reveal` from every list in this file.
- **A3 Limits (D9, D13).** `TermKey` gains `'ceo'`. `TERM_LABEL` in `limits.ts`: team "team", funding "funding", crew "crew", tools "tools", know "know-how", hard "hard field" (an easy field when positive), rival "rival pressure", spill "public research", bold "bold plan", tired "tired", ceo "steady CEO". The spill and rival strings are the Frontier track's `FRONTIER_REASONS` (R3-F6 asserts the same two literals; R3-M11 asserts equality with `TERM_LABEL`). `SPILL_TERM_MAX = 18` is the most odds points a quote takes from public research (the Frontier pool); `SPILL_PTS_MAX = 6` stays as the documented per-disclosure number and quote does not use it. `Task` gains `knowYears` (0 to .15, default 0): the speed factor `1 + knowYears*K/100`; only the studio engine (R3-M7) sets it. `Task.field` pattern is `/^[a-z][a-zA-Z0-9.]{0,39}$/` (trades are camel case: `dt.aiLab.cap.reasoning`).
- **A4 R3-E2.** `spillPts` caps at `SPILL_TERM_MAX`. `softCeil` with `room` 0 is a hard clamp at the ceiling (tested): the product task uses it to keep parity under 97.
- **A5 R3-E3 crew and drive (D14).** Each worker's output is `q_i = skill/100 * (.35 + .95*morale/100) * (.9 + .2*drive/100) * phiOf(fatigue_i ?? 0)`; the neutral worker (drive 50, fatigue 0) is the old formula bit for bit. `input.ambition` stays the actor's; `Worker.drive` does not touch `rho`. `baseTerms` may carry key `'ceo'` (R3-M10). Quote reports `risk` and `payrollX`; R3 rolls and books neither except where a migrated system says so (studio setbacks R3-M7, Workshop kaboom R3-M8); `docs/EFFORT.md` says so (D12).
- **A6 R3-E4 and R3-E5.** R3-E4 exports `burnedOut(g): boolean` (`fatigueOf(g) >= BURNOUT_F`). R3-E5: `step` calls `revealedSink(g, result.reveals)` once, after booking, never on a replay (test with a bound sink).
- **A7 R3-E6 focus counters (D16).** `spendFocus(g, key, fullWeeks, weeks = 1)` adds `weeks` to `g.yearActions[key]`, so the four existing sites keep their counters byte for byte (study 1, 2, 3 as today). `yearActions` is digested in the golden `character` slice, so no new key may appear: the pool is the sum of the counters of `FOCUS_KEYS`, which also lists `workshop.build` and `workshop.brainstorm` (R3-M9 spends weeks there: a counter of those keys counts weeks).
- **A8 R3-E7 (D7).** Purity kit only: `test/effort-kit.ts` with `trapRng`, `frozenGame`, `uTrap`, `roundSig`. The oracle file, `inputGrid`, `readOracle`, `compareParity`, `expectParity` are R3-M0's. No dependency; about 150 source, 150 test.
- **A9 R3-E9.** The row `effort-spill` reads `SPILL_TERM_MAX`. Add: a quote with `spill` 1000 and `rival` 1000 moves odds by at most +18 and -8 points. Rho is linear in ambition, capped at 1.25 and paid by fatigue (D10); the probe asserts the bound, not a taste: over 200 years of push at ambition 100 the speed `rho*phi` never exceeds 1.25 and every burnout drops the next year to lean, and (as written in R3-E9) a 10-year push at ambition under 50 ends below steady.
- **A10 R3-E10.** Re-record `kernel-parity.json` on the track branch only to keep the branch green; the merge into `release/v5.1.0` re-records again from the merged tree (`00-crosscheck.md` section 4). The sweep list also runs `test/hub-entry.test.ts` and `test/kernel-acceptance.test.ts`.
- **A11 Hot files.** `src/game/modules/index.ts`: `effortModule` goes first (id `effort.you` sorts before `menus` ids); Knowledge's `knowledge.core` goes beside it; keep both, sorted by id. `test/hub-entry.test.ts` HUBS gains `effort/module`. `world-flags.ts` PERSONAL gains `'effort.you'` (other tracks add `'know'`, `'yearBook'`, `'pendingAsks'` in the same array: keep all, alphabetical).
- **A12 Banking (D6).** For `mode: 'project'`, `step` banks know-how only on a failure (`knowBank`, at most `KNOW_ODDS_MAX` odds points later); a win banks none and, for the player, adds `WIN_SHIFT` to the persona shift. `knowGain` and `Task.learn` serve the study and practice modes (R6) and no migrated system calls them. The Profile shows ambition as a word from 18 (core question 8).
