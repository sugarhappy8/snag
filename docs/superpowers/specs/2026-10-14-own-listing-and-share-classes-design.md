# Your listed company in Investments › Stocks, and share classes

Status: design, decisions taken by the recommended option (standing instruction from the owner).
Supersedes nothing. Built in two phases: Phase 1 ships first, Phase 2 gets its own plan after it.

## 1. What the owner asked for (their words, in order)

1. "If I IPO my company I want to see it in the real stock market: when I press Investments and then Stocks,
   as a mega cap or small or middle."
2. Answers given: the player can **buy and sell** their own company from that Stocks row, not just see it.
   Size tiers are **fixed, in today's money**: Mega >= 200B, Large 10B to 200B, Mid 2B to 10B, Small < 2B
   (US dollars; game money is constant 2026 dollars, so no inflation step).
3. "If I buy my shares from Investments › Stocks then my shares of the company go up."
4. "Add types of shares like B class and whatnot in the whole game, including the player's company."
5. Order of work, chosen by the owner: this project first (Stocks listing and share classes together), then
   automatic dividends, financial advisor and manager, and family/personal/company hedge funds (each its own
   spec). Those three are out of scope here, but the model below must not block them.

## 2. Evidence this design stands on (read at the released commit ef126cc)

- The player's stake in a company is ONE fraction, `BizState.share` (state.ts:212). The rest of the equity is
  `executiveEquity`, `familyShares[]` and an implied outside remainder `1 - share - exec - sum(family)`
  that is recomputed, never stored (rescue.ts:22). A listed company has `sharesOut`, `sharePrice`,
  `valuation = round(sharePrice x sharesOut)` (exit.ts:186), `exchange` (a bare code) and `ipoYear`.
- Net worth sums cached `Asset.value` (core.ts:368-372). A business Asset's value is `stakeValue(b)`.
  Any second Asset on the same shares would be counted twice, liquidated twice in an estate (life.ts:1215)
  and swept by "Sell Everything" (investments.ts:1700-1712).
- Control is derived from `share` through board seats (`seatPlan`, board-state.ts:298-319); many other places
  test `share` against 0.2, 0.5, 0.51, 0.999.
- Today's ways to trade your own listed stake: Exit › Sell Shares (`sellShares`, exit.ts:231; 2 a year, no board
  vote, flat capital-gains tax on `invested`, price impact in company-fraction units with `retailDepth`
  0.8-1.25) and Capital & Ownership › secondary/subscribe/buyback (`transactEquity`, rescue.ts:20; one a year,
  up to min(15%, outside float), price `max(valuation, valuationOf) x 1.03`, needs board control).
- The Stocks screen (investments.ts:1535-1573) is built from `listing(g)` for the character's RESIDENT
  exchange. Rows are `Quote`s keyed by an engine `secId`; `size`/`rank` come from the registry (real
  companies carry recorded Mega/Large/Mid classes; every made-up filler is "Small-cap" under the heading
  "Smaller companies"). `investments.ts` imports nothing from `business/`.
- The engine has no shares outstanding, market cap or votes. There is no share-class concept anywhere
  (no class letters, votes per share, ticker suffixes). 425 real companies are registered in five files; about
  25 of them are multi-class in real life (Alphabet, Meta, Berkshire, Ford, VW, BMW, Samsung, Ericsson, Roche,
  Tata, Naspers and others) and the data records none of it.

## 3. Decisions (each is the recommended option; change here, not in the code)

| # | Decision | Why |
|---|---|---|
| D1 | The Stocks row is a **view and trade door over the business**. Buying or selling changes `BizState.share` (and cash, `invested`, price) through business-module functions. There is NO `investment` Asset for the own company. | One source of truth. A mirror Asset double counts net worth, estates and Sell Everything, and is orphaned by every exit (sale, bankruptcy, group merge, divorce). All four readers agree. |
| D2 | The row is **not a `Quote`**. It is its own node built by a new provider registered into `investments.ts` (no business import in the engine file). | `Quote` assumes an engine `secId`, shocks, order flow and yearly cash-out of unknown ids (a stock without a slot becomes a "delisted" sale next year). |
| D3 | **Sell** = the existing `sellShares` (same 2-a-year key, same tax, same sell-out hand-off through `leaveListedCompany`, which cashes relatives out once). **Buy** = a new `buyOwnShares` in the same module family as `transactEquity`, sharing its limits: outside float only, at most min(15% of the company, outside float) per year, one buy per company per year. It needs **no board control** and holds no board vote: it is a market purchase from the public float. Buy Out Investors in Capital & Ownership is unchanged (it still needs control and a board vote, rescue.ts:33 and :44). | Reuses the existing guards (relatives, caps, year key) and keeps the two doors from becoming a wash-trade or unlimited-accumulation loophole. No control gate, because buying from the float is how a founder who holds under half after the IPO wins control back. |
| D4 | **Buy price** = `max(sharePrice, valuationOf/sharesOut) x 1.03` plus impact from `buyImpact(fraction, retailDepth(price))`. The buy does **not** write the impact into `b.sharePrice`; the player pays the average price and the quote stays where the market had it. | Stops self-pumping (a buy that lifted `sharePrice` would mark the existing stake up at once, and `b.valuation` feeds offers, loans, sale price and board votes) and stops buying cheap after your own sale. A round trip loses the 3% premium, the price impact on the way out and the capital-gains tax. |
| D5 | Price impact for own trades stays in **company-fraction units** (`saleImpact`/`buyImpact` with `retailDepth`), not the engine's flat 500M dollars. Sells keep today's behaviour (price falls, mean-reverts through the yearly blend). | Size-aware by construction; a 200B mega-cap must not trade like a 500M book. Keeps `exit.ts` untouched. |
| D6 | **Tax and fees**: the business route. Sells use `capitalGainsTax` on `b.invested`; buys add the cash paid to `b.invested` (as `rescue.ts:54` does). No brokerage fee. Own-share trades do not count toward `investTrades`/`moneyInvested`. | Same shares, same regime as the existing paths: no choosing the cheaper tax route. |
| D7 | **Tier** = `b.valuation` (price x all shares) for a standalone listed company, fixed thresholds from the owner, inclusive at the lower bound (>= 200B is Mega). Pure function `capTier(valuation)`. No hysteresis. The label is exact ("Mega-cap"), and the row carries a "Yours" mark. | The owner chose fixed dollars. Market cap, not price, because share counts are founder-chosen (1k to 10B). |
| D8 | **Placement**: the row sits at the top of its tier's section in the Stocks list of the exchange it is listed on (`exchangeInfo(b.countryId).key`, never the bare code). Companies listed on a different exchange than the one shown get a "Your listed companies" block at the top of Stocks with the exchange named. If the exchange has no size headings, the block form is used. | Codes repeat across countries; the player may live elsewhere than the company's home exchange (nothing reassigns `b.countryId` when they move). |
| D9 | **Ticker**: generated once at the IPO, stored as `BizState.ticker` (added to `normalizeBiz`'s whitelist), 4 letters, unique against every registry and filler ticker on that exchange, deterministic from the company id (no RNG). Old saves derive it on first read. | No ticker exists on `BizState`; tests require unique tickers (investments.test.ts:223). |
| D10 | **Groups**: a listed group (conglomerate) gets a **view-only** row (group market cap, your group stake `grp.core.share`, its exchange, tier, "trade it from the group's menu"). Divisions are never shown (`public` is false). | Groups have a derived price and different sale mechanics (`sellGroupShares`); trading them is a later step. |
| D11 | **Lifecycle**: selling out removes the company exactly as today (`leaveListedCompany`), so the row disappears; the sell confirmation says so. Buys cannot take the float to zero (they stop at the outside float, leaving at least 1% outside). | A listed company with no outsiders breaks the board model; there is no take-private rule. |
| D12 | **Not restricted**: no lock-ups, blackout windows or insider-trading rules for owners in this release (the existing price floor in D4 removes the cheap edge from knowing the fundamentals). Listed as future work. | YAGNI; flagged as a known open game-design area. |
| D13 | Determinism: tier, rows, previews and quotes are pure (no RNG). Only the trade actions may use `g.rng`, and only where today's paths already do. | Menus are rebuilt many times per render; seeded runs must not shift. |

## 4. Phase 1 design: the listing and trading

### 4.1 Units
- `src/game/business/own-listing.ts` (new, no UI): `capTier(valuation): 'mega'|'large'|'mid'|'small'`,
  `TIER_LABEL`, `ownListings(g): OwnListing[]` (standalone public companies the player owns a stake in, plus
  listed groups, each with name, ticker, exchange key and code, price, market cap, tier, stake %, stake value,
  outside float, ipoYear), `ownTickerFor(b, takenTickers)`, `buyQuote(g, a, b, dollars)` (pure preview),
  `buyOwnShares(g, a, b, dollars): boolean`, `buyLimit(g, a, b)` (reason string or null).
- `investments.ts` gains one hook, `registerOwnListings(provider)`, and in `stocksMenu.children` merges the
  provider's rows into the tier sections (D8). No other engine function changes.
- `BizState.ticker?: string` (normalizeBiz, bizOf/readBiz round trip). `Quote.ret` ("this year") is not shown for
  the own row (no price history is stored); the row shows dividend yield 0 unless a dividend was paid.

### 4.2 The row and its screen
Row: `🏢 <name> (<TICKER>)  ·  <price>  ·  <tier>  ·  yours <n>%`. Screen: market cap and tier, price and
change since the IPO, your stake (shares = `share x sharesOut`, percentage, value), outside float, relatives'
and executives' slices, exchange and IPO year, a Buy action and a Sell action (D3), a note on control
("Above 50% you control the board") and the fixed cost of acting (tax, premium). Buy and Sell use the existing
number-input node. A buy shows its preview (price, average price after impact, new stake %, control effect)
before it runs; both previews are pure.

### 4.3 Buy rules
- Allowed when: the company is public and standalone, the character can trade (`tradeBlock`: age, prison), the
  exchange is open, no buy this year for this company, cash is enough. Board control is not needed at any stake
  (D3): the buy is a market purchase from the float, with no board vote.
- Amount: at most `min(0.15, outside)` of the company, leaving 1% outside. Dollars are converted to a
  fraction at the D4 price. A buy updates `b.share`, `b.invested += paid`, `sharesOut` unchanged, the float
  shrinks, `syncSeats`, the year-action key (shared with `transactEquity` 'secondary' so the two doors cannot
  both be used in one year). A buy that takes the stake over 50% says in its preview that it gives you control
  of the board; a buy never loses control.
- Relatives, executives and the CEO's slice are untouched; `normalizeBiz`'s cap `owner + exec + family <= 1`
  can never be hit because the buy is capped at the outside float.

### 4.4 Sell rules
Delegated to `sellShares` unchanged. The Stocks screen adds the "this removes the company" warning when the
sale would take the stake under 0.5%.

### 4.5 Not touched
Net worth, estates, Sell Everything, dividends (still `payDividend` on `b.share`), IPO maths, the yearly price
step, the Exit/Capital menus (they stay; the Stocks row is a second door to the same code).
Insider rules for a founder who is also a politician: the own company is not an `insiderPositions` target and
is not a valid announcement target in this release (D12), so it cannot be used to launder the new timing rule.

## 5. Phase 2 design: share classes

Built after Phase 1, on the same ownership model. Two stages.

### 5.1 The model (class-ready from Phase 1)
- Economics stay one pool of fractions that sums to 1. Votes become a second, derived quantity:
  `votes(holder) = sum over classes (holder's fraction of the class x class vote weight) / total votes`.
- A company has 1 to 3 classes: `common` (weight 1), optional `B` (weight 10, "founder", unlisted, held by the
  owner and family), optional `nonvoting` (weight 0). Single class (every company today and every old save)
  means `votes == share`, so nothing changes until a class is created.
- `BizState.classes?: ShareClass[]` (`{id, label, votes, econ, listed, holder}`), whitelisted in `normalizeBiz`.
  The owner's voting power is never stored; one function, `ownerVotes(b)`, derives it and is used by `seatPlan`, `controlsBoard`,
  `ownerControls` and the places where a `share` threshold really means control (executive.ts, group-services.ts,
  succession-review.ts, conglomerate-management.ts, yearly.ts, bank-events.ts, listed in the map). Thresholds that
  mean "owns all of it" (>= 0.999) keep using economics.
- Minimum viable class set for the player's company: **A/B founder-voting** (owner keeps 10-vote B, public floats
  1-vote A) and **non-voting float** (public floats a 0-vote class). Preferred stock keeps the scalar `pref`
  for investors and gets an explicit conversion at the IPO (no new preferred class for players in this release).

### 5.2 Player's company
- Chosen at founding next to the share-count slider and changeable at the IPO preview (what you float, which
  class), plus a later recapitalisation action behind a board vote. IPO maths (`ipoPlan`) floats a chosen
  class; `retailAppeal` uses that class's price.
- Dividends: per-share equal across classes by default; the non-voting float may carry a premium (the real
  pattern at Korean and German issuers).
- Stocks: a company with a listed class shows one row per listed class (same company, class label in the ticker
  such as `ACMEA`/`ACMEB`), one tier (computed from total market cap). Buying a class raises `share` by the
  fraction and `votes` by the class weight.
- Control: with a 10-vote B, a 25% float of 1-vote A leaves the owner in control at about 15% of the economics.
  `seatPlan` allots owner seats by `votes`, not `share`; independents on listed boards are unchanged.

### 5.3 Exchange companies
- Curated, data-driven: a `classes` field on the registry rows of the ~25 flagged companies, with per-year
  availability (Alphabet C from 2014, Shell A/B until 2022, Tata DVR until 2024), and a second tradable line per
  extra listed class.
- Identity: classes share the company's draw (price = company price x class ratio), differ by a deterministic
  spread, and move together through splits, acquisition and bankruptcy. The first/common class keeps today's
  exact `secId` (old holdings never turn into forced "delisted" sales); extra classes get a class index,
  and shocks, bets and insider cases key on a new `companyKey` so every class of one company counts as the same
  security (politics.ts:1710, money-stocks.ts:516, shocks.ts:279).
- Tickers: a style that cannot reuse a real symbol (the engine derives tickers on purpose): the common line
  keeps the derived 4-letter ticker, extra lines append a class letter.
- Capacity: the exchange slot cap (36, US 40) must not drop companies (stocks-real.test.ts:116-123); extra class
  lines are attached to their company's slot, not new slots.

### 5.4 Phase 2 stays out of: executive options, golden shares, dual listings (A/H shares), loyalty voting.

## 6. Saves and compatibility
Everything added is optional and whitelisted: `BizState.ticker`, `classes`. A save without them behaves exactly as
today (single class, ticker derived). Old holdings keep their `secId`. No change to `Asset.details` of
investments in Phase 1. Tests for hostile and old data live next to the feature.

## 7. Tests
Phase 1: `capTier` boundaries (inclusive thresholds, huge and tiny values, NaN); ticker uniqueness and
determinism across seeds and exchanges; rows appear for a listed company, in the right tier, on the right
exchange, and in the "other exchange" block; not for private companies, divisions, or sold-out ones; view-only
group row; buy: limits (float, 15%, once a year, minors/prison), no board control needed (allowed below 50%; a
buy across 50% gives control and its preview says so), price (>= fundamental x 1.03),
conservation (cash paid == `invested` increase), net worth does not jump, no double counting, `b.sharePrice`
unchanged; sell: delegated behaviour and the sell-out hand-off; shared year key with `secondary`; previews are
pure (state JSON and RNG unchanged); old save without `ticker`; engine tests that count Stocks rows still pass
for characters without a listed company.
Phase 2: voting math, control with 10-vote B, `seatPlan` by votes, IPO of a class, dividends per class, old saves,
dual-class registry rows per year, `companyKey` insider/shock keying, ticker uniqueness, slot cap.

## 8. Risks and how they are contained
- Control flips on a buy across 50%: allowed on purpose (D3); previewed and warned ("This gives you control of
  the board."), and capped by the D3 limits (15% a year, 1% left outside, one ownership move a year).
- Self-pumping and wash trades: D4 (no impact written on buys, buy floor at fundamental x 1.03, shared year key).
- Wrong or missing exchange: key from `exchangeInfo(b.countryId)`; the "other exchange" block (D8).
- Hidden coupling to `b.share` thresholds in Phase 2: one `ownerVotes` function and a reviewed list of call sites,
  each marked "economics" or "control".
- Test churn: new rows are only added when the player has a listed company.
