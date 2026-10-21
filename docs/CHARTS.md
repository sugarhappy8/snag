# Charts, books and series

What v4.1.0 ("See it") added for drawing the numbers, and the rules that keep it honest. Read it before you add a chart, a
sparkline, a KPI tile or a new row to a company's books. The tests named in each section are the permanent guards; when one
fails, the section says what it protects.

A chart is data first. A pure builder in `src/game/charts/` reads settled state and returns a `ChartSpec`, which is plain
JSON. A component in `src/ui/charts/` draws a spec. Nothing in between holds state. Two build flags (`src/game/flags.ts`, on by
default from v4.1.0) gate the screens: `chartKit` (chart rows in menus, ladders, stock sparklines, the Books group, the
net-worth line) and `annualReport2` (the book's `data.chart`, the Year-End Desk, the company strip). Read a flag where you use
it. The series writers and the kit are never flagged: history has to build up in every life, and the kit does nothing until a
builder hands it a spec.

## 1. The spec and its limits

Code: `src/game/charts/spec.ts`. It has no imports, so any module can use it and it never joins an import cycle.

| Field | Notes |
|---|---|
| `kind` | `line`, `bars`, `stack`, `waterfall`, `ladder`, `timeline`, `meter`, `kpi` (one tile per series, no frame) |
| `unit` | `money`, `pct`, `count`, `rank`, `years` |
| `x`, `series` | up to 64 points and 6 series. A series is `{ id, label, tone, values }`; a `null` value is a gap |
| `steps`, `marks`, `rows` | waterfall rows (20), flags pinned to a place (8), ladder rows (12, each with a 12 point spark) |
| `basis` | price year of a multi-year money chart. The frame shows the chip "prices of {basis}" |
| `title`, `summary`, `note` | 60, 120 and 60 characters at most. The summary is the accessible text |

`CHART_LIMITS` (Platform's) and `SPEC_LIMITS` (ours) hold the numbers. Labels are 40 characters, ids 24, every number is
finite and at most 1e15, a basis is 1800 to 2300.

`readChartSpec(json)` is the one door for JSON nobody vouches for: a queued modal, a menu row, a save. It returns a fresh spec
or `null`. It never truncates, clamps or repairs, it checks an array's length before it walks it, it reads own properties only,
and it refuses the ids `__proto__`, `constructor` and `prototype`. Tests: `test/chart-spec.test.ts`.

## 2. Builder rules

Code: `src/game/charts/` (`pl`, `books`, `market`, `ranks`, `networth`, `report`, and `money`, `reveal`, `index`).

1. **Pure.** A builder reads the state and writes nothing. No `g.rng`, no `rand(`, no clock, no `structuredClone` of the state,
   and no `earnIncome`, `spend`, `addMoney`, `.cash +=` or `.money +=`. It works on a deep frozen state.
2. **Settled years only.** Read `b.last`, `b.history`, the market's history and `flags.lifeSeries`. Never a year after
   `g.year`, and never `RivalView.trend`, which looks two years ahead. Ladder changes come from the history the market keeps.
3. **Never throws, never lies.** A builder that has nothing to draw returns `null`. No spec ever carries a non-finite number or
   a string the reader would refuse. Use `whole`, `fit`, `pctLabel` and the money helpers in `money.ts`.
4. **Pass the spec through `reveal()`.** It is the identity in R1. R3's knowledge system replaces its body, so every builder
   already calls it.
5. **Money stays in internal dollars.** The engine keeps constant present-day dollars, so nothing is deflated. Labels come from
   `moneyLabel(g, n)`, which uses the life's own money context. A multi-year money chart sets `basis` to `priceBasisYear(g)`.
6. **Few imports.** A chart file imports types freely and a short list of leaf modules at run time. It never imports `yearly`,
   `manage`, `economy` or `competition` (members of the big import cycle). Market builders take the `MarketView` as an argument.
7. **Voice.** Contractions, no em-dash or en-dash character, ASCII `+`, `-`, `=` for signs, screen reader text in words.

## 3. Add a chart

1. Write `fooSpec(g, ...)` in a file of `src/game/charts/` (or beside a related builder) and export it from `index.ts`.
2. Put it on a screen. In a menu, add `...chartInfo(id, emoji, text, build)` to the node list: it gives nothing while `chartKit`
   is off, builds once per game object, and keeps the plain `text` as the loading and failure state. A trend at the end of a row
   is `MenuBase.spark` (the function you give it checks `chartKit`). In the Annual Report, add a member to `ReportCharts` (`report.ts`) and draw
   it in a tab of `ReportBook.tsx`. Anywhere else, render `<LazyChartView spec={spec} fallback={...} />`.
3. Test it. Get real lives from `test/charts-kit.ts` (`ownerGame`, `statementSamples`). Run the builder on
   `deepFreeze(structuredClone(g))` and prove it didn't throw, moved neither `g.rng` nor any byte of the state, and returned
   `null` or a spec that `readChartSpec` accepts. Add it to `runAll` in `test/chart-purity.test.ts`. Feed it an empty history,
   one row, and `NaN`, `Infinity` and 1e15; check no string holds `NaN`, `Infinity` or `undefined` and every string fits.
4. Set flags with `withFlags` and cover both the on and the off case. Never lean on a default.

## 4. The kit

Code: `src/ui/charts/`. `ChartView({ spec })` picks the plot by `kind` and wraps it in a `Frame` (title, price chip, legend, one
line of readout, "Show as table"). The plots are `LineChart`, `BarChart` (stacked or grouped), `Waterfall`, `RankLadder` and
`Timeline`. Small parts: `Sparkline`, `KpiTile`, `Meter`, `BulletRow`. Pure helpers: `geometry.ts` (scales, ticks, paths; every
output is finite for any input), `format.ts`, `table.ts` and `useScrub.ts` (a pure reducer under a thin hook).

**The zone rule.** No file outside `src/ui/charts/` may import anything under it at run time except `lazy.tsx`, and `lazy.tsx`
imports the kit only through `import()`. That keeps the charts a chunk of their own (`test/lazy-zones.test.ts`). Outside code
uses `LazyChartView`, `LazySparkline`, `LazyKpiTile`, `LazyReportBook` and `LazyYearEndDesk`, each given a `fallback` that is
today's text rows. Pure logic that the card around a lazy view needs (`bookModel.ts`, `yearEnd.ts`) lives in
`src/ui/minigames/` and never touches the kit. In a test, `await View.preload()` and then render the real component.

Tests: `test/chart-geometry.test.ts`, `chart-ui-frame.test.ts`, `chart-ui-plots.test.ts`, `chart-ui-ladder.test.ts`.

## 5. The accessibility bar

Every chart has all of these, and the tests check them. The plot has an accessible name (the title) and description (the
summary). The readout is text, never hover only. Arrow keys scrub the cursor and Home and End jump (a line or bar plot is a
`slider`; the frame is a labelled group, so the table button stays reachable). "Show as table" opens a real `<table>` of the
same numbers. Targets are 44 px (`var(--target, 44px)`). Each series has its own marker shape, and no good or bad bar relies on
colour: it carries a sign glyph and words ("up", "down"). Motion respects `prefers-reduced-motion`. It works at 360 px. A chart
draws at most 150 SVG elements, so a stacked bar is one path for each series.

## 6. Tokens and contrast

Colours come only from tokens in `global.css`, never a raw hex in a `.tsx` file.

| Token | Use | Lowest ratio on `--card`, `--bg`, `--card-2` (both themes) |
|---|---|---|
| `--chart-1` to `--chart-6` | series, told apart by hue and marker shape | 4.48 (`--chart-2`, light, on `--bg`) |
| `--chart-good`, `--chart-bad` | gains and losses (the `--action-*` fills fall below 3:1 in dark mode) | 4.87 (`--chart-bad`, light) |
| `--chart-grid` | gridlines, the border colour | decoration |

The floor is 3:1 for every mark. `test/chart-contrast.test.ts` reads the CSS through the shared `test/contrast-kit.ts`
(`readThemeTokens`, `contrastRatio`); text pairs are `test/ui-contrast.test.ts`.

## 7. The series

Three records feed the charts. Each new field is optional, read by its own bounded reader, finite-checked and clamped, and
`SAVE_SCHEMA` stays 2. A damaged value can lose a row; it can't break a load or a chart. Nothing in the simulation reads them.

- **S1, company books.** A `YearRecord` takes 14 optional whole-dollar fields (`BOOK_KEYS`: cash, debt, the 11 statement lines,
  `draws`), written by `recordYear`. `draws` is a memo of owner bonuses already inside `other`, not a second cost. A player's
  company keeps `HISTORY_ROWS = 30` rows; the simulation still reads the last `SIM_HISTORY = 10` through `simHistory(b)`. NPC
  companies keep 10 rows and no new fields. A row from before R1 has the nine old fields: the profit line still draws, and the
  builders that need books skip it and say where the books start. `syncBookRow` keeps a row in step when a group invoice
  amends a closed year.
- **S2, market ladder.** `MarketHistory.top` is a flat `[id, share, id, share, ...]` list (at most `TOP_RIVALS = 8` pairs,
  17 values a row); `topPairs()` decodes it. The market keeps 20 rows.
- **S3, the life.** `g.flags.lifeSeries` is `{ v: 1, id, rows }`. A row is `[age, year, netWorth, cash, debt, income,
  happiness, health]`, whole numbers, one row for each age, at most `LIFE_SERIES_ROWS = 120`. `writeLifeRow` runs at the end of
  `ageUp`. `readLifeSeries` looks at the newest 1000 entries and checks each row; a series that names another life reads as
  nothing, so an heir starts fresh. `lifeRows(g)` is the object form. A grave keeps a 40 point trail (`lifeSpark`, `readSpark`).

**Node budget.** Counted the way the loader counts (`jsonNodes`), S1 adds about 620 nodes a company, S2 about 340 a company
market and S3 about 1,100 a life. Thirty companies add about 29,900, 6% of the loader's 500,000 cap. The test fails above
32,000 for thirty companies and above 14,000 for twelve. Tests: `test/series-books.test.ts`, `series-market.test.ts`,
`series-life.test.ts`, `series-budget.test.ts`.

**Parity.** `test/r1-strip.ts` (`stripR1`) removes the new keys and cuts company history to its last 10 rows, so the "no
simulation output changes" probe compares an R1 save with an R0 one. The old fixture `test/fixtures/save-v1.json.gz` must keep
loading.

## 8. The Annual Report book

Code: `src/game/charts/report.ts`, `src/ui/charts/ReportBook.tsx`, `src/ui/minigames/bookModel.ts`, `AnnualReport.tsx`.

With `annualReport2` on, `reportData` (in `yearly.ts`) adds `chart`: `reportCharts(g, a, b, view)` builds it, one member at a
time, so one builder's bug drops one member and never the report. It holds four KPI tiles, a one line verdict, the P&L waterfall
in a short and a full size, and whichever of `bridge`, `profit`, `costs`, `cash`, `cashLines`, `share`, `ladder` and `size` the
books can support. `AnnualReport.tsx` reads `d.chart` through `readReportCharts`, which keeps what is good and returns `null`
when the P&L can't be drawn. With no readable chart (a flag off, or v4.0.2 data in a queued modal) the text layout shows,
and it is also the fallback while the chunk loads.

The tabs, in order: **Summary** (tiles, verdict, short waterfall, the company strip from two companies, "All the numbers"),
**P&L** (full waterfall, why profit changed, profit history, cost structure), **Cash** (cash walk, cash and debt), **Market**
(share against the leader, rival ladder, market size, marked as an estimate) and **Plan** (the sliders and the projection of
the text report). The two buttons sit in a bar under every tab. Left, Right, Home and End move between tabs (`tabKey`, over
`rovingMove`). The book holds no plan state.

The Year-End Desk (`yearEnd.ts`, `YearEndDesk.tsx`) sits above the book when two or more reports queue for one year: a
"2 of 6" header, a chip for each company and one button, "Keep every plan", which keeps last year's plan rather than taking
the suggested one. It is dormant in today's play, because one company is owner-run and one report queues a year; it is tested
with synthetic queues. Tests: `test/chart-report.test.ts`, `report-book.test.ts`, `year-end-desk.test.ts`, `annualReport.test.ts`.

## 9. Harnesses and the release gate

- `scripts/r1-screenshots.mjs` photographs every tab of the book on a 390 by 844 phone in light and dark, and P&L and Cash at
  360 by 740. It needs Playwright and a Chromium the lead installed, and a port, so it runs outside the test sandbox. It
  checks for sideways overflow, tab buttons under 44 px, console errors and requests that leave the origin.
  `scripts/r1-screenshot-state.ts` makes its save with the real engine (`test/r1-screenshot-state.test.ts`).
- `scripts/r1-parity.mjs` has `play`, `compare` and `cost`. The lead runs it on the R0 head and the R1 head, with
  `--flags none` and `--flags all`.
- `node scripts/bundle-budget.mjs` (`npm run size`) compares the initial bundle with `scripts/bundle-baseline.json`; growth over
  60,000 gzipped bytes fails. The kit is lazy, so it stays out of the initial bundle; the builders and wiring do not. An esbuild
  estimate at the release sweep (not the Vite build) put the kit at about 16 KB of script plus 2 KB of CSS gzipped, and the
  builders at about 12 KB. The Vite numbers are the ones to trust.
- `test/chart-hygiene.test.ts` (`// ci: fast`) reads every chart file as tokens: no dash character, clock, random number,
  `rng` or money call; only the allow-listed run time imports (an unused entry fails); none of the cycle members; no chart
  path imported by `state`, `economy` or `competition`; and no `.ts` or `.tsx` file over 600 lines.
