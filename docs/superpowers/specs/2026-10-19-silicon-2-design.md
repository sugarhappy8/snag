# Silicon 2.0: one market price, chip lanes, and goodwill in the 2024-2027 squeeze (design)

Date: 2026-10-19 · Status: draft for approval, written against main v3.0.0 (HEAD `d061c0d`) and the release 1 and 2 interfaces below, not implemented · Release 3 of 8

Depends on release 1 (tech waves: `announceWave`, `readTechWaves`, `RdResult.won`, `afterResearch` gaining `won` and `approved`) and release 2 (AI Lab 2.0: `src/game/business/scorecard.ts`, `TECH_VERSION` 4). Silicon 2.0 adds its fields under version 4 and does not bump it again: v4.0.0 is one unreleased release, so no saved v4 exists yet.

## 1. What the player asked for

> a semiconductor company that sells GPUs and similar chips below the market price in 2024-2027 wins customers over (release 1 spec, request 5a)

In one play session this means:

1. Own a chip company in 2024 to 2027. Open Chips & Fabs and see the chip lines the company sells (general chips, graphics, accelerators), each with a price, set against one market price.
2. Pick a price below the market for the accelerator line and ship it. The Annual Report says what happened: goodwill, the price position, how much of demand was supplied.
3. See it matter. Customers warm to the company (brand rises, slowly, with a cap), a rival may answer with discounts of its own, and a chip-leap milestone makes the news.
4. Find that a cheap price you can't supply earns almost nothing, and that a price below cost earns nothing extra.
5. Hand the company to a hired CEO and have the CEO respect the pricing policy you set.

## 2. What the audit found (v3.0.0)

- **One unit, one price.** `industries.ts` `semiconductor`: price $40, unitCost $18, demand 500,000 per design center, elasticity 1.3. `deeptech-sim.ts` `simulateDeepTechYearImpl` books `revenue = sold * b.price`. The `product-data.ts` chip kinds are inert for a lab. The only GPU is the one-shot program `aiChip` in `deeptech-data.ts` `PROGRAMS.semiconductor` (2 years, $15M, 60%, needs stage 2 and node index 2, premium +0.25, boost +0.3, hype +15, level +8).
- **Where the price is set.** Once a year in the Annual Report (`techReportData`, `TECH_REPORT`, `AnnualReport.tsx`): a slider from 0.25x to 4x of `techPriceBounds().going`, so its floor ($10 at the US baseline) is below the $18 unit cost. Events and moves edit `b.price` (`priceOffensive`, the price wars in `competition-events.ts`, deep-tech events, `evolve` shaving inflation). A hired CEO is re-planned inside `simulateDeepTechYearImpl` (the `!runs` block) and in `deepTechManagerTurnImpl` with `bestTechPlan` plus a skill-sized slop, and ignores any player intent.
- **Three references.** (a) `techPlan.going` is `localEcon().goingPrice * techPremium` (node x(1 + 0.12 node), R&D premium, and the random chip-cycle price only when `!calm`). (b) `techPlan.suggested` is `going * premiumOf(b)`, always calm. (c) The raw `localEcon().goingPrice`, used by `marketViewOf` (`priceRatio`, the antitrust gouge flag over 1.6) and `mySegment`. `techMarketNote` prints (c) and (a) in one sentence.
- **Customers.** Price acts only through `priceResponse(price / (going * premium), 1.3)` inside `techPlan` and the share model in `marketDemand` (network pull, `edge`). Nothing carries a price into brand, hype or loyalty. `AnnualReport.tsx` `priceTip` says "Bargain pricing. Customers will love you" at or under 0.85x the suggested price. Nothing is behind that line.
- **Brand and value.** `evolve` pulls `b.brand` 20% a year toward a quality-based target, and `afterDeepTechYearImpl` then adds `(t.hype - 40) / 20`. In `operatingValue` brand enters only `profitValue` (`0.85 + brand / 333`). Hype enters `hypeMult`, and the market-event value factor (x1.6 to x1.8 for chips in 2024-27) multiplies `hypeMult` only.
- **Capacity.** Demand above capacity becomes `st.unmet` and goes to rivals in `refreshMarket` (`served = sold / demand`). There is no other penalty.
- **Years.** `yearlyBusinessImpl` books `fiscal = g.year - 1` in this order: `simulateDeepTechYear`, `refreshMarket`, `evolve`, `afterDeepTechYear`, then `queueReport` for the next fiscal year. `techPlan` takes the fiscal year (the report passes `g.year`). `prunePricePromises` removes last year's price promise before booking.
- **2024-2027.** `PRESENT_YEAR` is 2026. The `aiBoom` market event (strengths 2024 .75, 2025 1, 2026 1, 2027 .8; home us, abroad x0.7) gives chips demand +0.25 (x0.35 for a world market) and value +0.8. The chip size curve is already 0.85 (2024) to about 1.06 (2027). There is no scripted chip shortage: `industryCycle` is seeded per life, and the deep-tech `shortage` event and the aiLab `gpus` event are year-blind.
- **Rivals** have no prices. `RivalView` carries `seg` (the price tier of a real firm), `quality`, `tech` and `share`. `priceOffensive` answers with `seeded(`${familyId}|retaliate|${a.id}|${g.year}`).chance(0.4)` and `st.mods[top.id] = { mult: 1.1, until }`, which `buildCtx` applies through `modOf`.
- **Screen and state.** `chipsNodes` shows node, fab count, export controls and a deal, with no price or share rows. `readTech` is the only whitelist of `TechState`. `techOf` re-normalizes only when `v !== TECH_VERSION`, so a field added under the current version can be missing on a live object.

## 3. Scope and non-goals

In: chip lanes with a price each; one canonical market-price reference per lane and year; goodwill; the 2024-2027 window table; rival reaction; a pricing policy for hired CEOs and the hint; Chips & Fabs rows; one Annual Report line; a launch choice; one news wave.

Not in this release: a new `MinigameKind`, a new trade, a new R&D program (so no autopilot unlock changes); per-lane market shares (rival shares exist per market only); stored rival prices; a sister company as a chip customer (release 4); a link to `computeRent`; changing the antitrust `priceRatio`, the `shortage` event or the `rivalPriceWar` event; any effect on listed stock prices (release 1b); events invented after 2027; sliders inside the Annual Report component (decision D2).

## 4. The design

### 4.0 A year in play

1. **Planning, fiscal year Y = `g.year`.** The Annual Report sets the headline price and production. Chips & Fabs sets each extra lane's discount and the pricing policy, any time. Every price read is the pure `techPlan` family with `year = g.year`.
2. **Booking, at the next age-up.** `simulateDeepTechYearImpl` plans fiscal Y with the lanes, books `revenue = sold * plan.mix`, and runs `bookSilicon` (goodwill). `refreshMarket` and `evolve` follow. `afterDeepTechYearImpl` applies the brand step, the rival reaction and the leap check. The new report then shows the result.
3. **Program wins.** A win of `aiChip` or `node` reaches `afterResearch` inside the same booking and may open the launch choice (4.8).

### 4.1 One reference and one index

Next to `techPlan` in `deeptech-core.ts`:

```ts
/** price against its market reference: 1 = at the market, below 1 = cheaper. Pure. */
export function priceIndex(price: number, reference: number): number   // clampN(price / reference, 0, 10); 1 if reference <= 0 or price is not finite

/** What the market charges for a product like yours: one lane, one fiscal year. Calm: never the chip-cycle price. */
export function marketReference(g: GameState, b: BizState, t: TechState, lane: ChipLane, year: number): number
// round2(max(0.01, goingPrice * techPremium(b, t, year, true, g)) * premiumOf(b)) * (1 + SHORTAGE_MARKUP * lane.shortage * shortageIntensity(b.countryId, year))
```

`marketReference` repeats the two lines of `techPlan` that make `suggested`, and `techPlan` keeps its own lines as they are, so every other trade stays bit-identical. For the core lane it equals `techPlan(..., { calm: true }).suggested`, and a test pins that.

The reference includes the product's tech premium and its quality and brand premium. That is exactly the ratio the demand model already feeds `priceResponse`, so a 2nm chip priced at its own premium sits at 1.0 and is not "overpriced". It excludes the random chip cycle, so the Annual Report and the booking show the same index, and a shortage year can't make a fixed price look cheaper. `SHORTAGE_MARKUP` is 0.12: in a squeeze, street prices run above list. The markup moves only the reference. It never touches demand or revenue (guard G1).

New code uses only this reference. Old code keeps the old ones where it reads them (section 3). For a chip company `techMarketNote` drops its two-number sentence and says `Chips like yours sell for about ${money(reference)} here.`

### 4.2 Lanes

A lane is a line of the chip business with its own price. Lanes share one abstract unit, one unit cost, one capacity pool and one elasticity. What differs is whether the lane exists, what share of unit demand it carries, and how exposed it is to the squeeze. New pure leaf `business/silicon-data.ts` (`import type` only, so `deeptech-state.ts` can import it to validate lane ids):

```ts
export type ChipLaneId = 'core' | 'gfx' | 'cpu' | 'mem' | 'accel'
export interface ChipLane { id: ChipLaneId; label: string; noun: string; from: number; stage: number; plant?: number; needs?: string; weight: number; shortage: number }   // noun: the slider label, e.g. 'accelerators'
export const CHIP_LANES: readonly ChipLane[]
export function laneOpen(lane: ChipLane, t: { stage: number; plant: number; done: readonly string[] }, year: number): boolean
```

| id | label | from (fiscal) | needs | weight | shortage |
|---|---|---|---|---|---|
| core | General chips | any | stage 1 | the rest | 0 |
| gfx | Consumer graphics | 1995 | stage 2 | 0.20 | 0.4 |
| cpu | Data-center CPUs | 2000 | stage 2 | 0.15 | 0 |
| mem | Memory | 1970 | own fab (plant 1) | 0.15 | 0.5 |
| accel | Data-center accelerators | 2023 | stage 2 and program `aiChip` done | 0.25 | 1.0 |

`from` is the first fiscal year a lane can exist. Accelerators open with the first year of the `aiBoom` row and need the program the game already has. Weights of open extra lanes sum to at most 0.75, so `core` keeps at least 0.25: the `core` row stores 0.25, and its live weight is one minus the open extras. `core` sells at the headline, so it is never stored in `silicon.lanes`. `shortage` is how hard the squeeze (4.3) hits the lane: accelerators and high-bandwidth memory were the scarce goods, general chips and server CPUs were not.

**Prices.** A lane's price is the headline price times one minus its discount: `p_s = b.price * (1 - disc_s)`, with `disc_s` in 0 to 0.5 and default 0. The headline `b.price` stays the one number the Annual Report sets, `core` always sells at it, and a lane can only go below it. So every existing writer of `b.price` (price wars, `priceOffensive`, events, inflation, hired CEOs, `priceCapOf` promises) moves every lane the same way, and no lane can break a promise.

**The blend.** Inside `techPlan` it replaces the one `priceResponse(...)` factor in the `bu` product. It is applied after `marketCtxFor`, never inside `buildCtx`, so the planner's ctx cache is untouched:

```
open lanes s;  w_core = 1 - (sum of the open extra weights)
raw_s    = w_s * priceResponse(p_s / (going * premium), elasticity)     // the ratio the model already uses
response = sum raw_s ;  share_s = raw_s / response ;  mix = sum share_s * p_s
```

When every discount is 0, `techPlan` takes the old expression unchanged (`response = priceResponse(price / (going * premium))`, `mix = price`), so a company that never touches a lane is bit-identical.

```ts
export interface LaneRow { id: string; price: number; ref: number; index: number; share: number }
// TechPlan gains: lanes: LaneRow[]   (empty for other trades)    mix: number
// LaneRow.ref is always the calm reference, whatever the plan's `calm` flag, and is taken when the plan is made
// bestTechPlan returns: { price, production, profit, limit?: number }
// MarketView gains: index?: number     SegmentRow gains: others?: number[]
```

`response` and `mix` take no year, so the window can't enter demand. Total demand passes through `marketDemand` once, as today, and the units split by `share_s`. Capacity is shared: when it binds, every lane is served in proportion to its demand.

**The books.** `simulateDeepTechYearImpl` uses `revenue = sold * plan.mix` and `stmt.price = round2(plan.mix)`. With no discounts that is the old `sold * b.price`. Revenue stays one product, so nothing is created or lost between lanes (accounting conservation). `bestTechPlan` still searches the headline price at the current discounts and its profit uses `plan.mix`. Its inner contribution moves, unchanged, into an exported `planContribution(g, b, plan)` that the launch hint (4.8) reuses.

### 4.3 The 2024-2027 window

Beside the `aiBoom` row in `history/market-events.ts`, outside `MARKET_EVENTS` (so it can't touch the `marketEventFactors` pins in `market-events.test.ts` or the announcement popup):

```ts
export const GPU_SHORTAGE: Readonly<Record<number, number>> = { 2024: 0.9, 2025: 1, 2026: 0.7, 2027: 0.4 }
export function shortageIntensity(country: string, year: number): number
// eventStrength({ ...MARKET_EVENTS.find((e) => e.id === 'aiBoom')!, years: GPU_SHORTAGE }, country, year)
```

It reuses the boom's geography (home us, abroad x0.7) by spreading the `aiBoom` row into `eventStrength`, so the two can't drift. The values are starting points tuned in tests. The shape is the contract: a peak in 2025, a fading tail, and `0` before 2024 and after 2027. Nothing is invented. The squeeze enters the model in exactly two places: the reference markup (4.1) and the goodwill rate (4.4).

### 4.4 Goodwill

```ts
export interface SiliconYear { year: number; index: number; served: number; depth: number; win: number; step: number; perf: number; quality: number }
export interface SiliconState {
  goodwill: number                  // 0-100, 50 = neutral
  lanes: Record<string, number>     // discount by lane id, 0-0.5
  ceiling: number                   // pricing policy: cap on the headline index for hired CEOs and the hint; 0 = none
  lead: number                      // last fiscal year the chips led the field on performance; 0 = never
  applied: number                   // fiscal year the after-year step last ran
  last: SiliconYear | null
}
// TechState gains: silicon?: SiliconState   (optional)
```

Once a year, for a semiconductor company at stage 2 or more, `bookSilicon` runs inside `simulateDeepTechYearImpl`, right after `b.last = stmt` and before `afterResearch`. It reads the year's own plan (the fiscal `year`, `plan.lanes`, `plan.unitCost`) and the booked `stmt.sold` and `stmt.demand`. The plan is made before `advancePrograms`, so a program that finishes this year (an `aiChip` win lifts `premium` 0.25) can't lift the reference under a price that sold last year's product. Only lanes with `shortage > 0` count, weighted by `X_s = w_s * shortage_s`:

```
ref_s  = plan.lanes[s].ref                                           // marketReference, calm, taken when the plan was made
I_s    = priceIndex(p_s, ref_s)
f_s    = clampN(unitCost / ref_s, 0.3, 1)                            // margin guard: below cost earns nothing extra
E_s    = max(I_s, f_s)
Ebar   = sum X_s * E_s / sum X_s             (1 when sum X_s = 0)
depth  = clampN(1 - Ebar, -0.4, 0.4)         // positive = cheaper than the market
served = clampN(stmt.sold / stmt.demand, 0, 1)   // the ratio refreshMarket uses; 0 when demand is 0
win    = shortageIntensity(country, year) * min(1, sum X_s / 0.25)
target = 50 + 100 * depth * (depth > 0 ? served : 1)     // a cheap price counts as far as you supplied it; a dear one counts in full
delta  = clampN(0.45 * win * (target - g) + 0.12 * (1 - win) * (50 - g), -8, 8)
g'     = clampN(g + delta, 0, 100)           // when sold is 0 there is no price effect: delta = 0.12 * (50 - g)
```

Read it as one smoothed score. Inside the squeeze the goodwill is pulled toward the price position, by up to 45% of the gap and at most 8 points a year. Outside it, or without an exposed lane, it relaxes toward 50 at 12% a year. So love grows only in 2024-2027, fades after, and nothing is invented after 2027. `bookSilicon` stores nothing until the first fiscal year with `win > 0` (or until a `silicon` object already exists), so every year before 2024 stays byte-identical to v3.0.0. It writes `year`, `index` (`Ebar`), `served`, `depth`, `win` and `step`; `afterYearSilicon` fills `perf` and `quality` after `evolve`. It is idempotent behind `last.year`.

**Brand channel.** In `afterDeepTechYearImpl`, `b.brand` becomes `round(clampN(b.brand + (t.hype - 40) / 20 + brandStep(g'), 0, 100))`:

```
brandStep(g) = clampN(sign(g - 50) * max(0, |g - 50| - 3) / 10, -1.5, 3)       // dead zone of 3 points
```

`evolve` pulls brand 20% a year toward its target, so a steady step of `s` holds the lift near `5 s`: at most +15 brand (goodwill 83 or more) and at least -7.5. Hype is never touched by price (guard G2). Brand reaches valuation only through `profitValue` (about +4% at +12 brand, and only while the profit branch binds) and demand through `appealOf`, which is the point of the feature. Goodwill never multiplies by a market-event factor.

**Worked example** (starting numbers; a US lab with accelerator and graphics lanes open, headline at the suggested price, unit cost 45% of the reference). Goodwill at the end of each year:

| Accelerator discount, served | 2024 | 2025 | 2026 | 2027 | 2028 | 2030 | peak brand step |
|---|---|---|---|---|---|---|---|
| none, 0.9 | 53 | 55 | 55 | 55 | 54 | 53 | 0.2 |
| 15%, 0.9 | 57 | 62 | 62 | 62 | 60 | 58 | 0.9 |
| 30%, 0.9 | 58 | 66 | 68 | 68 | 66 | 62 | 1.5 |
| 30%, 0.3 | 54 | 56 | 57 | 56 | 56 | 54 | 0.35 |

A company that keeps the suggested price drifts to 53-55 because it sits under the squeeze's street price: worth about +1 brand at most. A supplied 30% cut reaches the "warm" band and a lift of about +7 brand. The same cut with 30% of demand supplied earns about a quarter of the step. By a hand estimate from the `priceResponse` table at a 55% margin, a 15% accelerator cut costs about 3% of contribution and a 30% cut about 7%, while the brand lift returns about 3% a year once built. The story test replaces these hand numbers with measured ones.

### 4.5 Rival reaction

In `afterDeepTechYearImpl`, after the brand step, when `win > 0`, `depth >= 0.08` and `served >= 0.5`:

```
p      = clampN(2.5 * (depth - 0.05), 0, 0.45) * (1 - 0.5 * win)       // in a squeeze nobody needs to match
fights = seeded(`${familyId(g.lifeId)}${outcomeTag(g, year)}|undercut|${a.id}|${year}`).chance(p)
if (fights) st.mods[top.id] = { mult: clampN((old?.mult ?? 1) * 1.08, 0.6, 1.25), until: year + 2 }    // then saveMarket(b, st)
```

This is `priceOffensive`'s pattern: a seeded chance, then a `RivalMod` on the largest rival (`marketViewOf(g, b).rivals[0]`) that `buildCtx` reads through `modOf`. The key carries the fiscal year and `outcomeTag` because the result only shows once the year is over. It draws nothing from `g.rng`. One log line: `${top.name} cut prices to match ${a.name}.` In the scorecard a rival's price drops 7% while its mod is active.

### 4.6 Pricing policy and managed companies

`silicon.ceiling` (0, or 0.6 to 1.3) caps the headline index (`price / marketReference(core)`). `bestTechPlan` limits its search to prices at or below `ceiling * premiumOf(b) * going` and returns that cap as `limit`. The slop block in `simulateDeepTechYearImpl` clamps the slopped price to `limit` after its two `rand(g)` draws, so the random stream is unchanged. `deepTechManagerTurnImpl`, the first-sellable-year plan in `afterResearch`, the rocket plan in `deeptech-menu.ts` and the Business-talent hint in `techReportData` all call `bestTechPlan`, so they all follow the policy. With no policy (the default) the search and its result are unchanged. The hint text gains `, within your cap of ${pct(ceiling)} of the market` only when the cap clipped the plan. For the owner the policy changes nothing except that hint.

### 4.7 Screens

**Chips & Fabs** (`chipsNodes`; rows only from stage 2; at most 14 rows in all). Builders read through `techView`, never `techOf`.

| Row | Text and source |
|---|---|
| Goodwill (info) | `Goodwill 62/100, warm. It adds 1.2 brand a year.` Six bands: angry under 30, cool under 45, neutral under 56, warm under 70, loyal under 85, devoted above. While `shortageIntensity(country, g.year) > 0` it adds `Chip supply is tight this year. Buyers notice who charges what.` |
| Performance, Quality (info) | `scoreText(scoreRow('perf', 'Performance', '', chipPerformance(t), rivals.map((r) => r.tech), last.perf))`, and the same for quality with `r.quality`. `chipPerformance(t) = round(clampN(0.5 * level + 5 * node + 20 * (yieldRate - 0.3) / 0.67, 0, 100))`. |
| Price (info) | The mix index against the rivals' price indices. `scoreRow` ranks the higher value first, so the row passes negated indices and a formatter that negates back: `Price 0.88x. Market 1.01x, best 0.80x, rank 3 of 12.` ("best" is the cheapest.) |
| Share of segment (info) | The `segmentsOf(b, v)` row of your segment, through `scoreRow('share', ...)` with `SegmentRow.others` (new, optional: the other named players' local shares). |
| Lane price (action, one per open extra lane) | `Price: Data-center accelerators`. Subtitle `$52.00 each, 0.88x the market, 24% of your sales`. Slider input 0 to 50, step 5, unit `%`, label `Discount on accelerators`. |
| Pricing policy (action) | Slider 70 to 130, step 5, unit `%`; 130 means no limit. Subtitle `Hired CEO prices at most 90% of the market`. |

A rival's price index comes from `rivalPriceIndex(r, year)`: budget 0.85, mass 1.00, premium 1.12, luxury 1.25 (the tier from `r.seg`, else from `r.quality` with the thresholds `segOfTier` uses in `market-view.ts`), times `1 + 0.04 * (2u - 1)`, with `u` from `seeded(`${familyId(g.lifeId)}|rprice|${r.id}|${year}`).next()`. It is a pure read, stores nothing, and makes no claim about any real firm's list price.

**Annual Report.**

- `techStatementLines` gains one line after the units line, for a chip company with a booked year: label `Goodwill · price vs market`, value `62 (warm) · 0.88x`, tone good at 56 or more and bad at 44 or less. Placed early so the UI's 24-line cap never cuts it.
- `techMarketNote` adds `Set each chip line's discount under Chips & Fabs.` while an extra lane is open.
- The `priceTip` bargain line in `AnnualReport.tsx` becomes `Bargain pricing. More buyers, thinner margins.` for every trade, because for most trades nothing else is true. The chip read lives in the line above.

**Market & Competition.** `marketViewOf` fills `MarketView.index` (the core index at `g.year`, chip companies only) and `mySegment(b, index?)` uses it when present, so the segment marked there matches the Chips & Fabs row.

### 4.8 Launch reception

Copying `queueRelease` and `RELEASE` in `deeptech-sim.ts`: `queueLaunch` and a `LAUNCH` script (`defineScript('deeptech.launch', ...)`), exposed through `simInternals`. `afterResearch` calls it, for an owner-run lab only, when `won` contains `aiChip` (or contains `node` while the chips lead the field, 4.9) and `shortageIntensity(b.countryId, year + 1) > 0`. Managed labs get the policy instead of a popup. At most one a year. Modal data is `{ assetId, year: year + 1 }`.

Title `Price the new chips?`. Scene: `${name}'s new chips are ready. The best rival scores ${best}. Yours scores ${mine}. What will you do?`

| id | label | effect |
|---|---|---|
| undercut | Undercut the market | each open lane with `shortage > 0` gets the discount that puts its index at 0.90, at most 50% |
| match | Match the market | the discount that puts it at 1.00 (0 if the headline is already at or below it) |
| keep | Keep my prices | nothing changes |

Then a notice, for example `New chips priced at 90% of the market. Goodwill moves with orders shipped, and only in squeeze years.` The purple hint (Business talent only) sits on the option that earns the most next year by `planContribution` at calm `techPlan`: `Earns the most next year, about ${money(delta)} more than the rest. It doesn't count goodwill.` The hint counts profit only and says so. `revalueQuiet` runs after the choice, as for a model release.

### 4.9 News

A chip leap is the first fiscal year `chipPerformance(t)` ranks first among the field's `tech` (rank 1 of at least 3), and again only after three years without it (`silicon.lead`). `afterYearSilicon` then calls:

```ts
announceWave(g, { kind: 'chips', source: 'deeptech', origin: `${a.id}#leap`, name: 'Record-speed chips', size: 0.35, market: 'world', home: b.countryId })
```

and logs `${a.name}'s chips are the fastest on the market.` It skips the call when `readTechWaves(g)` holds a `chips` wave from this asset within three years (release 1 already writes one for the `euv` program), so the sector's value factor is not counted twice. `announceWave` returns null at its caps; then `lead` is not set and the next year tries again. `afterYearSilicon` runs only for a lab whose `silicon.last` exists, so a lab that never met a squeeze year and never set a lane or a policy announces nothing. That is deliberate: it keeps every year before 2024 byte-identical.

## 5. Determinism: fiscal year against `g.year`

Reads (`techPlan` and the blend, `marketReference`, `priceIndex`, menus, scorecards, hints) never use `g.rng` or `g.year` themselves. Every Silicon function takes the year as an argument, and each caller passes the year it already passes to `techPlan`:

| Caller | Year argument |
|---|---|
| `simulateDeepTechYearImpl`, `bookSilicon` | `year`, the fiscal year being booked (`g.year - 1`) |
| `techReportData`, `TECH_REPORT`, `bestTechPlan`, `techPriceBounds`, menus | `g.year`, the fiscal year being planned |
| `afterDeepTechYearImpl`, `afterYearSilicon` | `t.silicon.last.year`, the year just booked, never `g.year` |
| `queueLaunch`, `LAUNCH` | `year + 1`, stored in the modal data |
| `marketViewOf` | `g.year` for the index; its own `year` for the rest, as today |

- The only seeded draws are the rival reaction (`familyId` plus `outcomeTag`, so heirs share the world and a Time Machine jump rerolls only the unfinished year) and the rival price jitter (`familyId`, a pure read). `industryCycle` (seeded by `lifeId`) is never read, because the reference is calm.
- No `rand`, `chance` or `uid` is added to the yearly step, so later rolls in old saves and the golden tests are unchanged.
- No foresight: a plan year shows only that year's squeeze value, never the tail.
- `bookSilicon` and `afterYearSilicon` run once a year behind `last.year` and `applied`. A second call changes nothing, including the `mods` write.

## 6. State, saves and migration

- `SiliconState` lives in `TechState` as an optional `silicon`. `readTech` is the only whitelist. It validates every field (goodwill 0-100, lane ids from `CHIP_LANES` only, discounts 0-0.5, `ceiling` 0 or 0.6-1.3, years as finite integers, `last` clamped) and returns `silicon` only when it differs from the default. So other trades, chip labs before their first squeeze year, and labs that never set a lane or a policy stay byte-identical. A non-object, a hostile id or a NaN reads as absent.
- Accessors in `deeptech-core.ts`: `siliconView(t)` for menus and reads (defaults, never writes) and `siliconOf(t)` for actions and yearly hooks (creates the object in place). They exist because `techOf` does not re-normalize a current-version state, so `t.silicon` can be missing on a live object.
- `TECH_VERSION` is 4 from release 2 and stays 4. `SAVE_SCHEMA` stays 2. Old saves load with goodwill 50, no discounts and no policy, so demand, prices and revenue are unchanged. Goodwill starts moving at the first booked fiscal year from 2024 on. A save made in 2026 sees only the 2026 and 2027 years of the window.
- Bounded: at most 4 stored lane ids (`core` is never stored), one `last`, every number clamped, `mods` limited by the roster as today. Nothing is added to `YearRecord`.
- Nothing is paid or refunded on load. Heirs, Time Machine forks and group divisions carry `TechState` with the asset.

## 7. Balance and exploit guards

| Risk (from the audit) | Guard | Test |
|---|---|---|
| Floor-price farming: the slider floor is below unit cost | `f_s` floors the index at the cost price; `served` multiplies any reward; depth is capped at 0.4; the yearly change is capped at 8; at most +15 brand | A year at 0.25x with 5% of demand supplied moves goodwill by under 1 point; at 0.25x fully supplied the target equals the at-cost target, and the lab loses money |
| A deep discount you can't supply | `served = sold / demand`; unmet demand already goes to rivals in `refreshMarket` | At served 0.1 the target stays within 5 points of 50 even at the deepest cut |
| Investor money subsidising losses (`t.venture`) | Reward floored at cost, so a subsidised loss earns no more than a profitable cut | The same cases with `venture` high |
| Valuation pump | Brand only, capped; hype never touched; no market-event factor multiplies goodwill; the margin clamp in `operatingValue` is untouched | `operatingValue` at goodwill 50 against 95 in 2025 and 2030: the ratio equals the `profitValue` brand term in both years and 1 on the revenue branch |
| Stacking with `priceOffensive`, events and the `shortage` event | The offensive's `edge` is a pull multiplier and stays; the brand step is capped at +3 a year; the `shortage` event keeps its own +5, so those two sources give at most +8 in one year (hype drift is separate, as today) | A full-goodwill lab that picks `loyal` gains at most 8 brand from the two that year |
| Reference inconsistency | One function, calm, the same ratio as `priceResponse` | Core `marketReference` equals `techPlan.suggested`; the index is equal in a cycle-shortage year and a calm one |
| A discount that pays for itself | The reward is small against the cost of the cut (worked example) | Over 2024-2027 a 20% accelerator discount earns at most 102% of the control's profit, and `bestTechPlan`'s price stays within 5% of its answer with goodwill at 50 |
| A default price drifting to love | The squeeze markup is 0.12 and the dead zone is 3 points | A lab at the suggested price ends 2027 with goodwill at most 57 and at most +2 brand over a lab with no lanes |
| The `shortage` event's `raise` choice lifts `premium` 4%, so the reference moves 4% | The index moves 4% the other way, inside the dead zone | No brand step from that choice alone |
| Brand lifts `premiumOf`, which lifts the reference | The feedback is at most about +2 goodwill points at maximum lift | A bounded loop test over 8 years |

Double-count guards, stated and tested:

- **G1 aiBoom demand.** The window never enters demand. `blend.response` and `mix` take no year, and the window reaches only `marketReference` and the goodwill rate. Test: the same prices and discounts in 2025 and 2030 give equal `response` and different `ref`.
- **G2 aiBoom value.** Goodwill raises brand, never hype, and `operatingValue` multiplies `hypeMult` by the boom, not brand (the valuation row above).
- **G3 size curve.** Lane weights are shares of the demand the size curve already produced. They never scale with market size.
- **G4 `industryCycle`.** Index and reward use the calm reference. `bookSilicon` takes `sold`, `demand` and `unitCost` from the booked plan and the reference from the calm one. Test: two lives whose cycle labels differ, the same inputs to `goodwillStep`, the same output.
- **G5 tech waves.** The chips wave is skipped when release 1 already wrote one for this asset within three years.

## 8. Text

All new strings follow `docs/VOICE.md`: a plain narrator, contractions, no encouragement, no em-dash (the guard is at its cap of 24), and static text within log 90, outcome 120, scene 140 and choice labels of three words. No new string passes 180 characters, so `node scripts/voice-report.mjs --json` does not grow. Purple hints come from the resolver's own math or are absent: the report hint (`bestTechPlan`, policy-aware) and the launch choice (`planContribution`). The lane and policy rows carry none.

| Where | Kind | String (static characters) |
|---|---|---|
| Rival reaction | log | `${top.name} cut prices to match ${a.name}.` (22) |
| Chip leap | log | `${a.name}'s chips are the fastest on the market.` (39) |
| Chips & Fabs goodwill | info | `Goodwill ${g}/100, ${label}. It adds ${step} brand a year.` (39) |
| Chips & Fabs squeeze | info | `Chip supply is tight this year. Buyers notice who charges what.` (63) |
| Chips & Fabs price | info | `Price ${idx}x. Market ${m}x, best ${b}x, rank ${r} of ${n}.` (37) |
| Lane row | subtitle, notice | `${price} each, ${idx}x the market, ${pct} of your sales` (35); `${label} priced at ${price}, ${idx}x the market.` (26) |
| Policy row | subtitle, notice | `Hired CEO prices at most ${p}% of the market` (40); `Your hired CEO will price at most ${p}% of the market. You're not bound by it.` (74); `No pricing limit. Your hired CEO plans by profit alone.` (55) |
| Annual Report | line label, note, tip | `Goodwill · price vs market` (26); `Set each chip line's discount under Chips & Fabs.` (49); `Chips like yours sell for about ${money} here.` (38); `Bargain pricing. More buyers, thinner margins.` (46) |
| Launch | title, scene | `Price the new chips?` (20); the scene in 4.8 (80) |
| Launch | outcomes | `New chips priced at 90% of the market. Goodwill moves with orders shipped, and only in squeeze years.` (101); `New chips priced at the market. Goodwill stays where it is.` (59); `Prices unchanged. The new chips sell at your current price.` (59) |
| Launch, report | hints | `Earns the most next year, about ${money} more than the rest. It doesn't count goodwill.` (79); `, within your cap of ${pct} of the market` (35) |

## 9. Tests

New files. The shared kit `test/silicon-kit.ts` (not a test file) takes `adultIn`, `drain` and `YEAR_PREFS` from `deeptech-kit.ts` and copies the local `company`, `act` and menu-walk helpers, which are not exported (`deeptech-review.test.ts`, `deeptech.test.ts`); it adds `chipLab`, `labOf` and `playYear`.

- `silicon-data.test.ts`: the lane table (ids, weights, gates, labels); `GPU_SHORTAGE` keys exactly 2024-2027 and zero outside; geography equal to the `aiBoom` row; `laneOpen` by era and state.
- `silicon-state.test.ts`: `readSilicon` against hostile values; the default reads as absent; non-chip and untouched chip `TechState` byte-identical; `TECH_VERSION` unchanged by this release; `siliconOf` and `siliconView`.
- `silicon-price.test.ts`:
  - `priceIndex`, and `marketReference` (calm, premium included, markup only for exposed lanes in the window).
  - `techPlan` bit-identical with no discounts, for a chip lab and a non-chip lab.
  - Blend math: shares sum to 1, `mix` at or below the headline, demand rises with a discount.
  - `bestTechPlan` identical with no policy, within `limit` with one. `planContribution` equals the old inline profit.
- `silicon-goodwill.test.ts`: the guard-table cases, G1 to G5, the brand step's dead zone and caps, window and decay, hype untouched, idempotence, no `g.rng` use.
- `silicon-sim.test.ts`: a chip lab booked through 2024-2027 against a control. Goodwill and brand up within the caps; revenue equals `sold * mix` plus side revenue; `stmt.price` is the mix; a second yearly call is a no-op; a managed lab follows the policy and its `rand` draws are unchanged.
- `silicon-rivals.test.ts`: the reaction is reproducible, shared by heirs, bounded; combined mods clamp at 1.25; no `g.rng`.
- `silicon-menu.test.ts`:
  - Chips & Fabs rows are pure at every stage and year (state JSON and `g.rng` identical, no NaN or undefined text), at most 14 rows.
  - Action-level checks inside `run`: a closed lane, a lock from `manageBlock`, the clamps.
  - Scorecard text meets the voice limits.
- `silicon-report.test.ts`: the Annual Report line, the market note and its hint suffix, the `priceTip` text, `MarketView.index` and `mySegment`.
- `silicon-launch.test.ts`: reception on an `aiChip` win in 2024 and on a leap `node` win, none outside the window, for a managed lab, or twice a year; the options set the discounts; the hint appears only with the talent and on the right option; one `chips` wave, none when `euv` wrote one.
- `silicon-story.test.ts`: over several seeds a chip lab plays 2023-2028 three ways (control, 20% accelerator discount, floor price with 5% supplied). The discount is warmer than the control and at most 2% more profitable; the floor strategy is the least profitable; nothing is NaN; every guard holds.

Existing suites that must stay green: `deeptech`, `deeptech-autopilot`, `deeptech-review`, `deeptech-fusion`, `deeptech-new-trades`, `market-events`, `competition`, `market-screen`, `annualReport`, `voice-guards`, and the tech-waves suites. If a pinned value moves in a game year 2024-2027 for a chip lab, the brand step is the cause: stop and report it, and don't edit the test.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Releases 1, 2 and 3 edit the same functions (`afterResearch`, `techMarketNote`, `readTech`, `techPlan`) | The order is release 1, release 2, then this one. Each task re-reads the file before editing and keeps edits small |
| `scoreRow` or `scoreText` change shape in release 2 | Task 5 starts by reading `scorecard.ts` and uses only the exported names in this spec |
| Hot path: the blend runs at all 29 prices of `bestTechPlan` | It is a loop over at most 5 lanes after `marketCtxFor`; `buildCtx` and its cache are untouched |
| Tests pinned to chip labs in 2024-2027 shift | Default discounts are 0 and the dead zone ignores small index gaps; see the stop rule in section 9 |
| The goodwill numbers feel too small or too big | They are starting points: pull 0.45, decay 0.12, step cap 8, dead zone 3, divisor 10, markup 0.12. The structure, caps and bounds are fixed and tested |
| Two screens name different segments for one company | The `MarketView.index` plumbing in Task 5. If `market-screen` moves, drop that step and list it as not in this release |
| The rival price field reads as a claim about real firms | It is derived from the tier, shown as "market", and stores nothing |

## 11. Decisions made while writing this spec

1. **D1 Lanes, not SKUs.** Five lanes share one unit, one cost and one capacity pool. Per-lane costs, capacity and shares would change calibrated economics for no new mechanic.
2. **D2 Prices in Chips & Fabs, results in the Annual Report.** The report is one price slider shared by about 25 trades with one JSON result. Menu sliders (`MenuInput`) already exist and are tested. The report keeps the headline price and shows last year's result in its lines and note.
3. **D3 A lane price is a discount below the headline.** It keeps promises, price wars and CEO plans consistent without touching `priceCapOf`.
4. **D4 The reference includes `premiumOf`.** It is the ratio `priceResponse` already uses, so a premium product at its own price is neutral.
5. **D5 The squeeze is not in demand.** `aiBoom` already carries the 2024-2027 demand and value. The window only sets the reference markup and the goodwill rate.
6. **D6 Window-gated love.** Goodwill gains only while `win > 0`. Before 2024 and after 2027 it only decays toward 50, so old years and the procedural future are not rewritten.
7. **D7 Brand is the only channel.** No hype, edge or demand multiplier, so the valuation and boom guards stay simple.
8. **D8 The policy is a cap, not a script.** A ceiling on the index keeps the manager's profit search and its skill-sized mistakes.
9. **D9 Launch pricing is a choice on discounts.** Premium pricing is the headline's job, so the choice has no premium option.
10. **D10 Docs.** No release notes, version bump or ARCHITECTURE.md section here. Those are done at integration.

## 12. Build order

Per task: `npm run typecheck` plus the named vitest files in one call, never the full suite. Names marked new are introduced by this release. Every other name was checked against v3.0.0 or the release 1 and 2 interfaces.

| # | Task | Files | Check |
|---|---|---|---|
| 0 | Preflight: confirm release 1 and 2 landed (`announceWave`, `readTechWaves`, `RdResult.won`, `scorecard.ts`, `TECH_VERSION` 4); record the typecheck and `voice-report` baseline | read only | none |
| 1 | Window, lanes and saved state: `GPU_SHORTAGE`, `shortageIntensity`, `CHIP_LANES`, `ChipLane`, `laneOpen`, `SiliconState`, `SiliconYear`, `readSilicon`, `TechState.silicon?`, `siliconView`, `siliconOf`, the test kit (new) | `history/market-events.ts`, new `business/silicon-data.ts`, `deeptech-state.ts`, `deeptech-core.ts`, new `test/silicon-kit.ts` | `silicon-data`, `silicon-state`, `market-events`, `deeptech` (old-saves test) |
| 2 | One price: `priceIndex`, `marketReference`, `laneDiscount`, `mixIndex`, the blend in `techPlan`, `TechPlan.lanes` and `mix`, the policy in `bestTechPlan` (`limit`), `planContribution` (new or extracted) | `deeptech-core.ts` | `silicon-price`, `deeptech`, `deeptech-autopilot`, `deeptech-review`, `deeptech-new-trades` |
| 3 | Goodwill, the books and the brand step: `brandStep`, `goodwillTarget`, `goodwillStep`, `squeezeOf`, `bookSilicon`, `pendingBrandStep` (new); revenue and slop clamp in the sim; the brand line | new `business/silicon.ts`, `deeptech-sim.ts` | `silicon-goodwill`, `silicon-sim`, `deeptech-review`, `deeptech-autopilot`, `deeptech` (2000 labs) |
| 4 | Rival reaction and the after-year step: `chipPerformance`, `undercutChance`, `stackMod`, `afterYearSilicon` (new) | `silicon.ts`, `deeptech-sim.ts` | `silicon-rivals`, `silicon-sim`, `deeptech-review`, `competition` |
| 5 | Chips & Fabs: `rivalPriceIndex`, new `business/silicon-text.ts`, the rows, `laneRow`, the policy row, `SegmentRow.others` | `deeptech-menu.ts`, `silicon.ts`, `silicon-text.ts`, `market-view.ts` | `silicon-menu`, `deeptech` (purity), `deeptech-review`, `market-screen`, `voice-guards` |
| 6 | Annual Report line and note, the hint suffix, `priceTip` text, `MarketView.index`, `mySegment` | `deeptech-sim.ts`, `silicon-text.ts`, `AnnualReport.tsx`, `competition.ts`, `market-view.ts`, `market-menu.ts` | `silicon-report`, `annualReport`, `market-screen`, `competition`, `competition-era`, `deeptech-review`, `voice-guards`, `tech-waves-surface` |
| 7 | Launch and news: `leadsField`, `launchDiscounts`, `launchOptions`, `queueLaunch`, `LAUNCH`, the leap and `announceWave` (new) | `deeptech-sim.ts`, `silicon.ts` | `silicon-launch`, `deeptech-review`, `tech-waves-writers`, `silicon-rivals`, `silicon-sim` |
| 8 | Story and balance guards; the full list of section 9 once | `test/silicon-story.test.ts` | `silicon-story`, then the section 9 list |

Where existing code changes:

| File | Function or type | Change |
|---|---|---|
| `deeptech-state.ts` | `TechState`, `readTech` | optional `silicon`, `readSilicon` |
| `deeptech-core.ts` | `techPlan`, `TechPlan`, `bestTechPlan` | blend, `lanes`, `mix`, `limit`; `marketReference`, `planContribution`, `siliconView`, `siliconOf` beside them |
| `deeptech-sim.ts` | `simulateDeepTechYearImpl` | revenue and `stmt.price` from `plan.mix`, slop clamp, `bookSilicon` call |
| `deeptech-sim.ts` | `afterDeepTechYearImpl`, `afterResearch` | brand step and `afterYearSilicon`; launch hook after release 1's `announceBreakthroughs` |
| `deeptech-sim.ts` | `techStatementLines`, `techMarketNote`, `techReportData`, `simInternals` | the line, the note, the hint suffix, `queueLaunch` |
| `deeptech-menu.ts` | `chipsNodes` | the rows; new exported `laneRow` |
| `market-view.ts`, `competition.ts` | `segmentsOf`, `SegmentRow`, `mySegment`, `MarketView`, `marketViewOf` | `others`, `index` |
| `AnnualReport.tsx` | `priceTip` | one sentence, and the function is exported with a narrower first parameter |

Self-review done when this spec was written: every part of the brief is covered (sections 1 to 12); no section is left open; each existing name cited was found in the code (`techPlan`, `techPriceBounds`, `bestTechPlan`, `techPremium`, `premiumOf`, `priceResponse`, `marketDemand`, `buildCtx`, `modOf`, `refreshMarket`, `priceOffensive`, `queueRelease`, `RELEASE`, `chipsNodes`, `segmentsOf`, `mySegment`, `segOfTier`, `marketViewOf`, `eventStrength`, `readTech`, `techOf`, `techView`, `outcomeTag`, `familyId`, `seeded`, `defineScript`, `scriptChoice`, `talentHint`, `MenuInput`); the release 1 and 2 names are the ones the task and the release 1 plan define.
