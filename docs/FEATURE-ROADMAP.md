# AnotherLife Feature Roadmap

Updated 17 October 2026. This roadmap starts from the systems already in the repository; it does
not propose second copies of working features. It prioritizes choices that create different life
stories, remain understandable in the UI and preserve the game's core rule: money, ownership and
risk must be accounted for rather than invented.

## Product direction

The next major goal is to make delegation, finance and the living world feel personal. A player
should be able to hire somebody for a reason, understand what that person decided, see how the
economy affected the result and decide whether to intervene. The simulation should be deep enough
to reward judgment without requiring the player to operate a spreadsheet every birthday.

Four rules apply to every phase:

1. No perfect foresight. NPCs may use public history, skills and honest forecasts, never the next
   seeded market result or hidden startup quality.
2. No free money. Client assets, deposits, fund commitments, company cash and personal cash stay
   separate. Every fee, loss, tax, transfer and distribution books exactly once.
3. Old saves remain playable. New state is optional, normalized on read and bounded in size.
4. Important outcomes are explainable. A result should name the decision, market effect and human
   contribution that caused it.

## Current baseline

AnotherLife already has historical markets and shocks, personal securities, four investment-firm
models, banks, companies, products and R&D, boards and shareholder votes, CEO delegation,
conglomerates, inheritance, independent NPC careers and finances, property management, creative
careers, crime, politics, education and health. New work should extend those systems.

The finance-leadership foundation in this change delivers the first roadmap slice:

- bank and investment-firm CEO candidates have a visible specialty, approach, risk appetite and
  prior-career record;
- the relevant résumé changes effective leadership modestly, while salary and base skill still
  matter;
- asset- and hedge-fund CEOs follow the existing Growth, Balanced, Profit or Cash mandate;
- hedge-fund strategy, leverage, fees and company co-investment respond to the mandate, the CEO's
  profile, compliance and drawdown;
- operational fund controls become read-only while a CEO is in charge, avoiding settings that
  appear to save but are silently overwritten;
- finance CEOs write an annual decision letter, and all choices remain free of future market data.

## Prioritized delivery plan

| Priority | Workstream | Player outcome | Size | Depends on |
| --- | --- | --- | --- | --- |
| P0 | Finance leadership foundation | Hiring a finance CEO is informed, distinct and transparent | Complete | Existing CEO, board and fund systems |
| P1 | Investment Management 3.0 | Funds have teams, investors, liquidity pressure and believable failure states | Large | P0 |
| P1 | Personal adviser and family office | Wealthy characters can delegate personal portfolios without creating guaranteed returns | Medium | P0, personal investments |
| P1 | Decision ledger and explainability | Players can see why wealth, profit, AUM and reputation changed | Medium | Existing annual reports |
| P2 | Economic transmission 2.0 | Rates, currencies, trade and historic events reach households and firms consistently | Large | World2, market events |
| P2 | Careers and organizations 2.0 | Jobs have projects, colleagues, politics and transferable reputations | Large | Careers, CV, NPC lives |
| P2 | Family and social agency | Relatives make consequential requests and independent long-term choices | Medium | NPC lives, wealth events |
| P3 | Property and private markets | Development, commercial property and private deals form one coherent capital cycle | Large | Landlord, development, business finance |
| P3 | Politics and public institutions | Policy choices have budgets, coalitions, implementation delays and measurable effects | Large | Politics, World2 |
| P3 | Creator and sports ecosystems | Careers have teams, contracts, rights, seasons and durable catalogues | Large | Existing special careers |
| P4 | Modding, accessibility and performance | More content can be added safely and the game remains usable on mobile | Medium | Stable state schemas |

## P1 — Investment Management 3.0

### 1. Fund leadership and teams

- Separate the corporate CEO from the investment lead when the firm is large enough. The owner may
  remain CEO and hire a Chief Investment Officer, or hire a CEO who appoints one.
- Give Portfolio Manager, Research, Client Relations and Compliance staff distinct effects already
  compatible with `leadershipPower`: idea quality, capacity, fundraising, operating loss and
  regulatory risk.
- Add candidate interview questions and references. References reveal a range for record and
  integrity; they do not reveal future returns.
- Add compensation choices: salary, a bounded profit bonus and optional vested equity. Performance
  pay uses multi-year results and a high-water mark so one lucky year is not paid forever.
- Add poaching, retirement and succession. A promoted internal candidate retains their actual
  tenure and specialty; an emergency interim is cheaper and weaker.

Acceptance: two equally skilled candidates with different relevant experience produce measurably
different but overlapping long-run results; no candidate description promises a return; dismissals
pay the existing severance and return vested shares through current governance rules.

### 2. Multiple products for asset managers

- Let an asset manager launch up to a bounded number of funds: index, value, growth, global and
  bonds. Each has its own AUM, fee, benchmark, launch year and track record.
- Split clients into retail, institutional and pension channels. Channels differ in fee tolerance,
  patience and minimum compliance expectations; they remain aggregate, not millions of NPC rows.
- Add fund closure and merger. A tiny or persistently bad fund can be merged into another strategy
  with a reputation cost rather than living forever.
- Add share classes only where useful: retail and institutional fees, not a full legal prospectus
  simulator.

Acceptance: total AUM equals the sum of product books, fees are charged once, merged/closed funds
cannot continue earning fees and the UI stays usable with the maximum product count.

### 3. Hedge-fund risk and liquidity

- Add investor lockups, a notice period and aggregate redemption queues. Gates protect liquidity
  temporarily but damage reputation; they never erase an investor claim.
- Add a prime-broker relationship with borrowing cost, margin requirement and counterparty limit.
  Leverage becomes constrained by collateral rather than only a slider.
- Add short borrow cost and crowded-trade risk at an abstract strategy level. Do not expose real
  instructions for manipulating markets.
- Add drawdown controls: reduce gross exposure, pause new risk, replace a manager or continue under
  the mandate. Margin calls sell positions and realize losses; company cash cannot silently replace
  client money.
- Add side pockets for genuinely illiquid event positions, with strict limits, fees and reputation
  consequences. They delay realization; they do not hide a loss.
- Add orderly fund closure after catastrophic drawdown, prolonged redemptions or regulatory action.
  The management company may survive and later raise a new fund if it remains solvent.

Acceptance: a 3× fund can fail from an adverse market move and financing cost; a 1× long/short fund
cannot receive the same margin call; redemptions, gates and liquidation conserve client assets.

### 4. Investor communication and governance

- Turn the annual CEO letter into a compact attribution report: market beta, security/strategy
  selection, fees, flows, operating losses and company co-investment.
- Add an investor-relations inbox for one or two material requests a year: lower fees, transparency,
  liquidity or a key-person clause.
- Give outside shareholders and fund investors separate rights. Company shareholders vote on the
  management company; fund clients redeem or negotiate fund terms but do not own company cash.
- Add compliance reviews based on era and country. A strong Compliance Officer prevents problems;
  a weak culture makes current rogue-trader and fraud events more likely to escalate.

## P1 — Personal adviser and family office

This is a separate personal service, not another investment firm and not a magic auto-invest
button.

- Characters above a configurable liquid-net-worth threshold can interview a financial adviser.
  Candidates show qualifications appropriate to country and era, fee model, risk approach,
  integrity and a noisy historic record.
- The player sets a mandate: Preserve, Balanced, Growth or Income; exclusions; a cash reserve; and
  a maximum allocation to any one asset class.
- The adviser may rebalance once per birthday using only securities available in that country and
  year. They pay transaction costs and tax through the existing personal investment engine.
- Advice-only service suggests trades for approval. Discretionary service executes within the
  mandate and costs more. Neither can trade during a prison/access restriction that already blocks
  the player unless a valid power-of-attorney rule is deliberately added.
- At very high wealth, a family office adds a tax accountant, estate coordinator and philanthropy
  administrator. It coordinates existing wills, family funds and companies; it cannot evade tax or
  bypass boards.
- Mis-selling, conflicts, churn and theft are possible but bounded by custody and regulation.
  Statements reconcile opening assets + deposits + return - withdrawals - fees - tax.

Acceptance: delegated portfolios match their mandate over many seeds without systematically
beating the market; adviser fees and taxes reduce personal money exactly once; firing an adviser
leaves every owned security with the player.

## P1 — Decision ledger and explainability

- Add a yearly “What changed?” ledger for personal net worth and each company: opening value,
  earnings, spending, market movement, transfers, tax and closing value.
- Add attribution rows to finance reports. For a hedge fund: market exposure, manager edge/noise,
  algorithm edge, financing, fees, flows and operating loss. For banks: spread, defaults,
  withdrawals, products and capital.
- Store only bounded annual summaries. Do not store every simulated trade.
- Add candidate comparison cards with effective fit, pay, severance impact and mandate alignment.
- Add a warning before hiring when the candidate is a poor specialty match or the contract would
  leave less than one year of operating reserve.

Acceptance: every large one-year cash or AUM movement can be reconciled from visible rows within
rounding tolerance; opening menus never mutate state or consume RNG.

## P2 — Economic transmission 2.0

### Currency, rates and credit

- Add country currencies and a yearly FX index derived from inflation, rates and historic shocks.
  Display everything in the player's chosen display currency while retaining the asset's native
  currency for gains and debt.
- Reprice variable-rate mortgages, company debt and bank funding when policy rates change; preserve
  fixed-rate contracts.
- Add refinancing with fees, underwriting and term extension rather than an instant rate reset.
- Feed credit conditions into job creation, company borrowing, property demand and startup funding.

### Trade and supply chains

- Extend existing critical-input inventories into two or three supplier regions for large firms.
  Diversification costs more but limits event exposure.
- Add tariffs, shipping constraints and currency effects to imported inputs and exported demand.
- Let executives sign bounded multi-year supply contracts with price/volume terms; contracts cannot
  create goods or exceed capacity.

### Historical events

- Expand the event catalogue by country, sector and period, with a clear separation between facts
  (dated public events) and seeded alternate outcomes.
- Each event declares channels—demand, costs, rates, credit, confidence, trade or regulation—so the
  same impact is not counted twice.
- Add a timeline screen that explains active effects and the industries exposed to them.

Acceptance: deterministic replay produces the same world; Time Machine branches reroll only the
documented alternate outcomes; event impacts decay and cannot remain active forever.

## P2 — Careers, organizations and family agency

### Careers and workplaces

- Add small annual workplace teams with a manager, mentor, rival and key colleague rather than a
  full employee population.
- Add projects for finance, technology, public service, medicine, law, engineering and media. A
  project affects performance, CV evidence and relationships; salary remains the normal pay.
- Add internal applications, lateral moves and negotiated offers using the existing CV and
  interview systems.
- Add professional reputation by field and country, separate from fame.

### Family and social decisions

- Give adult relatives explicit goals such as education, home ownership, entrepreneurship,
  caregiving or migration. Requests should follow their own finances and history.
- Add co-signed loans, family partnerships and documented gifts. Each creates a real claim,
  ownership share or transfer.
- Add family meetings for a will, succession and care plan. Agreement affects relationships but
  does not override legal ownership already recorded by the game.
- Improve NPC memory: major help, broken promises, business dismissals and inheritance disputes
  should influence later asks and cooperation.

Acceptance: NPCs can decline, fund part of a plan or pursue it independently; their money never
teleports to the player; family state stays bounded across multi-generation saves.

## P3 — Longer-horizon systems

### Property and private markets

- Unify residential, commercial and development cash-flow statements.
- Add property partnerships with explicit shares, capital calls and sale proceeds.
- Add private-company minority investments using the current share/preference model and a bounded
  annual deal list.
- Add due diligence ranges and integration costs to acquisitions; avoid a second valuation engine.

### Politics and public institutions

- Give major policies a budget, legislative/coalition support, implementation time and measured
  effects on World2 indicators.
- Add civil-service capacity and corruption risk as constraints rather than immediate outcomes.
- Add central-bank independence and emergency powers appropriate to country and era.
- Keep fictional abuse abstract and consequence-heavy; do not turn corruption into operational
  real-world instructions.

### Creative and sports ecosystems

- Add agents/managers with commission, skill, specialty and conflicts.
- Add contracts, rights ownership and recoupment consistently across music, writing, film and
  games.
- Add seasons, injuries, transfers and coaching relationships to sports while keeping the annual
  turn fast.

## P4 — Platform, content and accessibility

- Split the largest bundle by major screen or career while preserving offline play.
- Add schema-level save diagnostics and a user-facing recovery report for damaged optional state.
- Add keyboard navigation, reduced motion, scalable text, color-independent status markers and
  screen-reader labels to every menu and minigame.
- Add data validation scripts for era gates, countries, names, products, jobs and historical events.
- Define a versioned content-pack format for data-only events and careers. Code mods remain outside
  the save compatibility promise until a stable API exists.
- Add simulation benchmarks for 10, 50 and 200 owned companies plus a 150-year dynasty.

## Recommended implementation sequence

1. Finish P0 regressions and ship the finance-leadership change.
2. Build the decision ledger before adding more fund complexity; it becomes the debugging and
   player-explanation layer for every later feature.
3. Add hedge liquidity/margin and asset-manager products behind the existing `FundState` reader.
4. Add the personal adviser by reusing finance profiles and the personal investment engine, never
   the company client book.
5. Extend economic transmission one channel at a time—rates, FX, then trade—with invariant tests
   before adding more historical content.
6. Layer career and family agency on the stable economic reports.
7. Take on P3 systems only after save size and annual-turn performance budgets pass.

## Definition of done for every feature

- A design note identifies the canonical owner of state and the money-conservation equation.
- Era, country, age, ownership, prison and governance gates are enforced in actions, not only UI.
- Menus and previews are pure and do not consume RNG.
- The same fiscal year cannot settle twice.
- New arrays have a documented bound and old/malformed saves normalize safely.
- Unit tests cover the core math; integration tests use the real yearly loop; at least one long-run
  invariant checks finite numbers and conservation across countries/eras.
- `npm run typecheck`, focused tests, the full test suite, `npm run build` and `git diff --check`
  pass before merge.
- README/release notes explain the player-visible behavior without promising real-world financial
  outcomes.
