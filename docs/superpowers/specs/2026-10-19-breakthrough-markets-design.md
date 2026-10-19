# Tech waves: markets that react to breakthroughs (design)

Date: 2026-10-19 · Status: design approved, not implemented · Piece 1 of 4

## What the player asked for

1. The other Special Careers (actor, astronaut, model, musician, politician, military, influencer,
   hustler, author...) should get systems as big as Business, without becoming nonsensical.
2. All industries should expand, meaning both the Special Careers and the 35 business sectors that
   only have the generic engine.
3. More R&D for every kind of company: low-tech, mid-tech, high-tech and breakthroughs.
4. Markets should react to breakthroughs the way they do in real life.

Decision: all four are wanted, as separate specs, plans and releases, in this order:

| Piece | What | Depends on |
|---|---|---|
| 1 | Tech waves: breakthroughs move markets (this document) | nothing |
| 2 | R&D for every company tier | 1 (its breakthroughs write waves) |
| 3 | Business sector families (the 35 generic-only sectors) | 2 (each family gets R&D programs) |
| 4 | Special careers expansion, one career or family at a time | 1, and bridges into 3 |

This document covers piece 1 only. Pieces 2 to 4 each get their own brainstorm and spec.

## What the audit found

Read-only survey of the code before design (v2.4.0, HEAD `dbde39f`):

- There is no breakthrough event anywhere in the code. A deep-tech win, an AI model release or a
  Workshop history-race first changes only the originating company's own state (hype, premium,
  boost, valuation) or the player's fame. No rival, supplier, incumbent, listed stock, VC term sheet
  or regulator reacts.
- Real history reaches markets through two hand-authored tables that never talk to each other:
  `history/market-events.ts` (companies: demand, costs, valuation multiple) and
  `history/markets-us.ts` / `markets-world.ts` (listed stocks). Listed stocks never read
  `market-events.ts`.
- The old "World-Changing Breakthrough" (+1100% on every open exchange) was removed on purpose in
  v2.2.0 (LIVING-WORLD.md) in favour of adoption- and sales-gated effects. This design does not
  bring it back.
- There are three unsynchronized market clocks from 2026 on: the investment engine's `indexMove`,
  the economy simulation's `market` factor, and the player-listed company's own `exchangeMove`.
- Real episodes with no market story: the radio, TV and PC booms, mRNA vaccines (2020-21), GLP-1
  drugs (2021-24), the 2020 EV boom, reusable rockets, the solar and battery cost collapse.

## Goal and non-goals

Goal: when something breakthrough-class happens, the markets that real life would move do move,
together and consistently, for the player's companies, NPC and rival companies, VC funding and
listed stocks.

Non-goals (not in piece 1): new R&D kinds (piece 2); sector layers for the generic industries
(piece 3); careers (piece 4); pricing options with waves; invented crashes; new screens.

## 1. The wave record and who writes it

A tech wave is one plain-JSON record.

```ts
interface TechWave {
  id: string          // `${source}:${kind}:${year}:${n}`, stable and unique
  kind: string        // key of WAVE_KINDS (roles come from the table, not the record)
  name: string        // news name, e.g. "Frontier AI"
  source: 'player' | 'rival' | 'race'
  year: number        // announcement year
  country: string     // home country (the originator's)
  size: number        // 0-1, how disruptive
  hype: number        // 0-1, what investors expect
  delivery: number    // 0-1, what has actually shipped and sold
  last: number        // last year advanced (idempotence marker)
  origin?: string     // asset id (player) or rival id
  mature?: number     // consecutive years mature
}
```

`WAVE_KINDS` is a data table: each kind (ai, chips, drug, space, ev, automation, quantum,
security, and so on) lists its **core**, **supply** (suppliers and complements) and **disrupted**
(incumbents) industries by id, from the 51 industries. Roles are per industry, so the existing rule
that each industry belongs to one exposure group in `market-events.ts` is untouched.

Two kinds of wave:

- **History waves** are static rows in a new pure table, `history/tech-waves.ts`, beside
  `market-events.ts`: kind, years, a hype and delivery curve by year, home countries. No state. The
  starting set is the episodes with no market story today: transistor (1947-60), television
  (1946-60), microprocessor and home computers (1975-85), mobile phones (1983-2000), smartphones
  (2007-13), cloud (2006-15), solar and battery cost collapse (2010-20), reusable rockets
  (2015-22), the EV boom (2019-22), mRNA vaccines (2020-21) and GLP-1 drugs (2021-24). Years and
  role assignments are verified against sources when the plan is written. Episodes that already
  exist as market events (dot-com boom and crash, the 2020 digital shift, the AI boom) are not
  duplicated as waves, so nothing is counted twice.
- **Dynamic waves** live in `g.flags.techWaves`, a bounded array (at most 64) that is replaced,
  never edited in place, following the `marketBreakthroughs` pattern in `invest/shocks.ts`. The key
  is added to the heir whitelist in `life.ts`. A reader validates and bounds every entry.

All dynamic writers call one function, `announceWave(g, {kind, source, origin, size, country})`,
which is idempotent by id. The sources:

- **The player.** Only breakthrough-class milestones write a wave: each deep-tech industry marks 1-3
  of them in its data (a frontier AI model release, quantum supremacy, an approved drug, a reusable
  booster and so on). Routine program wins never write waves. Workshop history-race firsts and the
  13-item fictional future race also write waves, at a smaller size (0.2-0.6). Piece 2's
  breakthrough tier will use the same function. At most 2 player waves a year.
- **Rivals.** A seeded hash of family id, industry and year decides whether a rival lands a
  breakthrough. It is pure and bounded: about one per sector every 8 to 10 years in expectation, so
  the future is never one endless bubble. The player sees it as news.
- **The future race** items in the Workshop catalog use `source: 'race'` and the rival rules.

## 2. How a wave plays out

Two numbers move over time. Hype is what investors expect. Delivery is what has actually shipped.
Nothing runs on a calendar.

**Announcement.** `hype = 0.3 + 0.7 × size`, `delivery = 0`.

**Each year** (once, behind the `last` marker):

- Delivery. For a player wave it moves toward a target taken from the originating company's booked
  sales in the sector relative to the market's leaders, by at most 0.25 a year: a company that
  really sells grows delivery, one that does not, does not. For rival and race waves it moves by
  `0.08 + 0.22 × u` where `u` is a seeded uniform draw from `family|wave id|year`, with a 25%
  chance of a stall year (no movement) that cools hype.
- Hype. `hype += (delivery − hype) × k` with `k = 0.30` when delivery is ahead and `k = 0.45` when
  it is behind. A wave whose delivery stalls loses its premium faster than one that delivers
  gains it.

**Reaction.** For each live wave, each industry in a role, in a country:

```
r     = size × (0.6 × hype + 0.4 × delivery)          // 0 to 1
reach = 1 at home; otherwise 0.35 + 0.4 × delivery    // adoption spreads abroad
core:       value ×(1 + 0.35 r)   demand ×(1 + 0.30 size·delivery)   costs ×(1 − 0.10 size·delivery)
supply:     value ×(1 + 0.17 r)   demand ×(1 + 0.20 size·delivery)
disrupted:  value ×(1 − 0.05 r − 0.20 size·delivery)   demand ×(1 − 0.25 size·delivery)
```

Each term is scaled by `reach` (`1 + reach × (f − 1)`). Factors of several waves multiply, then
combine with the history events and the base market, and the combined result is clamped to the
bounds the market events already use: value 0.3-3, demand 0.45-1.8, costs 0.75-1.5. These values
are starting points to tune in tests; the clamps and the structure are fixed.

**Shakeout, not a schedule.** If delivery lags hype, hype decays toward delivery and the premium
unwinds: a bubble bursts because the breakthrough did not deliver. A cliff exists only where
delivery created it, never because a year arrived.

**Entrants.** When delivery crosses 0.25, 0.5 and 0.75, one fast-follower rival can enter the core
market, up to 3 per wave per market, in countries where reach is at least 0.5. It goes through the
roster code that founds emerging-market rivals today, so a market's rivals and its size curve
stay consistent.

**Settling.** A wave that has been mature (delivery of at least 0.9 and within 0.05 of hype) for 5
years is folded into a permanent per-industry factor, `g.flags.techBase` (demand 0.8-1.5, costs
0.8-1.0), and removed from the list, so a finished wave leaves a larger sector, not a cliff. A wave
whose delivery is still below 0.1 after 6 years is dropped with no permanent effect.

## 3. Who reads the waves

All readers use one pure function, `waveFactors(industry, country, year, waves)`, which returns
demand, cost and value factors. It is cached by the identity and length of the waves array, like
`shocks.ts`, and is combined with `marketEventFactors` in one place. The existing global
`marketEventFactors` cache stays free of game state.

| Reader | Where | Effect |
|---|---|---|
| Company demand and costs (player, NPC, rival, deep tech, studios) | `dynamics.nationalMarket` after its seeded cache, and `economy.marketCtxFor` after `buildCtx` | Demand and cost factors on top of the national market. |
| Company valuation | A factor stamped on the company at its year-end booking, as `tech.value` is | `valuationOf` stays independent of game state; the company's value reflects the wave as of its last booked year. |
| VC and deep-tech hype | `deeptech-core.industryCycle` | The one place feeding term sheets, push odds, plan demand, premium, hype drift and tech value, so VC rounds and IPO mood stop disagreeing. |
| Rivals | `economic-actors.advanceActor` and `npc-rivals` | Fast followers enter; disrupted incumbents shrink. |
| Listed stocks (dynamic waves only) | A sector-scoped term beside `shockFactor` and `indexShockFactor` | See below. |
| National economy | `economy.recordEconomicActivity` | Each year `0.1 × size × delivery gain` goes in as `innovation` for the core industry, under the existing caps. Waves that came from the Workshop skip this, because the Workshop already feeds it. |
| Regulators | `antitrustChance` | A scrutiny multiplier of `1 + 0.5 × size × delivery` for the player's companies in a core sector. |
| News and UI | See section 5 | Announcement and per-company effect. |

**Listed stocks.** A table maps each engine sector id to at most one industry (or none), with a test
that every engine sector is covered. The wave's value factor for that industry applies to the
quote as a level, the way a shock does, and reaches quotes, holdings, funds, the Investing talent's
read and the player-listed company. Rules:

- History waves feed companies only. In years the stock tables already cover, listed stocks follow
  the real sector rows, so the same boom is never applied twice. Each new history episode comes with
  its stock-side sector row (`markets-us.ts`) where one is missing, and a test checks that a history
  wave never changes a stock quote in a covered year.
- Dynamic waves feed companies and stocks, in any year.
- Option premium sampling stays on the procedural distribution and never sees waves. Settlement
  uses the quoted price, as it does for shocks.
- `invest/instinct.ts` includes waves in its read and in its cache key, so the Investing talent's
  honest 80% gut read of next year's engine moves stays honest.

**One market clock (prerequisite cleanup).** From 2026 on, `economy.exchangeMove` for the
player-listed company uses the same `indexMove(timelineFamily, exchangeInfo, year)` as
`fund-model.ts`, so the player's listed company, the stocks and the investment firms all feel the
same wave. History years are unchanged.

## 4. Determinism, saves and performance

- Reads never use `g.rng`. Rival draws use a stable seeded hash of the family id (the life id
  without its `-gN` suffix), the industry and the year. Business-year outcomes use `outcomeTag`, so
  a Time Machine fork rerolls only the unfinished year.
- `industryCycle` seeds with the life id while `nationalMarket` and the rosters use the family id.
  Waves use the family id. Whether `industryCycle` itself should change is verified when the plan
  is written.
- Old saves: no `techWaves` flag means no waves. Nothing is paid or refunded. History waves apply
  from the next year played, as in v2.4.0. A malformed array loads as empty.
- Nothing is invented for the future: dynamic waves come only from real simulated breakthroughs.
  The quiet-year pins in `test/market-events.test.ts` (1950, 1965, 1986, 2005, 2018, 2031, 2045)
  stay valid because waves live beside `marketEventFactors`, not inside it.
- Performance: `planFor` calls `nationalMarket` per outlet and `bestPlan` searches hundreds of
  trials, so `waveFactors` is cached per (industry, country, year) for a given waves array, and
  `test/plan-search-reads.test.ts` must keep passing unchanged.
- Storage: at most 64 live waves and a bounded `techBase`, so saves cannot bloat.

## 5. News and UI

- `announceMarketEvents` in `business/yearly.ts` gains a sibling for waves: one notice per new wave
  that touches the player's companies or came from them, with a deterministic notice id. Other waves
  become a news line only.
- Each company's Annual Report and Market & Competition screen show its own effect, for example
  "Frontier AI wave: demand +9%, value +14%, because ...".
- Stock quotes carry a sector-wave tag in the market line. No new screens.

## 6. Insider trading on your own breakthrough

A position opened or enlarged in a wave's core or supply sector by its originating founder or CEO
in the 12 months before the announcement is insider trading. It uses the existing Abuse of Power
machinery in `special/politics.ts` (the `InsiderCase` record, the `insiderTrades` counter and the
exposure scripts). That machinery's position-finding helper is private to politics today, so it is
extracted into a shared module and both features call it.

## 7. Tests

- Pure `waveFactors` tests: the clamps, the phase order, each role's effect, a premium that holds
  when delivery matches hype and unwinds when it does not, and stacking with market events inside
  the clamps.
- Determinism: the same seed gives the same waves, and a read leaves `JSON.stringify(g)` and the
  random stream untouched.
- Integration: a player deep-tech win moves a rival, a listed stock and a VC term sheet; option
  premiums are unchanged; the insider rule fires; a history wave never moves a stock in a covered
  year; every engine sector is mapped.
- Old-save loading and malformed `techWaves` and `techBase` values.
- Completeness over every wave kind's role ids (all must be real industry ids) and the
  anachronism lint for new text.
- The existing suites keep passing: `market-events`, `plan-search-reads`, `history-markets`,
  `invest-safety`, `deeptech`, `business-save-normalization` and the fuzz tests.

Baseline: `npm run typecheck` passes (about 7 s). `npx vitest run` passes with 197 files and 3403
tests (1 skipped) in about 34 minutes, so the plan uses targeted subsets while working and the full
suite once before the PR.

## 8. Docs and release

An ARCHITECTURE.md section ("Tech waves"), a README line, and release notes for the next minor
version that point to this file, following the v2.4.0 pattern.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Double counting a boom | History waves skip episodes already in `market-events.ts`; stocks skip history waves; one combined clamp. |
| Positive feedback (wave raises margins, which raises valuation, which feeds macro innovation, which lowers costs) | Every link is annual and clamped; the macro feed is small and under existing caps. |
| Insider and exploit risk | Section 6; no scheduled fades; waves in the Investing read stay honest. |
| Three market clocks | The single-clock cleanup in section 3. |
| Predictable crashes | Shakeouts come only from delivery shortfalls, never from the calendar. |
| Seed-pinned tests shifting | Waves add no RNG draws; rival waves use hashes, not `g.rng`. |
| Realism versus gameplay | The numbers are starting points; the structure and clamps are what the tests pin. |

## 10. Decisions refined while writing the spec

These differ slightly from the sectioned design that was approved in chat; they are flagged for the
spec review.

1. History waves live in a new table beside `market-events.ts` instead of new exposure groups inside
   it. Waves already carry per-industry roles, and this leaves the existing exposure groups and
   their pinned tests alone.
2. History waves feed companies only, while dynamic waves also feed stocks. The stock tables already
   encode the real story in covered years.
3. Settling (the permanent `techBase` factor) was added so a finished wave leaves a larger sector
   instead of a cliff.
