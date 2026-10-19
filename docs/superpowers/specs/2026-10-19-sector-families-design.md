# Sector families: a shared framework and three families for the 35 generic trades (first slice)

Status: draft for review. Path: architectural. Branch: `claude/sector-families` (Track C). Ships in the v4.0.0 integration; release notes and the version bump happen there, not in this track.

Slice: one framework (`business/sector-*.ts`) plus three families built end to end: **Food and Drink Service** (4 trades), **Care, Education and Personal Services** (7 trades), **Utilities, Land and Fleets** (7 trades). That is 18 of the 35 generic-only trades. The other five families are deferred and listed in section 5.

Names marked "(new)" do not exist yet. Every other name below was grepped in the v3.0.0 tree.

## 1. What the player asked for

> "all industries should expand, like deep tech, finance and game studios got their own systems"

Success looks like this, in one play session:

1. Open a restaurant, a gym or a farm. Next to the venue and franchise rows the company screen has an **Operations Desk** with a family name: Kitchen and Floor, Clients and Standards, Plant and Network.
2. The first year the desk only measures. From the second year the company's numbers move with things the desk shows: a hygiene grade and a review rating, a client base and an accreditation tier, a plant condition and a contract mix.
3. Four levers per family, each with a price, a trade-off and a limit of one change a year. The row says what it costs and what it gives up.
4. At most one story a year from that trade (an inspector, a lead stylist who leaves, a storm on the grid). A purple hint marks the best choice and comes from the odds the resolver rolls.
5. A key role for the family (Food Safety Lead, Registrar, Reliability Engineer) that visibly moves one score.
6. A hired CEO above skill 75 works the desk and reports it in the yearly letter. A weaker CEO leaves the levers alone and the desk says so.

Assumptions (mine): "own systems" means persistent state, a yearly rule and decisions, not a second simulator. The classic engine stays the single source of money and demand.

## 2. What the audit found

- `INDUSTRY_IDS` (`data/markets.ts`) holds 55 trades: 25 base, `EXPANSION_INDUSTRY_IDS` 18, and 12 `DEEP_TECH_IDS`. `test/business-expansion.test.ts` asserts 55.
- 20 trades have their own layer: 12 deep tech, 3 finance (`FINANCE_INDUSTRIES`), `gameStudio`, 4 venues (`isVenue`). The other 35 (23 base trades and 12 `sector()` clones in `industries.ts`) run only the classic engine.
- Cost of the precedents: venues 293 lines (`venues.ts`, `venues-data.ts`: a sidecar with 3 hook points); `deeptech.ts` is a 64-line facade over `deeptech*.ts` (6,232 lines); `finance-firm.ts` dispatches to `bank*.ts` (2,321) and `fund*.ts` (2,846); `gamestudio*.ts` (2,934) replaces `simulateYear`.
- The light pattern needs no engine change. `BizState.demandShock`, `costShock`, `capacityLoss`, `openFraction`, `yearCosts`, `yearIncome` (`state.ts`) are read by `planFor` and `bookYear` (`economy.ts`) and reset by `evolve`. `bookYear` adds `alreadyBooked = b.yearCosts - b.yearIncome` back to cash, so a hook that moves `b.cash` and the matching channel books money once. `bookFranchiseYear` and `spendCompany` (`venues.ts`) follow that rule.
- `yearlyBusinessImpl` runs `bookFranchiseYear`, `bookHedgeYear`, `prepareVenueYear`, `executiveOperations`, then dispatches the engine. Afterwards the owner event chain gives one event per company (`eventQueued`: `maybeVenueOwnerEvent`, studio, deep tech, then `maybeBusinessEvent`). `hiredCeoTurn` dispatches the hired CEO's turn. The hooks run after `aging.ts` has added a year and cleared `g.yearActions`, so the fiscal year is `g.year - 1`.
- `businessView` (`manage.ts`) injects `venueOwnerMenu` for `isVenue` and `franchiseMenu` for classic companies. State sidecars are optional `Json` fields (`venueOwner`, `franchise`, `supply`) that `normalizeBiz` whitelists. `BIZ_VERSION` is 2 and `SAVE_SCHEMA` (`core.ts`) is 2.
- No sector mechanic exists for these trades: greps for house edge, RevPAR, occupancy, accredit, backlog and malpractice in `src/game/business` find nothing. "Inspection" and "critic" are stateless events (`EVENTS` in `events.ts`, `EXTRA_EVENTS` in `events-extra.ts`, gated by `industryDef(b.industry).food`). Clinic has only a licence premium (`licencePremium`, `economy.ts`).
- Staff: the 12 clones get four generic roles from `sector()`. `RoleDef` is `{title, focus, pay}`, `maxKeyStaff` is `min(8, 3 + outlets/3, roles.length)`, `staffPower` returns 0 to 2.5 (`leadership.ts`). Deep tech's expert role (`deeptech-found.ts`) is the one sector-staff precedent.
- Supply: `PROFILES` in `supply.ts` covers 22 trades. All four food trades, farm and autoShop have one. Clinic, education, gym, salon, petCare, homeCare, energy, solar, water, telecom, dataCenter and logistics have none, and `test/world2-business-supply.test.ts` pins that services have no profile.
- Franchise: `FRANCHISE_INDUSTRIES` (17) includes the four food trades and six of the seven care trades (not clinic). No utility trade franchises. Royalties come from the company's own sales per outlet (`ownSalesPerOutlet`), so anything that moves own sales flows to franchisees.
- History: `exposureOf` (`history/market-events.ts`) maps 45 of 55 trades. Six of the ten unmapped trades are in this slice (bakery, clinic, education, petCare, homeCare, water). `nationalMarket` (`dynamics.ts`) already multiplies demand and costs by `marketEventFactors`. `MARKET_EVENTS` has `crash2020`, `housing2008`, `oil1973`, `oil1979`, `oil2008`, `oilGlut`, `crash2022`. Era gates are `bizHas` and `eraFits` (`era.ts`); `TechId` includes `smartphone`, `socialMedia`, `internet`.
- Hired CEO: `outlook` (`board-ceo.ts`) sets `modeled = !finance && b.industry !== 'gameStudio' && !isDeepTech(b)`. `smartManagerTurn` runs `staffTurn`, `policyTurn`, `resilienceTurn`, `productTurn`, `siteTurn`, `debtTurn`, the plan and `payoutTurn`, for skill above `SMART_SKILL` (75, `career.ts`). Weaker managers use `autoPlan`. `ceoLetter` (`career.ts`) allows one letter a year. The only CEO resume precedent is `Manager.finance` (`finance-leadership.ts`).
- Heavy R&D (`heavyEligible`, `BREAKTHROUGHS` in `heavy-data.ts`) already serves 39 trades, so no sector R&D list is built here.
- Hard-coded counts to keep: 55 trades, 5 breakthroughs per trade, em-dashes in `src` exactly 24 (`test/voice-guards.test.ts` caps at 24), `SAVE_SCHEMA` 2.

## 3. Scope and non-goals

In (about 9 plan tasks): the framework; Food (restaurant, foodTruck, cafe, bakery); Care (clinic, education, gym, salon, petCare, homeCare, autoShop); Utilities (energy, solar, water, telecom, dataCenter, farm, logistics). 22 events, 12 levers, 18 key roles.

Why these three:

- They are three different kinds of mechanic: a demand-side memory (a client base that repairs slowly), throughput and reputation (seat-hours by daypart, a public grade), and asset condition under a pricing regime (wear, outages, contract vs spot, weather).
- They cover 18 trades, the most any three families can: Utilities 7, Care 7, Food 4.
- Hospitality repeats Food's capacity-by-daypart and season math. Retail, Industrial, Projects and Digital each need money that the six generic channels cannot carry (inventory, work in progress, recurring revenue) and so need an engine change of their own.

Cut list (explicitly not in this slice):

- The other five families (section 5). Bar stays on the venue sidecar; sharing the food grade with bars waits for Hospitality.
- Sub-year simulation. Seasons and weather are one deterministic multiplier per year.
- A second R&D list, sector programs, or any change to R&D cost. Lever costs scale with revenue or capital with a price-level floor, never with `b.cash`. `heavyCost` and `rdCost` are untouched.
- New trades, `INDUSTRY_IDS` edits, or fixes to clone quirks (water and solar `priceCat: 'fuel'`, telecom and dataCenter software scaling, biotech classed as technology). Those move every existing company and need their own release.
- Valuation hooks (`valuationOf`), rival models, news-feed items, market-view segment names, `EXPOSURE` edits, founding-menu headings, the annual report popup, dashboard rows.
- Edits to `economy.ts`, `franchise.ts`, `supply.ts`. The layer talks to them through channels and pure reads.
- A resume for hired CEOs (the `Manager.finance` pattern). The CEO uses plain skill.
- Education terms and cohorts, clinic doctor-hours, telecom spectrum and subscriber churn, data-center MW pre-leasing. They are in section 5.

## 4. Design

### 4.1 The framework (`src/game/business/sector-*.ts`)

| File (new) | Holds (every name in this column is new) |
|---|---|
| `sector-state.ts` | `FamilyId`, `SectorState` types, `SECTOR_VERSION`, `familyOf`, `readSector`, `saveSector`, `sectorOwnsEvent`. Light imports so `state.ts` and `events.ts` can use it. |
| `sector-data.ts` | Trade tables (dayparts, retention, wear...), `SECTOR_ROLES`, `withSectorRoles`, `SECTOR_HISTORY` rows. Data only, type-only imports from `industries.ts`. |
| `sector-kit.ts` | Shared types, the family registry (`registerFamily`, `modelOf`), and the pure helpers `seasonIndex`, `readYear`, `roleSkill`, `baseRevenue`, `sectorCtx`, `historyFactor`, `sectorHistoryLine`, `sectorText`, `copyLines`. Imports only `sector-state.ts` and `sector-data.ts` among the sector files, so family files never import `sector-core.ts` back. |
| `sector-core.ts` | `prepareSectorYear`, `sectorEffects` dispatch with the clamps, `seedSector`, money booking (`bookIncome`, `bookCost`), `sectorValue`. |
| `sector-families.ts` | One barrel that imports the three play files, so each registers its model; `sector-core.ts` imports it. |
| `sector-events.ts` | Table-driven events: `SectorEvent`, `maybeSectorEvent`, the `sector.event` script, `applySectorFx`. |
| `sector-menu.ts` | `sectorMenu(a)`, `applyLever`, `leverValue`, hints. |
| `sector-ceo.ts` | `sectorTurn(t)` for the hired CEO. |
| `sector-food.ts`, `sector-food-play.ts` | Food: state and math; levers, events, copy. Same split for `sector-care*.ts` and `sector-util*.ts`. |

State is one optional record at `BizState.sector` (plain JSON, `Json`). It is read only through `readSector(b)`, which returns null for a missing record, a record of another family, or a version above 1 (that record is never overwritten).

```ts
export type FamilyId = 'food' | 'care' | 'util'                      // (new)
export const SECTOR_VERSION = 1                                      // (new)
export interface SectorRow { year: number; income: number; costs: number; demand: number; cost: number; capLoss: number }  // (new), last 4 fiscal years
interface SectorBase { v: 1; family: FamilyId; since: number; lastYear: number; lastEvent: number
  ledger: SectorRow[]; pending: { token: string; id: string; year: number } | null; diary: string[] }   // diary: last 6 lines
export interface FoodState extends SectorBase { family: 'food'; hygiene: number; rating: number; menu: 0 | 1 | 2; channel: 0 | 1 | 2; hours: 0 | 1; audit: number }
export interface CareState extends SectorBase { family: 'care'; loyal: number; plans: number; planTarget: number; payer: number; acc: number; intake: 0 | 1 | 2; program: number }
export interface UtilState extends SectorBase { family: 'util'; condition: number; contract: number; hedge: number; cover: 0 | 1; overhaul: number; outages: number }
export type SectorState = FoodState | CareState | UtilState
```

`audit`, `program`, `overhaul` hold the fiscal year of the last paid action (0: none), so the yearly rule can see "done this year". Every number is clamped by a table range in `readSector`.

**The hook.** `prepareSectorYear(g, a, b, fiscal)` (new) is called in `yearlyBusinessImpl` right after `prepareVenueYear`. It never replaces the engine.

1. Return unless the trade has a family, the character is alive and `isIndustryLegal(b.countryId, b.industry, g)` holds.
2. No record yet: `seedSector` (new) builds one from the company's own numbers (seeds below) with `since = fiscal`. The first fiscal year is an **observation year**: the record is saved and nothing else is written, so that year is exactly what v3.0.0 would have booked. A record created by a lever action mid-year gets `since = g.year - 1`, so the year the player acted in is live.
3. `if (st.lastYear >= fiscal) return`, then `st.lastYear = fiscal` before any write (yearly idempotence).
4. `fx = sectorEffects(g, a, b, st, fiscal, 'book')` (pure) returns `{ demand, cost, capLoss, open, income, costs, next, lines }`.
5. Write only the generic channels, with bounds: `b.demandShock = clampN(b.demandShock * fx.demand, .3, 2)` with `fx.demand` in .80 to 1.35; `b.costShock *= fx.cost` (.90 to 1.12); `b.capacityLoss = 1 - (1 - b.capacityLoss) * (1 - fx.capLoss)` (`fx.capLoss` at most .35); `b.openFraction = Math.min(b.openFraction, fx.open)` (at least .8).
6. Money: income is `b.cash += x; b.yearIncome += x`, a cost is `b.cash -= x; b.yearCosts += x`. Nothing else moves money. Random flows (spot settlement, outage repair and penalties) are capped at 12% of `baseRevenue(b)` (new: last `netRevenue`, or the calm plan's demand times price in a first year). Lever costs are exactly what the lever row shows.
7. Persistent scores advance from `fx.next`, a ledger row is stored, and one life-log line (90 characters at most) is written only when a grade, tier or outage changes.

**Seasonality.** `seasonIndex(g, a, year, salt)` (new, pure) is `2 * mix(hashOf([g.lifeId, a.id, year, salt].join('|')), hashOf(salt), 1) - 1`, using `hashOf` and `mix` from `product-market.ts`. Mean 0, range -1 to 1. Seasons and spot prices are `1 + amplitude * index`, so those draws are mean-preserving. Weather is one-sided on purpose (`bad = max(0, -index)`): its mean is the price of weather (section 4.4). Reloading gives the same draw; nothing is re-rolled. `nationalMarket` already uses stable seeded hashes the same way.

**Events.**

- `maybeSectorEvent(g, a, b, year, managed)` (new) is inserted as its own statement above the long chain line in `yearlyBusinessImpl` (`if (!eventQueued && maybeSectorEvent(...)) eventQueued = true`). Family events come first; a generic event is skipped that year.
- It returns false in the observation year and when `st.lastEvent >= year`. It rolls `chance(g, managed ? .09 : .14)`, then `weightedPick` over the family table, and sets `b.lastEvent = year`. Event load for the 18 trades rises from about .30 to about .40 a company-year (a test pins at most .45).
- A row is `{ id, family, weight(g,b,st), scene(g,b,st), choices[] }`; a choice is `{ id, label, branches(g,b,st) }`; a branch is `{ p, fx: BizFx, sec?, text }`, where `text` is the outcome line for that branch. A branch's `fx` may use only `cash`, `brand`, `quality`, `morale`, `demandTo`, `capacityTo`, `costTo` and `wage` (a change of the general pay level: the "pay level" and "wages" moves in the tables below). It is bounded like the hook: cash at most `max(.12 * baseRevenue, 3000 * level)`, brand, quality and morale within 12 points, `demandTo` .85 to 1.15, `capacityTo` at most .35, `costTo` at most 1.12, `wage` within .08.
- One script, `sector.event` (new, `defineScript`), verifies `st.pending.token` and year, rolls `rand(g)` over the same `branches`, and applies the branch with `applySectorFx` (cash through the two booking forms above, `brand`, `quality`, `morale`, `demandTo`, `capacityTo`, `costTo`, and `sec` deltas clamped by the table). A replay or a second click finds no token and does nothing.
- `sectorOwnsEvent(b, id)` is one added line in `weightFor` (`events.ts`): the generic `inspection` and `critic` get weight 0 for a food company whose record is live (`since` below `lastYear`: never in the observation year, which has to book as v3.0.0 did), because the family versions update a persistent grade. `eventChance` stays correct since it reads `weightFor`.

**Menu.**

- `sectorMenu(a)` (new) is a `MenuGroup` shaped like `venueOwnerMenu`: id `sector.desk.${a.id}`, `disabledReason: manageBlock`, a header with the status lines, then one submenu per lever with one action per option (current one marked), a subtitle with cost and trade-off, `confirm` text and a hint.
- One line in `businessView` (`manage.ts`) pushes it next to `venueOwnerMenu` when `familyOf(health.industry)`.
- Menus are pure: no state writes, no `g.rng`. Without a record the header says the desk opens at the next year end.

**Levers.** `applyLever(g, a, lever, option, by)` (new) is the only write path, used by the menu and by the CEO. Inside it: for `by: 'owner'` `manageBlock`, for `by: 'ceo'` the company still owned, the character alive and a hired manager above skill 75 (the owner's jail or age must not stop their manager); the record exists or is created; the option is legal for the trade and the era; `useYearAction(g, 'sector.' + lever + '.' + a.id, 1)`; the cost is paid from company cash with the `yearCosts` form. For `by: 'owner'` paid levers also pass `boardAllows(g, a, b, { kind: 'capex', by, amount, gain, label })`; for `by: 'ceo'` the limits are `capexLeft` and `noteSpend` (`board-vote.ts`). A direct call or a restored menu cannot skip any of it. The owner may use a lever whoever runs the company; the once-a-year key is shared, so the owner's change blocks the CEO's change of the same lever that year.

**Staff.**

- `SECTOR_ROLES` (new) gives each of the 18 trades one extra key role (tables below). `withSectorRoles` (new) is applied once where `INDUSTRIES` is built (`industries.ts`: the literal is renamed `RAW_INDUSTRIES` (new name), then `export const INDUSTRIES = withSectorRoles(RAW_INDUSTRIES)`), so `industryDef`, `maxKeyStaff`, hiring and `normalizeBiz` all see it.
- `roleSkill(b, title)` (new) is `skill / 100` of the person whose role `sameRole` matches, else 0. A company that never hires the role sees no change.
- `roleBlurb` (`staff.ts`) gets one branch so the role's text names the score it moves.

**Hired CEO.**

- `modeled` in `outlook` stays true for these trades: the price-and-production planner is still authoritative, so mandates, openings and R&D keep working. A test pins it.
- `smartManagerTurn` gets one new step, `sectorTurn(t)` (new), after `productTurn(t)`. `sector-ceo.ts` declares the small `Turn` shape it needs instead of importing the private one.
- It lists the family's levers, scores each option with `t.judge(leverValue(...))`, and changes at most 2 levers a year, each only when its gain pays back within `MAX_PAYBACK[mandate]` and inside `max(0, min(capexLeft(g, b, st), b.cash - reserveDollars(b, st) - t.reserved))`.
- Under a cash mandate it picks the cheaper option. Audits, programs and overhauls skip the payback test (any positive value will do); the budget and the reserve still bind. Each change adds one letter line of 12 words or fewer with its number.
- A manager at 75 or below does nothing here, and the desk header says "Your CEO adjusts these levers at skill 76 or more."

**Hints (purple, Business talent).**

- Event choices use `markBest` with `expectedFx` over the same `branches` the resolver rolls. A `sec` delta is valued as the change in `sectorEffects(..., 'expected')` times `LASTING_YEARS`.
- Lever rows use `leverValue` = `sectorValue(option) - sectorValue(current)`. `sectorValue` (new) is capacity-aware: `w.contrib * (min(fx.demand, 1 / w.util) - 1) - (fx.cost - 1) * w.cogs + income - costs`, minus `fx.capLoss` valued as `fxValue` does, with `w = bizWorth(g, b)`.
- For levers that change a stock (condition, plans, loyalty, hygiene) `leverValue` rolls the stock forward 3 years from the year being lived (`g.year`) under both settings with expected draws and sums the yearly difference with weights 1, 1, .7 (`LASTING_YEARS` is 2.7).
- `'expected'` mode sets every draw to its mean (season, weather, spot, outage), so no hint reveals next year. Hints are memoised per (asset, year, state) with a 32-entry cap, like `outlook`.

**Migration.** `SAVE_SCHEMA` stays 2 and `BIZ_VERSION` stays 2. Two hunks in `state.ts`: `sector?: Json` in `BizState` next to `venueOwner`, and one whitelist line in `normalizeBiz` that keeps `d.sector` only when it is a plain object. All validation is in `readSector`. Old saves have no record, get one at the next yearly hook, and book that year exactly as before.

**Determinism.** `g.rng` is used in exactly three places of the layer's own code: the event roll and pick, and the branch roll in the event script (plus the board's own vote when `boardAllows` needs one, and the hired CEO's `t.judge`). The yearly rule, menus, hints, seeds and previews use `hashOf` and `mix` only. Same seed and same actions give the same game.

**Accounting and bounds.** A ledger row records what the layer wrote, 4 rows at most. Diary 6 lines, one pending event, numbers clamped. Sector money is only `b.cash` plus `b.yearIncome` or `b.yearCosts`, so it shows in the statement's `other` and `otherIncome` lines (platform commission, payer discounts, settlements) and is taxed like them.

**Hot-file hunks (all additive, separate).** `state.ts` 2, `yearly.ts` 4 (two imports, one call after `prepareVenueYear`, one inserted statement above the event chain), `manage.ts` 2 (import, one line), `board-ceo.ts` 2 (import, `sectorTurn(t)`), `events.ts` 2 (import, one line), `industries.ts` 3, `staff.ts` 2. `economy.ts` is not edited.

**What the desk shows (header lines, pure).**

- Food: "Grade B, hygiene 71. Rating 3.4. Dinner fills above 75% use. Menu Balanced. Delivery off. Standard hours."
- Care: "About 4,200 clients, 68% come back. Plans 0%. Accredited, score 62. Payer mix 0%. Intake open."
- Utilities: "Condition 75. 0 outages in 3 years. Contract 50%, regulated 50%. Hedge 0%. Weather cover off."

### 4.2 Family A: Food and Drink Service (`food`)

Trades and tables (`sector-data.ts`). Dayparts are share of demand / share of seat-hours.

| Trade | Dayparts | Season amp | Waste | Platform share | Own-fleet share | Role (focus, pay) |
|---|---|---|---|---|---|---|
| restaurant | lunch .28/.30, dinner .60/.45, late .12/.25 | .04 | .08 | .25 | .15 | Food Safety Lead (quality, 52K) |
| foodTruck | lunch .45/.40, dinner .45/.40, late .10/.20 | .10 | .07 | .15 | none | Food Safety Lead (quality, 38K) |
| cafe | morning .50/.35, midday .30/.35, afternoon .20/.30 | .03 | .06 | .20 | .10 | Food Safety Lead (quality, 40K) |
| bakery | morning .70/.55, midday .25/.30, close .05/.15 | .02 | .12 | .15 | .15 | Food Safety Lead (quality, 42K) |

Seeds: `hygiene = clampN(56 + .3 * quality, 0, 100)`, `rating = clampN(2.4 + .02 * quality, 1, 5)`, menu 1 (Balanced), channel 0, hours 0. Quality 50 gives grade B (71) and rating 3.4, the neutral point.

Yearly rule (`foodFx`, new), with `calm = planFor(g, b, year, { calm: true })` and `U = calm.demand / max(1, calm.capacity)` (divided by 1.15 when hours is 1):

- **Peak squeeze**: `lost = min(.12, .5 * sum_d share_d * max(0, U * share_d / seat_d - 1))`. The first daypart fills at U .75 for a restaurant (dinner), .89 for a truck, .70 for a cafe, .79 for a bakery. Below that nothing is lost. A restaurant at U .85 loses 4.0%.
- **Rating** (1.0 to 5.0): `rating' = rating + .4 * (target - rating)`, `target = 2.4 + .02 * quality + gradeTerm + menuTerm - 1.5 * lost - 1.5 * max(0, b.price / priceBounds(b).going - 1.1)`. `gradeTerm` is +.3 at grade A and -.3 at C; `menuTerm` is -.2, 0, +.2. Demand factor `1 + .06 * (rating - 3.4)`.
- **Hygiene** (0 to 100): `hygiene' = hygiene + .35 * (target - hygiene)`, `target = 56 + .3 * quality + 22 * roleSkill(b, 'Food Safety Lead') + 12 * (st.audit === year) - 3 * sqrt(franchiseUnits(b)) - (b.morale < 35 ? 8 : 0)`. Grade A at 85, B at 65, else C. Grade C: demand x .92. At quality 50 an audit alone lifts hygiene to about 75; a skilled Food Safety Lead reaches grade A at the third yearly update (the second with an audit each year).
- **Menu** (lever): Lean unit cost x .93 and demand x .97; Balanced 1 and 1; Signature x 1.07 and x 1.05. Cost is `menuCost * (1 + .65 * waste0 * (.2 - .12 * staffPower(b, 'ops')))`, so waste moves cost by 0.8% to 1.6% (the bakery is the high end).
- **Delivery** (lever): channel 0 off, 1 platform, 2 own fleet. New demand is `s * (1 - .4)` for a platform and `s * (1 - .5)` for a fleet (the rest cannibalises sales you had). A platform pays 30% of `s * base * (1 + new)` as commission; a fleet pays 10% of that plus 1.5% of `base` a year. Both are booked as costs. A platform needs `bizHas(g, b.countryId, 'smartphone')`. At a 68% contribution margin a restaurant with idle seats nets about +1.6% of base on a platform and loses money above U .89.
- **Pandemic shield**: `shield = s * max(0, 1 - nationalMarket(g, b.industry, b.countryId, year).events.demand) * .8`. The engine already applies the loss; the shield returns up to 80% of the delivered share of it.
- **Extended hours** (lever): U / 1.15 in the squeeze, wages +5% (booked as a cost).
- **Season**: `1 + amp * seasonIndex(g, a, year, 'wx')`.
- **Audit** (lever, once a year): costs `max(1500 * level, .004 * base)` (`level` is `localEcon(...).level`), about $5,200 for a $1.3M restaurant; sets `st.audit = year`.
- `demand = (1 - lost) * ratingFactor * gradeFactor * menuDemand * season * (1 + new + shield)`.

Levers: Menu style (3 options, free), Delivery (3, free, trade and era gated), Hours (2, +wages), Kitchen audit (1 paid action).

Events (8; the generic `inspection` and `critic` are replaced for these trades):

| Id | Weight | Choices | Moves |
|---|---|---|---|
| inspection | 1.0 | Open the kitchen, Pay for an audit, Stall | P(fail) = clamp(.55 - hygiene/180, .03, .5), x .35 after an audit; fail: fine `max(2500 * level, .008 * base)`, hygiene -8, brand -7 |
| review | .6 | Comp the table, Invite the critic, Ignore it | rating +-; "critic" before `socialMedia`, "blogger" after (`bizHas`) |
| platformHike | .8 if channel 1 | Pay it, Move to own fleet, Drop the app | commission +5 points; the choices change `channel` |
| recall | .5 | Pull the item, Ride it out | cost, waste, hygiene |
| festival | .5 | Book a stall, Skip it | demand, cost; pays only with spare seats (U) |
| chefOffer | .5 | Match the offer, Let them go | quality, pay level |
| noise | .6 if hours 1 | Cut late hours, Soundproof, Ignore it | fine or `hours` reset |
| rush | .5, needs `socialMedia` | Add staff, Turn people away, Ride it | demand and rating by U |

Real-history hooks: the pandemic shield (`crash2020`), the bakery row in the history table (4.5), `bizHas` gates (smartphone, socialMedia), `eraFits` on every scene.

Interactions:

- **Franchise**: `franchiseUnits(b)` lowers the brand's hygiene target; royalties follow own sales per outlet, so grade and rating reach franchisees with no `franchise.ts` edit.
- **Supply**: no change to `b.supply`; `cost` flows into the purchase price through `costFactor`. "Waste" here is prep and plate waste; `supply.ts` spoilage stays storage only, so nothing is counted twice.
- **Board and groups**: audits and hours use `applyLever`'s board check; group rescue and internal services are unchanged. The generic `trend` event and `TRENDS` stay.

### 4.3 Family B: Care, Education and Personal Services (`care`)

| Trade | Visits/client (display) | Retention r0 | Crowd | Season amp | Payer disc/up/deny | Role (focus, pay) |
|---|---|---|---|---|---|---|
| clinic | 3.2 | .78 | .85 | .02 | .22/.55/.07 | Clinical Governance Lead (quality, 110K) |
| education | 1.6 | .55 | .90 | .05 | .30/.70/.02 | Registrar (quality, 60K) |
| gym | 1.0 | .68 | .80 | .06 | .15/.35/0 | Member Experience Lead (sales, 48K) |
| salon | 5.0 | .72 | .85 | .03 | none | Client Relations Lead (sales, 40K) |
| petCare | 5.0 | .70 | .85 | .03 | none | Pet Welfare Officer (quality, 42K) |
| homeCare | 4.0 | .74 | .90 | .02 | .25/.60/.04 | Safety and Vetting Officer (quality, 44K) |
| autoShop | 1.6 | .60 | .90 | .02 | .12/.30/.01 | Fleet Accounts Manager (sales, 58K) |

`complianceRole` and `retentionRole` below are the trade's one extra role: the compliance role (it moves `acc`) when its focus is quality (clinic, education, petCare, homeCare), the retention role (it moves the retention target) when its focus is sales (gym, salon, autoShop); the other term is 0.

Seeds: `loyal = r0`, `plans = planTarget = payer = 0`, `acc = clampN(62 + .3 * (quality - 50), 30, 90)`, intake 0. Clients on the desk = `b.last.sold / visits` (display only).

Yearly rule (`careFx`, new), with `U` as in Food, the intake cap `CAP = [1, .9, .75]` and `Ueff = min(U, CAP[intake])`:

- **Satisfaction**: `sat = clampN(.5 + (quality - 50)/160 + (morale - 60)/400 - 1.2 * max(0, Ueff - crowd), 0, 1)`.
- **Retention target**: `ret = clampN(r0 + .25 * plans + .004 * (acc - 60) + .30 * (sat - .5) + .04 * roleSkill(b, retentionRole), .35, .93)`. The client base moves `loyal' = loyal + .5 * (ret - loyal)`, so a lost stylist or a bad year takes two to three years to repair.
- **Loyalty demand**: `clampN(1 + .6 * (loyal - r0), .85, 1.15)`, computed from `loyal` at the start of the year. At the seed it is exactly 1.
- **Recurring plans** (lever, target 0, .2, .4, .6): `plans' = plans + clampN(planTarget - plans, -.10, .10)`. Plan members pay 6% less: cost `.06 * plans * base`. Plans also cut the season swing: `1 + amp * (1 - .6 * plans) * idx`. At .4 (with an 80% contribution margin) the lever costs more than it gains for three years, turns positive in the fourth and settles near +2.4% of base.
- **Payer mix** (lever 0, .2, .4, .6; clinic, education, gym, homeCare, autoShop): demand x `(1 + up * payer)`; cost `base * payer * (1 + up * payer) * (disc * (acc >= 80 ? .86 : 1) + deny * (1 - .25 * min(1, staffPower(b, 'finance'))))`. A clinic at .4 is +22% demand against about 14% of base in discounts and denials, so it pays only with idle capacity (U under .8).
- **Accreditation** (0 to 100): `acc' = acc + .3 * (target - acc)`, `target = 62 + 25 * roleSkill(b, complianceRole) + 20 * (st.program === year) + .2 * (quality - 50) - (U > .95 ? 6 : 0)`. Under 50 is provisional: demand x .93 and capacity loss .05. At 80 or more: demand x 1.04.
- **Intake** (lever: Open, Steady 90%, Protected 75%): `capLoss = intake > 0 && U > CAP ? (U - CAP) / U : 0`. It trades turned-away clients for satisfaction.
- **Program** (lever, once a year): cost `max(2000 * level, .006 * base)`, sets `st.program = year`.
- `demand = loyaltyDemand * (1 + up * payer) * accTier * seasonPlan * history`. A gym at U .82 with no levers: sat .476, retention .681, demand exactly 1.0.

Events (7):

| Id | Weight | Choices | Moves |
|---|---|---|---|
| accreditationReview | 1.0 | Prepare the files, Bluff it, Ask for time | P(pass) = clamp(acc/110 + (prepared ? .15 : 0), .1, .97); fail: acc -12 |
| starLeaves | .8 | Counter-offer, Let them go, Enforce the contract | `loyal` -.08 (-.03 if countered), pay level |
| payerAudit | .8 if payer > 0 | Pay the clawback, Contest it, Drop the contract | cost, `payer` -.2 |
| rush | .6 | Hire temps, Cap intake, Ride it | capacity, satisfaction (January, exam season, flu season by trade) |
| incident | .6 | Settle, Fight it, Report it | uses `b.insured`; cost, brand, acc |
| contractOffer | .5 if brand >= 30 | Sign it, Negotiate, Decline | plans +.1, payer +.1, discount |
| waitlist | .4 if loyal above r0 | Open more hours, Keep it small | `loyal` +.04, cost |

Real-history hooks (the engine's `EXPOSURE` covers gym and salon already, so this fills only unmapped trades): `crash2020` strength `s` (via `activeMarketEvents`): clinic demand x `(1 - .08 s)`, education `(1 - .10 s + .06 s * bizHas internet)`, petCare `(1 + .05 s)`, homeCare `(1 + .06 s)`. These are modelled approximations, and the desk text says so (`sectorHistoryLine`, section 4.5). autoShop is already mapped to `fuel`, which `housing2008` hits, so it gets no row.

Interactions:

- **Franchise**: six of the seven trades franchise; `loyal` and accreditation move own sales per outlet, so royalties follow. A provisional tier does not block franchising (non-goal).
- **Supply**: only autoShop has a profile, untouched.
- **Licence**: the clinic's `licencePremium` stays; the Clinical Governance Lead is a separate lever on `acc`.
- **Board and groups**: as in Food.

### 4.4 Family C: Utilities, Land and Fleets (`util`)

| Trade | Wear/yr | Weather amp (hits) | Reg floor | Spot share | Spot vol | Disc | Fuel | Overhaul (of base) | SLA | Role (focus, pay) |
|---|---|---|---|---|---|---|---|---|---|---|
| energy | 5 | .03 capacity | .50 | .50 | .18 | .04 | .45 | .020 | no | Reliability Engineer (ops, 130K) |
| solar | 3 | .07 capacity | .30 | .40 | .12 | .05 | 0 | .020 | no | Asset Manager (ops, 95K) |
| water | 4 | .06 capacity | .80 | 0 | 0 | 0 | .10 | .025 | no | Network Engineer (ops, 85K) |
| telecom | 5 | .02 capacity | .30 | 0 | 0 | 0 | 0 | .020 | yes | Network Reliability Lead (ops, 110K) |
| dataCenter | 4 | .04 cost | 0 | .30 | .15 | .05 | .30 | .025 | yes | Facilities Engineer (ops, 120K) |
| farm | 3 | .22 capacity | 0 | .80 | .20 | .05 | .20 | .025 | no | Irrigation Engineer (ops, 62K) |
| logistics | 6 | .05 capacity | 0 | .50 | .15 | .05 | .40 | .020 | yes | Fleet Maintenance Chief (ops, 70K) |

Seeds: `condition = clampN(80 - min(25, 2 * (fiscal - b.founded)), 40, 95)`, `contract = max(floor, 1 - spot)` (it may sit between steps; the first change snaps to the grid), hedge 0, cover 0. Overhaul cost is `share * base` with a floor of `2000 * level`.

Yearly rule (`utilFx`, new), `bad = max(0, -idx_wx)`, `good = max(0, idx_wx)`. Utilities write no demand multiplier (`demand` is 1); output, cost and money carry the effects.

- **Condition**: `cond = condition + 12 * (st.overhaul === year)` is used for the year's outage odds, then `condition' = clampN(cond - wear + 4 * roleSkill(b, role), 0, 100)`. An unattended plant falls below condition 65, where outage odds start to rise, in 3 to 5 years (wear 3 to 6 a year from a seed of 80). The `wear` column is the one calibration knob.
- **Outage**: `P = clampN(.03 + max(0, 65 - cond)/180 + .05 * bad, .02, .45) * (1 - .5 * roleSkill)`. It is realised by a hashed draw (`seasonIndex(..., 'out')`), not `g.rng`. A hit gives outage loss `.15 + .35 * (1 - cond/100)` (cap .5), a repair cost of `.8 * overhaulCost`, an SLA cost of 1.5% of base for SLA trades, and `outages + 1`.
- **Weather**: capacity trades lose `amp * bad * (1 - .5 * cover)` of capacity; good years cut unit cost by `.5 * amp * good`. dataCenter takes cost `1 + amp * bad` (cooling). Total `capLoss = 1 - (1 - weatherLoss) * (1 - outageLoss)`. Cover (lever 0 or 1) costs `.006 * base`.
- **Spot and contract** (trades with spot vol above 0): settlement `(1 - contract) * vol * idx_spot * base`, booked as income when positive and as a cost when negative, zero mean. Moving off the seed mix earns or pays `(contract0 - contract) * disc * base`. Options are steps of .25 from the regulated floor to 1. Regulated trades (water, telecom) have no spot lever.
- **Hedge** (lever 0, .5, .8; trades with fuel above 0): `f = nationalMarket(g, b.industry, b.countryId, year).events.costs` (the engine already applied it), `cost = 1 - hedge * fuel * (f - 1)`, premium `.025 * hedge * fuel * base`. In a glut year the hedge pays for being wrong.
- **Overhaul** (lever, one paid action a year): sets `st.overhaul = year`. For an energy plant at condition 60 and $8.6M of base it costs $172K and cuts expected outage loss by about 5% of output over the next three years (1.0%, 2.0%, 2.5%). At condition 75 it cuts almost nothing. Its value is positive below about 62 and negative above (a test pins both).

Levers: Overhaul, Contract mix, Fuel hedge, Weather cover.

Events (7):

| Id | Weight | Choices | Moves |
|---|---|---|---|
| storm | 1.0, up as condition falls | Pay for crews, Run degraded, Buy cover power | capLoss, cost, condition |
| rateCase | .8 if floor >= .5 | File for an increase, Accept the cut, Settle | income or cost; regulated trades |
| fuelSpike | .7 if fuel > 0 | Hedge now, Pass it on, Absorb it | cost; can set `hedge` |
| subsidy | .5 for energy, solar, water, farm | Apply, Skip it | income, paperwork cost |
| bigCustomer | .6 for dataCenter, telecom, logistics | Offer a discount, Let them go, Lock a contract | demand, `contract` |
| shortage | .6 for logistics, farm, dataCenter | Raise pay, Hire temps, Cut routes | pay level, capacity (drivers, harvest hands, technicians) |
| recall | .4 | Replace now, Wait | condition, cost |

Real-history hooks: the hedge reads the engine's own `events.costs` from `oil1973`, `oil1979`, `oil2008`, `oilGlut` and `crash2022`. Solar's `clean` exposure and the rest of `EXPOSURE` already drive demand and are not repeated. `eraFits` on all text; telecom's broadband copy is gated on `bizHas(g, b.countryId, 'internet')`.

Interactions:

- **Supply**: only farm has a profile; weather writes `capacityLoss`, which `bookSupply` already reads as capacity. No profile is added (the services pin in `world2-business-supply.test.ts` holds).
- **Franchise**: none of the seven franchise.
- **Groups**: `conglomerate-econ.ts` relatedness and `group-services.ts` internal contracts are untouched; internal invoices post later through the same two channels and the layer never reads them.
- **Board**: the CEO funds overhauls inside `capexLeft` and the reserve.

### 4.5 Copy, voice and the history table

All strings follow `docs/VOICE.md`: contractions, no encouragement, scene 140, outcome 120, log 90, tooltip 120, choice label 5 words, scenes end with "What will you do?", numbers through `money`. No U+2014 anywhere, and no unicode escape for it either (the voice lexer decodes escapes; the count must stay exactly 24).

| Kind | Sample | Characters |
|---|---|---|
| Scene | An inspector walks into the kitchen at 11:40. The lunch rush starts in twenty minutes. What will you do? | 104 |
| Scene | Your ${person} gave notice. ${n} regulars have booked with them at the new place. What will you do? | 86 |
| Scene | A storm took out two lines overnight. The crews need a decision by noon. What will you do? | 90 |
| Outcome | The inspector found raw chicken above the salad. Grade down to ${grade}. Fine ${money}. | 71 |
| Outcome | ${n} clients followed them. Your retention fell to ${pct}. | 48 |
| Log | ${name} dropped to a ${grade} grade. | 21 |
| Tooltip | Audit: ${money}. Raises hygiene about 12 points this year. | 50 |

History rows (`SECTOR_HISTORY` in `sector-data.ts`, read through `activeMarketEvents`): `crash2020`: clinic -.08, education -.10 (+.06 with `internet`), petCare +.05, homeCare +.06, bakery +.03. Mapped trades get no row (the engine's `marketEventFactors` already covers them, autoShop included). Care and Food headers show one line while a row is active: `The 2020 crash moved your demand by about -8%. That's a rough estimate.`

### 4.6 Decisions to confirm in review

1. One record per company, three numeric families, no per-trade state shapes. A fourth family is a table, an effect function and a lever list.
2. An observation year after the record appears, for old saves and new companies alike, so single-year runs and old saves book exactly as before.
3. The hook never calls `g.rng`; outages, weather and spot prices are hashed draws. Only events use `g.rng`.
4. Levers change once a year and cost money or a stated trade-off; the CEO works them only above skill 75.
5. One extra key role per trade, merged into `INDUSTRIES` once, so every existing reader sees it.
6. No valuation hook. Selling a run-down plant is not penalised in this slice (risk in section 8).
7. The generic `inspection` and `critic` events are replaced, not duplicated, for food companies with a live record. The family inspection has no bribe choice: the generic one's envelope, karma and sting do not carry over.
8. The owner and a hired CEO above skill 75 can both pull a lever; they share the once-a-year key.
9. Food and Care show one rough-estimate line while a history row is active.

## 5. Deferred families (roadmap, not built here)

| Family | Trades | Mechanics to build later |
|---|---|---|
| Hospitality and Live Events | hotel, entertainment, travel (casino, nightclub, stripClub join the venue sidecar) | Room inventory x occupancy x rate (RevPAR), day-of-week and season calendar, corporate/leisure/OTA mix and commissions, star rating, renovation cycle; tour and festival P&L, ticket tiers, sponsorship, weather cancellation cover; agency commission vs package margin, supplier failure, FX exposure. Reads `isIndustryLegal(..., g)`, not `venueLegal`. |
| Retail and Consumer Brands | grocery, fashion, beauty, ecommerce | SKUs and inventory turns, markdown and clearance, fashion seasons and drops, shrink, private label, ecommerce funnel (traffic x conversion x basket, returns, CAC), channel mix and landed cost with tariffs, recalls, loyalty base. |
| Industrial Production | manufacturing, battery, packaging, furniture, recycling, brewery | Lines with bill of materials and yield, order book and customer concentration, utilisation and changeover, commodity pass-through, certifications, recycling gate fees vs commodity prices and contamination, brewery batches and excise tiers. Adds `CAPACITY_LINES` for the four clones. |
| Projects and Property | construction, realEstate | Tender pipeline with win rates (replaces the single `bid` event), backlog and WIP, progress billing and retainage, overruns, bonding, safety record; listings, commission splits, management book, development and flips; reuses `landlord.ts` ideas. |
| Digital and Agency | software, marketing | ARR, churn and net retention, pipeline, tech debt, uptime; agency retainers vs projects, utilisation, concentration, pitch win rates, key-person risk. |
| Later work for the built families | all 18 | Bar and nightclub on the food grade; education terms and cohorts; clinic doctor-hours; telecom spectrum and subscribers; data-center MW pre-leasing; a CEO resume per family; valuation and sale-screen effects of condition and grade; family rows in the annual report; fixes to the clone quirks. |

Suggested next order by trades covered: Industrial (6), Hospitality (3 plus venues), Retail (4), Projects (2), Digital (2). The framework needs only a new table, a `FamilyId`, an effect function and a lever list per family.

## 6. Balance guards and exploit risks

- **Mean-preserving draws.** Seasons, weather and spot prices are `1 + amp * index` with mean 0. A test over 400 hashed company-years per trade at neutral levers (use .5) pins mean demand within .97 to 1.02 and mean cost within .995 to 1.02 for food and care. Utilities pin the analytic mean instead, because weather is one-sided (4.4).
- **No free lever.** Every option has a priced side: lean menu loses demand, a platform pays commission, plans cost 6% of base, payer mix discounts, a hedge pays a premium, an overhaul costs 2% to 2.5% of base. A test per family checks that the best option by `leverValue` changes with utilisation or condition (no dominant row).
- **One change a year** per lever (`useYearAction`); plans move at most .10 a year; paid actions once a year; the hired CEO makes at most 2 changes a year and never spends into the reserve.
- **Bounded writes.** `fx.demand` .80 to 1.35, `fx.cost` .90 to 1.12, `capLoss` at most .35, `open` at least .8, random money at most 12% of `baseRevenue`. A hostile record cannot exceed these (`readSector` clamps).
- **No foresight.** Hints and the CEO use `'expected'` mode. A test counts `'book'`-mode evaluations during hints, previews and the CEO's scoring (none), and compares `leverValue` with a fixed worth and context across two lives with different `lifeId` (identical).
- **Save-scumming.** Draws are hashes of life, asset and year, so reloading re-rolls nothing; event rolls use the persisted `g.rng`.
- **Milking before a sale.** Skipping overhauls saves 2% to 2.5% of revenue a year and costs rising outage odds; valuation does not read condition (non-goal), so the exposure is bounded by the outage cap (.45) and the repair and SLA costs. Listed as a risk, not fixed here.
- **Delivery arbitrage.** Commission is charged on the delivered share plus new demand, and the benefit is capped by U, so adding delivery at full seats only loses money.
- **Small companies.** Costs have a floor of `1500 * level` or `2000 * level`; first-year companies use the calm plan as `baseRevenue`.
- **Double counting.** Waste vs supply spoilage, hedge vs the engine's `events.costs` (the hedge offsets it, never repeats it), history rows only for unmapped trades.
- **Observation year.** A company never gains by timing it; it only delays effects by one year.

## 7. Tests

Commands for every plan task: `npm run typecheck`, then `npx vitest run --maxWorkers=1 <only the files named in that task>`. The machine has 4 CPUs shared by four tracks, so never omit `--maxWorkers=1`, never run the full suite, and never add a file the task does not name. Release notes and the version bump happen at integration.

New files (all under `test/`):

- `sector-state.test.ts`: `readSector` on hostile input (NaN, wrong family, version 2, 100 diary lines, a huge ledger); round trip; absent stays absent; `SAVE_SCHEMA` still 2.
- `sector-core.test.ts`: the observation year writes nothing and equals the v3.0.0 booking; idempotence (call twice, same state); money conservation (`b.cash` delta equals `yearIncome - yearCosts` delta, ledger equals both); bounds; mean-preserving draws; determinism (same seed, same result); no `g.rng` use in the hook (rng state unchanged).
- `sector-events.test.ts`: one event per company-year; token check and replay refusal; hint equals the resolver's expected value; branch probabilities sum to 1; event load at most .45; generic `inspection` and `critic` weight 0 for food with a live record and unchanged in the observation year.
- `sector-menu.test.ts`: menus are pure (state and rng unchanged); lever authorization (direct call without ownership, in jail, under age, board vote, a second change in a year); the hired-CEO header line.
- `sector-food.test.ts`, `sector-care.test.ts`, `sector-util.test.ts`: each formula at its starting numbers (squeeze thresholds, grade bands, retention repair time, payer value with idle and full capacity, condition decay, outage odds, hedge offset, overhaul value sign); every trade of the family runs 12 years with finite numbers.
- `sector-ceo.test.ts`: `outlook(...).modeled` is true for one trade per family; skill 76 changes at most 2 levers and skill 75 none; letter lines of at most 12 words with their numbers.
- `sector-story.test.ts`: 18 trades x 3 seeds x 12 years: median profit within .90 to 1.10 of the classic run at neutral levers, no NaN, no cash spiral caused by the layer alone.
- `sector-voice.test.ts`: every scene, outcome, log, tooltip and label obeys the caps and the helpers in `scripts/voice/rules.mjs`; no em-dash and no escape for it.

Regression set, run once in Task 9 only: `test/business-expansion.test.ts` (55 trades), `test/business-save-normalization.test.ts`, `test/business-venues.test.ts`, `test/franchise.test.ts`, `test/ceo.test.ts`, `test/ceo-letter-voice.test.ts`, `test/company-dashboard.test.ts` (role counts), `test/world2-business-supply.test.ts`, `test/heavy-data.test.ts`, `test/voice-guards.test.ts`, `test/save-schema.test.ts`.

## 8. Risks

- **Seeded drift.** From the second year, a family company's `g.rng` stream differs from v3.0.0 because the event roll moves. The observation year keeps first-year runs identical, but multi-year seeded tests that use these trades may need re-baselining. The full suite runs once at integration, not per task; Task 9 names the likeliest files.
- **Merge conflicts** in the four hot files. Every hunk is additive and separate; each task re-reads the file before editing and keeps hunks to one to three lines.
- **Role count.** One extra role raises `maxKeyStaff` for small multi-site companies (a foodTruck with 3 sites goes from 3 to 4 key people). Intended; `company-dashboard.test.ts` reads role counts dynamically.
- **Event load** rises by about a third for the 18 trades. The pin is .45.
- **Cost of `planFor`** in hooks and hints: one calm plan per company per year in the hook; hints are memoised.
- **Calibration.** 18 trades from three tables, never tuned against play. The story test bounds drift; table numbers are expected to move in review.
- **Inherited clone quirks** (telecom and dataCenter software scaling, water and solar fuel price category) stay as they are and may make some tables look odd. They are a separate release.
- **Copy.** About 150 new strings; `sector-voice.test.ts` and `voice-guards.test.ts` guard the caps and the exact em-dash count of 24.

## 9. Build order (9 plan tasks)

| Task | Creates | Modifies |
|---|---|---|
| 1 Framework state, hook, money | `sector-state.ts`, `sector-data.ts` (shell, `SECTOR_ROLES`, `withSectorRoles`), `sector-kit.ts`, `sector-core.ts`, `sector-families.ts` and three placeholder play files, `test/sector-kit.ts`, `test/sector-state.test.ts`, `test/sector-core.test.ts` | `state.ts` (2), `yearly.ts` (import, hook call), `industries.ts` (3), `staff.ts` (2) |
| 2 Events engine, menu shell, CEO step | `sector-events.ts`, `sector-menu.ts`, `sector-ceo.ts`, `test/sector-events.test.ts`, `test/sector-menu.test.ts`, `test/sector-ceo.test.ts` | `yearly.ts` (import, event line), `manage.ts` (2), `board-ceo.ts` (2), `events.ts` (2) |
| 3 Food state and math | `sector-food.ts`, `test/sector-food.test.ts` | `sector-data.ts` |
| 4 Food levers, events, copy | `sector-food-play.ts` | `sector-data.ts`, `test/sector-food.test.ts` |
| 5 Care state and math | `sector-care.ts`, `test/sector-care.test.ts` | `sector-data.ts` |
| 6 Care levers, events, copy | `sector-care-play.ts` | `sector-data.ts`, `test/sector-care.test.ts` |
| 7 Utilities state and math | `sector-util.ts`, `test/sector-util.test.ts` | `sector-data.ts` |
| 8 Utilities levers, events, copy | `sector-util-play.ts` | `sector-data.ts`, `test/sector-util.test.ts` |
| 9 Story, voice, regression | `test/sector-story.test.ts`, `test/sector-voice.test.ts` | none (fixes only) |

Tasks 3 to 8 can run in parallel after Task 2 as three pairs (food, care, util); each pair edits only its own files plus its own rows in `sector-data.ts`. Task 9 runs after all of them, once, with the regression set above. Shared checkout rule from the heavy R&D plan applies: commit with explicit pathspecs, never `git add -A`, and keep the attribution trailers.
