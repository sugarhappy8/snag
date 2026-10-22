# R3 cross-check of the six track plans (Effort core, Knowledge, Quiet years, Frontier, Effort migration, Fog migration)

Read: the six plans in this folder, the roadmap's R3 block (`docs/superpowers/plans/2026-10-20-living-world-roadmap.md` lines 214 to 242) and its decision table (lines 1096 to 1131), the audit files `C-research-invention.md` and `H-information-model.md`, `docs/KERNEL.md`, the R2 cross-check (format precedent), and the code in the worktree at v5.0.0 (85e147b). Nothing under `src/` or `test/` was edited. The six plans got a banner, a few inline fixes and a closing section "Cross-check amendments"; this folder also got `moved-tests.md`. All text uses plain hyphens (no U+2014, no U+2013).

Where this file and a plan disagree, this file wins. The decisions are numbered D1 to D40 in section 6; the amendments in the plans cite them.

Merge order into `release/v5.1.0`: effort-core, knowledge, quiet, frontier, effort-mig, fog-mig (as fixed by the lead). Work order is looser: 13 tasks have no dependency and start at once (section 1.3). Effort migration's merge is serialized before Fog migration's because both edit `business/` menus.

## 1. The task graph

62 tasks in 6 tracks (the planners' 63 minus the removed R3-G6): effort-core 10, knowledge 9, quiet 13, frontier 7, effort-mig 12, fog-mig 11. Every track has a lane named `main` and at most 4 lanes. Every task is at or under about 1,100 source lines (the largest after the amendments: R3-H2 about 890, R3-H4 about 860, R3-Q12 about 830, R3-H5 about 770). Within a lane, tasks run in the order of section 1.1, and each is a dependency of the next, so no worktree ever has two tasks at once. A dependency on another lane or track means that task's head is merged into this lane's worktree before the task starts. The graph is acyclic (checked by script: no cycle, every dependency id exists, longest chain 9 tasks).

### 1.1 Lanes

| Track | Lane | Tasks in order | Source lines |
|---|---|---|---|
| effort-core | main | E1, E2, E3 | 1,440 |
| effort-core | kit | E7, E9, E10 | 640 |
| effort-core | why | E8 | 340 |
| effort-core | you | E4, E5, E6 | 1,490 |
| knowledge | main | H1, H2, H3, H4, H5, H6 | 3,310 |
| knowledge | fence | H9 | 0 |
| knowledge | tips | H8 | 230 |
| knowledge | ui | H7 | 170 |
| quiet | main | Q1, Q2, Q3, Q4, Q5, Q13 | 2,200 |
| quiet | pace | Q8, Q9, Q10 | 740 |
| quiet | ui | Q6, Q7, Q11 | 830 |
| quiet | var | Q12 | 830 |
| frontier | main | F1, F2, F7 | 870 |
| frontier | race | F5 | 70 |
| frontier | terms | F6 | 130 |
| frontier | waves | F3, F4 | 280 |
| effort-mig | main | M0, M1, M2, M7, M11 | 1,510 |
| effort-mig | dt | M5, M6 | 620 |
| effort-mig | ops | M3, M4, M10 | 780 |
| effort-mig | ws | M8, M9 | 1,040 |
| fog-mig | main | G1, G2, G3, G12 | 1,440 |
| fog-mig | inv | G9, G10 | 880 |
| fog-mig | odds | G7, G8 | 880 |
| fog-mig | people | G5, G11, G4 | 1,210 |

Totals: effort-core 3,910, knowledge 3,710, quiet 4,600, frontier 1,350, effort-mig 3,950, fog-mig 4,410 (source lines, kits and guards included; the roadmap budgets 24,700 for the six; the tests are about 1.1 times the source).

### 1.2 Tasks, lanes and dependencies

**Effort core (effort-core.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-E1 | main | Contract seed: types, limits, task builder, know-how map, effort hooks, layer row | - | 420 |
| R3-E2 | main | Pure curves and world terms | E1 | 370 |
| R3-E3 | main | Factors and quote(g, task, input) with crew drive and labelled reasons | E2, E4 | 650 |
| R3-E4 | you | Persona record flags[effort.you]: ambition, posture, staff drive, burnedOut | E1 | 420 |
| R3-E5 | you | resolve, landQuality, step and the fx record (calls the reveal sink hook) | E2, E4 | 500 |
| R3-E6 | you | Focus weeks pool, yearly settle and burnout, posture rows, four counter sites, Profile row | E4, E5 | 570 |
| R3-E7 | kit | Purity kit: trapRng, frozenGame, u-trap (parity harness moved to R3-M0) | - | 150 |
| R3-E8 | why | Why lines, cause and payoff lines, reveal-policy reader | E1 | 340 |
| R3-E9 | kit | Conservation, purity, 200-year max-input probe, ceiling rows | E3, E5, E6, E7, E8 | 400 |
| R3-E10 | kit | Barrel, docs/EFFORT.md, parity re-record, effort sweep | E9 | 90 |

**Knowledge (knowledge.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-H1 | main | Information mode, Settings card, Exact through setupFiles | - | 300 |
| R3-H2 | main | Estimate core: rule table, units (incl. delta), words, know and estimate | H1 | 890 |
| R3-H3 | main | flags.know record: owner-stamped, bounded, validated | H2 | 360 |
| R3-H4 | main | Sources, prices, buyIntel, takeReading, illegal heat hazard | H3 | 860 |
| R3-H5 | main | Look closer, Briefing hub, standing orders, module, reveal sink | H4, E1 | 770 |
| R3-H6 | main | Acceptance sweep, probes, docs/KNOWLEDGE.md | H5 | 130 |
| R3-H7 | ui | Confidence chip and asOf in MenuList | - | 170 |
| R3-H8 | tips | Market signals and one hedged analyst market-read line | - | 230 |
| R3-H9 | fence | Foresight fence for knowledge and the Investing gut | - | 0 |

**Quiet years (quiet.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-Q1 | main | s, a, w on log and notice, set by aging; save repair | - | 330 |
| R3-Q2 | main | The 120-title notice weight table | Q1 | 260 |
| R3-Q3 | main | Pure year planner (hubs/year-plan.ts) | Q2 | 700 |
| R3-Q4 | main | closeYear, year book, pending asks, yearCard flag, store wiring | Q3 | 720 |
| R3-Q5 | main | Store-flow harness and quiet acceptance (hard caps) | Q4 | 150 |
| R3-Q6 | ui | Year card UI (popup and inline) | - | 420 |
| R3-Q7 | ui | Collapsed life log | Q6 | 220 |
| R3-Q8 | pace | Pace core and event library families | - | 330 |
| R3-Q9 | pace | Wealth ask families | Q8 | 230 |
| R3-Q10 | pace | Company event families, career kit family, year ledger | Q9 | 180 |
| R3-Q11 | ui | Rewrite the 127 culture lines to 110 characters | Q7 | 190 |
| R3-Q12 | var | Variants for the top 60 events | - | 830 |
| R3-Q13 | main | Integration after lanes merge: numeric popup and repetition targets, docs/QUIET.md | Q5, Q7, Q10, Q11, Q12 | 40 |

**Frontier (frontier.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-F1 | main | Frontier shard, fields, one writer, stream row | - | 570 |
| R3-F2 | main | Yearly step, rival follows, registry line | F1 | 190 |
| R3-F3 | waves | Effort wave source and discloseResearch port | - | 130 |
| R3-F4 | waves | Waves and rival landings push the frontier | F3, F1 | 150 |
| R3-F5 | race | Workshop future-race deadline as a frontier crossing | F1 | 70 |
| R3-F6 | terms | Frontier odds terms and words | F1 | 130 |
| R3-F7 | main | Acceptance: 200-year probe, 100x ceilings, old saves, docs | F2, F4, F5, F6 | 110 |

**Effort migration (effort-mig.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-M0 | main | Parity oracle and kit recorded on unmodified v5.0.0 | - | 400 |
| R3-M1 | main | Business research seam, BizState.knowHow, RdProject.fx, frontier terms, launchP split | M0, E3, E5, F6 | 280 |
| R3-M2 | main | Product R&D on quote and step | M1, E8 | 440 |
| R3-M3 | ops | Heavy R&D on quote and step | M1, E8 | 230 |
| R3-M4 | ops | Operations R&D and research team on quote and step | M1, M3 | 330 |
| R3-M5 | dt | Deep tech on quote and step (pace stays the calibration) | M1, E8 | 380 |
| R3-M6 | dt | AI capability tracks on quote and step | M5 | 240 |
| R3-M7 | main | Studio engines on quote and step | M2 | 250 |
| R3-M8 | ws | Workshop buildOdds and brainstormOdds on quote and step | M0, E3, E5, E8 | 360 |
| R3-M9 | ws | Workshop engine inputs: focus weeks, tools, bench assistant, why row | M8, E6 | 680 |
| R3-M10 | ops | Top hired CEO bounded research benefit (steady CEO term) | M1, M4 | 220 |
| R3-M11 | main | Sweep: parity completeness, 200-year probe, 100x, no-draw, why surfaces | M2, M4, M6, M7, M9, M10 | 140 |

**Fog migration (fog-mig.md)**

| Id | Lane | Title | Depends on | Source |
|---|---|---|---|---|
| R3-G1 | main | Rival profiles read estimates (riv keys) | H2, H7 | 480 |
| R3-G2 | main | Overview, countries, national markets, scenarios (mkt, scn keys) | G1 | 520 |
| R3-G3 | main | Look closer rows on the market screens | G2, H5 | 380 |
| R3-G4 | people | Hiring reads estimates, vet choice, Look closer | G11, H4 | 430 |
| R3-G5 | people | Scorecards: published versus estimated | H2 | 300 |
| R3-G7 | odds | Odds to words policy, board votes, binds the reveal policy hook | H3, E8 | 460 |
| R3-G8 | odds | Odds at hazards: politics and the bank | G7, H5 | 420 |
| R3-G9 | inv | Investing: swings in words, analyst note, chip | H5, H7 | 540 |
| R3-G10 | inv | Private valuation as an appraisal range | G9 | 340 |
| R3-G11 | people | Talent rework through helpers: hintLens port and rankNoise | G5, H3 | 480 |
| R3-G12 | main | Track close and R3 integration sweep | G3, G4, G8, G10, M11, Q13, F7, H6, E10 | 60 |

Tasks are listed by id; dependencies are written without the `R3-` prefix. A dependency on a task of another track is a real code or test need, named in section 2.

### 1.3 Waves (longest dependency chain to each task)

| Wave | Tasks that can start when the previous waves are merged |
|---|---|
| 1 | E1, E7, F1, F3, H1, H7, H8, H9, M0, Q1, Q6, Q8, Q12 |
| 2 | E2, E4, E8, F2, F4, F5, F6, H2, Q2, Q7, Q9 |
| 3 | E3, E5, F7, G1, G5, H3, Q3, Q10, Q11 |
| 4 | E6, G2, G7, G11, H4, M1, M8, Q4 |
| 5 | E9, G4, H5, M2, M3, M5, M9, Q5 |
| 6 | E10, G3, G8, G9, H6, M4, M6, M7, Q13 |
| 7 | G10, M10 |
| 8 | M11 |
| 9 | G12 |

Wave 1 is 13 tasks at once: E1, E7, F1, F3, H1, H7, H8, H9, M0, Q1, Q6, Q8, Q12. The machine runs at most 3 test-running agents at a time (`vt22` queues the rest), so the lead staggers them by track priority: Effort core E1 first (it gates 27 tasks), then M0 (it must see unmodified code), then the rest. Critical path: E1, E2, E3, M1, M3, M4, M10, M11, G12. E1 gates 27 tasks, H2 gates 15 (every Fog read), F1 gates 15, and the Knowledge main lane (H1 to H5) gates the Fog look-closer tasks (G3, G8, G9).

### 1.4 Cross-track edges (why each exists)

| Edge | Why |
|---|---|
| H5 -> E1 | Knowledge binds `bindRevealed` from `effort/hooks.ts` (created in E1): the reveal sink (D8) |
| M1 -> E3, E5 | `quote` and `step` are the engine every migrated system calls |
| M1 -> F6 | `frontierTerms` feeds the `spill` and `rival` inputs of company research (D37) |
| M2, M3, M5, M8 -> E8 | results lines use `oddsLine`, `causeLine`, `payoffLine` |
| M8 -> E3, E5 | the Workshop quotes the player (`who: you`); it does not need the business seam M1 |
| M9 -> E6 | `spendFocus`, `focusLeft`, the pool and burnout |
| G1, G5 -> H2 | `know` and `estimate` with the rule table; G1 also needs H7 for the `asOf` type |
| G11 -> H3 | the `hint:` rows are stored rows |
| G4 -> H4 | `takeReading` (the vet read) and the `diligence` source |
| G3, G8, G9 -> H5 | `lookCloser` and the Briefing; G9 also needs H7 (chip) |
| G7 -> H3, E8 | stored reads decide when a percent shows; `oddsLine` and the policy hooks are Effort core's |
| G12 -> M11, Q13, F7, H6, E10 | the last task of the last-merging track closes R3: it runs the cross-track checks on the merged tree |

Everything else that looks like a dependency in the plans (Frontier on Effort core, Quiet on anything, Fog on Effort migration) is a merge-order or hot-file matter, not a code dependency, and is handled by order (section 3), not by edges.

## 2. Contracts after reconciliation

### 2.1 Effort core and Effort migration (the big mismatch)

The migration plan was written against an assumed interface (`effort/contract.ts`, `EffortTask.calib`, `EffortInputs` with an `EntityRef` owner, `startRecord`, `whyText`). The core plan fixed another one (`effort/index.ts`, a flat `Task`, `EffortInput` with `who`, `newFx`, `oddsLine`). The core's is the one that exists in the lead's fixed names (`quote(g, task, input)`, `step`, `flags['effort.you']`), so the migration adapts. The mapping table is in the "Cross-check amendments" of `effort-mig.md` (M-A); the rules:

- `effort/` is layer 2 (`WORLD_DIRS` in `test/layer-kit.ts`, a one-word edit by E1). Domains import it downward through `src/game/effort/index.ts`; there is no `contract.ts` (a contract is only needed between two layer-3 domains).
- The calibration is the flat `Task` (`p0`, `oddsExp`, `yearsExp`, `minYears`, `maxYears`, `oddsLo`, `oddsHi`, `quality {up, down, exp, ceiling, room, lo, hi}`), so "at default `quote` returns exactly today's numbers" is a property of one function, tested by E3 for the product shape and by the oracle for the other six.
- `Quote` carries `years`, `quality` and `spend` as well as `p` and `reasons`. `reasons` sum to `round(p*100) - round(base*100)`.
- The company's know-how map is `BizState.knowHow` (M1), passed by reference as `StepCtx.know`; the person's is in `flags['effort.you']` (`fieldK`). Field keys: `ops.<track>`, `dt.<trade>`, `dt.aiLab.cap.<cap>`, `studio.engine`, a product family, a Workshop category (pattern `/^[a-z][a-zA-Z0-9.]{0,39}$/`, widened for camel-case trades).
- `Task.knowYears` (default 0) lets know-how shorten a task that has no odds (the studio engine only).
- `Worker` output uses drive and fatigue (E3 amendment A5); the neutral worker is the old formula.

### 2.2 Hooks instead of ports (D8)

Two seams cross a track boundary and a layer: the research reveal (Effort -> Knowledge) and the reveal policy (Effort -> Fog). Both are `effort/hooks.ts` (created in E1): `bindRevealed(fn)` / `revealedSink(g, reveals)` and `bindRevealPolicy(fn)` / `revealPolicyOf(g)`. They are not kernel ports because `test/hub-entry.test.ts` fails when a defined port is unbound after the real entry points, and the binders merge after Effort core. Knowledge binds the sink in `knowledge/module.ts` (`applyReveals`); Fog binds the policy in `fog/odds/odds.ts`. Ports added in R3: `business.discloseResearch` (F3) and `talents.hintLens` (G11), each defined and bound inside one track.

### 2.3 Knowledge and Fog

Fog's assumed names are bound in `fog-mig.md` (F-A). The rules: Fog imports only `knowledge/contract.ts` (B8: it re-exports the mode helpers, `registerKeyKind`, `takeReading`, `storedEstimates`); the rule table in `knowledge/keys.ts` is the only source of `sd0` and drift (Fog has no `SD0` object); Fog registers a `KeyKind` with a `truth` provider for every key family it adds, because `buyIntel` and `lookCloser` need it; Fog tests flip the mode with `withInfoMode`/`inFog`.

Key families (all `<kind>:<id>[:<id>]:<field>`, at most 64 characters; a longer natural id is hashed):

| Family | Key | Unit | Rule row | Owner of the `KeyKind` | Sources that read it |
|---|---|---|---|---|---|
| rival quality, tech | `riv:<rivalId>:quality`, `:tech` | score | `riv.quality`, `riv.tech` | G1 | press, report, analyst, investigator, informant, hacker, lab |
| rival line quality | `riv:<rivalId>:<family>:line` | score | `riv.line` | G1 | same |
| market size, share | `mkt:<industry>:<country>:size`, `:share` | money, pct | `mkt.size`, `mkt.share` | G2 | press, report, analyst, informant, lab |
| scenario forecast | `scn:<scenarioId>:value` | delta | `scn.value` | G2 | press, report, analyst |
| candidate skill | `cand:<hash>:skill` | score | `cand.skill` | G4 | diligence (takeReading), investigator, hacker |
| scorecard rows | `cmp:<rowId>:score` | score | `cmp.score` | G5 | press, report, analyst |
| odds | `odds:<id>:<kind>:p` | odds | `odds.p` | G7, G8 | report, analyst |
| stock swings | `sec:<secId>:vol` | pct | `sec.vol` | G9 | press, analyst |
| private valuation | `val:<assetId>:value` | money | `val.value` | G10 | analyst, diligence, hacker |
| hint numbers | `hint:<hash>:<n>` | opts | `hint.*` | G11 | none (honest talent noise only) |

### 2.4 Frontier and Effort

`quote` takes the optional numeric inputs `spill` and `rival` (odds points) and prints them with the labels "public research" and "rival pressure" (`TERM_LABEL`). The term caps are 18 and 8 (`SPILL_TERM_MAX`, `RIVAL_PTS`); the Frontier pool is capped at 18 and one disclosure adds at most 6. Only M1 calls `frontierTerms` in R3. `FRONTIER_REASONS` and `TERM_LABEL` carry the same two strings, checked by literals in F6 and by equality in M11.

### 2.5 Quiet

`GROUP_OF_SOURCE` and its UI copy gain `effort.you` (work), `knowledge.core` (money), `world.frontier` (world). The source stamp of a module entry is the module id.

### 2.6 Renames made to avoid a collision

| Was | Now | Why |
|---|---|---|
| Effort `readKnow`, `knowOf`, `learnKnow`, `fadeKnow`, `KNOW_FIELDS`, `effort/know.ts` | `readKnowHow`, `knowHowOf`, `learnKnowHow`, `fadeKnowHow`, `KNOW_HOW_FIELDS`, `effort/knowhow.ts` | Knowledge exports `readKnow` and owns `flags.know` |
| Company map `BizState.know` | `BizState.knowHow` | same |
| Fog `oddsLine(g, key, p, domain?)` | `oddsRead(g, key, p, domain?)` | Effort's research line is `oddsLine(q, policy?)`; `manage.ts` imports both |
| Effort port `effort.reveal` | hook `bindRevealPolicy` / `revealPolicyOf` | D8 |
| Effort migration `EffortTask`, `EffortInputs`, `EffortRecord`, `startRecord`, `readFx`, `whyText`, `causeWords` | `Task`, `EffortInput`, `Fx`, `newFx`, `normalizeFx`, `oddsLine`, `causeLine` | the core's names |
| Fog `knownRows`, `sourceInfo`, `dropKnow`, `fmtRange`, `sharpness` | none | the hazard, the format and the sharpening are Knowledge's |


## 3. Hot files: tasks that can run at the same time

"Distinct hunks" means different functions or regions of one file; the merge is textual, never semantic.

| File | Tasks (track) | Resolution |
|---|---|---|
| `src/game/modules/index.ts` | E6 (effort), H5 (knowledge), F2 (frontier), G11 (fog, one import for effect) | one line each. `effort.you` and `knowledge.core` sort before the `...MENU_MODULES` spread, `world.frontier` after `factsModule`. Textual conflicts only: keep all, sorted by id |
| `test/hub-entry.test.ts` (`HUBS`, `EXPECTED_PORTS`), `test/kernel-acceptance.test.ts` (`PORTS`) | E6, H5, F2, F3, G11 | one entry each; the lists are sorted. Only two ports are added in R3 (F3, G11) |
| `src/game/world-flags.ts` `PERSONAL` | E4 `effort.you`, H3 `know`, Q4 `yearBook` and `pendingAsks` | same array, alphabetical; keep all |
| `test/ceiling-list.json`, `test/ceiling-kit.ts`, `test/ceiling-probe.test.ts` | E9 (8), H4 (3), F7 (2), M9 (2), M10 (1) | appended at distinct anchors; ids unique; keep all |
| `test/stream-tap.ts`, `test/stream-isolation.test.ts` | F1 `frontier`, H4 `intel.risk`, M7 `effort.risk` | one row and one driver each; F1 owns the `frontier` row (D37) |
| `test/fixtures/kernel-parity.json`, `golden-digests.json`, `r2-parity.json` | E6, E10, H5, F2, Q1, Q8 to Q10, Q12, M-lanes | never merged by hand; regenerated at each track merge (section 4) |
| `src/game/types.ts` | Q1 (483 to 527), H7 (788, 821) | distinct hunks |
| `src/game/investments.ts` | H8 (84, 2203), G9 (`offerNode`) | distinct hunks; nobody edits `invest/instinct.ts` (gate pinned at line 177, D24) |
| `src/game/business/manage.ts` | M2 (484 to 496), M3 (569 to 584), G7 (1546, 2063), G10 (2070, 2192) | distinct hunks; merge effort-mig then fog-mig |
| `src/game/business/conglomerate-menu.ts` | G7 (147, 257, 776), G10 (172, 674, 702) | distinct hunks, both fog; G7 merges first (147 and 172 are 25 lines apart) |
| `src/game/business/state.ts` | M1 (`BizState.knowHow`, `RdProject.fx`), M2 (extras) | M1 now owns every shared field so M2 and M3 (different lanes) build on it |
| `src/game/workshop/market.ts`, `menu.ts` | F5 (`market.ts` 64 to 68, `menu.ts` 130), M8 and M9 (`menu.ts` 91, 229, `build.ts`, `state.ts`, `yearly.ts`, `effort.ts`) | distinct hunks; effort-mig rebases onto F5's five-line `raceYear` hunk |
| `src/game/business/tech-waves.ts`, `contract.ts` | F3, F4 | same lane |
| `src/game/events.ts` | Q8 (70, 234 to 273), Q12 (37) | distinct hunks, two lanes of one track |
| `src/game/flags.ts`, `test/flags.test.ts` | Q4 only | |
| `src/game/kernel/reasons.ts`, `charts/books.ts`, `test/ledger.test.ts` | H4 only (reason `intel`, 63 to 64) | no other track adds a reason |
| `docs/WORLD.md`, `KERNEL.md`, `STREAMS.md`, `SAVE.md`, `LEDGER.md` | F1, F2, F7; Q4, Q13; H4 | additive sections |
| `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` | every track | exists; one heading per track, so rows land in different hunks |
| `scripts/test-timings.json` | the lead | after merge |

Conflicts found in the plans and removed by this cross-check:

1. Frontier F1 calls the named stream `frontier` but F2 added its stream-tap row, so F1 would fail `stream-isolation` alone. The row moved to F1.
2. Fog G9 edited a comment block in `invest/instinct.ts`; `foresight-scan.test.ts` pins `GATE_LINE = 177`. The edit is dropped.
3. Effort migration M2 and M3 (different lanes) both needed `RdProject.fx` in `business/state.ts`, and nobody owned `BizState.knowHow`. M1 owns both.
4. Knowledge H4 and Fog G6 both built the illegal-intel yearly hazard (two streams, two flag records, two crime writers). Knowledge's stays; G6 is removed.
5. Fog G11 edited `knowledge/estimate.ts` and added `sharpness()`; Knowledge H2 already sharpens by talent. Dropped.
6. Effort core would have added `g.yearActions['focus.weeks']`; `yearActions` is inside the golden `character` slice. Weeks go into the existing per-key counters.
7. Two ports defined in Effort core with binders in later tracks would fail `hub-entry`. They became hooks.
8. Fog and Knowledge both owned a gut-fence test (`gut-fence.test.ts`, `knowledge-fence.test.ts`). H9 owns it.

## 4. Fixtures and the re-record protocol

Fixtures that hash state: `test/fixtures/kernel-parity.json` (recorder: `RECORD_KERNEL_PARITY=1`), `golden-digests.json` (`node scripts/golden.mjs update --reason`), `r2-parity.json` (`R2_PARITY_RECORD=update`), `effort-parity.json` (M0 only). Floats are cut to 9 significant digits; every recording runs under `/Users/saeed/projects/anotherlife/wt/bin/vt22` (Node 22.23.3); golden updates run through `node /Users/saeed/projects/anotherlife/wt/bin/slot.mjs heavy -- node scripts/golden.mjs ...` with `PATH=$HOME/.local/node22/bin:$PATH`.

1. A task that moves a fixture re-records it on its own track branch, with the reason in the commit and a row in `moved-tests.md`, so the branch stays green. That recording is provisional.
2. Nobody merges a fixture file by hand. When a track merges into `release/v5.1.0`, the integrator takes the release side of each fixture, runs `golden.mjs check` (to read which slices or hooks moved), confirms they are the ones the track is allowed to move, then re-records from the merged tree and commits it as part of the merge with the reason `merge of <track>`.
3. Allowed moves: effort-core: `kernel-parity` (aging list gains `effort.you`, Life Priorities rows). knowledge: `kernel-parity` (close-phase hook, `assets.money` order 45). quiet: `golden` text slice (Q1, Q12), every golden slice, `r2-parity` and `kernel-parity` (Q8 to Q10 move event picks). frontier: `kernel-parity` (aging list gains `world.frontier`); golden only if a golden life crosses 2026 with a deep-tech company. effort-mig: golden `assets` slice only if a golden life's company flopped an R&D project and banked know-how. fog-mig: none (Fog changes what is shown; tests run Exact).
4. `effort-parity.json` is recorded once by M0 on the unmodified code and is never re-recorded unless a decision here says so; its header names the HEAD it was recorded on.
5. After the last merge the lead runs the full CI once; this cross-check and the plans never run the full suite.

## 5. Acceptance ownership (roadmap lines 214 to 242, the lead's list, the decision table)

Each line has one primary owner (the task whose test fails if it breaks). Supporting tasks prove a half or guard a neighbour.

| Roadmap line | Primary owner | Supporting |
|---|---|---|
| Parity grid within 1 point: Product, Heavy, Ops, deep tech, AI caps, studio, workshop | M11 (fixture complete, seven systems, each within `TOL`) | M0 (oracle on unmodified code), M2 to M8 (one system each), E3 (product shape), M10 (`topCeoSlack`) |
| 200-year probe at maximum inputs: no field above frontier plus headroom, `k` at most 4, knowledge at most 100, no money beyond the market | M11 (cross-system direct-step probe, ledger clean) | E9 (engine half), F7 (frontier half: lead 12, pool 18, rows, waves, race deadline) |
| Same source twice in a year returns the same number | H6 | H4, H5; every Fog task has a "stable" case |
| A stated band holds the truth about 80% of 10,000 draws | H6 | H2 (unit level); Fog coverage cases (75% floor at 100 to 300 samples) in G1, G2, G4, G5, G9, G10, G11 |
| No `g.rng` in any read (the `deepFreeze` fuzz walk) | G12 (whole tree, Realistic, every track on) | E9, H6, F1/F5/F6 tests, Q3, each Fog task |
| `quote` never reads `u` | E9 | E3 |
| Popups a year: ordinary p90 3, max 5; $50M p90 4, max 6; tycoon mean 4 plus one "Your companies" card | Q13 | Q5 (hard caps), G12 (re-run with all tracks) |
| A tycoon's visible log lines from 12.5 to 8; the digest at most 8 lines | Q13 (real tycoon life) for the log; Q3 for the 8-line digest | Q7 |
| Every culture line at most 110 characters | Q11 | |
| Repeated lines at most 5% (8% rich); same line within 10 years 0; any line at most 3 times | Q13 (D32) | Q8 to Q10, Q12 |
| Probe: ambition widens variance, never adds a free edge (concave, at most plus 25%) | E9 (D10) | E2, E6 |
| Probe: failed research banks at most 15 odds points | E5 (`step`) | E9 (long run), M2 to M8 (per system) |
| Probe: spillover at most 6 points a disclosure, one wave per origin, 2 waves a year | F7 | F1 (6 points, one row per origin), F3 and F4 (waves) |
| Probe: intel sources floored (press 20%, report 12%, analyst 8%, audit 3%), repeat buys do not average | H4 | H6 |
| Player sees: "Odds 62%: team +9, funding +7, hard field -12, tired -4" on research | M11 (every migrated screen) | E8 (the line), M2 to M9 |
| Player sees: posture and burnout | E6 | E9 |
| Player sees: ambition from 18 | E4 (the reveal) | E6 (Profile row) |
| Player sees: ranges and a chip with a Look closer row on market and rival screens | G3 | G1, G2, H5, H7 |
| Player sees: the same on the hiring screen | G4 | H4 |
| Player sees: an Intelligence Briefing hub | H5 | H6 |
| Player sees: Settings, Realistic or Exact | H1 | |
| Player sees: hints that are honest, fallible estimates | G11 | G12 |
| Player sees: one year card | Q4 (queue, flag, store) | Q6 (UI), Q13 |
| Risk: 207 hint sites, change the helpers not the sites | G11 | |
| Risk: fog frustration, words by default and research pays visibly | E8 (payoff and cause lines) | M2 to M9, the Fog tasks |
| CI: golden parity per migrated system; `setupFiles` Exact; fog tests flip per file | M2 to M8 (parity), H1 (`setupFiles`), each Fog task | M11 |
| State +8,000 nodes: `know` 120 keys, `fx` records, frontier | H6 (know), M11 (fx), F7 (frontier) | |
| Old saves load (`test/old-saves.test.ts`), new fields optional, validated, bounded | G12 (merged tree) | every task that adds a saved field |
| Money booked once through the ledger; engine moves no money; no unreasoned call | E9 (conservation) | M11, H6 (fees), F7 (frontier books none) |
| Exit gate: acceptance green; a 3-life human playthrough | the lead (no task) | |


## 6. Decisions

These answer every open question of the six plans, consistently with the owner's R3 decisions in the task text, and fix the conflicts of section 3. They override the plans.

### Process

**D1. Graph and lanes.** The 62-task graph of section 1 is the plan. Lanes are as listed; a task never shares a worktree with a task it does not depend on.

**D2. Merge and re-record.** Section 4. Nobody merges a state fixture by hand.

**D3. `moved-tests.md`.** Created by this cross-check with a heading per track and per Effort migration lane. Implementers add the real rows; the "Expected" lists are the plans' predictions.

**D4. The `yearCard` flag.** Accepted as a ninth key (`{ default: false, ships: '5.1.0' }`). It is the project's own mechanism: the release rule test fails unless the lead flips the default and the version together, so it cannot be forgotten. R3-Q4 edits the header comment of `flags.ts` and the moved row for `test/flags.test.ts:88`. With Quiet Mode on by default, `ageUpAction` would otherwise change every store test at once. The lead's release commit flips it and runs `store`, `quiet-routing`, `year-integration`, `year-close-store` with the card on.

### Effort

**D5. Door and names.** `effort/` is layer 2, imported through `src/game/effort/index.ts`; no `contract.ts`. The migration plan adopts the core's names (section 2.1, `effort-mig.md` M-A). This answers the migration's questions 1 (Quote carries years, quality, spend), 2 (the calibration is the flat `Task`), 3 (door), 5 (owner: `who: you` and the map by reference), 6 (`Fx`, `newFx`, `normalizeFx`), 7 (`oddsLine`, `causeLine`, `payoffLine`), 12 (task ids) and 13 (posture, D11).

**D6. Know-how names.** `readKnowHow`, `knowHowOf`, `learnKnowHow`, `fadeKnowHow`, `KNOW_HOW_FIELDS`; the company map is `BizState.knowHow`. Knowledge keeps `readKnow`, `learn`, `KNOW_FLAG`. In R3 only a failed project banks know-how, at most 15 odds points (`KNOW_ODDS_MAX`); a win banks none (for the player it adds to the persona shift). `knowGain` and `Task.learn` belong to the study and practice modes (R6) and are unused by the migrated systems.

**D7. One oracle.** `test/fixtures/effort-parity.json`, recorded by R3-M0 on unmodified code, with the whole harness in `test/effort-parity-kit.ts`. R3-E7 shrinks to the purity kit (trapRng, frozenGame, uTrap, roundSig). The grid states set willpower and discipline to 55 (ambition 50) through `neutralAmbition(g)`.

**D8. Reveals.** `step` returns `reveals` and calls the sink hook once per project, never on a replay. Knowledge binds the sink (`applyReveals`: a stored estimate whose key kind lists the researched field in `revealedBy` gets a `lab` reading, honest and stable like any source). Fog binds the reveal policy (Realistic: words, "about N%" with the talent or a stored read, unknown terms hidden; Exact: `EXACT_POLICY`). Neither is a kernel port (section 2.2). This answers core question 2 and the C.11 item "research reveals knowledge".

**D9. Spill and rival terms.** `quote` takes public research up to 18 odds points and rival pressure up to 8; one disclosure adds at most 6 to the pool (the roadmap probe). Labels: "public research", "rival pressure" (Frontier's constants, equal by test).

**D10. Ambition.** Built as the core planned: `rho` linear in ambition, hard-capped at 1.25, paid for by the fatigue push builds. A strictly concave curve through "50 steady = 1" and a cap of 1.25 would have to be linear, so the roadmap's "concave, at most plus 25%" is delivered as the cap plus the fatigue and burnout cost, proven by E9 (speed never above 1.25 over 200 years of push; a 10-year push at ambition under 50 ends below steady). `rhoOf` is the one function to change if the owner wants a curve. The Profile shows ambition as a word from 18; the number in Exact mode is Knowledge's helper later (core question 8).

**D11. Posture scope.** Posture and ambition apply to the player's own work: the Workshop and an owner-run company. A hired-CEO or NPC firm is `steady`, ambition 50, fatigue 0 (a board mandate does not set a posture: push with nobody to tire is a free edge). Deep tech keeps its pace as the calibration; `quote` gets posture `steady` there so odds and years stay exact, and the pace's strain goes into the program's `fx.fatigue`.

**D12. `Quote.risk` and `payrollX`.** Reported, not rolled or booked, in R3. The two exceptions: studio setbacks under push (R3-M7, one draw from `outcomeStream(g, 'effort.risk', ...)`, only when push, so no seeded run changes) and the Workshop kaboom (the engine's explosion risk adds to `buildOdds().kaboom` only for a bold plan, no new draw). `docs/EFFORT.md` lists them as reserved. This answers core question 3.

**D13. Know-how and years.** Only the studio engine, which has no odds, sets `Task.knowYears` (.15). Every other task gets no speed from know-how, so "failed research banks at most 15 odds points" stays the whole rule. This answers migration question 9.

**D14. Crew and drive.** E3 amendment A5: a worker's output includes `(.9 + .2*drive/100)` and the fatigue factor; neutral workers are the old formula. Staff traits (`staffDrive`) therefore matter without a free edge (plus or minus 10% at the extremes).

**D15. J.8.** Ramp from 90 to 100, at most 3 odds points, delivered as one labelled `baseTerms` entry "steady CEO" (key `ceo`), no money, no `strategicIncome`. The owner's decision D28 asks for "a real, bounded benefit"; the removed rule fired only at exactly 100, and a 90-rated manager is the letter's "elite". `TOL.topCeoSlack = 3` is the one declared exception to parity. This answers migration question 10.

**D16. Focus weeks.** One pool of 12 weeks derived from `g.yearActions` (reset every age-up, so the six test resets need no helper: migration question 4). `spendFocus(g, key, fullWeeks, weeks)` adds weeks to the key's existing counter, so no new `yearActions` key (golden `character` slice) and the four existing sites are byte for byte. Weeks 13 to 24 cost fatigue, week 25 is refused; the 4th Study Harder runs at half value (the moved test). The Workshop adds a hard backstop of 2 builds past its limit (migration question 11); if `workshop-balance` drifts, tune the overtime cost, never the band.

**D17. AI market.** `modelRating` is not touched in R3 (its grid stays in the oracle as a guard). `capBest`, the board and `benchHard` keep their calendar drift; `frontierLead(g, 'ai')` is stored and unread. Lifting them is R4+ (48 uses, 8 files, keyed by `fam`). This answers migration question 8 and Frontier question 2.

**D18. Product shape.** `softCeil` with `room` 0 is a hard clamp, so the product task reproduces `clamp(..., 5, 97)` exactly.

### Knowledge and Fog

**D19. One hazard.** Illegal-intel risk is Knowledge's (R3-H4 heat record, `hazardOf`, `settleHazard`, stream `intel.risk`; R3-H5 runs it): a `CrimeRecord`, wanted level, notoriety, karma and a bad-tone notice, then the existing crime step arrests. That is "real prison and scandal risk" as a yearly hazard, no minigame. Fog's R3-G6 (second hazard, `fog.intelRisk`, `fog.arrest`, `HAZARD_MAX`, turned source) is removed. No false data from a source (Knowledge question 3: it breaks the stated 80% band).

**D20. Key shapes and rule rows.** Section 2.3. Knowledge H2 adds the unit `delta` and the rows `scn`, `hint`, `cmp.score`, `riv.tech`, `riv.line`; each Fog task registers a `KeyKind` with a `truth` provider for its families.

**D21. Sources.** `takeReading` (a read whose fee the caller paid), the free `lab` source (reveals only), and `scn`/`odds` added to the `report` and `analyst` reads. The fee payee stays `pool:other` (Knowledge question 4).

**D22. Fog's assumed names.** Bound in `fog-mig.md` F-A. Tests use `withInfoMode`/`inFog`. `knowledge/contract.ts` re-exports the mode helpers, `registerKeyKind`, `takeReading`, `storedEstimates` (B8).

**D23. Sharpening.** Knowledge's rule table owns it (x0.6 passive, x0.8 source, Main Character all keys). G11 has no `sharpness()` and no edit to `knowledge/estimate.ts`.

**D24. The gut fence.** R3-H9 owns it. G9 drops `gut-fence.test.ts` and any edit to `invest/instinct.ts`.

**D25. `oddsRead`.** Fog's hazard-odds helper is `oddsRead`; Effort's research line stays `oddsLine`.

**D26. Not fogged in R3.** The Annual Report demand band (spec 6.7 step 4; Fog question 3) waits for R4 with `yearly.ts`; net worth stays exact, so a private valuation can be inferred (accepted, Fog question 5); segments place rivals by hidden quality and stay exact (question 6); a hint that names the best option still uses the real optimiser, only the rankings of `markBest` and the numbers after "about" are fallible (question 2). All are listed in `docs/FOG.md` (G12).

**D27. The market rule.** The owner's "exact numbers for the player's own industry's markets" is read literally: aggregates (size, share, rank, concentration, demand, leaders) are exact for every country of the company's own industry. Fog applies to rival internals (G1), the antitrust percent, scenario forecasts, other industries' markets and the later tasks. Answers Fog question 1; G1 stays.

**D28. Knowledge's questions.** Tilt is market breadth (present-only, needs no new reader); heirs start with no `know` record in R3 (company-bound records at age +5 are R4 with "People who remember"); the standing-orders dial is its own 0 to 3 and does not follow posture.

### Quiet

**D29. Order and reading of D20.** Q13 depends on the last task of each of the four lanes, so the lead merges the `ui`, `pace` and `var` lanes into the `main` worktree before it starts (Quiet question 1). The digest is a popup for the first 10 digests of a life, then inline; an heir starts a new count (`yearBook` is personal).

**D30. Nepo asks and will popups** get no families in R3.

**D31. Groups.** Section 2.5.

**D32. Repetition.** Q13 asserts 5% / 8%, at most 3 times, and no popup scene text twice in 10 years on the 13-life probe; a miss is reported, never relaxed. G12 re-runs the quiet acceptance on the merged tree.

**D33. Close timing.** `closeYear` resolves the `yearEvents` task itself, with `applyFallback`, which is exactly what the store calls at the head of the queue (`offline.ts` `resolveTask`, `store.ts` `processQueue`). Verified. Only with the flag on.

**D34. Digest line.** The log line drops prices (they stay in the This Year menu); the quiet-year test keeps today's meaning.

### Frontier

**D35. Fields.** 20 (12 future-facing kinds, 8 AI capabilities); medicine, software, weapons and finance wait for C.8 and C.9 as `FIELDS` rows.

**D36. Race deadlines** may move earlier after a rival landing, never below the year of the push or `from + 10`. Accepted. The cross-lane dependency is expressed as graph edges (F4, F5, F6 depend on F1).

**D37. Stream row and calls.** F1 owns the `frontier` stream row and driver. M1 is the only caller of `frontierTerms` in R3. Re-records follow section 4.

### Tests

**D38. Existing exact-odds tests.** A test that asserts a legacy odds number for an owner-run company uses a character whose ambition is not 50. Prefer `neutralAmbition(g)` in the test setup, with a row in `moved-tests.md`, over editing an expected number. `test/workshop.test.ts:199-201` and `test/education.test.ts:146` move as the plans say.

**D39. Hot files** are resolved as section 3 says. **D40. Timings and docs.** The lead adds the new test files to `scripts/test-timings.json` and the docs index lines after merge.


## 7. What the cross-check changed in the plan files

Every plan: a banner at the top and a closing section "Cross-check amendments".

**effort-core.md**: R3-E7 replaced by the purity kit (no dependency, 150 source); hooks file and renames (A1, A2); labels, caps, `knowYears`, `ceo` term, field pattern (A3); `softCeil` room 0 (A4); crew drive and the risk statement (A5); `burnedOut`, sink call (A6); focus counters in weeks (A7); ceiling row token and a quote bound (A9); re-record note (A10); hot files (A11).

**knowledge.md**: `delta` unit, rule rows, key shape, `KeyKind.revealedBy` (B1); `takeReading`, `lab` source, extended reads (B2); R3-H5 depends on R3-E1 and binds the sink (B3, inline); test mode convention (B4); sweep additions (B5); hot files (B6); fence ownership (B7); contract re-exports (B8).

**quiet.md**: group table additions (C1); flag comment and release steps (C2); repetition assertions (C3); close timing verified (C4); weights of this release's notices (C5); hot files (C6).

**frontier.md**: stream row moved to F1 (D-F1); label literals (D-F2); caps seen by `quote` (D-F3); only M1 calls the terms (D-F4); the one port (D-F5); AI lead deferred (D-F6); hot files (D-F7).

**effort-mig.md**: name mapping table (M-A); M0 owns the oracle and harness (M-B); M1 owns shared state fields, frontier inputs, hired firms steady (M-C, inline dependency line); M2 to M5 posture, risk, payoff lines (M-D); M6 leaves `modelRating` alone (M-E); M7 moves to lane `main` after M2, `knowYears`, setback stream (M-F, inline lane row); M8 and M9 why row, weeks counters (M-G); M10 as one labelled term (M-H); M11 adds the 200-year probe, node bound, screen sweep, label equality (M-I); test neutral ambition (M-J). Inline: every `Depends` line now names real task ids; lanes table `main` and `dt` rows.

**fog-mig.md**: R3-G6 removed (inline tombstone and table row); lanes `people` reordered G5, G11, G4; every `Deps` line now names real task ids; name binding table (F-A); key families and `KeyKind` registration (F-B); `knownMarket` reading (F-C); `lookFor` without `domain` (F-D); vet through `takeReading` (F-E); no `sharpness`, `talents.hintLens` is the only port (F-F); `oddsRead` and the policy hook (F-G); fence and `instinct.ts` untouched (F-H); valuation key (F-I); closing sweep (F-J); deferred Annual Report (F-K); hot files (F-L).

New file: `moved-tests.md`.

## 8. Plan against code: claims checked with grep and reading

| Claim | Result |
|---|---|
| `layerOf`: `WORLD_DIRS` is `economy`, `world`; a new folder is layer 3 (KERNEL.md section 5); a `contract.ts` at any depth is a door (Effort core, Knowledge, Fog) | true. `knowledge/` and `fog/` are new domains; `effort/` needs the one-word edit |
| `hub-entry` requires every defined port bound after the real entry points (Effort core's `effort.reveal`, Fog's `fog.arrest`) | true (`test/hub-entry.test.ts` near line 70). Fixed: hooks (D8), no `fog.arrest` |
| `flags.ts` says eight keys are the complete R1 set and `test/flags.test.ts:88` pins eight; the release rule test fails unless version and defaults flip together (Quiet) | true. A `5.1.0` flag stays false at the 5.0.0 package version, so the dark flag is consistent (D4) |
| `aging.ts:48` loops over `yearlyEntries('aging')`; `g.yearActions = {}` at `aging.ts:37`; a module's entry id is its module id (Quiet `s`, Effort core pool reset) | true |
| The store resolves `yearEvents` with `resolveTask` = `applyFallback` (Quiet Q4 `closeYear`) | true (`offline.ts:61`, `store.ts:608`) |
| `yearActions` sits in the golden `character` slice (Effort core's `focus.weeks` key) | true (`test/golden-kit.ts` `TOP_KEYS`). Fixed (D16) |
| `foresight-scan.test.ts` pins `GATE_LINE = 177` and four `INSTINCT_IMPORTERS` (Fog G9 comment edit) | true. Fixed (D24) |
| `rdQuote` odds `clamp(1 - (1 - p0) * k^-0.4, .05, .95)`, years `round(clamp(ceil(base / sqrt(k) - 1e-9), 1, 4))`, `launchP` at `rd.ts:30` (Effort core E3 parity, migration M1) | true; quality is `clamp(... , 5, 97)`, so `softCeil` with `room` 0 is needed (D18) |
| `PERSONAL` in `world-flags.ts` takes dotted keys (`effort.you`) | true (`edu.moments`, `biz.bought`) |
| `Task.field` pattern `^[a-z][a-z0-9.]{0,31}$` against trade names such as `aiLab`, `spaceTech`, `carbonCapture` | false: capitals and 32 characters. Fixed (A3) |
| Effort migration says anything about the frontier, `Quote.risk`, `payrollX` or a company know-how map | false: nothing. Added (M-C, D11, D12) |
| Knowledge key shape (`<kind>:<id>[:<id>]:<field>`, 64 characters) against Fog's `cand:<asset>:<year>:<role>:<i>:skill` and `scn:`, `hint:`, `cmp.score` | mismatch. Fixed (D20) |
| Fog `oddsLine` against Effort `oddsLine` | same name, two signatures. Fixed (D25) |
| The six plans and the amendments contain no U+2014 or U+2013 | true (grep) |

## 9. For the lead

1. Start wave 1 (section 1.3), Effort core E1 and M0 first. M0 starts at once and records on a clean HEAD, before any other track's change reaches the research files; tell every agent that `moved-tests.md` exists.
2. The calls that deserve the owner's eye at the human playthrough: J.8 ramps from 90 (D15); the market rule is the whole industry (D27); ambition is linear and capped, not curved (D10); hired firms never push (D11); the dark `yearCard` flag (D4); the AI market is not lifted (D17).
3. Release commit: package version 5.1.0, flip `yearCard`, run the four store tests with the card on and add rows for any that move.
4. At each track merge: section 4. After the last merge, one full CI.
5. Add the new test files to `scripts/test-timings.json` (`quiet-acceptance` about 60 s, `frontier-acceptance` about 25 s, `year-close`, `pace-families`, `event-variants`, the `effort-*` files at 20 to 40 s each).
6. Every one of the 45 open questions the six planners raised (8, 5, 7, 6, 13 and 6) has a decision in section 6; none is left for the owner except the playthrough review in point 2.


## Lead decisions after the first build pass (2026-10-22)

L1. "Popups a year" in the R3 acceptance (ordinary p90 3 and max 5, $50M p90 4 and max 6, tycoon mean 4 plus one "Your companies" card) counts what ARRIVES: the modal popups the player sees after the store flow (closeYear, Quiet Mode, the digest). The queued-before-routing count (AUDIT) is measured and printed, not asserted. The AUDIT assertions in test/quiet-acceptance.test.ts were added in R3 and encode the other reading; turn them into printed measurements (this is not weakening a pre-existing test).
L2. The repetition targets (repeated lines at most 5%, 8% rich; the same line within 10 years 0, state lines once in 5 years; any line at most 3 times) measure LIFE-LOG lines, as the E digest's text-kit and R2's text-repeat probe define them. Popup scenes follow family pacing instead (a popup family at most 6 times a life, a gap of 4 or more years), not the 10-year line rule. If the log-line cases are still red under that reading, fix them at the source (state lines through stateLine, more variants, family memory), never by relaxing the numbers.
L3. The first build pass skipped 26 tasks because of a scheduling bug in the lead's workflow script (a dependency listed later than its dependent was read as not done). Those tasks were never attempted; they run now in a continuation.
