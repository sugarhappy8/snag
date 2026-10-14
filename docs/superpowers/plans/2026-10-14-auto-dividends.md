# Automatic Yearly Dividends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On any company the player owns, a standing yearly rule pays a dividend at year end: a percentage of the year's profit, or a percentage of the company's spare cash. It pays from company cash after the company's debts and a cash floor, the player's part is taxed as income, relatives and other shareholders get theirs, and the player sees one life-log line per company and one popup a year.

**Architecture:** One optional record on the company, three small modules, and thin call sites.
- `dividend-policy.ts`: the record, its reader and its bounds. No imports, because `state.ts` imports it.
- `dividend-year.ts`: the floor, the quote (pure), the yearly payment and its reporting.
- `dividend-menu.ts`: Money, Yearly Dividend.
- The money move is the manual dividend's, extracted as `payOut` in `board-menu.ts`, so a manual and an automatic dividend are one code path.
- `yearly.ts` calls the year step once per company. `board-ceo.ts` returns early from its own payout while a rule is set.

**Tech Stack:** TypeScript (strict), Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-auto-dividends-design.md` (D1-D12, sections 4 to 10). This plan covers all of it.

## Global Constraints

**Build and tests**
- Run tests one file at a time while developing: `npx vitest run <file>`. Typecheck with `npm run typecheck`. The full suite (`npm test`, about 20 minutes) runs only in Task 6.
- No `any`, no `@ts-ignore`, no new dependencies.
- A test fixture that would break `tsc` goes in a `.txt` file. Hostile values that are valid `Json` (`7`, `'x'`, `null`) are written inline, and a hostile object is cast `as never`.

**Shared files with the Heavy R&D build**
- `src/game/business/state.ts` and `src/game/business/manage.ts` carry uncommitted Heavy R&D edits while this is written. Make every edit there with the Edit tool on an exact string, never by rewriting the file. Each edit is a separate small hunk away from Heavy R&D's.
- Work in a separate worktree (superpowers:using-git-worktrees) rebased on the Heavy R&D commit, and commit only the files in the task's row. Before committing a shared file, `git diff <file>` must show only your hunks.
- The table below marks shared files with `*`.

**Engineering rules (`docs/ARCHITECTURE.md`)**
- Rule 1: state is plain JSON. Rule 2: no `g.rng`, no `Math.random`, no `Date.now`. Rule 3: actions change `g` in place.
- Rule 8: menus are functions of state and render from a deep-frozen state (`test/fuzz-kit.ts` `deepFreeze`, line 511).
- Rule 9: imports between modules are limited. `dividend-policy.ts` imports nothing. `state.ts` imports only it.
- Rule 11: money is internal constant-2026 dollars, shown through `money`, `formatMoney` or `formatPrice` at render time. The dividend sliders are percentages and months, so none sets `money: true`.
- Rule 13: voice. Every string is in `docs/VOICE.md`'s voice: bare facts, contractions, no morals, no em-dashes, no disclaimers. Life-log lines stay at or under 90 characters of static text, tooltips and previews at or under 120, and each popup block at or under 160.

**Determinism**
- Floors, quotes, reasons, previews, the menu and `readDividend` never read or advance `g.rng`.
- The year step uses no `g.rng`. Its popup id is `div-${g.generation}-${g.year}` and takes no `g.nextId`.
- A game that never set a rule changes nothing: the year step returns at once (Task 3 pins it, and the existing seeded suites must pass unchanged).

**Money rails**
- A payment never exceeds `payoutCash(a, b)` minus the floor. It uses no new route for money: `payOut` is the manual dividend's move, extracted.

**Saves**
- `BizState.dividend` is optional and read through `readDividend` everywhere, never raw: `bizOf` does not re-normalize a current-version record.
- `BIZ_VERSION` stays 2. A save without the field behaves exactly as today.

**Player-facing text**
- The exact copy in this plan is final. If a line must change to pass `npm run voice`, change it in the plan's spirit and keep it shorter.
- Never put model names in code or docs.

**Commits**
- One commit per task, after that task's tests and `npm run typecheck` pass.
- End every commit message with a blank line and the two trailer lines (the co-author line and the session link) that the dispatching prompt gives you.
- Push after Task 6.

**Scope**
- Do not touch tax code, `simulateYear`, `evolve`, valuation, the Stocks buy and sell rules, `equityYearKey`, or the group dividend.
- Do not fix `payoutTurn` paying no relatives. It is noted in the spec as out of scope.

## Review Focus

The inputs most likely to bite a player, most likely first. Each has a pinning test in the task named.

- **A hired CEO on a Cash or Profit mandate.** Expected: one payout, the player's rule. With a rule set, the CEO's own `payoutTurn` pays nothing; without one, it pays as before. Tests: Task 3.
- **A company with debt, investors' preference, unreleased-game money, or a bank's capital.** Expected: nothing leaves past `payoutCash`; a year that pays nothing says why in one log line. Borrowing to pay cannot work. Tests: Task 2, Task 3.
- **A company with a board the player doesn't control.** Expected: the payout never passes the board's reserve, opens no vote, and records none. Tests: Task 2 (floor), Task 3.
- **A listed company.** Expected: the price falls by the payout per share, stake value and cash move by the same amount, and buying shares just before year end to collect a dividend loses money. Tests: Task 2, Task 6.
- **A save from before this change, and hostile data.** Expected: no field means the year step returns at once and changes nothing; a damaged field reads as no rule. Tests: Task 1, Task 3, and the existing seeded business suites unchanged.
- **A division of a group.** Expected: its rule is ignored and its menu hidden. Tests: Task 3, Task 4.

## File ownership and order

`*` marks a file the in-progress Heavy R&D build also edits. Files not starred are not on that list.

| Task | Creates | Modifies | Runs after | Can run alongside |
|---|---|---|---|---|
| 1 The rule and its saving | `src/game/business/dividend-policy.ts`, `test/dividend-policy.test.ts` | `src/game/business/state.ts` * | | |
| 2 What it pays, and paying it | `src/game/business/dividend-year.ts`, `test/dividend-year.test.ts` | `src/game/business/board-menu.ts` | 1 | 5 |
| 3 Year end, popup and log | `test/dividend-wiring.test.ts` | `src/game/business/dividend-year.ts`, `src/game/business/yearly.ts`, `src/game/business/board-ceo.ts` | 2 | 4, 5 |
| 4 The menu | `src/game/business/dividend-menu.ts`, `test/dividend-menu.test.ts` | `src/game/business/manage.ts` * | 2 | 3, 5 |
| 5 The Stocks line | | `src/game/business/own-listing-menu.ts`, `test/own-listing-menu.test.ts` | 1 | 2, 3, 4 |
| 6 Story, docs, notes | `test/dividend-story.test.ts` | `docs/ARCHITECTURE.md`, `docs/BUSINESS-AND-DYNASTIES.md`, `docs/RELEASE-v2.8.0.md` | 3, 4, 5 | |

The files of parallel tasks are disjoint, but every task ends on the whole-project `npm run typecheck`, and Tasks 3 and 4 import what Task 2 produces. So parallel tasks run in separate worktrees, each rebased on the last finished task before it commits. In a single tree, run 1, 2, 3, 4, 5, 6 in that order.

---

### Task 1: The rule and its saving

**Files:**
- Create: `src/game/business/dividend-policy.ts`
- Modify: `src/game/business/state.ts` *. Add the import after `import { readFamilyShares } from './family-share-state'` (line 12). Add the field after `franchise?: Json` in `BizState` (line ~381). Add the spread as the last line inside the object `normalizeBiz` returns, after the `franchise` line (line ~683).
- Test: `test/dividend-policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, in `dividend-policy.ts` (no imports):

```ts
export type DividendMode = 'profit' | 'cash'
export interface DividendLast { year: number; paid: number; mine: number; perShare: number }
export interface DividendPolicy { mode: DividendMode; pct: number; keep: number; last?: DividendLast }
export const DIVIDEND_PCT = { min: 0.05, max: 1, step: 0.05, start: 0.3 } as const
export const DIVIDEND_KEEP = { min: 0, max: 24, start: 3 } as const
export function readDividend(raw: unknown): DividendPolicy | null
export function dividendField(raw: unknown): { dividend?: DividendPolicy }
export function withPolicy(cur: DividendPolicy | null, patch: { mode?: DividendMode; pct?: number; keep?: number }): DividendPolicy
```

`readDividend` rules, in order:
- Not a plain object (`null`, an array, a string, a number): `null`.
- `mode` is not exactly `'profit'` or `'cash'`: `null`.
- `pct`: a finite number becomes `round(clamp(x, 0.05, 1) x 100) / 100`; anything else is `0.3`.
- `keep`: a finite number becomes `round(clamp(x, 0, 24))`; anything else is `3`.
- `last` is kept only when `year` is a finite integer in 1800 to 2300, `paid` is finite in 0 to 1e15, `mine` is finite in 0 to `paid + 1`, and `perShare` is finite in 0 to 1e12. Kept values are rounded (`perShare` to 6 places). Otherwise `last` is left out and the rule stays.
- Unknown keys are dropped. It never throws and never changes its input.

`dividendField(raw)` returns `{ dividend }` when `readDividend(raw)` is a rule, else `{}`. `withPolicy(cur, patch)` starts from `cur` or the defaults (`profit`, 0.3, 3), applies the patch through the same clamps, keeps `last` only from `cur`, and returns a new object.

- [ ] **Step 1: Write the failing tests** in `test/dividend-policy.test.ts`, under `describe('the yearly dividend rule')`.
  - `'keeps a valid rule and rounds it'`: `readDividend({ mode: 'cash', pct: 0.333, keep: 2.6 })` equals `{ mode: 'cash', pct: 0.33, keep: 3 }`.
  - `'reads a damaged rule as no rule'`: `it.each` over `null`, `undefined`, `7`, `'profit'`, `[]`, `{}`, `{ mode: 'weird' }`, `{ mode: 7 }`, `{ pct: 0.5 }`; each gives `null`.
  - `'fills a bad number with its default'`: `{ mode: 'profit', pct: 'x', keep: null }` gives `{ mode: 'profit', pct: 0.3, keep: 3 }`; `NaN` and `Infinity` for `pct` give 0.3 and 1; `NaN` for `keep` gives 3.
  - `'clamps the share and the months'`: `pct` of 7, -1, 0.001 gives 1, 0.05, 0.05; `keep` of 99, -3 gives 24, 0.
  - `'keeps a good last payment and drops a bad one'`: `last: { year: 2026, paid: 1000, mine: 600, perShare: 0.0123456789 }` survives with `perShare` 0.012346. Each of `year: 2026.5`, `year: 1700`, `paid: -1`, `paid: NaN`, `mine: 1002`, `perShare: Infinity`, `last: 'x'` leaves the rule without a `last`.
  - `'drops unknown keys'`: `{ mode: 'cash', pct: 0.5, keep: 3, extra: 1 }` has no `extra`.
  - `'does not change its input'`: `readDividend(deepFreeze({ mode: 'cash', pct: 0.5, keep: 3, last: { year: 2026, paid: 1, mine: 1, perShare: 0 } }))` does not throw.
  - `'withPolicy starts from the defaults and stays in bounds'`: `withPolicy(null, {})` is `{ mode: 'profit', pct: 0.3, keep: 3 }`; `withPolicy(null, { mode: 'cash', pct: 9, keep: -4 })` is `{ mode: 'cash', pct: 1, keep: 0 }`; `withPolicy(rule, { keep: 6 })` keeps the rule's `mode`, `pct` and `last`; `withPolicy(null, { pct: NaN })` has `pct` 0.3.
  - `'the saved company keeps it, and an old one has none'`:
    - `normalizeBiz({ industry: 'restaurant', countryId: 'us', city: 'Chicago', outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }], dividend: { mode: 'profit', pct: 0.4, keep: 6 } }, 2026).dividend` equals `{ mode: 'profit', pct: 0.4, keep: 6 }`.
    - The same record round-tripped through `JSON.parse(JSON.stringify(...))` and `normalizeBiz` again is equal.
    - Without the key, `'dividend' in normalizeBiz(...)` is false.
    - With `dividend` set to `'x'`, `7` and `{ mode: 'nope' }` it is absent.
    - `bizOf(g, { details } as Asset)` on a `v: 1` record that holds a rule keeps it (the pattern in `test/business-save-normalization.test.ts:15-30`).
- [ ] **Step 2: Run** `npx vitest run test/dividend-policy.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `dividend-policy.ts`.
- [ ] **Step 4: Edit `state.ts`.**
  - Import `{ dividendField, type DividendPolicy } from './dividend-policy'`.
  - In `BizState`, after `franchise?: Json`, add `/** Yearly dividend rule (business/dividend-policy.ts). Missing: none set. Read it with readDividend, never raw. */ dividend?: DividendPolicy`.
  - In `normalizeBiz`, as the last property spread: `...dividendField(d.dividend),`.
- [ ] **Step 5: Run** the test, `npx vitest run test/business-save-normalization.test.ts test/business.test.ts`, and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat: yearly dividend rule saved on the company`.

### Task 2: What a rule would pay, and paying it

**Files:**
- Create: `src/game/business/dividend-year.ts`
- Modify: `src/game/business/board-menu.ts`. Extract `payOut` from `payDividend` (lines 109-125); `payDividend` keeps its clamp, vote, log and notice.
- Test: `test/dividend-year.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `readDividend`, `DividendPolicy`
  - from `board-vote.ts`: `payableCash`, `payoutCash`, `runningCosts`, `reserveDollars` (lines 102, 114, 123, 136)
  - from `board-state.ts`: `boardExists`, `boardView` (lines 164, 390)
  - from `conglomerate-state.ts`: `inGroup` (line 279)
  - from `finance.ts`: `gameIncomeTax` (line 144)
  - from `state.ts`: `Statement`, `BizState`
  - `clampN`, `num` (`business/util.ts`)
- Produces, in `board-menu.ts`:
  - `export function payOut(g: GameState, a: Asset, b: BizState, n: number): number`: the money move for a dividend of `n` that has already been checked against `payoutCash` and the board. It does `b.cash -= n`; `mine = Math.round(n * b.share)`; `earnIncome(g, mine)`; `payFamilyBusinessProceeds(g, b, n, true)`; for a listed company `b.sharePrice = round2(max(0.05, price - n / sharesOut))` and `b.valuation = round(price x sharesOut)`, else `b.valuation = valuationOf(b)`; `refreshValue(a, b)`; and returns `mine`. These are the lines `payDividend` runs today. `payDividend` becomes: clamp, `boardAllows`, `const mine = payOut(...)`, then its log line and "Payday" notice, unchanged.
- Produces, in `dividend-year.ts`:

```ts
export interface DividendQuote { basis: number; floor: number; spare: number; pay: number; why: string | null }
export function dividendFloor(g: GameState, a: Asset, b: BizState, keep: number): number
export function dividendQuote(g: GameState, a: Asset, b: BizState, p: DividendPolicy, profit: number): DividendQuote
export interface DividendPaid { assetId: string; name: string; paid: number; mine: number; family: number; rest: number; tax: number; share: number; perShare: number; price: number | null }
export type DividendResult = { kind: 'paid'; paid: DividendPaid } | { kind: 'skipped'; name: string; why: string }
export function autoDividendYear(g: GameState, a: Asset, b: BizState, s: Statement): DividendResult | null
```

The maths:

```
dividendFloor = max( round(clamp(keep, 0, 24) / 12 x runningCosts(b)),  boardExists(g, b) ? reserveDollars(b, boardView(g, a, b)) : 0 )
cash   = payoutCash(a, b)
spare  = max(0, cash - dividendFloor)
basis  = p.mode === 'profit' ? max(0, finite(profit)) : spare
pay    = min(spare, round(clamp(p.pct, 0, 1) x basis));  a pay under 1 is 0
```

`why` is `null` when `pay >= 1`, else the first that fits:
1. `p.mode === 'profit'` and `profit` not above 0: `'It made no profit.'`
2. `b.debt > 0` and `payableCash(a, b) <= 0`: `'Its loans come first.'`
3. `payableCash(a, b) > 0` and `cash <= 0`: `"Investors are paid back first."`
4. `cash > 0` and `spare <= 0`: `'Its cash is at the floor.'`
5. otherwise: `'It has no spare cash.'`

`autoDividendYear` returns `null` when `readDividend(b.dividend)` is null, `inGroup(g, b)`, `b.share <= 1e-4`, or the rule's `last.year >= s.year`. Otherwise it quotes with `profit = s.net`.
- If `q.pay < 1` or `Math.round(q.pay x b.share) < 1`: `{ kind: 'skipped', name: a.name, why: q.why ?? 'It has no spare cash.' }`, and nothing else changes.
- Otherwise: `mine = payOut(g, a, b, q.pay)`; `family = round(pay x min(1, sum of b.familyShares shares))`; `rest = pay - mine - family` (never below 0); `perShare = b.public && b.sharesOut > 0 ? round(pay / sharesOut x 1e6) / 1e6 : 0`; `tax = max(0, gameIncomeTax(g, T) - gameIncomeTax(g, max(0, T - mine)))` with `T = num(g.flags.taxableIncome)` read after `payOut`; `b.dividend = { ...p, last: { year: s.year, paid: pay, mine, perShare } }`; return `{ kind: 'paid', paid: { assetId: a.id, name: a.name, paid: pay, mine, family, rest, tax, share: b.share, perShare, price: b.public ? b.sharePrice : null } }`.
- It does not log, queue a popup or touch `g.rng` or `g.nextId`.

- [ ] **Step 1: Write the failing tests** in `test/dividend-year.test.ts`, using `test/own-listing-kit.ts` (`founder`, `privateCompany`, `listed`).
  - In-file helpers:
    - `stmt(year, net)`: a `Statement` of zeros with `year` and `net` set.
    - `books(b, net)`: sets `b.last = { ...stmt(g.year - 1, net), netRevenue: 12e6, pbt: 0 }`, so `runningCosts(b)` is 12e6 and three months is 3e6.
    - `rich(g)`: `privateCompany(g)` with `b.share = 1`, `b.cash = 10e6`, `b.debt = 0`, `books(b, 4e6)`, then `b.valuation = valuationOf(b); refreshValue(a, b)` so the stored value matches the new cash before anything is measured.
  - `'floor is the larger of your months and the board reserve'`:
    - `rich(g)`: `dividendFloor(g, a, b, 3)` is 3e6, with `keep` 0 it is 0, with 24 it is 24e6, with 99 it is 24e6.
    - With `b.share = 0.6` (a board exists) and `boardOf(b).limits.reserve = 6`: `dividendFloor(..., 3)` is 6e6, `(..., 12)` is 12e6.
  - `'profit rule: a share of the year, never past the spare cash'`: cash 10e6, floor 3e6, spare 7e6.
    - `{ profit, 0.5, keep 3 }` on net 4e6 gives `pay` 2e6 and `why` null.
    - pct 1 gives 4e6.
    - net 20e6 and pct 1 gives 7e6 (capped).
  - `'cash rule: a share of the spare cash'`: pct 0.5 gives 3.5e6; pct 1 gives 7e6; keep 24 gives 0.
  - `'says why nothing is paid'`: one case per reason, each `pay` 0 and `why` exactly the copy above.
    - Profit mode with net -1e6: reason 1.
    - Debt 10e6 on cash 10e6: reason 2.
    - `b.share = 0.5`, `b.pref = 1e12`, so `payoutCash` is 0 while `payableCash` is above 0: reason 3.
    - Debt 9e6 on cash 10e6, floor 3e6: reason 4.
    - Cash mode, `b.cash = 0`, no debt: reason 5.
  - `'cannot be funded by borrowing'`: `rich(g)`, then `b.debt += 5e6; b.cash += 5e6`: `dividendQuote` gives the same `pay` as before.
  - `'a bank keeps its capital'`: build a bank with a copy of the `bank()` helper (`test/bank.test.ts:37`) and book a year as `:877-880` does. A profit rule at pct 1 gives `dividendQuote(...).spare <= payableCash(a, b)`, and after `autoDividendYear` the bank's `capitalRatio(b, readBank(b))` is at least `minCapitalRatio(b.countryId, g.year) - 1e-6` (the assertion at `:891`). A studio's unreleased-game money is already inside `payableCash` and has its own tests.
  - `'pays, and every dollar goes somewhere'`:
    - Setup: `rich(g)`, `b.share = 0.6` (then `refreshValue(a, b)` again), executive 0.05, a sibling (`createPerson(g, { relation: 'sibling', age: 40 })`) holding `familyShares = [{ id: sib.id, share: 0.1 }]`, rule `{ profit, 0.5, 3 }`, net 4e6. Floor is 3e6, so `pay` is 2e6.
    - Result: `kind 'paid'`; `paid` 2e6, `mine` 1.2e6, `family` 0.2e6, `rest` 0.6e6, `mine + family + rest === paid`.
    - State: `b.cash` is 8e6; `g.character.money` rose by exactly 1.2e6; `g.flags.taxableIncome` rose by exactly 1.2e6; `sib.money` rose by 0.16e6 (the 80% after withholding); `bizOf` shows `dividend.last` equal to `{ year: s.year, paid: 2e6, mine: 1.2e6, perShare: 0 }`.
    - Then `a.value === stakeValue(b)`, and `netWorth(g)` before and after differ by at most 2 (the money moved from stake to cash, and the sibling's money isn't the player's).
  - `'a listed company: the price falls by the payout per share'`: `listed(g, { marketCap: 5e9, sharesOut: 1e8, share: 0.6 })`, `b.cash = 200e6`, `books(b, 50e6)`, rule `{ cash, 0.5, 3 }`.
    - `b.sharePrice` falls by `paid / 1e8` (within one cent, since the price rounds to cents); `b.valuation === round(b.sharePrice x 1e8)`; `paid.perShare` is close to `paid / 1e8` (6 places); `paid.price === b.sharePrice`; `a.value === stakeValue(b)`.
  - `'the tax estimate is the margin on the year so far'`: set `g.flags.taxableIncome = 80_000` first; `paid.tax` equals `gameIncomeTax(g, T) - gameIncomeTax(g, T - mine)` with `T = num(g.flags.taxableIncome)` after the call, and is above 0 for a $1.2M `mine`.
  - `'pays a fiscal year once'`: a second call with the same `s` returns `null` and moves nothing. A call with `year: s.year + 1` pays again.
  - `'does nothing without a usable rule'`: for no rule, `dividend: 'x'`, `{ mode: 'weird' }` (cast `as never`), a group member (`listedGroup` member), `b.share = 0`, and a rule with `last.year` equal to `s.year`: the result is `null` and `JSON.stringify(g)` is unchanged.
  - `'skips and says nothing else'`: profit mode with net -1e6 returns `{ kind: 'skipped', name, why: 'It made no profit.' }`; `b.cash` and `dividend` unchanged.
  - `'is pure where it should be'`: on a `deepFreeze`d copy of `g`, `dividendFloor` and `dividendQuote` do not throw and return finite numbers for `profit` of `NaN`, `-5`, `1e30`, and `g.rng` and `g.nextId` are the same after `autoDividendYear` on a clone.
  - `'payDividend still does the same thing'`: `payDividend(g, a, b, 1_000_000)` on `rich(g)` raises `g.character.money` by 1e6, lowers `b.cash` by 1e6 and queues a "Payday" notice. The existing `test/board.test.ts`, `test/bank.test.ts` and `test/conglomerate.test.ts` cover the rest.
- [ ] **Step 2: Run** `npx vitest run test/dividend-year.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Extract** `payOut` in `board-menu.ts` and make `payDividend` call it.
- [ ] **Step 4: Implement** `dividend-year.ts` as specified.
- [ ] **Step 5: Run** `npx vitest run test/dividend-year.test.ts test/board.test.ts test/bank.test.ts test/conglomerate.test.ts test/ceo.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat: what a yearly dividend would pay, and paying it`.

### Task 3: Year end, popup and log

**Files:**
- Modify: `src/game/business/dividend-year.ts`
- Modify: `src/game/business/yearly.ts`. Import the three functions. Add `const dividends: DividendResult[] = []` before the company loop (next to `statementBridges`, line 484). Inside the loop add the call after `milestoneYear(g, a, b)` (line 553) and before the `groupRescue` line (556). After the loop add `queueDividends(g, dividends)` before `settleInternalServices(g, fiscal)` (line 577).
- Modify: `src/game/business/board-ceo.ts`. In `payoutTurn` (line 636), after the `inGroup` return, add `if (readDividend(b.dividend)) return` and import `readDividend`.
- Test: `test/dividend-wiring.test.ts`

**Interfaces:**
- Consumes: Task 2's `autoDividendYear`, `DividendResult`; `log` and `formatPrice` (`core.ts`); `money`, `pct` (`business/util.ts`).
- Produces, in `dividend-year.ts`:
  - `export function dividendLog(g: GameState, r: DividendResult): void`
  - `export function queueDividends(g: GameState, list: readonly DividendResult[]): void`

Exact copy:
- Paid, life log, tone `good`: `${name} paid me ${money(mine)} in dividends.`
- Skipped, life log, tone `neutral`: `${name} paid no dividend. ${why}`
- Popup: title `Dividends`, emoji `\u{1F4E4}`, tone `good`, id `` `div-${g.generation}-${g.year}` ``. Nothing is queued unless at least one company paid. The text is one block per result, in order, joined by a blank line.
  - A paid block is `` `${name}: ${money(paid)} paid${perShare > 0 ? `, ${formatPrice(perShare)} a share` : ''}.` `` followed by:
    - `share < 0.999 ? ` Your ${pct(share)} is ${money(mine)}.` : ` You got ${money(mine)}.``
    - `tax > 0 ? ` Income tax takes about ${money(tax)}.`` (leave out when 0)
    - `family > 0 ? ` Your relatives got ${money(family)}.``
    - `rest >= 1 ? ` Other shareholders got ${money(rest)}.``
  - A skipped block is `` `${name}: no dividend. ${why}` ``.

The call in `yearly.ts`:

```ts
const paidOut = autoDividendYear(g, a, b, s)
if (paidOut) { dividends.push(paidOut); dividendLog(g, paidOut) }
```

- [ ] **Step 1: Write the failing tests** in `test/dividend-wiring.test.ts`, using the kit (`founder`, `privateCompany`, `listed`, `listedGroup`). A year is `g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []; yearlyBusinessImpl(g)`, as in `test/own-listing-story.test.ts`. Give the company a large `b.cash` first so the floor is met.
  - `'pays a cash rule at year end, taxes it and says so'`: rule `{ cash, 0.5, 3 }`, `b.share = 1`.
    - After the year: `b.dividend.last.year === g.year - 1`; `g.character.money` rose by exactly `last.mine`; `g.flags.taxableIncome` includes it; `b.cash` is at least `dividendFloor(g, a, b, 3)` minus 1.
    - The life log (`g.log.flatMap((y) => y.entries)`, as `test/own-trade.test.ts:267` reads it) has one entry matching `/paid me .* in dividends\./`.
    - The queue has one notice titled `Dividends` with id `` `div-${g.generation}-${g.year}` ``, and its text contains the company name and `Income tax takes about`.
    - After `yearlyFinance(g)`, `g.flags.taxesPaid` is above its value before.
  - `'a profit rule pays its share of the booked profit'`: read `b.last.net` after the year and assert `last.paid === min(round(pct x max(0, net)), spare)` where `spare` is computed from the cash and floor just before the payment. Guard the test with `expect(net).toBeGreaterThan(0)`.
  - `'two companies, one popup'`: two companies with cash rules both pay; exactly one `Dividends` notice, its text has both names, and the life log has two payout lines.
  - `'a losing year pays nothing and says why'`: rule `{ profit, 0.5, 3 }`, set `b.price = 0.01` and guard `b.last.net < 0` after the year. No notice, no payment, one log line `/paid no dividend\. It made no profit\./`, `b.dividend` has no `last`.
  - `'debt comes first'`: `b.debt = b.cash + 1e6`: no payment, log line ends `Its loans come first.`
  - `'the floor stays'`: with `keep` 24 the company pays nothing and the line ends `Its cash is at the floor.`
  - `'once a year'`: calling `yearlyBusinessImpl(g)` a second time in the same `g.year` pays nothing more.
  - `'a hired CEO on a cash mandate does not pay on top'`: build the company as `managed(4, 90, 'restaurant', 'us', { cash: 5_000_000 })` does in `test/ceo.test.ts:48` (copy that helper and `years`), set `boardOf(b).mandate = 'cash'`, `boardOf(b).limits = { capex: 0.05, reserve: 2, pay: 1.25 }`.
    - On one clone with no rule, `smartManagerTurn(g, a, b)` raises the player's money (the existing behaviour, asserted in `test/ceo.test.ts:165-176`).
    - On another clone with a rule set, the same call leaves the player's money exactly where it was.
    - A full `yearlyBusinessImpl` on the rule clone sets `last.year === g.year - 1` and the player's money rose by exactly `last.mine` (the owner draws no salary while a CEO runs the company), so the rule paid once and the CEO paid nothing.
  - `'a board never votes'`: `b.share = 0.6`. `boardOf(b).votes.length` is the same before and after the year; if `b.dividend.last` exists then `b.cash >= reserveDollars(b, boardView(g, a, b)) - 1`.
  - `'a division is skipped'`: `listedGroup(g, 'us', 0.7)` members with rules and big cash: no `last`, no `Dividends` notice, no payout line.
  - `'prison and a young heir still get paid'`: with `g.character.prison` set as `test/own-trade.test.ts:205` does, and separately `g.character.age = 16`, the rule pays and `g.character.money` rises by `last.mine`.
  - `'a hostile rule is no rule'`: `b.dividend = { mode: 'weird' } as never` runs the year without throwing, with no payout line and no popup.
  - `'a game with no rule gains nothing'`: a company that never had the field, and one that had it set and `delete`d, run the same year. Neither ends with a `dividend` key, a `Dividends` notice or a log line containing `dividend`, and both end with the same `JSON.stringify(g)`. That the old build's seeded results are unchanged is carried by `test/business.test.ts`, `test/ceo.test.ts` and `test/board.test.ts` passing as they are.
  - `'taxes arrive in the same age-up'`: `YEARLY_HOOKS.map(([n]) => n)` has `'business'` before `'finance'`. This pins the premise of D6.
- [ ] **Step 2: Run** `npx vitest run test/dividend-wiring.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dividendLog` and `queueDividends`; wire `yearly.ts`; add the one-line return in `board-ceo.ts`.
- [ ] **Step 4: Run** `npx vitest run test/dividend-wiring.test.ts test/dividend-year.test.ts test/ceo.test.ts test/board.test.ts test/board-exploits.test.ts test/business.test.ts test/bank.test.ts test/conglomerate-play.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: pay each company's yearly dividend at year end`.

### Task 4: The menu

**Files:**
- Create: `src/game/business/dividend-menu.ts`
- Modify: `src/game/business/manage.ts` *. Add `import { dividendMenu } from './dividend-menu'` with the other business imports. In `businessView` (the Money part, line 2165) change `nodes.push(...ceoNodes(a, g), ...moneyNodes(a, g))` to `nodes.push(...ceoNodes(a, g), ...moneyNodes(a, g), dividendMenu(a))`. Nothing else in the file changes.
- Test: `test/dividend-menu.test.ts`

**Interfaces:**
- Consumes: Task 1's `readDividend`, `withPolicy`, `DIVIDEND_PCT`, `DIVIDEND_KEEP`; Task 2's `dividendQuote`, `dividendFloor`; `manageBlock` (`gate.ts`); `inGroup`; `boardExists`, `boardView`; `managerName` (`career.ts`); `findBusiness`, `readBiz`, `bizOf`; `notice` (`core.ts`); `money`, `pct`.
- Produces, in `dividend-menu.ts`:
  - `export function dividendMenu(a: Asset): MenuGroup`
  - `export function ruleNote(g: GameState, a: Asset, b: BizState, p: DividendPolicy): string`: the preview line, pure.

Node ids (none collides with `biz.dividend.<id>`, the manual row): `biz.divpolicy.<id>` for the menu; `biz.divpolicy.profit.<id>`, `.cash.<id>`, `.keep.<id>`, `.off.<id>` for the actions; `biz.divpolicy.last.<id>`, `.board.<id>`, `.ceo.<id>` for the info rows.

The menu:
- `MenuGroup`, label `Yearly Dividend`, emoji `\u{1F4E4}`, `visible` false for a missing company or a group member (`inGroup(g, readBiz(g, cur))`).
- Subtitle: `Off. Pay yourself by hand, or set a yearly rule.` with no rule; with one, `` `${pct(p.pct)} of ${p.mode === 'profit' ? "each year's profit" : 'spare cash each year'}, keeping ${p.keep} ${p.keep === 1 ? 'month' : 'months'} of costs.` ``
- Header: `` `${a.name} pays its shareholders at each year end by this rule. Your share is taxed as income. Loans and the cash floor come first.` ``
- Children, rebuilt on each open, in this order:
  - Info `last`, when the rule has a last payment: `` `Last paid: ${money(last.paid)} for ${last.year}. Your part was ${money(last.mine)}.` ``
  - Info `board`, when `boardExists`: `` `The board's reserve is ${months} months of costs. The rule never pays below it, and it never needs a vote.` `` with `months = boardView(...).limits.reserve`.
  - Info `ceo`, when a rule is set and `b.ceo === 'manager' && b.manager`: `` `${managerName(b.manager)} runs this company. Your rule replaces the dividends their mandate would pay.` ``
  - Action `Share of Profit`, emoji `\u{1F4C8}`, subtitle `Pay a share of each year's profit`. Slider label `Share of the year's profit`, `min` 5, `max` 100, `step` 5, `unit` `%`. Default is the rule's percent when its mode is `profit`, else 30. Preview is `ruleNote` for `{ mode: 'profit', pct: v / 100, keep }`.
  - Action `Share of Spare Cash`, emoji `\u{1F4B5}`, subtitle `Spare cash is what's left above loans and the floor`. Slider label `Share of spare cash`, same bounds. Preview for mode `cash`.
  - Action `Cash to Keep`, emoji `\u{1F3E6}`. Subtitle is `` `${p.keep} ${p.keep === 1 ? 'month' : 'months'} of costs: ${money(dividendFloor(g, a, b, p.keep))}` `` with a rule and `Set a share first.` without. Slider label `Months of costs to keep in the company`, `min` 0, `max` 24, `step` 1, `unit` ` months`. Preview is `` `Keeps at least ${money(dividendFloor(g, a, b, v))} in the company.` `` plus ` The board's reserve is higher.` when `boardExists` and the board's reserve in dollars exceeds the player's months. `disabledReason`: `manageBlock`, else `Set a share first.` with no rule.
  - Action `Turn Off`, emoji `\u{26D4}`, subtitle `Back to paying yourself by hand`. Visible only with a rule.
- Every action's `disabledReason` is `manageBlock(g, a)` first. Every `run` re-reads the company (`findBusiness`), returns if `manageBlock` or `inGroup`, and ignores a non-finite input.
- Runs and notices, tone neutral:
  - Profit or Spare Cash: `b.dividend = withPolicy(readDividend(b.dividend), { mode, pct: Number(input) / 100 })`. Notice `Yearly Dividend Set`: `` `${a.name} will pay ${pct(p.pct)} of ${mode === 'profit' ? "each year's profit" : 'its spare cash'} at year end, keeping ${p.keep} ${p.keep === 1 ? 'month' : 'months'} of costs.` ``
  - Cash to Keep: `withPolicy(cur, { keep: Number(input) })`. Notice `Cash to Keep Set`: `` `${a.name} keeps at least ${money(dividendFloor(g, cur, b, p.keep))} in the company before it pays a dividend.` ``
  - Turn Off: `delete b.dividend`. Notice `Yearly Dividend Off`: `` `${a.name} won't pay a yearly dividend. You can still pay one by hand.` ``
- `ruleNote`: with `q = dividendQuote(g, a, b, p, b.last?.net ?? 0)`. When `q.pay < 1`: `` `Nothing would be paid now. ${q.why ?? 'It has no spare cash.'}` ``. Otherwise `` `On ${p.mode === 'profit' ? `last year's ${money(max(0, b.last?.net ?? 0))} profit` : `${money(q.spare)} of spare cash`}: ${money(q.pay)} paid. ${b.share < 0.999 ? `Your ${pct(b.share)} is ${money(round(q.pay x b.share))}` : `You get ${money(round(q.pay x b.share))}`}, taxed as income. ${money(max(0, b.cash - q.pay))} stays in the company.` ``

- [ ] **Step 1: Write the failing tests** in `test/dividend-menu.test.ts`, using the kit and `findNode`.
  - `'sits in Money after the manual dividend'`: in `businessView(g, a)`, the index of `biz.divpolicy.<id>` is greater than that of `biz.dividend.<id>` and smaller than that of `biz.rescue.<id>`.
  - `'is absent for a division'`: for a member of `listedGroup(g, 'us', 0.7)`, the node's `visible(g)` is false.
  - `'renders from a frozen state'`: `deepFreeze(g)`, then walk `children(g)`, every `subtitle`, `header`, `hint` and `disabledReason`, for an owner-run private company, one with `b.share = 0.6` and a rule, a hired-CEO company with a rule, and a listed company. Nothing throws; every string is free of `NaN`, `undefined` and `Infinity`.
  - `'subtitles'`: no rule gives `Off. Pay yourself by hand, or set a yearly rule.`; a profit rule at 0.3 and 3 gives `30% of each year's profit, keeping 3 months of costs.`; a cash rule with keep 1 gives `... of spare cash each year, keeping 1 month of costs.`
  - `'the sliders have the right bounds'`: Profit and Spare Cash are `slider`, `min` 5, `max` 100, `step` 5, `unit` `%`, no `money`; Cash to Keep is `min` 0, `max` 24, `step` 1.
  - `'runs write the rule'`: `profit.run(g, '30')` gives `bizOf(g, a).dividend` equal to `{ mode: 'profit', pct: 0.3, keep: 3 }` and a `Yearly Dividend Set` notice; `cash.run(g, '50')` gives mode `cash`, pct 0.5, keep 3; `keep.run(g, '6')` gives keep 6 and keeps the mode; `off.run(g)` removes the field and queues `Yearly Dividend Off`.
  - `'ignores garbage and clamps'`: `profit.run(g, 'abc')`, `''` and `'1e999'` change nothing; `'250'` stores pct 1; `'-5'` stores 0.05; `keep.run(g, '99')` stores 24.
  - `'is blocked when you can't manage'`: in prison and at age 17, each action's `disabledReason(g)` is `manageBlock`'s text and `run` changes nothing. Without a rule, Cash to Keep says `Set a share first.` and Turn Off is not `visible`.
  - `'previews are pure and finite'`: for `v` from 5 to 100 step 5 on each slider, the preview string has no `NaN`, `undefined` or `Infinity`, and `JSON.stringify(g)` and `g.rng` are unchanged. With a loss year it starts `Nothing would be paid now.`; with a good year it contains `taxed as income` and `stays in the company`.
  - `'the info rows say what applies'`: with `b.share = 0.6` the board row is present and names the reserve months; with a hired CEO and a rule the CEO row names the manager; with a stored `last` the first row reads `Last paid: ... for <year>. Your part was ...`.
  - `'a hostile rule shows as off'`: `b.dividend = 'x' as never`; the subtitle is the Off line and nothing throws.
- [ ] **Step 2: Run** `npx vitest run test/dividend-menu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dividend-menu.ts` and the two-line `manage.ts` edit.
- [ ] **Step 4: Run** `npx vitest run test/dividend-menu.test.ts test/business.test.ts test/company-dashboard.test.ts test/voice-guards.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: Yearly Dividend menu under Money`.

### Task 5: The Stocks line

**Files:**
- Modify: `src/game/business/own-listing-menu.ts`. In `screen` (line 139), read the live company once, before `texts`: `const view = group ? null : liveView(g, cur.id)`, and use that `view` at the existing `if (view)` further down instead of reading it again. Import `readDividend`.
- Test: `test/own-listing-menu.test.ts`

**Interfaces:**
- Consumes: Task 1's `readDividend`.
- Produces: one more info row on a company's Stocks screen, the first line pushed in the non-group branch of `screen`, before the control note: `` `Last dividend: ${formatPrice(last.perShare)} a share for ${last.year}${cur.price > 0 ? `, ${pct(last.perShare / cur.price, 1)} of the price` : ''}.` `` Shown only for a company (not a group) whose rule has a `last` with `perShare > 0`.

- [ ] **Step 1: Write the failing tests** in `test/own-listing-menu.test.ts`, under a new `describe('the last dividend')`, with the kit's `listed`.
  - `'shows the last dividend on a company screen'`: `listed(g, { marketCap: 5e9, sharesOut: 1e8 })` (price 50), `b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { year: 2026, paid: 5e6, mine: 3e6, perShare: 0.05 } }`. The screen's info texts include one matching `/^Last dividend: .* a share for 2026, 0\.1% of the price\.$/`.
  - `'shows nothing without one'`: no rule, a rule with no `last`, a `last` with `perShare` 0, and a hostile `dividend` (`'x' as never`) each leave the screen without a "Last dividend" row.
  - `'a group row has none'`: `listedGroup(g, 'kr', 0.7)` screen has no "Last dividend" row.
  - `'the screen still renders from a frozen state'`: `deepFreeze(g)` and read the screen.
- [ ] **Step 2: Run** `npx vitest run test/own-listing-menu.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the row.
- [ ] **Step 4: Run** `npx vitest run test/own-listing-menu.test.ts test/own-listing-story.test.ts test/investments.test.ts` and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: last dividend on the Stocks company screen`.

### Task 6: Story, docs, notes

**Files:**
- Create: `test/dividend-story.test.ts`
- Modify: `docs/ARCHITECTURE.md`, `docs/BUSINESS-AND-DYNASTIES.md`
- Create or modify: `docs/RELEASE-v2.8.0.md`. If the file already exists (a parallel feature made it), append the section and keep theirs; a merge conflict here is resolved by keeping both sections.

- [ ] **Step 1: Write the story test**, `it('a founder lists, sets a rule, gets paid and is taxed')`, with the kit's `founder` and the `goPublic` fixture of `test/own-listing-story.test.ts`.
  1. A US founder's software company (three years of 30e6 profit) goes public (`goPublic(g, a, b, 25)`). Give it `b.cash = 400e6` and set `b.share` to 0.6.
  2. Open `businessView(g, a)`, find `biz.divpolicy.cash.<id>`, run it with `'50'`. `bizOf(g, a).dividend` is `{ mode: 'cash', pct: 0.5, keep: 3 }`.
  3. **Buying first doesn't pay.** Clone the game with `structuredClone`. On the clone, buy at the Stocks row's slider `max` (step 3 of `test/own-listing-story.test.ts`). Then call `autoDividendYear` on both with the same `Statement` (`b.last`, with a positive `net` set if the company has none yet). Compare: `netWorth(clone) < netWorth(original)`. The buy paid at least 3% over the mark, and the payout moves value without creating any, so buying to collect a dividend loses money. This compares two direct calls, not two simulated years, because a bigger stake changes the board's seats and so what the year draws from `g.rng`.
  4. **The year.** On the original: `g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []; yearlyBusinessImpl(g); yearlyFinance(g)`.
     - One `Dividends` notice; one life-log line `/paid me/`; `last.perShare > 0`.
     - `b.sharePrice` is below its pre-year value by about `perShare` plus the market's own move: assert `b.dividend.last.perShare` equals `last.paid / b.sharesOut` (6 places) instead of comparing across the year.
     - `g.flags.taxesPaid` rose.
     - The Stocks row's screen has a `Last dividend:` line.
  5. **Round trip.** `JSON.parse(JSON.stringify(g))` still has the rule, still renders the row, and a second year pays again with `last.year` one higher.
  6. **Selling out.** `sellOwnShares(g, a.id, 1)` removes the company; the next `yearlyBusinessImpl(g)` runs without error and queues no `Dividends` notice.
- [ ] **Step 2: Run** `npx vitest run test/dividend-story.test.ts`. Expected: PASS on the first run, since it only drives code from Tasks 1 to 5. If it fails, fix the owning task's code, not the test.
- [ ] **Step 3: Docs.**
  - **`ARCHITECTURE.md`, Layout:** list `business/dividend-policy.ts dividend-year.ts dividend-menu.ts`, described as the yearly dividend rule, its quote and year step, and its menu.
  - **`ARCHITECTURE.md`, new bullet "Yearly dividends" under "Running a company" (after "Your listed companies in Stocks"):**
    - the record `BizState.dividend` and `readDividend` (never read it raw);
    - the maths: floor, spare, basis, pay (D2 to D4);
    - `payOut` as the one money move shared with `payDividend`; tax as income in the player's country, in the same age-up because `business` runs before `finance` (D6);
    - the year step's place in `yearlyBusinessImpl` and the once-a-year guard (D5);
    - no vote, the board's reserve inside the floor (D7);
    - a hired CEO's `payoutTurn` returns while a rule is set (D8);
    - divisions ignored (D9);
    - one popup, one log line per company (D10);
    - the Stocks "Last dividend" line (D11).
  - **`ARCHITECTURE.md`, "Smart hired CEOs" bullet:** add that a set dividend rule replaces `payoutTurn`.
  - **`BUSINESS-AND-DYNASTIES.md`, "Where to find the changes":** one bullet after "Company → Money": Company → Money → **Yearly Dividend** sets a percentage of the year's profit or spare cash to pay at year end, with a cash floor, after the company's debts and without a board vote.
- [ ] **Step 4: Release notes**, `docs/RELEASE-v2.8.0.md`, in the shape of `docs/RELEASE-v2.7.0.md`: a one-paragraph summary, then a section "Yearly dividends" with these parts. Figures to state: 5% to 100% in steps of 5; default 30%; the floor 0 to 24 months of costs, default 3.
  - **Setting it.** Money, Yearly Dividend: Share of Profit, Share of Spare Cash, Cash to Keep, Turn Off. Each slider previews what it would pay now.
  - **What it pays.** The percentage of the year's profit after tax, or of the spare cash, never more than the spare cash: cash after loans, investors' share, unreleased-game money and a bank's capital, and after the floor. A year that pays nothing says why. Nothing carries over.
  - **Who gets it.** You, by your stake, taxed as income where you live, with an estimate in the popup. Relatives by theirs. The other shareholders get the rest. A listed company's price falls by the payout per share.
  - **When you're not running it.** A hired CEO's cash or profit mandate stops paying while your rule is set. A board never votes on it and the payout never passes the board's reserve. It still pays in prison and for a young heir. A division of a group ignores it.
  - **In Stocks.** The company screen shows the last dividend per share and its yield.
  - **Old saves.** Nothing changes until you set a rule.
  - **Not in this release.** A fixed dollar amount; dividend tax rates by country; a rule for groups; special dividends; buybacks as a payout; a CEO letter line; an advisor that sets the rule; a hired CEO's dividends reaching relatives.
  - VOICE applies, with no em-dashes.
- [ ] **Step 5: Full verification.**
  - `npm run typecheck`, `npm test` (all files), `node scripts/voice-report.mjs` and `npm run build`.
  - Expected: all green. The voice report's long-string count is no higher than before Task 4, and `voice-guards` still reports no new em-dashes.
- [ ] **Step 6: Commit** `docs: yearly dividends; story test and release notes`, then push.

---

## Self-review

**Spec coverage**

| Spec item | Where it's covered |
|---|---|
| D1 | Task 1 record, reader, `normalizeBiz` line |
| D2 | Task 2 quote (both modes); Task 4 two sliders |
| D3 | Task 2 `dividendFloor`; Task 4 Cash to Keep |
| D4 | Task 2 reasons, borrowing, preference, bank; Task 3 debt and floor |
| D5 | Task 3 call site, once a year |
| D6 | Task 2 `payOut`, tax estimate; Task 3 hook-order test; Task 6 tax |
| D7 | Task 2 floor with the board; Task 3 'a board never votes' |
| D8 | Task 3 `payoutTurn` return, hired CEO, prison, young heir |
| D9 | Task 3 division skipped; Task 4 hidden |
| D10 | Task 3 popup and log |
| D11 | Task 5 |
| D12 | Task 4 menu |
| §4.4 | Task 2 listed price, Task 6 buy-first story |
| §5 | Task 1 |
| §6 | Task 2 purity, Task 3 'gains nothing', Task 4 previews |
| §7 | Task 1 old record, Task 3 'gains nothing', hostile rule |
| §9 | Spread as named in each test |

**Departures from the spec, each stated where it is made**
- `dividendField(raw)` carries the `normalizeBiz` whitelist in one line, instead of the spec's `readDividend` spread. Same result.
- `withPolicy` is added (the menu and a later advisor use it).
- `perShare` is stored rounded to 6 places.
- A payment whose player part rounds to under $1 is reported as a skip with "It has no spare cash."
- The popup's static text per block is allowed up to 160 characters, because it names several amounts.

**Type consistency**

These names are spelled the same in every task that uses them: `DividendMode`, `DividendLast`, `DividendPolicy`, `DIVIDEND_PCT`, `DIVIDEND_KEEP`, `readDividend`, `dividendField`, `withPolicy`, `DividendQuote`, `dividendFloor`, `dividendQuote`, `DividendPaid`, `DividendResult`, `autoDividendYear`, `dividendLog`, `queueDividends`, `payOut`, `dividendMenu` and `ruleNote`.

**Proportion**

The build is about 400 lines of source in three new modules, plus single-hunk edits in `state.ts` (3 lines), `manage.ts` (2), `yearly.ts` (about 8), `board-ceo.ts` (2), `board-menu.ts` (a 12-line extract) and `own-listing-menu.ts` (about 6). No new economy maths, no tax code, no new popup type. Almost all of the plan's length is test assertions and fixed player copy.

**Known residual risk**

- The tax figure in the popup is the margin on the year's income so far. Investment income runs later in the year and can lift the real rate, so the popup says "about".
- Executives' slice of a payout is not tracked as cash. It is counted in "Other shareholders".
- A company with a rule that joins a group is ignored while it is a member and resumes if it leaves.
- `payoutTurn` still pays no relatives when no rule is set. That gap is older than this work and is listed as out of scope.
- Two parallel builds that also edit `state.ts` or `manage.ts` merge cleanly only because the hunks are separate. If either file has been rewritten wholesale by another task, redo the three-line edit by hand.
