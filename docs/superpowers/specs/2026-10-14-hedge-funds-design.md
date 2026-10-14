# Hedge funds: personal, family and company

Status: design, decisions taken by the recommended option (standing instruction from the owner).
Supersedes nothing. One phase. Last of the four features the owner queued after the Stocks listing (shipped):
automatic dividends, the financial advisor and manager, then this. Built alongside Heavy R&D (in progress).

## 1. What the owner asked for (their words)

1. "a family, personal and company hedge funds"
2. Order of work, chosen by the owner (Stocks listing spec, section 1, item 5): the Stocks listing, automatic
   dividends, the financial advisor and manager, then hedge funds.
3. Standing instructions: take the recommended option at every choice, keep scope tight, build the smallest
   version that fully delivers the ask. Later extensions are listed as out of scope.

Read as one play session: a player with a few million opens Investments, Hedge Funds, and starts a Personal fund
with $1M. It runs Long/Short, charges nothing, and after a birthday says "up 6%, market up 11%". They start a Family
fund and invite their sister, who puts in a fifth of her savings. Before a year they expect to fall they make a
Macro call. In Company Funds they pick their restaurant chain and put $2M of its idle cash to work. Each birthday
one popup lists the funds. When the player dies, a sole adult heir keeps the family fund with the sister still in
it; if the estate is split, the fund is wound up and the sister is paid first.

## 2. What exists today (read in the working tree at 412c682)

- **A hedge fund is a company.** Industry `investmentFirm`, type `hedge` (1949+, `fund-model.ts:174`), books in
  `BizState.financeFirm` (`fund-state.ts:99-145`, `readFund` `:288`). It manages clients' money and earns 2-and-20
  with a high-water mark (`fund-sim.ts:72-111`). A new firm is handed a free client book (`startingClients`,
  `fund-state.ts:159`). Client money never becomes company cash (`fund.ts:1-4`).
- **Its one own-money lever** is `coinvest`: company cash riding beside clients with no fee (`fund-sim.ts:103-110`,
  menu `fund-menu.ts:129-134`, hired CEO sets 25% of spare cash at skill 70, `fund-manager.ts:37`). So only a
  hedge-fund firm can invest its own cash in its own fund. No other company, no person and no family can.
- **The return maths is pure and keyed by market, not by firm:** `marketMove` (`fund-model.ts:60`, the home index's
  real return with shocks), `hedgeGross` (`:189`, four strategies), `financingCost` (`:203`), `alphaMean` (`:223`),
  `capacityFactor` (`:228`), `leaderSkill` (`:212`, owner or CEO skill, +8 with the Investing talent), noise from
  `fundRng` (`:42`, seeded by life, outcome tag, firm and year). `strategyOutlook` (`fund-outlook.ts:64`) gives
  honest expectations from the same formulas. `callHint` and `gutCall` (`fund-events.ts:48-61`) need only a country.
- **Investments has no hedge product.** Holdings are Assets of kind `investment`. `investmentHoldings`
  (`investments.ts:261`) skips one custom type, `npcEquity` (private company stakes, `npc-lives.ts:422`), and the
  sell, view and subtitle code branch on it (`:1145`, `:1527`, `:1537`). That is the precedent for a side account.
- **Family ownership exists only for companies and groups.** `FamilyShare {id, share}` (`family-share-state.ts:4`),
  paid by `payFamilyBusinessProceeds`, passed on by `settleLateFamilyOwners` (`dynasty-ownership.ts:125`) and
  `inheritConglomerates` (`:141`), cashed out by `cashOutFamilyHolders` (`:188`). `familyStakeHeirs` (`:21`) says who
  inherits a late relative's stake. Relatives hold no Asset records: their wealth is `Person.money`. The only
  "family fund" is the Family Giving Fund (`activities/giving-fund.ts`), a flag record that says it is not wealth.
- **Net worth and estates read `Asset.value`** (`core.ts:368`). `continueAsChild` sums asset values into the estate,
  keeps property in kind for a sole adult heir or liquidates it (`life.ts:1170-1227`, `planEstate`
  `will-estate.ts:285`), drops the rest at `n.assets = keptAssets` (`:1476`), and builds the heir's cash as
  `heirP.money + cashInherited` (`:1320`). Debt seizure and divorce remove whole assets by value
  (`finance.ts:882-905`, `love.ts:1650-1665`).
- **Company money.** `b.cash`; `payableCash` and `payoutCash` (`board-vote.ts:102-120`) hold back debt, earmarked game
  money and investors' preference; `runningCosts` and `reserveDollars` (`:123-137`). A one-off gain or cost moves
  `b.cash` and is added to `yearIncome` or `yearCosts` before `simulateYear`, so the statement counts it once.
  `bookFranchiseYear` (`franchise.ts:326`, called in `yearly.ts` next to `simulateYear`) is the template, and all three
  simulators honor the fields (`economy.ts:711-719`, `gamestudio.ts:401-409`, `deeptech-sim.ts:140`). Company cash
  loses value only when inflation passes the deposit rate (`economy.ts:723-727`); personal cash is divided by
  1 + inflation every birthday (`aging.ts`), while real assets keep their value.
- **Yearly order** (`aging.ts:41-80`): `business` (:65), `investments` (:67), `finance`. Tests splice the list.

## 3. Decisions (each is the recommended option; change here, not in the code)

| # | Decision | Why |
|---|---|---|
| D1 | The funds reuse the hedge-fund **model** (`fund-model.ts`), not the hedge-fund **firm** (`BizState`, `fund-sim`). Two pure cores are extracted so one formula serves both: `capacityOf` and `outlookOf`. | The firm earns fees on clients' money and carries staff, rent, compliance, corporate tax and a free client book. The ask is the reverse: the owner's money inside a fund. A firm per fund would also sit under Businesses. The maths is already pure, so reuse costs two small extractions and no copy. |
| D2 | The ownership layer is who holds the units: a person, a family or a company. Person and family funds are one Asset each; a company fund is a record on the company. | Net worth, estate, seizure and divorce read `Asset.value`; a company's money is already in its cash. Each owner rides a rail the game already has, so nothing new needs keeping in sync. |
| D3 | Person and family: Asset kind `investment`, `details.type` `'hedge'`, record in `details.hf`. `Asset.value` is the player's units only. `investmentHoldings` and `sellCore` skip the type, as they skip `npcEquity`. | Sell Everything, portfolio stats, the politics insider count and the advisor's managed book never see a fund. No new `AssetKind`. |
| D4 | Company: a "cash at work" sleeve. The cash stays in `b.cash`. Each fiscal year, before `simulateYear`, the result moves `b.cash` and is added to `yearIncome` (gain) or `yearCosts` (loss), as `bookFranchiseYear` does for royalties. | `valuationOf`, `payableCash`, loans, closure, sale and the cash crunch need no change. `economy.ts` and the crunch are shared with Heavy R&D. The statement and corporate tax count the result once. |
| D5 | No fee. A fund you run pays a running cost of 0.5% of assets a year and nothing else: no management fee, no performance fee, no high-water mark. Hired fund managers are out of scope. | Paying yourself a fee changes nothing. A hired manager needs offers, pay and vetting, which belong to the Money Team. Net is `(1 + gross)(1 - cost) - 1`, so a fee is one more term later. |
| D6 | Skill is the runner's. Person and family: the owner branch of `ceoSkill` (`economy.ts:231-242`) plus 8 with the Investing talent. Company: `leaderSkill(g, b)`, so a hired CEO's skill counts. Fund skill = lead x 0.62 + 6, the firm's `fundSkill` without key-staff terms. | Same scale as the firm: an edge of about -2% a year for a novice, about +1% at best. At any skill no strategy out-earns the US index drift (a test pins it); a fund trades return for smaller swings. |
| D7 | A macro call lasts one year. After the year the strategy returns to Long/Short, call flat, 1x. Macro is not allowed while the player holds a politician job. | A forgotten leveraged call must not run for decades. Officials move indexes (announcements in `special/politics.ts`), and a leveraged index bet is the insider position those rules exist to stop. |
| D8 | Tax. Person and family: gains are taxed when you take money out, through `investments.ts realize` (income, with the carried loss). Company: the result is taxed in the statement. Relatives are paid their full value, untaxed, as `cashOutFamilyHolders` does. | The same regime as the player's other investments and companies. No cheaper route. |
| D9 | Family is one pool in units. Relatives are invited one by one and put in 20% of their money, at most what your own units are worth, at the going price. Their units earn the same return. | `FamilyShare` fractions suit a fixed stake in a company. A pool people add to and take from needs units. The cap stops you playing with other people's money for free. |
| D10 | Passing on. A late holder's units go to their modelled heirs (`familyStakeHeirs`); the player's part joins the player's units. A holder is cashed out when their relationship is under 15, or they are disowned or estranged. A year of -15% or worse cools every holder by 3. When the player dies, a sole adult heir keeps the fund in kind; otherwise it is dropped and the relatives are paid first. | Reuses two existing dynasty helpers. Without the payout an estate split would delete the relatives' money. |
| D11 | One personal fund and one family fund per character, one sleeve per company. | The smallest menu that delivers "a family, personal and company hedge funds". Several funds is a list to manage. |
| D12 | Company gates: not a bank or investment firm (the firm has `coinvest`), not a division of a group (its cash is the group's), the player's stake above 0. The sleeve uses at most `payoutCash` minus the larger of 6 months of running costs and the board's reserve. No board vote. | Debt, earmarked game money, investors' preference and a bank's capital already sit inside `payoutCash`. The worst case leaves the company as liquid as the floor, so the fund alone cannot make it insolvent. |
| D13 | Gates for people: 18 or older, alive, not in prison, 1949 or later (`hedgeBlock`), home market open and investing not banned, first seed at least 5 x typical income (`typicalIncome`). | Scales with country and era. |
| D14 | All menus live in Investments › Hedge Funds, company controls included. Nothing is added to `manage.ts`. | `manage.ts` is a hot file for Heavy R&D and dividends. |

## 4. Design

### 4.1 The year
```
market = marketMove(g, country, year)          // the home index's real return, shocks included
alpha  = alphaMean(skill) x (macro ? 1 : capacityOf(nav, skill))
gross  = hedgeGross(strategy, market, alpha, quantEdge, {call, lev}, financingCost(country, year), noise)
net    = (1 + gross)(1 - 0.5%) - 1
```
`year` is the birthday's own year, the same move an index fund gets then (`marketYearOf`). `quantEdge` is
`(skill - 50) x .0003 x capacity` for Quant and 0 otherwise: the firm's algorithm edge is research a vehicle lacks.
`noise` is a seeded stream from life id, `outcomeTag`, the vehicle's id and the year, so a Time Machine jump rerolls
it like any fiscal outcome. Strategies, gates and blurbs are the firm's: Long/Short, Macro (call and 1 to 3x
leverage), Quant (`quantBlock`), Event-driven. Previews use `outlookOf`: "In an average year about +X; a bad year
could lose Y". Hedge strategies carry fixed terms that do not depend on the market (`fund-model.ts:189-200`), so in a
weak home market a fund beats the index. That is the firm's own balance, reused as is.

### 4.2 Money in, money out

| | Personal | Family | Company |
|---|---|---|---|
| Record | `Asset.details.hf` | same, plus holders | `BizState.hedge` |
| In | cash buys units at the price | same; a relative's cash buys theirs | none: a target of cash at work, still in `b.cash` |
| Out | Take Out sells units; 100% closes | same; closing pays relatives their value | set the target to 0 |
| Year | pool x (1 + net) | same | `pnl = work x net` into cash and the statement |
| Tax | `realize` on the gain at Take Out | same for you; relatives untaxed | corporate tax in the statement |
| Net worth | `Asset.value` = your units | same, your units only | nothing new: the cash already counts |
| Estate | value is in the estate | value is in the estate; kept by a sole adult heir | the company passes as it does today |

`work = min(target, spare)`, `spare = max(0, payoutCash - floor)`, `floor = max(6 months of running costs, board
reserve if a board exists)`, both read at booking time on the cash before the year's results land.

### 4.3 Where it shows, and why nothing is counted twice
Investments › Hedge Funds is a row after Crypto. The fund is also an Asset, so it appears in Assets › Investments
through `ASSET_KIND_VIEWS.investment`, which hands the screen to a provider (the pattern of `registerOwnListings`;
`investments.ts` imports nothing from `business/`). Starting a fund moves cash into units: cash falls by the seed, the
Asset rises by the seed, net worth does not change. Relatives' money is never in the player's net worth or estate.
A company fund adds no asset and no liability: the cash was company value before and still is. The Investments portfolio
total and Sell Everything leave funds out; the Hedge Funds row shows them. Seizure and divorce take a fund whole at
its value; the relatives' slices go with it (known limit, no money is created).

### 4.4 A company fund and insolvency
The sleeve is soft: if the company spends the cash during the year, less goes to work at the birthday. At most 95% of
`work` can be lost in a year (`hedgeGross` is clamped at -0.95), and `work <= payoutCash - floor`, so after the worst
year `cash - debt - earmarked >= floor`: the fund alone cannot push a company into the cash crunch. A loss lowers the
year's tax through `yearCosts`. A hired CEO, or a player who is in prison or under 18, runs the firm's autopilot terms:
Long/Short, or the best of Long/Short, Event-driven and Quant at skill 50 or more, call flat, 1x. The company's
inflation rule treats the sleeve as cash, so a real return is slightly understated in high-inflation years. A dividend
(automatic or by hand) comes out of the same cash, so the next year's work shrinks. Heavy R&D needs `rdReserve` (3
months) to start; the 6-month floor leaves it.

### 4.5 The family fund
Eligible relatives: adults with a will role other than friend, relationship 40 or more, not disowned
(`Person.data.disowned`) or estranged (`isEstranged`), money at least 5 x typical income. Candidates show the 8 closest.
At most 8 are invited; heirs can add more, to 24. Each yearly step first settles holders: the heir who is the current
character merges into the player's units (cost stepped up to value); a late holder's units go evenly to
`familyStakeHeirs` that are living contacts (no heirs: the units leave with their value, so the price is unchanged);
a holder under the leave rules is paid out. Every settle leaves the unit price untouched, so it cannot change anyone
else's value. At the player's death `continueAsChild` pays relatives out of funds the heir does not keep, before the
heir's money is built (`life.ts` after `keptAssets`), and adds one line to the inheritance text.

### 4.6 Menus
Investments › Hedge Funds: a short note (no fee, 0.5% running cost); Your Funds (Personal, Family: a start action with a
seed slider, or the fund); Company Funds (up to 20 eligible companies, largest first). A fund screen: your share and the
pool, strategy, last year against the market, Put In More, Take Out (percent slider, preview with tax; at 100% it says
it closes the fund and what relatives get), Strategy, Market Call and Leverage (macro only, with the Investing hint),
Family (relatives and candidates, family only), Close Fund (with a confirm). A company fund screen: cash at work against
spare cash, Cash at Work slider (money), Strategy, Market Call, Leverage, Stop. All text follows `docs/VOICE.md`.

## 5. Data model (every new field optional, validated on load, whitelisted in its loader)

```ts
// Asset.details: { type: 'hedge', hf: HedgeFund }   (Asset.value = your units x price)
interface HedgeFund {
  v: 1; owner: 'person' | 'family'; countryId: string; founded: number
  strategy: HedgeStrategy; call: MacroCall; lev: number          // lev 1 to 3 in halves
  nav: number; units: number; mine: number; cost: number         // pool dollars, all units, your units, your cost basis
  holders: { id: string; units: number }[]                       // relatives (family only), at most 24
  lastYear: number; last: { year: number; gross: number; net: number; market: number } | null
  marks: { y: number; r: number; m: number }[]                   // last 12
}
// BizState.hedge?: CompanyHedge
interface CompanyHedge {
  v: 1; target: number; strategy: HedgeStrategy; call: MacroCall; lev: number; total: number
  last?: { year: number; work: number; gross: number; net: number; market: number; pnl: number; why?: string }
}
```
- `readHedge(raw)` and `readCompanyHedge(raw)` (new `hedge-record.ts`, which has no runtime imports, because `state.ts`
  imports it) return null for anything that is not a plain object of the right shape and clean every field: enums to defaults,
  numbers finite and clamped (pool up to 1e15), holders de-duplicated and positive, and `units` never below
  `mine + holders`, so damage can only lower a price. They never throw and never mutate their input. Every reader goes
  through them, because `bizOf` does not re-normalize a current-version record.
- `normalizeBiz` spreads `companyHedgeField(d.hedge)` (one line in `state.ts`). `BIZ_VERSION` stays 2.
- State is plain JSON: numbers, strings and arrays of them.

## 6. Determinism
No menu row, subtitle, preview, quote or hint reads or advances `g.rng`, and neither does any action or the yearly step:
noise comes from a seeded stream, ids from `uid` (a counter), the popup id from the year (`hedge-<generation>-<year>`).
Menus render from a deep-frozen state. A game with no fund and no target returns at once, so every seeded suite is
unchanged.

## 7. Saves and old saves
Everything is optional. A save without `details.hf` or `BizState.hedge` plays as before. A damaged record reads as no
record (a damaged fund keeps its stored value in net worth and shows "The books for this fund are damaged."). A save
written by this build and opened by an older one shows the fund as a plain investment asset and loses the company
record on load. Time Machine snapshots and heirs carry both as part of the asset.

## 8. Interactions
- **Stocks listing (shipped).** None. A fund holds the index, never a company's shares, so `own-trade.ts` is untouched
  and a listed company's price follows its earnings as before.
- **Heavy R&D (in progress).** One shared file, `state.ts` (a field, an import, one whitelist line, separate hunks).
  No code coupling: R&D is paid up front from cash and the floor leaves its reserve.
- **Automatic dividends (in progress).** Shared `yearly.ts` (one call line beside `bookFranchiseYear`, separate from
  the dividend step) and docs. Both read `b.cash`; the fund books before `simulateYear`, the dividend after.
- **Advisor and manager (planned).** The manager's book is `investmentHoldings`, which excludes funds. Shared
  `investments.ts` (the advisor plan lands three hunks there; land before or after, not alongside) and `aging.ts` (one
  line each). A later Money Team can set a fund's strategy through `setFundStrategy`.
- **Share classes (planned).** None: a fund holds no company class.
- **Politics.** D7; a politician job blocks Macro, and the year reverts it to Long/Short.

## 9. Tests
`hedge-record` (readers, hostile data, whitelist), `hedge-model` (parity with the firm, bounds, determinism, no free
lunch, blocks), `hedge-fund` (start, put in, take out and tax, family, settling, double counting), `hedge-company`
(eligibility, floor, booking, insolvency, once a year), `hedge-year` (the hook, popup, cooling, heirs, estate),
`hedge-menu` (frozen render, bounds, previews, Assets), `hedge-story`. The firm, investments, estate and listing suites
must pass unchanged, and `test/fuzz-kit.ts deepFreeze` guards every menu.

## 10. Out of scope (later)
Hired fund managers with 2-and-20 and a high-water mark, vetting and crooked managers (Money Team); lock-ups and
redemption notice; several funds per owner; outside investors or fees on your own fund (that is the firm); gifting
units; naming a fund; family votes; relatives topping up; per-country fund tax; a Company › Money shortcut; funds for
groups, divisions, banks and investment firms; a sleeve sized in percent; a Macro call that lasts years; holdings other
than the home index; relatives' slices surviving seizure or divorce.

## 11. Risks
- **Counting twice.** Pinned by tests: net worth after start, invite and a year; Sell Everything; estate with and
  without a heir; a company's valuation and net worth unchanged by setting a target.
- **A sleeve that starves a company.** The floor, the board reserve and the soft sleeve; the worst-year test.
- **Relatives' money.** The invite cap, conservation tests, cooling, and the payout hook at death.
- **A free edge.** Running cost, negative alpha at average skill, one-year Macro, and the US no-free-lunch test.
- **Merge friction.** Four files are shared with other builds (`state.ts`, `yearly.ts`, `investments.ts`, `aging.ts`); each change is a few small hunks, named in the plan, and the plan says to re-read the file before editing.
