# AI Lab 2.0: capability scores, rival labs by year, a benchmark screen (design)

Date: 2026-10-19 · Status: designed, not implemented, plan at docs/superpowers/plans/2026-10-19-ai-lab-2.md (its decisions P1 to P9 refine this spec; where they differ, the plan wins) · Release 2 of 8

Builds on main v3.0.0 (HEAD `d061c0d`) and release 1, `2026-10-19-tech-waves-design.md` (its section 11 wins
where it differs). It adds `business/scorecard.ts`, the market scorecard that Silicon 2.0 (release 3) and
the ecosystem companies (release 4) reuse. Names marked (new) don't exist yet; every other name was checked
against v3.0.0, or against release 1's plan where it says so.

## What the player asked for

> (c) an AI lab that sees its latest model's benchmarks against the market and can research vision,
> coding and other capabilities before and beyond anyone else.

Success looks like this, in one play session:

1. Open the lab, then Benchmarks. Each capability shows your score, the market average, the best lab and
   your rank: "Coding 71. Market 64, best 78, rank 3 of 21."
2. Start a coding or vision research track, wait two years, train the next model, watch the score move.
3. Out-train the field in one capability before the market gets there. The first is recorded for the
   family, shows in the news as a wave, and an heir can't claim it again.
4. Watch a lead fade as rivals follow. Demand follows your lead over the best rival, not a calendar line.

Assumptions (mine): "the market" is the other labs on the world AI market (the roster), not a customer
survey. "Before and beyond anyone" is mostly a post-2026 thing, because the market's path before 2026 is
fixed history. A hired manager never picks a research track.

## What main has today (audit of v3.0.0)

- **One number per model.** `AiModel` (`deeptech-state.ts`) is `{ gen, name, score, open, year }`.
  `trainWin` (`deeptech-data.ts`, run when the `train` program wins) makes it:
  `frontierScore(year) - 38 + 0.35 level + 2 gen + min(12, 2 plant + 0.8 rented) + (roll - 0.5) x 16`,
  clamped 5 to 99, with one `x.roll()`. It never depends on earlier models or on a rival.
- **The frontier is a calendar line.** `frontierScore(year)` is `clamp(52 + 3 (year - 2020), 40, 99)`: flat
  40 through 2016, 70 in 2026, 99 from 2035. No rival lab has a score (rosters give rivals static `quality`
  and `tech` stars that never enter demand). A level-100 lab beats the line by about 9 + 2 gen, so it can't
  be out-scored, and past 2035 `competitiveness` tops out at 1.0 because both sides sit at 99.
- **Demand reads one best model.** `bestModel` (highest `score`) feeds `competitiveness`
  (`clamp((score - (frontier - 25)) / 25, 0.05, 1.6)`), `demandScale` (times it, and x0.75 when the best is
  open), `techPremium` (x1.15 at or above the frontier), the enterprise pitch odds
  (`0.15 + 0.45 competitiveness` in `aiNodes`) and its purple hint (`>= 0.9`).
- **'Hold' isn't stored.** The `deeptech.release` script (`RELEASE`) adds safety +15 and hype -5 on 'hold'
  and marks nothing, so a held model still counts as the best.
- **Two years, text only.** `trainWin` and `techPlan` take the fiscal year (`g.year - 1` in `yearly.ts`);
  `queueRelease`, `aiNodes` and `techMarketNote` use `g.year`, three points higher. All four print the same
  two numbers (score and frontier) as text, plus the last five models in `aiNodes`.
- **Programs.** `PROGRAMS.aiLab` has one-shot flat bonuses (`multimodal`, `agents`) that touch no score,
  plus the endless `nextgen`. `ProgCtx` is `{ t, countryId, year, roll, company }`. `deeptech-manager`
  fills up to 3 slots a year through `bestProgram`. Lab slots are `maxPrograms` (2 to 8).
- **Real labs exist as market-share rows** (`market-data-tech.ts`, about 32 `aiLab` rows). `rosterOf`,
  `activeRivals` and `rawPull` (`competition-roster.ts`) already say who is active and how strong, plus a
  seeded fictional tail. Rivals own no model. No wave or first records exist for deep tech; precedents are
  `workshop.firsts` (`recordFirst`, carried in `life.ts`) and `heavyWorldFlags`.

## Goal and non-goals

Goal: a lab sees honest, per-capability benchmark standing against modeled rival labs by year, can spend
research money to move one capability, and earns its demand from a lead over the best rival.

Not in this release: Silicon 2.0 and ecosystem companies (releases 3 and 4); Heavy R&D for deep tech
(release 5, `heavyEligible` still excludes it); per-model API prices or customers; Segments placement by
score (it stays price and `b.quality`); rival lab events and books; the seeded "AI winter" label that can
disagree with the real boom; new trades; a new `MinigameKind` (Benchmarks is a menu); release notes and the
version bump (integration).

## 1. Capabilities, ratings and benchmark generations

Eight capabilities, kept in a data leaf `business/ai-bench-data.ts` (new):

```ts
export const CAP_IDS = ['language', 'coding', 'vision', 'speech', 'reasoning', 'agents', 'robotics', 'science'] as const
export type CapId = (typeof CAP_IDS)[number]
export interface CapDef {
  id: CapId; label: string; emoji: string
  weight: number                        // share of the composite; the eight sum to 1
  era: 'deepLearning' | 'aiAssistants'  // a key of TECH in history/timeline.ts
  delay: number                         // years after TECH[era].invented that it opens
  anchors: readonly (readonly [number, number])[]   // [year, best rating] control points up to 2026
}
```

| id | label | weight | opens | anchors (year rating) |
|---|---|---|---|---|
| language | Language | 0.26 | 2012 | 2012 200, 2015 300, 2017 420, 2018 500, 2020 740, 2022 960, 2023 1060, 2024 1140, 2026 1260 |
| coding | Coding | 0.16 | 2021 | 2021 300, 2022 500, 2023 800, 2024 1040, 2025 1200, 2026 1320 |
| vision | Vision | 0.14 | 2012 | 2012 300, 2015 500, 2017 600, 2020 750, 2022 900, 2024 1100, 2026 1240 |
| speech | Speech | 0.10 | 2012 | 2012 300, 2015 480, 2017 600, 2020 740, 2022 940, 2024 1080, 2026 1180 |
| reasoning | Reasoning and math | 0.14 | 2014 | 2014 100, 2016 240, 2020 340, 2022 460, 2023 620, 2024 900, 2025 1120, 2026 1260 |
| agents | Agents | 0.10 | 2022 | 2022 200, 2023 300, 2024 540, 2025 840, 2026 1100 |
| robotics | Robotics control | 0.04 | 2016 | 2016 100, 2019 220, 2022 360, 2024 540, 2026 740 |
| science | Science | 0.06 | 2017 | 2017 100, 2020 340, 2022 520, 2024 740, 2026 960 |

"Opens" is `capOpen(cap)` (new), `TECH[era].invented + delay`: language, vision and speech use
`deepLearning` (2012) with delay 0, reasoning 2, robotics 4, science 5; coding uses `aiAssistants` (2022)
with delay -1; agents delay 0. Before a capability opens it has no rating and no weight, and the other
weights are scaled up to sum to 1 (`capWeight(cap, year)` (new)). The anchors are stylized history, labeled
modeled on screen.

**Rating.** An integer, 0 to 5000. 100 points is one doubling of odds against a test. The best rating in a
capability, `capBest(fam, cap, year)` (new): linear between anchors (as `arcMult` does), flat before the
first, and after `PRESENT_YEAR` (2026, `history/timeline.ts`) a seeded drift:

```
capBest(y) = capBest(y - 1) + max(5, round(55 x 0.97^(y - 2026) + 50 x (u - 0.5)))
u = seeded(`${fam}|aicap|${cap}|${y}`).next()          // seeded is in game/assets.ts
```

Neutral growth is about 53 points in 2027 and 20 by 2060, so the market keeps rising, more slowly. The year
is clamped to 2012 to 2200. History up to 2026 doesn't use `fam`; only the drift does.

**Benchmark score (0 to 99).** `benchScore(rating, hard) = clamp(round(100 / (1 + 2^(-(rating - hard) / 100))), 0, 99)`
(new). `hard` is the difficulty of the benchmark generation in force that year, `benchHard(fam, cap, year)` (new):

```
hard = capBest(open year) - 100                       // the first test puts the best lab near 67
for each year from open to y: while benchScore(capBest(year), hard) > 90: hard += 300   // a harder generation
```

A generation retires when the best lab would score above 90 on it. Checked offline on the anchors and the
neutral drift, the best lab's score stays between 53 and 90 for every capability through 2060, with 6 to 8
retirements each, so a lead always has room to show below the 99 ceiling. A score can fall with no change
to a model when a generation retires, so the screen says so (section 9). Comparisons across years use
ratings, never scores. The result is cached per (family, capability), extended on demand.

**Composite.** `score` on a model is `round(sum of weight x capability score)` over the capabilities open
in its year. The market compares in ratings: `composite = sum of weight x rating`.

**Milestones** for firsts (section 7): three per capability. `capMilestone(cap, k)` (new) is
`round to 50 of (capBest(2026) + [60, 200, 400][k - 1])`, so all lie above today's market and, on the
neutral drift, the market passes them around 2027-28, 2030-31 and 2034-35. `marketYear(fam, cap, k)` (new)
is the first year `capBest` reaches it.

## 2. The market: rival labs by year

`capFrontier(fam, cap, year)` (new, `business/ai-bench-market.ts`, pure) returns `null` before the
capability opens, else:

```ts
export interface LabRow { id: string; name: string; modeled: boolean; rating: number }  // modeled = a real lab
export interface CapFront { cap: CapId; year: number; best: number; score: number; leader: LabRow; rows: readonly LabRow[] }
```

- **Who is on the board.** `rosterOf(fam, 'aiLab', 'world')` filtered by `activeRivals(roster, year)`, with
  pull `w = rawPull(marketDef('aiLab'), r, year)`. A lab is on the board when `w` is at least a tenth of the
  strongest lab's, which keeps the field at about 25 labs in 2026 (12 in 2013, 21 in 2020). Real labs (`Rival.real`) get `modeled: true`.
- **Strength.** For lab r and capability c: `delta = 220 x (1 - sqrt(w / wMax)) + 160 x (s - 0.5)` with
  `s = seeded('aiLab|' + r.id + '|' + cap).next()` (the specialty, fixed per lab and capability, no family).
  Ratings are `capBest - (delta - min delta over the board)`, so the top lab in each capability sits exactly
  on `capBest` and different labs lead different capabilities. Real labs rise and fall only with their arcs
  through `rawPull` and leave when the roster says so. A row is a rating and a rank, never a claim about
  the company.
- **Composite.** A lab's composite is its weighted rating sum over the open capabilities; the best rival
  overall is the highest. Both are cached in bounded `Map`s (the `rosterCache` pattern, 600 entries) keyed
  `fam|cap|year` and `fam|year`. No state is read or written.

**Catch-up (the lead is earned and fades).** `labStanding(fam, t, year)` (new) puts the lab on the same
board. Rivals follow a released model: from `m.year + 2` (`m.year + 1` for open weights) the best rival's
rating in a capability is at least `max(0, m.rating[c] - 70)`, taking the largest over every released
model `m` of the lab (so a newer, weaker model never undoes an older catch-up). Every rival rises by the
same amount, `max(0, floor - leader rating)`, so the order of the board doesn't change. A
lead of up to 70 over the market costs nothing; beyond that rivals close in. It is part of `labStanding`, so
`capFrontier` stays pure in `(fam, cap, year)`.

```ts
export interface LabStanding { year: number; model: string; composite: ScoreRow; caps: ScoreRow[]; lead: number; leader: LabRow | null }
// year: the one year every number is for; caps: one row per open capability; lead: composite rating minus
// the best rival's, after catch-up; leader: the best rival overall
```

`labStanding` scores `bestModelAsOf(t, year)` (new, `deeptech-data.ts`: the strongest unheld model with
`m.year <= year`) and returns `null` without ratings. `ScoreRow.trend` compares the same model's ratings one
year earlier on this year's test, so a retired generation doesn't read as a fall.

## 3. State, reading and saving

```ts
export type CapMap = Partial<Record<CapId, number>>
export interface AiModel {
  gen: number; name: string; score: number; open: boolean; year: number
  rating?: CapMap   // per capability open in `year`; missing on models trained before 2012 or before 4.0
  held?: true       // held back at release: not sold, not scored, no first, no catch-up
}
// TechState gains (deeptech-state.ts):
caps: CapMap        // research levels from finished capability programs, 0 to 20 each
firsts: string[]    // claim keys this lab holds, `${CapId}.${1|2|3}`, at most 24
```

- `readModel` keeps `rating` only for known ids and finite integers 1 to 5000 (the key is dropped when
  empty) and `held` only when `=== true`. `readTech` rebuilds `caps` (known ids, integer 0 to 20, zeros
  dropped) and `firsts` (unique, well-formed, at most 24). `readTech` stays the only whitelist.
- `TECH_VERSION` goes from 3 to 4, so `techOf` re-normalizes an old `b.tech` on first use (it only does so
  when `v !== TECH_VERSION`) and no action meets `undefined` caps. Silicon 2.0 adds its fields under
  version 4 and does not bump again: 4.0.0 is one unreleased release, so no saved v4 exists yet.
- `AiModel.score` is frozen at training (for a rated model, the composite score on that year's test).
  The 10 stored and 12 read models and `modelGens` are unchanged.
- **World state.** `g.flags.aiFirsts` (new) is `Record<string, { year: number; lab: string }>` (at most 24 keys,
  each a milestone key). `readAiFirsts(g)` (new) validates it; `benchWorldFlags(g)` (new, next to
  `heavyWorldFlags` and release 1's wave carry in `life.ts`) hands it to heirs. The Time Machine restores
  snapshots with their flags, so a claim made after a jump back disappears with the abandoned future.
- `SAVE_SCHEMA` stays 2. Old saves: no `rating` keeps the old formulas for that model (section 6); no flag
  means no claims.
- **No stored series.** The yearly series on the screen is derived: for each year since the first model (at
  most 12), `labStanding` of the models that existed then against the pure market, with their current
  `held` and `open` flags. Nothing is saved, so nothing migrates.

## 4. Training a model

`trainWin` keeps its single `x.roll()` and its position in `train`'s win, so `g.rng` use is unchanged.
`ProgCtx` gains two optional fields, set by `advancePrograms` (`deeptech-rd.ts`) and absent in tests that
call `def.win({ t, countryId, year, roll, company })` directly:

```ts
fam?: string                                           // familyId(g.lifeId)
rival?: (year: number) => { composite: number; score: number; leader: string; modeled: boolean }
```

`rival(year)` is the best rival on that year's board after catch-up from the lab's earlier releases, the
same board `labStanding` uses (`advancePrograms` builds it from `ai-bench-market.ts`).

Without `fam`, or for `x.year < 2012`, `trainWin` uses today's formula and writes no `rating` (the legacy
path). Otherwise, for each capability open in `x.year`, a pure `modelRating(...)` (new, `ai-bench.ts`, shared
with the research hint) gives:

```
raw   = capBest(year) - 320 + 2.7 level + 15 min(gen, 8) + 9 compute + 20 caps[c] + spec + 120 (roll - 0.5)
ref   = max(capBest(year), best released rating of this lab in c)       // held models don't count
rating = raw <= ref ? raw : ref + 90 (1 - e^(-(raw - ref) / 90))      // nobody leads by more than 90 on one model
spec  = 70 (seeded(`${fam}|aispec|${gen}|${c}`).next() - 0.5)          // zero mean, no rng draw
```

`compute = min(12, 2 plant + 0.8 rented)` as today. The constant 320 puts a typical lab where today's formula
does: level 70, gen 6 and 3.6 compute is `capBest - 9` before the roll, about two score points above the
old line (the calibration test in section 13 pins the demand it earns). A level-100, gen-8, full-compute lab
is `+178` raw and lands at `capBest + 78`; the old formula put it 25 score points over the line with no
ceiling. Ten research levels add 200 raw and the ceiling holds it at +89.

The model stores `rating` and the composite `score`. Level +5 and stage at least 1 stay. Hype keeps its
three tiers, now read from the lead over the best rival composite on this year's board
(`x.rival(x.year)`): `+20` when the model leads, `+8` when it is within 60 rating points, else `+2`. The
line, a lab-report note (the training line isn't a log line, but it stays under 120 characters):

> Nova 4 finished training and scored 74. The best rival scores 79. It's close to the best.

The other endings are "It leads the field." and "It trails the best." Rival names appear only on the
Benchmarks screen, next to the "(modeled)" tag.

## 5. Capability research

One program per capability, built by a factory `capProgram(cap)` (new, in `deeptech-data.ts` beside
`nextGenDef`) and pushed into `PROGRAMS.aiLab`. Ids are `cap.language`, `cap.coding` and so on.

| Field | Value |
|---|---|
| years, odds | 2 and 0.65 (`programTerms` still applies the 0.5x to 3x budget and `finalOdds` the skill) |
| cost (US$ a year) | `3_000_000 x 1.4^caps[c]`: about 16M a year with 5 levels done, 87M with 10 |
| `ipShare` | 0.3, as `nextgen`: patents book `min(spent, nominal) x 0.3`, so no valuation pump |
| `unlocks` | none: `deeptech-autopilot.test.ts` pins the flagged set to train, api and enterprise |
| gate | `caps[c] >= 20`: "Fully researched." No model with a rating in `c`: "Train a model that covers it first." |
| win | `caps[c] += 1`; `level +1` for the first three levels of a capability; hype +4. Line: "Coding research reached level 4. Your next model will use it." |
| lose | `level +1`. Line: "Coding research stalled. The same level costs the same again." |

The gate reads stored models, not the year, because `ProgramDef.gate(t, countryId)` has no year, and it
does the era job: a capability is researchable once a model trained after it opened exists. Research feeds
the next training run only and never rewrites a model, so there is nothing to stockpile. The one-shots
`multimodal` and `agents` stay and gain a head start: `multimodal` sets `caps.vision` and `caps.speech` to at
least 2, `agents` sets `caps.agents` to at least 3.

**Slot pressure, decided.** Tracks share the lab's slots: no new pool, `maxPrograms`, `MAX_PARALLEL` and
the 8 programs `readTech` keeps don't change. Two rules keep train, api and cluster from being crowded out.
(1) A `ProgramDef` gains an optional `track: CapId`. `programBlock` (`deeptech-rd.ts`) refuses a track when
the lab already runs `max(1, floor(maxPrograms / 3))` of them, counted through `programDef(...).track`: one
at 2 to 5 slots, two at 6 to 8 ("Your lab can research 1 capability at once."). (2) `bestProgram` skips any
def with `track`, so `deeptech-manager`, the Lab Report's "start this" choice (`nextStep`) and the lab menu's
"best value" hint never pick one, and a hired manager's lab keeps the plain training formula. The manager
still finishes a track already running (the filter at the end of its turn keeps ids that `programDef`
knows). The lab menu skips `track` defs under "Start a program" and points to Benchmarks instead.

**Hint.** Each track row shows the Business-talent hint "Fund this one. It moves your standing most per
dollar." only for the track with the best `bestCapTrack` (new) score: the weighted rating gain of one more
level on the next model (`modelRating` at `roll = 0.5`, `spec = 0`, so it reveals neither) over the
first two years' cost. It reads the same pure function the win uses.

## 6. A lead over the best rival drives demand

`competitiveness(t, year, fam)` gains `fam` as a required argument (the compiler then finds every caller:
`demandScale`, `aiNodes`, the pitch action and its hint). `demandScale(b, t, year, fam)` does too, and its
two callers in `deeptech-core.ts` (`techPlan`, `sellable`) have `g`.

```
best = bestModel(t)                       // unheld; rated models outrank unrated, then by rating strength
no best -> 0;  best has no rating or year < 2012 -> today's formula, exactly (frontierScore line)
else lead = labStanding(fam, t, year).lead
     competitiveness = clamp(1 + lead / 190, 0.05, 1.6)
techPremium: 1 + 0.15 x clamp(lead / 150, 0, 1)   for a rated best model (unrated: today's x1.15 test)
```

190 rating points play the part of the old 25 score points (7.6 per score point, close to the slope of a
test between scores 70 and 80), so the mapping is the old one in a new unit: lead 0 is 1.0, lead +21 is
1.11, lead -130 is 0.32, and a maxed lab (+116 over the best rival) clamps at 1.6. `bestModel` changes in two ways: it
skips `held` models, and it compares rated models by `modelStrength` (new, `ai-bench.ts`: the base-weight
sum of `rating`, missing = 0) because scores from different test generations aren't comparable. With no
rated model it is exactly today's "highest score". Its return type widens to `AiModel | null`.

The demand weights are the composite weights, so one number drives `techPlan`, the Annual Report,
`bestTechPlan` and the manager. The enterprise pitch odds (`0.15 + 0.45 competitiveness`) and hint (`>= 0.9`,
which is 55.5%) stay the same code on a better input. No demand or valuation term is added: the AI boom
event, the `aiLab` size curve and the seeded `industryCycle` already lift 2023 to 2030.

## 7. Firsts, world state and waves

`claimFirsts(g, a, b, t, m)` (new, `business/ai-bench-claims.ts`) runs when a model is released, not
trained, because a held model isn't public. It is called from three places: the `RELEASE` script's closed
and open branches, the new held-model release action (section 8), and `afterResearch` for a lab the
player doesn't run (no popup, never held), right after release 1's `announceBreakthroughs`. For each
capability `c` in `m.rating` and each milestone `k` with `m.rating[c] >= capMilestone(c, k)`:

1. skip when `readAiFirsts(g)` already has `${c}.${k}` (any lab, any life of the family);
2. skip unless `year < marketYear(fam, c, k)`, with `year = max(m.year, benchYear(g))`, so the market wins a tie and a
   model held for years can't claim what the market has passed since (a normal release has `year = m.year`);
3. otherwise record `aiFirsts[key] = { year, lab: a.name }`, push the key on `t.firsts`, `hype +12`,
   `brand +4`, `premium +0.01` (premium is capped at 1), one log line
   ("Acme AI reached 1450 in coding before any rival."), and
   ``announceWave(g, { kind: 'ai', source: 'deeptech', origin: `${a.id}#first.${c}.${k}`, name: `Frontier ${label.toLowerCase()}`, size: 0.2 + 0.1 k, market: 'world', home: b.countryId })``.

The claim stands even when `announceWave` returns `null` (release 1 refuses a third non-rival wave in a
year). The wave and its notice are the only extra news, so there is no second popup. Release 1's
frontier-model wave has a different origin (the asset id plus `#model` plus the gen). Its
`announceBreakthroughs` tests `m.score >= frontierScore(m.year)` for 'ai'; for a rated model this release
replaces that with "the model's lead on its own year's board is above 0 and no earlier model of the lab
had one" and keeps the old test for unrated models. `won` ids of the form `cap.<id>` map to nothing in
`DEEPTECH_WAVES`, which is intended. No foresight: the screen shows a milestone's market year only when it
is at or before the benchmark year; until then the row says it is open.

## 8. Release, 'hold' stored, one year argument

- `queueRelease` (`deeptech-sim.ts`) reads the model's own year and its own board: "Nova 4 scored 74 on the
  2026 benchmarks. The best rival scored 79." The choice labels stay; the text says plainly that closed
  earns API money, open wins fans and hype but undercuts the API, and a held model earns nothing and stays
  off the scoreboard until released. The `costsSales` rule and both hints stay on `bestModel`.
- `RELEASE` on 'hold': `m.held = true` as well as safety +15 and hype -5. Notice: "Nova 4 goes through more
  red-teaming. It earns nothing and stays off the scoreboard until you release it." On closed and open it
  calls `claimFirsts`. A lab whose only model is held has no best model, so it sells nothing until it
  releases: that is the cost, and the text says so.
- A held model gets one action in Compute & Models, "Release Nova 4" ("Held back. It earns nothing until you
  release it."). It runs under `dtAct`, so the action-level check is inside `run`, clears `held`, logs,
  revalues and calls `claimFirsts`. Open-sourcing stays the existing action on the best model.
- **One explicit year.** Every function in `ai-bench*.ts` takes `year` and never reads `g.year`.
  `benchYear(g)` (new) is `Math.round(g.year) - 1`, the last closed fiscal year, which is also what
  `trainWin` stamps and what `MarketState.history` records. The release popup, the training line, claims
  and the derived series use the model's `m.year`. Menus, the Annual Report note and the profile line use
  `benchYear(g)` and say "as of 2026". Demand uses the plan year that `techPlan` already passes. So
  "state of the art at training" and "solid at release" can no longer disagree. The family seed is
  `familyId(g.lifeId)`, as the rosters use, so rival rows match the Market & Competition screens.

## 9. The Benchmarks menu and the other lines

`benchMenu(a)` (new, in `deeptech-menu.ts`, beside `labMenu`, `fundingMenu` and the Compute & Models
screen that `aiNodes` fills) is returned by `deepTechNodesImpl` for `aiLab` only. Its rows come from
`deeptech-bench.ts` (new, pure builders over `techView`, so menus never touch `g.rng` or state; the rows are
wrapped as menu nodes in `deeptech-menu.ts`, where `programRow` is private). At most 16 rows:

1. Header: "Scores are your best released model on 2026's tests. Tests get harder near the top, so a score can
   fall while your model doesn't change."
2. Overall row (the composite `ScoreRow`) and "Best lab: Google (modeled)." when real.
3. One info row per open capability: `scoreText(row)` plus `trendArrow(row.trend)` (from `market-view.ts`)
   and a `spark` (same file) of your composite score over the derived series.
4. A "Firsts" heading and up to three rows: "First to 1450 in coding: you, 2029.", "Open: 1300 in vision. No lab has
   reached it.", "A rival reached 1300 in language in 2027."
5. A "Research" sub-menu with one `programRow` per open capability.

Other lines, all built in `deeptech-bench.ts` so they share one source: `aiNodes` (the frontier line becomes
"Benchmarks as of 2026. Nova 4 scores 74, the best rival scores 79. You rank 3 of 21. Competitiveness 111%."),
`techMarketNote` ("Nova 4 scores 74; the best rival scores 79. You rank 3 of 21.", under 100 characters
because release 1 raises the note limit only to 520), `deepTechSummaryImpl` ("best model Nova 4 (score 74,
rank 3 of 21)") and the release and training lines. Legacy models keep today's wording, with `frontierScore`
read at the model's own year. Strings follow `docs/VOICE.md`: contractions, no em-dash (the guard sits at
its cap of 24), logs at most 90 characters, outcomes 120, scenes 140. Real labs carry the "(modeled)" tag as
on Rival Profiles, and the pitch-failure text keeps its generic "a rival".

## 10. scorecard.ts

`business/scorecard.ts` (new) is a pure leaf with no imports. Exactly:

```ts
export interface ScoreRow { id: string; label: string; unit: string; mine: number; market: number; best: number; rank: number; of: number; trend: -1 | 0 | 1 }
export function scoreRow(id: string, label: string, unit: string, mine: number, field: readonly number[], prior?: number): ScoreRow
export function scoreText(row: ScoreRow, fmt?: (n: number) => string): string
```

- `field` is everyone else; non-finite entries are dropped, a non-finite `mine` reads as 0. `market` is the
  mean of `field` (0 when empty). `best` is `Math.max(mine, ...field)`, the best on the board, yours
  included, so "best" and "rank 1" never disagree. `rank` is 1 plus the number of field values strictly above
  `mine` (ties share the better rank). `of` is `field.length + 1`.
- `trend` compares `mine` with `prior` (0 when `prior` is undefined or non-finite): 1 above `prior + 0.5`,
  -1 below `prior - 0.5`, else 0. The caller passes `prior` in the same unit and on the same scale.
- `scoreText` returns `` `${label} ${fmt(mine)}. Market ${fmt(market)}, best ${fmt(best)}, rank ${rank} of ${of}.` ``
  with `fmt` defaulting to rounding. With an empty field it returns `` `${label} ${fmt(mine)}. The market has no figures.` ``
  (no sentence opens with "Nobody"). A field of [78, 75, 70, 66, 64, 60, 55, 44] with `mine` 71 gives exactly
  "Coding 71. Market 64, best 78, rank 3 of 9."
- Nothing here knows about labs. Silicon 2.0 passes price, performance and quality rows and the ecosystem
  companies device metrics; `fmt` lets a caller print money or ratings.

## 11. Invariants, determinism and performance

| Invariant (FEATURE-ROADMAP) | How it holds |
|---|---|
| No foresight | Menus show only years up to `benchYear(g)`; the track hint uses the mean roll and no spec; claims alone reveal a future market year |
| Deterministic | One `x.roll()` in `trainWin`, no other draw. Reads use `seeded` keys on the family id. The finish roll of a track is the existing `chance(g, finalOdds)` and only happens when a track runs |
| Accounting | Research is paid through the existing program spend; claims give no cash |
| Authorization | Track start is `programBlock` inside `startProgram`; the release action runs under `dtAct`; the `RELEASE` script re-finds the asset |
| Optional state, SAVE_SCHEMA 2 | `rating`, `held`, `caps`, `firsts` and `aiFirsts` are optional and normalized by `readModel`, `readTech` and `readAiFirsts` |
| Yearly idempotence | No new yearly hook. Wins land in `advancePrograms` behind the existing `b.last.year >= fiscal` skip; claims are idempotent by key |
| Pure presentation, bounded | Menus read `techView` and pure functions; the only mutable thing is a cache. 12 models, 8 caps, 24 firsts, 24 flag keys, 600 cache entries |
| Truthful copy, honest hints | Hold text says what hold costs, the header says tests harden, real labs are tagged modeled; the pitch, release and track hints each read the function that resolves the action |

Performance: `bestTechPlan` calls `techPlan` hundreds of times and each call reaches `competitiveness`.
After the first call for a (family, year) the best rival composite is a cache hit, so a call costs eight
multiplications and a loop over at most 12 models; a test counts that 1,000 calls build the board once.

## 12. Balance guards

| Risk (audit) | Guard |
|---|---|
| A maxed lab can never be out-scored | The 90-point ceiling over `max(capBest, released)`, catch-up after 2 years (1 for open), real arcs on the rival side, and a rank among about 25 labs |
| Saturation at 99 | Benchmark generations; scores sit at 53 to 90 for the market's best, so a lead stays visible |
| Hype farming by retraining | Same three tiers as today, now from a lead that can't compound; hype decays 15% a year; firsts are 24 ever |
| Valuation pump | No new valuation multiplier; track `ipShare` 0.3; premium +0.01 per first; waves reach valuation only through release 1's clamped `industryCycle.wave` |
| Hoarding by holding, open weights | Held models are out of `bestModel`, `released`, claims and catch-up, so nothing compounds in secret and nothing sells. Open weights still cost x0.75 demand and rivals follow in 1 year |
| Level pump and slot crowding | `level +1` only for the first three levels of a capability (24 at most); one track per 3 slots, never auto-picked |
| Double counting with the boom | `competitiveness` changes meaning, nothing is added on top; premium stays at most x1.15 |
| Old labs break | Unrated models and years before 2012 use the old formulas untouched |

## 13. Tests

New files under `test/` (the plan adds the exact cases):

- `scorecard.test.ts`: the sample line, rank ties, empty field, non-finite input, the trend threshold, `best`
  with and without the player on top, `fmt`, `field` left unmutated.
- `ai-bench.test.ts`: data completeness (weights sum to 1, anchors sorted, opens match `TECH`), `capBest`
  interpolation and drift (same seed same path, families differ, 2200 clamp), the best lab's score between
  50 and 92 for every capability and year to 2100, `benchScore` bounds, retirements monotone.
- `ai-bench-market.test.ts`: only active labs, the leader sits on `capBest`, real labs carry `modeled`, an
  exited lab is absent, catch-up at lag 2 and 1, 1,000 calls build the board once, and `JSON.stringify(g)`
  and `g.rng` are unchanged after every read.
- `ai-bench-save.test.ts`: `readTech` and `readModel` on junk (strings, negatives, unknown ids, huge numbers),
  a v3 save through `techOf`, `TECH_VERSION` 4, junk `aiFirsts` reads as empty, `benchWorldFlags` carries.
- `ai-bench-train.test.ts`: the formula at fixed inputs, the ceiling, exactly one roll drawn, the legacy path
  for no `fam` and for 2011, `bestModel` ordering with ratings, without, and with `held`, and a calibration:
  in 2026 a level-70, gen-6 lab has competitiveness 0.95 to 1.25, a level-100 full-compute lab 1.25 to 1.6,
  a level-40 lab 0.2 to 0.5 (tune the offset 320 if not).
- `ai-bench-research.test.ts`: ids unique, gates, one track per 3 slots, `bestProgram` and `nextStep` never
  return a track, a managed lab never starts one but finishes a running one, win and lose effects, the cost
  curve, `ipShare`, the hint names one track.
- `ai-bench-claims.test.ts`: a first is claimed once, an heir can't re-claim, the market wins a tie, a held
  model claims nothing until released and nothing once the market has passed its milestones, a managed lab
  claims at training (in release 1's writer test file), `announceWave` gets kind 'ai', a refused wave still records.
- `ai-bench-menu.test.ts`: the Benchmarks menu at every stage, at most 16 rows, no NaN, voice lengths, no
  em-dash, the trend after a retirement, the derived series length.

Existing files that must keep passing: `deeptech.test.ts` (`TECH_VERSION` near line 563, menu purity near 660
to 709, the long first test), `deeptech-autopilot.test.ts` (the pinned `unlocks` set, id uniqueness),
`deeptech-review.test.ts` (release hints near 355 to 395, unrated models), `market-events.test.ts`,
`competition.test.ts` (unrated injected models near lines 104 and 411), `growth.test.ts` (cluster gate near
708), `business-save-normalization.test.ts`, `deeptech-new-trades.test.ts`, `deeptech-fusion.test.ts`,
release 1's `tech-waves-writers.test.ts` and `voice-guards.test.ts`. Tests set in 2000 stay on the legacy
path; `playLab` in `PRESENT_YEAR` takes the new one, so its assertions are bands, not exact values.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Balance drifts from the old demand | The calibration test; the offset 320 and the divisor 190 are starting numbers, the structure is fixed |
| Import cycle: `competition-data.ts` imports `deeptech-data.ts` | `deeptech-data.ts` imports only the roster-free `ai-bench.ts` and `ai-bench-data.ts`; roster code lives in `ai-bench-market.ts` and reaches `trainWin` through `ProgCtx.rival` |
| Both releases edit `deeptech-rd.ts` and `deeptech-sim.ts` | Tasks 1 to 5 don't need release 1; integration merges the files; task 6 starts after release 1 lands |
| Seeded tests shift | One roll, legacy path before 2012 and without `fam`, tracks add finish rolls only when started |
| Real-brand claims | Modeled tag, ratings only, no events, no negative text |
| `bestModel` widening and hold stopping sales | Return type `AiModel` or `null`, callers read existing fields only; the popup, the notice and the menu row all say what hold costs |
| Anchors are stylized | They are data, tagged modeled, and the plan checks each against a source |

## 15. Build order

Each task runs `npm run typecheck` and its test files only, never the full suite.

1. `scorecard.ts` and `scorecard.test.ts`; then `ai-bench-data.ts` and `ai-bench.ts` (`capOpen`,
   `capWeight`, `capBest`, `benchHard`, `benchScore`, `capMilestone`, `modelRating`, `modelStrength`)
   with `ai-bench.test.ts`.
2. State: `AiModel` and `TechState` fields, `readModel`, `readTech`, `TECH_VERSION` 4, `bestModel`,
   `bestModelAsOf`; `ai-bench-save.test.ts`, `business-save-normalization.test.ts`, `deeptech.test.ts`.
3. `ai-bench-market.ts` (`capFrontier`, `labStanding`, `benchYear`, `marketYear`, caches); its test.
4. `trainWin`, `ProgCtx`, `advancePrograms`, `competitiveness`, `demandScale`, `techPremium` and callers;
   `ai-bench-train.test.ts`, `competition.test.ts`, `deeptech-review.test.ts`.
5. `capProgram`, `programBlock`, `bestProgram`, the lab menu skip, the head starts on `multimodal` and
   `agents`; `ai-bench-research.test.ts`, `deeptech-autopilot.test.ts`, `growth.test.ts`.
6. `ai-bench-claims.ts`, `RELEASE` and `queueRelease`, the held-model action, `benchWorldFlags` in `life.ts`,
   the `afterResearch` call and release 1's frontier-model test; `ai-bench-claims.test.ts` and release 1's
   writer tests.
7. `deeptech-bench.ts`, `benchMenu`, `aiNodes`, `techMarketNote`, `deepTechSummaryImpl`;
   `ai-bench-menu.test.ts`, `deeptech.test.ts`, `voice-guards.test.ts`.
8. A short ARCHITECTURE.md section and a README line. Release notes and the version bump wait for integration.
