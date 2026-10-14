# Heavy R&D: breakthrough products, a market that wakes up, rivals that need the same time and money

Status: approved by standing instruction ("I will always pick your (recommended)"). Path: architectural.
Branch: `claude/new-session-1vdxk8`. Ships as v2.7.0 together with, or right after, the Stocks listing.

## 1. What the player asked for

> for every company time there should be a "heavy RnD" where it costs way more but its genuinely
> revolutionary level of product which has higher chances of failing and takes time but it can not
> only bring up players company market share due to demand but it can bring demand to the whole
> market even and it will be reported in the news. all other companies must take the same amount of
> time and money to even catch up to players company. also if i retire a product i shouldn't be able
> to see that product again in RnD.

Success looks like this, in one play session:

1. Open a company, Products, and see a **Heavy R&D** section next to the ordinary ideas.
2. Pick a breakthrough ("Self-Checkout Lanes", "Autonomous Fleet"...), see the fixed cost, years, odds.
3. Wait four to six years. It may flop. If it works, the launch is in the news, the company's share
   jumps, **and the whole trade's demand rises** for several years.
4. Watch rivals arrive with their own version, no sooner than the player's own development time and
   never cheaper (the screen says when).
5. Retire any product line: it never shows up in R&D ideas again.

Assumptions (mine, not the player's words): "revolutionary" means a new kind of product, not a better
version of a classic; the market-wide effect is the home market of the trade (its country, or the
world for world markets); "money" for a rival is modelled as time (a rival that cannot fund it as fast
is slower), because rivals have no cash in this simulation.

## 2. What exists today (verified in the code)

- `src/game/business/rd.ts`: `rdCost` (per idea), `rdQuote` (odds, years 1-4, quality), `startRd` takes
  the whole budget from company cash at once, `advanceRd` (called by `economy.evolve` at year end) rolls
  odds, a 15% hit chance, and creates a `Product` that launches next year. `rdSlots` = 1 + log2(sites).
- `RdProject` / `Product` / `BizState` in `state.ts`; `readProject` clamps `years` to 4; `normalizeBiz`
  is a whitelist (new `BizState` fields MUST be added there or they are dropped on load).
- Ideas come from `productIdeas` (`products.ts`), which skips names that are on sale or in development.
  A retired line is simply removed from `b.products` (`manage.ts` single retire; `retireLines` for
  "Retire Weak Lines", the hired CEO in `board-ceo.ts`, and a 400-line storage guard), so the same idea
  comes straight back. Lines also expire by themselves after `PRODUCT_LIFE` (economy.ts); that is not a retirement.
- Rivals do no R&D. A rival's version of a kind is a pure hash of (rival id, kind) with an adoption
  threshold (`product-market.ts versionOf`), read through `fieldOf` (cached by a signature of the rivals).
  `Field.of(family)` is what `productPull` and `rdQuote` read.
- Market-wide demand has no mutable store: `sizeRatio` / `demandLevel` are pure curves of year;
  `marketCtxFor(g, b, year)` builds the context (`ctx.pot` = potential market) and has `g`.
- `g.flags: Record<string, Json>` is the only shared mutable store the economy can read (it already
  carries market modifiers).

## 3. Design

### 3.1 Scope (v1)

- **Classic companies** (the Products menu of price-and-production trades). Deep-tech and studio
  companies keep their own R&D and are out of scope. Finance firms have no products.
- **Hired-CEO companies**: the board's CEO never starts a heavy project (it calls `startRd`, which is
  unchanged). The player may start one on a company run by a CEO from the menu as for any R&D.
- One **active** heavy project per company. Cooldown: 5 calendar years after the last heavy launch or
  flop of that company before the next one can start. Ordinary projects are unaffected and do not use
  the heavy project's slot count.

### 3.2 The catalogue (new `src/game/business/heavy-data.ts`)

Per industry (the 34 in `industries.ts`), two or three curated breakthroughs:

```ts
interface Breakthrough { name: string; first: number; note: string }   // first: earliest year it can be developed
```

- `name` is unique game-wide, at most 40 characters, and **a family of its own** (never equal to a
  classic, premium, next-generation or other `lineInfo` name of any industry; a test checks it).
- `first` gates the era (nobody develops "Autonomous Fleet" in 1960). `eraFits` is applied too.
- `note` is one plain sentence, voice per `docs/VOICE.md` (no AI cadence; no "revolutionary" in every line).
- A breakthrough whose name was already launched by the same company is not offered again.

### 3.3 The project

`RdProject` gains optional `heavy?: true` and `cost?` (so old saves stay valid). Everything below is a
pure function in a new module `src/game/business/heavy-rd.ts` (the one place the rules live), with thin
call sites in `rd.ts`, `manage.ts`, `economy.ts`.

- **Cost**: `8 x rdCost(b, classicIdeas(g, b)[0])`, rounded with `roundBudget`. Fixed, no slider.
  It is paid **up front** from company cash like every project (one code path, same notices), and must
  leave `rdReserve(b)` in the account, otherwise the menu row says how much is missing. A flop loses it.
- **Years**: the catalogue family's `baseYears(industry)` x 3, clamped to 4-6 (`readProject` and any
  `years` clamp are raised to 6; storage shape otherwise unchanged).
- **Odds**: `clamp(0.55 x launchP(g, b), 0.08, 0.6)`. Quality: `rdQuality(g, b, 2.5) + 14`, spread +-10.
  **Hit** chance 35% (`+12` quality, `+12` brand; ordinary projects keep 15%/+10/+8). Flop: `-6` brand,
  the money is gone, the breakthrough stays offered after the cooldown.
- The launch is a `Product` with `kind: 'breakthrough'` (new `LineKind`; `KIND_WEIGHT` 1.6, `KIND_COST` 1, so a
  breakthrough line addresses more of its kind's demand than a core line; its cost is the fixed one above, not `KIND_COST`) and `family` = its own
  catalogue name.

### 3.4 The kind it opens (pioneer record)

When a heavy project **launches** it writes one record to `g.flags['heavy.' + industry + '|' + marketKey]`
(a list, newest last, at most 12 per market, validated on load):

```ts
interface HeavyRecord { family: string; year: number; years: number; quality: number; cost: number; by: string }
// year: launch year; years: the development time; cost: what it cost; by: asset id of the pioneer
```

The record is the single source of truth for three pure readers (all take `g` or the list, none takes the RNG):

1. **The kind's demand** (`heavyLevel(rec, year)`): zero before `rec.year`; an S-curve over ten years to a
   plateau; slow decline after year 18. Wired through `Field.of(family)` and the one place `productPull`
   reads a kind's demand (the plan lists every `demandLevel` / `demandTrend` reader of a family with a grep
   and routes breakthrough families through the record; classic families are untouched).
2. **Rivals' versions** (`heavyArrival(rec, rival)`): see 3.5.
3. **The market pulse** (`heavyPulse(records, year)`): see 3.6.

`marketCtxFor` loads the records of its market, passes them to `fieldOf` (the record signature is added
to the cache key) and multiplies `pot` by the pulse. No other economy code changes.

### 3.5 Everyone else pays the same time and money to catch up

A rival gets a version of the pioneer's family only from `rec.year + lag(rival)`, where

```
lag = ceil(rec.years x TIER_LAG[rival.tier]) + (hash(rival.id, family) % 2)     // years after launch
TIER_LAG = { giant: 1.0, major: 1.25, mid: 1.5, small: 2.0 }   // can't fund it as fast; never faster
```

Nobody arrives earlier than the player's own development time ("the same amount of time"), and a rival
that has less money than the project cost is slower ("the same money"): the tier stands for what it can
fund. The fringe (long tail) adopts at the end of the rivals' window. A rival's version quality is
`rec.quality - 6 - hash%10` (it reaches the pioneer's level at best, not past it), and it ages with the
existing `AGE_RATE`. The first rival to arrive is the "catching up" moment and gets a news line (3.7).

The Products screen shows, under a launched breakthrough: "Rivals can have their own from about <year>"
(the earliest `rec.year + lag`), so the lead is visible and predictable.

### 3.6 Demand for the whole market

`heavyPulse(records, year)` is a pure function: for each record, `size = 0.10 + 0.04 x min(cost scale, 4)`
(a costlier breakthrough lifts the trade more), ramp up linearly over 3 years from the launch, hold, decay
exponentially from year 8 with a ten-year half-life; the sum is **capped at +40%** and applied to `ctx.pot`
(potential market). Every company in that trade and market rises (rivals and the player), and the pioneer
also gains share through its line's pull (3.3, `productPull`). Pure in `(records, year)`: the same year
always gives the same pulse, so what-ifs and the planner stay deterministic.

### 3.7 News

- Launch: a life-log line (`"<company> launched <name>."`), a modal (`"<Name>: a New Kind of <trade>"`, one
  short paragraph: what it is, what it means for the trade) pushed with a deterministic id through the
  same queue pattern as `yearly.ts` event notices (so a reload never shows it twice), and an entry in the
  market-news list (`history/market-events.ts` shape) capped at 20 entries.
- Arrival of the first rival: one life-log line for the player's trade ("<rival> launches its own <name>").
- Flop: the existing "R&D Results" notice; one plain line, no news item (nobody reports a private failure).

### 3.8 Retired products never come back

`BizState.retired?: string[]` (exact line names, newest last, at most 400; whitelisted in `normalizeBiz`,
strings only, each at most 80 characters, de-duplicated). `rememberRetired(b, names)` is called from the
three deliberate paths: the single-line retire action, `retireLines` (bulk and the hired CEO), and nowhere
else (natural expiry after `PRODUCT_LIFE`, sold-off lines of a bought rival and the 400-line guard do not
count). `productIdeas` and `rdBlock` treat a retired name like one that is on sale (never offered, and a
request for it is blocked with "<name> was retired. Develop something else"). The heavy catalogue obeys the
same list. Retiring a classic does not hide its next generation or variants (different names).

### 3.9 Menu

Products > a **Heavy R&D** heading after the project list: one row per available breakthrough with a subtitle
"<cost> · <years> years · <odds>% odds · first rivals can follow about <year>" and a confirm sentence stating
the cost, the years and the odds; a disabled row says the single reason (cooldown, cash, project running,
era). A running heavy project shows in the existing project list with its years left.

### 3.10 What does not change

Ordinary R&D numbers, `startRd`, `advanceRd` for ordinary projects, deep-tech and studio R&D, the market
simulation's rivals roster, and estate / net-worth maths (no new asset type).

## 4. Invariants and hazards

- **Determinism**: the records are written once at a deterministic point (`advanceRd` on the launch roll,
  which already uses `g.rng`); readers use hashes only. Same seed, same game.
- **Old saves**: no records means no breakthrough families and a pulse of 1; `retired` missing means none.
  Every new field is optional and validated on load (`flags` shape guard for `heavy.*` keys, finite numbers,
  clamps), and a hostile `heavy.*` flag cannot create an infinite or negative pulse.
- **Cache**: `fieldOf`'s cache key includes the records of its market; `buildCtx` is unchanged (the pulse
  is applied after it in `marketCtxFor`).
- **Hired CEOs, bought rivals**: `board-ceo.ts` pushes `RdProject` directly (never heavy). A bought rival
  brings its `products`; its breakthrough lines are fine (the family record is keyed by market).
- **Clamps**: every place that clamps a project's `years` to 4 (`readProject`, `rdQuote`) allows 6 for heavy
  projects only; ordinary quotes stay at 1-4.
- **Voice**: all new strings follow `docs/VOICE.md`; `npm run voice` long-string count stays 435.

## 5. Tests (names for the plan)

`heavy-data` (unique names, no clash with any `lineInfo`, era gates); `heavy-rd` (cost 8x, years 4-6, odds
band, cooldown, one active, cash gate, flop path loses money); `heavy-pulse` (cap, ramp, decay, pure);
`heavy-rivals` (nobody before `year + years`, tier order, deterministic); `rd-retired` (all three paths
record, expiry does not, `productIdeas` and `rdBlock` obey it, save round-trip); `heavy-story` (one company
through the whole thing over several seeds: launch, news, share up, trade demand up, rival arrives, retire).
CI is the full-suite gate.

## 6. Out of scope (later)

Deep-tech and studio breakthroughs, a funding slider for heavy projects, rival-to-rival breakthroughs,
patents, and cross-border spill-over of the pulse.
