# R1 track plan: Navigation (search, palette, pins, recents, breadcrumbs, regrouping, cockpits)

Release R1 (v4.1.0, "See it"). Base: v4.0.2 at a local clone (quote the path; it has spaces). Roadmap items: G.8 navigation core, G.9 search and palette (with pins, recents, breadcrumbs), G.5 cockpits (moved into this track by the brief). Roadmap text: Part D.6 (lines 915-921), D.1 (787-795), D.11 (954-976), decisions D23 and D24 (1101-1102); design sections 12.2 and 12.3. G.11 (digest, inbox), G.12 (accessibility) and G.14 (lazy chunks, LifeLog) are other plans.

Every code claim below was checked against the v4.0.2 source (paths, ids, line numbers, import cycles). Corrections to the roadmap are in "Plan vs code" at the end.

## 1. Track summary

**Items covered.**
- G.8: Activities regrouped into 8 sections (Do Anything on top, Surrender last), "Needs you" badge rows, `peopleMenu` adapter, keyword table, lint ratchet, tree snapshot test.
- G.9: pure search index and ranking, palette (Ctrl or Cmd+K, "/"), pins (12) and recents (8) in `localStorage` key `anotherlife.ui.v1`, header search button and inbox bell, 1 to 4 and A shortcuts, breadcrumbs with `popTo(n)`, the "Back to" chip as the newest recent.
- G.5: company cockpit (KPI tiles plus Run, Money, Leadership, Exit tiles), wealth cockpit (net-worth line plus one card per company from `companyCards(g)`), thin cockpits on Occupation, Relationships and Activities (Needs you and a Pinned/Recent strip; full Career, People and World cockpits stay G.10, R4 to R8).

**Line budget.** About 3,830 source lines (cross-check: N7 +60 for the inbox sheet, N6 and N9 smaller without the `React.lazy` shells, N10 no flip) and about 3,850 test lines in 10 tasks (about 16 agent-hours at 4.1 per 1,000). The roadmap budgets 2,400 for this scope (G.8 800 + G.9 900 + G.5 700). The extra 1,500 is work the roadmap names but does not size: the `peopleMenu` adapter and keyword table (250), the pins/recents store (200), shortcuts and header (280), the three thin tab cockpits (350), the lint harness and test kit (40 source, 520 test), lazy shells. Cut list if the lead must trim, in order: (1) Occupation job-card tiles (120), (2) Pinned/Recent strip on cockpits (90), (3) keyword rows beyond the first 40 (50), (4) inbox bell (40).

**Order.** R1-N1 to N3 are Wave 1 of D.1 (G.8), R1-N4 to N7 Wave 2 (G.9), R1-N8 to N9 Wave 3 (G.5, cockpits last), R1-N10 is the release sweep (cross-check: it no longer flips the flags; the lead's release commit does). Serial order N1 to N10. Allowed parallelism: N2 with N3; N4 with N5. Cross-check merge order against other tracks: A6 before N2; A5 before N5; A4, A8 before N6; R1-T5, R1-T6 before N7; R1-C5 before N8; R1-C9, R1-C15 before N9 (`00-crosscheck.md` section 4).

**Hot files (every edit additive, in its own hunk).**

| File | Tasks | Notes |
|---|---|---|
| `src/game/types.ts` | none (R1-P2 owns every new field) | N1 only verifies; stops and reports if a field is missing |
| `src/game/flags.ts` (R1-P3) | none | R1-P3 declares `navRegroup`, `navPalette`, `cockpits`; the lead's release commit flips them; tasks only read `FLAGS` |
| `src/ui/components/MenuList.tsx` | N2, N5 | `MenuRow` badge pill (N2); `popTo`, `openPath`, `onRan`, `submit` (N5). R1-A6 (roving tabindex) rewrites the row loop first; R1-C13 and R1-C14 edit the `info` branch and the end slot. Cross-check order **A6, N2, C13, C14, N5** |
| `src/ui/components/menuModel.ts` | N2, N5 (R1-C13 adds `infoChart` mid-file, right after `infoText`) | pure helpers appended at the end, N2's `nodeBadge` first, N5's three helpers after it |
| `src/ui/components/Sheet.tsx` | N5 | one optional `subheader` prop. G.12 edits the same file (focus trap): disjoint |
| `src/ui/components/MenuSheet.tsx` | N2, N5, N9 | root-level cards, breadcrumbs, cockpit panel, each its own hunk |
| `src/ui/components/PersonSheet.tsx`, `RelationshipsSheet.tsx` | N5, N9 | breadcrumbs; cockpit and Needs you on the Relationships root |
| `src/ui/components/Header.tsx`, `BottomBar.tsx`, `src/ui/screens/GameScreen.tsx` | N7 (N5 touches `remember` in `GameScreen.tsx`) | search button, bell and the inbox sheet wiring (cross-check: N7 owns them), shortcuts, palette host. R1-A7 resizes `.hdr-icon` and R1-A5 adds `data-focus-home` to `BottomBar`: new buttons reuse the class and pick it up; A5 merges before N7 |
| `src/game/business/manage.ts`, `business.ts`, `business/conglomerate-menu.ts`, `special/gamedev.ts`, `business/dashboard.ts` | N8 | `businessScreen` plus one-word call-site edits plus `export` on `runway` |
| `test/fuzz-kit.ts` | N8 | one line: `hub.` groups do not add depth |
| `src/game/menus.ts`, `src/ui/store.ts`, `src/game/core.ts`, `ModalHost.tsx` | none | the design keeps data order (section 2 below), so `menus.ts` stays untouched; G.11 owns `store.ts`, `core.ts`, `ModalHost.tsx` |

**New directories.** `src/game/hubs/` (pure, game layer), `src/ui/nav/` (UI), `src/ui/styles/nav.css` (imported from components, like `business.css`). None exists in v4.0.2 (checked). Cross-check: `src/ui/nav/lazy.tsx` (new, N6) is the gate file for the palette; the palette zone is `Palette.tsx`, `paletteModel.ts`, `searchIndex.ts`, `searchRank.ts`, `useSearchIndex.ts` (a11y A8 test 9). No `hubs/*` module may import `src/game/menus.ts` (it reaches `manage.ts`; the import graph shows a cycle otherwise).

## 2. Design decisions that shape the tasks

1. **Data order never changes; regrouping happens at render time.** The five seeded driver tests (`test/simulate.test.ts:167`, `test/main-character-life.test.ts:137`, `test/era-features.test.ts:410`, `test/history.test.ts:447`, `test/anachronism.test.ts:213`) collect actions from `activitiesMenu.children(g)` and `d.pick(...)` by position. Reordering the children would shift every seeded play and break "R1 changes no simulation output". So `activitiesMenu`, `assetsMenu` and `occupationMenu` are not edited. A pure UI function `regroupForDisplay` (N2) reorders and adds headings only inside `MenuSheet`. The tree snapshot test therefore proves two things: the set AND the DFS sequence of reachable action id paths is identical before and after.
2. **The company cockpit is a new wrapper, not a rewrite.** `businessView(g, a)` stays flat and exported: `test/company-dashboard.test.ts:136-139` pins its first rows and the top-level `biz.details` and `biz.milestones` ids. A new `businessScreen(g, a)` (in `manage.ts`) returns the cockpit when `FLAGS.cockpits` is on, else the flat list. Four call sites switch to it: `business.ts:35`, `business.ts:88`, `business/conglomerate-menu.ts:323`, `special/gamedev.ts:152`. Hub groups carry the id prefix `hub.`; the snapshot test strips those segments, so paths of real actions compare equal. The cockpit keeps the flat DFS order (header-zone groups first, then the four tiles in flat order).
3. **No import cycles.** `src/game/hubs/*` modules import only modules that are acyclic today. Checked with a throwaway Tarjan pass over runtime imports (146 modules in cycles, components 82, 30, 19, 7, 6, 2; the roadmap's 147 comes from the esbuild graph): `menus.ts`, `dashboard.ts`, `business/state.ts`, `core.ts`, `relationships.ts`, `economic-report.ts` are acyclic; `manage.ts`, `business.ts`, `careers.ts`, `conglomerate-menu.ts`, `special/gamedev.ts` are in the 30-module cycle; `assets.ts` is in the 19-module one. Hypothetical `hubs/{sections,needs,people,company,wealth,keywords}.ts` plus `flags.ts`, imported from `menus.ts` and `manage.ts`, stay acyclic. A hub must never import `manage.ts`, `business.ts`, `career.ts`, `assets.ts` or (cross-check, from the rebuilt import graph: `menus.ts` reaches `manage.ts`, and `dashboard.ts` reaches the 85-module component, which is fine only because nothing there imports a hub) `menus.ts`. `hubs/company.ts` receives `rebuild` by injection for the same reason. `test/architecture.test.ts` (Platform K.1) is the gate; run it in every task that adds a `src/game` module.
4. **Search state is UI state.** Pins, recents and the index cache live in `src/ui/nav/`, never in `GameState` (`act()` clones the state every tap and the Time Machine would rewind it). No `src/game/**` file imports from `src/ui/nav` (N10 scans for it).
5. **Index entries are data, nodes are re-resolved.** The index stores `idPath` strings. A tap re-resolves the live node from the latest state (same idea as `resolveTrail` and `resolveReturnPoint`); a stale entry shows a toast and drops the cache. Closures captured at index time are never run.
6. **Everything ships dark** behind `FLAGS.navRegroup`, `FLAGS.navPalette`, `FLAGS.cockpits` (declared by R1-P3, all false until the lead's release commit; cross-check: N1 and N10 neither add nor flip them). Flag off means byte-identical markup and trees to v4.0.2 (tested). Tests set flags with `setFlags({ ... })` in `beforeEach` and `resetFlags()` in `afterEach`, or `withFlags(over, fn)`; `FLAGS` is readonly, so assignment does not compile, and module mocks of `src/game/flags` are forbidden (R1-P3 guard test).

## 3. Cross-track contracts

**Relied on (other tracks provide; if a name differs, change one adapter file named below, not the call sites).**

| Id | Provider | Contract | Adapter file here |
|---|---|---|---|
| C-TYPES | Platform R1-P2 | `types.ts`: inside the unexported `interface MenuBase`: `keywords?: readonly string[]` (cross-check: readonly, so `keywordsOf` must accept it), `section?: string`, `badge?: (g: GameState) => string \| number \| null`; inside `MenuInfo`: `chart?: (g: GameState) => ChartSpec \| null` with `import type { ChartSpec } from './charts/spec'` | none (N1 verifies and stops if a field is missing; it never adds one) |
| C-FLAGS | Platform R1-P3 | `src/game/flags.ts` exports `FLAGS` (a readonly live view over `FLAG_DEFS`), `flagOn(key)`, `setFlags(over)`, `resetFlags()`, `withFlags(over, fn)` and `type FlagKey`; the keys `navRegroup`, `navPalette`, `cockpits` (and `quietInbox`, read by N7) are pre-declared with default false. Tests call `setFlags` in `beforeEach` and `resetFlags` in `afterEach`, or `withFlags`; they never assign to `FLAGS` and never `vi.mock` the module | none |
| C-ARCH | Platform K.1 | `test/architecture.test.ts` green | none |
| C-SPEC | Platform R1-P2 (types, `CHART_LIMITS`) and Charts R1-C1 (`readChartSpec`, `SPEC_LIMITS`) | `src/game/charts/spec.ts`: `type ChartTone = 'c1'\|'c2'\|'c3'\|'c4'\|'c5'\|'c6'\|'good'\|'bad'\|'muted'`, `interface ChartSpec` (D.2 lines 802-815), `readChartSpec(json: unknown): ChartSpec \| null` | none |
| C-KPI | Charts G.1/G.2 | a spec with `kind: 'kpi'` renders one tile per series: value is the last non-null of `values` formatted with `unit`, delta is last against the previous non-null, sparkline is `values`, `x` labels the points | `src/game/hubs/company.ts` builds the spec; `CockpitBody.tsx` renders |
| C-VIEW | Charts G.2 (R1-C9, R1-C13) | `src/ui/charts/lazy.tsx` exports `LazyChartView(p: { spec: ChartSpec \| null; fallback?: ReactNode })`; the component behind it, `ChartView({ spec })`, picks the plot by `spec.kind` and wraps it in `Frame`. `MenuRows` renders a `MenuInfo` that has a valid `chart` through `LazyChartView` (the `text` is the fallback and the accessible summary). **Nothing outside `src/ui/charts/` may import the chart components at runtime** (a11y `test/lazy-zones.test.ts`) | `src/ui/nav/kit.ts` re-exports `LazyChartView`, `LazyKpiTile`, `LazySparkline` from `../charts/lazy` (cross-check: it no longer re-exports the components) |
| C-TILE | Charts G.2 (R1-C7, R1-C9) | `LazyKpiTile` takes `KpiTileProps = { label: string; value: string; note?: string; delta?: { text: string; dir: 'up'\|'down'\|'flat'; good: boolean \| null }; values?: readonly (number \| null)[]; tone: ChartTone; onPress?: () => void }` plus `fallback?: ReactNode`; `LazySparkline` takes `SparklineProps = { values: readonly (number \| null)[]; tone: ChartTone; label: string; fmt?: (n: number) => string; width?: number; height?: number }` plus `fallback?` | `src/ui/nav/kit.ts` |
| C-SERIES | Charts R1-C3 (`lifeRows`, `src/game/life-series.ts`) and R1-C15 (`netWorthSpec`, `src/game/charts/networth.ts`) | pure `lifeRows(g: GameState): { age: number; year: number; netWorth: number; cash: number; debt: number }[]` (validated, bounded, oldest first) and `netWorthSpec(g: GameState): ChartSpec \| null` (null under 2 rows). The names are now final, so the adapter is a two-line re-export | `src/game/hubs/series-adapter.ts` (N9 creates) |
| C-A11Y | a11y R1-A4 to A8 | `ModalSurface({ role, label?, className?, children })` (every full-screen surface, the palette included), `isModalOpen(): boolean`, `rovingMove`/`rovingStop`, `lazyView(name, load)` and the gate-file rule (`src/ui/charts/lazy.tsx`, `src/ui/nav/lazy.tsx`); `Sheet`, `MenuList`, `Header` get focus and size changes | merge order A6 before N2, A5 before N5 and N7, A4 and A8 before N6; otherwise disjoint hunks |
| C-INBOX | Notices R1-T5, R1-T6 | `inboxUnread(g: GameState \| null \| undefined): number` and `readInbox` (`src/game/inbox.ts`), `InboxSheet(props: { onClose: () => void; onOpenLink?: (link: string) => void })` (`src/ui/components/InboxSheet.tsx`), the player setting `Settings.quietMode`, the flag `quietInbox`. N7 builds the bell and the sheet wiring (cross-check) | N7 |

**Provided (other tracks may rely on).**
- Uses of `FLAGS.navRegroup`, `FLAGS.navPalette`, `FLAGS.cockpits` (declared and flipped by others, see C-FLAGS).
- `registerBadge(id, fn)` and `registerBadgePrefix(prefix, fn)` in `src/game/hubs/needs.ts`: later releases add "Needs you" signals without touching menus.
- `peopleMenu` (`src/game/hubs/people.ts`): each person is the group `person.<id>` (R4 relies on it).
- `PlaceRef`, `placeKey`, `parsePlaceKey` (`src/ui/nav/place.ts`): the string form R1-T5 stores as an inbox deep link (tab, then group ids made of `[A-Za-z0-9._:-]`; no `#id`); `placeToReopen` (`src/ui/nav/reopen.ts`).
- `businessScreen(g, a)`, `companyCards(g)`, `cockpitOf(tab, g)`.
- `test/nav-kit.ts`: canned states, tree walker, canonical paths (other tracks may reuse it for purity probes).

## 4. Rules for every task here

- Test first: write the tests, see them fail, then implement. One commit per task with explicit pathspecs; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Checks: `npm run typecheck`, then `NODE_OPTIONS=--max-old-space-size=2048 npx vitest run --maxWorkers=1 <the task's test files>`; for tasks that add a `src/game` module also `test/architecture.test.ts`. Never run the full suite.
- No `g.rng` draw, no write to `GameState`, no `earnIncome(`, `spend(`, `addMoney(` in any new file. Builders and index code are pure and `deepFreeze`-safe.
- Voice (`docs/VOICE.md`): no U+2014 or U+2013 anywhere, contractions, tooltip 120 characters, badge 12 characters, choice-like labels 5 words. Use the middle dot for separators, as the repo does.
- All tests run in node; UI is tested by pure functions and `renderToStaticMarkup(createElement(...))`. `vite.config.ts` only collects `test/**/*.test.ts`, so a test is never a `.tsx` file. Effects do not run in `renderToStaticMarkup` and state setters are no-ops after a server render; to test a hook, call it inside a throwaway component that stores its return value in a variable.
- Stores mocked by other tests (`test/screens.test.ts` mocks `../src/ui/store` with a fixed export list): new UI code must not add new imports from `ui/store` beyond `getApp`, `useApp`, `goTo`, `setReturnPoint`, `clearReturnPoint`, `runMenuAction` (all exist).
- Under vitest, CSS imports from components are fine (`test/annualReport.test.ts` already imports a component that imports `business.css`).
- Cross-check rules: (a) flags: `setFlags`/`resetFlags` or `withFlags`, never assignment or a module mock; (b) chart kit: import only `LazyChartView`, `LazyKpiTile`, `LazySparkline` through `src/ui/nav/kit.ts` (a11y zone rule); no `React.lazy` anywhere (`renderToStaticMarkup` cannot wait for it; use `lazyView` from `src/ui/lazy/lazyView`); (c) full-screen surfaces render through a11y's `ModalSurface`; (d) every test that walks or indexes a canned state must use the memoised helpers of `test/nav-kit.ts` (`walkTreeCached`, `buildIndexCached`) so a file never walks the 11,822-node CEO tree more than once per option set; (e) do not edit `types.ts`, `flags.ts`, `world-flags.ts` or `core.ts`.

---

## 5. Tasks

### R1-N1 Menu-tree test kit, type check and lint ratchet

**Roadmap items.** G.8 (tree snapshot test, lint), D.11 criterion 6 (first half).

**Files.**
- Create `test/nav-kit.ts`, `test/nav-kit.test.ts`, `test/nav-tree.test.ts`, `test/fixtures/nav-lint-baseline.json` (generated).
- No edit to `src/game/types.ts` or `src/game/flags.ts` (cross-check): R1-P2 adds the C-TYPES fields and R1-P3 declares `navRegroup`, `navPalette`, `cockpits`. Grep for the fields first; if one is missing, R1-P2 has not merged: stop and tell the lead.

**Interfaces (`test/nav-kit.ts`).**
```ts
import type { GameState, MenuAction, MenuGroup } from '../src/game/types'
export type NavTab = 'occupation' | 'assets' | 'relationships' | 'activities'
export type NavStateName = 'kid' | 'adult' | 'ceo' | 'elder'
export function navState(name: NavStateName): GameState        // built once per name per file (memoised), returns a fresh structuredClone
export function frozen(name: NavStateName): GameState          // structuredClone + deepFreeze (import deepFreeze from ./fuzz-kit)
export interface WalkOpts { maxDepth?: number; maxNodes?: number; roots?: Partial<Record<NavTab, MenuGroup>> }   // defaults 8 and 30000
export interface Walked { tab: NavTab; ids: string[]; type: 'action' | 'menu'; node: MenuAction | MenuGroup; rows: number }
export function walkTree(g: GameState, opts?: WalkOpts): Walked[]   // DFS pre-order, visible nodes only; locked groups are listed but not entered
export function walkTreeCached(name: NavStateName, opts?: WalkOpts): Walked[]   // cross-check: memoised per (name, opts) inside one test file; a frozen state, so the result is never mutated
export function actionSequenceCached(name: NavStateName, opts?: WalkOpts): string[]
export function canonical(w: Walked): string                       // `${tab}/${ids.join('/')}` with every segment that starts with 'hub.' removed
export function actionSequence(g: GameState, opts?: WalkOpts): string[]   // canonical paths of actions in DFS order
export function normId(id: string): string                         // every run of digits becomes '#'
export function lintViolations(g: GameState, opts?: WalkOpts): { tooLong: string[]; single: string[] }  // normalised ids of groups
```

**Behaviour.**
1. Canned states (deterministic, all with `g.queue = []`):
   - `kid`: `createNewLife({ seed: 4101, year: 2020, countryId: 'us' })`, age 9.
   - `adult`: seed 4102, year 2026, age 35, `money` 250000, a full-time job through `hireForJob` (`careers.ts:806`) with an `InterviewJob` from the jobs data, one house through `houseListings` and `buyHouse` (as `test/assets.test.ts` `adult()` does), two friends and a partner through `createPerson`.
   - `ceo`: the `company()` helper pattern of `test/company-dashboard.test.ts` (copy it; it builds a company, `becomeCeo`, two simulated years) twice (a restaurant and a game studio), age 45, plus the adult extras.
   - `elder`: seed 4104, age 78, retired (`c.retired = true`, `c.pension = 24000`), one diagnosed condition of severity 60.
2. `walkTree` roots: `occupationMenu`, `assetsMenu`, `activitiesMenu` from `src/game/menus.ts`, and `relationships`, a local root built from `relationshipGroups(g)` and `personActions(g, p)` with group ids `person.<id>` (N3 replaces it with `peopleMenu`). Use `nodeVisible`, `nodeDisabled`, `groupChildren` from `src/ui/components/menuModel.ts` so errors are caught the way the UI catches them. Depth counting: a group whose id starts with `hub.` adds no depth. Record `rows` = the number of visible action and menu nodes in the parent list.
3. Lint (`lintViolations`): a group is `tooLong` when its visible rows (action or menu) exceed 12 and its children contain no `heading` node, unless its id is in `SECTIONED_ROOTS` (N2 exports that; until then the constant lives in the kit as `['activities']` and N2 imports it); a group is `single` when it has exactly one visible row. Ids are returned through `normId`, sorted, unique.
4. `test/nav-tree.test.ts`: the lint is a ratchet, not a burn-down. Today's counts are 28 over-long and 146 one-row groups on a CEO probe (roadmap D.11 criterion 6) and they sit in 100+ feature files; zeroing them is outside the 800-line G.8 budget (see Plan vs code). The test loads `test/fixtures/nav-lint-baseline.json` (`{ "tooLong": string[], "single": string[] }`, the union over the four canned states) and fails when (a) a normalised id violates and is not in the baseline, (b) a baseline id violates in none of the four states (so the list can only shrink). `NAV_LINT_UPDATE=1 npx vitest run --maxWorkers=1 test/nav-tree.test.ts` rewrites the fixture; the commit message must say why. The message printed on failure names the id and the two ways out (add a heading, or run the update).
5. Generate the fixture in this task from the unmodified tree (state of v4.0.2 plus Wave 0).

**Tests.**
`test/nav-kit.test.ts`:
1. `navState` twice gives equal JSON for each name (deterministic).
2. `normId('biz.plan.a12') === 'biz.plan.a#'`, `normId('person.p7.talk')`, ids without digits unchanged.
3. `canonical` strips `hub.` segments and keeps order; `actionSequence` on a synthetic tree with a `hub.x` group equals the same tree without it.
4. `walkTree` lists a locked group without entering it; a hidden node is absent; a throwing `children` is skipped (console.error spied) and does not abort the walk.

`test/nav-tree.test.ts`:
5. For each canned state the walk finds more than 300 nodes (kid) and more than 4,000 (ceo), no duplicate canonical path (criterion 6: 0 duplicate id paths; if a state truly has one, list it in a `KNOWN_DUPES` constant with a comment, do not weaken the assertion), and no `console.error` from menu callbacks.
6. Walking a frozen state does not throw and does not change `JSON.stringify(g)` (RF5).
7. Lint ratchet as in Behaviour 4 (both directions).

**Flag.** None (the three keys are R1-P3's).
**Hot-file notes.** New files only.
**Depends on.** C-TYPES (R1-P2), C-FLAGS (R1-P3).
**Size.** Source about 40, tests about 520 plus the fixture.

---

### R1-N2 Sections, badges, "Needs you" (render-time regrouping)

**Roadmap items.** G.8 (8 sections, Do Anything on top, Surrender last, Needs you rows), D.11 criterion 6.

**Files.**
- Create `src/game/hubs/sections.ts`, `src/game/hubs/needs.ts`, `src/game/hubs/index.ts` (re-exports), `src/ui/nav/sections.ts`, `src/ui/nav/NeedsYouCard.tsx`, `src/ui/styles/nav.css`.
- Modify `src/ui/components/menuModel.ts` (append `nodeBadge`), `src/ui/components/MenuList.tsx` (badge pill in `MenuRow`), `src/ui/components/MenuSheet.tsx` (regroup the root list, render the card), `test/nav-kit.ts` (import `SECTIONED_ROOTS`).
- Tests: create `test/nav-sections.test.ts`, `test/nav-needs.test.ts`.

**Interfaces.**
```ts
// src/game/hubs/sections.ts
export type SectionId = 'health' | 'love' | 'money' | 'law' | 'travel' | 'fame' | 'home' | 'world' | 'more'
export const SECTION_ORDER: readonly SectionId[]          // health, love, money, law, travel, fame, home, world, more
export const SECTION_LABEL: Readonly<Record<SectionId, string>>
//   'Health and Mind' | 'Love and Social' | 'Money and Games' | 'Law and Crime' | 'Travel' | 'Fame and Media' | 'Home and Shopping' | 'World and Politics' | 'More'
export const ACTIVITY_SECTION: Readonly<Record<string, SectionId>>   // table below
export const SECTIONED_ROOTS: readonly string[]           // ['activities']
export const SECTION_MIN_ROWS = 13                        // shorter lists (prison: 5 rows) are shown as they are
export function sectionOf(node: { id: string; section?: string }): SectionId   // node.section if valid, else table, else 'more'

// src/ui/nav/sections.ts  (UI layer: uses nodeVisible)
export function regroupForDisplay(rootId: string, nodes: MenuNode[], g: GameState): MenuNode[]

// src/game/hubs/needs.ts
export type BadgeFn = (g: GameState) => string | number | null
export const BADGE_MAX_CHARS = 12
export function registerBadge(id: string, fn: BadgeFn): void
export function registerBadgePrefix(prefix: string, fn: (g: GameState, rest: string) => string | number | null): void
export function badgeText(node: { id: string; badge?: BadgeFn }, g: GameState): string | null
export interface NeedRow { node: MenuAction | MenuGroup; badge: string }
export function needsYou(nodes: readonly MenuNode[], g: GameState, max?: number): NeedRow[]   // default max 6

// src/ui/components/menuModel.ts (appended)
export function nodeBadge(node: MenuAction | MenuGroup, g: GameState): string | null   // FLAGS.navRegroup ? badgeText(node, g) : null

// src/ui/nav/NeedsYouCard.tsx
export function NeedsYouCard(props: { rows: NeedRow[]; onTap: (node: MenuAction | MenuGroup) => void }): ReactElement | null
```

**`ACTIVITY_SECTION` (ids verified in v4.0.2; 36 rows).**
- health: `doctor`, `mindBody`, `surgery`, `rehab`, `salon`, `pray`
- love: `love`, `adoption`, `pets`, `pastimes`, `nightlife`, `shared.projects`, `charity`, `zoo`
- money: `casino`, `lottery`, `sweepstakes`, `computer`, `workshop`
- law: `crime`, `corruption`, `lawsuit`, `surrender` (Turn Yourself In), `identity`, `will`, `licenses`
- travel: `vacation`, `emigrate`
- fame: `fame`, `socialMedia`, `movies`
- home: `shopping`, `lifePriorities`
- world: `thisYear`, `economy`, `royal.court`
`doAnything` and `surrenderLife` are special (below). Any other id goes to `more`.

**Behaviour.**
1. `regroupForDisplay`: returns `nodes` itself (same reference) when `rootId` is not in `SECTIONED_ROOTS` or the count of visible action and menu nodes is under `SECTION_MIN_ROWS`. Otherwise returns a permutation plus new headings: leading non-row nodes (info, heading) in order; row `doAnything`; for each section in `SECTION_ORDER` that has at least one visible row, a heading `{ type: 'heading', id: 'activities.h.<section>', label }` then that section's rows in their data order (alphabetical, as `menus.ts` sorts them); then a separator `{ type: 'heading', id: 'activities.h.last', label: '' }` and row `surrenderLife`. `MenuRows` already drops a heading with no visible rows and renders an empty label as a new card with no title (`MenuList.tsx:277-326`). Input nodes are returned by reference, never copied; the input array is not mutated.
2. `MenuSheet` (root level only, `nav.trail.length === 0`): `const shown = FLAGS.navRegroup ? regroupForDisplay(root.id, rootNodes, g) : rootNodes`, passed to `MenuRows`. `resolveTrail`, `useMenuNav` and `returnTarget` keep using the data list.
3. Badges. `badgeText(node, g)`: uses `node.badge` if present, else the registry (exact id, then prefix). A number becomes a string (over 99 gives `99+`); a string is trimmed and cut to 12 characters; empty, null, NaN or a throw (console.error) gives null. Registered signals (all pure, O(1) or O(companies), no `children()`, no `hint`, no `subtitle`):
   - `doctor`: diagnosed conditions with severity 40 or more: one gives `Sick`, n gives `${n} illnesses`.
   - `crime`: `character.wantedLevel > 0` gives `Wanted`.
   - `occupation.jobs`: age 18 or more, alive, not in prison, no `job`, no `partTimeJob`, not `retired`, no `education.current` gives `No job`.
   - prefix `biz.company.` and prefix `asset-` (only when the asset has `kind === 'business'`): `companyHealth(g, a, readBiz(g, a))` id `danger` gives `In danger`, `struggling` gives `Struggling`, else null. Memoise per `(g, assetId)` in a `WeakMap<GameState, Map<string, string | null>>` so a list of 12 companies costs one normalisation each per commit.
4. `needsYou(nodes, g, max)`: the visible, not locked (`nodeDisabled` null), action or menu nodes with a badge, in data order, first `max`.
5. `NeedsYouCard`: a `.menu-section` with heading "Needs you" and one `.menu-row` per row (emoji, label, a pill with the badge text); renders null for no rows. `MenuSheet` shows it above the list at the root when `FLAGS.navRegroup`; a tap goes through `runner.tap(node)`.
6. `MenuRow` shows `<span className="menu-row-badge">` when `nodeBadge` is non-null and the row is not locked. **Cross-check (accessibility):** `.menu-row-end` is `aria-hidden` in v4.0.2 (`MenuList.tsx:349`), so the pill goes inside `.menu-row-text`, after the label and before the subtitle, where a screen reader reads it as part of the row ("Doctor, Sick"). The pill's visible text is the badge text; for a count it reads `3 illnesses` as is. Nothing about the badge goes into `.menu-row-end`, which keeps only the lock, the chevron and (R1-C14) the spark.
7. `nav.css` (new): `.menu-row-badge` (pill, `--action-red` fill, white 12px bold, min 22px high), `.needs-card`. Import it from `NeedsYouCard.tsx` and `MenuList.tsx`.

**Tests.**
`test/nav-sections.test.ts`:
1. Every id of `activitiesMenu.children(adult)` except `doAnything` and `surrenderLife` is in `ACTIVITY_SECTION` (the 'More' bucket is empty for a normal life). The prison variant is excluded.
2. `regroupForDisplay` is a permutation: multiset of non-heading ids equal to the input, none lost or duplicated; input array unchanged; row objects are the same references.
3. First element is `doAnything`; last is `surrenderLife`, preceded by the separator heading; the 8 section headings appear in `SECTION_ORDER` and each is followed by at least one visible row.
4. Inside a section the data order is kept.
5. Prison variant (5 rows) and the roots `assets` and `occupation` come back as the same array reference.
6. An unknown id lands in `More`, before the separator.
7. Seeded-order guard: the ids of `activitiesMenu.children(adult)` equal `['doAnything', ...labels sorted with localeCompare, 'surrenderLife']` computed in the test, proving this task changed no data order (the reason the five seeded tests stay stable).
8. `renderToStaticMarkup(createElement(MenuRows, { nodes: regroup(...), g, onTap }))` contains 8 `menu-heading` elements and the separator starts a `menu-section` without a heading element.
9. The lint of N1 treats `activities` as sectioned: the baseline does not list `activities`.

`test/nav-needs.test.ts`:
10. On the `kid` state every registered badge is null (no false alarms).
11. `doctor`: severity 60 diagnosed gives `Sick`; two give `2 illnesses`; undiagnosed or severity 20 gives null.
12. `crime` with `wantedLevel` 2 gives `Wanted`.
13. `occupation.jobs`: adult without job gives `No job`; employed, retired, student, prisoner give null.
14. Company prefix: negative company cash gives `In danger`; a healthy company and `asset-` of a house give null. Memo: with `vi.mock('../src/game/business/dashboard', async (orig) => ({ ...(await orig()), companyHealth: vi.fn(actual) }))` two `badgeText` calls for the same node and `g` call `companyHealth` once, and a new `g` calls it again.
15. `badgeText`: 5 gives `5`; 250 gives `99+`; `'x'.repeat(20)` is cut to 12; `''` and `NaN` and a throwing fn give null.
16. `needsYou` keeps data order, skips locked and hidden rows, honours `max`.
17. Purity: `needs.ts` source contains none of `.children(`, `bestPlan`, `.hint(`, `subtitle` (string scan); badges run on a frozen state and leave JSON unchanged (RF5).
18. Markup: `MenuRow` shows `menu-row-badge` with the flag on and not with it off, and the pill sits inside `menu-row-text` and outside the `aria-hidden` `menu-row-end` (assert on the markup string: the pill's index lies between `menu-row-text` and `menu-row-end`); `NeedsYouCard` renders heading "Needs you", one button per row, none for zero rows; a tap handler is wired (read `onClick` from the element tree as `test/annualReport.test.ts` `findButton` does).
19. Flag off: `MenuSheet` root markup for activities has no `needs-card`, no `menu-row-badge` and no `activities.h.` heading text, and the `menu-row-label` texts appear in the data order of the visible rows (the v4.0.2 order).

**Proves.** D.11 criterion 6 (snapshot of Activities, lint, Needs you), criterion 12 proxy (no grandchild `children()` call).
**Flag.** `FLAGS.navRegroup` (default false until N10).
**Hot-file notes.** `MenuList.tsx` (`MenuRow` pill, one hunk), `menuModel.ts` (append), `MenuSheet.tsx` (root-level hunk). `menus.ts` is not edited.
**Depends on.** R1-N1; merge after R1-A6 (cross-check: A6 rewrites the row loop and `MenuRow` attributes first, then this hunk applies on top).
**Size.** Source about 500, tests about 420.

---

### R1-N3 People adapter, keyword table, entity rules

**Roadmap items.** G.8 (`peopleMenu`), G.9 (keywords, entities).

**Files.** Create `src/game/hubs/people.ts`, `src/game/hubs/keywords.ts`; modify `src/game/hubs/index.ts`, `test/nav-kit.ts` (use `peopleMenu` as the `relationships` root). Tests: `test/nav-people.test.ts`.

**Interfaces.**
```ts
// src/game/hubs/people.ts
export const PEOPLE_ROOT_ID = 'relationships'
export function personGroupId(personId: string): string         // `person.${personId}`
export function personIdOf(groupId: string): string | null      // 'person.p12' gives 'p12'
export function personGroup(p: Person): MenuGroup
export const peopleMenu: MenuGroup                              // id 'relationships', label 'Relationships', emoji '❤️'

// src/game/hubs/keywords.ts
export const KEYWORDS: Readonly<Record<string, readonly string[]>>
export function keywordsOf(node: { id: string; keywords?: readonly string[] }): string[]   // node.keywords (readonly, as R1-P2 declares it) plus table, lowercase, de-duplicated
```

**Behaviour.**
1. `peopleMenu.children(g)`: `relationshipGroups(g)` (wrapped in try/catch, as `RelationshipsSheet` `safeGroups` does) flattened to a heading `rel.h.<slug>` labelled `Title (n)` followed by `personGroup(p)` for each person. Group fields: `id: person.<id>`; `label` = pets and people without a last name use `firstName`, others `fullName(p)` (same rule as `PersonSheet.personName`); `emoji: personAvatar(p)`; `subtitle` = `relationLabel(p)` plus ` · ` plus `N years old` (`1 year old`), dead people `Rel · Deceased (age N)` (same strings as `PersonSheet.personSubtitle`, duplicated because the game layer must not import UI; a test pins equality); `children: (g) => { const p = getPerson(g, id); return p ? personActions(g, p) : [{ type: 'info', id: 'person.gone', emoji: '\u{1F44B}', text: "They're no longer part of your life." }] }`; `badge`: alive, `relationship < 25` and relation in `parent`, `spouse`, `partner`, `fiance`, `child`, `bestFriend` gives `Drifting`.
2. Person action ids are shared across people (`build(def, pid)` in `relationships.ts:2195` uses `def.id`), so every consumer must key by the full path; this task adds nothing else for that.
3. `KEYWORDS` seed (ids verified in v4.0.2; all lowercase ASCII, each word at most 24 characters): `investments` (invest, portfolio, shares, funds, etf), `inv-stocks` (buy a stock, buy stocks, shares, equities, stock market, trade), `inv-penny` (penny, speculate), `inv-crypto` (bitcoin, coins, crypto), `inv-bonds` (bonds, savings, interest, deposit), `businesses` (company, companies, business, ceo, firm), `biz.start` (found, startup, open a shop, new company), `biz.buy` (acquire, buy company), `banking` (loan, loans, mortgage, credit, debt, borrow, bank), `realEstate` (house, home, property, buy a house, apartment, land), `rentals` (rent, apartment, landlord, lease), `carDealers` (car, vehicle, buy a car, auto), `specialtyVehicles` (boat, plane, yacht, jet, motorcycle), `jewelers` (ring, diamond, watch, jewelry), `collectibles` (art, paintings, antiques, auction), `electronicsStore` (phone, laptop, gadgets), `money-team` (advisor, accountant, wealth manager), `occupation.jobs` (job, work, apply, career), `occupation.parttime` (part time, side job), `occupation.freelance` (gig, freelance, odd jobs), `occupation.recruiter` (headhunter, recruit), `cv.menu` (resume, history, cv), `military` (army, navy, enlist, soldier), `specialCareers` (actor, musician, astronaut, politician, athlete), `doctor` (health, sick, hospital, medicine, checkup, therapy), `mindBody` (gym, exercise, meditate, yoga, diet, workout), `love` (date, marry, marriage, dating, wedding, divorce, propose), `adoption` (adopt, child, baby), `pets` (dog, cat, pet), `nightlife` (party, club, bar, drink), `casino` (gamble, slots, blackjack, poker, roulette), `lottery` (lotto, scratch, jackpot), `sweepstakes` (contest, giveaway), `crime` (steal, rob, burglary, heist, illegal), `lawsuit` (sue, court, lawyer, legal), `surrender` (police, confess, arrest), `vacation` (holiday, trip, travel, cruise, resort), `emigrate` (move abroad, immigrate, visa, citizenship), `licenses` (driver, driving, permit, pilot), `fame` (celebrity, paparazzi), `socialMedia` (followers, instagram, post, influencer, viral), `movies` (cinema, film, theater), `computer` (code, coding, program, app, software), `workshop` (invent, patent, inventor), `will` (inherit, estate, heir, testament), `identity` (name change, alias), `surgery` (plastic surgery, cosmetic, botox), `rehab` (addiction, sober, detox), `salon` (spa, haircut, massage), `pray` (church, religion, faith, temple), `charity` (donate, volunteer), `economy` (inflation, unemployment, interest rates), `thisYear` (news, headlines), `royal.court` (royal, palace, crown), `lifePriorities` (routine, stress, balance), `shopping` (shop, store, mall), `pastimes` (hang out, hobby), `zoo` (animals), `corruption` (bribe, backroom), `shared.projects` (mentor, collaborate).

**Tests (`test/nav-people.test.ts`).**
1. `peopleMenu.children(adult)` lists a heading per non-empty group and `person.<id>` groups whose count equals the sum from `relationshipGroups` (includes the dead).
2. For the first 5 people, `personGroup(p).children(g)` has the same ids and labels as `personActions(g, p)`.
3. `subtitle` equals `personSubtitle(p)` imported from `src/ui/components/PersonSheet.tsx`, for an alive person, a dead one and a pet (drift guard); `label` equals `personName(p)` for a pet and a person without a last name.
4. A person removed from `g.people` after the group was built: `children` returns the single `person.gone` info and does not throw.
5. `badge` gives `Drifting` for a parent at relationship 10; null for a friend at 10, for a dead parent and for a parent at 60.
6. Two renders of `peopleMenu.children` on a frozen state are equal after serialising labels (RF5).
7. `personIdOf('person.p12') === 'p12'`; `personIdOf('x')` is null.
8. Every `KEYWORDS` key exists as a node id in the union of `walkTree` over the four canned states, except a documented `CONDITIONAL` list (`military`, `royal.court`, `corruption`, `workshop`, `inv-penny`, `inv-crypto`, `thisYear` can be absent); this catches id typos.
9. Keywords are lowercase ASCII, at most 24 characters, no U+2014 or U+2013, no duplicates inside a row.
10. `keywordsOf({ id: 'doctor', keywords: ['Clinic'] })` returns `clinic` first and the table words, de-duplicated.
11. Import-cycle: run `test/architecture.test.ts` (in the task's checks).

**Proves.** Prerequisite of D.11 criterion 7 (people searchable), criterion 6 (kit walks the people root).
**Flag.** None (pure data; used by N4 and later).
**Hot-file notes.** None beyond `test/nav-kit.ts`.
**Depends on.** R1-N1 (kit).
**Size.** Source about 250 (people 130, keywords 120 of data), tests about 260.

---

### R1-N4 Search index, ranking, places (pure)

**Roadmap items.** G.9 (`src/ui/nav/searchIndex.ts` pure, ranking, cache key), D.11 criteria 6 (index purity) and 7 (stock in 4 taps).

**Files.** Create `src/ui/nav/searchIndex.ts`, `src/ui/nav/searchRank.ts`, `src/ui/nav/place.ts`; tests `test/nav-index.test.ts`, `test/nav-rank.test.ts`. (No React in these files.) Cross-check: also modify `test/nav-kit.ts` to add `buildIndexCached(name: NavStateName): SearchIndex` (memoised `buildIndex(frozen(name))` per test file; tests 1 to 12 and the later N6, N9, N10 tests use it instead of rebuilding). Cross-check: `searchIndex.ts` and `searchRank.ts` belong to the palette zone (a11y A8 test 9), so `place.ts` imports `IndexEntry` with `import type` only, and nothing outside the zone and `src/ui/nav/lazy.tsx` imports either file at runtime.

**Interfaces.**
```ts
// src/ui/nav/place.ts
export type SearchTab = 'occupation' | 'assets' | 'relationships' | 'activities'
export interface PlaceRef { tab: SearchTab; path: string[]; id?: string }   // path: group ids after the tab; id: action id when the place is an action
export function placeKey(p: PlaceRef): string                // 'activities/computer/ventures' or '...#ventureId'; segments are encodeURIComponent'd
export function parsePlaceKey(s: string): PlaceRef | null    // rejects garbage, more than 12 segments, unknown tab
export function samePlace(a: PlaceRef, b: PlaceRef): boolean
export function placeOfEntry(e: IndexEntry): PlaceRef
export function recentFromSpot(tab: SearchTab, spot: { path: string[]; personId?: string }): PlaceRef  // relationships: path = ['person.<id>', ...]

// src/ui/nav/searchIndex.ts
export type EntityKind = 'person' | 'company' | 'stock' | 'asset'
export interface EntityRef { kind: EntityKind; id: string; name: string }
export interface IndexEntry {
  key: string; tab: SearchTab; idPath: string[]; type: 'action' | 'menu'; id: string
  label: string; emoji: string; crumbs: string[]
  labelN: string; kwN: string; crumbN: string
  depth: number; entity?: EntityRef; locked: string | null; input: boolean
}
export interface SearchIndex { key: string; entries: IndexEntry[]; complete: boolean; truncated: boolean; nodes: number; failures: number }
export type IndexRoots = Record<SearchTab, MenuGroup>
export const INDEX_LIMITS: { readonly entries: 6000; readonly nodes: 20000; readonly depth: 7; readonly perGroup: 120; readonly perEntity: 40 }
export function defaultRoots(): IndexRoots                   // occupationMenu, assetsMenu, activitiesMenu from game/menus, peopleMenu from hubs/people
export function indexKey(g: GameState): string
export interface IndexJob { readonly done: boolean }         // opaque
export function startIndexJob(g: GameState, roots?: IndexRoots): IndexJob
export function stepIndexJob(job: IndexJob, budgetMs: number, now?: () => number): boolean   // true when finished; always handles at least one group per call
export function finishIndex(job: IndexJob): SearchIndex
export function buildIndex(g: GameState, roots?: IndexRoots): SearchIndex
export function createResolver(g: GameState, roots?: IndexRoots): (e: IndexEntry) => MenuAction | MenuGroup | null   // memoises children() per path inside one call site
export function entityOf(g: GameState, node: MenuNode): EntityRef | null
export function cachedIndex(g: GameState): SearchIndex | null   // only when its key matches indexKey(g)
export function storeIndex(i: SearchIndex): void
export function clearIndexCache(): void

// src/ui/nav/searchRank.ts
export function normalize(s: string): string
export type Tier = 0 | 1 | 2 | 3                             // prefix, word start, substring, subsequence
export interface RankContext { pins: PlaceRef[]; recents: PlaceRef[] }
export interface SearchHit { entry: IndexEntry; tier: Tier; pinned: boolean; recent: number; locked: string | null }   // recent: 0 newest, -1 none
export function search(index: SearchIndex, query: string, ctx: RankContext, limit?: number): SearchHit[]   // default limit 30
export const DO_ANYTHING_ID = 'doAnything'
export function tapsToReach(e: IndexEntry): number            // 3 (open palette, type, tap) plus 1 when the action asks for input
```

**Behaviour.**
1. `indexKey(g)`: `[lifeId, year, age, assets.length, people.length, job?.defId, job?.level, typeof job?.data.office === 'string' ? job.data.office : '', prison ? 'p' : '', retired ? 'r' : '', alive ? '' : 'x', moneyBucket].join('|')` where `moneyBucket = Math.sign(m) * Math.floor(Math.log2(Math.abs(m) + 1))`. The roadmap key is `(lifeId, year, age, assets.length, job, office)`; `office` is not a state field (the political office lives in `job.data.office`, `special/politics.ts`), and Activities swaps to the prison list, so `prison`, `people.length`, `retired` and the money bucket are added.
2. The walk is breadth first over a work queue of frames `{ tab, node, idPath, crumbs, depth, entity }`. For each frame call `groupChildren(node, g)` (from `menuModel.ts`), then for each child: skip `heading` and `info`; skip when not `nodeVisible`; read `nodeDisabled` (the lock reason); build the entry; enqueue visible, unlocked groups when `depth < 7` and entries are under the cap. Never read `hint`, `subtitle`, `header` or `confirm`; never call `input.defaultValue` or `input.preview` (only `Boolean(node.input)`). Never call a node's `run`.
3. `stepIndexJob` processes frames until `budgetMs` has passed (default clock `performance.now`, injectable) and always at least one frame, so a budget of 0 still finishes. `buildIndex` runs it to completion. A `children()` that throws or returns a non-array, or a node without a string `id`, counts in `failures` and is skipped.
4. Caps: `entries` 6000, `nodes` 20000, `depth` 7, `perGroup` 120 children, `perEntity` 40 children per entity group; hitting any sets `truncated`.
5. Entity rules (table in the file, first match wins): group id prefix `person.` gives `person` (id after the prefix, name = label); prefix `biz.company.` gives `company`; prefix `asset-` where `g.assets.find(a => 'asset-' + a.id === id)?.kind === 'business'` gives `company`, any other asset kind gives `asset`; prefix `inv-offer-` gives `stock`. Children of an entity group inherit it; their displayed `label` stays as is, but `labelN` also includes the entity name and `crumbs` end with it, so "alex propose" and "acme price" match.
6. Dedupe: `key = entity ? kind + ':' + entityId + ':' + (isRoot ? 'root' : type + id) : type + ':' + id + ':' + label`. Breadth first means the first hit is the shortest path; a later duplicate is skipped. A company reached through `biz.company.<id>` (Occupation CEO job, Assets > Businesses, Special Careers > Business) and `asset-<id>` (Assets root) is one entry.
7. `normalize(s)`: NFKD, strip combining marks, lowercase, `&` becomes ` and `, every non-alphanumeric run becomes one space, trimmed.
8. `search(index, query, ctx, limit)`: tokens of `normalize(query)`; empty gives `[]`. An entry matches when every token matches `labelN`, `kwN` or `crumbN`. A token's tier: 0 when the label starts with the token and it is the first token, 1 when it starts a word of any field, 2 when it is a substring, 3 when its characters appear in order in the label (token length at least 3). The entry tier is the worst token tier of its best field. Sort keys, in order: locked (unlocked first), tier ascending, pinned first, recent rank ascending (-1 last), `depth` ascending, non-entity before entity, label ascending (`localeCompare`). A pin only reorders inside a tier: a pinned subsequence match never beats an unpinned prefix match (the roadmap order: prefix, word start, substring, subsequence, then pins and recents). `locked` comes from the entry (advisory); the palette re-checks live.
9. `createResolver`: walks `idPath` from `roots[tab]`, calling `groupChildren` per level with a `Map<string, MenuNode[]>` memo keyed by the path prefix, matching `n.id` among visible nodes (and, for groups on the way, not locked); returns the live node or null.

**Tests.**
`test/nav-index.test.ts` (states from `frozen(...)`):
1. `buildIndex` on `kid`, `adult`, `ceo`, `elder` returns entries; a sample of 200 entries per state resolves through `createResolver` to a node whose `id` and `type` match the entry.
2. Writes nothing: after `buildIndex` the state JSON is byte-identical, `g.rng` unchanged, `Math.random` spy never called (criterion 6).
3. Never reads `hint` or `subtitle`: a synthetic root whose `hint`, `subtitle`, `header`, `confirm` all throw is indexed without error; `searchIndex.ts` source contains no `.hint`, `.subtitle`, `.header(`, `.confirm(`, `.run(` outside comments (string scan).
4. Time slicing: stepping with budget 0 and a fake clock yields entries deep-equal to `buildIndex`.
5. `indexKey` changes with age, year, assets, people, job level, `data.office`, prison, retired, and a money bucket change; it does not change with happiness or a log line.
6. Dedupe: in `ceo` a company reachable by 3 or 4 routes gives exactly one entry with `entity.kind === 'company'` and the shortest `idPath`; no duplicate `key` anywhere.
7. Caps: a synthetic tree of 30,000 nodes gives at most 6000 entries, at most 20000 nodes visited, `truncated` true, no entry deeper than 7; a group with 500 children gives at most 120 entries.
8. Hostile builders: `children` that throws, returns `null`, returns nodes without ids or with `id: 7`: skipped, `failures` counted, the sibling subtree still indexed.
9. A locked group is indexed with its reason and not entered; a node with `visible: () => false` is absent; headings and infos never appear.
10. Entities: `person.<id>`, `biz.company.<id>`, `asset-<id>` (house gives `asset`), `inv-offer-<sec>` classified; a child of `person.p1` carries the entity and its `labelN` contains the person's name.
11. Cache: `storeIndex` then `cachedIndex(g)` returns it; after the key changes it returns null; `clearIndexCache` empties.
12. Coverage: for `adult`, at least 95% of the canonical action paths of `walkTree` with depth up to 7 outside entity caps appear in the index.

`test/nav-rank.test.ts`:
13. `normalize('Mind & Body')` is `mind and body`; diacritics and case fold; punctuation collapses.
14. Tiers: query `sto` on label `Stocks` is tier 0; `stock` on `Penny Stocks` tier 1; `tock` on `Stocks` tier 2; `stcs` on `Stocks` tier 3.
15. Sort order inside a tier: pinned, then recents (newest first), then shallower path, then non-entity, then label.
16. Locked rows come after every unlocked row, whatever the tier.
17. A pinned tier-3 hit does not outrank an unpinned tier-0 hit.
18. Multi-token AND: `alex propose` matches the action `propose` under `person.<alex>` and not under another person.
19. Keywords: `bitcoin` finds Crypto, `marry` finds Love, `mortgage` finds Banking; crumbs: `computer ventures` finds a venture entry.
20. Acceptance (criterion 7): on `adult`, `search(index, 'stock')` returns `inv-stocks` (idPath `['assets','investments','inv-stocks']`) within the first 3 hits and `tapsToReach(entry) <= 4`.
21. Canned query table on `adult` and `ceo` (25 queries, each with the expected node id inside the first 3 hits): `doctor`, `gym`, `casino`, `lottery`, `loan`, `mortgage`, `house`, `car`, `vacation`, `adopt`, `pray`, `will`, `emigrate`, `licenses`, `job`, `resume`, `crypto`, `bonds`, `invest`, `start a company`, `shopping`, `economy`, `social media`, `pets`, `crime`.
22. Whitespace-only and empty queries return `[]`; a 300-character query returns without error; `limit` is honoured (default 30).
23. Speed guard: ranking 6000 synthetic entries takes under 250 ms (generous, to avoid a flaky timer).
24. `placeKey` round trip including ids with `/`, `#`, `%` and non-ASCII; `parsePlaceKey` rejects `''`, 13 segments, a bad tab and a segment of 200 characters; `recentFromSpot('relationships', { path: ['person.p3', 'money'] })` keeps the person segment first.

**Proves.** D.11 criterion 6 (index writes nothing, no `g.rng`), criterion 7 (stock in at most 4 taps; the pins/recents half is N5).
**Flag.** None (no UI yet).
**Hot-file notes.** New files only.
**Depends on.** R1-N1, R1-N3.
**Size.** Source about 580 (index 330, rank 190, place 60), tests about 560.

---

### R1-N5 Pins and recents store, breadcrumbs, `popTo`, runner hooks

**Roadmap items.** G.9 (pins 12, recents 8 in `anotherlife.ui.v1`, breadcrumbs with `popTo(n)`, the chip as newest recent), D.11 criterion 7 (second half), criterion 4 (hostile stored data).

**Files.**
- Create `src/ui/nav/prefs.ts`, `src/ui/nav/Breadcrumbs.tsx`; extend `src/ui/styles/nav.css`.
- Modify `src/ui/components/menuModel.ts` (append three pure path helpers), `src/ui/components/MenuList.tsx` (`MenuNav.popTo`, `MenuNav.openPath`, `MenuRunnerOptions.onRan`, `MenuRunner.submit`), `src/ui/components/Sheet.tsx` (optional `subheader`), `src/ui/components/MenuSheet.tsx`, `src/ui/components/PersonSheet.tsx`, `src/ui/screens/GameScreen.tsx` (record recents in `remember`; also see N7).
- Tests: `test/nav-prefs.test.ts`, `test/nav-breadcrumbs.test.ts`.

**Interfaces.**
```ts
// src/ui/nav/prefs.ts
export const UI_KEY = 'anotherlife.ui.v1'
export const MAX_PINS = 12
export const MAX_RECENTS = 8
export const MAX_LIVES = 6
export interface LifePrefs { pins: PlaceRef[]; recents: PlaceRef[] }
export interface UiPrefs { v: 1; lives: Record<string, LifePrefs>; order: string[] }   // order: lifeIds, newest first; lives is a null-prototype object
export function emptyPrefs(): UiPrefs
export function readUiPrefs(raw: unknown): UiPrefs                       // hostile-safe, bounded
export function lifeOf(p: UiPrefs, lifeId: string): LifePrefs
export function isPinned(p: UiPrefs, lifeId: string, ref: PlaceRef): boolean
export function togglePin(p: UiPrefs, lifeId: string, ref: PlaceRef): { prefs: UiPrefs; ok: boolean; reason?: 'full' }
export function pushRecent(p: UiPrefs, lifeId: string, ref: PlaceRef): UiPrefs
export function loadPrefs(storage?: Pick<Storage, 'getItem'>): UiPrefs
export function savePrefs(p: UiPrefs, storage?: Pick<Storage, 'setItem'>): boolean
export function usePrefs(): UiPrefs                                       // useSyncExternalStore over a module-level snapshot (stable reference until changed)
export function updatePrefs(fn: (p: UiPrefs) => UiPrefs): void            // apply, save, notify
export function resetPrefsForTest(): void

// src/ui/components/menuModel.ts (appended, pure)
export function pathAfterPush(path: string[], depth: number, id: string): string[]
export function pathAfterPopTo(path: string[], depth: number, n: number): string[]
export function pathAfterOpen(ids: readonly string[]): string[]           // strings only, non-empty, at most 12

// src/ui/components/MenuList.tsx
//   MenuNav gains:            popTo: (n: number) => void;  openPath: (ids: string[]) => void
//   MenuRunnerOptions gains:  onRan?: (action: MenuAction) => void      // called right before runMenuAction, also for stayOpen actions
//   MenuRunner gains:         submit: (action: MenuAction, input: string) => void   // runs with a ready input: skips the input dialog, keeps the confirm step

// src/ui/nav/Breadcrumbs.tsx
export interface Crumb { label: string; depth: number; current: boolean }
export function crumbsOf(rootLabel: string, trail: readonly { label: string }[], lead?: readonly string[]): Crumb[]
export function Breadcrumbs(props: {
  crumbs: Crumb[]
  onGo: (depth: number) => void
  pin?: { pinned: boolean; label: string; onToggle: () => void }
}): ReactElement | null                                                   // null for a single crumb

// src/ui/components/Sheet.tsx: SheetProps gains   subheader?: ReactNode    // rendered between <header> and the body
```

**Behaviour.**
1. Storage shape: `{ v: 1, lives: { [lifeId]: { pins: PlaceRef[], recents: PlaceRef[] } }, order: string[] }`. `readUiPrefs` accepts only objects; `lives` is built with `Object.create(null)` so `__proto__` as a life id is harmless; at most 6 lives (drop the oldest by `order`); per life at most 12 pins and 8 recents; a `PlaceRef` is valid when `tab` is one of the four, `path` is an array of at most 12 non-empty strings of at most 80 characters, `id` (if present) a non-empty string of at most 80; invalid refs are dropped, duplicates removed; the serialised result is at most 16 KB (drop the oldest lives until it fits).
2. `togglePin`: a pinned place is removed; a new one is added at the front; at 12 it returns `{ ok: false, reason: 'full' }` and changes nothing (the UI toast reads `You've pinned 12. Unpin one first.`). `pushRecent`: newest first, an equal place moves to the front, cap 8. Per life: an heir has its own `lifeId`, so starts empty; a Time Machine jump keeps the life id, so pins survive (UI state is not rewound, on purpose).
3. `loadPrefs` and `savePrefs` wrap every `localStorage` access in try/catch (private window, blocked storage, quota) and return defaults or `false`; the page renders without storage. The storage argument is injectable for tests; the default is `globalThis.localStorage` read lazily inside the try.
4. `Breadcrumbs`: `<nav aria-label="Breadcrumb"><ol>`; each non-current crumb is a `<button type="button" aria-label="Go to {label}">` at least 44 px tall (CSS), the current one is `<span aria-current="page">`; the strip scrolls sideways and the current crumb is scrolled into view; labels are cut with an ellipsis at 18 characters by CSS only. With `pin`, a right-aligned star button `aria-pressed` and `aria-label="Pin {label}"` or `Unpin {label}`. Returns null when there is one crumb.
5. `MenuSheet`: `crumbsOf(root.label, nav.trail)` passed to `<Sheet subheader={...}>` when `nav.trail.length > 0 && FLAGS.navRegroup`; `onGo(d)` calls `nav.popTo(d)`; the pin star appears only with `FLAGS.navPalette` and toggles the place `{ tab: root.id, path: trail ids }` through `updatePrefs`. `PersonSheet`: crumbs are `['Relationships', personName, ...trail]`; crumb 0 calls `onBack`, crumb 1 calls `nav.popTo(0)`, deeper ones `nav.popTo(d - 1)`.
6. `useMenuNav` gains `popTo(n)` (same scroll restoration as `pop`: `pendingScroll = scrolls[n]`) and `openPath(ids)` (stores the current scroll, sets the path to `pathAfterOpen(ids)`, scroll 0). Both built from the pure helpers so they are testable without a renderer.
7. Recents are written from two places: `MenuSheet` passes `onRan: (a) => updatePrefs(p => pushRecent(p, g.lifeId, { tab: root.id, path: nav.snapshot().path, id: a.id }))` (and `PersonSheet` the same with `tab: 'relationships'` and path `['person.<id>', ...]`); and `GameScreen.remember` additionally pushes the place of the spot it stores for the "Back to" chip (`recentFromSpot`). The chip itself is unchanged: it keeps showing the live `ReturnPoint`, and when it is dismissed or the year turns the place is still in recents, which is what "becomes the newest recent" means in code (the palette empty state, N6, also lists the live chip target first).
8. `submit(action, input)`: `afterInput(action, input)` of the existing runner (confirm text, then `execute`). `onRan` is called inside `execute` before `runMenuAction`.
9. All writes are guarded by `FLAGS.navPalette` (recents, pins) or `FLAGS.navRegroup` (breadcrumbs); with both off nothing changes.

**Tests.**
`test/nav-prefs.test.ts` (fake storage object `{ getItem, setItem }`):
1. `emptyPrefs` round trip through `savePrefs` and `loadPrefs`.
2. `togglePin`: add, remove, 12 pins accepted, the 13th returns `{ ok: false, reason: 'full' }` and leaves prefs equal.
3. `pushRecent`: newest first; re-pushing an existing place moves it to the front without growth; the 9th evicts the oldest.
4. Isolation per life; a 7th life evicts the oldest life; `lifeOf` of an unknown id returns empty lists.
5. Hostile (criterion 4): non-JSON text, `null`, an array, a number, `{"v":1,"lives":{"__proto__":{"pins":[1]}}}`, 500 pins, 10,000-character strings, a 100-segment path, a wrong tab, `NaN` and `Infinity` values: every case returns valid bounded prefs and `JSON.stringify(result).length <= 16384`.
6. Storage that throws on `getItem` gives `emptyPrefs`; on `setItem` (quota) `savePrefs` returns false; neither throws.
7. Never in `GameState` (criterion 7): after pins and recents, `JSON.stringify` of `navState('adult')` and of a store `act()` clone is byte-identical to before and contains none of the pinned ids; no file under `src/game` contains the text `ui/nav` (static scan).
8. `usePrefs` snapshot is a stable reference between two reads and changes after `updatePrefs`.

`test/nav-breadcrumbs.test.ts`:
9. `crumbsOf('Activities', [{label:'Computer'},{label:'Ventures'}])` gives 3 crumbs, depths 0 to 2, only the last `current`; with `lead` `['Relationships','Alex']` the labels start with those.
10. `Breadcrumbs` markup: `nav` with `aria-label="Breadcrumb"`, an `ol`, a button with `aria-label="Go to Activities"`, a span with `aria-current="page"`; null for one crumb.
11. Pin star: `aria-pressed="true"` when pinned and label `Unpin Ventures`.
12. `pathAfterPush`, `pathAfterPopTo` (n out of range returns the input path unchanged), `pathAfterOpen` (drops non-strings, empty strings, truncates to 12).
13. `MenuSheet` integration with the real store (pattern of `test/ui-return.test.ts`: `vi.mock('../src/game/offline')`, `store.startNewLife({ seed: 7, year: 2026 })`, age 30, flag on): `renderToStaticMarkup(createElement(MenuSheet, { root: activitiesMenu, onClose, initial: { path: ['computer'], scrolls: [0, 0] } }))` contains the breadcrumb nav with "Activities" and "Computer"; with the flag off the markup has no `Breadcrumb`.
14. `Sheet` renders `subheader` after the header and before the body (index order in the markup).
15. Runner hooks (capture pattern): inside a throwaway component call `useMenuRunner({ onOpenGroup, onClose, onLeave, onRan })`, keep the result, then call `runner.submit(action, 'text')` for a plain action: `onRan`, `onLeave`, `onClose` each called once in that order and the action ran; for an action with `confirm` the call stops at the confirm step (no `onRan`); a `stayOpen` action calls `onRan` and not `onClose`.
16. With both flags off, `MenuSheet` markup at depth 1 equals the v4.0.2 markup (no `subheader`).

**Proves.** D.11 criterion 7 (pins and recents round-trip, never enter `GameState`), criterion 4 (hostile `anotherlife.ui.v1`).
**Flag.** `FLAGS.navRegroup` (breadcrumbs) and `FLAGS.navPalette` (pins, recents).
**Hot-file notes.** `MenuList.tsx` (hook additions at the end of `useMenuNav`, `MenuRunnerOptions`, `MenuRunner`), `Sheet.tsx` (prop plus one JSX line), `MenuSheet.tsx` and `PersonSheet.tsx` (disjoint hunks), `GameScreen.tsx` (`remember` only). Rebase on G.12 if it landed first.
**Depends on.** R1-N2 (MenuSheet hunks, `nav.css`), R1-N4 (`PlaceRef`); merge after R1-A5 (cross-check: A5 wraps `Sheet`'s inner element in `ModalSurface`, then this task adds `subheader` between header and body).
**Size.** Source about 480, tests about 380.

---

### R1-N6 Palette (model, view, host)

**Roadmap items.** G.9 (palette, "Do Anything: {query}", locked rows last, empty state with pins and recents), D.11 criterion 7.

**Files.** Create `src/ui/nav/paletteModel.ts`, `src/ui/nav/Palette.tsx` (cross-check: with a **default export**, for `lazyView`), `src/ui/nav/useSearchIndex.ts`, `src/ui/nav/lazy.tsx` (the gate file: `export const LazyPalette = lazyView('palette', () => import('./Palette'))`, plus `LazyPalette` props `PaletteProps` and an optional `fallback`); extend `src/ui/styles/nav.css`. `PaletteHost.tsx` is dropped (it only existed for `React.lazy`). Test: `test/nav-palette.test.ts`. Palette zone (a11y A8 test 9): `Palette.tsx`, `paletteModel.ts`, `searchIndex.ts`, `searchRank.ts`, `useSearchIndex.ts`; nothing outside the zone and `lazy.tsx` imports them at runtime.

**Interfaces.**
```ts
// src/ui/nav/paletteModel.ts (pure)
export type PaletteRow =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'place'; id: string; ref: PlaceRef; label: string; emoji: string; crumbs: string[]; why: 'back' | 'need' | 'pinned' | 'recent'; badge?: string }
  | { kind: 'hit'; id: string; hit: SearchHit; pinned: boolean }
  | { kind: 'doAnything'; id: string; query: string; locked: string | null }
export interface PaletteView { rows: PaletteRow[]; selectable: number[]; status: string }   // status is the aria-live text
export function paletteRows(a: {
  g: GameState; index: SearchIndex | null; query: string; prefs: UiPrefs
  returnPoint: ReturnPoint | null; roots?: IndexRoots
}): PaletteView
export interface PaletteState { query: string; active: number }      // active indexes into view.selectable
export type PaletteEvent = { type: 'query'; value: string } | { type: 'key'; key: string; alt?: boolean }
export function paletteReduce(s: PaletteState, view: PaletteView, ev: PaletteEvent): { state: PaletteState; effect: null | 'activate' | 'close' | 'pin' }
export type Activation =
  | { kind: 'open'; place: PlaceRef & { personId?: string } }
  | { kind: 'run'; node: MenuAction }
  | { kind: 'doAnything'; query: string }
  | { kind: 'stale' }
export function activate(row: PaletteRow, g: GameState, resolve: ReturnType<typeof createResolver>): Activation

// src/ui/nav/useSearchIndex.ts
export function useSearchIndex(g: GameState, enabled: boolean): { index: SearchIndex | null; ready: boolean }   // starts a time-sliced job on idle (requestIdleCallback, else setTimeout 16), serves the cached or stale index while it runs, stores the result

// src/ui/nav/Palette.tsx
export interface PaletteProps {
  g: GameState
  onClose: () => void
  onOpenPlace: (place: PlaceRef & { personId?: string }) => void
  indexOverride?: SearchIndex | null      // test seam
  initialQuery?: string                   // test seam
}
export function Palette(props: PaletteProps): ReactElement
export default Palette                  // for lazyView
// src/ui/nav/lazy.tsx
export const LazyPalette: LazyView<PaletteProps>   // lazyView from src/ui/lazy/lazyView (R1-A8); preload() for tests
export function PaletteViewMarkup(props: { view: PaletteView; state: PaletteState; ids: { list: string; option: (i: number) => string }; onQuery: (v: string) => void; onPick: (i: number) => void; onPin: (i: number) => void }): ReactElement   // presentational
```

**Behaviour.**
1. Empty query (`paletteRows`): sections in this order, each only when non-empty: "Back to" (the live chip target, only when `returnChipVisible(returnPoint, g)`; label via `resolveReturnPoint` crumbs), "Needs you" (`needsYou` over each tab's root children, at most 6 rows, `why: 'need'`), "Pinned" (at most 12), "Recent" (at most 8). Every place is resolved live with the resolver; unresolvable pins and recents are skipped (not deleted). If the index is not ready the status reads `Still reading the menus.`
2. Query: `search(index, query, { pins, recents }, 30)` hits, then, always last, `{ kind: 'doAnything', query, locked }` whose label is `Do Anything: {query}` (query cut to 40 characters for display, the full text up to 300 is submitted) and `locked` is `doAnythingAction.disabledReason(g)` (`menus.ts:91`, for example `You are too young to do that.`). The visible rows' lock state is re-read live (the live node's `nodeDisabled`) for at most 30 rows; an entry that no longer resolves becomes a row with `locked: 'Not available any more.'`.
3. `selectable` lists the indexes of rows that can be activated (not `section`). `paletteReduce`: `ArrowDown` and `ArrowUp` wrap, `Home`, `End`, `PageDown` and `PageUp` move by 8, `Enter` gives `activate`, `Escape` gives `close`, `Alt+P` gives `pin`; a `query` event sets the text and resets `active` to 0.
4. `activate`: a group hit or place gives `{ kind: 'open', place }` where for `tab: 'relationships'` the first path segment `person.<id>` becomes `personId` and the rest the in-sheet path; an action hit gives `{ kind: 'run', node }` with the live node (null resolve gives `stale`); `doAnything` gives its own kind.
5. `Palette` (container): `useApp` for `game`, `returnPoint`; `usePrefs`; `useSearchIndex`; `useMenuRunner({ onOpenGroup: () => {}, onClose, onLeave, onRan })` where `onLeave` calls `setReturnPoint({ sheet: tab, personId, path: parentPath, scrolls: zeros(parentPath.length + 1) })` and `onRan` pushes the recent. On `run`: `runner.tap(node)` (so input dialogs, confirm and toasts work; the palette stays mounted while a dialog is open; non-`stayOpen` actions close it through `onClose`). On `doAnything`: `runner.submit(doAnythingAction, query)`. On `open`: `onClose()` then `onOpenPlace(place)` (the caller closes any sheet and opens the target; `clearReturnPoint` is the caller's `open()` behaviour). On `stale`: toast `That's not there any more.`, `clearIndexCache()`, restart the job.
6. Markup (`PaletteViewMarkup`): backdrop `className="sheet-backdrop palette-backdrop"` (so the sheets beneath do not react to Escape: `useSheetEscape` only answers for the last `.sheet-backdrop`), and, cross-check, the panel is a11y's `<ModalSurface role="dialog" label="Search" className="palette">` (which supplies `aria-modal="true"`, `tabIndex=-1`, the focus trap, focus restore and `inert` on the page behind; the combobox input keeps `autoFocus`, so the surface leaves focus where it is); input `role="combobox" aria-expanded="true" aria-controls aria-activedescendant autoFocus` with placeholder `Search actions, people, companies`; list `role="listbox"`; rows `role="option" aria-selected` with unique ids, 44 px minimum height (CSS), emoji, label, crumbs line, lock pill with the reason and a lock glyph; a pin button per row (`aria-pressed`, `aria-label="Pin {label}"`, `tabIndex={-1}`, 44 px target); a visually hidden `role="status" aria-live="polite"` line `n results` or `Nothing matches "{query}".`. Escape uses `useSheetEscape`. The pin button at the cap shows the toast from N5.
7. `src/ui/nav/lazy.tsx` (cross-check, replaces `PaletteHost`): `LazyPalette = lazyView('palette', () => import('./Palette'))`. `GameScreen` (N7) renders `<LazyPalette g onClose onOpenPlace />` only while the palette is open; until the chunk is ready `lazyView` renders its default box (the palette has no text fallback: it is opened on demand, and `prefetchLazyViews()` loads it when the browser is idle, so the first open is usually instant). No `React.lazy` anywhere.

**Tests (`test/nav-palette.test.ts`; mock `../src/game/offline` as `test/ui-return.test.ts` does).**
1. Empty query on `adult` with a live return point, two pins and two recents: section order Back to, Needs you, Pinned, Recent; a pin whose path no longer resolves is skipped.
2. Query `stock`: first selectable row is the Stocks group, last row is `doAnything` labelled `Do Anything: stock`; an input over 40 characters is cut in the label only.
3. `doAnything` row `locked` is `You are too young to do that.` for the `kid` state aged 3; null for the adult.
4. A locked hit sorts after unlocked ones in the view; a hit whose entity vanished renders as `Not available any more.`
5. `paletteReduce`: wrap-around at both ends, `Home`, `End`, `PageDown`, section rows skipped, `Enter` on an empty list gives no effect, `Escape` gives `close`, `Alt+P` gives `pin`, typing resets `active`.
6. `activate`: group hit gives `open` with the right tab and path; `relationships` person hit gives `personId` and a shortened path; action gives `run` with the live node; deleted node gives `stale`.
7. Markup: roles and ids (`dialog`, `aria-modal`, `combobox`, `listbox`, `option`), unique option ids, `aria-selected` only on the active row, `aria-activedescendant` equals the active option id, live status text `5 results`, pin button `aria-pressed`, empty text.
8. Acceptance (criterion 7): rendering with `indexOverride` from `buildIndex(adult)` and `initialQuery: 'stock'` shows `Stocks` in the first option; `tapsToReach <= 4`.
9. Runner integration (capture pattern, real store): submitting `doAnythingAction` with `buy a boat` queues a `customAction` task (the offline mock resolves it) and calls `onClose`; `tap` on an action with `input` runs nothing (state JSON unchanged, `onRan` not called).
10. Pin toggling through `updatePrefs` changes `usePrefs`; at 12 pins the toast text is `You've pinned 12. Unpin one first.`
11. Voice scan of the strings in `paletteModel.ts` and `Palette.tsx`: no U+2014 or U+2013, tooltips at most 120 characters.
12. `Palette` has a default export that is a function (lazy import contract); `LazyPalette` before `await LazyPalette.preload()` renders no palette markup, after it renders the dialog with the combobox.
13. `useSearchIndex` is not imported by any `src/game` file (static scan), and no file outside the palette zone imports a zone file at runtime except `lazy.tsx` (a11y's `test/lazy-zones.test.ts` is the permanent guard; run it too).
14. The palette is inside a `ModalSurface`: the markup has `role="dialog"`, `aria-modal="true"`, `aria-label="Search"` and `tabindex="-1"` on one element, and the `sheet-backdrop palette-backdrop` wrapper around it.

**Proves.** D.11 criterion 7 (stock found and opened in at most 4 taps), criterion 6 (palette over fuzz-kit states stays pure: runs on frozen states in tests 1 to 4).
**Flag.** `FLAGS.navPalette`.
**Hot-file notes.** New files plus `nav.css`.
**Depends on.** R1-N4, R1-N5, and (cross-check) R1-A4 (`ModalSurface`) and R1-A8 (`lazyView`, the zone test).
**Size.** Source about 600 (no `PaletteHost`, plus `lazy.tsx`), tests about 410.

---

### R1-N7 Shortcuts, header buttons, GameScreen wiring

**Roadmap items.** G.9 (header search button and inbox bell, Ctrl or Cmd+K, "/", 1 to 4, A), D.11 criterion 7. Cross-check: this task also owns the **inbox bell and the inbox sheet wiring** that R1-T6 hands over (nobody else edits `Header.tsx` or `GameScreen.tsx` for it).

**Files.** Create `src/ui/nav/shortcuts.ts`, `src/ui/nav/reopen.ts`; modify `src/ui/components/Header.tsx`, `src/ui/components/BottomBar.tsx`, `src/ui/screens/GameScreen.tsx`, and `src/ui/components/ReturnChip.tsx` (one line: `openingClearsReturn` also returns false for `'inbox'`, so a peek at the inbox, like the profile, does not forget the "Back to" spot; verified: it is `sheet !== 'profile'` at `ReturnChip.tsx:49`); extend `nav.css` (including `.hdr-bell` and its count pill, which reuse the `hdr-icon` class and so get the 44 px target from R1-A7). Tests: `test/nav-shortcuts.test.ts`, `test/nav-header.test.ts`.

**Interfaces.**
```ts
// src/ui/nav/shortcuts.ts
import type { BottomTab } from '../components/BottomBar'
export type ShortcutAction = { type: 'palette' } | { type: 'tab'; tab: BottomTab } | { type: 'age' }
export interface ShortcutEvent { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }
export interface ShortcutContext { typing: boolean; queueBusy: boolean; dead: boolean; sheetOpen: boolean; paletteOpen: boolean; popupOpen: boolean }   // cross-check: GameScreen fills sheetOpen as `sheet !== null || timeMachineOpen || isModalOpen()` and popupOpen as `queueBusy || isModalOpen()` (a11y's isModalOpen sees every ModalSurface, so a Settings dialog, the Time Machine sheet or the inbox sheet can never let a digit key switch tabs)
export function shortcutFor(ev: ShortcutEvent, ctx: ShortcutContext): ShortcutAction | null
export function useGlobalShortcuts(ctx: ShortcutContext, handle: (a: ShortcutAction) => void): void   // window keydown; calls event.preventDefault() when handled

// src/ui/nav/reopen.ts   (kept out of place.ts so that file stays free of React-importing modules)
export function placeToReopen(g: GameState, p: PlaceRef & { personId?: string }): ResolvedReturn   // resolveReturnPoint on a synthetic ReturnPoint, so a vanished path trims to its deepest valid ancestor

// Header.tsx
export interface HeaderProps { g: GameState; onProfile: () => void; onSearch?: () => void; inbox?: { count: number; onOpen: () => void } }
// GameScreen.tsx (module-private) OpenSheet gains   nonce?: number    // remounts MenuSheet when the palette opens another place
// GameScreen.tsx (module-private) SheetKind = BottomTab | 'profile' | 'inbox'    // cross-check: 'inbox' renders <InboxSheet onClose={close} onOpenLink={openLink} /> (R1-T6)
//   openLink(link: string): void   // parsePlaceKey(link) then openPlace(place); an unparsable link is ignored and the sheet just closes
```

**Behaviour.**
1. `shortcutFor` rules:
   - `palette`: (`ctrlKey` or `metaKey`) and key `k` (any case), allowed while typing; or key `/` with no modifier and `typing` false. Never when `queueBusy`, `dead` or `popupOpen`. Ignored when `repeat`.
   - `tab`: keys `1` to `4` with no modifier, only when not typing, not `queueBusy`, not `paletteOpen`, not `popupOpen` (the choice popup owns the digits: `ModalHost.tsx` `ChoiceCard`). Mapping follows the bottom bar: 1 occupation, 2 assets, 3 relationships, 4 activities.
   - `age`: `a` or `A` with no modifier, only when nothing is open (`sheetOpen`, `paletteOpen`, `popupOpen`, `typing`, `queueBusy`, `dead` all false) so browsing never ages you by accident.
   - Everything else gives null. `typing` is computed from `document.activeElement` (input, textarea, select, contenteditable), the same test as `isTyping` in `ModalHost.tsx`.
2. `Header`: when `onSearch` is given, a `<button className="hdr-icon" aria-label="Search" title="Search (Ctrl+K or /)" aria-keyshortcuts="Control+K /">` with a magnifier emoji between the brand and the settings button; when `inbox` is given a bell button `className="hdr-icon hdr-bell"` with `aria-label="Inbox, {n} new"` (or `Inbox` for zero; cross-check: R1-T6's wording, `n = inbox.count`) and a count pill (`9+` above 9). With neither prop the markup equals v4.0.2.
3. `BottomBar`: add `aria-keyshortcuts` (`1` to `4` on the tabs, `A` on the age button); no other change.
4. `GameScreen`: `const [palette, setPalette] = useState(false)`; `useGlobalShortcuts` maps `palette` to `setPalette(true)`, `tab` to the existing `open(tab)` (which clears the chip), `age` to `ageUpAction`. The header gets `onSearch` only when `FLAGS.navPalette` and the life is alive and `g.queue.length === 0`. The inbox prop is passed only while `flagOn('quietInbox')` (R1-T6's flag), as `{ count: inboxUnread(g), onOpen: () => open('inbox') }` with `inboxUnread` from `src/game/inbox` (R1-T5: pure, O(1), already bounds a hostile `g.flags.inbox`, so no defensive reading here); `open('inbox')` is the existing `open` with the new `SheetKind` (it clears the return chip like any sheet). Render `<LazyPalette g={g} onClose={() => setPalette(false)} onOpenPlace={openPlace} />` (from `../nav/lazy`) when `palette` is true; no `React.lazy`, no `Suspense`. `openPlace(p)` calls `clearReturnPoint()` then `setSheet({ kind: p.tab, reopen: placeToReopen(g, p), nonce: n + 1 })` (`placeToReopen` builds `{ sheet: p.tab, personId: p.personId, path: p.path, scrolls: [], lifeId: g.lifeId, age: g.character.age, year: g.year }` and passes it to `resolveReturnPoint`), and the sheet's React `key` becomes `${kind}:${nonce}`. A new life closes the palette (the existing `[lifeId]` effect). `remember` also pushes the recent (N5).
5. All behind `FLAGS.navPalette`.

**Tests.**
`test/nav-shortcuts.test.ts`:
1. Ctrl+K and Cmd+K give `palette`, also while typing; blocked with `queueBusy`, `dead`, `popupOpen`.
2. `/` gives `palette` when not typing and no modifier; null while typing, with Ctrl or Alt.
3. `1` to `4` map to occupation, assets, relationships, activities; null while typing, `queueBusy`, `paletteOpen`, `popupOpen`, or with a modifier.
4. `a` and `A` give `age` only when everything is closed; null with a sheet open, with `repeat`, with Ctrl (so Ctrl+A keeps selecting text).
5. A 40-row truth table covering the combinations above.
6. Other keys (`Enter`, `Escape`, `5`, `k` without Ctrl) give null.

`test/nav-header.test.ts` (real store, pattern of `test/ui-return.test.ts`):
7. `Header` with `onSearch` shows a button with `aria-label="Search"` and `aria-keyshortcuts`; without props the markup equals a render of the same `Header` before the change (compare to a string built by rendering with `onSearch` undefined, and assert it contains no `Search` button).
8. Bell: `inbox={{ count: 3, onOpen }}` gives `aria-label="Inbox, 3 waiting"` and the count; zero gives `Inbox`; no prop gives no bell.
9. `BottomBar` buttons carry `aria-keyshortcuts` 1 to 4 and A.
10. `GameScreen` with the flag on renders the header search button and no palette markup; with the flag off the markup has no `Search` button (compare with `test/ui-return.test.ts` expectations still passing).
11. `openPlace` resolution: calling the exported pure helper `placeToReopen(g, place)` for `['activities','computer']` gives a `ResolvedReturn` with `sheet: 'activities'`, `path: ['computer']`; for a person place gives `personId`.
12. Return chip as recent: after `store.setReturnPoint(...)` and `recentFromSpot`, `pushRecent` puts that place first; the palette empty state (N6 `paletteRows`) lists the live chip target before the recents.
13. Inbox count (cross-check): `GameScreen` passes `inboxUnread(g)`; with `g.flags.inbox` set to a string, a 500-element array and `null` the bell count is 0, at most 60 and 0 (the hostile cases belong to R1-T5's tests; here only the wiring is asserted).
14. The bell is rendered only with `quietInbox` on (`withFlags`), opens the `'inbox'` sheet, and `openLink('assets/home')` opens the assets sheet at `['home']` while `openLink('x/%')` opens nothing and closes the sheet; the sheet is an `InboxSheet` inside a `Sheet` (so a11y's `ModalSurface`).
14b. `openingClearsReturn('inbox')` is false, `openingClearsReturn('assets')` is true, `openingClearsReturn('profile')` is false.
15. Shortcut context: a `ModalSurface` open (use `isModalOpen` through a fake modal registered with a11y's `openModal`) makes `1` to `4` and `a` return null even when no sheet state is set.

**Proves.** D.11 criterion 7 (open palette, type, tap: three taps).
**Flag.** `FLAGS.navPalette`.
**Hot-file notes.** `Header.tsx`, `BottomBar.tsx`, `GameScreen.tsx` (hunks: imports, state and effect block, header props, palette render, inbox sheet, sheet key). Merge after R1-A5 (`BottomBar` attribute) and R1-A7 (`hdr-icon` size).
**Depends on.** R1-N6 (`LazyPalette`), R1-T5 and R1-T6 (`inboxUnread`, `InboxSheet`, `Settings.quietMode`), R1-A4 (`isModalOpen`), C-FLAGS.
**Size.** Source about 340, tests about 300.

---

### R1-N8 Company cockpit

**Roadmap items.** G.5 (company cockpit: KPI tiles plus Run, Money, Leadership, Exit), D.11 criteria 6 and 4.

**Files.**
- Create `src/game/hubs/company.ts`; modify `src/game/hubs/index.ts`.
- Modify `src/game/business/manage.ts` (append `businessScreen`), `src/game/business.ts` (lines 35 and 88), `src/game/business/conglomerate-menu.ts` (line 323), `src/game/special/gamedev.ts` (line 152), `src/game/business/dashboard.ts` (add `export` to `function runway`, line 62), `test/fuzz-kit.ts` (`walk`: `hub.` groups do not add depth).
- Tests: `test/nav-company.test.ts`; extend `test/nav-tree.test.ts`.

**Interfaces.**
```ts
// src/game/hubs/company.ts
export const HUB_PREFIX = 'hub.'
export function hubIds(assetId: string): { kpi: string; run: string; money: string; lead: string; exit: string }   // 'hub.biz.kpi.<id>', 'hub.biz.run.<id>', ...
export function companyKpiSpec(g: GameState, a: Asset): ChartSpec | null    // null when the company has no settled year
export function companyScreen(
  g: GameState,
  a: Asset,
  flat: MenuNode[],
  rebuild: (g: GameState) => MenuNode[] | null,     // the flat list for the latest state, or null when the asset is gone
): MenuNode[]                                         // flat when !FLAGS.cockpits or the flat list lacks the known headings
// src/game/business/manage.ts
export function businessScreen(g: GameState, a: Asset): MenuNode[]
// = companyScreen(g, a, businessView(g, a), (gg) => { const cur = findBusiness(gg, a.id); return cur ? businessView(gg, cur) : null })
```

**Behaviour.**
1. `companyScreen` partitions `flat` by the section headings that `businessView` emits (`manage.ts:2237-2273`): run starts at heading `biz.runH.<id>` or `biz.financeH.<id>`; money at `biz.moneyH.<id>`; leadership at `biz.leadH.<id>`; exit at `biz.exitH.<id>`. Zone 0 is everything before the run heading (dashboard info rows, governance info rows, `biz.milestones.<id>`, `biz.details.<id>`, `venue.owner.<id>` for venues, `sector.desk.<id>` for sector companies). Output order:
   1. `biz.dash.who.<id>` info row (unchanged),
   2. the KPI info row `{ type: 'info', id: hub.biz.kpi.<id>, emoji: '\u{1F4CA}', text: <the texts of the old money and results rows joined with ' | '>, chart: (g) => companyKpiSpec(g, a) }`, replacing the two old rows `biz.dash.money.<id>` and `biz.dash.results.<id>` (kept as they are when `companyKpiSpec` is null, which happens for a company without `last`),
   3. `biz.dash.market.<id>` and `biz.dash.health.<id>` (unchanged, absent for finance firms as today),
   4. the remaining zone-0 nodes in their flat order (governance infos, milestones, details, venue and sector menus),
   5. four `MenuGroup` tiles in this order with `children: (gg) => { const f = rebuild(gg); return f ? <the same part of f, cut by heading> : [info 'You no longer own this business.'] }`. The tiles must re-derive from the latest state on every call, because `MenuSheet` re-resolves the open group from the live state each render (a partition captured when the parent was built would go stale after the first action). `rebuild` is injected by `businessScreen` so `hubs/company.ts` never imports `manage.ts` (that import would put the hub into the 30-module cycle): `hub.biz.run.<id>` "Run" (emoji of the industry or the gear), `hub.biz.money.<id>` "Money", `hub.biz.lead.<id>` "Leadership", `hub.biz.exit.<id>` "Exit".
   The headings themselves (`biz.runH` and so on) stay as the first node of each tile so the nested lists keep their titles. A heading found inside a part (for example `biz.keyStaffH.<id>`) stays inside it. If none of the four known headings is in `flat`, return `flat`.
2. DFS action order is unchanged: header-zone groups come before the tiles exactly as they precede the run heading in the flat list, and the tiles contain run, money, leadership, exit in flat order. The tree test asserts sequence equality, not only set equality (the seeded drivers collect by position).
3. Tile subtitles (functions of `g`, at most 60 characters, no dashes), computed from one memoised facts object per `(g, assetId)`: Run `${totalOutlets(b)} ${def.sitePlural or def.site} · ${b.employees + b.staff.length} staff`; Money `Cash ${money(b.cash)}` plus ` · debt ${money(b.debt)}` when debt is positive (`money` from `business/util.ts`); Leadership `You are CEO` (when `runsIt`), `Hired CEO · skill ${b.manager.skill}` or `No CEO`; Exit `Worth ${money(b.valuation)}` or `Listed · ${money(b.valuation)}`.
4. `companyKpiSpec(g, a)`: reads `readBiz(g, a)`; null when `b.last` is null. Otherwise `kind: 'kpi'`, `title: `${a.name}: at a glance`` cut to 60, `unit: 'money'`, `x`: the history years (`b.history`, at most the last 10 today, 30 after S1) as numbers plus `'now'`; series (ids, labels, tones): `sales` "Sales" `c1` (history `revenue`; `null` for 'now'), `net` "Net profit" tone `good` when `b.last.net >= 0` else `bad` (history `profit`; null for 'now'), `cash` "Cash" `c3` (history `cash` if S1 wrote it, else null, with `b.cash` at 'now'), `value` "Value" `c2` (history `valuation`, `b.valuation` at 'now'). Values are internal dollars (the internal unit is already a constant-price dollar; labels are formatted by the kit under `withMoneyContext(moneyContextOf(g))`, per D24). Every number passes `Number.isFinite` and a clamp of plus or minus 1e15, else null. `summary` is the accessible sentence (at most 120 characters per string, at most 6 series, at most 64 points), for example `Acme Foods: sales $9.8M, net profit $1.2M, cash $2.1M, value $14M.` The spec must pass `readChartSpec`.
5. Finance firms and other kinds use the same code (their dashboard also has who, money, results).
6. `businessScreen` replaces `businessView` at the four call sites (`business.ts:35` company group, `business.ts:88` `businessAssetView`, `conglomerate-menu.ts:323`, `gamedev.ts:152`); `businessView` itself stays flat and exported.
7. Flag off: `businessScreen(g, a)` returns exactly what `businessView(g, a)` returns.

**Tests (`test/nav-company.test.ts`; companies built with the `company()` pattern of `test/company-dashboard.test.ts` for classic, studio, deep tech, finance, brand new; one with a 30-row history).**
1. Flag off: `businessScreen` ids equal `businessView` ids.
2. Flag on, classic company: at most 14 top-level rows (flat has 39+); the four tile ids are present in the order run, money, lead, exit; the KPI info row precedes `biz.dash.market`.
3. DFS parity (criterion 6): `actionSequence` over `[company screen]` with the flag off equals the sequence with it on, for all five kinds (hub segments stripped); the sets are equal too. Extend `test/nav-tree.test.ts` with the same check on the `ceo` canned state through the whole `assets` tab.
3b. Money tile (cross-check): when `src/game/business/books-menu.ts` exists (R1-C13 merged; `existsSync` guard) and `chartKit` is on, the children of `hub.biz.money.<id>` contain the group `biz.books.<id>` right after `biz.economicReport.<id>` (verified in v4.0.2: `manage.ts` pushes `economicReportMenu` directly after the `biz.moneyH` heading), and the DFS action sequence is still equal with the flags off and on (the group holds only `info` rows).
4. KPI spec: kind `kpi`, at most 6 series, at most 64 points, `title` at most 60, every string at most 120, `readChartSpec(spec)` is not null, all values finite or null; last non-null of `sales` equals `b.last.revenue`, of `net` equals `b.last.net`, of `cash` equals `b.cash`, of `value` equals `b.valuation`.
4b. Agreement with the Annual Report (cross-check): for a company with 8 booked years, the last non-null values of `sales`, `net`, `cash` and `value` equal the `Sales`, `Net profit`, `Cash` and `Value` tiles of R1-C5 `companyKpis(g, b, null)` (same sources: `b.last.revenue`, `b.last.net`, live `b.cash`, `b.valuation`). Skip with a visible `it.skip`-free guard (`existsSync('src/game/charts/books.ts')`) so the file also runs before C5 merges, and rely on the merge order (C5 before this task) otherwise.
5. Brand-new company (no `last`): `companyKpiSpec` is null and the screen keeps the old money and results rows, no KPI row.
6. Old save (history rows with the original 9 numbers only, plus a row with strings and NaN through `normalizeBiz`): no NaN or `undefined` in the spec or in any tile subtitle; cash series has nulls except 'now'.
7. Hostile history (`profit: 1e300`, `valuation: -Infinity`): values clamped or null, spec still valid or null, no throw.
8. Purity: render twice on a frozen state gives equal serialised screens; `g.rng` and the state JSON unchanged.
9. Wiring: the children of the `biz.company.<id>` group built by `businessCareerMenu` equal `businessScreen` (ids); the `asset-<id>` view from `businessAssetView` equals it too; a static scan shows no call of `businessView(` outside `manage.ts`, `hubs/` and tests.
10. Tile subtitles: at most 60 characters, no U+2014 or U+2013, no `NaN`, `undefined`, `Infinity`.
11. `fuzz-kit` change: a synthetic tree with a `hub.` group at depth 5 is walked one level deeper than the same tree without it (unit-test the helper, or assert the `walk` source line).
12. Run `test/company-dashboard.test.ts`, `test/business.test.ts`, `test/conglomerate-play.test.ts`, `test/gamedev-review.test.ts` with the flag off to prove nothing moved.

**Proves.** D.11 criterion 6 (company screen reachability, same order), criterion 4 (hostile history), plus the company half of G.5.
**Flag.** `FLAGS.cockpits`.
**Hot-file notes.** `manage.ts` (append after `businessView`), `business.ts` (two one-word edits), `conglomerate-menu.ts` (one), `gamedev.ts` (one), `dashboard.ts` (`export`), `fuzz-kit.ts` (one line). The Charts track edits other business files (`state.ts`, `economy.ts`, `yearly.ts`, `competition*.ts`), not these.
**Depends on.** R1-N2 (company badge, memo), C-SPEC, C-VIEW (optional: without it the KPI row shows its `text`), C-ARCH, R1-C5 (test 4b), R1-A6 and R1-C13 only for merge order on `MenuList.tsx` (this task edits `manage.ts`, not `MenuList.tsx`).
**Size.** Source about 400, tests about 380.

---

### R1-N9 Wealth cockpit and thin tab cockpits

**Roadmap items.** G.5 (wealth cockpit: net-worth line plus one card per company from `companyCards(g)`; each tab opens on a cockpit), D.11 criteria 2 and 4 as far as they touch the panel.

**Files.**
- Create `src/game/hubs/wealth.ts` (`companyCards`), `src/game/hubs/cockpit.ts` (`cockpitOf`), `src/game/hubs/series-adapter.ts`, `src/ui/nav/kit.ts`, `src/ui/nav/CockpitPanel.tsx` (cross-check: a plain static component, not a lazy shell), `src/ui/nav/CockpitBody.tsx` (static), `src/ui/nav/JumpStrip.tsx`; extend `nav.css`.
- Modify `src/ui/components/MenuSheet.tsx` (root-level panel), `src/ui/components/RelationshipsSheet.tsx` (panel plus Needs you from `peopleMenu`).
- Test: `test/nav-cockpit.test.ts`.

**Interfaces.**
```ts
// src/game/hubs/wealth.ts
export interface CompanyCard {
  assetId: string; name: string; emoji: string; industry: string
  health: { id: 'new' | 'thriving' | 'steady' | 'struggling' | 'danger'; label: string; emoji: string }
  sales: (number | null)[]        // last up to 10 years of revenue, oldest first
  salesNow: number | null; net: number | null; valuation: number; cash: number
  runwayYears: number | null      // null when profitable (Infinity upstream)
  open: string[]                  // path under the assets tab: ['asset-<id>']
}
export function companyCards(g: GameState, max?: number): CompanyCard[]   // default max 12; memoised per g in a WeakMap

// src/game/hubs/cockpit.ts
export type CockpitTab = 'occupation' | 'assets' | 'relationships' | 'activities'
export interface CockpitTile { id: string; label: string; value: string; note?: string; tone: ChartTone; meter?: number; spark?: (number | null)[]; open?: string[] }
export interface CockpitModel { tab: CockpitTab; summary: string; tiles: CockpitTile[]; chart: ChartSpec | null; cards: CompanyCard[]; moreCards: number }
export function cockpitOf(tab: CockpitTab, g: GameState): CockpitModel

// src/game/hubs/series-adapter.ts   (a two-line re-export now that the names are final)
export { lifeRows as lifeRowsOf } from '../life-series'                  // R1-C3
export { netWorthSpec as netWorthChart } from '../charts/networth'        // R1-C15

// src/ui/nav/kit.ts   (cross-check: the only file in src/ui/nav that imports the chart gate, and only the lazy views)
export { LazyChartView, LazyKpiTile, LazySparkline } from '../charts/lazy'

// src/ui/nav/CockpitPanel.tsx
export function CockpitPanel(props: { tab: CockpitTab; g: GameState; onOpen: (path: string[]) => void }): ReactElement | null   // static; null unless FLAGS.cockpits; builds the model and renders CockpitBody (the chart code arrives through the lazy views)
// src/ui/nav/CockpitBody.tsx
export function CockpitBody(props: { model: CockpitModel; jump: JumpLink[]; onOpen: (path: string[]) => void }): ReactElement
export interface JumpLink { key: string; label: string; emoji: string; crumbs: string[]; place: PlaceRef }
export function jumpLinks(g: GameState, prefs: UiPrefs, tab: CockpitTab, max?: number): JumpLink[]   // pins then recents for this tab, live-resolved with placeToReopen (reopen.ts; NOT createResolver: searchIndex.ts is in the palette zone), at most 4
```

**Behaviour.**
1. `companyCards`: for each of `businessAssets(g)` (cap 12): `readBiz`, `companyHealth` (exported from `business/dashboard.ts`), `industryDef(b.industry).label`, `sales` from `b.history.slice(-10).map(h => finite(h.revenue))`, `net` from `b.last?.net`, `runwayYears` from the exported `runway` (infinite gives null). A company whose numbers are damaged gets 0 or null, never NaN, and is not dropped. `moreCards` (in the model) is the count above 12. Sorted by valuation descending. Memoised by `g` identity.
2. `cockpitOf('assets')`: tiles `Net worth` (`shortMoney(netWorth(g))`, spark from `lifeRowsOf`, tone `c1`), `Cash` (`g.character.money`, `c3`), `Debt` (loans plus mortgages, tone `bad` when positive else `muted`); `chart` = `netWorthChart(g)` (null under 2 rows, then only the tiles show); `cards` = `companyCards`. Each tile has an `open` path only when there is a screen for it (`Debt` opens `['banking']` when that group exists in the Assets list; otherwise none).
3. `cockpitOf('occupation')`: employed: `Role` (title, note company), `Pay` (`shortMoney(salary)/yr`, or hourly for part-time), `Performance` (meter 0 to 100), `Years here` (`yearsAtCompany`); student: `School` (name), `Grades` (meter); retired: `Pension`; prison: one `Prison` tile; otherwise `Role` with `roleLabel(g)`. `cockpitOf('relationships')` and `cockpitOf('activities')` return `tiles: []` and a one-line `summary`; their value is the Needs you card and the Pinned/Recent strip (full Career, People and World cockpits arrive with G.10 in R4 to R8 and plug into this function).
4. `CockpitBody`: a `LazyKpiTile` per tile (tile `open` becomes `onPress`; `fallback` is a plain `<div className="ch-kpi">` with label, value and note, so the tile is readable before the chunk loads and in tests), the chart through `LazyChartView` (fallback: the spec's `summary` line), company cards (name, health chip with text and glyph, `LazySparkline` of `sales` with label `Sales, last N years` and an empty fallback, net and runway text, tappable at 44 px, `onOpen(card.open)`), a `+N more` button that opens `['businesses']` when `moreCards > 0`, then the `JumpStrip` (up to 4 links). Money text uses `shortMoney`; the "prices of {year}" chip belongs to the chart frame (C-VIEW).
5. `MenuSheet`: at the root level with `FLAGS.cockpits`, render `<CockpitPanel tab={root.id as CockpitTab} g={g} onOpen={nav.openPath} />` after the `header` box and before the Needs you card and the rows. The `onOpen` path is relative to the sheet root, which is what `openPath` takes. `RelationshipsSheet` renders `<CockpitPanel tab="relationships" ... onOpen={(path) => select the person from path[0]} />` plus `NeedsYouCard` fed by `needsYou(peopleMenu.children(g), g)`. At any depth below the root nothing is added.
6. Cross-check: no `React.lazy`, no `Suspense`. `CockpitPanel` and `CockpitBody` are small and static (about 250 lines); only the chart kit is lazy, through `src/ui/charts/lazy.tsx` (a11y's zone rule). Until the kit chunk is ready the tiles and cards show their text fallbacks, so the screen is never blank and tests read real text.

**Tests (`test/nav-cockpit.test.ts`).**
1. `companyCards(ceo)` returns one card per company (2), fields finite, `sales` at most 10 points oldest first, `open` is `['asset-<id>']`, `runwayYears` null for a profitable company and positive for a losing one.
2. 13 synthetic companies give 12 cards and `moreCards` 1 in the model; the order is valuation descending.
3. Memo: the same `g` returns the same array; a new `g` recomputes.
4. `cockpitOf('assets', adult)`: tile values equal `netWorth(g)`, `g.character.money` and loans plus mortgages; chart is null with fewer than 2 life rows and a `line` spec with 3 synthetic rows (stub `series-adapter` through `vi.mock` until Charts lands).
5. `cockpitOf('occupation')` for employed, student, retired, unemployed and prison states returns the expected tile ids and no NaN; Performance meter is clamped to 0 to 100.
6. `cockpitOf('relationships'|'activities')` returns empty tiles and a non-empty summary.
7. Hostile: a business asset whose `details` is garbage, an asset with `value: NaN`, a company with 500 history rows: models stay finite and bounded, no throw (criterion 4).
8. Purity: all four `cockpitOf` calls on a frozen `ceo` state leave the JSON and `g.rng` unchanged and are equal when called twice (RF5).
9. Markup (`CockpitBody` with a hand-made model): one tile per model tile, a card per company with its sparkline `aria-label`, the `+N more` button only when `moreCards > 0`, the jump strip with at most 4 links; chart absent when `chart` is null.
10. `CockpitPanel` returns null with `cockpits` off; with it on, before `await LazyKpiTile.preload()`, the markup contains each tile's label and value as text (the fallback) and no `ch-frame`; after the preload it contains the real tiles (`ch-kpi` with a sparkline) and, for a model with a chart, the `ch-frame` figure.
11. `MenuSheet` root markup for `assets` (flag on, `ceo` state through the store) contains the cockpit before the first `menu-row` and the Needs you card when a company is in danger; with `initial: { path: ['businesses'] }` it contains neither.
12. `jumpLinks`: pins first then recents for the tab, unresolvable ones dropped (through `placeToReopen`, which trims a vanished path to its deepest valid ancestor: a link is kept only when nothing was trimmed), other tabs' links excluded, at most 4; a static scan finds no import of `searchIndex` in `CockpitBody.tsx`, `JumpStrip.tsx` or `hubs/*`.
13. Tap contract: the card's `onPress` handler (read from the element tree) calls `onOpen(['asset-<id>'])`.
14. Run `test/nav-tree.test.ts`, `test/ui-return.test.ts` with flags on and off.

**Proves.** D.11 criteria 2 and 4 for the panel; G.5 wealth half; criterion 12 (cards are memoised, kit is lazy).
**Flag.** `FLAGS.cockpits`.
**Hot-file notes.** `MenuSheet.tsx` and `RelationshipsSheet.tsx` (own hunks). The kit stays out of the main bundle through `src/ui/charts/lazy.tsx`.
**Depends on.** R1-N8, R1-N5 (`openPath`, prefs, `placeToReopen` from N7's `reopen.ts`: cross-check, so N9 also needs R1-N7 or must create `reopen.ts` itself; merge N7 first), R1-N2 (`NeedsYouCard`), C-SPEC, C-TILE, C-VIEW, C-SERIES (R1-C3, R1-C15), R1-C9 (`lazy.tsx`).
**Size.** Source about 640 (no lazy shell), tests about 420.

---

### R1-N10 Release sweep for the three flags, checks, docs (the lead flips them)

**Roadmap items.** D.11 criteria 6, 7, 12, 13 for this track; RF5 (purity) and RF4 (hostile data) aggregate. Cross-check: this task no longer edits `src/game/flags.ts`. R1-P3's release test makes the flip one lead commit (version 4.1.0 plus all eight defaults); a track-level flip would fail it.

**Files.** Create `test/nav-release.test.ts`, `docs/NAVIGATION.md` (about 120 lines: what each flag does, the data-order rule, the hub id prefix, how to add a badge or a keyword, the palette zone and the lazy gate); update any pinned test the flags-on run moves (listed below).

**Behaviour.**
1. Do not flip anything. Simulate the flip in a scratch working copy: set `navRegroup`, `navPalette` and `cockpits` to `true` in `FLAG_DEFS` (R1-P3's release test will object to the version, so skip `test/flags.test.ts`), run the files below, report every failure with its reason in the PR, then revert the scratch edit. Fixes for legitimate changes go into the lead's release commit (each with its reason); fixes for tests that merely assumed a default are made now, by calling `setFlags`/`withFlags`.
2. Run these files one at a time (the full suite is CI): `test/nav-*.test.ts`, `test/ui-return.test.ts`, `test/ui-shell.test.ts`, `test/time-machine.test.ts`, `test/screens.test.ts`, `test/talents-ui.test.ts`, `test/main-character-ui.test.ts`, `test/fidelity.test.ts`, `test/company-dashboard.test.ts`, `test/business.test.ts`, `test/conglomerate-play.test.ts`, `test/gamedev-review.test.ts`, `test/fuzz-regressions.test.ts`, `test/workshop.test.ts`. Expected movers: tests that read the first rows of a company screen through `businessAssetView` or the `biz.company.*` group (now one level deeper). Update each pinned expectation only where the new rule legitimately changes it and say why in the commit. The five seeded simulation tests do not move because the data order of the three roots is unchanged (N2 test 7) and the cockpit keeps DFS order (N8 test 3); if one moves, stop and report instead of re-baselining.

**Tests (`test/nav-release.test.ts`).**
1. Everything below runs inside `withFlags({ navRegroup: true, navPalette: true, cockpits: true }, ...)`, so it passes now and after the lead's flip; a final case asserts that `FLAG_DEFS` still lists the three keys.
2. Aggregate purity (RF5, criterion 6): for each canned state frozen, run `buildIndex`, `search` for 10 queries, `regroupForDisplay`, `needsYou` on each root, `cockpitOf` for the four tabs, `companyCards`, `businessScreen` for each company, `peopleMenu.children`; the state JSON is identical afterwards, `g.rng` unchanged, `Math.random` never called.
3. No leakage: no file under `src/game` contains the text `ui/nav` or `anotherlife.ui.v1`; `JSON.stringify` of each canned state after pins and recents contains neither a pinned id nor `pins`.
4. Money ratchet (criterion 10 preview): none of the new files (`src/game/hubs/*`, `src/ui/nav/*`) contains `earnIncome(`, `addMoney(`, `spend(`, `.money +=` (string scan).
5. Voice: the same files and `docs/NAVIGATION.md` contain no U+2014 or U+2013.
6. Per-tap proxy (criterion 12): with all flags on, `activitiesMenu.children(adult)`, `assetsMenu.children(adult)` and `occupationMenu.children(adult)` evaluate no `children` of any child group (wrap a copy of the roots' children in counting proxies and assert zero calls), and `MenuSheet` root render of each tab calls `groupChildren` once per level shown.
7. Index cost guard: `buildIndex(ceo)` visits at most 20,000 nodes and finishes under 8 seconds on the test machine (a generous guard; the real budget is the time-sliced idle walk).
8. Legacy path stays: with the three flags off the three roots, the company screen and the markup equal v4.0.2 (N2 test 19, N5 test 16, N8 test 1 re-run together).
9. v4.0.2 save: load `test/fixtures/save-v1.json.gz` the way `test/save-schema.test.ts` does (`gunzipSync(readFileSync(...))`, `JSON.parse`, `migrateSave(structuredClone(raw))` from `src/game/save-schema.ts`, expect `kind === 'ready'`), then render the three roots, `cockpitOf` for the four tabs, `businessScreen` for each company and `buildIndex`: no throw, no `NaN` or `undefined` in any label or tile text (criterion 13).

**Proves.** D.11 criteria 6, 7, 12 and 13 (nav side), RF4 and RF5.
**Hot-file notes.** None. The fuzz harness change of N8 keeps `test/fuzz-deep.test.ts` coverage depth.
**Depends on.** R1-N1 to R1-N9; the Charts tasks C-VIEW, C-TILE, C-SERIES must be on the release branch (otherwise the cockpit shows its text fallback, which still passes).
**Size.** Source about 0, tests about 200, docs about 120.

---

## 6. Ordered task table

| Id | Title | Wave | Source | Tests | Depends on |
|---|---|---|---|---|---|
| R1-N1 | Menu-tree test kit, lint ratchet | 1 | 40 | 520 | P2, P3 |
| R1-N2 | Sections, badges, Needs you | 1 | 500 | 420 | N1, A6 (order) |
| R1-N3 | People adapter, keywords | 1 | 250 | 260 | N1 |
| R1-N4 | Search index, ranking, places | 2 | 580 | 560 | N1, N3 |
| R1-N5 | Pins, recents, breadcrumbs, `popTo` | 2 | 480 | 380 | N2, N4, A5 (order) |
| R1-N6 | Palette (`ModalSurface`, `LazyPalette`) | 2 | 600 | 410 | N4, N5, A4, A8 |
| R1-N7 | Shortcuts, header, bell, inbox sheet, GameScreen | 2 | 340 | 300 | N6, T5, T6, A4, A5, A7 (order) |
| R1-N8 | Company cockpit | 3 | 400 | 380 | N2, C-SPEC, C-VIEW, C5 (test 4b) |
| R1-N9 | Wealth and tab cockpits (lazy kit through `charts/lazy`) | 3 | 640 | 420 | N8, N5, N7, N2, C3, C9, C15 |
| R1-N10 | Release sweep (no flip), docs | 3 | 0 | 200 | N1 to N9 |
| | Total | | 3,830 | 3,850 | |

Exit gate for the track: D.11 criteria 6 and 7 green; criteria 2 and 4 for the panel; flag-off equals v4.0.2; `test/architecture.test.ts` unchanged (no new module in a cycle); the five seeded simulation tests did not move.

---

## 7. Plan vs code (differences found while verifying; the roadmap is corrected here)

1. **Regrouping at render time, not in the builder.** Roadmap D.6 says "Activities becomes 8 sections ... with Do Anything on top and Surrender last". In v4.0.2 `activitiesMenu.children` (`menus.ts:110-148`) already puts Do Anything first and Surrender last, with the other 36 rows sorted by label and no headings. Five seeded simulation tests choose actions by position in that list (`simulate.test.ts:167`, `main-character-life.test.ts:137`, `era-features.test.ts:410`, `history.test.ts:447`, `anachronism.test.ts:213`), so reordering the data would move every seeded play and break "R1 changes no simulation output". The plan sections the list in `MenuSheet` only (N2) and extends the snapshot test from "same set" to "same set and same DFS sequence".
2. **The lint cannot reach zero in R1.** D.11 criterion 6 says "no group over 12 rows without headings (28 today) and no one-row group (146 today)". Those numbers are a CEO probe; the offenders are spread over feature files (stock lists, person actions, report-like groups) and many one-row groups are dynamic (a person with one action). Fixing them is hundreds of edits in other tracks' files. The plan ships the lint as a ratchet with a committed baseline (N1) that can only shrink, and zeroes the roots and the new hubs. Recommend the lead accepts "no new violations" for criterion 6 and moves the burn-down to a later release.
3. **Company screen has four routes and one pinned layout.** The roadmap says "3 routes" and a cockpit "in place of the 5 dashboard rows plus the 39-row list". Code: `businessView` is called from four places (`business.ts:35`, `business.ts:88`, `conglomerate-menu.ts:323`, `special/gamedev.ts:152`), and `test/company-dashboard.test.ts:136-139` pins the first rows of `businessView` and the top-level `biz.details` and `biz.milestones`. So `businessView` stays flat and a wrapper `businessScreen` (N8) carries the cockpit behind a flag; the two old money and results rows are replaced by the KPI row only when a settled year exists.
4. **Search cache key.** Roadmap: `(lifeId, year, age, assets.length, job, office)`. Code has no `office` field; the political office is `job.data.office` (`special/politics.ts`). Activities swaps to a different list in prison and the list depends on people and retirement, so the key adds `people.length`, `prison`, `retired`, `alive` and a money bucket (N4).
5. **Relationships is not a menu.** The tab is a custom sheet (`RelationshipsSheet.tsx`, `PersonSheet.tsx`), not a `MenuGroup`; `fuzz-kit.ts` walks people through `personActions` and has no people root. The `peopleMenu` adapter (N3) exists for the index, deep links and the cockpit; the sheets keep their own markup. Person action ids are shared by all people (`relationships.ts:2195` `build(def, pid)` uses `def.id`), so the index, the lint and the snapshot key by full path and never by action id alone.
6. **"Back to" chip becoming a recent.** `ReturnChip.tsx` is presentational; the state is `ReturnPoint` in `ui/store.ts`, set from `GameScreen.remember`. The plan keeps the chip as is and records the same spot as a recent (N5) and lists the live chip target first in the palette (N6). `ui/store.ts` needs no change, which also keeps it free for G.11.
7. **`MenuInfo.chart` rendering.** The roadmap puts `MenuInfo.chart` in the types and the charts under the Charts track; someone must make `MenuRows` render it. This plan assumes the Charts track owns that hook (C-VIEW) and degrades to the info `text` without it.
8. **Hot-file list.** Roadmap lists `core.ts`, `ModalHost.tsx`, `store.ts` for the Navigation track; they belong to G.11 (digest, inbox). This track edits none of them, and does not edit `menus.ts` either (the regrouping is UI-side). It does edit `GameScreen.tsx`, `Header.tsx`, `BottomBar.tsx`, `RelationshipsSheet.tsx`, `PersonSheet.tsx` and the business call sites, which the roadmap does not list.
9. **fuzz-kit.** `walk` and `roots` in `test/fuzz-kit.ts` are private (only `deepFreeze`, `renderAll`, `driver`, `FailureLog` and the life runners are exported), so the plan builds its own walker in `test/nav-kit.ts`. `fuzz-kit` default `maxDepth` is 6; the cockpit adds a level, so N8 makes `hub.` groups free of depth cost to keep the same coverage.
10. **Cycle numbers.** Roadmap: 147 modules in 5 components (85, 30, 19, 7, 6). A runtime-import pass over the source finds 146 modules in 6 components (82, 30, 19, 7, 6, 2); the difference is how dynamic and type-only imports are counted, and the esbuild-based K.1 test is authoritative. All planned `hubs/` modules are acyclic under either count as long as they avoid `manage.ts`, `business.ts`, `career.ts`, `assets.ts`.
11. **Hints are doubly unsafe.** Roadmap says a hint can run the optimiser: confirmed (`business/manage.ts:2252` calls `bestPlan` in the `plan` action's hint). The Investing gut also runs from hints (`investments.ts` `gutGroupHint` on `inv-stocks`, `gutHint` on each stock), which is the one fenced foresight read, so the index's "never hint, never subtitle" rule also keeps the foresight scan (X.G1) clean.
12. **Test collection.** `vite.config.ts` includes only `test/**/*.test.ts`, so no `.tsx` tests; some tests mock `../src/ui/store` with a fixed export list (`test/screens.test.ts`), which is why the new UI avoids new store exports.
13. **Budget.** The roadmap's 2,400 source lines for G.8, G.9 and G.5 is exceeded by about 1,500 (see section 1 for what is not counted and the cut list).
14. **(Cross-check) `.menu-row-end` is `aria-hidden`** (`MenuList.tsx:349`), so the badge pill lives in `.menu-row-text` (N2). **`menus.ts` reaches `manage.ts` and `dashboard.ts` reaches the 85-module cycle component** (import graph rebuilt: 627 modules), so hubs never import `menus.ts` and receive `rebuild` by injection (N8). **`economicReportMenu` is pushed right after the `biz.moneyH` heading** (`manage.ts:2265` to `2266`), so Charts' Books group lands in the Money tile. **`doAnythingAction` is exported** (`menus.ts:85`).

---

## Changed by cross-check

Applied from `00-crosscheck.md` (decisions D2 to D6, D8; collisions table):

1. **Flags and types are Platform's.** N1 no longer edits `types.ts` or `flags.ts` (R1-P2 adds the fields, `keywords` is `readonly string[]`; R1-P3 declares `navRegroup`, `navPalette`, `cockpits`). N10 no longer flips; it is a release sweep and the lead flips all eight flags in one commit. Tests use `setFlags`/`resetFlags` or `withFlags`; no assignment, no module mock.
2. **Lazy loading follows a11y's seam.** No `React.lazy` anywhere. N6 adds `src/ui/nav/lazy.tsx` (`LazyPalette`, made with `lazyView`), gives `Palette.tsx` a default export and drops `PaletteHost.tsx`; the palette renders inside `ModalSurface`. N9's `kit.ts` re-exports only `LazyChartView`, `LazyKpiTile`, `LazySparkline` from `../charts/lazy`; `CockpitPanel` and `CockpitBody` are static; `jumpLinks` resolves places with `placeToReopen` so `searchIndex.ts` stays inside the palette zone (a11y A8 test 9).
3. **N7 owns the inbox bell and the inbox sheet wiring** (`Header` prop `inbox?: { count, onOpen }`, `SheetKind` `'inbox'`, `InboxSheet`, `onOpenLink` through `parsePlaceKey`, count from `inboxUnread`, visible with `quietInbox`), and builds its shortcut context from React state and `isModalOpen()`. New dependencies: R1-T5, R1-T6, R1-A4.
4. **N2** puts the badge pill inside `.menu-row-text` (the end slot is `aria-hidden`) and merges after R1-A6.
5. **N8** gains test 3b (the Books group sits in the Money tile once R1-C13 is in) and test 4b (the KPI row agrees with R1-C5 `companyKpis`).
6. **Test cost.** `test/nav-kit.ts` gets `walkTreeCached` and `actionSequenceCached`; every file that walks or indexes the canned states uses them (the CEO tree is 11,822 nodes).
7. **Budget.** Source 3,830 lines (N6 -20, N7 +60, N9 -40, N10 -50), tests 3,850.
