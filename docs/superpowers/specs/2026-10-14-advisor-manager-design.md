# A financial advisor and a financial manager

Status: design, decisions taken by the recommended option (standing instruction from the owner).
Supersedes nothing. One phase. Built after the Stocks listing (shipped), alongside Heavy R&D (in progress) and
after automatic dividends (planned).

## 1. What the owner asked for (their words)

1. "the ability to hire a financial advisor and financial manager"
2. Order of work, chosen by the owner (Stocks listing spec, section 1, item 5): the Stocks listing, then automatic
   dividends, then this, then hedge funds.
3. Standing instructions: take the recommended option at every choice, keep scope tight, build the smallest version
   that fully delivers the ask. Later extensions are listed as out of scope.

Read as one play session: a rich player opens Assets, Business & Investments, Money Team. They hire an advisor, who
tells them what is wrong with their money (a company sitting on idle cash, one holding that is most of their net
worth, a shares purchase that could be called insider timing). They hire a manager, set "60% stocks, keep $2M in the
bank, move at most half a year", and age up. At year end the manager keeps that mix, bills a fee, and sends one
statement. A manager with a big rating and a big fee may be worse than they claim, or a crook. The advisor can vet the
offers and may catch the crook.

## 2. What exists today (read in the working tree)

- **No staff of this kind.** Hires in the code are companies' (hired CEOs: `business/career.ts`, `board-ceo.ts`),
  family jobs (`special/corruption.ts:25-82`, `business/nepo-*.ts`), one-off fees (law firm for an appeal,
  `prison.ts:1466-1480`; a lawsuit retainer, `activities/lawsuit.ts:172-273`) and cost lines (yacht and jet crews,
  `shops/luxury-fleet.ts`). Nothing is a named person with a skill who works for the player every year. The only
  "financial advisor" is a joke choice in the insider scandal popup (`special/politics.ts:2279`, `:2320`).
- **The nearest analogue** is the rogue hired CEO (`business/board.ts:285-347`): a hidden `integrity`, a yearly
  `oversight` chance of being caught, money taken each year, 30% clawed back, fired for cause. The crooked manager
  below follows that shape with a simpler state.
- **Investments** (`investments.ts`): holdings are ordinary `Asset`s of kind `investment`. Quotes come from
  `listing(g)` (`:752`): the local index fund (`fund`), a government bond (`bond`, a new issue each year,
  `bond:<country>:<year>`), a savings account (`savings`), a term deposit, gold, a REIT, stocks, pennies, coins. Each
  quote carries `blocked`, the reason it can't be bought now (a shut exchange, banned investing, a gold ban).
  `tradeBlock` (`:955`) stops the dead, the under-18 and prisoners. `buySecurity` (`:1017`) and `sellHolding`
  (`:1192`) queue a popup and a log line on every call, and apply the broker fee, the capital-gains tax (`realize`,
  `:523`) and, for stocks, pennies and coins, price impact (`tradingDepth`, `:1125`). Index funds, bonds and savings
  have no price impact.
- **Information today.** The Investing talent's purple hints are an honest gut read of next year's moves
  (`invest/instinct.ts`, `investments.ts:239-256`). They are the game's only foresight. `talentHint`
  (`talents.ts:187`) returns '' without the talent. Orders already say when impact starts to cost (v2.6.1).
- **Politics insider rules.** `insiderPositions` (`special/politics.ts:1709-1730`) counts only three things: open
  bets and index OPTIONS, and held shares or coins whose `details.secId` is the target's. For a law, shares count
  only if bought this year or last (`freshShare`, `investments.ts:387`). Targets are the made-up companies of the
  local exchange (`stockTargets`, `computer/money-stocks.ts:92`) and, for rank 2 and up, coins (`coinTargets`, `:121`).
  An index fund, a bond or a savings account is never a target. The office is read purely by `officeView`
  (`nation/office.ts:142`): rank 1 mayor, 2 governor or legislator, 3 leader.
- **Yearly flow.** `aging.ts:41-80` runs `YEARLY_HOOKS` in order: `investments` (`:67`) prices the year, `finance`
  (`:70`) pays tax, rent and living costs, `assets` (`:76`) pays upkeep, then `crime`, `underworld`, `milestones`.
  Tests splice the hook list, so a new hook is safe.
- **Saves.** `g.flags` is free-form JSON with no key whitelist (`save-schema.ts:514`, `:532` only check it is a
  record). Each feature validates its own key (`mastery.ts:55-77` stamps a record with the character so an heir
  starts clean). Fees and gates scale with `typicalIncome` (`events/wealth-core.ts:54`).

## 3. Decisions (each is the recommended option; change here, not in the code)

| # | Decision | Why |
|---|---|---|
| D1 | Two roles with two jobs. The advisor INFORMS: no authority, no access to money, never dishonest. The manager ACTS: standing orders on a narrow part of the portfolio, can be bad or crooked. | The owner's two words map to read access and write access. Splitting them keeps each small and makes "trust" a real choice only where money moves. |
| D2 | The advisor never forecasts. It reads the present: six facts computed from the state. | The Investing talent's hints are the only foresight in the game. Selling them for a fee would hollow the talent and give a risk-free edge. |
| D3 | Advice shows as plain info rows with a 💼, not as purple hints. `MenuBase.hint` stays talent-only. | Purple means "your talent says so" (ARCHITECTURE, talents). Mixing the two would blur what is a gut read and what is an audit. |
| D4 | Advisor skill is coverage. It shows the top `n` of the findings (n = 2 to 5) and says "Sees 3 of 5." | Better advisors see more, none lie. Always honest, never risk-free. |
| D5 | The manager runs three buckets: stock funds (the local index fund), government bonds, savings accounts. Mandate: share in stocks (0 to 100 in fives), cash to keep (dollars), yearly limit (10 to 100%). Safe money goes to the bond when it pays more than savings, else savings. | That is "rebalance to a stated mix, keep a cash reserve, with a cap on what they may do", in three controls. Gold (2% spread each way), REITs, single stocks, pennies, coins and term deposits (early-withdrawal penalty) are left out. |
| D6 | The legal rule is structural. The manager buys only what the player could buy by hand (the quote's `blocked`, `tradeBlock`, `investingBlocked`), and never a single stock, penny, coin or one of the player's companies. | `insiderPositions` counts only company and coin ids, bets and index options, so the manager cannot create an insider position, with no new politics code. The player is never a suspect through an agent they didn't choose. |
| D7 | The advisor warns about the player's own picks: a made-up listed company (or, at rank 2+, a coin) held with units bought in the last two years while in an office that can move it. | Same targets and same window as the insider rule, so the warning is exact. The manager never sells these; the decision stays the player's. |
| D8 | Manager skill buys execution quality, not market returns: trading slippage `(100-skill) x 0.005%` of the money moved, a drift band `3 + (100-skill)/10` points, and a yearly blunder chance `12% x (100-skill)/100`. A blunder aims the year's target 25 points off and says so. | Returns stay exogenous. Real costs, real tax and real drift are what a weak manager adds. Next year's normal pass corrects a blunder. |
| D9 | The cap is the limit: the most of the money they run (buys plus sells) that may change hands in a year. It also caps theft. | One dial for convenience against exposure. A wide limit deploys cash faster and lets a crook take more. |
| D10 | 12% of manager offers are crooked. They pad the yearly bill by `3% x limit x pool` (cut to the cash left after the agreed fee), and the claimed rating is 12 to 25 points above their real skill. Every year a crook has padded a bill, there is a catch chance of `4% + 50% x advisor skill`. Caught: 30% of all padding comes back and they are let go. The statement shows the billed amount and the pool, so a careful player can compare it with the agreed rate. | The board's rogue-CEO shape (`board.ts:285-347`), simpler state. Trust is a real risk, a good advisor reduces it, nothing is certain. |
| D11 | Hiring: three offers per role per year, deterministic from life, year and a per-role counter. Names are shown, the true rating only through a vetting line the advisor gives for a stable chance of `skill`%. Gates: net worth 25 x typical income for an advisor, a managed pool of 10 x for a manager. | No dice in menus. Gates scale with the country and the era, so a small account can't buy a family office. |
| D12 | Fees: advisor 0.15% to 0.40% of net worth by skill, manager 0.4% to 1.4% of the money they run by CLAIMED rating, each with a floor of 0.1 x typical income. Charged at year end from cash. If cash can't cover it the hire leaves. | Fees follow wealth at every scale, up to trillions. A claimed rating is what a crook can inflate, so a great rating is not proof and the fee follows the claim. |
| D13 | State is one owner-stamped record, `g.flags['fin.team']`. No new `Person`, no new `Asset`, no relationship row. The manager's trades are ordinary holdings the player can sell any day. | One source of truth. A mirror account would double count in net worth and estates (the Stocks listing spec, D1). |
| D14 | One yearly hook, `advisors`, after `underworld` and before `milestones`: fees first, then the manager's trades, then the review, all after rent, tax and upkeep are paid. One popup and one log line a year. | Cash is real by then, so the reserve protects living costs. One popup for the whole team, like milestones and CEO letters. |
| D15 | The engine gets a seam, not a copy: a `quiet` flag on `buySecurity` and `sellHolding`, plus `managedBook` and `managedOrder` in `investments.ts`. | The manager must not rebuild fees, tax and blocks. Eight trades must not queue eight popups. |
| D16 | Company finance is advice only: one finding about idle company cash, with a pointer to Pay a Dividend. The standing dividend rule belongs to the automatic-dividends feature. | Two payers on one company would double-pay. The advisor sets nothing; the player does. |

## 4. Design

### 4.1 The Money Team menu
Assets, Business & Investments gets `Money Team` (💼), shown to an adult out of prison. Two blocks.
- **Financial Advisor.** Hired: name, rating, retainer, the shown findings, `Sees n of m.`, `Let Go`. Not hired: the
  gate's reason, or `Meet Advisors` with three offers (name, rating, yearly fee, `Hire`).
- **Financial Manager.** Hired: name, rating, agreed rate, last statement, then three sliders (`Stocks Share`, `Cash to
  Keep`, `Yearly Limit`) with live previews, and `Let Go`. Not hired: reason or `Meet Managers` with three offers. With
  an advisor, each offer gets a vetting line under it.

### 4.2 The six findings (all pure, none forecast)
`insider` (95): described in D7. `loan` (70): a loan at 3+ points over the savings rate while cash covers it.
`concentration` (60 to 100): one company or holding is 40%+ of net worth. `company-cash` (50): a company's payable
cash (after loans) is two years of typical income or more above 18 months of its costs, with your share of it.
`idle-cash` (40): cash is 10 x typical income and a tenth of net worth (hidden while a manager is hired). `losses`
(30): carried investment losses worth a year of income, which shelter that much gain. Sorted by weight, then id. The
advisor shows the top `n`.

### 4.3 The yearly step (`yearlyAdvisors`)
Returns at once with no record, a dead, minor or imprisoned player, or `done === g.year`. Otherwise:
1. Advisor retainer by `spend`; if it fails the advisor leaves (log line).
2. Manager: if the book is idle (`investingBlocked`) nothing happens. Else the invoice (fee, plus padding if crooked,
   cut to the cash on hand) by `spend`; a failure lets them go. Then blunder (one `chance`), the plan (`planYear`), sells then buys through
   `managedOrder`, never taking cash under the reserve, then slippage on the money moved.
3. Catch roll, only after a padded bill (D10).
4. Review: findings for the advisor's `n`. Statement popup (the top two findings, the manager's line) and one log line.

### 4.4 The plan (`planYear`, pure)
Pool = fund + bonds + savings + cash above the reserve. Target stocks = pool x share (0 if the fund is blocked, 1 if no
safe bucket is open). Step one invests spare cash into the deficits in proportion. Step two sells an overweight bucket
only when it is past the drift band, and buys the other with the proceeds. Buys plus sells never pass
`limit x pool`. Orders under the broker minimum, or under half a percent of the pool, are dropped.

## 5. Data model

`g.flags['fin.team']` is optional JSON, read only through `readTeam(g)`:

```ts
interface Hire { name: string; skill: number; since: number }
interface ManagerHire extends Hire { claimed: number; honest: boolean; rate: number; skimmed: number }
interface Mandate { stocks: number; reserve: number; limit: number }
interface Statement { year: number; pool: number; billed: number; moved: number; costs: number; stocks: number }
interface Team { owner: string; advisorEpoch?: number; managerEpoch?: number; done?: number
  advisor?: Hire; manager?: ManagerHire; mandate?: Mandate; last?: Statement }
```

- `owner` is `${character.id}:${g.year - age}`; a record for another character reads as no record. Heirs start clean.
- `readTeam` returns null unless the value is a plain object with the right owner. Names are strings of 1 to 40
  characters, skills 20 to 99, years 1800 to 2300, `rate` 0.002 to 0.03, `skimmed` finite and 0 to 1e15, `stocks` an
  integer 0 to 100, `limit` 10 to 100, `reserve` finite and 0 to 1e15 rounded, `honest` true unless exactly false,
  epochs and `done` integers. A manager without a mandate gets the default. Unknown keys are dropped. It never
  throws and never mutates its input. Every reader and writer goes through it, which is the whitelist.
- Nothing is added to `Asset.details`, `BizState`, `Character` or the save schema.

## 6. Determinism

No menu row, subtitle, preview, offer, vetting line or finding reads or advances `g.rng`. Offers hash
`lifeId|fin|role|year|epoch|slot` through `nextRandom` (the pattern of `special/common.ts stableRoll`). Only the yearly
step draws from `g.rng`, and only when a manager is hired: one `chance` for the blunder, one for its direction, one
for the catch. A game with no record returns before any draw, so every seeded suite is unchanged. `managedBook` is
pure, and menus must render from a deep-frozen state.

## 7. Saves and old saves

All new state is the one optional flag. An old save has no record and plays as before. A damaged record reads as no
record. A save written by this build and opened by an older one keeps an unused flag. Time Machine snapshots carry
the flag. A different character (an heir, a new life) sees a record stamped for someone else and ignores it.

## 8. Interactions

- **Stocks listing (shipped).** The player's listed company is not an investment, so the manager cannot buy or sell
  it, and `managedBook` never sees it. The advisor counts its value in `concentration` and in net worth.
- **Heavy R&D (in progress).** No shared files. `company-cash` uses `payoutCash` and `runningCosts`
  (`business/board-vote.ts`, read only) and keeps 18 months, which leaves room to start a breakthrough. It does not
  yet subtract the cost of a pending one.
- **Automatic dividends (planned).** Not coupled. The finding names Pay a Dividend; the rule stays the player's.
- **Share classes (planned).** `concentration` groups holdings by `details.secId` and becomes `companyKey(secId)` when
  that lands (one line in `review.ts`). The manager's three types are never class lines.
- **Hedge funds (planned).** `investments.ts` gets three hunks here (two signatures and one appended section); land
  before or after their tasks, not alongside.
- **Politics.** D6 and D7. The "Blame your financial advisor" choice stays a joke.

## 9. Tests

`advisors-engine` (quiet flag, `managedBook`, `managedOrder`), `advisors-mandate` (planner cases, caps, properties),
`advisors-team` (reader, hostile data, offers, fees, gates, vetting, hire and release), `advisors-review` (each
finding, skill coverage, insider window), `advisors-year` (fees, trades, one popup, holdings only in the three types,
unpaid fee, blunder, crook and catch, no-record draws nothing, prison, heirs), `advisors-menu` (frozen render, sliders,
previews, actions), `advisors-story` (an office holder with a manager has no insider case). The Phase 1 and
investment suites must pass unchanged.

## 10. Out of scope (later)

Gold, REIT, single-stock, coin and option mandates; managing the Stocks row or the player's companies; a manager that
sets the dividend rule; tax-loss harvesting; negotiating fees; several managers; forecasts of any kind; a lawsuit or
arrest of a crooked manager; the advisor blamed in a scandal; staff as `Person`s with relationships; inherited staff;
a manager that acts from prison; advice inside other menus (order previews); subtracting a pending Heavy R&D cost in
`company-cash`; family offices and hedge funds.

## 11. Risks

- **A manager that feels pointless.** It is a convenience and a discipline tool, priced at about a percent. The menu
  says "Neither picks winners" so nobody expects alpha.
- **Cash below living costs.** The hook runs after rent, tax and upkeep, buys never go under the reserve, and the
  invoice is paid before the trades.
- **Popup spam.** Quiet orders, one statement a year.
- **A hostile record.** Every read goes through `readTeam`; a test feeds junk for every field.
- **Old saves and merges.** `aging.ts` and `menus.ts` get one line each; `investments.ts` gets three small hunks.
