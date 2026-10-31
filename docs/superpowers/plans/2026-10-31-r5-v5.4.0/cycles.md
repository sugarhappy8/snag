# R5 plan, Cycles (track `cycles`, task prefix Y)

> Status: first pass, 2026-10-31. Base: `release/v5.4.0` = main at v5.3.0 (`1c73b31`). Code read at `1c73b31` in `/home/user/snag`; nothing under `src/`, `test/`, `scripts/` or `docs/` was edited and nothing was added to git. Plain hyphens only (no U+2014, no U+2013). **This track runs in small commits and merges before the flip task N11.** The first draft said it waits for every other R5 track because it moves code in files those tracks also edit (`economy.ts`, `rd.ts`, `heavy-rd.ts`, `tech-waves.ts`). The cross-check grepped the other three plans: none of them edits a file this track moves (the Paper reads `business/economy.ts:895-898` and edits nothing there; the composer's O13 edits the leaf `frontier-waves.ts` and not `tech-waves.ts`; the Bundle track's B7 touches import lines of `business/gamestudio*.ts` only). So Y1 can start at once and Y8 must merge before N11 (cross-check C8). A task re-greps every anchor before it edits (lines drift). UNVERIFIED marks a claim I did not check.

> How this plan was checked. I built the whole change in a scratch copy of `src/` and `test/` (`/tmp/claude-0/-home-user-snag/6c431472-dc02-517c-872c-436596f3a0de/scratchpad/cycles/proto`; never in the repo). On that copy:
> - the import graph has **0 cycles**, and `tsc --noEmit` on `src` is clean;
> - about 100 test files ran with no assertion changed and no side-effect import added: the guard set, the golden set, `heavy-*`, `lab-*`, `rd-*`, `bank`, `fund`, `conglomerate*`, `model-*`, `actor-*`, `astronaut-*`, `computer-money`, `assets`, `landlord`, `crime`, `underworld`, `hub-entry`, `layers*`;
> - every failure was expected or environmental: the `boardAllows` spies (Y3), the exact port list in `kernel-acceptance.test.ts`, the cycle-count assertions that a shrunk baseline must move (Y8), one domain-pair count that rose by 1 when I first tried a leaf for the money pair (so Y7 uses a port), and two tests that read `docs/` and `.github/`, which the copy lacked;
> - the set of registered script ids after `aging` and `menus` is the same 544 before and after;
> - the initial bundle is 712 bytes gzip smaller (3,004,607 against 3,005,319 initial JS).
>
> Figures marked "measured" come from that copy. Only the first stage (56) and the last (0) were measured; the others are the removal model run on the real graph.

## 1. Track summary

**Item.** K.2b (roadmap 1,800 planned lines): remove the import cycles that remain after R2 K.2a. **Eight tasks, about 965 source lines and 1,260 test lines, 150 docs lines.** The source figure is the 858 lines inserted in 47 files (11 of them new) on the copy, plus imports the copy left rough; most are moved lines, which count once, so it is under the roadmap's 1,800.

**The cycles today** (measured with the `test/arch-kit.ts` rules on 895 modules and 6,081 imports; `test/architecture-baseline.json` matches exactly):

| # | Modules | Where | What closes it |
|---|---|---|---|
| 1 | 59 (221 internal imports) | `business/`: bank, board, company, fund, lab, market, sector, tech-wave files | `economy.ts` (37 importers inside the cycle) imports its own engines `rd`, `heavy-rd`, `product-market`, `finance-firm`, and they import it back; also `board-vote -> gamestudio`, `lab-year -> board`, `group-treasury -> conglomerate-actions` |
| 2 | 8 | `special/model-*` | every child imports the facade `model.ts` for shared tables and readers; `model-board <-> model-events` |
| 3 | 7 | `special/actor-*` | four children import `actorJob` and `viewActor` from the facade `actor.ts` |
| 4 | 6 | `special/astronaut-*` | four children import agencies, destinations, profile and `flyOn` from `astronaut.ts` |
| 5 | 4 | `business/conglomerate-menu`, `conglomerate`, `manage`, `yearly` | `yearly -> conglomerate` (a 29-line facade) closes a ring through `manage` |
| 6-8 | 2 + 2 + 2 | `assets <-> landlord`, `computer/money-options <-> money-stocks`, `crime <-> underworld` | one back import each |

90 modules in 8 cycles; none crosses a directory (R2-K6). `staff.ts` and `dynasty-ownership.ts` (hot in R4) are in cycle 1 only because they import `economy`. **This track does not edit them**; they leave the cycle when `economy` stops importing its engines. `tech-waves.ts` gets one import line; `manage.ts` is not touched.

**The design.** Four techniques, all behaviour-neutral, the ones R2 and R4 already used:
1. **Leaf extraction with a re-export** (R2 cuts 1 to 7; R4-P7 `world/typical-income.ts`): code moves verbatim to a new module that imports nothing in a cycle; the old module re-exports every moved name, so no outside importer changes. Six leaves (`heavy-state`, `product-hash`, `model-base`, `actor-profile`, `astronaut-base`, `house-value`) and two single moves (`earmarkedCash`; `movableCash` with `treasuryOf`).
2. **Import to the real owner** (twice): `lab-year` and `yearly` stop importing the facades `board` and `conglomerate` and import the module that owns the name.
3. **A port** (`kernel/ports.ts`, R2), only where a lower module must call a higher one: **nine ports**, each bound at its provider's load and checked by `hub-entry`.
4. Nothing else: no behaviour, saved field, string, draw or money call changes.

**The cuts: 31 import statements** (Y2 4, Y3 4, Y4 4, Y5 8, Y6 8, Y7 3). A search over module orders found none with fewer than 10 back imports for the 59-module cycle (heuristic, not a proof), so the 12 business cuts are near the floor.

| Task | Cut (from -> to : names) | Technique | In cycles after | Cycles |
|---|---|---|---|---|
| Y1 | none (oracle) | - | 90 | 8 |
| Y2 | `economy`, `product-market`, `tech-waves`, `rd` -> `heavy-rd` : the pure readers (`heavyPulse`, `readHeavy`, `heavyArrival`, `heavyLevel`, `heavyOf` ...) | leaves `heavy-state`, `product-hash` | 87 (cycle 1: 56, measured) | 8 |
| Y3 | `board-vote -> gamestudio`; `group-treasury -> conglomerate-actions`; `lab-year -> board`; `yearly -> conglomerate` | 2 moves, 2 owner imports | 58 (cycle 1: 31; the 4-ring is gone) | 7 |
| Y4 | `economy -> rd`; `economy -> finance-firm`; `rd -> heavy-rd`; `rd -> lab-year` | 5 ports | 27 | 6 |
| Y5 | seven `model-* -> model`; `model-board -> model-events` | leaf `model-base` + 1 port | 19 | 5 |
| Y6 | four `actor-* -> actor`; four `astronaut-* -> astronaut` | leaves `actor-profile`, `astronaut-base` + 1 port | 6 | 3 |
| Y7 | `landlord -> assets`; `money-options -> money-stocks`; `underworld -> crime` | leaf `house-value`, 2 ports | 0 (measured) | 0 |
| Y8 | zero rule, notes | - | 0 | 0 |

**Cycles I will not break: none.** All eight fall on the copy. Rejected on purpose: splitting `economy.ts` (1,606 lines) into a core and a sim file (37 importers retarget, each a hot file for R5 and R6); a dispatcher module for the R&D year in place of three ports (about ten test import edits, Q2); moving the `yearly.ts` credit helpers `manage.ts` uses (not needed once `yearly` stops importing the facade). If the lead wants to stop early, the safe stops are after Y4 (the business domain is clean) and after Y7.

**What the player sees.** Nothing. No fixture, pin or digest moves.

**State and bundle.** No saved field; schema stays 3; old saves load unchanged. No new growth term, so no `ceiling-list.json` row and no 100-times probe. Bundle target in gzip bytes: the initial total after Y8 is at most the pre-Y1 total plus 1,500 (measured: minus 712). v5.3.0 reads +54,001 against the v5.2.0 baseline 2,969,098 (5,999 under the allowance); R5's bundle-diet task re-captures that baseline, so Y reports a difference on one tree, not an absolute.

**House rules.** Saves: untouched. Determinism: no `g.rng` call added or moved; the order inside `advanceRd` is kept (`heavyArrivals`, `advanceLab`, then the project loop). Money: no `earnIncome`, `spend` or `addMoney` is written; moved blocks hold no unreasoned money call (`money-ratchet` green on the copy). Foresight: no `year+1` read added. Voice, repetition and quiet gates: no string is added, moved or changed, so `text-repeat` (42 of 42), `quiet-acceptance` (7.32%) and `text-kit` (4.7%) cannot move. Seeds: new tests use `findSeed(pred)`; no `seed: N` line. Fixtures: **none move** (Section 3 lists the tests that are edited on purpose; none is a recorded fixture). Models: Sonnet builds; Y4 is the one Opus-fallback task.

## 2. Contracts

### 2.1 New modules (names frozen when Y1 merges; a later task may only add exports)

| Module | Holds (moved verbatim from) | Imports (nothing in a cycle) |
|---|---|---|
| `business/product-hash.ts` | `fnv`, `hashCache`, `hashOf`, `mix` (`product-market.ts:152-181`) | none |
| `business/heavy-state.ts` | the pure half of Heavy R&D (`heavy-rd.ts:40-290`): `HeavyRecord`, `MAX_HEAVY_RECORDS`, `MAX_RIVAL` (now exported), `heavyKey`, `readHeavy`, `heavyOf`, `addHeavy`, `writeHeavy` (now exported), `heavyWorldFlags`, `heavyLevel`, `heavyLevelFor`, `TIER_LAG`, `heavyArrival`, `heavyFringeArrival`, `heavyVersionQuality`, `heavyPulse` | `../history/market-events`, `./competition-core`, `./heavy-data`, type `./product-data`, `./product-hash`, `./util`, `../types` |
| `special/model-base.ts` | `Agency`, `AGENCIES`, `RANKS`, `RANK_MULT`, `DESIGNERS`, `PHOTOGRAPHERS`, `ModelProfile`, `ModelJob`, `initModel`, `modelNumber`, `modelList`, `normalizedModel`, `modelProfile`, `viewModel`, `modelJob`, `mdata`, `GIG_BUMP`, `noteGig`, `modelingSkill`, `looksBar` (`model.ts:17-163`, about 100 lines) + port `special.modelInjuryOdds` | `../talents`, `../kernel/ports`, `./common`, type `./model-state` |
| `special/actor-profile.ts` | `Kind`, `Credit`, `Agent`, `ActorProfile`, `initActor`, `actorNumber`, `actorText`, `normalizedActor`, `actorProfile`, `viewActor`, `actorJob` (`actor.ts:25-157`, except `Project`, `ActorJobData`, `Listing`) | `./common`, type `./actor-state` |
| `special/astronaut-base.ts` | `Agency`, `AGENCIES`, `SPACE_AGENCIES`, `localAgency`, `agencyOf`, `Planet`, `AstroProfile`, `initAstro`, `astroProfile`, `viewAstro`, `AstroData`, `astronautJob`, `adata`, `RESEARCH_MAX`, `researchPoints`, `addResearchPoints`, `Destination`, `DESTINATIONS`, `destOf` (`astronaut.ts:54-100,117-180,473-486,527-552`, about 125 lines) + port `special.astronautFlyOn` | `./common`, `./astronaut-state`, `./kit/state`, `../kernel/ports` |
| `house-value.ts` | `nicePrice`, `upkeepRate`, `haunted`, `marketValue`, `condFactor`, `hauntFactor`, `refreshHouseValue` and a private 3-line `num` (`assets.ts:85,522-528,672-674,693-713`) | `./types` only |

`gamestudio-state.ts` gains `earmarkedCash`; `group-treasury.ts` gains `movableCash` and `treasuryOf`. **Rule for every move:** the old module re-exports each moved name (`export { ... } from './x'` plus an `import` for its own use). Never a second copy; `Object.is(old.name, new.name)` is a test (`cycle-seams`).

### 2.2 New ports (nine; names frozen). `EXPECTED_PORTS` and `PORTS` become these 15 names, sorted

`activities.relocate`, `business.advanceHeavy`, `business.advanceLab`, `business.advanceResearch`, `business.discloseResearch`, `business.heavyArrivals`, `business.revalueCompany`, `business.simulateFinance`, `computer.gameMakingMenu`, `computer.stockBetsMenu`, `special.astronautFlyOn`, `special.modelInjuryOdds`, `talents.hintLens`, `underworld.arrestPlayer`, `workplace.ordinaryJobs`.

| Port | Defined in | Bound by (at its load) | Signature | Unbound |
|---|---|---|---|---|
| `business.advanceResearch` | `business/contract.ts` | end of `business/rd.ts` | `(g, b, year) => void` | no-op |
| `business.heavyArrivals` | `business/contract.ts` | `business/heavy-rd.ts` | `(g, b, year) => void` | no-op |
| `business.advanceHeavy` | `business/contract.ts` | `business/heavy-rd.ts` | `(g, a: Asset or null, b, p: RdProject, year) => { won: boolean; line: string }` | **throws** (the result is used) |
| `business.advanceLab` | `business/contract.ts` | `business/lab-year.ts` | `(g, b, year) => void` | no-op |
| `business.simulateFinance` | `business/contract.ts` | `business/finance-firm.ts` | `(g, b, year, ownerDraw, booked: number or Record<string, number>) => YearResult` (type-only import from `./economy`) | **throws** |
| `special.modelInjuryOdds` | `special/model-base.ts` | `special/model-events.ts` | `(g, s: ModelState, strain) => number` | 0 |
| `special.astronautFlyOn` | `special/astronaut-base.ts` | `special/astronaut.ts` | `(g, destId, launchText, paid) => void` | no-op |
| `computer.stockBetsMenu` | `computer/contract.ts` | `computer/money-stocks.ts` | `() => MenuGroup or null` | null (no row) |
| `underworld.arrestPlayer` | `underworld.ts` | `crime.ts` | `(g, crime, severity) => void` | no-op |

The two throwing fallbacks name the module to load. A caller never learns the owner. Contract files are free of the domain-pair count (`test/layer-kit.ts:254-256`).

### 2.3 Rules and the common checks

- Rules. (a) A move leaves a re-export. (b) A port binds with an arrow or a function declaration at the provider's load, never an eager read of a `const` (`docs/KERNEL.md` section 7). (c) Call order is kept exactly. (d) No raw money call, `g.rng` draw or string moves into a new file. (e) A moved block that reads an import at module load (`const X = IMPORTED`) is named before it moves; the eager baseline of `layers-domains` must not grow. (f) **No `UPDATE_LAYER_BASELINE=rebase` in this track.** If a domain pair count rises, change the cut.
- **C**, after every commit: `npm run typecheck`, then `npx vitest run --maxWorkers=1 test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts test/hub-entry.test.ts test/kernel-acceptance.test.ts test/money-ratchet.test.ts test/cycle-leaves.test.ts test/cycle-seams.test.ts test/cycle-closure.test.ts test/cycle-parity.test.ts`.
- **G**, the proof that nothing changed, at the end of every task: `npx vitest run --maxWorkers=1 test/golden-digest.test.ts test/kernel-parity.test.ts test/life-pins.test.ts test/r2-parity-kit.test.ts test/social-lives-parity.test.ts test/heir-parity.test.ts`. A digest that moves means the task is wrong, never the fixture. The lead also runs `node scripts/golden.mjs check --plan all` (the deep lives) once, after Y8.
- **B**, after the last cut of a task: `UPDATE_ARCH_BASELINE=1 npx vitest run --maxWorkers=1 test/architecture.test.ts` (it only shrinks and throws on a new module); then `UPDATE_LAYER_BASELINE=1 npx vitest run --maxWorkers=1 test/layers.test.ts test/layers-domains.test.ts` only if a count fell. The JSON gets its own commit.
- New test files: `test/cycle-leaves.test.ts` is `// ci: fast`; the others reset modules and run in a shard (no marker, like `hub-entry.test.ts`). `node scripts/ci-shard.mjs --verify 8` stays green.

### 2.4 Consumed from earlier releases (exact names)

`definePort`, `portStatus` (`kernel/ports.ts`, R2-K1); `revalueCompany`, `discloseResearch` (`business/contract.ts`, R2-K5 and R3-F3) and `gameMakingMenu` (`computer/contract.ts`); `readImportGraph`, `cycleComponents`, `compareToBaseline`, `shrinkBaseline`, `splitBaseline`, `cyclePath` (`test/arch-kit.ts`); `layerOf`, `cycleDirEdges` (`test/layer-kit.ts`); `canonicalJson`, `fnv` (`test/golden-kit.ts:122,132`); `findSeed` (`test/seed-kit.ts:108`); `labGame`, `launchBreakthrough`, `noDraw` (`test/lab-kit.ts:17,58,33`); `firm`, `ageBusinessYear` (`test/fund-fixtures.ts:15,45`); `registeredScripts` (`scripts.ts:46`); the leaf-lift precedent R4-P7 (`world/typical-income.ts`, cross-check section on P7). R4 added no cycle: the ratchet still reads 90 modules in 8 cycles at v5.3.0.

**Freeze.** After Y1 merges: the new module paths, the nine port names and every old export path (they stay valid through re-exports). A later change that adds a value import re-closing a cut fails the ratchet at once; its owner fixes the import, nobody edits the baseline up.

## 3. Tasks

Every task: red first (add its rows to `cycle-seams` and `cycle-leaves`, run them, see the module missing), then one commit per cut with explicit pathspecs, C after each commit, then B and G. Y2 and Y3, and Y5, Y6 and Y7, touch disjoint source files and can be built in parallel worktrees; they merge one at a time and B regenerates the baseline after each merge (never merged by hand). The sorted lists in `hub-entry.test.ts` and `kernel-acceptance.test.ts` merge by hand.

### R5-Y1 The oracle first (tests only; nothing moves)

- **Goal.** Record what must not change, green on the head, before any import moves, and install the four files every later task appends to.
- **Needs.** Nothing (cross-check C8; the first draft said every other R5 track). Preflight, run again at the start of every Y task: `test/architecture.test.ts` is green and the baseline still reads 8 cycles, 90 modules (59, 8, 7, 6, 4, 2, 2, 2). If other tracks changed it, stop and tell the lead; the cut list above is then re-derived from the failure text of `test/architecture.test.ts` (it prints the shortest cycle path) and a one-off esbuild script that lists each internal import with its names.
- **Files (create).**
  - `test/cycle-closure.test.ts`: fresh registry, import `aging` then `menus`; `registeredScripts()` (sorted) and `registeredSlices()` must CONTAIN every id of a recorded list (the 544 script ids and 3 slice ids at `1c73b31`, re-measured at Y1, stored as sorted lists with their `fnv(canonicalJson(list))` as a self-check of the recording), and the test prints how many ids are new. It is a superset check on purpose (cross-check C9): the composer's O10 adds the script `tips.answer` and other tracks may add more, so an exact count would fail on a task that did nothing wrong, while a module that silently stops loading still drops a recorded id and fails.
  - `test/cycle-parity.test.ts`: digests recorded once at Y1 and never edited later, of (1) a company with a lab program, a Heavy record (`launchBreakthrough`) and an R&D project, six years of `simulateYear` then `evolve` (the pair at `business/yearly.ts:587-599`), (2) a bank and (3) a fund (`firm`, `ageBusinessYear`), (4) `sweepGroupTreasury` and `treasurySpare` on a two-division group, (5) `earmarkedCash` of a studio with two games in development. Digest = `fnv(canonicalJson({biz, heavy flags, log lines}))`. Seeds from `findSeed(pred)`.
  - `test/cycle-leaves.test.ts` (fast): table `LEAVES: {path, imports[]}[]`, empty. Each row: the file exists in `readImportGraph`, is in no `cycleComponents`, and imports a subset of `imports`. Synthetic-graph self-tests as in `architecture.test.ts`.
  - `test/cycle-seams.test.ts`: tables `MOVED: {name, from, to}[]` (fresh registry, import both, `Object.is`) and `PORTS: {port, defined, boundBy}[]` (`bound` is false after importing `defined`, true after importing `boundBy`; the unbound fallback is exercised). Both empty.
- **Tests.** Four new files, green on the head. No existing test or fixture moves.
- **Size.** 0 source, 240 test. **Model.** Sonnet.

### R5-Y2 Business leaves: `heavy-state` and `product-hash`

- **Goal.** `economy`, `product-market`, `tech-waves` and `rd` read Heavy R&D records from a leaf. Cycle 1 falls from 59 to 56. **Needs.** Y1.
- **Files.**
  - Create `business/heavy-state.ts` and `business/product-hash.ts` (2.1).
  - `heavy-rd.ts`: move lines 40-290 (the comment on :1-8 already calls them "the first half is pure"); the constants at :58-65 go with them, `OWNED` (:67) stays because only `heavyArrivals` (:671) uses it, `heavyEligible` (:313) stays. Add `export { ...every moved export } from './heavy-state'` and import what `heavy-rd` itself still uses (`TIER_LAG`, `addHeavy`, `heavyArrival`, `heavyKey`, `readHeavy`, `writeHeavy`, `MAX_RIVAL`, `HeavyRecord`); drop imports that became unused (`carriedMarketNews`, `Json`, `DemandLevel`, `hashOf`, `mix`).
  - `product-market.ts`: `:16` imports from `./heavy-state`; lines 152-181 move; `export { hashOf, mix } from './product-hash'` plus an import for its own uses (:197, :198, :204, :226, :368, :369, :623, :628).
  - `economy.ts:33` (`heavyPulse`, `readHeavy`) and `tech-waves.ts:33` (`heavyLevel`, `readHeavy`) import from `./heavy-state`.
  - `rd.ts:28`: `advanceHeavy`, `heavyArrivals` stay on `./heavy-rd` until Y4; `heavyOf`, `type HeavyRecord` come from `./heavy-state`.
  - `wave-insider.ts`, `lab-*`, `board-ceo.ts` keep their imports (they are not cycle edges after this cut; checked on the copy).
- **Steps.** Rows into `MOVED` (about 19 names) and `LEAVES` (`product-hash`: none; `heavy-state`: the list in 2.1). Cut 1: `product-hash`. Cut 2: `heavy-state` with the four retargets (one commit). B (59 -> 56). Docs: `docs/ARCHITECTURE.md:92,98,103` (module map) names the two files; the Heavy R&D paragraphs (:527, :967) say the pure readers live in `heavy-state.ts`.
- **Tests.** New rows only, plus a hostile case in `cycle-seams`: `readHeavy` on a flag of the wrong type returns the same frozen empty list through `heavy-rd` and `heavy-state` (the damaged-flag cases of `heavy-handoff.test.ts` already exist). Run with C: `heavy-arrivals heavy-data heavy-engine heavy-handoff heavy-none heavy-project heavy-story heavy-voice effort-heavy products-market rival-rise tech-waves tech-waves-readers tech-waves-writers wave-insider lab-patents lab-story lab-kit research-odds-screens heir-world-flags` (all `test/*.test.ts`). `wave-insider.test.ts:30-47` (three load-order cases) must stay green. The 31 test files that import `heavy-rd` need no edit (re-export). The spies on `productMarket.fieldOf` (`lab-patents:409`, `rival-rise:347`) are unaffected (`fieldOf` does not move). No fixture moves.
- **Size.** 315 source (264 + 31 moved, about 20 import lines), 110 test. **Model.** Sonnet.

### R5-Y3 Four small cuts in `business/`

- **Goal.** Cycle 1 falls from 56 to 31 and the 4-module ring (5) disappears. **Needs.** Y1, and P4 (the moved-test rows of the four spies go in the file P4 creates). It follows Y2 in history; no code depends on it. B7 edits import lines of `business/gamestudio*.ts`, so whichever merges second rebases.
- **Files.**
  - (a) `gamestudio.ts:2013-2021` `earmarkedCash` moves to `gamestudio-state.ts` (it needs only `devGames` and `normalizeStudio`, both there, and the type `Asset`); `gamestudio.ts` re-exports it (`manage.ts:56`, `conglomerate-actions.ts:63`, `conglomerate-management.ts:21` keep importing from `gamestudio`); `board-vote.ts:20` and `group-treasury.ts:9` import from `./gamestudio-state`.
  - (b) `conglomerate-actions.ts:213-217` `movableCash` and `:290-293` `treasuryOf` move to `group-treasury.ts` (which gains `payableCash` from `./board-vote` and drops its `:7` import); `conglomerate-actions.ts` imports and re-exports both and drops `payableCash`, `reserveDollars` from `:19` if now unused. Callers (`conglomerate-menu`, `-management`, `-year`, `board`) stay.
  - (c) `lab-year.ts:17`: `boardAllows` from `./board-vote` (`board.ts:53` only re-exports it).
  - (d) `yearly.ts:23`: `groupRescue`, `prepareGroupManagement`, `yearlyGroups` from `./conglomerate-year`; `inGroup` from `./conglomerate-state`; `:684` `yearlyConglomerates(g)` becomes `yearlyGroups(g)` (the facade's function at `conglomerate.ts:27-29` is exactly that call; its test importers stay).
- **Tests that are edited, with the reason.** The four `boardAllows` spies follow the import: `lab-hints.test.ts:7,506`, `lab-ops.test.ts:5,555`, `lab-patents.test.ts:6,769`, `lab-team.test.ts:5,310` change `import * as board from '../src/game/business/board'` to `.../board-vote`. Assertions, call counts included, are unchanged (87 tests in those files pass on the copy). Rows in `MOVED`: `earmarkedCash`, `movableCash`, `treasuryOf`. Run with C: `board board-exploits conglomerate conglomerate-play conglomerate-review conglomerate-autonomy conglomerate-v2-management studio-engines studio-scale business-expansion dividend-year lab-hints lab-ops lab-patents lab-team`. Record the four edits in R5's `moved-tests.md` (Q6). No fixture moves.
- **Size.** 45 source, 60 test (plus 8 edited lines). **Model.** Sonnet.

### R5-Y4 The research and finance year: five ports (Opus fallback)

- **Goal.** `economy` stops importing its engines and `rd` stops importing `heavy-rd` and `lab-year`. Cycle 1 disappears; 27 modules remain in 6 cycles. **Needs.** Y2, Y3. **Why heavy:** a call order and a load order change, and an unbound port is silent in an isolated test.
- **Files.**
  - `business/contract.ts`: append the five ports (types only: `YearResult` from `./economy`, `RdProject` from `./state`; fallbacks as in 2.2).
  - `economy.ts`: `:20` add `advanceResearch`, `simulateFinance`; `:37` drop `advanceRd`; `:45` import `isFinanceFirm` from `./finance-firm-state` (`finance-firm.ts:14` already re-exports it from there) and nothing from `./finance-firm`; `:828` `simulateFinance(g, b, year, ownerDraw, bookedHomeSales)`; `:913` `advanceResearch(g, b, year)`.
  - `rd.ts`: `:28` and `:33` imports go; `:523` `heavyArrivalsStep(g, b, year)`; `:525` `labYearStep(g, b, year)`; `:541` `heavyProjectStep(g, a, b, p, year)`; last line `advanceResearch.use(advanceRd)`.
  - Binders: `heavy-rd.ts` (end, after `heavyArrivals`) `heavyArrivalsStep.use(heavyArrivals)` and `heavyProjectStep.use(advanceHeavy)`; `lab-year.ts` (end) `labYearStep.use(advanceLab)`; `finance-firm.ts` (end) `financeYearStep.use(simulateFinanceYear)`.
- **Steps.** `PORTS` rows first (red). One commit per port, in this order: `simulateFinance`, `advanceLab`, `advanceHeavy` with `heavyArrivals`, `advanceResearch`; after each, run `cycle-parity` (it digests the chain). Add the five names to `hub-entry.test.ts:72` `EXPECTED_PORTS` and `kernel-acceptance.test.ts:17` `PORTS`; add `HUBS` rows `business/rd`, `business/heavy-rd`, `business/lab-year`, `business/finance-firm`, `business/product-market`, `business/group-treasury` (each loads first in a fresh registry). B (cycle 1 gone). Docs: `docs/KERNEL.md` section 4 table (five rows); `ARCHITECTURE.md:967` "economy.evolve -> advanceRd" says "through the port `business.advanceResearch`".
- **Tests (new, in `cycle-seams`).** For each port:
  - it is bound after its provider loads;
  - unbound it runs its fallback: an `evolve` of a company with an R&D project and a lab program leaves `b.rd` and the lab untouched, and a bank year with `finance-firm` unloaded throws the named message;
  - bound, it gives what the import gave: `evolve` equals the old direct `advanceRd` digest on `labGame` with a Heavy project;
  - idempotence: `advanceLab` through the port twice in a year steps once (the `stepped` stamp, as `lab-ops.test.ts:300`);
  - hostile: a heavy project in `b.rd` resolves exactly once;
  - purity: `noDraw` (`lab-kit.ts:33`) around the arrivals port.
  Run with C: `effort-rd rd-retired rd-tier effort-ops effort-heavy heavy-project lab-kit lab-ops lab-patents bank bank-interest fund fund-events finance-firm company-events company-dashboard growth talent-business franchise ledger-cashwalk`. None needed a side-effect import on the copy; if one does, add it with the reason in the commit message and never change an assertion. No fixture moves.
- **Size.** 60 source, 330 test. **Model.** Sonnet, **Opus fallback** (the only one).

### R5-Y5 `special/model-*`: `model-base` and one port

- **Goal.** Cycle 2 (8) disappears. **Needs.** Y1.
- **Files.**
  - Create `special/model-base.ts` (2.1). `model.ts` moves lines 17-163 except `COUTURE` (:35), `FASHION_CITIES` (:57), `masterModeling` and `marketability` (:155); it imports what it uses and re-exports `AGENCIES`, `RANKS`, `RANK_MULT`, `DESIGNERS`, `PHOTOGRAPHERS`, `looksBar`, `modelJob`, `modelingSkill`, `noteGig`, `viewModel`.
  - Seven imports retarget to `./model-base`: `model-agency.ts:16`, `model-board.ts:27`, `model-core.ts:8`, `model-data.ts:7`, `model-events.ts:21`, `model-exit.ts:24`, `model-state.ts:8` (and `model-sim.ts:13`, not a member, for consistency).
  - `model-board.ts:31` drops `injuryOdds` from `./model-events`; `:626` calls the port `injuryOddsOf` from `./model-base`; `model-events.ts` (after `injuryOdds`, :511-513) binds `injuryOddsOf.use(injuryOdds)`.
- **Tests.** `MOVED` rows (the ten re-exports), a `LEAVES` row, a `PORTS` row. Ports at work: the Rest and Recovery hint (`model-board.ts:621-628`) prints the odds exactly as `injuryOdds` gives them once `model-events` is loaded and prints nothing while it is not. Add `special/model-board` and `special/model-events` to `HUBS`; the port to both lists; B. Run with C: `model-exit model-flow model-math model-state model-voice model-year`. UNVERIFIED: whether `model-voice.test.ts:482` or `model-flow.test.ts:80` ever needs `model-events` loaded (neither did on the copy). No fixture moves.
- **Size.** 170 source (130 moved + imports), 120 test. **Model.** Sonnet.

### R5-Y6 `special/actor-*` and `special/astronaut-*`

- **Goal.** Cycles 3 (7) and 4 (6) disappear. **Needs.** Y1.
- **Files.**
  - Create `special/actor-profile.ts`: `actor.ts:25-157` moves (not `Project`, `ActorJobData`, `Listing`, `project()`); `actor.ts` imports and re-exports `actorJob`, `viewActor`. Retarget `actor-state.ts:8`, `actor-legacy.ts:12`, `actor-menu.ts:13`, `actor-pipeline.ts:15` (its `type Listing` import stays on `./actor`; it is erased). `actor-sim.ts:3` keeps `./actor` (not a member).
  - Create `special/astronaut-base.ts` (2.1). `astronaut.ts` imports and re-exports `agencyOf`, `adata`, `astronautJob`, `researchPoints`, `addResearchPoints`, `SPACE_AGENCIES`, `DESTINATIONS`, `Agency`, `AstroData`, `Destination`, and binds `flyOnMission.use(flyOn)` right after `flyOn` (:624). Retarget `astronaut-events.ts:18`, `astronaut-exits.ts:12`, `astronaut-flight.ts:15` (its one call, :417, becomes `flyOnMission(...)`), `astronaut-world.ts:8`, `astronaut-sim.ts:11`.
- **Tests.** `MOVED` rows (`viewActor`, `actorJob`, nine astronaut names), `LEAVES` rows, one `PORTS` row. Ports at work: the Flight Board launch runs `flyOn` through the port with `paid` true and does nothing while `astronaut.ts` is not loaded. Add `special/actor` and `special/astronaut` to `HUBS`; the port to both lists; B. Run with C: `actor-events actor-legacy actor-menu actor-pipeline actor-state actor-team actor-world astronaut-class astronaut-events astronaut-exits astronaut-flight astronaut-state astronaut-world`. The eager baseline entries for these files (`actor-state.ts: BUDGET_KEYS INDUSTRY_KEYS actorStore`, `astronaut-world.ts: ASTRO_SPEC`) do not move: no moved declaration reads an import at load. No fixture moves.
- **Size.** 310 source (110 + 154 moved, about 46 import lines), 140 test. **Model.** Sonnet.

### R5-Y7 The three pairs

- **Goal.** Cycles 6, 7 and 8 disappear. **Needs.** Y1.
- **Files.**
  - (a) Create `house-value.ts` (2.1). `assets.ts` imports `hauntFactor`, `haunted`, `marketValue`, `nicePrice`, `refreshHouseValue` from it and re-exports `nicePrice` and `refreshHouseValue` (importers: `development.ts:5`, `landlord.ts`). `landlord.ts:6` becomes `seeded` from `./rng` (`rng.ts:105`; `assets.ts` re-exports it since R2 cut 11) and `refreshHouseValue` from `./house-value`.
  - (b) `computer/contract.ts` gains `stockBetsMenuOf`. `money-options.ts:23` imports it; at `:927` the last child pushed to the options menu (`stockBetsMenu()`) is removed from the `nodes.push(...)` list and followed by `const bets = stockBetsMenuOf(); if (bets) nodes.push(bets)`. `money-stocks.ts` (end) binds `stockBetsMenuOf.use(stockBetsMenu)` (:696). A leaf `money-gain.ts` was tried first and rejected: it raised `computer->life` from 20 to 21, because it needs `../gambling` and `money-options` still needs it (rule f).
  - (c) `underworld.ts:5` stops importing `./crime` and defines `arrestOnRaid` (`underworld.arrestPlayer`); `:130` and `:185` call it; `crime.ts` (end) binds `arrestOnRaid.use((g, crime, severity) => arrestPlayer(g, crime, severity))`; `crime.ts:1` imports `arrestOnRaid`, `underworldMenu` from `./underworld`.
- **Tests.** `MOVED` rows, a `LEAVES` row (`house-value`: types only), two `PORTS` rows. Ports at work: `refreshHouseValue` through `assets` and through `house-value` leaves the same asset (digest); the options menu shows the stock-bets row once `money-stocks` is loaded and none before; an underworld raid arrests exactly as before once `crime` is loaded (`test/underworld.test.ts` has no arrest assertion today, so this case is new) and does nothing while it is not. Mocks: `activities.test.ts:2` and `immigration.test.ts:3` mock `crime`; neither loads `underworld` (checked). Add `landlord`, `computer/money-options`, `computer/money-stocks` to `HUBS`; ports to both lists; B. Run with C: `assets landlord crime underworld computer-money talent-investing fog-invest fog-acceptance stocks-real ledger-flows-law`. No fixture moves.
- **Size.** 65 source, 150 test. **Model.** Sonnet.

### R5-Y8 The zero rule and the notes

- **Goal.** The ratchet says "no import cycle", and the notes agree. **Needs.** Y4, Y5, Y6, Y7.
- **Files (modify).**
  - `test/architecture-baseline.json` becomes `{ "v": 1, "components": [] }` by `UPDATE_ARCH_BASELINE=1`, not by hand.
  - `test/architecture.test.ts` (the baseline-file case near the end: `expect(b.components.length).toBeGreaterThan(0)` becomes `toBeGreaterThanOrEqual(0)`; add a case that `cycleComponents` of the real graph is `[]`).
  - `test/layers.test.ts:557-560` (`108` and `18` become `0` and `0`), `:598-601` (`toEqual([])`), `:603-616` (the fusion case runs on a synthetic two-cycle graph, since the real graph has no second cycle).
  - `test/kernel-acceptance.test.ts:117-121` (`toEqual([])`).
  - `docs/KERNEL.md`: section 5 rule (e) and the command notes, section 4 table (nine rows), section 8 rewritten ("The cycle set is empty"). `docs/ARCHITECTURE.md`: the new modules.
  - The lead adds one paragraph to `docs/RELEASE-v5.4.0.md`: 90 modules in 8 cycles became none; 31 imports cut; nine ports; no fixture moved; the bundle difference in gzip bytes.
- **Steps.** Re-run B. Measure the bundle on the same tree before Y1 and after Y8 (`npx vite build --outDir <scratch> --emptyOutDir`, then `node scripts/bundle-budget.mjs --dist <scratch>`). Run C and G; the lead runs `node scripts/golden.mjs check --plan all` and `npx vitest run --maxWorkers=1 test/ci-shard.test.ts`.
- **Tests moved, on purpose.** The five assertions above (they pin counts that are now zero). **Size.** 0 source, 110 test, 150 docs. **Model.** Sonnet.

## 4. Risks

1. **A port is quiet when unbound.** A test that loads `rd` but not `heavy-rd` would skip a Heavy launch. Guards: `hub-entry` proves all 15 ports are bound after `aging` and `menus`; `cycle-parity` digests the chain; the two ports whose result is used throw; the copy needed no side-effect import in about 100 files. If a test does need one, add it with the reason; never change the assertion (`docs/KERNEL.md` section 4).
2. **Spies and mocks follow the import.** Found: four `boardAllows` spies (Y3). Each task starts with `grep -rn "vi.spyOn\|vi.mock" test | grep <module>` for the modules it touches; `crime` is mocked by two tests (Y7, checked).
3. **Load order.** An edge that closed a cycle also made a module load early. `cycle-closure` (544 script ids and 3 slices identical before and after) and the 13 new `HUBS` rows (each module loaded first in a fresh registry, the v4.0.0 failure mode) cover it.
4. **Domain-pair counts.** A move that leaves the old and the new file importing the same layer-3 module raises a count (the money pair did). Run `layers-domains` after every commit; change the cut, never rebase.
5. **Hot files.** `economy.ts` (6 lines), `rd.ts` (8), `heavy-rd.ts` (251 lines move out), `tech-waves.ts` (1), `model.ts`, `actor.ts`, `astronaut.ts`, `assets.ts`, `crime.ts`. The track runs last and re-greps anchors; a conflict is textual (imports and whole-block moves).
6. **Another track re-closes a cut or adds a module to a cycle.** The ratchet fails that track first; Y1's preflight re-measures.
7. **Money ratchet and eager reads.** Moved blocks hold no unreasoned money call and no module-level read of an import (`money-ratchet` and `layers-domains` green on the copy).
8. **Determinism.** The order inside `advanceRd` is kept and no draw moves; `noDraw` cases and G prove it. The deep golden lives are a nightly job; the lead runs them once after Y8.
9. **Bundle.** Measured smaller; the target allows +1,500 gzip bytes.
10. **Docs tests.** `KERNEL.md` and `ARCHITECTURE.md` are read by tests (`kernel-acceptance`, `wave-stocks-story`): no U+2014 or U+2013, and every kernel file keeps its entry line.

## 5. Questions

| # | Question | Default | Who decides |
|---|---|---|---|
| Q1 | Go to zero cycles, or stop after Y4 (business clean) or Y7? | Zero. All eight fall on the copy; Y5 to Y7 are independent and can be dropped one at a time | owner / lead |
| Q2 | R&D year: three ports (`advanceHeavy`, `heavyArrivals`, `advanceLab`) bound by their owners, or one dispatcher module `rd-year.ts` that `rd.ts` cannot import? | Ports: no test import edits, and a test that loads `rd` still finds the binding in `rd.ts`. The dispatcher saves two ports but moves `advanceRd` (about ten test imports change) and needs a side-effect import in `yearly.ts` | lead at Y4 |
| Q3 | `lab-year` imports `boardAllows` from `board-vote` (four spies retarget), or stays on `board` (then `board-ceo -> lab-year` and two more imports must be cut)? | Retarget the spies | lead |
| Q4 | Money pair: port `computer.stockBetsMenu`, or a leaf plus `UPDATE_LAYER_BASELINE=rebase` (+1 `computer->life`)? | Port | lead |
| Q5 | Keep an empty `architecture-baseline.json` and its test, or delete both? | Keep: a new cycle then fails as `new-module`, and only the lead can grow the file | lead |
| Q6 | Where do the moved-test rows go? R5 has no `moved-tests.md` yet when this plan is read | Settled: Y3 and Y8 append under a `Cycles` heading in `docs/superpowers/plans/2026-10-31-r5-v5.4.0/moved-tests.md`, which the lead task P4 creates | R5 lead |

## 6. Plan against code

How the figures were taken: `node` + `esbuild` over every `src/**/*.ts(x)` with the rules of `test/arch-kit.ts:55-105` (static imports; type-only and dynamic imports are not edges) and Tarjan components as `cycleComponents`; edits on the copy; `npx tsc --noEmit -p tsconfig.json` there; `npx vitest run --maxWorkers=1|2 <files>` there; `npx vite build --outDir <scratch>` for both trees.

| Fact | Where | Confirmed with |
|---|---|---|
| 8 components 59, 8, 7, 6, 4, 2, 2, 2 = 90 modules | `test/architecture-baseline.json` | json load; `test/architecture.test.ts` passes (38 tests); the scratch graph (895 modules, 6,081 imports) gives the same sizes |
| Ratchet modes `UPDATE_ARCH_BASELINE=1` and `split`; type-only imports are erased | `test/architecture.test.ts:4-11,88-98`; `arch-kit.ts:55-105` | read |
| Cycle-set ceilings: 90 modules and 8 cycles; 108 modules and 18 edges; the `real[1]`, `real[2]` fusion case | `test/layers.test.ts:557-560,598-616`; `test/kernel-acceptance.test.ts:117-121` | read; with an empty baseline exactly two cases fail (`architecture.test.ts` "sorted, unique" and `layers.test.ts:603`) |
| 6 ports now; `EXPECTED_PORTS` is checked with `toContain`, `PORTS` with `toEqual` | `test/hub-entry.test.ts:72,103`; `test/kernel-acceptance.test.ts:17,70` | read; the copy fails `kernel-acceptance` until the 15 names are listed |
| `definePort` rules: binds once, the same function again is fine | `src/game/kernel/ports.ts:24-45` | read |
| `economy.ts` imports its engines | `economy.ts:33,36,37,45,57`; uses `:292-294,466-472,516,828,913,1581` | grep |
| `YearResult` lives in `economy.ts` | `economy.ts:627` | grep |
| `heavy-rd.ts`: pure first half, project second half | `heavy-rd.ts:1-8,40-290,293-294`; `heavyEligible` :313; `advanceHeavy` :600; `heavyArrivals` :649; `OWNED` :67 used :671; `MAX_RIVAL` :63 used :86, :682 | read |
| 31 test files import `heavy-rd` | `grep -rn "business/heavy-rd'" test` | grep |
| `hashOf`, `mix` and their users | `product-market.ts:152-181`; users :197, :198, :204, :226, :368, :369, :623, :628; other importers `tech-waves.ts:34`, `wave-insider.ts:13` | grep |
| `advanceRd` is the year-end dispatcher | `rd.ts:521-525,541,583` | read |
| `finance-firm` already re-exports the leaf predicate | `finance-firm.ts:11,14,24` | read |
| `earmarkedCash` needs only leaf helpers | `gamestudio.ts:2013-2021`; `devGames` `gamestudio-state.ts:235`; `studioOf` :76 is `normalizeStudio(a.details.studio)` | read |
| `movableCash`, `treasuryOf` need only `board-vote` and types | `conglomerate-actions.ts:213-217,290-293`; `payableCash` `board-vote.ts:106` | read |
| `board.ts` only re-exports `boardAllows` | `board.ts:53`; `board-vote.ts:579` | read |
| `conglomerate.ts` is a 29-line facade; `yearlyConglomerates` = `yearlyGroups` | `conglomerate.ts:11-29`; `conglomerate-year.ts:93,220,375` | read |
| Four spies on `board` | `lab-hints.test.ts:7,506`; `lab-ops.test.ts:5,555`; `lab-patents.test.ts:6,769`; `lab-team.test.ts:5,310` | grep; 87 tests in those four files pass after the retarget |
| Eight model children import the facade; `injuryOdds` wraps `modelCrises.odds` | `model-agency.ts:16`, `-board.ts:27`, `-core.ts:8`, `-data.ts:7`, `-events.ts:21`, `-exit.ts:24`, `-state.ts:8`; `model-events.ts:505,511-513`; hint `model-board.ts:621-628` | grep, read |
| Actor and astronaut shapes | `actor.ts:25-157`; `astronaut.ts:54-100,117-180,473-486,527-552,624` | read |
| The `assets` back edge is one function chain | `landlord.ts:6,137,225`; `assets.ts:85,522-528,672-674,693-713`; `development.ts:5` | read |
| Money pair, and why a leaf fails | `money-options.ts:12,23,259,277,815,927`; `money-stocks.ts:46,696`; `computer->life` 20 -> 21 on the copy | `layers-domains` run |
| Crime pair | `crime.ts:1,385`; `underworld.ts:5,130,185`; importer `modules/yearly-aging.ts:37` | grep |
| The money ratchet counts only calls without a reason | `test/money-ratchet.test.ts:2-20` | read; green on the copy |
| Contract files are free; the new leaves add no pair | `layer-kit.ts:254-272` | read; `layers-baseline.json` byte-identical after B on the copy |
| Scripts registered after `aging` and `menus` | `registeredScripts()` `scripts.ts:46` | 544 before and after; slices 3 and 3; ports 6 -> 15, all bound |
| Bundle | `node scripts/bundle-budget.mjs --dist <scratch>` | original 3,005,319 initial JS (total delta +54,001), copy 3,004,607 (+53,289) |
| `staff.ts`, `dynasty-ownership.ts` are not edited | `staff.ts:13`, `dynasty-ownership.ts:8` import only `economy` | they leave the cycle on the copy with no edit |
| Guards that must stay green | `wave-insider.test.ts:30-47`; `golden-digest`, `kernel-parity`, `life-pins`, `r2-parity-kit`, `social-lives-parity`, `heir-parity` | green on the copy |

## Cross-check amendments (2026-10-31, `00-crosscheck.md` wins over any line above)

1. **Ordering.** Y1 needs nothing; Y3 needs P4; Y8 must merge before the flip N11 so the flip rehearsal and the re-record run on the final code. The track is not "last": it fills the second agent slot while the Bundle chain B1 to B3 holds the other tracks back (cross-check 1.5).
2. **Ports are counted at the merge.** Y4 to Y7 add nine ports to the six that exist. If B7 adds a port (it may use `definePort` for an importer of a lazy career), the final `EXPECTED_PORTS` and `PORTS` lists are 15 plus B7's names, kept sorted; whichever task merges second adds its names, and Y8 asserts the whole list.
3. **Shared JSON.** `test/architecture-baseline.json` and `test/layers-baseline.json` are regenerated after each merge (`UPDATE_ARCH_BASELINE=1`, `UPDATE_LAYER_BASELINE=1` only if a count fell), never merged by hand. B3 and B4 also shrink `layers-baseline.json` (the eager names of the packs); the integrator regenerates after each of them.
4. **Opus.** Y4 is one of four Opus-fallback marks in R5 (B7, N2, O8, Y4); never two Opus sessions at once (cross-check 11).
5. **Wrong-looking edge, checked.** The Paper's `modules/news-desk.ts` imports `business/tech-wave-factors` and `invest/engine`; the desk is imported only by `modules/index.ts`, so it joins no cycle. `test/architecture.test.ts` is the guard.
6. **`cycle-closure` is a superset check** (Y1, see the edited bullet): new scripts from other tracks never fail it; a missing recorded id does.

