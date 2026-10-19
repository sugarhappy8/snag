# Tech waves: breakthroughs move company markets (design)

Date: 2026-10-19 · Status: re-based on v3.0.0, pending spec review, not implemented · Release 1 of 8

This replaces the first draft, `2026-10-19-breakthrough-markets-design.md` on branch
`claude/fervent-cerf-1iuzn5`, which was written against v2.4.0. Section 9 lists what changed.

## What the player asked for

1. The other Special Careers (actor, astronaut, model, musician, military, influencer, hustler,
   author) should get systems as big as Business, without becoming nonsensical.
2. All industries should expand: the Special Careers and the 35 business trades that only have the
   generic engine.
3. More R&D for every kind of company: low-tech, mid-tech, high-tech and breakthroughs.
4. Markets should react to breakthroughs the way they do in real life.
5. Three additions: (a) a semiconductor company that sells GPUs and similar chips below the market
   price in 2024-2027 wins customers over; (b) an ecosystem company (phones, laptops, VR, AR,
   desktops, an OS) that gets better and cheaper with its own fabs or a semiconductor sister
   company, with performance, quality and price shown against the market average; (c) an AI lab
   that sees its latest model's benchmarks against the market and can research vision, coding and
   other capabilities before and beyond anyone else.

## The program

Each release gets its own spec, plan and pull request. The order below is the recommended one.

| # | Release | State on main v3.0.0 | Still to build |
|---|---|---|---|
| 1 | Tech waves (this document) | Heavy R&D writes a per-trade breakthrough record; rivals follow; the trade's demand rises | Valuation, VC, supplier and disrupted trades, deep-tech, Workshop and rival breakthroughs, real episodes, news surface |
| 1b | Tech waves: stocks | Nothing reaches listed stocks | Sector-scoped stock reaction, the insider rule, one market clock |
| 2 | AI Lab 2.0 (5c) | One score per model; the frontier is a function of the year | Capability scores and research, rival labs by year, benchmark screen |
| 3 | Silicon 2.0 (5a) | One "chips" unit at one price | GPU lines, one market price, price to goodwill in 2024-27 |
| 4 | Ecosystem companies (5b) | Nothing | Devices and OS, sister-fab supply, metrics against the market |
| 5 | R&D 3.0 | Heavy R&D, 111 lab programs | Process and automation R&D, patents, credits, research teams |
| 6 | Sector families | 35 generic-only trades | About 10 families |
| 7 | Careers | Politics 2.0 | Actor, astronaut, model, music, military, influencer, hustler, author |

Releases 2 to 4 share one missing piece, a market scorecard (performance, quality and price against
the market average). It is built with the first release that needs it.

## What main has today (audit of v3.0.0, HEAD `d061c0d`)

- **Heavy R&D (v2.7.0, `business/heavy-rd.ts`, `heavy-data.ts`).** A successful breakthrough in a
  classic trade writes a `HeavyRecord` to `g.flags['heavy.<trade>|<market>']` (`heavyKey`,
  `readHeavy`, `addHeavy`), carried to heirs by `heavyWorldFlags`. `marketCtxFor` multiplies the
  trade's market potential by `heavyPulse` (+10% to +26% per record, a 3-year ramp, held to year 8,
  capped at +40%). Rivals follow on `heavyArrival`. `pushMarketNews` posts a text-only item,
  `MarketNews` in `history/market-events.ts`, which only Products > Heavy R&D shows. It reaches 39
  trades: deep tech (12), finance (3) and game studios are excluded by `heavyEligible`.
- **Not reached by any breakthrough:** `valuationOf` (it can't see game state), VC term sheets
  (`industryCycle`), other trades, listed stocks, NPC and rival companies' own books, regulators.
- **Deep-tech wins** change only the company's own `TechState`. `ProgCtx` has no game state, so a
  win cannot write a flag; `afterResearch` in `deeptech-sim.ts` has it.
- **History** reaches companies only through the 15 `MARKET_EVENTS` and the stock tables. There is no
  tech episode (transistor, TV, smartphone, mRNA, GLP-1, reusable rockets, the EV boom) in either.
- **`invest/shocks.ts` `marketBreakthroughs`** is the retired +1100% repricing. `addMarketBreakthrough`
  has no caller. The rule that replaced it (v2.1.1, v2.2.0) is adoption- and sales-gated, sector
  specific effects. This design follows that rule.
- **Trades:** 55 (25 base, 18 expansion, 12 deep tech). `SAVE_SCHEMA` is 2 and every recent release
  added only optional, validated fields.
- **Roadmap invariants** (`docs/FEATURE-ROADMAP.md`) apply: no foresight, deterministic runs,
  accounting conservation, action-level authorization, optional and normalized new state, yearly
  idempotence, pure presentation, bounded state, truthful copy. New text follows `docs/VOICE.md`.

## Goal and non-goals

Goal: when something breakthrough-class happens, the company markets that real life would move do
move, together and consistently: demand, valuation, VC funding and rivals, for the player's
companies, NPC companies and rival companies.

Not in this release: listed stocks, funds and the player-listed share price (release 1b); the insider
rule and the one-market-clock cleanup (also 1b); new R&D kinds (release 5); AI, chip and device
systems (releases 2 to 4); option pricing with waves; invented crashes; new screens.

## 1. The wave record and who writes it

```ts
interface TechWave {
  id: string          // `${source}:${kind}:${year}:${n}`, stable and unique
  kind: string        // key of WAVE_KINDS (roles come from the table, not the record)
  name: string        // news name, e.g. "Frontier AI"
  source: 'heavy' | 'deeptech' | 'workshop' | 'rival' | 'race'
  year: number        // announcement year
  market: string      // 'world' or a country id, as competition-core marketKey
  size: number        // 0-1, how disruptive
  hype: number        // 0-1, what investors expect
  delivery: number    // 0-1, what has actually shipped and sold
  last: number        // last year advanced (idempotence marker)
  origin?: string     // asset id, heavy key or rival id
  skipCore?: boolean  // true for heavy waves: heavyPulse already lifts the core trade
  mature?: number     // consecutive years mature
}
```

`WAVE_KINDS` is a data table. Each kind (ai, chips, drug, space, ev, automation, quantum, security,
fusion and so on) lists its **core**, **supply** (suppliers and complements) and **disrupted**
(incumbents) trades by id, from the 55 trades. Roles are per trade, so the one-exposure-group rule in
`market-events.ts` is untouched.

**History waves** are static rows in a new pure table, `history/tech-waves.ts`, beside
`market-events.ts`: kind, years, a hype and delivery curve by year, home countries. No state. The
starting set is the episodes with no company story today: transistor (1947-60), television
(1946-60), microprocessor and home computers (1975-85), mobile phones (1983-2000), smartphones
(2007-13), cloud (2006-15), the solar and battery cost collapse (2010-20), reusable rockets
(2015-22), the EV boom (2019-22), mRNA vaccines (2020-21) and GLP-1 drugs (2021-24). Years and
roles are verified against sources when the plan is written. The dot-com boom and crash, the 2020
digital shift and the AI boom already exist as market events and are not repeated as waves.

**Dynamic waves** live in `g.flags.techWaves`, a bounded array (at most 64) that is replaced, never
edited in place, read through a validating reader like `readHeavy`. A `waveWorldFlags` function next
to `heavyWorldFlags` carries them, and the settled-sector factors (section 2), to heirs in
`life.ts`. Nothing is stored for an old save: no flag means no waves.

All writers call one function, `announceWave(g, {kind, source, origin, size, market})`, which is
idempotent by id and refuses a wave that would exceed the caps. The writers:

- **Heavy launches.** `advanceHeavy` (the pioneer's launch, where `announceLaunch` already runs)
  writes a wave only for catalogue entries listed in a small `HEAVY_WAVES` table (for example a
  liquid-cooled GPU hall or an autonomous agent platform). A conveyor sushi belt stays local. These
  waves set `skipCore`.
- **Deep-tech breakthrough-class milestones.** Each deep-tech trade marks 1 to 3 in its data (a
  frontier model release, quantum supremacy, an approved drug, a reusable booster, fusion net
  energy). `afterResearch` and the release and event scripts call `announceWave`. Routine program
  wins never do. At most 2 player waves a year.
- **Workshop.** History-race firsts (`beatHistory`) and the 13-item future race, at size 0.2 to 0.6.
- **Rivals.** A seeded hash of family id, trade and year decides whether a rival lands a
  breakthrough. It is pure and bounded: about one per sector every 8 to 10 years in expectation.
  The player sees it as news.

## 2. How a wave plays out

Two numbers move over time. Hype is what investors expect. Delivery is what has shipped and sold.
Nothing runs on a calendar.

**Announcement.** `hype = 0.3 + 0.7 × size`, `delivery = 0`.

**Each year** (once, behind the `last` marker):

- Delivery. For a wave a company wrote, it moves toward a target taken from the originating
  company's booked sales in the trade relative to the market's leaders, by at most 0.25 a year.
  For rival and race waves it moves by `0.08 + 0.22 × u`, where `u` is a seeded uniform draw from
  `family|wave id|year`, with a 25% chance of a stall year that cools hype.
- Hype. `hype += (delivery − hype) × k`, with `k = 0.30` when delivery is ahead and `0.45` when it
  is behind.

**Reaction.** For each live wave, each trade in a role, in a market:

```
r     = size × (0.6 × hype + 0.4 × delivery)          // 0 to 1
reach = 1 at the wave's market; otherwise 0.35 + 0.4 × delivery
core:       value ×(1 + 0.35 r)   demand ×(1 + 0.30 size·delivery)   costs ×(1 − 0.10 size·delivery)
supply:     value ×(1 + 0.17 r)   demand ×(1 + 0.20 size·delivery)
disrupted:  value ×(1 − 0.05 r − 0.20 size·delivery)   demand ×(1 − 0.25 size·delivery)
```

Each term is scaled by `reach` (`1 + reach × (f − 1)`). For waves with `skipCore`, the core row's
demand and cost terms are dropped, because `heavyPulse` already lifts that trade. Factors of several
waves multiply, then combine with the history events and the base market, and the combined result is
clamped to the bounds the market events already use: value 0.3 to 3, demand 0.45 to 1.8, costs 0.75
to 1.5. These numbers are starting points to tune in tests; the clamps and the structure are fixed.

**Shakeout, not a schedule.** If delivery lags hype, hype decays toward delivery and the premium
unwinds, so a bubble bursts because the breakthrough did not deliver. A cliff exists only where
delivery created it, never because a year arrived.

**Entrants.** For waves that do not come from Heavy R&D, when delivery crosses 0.25, 0.5 and 0.75
one fast-follower rival can enter the core market, up to 3 per wave per market, through the roster
code that founds emerging-market rivals. Heavy waves already have rivals follow on `heavyArrival`,
so they add none.

**Settling.** A wave that has been mature (delivery at least 0.9 and within 0.05 of hype) for 5
years is folded into a permanent per-trade factor, `g.flags.techBase` (demand 0.8 to 1.5, costs 0.8
to 1.0), and removed, so a finished wave leaves a larger sector, not a cliff. A wave whose delivery
is still below 0.1 after 6 years is dropped with no permanent effect.

## 3. Who reads the waves in this release

All readers use one pure function, `waveFactors(trade, market, year, waves)`, which returns demand,
cost and value factors. It is cached by the identity and length of the waves array, as `shocks.ts`
does, and combined with `marketEventFactors` in one place. The global `marketEventFactors` cache stays
free of game state.

| Reader | Where | Effect |
|---|---|---|
| Company demand | `economy.marketCtxFor`, beside `heavyPulse` | The wave's demand factor multiplies the market potential. NPC-owned companies and the player's other companies in the trade follow, since they read the same context. |
| Company costs | The path that applies the market-event cost factor in `dynamics.nationalMarket` | Cost factors for core, supply and disrupted trades. |
| Company valuation | A mood stamped on the company when `bookYear` closes its year, in an optional `BizState.wave` | `valuationOf` stays independent of game state. A company's value reflects waves as of its last booked year, as it does for market events. |
| Deep-tech valuation and VC | `deeptech-core.industryCycle` | The one place that feeds term-sheet heat, push odds, plan demand, premium, hype drift and tech value, so VC rounds and the valuation agree. Deep-tech trades do not use the `BizState.wave` stamp, which avoids counting twice. |
| Rivals | The economic-rival and NPC-rival advance steps (`economic-actors.advanceActor`) | Fast followers grow and disrupted incumbents shrink. |
| News | `pushMarketNews` with id `wave-<id>`, announced once like `announceLaunch` | One notice per new wave that touches the player's companies or came from them. The Annual Report and Market & Competition screens gain read-only lines such as "Frontier AI wave: demand +9%, value +14%", computed from `waveFactors`. |
| National economy | `economy.recordEconomicActivity`, token `wave:<id>:<year>` | A small `innovation` amount for the core trade each year, under the existing caps. Workshop-origin waves skip it, since the Workshop already feeds it. |
| Regulators | `antitrustChance` | A scrutiny multiplier of `1 + 0.5 × size × delivery` for the player's companies in a core trade. |

## 4. Determinism, saves and performance

- Reads never use `g.rng`. Rival draws use a stable seeded hash of the family id (the life id without
  its `-gN` suffix), the trade and the year. Business-year outcomes use `outcomeTag`, so a Time
  Machine fork rerolls only the unfinished year.
- `industryCycle` seeds with the life id while `nationalMarket` and the rosters use the family id.
  Waves use the family id. Whether `industryCycle` itself should change is verified in the plan.
- Old saves: no `techWaves` flag means no waves; `SAVE_SCHEMA` stays 2. New fields (`techWaves`,
  `techBase`, `BizState.wave`) are optional, validated and bounded by their readers, and
  `BizState.wave` is whitelisted in `normalizeBiz`. A malformed array reads as empty. Nothing is paid
  or refunded. History waves apply from the next year played.
- Nothing is invented for the future: dynamic waves come only from real simulated breakthroughs. The
  quiet-year pins in `test/market-events.test.ts` stay valid because waves live beside
  `marketEventFactors`, not inside it.
- Performance: `planFor` reads the market context per outlet and `bestPlan` searches hundreds of
  trials, so `waveFactors` is cached per (trade, market, year) for a given waves array.
  `test/plan-search-reads.test.ts` must keep passing unchanged.
- Storage is bounded: at most 64 live waves, a bounded `techBase`, and the existing 20-item news list.

## 5. Text

News and report lines follow `docs/VOICE.md`: a plain narrator, short sentences, contractions, no
encouragement, no em-dashes, no disclaimers outside Settings > About, within the length caps (log 90,
outcome 120, scene 140). `test/voice-guards.test.ts` and `scripts/voice-report.mjs` check this.

## 6. Tests

- Pure `waveFactors` tests: the clamps, phase order, each role's effect, a premium that holds when
  delivery matches hype and unwinds when it does not, and stacking with market events and
  `heavyPulse` inside the clamps.
- No double counting: a heavy-origin wave leaves core demand at exactly the `heavyPulse` value.
- Determinism: the same seed gives the same waves, and a read leaves `JSON.stringify(g)` and the
  random stream untouched.
- Integration: a deep-tech milestone writes a wave; a supplier trade's demand, a VC term sheet's heat
  and a company's valuation move; an NPC-owned company in the trade follows; rival waves are
  reproducible from the seed.
- Old-save loading, malformed `techWaves`, `techBase` and `BizState.wave`.
- Completeness: every role id in `WAVE_KINDS` is a real trade; every `HEAVY_WAVES` key is a real
  catalogue entry; the history table's quiet years are neutral.
- The suites that must keep passing: `market-events`, `plan-search-reads`, `heavy-data`, the Heavy
  R&D tests, `deeptech`, `business-save-normalization`, `voice-guards` and the fuzz tests.

Baseline on v3.0.0: `npm run typecheck` passes in about 8 seconds. `npx vitest run` passes with 5,216
tests (2 skipped) across 288 files in about 40 minutes, so the plan uses targeted subsets while
working and the full suite once before the pull request.

## 7. Docs and release

An ARCHITECTURE.md section for Tech waves (the file still has no Heavy R&D section, so a short one is
added), a README line, and release notes for the next minor version with a "Not in this release"
section naming stocks, the insider rule and the market clock. It follows the v2.9.0 pattern.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Double counting with Heavy R&D | `skipCore` on heavy waves, and a test that pins core demand to `heavyPulse`. |
| Double counting with market events and the deep-tech cycle | Waves carry no event already in `MARKET_EVENTS`; deep tech reads waves only through `industryCycle`; one combined clamp. |
| Positive feedback (demand, then valuation, then macro innovation, then costs) | Every link is annual and clamped; the macro feed is small and under the existing caps. |
| Predictable crashes | Shakeouts come only from delivery shortfalls, never from the calendar. |
| Hot path cost | Memoised `waveFactors`; the plan-search test guards the read counts. |
| Seed-pinned tests shifting | Waves add no `g.rng` draws; rival waves use hashes. |
| Realism versus gameplay | The numbers are starting points; the structure and clamps are what tests pin. |

## 9. What changed from the first draft

1. It builds on Heavy R&D instead of beside it: Heavy records stay the source of the core trade's
   demand lift, and only table-listed launches write a wave.
2. Listed-stock reactions, the insider rule and the market-clock cleanup moved to release 1b, by the
   player's decision. The roadmap's open investment-accounting defects (C-03, C-04, C-12) and the
   player-listed company's separate share-price path make the stock side a release of its own.
3. Valuation reads a stamp written at year booking, because `valuationOf` still cannot see game state.
4. Deep-tech writers go through `afterResearch`, because `ProgCtx` cannot write flags.
5. Numbers updated: 55 trades, SAVE_SCHEMA 2, 5,216 tests, `docs/VOICE.md` applies.
6. Kept from the first draft: the wave record, hype versus delivery, the reaction formulas and
   clamps, settling, the new history table beside `market-events.ts`, and no calendar-driven crashes.

## 10. Open items for the plan

- Which deep-tech programs and events count as breakthrough-class (1 to 3 per trade).
- The `HEAVY_WAVES` table: which catalogue entries ripple.
- Years and role assignments for the history episodes, checked against sources.
- Roles for the four newest deep-tech trades (fusion, neurotech, drones, carbon removal).
- Whether `industryCycle`'s life-id seed should become the family id.
