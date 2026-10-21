# R1 track plan: Charts and Profit and Loss

Track "charts" of Release R1 (v4.1.0, "See it"). Base: `release/v4.0.3` (R0 merged), code read at v4.0.2. Roadmap items covered: G.1, G.2, G.3, G.4, G.6, G.7 (D.2, D.3, D.4, D.5, D.11 criteria 1 to 5, 12, 13 for this track). G.5 (company and wealth cockpits) is not in this brief; the track provides everything it needs (see "Contracts we provide").

All line numbers below are v4.0.2 and are hints only: R0 edits shift them (R0-3 removes lines in `yearly.ts`). Implementers match on the quoted code, not the number.

## 1. Track summary

**What the player gets.** The Annual Report becomes a five-tab book (Summary, P&L, Cash, Market, Plan) with a Profit and Loss waterfall, a "why profit changed" bridge, 30-year profit and cost-structure history, a cash walk, a market share and rival ladder, KPI tiles with sparklines, and (when two or more reports queue) a Year-End Desk. The same charts open from a new "Books and Charts" group on every company screen, from the market Leaderboard and History, from benchmark, career-standing and nation screens, from stock lists (sparklines), and from the Profile, Death and Graveyard screens (net-worth line).

**Tasks.** 17 tasks, `R1-C1` to `R1-C17`, in 6 waves of dependency (section 3).

**Line budget (honest count).** About 8,200 source lines and about 8,600 test lines (the roadmap plans 6,100 source lines for these items).

| Roadmap item | Roadmap lines | This plan | Why different |
|---|---|---|---|
| G.1 spec and builders | 600 | 1,640 (C1, C4, C5, C6) | The roadmap counted the spec only; the four pure builders (pl, books, market, ranks) are 1,350 on their own |
| G.2 kit | 2,300 | 2,740 (C2, C7, C8, C9) | Adds `format.ts`, `table.ts`, `lazy.tsx` (the a11y lazy gate) and the `ChartView` dispatcher |
| G.3 series | 700 | 380 (C3) | Smaller than planned (the readers are short) |
| G.4 Annual Report 2.0 | 1,300 | 1,630 (C10, C11, C12) | The assembler, the lazy shell and the desk strip |
| G.6 ladders and sparklines | 600 | 700 (C14) | Six domain files get a hunk each |
| G.7 net-worth line | 600 | 440 (C15) | |
| Not in the roadmap | 0 | 710 (C13 chart rows in menus and the Books group 330, C16 harness 380) | Menu plumbing, a P&L for hired-CEO companies, and the screenshot harness |
| Total | 6,100 | 8,240 | |

If the lead must cut, the Books group (the second half of C13, about 180 lines) is the part to defer; the first half of C13 (chart rows in menus, about 150 lines) stays because C14 needs it. Navigation's cockpits (G.5) can use `ChartView`, `KpiTile` and `Sparkline` without any of the cut candidates.

**State growth.** S1 +620 nodes a company (24 nodes a row, 30 rows, against 100 today), S2 +340 a company market with the flat encoding in C3 (see Plan vs code 9), S3 about 1,084 a life. At 12 companies: 7,440 + 4,080 + 1,084 = 12,604. At 30 companies: 18,600 + 10,200 + 1,084 = 29,884 (6.0% of the 500,000 cap). Transient: a queued Annual Report carries `data.chart`, about 1,300 nodes while it waits. Time Machine snapshots hold the whole state, so each grows by the same few percent as the main save.

**Hot files this track edits (each edit additive, in its own hunk).** `charts/spec.ts` (Platform's), `business/state.ts`, `business/economy.ts`, `business/yearly.ts` (3 small hunks), `business/competition.ts`, `business/competition-state.ts`, `business/milestones.ts`, `npc-lives.ts`, `aging.ts`, `save.ts`, `ui/store.ts`, `ui/minigames/AnnualReport.tsx`, `ui/minigames/types.ts`, `ui/components/ModalHost.tsx`, `ui/components/MenuList.tsx`, `ui/components/menuModel.ts`, `ui/styles/global.css`, `ui/styles/business.css`, `business/manage.ts` (one line), `business/market-menu.ts`, `business/deeptech-menu.ts`, `business/devices-menu.ts`, `special/kit/menu.ts`, `nation/menu.ts`, `investments.ts`, `ui/components/ProfileSheet.tsx`, `ui/screens/DeathScreen.tsx`, `ui/screens/GraveyardScreen.tsx`. Cross-check: this track no longer edits `types.ts` (R1-P2 owns every new optional field) or `test/ui-contrast.test.ts` (R1-A7 owns it; the chart-token cases live in `test/chart-contrast.test.ts`).

**New files outside the two chart directories.** `src/game/life-series.ts`, `src/game/business/books-menu.ts`, `src/ui/components/LifeLine.tsx`, `src/ui/minigames/{bookModel.ts,yearEnd.ts}`, `scripts/r1-screenshots.mjs`, `scripts/r1-screenshot-state.ts`. **New directories:** `src/game/charts/` (pure builders: spec (Platform's), reveal, money, pl, books, market, ranks, networth, report, index), `src/ui/charts/` (the kit, inside a11y's lazy zone: geometry, useScrub, format, table, Frame, Sparkline, KpiTile, Meter, BulletRow, LineChart, BarChart, Waterfall, RankLadder, Timeline, ChartView, ReportBook, YearEndDesk, lazy.tsx, index, charts.css).

**Flags (Platform's `FLAGS`, keys pre-declared by R1-P3).** `annualReport2` (the Annual Report book: `data.chart`, the Year-End Desk and strip) and `chartKit` (chart rows in menus, ladders, stock sparklines, the Books group, the net-worth line). Both default `false` until the lead's release commit flips them with the version bump; this track never edits `flags.ts`. The series writers (S1, S2, S3) and the kit components are never flagged: history must accumulate for every life that plays R1, and the kit is inert until a builder hands it a spec.

**D.11 acceptance criteria and where each is proven.**

| Criterion | Proven by |
|---|---|
| 1 waterfall sums to net for 168 statements, Rounding under $5 in 99% | R1-C4 `test/chart-pl.test.ts` |
| 2 every component renders with role, title, description, readout, table toggle, at most 150 SVG nodes; geometry has no NaN; `scrubReducer` | R1-C2 (geometry, scrub), R1-C7, C8, C9 (components) |
| 3 chart tokens at least 3:1, R0-11 text pairs at least 4.5:1 | R1-C7 (`test/chart-contrast.test.ts`, importing a11y's `test/contrast-kit.ts`); a11y R1-A7 (`test/ui-contrast.test.ts`, header and focus pairs) |
| 4 hostile `data.chart` and hostile `lifeSeries` render, load and stay bounded | R1-C1 (spec), R1-C3 (lifeSeries, rows), R1-C10 and C11 (`data.chart`) |
| 5 series tests of D.3, v4.0.2 fixture, 30-company budget | R1-C3 |
| 12 bundle at most +60 KB gzipped, per-tap cost | R1-C17 measures the kit chunks (a11y's `scripts/bundle-budget.mjs` when it exists) |
| 13 v4.0.2 saves load unchanged | R1-C3 (fixture), R1-C11 (old report data) |
| "R1 changes no simulation output" (probe) | R1-C3 provides `test/r1-strip.ts`; the lead's 30-life probe uses it |
| Exit gate: owner opens the Annual Report on a phone-width window | R1-C16 screenshots |

## 2. Contracts

This plan was reconciled with the sibling plans in the same folder (`platform.md`, `nav.md`, `a11y.md`, `notices.md`). Where they define a name this track uses, their name wins and is quoted below.

### 2.1 Contracts we rely on

1. **Platform R1-P3 (K.11), `src/game/flags.ts`.** `FLAGS` is a readonly live view over eight pre-declared keys (cross-check list: `chartKit`, `annualReport2`, `navRegroup`, `navPalette`, `cockpits`, `noticeDigest`, `quietInbox`, `idbSaves`; Navigation, Notices and a11y own the other six); `flagOn(key)`, `withFlags(overrides, fn)`, `setFlags`, `resetFlags` are exported. This track uses two of the keys: **`annualReport2`** (the Annual Report book, its `data.chart`, the Year-End Desk and the company strip) and **`chartKit`** (chart rows in menus, ladders, stock sparklines, the Books group, the net-worth line). Read a flag at use, never in a module-level constant (Platform's source guard fails on `const X = FLAGS.`). All defaults are `false`; **the lead flips the defaults in the release commit** together with the version bump, so this track never edits `flags.ts`, and **every test sets the flags it needs with `withFlags`** (a test that relied on a default would break at the flip). In node the live flags equal the defaults.
2. **Platform R1-P2 (Wave 0), `src/game/charts/spec.ts` and `types.ts`.** R1-P2 creates `spec.ts` with `ChartTone`, `ChartKind`, `ChartUnit`, `ChartSeries`, `ChartStep`, `ChartMark`, `ChartSpec` and `CHART_LIMITS = { title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 }` (no imports; its test pins `CHART_LIMITS`), and adds `MenuInfo.chart?` (type-only import of `ChartSpec`). R1-C1 appends to that file in separate hunks (`LadderRow`, three optional `ChartSpec` fields, `SPEC_LIMITS`, `readChartSpec`) and never changes `CHART_LIMITS`. Cross-check: R1-P2 also adds `MenuBase.spark?` and `AnnualReportData.chart?` (section 2.3 keeps the two lines for reference only). R1-C10 and R1-C14 verify the lines exist and do not edit `types.ts`; they stop and tell the lead if R1-P2 is missing.
3. **Platform R1-P6 (A.K0), `world-flags.ts`.** `lifeSeries` is pre-declared `personal`; R1-C3 edits nothing there.
4. **Platform R1-P4 (K.1), `test/architecture.test.ts`.** A new module must not join an import cycle. Platform's note says chart builders should import only types from `business/*`. We probed the v4.0.2 graph with an esbuild metafile, the same method as K.1: 623 modules, cycle components 85, 30, 19, 7, 6 (147 modules), matching the roadmap. Result: the leaf modules the builders need (`business/state.ts`, `franchise-state.ts`, `lab-state.ts`, `lab-text.ts`, `economic-report.ts`, `dividend-policy.ts`, `industries.ts`, `util.ts`, `competition-state.ts`, `core.ts`, `history/timeline.ts`) are all acyclic, so value imports from them cannot create a cycle. To keep the strongest form of Platform's rule where it is cheap, the market builders take the `MarketView` as an argument (the caller already imports `marketViewOf`), so `src/game/charts/` has no runtime import of `business/competition.ts` (a member of the 85-module component) at all; it imports `type MarketView` only. We also checked the other direction: none of the modules that will import a charts file or `life-series.ts` (`yearly.ts`, `market-menu.ts`, `deeptech-menu.ts`, `devices-menu.ts`, `special/kit/menu.ts`, `nation/menu.ts`, `investments.ts`, `manage.ts`, `MenuList.tsx`, `menuModel.ts`, `AnnualReport.tsx`, `ProfileSheet.tsx`, `DeathScreen.tsx`, `GraveyardScreen.tsx`, `ModalHost.tsx`, `aging.ts`, `save.ts`, `store.ts`) is reachable from anything a charts file imports. `business/economy.ts`, `business/competition.ts` and `business/state.ts` are reachable, so they never import `charts/` (this plan only changes their bodies). `test/chart-hygiene.test.ts` (R1-C1) enforces these rules.
5. **Platform R1-P5 (X.G1), money ratchet and foresight scan.** Nothing in this track calls `earnIncome`, `spend` or `addMoney`, or touches `b.cash +=` / `p.money +=`; `chart-hygiene` greps for it. No call passes `year + 1`.
6. **Platform R1-P1 (K.7a).** All test files are `test/*.test.ts`; each stays under 2 minutes with one worker. A guard test may carry the first-line marker `// ci: fast` (R1-C1's `test/chart-hygiene.test.ts` does).
7. **R0-11 and a11y R1-A7.** `test/ui-contrast.test.ts` (R0-11) holds the CSS token parser and a contrast ratio helper; R1-A7 owns that file, adds the header and focus-ring cases, and (cross-check) moves the parser and ratio helper into `test/contrast-kit.ts` (`readThemeTokens(css)`, `contrastRatio(fg, bg)`). R1-C7 writes the chart-token cases in its own `test/chart-contrast.test.ts` and imports the kit (reuse, do not fork). R1-A7 merges before R1-C7. The tokens `--target` (44px) and `--focus-ring` come from R1-A7; `charts.css` uses `var(--target, 44px)` and `var(--focus-ring, currentColor)` so it works before and after.
8. **a11y R1-A8, the `lazyView` seam and the zone rule.** `src/ui/lazy/lazyView.tsx` exports `lazyView(name, load)`: a component with `preload()` and `isReady()`, which renders `props.fallback` (the old text rows) until the dynamically imported module is ready, and a retry/reload message after a failed load. **Zone rule (enforced by `test/lazy-zones.test.ts`): no file outside `src/ui/charts/` may import anything under `src/ui/charts/` at runtime except `src/ui/charts/lazy.tsx`, and `lazy.tsx` imports nothing under `src/ui/charts/` statically.** So this track creates `src/ui/charts/lazy.tsx` (R1-C9) exporting `LazyChartView`, `LazySparkline`, `LazyKpiTile`, `LazyReportBook`, `LazyYearEndDesk`, and every consumer (`AnnualReport.tsx`, `ModalHost.tsx`, `MenuList.tsx`, `GraveyardScreen.tsx`, `components/LifeLine.tsx`) imports only from `../charts/lazy`. Components that need chart code (the report book, the desk) therefore live inside `src/ui/charts/`. Tests render the real component after `await View.preload()` (a11y's pattern) or import the component module directly.
9. **a11y R1-A6, `src/ui/a11y/roving.ts`.** `rovingMove(count, index, key)` and `rovingStop(ids, activeId)`; the report's tab row uses them (horizontal arrows are mapped to the vertical ones). R1-C11 depends on R1-A6.
10. **Navigation (nav.md) expectations of this track** (met by section 2.2): C-SPEC `readChartSpec`; C-KPI a `kpi` spec renders one tile per series; C-VIEW `src/ui/charts/ChartView.tsx` with `ChartView({ spec })` (named and default export); C-TILE `KpiTile` props `{ label, value, note?, delta?: { text, dir: 'up' | 'down' | 'flat', good: boolean | null }, values?, tone, onPress? }` and `Sparkline` props `{ values, tone, label }`; C-SERIES pure `lifeRows(g)` and `netWorthSpec(g)` (null under 2 rows). Two mismatches were found and are resolved by the cross-check (Plan vs code 19): Navigation's `src/ui/nav/kit.ts` now re-exports `LazyChartView`, `LazyKpiTile`, `LazySparkline` from `../charts/lazy` (not the components), and Navigation uses Platform's readonly `FLAGS` with the keys `navRegroup`, `navPalette`, `cockpits`.
11. **Navigation and a11y hot-file overlaps.** `MenuList.tsx`: Navigation N2 (a badge pill in `MenuRow`'s text block; cross-check moved it out of the `aria-hidden` end slot), a11y A6 (roving attributes in `MenuRows` and `MenuRow`), this track (an `info` branch in `MenuRows`, R1-C13; a spark in `.menu-row-end`, R1-C14). All four are disjoint hunks; cross-check merge order **A6, N2, C13, C14, N5**. `menuModel.ts`: R1-C13 puts `infoChart` directly after `infoText`; Navigation appends its helpers at the end of the file. `ModalHost.tsx`: G.11 (R1-T4) edits imports and the head of the body; this track edits `MinigameCard` (notices.md C6 agrees); order T4, C11, C12. The tree-snapshot test (D.11.6) compares reachable action id paths; this track adds info rows (ids containing `.chart`) and one menu group `biz.books.<assetId>` only when `chartKit` is on, so regenerate the snapshot after R1-C13 and R1-C14.
12. **R0-3** removes the minted "perfect foresight" income; old statements may still carry `strategicIncome`, which is inside `otherIncome`. The waterfall never shows it as its own row.

### 2.2 Contracts we provide

1. **`ChartView`** (`src/ui/charts/ChartView.tsx`, named and default export): `ChartView({ spec })` picks the plot by `spec.kind`, wraps it in `Frame`, and for `kind: 'kpi'` renders one `KpiTile` per series. **`src/ui/charts/lazy.tsx`**: `LazyChartView` (props `{ spec: ChartSpec | null; fallback?: ReactNode }`), `LazySparkline`, `LazyKpiTile`, `LazyReportBook`, `LazyYearEndDesk`, all made with `lazyView`.
2. **`KpiTile`** and **`Sparkline`** with the C-TILE props above; `Meter`, `BulletRow` for the cockpits; builders `companyKpis(g, b, view)` and `companyStrip(g)` (R1-C5).
3. **`lifeRows(g)`** and **`readLifeSeries(g)`** (`src/game/life-series.ts`, R1-C3) and **`netWorthSpec(g)`** (`src/game/charts/networth.ts`, R1-C15): Navigation's wealth cockpit (R1-N9, through its `hubs/series-adapter.ts`) and, later, R4's CV lanes and the person profile read the same series. Cross-check: the Annual Report numbers (`companyKpis`, R1-C5) and Navigation's cockpit KPI row (`companyKpiSpec`, R1-N8) read the same fields (`b.last.net`, `b.last.revenue`, live `b.cash`, `b.valuation`); R1-N8's test 4b asserts they agree.
4. **`chartInfo(...)`** (R1-C13): the one way a menu adds a chart row; it respects `chartKit`.
5. **`reveal(spec)`** (identity in R1): R3's knowledge system replaces its body; every builder already calls it.
6. **Test helpers:** `test/charts-kit.ts` (R1-C1): `jsonNodes`, `deepFreeze`, `statementSamples`, `ownerGame`, `countSvgNodes`, `renderHtml`; `test/r1-strip.ts` (R1-C3): `stripR1(json)` for the "no simulation output change" probe.
7. **Design tokens** `--chart-1` to `--chart-6`, `--chart-good`, `--chart-bad`, `--chart-grid` in `global.css`.

### 2.3 The `types.ts` lines this track needs beyond R1-P2's first draft (now added by R1-P2; reference only)

```ts
// in MenuBase (added by R1-P2)
/** A tiny trend drawn at the end of the row (stock lists). Pure. Null, or fewer than 2 points, draws nothing. */
spark?: (g: GameState) => (number | null)[] | null

// in AnnualReportData (added by R1-P2)
/** Annual Report 2.0 data (src/game/charts/report.ts ReportCharts). Missing or damaged: the text layout. */
chart?: Json
```

## 3. Order and dependencies

| Wave | Tasks | Roadmap wave | Notes |
|---|---|---|---|
| A | R1-C1 spec and money, R1-C2 geometry and scrub, R1-C3 book series | Wave 0/1 | C1 right after Platform R1-P2. C3 starts history accumulating |
| B | R1-C4 pl, R1-C5 books, R1-C6 market and ranks (builders) | Wave 2 | Parallel; need C1, and C3 for the fields |
| C | R1-C7 kit part 1, R1-C8 kit part 2, R1-C9 kit part 3 | Wave 2 | C7 needs C1, C2. C8 needs C7. C9 needs C8 and a11y R1-A8 (`lazyView`) |
| D | R1-C10 report assembler | Wave 2 | Needs C4, C5, C6 and Platform R1-P3 (`flagOn`) |
| E | R1-C11 Annual Report 2.0, R1-C12 Year-End Desk | Wave 2/3 | C11 needs C9, C10 and a11y R1-A6 (`rovingMove`). C12 needs C11 |
| F | R1-C13 chart rows and Books group, R1-C14 ladders and sparklines, R1-C15 net-worth line, R1-C16 screenshot harness, R1-C17 sweep and docs | Wave 3 | C13 needs C5, C9. C14 needs C6, C9, C13. C15 needs C3, C9. C16 needs C10, C11. C17 last |

Dependency list, one line each:

- C1: Platform R1-P2. C2: none. C3: none (Platform R1-P6 pre-declares `lifeSeries`).
- C4: C1. C5: C1, C3. C6: C1, C3.
- C7: C1, C2, R0-11, a11y R1-A7 (the shared contrast kit). C8: C2, C7. C9: C8, a11y R1-A8.
- C10: C4, C5, C6, Platform R1-P3. C11: C9, C10, a11y R1-A6. C12: C5, C11.
- C13: C5, C9, Platform R1-P3 and R1-P2, a11y R1-A6 and Navigation R1-N2 (merge order on `MenuList.tsx`). C14: C6, C9, C13. C15: C3, C9, Platform R1-P3.
- C16: C10, C11 (C12 for the strip). C17: all.

Suggested merge order inside the track: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17.

Suggested concurrency for the lead's test semaphore: at most 3 agents run vitest or tsc at once. Waves A and B are mostly fast pure tests (under 20 seconds a file); C3, C4, C10 and C16 are the slower ones (they simulate companies).

## 4. Rules that apply to every task in this track

Copy these into each implementer's task text.

1. **Test first.** Write the named test file, see it fail for the stated reason, then implement. Run `NODE_OPTIONS=--max-old-space-size=2048 npx vitest run --maxWorkers=1 <files>` and `npm run typecheck`. Never run the full suite.
2. **Test files are `test/*.test.ts`.** UI is tested with `createElement` and `renderToStaticMarkup` (`react-dom/server`), never JSX in tests, never jsdom. The store is mocked the way `test/annualReport.test.ts` mocks it (`vi.mock('../src/ui/store', ...)`).
3. **Pure builders.** Files in `src/game/charts/` read the state and nothing else: no `g.rng`, no `rand(`, no `Math.random`, no `Date`, no writes, no `structuredClone` of the state. Each builder returns a fresh object, passes it through `reveal()`, and works on a `deepFreeze`d state. A builder that cannot build returns `null` (never throws, never returns a spec with a non-finite number).
4. **Settled years only.** Charts read `b.last`, `b.history`, `MarketState.history` and `flags.lifeSeries`, all of which are written by earlier steps. Never call anything with `year + 1`. Never use `RivalView.trend` (`rivalLookup` reads `rawPull(d, ros, year + 2)`, a foresight read; ladder changes come from S2 history).
5. **Money.** Values stay in internal dollars (the engine already keeps constant PRESENT_YEAR dollars, `history/timeline.ts`). Labels use `shortMoney` under `withMoneyContext(moneyContextOf(g), ...)` in builders and the live bound context in components. A multi-year money chart carries `basis` and the Frame shows the chip "prices of {basis}". No new `earnIncome`, `spend`, `addMoney`.
6. **Text.** `docs/VOICE.md`: contractions, no em-dash or en-dash character anywhere (use a comma, a colon, "to", or an ASCII hyphen), every string at most 120 characters, titles at most 60, labels at most 40, `summary` at most 120. Sign glyphs are ASCII `+`, `-`, `=`. Screen-reader text uses words ("up", "down", "minus").
7. **Saves.** Every new saved field is optional, read by its own bounded reader, finite-checked and clamped. `SAVE_SCHEMA` stays 2. `test/fixtures/save-v1.json.gz` keeps loading.
8. **Accessibility bar for every chart.** Plot has an accessible name and description; a readout row (no hover-only data); arrow-key scrub with Home and End; "Show as table" toggle that renders a real `<table>`; 44 px targets; a marker shape per series; no colour-only encoding (every good or bad bar has a sign glyph); `prefers-reduced-motion` honoured; usable at 360 px; at most 150 SVG elements per chart.
9. **Colours** only through the tokens; no raw hex in `.tsx`; no brand colours (they fail 3:1) for marks.
10. **Commits.** One task, one or a few commits, explicit pathspecs, message ends with the attribution lines given in the lead's task text.
11. **Plan changes.** If the code differs from this plan, follow the code, keep the interface names, and say so in the commit message.
12. **Flags in tests.** Every test that depends on `annualReport2` or `chartKit` sets it explicitly with `withFlags({ ... }, fn)` from `src/game/flags.ts` (both the on and the off case). Never rely on a default: the lead flips the defaults in the release commit.
13. **Lazy seam.** Outside `src/ui/charts/`, import only from `src/ui/charts/lazy.tsx` (a11y's `test/lazy-zones.test.ts` fails otherwise). Every lazy view is given a `fallback` that is today's text rows.

## 5. Tasks

### R1-C1 Chart spec additions, reader, money labels, reveal, test kit

**Roadmap items.** G.1 (spec, `readChartSpec`, `money.ts`, `reveal`), part of D.2 and D.11 criterion 4.

**Files.**
- Modify `src/game/charts/spec.ts` (created by Platform R1-P2 with the types and `CHART_LIMITS`, zero `import` lines): append, each in its own hunk, `LadderRow`, three optional `ChartSpec` fields (`rows`, `basis`, `note`), `SPEC_LIMITS` and `readChartSpec`. Do not change `CHART_LIMITS` (R1-P2's test pins it) and add no `import` line (R1-P2's test reads the file text). If R1-P2 has not merged when C1 starts, create the file with R1-P2's exact text first and say so in the commit.
- Create `src/game/charts/reveal.ts`, `src/game/charts/money.ts`, `src/game/charts/index.ts` (re-exports only).
- Create `test/charts-kit.ts` (shared helpers, not a test), `test/chart-spec.test.ts`, `test/chart-money.test.ts`, `test/chart-hygiene.test.ts` (first line `// ci: fast`).

**Interfaces** (exact; every later task uses these).

```ts
// src/game/charts/spec.ts. R1-P2 already has:
//   ChartTone, ChartKind, ChartUnit, ChartSeries, ChartStep, ChartMark, ChartSpec,
//   CHART_LIMITS = { title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 }
// R1-C1 adds:
export interface LadderRow {
  id: string; name: string
  value: number                 // share (unit pct), score, rank number...
  rank: number                  // 1-based, this period
  prevRank: number | null       // rank last period, null when unknown or new
  prev: number | null           // value last period
  spark: (number | null)[]      // at most 12 points, oldest first
  you?: true
}
// inside ChartSpec, after `marks?`:
  rows?: LadderRow[]            // kind 'ladder', at most SPEC_LIMITS.rows
  basis?: number                // price year of a multi-year money chart (Frame shows "prices of {basis}")
  note?: string                 // second line of a KPI tile, or a footnote; at most SPEC_LIMITS.note
export const SPEC_LIMITS: { readonly rows: 12; readonly spark: 12; readonly label: 40; readonly note: 60; readonly id: 24; readonly magnitude: 1e15 }
export function readChartSpec(json: unknown): ChartSpec | null
// src/game/charts/reveal.ts
export function reveal<T extends ChartSpec>(spec: T): T           // identity in R1 (R3 replaces the body)
// src/game/charts/money.ts
export function priceBasisYear(g: GameState): number             // moneyDisplay().nominal ? g.year : PRESENT_YEAR
export function priceChip(basis: number): string                 // 'prices of 2031'
export function moneyLabel(g: GameState, n: number): string      // shortMoney under withMoneyContext(moneyContextOf(g), ...)
export function deltaLabel(g: GameState, n: number): string      // 'up $310K' | 'down $2.1M' | 'unchanged'
export function pctLabel(frac: number, digits?: number): string  // 0.35 -> '35%'; 0.0004 -> '<0.1%'
export function whole(n: number): number                         // Math.round, non-finite -> 0, clamped to plus or minus 1e15
export function fit(text: string, max?: number): string          // cut at a word, never past max (default 120), no ellipsis character
```
`ChartSpec` must be JSON-safe: builders put it into modal data with `toJson(spec)` (`business/util.ts`).

**Behaviour.**
- `readChartSpec` returns a fresh object or `null`. Returns `null` (never truncates) when: the input is not a plain object; `v !== 1`; kind, unit or a tone is unknown; any string is empty (title, summary, labels) or longer than its limit (`title` 60, `summary` 120 = `CHART_LIMITS`; labels 40, `note` 60, ids 24 = `SPEC_LIMITS`); any string holds a control character (code below 32); `x` has more than `CHART_LIMITS.points` entries or an entry that is neither a finite number nor a string of at most 40 characters; more than 6 series, or a series `id` that is not 1 to 24 characters of `[a-z0-9_-]`; a `values` array longer than 64 or holding anything but a finite number or `null`; any number with magnitude above 1e15; more than 20 steps, 8 marks or 12 rows; a ladder row `rank` that is not an integer from 1 to 1,000,000; `spark` longer than 12; `basis` outside 1800 to 2300; for kinds `line`, `bars`, `stack`, `timeline`: fewer than 1 x or 1 series, or a `values` length different from `x.length`; for `waterfall`: fewer than 2 steps; for `ladder`: no rows; for `kpi` and `meter`: no series. Arrays are length-checked before they are walked (a 10-million element hostile array costs O(1)). Unknown keys are dropped; the keys `__proto__`, `constructor`, `prototype` are never copied.
- `reveal` returns its argument.
- `priceBasisYear`: when `moneyDisplay().nominal` is true the labels use the prices of `g.year` (the converter multiplies by `priceLevel(year)`), else they are in today's money, `PRESENT_YEAR` (2026, `history/timeline.ts`). That single year is the chip. All labels of one chart are built under one `moneyContextOf(g)`, so a 30-year axis is one price basis. The engine already stores constant PRESENT_YEAR dollars, so no deflator is applied to any series.
- `deltaLabel` uses the words up and down with `moneyLabel` of the absolute value; zero reads "unchanged".
- `fit` is used by builders so a summary never exceeds 120 characters: drop trailing clauses at a sentence boundary, then a word boundary.

**Tests.**
- `test/chart-spec.test.ts`: (1) a valid spec of each of the 8 kinds round-trips through `JSON.parse(JSON.stringify())` and `readChartSpec` unchanged. (2) A table of 40 hostile inputs returns `null`: each limit above, plus NaN and `Infinity` (put into the object before reading), `1e16`, a string where a number belongs, `null` x entries, a ladder row with rank 0 or 1.5, `__proto__` keys. (3) Unknown keys are dropped and `Object.prototype` is untouched after reading `JSON.parse('{"__proto__":{"x":1}, ...}')`. (4) A 5,000,000-element `x` array returns `null` in under 50 ms. (5) The result does not alias the input (mutating the input afterwards changes nothing). (6) `reveal(spec) === spec`. (7) `CHART_LIMITS` is unchanged (equals R1-P2's object). Proves D.11.4 for specs.
- `test/chart-money.test.ts`: `priceBasisYear` with `setMoneyDisplay({ nominal: true })` and `{ nominal: false }` (restore in `finally`); `moneyLabel` in USD and in Japan (a `g` with `character.countryId = 'jp'`), 3 sizes; `deltaLabel` three cases; `pctLabel` four cases; `whole` with NaN, Infinity, 1e300; `fit` never exceeds 120 and never ends mid-word.
- `test/chart-hygiene.test.ts` (`// ci: fast`): reads every file under `src/game/charts/`, `src/ui/charts/`, `src/game/life-series.ts`, `src/game/business/books-menu.ts`, `src/ui/components/LifeLine.tsx`, `src/ui/minigames/{bookModel.ts,yearEnd.ts}` that exists and asserts: no U+2013 or U+2014; no `Math.random`, `Date.now`, `new Date`, `g.rng`, `rand(`; no `earnIncome`, `addMoney`, `spend(`, `.cash +=`, `.money +=`; every relative runtime import in `src/game/charts/*.ts` is in the allow-list (`../types`, `../core`, `../flags`, `../life-series`, `../history/timeline`, `../business/state`, `../business/economic-report`, `../business/franchise-state`, `../business/lab-state`, `../business/lab-text`, `../business/dividend-policy`, `../business/industries`, `../business/util`, `../business/competition-state`, `./*`; `import type` from anywhere is always allowed); no file under `src/game/charts/` imports `../business/yearly`, `../business/manage`, `../business/economy` or `../business/competition` at runtime; and `src/game/business/state.ts`, `economy.ts` and `competition.ts` contain no import from a `charts` path. The test passes vacuously for files that do not exist yet; it is the permanent guard for the whole track. (Zone rule for `src/ui/charts/` belongs to a11y's `test/lazy-zones.test.ts`.)

**`test/charts-kit.ts` exports** (used by every later test):
```ts
export { deepFreeze } from './fuzz-kit'
export function jsonNodes(v: unknown): number          // counts every value like save-schema's loader (arrays, objects, primitives)
export function countSvgNodes(html: string): number    // elements inside <svg>: rect path line circle polyline polygon text g use tspan
export function statementSamples(seeds: readonly number[]): { seed: number; industry: string; g: GameState; a: Asset; b: BizState; s: Statement }[]
export function ownerGame(o?: { seed?: number; industry?: Industry; years?: number; companies?: number }): { g: GameState; a: Asset; b: BizState; others: Asset[] }
export function renderHtml(el: ReactElement): string   // renderToStaticMarkup
```
`statementSamples`: for each seed, the `company()` setup of `test/talent-business.test.ts` (`createNewLife({ seed, year: 2000, countryId: 'us' })`, `g.queue = []`, age 30, `g.year = 2030`, money 5e6, smarts 65, a driver licence), then one company per id of `INDUSTRY_IDS` (all 56): `newBiz(g, id, 'us', city, { cash: 10_000_000, founded: g.year - 6 })`, `createBusinessAsset(g, id, b0, 100_000)`, `installManager(g, b, managerCandidate(g, b, 70))` (hired CEO, as `test/probe-life.ts`), then one `yearlyBusinessImpl(g)` (`business/yearly.ts`); return each company's `b.last`. 3 seeds give 168 statements. A second pass is `g.queue = []; g.year += 1; yearlyBusinessImpl(g)` (the bridge needs two consecutive statements). `ownerGame`: `newBiz` + `createBusinessAsset` + `becomeCeo(g, a, b)` (`business/career.ts`) for the first company, hired managers for the others, `g.queue = []` then `ageUp(g)` `years` times (default 6), dropping the queue before each year and keeping it after the last. Flags are set in tests with Platform's `withFlags`; the kit does not wrap it.

**Flag.** None.
**Hot-file notes.** `spec.ts` (Platform's file): three additive hunks. Everything else is new.
**Depends on.** Platform R1-P2. **Size.** Source about 290 lines (spec 170, money 90, reveal 10, index 20); tests about 480 lines plus the kit 130.

---

### R1-C2 Geometry, scrub, value formatting, table model (pure UI helpers)

**Roadmap items.** G.2 (`geometry.ts`, `useScrub.ts`), D.11 criterion 2 (geometry, `scrubReducer`).

**Files.**
- Create `src/ui/charts/geometry.ts`, `src/ui/charts/useScrub.ts`, `src/ui/charts/format.ts`, `src/ui/charts/table.ts`.
- Create `test/chart-geometry.test.ts`.
- No existing file changes.

**Interfaces.**
```ts
// geometry.ts (no React, no game imports except types)
export type Scale = (v: number) => number
export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale   // degenerate domain -> midpoint of range; non-finite input -> r0
export function extentOf(values: readonly (number | null | undefined)[], opts?: { zero?: boolean; pad?: number }): [number, number]  // empty or all-null -> [0, 1]; constant -> widened; ignores non-finite
export function niceTicks(lo: number, hi: number, count?: number, unitScale?: number): number[]   // ascending, 1/2/5 steps, at most count + 2 ticks; unitScale = display units per internal unit
export function linePath(xs: readonly number[], ys: readonly (number | null)[], sx: Scale, sy: Scale): string   // null or non-finite breaks the line: 'M x y L x y M ...'; '' when no point
export function stackLayout(series: readonly (readonly (number | null)[])[]): { lo: number[][]; hi: number[][]; min: number; max: number }  // positives stack up, negatives stack down; series[s][i]
export interface WaterfallBar { start: number; end: number; level: number; kind: 'total' | 'delta' }
export function waterfallLayout(steps: readonly { value: number; kind: 'total' | 'delta' }[]): { bars: WaterfallBar[]; min: number; max: number }
export function indexAt(px: number, left: number, width: number, n: number): number   // clamped 0..n-1, -1 when n <= 0
export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star'
export const MARKER_SHAPES: readonly MarkerShape[]                  // 6, series i uses MARKER_SHAPES[i % 6]
export function markerPath(shape: MarkerShape, cx: number, cy: number, r: number): string
export function xTicks(x: readonly (number | string)[], maxTicks: number): number[]   // indexes to label, always first and last
export function dodgeLabels(ys: readonly number[], minGap: number, lo: number, hi: number): number[]   // same order, pushed apart by at least minGap, kept inside [lo, hi]
// useScrub.ts
export interface ScrubState { index: number | null }              // null: no cursor, the readout shows the last point
export function scrubReducer(state: ScrubState, key: string, n: number): ScrubState
export function scrubIndex(state: ScrubState, n: number): number  // effective index, -1 when n <= 0
export interface ScrubApi {
  index: number                                                    // effective index
  active: boolean                                                  // the reader has moved the cursor
  handlers: { tabIndex: 0; onKeyDown: KeyboardEventHandler; onPointerDown: PointerEventHandler; onPointerMove: PointerEventHandler; onPointerLeave: PointerEventHandler; onBlur: FocusEventHandler }
}
export function useScrub(n: number, opts?: { onMove?: (index: number | null) => void; inset?: [number, number] }): ScrubApi
// format.ts (reads the live bound money context, like every component)
export function formatUnit(unit: ChartUnit, v: number): string     // money -> shortMoney; pct -> '7.2%'/'0.35%'/'<0.01%'; count -> '1.2K'; rank -> '#3'; years -> '12 yrs'
export function formatSigned(unit: ChartUnit, v: number): string   // '+$310K', '-$2.1M', '$0' (ASCII sign)
export function describeDelta(unit: ChartUnit, v: number): string // 'up $310K' | 'down 2 places' | 'no change'
export function readoutFor(spec: ChartSpec, index: number): string // '2029: Net profit $1.1M' | 'Wages: -$2.2M, 23% of sales after tax' | one line per kind, at most 120 chars
// table.ts
export function specTable(spec: ChartSpec): { caption: string; head: string[]; rows: string[][] }
```
`scrubReducer` rules: `ArrowRight` and `ArrowDown` move +1, `ArrowLeft` and `ArrowUp` move -1, `Home` goes to 0, `End` to `n - 1`, `PageDown` +5, `PageUp` -5, `Escape` returns `{ index: null }`; a null index starts from the last point (`n - 1`); results clamp to 0 to `n - 1`; any other key returns the same state object; `n <= 0` returns `{ index: null }`.
`readoutFor` per kind: line, bars, stack, timeline: `{x}: {label} {value}` for each series (at most 3 shown, "and N more"); waterfall: `{label}: {signed value}` and, for deltas, `{share}% of the first total`; ladder: `#{rank} {name} {value}`; kpi, meter: summary.

**Behaviour.** Every function is total: empty arrays, one point, constant series, all-null series, values at 1e15, tiny spans (1e-9), negative-only data and injected `NaN` or `Infinity` give finite numbers and strings that contain neither `NaN` nor `Infinity` nor `undefined`. `niceTicks` includes 0 when the range crosses it and with `unitScale` works in display units (yen, rupiah) then converts back, so ticks read as round numbers in the player's currency. `useScrub` is a thin hook over the reducer: `onKeyDown` calls the reducer (and `preventDefault` for handled keys), `onPointerDown` and `onPointerMove` use `indexAt(e.clientX, rect.left + inset[0], rect.width - inset[0] - inset[1], n)` from `e.currentTarget.getBoundingClientRect()`, `onPointerLeave` and `onBlur` reset to null only when the pointer (not the keyboard) set it.

**Tests** (`test/chart-geometry.test.ts`, all pure, a seeded LCG instead of `Math.random`, under 10 seconds).
1. `linearScale`: monotone, endpoints, degenerate and non-finite cases. 2. `extentOf`/`niceTicks` property test over 500 random series (lengths 0 to 70, magnitudes 1e-9 to 1e15, null and NaN sprinkled): every output finite, ticks ascending, at most `count + 2`, step in {1, 2, 5} x 10^k, covers 0 when crossed, `unitScale` 150 gives ticks that are round in display units. 3. `linePath` gaps: nulls split the path; one point yields a path with a single `M`; empty yields `''`. 4. `stackLayout`: positive and negative stacks, `hi - lo` equals the value, totals bound `min`/`max`. 5. `waterfallLayout`: totals start at 0, deltas chain from the running level, a negative first total, `min`/`max` bound every bar. 6. `indexAt` edges (left of box, right of box, n = 1, n = 0). 7. `markerPath` returns a path for 6 shapes with finite numbers; `dodgeLabels` keeps order, gaps of at least `minGap`, stays inside the box, and returns the input when it already fits. 8. `scrubReducer`: table of 14 (state, key, n) cases including Home, End, Escape, PageUp, unknown key (same object), n = 0, n = 1, null start. 9. `useScrub` rendered with `renderToStaticMarkup` returns `active: false` and `index: n - 1`. 10. `formatUnit`/`formatSigned`/`describeDelta` for each unit and for 0, negatives, 1e15, 1e-9. 11. `readoutFor` for one spec of each kind never exceeds 120 characters. 12. `specTable` row counts equal `x.length` (line) or `steps.length` (waterfall) or `rows.length` (ladder).

**Flag.** None. **Hot-file notes.** None (new files).
**Depends on.** None (imports types from C1 only; may start in parallel using the interface block above). **Size.** Source about 690 lines (geometry 400, useScrub 110, format 110, table 70); tests about 560.

---

### R1-C3 Book series: S1 company books, S2 market ladder history, S3 life series

**Roadmap items.** G.3 (D.3), D.11 criteria 4 (lifeSeries rows), 5, 13; the series half of "R1 changes no simulation output".

**Files.**
- Modify `src/game/business/state.ts` (`YearRecord` 120, `readRecord` 581, normalizer `slice(-12)` 683).
- Modify `src/game/business/economy.ts` (`recordYear` 997, slice at 1009).
- Modify `src/game/business/yearly.ts` (two tiny hunks near `evolve(g, b, s, fiscal)` and `const rec0 = recordYear(b, s)`).
- Modify `src/game/npc-lives.ts` (line 188, the NPC `recordYear` call).
- Modify `src/game/business/milestones.ts` (lines 54 and 109, window helper).
- Modify `src/game/business/competition-state.ts` (`MarketHistory` 38, `readHistory` 158).
- Modify `src/game/business/competition.ts` (row build at 90, `MarketView.history` type 210, mapper 422).
- Create `src/game/life-series.ts`.
- Modify `src/game/aging.ts` (end of `ageUp`).
- Modify `src/game/save.ts` (`GraveyardEntry` 108, `loadGraveyard` 113 to 135).
- Modify `src/ui/store.ts` (`finalizeIfDead`, the object passed to `recordDeath`, near line 366).
- (`src/game/world-flags.ts` needs no edit: Platform R1-P6 pre-declares `lifeSeries` as `personal`.)
- Create `test/r1-strip.ts`, `test/series-books.test.ts`, `test/series-market.test.ts`, `test/series-life.test.ts`, `test/series-budget.test.ts`.

**Interfaces.**
```ts
// business/state.ts
export const HISTORY_ROWS = 30
export const SIM_HISTORY = 10          // rows the simulation reads (v4.0.2 kept 10)
export const BOOK_KEYS = ['cash','debt','salesTax','cogs','wages','keyStaff','rent','marketing','interest','upkeep','other','otherIncome','ownerPay','draws'] as const
export interface YearRecord { /* the 9 existing fields */ cash?: number; debt?: number; salesTax?: number; cogs?: number; wages?: number; keyStaff?: number; rent?: number; marketing?: number; interest?: number; upkeep?: number; other?: number; otherIncome?: number; ownerPay?: number; draws?: number }
export function simHistory(b: Pick<BizState, 'history'>): YearRecord[]      // b.history.slice(-SIM_HISTORY)
export function readRecord(x: Record<string, Json>): YearRecord | null       // now exported
// business/economy.ts
export function recordYear(b: BizState, stmt: Statement, opts?: { draws?: number; lean?: boolean }): YearRecord
// business/competition-state.ts
export const TOP_RIVALS = 8
export interface MarketHistory { /* existing */ top?: (string | number)[] }   // flat: id, share, id, share ... at most 16 entries
export function topPairs(h: { top?: readonly (string | number)[] }): [string, number][]
// life-series.ts
export const LIFE_SERIES_ROWS = 120
export type LifeRow = [age: number, year: number, netWorth: number, cash: number, debt: number, income: number, happiness: number, health: number]
export interface LifeSeries { v: 1; id: string; rows: LifeRow[] }
export function readLifeSeries(g: GameState): LifeRow[]            // [] for another life's series or junk; sorted by age, one row an age, at most 120
export function lifeRows(g: GameState): { age: number; year: number; netWorth: number; cash: number; debt: number }[]   // the same rows as objects, oldest first (Navigation's C-SERIES contract)
export function writeLifeRow(g: GameState): void                   // idempotent by age, never throws
export function lifeSpark(g: GameState, points?: number): number[] // net worth, at most 40 points (default 40), first and last kept
export function readSpark(v: unknown): number[] | undefined        // for the graveyard: at most 40 finite numbers, whole, clamped to plus or minus 1e15
// save.ts
export interface GraveyardEntry extends AncestorSummary { lifeId: string; obituary: string | null; spark?: number[] }
```

**Behaviour.**
- **S1 writer.** `recordYear` builds the existing 9 fields as today and, unless `opts.lean`, adds the 14 book fields as whole dollars: `cash` and `debt` from `b.cash` and `b.debt` (called after `evolve`, so books-close values), `salesTax`, `cogs`, `wages`, `keyStaff`, `rent`, `marketing`, `interest`, `upkeep`, `other`, `otherIncome`, `ownerPay` from the `Statement`, and `draws` from `opts.draws` (default 0). A non-finite input writes 0. Idempotent: `b.history = [...b.history.filter((h) => h.year !== rec.year), rec].slice(-cap)` with `cap = opts.lean ? SIM_HISTORY : HISTORY_ROWS`. The function still returns the stored row object (the caller in `yearly.ts` sets `rec0.valuation` on it).
- **`yearly.ts` hunks.** Before `evolve(g, b, s, fiscal)` add `const draws = Math.max(0, b.ownerDraws ?? 0)`; change `recordYear(b, s)` to `recordYear(b, s, { draws })`. Reason: `evolve` deletes `b.ownerDraws` (`delete b.ownerDraws`, economy.ts 915) before `recordYear` runs, so the roadmap's "fills them from `b.ownerDraws`" reads nothing. The bonus is already inside `other` (`manage.ts`: `bb.yearCosts += n; bb.ownerDraws = ...`), so `draws` is a memo, not a second cost.
- **NPC path.** `npc-lives.ts` line 188: `recordYear(b, result.stmt, { lean: true })` (NPC companies keep 9 fields and 10 rows, exactly as today; the following `slice(-12)` stays).
- **Reader.** `readRecord` takes each of the 14 keys only when it is a finite number, rounds it and clamps to plus or minus 1e15; absent or damaged keys stay absent (an old row). `normalizeBiz` keeps `slice(-HISTORY_ROWS)` (was `-12`) after its existing dedupe by year.
- **Simulation windows.** `milestones.ts` `firstYear` (`b.history.find(ok)`) and the `profit` milestone `progress` (`b.history.some(...)`) are the only readers that scan beyond the last 3 rows (audit: `economy.ts` 935 and 1341 use `slice(-3)`, `yearly.ts` 390 `slice(-2)`, 423 and 511 index from the end, `board.ts`/`board-vote.ts`/`dashboard.ts` index `length - 2`, `competition-moves.ts` 202 `slice(-3)`, `deeptech-core.ts` 596 ends in `slice(-3)`, `franchise.ts` 126 compares `length` with 2, `events-extra.ts` compares with 1 and 2, `deeptech-state.ts` `milestoneListingBlock` compares `years < 3`). Both milestone readers switch to `simHistory(b)` so a 30-row history cannot move a result.
- **S2 writer.** `competition.ts` row build: add `top: flatTop(rivals)` where `rivals` is the already sorted, already 1e-6-rounded `[id, share][]` list; keep the first `TOP_RIVALS` (8) as `[id1, share1, id2, share2, ...]`. `readHistory` reads `top` only when it is an array of even length at most 16 whose even slots are non-empty strings of at most 60 characters and whose odd slots are finite numbers; shares are clamped to 0 to 1 and rounded to 1e-6; entries with share at or below 0 and repeated ids are dropped; an empty result omits the key. `MarketView.history` rows (type at 210, mapper at 422) pass `top` through. The `.slice(-20)` stays. `topPairs` decodes.
- **S3 writer.** `writeLifeRow(g)` replaces or appends the row for `g.character.age`: `[age, year, netWorth(g), round(c.money), loans plus mortgages, round(num(g.flags.taxableIncome)), stats.happiness, stats.health]`, all finite, whole, money clamped to plus or minus 1e15, stats 0 to 100, age 0 to 150, year 1 to 9999; keeps the newest 120 by age; writes `g.flags.lifeSeries = { v: 1, id: g.lifeId, rows }`. In `ageUp` call it (a) just before `queueAi(g, { type: 'yearEvents' })`, and (b) in the two early returns where the character died (`if (!c.alive) return` after the hooks loop and after `checkDeath`) so the death year has its row. `taxableIncome` at that point is the year's income so far: `ageUp` zeroes it at the start of the year and the hooks add to it, and `settleIncomeTax` closes the old year first. `readLifeSeries` returns `[]` when `id !== g.lifeId`, `v !== 1`, or `rows` is not an array; drops rows that are not 8 finite numbers; sorts by age; keeps one row per age (the later wins); keeps the newest 120.
- **Heirs.** `continueAsChild` rebuilds `n.flags` from a whitelist (life.ts 1509 to 1530), so `lifeSeries` does not carry over and `lifeId` changes; the parent's series condenses via `lifeSpark(g)` into the graveyard entry. `store.ts` `finalizeIfDead` adds `...(spark.length >= 2 ? { spark } : {})` to the entry. `loadGraveyard` reads `spark` with `readSpark` and drops a damaged one (the entry still loads).
- **No new RNG draw anywhere; no change to any simulated number.**

**Tests.**
- `test/series-books.test.ts`: (1) `recordYear` twice for one year leaves one row and the second call's values win. (2) 31 years leave 30 rows, oldest dropped (synthetic: one `simulateYear` result reused with `year` changed). (3) All 14 fields are whole numbers and `cogs + wages + ... ` reconstruct the statement (`revenue - salesTax - cogs - wages - keyStaff - rent - marketing - interest - upkeep - other + otherIncome - ownerPay - tax` equals `profit` within $6). (4) `draws`: a company whose owner paid a bonus (set `b.ownerDraws = 50_000`, `b.yearCosts += 50_000` before the year) records `draws: 50000` through a real `yearlyBusinessImpl` pass, and `other` includes it. (5) `lean: true` writes the 9 old fields only and caps at 10. (6) Hostile rows through `normalizeBiz`: `NaN`, `Infinity`, 1e300, strings, `null`, arrays, 500 rows, duplicate years, negative years: finite fields clamp to 1e15, junk fields vanish, rows cap at 30, order and dedupe as before. (7) The v4.0.2 fixture (`test/fixtures/save-v1.json.gz`, load as `test/save-store.test.ts` does) migrates, `readBiz` of its companies has rows without the new keys, and `plSpec`-style reads of them do not throw (checked again in C4, C5). (8) Milestones: a company with 15 rows where only the oldest 5 are profitable keeps the `profit` milestone `progress` at 0, as with a 10-row history (`MILESTONES` is exported). (9) NPC company: after a pass `b.history` rows have no new keys and at most 10 rows.
- `test/series-market.test.ts`: (1) a real yearly pass writes `top` with at most 8 ids, shares rounded to 1e-6, sorted descending, flat even length. (2) `readHistory` hostile `top` (odd length, numbers in id slots, shares 5, -1, NaN, 1e300, 40 pairs, repeated ids) clamps or drops. (3) Old rows without `top` read unchanged and `topPairs` returns `[]`. (4) `refreshMarket` run twice for one year leaves one row. (5) `.slice(-20)` still holds at 25 years.
- `test/series-life.test.ts`: (1) `writeLifeRow` twice for one age leaves one row. (2) A replay: `structuredClone(g)` then `ageUp` twice from the same state with different `rng` replaces the row of that age. (3) 130 ages leave 120, the newest. (4) Hostile `flags.lifeSeries` (wrong `v`, another life id, rows with strings, `NaN`, 7 or 9 entries, 500 rows, not an array) reads as `[]` or the valid subset and never throws. (5) A death inside `ageUp` still writes the row (use `killCharacter` through a hook or set health 0 and `checkDeath`). (6) `continueAsChild` result has no `lifeSeries` of the parent and `readLifeSeries` is `[]`. (7) `lifeSpark` returns at most 40 points, keeps first and last, whole numbers. (8) `loadGraveyard` with a hostile `spark` (strings, 1000 numbers, NaN) loads the entry with a clean or absent `spark` (use `installStorageShim` from `test/fuzz-kit.ts`).
- `test/series-budget.test.ts`: build 30 synthetic companies (one industry, `recordYear` 31 times each with a statement from one `simulateYear` and the year changed; `MarketState` with 20 history rows each carrying 8 ids) and a 120-row life series; with `jsonNodes`: S1 growth against the same companies written with `lean` is at most 20,000 (expect about 18,600), S2 at most 10,500, S3 at most 1,200, the sum at most 32,000 (expect about 29,900); and a 12-company game stays under 14,000 added nodes. Under 20 seconds.
- `test/r1-strip.ts` (helper, not a test): `stripR1(json: unknown): unknown` returns a copy with every R1 addition removed: the 14 new `YearRecord` keys, every `top` and `spark`, `flags.lifeSeries`, the `chart` key of `annualReport` modal data, and each company `history` truncated to its last 10 rows. Cross-check, to cover the other tracks' optional keys too: it also removes `flags.inbox`, removes `weight` and `link` from queued notices (`g.queue` items with `kind: 'notice'`), and undoes R1-T2's flavor move by setting `flags.flavorRecent` from `flags.textMem.r.flavor` (an array of strings) and deleting `flags.textMem` when nothing but that ring is in it (any other key left in `textMem` is a real difference and stays). Its test (add to `test/series-books.test.ts`) feeds a hand-built v4.0.2-shaped state and the same state with every addition and asserts `stripR1` returns the original. R1-P9's `compare` compares `stripR1(after)` with the R0-head baseline (the roadmap's "identical except the new optional keys" is not literally true for `history`, which keeps 30 rows instead of 10; see Plan vs code 8).

**Flag.** None (history must accumulate from the first merge).
**Hot-file notes.** `state.ts`: one interface block, `readRecord` body and one constant; `economy.ts`: only the body of `recordYear`; `yearly.ts`: two lines in two hunks (later, R1-C10 adds a third hunk in `reportData`); `competition.ts`/`competition-state.ts`: three single-line hunks and one reader; `aging.ts`: three call lines and an import; `life-series.ts`: new; `save.ts`: one interface field and one line in the loader; `store.ts`: one spread in the entry literal. All additive.
**Depends on.** None. **Size.** Source about 380 lines (state 60, economy 30, yearly 4, npc 1, milestones 8, competition-state 45, competition 8, life-series 170, aging 8, save 20, store 3); tests about 900 lines.

---

### R1-C4 Profit and Loss builders (the waterfall)

**Roadmap items.** G.1 `pl.ts`, D.4 steps, D.11 criterion 1. This is the headline data.

**Files.** Create `src/game/charts/pl.ts`, `test/chart-pl.test.ts`. Modify `src/game/charts/index.ts` (re-export).

**Interfaces.**
```ts
export const PL_LABELS: Readonly<Record<string, string>>        // every row label, at most 40 characters
export function plSteps(b: BizState, s: Statement): ChartStep[]  // integers; first total + sum of deltas == last total, exactly
export function plSpec(g: GameState, b: BizState): ChartSpec | null          // kind 'waterfall', full: title 'Where the sales went, 2031'
export function plSummarySpec(g: GameState, b: BizState): ChartSpec | null   // top 5 cost steps + 'Everything else'
export function bridgeSpec(g: GameState, b: BizState): ChartSpec | null      // 'Why profit changed', from economicReportOf(b)
export function profitVerdict(g: GameState, b: BizState): string             // at most 120: 'Net profit rose $310K from 2030.' or 'First full year on the books.'
```
All three specs use `b.last` / `b.economicReport` as passed in; the caller passes `readBiz(g, a)` (a normalized copy), never the raw `bizOf` view (`bizOf` does not re-normalize a current-version record, so a damaged value could sit in it).

**Behaviour.** The rows follow the 12 lines of `economic-report.ts` `LINES` and the splits `statementLines` (`yearly.ts` 163) makes; `pl.ts` re-implements the splits with the primitives and does not import `yearly.ts`:
1. total `Sales after tax` = `s.netRevenue`.
2. deltas in this order, each omitted when its value is 0: `Materials and direct costs` (-cogs), `Wages` (-wages), `Key staff and managers` (-keyStaff), `Premises` (-rent), `Marketing` (-marketing), `Debt interest` (-interest), `Upkeep and investments` (-upkeep), `One-off costs` (-(other - crew)), `Research team` (-crew, `crew = min(labPayrollIn(b, year), max(0, other))`, `lab-state.ts` 276), `Other income` (+(otherIncome - franchised - grants - royalty)), `Franchise fees and royalties` (+`min(franchiseIncomeFor(b, year), max(0, otherIncome))`, `franchise-state.ts` 65), `R&D tax credit and grants` and `Patent licences` (+, from `labSplit(b, s, franchised)`, labels from `LAB_STATEMENT`, `lab-text.ts` 131), `Your salary` (-ownerPay). `strategicIncome` is not a row (it is inside `otherIncome`; R0-3 removes the mint, old statements keep the number).
3. a delta `Rounding` of `pbt - running` when non-zero (label `Other adjustments` when its magnitude exceeds `max(5, netRevenue * 1e-5)`), then total `Profit before tax` = `s.pbt`, delta `Corporate tax` (-corpTax, omitted at 0), a second `Rounding` row of `net - (pbt - corpTax)` when non-zero, total `Net profit` = `s.net`.
All values `Math.round`ed; the residuals are computed from the rounded values, so the sum identity is exact. At most 20 steps (the maximum is 18). Each cost step's share of the first total is available to the UI as `abs(value) / first total` (no extra field). Marks: if the statement year's `YearRecord.draws` is above 0 (look up the history row of `s.year`), add `{ at: <index of the One-off costs row, else the Research team row>, label: 'Includes your $X bonus' }` (the bonus is inside `other`, so one of the two rows exists); if `cashErosion` is above 0 add nothing here (it belongs to the cash walk).
`plSummarySpec`: same first total, the 5 largest cost or income steps by magnitude (ties by order), one `Everything else` delta for the rest (sign preserved, omitted at 0), then the three closing rows; at most 10 steps; same identity. Title `Where the sales went`. 
`bridgeSpec`: `economicReportOf(b)` (validated to sum within $0.01): total `Net profit {previousYear}` = `previousNet`, one delta per driver (label cut to 40), total `Net profit {year}` = `net`; at most 15 steps; returns null when the report is null or has no drivers.
`summary`: e.g. `Net profit $1.2M on $9.6M of sales after tax, up $310K.` built with `fit`, `moneyLabel`, `deltaLabel`. `unit: 'money'`, `x: []`, `series: []`, no `basis` (single year). Titles at most 60.
Returns `null` when `b.last` is null or any value is non-finite. Pure, no RNG, and passes through `reveal`.

**Tests** (`test/chart-pl.test.ts`, under 90 seconds).
1. **D.11.1:** `statementSamples([11, 12, 13])` gives 168 statements (3 seeds x 56 industries); for each, `plSteps` sums exactly (`first.value + sum(deltas) === last.value`, and the last total equals `s.net`), every step label is in `PL_LABELS` or a lab or franchise label, and `Rounding`/`Other adjustments` rows have magnitude below 5 in at least 99% (at most 1 of 168 exceeds).
2. Row order and omissions on 4 hand-built statements: no key staff, no marketing, no interest, with franchise income, with lab credit and royalty, with a research crew, with an `ownerPay`.
3. `plSummarySpec` has at most 10 steps and the same identity for all 168.
4. `bridgeSpec`: two consecutive passes (`yearlyBusinessImpl` twice) give a spec whose first and last totals equal the report's `previousNet` and `net` and whose steps sum within $0.01; a hostile `economicReport` (drivers that do not sum, strings) gives `null`.
5. Old statement with `strategicIncome` set: no row for it, identity holds.
6. All specs pass `readChartSpec` unchanged (so the UI will accept them) and all strings are at most 120 characters.
7. Purity: the builders run on `deepFreeze(structuredClone(g))` and `readBiz` output; `g.rng` unchanged.
8. The v4.0.2 fixture's companies (`b.last` present): `plSpec` is non-null and valid, `bridgeSpec` is null.

**Flag.** None (builders; the flag sits in R1-C10). **Hot-file notes.** None.
**Depends on.** R1-C1. **Size.** Source about 380 lines; tests about 700.

---

### R1-C5 History and cash builders (profit, cost structure, cash walk, KPI tiles, company strip)

**Roadmap items.** G.1 `books.ts`, D.3 old-save behaviour, D.4 Cash tab, design 12.6 cash walk.

**Files.** Create `src/game/charts/books.ts`, `test/chart-books.test.ts`. Modify `src/game/charts/index.ts`.

**Interfaces.**
```ts
export interface StripRow { id: string; name: string; emoji: string; net: number; delta: number | null; spark: (number | null)[]; managed: boolean }
export const COST_GROUPS: readonly { id: string; label: string; tone: ChartTone; keys: readonly string[] }[]   // 6 groups
export function profitSpec(g: GameState, b: BizState): ChartSpec | null      // kind 'line', net profit by year, up to 30 years, basis
export function costShareSpec(g: GameState, b: BizState): ChartSpec | null   // kind 'stack', unit 'pct': costs as a share of sales, 6 series
export function cashWalkSpec(g: GameState, b: BizState): ChartSpec | null    // kind 'waterfall'
export function cashLinesSpec(g: GameState, b: BizState): ChartSpec | null   // kind 'line': cash and debt, up to 30 years, basis
export function companyKpis(g: GameState, b: BizState, view: MarketView | null): ChartSpec[]   // up to 4 kind 'kpi', one series each: Net profit, Sales, Cash, Value
export function companyStrip(g: GameState): StripRow[]                       // every booked company the player owns, at most 12, best net first
```

**Behaviour.**
- `profitSpec`: rows = `b.history` (at most 30); `x` = years; one series `net` (`Net profit`, tone `c1`) of `profit`; needs at least 2 rows; `basis = priceBasisYear(g)`; summary `Net profit from {first} to {last}: {m} to {m}, best {m} in {year}.` via `fit`.
- `costShareSpec`: uses only rows that have the book fields (`cogs !== undefined`) and `revenue > 0`; returns `null` below 2 such rows (the UI then shows a text line, "History starts {year}"). When older rows lack the fields the spec carries `note: 'Cost detail starts in 2024.'` (the first year that has books). Six series, each `value / revenue` rounded to 4 decimals: `Materials` (cogs, `c1`), `People` (wages + keyStaff + ownerPay, `c2`), `Premises and upkeep` (rent + upkeep, `c3`), `Marketing` (`c4`), `Taxes` (salesTax + tax, `c5`), `Interest and one-offs, net` (max(0, interest + other - otherIncome), `c6`). The UI draws a reference line at 100% of sales for `stack` + `pct`.
- `cashWalkSpec` (opening, flows, closing; ends at the live `b.cash`, the number the report prints as "Company cash"): needs `b.last`, and the history row of `b.last.year - 1` having `cash` (else `null`: UI text "History starts {year}: the cash walk needs two booked years."). Steps: total `Cash at the start` (= previous row `cash`), delta `Net profit` (`s.net`), delta `Inflation on cash` (-`s.cashErosion`, omitted at 0), delta `Change in debt` (`b.debt` minus the previous row `debt` when that exists, omitted at 0), delta `Dividends paid` (-`readDividend(b.dividend)?.last?.paid` when `last.year === s.year`, `business/dividend-policy.ts`), delta `Everything else` (the exact residual, omitted at 0), total `Cash now` (= `Math.round(b.cash)`). Because dividends and the group's late invoices are paid after the books close, the residual also carries last year's dividend and any money moved by hand; `note: "Moves the books don't name yet sit in everything else."` The player's bonus is already inside net profit (`other`), so it is a mark on the `Net profit` row (`Includes your $X bonus`), not a walk step. The identity is exact by construction (the residual is computed). Labels at most 40.
- `cashLinesSpec`: rows with `cash !== undefined`; series `cash` (`c1`) and, if any `debt > 0`, `debt` (`c2`); the last point of each is the live `b.cash` and `b.debt` when the row's year equals `b.last.year` (so the chart ends where the KPI tile and the text row end); at least 2 rows; `basis`.
- `companyKpis`: `x` = last up to 10 years of the matching history field; value is the last point. 1) `Net profit` (`profit`), note: `deltaLabel` against the previous row, or `back in profit`/`into a loss` when the sign flips. 2) `Sales` (`revenue`), note: percent change. 3) `Cash` (live `b.cash` as the last point, earlier `cash` values), note `Debt {m}`. 4) `Value` (`valuation`), note `#{rank} of {n}` from `view` when it is booked (`view.rank`, `1 + view.rivals.length`), else the owner's stake. `unit: 'money'`, `basis` set. Always returns tiles for what exists; a first-year company gets one-point tiles.
- `companyStrip`: for each `businessAssets(g)` asset use `readBiz(g, a)`; skip those with no `b.last`; `net` = `b.last.net`; `delta` against the previous history row; `spark` = last 8 `profit` values; `managed = !runsIt(g, a)`; sorted by `net` descending then name; at most 12.

**Tests** (`test/chart-books.test.ts`).
1. `ownerGame({ years: 8 })`: `profitSpec` has 8 or more points, valid under `readChartSpec`, `basis` set; with `setMoneyDisplay({ nominal: true })` the basis equals `g.year`.
2. 32-year synthetic history (rows copied with years changed) gives exactly 30 points.
3. `costShareSpec`: six series, each point between 0 and the stack total; for a profitable year the stack sum is at most 1 + otherIncome share; rows without book fields are skipped and `note` names the first year with books; an old-save company (fixture) gives `null` or a note, never a throw.
4. `cashWalkSpec`: for 10 seeded companies the first total plus the deltas equals the last total exactly and the last total equals `Math.round(b.cash)`; a company that paid a dividend shows the `Dividends paid` row; one that borrowed shows `Change in debt`; one with a bonus has the mark; no previous row gives `null`.
5. `cashLinesSpec` ends at live cash and debt; debt series omitted when 0.
6. `companyKpis`: 4 tiles for a normal company, 1 point each in year one; deltas right; the rank note only when a booked `view` is passed (hand-built `MarketView` objects in the test; `null` gives the stake note).
7. `companyStrip`: three companies (one owner-run, two hired) give three rows sorted by net, `managed` flags right; no `b.last` skips; at most 12 of 15.
8. All specs are valid, finite and under 120 characters per string; purity on `deepFreeze`d state; hostile history (NaN rows via `normalizeBiz`) never throws.

**Flag.** None. **Hot-file notes.** None. **Depends on.** R1-C1, R1-C3. **Size.** Source about 520 lines; tests about 620. (`MarketView` is a type-only import from `business/competition.ts`, so the file has no runtime edge into the 85-module component.)

---

### R1-C6 Market and ladder builders (share vs leader, rival ladder, generic ladders, scorecards, standing, approval)

**Roadmap items.** G.1 `market.ts`, `ranks.ts`; G.6 builder side; D.5.

**Files.** Create `src/game/charts/market.ts`, `src/game/charts/ranks.ts`, `test/chart-market.test.ts`. Modify `src/game/charts/index.ts`.

**Interfaces.**
```ts
// market.ts
export function shareSpec(g: GameState, view: MarketView): ChartSpec | null                 // 'line' pct: you vs the leader, up to 20 years
export function marketSizeSpec(g: GameState, view: MarketView): ChartSpec | null            // 'kpi' money: market size sparkline
export function marketLadderSpec(g: GameState, view: MarketView, youName: string): ChartSpec | null   // 'ladder'
// ranks.ts
export interface RankSource { id: string; name: string; value: number; prev?: number | null; history?: (number | null)[]; you?: boolean }
export function ladderSpec(o: { title: string; unit: ChartUnit; rows: readonly RankSource[]; higherIsBetter?: boolean; summary?: string; prevRanks?: Readonly<Record<string, number>>; basis?: number }): ChartSpec | null
export function rankChange(rank: number, prevRank: number | null): { dir: -1 | 0 | 1; text: string }   // dir 1 = moved up; 'up 2' | 'down 1' | 'no change' | 'new'
export function scorecardSpec(title: string, rows: readonly ScoreRow[]): ChartSpec | null              // 'meter': x = labels; series mine, market, best
export function standingSpec(title: string, rows: readonly { y: number; rank: number; of: number }[]): ChartSpec | null   // 'line' unit rank, lower is better
export function approvalSpec(reports: readonly { year: number; approval: number }[]): ChartSpec | null  // 'line' pct, 12 years
export function windowRows<T>(rows: readonly T[], isYou: (r: T) => boolean, top?: number, around?: number): T[]  // top 5, then you with 2 neighbours each side, at most 12
```
(`ScoreRow` is `business/scorecard.ts`.)

**Behaviour.**
- The builders take the `MarketView` as an argument (the caller computes `marketViewOf(g, b)` from `business/competition.ts`, which is already pure; `competition.ts` is in the 85-module cycle component, so `src/game/charts/` imports only `type MarketView`); the player's own name is passed in (`a.name`). Tests pass hand-built `MarketView` objects.
- `shareSpec`: `v.history` (up to 20 rows); series `you` (`share`, `c1`) and `leader` (`lead`, `c2`, `null` where absent); needs 2 rows; unit `pct`; summary `Your share {s}, the leader's {l}, from {first} to {last}.`
- `marketSizeSpec`: kind `kpi`, `size` per row, note growth; unit `money`, `basis`.
- `marketLadderSpec`: rows = `v.rivals` (current shares, names already masked by `adultBrandName`) plus you, sorted by share, rank = position; `windowRows` keeps the top 5 and you with 2 neighbours each side; `prev` and `prevRank` come from the previous history row only: its `top` (decoded with `topPairs`) plus its `share` for you; a rival not in last year's top 8 gets `prev: null, prevRank: null` (text "new"); `spark` = that rival's share in each of the last up to 10 history rows (null where absent); never uses `RivalView.trend`. Needs `v.booked`. Unit `pct`. Title `Who holds the {noun} market` (cut to 60).
- `ladderSpec`: sorts rows by value (descending unless `higherIsBetter === false`), assigns rank 1.., computes `prevRank` from `prevRanks` or from `prev` values, keeps `windowRows`, `spark` from `history` (at most 12, last 10 shown). `null` for 0 rows.
- `rankChange`: `up 2`, `down 1`, `no change`, `new`; `dir` is for the glyph (the UI adds an arrow glyph and the word, never colour alone).
- `scorecardSpec`: for `ScoreRow[]` (`mine`, `market`, `best`, `rank`, `of`): kind `meter` with `x` the row labels, three series `Yours`/`Market`/`Best`; the rank text goes in `marks` (`at` = row index, label `3 of 9`).
- `standingSpec`: kit `YearRow`s (`special/kit/state.ts`): `rank` of `of` per year; rows with `rank 0 of 0` are skipped; unit `rank`; at least 2 rows. The UI draws rank charts upside down (1 at the top) when `unit === 'rank'`.
- `approvalSpec`: `p.reports` of `nation/state.ts` (`ReportRow.approval` is 0 to 100): values divided by 100, unit `pct`.

**Tests** (`test/chart-market.test.ts`).
1. A hand-built view with 6 history rows and one with 25: `shareSpec` valid, 6 and 20 points, leader series null in old rows. One real company with 6 booked years (`ownerGame`, `marketViewOf`) is the integration case.
2. `marketLadderSpec`: you plus 8 rivals; row ranks 1..n in share order; `prev`/`prevRank` correct against hand-built previous `top`; a rival absent from last year's top reads `new`; `spark` lengths at most 10; the "you" row is present with `you: true`; with 20 rivals the window is top 5 plus you plus neighbours, at most 12; `RivalView.trend` is never read (give the hand-built rivals a `trend` getter that throws, and assert the source text of `market.ts` does not contain `trend`).
3. A view with `booked: false` returns `null` for the ladder and share.
4. `ladderSpec`: ties, `higherIsBetter: false`, `prevRanks`, 40 rows capped at 12, a single row.
5. `rankChange` four cases. 6. `scorecardSpec` with a `scoreRow(...)` set from `scorecard.ts`; `standingSpec` skips 0 of 0; `approvalSpec` 12 rows.
7. Hostile inputs (NaN values, empty names, 500 rows) give a valid spec or `null`. All specs pass `readChartSpec`. Purity: `deepFreeze` and unchanged `g.rng`.

**Flag.** None. **Hot-file notes.** None. **Depends on.** R1-C1, R1-C3 (S2 `top`). **Size.** Source about 450 lines; tests about 560.

---

### R1-C7 Kit part 1: chart tokens, Frame, Sparkline, KpiTile, Meter, BulletRow

**Roadmap items.** G.2 (tokens, `Frame`, `Sparkline`, `KpiTile`, `Meter`, `BulletRow`, `charts.css`), D.11 criteria 2 and 3.

**Files.**
- Create `src/ui/charts/Frame.tsx`, `Sparkline.tsx`, `KpiTile.tsx`, `Meter.tsx`, `BulletRow.tsx`, `charts.css`.
- Modify `src/ui/styles/global.css`: add the tokens to the `:root` block and to the `@media (prefers-color-scheme: dark)` block (own hunk each, after the `--hint-*` lines).
- Create `test/chart-contrast.test.ts` (cross-check: not an edit of `test/ui-contrast.test.ts`, which R1-A7 owns) that imports `readThemeTokens` and `contrastRatio` from the kit R1-A7 already created at `test/contrast-kit.ts` (this task does not create or edit the kit; if A7 has not merged, C7 waits).
- Create `test/chart-ui-frame.test.ts`.

**Tokens** (measured, WCAG ratios on `--card` / `--bg`; all at least 3:1 on `--card-2` too):

| Token | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `--chart-1` blue | #0072B2 | 5.19 / 4.61 | #56B4E9 | 7.17 / 8.08 |
| `--chart-2` vermillion | #C0480A | 5.03 / 4.48 | #F08A4B | 6.65 / 7.49 |
| `--chart-3` green | #007A5A | 5.34 / 4.75 | #2FC79A | 7.69 / 8.66 |
| `--chart-4` purple | #9B4F86 | 5.45 / 4.84 | #E39AC8 | 7.66 / 8.63 |
| `--chart-5` amber | #8A6A00 | 5.07 / 4.51 | #E6B422 | 8.60 / 9.69 |
| `--chart-6` slate | #4C5A6E | 7.01 / 6.24 | #A9B6C8 | 8.05 / 9.06 |
| `--chart-good` | #177638 | 5.70 / 5.07 | #5FD38A | 8.80 / 9.92 |
| `--chart-bad` | #C5302B | 5.48 / 4.87 | #FF7D75 | 6.65 / 7.49 |
| `--chart-grid` | `var(--border)` | not a mark | `var(--border)` | not a mark |

The roadmap reuses `--action-green` and `--action-red` for good and bad bars. That is right in light mode but wrong in dark mode, where those tokens stay #177638 (2.90 on `--card`) and #B72D27 (2.69): they fail 3:1. Hence the dedicated `--chart-good` and `--chart-bad` (see Plan vs code 5). `muted` tone uses `--muted`, `good` and `bad` tones use the two new tokens.

**Interfaces.**
```ts
// Frame.tsx
export interface FrameProps { spec: ChartSpec; children: ReactNode; readout?: string; tableOpen?: boolean; className?: string }
export function Frame(p: FrameProps): JSX.Element
export interface FrameIds { title: string; summary: string }
export const FrameContext: React.Context<FrameIds | null>        // plots read it to wire aria-labelledby / aria-describedby
export function legendOf(spec: ChartSpec): { id: string; label: string; tone: ChartTone; shape: MarkerShape }[]
// Sparkline.tsx
export interface SparklineProps { values: readonly (number | null)[]; tone: ChartTone; label: string; fmt?: (n: number) => string; width?: number; height?: number }   // Navigation's C-TILE shape plus optional extras
export function sparkLabel(label: string, values: readonly (number | null)[], fmt: (n: number) => string): string   // 'Net profit: first $40K, last $1.2M, low $40K, high $1.2M'
export function Sparkline(p: SparklineProps): JSX.Element | null     // null with fewer than 2 finite points
// KpiTile.tsx
export interface KpiTileProps { label: string; value: string; note?: string; delta?: { text: string; dir: 'up' | 'down' | 'flat'; good: boolean | null }; values?: readonly (number | null)[]; tone: ChartTone; onPress?: () => void }   // Navigation's C-TILE contract
export function kpiPropsOf(spec: ChartSpec, seriesIndex?: number): KpiTileProps   // last non-null value of the series, delta against the previous non-null, note, values = the series; good = null unless the caller decides
export function KpiTile(p: KpiTileProps): JSX.Element
// Meter.tsx
export interface MeterProps { label: string; value: number; min: number; max: number; valueText: string; bands?: { to: number; tone: ChartTone }[] }
export function Meter(p: MeterProps): JSX.Element
// BulletRow.tsx
export interface BulletRowProps { label: string; mine: number; market?: number; best?: number; min: number; max: number; valueText: string; rankText?: string }
export function BulletRow(p: BulletRowProps): JSX.Element
```

**Behaviour.**
- `Frame`: `<figure className="ch-frame" role="group" aria-labelledby={ids.title} aria-describedby={ids.summary}>` with `<h4 id className="ch-title">`; a chip `<span className="ch-chip">prices of {basis}</span>` when `spec.unit === 'money' && spec.basis !== undefined`; the plot (`children`); a legend (list with a marker shape and label per series, shown when there are 2 or more series or kind `stack`); a readout row `<p className="ch-readout" aria-live="polite">` (`readout` prop, default `spec.summary`); the summary as visually hidden text with the summary id; a `button.ch-toggle` "Show as table" / "Hide table" (`aria-expanded`, `aria-controls`, 44 px high) that opens `<table className="ch-table">` built from `specTable(spec)` with `<caption>`, `<th scope="col">` and `<th scope="row">`. State via `useState(tableOpen ?? false)`; ids via `useId`. (Plan vs code 4: the roadmap puts `role="img"` on the figure; children of an image role are presentational, so the toggle would be unreachable. The role belongs on the plot, set by C8/C9; the figure is a labelled group.)
- `Sparkline`: 24 px tall `<svg role="img" aria-label={sparkLabel(...)}>` with one path and an end dot, `viewBox` 0 0 80 24, scales to its container (`width: 100%`, `max-width: 120px`), no axes. Points are scaled with `extentOf`; nulls break the path. Default `fmt` rounds to 3 significant digits; money callers pass `shortMoney`, share-price callers pass `formatPrice`.
- `KpiTile`: `<div className="ch-kpi">` (a `<button>` of at least `var(--target)` height when `onPress` is given, so the cockpits can open a screen from a tile) with label, value (large), delta line with an ASCII sign and a word for screen readers (`<span aria-hidden>+</span> $310K <span className="ch-sr">up</span>`; `good` true or false adds the good or bad tint, `null` stays neutral), `note`, and the sparkline from `values`. Two tiles a row on a phone (CSS grid, `min-width: 0`). `tone` tints the sparkline.
- `Meter`: `<div role="meter" aria-valuemin aria-valuemax aria-valuenow aria-valuetext aria-label>` with a track, a fill and tick marks at band edges; the value text is always visible. `BulletRow`: `<div role="img" aria-label="Yours 71, market 64, best 78, rank 3 of 9">` with a bar for yours, a tick for the market mean, a tick for the best.
- `charts.css`: classes prefixed `ch-`; tone classes `ch-tone-c1` to `ch-tone-c6`, `ch-tone-good`, `ch-tone-bad`, `ch-tone-muted` set `color`, `stroke` and `fill` from the tokens; `.ch-sr` visually hidden; every interactive element at least `var(--target, 44px)` high and the focus ring uses `var(--focus-ring, currentColor)` (a11y R1-A7 defines both); `min-width: 0` everywhere; no fixed pixel width above 328; `@media (prefers-reduced-motion: no-preference)` holds the only animation (a 300 ms line draw); `@media (max-width: 374px)` tightens padding; no hex colour literal in this file.

**Tests.**
- `test/chart-contrast.test.ts` (imports the shared kit; do not copy the parser): for both themes, `--chart-1` to `--chart-6`, `--chart-good`, `--chart-bad` reach 3:1 on `--card`, `--bg` and `--card-2`; `--chart-good` and `--chart-bad` in dark are different from the `--action-*` values; the existing text-pair cases of `test/ui-contrast.test.ts` stay green (run both files). Proves D.11.3 for the chart tokens.
- `test/chart-ui-frame.test.ts` (all with `createElement` + `renderToStaticMarkup`): (1) `Frame` markup has `role="group"`, `aria-labelledby` and `aria-describedby` pointing at ids that exist, the title, the chip only for a money spec with `basis`, a toggle button with `aria-expanded="false"`, and with `tableOpen` a real `<table>` with a `<caption>` and as many body rows as `x`; (2) legend: one entry and one distinct shape per series for a 6-series spec; (3) `Sparkline` label states first, last, low, high; returns `null` for 0 and 1 points; no `NaN` in the markup for constant, all-null and 1e15 inputs; (4) `kpiPropsOf` for rising, falling, flat, one-point and all-null specs and for `seriesIndex` 1 of a 2-series spec; the tile shows `+`, `-` or `=` and the word up, down or no change; with `onPress` the tile is a `button`; (5) `Meter`/`BulletRow` aria attributes, value text visible; (6) `countSvgNodes` below 150 for each; (7) no markup contains `undefined`, `NaN`, `[object Object]`; (8) `charts.css` text contains `prefers-reduced-motion`, no `#` colour literal and no `width: 3[3-9][0-9]px` or larger.

**Flag.** None. **Hot-file notes.** `global.css`: two additive hunks inside the existing token blocks, after the `--hint-*` lines (R0-11 edits `--muted`, `--tone-*`, `--age-heading` higher up; G.12 edits `--header-from`; no overlap). `test/ui-contrast.test.ts` is not touched (R1-A7 owns it).
**Depends on.** R1-C1, R1-C2, R0-11 (and a11y R1-A7's `--target` and `--focus-ring` for the final look; the CSS fallbacks make it independent). **Size.** Source about 800 lines (components 480, css 240, tokens 80); tests about 520.

---

### R1-C8 Kit part 2: LineChart, BarChart (stacked), Waterfall

**Roadmap items.** G.2 `LineChart`, `BarChart`, `Waterfall`; D.4 "rows, not columns".

**Files.** Create `src/ui/charts/LineChart.tsx`, `BarChart.tsx`, `Waterfall.tsx`; modify `src/ui/charts/charts.css` (append); create `test/chart-ui-plots.test.ts`.

**Interfaces.**
```ts
export interface PlotProps { spec: ChartSpec; scrub: ScrubApi }
export function LineChart(p: PlotProps): JSX.Element                       // kinds 'line' and 'timeline' share the geometry; Timeline (C9) wraps it
export function BarChart(p: PlotProps & { stacked?: boolean }): JSX.Element // kinds 'bars' and 'stack'
export function Waterfall(p: { spec: ChartSpec; scrub?: ScrubApi }): JSX.Element   // kind 'waterfall', rows
```

**Behaviour.**
- All three read `FrameContext` for `aria-labelledby`/`aria-describedby`. The focusable element is an HTML wrapper `div.ch-plot` with the scrub handlers, `role="slider"`, `aria-valuemin=0`, `aria-valuemax=n-1`, `aria-valuenow=index`, `aria-valuetext={readoutFor(spec, index)}` and `aria-label` from the title (the arrow keys, Home and End then have a defined meaning for assistive technology; an image role has presentational children and no keyboard semantics, so the roadmap's `role="img"` plus keys would be poor ARIA). The SVG inside is `aria-hidden`.
- `LineChart`: `viewBox="0 0 320 180"`, `width: 100%`; margins left 44, right 56, top 8, bottom 22; y ticks from `niceTicks(min, max, 4, moneyScale())` when `unit === 'money'` (so a yen axis reads round in yen), grid lines in `--chart-grid`, a zero line when the range crosses 0; one `<path>` per series in its tone; a marker (shape by series index) at the last point and at the cursor; the cursor is a vertical line; end labels at the right (value text) separated with `dodgeLabels` so two series never overprint; x labels from `xTicks(spec.x, 6)`; `unit === 'rank'` flips the y axis (1 at the top); nothing animates except the `no-preference` line draw. At most 6 paths, 12 markers, 2 x 6 ticks plus 2 x 5: well under 150 elements.
- `BarChart`: one column per x (up to 64; 30 years fit in 328 px at 9 px per column with a 2 px gap), stacked with `stackLayout` (negatives go below the axis), each series is one `<path>` whose `d` holds one rectangle per column (so 30 columns x 6 series is 6 elements, not 180, and the cap of 150 holds with room; the test asserts it with 64 x 6), `stack` with `unit === 'pct'` draws a labelled reference line at 100% ("100% of sales"), a rect outline marks the cursor column.
- `Waterfall`: an `<ol className="ch-wf" aria-label={spec.summary}>` of `<li>` rows, 44 px high, each two lines: line 1 an ASCII sign glyph in `aria-hidden` (`=` for totals, `+` or `-` for deltas), the label, and the amount (`formatUnit`); line 2 a bar `<svg aria-hidden viewBox="0 0 100 8" preserveAspectRatio="none">` drawn from `waterfallLayout` on a common scale (floating bars: each delta starts where the running level was, so a cost visibly eats the sales; totals start at 0); the bar uses `--chart-good` for gains and totals above 0, `--chart-bad` for costs and totals below 0, `--chart-6` for neutral totals. A visually hidden sentence per row ("Materials and direct costs, minus $3.9M, 40% of sales after tax"). A `marks` entry with `at` equal to a row index prints as a small note line under that row. Keyboard: the `<ol>` is focusable (`tabIndex=0`), arrow keys move a highlighted row and the readout shows the running total at that row. One `svg` and one `rect` (plus an optional zero line) per row: at most 20 x 3 = 60 elements.
- All amounts go through `formatUnit`/`formatSigned` (live bound money context).

**Tests** (`test/chart-ui-plots.test.ts`, `createElement` + `renderToStaticMarkup`, `useScrub` called through a tiny wrapper component; under 30 seconds).
1. Each plot renders for a spec of each supported kind with role `slider` (or the `ol`), `aria-valuemax` equal to `n - 1`, labelled and described ids resolving inside a `Frame`.
2. `countSvgNodes` at most 150 for: a 6-series x 64-point line, a 30 x 6 stack, a 20-step waterfall.
3. No `NaN`/`undefined` in markup for: empty series, one point, constant series, all nulls, negative-only, 1e15 values.
4. Waterfall markup of a `plSpec`-shaped spec: one `li` per step, sign glyph `=` on the three totals, `-` on costs, a hidden sentence on every row, bar widths proportional on one scale (parse the `width`/`x` attributes: the longest bar is the largest absolute level), the totals' bars start at 0.
5. Stack with `unit: 'pct'` has the 100% reference; a rank-unit line flips.
6. Dodge: two series ending within 3 px get end labels at least 12 px apart (via `dodgeLabels`, tested in C2 and asserted in markup here).
7. Frozen props (`deepFreeze(spec)`) render.

**Flag.** None. **Hot-file notes.** `charts.css` append only. **Depends on.** R1-C2, R1-C7. **Size.** Source about 650 lines; tests about 560.

---

### R1-C9 Kit part 3: RankLadder, Timeline, ChartView (dispatcher), the lazy gate, barrel

**Roadmap items.** G.2 `RankLadder`, `Timeline`; the kit entry points; G.14 lazy seam (the kit "loads lazily", D.2), a11y R1-A8 contract.

**Files.** Create `src/ui/charts/RankLadder.tsx`, `Timeline.tsx`, `ChartView.tsx`, `lazy.tsx`, `index.ts`; modify `charts.css` (append); create `test/chart-ui-ladder.test.ts`.

**Interfaces.**
```ts
// RankLadder.tsx
export function RankLadder(p: { spec: ChartSpec }): JSX.Element            // spec.rows
// Timeline.tsx
export function Timeline(p: PlotProps): JSX.Element                         // net worth by age: an area under the line, marks as flags
// ChartView.tsx (named and default export: a11y's lazyView needs the default)
export function ChartView(p: { spec: ChartSpec; className?: string }): JSX.Element   // Frame + the plot for spec.kind, owns useScrub
export default ChartView
// lazy.tsx: the only file outside the zone that other code may import (a11y zone rule). Views made with lazyView from '../lazy/lazyView'.
export const ChartViewLazy: LazyView<{ spec: ChartSpec; className?: string }>     // lazyView('chart', () => import('./ChartView'))
export function LazyChartView(p: { spec: ChartSpec | null; fallback?: ReactNode }): ReactElement | null   // null-safe wrapper: a null spec renders only the fallback
export const LazySparkline: LazyView<SparklineProps>                             // lazyView('sparkline', () => import('./Sparkline').then((m) => ({ default: m.Sparkline })))
export const LazyKpiTile: LazyView<KpiTileProps>                                 // same pattern over KpiTile
// R1-C11 appends LazyReportBook, R1-C12 appends LazyYearEndDesk, each in its own hunk.
// index.ts re-exports the static components and the types: the barrel for tests only (code outside src/ui/charts/ must use lazy.tsx).
```
`lazy.tsx` imports only `lazyView` (from `../lazy/lazyView`) and `import type` from the kit; every kit module is reached through `import(...)`.

**Behaviour.**
- `RankLadder`: `<ol className="ch-ladder" aria-label={spec.summary}>`; each `<li>` is `var(--target)` (44 px) high: rank (`#3`), name (the player's row has a "you" pill and `aria-current="true"`), value (`formatUnit(spec.unit, value)`), change (`rankChange(rank, prevRank)`: a glyph plus words, "up 2", "down 1", "no change", "new"; glyphs U+25B2 (up), U+25BC (down) and U+25AA (flat), as `dashboard.ts` `trend()` uses), and a `Sparkline` of the row's `spark`. Gaps between the top 5 and the "you" window show a "..." row. No colour-only encoding. At most 12 rows x 4 elements.
- `Timeline`: the `LineChart` geometry with one series plus a filled area to the zero line (`fill-opacity` 0.12), `marks` drawn as short flags with their labels (at most 8, dodged), x labelled as "age 30"; the chip comes from `Frame`.
- `ChartView`: `useScrub(spec.x.length)`; `switch (spec.kind)`: `line` to `LineChart`, `bars` and `stack` to `BarChart`, `waterfall` to `Waterfall`, `ladder` to `RankLadder`, `timeline` to `Timeline`, `meter` to a list of `BulletRow` (one per x, series `mine`/`market`/`best`, `marks` text as `rankText`) inside a `Frame`, and `kpi` to **one `KpiTile` per series** in a two-column grid with no Frame (the contract Navigation relies on: value is the last non-null of `values`, delta is last against the previous non-null, the sparkline is `values`, `x` labels the points). The Frame readout is `readoutFor(spec, scrub.index)`. Unknown kind: renders the summary paragraph only.
- `LazyChartView`: `spec === null` renders the fallback (or `null`); otherwise `<ChartViewLazy spec fallback />`. Until the chunk is ready the fallback shows (callers pass their text row), and after a failed load a11y's `LazyFailure` message shows under it. The kit chunk is about 30 KB minified (10 KB gzipped).

**Tests** (`test/chart-ui-ladder.test.ts`).
1. `RankLadder` for a 9-row spec: `ol` with 9 `li`, the "you" row marked, change text per row, sparklines only where `spark` has 2 or more points; a row with `prevRank: null` shows the word `new`; every change cell carries words, never only a glyph or a colour class.
2. `Timeline`: marks appear with labels, at most 8, flags dodged; `NaN`-free for a 3-point series and a 64-point series.
3. `ChartView` renders each of the 8 kinds from a hand-built spec with the expected role or tag; a `kpi` spec with 3 series renders 3 tiles; unknown kind falls back; `countSvgNodes` at most 150 for each.
4. Lazy gate: before `await ChartViewLazy.preload()` the markup of `LazyChartView` is the fallback and contains none of the chart markup; after the preload it contains the `Frame`; a null spec renders the fallback only; `LazySparkline` and `LazyKpiTile` likewise. `lazy.tsx` has no static runtime import under `src/ui/charts/` (read the file text; a11y's zone test is the permanent guard).
5. The barrel exports the expected names (a snapshot of `Object.keys`).
6. `deepFreeze`d spec renders.

**Flag.** None. **Hot-file notes.** `charts.css` append only.
**Depends on.** R1-C8, a11y R1-A8. **Size.** Source about 560 lines (RankLadder 140, Timeline 130, ChartView 120, lazy 50, index 30, css 90); tests about 450.

---

### R1-C10 Report assembler: `data.chart` for the Annual Report

**Roadmap items.** G.4 builder side (D.4 "the builder adds `data.chart`, read defensively"), D.11 criterion 4 (`data.chart`).

**Files.**
- Create `src/game/charts/report.ts`; modify `src/game/charts/index.ts`.
- Modify `src/game/business/yearly.ts` (`reportData`, one hunk; import `flagOn` from `../flags`, `reportCharts` from `../charts/report`).
- No edit to `src/game/types.ts`: R1-P2 adds `AnnualReportData.chart?: Json` (cross-check). If it is missing from your base, R1-P2 has not merged: stop and tell the lead.
- Create `test/chart-report.test.ts`, `test/chart-purity.test.ts`.

**Interfaces.**
```ts
// charts/report.ts
export interface ReportCharts {
  v: 1; year: number; basis: number
  verdict: string                       // at most 120
  kpis: ChartSpec[]                     // at most 4, kind 'kpi', one series each
  summary: ChartSpec                    // condensed waterfall (plSummarySpec)
  pl: ChartSpec                         // full waterfall (plSpec)
  bridge?: ChartSpec; profit?: ChartSpec; costs?: ChartSpec; cash?: ChartSpec
  cashLines?: ChartSpec; share?: ChartSpec; ladder?: ChartSpec; size?: ChartSpec
}
export function reportCharts(g: GameState, a: Asset, b: BizState, view: MarketView | null): ReportCharts | null   // b is a normalized copy (readBiz); view is marketViewOf(g, b) or null
export function readReportCharts(json: unknown): ReportCharts | null
// types.ts
export interface AnnualReportData { /* existing */ chart?: Json }
```

**Behaviour.**
- `reportCharts`: returns `null` when `b.last` is null or `plSpec`/`plSummarySpec` is null. Each other member is built inside its own try/catch, so one builder bug drops one member and never the report. Every member passes `readChartSpec` before it is included. The market members (`share`, `ladder`, `size`, the `Value` tile's rank note) use `view` and are skipped when it is `null` or not booked. No RNG, no writes. It imports only the C4 to C6 builders, `type MarketView` and `type`s from `business/state.ts`.
- `readReportCharts`: object with `v === 1`; `pl` and `summary` must be valid specs or the whole value is `null`; `kpis` keeps the valid entries (at most 4); each optional member is kept only if `readChartSpec` accepts it; `verdict` is a string of at most 120 characters else `''`; `year` and `basis` integers in range else `null`. Arrays and strings are length-checked first (a hostile blob costs O(1)).
- `reportData` hunk: `const chart = flagOn('annualReport2') ? reportCharts(g, a, readBiz(g, a), marketViewOf(g, b)) : null` and `...(chart ? { chart: toJson(chart) } : {})` in the returned object. `readBiz` returns a normalized copy, so a damaged saved history never reaches a builder (the yearly loop's `bizOf` view is not re-normalized); `marketViewOf`, `readBiz` and `toJson` are already imported in `yearly.ts`. The group-services refresh loop that re-calls `reportData` (yearly.ts, "Refresh already queued statements") keeps working unchanged. `techReportData` (deep tech, `deeptech-sim.ts`) is not touched: the deep-tech report stays text this release, as D.4 says (Plan vs code 7).
- The chart data adds about 1,300 JSON nodes to a queued report; it is dropped with the modal.

**Tests.**
- `test/chart-report.test.ts` (uses `ownerGame` with 8 years, then `reportData`; every case sets the flag explicitly with `withFlags`): (1) `annualReport2` off: `reportData(...)` has no `chart` key and every other key is exactly what v4.0.2 builds (compare against the same call with the `chart` key removed). (2) On: `readReportCharts(toJson(reportData(...).chart))` is non-null; `kpis` has 4; the `Net profit` tile's last value equals `b.last.net`; `pl` last total equals `b.last.net`; `summary` last total equals it too; `cash` last total equals `Math.round(b.cash)`; the `Cash` tile value equals `b.cash`; the `Value` tile equals `b.valuation`. (3) JSON size under 3,000 nodes (`jsonNodes`). (4) Hostile `readReportCharts` table: `null`, strings, arrays, wrong `v`, `pl` NaN, 6-member junk, 10,000 kpis, `__proto__`; partial: one broken optional member is dropped, the rest kept. (5) Calling `reportData` twice for one company returns equal data (the group-services refresh in `yearlyBusinessImpl` re-calls it); with two companies formed into a group (`formGroup`, as `test/business-expansion.test.ts` does) a yearly pass leaves a valid `data.chart` on the queued report. (6) First-year company (no `b.last`): no `chart` key. (7) The v4.0.2 fixture companies: `reportCharts` is non-null where `b.last` exists, `cash`/`costs` absent, `profit` present. (8) A deep-tech company's `techReportData` has no `chart`. (9) `reportCharts(g, a, b, null)` builds without the market members.
- `test/chart-purity.test.ts`: over `statementSamples([21])` (56 companies) and `ownerGame`, every builder of C4, C5, C6 and `reportCharts` runs on `deepFreeze(structuredClone(g))` without throwing, returns `null` or a spec that `readChartSpec` accepts, and leaves `g.rng` and `JSON.stringify(g)` unchanged. (C15 adds `netWorthSpec` to this file.)

**Flag.** `annualReport2` (Platform's key). **Hot-file notes.** `yearly.ts`: one hunk in `reportData` plus two import lines (third hunk of the track in this file, separate from the two of R1-C3); `types.ts`: none (R1-P2).
**Depends on.** R1-C4, R1-C5, R1-C6, Platform R1-P3. **Size.** Source about 260 lines (report.ts 230, hunks 30); tests about 520.

---

### R1-C11 Annual Report 2.0: the five-tab book (Summary, P&L, Cash, Market, Plan)

**Roadmap items.** G.4 (D.4 phone layout), D.8 (accessibility of the report), D.11 criteria 2, 4, 13.

**Files.**
- Create `src/ui/charts/ReportBook.tsx` (the book; inside the zone, loaded lazily) and `src/ui/minigames/bookModel.ts` (pure, imports nothing under `src/ui/charts/`).
- Modify `src/ui/charts/lazy.tsx` (append `LazyReportBook`).
- Modify `src/ui/minigames/AnnualReport.tsx` (parse `data.chart`, build the plan body once, choose the layout).
- Modify `src/ui/components/ModalHost.tsx` (`MinigameCard`: one `className` argument).
- Modify `src/ui/styles/business.css` (append the book styles).
- Create `test/report-book.test.ts`; keep `test/annualReport.test.ts` green unchanged.

**Interfaces.**
```ts
// bookModel.ts (pure)
export const BOOK_TABS: readonly ['summary', 'pl', 'cash', 'market', 'plan']
export type BookTab = (typeof BOOK_TABS)[number]
export const TAB_LABELS: Record<BookTab, string>      // 'Summary' 'P&L' 'Cash' 'Market' 'Plan'
export const TAB_NAMES: Record<BookTab, string>       // accessible names: 'Profit and loss' for pl
export function tabKey(current: BookTab, key: string): BookTab   // ArrowLeft/ArrowRight wrap, Home, End; other keys return current. Delegates to rovingMove (src/ui/a11y/roving.ts) with Right mapped to Down and Left to Up
export interface BookHead { businessName: string; emoji: string; year: number | null; industryLabel: string; location: string; marketNote: string; lines: { label: string; value: string; tone: 'good' | 'bad' | 'neutral' }[] }
export function missingNote(tab: BookTab, charts: ReportCharts): string | null   // 'History starts 2024.' ... for absent parts
export function isBook(data: Json): boolean                                      // true when data.chart reads as ReportCharts
// AnnualReport.tsx
export interface ReportView { /* existing */ charts: ReportCharts | null }
// ReportBook.tsx (default export for the dynamic import)
export interface ReportBookProps { head: BookHead; charts: ReportCharts; plan: ReactNode; actions: ReactNode; strip?: StripRow[]; initialTab?: BookTab }
export function ReportBook(p: ReportBookProps): JSX.Element
export default ReportBook
// lazy.tsx (append)
export const LazyReportBook: LazyView<ReportBookProps>       // lazyView('report-book', () => import('./ReportBook'))
```
`MinigameProps` (`ui/minigames/types.ts`) gets an optional `strip?: StripRow[]` in R1-C12; `AnnualReport` forwards it.

**Behaviour.**
- `readReportData` adds `charts: readReportCharts(d.chart)`; a missing or damaged chart gives `null` and the screen is exactly today's text layout. `AnnualReport` keeps all of its state (`price`, `production`) and builds three pieces of JSX once: `planBody` (the talent instinct box, the two sliders and the projection with its "Estimate" badge, untouched), `actions` (the two buttons with the existing handlers) and `layout` (today's whole layout, existing JSX moved into a constant). With `r.charts === null` it returns `layout`. With charts it returns `<LazyReportBook head charts plan={planBody} actions strip fallback={layout} />`: the text layout is also the loading state, the server render and the state after a failed chunk load (a11y's `lazyView` adds a retry message). `MinigameCard` passes `className="is-report"` to `PopupFrame` only when `isBook(modal.data)` is true, so a report without charts keeps today's padded card. While the chunk loads, the text layout shows inside the full-bleed card, so `.popup.is-report .annual-report` gets 16 px padding.
- Layout (360 to 480 px): the popup becomes full height (`.popup.is-report`: `max-width: 480px; height: 100%`; under 520 px `.popup-backdrop:has(.popup.is-report)` loses its padding and the card its radius so the book supplies its own 16 px gutters; at 520 px and above the card is `min(100%, 860px)` high and centred). The popup's own title `h2` is visually hidden (the dialog is already labelled). `.popup.is-report .popup-scroll` has no padding.
  - Sticky header, 48 px: `{year} Annual Report` and the company (emoji, name, truncated).
  - Sticky tab row under it: `role="tablist"`, five `role="tab"` buttons `var(--target)` (44 px) high that scroll sideways (`overflow-x: auto`, `scroll-snap-type: x proximity`, hidden scrollbar), `aria-selected`, `aria-controls`, roving `tabIndex` (`rovingStop`), keys from `tabKey`. Only the active `role="tabpanel"` is rendered. On a tab change the panel scrolls to the top.
  - Sticky bottom bar: the `actions` (two 48 px buttons side by side, "Approve plan" and "Keep last year's plan", wrapping to two lines if needed), `padding-bottom` includes the safe-area inset.
- **Summary:** a 2 x 2 grid of `KpiTile` from `charts.kpis`; the `verdict` line; `ChartView` of `charts.summary` (top 5 drivers); a strip of the player's companies when `strip` has 2 or more rows (C12); a `<details>` "All the numbers" holding the existing statement lines (units sold, spoiled, morale, supply lines and the rest stay available).
- **P&L:** `pl`; `bridge` ("Why profit changed") when present; `profit`; `costs`. Missing parts show their `missingNote`.
- **Cash:** `cash` (the walk, with its footnote) and `cashLines`; when the walk is absent: "History starts {year}: the cash walk needs two booked years."
- **Market:** the market note text; an "Estimate" badge (the existing `ar-badge` class; the Plan tab keeps its own on the projection) because shares are approximate; `share`, `ladder`, `size`. Absent: "The market fills in after a booked year."
- **Plan:** `planBody` exactly as today.
- Inside the book, charts render with `ChartView` directly (a static import: the book is already in the lazy chunk).
- Dark mode and light follow tokens only. No hover-only information.

**Tests** (`test/report-book.test.ts`; store mocked like `test/annualReport.test.ts`; flag-independent, because the book is driven by `data.chart`).
1. `tabKey` table (ArrowRight wraps from plan to summary, ArrowLeft from summary to plan, Home, End, unknown).
2. `ReportBook` rendered directly with each `initialTab`: exactly one `role="tabpanel"`, the matching `aria-selected="true"`, five tabs, one `tabindex="0"` among them, the sticky header text `2031 Annual Report`, the actions present, the plan tab contains the slider markup (`ar-range`).
3. Summary: four KPI tiles; the `<details>` holds the statement lines; the strip appears only with 2 or more rows.
4. Absent parts show their notes (build `ReportCharts` with only `pl`/`summary`).
5. `AnnualReport(props)` (the function, as `renderReport` in `annualReport.test.ts` calls it): with no `chart` the markup equals today's; with a hostile `chart` (`'x'`, `{}`, `{v: 1, pl: 'x'}`) it equals today's and does not throw; with a valid `chart`, before `await LazyReportBook.preload()` the server render is today's text layout and contains "Approve plan", and after the preload it contains the five tabs; `click('Approve plan')` and `click('Keep last year')` on the chart-less layout still report `planResult(...)` and `SKIP_RESULT`.
6. `readReportData` returns `charts: null` for every `MALFORMED` entry of the existing test and non-null for a valid blob; `isBook` agrees with it.
7. CSS guard: `business.css` contains `.popup.is-report`, `position: sticky` for the header, tabs and actions, `overflow-x: auto` for the tabs, and no fixed width above 328 px in the new rules.
8. `countSvgNodes` of every tab's markup at most 150 per chart (call `renderHtml` per panel).
The visual check (390 x 844, light and dark) is R1-C16.

**Flag.** None in the UI (the data is gated by `annualReport2` in R1-C10); with the flag off no `chart` exists and nothing changes.
**Hot-file notes.** `AnnualReport.tsx`: the render function is restructured by extracting three JSX constants (existing JSX moved, not rewritten) plus one branch, about 60 changed lines in the component and 25 in `readReportData`; `ModalHost.tsx`: one added prop on one `PopupFrame` call (R1-C12 edits the same function in a separate hunk, later); `business.css`: append only; `lazy.tsx`: one appended export.
**Depends on.** R1-C9, R1-C10, a11y R1-A6. **Size.** Source about 950 lines (ReportBook 380, bookModel 90, AnnualReport hunks 90, css 260, lazy 10, tiles and strip glue 120); tests about 600.

---

### R1-C12 Year-End Desk and the company strip

**Roadmap items.** G.4 Year-End Desk (D.4), D.7.

**Files.**
- Create `src/ui/minigames/yearEnd.ts` (pure) and `src/ui/charts/YearEndDesk.tsx` (inside the zone).
- Modify `src/ui/charts/lazy.tsx` (append `LazyYearEndDesk`).
- Modify `src/ui/components/ModalHost.tsx` (`MinigameCard`).
- Modify `src/ui/minigames/types.ts` (optional `strip` on `MinigameProps`), `src/ui/minigames/AnnualReport.tsx` (forward `strip` to the book).
- Modify `src/ui/styles/business.css` (append).
- Create `test/year-end-desk.test.ts`.

**Interfaces.**
```ts
// yearEnd.ts (pure)
export interface DeskBatch { year: number; total: number }
export function reportsIn(queue: readonly ModalItem[]): { id: string; year: number | null }[]      // minigame items with game 'annualReport', in queue order
export function nextBatch(prev: DeskBatch | null, reports: readonly { id: string; year: number | null }[]): DeskBatch | null   // keeps the largest total seen for the same year; null when no reports remain
export function deskPosition(batch: DeskBatch | null, remaining: number): { index: number; of: number } | null   // index = total - remaining + 1; null below 2 total
export const KEEP_ALL_LABEL = 'Keep every plan'
// YearEndDesk.tsx (default export)
export interface YearEndDeskProps { year: number | null; position: { index: number; of: number }; strip: StripRow[]; currentName: string; onKeepAll: () => void; children: ReactNode }
export function YearEndDesk(p: YearEndDeskProps): JSX.Element
// lazy.tsx (append)
export const LazyYearEndDesk: LazyView<YearEndDeskProps>     // lazyView('year-end-desk', () => import('./YearEndDesk'))
// types.ts
export interface MinigameProps { modal: MinigameModal; onDone: (result: string) => void; strip?: StripRow[] }
```

**Behaviour.**
- `MinigameCard` (ModalHost): for `modal.game === 'annualReport'` it reads the game (`useApp((s) => s.game)`, already used by `ModalHost`) and computes with `useMemo`: `strip = companyStrip(game)` (R1-C5, pure), `reports = reportsIn(game.queue)`. It keeps the desk batch in a `useRef<DeskBatch | null>` and recomputes `ref.current = nextBatch(ref.current, reports)` during render (the function is idempotent for one input, so React's double render is harmless); no store change. With `flagOn('annualReport2')` and `deskPosition(...)` non-null (two or more reports in this year's batch) it renders `<LazyYearEndDesk ... fallback={body}>{body}</LazyYearEndDesk>`, where `body` is the report component as today; otherwise `body`. `strip` is also passed to the report as `MinigameProps.strip`.
- Desk: a header block above the book (it scrolls away, so only the book's header and bars are sticky): "Year-End Desk, 2031" and the stepper "2 of 6" (`aria-label="Report 2 of 6"`), the company strip (a horizontally scrolling row of chips: emoji, name, net profit with an ASCII sign, the change, a `Sparkline`; the current company has `aria-current="step"`), and one text button **Keep every plan** (`KEEP_ALL_LABEL`) that calls the existing `finishMinigame(id, 'skip')` for every id returned by `reportsIn(queue)` and nothing else, so no plan logic is touched. (Plan vs code 6: the roadmap names the button "Approve every suggested plan", but `'skip'` means "keep last year's plan" (`REPORT` script, `parsePlan`), not "use the suggested price", so the honest label is "Keep every plan".) `finishMinigame` is called in a plain loop; each call clones and saves the state once (`handleModal`), fine for the rare batch.
- With exactly one report, the book's Summary tab shows the strip when the player owns two or more booked companies (this is the real-play case: Plan vs code 6). With one company nothing extra shows.
- The desk is dormant in v4.0.2 play: only one company can be owner-run (`becomeCeo` hands any other company to a general manager, `business/career.ts`), a manual `queueReport` cannot run while the queue is not empty (`runMenuAction`), so one annual report queues a year. It is built and tested with synthetic queues, and ready for releases that queue more.

**Tests** (`test/year-end-desk.test.ts`; store mocked as in `annualReport.test.ts` with `finishMinigame` as a spy; flags set with `withFlags`).
1. `reportsIn` picks only `annualReport` minigames, in order, with their `year`; `nextBatch`/`deskPosition` sequence: 6 reports then 5, 4 ... 1 give "1 of 6" ... "6 of 6"; a new year resets; 1 report gives `null`; the batch keeps the largest total.
2. `YearEndDesk` rendered directly: stepper text, `aria-label`, strip chips sorted as given, `aria-current="step"` only on the current name, the keep-all button present.
3. Clicking keep-all (find the element and call `onClick`) calls the spy once per queued report id with `'skip'`, and for no other id.
4. `companyStrip` integration: three companies (one owner-run) give three chips; the Summary tab (R1-C11's `ReportBook` rendered directly) shows the strip when `strip.length >= 2` and not for one.
5. `LazyYearEndDesk` before `await preload()` renders its fallback (the children); after it, the desk. With `annualReport2` off the desk never renders (assert through the pure gate used by `MinigameCard`, exported as `shouldShowDesk(flag, position)` from `yearEnd.ts`).

**Flag.** `annualReport2`.
**Hot-file notes.** `ModalHost.tsx`: a separate hunk in `MinigameCard` after R1-C11's; G.11 (notices) edits the imports and the head of `ModalHost`, a different place. `AnnualReport.tsx`: one forwarded prop. `lazy.tsx`: one appended export.
**Depends on.** R1-C11, R1-C5. **Size.** Source about 420 lines (yearEnd 90, YearEndDesk 150, ModalHost 30, strip glue 50, css 100); tests about 450.

---

### R1-C13 Chart rows in menus, and the Books group on the company screen

**Roadmap items.** D.2 (`MenuInfo.chart` beside `text`), D.4 (P&L reachable from the company, not only from the yearly popup), G.5 plumbing. The second half (the Books group) is not in the roadmap; see the size table in section 1.

**Files.**
- Modify `src/game/charts/index.ts` (add `chartInfo`).
- Modify `src/ui/components/menuModel.ts` (add `infoChart`), `src/ui/components/MenuList.tsx` (the `info` branch of `MenuRows`; imports `LazyChartView` from `../charts/lazy`).
- Create `src/game/business/books-menu.ts`.
- Modify `src/game/business/manage.ts` (one import and one line after `nodes.push(economicReportMenu(a))`, near line 2266).
- Modify `src/ui/charts/charts.css` (append `.menu-info-chart`).
- Create `test/books-menu.test.ts`.

**Interfaces.**
```ts
// charts/index.ts
export function chartInfo(id: string, emoji: string, text: string | ((g: GameState) => string), chart: (g: GameState) => ChartSpec | null): MenuInfo[]
// [] unless flagOn('chartKit'). Otherwise one node { type: 'info', id, emoji, text, chart }. Memoizes the built spec per game object (WeakMap on g and the id), so the text and the chart do not build it twice in one render.
// menuModel.ts
export function infoChart(node: MenuInfo, g: GameState): ChartSpec | null    // readChartSpec(node.chart(g)); a throw is reported with report(...) and returns null
// books-menu.ts
export function booksMenu(a: Asset): MenuGroup    // id `biz.books.${a.id}`, label 'Books and Charts', emoji '\u{1F4CA}'
```
`MenuInfo.chart?` comes from R1-P2's `types.ts` edit.

**Behaviour.**
- `MenuRows` info branch: compute `text = infoText(node, g)` and `chart = infoChart(node, g)`. A valid chart renders `<div className="menu-info menu-info-chart"><LazyChartView spec={chart} fallback={text ? <span>{text}</span> : undefined} /></div>` (the text is the loading and failure state and what the server renders; this is Navigation's C-VIEW hook). No chart: today's row, unchanged. A node whose `text` is empty and whose chart is null still renders nothing, as now. `text` stays the accessible summary and the surface existing string tests read.
- `booksMenu(a)`: `subtitle` is `{year} net profit {m}` or "Fills in after the first full year". `children(g)` re-reads the live company (`findBusiness` then `readBiz`; empty list when the company is gone) and returns `chartInfo` rows, ids `biz.books.pl.{id}` (Profit and loss, `plSpec`), `.bridge` (Why profit changed, `bridgeSpec`), `.profit` (Profit by year, `profitSpec`), `.costs` (Where each dollar goes, `costShareSpec`), `.cash` (Cash walk, `cashWalkSpec`), `.cashlines` (Cash and debt, `cashLinesSpec`), `.share` (Share of the market, `shareSpec`). Each row's `text` is the spec's `summary` or a plain sentence when the spec is null ("The cash walk needs two booked years."). With `chartKit` off `chartInfo` returns `[]`, and the group is not registered at all. With no booked year the group shows one info row, "The books fill in after the first full year."
- `manage.ts`: `nodes.push(economicReportMenu(a))` is followed by `if (flagOn('chartKit')) nodes.push(booksMenu(a))` (read at call time, as Platform's guard requires). It serves every company type (the statement identity holds for studios, labs, banks and funds; verified in `gamestudio.ts` 457, `deeptech-sim.ts` 204, `bank.ts` 58, `fund-sim.ts` 193).
- All builders are pure; the group is a normal `MenuGroup`, so search, pins and the tree snapshot see it as new ids only when the flag is on.

**Tests** (`test/books-menu.test.ts`; store mocked as in `annualReport.test.ts` for the `MenuRows` render).
1. `chartKit` off (via `withFlags`): `chartInfo(...)` is `[]`; the company screen children (`businessAssetView`) contain no id starting `biz.books.`; flag on: exactly one `biz.books.{id}` group, after `biz.economicReport.{id}`, and the ids with the flag on minus that group equal the ids with it off, in order.
2. `booksMenu(a).children(deepFreeze(g))` returns unique ids, no throw, `g.rng` unchanged, for an owner-run company with 8 years and for a hired-CEO company; each `chart(g)` is a valid spec; text is never empty; ids are stable between two calls.
3. A company with no booked year shows the single "books fill in" row; a deleted company gives `[]`.
4. `infoChart`: returns null for a node without `chart`, for a builder that throws (and calls `report`, spied), and for a spec that fails `readChartSpec` (NaN value); returns the spec for a valid one.
5. `MenuRows` server render with one chart node: contains the fallback text inside `menu-info-chart` before `await ChartViewLazy.preload()` and the chart's `Frame` after it, and a node without chart renders exactly as before (compare to a markup built from an `info` node with no `chart`).
6. `chartInfo` memo: the builder is called once for one `g` across `text` and `chart` use.
7. The v4.0.2 fixture company: every Books row renders text, none throws.

**Flag.** `chartKit`. **Hot-file notes.** `MenuList.tsx`: one branch inside the existing `info` handling (a11y A6 edits the row-building loop and `MenuRow`'s attributes, Navigation N2 the badge pill in the `MenuRow` text block: disjoint hunks, merge order A6, N2, C13, C14, N5); `menuModel.ts`: one function, `infoChart`, placed directly after `infoText` (Navigation appends its helpers at the end of the file, so the hunks cannot touch); `manage.ts`: one import, one line. Merge after R1-A6 and R1-N2.
**Depends on.** R1-C5, R1-C9, Platform R1-P2 and R1-P3. **Size.** Source about 330 lines (chartInfo 40, infoChart 15, MenuList 15, books-menu 180, manage 3, css 40, glue 40); tests about 420.

---

### R1-C14 Ladders and sparklines: market, benchmarks, device specs, career standings, nation approval, stock lists

**Roadmap items.** G.6, D.5, D.11 criterion 2 (components in use).

**Files.**
- Modify `src/game/business/market-menu.ts` (`leaderboardMenu` 125, `historyMenu` 300).
- Modify `src/game/business/deeptech-menu.ts` (the Benchmarks group, near line 268).
- Modify `src/game/business/devices-menu.ts` (the spec rows, near line 82).
- Modify `src/game/special/kit/menu.ts` (`standingMenu`: serves the music chart, actor, astronaut and model standings).
- Modify `src/game/nation/menu.ts` (`dashboardMenu`, after the `meters` info row).
- Modify `src/game/investments.ts` (`offerNode` 1807, a new `stockTrail`).
- Modify `src/game/charts/ranks.ts` (add `lineSpec`, `growthSpec`), `src/game/charts/index.ts`.
- Modify `src/ui/components/MenuList.tsx` (`MenuRow` renders `node.spark` through `LazySparkline` from `../charts/lazy`).
- No edit to `src/game/types.ts`: R1-P2 adds `MenuBase.spark?` (cross-check); stop and tell the lead if it is missing.
- Create `test/ladders-wiring.test.ts`.

**Interfaces.**
```ts
// ranks.ts additions
export function lineSpec(o: { title: string; unit: ChartUnit; x: (number | string)[]; label: string; values: (number | null)[]; tone?: ChartTone; summary: string; basis?: number }): ChartSpec | null
export function growthSpec(g: GameState, title: string, years: number[], prices: (number | null)[]): ChartSpec | null   // 'line' money: what 100 invested at the first point became
// investments.ts
export function stockTrail(g: GameState, q: Quote, years?: number): (number | null)[]   // default 10 years, oldest first; null where the company was not listed
// types.ts (section 2.3)
interface MenuBase { spark?: (g: GameState) => (number | null)[] | null }
```

**Behaviour.** Every chart row uses `chartInfo` (so `chartKit` gates it); the existing text rows stay (they are the accessible fallback, D.5; the text bars `spark()` and `bar()` in `market-view.ts` stay).
1. **Leaderboard** (`biz.mkt.lb.chart.{id}`, first child): `marketLadderSpec(g, marketViewOf(g, readBiz(g, cur)), cur.name)` (the file already imports `marketViewOf`). **History** (`biz.mkt.hist.chart.{id}` and `biz.mkt.hist.size.chart.{id}`): `shareSpec` and `marketSizeSpec` over the same view.
2. **Benchmarks** (`dt.bench.chart.{id}`, `dt.bench.caps.{id}`): a line of the composite score from `benchSeries(fam, t, year)` (leading zeros become `null`, `x` = the years counted back from `benchYear(g)`, never past it) through `lineSpec`; and `scorecardSpec('Where your best model stands', labStanding(...).caps)`. Rows appear only when a model is rated, like the text rows.
3. **Device specs** (`biz.devices.spec.chart.{id}.{family}`): `scorecardSpec(family + ' against the market', [s.perf, s.quality])` (price has a negative scale; leave it to the text row). If the screen shows no spec rows, skip.
4. **Kit standings** (`{o.id}.chart` and `{o.id}.peers.chart`, after the standing row): `standingSpec('Your rank by year', s.rows)` and, when the career has a peer field, `ladderSpec` of `st.top` plus you (value = score, `you: true`, no `prev`).
5. **Nation** (`nation.dash.approval.chart`): `approvalSpec(p.reports)` (12 yearly reports).
6. **Stocks.** `stockTrail(g, q, 10)` returns the quote price of the same company slot for each year from `max(anchor + 1, g.year - 9)` to `g.year`, using exactly the calls `listing()` makes (`exchangeYear(...).stocks[slot]` or `.pennies[slot]`, `stockQuote`, `withShock` with `shockFactor`), `null` where `s.gen !== q's gen` or `event === 'ipo'`; never a year after `g.year`; a small module cache keyed `lifeId|year|secId` (at most 400 entries, cleared when full). `offerNode` gets `spark: (gg) => (flagOn('chartKit') ? stockTrail(gg, q) : null)` for stocks and pennies (funds, REITs, gold, crypto, bonds: none) and a detail row `inv-ochart-{secId}` with `growthSpec(g, 'What 100 would have become', years, prices)` (the amount is shown in the player's currency; share prices are not formatted as money here, so small prices never round to $0). `MenuRow` renders `<LazySparkline values tone="c6" label={node.label + ', price over ten years'} fmt={formatPrice} fallback={<span className="menu-spark-ph" aria-hidden />} />` inside `.menu-row-end` (before the lock and chevron) when `node.spark?.(g)` has 2 or more points; a throwing `spark` is caught like `subtitle` (`report(...)`). Cost: 10 quote builds per visible row; the cache makes a re-render free.
7. No RNG, no writes. The `spark` and chart builders read only years up to `g.year`; the Investing talent's gut (`invest/instinct.ts`) is untouched. Cross-check: `stockTrail` computes each year as `g.year - k` (never `year + n` or a bound `const` holding `year + 1`), so R1-P5's foresight scan has nothing to flag; and `nation/menu.ts` sits in the 30-module import cycle, so the new code imported there is only `chartInfo` from `charts/index.ts` (acyclic: nothing it imports reaches `nation/menu.ts`), and no new module may import `business/market-view.ts` or `business/competition.ts` values.

**Tests** (`test/ladders-wiring.test.ts`; store mocked where `MenuRow` is rendered; career helpers from `test/career-kit.ts`).
1. `chartKit` off (via `withFlags`): no child id of the Leaderboard, History, Benchmarks, devices specs, `music.standing`, the nation dashboard or a stock offer contains `.chart` and no `spark` is set; flag on: the new ids appear in the stated places, and the ids with the flag on minus those containing `.chart` equal the ids with it off, in order (so nothing existing moved).
2. Each wired chart is a valid spec: market (a company with 6 booked years), benchmarks (`labGame` from `test/lab-kit.ts` with a rated model, or skip the case when the helper cannot rate one and assert the null path), device specs (a devices company), `newCareerGame('music', 5)` after 4 `nextYear` calls (standing line and peers ladder), a politician with 12 reports for approval.
3. `stockTrail`: length at most 10, ends at `g.year`'s list price within rounding (`q.price`), `null` before listing, no call for `g.year + 1` (spy on `exchangeYear`: every call has `year <= g.year`), stable across two calls (cache), `g.rng` unchanged.
4. `MenuRow` with a `spark` node: before `await LazySparkline.preload()` the markup has the placeholder; after it, an `svg` with an `aria-label` naming the first, last, low and high; a throwing `spark` renders the row without it.
5. Frozen state: all builders and menus run on `deepFreeze(structuredClone(g))`.
6. Kit careers: a career with no rows yields no chart row (no throw).

**Flag.** `chartKit`. **Hot-file notes.** Six domain files get one hunk each, all additive and at the start of a `children` list or beside an existing info row; `investments.ts`: `stockTrail` goes next to `stockHistory`, and one property is added in `offerNode`; `MenuList.tsx`: the `MenuRow` end slot (separate from C13's `info` hunk; Navigation N2's badge pill now sits in the text block, not here; the end slot is `aria-hidden`, which is acceptable for a spark because the row's text and the Books/ladder text rows carry the same numbers). Merge after R1-A6, R1-N2 and R1-C13.
**Depends on.** R1-C6, R1-C9, R1-C13, Platform R1-P3. **Size.** Source about 700 lines; tests about 600.

---

### R1-C15 The net-worth line (Profile, Death screen, Graveyard)

**Roadmap items.** G.7, D.2 `Timeline`, D.3 S3 consumer; Navigation's C-SERIES contract (`lifeRows`, `netWorthSpec`).

**Files.**
- Create `src/game/charts/networth.ts`; modify `src/game/charts/index.ts`.
- Create `src/ui/components/LifeLine.tsx` (outside the chart zone; it imports `LazyChartView` from `../charts/lazy`).
- Modify `src/ui/components/ProfileSheet.tsx` (inside `<Section title="Money">` after `<KV rows={moneyRows} />`).
- Modify `src/ui/screens/DeathScreen.tsx` (a new section after the facts card).
- Modify `src/ui/screens/GraveyardScreen.tsx` (inside `grave-body`, above the obituary; uses `LazySparkline`).
- Modify `test/chart-purity.test.ts` (add the builder).
- Create `test/networth-line.test.ts`.

**Interfaces.**
```ts
// networth.ts
export function netWorthSpec(g: GameState): ChartSpec | null   // kind 'timeline', series 'Net worth' (c1), x = ages, basis = priceBasisYear(g); null under 2 points
export function downsample<T>(rows: readonly T[], max: number, keep: (r: T, i: number) => boolean): T[]   // even picks, always first, last and the kept rows
// LifeLine.tsx
export function LifeLine(p: { g: GameState }): JSX.Element | null     // null unless flagOn('chartKit') and the spec exists
```
(`lifeRows(g)` is R1-C3's, in `life-series.ts`.)

**Behaviour.**
- `netWorthSpec`: rows from `lifeRows(g)` (S3) plus a live point `{ age, netWorth(g) }` when the current age has no row or its row differs; needs at least 2 points (Navigation's contract: null under 2); values are the net-worth column; more than `CHART_LIMITS.points` (64) rows are reduced with `downsample(rows, 64, isExtreme)` keeping the first, last, peak and trough; marks (at most 3, from the series itself, no other source): `Peak {m}` at the highest point, `Low point {m}` at the lowest when it is below 0, `Now` at the last; `unit: 'money'`; title `Your net worth by age`; summary `Net worth {m} at {age}, peak {m} at {age}.`
- `LifeLine` is `<LazyChartView spec fallback>` with the spec memoized by `useMemo` on `(g.lifeId, g.character.age, g.year)`; its fallback is a plain muted line with the summary. It returns `null` when `!flagOn('chartKit')` or the spec is null. Profile and Death use it; the Death screen puts it in its own `al-card` section titled "Your life in numbers".
- Graveyard: when `flagOn('chartKit')` and `e.spark` has 2 or more points, show `<LazySparkline values={e.spark} tone="c1" label="Net worth over the life" fmt={...} fallback={...} />` where `fmt` is `shortMoney` inside `withMoneyContext` with the grave's death-year context, exactly as the existing worth label does.
- Heirs: a child's life has its own series (the flag does not carry over); the Death screen of the parent reads the parent's `flags`, which are intact at death.

**Tests** (`test/networth-line.test.ts`; `test/screens.test.ts` stays green; flags via `withFlags`).
1. `netWorthSpec` for a synthetic `lifeSeries` of 40 and of 120 rows (valid, at most 64 points, first and last kept, peak kept), for a 1-row series (null), for another life's series (null), for hostile rows (NaN, strings): never throws, valid or null.
2. Live point: a game whose current age has no row appends it.
3. `ownerGame({ years: 8 })` writes S3 rows through `ageUp`; the spec has 8 or more points; `basis` follows the money display setting.
4. `LifeLine`: flag off renders nothing; flag on renders the summary fallback text, and after `await ChartViewLazy.preload()` the chart; a null spec renders nothing.
5. DeathScreen server render (store mocked as `test/screens.test.ts` does): flag off, markup identical to a render without the section; flag on with a series, contains "Your life in numbers". GraveyardScreen: a grave with `spark` shows the sparkline `aria-label` (after `await LazySparkline.preload()`), one without does not, a hostile `spark` loaded through `loadGraveyard` shows none.
6. Purity: `deepFreeze` state; `g.rng` unchanged.

**Flag.** `chartKit`. **Hot-file notes.** Three screens each get one hunk; none is hot for another track.
**Depends on.** R1-C3, R1-C9, Platform R1-P3. **Size.** Source about 440 lines (networth 170, LifeLine 50, screens 70, glue 40, css 110); tests about 420.

---

### R1-C16 Screenshot harness: Annual Report on a phone, light and dark

**Roadmap items.** Exit gate ("the owner opens the Annual Report on a phone-width window"), the PR screenshots required by the run prompt.

**How the state gets on screen with no production code path (checked in the code).**
- The save key is `SAVE_KEY = 'anotherlife.save.v1'` (`src/game/save-backends.ts`), and `saveGame(g)` stores exactly `JSON.stringify(g)` (plain JSON; `save-store.ts` `saveRecord`). `loadGame()` parses it and runs `migrateSave`; any state that `ageUp` and `createNewLife` produced is loadable. After a11y R1-A1/A2 (K.5a), boot picks IndexedDB but reads the legacy localStorage key once and migrates it, so seeding the legacy key keeps working (this harness is the canary for that migration).
- The Home screen shows "Continue Life" for a saved game (`HomeScreen.tsx`); `resumeSavedGame()` calls `processQueue()`, so a queued `annualReport` minigame is the first thing on screen. The game has no save import or export screen (searched `src/ui` and `src/game/save*.ts`), and the Time Machine only restores earlier years of the life already loaded (10 snapshots, `anotherlife.tm.*`), so neither can create a state; localStorage is the only door. `test/fixtures/save-v1.json.gz` is a 33-year-old with two companies written by the v2.4.0 engine, so it has no `data.chart`; it is not used here.
- The state is made by the real engine: the harness bundles a small TypeScript state maker with esbuild (the pattern of `scripts/save-size.ts`) and runs it with node. `esbuild` is in `node_modules/.bin` (Platform makes it an explicit devDependency).
- Only one company can be owner-run (`becomeCeo`), so exactly one annual report queues; the other companies are hired-CEO companies and give the strip.
- The book is driven by `data.chart` in the saved queue, so it shows whatever the flags were when the state was made. The Year-End strip and the chart rows read the flags in the browser: the harness opens the page with `?flags=annualReport2,chartKit` (Platform's `FLAGS` reads `location.search`).

**Files.**
- Create `scripts/r1-screenshot-state.ts`, `scripts/r1-screenshots.mjs`.
- Create `test/r1-screenshot-state.test.ts`.
- Nothing under `src/` changes. `scripts/` is not in `tsconfig.json` `include` and is not reachable from `index.html`, so it is not shipped in the bundle (the test that imports the state maker type-checks it).

**Interfaces.**
```ts
// scripts/r1-screenshot-state.ts (exported for the test; also a CLI when run as a bundle)
export interface ReportStateOptions { seed?: number; birthYear?: number; years?: number; companies?: number }
export function makeReportState(o?: ReportStateOptions): GameState   // defaults: seed 7, birthYear 1964, years 30, companies 3
```
CLI of `scripts/r1-screenshots.mjs`:
```
node scripts/r1-screenshots.mjs --playwright <dir> [--url http://localhost:5173/] [--serve] [--out <dir>] [--seed 7] [--years 30] [--companies 3] [--width 390 --height 844] [--narrow 360]
```
`--playwright <dir>` is the directory that contains `node_modules/playwright` (or the package itself); the script loads it with `createRequire(join(dir, 'x.cjs'))('playwright')`. `PW_CHROMIUM` (env) names a Chromium binary, as `scripts/e2e-play.mjs` does. `--serve` starts `node_modules/.bin/vite --port <free port> --strictPort` as a child, waits until the URL answers (60 s), and stops it at the end; without it the script uses `--url`.

**Behaviour.**
1. `makeReportState`: `createNewLife({ seed, year: birthYear })`, adult at 30 (as `probeLife`), money 5e6, `licenses = ['driver']`; `companies` companies from `INDUSTRY_IDS` in order, skipping those `industryProblem` rejects, each `newBiz(... outlets 6, cash 3e6, founded g.year - 6)` and `createBusinessAsset`; the first with `becomeCeo(g, a, b)`, the rest `installManager`; `years` times: clear `g.queue`, keep the founder healthy (`keepAlive` as `probeLife`), and run `ageUp(g)`, the last one inside `withFlags({ annualReport2: true, chartKit: true }, ...)` (Platform's helper; `FLAGS` is readonly) so `data.chart` is written. After the last year drop everything from the queue except `annualReport` minigames; if none is left, try the next seed (up to 10) and then throw. Returns the state.
2. `r1-screenshots.mjs`: build the state (esbuild bundle to a temp dir, run, read `save.json`); for `colorScheme` in `light`, `dark`: a context with viewport `width x height` (390 x 844), `deviceScaleFactor` 2, that scheme; `addInitScript` sets `localStorage['anotherlife.save.v1']` once per session (guarded with a `sessionStorage` flag so a reload does not reseed); `goto(url + '?flags=annualReport2,chartKit')`; click the button named "Continue Life"; wait for `.ar-book`; screenshot `r1-{scheme}-summary.png`; click each tab by role and name (P&L, Cash, Market, Plan), wait for its `tabpanel`, scroll the panel top to bottom in steps, and take a screenshot per tab (`r1-{scheme}-pl.png`, `-cash`, `-market`, `-plan`; the P&L and Cash shots are the "history and cash" views the owner wants). A second pass at `--narrow` width (360 x 740) for the P&L and Cash tabs in light only.
3. Checks printed as one JSON line per shot and a final summary: no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth` and the same for `.popup-scroll`), the tab row is horizontally scrollable, no `console` error or `pageerror`, no request leaves the page origin (as `e2e-play.mjs`), every tab button at least 44 px tall (`boundingBox().height`). Exit code 1 on any failure; the PNG paths are printed so the lead can attach them to the PR.
4. No network downloads (the lead installs Playwright and Chromium beforehand). Running Vite and Chromium needs local port binding; in a sandboxed shell the lead runs the script outside the sandbox (the script itself does nothing that needs more).

**Tests** (`test/r1-screenshot-state.test.ts`, under 60 seconds).
1. `makeReportState({ seed: 7, years: 6, companies: 2 })`: `queue[0]` is an `annualReport` minigame; `readReportCharts(rec(queue[0].data).chart)` is non-null; the state survives `JSON.parse(JSON.stringify())` and `migrateSave(...)` returns `ready`.
2. The flags are restored after the call (`flagOn('annualReport2')` is false again).
3. Exactly one annual report is queued although two companies exist, and `companyStrip(g)` has two rows.

**Flag.** None. **Hot-file notes.** None (new files only).
**Depends on.** R1-C10 (so `data.chart` exists), R1-C11 (so there is something to see); R1-C12 for the strip. **Size.** Source about 380 lines (script 250, state maker 130); tests about 100.

---

### R1-C17 Acceptance sweep, hygiene, docs (the lead flips the flags)

**Roadmap items.** K.11 "flipped on at release when their acceptance tests pass" (the lead's release commit does the flip, with the version bump), D.11 criteria 1 to 5 and 12 to 13, per-track docs (design 13.3: per-track docs replace appends to `docs/ARCHITECTURE.md`).

**Files.**
- Create `docs/CHARTS.md`.
- Modify `test/chart-hygiene.test.ts` (final allow-list; see below).
- Modify any existing test that fails only under the flipped defaults, and say why in the commit. Do not edit `src/game/flags.ts`.

**Interfaces.** None.

**Behaviour.**
1. Run the track's files and the neighbours: `test/chart-*.test.ts test/series-*.test.ts test/report-book.test.ts test/year-end-desk.test.ts test/books-menu.test.ts test/ladders-wiring.test.ts test/networth-line.test.ts test/r1-screenshot-state.test.ts test/chart-contrast.test.ts test/ui-contrast.test.ts test/annualReport.test.ts test/screens.test.ts test/talent-business.test.ts test/deeptech.test.ts test/save-schema.test.ts test/save-store.test.ts test/voice-guards.test.ts test/company-dashboard.test.ts test/competition.test.ts test/franchise.test.ts test/growth.test.ts` (one worker, `NODE_OPTIONS=--max-old-space-size=2048`; the lead may split them across agents under the 3-at-a-time rule).
2. Simulate the release flip without committing it: in a scratch working copy set `annualReport2` and `chartKit` to `true` in `FLAG_DEFS` (Platform's release test will insist on the version bump too, so skip `test/flags.test.ts` here), run the same files and `npm run typecheck`, then revert. List every failure in the PR description with the reason; each one is either a test that assumed a default (fix it to call `withFlags`) or an existing expectation that the new rows legitimately change (the fix goes into the lead's release commit, with the reason).
3. Measure the bundle: run a11y's `node scripts/bundle-budget.mjs` (R1-A9) when it exists, else one `npm run build` (never in two agents at once) and record the main chunk and the kit chunks in gzip; the kit should be about 10 KB gzipped and the whole increase at most 60 KB gzipped (D.11.12).
4. Ask the lead to run `scripts/r1-screenshots.mjs` (R1-C16) and attach the PNGs, and to run `scripts/r1-parity.mjs` (R1-P9: `play`, `compare`, `cost`) on the R0 head and this branch, with `--flags none` and `--flags all`.
5. `docs/CHARTS.md` (about 150 lines, no dashes): the spec contract and limits, the builder rules (settled years, `reveal`, flags), how to add a chart (build a spec, `chartInfo` or `data.chart`, test recipe), the kit (`ChartView`, `lazy.tsx` and the zone rule, `Frame`), the accessibility bar, the tokens and their contrast, the series (S1 to S3, bounds, node budget), the Annual Report book (tabs, `data.chart`, desk), and the screenshot harness.
6. Final `test/chart-hygiene.test.ts`: tighten the import allow-list to what the files actually import (it starts as the list in R1-C1; remove entries nothing uses), and add a size cap (no file in `src/game/charts/` or `src/ui/charts/` above 600 lines).
7. Release-note bullets for the lead's `docs/RELEASE-v4.1.0.md` (plain language): "Profit and Loss now draws a waterfall of where the sales went, with a bridge showing why profit changed. Every company keeps 30 years of books, and the report shows profit and cost history. A cash walk shows how the company's cash moved. The report has Summary, P&L, Cash, Market and Plan tabs and fits a phone. The market screens draw a rival ladder and your share over 20 years. Benchmarks, career standings, nation approval and stock lists get charts and sparklines. Your net worth is drawn as a line on your profile, on the death screen and in the graveyard. Companies you hand to a CEO get a Books and Charts screen. Money on multi-year charts is in one set of prices, labelled."

**Tests.** The sweep is the test: the files in step 1 green; the scratch flip reported; `test/chart-hygiene.test.ts` green.
**Flag.** None (the lead flips `annualReport2` and `chartKit`). **Hot-file notes.** None. **Depends on.** All. **Size.** Docs about 150 lines; source none; tests: edits only.

---

## 6. Plan vs code

Everything below was checked by reading the v4.0.2 code (and, for the import graph, by bundling `src/main.tsx` with esbuild into a metafile outside the repo). Items 1 to 12 correct or sharpen the roadmap; 13 to 17 are observations the lead needs; 18 to 22 record how this plan was reconciled with the sibling plans in the same folder (platform, nav, a11y, notices).

1. **`CLAUDE.md` is missing from this checkout** (not in `snag/` or its parent; `.claude/` holds no instructions). The run prompt tells the lead to read it first; implementers will not find it.
2. **`recordYear` has two caps, and the roadmap names only one.** `recordYear` slices to 10 (`economy.ts` 1009), the normalizer to 12 (`state.ts` 683), and the NPC path slices to 12 after calling it (`npc-lives.ts` 188). R1-C3 moves the player cap to 30 in both places and keeps NPC companies at 10 rows with no new fields (`lean`), so NPC saves do not grow.
3. **`b.ownerDraws` is already gone when `recordYear` runs.** `evolve()` deletes it (`economy.ts` 915) before `recordYear` (`yearly.ts` 547 then 552), so "fills `draws` from `b.ownerDraws`" would write 0 forever. R1-C3 captures it in `yearly.ts` before `evolve` and passes it in.
4. **A bonus is not a cash-walk step.** `manage.ts` books a bonus as `yearCosts += n` (so it is inside `other` and inside net profit) and also takes the cash out immediately; `simulateYear` adds `yearCosts - yearIncome` back to cash. Showing "owner draws" as its own step beside net profit would count it twice. R1-C5 shows it as a note on the net profit row and keeps `draws` in the row as a memo. The walk also gets a real "Inflation on cash" step (`Statement.cashErosion`) and a "Dividends paid" step (`dividend.last`), which the roadmap's list lacks.
5. **Good and bad chart colours.** The roadmap reuses `--action-green` and `--action-red`. In dark mode those tokens stay #177638 and #B72D27, which measure 2.90 and 2.69 against `--card`: they fail 3:1. R1-C7 adds `--chart-good` and `--chart-bad` with dark values #5FD38A (8.80) and #FF7D75 (6.65). Every other number in the roadmap's token table reproduced exactly.
6. **The Year-End Desk will not appear in v4.0.2 play.** Only one company is owner-run (`runsIt` needs the player's single job to name it; `becomeCeo` hands any other company to a general manager), a manual `queueReport` cannot run while the queue is not empty, and the crunch path queues the same one report. So "two or more `annualReport` modals" cannot happen yet. R1-C12 builds and tests the desk with synthetic queues and adds the company strip to the Summary tab for a player with two or more companies, which gives the owner the same overview now. Also: the roadmap says the desk's button calls `finishMinigame(id, 'skip')` and calls it "Approve every suggested plan"; `'skip'` keeps last year's plan (`REPORT` and `parsePlan`), so the label is "Keep every plan".
7. **Which report variants stay text.** D.4 says "the other five report variants (classic and deep-tech minigames, Lab, Studio, ...)". The classic report is the one being upgraded. The text variants are the deep-tech `annualReport` (`techReportData`, `deeptech-sim.ts`), the Lab choice (`deeptech.labReport`), Studio (`queueStudioReport`), Financial Institution (`queueFinanceReport`) and Nation (`nationReport`). Only `reportData` (`yearly.ts`) gains `chart`. The books menu (R1-C13) gives studios, labs, banks and funds the same P&L charts from the company screen, because their `Statement` obeys the same identity.
8. **"Identical JSON except the new optional keys" is not literally true for company history.** Player companies keep 30 rows instead of 10, so a 40-year run differs in `history` length. The parity probe must compare through `stripR1` (R1-C3 provides it: it removes the new keys and truncates `history` to the last 10 rows). Separately, the only readers that scan beyond the last 3 rows are `milestones.ts` lines 54 and 109; R1-C3 pins them to `simHistory` (10 rows) so no result can move.
9. **S2 node count.** `top?: [string, number][]` costs 25 nodes a row (the array, 8 pair arrays, 16 numbers), 500 a market, 15,000 at 30 companies; with S1 18,600 and S3 1,084 the total is 34,700, over the roadmap's own 32,000 test limit. The roadmap's 340 a market is the flat count (8 pairs x 2 + 1 = 17 a row). R1-C3 stores `top` flat (`[id, share, id, share, ...]`, at most 16 entries) with `topPairs()` to decode, which reproduces 340 and a 30-company total of about 29,900.
10. **Accessibility of the frame.** The roadmap puts `role="img"` on the `<figure>` that also holds the "Show as table" button, the legend and the readout; children of an image role are presentational, so the toggle would be unreachable by assistive technology. R1-C7 makes the figure a labelled group and R1-C8 puts `role="slider"` (arrow keys, Home, End are slider semantics) on the plot. D.11 criterion 2 ("role, title, description, readout, table toggle") is still met.
11. **Rival "trend" is a foresight read.** `rivalLookup` (`competition.ts` 330 to 343) computes `trend` from `rawPull(d, ros, year + 2)`; `leaderboard()` (`market-view.ts` 87) and the text Leaderboard use it. Ladders must not use it (R1-C6 derives changes from S2 history). The X.G1 scan only lists `exchangeYear(`, `cryptoYear(`, `goldYear(`, `fxYear(`, so this existing read is outside it; flag it for R3 H.13.
12. **Roadmap line numbers.** `recordYear` is at `economy.ts` 997 (roadmap 996); `readHistory` is at `competition-state.ts` 158 and the 20-row slice at 282 (roadmap says 264); `MarketView.history` is typed at `competition.ts` 210 and mapped at 422. `readRecord` is not exported (`state.ts` 581): R1-C3 exports it. The roadmap's D.4 sketch has 32 px rows; design 12.6 says 44 px (the design wins on design questions), so rows are 44 px.
13. **G.5 is not in this brief.** The roadmap's Charts table lists G.5 (cockpits, 700 lines) under Charts; the brief for this plan omits it. The track provides what it needs: `KpiTile`, `Meter`, `BulletRow`, `Sparkline`, `companyKpis`, `companyStrip`, `ChartView` and the lazy views.
14. **Only `test/**/*.test.ts` run.** `vite.config.ts` includes only that pattern, so UI tests are `.test.ts` files using `createElement` (no JSX). `tsc` type-checks `src`, `test` and `vite.config.ts` but not `scripts/`.
15. **The kit is mostly inside the import-cycle safe zone** (see contract 2.1.4): the one thing to watch is that `src/game/charts/report.ts` is imported by `yearly.ts`, so it must never import `yearly.ts`, `manage.ts` or `economy.ts`; `test/chart-hygiene.test.ts` enforces it, and K.1 is the backstop.
16. **Statement identity holds for every producer.** `simulateYear` (`economy.ts`), `simulateStudioYear` (`gamestudio.ts`), `simulateDeepTechYearImpl` (`deeptech-sim.ts`), `simulateBankYear` (`bank.ts`) and `simulateFund` (`fund-sim.ts`) all build `net = pbt - corpTax` and `pbt = netRevenue - cogs - wages - keyStaff - rent - marketing - interest - upkeep - other + otherIncome - ownerPay` up to per-line rounding (`upkeep` folds in insurance, head office, range cost and storage). So one `plSteps` serves all, and the "Rounding" row is the only residual. The perfect-foresight top-up (`settlePerfectForesight`) sits inside `otherIncome` and moves `pbt`, `corpTax`, `net` consistently, so old statements still sum.
17. **`MenuInfo.chart` and the tree snapshot.** `chartKit` off, no new node ids exist. On, this track adds info ids containing `.chart` and one group per company; the Navigation track's snapshot of reachable id paths should be regenerated after R1-C13 and C14 (the ids are listed in those tasks).
18. **Flags: use Platform's.** The roadmap says features ship dark behind `FLAGS`; Platform R1-P3 (platform.md) defines `FLAGS` as a readonly live view with eight pre-declared keys (list in the cross-check), `flagOn`, `withFlags`, and a release test that forces the defaults to match the version. This track's earlier idea of three own flags and an own flip task is dropped: it uses `annualReport2` and `chartKit`, reads them at use, never edits `flags.ts`, and every test passes the flags it needs through `withFlags` so the lead's release flip cannot break it. R1-C17 reports, rather than makes, any test change the flip forces.
19. **Lazy seam and zone rule (a11y R1-A8).** a11y's `test/lazy-zones.test.ts` forbids any runtime import of `src/ui/charts/*` from outside the directory except `src/ui/charts/lazy.tsx`, and `lazyView` replaces `React.lazy` (because `renderToStaticMarkup` cannot wait for it). So the report book and the desk live in `src/ui/charts/` (`ReportBook.tsx`, `YearEndDesk.tsx`), `LifeLine` lives in `src/ui/components/`, and every outside consumer uses `LazyChartView`, `LazySparkline`, `LazyKpiTile`, `LazyReportBook` or `LazyYearEndDesk` with a text `fallback`. Two other plans disagreed; the cross-check resolved both in Navigation's file: `src/ui/nav/kit.ts` now re-exports `LazyChartView`, `LazyKpiTile`, `LazySparkline` from `../charts/lazy` and the cockpit uses no `React.lazy`; Navigation's flag names (`navRegroup`, `navPalette`, `cockpits`) became Platform's (replacing `navHubs`, `searchPalette`), used through the readonly `FLAGS`.
20. **`spec.ts` is Platform's file.** R1-P2 creates it (types and `CHART_LIMITS` with the key `points` for the x limit, no imports, its own test pins the constant). R1-C1 appends `LadderRow`, `rows`/`basis`/`note`, `SPEC_LIMITS` and `readChartSpec` in separate hunks and keeps the zero-import property. The roadmap's `ChartSpec` has no home for ladder rows, a price basis or a tile note, hence the three optional fields.
21. **Names Navigation fixed.** The dispatcher is `ChartView` (not `Chart`), a `kpi` spec renders one tile per series, `KpiTile` takes `{ label, value, note?, delta?: { text, dir: 'up' | 'down' | 'flat', good }, values?, tone, onPress? }`, `netWorthSpec(g)` returns null under 2 points, and `lifeRows(g)` returns objects (`age, year, netWorth, cash, debt`). All match nav.md C-VIEW, C-TILE, C-KPI and C-SERIES.
22. **Market builders take the view.** `shareSpec`, `marketSizeSpec`, `marketLadderSpec`, `companyKpis` and `reportCharts` receive a `MarketView` from the caller (who already imports `marketViewOf`) instead of calling it, which keeps `src/game/charts/` free of runtime imports of `business/competition.ts` (a member of the 85-module cycle component), follows Platform's stricter reading of K.1, and lets the tests use hand-built views.

## 7. Open questions for the lead

None block the track. Two defaults taken, both easy to reverse:
1. The Desk button label is "Keep every plan" (item 6). If the owner wants true "use the suggested price and production", the Desk can call `finishMinigame(id, planResult(r, r.suggestedPrice, unitsToMeetDemand(r)))` per report instead; that reads each report's data and is a product change, so it is not in this plan.
2. C13's Books group and C16's harness are outside the roadmap's line budget (710 lines). Cutting C13's second half leaves hired-CEO companies without P&L graphics (the player still sees them in the chart rows of the market and stock screens).

---

## Changed by cross-check

Applied from `00-crosscheck.md` (decisions D2, D3, D7, D9; collisions table):

1. **Types.** R1-C10 and R1-C14 no longer edit `src/game/types.ts`; R1-P2 adds `MenuBase.spark` and `AnnualReportData.chart` (section 2.3 is reference only).
2. **Flags.** The eight-key list is named in contract 1; the Navigation and Notices flags are Platform's. Plan vs code 18 and 19 updated.
3. **Contrast test.** R1-C7 writes `test/chart-contrast.test.ts` using a11y's `test/contrast-kit.ts` and no longer appends to `test/ui-contrast.test.ts`; C7 now depends on R1-A7. C17's sweep list names both files.
4. **Merge order on shared files.** `MenuList.tsx`: A6, N2, C13, C14, N5. `menuModel.ts`: `infoChart` goes right after `infoText`. `ModalHost.tsx`: T4, C11, C12. C13 depends on A6 and N2 (order only).
5. **`stripR1` scope.** Now also strips `flags.inbox`, queue `weight` and `link`, and rebuilds `flavorRecent` from `textMem.r.flavor`, so R1-P9 can compare R1 output with the R0 head. A unit test is added to `test/series-books.test.ts`.
6. **Consumers.** Navigation's wealth cockpit reads `lifeRows` and `netWorthSpec`; its company KPI row must agree with `companyKpis` (R1-N8 test 4b). C17 asks the lead to run R1-P9.
