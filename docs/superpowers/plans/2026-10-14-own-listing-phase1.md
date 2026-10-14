# Your Listed Company in Stocks (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company the player has taken public shows up in Investments › Stocks with its exact size tier, on the exchange it trades on. From that row the player can buy more of it, which raises `BizState.share`, and sell it through the existing `sellShares`. A listed group gets a row you can only look at.

**Architecture:** The row is a view and a trade door over the business. It is never an investment Asset and never a `Quote` (D1, D2). The work goes in four new business modules:
- `own-listing.ts`: tiers, the outside float and `ownListings`.
- `listing-id.ts`: which exchange a company trades on, and its 4-letter ticker.
- `own-trade.ts`: the buy and sell rules.
- `own-listing-menu.ts`: the row and the company screen. It registers itself with `investments.ts` through one hook, `registerOwnListings`, so the engine file still imports nothing from `business/`.

The spec puts all of this in a single `own-listing.ts`. It is split here for two reasons: `exit.ts` and `conglomerate-state.ts` can then import the ticker code without an import cycle, and tasks can run in parallel. Every function name in spec §4.1 is kept. The one change is `ownTickerFor`, which takes the company's name and asset id, because the name lives on the Asset and not on `BizState`.

Phase 2 (share classes, spec §5.1) builds on this without changes:
- Economics stay in `b.share`.
- Every control question goes through `controlsWith` or `ownerControls`. That is the one place where `ownerVotes` will plug in.
- The provider returns rows, so it can return one row per listed class.
- The 4-letter ticker leaves room for a fifth letter for the class.

**Tech Stack:** TypeScript (strict), Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-own-listing-and-share-classes-design.md`. This plan covers Phase 1 only: §3 (D1-D13), §4, §6, the Phase 1 tests in §7, and §8. §5 is not built here. Its line numbers are older than this tree; the plan cites the current ones.

## Global Constraints

**Build and tests**
- Run tests one file at a time while developing: `npx vitest run <file>`. Typecheck with `npm run typecheck`. The full suite (`npm test`, about 20 minutes) runs only in Task 7.
- No `any`, no `@ts-ignore`, no new dependencies.
- A test fixture that would break `tsc` goes in a `.txt` file. Hostile values that are valid `Json` (`7`, `'acme'`, `null`) are written inline.

**Engineering rules (`docs/ARCHITECTURE.md`)**
- Rule 1: state is plain JSON.
- Rule 2: game randomness goes only through `g.rng`, and there is no `Math.random` in `src/game`.
- Rule 3: actions change `g` in place.
- Rule 5: yearly limits use `useYearAction`.
- Rule 8: menus are functions of state, and they must render from a deep-frozen state (`test/fuzz-kit.ts` `deepFreeze`).
- Rule 9: imports between modules are limited, and `investments.ts` imports nothing from `business/`.
- Rule 11: money.
- Rule 13: voice. It applies to every string added, including copy modelled on an older string.

**Determinism (D13)**
- Rows, tiers, tickers, quotes, limits and previews never read or advance `g.rng`.
- The buy action does not use `g.rng`. The sell action uses whatever `sellShares` already uses.

**Money**
- Money is internal constant-2026 US dollars. Tier thresholds have no inflation step.
- Money is shown only at render time, through `formatMoney`, `formatPrice`, `money` or `shortMoney`.
- Money inputs set `money: true`.

**Saves**
- Every new `BizState` field is optional.
- Every new field is whitelisted in `normalizeBiz` (`src/game/business/state.ts:494`). Any field not added there is dropped on load.
- `BIZ_VERSION` stays 2.
- A save without the new fields behaves exactly as today, except that the ticker is derived.

**Player-facing text**
- Follows `docs/VOICE.md`: short and factual, contractions, no morals, no em-dashes, no disclaimers.
- Colons only for prices and labels.
- Tooltips and notices stay at or under 120 characters, and life-log lines at or under 90.
- The exact copy given in this plan is final.
- Never put model names in code or docs.

**Commits**
- One commit per task, after that task's tests and `npm run typecheck` pass.
- End every commit message with a blank line and the two trailer lines (Co-Authored-By and Claude-Session) that the dispatching prompt gives you. The orchestrator passes the exact trailers when it dispatches each task.
- Push after Task 7.

**Scope**
- Do not touch net worth, estates, Sell Everything, `payDividend`, the IPO maths or the yearly price step.
- Do not change the logic of the Exit or Capital & Ownership menus. The only changes there are the two shared year-key helpers.

## Review Focus

These are the inputs most likely to bite a player, most likely first. Each one has a pinning test in the task named.

- **A company listed on a different exchange from the one shown.** Ways this happens: the player emigrated; a division was spun off a group listed abroad, so `b.exchange` differs from its home exchange code; a code repeats (TSE is both Tokyo and Tehran); the player's home country has no stock market this year. Expected: the company appears exactly once, in "Your listed companies" with its exchange named, and never in the local tier list. Buying checks the company's own exchange. A repeated code is resolved from the company's own country, so a standalone IPO always lands right; a group or spin-off spanning two countries whose exchanges share a code can still land on the other one (Known residual risk). Tests: Task 2 (`listedExchange`), Task 3 (`exKey`), Task 6 (placement, including China 1960).
- **A listed group (conglomerate).** Expected: one view-only row with the group's market cap, your group stake, exchange and tier, plus a pointer to the group's screen. It has no Buy or Sell. None of its divisions get a row. The row is gone once you sell out of the group. Tests: Task 3, Task 6.
- **A stake at the edge of control (49% against 50%).** Expected: a buy is allowed at any stake, because it needs no board control (D3). When the buy takes you over 50%, its preview says you'd control the board ("This gives you control of the board."). A buy never loses control. A sale that takes 52% under 50% says "You'd lose control of the board." in its preview, before it runs. Tests: Task 4, Task 5.
- **Selling out, or dropping below 0.5%, from the Stocks row.** Expected: the preview says the company leaves, and it judges that on the stake the sale will really use (a stored 0.6% is not read as the 1% `normalizeBiz` floors it to). The sale removes it and pays relatives once. The row disappears, and the open screen says "You no longer own this." A repeated sale does nothing. Tests: Task 5, Task 6.
- **A save from before this change** (no `ticker`, no `ipoPrice`). Expected: the ticker is derived. It is the same on every read and in every year while your companies on that exchange stay the same, and it is unique among your companies on that exchange. Hostile values are dropped. The screen leaves out "since the IPO". Tests: Task 2, Task 6.

## File ownership and order

| Task | Creates | Modifies | Runs after | Can run alongside |
|---|---|---|---|---|
| 1 Tiers and float | `src/game/business/own-listing.ts`, `test/own-listing.test.ts` | | | 2 |
| 2 Exchange and ticker | `src/game/business/listing-id.ts`, `test/own-listing-kit.ts`, `test/listing-id.test.ts` | `src/game/invest/engine.ts`, `src/game/business/state.ts`, `src/game/business/exit.ts`, `src/game/business/conglomerate-state.ts` | | 1 |
| 3 Listings | | `own-listing.ts`, `test/own-listing.test.ts` | 1, 2 | 4, 5 |
| 4 Buy | `src/game/business/own-trade.ts`, `test/own-trade.test.ts` | `src/game/business/rescue.ts` | 1, 2 | 3 |
| 5 Sell | | `own-trade.ts`, `test/own-trade.test.ts`, `src/game/business/manage.ts` | 4 | 3 |
| 6 Stocks menu and screen | `src/game/business/own-listing-menu.ts`, `test/own-listing-menu.test.ts` | `src/game/investments.ts`, `src/game/business.ts` | 3, 4, 5 | |
| 7 Story, docs, notes | `test/own-listing-story.test.ts`, `docs/RELEASE-v2.7.0.md` | `docs/ARCHITECTURE.md`, `docs/BUSINESS-AND-DYNASTIES.md` | 6 | |

The files of parallel tasks are disjoint, but their gates are not: every task ends on the whole-project `npm run typecheck`, and Tasks 4 and 5 import `own-listing.ts` while Task 3 is rewriting it. So parallel tasks run in separate worktrees (superpowers:using-git-worktrees), each rebased onto the last finished task before it commits, and each commits only the files in its row. In a single tree, run 3, 4 and 5 in that order.

---

### Task 1: Cap tiers, labels and the outside float

**Files:**
- Create: `src/game/business/own-listing.ts`
- Test: `test/own-listing.test.ts`

**Interfaces:**
- Consumes: `clampN` (`business/util.ts`). The test also uses `SIZE_LABEL` (`src/game/invest/real.ts:185`).
- Produces, in `own-listing.ts`:
  - `export type CapTier = 'mega' | 'large' | 'mid' | 'small'`
  - `export const CAP_TIER_MIN: Readonly<Record<Exclude<CapTier, 'small'>, number>>` = `{ mega: 200_000_000_000, large: 10_000_000_000, mid: 2_000_000_000 }`
  - `export const TIER_LABEL: Readonly<Record<CapTier, string>>` = `{ mega: 'Mega-cap', large: 'Large-cap', mid: 'Mid-cap', small: 'Small-cap' }`
  - `export function capTier(marketCap: number): CapTier`
  - `export interface Holders { share: number; executiveEquity?: number; manager?: { equity?: number } | null; familyShares?: { share: number }[] }`. A `BizState` and a `GroupCore` both satisfy it, so the group row needs no cast.
  - `export function outsideFloat(h: Holders): number`: the part held by outside shareholders, `max(0, 1 - h.share - clampN(max(h.executiveEquity ?? 0, h.manager?.equity ?? 0), 0, 1) - sum of h.familyShares)`. The executive term is the rule of `executiveEquity` (`state.ts:182-184`), and the whole is the remainder `equityQuote` computes at `rescue.ts:22`.

- [ ] **Step 1: Write the failing tests** in `test/own-listing.test.ts`, under `describe('cap tiers and the float')`.
  - `'uses the fixed thresholds, inclusive at the lower bound'`: `it.each` over `[200e9,'mega'], [200e9-1,'large'], [10e9,'large'], [10e9-1,'mid'], [2e9,'mid'], [2e9-1,'small'], [0,'small'], [-5,'small'], [1e300,'mega'], [Infinity,'mega'], [NaN,'small'], [-Infinity,'small']`, asserting `capTier(v) === tier`.
  - `'labels match the engine size headings'`: `TIER_LABEL.mega`, `.large` and `.mid` equal `SIZE_LABEL.mega`, `.large` and `.mid`, and `TIER_LABEL.small === 'Small-cap'` (the label `sizeLabelOf` gives every made-up company, `engine.ts:555-557`).
  - `'outside float is what nobody inside holds'`: build `b` with `newBiz(makeTestGame(1, { age: 40 }), 'software', 'us', 'Chicago')`.
    - With `share = 0.6`, `executiveEquity = 0.05` and `familyShares = [{ id: 'p1', share: 0.3 }]`, `outsideFloat(b)` is close to `0.05`.
    - With `share = 1`, no family and no executives, it is `0`.
    - With `share = 0.9` and family `0.3`, it is `0`, never negative.
    - A plain object works too: `outsideFloat({ share: 0.5, executiveEquity: 0.1, manager: null, familyShares: [{ share: 0.2 }] })` is close to `0.2`.
- [ ] **Step 2: Run** `npx vitest run test/own-listing.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the exports. In `capTier`, test against `CAP_TIER_MIN` from mega down. Anything that is not `>= CAP_TIER_MIN.mid` is `'small'`, so `NaN` lands there.
- [ ] **Step 4: Run** the test and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: market-cap tiers and outside float for listed companies`.

### Task 2: Where a company trades, and its ticker

**Files:**
- Modify: `src/game/invest/engine.ts`. Export `tickerFor` (line 509, unchanged otherwise). Add `exchangesWithCode` after `exchangeByKey` (line 110). Add `reservedTickers` after `fillerSymbol` (lines 672-679).
- Modify: `src/game/business/state.ts`. Add the fields after `ipoYear: number` (line 267). Whitelist them in `normalizeBiz` after `ipoYear` (line 576). Add `isTicker`.
- Create: `src/game/business/listing-id.ts`
- Modify: `src/game/business/exit.ts:183-187` (`goPublic`)
- Modify: `src/game/business/conglomerate-state.ts:561-572` (`detach`, the `listing && !b.public` branch)
- Create: `test/own-listing-kit.ts`
- Test: `test/listing-id.test.ts`

**Interfaces:**
- Produces, in `engine.ts`:
  - `export function tickerFor(name: string, len: number): string`
  - `export function exchangesWithCode(code: string): ExInfo[]`: the registry exchanges whose `ex.code === code`, in registry order.
  - `export function reservedTickers(info: ExInfo): ReadonlySet<string>`: cached per `info.key`. It contains every value of `realSymbols(info)` (every registry company of that exchange, in any era), `companyDef(info, s, 0).symbol` for every slot of `slotPlan(info)`, and `pennyDef(info, p, 0).symbol` for every `p < PENNY_SLOTS`.
- Produces, in `state.ts`:
  - `BizState.ticker?: string`
  - `BizState.ipoPrice?: number` (the offer price; used for the screen's "since the IPO")
  - `export function isTicker(v: unknown): v is string`, which accepts only `/^[A-Z]{4}$/`
- Produces, in `listing-id.ts`. It imports only `engine.ts`, `state.ts` and types. It must not import `conglomerate-state.ts`, which imports it. "Standalone" here means `b.group` is absent.
  - `export function listedExchange(countryIds: readonly string[], code: string): ExInfo`. It returns the first `exchangeInfo(c)` with `ex.code === code`. Failing that, it returns the only entry of `exchangesWithCode(code)` if there is exactly one. Otherwise it returns `exchangeInfo(countryIds[0] ?? 'us')`.
  - `export function companyExchange(b: Pick<BizState, 'countryId' | 'exchange'>): ExInfo` = `listedExchange([b.countryId], b.exchange)`
  - `export function ownTickerFor(name: string, id: string, taken: ReadonlySet<string>): string`
  - `export function exchangeTickers(g: GameState, info: ExInfo): Map<string, string>`: maps asset id to ticker for every public standalone business of the player on `info`.
  - `export function tickerOf(g: GameState, a: Asset, b: BizState): string`: the stored ticker if `isTicker`, otherwise a derived one.
  - `export function newTicker(g: GameState, a: Asset, b: BizState): string`: a fresh ticker for a listing that is happening now.
- Produces, in `test/own-listing-kit.ts`:
  - `founder(seed = 41, countryId = 'us', money = 50_000_000_000, year = 2026): GameState`: an adult aged 45, renting, with `lifeId` set.
  - `listed(g, opts?: { name?: string; countryId?: string; exchange?: string; share?: number; marketCap?: number; sharesOut?: number; profit?: number; executive?: number; family?: { id: string; share: number }[] }): { a: Asset; b: BizState }`
    - A `software` company in the country's first city, created with `createBusinessAsset` and pushed onto `g.assets`.
    - `public = true`, `exchange = opts.exchange ?? exchangeInfo(countryId).ex.code`, `ipoYear = g.year - 3`.
    - Defaults: `sharesOut` 1e8, `valuation = marketCap` (default 5e9), `sharePrice = round2(valuation / sharesOut)`, `share` 0.6.
    - Three history years with `profit` (default 0).
    - `refreshValue` is called. No ticker is stored.
  - `privateCompany(g, countryId = 'us', name = 'Quiet Co'): { a: Asset; b: BizState }`: `newBiz(g, 'software', countryId, <the country's first city>, { cash: 5_000_000 })` through `createBusinessAsset`, pushed onto `g.assets`, then three history years of `profit: 20e6`, then `b.valuation = valuationOf(b)` and `refreshValue(a, b)`. It must be worth something, or a group made of two of them prices at the `0.01` floor and every group assertion compares zeros.
  - `listedGroup(g, countryId: string, share: number): { id: string; members: Asset[] }`: two `privateCompany`s joined by `formGroup`, then given `core.listing = { exchange: exchangeInfo(countryId).ex.code, ipoYear: g.year - 2, sharesOut: 2_000_000, sharePrice: 30 }` and `core.share = share`, then `syncMembers` and `saveGroup`. This is the pattern at `test/family-sellout.test.ts:53-62`.
  - `findNode(g: GameState, nodes: MenuNode[], id: string, depth = 6): MenuNode | undefined`: a depth-first search through group children.

`ownTickerFor` picks the first candidate that is not in `taken`. The tests do not pin this order, so it is fixed here:

```
base = (tickerFor(name, 4) + 'XXXX').slice(0, 4)          // always 4 capital letters
h    = FNV-1a 32-bit hash of id (unsigned)
1. base
2. base.slice(0, 3) + L((h + k) % 26)                     for k = 0..25
3. base.slice(0, 2) + LL((h + k) % 676)                   for k = 0..675
4. LLLL((h + k) % 26^4)                                   for k = 0, 1, 2, ...
```

`L` and `LL` write a number in base 26 as letters, A = 0.

`exchangeTickers` has a fixed order. Players' companies come in asset-id order. Valid stored tickers are taken first, and a stored ticker that an earlier company already holds counts as missing. Then each remaining company gets `ownTickerFor(a.name, a.id, reservedTickers(info) ∪ the tickers given out so far)`.
- `tickerOf` = `exchangeTickers(g, companyExchange(b)).get(a.id) ?? ownTickerFor(a.name, a.id, reservedTickers(companyExchange(b)))`.
- `newTicker` uses `taken = reservedTickers(info) ∪` the tickers of every other id in `exchangeTickers(g, info)`.
- `exchangeTickers` validates with `isTicker` whatever the source. A `bizOf` view of a version-2 record is not re-normalized, so it can still hold a hostile value.

- [ ] **Step 1: Write the kit** `test/own-listing-kit.ts` with the exports above.
- [ ] **Step 2: Write the failing tests** in `test/listing-id.test.ts`.
  - `'finds the exchange a company trades on, even when codes repeat'`:
    - `listedExchange(['jp'], 'TSE').key === 'TSE:Nikkei 225'`
    - `(['ir'], 'TSE')` gives `'TSE:TEDPIX'`
    - `(['jp'], 'NYSE')` gives `'NYSE:S&P 500'`
    - `(['ws'], 'ASX')` gives `exchangeInfo('ws').key`
    - `(['jp'], 'NOPE')` gives `exchangeInfo('jp').key`
    - `([], 'TSE')` gives `exchangeInfo('us').key`
    - `(['ir', 'jp'], 'TSE')` gives `'TSE:TEDPIX'`
    - `exchangesWithCode('TSE').map((i) => i.home).sort()` equals `['ir', 'jp']`, and `exchangesWithCode('NYSE')` has length 1
  - `'makes a four-letter ticker from the name, the same every time'`:
    - `ownTickerFor('Acme Robotics', 'a1', new Set())` is `'ACMR'`, and a second call gives the same result.
    - `ownTickerFor('3', 'a1', new Set())` and `ownTickerFor('Ōsaka Gas', 'a1', new Set())` both match `/^[A-Z]{4}$/`.
    - With `taken = new Set(['ACMR'])`, the result is not `'ACMR'` and starts with `'ACM'`.
    - With `taken` holding `'ACMR'` and all 26 `'ACM?'`, the result starts with `'AC'` and is not in `taken`.
  - `'never takes a ticker the exchange already uses'`: for each home in `['us', 'jp', 'gb', 'in', 'za', 'jm', 'ir']`, with `info = exchangeInfo(home)`, look at every `stock` row of `investmentListing(founder(5, home))` whose `secId` is a real company (`isRealSecId`) or ends with `g0`.
    - `reservedTickers(info).has(row.symbol)` is true.
    - `reservedTickers(info).has(ownTickerFor(row.name, 'x', reservedTickers(info)))` is false.
  - `'the ticker does not depend on the seed'` (§7: determinism across seeds):
    - For seeds 1, 2 and 99: `const g = founder(seed); const { a, b } = listed(g, { name: 'Acme Robotics' })`. `tickerOf(g, a, b)` and `newTicker(g, a, b)` are the same for all three seeds.
    - A software company named `'Acme Robotics'` (the IPO fixture below) taken through `goPublic(g, a, b, 25)` under seeds 1 and 2 stores the same `b.ticker`.
  - `'gives two of your companies on one exchange different tickers'`:
    - Two `listed(g, { name: 'Acme Robotics' })`.
    - `b1.ticker = newTicker(g, a1, b1)` and then `b2.ticker = newTicker(g, a2, b2)` are both `isTicker`, differ from each other, and are not in `reservedTickers`.
    - With both deleted, `tickerOf` gives two different tickers. Each is the same on a second call and after `g.year += 10`.
  - `'the IPO stores the ticker and the offer price'`:
    - Use a `newBiz(g, 'software', 'us', 'Chicago', { cash: 5e6 })` company with three history years of `profit: 30e6`, as at `test/share-structure.test.ts:14-20`, then `goPublic(g, a, b, 25)`.
    - `isTicker(b.ticker)`, `b.ipoPrice > 0`, and `b.sharePrice / b.ipoPrice` is between 0.79 and 1.46 (the day-one move clamp, `exit.ts:174`).
    - `readBiz(g, a)` after `a.details = JSON.parse(JSON.stringify(a.details))` keeps both fields.
  - `'a listing out of a group gets a ticker; a wound-up group keeps its IPO year without an IPO price'`:
    - `detach(g, a, b, { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 })` on a private company gives `b.public`, `isTicker(b.ticker)`, `b.ipoYear === g.year` and `b.ipoPrice === b.sharePrice`.
    - The same call with `{ keepIpoYear: true }` on another company gives `b.ipoYear === 2015` and `b.ipoPrice === undefined`.
  - `'old and hostile saves'` (Review Focus 5):
    - `normalizeBiz({ ...a.details, ticker: v }, 2026).ticker` is `undefined` for each `v` of `['acme', 'ACMEX', 'AC', 'AC1E', '', 7, null]` and `'ACME'` for `'ACME'`.
    - `ipoPrice` is dropped for `-1`, `0`, `'12'`, `1e13` and `Infinity`, and kept for `12.5` and `5e7` (a 1,000-share company worth $50B).
    - A `listed` company with no ticker gets a `tickerOf` that is `isTicker` and the same on a second read. It is unchanged after `g.year += 10`, and unchanged after a second US company is given `newTicker`.
    - With `a.details.ticker = 'acme'` set on the mutable record, `tickerOf` returns an `isTicker` value.
- [ ] **Step 3: Run** `npx vitest run test/listing-id.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** the `engine.ts` exports, the `state.ts` fields, `isTicker` and the whitelist:
  - keep `ticker` when `isTicker(d.ticker)`;
  - keep `ipoPrice` when `typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 1e12`. The ceiling is loose on purpose: a founder can choose 1,000 shares (`MIN_SHARES`, `share-structure.ts:7`), so a company worth over $10B lists above $10M a share, and `sharePrice` itself has no upper clamp.
- [ ] **Step 5: Implement** `listing-id.ts` as specified above.
- [ ] **Step 6: Wire the listings.**
  - In `goPublic`, after `b.ipoYear = g.year` (`exit.ts:185`): `b.ticker = newTicker(g, a, b)` and `b.ipoPrice = Math.round(plan.price * 100) / 100`. Nothing else in `exit.ts` changes.
  - In `detach`, inside `if (listing && !b.public)` after `b.pref = 0`: `b.ticker = newTicker(g, a, b)`, then `opts.keepIpoYear ? delete b.ipoPrice : (b.ipoPrice = b.sharePrice)`.
- [ ] **Step 7: Run** `npx vitest run test/listing-id.test.ts test/share-structure.test.ts test/family-sellout.test.ts test/stocks-real.test.ts test/investments.test.ts test/conglomerate.test.ts test/conglomerate-play.test.ts` and `npm run typecheck`. Expected: PASS, clean. The two conglomerate files cover `detach`, which every spin-off (`conglomerate-actions.ts:657`) and group wind-up (`conglomerate-state.ts:588`) runs.
- [ ] **Step 8: Commit** `feat: tickers and the exchange a listed company trades on`.

### Task 3: The player's listings

**Files:**
- Modify: `src/game/business/own-listing.ts`
- Test: `test/own-listing.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `capTier` and `outsideFloat`
  - from Task 2: `companyExchange`, `listedExchange`, `exchangeTickers` and `tickerOf`
  - from `state.ts`: `businessAssets`, `readBiz`, `stakeValue`, `executiveEquity` and `BIZ_VERSION`
  - from `conglomerate-state.ts`: `groupsOf` (line 334), `groupIdOf` (260), `sharePriceOf` (493) and `groupStake` (475)
  - from `engine.ts`: `exchangeName(info, year)` (line 272)
  - `num` and `clampN` (`business/util.ts`)
- Produces:

```ts
export interface OwnListing {
  kind: 'company' | 'group'
  id: string                  // asset id, or group id
  name: string
  ticker: string | null       // null for a group (D10 shows none)
  exKey: string; exCode: string; exName: string
  price: number; marketCap: number; tier: CapTier; sharesOut: number
  stake: number; stakeValue: number
  outside: number; family: number; executives: number
  ipoYear: number; ipoPrice: number | null
}
export function ownListings(g: GameState): OwnListing[]
export function rawStake(g: GameState, a: Asset): number
```

`rawStake` is the stake an action will see through `bizOf`. `normalizeBiz` floors a stake that has no family shares at 1% (`state.ts:545`), but `bizOf` leaves a current record as stored (`state.ts:627`), so a 0.6% stake left by a sale stays 0.6% for `sellShares` and the yearly cleanup (`yearly.ts:460`). The rule: when `num(a.details.v) === BIZ_VERSION`, `Array.isArray(a.details.outlets)` and `a.details.share` is a finite number, it is `clampN(a.details.share, 0, 1)`. Otherwise `bizOf` would normalize first, so it is `readBiz(g, a).share`.

What each kind of listing contains:
- **Companies:** for each business asset, `v = { ...readBiz(g, a), share: rawStake(g, a) }`. It is listed when `v.public`, no `groupIdOf(v)`, `v.sharesOut > 0`, `v.sharePrice > 0` and `v.share > 1e-6`. Every value comes from `v`: `stake = v.share`, `sharesOut = v.sharesOut`, `marketCap = v.valuation` (D7), `stakeValue = stakeValue(v)`, the exchange from `companyExchange(v)`, `outside = outsideFloat(v)`, `family` = the sum of `v.familyShares`, and `executives = executiveEquity(v)`.
- **Groups:** every `groupsOf(g)` entry with `core.listing` and `core.share > 0`. Values: `price = sharePriceOf(grp)`, `sharesOut = listing.sharesOut`, `marketCap = price × listing.sharesOut`, `stake = core.share`, `stakeValue = groupStake(grp)`, and the exchange from `listedExchange(members' countryIds in member order, listing.exchange)`. `outside = outsideFloat(grp.core)`, `family` = the sum of `core.familyShares`, and `executives = clampN(max(core.executiveEquity ?? 0, core.manager?.equity ?? 0), 0, 1)`.
- **Sorting:** by `marketCap` descending, then by `id`.
- **Tickers:** computed once per exchange through `exchangeTickers`.
- **Purity:** `ownListings` is pure.

- [ ] **Step 1: Write the failing tests** in `test/own-listing.test.ts`, under `describe('your listings')`, using the kit.
  - `'lists a standalone listed company with its exchange, tier, stake and float'`:
    - Setup: a US `founder`, a sibling made with `createPerson`, and `listed(g, { marketCap: 50e9, sharesOut: 1e9, share: 0.6, executive: 0.02, family: [{ id: sib.id, share: 0.1 }] })`.
    - The result is one row with `kind 'company'`, `id a.id`, `ticker === tickerOf(g, a, b)`, `exKey 'NYSE:S&P 500'`, `exCode 'NYSE'`, `tier 'large'` and `price 50`.
    - Also: `marketCap 50e9`, `sharesOut 1e9`, `stake 0.6`, `stakeValue === a.value`, `outside` close to `0.28`, `family 0.1`, `executives 0.02`, `ipoYear g.year - 3` and `ipoPrice null`.
  - `'tiers by market cap and sorts biggest first'`: companies at 1.9e9, 250e9, 2e9 and 10e9 give tiers `['mega', 'large', 'mid', 'small']`, in that order.
  - `'leaves out private companies, divisions and sold-out companies'`:
    - `privateCompany` gives no row.
    - A `listed` company with `b.share = 0` and no family shares (an old save before the yearly cleanup) gives no row, even though `readBiz` reads its stake as 0.01.
    - The same company with `b.share = 0.006` gives a row with `stake` 0.006 (not 0.01) and `stakeValue === a.value` after `refreshValue(a, b)`. `rawStake(g, a)` is 0.006, and after `a.details.v = 1` it is 0.01, the value `bizOf` would normalize to.
    - With `listedGroup(g, 'kr', 0.7)`, no row has `kind 'company'` with a member's id.
  - `'shows a listed group as one view-only row'` (Review Focus 2):
    - `listedGroup(g, 'kr', 0.7)` gives one row with `kind 'group'`, `id` the group id, `ticker null`, `stake 0.7`, `stakeValue === groupStake(groupById(g, id)!)`, `exKey 'KRX:KOSPI'` and `tier === capTier(row.marketCap)`.
    - `row.marketCap / (sharePriceOf(grp) * 2_000_000)` is close to 1, `row.sharesOut` is 2_000_000, `row.stakeValue` is above 0 and `row.price` is above 0.01 (the kit's members are worth something).
    - `row.outside === outsideFloat(grp.core)`, with no cast.
    - A group with `core.listing = null` gives no row.
  - `'places each company on the exchange it trades on'` (Review Focus 1): a `founder(7, 'gb')`, who lives in London, has three companies:
    - `listed(g, { countryId: 'jp' })` gets `exKey 'TSE:Nikkei 225'`.
    - `listed(g, { countryId: 'ir' })` gets `'TSE:TEDPIX'`.
    - `listed(g, { countryId: 'jp', exchange: 'NYSE' })` (spun off a New York group) gets `'NYSE:S&P 500'`.
    - No row has `'LSE:FTSE 100'`.
  - `'is pure'`: with a company, a company with no stored ticker, and a group, `JSON.stringify(g)` and `g.rng` are unchanged after two calls of `ownListings(g)`.
- [ ] **Step 2: Run** `npx vitest run test/own-listing.test.ts`. Expected: FAIL, `ownListings` is not exported.
- [ ] **Step 3: Implement** `OwnListing`, `rawStake` and `ownListings`.
- [ ] **Step 4: Run** `npx vitest run test/own-listing.test.ts test/listing-id.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: list the player's listed companies and groups`.

### Task 4: Buying from the Stocks row

**Files:**
- Create: `src/game/business/own-trade.ts`
- Modify: `src/game/business/rescue.ts`. Add `equityYearKey`, and use it at lines 34 and 45.
- Test: `test/own-trade.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `outsideFloat`
  - from Task 2: `companyExchange`, `tickerOf` and `isTicker`
  - from `gate.ts`: `manageBlock` (line 7)
  - from `board.ts`: `ownerControls` (line 70). Only the tests use it, to check `controlsWith` against the board as it sits. `own-trade.ts` asks every control question through `controlsWith`.
  - from `board-state.ts`: `seatPlan`, `boardOf` and `syncSeats` (lines 298, 274, 368)
  - from `conglomerate-state.ts`: `groupIdOf`
  - from `economy.ts`: `valuationOf` and `refreshValue` (lines 862, 897)
  - `retailDepth` (`share-structure.ts`) and `buyImpact` (`invest/liquidity.ts`)
  - `exchangeStatus` and `exchangeName` (`engine.ts`)
  - from `core.ts`: `useYearAction`, `yearActionsUsed`, `addMoney`, `notice`, `log`, `formatPrice` and `formatMoney`
  - `shareCountText` (`share-structure.ts`), and `money`, `pct` and `clampN` (`business/util.ts`)
- Produces, in `rescue.ts`: `export function equityYearKey(assetId: string): string`, which returns `` `equity.${assetId}` ``. The rescue block and `transactEquity` use it in place of the literal, so a Stocks buy and Buy Out Investors share one key (D3).
  - `transactEquity` uses this one key for all three kinds (`rescue.ts:34` and `:45`). So a Stocks buy also uses up Put In More Money and Company Buys Back Shares for that company this year, and either of those uses up a Stocks buy. This is intended: the Stocks buy is one more secondary purchase, it gets the same one move a year that Buy Out Investors already shares with the other two, and Capital & Ownership's logic stays as it is.
- Produces, in `own-trade.ts`:
  - `export const BUY_PREMIUM = 0.03`, `export const MAX_BUY_SHARE = 0.15`, `export const MIN_OUTSIDE = 0.01`
  - `export interface BuyQuote { dollars: number; basePrice: number; avgPrice: number; fraction: number; shares: number; newShare: number; maxFraction: number; maxDollars: number; controlsBefore: boolean; controls: boolean }`
  - `export function controlsWith(g: GameState, b: BizState, share: number): boolean`: `seatPlan(g, { ...b, share })`, then `size === 0 || (owner + group) * 2 > size`.
  - `export function buyQuote(g: GameState, a: Asset, b: BizState, dollars: number): BuyQuote`
  - `export function buyLimit(g: GameState, a: Asset, b: BizState): string | null`
  - `export function buyPreview(g: GameState, a: Asset, b: BizState, dollars: number): string`
  - `export function buyOwnShares(g: GameState, a: Asset, b: BizState, dollars: number): boolean`

`buyQuote` maths (D4, D5). The tests do not fully pin the cap inversion, so it is given here:

```
d           = Number.isFinite(dollars) && dollars > 0 ? dollars : 0        // the quote's `dollars` field
if !(b.sharesOut > 0) || !(b.sharePrice > 0): return the zero quote
              (every number 0 except dollars = d and newShare = b.share; controlsBefore = controls = controlsWith(g, b, b.share))
basePrice   = max(b.sharePrice, b.valuation / b.sharesOut, valuationOf(b) / b.sharesOut) * (1 + BUY_PREMIUM)
cap         = basePrice * b.sharesOut                    // the whole company at the buy price
depth       = retailDepth(basePrice)
maxFraction = clamp(min(MAX_BUY_SHARE, outsideFloat(b) - MIN_OUTSIDE), 0, 1)
maxDollars  = floor(cap * depth / 0.6 * expm1(0.6 * maxFraction / depth))   // inverse of buyImpact().value
fraction    = min(maxFraction, buyImpact(d / cap, depth).value)             // 0 when d is 0
avgPrice    = fraction > 0 ? d / (fraction * b.sharesOut) : basePrice
shares = fraction * b.sharesOut;  newShare = b.share + fraction
controlsBefore = controlsWith(g, b, b.share);  controls = controlsWith(g, b, newShare)
```

The zero quote matters because `buyLimit` may compute `q` before its `!b.public` and "isn't trading" checks: a private or hostile record must still give finite numbers.

Why `b.valuation / b.sharesOut` is among the floors: `b.valuation` is the market cap `stakeValue` marks the stake at, so pricing at no less than it per share keeps a buy from raising net worth.

`buyLimit` returns the first reason that applies, in this order, with this exact copy. Board control is not on the list: a Stocks buy is a market purchase from the float with no board vote, allowed at any stake (D3). Buy Out Investors keeps its control check and vote (`rescue.ts:33` and `:44`).
1. `manageBlock(g, a)`, in place of the `tradeBlock` §4.3 names (it is private to `computer/money-stocks.ts`). It covers alive, prison and age, and also refuses when the company is gone or the stored stake is 0 or less.
2. `groupIdOf(b)`: `"The group owns this division. Trade the group's shares from its screen."`
3. `!b.public`: `"It isn't listed."`
4. `!(b.sharesOut > 0 && b.sharePrice > 0)`: `"It isn't trading."`
5. `exchangeStatus(companyExchange(b), g.year) !== 'open'`: `` `The ${exchangeName(info, g.year)} is closed this year.` ``
6. `yearActionsUsed(g, equityYearKey(a.id)) > 0`: `"You've used this company's one ownership move this year, here or in Capital & Ownership."` (true whichever door used it, including Put In More Money)
7. `q.maxDollars < Math.ceil(q.basePrice)` with `g.character.money >= Math.ceil(q.basePrice)`: `'No outside shares left to buy. 1% stays with the public.'`
8. `g.character.money < Math.ceil(q.basePrice)`: `"You can't afford one share."`

`buyPreview` reads `` `${shareCountText(shares)} shares at about ${formatPrice(avgPrice)} each (market ${formatPrice(b.sharePrice)}). You'd own ${pct(newShare, 1)}.` ``. Then, from the quote:
- `controlsBefore` and `controls` both true: it adds `' You keep control of the board.'`
- `controlsBefore` false and `controls` true (the buy crosses 50%): it adds `' This gives you control of the board.'`
- `controls` false (you stay below control): it adds nothing. A buy never loses control, so there is no fourth case.

`buyOwnShares`:
- Reject `dollars` that is not finite or below 1. Then set `dollars = Math.round(dollars)`, as `transactEquity` does (`rescue.ts:40`), and use that rounded value for `buyQuote`, the limit check, `addMoney`, `b.invested` and the notice.
- Reject any `buyLimit` reason, or `dollars > min(q.maxDollars, g.character.money)`. Each rejection posts `notice(g, 'Buy Shares', reason)` and returns false without using the year key. An order that is too big reads `` `You can buy up to ${money(min(q.maxDollars, cash))} this year.` ``
- Otherwise:
  - `useYearAction(g, equityYearKey(a.id), 1)`
  - persist `b.ticker = tickerOf(g, a, b)` when `!isTicker(b.ticker)`
  - `addMoney(g, -dollars)`, then `b.invested += dollars`, then `b.share = q.newShare`
  - leave `sharesOut`, `sharePrice`, `valuation` and `pref` unchanged (D4)
  - `syncSeats(g, a, b, boardOf(b))`, then `refreshValue(a, b)`
  - log `` `I bought more of ${a.name} on the ${exCode}. I own ${pct(newShare, 1)}.` ``
  - notice titled `'Shares Bought'`: `` `You paid ${formatMoney(dollars)} for ${shareCountText(shares)} shares of ${a.name}, about ${formatPrice(avgPrice)} each. You own ${pct(newShare, 1)}.` ``
  - return true
- No `count(...)` for `investTrades` or `moneyInvested` (D6), and no `g.rng`.

- [ ] **Step 1: Write the failing tests** in `test/own-trade.test.ts`, under `describe('buying your own shares')`, using the kit.
  - `'pays at least the fundamental price plus 3% and leaves the quote where the market had it'` (D4):
    - Case 1: `listed(g, { marketCap: 10e9, profit: 0 })`. `buyQuote(...).basePrice` is close to `b.sharePrice * 1.03`.
    - Case 2: `listed(g, { marketCap: 10e9, profit: 5e9 })`, so the fundamental is above the quote. `basePrice` is close to `valuationOf(b) / b.sharesOut * 1.03`.
    - In both cases `avgPrice >= basePrice`.
    - After `buyOwnShares(g, a, b, 1e8)`, `sharePrice`, `valuation` and `sharesOut` are unchanged, and `b.share` is close to the old value plus `q.fraction` (9 digits).
  - `'moves the cash into the stake once'` (D1, D6). After a 1e8 buy:
    - Cash and cost basis: `g.character.money` fell by exactly 1e8, `b.invested` rose by exactly 1e8, and `a.value === stakeValue(b)`.
    - No second copy of the shares: `investmentHoldings(g)` is empty, `g.assets.length` is unchanged, and `netWorth(g)` is `<=` before and `>=` before minus 1e8.
    - Untouched: `g.counters.investTrades` and `moneyInvested` are unchanged, and so is `g.rng`.
    - Sell Everything ignores it: after `liquidatePortfolio(g)`, the company is still in `g.assets` with the same `share`.
  - `'stops at 15% a year and leaves 1% with the public'` (D3, D11):
    - **Share 0.6:** `maxFraction` is 0.15, and `buyQuote(..., 1e30).fraction` is at most 0.15.
    - **Over the limit:** `buyOwnShares(..., q.maxDollars + 10)` returns false. The queue gets a notice titled `'Buy Shares'`, `share` is unchanged, and `yearActionsUsed(g, equityYearKey(a.id))` is 0.
    - **At the limit:** `buyOwnShares(..., q.maxDollars)` is true, and `share` is close to 0.75 (4 digits).
    - **Share 0.9:** after a buy at `maxDollars`, `outsideFloat(b)` is close to 0.01 (4 digits).
    - **Insiders' slices:** with share 0.6, `executive: 0.05` and family 0.3, `maxFraction` is close to 0.04. After `buyOwnShares(g, a, b, q.maxDollars)`, `b.familyShares[0].share` is 0.3, `executiveEquity(b)` is 0.05, and `readBiz(g, a).familyShares[0].share` is 0.3 (nothing is clamped on load, §4.3).
    - **Rounding:** on a fresh game at share 0.6, `buyOwnShares(..., q.maxDollars + 0.4)` is true, and cash fell and `b.invested` rose by exactly `q.maxDollars`.
    - **Share 0.995:** the reason is `'No outside shares left to buy. 1% stays with the public.'`
  - `'once a year, shared with Capital & Ownership'` (D3):
    - After one buy, `buyLimit` returns the year reason and a second buy is false.
    - `transactEquity(g, a.id, 'secondary', 1000)` and `transactEquity(g, a.id, 'subscribe', 1000)` are both false, and the notice text is `'One of these a year per company.'` (the rescue block refuses before any board vote, so this needs no RNG).
    - After `g.yearActions = {}`, `buyLimit` is null.
    - On a fresh game, `useYearAction(g, equityYearKey(a.id), 1)`, the call every `transactEquity` kind makes (`rescue.ts:45`), makes `buyLimit` return the year reason. This pins the other direction without going through `transactEquity`'s seeded board vote.
  - `'needs an adult out of prison, an open exchange and the cash'` (§4.3):
    - age 17 gives a reason matching `/18/`
    - in prison gives `/prison/`
    - `alive = false` gives a reason
    - `privateCompany` gives `"It isn't listed."`
    - a `listedGroup` member with `public = true` forced gives `/group/`
    - a `countryId: 'jp'` company at `g.year = 1946` gives `/closed this year/`
    - `g.character.money = 10` gives `"You can't afford one share."`
  - `'edge of control'` (Review Focus 3):
    - For `s` of `[0.3, 0.49, 0.5, 0.51, 0.8]`, with `b.share = s` and no family, `controlsWith(g, b, s) === ownerControls(g, a)`.
    - No board control is needed (D3): at 0.49 `buyLimit` is null, and at 0.3 it is null.
    - At 0.3, `buyPreview(g, a, b, 1e8)` does not contain `'control of the board'`.
    - **Crossing 50%:** at 0.45 with no family and no executives, `ownerControls(g, a)` is false. With `m = buyQuote(g, a, b, 1).maxDollars` (a 0.15 buy, to about 0.6), `buyQuote(g, a, b, m)` has `controlsBefore` false and `controls` true, and `buyPreview(g, a, b, m)` contains `' This gives you control of the board.'` and not `'You keep control'`. After `buyOwnShares(g, a, b, m)`, `ownerControls(g, a)` is true.
    - **Keeping it:** on a fresh game at 0.5, `buyPreview(g, a, b, 1e8)` contains `' You keep control of the board.'`. After a buy from 0.5, `ownerControls(g, a)` is still true.
  - `'quotes and previews are pure and finite for any amount'` (D13): for `d` of `[0, -5, NaN, 1, 1e8, 1e30]`:
    - every numeric `BuyQuote` field is finite (`controlsBefore` and `controls` are booleans), `q.dollars` is 0 for `0`, `-5` and `NaN`, and `0 <= fraction <= maxFraction`;
    - on a copy with `sharesOut = 0`, every numeric field is still finite and `maxDollars` is 0;
    - `buyPreview` has no `NaN`, `undefined` or `Infinity`;
    - `JSON.stringify(g)` and `g.rng` are unchanged across all calls of `buyQuote`, `buyLimit`, `buyPreview` and `controlsWith`.
- [ ] **Step 2: Run** `npx vitest run test/own-trade.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Add** `equityYearKey` to `rescue.ts` and use it at lines 34 and 45.
- [ ] **Step 4: Implement** `own-trade.ts` as specified.
- [ ] **Step 5: Run** `npx vitest run test/own-trade.test.ts test/board.test.ts test/family-sellout.test.ts test/business.test.ts test/business-financial-overhaul.test.ts test/conglomerate-autonomy.test.ts` and `npm run typecheck`. Expected: PASS. The last three cover `transactEquity` and the rescue menu, whose key literal Step 3 replaced.
- [ ] **Step 6: Commit** `feat: buy your own listed shares, capped and priced at the fundamental`.

### Task 5: Selling from the Stocks row

**Files:**
- Modify: `src/game/business/own-trade.ts`
- Modify: `src/game/business/manage.ts:1958`. Use `shareSaleKey(cur.id)` and `SHARE_SALES_PER_YEAR` from `own-trade.ts`.
- Test: `test/own-trade.test.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `controlsWith`
  - from `exit.ts`: `sellShares` (line 231) and `capitalGainsTax` (line 44)
  - `saleImpact` (`invest/liquidity.ts`) and `retailDepth`
  - `manageBlock` (`gate.ts`)
  - from `state.ts`: `findBusiness` and `bizOf`
  - from `core.ts`: `useYearAction`, `yearActionsUsed` and `notice`
  - `money` and `clampN` (`business/util.ts`)
- Produces:
  - `export const SHARE_SALES_PER_YEAR = 2`
  - `export function shareSaleKey(assetId: string): string`, which returns `` `biz.shares.${assetId}` ``. This is the key Exit › Sell Shares uses.
  - `export function sellLimit(g: GameState, a: Asset, b: BizState): string | null`. It returns the first reason in this order: `manageBlock`; `!b.public` gives `"It isn't listed."`; `yearActionsUsed(g, shareSaleKey(a.id)) >= SHARE_SALES_PER_YEAR` gives `"You've sold shares twice this year."` There is no exchange check, because Exit › Sell Shares has none and both doors are the same sale (§4.4).
  - `export function sellNote(g: GameState, a: Asset, b: BizState, fraction: number): string`. It is pure. It starts with `` `About ${money(gross)} before ${money(tax)} tax.` ``:
    - `gross = round(b.sharesOut * b.sharePrice * saleImpact(b.share * f, retailDepth(b.sharePrice)).proceeds)`
    - `tax = capitalGainsTax(g, gross, b.invested * f)`
    - `f` is the clamped fraction
    - Then it adds `` ` That's the last of your shares. ${a.name} leaves your companies.` `` when `f >= 0.999` or `b.share * (1 - f) < 0.005` (the removal rule at `exit.ts:245`).
    - Otherwise it adds `" You'd lose control of the board."` when `controlsWith(g, b, b.share)` and not `controlsWith(g, b, b.share * (1 - f))`. The copy says exactly what that condition tests. The IPO preview's warning (`exit.ts:206`) joins two clauses with a colon; this copy follows VOICE rule 7 instead.
  - `export function sellOwnShares(g: GameState, assetId: string, fraction: number): boolean`:
    - find the asset with `findBusiness`; no asset returns false with no notice and no key used
    - then `bizOf`
    - a `fraction` that is not finite or is `<= 0` returns false with no key used
    - a `sellLimit` reason posts `notice(g, 'Sell Shares', reason)` and returns false
    - otherwise `useYearAction(g, shareSaleKey(a.id), SHARE_SALES_PER_YEAR)`, then `sellShares(g, a, b, clampN(fraction, 0, 1))`, then return true

- [ ] **Step 1: Write the failing tests** under `describe('selling from the Stocks row')`.
  - `'is Exit › Sell Shares: same proceeds, tax and price'` (D3, D5, D6): on a `structuredClone` of the game, call `sellShares(clone, a2, b2, 0.1)` directly. Compare with `sellOwnShares(g, a.id, 0.1)`: `g.character.money`, `share`, `sharePrice` and `invested` are equal.
  - `'uses the same two sales a year as Exit › Sell Shares'`:
    - Two `sellOwnShares(g, a.id, 0.05)` calls are true. The third is false, with a `'Sell Shares'` notice whose text is `"You've sold shares twice this year."`, and `yearActionsUsed(g, shareSaleKey(a.id)) === 2`.
    - Then reset `g.yearActions = {}` and run `` (findNode(g, businessAssetView(g, a), `biz.sellShares.${a.id}`) as MenuAction).run(g, '5') ``. After that, one `sellOwnShares` is true and the next is false.
  - `'selling out removes the company once and pays relatives once'` (Review Focus 4, D11):
    - Setup: a sibling 'Mina' with `familyShares [{ id: sib.id, share: 0.3 }]` and `share 0.5`.
    - `sellOwnShares(g, a.id, 1)` is true. The asset is gone from `g.assets`.
    - Mina's money rose by more than `0.3 * marketCap * 0.6` and at most `0.3 * marketCap`.
    - A `'Sold Out'` notice names Mina.
    - A second `sellOwnShares(g, a.id, 0.5)` is false, and Mina's money is unchanged.
  - `'the preview says what the sale does'` (Review Focus 3 and 4):
    - With `b.share = 0.52`, `sellNote(g, a, b, 0.1)` contains `"You'd lose control of the board."`, and `sellNote(g, a, b, 0.01)` does not.
    - `sellNote(g, a, b, 1)` contains `` `That's the last of your shares. ${a.name} leaves your companies.` ``.
    - With `b.share = 0.006`, `sellNote(g, a, b, 0.2)` contains the same line.
    - Every note starts with `'About '`.
    - `JSON.stringify(g)` and `g.rng` are unchanged.
  - `'refuses without selling'`:
    - A fraction of `0`, `-1` or `NaN` returns false, and the key is unused.
    - `sellOwnShares(g, 'nope', 0.5)` returns false, queues no notice and uses no key.
    - `privateCompany` gives `"It isn't listed."`
    - In prison, the reason matches `/prison/`.
- [ ] **Step 2: Run** `npx vitest run test/own-trade.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the four exports, and switch `manage.ts:1958` to `useYearAction(gg, shareSaleKey(cur.id), SHARE_SALES_PER_YEAR)`.
- [ ] **Step 4: Run** `npx vitest run test/own-trade.test.ts test/family-sellout.test.ts test/share-structure.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: sell your listed shares from Stocks through the same sale as Exit`.

### Task 6: The Stocks list and the company screen

**Files:**
- Modify: `src/game/investments.ts`. Add the hook just above `const stocksMenu` (line 1578), and rewrite `stocksMenu.children` (lines 1596-1612).
- Create: `src/game/business/own-listing-menu.ts`
- Modify: `src/game/business.ts`. Add the side-effect import `import './business/own-listing-menu'` next to the imports at lines 7-17.
- Test: `test/own-listing-menu.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `TIER_LABEL`
  - from Task 3: `ownListings`, `OwnListing` and `rawStake`
  - from Task 4: `buyQuote`, `buyLimit`, `buyPreview` and `buyOwnShares`
  - from Task 5: `sellLimit`, `sellNote` and `sellOwnShares`
  - from `state.ts`: `findBusiness`, `readBiz` and `bizOf`; from `conglomerate-state.ts`: `groupById`
  - `capitalGainsRate` (`exit.ts:37`), `shareCountText`, `formatPrice`, `formatMoney`, `money` and `pct`
- Produces, in `investments.ts`:
  - `export interface OwnStockRow { exKey: string; size: string; node: MenuGroup }`
  - `export function registerOwnListings(provider: (g: GameState) => OwnStockRow[]): void`. The default provider returns `[]`. Calls are wrapped in `try/catch` and fall back to `[]`, as `board-state.groupOf` does (lines 155-160).
- Produces, in `own-listing-menu.ts`: `export function ownStockRows(g: GameState): OwnStockRow[]` and `export function ownListingNode(l: OwnListing): MenuGroup`. The module ends with `registerOwnListings(ownStockRows)`.

How `stocksMenu.children` merges the rows (D8):
- `rows` is what the provider returns.
- If `noStockMarket` is true, return today's info row followed by the block.
- `sized` is defined as today.
- If `sized`, the rows on this exchange are those with `exKey === l.info.key`, and all other rows go to the block. If not `sized`, every row goes to the block.
- The block is a heading `{ id: 'inv-stocks-own', label: 'Your listed companies' }` followed by its rows' nodes. It is left out when there are no such rows, and it goes first.
- When `sized`, sections come in the order `'Mega-cap', 'Large-cap', 'Mid-cap', 'Small-cap'`. Each section holds the own rows of that size first, then that size's quotes in today's order.
- A non-empty section gets today's heading: `inv-stocks-h-${size}`, labelled `'Smaller companies'` or `` `${size}s (rough size)` ``.
- With no own rows the output equals today's, because sizes are contiguous in rank order (`real.ts:200-201`: class × 100 + fame, with fame at most 10).

The company row, built by `ownListingNode`:
- id: `inv-own-${id}` for a company, `inv-own-g-${id}` for a group
- emoji: `🏢`
- label: `` `${name} (${ticker})` ``, or just the name for a group
- subtitle: `` `${formatPrice(price)} · ${TIER_LABEL[tier]} · yours ${pct(stake, stake < 0.1 ? 1 : 0)} · ${exCode}` ``. No "this year" and no dividend.
- header: `` `🏢 ${label}` ``

The screen, `children(g)`, starts from a fresh read every call: `const cur = ownListings(g).find((x) => x.kind === l.kind && x.id === l.id)`. Every info row, subtitle and slider bound below reads `cur`, never the `l` the row was built from. That matters because both actions use `stayOpen: true`, and anything that holds the node (a test, or a caller that skips the UI's re-resolve by id in `MenuList.tsx:39-50`) would otherwise show the stake from before the trade.
- When `cur` is undefined and you still hold a stake in it (the company is still found by `findBusiness` with `rawStake > 1e-6`, or `groupById` still finds the group with `core.share > 0`), it returns `[{ type: 'info', id: 'gone', text: "It isn't listed any more." }]`. This is the company that joined a group (`conglomerate-actions.ts:414-419` makes it private), or a group that delisted.
- Otherwise, when `cur` is undefined, it returns `[{ type: 'info', id: 'gone', text: 'You no longer own this.' }]`.
- For a company, the screen also takes `const a = findBusiness(g, l.id)!` and the view `const b = { ...readBiz(g, a), share: rawStake(g, a) }`. Every quote, limit, bound and preview runs on that `b`, so a stored 0.6% stake is not read as `normalizeBiz`'s 1% floor. Each `run` re-finds the asset and passes `bizOf` to the trade.

When `cur` is defined, the screen shows these info rows, with ids `inv-own-${id}-i${n}`, every field read from `cur`:
1. `` `Market cap: ${money(marketCap)} · ${TIER_LABEL[tier]}` ``
2. `` `Price: ${formatPrice(price)}` ``. When `ipoPrice` is set, add `` ` · ${up|down} ${pct(|price / ipoPrice - 1|)} since the IPO` ``.
3. `` `Your stake: ${shareCountText(stake * sharesOut)} shares, ${pct(stake, 1)}, worth ${money(stakeValue)}` ``. For a group: `` `Your stake: ${pct(stake, 1)} of the group, worth ${money(stakeValue)}` ``.
4. `` `Outside shareholders: ${pct(outside, 1)}` ``, plus `` ` · relatives ${pct(family, 1)}` `` and `` ` · executives ${pct(executives, 1)}` `` when each is above 0.
5. `` `Listed on the ${exName} (${exCode}) since ${ipoYear}.` ``
6. Company only: `` `Above 50% you control the board. You hold ${pct(stake, 1)}.` ``
7. Company only: `` `Buying costs at least 3% over the market price, more for big orders. Selling pays ${pct(capitalGainsRate(g))} tax on the gain.` ``
8. Group only: `"Trade its shares from the group's screen under Businesses."` A group screen has no actions (D10).

After the info rows, a company screen has a heading `{ id: 'inv-own-${id}-h', label: 'Trade' }` and two actions. Both use slider inputs: a number input can't show a preview in the UI (`MenuList.tsx:212` renders previews for sliders only), and §4.2 needs the preview before the trade runs. The sell-out warning D11 puts in "the sell confirmation" lives in the Sell preview for the same reason: `MenuAction.confirm` gets only `g` (`types.ts:770`), not the slider value.
- **Buy Shares:** id `inv-own-buy-${id}`, emoji `💵`.
  - Subtitle: `` `At least ${formatPrice(basePrice)} a share · up to ${pct(maxFraction)} of the company` ``.
  - `disabledReason` is `buyLimit`.
  - Input: `kind 'slider'`, `money: true`, label `` `How much? You have ${formatMoney(cash)}.` ``.
  - Bounds: `min = max(1, ceil(basePrice))` and `max = max(min, floor(min(cash, maxDollars)))`, both finite always.
  - Default: `max(min, floor(max / 2))`, with `roundDefault: true`.
  - `preview` is `buyPreview`.
  - `run` re-finds the asset, calls `bizOf`, then `buyOwnShares`.
  - `stayOpen: true`.
- **Sell Shares:** id `inv-own-sell-${id}`, emoji `💸`.
  - Subtitle: `` `Two sales a year · ${shareCountText(stake * sharesOut)} shares` ``.
  - `disabledReason` is `sellLimit`.
  - Input: `kind 'slider'`, label `'Percent of your shares to sell'`, `min 1`, `max 100`, `step 1`, `unit '%'`, default `'10'`.
  - `preview` is `(g, v) => sellNote(g, a, b, v / 100)`.
  - `run` calls `sellOwnShares(g, id, Number(input) / 100)`.
  - `stayOpen: true`.

- [ ] **Step 1: Write the failing tests** in `test/own-listing-menu.test.ts`. The file imports `'../src/game/business'`, which is the app's registration path, and reads Stocks as `(investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup).children(g)`.
  - `'puts your company at the top of its tier on its own exchange'` (D7, D8):
    - A US resident with `listed(g, { marketCap: 50e9 })`.
    - The node right after the heading with id `inv-stocks-h-Large-cap` (labelled `'Large-caps (rough size)'`) is `inv-own-${a.id}`.
    - Its label is `` `${a.name} (${tickerOf(g, a, b)})` ``.
    - Its subtitle contains `'Large-cap'`, `'yours 60%'` and `'NYSE'`, and does not match `/this year/`.
    - The number of `inv-offer-` menus equals `slotPlan(exchangeInfo('us')).length`.
  - `'adds the heading for a tier the exchange lacks this year'`:
    - The US list in 2026 has no `'Mid-caps (rough size)'`.
    - A US `marketCap: 5e9` company makes that heading appear right after the Large-cap section and before `'Smaller companies'`, followed by its row.
  - `'uses the block on an exchange without size headings'`:
    - A resident of `'jm'` with a `countryId: 'jm'` company.
    - Node 0 is the heading `inv-stocks-own` labelled `'Your listed companies'`, and node 1 is the row.
    - The remaining ids equal the ids rendered after `registerOwnListings(() => [])`. Restore `ownStockRows` in `finally`.
  - `'shows a company listed elsewhere in the block, naming its exchange'` (Review Focus 1):
    - A Japan resident with a US company: the row is in the block, and its subtitle contains `'NYSE'`. Its id appears exactly once.
    - A US resident sees the same company in its tier section, and there is no `inv-stocks-own` heading.
    - A China resident at `g.year = 1960` (no stock market) with a US company gets `['inv-stocks-none', 'inv-stocks-own', inv-own-${a.id}]`.
  - `'a group gets one view-only row'` (Review Focus 2):
    - A Korean resident with `listedGroup(g, 'kr', 0.7)` sees one `inv-own-g-${id}` and no `inv-own-${member.id}`.
    - The row's children contain no `action`, and do include `"Trade its shares from the group's screen under Businesses."`
    - After `sellGroupShares(g, id, 1)`, the row is gone.
  - `'the screen shows the stake and both doors with sane bounds'`:
    - Info texts include rows starting `'Market cap: '`, `'Your stake: '`, `'Outside shareholders: '` and `'Listed on the '`, and one containing `'Above 50% you control the board.'`.
    - Both actions exist with `input.kind === 'slider'`. The buy action has `input.money === true`.
    - For every action without a `disabledReason`, `min` and `max` are finite with `min <= max`.
    - `buy.input.preview(g, buy.input.max)` contains `"You'd own"`.
    - `sell.input.preview(g, 100)` contains `'leaves your companies'`.
  - `'Buy and Sell run from the screen'` (Review Focus 4):
    - `buy.run(g, String(buy.input.max))` raises `readBiz(g, a).share`.
    - After `buy.run`, the same row object's `children(g)` has a `'Your stake: '` row containing `pct(readBiz(g, a).share, 1)`, and the Buy action's `disabledReason(g)` is the year reason.
    - `sell.run(g, '100')` removes the company.
    - The stale row's `children(g)` is the single info `'You no longer own this.'`.
    - Stocks no longer contains `inv-own-${a.id}`.
  - `'a 0.6% stake previews its own removal'` (Review Focus 4):
    - Set `a.details.share = 0.006` on a `listed` company with no family shares.
    - The row's subtitle contains `'yours 0.6%'`.
    - `sell.input.preview(g, 20)` contains `'leaves your companies'`.
    - After `sell.run(g, '20')` the company is gone from `g.assets`.
  - `'a company that joins a group says it isn't listed any more'`:
    - Hold the row node of a `listed` company, then leave the record the way joining a group does (`conglomerate-actions.ts:414-419`): `public = false`, `sharesOut = 0`, `sharePrice = 0`, `exchange = ''`. Doing it by hand keeps `formGroup`'s board votes and their RNG out of the test.
    - The held row's `children(g)` is the single info `"It isn't listed any more."`, and Stocks has no `inv-own-${a.id}`.
  - `'an old save shows a derived ticker and no IPO change'` (Review Focus 5):
    - With `ticker` and `ipoPrice` deleted from `a.details`, the label matches `/\([A-Z]{4}\)$/` and is the same on a second render.
    - The `'Price: '` row has no `'since the IPO'`.
    - With `ipoPrice` set to half the price, the row contains `'up 100% since the IPO'`.
  - `'renders from a frozen state without touching it'` (D13, rule 8):
    - Setup: a game with a company, a company with no stored ticker, and a group. Then `const before = JSON.stringify(g); deepFreeze(g)`.
    - Render the Stocks children, every own row's `children`, `subtitle` and `disabledReason`, and each action's `preview` at `min` and `max`.
    - No throw, and the JSON is unchanged.
  - `'is not a market security'` (§4.5, D2):
    - `investmentListing(g)` has no entry with the company's ticker or name, and `investmentHoldings(g)` is empty.
    - Not a politics target either: `listedTargets(g)` (`computer/money-stocks.ts:97`) has no entry whose name is `a.name`, and `` findTarget(g, `inv-own-${a.id}`) `` is undefined. `insiderPositions` and announcements read only these targets, so the own company stays out of insider cases (§4.5).
- [ ] **Step 2: Run** `npx vitest run test/own-listing-menu.test.ts`. Expected: FAIL, `registerOwnListings` is not exported.
- [ ] **Step 3: Implement** the hook and the merge in `investments.ts`.
- [ ] **Step 4: Implement** `own-listing-menu.ts` and the import in `business.ts`.
- [ ] **Step 5: Run** these tests (D2, and §7: rows counted for characters without a listed company):
  - `npx vitest run test/own-listing-menu.test.ts test/investments.test.ts test/stocks-real.test.ts test/history-markets.test.ts test/talent-investing.test.ts test/invest-order-notice.test.ts test/fuzz-regressions.test.ts test/voice-guards.test.ts`
  - `npm run typecheck`

  Expected: PASS.
- [ ] **Step 6: Commit** `feat: your listed companies in Investments › Stocks, with buy and sell`.

### Task 7: Story test, docs and release notes

**Files:**
- Create: `test/own-listing-story.test.ts`
- Modify: `docs/ARCHITECTURE.md`:
  - the `business.ts business/*.ts` entry in Layout (line 65)
  - the `investments.ts invest/*.ts` entry (line 104)
  - a new bullet after the **IPO** bullet (lines 636-650)
- Modify: `docs/BUSINESS-AND-DYNASTIES.md:21-24`
- Create: `docs/RELEASE-v2.7.0.md`

**Interfaces:**
- Consumes: everything above, plus `goPublic`, `transactEquity` and `yearlyBusinessImpl` (`business/yearly.ts`).

- [ ] **Step 1: Write the story test**, `it('a founder lists, buys, waits a year and sells out through Stocks')`.
  1. A US founder's software company (three years of 30e6 profit) runs `goPublic(g, a, b, 25)`. `isTicker(b.ticker)` holds.
  2. In Stocks, `inv-own-${a.id}` is the node right after the heading whose id is `` `inv-stocks-h-${TIER_LABEL[capTier(b.valuation)]}` ``. The IPO lands at about $0.8B, so here that is `inv-stocks-h-Small-cap`, whose label is `'Smaller companies'`. Match the id, not the label.
  3. Buy at the slider's `max`:
     - The share rises by at least 0.149 and at most 0.15.
     - `sharePrice` is unchanged.
     - `investmentHoldings(g)` is empty.
     - `netWorth` does not rise.
     - Buy's `disabledReason` is now the year reason, `"You've used this company's one ownership move this year, here or in Capital & Ownership."`
     - `transactEquity(g, a.id, 'secondary', 1000)` and `transactEquity(g, a.id, 'subscribe', 1000)` are false.
  4. Next year: run `g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []; yearlyBusinessImpl(g)`.
     - The company is still public with the same ticker.
     - After `JSON.parse(JSON.stringify(g))`, the row still renders.
     - Buy's `disabledReason` is null.
  5. Sell runs with `'100'`. The company and its row are gone, and a `'Sold Out'` notice is queued.
- [ ] **Step 2: Run** `npx vitest run test/own-listing-story.test.ts`. Expected: PASS on the first run, since it only drives code from Tasks 2-6. If it fails, fix the owning task's code, not the test.
- [ ] **Step 3: Docs.**
  - **`ARCHITECTURE.md`, Layout:** list `business/own-listing.ts listing-id.ts own-trade.ts own-listing-menu.ts`, described as: the player's listed companies in Stocks (tiers, ticker and exchange, buy and sell rules, row and screen).
  - **`ARCHITECTURE.md`, `investments.ts` entry:** add that `registerOwnListings` is how `business/own-listing-menu.ts` adds rows, so `investments.ts` still imports nothing from `business/`.
  - **`ARCHITECTURE.md`, new bullet "Your listed companies in Stocks":**
    - D1 (no investment Asset) and D2 (no `Quote`).
    - Placement by `listing-id.listedExchange` (D8).
    - The fixed tiers (D7).
    - The buy price floor and the limits shared with `equityYearKey` (D3, D4). That key is the one move a year for all three Capital & Ownership kinds, so a Stocks buy also uses up Put In More Money and Company Buys Back Shares.
    - A Stocks buy needs no board control and holds no board vote, because it is a market purchase from the public float. It is how a founder who holds under half after the IPO wins control back, and its preview says when a buy crosses 50%. Buy Out Investors still needs control and a board vote (`rescue.ts:33` and `:44`). The Stocks door stays free of `g.rng`.
    - The sale shared with `shareSaleKey`.
    - `BizState.ticker` and `ipoPrice` set by `goPublic` and `detach`.
    - Groups are view-only.
  - **`BUSINESS-AND-DYNASTIES.md`:** one bullet saying Investments › Stocks is a second door to Capital & Ownership and Exit › Sell Shares.
- [ ] **Step 4: Release notes** `docs/RELEASE-v2.7.0.md`, in the shape of `docs/RELEASE-v2.6.1.md`: a one-paragraph summary, then sections.
  - Sections: **In Stocks**, **Buying**, **Selling**, **Groups**, **Old saves**, **Not in this release**.
  - The figures to state: 200B, 10B and 2B; 15% a year; 1% left with the public; 3% over the higher of the market and fundamental price; two sales a year.
  - **Buying** includes the line "A Stocks buy uses the company's one Capital & Ownership move for the year." and the line "You don't need control of the board to buy. A buy that takes you over 50% gives you control."
  - **Not in this release** lists:
    - share classes (Phase 2);
    - lock-ups and insider rules for owners (D12);
    - dividend yield on the row;
    - trading a group from Stocks;
    - a later replacement company on the exchange that could draw the same four letters as your ticker.
  - VOICE applies, with no em-dashes.
- [ ] **Step 5: Full verification.**
  - `npm run typecheck`, `npm test` (all files), `node scripts/voice-report.mjs` and `npm run build`.
  - Expected: all green. `voice-guards` still reports 24 or fewer em-dashes.
- [ ] **Step 6: Commit** `docs: own listings in Stocks; story test and release notes`, then push.

---

## Self-review

**Spec coverage**

| Spec item | Where it's covered |
|---|---|
| D1 | Task 4 'moves the cash into the stake once', Task 6 'is not a market security' |
| D2 | Task 6 hook and provider |
| D3 | Tasks 4 and 5, shared keys. No control gate on a buy: Task 4 'edge of control'. No board vote: `g.rng` unchanged in Task 4 'moves the cash into the stake once' |
| D4 | Task 4 price floor and unchanged quote |
| D5 | Task 4 `buyImpact` in company units, Task 5 sale parity |
| D6 | Task 4 invested and counters, Task 5 tax parity |
| D7 | Tasks 1 and 3 |
| D8 | Tasks 2, 3 and 6 |
| D9 | Task 2 |
| D10 | Tasks 3 and 6 |
| D11 | Task 4 1% floor, Task 5 sell-out, Task 6 sell preview (including a 0.6% stake) |
| D12 | Release notes only |
| D13 | Purity tests in Tasks 3, 4, 5 and 6 |
| §4.2 | Task 6 screen |
| §4.3 | Task 4 |
| §4.4 | Task 5 |
| §4.5 | Task 4 Sell Everything, Task 6 not a security and not a politics target |
| §6 | Task 2 |
| §7 Phase 1 | Spread as named in each test. Ticker determinism across seeds is Task 2 'the ticker does not depend on the seed'; across exchanges, Task 2 'never takes a ticker the exchange already uses'. The shared year key is pinned in both directions in Task 4 |
| §8 | Review Focus, plus Task 6 runs the existing Stocks tests |

**Departures from the spec, each stated where it is made**
- Split modules.
- `ownTickerFor(name, id, taken)` in place of `ownTickerFor(b, taken)`.
- Sliders in place of number fields, so the previews show.
- `BizState.ipoPrice` added, because "change since the IPO" needs it.
- The buy price floor also includes `b.valuation / sharesOut`.
- No dividend yield on the row, because no payout is recorded.
- Groups have no ticker.
- Ticker uniqueness covers registry, generation-0 filler and generation-0 penny tickers only (D9 says every filler ticker; see Known residual risk).
- The sale warning is in the slider preview, not a confirm (D11 says "the sell confirmation"): `MenuAction.confirm` gets only `g` (`types.ts:770`), so it can't see the slider value.
- Buys and sells gate on `manageBlock` (alive, prison, age, still owned, stake above 0) in place of the investments-only `tradeBlock` that §4.3 names, which is private to `computer/money-stocks.ts`.
- The year key is shared with every `transactEquity` kind, not only 'secondary' (§4.3), because `rescue.ts` keys all three on one key and Capital & Ownership's logic stays as it is (Task 4).

**Type consistency**

These names are spelled the same in every task that uses them: `OwnListing`, `ownListings`, `rawStake`, `CapTier`, `TIER_LABEL`, `Holders`, `outsideFloat`, `companyExchange`, `listedExchange`, `tickerOf`, `newTicker`, `reservedTickers`, `exchangesWithCode`, `isTicker`, `BuyQuote`, `buyQuote`, `buyLimit`, `buyPreview`, `buyOwnShares`, `controlsWith`, `equityYearKey`, `shareSaleKey`, `SHARE_SALES_PER_YEAR`, `sellLimit`, `sellNote`, `sellOwnShares`, `OwnStockRow`, `registerOwnListings`, `ownStockRows` and `ownListingNode`.

**Proportion**

The plan is about three times the spec's size for Phase 1 alone. Almost all of that is test assertions and fixed player copy. Code blocks total 30 lines: two algorithms the tests don't pin, and one interface. No function bodies are transcribed.

**Known residual risk**

- A ticker is checked against every registry company, every first-generation company and every first-generation penny stock of its exchange, and against your other companies. It is not checked against a made-up company that replaces a failed one in a later year, which could draw the same four letters. Rows are keyed by id, so nothing breaks; the duplicate is cosmetic.
- Two of your old-save companies on one exchange whose names give the same four letters: if the first leaves, the second's derived ticker can change. It's stored for good at its next Stocks buy.
- A group or spin-off that spans two countries whose exchanges share a code (TSE is Tokyo and Tehran, JSE is Johannesburg and Jamaica) may show under the other one. `listedExchange` resolves the code from the members' countries in member order, which changes as stakes change. Storing an exchange key would not fix it: the group listing itself stores only the code (`conglomerate-actions.ts:1081` and `:1093`), and a standalone company's own country already resolves its IPO exchange.
