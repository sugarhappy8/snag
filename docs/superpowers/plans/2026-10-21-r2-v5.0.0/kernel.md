# R2 plan, Kernel track: the module registry, the bus and the layering ratchet (track `kernel`)

Base: `release/v5.0.0` after wave 0 (the E.T3 codemod, the one seed rebaseline, `src/game/kernel/streams.ts`, `test/seed-kit.ts`) has merged. Code read at v4.1.1 (`main` a65349a, worktree `/Users/saeed/projects/anotherlife/wt/r2-release`); nothing was edited except this file. Every path marked "modify" exists today; "create" paths do not. All text below uses plain hyphens (no U+2014, no U+2013).

## 1. Track summary

**Items covered (13 tasks).** K.3 the module registry and the bus (R2-K1 registry, ports and the fact type; R2-K2 the bus; R2-K7 the bounded fact store; R2-K8 the parity recorder; R2-K9 aging; R2-K10 special; R2-K11 menus; R2-K12 manage). K.2a the layering test and the cycle ratchet (R2-K3 layers and the cross-directory cycle rule; R2-K4 domain contracts and eager reads; R2-K5 and R2-K6 the 14 import cuts). R2-K13 closes the track (`docs/KERNEL.md`, the acceptance sweep).

**Not in this track.** `kernel/streams.ts` (wave 0) and `kernel/ids.ts`, `kernel/ledger.ts`, `world/` (Ledger-world, A.K1 and A.K2) are consumed, not planned. `defineSlice` and the slice list (Save, K.5), `test/golden-kit.ts` (Platform, K.7b) and the LOD framework and budget meter (Ledger-world, K.6) are other tracks'; this track only reserves the `slices`, `lod` and `budget` fields on `ModuleDef` so they can fill them. The 59-module `business/` cycle and the other 31 modules still in cycles after this release are K.2 phase 2 (R3 and later).

**Convention for line counts.** As in the R1 Platform plan, "source" is `src/` plus guard and kit code under `test/` and `scripts/`; "tests" are `*.test.ts` files. Fixtures and baselines are data and are counted separately.

**What I measured** (all on this worktree, 2026-10-21, with throwaway scripts in the scratchpad that use the same esbuild method as `test/arch-kit.ts` and the lexer of `scripts/voice/lexer.mjs`; the tasks regenerate every number with the real kits, so these are expectations, not pins):

| Fact | Value | How |
|---|---|---|
| Yearly hooks in `aging.ts` | 35 (lines 45 to 90), run by one loop at lines 122 to 128 | `grep -c "^  \['" src/game/aging.ts` |
| Yearly hooks in `special.ts` | 13 (lines 29 to 43), run by `yearlySpecial` at lines 46 to 51 | read |
| Modules and edges in the import graph | 702 modules, 4,805 runtime edges | esbuild metafile |
| Cycle components (the R1 baseline `test/architecture-baseline.json`) | 85, 30, 19, 7, 6 = 147 modules; the baseline file still matches the graph | `cycleComponents` |
| Cross-directory edges inside those cycles | 72 (37 in the 85-module cycle, 18 in the 30, 17 in the 19) | edges whose two files have different `dirname` |
| Cuts that remove all 72 from cycles | 14 (listed in R2-K5 and R2-K6); result 59, 8, 7, 6, 4, 2, 2, 2 = 90 modules, zero cross-directory cycle edges | exhaustive and greedy search over the graph, then the 14-edge set re-run |
| Why 14 and not "about 40" | The digest counted the cross-directory edges that touch the cycle (37 for the 85-module one). Most stop being cycle edges once a few back-edges are cut: `underworld.ts -> business/economy.ts` alone frees `effects`, `events/helpers`, `events/era-late-kit` and `activities/pastimes` from the 85-module cycle and leaves `crime` and `underworld` as a 2-module cycle of their own. The plan cuts the 14 real back-edges and ratchets the other 58 to "never a cycle edge again" | search |
| Layer prototype (table in R2-K3) | 27 upward imports (14 from L1 to L3, 11 from L2 to L3, 2 from L3 to L4); `timeMachine.ts` belongs in L0 (it imports only `core.ts`, 33 modules import it) | script |
| Cross-domain imports between L3 domains | 576 imports in 67 domain pairs (largest: `business` to `life` 56, `special` to `life` 48, `events` to `life` 36) | script |
| Eager reads (a module-level `const X = importedValue` from above L1) | about 159 statements in 108 files; 25 of them in 17 files that sit in a cycle (the real load-order hazard: `special.ts` `YEARLY`, `computer/dev-learn.ts`, `special/kit/careers.ts` `CAREER_SIMS`) | token scan |

**Line budget.** About 3,900 source lines against the roadmap's 4,200 (K.3 3,000 and K.2a 1,200) and about 2,590 test lines, plus data: `test/layers-baseline.json` (about 330 lines), `test/fixtures/kernel-parity.json` (about 450 lines) and `docs/KERNEL.md` (about 140). The test total is under the usual 1.14 ratio on purpose: the proof of K.3 is mostly the parity fixture and the ratchets (data), not extra test code.

| Task | Item | Source | Tests |
|---|---|---|---|
| R2-K1 | K.3 | 405 | 420 |
| R2-K2 | K.3 | 240 | 330 |
| R2-K3 | K.2a | 380 | 300 |
| R2-K4 | K.2a | 470 | 340 |
| R2-K5 | K.2a | 330 | 150 |
| R2-K6 | K.2a | 210 | 110 |
| R2-K7 | K.3 | 200 | 260 |
| R2-K8 | K.3 | 330 | 220 |
| R2-K9 | K.3 | 330 | 90 |
| R2-K10 | K.3 | 220 | 80 |
| R2-K11 | K.3 | 380 | 90 |
| R2-K12 | K.3 | 330 | 120 |
| R2-K13 | K.3 and K.2a | 60 | 80 |
| Total | | 3,885 | 2,590 |

**Acceptance criteria owned, and the test that proves each.**

| Criterion (lead's list) | Proven by | Task |
|---|---|---|
| The converted yearly order is identical: same hooks, same order, same JSON after N seeded years against the pre-change code | `test/kernel-parity.test.ts` against `test/fixtures/kernel-parity.json`, recorded on the pre-change code in R2-K8 and unchanged by R2-K9 to R2-K12 (only the accessor bodies in `test/parity-kit.ts` change) | K8, K9, K10 |
| Menus, special and manage produce the same trees (id paths) | the same test: `menus` digests (four canned lives through `walkTree`) and `views` digests (33 industries and 5 variants through `businessView`) | K8, K10, K11, K12 |
| The cycle ratchet still passes and the cycle set shrinks | `test/architecture.test.ts` with the shrunk and split baseline (at most 90 modules, 8 components); `test/layers.test.ts` rule (e): no cycle edge crosses a directory | K5, K6 |
| The layer ratchet fails on a synthetic violation | `test/layers.test.ts` and `test/layers-domains.test.ts`: synthetic graphs and token fixtures for rules (b), (c), (d), (e) | K3, K4 |
| No load-order crash: each hub entered in a fresh import | `test/hub-entry.test.ts` (about 24 hubs, fresh module registry each, no `undefined` export, every port bound after entering through `aging` and `menus`); the three existing tests in `test/wave-insider.test.ts` (lines 30 to 47) stay | K5, K6, K7, K9 |
| The bus is synchronous, bounded and deterministic (handlers sorted by id) | `test/kernel-bus.test.ts`, `test/kernel-registry.test.ts`, `test/world-facts.test.ts` | K1, K2, K7 |

**Hot files and who touches them** (every edit is additive and sits in its own hunk, or is a move that leaves a re-export behind):

| File | Touched by | Note |
|---|---|---|
| `src/game/aging.ts` (138 lines) | R2-K9 only | Ledger-world merges first: R2-L3 rewrites the inflation line (119) and R2-L17 adds `['world', yearlyWorld]` after `milestones`. K9 converts whatever is in `YEARLY_HOOKS` at that moment (36 entries then, `world` in the new phase `settle`); it lists the names it found in its commit message. |
| `src/game/special.ts` (136 lines) | R2-K8 (one word at line 29: `YEARLY` becomes `export const SPECIAL_YEARLY`), R2-K10 (conversion; K10 removes the export) | |
| `src/game/menus.ts` (148 lines) | R2-K11 only | children bodies at lines 53 to 66, 69 to 78 and 110 to 148; lines 36 to 44 (the `ASSET_KIND_VIEWS` assignments) stay |
| `src/game/business/manage.ts` (2,291 lines) | R2-K12 only | `businessView` lines 2230 to 2284 plus one registration block at the end; other hunks (`moneyNodes` 1547, `ceoNodes` 1656) belong to Ledger-world's money migration |
| `src/game/computer.ts` | R2-K5 | lines 12 to 41 move to `computer/access.ts` and come back as one re-export line |
| `src/game/assets.ts`, `src/game/rng.ts` | R2-K5 | `assets.ts` lines 136 to 180 move to the end of `rng.ts` (additive there); the `assets.ts` line 54 import swaps `nextRandom` for `seeded`; one re-export |
| `src/game/business/economy.ts` | R2-K5 | one import near line 42, `localPay` (lines 92 to 103) becomes an import plus `export { localPay }`, one `revalueCompany.use` after line 995 |
| `src/game/underworld.ts` | R2-K5 | line 9 and line 133 |
| `src/game/careers.ts` | R2-K6 | one import and one `ordinaryJobs.use(...)` line after `hireForJob` (line 806 starts it) |
| `src/game/activities/immigration-move.ts`, `src/game/nation/consequences.ts`, `src/game/special/model-exit.ts` | R2-K6 | import lines (immigration-move: one bind line after `relocate`, which starts at line 154; consequences lines 8 and 83; model-exit lines 10, 108, 159 to 161, 181 to 183) |
| `src/game/computer/dev-common.ts:3`, `dev-learn.ts:5`, `dev.ts:13`, `money-common.ts:6`, `online.ts:8`, `dev-state.ts:10`, `dev-venture.ts:13`, `dev-projects.ts:12`, `special/gamedev-core.ts:9`, `special/gamedev-make.ts`, `business/ai-bench.ts:6`, `business/competition-roster.ts:12` | R2-K5 | one import line each (plus the two uses named in R2-K5) |
| `src/game/types.ts` | nobody (Ledger-world's `WorldState` has an index signature, so the `facts` shard needs no edit) | |
| `test/architecture-baseline.json`, `test/arch-kit.ts`, `test/architecture.test.ts` | R2-K5 (shrink), R2-K6 (split, `UPDATE_ARCH_BASELINE=split`), R2-K9 (one hint string) | R1 files; the new code only adds |
| `test/korean-cash.test.ts`, `hedge-year`, `tech-waves-wiring`, `fuzz-regressions`, `series-life`, `dividend-wiring`, `release-182`, `advisors-year` (all `.test.ts`), and Ledger-world's `world-budget.test.ts` | R2-K9 | mechanism only (`YEARLY_HOOKS` splices become `withAging` and `agingNames` from `test/kernel-kit.ts`), assertions untouched; the cross-check found the seven files, plus Ledger-world's `world-budget.test.ts`, that the first draft missed |
| `src/game/advisors/year.ts:3`, `business/nepo.ts:14`, `events/wealth.ts:7` | R2-K9 | comment text only (they name `aging.ts YEARLY_HOOKS`) |
| `src/game/modules/index.ts` | created by R2-K1; K7, K9 and K11 each add lines | R3 and later tracks add one line each |

**Order and schedule** (the machine runs at most 3 test-running agents at once):

1. R2-K1 and R2-K3 first, in parallel (no hot files; K1 needs only wave 0). Then R2-K2 (needs K1) and R2-K4 (needs K3).
2. R2-K5 then R2-K6 once K1 and K4 are merged. They edit import lines in business, computer, special and careers files; they do not need Ledger-world, but rebase before starting because Ledger-world's wrapper migration edits money lines in the same files.
3. After the lead has merged Ledger-world into `release/v5.0.0` and the Kernel branch has rebased on it: R2-K7 and R2-K8 in parallel, then R2-K9, then R2-K10, R2-K11 and R2-K12 in parallel (each needs K9 and K8), then R2-K13.
4. The parity fixture (K8) is recorded on the rebased head, after Ledger-world and before any conversion. That is why K8 waits.
5. The layer baselines (K3, K4, K5, K6) are first generated on the Kernel branch; at the rebase onto Ledger-world, `UPDATE_LAYER_BASELINE=rebase` (R2-K3) accepts what Ledger-world added, once, with the additions listed in the commit message.

**Lead actions** (none can be done by an implementer):

1. Merge Ledger-world into `release/v5.0.0` before R2-K7 and R2-K8 start, then tell the Kernel agent to rebase `claude/r2-kernel`. If Ledger-world is late, R2-K1 to R2-K6 can all finish first; nothing else in this track depends on it.
2. Add `test/hub-entry.test.ts` and `test/kernel-parity.test.ts` to `scripts/test-timings.json` at the next timing refresh (each takes about 60 s and 45 s on a free machine; they weigh the 5 s default until then).
3. Note, no action needed now: this track writes no canonical-JSON or hash code. Lives are digested with wave 0's `parityDigests` (`test/r2-parity-kit.ts`), menu and view text with `fnv1a` from `src/game/text/hash.ts`. Platform's `test/golden-kit.ts` (R2-P1) has its own `canonicalJson` and `fnv`; see open question 8.
4. Ask the Save planner to cross-check `registeredSlices()` against the `defineSlice` keys in one test (the registry exports the list; the two sets must be equal once Save lands).
5. At release: no flag flips and no seeded test moves from this track. If `test/kernel-parity.test.ts` moves for any reason in a later merge, the fix is re-recording with `RECORD_KERNEL_PARITY=1` and the reason in the commit message, never an edit to the expected data by hand.

## 2. Cross-track contracts

**Provided by this track (other tracks may rely on these exact names):**

| Provided | By | Used by |
|---|---|---|
| `src/game/kernel/registry.ts`: `registerModule(def: ModuleDef): void`, `registerModules(defs: readonly ModuleDef[]): void`, `ModuleDef`, `YearlyEntry`, `MenuEntry`, `HandlerEntry`, `Layer`, `YearlySeam`, `YEARLY_PHASES`, `yearlyEntries(seam)`, `menuEntries(path)`, `collectMenu(path, g, a?, ctx?)`, `handlersFor(kind)`, `registeredFacts()`, `registeredSlices()`, `moduleIds()`, `getModule(id)`, `withYearly(seam, entries, fn)` | R2-K1 | every R3 to R11 track (one line in `modules/index.ts`); Save (K.5, `registeredSlices()` and `ModuleDef.slices` in its S12 guard); Ledger-world K.6 (the reserved `lod` and `budget` fields) |
| `src/game/kernel/fact.ts`: `Fact`, `FACT_LIMITS`, `normalizeFact(raw)` | R2-K1 | R2-K2, R2-K7, R5 detectors |
| `src/game/kernel/ports.ts`: `definePort`, `portStatus()` | R2-K1 | the four contract files below; R3 and later domains |
| `src/game/kernel/bus.ts`: `emit(g, fact)`, `setBusGuard`, `busStats`, `resetBusStats`, `BusGuard` | R2-K2 | R3 and later world steps, R5 news detectors |
| `src/game/world/facts.ts`: `readFacts(g)`, `recordFact(g, fact)`, `normalizeFacts`, `FactsShard`, `FACT_CAP`, `FACTS_PER_KIND_YEAR`, `factsModule` (registers the `facts` shard) | R2-K7 | R5 (E.N1 detectors read `readFacts`) |
| `src/game/modules/index.ts`: `MODULES` (sorted, one module per line) | R2-K1, K7, K9, K11 | every later track adds its line here and nowhere else |
| `src/game/rng.ts`: `seeded(key): SRng`, `SRng` (moved verbatim from `assets.ts`; `assets.ts` re-exports; `hashString` stays private) | R2-K5 | any module that needs a keyed, draw-free RNG without importing `assets.ts` (a bare `seeded` import from `./assets` still works) |
| Contracts (rule c): `src/game/business/contract.ts` `revalueCompany`; `src/game/computer/contract.ts` `gameMakingMenu`; `src/game/activities/contract.ts` `relocatePlayer`; `src/game/workplace/contract.ts` `ordinaryJobs` | R2-K5, R2-K6 | the cuts; the pattern for every later cross-domain call |
| `test/layer-kit.ts`, `test/layers-baseline.json`, `UPDATE_LAYER_BASELINE=1` | R2-K3, K4 | every track: its new modules must satisfy rules (b) to (e) or fail CI |
| `test/kernel-kit.ts`: `loadModules`, `ownSliceGuard`, `withGuard` | R2-K2 | fuzz-kit users (`setBusGuard(ownSliceGuard())` in a walk), every module test |
| `test/parity-kit.ts`, `test/fixtures/kernel-parity.json`, `RECORD_KERNEL_PARITY=1` | R2-K8 | any later release that legitimately changes the yearly order, a menu tree or a company view |
| `docs/KERNEL.md` | R2-K13 | every R3 and later track (replaces appends to `docs/ARCHITECTURE.md`) |

**The one yearly order (design 14.5), pinned.** `YEARLY_PHASES.aging` in sort order. Today's 35 hooks keep today's order inside "legacy" phases; new phases sit where a new module's reads allow. The clock and the economy step (`aging.ts` lines 99 to 119: `settleIncomeTax`, `ensureEconomy`, the age and year bump, `yearlyEconomy`, the inflation divide) stay in `ageUp` before the loop; they are table step 1.

| Phase | Table step | Today's occupants (name, order) |
|---|---|---|
| `geopolitics` | 2 Geopolitics step | none |
| `world` | 3 World step W1 to W6 (demography, labor, firms, housing, government, prices; R4 and R10 fill it) | none |
| `frontier` | 4 Frontier and rival ledgers | none |
| `society` | 5 Society step | none |
| `life` | legacy | history 10, digest 20, household 30, relationships 40, sharedProjects 50, givingFund 60, background 70, royalty 80, royalCareers 90, health 100, education 110, professions 120 |
| `careers` | 7 Careers | career 10, special 20 |
| `government` | legacy | nation 10 |
| `firms` | 6 Firms and shows | workshop 10, corruption 20, business 30, techWaves 40 |
| `money` | legacy | development 10, investments 20, hedge 30, shops 40, computer 50, finance 60, wealth 70, familyUse 80, nepo 90, willFeuds 100 |
| `assets` | legacy | immigration 10, assets 20, crime 30, underworld 40 |
| `advisors` | legacy | advisors 10 |
| `close` | legacy | milestones 10 |
| `settle` | W7: promotion, demotion, the ledger and world invariant check | none today; Ledger-world's `yearlyWorld` (R2-L17) lands here, order 10: it must run after every module that books money (`ledger-world.md` section 2, rule 5) |
| `news` | 8 News detectors | none |

Step 9 (`closeYear`) is store-level and is not a phase. Two honest notes: (1) today the careers run before the firms (steps 7 and 6 of the table are swapped); parity forbids moving them, so a careers module that needs this year's company books reads last year's rows, as the career code does now; (2) a module reads only the output of earlier phases for the same year. `YEARLY_PHASES.special` is `service` (military 10), `careers` (actor 10, music 20, sports 30, gamedev 40, author 50, model 60, politics 70, astronaut 80, careers2 90, hustler 100) and `public` (social 10, fame 20). Orders are multiples of 10 so a track can insert between two.

**Menu slots** (the `path` of a `MenuEntry`; phases are always `head`, `main`, `tail`, default `main`): `assets.money`, `assets.tail`, `shopping.stores`, `shopping.lifestyle`, `activities.items`, `special.careers`, `special.jobs`, and for one company `business.view.top`, `business.view.run`, `business.view.money`, `business.view.lead`, `business.view.exit`. A slot is just a name matching `/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/`; a track may introduce a new one without editing the registry.

**Bus rules.** Facts are discrete events (a bankruptcy, a layoff round); money flows go through the ledger, never through a fact. `emit` is called only from yearly steps and from actions, never from a menu, a hint or a view (the deep-freeze purity walk in `test/fuzz-kit.ts` throws on a write, so a violation is caught). One fact is delivered to the handlers of its exact kind sorted by module id, then to the `'*'` handlers sorted by module id; a fact emitted by a handler waits in a FIFO and is delivered after the current handler returns; at most 64 deliveries per top-level `emit`. A handler declares the one `slice` it writes; one slice has one owning module (`registerModule` throws on a second owner).

**Relied on by this track:**

- Wave 0: `src/game/kernel/` exists (streams.ts), the E.T3 codemod and the rebaseline have landed (the parity fixture is recorded after them, so the recorded digests are post-rebaseline), `test/seed-kit.ts`. This track draws no random number; the parity test pins seeds on purpose (a golden digest has to), and says so in its header comment.
- Ledger-world (merged first; names from `ledger-world.md` section 2): `src/game/world/state.ts` exports `ensureWorld(g): WorldState`, `readWorld(g)`, `worldShard<T>(g, name): Readonly<T> | undefined` and `registerShard(name, { normalize })`; `WorldState` has an index signature (`[other: string]: unknown`), so a new shard needs no `types.ts` edit; `normalizeWorld` drops a shard nobody registered, so R2-K7 registers `facts` at module load; there is no `src/game/world/index.ts` (it would shadow `./world`, `world.ts`). Ledger-world also adds `['world', yearlyWorld]` after `milestones` in `YEARLY_HOOKS` (R2-L17); R2-K9 maps it to phase `settle`.
- Ledger-world's and Save's hook entries in `YEARLY_HOOKS`: R2-K9 converts them by name.
- R1 files: `test/arch-kit.ts` (`readImportGraph`, `cycleComponents`, `compareToBaseline`, `shrinkBaseline`, `Graph`), `test/architecture.test.ts`, `test/scan-kit.ts` (`loadSources`, `toSource`, token helpers over `scripts/voice/lexer.mjs`), `test/nav-kit.ts` (`navState`, `walkTree`, `canonical`, `NAV_OFF`), `test/fuzz-kit.ts` (`deepFreeze`), `src/game/flags.ts` (`resetFlags`, `withFlags`), and the kits `test/hedge-kit.ts` (`rich`, `company`), `test/own-listing-kit.ts` (`founder`, `listed`, `listedGroup`), `test/sector-kit.ts` (`managedDesk`), `test/deeptech-kit.ts` (`adultIn`, `found`).

---

## 3. Tasks

### R2-K1 K.3 (a): the registry, the fact type and ports

**Goal.** One L0 module that holds the sorted yearly lists, menu slots and bus handlers, the plain fact type, and the port facility the cuts of R2-K5 and R2-K6 need. Nothing is registered yet.

**Items covered.** K.3 (registry), K.2a (ports, the "contract" half of rule c).

**Files.**
- Create: `src/game/kernel/registry.ts`, `src/game/kernel/fact.ts`, `src/game/kernel/ports.ts`, `src/game/modules/index.ts`, `test/kernel-registry.test.ts`, `test/kernel-ports.test.ts`.
- Modify: none. `src/game/kernel/` already exists from wave 0 (`streams.ts`); the new files import only `../types`, `../rng` and other kernel files, plus type-only imports.

**Interfaces.**

```ts
// src/game/kernel/fact.ts  (imports nothing)
export interface Fact { k: string; y: number; c?: string; a?: string; v?: number; s?: number }
// k kind (dotted lowercase, at most 40 chars), y year, c subject (an EntityRef 'kind:key' or a country id), a other party,
// v magnitude (finite, clamped to +-1e15), s severity (integer 0 to 100)
export const FACT_LIMITS: { readonly kind: 40; readonly ref: 40; readonly magnitude: 1e15; readonly severity: 100; readonly cascade: 64 }
export function normalizeFact(raw: unknown): Fact | null   // null for a non-object, a bad kind, a non-finite or non-integer year; trims, clamps, drops bad optional fields
```

```ts
// src/game/kernel/registry.ts
import type { Asset, GameState, MenuNode } from '../types'
import type { Fact } from './fact'
export type Layer = 0 | 1 | 2 | 3 | 4
export type YearlySeam = 'aging' | 'special'
export const YEARLY_PHASES: {
  readonly aging: readonly ['geopolitics', 'world', 'frontier', 'society', 'life', 'careers', 'government', 'firms', 'money', 'assets', 'advisors', 'close', 'settle', 'news']
  readonly special: readonly ['service', 'careers', 'public']
}
export const MENU_PHASES: readonly ['head', 'main', 'tail']
export interface YearlyEntry { seam: YearlySeam; phase: string; order: number; run: (g: GameState) => void }
export interface MenuEntry { path: string; phase?: string; order: number; build: (g: GameState, a?: Asset, ctx?: unknown) => MenuNode[] }
export interface HandlerEntry { kind: string; slice: string; run: (g: GameState, fact: Fact) => void }   // kind may be '*'
export interface ModuleDef {
  id: string                                  // /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, unique
  layer: Layer
  slices?: readonly string[]                  // saved slice keys this module owns; one owner per key
  yearly?: readonly YearlyEntry[]
  menus?: readonly MenuEntry[]
  handles?: readonly HandlerEntry[]
  facts?: readonly string[]                   // fact kinds this module may emit
  lod?: Readonly<Record<string, unknown>>     // reserved for K.6
  budget?: { readonly yearMs?: number; readonly stateNodes?: number }   // reserved for K.6
}
export type Ordered<T> = T & { id: string }   // id is the module id, or `${moduleId}#${i}` when a module has several entries in one seam or slot
export function registerModule(def: ModuleDef): void        // throws on a duplicate id or slice, a bad id, layer, phase or order (integer 0 to 9999)
export function registerModules(defs: readonly ModuleDef[]): void   // sorts by id, then registerModule each
export function yearlyEntries(seam: YearlySeam): readonly Ordered<YearlyEntry>[]   // sorted by (phase index, order, id); cached, frozen, rebuilt after a registration
export function menuEntries(path: string): readonly Ordered<MenuEntry>[]           // sorted by (phase index, order, id)
export function collectMenu(path: string, g: GameState, a?: Asset, ctx?: unknown): MenuNode[]   // menuEntries(path).flatMap(e => e.build(g, a, ctx))
export function handlersFor(kind: string): readonly { moduleId: string; entry: HandlerEntry }[]  // exact kind first, then '*', each sorted by module id
export function registeredFacts(): ReadonlySet<string>
export function registeredSlices(): readonly string[]                               // sorted
export function moduleIds(): readonly string[]                                      // sorted
export function getModule(id: string): ModuleDef | undefined
export function withYearly<T>(seam: YearlySeam, entries: readonly YearlyEntry[], fn: () => T): T   // test seam: replaces the list for the call, restores in finally, nests
```

```ts
// src/game/kernel/ports.ts  (imports nothing)
export type Port<A extends unknown[], R> = ((...args: A) => R) & { use(fn: (...args: A) => R): void; readonly portName: string; readonly bound: boolean }
export function definePort<A extends unknown[], R>(name: string, fallback: (...args: A) => R): Port<A, R>   // name /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/; a second definePort with the same name throws
export function portStatus(): { name: string; bound: boolean }[]   // sorted by name
```

`use` binds once; binding the same function again is fine; binding a different function throws `port <name> is already bound`. Calling an unbound port runs `fallback` (so a missing provider degrades to today's "feature absent" behaviour instead of crashing a year step), and `portStatus()` is what `test/hub-entry.test.ts` reads to prove every port is bound after a real entry.

```ts
// src/game/modules/index.ts  (layer L4, assembly; the file every later track edits by adding one line)
import { registerModules, type ModuleDef } from '../kernel/registry'
/** Sorted by id; one module per line. test/kernel-registry.test.ts fails on an unsorted list. */
export const MODULES: readonly ModuleDef[] = []
registerModules(MODULES)
```

**Cross-check note on names.** The lead's fixed list names `on(kind, handler)` for subscribing to facts. This task has no `on`: a handler is declared in `ModuleDef.handles` (`HandlerEntry`, found with `handlersFor(kind)`), because the bus needs the module id to sort deliveries and the slice to enforce "one owner, writes only its own slice". No R2 task calls `on`; the first consumers are the R5 detectors, which register with `handles`. If the lead wants the sugar anyway, it is `registerModule({ id, layer, handles: [{ kind, slice, run }] })` in one line.

**Behaviour.**
- Sorting is a pure function of the registered set: `(phase index in YEARLY_PHASES[seam] or MENU_PHASES, order, module id, index in module)`. Registration order never matters.
- `yearlyEntries` returns a frozen array and the same array until the next registration. A registration invalidates every cache.
- `registerModule` validates the whole def before it changes anything (no half-registered module after a throw).
- `normalizeFact`: `k` must match `/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/` and be at most `FACT_LIMITS.kind`; `y` must be a finite integer; `c` and `a` are kept only when non-empty strings of at most `FACT_LIMITS.ref` characters (cut, not rejected); `v` is dropped unless finite, else clamped to +-`FACT_LIMITS.magnitude` and rounded to 3 decimals; `s` is dropped unless finite, else rounded and clamped to 0 to `FACT_LIMITS.severity`.

**Steps (test first).**
1. Write `test/kernel-registry.test.ts` (first line `// ci: fast`) and `test/kernel-ports.test.ts`; run them: red (the modules do not exist).
   - Registry: (1) the same 6 modules registered in 3 shuffled orders give identical `yearlyEntries('aging')` ids; (2) an entry in a later phase with order 5 sorts after an entry in an earlier phase with order 900; (3) equal phase and order sort by module id; (4) throws: duplicate module id, duplicate slice across two modules, bad id, `layer: 7`, unknown phase for the seam (`'aging'` entry in phase `'service'`), `order: 1.5`, `order: -1`, `order: 10000`, `NaN`, a handler with an empty kind; a throw leaves the registry as it was; (5) entry ids: one yearly entry per seam gives the module id, two give `id#0` and `id#1`; (6) cache: a registration after a call shows up in the next call, and the earlier returned array is unchanged and frozen; (7) `withYearly` swaps, restores after a throw, and nests; (8) menus: `collectMenu` passes `(g, a, ctx)`, merges in `(phase, order, id)` order, default phase `main`, a bad slot name throws; (9) `handlersFor('company.failed')` lists the exact-kind handlers before the `'*'` ones, each sorted by module id; (10) `registeredFacts`, `registeredSlices` and `moduleIds` are sorted; (11) `src/game/modules/index.ts` `MODULES` ids are strictly ascending; (12) a text scan: every import specifier in `src/game/kernel/{registry,fact,ports}.ts` is `'../types'`, `'../rng'` or starts with `'./'`; (13) `normalizeFact` table: valid, string year, 1.5 year, bad kind, 41-char kind, 41-char ref cut, `v: NaN` dropped, `v: 1e30` clamped, `s: 250` clamped to 100, non-object.
   - Ports: unbound call returns the fallback result; `use` then call; same function twice is fine; a different function throws; `portStatus` sorted and shows bound; two `definePort` with one name throw; after `vi.resetModules()` a fresh import has no ports bound.
2. Implement the three kernel files and the `modules/index.ts` skeleton.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-registry.test.ts test/kernel-ports.test.ts test/architecture.test.ts`
   (`test/architecture.test.ts` proves the new files joined no import cycle: kernel files import only each other, and `modules/index.ts` is imported by nobody yet.)

**Acceptance proven.** Sort determinism, bounded caches, validation, and the port facility; the bus rule "handlers sorted by id" at the data level.

**Flag.** None. **Depends on.** Wave 0 only. **Size.** About 405 source lines (registry 230, fact 70, ports 80, index 25), about 420 test lines.

**Risks.** `ModuleDef` is the one shape every later track writes, so a missing field is expensive: `slices`, `lod`, `budget` and `facts` are present now (the last two reserved). `Ordered<T>` ids with `#i` make parity traces ambiguous if a module registers two entries in one seam; R2-K9 and R2-K10 register exactly one per seam per module.

---

### R2-K2 K.3 (b): the bus and the kernel test kit

**Goal.** A synchronous, bounded, deterministic `emit`, with a guard hook that lets a test prove a handler writes only its own slice, and a small test kit.

**Items covered.** K.3 (bus).

**Files.**
- Create: `src/game/kernel/bus.ts`, `test/kernel-kit.ts`, `test/kernel-bus.test.ts`.
- Modify: none.

**Interfaces.**

```ts
// src/game/kernel/bus.ts  (imports ../types (type), ./fact, ./registry)
import type { GameState } from '../types'
import { type Fact } from './fact'
export interface BusGuardInfo { moduleId: string; slice: string; kind: string }
/** Called before a handler runs; the returned function runs after it (a test checks the slice there). */
export type BusGuard = (info: BusGuardInfo, g: GameState) => () => void
export function emit(g: GameState, fact: Fact): boolean   // false when the fact is invalid or its kind is not declared by any module (counted as dropped); true when delivered
export function setBusGuard(guard: BusGuard | null): void
export function busStats(): { emitted: number; dropped: number; delivered: number; truncated: number }   // module-level counters, never saved, never read by the sim
export function resetBusStats(): void
```

```ts
// test/kernel-kit.ts
import type { BusGuard } from '../src/game/kernel/bus'
export function loadModules(): Promise<typeof import('../src/game/modules')>   // imports src/game/modules (registers MODULES)
export function ownSliceGuard(): BusGuard                   // before the handler: JSON.stringify of a structuredClone of g with the slice path removed; after: the same text must be equal, else throws Error naming module, slice and the first differing top-level key (no key sorting is needed: a handler that writes outside its slice changes the text)
export function withGuard<T>(fn: () => T): T                // setBusGuard(ownSliceGuard()) for the call, restores null in finally
```

**Behaviour of `emit(g, fact)`.**
1. `normalizeFact(fact)`; null counts `dropped` and returns false. A kind not in `registeredFacts()` counts `dropped` and returns false.
2. If a delivery is already running (`active` queue exists), push the fact onto it and return true: a handler that emits does not recurse, its fact is delivered after the current handler returns (FIFO).
3. Otherwise deliver: for each queued fact, for each `handlersFor(f.k)` in order, count `delivered`; when `delivered` exceeds `FACT_LIMITS.cascade` (64) clear the queue, count `truncated` and stop. If a guard is set, call it before the handler (`BusGuardInfo` from the module id, the entry's `slice` and the fact kind) and run its returned function after. A handler that throws propagates after `active` is reset in `finally`.
4. `emit` draws no random number, reads no clock and writes only what handlers write.
5. The slice path in a guard is a dotted path into the state (`world.facts`, `flags.textMem`); the guard compares everything else.

**Steps (test first).**
1. Write `test/kernel-kit.ts` and `test/kernel-bus.test.ts` (`// ci: fast`). Red first. Cases:
   - order: modules `b.x` and `a.x` both handle `company.failed`, plus a `'*'` handler in module `a.all`: delivery is `a.x`, `b.x`, `a.all`; registering them in the opposite order gives the same trace;
   - synchronous: a handler's write is visible on the line after `emit`;
   - cascade: handler A emits `b.second`, then B emits `b.third`; the delivery order is A, B-of-second, ...; a handler that re-emits itself stops at 64 deliveries with `truncated: 1` and the call returns normally;
   - dropped: unknown kind, `y: 1.5`, a non-object; `busStats()` counts match; `resetBusStats` zeroes them;
   - a throwing handler: the next `emit` still works (the `active` queue was reset);
   - determinism: 1,000 emits with a handler that appends to a local array leave `g.rng` unchanged (same number before and after);
   - purity: on a state passed through `deepFreeze` from `test/fuzz-kit.ts`, an `emit` that reaches a writing handler throws a TypeError (this is what makes a menu that emits fail the fuzz walk); a handler that reads only is fine;
   - the slice guard: a good handler (writes `flags.textMem` only, declared) passes under `withGuard`; a synthetic bad handler (declared `flags.textMem`, also writes `character.money`) throws with a message that contains the module id and `character`;
   - `loadModules()` imports `src/game/modules` once per module registry and returns the same module on a second call.
2. Implement `bus.ts` and the kit. Each test builds its registrations after `vi.resetModules()` and a dynamic import, so no registry leaks between cases.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-bus.test.ts test/kernel-registry.test.ts test/architecture.test.ts`

**Acceptance proven.** The bus is synchronous, bounded (64 deliveries, 400 later in K7) and deterministic (handlers sorted by module id, FIFO for nested facts); the slice rule has a machine check (`ownSliceGuard`).

**Flag.** None. **Depends on.** R2-K1. **Size.** About 240 source lines (bus 150, kit 90), about 330 test lines.

**Risks.** `ownSliceGuard` snapshots the whole state (a clone and a stringify of a 2 MB state cost tens of milliseconds a call), so it is for tests and the fuzz walk only; production never sets a guard. `busStats` is module-level mutable state: it must never feed a decision (a scan in the test file asserts that `src/` outside `kernel/bus.ts` does not import `busStats`).

---

### R2-K3 K.2a (a): layers, rule (b) and the cross-directory cycle rule (e)

**Goal.** `test/layers.test.ts`: every module in `src/` has a layer; an import that points upward fails unless it is in a baseline that can only shrink; no import cycle edge crosses a directory unless it is in a baseline that can only shrink.

**Items covered.** K.2a rules (b) and (e).

**Files.**
- Create: `test/layer-kit.ts`, `test/layers.test.ts`, `test/layers-baseline.json`.
- Modify: none. The kit imports `Graph`, `readImportGraph` and `cycleComponents` from `test/arch-kit.ts` (R1) and shares nothing else with it.

**Interfaces.**

```ts
// test/layer-kit.ts
import type { Graph } from './arch-kit'
export type LayerId = 0 | 1 | 2 | 3 | 4 | 5
export const LAYER_NAMES: readonly ['kernel', 'data', 'world', 'domains', 'assembly', 'ui']
export function layerOf(path: string): LayerId             // path is root-relative posix, 'src/game/core.ts'
export function upwardEdges(g: Graph): string[]            // 'from -> to' for every runtime import whose target layer is above the importer's, sorted
export function cycleDirEdges(g: Graph): string[]          // 'from -> to' for every edge inside a cycle component whose two files have different dirname, sorted
export interface LayerBaseline { v: 1; upward: string[]; cycleDirEdges: string[]; domains?: Record<string, number>; eager?: Record<string, string[]> }   // domains and eager are added by R2-K4
export interface LayerViolation { kind: 'new-upward' | 'new-cycle-dir' | 'stale-upward' | 'stale-cycle-dir' | 'kernel-upward'; edges: string[]; hint: string }
export function compareLayers(g: Graph, base: LayerBaseline): LayerViolation[]   // new edges first, then stale; 'kernel-upward' when any upward edge starts in L0 (never allowed, even if listed)
export function shrinkLayers(g: Graph, base: LayerBaseline): LayerBaseline        // drops stale entries, keeps the other sections as given, throws naming any edge not already listed
export function rebaseLayers(g: Graph, base: LayerBaseline): { baseline: LayerBaseline; added: string[] }   // growth allowed; `added` is what the commit message must list
```

**The layer table (the deliverable; `layerOf` applies these in order, first match wins).**

| Order | Layer | Matches |
|---|---|---|
| 1 | L5 ui | `src/ui/**`, `src/App.tsx`, `src/main.tsx`, `src/boot.ts`, `src/settings.ts` |
| 2 | L0 kernel | `src/game/kernel/**` and the root files `types`, `rng`, `core`, `scripts`, `talents`, `assetHooks`, `flags`, `world-flags`, `notice-weights`, `timeMachine` (all `.ts` in `src/game/`) |
| 3 | L4 assembly | `src/game/modules/**`, `src/game/hubs/**` and the root files `aging`, `menus`, `life`, `save`, `save-schema`, `save-backends`, `save-quarantine`, `save-hydrate`, `save-store`, `snapshot-codec`, `offline`, `birth-background`, `life-series`, `inbox`, `notice-policy` |
| 4 | L2 world | `src/game/economy/**`, `src/game/world/**`, `src/game/nation/state.ts`, `src/game/nation/effects.ts`, `src/game/nation/trade-policy.ts` |
| 5 | L1 data | `src/game/data/**`, `src/game/world.ts`, `src/game/history/**`, `src/game/text/**` |
| 6 | L3 domains | everything else under `src/game/` |

**Rebase mode.** The Kernel branch is built beside Ledger-world, which merges first and adds imports, modules and eager reads this branch never saw. After rebasing onto it, run `UPDATE_LAYER_BASELINE=rebase`: it writes the full current sets (growth allowed), prints each added entry by section, and the commit message lists them by file so the lead can review. It is for that one situation only; the normal `UPDATE_LAYER_BASELINE=1` still throws on any addition. `shrinkLayers` gains a sibling `rebaseLayers(g, base, reads?)` for this, covered by a test (growth only in this mode; the additions are returned for printing). A cycle that a merged track created is that track's bug (its branch has R1's cycle ratchet), so there is no rebase mode for `test/architecture-baseline.json`. **Expected additions at the Ledger-world rebase** (the cross-check read that plan's imports; the added list must hold these and nothing else, and no L0 file may appear in it): upward edges `src/game/nation/effects.ts -> src/game/nation/rates.ts` (R2-L13), `src/game/world/firms.ts -> src/game/business/util.ts` (R2-L14) and `src/game/world/holdings.ts -> src/game/business/family-share-state.ts` (R2-L15); no cross-directory cycle edge. Any other added edge is a Ledger-world bug: send it back, do not rebase it in.

**Steps (test first).**
1. Write `test/layers.test.ts` (`// ci: fast`) and the kit's pure parts. Red until the kit exists. Cases:
   - `layerOf` table: one assertion per row above and per example (`src/game/timeMachine.ts` is 0, `src/game/data/markets.ts` is 1, `src/game/economy/index.ts` is 2, `src/game/business/manage.ts` is 3, `src/game/aging.ts` is 4, `src/ui/store.ts` is 5, `src/game/modules/index.ts` is 4, `src/game/hubs/company.ts` is 4).
   - Synthetic graphs (small `Map`s, as `test/architecture.test.ts` does): an L3 module importing an L3 module is fine; L3 importing L1 is fine; L5 importing anything is fine; L3 importing an L4 module is `new-upward`; a baseline listing it passes; deleting the import makes it `stale-upward` and the hint names `UPDATE_LAYER_BASELINE=1`; an L0 module with any upward import is `kernel-upward` even when the baseline lists it (the synthetic violation the acceptance asks for).
   - Rule (e) synthetic: a two-module cycle `src/game/a/x.ts <-> src/game/b/y.ts` gives two `cycleDirEdges`; a two-module cycle inside one directory gives none; an edge between two directories that is not on a cycle gives none; baseline semantics as for upward.
   - `shrinkLayers` keeps the intersection, preserves order, throws on a new edge, does not mutate its input; `rebaseLayers` adds the new edge and returns it in the printed list.
   - Real `src`: `compareLayers(await readImportGraph(ROOT), baseline)` is `[]`; zero upward edges start in L0 (expect wave 0's `streams.ts` to import only `../types`, `../rng` and kernel files; if it does not, stop and report it); every `src/game/modules/**` file is imported only from L4 or L5 files (rule b already says it; this is a readable restatement); `UPDATE_LAYER_BASELINE=1` rewrites the file (shrink only; with no file yet it writes the first, as `test/architecture.test.ts` does).
2. Implement `test/layer-kit.ts`; generate the baseline: `UPDATE_LAYER_BASELINE=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/layers.test.ts`. Read the numbers it records (expectation from the prototype: 27 upward edges, 72 cycle-directory edges). If `upward` is above 150, the table is wrong: stop, look at the largest importer, and fix the table, not the baseline.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/layers.test.ts test/architecture.test.ts`

**Acceptance proven.** The layer ratchet fails on a synthetic violation; no new upward import; no new cross-directory cycle edge.

**Flag.** None. **Depends on.** Nothing (can start with wave 0 in place; reads the real graph). **Size.** About 380 source lines (kit 300, baseline data separate), about 300 test lines.

**Risks.** The table is judgment. The ratchet makes a wrong placement cheap to fix (move a row, regenerate, review the diff), but never edit the baseline by hand. `layerOf` is the contract R3 and later tracks code against: a new top-level directory under `src/game/` is L3 by default and needs a row only if it is not a domain.

---

### R2-K4 K.2a (b): domain contracts, eager reads and the shared update command

**Goal.** Rule (c): domains cross only through `contract.ts` files, ratcheted by domain-pair counts. Rule (d): no module-level `const X = importedValue` from above L1, ratcheted per file, with the cycle members called out as the real hazard.

**Items covered.** K.2a rules (c) and (d).

**Files.**
- Create: `test/layers-domains.test.ts`.
- Modify: `test/layer-kit.ts` (add the functions below), `test/layers-baseline.json` (new sections `domains` and `eager`, written by the update command).

**Interfaces (added to `test/layer-kit.ts`).**

```ts
import type { SourceFile } from './scan-kit'
export function domainOf(path: string, dirs: ReadonlySet<string>): string | null   // null unless layerOf(path) is 3. src/game/<dir>/... -> '<dir>'; a root file src/game/<name>.ts -> '<name>' when src/game/<name>/ exists (a hub), else 'life'
export function contractPath(path: string): boolean                                  // /(^|\/)contract\.tsx?$/
export function domainPairs(g: Graph): Record<string, number>                        // 'from->to' -> import count, L3 to L3 between different domains, imports of a contract file not counted
export interface EagerRead { file: string; names: string[]; hazard: boolean }       // hazard: the file sits in an import cycle
export function eagerReads(sources: readonly SourceFile[], g: Graph): EagerRead[]   // sorted by file; see the algorithm below
export function compareDomains(g: Graph, base: Record<string, number>): LayerViolation[]    // kinds extend: 'new-domain-pair' | 'more-domain-imports' | 'stale-domain-pair'
export function compareEager(reads: readonly EagerRead[], base: Record<string, string[]>): LayerViolation[]   // kinds extend: 'new-eager-read' | 'stale-eager-read'
// shrinkLayers now also shrinks domains (counts only go down, a pair at 0 disappears) and eager (names only leave); a new pair, a higher count or a new name throws
```

**The eager-read scan (token based, on `scripts/voice/lexer.mjs` through `test/scan-kit.ts`).** For each source file: (1) collect value imports: relative specifiers that resolve to a module in the graph, not `import type`, not a `type` specifier; map each local name to its target; keep names whose target `layerOf` is above 1. (2) Walk tokens at bracket depth 0 for `const`, `let` or `var` (not `declare`). (3) The initializer starts after the first `=` at depth 0 and ends at a `;` or at the first token on a new line at depth 0 that is not a continuation (the previous token is not an operator and the token is not `.`, `?`, `:`, `|`, `&`, `,`, `as`, `satisfies`); the source has no semicolons, so this is the ASI rule. (4) Lazy regions inside the initializer are skipped: a block after `=>`, an expression after `=>` up to the next `,` or closing bracket at its depth, a `function` body, and a method body (`)` followed by `{`). (5) Every identifier outside a lazy region that is an imported name from above L1, not after `.` or `?.`, not an object key (`name:` after `{` or `,`), not after `as` or `satisfies`, is a read. (6) A file in layer 4 or 5 that is in no import cycle is exempt (a file outside every cycle cannot see a half-initialised import; this exempts `src/game/modules/**`, `aging.ts`, `menus.ts` and the UI). Known limits, on purpose: no types, so a name used only as a type but imported without `type` after `as` is skipped by rule 5 and one used in other type positions would be a false read; the baseline absorbs today's.

**Steps (test first).**
1. Write `test/layers-domains.test.ts` (`// ci: fast`). Red first. Cases:
   - `domainOf`: `src/game/business/manage.ts` is `business`; `src/game/computer.ts` is `computer` (the `computer/` folder exists); `src/game/crime.ts` is `life`; `src/game/aging.ts` is null (L4); `src/game/data/markets.ts` is null (L1).
   - Rule (c) synthetic: an import from `src/game/a/x.ts` to `src/game/b/y.ts` is a `new-domain-pair` when not in the baseline; the same import to `src/game/b/contract.ts` is not counted; a count above the baseline is `more-domain-imports`; a count below is `stale-domain-pair` (the list may only shrink); imports into L0, L1 and L2 are never counted.
   - Rule (d) fixtures through `toSource`: flagged: `const X = IMPORTED`, `const X = [A, B]`, `const X = { k: IMPORTED }`, `export const X = IMPORTED_FN()`, a multi-line initializer, two consecutive consts with no semicolon (the second is judged on its own); not flagged: `const X = (g) => IMPORTED(g)`, `const X = () => { return IMPORTED }`, `const X = function () { return IMPORTED }`, `const o = { m() { return IMPORTED } }`, `const X = obj.IMPORTED`, `const X = { IMPORTED: 1 }`, `const X = y as IMPORTED`, `import type`, an import from an L1 module, an import with `type` specifier. A file in layer 4 and in no cycle is exempt; the same file inside a cycle is reported with `hazard: true`.
   - Real src: `compareDomains` and `compareEager` against the baseline are `[]`; the `hazard` count is at most 25 (a ceiling test, so a new hazard fails even if it was added to the baseline by hand); `eagerReads` completes in under 5 seconds (the lexer lexes all of `src/` in a fraction of a second).
2. Implement; regenerate: `UPDATE_LAYER_BASELINE=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/layers.test.ts test/layers-domains.test.ts` (one command updates every section; shrink-only, first run writes the two new sections). Expect about 576 imports in 67 pairs and about 159 eager statements in about 108 files minus the exempt L4 and L5 files.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/layers.test.ts test/layers-domains.test.ts test/scan-kit.test.ts`

**Acceptance proven.** Rules (c) and (d) fail on a synthetic violation; today's counts are the ceiling and can only fall.

**Flag.** None. **Depends on.** R2-K3. **Size.** About 470 source lines, about 340 test lines.

**Risks.** The scan is a heuristic, not a parser (the repo has no JS compiler API; TypeScript 7). It errs toward flagging, and a false positive costs one baseline line. The statement-end rule is the weakest part: the fixtures include the tricky shapes seen in `special.ts` (multi-line arrays of tuples), `menus.ts` (an object that spreads an imported const, line 54) and `aging.ts` (a typed array). A track that adds a legitimate eager read in a layer-3 file outside a cycle can add it to the baseline only by lowering something else; the message says so.

---

### R2-K5 K.2a (c): hub-entry tests and the 12 cuts of the 85-module cycle

**Goal.** Write the enter-through-each-hub test first (green on today's code), then cut the back-edges that hold `computer`, `special/gamedev`, `crime` and `underworld` inside the business cycle. After this task the 85-module cycle is the 59-module `business/` cycle plus two 2-module cycles (`crime` with `underworld`, `computer/money-options` with `money-stocks`), and the 19-module economy cycle shrinks to the 2-module `assets.ts` and `landlord.ts` cycle (cuts 11 and 12 were its keys): 147 modules in cycles become 108.

**Items covered.** K.2a (the first 12 of the 14 cuts), the enter-through-each-hub tests.

**Files.**
- Create: `test/hub-entry.test.ts`, `src/game/computer/access.ts`, `src/game/computer/contract.ts`, `src/game/data/local-pay.ts`, `src/game/business/contract.ts`.
- Modify: `src/game/rng.ts` (append `SRng`, a private `hashString` and `seeded`, moved from `assets.ts`), `src/game/computer.ts` (lines 12 to 41 move out; the menu code at lines 50 to 65 keeps using the helpers through one local import), `src/game/computer/dev-common.ts` (line 3), `dev-learn.ts` (line 5), `dev.ts` (line 13), `money-common.ts` (line 6), `online.ts` (line 8), `dev-state.ts` (line 10), `dev-venture.ts` (line 13 and the use at line 209), `dev-projects.ts` (line 12 and lines 165 to 166), `src/game/special/gamedev-core.ts` (line 9), `src/game/special/gamedev-make.ts` (a bind after line 1462, an import), `src/game/business/economy.ts` (import near line 42; `localPay` lines 92 to 103; a bind after `refreshValue`, which ends at line 995), `src/game/underworld.ts` (lines 9 and 133), `src/game/assets.ts` (lines 136 to 180 move out; the line 54 import loses `nextRandom`, which only `seeded` used, and gains `seeded`), `src/game/business/ai-bench.ts` (line 6), `src/game/business/competition-roster.ts` (line 12), `test/architecture-baseline.json`, `test/layers-baseline.json` (both through their update commands).

**The 12 cuts.** Each row is one edge removed from a cycle. "Move" means the code moves verbatim to the new file and the old file re-exports it, so the other importers do not change.

| # | Edge (from -> to) | Names | Technique |
|---|---|---|---|
| 1 to 5 | `computer/dev-common.ts:3`, `computer/dev-learn.ts:5`, `computer/dev.ts:13`, `computer/money-common.ts:6`, `computer/online.ts:8` -> `computer.ts` | `canUseComputer`, `computerLocked`, `ownsComputer` | Move `COMPUTER_NAME`, `isComputer`, `computerAsset`, `ownsComputer`, `computerLocked`, `canUseComputer` (computer.ts lines 12 to 41) to `computer/access.ts` (imports only `../types`). `computer.ts` adds `export { canUseComputer, computerAsset, computerLocked, isComputer, ownsComputer } from './computer/access'` and `import { computerAsset, computerLocked, ownsComputer } from './computer/access'` for its menu. The five children import `./access`. `test/consumer-brands.test.ts:162` imports `isComputer` from `../src/game/computer`: the re-export keeps it. |
| 6 | `computer/dev-state.ts:10` -> `business/economy.ts` | `localPay` | Move `localPay` (economy.ts lines 92 to 103, with its comment) to `data/local-pay.ts`, which imports `marketOf` from `./markets` and defines a private `clampN` with the body of `business/util.ts` lines 19 to 23. `business/economy.ts` imports it and adds `export { localPay }`; its six other importers (bank-model, board-ceo, nepo-roles, deeptech-found, fund-sim, staff) are unchanged. `dev-state.ts` imports from `../data/local-pay`. |
| 7 | `special/gamedev-core.ts:9` -> `business/economy.ts` | `localPay` | Import from `../data/local-pay`. |
| 8 | `computer/dev-venture.ts:13` -> `business/economy.ts` | `cycleOf` | `cycleOf` is `return economicCycle(g, countryId, year)` (economy.ts line 224 to 226). In `dev-venture.ts` import `economicCycle` from `../economy` and change line 209 to `economicCycle(g, v.countryId, g.year)`. Same function, same result. |
| 9 | `underworld.ts:9` -> `business/economy.ts` | `refreshValue`, `valuationOf` | Port. `business/contract.ts`: `export const revalueCompany = definePort('business.revalueCompany', (_a: Asset, _b: BizState): void => {})` (types only from `./state` and `../types`). `business/economy.ts` binds it right after `refreshValue`: `revalueCompany.use((a, b) => { b.valuation = valuationOf(b); refreshValue(a, b) })`. `underworld.ts` line 133 becomes `revalueCompany(a, b)`. |
| 10 | `computer/dev-projects.ts:12` -> `special/gamedev-make.ts` | `makeGamesMenu` | Port. `computer/contract.ts`: `export const gameMakingMenu = definePort('computer.gameMakingMenu', (): MenuGroup | null => null)`. `dev-projects.ts` lines 165 and 166 become `disabledReason: (g) => gameMakingMenu()?.disabledReason?.(g) ?? null` and `children: (g) => gameMakingMenu()?.children(g) ?? []`. `gamedev-make.ts` binds `gameMakingMenu.use(() => makeGamesMenu)` after line 1462 (the end of `makeGamesMenu`, which starts at 1386). |
| 11 | `business/ai-bench.ts:6` -> `assets.ts` | `seeded` | Move `SRng`, `hashString` (stays private) and `seeded` (assets.ts lines 136 to 180, the section comment included) to the end of `src/game/rng.ts`, which already defines `nextRandom` (line 5), the only thing `seeded` needs. `rng.ts` is L0 and outside the wave 0 world-RNG guard (that guard covers `kernel/**`, `world/**` and `modules/**`; `seeded` has methods named `chance` and `pick`, which a new `kernel/` file would trip). `assets.ts` imports `seeded` for its own uses and re-exports (`export { seeded }` and `export type { SRng }`). `ai-bench.ts` line 6 becomes `import { seeded } from '../rng'`. The other 54 `import { seeded } from './assets'` statements stay. Wave 0 leaves `seeded` where it is (`wave0.md` says the older seeded helpers "stay as they are"); if it moved anyway, `grep -n "export function seeded" src/game` and import from there. |
| 12 | `business/competition-roster.ts:12` -> `assets.ts` | `seeded`, `type SRng` | Import from `../rng`. |

Cuts 1 to 5 are counted as five edges because each child file is a separate import statement; 1 to 12 are the first 12 of the 14 import statements that must go (the other two are R2-K6).

**Rules for every cut.** (a) A move leaves a re-export, never a second copy. (b) No raw money call (`addMoney`, `earnIncome`, `spend`, `.money +=`, `.cash +=`) moves into a new file: the money ratchet (R1's `test/money-ratchet.json`, keyed by file, which Ledger-world's R2-L4 rewrites under the same names) fails on a new file with a raw call, which is why `relocate` (cut 13) is a port and not a move. (c) A port's provider binds at its own module load, with an arrow or a plain function declaration, never an eager read of a `const`. (d) No new string a player can read, so no voice change.

**Steps (test first).**
1. Write `test/hub-entry.test.ts` (not `// ci: fast`: it is a shard test). For each entry in the HUBS list, one `it` with a 120,000 ms timeout: `vi.resetModules()`, `const m = await import(path)`, assert `Object.keys(m).length > 0` and that no export is `undefined`. The list (all paths exist today): `src/game/aging.ts`, `menus.ts`, `special.ts`, `careers.ts`, `business.ts`, `computer.ts`, `assets.ts`, `finance.ts`, `crime.ts`, `underworld.ts`, `effects.ts`, `business/manage.ts`, `business/yearly.ts`, `business/economy.ts`, `computer/dev.ts`, `computer/dev-projects.ts`, `special/gamedev.ts`, `special/gamedev-make.ts`, `special/politics.ts`, `special/model.ts`, `special/model-exit.ts`, `activities/immigration-move.ts`, `nation/consequences.ts`, `economy/index.ts`, `events/helpers.ts`, `kernel/registry.ts`, `modules/index.ts` (the last two exist after K1). A second block: `vi.resetModules()`, import `src/game/aging`, then `src/game/menus`, then assert every entry of `portStatus()` (read from `src/game/kernel/ports`, same module graph) has `bound: true`; this is empty until the ports exist and is the guard that a provider is always loaded by the two real entry points. If a hub legitimately exports `undefined` today, list it in a per-hub allow map with the reason. Run it on today's code: it must be green before any cut (it is the safety net for the load-order change). Later tasks append hubs (K7 adds `world/facts.ts`).
2. For each cut, in the table's order: make the edit, run `/Users/saeed/projects/anotherlife/wt/bin/tc`, then run the tests that cover the touched modules. Find them with `grep -ln "<module file name>" test/*.test.ts`. Minimum set: cuts 1 to 5 `test/computer-dev.test.ts test/consumer-brands.test.ts`; 6 to 8 and 10 `test/computer-dev.test.ts test/gamedev.test.ts test/gamedev-review.test.ts test/talent-perks.test.ts`; 9 `test/underworld.test.ts test/advisors-year.test.ts`; 11 and 12 the tests that grep finds for `ai-bench` and `competition-roster`; always `test/wave-insider.test.ts` (its three load-order tests at lines 30 to 47 must stay green), `test/money-ratchet.test.ts`, `test/hub-entry.test.ts`. If a test fails only because the provider module is not loaded in that test (a port unbound), add a side-effect import of the provider to the test with the reason in the commit message; assertions never change.
3. After the 12 cuts: `UPDATE_ARCH_BASELINE=1` and `UPDATE_LAYER_BASELINE=1` runs shrink the two baselines. Expected from the simulation: the real components are 59, 30, 7, 6, 2, 2, 2 (108 modules); because `shrinkBaseline` keeps R1's grouping the baseline file shows the groups 63 (the old 85: 59 + 2 + 2), 30, 2 (the old 19), 7, 6 until R2-K6 splits it; `cycleDirEdges` drops from 72 to 18, all of them inside the 30-module cycle that R2-K6 finishes.
4. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/hub-entry.test.ts test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts test/wave-insider.test.ts test/money-ratchet.test.ts test/computer-dev.test.ts test/gamedev.test.ts test/underworld.test.ts`

**Acceptance proven.** The cycle set shrinks (147 modules to 108: the 85-module component becomes 59 + 2 + 2 and the 19-module one becomes 2); the hub-entry guard exists and is green; ports are bound after a real entry.

**Flag.** None. **Depends on.** R2-K1 (ports, `kernel/`), R2-K4 (both update commands). **Size.** About 330 source lines (the moves are about 140 of them), about 150 test lines.

**Risks.** (1) A port that is unbound in an isolated test degrades silently to its fallback (an empty menu row, a skipped revaluation); the hub-entry port check and the named covering tests are the guard. (2) `localPay` is called from economy code in many places; it is a pure function, and the move changes nothing but the file. (3) Ledger-world's wrapper migration edits `assets.ts`, `underworld.ts`, `business/economy.ts` and `computer/*` money lines; the hunks here are import lines and whole-block moves, so conflicts are textual. Rebase before starting. (4) Cut 11 depends on wave 0; the grep in the table decides.

---

### R2-K6 K.2a (d): the last 2 cuts, the split baseline and the zero rule

**Goal.** Cut `nation/consequences.ts -> activities/immigration-move.ts` and `special/model-exit.ts -> careers.ts`, split the cycle baseline to the true components, and make "no cycle edge crosses a directory" a hard zero.

**Items covered.** K.2a (cuts 13 and 14; the ratchet's final shape).

**Files.**
- Create: `src/game/activities/contract.ts`, `src/game/workplace/contract.ts`.
- Modify: `src/game/nation/consequences.ts` (line 8 import, line 83 call), `src/game/activities/immigration-move.ts` (an import; a bind after `relocate`, which starts at line 154), `src/game/special/model-exit.ts` (line 10 import; uses at lines 108, 159 to 161 and 181 to 183), `src/game/careers.ts` (an import; a bind after `hireForJob`), `test/arch-kit.ts` (add `splitBaseline`), `test/architecture.test.ts` (line 90: also accept `UPDATE_ARCH_BASELINE=split`), `test/hub-entry.test.ts` (both files are already in its hub list; only the port-bound block changes), `test/architecture-baseline.json`, `test/layers-baseline.json`, `test/layers.test.ts` (the zero assertion).

**Interfaces.**

```ts
// src/game/activities/contract.ts
import { definePort } from '../kernel/ports'
import type { GameState } from '../types'
import type { Arrival, MoveHow, MoveText } from './immigration-move'     // type-only: erased, no edge
/** Move the player (and the household) to another country. Bound by immigration-move.ts. Unbound: does nothing. */
export const relocatePlayer = definePort('activities.relocate', (_g: GameState, _dest: string, _how: MoveHow, _arrival: Arrival, _text: MoveText): void => {})

// src/game/workplace/contract.ts
import { definePort } from '../kernel/ports'
import type { Industry, JobDef } from '../data/jobs'
import type { GameState, InterviewJob, Job } from '../types'
export interface OrdinaryJobs {
  companyName(g: GameState, industry: Industry, r: () => number): string
  eraPayShape(year: number, industry: Industry): number
  jobRequirementProblem(g: GameState, def: JobDef): string | null
  hireForJob(g: GameState, job: InterviewJob): Job
}
/** The ordinary job market, for careers that end in a normal job. Bound by careers.ts. Unbound: null. */
export const ordinaryJobs = definePort('workplace.ordinaryJobs', (): OrdinaryJobs | null => null)

// test/arch-kit.ts (added)
/** The baseline split into the current components: every current component is a subset of the baseline's modules. Throws on a module the baseline does not hold (never writes a new cycle). */
export function splitBaseline(current: readonly string[][], baseline: ArchBaseline): ArchBaseline
```

**Cuts 13 and 14.**
- 13: `nation/consequences.ts` imports `relocate` at line 8 and uses it once at line 83 (`goIntoExile`, an asylum move). Replace with `relocatePlayer` from `../activities/contract`; `immigration-move.ts` binds `relocatePlayer.use(relocate)` after the function. `relocate` contains `spend(...)`, which is why it stays where it is (the money ratchet).
- 14: `special/model-exit.ts` uses the four careers helpers in `exitBlock` (line 108) and `takeExit` (lines 159 to 183). Replace the import with `ordinaryJobs` from `../workplace/contract`; `exitBlock` becomes `const jobs = ordinaryJobs(); return def && jobs ? jobs.jobRequirementProblem(g, def) : "Nobody is hiring photographers right now."` (the same string as today, no new text); `photographerPay` takes `eraPayShape` as an argument from the same `jobs` object, and its parameter type at line 159 (`Parameters<typeof eraPayShape>[1]`) becomes `Industry` (a type-only import from `../data/jobs`); `takeExit` returns without hiring when `jobs` is null (no player-visible path reaches that in the app, since `careers.ts` loads with `aging`). `careers.ts` binds `ordinaryJobs.use(() => ({ companyName, eraPayShape, jobRequirementProblem, hireForJob }))`.

**Steps (test first).**
1. Add the tests, red first:
   - `test/architecture.test.ts` area (new `describe('splitBaseline')` in the same file, or in `test/arch-kit.ts`'s own test if one exists; keep it in `architecture.test.ts` to stay with R1's pattern): a baseline `[[a,b,c,d]]` and current `[[a,b],[c,d]]` splits to the two groups and then passes `compareToBaseline` with no violation; a current module the baseline does not hold throws naming it; the result never contains a module the baseline lacked; input not mutated.
   - `test/layers.test.ts`: after this task `cycleDirEdges(await readImportGraph(ROOT))` is `[]` and the baseline section is `[]` (a hard assertion, in addition to the ratchet); `flat(baseline.components).length` of `test/architecture-baseline.json` is at most 90 and it has at most 8 components (the "cycle set shrinks" criterion, as a ceiling).
   - `test/hub-entry.test.ts`: `special/model-exit.ts` and `nation/consequences.ts` are already hubs; the port-bound block now covers four ports (`business.revalueCompany`, `computer.gameMakingMenu`, `activities.relocate`, `workplace.ordinaryJobs`).
   - Targeted: `test/model-exit.test.ts`, `test/model-flow.test.ts`, `test/model-year.test.ts`, `test/immigration.test.ts` (its asylum path), `test/nation.test.ts`.
2. Make the two cuts. Run the covering tests (as in R2-K5 step 2). Then `UPDATE_ARCH_BASELINE=split`, `UPDATE_LAYER_BASELINE=1`.
3. Verify the result by reading the new baseline: component sizes 59, 8, 7, 6, 4, 2, 2, 2 (90 modules). If the numbers differ, the difference is the report to the lead, not a reason to edit the baseline.
4. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts test/hub-entry.test.ts test/model-exit.test.ts test/model-flow.test.ts test/model-year.test.ts test/immigration.test.ts test/nation.test.ts test/wave-insider.test.ts test/money-ratchet.test.ts`

**Acceptance proven.** The cycle set shrinks from 147 modules in 5 cycles to 90 modules in 8 cycles; no cycle crosses a directory; the baseline is exact (a fusion of two of the remaining cycles is a violation again).

**Flag.** None. **Depends on.** R2-K5. **Size.** About 210 source lines (contracts 60, `splitBaseline` 40, the bind and call edits 110), about 110 test lines.

**Risks.** (1) `model-exit` degrades to "Nobody is hiring" if `careers.ts` is not loaded; `model-exit` tests that exercise the photographer exit need a side-effect import of `careers` (same rule as R2-K5). (2) The split baseline is finer than R1's: any later cut that frees a module from the 59-module cycle shrinks it with the usual update; a module joining any remaining cycle fails. (3) `immigration-move` loads through `immigration.ts` (aging) and `activities/*`, so `relocatePlayer` is always bound in the app.

---

### R2-K7 K.3 (c): the bounded fact store

**Goal.** Facts emitted on the bus land in `g.world.facts`: capped, deduplicated by year so a replay adds nothing, read with a normalizing reader, and never created by a pure read.

**Items covered.** K.3 (events landing in a bounded `g.world.facts`).

**Files.**
- Create: `src/game/world/facts.ts`, `test/world-facts.test.ts`.
- Modify: `src/game/modules/index.ts` (add `factsModule` to `MODULES`: the "one line" rule, practised once), `src/game/world/shards.ts` (Ledger-world's registration hub, created in its R2-L2: add the one line `import './facts'`, so every process that imports the hub, `save-slices.ts` included, registers the `facts` shard; `facts.ts` imports `./state`, never the hub, so no cycle forms), `test/hub-entry.test.ts` (add `src/game/world/facts.ts` to the hub list). `src/game/types.ts` is not touched.

**Interfaces.**

```ts
// src/game/world/facts.ts  (layer L2; imports ../types (type), ../kernel/fact, ../kernel/registry (type), ./state (ensureWorld, registerShard, worldShard: Ledger-world R2-L1))
import type { GameState } from '../types'
import type { ModuleDef } from '../kernel/registry'
import { type Fact } from '../kernel/fact'
export const FACT_CAP = 400
export const FACTS_PER_KIND_YEAR = 12
export interface FactsShard { v: 1; rows: Fact[] }   // the stored shape: g.world.facts, with its own version like every shard
export function normalizeFacts(raw: unknown): FactsShard   // total and bounded: drops invalid rows, keeps the newest FACT_CAP, returns raw itself when it is already valid (identity caching)
/** The stored facts, oldest first. Pure: never creates g.world, never writes. */
export function readFacts(g: GameState): readonly Fact[]   // worldShard<FactsShard>(g, 'facts')?.rows ?? []
/** Append one fact. False when it duplicates a stored (k, y, c, a), when its (k, y) already has FACTS_PER_KIND_YEAR rows, or when it is invalid. Replaces the shard root (`ensureWorld(g).facts = { v: 1, rows }`); drops the oldest rows beyond FACT_CAP. */
export function recordFact(g: GameState, fact: Fact): boolean
/** The recorder: a '*' handler that owns the slice 'world.facts'. */
export const factsModule: ModuleDef   // { id: 'world.facts', layer: 2, slices: ['world.facts'], handles: [{ kind: '*', slice: 'world.facts', run: (g, f) => { recordFact(g, f) } }] }
```

**Behaviour.**
- The module registers its shard at load: `registerShard('facts', { normalize: normalizeFacts })` (without it `normalizeWorld` would drop the shard on load). `readFacts` is `worldShard<FactsShard>(g, 'facts')?.rows ?? []`; a garbage shard or row reads as empty or is dropped through `normalizeFact`; the result is the newest `FACT_CAP`; `normalizeFacts` returns its input when already valid and a `WeakMap` keeps one normalized copy per stored root.
- `recordFact` calls `ensureWorld(g)` only when it has something to write. Order is by year, then insertion. Dedup key is `k|y|c|a`.
- A process that loads a save without having loaded `modules/index.ts` would drop `world.facts` in `normalizeWorld` (no shard registered yet). In the app the store imports `aging`, which imports `modules`, before any load; the Save track's `save-slices.ts` imports `src/game/world/shards` for effect, and the hub imports `./facts` (cross-check resolution of section 4, open question 9).
- State budget: 400 rows of at most 6 fields is about 2,800 JSON nodes (0.6% of the 500,000 cap), stated in the module comment.

**Steps (test first).**
1. Write `test/world-facts.test.ts` (`// ci: fast`). Red first. Cases:
   - hostile: `g.world = { v: 1, facts: 'x' }`, `{ v: 1, facts: { v: 1, rows: [null, 3, 'a', {}, { k: 'a.b', y: NaN }] } }`, a 5,000-row `rows` array, rows with nested objects and 10,000-character strings, a shard with `v: 2`: `readFacts` returns only valid rows, at most 400, never throws, and does not mutate the stored array;
   - cap: 450 distinct facts leave exactly the newest 400; per-kind-year: the 13th `(k, y)` row is refused and the call returns false;
   - idempotence: recording the same fact twice in one year stores one row; running a synthetic yearly step twice (the second marked by the year) stores one set (RF5);
   - purity: `readFacts` on a `deepFreeze`d state with no `g.world` returns `[]` and `g.world` stays undefined (a pure read creates nothing);
   - end to end: register `factsModule` and a test module that declares kind `company.failed`; `emit` stores one row; the same `emit` under `withGuard()` from `test/kernel-kit.ts` passes the own-slice check; a handler for another slice that touched `world.facts` would fail it (use the synthetic bad handler from K2);
   - heirs (RF3): a state with facts through `continueAsChild(g, childId)` (life.ts line 1138) still has them (reuse Ledger-world's heir helper if it landed; else build the parent as `test/hedge-kit.ts` `rich()` does);
   - shard registration: with `world/facts` imported, `normalizeWorld({ v: 1, facts: validShard })` (from `world/state.ts`) keeps the shard; the same call in a fresh module registry that has not imported it drops it (documents the load-order rule above);
   - old save: `migrateSave(structuredClone(JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString())))` as in `test/wave-stocks-story.test.ts:59` gives a game whose `readFacts` is `[]`; five `ageUp` calls on it add no `g.world` unless Ledger-world's own step creates it, and never throw;
   - node budget: 400 maximal facts serialize to under 60 KB.
2. Implement. Add `factsModule` to `MODULES`.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/world-facts.test.ts test/kernel-bus.test.ts test/kernel-registry.test.ts test/hub-entry.test.ts test/layers.test.ts test/layers-domains.test.ts test/architecture.test.ts`

**Acceptance proven.** The bus feeds a bounded store (400 rows, 12 per kind and year); replays add nothing; hostile and old saves read as empty; heirs keep facts.

**Flag.** None. **Depends on.** R2-K2 and Ledger-world (merged). **Size.** About 200 source lines, about 260 test lines.

**Risks.** (1) The shard API (`registerShard`, `worldShard`, `ensureWorld` in `world/state.ts`) is Ledger-world's; if its shape changed in review, only `facts.ts` changes. (2) `world/facts.ts` is L2 and imports `./state` and kernel files only: the layer test must show no upward import. (3) The shard is bounded (about 2,800 nodes) and counted by Ledger-world's `worldBudget`; the 50-year probe will show it.

---

### R2-K8 K.3 (d): the parity recorder (pre-change fixtures)

**Goal.** Record the behaviour that K9 to K12 must not change: the yearly hook names and order, the executed hook trace and the state digest after N seeded years, the menu trees of four canned lives, and the company view of 33 industries and 5 variants. Recorded on the unconverted code, after the rebase onto Ledger-world.

**Items covered.** K.3 acceptance ("a parity test ... record a fixture before converting").

**Files.**
- Create: `test/parity-kit.ts`, `test/kernel-parity.test.ts`, `test/fixtures/kernel-parity.json` (written by the recorder).
- Modify: `src/game/special.ts` (line 29: `const YEARLY` becomes `export const SPECIAL_YEARLY`, and line 47 follows; one word each; K10 removes the export).

**Interfaces.**

```ts
// test/parity-kit.ts
import type { ParityTrace } from './r2-parity-kit'       // wave 0
export const PARITY_FILE: string                         // 'test/fixtures/kernel-parity.json'
export interface Digest { n: number; h: string }         // n items, h = fnv1a (src/game/text/hash.ts) of the items joined by newlines, as 8 hex digits
export interface YearlyAccess {
  names(seam: 'aging' | 'special'): string[]                                         // hook names in run order
  traced<T>(out: string[], fn: () => T): T                                           // pushes each hook's name when it runs
  reordered<T>(reorder: (names: string[]) => string[], fn: () => T): T               // runs fn with the aging list reordered (for the mutation test)
}
export const yearly: YearlyAccess                         // K8: over YEARLY_HOOKS and SPECIAL_YEARLY (mutable arrays); K9 and K10 swap the bodies to the registry
export interface LivesParity { traces: ParityTrace[]; v1: string[][]; hooks: Record<string, Digest> }   // wave 0 traces, the v4.0.2 fixture life per year, and one digest of the executed hook names per life
export function livesParity(): LivesParity
export function menusParity(): Record<string, Record<string, Digest>>               // state -> 'tab/topGroup' -> digest of the ordered canonical paths below it
export function viewsParity(): Record<string, Digest>                               // industry or variant -> digest of businessView ids, one level of children
```

The fixture shape: `{ v: 1, base: '<git sha>', aging: string[], special: string[], lives: LivesParity, menus: {...}, views: {...} }`.

**What is recorded.**
- `aging` and `special`: the names in order (13 for `special`; for `aging` the 35 of today, plus `world` last once Ledger-world's R2-L17 has merged, plus anything Save added).
- `lives`: wave 0's `test/r2-parity-kit.ts` (R2-A1), not a second kit: `traceLife(life)` for four of its `PARITY_LIVES` (the two birth lives with `rich: true` and the founders with 1 and 3 companies), which gives per year the slice digests of `parityDigests` (`rng`, `meta`, `character`, `people`, `assets`, `counters`, `economy`, `flagsWorld`, `flagsPersonal`, `flagsCache`, `queue`, plus `text`, which `compareTraces` never compares). A mismatch names the life, the year and the slices. Add one life of our own: the v4.0.2 fixture (`save-v1.json.gz` through `migrateSave`, as in `test/wave-stocks-story.test.ts:59`), five `ageUp` calls with `g.queue = []` after each, `parityDigests(g)` after each year. During the same runs `yearly.traced` collects the hook names per year; one digest of the whole sequence per life goes in `hooks`. The seeds are the tuples of `PARITY_LIVES`, so this kit writes no `seed: <digits>` (the wave 0 pin ratchet `test/seed-pins.test.ts` counts that pattern); the seeds are pinned on purpose, as a golden digest must be, and the header comment says so.
- `menus`: for each of `navState('kid' | 'adult' | 'ceo' | 'elder')` after `resetFlags()`: `walkTree(g)` canonical paths (`canonical(w)` with the node type), grouped by the first two path segments, one digest per group. A mismatch names the group that moved.
- `views`: for each id in `INDUSTRY_IDS` (`src/game/data/markets.ts`, 33): `const g = rich(seed)` (`test/hedge-kit.ts`), `const a = createBusinessAsset(g, name, newBiz(g, industry, 'us', firstCity, { cash: 5_000_000 }), 1e6)`, `g.assets.push(a)`, `becomeCeo(g, a, bizOf(g, a))`, `g.queue = []`; digest of `businessView(g, a)` ids plus the ids one level down inside each `menu` node. Variants: a hired CEO with a board (`sector-kit.managedDesk('...', 70)`), a listed company (`own-listing-kit.founder` and `listed`), a group division (`listedGroup(g, 'us', 0.6)` members), a deep-tech lab (`deeptech-kit.adultIn` and `found`), and a company with negative cash. Each is built twice in the test and must give the same digest (the determinism check of the kit itself).

**Recorder.** `RECORD_KERNEL_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-parity.test.ts` writes the fixture with the current `git rev-parse --short HEAD` in `base`. Without the variable the test compares and, if the file is missing, fails with the command to run (it never writes silently).

**Steps (test first).**
1. Write `test/parity-kit.ts` and `test/kernel-parity.test.ts` (timeout 120,000 ms). Cases: (1) `yearly.names('aging')` equals the fixture list; (2) `yearly.names('special')` equals the fixture list; (3) each life's `compareTraces` against the fixture is `[]` and each hook-trace digest equals the fixture; (4) each menu group digest equals the fixture; (5) each view digest equals the fixture; (6) mutation: with `yearly.reordered` swapping two adjacent aging hooks, a founder life limited to 5 years (a copy of one `PARITY_LIVES` entry with `years: 5`) gives a different hook digest and a non-empty `compareTraces` (proves the digests are sensitive); (7) each kit builder gives the same result twice (determinism); (8) the fixture's `aging` list length is at least 35. Cases 1 to 5 fail with "no fixture" before the recorder runs.
2. Run the recorder on the rebased head (pre-change code). Read the fixture: `aging` should list the 35 names of `aging.ts` lines 46 to 89 in order plus the hooks Ledger-world added (`world`, last); `special` the 13 of `special.ts` lines 30 to 42. If the aging list is not what `grep -n "^  \['" src/game/aging.ts` shows, stop.
3. Run the test without the variable: green. Run it twice more to see it is stable.
4. Commit the fixture alone, before any conversion commit, with the base sha in the message. (This is the "record before converting" rule: the commit order is K8 then K9.)
5. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-parity.test.ts`

**Acceptance proven.** The pre-change behaviour is pinned (order, trace, JSON after N years, menu trees, company views), with a mutation test showing a one-hook swap is caught.

**Flag.** None. **Depends on.** Ledger-world merged and the Kernel branch rebased (the digests include its changes); R2-K5 and R2-K6 are not required but, if merged first, are part of the recorded base. **Size.** About 330 source lines (kit; one line in `special.ts`), about 220 test lines, plus about 450 lines of fixture.

**Risks.** (1) The digests are whole-state for lives: any later legitimate simulation change moves them. That is the point of a golden digest, and the rule is the lead's (re-record with the reason; Platform's per-slice digests will name the slice). (2) Run time: four lives from `PARITY_LIVES` (wave 0 measures about 90 s for all twelve, so about 30 s for four), 5 more years and 38 company views, about 45 s on a free machine; the file is not in the fast tier. (3) `walkTree` of the CEO state is about 12,000 nodes; `navState` memoizes per file. (4) Cross-check finding: wave 0's own canary (`test/fixtures/r2-parity.json`, compared by `test/r2-codemod-parity.test.ts`) is re-recorded by the Ledger-world tasks that legitimately move it (R2-L3, R2-L6, R2-L13) and by Save's R2-S10, each with `R2_PARITY_RECORD=update` and the moved slice named in its commit. Check that file is green on the rebased head before recording here; R2-K9 to R2-K12 must keep both fixtures unchanged (a moved digest in either means a conversion changed play).

---

### R2-K9 K.3 (e): convert `aging.ts` to the registry

**Goal.** `ageUp` iterates `yearlyEntries('aging')`; the 35 hooks (plus any Ledger-world and Save added) are module definitions in `src/game/modules/yearly-aging.ts`. Same hooks, same order, same JSON.

**Items covered.** K.3 (aging).

**Files.**
- Create: `src/game/modules/yearly-aging.ts`.
- Modify: `src/game/aging.ts` (lines 4 to 42 imports shrink to what `ageUp` itself uses; lines 44 to 90 `YEARLY_HOOKS` removed; the loop at lines 121 to 128 reads the registry; one `import './modules'`), `src/game/modules/index.ts` (add `...YEARLY_AGING`), `test/parity-kit.ts` (swap `yearly.names('aging')`, `yearly.traced` and `yearly.reordered` to the registry), `test/korean-cash.test.ts` (lines 2, 16 to 17, 36 to 37, 46 to 47, 59 to 60, 67 to 68), and, found by the cross-check with `grep -rn YEARLY_HOOKS test src`, seven more test files that import `YEARLY_HOOKS` (mechanism only, every `expect` untouched): `test/hedge-year.test.ts` (import 7; 502 to 509 and 824 to 830), `test/tech-waves-wiring.test.ts` (import 7; 57 to 64), `test/fuzz-regressions.test.ts` (import 6; 299 to 303), `test/series-life.test.ts` (import 5; 251 to 271), `test/dividend-wiring.test.ts` (import 7; 274), `test/release-182.test.ts` (import 3; 49 to 50), `test/advisors-year.test.ts` (import 5; 129 and 161 to 166), plus Ledger-world's `test/world-budget.test.ts` (R2-L17 case 1, "`YEARLY_HOOKS` ends with the name `world`", becomes "the last `yearlyEntries('aging')` id is `yearly.world`"), `test/kernel-kit.ts` (two additive helpers, step 3a), `test/arch-kit.ts` (line 23, the hint text), `src/game/advisors/year.ts` (comment line 3), `src/game/business/nepo.ts` (comment line 14), `src/game/events/wealth.ts` (comment line 7).

**The conversion (names, phases and orders; ids are `yearly.<name>`).**

| Phase | Entries (name order) |
|---|---|
| `life` | history 10, digest 20, household 30, relationships 40, sharedProjects 50, givingFund 60, background 70, royalty 80, royalCareers 90, health 100, education 110, professions 120 |
| `careers` | career 10, special 20 |
| `government` | nation 10 |
| `firms` | workshop 10, corruption 20, business 30, techWaves 40 |
| `money` | development 10, investments 20, hedge 30, shops 40, computer 50, finance 60, wealth 70, familyUse 80, nepo 90, willFeuds 100 |
| `assets` | immigration 10, assets 20, crime 30, underworld 40 |
| `advisors` | advisors 10 |
| `close` | milestones 10 |
| `settle` | world 10 (present only if Ledger-world's R2-L17 has merged: its entry `['world', yearlyWorld]` sits after `['milestones', yearlyMilestones]` in `YEARLY_HOOKS`) |

That is 35 today, 36 once `world` is there. `royalCareers` keeps its arrow `(g) => refreshRoyalCareers(g)` and the four comments of `aging.ts` (royal blood mid-year; nation after careers; workshop before business; the money team last) move into the defs. Any other hook that Ledger-world or Save added before this task is placed by the rule "the phase of the hook before it, order = that hook's order + 5" unless its own comment names a phase; the commit message lists every name found. Line numbers in this task are v4.1.1; Ledger-world's R2-L3 (the inflation line, 119) and R2-L17 (one entry and one import) move them by a few lines, so locate by `grep -n "YEARLY_HOOKS" src/game/aging.ts` and `grep -n "for (const \[, hook\]" src/game/aging.ts`.

```ts
// src/game/modules/yearly-aging.ts  (layer L4; exempt from the eager-read scan, outside every cycle)
import type { ModuleDef } from '../kernel/registry'
const hook = (name: string, phase: string, order: number, run: (g: GameState) => void): ModuleDef => ({ id: `yearly.${name}`, layer: 3, yearly: [{ seam: 'aging', phase, order, run }] })
export const YEARLY_AGING: readonly ModuleDef[] = [ hook('history', 'life', 10, yearlyHistory), /* ... one line per hook, 35 today, 36 with `world` ... */ ]
```

```ts
// src/game/aging.ts (the loop, replacing lines 121 to 128)
import { yearlyEntries } from './kernel/registry'
import './modules'   // registers the modules; aging is the entry that guarantees they are loaded
// ...
for (const e of yearlyEntries('aging')) {
  e.run(g)
  if (!c.alive) { writeLifeRow(g); return }
}
```

`ageUp` lines 96 to 120 (the clock, `settleIncomeTax`, `ensureEconomy`, `yearlyEconomy`, the inflation divide) and lines 129 to 138 (`checkDeath`, `writeLifeRow`, `queueAi`) are unchanged. `YEARLY_HOOKS` is no longer exported. `test/store.test.ts:53` mocks `aging` with `...real` and does not use it, but nine other test files do (the list under Files; the plan first said only `korean-cash`, which was wrong: the cross-check found the rest with grep), and each is converted in this task or it stops compiling.

**Steps (test first).**
1. In `test/parity-kit.ts` change the three aging accessors to read the registry (`yearlyEntries('aging').map((e) => e.id)` with the `yearly.` prefix stripped, a wrapper that replaces entries with tracing ones through `withYearly`). Run `test/kernel-parity.test.ts`: RED (the registry is empty). Nothing else in the test changes; the fixture is not touched.
2. Create `modules/yearly-aging.ts`, convert `aging.ts`, add the spread to `modules/index.ts`. The parity test goes GREEN.
3a. Add to `test/kernel-kit.ts` (K2's file, additive) two helpers: `agingNames(): string[]` (the registry's aging ids with the `yearly.` prefix removed, in run order) and `withAging<T>(edit: (entries: readonly YearlyEntry[]) => YearlyEntry[], fn: () => T): T` (`withYearly('aging', edit(yearlyEntries('aging')), fn)`). Then convert the seven other files with them, nothing else changing: `YEARLY_HOOKS.map(([k]) => k)` becomes `agingNames()` (the `hedge` after `investments`, `techWaves` after `business`, `advisors` after `underworld` and `business` before `finance` checks all hold in the pinned phase table); `splice(0)` and restore becomes `withAging(() => [], () => ageUp(g))`; removing one hook (`hedge`, `techWaves`, `advisors`) becomes `withAging((es) => es.filter((e) => e.id !== 'yearly.hedge'), () => ageUp(twin))`; the test hook inserted after `relationships` in `fuzz-regressions` becomes an entry `{ seam: 'aging', phase: 'life', order: 45, run }` spliced after the `yearly.relationships` entry; the hook pushed at the end in `series-life` becomes an entry in phase `news`, order 10 (the last phase). Run each of the eight files before and after the change: the same assertions pass.
3. `test/korean-cash.test.ts`: `import { withYearly } from '../src/game/kernel/registry'`; lines 16 to 17, 36 to 37, 59 to 60 become `withYearly('aging', [], () => ageUp(g))`; lines 67 to 68 become `withYearly('aging', [], () => { for (let y = 0; y < 20; y++) ageUp(g) })`; lines 46 to 47 become `withYearly('aging', [{ seam: 'aging', phase: 'life', order: 10, run: (gg) => { gg.character.money += 100 } }], () => ageUp(g))`. Every `expect` is unchanged. Run it before and after: same numbers.
4. `test/arch-kit.ts` line 23: the hint text becomes `... or register through a seam (see registerModule in kernel/registry.ts, the old YEARLY_HOOKS, and registerFamily)`. `test/architecture.test.ts` lines 170 to 171 still find both `YEARLY_HOOKS` and `registerFamily` in the hint: that test is not edited.
5. The three comment lines in `advisors/year.ts`, `business/nepo.ts` and `events/wealth.ts` now say "the yearly registry (modules/yearly-aging.ts)".
6. Add to `test/kernel-parity.test.ts` one case: after `import '../src/game/aging'`, `yearlyEntries('aging').length` equals the fixture's `aging.length` and every id starts with `yearly.` (a guard that no hook was dropped).
7. `UPDATE_LAYER_BASELINE=1` shrinks the eager section (`aging.ts` `YEARLY_HOOKS` leaves; it was exempt, so likely no change).
8. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-parity.test.ts test/korean-cash.test.ts test/hedge-year.test.ts test/tech-waves-wiring.test.ts test/fuzz-regressions.test.ts test/series-life.test.ts test/dividend-wiring.test.ts test/release-182.test.ts test/advisors-year.test.ts test/world-budget.test.ts test/hub-entry.test.ts test/layers.test.ts test/layers-domains.test.ts test/architecture.test.ts test/store.test.ts test/nation.test.ts`

**Acceptance proven.** Same hooks, same order, same JSON after N seeded years, against the fixture recorded before conversion.

**Flag.** None. **Depends on.** R2-K1, R2-K8. **Size.** About 330 source lines (the module file about 190, `aging.ts` net -50, the two kit helpers 15), about 200 test lines changed or added.

**Risks.** (1) Ledger-world's hooks (see above). (2) `import './modules'` makes `aging.ts` import every domain; it already did. `modules/index.ts` is outside every cycle (nothing in `src/game/` below L4 imports it; rule b enforces it). (3) The registry cache and `withYearly`: the parity mutation test and `korean-cash` both rely on `ageUp` calling `yearlyEntries` fresh each year, which it does.

---

### R2-K10 K.3 (f): convert `special.ts` to the registry

**Goal.** `yearlySpecial`, `specialCareersMenu.children` and `specialJobNodes` read the registry; the 13 yearly hooks, 11 career menus and 11 job-node lists are module definitions registered by `special.ts` itself, so a test that imports only `special.ts` still finds them.

**Items covered.** K.3 (special).

**Files.**
- Modify: `src/game/special.ts` (lines 29 to 43 `YEARLY` and 46 to 51 `yearlySpecial`; lines 83 to 95 `children`; lines 102 to 114 the job array), `test/parity-kit.ts` (the `special` accessors), `test/kernel-parity.test.ts` (nothing else).
- Create: `test/kernel-special.test.ts`.

**The conversion.** `special.ts` calls `registerModules([...])` once at load, with arrow wrappers so no imported binding is read at load time (the cycle-safe form; this removes `YEARLY` and its 13 eager reads from the eager baseline):

| Module id | yearly (phase, order) | `special.careers` (order) | `special.jobs` (order) |
|---|---|---|---|
| `special.military` | `service` 10 | none | 10 `militaryJobNodes` |
| `special.actor` | `careers` 10 | 10 `actorCareerMenu` | 20 `actorJobNodes` |
| `special.astronaut` | `careers` 80 | 20 `astronautCareerMenu` | 90 `astronautJobNodes` |
| `special.author` | `careers` 50 | 30 `authorCareerMenu` | 60 `authorJobNodes` |
| `special.social` | `public` 10 | 40 `influencerMenu` | none |
| `special.model` | `careers` 60 | 50 `modelCareerMenu` | 70 `modelJobNodes` |
| `special.music` | `careers` 20 | 60 `musicCareerMenu` | 30 `musicJobNodes` |
| `special.politics` | `careers` 70 | 70 `politicsCareerMenu` | 80 `politicsJobNodes` |
| `special.sports` | `careers` 30 | 80 `sportsCareerMenu` | 40 `sportsJobNodes` |
| `special.gamedev` | `careers` 40 | 90 `gameIndustryMenu` | 50 `gameDevJobNodes` |
| `special.hustler` | `careers` 100 | 100 `hustlerCareerMenu` | 100 `hustlerJobNodes` |
| `special.business` | none | 110 `businessCareerMenu` | 110 `businessJobNodes` |
| `special.careers2` | `careers` 90 | none | none |
| `special.fame` | `public` 20 | none | none |

That is 13 yearly entries in today's order (military, actor, music, sports, gamedev, author, model, politics, astronaut, careers2, hustler, social, fame), the careers list in today's order (actor, astronaut, author, influencer, model, music, politics, sports, game industry, hustler, business) and the jobs list in today's order (military, actor, music, sports, gamedev, author, model, politics, astronaut, hustler, business). Each module has exactly one yearly entry in the `special` seam (so entry ids equal module ids).

```ts
// special.ts after the change
export function yearlySpecial(g: GameState): void {
  for (const e of yearlyEntries('special')) {
    if (!g.character.alive) return          // the check before every hook, as today (line 48)
    e.run(g)
  }
}
// specialCareersMenu: children: (g): MenuNode[] => collectMenu('special.careers', g)
// specialJobNodes: const nodes = collectMenu('special.jobs', g)   // then the unchanged "unknown special job: still let the player leave it" tail (lines 115 to 135)
```

`influencerMenu` (lines 54 to 70) stays a module-level object in `special.ts` (its spread of `socialMediaMenu` is the one eager read the file keeps; the baseline records it). The line-26 re-export `export { fameMenu, militaryMenu, socialMediaMenu }` stays. `SPECIAL_YEARLY` (K8) is removed.

**Steps (test first).**
1. In `test/parity-kit.ts` swap the `special` accessors to the registry (`yearlyEntries('special').map((e) => e.id)` with `special.` stripped, tracing through `withYearly('special', ...)`). Run `test/kernel-parity.test.ts`: RED for the `special` name list and the traces. Write `test/kernel-special.test.ts` (`// ci: fast`): (1) after importing only `src/game/special`, `yearlyEntries('special')` has 13 entries in the table's order (so tests such as `test/politics-abuse.test.ts` and `test/wave-kit.ts` that import `special` alone keep working); (2) `collectMenu('special.careers', navState('adult'))` ids start with the same 11 menus in order and `special.influencer` is the fourth; (3) an extension module registered with `order: 45` on `special.careers` appears between `special.influencer` and the model menu; one registered on the `special` yearly seam with phase `public` order 15 runs between social and fame (use a trace through `withYearly`-free registration after `vi.resetModules()`); (4) a dead character stops the loop: `yearlySpecial` with `character.alive = false` runs no hook; (5) `specialJobNodes` returns `[]` for a character with no job and keeps the "Quit" fallback for an unknown special job (the existing tests in `test/special.test.ts` already cover the second; run them).
2. Convert `special.ts`; the parity test goes GREEN.
3. `UPDATE_LAYER_BASELINE=1` shrinks the eager section (`special.ts` `YEARLY` leaves, `influencerMenu` stays).
4. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-parity.test.ts test/kernel-special.test.ts test/special.test.ts test/career-menu.test.ts test/politics-abuse.test.ts test/insider-escrow.test.ts test/hub-entry.test.ts test/layers-domains.test.ts`

**Acceptance proven.** Special's yearly order, career menu and job nodes are identical (parity); a track can extend each with one line.

**Flag.** None. **Depends on.** R2-K9 (and K1, K8). **Size.** About 220 source lines, about 80 test lines.

**Risks.** (1) The registration runs at `special.ts` load; a module that `vi.resetModules()`s and re-imports gets a fresh registry, which is intended. (2) A later track's extension entries on the `special` seam exist only after `modules/index.ts` has loaded (the app always loads it through `aging` and `menus`); a test of an extension imports its own module. (3) The id `special.<name>` and the aging id `yearly.special` are different modules; the registry's unique-id rule keeps them apart.

---

### R2-K11 K.3 (g): convert `menus.ts` to the registry

**Goal.** The Assets, Shopping and Activities menus collect their children from the registry (slots `assets.money`, `assets.tail`, `shopping.stores`, `shopping.lifestyle`, `activities.items`); the contributions are module definitions in `src/game/modules/menus-core.ts`. Same trees.

**Items covered.** K.3 (menus).

**Files.**
- Create: `src/game/modules/menus-core.ts`.
- Modify: `src/game/menus.ts` (imports lines 3 to 32 shrink; lines 53 to 66 `assetsMenu`, 69 to 78 `shoppingMenu`, 110 to 148 `activitiesMenu` read the registry; lines 36 to 44 stay; one `import './modules'` so the menu entries are always loaded with the menus; one `registerModule` for `menus.shopping`), `src/game/modules/index.ts` (add `...MENU_MODULES`), `test/kernel-menus.test.ts` (create).

**The slots.**

| Slot | Entries (order, build) |
|---|---|
| `assets.money` (inserted before `housingHeading`, as lines 56 to 63 do) | 10 `[{ type: 'heading', id: 'moneyHeading', label: 'Business & Investments' }]`, 20 `businessesMenu`, 30 `investmentsMenu`, 40 `moneyTeamMenu`, 50 `bankingMenu`, 60 `developmentMenu` |
| `assets.tail` (appended, as line 64) | 10 `...everydayStoreMenus`, 20 `membershipsMenu`, 30 `ticketsMenu`, 40 `luxuryLifestyleMenu` |
| `shopping.stores` (inserted before `shopBig`, line 72) | 10 `...everydayStoreMenus` |
| `shopping.lifestyle` (appended, lines 73 to 76) | 10 `[{ type: 'heading', id: 'shopLifestyle', label: 'Lifestyle' }]`, 20 `membershipsMenu`, 30 `ticketsMenu`, 40 `luxuryLifestyleMenu` |
| `activities.items` (the 23 entries of the `all` array at lines 119 to 144 in that order, orders 10 to 230, then `...miscActivities` at 240) | `adoptionMenu`, `casinoMenu`, `computerMenu`, `crimeMenu`, `corruptionMenu`, `doctorMenu`, `emigrateMenu`, `fameMenu`, `licensesMenu`, `lotteryMenu`, `loveMenu`, `mindBodyMenu`, `moviesMenu`, `nightlifeMenu`, `petsMenu`, `workshopMenu`, `shoppingMenu`, `socialMediaMenu`, `thisYearMenu`, `economyMenu`, `royalMenu`, `lifePrioritiesMenu`, `vacationMenu` |

Each `build` is an arrow that reads the imported value when called (menus are rebuilt per render anyway). `shoppingMenu` is `menus.ts`'s own export and is referenced by the activities entry, so that one entry lives in `menus.ts` (registered after `shoppingMenu` is defined, module `menus.shopping`) and the other 22 in `menus-core.ts` (module `menus.core`). The code keeps `insertBefore` (lines 46 to 50), `sortByLabel` (105 to 108) and the prison branch (116 to 118):

```ts
// menus.ts
children: (g) => {
  const base = insertBefore(baseAssetsMenu.children(g), 'housingHeading', collectMenu('assets.money', g))
  return [...base, ...collectMenu('assets.tail', g)]
}
// activitiesMenu: ... const all = collectMenu('activities.items', g); return [doAnythingAction, ...sortByLabel(all), surrenderLifeAction]
```

`sortByLabel` is stable, so equal labels keep the registry order, which is the old array order.

**Steps (test first).**
1. `test/kernel-menus.test.ts` (`// ci: fast`), red first: (1) after `import '../src/game/menus'`, `menuEntries('activities.items')` has 23 entries whose built ids, in order, equal the old array's ids (list them in the test from `grep`-verified ids, or build them by calling the 23 imported menu objects directly in the test and comparing ids: both exist); (2) `collectMenu('assets.money', g)` returns the heading first and the five menus after; (3) an extension module with `order: 55` on `assets.money` appears between `bankingMenu` and `developmentMenu` in `assetsMenu.children(g)`, and one on `assets.tail` with `order: 45` after the luxury menu (register after `vi.resetModules()` and import `menus`); (4) `activitiesMenu.children(g)` in prison is unchanged (the prison branch does not touch the registry). Then run `test/kernel-parity.test.ts`: the `menus` digests are GREEN before the change; keep it running through the edit.
2. Convert. `menus.ts` imports fall by about 25 lines (everything that moves to `menus-core.ts`); `noUnusedLocals` will list any import left behind.
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-menus.test.ts test/kernel-parity.test.ts test/nav-sections.test.ts test/nav-needs.test.ts test/main-character-hints.test.ts test/hedge-menu.test.ts test/advisors-menu.test.ts test/hub-entry.test.ts test/layers.test.ts test/layers-domains.test.ts test/architecture.test.ts`

**Acceptance proven.** The Assets, Shopping and Activities trees are identical (parity `menus` digests over four canned lives); a track adds a menu row with one registry line.

**Flag.** None. **Depends on.** R2-K9 (and K8). **Size.** About 380 source lines (the module file about 170; `menus.ts` net about -60 once imports move), about 90 test lines.

**Risks.** (1) `menus.ts` now imports `modules/index.ts`, which imports the 35 hooks and the menu domains: `menus.ts` is L4 and imported only by the UI and tests, so no cycle forms (the architecture test proves it). (2) Menu `build` functions run on every render: they must stay allocation-light (plain arrays, no sort); `sortByLabel` stays where it was. (3) `fameMenu` and `socialMediaMenu` come from `src/game/special.ts`, which registers its own modules at load; the order of those two loads does not matter (the registry sorts).

---

### R2-K12 K.3 (h): convert the company view in `manage.ts`

**Goal.** `businessView` collects its five sections from the registry (`business.view.top`, `.run`, `.money`, `.lead`, `.exit`); the built-in sections are registered by `manage.ts` itself (so every test that opens a company screen still finds them), and a track extends a section with one line. Same node ids in the same order for all 33 industries and the 5 variants.

**Items covered.** K.3 (manage).

**Files.**
- Modify: `src/game/business/manage.ts` (`businessView` lines 2230 to 2284 become a ctx builder plus a collector; one registration block added after `businessScreen`, which ends at line 2291, written as `registerModules([...])` in the plural: see risk 4), `test/kernel-view.test.ts` (create).

**The ctx and the sections.**

```ts
interface ViewCtx { health: BizState; finance: boolean; studio: boolean; strategy: MenuNode[] }
// computed once per view: health = readBiz(g, a); finance = isFinanceFirm(health); studio = !finance && isStudio(health); strategy = finance ? [] : [tidyNationalStrategy(nationalStrategyMenu(a), a)]
export function businessView(g: GameState, a: Asset): MenuNode[] {
  const ctx = viewCtx(g, a)
  return (['top', 'run', 'money', 'lead', 'exit'] as const).flatMap((s) => collectMenu(`business.view.${s}`, g, a, ctx))
}
```

Entries (module `business.manage`, one module with these `menus` entries; each `build` casts `ctx` to `ViewCtx` through one typed helper `viewEntry(section, order, build)`):

| Slot | Order | Build (the code of lines 2230 to 2284 that produces it, moved verbatim) |
|---|---|---|
| `business.view.top` | 10 | `dashboardRows(g, a)` |
| | 20 | `governanceRows(g, a)` |
| | 30 | `[milestonesMenu(a)]` |
| | 40 | `[detailsMenu(a)]` |
| | 50 | `isVenue(health.industry) ? [venueOwnerMenu(a)] : []` |
| | 60 | `familyOf(health.industry) ? [sectorMenu(a)] : []` |
| `business.view.run` | 10 | the finance block: the `Financial Operations` heading, `financeNodes`, `staffMenu`, `expansionMenu`, `insuranceAction` (only when `ctx.finance`) |
| | 20 | the studio block (heading `Run the Company`, `studioNodes`, then the market, staff, marketing, expansion, strategy, insurance and cook-books nodes; only when `ctx.studio`) |
| | 30 | the product block (the `Run the Company` heading, the plan action, `deepTechNodes`, then the market ... cook-books nodes, `franchiseMenu`, `labMenus`, `devicesMenu`; only when neither) |
| `business.view.money` | 10 | the `Money` heading (`biz.moneyH.<id>`) |
| | 20 | `[economicReportMenu(a)]` |
| | 30 | `flagOn('chartKit') ? [booksMenu(a)] : []` |
| | 40 | `[...ceoNodes(a, g), ...moneyNodes(a, g), dividendMenu(a)]` |
| | 50 | the `biz.rescue.<id>` menu |
| `business.view.lead` | 10 | the `Leadership` heading |
| | 20 | `[...leadershipNodes(a, g), ...boardNodes(g, a), ...nepoNodes(g, a)]` |
| | 30 | `[equityMenu(a.id)]` |
| `business.view.exit` | 10 | the `Exit` heading |
| | 20 | `exitNodes(a, g)` |

Order inside each slot reproduces lines 2236 to 2283 exactly (the three run blocks are mutually exclusive, so their relative order is moot). `businessScreen` (lines 2286 to 2291) is unchanged and still calls `companyScreen(g, a, businessView(g, a), rebuild)`. `readBiz` is called once per view instead of several times; it is a pure read (see `state.ts`), so the nodes are identical.

**Steps (test first).**
1. `test/kernel-view.test.ts` (`// ci: fast` is not appropriate: it builds companies; keep it in a shard), red first: (1) an extension module registered on `business.view.run` with `order: 5` and `build: (g, a) => [{ type: 'info', id: 'x.first', text: 'first' }]` appears before the `biz.runH.<id>` heading in `businessView(g, a)` for a product company, and one with `order: 35` appears after the last run block; (2) the same extension registered on `business.view.top` with `order: 55` lands between the details row and the sector row; (3) `businessView` for a finance firm has no `biz.runH` heading and starts its run section with the finance heading (`biz.financeH.<id>`); (4) ids are unique within a company view for all 33 industries (no duplicate sibling id, the rule `test/fuzz-kit.ts` walks); (5) building the view twice on a `deepFreeze`d state does not throw (purity). Build the companies exactly as the views recipe of R2-K8.
2. Run `test/kernel-parity.test.ts` before editing (GREEN: the `views` digests), edit, run again (must stay GREEN).
3. Checks:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-view.test.ts test/kernel-parity.test.ts test/company-dashboard.test.ts test/nav-company.test.ts test/nav-cockpit.test.ts test/board.test.ts test/nepo-year.test.ts test/dividend-menu.test.ts test/sector-menu.test.ts test/hub-entry.test.ts test/layers-domains.test.ts test/architecture.test.ts`

**Acceptance proven.** `businessView` ids and order are identical for 33 industries and 5 variants; extensions slot in by order; the cockpit tiles (R1) still build from the same flat list.

**Flag.** None. **Depends on.** R2-K9 (and K8). **Size.** About 330 source lines (the entries are moves; about 120 are new glue), about 120 test lines.

**Risks.** (1) Performance: `businessView` runs per render of a company screen; the registry call adds a sort-free cached array read and about 20 closures per call. The ctx removes repeated `readBiz` work; add the `businessView` call to the per-tap measurement in `scripts/r1-parity.mjs` if it is still the probe the lead runs. (2) A section entry whose `build` throws would blank the whole screen, as a throw in `businessView` does today; no new try/catch. (3) `manage.ts` stays in a 4-module cycle (`conglomerate-menu`, `conglomerate`, `yearly`); a registration block at its bottom is lazy (closures), so it adds no eager read. (4) Cross-check finding: wave 0's guard `test/world-streams.test.ts` scans every file that contains the call token `registerModule(` for draws, and `business/manage.ts` has 11 player-linked draw lines (`chance` and `rand` at 286 to 293 and 1988 to 2041). The block therefore calls `registerModules(` (plural), which the guard must not match (the lead tells the wave 0 agent: the guard matches the singular token only). If CI shows it matching the plural anyway, put `// rng-ok: the player's own roll in a company screen action` on each of the 11 lines, one tiny hunk each, listed in the commit message; never widen or weaken the guard. R2-K10 (`special.ts`, no draws) uses the plural too; R2-K11's single `registerModule(` in `menus.ts` is safe because that file has no draw.

---

### R2-K13 K.3 and K.2a (e): close the track

**Goal.** Write the note every later track reads, and run the acceptance sweep.

**Items covered.** Documentation rule of K.3 ("a track writes its own note under `docs/`"), acceptance sweep.

**Files.**
- Create: `docs/KERNEL.md`, `test/kernel-acceptance.test.ts`.
- Modify: none (`docs/ARCHITECTURE.md` is not touched: it had 16 commits in v4.0.0).

**`docs/KERNEL.md` contents (about 140 lines, plain hyphens).** (1) The module registry in five lines and the pinned phase table of section 2. (2) How to add a module: write `src/game/<area>/module.ts` exporting a `ModuleDef`, add one line to `src/game/modules/index.ts` (sorted by id), pick a phase and an order from the table (orders are multiples of 10; take the gap), declare `slices`, `facts`, `handles`. (3) The bus rules (section 2), including "never from a menu". (4) Ports and contracts: when a domain needs another domain, import its `contract.ts` or define a port; the four existing contracts. (5) The ratchets: what rules (b) to (e) mean, the exact update commands (`UPDATE_ARCH_BASELINE=1` or `split`, `UPDATE_LAYER_BASELINE=1`), "never edit a baseline by hand", and the layer table. (6) The parity fixture: what it records, when re-recording is legitimate (a deliberate order or tree change, with the reason in the commit message) and how (`RECORD_KERNEL_PARITY=1`). (7) The load-order checklist: no eager read of an imported value in a module that is in a cycle; enter through your hub in `test/hub-entry.test.ts`; bind ports at the provider's module load. (8) The 14 cuts of this release and what remains (the 59-module `business/` cycle, 31 other modules) as the K.2 phase 2 list.

**`test/kernel-acceptance.test.ts`** (a summary test, `// ci: fast`, each case a few lines): (1) `registeredSlices()` after `import '../src/game/modules'` has no duplicates and is sorted; (2) every module in `MODULES` has `layer` in 0 to 4; (3) `yearlyEntries('aging')` ids are `yearly.*` or dotted new ids and strictly ordered by (phase, order, id); (4) `portStatus()` after entering through `aging` and `menus` has four ports, all bound; (5) the cycle baseline has at most 90 modules; (6) `layers-baseline.json` `cycleDirEdges` is `[]`; (7) a scan of `docs/KERNEL.md` finds no U+2014 or U+2013; (8) `docs/KERNEL.md` has a one-line entry for every file in `src/game/kernel/` (a doc that lists a file that does not exist, or misses one, fails; a later track that adds a kernel file adds its line).

**Steps.**
1. Write the doc and the test; run:
   - `/Users/saeed/projects/anotherlife/wt/bin/tc`
   - `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-acceptance.test.ts test/kernel-registry.test.ts test/kernel-bus.test.ts test/kernel-ports.test.ts test/layers.test.ts test/layers-domains.test.ts test/architecture.test.ts test/kernel-parity.test.ts test/hub-entry.test.ts test/world-facts.test.ts test/voice-guards.test.ts`
2. In the commit message list: the hook names K9 converted, the 14 cuts, and the final baseline sizes.

**Acceptance proven.** Every criterion of section 1 has a green named test, and the docs exist.

**Flag.** None. **Depends on.** R2-K12 (all). **Size.** About 60 source lines (the test's helpers), about 80 test lines, about 140 docs lines.

**Risks.** None beyond the sum of the tasks; `test/voice-guards.test.ts` runs because K11 and K12 moved string literals (the headings `Business & Investments`, `Lifestyle`, `Money`, `Leadership`, `Exit` are moved, not new); the em-dash count must stay at 24.

---

## 4. Risks and open questions (for the cross-check)

**Risks.**

1. **Ledger-world's hooks.** Ledger-world merges first and may add entries to `YEARLY_HOOKS` or lines to `ageUp`. R2-K8 and R2-K9 wait for that merge and convert by name; the phase rule for an unknown hook is in R2-K9. If Ledger-world instead puts its world step inside `ageUp` before the loop, K9 turns it into a `world` phase module and says so in its commit.
2. **Ports degrade silently when unbound.** A provider that is not loaded in an isolated test gives the fallback (an empty menu row, a skipped revaluation, no exile move). Guards: `test/hub-entry.test.ts` checks every port is bound after entering through `aging` and `menus`; each cut names its covering tests. A test that fails only for an unloaded provider gets a side-effect import, never a changed assertion.
3. **Parity digests are whole-state.** Any later legitimate simulation change moves `lives`. The rule is re-record with the reason; Platform's per-slice digests (K.7b) will name the slice.
4. **Eager-read scan is a heuristic** (no JS compiler API). It over-flags rather than under-flags; a false positive costs one baseline line. The 25 hazard entries in cycle members are the real exposure and fall as cycles shrink.
5. **Money ratchet.** A cut that moves a raw money call into a new file fails `test/money-ratchet.test.ts`; the plan avoids it (ports for `relocate`), and rule (b) of R2-K5 says so.
6. **Hot-file overlap with Ledger-world's wrapper migration** (about 460 `addMoney`, 160 `earnIncome`, 65 `b.cash +=` sites): the hunks here are import lines and whole-block moves; rebase before R2-K5.
7. **Layer table judgment.** The ratchet makes a wrong row cheap to fix, but the table is a contract for R3 and later.
8. **Test length.** About 2,590 test lines against the usual 1.14 ratio (about 4,500): the proof here is mostly fixtures and ratchets. If the lead wants more, the cheapest additions are property tests in R2-K1 (registry order is a pure function of the set) and R2-K2 (random cascades stay bounded).

**Open questions.**

1. **The phase table.** Today's order has careers before firms (table steps 7 and 6 swapped). The plan keeps today's order (parity) and pins the new phases around it. Confirm, or schedule a later release that moves careers after firms with a deliberate re-record.
2. **The facts shard.** R2-K7 uses Ledger-world's `world/state.ts` API as written in `ledger-world.md` (`ensureWorld`, `worldShard`, `registerShard`) and stores `world.facts = { v: 1, rows }` (a shard with its own version, as design 4.2.1 asks). Confirm that `registerShard` accepts a shard registered by a module other than the world root, and that `worldBudget` (R2-L17) counts it by key.
3. **Special careers and the "one line in `modules/index.ts`" rule.** Because a test that imports only `special.ts` must still run its hooks, `special.ts` registers its own 13 modules; extensions still go in `modules/index.ts`. The same holds for the company view in `manage.ts`. Confirm this split (built-ins self-register, extensions are listed) is what the lead meant.
4. **`ModuleDef.lod` and `.budget`.** Reserved as loose records; K.6 (Ledger-world) should narrow them in its own task. Confirm the names.
5. **Where `seeded` lives.** The plan appends it to `src/game/rng.ts` (L0, outside the wave 0 world-RNG guard). Wave 0 says the older seeded helpers stay in place; if wave 0 moved it, only the import path of cuts 11 and 12 changes.
6. **14 cuts, not about 40.** The measured set is 14 import statements for 72 cross-directory cycle edges. If the lead wants literally 40 statements cut, the remaining candidates are the hub-to-child edges (`business.ts`, `special.ts`, `computer.ts` to their folders), which are correct and should not be cut.
7. **`test/korean-cash.test.ts` changes mechanism** (five hunks, `YEARLY_HOOKS` splice becomes `withYearly`), assertions untouched. Confirm this counts as keeping the test.
8. **Three digest vocabularies in R2.** Wave 0's `parityDigests` (11 slices plus text, `test/r2-parity-kit.ts`), Platform's `sliceDigests` (`test/golden-kit.ts`, its own `canonicalJson` and 16-digit `fnv`), and this track's group digests (menu groups and company views, `fnv1a` of `src/game/text/hash.ts`). Each answers a different question, so the plan does not unify them; consider folding `parityDigests` into `golden-kit` after R2.
9. **`ModuleDef.slices` and Save's guard (resolved by the cross-check: Save's R2-S1 makes `hasSlice('world.<name>')` true for any `<name>` that matches a shard name while `world` is a `subkeys` slice, and R2-S12 also checks the name against Ledger-world's `shardNames()`).** Save's S12 test asserts every entry of a module's `slices` passes `hasSlice` (`save.md` S12, assumption 2: `readonly string[]`, which matches). `factsModule` declares `slices: ['world.facts']`: that holds only if Save's `world` slice treats each key of `g.world` as a sub-slice (`world.<key>`, as `save.md` S1 describes); if it needs an explicit `defineSlice('world.facts', ...)`, add it in Save's table. Also: Save's `world` slice should import `src/game/world/facts` for effect, or `normalizeWorld` drops `world.facts` in a process that has not loaded `modules/index.ts` (R2-K7 behaviour section).
10. **`yearlyWorld` runs last.** Ledger-world puts `['world', yearlyWorld]` after `milestones` (R2-L17) and asks that it stay after every money-booking module. The plan gives it the phase `settle` (after `close`, before `news`) and keeps the early `world` phase for W1 to W6, which R4 and R10 fill. Design 4.2.5 says "one hook right after `yearlyEconomy`"; confirm that W7 (invariants, demotion) belongs at the end and W1 to W6 at the start.
