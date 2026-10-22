# The kernel

The note every track reads before it adds a module (R2, v5.0.0). It replaces appends to `docs/ARCHITECTURE.md`. Plain hyphens only: `test/kernel-acceptance.test.ts` fails on an em-dash or an en-dash here, and on a kernel file that has no line in section 9.

## 1. The module registry

- A module is a `ModuleDef` (`src/game/kernel/registry.ts`): an `id`, a `layer` (0 to 4), the saved `slices` it owns, and its `yearly`, `menus` and `handles` entries. `facts` lists the fact kinds it may emit. `lod` and `budget` are reserved records for the level-of-detail framework.
- `registerModule` and `registerModules` check a definition whole, then copy and freeze it. A throw leaves the registry as it was. One id has one module and one slice has one owner.
- Every order is a pure function of the registered set: (phase, order, module id, index in module). The order modules are imported in never matters.
- `yearlyEntries(seam)`, `menuEntries(path)`, `collectMenu(path, g, a, ctx)`, `handlersFor(kind)`, `registeredSlices()`, `registeredFacts()` read frozen lists, rebuilt after a registration. They draw no random number and read no clock.
- A test swaps a list with `withYearly(seam, entries, fn)`, or `withAging(edit, fn)` from `test/kernel-kit.ts`.

The aging seam is `ageUp`: the clock and the economy step run first, then one entry per module in phase order. Orders are multiples of 10, so a track takes the gap between two. A module reads only what earlier phases wrote in the same year. Ids are `yearly.<name>`.

| Phase | What runs there (order) |
|---|---|
| `geopolitics` | the geopolitics step (empty) |
| `world` | the world step W1 to W6: demography, labor, firms, housing, government, prices (empty) |
| `frontier` | frontier and rival ledgers (empty) |
| `society` | the society step (empty) |
| `life` | history 10, digest 20, household 30, effort.you 35, relationships 40, sharedProjects 50, givingFund 60, background 70, royalty 80, royalCareers 90, health 100, education 110, professions 120 |
| `careers` | career 10, special 20 |
| `government` | nation 10 |
| `firms` | workshop 10, corruption 20, business 30, techWaves 40 |
| `money` | development 10, investments 20, hedge 30, shops 40, computer 50, finance 60, wealth 70, familyUse 80, nepo 90, willFeuds 100 |
| `assets` | immigration 10, assets 20, crime 30, underworld 40 |
| `advisors` | advisors 10 |
| `close` | milestones 10 |
| `settle` | W7: world 10 (the world indexes and the invariant check; it runs after every module that books money, and before the year events and the player) |
| `news` | the news detectors (empty) |

Two notes. Today the careers run before the firms, and parity forbids moving them, so a careers module that needs this year's company books reads last year's rows. Moving them is a later release with a deliberate re-record (section 6).

The special seam is `yearlySpecial` in `special.ts`, called from the `special` hook of `careers`:

| Phase | What runs there (order) |
|---|---|
| `service` | military 10 |
| `careers` | actor 10, music 20, sports 30, gamedev 40, author 50, model 60, politics 70, astronaut 80, careers2 90, hustler 100 |
| `public` | social 10, fame 20 |

Menus are slots, named `assets.money`, `assets.tail`, `shopping.stores`, `shopping.lifestyle`, `activities.items`, `special.careers`, `special.jobs`, and for one company `business.view.top`, `.run`, `.money`, `.lead` and `.exit`. A slot matches `/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/`, so a track may open a new one. Inside a slot the phases are `head`, `main` (the default) and `tail`.

## 2. How to add a module

1. Write `src/game/<area>/module.ts` exporting a `ModuleDef`: id `<area>.<name>`, `layer`, and the entries it has.
2. Add one line to `src/game/modules/index.ts`. The list is sorted by id, one module per line; `test/kernel-registry.test.ts` fails on an unsorted or repeated id. That line is the only edit outside your own files.
3. Pick a phase from the table by what your module reads, and an order in the gap.
4. Declare `slices` (every saved key you own), `facts` (every kind you emit) and `handles` (every kind you hear; a handler names the one slice it writes).
5. Luck comes from a named stream, `stream(g, tag, year, id)` in `kernel/streams.ts` (see `docs/STREAMS.md`), never `g.rng`. `test/world-streams.test.ts` holds the kernel, world and modules folders, and any file that calls `registerModule(`, to that. A player's own roll in such a file carries `// rng-ok: <reason>`.
6. Built-ins that live in a big file register themselves (`special.ts`, and the company view in `business/manage.ts`, which uses the plural `registerModules(` because it holds eleven of the player's own rolls). Extensions are listed in `modules/index.ts`.
7. Test it with `loadModules()` and `withGuard()` from `test/kernel-kit.ts`, add your entry file to the hub list of `test/hub-entry.test.ts`, and run `test/kernel-acceptance.test.ts`.

## 3. The bus

- Facts are discrete events (a bankruptcy, a layoff round). Money flows go through the ledger, never through a fact.
- `emit(g, fact)` (`kernel/bus.ts`) is called only from yearly steps and from actions, never from a menu, a hint or a view. The deep-freeze purity walk in `test/fuzz-kit.ts` throws on a write, so a violation is caught.
- A fact goes to the handlers of its exact kind sorted by module id, then to the `'*'` handlers sorted by module id. It is synchronous: when `emit` returns, every handler has run.
- A fact a handler emits waits in a first-in first-out queue and is delivered after the current handler returns. One top-level `emit` causes at most 64 deliveries (`FACT_LIMITS.cascade`); a cascade past that is cut and counted in `busStats`.
- A kind no module declared in `facts`, or a fact `normalizeFact` rejects, is dropped and counted. `normalizeFact` is the only door a fact comes in by.
- A handler writes only the slice it declares. `ownSliceGuard()` in `test/kernel-kit.ts` proves it; production never sets a guard.
- `world/facts.ts` keeps what the bus hears in `g.world.facts`: at most 400 rows, 12 of one kind in one year, keyed by (kind, year, subject, other party) so a replayed year adds nothing. `readFacts(g)` is a pure read.

## 4. Ports and contracts

When a domain needs another domain, it imports that domain's `contract.ts`, or defines a port. A port (`kernel/ports.ts`, `definePort(name, fallback)`) is defined by the lower module with a fallback that says what the world looks like without the feature. The owner binds the real function with `.use(fn)` when the owner loads, once. Callers invoke the port and never learn who owns it. `portStatus()` lists every port and whether it is bound.

| Port | Defined in | Bound by |
|---|---|---|
| `business.revalueCompany` | `business/contract.ts` | `business/economy.ts` |
| `computer.gameMakingMenu` | `computer/contract.ts` | `special/gamedev-make.ts` |
| `activities.relocate` | `activities/contract.ts` | `activities/immigration-move.ts` |
| `workplace.ordinaryJobs` | `workplace/contract.ts` | `careers.ts` |

An unbound port degrades quietly (an empty menu row, a skipped revaluation), so `test/hub-entry.test.ts` checks that every port is bound after entering through `aging` and `menus`. A test that fails only because a provider is not loaded gets a side-effect import of the provider, never a changed assertion.

## 5. The ratchets

A baseline can only shrink. Never edit one by hand; a stale entry or a new one fails the test and the message names the command.

| Layer | Holds |
|---|---|
| L0 kernel | `src/game/kernel/**`, and the root files `types`, `rng`, `core`, `scripts`, `talents`, `assetHooks`, `flags`, `world-flags`, `notice-weights`, `timeMachine` |
| L1 data | `src/game/data/**`, `history/**`, `text/**`, `world.ts` |
| L2 world | `src/game/economy/**`, `world/**`, `effort/**`, and `nation/state.ts`, `effects.ts`, `trade-policy.ts` |
| L3 domains | everything else under `src/game` |
| L4 assembly | `src/game/modules/**`, `hubs/**`, and the root files `aging`, `menus`, `life`, the save files, `snapshot-codec`, `offline`, `birth-background`, `life-series`, `inbox`, `notice-policy` |
| L5 ui | `src/ui/**` and the shell files of `src` |

`layerOf` in `test/layer-kit.ts` is the exact table. A new folder under `src/game` is a domain (L3) unless it needs a row.

- Rule (b): an import points to its own layer or lower, never higher. A few upward imports are baselined and can only shrink. One that starts in L0 fails even when listed.
- Rule (c): a domain (a folder of `src/game`, or `life` for the root files that belong to none) reaches another domain only through that domain's `contract.ts`. Imports per pair of domains are held to today's counts.
- Rule (d): a module-level `const X = importedValue` from above L1 runs while the module loads. It is held per file, and the ones in an import cycle are the real hazard (ceiling in `test/layers-domains.test.ts`). L4 and L5 files outside every cycle are exempt.
- Rule (e): no import cycle has an edge between two directories (`cycleDirEdges` is empty and stays empty). The cycle set itself is `test/architecture-baseline.json` (R1): a module joining a cycle, or two cycles fusing, fails.

Commands, run with one worker (`--maxWorkers=1`):

- `UPDATE_ARCH_BASELINE=1 npx vitest run test/architecture.test.ts` shrinks the cycle baseline after a cut. `UPDATE_ARCH_BASELINE=split` splits it to the current components and throws on a module it does not hold, so it never writes a new cycle.
- `UPDATE_LAYER_BASELINE=1 npx vitest run test/layers.test.ts test/layers-domains.test.ts` shrinks the layer baseline and throws on any addition.
- `UPDATE_LAYER_BASELINE=rebase` accepts growth once, for the day a track built beside the others merges in. It prints every entry it added; the commit message lists them. An edge out of L0 is never accepted.

## 6. The parity fixture

`test/fixtures/kernel-parity.json` (recorder `test/parity-kit.ts`, test `test/kernel-parity.test.ts`) was recorded on the code before any module was converted. It holds the hook names of both seams in run order, the state digests of four seeded lives and the v4.0.2 save, a digest of the menu ids of four canned lives, and a digest of the company view ids of every industry and five special companies. Floats are cut to 9 significant digits before digesting, because `Math.log` and `Math.pow` differ in the last bit between machines.

A conversion never moves it. Re-recording is for a deliberate change of the yearly order, a menu tree, a company view or the simulation, with the reason in the commit message: `RECORD_KERNEL_PARITY=1 npx vitest run --maxWorkers=1 test/kernel-parity.test.ts`, under Node 22 (the CI version). Never edit the data by hand.

## 7. The load-order checklist

- No eager read of an imported value in a module that sits in an import cycle: no `const X = IMPORTED` at module level. Use an arrow or a function, so the read happens when it is called.
- Enter through your hub: add its entry file to `HUBS` in `test/hub-entry.test.ts`, which imports each hub first in a fresh module registry and checks nothing is `undefined`.
- Bind ports at the provider's module load, with an arrow or a function declaration. Add the port name to `EXPECTED_PORTS` in `test/hub-entry.test.ts` and to `PORTS` in `test/kernel-acceptance.test.ts`.
- Register with bare calls and arrows, so the registry's own load adds no eager read.
- `aging.ts` and `menus.ts` import `modules/index.ts` for the effect: that is what loads the modules before anything asks the registry for a list.

## 8. The 14 cuts of R2, and what remains

The cycle set fell from 147 modules in 5 cycles to 90 modules in 8, and no cycle edge crosses a directory any more. The 14 import statements:

- Cuts 1 to 5: `computer/dev-common`, `dev-learn`, `dev`, `money-common` and `online` no longer import `computer.ts`. The access predicates moved to `computer/access.ts`, and `computer.ts` re-exports them.
- Cuts 6 and 7: `computer/dev-state` and `special/gamedev-core` no longer import `business/economy`. `localPay` moved to `data/local-pay.ts`, and `business/economy` re-exports it.
- Cut 8: `computer/dev-venture` calls `economicCycle` from `economy` instead of `cycleOf` from `business/economy`.
- Cut 9: `underworld.ts` revalues a company through the port `business.revalueCompany`.
- Cut 10: `computer/dev-projects` opens the game-making menu through the port `computer.gameMakingMenu`.
- Cuts 11 and 12: `business/ai-bench` and `business/competition-roster` import `seeded` from `rng.ts`. It moved there from `assets.ts`, which re-exports it.
- Cut 13: `nation/consequences` moves a player into exile through the port `activities.relocate`.
- Cut 14: `special/model-exit` hires through the port `workplace.ordinaryJobs`.

What remains is K.2 phase 2 (R3 and later). The 59-module cycle in `business/` (the bank, board, company and market files). Thirty-one other modules in seven cycles, each inside one directory: `special/model-*` (8), `special/actor-*` (7), `special/astronaut-*` (6), `business/conglomerate-menu`, `conglomerate`, `manage`, `yearly` (4), and the pairs `assets` with `landlord`, `computer/money-options` with `money-stocks`, `crime` with `underworld`. A cut that frees a module shrinks the baseline with the usual command.

## 9. The files of src/game/kernel

One line each. A track that adds a file here adds its line; `test/kernel-acceptance.test.ts` fails on a file with no line and on a line for a file that is not there.

- `src/game/kernel/bus.ts` - the bus: `emit`, `setBusGuard`, `busStats`; synchronous, bounded, handlers in module id order.
- `src/game/kernel/fact.ts` - the `Fact` type, `FACT_LIMITS` and `normalizeFact`, the one door a fact comes in by.
- `src/game/kernel/forks.ts` - the Time Machine's timeline forks and the tags they put on seeded rolls (`timeMachine.ts` re-exports it). A family keeps its newest 128 forks (`FORKS_MAX`, read and written alike): there is one fork per start year, so the bound is reached only by jumping in 128 different calendar years, and the oldest fork is then let go at the jump.
- `src/game/kernel/ids.ts` - entity ids such as `person:p42` and `firm:a7`: `EntityRef`, `ref`, `isRef`, `parseRef`.
- `src/game/kernel/ledger-types.ts` - the saved shape of the ledger, types only.
- `src/game/kernel/ledger.ts` - the ledger: `book`, `bookMint`, `bookBurn`, `checkLedger`, `flowsOf`; every dollar is an entry between two accounts.
- `src/game/kernel/ports.ts` - `definePort` and `portStatus`: how one domain calls another without importing it.
- `src/game/kernel/reasons.ts` - the reason table: why money moved, who is on the other side, and the closed lists of mints and burns with their yearly caps.
- `src/game/kernel/registry.ts` - the module registry: `ModuleDef`, `registerModule`, `YEARLY_PHASES` and the sorted lists.
- `src/game/kernel/shapes.ts` - shape tables for the save: `packShapes` writes a repeated object shape's key list once, `unpackShapes` reads it back under hard limits.
- `src/game/kernel/slices.ts` - the slice table: every piece of saved state declares its home chunk, caps, `normalize` and `migrate`; `sliceOf`, `hasSlice`.
- `src/game/kernel/spreads.ts` - the bid-ask spreads of the pools: `ask` and `bid`, so no pool trades at the mid price both ways.
- `src/game/kernel/streams.ts` - named streams, `stream` and `outcomeStream`: the only source of luck a world module may use.
- `src/game/kernel/tally.ts` - a company's cash by reason: the small tally the exact cash walk is built from, bounded and whole dollars.
- `docs/QUIET.md` - how a year closes in the store (R3): the fields `s`, `a` and `w`, the weights, the budget, the year card, the `yearCard` flag and the pace families. Its code is in `src/game/hubs` and `src/game/text/pace.ts`, not in the kernel.
