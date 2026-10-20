# AREA G: navigation, charts and graphics, Annual Report UI

Numbers are measured on v4.0.2 with throwaway vitest probes (`plan-audit/G-probe`): a 45-year-old CEO with one company, plus plain lives.

## 1. WHAT EXISTS TODAY

**Shell** (`src/ui`: 8,739 lines TS/TSX, 5,163 CSS). Four sheets (Occupation, Assets, Relationships, Activities) plus "+ Age", in a fixed 480px column even on desktop. Dark mode only via `prefers-color-scheme`.
- The menu model is solid: `MenuAction | MenuGroup | MenuInfo | MenuHeading` (`game/types.ts:721-804`), pure functions of state, guarded by `ui/components/menuModel.ts`, rendered by `MenuList.tsx` and `MenuSheet.tsx`. Ids are stable (0 duplicate id-paths in 11,822 nodes).
- Navigation is a back arrow. No breadcrumbs, search, favorites or recents. The single "Back to" chip (`ReturnChip.tsx`, store `ReturnPoint`) appears only after an action closes a sheet, and Age or opening another menu clears it.
- **Depth.** Roots show 13, 30 and 36 rows (Activities is flat alphabetical, no headings). For the CEO: 11.8k reachable rows, 2,601 distinct actions, 1,159 group screens. Mean action is at list depth 4.8, about 5.8 taps with the tab. 146 groups hold one row (a pointless tap), 161 are 70%+ info rows (reports posing as menus), 53 exceed 12 rows (28 without headings). The company screen has 39 direct rows, 1,250 nodes below, and 3 routes to it.
- **Typical taps.** Start a product 5 (Assets, company, Products, product, slider Done) plus 1-2 popups. Change CEO 4 plus confirm plus popups. Buy a stock 6-7 (Assets, Investments, Stocks, one of 48 unsorted rows, Buy, amount, Done). Reachable: Occupation 2.9k nodes (737 actions), Assets 5.1k (1,769), Activities 3.8k (2,040), overlapping.

**Graphics: none.** Zero `<svg>`, `<canvas>` or `<path>` in `src`. "Charts" are Unicode text in info rows: `spark()` (▁▂▃) and `bar()` (▓░) in `business/market-view.ts`, used by the market Leaderboard and History and deep-tech bench.

**Profit and Loss today.** `AnnualReport.tsx` (684 lines, `business.css` 627) shows `statementLines()` (`business/yearly.ts:163`): up to 24 label/value strings, a 520-char note, then price and production sliders. Six report variants, all text (classic and deep-tech minigames, Lab, Studio and Financial Institution reports as notices, Nation report). Data that exists:
- `BizState.last` (full Statement, last year only) and `history: YearRecord[]` (9 numbers, 10 kept). No per-year cash, debt, cost split or balance sheet.
- `economicReportOf(b)` (`economic-report.ts`): an exact, validated year-on-year profit bridge. Free waterfall data.
- `MarketHistory` (20 years: share, rank, size, leader share, hhi). Rival shares are current-year only.
- Nation `reports` (12 years, approval and macro), careers kit `rows` (rank, of, standing per year), `scorecard.ts` ScoreRow (text only).
- Stock and index years are pure (`invest/engine.ts exchangeYear`): charts need no storage.
- No net-worth history anywhere. `CvEntry` has startAge/endAge, so a life timeline is mostly derivable.

**Notifications.** Every result is a blocking popup: 1,716 `notice()` and 482 `scriptChoice()` sites; 256 test files read `g.queue`. Per year: plain life 2 popups and 4.5 log lines; one company 3-8 and 9-14; six companies 5-8 and 20-31. Precedent: `bundleCeoLetters`.

**Accessibility and mobile.** Sheets are `role=dialog` without `aria-modal`, focus trap, focus restore or inert background (FEATURE-ROADMAP "UI and accessibility" is PLANNED). Contrast: muted text on page background 4.19:1, `--tone-good` 4.40:1, brand green/orange/yellow 2.2-2.4:1 on white (unusable for chart marks). Header icons 32px. Chrome is about 40% of a phone screen. No jsdom: UI is tested through pure functions.

**Performance.** Bundle about 7.8 MB (2.65 MB gz), `src/ui` under 5%. State is 1.4-1.7 MB JSON, 98% `flags.worldEconomy` (80k of the 500k node cap). Each tap costs `structuredClone` 30ms plus `JSON.stringify` 20ms in Node, more on a phone. A full menu walk is 300ms warm.

## 2. GAPS

1. P&L is strings: no waterfall, history, balance sheet or cash flow (the last two need A's ledger).
2. Rankings are text with ▓ bars: no rank change, sparklines or "you with neighbours".
3. No net-worth or life timeline; the death screen has no life chart.
4. No search, palette, pins, recents or breadcrumbs.
5. Flat 30-36 row roots, no domain hubs; people are not MenuNodes, so cannot be found or deep-linked.
6. Popup stream, no inbox; per-company report modals pile up.
7. Accessibility debt that charts must not inherit; bundle and state budgets rule out chart libraries and big histories.

## 3. DESIGN

**3.1 Model stays data.** Add only optional fields: `MenuBase.keywords?`, `section?`, `badge?: (g) => string|number|null`, `MenuInfo.chart?: (g) => ChartSpec|null` (`text` stays the accessible summary and test surface). Tests and `fuzz-kit` keep working. Guard reorganising with a tree-snapshot test: the reachable action-id set before and after must match.

**3.2 Hubs** (pure builders in `src/game/hubs/`: chart panels, "Needs you" badge rows, then sections).
- Career: job card, CV meter, report-card ladders.
- Wealth: net-worth line, one card per company from `companyCards(g)` (health, sales sparkline, runway).
- People: a `peopleMenu` adapter makes each person a `MenuGroup` (`person.<id>`), searchable and linkable (feeds D).
- World: Activities regrouped into 8 sections (Health and Mind, Love and Social, Money and Games, Law and Crime, Travel, Fame and Media, Home and Shopping, World and Politics); Do Anything on top, Surrender last (B, E).
- Company cockpit: KPI tiles (sales, net, cash, value, delta, sparkline) and four tiles (Run, Money, Leadership, Exit) in place of the 5 dashboard rows plus 39-row list.
- Lint test: groups over 12 rows need headings; one-row groups inline.

**3.3 Search, pins, recents.** `ui/nav/searchIndex.ts` (pure) walks `children(g)` only (never hints or subtitles; hints can run `bestPlan`) into `{idPath, label, breadcrumb, keywords, lockReason, entity}`; people, companies and stocks are entities. Rank: prefix, word start, substring, subsequence, then pins and recents; locked rows last with their reason; final row "Do Anything: <query>". Time-sliced idle walk, cached by `(lifeId, year, age, assets.length, job, office)`. Any action costs 3-4 taps (open, type, tap, input) instead of 6-8. Pins (12 per life) and recents (8) are UI state in localStorage `anotherlife.ui.v1`, never in GameState (`act()` clones it every tap; Time Machine would rewind it). The chip becomes the newest recent; breadcrumbs under the sheet header (`popTo(n)`); deep links reuse `MenuSheet initial`. Header gains search and inbox-bell buttons. Desktop: Ctrl/Cmd+K and "/" open the palette, 1-4 open tabs, A ages.

**3.4 Notifications.** Step 1, no engine change: `ModalHost` merges consecutive `notice` heads into one digest card with one OK (`dismissNotices(ids)`). Step 2: optional `NoticeModal.weight?: 'minor'`; `store.processQueue` (not the engine) routes minor ones to `g.flags.inbox` (60 items, 160 chars, optional deep link) under a Quiet Mode setting; bad-tone, health, legal and large-money notices stay modal. Year-End Desk: all queued annual reports in one frame, a stepper, "approve every suggested plan" (existing `finishMinigame`, `skip`). LifeLog shows the last 3 years open, older collapsed (bounds DOM).

**3.5 Chart kit** (`src/ui/charts`, inline SVG, no dependencies).
- `ChartSpec` (JSON) in `src/game/charts/spec.ts`: `{kind, title, unit, x, series:[{id,label,tone,values}], marks, summary}`. Pure builders in `src/game/charts/` read settled years only (no forecasts, no RNG) and pass through H's reveal filter, so hidden rival strength is never plotted. Money stays internal dollars; labels use `shortMoney` under `withMoneyContext(moneyContextOf(g))`; multi-year axes are constant dollars with a "prices of {year}" chip.
- Components (lines): geometry 450; Frame 220 (title, legend, readout, table toggle); Sparkline 70; LineChart 200; BarChart stacked 240; Waterfall 200; RankLadder 220 (rank delta, sparkline, "you" pinned with neighbours); Timeline 280; Meter 90; KpiTile 90; BulletRow 60; useScrub 120; CSS tokens 220. About 2,300 lines plus 900 test lines; about 30 KB minified (10 KB gz, 0.4% of bundle). Lazy-load kit and palette.
- Catalog: P&L waterfall (from `Statement`, sums to net within $1); profit bridge; cost-structure history; balance sheet and cash walk; market share vs leader over 20 years; rival ladder; net-worth and life timelines; stock lines; career standing and nation approval; CV meter and lanes.
- **New series (optional, bounded).** S1 `YearRecord` adds cash, debt, inventory value, cogs, wages, rent, marketing, interest, upkeep, other, dividends, draws, injections, capex; 20 years, about 420 nodes per company. S2 `MarketHistory.top?: [id, share][]` (8 rivals), 320 nodes. S3 `flags.lifeSeries` v1: a row per age `[age, year, netWorth, cash, debt, income, happiness, health]`, 120 rows, written idempotently by age at the end of `ageUp`; `GraveyardEntry.spark` 40 points. Total under 6k nodes (1.2% of cap). The cash walk uses an honest "everything else" residual until A's ledger zeroes it; a test then pins it to 0.
- Annual Report 2.0: tabs Summary, P&L, Balance and Cash, Market, Plan; sticky Approve and Keep buttons; plan logic untouched; builder adds `data.chart`, read defensively like `readReportData`.
- Accessibility bar: `role=img` with title and desc, readout row (no hover), arrow-key scrub, Show-as-table, 44px targets, no colour-only encoding, Okabe-Ito `--chart-1..6` for light and dark, reduced motion, 360px width, at most 150 SVG nodes per chart. Also focus trap, restore and `inert` for Sheet and PopupFrame, roving tabindex, contrast fixes. Tests: `renderToStaticMarkup` and geometry properties.

## 4. WORK BREAKDOWN

- G12 Accessibility pass: M. No deps; first.
- G8 Nav core (fields, sections, regroup roots, `peopleMenu`, breadcrumbs, deep links, snapshot test): M.
- G1 ChartSpec, geometry, builders skeleton: M.
- G2 Chart components and CSS: L (G1).
- G3 Series S1-S3, clamps, idempotent writers, old-save tests: M (A ledger fields, K save budget).
- G4 Annual Report 2.0 and Year-End Desk: L (G2, G3, A, J).
- G5 Company and Wealth cockpits: M (G2, G3).
- G6 Rankings (market, careers, AI lab, music, nation), stock lists with sparklines: M (G2; F, I).
- G7 Net-worth and life timelines (profile, death, graveyard, CV): M (G3, D, E).
- G9 Search, palette, pins, recents: M-L (G8).
- G10 Career, People, World cockpits: L (G8; B, C, D, E).
- G11 Digest, inbox, quiet mode, `weight` on top 20 emitters: M (E).
- G13 Desktop two-pane (optional): S-M. G14 Lazy chunks, LifeLog collapse: S.
Total about 16-20k lines with tests (XL). Order: G12, G8, G1; then G2, G9, G11; G3 with A; then G4-G7, G10.

## 5. RISKS

- Reorganising can strand ids in return points and tests: keep ids, add hubs as new roots, snapshot-test reachability.
- Search walks every `children()`: a slow or impure one hurts. `fuzz-kit` already freezes state; add an index test over its states.
- Charts can leak knowledge (H) or the future: settled years and the reveal filter only; keep the existing labelled "Estimate".
- Balance sheet and cash flow depend on A; a residual shipped early must be labelled.
- State growth: S1 is 2.3x a YearRecord; old saves show "history starts {year}". Tests: clamp and migration fixtures, year re-run idempotence, node-cap check.
- Inbox could hide something urgent: only `weight:'minor'` routes; test that bad-tone and large-money notices never route.
- Per-tap 1.4 MB clone already hurts phones; K should shrink `worldEconomy`.
- Add a frozen-state test running every chart builder without writes.

## 6. OPEN QUESTIONS

1. Keep the four tab names plus Age and open each on a cockpit? Default: yes; search and inbox in the header.
2. Quiet Mode on by default? Default: yes; decisions and money or health shocks stay modal.
3. Chart money basis: constant dollars or nominal per year? Default: constant, with a "prices of {year}" chip.
4. Desktop two-pane layout now? Default: no; palette and shortcuts only.
5. History depth: 20 years of company books, whole-life yearly series? Default: yes.
