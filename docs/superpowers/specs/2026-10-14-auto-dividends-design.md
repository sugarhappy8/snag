# Automatic yearly dividends

Status: design, decisions taken by the recommended option (standing instruction from the owner).
Supersedes nothing. One phase. Built after the Stocks listing (shipped) and alongside Heavy R&D (in progress).

## 1. What the owner asked for (their words)

1. "the ability for auto yearly dividends setting in profit percentage or liquid cash"
2. Order of work, chosen by the owner (Stocks listing spec, section 1, item 5): the Stocks listing and share
   classes first, then automatic dividends, then a financial advisor and manager, then hedge funds.
3. Standing instructions for this spec: take the recommended option at every choice, keep scope tight, build
   the smallest version that fully delivers the ask. Later extensions are listed as out of scope.

Read as one play session: the player opens a company, finds Yearly Dividend under Money, picks "30% of the
year's profit" or "half the spare cash", and ages up. At year end the company pays by that rule, once, from
company cash. The player gets their stake's part (taxed as income where they live), relatives get theirs, and
the other shareholders get the rest. The company keeps a cash floor and never pays out money it owes. A life-log
line and one popup say what was paid and why anything wasn't.

## 2. What exists today (read in the working tree)

- **Dividends are manual.** Company screen, Money, `Pay a Dividend` (`Withdraw Profits` at 100% ownership)
  (`manage.ts:1492`) calls `payDividend` (`board-menu.ts:109`). It clamps the amount to `payoutCash`, asks the
  board when the amount is past `sustainablePayout`, takes `b.cash -= n`, pays the owner `n x b.share` through
  `earnIncome` (taxable income), pays relatives through `payFamilyBusinessProceeds` (`dynasty-ownership.ts:200`,
  80% after withholding), and for a listed company drops `b.sharePrice` by `n / sharesOut` and re-marks
  `valuation`. The popup is "Payday".
- **The payout rails are already built.** `payableCash` (`board-vote.ts:102`) is cash minus unreleased-game
  money minus company debt, and a bank also keeps its required capital. `payoutCash` (`:114`) also holds back
  outside investors' 1x preference. `sustainablePayout` (`:172`) is `payoutCash` minus the board's cash reserve;
  `needsVote` (`:463`) only asks the board for a dividend past it. `runningCosts` (`:123`) and `reserveDollars`
  (`:136`) turn the reserve into dollars (months of running costs, 0 to 24).
- **The only automatic payout is a hired CEO's.** Above skill 75, under a Cash or Profit mandate,
  `payoutTurn` (`board-ceo.ts:636`) pays the cash above the reserve (Cash) or at most half of last year's
  profit (Profit). It pays the owner's part and lowers a listed price, but it never calls
  `payFamilyBusinessProceeds`, so relatives get nothing from it (an existing gap, not fixed here).
- **Year end.** `aging.ts` `ageUp` bumps the year, zeroes `taxableIncome` (`:102`) and runs `YEARLY_HOOKS`.
  `business` (`:65`) runs before `finance` (`:70`). `yearlyBusinessImpl` (`yearly.ts:466`) books fiscal year
  `g.year - 1` per company: `simulateYear`, the owner's salary through `earnIncome` (`:508`), `evolve`,
  `recordYear`, `updateSharePrice`, `boardYear` (`:542`), executive shares (`:545`), milestones (`:553`), the
  cash-crunch exit (`:557`), the annual report (`:570`) and the hired CEO's turn (`:574`). A company is booked
  once per fiscal year (the `b.last.year >= fiscal` guard, `:488`).
- **Tax.** `yearlyFinance` runs `settleIncomeTax` (`finance.ts:593`) on `taxableIncome` with `gameIncomeTax`
  (`:144`, the country's table plus any government change). No dividend-specific rate exists anywhere. Dividends
  from stocks are also taxed as income (`investments.ts:1357`). Corporate tax is already inside `Statement.net`.
- **Ownership.** The player's stake is `BizState.share`; executives `executiveEquity`; relatives `familyShares`;
  the rest is outside shareholders, implied (`own-listing.ts` `outsideFloat`). A company's value includes its
  cash (`valuationOf`, `economy.ts:897`: `equity = ... + b.cash - b.debt`), so a payout lowers value by what it moves.
- **Groups.** A division's cash belongs to the group treasury; only `Pay a Group Dividend`
  (`conglomerate-actions.ts:724`) pays the owner (`board-ceo.ts:638`).
- **The Stocks screen** (`own-listing-menu.ts:139`) shows no dividend: the listing plan left it out "because no
  payout is recorded".
- **Saves.** `normalizeBiz` (`state.ts:557`) is a whitelist; `bizOf` re-normalizes only a record whose version
  is not `BIZ_VERSION`, so a current-version record can still hold a hostile value.

## 3. Decisions (each is the recommended option; change here, not in the code)

| # | Decision | Why |
|---|---|---|
| D1 | The rule is one optional record on the company, `BizState.dividend`, with `mode`, `pct`, `keep` and the last payment. | It travels with the company through inheritance and dies with it on a sale or seizure. A flag keyed by asset id would outlive it. |
| D2 | Two bases. `profit`: a percentage of the year's net profit (`Statement.net`, after corporate tax). `cash`: a percentage of spare cash. One percentage, 5% to 100% in steps of 5, default 30%. | That is the ask ("profit percentage or liquid cash"). Spare cash at 100% already means "everything above my floor". A fixed dollar amount needs its own scale across 51 industries and a shortfall rule; it is listed as a later step. |
| D3 | The floor is months of running costs to keep in the company: 0 to 24, default 3, the board reserve's own unit and bounds. With a board, the floor is the larger of the player's months and the board's reserve. | Reuses `runningCosts` and `reserveDollars`. Three months equals `rdReserve` (`rd.ts:257`), so a default rule never strips what R&D needs to start. |
| D4 | The rule pays `min(want, spare)` where `spare = max(0, payoutCash - floor)`. Debt, unreleased-game money, investors' preference and a bank's capital all sit inside `payoutCash`, so they hold without new code. A year that pays nothing says why. No catch-up the next year. | "A cash floor so the company is not starved" and "debt covenants" are the existing `payoutCash` rules plus the floor. Borrowing to pay a dividend cannot work: `payableCash` subtracts the loan. |
| D5 | It runs inside `yearlyBusinessImpl`, after the company's board review and milestones and before the crunch exit, report and hired CEO's turn. Once per fiscal year (`last.year >= s.year` returns). | Cash is the booked year-end cash, so the quote is exact. The report and the CEO plan on cash after the payout. |
| D6 | The money move is the manual dividend's, extracted as `payOut` in `board-menu.ts` and shared. The owner's part is taxed as income in the player's country, in the same age-up (`business` runs before `finance`). The popup shows an estimate of the tax. | One path, one set of rules. No new tax code. Per-country dividend rates are out of scope. |
| D7 | It never asks the board. Past `sustainablePayout` a manual dividend needs a vote; the rule is capped at that line, because the floor is at least the board's reserve. No vote, no popup, no `g.rng`. | The player is held to the CEO's limits (ARCHITECTURE, Boards). A yearly auto-vote would spam popups and make years unpredictable. |
| D8 | Who runs the company does not matter: owner-CEO, hired CEO, interim, player in prison, young heir. The rule replaces the hired CEO's own `payoutTurn` while it is set. | It is the shareholder's standing instruction. Two payers would double-pay. |
| D9 | A division of a group is ignored and its menu hidden. | Division cash belongs to the group treasury (`board-ceo.ts:638`). |
| D10 | Reporting: one life-log line per company (paid: "paid me X in dividends", skipped: why), and one bundled "Dividends" popup a year with a block per company, only when something was paid. | One popup for an empire, as milestones and CEO letters do. A skipped year is a log line, not a popup. |
| D11 | The Stocks company screen gets one line, "Last dividend", from the stored last payment. Nothing else on the row changes. | Closes the listing plan's gap with the data the rule already records. |
| D12 | The menu is Money, then `Yearly Dividend` (a submenu with Profit, Spare Cash, Cash to Keep, Turn Off), placed after the manual `Pay a Dividend`. | Next to the thing it automates. Sliders already exist for every input. |

Rejected: a fixed yearly amount (D2); a flag store keyed by asset id (D1); a board vote on the rule (D7);
quarterly payments (a year is the game's step); letting the rule borrow (D4).

## 4. Design

### 4.1 The rule and its maths (all pure)

```
profit = year's Statement.net (menus: last year's, b.last?.net ?? 0)
floor  = max( round(keep / 12 x runningCosts(b)),  boardExists ? reserveDollars(b, boardView) : 0 )
cash   = payoutCash(a, b)
spare  = max(0, cash - floor)
basis  = mode === 'profit' ? max(0, profit) : spare
pay    = round(min(pct x basis, spare))          // under 1 means nothing is paid
```

When `pay < 1`, the reason is the first that fits: profit mode and `profit <= 0`, "It made no profit."; cash
cannot leave because of debt, "Its loans come first."; investors' preference holds the cash, "Investors are paid
back first."; `spare <= 0`, "Its cash is at the floor."; anything else (a bank's capital, unreleased-game
money), "It has no spare cash."

### 4.2 The year step

`autoDividendYear(g, a, b, s)` returns `null` (nothing to do) when there is no valid rule, the company is a group
member, the player's stake is under 0.0001, or `last.year >= s.year`. Otherwise it quotes. With `pay >= 1` it calls
`payOut` (cash out, owner's part to taxable income, relatives paid, a listed price falls by `pay / sharesOut`,
value re-marked), stores `last = { year: s.year, paid, mine, perShare }` on the rule, and returns the amounts: the
owner's part, relatives' part, the rest (outside shareholders and executives, who are not modelled as cash), the
income-tax estimate at the margin (`gameIncomeTax(T) - gameIncomeTax(T - mine)` with `T` the year's taxable income so
far) and, for a listed company, the per-share amount. Without enough to pay it returns the reason.

### 4.3 When the player is not the one running it

- **Hired CEO.** The rule runs before `hiredCeoTurn`, so the CEO plans on the cash left. While a rule is set,
  `payoutTurn` returns at once, so a Cash mandate cannot pay on top. Without a rule nothing changes.
- **Board.** With outside owners, a listing or a group seat, the floor includes the board's reserve, so the payout
  never passes the line that would need a vote. Whether or not the player controls the board, the rule opens no
  vote and records none. A board that turned down a larger dividend earlier changes nothing here.
- **Prison, a young heir, the player away.** The rule is not a menu action, so `manageBlock` does not stop it.
  Income goes to the character as any dividend would. Setting or changing it needs `manageBlock` to be clear.
- **Inheritance.** The rule stays with the company; the heir sees it on the screen and can turn it off.

### 4.4 Listed companies and the Stocks screen

- A listed company pays through the same `payOut` as a manual dividend: `sharePrice` falls by `pay / sharesOut`,
  `valuation = price x sharesOut`, so market cap, `capTier` and the Stocks row move with it. The player's part
  is `pay x share`; the float's part is `pay x outsideFloat`, reported in the popup as "other shareholders".
- Value is conserved before tax: stake value falls by the player's part, cash rises by it. A Stocks buy just before
  year end raises `share`, but it pays at least the fundamental plus 3% and the price falls by the payout, so
  buying to collect a dividend loses money to the premium and the tax. A test pins it.
- `ipoPrice` and the buy and sell rules are unchanged. The year key `equityYearKey` is not touched: a dividend is
  not an ownership move.
- The company screen in Stocks adds "Last dividend: $0.42 a share for 2026, 0.9% of the price." when the rule has a
  last payment with a per-share amount. Groups show nothing.

### 4.5 The menu

Money, `Yearly Dividend`. Hidden for a group member. Subtitle: "Off. Pay yourself by hand, or set a yearly rule."
or "30% of each year's profit, keeping 3 months of costs." (or "of spare cash each year"). Inside: one info row for
the last payment, one for the board's reserve when a board exists, one for a hired CEO ("Your rule replaces the
CEO's own payouts."), then four actions: `Share of Profit` (slider 5-100%), `Share of Spare Cash` (slider 5-100%),
`Cash to Keep` (slider 0-24 months; disabled until a rule exists) and `Turn Off`. Every slider has a live preview
from the same quote the year step uses: what it would pay now, the player's part, what stays in the company, or
the single reason it would pay nothing. Exact copy is in the plan.

## 5. Data model

`BizState.dividend?: DividendPolicy`:

```ts
interface DividendPolicy { mode: 'profit' | 'cash'; pct: number; keep: number; last?: { year: number; paid: number; mine: number; perShare: number } }
```

- Optional on `BizState`; `BIZ_VERSION` stays 2. Written only by the menu and by the year step.
- Validated on load: `normalizeBiz` spreads the result of `readDividend(d.dividend)` (one line in `state.ts`). The
  reader returns `null` unless the input is a plain object with `mode` exactly `'profit'` or `'cash'`; `pct` is
  clamped to 0.05-1 and rounded to 0.01 (default 0.3); `keep` to 0-24 and rounded (default 3); `last` is kept only
  with an integer year in 1800-2300 and finite, non-negative `paid`, `mine` (at most `paid` plus 1) and `perShare`;
  unknown keys are dropped. It never throws and never mutates its input.
- Every reader goes through `readDividend(b.dividend)`, because `bizOf` does not re-normalize a current record.
- State is plain JSON: numbers and one two-value string, nothing else.

## 6. Determinism

No quote, floor, reason, preview or menu row reads or advances `g.rng`. The year step uses no `g.rng` either: it only
moves money the booked year already produced. The popup id is `div-<generation>-<year>` (like the market-event
notices at `yearly.ts:440`) so a reload cannot show it twice and it takes no `g.nextId`. Menus render from a
deep-frozen state. A game with no rule changes nothing: the year step returns at once, and the existing seeded
business suites must pass unchanged.

## 7. Saves and old saves

Everything added is optional. A save without `dividend` behaves exactly as today. A damaged value reads as "no rule".
A save written by this build and opened by an older one loses the field on load (that whitelist) and nothing else.
Companies joining a group keep a dormant rule that resumes if they leave; the menu shows it then.
Time Machine snapshots and heirs carry it as part of the asset.

## 8. Interactions

- **Stocks listing (shipped).** Section 4.4. The row's price, tier and `capTier` follow the payout; `own-trade.ts` is
  untouched; the new line lives in `own-listing-menu.ts`.
- **Share classes (planned Phase 2).** Dividends stay on the economics fraction `b.share`, which Phase 2 keeps
  (listing spec 5.1). A per-class premium would go inside `payOut` only.
- **Heavy R&D (in progress).** No code coupling. Both read `b.cash`: R&D is paid up front and needs `rdReserve` left,
  and the default floor is the same three months. A player saving for a breakthrough raises Cash to Keep. Shared
  files: `state.ts` (field, import, one whitelist line) and `manage.ts` (one import, one push), as separate hunks.
- **Financial advisor (next feature).** The rule is a plain record and the quote is pure, so an advisor can set it
  through `withPolicy` without new plumbing.
- **Hedge funds, family, wills.** Relatives are paid the existing way; a late holder's slice follows
  `settleLateFamilyOwners`, which runs first in the year.

## 9. Tests

- `dividend-policy`: the reader (valid, hostile, clamps, bad `last`, no mutation), `withPolicy`, the `normalizeBiz`
  whitelist and round trip, an old record with no field.
- `dividend-year`: floor (own, board, larger wins); quote in both modes; each reason; debt, preference and
  unreleased-game cash; conservation of every dollar (company, owner, relatives, rest); listed price and value;
  tax estimate; once per fiscal year; purity and frozen state; `payOut` equals the old manual math.
- `dividend-wiring`: through `yearlyBusinessImpl`: pay and tax, one bundled popup, skip lines, hired CEO (one
  payout only), board (no vote, never past the line), group member, prison, hostile rule, nothing gained when unset.
- `dividend-menu`: renders from a frozen state, ids, runs write the rule, bounds, disabled reasons, previews finite
  and pure, hidden for a group member.
- Stocks line in `own-listing-menu.test.ts`. A story test across a listing, a rule, a Stocks buy, a year and a sale.

## 10. Out of scope (later)

A fixed dollar amount a year; dividend tax rates, credits and withholding by country; a rule for groups and for
divisions; carrying an unpaid amount forward; special dividends; a board vote above its line; quarterly payments;
buybacks as a payout; per-class premiums; yield and history on Stocks rows; ex-dividend dates; a CEO letter line;
the advisor that sets it; and fixing `payoutTurn` so a hired CEO's dividends also reach relatives.

## 11. Risks

- Double payment with a Cash mandate: D8 and the `payoutTurn` return, pinned by a test.
- A payout stripping cash a plan needs: the floor, the board line, and the popup that names each skip.
- A hostile record in a v2 save: every read goes through `readDividend`.
- A merge conflict with Heavy R&D: single-hunk additions to two shared files, listed in the plan.
