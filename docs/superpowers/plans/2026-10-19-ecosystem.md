# Ecosystem companies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One new classic trade, the Device and Platform Company: eight dated product kinds, spec rows against the market, a chip fab lever, chips from a sister chip company through Group Services, and an operating system whose lock-in is capped.

**Architecture:** A pure leaf `business/devices-data.ts` holds the constants, chip terms and reference prices. The trade is registered through the existing tables. Chip cost and quality lift enter `costFactor`, `evolve` and `bookYear` as pure reads of two optional saved fields (`fabs`, `chips`). The sister path reuses the Group Services contract list: a record is written once per fiscal year in `prepareInternalServices` and booked in `settleInternalServices`. Spec sheets and the Devices & Chips menu are pure readers built on release 2's `scorecard.ts`.

**Tech Stack:** TypeScript (strict), Vitest. No new dependencies, no new yearly hook, no new save schema.

**Spec:** `docs/superpowers/specs/2026-10-19-ecosystem-design.md` (S1 to S16 below are its sections). Where this plan names a decision (section "Decisions made by this plan"), the plan wins.

**Read this first.** The tree this plan is applied to will contain other releases' changes (release 1 tech waves, release 2 AI Lab 2.0, release 3 Silicon 2.0, and others). Line numbers and anchors here were read in v3.0.0. Re-read the actual code of every file before editing it, and adapt a call to a signature that moved. Never adapt a test's meaning.

## Global Constraints

- Checks per task: `npm run typecheck` and the vitest files the task names, in one `npx vitest run <files> --maxWorkers=2` call. No full suite. The machine has 4 CPUs: never run two vitest calls at once.
- No release notes and no version bump (integration does them). `SAVE_SCHEMA` stays 2 (`src/game/core.ts`), `BIZ_VERSION` stays 2, `TECH_VERSION` is unchanged and `TechState` gets no field.
- New saved state is exactly `BizState.fabs?: number` (integer 1 to 3, else absent) and `BizState.chips?: ChipSupply`. Both are optional, read only through `normalizeBiz`, and kept only for trade `devices`.
- Determinism: no `g.rng`, `rand`, `chance`, `Math.random` or `Date.now` in anything this plan adds. Seeded numbers come only from `hashOf`, `mix` and `rivalPriceIndex`. The only draw a fab can cause is a board vote inside `boardAllows`.
- Pure reads write nothing: `chipTerms`, `chipCostFactor`, `costFactor`, `osStrength`, `osPull`, `specSheet`, `devicesMenu`, `chipRows`, `fabGain`.
- No foresight: chip terms use last year's booked statements (`last.cogs`, `last.netRevenue`) and the sister's current `TechState`, stamped `g.year - 1`.
- Money is constant 2026 dollars, shown only through `money` (`business/util.ts`).
- Constants: CHIP_SHARE .35, MARKET_YIELD .70, FAB_MAX 3, FAB_CUT [0, .15, .25, .30], SISTER_CUT {2: .08, 3: .18, 4: .24}, CHIP_RESERVE .20, LIFT_K .4, LIFT_MAX 6, FAB_BASE 150,000,000, FAB_STEP .35, FAB_MAINT .07, OS_BETA .9, OS_PULL_CAP 3.0, DEVICE_NETWORK 1.5, LINE_PRICE {core 1, next 1.05, premium 1.25, value .7, regional .97, breakthrough 1.2}.
- One chip source: the larger cut of the own fabs and one sister wins, own on a tie, never added. `chipCostFactor` is never below .895, and with dominance (`SCALE_SAVING` .10) never below .80.
- R&D must not scale with how much money the company has: `fabCost` never reads cash, revenue, valuation or any statement.
- Authorization lives inside `run()`: `manageBlock`, cash, FAB_MAX, industry and `boardAllows` for the fab; `valid()` runs again in prepare and settle; contracts keep `toggleService`'s own checks.
- Accounting: the saving sits in the buyer's cogs (`costFactor` reads the record before booking). The invoice is profit-neutral on the provider and eliminated by `internalRevenue`. No cash moves between the two companies.
- Yearly idempotence: chip assignment sits behind `groupServicesPrepared`, settlement behind `groupServicesSettled`; a second call changes nothing.
- Bounded: 3 fabs, one `chips` record per company, at most 12 rows in Devices & Chips, results replaced each year, at most 6 chip info rows in Group Services.
- Voice (`docs/VOICE.md`): plain narrator, contractions, no encouragement, no lists of three, full stops (not colons) between clauses, "about" before every saving. Log at most 90, outcome 120, scene 140, nothing past 180 static characters.
- No em-dash and no en-dash anywhere (code, strings, tests, docs): `voice-guards` caps em-dashes at 24 and the repo has exactly 24.
- Truthful copy: rivals' figures are the market's, modeled and shown without names; the fab hint says cost only; purple hints (`talentHint(g, 'Business', ...)`) come only from `fabGain`.
- Real names: rows carry no arcs (`a`), no `q` or `t` overrides, and none of the words scandal, fraud, lawsuit, recall, bankrupt, breach, cartel, tobacco, gambling.
- `group-services.ts` keeps exactly 3 lines that compare a `.share` with .5 (`test/control-sites.test.ts`). Chip code adds none.
- Do not edit pins unrelated to this feature (`talent-business`, `world2-rivals`, `deeptech`). If one fails because the new trade is in a loop, stop and report the test and the delta.
- Commits use explicit pathspecs (`git add <files>`, never `-A`). Every message ends with the two trailers shown in each commit step.
- Models: every task is Sonnet work (CLAUDE.md). None is a heavy coding task.
- Release dependencies: release 1 (`announceWave` in `business/tech-waves.ts`, `WAVE_KINDS` in `business/tech-wave-data.ts`), release 2 (`business/scorecard.ts`: `ScoreRow`, `scoreRow`, `scoreText`), release 3 (`business/silicon.ts`: `chipPerformance`, `rivalPriceIndex`). Task 1 confirms them. If one is missing, stop and report which. Never stub them.

## Review Focus

Five failure modes the spec implies and happy-path tests miss. Each is pinned by a test in the owning task (tagged RF1 to RF5 there).

1. **RF1, an old or hostile save (Task 4).** `fabs` or `chips` holding strings, NaN, huge or negative numbers, a wrong stage, or sitting on a restaurant: nothing throws, nothing is charged, other trades load unchanged.
2. **RF2, a sister that stops qualifying after its record is written (Task 6).** Sold, diluted below 100%, or the contract toggled off mid-year: the saving ends at the next fiscal year, no money appears, nothing goes negative.
3. **RF3, empty books (Task 6).** A first-year buyer with no `last`, zero cogs, a sister with zero revenue: no record, no NaN, no capacity held, no invoice.
4. **RF4, the year edges of the screen (Task 7).** 1977 to 1979 (no hardware sells yet), 2040, and a late-opening country: sheets are empty or short, at most 12 rows, no NaN, no rival name.
5. **RF5, someone who can't or shouldn't build (Task 4).** A player under 18, a company short of cash, a board that votes no, a fourth fab, a restaurant, a hired CEO: nothing changes, and without a board no random number is drawn.

## Decisions made by this plan

- P1. `devices-data.ts` types its input as a local `ChipHolder { industry: string; fabs?: number; chips?: ChipSupply }` instead of `Pick<BizState, ...>`, so Task 1 typechecks before Task 4 adds the fields (`BizState` stays assignable to it).
- P2. `readFabs` and `readChips` live in `devices-data.ts` and arrive in Task 1, because `chipSource`, `chipTerms` and `chipCostFactor` read through them: `bizOf` hands out `a.details` unscrubbed unless the version changed, so a damaged save would otherwise give NaN in `costFactor` (`linesOf` guards `lines` the same way). `normalizeBiz` (Task 4) keeps their results only when `industry === 'devices'`.
- P3. `osStrength` and `osPull` live in `economy.ts` (Task 5) and are tested in `devices-os.test.ts`; only their constants stay in the data file.
- P4. `buildFabAction(a: Asset)` and `fabGain(g, a)` are exported from `manage.ts`, because Task 4 tests call them before the screen exists. The live business is always re-read, so the spec's second parameter is dropped.
- P5. `assignChips` and `settleChips` are private to `group-services.ts`. Settlement is keyed by the buyer's record, not the contract list, so toggling mid-year changes nothing until the next fiscal year. The "net operating savings" log keeps summing only the legacy records.
- P6. A record is skipped when the buyer's bill (`last.cogs x CHIP_SHARE`) or the sister's `last.netRevenue` is below 1. Buyers are processed in asset id order.
- P7. Slugs that exist in other trades get a suffix: `apple-devices`, `samsung-devices`, `google-devices`, `microsoft-devices`, `amazon-devices`, `meta-devices`, `sony-devices`, `ibm-pc`, `lg-mobile`. The rest are plain lowercase names.
- P8. Ended rows: LG mass 4, Nokia mass 8, IBM premium 6, Compaq mass 4, Palm mass 1.5.
- P9. `chipRows`, `chipResultFor` and `hasChipContract` are exported from `group-services.ts` for the screen and for `groupYear`.
- P10. `INDUSTRY_IDS` gets `'devices'` as its last entry, after `'carbonCapture'`, so no existing index moves (put after `...EXPANSION_INDUSTRY_IDS` it would shift the twelve deep-tech ids). The start menu filters by deep tech, so the order on screen is the same.
- P11. When a kind's `first` year trips `anachronismsIn(name, first, ['us'])`, move that `first` (in `DEMAND` and `ERA_FROM`) to the first year the check passes, move that kind's pin in `test/devices-trade.test.ts` with it, and say so in the commit message. The anachronism check itself stays.
- P12. A fab is sunk capex: `equipmentValue` does not count it, so insurance, disaster damage, credit limits and liquidation never see it (spec D9). A test pins that `equipmentValue` ignores `fabs`.
- P13. The fab hint has three texts: payback within `PAYBACK_MAX` (8 years, private to `manage.ts`), positive but slower, and no gain. A fab that repays in 54 years never reads as a good deal.
- P14. The Devices & Chips screen shows one sister row (the first line of `chipRows`) and up to seven family sub-menus, which is exactly 12 rows with the four fixed ones. `chipRows` itself still returns up to two lines.

## File map

| Task | Creates | Modifies |
|---|---|---|
| 1 | `business/devices-data.ts`, `test/devices-data.test.ts` | none |
| 2 | `test/devices-trade.test.ts` | `data/markets.ts`, `business/industries.ts`, `competition-data.ts`, `conglomerate-econ.ts`, `economy/model.ts`, `supply.ts`, `market-trade.ts`, `market-view.ts`, `products.ts`, `product-data.ts`, two tests |
| 3 | `business/market-data-devices.ts`, `test/devices-cast.test.ts` | `data/brands-rivals.ts`, `heavy-data.ts`, `workshop/catalog.ts`, `workshop/migrate.ts`, `tech-wave-data.ts`, three tests |
| 4 | `test/devices-chips.test.ts`, `test/devices-save.test.ts` | `state.ts`, `economy.ts`, `manage.ts` |
| 5 | `test/devices-os.test.ts` | `economy.ts` |
| 6 | `test/devices-group.test.ts` | `group-services.ts`, `conglomerate-year.ts` |
| 7 | `business/devices-specs.ts`, `business/devices-menu.ts`, `test/devices-specs.test.ts`, `test/devices-menu.test.ts` | `manage.ts` |
| 8 | `test/devices-story.test.ts` | `devices-data.ts` (tuning only, if a guard fails) |
| 9 | none | `docs/ARCHITECTURE.md`, `README.md` |

Paths are under `src/game/business/` unless they start with `src/game/`, `test/` or `docs/`. Test helpers: `adult`, `company`, `nextYear`, `allNodes`, `renderAll` from `test/market-kit.ts`; `makeTestGame` from `test/helpers.ts`.

---

### Task 1: Preflight and the pure chip core (S2)

**Files:**
- Create: `src/game/business/devices-data.ts`
- Test: `test/devices-data.test.ts`

**Interfaces:**
- Consumes (preflight only): `announceWave` (release 1), `scoreRow`, `scoreText` (release 2), `chipPerformance(t: Pick<TechState, 'level' | 'node' | 'yieldRate'>): number` and `rivalPriceIndex(fam: string, r: Pick<RivalView, 'id' | 'seg' | 'quality'>, year: number, cut?: boolean): number` (release 3, `business/silicon.ts`).
- Produces (`devices-data.ts`, no runtime imports):
  - The constants from Global Constraints, plus `FAB_CUT: readonly number[]`, `SISTER_CUT: Readonly<Record<number, number>>`, `OS_FAMILY = 'Device Operating System'`, `HARDWARE_FAMILIES: readonly string[]` (Home Computer, Mobile Phone, Desktop PC, Laptop, Smartphone, VR Headset, AR Glasses) and `LINE_PRICE: Readonly<Record<string, number>>`.
  - `interface ChipSupply { year: number; from: string; name: string; stage: number; node: number; yield: number; cover: number }`
  - `type ChipSource = 'market' | 'fab' | 'sister'`
  - `interface ChipTerms { src: ChipSource; cut: number; node: number; yield: number; cover: number; perfBump: number; lift: number; from?: string }`
  - `interface ChipHolder { industry: string; fabs?: number; chips?: ChipSupply }`
  - `readFabs(v: Json | undefined): number` (0 unless an integer 1 to 3) and `readChips(v: Json | undefined): ChipSupply | null` (type import of `Json` from `src/game/types`; Task 4 Step 1 lists their cases)
  - `marketNode(year: number): number`, `chipPerf(node: number, yieldRate: number): number`, `devicePerf(quality: number, node: number, yieldRate: number): number`
  - `chipSource(b: ChipHolder): { src: ChipSource; cut: number; cover: number }`, `chipTerms(b: ChipHolder, year: number): ChipTerms`, `chipCostFactor(b: ChipHolder): number`
  - `chipBook(cogs: number, cut: number): { saved: number; paid: number }`, `kindReference(family: string, year: number): number`

- [ ] **Step 1: Preflight.**
  - Run `grep -n "export function announceWave" src/game/business/tech-waves.ts`, `grep -n "export function scoreRow" src/game/business/scorecard.ts` and `grep -n "export function chipPerformance\|export function rivalPriceIndex" src/game/business/silicon.ts`. All four names must print a line.
  - If any is missing, stop and report which (a release is not merged). Do not create stubs.
  - `npm run typecheck` must pass. Run `node scripts/voice-report.mjs --json` and write down the `emDash` metric (must be 24) and the `long` metric (strings over 180 characters; 436 on v3.0.0, use what prints), for Tasks 8 and 9.
- [ ] **Step 2: Write the failing test** `test/devices-data.test.ts`. Imports: everything above from `devices-data`, `chipPerformance` from `business/silicon`, `computerUsd` from `src/game/computer/era`. Helpers:
```ts
const co = (o: object = {}) => ({ industry: 'devices', ...o })
const sis = (stage: number, cover: number, node = 5, y = 0.8): ChipSupply => ({ year: 2026, from: 'a1', name: 'Acme Silicon', stage, node, yield: y, cover })
```
  - `holds the spec constants`: `[CHIP_SHARE, MARKET_YIELD, FAB_MAX, CHIP_RESERVE, LIFT_K, LIFT_MAX, FAB_BASE, FAB_STEP, FAB_MAINT, OS_BETA, OS_PULL_CAP, DEVICE_NETWORK]` equals `[.35, .7, 3, .2, .4, 6, 150_000_000, .35, .07, .9, 3, 1.5]`. `FAB_CUT` equals `[0, .15, .25, .30]`, `SISTER_CUT` equals `{ 2: .08, 3: .18, 4: .24 }`, `LINE_PRICE` equals the Global Constraints table. `HARDWARE_FAMILIES` has 7 names in first-year order and excludes `OS_FAMILY`.
  - `marketNode steps 0 to 6 and never falls`: `[2010, 2011, 2014, 2015, 2017, 2018, 2019, 2020, 2021, 2022, 2029, 2030].map(marketNode)` equals `[0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]`. For every year 1900 to 2100, `marketNode(y + 1) >= marketNode(y)`.
  - `chipPerf spans 0 to 50, devicePerf is Silicon 2.0's chipPerformance`: `chipPerf(0, .3)` is 0 and `chipPerf(6, .97)` is close to 50. `devicePerf(62, 5, .7)` is 68, `devicePerf(100, 6, .97)` is 100, `devicePerf(0, 0, .3)` is 0. For the samples `{ level: 60, node: 3, yieldRate: .55 }`, `{ level: 0, node: 0, yieldRate: .3 }`, `{ level: 100, node: 6, yieldRate: .97 }`, `{ level: 41, node: 2, yieldRate: .8 }`, `devicePerf(t.level, t.node, t.yieldRate)` equals `chipPerformance(t)`.
  - `chipSource never adds a fab and a sister`:
```ts
expect(chipSource(co())).toEqual({ src: 'market', cut: 0, cover: 1 })
expect(chipSource(co({ fabs: 1 }))).toEqual({ src: 'fab', cut: 0.15, cover: 1 })
expect(chipSource(co({ chips: sis(4, 1) }))).toEqual({ src: 'sister', cut: 0.24, cover: 1 })
expect(chipSource(co({ chips: sis(4, 0.5) })).cut).toBeCloseTo(0.12)
expect(chipSource(co({ fabs: 3, chips: sis(4, 1) }))).toEqual({ src: 'fab', cut: 0.3, cover: 1 })   // not .54
expect(chipSource(co({ fabs: 1, chips: sis(4, 1) })).cut).toBe(0.24)                                    // not .39
expect(chipSource(co({ chips: sis(4, 0) })).src).toBe('market')
expect(chipSource({ industry: 'restaurant', fabs: 3, chips: sis(4, 1) })).toEqual({ src: 'market', cut: 0, cover: 1 })
```
  - `damaged input reads as the market`: for four holders with `industry: 'devices'` (cast `as never`): `fabs: 'x'` with `chips: { year: 2026, from: 'a1', name: 'S', stage: 9, node: 5, yield: .8, cover: NaN }`; `fabs: NaN`; `fabs: 9`; `chips: 7`. `chipSource` is `{ src: 'market', cut: 0, cover: 1 }`, `chipCostFactor` is 1 and `chipTerms(x, 2026).lift` is 0 for each. No value is NaN.
  - `chipTerms gives the 2026 table and caps the lift` (2026 unless noted): market matches `{ src: 'market', cut: 0, node: 5, yield: .7, perfBump: 0, lift: 0 }`. `fabs: 1` has node 5, yield .75, lift close to .597 (2 places). `fabs: 2` has node 6, yield .8, lift close to 3.194. `fabs: 3` has yield .85, lift close to 3.791. `sis(3, .5, 6, .85)` gives `{ src: 'sister', from: 'a1', node: 6, yield: .85, cover: .5 }` and lift close to 1.8955. `chipTerms(co({ chips: sis(4, 1, 6, .97) }), 2011).lift` is `LIFT_MAX`. Three fabs with a sister give `src` 'fab'.
  - `chipCostFactor never drops below .895 and chipBook adds up`: factors for `co()`, `fabs: 1`, `fabs: 3`, `chips: sis(4, 1)`, `fabs: 3` with that sister, and a restaurant with `fabs: 3` are close to `[1, .9475, .895, .916, .895, 1]`. `chipBook(1000, .3)`: `saved + paid` is close to `1000 x .35 / .895` and `1000 + saved` is close to `1000 / .895`. `chipBook(0, .3)` is `{ saved: 0, paid: 0 }`. `chipBook(1000, 0)` is `{ saved: 0, paid: 350 }`.
  - `kindReference hits the shop prices and follows computerUsd`: 2026 gives Smartphone 900, Laptop 1300, VR Headset 500, AR Glasses 800, Mobile Phone 300. Home Computer 1977 to 1986 and Desktop PC 1985 to 2009 are within 25% of `computerUsd(y)`; Laptop 1995 to 2009 is within 25% of `1.4 x computerUsd(y)`. `kindReference(OS_FAMILY, 2026)` and `kindReference('nope', 2026)` are 0. Every hardware family is finite and above 0 for every year 1977 to 2100.
- [ ] **Step 3: Run to see it fail.** `npx vitest run test/devices-data.test.ts --maxWorkers=2`. Expected: FAIL, "Failed to resolve import ../src/game/business/devices-data".
- [ ] **Step 4: Implement `devices-data.ts`** with the signatures above and S2's rules. The tests fix the numbers; these choices they do not fix:
  - A local `clamp(n, lo, hi)` where NaN gives `lo`.
  - `readFabs` and `readChips` follow Task 4 Step 1 (`devices-save.test.ts` holds their cases). `chipSource` reads `fabs` and `chips` only through them, so `chipTerms` and `chipCostFactor` can't see a damaged value either.
  - `chipSource`: `own = FAB_CUT[readFabs(b.fabs)]`, `sis = SISTER_CUT[chips.stage] x chips.cover` with `chips = readChips(b.chips)`. The sister wins only when `sis > own`. Both 0 gives `market`. Any trade other than `devices` gives `market` with cut 0 and cover 1.
  - `chipTerms`: own fabs use `node = min(6, marketNode + (fabs >= 2 ? 1 : 0))` and `yield = .70 + .05 x fabs`; a sister uses the larger of market and its record; `lift = clamp(LIFT_K x perfBump x (src == 'sister' ? cover : 1), 0, LIFT_MAX)`.
  - `kindReference` interpolates linearly between anchors, rounds to a whole dollar, holds the first anchor before and the last after. Anchors (a private copy; never import `computer/era.ts` or `assets.ts`): Home Computer (1977, 6500) (1980, 4500) (1983, 2200) (1986, 1800). Mobile Phone (1983, 6000) (1990, 3000) (1996, 800) (2000, 400) (2008, 300). Desktop PC the table (1977, 6500) (1980, 4500) (1983, 2200) (1986, 1800) (1988, 5000) (1992, 4400) (1996, 3600) (1999, 2400) (2002, 1900) (2006, 1500) (2010, 1300). Laptop is 1.4 x that table before 2010 and 1300 from 2010. Smartphone (2007, 1100) (2010, 1000) (2014, 950) (2026, 900). VR Headset (2016, 700) (2020, 500). AR Glasses (2019, 1500) (2023, 1000) (2026, 800). Anything else, 0.
- [ ] **Step 5: Run to see it pass.** `npx vitest run test/devices-data.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 6: Regression.** Nothing imports the new file yet, so no suite can move. Run `npm run typecheck`, then `npx vitest run test/voice-guards.test.ts --maxWorkers=2` (2.5 s; `emDash` stays 24).
- [ ] **Step 7: Commit.**
```bash
git add src/game/business/devices-data.ts test/devices-data.test.ts
git commit -m "feat: devices chip rules, reference prices and pure core" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 2: Register the trade (S1, S9)

**Files:**
- Modify: `src/game/data/markets.ts` (add `'devices'` as the last entry of `INDUSTRY_IDS`, after `'carbonCapture'` (P10); comment "55 industries" to 56)
- Modify: `business/industries.ts` (entry in `BASE_INDUSTRIES` after `entertainment`; header comment "43 operating sectors + 12 deep-tech" to 44)
- Modify: `business/competition-data.ts` (`MARKETS.devices`), `business/conglomerate-econ.ts` (`SECTORS.devices = ['tech', 'consumer']`), `src/game/economy/model.ts` (add `devices` to the technology regex in `classifySector`)
- Modify: `business/supply.ts` (`PROFILES.devices = GOODS`), `business/market-trade.ts` (`GOODS.devices = 1`), `business/market-view.ts` (`SEGMENT_NAMES.devices`)
- Modify: `business/products.ts` (`STYLE.devices = 'goods'`, eight `ERA_FROM` keys in alphabetical place), `business/product-data.ts` (eight `DEMAND` keys, `PERIOD_CLASSICS.devices`)
- Modify tests: `test/business-expansion.test.ts` (line 36 `toHaveLength(55)` to 56 and the title "has 55 complete sectors"), `test/economy-sectors.test.ts` (add `devices: 'technology'` to `SECTORS`)
- Test: `test/devices-trade.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `HARDWARE_FAMILIES`, `OS_FAMILY`, `DEVICE_NETWORK`; `marketDef`, `industryEraBlock`, `startupCost`, `bestPlan`, `classicIdeas`, `productIdeas`, `lineInfo`, `styleOf`, `relatedness`, `sectorOf`, `goodsShare`, `supplyProfile`, `segmentNames`, `anachronismsIn`.
- Produces: `'devices'` in the `Industry` union, `INDUSTRIES.devices`, `MARKETS.devices`. Product names are exactly Task 1's `[...HARDWARE_FAMILIES, OS_FAMILY]`.

- [ ] **Step 1: Write the failing test** `test/devices-trade.test.ts`.
  - `registers the trade once`: `INDUSTRY_IDS` has length 56, ends with `devices` and holds it once; `INDUSTRY_IDS.indexOf('carbonCapture')` is 54. `DEEP_TECH_IDS`, `EXPANSION_INDUSTRY_IDS` and `PROCEDURAL_DEEP_TECH_IDS` do not.
  - `has the spec industry entry`: `INDUSTRIES.devices` matches `{ id: 'devices', label: 'Device and Platform Company', unit: 'devices', unitOne: 'device', site: 'hardware studio', sitePlural: 'hardware studios', localShare: .25, tradable: .9, elasticity: 1.5, incomeSens: .6, capital: 7_000_000, capitalLocal: .35, staff: 36, staffScale: .6, maint: .08, capMult: 1.5, multiple: 11, growth: .9, perMillion: .1, taxShare: 1, perishable: .1, marketingShare: .06 }`. `products` equals `[...HARDWARE_FAMILIES, OS_FAMILY]`. Role titles and focus equal Chief Hardware Engineer (quality), Head of Industrial Design (quality), Head of Retail Sales (sales), Supply Chain Director (ops), CFO (finance). Suffixes equal Devices, Mobile, Computing, Electronics, Labs.
  - `has the spec market entry`: `MARKETS.devices` matches `{ scope: 'world', noun: 'device', ref: 5, field: 90, fringe: .3, network: 1.5, named: 16, emerging: true, from: 1977, needs: 'homeComputer', notYet: "Computers fill rooms and cost a fortune. A home computer doesn't exist yet." }` and its `network` equals `DEVICE_NETWORK`. The curve anchors at 1977, 1980, 1984, 1990, 1995, 2000, 2001, 2005, 2007, 2010, 2013, 2016, 2019, 2022, 2026, 2040, 2060 equal `[.001, .006, .03, .08, .15, .28, .25, .35, .4, .62, .88, 1, .97, .98, 1, 1.35, 1.7]`. `hubs` equal us 26, cn 24, kr 12, jp 10, tw 8, in 6, gb 3, de 3, fi 2, sg 2, fr 2. `names.pre` is Pocketwave, Glassline, Slateworks, Nimbo, Pixelcore, Lumio, Orbitron, Wristly, Visora, Kinetica and `names.post` is Devices, Mobile, Electronics, Computing, Labs.
  - `is wired into the other tables`: `sectorOf('devices')` is `'technology'`. `relatedness('devices', 'semiconductor')` is .5. `goodsShare('devices')` is 1. `supplyProfile('devices')?.materialShare` equals manufacturing's. `segmentNames('devices')` equals `['Entry devices', 'Mainstream', 'Premium', 'Flagship']`. `styleOf('devices')` is `'goods'`. `lineInfo('Smartphone Pro', 'devices')` is premium of family Smartphone, `lineInfo('Laptop Lite', 'devices')` is value, `lineInfo('Smartphone Mk II', 'devices')` is next with gen 2.
  - `gates by era`: `industryEraBlock('devices', 'us', 1976)` equals the `notYet` text. `us` in 1977 is null. `in` in 1977 is not null and `in` in 2026 is null.
  - `offers ideas from 1977 to 2040 at home and in a late country` (the pattern of `product-ideas-new-trades.test.ts`): for `us` and `in`, every year 1977 to 2040, with `adult(3, y, c)` and `readBiz(g, company(g, 'devices'))`: `classicIdeas` has at least 3 and `productIdeas(g, b, 8)` has 8 unique non-empty names.
  - `never names a kind before its year`: F for each of the eight kinds is the first year of its `demandCurve` (the `firstYear` helper of `product-ideas-new-trades.test.ts`), and one separate check pins F to Home Computer 1977, Mobile Phone 1983, Desktop PC 1985, Laptop 1995, Smartphone 2007, VR Headset 2016, AR Glasses 2019, Device Operating System 1981. For each: `anachronismsIn(name, F, ['us'])` is `[]`; the name is not in `classicIdeas` at F - 1; it is in `classicIdeas` at F + 3 (a world market opens about two years late, because `laggard('world')` is .3; the Smartphone and the OS follow their technology curve and exist from F). The rules that can trip are 'laptop' (1990), 'mobile phone', 'smartphone' and 'PC' in `events/era.ts`, and all four clear their adoption bar for the US at these years. P11 applies if one doesn't.
  - `has finite plans from 1950 to 2060 and earns 8% to 20% of capital in 2026`: for 1950, 1976, 1977, 1990, 2007, 2026, 2060, `bestPlan(g, b, { quick: true })` has finite `price`, `production`, `profit`, `demand`. In 2026 at `us`, `bestPlan(...).profit / startupCost('devices', 'us', b.city).capital` is between .08 and .20.
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-trade.test.ts --maxWorkers=2`. Expected: FAIL (`INDUSTRY_IDS` has length 55; `INDUSTRIES.devices` is undefined).
- [ ] **Step 3: Implement the registration** from S1 and S9.
  - `INDUSTRIES.devices` uses the S1 numbers, `emoji: '\u{1F4F1}'`, blurb `Phones and computers for the whole world. Better chips make them faster and cheaper to build.`, US yearly role pay 230K, 170K, 150K, 175K, 190K, and `products` in Task 1's order.
  - `DEMAND` (S1): Home Computer `[1977, 1988, 0.9, 1990, 0.2, 6]`; Mobile Phone `[1983, 2000, 1.3, 2008, 0.15, 7]`; Desktop PC `[1985, 1998, 1.2, 2012, 0.45, 12]`; Laptop `[1995, 2008, 1.4]`; Smartphone `{ tech: 'smartphone', size: 1.8, first: 2007 }`; VR Headset `[2016, 2030, 0.5]`; AR Glasses `[2019, 2034, 0.4]`; Device Operating System `{ tech: 'homeComputer', size: 0.7, first: 1981 }`. `ERA_FROM` first years equal each curve's first year.
  - `PERIOD_CLASSICS.devices`: Pocket Calculators, Digital Watches, Cordless Telephones, Handheld Game Units. `classicIdeas` already drops an idea the player's country can't have yet (`eraFits`; Handheld Game Units waits for game consoles in a late country), so only rename one if `anachronismsIn(name, 1977, ['us'])` is not `[]`. The 'in' case of the ideas test still has at least 3 classics without it.
  - Tune `price`, `unitCost`, `demand`, `rent` and `wage` of `INDUSTRIES.devices` (nothing else) until the calibration test passes, keeping `price / unitCost` between 1.4 and 2.2. Write the final values in a comment above the entry.
  - Do not add `devices` to `invest/engine.ts`, market-event `EXPOSURE`, `nepo-asks.ts`, `nation/data.ts` or any `data/markets/*.ts` demand row.
- [ ] **Step 4: Fix the compile list.** `npm run typecheck`. Every other `Record<Industry, ...>` it reports gets a `devices` entry equal to the default behaviour. Name each in the commit message.
- [ ] **Step 5: Run to see it pass.** `npx vitest run test/devices-trade.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 6: Regression.** `npx vitest run test/business-expansion.test.ts test/economy-sectors.test.ts test/product-ideas-new-trades.test.ts test/plan-search-reads.test.ts --maxWorkers=2` (18.1 s, 1.7 s, not timed, 6.5 s). The new trade is in the start menu from here on, so also run the two suites that loop over every trade there, filtered: `npx vitest run test/deeptech.test.ts test/deeptech-review.test.ts -t "Deep Tech heading|classic founding with investors|honest purple hints" --maxWorkers=2`. Do not run `market-brands`, `market-roster`, `heavy-data` or `workshop-trades` here: they stay red (34 curated trades and no cast, no `BREAKTHROUGHS.devices`, no workshop category) until Task 3. Then `npm run typecheck`.
- [ ] **Step 7: Commit.**
```bash
git add src/game/data/markets.ts src/game/business/industries.ts src/game/business/competition-data.ts src/game/business/conglomerate-econ.ts src/game/economy/model.ts src/game/business/supply.ts src/game/business/market-trade.ts src/game/business/market-view.ts src/game/business/products.ts src/game/business/product-data.ts test/business-expansion.test.ts test/economy-sectors.test.ts test/devices-trade.test.ts
git commit -m "feat: devices trade with eight dated kinds" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 3: The cast, the catalogue, the workshop and the wave roles (S7, S8)

**Files:**
- Create: `src/game/business/market-data-devices.ts`, `test/devices-cast.test.ts`
- Modify: `src/game/data/brands-rivals.ts` (import `DEVICE_ROWS`, add it to the `rowsToBrands` array, header "33 industries" to 34)
- Modify: `business/heavy-data.ts` (`BREAKTHROUGHS.devices`), `src/game/workshop/catalog.ts` (add `devices` to the `gadget` and `computing` industry regexes), `src/game/workshop/migrate.ts` (`fieldFor` computing rule)
- Modify: `business/tech-wave-data.ts` (a release 1 file: re-read it first)
- Modify tests: `test/market-brands.test.ts` ("preserves all 33" and `toHaveLength(33)` to 34), `test/market-roster.test.ts` (line 160, `toBe(55)` to 56), `test/workshop-trades.test.ts` (the devices expectations)

**Interfaces:**
- Consumes: `RivalRow` (`market-rows.ts`), `rosterOf`, `activeRivals` (`competition-roster.ts`), `knownPlace` (`market-places.ts`), `WAVE_KINDS`, `breakthroughsFor`, `companyFits`, workshop `fieldFor`.
- Produces: `DEVICE_ROWS: RivalRow[]` (24 rows, industry `'devices'`), `BREAKTHROUGHS.devices` (five entries), `devices` in `core` of the `smartphone` and `microcomputer` wave kinds.

- [ ] **Step 1: Write the failing tests.** `test/devices-cast.test.ts`:
  - `has 24 rows, 19 alive in 2026 and 5 ended`: every row's industry is `devices`; slugs are unique and differ from every slug in the other `market-data-*` files; `since >= founded`; the 5 ended rows have `end < PRESENT_YEAR` and fates LG closed, Nokia, IBM, Compaq, Palm acquired; no row has `a`, `q` or `t`; every `hq` passes `knownPlace`; `JSON.stringify(DEVICE_ROWS)` lowercased contains none of scandal, fraud, lawsuit, recall, bankrupt, breach, cartel, tobacco, gambling.
  - `fields the right companies in the right years`: `activeRivals(rosterOf('fam-dev', 'devices', 'world'), 1985)` real names include IBM, Apple and HP and exclude Samsung and Xiaomi; 2026 has at least 12 real names; Nokia is active in 2005 and not in 2015; LG is not active in 2022.
  - `five breakthroughs`: `breakthroughsFor('devices').map((b) => [b.name, b.first])` equals Pen-Input Pocket Computer 1993, Pocket Music Player 2001, Touch Slate Computer 2010, Foldable Display Phone 2019, Spatial Headset Computer 2024. Each note is one sentence under 120 characters.
  - `wave roles`: `WAVE_KINDS.smartphone.core` equals `['software', 'devices']`, `WAVE_KINDS.microcomputer.core` equals `['semiconductor', 'software', 'devices']`, `WAVE_KINDS.mobilephone.core` does not contain `devices`, and no kind lists `devices` in more than one role.
  - In `test/workshop-trades.test.ts` add `expect(categoriesOf('devices')).toEqual(['gadget', 'computing'])` and `expect(fieldFor('devices', undefined)).toBe('computing')`. The "no category" list stays as it is.
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-cast.test.ts test/market-brands.test.ts test/market-roster.test.ts test/heavy-data.test.ts test/workshop-trades.test.ts --maxWorkers=2`. Expected: FAIL (no `DEVICE_ROWS`, fewer than 15 real rows for `devices`, no `BREAKTHROUGHS.devices`, no workshop categories).
- [ ] **Step 3: Implement the cast** in `market-data-devices.ts` as `export const DEVICE_ROWS: RivalRow[]`, in the format and with the `B`, `M`, `P` constants of `market-data-tech.ts`. The 19 alive rows are S7's table with P7 slugs (slug, name, hq, founded, tier, pot, since; the name is the company's name, the capitalised slug unless shown):
  - `apple-devices` Apple us 1976 P 14 since 1977; `samsung-devices` Samsung kr 1969 M 13 since 1988
  - `lenovo` cn 1984 M 8; `hp` HP us 1939 M 7 since 1980; `dell` us 1984 M 6.5; `xiaomi` cn 2010 M 7 since 2011
  - `huawei` cn 1987 M 6 since 2004; `oppo` cn 2004 M 4.5 since 2008; `vivo` cn 2009 M 4.5 since 2011; `oneplus` OnePlus cn 2013 M 1.2
  - `acer` tw 1976 M 3.2 since 1981; `asus` tw 1989 M 3.5 since 1995; `htc` HTC tw 1997 M 1.4 since 2006
  - `sony-devices` Sony jp 1946 P 3.5 since 1996; `google-devices` Google us 1998 P 3 since 2010; `microsoft-devices` Microsoft us 1975 P 3 since 2012
  - `motorola` us 1928 M 3 since 1983; `meta-devices` Meta us 2004 B 3 since 2014; `amazon-devices` Amazon us 1994 B 2.5 since 2011
  - The 5 ended rows (P8):
```ts
['devices', 'lg-mobile', 'LG', 'kr', 1958, M, 4, { since: 1998, end: 2021, fate: 'closed' }],
['devices', 'nokia', 'Nokia', 'fi', 1865, M, 8, { since: 1982, end: 2013, fate: 'acquired' }],
['devices', 'ibm-pc', 'IBM', 'us', 1911, P, 6, { since: 1981, end: 2004, fate: 'acquired' }],
['devices', 'compaq', 'Compaq', 'us', 1982, M, 4, { end: 2001, fate: 'acquired' }],
['devices', 'palm', 'Palm', 'us', 1992, M, 1.5, { end: 2009, fate: 'acquired' }],
```
- [ ] **Step 4: Implement the rest.**
  - Register `DEVICE_ROWS` in `brands-rivals.ts`.
  - Add `BREAKTHROUGHS.devices` with the five names and years above and one plain sentence each under 120 characters that mentions nothing missing in its first year (for example "A handheld computer you write on with a pen, for notes and addresses."). Add the entry as the last key of `BREAKTHROUGHS`. `heavy-data.test.ts` also pins that each note ends with a full stop, has no colon and is unique game-wide, and that `lineInfo(name, id)` reads every breakthrough name as a family of its own in every trade, so none of the five may end in Pro, Max, Plus, Lite or Express.
  - `workshop/catalog.ts` and `workshop/migrate.ts`: add `devices` to the three regexes.
  - `tech-wave-data.ts`: `smartphone.core` becomes `['software', 'devices']` and `microcomputer.core` becomes `['semiconductor', 'software', 'devices']`. Rewrite the comment that says there is no devices trade: television's winner is advertising, device makers share the home computer and smartphone waves, telecom carries the phone wave.
  - Update the two count tests.
- [ ] **Step 5: Run to see it pass.** Same command as Step 2. Expected: all PASS.
- [ ] **Step 6: Regression.**
  - `npx vitest run test/tech-wave-data.test.ts test/tech-waves.test.ts --maxWorkers=2` (release 1 suites, not timed).
  - Because they loop over every trade, once each: `npx vitest run test/world2-rivals.test.ts --maxWorkers=2` (8.2 s), `npx vitest run test/talent-business.test.ts --maxWorkers=2` (not timed; its robustness test has a 120 s limit) and `npx vitest run test/heavy-project.test.ts -t "every breakthrough of every trade can be priced" --maxWorkers=2` (it walks `BREAKTHROUGHS`, so the new trade needs a priced, offered breakthrough in 2030). A failure there is reported, never fixed by editing a pin.
  - `npm run typecheck`.
- [ ] **Step 7: Commit.**
```bash
git add src/game/business/market-data-devices.ts src/game/data/brands-rivals.ts src/game/business/heavy-data.ts src/game/workshop/catalog.ts src/game/workshop/migrate.ts src/game/business/tech-wave-data.ts test/devices-cast.test.ts test/market-brands.test.ts test/market-roster.test.ts test/workshop-trades.test.ts
git commit -m "feat: devices rival cast, breakthroughs, workshop and wave roles" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 4: Saved state, chip costs and the fab (S2, S3, S10)

**Files:**
- Modify: `state.ts` (the two fields and `normalizeBiz`), `economy.ts` (`costFactor`, `evolve`, `bookYear`, new `capitalIndex`, `fabCost`, `fabUpkeep`), `manage.ts` (`buildFabAction` and `fabGain`, beside `buildLinesAction` and `linesGain`)
- Test: `test/devices-chips.test.ts`, `test/devices-save.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 (`readFabs`, `readChips`, `chipCostFactor`, `chipTerms`, `FAB_BASE`, `FAB_STEP`, `FAB_MAINT`, `FAB_MAX`); `localEcon`, `bestPlan`, `bookYear`, `yearFixed`, `headOffice`, `equipmentValue`, `planFor`, `valuationOf`, `refreshValue`, `boardAllows`, `noCash`, `manageBlock`, and the `manage.ts` helpers `act`, `cachedHint`, `hinting`, `priceAndOutput`, `yearsText`, `PAYBACK_MAX`; `normalizeBiz`, `readBiz`, `bizOf`.
- Produces:
  - `BizState.fabs?: number`, `BizState.chips?: ChipSupply`
  - `capitalIndex(b: Pick<BizState, 'industry' | 'countryId' | 'city'>): number`, `fabCost(b: BizState, n = 1): number`, `fabUpkeep(b: BizState): number`
  - `buildFabAction(a: Asset): MenuAction` (id `biz.fab.${a.id}`, label `Build a Chip Fab`), `fabGain(g: GameState, a: Asset): number`

- [ ] **Step 1: Write the failing tests.** Helper in both files:
```ts
const devices = (seed = 5, year = 2026) => { const g = adult(seed, year, 'us'); const a = company(g, 'devices', { cash: 5e9 }); return { g, a, b: bizOf(g, a) } }
```
  `test/devices-save.test.ts` (RF1):
  - `readFabs`: `[undefined, null, 'x', NaN, Infinity, -1, 0, 1, 2, 3, 4, 2.5, 1e9, '2', [2], {}]` gives `[0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0]`.
  - `readChips` keeps `{ year: 2026, from: 'a1', name: 'Acme Silicon', stage: 3, node: 5, yield: .8, cover: .6 }` unchanged. It returns null for each of: a string or NaN in any number, stage 1, 5 or 3.5, node 7, -1 or 2.5, yield .2, 1 or NaN, cover -.1 or 1.1, year 1e9 or 2026.5, `from` empty or 7, an array, null. A 100-character `name` is cut to 60. Extra keys are dropped.
  - `normalizeBiz`: a devices company with hostile `fabs` and `chips` loads with neither. Valid values survive `JSON.parse(JSON.stringify(...))`. A restaurant carrying `fabs: 2` and a valid `chips` loads with neither and deep-equals the same details without them. A save without the fields loads with `'fabs' in b` false. `SAVE_SCHEMA` and `BIZ_VERSION` are both 2. `readBiz(g, a)` keeps both on a devices asset.

  `test/devices-chips.test.ts`:
  - `costFactor reads one source`: the ratio to the plain `costFactor(b, true)`, to 4 places, is .9475 for `fabs: 1`, .895 for `fabs: 3`, .916 for `chips: SIS(4, 1)`, .895 for both, and 1 for a restaurant with `fabs: 3`.
  - `prices a fab by the plant, never by the money`:
```ts
const price = fabCost(b)
expect(price).toBe(Math.round(FAB_BASE * capitalIndex(b)))
for (const o of [{ cash: 1e6 }, { cash: 1e12 }, { valuation: 1, last: null }, { valuation: 1e13 }]) expect(fabCost({ ...b, ...o } as BizState)).toBe(price)
expect(fabCost({ ...b, fabs: 1 })).toBe(Math.round(FAB_BASE * capitalIndex(b) * 1.35))
expect(fabCost({ ...b, fabs: 2 })).toBe(Math.round(FAB_BASE * capitalIndex(b) * 1.7))
expect(Math.abs(fabCost(b, 2) - (price + fabCost({ ...b, fabs: 1 })))).toBeLessThanOrEqual(1)
```
    `fabUpkeep` is 0, `round(.07 x FAB_BASE x idx)` and that x2.35 for 0, 1 and 2 fabs, and 0 for a restaurant with `fabs: 3`.
  - `books the upkeep in the year`: with `k = yearFixed(g, b)`, `bookYear(g, b2, g.year, planFor(g, b2, g.year, { calm: true }), b2.production, 0, k).stmt.upkeep` for `b2 = { ...b, fabs: 1 }` minus the same for `b` is within 2 of `fabUpkeep(b2) x k.finance x k.ceoEff x (1 + headOffice(totalOutlets(b)))`, because `bookYear` runs the upkeep through the finance, CEO and head-office multipliers like the capacity-line upkeep.
  - `a fab is not equipment` (P12): `equipmentValue({ ...b, fabs: 2 })` equals `equipmentValue(b)`. After the build in `builds a fab and nothing else`, `equipmentValue` is unchanged.
  - `lifts quality through evolve`: two clones (no fab, three fabs), each given `stmt = simulateYear(g, clone, g.year, 0, 1).stmt`, `g.rng` restored to the same value before each clone's call, three years of `evolve`: the fab clone's quality is at least 1 above the other's and never above 98.
  - `fabGain is the plan difference and the hint follows its sign`: `fabGain(g, a)` is close to `bestPlan(g, { ...b, fabs: 1 }, { fast: true }).profit - bestPlan(g, b, { fast: true }).profit`. For one studio it is negative and `buildFabAction(a).hint!(g)` contains "The savings don't cover the upkeep." After raising `outlets[0].count` in steps (up to 300 studios) until 2026 sales are about 2B (read `bestPlan(...)` demand x price; if saturation stops the sales short of that, stop at the first count where the gain is positive and write the measured sales in a comment) the gain is positive, `fabCost / gain` is at most 8 and the hint matches `/Cost savings alone repay it in about (a year|\d+ years)\. Quality gains are extra\./`. The third text, "The savings alone take over 8 years to repay it.", is pinned in Task 8 on the second and third fab.
  - `builds a fab and nothing else` (RF5):
```ts
const { g, a, b } = devices(); const price = fabCost(b); b.cash = price + 1e6   // b is the live a.details, so take the price before the run
const row = buildFabAction(a), cash = b.cash, rng = g.rng, equipment = equipmentValue(b)
row.run(g)
expect(bizOf(g, a).fabs).toBe(1); expect(bizOf(g, a).cash).toBe(cash - price); expect(g.rng).toBe(rng); expect(equipmentValue(bizOf(g, a))).toBe(equipment)
expect(textsOf(g)).toContain(`${a.name} built a chip fab.`); expect(noticeTexts(g).join('\n')).toContain('Fab Online')   // textsOf, noticeTexts as in heavy-project.test.ts
```
    Each refusal leaves `a.details` and `g.character.money` byte-identical and `g.rng` unchanged: player age 17, cash `fabCost - 1`, `fabs: 3` (the fourth fab), a restaurant, a company the player no longer owns (removed from `g.assets`). After the first build, give it cash again: a second run takes `fabCost` at the new count (the price rises x1.35) and leaves `fabs` at 2, and with `fabs` at 3 the row is disabled.
  - `a board decides` (RF5): with `b.share = .4` and `boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }` (the pattern in `heavy-project.test.ts`), loop seeds 90 to 130 until two approvals and two rejections: cash and `fabs` move only on approval, and a "Board Vote" notice appears either way.
  - `a hired CEO never builds one`: `readFileSync` of `src/game/business/board-ceo.ts` contains neither `fabs` nor `buildFab`.
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-save.test.ts test/devices-chips.test.ts --maxWorkers=2`. Expected: FAIL (`fabCost` and `buildFabAction` are not exported, and `normalizeBiz` drops `fabs` and `chips`).
- [ ] **Step 3: Implement the fields.**
  - `readFabs` and `readChips` already exist from Task 1 (strings are cut with `slice(0, 60)` there). Their cases are tested here, in `devices-save.test.ts`.
  - `state.ts`: `fabs?: number` and `chips?: ChipSupply` with doc comments (missing on old saves, devices only). In `normalizeBiz`, beside `heavyLast`, add `const fabs = readFabs(d.fabs), chips = readChips(d.chips)` and, in the returned object, `...(industry === 'devices' && fabs > 0 ? { fabs } : {})` and `...(industry === 'devices' && chips ? { chips } : {})`. `BIZ_VERSION` stays 2.
- [ ] **Step 4: Implement the economy hooks** (S2, S3).
  - `costFactor` returns `sup * ops * chipCostFactor(b) * (calm ? 1 : b.costShock)`.
  - `evolve`: add `+ chipTerms(b, year).lift` inside the `qTarget` sum, before its clamp.
  - `bookYear`: after the capacity-line block add `upkeep += fabUpkeep(b)`.
  - `capitalIndex` is `localEcon(...).capital / industryDef(b.industry).capital`. `fabCost` and `fabUpkeep` use S3's sums; upkeep is 0 for other trades. Neither reads cash, revenue, valuation or a statement.
- [ ] **Step 5: Implement `buildFabAction(a)` and `fabGain`** in `manage.ts` with the `act` helper, modelled on `buildLinesAction`.
  - Row: `act(a, 'fab', 'Build a Chip Fab', '\u{1F3ED}', ...)`. Subtitle `${money(fabCost)} · upkeep about ${money(upkeep after the build)} a year · fab ${n + 1} of 3`. Confirm `Build a chip fab for ${money(cost)}? It can't be sold.`
  - `disabled` returns the first of: `Only a device company builds chip fabs.`, `Three fabs is the most a company can run.`, `Not enough company cash. A fab costs ${money(cost)}.`
  - Hint (Business talent only, built like the expansion hints: `hinting(g, cur)` and `priceAndOutput(readBiz(g, cur))` first, then `talentHint(g, 'Business', text)`) comes from `fabGain` and has three texts (P13): with `gain > 0` and `cost / gain <= PAYBACK_MAX`, `Cost savings alone repay it in ${yearsText(cost / gain)}. Quality gains are extra.` (`yearsText` already says "about N years"); with `gain > 0` and a slower payback, `The savings alone take over ${PAYBACK_MAX} years to repay it.`; otherwise `The savings don't cover the upkeep.`
  - `act` already runs `manageBlock` and `disabled` against the live business before `run`, so the industry, `FAB_MAX` and cash rules are enforced inside the action. `run` repeats only the cash check (for its notice), then:
```ts
if (b.cash < cost) return noCash(g, cur, cost, 'a chip fab')
const gain = fabGain(g, cur)
if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: cost, gain: Number.isFinite(gain) ? Math.max(0, gain) : 0, label: `Build a chip fab for ${money(cost)}` })) return
b.cash -= cost; b.fabs = (b.fabs ?? 0) + 1; b.valuation = valuationOf(b); refreshValue(cur, b)
log(g, `${cur.name} built a chip fab.`, 'good')
notice(g, 'Fab Online', `${cur.name} paid ${money(cost)} for fab ${b.fabs} of ${FAB_MAX}. Upkeep for its fabs is about ${money(fabUpkeep(b))} a year.`, { emoji: '\u{1F3ED}', tone: 'good' })
```
  - `fabGain` is `cachedHint(g, a, 'fab.gain', ...)` returning `bestPlan(g, { ...b, fabs: fabs + 1 }, { fast: true }).profit - base`, where `base` is the cached `payback.base` that `linesGain` already uses. No random draw anywhere.
- [ ] **Step 6: Run to see it pass.** `npx vitest run test/devices-save.test.ts test/devices-chips.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 7: Regression.** `npx vitest run test/business-save-normalization.test.ts test/plan-search-reads.test.ts test/world2-business-supply.test.ts test/business-expansion.test.ts test/business.test.ts test/board.test.ts --maxWorkers=2` (5.7 s, 6.5 s, 7.7 s, 18.1 s, two not timed). They pin `costFactor`, `bookYear`, the normalizer and the plan-search read counts for every other trade. Then `npm run typecheck`.
- [ ] **Step 8: Commit.**
```bash
git add src/game/business/state.ts src/game/business/economy.ts src/game/business/manage.ts test/devices-chips.test.ts test/devices-save.test.ts
git commit -m "feat: devices chip costs, quality lift and the chip fab" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 5: The operating system and bounded lock-in (S5)

**Files:**
- Modify: `src/game/business/economy.ts` (`osStrength`, `osPull`, the `marketCtxFor` return)
- Test: `test/devices-os.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 (`OS_FAMILY`, `OS_BETA`, `OS_PULL_CAP`, `DEVICE_NETWORK`); `networkPull` (`competition-roster.ts`); `effectiveQuality`, `infoOf`, `edgeOf` (`product-market.ts`); `marketOfBiz`, `saveMarket` (`competition.ts`).
- Produces: `osStrength(b: Pick<BizState, 'industry' | 'products'>, year: number): number` (0 to 1) and `osPull(base: number, strength: number): number`.

- [ ] **Step 1: Write the failing test** `test/devices-os.test.ts` (the `devices()` helper is Task 4's).
  - `osStrength`: 0 without an OS line, and 0 for a non-devices company that holds one. Quality 35 gives 0, 57.5 gives .5, 80 gives 1, 100 gives 1. A quality-80 line launched 2020 read in 2030 gives about .76 (it ages 1.2 points a year). The best of several OS lines counts: a premium variant counts, a bundle or add-on does not.
  - `osPull`: `osPull(.8, 1)` is 3. `osPull(.5, 0)` is close to `networkPull(.5, 1.5)`. The S5 table holds: `osPull(.3, 1)` about 1.54, `(.5, 1)` about 2.36, `(.6, 1)` about 2.94; the no-OS values about 1.31, 1.71, 1.96; a rival at .3 (`networkPull(.3, .75)`) about 1.14. For base 0 to 1 and strength 0 to 1 in steps of .1, `osPull` is finite, at least the plain pull, never above `max(plain, 3)`, and non-decreasing in strength.
  - `marketCtxFor swaps only the pull, for device companies only`:
```ts
const { g, a, b } = devices(); const st = marketOfBiz(b); st.base = 0.6; st.year = g.year - 1; saveMarket(b, st)
const none = marketCtxFor(g, b, g.year); expect(none.w).toBeCloseTo(networkPull(0.6, 1.5), 12)
b.products.push({ name: OS_FAMILY, launched: g.year - 1, boost: 0, quality: 80, family: OS_FAMILY, kind: 'core' })
const withOs = marketCtxFor(g, b, g.year)
expect(withOs.w).toBeCloseTo(osPull(0.6, osStrength(b, g.year)), 12); expect(withOs.w).toBeGreaterThan(none.w)
expect({ ...withOs, w: 0 }).toEqual({ ...none, w: 0 })        // nothing else moves
expect(marketCtxFor(g, b, g.year)).toEqual(withOs)             // and a repeat is equal
```
    A second devices company in the same market state with no OS still gets the plain pull (the cached context was not mutated). A restaurant and a software company get `networkPull(ctx.base, marketDef(industry).network)`.
  - `quality still beats lock-in`: `3 * edgeOf(50, { offer: 1, quality: 80 })` is below 1.2 (a rival 30 points better wins share back even at the 3.0 cap).
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-os.test.ts --maxWorkers=2`. Expected: FAIL (`osStrength` and `osPull` are not exported).
- [ ] **Step 3: Implement.**
  - `osStrength` is `clamp((best effectiveQuality(p, b.industry, year) - 35) / 45, 0, 1)` over the lines whose `infoOf(p, b.industry).family === OS_FAMILY` and whose kind is not bundle or addon. It is 0 for other trades and with no line.
  - `osPull` is `Math.max(networkPull(base, DEVICE_NETWORK), Math.min(OS_PULL_CAP, networkPull(base, DEVICE_NETWORK + OS_BETA * strength)))`.
  - In `marketCtxFor`, for `b.industry === 'devices'` return a new object `{ ...result, w: osPull(ctx.base, osStrength(b, year)) }`. Other trades return exactly what they return today. Never mutate `ctx`: its cache key is the state, not the line list.
- [ ] **Step 4: Run to see it pass.** `npx vitest run test/devices-os.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 5: Regression.** `npx vitest run test/competition.test.ts test/plan-search-reads.test.ts --maxWorkers=2` (20.8 s, 6.5 s): every other trade's context and the read counts stay as they were. Then `npm run typecheck`.
- [ ] **Step 6: Commit.**
```bash
git add src/game/business/economy.ts test/devices-os.test.ts
git commit -m "feat: operating system lock-in for device companies" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 6: A sister fab through Group Services (S4)

**Files:**
- Modify: `src/game/business/group-services.ts` (`SERVICE.semiconductor`, `valid()`, both generic loops, `assignChips`, `settleChips`, helpers, menu rows)
- Modify: `src/game/business/conglomerate-year.ts` (one line in `groupYear`)
- Test: `test/devices-group.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 (`CHIP_SHARE`, `CHIP_RESERVE`, `SISTER_CUT`, `chipSource`, `chipBook`); Task 4 (`BizState.chips`); `techView`, `techOf` (`deeptech-core.ts`); `liveGroup`, `groupById`, `groupsOf`, `Group`, `GroupMember` (`conglomerate-state.ts`); `businessAssets`, `readBiz`, `bizOf` (`state.ts`).
- Produces (`group-services.ts`):
  - `chipBlock(g: GameState, p: GroupMember, q: GroupMember): string | null`
  - `hasChipContract(g: GameState, grp: Group, customer: string): boolean`
  - `chipResultFor(g: GameState, customer: string): { provider: string; saved: number; year: number } | null`
  - `chipRows(g: GameState, buyer: Asset): string[]` (at most 2)
  - `groupServiceResults` records may carry `chips: true`.

- [ ] **Step 1: Write the failing test** `test/devices-group.test.ts`. Fixture (the pattern of "capacity-limited group contracts" in `business-financial-overhaul.test.ts`):
```ts
function chipGroup() {
  const g = adult(7, 2028, 'us'), sister = company(g, 'semiconductor', { name: 'Acme Silicon' }), buyer = company(g, 'devices', { name: 'Acme Phones' })
  const t = techOf(bizOf(g, sister)); t.stage = 3; t.node = 5; t.yieldRate = 0.8
  for (const a of [sister, buyer]) book(g, a, 2026, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
  expect(formGroup(g, [sister.id, buyer.id], 'Chip Group')).toBe(true)
  return { g, sister, buyer, id: groupsOf(g)[0].core.id }
}
```
  `book(g, a, year, over)` writes `b.last = { year, revenue, netRevenue, cogs, wages: 0, keyStaff: 0, rent: 0, upkeep: 0, marketing: 0, pbt: 1e6, corpTax: 0, net: 1e6, otherIncome: 0, ...over } as Statement` (the cast is what `business-financial-overhaul.test.ts` does: `test/` is typechecked and `Statement` has more fields). Fiscal years in these tests are 2027 (prepare and settle) and 2028 (the next year, after `g.year++`). A test that needs a contract calls `toggleService(g, id, sister.id, buyer.id)` first. For the cross-sell test use the `world()` pattern of `conglomerate-v2-management.test.ts` (a hired group CEO of skill 95) and statements for fiscal `g.year - 1`.
  - `follows the rule table`: `toggleService(g, id, sister.id, buyer.id)` is true. Buyer to sister, semiconductor to a restaurant, and a sister at stage 1 are false. A sister with an extra outlet abroad but the same home country is still valid (outlets relaxed). A sister headquartered in another country is not. A sister at 80% group ownership (`bizOf(g, sister).share = .8`) is refused and `chipBlock` returns exactly `Acme Silicon can't supply chips. The group doesn't own all of it. Buy out its investors first.` `groupServicesMenu(id).children(g)` shows that text as an info row, and for the valid pair an action labelled `Assign Acme Silicon → Acme Phones` with subtitle `Chip supply`. At most 6 chip info rows.
  - `assigns once a year`: `prepareInternalServices(g, 2027)` writes `buyer.chips` equal to `{ year: 2027, from: sister.id, name: 'Acme Silicon', stage: 3, node: 5, yield: .8, cover }` with `cover = clamp(.2 x 100e6 / (100e6 x .35), 0, 1)` (about .571). A second call leaves `JSON.stringify(g)` unchanged.
  - `cover and hold`: a 1M-revenue sister against a 2B-cogs buyer covers under 1%. Sister revenue 100e6 with buyer cogs 100e6 holds .2 (`capacityLoss` .2). Buyer cogs 10e6 holds `bill / revenue` (about .035). Three buyers of one sister hold at most .5 in total (`capacityLoss` at most .5 and above .36). A buyer with `fabs: 3` gets no record and the sister's `capacityLoss` stays 0.
  - `settles neutral to the provider`: after `prepareInternalServices(g, 2027)`, book both companies for 2027 and run `settleInternalServices(g, 2027)`. The provider's cash and `last.pbt` are unchanged and its `last.revenue` rose by the invoice. `invoice <= .25 x netRevenue`. `internalRevenue(g, id, 2027)` equals the invoice. `groupServiceResults` holds one record `{ chips: true, saved: round(chipBook(cogs, chipSource(buyer).cut).saved), year: 2027 }`. The buyer's statement is unchanged. The log contains "supplied chips to" and "saved it about". A second call changes nothing. No "net operating savings" log appears in a chip-only year.
  - `a sister that stops qualifying` (RF2): with a record in place, (a) remove the sister from `g.assets`, or delete its `group` membership, (b) set its share to .8, (c) toggle the contract off mid-year. In (a) and (b) the next `prepareInternalServices(g, 2028)` leaves no `buyer.chips` and the old hold is not re-applied. In (c) settlement for 2027 still books the record (nothing changes mid-year) and the 2028 prepare clears it. Toggling a contract on after prepare writes no record until 2028. No case leaves NaN or a negative cash.
  - `empty books` (RF3): a buyer with `last = null`, a buyer with `cogs: 0`, a sister with `netRevenue: 0` and a sister with `last = null` each get no record, no `capacityLoss`, no result, and `JSON.stringify(g)` holds no `NaN`.
  - `cross-selling follows the contract`: in two identical `world()` groups of a semiconductor and a devices company, `yearlyGroups(g)` gives the buyer a `demandShock` above 1 without a contract and exactly 1 with one.
  - `Assign All and ownership`: `assignAllServices(g, id)` adds the chip pair, and repeating adds 0. A minority sister is skipped. With the player under 18, `toggleService` and `assignAllServices` change nothing.
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-group.test.ts --maxWorkers=2`. Expected: FAIL (`valid()` refuses the pair, `chipBlock` is not exported).
- [ ] **Step 3: Implement the rules in `group-services.ts`.**
  - `SERVICE.semiconductor = { label: 'Chip supply', key: 'cogs', share: 0 }`.
  - In `valid()`, after the era check, a semiconductor provider returns early: true only for a `devices` customer whose provider has `techView(p.b).stage >= 2`. The outlet rule is skipped there. The same-country, `own >= .999` and era rules stay.
  - A private `isChip(grp, c)` marks provider semiconductor with customer devices. The generic hold in `prepareInternalServices` and the generic loop in `settleInternalServices` skip chip pairs.
  - `chipBlock` returns the first failing rule as plain text: other country `${p} can't supply chips. It's in another country.`; the sister not fully owned `${p} can't supply chips. The group doesn't own all of it. Buy out its investors first.`; the buyer not fully owned `${q} can't take chips. The group doesn't own all of it. Buy out its investors first.`; stage `${p} can't supply chips. It isn't shipping chips yet.`; era `${p} can't supply chips. The technology isn't there yet.`
  - Add no `.share` versus .5 line.
- [ ] **Step 4: Implement `assignChips` and `settleChips`** (both private).
  - `assignChips(g, fiscal)` runs at the end of `prepareInternalServices`, behind its guard. For each live group, and each buyer in asset id order that is a `devices` company with `last` booked before `fiscal`:
    1. `bill = last.cogs x CHIP_SHARE`; skip when below 1.
    2. Candidates are the contracted sisters that pass `valid()` and have `last.netRevenue >= 1` booked before `fiscal`.
    3. A candidate's record is `{ year: fiscal, from, name, stage: min(4, stage), node, yield, cover: clamp(CHIP_RESERVE x sister.last.netRevenue / bill, 0, 1) }`.
    4. The best is the largest `SISTER_CUT[stage] x cover`, ties by asset id; write it to `buyer.chips`.
    5. Drop it when `chipSource(buyer).src !== 'sister'` (own fabs win or tie).
    6. Otherwise hold `h = min(CHIP_RESERVE, bill / sister.last.netRevenue)`, clipped so the holds on that sister sum to at most .5, as `capacityLoss = 1 - (1 - capacityLoss) x (1 - h)`.
    7. Last, every business asset whose `chips.year !== fiscal` loses its record (read with `readBiz`, write with `bizOf` only when stale).
  - `settleChips(g, fiscal, records)` runs inside `settleInternalServices` before `groupServiceResults` is written. For each live group (not only groups that still hold contracts) and each buyer with `chips.year === fiscal` whose provider is present, passes `valid()`, has both `last.year === fiscal` and has `chipSource(buyer).src === 'sister'`:
    1. `{ saved, paid } = chipBook(buyer.last.cogs, chipSource(buyer).cut)`; `invoice = min(round(paid x cover), floor(.25 x provider.last.netRevenue))`.
    2. Add the invoice to the provider's `revenue`, `netRevenue` and `cogs`; call `amend` with the old `pbt`, then `refreshValue`.
    3. Push `{ group, provider, customer, invoice, saved: round(saved), year: fiscal, chips: true }` and `log(g, `${provider} supplied chips to ${buyer} and saved it about ${money(saved)}.`, 'good')`.
  - The final "net operating savings" log sums only records without `chips`.
- [ ] **Step 5: Implement the helpers and rows.**
  - `hasChipContract(g, grp, customer)` is true when a contract for that customer has a semiconductor provider in the group.
  - `chipResultFor` returns the `groupServiceResults` record with `chips === true` for that customer, else null.
  - `chipRows(g, buyer)` returns up to 2 lines for the semiconductor sisters in the buyer's group, the active supplier first: `${name} supplies your chips and covers ${pct(cover)} of what you need.`; a valid but unassigned sister `${name} could supply your chips. Assign it under Group Services.`; otherwise its `chipBlock` text.
  - `groupServicesMenu` adds an info row (id `group.services.chip.${p}.${q}`, emoji `\u{1F4BE}`) with the `chipBlock` text for each semiconductor to devices pair that is neither valid nor active.
  - In `conglomerate-year.ts`, right after the `hasInternalServices` line add `if (hasChipContract(g, grp, x.a.id)) { d.crossSell = 0; d.crossSellValue = 0 }` and import it.
- [ ] **Step 6: Run to see it pass.** `npx vitest run test/devices-group.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 7: Regression.** `npx vitest run test/business-financial-overhaul.test.ts test/conglomerate-v2-management.test.ts test/world2-reports.test.ts test/control-sites.test.ts --maxWorkers=2` (not timed). They pin the existing contracts, the capacity hold, `internalRevenue` and the count of 3 share-versus-half lines. Then `npm run typecheck`.
- [ ] **Step 8: Commit.**
```bash
git add src/game/business/group-services.ts src/game/business/conglomerate-year.ts test/devices-group.test.ts
git commit -m "feat: a sister chip company supplies a device company's chips" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 7: Spec sheets and the Devices & Chips screen (S6)

**Files:**
- Create: `src/game/business/devices-specs.ts`, `src/game/business/devices-menu.ts`
- Modify: `src/game/business/manage.ts` (import `devicesMenu`; in `businessView` insert `...(health.industry === 'devices' ? [devicesMenu(a, buildFabAction(a))] : [])` right after `productsMenu(a)`)
- Test: `test/devices-specs.test.ts`, `test/devices-menu.test.ts` (create)

**Interfaces:**
- Consumes: release 2 `ScoreRow`, `scoreRow(id, label, unit, mine, field, prior?)`, `scoreText(row, fmt?)`; release 3 `rivalPriceIndex`; Task 1 (`devicePerf`, `marketNode`, `MARKET_YIELD`, `chipTerms`, `chipSource`, `chipBook`, `kindReference`, `LINE_PRICE`, `HARDWARE_FAMILIES`, `OS_FAMILY`, `OS_PULL_CAP`); Task 4 (`fabCost`, `fabUpkeep`); Task 5 (`osStrength`); Task 6 (`chipRows`, `chipResultFor`); `marketCtxFor`, `fieldFor`, `effectiveQuality`, `infoOf`, `localEcon`, `familyId`, `manageBlock`, `money`, `pct`.
- Produces:
  - `interface DeviceSpec { family: string; line: string; perf: ScoreRow; quality: ScoreRow; price: ScoreRow }`
  - `specSheet(g: GameState, b: BizState, year: number, ctx: MarketCtx): DeviceSpec[]`
  - `specLines(s: DeviceSpec): string[]` (three texts)
  - `devicesMenu(a: Asset, build: MenuNode): MenuGroup` (id `biz.devices.${a.id}`, label `Devices & Chips`)

- [ ] **Step 1: Write the failing tests.** `test/devices-specs.test.ts`, with a hand-made context:
```ts
const rival = (id: string, quality: number, tech: number, pull = 1, legacy = false) => ({ id, name: `Rival ${id}`, hq: 'us', founded: 1990, quality, tech, legacy, real: false, tier: 'mid' as const, seg: 'mass' as const, pull, prev: 0 })
const ctxWith = (g: GameState, b: BizState, rivals: ReturnType<typeof rival>[], versions: number[]) => { const c = marketCtxFor(g, b, g.year); return { ...c, rivals, field: { ...fieldFor(c), versions: () => versions } } }
```
  - `ranks and ties on a fixed field`: a 2026 Smartphone line (`quality: 62`, `launched: 2025`, `kind: 'core'`) against rivals A (version 60, tech 67), B (60, tech 40), C (version -1), D (pull 0), E (legacy) uses only A and B. Rival performance is `devicePerf(version, marketNode(year), MARKET_YIELD) + round((tech - 55) / 6)` clamped 0 to 100, so 69 and 65. Then `scoreText(spec.perf)` is `Performance 68. Market 67, best 69, rank 2 of 3.` and `scoreText(spec.quality)` is `Quality 62. Market 60, best 62, rank 1 of 3.` Two rivals tied with mine share the better rank. No rivals gives `... The market has no figures.` and no NaN.
  - `negates the price`: with `b.price` equal to the going price (`localEcon(...).goingPrice`) and a core line, `price.mine` is -900 and `price.of` is 3. `scoreText(spec.price, (n) => money(Math.abs(n)))` starts `Price $900.` and `best` is the cheapest figure. Rival prices are `-kindReference(F, year) x rivalPriceIndex(familyId(g.lifeId), r, year)`. A premium line at 1.1 x going prices at 900 x 1.1 x 1.25. `LINE_PRICE` applies per kind. Bundle and add-on lines get no sheet.
  - `picks the best line and gives one sheet per hardware family`: with Smartphone and Smartphone Pro lines, the better effective quality wins and `spec.line` names it. Laptop and OS lines give one sheet (the OS none). A breakthrough line gives none. Sheets follow `HARDWARE_FAMILIES` order.
  - `prior and trend`: a line launched this year reads trend 0 on all three rows. A Smartphone launched in 2022 and read in 2026 has a quality row with trend -1 (it ages 1.2 points a year) and a price row with trend 0.
  - `is pure and names nobody`: `JSON.stringify(g)` and `g.rng` are identical afterwards. No row text contains a rival's name. Every text is free of NaN, undefined and Infinity.

  `test/devices-menu.test.ts`:
  - `follows Products, for devices only`: `businessAssetView(g, a)` has `biz.devices.${a.id}` right after `biz.products.${a.id}` for a devices company and not for a restaurant.
  - `has at most 12 rows in every year` (RF4): for `us` every year 1977 to 2040, and for `in` the years 1977, 1985, 1995, 2005, 2015, 2026, 2040, give the company one `core` line (quality 60, `launched: y - 1`) of each hardware family whose `demandLevel(f, 'world', y).exists`.
    - `devicesMenu(a, buildFabAction(a)).children(g)` has at most 12 nodes and at most 7 family sub-menus (there are seven hardware families, so from 2019 a company with a line of each shows all seven: header, chips, build, platform, one sister row and seven families make 12).
    - For 1977 to 1979 it has no sub-menu and shows `No device is on sale yet. Develop one under Products.`
    - Every rendered text (rows, subtitles, headers, hints, reasons) is free of NaN, undefined, null and Infinity, is at most 180 characters with a 12-character company name, and holds no em-dash or en-dash. None contains a rival name from `ctx.rivals`.
  - `rows say what is true`: the first info row is exactly `Specs compare your best line of each kind with rivals that sell one. Better chips raise quality.`
    - The chips row with no fab reads `Chips come from the open market. A fab or a sister chip company would cut their cost.`
    - With `fabs: 2` it starts `You run 2 chip fabs.` and gives the cost cut (25%), the speed in points and the quality lift to one decimal, then, with a booked `last`, `At last year's volume that saves about $X a year.`
    - With a sister record it names the sister and says `saved about $X last year` from `chipResultFor`.
    - The platform row with an OS line reads `Your operating system keeps buyers. Pull is 2.36x at a 50% share, up to 3.0x.` (numbers from the context); without one `No operating system yet. One would add pull as your share grows, up to ${OS_PULL_CAP.toFixed(1)}x.` (a share of 0 gains nothing from an operating system, so the text names no share)
    - A family sub-menu subtitle matches `Performance 68 · rank 2 of 3` and its children are the three `specLines`.
  - `is pure`: state JSON and `g.rng` are identical before and after rendering every row, including from a deep-frozen `g`.
- [ ] **Step 2: Run to see it fail.** `npx vitest run test/devices-specs.test.ts test/devices-menu.test.ts --maxWorkers=2`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement `specSheet`** per S6.
  - For each family in `HARDWARE_FAMILIES`: candidate lines are the lines of that family (via `infoOf`) that are not bundle or add-on; the best has the highest `effectiveQuality` (ties: later launch, then name).
  - Rivals are `ctx.rivals[i]` with `versions[i] >= 0`, `pull > 0` and not legacy (the rule `beaten` uses in `manage.ts`).
  - `terms = chipTerms(b, year)` and `going = localEcon(...).goingPrice`.
  - Rows: `scoreRow('perf', 'Performance', 'score', ...)`, `('quality', 'Quality', 'score', ...)`, `('price', 'Price', 'usd', -mine, field.map(negate), -prior)`. Price is negated so the cheapest ranks first.
  - `prior` is the same figure for the same line at `year - 1` (chip terms and reference at `year - 1`), or `mine` when `line.launched >= year`.
  - `specLines` returns `[scoreText(perf), scoreText(quality), scoreText(price, (n) => money(Math.abs(n)))]`. No rival name anywhere.
- [ ] **Step 4: Implement `devicesMenu`** per S6's row table, at most 12 children in this order.
  1. Header info row.
  2. Chips info row. Market: the text above. Own fabs: `You run ${plural(n, 'chip fab')}. Chips cost ${pct(cut)} less and run ${bump} points faster, which lifts quality by about ${lift}.` plus, with a booked `last`, ` At last year's volume that saves about ${money(saved)} a year.` (`saved` from `chipBook(b.last.cogs, terms.cut)`). Sister: `${name} makes your chips. They cost ${pct(cut)} less and lift quality by about ${lift}.` plus, with a `chipResultFor` record, ` It saved about ${money(saved)} last year.` (`bump` and `lift` to one decimal).
  3. The `build` node.
  4. The first line of `chipRows` as one info row (none when it returns nothing). P14.
  5. Platform info row.
  6. One sub-menu per family with a sheet (id `biz.devices.spec.${a.id}.${slug}`, where `slug` is the family lowercased with each run of other characters turned into `-`; emoji `\u{1F4F1}`, children three info nodes). With no family sheet, one info row `No device is on sale yet. Develop one under Products.` instead.
  - `disabledReason: (g) => manageBlock(g, a)`. The subtitle names the chip source and the fab count.
  - Everything reads `readBiz`, `marketCtxFor(g, b, g.year)` and `fieldFor`. Nothing is written. Then hook it in `businessView`.
- [ ] **Step 5: Run to see it pass.** `npx vitest run test/devices-specs.test.ts test/devices-menu.test.ts --maxWorkers=2`. Expected: all PASS.
- [ ] **Step 6: Regression.**
  - `npx vitest run test/voice-guards.test.ts --maxWorkers=2` (2.5 s; it only asserts `emDash` at 24 or fewer). Then `node scripts/voice-report.mjs --json`: `emDash` still 24 and `long` equal to Task 1's number, because no new text may pass 180 characters.
  - `npx vitest run test/talent-business.test.ts -t "gives finite plans and hints for every industry" --maxWorkers=2` (not timed): it renders every trade's company screen, now including this menu.
  - `npm run typecheck`.
- [ ] **Step 7: Commit.**
```bash
git add src/game/business/devices-specs.ts src/game/business/devices-menu.ts src/game/business/manage.ts test/devices-specs.test.ts test/devices-menu.test.ts
git commit -m "feat: devices spec sheets and the Devices & Chips screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

### Task 8: The story, the balance guards and the full check list (S11, S13)

**Files:**
- Test: `test/devices-story.test.ts` (create)
- Modify (only if a guard fails): the constants named in the failing guard, in `src/game/business/devices-data.ts` or the 2007 to 2013 anchors of `MARKETS.devices`

**Interfaces:**
- Consumes: everything above; `nextYear`, `adult`, `company` (`test/market-kit.ts`); `formGroup`, `toggleService`; `SCALE_SAVING` (`competition-core.ts`); `marketCtxFor`, `planFor`, `bestPlan`, `fabGain`, `buildFabAction`.
- Produces: nothing code-side.

- [ ] **Step 1: Write the story test** `test/devices-story.test.ts`. For seeds 3, 11 and 29, build three worlds identically in 2024: a US devices company grown with `outlets[0].count` until 2026 sales are about 2B (cash 1e10, quality 70), then
  - control (nothing built),
  - two fabs (built in 2025 and 2027 through `buildFabAction`),
  - a group with a stage-3 sister grown to booked revenue of at least 400e6 and a chip contract.

  Play 2024 to 2034 with `nextYear(g)`. On every seed and year assert:
  - nothing is NaN or infinite; quality is never above 98; `chipTerms(b, year).lift` is at most 6;
  - `chipCostFactor` is at least .895, and `(1 - SCALE_SAVING) x chipCostFactor` is at least .80 for every source;
  - by 2028 the fab world's unit cost is at most .96 of control's, and its `devicePerf` is above control's. Unit cost here is `planFor(g, b, g.year, { calm: true }).unitCost x costFactor(b, true)`, the figure `yearly.ts` reports: `planFor` alone never includes `costFactor`, which is applied when the year is booked;
  - the sister world's buyer holds a record stamped `g.year - 1` in every year from g.year 2026 (the first booked year comes first), and the sister's `capacityLoss` never exceeds .5 when read straight after `prepareInternalServices`;
  - a world with three fabs and a sister has one cut and a lift of at most 6;
  - the fab gains are in order: with `bestPlan` differences at 2026, the first fab's gain is above the second's, which is above the third's, and the third is below a tenth of the first. With two fabs built, the fab row's hint is "The savings alone take over 8 years to repay it." or "The savings don't cover the upkeep.", never the "repay it in about" text. Pin the measured 2026 US numbers in comments, within 20%. If saturation keeps the company's sales under 2B, use the largest company it reaches and write its measured sales in the comment: every assertion above is relative;
  - the 2013 over 2006 ratio of `marketCtxFor(...).pot` for a devices company lies between 2.0 and 3.2 (the smartphone history wave and the curve do not double count).
- [ ] **Step 2: Run it.** `npx vitest run test/devices-story.test.ts --maxWorkers=2`. Expected: PASS on the first run, because Tasks 1 to 7 built every piece; a failure names the constant to tune. If the fab order or the unit-cost bound fails, tune only `FAB_CUT` or `FAB_BASE`. If the 2013 band fails, tune only the 2007 to 2013 curve anchors in `MARKETS.devices`. Keep the structure and say what moved in the commit message. If another suite's pin moves, stop and report.
- [ ] **Step 3: The section 13 list, once.** One call:
  - `npx vitest run test/devices-data.test.ts test/devices-trade.test.ts test/devices-cast.test.ts test/devices-chips.test.ts test/devices-save.test.ts test/devices-os.test.ts test/devices-group.test.ts test/devices-specs.test.ts test/devices-menu.test.ts test/devices-story.test.ts test/business-expansion.test.ts test/market-roster.test.ts test/market-brands.test.ts test/economy-sectors.test.ts test/workshop-trades.test.ts test/heavy-data.test.ts test/tech-wave-data.test.ts test/product-ideas-new-trades.test.ts test/business-save-normalization.test.ts test/plan-search-reads.test.ts test/competition.test.ts test/business-financial-overhaul.test.ts test/conglomerate-v2-management.test.ts test/voice-guards.test.ts --maxWorkers=2`
  - Existing timings: 18.1, 5.6, 6.3, 1.7, 5.7, 6.5, 20.8 and 2.5 s. The rest are not timed.
  - Then `node scripts/voice-report.mjs --json` and compare `emDash` (24) and `long` with Task 1's numbers. Then `npm run typecheck`.
- [ ] **Step 4: Commit.**
```bash
git add test/devices-story.test.ts
git commit -m "test: devices story and balance guards" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```
Add `src/game/business/devices-data.ts` or `src/game/business/competition-data.ts` to the `git add` only if Step 2 tuned them.

---

### Task 9: Docs (S15 D8)

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `README.md`

**Interfaces:** consumes the names from Tasks 1 to 7; produces nothing code-side.

- [ ] **Step 1: ARCHITECTURE.md.**
  - In the Layout block add `business/devices-data.ts devices-specs.ts devices-menu.ts` (Device and Platform trade: chip terms, fabs, OS pull, spec sheets) after the `business/product-market.ts product-data.ts` entry.
  - Change the count in `Start/buy/run companies in N industries` to 56 (the tree may say 55 from release 1, or 51 if it is older).
  - After the Heavy R&D and Tech waves subsections (after `### Global market and real rivals` if they are absent) add `### Devices and chips (business/devices-*.ts)` covering:
    - the eight kinds and their `DEMAND` curves;
    - one chip source (`chipSource`: own fabs or one sister, the larger cut, never summed);
    - `BizState.fabs` and `BizState.chips` (optional, read by `normalizeBiz`, devices only, `SAVE_SCHEMA` stays 2);
    - the three hooks (`costFactor`, `evolve`, `bookYear`);
    - the fab as a fixed-price capex lever (`fabCost`, `fabUpkeep`, `buildFabAction`);
    - the sister path (the `valid()` chip branch, `assignChips` behind `groupServicesPrepared`, `settleChips` behind `groupServicesSettled`, the profit-neutral invoice, `internalRevenue`);
    - the OS pull (`osPull`, cap 3.0, it ages, rivals keep .75);
    - the spec sheets (`scorecard.ts`, `rivalPriceIndex`, no rival named).
- [ ] **Step 2: README.md.** Change `Choose from N company sectors.` to 56. Add one plain sentence after the AI lab benchmark sentence (or after the breakthroughs sentence if that is absent): `A device company compares its specs, price and quality with the market, builds chip fabs or buys chips from a sister company, and can lock customers in with an operating system.` No version number.
- [ ] **Step 3: Verify.**
  - `grep -c "### Devices and chips" docs/ARCHITECTURE.md` prints 1.
  - `grep -n "5[15] industr\|5[15] company" docs/ARCHITECTURE.md README.md` prints nothing.
  - `git diff -U0 docs README.md | grep '^+' | grep -v '^+++' | grep -c $'\xe2\x80\x94\|\xe2\x80\x93'` prints 0 (no em-dash or en-dash added; a changed line that already held one, such as an old ARCHITECTURE.md paragraph, shows up as a removed line only).
  - `npm run typecheck`, then `npx vitest run test/voice-guards.test.ts --maxWorkers=2` (2.5 s; docs are not scanned, so the run only proves nothing under `src/` moved).
- [ ] **Step 4: Commit.**
```bash
git add docs/ARCHITECTURE.md README.md
git commit -m "docs: devices and chips in the architecture notes, 56 trades" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

---

## Self-review (done when this plan was written)

- Spec coverage: S1 trade (Task 2), S2 chip core (Tasks 1, 4), S3 fabs (Task 4), S4 sister supply (Task 6), S5 OS (Task 5), S6 specs and screen (Task 7), S7 cast (Task 3), S8 heavy R&D, waves and news (Tasks 3, 4, 6), S9 every place the trade goes (Tasks 2, 3), S10 state and invariants (Tasks 4, 6, Global Constraints), S11 guards (Tasks 1, 4, 5, 6, 8), S12 text (Global Constraints, Tasks 4, 6, 7), S13 tests (every task, the list in Task 8), S14 risks (Task 1 preflight, Task 3 loop suites), S16 build order (kept; the ninth task is docs).
- Names used across tasks: `ChipSupply`, `ChipHolder`, `ChipTerms`, `chipSource`, `chipTerms`, `chipCostFactor`, `chipBook`, `kindReference`, `readFabs`, `readChips`, `capitalIndex`, `fabCost`, `fabUpkeep`, `buildFabAction`, `fabGain`, `osStrength`, `osPull`, `chipBlock`, `hasChipContract`, `chipResultFor`, `chipRows`, `DeviceSpec`, `specSheet`, `specLines`, `devicesMenu`, `DEVICE_ROWS`, `OS_FAMILY`, `HARDWARE_FAMILIES`, `LINE_PRICE`.
- Soft spots, each with a rule instead of a guess: first years that trip the anachronism check (P11), the calibration band (Task 2 tunes five numbers), the fab gain order and the 2013 wave band (Task 8 tunes named constants), release 1 to 3 signatures (Task 1 preflight, re-read before use).
