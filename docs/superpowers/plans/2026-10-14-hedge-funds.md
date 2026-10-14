# Hedge Funds: Personal, Family and Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Investments › Hedge Funds the player can start a Personal fund and a Family fund with their own cash, and set an ordinary company's spare cash to work in a Company fund. The funds run on the hedge-fund firm's strategy maths, charge no fee, show once in net worth and the estate, tax gains when money comes out, let relatives join, and pass to heirs.

**Architecture:** The funds reuse the firm's pure model (`fund-model.ts`), not the firm. Two small extractions let one formula serve both. Six new business modules do the work:
- `hedge-record.ts`: the two saved records and their readers. It imports nothing, because `state.ts` imports it.
- `hedge-model.ts`: the year's return, skills, previews and gates. Pure.
- `hedge-fund.ts`: Personal and Family funds (one Asset each): start, put in, take out, close, relatives, settling holders.
- `hedge-company.ts`: the company "cash at work" sleeve, booked before `simulateYear`.
- `hedge-year.ts`: the yearly hook, its one popup, and the payout at death.
- `hedge-menu.ts`: the Investments row, the fund screens and the company screen. It registers with `investments.ts` through one hook, `registerHedgeFunds`, so the engine file still imports nothing from `business/`.

Person and family funds ride `Asset.value` (kind `investment`, `details.type` `'hedge'`, the `npcEquity` precedent). A company fund adds no asset: its cash stays in `b.cash` and the result moves through `yearIncome` or `yearCosts`, the way `bookFranchiseYear` books royalties. Nothing in `manage.ts`, `economy.ts` or the exit code changes.

**Tech Stack:** TypeScript (strict), Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-hedge-funds-design.md`. This plan covers all of it: §3 (D1-D14), §4, §5, §6, §7, the tests in §9 and the risks in §11.

## Global Constraints

**Build and tests**
- Run tests one file at a time while developing: `npx vitest run <file>`. Typecheck with `npm run typecheck`. The full suite (`npm test`, about 20 minutes) runs only in Task 7.
- No `any`, no `@ts-ignore`, no new dependencies.
- A test fixture that would break `tsc` goes in a `.txt` file. Hostile values that are valid `Json` (`7`, `'x'`, `null`) are written inline.

**Engineering rules (`docs/ARCHITECTURE.md`)**
- Rule 1: state is plain JSON. Rule 3: actions change `g` in place. Rule 8: menus are functions of state and must render from a deep-frozen state (`test/fuzz-kit.ts` `deepFreeze`). Rule 9: `investments.ts` imports nothing from `business/`. Rule 11: money. Rule 13: voice.

**Determinism (spec §6)**
- Nothing in this feature reads or advances `g.rng`: not a menu, a quote, a preview, an action or the yearly step. Noise comes from `hedgeRng` (company: `fundRng`). Ids come from `uid` (a counter). The popup id is the year's.
- A game with no fund and no company target must return from every new entry point before doing any work.

**Money**
- Money is internal constant-2026 US dollars. Show it only at render time through `money`, `formatMoney` or `shortMoney`. Money sliders set `money: true`.
- Cash moves only through `addMoney`, `spend`, `earnIncome` and `realize`. A fund never creates money: every test that moves money checks that the total is conserved.

**Saves**
- Every new field is optional. `BizState.hedge` is whitelisted in `normalizeBiz`. `BIZ_VERSION` stays 2. Every read of a stored record goes through `readHedge` or `readCompanyHedge`.

**Player-facing text**
- Follows `docs/VOICE.md`: short, facts, contractions, no morals, no em-dashes, no disclaimers. Colons only for prices and labels. The exact copy in this plan is final; other strings follow the length caps (life-log line 90, outcome 120, tooltip 120). Never put model names in code or docs.

**Commits**
- One commit per task, after that task's tests and `npm run typecheck` pass. End every commit message with a blank line and the two trailer lines (Co-Authored-By and Claude-Session) that the dispatching prompt gives you. Push after Task 7.

**Scope**
- Do not edit `manage.ts`, `economy.ts`, `rd.ts`, `products.ts`, `product-market.ts`, `history/market-events.ts`, `exit.ts`, `board*.ts`, `own-*.ts` or `dividend-*.ts`. Do not change what `hedgeYear`, `fundAutopilot` or any firm menu does.
- Other builds edit `state.ts`, `yearly.ts`, `investments.ts` and `aging.ts` at the same time. Re-read the file just before editing it and keep each change to the hunks named in the task.

## Review Focus

The inputs most likely to bite a player, most likely first. Each has a pinning test in the task named.
- **Counting twice.** The fund is one Asset worth your units only; relatives' money is never in your net worth or estate; a company fund adds nothing. Expected: net worth is unchanged by starting a fund, inviting a relative, and setting a company target; Sell Everything ignores funds; an estate pays your units once and the relatives theirs once. Tests: Task 3 (double counting), Task 4 (valuation), Task 5 (estate).
- **A sleeve that starves or sinks a company.** Expected: `work <= payoutCash - floor`, and after the worst year `cash - debt - earmarked >= floor`. Tests: Task 4.
- **Relatives' money.** Expected: an invite never exceeds your own units' value or 20% of their money; settling never changes the unit price; a dropped fund pays relatives before the heir's cash is built. Tests: Task 3, Task 5.
- **Old and hostile saves.** Expected: a damaged record reads as none, the fund keeps its value in net worth, nothing throws. Tests: Task 1, Task 6.
- **Officials and leverage.** Expected: a politician cannot set Macro, and Macro reverts after one year. Tests: Task 2, Task 3, Task 5.

## File ownership and order

`*` marks a file the in-progress Heavy R&D build also edits. `†` marks a file the dividends build edits. `‡` marks a file the advisor and manager plan edits. Files without a mark are edited by no other build.

| Task | Creates | Modifies | Runs after | Can run alongside |
|---|---|---|---|---|
| 1 Records and kit | `src/game/business/hedge-record.ts`, `test/hedge-kit.ts`, `test/hedge-record.test.ts` | `src/game/business/state.ts` * † | | 2 |
| 2 Return model | `src/game/business/hedge-model.ts`, `test/hedge-model.test.ts` | `src/game/business/fund-model.ts`, `src/game/business/fund-outlook.ts` | | 1 |
| 3 Personal and family funds | `src/game/business/hedge-fund.ts`, `test/hedge-fund.test.ts` | `src/game/investments.ts` ‡ | 1, 2 | 4 |
| 4 Company fund | `src/game/business/hedge-company.ts`, `test/hedge-company.test.ts` | `src/game/business/yearly.ts` † | 1, 2 | 3 |
| 5 Year end, heirs, estate | `src/game/business/hedge-year.ts`, `test/hedge-year.test.ts` | `src/game/aging.ts` ‡, `src/game/life.ts` | 3, 4 | |
| 6 Menus | `src/game/business/hedge-menu.ts`, `test/hedge-menu.test.ts` | `src/game/business.ts` | 3, 4, 5 | |
| 7 Story, docs, notes | `test/hedge-story.test.ts`, `docs/RELEASE-v2.8.0.md` (create if absent, else append a section) | `docs/ARCHITECTURE.md` † ‡, `docs/BUSINESS-AND-DYNASTIES.md` † ‡ | 6 | |

Not touched by any task: `manage.ts`, `economy.ts`, `rd.ts`, `products.ts`, `product-market.ts`, `history/market-events.ts`, `exit.ts`, `dynasty-ownership.ts`, `core.ts`, `types.ts`.

The files of parallel tasks are disjoint, but every task ends on the whole-project `npm run typecheck`, and Tasks 3 and 4 import what Tasks 1 and 2 produce. So parallel tasks run in separate worktrees (superpowers:using-git-worktrees), each rebased onto the last finished task before it commits. In a single tree, run 1 to 7 in order. Task 3 edits `investments.ts` and the advisor plan lands three hunks there: run Task 3 before or after the advisor's engine task, not alongside it.

---

### Task 1: The records, their readers and the test kit

**Files:**
- Create: `src/game/business/hedge-record.ts`, `test/hedge-kit.ts`
- Modify: `src/game/business/state.ts` *: `import { companyHedgeField, type CompanyHedge } from './hedge-record'`; the field `hedge?: CompanyHedge` after `dividend?`; `...companyHedgeField(d.hedge)` after `...dividendField(d.dividend)` in `normalizeBiz`. Re-read the file first: the dividends build added its lines there.
- Test: `test/hedge-record.test.ts`

**Interfaces** (all in `hedge-record.ts`, which has only type imports from `./fund-state` and `../types`):
- `export const RUNNING_COST = 0.005`, `export const MAX_HOLDERS = 24`
- `export const HEDGE_STRATEGY_IDS: readonly HedgeStrategy[]` = `['longShort', 'macro', 'quant', 'event']`, and `export const MACRO_CALL_IDS: readonly MacroCall[]` = `['bull', 'bear', 'flat']`. They repeat the firm's lists because a value import of `fund-state.ts` would make an import cycle through `state.ts`; a test pins them equal.
- `export interface Holder { id: string; units: number }`, `export interface HedgeMark { y: number; r: number; m: number }`
- `export interface HedgeFund { v: 1; owner: 'person' | 'family'; countryId: string; founded: number; strategy: HedgeStrategy; call: MacroCall; lev: number; nav: number; units: number; mine: number; cost: number; holders: Holder[]; lastYear: number; last: { year: number; gross: number; net: number; market: number } | null; marks: HedgeMark[] }`
- `export interface CompanyHedge { v: 1; target: number; strategy: HedgeStrategy; call: MacroCall; lev: number; total: number; last?: { year: number; work: number; gross: number; net: number; market: number; pnl: number; why?: string } }`
- `export function readHedge(raw: unknown): HedgeFund | null`, `export function readCompanyHedge(raw: unknown): CompanyHedge | null`, `export function companyHedgeField(raw: unknown): { hedge?: CompanyHedge }`
- `export function unitPrice(f: Pick<HedgeFund, 'nav' | 'units'>): number`: `nav / units`, and 1 when `units` is not above 0.
- `export function unitsValue(f: Pick<HedgeFund, 'nav' | 'units'>, units: number): number`: `units x unitPrice(f)`.

Reader rules. Both return a fresh object, never throw, never mutate their input.
- `readHedge`: null unless a plain object with `v === 1` and `owner` exactly `'person'` or `'family'`. `countryId` is a string of 1 to 8 characters, else `'us'`. `founded` is a finite number rounded and clamped to 1949-2300, else 1949. `strategy`, `call` outside the lists become `'longShort'`, `'flat'`. `lev` is a finite number clamped to 1-3 and rounded to halves, else 1. `nav`, `mine`, `cost` are finite numbers clamped to 0-1e15, else 0. `holders` is an array of plain `{id: string of 1-64 chars, units: finite > 0}`, merged by id, at most `MAX_HOLDERS`, and always `[]` for a person fund. `units` is a finite number above 0, else `nav` if that is above 0, else 1; then raised to at least `mine + sum of holders' units`. `lastYear` is an integer clamped to -1 to 2300, else -1. `last` needs a finite integer `year` (1800-2300) and finite `gross`, `net`, `market` (each clamped to -1 to 10), else null. `marks` keeps the last 12 plain entries with finite `y`, `r`, `m`.
- `readCompanyHedge`: null unless a plain object with `v === 1`. `target` is finite, clamped to 0-1e15 and rounded, else 0. `strategy`, `call`, `lev` as above. `total` is finite, clamped to +-1e15 and rounded, else 0. `last` is kept only with an integer `year` (1800-2300), `work` 0-1e15, finite `gross`, `net`, `market` (clamped -1 to 10) and finite `pnl` (+-1e15, rounded); `why` is kept only as a string cut to 80 characters.
- `companyHedgeField(raw)` is `{ hedge }` for a usable record, else `{}`.

**Kit** (`test/hedge-kit.ts`), plain game state, no `g.rng`:
- `rich(seed = 61, countryId = 'us', money = 5_000_000, year = 2026): GameState`: `makeTestGame(seed, { age: 45, money, countryId, city: <the country's first city>, residence: { status: 'renting', rent: 0 } })`, `lifeId = 'hedge-' + seed`, `year`, and a one-year `g.log`.
- `kin(g, relation: Person['relation'] = 'sibling', money = 2_000_000, opts: { age?: number; relationship?: number } = {}): Person`: `createPerson(g, { relation, age: opts.age ?? 44, relationship: opts.relationship ?? 70, money, countryId: g.character.countryId })`.
- `company(g, opts: { cash?: number; name?: string; countryId?: string; profit?: number } = {}): { a: Asset; b: BizState }`: the `privateCompany` pattern of `test/own-listing-kit.ts` (a `software` company made with `createBusinessAsset(g, name, newBiz(...), 1e6)`, pushed onto `g.assets`, three history years with `profit` (default 20e6), `b.valuation = valuationOf(b)`, `refreshValue`), then `b.cash = opts.cash ?? 5_000_000`.

- [ ] **Step 1: Write the kit and the failing tests** in `test/hedge-record.test.ts`.
  - `'reads a good fund record unchanged'`: a family record with one holder, a `last` and two marks. `readHedge(JSON.parse(JSON.stringify(good)))` equals it, and is not the same object.
  - `'rejects what is not a fund'`: `it.each` over `null, undefined, 7, 'x', [], {}, { v: 2, owner: 'person' }, { v: 1, owner: 'company' }` gives null.
  - `'cleans every field'`: from `good` with `strategy: 'moon', call: 7, lev: 9, nav: -5, units: NaN, mine: Infinity, cost: '1', holders: 'x', lastYear: 'y', last: 3, marks: 'z', founded: 'old', countryId: 7` it reads `longShort`, `flat`, `lev 3`, `nav 0`, `mine 0`, `cost 0`, no holders, `lastYear -1`, `last null`, no marks, `founded 1949`, `'us'`, and every number is finite.
  - `'units never fall below what is held, so damage cannot raise a price'`: `{ nav: 1000, units: 10, mine: 8, holders: [{ id: 'a', units: 5 }] }` reads `units 13` and `unitPrice` 1000 / 13.
  - `'holders are merged, positive and capped'`: duplicate ids merge; units `0`, `-3`, `NaN` are dropped; 30 distinct ids keep 24; a person fund keeps none.
  - `'marks keep the last twelve'`, `'never mutates its input'` (deep-frozen input), `'the strategy and call lists match the firm'` (equal to `HEDGE_STRATEGIES`, `MACRO_CALLS` from `fund-state.ts`), `'unit price is 1 with no units'`.
  - `'reads a company record'`: unchanged for a good one; `target -4` reads 0, `1e30` reads 1e15; bad enums take defaults; a `last` with a bad year is dropped and the record stays; `why` longer than 80 is cut; `7`, `[]`, `{ v: 2 }` give null.
  - `'companyHedgeField'`: `{}` for junk, `{ hedge }` for a good record.
  - `'normalizeBiz keeps a good record and drops a bad one'`: with `company(rich())`, `normalizeBiz({ ...a.details, hedge: good }, 2026).hedge` equals `good` and survives a JSON round trip; with `hedge: 'junk'` the key is absent (`'hedge' in result` is false); a company with no field has no key.
- [ ] **Step 2: Run** `npx vitest run test/hedge-record.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `hedge-record.ts`.
- [ ] **Step 4: Edit `state.ts`** as listed under Files. Keep the three hunks separate from the dividends and Heavy R&D lines.
- [ ] **Step 5: Run** `npx vitest run test/hedge-record.test.ts test/business.test.ts test/dividend-policy.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat: hedge fund records and their readers`.

### Task 2: The return model

**Files:**
- Modify: `src/game/business/fund-model.ts`: add `capacityOf`; `capacityFactor` (`:228`) returns `capacityOf(aum, skill, leadershipPower(b, 'quality'))`. No behaviour change.
- Modify: `src/game/business/fund-outlook.ts`: add `OutlookIn` and `outlookOf`; `strategyOutlook` (`:64`) builds an `OutlookIn` and returns `outlookOf(strategy, x)`. No behaviour change.
- Create: `src/game/business/hedge-model.ts`
- Test: `test/hedge-model.test.ts`

**Interfaces:**
- `fund-model.ts`: `export function capacityOf(aum: number, skill: number, quality = 0): number` = `clampN(Math.sqrt(4e9 * (1 + quality * .5) * (.5 + skill / 100) / Math.max(1, aum)), 0, 1)`.
- `fund-outlook.ts`: `export interface OutlookIn { skill: number; cap: number; drift: number; lev: number; algoEdge: number }` and `export function outlookOf(strategy: HedgeStrategy, x: OutlookIn): StrategyOutlook`, the four `if` branches of today's `strategyOutlook` with `alpha = alphaMean(x.skill) * (strategy === 'macro' ? 1 : x.cap)`, `f.lev` as `x.lev` and `f.algoEdge` as `x.algoEdge`.
- `hedge-model.ts` (imports `fund-model`, `fund-outlook`, `../assets` `seeded`, `../timeMachine` `outcomeTag`, `../talents`, `../history/markets` `investingBlocked`, `../invest/engine`, `../special/politics` `politicianJob`, `../events/wealth-core` `typicalIncome`, `./hedge-record`):
  - `export function hedgeRng(g: GameState, id: string, year: number): ReturnType<typeof seeded>`: ``seeded(`${g.lifeId}${outcomeTag(g, year)}|hedge1|${id}|${year}`)``.
  - `export function runnerSkill(g: GameState, since: number): number`: the owner branch of `ceoSkill` (`economy.ts:231-242`) without the Business-run floor and the Business talent: `smarts x .55 + discipline x .15 + 10`, +15 with an MBA or +8 with a business-type degree, `+ min(12, g.year - since)`, -10 with an addiction, clamped 5-100.
  - `export function leadOf(g: GameState, since: number): number`: `runnerSkill` plus 8 while alive with the Investing talent, clamped 0-100 (`leaderSkill`'s rule).
  - `export function skillOf(lead: number): number` = `clampN(lead * .62 + 6, 5, 100)`.
  - `export interface YearIn { countryId: string; strategy: HedgeStrategy; call: MacroCall; lev: number; nav: number; skill: number; year: number }` and `export interface YearOut { gross: number; net: number; market: number }`.
  - `export function vehicleYear(g: GameState, x: YearIn, r: ReturnType<typeof seeded>): YearOut`: `market = marketMove(g, x.countryId, x.year)`; `cap = capacityOf(x.nav, x.skill)`; `alpha = alphaMean(x.skill) * (x.strategy === 'macro' ? 1 : cap)`; `quantEdge = x.strategy === 'quant' ? (x.skill - 50) * .0003 * cap : 0`; `gross = hedgeGross(x.strategy, market, alpha, quantEdge, { call: x.call, lev: x.lev }, financingCost(x.countryId, x.year), r)`; `net = (1 + gross) * (1 - RUNNING_COST) - 1`.
  - `export function vehicleOutlook(strategy: HedgeStrategy, x: { countryId: string; skill: number; nav: number; lev: number }): { expected: number; swing: number }`: `outlookOf` with `drift = marketDrift(x.countryId)`, `cap = capacityOf(x.nav, x.skill)`, `algoEdge 0`, and `expected` lowered by `RUNNING_COST`.
  - `export function autoTerms(x: { countryId: string; lead: number; nav: number; year: number }): { strategy: HedgeStrategy; call: 'flat'; lev: 1 }`: the firm's autopilot (`fund-manager.ts:32-37`): at `lead >= 50` the best of Long/Short, Event-driven and Quant (Quant only when `quantBlock` is null) by `expected - swing * .2`, else Long/Short.
  - `export function seedMin(g: GameState): number` = `Math.round(5 * typicalIncome(g))`.
  - `export function personBlock(g: GameState): string | null`: `'You are no longer alive.'`, `"You can't run a fund from prison."`, `'You must be 18 to start a fund.'`, in that order.
  - `export function marketBlock(g: GameState, countryId: string): string | null`: `hedgeBlock(g.year)`, then `investingBlocked(countryId, g.year)`, then a closed exchange (`` `The ${exchangeName(info, g.year)} is closed this year.` ``) or none (`` `${getCountry(countryId).name} has no stock market to follow.` ``).
  - `export function strategyBlock(g: GameState, countryId: string, s: HedgeStrategy): string | null`: `quantBlock(countryId, g.year)` for Quant, `macroBlock(g)` for Macro.
  - `export function macroBlock(g: GameState): string | null`: `"Officials can't make market calls."` while `politicianJob(g)` is not null.

- [ ] **Step 1: Write the failing tests** in `test/hedge-model.test.ts`, using `firm('hedge')` from `test/fund-fixtures.ts` for the firm comparisons and `newLeader` from `test/politics-kit.ts` for an official.
  - `'capacityOf is capacityFactor'`: for a firm `b` and `f = readFund(b)`, `capacityFactor(aum, 60, b) === capacityOf(aum, 60, leadershipPower(b, 'quality'))` for `aum` of `1e6, 1e9, 1e11`; `capacityOf(1e10, 60) < capacityOf(1e9, 60)`; the value is within 0-1 for `aum 0`.
  - `'outlookOf is strategyOutlook'`: for each strategy, `strategyOutlook(g, b, f, s)` deep-equals `outlookOf(s, { skill: fundSkill(g, b), cap: capacityFactor(f.aum, fundSkill(g, b), b), drift: marketDrift(b.countryId), lev: f.lev, algoEdge: f.algoEdge })`.
  - `'runnerSkill is the owner branch of ceoSkill'`: for an owner-run firm with no Business talent, `runnerSkill(g, b.founded) === ceoSkill(g, b)`; with the Investing talent, `leadOf(g, b.founded) === leaderSkill(g, b)`.
  - `'vehicleYear is the firm formula'`: with `r1 = seeded('k')` and `r2 = seeded('k')`, `vehicleYear(g, x, r1).gross` equals `hedgeGross(x.strategy, marketMove(g, 'us', x.year), alpha, quantEdge, { call, lev }, financingCost('us', x.year), r2)` for Long/Short, Event-driven, Quant and Macro.
  - `'net takes the running cost'`: `net` equals `(1 + gross) * (1 - RUNNING_COST) - 1` within 1e-12.
  - `'a year is the same for the same inputs and differs by id and year'`: `hedgeRng(g, 'a1', 2027)` twice gives equal `vehicleYear`; across ids `a1..a5` and years 2027-2029 at least three distinct values; `JSON.stringify(g)` and `g.rng` are unchanged.
  - `'a Time Machine fork rerolls the year'`: set `g.flags.timelineForks = [{ year: g.year - 2, salt: 'abc123' }]` as `test/time-machine.test.ts` does and show that `vehicleYear` for a year at or after the fork differs from the unforked one.
  - `'is bounded in every era'`: for seeds 1-5, years 1950-2030, every strategy, `lev` 1 and 3, calls bull and bear: `net` is finite and between -0.9503 and 4.
  - `'no strategy out-earns the US index at any skill'`: for `skill` of 5, 20, 41, 68 and `nav` of 1e6 and 1e9, every non-macro `vehicleOutlook(s, ...).expected` and Macro's are below `marketDrift('us')` (0.08).
  - `'autoTerms'`: at `lead 30` it is Long/Short; at `lead 80` it is one of the three and never Quant when `quantBlock` is set (a poor country in 1980); `call` is `'flat'` and `lev` 1.
  - `'blocks'`: `personBlock` for dead, in prison, 17; `marketBlock` is the `hedgeBlock` text in 1948, equals `investingBlocked('cn', 1960)` where that is set, names a closed exchange (find a closed year with `exchangeStatus`); `strategyBlock(g, 'us', 'quant')` is null in 2026 and set for a country and year where `quantBlock` is; `macroBlock` is null normally and set for `newLeader(5)`; `seedMin` is `Math.round(5 * typicalIncome(g))`.
- [ ] **Step 2: Run** `npx vitest run test/hedge-model.test.ts`. Expected: FAIL, imports missing.
- [ ] **Step 3: Extract** `capacityOf` and `outlookOf` and switch the two callers. No other line of the firm's files changes.
- [ ] **Step 4: Implement** `hedge-model.ts`.
- [ ] **Step 5: Run** `npx vitest run test/hedge-model.test.ts test/fund.test.ts test/fund-events.test.ts test/fund-review.test.ts test/fund-vc.test.ts test/finance-firm.test.ts` and `npm run typecheck`. Expected: PASS. The firm suites prove the extractions changed nothing.
- [ ] **Step 6: Commit** `feat: hedge fund return model shared with the firm`.

### Task 3: Personal and family funds

**Files:**
- Create: `src/game/business/hedge-fund.ts`
- Modify: `src/game/investments.ts` ‡, four small hunks:
  1. `const SIDE_ACCOUNTS: ReadonlySet<string> = new Set(['npcEquity', 'hedge'])`; `investmentHoldings` (`:261`) filters `!SIDE_ACCOUNTS.has(str(a.details.type))`; the `sellCore` guard (`:1145`) uses the same set.
  2. `export function realize`, `export interface Realized` and `export function lossCarry` (`:507-523`): the keyword `export` and nothing else.
  3. The hook: `export interface HedgeFundHooks { row: (g: GameState) => MenuGroup | null; view: (g: GameState, a: Asset) => MenuNode[]; subtitle: (g: GameState, a: Asset) => string }` and `export function registerHedgeFunds(h: HedgeFundHooks): void`. Calls are wrapped in `try/catch` and fall back to nothing, as `ownStockRows` does. `investmentAssetView` (`:1526`) returns `hooks.view(g, a)` for `type === 'hedge'` (fallback: one info row, `'This fund is not available right now.'`); `investmentAssetSubtitle` (`:1536`, rename `_g` to `g`) returns `hooks.subtitle(g, a)` (fallback `shortMoney(a.value)`).
  4. `investmentsMenu.children` (`:1981`): after `nodes.push(stocksMenu, ..., cryptoMenu)`, push `hooks.row(g)` when it is not null.
- Test: `test/hedge-fund.test.ts`

**Interfaces** (`hedge-fund.ts`; consumes Tasks 1 and 2, `investments.ts` `realize`, `lossCarry`, `minTrade`; `dynasty-ownership.ts` `familyStakeHeirs`, `cashOutFamilyHolders`; `events/will-core.ts` `willRole`, `isEstranged`; `core.ts` `addMoney`, `addRelationship`, `log`, `notice`, `fullName`, `relationLabel`; `rng.ts` `uid`; `finance.ts` `gameIncomeTax`):
- `export const INVITE_SHARE = 0.2`, `export const INVITE_MAX = 8`, `export const LEAVE_BELOW = 15`
- `export interface FundRow { a: Asset; f: HedgeFund }`
- `export function fundsOf(g: GameState): FundRow[]`: assets of kind `investment` with `details.type === 'hedge'` and a readable record, in asset order.
- `export function fundOf(g: GameState, owner: 'person' | 'family'): FundRow | null`
- `export function saveFund(a: Asset, f: HedgeFund): void`: writes `a.details.type = 'hedge'`, a JSON copy of `f` in `a.details.hf`, `a.value = clamp(round(unitsValue(f, f.mine)), 0, 1e15)` and `a.purchasePrice = round(f.cost)`.
- `export function startBlock(g: GameState, owner: 'person' | 'family'): string | null`: `personBlock`, then `marketBlock(g, g.character.countryId)`, then `` `You already have a ${owner === 'person' ? 'personal' : 'family'} fund.` ``
- `export function startFund(g: GameState, owner: 'person' | 'family', seed: number): boolean`: needs `startBlock` null, a finite `seed` rounded, `seed >= seedMin(g)` (`` `A fund starts at ${money(seedMin(g))}.` ``) and `seed <= cash` (`"You can't cover that."`); each refusal is `notice(g, 'Start a Fund', reason)` and false. Otherwise: `addMoney(g, -seed)`; a new Asset (id from `uid(g, 'a')`, kind `'investment'`, name `${lastName} Personal Fund` or `${lastName} Family Fund`, emoji `'🦈'`, `purchasePrice` and `value` the seed, `condition` 100, `purchasedAge` the age, `upkeep` 0) whose `details.hf` is `{ v: 1, owner, countryId: g.character.countryId, founded: g.year, strategy: 'longShort', call: 'flat', lev: 1, nav: seed, units: seed, mine: seed, cost: seed, holders: [], lastYear: -1, last: null, marks: [] }`, pushed onto `g.assets`; a good life-log line, ``I started the ${name}.``; notice `Fund Started`: `` `${name} opened with ${money(seed)}. You run it. It pays no fee, only ${pct(RUNNING_COST, 1)} a year to run.` ``
- `export function putBlock(g: GameState, f: HedgeFund): string | null` (`personBlock`, `marketBlock`), `export function putIn(g: GameState, assetId: string, dollars: number): boolean`: needs `dollars` finite and `>= minTrade(g)` and `<= cash`, rounded; units bought at `unitPrice`; `nav`, `units`, `mine`, `cost` all rise; notice `Money In`: `` `You put ${money(d)} into ${name}. You own ${pct(share, 1)}.` `` where `share = mine / units`.
- `export interface TakeQuote { gross: number; basis: number; gain: number; tax: number; closes: boolean; relatives: number }` and `export function takeQuote(g: GameState, f: HedgeFund, fraction: number): TakeQuote` (pure): `fraction` clamped 0-1; `closes` when `fraction >= 0.999` or what stays is worth under `minTrade(g)`; `gross = round(unitsValue(f, f.mine) * fraction)`; `basis = round(f.cost * fraction)`; `gain = gross - basis`; `tax` as `estimateTax` in `investments.ts:542` does it: `taxable = max(0, gain - min(lossCarry(g), max(0, gain)))`, `tax = gameIncomeTax(g, before + taxable) - gameIncomeTax(g, before)` with `before = max(0, g.flags.taxableIncome)`; `relatives` is the sum of holders' values when `closes`, else 0.
- `export function takeOut(g: GameState, assetId: string, fraction: number): boolean`: needs `putBlock` null and `fraction > 0`; a quote that closes calls `closeFund`; otherwise `realize(g, gross, gain, true)`, then `mine`, `units`, `nav`, `cost` fall by the units sold; notice `Money Out`: `` `You took ${money(gross)} out of ${name}.${tax > 0 ? ` Tax on the gain is about ${money(tax)}.` : ''}` ``.
- `export function closeFund(g: GameState, assetId: string): boolean`: `realize` for your units; relatives are paid through `cashOutFamilyHolders(g, holders.map((h) => ({ id: h.id, share: h.units / f.units })), f.nav, 'the family fund')`; the Asset leaves `g.assets`; a neutral life-log line, ``I closed the ${name}.``; notice `Fund Closed`: `` `${name} is closed. You got ${money(gross)}.${relatives > 0 ? ` Relatives got ${money(relatives)}.` : ''}` ``
- `export function setFundStrategy(g: GameState, assetId: string, s: HedgeStrategy): boolean`: refused by `strategyBlock`; sets the strategy; any strategy but Macro also resets `call` to flat and `lev` to 1.
- `export function setFundCall(g: GameState, assetId: string, call: MacroCall, lev?: number): boolean`: refused by `macroBlock`; sets Macro, the call and (when given) `lev` clamped 1-3 in halves.
- `export interface Candidate { person: Person; amount: number; why: string | null }` and `export function candidates(g: GameState, f: HedgeFund): Candidate[]` (pure): living contacts with a `willRole` other than `'friend'` who are not already holders, sorted by relationship then name, the first `INVITE_MAX`. `why`, first that applies: age under 18 `'Too young.'`; `data.disowned === true` `'You disowned them.'`; `isEstranged(g, p)` `'Not on speaking terms.'`; relationship under 40 `"They don't trust you with money yet."`; money under `5 * typicalIncome(g)` `"They don't have the savings."`; the fund is not a family fund or already holds `INVITE_MAX` `'The fund is full.'`. `amount = min(floor(INVITE_SHARE * p.money), floor(unitsValue(f, f.mine)))`.
- `export function invite(g: GameState, assetId: string, personId: string): boolean`: needs `putBlock` null and the candidate's `why` null; `p.money -= amount`; units bought at the price; holder added or topped up; notice `Relative Joined`: `` `${p.firstName} put ${money(amount)} into ${name}.` ``
- `export function payOutHolder(g: GameState, assetId: string, personId: string): boolean`: the holder's value goes to `p.money`; the holder leaves; `nav` and `units` fall by that holder's; notice `Paid Out`: `` `${p.firstName} took ${money(value)} out of ${name}.` ``
- `export function settleHolders(g: GameState, f: HedgeFund, name: string): string[]` (mutates `f`, returns life-log lines, never touches the unit price):
  1. A holder whose id is `g.character.id` merges into `mine`, with `cost` raised by their value.
  2. A holder with no matching contact leaves; the units and their value go from `units` and `nav`.
  3. A holder who is not alive: `familyStakeHeirs(g, person)` gives the heirs. Each heir who is `g.character.id` adds units to `mine` (cost raised by their value); each other heir who is a living contact becomes or tops up a holder (above `MAX_HOLDERS`, they are paid in cash instead). With no heirs the units leave with their value. Line: `` `${who}'s part of the ${name} went to ${names}.` `` or `` `${who}'s part of the ${name} left the family.` ``
  4. A living holder with relationship under `LEAVE_BELOW`, `data.disowned === true` or `isEstranged` is paid out as `payOutHolder` does. Line: `` `${p.firstName} took their money out of the ${name}.` ``

- [ ] **Step 1: Write the failing tests** in `test/hedge-fund.test.ts`, with the kit.
  - `describe('starting')`: `'opens a personal fund from cash'`: cash falls by exactly the seed, one Asset (`kind 'investment'`, `details.type 'hedge'`), `a.value === seed`, `a.purchasePrice === seed`, `netWorth(g)` unchanged, `investmentHoldings(g)` is empty, `g.rng` unchanged, names are `${lastName} Personal Fund` and `${lastName} Family Fund`. `'one fund of each kind'`: a second personal start is refused with the reason and a `Start a Fund` notice, while a family start works. `'refuses'`: below `seedMin`, 17 years old, in prison, 1948, a country with investing banned, a shut exchange, `seed > cash`, `NaN`; none moves money or adds an asset.
  - `describe('putting in and taking out')`: `'put in buys units at the price'` after a pool of 1.2M for 1M units: `mine` rises by `d / 1.2`, `cash` falls by `d`, `a.value` rises by `d`. `'take out pays the share and taxes the gain'`: gain 20% of 100%: 50% out pays `gross`, the cash change is `gross - tax`, `g.flags.taxableIncome` rises by the taxable part, `cost` falls pro rata, and `takeQuote(...).tax` equals the tax charged within $1. `'a loss adds to the carried loss'` (`g.flags.investLossCarry` rises). `'the last of it closes the fund'`: `takeOut(g, id, 1)` removes the Asset and pays relatives. `'refuses bad orders'`: `0`, `-5`, `NaN`, above cash, above value.
  - `describe('strategy')`: `'quant is refused where the firm refuses it'`, `'an official cannot call the market'` (`newLeader(5)` with a family fund started by hand), `'setFundCall sets Macro with leverage in halves'`, `'a non-macro strategy resets the call'`.
  - `describe('family')`: `'candidates'`: only adult relatives with a will role other than friend; friends, an ex-spouse, a 17-year-old, a disowned sibling (`p.data.disowned = true`), an estranged one (`updateWl` as `test/will-estate.test.ts` does), relationship 39 and money under 5 x typical income each carry their `why`; at most 8, closest first. `'an invite moves their money into units and creates nothing'`: `p.money + f.nav` is unchanged by the invite apart from the amount moving; the amount is `min(20% of their money, your units' value)`; `netWorth(g)` is exactly unchanged. `'pay out'` returns the value to `p.money`, shrinks `nav` and `units`, and leaves the price. `'a person fund cannot take relatives'`. `'full at eight'`.
  - `describe('settling')`: `'a late holder passes to modelled heirs'` (a spouse holder dies: their units join `mine` with cost raised); `'a late sibling with no modelled heirs leaves with their value'` (set `p.data.married = true`, see `familyStakeHeirs`); `'a cooled holder is paid out'` (relationship 10); `'a disowned or estranged holder is paid out'`; `'a missing contact leaves'`; `'the heir who is the character merges into mine'`; `'settling never changes the unit price and creates no money'` (money of everyone plus `nav` is unchanged except for units that left).
  - `describe('double counting')`: `'net worth counts your units once'`: start, invite, and put in; `netWorth(g)` never changes except by the cash that left the world (none). `'Sell Everything ignores the fund'`: `liquidatePortfolio(g)` leaves the Asset and its value. `'the fund is not a security'`: `investmentListing(g)` has no entry for it. `'hooks are optional'`: with no hook registered, `investmentAssetView(g, a)` returns the fallback row and `investmentAssetSubtitle` returns text.
  - `'actions use no randomness'`: `g.rng` and `g.nextId` change only by the one `uid` of a start.
- [ ] **Step 2: Run** `npx vitest run test/hedge-fund.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Edit `investments.ts`** (the four hunks).
- [ ] **Step 4: Implement** `hedge-fund.ts`.
- [ ] **Step 5: Run** `npx vitest run test/hedge-fund.test.ts test/investments.test.ts test/invest-safety.test.ts test/invest-order-notice.test.ts test/talent-investing.test.ts test/own-listing-menu.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: personal and family hedge funds, money in and out, relatives`.

### Task 4: The company fund

**Files:**
- Create: `src/game/business/hedge-company.ts`
- Modify: `src/game/business/yearly.ts` †: `import { bookHedgeYear } from './hedge-company'` and one statement, `bookHedgeYear(g, a, b, fiscal)`, on the line after `bookFranchiseYear(g, a, b, fiscal)`. Re-read the file first: the dividends build is editing it.
- Test: `test/hedge-company.test.ts`

**Interfaces** (consumes Tasks 1 and 2; `board-vote.ts` `payableCash`, `payoutCash`, `runningCosts`, `reserveDollars`; `board-state.ts` `boardExists`, `boardView`; `conglomerate-state.ts` `inGroup`; `finance-firm-state.ts` `isFinanceFirm`; `fund-model.ts` `fundRng`, `leaderSkill`; `gate.ts` `manageBlock`; `state.ts` `runsIt`, `businessAssets`, `readBiz`, `bizOf`):
- `export const KEEP_MONTHS = 6`
- `export function companyBlock(g: GameState, a: Asset, b: BizState): string | null`, in order: an investment firm (`b.industry === 'investmentFirm'`) `'Its own fund is on its company screen.'`; any other `isFinanceFirm(b)`, a bank, `"A bank can't put its capital in a fund."`; `inGroup(g, b)` `'Its cash belongs to the group.'`; `b.share <= 1e-4` `'You own none of it.'`; `marketBlock(g, b.countryId)`.
- `export function companyFloor(g: GameState, a: Asset, b: BizState): number` = `max(round(KEEP_MONTHS / 12 * runningCosts(b)), boardExists(g, b) ? reserveDollars(b, boardView(g, a, b)) : 0)`.
- `export interface CompanyQuote { floor: number; spare: number; work: number; why: string | null }` and `export function companyQuote(g: GameState, a: Asset, b: BizState, target: number): CompanyQuote` (pure): `spare = max(0, payoutCash(a, b) - floor)`; `work = floor(min(clampN(target, 0, 1e15), spare))`; when `target > 0` and `work < 1`, `why` is the first that applies: `'Its loans come first.'` (debt and no payable cash), `'Investors are paid back first.'`, `'Its cash is at the floor.'`, `'It has no spare cash.'`.
- `export function eligibleCompanies(g: GameState): { a: Asset; b: BizState }[]`: business assets with a null `companyBlock`, largest `a.value` first, at most 20.
- `export function setCompanyFund(g: GameState, assetId: string, patch: { target?: number; strategy?: HedgeStrategy; call?: MacroCall; lev?: number }): boolean`: needs `manageBlock` and `companyBlock` null; strategy and call refused by `strategyBlock` / `macroBlock` (a call sets Macro); a non-Macro strategy resets call and leverage; creates the record from defaults (`target 0`, Long/Short, flat, 1x, `total 0`) when none. A target change posts notice `Fund Set`: `` `${a.name} will put up to ${money(target)} to work at year end.` `` or, at 0, `` `${a.name} stopped using a fund.` ``
- `export function companyTerms(g: GameState, a: Asset, b: BizState, h: CompanyHedge, work: number): { strategy: HedgeStrategy; call: MacroCall; lev: number; auto: boolean }`: `auto` when `!runsIt(g, a)`, the character is dead, in prison or under 18; then `autoTerms({ countryId: b.countryId, lead: leaderSkill(g, b), nav: work, year })`. Otherwise the stored terms, except Macro when `macroBlock(g)` is set (Long/Short).
- `export function bookHedgeYear(g: GameState, a: Asset, b: BizState, fiscal: number): void`: returns at once with no record, `target <= 0`, `h.last.year >= fiscal` or a `companyBlock`. With `work < 1` it stores `last = { year: fiscal, work: 0, gross: 0, net: 0, market: 0, pnl: 0, why }`, logs `` `${a.name} had no cash to put to work.` `` and returns. Otherwise `y = vehicleYear(g, { countryId: b.countryId, ...terms, nav: work, skill: skillOf(leaderSkill(g, b)), year: fiscal + 1 }, fundRng(g, b, fiscal, 'hedgeco'))`, `pnl = Math.round(work * y.net)`; a gain does `b.cash += pnl; b.yearIncome += pnl`, a loss `b.cash += pnl; b.yearCosts += -pnl`; `total` and `last` are stored; an owner-run Macro year reverts the stored strategy to Long/Short, flat, 1x (an auto year leaves the owner's settings alone); log `` `${a.name}'s fund ${pnl >= 0 ? 'made' : 'lost'} ${money(Math.abs(pnl))}.` `` (tone good or bad).

- [ ] **Step 1: Write the failing tests** in `test/hedge-company.test.ts`, using `company` from the kit and `listedGroup` from `test/own-listing-kit.ts` for a division. For statement tests compare two `structuredClone`s with `simulateYear`; if `simulateYear` draws from `g.rng`, assert on `b.yearIncome`, `b.cash` and `stmt.otherIncome` instead.
  - `'which companies can hold a fund'`: a software company yes; a bank, an investment firm (`firm('hedge')`), a group division, a company with `share = 0`, and the year 1948 each have their `companyBlock`; `eligibleCompanies` drops them and lists the rest largest first, at most 20.
  - `'the floor'`: six months of `runningCosts`; with a board (outside investor so `boardExists`) it is the larger of that and `reserveDollars`.
  - `'spare cash and work'`: `spare = payoutCash - floor`; debt (`b.debt`), investors' preference (`b.pref` with `b.share < 0.999`) and earmarked cash each lower it; `work` is the lesser of target and spare, rounded down; `why` for each empty case.
  - `'a gain is booked once'`: set a target, run `bookHedgeYear`: `b.cash` and `b.yearIncome` rise by `pnl`; then `simulateYear`: the statement's `otherIncome` rises by `pnl` and final cash minus the no-fund clone's equals `pnl - (corpTax difference)`.
  - `'a loss is a cost'`: choose a year with `marketMove(g, 'us', y) < -0.2` (scan 1950-2025), macro bull at 3x: `pnl < 0`, `b.yearCosts` rises by `-pnl`, `b.cash` falls by `-pnl`.
  - `'the fund alone cannot sink the company'`: that crash year with a target of 1e15: after booking, `payableCash(a, b) >= companyFloor(g, a, b) - 1`, and `b.cash - b.debt >= floor`.
  - `'once per fiscal year'`: a second call changes nothing (`JSON.stringify(b)` equal).
  - `'terms'`: a hired CEO (`installManager`) runs `autoTerms` and keeps the owner's stored Macro; an owner-run Macro year reverts to Long/Short, flat, 1x after booking; the player in prison or 17 is `auto`; a politician cannot book Macro (Long/Short is used).
  - `'nothing happens without a target'`: no record, `target 0`, a hostile record (`b.hedge = 'x'`) all leave `JSON.stringify(b)` and `g.rng` unchanged.
  - `'setting a target moves nothing'`: `valuationOf(b)`, `b.cash`, `a.value` and `netWorth(g)` are identical before and after `setCompanyFund`; no asset is added.
  - `'setCompanyFund'`: refuses a bank; clamps a negative or huge target; Macro is refused for an official; a non-Macro strategy resets the call.
  - `'determinism'`: the same seed gives the same `pnl`; `g.rng` is unchanged by `companyQuote`, `companyBlock`, `eligibleCompanies` and `bookHedgeYear`; the quote renders from a deep-frozen state.
  - `'old companies'`: a company with no `hedge` key books nothing and its JSON is untouched through `yearlyBusinessImpl`.
- [ ] **Step 2: Run** `npx vitest run test/hedge-company.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `hedge-company.ts`.
- [ ] **Step 4: Add the call** in `yearly.ts` as listed under Files.
- [ ] **Step 5: Run** `npx vitest run test/hedge-company.test.ts test/business.test.ts test/business-financial-overhaul.test.ts test/board.test.ts test/franchise.test.ts` and `npm run typecheck`. Expected: PASS. The last three cover the yearly loop this call sits in.
- [ ] **Step 6: Commit** `feat: company hedge fund, cash at work booked through the statement`.

### Task 5: Year end, heirs and the estate

**Files:**
- Create: `src/game/business/hedge-year.ts`
- Modify: `src/game/aging.ts` ‡: import `yearlyHedge` and add `['hedge', yearlyHedge]` right after `['investments', yearlyInvestments]` (`:67`).
- Modify: `src/game/life.ts`: import `payOutDroppedFunds` and, right after `const keptAssets` (`:1227`) and before the heir's `Character` is built (`:1244`; the heir's money is built at `:1320`), add `inheritanceLines.push(...payOutDroppedFunds(n, property.filter((a) => !keptAssets.includes(a))))`.
- Test: `test/hedge-year.test.ts`

**Interfaces** (`hedge-year.ts`; consumes Tasks 1 to 4; `core.ts` `log`, `addRelationship`):
- `export function yearlyHedge(g: GameState): void`: returns at once when the character is dead or there is no fund and no company record. For each `fundsOf(g)` row with `f.lastYear < g.year`, in asset order:
  1. `settleHolders(g, f, a.name)`; each returned line goes to the life log (neutral).
  2. A fund with `f.nav < 1` leaves `g.assets` with the log line `` `The ${a.name} is gone.` `` and is skipped.
  3. `y = vehicleYear(g, { countryId: f.countryId, strategy: f.strategy, call: f.call, lev: f.lev, nav: f.nav, skill: skillOf(leadOf(g, f.founded)), year: g.year }, hedgeRng(g, a.id, g.year))`; `f.nav = min(1e15, f.nav * (1 + y.net))`; `lastYear`, `last` and `marks` (last 12) are set.
  4. A Macro year reverts to Long/Short, flat, 1x.
  5. When `y.net <= -0.15`, each living holder gets `addRelationship(p, -3)` and, if there were any, one log line `` `Relatives in the ${a.name} lost money.` ``
  6. `saveFund(a, f)`; log `` `My ${a.name} ${y.net >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(y.net), 1)} this year.` `` (good or bad).
  A block of text per fund goes into one popup: `` `${a.name}: ${signed(y.net)} (market ${signed(y.market)}). Your share is ${money(value)}.` `` plus `` ` Macro goes back to Long/Short.` `` when it reverted. For each business asset whose `readCompanyHedge(b.hedge).last` has `year === g.year - 1` and `work > 0`, a block `` `${a.name}: ${money(last.work)} at work, ${last.pnl >= 0 ? '+' : '-'}${money(Math.abs(last.pnl))}.` `` With at least one block, one popup is queued: a `notice` with id ``hedge-${g.generation}-${g.year}``, title `Hedge Funds`, emoji `🦈`, the blocks joined by newlines as its text, and a tone (good when the sum of the funds' and sleeves' results is not negative, else bad). The id takes nothing from `g.nextId`.
- `export function payOutDroppedFunds(n: GameState, dropped: readonly Asset[]): string[]`: for each dropped Asset with a readable record and holders, `cashOutFamilyHolders(n, holders as shares of units, f.nav, 'the family fund')`, and one returned line `` `The ${a.name} was wound up. Relatives got ${money(total)}.` ``. It ignores assets that are not funds and pays holders only: your own units are already in the estate through `a.value`.

- [ ] **Step 1: Write the failing tests** in `test/hedge-year.test.ts`. A local `birthday(g)` does `g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []; yearlyBusinessImpl(g); yearlyHedge(g)`. For estates build the family as `fam()` in `test/will-estate.test.ts` does and use `killCharacter`, `continueAsChild`, `changeWill`/`addHeir`.
  - `'books every fund once a birthday'`: a second `yearlyHedge` in the same year changes nothing (`JSON.stringify(g)` equal); `f.lastYear === g.year`.
  - `'the pool moves by the year and your value follows'`: `nav` equals the old `nav * (1 + net)` for the `vehicleYear` computed independently with the same inputs; `a.value === round(mine * nav / units)`; one mark added; `last` set.
  - `'a macro call lasts one year'`: a family fund set to Macro bull at 2x is Long/Short, flat, 1x after the birthday; a popup block says so.
  - `'one popup and one log line per fund'`: with a personal fund, a family fund and a company target there is exactly one queued notice titled `Hedge Funds` with id `hedge-<generation>-<year>`, containing both fund names and the company block; two life-log lines for the funds; no funds means nothing queued and nothing logged.
  - `'relatives share the year pro rata'`: a holder's value after the year is `units * newPrice`; the sum of holders, `mine` and the pool agree.
  - `'a bad year cools relatives, a good one does not'`: pick a year with `marketMove < -0.3` (scan 1950-2025) and set Macro bull at 3x so `net <= -0.15`: each living holder's relationship falls by 3 and one cooling line is logged; in an up year with Long/Short nothing changes.
  - `'settling runs first'`: a holder with relationship 10 is paid out before the year and does not share its return.
  - `'dead and jailed'`: a dead character books nothing; a prisoner's fund still books.
  - `'a game with no fund returns at once'`: `JSON.stringify(g)` and `g.rng` unchanged.
  - Estate, `describe('when you die')`: `'a sole adult heir keeps the family fund and the relatives stay in it'` (assert `planEstate(...).keepProperty` first and pick a seed where no contest is filed, as the will tests do): after `continueAsChild`, the new `g.assets` holds the fund, `mine` equals the old `mine`, the sister is still a holder and her money is untouched; the heir's own units, if she had been a holder, merge on the next `yearlyHedge`. `'a split estate winds the fund up'`: two named heirs; the fund is not in `g.assets`; the relatives' `Person.money` rose by their value; the heirs' inherited cash includes your units' value; relatives' payouts plus your units' value equal the pool before death; `inheritanceLines` (the estate text) has the wound-up line. `'a minor heir'`: the fund is dropped and relatives are paid. `'a personal fund is part of the estate like any investment'`: kept in kind by a sole adult heir, liquidated in a split. `'the heir who was a holder is paid once'`: in a split, the heir's money equals old `heirP.money` plus their payout plus the inherited cash, with no second payout.
  - `'old saves'`: a game saved before this build (no `hf`, no `hedge`) goes through `ageUp` unchanged apart from the year.
- [ ] **Step 2: Run** `npx vitest run test/hedge-year.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `hedge-year.ts`.
- [ ] **Step 4: Wire** `aging.ts` and `life.ts` as listed under Files.
- [ ] **Step 5: Run** `npx vitest run test/hedge-year.test.ts test/will-estate.test.ts test/will-feud.test.ts test/family-planning.test.ts test/npc-dynasty-overhaul.test.ts test/conglomerate.test.ts test/save-schema.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: hedge fund year end, relatives, heirs and the estate`.

### Task 6: The menus

**Files:**
- Create: `src/game/business/hedge-menu.ts`
- Modify: `src/game/business.ts`: add `import './business/hedge-menu'` next to `import './business/own-listing-menu'` (`:15`).
- Test: `test/hedge-menu.test.ts`

**Interfaces** (`hedge-menu.ts`; consumes Tasks 1 to 5; `fund-text.ts` `signed`; `fund-events.ts` `callHint`; `fund-model.ts` `STRATEGIES`, `CALLS`; `talents.ts` `talentHint`): `export function hedgeRow(g: GameState): MenuGroup | null` (null for a minor or a dead character), `export function fundView(g: GameState, a: Asset): MenuNode[]`, `export function fundSubtitle(g: GameState, a: Asset): string`, `export function companyFundNode(a: Asset): MenuGroup`. The module ends with `registerHedgeFunds({ row: hedgeRow, view: fundView, subtitle: fundSubtitle })`. Every closure re-finds the Asset by id and reads the record through `readHedge` (or `readCompanyHedge(bizOf(...).hedge)`), because `stayOpen` actions leave stale nodes.

The row (id `inv-hedge`, label `Hedge Funds`, emoji `🦈`): `disabledReason` is `marketBlock(g, countryId)` or `personBlock(g)`; subtitle `Personal, family and company funds` with no fund, else `n` funds (personal, family and company funds with a target above 0) joined by ` · ` to `shortMoney(sum of fund values)` when that is above 0 (`1 fund`, `3 funds`). Header: `` `Funds you run pay no fee, only ${pct(RUNNING_COST, 1)} a year to run. A Macro call lasts one year.` `` Children: heading `Your Funds` (id `hf-h-yours`); for Personal and Family either the fund as a menu node (id `inv-hedge-${a.id}`, label its name, subtitle `fundSubtitle`, children `fundView`) or a start action; heading `Company Funds` (id `hf-h-co`); one `companyFundNode` per `eligibleCompanies(g)`, or an info row `None of your companies can run a fund yet.`

Start action (ids `hf-start-person`, `hf-start-family`; labels `Start a Personal Fund`, `Start a Family Fund`; emoji `🦈`): subtitle `` `From ${money(seedMin(g))} · you run it` ``; `disabledReason` is `startBlock(g, owner)` or `` `You need ${money(seedMin(g))} in the bank.` ``; slider input, `money: true`, label `` `How much goes in? You have ${formatMoney(cash)}.` ``, `min = seedMin(g)`, `max = max(min, floor(cash))`, default a quarter of the range (`roundDefault: true`), preview `` `${money(v)} goes in. You own all of it.` `` (family: `` `${money(v)} goes in. Relatives can join later.` ``); `run` calls `startFund`; `stayOpen: true`.

Fund screen (`fundView`), info rows with ids `hf-${a.id}-i${n}`: `` `Your share: ${money(value)}` `` plus `` ` of ${money(nav)} (${pct(share, 1)})` `` when the fund has holders; `` `Strategy: ${label}` `` plus `` ` · ${CALLS[call].label} at ${lev}x` `` for Macro; `` `${year}: fund ${signed(net)}, market ${signed(market)}.` `` or `No year booked yet.`. Then actions, each `stayOpen` and `disabledReason` from its block:
- `Put In More` (id `hf-put-${a.id}`, emoji 💵): money slider `minTrade(g)` to cash; preview `` `You'd own ${pct(newShare, 1)} of a ${money(newNav)} fund.` ``
- `Take Out` (id `hf-take-${a.id}`, emoji 💸): slider `Percent of your share`, 1-100, unit `%`, default 10; subtitle `Gains are taxed when you take them out`; preview `` `About ${money(gross)} before ${money(tax)} tax.` ``, plus `` ` That closes the fund.` `` and, with relatives, `` ` Relatives get ${money(relatives)}.` `` when it closes.
- `Strategy` (menu): one action per strategy with its firm blurb as subtitle, `` ` ✓` `` on the current one, disabled by `strategyBlock` or `Already your strategy.`; header `Your strategy for next year.`
- `Market Call` (menu, label `Market Call: ${emoji} ${label}` while Macro): Bull, Bear, Flat actions, each with the `callHint` purple hint; subtitle `One view on next year, then back to Long/Short`. `Leverage` (slider 1-3 in halves, unit `x`) is shown while Macro.
- `Family` (menu, family funds only): heading `In the fund` and per holder an info row `` `${name} (${relationLabel(p)}): ${money(value)}, ${pct(share, 1)}` `` with a `Pay Out ${first}` action (subtitle `` `They get ${money(value)}` ``); heading `Invite` and per candidate an `Invite ${first}` action, subtitle `` `Puts in ${money(amount)}` `` or its `why`, disabled by `why`.
- `Close Fund` (emoji 🔒): `confirm` text `` `Close ${name}? You get about ${money(gross)} before tax.${relatives > 0 ? ` Relatives get ${money(relatives)}.` : ''}` ``.
`fundSubtitle` is `` `${shortMoney(value)} · ${strategy label} · ${owner === 'family' ? 'family' : 'personal'} fund` ``. A damaged record renders one info row, `The books for this fund are damaged.`, and no actions. An Asset that is gone renders `You no longer own this.`

Company fund node (`companyFundNode`, id `inv-hedge-co-${a.id}`, label the company name, subtitle `` `${work > 0 ? `${money(work)} at work` : 'Not in use'} · ${pct(b.share)} yours` ``): info rows `` `Cash at work: ${money(work)} of ${money(spare)} spare.` ``, `` `The company keeps ${money(floor)}.` ``, the strategy row, the last year (`` `${year}: fund ${signed(net)} on ${money(work)}, ${pnl >= 0 ? '+' : '-'}${money(Math.abs(pnl))}.` ``, the stored `why`, or `No year booked yet.`) and `The cash stays on the company's books.` Actions: `Cash at Work` (money slider 0 to `max(1, spare)`, default the target, preview `` `In an average year about ${money(v * expected)}. A bad year could lose ${money(v * Math.min(.95, swing * 2.5))}.` ``), `Strategy`, `Market Call`, `Leverage` as above through `setCompanyFund`, and `Stop` (sets the target to 0; disabled at 0).

- [ ] **Step 1: Write the failing tests** in `test/hedge-menu.test.ts`. The file imports `'../src/game/business'` (the app's registration path) and reads Investments with `investmentsMenu.children(g)`.
  - `'renders from a frozen state without touching it'`: a game with a personal fund, a family fund with a holder and a company target, `deepFreeze` it, render the row, every node's `children`, `subtitle`, `header`, `disabledReason`, `hint`, `confirm`, and each input's `defaultValue` and `preview` at `min`, `max` and the middle; no throw, JSON unchanged, `g.rng` unchanged.
  - `'the row'`: absent for a 17-year-old; present for an adult and disabled before 1949 with the `hedgeBlock` text; sits right after the `inv-crypto` node in the Invest block; with no fund, the Investments ids equal those rendered with the row unregistered (`registerHedgeFunds({ row: () => null, view: fundView, subtitle: fundSubtitle })`, restoring the real hooks in `finally`) plus `inv-hedge`.
  - `'start actions'`: slider bounds finite with `min <= max`; the preview mentions `You own all of it.`; `run` creates the fund (`fundOf(g, 'person')`); the node then shows the fund instead of the action; disabled with the `startBlock` reason when one exists.
  - `'the fund screen'`: the three info rows; every action present with its id; Put In and Take Out bounds finite; Take Out preview contains `before` and `tax`; at 100 it contains `That closes the fund.` and, with a holder, `Relatives get`; `Close Fund` has a `confirm`.
  - `'strategy and call'`: Quant disabled where `strategyBlock` says so; Macro and calls disabled for an official; `Market Call` shows the purple hint with the Investing talent (as `test/fund.test.ts` checks `callHint`); `Leverage` only while Macro.
  - `'family'`: holders and candidates listed; an ineligible candidate is disabled with its `why`; `Invite` and `Pay Out` run and change the record.
  - `'company funds'`: only eligible companies listed; the slider max equals `companyQuote(...).spare` (at least 1); `Stop` is disabled at target 0; running `Cash at Work` sets the target.
  - `'a stale node'`: close the fund and render the old node's `children`: the single info row `You no longer own this.`
  - `'a damaged record'`: set `a.details.hf = 'junk'`; the fund screen is the damaged row; `a.value` still counts in `netWorth(g)`; nothing throws.
  - `'Assets shows the fund'`: `assetsMenu` lists `asset-${a.id}` with `fundSubtitle` text and its screen is the fund screen.
  - `'not a market security'`: `investmentListing(g)` has no entry for it; `investmentHoldings(g)` is empty; the Stocks list is unchanged.
- [ ] **Step 2: Run** `npx vitest run test/hedge-menu.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `hedge-menu.ts` and the import in `business.ts`.
- [ ] **Step 4: Run** `npx vitest run test/hedge-menu.test.ts test/investments.test.ts test/stocks-real.test.ts test/own-listing-menu.test.ts test/talent-investing.test.ts test/fuzz-regressions.test.ts test/voice-guards.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Hedge Funds in Investments, fund screens and company funds`.

### Task 7: Story test, docs and release notes

**Files:**
- Create: `test/hedge-story.test.ts`, `docs/RELEASE-v2.8.0.md` (create it if the other builds have not; else append a section)
- Modify: `docs/ARCHITECTURE.md`, `docs/BUSINESS-AND-DYNASTIES.md`

- [ ] **Step 1: Write the story test**, `it('a founder runs three funds, ages three years and passes the family fund on')`, with a local `birthday(g)` as in Task 5.
  1. `rich(71, 'us', 6_000_000)`, a sister (`kin(g, 'sibling', 3_000_000)`), an adult child (`kin(g, 'child', 50_000, { age: 25 })`) and `company(g, { cash: 4_000_000 })`.
  2. Start Personal with 1M and Family with 1M; invite the sister; she puts in `min(20% of her money, your units' value)`. `setCompanyFund(g, a.id, { target: 2_000_000 })`. After each step `netWorth(g)` is unchanged.
  3. Three birthdays: each queues at most one `Hedge Funds` notice; every fund's `lastYear === g.year`; per fund, `mine` value plus holders' value equals `nav`; the company's `b.hedge.last.year === g.year - 1`.
  4. Take out 50% of the personal fund (cash rises; tax is charged only if the fund has a gain), then 100% (the Asset is gone).
  5. `killCharacter(g, 'Old Age')`, `continueAsChild(g, child.id)`: the family fund is in `g.assets`, the sister is still a holder, the heir's `Hedge Funds` row shows it, and a further birthday books it once.
- [ ] **Step 2: Run** `npx vitest run test/hedge-story.test.ts`. Expected: PASS on the first run, since it only drives code from Tasks 1 to 6. If it fails, fix the owning task's code, not the test.
- [ ] **Step 3: Docs.**
  - **`ARCHITECTURE.md`, Layout:** list `business/hedge-record.ts hedge-model.ts hedge-fund.ts hedge-company.ts hedge-year.ts hedge-menu.ts`: personal, family and company hedge funds in Investments (records, the shared return model, funds as Assets, the company sleeve, the yearly hook, menus). In the `investments.ts` entry add that `registerHedgeFunds` is how `business/hedge-menu.ts` adds the row and fund screens.
  - **`ARCHITECTURE.md`, new bullet "Hedge funds"** after the "Your listed companies in Stocks" bullet: the model is `fund-model.ts` (the funds are not the firm); person and family funds are one Asset worth your units, with `investmentHoldings` and `sellCore` skipping type `'hedge'`; a company fund is `BizState.hedge`, a sleeve booked before `simulateYear` through `yearIncome` or `yearCosts`; no fee, a 0.5% running cost; tax on `realize` at Take Out and in the statement; Macro lasts a year and officials cannot set it; relatives are units in a pool, passed on by `familyStakeHeirs` and paid out of a dropped fund by `payOutDroppedFunds` in `continueAsChild`; no `g.rng`.
  - **`BUSINESS-AND-DYNASTIES.md`:** one bullet under "Where to find the changes" (Investments → Hedge Funds) and two rows in the financial invariants table: "Put cash in a personal or family fund | Decreases | Unchanged | Your units rise by the same; net worth unchanged" and "Set company cash to work | Unchanged | Unchanged (it stays in cash) | The year's result lands in other income or costs".
- [ ] **Step 4: Release notes** `docs/RELEASE-v2.8.0.md`, in the shape of `docs/RELEASE-v2.6.1.md`: a one-paragraph summary, then **In Investments**, **Personal and family funds**, **Company funds**, **Tax and fees**, **Old saves**, **Not in this release**. The figures to state: the year 1949; a first seed of 5 times a typical year's income; no fee and 0.5% a year to run; a relative puts in 20% of their money, at most what your units are worth, 8 invited; a year of -15% or worse cools relatives by 3; the company floor of 6 months of costs; Macro lasts one year and officials cannot set it. **Not in this release** lists the spec's out-of-scope list in plain words. VOICE applies, with no em-dashes.
- [ ] **Step 5: Full verification.** `npm run typecheck`, `npm test` (all files), `node scripts/voice-report.mjs` and `npm run build`. Expected: all green, and the voice report's long-string count does not rise.
- [ ] **Step 6: Commit** `docs: hedge funds, story test and release notes`, then push.

---

## Self-review

**Spec coverage**

| Spec item | Where it's covered |
|---|---|
| D1 | Task 2 extractions and parity tests |
| D2, D3 | Task 3 (Asset, `SIDE_ACCOUNTS`), Task 3 'double counting' |
| D4 | Task 4 'a gain is booked once', 'setting a target moves nothing' |
| D5 | Task 2 'net takes the running cost'; Task 3 start copy |
| D6 | Task 2 'runnerSkill', 'no strategy out-earns the US index' |
| D7 | Task 2 'blocks', Task 3 'strategy', Task 5 'a macro call lasts one year' |
| D8 | Task 3 'take out pays the share and taxes the gain', Task 4 'a gain is booked once' |
| D9, D10 | Task 3 'family', 'settling'; Task 5 'relatives', 'when you die' |
| D11 | Task 3 'one fund of each kind' |
| D12 | Task 4 'the floor', 'the fund alone cannot sink the company' |
| D13 | Task 2 'blocks'; Task 3 'refuses' |
| D14 | Task 6; the Scope list |
| §5 data model, §7 saves | Task 1; Task 6 'a damaged record' |
| §6 determinism | purity and `g.rng` assertions in Tasks 2, 3, 4, 6 |
| §4.3 where it shows | Task 3 'double counting', Task 6 'Assets shows the fund' |
| §9 tests | Tasks 1 to 7 |

**Departures from the spec, each stated where it is made**
- The records and the unit maths live in one import-free module, `hedge-record.ts` (the spec calls it that); the strategy and call lists are repeated there to avoid an import cycle, and a test pins them equal.
- `personBlock` and `marketBlock` are separate in `hedge-model.ts`, so the company sleeve can check the market without the player's age or prison state.
- `investments.ts` gets all four hunks in Task 3 although the hook is only used in Task 6, so the file is touched once.
- A company fund that finds no spare cash records a `why` and logs one line instead of staying silent.

**Type consistency**

These names are spelled the same in every task that uses them: `HedgeFund`, `CompanyHedge`, `Holder`, `readHedge`, `readCompanyHedge`, `companyHedgeField`, `unitPrice`, `unitsValue`, `RUNNING_COST`, `capacityOf`, `outlookOf`, `hedgeRng`, `runnerSkill`, `leadOf`, `skillOf`, `vehicleYear`, `vehicleOutlook`, `autoTerms`, `seedMin`, `personBlock`, `marketBlock`, `strategyBlock`, `macroBlock`, `FundRow`, `fundsOf`, `fundOf`, `saveFund`, `startBlock`, `startFund`, `putIn`, `takeQuote`, `takeOut`, `closeFund`, `setFundStrategy`, `setFundCall`, `candidates`, `invite`, `payOutHolder`, `settleHolders`, `companyBlock`, `companyFloor`, `companyQuote`, `eligibleCompanies`, `setCompanyFund`, `companyTerms`, `bookHedgeYear`, `yearlyHedge`, `payOutDroppedFunds`, `registerHedgeFunds`, `hedgeRow`, `fundView`, `fundSubtitle` and `companyFundNode`.

**Proportion**

The plan is nearly twice the spec. Almost all of that is test assertions and fixed player copy. The new engine code is one formula (`vehicleYear`, six lines) over the firm's own functions; the rest is ownership: records, units, relatives and menus.

**Known residual risk**
- A fund taken by creditors or a divorce judge goes whole at its value; relatives' slices go with it (no money is created). Fixing it means a new asset-removal hook in `finance.ts` and `love.ts`.
- A relative who is no longer a contact has no modelled heirs; their slice leaves the pool with its value (the same limit `cashOutFamilyHolders` has for unmodelled heirs).
- Hedge strategies have fixed carry terms (`fund-model.ts:189-200`): in a weak home market a fund beats the index. That is the firm's balance, reused as is.
- Company cash loses value to the company inflation rule even while at work, so a real return is slightly understated in high-inflation years.
- An office-holder who sets Macro in the same year they take office can run that one call (it reverts after the year).
