# R3 plan, Fog migration track: market, rival, hiring, odds, investing and hint screens read estimates (track `fog-mig`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0` (v5.0.0, main 85e147b) after the Knowledge, Effort core, Quiet years, Frontier and Effort migration tracks have merged; the fog-mig merge is last and serialized after Effort migration (both touch `business/` menus). Code read in `/Users/saeed/projects/anotherlife/wt/r3-release`; nothing was edited except this file. Every "modify" path exists today (line numbers measured at 85e147b); every "create" path does not. Plain hyphens only (no U+2014, no U+2013).

## 1. Track summary

**Items (12 tasks).** H.4 market, rival, hiring and scorecard screens, with confidence chips, "Look closer" rows and illegal intel with risk (R3-G1 to R3-G6). H.6 odds to words plus research (R3-G7, R3-G8). H.8 investing: the gut fence, volatility words, an analyst note, the private valuation as an appraisal range (R3-G9, R3-G10). H.11 the talent rework over the 207 hint sites (R3-G11). R3-G12 closes the track (docs, Realistic-mode walk).

**Not in this track.** `know`, `estimate`, the Estimate type, the Exact/Realistic switch, `setupFiles`, the chip renderer in `MenuList.tsx`, the formatter, the source registry and `buyIntel` (Knowledge, H.1 to H.3, H.13) are consumed. R&D odds (`rd.ts`, `heavy-rd.ts`, `deeptech-*`, `lab-text.ts`, `workshop/*`, the R&D lines of `manage.ts` 489 to 686) stay with Effort migration: they print "Odds 62%: team +9, funding +7, hard field -12" from `quote`. The Annual Report demand band (spec 6.7 step 4, `yearly.ts`), Company Watch and politics polls (H.9), PersonSheet ladders and the trait-after-a-year reveal with claimed-versus-true advisors (H.5, H.7, R4), `rivalSees` and counter-intel (H.10) are other items. Visa odds (`emigrate.ts`) and career interview odds (`careers.ts` 1108, 2058) are published rules and the player's own CV, so they stay numbers.

**Decisions applied (the owner's, not reopened).** Realistic is the default and Exact prints today's text; tests run Exact through `setupFiles`, so every existing assertion holds. In the player's own markets the aggregates stay numbers (size, share, rank, concentration: "published leaderboards" and "size classes" are always known, spec 6.2); what is estimated is what the player cannot see: a rival's quality, technology and product-line quality, the demand and leaders of a country where the company has no presence, forecast profits, a candidate's skill and traits, a stock's swings, a private valuation, a hidden hazard's odds. One predicate, `knownMarket` (R3-G2), holds that line, so widening it to "every country of the industry" is a one-line change (open question 1). Odds are words by default; a percent (nearest 5) shows with the talent or after a read. Illegal sources are allowed; they are a yearly hazard only (no minigame). Hints become honest, fallible estimates through the shared helpers.

**What I measured** (greps on this worktree; the tasks regenerate every count).

| Fact | Value | How |
|---|---|---|
| Hint call sites | 207 `talentHint(` calls in 62 files; 55 `markBest(` calls in 12 files; 50 `hinting(` calls; 74 of the 207 lines carry "about" or "~" | `grep -rn` |
| `conf` already typed | `conf?: 0 \| 1 \| 2 \| 3` is on `MenuBase` (`types.ts:788`) and `MenuInfo` (`types.ts:821`); nothing renders it yet (no `.conf` in `src/ui`) | grep |
| Market screen | `market-menu.ts` 763 lines, `market-view.ts` 531, `competition-menu.ts` 309; no `g.rng` in any builder | read |
| Hidden rival numbers printed | `rivalRows` rows `str` (407, stars of `r.quality`, `r.tech`) and `lines` (409, `productsLine` 388: "Sells: Street Lighting (64)") | read |
| Exact odds at hazards | 9 `pct(` odds sites in `nation/menu.ts` (332, 409, 416, 417, 451, 462, 485, 519, 526, 527); `oddsText` has 17 callers across board, group and career files; `board-vote.ts:586` takes no `g` | grep |
| Foresight | only `invest/instinct.ts` reads next year (`y + 1` at lines 114, 123, 129, 134, 142, 143, 147, 151; `year: g.year + 1` at 201); four files import it (`investments.ts:81`, `business/fund-events.ts:7`, `computer/money-stocks.ts:13`, `computer/money-options.ts:15`); the free analyst tip (`investments.ts:2247`) already reads the year just gone (R0) | grep |
| Layer rule (c) | an import between two layer-3 domains is counted unless its target is a `contract.ts` (`test/layer-kit.ts:254`, any depth); `business->life` is 97 today and may not rise | read |

**Lanes (4; lanes run at once in separate worktrees, tasks in a lane run in order; no task waits on another lane, except G12, which runs after the four lanes have merged).**

| Lane | Tasks | Files it owns |
|---|---|---|
| `main` | G1, G2, G3, G12 | `business/market-menu.ts`, `market-menu-kit.ts`, `competition-menu.ts`, new `business/market-fog.ts` |
| `people` | G5, G11, G4 | `business/staff.ts`, `scorecard.ts`, `silicon-text.ts`, `devices-specs.ts`, `deeptech-bench.ts`, `talents.ts`, `business/util.ts`, `crime.ts` (3 lines), `modules/index.ts`, new `fog/risk/*`, `fog/hint/*` |
| `odds` | G7, G8 | `business/board-vote.ts`, `board-menu.ts`, `nation/menu.ts`, `bank-events.ts`, new `fog/odds/*` |
| `inv` | G9, G10 | `invest/instinct.ts` (comment only), `investments.ts`, `computer/money-stocks.ts`, `dashboard.ts`, `manage.ts` (2 hunks), `conglomerate-menu.ts` (3 hunks), new `invest/*`, `business/valuation-fog.ts` |

Shared files are touched in distinct hunks: `manage.ts` (G7: 1546, 2063; G10: 2070, 2192), `conglomerate-menu.ts` (G7: 147, 257, 776; G10: 172, 674, 702). Each lane that adds a port or a test-list entry does so inside one lane only (`test/hub-entry.test.ts:57` and `test/kernel-acceptance.test.ts:17` are edited by G6 then G11, both in `people`). Each lane makes its own `contract.ts` in its own folder (`fog/odds/contract.ts`, `fog/hint/contract.ts`, `fog/risk/contract.ts`, `invest/contract.ts`) because `contractPath` matches any depth; the lead may fold them into one door after the merge. G12 runs last, after the four lanes have merged.

**Line budget.** About 4,850 source lines against the roadmap's 5,100 (H.4 2,500, H.6 900, H.8 900, H.11 800), about 5,300 test lines, plus `docs/FOG.md` (about 130).

| Task | Item | Lane | Source | Tests |
|---|---|---|---|---|
| R3-G1 | H.4 | main | 480 | 520 |
| R3-G2 | H.4 | main | 520 | 560 |
| R3-G3 | H.4 | main | 380 | 420 |
| R3-G4 | H.4 | people | 430 | 450 |
| R3-G5 | H.4 | people | 300 | 300 |
| R3-G6 | removed | - | 0 | 0 |
| R3-G7 | H.6 | odds | 380 | 400 |
| R3-G8 | H.6 | odds | 420 | 400 |
| R3-G9 | H.8 | inv | 560 | 600 |
| R3-G10 | H.8 | inv | 340 | 360 |
| R3-G11 | H.11 | people | 560 | 620 |
| R3-G12 | all | main | 60 | 200 |
| Total | | | 4,850 | 5,310 |

**Acceptance owned (roadmap R3 block), and what proves it.**

| Criterion | Proven by | Task |
|---|---|---|
| "ranges and a confidence chip with a Look closer row on market, rival and hiring screens" | `test/fog-market-rivals`, `fog-market-regions`, `fog-look-closer`, `fog-hire` | G1 to G4 |
| Same source twice in a year gives the same number, on every screen of this track | each task's "stable" case (menu built twice, then a repeat buy) | G1 to G10 |
| A stated band holds the truth about 80% of 10,000 draws, for each key family I add (`riv:`, `mkt:`, `scn:`, `cand:`, `sec:`, `val:`, `hint:`, odds) | the shared `coverage` case in each task's test | G1, G2, G4, G5, G9, G10, G11 |
| No `g.rng` in any read: menus, hints and estimates leave `JSON.stringify(g)` and `g.rng` unchanged, and the deep-freeze walk finds no write | purity case per task; Realistic walk of the whole tree | G1 to G11, G12 |
| Hints are honest, fallible estimates; Exact prints today's text | `test/fog-hint-lens`, the 98 hint-text files untouched | G11 |
| Intel sources are floored and repeat buys do not average; illegal sources carry real prison and scandal risk | Look-closer repeat buy; `test/fog-intel-risk` | G3, G6 |
| The Investing gut stays the one foresight exception, fenced | `test/gut-fence` | G9 |
| Balance unchanged: fog changes what is shown, so no golden digest, no seeded test and no pinned number moves | goldens run unchanged in G12; `moved-tests.md` gets no row | G12 |

No growth term is added. The one rolled term, the intel hazard, is clamped by `HAZARD_MAX` (ceiling-list row in G6); fines are at most twice what the read cost and at most the cash in hand.

**Order and schedule.** Start G1, G4, G7 and G9 at once (one per lane). Each lane then runs its next task as soon as the previous one is committed. G12 waits for all lanes. At most 3 test-running agents at once on this machine, so the lead staggers lanes if the semaphore queues.

**Lead actions.**
1. Bind the Knowledge placeholders in the task lists (`knowledge:H.1`, `knowledge:H.2`, `knowledge:H.3`) to real task ids, and check the assumed names in section 2 against `knowledge.md`.
2. Merge Knowledge before any lane of this track starts; this track needs `know`, `estimate`, the mode switch, the chip renderer and `lookCloser` in the tree to test against. Merge Effort migration before the fog-mig merge (serialized).
3. At the merge, run `UPDATE_LAYER_BASELINE=rebase` only if rule (c) lists a new pair; the plan adds none (every cross-domain import goes through a `contract.ts`).
4. Add the new test files to `scripts/test-timings.json` at the next timing refresh.

## 2. Contracts

**Consumed (all through `src/game/knowledge/contract.ts`, so rule (c) holds; if Knowledge puts them at a lower layer only the import path changes).** Rows marked "fixed" are named by the lead; "assumed" rows are my reading of the spec and are bound by the cross-check. I touch them in few places: the market lane in `business/market-fog.ts`, the hiring lane in `business/staff-fog.ts`, and so on, so a rename is a one-file edit per lane.

| Name | Signature | Status |
|---|---|---|
| `know` | `(g: GameState, key: string, truth: number) => Estimate` | fixed |
| `estimate` | `(g, key, truth, opts?: { sd0?: number; src?: string; sdMult?: number }) => Estimate`; pure, a hashed draw, never `g.rng`; stable for one (key, year, source) | name fixed, `opts` assumed |
| `Estimate` | `{ lo: number; hi: number; mid: number; conf: 0 \| 1 \| 2 \| 3; words: string }` | fixed |
| `flags.know` | the owner-stamped record; each row keeps `src` and `y` | fixed, row fields assumed |
| `isExact` | `() => boolean` (the one helper that reads Realistic or Exact) | name assumed |
| `setInfoMode` | `(m: 'exact' \| 'realistic') => void`, used by fog tests and restored in `afterAll` | name assumed |
| `fmtRange` | `(e: Estimate, f: (n: number) => string) => string`: "$4.2M" under 6%, "about $4M" under 15%, "$3M to $5M" under 30%, else `e.words` | assumed |
| `lookCloser` | `(g, spec: { id: string; keys: readonly string[]; domain: 'market' \| 'rival' \| 'staff' \| 'odds' \| 'securities' \| 'value' }) => MenuGroup \| null`; null in Exact mode or when no source fits; lists each source with cost and "sharpens +-25% to +-10%", illegal ones flagged with their risk | assumed |
| `knownRows` | `(g) => { key: string; src: string; y: number; paid?: number }[]` | assumed |
| `sourceInfo` | `(src: string) => { illegal: boolean; label: string } \| undefined` | assumed |
| `dropKnow` | `(g, key: string) => void` | assumed |

Asks of other tracks: Knowledge's `estimate` multiplies its sd by `sharpness(g, key, kind)` from `talents.ts` (R3-G11 adds the function and the one-line call in `knowledge/estimate.ts`, the only edit to another track's file); Quiet years' `NoticeOptions` gains `a?: number; w?: LogWeight` and `notice` stamps `s` from the running yearly entry (`quiet.md` line 129); G6 passes `a` (the fine) and `w: 3` with `tone: 'bad'`, so the line stays modal.

**Provided by this track.**

| Provided | By | Used by |
|---|---|---|
| `knownMarket(g, b, countryId, presence?, entered?)`, `rivalStars`, `rivalLine`, `moneyBand`, `shareBand`, `demandRead`, `profitRead` (`business/market-fog.ts`) | G1, G2 | G3, tests |
| `lookFor(g, a, id, keys, domain)` in `business/market-menu-kit.ts` | G3 | market screens |
| `candidateRead`, `vetFee` (`business/staff-fog.ts`) | G4 | `staff.ts` |
| `ScoreFog`, `scoreFog`, `scoreText(row, fmt?, fog?)` (`business/scorecard.ts`) | G5 | silicon, devices |
| `yearlyIntelRisk`, `fogModule` (id `fog.intelRisk`), port `fog.arrest` (`fog/risk/*`) | G6 | `modules/index.ts`, `crime.ts` |
| `oddsWord`, `oddsLine(g, key, p, domain?)` (`fog/odds/contract.ts`); `oddsText(p, g?, key?)` keeps today's text without `g` | G7 | G8, board, nation |
| `swingRead`, `analystNote` (`invest/contract.ts`) | G9 | `investments.ts`, `money-stocks.ts` |
| `valueRead`, `valueText` (`business/valuation-fog.ts`) | G10 | dashboard, manage, group screens |
| port `talents.hintLens`, `sharpness` (`talents.ts`); `lensHint`, `rankNoise` (`fog/hint/contract.ts`) | G11 | `talentHint`, `markBest`, Knowledge |
| `docs/FOG.md` | G12 | all |

Test convention: fog tests flip the mode per file (`setInfoMode('realistic')` in `beforeAll`, restored in `afterAll`) and build lives with `test/market-kit.ts` (`adult`, `company`, `nextYear`, `renderAll`) and `findSeed` from `test/seed-kit.ts` (no new `seed: <digits>` pin). Where Knowledge's coverage helper exists the tests use it; otherwise a local 20-line helper, not a shared file. Every task also keeps its lane's existing tests green in Exact mode and shrinks Knowledge's hidden-key grep guard for the files it migrated (the guard's own update command; the file names go in the commit message).

## 3. Tasks

### R3-G1 Rival profiles read estimates
**Goal.** A rival's quality, technology and product-line quality are estimates with a chip; Exact prints today's text. **Item** H.4. **Lane** main. **Deps** R3-H2, R3-H7.

**Files.** Create `src/game/business/market-fog.ts`, `test/fog-market-rivals.test.ts`. Modify `src/game/business/market-menu.ts`: `info()` at 53 gains an optional fourth argument `conf` (additive); `productsLine` 388 to 394 ("Sells: family (quality)"); `rivalRows` 396 to 449: row `str` (407), row `lines` (409), row `next` (411, prefix "Likely next" gets "(our guess)"). `market-view.ts` stays as it is: `profileOf` (476) keeps the true numbers that `test/market-screen.test.ts:158` and `test/market-review.test.ts:63` read.

**Interfaces.**
```ts
export interface Fogged { text: string; conf?: 0 | 1 | 2 | 3 }          // conf is undefined in Exact mode
export const SD0 = { rivalProduct: 0.30, localMarket: 0.25, forecast: 0.30 } as const
export function rivalStars(g: GameState, b: BizState, r: RivalView, what: 'quality' | 'tech'): Fogged   // key `riv:${r.id}:${what}`
export function rivalLine(g: GameState, b: BizState, rivalId: string, family: string, quality: number): Fogged // key `riv:${rivalId}:line:${family}`
```
Exact mode returns `stars(...)` and `String(quality)` exactly as the code does now.

**Steps.**
1. Red: `test/fog-market-rivals.test.ts` (Realistic): on `setup('software')` style lives, the `str` and `lines` rows of a rival profile contain a range and not the exact quality; the row has `conf` 1 to 3; the menu built twice is equal; `JSON.stringify(g)` and `g.rng` are unchanged; over 200 (seed, rival) pairs the band holds `r.quality` at least 75% (coverage). Exact case: the rows equal `stars(...)` and `Sells: ${family} (${quality})` computed independently. All fail before (rows are exact now).
2. Change: `market-fog.ts` (reads through `estimate` with `sd0 = SD0.rivalProduct`, the Business talent's sharpness applied by Knowledge); the three row edits; the chip goes on the profile rows only, never on list rows (`rivalsMenu` subtitles at 359 to 385 stay).
3. Check: `/Users/saeed/projects/anotherlife/wt/bin/tc`; `/Users/saeed/projects/anotherlife/wt/bin/vt22 test/fog-market-rivals.test.ts test/market-screen.test.ts test/market-review.test.ts test/market-roster.test.ts`.

**Proves.** Rival-screen chip, stable, honest 80% band, pure, Exact parity. **Est.** src 480, tests 520.

### R3-G2 Overview, countries, national markets and scenarios
**Goal.** Markets the player has no foothold in, hidden hazards and forecast profits read as ranges and words; the home market and any country with presence stay numbers. **Item** H.4. **Lane** main. **Deps** R3-G1.

**Files.** Modify `market-fog.ts` (add below). Modify `market-menu.ts`: the antitrust row `biz.mkt.ov.anti` (121 to 129: the percent goes to `e.words` unless Exact or the Business talent); `countryRows` 210 to 222 (rows `size`, `lead`, `champs` for a country where `knownMarket` is false); `localRows` 224 to 234 (rows `size`, `t*`); `scenarioLine` 732 gains an optional `g` (`scenarioLine(r, g?)`) and `scenariosMenu` 744 passes it (profit becomes "roughly +$20M to +$45M", share delta keeps its points). Create `test/fog-market-regions.test.ts`.

**Interfaces.**
```ts
/** True in Exact mode, for the home country, with presence above 0.3, or after an entry. */
export function knownMarket(g: GameState, b: BizState, countryId: string, presence?: number, entered?: boolean): boolean
export function demandRead(g: GameState, b: BizState, countryId: string, truth: number): Fogged   // key `mkt:${b.industry}:${countryId}:size`
export function shareBand(g: GameState, key: string, truth: number): Fogged                        // leaders and champions in unknown markets
export function profitRead(g: GameState, scenarioId: string, truth: number): Fogged               // key `scn:${scenarioId}:value`, sd0 = SD0.forecast
```

**Steps.**
1. Red: Realistic cases: a country with no presence prints "$x to $y" for demand and a range for the leader's share (not `shareText`), while the home country and a country with outlets equal the `countryDetail` numbers; the antitrust row has no "%" unless the player has the Business talent; each scenario row's range holds `r.value` at least 75% of the time over 100 lives; the section stays under 16 rows. Exact case: every row byte-equal to today's builder output. Purity and stability as in G1.
2. Change as listed. `market-view.ts` is not edited: the menu has `d.row.presence` (`CountryRow`, 234) and `d.entered` in hand.
3. Check: `tc`; `vt22 test/fog-market-regions.test.ts test/market-screen.test.ts test/market-moves.test.ts test/market-events.test.ts`.

**Proves.** The "own market exact, elsewhere estimated" rule, honest forecasts (spec 6.5 "forecasts run on estimated inputs"). **Est.** src 520, tests 560.

### R3-G3 Look closer rows on the market screens
**Goal.** Each fogged market screen ends with one "Look closer" row. **Item** H.4. **Lane** main. **Deps** R3-G2, R3-H5.

**Files.** Modify `market-menu-kit.ts` (append `lookFor` after `mAct`, line 51 on). Modify `market-menu.ts`: append one call at the end of `rivalsMenu.children` (359), `rivalRows` (396), the country rows (210, 224) and `scenariosMenu.children` (744). Modify `competition-menu.ts`: `marketMenu.children` (273 to 304) appends the hub row. Create `test/fog-look-closer.test.ts`.

**Interfaces.**
```ts
/** [] in Exact mode; otherwise [lookCloser(g, { id: `biz.mkt.look.${id}.${a.id}`, keys, domain })] when it returns a row. */
export function lookFor(g: GameState, a: Asset, id: string, keys: readonly string[], domain: 'market' | 'rival'): MenuNode[]
```
Keys per screen: rivals list `riv:<id>:quality` for the top 5; one rival `riv:<id>:quality`, `:tech`, `:line:<family>`; a country with `knownMarket` false `mkt:<industry>:<country>:size`; scenarios the top 3 `scn:<id>:value`; the hub the union, first 6.

**Steps.**
1. Red: Realistic: each of the five screens has exactly one row whose id starts `biz.mkt.look.`, last in its list; Exact: none, and the existing "16 rows at most" case still passes; buying the commissioned report (Knowledge's action) narrows the band of a rival read, a second buy of the same source in the same year leaves the text unchanged; an illegal source is listed with its risk line; the home market screen has no row (nothing to look closer at).
2. Change as listed; sections with no fogged key return `[]`.
3. Check: `tc`; `vt22 test/fog-look-closer.test.ts test/market-screen.test.ts test/kernel-menus.test.ts`.

**Proves.** The Look closer row; repeat buys do not average (screen level). **Est.** src 380, tests 420.

### R3-G4 Hiring reads estimates
**Goal.** A shortlist shows skill as a range, hides the trait until the player pays for background checks. **Item** H.4. **Lane** people. **Deps** R3-G11, R3-H4.

**Files.** Create `src/game/business/staff-fog.ts`, `test/fog-hire.test.ts`. Modify `src/game/business/staff.ts`: `interviewAction.run` (198 to 225: the `lines` text at 207 and the choice labels at 209 use `candidateRead`; a `vet` choice sits before `none`, which stays last so `test/market-kit.ts drain` still picks it); the `HIRE` script (122 to 160) handles `vet` (books the fee, opens the same candidates again with `vet: 1` in `data`); `hireMenu.children` (228 to 260) appends the Look closer info row. `staffGroup` (313) keeps the hired person's true skill: you hired them (the trait-after-a-year reveal is H.5, R4).

**Interfaces.**
```ts
export type Vet = 0 | 1
export interface CandidateRead { skill: Fogged; trait: string }   // trait: the label, or 'not clear yet' until vetted
export function candidateRead(g: GameState, b: BizState, assetId: string, role: string, i: number, c: { skill: number; trait: string }, vet: Vet): CandidateRead
export function vetFee(b: BizState, role: RoleDef): number       // 3% of the role's local pay (set by the role, never the cash on hand)
```
Key `cand:${assetId}:${year}:${role}:${i}:skill`; interview sd0 = `SD0.rivalProduct`, `src: 'audit'` after a vet (floor about 8%). Candidate JSON in the popup data is unchanged (true values); only the text changes.

**Steps.**
1. Red: Realistic: after `row.run(g)` (as `test/growth.test.ts:512`) the popup text has "skill about x to y" and "trait not clear yet", not `skill 73/100`; choosing `vet` charges `vetFee` once (`firmCash` reason `inputs`), reopens the popup with the trait named and a narrower range, and the same candidate reads the same range on replay; hiring a candidate still stores the true skill; `none` is the last choice; Exact: lines and labels equal today's. Coverage: the range holds the true skill at least 75% over 300 candidates.
2. Change as listed.
3. Check: `tc`; `vt22 test/fog-hire.test.ts test/growth.test.ts test/talent-business.test.ts`.

**Proves.** The hiring screen's chip, range and Look closer; same source twice same number. **Est.** src 430, tests 450.

### R3-G5 Scorecards: published versus estimated
**Goal.** A scorecard of rivals you cannot read exactly (chips, devices) prints ranges and says "estimated"; published boards (AI benchmarks) stay exact and say "published". **Item** H.4. **Lane** people. **Deps** R3-H2.

**Files.** Modify `business/scorecard.ts` (additive: `ScoreFog`, `scoreFog`, a third optional argument to `scoreText`, line 38; `scoreRow` 22 and `ScoreRow` stay byte-identical because `test/scorecard.test.ts` compares with `toEqual`). Modify `business/silicon-text.ts` (53 to 57: perf and quality use `scoreFog`; price and share rows stay exact, they are your own prices and a published share); `business/devices-specs.ts` (`specSheet` 45 to 82 attaches `fog` to `DeviceSpec`; `specLines` 84 prints it); `business/deeptech-bench.ts` (83: "(modeled)" becomes "(published)" in Realistic). `ai-bench-market.ts` (225, 227) and `charts/ranks.ts` need no edit: a row without `fog` is published. Create `test/fog-scorecard.test.ts`.

**Interfaces.**
```ts
export type ScoreBasis = 'published' | 'estimated'
export interface ScoreFog { basis: ScoreBasis; market: [number, number]; best: [number, number]; rank: [number, number]; conf: 0 | 1 | 2 | 3 }
export function scoreFog(g: GameState, row: ScoreRow, field: readonly number[], keyOf: (i: number) => string): ScoreFog | null  // null in Exact mode
export function scoreText(row: ScoreRow, fmt?: (n: number) => string, fog?: ScoreFog | null): string
```
Realistic line: "Performance 71. Market about 60 to 68, best about 75 to 82, rank 2 to 4 of 9 (estimated)."

**Steps.** 1. Red: the new test fails before (no ranges); `test/scorecard.test.ts` untouched and green; silicon and devices lines are ranges in Realistic and equal today's in Exact; the AI board line is unchanged apart from "published"; the band holds the true market mean at least 75% over 100 lives. 2. Change as listed. 3. Check: `tc`; `vt22 test/fog-scorecard.test.ts test/scorecard.test.ts test/silicon-rivals.test.ts test/ai-bench-market.test.ts`.

**Proves.** Spec 6.7 step 3 ("modeled" becomes "published" versus "estimated"). **Est.** src 300, tests 300.

### R3-G6 (REMOVED by the cross-check)

The illegal-intel yearly hazard is Knowledge's: R3-H4 owns the sources, the heat record, `hazardOf`, `settleHazard` (stream tag `intel.risk`, a `CrimeRecord` of Corporate Espionage, wanted level, notoriety, karma and a bad-tone notice; the existing yearly crime step then arrests) and R3-H5 runs it in the yearly step. Nothing is left for this track: no `fog/risk/*`, no `fog.intelRisk` module, no `fog.arrest` port, no `flags['fog.risk']`, no `HAZARD_MAX`, no edit to `crime.ts`, no turned-source outcome (it would break the 80% band; `00-crosscheck.md` decision 19). The Look closer rows (R3-G3, R3-G8, R3-G9, R3-G10) list the illegal sources through `lookCloser`, which flags them and carries the confirm text.

### R3-G7 Odds to words: policy and board votes
**Goal.** One odds helper: words by default, a percent (nearest 5, fallible) with the talent or after a read, today's text in Exact. The board and group votes use it. **Item** H.6. **Lane** odds. **Deps** R3-H3, R3-E8.

**Files.** Create `src/game/fog/odds/odds.ts`, `fog/odds/contract.ts`, `test/fog-odds.test.ts`. Modify `business/board-vote.ts` (`oddsText` at 586 becomes `oddsText(p, g?, key?)`; without `g` it prints today's text, so the 17 callers compile unchanged); `business/board-menu.ts` (80, 88, 100, 224 pass `g` and a key `odds:board:<kind>:<assetId>`; the Look closer row "Sound out the board" at the end of the board menu); `business/manage.ts` (1546, 2063: pass `g`); `business/conglomerate-menu.ts` (147, 257, 776).

**Interfaces.**
```ts
export type OddsWord = 'almost no chance' | 'a long shot' | 'unlikely' | 'even money' | 'likely' | 'very likely' | 'almost certain'
export function oddsWord(p: number): OddsWord
/** Exact: today's "about 85%". Realistic: oddsWord(mid); "about 65%" (nearest 5, from estimate(g, key, p).mid) when hasTalent(g, domain) or a read for `key` exists in flags.know. */
export function oddsLine(g: GameState, key: string, p: number, domain?: string): string
```

**Steps.** 1. Red: Realistic without the talent: a board-vote hint shows a word; with the Business talent a multiple of 5 within the band; after a bought read the percent shows for that key only; the same call twice is equal; Exact equals `about ${Math.round(p*100)}%` as today; `oddsText(p)` without `g` unchanged. 2. Change as listed. 3. Check: `tc`; `vt22 test/fog-odds.test.ts test/board.test.ts test/board-exploits.test.ts test/talent-business.test.ts`.

**Proves.** Board and deal odds to words plus a research read (spec 6.7 step 5, minus R&D). **Est.** src 380, tests 400.

### R3-G8 Odds at hazards: politics and the bank
**Goal.** The odds the player cannot know move to `oddsLine`. **Item** H.6. **Lane** odds. **Deps** R3-G7, R3-H5.

**Files.** Modify `nation/menu.ts` (332 cabinet, 409 coup, 416 and 417 charge, evidence and exposure, 451 and 462 and 485 scheme `caught`, 519 regime, 526 and 527 jail and exile); `business/bank-events.ts` (436 "chance they recover"); the nation menu gains a Look closer row ("Commission a risk briefing"). Create `test/fog-odds-sites.test.ts`.

**Steps.** 1. Red: Realistic: the nine nation rows print words, never `pct(...)`, unless the talent or a read; the evidence and exposure rows keep "evidence" as a word; Exact equals today's strings (compare to the builder run with the mode on Exact before the edit, recorded in the test as literals). 2. Change as listed; keys `odds:nation:<id>`, `odds:bank:<id>`. 3. Check: `tc`; `vt22 test/fog-odds-sites.test.ts test/nation.test.ts test/nation-balance.test.ts`.

**Proves.** Schemes and deals to words. **Est.** src 420, tests 400.

### R3-G9 Investing: the gut fence, swings in words, an analyst note
**Goal.** The Investing gut is fenced and tested; stock swings read as words with a chip; a Look closer analyst note sharpens them. **Item** H.8. **Lane** inv. **Deps** R3-H5, R3-H7.

**Files.** Create `src/game/invest/swing.ts`, `src/game/invest/contract.ts`, `test/fog-invest.test.ts`, `test/gut-fence.test.ts`. Modify `computer/money-stocks.ts` (`targetAction` 654 to 665 takes `g`; line 661 "swings ~X% a year" becomes a word, or a range after a note); `investments.ts` (`offerNode` 1843 on: one new row `inv-oswing-<secId>` with a chip and the Look closer group, for stocks, pennies and coins only; `riskText` 184 stays); `invest/instinct.ts` (comment block only: the fence rules and the allow-list, no logic).

**Interfaces.**
```ts
export function swingRead(g: GameState, secId: string, vol: number): Fogged          // key `sec:${secId}:vol`, words steady / choppy / wild / extreme
export function analystNote(g: GameState, secId: string): string | null               // present and past only; null in Exact mode
```
`test/gut-fence.test.ts`: (a) the files importing `invest/instinct` are exactly the four above; (b) a token scan finds no call of `exchangeYear`, `goldYear`, `cryptoYear` or `fxYear` with a `year + 1` argument outside `invest/instinct.ts`; (c) `marketInstinct` is null for 20 lives without the Investing talent; (d) `analystNote` and the free news tip (through the Financial News menu, `newsLines` at `investments.ts:2139`) make no engine call for a year past `g.year` (a `vi.mock` spy on `invest/engine`).

**Steps.** 1. Red: Realistic: the stock-bet subtitle shows a word, not `~18%`; after an analyst note it shows a range holding the true `vol` at least 75% of the time; a repeat buy is the same text; the fence cases above (the scan fails on a planted fixture); Exact subtitles equal today's. 2. Change as listed. 3. Check: `tc`; `vt22 test/fog-invest.test.ts test/gut-fence.test.ts test/talent-investing.test.ts test/investments.test.ts`.

**Proves.** "The Investing gut stays the one foresight exception, fenced"; volatility words and research. **Est.** src 560, tests 600.

### R3-G10 A private valuation is an appraisal range
**Goal.** A private company's valuation reads as a range until it is appraised; a listed company's market cap stays exact. **Item** H.8. **Lane** inv. **Deps** R3-G9.

**Files.** Create `src/game/business/valuation-fog.ts`, `test/fog-valuation.test.ts`. Modify `business/dashboard.ts` (151), `business/manage.ts` (2070 the sale header; 2192 the Company Details row, with "(your stake ...)" as a band times the share), `business/conglomerate-menu.ts` (172, 674, 702). Net worth and asset rows stay exact: own books (spec 6.2).

**Interfaces.**
```ts
export function valueRead(g: GameState, a: Asset, b: BizState): Fogged   // key `val:${a.id}`, sd0 0.20; b.public is exact (a posted quote)
export function valueText(g: GameState, a: Asset, b: BizState, label?: string): string
```
Look closer (`domain: 'value'`): an appraisal (analyst source, floor 8%) and an audit (3%).

**Steps.** 1. Red: a private firm prints "about $4M to $5M" with a chip; a public one prints the market cap; after an appraisal the range narrows and a repeat buy is equal; the band holds `b.valuation` at least 75%; Exact equals `money(b.valuation)`; selling still uses the true valuation (offers are quotes). 2. Change as listed. 3. Check: `tc`; `vt22 test/fog-valuation.test.ts test/growth.test.ts test/talent-business.test.ts`.

**Proves.** Private valuation as an appraisal range (spec 6.7 step 10). **Est.** src 340, tests 360.

### R3-G11 The talent rework: honest, fallible hints through the helpers
**Goal.** No hint site changes: `talentHint`, `markBest` and the estimate sharpness do the work. **Item** H.11. **Lane** people. **Deps** R3-G5, R3-H3.

**Files.** Create `src/game/fog/hint/lens.ts`, `fog/hint/contract.ts`, `test/fog-hint-lens.test.ts`. Modify `src/game/talents.ts`: `talentHint` (187) calls the new L0 port `hintLens` (`definePort('talents.hintLens', (_g, _id, text) => text)`), and `sharpness(g, key, kind: 'passive' | 'source'): number` (0.6 and 0.8 on the talent's domain keys; Main Character every key; Business `mkt:`, `riv:`, `cand:`, `val:`, `scn:`; Investing `sec:`, `fund:`, `val:`; Acting and Modeling `cast:`, `peer:`); `business/util.ts` `markBest` (139); `knowledge/estimate.ts` (one line: `sd *= sharpness(g, key, kind)`); `modules/index.ts` (one import of `../fog/hint/lens` for its effect: the lens binds its port at load, the way `aging.ts` and `menus.ts` import the index for the effect); `test/hub-entry.test.ts` (`EXPECTED_PORTS` 57 and a `HUBS` row for `src/game/fog/hint/lens.ts`) and `test/kernel-acceptance.test.ts` (`PORTS` 17): add `talents.hintLens`.

**Interfaces.**
```ts
export const hintLens: Port<[g: GameState, id: string, text: string], string>   // talents.ts, bound by fog/hint/lens.ts
export function lensHint(g: GameState, id: string, text: string): string
export function rankNoise(g: GameState, key: string, v: number): number          // the noised value markBest ranks by
```
Lens rule: in Realistic only, a number that follows "about", "roughly", "around" or "~" (a money amount in the current currency symbol, a percent, or "in about N years") is replaced by `estimate(g, 'hint:' + id + ':' + fnv(maskedText) + ':' + i, value, { src: 'talent' }).mid`, in the same shape (same unit suffix, same number of significant digits, percents to the nearest 5); a limit written without "about" (a pay cap, a board limit, a year, a horizon "over 5 years") is left alone. `markBest` ranks by `rankNoise` (sd 0.15 times sharpness), so a close call can flip; its margin text goes through the lens. The Investing gut keeps its own noise (`instinct.ts`).

**Steps.** 1. Red: Exact output of 40 sampled hint strings equals the input; Realistic: an "about $412K" becomes a nearby round amount, "about 62%" a multiple of 5, "2031", "over 5 years", a limit without "about" and a quoted "(62% odds" from Effort's `quote` untouched, a currency with a suffix symbol (and a letters symbol) keeps its shape; same text, same year, same output; a new year changes it; over 10,000 keys the shown number is within 1.28 sd of the truth 78% to 82%; no `g.rng`; `markBest` flips the winner in a seeded tie within noise and never invents an option; `cleanHint` length cap holds; the port is bound after `aging` and `menus` load; the 98 hint-text files (Exact) stay green. 2. Change as listed. 3. Check: `tc`; `vt22 test/fog-hint-lens.test.ts test/talent-business.test.ts test/talent-investing.test.ts test/talents-core.test.ts test/main-character-hints.test.ts test/lab-hints.test.ts test/hub-entry.test.ts test/kernel-acceptance.test.ts`.

**Proves.** "Hints that are honest, fallible estimates" through the helpers (the 207 sites are untouched). **Est.** src 560, tests 620.

### R3-G12 Track close: docs and the Realistic walk
**Goal.** One page for the next author, and proof the whole track holds together. **Lane** main (last). **Deps** R3-G3, R3-G4, R3-G8, R3-G10, R3-M11, R3-Q13, R3-F7, R3-H6, R3-E10.

**Files.** Create `docs/FOG.md` (what is fogged and what is not, the `knownMarket` rule, keys and sd0 classes, how to add a screen, the hazard, the lens rule), `test/fog-acceptance.test.ts`. Create `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` only if a pinned number moved (none is expected).

**Steps.** 1. Red-first cases: with the mode Realistic, `fuzzBusiness(industry, seed, log, years)` from `test/fuzz-kit.ts` for three industries, and `renderAll(deepFreeze(g), log)` after a hire and a purchase of each source kind on a Business and Investing talent life (`adult()` in `test/market-kit.ts`); no throw, no NaN, no `g.rng` change from any menu, hint or popup text; every screen of this track has its chip or Look closer row in Realistic and none in Exact; the whole voice guard (`test/voice-guards.test.ts`) and the em-dash cap pass. 2. The goldens run unchanged, never updated: `test/golden-digest.test.ts`, `test/kernel-parity.test.ts`, `test/replay-purity.test.ts`, `test/old-saves.test.ts`; no row in `moved-tests.md`. 3. Check: `tc`; `vt22 test/fog-acceptance.test.ts test/golden-digest.test.ts test/kernel-parity.test.ts test/replay-purity.test.ts test/old-saves.test.ts test/voice-guards.test.ts` (a few at a time).

**Est.** src 60, tests 200, docs 130.

## 4. Open questions

1. "Exact numbers for the player's own industry's markets": this plan keeps market aggregates exact (size, share, rank, concentration) in every market the company sells in and estimates rival internals everywhere. If the owner meant every country of the industry, `knownMarket` returns true more often (one function); if the owner meant rival stars too, G1 becomes a no-op for the rival rows.
2. Hints that name the best option at a site (most of the 207) still use the real optimiser; only `markBest` rankings and the numbers after "about" are fallible. Making the optimiser itself run on estimated inputs is planner work in R4 or later.
3. The Annual Report demand band (spec 6.7 step 4) is in no R3 item and `yearly.ts` belongs to Effort migration; someone must own it.
4. The hazard (G6) assumes Knowledge owns the source definitions, the price and `flags.know` rows with `src`, `y` and `paid`; if Knowledge also ships a hazard, G6 shrinks to the port and the consequences.
5. Net worth stays exact (own books), so a player can infer a private valuation from it. Accepted for R3; hiding it needs a net-worth range everywhere.
6. Segments place rivals by hidden quality (`segOfTier`, `market-view.ts:132`); that placement is left exact.

---

## Cross-check amendments (2026-10-22)

These override the text above. Numbered decisions are in `00-crosscheck.md` section 6. The track now has 11 tasks (R3-G6 is removed) and lanes `main` (G1, G2, G3, G12), `people` (G5, G11, G4), `odds` (G7, G8), `inv` (G9, G10).

- **F-A Names bound to Knowledge (D22).** The assumed names map to the Knowledge contract (`src/game/knowledge/contract.ts`):

| This plan assumed | Knowledge provides |
|---|---|
| `isExact()` | `isExact()` (`knowledge/mode.ts`, re-exported) |
| `setInfoMode(m)` in tests | not usable (the suite override beats it): `withInfoMode(m, fn)` or `inFog(fn)` from `test/knowledge-kit.ts` |
| `estimate(g, key, truth, { sd0, src, sdMult })` | `know(g, key, truth, opts?)` where `opts = { unit?, exp?, ladder?, scale? }`; `sd0` comes from the rule table by key, the source from the stored row; no `sd0`, `src` or `sdMult` option |
| `Estimate { lo, hi, mid, conf, words }` | the same, plus `sd`, `y`, `src`, `exact`, `asOf?` |
| `fmtRange(e, f)` | none: `Estimate.words` is already formatted (money through `shortMoney`/`formatMoney`); a score range (stars) is formatted by market-fog from `lo` and `hi` |
| `lookCloser(g, { id, keys, domain })` | `lookCloser(g, { id, keys })`; no `domain`; providers follow from the key kinds |
| `knownRows(g)`, `sourceInfo(src)`, `dropKnow(g, key)` | not needed: the hazard is Knowledge's (decision 19); `storedEstimates(g)` exists if a screen wants the rows |
| the vet read | `takeReading(g, 'diligence', key, truth)` (R3-H4 amendment B2), fee booked by the caller |
| research reveals | `registerKeyKind({ ..., revealedBy })`; `applyReveals` is Knowledge's (R3-H5 amendment B3) |

- **F-B Key families (D20).** Keys follow `<kind>:<id>[:<id>]:<field>`, at most 64 characters: `riv:<rivalId>:quality`, `riv:<rivalId>:tech`, `riv:<rivalId>:<family>:line`, `mkt:<industry>:<country>:size` and `:share`, `scn:<scenarioId>:value` (unit `delta`, `scale` = the company's revenue), `cand:<hash>:skill` (hash of asset, year, role, index), `cmp:<rowId>:score`, `sec:<secId>:vol`, `val:<assetId>:value`, `odds:<id>:<kind>:p`, `hint:<hash>:<n>` (unit from `opts`). The rule rows exist in R3-H2 (amendment B1). Each task registers a `KeyKind` for every family it adds, at module load of its own file (`market-fog.ts`, `staff-fog.ts`, `scorecard.ts`, `valuation-fog.ts`, `invest/swing.ts`, `fog/odds/odds.ts`): `{ kind, label, truth(g, key), scope?, revealedBy? }`. Without a `truth` provider `lookCloser` returns null and no purchase works; the Look closer tests of R3-G3, G8, G9, G10 fail for that reason.
- **F-C R3-G2 scope (D27).** The owner's rule is "exact numbers for the player's own industry's markets". `knownMarket(g, b, countryId)` is true in Exact mode and for every country of the company's own industry (size, share, rank, concentration, demand, leaders). Fog applies to: rival internals (R3-G1), the antitrust percent (words), scenario forecasts (`scn`), any market of another industry that a screen shows, and the other tasks. The task shrinks by about 150 source lines. `presence` and `entered` arguments are dropped from the predicate.
- **F-D R3-G3.** `lookFor(g, a, id, keys)` without `domain`, using `lookCloser(g, { id, keys })`.
- **F-E R3-G4.** The vet choice: fee `vetFee(b, role)` (3% of the role's local pay) books through the company ledger (`firmCash`, reason `inputs`); the read is `takeReading(g, 'diligence', key, truth)`; Knowledge's own `diligence` price (the `ddCost` rule, at least 8,000 times country wealth) is not used for a hire. Depends on R3-H4 for `takeReading`, and runs after R3-G11 in the `people` lane.
- **F-F R3-G5 and R3-G11 (D23).** G5 keys are `cmp:<rowId>:score` (rule row `cmp.score`). G11 does NOT add `sharpness()` to `talents.ts` and does NOT edit `knowledge/estimate.ts`: Knowledge's rule table already sharpens by talent (x0.6 passive, x0.8 source, Main Character every key). G11 adds the port `talents.hintLens` (the only port of this track: add it to `EXPECTED_PORTS` in `test/hub-entry.test.ts` and `PORTS` in `test/kernel-acceptance.test.ts`), `fog/hint/lens.ts`, `fog/hint/contract.ts` (`lensHint`, `rankNoise` through `know` with `hint:` keys) and the `markBest` call. G11 runs after G5 in the `people` lane.
- **F-G R3-G7 (D8, D25).** Rename Fog's `oddsLine(g, key, p, domain?)` to `oddsRead(g, key, p, domain?)`: Effort's research odds line is also called `oddsLine`, and `manage.ts` would import both. G7 binds the realistic reveal policy with `bindRevealPolicy` (from `src/game/effort/hooks.ts`) at load of `fog/odds/odds.ts`: `exact: false`; `band(p)` is `oddsWord(p)`, or "about N%" (nearest 5) with the Business talent or a stored read of the key; `knows(term)` is true for the player's own terms (team, funding, crew, tools, know, tired, bold, ceo) and for hard, rival and spill only with the talent or a stored read. Exact mode returns `EXACT_POLICY`. Depends on R3-E8 for `oddsLine` to test against.
- **F-H R3-G9 (D24).** Drop `test/gut-fence.test.ts` and the comment block in `invest/instinct.ts`: `foresight-scan.test.ts` pins the gate at line 177 of that file and R3-H9 owns the fence and the importer list. R3-G9 keeps a spy case in `fog-invest.test.ts` (`analystNote` and the swing reads ask the engine for no year after `g.year`). `analystNote` is the Knowledge `analyst` source read for `sec:<id>:vol` through `lookCloser`; no second source list.
- **F-I R3-G10.** Key `val:<assetId>:value`, sd0 from the table (.30); the Look closer offers `analyst` and `diligence` (Knowledge's sources for `val`). Private only; a public company's quote stays exact.
- **F-J R3-G12.** The sweep also runs `test/quiet-acceptance.test.ts`, `test/year-close.test.ts`, `test/hub-entry.test.ts`, `test/kernel-acceptance.test.ts`, `test/golden-digest.test.ts` and `test/kernel-parity.test.ts` on the merged tree, and walks the Realistic mode over a life with every track on (`renderAll(deepFreeze(g))`). It depends on every other track's last task (R3-M11, R3-Q13, R3-F7, R3-H6, R3-E10).
- **F-K Deferred (D26).** The Annual Report demand band (spec 6.7 step 4) is in no R3 item. It waits for R4 with `yearly.ts`; `docs/FOG.md` lists it under "not fogged yet".
- **F-L Hot files.** `modules/index.ts` gets one import for effect (`../fog/hint/lens`) and no module. `manage.ts` and `conglomerate-menu.ts` are edited by G7 (odds) and G10 (inv) in distinct hunks, and by Effort migration in others: merge order effort-mig then fog-mig.
