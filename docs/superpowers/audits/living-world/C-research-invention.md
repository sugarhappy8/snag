# Area C: invention and research of all types (audit digest)

## 1. What exists today

About 30,000 lines do research-like work. Each system has its own formula; none share inputs.

| System (files, lines) | What decides the outcome today |
|---|---|
| Product R&D (`business/rd.ts` 490, `products.ts`, `product-market.ts`) | Fixed price per product (`rdCost`, never cash). Budget k = 0.5-4x buys odds `1-(1-p0)k^-0.4`, years `base/sqrt(k)`, quality `+28(1-k^-0.8)`. `p0 = launchP` = .25 + ceoSkill/250 + quality/300 + .1 quality staff + .03 team. One `chance()` per project. Best-built (money, staff, owner skill, ceilings), but no labor, ambition or fatigue, and a flop teaches nothing. |
| Heavy R&D (`heavy-rd.ts` 582) | 8x classic price, 4-6 years, odds .55 x launchP, 5-year cooldown. A win writes a world record: demand curve, rival arrivals, market lift, a wave. |
| Lab, R&D 3.0 (`lab-*.ts` 1,598) | 9 Operations programs. Track level caps .95, fades 5% a year, each win worth .8 of the last (a real learning curve). Up to 6 scientists (+.03 odds, x.7 each). Patents shield 3-6 years. |
| Deep tech (`deeptech-*.ts` 7,182) | Fixed odds per program (train .82). Budget k .5-3, times (.75 + techSkill/200), pace lean/steady/blitz (blitz costs only money). Failure banks 25% of spend as IP. |
| AI Lab (`ai-bench*.ts` 622) | `modelRating` sums level, generation, compute, research and a roll, with a soft ceiling at market best + 90. Capability research: $3M x 1.4^level, flat 65%. The cleanest ceiling. |
| Studio engines (`gamestudio-engines.ts`) | The only labor-driven build: progress = (devs/needed)^.8, no failure roll. |
| Workshop (`workshop/` 3,123) | Quality centre = 18 + .55 skill + .15 smarts + 20 genius - 10(difficulty-1) + 3 per build; 3 builds a year is the limiter. Ideas from a fixed catalog (160+ everyday, 34 history, 13 future); rival deadlines are a real year or a hash. Money buys parts only. |
| School (`education.ts` 3,965) | Grades pull toward smarts x .5 + 45 at .35 plus randInt(+-6). "Study Harder" 3 times a year, +3-8. No thesis, no researcher or professor career. |
| Skills (`mindBody`, `athlete`, `sports-*`, `dev-learn`, kit) | Each rolls its own gain. 339 `useYearAction` throttles are the de-facto effort model. `household.ts` holds fatigue 0-100 and a "Push my career" priority (strain +10). |
| Government, military, world | `research` and `space` budget lines multiply demand and growth only (`fundingIndex` sets astronaut seats). Military is a rank ladder: no weapons or secrecy. World tech is a calendar (`TECH`, `medicalYear` flat after 2026, `capBest` drift). Player breakthroughs make waves but never move `hasTech`, medicine or `capBest`. |

Thin spots: the player has no ambition (NPCs have `NpcLife.ambition`, `driveOf`). Rival R&D is hash arithmetic (`riseOf`, `heavyArrival`). Three unrelated patent systems.

## 2. Gaps against the owner's requirement

1. Staff, labor, money and ambition appear in different mixes. Labor is real only in studio engines; ambition nowhere.
2. No fatigue or burnout for founders, scientists or students.
3. Failure is mostly wasted; luck is unexplained ("flopped in testing").
4. Study and practice are yearly counters, so ambition, tutors and coaches can't matter.
5. No accumulated knowledge except lab levels.
6. Rivals never race; no spillover, secrecy or leaks.
7. Invention covers products only: no medicine, software, weapons, art, sports technique, financial instruments. Governments research nothing.
8. After 2026 world technology is frozen to the calendar; invention doesn't feed it.

## 3. Design: one Effort Engine

Pure folder `src/game/effort/` (about 2,500 lines): engine, factors, actor, world. No RNG, no money movement.

**Task** (fixed by the product, never cash): `{ field, cost, hardness, baseYears, ceiling, kmax, mode: project | practice | study }`. `rdCost`, `HEAVY_COST_X`, `opsPrice`, `BUILD_COST`, tuition and lesson prices become `Task.cost` unchanged.

**Input** per year: `people[]` (fte, skill, morale, drive, fatigue), `k` = spend / task.cost (a ratio, so cash can't be passed in), `knowledge` 0-100, `tools` 0-1 (lab, plant, compute, instrument, coach, school tier), `posture` lean | steady | push, `u` (uniform from the caller).

**Record** (about 10 numbers, optional `fx` on RdProject, TechProgram, workshop note, enrollment): progress, quality, spent, hours, setbacks, insight, fatigue, `last` year (idempotence).

**Functions.** `quote(task, input)` returns odds, years, quality, cost and `why[]`; pure, no luck. `step(task, input, rec, year)` takes `u`, returns outcome (fail | partial | works | hit), margin, cause, learned. Each project still draws one `g.rng` number in today's order.

**Production function** (diminishing returns, real ceilings):
- Effort `E = L^.8 x q x (1 + .3 tools) x rho(A, posture) x phi(F)`. L is capped by `cap(1 - e^(-N/cap))` (too many cooks). q = skill x trait x morale, as `leadershipPower` does. Progress = E/E_ref/baseYears x k^.5, with a `minYears` floor.
- Money keeps today's exponents per task type, hard clamp k <= kmax (4). It buys odds and speed, never a lower price.
- Quality uses the AI-bench ceiling: `Q = ceiling - room x e^(-(raw-ref)/room)`, ceiling = world frontier + headroom.
- Odds are a sigmoid of named terms (skill gap, ln k, tools, knowledge, ambition variance, fatigue, rival pressure, hardness). Each is a labelled line: "Odds 62%: team +9, funding +7, hard field -12, tired -4". Area H decides how exact it shows.
- Knowledge K per field grows `(1-K/110)^1.3`, fades 5% a year idle. Failure banks .35 x progress as K and `ipBook`, worth at most +15 odds points next time.

**Ambition** = a slow trait A 0-100 plus an annual posture. Player: derived `ambitionOf(g)` = .5 willpower + .3 discipline + talent bonus + a stored shift in owner-stamped `g.flags['effort.you']` (wins +.4, burnout -1). No new `HiddenKey`, so no migration. NPCs: `NpcLife.ambition`, `driveOf`. Staff: derived from `STAFF_TRAITS`. Companies: board mandate sets default posture (`RD_PER_YEAR` already does).
- Benefit: `rho = .85 + .30 (A/100) x postureFactor`, at most +25%, concave. A also widens variance (bolder tasks, wider spread, explosion and shortcut risk).
- Cost: push adds strain +10 a year (household constant), overtime pay, and a scandal hazard ~ A x pressure. Default A 50 steady gives rho = 1.

**Burnout**: `F' = .78F + overtime x .65 + posture strain`; `phi = 1 - .004 max(0, F-35)`. Player F is the existing `householdView().fatigue`; staff use morale. At F >= 85 someone quits or the founder is sidelined. Failures carry a cause: dead end, starved budget, team churn, shortcut, rival first.

**Persons**: a yearly pool of about 12 focus weeks replaces counters. Three lessons = three weeks, so today's numbers hold; overdoing it becomes fatigue.

**Migration without surprise**: each system sets `p0`, years, exponent and talent factor to today's numbers; the engine adds only deviations from defaults (A 50, steady, no fatigue, K 0). A golden parity suite (old function vs `quote`, within 1 point, over an input grid) gates each step. Order: Product R&D (`launchP` is the skill term, scientists are labor), Heavy, Ops (LabLevel = K), deep tech (pace = posture), AI caps, Workshop, school, lessons, athletics, kit.

**Invention domains**, all `Task`s ending in a `Disclosure`:
- Products and platforms (exist; add open vs closed standards).
- Medicine: drugs (exist), devices, procedures, vaccines. After 2026 `eraCureFactor` follows the world medicine frontier.
- Software: libraries, open source, exploits.
- Weapons: government or contractor programs, secret by default, feeding war strength and export law (B).
- Art forms and sports techniques: named styles and methods, copied or banned over time.
- Financial instruments: alpha that crowds away, plus a systemic-risk term.
- Basic science: PhD and lab papers raise a public `K_world`.

**Protection**, one record: patent (disclosed; `patentLaw` fee, term, enforcement), secret (free; yearly leak hazard from headcount x turnover x spying), open (no shield, full spillover, fame, karma). Rival catch-up lag = development years x tier lag x (patent 1.6, secret 2.5, open .5).

**Rivals and world frontier.** `world.frontier[field]` (about 24 fields, optional flag, carried to heirs like `heavyWorldFlags`) = real anchors to 2026 (unchanged), then bounded rival ledgers (6 per field-market, seeded hash luck, never `g.rng`) plus player disclosures. Default seed reproduces today's `heavyArrival` and `capBest` drift. The Workshop future-race deadline becomes a frontier crossing.

**Spillover and waves**: each Disclosure adds public K_world (at most +6 odds points), calls `recordEconomicActivity` innovation (exists), announces a wave via `announceWave` past a size threshold (new `source: 'effort'`, still 2 a year), writes market news and the insider rule, moves poaching, and after 2026 sets `hasTech` for fictional future techs.

**Government actor**: budget share x GDP = money, cohort skills = labor, regime drive = ambition; a president sets lines and programs (B).

## 4. Work breakdown

| # | Item | Size | Needs |
|---|---|---|---|
| C1 | Effort core, factors, parity harness | L | K |
| C2 | Ambition, fatigue, posture, staff drive, `fx` storage | M | D, A |
| C3 | Migrate Product, Heavy, Ops, team, deep tech, AI caps, studio | L | C1 |
| C4 | Workshop on engine: helpers, tools, lab access | M | C1, D |
| C5 | School, thesis, PhD, lessons, athletics, kit practice | L | C1, I |
| C6 | World frontier, rival ledgers, future tech | L | A, C1 |
| C7 | Unified protection, leaks, suits | M | C6, B |
| C8 | Domains: medicine, software, finance, art, sports | 5 x M | C6, F, I |
| C9 | Weapons and government programs | M | B |
| C10 | Disclosure to waves, news, economy | M | E, C6 |
| C11 | "Why" panels, research-reveals-knowledge | S | G, H |
| C12 | Conservation, long-run and parity tests | M | K |

## 5. Risks

- Balance drift: Workshop earnings bands, careers balance and deep-tech tests stay green; the parity grid guards it.
- Exploit loops: every growth term gets a ceiling (k <= 4, fte cap, K <= 100, quality <= frontier + headroom, royalties <= 1.5x plan, one wave per origin). A 200-year probe at max inputs must show no field above frontier + headroom and no money beyond the market.
- Conservation: the engine reports `spend` only; callers keep `b.cash -= n; b.yearCosts += n`. Money-scan per domain; open source and grants create no money.
- RNG: one draw per finished project in today's order; `last` guards replays; rival and world luck is seeded by family and `outcomeTag`.
- Saves: new fields optional and clamped (`fx`, `know`, `effort.you`, `frontier`); SAVE_SCHEMA stays 2; person K resets per owner, company K and frontier persist for heirs.
- Performance: closed form per project; the `fieldOf` cache key must include new rival arrivals.
- Text: `why[]` follows docs/VOICE.md; `quote` never reveals `u` (no foresight).

## 6. Open questions

1. Ambition as a hidden trait revealed with age plus a visible yearly posture? Default: yes, shown from 18.
2. Keep pre-2026 history fixed, only the future emergent? Default: yes.
3. Focus-week pool or keep counters and derive fatigue? Default: focus-week pool, no weekly simulation.
4. Should failed research bank knowledge (cap +15 points)? Default: yes.
5. Secrecy leaks and spying before area B? Default: yearly leak hazard only, no spy minigame.
