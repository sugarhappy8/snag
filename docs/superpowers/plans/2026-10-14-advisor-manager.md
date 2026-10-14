# A Financial Advisor and a Financial Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An adult player can hire a financial advisor, who reports the biggest problems in their money, and a financial manager, who keeps a stated mix of stock funds, bonds and savings every year for a fee. Skill, trust and a yearly limit decide how well and how safely the manager works. The manager can never put the player in an insider-trading case.

**Architecture:** One owner-stamped record, `g.flags['fin.team']`, read through `readTeam`. No new `Asset` and no new `Person`: the manager's trades are ordinary investment holdings. New code lives in `src/game/advisors/`:
- `mandate.ts`: the mandate, the pure yearly plan and the skill knobs.
- `team.ts`: the record, offers, fees, gates, vetting, hire and release.
- `review.ts`: the advisor's six findings.
- `year.ts`: the yearly step (fees, trades, catch, statement).
- `menu.ts`: Assets, Business & Investments, Money Team.

`investments.ts` gets a seam, not a copy: a `quiet` flag on `buySecurity` and `sellHolding`, plus `managedBook` (pure) and `managedOrder`. `investments.ts` imports nothing from `advisors/`; `advisors/` imports it.

**Tech Stack:** TypeScript (strict), Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-advisor-manager-design.md` (D1 to D16, sections 4 to 11). This plan covers all of it. Nothing is deferred to a later phase.

## Global Constraints

**Build and tests**
- Run tests one file at a time while developing: `npx vitest run <file>`. Typecheck with `npm run typecheck`. The full suite (`npm test`, about 20 minutes) runs only in Task 7.
- No `any`, no `@ts-ignore`, no new dependencies.
- Hostile values that are valid `Json` (`7`, `'x'`, `null`) are written inline. A fixture that would break `tsc` goes in a `.txt` file.

**Engineering rules (`docs/ARCHITECTURE.md`)**
- Rule 1: state is plain JSON.
- Rule 2: game randomness goes only through `g.rng`. No `Math.random` or `Date.now` in `src/game`.
- Rule 3: actions change `g` in place.
- Rule 8: menus are functions of state and must render from a deep-frozen state (`test/fuzz-kit.ts` `deepFreeze`).
- Rule 9: `investments.ts` imports nothing from `advisors/`. `advisors/` may import `investments.ts`, `core.ts`, `talents.ts`, `nation/office.ts`, `computer/money-stocks.ts`, `events/wealth-core.ts`, `world.ts`, and, read only, `business/state.ts`, `business/board-vote.ts` and `business/conglomerate-state.ts`.
- Rule 11: money is internal constant-2026 dollars, shown only through `formatMoney` or `shortMoney` at render time, and money inputs set `money: true`.
- Rule 13: voice. Every string follows `docs/VOICE.md`.

**Determinism (spec section 6)**
- Menus, subtitles, previews, offers, vetting lines, findings and `managedBook` never read or advance `g.rng`.
- Offers use a local stream: FNV-1a over the key string, then `nextRandom` (`rng.ts:5`), the pattern of `special/common.ts stableRoll`. No import of `assets.ts`.
- Only `yearlyAdvisors` draws from `g.rng`, and only after a manager has been paid: one `chance` for the blunder, one for its direction when it fires, one for the catch when a crook has padded a bill.
- A game with no record returns before any draw.

**Saves**
- The only new state is `g.flags['fin.team']`. It is optional and is read only through `readTeam`, which is the whitelist. It is written only through `writeTeam`.
- Nothing is added to `Asset.details`, `BizState`, `Character` or the save schema. A save without the key plays exactly as before.

**Player-facing text**
- Short and factual, contractions, no morals, no em-dashes, no disclaimers. Colons only for prices and labels. No lists of three (VOICE rule 6).
- Tooltips, subtitles and notices stay at or under 120 characters, life-log lines at or under 90. Findings are under 140.
- The exact copy in this plan is final. `node scripts/voice-report.mjs` must not report more long strings than before.
- Never put model names in code or docs.

**Commits**
- One commit per task, after that task's tests and `npm run typecheck` pass.
- End every commit message with a blank line and the two trailer lines that the dispatching prompt gives you. The orchestrator passes the exact trailers when it dispatches each task.
- Stage only the files in the task's row of the ownership table (`git add <paths>`, then `git commit -- <paths>`). Never `git add -A`, stash, reset or clean: other builds share the checkout.
- Push after Task 7.

**Scope**
- Do not change fees, tax, price impact or blocks in `investments.ts`. Task 1 only adds the flag and the exports.
- Do not touch the Stocks row, the Exit or Capital & Ownership menus, `payDividend`, or any Heavy R&D file.

## Review Focus

The inputs most likely to bite a player, most likely first. Each has a pinning test in the task named.

- **A manager and the insider rule.** Expected: after any number of years the manager's holdings are index funds, bonds and savings only. A mayor with a manager and no hand-picked stock gets no insider case from a law, and `policyWarning` is empty. A hand-picked made-up stock bought in the last two years makes the advisor's top finding. Tests: Task 4 (window, real company, coin rank), Task 5 (holding types, untouched picks), Task 7 (story).
- **Cash for living costs.** Expected: the hook runs after rent, tax and upkeep. The invoice is paid before any trade. A buy never takes cash under the reserve. Tests: Task 5.
- **Popup and double-run.** Expected: eight trades make no `Order Filled` popup; there is one `Year-End Statement`; a second call in the same year (`done`) changes nothing. Tests: Task 1 (quiet), Task 5.
- **A crooked manager.** Expected: padding is `round(0.03 x limit x pool)`, cut to the cash left after the agreed fee; a limit of 10% pads a tenth of 100%; a catch pays back exactly 30% of the padding once, lets them go and bumps the epoch. Tests: Task 5.
- **A damaged or foreign record.** Expected: junk in any field reads as the nearest legal value or as no record. An heir sees no record. Tests: Task 3.
- **Eras and countries.** Expected: before index funds the stock bucket is the investment trust (same `index` type). A shut exchange blocks only the fund; banned private investing idles the manager. Tests: Task 1, Task 5.

## File ownership and order

"Also edited elsewhere" marks files another planned feature or the in-progress Heavy R&D build edits. This plan edits none of the Heavy R&D files (`business/state.ts`, `rd.ts`, `manage.ts`, `products.ts`, `product-market.ts`, `economy.ts`, `history/market-events.ts`). Task 4 only imports from `business/state.ts`.

| Task | Creates | Modifies | Also edited elsewhere | Runs after | Can run alongside |
|---|---|---|---|---|---|
| 1 Engine seam | `test/advisors-kit.ts`, `test/advisors-engine.test.ts` | `src/game/investments.ts` | `investments.ts`: share classes Phase 2 and hedge funds (not alongside) | | 4 |
| 2 Mandate planner | `src/game/advisors/mandate.ts`, `test/advisors-mandate.test.ts` | | | 1 | 4 |
| 3 Team record and hiring | `src/game/advisors/team.ts`, `test/advisors-team.test.ts` | `test/advisors-kit.ts` | | 1, 2 | 4 |
| 4 Advisor findings | `src/game/advisors/review.ts`, `test/advisors-review.test.ts` | `test/advisors-kit.ts` | | 1 | 2, 3 |
| 5 The yearly step | `src/game/advisors/year.ts`, `test/advisors-year.test.ts` | `src/game/aging.ts` | | 1, 2, 3, 4 | |
| 6 Money Team menu | `src/game/advisors/menu.ts`, `test/advisors-menu.test.ts` | `src/game/menus.ts` | | 2, 3, 4, 5 | |
| 7 Story, docs, notes | `test/advisors-story.test.ts` | `docs/ARCHITECTURE.md`, `docs/RELEASE-v2.8.0.md` | both docs: other planned features append their own sections | 6 | |

The files of parallel tasks are disjoint except `test/advisors-kit.ts`, which Tasks 1, 3 and 4 each extend with their own exports. Run parallel tasks in separate worktrees (superpowers:using-git-worktrees), each rebased onto the last finished task before it commits, and commit only the files in its row. In a single tree, run 1, 2, 3, 4 in that order.

---

### Task 1: The engine seam (quiet orders, the managed book)

**Files:**
- Modify: `src/game/investments.ts`. Three hunks: `buySecurity` (line 1017), `sellHolding` (line 1192), and a new section after `liquidatePortfolio` (line 1252).
- Create: `test/advisors-kit.ts`
- Test: `test/advisors-engine.test.ts`

**Interfaces:**
- Consumes: everything already in `investments.ts` (`listing`, `holdingValue`, `typeOf`, `str`, `tradeBlock`, `holdingMarketBlock`, `minTrade`) and `investingBlocked` (`history/markets.ts:542`, already imported).
- Produces, in `investments.ts`:
  - `buySecurity(g, secId, amount, quiet = false): boolean` and `sellHolding(g, assetId, amount, quiet = false): boolean`. With `quiet` true no `notice` and no `log` is queued; every other line, the return value and all money, tax, fee and flow effects are unchanged. Implementation: add `quiet` as the last parameter and prefix each `notice(g, ...)` and `log(g, ...)` call in these two functions with `if (!quiet)`. The call sites are 1025, 1030, 1036, 1040, 1044, 1049, 1057, 1110, 1111 in `buySecurity` and 1199, 1205, 1213, 1214 in `sellHolding`.
  - `export type MandateBucket = 'stocks' | 'bonds' | 'savings'`
  - `export interface BucketBook { value: number; buyBlock: string | null; sellBlock: string | null; yield: number }`
  - `export interface ManagedBook { stocks: BucketBook; bonds: BucketBook; savings: BucketBook; cash: number; minOrder: number; idle: string | null }`
  - `export function managedBook(g: GameState): ManagedBook`
  - `export interface ManagedFill { moved: number; reason: string | null }`
  - `export function managedOrder(g: GameState, bucket: MandateBucket, side: 'buy' | 'sell', dollars: number): ManagedFill`
- Produces, in `test/advisors-kit.ts`:
  - `client(seed = 11, opts: { countryId?: string; money?: number; year?: number; age?: number } = {}): GameState`: `makeTestGame(seed, { age: 40, money: 5_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })`, `lifeId = 'team-<seed>'`, then the clock moved to `opts.year` (age moves with it, as `warp` does in `test/insider-fairness.test.ts`).
  - `own(g, type: 'index' | 'bond' | 'savings' | 'term' | 'stock', dollars: number): Asset`: finds the row of that type in `investmentListing(g)` (for `stock`, the first made-up listed company; for `term`, the `term:` row), buys through `buySecurity`, and returns the holding.
  - `officeJob(g, office: 'mayor' | 'governor' | 'leader'): void`: sets `g.character.job` to a politician exactly as `ukMp` and `leader` do in `test/insider-fairness.test.ts:22-55`.

**Semantics:**
- Buckets by holding: `stocks` is every `index`-type holding, `bonds` every `bond`, `savings` every `savings` holding whose `details.product` is not `'term'`. Single stocks, pennies, REITs, gold, coins and term deposits belong to no bucket.
- `value` is the sum of `holdingValue`. `yield` is the quote's yield for what a new order buys (`listing(g).fund`, `.bond`, `.savings`).
- `buyBlock` is that quote's `blocked`. `sellBlock` is null for an empty bucket, otherwise `holdingMarketBlock` of its largest holding.
- `cash` is `g.character.money`. `minOrder` is `minTrade(g)`.
- `idle` is `tradeBlock(g) ?? investingBlocked(g.character.countryId, g.year)`.
- `managedBook` is pure: it calls `listing` and reads holdings, writes nothing and never touches `g.rng`.
- `managedOrder('buy')`:
  - returns `{ moved: 0, reason }` when the book is idle, the bucket's `buyBlock` is set, or `floor(dollars)` is under `minOrder`;
  - caps the order at the cash on hand;
  - calls `buySecurity(g, quote.secId, amount, true)`;
  - `moved` is the cash drop.
- `managedOrder('sell')`:
  - works through the bucket's holdings largest first with `sellHolding(g, a.id, take, true)`;
  - `moved` is the fall in their marked value;
  - stops when what is left is under `minOrder`;
  - never touches a term deposit.

- [ ] **Step 1: Write the kit** `test/advisors-kit.ts` with `client`, `own` and `officeJob`.
- [ ] **Step 2: Write the failing tests** in `test/advisors-engine.test.ts`.
  - `'quiet orders queue nothing and log nothing'`:
    - On two structured clones, `buySecurity(g, fundId, 100_000)` loud and `buySecurity(g2, fundId, 100_000, true)` quiet. `money` and the holding's `units` and `value` are equal.
    - `g.queue.length > 0` for the loud game; `g2.queue.length === 0` and `g2.log` has the same lines as before.
    - The same for `sellHolding` of 50,000.
  - `'a refused quiet order says nothing'`: `buySecurity(g, 'nope', 1000, true)` is false and the queue is empty.
  - `'the book counts the three buckets and leaves the rest out'`: `own` an index fund 200k, a bond 100k, savings 50k, a term deposit 30k and a stock 40k. `stocks.value`, `bonds.value`, `savings.value` equal the matching holdings' `value` sums, and nothing counts the term deposit or the stock.
  - `'idle reasons'`: age 17 gives the engine's under-18 text; `g.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 }` (as `test/investments.test.ts:96` does) gives the prison text; a country and year where `investingBlocked` is non-null (loop `['cn','cu','ru','ir']` over years 1950 to 1990 for the first hit, and assert one exists) gives that text.
  - `'a shut exchange blocks only the fund'`: `client(5, { countryId: 'jp', year: 1946 })`: `stocks.buyBlock` matches `/closed/`, `bonds.buyBlock` and `savings.buyBlock` are null, `idle` is null.
  - `'before index funds the bucket is the investment trust'`: a US client in 1960 has a non-null fund quote with `stocks.buyBlock === null`, and `managedOrder(g, 'stocks', 'buy', 50_000)` makes a holding of type `index`.
  - `'managedOrder buys each bucket and reports what moved'`:
    - Fund: `moved` equals the cash drop and the new holding is `index`.
    - Bond: the holding's `secId` is `bond:us:2026`.
    - Savings: `details.product` is `'savings'`.
    - An order under `minOrder` gives `moved 0`.
    - An order over the cash buys no more than the cash.
  - `'managedOrder sells across holdings and never a term deposit'`: a bond bought in 2025 and another in 2026 (move the clock between buys); selling 1.5 times one holding touches both and `moved` is within 1% of the ask; a term deposit's value is unchanged after a savings sale.
  - `'a sale in a shut market is refused with a reason'`: Japan 1946, an old index holding, `managedOrder(g, 'stocks', 'sell', 10_000)` gives `moved 0` and a reason.
  - `'the book and the orders never touch g.rng, and the book is pure'`: `deepFreeze` a game, call `managedBook`, JSON unchanged; across the order tests `g.rng` is unchanged.
- [ ] **Step 3: Run** `npx vitest run test/advisors-engine.test.ts`. Expected: FAIL (`managedBook` is not exported).
- [ ] **Step 4: Implement** the flag and the section.
- [ ] **Step 5: Run** `npx vitest run test/advisors-engine.test.ts test/investments.test.ts test/invest-order-notice.test.ts test/invest-safety.test.ts test/invest-self-impact.test.ts test/insider-fairness.test.ts test/talent-investing.test.ts` and `npm run typecheck`. Expected: PASS, clean. The loud default path must be unchanged.
- [ ] **Step 6: Commit** `feat: quiet orders and a managed book in the investments engine`.

### Task 2: The mandate planner

**Files:**
- Create: `src/game/advisors/mandate.ts`
- Test: `test/advisors-mandate.test.ts`

**Interfaces:**
- Consumes: `ManagedBook`, `MandateBucket` from `investments.ts` (types only).
- Produces:

```ts
export const PLAN = { bandBase: 3, bandPerPoint: 0.1, slipPerPoint: 0.00005, blunderMax: 0.12, swing: 25, dust: 0.005 } as const
export interface Mandate { stocks: number; reserve: number; limit: number }       // stocks 0-100 (fives), reserve dollars, limit 10-100
export interface Order { bucket: MandateBucket; side: 'buy' | 'sell'; dollars: number }
export interface Plan { orders: Order[]; pool: number; spare: number; target: number; moved: number; held: number; note: string | null }
export function poolOf(book: ManagedBook, reserve: number): number
export function safeBucket(book: ManagedBook): 'bonds' | 'savings' | null
export function bandOf(skill: number): number        // (3 + (100 - skill) * 0.1) / 100, a share of the pool
export function slipRate(skill: number): number      // (100 - skill) * 0.00005, a share of the money moved
export function blunderOdds(skill: number): number   // 0.12 * (100 - skill) / 100
export function readMandate(v: unknown): Mandate | null
export function defaultMandate(book: ManagedBook, income: number): Mandate
export function planYear(book: ManagedBook, m: Mandate, skill: number, tilt = 0): Plan
```

Rules:
- A skill that is not finite reads as 50, then is clamped to 0 to 100.
- `poolOf` = fund + bonds + savings values + `max(0, floor(cash - reserve))`. Every function is pure, finite and total.
- `safeBucket`: `'bonds'` when its `buyBlock` is null and (savings is blocked or `bonds.yield > savings.yield + 0.005`); `'savings'` when open; else null.
- `readMandate`: null unless a plain object. `stocks` rounds to a multiple of 5 in 0 to 100 (default 60), `limit` rounds to a multiple of 5 in 10 to 100 (default 50), `reserve` is a finite number in 0 to 1e15, rounded (default 0).
- `defaultMandate`: stocks 60, limit 50, reserve `niceRound(max(2 x income, 0.1 x (cash + holdings)))` where `niceRound` keeps two significant digits.

`planYear` is pinned here because the tests do not fix its middle:

```
S, B, V = stocks, bonds, savings values        spare = idle ? 0 : max(0, floor(cash - reserve))
pool = S + B + V + spare                        cap = (limit / 100) * pool
idle book, or pool < minOrder                -> no orders, note = idle text or 'Nothing to run yet.'
t = clamp(m.stocks + tilt, 0, 100) / 100;  t = 0 if the fund is blocked;  t = 1 if no safe bucket;  no open bucket -> no orders
targetS = pool * t;  safeNow = B + V;  targetSafe = pool - targetS
needS = fundOpen ? max(0, targetS - S) : 0;   needSafe = safe ? max(0, targetSafe - safeNow) : 0
1. invest = min(spare, cap, needS + needSafe);  buyS = invest * needS / (needS + needSafe);  buySafe = invest - buyS;  used = invest
2. band = bandOf(skill) * pool
   if safe && S - targetS > band && stocks.sellBlock == null:  x = min(S - targetS, (cap - used) / 2); sell x of the fund, buy x of safe; used += 2x
   else if fundOpen && safeNow - targetSafe > band && the safe side can be sold:  x = min(safeNow - targetSafe, (cap - used) / 2); sell x of safe (savings first, then bonds), buy x of the fund; used += 2x
3. floor every amount; drop an order under max(minOrder, dust * pool); then trim buys so that sum(buys) <= spare + sum(sells)
4. moved = sum of all orders; held = (moved with cap = infinity) - moved; sells first in the list
```

- [ ] **Step 1: Write the failing tests** in `test/advisors-mandate.test.ts`. Build books with a local `book({ S, B, V, cash, ... })` helper that fills the other fields (`yield` bonds 0.04, savings 0.02, `minOrder` 100, nothing blocked).
  - `'invests spare cash in proportion to the deficits'`: all buckets empty, cash 1,000,000, reserve 100,000, stocks 60, limit 100, skill 70: pool 900,000; buy the fund 540,000 and bonds 360,000 (the helper's bond yield beats savings); `moved` 900,000; `held` 0.
  - `'the limit caps buys and sells together'`: the same with limit 30: `moved` at most 270,000, split 162,000 and 108,000 (within 1), `held` 630,000.
  - `'the reserve is never spent'`: cash 50,000, reserve 100,000: no orders and `spare` 0.
  - `'safe money goes to the better payer'`: bonds yield 0.04 against 0.02 gives bonds; 0.021 against 0.02 gives savings; bonds blocked gives savings; both blocked gives null.
  - `'a blocked fund sends everything to safe'` and `'no open safe bucket means all stocks'`.
  - `'drift inside the band is left alone, past it is sold'`: S 700,000, savings 300,000, cash equal to the reserve, stocks 60. Skill 90 (band 4% of the pool = 40,000): sells 100,000 of the fund and buys 100,000 of bonds, `moved` 200,000. Skill 30 (band 10% = 100,000): no orders.
  - `'a bucket that can't be sold is not sold'`: `stocks.sellBlock` set while overweight gives no sell.
  - `'safe sells come from savings first, then bonds'`.
  - `'tilt moves the target and clamps'`: tilt 25 raises `target` to 0.85 from 0.6; tilt 25 on stocks 90 clamps to 1; tilt -25 on 10 clamps to 0.
  - `'dust is dropped'`: an order under `minOrder`, or under half a percent of the pool, is gone, and buys never exceed `spare + sells`.
  - `'properties over many books'`: 300 books from a local seeded generator (not `g.rng`), random values, blocks, limits and skills. Every order is a positive finite integer; `sum(buys) <= spare + sum(sells)`; `moved <= limit x pool + 1`; no bucket is both bought and sold; no sell exceeds its bucket's value; the plan is identical on a second call; the inputs' JSON is unchanged.
  - `'skill tunes the knobs'`: `bandOf(30) > bandOf(90)`, `slipRate(30) > slipRate(90)`, `blunderOdds(100) === 0`, `blunderOdds(0) === 0.12`, and `NaN`, `-5` and `500` give finite results.
  - `'readMandate and defaultMandate'`: junk gives null or the nearest legal value (`stocks: 47` gives 45, `limit: 3` gives 10, `reserve: -9` gives 0, `reserve: NaN` gives 0); the default is 60, 50 and a reserve of at least twice the income.
- [ ] **Step 2: Run** `npx vitest run test/advisors-mandate.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `mandate.ts`.
- [ ] **Step 4: Run** the test and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: the manager's mandate and yearly plan`.

### Task 3: The team record, offers, fees and hiring

**Files:**
- Create: `src/game/advisors/team.ts`
- Modify: `test/advisors-kit.ts` (add `withTeam`)
- Test: `test/advisors-team.test.ts`

**Interfaces:**
- Consumes: `Mandate`, `defaultMandate`, `poolOf` (Task 2); `managedBook` (Task 1); `typicalIncome` (`events/wealth-core.ts:54`); `netWorth`, `inPrison`, `log`, `formatMoney` (`core.ts`); `NAME_POOLS`, `getCountry` (`world.ts`); `nextRandom` (`rng.ts`).
- Produces:

```ts
// advisorRate and managerRate are [base, spread]: rate = base + spread x skill / 100
export const TERMS = { offers: 3, crookedShare: 0.12, crookClaim: [12, 25], advisorGate: 25, managerGate: 10, floor: 0.1,
  advisorRate: [0.0015, 0.0025], managerRate: [0.004, 0.010], skimPerLimit: 0.03, baseCatch: 0.04, advisorCatch: 0.5, clawback: 0.3 } as const
export type Role = 'advisor' | 'manager'
export interface Hire { name: string; skill: number; since: number }
export interface ManagerHire extends Hire { claimed: number; honest: boolean; rate: number; skimmed: number }
export interface Statement { year: number; pool: number; billed: number; moved: number; costs: number; stocks: number }
export interface Team { owner: string; advisorEpoch?: number; managerEpoch?: number; done?: number
  advisor?: Hire; manager?: ManagerHire; mandate?: Mandate; last?: Statement }
export function readTeam(g: GameState): Team | null
export function teamOf(g: GameState): Team            // the stored record or an empty one for this character; a copy, never stored
export function writeTeam(g: GameState, t: Team): void
export function ratingLabel(skill: number): 'Junior' | 'Experienced' | 'Senior' | 'Top-tier'   // <45, <65, <82, else
export interface Offer { role: Role; slot: 0 | 1 | 2; name: string; skill: number; claimed: number; honest: boolean }
export function offersFor(g: GameState, role: Role): Offer[]
export function advisorFee(g: GameState, skill: number): number
export function managerRate(claimed: number): number
export function managerFee(g: GameState, rate: number, pool: number): number
export function hireBlock(g: GameState, role: Role): string | null
export interface Vetting { skill: number; flagged: boolean }
export function vet(g: GameState, offer: Offer): Vetting | null
export function hire(g: GameState, role: Role, slot: number): boolean
export function release(g: GameState, role: Role): void
```

Rules, pinned because the tests do not fix every number:
- **Record.** `owner` = `${c.id}:${g.year - c.age}`. `readTeam` returns null unless `g.flags['fin.team']` is a plain object whose `owner` matches. It returns a fresh normalized copy: names are strings of 1 to 40 characters (control characters removed), `skill` and `claimed` 20 to 99, `since` and `year` integers 1800 to 2300, `rate` 0.002 to 0.03, `skimmed` and `billed` and `moved` and `costs` and `pool` finite and 0 to 1e15, `stocks` an integer 0 to 100, `honest` true unless exactly `false`, epochs and `done` integers 0 to 1e6. A manager without a valid mandate gets `defaultMandate(managedBook(g), typicalIncome(g))`. A `last` with any bad number is dropped. Unknown keys are dropped. It never throws and never mutates its input. `writeTeam` stores `readTeam`-shaped data, and removes the key when there is no advisor and no manager and the epochs are 0.
- **Offers.** Key `${g.lifeId}|fin|${role}|${g.year}|${epoch}|${slot}`, where `epoch` is that role's epoch (0 when absent). From a stream of that key: `skill = clamp(round(30 + 62 x (u1 + u2) / 2), 30, 92)`; a manager is crooked when `u3 < 0.12`; `claimed` equals `skill` for an honest manager or an advisor, else `min(97, skill + round(12 + 13 x u4))`. Names come from `NAME_POOLS[getCountry(countryId).names]` (first from the male or female list by `u5`, last from the surnames), `first last`, distinct across the three slots. An advisor is never crooked.
- **Fees.** `advisorFee = max(round(0.1 x T), round(max(0, netWorth) x (0.0015 + 0.0025 x skill / 100)))` where `T = typicalIncome(g)`. `managerRate(claimed) = round((0.004 + 0.010 x claimed / 100) x 10000) / 10000`. `managerFee = max(round(0.1 x T), round(pool x rate))`.
- **Gates (`hireBlock`)**, first reason that applies:
  - dead: `"You're no longer alive."`
  - under 18: `'You must be 18 or older.'`
  - prison: `"Your money team can't work while you're in prison."`
  - already hired: `'You already have an advisor.'` or `'You already have a manager.'`
  - advisor and `netWorth < 25 x T`: `` `Advisors take clients worth at least ${formatMoney(25 * T)}.` ``
  - manager and the book is idle: the idle text
  - manager and `pool < 10 x T`, with the pool computed at the default reserve: `` `Managers take accounts of at least ${formatMoney(10 * T)}. Yours is ${formatMoney(pool)}.` ``
- **Vetting.** Null without an advisor. Otherwise a stable roll from `${g.lifeId}|fin|vet|${offerKey}|${advisor.name}` below `advisor.skill / 100` gives `{ skill: offer.skill, flagged: !offer.honest }`; otherwise null. Same answer on every call.
- **`hire`.** Rebuilds `offersFor(g, role)[slot]` (never trusts a caller's data), rechecks `hireBlock`, writes the record (a manager also gets the default mandate if none), moves no money, logs `` `I hired ${name} as my financial ${role}.` ``, returns true. A bad slot or a block returns false and changes nothing.
- **`release`.** Removes the hire, bumps that role's epoch, and for a manager also removes `mandate` and `last`. Logs `` `I let ${name} go.` ``. No cost.

- [ ] **Step 1: Extend the kit** with `withTeam(g, over: Partial<Team>): void`, which writes a valid stamped record through `writeTeam`.
- [ ] **Step 2: Write the failing tests** in `test/advisors-team.test.ts`.
  - `'reads nothing from nothing, and from other people's records'`: no key gives null; a record for another character id gives null; the same record for an heir (`c.id` changed) gives null.
  - `'round trips through JSON'`: `withTeam`, `JSON.parse(JSON.stringify(g))`, `readTeam` equals what was written.
  - `'hostile fields read as the nearest legal value'`: for each field a junk value (`'x'`, `null`, `-1`, `1e300`, `NaN` inline as a number, an array, a nested object) gives a legal result or drops the part; a 100-character name is cut to 40; unknown keys are gone; `honest: 'no'` reads true; the input object is unchanged (`structuredClone` compare).
  - `'offers: three per role, stable, different next year and after a release'`: names non-empty and at most 40 characters, distinct, skill 30 to 92; two calls and a JSON clone give the same list; `g.year + 1` gives a different list; after `release` the list differs.
  - `'about one manager offer in eight is crooked'`: over 600 lives (`lifeId` varied, slot 0 to 2) the crooked share is between 0.08 and 0.16; a crook's `claimed - skill` is 12 to 25; an honest one's `claimed === skill`; no advisor offer is crooked.
  - `'fees follow wealth and have a floor'`: `advisorFee` and `managerFee` rise with skill, rate and wealth; a tiny net worth pays `round(0.1 x T)`; a trillion pays 0.15% to 0.4% of it; `managerRate(40) < managerRate(90)`, both in 0.4% to 1.4%.
  - `'gates'`: each reason above, with the exact copy; a net worth of 25 x T and a pool of 10 x T pass.
  - `'vetting is stable, honest and partial'`: null without an advisor; with a skill-99 advisor nearly every offer (at least 95% over 300 lives) is vetted and `flagged` equals `!honest`; with a skill-20 advisor under 40% are; two calls agree; an honest offer is never flagged.
  - `'hire writes the record and moves no money'`: money unchanged, a manager has a default mandate, the log line is there; a second hire of the same role is false; a gate failure is false and writes nothing; slot 7 is false.
  - `'release removes, bumps the epoch and changes the offers'`.
  - `'reads and offers are pure'`: `deepFreeze` a game with a record, call `readTeam`, `offersFor`, `vet`, `hireBlock`, `advisorFee`; JSON and `g.rng` unchanged.
- [ ] **Step 3: Run** `npx vitest run test/advisors-team.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** `team.ts`.
- [ ] **Step 5: Run** `npx vitest run test/advisors-team.test.ts test/advisors-mandate.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: the money team record, offers, fees and hiring`.

### Task 4: The advisor's findings

**Files:**
- Create: `src/game/advisors/review.ts`
- Modify: `test/advisors-kit.ts` (add `madeUpStock`, `coinHolding`)
- Test: `test/advisors-review.test.ts`

**Interfaces:**
- Consumes: `officeView` (`nation/office.ts:142`); `stockTargets`, `coinTargets` (`computer/money-stocks.ts`); `investmentHoldings`, `freshShare`, `liveDepositRate` (`investments.ts`); `economyOf` (`economy`); `typicalIncome`; `netWorth`, `formatMoney` (`core.ts`); `businessAssets`, `readBiz` (`business/state.ts`); `payoutCash`, `runningCosts` (`business/board-vote.ts`); `groupIdOf` (`business/conglomerate-state.ts`).
- Produces:

```ts
export interface Finding { id: 'insider' | 'loan' | 'concentration' | 'company-cash' | 'idle-cash' | 'losses'; weight: number; text: string }
export function findings(g: GameState, managed: boolean): Finding[]       // pure, sorted by weight desc then id
export function shownCount(skill: number): number                          // clamp(1 + floor(skill / 20), 2, 5)
export function shownFindings(g: GameState, skill: number, managed: boolean): { shown: Finding[]; total: number }
```

Each finding, with `T = typicalIncome(g)`, `nw = netWorth(g)`, and money through `formatMoney`:
- **`insider` (95).** `office = officeView(g)` with `rank >= 1`. A held `stock` whose `details.secId` is in `stockTargets(g)` (made-up companies of the local exchange), or, at `rank >= 2`, a held `crypto` whose `secId` is in `coinTargets(g)`, with `freshShare(a, g.year) > 0`. Text: `` `As ${title} you can move ${names}, and you bought ${it|them} in the last two years. That counts as insider timing.` `` with `names` as one name, "A and B", or "A and 2 others" (largest value first). Never for index funds, pennies, real companies or old holdings.
- **`loan` (70).** The loan with the highest `rate` where `rate - liveDepositRate(g, countryId, 'savings') >= 0.03`, `balance >= 2 x T` and `money >= balance`. Text: `` `Your ${kind} loan costs ${pct(rate)} a year on ${money(balance)}. Your bank account holds ${money(cash)}.` ``
- **`concentration` (round(60 + 40 x share)).** Over assets of kind `business` (by id) and `investment` (grouped by `details.secId`; swap for `companyKey` when share classes land): the biggest group by summed `value`, when `nw > 0`, `share = value / nw >= 0.4` and `value >= 5 x T`. Text: `` `${name} is ${pct(share, 0)} of your net worth.` ``
- **`company-cash` (50).** For each business asset that is not in a group, with `b.share >= 0.05`: `idle = payoutCash(a, b) - round(1.5 x runningCosts(b))`; the largest `idle >= 2 x T`. Text: `` `${name} holds ${money(idle)} past 18 months of costs. Your ${pct(share, 0)} is ${money(idle * share)} before tax. Pay a Dividend is under Money.` ``
- **`idle-cash` (40).** Not `managed`, and `money >= max(10 x T, 0.1 x max(0, nw))`. Text: `` `${money(cash)} sits in your bank account. Savings pay ${pct(sr)} and prices rise ${pct(infl)} a year.` `` with `sr` from `liveDepositRate(..., 'savings')` and `infl` from `economyOf(g).inflation`.
- **`losses` (30).** `g.flags.investLossCarry >= T`. Text: `` `You carry ${money(carry)} of investment losses. Gains up to that size owe no tax.` ``

- [ ] **Step 1: Extend the kit** with `madeUpStock(g): { secId: string; name: string }` (the first `stockTargets(g)` entry that is not `real`, as `holdable` does at `test/insider-fairness.test.ts:~50`) and `coinHolding(g, dollars): Asset` (buys the first non-stable coin).
- [ ] **Step 2: Write the failing tests** in `test/advisors-review.test.ts`.
  - `'insider: an office holder with a fresh made-up pick'`: a mayor holding a made-up stock bought this year: the finding exists, weight 95, text names the company and the mayor's title. Bought two years ago (clock moved between buy and read): absent. A real company (a `listedTargets` entry with `real`): absent. An index fund: absent. No office: absent. A `school` office (rank 0): absent.
  - `'insider: coins need rank 2'`: a mayor with a fresh coin: absent; a governor: present. A pre-2009 clock: no coin to hold, absent.
  - `'insider: three picks read "A and 2 others"'`.
  - `'loan'`: present at 8% with enough cash and a 2% savings rate; absent at 4%, absent when cash is under the balance, absent under `2 x T`; the highest rate wins.
  - `'concentration'`: a company at 50% of net worth is present with weight 80; at 39% absent; a house does not count; two lines of one `secId` add up; leveraged values never give a share above 1 in the text.
  - `'company-cash'`: a company with cash far past 18 months of costs, and a stake of 60%, is present; a group member is not; a stake under 5% is not; the largest idle company wins.
  - `'idle-cash'`: present with cash at 10 x T and a tenth of net worth; absent when `managed` is true; absent below the floor.
  - `'losses'`: present at `investLossCarry = T`; absent below.
  - `'order and coverage'`: with every finding present, the order is 95, 70, concentration, 50, 40, 30; `shownCount` is 2 at skill 20 and 30, 3 at 40, 4 at 60, 5 at 80 and 99; `shownFindings(...).total` is the full count and `shown.length` is `min(total, n)`.
  - `'text is short, plain and pure'`: every text is at most 140 characters even with a 36-character company name; none has an em-dash; `deepFreeze` the game, call `findings`, JSON and `g.rng` unchanged.
- [ ] **Step 3: Run** `npx vitest run test/advisors-review.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** `review.ts`.
- [ ] **Step 5: Run** `npx vitest run test/advisors-review.test.ts test/insider-fairness.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: the advisor's findings, including insider timing`.

### Task 5: The yearly step

**Files:**
- Create: `src/game/advisors/year.ts`
- Modify: `src/game/aging.ts`: import `yearlyAdvisors` and add `['advisors', yearlyAdvisors]` to `YEARLY_HOOKS` between `['underworld', yearlyUnderworld]` and `['milestones', yearlyMilestones]` (lines 78-79).
- Test: `test/advisors-year.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `spend`, `addMoney`, `log`, `notice`, `inPrison`, `formatMoney` (`core.ts`); `chance` (`rng.ts`).
- Produces:

```ts
export function yearlyAdvisors(g: GameState): void
export function crookedSkim(pool: number, limit: number): number     // round(0.03 x (limit / 100) x pool), 0 for bad input
export function catchOdds(advisorSkill: number | null): number       // clamp(0.04 + 0.5 x skill / 100, 0, 0.9); 0.04 without an advisor
```

The step, in this order. Every `spend` failure ends that hire; nothing else is touched.
1. `team = readTeam(g)`. Return when it is null, has neither hire, or `team.done === g.year`. Return when the player is dead, under 18 or in prison. Set `team.done = g.year`.
2. **Advisor.** `fee = advisorFee(g, advisor.skill)`. If `spend(g, fee)` works, add it to the year's fees. Otherwise remove the advisor, bump `advisorEpoch`, and log `` `${name} left over an unpaid bill.` ``
3. **Manager**, unless `managedBook(g).idle` is set (then skip this step with no fee).
   - Read `book = managedBook(g)` after the advisor's fee. `mandate = team.mandate`, `pool0 = poolOf(book, mandate.reserve)`, `fee = managerFee(g, rate, pool0)`, `skim = honest ? 0 : min(crookedSkim(pool0, mandate.limit), max(0, money - fee))`, `bill = fee + skim`.
   - If `!spend(g, bill)`: remove the manager, mandate and statement, bump `managerEpoch`, log `` `${name} left over an unpaid bill.` ``. Stop here for the manager.
   - Otherwise `manager.skimmed += skim`, fees += bill.
   - `blunder = chance(g, blunderOdds(skill))`; `tilt = blunder ? (chance(g, 0.5) ? 25 : -25) : 0`.
   - `plan = planYear(managedBook(g), mandate, skill, tilt)`. Run sells first, then buys. A buy is capped at `floor(g.character.money - mandate.reserve)` and skipped under `minOrder`. Add each `fill.moved` to `moved`.
   - `costs = min(g.character.money, round(moved x slipRate(skill)))`, taken with `addMoney`.
   - `stocks` = the fund's percentage of the three buckets after the trades. `team.last = { year, pool: pool0, billed: bill, moved, costs, stocks }`.
   - **Catch**, only when `!honest` and `skimmed > 0`: `chance(g, catchOdds(advisor?.skill ?? null))`. Caught: `refund = round(0.3 x skimmed)` through `addMoney`, popup `Missing Money`, remove the manager, mandate and statement, bump `managerEpoch`.
4. **Review.** With the advisor still hired, `shownFindings(g, advisor.skill, !!team.manager)`.
5. `writeTeam`. If there is a line to say, one popup `Year-End Statement` (emoji 💼) and, when fees were paid, one log line.

Copy (final):
- Statement lines, in order, joined by a space:
  - `` `${advisor.name} charged ${money(fee)}.` ``
  - the first two findings' texts
  - `'More are in Money Team.'` when more than two were shown
  - `` `${manager.name} billed ${money(billed)} on ${money(pool)}. They moved ${money(moved)}. ${stocks}% is in stocks.` ``
  - on a blunder `` `${first} mixed up your target and aimed ${25} points ${tilt > 0 ? 'high' : 'low'}.` `` where `first` is the first word of the name
- Log line: `` `I paid ${money(fees)} to my money team.` ``
- Missing Money: `` `${advisor ? 'Your advisor' : 'Your bank'} found padded bills from ${name}. ${money(skimmed)} went missing over ${n} ${n === 1 ? 'year' : 'years'}. You got back ${money(refund)} and let ${name} go.` `` with log `` `I caught ${name} padding the bills.` ``

- [ ] **Step 1: Write the failing tests** in `test/advisors-year.test.ts`, using the kit. A `hired(g, over)` helper uses `withTeam` and `own`.
  - `'does nothing and draws nothing without a record'`: JSON and `g.rng` unchanged; and `ageUp` on two clones, one with the hook list spliced as `test/korean-cash.test.ts` does, give equal JSON for a rich player with investments.
  - `'skips the dead, minors, prisoners and a year already done'`: each leaves the game as it was; a second call in the same year changes nothing (`done`).
  - `'an advisor charges the retainer and reports the top two'`: money drops by `advisorFee`; one `Year-End Statement` in the queue whose text has the fee and the first two findings and `More are in Money Team.` when the advisor shows three or more; one log line.
  - `'an advisor who can't be paid leaves'`: money 0 with assets worth plenty: the advisor is gone, the epoch is 1, the log says so, no popup.
  - `'a manager deploys spare cash and keeps the reserve'`: cash 2,000,000, reserve 500,000, stocks 60, limit 100, skill 80: after the step `money >= 500,000 - round(moved x slipRate)`, holdings are only `index` and `savings` or `bond`, `last.stocks` is within 2 points of 60, and `last.moved > 0`.
  - `'deploying cash costs the bill, the slippage and the broker fee, nothing else'`: an honest manager and no sells; net worth before minus after is at least `billed + costs` and at most `billed + costs + 1% of moved`.
  - `'trades are silent: one popup'`: the queue holds exactly one popup, `Year-End Statement`, and no `Order Filled`.
  - `'the manager never touches picks, coins or companies'` (Review Focus 1): the player holds a made-up stock, a coin and a REIT; five calls of `yearlyAdvisors` with the clock moved a year each time (no market moves) leave their units and ids unchanged and add no holding of type `stock`, `penny`, `crypto`, `reit` or `gold`.
  - `'the invoice comes first and an unpaid bill ends the hire'`: money 0 and no spare: the manager is gone, no trades, the epoch is 1.
  - `'a blunder aims off target, says so, and next year corrects it'`: search seeds 1 to 400 with a skill-25 manager until `last` shows a blunder (the popup has "points"); the fund share is further from 60 than a no-blunder run of the same book; with the same game one year later and a seed without a blunder, the share is closer to 60 again.
  - `'a weak manager costs more than a strong one'`: the same seed and book (pick a seed with no blunder for both), skill 35 against 90: `costs` is higher for the weak, and a book drifted 8 points past target is rebalanced by the strong and left alone by the weak.
  - `'a crook pads the bill, bounded by the limit and the cash'`: `honest: false`; `billed - managerFee` equals `crookedSkim(pool, limit)`; limit 10 pads a tenth of limit 100; `skimmed` grows each year; with cash only a little over the agreed fee the padding is cut to what is left and the manager is not let go.
  - `'a catch pays back 30% once and lets them go'`: search seeds until the catch fires with a skill-90 advisor (about 49% a year); the `Missing Money` popup names `round(0.3 x skimmed)` (with this year's padding included), the manager, mandate and statement are gone, `managerEpoch` is 1, there is one such popup and one `I caught` log line, and a second call in the same year adds no second. `catchOdds(null) === 0.04` and `catchOdds(90) === 0.49`; over 400 seeds the catch rate with the advisor is higher than without.
  - `'no draws without a manager'`: an advisor-only record leaves `g.rng` unchanged.
  - `'banned investing idles the manager, a shut exchange does not'`: a country and year with `investingBlocked`: no fee, no trades, the advisor still bills. Japan 1946: everything bought goes to bonds or savings.
  - `'an heir ignores the record'`: change `c.id`: nothing happens.
  - `'the statement round trips'`: `JSON.parse(JSON.stringify(g))` still reads `last`.
- [ ] **Step 2: Run** `npx vitest run test/advisors-year.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `year.ts` and the two lines in `aging.ts`.
- [ ] **Step 4: Run** `npx vitest run test/advisors-year.test.ts test/korean-cash.test.ts test/finance.test.ts test/investments.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the money team's year-end step`.

### Task 6: The Money Team menu

**Files:**
- Create: `src/game/advisors/menu.ts`
- Modify: `src/game/menus.ts`: import `moneyTeamMenu` and add it after `investmentsMenu` in the list inserted before `housingHeading` (lines 54-60).
- Test: `test/advisors-menu.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 5; `MenuGroup`, `MenuAction`, `MenuNode` (`types.ts`); `shortMoney`, `formatMoney` (`core.ts`).
- Produces: `export const moneyTeamMenu: MenuGroup`.

The menu: id `money-team`, label `Money Team`, emoji 💼. `visible`: alive, age 18 or more, not in prison. Subtitle: `'Hire an advisor or a manager'`, otherwise `Advisor: <name>` and `Manager: <name>` joined by ` · `. Header: `'An advisor reviews your money. A manager keeps your mix. Neither picks winners.'`

Nodes, ids and copy (final). `money` is `formatMoney`, `pct` rounds as written. Every action re-reads state, rebuilds its offer through `hire`, and uses `stayOpen: true`.
- Heading `team-h-advisor`: `Financial Advisor`.
  - Hired:
    - info `team-advisor`: `` `${name}, ${rating}. About ${money(fee)} a year.` ``
    - info `team-sees`: `` `Sees ${shown} of ${total} issues.` ``, or `'Nothing to flag right now.'` when total is 0
    - one info per shown finding, id `team-f-${id}`, emoji 💼, the finding's text
    - action `team-fire-advisor`: `Let Go`, emoji 🚪, confirm `` `Let ${name} go? You owe nothing.` ``
  - Not hired and blocked: info `team-advisor-block` with `hireBlock`'s text.
  - Not hired and open: group `team-meet-advisor`, `Meet Advisors`, emoji 🤝, subtitle `'Three want your account'`. Its three actions `team-hire-advisor-<slot>`: label `` `Hire ${name}` ``, emoji 💼, subtitle `` `${rating} · about ${money(fee)} a year` ``, confirm `` `Hire ${name} for about ${money(fee)} a year? The fee comes out at year-end.` ``
- Heading `team-h-manager`: `Financial Manager`. Info `team-rules` first, always: `'Runs your stock funds, plus safe money in bonds or savings. Never your own picks or companies.'`
  - Hired:
    - info `team-manager`: `` `${name}, ${rating}. Agreed fee ${pct(rate)} a year of the money they run.` ``
    - info `team-last`: `` `Last year: billed ${money(billed)} on ${money(pool)} (${pct(billed / pool)}). Moved ${money(moved)}. ${stocks}% in stocks.` ``, or `'No statement yet. The first comes at year-end.'`
    - slider `team-stocks`: `Stocks Share`, emoji 📈, subtitle `` `${n}% stocks, the rest in bonds or savings` ``, input slider 0 to 100 step 5 unit `%`, label `'Share in stocks'`, default the current value, preview `` `${v}% stocks. About ${shortMoney(moved)} moves this year.${held > 0 ? ` The limit holds back ${shortMoney(held)}.` : ''}` `` from `planYear`
    - slider `team-reserve`: `Cash to Keep`, emoji 🏦, subtitle `` `${money(reserve)} stays in the bank` ``, a money slider (`money: true`) from 0 to `max(reserve, cash)`, label `'How much stays in the bank?'`, preview `` `${shortMoney(reserve)} stays. ${shortMoney(spare)} is free to invest.` ``
    - slider `team-limit`: `Yearly Limit`, emoji 🚦, subtitle `` `${n}% of the pool may move a year` ``, 10 to 100 step 5 unit `%`, label `'Most they may move in a year'`, preview `` `Up to ${shortMoney(limit x pool)} changes hands. A wider limit also gives a crook more room.` ``
    - action `team-fire-manager`: `Let Go`, confirm `` `Let ${name} go? Your holdings stay as they are.` ``
  - Not hired and blocked: info `team-manager-block`.
  - Not hired and open: group `team-meet-manager`, `Meet Managers`, subtitle `'Three want your account'`. Per slot, an action `team-hire-manager-<slot>`: label `` `Hire ${name}` ``, subtitle `` `${ratingLabel(claimed)} · ${pct(rate)} a year` ``, confirm `` `Hire ${name}? They run your stock funds and safe money for ${pct(rate)} a year, at least ${money(floor)}.` ``. With an advisor, an info `team-vet-<slot>` follows it: `` `Your advisor checked ${name} and rates them ${rating}. ${flagged ? 'Red flag: padded bills at a past firm.' : 'No red flags.'}` `` or, when `vet` is null, `` `Your advisor couldn't check ${name}.` ``
- A slider's `run` parses its string, clamps it to the slider's range and step, ignores NaN, writes the mandate through `writeTeam`, and returns. No node sets `hint` (purple is for talents).

- [ ] **Step 1: Write the failing tests** in `test/advisors-menu.test.ts`.
  - `'sits right after Investments in Business & Investments'`: `assetsMenu.children(g)` ids show `money-team` directly after `investments`.
  - `'is hidden for minors, the dead and prisoners'`.
  - `'renders from a frozen state without touching it'` (rule 8): advisor and manager hired, a vetted and an unvetted offer on another game; walk every node: children, subtitle, header, `disabledReason`, `confirm`, each `input.preview` at min and max; no throw, JSON and `g.rng` unchanged.
  - `'the advisor block'`: a poor player sees `team-advisor-block` with the gate text and no offers; a rich one sees three `team-hire-advisor-*` actions; `run` on slot 1 hires that offer's person, and the rebuilt list shows `team-advisor`, `team-sees` and findings; `team-fire-advisor` removes them.
  - `'offers show a rating, not a number'`: no subtitle or label has a bare skill number; a crook's offer shows its inflated rating.
  - `'vet rows'`: with an advisor, each manager offer has a `team-vet-*` row, one of the three texts; without one there are none.
  - `'sliders write the mandate'`: `team-stocks` with `'40'` gives 40; `'1000'` clamps to 100; `'47'` snaps to 45; `'abc'` and `''` change nothing; `team-limit` and `team-reserve` likewise (reserve above the cash clamps to the slider's max).
  - `'bounds and previews are finite'`: for every slider at min, middle and max, `min <= max`, previews contain no `NaN`, `undefined` or `Infinity`.
  - `'shows the last statement'`: after `yearlyAdvisors`, `team-last` holds the billed amount and `%`.
  - `'no purple'`: no node in the menu defines `hint`.
  - `'the text is plain'`: every subtitle, confirm and info is at most 140 characters (subtitles 120) and none has an em-dash.
- [ ] **Step 2: Run** `npx vitest run test/advisors-menu.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `menu.ts` and the `menus.ts` line.
- [ ] **Step 4: Run** `npx vitest run test/advisors-menu.test.ts test/assets.test.ts test/anachronism.test.ts test/voice-guards.test.ts test/fuzz-regressions.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Money Team menu for hiring an advisor and a manager`.

### Task 7: Story test, docs and release notes

**Files:**
- Create: `test/advisors-story.test.ts`
- Modify: `docs/ARCHITECTURE.md`:
  - the entry in Layout that starts `investments.ts invest/*.ts`: add `managedBook`, `managedOrder` and the `quiet` flag, and that `advisors/` imports it
  - a new Layout entry for `advisors/*.ts`
  - a new section "Money team (advisors/*.ts)" after "Being rich, felt"
- Modify: `docs/RELEASE-v2.8.0.md`. Append a section; create the file if no earlier feature has. Do not overwrite another feature's text.

**Interfaces:** consumes everything above, `officeHooks` (`nation/office.ts`), `yearlyInvestments` and `yearlyFinance`.

- [ ] **Step 1: Write the story test**, `it('a mayor hires a team, ages five years and is never an insider suspect through it')`.
  1. A US `client` with 20,000,000 and `officeJob(g, 'mayor')`. A manager is blocked until there is a book: `own` an index fund 3,000,000 and savings 1,000,000.
  2. Hire the first advisor offer (`hire(g, 'advisor', 0)`). Pick the first honest manager offer and check `vet` does not flag it, then `hire`.
  3. Five times: `g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []`, then `yearlyInvestments(g); yearlyFinance(g); yearlyAdvisors(g)`. Each year leaves a `last` statement, a `Year-End Statement` popup and `money >= reserve - 1% of moved`.
  4. The holdings are index, bond and savings only.
  5. Insider, the manager's side: for each of the keys `industry`, `ecommerce`, `finance` and `technology`, both bullish and bearish, `officeHooks().policyMove(g, key, bullish, 'Test law')` opens no case and `officeHooks().policyWarning(...)` is `''`. Read cases as `test/insider-fairness.test.ts:85-91` does.
  6. Insider, the contrast: on a second game built the same way, with no manager but a made-up stock bought by hand (`madeUpStock`) this year, `shownFindings(g, 40, false).shown[0].id` is `insider` and `policyMove` for that stock's sector opens exactly one case, on that stock.
  7. Back on the first game, `release(g, 'manager')` bumps the epoch and `offersFor` returns new names. A JSON round trip keeps the record. An heir (`c.id` changed) sees `readTeam` null.
- [ ] **Step 2: Run** `npx vitest run test/advisors-story.test.ts`. Expected: PASS on the first run, since it only drives code from Tasks 1 to 6. If it fails, fix the owning task's code, not the test.
- [ ] **Step 3: Docs.**
  - **`ARCHITECTURE.md` section "Money team"**, covering:
    - the record and its stamp (`readTeam` is the whitelist);
    - the three buckets and why nothing else (D5, D6), with the `insiderPositions` argument;
    - the quiet flag and `managedBook`/`managedOrder` (D15);
    - the yearly hook and its order (D14);
    - skill as execution, the limit as the cap, the crook and the catch (D8 to D10);
    - the advisor never forecasts (D2) and `MenuBase.hint` stays talent-only (D3);
    - the six findings and where `companyKey` will plug in.
  - **Release notes:** a one-paragraph summary, then **Hiring**, **The advisor**, **The manager**, **Trust**, **Old saves**, **Not in this release**. State the figures: gates 25 and 10 times typical income; advisor 0.15% to 0.4% of net worth; manager 0.4% to 1.4% of the money they run; a limit of 10 to 100%; 3 offers a year; about one manager in eight is a crook; the catch chances; 30% back. **Not in this release** repeats spec section 10.
  - VOICE applies, with no em-dashes.
- [ ] **Step 4: Full verification.** `npm run typecheck`, `npm test` (all files), `node scripts/voice-report.mjs` and `npm run build`. Expected: all green, and no more long strings than before.
- [ ] **Step 5: Commit** `docs: the money team; story test and release notes`, then push.

---

## Self-review

**Spec coverage**

| Spec item | Where it's covered |
|---|---|
| D1, D2, D3 | Task 4 (no forecast, plain info rows), Task 6 'no purple' |
| D4 | Task 4 'order and coverage', Task 6 `team-sees` |
| D5 | Task 1 buckets, Task 2 planner |
| D6 | Task 1 `idle` and `buyBlock`, Task 5 'never touches picks', Task 7 steps 5 and 6 |
| D7 | Task 4 `insider` tests |
| D8 | Task 2 knobs, Task 5 blunder and weak against strong |
| D9 | Task 2 limit, Task 5 crook bounded by the limit |
| D10 | Task 3 offers and vetting, Task 5 padding and catch |
| D11, D12 | Task 3 offers, gates, fees; Task 5 unpaid ends the hire |
| D13 | Task 3 record, Task 5 'the statement round trips' |
| D14 | Task 5 hook and order, 'keeps the reserve' |
| D15 | Task 1 |
| D16 | Task 4 `company-cash` |
| Section 5 (data model) | Task 3 hostile-field tests |
| Section 6 (determinism) | purity tests in Tasks 1, 3, 4, 6; 'no draws' tests in Task 5 |
| Section 7 (saves) | Task 3, Task 5 round trip, Task 7 step 7 |
| Section 9 | spread as named in each task |

**Departures from the spec, each stated where it is made**
- The mandate planner is its own module (`mandate.ts`) so the menu preview and the yearly step share one pure function (spec 4.4 names the function but not the file).
- `team.ts` takes `Mandate` and `poolOf` from `mandate.ts`, so Task 3 follows Task 2.
- The popup shows only the top two findings and points to Money Team for the rest (spec 4.3 says "the top two"; this adds the pointer line).

**Type consistency**

These names are spelled the same in every task that uses them: `MandateBucket`, `BucketBook`, `ManagedBook`, `ManagedFill`, `managedBook`, `managedOrder`, `Mandate`, `Order`, `Plan`, `PLAN`, `planYear`, `poolOf`, `safeBucket`, `bandOf`, `slipRate`, `blunderOdds`, `readMandate`, `defaultMandate`, `TERMS`, `Role`, `Hire`, `ManagerHire`, `Statement`, `Team`, `readTeam`, `teamOf`, `writeTeam`, `ratingLabel`, `Offer`, `offersFor`, `advisorFee`, `managerRate`, `managerFee`, `hireBlock`, `Vetting`, `vet`, `hire`, `release`, `Finding`, `findings`, `shownCount`, `shownFindings`, `yearlyAdvisors`, `crookedSkim`, `catchOdds`, `moneyTeamMenu`.

**Proportion**

Most of the plan's length is test assertions and fixed player copy. Code blocks total under 40 lines: one constants block, two interface blocks and the planner's pinned middle.

**Known residual risk**

- **A manager that only deploys cash.** With a mix that already fits, the manager does nothing but bill. That is the job; the menu says "Neither picks winners".
- **Tax on rebalancing.** A sale realizes a gain and is taxed at once, as a hand sale is. The band keeps sales rare; the statement does not itemize tax.
- **Bond issues pile up.** The manager buys the current year's bond each year, so a long-lived mandate holds one bond holding per year. Selling takes the largest first. Cosmetic.
- **Heavy R&D cash.** `company-cash` keeps 18 months of costs and does not subtract a pending breakthrough's cost. A follow-up once that feature ships.
- **Share classes.** `concentration` groups by `details.secId`; two lines of one company would be counted apart until `companyKey` lands.
