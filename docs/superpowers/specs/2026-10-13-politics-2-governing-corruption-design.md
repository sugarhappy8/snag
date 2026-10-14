# Politics 2.0: governing, abusing power, and a world that reacts (v2.5.0)

Base: `main` v2.4.0 (the request said v2.2.0; main has moved on, and this builds on the latest).

## What the player asked for

Once in office the player actually runs the country and the world simulation reacts:

1. **Governing (legal):** taxes, new taxes and breaks; tariffs, deals, sanctions and export bans
   that reach `economy/trade.ts`, `business/market-trade.ts`, rivals and the player's companies,
   with retaliation; a budget with deficits, debt, ratings and crises; laws and regulation; a
   yearly State of the Nation; votes, coalitions, deals, vetoes and courts.
2. **Abusing power (illegal, fictional, abstract):** kickbacks, steering contracts, embezzling,
   bribes, insider trading on your own policies, selling pardons/appointments/citizenship, a cut
   of state enterprises, hiding money abroad; rigging, vote buying, gerrymanders, jailing rivals,
   media control, court packing, term limits, emergency powers, a loyal security force, cronies
   and a self-coup; and the consequences.
3. **Drama:** yearly crises with 2–3 choices, rivals and lobbyists, your own companies lobbying
   you, relatives wanting jobs and contracts.
4. **A Politics dashboard.**

## What exists (verified by reading the code)

- `special/politics.ts`: four rungs (school board/council → mayor → governor/legislator →
  head of government), campaigns, approval, speeches, rallies, random flavor bills (a few map to
  `economy.enactEconomicPolicy`: six bounded 5-year kinds), executive orders, favors (bribes paid
  as clean cash), scandals, impeachment/no-confidence, market-moving announcements with insider
  cases. No minister rung.
- `economy/government.ts`: GDP-share budget (revenue, education, health, infrastructure,
  transfers, other), debt capped at `GOVERNMENT_DEBT_CAP` 2.5. `taxShift` already feeds personal
  income tax (`finance.gameIncomeTax`) and corporate tax (`business/tax.ts`).
- `economy/trade.ts`: four traded inputs (essentials, energy, industry, technology), routes,
  costs, export demand. Tariffs come only from fixed customs data (`market-trade.tariffOn`).
- `business/dynamics.nationalMarket`: the one place every company's demand and costs are read
  (player, NPC, deep tech, studios, planner).
- `underworld.ts` keeps unlaundered criminal money apart from the bank and launders it through a
  controlled company (65% recovered). That is the "dirty money" pattern to follow.

## Principles

Same as v2.2: plain-JSON state, seeded randomness (`rng.ts` in actions and hooks; stable hashes in
pure reads), pure menus, engine money in constant 2026 USD, era and country gates on menus AND
resolvers, honest numbers (hints and odds come from the resolver's own math; nothing is
guaranteed), old saves load with no free money. Fictional people only; no real-world methods.

## 1. State

| Key | Scope | Holds |
|---|---|---|
| `g.flags['nation.policy']` | the world (survives heirs; laws stay until repealed) | per country: taxes, new taxes, breaks, budget levels, tariffs, deals, sanctions, export bans, retaliation, laws, nationalized sectors, institutions (courts, media, term limits, emergency, regime), legislature seats, one-off shocks, report history |
| `g.flags['nation.me']` | the character (owner-stamped; heirs start clean) | political capital, legitimacy, fear, security loyalty, slush fund, offshore money, case files, rivals, lobbying asks, crisis cooldowns, report ledger |

Readers normalize anything missing or damaged; writers replace the root so pure caches stay valid.
No state = no policies = today's game exactly.

## 2. Office powers

| Office | Reach on the economy | Can do |
|---|---|---|
| School board / council | none | the existing local bills |
| Mayor | city (3%) | property tax, city police/infrastructure/schools budget, permits, city contracts |
| Governor (regional) | region (15%) | regional income/sales/property tax, regional budget, minimum wage, pardons |
| Legislator | national, by vote | vote on the government's bills, introduce national bills (weak agenda power) |
| Minister (new appointment for rank-2 officials whose party governs) | national, in portfolio | Finance: taxes/budget · Trade: tariffs/deals/sanctions · Interior: police, laws |
| Head of government | national | everything; executive orders for tariffs, sanctions, export bans, emergencies, pardons |

Personal taxes apply every layer where the player lives; macro effects use the reach.

## 3. Governing

**Taxes** (points vs the country's baseline, sliders): income, corporate, capital gains,
sales/VAT (VAT era-gated), wealth, inheritance, property. **New taxes**: luxury, windfall (one
industry), sugar, carbon (1990+), digital services (2019+), financial transactions. **Breaks**:
corporate relief for one industry. Each tax has per-point revenue, growth, inequality, price and
voter-group effects with diminishing returns (capital flight above sane rates).

Hooks that make them real money: `finance.gameIncomeTax`, `business/tax.ts` (corporate,
windfall, breaks: the player's own companies pay), `exit.capitalGainsRate`, inheritance in
`relationships.ts`, property upkeep in `assets.ts`, a new yearly wealth tax on the player's net
worth, the luxury tax in `luxury-brands-catalog.luxuryTaxRate`.

**Trade**: tariff rules by input (or all goods) and partner (or everyone), deals (zero tariffs
both ways), sanctions (restriction both ways), export bans. One pure overlay feeds
`economy/trade.ts` (route costs, restriction, export orders) and `trade.tariffWith(g, ...)` that
`market-reach`, `market-regional`, `market-strategy` and `market-view` call instead of
`tariffOn`. Protected industries gain domestic demand and downstream industries pay more
through `nationalMarket`. Partners retaliate (seeded odds by size and relations) with their own
tariffs on the player's country; sanctions bring counter-sanctions.

**Budget**: military, healthcare, education, infrastructure, police, research, welfare, space
(1957+), each 50–200% of baseline. Lines map onto the economy's GDP-share budget, so deficits and
debt evolve in `government.budgetPlan`/`finalizeDebt` (cap 2.5). A credit rating (AAA…D) from
debt, deficit, inflation, growth and stability raises borrowing costs when it falls; a debt
crisis offers austerity, a bailout with conditions, or default (a write-down plus a recession).

**Laws**: minimum wage, labor rules, environmental rules, deregulation by sector (cheaper, but
finance deregulation feeds bubbles and bank stress), legalize/ban (casinos, prohibition,
cannabis 2012+, marriage equality 2001+), nationalize or privatize a sector, bailouts.

**Votes**: the legislature has seats per party and a governing coalition. Each bill gets an
honest pass probability from seats, party stances, approval and whip; before the vote the player
may lean on the party (political capital), make a deal (pork that costs the budget), or bribe
waverers (dirty money, evidence). Presidents' bills face the legislature; others' face a veto by
the (NPC or player) executive. Constitutional changes need two thirds; courts may strike laws
down unless packed.

**State of the Nation** (yearly, a full-screen report card): growth, unemployment, inflation,
deficit, debt and rating, approval by voter group (workers, middle class, business owners,
retirees, young, rural), and "what your policies caused" lines computed from the same overlay
the economy used. Approval now drifts toward a target built from the economy and policies, so
bad policy visibly hurts.

## 4. Abusing power

**Dirty money** goes to a slush fund (not bank money, not net worth). It can be laundered
through a controlled company (as the underworld: 65% recovered, heat), moved offshore (a fee;
safe from domestic seizure, at risk from leaks and sanctions), brought home as taxable
"consulting fees" (a further cut), or spent dirty on vote buying and bribes. It is seized on
exposure and lost at death.

**Schemes** (sliders, odds shown): kickbacks on contracts, steering contracts to your or your
family's companies (bounded company income), embezzling, permit bribes (yearly offers), insider
trading on your own tariffs and taxes (the existing announcement and case system, with a new
`policy` cause), selling pardons, appointments and citizenship, a cut of state enterprises. Size
caps scale with GDP, office and corruption; detection rises steeply with size, heat and evidence,
falls with media control. Every scheme adds evidence to a case file that can surface years later.

**Keeping power**: rig or postpone elections, buy votes, gerrymander, jail or exile rivals,
control the media, pack the courts, change term limits, emergency powers, a loyal security force,
crony oligarchs, and a self-coup (head of government, needs fear and loyalty; impossible where
institutions are strong).

**Meters**: approval, legitimacy, fear, security loyalty, heat, political capital. Consequences:
journalists and auditors (exposure odds), courts, protests (crack down / concede / resign),
foreign sanctions (trade and offshore money), impeachment and no-confidence votes (now using
seats), coups (fight / flee / negotiate), exile, and trials after leaving office. Corrupt
countries make schemes cheaper and regimes less stable.

## 5. Drama

One crisis a year at most for national officials: recessions (from the economy), strikes (wages
and labor rules), wars (history data), pandemics (1918, 1957, 1968, 2020 and rare procedural
ones), disasters, debt crises. Two or three choices each. Named rivals (opposition leader, party
rival, a lobbyist, an oligarch) with goals. Your companies ask for tariffs, breaks or bailouts
(conflict of interest; a blind trust lowers the scandal risk). Relatives ask for posts or
contracts.

## 6. Balance and proof

A careful honest politician earns salary, pension and post-office income and can win re-election
with good results; a careful corrupt one can bank laundered money at a real, rising risk; a
reckless one is caught, ousted, or overthrown. The deep fuzzer gets a politician mode that plays
many seeded lives per strategy (honest, careful corrupt, reckless) and reports gains and ruin
rates; tests assert that no scheme or policy is a reliable money printer.

## 7. Tests

Money conservation (dirty money and laundering, seizures, taxes paid, contracts booked once),
policy effects reaching economy/trade/business, pure menus, era and country gates on menus and
resolvers, old saves (no state, old politician jobs, old favors), honest odds (the shown
probability is the rolled one), plus the fuzzer. `tsc`, full `vitest`, build, headless
playthroughs, phone UI in light and dark.
