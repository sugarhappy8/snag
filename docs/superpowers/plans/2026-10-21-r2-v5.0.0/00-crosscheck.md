# R2 cross-check of the four track plans (Ledger-world, Kernel, Save, Platform) against wave 0, the code and the roadmap

Read: `ledger-world.md`, `kernel.md`, `save.md`, `platform.md` and (context only) `wave0.md` in this folder, and the roadmap's R2 block (`docs/superpowers/plans/2026-10-20-living-world-roadmap.md`, lines 185 to 212). Code checked in the worktree `wt/r2-release` at `a65349a` (v4.1.1). Nothing under `src/` or `test/` was edited; only the four plan files and this file. All text uses plain hyphens (no U+2014, no U+2013).

Merge order into `release/v5.0.0`: wave 0 first and alone, then Ledger-world, Kernel, Save, Platform. Work order is looser: Kernel R2-K1 to R2-K6, Save R2-S1 to R2-S9 and Platform R2-P1 to R2-P10 can run beside Ledger-world because they touch other files; the tasks that cannot are named in section 5.

## 1. Global task order per track

Dependencies marked `wave0` mean "the wave 0 merge is the base". Cross-track dependencies are written as task ids. A task never depends on a later task of the same list.

### Ledger-world (19 tasks; R2-L19 is new)

| Order | Id | Title | Depends on |
|---|---|---|---|
| 1 | R2-L1 | World root, entity ids, the hostile-load reader | wave0 |
| 2 | R2-L2 | Ledger core: reasons, mints and burns, `book`, flows, checks, `world/shards.ts` hub | R2-L1 |
| 3 | R2-L3 | The three wrappers, the cash helpers, erosion, `addLoan` (re-records wave 0's canary on `character`) | R2-L2 |
| 4 | R2-L4 | Reasoned-call ratchet replacing the R1 money ratchet | R2-L3 |
| 5 | R2-L5 | 100-year, 40-life conservation probe (fast and sliced tiers) | R2-L3, R2-L4 |
| 6 | R2-L14 | World indexes over Person, Asset and npcCompany | R2-L1 |
| 7 | R2-L6 | Migration 1: home, family, love, NPC lives (+ same-year resale spread) | R2-L5 |
| 8 | R2-L7 | Migration 2: body, law, work, workshop, nation, advisors (+ write-offs) | R2-L6 |
| 9 | R2-L8 | Migration 3: events, activities, estate in `continueAsChild` | R2-L7 |
| 10 | R2-L9 | Migration 4: shops and computer | R2-L8 |
| 11 | R2-L10 | Migration 5: special careers | R2-L9 |
| 12 | R2-L11 | Migration 6: business A | R2-L10 |
| 13 | R2-L12 | Migration 7: business B, then `why` required if the count is zero | R2-L11 |
| 14 | R2-L13 | F37 bond par, F38 capital gains and transaction tax | R2-L4 |
| 15 | R2-L15 | Holdings, world invariants, heir resync | R2-L14, R2-L2 |
| 16 | R2-L16 | Level-of-detail framework | R2-L15, wave0 |
| 17 | R2-L17 | Budget meter, `yearlyWorld` last in `YEARLY_HOOKS`, 50-year probe | R2-L16, R2-L3 |
| 18 | R2-L19 | The cash walk without a residual: per-company reason tally | R2-L12, R2-L3 |
| 19 | R2-L18 | Acceptance sweep and docs | R2-L1 to R2-L17, R2-L19 |

### Kernel (13 tasks)

| Order | Id | Title | Depends on |
|---|---|---|---|
| 1 | R2-K1 | Registry, fact type and ports | wave0 |
| 2 | R2-K3 | Layer table, rule (b), rule (e), rebase mode | wave0 |
| 3 | R2-K2 | Synchronous bounded bus and kernel test kit | R2-K1 |
| 4 | R2-K4 | Domain-pair ratchet (c), eager-read scan (d) | R2-K3 |
| 5 | R2-K5 | Hub-entry tests and the first 12 import cuts | R2-K1, R2-K4 |
| 6 | R2-K6 | Last 2 cuts, split baseline, zero cross-directory cycle edges | R2-K5 |
| 7 | R2-K7 | Bounded fact store `g.world.facts` | R2-K2, R2-L1 (and `world/shards.ts` from R2-L2) |
| 8 | R2-K8 | Parity recorder (pre-change fixtures) | R2-K1, R2-L17 |
| 9 | R2-K9 | Convert `aging.ts` to registered modules (+ nine test files) | R2-K1, R2-K8, R2-L17 |
| 10 | R2-K10 | Convert `special.ts` | R2-K9 |
| 11 | R2-K11 | Convert `menus.ts` | R2-K9 |
| 12 | R2-K12 | Convert the company view in `manage.ts` | R2-K9 |
| 13 | R2-K13 | `docs/KERNEL.md` and acceptance sweep | R2-K6, R2-K7, R2-K10, R2-K11, R2-K12 |

### Save (12 tasks)

| Order | Id | Title | Depends on |
|---|---|---|---|
| 1 | R2-S1 | Slice registry and slice table (adds the `world.ledger` core row) | wave0 |
| 2 | R2-S2 | SAVE_SCHEMA 3, dual read, four fixtures, ten pinned tests | R2-S1 |
| 3 | R2-S3 | Chunk encoder | R2-S1, R2-S2 |
| 4 | R2-S4 | Chunk decoder, hostile-chunk policy, reload identity | R2-S3 |
| 5 | R2-S5 | Chunk stores in the backends (may run beside S1 to S4) | none |
| 6 | R2-S6 | Store writes chunks; `saveGame` and `loadGame` use them | R2-S4, R2-S5 |
| 7 | R2-S7 | Boot reads chunks; partial loads, quarantine, IndexedDB fixture | R2-S6 |
| 8 | R2-S8 | Per-tap cost: `cloneForAct` shares frozen replace roots | R2-S3 |
| 9 | R2-S9 | Time Machine over slices; snapshot restores through `migrateSave` (F39) | R2-S2, R2-S4 |
| 10 | R2-S10 | Save diet (`previous` for focus countries, history 16); re-records two canaries | R2-S2, R2-K8 |
| 11 | R2-S11 | Shape tables for the big world slices | R2-S4 |
| 12 | R2-S12 | 50-year budgets, world adapter, node-cap review, docs | R2-S1 to R2-S11, R2-L2, R2-L17, R2-K7 |

### Platform (11 tasks)

| Order | Id | Title | Depends on |
|---|---|---|---|
| 1 | R2-P1 | Golden kit (`sliceDigests`) | wave0 |
| 2 | R2-P2 | Plans, runner, `golden.mjs`, first golden file, PR-tier test | R2-P1 (reuses wave 0's `onYear`) |
| 3 | R2-P3 | Extra-draw isolation, replay, reload, fork | R2-P2, wave0 |
| 4 | R2-P4 | Old saves run, 100x ceiling probes | none (wave0 base) |
| 5 | R2-P5 | Nightly metrics library, CLI, probes | R2-P2, R2-P4 |
| 6 | R2-P6 | `nightly.yml` and the CI doc | R2-P4, R2-P5 |
| 7 | R2-P7 | 13-life repeat probe, R1 baseline | wave0 |
| 8 | R2-P8 | `stateLine` and its bounded memory | wave0 |
| 9 | R2-P9 | Status lines converted to state lines | R2-P2, R2-P7, R2-P8 |
| 10 | R2-P10 | Variants and the repeat gate | R2-P9 |
| 11 | R2-P11 | Integration pass on the merged tree | R2-P1 to R2-P10, R2-L18, R2-K13, R2-S12 |

Sizes: every task is at or under about 1,100 source lines. The largest are R2-L2 (about 1,065 with the hub), R2-A3 of wave 0 (about 970 generated lines), R2-S9 (720), R2-P5 (715). The dependency graph is acyclic: all cross-track edges point from a later-merging track to an earlier one (Kernel and Save on Ledger-world; Platform on all), except two that look backwards and are not: Kernel R2-K9 edits one Ledger-world test file (`test/world-budget.test.ts`) after it merged, and Save R2-S10 re-records Kernel's parity fixture after it merged.

## 2. Cross-track contracts (the exact names, after reconciliation)

| Contract | Provider | Consumers | Status |
|---|---|---|---|
| `stream`, `outcomeStream`, `worldSeed`, `hashKey`, `streamKey`, `streamUnit`, `textStreamKey`, `textUnit` in `src/game/kernel/streams.ts` | wave 0 R2-B1 | Ledger-world R2-L16 (`stream` only), Platform R2-P3 | match. The text stream is a pure unit function plus a cursor `textRand(g)` in `src/game/text/draw.ts` (R2-B2); it is not a PRNG |
| `findSeed`, `findSeeds` in `test/seed-kit.ts`; pin ratchet `test/seed-pins.test.ts` | wave 0 R2-B1 | all | match; see rule 2 below (the ratchet reaches `test/**/*.ts` kits too) |
| `onYear(g, yearsPlayed)` on `PlayOptions` and `ProbeOptions` | wave 0 R2-A1 | Platform R2-P2, R2-P5 | fixed: Platform no longer adds it |
| `EntityRef`, `ref`, `isRef`, `parseRef` (`kernel/ids.ts`) | R2-L1 | Ledger-world, later releases | match with the lead's names |
| `GameState.world?: WorldState`, `ensureWorld`, `readWorld`, `worldShard`, `registerShard`, `normalizeWorld` | R2-L1 | Kernel R2-K7, Save R2-S12, Platform `sliceDigests` | match; `shardNames()` added (Save's guard and R2-L18 need the list) |
| `world/shards.ts`, the registration hub (`ledger`, `people`, `firms`, `homes`, `holdings`, `lod`, plus `import './facts'` from R2-K7) | R2-L2 (new) | Save `save-slices.ts` (imports it for effect), `world/sync.ts`, tests | new: stops a 2-module cycle (`state.ts` importing shard modules that import `state.ts`) and the load-order hole for `normalizeWorld` |
| `book`, `bookMint`, `bookBurn`, `bookPlayer`, `foldAccount`, `checkLedger`, `flowsOf`, `peekLedger`, `ledgerRoot` (`kernel/ledger.ts`); `MINTS`, `BURNS`, `REASONS` (`kernel/reasons.ts`, `MINTS` and `BURNS` also re-exported from `ledger.ts`) | R2-L2 | Platform R2-P11, later releases | fixed: the lead's "MINTS and BURNS in ledger.ts" and Platform's "names assumed" now resolve |
| `addMoney`, `spend`, `earnIncome` with `why?: Why`; `cash.ts` helpers | R2-L3 | everyone | match |
| `registerModule(def)`, `ModuleDef.handles`, `emit(g, fact)`, `YEARLY_PHASES`, `yearlyEntries`, `withYearly`, `collectMenu` | R2-K1, R2-K2 | all later tracks | deviation: the lead's `on(kind, handler)` does not exist; handlers are declared in `ModuleDef.handles` (needs the module id for ordering and the slice for the own-slice rule). No R2 task calls `on`. Flagged for the lead, not changed |
| `defineSlice`, `hasSlice`, `getAt`, `setAt`, `freezeRoot`, `cloneForAct`, `encodeSave`, `assembleSave`, `SAVE_SCHEMA = 3` | R2-S1 to R2-S8 | Kernel guard (R2-S12), Platform | match; `hasSlice('world.<name>')` made true for dynamic sub-slices |
| `sliceDigests`, `SLICES`, `TOP_KEYS`, `GOLDEN_PLANS`, `STREAM_SLICES`, `CEILING_PROBES` | R2-P1 to R2-P4 | every later release | match with the lead's slice list |
| `r2-parity-kit` (`parityDigests`, `traceLife`, `compareTraces`, `ParityTrace`) and `test/fixtures/r2-parity.json` | wave 0 R2-A1 | Kernel R2-K8 | match; the canary is re-recorded by the tasks that move it (rule 3) |

**Rules every track follows (added or confirmed by the cross-check).**

1. **Shard write discipline.** Every `g.world.<name>` shard is written by replacing its root, never in place, because Save's `act()` shares the frozen roots between drafts. The one exception is `ledger` (every booking edits it in place): Save declares it as a core, in-place slice (`world.ledger`), cloned on every tap and never frozen. Each shard writer has a test on deep-frozen shards. (Ledger-world rule 7; Save R2-S1, R2-S3, R2-S8, R2-S12.)
2. **No new `seed: <digits>` literal in any `test/**/*.ts`** (wave 0's ratchet counts the pattern in kits and plans too). Fixed lives are written as tuples or helper arguments (`life('birth-1950', 'birth', 1, 1950, 20)`), as constants (`SLICE_LIFE_SEED`), as `LEDGER_SEEDS[n]`, or found with `findSeed`. Five plan snippets that would have broken it were corrected (R2-L17, R2-L18, R2-S1, R2-P1, R2-P2).
3. **The wave 0 canary moves only on purpose.** `test/fixtures/r2-parity.json` (compared by `test/r2-codemod-parity.test.ts`) is re-recorded with `R2_PARITY_RECORD=update`, naming the moved slice in the commit message, by the task that legitimately moves it: R2-L3 (`character`: `erodeCash` rounds to whole dollars), R2-L6 (same-year house resale), R2-L13 (capital gains leave `taxableIncome`), R2-L19 (only if the new optional tally moves `assets`), R2-S10 (`economy`). Every other task must leave it green; R2-L7 to R2-L12 run it as a tripwire. The Kernel fixture `test/fixtures/kernel-parity.json` is recorded after Ledger-world (R2-K8), must not move in R2-K9 to R2-K12, and is re-recorded once by R2-S10 (`economy` only). Platform's golden file is regenerated once, by R2-P11.
4. **Every new stream tag is a string literal** at the call site (`stream(g, 'lod', ...)`, never `'lod.' + kind`), with a row in `STREAM_SLICES` in the same commit (R2-P3 reads literal tags of `stream` and `outcomeStream`). R2-L16's `seededEntity` was changed to the literal tag `lod`.
5. **Module-level registrations use arrows or bare calls**, not `const X = importedValue`, so R2-K4's eager-read ratchet stays quiet (`registerShard('ledger', { normalize: (raw) => normalizeLedger(raw) })`, `normalize: (raw) => normalizeWorld(raw)` in `save-slices.ts`).
6. **Files with player-linked draws do not contain the token `registerModule(`.** Wave 0's guard `test/world-streams.test.ts` scans every file that contains it. `business/manage.ts` has 11 `chance` and `rand` lines, so R2-K12 registers with `registerModules(` (plural). The lead must tell wave 0's agent that the guard matches the singular token only. Fallback if CI disagrees: the `// rng-ok:` pragma on the 11 lines, never a weakened guard.
7. A track that adds a top-level `GameState` key adds a `TOP_KEYS` row; a track that adds a ceiling-list entry adds a `CEILING_PROBES` row; both are done at R2-P11 for this release.

## 3. Hot files

Order inside a row is merge order. "Additive" means a separate hunk in a different function or region.

| File | Tasks (in merge order) | How they coexist |
|---|---|---|
| `src/game/aging.ts` | R2-L3 (inflation line 119, one import), R2-L17 (`['world', yearlyWorld]` after `milestones`), R2-K9 (rewrites `YEARLY_HOOKS` into the registry; `world` goes to phase `settle`) | K9 converts whatever is in the list then (36 entries) and lists the names found |
| `test/*.test.ts` that import `YEARLY_HOOKS` (`korean-cash`, `hedge-year`, `tech-waves-wiring`, `fuzz-regressions`, `series-life`, `dividend-wiring`, `release-182`, `advisors-year`, `world-budget`) | R2-L17 (`world-budget`), R2-K9 (all nine) | K9 swaps the mechanism through `agingNames` and `withAging` in `test/kernel-kit.ts`; assertions untouched. The Kernel plan had named only `korean-cash`: corrected |
| `src/game/core.ts` | R2-L3 (three primitives), R2-L12 (one signature), R2-S2 (line 28 `SAVE_SCHEMA`) | different hunks |
| `src/game/life.ts` | R2-L8 (estate hunks), R2-L15 (`syncWorld(n)` before the final return) | different hunks |
| `src/game/types.ts` | R2-L1 only | everyone else uses the index signature of `WorldState` |
| `src/game/assets.ts` | R2-L3 (one line), R2-L6 (40 sites, `makeOffers`), R2-K5 (moves lines 136 to 180 to `rng.ts`, one import, one re-export) | K5 rebases onto L6; textual, not semantic |
| `src/game/business/economy.ts` | R2-L11, R2-L12 (money sites), R2-L19 (`recordYear`), R2-K5 (`localPay` moves out, a port bind) | additive hunks in different functions |
| `src/game/business/manage.ts` | R2-L11 (15 sites), R2-K12 (`businessView` block, registration at the end) | different hunks; see rule 6 |
| `src/game/business/state.ts`, `src/game/charts/books.ts` | R2-L11, R2-L12 (sites), R2-L19 (`tally`, `flows`, `cashWalkSpec`) | additive |
| `src/game/investments.ts` | R2-L13 (all seven sites, F37, F38), R2-P9 (two index lines) | P9 rebases onto L13 |
| `src/game/special.ts`, `src/game/menus.ts` | R2-K8 (one word in `special.ts`), R2-K10, R2-K11 | Kernel only |
| `src/game/nation/effects.ts`, `src/game/business/exit.ts` | R2-L13 (re-exports from `nation/rates.ts`) | additive |
| `src/game/economy/model.ts`, `economy/index.ts` | R2-S10, then R2-P9 (the "Around me" line, six lines away) | P9 rebases |
| `src/game/text/memory.ts` | wave 0 R2-B2 (`TextMem.c?`, `clean`, `writableTextMem`), R2-P8 (`TextMem.s?`, same three places) | P8 rebases and keeps both fields independent |
| `src/game/world-flags.ts` | R2-S3, R2-S8 (one `WHOLE_FLAGS_SITES` entry each) | additive |
| `src/game/world/shards.ts` | R2-L2 (creates), R2-L14, R2-L15, R2-L16 (one line each), R2-K7 (`import './facts'`) | one line per shard |
| `src/game/world/state.ts` | R2-L1 only (it imports no shard module) | |
| `test/fuzz-kit.ts` | R2-L5 (stats, year loop, rich boost), R2-L15 (one call swap), R2-S8 (line 807) | different hunks |
| `test/money-ratchet.test.ts`, `test/money-ratchet.json` | R2-L4 (rewrite), R2-L6 to R2-L13 (shrink only), R2-L19 (only if a site moves) | one entry per line |
| `test/ceiling-list.json` | R2-L2 (4), R2-L13 (2), R2-L16 (1), then R2-P11 adds the probe rows | seven ids, none exempt |
| `test/play-kit.ts`, `test/probe-life.ts` | wave 0 R2-A1 (`onYear`), R2-P5 (`scale`) | Platform no longer adds `onYear` |
| `test/kernel-kit.ts` | R2-K2 (creates), R2-K9 (`agingNames`, `withAging`) | additive |
| `test/architecture-baseline.json`, `test/layers-baseline.json` | R2-K5, R2-K6 (shrink), Ledger-world new files add none, Kernel rebases once (section 4) | rebase mode, listed additions |
| `test/fixtures/r2-parity.json`, `test/fixtures/kernel-parity.json`, `test/fixtures/golden-digests.json` | see rule 3 | re-recorded by the task that moves them |
| `docs/CI.md` | R2-L5 (one sentence), R2-P2, R2-P6, R2-P11 (appends) | |
| `scripts/test-timings.json` | R2-L5 (split list, one weight); the lead refreshes the rest after merge | |

## 4. Layer edges the Kernel rebase must accept

Kernel's rule (b) forbids upward imports; its `UPDATE_LAYER_BASELINE=rebase` accepts what Ledger-world added, once, and prints the additions. Read from the Ledger-world plan, the additions must be exactly these three (and no L0 file, and no cross-directory cycle edge):

1. `src/game/nation/effects.ts -> src/game/nation/rates.ts` (L2 to L3): R2-L13 moves `personalTax` into the new leaf and re-exports it.
2. `src/game/world/firms.ts -> src/game/business/util.ts` (L2 to L3): R2-L14 reads raw company details with `rec`, `str`, `num`.
3. `src/game/world/holdings.ts -> src/game/business/family-share-state.ts` (L2 to L3): R2-L15 reads family shares.

Both business files are leaves (`util.ts` imports `core` and `talents`; `family-share-state.ts` imports `util`), so they join no cycle. Any other added edge is a Ledger-world defect. Also new in the cross-check: `world/state.ts` imports no shard module, which removes what would have been a state-to-people two-module cycle.

## 5. What each track needs from an earlier merge

| Track | Needs from wave 0 | Needs from Ledger-world | Needs from Kernel | Needs from Save |
|---|---|---|---|---|
| Ledger-world | `kernel/streams.ts` (R2-L16 only), `findSeed`, the codemod tree (money lines may have moved), the pin ratchet | none | none (it adds one `YEARLY_HOOKS` entry; Kernel converts it) | none |
| Kernel | `kernel/` directory, `r2-parity-kit` and its canary (R2-K8), `findSeed`, the world-streams guard | R2-K7: `world/state.ts` (R2-L1) and `world/shards.ts` (R2-L2). R2-K8 and R2-K9: the money migration's line moves, `['world', yearlyWorld]` (R2-L17) and the rewritten inflation line. R2-K9 also edits Ledger-world's `world-budget.test.ts` | R2-K1 to R2-K6 need nothing | none |
| Save | `findSeed`, `test/seed-kit.ts` (tests needing a life with a property), the `text` slice inside `flags.textMem` | R2-S12: `shardNames`, `normalizeWorld`, `normalizeLedger`, `world/shards.ts`, the shard write rule; R2-S12 and R2-S9's tests with a real world | R2-S10: `kernel-parity.json` (re-recorded). R2-S12: `modules/index.ts` and `factsModule` for the slice guard | none |
| Platform | `kernel/streams.ts`, `text/draw.ts` (R2-P3), the `onYear` hooks, the text stream, `findSeed` (unused) | R2-P11: the seven ceiling ids, `MINTS`/`BURNS`, `TOP_KEYS` row for `world`, mints and burns for the nightly metrics | R2-P11: any new stream tag, `registeredFacts` | R2-P4: the new `save-*.json.gz` fixtures (found by directory listing); R2-P3: `loadSnapshot` and `migrateSave` keep their names |

Tasks that cannot start before an earlier merge (everything else may run beside it): R2-K7, R2-K8, R2-K9 to R2-K13 (after Ledger-world), R2-S10 step 4b and R2-S12 (after Ledger-world and Kernel), R2-P11 (after all), R2-P3 and R2-P9 to R2-P10 (after wave 0), R2-L16 (after wave 0's streams).

## 6. Acceptance ownership

Each acceptance line of the roadmap's R2 block has one primary owner (the task whose test fails if it breaks). Supporting tasks prove a half or guard a neighbour.

| Roadmap line | Primary owner | Supporting |
|---|---|---|
| 100-year probe over 40 lives: accounts sum to previous plus mint minus burn within $1, flows net to zero per reason | R2-L5 (`test/ledger-conservation.test.ts`, 4 shards, fast tier of 3 lives) | R2-L18 strict drift, R2-L2 unit proofs |
| Unreasoned `addMoney`, `earnIncome`, `spend`, `b.cash +=`, `p.money +=` never rise | R2-L4 (v2 ratchet, 773 sites) | R2-L6 to R2-L12 shrink it, R2-L12 may make `why` required |
| Government is a named payer of bond par less default haircut (F37) | R2-L13 | |
| Capital gains and transaction tax reach `gov:country` (F38) | R2-L13 | |
| `g.world` absent reads as empty | R2-L1 | R2-L18, R2-P11 (old-saves world check) |
| The v4.0.2 fixture runs 5 years | R2-S2 (makes `save-v4.0.2.json.gz`, runs it) | R2-P4 (every `save-*.json.gz`), R2-L18 (the oldest, with world). Correction: `save-v1.json.gz` is a schema-1 save from v2.6.0, not v4.0.2 |
| Time Machine restores pass through `migrateSave` (F39) | R2-S9 | |
| 50-year probe: core at most 400 KB, world at most 1 MB and 600 KB gzipped | R2-S12 (`test/save-budget.test.ts`) | R2-S10, R2-S11 (the levers), R2-L17 (`worldBudget` of the registry alone) |
| Per-tap clone plus stringify at most 8 ms | R2-S8 | R2-S12 on the heavy life |
| Light-life `ageUp` at most 160 ms desktop, 250 ms mobile | R2-S12 (`test/save-perf.test.ts`; mobile printed, not asserted) | R2-L5 and R2-L17 (booking-count proxies) |
| One extra draw on a named stream changes only that slice's golden digest | R2-P3 (stream tap, golden slices) | wave 0 R2-B2 (`test/r2-text-isolation.test.ts`, text half), R2-P1, R2-P2 |
| Replay, reload and Time Machine fork give identical JSON | R2-P3 (whole state, nine slices) | R2-L18 (world half), R2-S4 (reload), R2-S9 (fork), R2-S12 (50 years), wave 0 R2-B2 (text) |
| Repeated-line rate of the 13-life probe at most half of R1's | R2-P10 (the gate, 0.0415) | R2-P7, R2-P9, R2-P5's hard rule |
| Probe: mint and burn declared and capped (inflation, lending, write-offs, emigration) | R2-L2 (tables, caps, log rows) | R2-L3 (erosion, lending), R2-L7 (write-offs), R2-L16 (emigration), R2-P11 (100x probes) |
| Probe: pool prices carry bid-ask spreads | R2-L2 (`SPREADS`) | R2-L6 (house flip), R2-L9 (goods), R2-L13 (markets), R2-L16 (promotion) |
| Player sees: a cash walk with no "everything else" row | R2-L19 (**orphan, assigned**) | R2-L11, R2-L12 (every company cash write through `firmCash`) |
| Player sees: faster taps; saves 20 to 30% smaller | R2-S8 (taps); R2-S12 (size, on the v4.1.1 heavy fixture) | R2-S10, R2-S11 |
| Player sees: lines that stop repeating | R2-P10 | |
| CI: golden-digest job | R2-P2 (fast tier, names the slice) | R2-P11 (regenerates once) |
| CI: nightly deep tier switched on | R2-P6 (with R2-P4, R2-P5) | |
| CI: 4 shards | existing R1 CI; R2-L5 adds the sliced probe to `split` | |
| Risk: 119 pinned seeds move to `findSeed` | wave 0 R2-B1 (kit, ratchet) and R2-C (the files CI shows; measured about 19, not 119) | every track in the test files it touches |
| Risk: keep the enter-through-each-hub tests | R2-K5, R2-K6 (`test/hub-entry.test.ts`) | R2-K13 |
| Exit gate: a written list of every seeded test that moved and why | wave 0 R2-C (`moved-seeds.md`, the rebaseline) | R2-P11 step 8 (new: appends the other tracks' pinned numbers from their commit messages, **orphan, assigned**) |
| Exit gate: acceptance green; one full CI per integration run | the lead (no task) | |
| Kernel acceptance: converted yearly order, menus and views identical (parity); cycle set shrinks; layer ratchets fail on a synthetic violation | R2-K8 to R2-K12 (parity), R2-K5, R2-K6 (cycles), R2-K3, R2-K4 (ratchets) | R2-K13 |
| State budget: `g.world` within 25,000 nodes and 450,000 bytes at 12 companies, 50 years | R2-L17 | R2-S12 |

## 7. What the cross-check changed in the plan files

**ledger-world.md**
- Added R2-L19 (the cash walk, the roadmap's player-visible line that no plan owned), with its row in the summary, order, acceptance table and hot files.
- Added `shardNames()` to the world root (R2-L1) and a registration hub `world/shards.ts` in R2-L2 (R2-L14 to R2-L16 register there, not in `state.ts`).
- Rule 7 (replace-the-root write discipline) in section 2, and a deep-frozen-shard test in R2-L14, R2-L15, R2-L16.
- `ledger.ts` re-exports `MINTS` and `BURNS`; `ledgerRoot` applies the `ensureWorld` rule itself (kernel files may not import `world/`), with a test.
- `seededEntity` uses the literal stream tag `lod`.
- Wave 0 canary re-record steps in R2-L3, R2-L6, R2-L13, and a canary tripwire in the migration procedure.
- The v4.0.2 fixture claim corrected (section 4 point 3, R2-L18 test 1); seed literals removed from R2-L17 and R2-L18 tests; R2-L17's note that Kernel rewrites its `YEARLY_HOOKS` assertion; declared layer edges in R2-L13 and R2-L14.

**kernel.md**
- R2-K9 now converts the seven other test files that import `YEARLY_HOOKS` (and Ledger-world's `world-budget.test.ts`) with two helpers in `test/kernel-kit.ts`; the plan had named only `korean-cash.test.ts`.
- R2-K12 registers with `registerModules(` (rule 6); R2-K7 adds `import './facts'` to `world/shards.ts`; R2-K3 lists the three expected upward edges; R2-K1 documents that `on` is `ModuleDef.handles`; R2-K8 notes the wave 0 canary; open question 9 resolved.

**save.md**
- R2-S1 adds the `world.ledger` core row and makes `hasSlice` accept `world.<name>`; R2-S3, R2-S4, R2-S8 describe the inline core sub-slice; R2-S12's rebase check is now concrete (hub import, arrows, real-shard re-runs, guard with `shardNames`); section 5 points 3 and 4 resolved; R2-S10 re-records both canaries; a seed literal removed from R2-S1.

**platform.md**
- R2-P2 reuses wave 0's `onYear` and writes plans with a `life(...)` helper; R2-P1 loses a seed literal.
- R2-P3 taps the text stream through `textRand` (`wrapTextDraw`), scans `outcomeStream` too, and has rows for `text`, `flavor.milestone` and idle `lod`.
- R2-P11 gets the seven ceiling rows by id, the exact `MINTS`/`BURNS` location, the seed grep expecting nothing, and step 8 (the moved-numbers list). R2-P8's memory hunk is noted next to wave 0's.

## 8. Plan against code: ten claims checked with grep

| Claim (plan) | Result |
|---|---|
| `aging.ts` has 35 hooks, `YEARLY_HOOKS` at 45, inflation line at 119, loop at 122 (Ledger-world, Kernel) | true |
| `core.ts` `addMoney` 63, `spend` 70, `earnIncome` 82, `canAfford` 92, `SAVE_SCHEMA = 2` at 28 (Ledger-world, Save) | true (`addMoney` and `earnIncome` return `void` today and `spend` returns a boolean; the plan makes the first two return the applied amount) |
| `types.ts` `GameState` 685 to 714, `flags` at 710, `ChartSpec` import at 5 (Ledger-world) | true |
| `life.ts` `continueAsChild` 1138, `structuredClone(g)` 1143 (Ledger-world, Save) | true |
| `save-schema.ts`: `STEPS` 30, `migrateSave` 44, `finiteJsonTree` 222, `isLoadableGame` 522, `MAX_JSON_NODES = 500_000` (Save) | true |
| `test/fuzz-kit.ts`: `checkInvariants` 540, line 807 `structuredClone(g)`, rich boost at 1049 (Ledger-world, Save) | true |
| Only `korean-cash.test.ts` uses `YEARLY_HOOKS` (Kernel R2-K9) | **false**: seven more test files import it (and Ledger-world's own `world-budget.test.ts` will). Fixed |
| `save-v1.json.gz` is the v4.0.2 save (Ledger-world) | **false**: schema 1, version 1, added at v2.6.0. Fixed; Save makes the real v4.0.2 fixture |
| `test/fixtures` holds only `save-v1.json.gz` as a save (Save, Platform); `v4.0.2` and `v4.1.1` tags exist | true |
| `special.ts` `YEARLY` at 29, 13 hooks; `business/manage.ts` `businessView` at 2230; `seeded` at `assets.ts:157`; `localPay` at `economy.ts:97`; `underworld.ts:9` imports `refreshValue`; IndexedDB opens at version 1 (Kernel, Save) | true. New finding from the same scan: `business/manage.ts` holds 11 draw lines, which matters for wave 0's `registerModule(` guard (rule 6) |

## 9. For the lead (decisions the cross-check did not take)

1. `on(kind, handler)` is not provided; handlers are declared in `ModuleDef.handles`. Confirm, or ask Kernel for the one-line sugar.
2. Tell wave 0's agent: the world-streams guard matches the singular `registerModule(` token only (rule 6). Wave 0's reconciliation note 1.7.6 says Kernel moves `seeded` to `kernel/seeded.ts`; the Kernel plan moves it to `src/game/rng.ts` and wave 0's `streams.ts` keeps its own `hashKey`. The Kernel plan is the one to follow.
3. R2-L19 is 330 lines of Ledger-world work the roadmap listed only as a player-visible result. If it is cut, the "Everything else" row stays and the line moves to R3 (Ledger-world section 5 point 1).
4. Roadmap says "one full CI per integration run"; it is yours (no task). Also yours: refreshing `scripts/test-timings.json` after merge, regenerating the golden file under Node 22 (R2-P11 prepares it), and tuning `PROBE_ACTIONS` (R2-L5) if a shard passes 12 minutes.
5. The Kernel rebase accepts three upward edges (section 4). If you would rather not, the alternative is a one-row change to the layer table in R2-K3 (`business/util.ts` and `business/family-share-state.ts` into the world layer) and `nation/rates.ts` into L2.

## 10. Lead decisions on the planners' open questions (2026-10-22)

These close every open question the five plans raised. Implementers follow them; anything else unclear: follow the code and the plan's intent and say so in the task report.

Ledger and world:
1. R2-L19 (cash walk without a residual) stays in R2: it is the player-visible "exact cash walk".
2. Negative inflation: keep the economy unchanged and declare `mint:revaluation` (capped) so conservation stays exact.
3. Bond par erodes with the deflator like cash (the engine stores purchasing power).
4. `why` stays optional; it becomes required only if R2-L12 leaves zero unreasoned calls. Survivors are listed in docs/LEDGER.md.
5. Spread probe scope as planned: markets (R2-L13) and same-year house flips (R2-L6) asserted; goods and vehicles measured; older-house offers wait for A.K4.
6. The plan's caps and budgets are accepted as written (lending 2.5e9, immigrants 5e8, revaluation and burns 1e12, SPREADS markets 0.001 sellers 0.03 retail 0.10, TRANSACTION_TAX_PER_LEVEL 0.001, WORLD_BUDGET 25,000 nodes and 450,000 bytes). If a probe shows one is wrong, change it with the measured reason.
7. `yearlyWorld` runs last in R2 (it only indexes); Kernel adds the settle phase; W1 to W6 come later.
8. Person refs are `person:<id>` until R4 brings `sid`.
9. A tycoon with more than 20 companies indexes the 20 most valuable as named firms; the rest count as pooled.

Kernel:
10. Keep today's yearly order exactly (parity). Moving careers after firms is a later, deliberate re-record, not R2.
11. The settle phase for W7 at the end plus an early world phase are accepted.
12. Built-ins self-register (special.ts, manage.ts sections); extensions add one line to modules/index.ts. That is what "a track adds one line" means.
13. `ModuleDef.lod` and `.budget` stay loose reserved records for K.6.
14. `seeded` moves to src/game/rng.ts (Kernel is right; wave 0's note 1.7.6 is superseded).
15. The measured 14 import cuts (147 cycle modules to 90) replace "about 40 edges".
16. test/korean-cash.test.ts may switch from the YEARLY_HOOKS splice to `withYearly` with its assertions untouched.
17. The three digest vocabularies are not unified in R2 (follow-up after R2).

Save:
18. No save v3 kill-switch flag: dual-read is the safety net.
19. `ModuleDef.slices` is `readonly string[]` of slice keys; `world.<name>` is a dynamic sub-slice.
20. The heavy v4.1.1 fixture shrinks to 20 years and 4 companies (about 90 KB).
21. The mobile factor check (desktop ms times the printed calibration ratio) is accepted until a real device run exists.
22. Platform's golden file is regenerated after Save merges (R2-P11).

Platform:
23. Leftover GameState fields route as planned; the text slice also holds cache-class flags, notes, memories and the obituary.
24. The deep golden plan runs nightly only; pull requests check the pr plan.
25. K.7b may run about 700 lines over its 1,500; trim only if a task runs long.
26. Stream isolation stays in the fast tier while it is under about 20 s.
27. R2-P3 owns replay, reload and fork identity (RF5) for the whole state.
28. The text stream API is what wave 0 shipped in src/game/kernel/streams.ts and src/game/text/draw.ts (textUnit, textRand): read it, do not assume.

Process:
29. The four tracks branch from release/v5.0.0 at the rebaseline commit (361249e). The wave 0 CI fix-up (test files only) lands on release/v5.0.0 while the tracks run; each track merges release/v5.0.0 before its final check. A test failing on a track branch that is listed in moved-seeds.md as pending belongs to the lead's fix-up, not to the track.
30. Machine limits: at most 6 test or tsc runs at once (wt/bin/vt and wt/bin/tc enforce it), one build at a time (wt/bin/vb).
31. Floats across machines: Math.log, Math.exp and Math.pow differ in the last bit between Apple arm64 and Linux x64 (about 1 call in 130 for log, same V8), and Math.pow differs between Node 22 and 24. Any digest, golden or fixture that hashes game state must round non-integer numbers to 9 significant digits before hashing (as test/r2-parity-kit.ts PARITY_DIGITS does) and keep integers exact. The golden kit (R2-P1, R2-P2, R2-P11) adopts the same rule; record goldens with wt/bin/vt22.
32. The local gh token cannot push changes under .github/workflows (no workflow scope). R2-P6's nightly.yml and any ci.yml edit wait on the lead: commit them, and if the push is refused, report it instead of working around it.
