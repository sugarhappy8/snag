# Share classes (Stocks, Phase 2): founder shares, non-voting floats, and classes on real exchanges

Status: design, decisions taken by the recommended option (standing instruction from the owner).
Replaces section 5 of `2026-10-14-own-listing-and-share-classes-design.md`, which this spec checked against the code
Phase 1 built. Plan: `docs/superpowers/plans/2026-10-14-share-classes-phase2.md`.

## 1. What the owner asked for (their words)

1. "add types of shares like B class and whatnot in the whole game including players company" (listing spec,
   section 1, item 4).
2. Order of work, chosen by the owner: Stocks and share classes first, then automatic dividends, a financial
   advisor and manager, and hedge funds.
3. Standing instructions: take the recommended option at every choice, keep scope tight, build the smallest version
   that fully delivers the ask, list the rest as out of scope.

Read as one play session:

- The player takes a company public, or opens Capital & Ownership, and picks founder shares (A/B), a non-voting
  float, or one class. The row says what it does to their votes, the price the market pays and their seat on the board.
- In Investments > Stocks their company shows its classes and "Votes: you hold 63.8% of the votes with 15.0% of the shares".
- Control follows votes: board seats, being fired as CEO, "you'd lose control" warnings.
- On the exchange, companies that really had classes show them in the years they had them (Alphabet's Class C from
  2014, Berkshire's Class B from 1996, Volkswagen's preference shares), and the listed ones can be bought.

## 2. The Phase 1 sketch, checked against the built code

| Sketch said | The built code shows | So |
|---|---|---|
| Every control question goes through `controlsWith` / `ownerControls`. | True, and both end in one function. `ownerControls` (`board.ts:70`) reads `controlsBoard(boardView(...))` (`board-state.ts:327`), which counts seats; `controlsWith` (`own-trade.ts:60`) calls `seatPlan` directly. The stake becomes seats at `owner = Math.round(b.share * size)` and the 5% floor (`board-state.ts:305-306`). The owner-CEO is fired only when `controlsBoard` is false (`board.ts:370`). | One edit in `seatPlan` makes every board decision, firing rule, vote hint and Phase 1 preview follow votes. `controlsWith` keeps its behavior; its rule moves next to `seatPlan` as `controlsFor` so the new menu module can ask it without an import cycle. |
| `ownerVotes` also goes into `executive.ts`, `group-services.ts`, `succession-review.ts`, `conglomerate-management.ts`, `yearly.ts`, `bank-events.ts`. | Wrong list. The group files compare `grp.core.share` (a group has no classes: `group-services.ts:40,52,130`, `executive.ts:64,144`, `conglomerate-management.ts:88`). `succession-review.ts:41,58` and `bank-events.ts:502` mean "own most of it"; `yearly.ts:332,368` and `bank-events.ts:147,284` mean "enough left to sell a slice": economics. `nation/graft.ts:140,193`, `nation/drama.ts:284` and `underworld.ts:110` ask who profits. | Only `seatPlan` means control. The two prose sites that restate the 50% rule are `exit.ts:211` ("Under half...") and `own-listing-menu.ts:152` ("At 50% or more..."). A source-scan test pins the rest (4.2). |
| `BizState.classes?: ShareClass[]` with per-class `econ`, `holder`, `listed`. | Too heavy. About 20 places in 12 files write `b.share` (`bank-events.ts:240`, `rescue.ts:71`, `exit.ts:179,247`, `executive.ts:67`, `yearly.ts:335`...). Per-class fractions would drift at the first writer that forgets one. | One record `{ kind, hi }` that is safe when a writer ignores it (D3). |
| One Stocks row per listed class; shocks, bets and insider cases key on `companyKey`. | Half right. Rows: the list is one row per slot, and tests count them (`investments.test.ts:119-120`, `stocks-real.test.ts:557,590`, `own-listing-menu.test.ts:100`). Keys: `isRealSecId` (`engine.ts:570`) and `breakthroughStockFactor` (`shocks.ts:122`) parse the id with a regex anchored at the end, so an id with a suffix would look made-up (`shockable`, `shocks.ts:232`) and miss invention repricing. Insider: `insiderPositions` compares `details.secId` (`politics.ts:1728`), but announcements and laws never name a real company (`stockTargets`, `money-stocks.ts:92`; `policyTargets` skips `def.real`, `politics.ts:1820`), and classes exist only on real companies. Bets name slot lines only (`listedTargets`, `money-stocks.ts:97`). | Extra lines live inside the company's screen, not the list. A `companyKey` fixes the regexes and closes the insider gap before it can open. |
| Holdings keep today's `secId`; extra classes get an index. | A holding whose id is not the slot's current id is cashed out as "delisted" (`pathMove`, `investments.ts:2017-2024`). | Class holdings need their own yearly move (D10), not just a new id. |
| "Shell A/B until 2022". | Equal votes, different tax residence. Not a class in the voting sense. | Out of scope with other dual listings. |

## 3. Decisions (each is the recommended option; change here, not in the code)

| # | Decision | Why |
|---|---|---|
| D1 | Votes are derived; economics stay one pool. `ownerVotes(b)` (new `business/share-classes.ts`) is read by `seatPlan` and nothing else decides control. `b.share` still means "the owner's part of the equity". | One choke point (section 2). Dividends, tax, stake value, the Phase 1 buy and sell all stay on economics. |
| D2 | Two structures for the player's company, one record: `BizState.classes = { kind: 'ab' \| 'nv', hi }`. `ab`: the founders' Class B carries 10 votes a share, the public's Class A carries 1. `nv`: the founders' shares carry 1, the public's carry none. No record means one class. | The two structures the listing spec named. No third class, no preferred class (`b.pref` still converts at the IPO), no second listed class for a player. |
| D3 | `hi` is the part of the whole company the owner holds in the founders' class. It is clamped to `share` when read, scaled by `diluteBusinessEquity`, scaled up by a buyback, and clamped when `sellShares` sells. Relatives hold the founders' class; executives and the float hold the ordinary one. | A writer that adds shares and never heard of classes (a Stocks buy, Buy Out Investors, the hedge fund and advisor work to come) adds ordinary shares, which is the true and safe answer. A ratio instead of `hi` would turn those shares into 10-vote shares. |
| D4 | Classes take effect only while a standalone company is listed. A private company's record is the plan for its IPO. Groups, divisions and a company coming out of a group have none (`detach` deletes it). | Before the IPO there is no float to hold the other class. Groups list as one and stay out of scope. |
| D5 | One choice, shown in two places: a "Share Classes" submenu of three rows (One Class of Shares, Founder Class (A/B), Non-Voting Float) under Capital & Ownership and beside Go Public (IPO). Private: sets the plan, free, any time. Listed: a board vote, once a year. | `MenuInput` has no choice kind (`types.ts:725`); rows are how `rescue.ts` already offers three kinds. The vote is a new `'recap'` proposal with a priced merit (-1.0, -1.3, +0.3), handled like `'merge'` (`board-vote.ts:317`). It has its own kind because a turned-down proposal blocks its kind for the year, and Buy Out Investors and Put In More Money share `'merge'` (`rescue.ts:48`). A founder who already controls the board passes it; one who doesn't mostly fails. |
| D6 | Fewer votes cost money: the market pays 4% less for `ab` and 7% less for `nv`, for as long as it is listed. It scales the pre-money value at the IPO (`goPublic`, `ipoPreview`) and the fundamental in `updateSharePrice` (`economy.ts:936`). A recap of a listed company moves the price once by the difference. | A free choice would always win. One factor, one line in the yearly price step, no new valuation model. |
| D7 | The Stocks row stays one row per company. Its screen adds a classes line and a votes line, and the control line reads votes. The Buy action buys the listed class and says whether those shares vote. | Row-per-class is only needed when a company lists two classes, which a player cannot. |
| D8 | Real companies: a curated table (`invest/class-data.ts`, 22 companies in the first batch, each entered from a checked public source) of classes by year: label, votes a share, listed or not, who holds it, first and last year. Facts show on the company's Stocks screen. A listed extra class is a tradable second line on that screen (14 in the first batch). | Facts alone would leave "buy a Class B" out. Second lines are the last two tasks so they can be cut without touching the rest. |
| D9 | The id of an extra line is `<company id>~<letter>`. `companyKey(secId)` strips the suffix. It is used by `isRealSecId`, `breakthroughStockFactor`, `shockable`, the news part of `shockFactor`, `addMarketShock` (news causes), `insiderPositions` and the shock pruning check. Order flow stays on the line (each line has its own book). | Fixes the end-anchored regexes in one place. Existing ids have no suffix, so existing behavior is byte for byte the same. |
| D10 | A line's price is its company's price times `1 + spread`, the spread set by its votes against the main line's: none -4%, limited -2%, more +3%. No new random draw. Unit sizes (one Berkshire A is 1,500 B) are not modeled: a line trades near its company's price. When the company ends the line ends with it on the same terms; when the line's last year passes, holders are cashed out as "delisted" at the last price. | Lines split, merge and end with their company by construction. No second price path to keep in step. |
| D11 | Dividends are equal per share across classes. | Dividends stay on `b.share`. A per-class premium is listed as later. |

## 4. Design

### 4.1 The voting maths (pure, `share-classes.ts`)

```
mine   = min(hi, share)                      founders' class, owner
loMine = share - mine
fam    = sum of familyShares                 founders' class
exec   = executiveEquity(b)                  ordinary class
out    = max(0, 1 - share - fam - exec)      ordinary class
total  = whi * (mine + fam) + wlo * (loMine + exec + out)
votes  = (whi * mine + wlo * loMine) / total        (ab: whi 10, wlo 1; nv: whi 1, wlo 0)
```

`ownerVotes(b)` is `b.share` unless the company is public, stands alone, has shares, and `readClasses(b.classes)` is
valid. It never returns NaN: a zero `total` falls back to `share`. Examples, no relatives or executives: 25% float
with `ab` leaves the owner 75% of the shares and 96.8% of the votes; an owner at 15% of the shares holds 63.8% of the
votes under `ab` (an 11-seat board gives them 7) and 100% under `nv`.

### 4.2 Where control reads votes

`seatPlan` uses `votes = ownerVotes(b)` for `owner = Math.round(votes * size)` and the 5% seat floor. Board size still
follows economics (`outside = 1 - b.share`): a widely held company has a bigger board. The scan
`\.share\b[^;{}]{0,12}(>=|>|<=|<)\s*0?\.5[01]?\b` over `src/game` finds 15 sites in 10 files today. 14 are
economics or group economics (section 2); one is `exit.ts:211`, which becomes votes-aware.
`test/control-sites.test.ts` pins the list per file, so a new comparison fails until someone classifies it.
`own-listing-menu.ts:152` states the rule in prose and is rewritten with the screen.
`ipoPreview`'s sentence becomes "You'd keep X of the shares and Y of the votes" when a plan exists, and keeps its
exact old text when none does.

### 4.3 The player's company

- **IPO.** `goPublic` reads the plan, scales the pre-money value by `1 - CLASS_DISCOUNT[kind]`, then sets
  `hi = share` (everything the owner holds converts to the founders' class). The float is the other class. The IPO
  notice adds the votes. `ipoPreview` uses the same factor, so preview and result agree.
- **Capital & Ownership.** Listed: `changeClasses(g, id, kind)` runs the board vote, spends the year key
  `classes.<id>`, sets `classes` (`hi = share` for `ab` and `nv`, record deleted for one class), moves `sharePrice`
  by `(1 - d_new) / (1 - d_old)`, re-marks `valuation`, and re-seats the board with `syncSeats`. A recap converts the
  owner's whole stake, as an IPO does. Private: sets or clears the plan.
- **Stocks.** `OwnListing` gains `votes` and `classKind`. The screen shows a classes line, a votes line, and control
  in votes. A buy adds ordinary shares (D3); its preview says "These shares carry no vote." for `nv` and shows the
  votes after the buy. `controlsWith` still spreads `{ ...b, share }` into `seatPlan`, so a hypothetical
  bigger stake with the same `hi` is exactly "the new shares are ordinary".
- **Hired CEOs, estates, heirs.** The record lives on the company's details. An heir who takes the shares takes the
  votes. Nothing in the estate code reads it.

### 4.4 Real companies

- Data: for each registry company an entry `{ co, main: { label, votes }, rows: [{ letter, label, votes, listed,
  holder?, note?, from, to? }] }`. The first batch is Alphabet, Meta, Berkshire, Ford, Rogers, Shopify, Volkswagen, BMW,
  Porsche, Henkel, Richemont, Ericsson, Volvo, H&M, Electrolux, Maersk, Kone, Samsung Electronics, Hyundai Motor,
  Tata Motors, Xiaomi and Meituan. A row that cannot be sourced when it is entered is
  dropped, not guessed. A test checks that every entry names a registry company and that every year falls inside
  that company's trading years.
- Screen: one "Share classes" line per company, built from the rows open in the current year ("Share classes: Class A
  (this line) has 1 vote a share. Class B has 10 votes a share, held by the founders. Class C has no vote and is
  listed too."). A tradable line adds a section: price and change, "You own $X of this", Buy, Sell.
- Engine: `listing()` attaches `lines` to a company's quote; `holdingQuote`, `buySecurity` and `revalueHoldings` look
  lines up; `pathMove` derives a line holding's move from its company's `SecYear`; `pruneShocks` and `eventNews`
  use `companyKey`. Lines are not in `allQuotes`, so `investmentListing`, the row counts and the ticker-unique
  tests are untouched. A line's ticker is its company's four letters plus the class letter (five letters), which no
  four-letter ticker can equal.

## 5. Data model (every new saved field optional, validated on load, whitelisted)

- `BizState.classes?: { kind: 'ab' | 'nv'; hi: number }`. `readClasses(v)` returns `null` unless `v` is a plain object
  with `kind` exactly `'ab'` or `'nv'`; `hi` is clamped to 0-1 (missing or not finite: 0, the safe side). It never
  throws and never mutates. `normalizeBiz` spreads its result. Every reader calls it on `b.classes`, because `bizOf`
  does not re-normalize a current-version record (the same rule as `ticker`).
- `BIZ_VERSION` stays 2. No other field. Investment holdings keep their shape: a line holding differs only by its
  `secId` suffix and a `classOf` and `classLabel` detail. Real-company data is code, not save data.
- State stays plain JSON: one string and one number.

## 6. Determinism

`ownerVotes`, `seatPlan`, `classOption`, previews, the screen lines, `companyKey`, line quotes and line moves read no
`g.rng`. Only `changeClasses` on a listed company draws, through the board vote, as every board vote does.
Menus render from a deep-frozen state. A line holding's move comes from its company's `SecYear` and a fixed spread, so
the same seed gives the same game with or without lines being looked at.

## 7. Saves and old saves

A save without `classes` behaves exactly as today (`ownerVotes` returns `share`, `classFactor` is 1, the golden test
compares `seatPlan` over a grid). A damaged value reads as one class. A save written by this build and opened by an
older one drops `classes` on load and nothing else; its company then has one class. An old save holding Alphabet
keeps its slot id and is untouched. A save holding a line whose data later disappears cashes out as "delisted" at the
last price, like any unknown id today.

## 8. Interactions

- **Stocks listing (shipped).** The row, tiers, tickers, `buyLimit`, `sellNote` and the year keys are unchanged.
  `own-listing.ts`, `own-listing-menu.ts` and `own-trade.ts` gain only the votes lines and the buy preview sentence.
- **Heavy R&D (in progress).** No code coupling. Shared files: `state.ts` (one field, one whitelist line, three lines in
  `diluteBusinessEquity`), `manage.ts` (one push beside Go Public), `economy.ts` (one line in `updateSharePrice`).
  The hunks are far from the product and R&D regions.
- **Automatic dividends (planned).** Stays on `b.share`. Shared files: `state.ts`, `manage.ts`, `own-listing-menu.ts`
  and its test, `docs/RELEASE-v2.8.0.md`. Separate hunks.
- **Financial advisor, hedge funds (planned).** A Stocks buy by an agent adds ordinary shares without code (D3). Any
  agent that groups holdings by company must use `companyKey`: the advisor spec already plans that one line. The advisor
  and hedge-fund work both touch `investments.ts`: Tasks 5 to 7 should land before them or after, not alongside.
- **Politics.** Insider cases stay on made-up companies. `insiderPositions` is made class-safe so a future bullish
  move on a real company cannot be traded through a non-voting line.

## 9. Tests

`share-classes` (maths, hostile values, no mutation, golden `seatPlan` for one class); `control-sites` (source scan);
`share-classes-ipo` (price factor, preview equals result, `hi` set, `detach` clears); `share-classes-capital`
(vote, year key, price move, seats, blocked reasons, a refused recap leaves `'merge'` open); `share-classes-menu` (rows, previews, frozen
state); `own-listing-menu` (votes and classes lines); `class-data` (registry, years, letters unique); `company-key`
(identity for old ids, suffix cases, news against order flow); `class-lines` (buy, hold, year move, split, company
ends, line ends, rename, shock pruning, portfolio net worth); one story test across IPO, a Stocks buy, a recap, a
year and a sale.

## 10. Risks, most dangerous first

1. **A missed control site.** Today's answer is one function; a later change that tests `share` against 0.5 will
   quietly deny or grant control. The source-scan test makes the next one fail until it is classified.
2. **Bookkeeping drift in `hi`.** The three writers that need care are `diluteBusinessEquity`, buyback and
   `sellShares`; everything else is safe by default (D3). A property test runs random share writes and asserts
   `ownerVotes` stays in 0-1, that buying from the float never lowers it, and that it never rises more than the same
   purchase made in the founders' class would raise it.
3. **Line holdings sold as "delisted".** The yearly move is where a wrong id silently cashes out a player's position.
   Task 7 tests a line through a split, the company's end, the line's end and a reload.
4. **Shocks that split a company.** If news prices one line and not the other, the two drift apart for good. D9 keys
   news on the company; a test compares line and company across a ban, a contract and an invention repricing.
5. **Entrenchment balance.** `nv` with a tiny stake keeps all the votes. Counterweights exist (D6 factor, the
   independents' veto on blatant self-dealing, minority suits that grow with `1 - share`). A cap on the vote lead is
   the knob if play shows it.
6. **Row counts and tickers.** Avoided by keeping lines out of the list and out of `allQuotes`.

## 11. Out of scope (later)

Loyalty and double voting (LVMH, L'Oréal), A/H dual listings, dual-listed pairs (Shell A/B, Unilever), golden
shares, sunset clauses, executive options, a class premium on dividends, a third class or preferred class for players,
listing a second class of your own company, classes at founding, classes on groups and divisions, bets and options on
a second line, a standing governance effect beyond the 4% and 7% factors, takeover bids that count votes, and index
membership rules.
