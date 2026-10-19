# Tech waves for stocks: listed shares, funds and the player's listing react (design)

Date: 2026-10-19 · Status: design, recommended options taken, plan written (`docs/superpowers/plans/2026-10-19-waves-stocks.md`; its decisions P1 to P11 refine sections 4 and 5, and the plan wins where they differ), not implemented · Release 1b of the tech waves program
Branch `claude/tech-waves-stocks`, on release 1 (HEAD `e4b383a`). Release 1 spec: `docs/superpowers/specs/2026-10-19-tech-waves-design.md`
(its section 11 overrides sections 1 to 10) and plan `docs/superpowers/plans/2026-10-19-tech-waves.md`. Anything stock-side that
differs from release 1 is decided here. Names marked (new) don't exist yet; every other name was grepped in this worktree.

## 1. What the player asked for

> Markets should react to breakthroughs the way they do in real life.

Release 1 moved company markets (demand, costs, valuation, VC heat, rivals) and kept listed stocks wave-free on purpose. The
player now wants the stock side: listed stocks, index funds, fund returns and the player's own listed company move when a
breakthrough lands, and a founder who trades ahead of their own launch is an insider. One play session:

1. A company the player runs finishes a Heavy R&D breakthrough that is in `HEAVY_WAVES` (for example Autonomous Agent Platform).
2. That birthday the stocks the wave helps are up. An AI platform is an `ai` wave: AI stocks are its core (+10%) where an exchange lists
   them, semiconductor and electronics stocks its supply (+5%). Each quote says "Autonomous Agent Platform wave: sector +5%". The
   launcher's own trade (software, the Technology stocks) is spared; trades the kind disrupts, like Media, slide as delivery arrives.
   The market line and the financial news name the wave once.
3. Over the next years the sector's price level follows the wave: it climbs while delivery catches up and unwinds only if delivery
   lags hype. No year number is ever the reason.
4. Index funds, fund returns, single-stock option settlements and the Investing talent's gut see the same level.
5. The player's own listed company is valued with the same wave, through its fundamental.
6. If the player bought shares in related sectors in the 12 months before the launch, the press may find out and the case runs
   through the existing insider machinery.

Assumptions (mine): "like real life" means a sector price level that moves with hype and delivery, not the retired one-off
repricing (`marketBreakthroughs`); one global stock beta is enough; real listed companies move with their sector both ways.

## 2. What the audit found (verified in this worktree)

| Fact | Where |
|---|---|
| A wave is `TechWave` in `g.flags.techWaves` (at most 64, replaced never edited) with `hype`, `delivery`, `last`, `skip`, `mature`; `techBase` holds settled demand and cost factors. | `business/tech-wave-factors.ts` (`cleanWave`, `readTechWaves`, `readTechBase`, `effectsOf`, `waveFactors`), a leaf on purpose. |
| The yearly step moves hype toward delivery once a year behind `last`, settles a mature wave into `techBase` (demand and costs only, no value) and drops a dead one. The wave state has no history: only the current numbers. | `business/tech-waves.ts` `advanceTechWaves`, `nextState`, `deliveryTarget`. |
| Release 1 keeps quoted companies wave-free: `stampWave` returns on `isDeepTech(b) \|\| isQuoted(b)`, the `valuationOf` mood skips `isQuoted`, `operatingValue` passes `!isQuoted(b)` to `industryCycle`. Pins: `test/tech-waves-readers.test.ts`. | `tech-waves.ts`, `economy.ts`, `deeptech-core.ts`, `state.ts` `isQuoted`. |
| A listed security's price is the engine path times a level. `shockFactor` and `indexShockFactor` fold news, the macro `economyMarketFactor` and `breakthroughStockFactor`, keyed through `companyKey`. Every stock reader goes through them. | `invest/shocks.ts`. Callers: `investments.ts` `listing`, `moveHolding`, `revalueHoldings`, `stockHistory`, `normalizeHoldings`; `computer/money-stocks.ts` `listedTargets`, `settlePrice`; `computer/money-options.ts` `settleMove` (index options); `business/fund-model.ts` `marketMove`; `invest/instinct.ts`. |
| The stock tables stop at 2025: `sectorExcess` returns null outside `inHistory`, so from `PRESENT_YEAR` (2026) a stock is drift plus beta times the market plus noise. History waves (`HISTORY_WAVES`) end by 2025 and real booms are already in the tables. | `invest/engine.ts` `sectorExcess`, `nextStock`, `nextRealSlot`; `history/tech-waves.ts`. |
| 35 sector ids (`SectorId`: 27 classic, 8 deep tech). A stock's sector is `companyDef(info, slot, gen).sector` or `'penny'`. Lines of a share class are `<company id>~<letter>`; `companyKey` strips the letter. A damaging invented story never sticks to a real company (`shockable`). | `invest/engine.ts` `SECTORS`, `slotPlan`, `companyKey`; `invest/shocks.ts` `shockable`. |
| `slotPlan(info)` is the exchange's design plan, not its listing: a real company sits in a slot of another sector. On the US exchange in 2031, 17 of 44 slots differ, and the plan has an `ai` slot that holds a bank. A smartphone wave's index tilt reads +1.9% by the plan and +3.2% by the listing. | Probe of `slotPlan` against `companyDef(info, slot, gen).sector` of `exchangeYear(...).stocks`. Any sum over sectors must read the listed companies. |
| Three market clocks in 2026+. Engine, Stocks, options and funds: `indexMove` read at `marketYearOf(fiscal)` = fiscal + 1. The listed player firm: `exchangeMove` at the fiscal year with its own seed (`g.lifeId`, `bizexchange`, no macro factor, no regime). `conglomerate-year.ts` `revalue` is the second caller. | `fund-model.ts` `marketYearOf`, `marketMove`; `economy.ts` `exchangeMove`, `updateSharePrice`; `conglomerate-year.ts`. |
| The listed player firm's price is 0.5 momentum plus 0.5 fundamental (`valuationOf` over `sharesOut` times `classFactor`), times `publicBusinessShockFactor`. Own listing has no insider rules (spec D12); own buys pay `max(price, fundamental) x 1.03`. | `economy.ts` `updateSharePrice`; `business/own-listing.ts`, `own-trade.ts`; own-listing spec D12. |
| Option premiums are sampled from `syntheticIndexMove` draws; settlement reads `shockFactor` at the bet year + 1. Bets are capped (`MAX_BETS` 6, `BETS_PER_YEAR` 3, `CALL_CAP` 50). | `computer/money-stocks.ts` `indexLogSamples`, `stockFairValue`, `settlePrice`. |
| The Investing talent reads `shockFactor` at year and year + 1 for stocks and `indexShockFactor` for the index fund. Its cache key holds only `marketShocks`. | `invest/instinct.ts` `candidates`, `slotMove`, `marketInstinct`. |
| `insiderPositions` is exported; `InsiderCase`, `abuseData`, `repairAbuse`, `exposeCase`, `yearlyAbuse`, `caseSeverity`, `caseCharges`, `exposureChance` are private. Cases live in the owner-stamped politics profile, so an heir never inherits one. Cases are built inline in `announce` and `policyInsider`. | `special/politics.ts`; `special/common.ts` `peek`, `prof`. |
| Player-origin waves are written where the asset is in scope: `advanceHeavy` (the heavy launch) and `announceBreakthroughs` (deep-tech milestones). Workshop, race and rival waves have no company. | `business/heavy-rd.ts`, `business/deeptech-sim.ts`, `tech-waves.ts` `announceWave`. |
| Yearly order: `business` (the wave step is its last act), `techWaves`, `development`, `investments`, `hedge`, `shops`, `computer` (bets settle), `finance`. | `aging.ts` `YEARLY_HOOKS`; `yearly.ts`. |
| Open Priority 0 defects touching this area: C-03 (personal gains omit capital-gains tax), C-04 (bond maturity pays the marked price), C-12 (stale booked marks). | `docs/FEATURE-ROADMAP.md`. |

## 3. Scope and non-goals

One slice, about 7 plan tasks (section 11): the sector table and the level reader; the level folded into the existing stock
seam; the one market clock; the player's listing; the insider rule; the tag, the market line and one news line; the story test.

Cut list (not in this release):

- Penny stocks, property trusts, coins, gold, bonds and savings: no wave term. Bonds are never touched (C-04).
- Option premiums that see waves, listing-mood (IPO) changes, regime effects (a wave never makes a crash or a boom).
- A per-stock beta (one `STOCK_BETA`), sector indices, a second index fund, a wave history screen.
- Foreign-exchange holdings in the insider rule; bearish positions on disrupted sectors; Workshop, race and rival waves as insider
  origins; warnings for model releases and drug approvals (they have no advance sign).
- Refactoring `announce` and `policyInsider` onto the new case helper; the macro `innovation` feed for stocks.
- Putting `economyMarketFactor`, shocks or waves into `exchangeMove` (section 5.5).
- Fixing C-03, C-04 or C-12 (section 8 says how this release avoids amplifying them).
- NPC and rival companies' own stock prices (they have none); banks and finance trades (no wave role).

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| S1 | The reaction is a LEVEL on the price, like a shock: price = engine path x `L(year)`. `waveStockFactor(g, secId, year)` (new). | Quotes, holdings and settlements already work as `path x level`; a flow would need a ledger per holding. |
| S2 | `L = clamp((1 + STOCK_BETA x (V - 1)) x S, 0.3, 3)`. `V` is the combined wave value factor of the sector's trade in the exchange's home market; `S` is the settled stock factor; `STOCK_BETA = 1.5` (new). Plan P1 applies the beta per wave and multiplies the waves, so settling keeps the level with several waves live. | Stocks capitalize expectations harder than a private valuation, so the company value `V` is amplified. The clamp is the existing `FACTOR_BOUNDS.value`. |
| S3 | Each wave remembers where it was: a 6-point `trail` of `[year, hype, delivery]` and one projected next step `nx`. The level of a calendar year uses the state of that year; the year after `last` uses `nx`. | `before` in `withShock` and `moveHolding` must be last year's real level, or the reported return misses the wave. With `nx`, a read before and after the yearly step gives the same number (funds run before the step; quotes after). |
| S4 | One table maps every `SectorId` to at most one trade or none (23 mapped, 12 none), completeness pinned by test. | The brief's rule; a sector with no honest trade stays out. |
| S5 | The level is folded into `shockFactor` and `indexShockFactor` (one seam), not added at eight call sites. The index takes the equal-slice mean of the levels of the stocks listed that year (`listedSectors`, never `slotPlan`). | Quotes, holdings, funds, option settlement (single-stock and index options) and the gut then agree by construction, and a call site can't be forgotten. |
| S6 | History rows never reach a stock level: the reader asks `effectsOf` for them only when `year >= PRESENT_YEAR`, and no row is live then (the last ends in 2025). Dynamic waves count in any year. | Real booms are in the stock tables before 2026; counting them again would double them. A test pins level 1 with no dynamic wave in every year, 2009's smartphone row included. |
| S7 | No scheduled fades. A settled wave leaves a permanent stock factor in `techBase`; only a wave whose delivery failed drops. | A level that falls on a known date is a free bet. |
| S8 | Real listed companies take the level both ways. | The ban rule protects a named firm from an invented accusation; a sector level names no firm. |
| S9 | Option premium sampling is untouched; settlement sees the level. | The brief; the premium stays on the procedural distribution. |
| S10 | The gut reads the same `shockFactor`, so it sees `nx`. Its cache key gains `waveSignature(g)` (new). | Honest hints come from the resolver's own function, not a copy. |
| S11 | From `PRESENT_YEAR`, `exchangeMove` returns the engine's total move at fiscal + 1 (`marketYearOf`), same family seed as Stocks and funds. History years keep today's code. | The player sees the market of year F + 1 at the birthday that books fiscal F; funds already use it. |
| S12 | A quoted company (listed or a division of a listed group) takes the wave through its fundamental with a stock-grade stamp. No second level on its price. | One number once; a level on top of a fundamental that already moves would double it. |
| S13 | The insider rule covers heavy and deep-tech waves written by the player's own company, when the player is its founder or CEO, for positions in core or supply sector stocks fresh in the window. It opens a case through a new shared helper in `special/politics.ts`. | The brief; heavy and deep-tech are the only waves with a company and an asset at the writer. |
| S14 | The tag, the market clause and the news line are pure reads of the same numbers. | Pure presentation and truthful copy. |
| S15 | The warning lives where the player starts the work: the Heavy R&D confirm (only while the launch would still fall inside `HEAVY_WAVE_WINDOW`) and the deep-tech program confirm. | The player can't know the launch date, so the rule must be stated before it matters. |
| S16 | No new saved top-level flag. New optional fields only: `TechWave.trail`, `TechWave.nx`, `TechBase.stock`, `WaveStamp.q`, `InsiderCase.role`, `.note` and cause `'wave'`. `SAVE_SCHEMA` stays 2. | Roadmap invariant 5. |
| S17 | Four assertions of `test/tech-waves-readers.test.ts` change on purpose (section 9). | They assert the wave-free listed behavior this release lifts. |

## 5. Design

### 5.1 State shapes

```ts
// business/tech-wave-factors.ts (leaf), additive
export interface TechWave {
  // ...release 1 fields unchanged...
  /** (new) Hype and delivery at each of the last 6 years stepped: [year, hype, delivery], oldest first; the last entry equals hype and delivery. Missing in older saves. */
  trail?: readonly (readonly [number, number, number])[]
  /** (new) The next yearly step as projected when this one ran: [hype, delivery, fork tag]. Used only while the tag matches outcomeTag for last + 1. */
  nx?: readonly [number, number, string]
}
export interface TechBase { demand: number; costs: number; /** (new) permanent stock level of settled waves, 0.3 to 3 (the live level's bounds); missing is 1 */ stock?: number }
export const STOCK_BETA = 1.5                                                                  // (new)
export function stateAt(w: TechWave, year: number, tag: string): { hype: number; delivery: number }   // (new)
export function stockLevelFor(g: Pick<GameState, 'flags'>, trade: string, market: string, year: number): number  // (new) L above
export function waveSignature(g: Pick<GameState, 'flags'>): string                              // (new) cheap cache key part

// business/state.ts
export interface WaveStamp { v: number; y: number; /** (new) true: stock grade, written for a quoted company */ q?: true }

// business/tech-waves.ts, additive (the body advanceTechWaves had inline, now shared and pure)
export interface WaveStep { hype: number; delivery: number; mature: number; stall: boolean; fate: 'live' | 'settle' | 'drop' }
export function stepWave(g: GameState, w: TechWave, year: number): WaveStep                      // (new)
export function projectWave(g: GameState, w: TechWave): readonly [number, number, string]       // (new) stepWave at last + 1
// WaveInput gains `by?: string` (new): the asset id of the originating company; heavy and deep-tech writers pass it.

// invest/wave-stocks.ts (new): imports invest/engine, invest/clock, events/era, history/market-events and the leaf, never business/tech-waves.ts
export const SECTOR_TRADE: Readonly<Record<SectorId, Industry | null>>
export function sectorOfSec(secId: string): SectorId | null              // companyKey, then companyDef; null for coins, pennies, bonds
export function listedSectors(g: GameState, exKey: string, year: number): readonly SectorId[]   // (new) the sector of each stock listed that year, not slotPlan
export function waveStockFactor(g: Pick<GameState, 'flags'>, secId: string, year: number): number
export function waveIndexFactor(g: GameState, exKey: string, year: number): number
export function waveTag(g: Pick<GameState, 'flags'>, secId: string, year: number): string | null
export function waveClause(g: GameState, exKey: string, year: number): string | null
export function waveNews(g: GameState, exKey: string, year: number): string | null   // the one news line (plan P8)

// invest/clock.ts (new, leaf): marketYearOf and marketFamily move here; fund-model re-exports them
export function marketYearOf(fiscal: number): number
export function marketFamily(g: GameState): string
export function marketAnchor(g: GameState): number                      // the same as computer/money-common anchor (invest/instinct.ts and investments.ts keep copies too)
export function bookedMarketMove(g: GameState, countryId: string, fiscal: number): number

// special/politics.ts, additive: InsiderCase gains cause 'wave', role?: 'founder' | 'ceo', note?: string (the wave's name)
export interface InsiderCaseInput { target: BetTarget; pos: InsiderPositions; mult: number; indexGain: number; role: 'founder' | 'ceo'; note: string; company: string; key: string }
export function openInsiderCase(g: GameState, input: InsiderCaseInput): boolean               // (new) shared helper

// business/wave-insider.ts (new)
export function waveInsiderCases(g: GameState, w: TechWave, assetId: string): number           // (new)
// business/tech-wave-data.ts, additive (plan P6): the warning is a constant, so manage.ts and deeptech-menu.ts never import politics.ts
export const INSIDER_WARNING: string                                                         // (new) the copy for both confirms
export function heavyStartsWave(trade: string, entry: { name: string; first: number }, launchYear: number): boolean   // (new) the writer's own window test
```

### 5.2 The sector table (`SECTOR_TRADE`, new)

```
telecom: telecom      utilities: energy      oil: energy          automakers: autoShop    electronics: semiconductor
industrials: manufacturing   tech: software   games: gameStudio   ecommerce: ecommerce    media: marketing
entertainment: entertainment pharma: biotech  construction: construction  food: bakery     brewers: brewery
semis: semiconductor ai: aiLab  robotics: robotics  biotech: biotech  space: spaceTech  ev: electricVehicles
quantum: quantum     cyber: cybersecurity
none: banks insurance mining hotels airlines shipping agri property supermarkets fashion cosmetics leisure
```

Every mapped trade has a role in at least one `WAVE_KINDS` kind (no dead rows). Each mapped trade is one of the sector's
`drivers` except three, which carry a reason in the table comment: telecom (no drivers), electronics (the chips inside
gadgets, its blurb), pharma (drug makers, core of the drug kinds). Penny stocks (`def.sector === 'penny'`) and ids that don't
parse as `<exchange>#s<n>g<m>` after `companyKey` have no sector and a level of 1.

### 5.3 The level, with starting numbers

For a stock of sector `s` on exchange `E` in calendar year `y`, with `trade = SECTOR_TRADE[s]` and `market = E.home`:

```
state(w, y)  = y > w.last ? w.nx (tag ok) : trail entry with the largest year <= y (the first if none), else the current hype and delivery
V            = clamp( product over waves w with y >= w.year of oneEffect(role(w.kind, trade), w.size, state(w, y)).value , 0.3, 3 )
               plus the history rows' value only when y >= PRESENT_YEAR (S6; no row is live then). The plan refines three lines: P1 stacks per wave,
               L = clamp(S x Product over waves of (1 + STOCK_BETA x (v_w - 1)), 0.3, 3), and one wave gives the table below exactly; P4 sets how far a settled
               factor reaches abroad; P9 drops a heavy wave's disrupted effect on its own trade in every market, not only in the wave's market
S            = base[trade|market].stock x base[trade|world].stock  (each 0.3 to 3, missing 1; market 'world' reads one)
L(y)         = clamp( (1 + STOCK_BETA x (V - 1)) x S , 0.3, 3 )
index tilt   = clamp( 1 + sum over the stocks listed that year of (L(its sector) - 1) / n , 0.5 , 1.5 ),  n = max(4, slotPlan(info).length)   (plan P10)
return move  = (1 + engine return) x L(y) / L(y - 1) - 1              (shockedMove, unchanged)
```

`V` per wave is release 1's reaction: core `1 + 0.35 r`, supply `1 + 0.17 r`, disrupted `1 - 0.05 r - 0.20 size x delivery`, with
`r = size x (0.6 hype + 0.4 delivery)` and reach 1 at the wave's market or `0.35 + 0.4 x delivery` elsewhere (a `world` wave
reaches every exchange in full). Starting numbers, size 0.5:

| Sector role | At announcement (hype 0.65, delivery 0) | Half delivered (0.8, 0.5) | Mature (1, 1) | Bubble that lags (0.9, 0.3, then hype falls to 0.35) |
|---|---|---|---|---|
| core | +10% | +18% | +26% | +17%, then +9% |
| supply | +5% | +9% | +13% | +8%, then +4% |
| disrupted | -1% | -10% | -19% | -7%, then -6% |

Bounds: one wave moves a sector level by at most 15% in one yearly step (about 9% at size 0.6); several waves multiply inside
the 0.3 to 3 clamp; a deep-tech wave projects with the lab's current share (an estimate, section 5.9). A settled wave writes
`stock = clamp(old x (1 + 1.5 (v - 1)), 0.3, 3)` at its own market from its final state, so the level at the settle year is
unchanged. The settled factor has the live level's bounds on purpose: a tighter clamp (it was 0.7 to 1.6) cut the level on the settle date when
waves stacked on one trade, a fall the player could predict from the mature counter (S7). A dropped wave (delivery under 0.1 after 6 years) leaves no factor; its premium was already unwound.

### 5.4 Where it plugs in (all additive)

| Reader | Edit | Effect |
|---|---|---|
| `shockFactor` (`invest/shocks.ts`) | one extra multiplication by `waveStockFactor(g, key, year)` inside the existing `boundedFactor(...)` | quotes (`listing`, `withShock`), holdings (`moveHolding`, `revalueHoldings`, `normalizeHoldings`), `stockHistory`, `tradingDepth`, `listedTargets` and bet settlement (`settlePrice`) |
| `indexShockFactor` | one extra multiplication by `waveIndexFactor(g, exKey, year)` in `breakthrough` | the index fund quote and holding, `marketLine`, `fundNode`, index option settlement (`settleMove`), and `fund-model.ts` `marketMove` (so every fund strategy, the personal and family hedge funds, `hedge-model.ts`) |
| `marketInstinct` cache key (`invest/instinct.ts`) | append `waveSignature(g)` to the key | the gut recomputes when waves change |
| `computer/money-stocks.ts` premium, `computer/money-options.ts` `optionPrice` | none | `indexLogSamples`, `stockFairValue` and `optionPrice` take no game state and stay procedural (S9); a test asserts equal premiums. Settlement sees the level: `settlePrice` (single stock) and `settleMove` (index options, through `indexShockFactor`) |
| `valuationOf`, `stampWave`, `industryCycle` | section 5.6 | the player's listed company |
| `fund-model.ts` | `marketYearOf` re-exported from `invest/clock.ts` | one definition of the clock |
| `investments.ts` | section 5.8 | tag, market clause, news line |

`waveStockFactor` returns 1 immediately with no waves and an empty base, so a game with no wave is byte-identical to today. It
is memoized per (validated list, year) with virtual wave lists built from `stateAt`, so it costs one map hit per quote. Coins, bonds,
savings, gold and property trusts never reach it (they don't parse as engine company ids).

### 5.5 The one market clock

```ts
// economy.ts exchangeMove(g, countryId, year), year is the fiscal year, unchanged signature
const real = historicalIndexReturn(countryId, year)
if (real !== null && Number.isFinite(real)) return clampN(real, -0.6, 1.2)      // history: unchanged
if (year >= PRESENT_YEAR) return bookedMarketMove(g, countryId, year)           // (new) exp(clamp(logRet, -5, 3)) - 1, clamped -0.6 to 1.2, of
                                                                                //   indexMove(<marketFamily's seed>, exchangeInfo(countryId), year + 1)
// otherwise the old seeded path (a history year the tables don't list), unchanged
```

Why fiscal + 1: the fiscal year F is booked at the birthday into F + 1, and that is the market year the Stocks screen and every
fund show at that birthday (`marketYearOf`). `conglomerate-year.ts` `revalue` calls the same function, so it follows. The clock is
the engine's own random path and nothing else: no shocks, no macro factor, no wave tilt (they are levels with their own
readers, and the firm's fundamental already sees the wave and the national economy through its profits). Side effect: the seed
is the family id, so an heir's listed company sees the family's market, not a fresh one. `bell(g, -120, 120)` stays the only
`g.rng` draw in `updateSharePrice`. The seam at fiscal 2025 (real table) to 2026 (engine) is accepted: history is unchanged.

### 5.6 The player's listed company

- `stampWave(g, b, fiscal)`: a deep-tech company still gets no stamp (it reads `industryCycle`). A quoted company now gets
  `{ v, y: fiscal, q: true }` with `v = stockLevelFor(g, b.industry, marketKey(b), marketYearOf(fiscal))`, clamped 0.3 to 3, deleted
  when within 0.005 of 1. `y` stays the fiscal year (`valuationOf` matches it against the last booked record); only `v` is read at the market year, so the firm reads the level its peers show at that birthday (plan P5).
- `valuationOf`: for `isQuoted(b)` the mood takes the stamp only when `ws.q === true` and `ws.y === last.year`, else `1` (release 1's
  behavior). For an unquoted company a stamp with `q` is ignored, so a listing or delisting never reads the wrong grade for the
  one year until the next booking. History rows are not read for a quoted company.
- `industryCycle(g, ind, year, withWave)` takes `boolean | 'stock'`; `operatingValue` passes `isQuoted(b) ? 'stock' : true`. `'stock'` uses
  `stockLevelFor(g, ind, 'world', year)` for `wave` and `value`.
- `updateSharePrice` is unchanged apart from the clock (5.5). The price blends 0.5 of last price and 0.5 of a fundamental that
  now carries the wave, so it closes the gap by half each booked year (about 88% in three) while peers jump at once. That lag
  is deliberate: own buys pay `max(price, fundamental) x 1.03`, so the lag is no cheap entry (D12 stays as written).
- `classFactor`, dividends (paid from profit), `ownListings` (a pure read of `b.sharePrice`), share-class lines of the own
  company (not engine ids, so `waveStockFactor` is 1) and the hedge cash sleeve (`hedgeProfitIn` is still stripped from the
  valuation) are untouched.
- `waveLines` (Annual Report and Market Overview) shows `price` instead of `value`, with the stock-grade number, for a quoted
  company, so the line stays true. Its `Pick` widens to include `public` and `group`.

### 5.7 The insider rule

Trigger: `announceWave` creates a new wave with `by` set (heavy and deep-tech writers pass `a.id`), after `announceWaveNews`. A repeat
call returns the stored wave earlier and never reaches the hook; case ids are deterministic anyway.

`waveInsiderCases(g, w, assetId)` (new):

1. Return 0 unless the character is alive and free, `w.year === g.year`, the asset is the player's and the player is its
   founder (`b.founderName` equals their full name, not `b.acquired`, the test `manage.ts` and `career.ts` already use) or its CEO
   (`runsIt`). A hired CEO or a plain owner is not an insider here. Role is `founder` or `ceo`.
2. Targets: `listedTargets(g)` on the player's exchange whose `sectorOfSec` maps to a trade that is core or supply for `w.kind`.
3. For each target, `insiderPositions(g, t, false, { freshOnly: true })` (shares bought in the announcement year or the year
   before, open calls and longs, index calls on that exchange). The window is the 12 months before the announcement.
4. `mult = waveStockFactor(g, secId, w.year) / waveStockFactor(g, secId, w.year - 1)`; the case gain is
   `pos.shares x (mult - 1) + indexGain`. Skip a target when `mult - 1 < 0.005` or the gain is under `local(g, 1000)` (de minimis).
5. Keep the three largest stakes and call `openInsiderCase` for each.

`openInsiderCase` (new, in `politics.ts`, beside the two inline builders it doesn't replace) builds an `InsiderCase` with id
`wave-` plus a hash of the wave id and security (idempotent, deduped by `repairAbuse`), `cause: 'wave'`, `bullish: true`, `role`,
`note` (the wave name), `title` "Founder of X" or "CEO of X", `office: 'mayor'` (the inert default `repairAbuse` already uses),
`evidence` 0.7 own, 0.55 shares, 0.35 crony, `status: 'open'`, `gain` as above; tags the bets with `tagBets`; and applies the
same hidden effects as `announce` (karma -6, `count(g, 'insiderTrades')`, `remember`). Exposure, the popup, the regulator's
investigation, `freezeBets`, held money (`giveBack`, `handOver`) and the arrest (`arrestPlayer`, 'Insider Trading') are the
existing code, with four changes: `repairAbuse` accepts the new cause, role and note; `causeText` says "launched <note>"; the
"bought before" wording used for laws is used for waves (a bet says "bet on X before I launched Y"); `caseSeverity` skips the mayor and school discount when `role` is set
and caps a shares-only case at 3 like a policy case; `caseCharges` adds no office label for a wave. The popup offers 'Deny
everything', 'Blame your financial advisor' and 'Lawyer up and say nothing' (the office choices need a job).

The own company is not a target: `ownListings` rows are not engine securities, so own-listing keeps spec D12 as written. A
case creates the owner-stamped politics profile; it does not make the player a politician (`politicianJob` stays null and the profile holds no
office, so the career menu and the pension are unchanged; a test pins `politicianJob`).

### 5.8 Menus, news and the tag (no new action, no new screen)

- `Quote.wave?: string` (new, not saved with a holding), set in `listing` for stocks. `offerNode` adds one row after the sector
  row. Text: `${name} wave: sector ${signed(L_i)}` for the live wave with the largest effect on that sector alone, shown when
  the effect is at least 0.5% and `anachronismsIn` doesn't flag the name. Example: "Frontier AI wave: sector +12%".
- `marketLine` appends ` · ${name} wave: index ${signed}` for the wave with the largest effect on this exchange's index.
- `newsLines` adds at most one line a year, for the sector with the biggest wave-driven move among the sectors listed on the exchange
  that year (at least 3%): "<Name> wave moved <Sector label> stocks up 9%." Down for a fall. Plain narrator; the longest possible line is about 80
  characters (the longest wave name is 28 characters, the longest sector label 23), under the 110 of a year digest.
- Heavy R&D confirm (`manage.ts` `heavyAction`), only for an entry in `HEAVY_WAVES` whose launch (`g.year` plus the years it takes)
  still falls inside `HEAVY_WAVE_WINDOW`, and the deep-tech program confirm (`deeptech-menu.ts` `programRow`), only for a program in
  `DEEPTECH_WAVES`, gain `INSIDER_WARNING`: "If it works, related stocks move. Buying them in the year before the launch can count
  as insider trading."
- Exposure copy follows `docs/VOICE.md`; the life-log line is "The press found out I bought X shares before I launched Y." (a bet:
  "The press found out I bet on X before I launched Y.").

### 5.9 Hints (honest purple hints)

The gut candidate return for a stock is `slotMove(next, id, shockFactor(y), shockFactor(y + 1))`, so with S5 it carries the wave step
the resolver will apply at the next age-up. The step comes from `projectWave`, the same pure `stepWave` the yearly advance runs.
For a heavy wave the step is exact (the adoption curve is a function of the year). For rival, race and workshop waves it is exact
(the seeded draw). For a deep-tech wave it uses the lab's booked share today and may differ after the year is played; the gut
already says "Gut feelings, not guarantees". Nothing else gets the projection: `strategyOutlook`, `vehicleOutlook`, the advisors and
the fund hints keep reading the drift, so no manager skill reveals a wave step. A Time Machine jump can leave `nx` computed under
an old fork; the tag check makes the reader ignore it until the next step.

### 5.10 Heirs and old saves

- Heirs: `waveWorldFlags` already carries waves and `techBase` through their validating readers, so `trail`, `nx` and `stock` travel
  with no `life.ts` edit. Holdings travel as before. Insider cases don't (owner-stamped), which is the existing politics rule.
- Old saves: no `trail` or `nx` means flat reads; no `stock` means 1; a stamp without `q` is ignored for a quoted company and
  used as before for an unquoted one; `InsiderCase` without `role` or `note` repairs to the old shape; `SAVE_SCHEMA` stays 2.
  Nothing is paid or refunded on load.

## 6. Determinism and the roadmap invariants

| Invariant | How it holds |
|---|---|
| No foresight | The level of a year uses only stored state and `nx`; a projection is the resolver's own step on today's information. No manager, advisor or fund outlook reads it. The Investing talent already reads the deterministic engine (documented in `instinct.ts`). |
| Deterministic | No new `g.rng`. Reads use hashes and `seeded` keyed by the family id and `outcomeTag`. The only draws are release 1's `waveDraw` and the existing `chance(g, ...)` in `yearlyAbuse`. |
| Accounting conservation | The level moves marks only. Seized money uses `addMoney` and `giveBack` (ledger visible). No new money path. |
| Action-level authorization | The insider check runs in the writers (`advanceHeavy`, `announceBreakthroughs`), not a menu. No new action exists to gate. |
| Save compatibility | Section 5.10. Every new field is optional and validated by its reader. |
| Yearly idempotence | `trail` and `nx` are written inside the `last` marker; `announceWave` is idempotent by id; case ids are deterministic; the stamp is rewritten per booking. |
| Pure presentation | `waveTag`, `waveClause`, the news line and the warnings are pure; the tests render from a deep-frozen state. |
| Bounded state | 6 trail points and one `nx` per wave (64 waves), 64 `techBase` keys, at most 3 new cases per wave inside the existing 256-case cap. |
| Truthful copy | Tag and news numbers are the applied levels; the warning is stated where the work starts. |
| Order independence | `L(y)` is the same before and after the yearly step (S3), pinned for heavy, rival, race and workshop waves; for a deep-tech wave it differs only by the change in the lab's share. |

## 7. Balance guards and exploit risks

| Risk | Guard |
|---|---|
| A sector level that moves on a known date | No age-based term anywhere; settle keeps the level (S7). The step is bounded by release 1's delivery caps (0.25 a year for a company wave, 0.30 seeded). |
| Predictable drift while a heavy wave ramps | At most 15% a step and usually 3 to 6%, against sector volatility of 25% to 45%; the player can't see `nx`; only the gut can. |
| Self-made wave to lift your own positions | Heavy R&D costs 8x a normal idea and a cooldown applies; two non-rival waves a year at most; the insider rule (5.7) makes the timing risky. |
| Calls on sector stocks the year before a launch | The rule counts open bets (`openBetsOn`) and the year-before shares; settlement sees the level, the premium doesn't, and `MAX_BETS`, `BETS_PER_YEAR` and `CALL_CAP` still bound it. |
| Puts on a disrupted sector | Left open on purpose (cut list): the disrupted effect builds with delivery, not at announcement (about -1%), so there is no timing edge. |
| Index and fund edge | The index tilt is the mean of the listed stocks' levels: about +2% to +5% at maturity for one or two core stocks, and about 3% at most in one yearly step; `vehicleOutlook` still shows `expected < drift`; the no-free-lunch test is untouched. |
| Own-listing edge | Own buys pay `max(price, fundamental) x 1.03`, and the fundamental moves at the booking, before the price. |
| Feedback loop wave, profit, valuation, listed price | Every link is annual and clamped; a heavy wave's delivery follows its record, not sales; the price feeds nothing back into the wave. A deep-tech wave's delivery reads lab share (release 1) and stays under its caps. |
| Real companies falling with a disrupted sector | Sector level, no named accusation; bounded by 0.3 and a typical -19% at maturity; test pins that no invented-story rule is bypassed. |
| Hostile saves | Readers clamp; `trail` is capped at 6 and validated, `nx` needs a valid tag, `stock` is clamped 0.3 to 3. |

## 8. Priority 0 defects: how this release avoids amplifying them

- C-03 (personal gains omit capital-gains tax): this release adds no sell, no realize path and no new gain channel. It adds a bounded
  mark (15% a step) that realizes through the existing paths, and the insider rule cuts the largest timing windfalls. A test
  asserts that no code in this release calls `realize` or `addMoney` except the existing case helpers.
- C-04 (bond maturity pays the marked price): bonds, savings and term deposits never parse as engine companies, so no level touches
  them; a test pins a bond's yearly move and maturity with a live wave.
- C-12 (stale booked marks): the stock-grade stamp is used only when its year equals the last booked year, else the mood is 1;
  `L(y)` doesn't depend on the order of the yearly hooks, so no finance decision reads a mark from the wrong phase.

## 9. Tests

New files (each names what it pins):

- `test/wave-stocks-data.test.ts`: `SECTOR_TRADE` has exactly the 35 `SECTORS` keys; every mapped trade is a real industry with a
  role in some `WAVE_KINDS` kind; the deep sectors map to their own driver; the three non-driver mappings are the listed ones.
- `test/wave-stocks-level.test.ts`: the level formula and bounds (beta, 0.3 to 3, the table in 5.3); one wave moves at most 15% a
  step over a state sweep; stacking stays in the clamp; `stateAt` with `trail`, `nx`, a wrong tag and a missing trail; order
  independence (before and after `advanceTechWaves`); the history rule (with no dynamic wave every stock level is 1 in every
  year, 2009's live smartphone row included); settle keeps the level; a drop leaves 1; reads leave `JSON.stringify(g)` and the
  random stream untouched.
- `test/wave-stocks-wiring.test.ts`: a live wave moves a quote, a holding after the yearly step, the index fund, `listedTargets`
  price, a single-stock bet's settlement, an index option's settlement and `marketMove`; the option premiums are identical
  with and without waves; the index tilt is the mean level of the stocks the Stocks screen lists, not of the plan; the clock
  helpers equal `computer/money-common` `fam` and `anchor`; share-class lines move with the company (`companyKey`); coins,
  pennies, bonds, savings, gold and property trusts are unchanged; the gut's candidate move equals the holding's move at the
  next yearly step for a heavy and a seeded wave, and the cache key changes with the wave.
- `test/market-clock.test.ts`: `exchangeMove` equals the engine total at fiscal + 1 for 2026 to 2045 in five countries; history
  years equal today's values (2008 pin); an heir shares the family market; a Time Machine fork rerolls only the unfinished year;
  `conglomerate-year.ts` follows.
- `test/wave-listed.test.ts`: a quoted company with a wave gets a `q` stamp; the price converges to the fundamental; with no wave
  every price is identical to release 1; a stamp without `q` is ignored for a quoted company; deep-tech `'stock'` grade; the
  own-listing Stocks row (`ownListings`) ignores a wave alone, and the own-listing, share-class, dividend and hedge suites run
  unchanged; `waveLines` says `price` for a quoted company.
- `test/wave-insider.test.ts`: founder and CEO are insiders, a hired CEO and a plain owner aren't; the window (this year and last
  count, two years ago doesn't); de minimis; the three-case cap; an index call counts, an index put doesn't; own-listing rows aren't
  targets (`listedTargets` lists engine securities only); a repeat announcement opens nothing new; exposure, arrest, held money and give-back run through the existing code; the
  politics profile it creates doesn't make a politician; the warnings appear for `HEAVY_WAVES` and `DEEPTECH_WAVES` entries only.
- `test/wave-stocks-surface.test.ts`: tag, market clause and news line text and thresholds, `anachronismsIn` skip, length caps,
  render from a deep-frozen state, no em-dash.
- `test/wave-kit.ts`: the helpers `wave-insider` and `wave-stocks-story` share (a founder, the stocks of a kind that stay listed,
  the exposure popup).
- `test/wave-stocks-story.test.ts`: over several seeds a heavy launch lifts the sector level, funds and the gut see it, an
  insider position is caught on some seed and not on a clean one, an heir inherits waves and holdings; an old save loads.

Existing pins that may change on purpose; Task 4 reads each and edits only what asserts the lifted behavior, with the reason in the commit
message: four assertions of `test/tech-waves-readers.test.ts` (the division-of-a-listed-group stamp, the real listed group price, the
`stampWave` never-stamps-a-listed-company assertion, the deep-tech "listed companies stay wave-free" block; plan Task 4 step 4 names
them). The stamp-without-`q` assertions stay true and stay.

Existing files that must pass untouched: `market-events`, `plan-search-reads`, `talent-investing`, `investments`, `stocks-real`,
`company-key`, `hedge-model`, `hedge-company`, `own-listing*`, `share-classes*`, `dividend-year`, `politics-abuse`, `insider-fairness`,
`insider-escrow`, `tech-waves*`, `voice-guards`, `save-schema`.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Import cycles: `shocks.ts` must not reach `business/tech-waves.ts` (heavy, economy, shocks). | `invest/wave-stocks.ts` imports only the engine and the leaf; `invest/clock.ts` is a leaf. `tech-waves.ts` to `wave-insider.ts` to `politics.ts` is new: Task 5 starts with a load-order test that imports each of the three first, in isolation. `hedge-model.ts` already imports `politics.ts`. |
| Hot path: `shockFactor` runs per quote and per holding. | Early return with no waves; one memo hit per quote; `test/plan-search-reads.test.ts` and the investments tests guard it. |
| Release 1 pins fail for a reason that isn't ours. | Only the three named pins change; any other failure in a year 1946 to 2024 is a live history row, so stop and report. |
| Real companies take negative waves. | S8 and the 0.3 floor; the news names the sector, never a firm. |
| Deep-tech projection is an estimate. | Stated in 5.9; the gut says "not guarantees". |
| Stale `nx` after a Time Machine jump. | The fork-tag check. |
| A founder is caught for a trade they didn't connect to the launch. | The window and the de minimis floor are the stated rule; the warning is in the confirm; the case is only an exposure chance, not a conviction. |
| The listed company lags its peers by design. | Stated in 5.6; it removes the cheap own-share entry. |
| Suites outside the named lists book a listed company's year in 2026 or later and see the new market path (conglomerate, board, nepo, family-sellout, share-classes and own-trade). | The integration run catches them; the named suites cover `exchangeMove`, `valuationOf` and `shockFactor` directly. |

## 11. Build order (7 plan tasks) and check budget

Each task: write the failing tests, implement, then `npm run typecheck` and `npx vitest run --maxWorkers=1 <only the files named>`. Never the
full suite, never `vitest` without `--maxWorkers=1` (four build tracks share four CPUs). No release notes, version bump or full run
here: they happen at integration. Commit with explicit pathspecs; trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and
`Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`. All work runs on Sonnet (project `CLAUDE.md`).

| # | Task | Creates | Modifies | Test files to run |
|---|---|---|---|---|
| 1 | The wave remembers: `trail`, `nx`, `TechBase.stock`, `stepWave`, `projectWave`, `stateAt`, `stockLevelFor`, `waveSignature`, settle writes `stock`, `announceWave` projects | `test/wave-stocks-level.test.ts` | `business/tech-wave-factors.ts`, `business/tech-waves.ts` | `wave-stocks-level`, `tech-waves`, `tech-waves-readers`, `tech-waves-wiring`, `tech-waves-writers`, `tech-wave-data` |
| 2 | The sector table and the seam: `SECTOR_TRADE`, `listedSectors`, `waveStockFactor`, `waveIndexFactor`, folded into `shockFactor` and `indexShockFactor`, gut cache key, the clock helpers | `invest/wave-stocks.ts`, `invest/clock.ts` (`marketYearOf`, `marketFamily`, `marketAnchor`), `test/wave-stocks-data.test.ts`, `test/wave-stocks-wiring.test.ts` | `invest/shocks.ts`, `invest/instinct.ts` | `wave-stocks-data`, `wave-stocks-wiring`, `company-key`, `investments`, `stocks-real`, `talent-investing`, `hedge-model`, `plan-search-reads` |
| 3 | The one market clock | `test/market-clock.test.ts` | `invest/clock.ts` (`bookedMarketMove`), `business/economy.ts` (`exchangeMove`), `business/fund-model.ts` (re-export) | `market-clock`, `market-events`, `share-classes-ipo`, `class-payout`, `own-listing-story`, `fund` |
| 4 | The player's listing: `q` stamp, `valuationOf`, `industryCycle('stock')`, `waveLines`, the four pin edits | `test/wave-listed.test.ts` | `business/tech-waves.ts`, `business/state.ts`, `business/economy.ts`, `business/deeptech-core.ts`, `test/tech-waves-readers.test.ts` | `wave-listed`, `tech-waves-readers`, `own-listing`, `share-classes-integration`, `dividend-year`, `hedge-company`, `deeptech-review` |
| 5 | The insider rule and its warnings | `business/wave-insider.ts`, `test/wave-insider.test.ts`, `test/wave-kit.ts` | `special/politics.ts`, `business/tech-waves.ts` (`by`, hook), `business/tech-wave-data.ts`, `business/heavy-rd.ts`, `business/deeptech-sim.ts`, `business/manage.ts`, `business/deeptech-menu.ts` | `wave-insider`, `politics-abuse`, `insider-fairness`, `insider-escrow`, `company-key`, `tech-waves-writers`, `heavy-project`, `voice-guards` |
| 6 | Tag, market clause, news line | `test/wave-stocks-surface.test.ts` | `invest/wave-stocks.ts`, `investments.ts` | `wave-stocks-surface`, `investments`, `voice-guards` |
| 7 | The story, heirs, old saves, architecture notes | `test/wave-stocks-story.test.ts` | `docs/ARCHITECTURE.md` | `wave-stocks-story`, `save-schema`, `tech-waves-wiring` |

Dependencies: 2 needs 1; 4 needs 1, 2 and 3 (for the market year); 5 needs 2; 6 needs 2; 7 needs all. Tasks 3 and 5 can start once 2 is done.
Shared hot files (`economy.ts`, `investments.ts`, `engine.ts`, `life.ts`): `economy.ts` gets one branch in `exchangeMove` and a mood
branch in `valuationOf`; `investments.ts` gets one field (set in `listing`), one row, one clause and one line; `deeptech-core.ts`
gets the `industryCycle` argument; `engine.ts` and `life.ts` get no edit.
