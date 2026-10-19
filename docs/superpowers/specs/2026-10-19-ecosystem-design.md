# Ecosystem companies: a devices trade, chips from your own fab or a sister fab, specs against the market (design)

Date: 2026-10-19 · Status: designed, not implemented, plan to follow at docs/superpowers/plans/2026-10-19-ecosystem.md · Release 4 of 8

Builds on main v3.0.0 (HEAD `d061c0d`) and three unmerged releases: release 1 (`2026-10-19-tech-waves-design.md`:
`announceWave`, `WAVE_KINDS`), release 2 (`2026-10-19-ai-lab-2-design.md`: `business/scorecard.ts` with `ScoreRow`,
`scoreRow`, `scoreText`) and release 3 (`2026-10-19-silicon-2-design.md`: `rivalPriceIndex`, `chipPerformance`).
Names marked (new) don't exist yet; neither does anything defined in `devices-data.ts`, `devices-specs.ts` or `devices-menu.ts`.
Every other name was found with grep in v3.0.0, in the v3 worktree (releases 1 and 2) or in the Silicon 2.0 spec, the only home of
the release 3 names.

## What the player asked for

> (b) an ecosystem company (phones, laptops, VR, AR, desktops, an OS) that gets better and cheaper with its own
> fabs or a semiconductor sister company, with performance, quality and price shown against the market average.

In one play session this means:

1. Found a Device and Platform Company in 1977 or later. Develop lines as the eras open: home computers 1977, mobile
   phones 1983, smartphones 2007, VR 2016, AR 2019, and an operating system.
2. Open Devices & Chips. Each line shows three rows, for example "Performance 68. Market 67, best 74, rank 6 of 12."
3. Build a fab. Chips cost less, performance and quality rise, and the screen says what the fab saved last year.
4. Or put a semiconductor company in the same group and assign it as the chip supplier under Group Services. The
   same effects appear with the sister's name on the saving.
5. Ship an operating system. Customers stick, up to a cap, and a better rival can still take them.

Assumptions (mine): "the market" is the rivals that sell that kind of product this year, counted the way the Products
menu counts them, and their figures are modeled and shown without names. "Better" is performance and quality,
"cheaper" is unit cost. A hired CEO never builds a fab. Apple and Samsung are ordinary rival rows, not scripted.

## What the audit found (v3.0.0)

- **Nothing models a device or OS company.** `INDUSTRY_IDS` (`data/markets.ts`) holds 55 trades. Devices exist only as kinds
  inside other trades (`Smartphone SoC`, `Mobile App`, `VR Spin-Off`, `Smart Home Gadget` in `product-data.ts` `DEMAND`). Apple and
  Samsung are one row per trade: `apple-silicon`, `apple-ai`, `samsung-semi` (`market-data-tech.ts`), `samsung-group`
  (`market-data-heavy.ts`); `market-rows.ts` says one row is one company in one trade. Prices exist only for shoppers: `ELECTRONICS`
  in `assets.ts` (smartphone 900, laptop 1,300, VR 500) and `computerUsd` in `computer/era.ts`.
- **Internal contracts are cost-only and ex post.** `group-services.ts`: `SERVICE` lists marketing, logistics,
  software, manufacturing, realEstate and investmentFirm. `valid()` needs the same country, `own >= .999` on both
  sides and only domestic outlets. `settleInternalServices` amends statements after every company's year;
  `prepareInternalServices` holds back 20% of provider capacity. Semiconductor can't be a provider. Venture rounds
  (`deeptech-funding.ts`) lower `BizState.share`, so `reconcileOwnership` (`conglomerate-state.ts`) leaves a funded
  chip company below .999.
- **Synergies are small and same-industry.** `synergyPlan` (`conglomerate-econ.ts`): `PURCHASING` .04 per
  same-industry sister (cap .07), `CROSS_SELL` .03 per related-sector sister (cap .08), and `SECTORS` gives
  semiconductor ['tech', 'industry']. `groupYear` (`conglomerate-year.ts`) drops back-office and purchasing for a buyer
  with internal contracts and keeps cross-selling.
- **Fabs belong to one lab.** `PROGRAMS.semiconductor` `fab` (`deeptech-data.ts`) costs 180M x (1 + .35 x plant) and
  changes `TechState.plant`, `node` and `yieldRate` of that company only. The classic capex lever is
  `buildLinesAction` (`manage.ts`) with `LINE_CAP`, `LINE_CAPEX` and `linesOf` (`economy.ts`).
- **Only per-kind quality exists.** `fieldOf` and `edgeOf` (`product-market.ts`) give pull-weighted rival quality per kind.
  `Product` has no price, `RivalView` (`competition.ts`) has no price or performance, `b.price` is one number, rival `tech` is
  cosmetic and `rivalVersion` quality is a hash jitter. No average price or performance exists.
- **Network effects live inside one trade.** `buildCtx` (`competition-core.ts`) sets `w = networkPull(base, network)`;
  `networkPull` is capped by `MAX_NETWORK_PULL` 80 and rivals use `RIVAL_NETWORK` .5 (`competition-roster.ts`).
  `refreshMarket` (`competition.ts`) smooths `st.base` as .5 old + .5 share. `dominanceFrom` gives `SCALE_SAVING` 10%
  and, in national markets only, `PRICE_POWER` 12%. Networks today: software 7, aiLab 8, semiconductor 6.
- **Planners are pure and cached.** `costFactor(b, calm)` takes only `b`. `planFor` and `bestPlan` run hundreds of times.
  `buildCtx` caches by state; `marketCtxFor` attaches the field and heavy pulse after it. `bizOf` re-normalizes only when
  `BIZ_VERSION` changes, but `readBiz` runs `normalizeBiz` every time, so a field missing there vanishes from every menu.
- **A trade costs files.** v2.9.0 (`a28ed64`) added four deep-tech trades in 46 files, +2,111 lines. Hard-coded counts: 55 in
  `test/business-expansion.test.ts` and `test/market-roster.test.ts`, 33 in `test/market-brands.test.ts`. `IndustryDef.model` allows
  only 'finance'; `heavyEligible` (`heavy-rd.ts`) excludes deep tech, finance and game studios.

## Goal, scope and non-goals

Goal: ONE new classic trade, `devices`, with eight dated product kinds, honest spec rows against the market, a fab
lever, a sister-supply path through group contracts, and an operating system whose lock-in is bounded. About 9 plan
tasks (section 16). Not in this release: a new `MinigameKind`, a deep-tech engine, a new yearly hook, a new save
schema, release notes and the version bump (integration).

What I cut to fit, and why:

| Cut | Reason |
|---|---|
| Tablets, watches, consoles, TVs, speakers as lines | The ask names six kinds. Eight families (with the two era forms) are already 8 `DEMAND` curves. |
| Per-country `demand` rows for `devices` | A key in `m.demand` enters `slotPlan` (`invest/engine.ts`) and changes stock generation in every hub country. |
| `invest/engine.ts` sector, market-event `EXPOSURE`, `nepo-asks.ts` technical list, nation targets | Each moves a seeded system for a guess. Devices defaults to 'industrials', no event exposure, no nepo ask. |
| `priceCat: 'electronics'` | Unused today; at `tradable` .9 it moves price by 10% of the local level. Not worth being its first user. |
| Capacity lines (`CAPACITY_LINES`), a manufacturing 'Components' contract for devices | Studios open for capacity and fabs are the one capex lever; Components would stack a second saving. |
| Cross-border chip supply, tariffs on internal chips | Needs export controls, `GOODS` tariffs and FX. Same country stays. |
| Selling a fab, a hired CEO building one, fab R&D programs | Capex is sunk and owner-only; no node or yield programs for a classic trade. |
| Auto-founded chip sister (`group-ventures.ts`), an app store across trades | New systems with their own balance. |
| Named rival spec sheets, stored rival prices, performance-leader news | Real-name claims; leader news needs saved state. |
| Heavy waves (`HEAVY_WAVES`), an Annual Report chip line | History waves already cover the years; the report is one JSON shared by every trade. |

## 1. The trade

**D1 Engine: the classic product-lines engine.** A device maker sells a range of dated kinds against rivals' versions,
which is what `product-market.ts` and `rd.ts` model. Heavy R&D needs a classic trade and the brief wants five
breakthroughs. Deep tech would add about 12 programs, `NEXT_GEN`, `IPO_STAGE`, `TOPIC`, `SHOWCASE`, funding and events
(the 46-file precedent) on a ladder that suits labs. Fabs need no ladder: `BizState.fabs` (new) is a capex lever like
`BizState.lines`.

`INDUSTRIES.devices` (starting numbers, tuned by the calibration test in section 13):

```
id devices, label Device and Platform Company, unit devices, site hardware studio (hardware studios)
price 600, unitCost 360, localShare .25, tradable .9, demand 30,000 a studio, capMult 1.5, elasticity 1.5, incomeSens .6
capital 7,000,000, capitalLocal .35, staff 36, wage 98,000, staffScale .6, rent 480,000, maint .08, multiple 11, growth .9
perMillion .1, taxShare 1, perishable .1, marketingShare .06
```

Roles: Chief Hardware Engineer and Head of Industrial Design (quality), Head of Retail Sales (sales), Supply Chain
Director (ops), CFO. Suffixes: Devices, Mobile, Computing, Electronics, Labs.

`MARKETS.devices`: scope 'world', noun 'device', `ref` 5, `field` 90, `fringe` .3, **`network` 1.5**, `named` 16,
`emerging` true, `from` 1977, `needs` 'homeComputer', `notYet` "Computers fill rooms and cost a fortune. A home
computer doesn't exist yet." The US passes `needs` in 1977 (adoption .027); poorer countries open later through
`techAdoption`. `curve` (size against 2026): 1977 .001, 1980 .006, 1984 .03, 1990 .08, 1995 .15, 2000 .28, 2001 .25,
2005 .35, 2007 .4, 2010 .62, 2013 .88, 2016 1.0, 2019 .97, 2022 .98, 2026 1, 2040 1.35, 2060 1.7. The 2007 to 2013
rise is drawn flatter than plain sales would be, because the smartphone history wave (section 8) adds demand on top.
`hubs`: us 26, cn 24, kr 12, jp 10, tw 8, in 6, gb 3, de 3, fi 2, sg 2, fr 2.

The eight kinds (`INDUSTRIES.devices.products`; `STYLE` 'goods', so variants read "Smartphone Pro" and "Laptop Lite"
and next generations "Smartphone Mk II"):

| Family | First | `DEMAND` curve (Span or TechCurve) | Reference price (2026 dollars) |
|---|---|---|---|
| Home Computer | 1977 | [1977, 1988, 0.9, 1990, 0.2, 6] | `computerUsd` table, 6,500 falling to 1,800 by 1986 |
| Mobile Phone | 1983 | [1983, 2000, 1.3, 2008, 0.15, 7] | 6,000 (1983), 3,000 (1990), 800 (1996), 400 (2000), 300 (2008) |
| Desktop PC | 1985 | [1985, 1998, 1.2, 2012, 0.45, 12] | `computerUsd` table, 1,300 from 2010 |
| Laptop | 1995 | [1995, 2008, 1.4] | 1.4 x the table before 2010, 1,300 after |
| Smartphone | 2007 | `{ tech: 'smartphone', size: 1.8, first: 2007 }` | 1,100 (2007), 1,000 (2010), 950 (2014), 900 (2026) |
| VR Headset | 2016 | [2016, 2030, 0.5] | 700 (2016), 500 (2020 on) |
| AR Glasses | 2019 | [2019, 2034, 0.4] | 1,500 (2019), 1,000 (2023), 800 (2026) |
| Device Operating System | 1981 | `{ tech: 'homeComputer', size: 0.7, first: 1981 }` | none (bundled) |

`ERA_FROM` (`products.ts`) gets the same first years. `PERIOD_CLASSICS.devices` (`product-data.ts`) gives four period
ideas for the years before the modern kinds reach the world market: Pocket Calculators, Digital Watches, Cordless
Telephones, Handheld Game Units. Reference prices are modeled constants in a pure leaf, not read from `assets.ts`
(private) or `computer/era.ts`; tests pin 2026 to the shop prices and early years to `computerUsd` within 25%.

## 2. Chips: the pure core (`business/devices-data.ts`, new, imports types only)

```ts
export const CHIP_SHARE = 0.35        // share of unit cost that is chips and memory
export const MARKET_YIELD = 0.70      // yield of chips bought on the open market
export function marketNode(year: number): number   // NODES index of the mainstream node: 0 to 2010, 1 from 2011, 2 from 2015, 3 from 2018, 4 from 2020, 5 from 2022, 6 from 2030
export function chipPerf(node: number, yieldRate: number): number   // 5 x node + 20 x (yield - .3) / .67, node 0-6, yield .3-.97, so 0 to 50
export function devicePerf(quality: number, node: number, yieldRate: number): number  // round(clamp(.5 x quality + chipPerf, 0, 100))

export interface ChipSupply { year: number; from: string; name: string; stage: number; node: number; yield: number; cover: number }   // one record, written by prepareInternalServices
export type ChipSource = 'market' | 'fab' | 'sister'; export interface ChipTerms { src: ChipSource; cut: number; node: number; yield: number; cover: number; perfBump: number; lift: number; from?: string }
export interface ChipHolder { industry: string; fabs?: number; chips?: ChipSupply }   // a BizState is assignable, so the file needs no runtime import
export function readFabs(v: Json | undefined): number              // integer 1 to 3, else 0
export function readChips(v: Json | undefined): ChipSupply | null   // the rules of section 10, else null
export function chipSource(b: ChipHolder): { src: ChipSource; cut: number; cover: number }
export function chipTerms(b: ChipHolder, year: number): ChipTerms
export function chipCostFactor(b: ChipHolder): number   // 1 - CHIP_SHARE x cut
export function chipBook(cogs: number, cut: number): { saved: number; paid: number }
export function kindReference(family: string, year: number): number   // the market's price for a kind, 2026 dollars; LINE_PRICE scales it per sort of line
```

`devicePerf` is Silicon 2.0's `chipPerformance(t)` with the line's quality standing in for `level`: a test pins
`chipPerformance(t) === round(clamp(.5 x t.level + chipPerf(t.node, t.yieldRate), 0, 100))` for sample `TechState`s.

**One source, no stacking.** `chipSource` takes `own = FAB_CUT[min(fabs, 3)]` and `sis = SISTER_CUT[chips.stage] x
chips.cover`, and the larger wins (own on a tie). The other is ignored, so a fab and a sister never add. A trade other
than `devices` always reads 'market' with `cut` 0. All three functions read `fabs` and `chips` only through `readFabs` and
`readChips`: `bizOf` hands out `a.details` unscrubbed unless the version changed, so a damaged save must not give NaN in
`costFactor` (`linesOf` guards `lines` the same way).

| Constant | Value |
|---|---|
| `FAB_MAX`, `FAB_CUT` (cut of the chip share by fabs 0, 1, 2, 3) | 3; 0, .15, .25, .30 |
| `SISTER_CUT` by the sister's `TechState.stage` 2, 3, 4 (fabless, own fab, leading edge) | .08, .18, .24 |
| `CHIP_RESERVE` (share of the sister's revenue the contract may use) | .20 |
| `LIFT_K`, `LIFT_MAX` (quality points per performance point, and the cap) | .4, 6 |

`chipTerms` fills the rest. Market: `node = marketNode(year)`, `yield = MARKET_YIELD`. Own fabs: `node = min(6, marketNode + (fabs >= 2 ?
1 : 0))`, `yield = MARKET_YIELD + .05 x fabs`. Sister: `node = max(marketNode, chips.node)`, `yield = max(MARKET_YIELD, chips.yield)`. Then
`perfBump = chipPerf(node, yield) - chipPerf(marketNode, MARKET_YIELD)` and `lift = clamp(LIFT_K x perfBump x (src == 'sister' ? cover : 1),
0, LIFT_MAX)`. `chipCostFactor` is year-free on purpose, because `costFactor(b, calm)` has no year: `prepareInternalServices` keeps a sister
record fresh (section 4). `chipBook` undoes the cut: with `f = 1 - CHIP_SHARE x cut`, `saved = cogs x CHIP_SHARE x cut / f` and
`paid = cogs x CHIP_SHARE x (1 - cut) / f`.

Where it plugs into the economy (all pure reads of `b`):

- `costFactor` (`economy.ts`): `sup * ops * chipCostFactor(b) * (calm ? 1 : b.costShock)`. Structural, so calm plans include it.
- `evolve` (`economy.ts`): `qTarget` gains `+ chipTerms(b, year).lift`. `b.quality` moves toward the target 30% a year, so
  new lines launch better (`rdQuality` reads `b.quality`) and `premiumOf` and `appealOf` follow.
- `bookYear` (`economy.ts`): `upkeep += fabUpkeep(b)` beside the capacity-line term.

Performance moves demand only through that quality lift. It has no second channel, and the screen says so.

## 3. Own fabs

`BizState.fabs?: number` (new, 0 to 3). A fab is a fixed price per plant, never a share of cash, revenue or value, like
the deep-tech `fab` program (180M x (1 + .35 x plant)). The constants live in `devices-data.ts`:

```
fabCost(b, n = 1) = round(FAB_BASE x capitalIndex(b) x sum over k = fabs .. fabs + n - 1 of (1 + FAB_STEP x k))   // (new, economy.ts)
fabUpkeep(b)      = round(FAB_MAINT x FAB_BASE x capitalIndex(b) x sum over k < fabs of (1 + FAB_STEP x k))      // (new, economy.ts)
FAB_BASE = 150,000,000   FAB_STEP = .35   FAB_MAINT = .07   capitalIndex (new) = localEcon(...).capital / def.capital
```

`buildFabAction(a)` (new, exported from `manage.ts`, beside `buildLinesAction`; `devicesMenu` receives it as a node) builds one fab:
`act` checks `manageBlock`, then `disabled` rechecks inside `run`: cash (`noCash`), `fabs < FAB_MAX`, industry 'devices', and
`boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount, gain, label })` for hired-CEO companies. It draws no random number.
It does `b.cash -= cost; b.fabs = fabs + 1; b.valuation = valuationOf(b); refreshValue(cur, b)`, logs and notifies. A fab pays from
the year it is built, like capacity lines; at its price no timing trick pays. It can't be sold, and the hired CEO in `board-ceo.ts`
builds only capacity lines. The cost is sunk and no asset is booked: `equipmentValue` doesn't count a fab, so insurance,
disaster damage, credit limits and liquidation never see it (capacity lines do count there). The upkeep sits in `bookYear`
beside the capacity-line upkeep, so it carries the same finance, CEO and head-office multipliers.

Hint (Business talent, resolver math). `fabGain(g, a)` (new) is `bestPlan(g, { ...b, fabs: fabs + 1 }, { fast: true }).profit -
bestPlan(g, b, { fast: true }).profit`, cached like `linesGain`; `run` passes the same number to `boardAllows` as `gain`.
The hint reads "Cost savings alone repay it in about N years. Quality gains are extra." when the gain is positive and the
payback is at most `PAYBACK_MAX` (8 years, the limit the expansion hints use), "The savings alone take over 8 years to repay
it." when it is positive and slower, and "The savings don't cover the upkeep." otherwise. Hand estimate for a US company with 2B of sales (cogs about 1.1B,
chips about 385M); diminishing returns are the guard, and the story test replaces these with measured numbers:

| Fabs | Capex | Chip cut | Unit cost | Performance (2026, q 62) | Quality lift | Net a year |
|---|---|---|---|---|---|---|
| 0 | 0 | 0% | 0% | 68 | 0 | 0 |
| 1 | 150M | 15% | -5.3% | 69 | +0.6 | +47M, repaid in 3.2 years |
| 2 | 203M | 25% | -8.8% | 76 | +3.2 | +24M more, repaid in 8.3 years |
| 3 | 255M | 30% | -10.5% | 77 | +3.8 | +1M more, not worth it for cost alone |

## 4. A sister fab through Group Services

The chip contract reuses the contract list (`g.flags.groupServices`, `Contract { provider, customer, group }`), the
menu (`groupServicesMenu` with Assign All), the authorization (`toggleService`: `manageBlock`, `grp.core.share > .5`,
`ownerControls` for every member) and the 120-contract cap. Changes to `group-services.ts`:

| Rule in `valid()` | Chip contract (semiconductor to devices) |
|---|---|
| Same country | **Kept.** A cross-border supply needs tariffs, export controls (`RESTRICTED`) and FX. |
| `own >= .999` on both sides | **Kept.** It is what makes conservation true: no outside holder is paid or short-changed. A funded chip company fails; the menu says to buy its investors out (`Capital & Ownership`). |
| All outlets domestic | **Relaxed.** That rule exists because `amend` re-taxes on one basis; chip supply amends no tax. |
| `SERVICE[p.b.industry]`, buyers | `SERVICE.semiconductor = { label: 'Chip supply', key: 'cogs', share: 0 }` for the label only. A semiconductor provider serves only `devices`, needs `techView(p.b).stage >= 2` and a clear `industryEraBlock`. |

`chipBlock(g, p, q)` (new; `p` and `q` are the group's `GroupMember`s) returns the first failing rule as plain text, and the menu shows it as an info row for a
semiconductor and devices pair that is not valid: "Acme Silicon can't supply chips. The group doesn't own all of it.
Buy out its investors first."

**Before the year** (`prepareInternalServices`, already once per fiscal year behind `groupServicesPrepared`).
`assignChips` (new) runs for each buyer with valid chip contracts once both companies have booked a year, from last year's
statements, so it has no foresight:

```
bill   = buyer.last.cogs x CHIP_SHARE
cover  = clamp(CHIP_RESERVE x sister.last.netRevenue / max(1, bill), 0, 1)      // a small sister can't feed a giant
record = { year: fiscal, from: sister.id, name, stage, node, yield, cover }
```

The best sister (largest `SISTER_CUT x cover`, then asset id) writes `b.chips`. Others are ignored. If `chipSource` then
prefers the buyer's own fabs, the record is dropped. Only a **used** sister holds capacity: `hold = min(CHIP_RESERVE,
bill / sister.last.netRevenue)`, applied as `capacityLoss = 1 - (1 - capacityLoss) x (1 - hold)`, with at most .5 held
across all the sister's buyers. Last, every business asset whose `chips.year !== fiscal` loses its record, so a sold,
removed or ungrouped sister stops helping at the next year start.

**After the year** (`settleInternalServices`, behind `groupServicesSettled`). The generic loop skips chip pairs. `settleChips`
(new) handles each used pair whose statements are booked for `fiscal`:

```
{ saved, paid } = chipBook(buyer.last.cogs, chipSource(buyer).cut)   // that cut already includes cover; saved is the avoided external cost
invoice = min(round(paid x cover), 0.25 x provider.last.netRevenue)
provider: revenue += invoice; netRevenue += invoice; cogs += invoice     // profit-neutral, exactly as the existing contracts book it
groupServiceResults gets { group, provider, customer, invoice, saved, year: fiscal, chips: true }
log: "Acme Silicon supplied chips to Acme Phones and saved it about $4.2M."
```

The buyer's saving is already inside its cogs, because `costFactor` read the record before booking. The sister's real cost is the
capacity it held back. No cash passes between them, as with every existing internal contract, and `internalRevenue` eliminates the
invoice from group revenue. Consolidated profit moves by the buyer's saving less the sister's lost external sales. Attribution is
`saved`: the Devices screen reads the latest result for the buyer.

**Double counts.** `groupYear` already zeroes back-office and purchasing when `hasInternalServices` is true (purchasing is same-industry
only). This release adds one line: a buyer with an active chip contract also drops its cross-selling lift (`d.crossSell`,
`d.crossSellValue`), because semiconductor and devices are 'related' (both hold 'tech') and the contract is the link. The group menu's
synergy preview doesn't show the existing zeroings either; same gap.

## 5. The operating system and bounded lock-in

The OS is the line family `Device Operating System` (`OS_FAMILY`, `OS_BETA`, `OS_PULL_CAP` live in `devices-data.ts`). Lock-in uses the
existing installed base, `MarketState.base`, and `networkPull`. Nothing new is saved.

```
osStrength(b, year) = clamp((effectiveQuality(best OS line) - 35) / 45, 0, 1), 0 without a line   // (new, economy.ts) it ages 1.2 points a year
osPull(base, strength) = max(networkPull(base, 1.5), min(OS_PULL_CAP, networkPull(base, 1.5 + OS_BETA x strength)))   // (new, economy.ts)
OS_BETA = .9    OS_PULL_CAP = 3.0
```

`marketCtxFor` (`economy.ts`) returns `{ ...ctx, w: osPull(ctx.base, osStrength(b, year)) }` for devices only, after `buildCtx`
(its cache key stays the state), because the line list isn't in that key. Rivals keep `network x RIVAL_NETWORK` = .75.

| Installed base | Pull, no OS (beta 1.5) | Pull, full OS (beta 2.4) | Rival at the same share (beta .75) |
|---|---|---|---|
| 30% | 1.31 | 1.54 | 1.14 |
| 50% | 1.71 | 2.36 | 1.31 |
| 60% | 1.96 | 2.94 | 1.40 |
| 80% | 2.60 | 3.00 (cap) | 1.62 |

Software's network is 7: its pull at 60% is about 23. The OS adds at most +50% pull at 60%, saturates at 3.0, ages without a refresh
and is beaten by quality (`edgeOf` up to x3). Dominance and antitrust (`maybeAntitrust`, `groupAcquireBlock`) work unchanged, and `PRICE_POWER` never applies to a world market.
Dominance's 10% saving plus the chip cut (at most 10.5% of unit cost) bound the stack: a test pins the combined multiplier at 0.80 or higher.

## 6. Spec sheets and the Devices screen

`business/devices-specs.ts` (new, pure) builds the numbers; `business/devices-menu.ts` (new) renders them. Both read
through `readBiz`, `marketCtxFor` and `fieldFor`, never draw a random number and never write state.

```ts
export interface DeviceSpec { family: string; line: string; perf: ScoreRow; quality: ScoreRow; price: ScoreRow }   // (new)
export function specSheet(g: GameState, b: BizState, year: number, ctx: MarketCtx): DeviceSpec[]   // (new) one per hardware family on sale, its best line
```

For a family F with rivals offering it (`fieldFor(ctx).versions(F)[i] >= 0` and `pull > 0`, the rule `beaten` uses):

| Row | Mine | Each rival i (the field) |
|---|---|---|
| Performance | `devicePerf(effectiveQuality(best line), terms.node, terms.yield)` | `devicePerf(version_i, marketNode(year), MARKET_YIELD) + round((tech_i - 55) / 6)`, clamped 0 to 100 |
| Quality | `effectiveQuality(best line)`, what `edgeOf` uses and the Products menu prints | the rival's version quality for F |
| Price | `kindReference(F, year) x (b.price / going) x LINE_PRICE[kind]` | `kindReference(F, year) x rivalPriceIndex(rival, year)` (release 3) |

`LINE_PRICE`: core 1, next 1.05, premium 1.25, value .7, regional .97, breakthrough 1.2; bundles and add-ons get no sheet. `going` is
`localEcon(...).goingPrice`. Price ranks the cheapest first, so the row passes negated values and prints through a formatter that negates
back, as Silicon 2.0 does: "Price $842. Market $912, best $690, rank 4 of 11." `prior` for `scoreRow` is the same figure at `year - 1`
(or `mine` for a line launched this year, so the trend reads flat). The year is `g.year`, as in the Products menu, so a spec row and its
subtitle agree. Rival performance uses `marketNode(year)`, so rivals and the player age on one scale. No row names a rival.

`devicesMenu(a, build)` (new) is added in `businessView` (`manage.ts`) after `productsMenu` for devices only. Label
"Devices & Chips". At most 12 rows (header, chips, build, platform, one sister row and up to seven families):

| Rows | Content |
|---|---|
| Header (info) | "Specs compare your best line of each kind with rivals that sell one. Better chips raise quality." |
| Chips (info) | the source, `cut`, `perfBump`, `lift`. Own fabs: "At last year's volume that saves about $4.2M a year." (`chipBook` on `last.cogs`). A sister: "saved about $4.2M last year", read from its `groupServiceResults` record |
| Build a Chip Fab (action) | `extra` from `manage.ts`; shows `fabCost`, the upkeep and the hint |
| Sister row (info, 0 or 1) | the first line of `chipRows`: the active supplier, else a sister that could supply, else the `chipBlock` text of one that can't |
| Platform (info) | installed base `ctx.base` and the pull multiple `ctx.w`, or the no-OS line |
| One sub-menu per hardware family (up to 7) | subtitle "Performance 68 · rank 6 of 12"; children: three `scoreText` rows |

## 7. The rival cast (`business/market-data-devices.ts`, new, `DEVICE_ROWS`)

World-scope and not procedural, so `test/market-brands.test.ts` and `test/market-roster.test.ts` need at least 15 real rows
with at least 12 alive in 2026. 24 rows, `RivalRow` format (`ind, slug, name, hq, founded, tier, pot, opts`), registered in
`data/brands-rivals.ts` beside `TECH_ROWS`. Names identify companies only; `since` is when it began selling devices.

| Alive in 2026 (19) | Tier, pot |
|---|---|
| Apple (us 1976, since 1977), Samsung (kr 1969, since 1988) | premium 14, mass 13 |
| Lenovo (cn 1984), HP (us 1939, since 1980), Dell (us 1984), Xiaomi (cn 2010, since 2011) | mass 8, 7, 6.5, 7 |
| Huawei (cn 1987, since 2004), Oppo (cn 2004, since 2008), Vivo (cn 2009, since 2011), OnePlus (cn 2013) | mass 6, 4.5, 4.5, 1.2 |
| Acer (tw 1976, since 1981), Asus (tw 1989, since 1995), HTC (tw 1997, since 2006) | mass 3.2, 3.5, 1.4 |
| Sony (jp 1946, since 1996), Google (us 1998, since 2010), Microsoft (us 1975, since 2012) | premium 3.5, 3, 3 |
| Motorola (us 1928, since 1983), Meta (us 2004, since 2014), Amazon (us 1994, since 2011) | mass 3, budget 3, budget 2.5 |

Ended, with the year each really ended and its `fate`: LG (kr 1958, since 1998, end 2021, closed), Nokia (fi 1865, since 1982, end
2013, acquired), IBM (us 1911, since 1981, end 2004, acquired), Compaq (us 1982, end 2001, acquired), Palm (us 1992, end 2009,
acquired). Slugs are new and unique (`apple-devices`, `samsung-devices`, `google-devices`, `ibm-pc`, `lg-mobile`, plain names for the rest).
No arcs and no negative words (the test greps the JSON for scandal, fraud, lawsuit, recall, bankrupt, breach, cartel). The procedural tail
uses `MARKETS.devices.names`: pre Pocketwave, Glassline, Slateworks, Nimbo, Pixelcore, Lumio, Orbitron, Wristly, Visora, Kinetica; post
Devices, Mobile, Electronics, Computing, Labs. The existing test that fictional names never take a real one covers it.

## 8. Heavy R&D, waves, news

- **Heavy R&D** (`BREAKTHROUGHS.devices` in `heavy-data.ts`; `test/heavy-data.test.ts` needs exactly five, sorted by year, names
  unique and at most 40 characters): Pen-Input Pocket Computer 1993, Pocket Music Player 2001, Touch Slate Computer 2010, Foldable
  Display Phone 2019, Spatial Headset Computer 2024, each with a one-sentence note. `heavyEligible` is true for devices, so the Products
  menu offers them unchanged and rivals follow on `heavyArrival`.
- **Wave roles** (release 1, `tech-wave-data.ts`): `devices` joins `core` of `smartphone` (now software, devices) and
  `microcomputer` (now semiconductor, software, devices). `mobilephone` stays: telecom sells that wave. The comment about
  "no devices trade" is rewritten. History waves apply by role, so no code reads them for devices.
- **News** (logs at most 90 characters): "Acme built a chip fab." with a "Fab Online" notice; "Acme Silicon supplied chips to Acme Phones
  and saved it about $4.2M." once a year; the Group Services notice on assignment. Heavy launches use `announceLaunch`. No random event.

## 9. Every place the trade id goes

| File | Change | Forced by |
|---|---|---|
| `data/markets.ts` | `devices` as the last entry of `INDUSTRY_IDS`, after `carbonCapture`, so no existing index moves (not in `DEEP_TECH_IDS`, `EXPANSION_INDUSTRY_IDS`, `PROCEDURAL_DEEP_TECH_IDS`); comment "55 industries" to 56 | compile |
| `business/industries.ts` | `INDUSTRIES.devices` | compile (`Record<Industry, IndustryDef>`) |
| `business/competition-data.ts` | `MARKETS.devices` | compile |
| `business/conglomerate-econ.ts` | `SECTORS.devices = ['tech', 'consumer']` | compile |
| `economy/model.ts` | `classifySector`: add `devices` to the technology rule (default is 'consumer') | `test/economy-sectors.test.ts` |
| `business/supply.ts`, `market-trade.ts`, `market-view.ts` | `PROFILES.devices = GOODS`; `GOODS.devices = 1`; `SEGMENT_NAMES.devices` Entry devices, Mainstream, Premium, Flagship | none |
| `business/products.ts`, `product-data.ts` | `STYLE.devices = 'goods'`; `ERA_FROM` x8; `DEMAND` x8; `PERIOD_CLASSICS.devices` | `product-ideas` tests |
| `business/heavy-data.ts` | `BREAKTHROUGHS.devices` | `test/heavy-data.test.ts` |
| `workshop/catalog.ts`, `workshop/migrate.ts` | `devices` in the `gadget` and `computing` regexes and in `fieldFor`'s computing rule | `test/workshop-trades.test.ts` lists trades with no category |
| `business/market-data-devices.ts` (new), `data/brands-rivals.ts` | `DEVICE_ROWS` and the registry line | `test/market-brands.test.ts` |
| `business/tech-wave-data.ts` (release 1) | two `core` lists and one comment | `test/tech-wave-data.test.ts` |

Not touched, on purpose: `invest/engine.ts`, `history/market-events.ts` `EXPOSURE`, `nepo-asks.ts`, `special/politics.ts`, `nation/data.ts`,
`events-extra.ts` sets, `franchise.ts` (an explicit list), `data/markets/*.ts` demand rows, and the job-side `Industry` in `data/jobs.ts`,
`careers.ts` and `workplace/catalog.ts`. The founding menu, `hotIndustries`, `probe-life` and `fuzz-kit` read `INDUSTRY_IDS`.

Hard-coded counts to update: `test/business-expansion.test.ts:36` (`toHaveLength(55)` to 56, and its title), `test/market-roster.test.ts:160`
(`WORLD.length + NATIONAL.length` 55 to 56; its else branch already demands 15 real brands), `test/market-brands.test.ts:20` (33 curated to
34, and its title), `test/economy-sectors.test.ts` (`devices: 'technology'` in `SECTORS`), `test/workshop-trades.test.ts` (an expectation
for `categoriesOf('devices')`; the no-category list stays). Docs: the `markets.ts` comment and the trade count in `docs/ARCHITECTURE.md`.
Tests that loop over every trade run once. `deeptech` (the start menu lists every trade) and `deeptech-review` (classic founding with
investors, the start-menu hints) run filtered with `-t` in task 2. `world2-rivals`, `talent-business` and `heavy-project` (every
breakthrough priced, filtered) run in task 3. `franchise` and `markets-*` read explicit lists and don't need a run.

## 10. State, saves, determinism, invariants

New saved state, all optional and read by `normalizeBiz` (the only whitelist that `readBiz` uses): `BizState.fabs?: number` (new, integer 1 to 3, else
absent) and `BizState.chips?: ChipSupply` (new; year integer, `from` and `name` strings cut to 60 characters, stage 2 to 4, node integer 0 to 6, yield
.3 to .97, cover 0 to 1; any bad field drops the record). `SAVE_SCHEMA` stays 2, `BIZ_VERSION` and `TECH_VERSION` don't change, and
`TechState` gets no field. A save made on an older build knows no `devices` company, so nothing migrates. (An older build loading a
newer save falls back to 'restaurant' through `industryDef`, as it does for every new trade.) Heirs, Time Machine forks and group
divisions carry `fabs` and `chips` inside the asset.

| Invariant (FEATURE-ROADMAP) | How it holds |
|---|---|
| No foresight | Terms come from last year's booked statements and the sister's current `TechState`; hints use "last year" numbers and the plan the resolver already runs |
| Deterministic | No `g.rng` draw anywhere in this release. Rival performance and price use `hashOf` and `mix` on rival id and family, and `rivalPriceIndex` (seeded, `familyId`). Heirs share the cast |
| Accounting conservation | The saving is in the buyer's cogs; the invoice is profit-neutral and eliminated by `internalRevenue`; `saved` is the ledger-visible attribution; a fab is cash out and upkeep in `bookYear` |
| Action-level authorization | `buildFabAction` rechecks cash, `FAB_MAX`, industry and `boardAllows` inside `run`; `toggleService` keeps its owner, `manageBlock` and `core.share` checks; `valid()` runs again in `prepare` and `settle` |
| Yearly idempotence | No new hook. `assignChips` lives behind `groupServicesPrepared`, `settleChips` behind `groupServicesSettled`; a second call changes nothing |
| Pure presentation | `specSheet`, `devicesMenu`, `chipTerms`, `osPull` read state only; a test compares `JSON.stringify(g)` and `g.rng` before and after |
| Bounded state | 3 fabs, 1 chip record per company, 12 rows, results replaced each year |
| Truthful copy | "about" on every saving, the fab hint says cost only, the header says rivals' figures are the market's, no rival is named |
| R&D must not scale with money | The only new price, `fabCost`, never reads cash, revenue or value (a test sets cash to 1e6 and 1e12 and gets one price). Heavy R&D cost is `rdCost`, unchanged |
| Years | `evolve` passes the fiscal year to `chipTerms`; `marketCtxFor` gets the plan year it is called with; menus use `g.year`; `assignChips` stamps `g.year - 1` |

## 11. Balance guards and exploit risks

| Risk | Guard | Test |
|---|---|---|
| Fab plus sister stack | `chipSource` takes the better source only | A company with 3 fabs and a stage-4 sister gets one cut, never the sum |
| A shell chip company feeds a giant, or an unused sister pays | `cover` = `CHIP_RESERVE x sister revenue / bill`; the hold is `min(.2, bill / revenue)`, at most .5 per sister, and only for a used source | A 1M sister covers under 1% of a 2B buyer; a buyer with 3 fabs leaves the sister's `capacityLoss` at 0 |
| Funded or minority sister | `own >= .999` kept; `chipBlock` explains | A sister with 80% group ownership is refused with the reason text |
| Toggling a contract in and out | Terms are written once per fiscal year; a record not renewed is deleted at the next year start | Toggling mid-year changes nothing until the next fiscal year |
| Unit-cost spiral | Chip cut at most 10.5%, dominance at most 10% | Combined multiplier at 0.80 or higher before the supplier grade |
| OS monopoly | `network` 1.5, `OS_BETA` .9, `OS_PULL_CAP` 3.0, OS ages, rivals keep .75, quality edge x3 | `osPull` at base .8 is 3.0; at strength 0 equals the plain pull; a rival with quality +30 wins share back |
| Fab spam and cash tricks | Max 3, price +35% each, no sale, fixed price | Cash 1e6 and 1e12 give one price; the fourth fab is refused |
| Quality pump | `lift` at most 6 and `qTarget` still clamps at 98 | Three fabs and a sister give one lift, at most 6 |
| Double count with the smartphone wave | The curve is flatter 2007 to 2013; the wave reaches costs and demand only through `waveFactors` | The 2013 to 2006 size ratio against the curve, inside a band |
| Cross-sell and contract | `groupYear` drops cross-sell for a chip buyer | A group with a chip contract books no `crossSell` for the buyer |
| Real-name claims | Rows are neutral, specs name nobody, figures are modeled | The cast test greps for the banned words; menu rows contain no rival name |

## 12. Text

Strings follow `docs/VOICE.md`: a plain narrator, contractions, no encouragement, no em-dash (the guard is at its cap of 24), logs at most 90,
outcomes 120, scenes 140, nothing past 180 characters, so `node scripts/voice-report.mjs --json` doesn't grow. The longest static strings are
the chips row for a sister (about 100), the market header (96) and the sister notice (81). Rows use full stops, not colons, between clauses, and no lists of three. Purple hints come only from `fabGain`.

## 13. Tests

New files under `test/`, one `npx vitest run` call per task with `--maxWorkers=2`:

- `devices-data.test.ts`: constants and tables; `marketNode` monotone; `chipPerf` bounds; `devicePerf` equals `chipPerformance` (release 3);
  `chipSource` no stacking; damaged `fabs` and `chips` read as the market; `chipCostFactor` at least .895; `chipBook` adds up;
  `kindReference` anchors (2026 equals 900, 1,300, 500; early years within 25% of `computerUsd`). `fabCost` (fixed, +35% each) is
  tested in `devices-chips.test.ts` and `osPull` (bounds) in `devices-os.test.ts`, because both live in `economy.ts`.
- `devices-cast.test.ts`: 24 rows, 19 alive in 2026, the five ended, slugs, no arcs, no banned word, the field in 1985 and 2026, the
  five breakthroughs and the two wave roles.
- `devices-trade.test.ts`: the `INDUSTRIES` and `MARKETS` entries, sector 'technology', relatedness .5 with semiconductor; at least 3 classic
  ideas and 8 ideas from 1977 to 2040 in 'us' and 'in' (the pattern of `product-ideas-new-trades.test.ts`); no anachronistic word in a first year
  (`anachronismsIn`); era gating (no Smartphone in 2006, no VR before 2016); `industryEraBlock` before 1977, and in 'in' after 1977; finite plans
  from 1950 to 2060; calibration: a one-studio US company's best plan earns 8% to 20% of capital in 2026.
- `devices-chips.test.ts`: the fab action (authorization, cash, max, board, no rng); `costFactor` and `bookYear` upkeep; `evolve` lift; `fabGain` equals
  the plan difference and the hint text follows its sign.
- `devices-save.test.ts`: hostile `fabs` and `chips` through `normalizeBiz` (strings, NaN, huge, negative, wrong stage); other trades unchanged;
  `readBiz` keeps both; an old save loads.
- `devices-os.test.ts`: `osStrength`; `osPull` bounds; `marketCtxFor` byte-identical for a non-devices company; the cached ctx isn't mutated.
- `devices-group.test.ts`: the rule table; `assignChips` once a year and idempotent; cover and hold math; unused sister; `settleChips`
  neutral to provider profit and eliminated by `internalRevenue`; stale record cleared after leaving the group; cross-sell dropped;
  Assign All; a non-owner is refused.
- `devices-specs.test.ts` and `devices-menu.test.ts`: ranks and ties on a fixed field; the price negation; prior and trend; at most 12 rows
  at every year 1977 to 2040; purity (state JSON and `g.rng` identical); no NaN or undefined text; voice lengths; no rival name.
- `devices-story.test.ts`: over several seeds a device company plays 2024 to 2034 as control, two fabs and sister chips; costs fall, performance and
  quality rise inside the caps, profit follows the section 3 order, nothing is NaN.

Existing files updated (section 9) or run: `business-expansion`, `market-roster`, `market-brands`, `economy-sectors`, `workshop-trades`,
`heavy-data`, `tech-wave-data`, `product-ideas-new-trades`, `business-save-normalization`, `plan-search-reads` (read counts unchanged),
`competition`, `business-financial-overhaul`, `conglomerate-v2-management`, `voice-guards`.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Releases 1 to 3 aren't merged | Task 1 begins by confirming `announceWave`, `scorecard.ts`, `rivalPriceIndex` and `chipPerformance`; if `rivalPriceIndex` is absent task 7 stops and reports |
| `group-services.ts` has one `valid()` for everything | The chip branch returns before the shared rules and is covered by `devices-group.test.ts`; existing contract tests stay unchanged |
| `marketCtxFor` and `costFactor` are hot | Both additions are O(1) for other trades; the OS scan reads one product list; `plan-search-reads` guards the counts |
| The numbers feel off | They are starting points (15%, 25%, 30%, 8%, 18%, 24%, 150M, beta .9, cap 3.0). The structure and the bounds are fixed and tested |
| Real-brand facts and tone | Facts are well known and approximate, rows have no arcs, specs name nobody; check each row against `data/brands.ts` rules |
| "Smartphone Mk II" reads oddly | Goods style gives it; accepted for now, a one-line `STYLE` change later |
| Pinned values move because the trade is in a loop | Stop and report; don't edit unrelated pins (`talent-business`, `world2-rivals`) |

## 15. Decisions made while writing this spec

1. **D1 Classic engine.** Section 1.
2. **D2 One chip source.** Best of own fabs and one sister, never summed: bounded, easy to explain in one row.
3. **D3 Cost before the year, money after.** The cut is in the plan (so hints and reports agree); the sister's books follow the existing profit-neutral invoice.
4. **D4 Same country and full ownership kept; outlets relaxed.** The audit-safe choice.
5. **D5 Performance has one channel.** It lifts quality through `evolve`; the screen says so.
6. **D6 Rivals use the market's chips.** Their performance moves with `marketNode(year)`; only the player can beat the market node.
7. **D7 OS lock-in is `osPull`.** A low beta, a cap and aging, in `marketCtxFor`, with no new saved state.
8. **D8 Nothing seeded moves, docs wait.** No stock, event-exposure or demand-row changes; ARCHITECTURE.md and a README line now, release notes at integration.
9. **D9 A fab is sunk capex, off the equipment book.** Counting it in `equipmentValue` would raise insurance and disaster damage for a
   trade the spec balances without them. The cash leaves with a log and a notice, and `evolve` and `bookYear` carry the return.

## 16. Build order

Each task runs `npm run typecheck` and its named test files in one call with `--maxWorkers=2`, never the full suite.

| # | Task | Files | Check |
|---|---|---|---|
| 1 | Preflight (releases 1 to 3 present, typecheck and `voice-report` baseline); `devices-data.ts` and its test | new `business/devices-data.ts`, `test/devices-data.test.ts` | `devices-data` |
| 2 | Register the trade: id, `INDUSTRIES`, `MARKETS`, `SECTORS`, `classifySector`, supply, tariff and segment tables, `STYLE`, `ERA_FROM`, `DEMAND`, `PERIOD_CLASSICS` | `markets.ts`, `industries.ts`, `competition-data.ts`, `conglomerate-econ.ts`, `economy/model.ts`, `supply.ts`, `market-trade.ts`, `market-view.ts`, `products.ts`, `product-data.ts` | `devices-trade`, `business-expansion` (55 to 56), `economy-sectors`, `product-ideas-new-trades`, `deeptech` and `deeptech-review` (filtered); `market-brands`, `market-roster`, `heavy-data` and `workshop-trades` stay red until task 3 |
| 3 | The cast, the catalogue, the workshop and wave roles; update the two counts | `market-data-devices.ts`, `brands-rivals.ts`, `heavy-data.ts`, `workshop/catalog.ts`, `workshop/migrate.ts`, `tech-wave-data.ts` | `devices-cast`, `market-brands`, `market-roster`, `heavy-data`, `workshop-trades`, `tech-wave-data`, then once each `world2-rivals`, `talent-business`, and `heavy-project` filtered |
| 4 | Saved state, costs and the fab: `fabs`, `chips`, `normalizeBiz`, `costFactor`, `evolve`, `bookYear`, `fabCost`, `buildFabAction`, `fabGain` | `state.ts`, `economy.ts`, `manage.ts` | `devices-chips`, `devices-save`, `business-save-normalization`, `plan-search-reads` |
| 5 | OS lock-in: `osStrength`, `osPull`, the `marketCtxFor` hook | `economy.ts` | `devices-os`, `competition`, `plan-search-reads` |
| 6 | Sister supply: `valid`, `chipBlock`, `assignChips`, `settleChips`, menu rows, the `groupYear` cross-sell line | `group-services.ts`, `conglomerate-year.ts` | `devices-group`, `business-financial-overhaul`, `conglomerate-v2-management` |
| 7 | Specs and screen: `specSheet`, `devicesMenu`, the `businessView` hook | new `devices-specs.ts`, `devices-menu.ts`, `manage.ts` | `devices-specs`, `devices-menu`, `voice-guards` |
| 8 | Story and balance guards; the section 13 list once | `test/devices-story.test.ts` | `devices-story`, then the section 13 list |
| 9 | Docs: ARCHITECTURE.md section, trade count, README line | `docs/ARCHITECTURE.md`, `README.md` | `voice-guards` |
