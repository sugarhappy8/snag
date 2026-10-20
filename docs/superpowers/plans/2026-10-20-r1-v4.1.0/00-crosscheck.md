# R1 (v4.1.0) cross-check of the five track plans

Inputs: `platform.md` (wave 0), `charts.md`, `nav.md`, `notices.md`, `a11y.md`, the roadmap part D (lines 783 to 976), the R0/R1 run prompt, and the v4.0.2 code at a local clone (read only; nothing was edited, built or run in the repo; two throwaway analysis scripts in a scratch folder read the import graph and the plans).

All five files were edited in place to apply the fixes below; each ends with a "Changed by cross-check" note. The edits keep every file's structure.

## 0. Verdict

1. The five plans are individually sound and mostly consistent, but they were written in parallel and disagreed in eight places that would have broken the merge or the build: task ids (Notices and Navigation both used R1-N1 to R1-N10), flag names and who creates or flips them, who edits `types.ts` and `core.ts`, the palette and cockpit lazy loading (would fail a11y's zone test), the header bell wiring (nobody owned the `inbox` sheet), the `ui-contrast` test (two tracks appending to one file), the badge pill sitting inside an `aria-hidden` element, and the missing 30-life parity probe.
2. 56 tasks after the fixes (Platform 9, Charts 17, Navigation 10, Notices 10, a11y 10). About 18,450 source lines and 19,870 test lines against the roadmap's 14,400 and 10,486 (see section 1). Inside the 28,000-line envelope, 5 tracks against a cap of 9.
3. Three things the roadmap promises that the plans do not deliver as written are listed in section 6.3: the D.11.6 lint reaching zero (the plans ship a ratchet), "repeated lines in the life log start to thin" (the flavor move is output-identical by design), and the 30-life probe plus per-tap cost harness (nobody built it; new task R1-P9).
4. No task adds a `g.rng` draw to a sequence that runs in R1. The one new draw (`pickLine`) has no production caller; a scan test now pins that (R1-T1 test 11). Company history growing to 30 rows cannot move a result (readers re-audited, section 7.3).

## 1. Shape and totals

| Track | Prefix | Tasks | Source | Tests | Roadmap line budget |
|---|---|---|---|---|---|
| Platform (wave 0) | R1-P | 9 (P9 added) | about 2,740 | about 1,990 | 3,400 incl. K.5a (600) |
| Charts | R1-C | 17 | about 8,200 | about 8,600 | 6,800 incl. G.5 (700) |
| Navigation (incl. G.5) | R1-N | 10 | about 3,830 | about 3,850 | 2,900 (+700 G.5) |
| Notices and text | R1-T (was R1-N) | 10 | about 1,800 | about 3,100 | 1,300 + 500 (G.11) |
| a11y, K.5a, lazy | R1-A | 10 | about 1,880 | about 2,330 | 1,300 incl. K.5a |
| Total | | 56 | about 18,450 | about 19,870 | 14,400 / 10,486 |

At the roadmap's 4.1 agent-hours per 1,000 source lines this is about 76 agent-hours (roadmap 59). With the 3 test-running agents the machine allows, expect 24 to 28 wall hours, not 17.8. Wave 0 (R2's base) is about 12 agent-hours, so about 7 hours wall, not 6, once P7 and P8 are moved out of it (section 4). If the lead must trim, cut in this order: C13b Books group (180 lines), C16 screenshot harness (380; keep the manual phone check), N9 occupation tiles (120), N9 Pinned/Recent strip (90), P8 (J.1 advisory; 300). Do not cut A3 (Home notices) or P9.

## 2. Decisions made by the cross-check

| # | Problem | Decision | Where applied |
|---|---|---|---|
| D1 | Notices and Navigation both named their tasks R1-N1 to R1-N10 | Notices becomes **R1-T1 to R1-T10** ("text and notices"). Navigation keeps R1-N. | notices.md renamed throughout |
| D2 | Flag names differ: Platform pre-declares `navHubs`, `searchPalette`, `quietMode`, `textMemory`; Navigation uses `navRegroup`, `navPalette`, `cockpits`; Notices uses `noticeDigest`, `quietInbox`; a11y adds `idbSaves`. Three tracks also planned to create or flip keys in `flags.ts`, and tests planned to mock the module or assign to `FLAGS` (compile error: it is readonly) | **Eight keys, created once by R1-P3**: `chartKit`, `annualReport2`, `navRegroup`, `navPalette`, `cockpits`, `noticeDigest`, `quietInbox`, `idbSaves`. `textMemory` is dropped (the flavor move is parity-proven and ships live). Nobody else edits `flags.ts`; **only the lead's release commit flips defaults** (with the version bump; R1-P3's release test fails on either half alone). Every test sets flags with `withFlags(over, fn)` or `setFlags` plus `resetFlags`; R1-P3 gets a guard test that no test mocks `src/game/flags`. Navigation's N10 and Notices' T10 no longer flip; they become acceptance sweeps. | platform P3; nav N1, N10, contracts; notices T4, T5, T6, T10, contracts; a11y A2; charts contracts |
| D3 | `types.ts` and `core.ts` edits were spread over Platform, Charts (`spark`, `AnnualReportData.chart`), Notices (`link`) and Navigation ("add if missing") | **R1-P2 owns every new field in `types.ts`** (`NoticeModal.weight/link`, `MenuBase.keywords/section/badge/conf/spark`, `MenuInfo.chart/conf`, `AnnualReportData.chart`) and `NoticeOptions.weight/link` plus the conditional spreads in `core.ts`. Other tasks verify and stop if missing. R1-T5 later changes only the one `weight` expression in `notice()`. `keywords` is `readonly string[]` (Navigation's `string[]` would not accept it). | platform P2; charts C10, C14, 2.3; nav N1, N3; notices T5 |
| D4 | The palette used `React.lazy` and `PaletteHost`; cockpits used `React.lazy` and a `src/ui/nav/kit.ts` re-exporting `ChartView`, `KpiTile`, `Sparkline` directly. a11y's `test/lazy-zones.test.ts` would fail both, and `React.lazy` hides content from `renderToStaticMarkup` | Palette: new gate file `src/ui/nav/lazy.tsx` exporting `LazyPalette` (made with `lazyView`); `Palette.tsx` has a default export; `PaletteHost.tsx` is dropped. Palette zone = `Palette.tsx`, `paletteModel.ts`, `searchIndex.ts`, `searchRank.ts`, `useSearchIndex.ts` (a11y A8 test 9 now lists them). Cockpits: `kit.ts` re-exports `LazyChartView`, `LazyKpiTile`, `LazySparkline` from `../charts/lazy`; `CockpitBody` is static; no `React.lazy`. `jumpLinks` resolves places with `placeToReopen` (reopen.ts), not `createResolver` (zone). | nav N6, N7, N9; a11y A8 |
| D5 | The palette drew its own dialog markup; a11y requires every full-screen surface to use `ModalSurface` and shortcuts to respect `isModalOpen()` | Palette renders inside `ModalSurface`; shortcuts compute `sheetOpen`/`popupOpen` from React state **and** `isModalOpen()`. | nav N6, N7 |
| D6 | Nobody owned the header bell and the `inbox` sheet: Notices said Navigation wires it, Navigation said "until G.11 lands the bell is hidden" and listed no `InboxSheet` render. Prop names differed (`onInbox` vs `inbox`) | **R1-N7 owns it** (depends on R1-T5 and R1-T6): `Header` prop `inbox?: { count: number; onOpen: () => void }`, `className="hdr-icon hdr-bell"`, visible only when `flagOn('quietInbox')`, count from `inboxUnread(g)`; `GameScreen` `SheetKind` gains `'inbox'` and renders `InboxSheet`; `onOpenLink` is `parsePlaceKey` then `openPlace`. The inbox link format is Navigation's `placeKey`. | nav N7; notices T6 |
| D7 | `test/ui-contrast.test.ts` (created by R0-11) was to be extended by both Charts C7 and a11y A7 at the end of the file | A7 owns the file and extracts the parser and ratio helper into `test/contrast-kit.ts`. C7 puts the chart-token cases in its own `test/chart-contrast.test.ts` and imports the kit. A7 merges before C7. | a11y A7; charts C7 |
| D8 | "Needs you" badge was drawn inside `.menu-row-end`, which is `aria-hidden` (`MenuList.tsx:349`): screen-reader users would never hear it | The badge is rendered inside `.menu-row-text` (before the subtitle) with the visible pill and an accessible name; the `aria-hidden` end slot keeps only the lock, chevron and spark. | nav N2 |
| D9 | The 30-life identical-output probe (roadmap D.11 "Balance probes", R1 exit gate) and the per-tap cost clause of criterion 12 had no task; C3 only provides `stripR1`, T5 only lists allowed differences | New **R1-P9** (script and a small test). `stripR1` (C3) is extended to also undo Notices' differences (`flags.textMem` back to `flags.flavorRecent`, `weight` and `link` removed, `flags.inbox` removed). | platform P9; charts C3 |
| D10 | Wave 0 as drawn (P1 to P8, A1 to A3, T1, T2) is about 15 agent-hours, not 6 wall hours | P7 (seed slicing) and P8 (depth rubric) leave wave 0. Wave 0 = P1 to P6, A1 to A3, T1, T2. | platform schedule; this file section 4 |
| D11 | The roadmap says to merge Platform, Charts, Navigation, Notices, a11y. Charts' kit and Navigation's palette both depend on a11y wave 1 (`lazyView`, `ModalSurface`, roving, contrast kit) | Merge by wave and by dependency, not by track (section 4). | this file |
| D12 | Flavor-memory pool and family bookkeeping: P6 classifies `flavorRecent` as `cache`; Notices wanted `personal` | `cache` (P6). Both are dropped at the heir, so the choice is documentary. R1-T1 and R1-T5 no longer edit `world-flags.ts` (P6 pre-declares `lifeSeries`, `inbox`, `textMem`). | notices T1, T5 |
| D13 | `jumpLinks`, `Palette` and other Navigation code assumed any file may import `searchIndex.ts` | see D4 | nav N9 |
| D14 | Heir-survival test in P6 builds one game per key (about 220 games) | Batch: one parent with every personal and cache sentinel set, one handoff, per-key retry only if it throws. | platform P6 |

## 3. Collisions: every file two or more tasks touch

"Hunk" means an edit in its own place in the file, none overlapping another. Line numbers are v4.0.2 and were checked against the code. Order column: the merge order inside the file.

| File | Tasks and their hunks | Owner | Order |
|---|---|---|---|
| `src/game/types.ts` | R1-P2: type import; `NoticeModal` (503); `MenuBase` (755) and `MenuInfo` (788); `AnnualReportData` (542). Verify-only: N1, N3, C10, C14, T5 | P2 | P2 first; no one else edits |
| `src/game/core.ts` | P2: `NoticeOptions` (436) and the `notice()` spreads (444). T5: one import and the `weight` expression | P2 then T5 | P2, T5 |
| `src/game/flags.ts` | P3 creates with eight keys. Nobody edits | P3; lead flips | P3 |
| `src/game/world-flags.ts` | P6 creates with `lifeSeries`, `inbox`, `textMem` (personal) and `flavorRecent` (cache) | P6 | P6 before C3 and T1/T5 write those keys (the scan fails on an unclassified key) |
| `src/game/charts/spec.ts` | P2 creates (types, `CHART_LIMITS`); C1 appends `LadderRow`, three fields, `SPEC_LIMITS`, `readChartSpec` in three hunks | P2 then C1 | P2, C1 |
| `src/ui/store.ts` | A2: after line 115, `travelBack` (310), `commit` (350). C3: `finalizeIfDead` entry literal (366 to 388). T4: `dismissNotices` after `dismissNotice` (467 to 470). T6: `processQueue` (517 to 530) and an Inbox section at the end | none; all disjoint (checked: nearest hunks are about 15 lines apart) | any order; A2 first for the banner |
| `src/ui/components/ModalHost.tsx` | T4: imports (7 to 14, 18), the head of `ModalHost` (36 to 50), new `DigestCard`. C11: `MinigameCard` `className`. C12: `MinigameCard` strip and desk | none | T4, C11, C12 |
| `src/ui/components/MenuList.tsx` | A6: row loop (280 to 311) into two passes, `MenuRow` attributes. N2: badge in `MenuRow` text. C13: the `info` branch (299 to 309). C14: spark in `.menu-row-end`. N5: `useMenuNav`, `MenuRunnerOptions`, `MenuRunner` | none, but A6 restructures the loop C13 edits | **A6, N2, C13, C14, N5** |
| `src/ui/components/menuModel.ts` | N2: `nodeBadge`. C13: `infoChart` placed directly after `infoText`. N5: three path helpers | none | N2, C13, N5 (N2 and N5 append at the end in two hunks; C13 is mid-file) |
| `src/ui/components/Sheet.tsx` | A5: wrapper becomes `ModalSurface`. N5: `subheader` prop and one JSX line | none | A5, N5 |
| `src/ui/components/Dialogs.tsx` | A5 only (`PopupFrame`, `Toast`). T4/T6 only use them | A5 | |
| `src/ui/components/MenuSheet.tsx` | N2 (regroup, card), N5 (breadcrumbs), N9 (panel) | Navigation | N2, N5, N9 |
| `src/ui/components/Header.tsx`, `src/ui/components/BottomBar.tsx` | N7 (search, bell); A5 adds `data-focus-home` to `.bb-age`, N7 adds `aria-keyshortcuts` to the same buttons | Navigation | A5, N7 |
| `src/ui/screens/GameScreen.tsx` | N5 (`remember`), N7 (palette, shortcuts, inbox sheet) | Navigation | N5, N7 |
| `src/ui/styles/global.css` | A3 (end, after `.save-warning`), A5 (beside `.sheet`), A7 (token block after `--header-text`, header rules), A8 (`.lazy-*`), C7 (tokens after `--hint-*`, light and dark) | none | A7 before C7; the rest independent |
| `src/ui/minigames/AnnualReport.tsx` | C11 restructure, C12 forward `strip` | Charts | C11, C12 |
| `src/game/business/manage.ts` | C13: one import and one line after `nodes.push(economicReportMenu(a))` (2266, inside the Money section). N8: append `businessScreen` after `businessView`, `export` nothing else | none | any; N8 test now asserts the Books group lands in the Money tile |
| `src/game/business/yearly.ts` | C3: two hunks near `evolve(` (547) and `recordYear(` (552). C10: `reportData` | Charts | C3, C10 |
| `.github/workflows/ci.yml` | P1 rewrites; A9 adds one step to the `checks` job after `npx vite build` | P1 | P1, A9 |
| `package.json`, `package-lock.json` | lead: esbuild devDependency (before P4 merges), version bump, flag flip. A9: one `size` script line | lead | |
| `index.html` | A2 (splash inside `#root`), A7 (`theme-color` metas in the head) | none | independent |
| `src/App.tsx`, `src/ui/screens/SettingsScreen.tsx` | A5 and A8 (App); A5 (`ConfirmDialog`) and T5 (one section line) (Settings) | none | independent |
| `test/ui-contrast.test.ts` | A7 only. C7 uses its own file (D7) | A7 | after R0-11 |
| `src/game/save.ts`, `aging.ts`, `business/state.ts`, `economy.ts`, `competition.ts`, `competition-state.ts`, `milestones.ts`, `npc-lives.ts` | C3 only | Charts | |
| `src/game/investments.ts` | C14 (`stockTrail`, `offerNode`); R0-2 edited it earlier | Charts | after R0 |
| `test/voice-guards.test.ts` | P1: first-line marker only | P1 | |
| `test/store.test.ts`, `test/offline.test.ts` | T5 pins (Settings shape) | Notices | |
| `test/fuzz-kit.ts` | N8: one line (`hub.` groups add no depth) | Navigation | |

Import cycles (checked by building the v4.0.2 import graph with esbuild, outside the repo): 627 modules, components 85, 30, 19, 7, 6 (147). Findings:
- `business/state.ts`, `core.ts`, `economic-report.ts`, `dashboard.ts`, `menus.ts`, `aging.ts`, `save.ts`, `investments.ts`, `life.ts` are acyclic. `manage.ts`, `business.ts`, `yearly.ts`, `nation/menu.ts` are in the 30-module component; `economy.ts`, `competition.ts`, `career.ts` in the 85.
- `business/dashboard.ts` and `business/market-view.ts` reach the 85-module component; `menus.ts` reaches `manage.ts`. So **no `hubs/*` module may import `menus.ts`**, and no chart builder may import `market-view.ts` or `competition.ts` (both plans already avoid this). Importing `charts/index.ts` from `nation/menu.ts` (in a cycle) is safe because nothing the charts import reaches `nation/menu.ts` (checked).
- New modules `books-menu.ts`, `hubs/company.ts`, `life-series.ts`, `inbox.ts`, `text/*`, `save-hydrate.ts` import only acyclic leaves, so none joins a cycle.

## 4. Merge order

Not by track. By dependency, in waves; inside a wave the order of the list is the merge order, and tasks in one bracket may run at the same time (at most 3 test-running agents).

**Wave 0 (R2's base; about 12 agent-hours, about 7 hours wall).**
1. P1 alone. Then [P2, P3, A1], then [P4, T1, A3], then [P5, T2, A2], then P6. Lead actions between: esbuild devDependency before P4; branch-protection rename after P1.
2. Merge order: P1, P2, P3, P4, A1, T1, A3, T2, P5, A2, P6.

**Wave 1 (core; 8 to 14 hours).** [A4, A6, A8], [A5, A7, C2], [C1, C3 (after P6), N1], [N2 (after A6), N3, T3], then [P7, P8].
Merge order: A4, A6, A8, A5, A7, C1, C2, C3, N1, N2, N3, T3, P7, P8.

**Wave 2 (the visible core).** Charts builders [C4, C5, C6], then kit [C7 (after A7), C8, C9 (after A8)], then [C10, C11 (after A6)]. Navigation [N4, N5 (after A5), N6 (after A4, A8), N7 (after T6)]. Notices [T4, T5, T6, T7, T8].
Merge order: C4, C5, C6, C7, C8, C9, C10, C11, T4, T5, T6, T7, T8, N4, N5, N6, N7.

**Wave 3.** [C12, C13 (after A6, N2), C14, C15], [C16], [N8 (after C5), N9 (after C9, C15)], T9, A9, P9 (after C3).

**Last.** C17, N10, T10, A10, then the lead's release commit: version 4.1.0, the eight flag defaults, `docs/RELEASE-v4.1.0.md`, timings refresh, P9 run, bundle budget, screenshots.

Critical path: P1, P2, C1, C4 to C6, C7 to C9, C10, C11, C12/C13, C16, C17 (about 22 agent-hours serial). Second path: A4 to A6 to N2 to N5 to N6 to N7 to N9. The two a11y wave-1 tasks A6 and A8 gate both Charts and Navigation, so start them first in wave 1.

## 5. Cross-track contracts (one exact signature each)

Each contract has exactly one provider; every consumer was edited to use these names.

**Flags (R1-P3, `src/game/flags.ts`).**
```ts
export const FLAG_DEFS: {
  readonly chartKit: FlagDef; readonly annualReport2: FlagDef; readonly navRegroup: FlagDef; readonly navPalette: FlagDef
  readonly cockpits: FlagDef; readonly noticeDigest: FlagDef; readonly quietInbox: FlagDef; readonly idbSaves: FlagDef
}
export type FlagKey = keyof typeof FLAG_DEFS
export type FlagOverrides = Partial<Record<FlagKey, boolean>>
export const FLAGS: Readonly<Record<FlagKey, boolean>>      // live view; read at use, never in a module-level const
export function flagOn(key: FlagKey): boolean
export function setFlags(over: FlagOverrides): void; export function resetFlags(): void
export function withFlags<T>(over: FlagOverrides, fn: () => T): T
```
Consumers: `chartKit` (C13 to C15), `annualReport2` (C10, C12), `navRegroup` (N2, N5), `navPalette` (N5 to N7), `cockpits` (N8, N9), `noticeDigest` (T4), `quietInbox` (T5, T6, N7), `idbSaves` (A2).

**Types (R1-P2, `src/game/types.ts`, `src/game/core.ts`).**
```ts
interface NoticeModal { weight?: 'minor'; link?: string }
interface MenuBase { keywords?: readonly string[]; section?: string; badge?: (g: GameState) => string | number | null
                     conf?: 0 | 1 | 2 | 3; spark?: (g: GameState) => (number | null)[] | null }
interface MenuInfo { chart?: (g: GameState) => ChartSpec | null; conf?: 0 | 1 | 2 | 3 }
interface AnnualReportData { chart?: Json }
interface NoticeOptions { weight?: 'minor'; link?: string }
```
Consumers: N2 (`badge`, `section`), N3/N4 (`keywords`), C13/N8 (`chart`), C14 (`spark`), C10 (`chart`), T5 (`weight`, `link`).

**Chart spec (P2 types and `CHART_LIMITS`; C1 `readChartSpec`, `SPEC_LIMITS`, `LadderRow`; `src/game/charts/spec.ts`).**
`export function readChartSpec(json: unknown): ChartSpec | null`. Consumers: C10, C11, C13 (`infoChart`), N8 (`companyKpiSpec` must pass it).

**Chart UI for code outside `src/ui/charts/` (`src/ui/charts/lazy.tsx`, made with a11y's `lazyView`; C9, C11, C12).**
```ts
export const ChartViewLazy: LazyView<{ spec: ChartSpec; className?: string }>
export function LazyChartView(p: { spec: ChartSpec | null; fallback?: ReactNode }): ReactElement | null
export const LazySparkline: LazyView<SparklineProps>   // { values: readonly (number|null)[]; tone: ChartTone; label: string; fmt?: (n: number) => string; width?: number; height?: number }
export const LazyKpiTile: LazyView<KpiTileProps>       // { label: string; value: string; note?: string; delta?: { text: string; dir: 'up'|'down'|'flat'; good: boolean|null }; values?: readonly (number|null)[]; tone: ChartTone; onPress?: () => void }
export const LazyReportBook: LazyView<ReportBookProps>; export const LazyYearEndDesk: LazyView<YearEndDeskProps>
// a11y A8: interface LazyView<P> { (props: P & { fallback?: ReactNode }): ReactElement | null; preload(): Promise<boolean>; isReady(): boolean }
```
Consumers: C11, C13, C14, C15 (own track); **N9** via `src/ui/nav/kit.ts` (re-exports `LazyChartView`, `LazyKpiTile`, `LazySparkline`).

**Series (C3 `src/game/life-series.ts`, C15 `src/game/charts/networth.ts`).**
`lifeRows(g: GameState): { age: number; year: number; netWorth: number; cash: number; debt: number }[]` and `netWorthSpec(g: GameState): ChartSpec | null` (null under 2 points). Consumer: N9 `hubs/series-adapter.ts` (now a two-line re-export).

**Company numbers.** C5 `companyKpis(g, b, view): ChartSpec[]` feeds the Annual Report; N8 `companyKpiSpec(g, a): ChartSpec | null` feeds the cockpit. They read the same fields (`b.last.net`, `b.last.revenue`, live `b.cash`, `b.valuation`); N8 test 4b asserts equality with `companyKpis`.

**Menu chart rows (C13).** `chartInfo(id, emoji, text, chart): MenuInfo[]` (empty unless `chartKit`). Nav's N8 KPI row is a hand-built `MenuInfo` with `chart`, gated by `cockpits`; `MenuRows` renders any `info` node with a valid `chart` regardless of flag.

**Modal and focus (a11y A4, A6, A8).** `ModalSurface({ role, label?, className?, children })`, `isModalOpen(): boolean`, `rovingMove(count, index, key): number | null`, `rovingStop(ids, activeId): string | null`, `lazyView(name, load)`. Consumers: C11 (`rovingMove`), N6 (`ModalSurface`, `lazyView`), N7 (`isModalOpen`), T4/T6 (through `PopupFrame`/`Sheet`).

**Contrast (A7).** `test/contrast-kit.ts`: `readThemeTokens(css: string): { light: Record<string, string>; dark: Record<string, string> }` and `contrastRatio(fg: string, bg: string): number` (A7 uses the names R0-11 already has if it exports them; the point is one shared module). Consumers: `test/ui-contrast.test.ts` (A7), `test/chart-contrast.test.ts` (C7).

**Inbox and bell (T5, T6, N7).**
`inboxUnread(g: GameState | null | undefined): number`, `readInbox(g): InboxState` (T5, `src/game/inbox.ts`); `InboxSheet(props: { onClose: () => void; onOpenLink?: (link: string) => void })` (T6); `Header` prop `inbox?: { count: number; onOpen: () => void }` (N7); link string = `placeKey(ref)` from `src/ui/nav/place.ts` (N4), restricted to T5's regex `^[a-z]+(?:/[A-Za-z0-9._:-]{1,40}){0,6}$`; reader = `parsePlaceKey`.

**Settings (T5).** `Settings.quietMode: boolean` (default true), `quietModeOn(s): boolean`. Distinct from the build flag `quietInbox`.

**Places and reopen (N4, N7).** `PlaceRef`, `placeKey`, `parsePlaceKey` (`src/ui/nav/place.ts`); `placeToReopen(g, p): ResolvedReturn` (`src/ui/nav/reopen.ts`). Consumers: N5 (recents), N6, N7, N9 (`jumpLinks`), T6 (links).

**Parity (C3 and P9).** `stripR1(json: unknown): unknown` in `test/r1-strip.ts`: removes the 14 `YearRecord` keys, `MarketHistory.top`, `spark`, `flags.lifeSeries`, `flags.inbox`, the `chart` key of `annualReport` modal data, `weight` and `link` of queued notices; rebuilds `flags.flavorRecent` from `flags.textMem.r.flavor` and removes `flags.textMem` when only that ring is in it; truncates each company `history` to its last 10 rows. Consumer: P9 `compare`.

**World flags (P6).** `lifeSeries`, `inbox`, `textMem`: `personal`; `flavorRecent`: `cache`. Consumers C3, T1, T5, N7 (reads `inbox`) write no other new `g.flags` key.

**Ratchets every track must respect (P4, P5, P6).** No new module in an import cycle; no `earnIncome(`, `spend(`, `addMoney(`, `.cash +=`, `.money +=` in a new file; no year+1 in a watched call; every new `g.flags.<key>` classified; no new `flags[expr]` or whole-object `flags` use.

## 6. Coverage

### 6.1 D.11 acceptance criteria

| # | Criterion | Proven by | Status |
|---|---|---|---|
| 1 | Waterfall sums to net for 168 statements; Rounding under $5 in 99% | C4 test 1 | covered |
| 2 | Chart components render with role, title, description, readout, table toggle, at most 150 nodes; geometry no NaN; `scrubReducer` | C2 (geometry, scrub), C7, C8, C9 (components); N9 test 9 (panel) | covered; role is a labelled group plus `slider` on the plot, not `role="img"` on the figure (accepted, section 10 item 9) |
| 3 | Chart tokens 3:1, R0-11 text pairs 4.5:1, both themes | C7 (`test/chart-contrast.test.ts`), A7 (`test/ui-contrast.test.ts`: header and focus pairs) | covered |
| 4 | Hostile `data.chart`, `lifeSeries`, `textMem`, `inbox` render, load, stay bounded | C1 (spec), C10 and C11 (`data.chart`), C3 (`lifeSeries`, graveyard `spark`), T1 (`textMem`), T5 and T10 (`inbox`, `weight`, `link`), N5 (`anotherlife.ui.v1`), N8 and N9 (hostile company data) | covered |
| 5 | Series tests, v4.0.2 fixture, 30-company budget | C3 (`series-books`, `series-market`, `series-life`, `series-budget`) | covered |
| 6 | Tree snapshot; lint; index writes nothing and calls no `g.rng` | N1 (set and DFS sequence, lint), N2, N4 (purity), N8 (DFS parity), N10 | **partly**: the lint is a ratchet with a baseline, not zero (6.3 item 1) |
| 7 | "stock" found and opened in at most 4 taps; pins 12 and recents 8 round-trip and never enter `GameState` | N4 test 20, N5 tests 1 to 8, N6 test 8, N7 | covered |
| 8 | Digest leaves `g.queue` unchanged; never-route table; Quiet Mode toggles | T4, T5 (`NEVER_ROUTE_TABLE`), T6, T10 | covered |
| 9 | `pickLine` same RNG state as `pick`; bags; caps; `hpick` draws nothing | T1 tests 1 to 10 | covered |
| 10 | Shards cover all test files; wall at most 12 min; cycle, money and foresight ratchets fail on synthetic violations | P1 and P7 (coverage), P4, P5; wall time measured by the lead on the first green run | covered; wall time is a measurement, not a test |
| 11 | IndexedDB: v4.0.2 localStorage save loads, migrates, round-trips; hung DB falls back in 3,000 ms; save tests green | A1 cases 3, 5, 17; A2 | covered |
| 12 | Per-tap cost within 5%; bundle at most +60 KB gzipped | A9 (bundle), N10 test 6 (no grandchild `children()` calls), **P9 `cost`** (clone plus stringify of 30 final states) | covered after the fix; expect 3 to 5% growth, which sits at the limit (6.3 item 3) |
| 13 | v4.0.2 saves load unchanged; sharded CI green | fixture loads in C3, C10 case 7, N10 test 9, T5, T10, A1, P2 test 5; CI green is the lead's | covered |
| Probe | 30 lives, 40 years, identical JSON except new optional keys | **P9 `play` and `compare`**, `stripR1` (C3) | covered after the fix |
| Exit | Owner opens the Annual Report on a phone-width window | C16 screenshots (Playwright), C17 | covered |

### 6.2 User-visible changes (release notes)

| Change | Tasks |
|---|---|
| Profit and Loss waterfall, bridge | C4, C8, C10, C11 |
| History and cash charts for every company | C3 (series), C5, C8, C11, C13 (Books group) |
| Rank ladders | C3 (S2), C6, C9, C14 |
| A cockpit per company | N8 (tiles, KPI row), C13 (Books and Charts group inside the Money tile) |
| Wealth cockpit and tab cockpits | N9 |
| A net-worth line | C3 (S3), C15; N9 (wealth cockpit) |
| Search with pins and recents | N4, N5, N6, N7 |
| Breadcrumbs | N5 |
| "Needs you" badges | N2 |
| One OK for a run of notices | T4 |
| A quiet inbox | T5, T6, T7, N7 (bell and sheet) |
| A Year-End Desk | C12 (dormant in v4.0.2 play: only one report queues a year; ready and tested with synthetic queues; label "Keep every plan") |
| Keyboard and screen-reader fixes | A4 to A7 |
| Saves in IndexedDB | A1, A2, A3 (behind `idbSaves`) |
| LifeLog shows the last 3 years open | T8 |
| **"Repeated lines in the life log start to thin"** | **not delivered** (6.3 item 2) |

### 6.3 Not covered as the roadmap states it (lead decisions)

1. **D.11.6 lint to zero** (no group over 12 rows without headings, 28 today; no one-row group, 146 today). Navigation ships a baselined ratchet (fails on a new violation; zero on the roots and new hubs) because the offenders sit in 100+ files owned by other releases. Recommend the lead accepts "no new violations, roots and hubs at zero" for R1 and edits D.11.6 and the release notes.
2. **"Repeated lines ... start to thin"**. R1-T2 moves `flavor.ts` onto `textMem` as a ring with the same 60-key window and proves the draw count and the lines are identical (golden). That is the right call for "no simulation output changes", but it means nothing thins in R1; `pickLine` has no production caller until E.T3 (R2). Remove the phrase from `docs/RELEASE-v4.1.0.md`.
3. **Per-tap cost within 5%.** `act()` clones and saves the whole state on every tap, so cost tracks state size, and the roadmap's own growth figure is 3 to 5% (14,000 nodes). The kit being lazy does not help that. P9 `cost` measures it; if the mean ratio lands at 1.05 to 1.08 the lead either accepts it (R2's diet follows) or trims S1 (30 rows by 23 numbers is the biggest term at 620 nodes a company).

## 7. Feasibility

### 7.1 Size (nothing over 1,500 source lines)

Largest tasks: C11 about 950 source (book, model, css, three hunks), C7 800, C14 700 (six files, each a small hunk), C2 690, N9 680, C8 650, N6 620, T1 440. Breadth, not size, is the risk in **C3** (twelve existing files, four test files, 900 test lines; it is the task to give to the most careful session, and it blocks C5, C6, C15). If it overruns, split along the seam already in the plan: C3a = S1 (state, economy, yearly, npc-lives, milestones, series-books, `r1-strip`) and C3b = S2 and S3 (competition*, life-series, aging, save, store, series-market, series-life, series-budget). Not split in the plan because each half is under 250 source lines.

### 7.2 Tests that may exceed 2 minutes on one worker

| Test | Why | Fix applied |
|---|---|---|
| P5 `foresight-scan.test.ts` spy part | 8 lives through `renderAll(..., 4)` on frozen copies | explicit timeout, depth 3 for the 6 no-talent lives, depth 4 only for the 2 talent lives, split into two `it`s |
| P6 `world-flags.test.ts` tests 5 and 6 | one game per key, about 220 | batched (D14) |
| N1, N4, N8, N9, N10 (many tests walk or index the 4 canned states, 11,822 nodes on the CEO state) | repeated full walks | `test/nav-kit.ts` memoises `walkTree` and `buildIndex` per (state, options) inside one file |
| C4 `chart-pl.test.ts` | 3 seeds by 56 companies and two yearly passes | planned at under 90 s; the 168 statements come from one game per seed, so three passes |
| T9 `text-kit.test.ts` | 4 lives to age 90 plus a replay | planned at about 30 s |
| A1 `save-hydrate.test.ts` | 17 cases with fake timers | one shared game built in `beforeAll` |
| P7 five sliced files | 5 to 8 minutes unsliced locally | verified in sliced form (`SLICE=i/n`), CI runs the merge |

Every new test file defaults to 5 s in `scripts/test-timings.json` until the lead refreshes it (lead action 3), so the first sharded runs of wave 2 and 3 can be unbalanced.

### 7.3 Simulation output and `g.rng` audit

| Change | Draw? | Output? | Evidence |
|---|---|---|---|
| T1 `pickLine` | one `rand(g)` | none: no production caller | new test: a scan finds no use of `pickLine(`, `hpick(`, `defineLines(` outside `src/game/text/` |
| T2 flavor onto `textMem.r.flavor` | none added | none | golden recorded from the unmodified file (4 lives by 85 ages) |
| T5 `weight` on 20 titles, `link` | none | optional key on queued notices | `stripR1` |
| T6 routing | none | store flow only; headless `ageUp` never routes | T6 test 9 |
| C3 history 30 rows, idempotent `recordYear` | none | none: re-audited every reader of `b.history` (v4.0.2): tails only (`valuationOf` and `economy.ts:1341` use `slice(-3)`; `yearly.ts:390` `slice(-2)`; `board*.ts`, `dashboard.ts`, `franchise.ts`, `competition.ts:497` index from the end or compare length with 1 or 2; `deeptech-state.ts:698` compares `length < 3`; `group-services.ts:99` finds by year); `milestones.ts:54` and `:109` are pinned to `simHistory` | C3 test 8 and P9 `compare` |
| C3 `writeLifeRow` | none | `flags.lifeSeries` only | `netWorth(g)` is pure (`core.ts:368`) |
| C14 `stockTrail` | none | none | calls `exchangeYear` for years up to `g.year` only; no `+` in a year argument |
| N1 to N10, A4 to A10, P1 to P8 | none | none | UI, tests, CI |

Found but out of scope: `rivalLookup` (`competition.ts` 330 to 343) reads `rawPull(d, ros, year + 2)` for `RivalView.trend`, a foresight read the X.G1 scan does not watch (it lists four functions). Charts already avoid it; carry it to R3 H.13.

## 8. Lead actions (consolidated, in order)

1. Before P4 merges: `npm install --save-dev esbuild@^0.28.2 --package-lock-only`, then `npm ci --dry-run` (the lockfile root must carry the entry).
2. After P1 merges: GitHub branch protection requires `CI gate` instead of `test`. Keep the workflow name `CI`.
3. After the first green sharded run, and again after wave 3: `gh run download`, `node scripts/ci-shard.mjs --update ...`, commit `scripts/test-timings.json`.
4. Previews: add `CLOUDFLARE_API_TOKEN` or switch on Workers Builds branch builds.
5. Run order is in section 4; the lead merges, tracks do not merge to `main` (run prompt: stop at a green PR).
6. Before the release PR is marked ready: run P9 on the R0 head and on the R1 head, with `--flags none` and `--flags all`; run `node scripts/bundle-budget.mjs`; run `scripts/r1-screenshots.mjs` (needs Playwright and Chromium installed by the lead); confirm the four sweeps (C17, N10, T10, A10) are green.
7. The release commit (one commit): `package.json` to 4.1.0, flip all eight `FLAG_DEFS` defaults to true, `docs/RELEASE-v4.1.0.md` (use the bullets in section 6.2 and the per-track lines; drop the "thin" sentence), roll the rollback caveat for IndexedDB into the notes.
8. `CLAUDE.md` is not in the repository though the roadmap and run prompt cite it: every task text restates the rules (test first, explicit pathspecs, voice, no dashes, commit trailer).

## 9. Edits applied to the track files

- **platform.md:** flag set (D2); P2 absorbs `link`, `spark`, `AnnualReportData.chart`; P3 test for "no test mocks flags"; P5 spy timing; P6 batching and the pre-declared keys; P7, P8 leave wave 0; P1 notes the A9 step; new **R1-P9**; lead actions 3, 5, 6.
- **charts.md:** flag list; types ownership; contrast file (D7); `stripR1` scope; C13 merge order and `menuModel` position; consumers of `lifeRows` and `netWorthSpec`; plan-vs-code 19 resolved; C17 asks for P9.
- **nav.md:** flags and types are Platform's; N1 and N10 no longer edit `flags.ts` or flip; N2 badge accessibility and merge order; N3 `readonly`; N6 `ModalSurface`, `LazyPalette`, no `PaletteHost`; N7 owns the bell and inbox sheet (and exempts the inbox from clearing the "Back to" chip, a one-line change in `ReturnChip.tsx`), `isModalOpen`; N8 equality test and Money-tile test; N9 lazy kit, static `CockpitBody`, `placeToReopen`; memoised walks; task table.
- **notices.md:** ids R1-T; flags are Platform's (no creation, no flip, no module mocks); T1 and T5 do not edit `world-flags.ts`; T5 does not edit `types.ts` and edits `core.ts` in one expression; T6 bell contract handed to N7; T10 is a sweep; scan test in T1.
- **a11y.md:** A2 does not edit `flags.ts`; A7 owns `ui-contrast` and creates `contrast-kit.ts`; A8 palette zone list and `src/ui/nav/lazy.tsx`; A9 step goes into the `checks` job; contracts list.

## 10. Plan vs code (cross-check findings; roadmap and plan claims corrected)

1. **`.menu-row-end` is `aria-hidden`** (`MenuList.tsx:349`). Navigation planned the "Needs you" pill there; it would be invisible to assistive technology. Moved (D8).
2. **`types.ts` keeps `MenuInfo` separate from `MenuBase`** (`types.ts:788`), so `badge`, `keywords`, `section`, `spark` apply to actions and groups only and `chart`, `conf` to info rows. `AnnualReportData` (`types.ts:542`) has no `chart` today.
3. **`dashboard.ts` and `market-view.ts` reach the 85-module cycle component and `menus.ts` reaches `manage.ts`** (import graph rebuilt: 627 modules). Rule for the plans: hubs never import `menus.ts`; chart builders never import `market-view.ts` or `competition.ts`. `nation/menu.ts` is inside the 30-module component, so C14 may import only from `charts/index.ts` and must keep that barrel acyclic (it is).
4. **`economicReportMenu` is pushed right after the `biz.moneyH` heading** (`manage.ts:2265` to `2266`), so Charts' Books group lands in Navigation's Money tile; the group contains only `info` nodes, so it adds no action to the DFS sequence N8 pins.
5. **`runway` in `dashboard.ts:62` is private and returns a number** (infinite allowed), as Navigation says; N8 exports it.
6. **`doAnythingAction` is exported from `menus.ts:85`**; the palette's `Do Anything: {query}` row can reuse it.
7. **`handleModal` only removes the notice** (empty handler), so `dismissNotices` filtering several ids in one `act()` is equivalent (`store.ts:411` to `store.ts:442`).
8. **`ageUp` has three exits** (`aging.ts:97`, `:122`, `:125`) before the `yearEvents` call at `:128`; C3's three `writeLifeRow` calls match.
9. **Charts' `Frame` is `role="group"` and the plot a `slider`**, not `role="img"` on the figure (the roadmap D.2 wording): children of an image role are presentational, so the table toggle would be unreachable. D.11.2 asks for "role, title, description, readout, table toggle", which this meets. Accepted.
10. **`scripts/save-size.ts` and `test/probe-life.ts` already give the bundle-and-run pattern** for a long seeded life; P9 reuses `probeLife` and adds birth-to-40 lives (the founder lives skip childhood, where flavor and the early-life events run).
11. **The R1 parity baseline is the R0 head, not v4.0.2**: R0 changes balance (R0-3 removes minted income), so "before and after R1" means `release/v4.0.3` against `release/v4.1.0`.
12. **`CLAUDE.md` is absent** (also noted by platform.md); `docs/VOICE.md` exists and is the voice source.
13. **Task and flag naming** collided (D1, D2); resolved.
14. **Roadmap wave 0 cannot finish in 6 hours** with 3 test-running agents (D10).
15. **`openingClearsReturn(sheet)` is `sheet !== 'profile'`** (`ReturnChip.tsx:49`), so a new `'inbox'` sheet kind would silently clear the "Back to" chip; N7 exempts it like the profile.
16. **Test counts:** 389 `*.test.ts` files exist today (confirmed); the plans add about 76 more, so P1's coverage test correctly uses a floor.
