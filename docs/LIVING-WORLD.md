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

## Verification and remaining scope

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
