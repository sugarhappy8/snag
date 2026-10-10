# Living world overhaul

## Assessment of the existing game

The repository already contains extensive playable systems. This is an integration overhaul,
not a replacement of its text interface or a second implementation of those systems.

| System | Existing depth | Main weakness to address |
| --- | --- | --- |
| Life, generations, history | Seeded yearly hooks, national eras, inheritance, wills, time travel | Most world changes disappear or are regenerated outside the historical timeline |
| Careers and education | CV screening, qualifications, job matching, promotions, clubs, courses, workplace schedules | Future layoffs/hiring do not consistently share the business cycle; repeated effort has little cumulative opportunity cost |
| Businesses | 51 industries, price elasticity, production, staff, competition, expansion, acquisitions, insolvency, boards and conglomerates | National demand, finance, property and stock cycles can disagree; company success rarely feeds back into the wider economy |
| Banking and investments | Credit scoring, amortizing loans, repossession, deposit insurance, trading costs, liquidity, bank and investment-firm businesses | Rates mostly use fixed country profiles; no practical household refinancing strategy; future debt inflation differs from cash inflation |
| Housing | Mortgage choices, property upkeep, rental screening, leases, maintenance, managers and arrears | Property appreciation is a separate random draw, poorly connected to credit and employment |
| Research and inventions | Topic study, personal budgets, guaranteed invention, patents, assignment, factories, pricing, licensing, security | Research is largely waiting after payment; commercial fit and adoption need consequences beyond initial demand |
| Relationships and family | NPC life cycles, marriage, children, friendship, estrangement, requests, jobs and succession | Work pressure and financial resilience need clearer effects on everyday family life |
| Health and lifestyle | Disease, treatment, coverage, addiction, rehab, diet, exercise, luxury and useful staff | Long-term work/study trade-offs are fragmented; recovery competes poorly with repeating beneficial actions |
| Crime, prison and corruption | Detection, trials, sentences, criminal careers, escape, underworld accounting and laundering | Opportunity and enforcement scarcely respond to the economic world |
| Government | Elections, issues, bills, public approval and market interventions | Many laws change popularity with no durable budget, employment or public-service consequences |
| Creative and special careers | Authorship/comics, games and engines, music, acting, sport, politics, military and space | Strong specialist loops should be retained and connected through household time, finances and demand |
| Interface and persistence | Contextual menus, sliders, annual reports, JSON saves, snapshots, replay guards | More depth must be explained in existing decisions, with detail optional and popup volume limited |

## Game contract

The goal remains a self-directed life and family legacy. Players choose how to spend money,
time and influence, advance one year, and respond to the consequences. Death ends a life;
inheritance can continue the world. Insolvency, unemployment and failed commercialization
are recoverable setbacks, not automatic game-over conditions.

The interface remains the existing browser text game. The annual cadence is retained. Shared
country and industry aggregates update once per year; no per-citizen transaction simulation,
new runtime dependency or compulsory economic spreadsheet is needed.

## Implementation order

1. Persist a bounded, deterministic national economy, industry supply network and world history.
2. Connect the same conditions to lending, employment, business costs/demand, housing and markets.
3. Add actionable fixed/variable refinancing, credit recovery and financial explanations.
4. Make research choices affect cost, reliability, market fit and adoption without deleting
   the player's previously requested guarantee that funded research yields an invention.
5. Connect household priorities, health, learning, relationships, NPC employment and public policy.
6. Verify causal relationships, money conservation, deterministic replay, migration, generations,
   long runs and actual browser play. Explain remaining abstraction honestly.

## Architecture and timing

`game/economy/` owns world state, causal yearly transitions, industry mapping and concise
explanations. Country profiles and historical series remain baseline data. New world state lives
in `flags.worldEconomy`, survives inheritance and is included in ordinary saves/time travel.
Reads do not consume RNG or create state. Annual transitions use the family seed and timeline.

Fiscal business plans settle for their existing fiscal year. Their realized employment,
investment, failures and deployed inventions feed the following economic transition. This lag
avoids circular settlement or company iteration order changing the same year's prices.

Money remains constant-dollar purchasing power internally. Historical denominations and
inflation remain authoritative. Future simulated inflation adjusts both cash/debt and the nominal
display consistently; a currency redenomination never awards money. World-level bookkeeping is
aggregate, not a claim of a closed, penny-perfect national accounts model. Actual player and
company transfers must still balance.

## v1.10 foundation verification and scope

This section records the earlier release baseline. World Simulation 2.0 below supersedes
its supply, cohort, competitor, public-finance and performance limitations.

Implemented in v1.10.0:

- A persistent economy in every country with eleven connected industry groups, bounded annual
  transitions, shared trade conditions, financial feedback, policy lags and 32 years of history.
- Shared conditions in job listings, hiring, layoffs, ordinary companies, game studios,
  deep-tech companies, banks, rentals, property values, securities, savings and loan offers.
- Fixed/variable refinancing with upfront fees, payment/total-cost comparisons and rate-rise
  stress estimates. Credit history recovers gradually. Repossession and foreclosure apply
  auction proceeds and retain any unpaid balance. Moving countries does not redenominate debt.
- Practical/balanced/frontier research budgets, limited prototype/customer experiments, and
  product-specific reliability and market fit. Actual manufacturing/licensing feeds adoption,
  productivity, input costs and job displacement in later years. Invention itself pays no cash.
- Persistent household routines with workload fatigue, paid learning, performance, health and
  relationship trade-offs. Public services affect education, treatment and enforcement; NPC
  employment responds to hiring conditions and social mobility.
- Passed economic laws change actual tax bills, public borrowing, skills and services; the
  decision explains the trade-off before signing. Everyday summaries keep detail optional.
- Old-save initialization without retroactive income; heirs keep the world. Native snapshot
  compression and shared world/history chunks preserve the ten-stop Time Machine budget.

New causal tests cover interest/credit/housing/default links, domestic and international supply
shocks, delayed technological adoption, policy costs and benefits, recovery from a credit bust,
120-year deterministic simulations with reloads, malformed world state, refinancing conservation,
foreign-denominated debts, household trade-offs and research experiments. Existing currency,
historical Korea, save, Time Machine and gameplay tests are also run for regression coverage.

Local performance sampling over 100 future years measured about 2.3 ms per shared-economy
transition and 8.4 ms per JSON save round-trip with the full 32-year history (about 1 MB).
These are development-machine measurements of those operations, not a whole-game or mobile
frame-time guarantee. The talent hint sweep deep-freezes world state and checks its identity,
so purity testing catches writes without serializing the same world thousands of times.
The forty-life randomized sweep retains every action and save assertion, with per-life timers.

Release verification (2026-10-10): the complete sweep covered 2,452 tests in 148 files.
Its four-worker run passed 2,449 tests and hit three CPU-contention timeouts; all 60 tests
in those three affected files then passed unchanged in a one-worker rerun. Default test
concurrency is now capped at two workers. Typecheck and production build pass. Browser
play from birth through age 18, menu checks, saved-routine reload and console-error checks
also pass. Remote CI is skipped for this release at the user's request.

This is an integrated foundation, not a claim that every specialist career and activity has
been completely redesigned. The national model is a game model, not an economic forecast.
Country data are approximate existing game data. It does not simulate every household, every
government bondholder, detailed demographic cohorts, individual international shipping routes,
or a bilateral currency market. NPC firms use the existing competition system, not a complete
economy-wide accounting ledger. Securities retain their existing company-specific market engine
with shared economic overlays. Routine costs represent time/resource budgets, not daily schedules.

The previously requested fictional +1100% generational-breakthrough market announcement is
preserved as an explicit fantasy rule; real productivity adoption is separate and gradual.
Specialist career content, minigames, era narratives and regional legality are retained. Further
work should prioritize richer sector substitution/obsolescence, industry-specific strategic
events, household distribution/cohorts and playtest-based balance tuning. A full redesign of
each creative/special career remains separate work, rather than an untested replacement here.

## World Simulation 2.0

This extension starts from v1.11.1 and keeps the engine, financial ledgers, historical rules,
annual ordering and interface above. World schema 2 reads schema 1 without awarding cash,
inventory or backdated economic activity.

### Supply and production

Each sector now retains delivered-input coverage, a bounded reserve, unfilled demand,
actual output and workforce availability. Supplier output is read from the opening world,
so a disruption travels through the input graph over successive years, independently of
country/sector iteration order. Inventories buffer a shortage, decay and refill gradually;
credit affects replenishment. Service sectors have no physical stock.

Physical companies hold a small composite basket of critical inputs, in output-equivalent
units. This is separate from the existing finished-goods inventory. Purchases capitalize
the actual cost paid, consumption and spoilage enter costs, and storage is an annual expense.
The settlement cash bridge adds back noncash consumption and deducts current purchases.
It does not pay for inputs twice or turn changes in input prices into inventory income.
Extra reserves require spare opening company cash; ordinary just-in-time purchases retain
the existing annual operating-payables convention. Liquidation uses a conservative haircut.

Classic businesses and deep-tech factories reuse this supply book. Services can be limited
by qualified workers without storing appointments or subscriptions. Forecasts only return
the prospective next stock; only an actual annual settlement writes it.

Snapshot normalization preserves valid historical hyperinflation-era policy rates and
housing crashes. Clipping those values on reload previously both changed the world and
prevented adjacent Time Machine snapshots from sharing their identical economic frames.

### International trade

Four critical input baskets retain up to three supplier countries each. Opening-year exporter
output, logistics, historical tariffs/blocs, domestic war disruption and currency exposure
determine deliveries. Export orders follow importers' prior commitments and demand. Supplier
weights adjust gradually after settlement; a newly selected route cannot supply the lost
orders retroactively. Domestic substitution requires prior shortages, spare capacity and credit.
Historical chip/oil capabilities are era-gated. The network represents relative capacity and
orders, not a shipment ledger or dollar-denominated trade balance.

The existing paid supplier-diversification action partially reduces imported shortages, not
domestic outages or missing workers. Premium suppliers trade higher costs for more dependable
imports. A dependent manufacturer's lost inputs reduce actual production and profit.

### Households and persistent companies

Four household groups track population share, employment, qualifications, real income and
consumption, debt, savings buffers and retirement. Food/housing costs weigh more heavily on
lower-income baskets. Consumption feeds next-year demand; education builds qualifications that
become available to employers in subsequent years. Automation redistributes the existing
national unemployment burden rather than adding a second aggregate job-loss penalty.
These groups are indices, not additional NPCs or accounts holding player money.

Existing NPC education and household expenses use the same conditions; managed-family payroll
and royal appointments retain their authority. Rental affordability affects vacancy/arrears
through the existing landlord settlement. Ordinary birth-background odds respond to mobility
and household pressure while the rare wealthy/dynastic tail keeps its prior random probability.

Up to 192 significant canonical competitors retain financial buffers, capacity, adoption,
strength, outcomes and six annual observations. Retained earnings fund expansion and adoption;
weak demand, expensive inputs and limited credit can cause retrenchment or failure. The overlay
modifies the existing roster identity, not a duplicate firm, and failed actors retain bounded
terminal records until their canonical exit. Historical real brands keep their recorded dates
and strength arcs. Financial detail for healthy irrelevant firms may be evicted at the cap.

### Banks and public finances

Bank simulations return observations of realized credit/liquidation losses, run-only
withdrawals and net loan-book changes. Only actual player/NPC settlement queues those
observations, once per company/year, scaled to the host economy. Forecast copies never
emit them. Customer deposits and investment-fund principal remain segregated; an already
reported bank loss is not reported again as generic company failure.

At the following world boundary, bank stress reduces credit and liquidity. Weaker lending
changes business/household demand and output, then jobs and borrower defaults, rather than
adding an unrelated crisis penalty to every subsystem. Stress decays as balance sheets
stabilize. Signed lending changes are combined before the national cap, so expanding and
contracting banks offset one another independently of settlement order.
Hiring and layoffs follow the same signed-net rule before the national employment cap,
including when a save/reload occurs between company settlements.

Each country has a GDP-share public budget: revenue, education, health, infrastructure,
transfers, other services, interest, borrowing, repayment and unfunded programmes. Existing
laws supply delayed policy requests. Only funded allocations support services and skills;
debt service and financing limits can force cuts. Repaid debt can reach zero, excess
surpluses become an explicit public saving flow, and a debt-cap breach after a GDP collapse
is shown as an aggregate debt adjustment, not silently erased. This approximate national
ledger does not collect a second tax from the player or create a spendable treasury account.

Time Machine records use native gzip with a versioned safe-BMP transport, preserving exact
JSON while using fewer localStorage characters than base64. Original plain and gz1 records
remain readable; size/alphabet/padding/UTF-8/decompression guards reject damaged records.
The ten-stop count and 1,500,000-character snapshot budget are unchanged.

### Management and explanations

Existing company Quality menus now expose a 0–50% strategic-input reserve slider and
three-year fixed-input agreements. Setting a target does not buy anything immediately.
Delivered reserve purchases use at most 20% of spare opening cash after current input
commitments, subject to warehouse space. Contracts fix the price of up to 80% of the
equipment capacity present when signed, at a 3% price premium and a one-time 4% fee.
They do not guarantee delivery, expand when equipment is added, or avoid supplier-grade
cost differences. Falling spot prices can make the contract a loss.

The existing paid training and equipment-upgrade actions also build durable qualifications
and automation. Training addresses measured qualification deficits, not missing people;
automation covers a bounded part of remaining work, not absent materials. Their effects
decay by 10% and 3% per year respectively, and repeated programmes have diminishing gains.
Physical deep-tech production uses these same inputs and policies; services hold no stock.

Classic CEOs rated 90 or higher compare at most six resilience choices against central and
downside two-year scenarios using the existing production, pricing and cash books. No future
random events are inspected. Scenario choices respect price caps, headquarters conditions,
available cash, board reserves and capital budgets. Strategic-stock cash commitments survive
into actual procurement, rather than being spent again on expansion or distributions.
Existing specialist deep-tech, finance and studio planners remain authoritative; this new
resilience search is not a replacement for them.

Every company's Money menu has an optional **Why Profit Changed** view. It reconciles two
consecutive settled net profits to actual sales, costs, tax, interest and other statement
lines, including final intercompany service adjustments. Input purchases, stock book value,
storage, spoilage and missing output are labelled separately. Contract gains/losses refer
to procurement cost, not instant profit on unsold stock. Opening companies do not get an
invented comparison. Detailed national Supply & Trade, Households & Work, Government &
Banking and Company Watch pages sit behind the existing short economy summary.

All these menus, quotes and scenario evaluations are read-only. They cannot spend money,
advance RNG, seed competitors, write historical outcomes or settle an annual period.

### Verification and limits

The World2 tests cover energy-to-industry propagation, dependent chip imports and route
substitution, distributional food-cost pressure, paid skill formation, technology adoption
and displacement, persistent rival expansion/distress/failure, realized bank losses and
credit recovery, and funded public policies with annual lags. Concrete procurement and
contract transactions reconcile cash and expense; national quantities remain indices.
Legacy reads create no retroactive transactions. Menu repetition, annual-hook retries,
JSON reloads, heirs and Time Machine have explicit deterministic/invariant checks.

Controlled scenario comparisons (against the same seeded world without the shock):

| Change | Verified consequence |
| --- | --- |
| Energy production falls to 0.15 of baseline | Manufacturing and transport output fall; costs, backlogs and inflation rise. Food/retail still feel the effect the following year after energy recovers. |
| Taiwan/Korea technology output stops | A dependent Japanese manufacturer's production, sales and net profit fall. Paid diversification restores only part of the lost production and retains its expense. |
| Essentials prices double | Working-household consumption loses more than twice as much as wealthy-household consumption; its savings decline and debt rises. |
| Systemic bank losses settle | Credit and business orders weaken, unemployment/defaults rise, and recovery unfolds through the same state. In the 30-year fixture, stress falls below 0.001 and credit recovers more than 0.05 from its trough. |
| Education spending increases | Qualifications improve before available workforce; after five transitions, skills/workforce exceed the control while public debt is higher. |
| Rivals face different financial buffers | Profitable funded rivals expand/adopt; a weak buffer can fail under supply/credit stress while a stronger one survives. Failed identities do not respawn. |

These are causal comparisons within the new model, not claims of measured old-release
versus new-release profits or guaranteed player outcomes.

A 120-year paired run checks 240 world transitions, bounded histories and generational
reloads. Ten Time Machine stops with eleven shared economic frames occupy 688,976 of
1,500,000 snapshot characters (45.9%) in the regression fixture. A separate representative
workload settles sixteen subsidiaries, sixty contacts and six initial NPC companies for
five years, across two replay branches and an heir transition; both 85- and 95-rated
management are covered. Performance figures are machine/workload measurements, not a
guaranteed mobile-device frame rate.

Final isolated one-worker sampling (ten measured annual branches per fixture):

| Management | World transition | Business settlement | NPC progression | Final JSON save |
| --- | ---: | ---: | ---: | ---: |
| 85-rated | 39.8 ms/year | 1,691.2 ms/year | 24.0 ms/year | 1,730,406 characters |
| 95-rated | 22.5 ms/year | 2,206.0 ms/year | 19.8 ms/year | 1,743,030 characters |

The elite workload executed 100 resilience reviews and selected actual investments.
Different decisions and warmed caches mean these rows are workload observations, not a
controlled claim that CEO skill speeds up the world engine. Both retained 135 distinct
tracked rivals, exact live/reloaded JSON and idempotent annual-hook retries.

Final verification (2026-10-10): the broad two-worker sweep ran 2,665 tests across 167
files in 20m53s. It passed 2,662 and exposed three failures: the existing 400-childhood
statistical test exceeded its single two-minute timeout, and two newly added signed-job
regressions encountered the earlier ±0.08 implementation cached before the in-flight fix.
The childhood workload is now 400 individually timed cases with all original seeds,
drivers, years and aggregate thresholds preserved; neither its sample nor assertions were
reduced and no timeout was raised. A fresh process then passed all 592 tests across the
18 affected/new-system files, including all childhood samples, World2 tests, save codec,
Time Machine and living-economy regressions (6m00s). No failures remain in those checks.
The separate isolated 85/95 benchmark also passed both cases.

`npm run build` passes TypeScript validation and production compilation; `git diff --check`
is clean. The final JavaScript output is approximately 7.09 MB minified / 2.40 MB gzip,
with the existing large-chunk warning. No dependency or package-version changes were made.

Browser checks use an isolated local production-build save: a South Korean 1950 birth,
annual childhood events through age four, the 1953 currency change, saved-life reload,
the four new economic detail screens, and a Time Machine rewind followed by continued
play. Business-policy actions and financial effects are exercised by automated integration
tests, not claimed as a complete manual career playthrough.

The model remains deliberately bounded: four household groups, four traded input baskets,
three supplier routes per basket, and up to 192 detailed competitors. It does not simulate
individual shipments, every real firm, national accounts to the penny, or a bilateral FX
market. New reserve/contract behavior will still benefit from longer balance playtests.
The existing single JavaScript bundle remains large; the production build reports its
size warning. No backend, runtime dependency, release tag or deployment is added here.
