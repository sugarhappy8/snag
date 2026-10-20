# Living World: one accounted world, a real information model and every career at business depth (master design)

Date: 2026-10-20
Status: draft for the owner's review. Design only: no source file and no test is touched.
Path: architectural (it reaches the kernel, the save format, the menus and every domain).
Branch: `docs/living-world-plan` (docs only).
Companion: `docs/superpowers/plans/2026-10-20-living-world-roadmap.md`. It cross-refers to the section numbers below, so they are fixed.
Inputs: eleven read-only audit digests (areas A to K) of main at v4.0.2. Where two digests disagree, the section says which one this design follows and why. Every number is measured by a digest or by grep on v4.0.2, unless it is marked as a decision.

Item ids are written `AREA/ITEM` as the digests number them. `A/K1` is area A's item K1 (the money ledger). `K/K1` is area K's item K1 (the architecture test). `E/T1`, `E/D1` and `E/N1` are the text, digest and news items of area E. Sizes follow the digests: S about 300 lines, M 1,000, L 3,000, XL 8,000 or more. A path marked (new) does not exist yet. Every other path was checked in the v4.0.2 checkout.

## 1. Vision and principles

### 1.1 What the owner asked for

The request, verbatim:

> Scope and write a full plan to make it actually matter: everything is accounted for. All features are fleshed out like wars, invention, relationship dynamics, news, showing off your product at events, dialogue not repeating, text showing your year isn't cluttered, better profit and loss graphics, better player navigation, better system, not everything the player should know unless they do research, research of all types shouldn't be tied to nothing but something like quality of staff, player ambition, money, labor; this for everything in the game. Every single special job fleshed out as much as business with so so much to do and experience.

Two follow-ups came after the audits:

1. "Include the fixes in the full game roadmap for these new things." The audits found bugs and exploits in the current game. They ship first, as release R0 (v4.0.3), and the guards that keep them from coming back land in the foundation releases.
2. "Add graphics if there are none for profit loss." There are none: `src` has no `<svg>`, `<canvas>` or `<path>`, and every chart is Unicode text. Profit and Loss graphics are an early, visible deliverable (release R1).

The earlier framing still holds. The dream is a game with almost everything accounted for and simulated: the world is entities that exist once, money, goods and people are conserved, and the player is one agent in a world that keeps running. The player's feedback so far is part of the target: war and politics agency for a President (declare war, the United Nations), better graphs for Profit and Loss and rankings, no more money exploits (the game studio loop was fixed in 4.0.1), and limits on AI lab research.

### 1.2 What "everything accounted for and simulated" means here

- **Entities exist once.** A person, firm, home, job or product that the player can touch, or that can touch the player, has one id and one record. The same banker can be a rival, a partner and a minister without being three strings.
- **Conservation.** Every dollar has a payer and a payee. Only a short list of declared mints and burns creates or destroys money, and each one is capped. People, homes and jobs are counted the same way.
- **One agent among many.** The world runs when the player does nothing. What the player does moves the world through the same functions the world uses on itself.
- **Effort decides outcomes.** Quality of staff, the actor's ambition, money and labor feed one engine with diminishing returns. No research, practice or showcase result is tied to nothing, and none is tied to a single number.
- **The player knows what a person in their seat would know.** Hidden quantities stay hidden until the player pays to learn them in money, staff time or years of experience.

What it does not mean:

- It is not a physics simulation of every item. Detail is bought where the player can see it. Everything else is a pool or a seeded record that costs nothing to store.
- It is not every citizen persisted. A 100-year life has a few hundred named people, not 100,000.
- It is not a weekly simulation. The year step stays the unit of time. A pool of about 12 focus weeks (section 5.6) replaces yearly counters without a weekly loop.
- It is not a rewrite. Each step lands alone, behind a reader that treats a missing field as empty, so every old save loads.
- It is not more menus. Depth is measured by the rubric in section 11, not by line count: a career is "as deep as business" when it passes the same 17 checks.
- It has no real living people, no graphic war, no nuclear use and no atrocity button (section 14.4).

### 1.3 Principles

1. **P1 Entities exist once.** One id, one record, many readers. Three levels of detail (named, pooled, seeded) keep the save small.
2. **P2 Conserved.** `book()` is the only way money moves. Tests sum balances against declared mints and burns.
3. **P3 No foresight.** Nothing reads the future: not a hint, not a rival, not a news tip, not a purchased source. The one documented exception, the Investing gut, is fenced (decision D12).
4. **P4 Deterministic.** Same state, seed and actions give the same result. World luck is keyed to stable ids and the year, never to the player's click count.
5. **P5 Yearly idempotence.** A year step can run twice and change nothing the second time.
6. **P6 Pure presentation.** Opening a menu, chart or report writes no state and draws no random number.
7. **P7 Bounded and optional.** Every list has a cap. Every new saved field is optional and normalized by its reader. `SAVE_SCHEMA` stays 2 until save v3 (section 13.5), and every old save keeps loading.
8. **P8 Ceilings on every growth term.** The game once had a trillion-dollar studio loop. Each new term that can compound gets a real-world ceiling and a probe that scales its inputs by 100.
9. **P9 Costs belong to the product.** The price of research, a booth or a lesson depends on what is being made or bought, never on how rich the buyer is. Outcomes may depend on money invested, with diminishing returns.
10. **P10 Plain narrator voice.** Text follows `docs/VOICE.md`: facts first, contractions, no em-dash, line caps. Text never repeats inside its memory window.

### 1.4 One name for each shared thing

The audits found the same idea built several times under different names. The programme builds each once.

| Shared thing | One name and home | Section | What it replaces |
|---|---|---|---|
| Money ledger | `book()` in `src/game/kernel/ledger.ts` (new) | 4.2.4 | About 685 raw money sites: roughly 460 `addMoney`, `spend` and `earnIncome` calls, about 160 `b.cash +=` and 65 `p.money +=` |
| Effort engine | `src/game/effort/` (new): `quote()` and `step()` | 5 | The separate formulas in about 30,000 lines of research-like code and 339 `useYearAction` throttles |
| Knowledge record | `know(g, key, truth)` and `flags.know` | 6 | The `close` flag, `approx()`, per-feature intel stores, `claimed` versus true skill |
| People registry | `g.world.people`, written by `src/game/society/` (new) | 4.2.3, 7 | At least 8 parallel "named person" shapes (Person, Candidate, Director, KeyStaff, Manager, Outsider, `Me.rivals`, election opponent) |
| News fact feed | `emit(g, fact)` into `g.world.facts` | 9.4 | War facts kept in six unlinked places, `market.news`, the one-line yearly headline |
| Text picker | `pickLine()` in `src/game/text/` (new) | 9.2 | 785 inline `pick(g,[...])`, 168 `pick(g,CONST)`, 77 `eraPick`, 45 `v(g,...)` sites, and the 60-key `flavorRecent` |
| Chart spec | `ChartSpec` in `src/game/charts/spec.ts` (new) | 12.5 | Unicode `spark()` and `bar()` strings |

### 1.5 How sections 4 to 12 are laid out

Each of sections 4 to 12 states the same nine things so the roadmap can quote them. Subsection x.1 is the problem today, with the measured fact. The middle subsections are the design: entities, stored optional state with bounds, the yearly step, player actions, and what the player sees. The last subsection of each section gathers the rest under bold labels: how it uses inputs (staff quality, ambition, money, labor) through the Effort Engine, how its information is revealed, how every dollar is booked, its text and news hooks, its exploit ceilings, its tests, and its migration from today's code. A label says so in one line when a section has nothing to add.

## 2. Requirement coverage matrix

Release ids and versions follow the release list of the roadmap (part A.1 of `docs/superpowers/plans/2026-10-20-living-world-roadmap.md`). If the roadmap reorders or renames a release, only the release columns of the tables below change.

| Id | Release | Version | Theme |
|---|---|---|---|
| R0 | Honest numbers | v4.0.3 | The bugs and exploits found by the audits, each with a regression test |
| R1 | See it | v4.1.0 | Profit and Loss graphics and the chart kit, navigation and search, notice digest and Quiet Mode, accessibility, IndexedDB saves, the text picker kit, sharded CI, and the guards (import-cycle ratchet, money-scan ratchet, foresight scan) |
| R2 | Every dollar has a counterparty | v5.0.0 | Ledger, `g.world`, save v3 diet, named RNG streams, the text codemod, the one planned seed rebaseline |
| R3 | Effort, fog and quiet years | v5.1.0 | Effort Engine, ambition and fatigue, knowledge record and fog on the main screens, the `closeYear` digest and family pacing |
| R4 | People who remember | v5.2.0 | Society layer: registry, personality, edges, reputation, life stages, heirs who inherit friends and feuds |
| R5 | The Paper | v5.3.0 | Fact feed, outlets and bias, editions, offers and scandal stories, the composer and dialogue memory |
| R6 | Careers kit v2 | v5.4.0 | Kit modules, Author and Game employee, real job vacancies, thesis and PhD |
| R7 | The President's war loop | v5.5.0 | Conflict ledger, nations, treaties, UN, fictional leaders, war record, war fog, 2027 and later conflicts |
| R8 | War economy and uniformed careers | v5.6.0 | Bonds, rationing, refugees, defense sector, Politician and Military at business depth, landlords and depositors, weapons secrecy |
| R9 | The Show Circuit and every trade | v5.7.0 | Shows and events, the remaining sector families, invention domains, goods flows |
| R10 | Population, Underworld, Sports | v5.8.0 | Pooled and seeded populations, the Underworld, sports leagues and franchises |
| R11 | Creators and the rest | v5.9.0 | Influencer and fame, the finished actor, astronaut, model and musician, journalist, scientist, intelligence careers |
| R12 | The depth gate | v6.0.0 | The rubric becomes a CI gate, final probes, release |

The owner's phrases, one row each:

| # | Owner's phrase | Design sections | Items | Releases |
|---|---|---|---|---|
| 1 | "Scope and write a full plan" | This document, the roadmap | all | none |
| 2 | "make it actually matter: everything is accounted for" | 1, 4 (ledger, jobs, housing, banks, heirs), 14.1 | A/K0 to K9, K/K3 to K/K6 | R0 (heir and mint fixes), R1 (money-scan guard), R2 (ledger, `g.world`), R6 (jobs), R8 (homes, banks), R9 (goods), R10 (populations) |
| 3 | "all features are fleshed out like wars" | 8 | B/B1 to B/B14 | R7, R8 |
| 4 | "invention" | 5.7 to 5.9 (domains, protection, world frontier) | C/C1 to C/C12 | R3 (engine), R6 (school and thesis), R8 (weapons), R9 (medicine, software, finance, art, sport) |
| 5 | "relationship dynamics" | 7 | D/D1 to D/D12 | R4 |
| 6 | "news" | 9.4 | E/N1 to E/N8 | R1 (digest card), R5 (the Paper) |
| 7 | "showing off your product at events" | 10 | F/F1 to F/F11 | R9 |
| 8 | "dialogue not repeating" | 9.2, 7.4 | E/T1 to E/T7, D/D11 | R1 (picker kit), R2 (codemod), R4 (memory), R5 (composer) |
| 9 | "text showing your year isn't cluttered" | 9.3, 12.4 | E/D1 to E/D4, G/G11 | R1 (notice digest, Quiet Mode), R3 (`closeYear`, pacing) |
| 10 | "better profit and loss graphics" | 12.5, 12.6 | G/G1 to G/G4, G/G6 | R1 |
| 11 | "better player navigation" | 12.2, 12.3 | G/G8 to G/G10, G/G12 | R1 (core, search, accessibility), R4 to R8 (people, career and world hubs) |
| 12 | "better system" | 4, 5, 6, 13 | A, C, H, K | R1 to R3 |
| 13 | "not everything the player should know unless they do research" | 6 | H/H1 to H/H13 | R3, then screen by screen to R11 |
| 14 | "research of all types shouldn't be tied to nothing but something like quality of staff, player ambition, money, labor; this for everything in the game" | 5, and the "inputs" heading of sections 4 to 12 | C/C1 to C/C12, J/J7 | R3 (engine), every later release applies it to its domain |
| 15 | "Every single special job fleshed out as much as business" | 11 | I, J/J1 to J/J10 | R6 to R12 |

Follow-ups:

| Follow-up | Design sections | Releases |
|---|---|---|
| "Include the fixes in the full game roadmap" | 3.9 (defect register), 14.1 (guards) | R0 (fixes), R1 (import-cycle ratchet, money-scan ratchet, foresight scan), R2 (ledger ratchet, conservation probe), R3 (fog coverage test) |
| "Add graphics if there are none for profit loss" | 12.5 (chart kit), 12.6 (Profit and Loss) | R1 |

"Better system" is the only phrase with no single feature behind it. This design reads it as the systems under the features: the ledger and registry (section 4), the effort and information models (sections 5 and 6) and the engineering foundation (section 13). The owner can correct this reading at decision D23.

## 3. The game today, measured

All figures are from the digests, measured on v4.0.2 with throwaway probes, unless a path is given.

### 3.1 Size and shape

- About 260,000 lines of source (K counted 259k, the audit brief says 264k) and about 131,000 lines of tests in 389 files (6,807 tests). Business is 63,065 lines in 189 files, `special/` about 40,000, `events/` 30,836, `src/ui` 8,739 lines of TS and TSX plus 5,163 of CSS.
- The menu model is solid: `MenuAction`, `MenuGroup`, `MenuInfo` and `MenuHeading` (`game/types.ts` 721 to 804) are pure functions of state with stable ids (0 duplicate id-paths in 11,822 nodes).
- Bundle: one chunk of 8.3 MB (2.8 MB gzip). 46% of the bytes are string literals; there are 64,530 strings in the voice report.

### 3.2 The world is 96% aggregate

- `GameState` has 17 keys. `flags` is a drawer of about 190 keys where the world also lives (`worldEconomy`, `nation.policy`, `techWaves`, `heavy.*`, `marketShocks`).
- A 30-year life with 3 companies saves as 1.78 MB and 103,728 JSON nodes, and `worldEconomy` is 96% of both. At age 80 with 12 companies the save is 2.14 MB (371 KB gzip, about 125,000 of the 500,000 allowed nodes). People are 7 KB, assets 22 KB. Entities are under 1% of the save.
- People: real records exist only around the player. Strangers (candidates, neighbors, career rivals) are seeded and never stored.
- Money has no ledger. Wages, rent, tax, loan principal and sale proceeds have no counterparty. NPC pockets are filled by `randomWealth`, and `NpcLife.income` credits `p.money` with no paying employer.
- Jobs are an infinite board (179 definitions shuffled by `listingSeed`). Homes are seeded listings with no stock, seller or owner. Credit outside the player's own banks is created from nothing and repaid into nothing.
- Time: `ageUp` costs 83 ms a year with no company and 108 ms with 12 (K). Business adds about 2 ms per company-year for ordinary firms; `docs/LIVING-WORLD.md` records about 80 ms per full firm at elite load (22 firms in 1.7 to 2.2 s). Every tap costs `structuredClone` 24 ms plus `JSON.stringify` 25 ms plus a 2.1 MB localStorage write. The IndexedDB and gzip backend (`save-backends.ts`, 170 lines) is built but nothing calls `setSaveBackend`.

### 3.3 Research is thirty thousand lines of separate formulas

- About 30,000 lines do research-like work, and no two share inputs: product R&D (`business/rd.ts`, 490), Heavy R&D (582), the R&D 3.0 lab (1,598), deep tech (7,182), AI bench (622), studio engines, the Workshop (3,123), school (`education.ts`, 3,965) and the skills code in athlete, sports, kit and developer files.
- Labor is a real input only in the studio engines (progress is (devs/needed)^.8). Ambition is an input nowhere: NPCs have `NpcLife.ambition` and the player has none. A failed project teaches nothing. After 2026 world technology is a calendar that player breakthroughs never move.

### 3.4 The player is nearly omniscient

- `talentHint()` has 207 call sites in 65 files and 98 test files mention hints. Business hints run the real optimizer on true parameters, so a purple hint is an exact best answer. 81 strings print "% odds" or "% chance".
- The Market screen shows size, share to 0.01% and each rival line's exact quality. Company Watch prints each rival's cash and debt. Hiring interviews list exact skill and the hidden trait. `PersonSheet` shows exact 0-100 bars for 15 personality stats; only cash is gated below relationship 35.
- Foresight: `invest/instinct.ts` (236 lines) reads the realized return of `g.year + 1` and picks rise about 6 times in 7. The free Financial News analyst tip (`investments.ts` `seededTip`) reads `next.stocks[].ret` and is right 2 times in 3 with no talent.
- Patterns worth reusing already exist: VC pitches (`fund-vc.ts`: hidden quality, a noisy gut read, due diligence buys "quality lo-hi"), `advisors/team.ts` (`claimed` versus true skill), `health.ts` (a `diagnosed` flag revealed by a doctor), and `seeded(...)` noise that never touches `g.rng`.

### 3.5 The year is cluttered and repeats

Thirteen seeded lives were played through the real `ageUp` (E). Ordinary lives, then lives given $50M at 20, then tycoons:

| Measure | Ordinary | $50M | Tycoon |
|---|---|---|---|
| Popups a year, mean / p90 / max | 1.8 / 3 / 8 | 5.4 / 8 / 12 | 8 / 12 / 13 |
| Log lines a year, mean / p90 / max | 4.2 / 7 / 9 | 6.4 / 9 / 12 | 12.5 / 18 / 19 |
| Log lines repeating an earlier line | 4 to 15% | 17 to 34% | 17 to 34% |
| Same line within 10 years, per life | 2 to 17 | 13 to 66 | 13 to 66 |
| Lines on a 3-word opener used 4+ times | 4 to 22% | 30 to 44% | 30 to 44% |
| Times one popup title appears in a life | 2 to 7 | 18 to 19 | 18 to 19 |

For the last four rows E reports one range for ordinary lives and one for the two rich groups together, so the rich range is repeated in both cells.

- The year digest line averages 312 characters against a 110 cap and makes up 41% of log characters in historical lives.
- Wealth asks make about 75% of hook-made choices. "My sister N has been avoiding me ever since I lent her money" printed 48 times in 10 lives.
- Pacing is per engine: wealth cap 3, nepo 2, will 1, career kit one choice and two notices, "one popup a year" in about 15 files. There is no global budget and no inbox. 1,716 to 1,831 `notice()` sites (G and E count differently) and 482 `scriptChoice()` sites block the screen, and 256 test files read `g.queue`.
- Dialogue is a summary line (`relationships.ts` 2292: 32 topics, 5 openers, 5 tails). Only `flavor.ts` has line memory.

### 3.6 Navigation and graphics

- The mean action sits at list depth 4.8, about 5.8 taps. For a CEO, 2,601 distinct actions sit behind 1,159 group screens. 146 groups hold one row, 161 are 70% or more info rows, 53 exceed 12 rows (28 of them without headings). The company screen has 39 direct rows and 1,250 nodes below it. There is no search, favorites, recents or breadcrumbs.
- No graphics at all. The Annual Report (`ui/minigames/AnnualReport.tsx`, 684 lines) prints up to 24 label and value strings from `statementLines()` (`business/yearly.ts` 163). `BizState.history` keeps 9 numbers a year for 10 years and `BizState.last` keeps one statement. No net-worth history exists anywhere.
- Accessibility: sheets are `role=dialog` without `aria-modal`, focus trap or inert background. Muted text on the page background is 4.19:1 and `--tone-good` is 4.40:1, both under the 4.5:1 bar. The brand green, orange and yellow are 2.2 to 2.4:1 on white.

### 3.7 Careers against business

Rubric totals out of 51 (section 11.2): business 43, musician 36, actor 34, politician 34, model 32, game employee 32, astronaut 31, sports 30, military 18, author 17, influencer 14, hustler 8. Four careers (actor, astronaut, model, musician) sit on the shared kit in `special/kit/` and score 31 to 36. Seven are off the kit and score 8 to 34. Only the four kit careers have a money scan (`test/career-money-scan.test.ts`, 48 lines) or a balance matrix. Military, hustler and fame have 0 dedicated tests.

### 3.8 Engineering

- 5 import cycles hold 147 of 623 modules (24%). The v4.0.0 crash was one edge (`wave-insider` to `special/politics`) that grew a 60-module cycle to 177. The kernel (types, rng, core, world, scripts, talents, assetHooks) is already a clean leaf with about 900 inbound edges.
- Randomness: one `g.rng` stream with 5,383 draw sites. One extra `rand()` at year 10 changes every later digest, the world economy included. 119 tests pin `seed: N`.
- CI: one job, 36 minutes (91% tests). At least 80% of the 389 test files run the yearly loop. Affected-test selection is useless: a median source change reaches 67% of test files. The v4.0.0 integration needed 5 CI runs (157 minutes) and 3 were red.
- Throughput of the last big release: 72,081 lines added (24,175 source, 36,464 tests, 11,352 docs) in 143 commits over 12.5 to 14 hours with 9 tracks and 4 CPUs.

### 3.9 Defect and exploit register

These are the defects the digests name. R0 fixes the first group. The second group needs a foundation and is fixed there, with the guard that stops it returning. The roadmap gives each R0 item a task with the file, the change and the regression test. X1 to X10 are the ten defects. X12 and X13 are the tests and the probe that ship with them.

**Fixed in R0 (v4.0.3).** Each was read in the v4.0.2 checkout. X11 is not in this table: it is a guard, so it ships with the foundations (second table).

| Id | Defect | Where | Behavior |
|---|---|---|---|
| X1 | Fake followers pay | `special/social.ts` `BUY_PACKS` (lines 758 to 762), `payRate` (line 1141) | 1,000,000 followers cost $70,000. YouTube monetizes at 1,000 and pays 1 to 5 a subscriber a year with 4 posts, so one pack earns $1M to $5M a year. Spam suspension is 24% a pack and followers cap only at 1e12. |
| X2 | Free analyst tip reads next year | `investments.ts` `seededTip` (line 2135) | Computes `exchangeYear(..., g.year + 1)` and is right 2 times in 3 with no talent. Breaks "no foresight". |
| X3 | Perfect-foresight income is minted | `business/executive-foresight.ts` `settlePerfectForesight` | Any hired CEO with skill 100 gets "strategic trading income": `b.cash += earned` with no payer. It also shows as a statement line. |
| X4 | Heirs lose a President's laws | `life.ts` `continueAsChild` whitelist (lines 1515 to 1535) | `nation.policy` is not on the list. `test/nation.test.ts` line 92 claims laws survive but never calls `continueAsChild`. |
| X5 | Non-heir siblings' firms become cash | `life.ts` lines 1205 to 1212 | The asset record is dropped and `recipient.money` rises by the equity, with no buyer and no firm left. |
| X6 | Sports endorsements pay from nowhere | `special/sports-core.ts` line 476; `special/sports-olympics.ts` lines 19 to 22 and 109 | `4,000 + (fame/100)^3 x 6,000,000 + buzz x 3,000` per deal, up to three deals (`maxDeals`), from brands that lose nothing. Olympic medal bonuses are paid by `earnIncome` with no committee behind them (`GOLD_BONUS` runs to $740,000 for a Singapore gold). |
| X7 | Author adaptation fee pays from nowhere | `special/author-career.ts` `authorAdaptationOffer` | `15,000 + min(5,000,000, reach) x 1.5` up to about $7.5M with no studio paying, and sales read no era market size. |
| X8 | Dead awards term multiplied by 30 | `business/gamestudio-state.ts` line 216 | `awards` is always `[]`, yet `x.awards.length * 30` is in the game-pruning sort score. |
| X9 | Flat pay ignores year and country | `special/military.ts` `ENLISTED_PAY` and `OFFICER_PAY` (lines 31 and 32); `special/hustler.ts` | The same dollars in 1925 and 2025, in every country. `priceLevel(year)` already exists (`history/timeline.ts`). |
| X10 | Contrast under the 4.5:1 bar | `src/ui/styles/global.css` tokens (`--tone-good` at line 55) | Muted text 4.19:1, `--tone-good` 4.40:1. |
| X12 | Untested careers | `special/fame.ts` (1,016 lines), `special/hustler.ts` (817), `special/military.ts` (1,082) | 0 dedicated tests, so X9 has nothing holding it. |
| X13 | Stacked promotion terms have no ceiling | `marketingFactor(marketingLevel)` x `(1 + campaignBoost)` (`business/economy.ts` line 408) x hype x brand (`business/market-strategy.ts`) | The studio loop pattern. A 160-year ceiling probe (in R0 if it fits, otherwise in R1) decides whether the cap (product of terms at most 1.35) ships early or with the Show Circuit (F/F5, release R9). |

**Fixed by a foundation (not R0).**

| Id | Defect | Fixed by | Release |
|---|---|---|---|
| X11 | Money scan covers four careers. The regex ban scans only the new `actor-*`, `astronaut-*`, `model-*` and `music-*` files. The legacy files (`actor.ts`, `astronaut.ts`, `model.ts`, `music.ts`, `music-rights.ts`) and every file of the other seven careers are not scanned (`test/career-money-scan.test.ts`) | The scan over every special file with a ratchet allowlist that only shrinks (11.7) | R1 |
| X14 | Open money system: wages, rent, tax, principal, sale proceeds, NPC pockets (`randomWealth`, `NpcLife.income`) have no counterparty | The ledger and the ratchet test (4.2.4) | R2 |
| X15 | Heir hand-over re-rolls every relationship to a random value (55 to 95 for the other parent, 35 to 85 for siblings), clears the notes of living people, and keeps only kin plus contacts with an NPC life or a family firm (as friends, capped at 60). Every other friend, coworker, classmate and enemy is dropped (`life.ts` 1353 to 1456) | Society edges and carryover (7.6) | R4 |
| X16 | World randomness is welded to the player stream | Named RNG streams (13.3) | R2 |
| X17 | The built IndexedDB backend is not wired; each tap writes 2.1 MB | Wire the backend, then save v3 (13.5) | R1, R2 |
| X18 | Hints give exact best answers; hiring and `PersonSheet` reveal hidden quality at once; rival products, cash and debt are free knowledge | Knowledge record and fog migration (6.7) | R3 onward |
| X19 | The Investing gut reads the realized return of `g.year + 1` | The foresight scan, then the fence and signal-based tips (6.5, D12) | R1, R3 |
| X20 | Per-engine popup budgets, no inbox, digest 3 times its cap | Notice digest (R1), `closeYear` (R3) | R1, R3 |
| X21 | Text choice draws from `g.rng` and shares the stream with the simulation | `pickLine` keeps one draw for parity, then named streams | R1, R2 |
| X22 | Cycle-induced crashes (`UNIT_YEARS` undefined, `COMPETITION_EVENTS is not iterable`, fixed in 4.0.0) | Import-cycle ratchet (13.2) | R1 |
| X23 | Sponsors, publishers, leagues and donors pay from nowhere across the careers | Kit ledger with a world payer (11.3) | R6 |
| X24 | Classmates, teachers and coworkers are deleted when the context ends | Registry and cast bindings (7.2, 7.7) | R4 |
| X25 | Dialogs have no `aria-modal`, focus trap, focus restore or inert background | The accessibility pass (12.5) | R1 |
| X26 | 137 test files raise timeouts to 100 to 300 s to survive contention, and CI is one unsharded 36-minute job | Sharded CI and the test platform (13.6) | R1 |
| X27 | Every war is restated in six unlinked places (the `WarDef` table, 226 headline rows, asylum rows, oil shocks, a flat trade restriction, trade blocs) | The conflict ledger (8.2) | R7 |

The missing guards that keep this register from growing: the money scan over every special file with a ratchet allowlist (R1), the foresight scan (a spy asserts no pure read asks the economy for a year after `g.year`, R1), the fog coverage test (R3), the world conservation probe (R2) and the architecture ratchet (R1).

## 4. World kernel, money ledger, levels of detail and state budget

Sources: area A (the kernel) and area K (layers, ledger placement, levels of detail, save budget). Where they differ, section 14.6 lists the resolution.

### 4.1 Problem today

- The world is 96% aggregate and under 1% entities (3.2). There is no registry of people, firms, homes or jobs, so "every person, company, home and job exists once" is false: a banker met at a party cannot later be the minister, the landlord or the rival.
- Money is an open system. `addMoney`, `spend` and `earnIncome` (`core.ts` 62 to 81) mutate `g.character.money` and book nothing against a counterparty. About 685 raw money sites exist. Conservation is tested per feature (hedge fund, will estate, share structure, franchise, world2 trade) and nowhere across the world.
- Jobs are infinite, homes have no stock, banks outside the player's own have no depositors, and a government budget is a GDP share, not a wallet.
- `continueAsChild` (`life.ts` 1137) rebuilds the world from a whitelist of flag keys. That list caused X4 and X5.
- Nothing here can grow without a save budget: 85% to 96% of every save is `worldEconomy`, the Time Machine `pack()` (`save.ts` 572) chunks only that key, and the node cap is 500,000.

### 4.2 Design

**4.2.1 One home.** A new optional top-level `g.world` holds every shard that must outlive a character. `continueAsChild` clones state, so a shard on `g.world` reaches the heir by default and the whitelist bug class ends. Personal state (a career record, the knowledge record, the text memory) stays owner-stamped in `flags`, as the kit does today.

- Shards, each optional with its own `v`, normalizer and caps: `people`, `edges`, `holdings`, `firms`, `homes`, `jobs`, `pools`, `flows`, `facts`, `geo` (section 8), `frontier` (section 5), `shows` (section 10), `archive`.
- Readers normalize and cache by root identity; writers replace roots. A missing shard reads as empty and `ensureWorld(g)` seeds it with no retroactive flows.
- Staging: until `A/K2` lands, every shard is reached through `worldShard(g, name)`, backed by `flags['world.<name>']`. At K2 the backing moves to `g.world.<name>` with no call-site change. This lets sections 5 to 10 ship before the skeleton without choosing a home twice.
- `A/K0` classifies the roughly 190 flag keys as world or personal and adds a test that fails on an unclassified new key. `nation.policy` is classified world and added to the heir path in R0 (X4). Existing world keys (`worldEconomy`, `marketShocks`, `techWaves`, `heavy.*`) stay where they are until the slice that owns them moves them.

**4.2.2 Ids and holdings.**

- `EntityRef` is `kind:key`. Seeded entities take `hash(familySeed, kind, country, year, slot)`; sequenced ones take `world.seq`. A person's id is `person:<sid>` and the same `sid` is used by the society layer (section 7), so there is one id for a person everywhere.
- One `holdings` table `[owner, asset, share]` generalizes `BizState.share`, `familyShares`, the `npc-stake` records, conglomerate groups and mortgages. Shares of one asset sum to 1.
- First, registries are indexes over existing records (`Person.data.sid`, a firm header `{id, lod, ref}`). Nothing is copied, so the old `Person`, `Asset` and `BizState` readers keep working.

**4.2.3 Three levels of detail.** Area A numbered tiers 0 to 2, area D named them latent, met and intimate, and area K named them T0 to T2 with different caps. This design uses one vocabulary: named, pooled, seeded.

| Level | What it is | Stored | Caps |
|---|---|---|---|
| Named | A full record. For people: the player, kin, partner, friends, the boss and about 12 coworkers, landlord, tenants, creditors, the top 3 customers, the top 8 rivals per market, heads of state, owners of named firms | `g.world` shards | 400 people (at most 80 of them intimate, meaning a `Person` in `g.people`), 60 firms (20 full `BizState`, 40 `FirmLite`), 150 properties, 600 job slots |
| Pooled | Counts and balances per country, sector and cohort: unemployed, vacancies, housing stock by bracket, loans by bank, household and landlord cash | `economy/` extended, `world.pools` | One row per country x sector x cohort |
| Seeded | Generated on demand from the family seed, identical on every call. Strangers, career peers, candidates, school cohorts, election fields, boards | Nothing (0 bytes) | None |

- Relevance is graph distance to the player. A named record stays while any obligation exists (debt, will, contract, shares).
- Promotion (hire a candidate, meet a coworker, buy a listed home, face a rival) writes a record under the seed key, so regenerating gives the same entity, and the pool count drops by one. Demotion (no relevance or obligation for 5 years) folds the record into pool counts and its cash into the pool account through the ledger. Promotion order must not change the result: ids are sorted and seeds are keyed on the id.
- `FirmLite` generalizes the 192-actor rival formula (`economy/actors-state.ts`, `RivalActor`): cash, debt, size and an owner ref. Full `BizState` stays for the player's firms and family NPC firms, which already run the same `simulateYear` (`npc-company-state.ts`).
- Resolution: this follows A's and D's caps because they were measured against the save budget (4.2.8). K's light tier (3,000 entities at about 300 B) is not adopted now. K measured that storage, not CPU, is the limit: 100,000 light entities cost 3 to 9 ms a year but 15 MB. The tier stays a ceiling to review after save v3 (section 16).

**4.2.4 The money ledger.**

- `book(g, reason, from, to, amount, token)` in `src/game/kernel/ledger.ts` (new), a leaf at layer L0 (13.2). `AcctRef` is a person, firm, bank, `gov:<country>`, `pool:hh:<country>`, `pool:landlords`, `abroad`, or a named mint or burn sink. This takes A's counterparties and negative pools and K's placement and invariant. K called the function `post`; it is `book` here.
- `addMoney`, `earnIncome`, `spend` and the company cash helpers become wrappers with an optional reason and a default counterparty: wages from `pool:hh`, tax to `gov`, rent to `pool:landlords`, interest to the lender. They keep today's rounding and non-finite rejection.
- Tokens reuse the `economy.receipts` idempotence pattern (`economy/index.ts` line 85, receipts capped at 3,000): a re-run of a year books nothing twice.
- Pools start at 0 and may go negative as cumulative net flow, so old saves need no invented opening balance.
- Declared mints, each with a yearly cap and a log row: bank lending creation (capped by capital ratio), central-bank printing in a declared war (B: inflation shock at most +0.15), immigrant savings. Declared burns: inflation erosion of cash (`aging.ts`), loan write-offs, emigration, tax paid `abroad`. Nothing else creates or destroys a dollar.
- Invariant: the sum of every account, pools included, equals cumulative declared mint minus burn, and each year's flows net to zero per reason.
- `flows` is a bounded table (country x reason x 2 years, about 4,000 nodes). It feeds the Profit and Loss views (12.6) and the money line of the year digest (9.3).
- A ratchet test counts raw money sites that carry no reason and fails if the count rises. It falls as domains migrate. Careers keep the kit's `c.earn` and `c.pay` (`special/kit/year.ts`), which become thin callers of `book`.

**4.2.5 The yearly world step.** One hook right after `yearlyEconomy` in `aging.ts` (35 ordered hooks, `YEARLY_HOOKS`). It reads the opening frame W0 and writes W1, with sorted ids, a `world.year` marker, and per-entity `stream(g, tag, year, id)` draws (13.3), never `g.rng`.

1. W1 demography: births, deaths, estates through the ledger, migration.
2. W2 labor: separations first, then hires into last year's vacancies. Unemployment is derived, not stored.
3. W3 firms: named firms through `simulateYear`, `FirmLite` by formula. Wages and sales are booked.
4. W4 housing and credit: rent, mortgage payments, default, completions, demolitions.
5. W5 government: taxes are the sum of tax flows, spending goes to transfers and public jobs.
6. W6 prices and pools for next year, lagged as `economy/` does.
7. W7 promotion, demotion and the invariant check (assert in tests, heal in play).

**4.2.6 Jobs, housing, banks and goods.**

- Jobs (A/K3): firms carry headcount and slots. The job board is built from real vacancies. Coworkers and bosses are named people who persist. `jobMarket` (`cv.ts` 302) becomes derived. Layoffs and hires cross firms, and a laid-off person turns up later as a candidate.
- Property (A/K4): a listing is a promotion of a seeded home. Cities have stock by bracket. Landlord and seller pools receive rent and sale proceeds. Construction and demolition are the only things that move stock: owned plus rented plus vacant equals stock.
- Banking (A/K6): lender ids replace display strings, deposits exist, loan creation is a declared mint, and a bank failure hits depositors. Player banks keep their segregated books and gain the same counterparties.
- Goods (A/K7): start with the four traded baskets (`economy/trade.ts`), housing and labor-hours. Per basket: opening plus output plus imports minus sales minus spoilage minus exports equals closing. Firm output ties to baskets.
- Government (W5): `gov:<country>` becomes a wallet that receives tax flows and pays transfers and public wages. The GDP-share budget (`economy/government.ts`) stays as the target the wallet follows.

**4.2.7 Generations and carryover.** One table replaces the carryover rules scattered through the digests. The viewpoint id swaps on a death, and `g.people` becomes the player's edges over world persons.

| Thing | What an heir gets | Source |
|---|---|---|
| World shards (people, firms, homes, holdings, facts, geo, frontier, shows) | All, by default | A |
| Holdings, including non-heir siblings' | Kept as holdings. No liquidation (fixes X5). Kin debts pass through holdings | A, decision D4 |
| Edges to kin | Copied at 0.5 of trust and affection, 0.6 of resentment. Debts and favors survive through the estate | D |
| Knowledge record | Personal keys reset. Company-bound keys stay with age +5 | H |
| Effort | A person's field knowledge resets. Company knowledge and the world frontier stay | C |
| Career assets (IP trust, catalog, team, turf) | Pass, valued and taxed once. Standing and memory do not | I |
| Career rivals | Same names, derived from the family seed | D |
| Text memory | Reset per generation | E |
| Persona | Re-inferred for the new character | D |

Dead named people compact to an archive row (cap 500). Estates run through the ledger for NPCs as well as for the player.

**4.2.8 State budget.** Added state by shard, with who pays.

| Shard and its caps | Digest | Size |
|---|---|---|
| Registry: people 400 x about 15 nodes, firms 60 x 25, homes 150 x 10, job slots 600 x 6, flows 4,000 | A | about 17,000 nodes, 250 to 400 KB |
| Society extras: edges 1,200, secrets 40, feuds 12, reputation rows 12, 8 memories per edge | D | under 250 KB including the people rows |
| Facts and news: 3 editions in full, 30-year archive of front pages | E | at most 30 KB, plus textMem 8 KB and log +12 KB |
| Knowledge: 120 keys | H | small, bounded by key count |
| Geopolitics: capped pair maps, sparse deltas | B | about 60 KB worst case |
| Series: company books 30 years x about 23 numbers (about 690 nodes a company), `lifeSeries` 120 rows, market top-8 | G, J | about 3,400 nodes with 3 companies, about 22,000 with 30 (4.4% of the node cap) |
| Career records: one per career | I, K | under 6,000 nodes each |

Budget (a decision, enforced by the 50-year probe): a late-game save stays under 250,000 nodes and 3.0 MB raw before save v3. After save v3 the chunk budgets are core 400 KB, world 1 MB raw, 600 KB gzip (13.5). The payment is thinning `worldEconomy`: drop `previous` (562 KB) or keep only the fields readers use, and cut history from 32 to 16 years. A and K both measured about 0.6 to 0.8 MB back. Time budget: the world step at most 60 ms a year on desktop (400 people at about 0.05 ms each), a light-life `ageUp` under 160 ms (250 ms on a mid-range phone), and full firms capped near 20.

### 4.3 What the kernel reads, and how it uses the inputs

- Labor: W2 hires from vacancies by skill and ambition. A firm's headcount and key-staff quality come from the registry, and they are the `people[]` input of the Effort Engine (5.2) for that firm's research.
- Ambition: a named NPC's `ambition` decides founding a company, leaving a job or launching a rival (`npc-lives.ts`, ambition 80 or more launches a rival today).
- Money: a firm's cash and the pool balances bound what it can pay. Nothing is paid from a pool that has not first received the matching flow.

### 4.4 Fog

Pools are public with a first-print lag (6.7, step 8). Hidden fields of named entities (a rival's cash, a coworker's skill, a landlord's wealth) are stored true and read only through `know()` (6.2). The registry exposes two accessors, as the kit does: `peek` for engine code and `view` for presenters, and a test fails if a menu module reads a truth accessor for a hidden key.

### 4.5 Money

Default counterparties by reason:

| Reason | Payer | Payee |
|---|---|---|
| wage, salary | firm or `gov:<country>` | person, or `pool:hh:<country>` for unnamed staff |
| tax (income, sales, corporate, inheritance) | person or firm | `gov:<country>` |
| rent | tenant | landlord, or `pool:landlords` |
| sale proceeds | buyer | seller, or the seller pool |
| loan principal and interest | borrower and lender | the other side, bank or person |
| dividend, draw | firm | holders listed in `holdings` |
| estate | the estate | heirs, then `gov` for estate tax |
| transfer, subsidy, benefit | `gov:<country>` | person or `pool:hh` |
| contract fee, prize, endorsement | the paying entity (section 11.3) | person or firm |
| fee for research or intel (sections 5 and 6) | the buyer | a real consultancy or lab entity |

### 4.6 Text and news

W-steps and detectors emit facts (9.4): a layoff round, a bankruptcy, a takeover, a housing swing, a bank under stress. The reader sees them as news only if they cross the score threshold, so a 400-person registry doesn't flood the Paper.

### 4.7 Ceilings

- Pool prices invite buy-from-pool, sell-to-pool loops. Counter with bid-ask spreads, stock-linked price indexes and transaction costs. Promotion and demotion move value one way each and conserve cash.
- Only declared mints create money, each with a yearly cap. One full-time job per person. Hires only into vacancies. Named counts never exceed the caps in 4.2.3.

### 4.8 Tests

- Conservation, wired into `checkInvariants` (`test/fuzz-kit.ts` line 538) and a 100-year probe. Money: accounts equal cumulative mint minus burn. People: births minus deaths plus or minus migration equals the change in named plus pooled people; parents exist or are founders; one spouse, mutual. Property: holdings sum to 1; one household per unit; owned plus rented plus vacant equals stock. Jobs: persons with a `jobId` equal filled slots; wage bill equals pay flows. Goods: the basket identity.
- Replay, reload and a Time Machine fork give identical JSON. Promotion order does not matter. An heir probe checks the table in 4.2.7. A 50-year probe asserts the save budget and the time budget.
- The raw-money-site ratchet. Idempotence of the world step.

### 4.9 Migration

Strangler order. Each step ships alone and old saves load.

1. `A/K0` (S): classify flags, add `nation.policy` to heirs, fix the test at `test/nation.test.ts` line 92 so it calls `continueAsChild`.
2. `A/K1` (M): ledger, the three wrappers, the ratchet, `flows`, the conservation probe.
3. `A/K2` (L): `g.world` skeleton, `EntityRef`, holdings, indexes over `Person`, `Asset` and `npcCompany`, invariants in `fuzz-kit`, `ensureWorld`.
4. `A/K3` (L) jobs, `A/K4` (L) property, `A/K6` (M) banking, `A/K7` (L) goods.
5. `A/K5` (XL) pooled and seeded populations, promotion, demotion, archive, `FirmLite`.
6. `A/K8` (M) heir rewrite. `A/K9` (M) save diet, chunked `pack()`, node-cap review, perf probe.
7. `K/K3` (L) kernel streams, ids, registry and bus. `K/K4` (L) conservation scanners and property helpers. `K/K5` (XL) save v3. `K/K6` (M) the LOD framework and budget meter.

Old NPC firms are indexed in place and not rewritten (D3). The riskiest edits are `npc-lives.ts`, `continueAsChild` and the will code, so golden tests land before each of them.

## 5. The Effort Engine: research and effort of all kinds

Source: area C. Areas H, F, I and B supply the sinks that share the engine (5.10).

### 5.1 Problem today

About 30,000 lines do research-like work and every system has its own formula:

| System | What decides the outcome today |
|---|---|
| Product R&D (`business/rd.ts`, 490) | A fixed price per product (`rdCost`, never cash). A budget k of 0.5 to 4 times buys odds `1-(1-p0)k^-0.4`, years `base/sqrt(k)` and quality `+28(1-k^-0.8)`. `p0` is `launchP = .25 + ceoSkill/250 + quality/300 + .1 for quality staff + .03 for a team`. One `chance()` per project. No labor, no ambition, no fatigue. A flop teaches nothing. |
| Heavy R&D (`heavy-rd.ts`, 582) | 8 times the classic price, 4 to 6 years, odds .55 x `launchP`, a 5-year cooldown. A win writes a world record (demand curve, rival arrivals, a wave). |
| R&D 3.0 lab (`lab-*.ts`, 1,598) | 9 programs. A track level caps at .95, fades 5% a year, and each win is worth .8 of the last: a real learning curve. Up to 6 scientists add .03 odds each at x.7 per extra. Patents shield 3 to 6 years. |
| Deep tech (`deeptech-*.ts`, 7,182) | Fixed odds per program. Budget k .5 to 3, time x (.75 + techSkill/200), pace lean, steady or blitz. A failure banks 25% of spend as IP. |
| AI Lab (`ai-bench*.ts`, 622) | `modelRating` sums level, generation, compute, research and a roll under a soft ceiling at the market best + 90. Capability research costs $3M x 1.4^level at a flat 65%. The cleanest ceiling in the game. |
| Studio engines (`gamestudio-engines.ts`) | The only labor-driven build: progress = (devs/needed)^.8 with no failure roll. |
| Workshop (`workshop/`, 3,123) | Quality center = 18 + .55 skill + .15 smarts + 20 genius - 10(difficulty-1) + 3 per build. Three builds a year is the limiter. Money buys parts only. |
| School (`education.ts`, 3,965) | Grades pull toward smarts x .5 + 45 at .35 plus a random +-6. "Study Harder" three times a year for +3 to +8. No thesis, no researcher career. |
| Skills (athlete, sports, dev-learn, kit) | Each rolls its own gain. 339 `useYearAction` throttles are the de-facto effort model. |

The player has no ambition (NPCs have `NpcLife.ambition` and `driveOf`). Rival R&D is hash arithmetic (`riseOf`, `heavyArrival`). Three unrelated patent systems exist. Governments and the military research nothing: the `research` and `space` budget lines only multiply demand and growth. World technology is a calendar (`TECH`, `medicalYear`, `capBest` drift), and a player breakthrough makes a wave but never moves `hasTech`, medicine or `capBest`.

### 5.2 Design: one engine, three records

A pure folder `src/game/effort/` (new, about 2,500 lines): `engine`, `factors`, `actor`, `world`. It draws no random number and moves no money.

- **Task**, fixed by the product and never by cash: `{ field, cost, hardness, baseYears, ceiling, kmax, mode }` with `mode` one of `project`, `practice`, `study` or `intel`. `rdCost`, `HEAVY_COST_X`, `opsPrice`, `BUILD_COST`, tuition and lesson prices become `Task.cost` unchanged. The `intel` mode is the one addition from area H: invention progress and knowledge are the same effort run with different sinks (6.3).
- **Input**, per year: `people[]` (fte, skill, morale, drive, fatigue), `k` (spend divided by `task.cost`, a ratio, so a cash figure can't be passed in), `knowledge` 0 to 100, `tools` 0 to 1 (lab, plant, compute, instrument, coach, school tier), `posture` (`lean`, `steady` or `push`) and `u`, a uniform draw supplied by the caller.
- **Record**, about 10 numbers, stored as an optional `fx` on `RdProject`, `TechProgram`, a workshop note or an enrollment: progress, quality, spent, hours, setbacks, insight, fatigue and `last` (the year, for idempotence).
- `quote(task, input)` returns odds, years, quality, cost and a `why[]` list. It is pure and has no luck in it. `step(task, input, rec, year)` takes `u` and returns an outcome (`fail`, `partial`, `works`, `hit`), a margin, a cause and what was learned. Each project still draws one `g.rng` number in today's order, so no seeded run shifts.

### 5.3 The production function

- Effort `E = L^.8 x q x (1 + .3 tools) x rho(A, posture) x phi(F)`. Labor `L` is capped by `cap(1 - e^(-N/cap))`, so too many cooks stop helping. `q` is skill x trait x morale, the way `leadershipPower` (`business/leadership.ts`) already does it. Progress is `E / E_ref / baseYears x k^.5`, with a `minYears` floor.
- Money keeps today's exponents per task type and a hard clamp `k <= kmax` (4). It buys odds and speed. It never buys a lower price.
- Quality uses the AI-bench ceiling: `Q = ceiling - room x e^(-(raw - ref)/room)`, with the ceiling set to the world frontier plus headroom.
- Odds are a sigmoid of named terms: skill gap, `ln k`, tools, knowledge, ambition variance, fatigue, rival pressure, hardness. Each term is a labeled line: "Odds 62%: team +9, funding +7, hard field -12, tired -4". Section 6 decides how exactly the lines show.
- Knowledge `K` per field grows by `(1 - K/110)^1.3` and fades 5% a year when idle. A failure banks .35 x progress as `K` and `ipBook`, worth at most +15 odds points next time.

### 5.4 Ambition

Ambition is a slow trait `A` (0 to 100) plus a yearly posture.

- Player: derived `ambitionOf(g) = .5 willpower + .3 discipline + a talent bonus + a stored shift`. The stored shift is owner-stamped: wins add .4, burnout subtracts 1. R3 writes it as `flags['effort.you']` (C's name), so no new `HiddenKey` and no migration write are needed. When the persona record lands in R4, the reader moves the field into `flags['persona.me']` (7.3) and reads the old key once, so the player ends with one personality record.
- NPCs: `NpcLife.ambition` and `driveOf`. Staff: derived from `STAFF_TRAITS`. Companies: the board mandate sets the default posture (`RD_PER_YEAR` already does).
- Benefit: `rho = .85 + .30 (A/100) x postureFactor`, at most +25% and concave. `A` also widens variance: bolder tasks give a wider spread, with explosion and shortcut risk. Cost: `push` adds strain +10 a year (the household constant), overtime pay and a scandal hazard of about A x pressure. The default (A 50, steady) gives `rho = 1`, so today's numbers hold.

### 5.5 Fatigue and burnout

`F' = .78F + overtime x .65 + posture strain` and `phi = 1 - .004 max(0, F - 35)`. The player's `F` is the existing `householdView().fatigue` (`household.ts` line 21). Staff use morale. At `F >= 85` someone quits or the founder is sidelined. Every failure carries a cause: dead end, starved budget, team churn, shortcut, or rival first. A cause is shown to the player, so a flop is never "flopped in testing" with no reason.

### 5.6 Focus weeks

A person's yearly pool of about 12 focus weeks replaces the yearly counters. Three lessons cost three weeks, so today's numbers hold. Overdoing it becomes fatigue instead of a refusal. There is no weekly simulation: the pool is spent through the same yearly actions the player already uses (decision D16).

### 5.7 Invention domains

Every domain is a `Task` that ends in a `Disclosure` (5.8). Existing domains move onto the engine first (5.10). New ones follow in R6 (school, thesis and PhD), R8 (weapons) and R9 (medicine, software, finance, art, sport):

- Products and platforms (exist; open versus closed standards are added).
- Medicine: drugs (exist), devices, procedures, vaccines. After 2026 `eraCureFactor` follows the world medicine frontier.
- Software: libraries, open source, exploits.
- Weapons: government or contractor programs, secret by default, feeding war strength and export law (section 8).
- Art forms and sports techniques: named styles and methods that others copy or ban over the years.
- Financial instruments: alpha that crowds away, with a systemic-risk term.
- Basic science: PhD and lab papers raise a public world knowledge `K_world`.

### 5.8 Protection

One record covers all three kinds. A patent is disclosed and pays a `patentLaw` fee, term and enforcement. A secret is free and carries a yearly leak hazard of headcount x turnover x spying. An open release has no shield, full spillover, fame and karma. A rival's catch-up lag is development years x tier lag x (patent 1.6, secret 2.5, open .5). The three unrelated patent systems merge into this record in `C/C7`.

### 5.9 World frontier, rivals and spillover

- `world.frontier[field]` (about 24 fields, a `g.world` shard carried to heirs like `heavyWorldFlags`) holds real anchors up to 2026, unchanged, then bounded rival ledgers (6 per field and market, hash luck, never `g.rng`) plus player disclosures. The default seed reproduces today's `heavyArrival` and `capBest` drift, so nothing changes until a player or rival disclosure moves it. The Workshop's future-race deadline becomes a frontier crossing.
- Each Disclosure adds public `K_world` (at most +6 odds points to others), calls `recordEconomicActivity` with innovation (exists), announces a wave past a size threshold through `announceWave` (new `source: 'effort'`, still 2 waves a year), writes market news and the insider rule, moves poaching, and after 2026 sets `hasTech` for fictional future techs.
- Government actor: the budget share times GDP is money, cohort skills are labor, and regime drive is ambition. A President sets the lines and programs (section 8).

### 5.10 Where each system plugs in

This table is the answer to "this for everything in the game". Each row says what feeds staff quality, ambition, money and labor, and what caps the result.

| Sink | Mode | Staff quality | Ambition | Money | Labor | Ceiling |
|---|---|---|---|---|---|---|
| Product, Heavy, Ops, deep tech, AI capability | project | scientists and CEO skill (`launchP`) | board mandate, CEO style | `k` up to 4 | research team fte, capped | quality at most frontier + headroom |
| Workshop | project | helpers, lab access | the inventor's ambition | parts | 3 builds a year | frontier crossing |
| School, thesis, PhD | study | tutors, school tier | the student's ambition | tuition, fixed | focus weeks | grade ceiling |
| Lessons, athletics, kit practice | practice | coach quality | the player's ambition | fixed lesson prices | focus weeks | talent-set skill cap |
| Intel (section 6) | intel | analysts, investigator | the strategy-budget dial | scope-priced fee | hours | sd floor per source |
| Showcase preparation (section 10) | project | presenter and team (`workQuality`) | posture: safe, bold, moonshot | rehearsal spend, 15% weight, saturating | prep time | flat past 2.5x the tier base |
| Military and government programs (section 8) | project | cohort skills | regime drive | budget share x GDP | cohort size | tier effect at most +-20% |
| Career projects (a book, a film, an album) | project | agent, editor, producer (kit team) | the player's ambition | advance and budget | writing and rehearsal weeks | market size by era |
| Mentorship, reconciliation (section 7) | practice | the mentor's skill | both parties | none | focus weeks | protege growth at most x1.15 |
| Operating a firm | existing product of quality x brand x morale x sales x CEO | key staff, CEO | owner ambition and fatigue enter the owner and key-staff factors | existing | existing headcount | existing ceilings |

### 5.11 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** The engine is where the four inputs meet (5.3). Each row of 5.10 states its own.
- **Fog.** `quote` returns exact odds to the engine. The player sees them through the knowledge record (6.2): words by default, a percent after research or with the talent. `why[]` terms the player has not learned show as "unknown factors". `quote` never reveals `u`.
- **Money.** The engine reports `spend` only. Callers keep `b.cash -= n; b.yearCosts += n` today and move to `book()` when their domain migrates. Fees go to a real entity: a lab, a consultancy, a university. Open source and grants create no money.
- **Text and news.** `why[]` lines follow `docs/VOICE.md`. A Disclosure feeds the fact feed (9.4) and can announce a wave.
- **Ceilings.** `k <= 4`, fte cap, `K <= 100`, quality at most frontier + headroom, royalties at most 1.5 times plan, one wave per origin. A 200-year probe at maximum inputs must show no field above frontier + headroom and no money beyond the market.
- **Tests.** A golden parity suite compares each old function with `quote` over an input grid, within 1 point, and gates each migration step. A conservation scan per domain. Idempotence through `last`. Pure `quote` under a deep-frozen state. Rival and world luck is seeded by family and `outcomeTag`, so a Time Machine fork rerolls.
- **Migration.** Each system sets `p0`, years, exponent and talent factor to today's numbers, and the engine adds only deviations from the defaults (A 50, steady, no fatigue, K 0). Order: Product R&D (`launchP` is the skill term, scientists are labor), Heavy, Ops (`LabLevel` becomes K), deep tech (pace becomes posture), AI caps, Workshop, school, lessons, athletics, kit. New fields (`fx`, `know`, the persona shift, `frontier`) are optional and clamped. Person knowledge resets per owner.
- Items: `C/C1` (L) core and parity harness, `C/C2` (M) ambition, fatigue and staff drive, `C/C3` (L) migration of Product, Heavy, Ops, team, deep tech, AI caps and studio, `C/C4` (M) Workshop, `C/C5` (L) school, `C/C6` (L) frontier and rival ledgers, `C/C7` (M) protection, `C/C8` (5 x M) domains, `C/C9` (M) weapons and government programs, `C/C10` (M) disclosure to waves, `C/C11` (S) "why" panels, `C/C12` (M) tests, and `J/J7` (M) staff skill, ambition and labor into R&D odds.

## 6. The information model: estimates, research and fog

Source: area H. Areas B, D, E, F and G share it (6.6).

### 6.1 Problem today

The game is almost omniscient (3.4). The numbers that matter: `talentHint()` appears at 207 sites in 65 files, 98 test files match hint text, and 81 strings print odds. The screens show exact market share, exact rival quality and cash, exact skill at hiring and exact 0-100 bars on every person. Two foresight leaks exist (X2, X19). The gaps:

1. No estimate type: no value carries freshness, confidence or source.
2. No intel actions except VC due diligence and the crooked-manager check.
3. Hints are answers, not sharper estimates, so talents bypass any research layer.
4. Hiring and `PersonSheet` reveal hidden quality at once.
5. Public data (macro statistics) has no lag or revision, and private data (rival cash) is as visible as public data.
6. Rivals neither observe nor misjudge the player.
7. Menus are plain strings (`MenuInfo.text`), so there is nowhere to show a range or a confidence chip.

### 6.2 The rule and the Estimate

Every hidden quantity has a truth (it stays in the engine, untouched) and a key: `mkt:restaurant:us:size`, `riv:<id>:quality`, `ppl:<id>:smarts`, `cand:<id>:skill`, `odds:rd:<id>`, `pol:approval`, `war:<id>:casualties`. The player never reads the truth of a hidden key. They read `know(g, key, truth)`, which returns an Estimate `{c, sd, y, src}`: center, relative standard deviation, year observed, source id.

**Defaults, when the player does nothing.** With no stored record, a passive read is `c = truth x exp(sd0 x z)`, with `z` from `seeded(lifeId|key|year)`. It is stable within a year, so menus stay pure and deterministic. `sd0` by visibility class: public or lagged macro 5%, local market 25%, rival product 30%, private rival cash 60%, and a person's inner traits in word bands only. Experience tightens it: years in a trade, `yearsKnown`, relationship.

**Always known exactly:** own books (cash, debt, statements, net worth), own products and prices, contracts, laws, posted quotes and rates, past realized prices, size classes (small, mid, major, giant), published leaderboards, headlines, anything directly observed.

### 6.3 Research

- An intel action writes a record to `flags.know` (optional, validated, 120 keys at most, pruned by staleness). The update is an inverse-variance merge of the aged old estimate and the new reading.
- Reading noise is seeded per `(key, year, source)`, so buying the same source twice in one year returns the same number. Averaging doesn't work.
- Each source has an sd floor, a cost basis, labor, a bias, a delay and a risk. Free signals: news items with an optional structured `sig`, own experience, conversation. Trade press (annual, floor 20%). A commissioned market report (one-off, 12%). A consultant or analyst (8%). An in-house Intelligence desk: key staff plus a team on the `teamPower` curve (`business/lab-state.ts` line 348), refreshing the top keys yearly. Due diligence or an audit (deal-bound, 3%, `ddCost` in `fund-vc.ts`, 1 to 2% of the deal). A private investigator, spy, informant or hired hacker (sd 10 to 5%, with heat, scandal, and false data from a turned source). Events and conferences (section 10: a visit gives a +-10 band for 3 rivals). Relationships (section 7: sd by closeness and the contact's role).
- Cost and dependence: the price is set by the scope studied (market tier, countries, wage level), never by the buyer's wealth. Reading sd = base x `staffMult(1.5 - quality)` x `spendMult((spend/ref)^-0.35)`, floored by the source. Do-it-yourself uses a yearly action slot and the player's smarts and skill. Ambition is the strategy-budget dial. The Effort Engine supplies inputs and diminishing returns (5.10, `intel` mode), and H defines the output as sd shrink.
- Decay: the stored center never moves while truth drifts. Displayed sd = `sqrt(sd^2 + (drift x sqrt(age))^2)`, with drift per domain (market size 6% a year, shares 15%, rival cash 35%, person feelings 20%, politics 25%). An event (a rival acquired, a scandal) doubles sd. Heirs keep company-bound records at age +5. Personal ones reset.

### 6.4 Showing it without clutter

- One formatter (`know/format.ts`, new): sd at most 6% shows "$4.2M"; at most 15% "about $4M"; at most 30% a range "$3M to $5M"; beyond that a rating word ("mid-sized", "long shot", "even money", "likely"). Odds default to words. A percent, to the nearest 5, appears with the talent or after a research read.
- A chip of 3 dots, plus "as of 2023" only if the reading is 2 or more years old, on detail rows and never on list rows. `conf?: 0|1|2|3` is added to `MenuBase` and `MenuInfo` (`game/types.ts`) and rendered in `MenuList.tsx`. Charts (12.5) draw the same band.
- Each screen ends with one "Look closer" row that lists its intel actions with cost and "sharpens +-25% to +-10%". An Intel Briefing hub lists estimates by freshness with a one-tap refresh and the budget dial.
- Testing and Exact mode: `know/mode.ts` (new) holds a module switch `omniscient | fog` (the pattern of `core.ts` `setMoneyDisplay`). `vite.config.ts` gets `setupFiles` that set omniscient, so every existing string-matching test passes unchanged (market-screen, scorecard, talent and lab-hints tests match exact text). Fog tests flip it per file. Settings, Information offers Realistic (default) or Exact (decision D13).

### 6.5 Rivals, no-foresight and the Investing gut

- `rivalSees(g, rivalId, key)` is a pure seeded estimate of the player (price public, quality 30%, cash 50% unless listed, sd by rival tier and tech). Price wars, raids, copycats and buy-out offers use that estimate, so bluffing, PR, counter-intel and leaks matter. Nothing is stored, and no AI reads a rival's true hidden state.
- Estimates read only present or past truth. Forecasts (expected demand, odds) are the existing `calm` model run on estimated inputs.
- The Investing gut (`invest/instinct.ts`) stays the one documented foresight exception, fenced: no purchasable source, advisor, fund manager or rival may read next year. The free analyst tip (X2) is fixed in R0 and moves behind the talent or becomes signal-based (tilt, wave stage, announced shocks) here (decision D12).
- Talents sharpen estimates: passive sd x0.6 and source sd x0.8 on the talent's domain keys (Business: company, market, rival, staff; Investing: securities, valuations, funds; Acting and Modeling: casting and peers; MainCharacter: all). Purple hints keep the same helpers (`markBest`, `hinting`) but compute on the talent-precision estimate, so they stay honest and can be wrong (decision D11).

### 6.6 Resolutions with the other digests

- D's per-person `known` mask, F's `intel` list, B's war views and E's "check the story" are not separate stores. They are keys in `flags.know`: `ppl:<id>:<axis>`, `show:<edition>:riv:<id>:quality`, `war:<id>:<number>:<channel>`, `story:<id>`. F's cap of 24 intel entries with a 2-year expiry is the same decay rule.
- D wants observation counts per person (3 sightings turn "seems ambitious" into a read). Passive observation counters live as a 2-bit mask per axis in the person's registry row (15 bits), and `know()` is still the only reader. Researched values go to `flags.know`.
- G's charts plot settled own-book data and public data, and anything hidden passes the reveal filter and draws as a band.
- B's "honest odds" rule and H's "odds as words" agree once stated precisely: the odds shown are computed from what you know, labeled "estimate", and the roll uses the truth. A coverage test asserts that the stated band contains the truth about 80% of the time.

### 6.7 Migration order, screen by screen

1. Kernel: Estimate, keys, seeded noise, merge, decay, validators, the omniscient switch.
2. Market Overview, Leaderboard, Rival Profiles, Regions.
3. Scorecards: "modeled" becomes "published" versus "estimated".
4. Annual Report demand band.
5. R&D, board and deal odds to words.
6. Hiring: resume versus interview versus trial, a background check, a trait revealed after a year.
7. `PersonSheet` word ladders, traits revealed one at a time.
8. Company Watch and the economy menu with lagged first-print figures.
9. Politics: polls with a margin, briefings by cabinet quality.
10. Investing: ratings, volatility words, equity research, private valuation as an appraisal range.
11. Careers kit peers.
12. Talents and the 207 hint sites.

### 6.8 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** Intel is an Effort Engine `intel` run (5.10): staff quality, ambition, money and labor set sd shrink with diminishing returns and a floor per source.
- **Fog.** This section is the fog.
- **Money.** Fees are ordinary costs paid to a real consultancy, lab or agency entity (4.5), so the money scans hold. Informant leaks that trade on a tip route through the insider ledger (`business/insider-ledger.ts`).
- **Text and news.** A news item can carry a `sig`, a structured signal that sharpens a key for free. Rumors read current state only, never the future.
- **Ceilings.** No source goes below its sd floor. The same source twice in a year gives the same number. Intel can't be resold. Illegal sources carry real prison and scandal risk (decision D14).
- **Tests.** Coverage (the stated band holds the truth about 80%), same-source-same-year equality, no `g.rng` in reads (the `fuzz-kit` deep-freeze), the no-foresight spy, money scan with fees, a long-run probe, and a grep guard that fails when a menu reads a hidden-key truth directly.
- **Migration.** Bounded, optional, `SAVE_SCHEMA` stays 2. Passive reads are memoized per `(key, year)`.
- Items: `H/H1` (M) kernel, `H/H2` (L) source registry, intel actions, budget dial and Briefing hub, `H/H3` (M) UI chip, formatter, Look-closer rows, Settings, `H/H4` (L) market, competition, rival and scorecard migration, `H/H5` (M) hiring and advisor claimed-versus-true, `H/H6` (M) odds to words plus research, `H/H7` (M) people ladders and trait reveal, `H/H8` (M) investing, `H/H9` (L) politics, macro lag and Company Watch, `H/H10` (M) `rivalSees` and counter-intel, `H/H11` (M) talent rework, `H/H12` (L) intelligence careers, `H/H13` (M) test harness.

## 7. People and relationships

Source: area D. Area A supplies the home and ids (4.2.1, 4.2.3), H the knowledge record, E the dialogue composer.

### 7.1 Problem today

- Real relationship simulations exist and are the best in the repo: wills (`events/will-*.ts`, 2,730 lines: an anger meter, expectation, an escalation ladder, probate), wealth ties (`events/wealth-*.ts`, 4,151: asks by wealth tier, `WealthTies`, entitlement that survives generations), nepo and dynasty (`business/nepo-*.ts` 3,580 and `dynasty-ownership.ts`: `driveOf`, `aptitudeOf`, `fitOf`, resentment, `familyShares`), love (`love.ts`, 3,108), `relationships.ts` (3,718, about 60 interactions) and `npc-lives.ts` (449). `special/kit/rivals.ts` (386) is the right pattern: rivals derive from the family seed and only a 16-row `MemoryRow` is stored.
- `Person` (`types.ts` 378) is a flat record: one `relationship` number from 0 to 100 (374 `addRelationship` call sites), 30 trait words read in about 50 places, `notes` capped at 12 strings, free-form `data`. No NPC-to-NPC relation exists anywhere.
- An NPC's spouse is a string (`spouseName`) and their children are a count (`data.kids`). `dynasty-ownership.ts` says so itself. Cousins are generated per popup (`wealth-family.ts` 52). At least 8 parallel named-person shapes exist.
- Context people are deleted. Classmates and teachers go when school ends (`education.ts` `removeSchoolPeople`). Coworkers are filed under a company-name string (`contextId`) and removed in `endJob` (`core.ts` 583). The heir hand-over (`life.ts` 1353 to 1456) re-rolls every relationship to a random value, clears the notes of living people and keeps only kin plus contacts with an NPC life or a family firm (X15).
- Personality has three unconnected vocabularies (`Person.traits`, `STAFF_TRAITS`, `Manager` integrity) plus `NpcLife.ambition`. The player has none.
- A rumor is a button: relationship down 8 to 15, karma down 3, no spread. There are no secrets, no gossip and no reputation by group.
- NPC pockets are filled by `randomWealth`, and `NpcLife.income` credits `p.money` with no paying employer.
- Popup budgets are separate: wealth 3, nepo 2, will 1, across four yearly hooks.

### 7.2 The registry: three levels of detail for people

The levels are the ones in 4.2.3. In area D's words, latent is seeded, met is named, and intimate is the `Person` in `g.people`.

- **Seeded.** `latent(familySeed, slot)` is pure, built on `seeded()`, never `g.rng`. A slot is `(kind, country, cohort year, ordinal)`: school cohorts, company executive teams, election fields, career rosters, boards, dating pools. It returns `sid`, name, gender, birth year, personality axes, base skills and a deterministic life path. It is the machinery of `rosterAt`, and career rivals and directors become slots.
- **Named** (400 at most; area D called them "met", about 250 B each). A stored delta from the seeded record, keyed by `sid`, in `g.world.people`. Area D placed this at `flags['society.v1']`; it lives on `g.world` so heirs keep it. A record is created when the player interacts, hires, is rivalled, researches, or a company or office links the person. Eviction is by salience (|affection| + resentment + obligation + role weight), never with open debts, spouses, heirs or company links. A 12-byte tombstone (grudge, obligation) keeps the unpaid and the feuding, and the same `sid` regenerates identically when met again.
- **Intimate** (about 80 at most). Today's `Person` in `g.people`. A `data.sid` field is added, and `createPerson` becomes a wrapper that materializes a slot first, so the 55 call sites keep working. Ids stay per life. `sid` is stable across heirs and the Time Machine.
- A per-world name registry stops one name from being two people. The same banker can recur as rival, partner and minister.

### 7.3 Personality

- Five axes from 0 to 100: ambition, honesty, empathy, risk, steadiness. The 30 trait words become labels derived from the axes. Old saves infer axes from traits, with no migration write.
- Readers move over: `NpcLife.ambition`, `Manager.integrity` (it is honesty), `KeyStaff.trait`, `temper()` in `events/will-core.ts`, and nepo `driveOf`. The ambition axis is the same quantity as the Effort Engine's `A` (5.4).
- The player's `persona` is optional, stored in `flags['persona.me']`, inferred from the hidden stats (karma, craziness, willpower, discipline) plus counters, and nudged 1 to 3 per choice with a cap. It selects narrator pools, sets guilt costs for acting against honesty or empathy, and shapes how NPCs read the player. NPC decisions use their `known` view of the player, so nothing reads the true persona (no foresight).

### 7.4 Relationship state, memory and dialogue

- `Edge {a, b, trust, affection, respect, resentment, obligation (-100 to 100), since, last, mem[<=8], lines[<=6]}`. `Person.relationship` stays as the cached summary so existing tests keep their numbers, and `addRelationship` becomes a shim onto affection and resentment. `WealthTies.owes` and `Wl.anger` migrate into obligation and resentment on first read.
- About 40 memory kinds form an enum: loan_unpaid, saved_me, hired_me, beat_me, betrayal, cut_from_will, and so on. Weights decay unless reinforced. Betrayal and rescue are pinned.
- Edges exist player-centered, plus structural kin and rival or company links. NPC-to-NPC edges exist only for a feud, a marriage or a shared company, at most 3 per named person. Cap: 1,200 edges.
- Secrets `{about, kind, severity, heldBy[<=6]}`, cap 40. Leak odds come from the holder's honesty, temper and resentment.
- Dialogue (the composer in 9.2) picks callbacks from `mem` and skips keys already in `lines`. A person's last 8 topics are excluded (`p.data.said`). Twenty talks with one sister no longer repeat a topic.

### 7.5 Life stages and the yearly step

- Seeded people are not stepped. `ageTo(sid, year)` replays their deterministic path when the player touches them (school, job, marriage, children, move, illness, death), forking from stored deltas: being hired by you in 2031 changes the path after 2031.
- Named and intimate people (about 400, O(1) each) run the `npc-lives.ts` loop on the axes. NPC marriages and children become real named records, replacing `spouseName` and `kids`. Illness uses `npcMortality` (`relationships.ts` 896). Deaths go through the existing estate path. Notable events are offered to the news feed, at most 8 a year. A `lastYear` marker keeps the step idempotent.
- Area A's W1 demography (4.2.5) handles the pools. This loop handles named people. They never touch the same person.

### 7.6 Social acts, reputation and heirs

- A typed `SocialAct` has preconditions from state, a consequence patch and ledger lines. The set: favor (references, introductions, votes, hires; capacity is the giver's reach and wealth; one call-in per person per 3 years), loan (existing ties plus terms, default, mutual-friend gossip), betrayal, gossip (hop cap 2), scandal (a secret leaks and reputation moves after a delay), reconciliation (`peaceOdds` generalized), mentorship (protege growth capped at x1.15), rivalry and feud (a ladder of cold, gossip, sabotage, legal, generalized from `Wl.stage`; at most 12 live, one popup a year), and staff loyalty (`KeyStaff` and `Manager` read edge plus morale; poaching and whistleblowing follow honesty and resentment; wages stay on the company payroll).
- Reputation by group: `rep[group]` from 0 to 100 plus `heat`. Groups are family, friends, press, city, country and up to 6 industries (12 rows at most). Each act has an audience and a reach. Reputation is the decayed sum of the acts that group knows, so leaks matter. Effects are capped near +-15% on odds: CV screening, loan terms, investor appetite, approval, ask frequency. NPCs and companies carry the same record, linked to the brand reputation in `business/dynamics.ts`.
- Heirs follow the table in 4.2.7: edges to kin copy at half strength, debts and favors survive through the estate, siblings, cousins and in-laws exist for will contests (`will-feud` gains NPC-to-NPC edges), and friendships and feuds no longer vanish at the hand-over (X15).

### 7.7 Consumers and cast bindings

- Hiring: candidate pools are seeded people for that industry, city and year, with referrals from edges. Ex-coworkers persist and reappear as clients, investors and rivals. Co-founders have complementary skills, and honesty and risk drive dispute events (`familyShares` and `executiveEquity` already take ids).
- Politics: opponents, cabinet, legislators and lobbyists come from slots with party tags, so the 2030 winner can be a 2040 minister (section 8).
- Careers: a named peer becomes a person on first contact (feud, romance, hire, rival firm), at most 32 a life, inside the 400 cap (11.3, `I/K3`).
- Directors, `KeyStaff`, `Manager`, coworkers and classmates become registry people and persist (X24). `g.people` is indexed per year, because `applyNpcRivals` scans it on every planner call.

### 7.8 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** Hiring quality depends on the recruiter's staff quality and the search budget. Mentorship and reconciliation are `practice` runs (5.10). NPC ambition and drive come from the axes. Gifts and loans use real money.
- **Fog.** What you know about a person is a `known` mask over axes, job, wealth band, secrets, health and ties, read through `know()` (6.6). It is filled by time together, conversation, news, third parties (reliability by the gossiper's honesty) and research. A background check depends on investigator skill, money (diminishing) and time. `PersonSheet` shows word ladders, and a trait appears after enough sightings.
- **Money.** Everything goes through `book()` (4.2.4). A static scan, in the style of `career-money-scan.test.ts`, forbids `Person.money` writes in `society/` outside `book`. NPC wealth is seeded and enters the world only when it moves. NPC wages need a paying entity (4.2.6). An estate settles once.
- **Text and news.** Callbacks come from `mem`. Six narrator voices map from the axes (9.2). Notable events go to the news feed, 8 a year at most.
- **Ceilings.** Favor farming (capped by reach, decayed, one call-in per 3 years). Marriage for wealth (shown wealth is not spendable). Loan-shark spirals. Gossip chains (hop cap 2). Adopting NPCs to inherit (estates are conserved and taxed). Mentorship capped. Family may act against the player unprompted (affairs, lawsuits) inside the shared budget of 3 popups a year (14.3, D17).
- **Tests.** Determinism (a seeded record keys only on seed and slot, never on mutable state). The `society/` money scan. A 120-year seeded probe for bounds, NaN and conservation. Yearly idempotence. An old-save matrix. Eviction keeps debts. Heir-switch parity. Golden tests for relationships, love, wealth, will and nepo go in first, because the shim touches 374 call sites and 131,000 test lines.
- **Migration.** Four slices: (1) `D/D1` to `D/D3` behind shims with no behavior change; (2) `D/D5` and `D/D6`; (3) `D/D4` and `D/D7`; (4) `D/D8` to `D/D11`. Budget: under about 250 KB raw (named 400, edges 1,200, secrets 40, feuds 12, reputation 12, memories 8 per edge).
- Items: `D/D1` (L) registry kernel, `D/D2` (M) persona and the trait bridge, `D/D3` (L) edges, memory and the shim, `D/D4` (L) social acts, feuds and staff loyalty, `D/D5` (L) life stages, `D/D6` (L) cast bindings, `D/D7` (M) reputation, gossip and secrets, `D/D8` (M to L) consumers, `D/D9` (M) heirs and dynasty carryover, `D/D10` (M) person profile, relationship web and reputation panel, `D/D11` (M) dialogue callbacks and voice pools, `D/D12` (M) tests. About 20,000 source lines (XL).

## 8. Wars, nations and the UN

Source: area B. Areas C (military research), H (war fog), D (leaders, cast) and I (Military, Politician) share it.

### 8.1 Problem today

- `history/events-wars.ts` (526 lines) holds 67 hand-written `WarDef` rows from 1899 to 2025, with sides, join years, a per-country `DraftRule`, authored `fronts` and a `homeFront`. It is past-only: `warsAt` returns `[]` for `year >= PRESENT_YEAR`, and the Ukraine and Gaza rows end at `PRESENT_YEAR - 1`, so 2026 and every later year are peaceful.
- The same wars are restated five more times, unlinked: 226 `'war'` headline rows, asylum rows (`data/immigration-blocs.ts`), oil shocks (`history/market-events.ts`), a flat 0.3 trade restriction for a home-front war (`economy/trade.ts` line 105), and trade blocs (`business/market-trade.ts`). No alliance, UN or treaty entity exists.
- `special/military.ts` (1,082 lines): five branches, ten ranks, flat pay (X9), a pick-a-path deployment popup with one 80% x 40% death roll, and a wartime draft that follows history. No theaters, command, casualty ledger, veteran benefits, PTSD or war crimes. A general commands nothing.
- Politics 2.0 (`nation/*`, 4,600 lines, and `special/politics.ts`, 2,889) is good plumbing: taxes, budget (a `military` line at 1.8% of GDP, 50 to 200%), tariffs, deals, sanctions, export bans, a legislature, graft, coups, trials. War for a President is one yearly popup (`nation/drama.ts` line 82: mobilize, talks or stay quiet), only when history already has the country at war. The player can't declare war, sign a treaty or use the UN. NPC countries have no leaders or decisions. Portfolios are Finance, Trade and Interior.
- The economy bakes real wars' macro effects into history years. The future is procedural and peaceful.
- Verdict: war is flavor data plus one popup, and nations are statistics. Sanctions and tariffs (`nation/trade-policy.ts`) are the only live geopolitics.

### 8.2 One conflict ledger, derived from the table

The `WarDef` rows stay canon and seed `Conflict` records. Headlines, drafts, the trade restriction, asylum rows and the President popup become reads of that one ledger, so the six places agree. Invariant: a life that never touches foreign policy plays exactly as before, and a test proves it with a byte-identical run.

### 8.3 State

One shard, `world.geo`, with sparse deltas. `SAVE_SCHEMA` stays 2.

- `Nation` (102): era data plus a delta of a fictional `leader {name, party, hawk}`, `readiness`, `mobilization` 0 to 3, `warSupport`, `weariness`, `conduct`, and sparse `relations` (kept when |score| is 15 or more, or on a shared border, bloc or conflict; 12 per nation).
- `Pact` (defense, non-aggression, arms control, League or UN seat): members, years, clauses. Seeded from history (NATO 1949, the Warsaw Pact 1955 to 1991, ANZUS).
- `Conflict` (24 active, 60 archived as one-liners): sides with join years; a phase (tension, crisis, ultimatum, war, ceasefire, peace, reconstruction); intensity; 3 to 5 abstract theaters (names reuse the authored `fronts`; control -100 to 100; attrition); casualties and displaced as aggregates; `script` and `diverged` flags; a cause chain.

### 8.4 The yearly step

Idempotent, after the economy. It ensures scripted conflicts exist, drifts relations (trade ties and democracy dampen, arms races and sanctions raise), and runs the escalation ladder: driven by `hawk`, domestic weakness (a diversionary war), pact triggers and deterrence (strength ratio times pact cover). Each theater resolves from readiness x size x tech tier x supply (the economy's `industry` and `energy` availability) x terrain, with noise from stable hashes (`economicRoll`, `economy/model.ts` 211), never `g.rng` in a read. Then casualties, weariness, opinion (a rally of +8 at most, gone in 3 years), a ceasefire hazard (weariness, attrition, strain, UN pressure), peace, reconstruction and archive. At most one war popup a year.

### 8.5 History versus freedom

- Before 2026 every scripted war happens on its dates for NPCs. The war overlay is zero unless the player diverged, so nothing is counted twice. The player gains power only through office.
- At a decision window (the year before a scripted entry) a President may enter early, enter late or stay out. A divergence budget bounds this. It changes the player's own country (draft, spending, shock, approval, allied momentum) and shifts the outcome date by a few years at most. Other nations' scripted wars still start, unless the player built real deterrence over years (budget, pacts, strength ratio). There is no one-click prevention (decision D9).
- Conflicts open in 2026 become `open`: no invented outcome and no crash in or before 2026. From 2027 geopolitics is procedural and seeded: pairs with existing tension, fictional leaders, neutral wording, a cap on concurrent wars, and no nuclear use ever. A standoff ends in talks or backing down.

### 8.6 President powers and the UN

`powerFor` (`nation/office.ts` 210) gains `defense` and `foreign`, and the Defense Minister and Foreign Minister portfolios are added.

- Diplomacy: summit, treaties (non-aggression, defense pact and arms control are added), embassies and aid. Each has a capital cost and an honest probability.
- Sanctions: unilateral (exists), coalition or UN, asset freezes, arms and oil embargoes.
- Defense: readiness, mobilization, a conscription law (your age band and odds replace `DraftRule`), procurement, officers.
- The ladder: ultimatum, deploy, limited strike, blockade, declare war, mediation, ceasefire, peace terms (territory, reparations of at most 3% of GDP a year that end, demilitarization, tribunals).
- War powers: a presidential system may decree a deployment for 2 years at an approval and legitimacy cost. A declaration needs a legislature vote with honest odds (reusing `nation/legislature.ts`). A parliamentary system needs a coalition and confidence. Emergency rule decrees it but raises coup, protest and sanction risk.
- UN: the League from 1920 to 1945 and the UN from 1946. Five permanent seats (a history table with the 1971 and 1991 changes) and 10 rotating ones. Resolutions (condemn, sanction, peacekeepers, ceasefire, embargo) pass or are vetoed with shown odds. Peacekeepers lower intensity and displacement.

### 8.7 The war economy

A pure overlay through `nationOverlay` (`nation/effects.ts` 260), `shock` and `trade-policy`. It adds no aggregate state.

- Budget: the military line passes 200% only in a declared war (a cap near 25% of GDP). It is funded by debt (the 2.5 cap stays), war taxes (a windfall tax exists) or printing (an inflation shock of +0.15 at most, a declared mint in 4.2.4). War bonds: the player lends to the state, and principal returns with interest.
- Conscription pulls workforce (unemployment down, wages up, then casualty and veteran cost). Rationing cuts inflation, lowers availability and feeds a black market.
- `industry`, `technology` and `energy` rise in combatants and arms suppliers (a new arms flow in `economy/trade.ts`). Logistics, tourism and banks fall. Chokepoints use route `restriction`. A `defense` exposure tag joins the market tags, and war news uses `marketShocks`.
- Refugees: `displaced` flows to neighbors by relations and immigration openness. Hosts gain labor and lose approval in some voter groups. The asylum table becomes derived.

### 8.8 Roles

Every role has shown odds and real consequences.

| Role | What the player does | Odds and inputs |
|---|---|---|
| President or Prime Minister | All of 8.6 and 8.7 | Legislature, approval, capital |
| Defense Minister | Procurement, appointments, the conscription bill | Budget line, staff quality |
| Foreign Minister | Treaties, UN, summits | Relations, capital |
| Finance Minister | War financing | Debt cap, inflation shock |
| General (Military 2.0 on the kit, named rivals) | Rank sets command size. Yearly doctrine: aggressive, attritional or defensive. Exits: politics, a contractor board, a court-martial | Theater math: staff quality, logistics, training, morale |
| Soldier or draftee | Draft popup plus a theater posting, 1 to 3 year tours, wounds, PTSD as a chronic condition, medals, desertion and amnesty, veteran benefits from 1944 (education, a pension from `transfers`) | The conflict's casualty rate, one function for the player and the aggregate |
| Arms maker | Defense sector family. Contracts are bought from the military line (conserved). Export licenses gated by relations and embargoes. Margin caps. Plant seizure. Selling to both sides is a crime | Relations, embargoes |
| Journalist | Verify, publish, self-censor, leak. Moves war support within bounds, feeds tribunal evidence, risks capture | Source quality, regime |
| Protester | Effect only through opinion. Arrests by regime | Opinion |
| Investor | Defense and oil exposure, frozen holdings, bonds. Trading ahead of a war decision opens an insider case (the existing system, `war` cause) | Market tags |
| Refugee or civilian | Displacement, rationing, relatives at war on the same casualty rate (extends `atWar`), asylum odds from host relations | Host relations |
| Spy (area I) | Missions cut the error bar on a target. Exposure means incidents | Intel sources (6.3) |

### 8.9 Casualties, veterans, courts

Counts only: killed, wounded, displaced. Veterans drive a decades-long transfer cost and a voter group. A conduct slider (restrained, standard, unrestricted) is a policy, not a button. It builds a case file (evidence from 0 to 1) that surfaces after defeat or regime change, in the Nuremberg and Tokyo canon and from 2002 an ICC-style court.

### 8.10 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** `techTier` per nation comes from the military R&D budget, contracts and tech waves through the Effort Engine (5.10: cohort skills are labor, regime drive is ambition, budget share times GDP is money), and its effect on strength is capped at +-20%. A General's result uses staff quality, logistics, training and morale. A war doesn't reward money alone.
- **Fog.** Every war number has a truth and a view `{estimate, error, age}` by channel: news (lagged, biased by media control), briefings (error shrinks with the intelligence budget), rumor and spies. Totals are revised years later. The odds shown come from beliefs, are labeled "estimate", and the roll uses the truth (D11). Keys are `war:<id>:<number>:<channel>` in `flags.know` (6.6).
- **Money.** Bonds, reparations, arms contracts, aid and frozen assets all go through `book()`, each with a money scan. Contracts are paid from the military line. Reparations are one-way, capped and booked once. Printing is a declared mint.
- **Text and news.** One fact per phase change goes to the feed (9.4). A War Record screen and an Annual Report war page (12.6). Real present conflicts stay factual headlines. No more than one war popup a year.
- **Ceilings.** War profit through steered contracts (capped by military-line share and margin ceilings, with detection that rises with profit). Insider trades on your own declaration (the insider system). Rally farming (decay, a 4-year cooldown, treaty-breaking costs rating). Conquest snowball (occupation burden, counterbalancing coalitions). One-click history rewrite (the divergence budget and deterrence). Reparation loops. Diplomacy spam (capital cost, diminishing returns).
- **Tests.** Money scans over bonds, reparations, contracts, aid and frozen assets. Casualties equal the sum of person outcomes. An idempotent year. An old save loads with no ledger. A life without office is byte-identical. 120-year seed probes for war count, debt, inflation and state size. Hawk, dove and appeaser modes in `test/fuzz-politics.test.ts`.
- **Migration.** `B/B1` first: derive the reads, with parity tests. Then the nation entity and the escalation loop, then the President actions, so `B/B1` to `B/B5` give a playable war loop before the rest. A detail toggle in Settings sets the level of war text (D10). Size about 22,000 source lines.
- Items: `B/B1` (L) conflict ledger, `B/B2` (L) nation entity, `B/B3` (L) tension, escalation and the divergence budget, `B/B4` (L) theaters, casualties, ceasefire and reconstruction, `B/B5` (L) President and minister actions, `B/B6` (M) UN, treaties and tribunals, `B/B7` (L) war economy, `B/B8` (L) company effects and the defense sector family, `B/B9` (L) Military 2.0, `B/B10` (XL) journalist, protester, spy, refugee and investor hooks, `B/B11` (M) fog of war, `B/B12` (M) military research tier, `B/B13` (M) War Record UI, `B/B14` (L) tests and probes.

## 9. News, non-repeating text and the year digest

Source: area E. Area G supplies the notice digest and the Paper screen, K the content pipeline, F and I the showcase and career hooks.

### 9.1 Problem today

- **Events.** `events/*` is 30,836 lines. `events.ts` (425) picks one popup a year (chance 0.72) from `EVENT_LIBRARY`: 372 definitions (136 era-pack), 209 on the default 10-year cooldown, 65 `once`, and 33 to 45 eligible at any adult age. Memory is `lastFired`, 15 `EVENT_KINDS` groups (3 years) and the same person for 5 years.
- **Text pools.** `events/flavor.ts` (673) holds 341 base lines plus 4,418 era-pack lines, gives 1 to 2 log lines a year, and keeps `flavorRecent` (60 keys), the only line memory in the game. Everywhere else there are 785 inline `pick(g,[...])`, 168 `pick(g,CONST)`, 77 `eraPick` and 45 `v(g,...)` sites: uniform random, no memory, and one `g.rng` draw each, so text choice moves the simulation (X21). There is no composer, and the 30 traits barely touch text.
- **Dialogue** is a summary line (`relationships.ts` 2292: 32 topics, 5 openers, 5 tails, 3 talks a person a year) with no memory and no voice.
- **News.** `history/events.ts` (206) has 1,505 hand-written headlines for 1900 to 2026 (about 12 a year) and 144 procedural ones after. Only the top one is logged ("1969: ..." behind a newspaper icon, 54 characters). There is also an `investments.ts` priority popup, `market.news` (20 at most, read only by the Heavy R&D menu) and economy `causes` (logged on 3 triggers). No newspaper screen, outlets, bias or player stories exist, and about 100 simulated countries run unreported.
- **Digest.** `history/digest*.ts` writes one "1985: culture... prices" line, behind a calendar icon, that averages 312 characters against a 110 cap and is 41% of log characters in historical lives. The log is flat: `{id,text,tone}`.
- **Voice.** `docs/VOICE.md` and `scripts/voice/*` exist. The report misses 9 of 10 targets (1,014 fragment punchlines). The only hard guard is em-dashes at most 24 (`test/voice-guards.test.ts`). Per-area tests (lab, sector, model, CEO letter, obituary) run copy tables through `unitFlags` and `staticLength`: the pattern to reuse.
- **Pacing.** Each engine paces itself. No global budget exists. There are 35 yearly hooks, 1,831 `notice()` and 1,917 `log()` sites. The measured result is in 3.5: up to 13 popups and 19 log lines a year.

### 9.2 Non-repeating text

A new folder `src/game/text/` (about 12 files).

- **Fresh pick, the migration key.** `pickLine(g, lines, fam?)` draws exactly one `rand(g)` like `pick`, so no seeded run shifts until memory excludes a line. Pools of 12 or fewer are shuffle-bags. Larger pools exclude the last `floor(n/2)` lines, at most 8. The family key defaults to a hash of the pool, so a codemod over the 785 plus 168 sites needs no names. `v()` and `eraPick` cover about 120 sites in two edits.
- **Memory.** `g.flags.textMem`, optional and validated: 300 pools x 6 indexes, 120 families (last year, count in 10 years), reset per generation. Per person, `p.data.said` keeps 8 topics. About 8 KB.
- **Presentation text** (news, digest) uses `hpick(lifeId, year, key)`, a hash like the CEO coda in `business/career.ts` (`withCoda`), never `g.rng`.
- **Composer.** Frames with slots. Fillers are tagged by era, wealth tier and mood. Six voices (warm, blunt, dry, anxious, grand, sly) map from the personality axes (7.3; E mapped them from the 30 trait words), with the speaker's voice weighted 3x. Dialogue is opener x topic (about 60, by age and era) x reaction (voice, relationship) x tail, with the last topic per person excluded. Thousands of combinations come from about 800 lines.
- **State lines** `stateLine(g, key, value)` print on a threshold change or every 5 years, in 3 variants. "My sister has been avoiding me" stops printing 48 times.
- **Family pacing for every engine.** A `family` field on event and ask definitions, one shared memory replacing `EVENT_KINDS`, weight x0.25 for a family seen in the last 5 years, and an ask family at most once in 4 years unless a storyline holds it.
- **One store, not three.** F's `recent` ring of 24 clause ids and I's per-life deck are families in `textMem`, not separate stores. K's content pipeline (13.7) is the build-time check of the same pools: era gates, voice lint and `seen` rings from one definition.
- **Tests.** A `text-kit` test plays 4 lives to age 90 (about 25 s, 20 lives nightly): repeated lines at most 5% (8% for rich lives), the same line within 10 years 0 (state lines 1 per 5), any line at most 3 times, a popup family at most 6 a life with a gap of 4 or more years, shared 3-word openers at most 12% (20% for rich lives), popups p90 at most 4, a person's last 8 topics distinct. A registry test runs every line registered through `defineLines` (new) through `unitFlags`.

### 9.3 The year digest

- `log()` and `notice()` gain optional `s` (source: the yearly hook name, set by `aging.ts` around each hook, so 35 sources and no call-site edits), `a` (amount) and `w` (weight 0 to 3 from a 120-title table). +12 bytes a line.
- `closeYear(g)` is called from `ageUpAction` in `ui/store.ts` (line 440), not from `ageUp`, so tests that read `g.queue` stay green (decision D18). It keeps decisions in order and at most 3 notices (4 to 5 in a life-changing year) by weight, then magnitude. It folds the rest into the log with stable ids (the `news-${gen}-${year}` precedent). It merges near-duplicates by `(source, skeleton)` with summed amounts ("3 companies lost $1.7M on $18M"). It queues one digest notice (`NoticeModal.digest?`, no new modal kind). Weight 0 and 1 outcomes become log-only.
- Order of the digest: headline of the year (90 characters), three stories (90), a money line from the ledger (a test checks it against the books), people (3), a world line, then collapsed categories with counts that expand on demand. At most 8 lines by default. The last 3 digests stay in `flags.yearBook`.
- Budgets: unrequested choices 3 a year. Extras wait in `pendingAsks` (6, expiring in 2 years). Targets: ordinary lives popups p90 3 and max 5; $50M lives p90 4 and max 6; tycoons mean 4 plus one "Your companies" card, with the visible log down from 12.5 to 8.
- The digest is the last popup for the first 10 years, then an inline card (D20). The 127 culture lines get rewritten to 110 characters (`scripts/voice-batch.mjs`), and prices stay in the This Year menu. The `isNewsLine` quiet test in `life.ts` (line 1995) is swapped for `s`.
- Relation to area G's notice digest (12.4): G's step 1 merges consecutive notice heads in `ModalHost` with no engine change and ships first. G's `'minor'` is E's `w <= 1`: one field, `w`. Until `closeYear` lands, the top 20 emitters carry provisional weights.

### 9.4 News: the Paper

- **Facts, not strings.** `emit(g, {k, y, c, a, v, s})` is called by systems and by detectors over the economy, markets, NPC companies, rivals, waves and nations. Facts land in `g.world.facts`, a bounded log. K's typed bus delivers events to handlers that write only their own slice, and the newsworthy subset is appended here. A stored story is about 70 bytes `{k,y,c,e,v,s,o,sec}`. Headlines render at read time from fact, outlet and template. (A's `flows` are aggregates for money; `facts` are discrete events for news. They are different tables.)
- **Sections:** World, Nation, Business and Markets, Tech, Sport and Culture, Local, Gossip. An edition is a front page plus 33 stories. Three editions are kept in full, plus a 30-year archive of front pages and player stories, at most 30 KB. One edition a year, live through the year and sealed at age-up.
- **Sources:** the history table (the scripted layer; wars come from section 8); economy detectors (recession, inflation over 8%, unemployment +2 points, rate +100 bp, currency -10%, housing -8%, bank stress, shortage); index moves; listed-company scandals, bankruptcies and takeovers (today seen only by holders); `market.news`; rivals; politics; crime; NPC lives.
- **Score:** severity x4 + nearness (city 3, country 2, partner 1) + player relevance (up to 6) + first of its kind 2, minus 2 per repeat.
- **Outlets and bias:** fictional only ("{City} Courier", "Meridian Wire", trade press), with lean, sensationalism, trust, era reach (`techOdds`) and regime control (`nation/regime.ts`: state outlets drop or spin). Tabloids round magnitudes up, at most 20%. Rumors read current state only, never the future. Exact figures need "check the story" (staff and money, 6.6).
- **Player stories by fame** (0 to 100): local 15, national 35, front page 60, world 85. Effects go only through `fame` and `notoriety` (the `addHidden` limits) and brand within its 16-point cap.
- **Voice:** new `scripts/voice/rules.mjs` roles `headline` (cap 70, aim 55) and `deck` (cap 110, aim 90). Old keys are untouched.

### 9.5 Hooks and pacing

- A hook is an offer (endorsement, interview, book, headhunter, takeover, contract), a threat (a scandal story with deny, settle, sue or buy-silence; a regulator; a boycott) or a tip from realized facts. One popup a year. The rest wait in "Tips and Offers" (6 open, 2-year expiry).
- Money moves only with real counterparties: an NPC firm pays an endorsement, at most 2% of its marketing spend, and legal fees go to an NPC firm, both through `book()`.
- The showcase hook (section 10): a fixed calendar of fictional fairs appears in the Paper as scheduled events, never as outcomes (D19).
- The Paper screen with source chips and links is built in section 12.7.

### 9.6 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** A publicist on the kit team (11.3) and the player's persona decide how a scandal story lands: staff quality and honesty shift the odds, money buys a settlement from a real counterparty, and media training is a `practice` run (5.10).
- **Fog.** Outlets differ in trust and reach, and state outlets spin. Numbers in the Paper pass `know()`. A headline never announces a future outcome.
- **Money.** The digest's money line reads `flows` and a test checks it against the books. Paying hooks need real NPC cash and a ceiling.
- **Text and news.** This section is the text and news layer.
- **Ceilings.** Buzz is capped. No foresight in rumors. Stories are keyed `${year}:${kind}:${subject}` and `closeYear` is stamped by year, so both are idempotent. Folding must not hide something important: the weight-3 list is reviewed, and a notice is never folded before a choice.
- **Tests.** The `text-kit` test above, `closeYear` tests (popups p90, no fold before a choice), and news conservation, determinism and size tests (`E/N8`).
- **Migration.** Order: `E/T7`, `E/T1` to `E/T3`, `E/D1` to `E/D3`, `E/T5`, `E/T4`, `E/N1` to `E/N7`. A changed text draw shifts seeded tests, so each pick keeps one draw and each family changes in its own PR (about 31 test files mention `pick`). `uid()` shifts hashed picks, so derived lines get stable ids. Save size: log +12 KB, news and memory about 38 KB.
- Items: `E/T1` (M) kit, `E/T2` (M) repetition harness and nightly probe, `E/T3` (M) codemod and state lines, `E/T4` (L) composer, voices and dialogue memory, `E/T5` (M) family pacing, `E/T6` (M) variants for the top 60 events, `E/T7` (S) voice roles, `E/D1` (M) log fields and weight table, `E/D2` (L) `closeYear`, `E/D3` (M) digest card and collapsed log, `E/D4` (S) culture lines, `E/N1` (L) facts and detectors, `E/N2` (L) outlets, bias and templates (60 kinds x 3 classes), `E/N3` (M) editions, scoring, follow-ups, `E/N4` (M) player stories, `E/N5` (L) hooks with conserved money, `E/N6` (L) Paper screen, `E/N7` (M) showcase hook, `E/N8` (M) tests. About 30,000 lines with tests.

## 10. The Show Circuit: showing off your product at events

Source: area F. Areas A (payees), C (`workQuality`), E (composer, news), H (intel) and I (career adapters) share it.

### 10.1 Problem today

- **Launch is silent.** `business/rd.ts` `advanceRd` rolls quality, sets `launched: year+1`, adds brand +3 or +8 and shows one "R&D Results" popup. There is no date, price positioning, press, hype or order book. `product-market.ts` (634) compares lines with rivals by hash thresholds, so rivals never launch on a date.
- **Rival products are free knowledge.** `rivalsMenu` prints a line like "Sells: X (64), Y (58)" for every rival, exact.
- **Marketing is sliders:** `marketingLevel` 0 to 3, a one-year `campaignBoost`, brand drifting 20% a year, regional campaigns (`market-strategy.ts`) and the studio "Trailer Drop".
- **Costs have no payee and scale with wealth.** `b.cash -= cost; b.yearCosts += cost`. `scaledCost` and `scaled()` in `business/events.ts` (line 52) use max(US base x sqrt(outlets), revenue x share).
- **Events are private and flat.** `events.ts` (1,058), `events-extra.ts` (987) and `competition-events.ts` (827) hold about 30 events, one a year (30%, 18% when managed). A celebrity endorsement is a fixed 15% scandal.
- **Showcases exist in five places and share nothing:** deep-tech `SHOWCASE` (`deeptech-menu.ts`, 4 trades, once a year, `p = clamp(0.3 + level/180 + safety/400)`); the AI Lab release popup (`deeptech-bench.ts` `releaseText`); studio hype and Trailer Drop (`gamestudio.ts`); `attendConvention` in `gamedev-career.ts` ($250, canned lines, person only); the legacy model Fashion Week (one roll, paid by `earnIncome`); the Workshop pitch show (`workshop/market.ts` `pitchOdds`).
- **Awards are mostly dead.** Studio `awards` is always `[]` while a x30 term reads it (X8). The author prize is one 12% `stableRoll`. Only the actor `stepAwards` and the music award night are real.
- **IPO** (`exit.ts` `goPublic`) has a day-one pop but no road show, investor day or analyst.
- **Templates worth copying:** `special/music-tour.ts` (316 lines: a gate, a 25% promoter, crew, travel, merch, exact identity), the kit ledger `c.earn` and `c.pay`, sector families (`sector-kit.ts`), kit `Stance` crises with one `optionOdds`, `recordEconomicActivity` receipts keyed by id and year, and `outcomeTag` for forks. Timing and insider machinery exists (`tech-waves.ts`, `wave-insider.ts`).
- **Payees already exist as rows.** TIFF, Glastonbury and Edinburgh Fringe are `entertainment` rival rows, and JWT, Ogilvy and Nielsen are `marketing` rows (`business/market-data-services.ts`). `business/economic-actors.ts` gives rivals cash and debt.

### 10.2 Entities

- `ShowSeries`, static, about 90 rows: id, name, kind, host city, years, cadence, a season slot from 1 to 4, trades served, a tech gate (`hasTech`), prestige, tier prices and an organizer row id (an existing entertainment, hotel or marketing row, otherwise a generic sink).
- About 18 kinds: auto, electronics, games, film, fashion week, science and world fair, air and defense, food, book, music and awards, medical, build, travel, industrial, investor conference, fan convention, self-hosted keynote, demo day.
- Era anchors from real analogs: motor shows from 1900, a Cannes-class festival in 1946, electronics in 1967, a phone congress in 1987, a game expo in 1995, keynotes in 2008, AI launches in 2023. The 2020 and 2021 editions run virtual at 40% reach. A war at the host city cancels the show (read from the conflict ledger, 8.2). Post-2026 successors are seeded from the family id.
- `Edition(series, year)` is derived and pure: city, buzz 0 to 100 from prestige and wave hype, attendance, and the rivals present (the top 12 by pull from `fieldFor`).
- Stored, optional, through `readShows`: `BizState.shows?` with up to 12 entries `{id, year, tier, lines<=3, staff<=3, presenter, celebs<=2, stance, spend, result}`, plus `rep{press,trade}`, `hype{family}` and `deposits`. F also kept an `intel` list (24 entries, 2-year expiry) and a `recent` ring (24 clause ids). Both move: intel becomes keys in `flags.know` and the ring becomes a composer family in `textMem` (6.6, 9.2). The world shard `g.world.shows` holds winners and awards (60 at most), shared by heirs and rivals.

### 10.3 The yearly step

`settleShows` runs before `bookYear` and writes one receipt per `show:${asset}:${edition}`, so a re-run does nothing. A show may be booked at any time. Settlement draws by hash (family seed, company, edition, salt), never `g.rng`, plus the player's stance. There is no save-scumming and menus stay pure. Budget: one choice and two notices per company-year.

### 10.4 The score

One pure `showScore(inputs)` feeds the roll, the hint and the best-stance flag.

- 40% product: `effectiveQuality` of the lines shown minus the field's version (`edgeOf`), and novelty (new 1.0, old 0.5, third year -20%). A prototype (an R&D project at least 50% done) risks a crash of (1 - progress) x risk.
- 25% presenter and team: for an owner, 0.4 smarts + 0.2 looks + 0.2 fame + experience. For a hired CEO, executive skill. `staffPower` for sales and quality, a charmer or visionary trait, and rehearsal spend. It shares `workQuality` with the Effort Engine (5.10).
- 15% budget: `1 - exp(-spend / tierBase)`, flat past 2.5 times the base.
- 10% timing: wave delivery minus hype. High hype raises expectations, and quality below them costs brand.
- 10% luck, from a hash.
- Stance `safe`, `bold` or `moonshot` (A = 0, 1, 2): mean +6A, variance x(1 + A), incident 3% + 5A% (cut by rehearsal).

Rivals score with the same function from quality, tech and tier. The output is a rank of N, a tier (best in show, standout, seen, overlooked) and an incident (demo crash, leak, safety, celebrity no-show).

### 10.5 Player actions

Under Company, Shows & Events. Careers get the same rows through the kit adapter. Visit. Book a table, booth, island or flagship. Self-host a keynote (venue plus production; the audience is limited to your own brand and hype). Sponsor (no demo risk, steeply diminishing returns). Set audience weights that sum to 100 (press, trade, investors, talent). Invite up to 2 celebrities (a fee by prestige, a hidden risk shown as a word). Skip. Join a boycott (cuts the organizer's income and buzz). Yearly caps: 2 booths, 1 keynote, 3 visits. A hired CEO follows a policy (none, modest or ambitious), and a flagship needs a board vote. The calendar and exhibitor list are public.

### 10.6 Consequences (bounded and decaying)

- Demand: `showBoost` at most +0.15, halving each year, beside `campaignBoost` in `appealOf`. The product of all promotion terms is capped at 1.35 (X13).
- Orders become customer deposits, a liability recognized at delivery and refunded if delivery slips over a year. They pull forward at most 25% of next year's modeled sales.
- Brand -8 to +6 a show. Hype per family is at most 60 from shows and decays x0.85.
- Stock: `showMood` at most +-4% a show, +-8% with waves, only for the top quarter and above-median quality. A fresh position opens an insider case.
- Hiring: `rep.trade` lifts candidate skill by 0 to 6. One partnership offer per show from existing modules (B2B bid, franchise pitch, VC round, publisher, label, agent).
- Rivals: an outscored rival gets a bounded `RivalMod` (a price cut or +3 quality over 2 years).
- News: one market headline per edition (id `show-series-year`), and one for the company if it ranks top 3 or has an incident. Awards are records (up to 5 finalists), and the studio x30 term is clamped. Real-brand rivals only win or lose rank: they never crash and have no invented scandals (`data/brands.ts` rules).

### 10.7 Across trades and careers

- Trades, through a `SHOW_FAMILIES` registry. Restaurants, cafes and bakeries bring dishes to food festivals (the head chef and supplier decide; stars; walk-ins). Banks and funds attend investor conferences (capital ratio and returns; inflows; no demo). Studios bring a build to the expo (bugs drive crash risk; wishlist hype; publisher offers; this replaces Trailer Drop). AI labs launch models by keynote (`labStanding` against the best rival; open or closed; a safety incident). Devices use spec-versus-market rows. EV makers show concepts. Biotech presents trial data. Fashion walks the model career's week. The 4 deep-tech showcases become configs.
- Careers, same score through the kit adapter: the actor at festival competitions against named rivals, the author at book fairs (rights sales, shortlist), the musician at awards and showcases, the model at fashion week (replacing the legacy roll), the developer at the convention (replacing `attendConvention`), the inventor at the fair.

### 10.8 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** Presenter and team quality, posture and rehearsal (ambition and labor), booth spend (money, saturating at 15%) and product quality from the Effort Engine all feed `showScore`. A hired CEO's policy sets the default posture.
- **Fog.** The calendar and exhibitor list are public. A rival's product shows only to attendees: a visit gives a +-10 band for 3 rivals, a booth +-5 for neighbors, one reveal per rival family per year, stored as expiring keys in `flags.know`. Non-attendees get headlines a year late. The exact score parts need a paid debrief.
- **Money.** Booth fee to the organizer's rival actor (intercompany and eliminated if the player hosts). Stand, freight and travel to the services sink through `recordEconomicActivity`. Talent fees. Ads to marketing-row agencies. Tickets and sponsorship when hosting. Exhibitor fees come from rival cash, capped at 0.8% of sales, and tickets are consumer spending from the economy aggregate. Tier prices are fixed per series and scaled by `localEcon` only, never by revenue. Tests: the company's cash delta equals the ledger sum, and fees paid equal organizer income.
- **Text and news.** A composer fills slots (opener, decisive factor, consequence, incident) from about 8 x 6 x 6 x 4 clauses per tier with real facts: rank, rival names, product, queue, a books number. Lines obey `docs/VOICE.md` caps. Test: 100 shows with no identical outcome within 10.
- **Ceilings.** Pump and dump (capped mood, a top-quarter gate, the insider case). Spend to win (the budget weight is 15% and saturating). Intel farming (noise, three rivals a visit, expiry). Award farming (one per category per 3 years, and the x30 clamp). Orders into an IPO (deposits are liabilities, and valuation reads earnings). The field is built only for booked or visited editions.
- **Tests.** The conservation scan, an idempotent re-run, hint equals roll over 10,000 draws, a 100-year probe over 40 lives, text uniqueness, a Time Machine reroll, the real-brand scandal ban, and an era gate (no video keynote in 1950).
- **Migration.** The payee interface is built first (organizer rows exist), then the score, state and menu, then six families (food, finance, studio, AI lab, devices, deep tech), then the career adapters. Hosting an organizer comes after those (D22).
- Items: `F/F1` (M) series, editions, era and cancellation, `F/F2` (L) score engine and rival field, `F/F3` (L) state, ledger, receipts, deposits, payees, money scan, `F/F4` (M) menu, booking, CEO policy and board vote, `F/F5` (M) consequence wiring, `F/F6` (L) composer, pools and ring (shared with E), `F/F7` (XL) trade adapters, `F/F8` (M) career adapters, `F/F9` (M) hosting an organizer, `F/F10` (S) awards ledger, headlines and Annual Report block, `F/F11` (M) tests and probes. About 9,000 source and 2,500 test lines.

## 11. Careers kit v2 and every special job; the depth rubric and the gate

Source: areas I (careers) and J (business benchmark and rubric). Areas A, B, D, E, F, G and H supply the modules the kit reuses.

### 11.1 Problem today

- Business is 63,065 lines in 189 files with 209 test files (61,000 lines). The four kit careers are 3,600 to 5,100 lines each. The other careers are 817 to 9,188 lines of mostly single-loop code.
- The shared kit (`special/kit/`: `careers.ts`, `crisis.ts`, `menu.ts`, `rivals.ts`, `state.ts`, `year.ts`, 1,316 lines with 2,414 of tests) gives a state record, an idempotent year, named rivals, report cards and crises with odds. It has no ledger, team, awards, exit, legacy, news, fog or text module, so each finished career rebuilt them privately (`actor-team.ts`, the music `CEREMONIES`, `model-exit.ts`, `adoptMaster`).
- A kit career offers at most 1 choice and 2 notices a year (35% odds) and has about 5 to 7 crisis types, against business's seven event modules. Rivals are derived names, never `Person` records. Income comes from anonymous payers.

| Career | Source lines | Test lines | On the kit | Rubric /51 | Honest state |
|---|---|---|---|---|---|
| Actor | 5,062 | 5,103 | yes | 34 | agent, manager, pipeline, awards, 5 crises |
| Astronaut | 3,742 | 4,163 | yes | 31 | corps, class, flights, inquiries, 7 crises |
| Model | 3,646 | 3,700 to 4,000 | yes | 32 | season board, agencies, 3 exits |
| Musician | 3,777 | 4,593 | yes | 36 | label deal, format eras, chart, tour P&L, 7 events |
| Author | 1,159 | about 1,280 | no | 17 | works, serial focus and pace. One imprint name per format, one prize, no rivals |
| Influencer and fame (`social.ts`, `fame.ts`) | 2,190 | about 40 (`fame.ts` 0) | no | 14 | 6 era-gated platforms, 26 post types, a viral roll, a sponsor popup, hacks. No rivals, brand ledger or niche |
| Politician (`politics.ts` plus `nation/`) | about 7,500 | 1,700 to 1,900 | no | 34 | The best legacy career: laws, budget, tariffs, votes, graft, case files, coups. The opponent is a random string |
| Sports | 9,188 | 900 to 1,100 | no | 30 | team, 12 individual sports, MMA, boxing, sumo, wrestling, esports, Olympics, youth, coaching. League tables are strengths, and individual fields are `leader x 0.84^i` |
| Game employee | 4,369 | 1,300 to 2,000 | no | 32 | 4 tracks, 7 levels, crunch, layoffs, industry cycle. Studios are generated listings |
| Street Hustler | 817 | 0 | no | 8 | 10 acts, 6 works a year, 4 encounters. Pay is not era-scaled |
| Military | 1,082 | 0 | no | 18 | 5 branches, two ladders, flat pay (X9), a deployment minefield, a draft, medals |
| Crime (`crime.ts` 3,908, `underworld.ts` 215, `prison.ts` 2,459) | 6,582 | 493 | no | unscored | A mafia family with 5 ranks, heists, trials. Not in the Special menu. It becomes the Underworld career |

The digests count test lines a little differently, so ranges are given. The gaps: eight careers are single-loop, none has news, a showcase, fog or a text deck, staff quality changes outcomes only for the actor's agent, only a likeness trust and a master inherit, only astronaut and model have exits, and sponsors, publishers, leagues and donors pay from nowhere (X6, X7, X23). A President has no war, UN or foreign policy (section 8).

Business has its own debts, which the gate makes explicit (11.5): 17 trades run only the classic engine, and the benchmark itself scores 1 on fog and showcase and 2 on research, reports, news and text.

### 11.2 The depth rubric

Each dimension scores 0 (absent), 1 (token: a stat or menu row), 2 (working: state, a yearly step, a choice and a test) or 3 (meets the bar, which is also its acceptance test). It extends the five-layer rubric of the careers slice 1 spec (loop, choices, world, rivals, arcs). Area J numbers the dimensions R1 to R17. This document writes RD1 to RD17 so they can't be confused with the release ids R0 to R12.

| # | Dimension | The bar for 3 |
|---|---|---|
| RD1 | Ladder | 5 or more named rungs in a data table, each gated (year, country, skill, money, standing), with a ceiling and a way down. A seeded walk reaches all, and none opens before its era |
| RD2 | Living field | Named rivals by era, country and cohort (seeded, or stored, 192 at most), ranked by a pure function, with memory, competing for the same slot under the same odds. No peers where no field exists |
| RD3 | Money and books | One ledger, a named source and sink per dollar, a yearly statement, gross equals parts. A scan test plus a 30-year identity test. No minted money |
| RD4 | Assets | 3 or more kinds that hold value, can be sold or licensed and pass to an heir. Capped, and counted once in net worth |
| RD5 | Team | 3 or more hire roles as `Person` records (as `actor-team.ts`) with skill, loyalty, cut and poaching. Quality feeds 2 or more outcome formulas (a fixed-seed swap test) |
| RD6 | Law | 6 or more country or era rules enforced inside actions (a direct call is refused), one regulator, claim or audit event, and 10 or more countries differ |
| RD7 | Crises | 20 or more event rows, 3 stances, odds from the one function the hint prints, at most one choice and two notices a year. A 100-life cadence probe |
| RD8 | Research and craft | 3 or more tracks. The price is fixed by the project, not wealth. Outcome rises with money (double the budget gives under 2x odds), staff quality, ambition and labor, with ceilings and flops |
| RD9 | Reports | A statement, a 30-year series (6 numbers a year), rank against the field, milestones. Pure, with an idempotent re-run |
| RD10 | Fog | Each hidden fact has a paid or earned reveal kept as state. The default is an estimate band, no text leaks it, and no foresight |
| RD11 | Exit and legacy | 3 or more exits that settle money, a legacy score, an heir fixture test |
| RD12 | Automation | A hired manager or agent mode with a mandate, limits, a yearly letter (12 words a line), no irreversible moves, and lockouts enforced in actions |
| RD13 | History and country | First-year tables, 10 or more countries differ, no anachronism over a 1900 to 2040 start-year sweep |
| RD14 | World hooks and news | Reads 2 or more world signals (war, cycle, wave, policy), writes at most one news item a year, and a war-year test changes the output |
| RD15 | Showcase | A yearly public event (launch, premiere, tour, fair, ceremony) with spend, odds and a bounded reputation or sales result |
| RD16 | Text and clutter | 3 or more variants per branch, no repeat in 10 years, VOICE caps, a voice test, counted over 200 lives |
| RD17 | Tests | Unit, seeded balance (3 styles x 2 seeds x 10 years), opt-in fuzz, money scan, an old-save fixture, idempotence, and a ceiling test (160 years under an era cap, like `test/growth.test.ts`) |

Scores today (B business, A actor, S astronaut, M model, U musician, Au author, In influencer, Po politician, Sp sports, Ga game industry, Hu hustler, Mi military):

| | B | A | S | M | U | Au | In | Po | Sp | Ga | Hu | Mi |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RD1 Ladder | 3 | 2 | 3 | 2 | 2 | 1 | 1 | 2 | 3 | 3 | 1 | 3 |
| RD2 Field | 3 | 3 | 3 | 3 | 3 | 0 | 0 | 3 | 2 | 1 | 1 | 0 |
| RD3 Money | 3 | 3 | 2 | 3 | 3 | 2 | 1 | 2 | 2 | 2 | 1 | 1 |
| RD4 Assets | 3 | 2 | 1 | 1 | 3 | 2 | 1 | 1 | 1 | 3 | 0 | 0 |
| RD5 Team | 3 | 3 | 1 | 2 | 2 | 1 | 0 | 2 | 1 | 2 | 0 | 0 |
| RD6 Law | 3 | 2 | 2 | 2 | 3 | 1 | 1 | 3 | 2 | 1 | 1 | 2 |
| RD7 Crises | 3 | 2 | 2 | 2 | 2 | 1 | 2 | 3 | 3 | 2 | 1 | 2 |
| RD8 Research | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 2 | 2 | 1 | 1 |
| RD9 Reports | 2 | 2 | 2 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | 0 | 1 |
| RD10 Fog | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 0 | 0 |
| RD11 Exit | 3 | 2 | 2 | 2 | 2 | 1 | 1 | 2 | 3 | 2 | 0 | 2 |
| RD12 Automation | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| RD13 History | 3 | 3 | 3 | 3 | 3 | 1 | 2 | 3 | 1 | 3 | 1 | 3 |
| RD14 News | 2 | 1 | 2 | 1 | 1 | 0 | 1 | 3 | 1 | 2 | 0 | 2 |
| RD15 Showcase | 1 | 2 | 1 | 2 | 3 | 0 | 1 | 2 | 3 | 2 | 0 | 0 |
| RD16 Text | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 2 | 2 | 1 | 1 | 1 |
| RD17 Tests | 3 | 3 | 3 | 3 | 3 | 2 | 1 | 2 | 1 | 2 | 0 | 0 |
| **Total /51** | 43 | 34 | 31 | 32 | 36 | 17 | 14 | 34 | 30 | 32 | 8 | 18 |

Mean of the 11 careers against business: RD12 0.1 against 3, RD10 0.7 against 1, RD5 1.3 against 3, RD8 1.3 against 2, RD14 1.3 against 2, RD4 1.4 against 3, RD9 and RD16 1.5 against 2, RD2 and RD11 1.7 against 3, RD6 and RD17 1.8 against 3. Nearest already: RD13 at 2.4, RD1 at 2.1, RD3 and RD7 at 2.0. Evidence for the key rows: RD2 `kit/rivals.ts` (386 lines), RD5 `actor-team.ts` (461), RD8 `rd.ts` (odds from budget only), RD12 only in business (`board-ceo.ts` 729, `sector-ceo.ts`, `fund-manager.ts`), RD15 `music-tour.ts` (316). Business RD3 carries the foresight defect X3.

**The gate.** Every module, business included, has no dimension under 2, at least 14 dimensions at 3, and at least 45 of 51 in total. Business must itself reach 3 on RD8, RD9, RD10, RD14, RD15 and RD16. Where a dimension can't apply, a named substitute is scored instead (the hustler's RD12 becomes a crew that runs the year). The rubric is advisory until the programme ends, then it gates CI (D25). Row counts are a proxy, so one human playthrough per module stays in the release checklist.

### 11.3 Kit v2, built once

About 4,000 lines in `special/kit/`. Optional versioned state, capped lists, no `g.rng` in reads. Area I numbered the modules K1 to K11; area J asked for the same plus `books` and `auto`. They are one list.

| Module | What it does | Built on |
|---|---|---|
| ledger (`I/K1`) | Contract rows `{id, payer, terms snapshot, start, end, paid, recouped}`, paid only by `c.earn`, which calls `book()`. The payer is a world entity (brand, NPC firm, league, state) with a yearly talent budget, so income has a ceiling. This is the permanent fix for X6, X7 and X23 | 4.2.4, 4.2.6 |
| team (`I/K2`) | Generalizes `actor-team.ts` to agent, manager, publicist, lawyer, coach, editor, campaign chief. Candidates come from the family seed. Quality lifts odds with diminishing returns and sets intel. Members are registry people | 7.2 |
| peers (`I/K3`) | Roster names become named people on first contact (feud, romance, hire, rival firm), at most 32 a life | 7.2, 7.7 |
| awards and charts (`I/K4`) | A ceremony engine on rosters by country and era. Music and actor become clients. Awards are records | 10.6 |
| exits (`I/K5`) | Typed edges with a gate, a cost and a carry-over of fame, contacts and assets. No free stat transfer | 7.6 |
| legacy (`I/K6`) | A generic inheritable asset (IP trust, catalog, team, turf), valued and taxed once | 4.2.7 |
| news (`I/K7`) | At most 3 typed items a year to the fact feed. World news can trigger events | 9.4 |
| intel (`I/K8`) | Ranks, trends, offers and rival form as bands. Research is a yearly budget x staff quality x ambition x labor hours, capped | 6.3, 5.10 |
| text (`I/K9`) | A per-life no-repeat deck for every line pool | 9.2 |
| showcase (`I/K10`) | A yearly stage (premiere, book fair, expo, summit) on the crisis engine | 10.7 |
| pace (`I/K11`) | One career row in the Annual Report and one popup budget across all careers | 9.3, 14.3 |
| books and series (`J/J2`) | A statement and a 30-year series of 6 numbers a year per career (RD9) | 12.6 |
| auto (`J/J2`) | Optional automation: an agent runs the year under a mandate, with limits, a yearly letter and lockouts in actions (RD12) | `board-ceo.ts` pattern |

### 11.4 Career feature lists

Every career gets the common frame: a ladder with seat limits, a yearly project loop, a named roster with memory, contracts on the kit ledger, a team, assets, about 8 crisis types plus small events, awards, 3 exits, and the news, intel, text and showcase modules. The career-specific parts:

- **Author** (L to XL, about 5,000 lines). Named imprints and agents by country and era. A print industry before 1990, e-book and self-publish from 2007, a genre market by year. A query and submission queue, advance and royalty tiers, returns, a series contract, translation and foreign rights, screen options priced from a studio's budget. Book fairs, a bestseller list, prizes against named authors. Plagiarism, ghostwriting and censorship crises. Backlist inheritance. Exits: screenwriter, publisher founder, columnist, memoirist. The easiest first client of the ledger, peers and awards.
- **Influencer and fame** (XL, about 7,000). One creator business: platform, niche, a content calendar, algorithm shifts by year, follower quality (organic or fake), brand deals on a real ad budget, an MCN, collabs with named creators, merch, cancellation and apology, creator awards, burnout. Fame stays the public-figure meter, and every fame action feeds the news module. Eras: 1990s homepages, 2005 video, 2010 photo apps, 2017 short video. Exits: actor, musician, own brand, politician.
- **Politician** (L, about 4,000 beyond section 8). Named opponents, a party machine and donors as entities, campaign staff, poll error and fog, debates and primaries, a cabinet and judges as real people, a foreign office and summits. Exits: board seats, author, diplomat, party chair, exile (exists).
- **Sports** (XL, three builds, about 15,000). (i) The world: every league as persistent clubs with named rosters, standings, draft, trades, caps, transfers, an agent, a contract ledger, MVP races, and injuries as a rehab desk. (ii) Ownership: a new Sports Franchise trade (trade 57) with a stadium, TV and sponsor pools. (iii) Coach, GM and pundit exits become real jobs. Esports and the Olympics share the rosters.
- **Game employee** (L, about 4,000). Persistent studios and publishers with project slates, coworkers as people, rival studios, game-of-the-year races, unions, equity and vesting, GameFest as the showcase, and layoffs driven by the industry cycle. Exits: studio founder (exists), indie, streamer.
- **Street Hustler and crime, the Underworld** (XL, about 8,000). The hustler moves onto the kit (M). Then turf, crew and heat as entities, rival crews, police pressure, a fence and a laundering ledger with named counterparties, trials, and prison as a real exit. The mafia family and `underworld.ts` link in. Every scheme stays abstract, as `underworld.ts` states.
- **Military** (XL, about 7,000). Specialties, an academy, units with peers, commands, promotion boards, deployments tied to the wars of section 8, veteran benefits and pension. Exits: contractor, politician, police, astronaut.
- **Leftovers of the done four.** Actor (L): stage, voice, producer and director pivot, moving abroad, rival people, a co-star romance, merch, a studio contract screen. Astronaut (M): analog missions, language, multi-flight years, vehicles and crews as entities. Model (M): visas, an image-rights estate, agency finances, crossover to actor and influencer. Musician (L): a player-run label and publisher, sync, videos, fan clubs, 360 and publishing terms, band deals, international tours, merch.
- **New careers.** Promote the ordinary Work Plan families (`workplace/`, 1,389 lines) into kit plug-ins, one import and one registry entry each. Order: Journalist (feeds the news module), Scientist (feeds the Effort Engine), Lawyer and Detective (cases from the crime sim), Doctor, Chef, Pilot, Coach. M to L each. Intelligence careers (analyst, private investigator, journalist, spy, rating agency, `H/H12`, L) are the sellers of the sources in 6.3.

### 11.5 Business, finished

The benchmark keeps moving, so business has work in this programme too.

- `J/J5` (M x5, about 1,000 lines each): the five remaining sector families by the existing recipe. Industrial first (6 trades: manufacturing, battery, packaging, furniture, recycling, brewery), then Hospitality (hotel, entertainment, travel, and the venue-sidecar bar, casino, nightclub and strip club trades), Retail (grocery, fashion, beauty, ecommerce), Projects (construction, real estate) and Digital (software, marketing). 17 trades run only the classic engine today (the table is in the sector-families spec, section 5).
- `J/J6` (L): bars on the food grade, education terms, clinic doctor-hours, telecom spectrum, data-center pre-leasing, a CEO resume per family, plant condition in valuation, family rows in the Annual Report.
- R&D leftovers (`C/C7`, `C/C8`): Heavy R&D for deep tech, CEO-hired scientists, patent suits, trolls, cross-licensing, universities, contract research, spin-outs. Market leftovers: a wave history screen, per-stock beta, NPC stock prices, per-model API prices, rival lab events, tablets, consoles and an app store.
- `J/J7` (M): staff skill, ambition and labor into R&D odds (needs the Effort Engine). `J/J8` (S): replace the foresight mint with a real benefit (X3). `J/J9` (L): the business 30-year series, fog, showcase and news. `J/J10` (M): re-verify roadmap items C-02 to C-12 (the v2.9 baseline lists them as planned, and v4.0.2 status is unverified) and add tests for the thin zones (competition has 1,900 test lines for 8,100 of source, deep tech 2,700 for 7,200, governance).
- Business's RD8, RD9, RD10, RD14, RD15 and RD16 each rise to 3 to meet the gate.

### 11.6 The `DEPTH` registry

`J/J1` (M) adds `test/depth-rubric.test.ts` (new) and a `DEPTH` registry per module (rungs, rows, rules, the 17 scores with evidence paths). Advisory first, so the score table above becomes a living file. It needs the test platform of section 13.6.

### 11.7 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** RD8 is the rubric form of the Effort Engine rule: 3 or more tracks, the price fixed by the project, outcome rising with money (double the budget gives under 2x odds), staff quality, ambition and labor, with ceilings and flops. A career's practice loop is a `practice` run, the kit team is its staff quality, ambition comes from the persona, and labor is focus weeks (5.10).
- **Fog.** RD10: rank, trend, offers and rival form show as bands. Each hidden fact has a paid or earned reveal kept as state (6.3), and no text leaks it.
- **Money.** RD3: every contract has a payer with a yearly budget (the world audience pool of 4.2.6). A scan runs over every special file (X11), and a 30-year identity test checks each career. Each new money source (a label, film producing, a club, merch) needs a world audience pool.
- **Text and news.** RD14 and RD16: 3 or more variants per branch, no repeat in 10 years, counted over 200 lives. At most one news item a year per career.
- **Ceilings.** Endorsements, adaptation fees, transfer fees, academy sales and TV pools are capped league-wide. Politician donors and favors are entities with wealth, and staff and machine don't lift the GDP-scaled graft caps. In the Underworld, loot, fences and laundering need victims, fences and heat as entities, and seizure and prison are the sinks. Military pay follows the era and country (X9), and a contractor exit needs a wartime budget cap (section 8). A 60-year probe per career in three strategies caps income at a multiple of `typicalIncome`.
- **Tests.** Extend `CAREER_SETUPS` (`test/career-kit.ts` line 161) and the money-scan regex to every new file. A 60-year probe per career, an heir probe, render purity under deepFreeze, idempotent year replay, and the 160-year ceiling test.
- **Migration.** One optional record per career, capped lists, an idempotent `settleYear`, and heirs start clean except for kit assets. Order: the social fix (R0) and the money-scan extension (R1); kit v2 modules `I/K1` to `I/K6` (L) with `I/K7` to `I/K11` as stubs (M); Author and Game employee; Influencer and fame (after the news and showcase modules); Politician and Military (after section 8); Underworld (after the people registry and the ledger); the sports world, then the franchise trade; the leftovers; the new careers. About 60,000 source and 30,000 test lines, close to business's 63,000.
- Items: `I` steps 0 to 9 above, `J/J1` (M), `J/J2` (XL), `J/J3` (M x4: actor, astronaut, model and musician finish RD8, RD10, RD12, RD14, RD16), `J/J4` (L to XL each), `J/J5` (M x5), `J/J6` (L), `J/J7` (M), `J/J8` (S), `J/J9` (L), `J/J10` (M).

## 12. Navigation, charts and Profit and Loss graphics

Source: area G. Areas A (ledger fields), D (people as menu nodes), E (digest), H (the reveal filter) and K (save budget) feed it. This is the section behind the owner's "better profit and loss graphics" and "better player navigation".

### 12.1 Problem today

- The shell has four sheets (Occupation, Assets, Relationships, Activities) plus "+ Age", in a fixed 480px column. Dark mode follows `prefers-color-scheme` only.
- The menu model is solid (3.1) and stays. Navigation is a back arrow. There are no breadcrumbs, search, favorites or recents. The single "Back to" chip (`ReturnChip.tsx`, the store's `ReturnPoint`) appears only after an action closes a sheet, and Age or opening another menu clears it.
- Depth: the roots show 13, 30 and 36 rows, and Activities is flat and alphabetical. A CEO reaches 11,800 rows, 2,601 distinct actions and 1,159 group screens. The mean action sits at list depth 4.8 (about 5.8 taps with the tab). 146 groups hold one row, 161 are mostly info rows, 53 exceed 12 rows. The company screen has 39 direct rows, 1,250 nodes below and 3 routes to it. Starting a product takes 5 taps plus 1 to 2 popups, and buying a stock 6 to 7 (one of 48 unsorted rows).
- Graphics: none. `spark()` and `bar()` in `business/market-view.ts` draw Unicode text for the Leaderboard, History and the deep-tech bench.
- Profit and Loss: `AnnualReport.tsx` (684 lines) shows up to 24 strings from `statementLines()`, a 520-character note, then price and production sliders. Six report variants exist, all text. The data that exists: `BizState.last` (a full `Statement`, last year only), `history: YearRecord[]` (9 numbers, 10 years), and `economicReportOf(b)` (`business/economic-report.ts`), an exact validated year-on-year profit bridge that is free waterfall data. `MarketHistory` keeps 20 years of share, rank, size, leader share and HHI, but rival shares are current-year only. Nation `reports` keep 12 years. Stock and index years are pure functions (`invest/engine.ts` `exchangeYear`), so charts need no storage. No net-worth history exists anywhere.
- Notifications: every result is a blocking popup (1,716 to 1,831 `notice()` and 482 `scriptChoice()` sites). Per year: a plain life 2 popups and 4.5 log lines, one company 3 to 8 and 9 to 14, six companies 5 to 8 and 20 to 31. `bundleCeoLetters` (`business/yearly.ts` line 634) is the one precedent.
- Mobile and access: chrome is about 40% of a phone screen, header icons are 32px, and sheets lack focus management (3.6). The bundle is about 7.8 MB and the state is 1.4 to 1.7 MB, so chart libraries and big histories are ruled out. Each tap clones the state (3.2).

### 12.2 The menu model stays data; hubs

Only optional fields are added: `MenuBase.keywords?`, `section?`, `badge?: (g) => string | number | null`, and `MenuInfo.chart?: (g) => ChartSpec | null`. `text` stays the accessible summary and the test surface, so `fuzz-kit` and every test keep working. A tree-snapshot test guards reorganizing: the reachable action-id set before and after must match.

Hubs are pure builders in `src/game/hubs/` (new): chart panels, "Needs you" badge rows, then sections.

- **Career:** a job card, the CV meter and report-card ladders.
- **Wealth:** a net-worth line and one card per company from `companyCards(g)` (new): health, a sales sparkline, runway.
- **People:** a `peopleMenu` adapter makes each person a `MenuGroup` (`person.<id>`), so people can be searched and linked (feeds section 7).
- **World:** Activities regrouped into 8 sections (Health and Mind, Love and Social, Money and Games, Law and Crime, Travel, Fame and Media, Home and Shopping, World and Politics), with Do Anything on top and Surrender last.
- **Company cockpit:** KPI tiles (sales, net, cash, value, delta, sparkline) and four tiles (Run, Money, Leadership, Exit) replace the 5 dashboard rows plus the 39-row list.

A lint test requires headings in groups over 12 rows and inlines one-row groups. Ids stay stable and hubs are added as new roots, so return points and tests don't strand.

### 12.3 Search, pins and recents

- `ui/nav/searchIndex.ts` (new, pure) walks `children(g)` only, never hints or subtitles (a hint can run `bestPlan`), into `{idPath, label, breadcrumb, keywords, lockReason, entity}`. People, companies and stocks are entities. Rank: prefix, word start, substring, subsequence, then pins and recents. Locked rows come last with their reason. The final row is "Do Anything: <query>". The walk is time-sliced at idle and cached by `(lifeId, year, age, assets.length, job, office)`. Any action costs 3 to 4 taps (open, type, tap, input) instead of 6 to 8.
- Pins (12 per life) and recents (8) are UI state in localStorage under `anotherlife.ui.v1`, never in `GameState` (`act()` clones the state every tap, and the Time Machine would rewind it). The chip becomes the newest recent. Breadcrumbs sit under the sheet header (`popTo(n)`, new). Deep links reuse `MenuSheet initial`.
- The header gains search and inbox-bell buttons. On desktop, Ctrl or Cmd+K and "/" open the palette, 1 to 4 open the tabs and A ages.

### 12.4 Notifications: digest, inbox and Quiet Mode

- Step 1, no engine change: `ModalHost` merges consecutive `notice` heads into one digest card with one OK (`dismissNotices(ids)`, new).
- Step 2: the optional weight (E's `w`, shown as `'minor'` when 1 or less) lets `store.processQueue`, not the engine, route minor notices to `g.flags.inbox` (60 items, 160 characters, an optional deep link) under a Quiet Mode setting. Bad-tone, health, legal and large-money notices stay modal. Quiet Mode is on by default (D18).
- Year-End Desk: all queued annual reports in one frame with a stepper and "approve every suggested plan" (the existing `finishMinigame` and `skip`).
- `LifeLog` shows the last 3 years open and older years collapsed, which bounds the DOM.
- Area E's `closeYear` (9.3) later supplies real weights and the digest card. The two layers share the `w` field.

### 12.5 The chart kit

Inline SVG with no dependencies, in `src/ui/charts` (new).

- `ChartSpec` is JSON, in `src/game/charts/spec.ts` (new): `{kind, title, unit, x, series: [{id, label, tone, values}], marks, summary}`. Pure builders in `src/game/charts/` read settled years only (no forecasts, no RNG) and pass through the reveal filter (6.4). Hidden rival strength is never plotted, and an estimate draws as a band, labeled "Estimate".
- Money stays in internal dollars. Labels use `shortMoney` under `withMoneyContext(moneyContextOf(g))` (`core.ts`). Multi-year axes use constant dollars with a "prices of {year}" chip (D24).
- Components and sizes in lines: geometry 450, `Frame` 220 (title, legend, readout, table toggle), `Sparkline` 70, `LineChart` 200, stacked `BarChart` 240, `Waterfall` 200, `RankLadder` 220 (rank delta, sparkline, "you" pinned with neighbors), `Timeline` 280, `Meter` 90, `KpiTile` 90, `BulletRow` 60, `useScrub` 120 and CSS tokens 220. About 2,300 lines plus 900 test lines, about 30 KB minified (10 KB gzip, 0.4% of the bundle). The kit and the palette load lazily.
- Catalog: P&L waterfall, profit bridge, cost-structure history, balance sheet and cash walk, market share against the leader over 20 years, rival ladder, net-worth and life timelines, stock lines, career standing and nation approval, CV meter and lanes.
- Accessibility bar: `role=img` with a title and description, a readout row (no hover needed), arrow-key scrub, a Show-as-table toggle, 44px targets, no color-only encoding, Okabe-Ito `--chart-1` to `--chart-6` in light and dark, reduced motion, 360px width, and at most 150 SVG nodes per chart. The brand green, orange and yellow fail contrast on white (2.2 to 2.4:1) and are not used for marks. The same pass fixes the focus trap, focus restore and `inert` background for `Sheet` and `PopupFrame`, roving tabindex and the contrast tokens (X10).
- Tests: `renderToStaticMarkup` and geometry properties (no jsdom).

### 12.6 Profit and Loss, concretely

**The waterfall.** One company, one year, from `BizState.last` (the `Statement`). The bars follow the 12 lines of the existing bridge in `economic-report.ts` (`LINES`), in this order: sales after sales tax (`netRevenue`) as the start, then cost of goods (`cogs`), operating wages (`wages`), key staff and managers (`keyStaff`), premises (`rent`), marketing (`marketing`), upkeep and investment budgets (`upkeep`), one-off expenses (`other`, with the research team's pay split out as `statementLines()` does), interest (`interest`), other income (`otherIncome`, shown up, with franchise, lab credit and royalties split out), your salary (`ownerPay`), a subtotal mark at profit before tax (`pbt`), corporate tax (`corpTax`) and the end bar, net profit (`net`). The bars sum to `net` within $1, which a unit test asserts for every statement the probes produce. `cashErosion` sits below the line as a note. The "perfect foresight" line disappears with X3.

**The profit bridge.** The same `Waterfall` draws the year-on-year bridge from `economicReportOf(b)`: last year's net, then the drivers, then this year's net. That data is already validated to sum within $0.01.

**The book series (S1).** `YearRecord` (today year, revenue, profit, tax, units, price, staff, valuation, outlets) gains optional `cash`, `debt`, `inventory`, `cogs`, `wages`, `rent`, `marketing`, `interest`, `upkeep`, `other`, `dividends`, `draws`, `injections` and `capex`. History grows from 10 to 30 years, because the rubric's reports bar (RD9) asks for a 30-year series. The record grows from 9 to 23 numbers, about 690 nodes a company. G proposed 20 years and about 420 nodes; this follows J's 30 years. A writer stores the new fields once per year, keyed by year, so a re-run changes nothing. Old saves keep their 9 numbers and show "history starts {year}". Nothing is backfilled or invented. Clamps are `readBiz` normalizers.

**Other series.** S2: `MarketHistory.top?: [id, share][]` (8 rivals, about 320 nodes) so rivals get history. S3: `flags.lifeSeries` v1, one row per age `[age, year, netWorth, cash, debt, income, happiness, health]`, 120 rows, written by age at the end of `ageUp`. `GraveyardEntry.spark` keeps 40 points. All series together are about 3,400 nodes with 3 companies and about 22,000 with 30 (4.4% of the node cap).

**The cash walk.** Opening cash, plus net profit, plus non-cash upkeep, minus capex, plus the change in debt, minus dividends and draws, plus injections, equals closing cash. Until the ledger exists (4.2.4), an honest "everything else" residual closes the gap and is labeled. After the ledger release a test pins the residual to 0.

**The Annual Report 2.0 screen.** Tabs: Summary, P&L, Balance and Cash, Market, Plan. Sticky Approve and Keep buttons. The plan logic is untouched, and the builder adds `data.chart`, read defensively like `readReportData`. The Summary tab has KPI tiles (sales, net, cash, value, delta, sparkline) and the profit sparkline. On a phone: 16px gutters, tabs that scroll sideways, and charts at full width. The waterfall renders as one row per line at widths under 480px (label, signed value, a bar), with 44px rows, because 14 vertical bars can't carry labels at 360px. Under each chart sits the readout row, then "Show as table". Multi-year charts carry the "prices of {year}" chip.

**Company and Wealth cockpits.** The KPI tiles and company cards in 12.2 read the same series.

### 12.7 Rankings, timelines, cockpits and the Paper

- Rank ladders (`RankLadder`): the market Leaderboard (with S2), career standing (`rows` of rank, of, standing per year, and `ScoreRow` in `business/scorecard.ts`), the AI lab, the music chart and nation approval. Each shows rank change, a sparkline and "you" pinned with neighbors. Stock lists get sparklines from `exchangeYear`.
- Net-worth and life timelines from S3: the profile, the death screen (which has no life chart today), the graveyard and the CV (from `CvEntry.startAge` and `endAge`, mostly derived).
- Career, People and World cockpits (`G/G10`, L) arrive with the domains they show (R4 to R8).
- The Paper screen (`E/N6`) uses the kit's lists and source chips, and links each story to the person, company or nation it concerns.
- Optional later: a desktop two-pane layout (`G/G13`, S to M, not now: D23) and lazy chunks (`G/G14`, S).

### 12.8 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs.** Reads only. The "why" panels of the Effort Engine (`C/C11`) plug into the same chart frame.
- **Fog.** Charts read settled own-book data and public data. Anything hidden passes the reveal filter and draws as a band. A frozen-state test runs every chart builder without writes.
- **Money.** Charts show the books and, later, the ledger flows. They never compute money. The cash walk carries its labeled residual until the ledger lands.
- **Text and news.** Each spec's `summary` is the accessible text and follows `docs/VOICE.md`. The digest and inbox share the `w` field with section 9.
- **Ceilings.** At most 150 SVG nodes per chart. State growth: S1 takes a `YearRecord` from 9 to 23 numbers over 30 years, and all series stay under about 22,000 nodes at 30 companies. Chart code lazy-loads, so the bundle grows 0.4%.
- **Tests.** `renderToStaticMarkup` and geometry properties. The waterfall sums to `net` within $1. The reachable action-id snapshot. A search-index test over `fuzz-kit` states. Clamp and migration fixtures, year re-run idempotence and a node-cap check for S1 to S3. Bad-tone and large-money notices never route to the inbox.
- **Migration.** Keep ids and add hubs as new roots. The accessibility pass goes first. Old saves show shorter history.
- Items: `G/G12` (M, first) accessibility, `G/G8` (M) nav core, `G/G1` (M) `ChartSpec` and builders, `G/G2` (L) components and CSS, `G/G3` (M) series S1 to S3, `G/G4` (L) Annual Report 2.0 and Year-End Desk, `G/G5` (M) Company and Wealth cockpits, `G/G6` (M) rankings and stock sparklines, `G/G7` (M) net-worth and life timelines, `G/G9` (M to L) search, palette, pins, recents, `G/G10` (L) Career, People and World cockpits, `G/G11` (M) digest, inbox and Quiet Mode, `G/G13` (S to M, optional), `G/G14` (S). About 16,000 to 20,000 lines with tests (XL). Order: `G/G12`, `G/G8`, `G/G1`, then `G/G2`, `G/G9`, `G/G11`, then `G/G3` with the ledger, then `G/G4` to `G/G7` and `G/G10`.

## 13. Engineering, performance and test strategy

Source: area K. It was measured on a scratch copy of v4.0.2 (Node 22, 4 vCPU), with CI figures from GitHub run 39420764187.

### 13.1 Problem today

- **No enforced boundary.** 623 runtime modules have 4,488 import edges. 5 cycle components hold 147 modules (24%): sizes 85 (business and computer), 30, 19, 7 and 6. About 37 cross-directory edges hold the 85-module one together. The v4.0.0 crash was one edge growing a 60-module cycle to 177: a module-level `const UNIT_YEARS = LASTING_YEARS` read `undefined` (franchise values became NaN) and `COMPETITION_EVENTS is not iterable`. It was fixed with a leaf `insider-ledger.ts` and a register seam. Of 2,081 cross-directory imports, 329 point upward. Ad hoc seams exist (`YEARLY_HOOKS`, `registerFamily`).
- **Hot files collide.** In v4.0.0 the files touched by most commits were `docs/ARCHITECTURE.md` (16 commits), `deeptech-sim` (13), `tech-waves` (12) and `manage.ts` (6).
- **World randomness is welded to the player.** One `mulberry32` stream `g.rng` with 5,383 draw sites and about 80 hash-seeded uses. A digest prototype showed that one extra `rand()` at year 10 changes every later digest, the world economy included. 119 tests pin `seed: N`, and v4.0.0 broke probe-life seed 8 and the sampled anachronism lint.
- **Monolithic save.** 2.14 MB raw and 371 KB gzip at age 80 with 12 companies, 85% of it `flags.worldEconomy` (1.82 MB: countries 562 KB, `previous` 562 KB, history 456 KB, rivals 239 KB). 53% of the bytes are key names. 125,000 nodes of the 500,000 cap. Bounds: `SAVE_SCHEMA` 2 with one migration, 17 normalizers, 13 `*_VERSION`s and about 290 caps. The IndexedDB and gzip backend (`save-backends.ts`) is unwired, so production writes plain JSON to localStorage. Economy tiering was specified and never built. One old-save fixture exists.
- **CI is slow and flat.** One job, 36.0 minutes (typecheck 5 s, tests 91%, build 2 s). File times sum to 3,869 worker-seconds, and the top 10 files are 58% (`simulate` 494 s, `era-features` 401, `main-character-life` 340, `sector-story` 278, `anachronism` 214). At least 80% of files (146) run `createNewLife` or the yearly loop. 137 files raise timeouts to 100 to 300 s because of contention. CI grew from 28 to 36 minutes between v2.8 and v4.0 (0.19 minutes per 1,000 test lines). Affected-test selection is useless: a median source change reaches 67% of test files, p90 89%.
- **One 8.3 MB chunk.** 46% of the bytes are string literals. By area: business 1.69 MB, events 1.34, special 0.98, data 0.87.
- **Tooling gaps:** no world money ledger, no dependency test, no golden digests, no property tests, no balance harness, no size budgets, no nightly job, no sharding, no content pipeline. `fuzz-kit`, `probe-life`, `voice-report` and `career-money-scan` exist.

### 13.2 Layers and the dependency ratchet

`test/architecture.test.ts` (new, about 1 second) reads an esbuild metafile, because the TypeScript 7 toolchain here has no JS compiler API.

| Layer | Holds | Imports |
|---|---|---|
| L0 kernel | types, rng and streams, ids, clock, ledger, bus, registry, scripts, talents | nothing |
| L1 data | era packs, history tables, brands, locales | L0 |
| L2 world | economy, nation state, entity stores, registry shards | L0, L1 |
| L3 domains | business, special, careers, computer, shops, relationships, crime | below only, plus each other through a per-domain `contract.ts` (new) |
| L4 assembly | aging, menus, save, life | below |
| L5 UI | `src/ui` | below |

Rules: (a) no runtime cycles, by ratchet: a baseline lists today's 147 modules, any new cycle fails, and the list shrinks to 0; (b) a layer imports only below it; (c) domains cross only through contracts (types, ports, `register*`); (d) no module-level `const X = importedValue` from above L1, which is the real v4 failure; (e) a track's tests import only its own domain, which moves affected tests from 67% toward 15%. The kernel is already a clean leaf with about 900 inbound edges. `K/K1` (S) lands the test and the baseline first. `K/K2` (L) cuts the 5 cycles (about 40 cross-directory edges first, then about 90 inner modules). Enter-through-each-hub tests and a nightly fresh-import sweep guard the load-order changes.

### 13.3 Module registry, bus and RNG streams

- **Registry.** `registerModule({id, layer, slices, yearly: [{phase, order, run}], menus: [{path, order, build}], handles, lod, budget})`. `aging`, `special`, `menus` and `manage` iterate phases sorted by `(phase, order, id)`. A track adds one line to a sorted `modules/index.ts` (new) instead of editing four shared files. Per-track docs replace appends to `docs/ARCHITECTURE.md`.
- **Bus.** A synchronous typed bus (`emit('company.failed', ...)`) whose handlers write only their own slice. Newsworthy events land in the bounded `g.world.facts` (9.4).
- **Streams.** `stream(g, 'war', year, entityId)` hashes `(world seed, tag)` and never touches `g.rng`. A lint forbids `g.rng` in new world modules. Tracks stop shifting each other's rolls, and world history stops depending on click count. Existing sites stay. The family of today's seeded helpers (`seeded` in `assets.ts`, `seededStream` in `cv.ts`, `stableRoll` in `special/common.ts`, `economicRoll`) is the base. A one-time global seed rebaseline lands the streams in R2, and the 119 pinned seeds move to `findSeed(pred)` (D7).

### 13.4 Levels of detail and budgets

Section 4.2.3 and 4.2.8 give the levels and the state budget. K's measured ceilings behind them: T0 full entities (player-linked, at most 150, 5 to 10 KB, 2 ms a year each), T1 light (3,000 at 300 B, not adopted now), T2 statistical pools. An entity is `base(worldSeed, id)` plus a stored delta, and demotion folds money back into the pool through the ledger. 100,000 light entities cost 3 to 9 ms a year (1,000,000 cost 70), but 100,000 at 150 B is 15 MB. Storage, not CPU, is the limit. `K/K6` (M) builds the LOD framework and a budget meter.

### 13.5 Save v3

- Slices declare `{key, version, normalize, caps, chunk}`. Chunks: `core` (the player side, 320 KB: clone 3.8 ms against 24 ms today and stringify 2.3 ms against 25 ms, which is -88% per click), `world` (1.8 MB today, written yearly, columnar, with `previous` cut to the readers' focus set), `entities/<kind>/<shard>` (dirty-tracked) and `log`.
- Wire the existing IndexedDB backend and the `gz2` codec (X17). Per-slice `migrate(from, json)`, a chunk manifest, and one fixture per release that CI runs for 5 years. The Time Machine `pack()` (`save.ts` 572) is generalized to chunk any `world.*` shard (its budget is 45.9% used).
- Budgets asserted by a 50-year probe: core 400 KB, world 1 MB, 600 KB gzip. Dual-read for one release. `SAVE_SCHEMA` stays 2 until this lands (decision D6).
- `K/K5` is XL and needs the kernel registry. R1 wires the IndexedDB backend. R2 takes the skeleton and the first chunks, and the full columnar world chunk follows when the registry shards exist.

### 13.6 Test strategy

- **PR fast tier:** the architecture test, the conservation scan, affected tests, and 3 seeds x 20 years.
- **Full suite, sharded:** 4 shards x 2 workers from a timing file, splitting the five files over 200 s by seed range. Wall time falls from 36 to 9 or 10 minutes for the same billed minutes. `vite.config.ts` today caps `maxWorkers: 2` for contention, so the shard layout is tested before it is trusted.
- **Nightly deep:** `FUZZ=1` with 40 seeds x 160 years, 200-seed balance probes (net-worth percentiles, and a ceiling probe that scales each input by 100 and asserts a real-world cap), anachronism over 400 lives, every fixture migrated, and metrics diffed night to night.
- **Golden digests per slice** (canonical-JSON FNV, so a failure names the slice that moved). They are trustworthy only with named streams, so the rebaseline is done once, early.
- **Property tests:** conservation, idempotence, bounds, purity. `findSeed(pred)` replaces pinned seeds. Persist the vitest transform cache (cold start 12 s, 83% transform).
- `K/K7` (M + M) is the test platform plus the balance harness.

### 13.7 Build, release and the content pipeline

- **Bundle.** Stage 1: dynamic-import the data packs (era packs 0.66 MB, history 0.28, locales 0.22, brands 0.38) behind `await ensurePacks(g)` in the store, with tests preloading them. Stage 2: lazy domains (special careers 0.98 MB, deep tech, silicon and lab 0.41) on first open. Stages 1 and 2 cut 2.9 MB (-35%, an initial bundle of about 5.5 MB). Lazy shops, computer, activities and the rest of business reach 3.5 to 4.5 MB. A bundle-budget test replaces `chunkSizeWarningLimit: 8000`. Async packs break synchronous assumptions in tests and the Time Machine, so this ships behind the store seam. `K/K8` (M + M).
- **Release.** Per-track flags stay dark until their probes pass. Preview deploys. CI on every track branch (`K/K11`, S, no dependency).
- **Content pipeline** (`K/K9`, L). `content/` entries carry `{id, era range, country gate, tags, voice class, cooldown}`. The build validates voice (the `scripts/voice` lexer), checks era gates statically over the whole corpus (replacing the 214-second sampled lint) and emits typed TS. A bounded per-life `seen` ring plus cooldowns gives non-repeating dialogue (9.2).
- **Web Worker, later.** The closure menus (`MenuGroup.children(g)`) pin the engine to the main thread, so an engine-in-worker needs a menu RPC (L), and a year-step worker doubles engine memory (M). The trigger is a p95 year step above 400 ms on a mid-range phone after save v3 and LOD (`K/K10`, conditional).

### 13.8 Cost model

Calibrated on v4.0.0: 72,081 lines added (24,175 source, 36,464 tests, 11,352 docs) in 143 commits over 12.5 to 14 hours of wall time, with 9 tracks and 3 of 5 CI runs red. Derived: about 100 agent-hours, 4.1 agent-hours per 1,000 source lines all-in, an integration tax of about 15% of wall time, and CI growing 0.19 minutes per 1,000 test lines. Tests run 1.0 to 1.5 times the source.

| Source lines | Total lines | Agent-hours | Wall, 9 tracks +15% | Full CI, unsharded / x4 |
|---|---|---|---|---|
| Foundation 22k | 52k | 90 | 1 to 2 days with 4 agents | 39 / 11 min |
| Programme 40k | 118k | 165 | 21 h | 47 / 13 min |
| 60k | 177k | 245 | 31 h | 53 / 15 min |
| 90k | 265k | 370 | 47 h | 62 / 17 min |

Billed CI per release train: about 41 runs x 36 minutes = 1,480 minutes (5 integration runs plus 9 tracks x 4 pushes), plus the nightly 1,350 minutes a month. Nine agents on 4 CPUs contend, so the estimate must be re-verified in sharded CI. The digests' own item sizes add up to more than 200,000 source lines before overlaps are removed (`I/K1` with `J/J2`, the patent items of `C/C7`), far beyond the table's largest row. That is why the roadmap splits the work into releases R0 to R12 and keeps the final estimate with low, expected and high cases.

### 13.9 Inputs, fog, money, text, ceilings, tests, migration

- **Inputs, fog.** Not applicable: this is the foundation under the others. The budgets here (time and state) bound how much detail the other sections can buy.
- **Money.** `K/K4` (L) builds the conservation scanners and property helpers that the ledger tests use.
- **Text.** `K/K9` is the content pipeline.
- **Ceilings.** The size and time budgets of 4.2.8 and 13.5 are enforced by tests. A larger world step or a bigger save fails a probe, not a review.
- **Tests.** This section is the test strategy. Its own tests are the architecture ratchet, the shard layout check, the budget probe and the bundle-budget test.
- **Migration.** Wave 0 is `K/K1`, `K/K3`, the `K/K5` skeleton, `K/K7` sharding and `K/K11`. Tracks then run while `K/K2`, `K/K4`, `K/K6`, `K/K8` and `K/K9` land under the ratchets.
- Items: `K/K1` (S), `K/K2` (L), `K/K3` (L), `K/K4` (L), `K/K5` (XL), `K/K6` (M), `K/K7` (M + M), `K/K8` (M + M), `K/K9` (L), `K/K10` (L, conditional), `K/K11` (S). About 22,000 source lines (all but `K/K10`), 25,000 test lines and 5,000 docs lines.

## 14. Cross-cutting rules: invariants, exploit and balance policy, content and safety rules

### 14.1 Invariants and guards

The repo's nine non-negotiable invariants (`docs/FEATURE-ROADMAP.md`, "Non-negotiable implementation invariants") hold for everything here. Three more are added. Each has a guard that fails in CI.

| Invariant | Guard | Release |
|---|---|---|
| 1 No foresight | A spy test asserts no pure read asks the economy or market for a year after `g.year`. `quote` and `know` never see `u`. Only the fenced Investing gut reads a future year (D12) | R1 (X2 fixed in R0), R3 |
| 2 Deterministic | Named streams, replay, reload and Time Machine fork give identical JSON, golden digests per slice | R2 |
| 3 Conservation | The money scan extended to every special file and `society/` (ratcheted allowlist), then the ledger ratchet and the world conservation probe | R1, R2 |
| 4 Action-level authorization | Every new action checks ownership and CEO control inside the function (the kit's `blocked(g)` pattern), with a direct-call test per action | every release |
| 5 Save compatibility | Optional fields, normalizers, one fixture per release run for 5 years, `SAVE_SCHEMA` 2 until save v3 | every release |
| 6 Yearly idempotence | A marker per step (`world.year`, `last`, `settledYear`, receipts) and a run-twice test per step | every release |
| 7 Pure presentation | The `fuzz-kit` deep-freeze walk covers hubs, charts, `know()` reads and the search index | R1, R3 |
| 8 Bounded state | The cap table of each section and the 50-year size probe | R2 |
| 9 Accessible interaction | The accessibility pass and the chart accessibility bar | R1 |
| 10 Entities exist once (new) | Registry index tests: one spouse, mutual; holdings sum to 1; one household per unit; one job each | R2, R4 |
| 11 Fog is honest (new) | The coverage test (the stated band holds the truth about 80%), same source same year gives the same number, a grep guard on direct truth reads | R3 |
| 12 Every growth term has a ceiling (new) | The ceiling probes of 14.2 | every release |

### 14.2 Exploit and balance policy

- **The ceiling rule (P8).** Each growth term gets a real-world ceiling in its design, a unit test of the ceiling, and a probe that multiplies its inputs by 100 and asserts the cap. Probes: a 160-year ceiling test per domain (like `test/growth.test.ts`), 200-seed balance probes with net-worth percentiles each night, 120-year seeded probes for wars, 60-year career probes in three strategies, and a 200-year effort probe at maximum inputs.
- **Cost rule (P9).** Prices follow the object, never the buyer's wealth: R&D, booths, lessons, intel, tuition. `scaledCost` (`business/events.ts`) stops being the model for new costs.
- **The named exploits and their caps,** one list for the roadmap's probes:

| Exploit | Cap | Section |
|---|---|---|
| Fake followers | Paid followers earn nothing and don't verify; a platform ad pool caps pay | 3.9 (X1) |
| Endorsements, adaptation fees | A real payer with a yearly budget on the kit ledger | 11.3 |
| Pool arbitrage | Bid-ask spreads, transaction costs, stock-linked indexes | 4.2.4, 4.7 |
| Minting | Only declared mints, each with a yearly cap | 4.2.4 |
| Research | `k` at most 4, fte cap, `K` at most 100, quality at most frontier + headroom, royalties at most 1.5 times plan, one wave per origin | 5.11 |
| Intel | Per-source floors, one number per source per year, no resale, informant tips route through the insider ledger | 6.3, 6.8 |
| Favors, marriage for wealth, gossip, adoption, mentoring | One call-in per person per 3 years, shown wealth isn't spendable, hop cap 2, estates taxed, growth x1.15 | 7.8 |
| War profit, insider trades on a declaration, rally farming, conquest, history rewrite, reparations, diplomacy spam | Military-line share and margin caps, the insider system, decay and a 4-year cooldown, occupation burden, the divergence budget, 3% of GDP and ending, capital cost | 8.10 |
| Pump and dump, spend to win, intel farming, award farming, orders into an IPO | Capped mood, a 15% saturating budget weight, noise and expiry, one per category per 3 years, deposits as liabilities | 10.8 |
| Stacked promotion terms | Product of terms at most 1.35 | 10.6 (X13) |
| Paying hooks | Real NPC cash, at most 2% of its marketing spend | 9.5 |
| Franchise loops (transfer fees, academy sales, TV pools) | League-wide conservation and caps | 11.7 |
| Underworld loot and laundering | Victims, fences and heat as entities, with seizure and prison as sinks | 11.7 |

### 14.3 Popup and clutter budget

One yearly budget, owned by `closeYear` and `pendingAsks` (9.3): at most 3 unrequested choices a year. Every module's own cap sits beneath it, and none adds on top: kit careers 1 choice and 2 notices, a company 1 choice and 2 notices, wealth asks, nepo and will (3, 2 and 1 today, which become families under the budget), a war popup at most 1, a news hook at most 1, "Tips and Offers" 6 open with a 2-year expiry. Family acting against the player (affairs, lawsuits) draws from the same 3. A new feature declares a family id and a weight, and it may not add a popup outside the budget. Targets: ordinary lives popups p90 3 and max 5, $50M lives p90 4 and max 6, tycoons mean 4 plus the "Your companies" card.

### 14.4 Content and safety rules

- Fictional leaders everywhere. No real living person is named as a character, a head of state or an NPC.
- Real brands: no invented scandals (the `data/brands.ts` rules). Real-brand rivals only win or lose rank. Estimates about real companies stay stylized, as `seededTip` already notes. Real organizers (TIFF, Glastonbury) appear only where the registry has them, with neutral facts (D21). Institutions such as the UN and NATO are historical anchors, not characters.
- War is non-graphic and aggregate: counts of killed, wounded and displaced. No atrocity button. No nuclear use, ever: a standoff ends in talks or backing down. No ethnic framing. Real present-day conflicts stay factual headlines. A detail toggle in Settings sets the level (D10).
- Underworld and illegal intel stay abstract, as `underworld.ts` already states. Violence against NPCs is out of scope: legal and social consequences only.
- Outlets are fictional. Text follows `docs/VOICE.md`: facts first, contractions, no em-dash, line caps (log line 90, outcome 120, scene 140, tooltip 120, digest 110, headline 70, deck 110), and disclaimers only in Settings, About.

### 14.5 Determinism, randomness and the one yearly order

- World luck uses `stream(g, tag, year, entityId)` (13.3). Presentation text uses `hpick`. `pickLine` keeps one `g.rng` draw for parity until the world modules move. Time Machine forks key luck through `outcomeTag(g, year)` (`timeMachine.ts` line 193), so a rerolled year differs.
- One yearly order, registered through the module registry. The release plans pin the exact phases. The invariant: no step reads a later step's output for the same year.

| Step | Module | Notes |
|---|---|---|
| 1 | Economy (`yearlyEconomy`) | Reads last year's war overlay and prices |
| 2 | Geopolitics step (section 8) | Conflicts, relations, casualties |
| 3 | World step W1 to W7 (section 4) | Demography, labor, firms, housing, government |
| 4 | Frontier and rival ledgers (section 5) | Rival disclosures, world knowledge |
| 5 | Society step (section 7) | Named people, feuds, estates |
| 6 | Firms and shows (sections 4, 10) | `settleShows`, then `bookYear` |
| 7 | Careers (`kit` `settleYear`, section 11) | Per career, idempotent |
| 8 | News detectors (section 9) | `emit` facts from the year just settled |
| 9 | `closeYear` (store, section 9.3) | The digest, last |

### 14.6 Naming and conflict resolutions

Where digests disagree, this design followed one and says why.

| Conflict | Followed | Why |
|---|---|---|
| Ledger function and semantics (A `book` with pools, K `post` with sinks) | A's counterparties and negative pools, K's L0 placement and invariant, named `book` | Old saves need no opening balances, and K's layer rule keeps it a leaf |
| Home of world state (A `g.world`, D `flags['society.v1']`, B `world.geo` flag, C `world.frontier` flag, F `flags['shows.world']`) | A's `g.world`, reached through `worldShard` until K2 | It reaches heirs without a whitelist, which caused X4 and X5 |
| Levels of detail (A tiers 0 to 2, D latent, met, intimate, K T0 to T2 with 3,000 light entities) | Named, pooled, seeded with A's and D's caps | Those caps were measured against the save budget, and K found storage is the limit |
| Person id (A `EntityRef`, D `sid`) | `person:<sid>` | One id everywhere |
| Personality (C ambition only, D five axes, `effort.you`) | D's five axes. C's stored shift starts as `flags['effort.you']` in R3 and merges into `flags['persona.me']` in R4 | One record for the player, with no wait on D |
| Knowledge (H record, D `known` mask, F `intel`, B views, E check-the-story) | H's `know` and `flags.know`. The others are keys, with D's observation counters in the registry row | One reader |
| Text memory (E `textMem`, F `recent`, I deck, K `seen`) | E's `textMem`. The others are families. K validates at build | One store |
| Popup budgets (E global, D shared 3, I K11, F per company) | E owns the budget, the others are caps beneath | No double counting |
| Digest layers (G merge and Quiet Mode, E `closeYear`) | G first with no engine change, E later. One weight field `w` | Ships value in R1 |
| Randomness (E `pickLine` one draw, K named streams and a rebaseline) | Both, in order: `pickLine` first with no shift, one rebaseline in R2 | No churn until needed |
| Honest odds under fog (B, H) | Odds from beliefs, labeled estimate, rolled from truth | Honest about what you know |
| Rivals (A top 8 per market and `FirmLite`, D slots, I 32 peers, J 192 actors, F top 12 at a fair) | One thing: a seeded roster, promoted on contact, with `FirmLite` as the firm form | Entities exist once |
| Heirs (A, C, D, H, I, E) | One carryover table (4.2.7) | A single source |
| Flows and facts (A `flows`, E facts) | Two tables: aggregates for money, discrete events for news | Different jobs |
| Showcase score (F `showScore`, C Task) | `showScore` stays its own pure function and shares `workQuality` | It resolves by stance in a year step |
| News volume (D 8 a year, I 3 per career, F 1 per edition) | All feed one scored feed. The Paper shows a front page plus 33 stories | Bounded by the edition |
| Counts that differ (source lines 259k and 264k, `notice()` sites 1,716 and 1,831, model test lines) | Both are given as a range | They count different things |

### 14.7 Migration and release rules

- Strangler order. Each step ships alone behind a reader that treats a missing field as empty, and old saves load.
- Every new saved field is optional, clamped by its reader and capped. One old-save fixture per release runs for 5 years in CI.
- New modules ship dark behind a flag until their probes pass, with a preview deploy (D8). A flag never changes a saved field's meaning.
- One family per PR for text changes. A text change that shifts a seeded test is re-baselined in the same PR.
- A release needs its exit gate (the roadmap lists each), a human playthrough, and the full sharded suite green.

## 15. Decisions for the owner

The 55 open questions in the digests collapse into 28 decisions. Each has options and a recommended default. "From" lists the digest questions merged, as area letter and question number (D.3 is area D's third question). "Blocks" names the first release that can't start without the answer.

| # | Decision | Options | Recommended default | From | Blocks |
|---|---|---|---|---|---|
| D1 | Is money a closed system? | (a) Closed, every account opens with a balance. (b) Every flow has a named counterparty, pools may run negative, only declared mints and burns | (b) | A.1 | R2 |
| D2 | Who gets a persistent record? | (a) Every stranger. (b) Only those touched, promoted on contact, 400 named people and 32 career peers a life | (b) | A.2, D.3, I.4 | R2, R4, R10 |
| D3 | Old saves' NPC firms | (a) Rewrite into the registry. (b) Index in place | (b) | A.3 | R2 |
| D4 | Heirs and debts or career assets | (a) Nothing passes but cash. (b) Kin debts pass through holdings, career assets pass, standing and memory don't | (b) | A.4, I.5 | R4, R6 |
| D5 | Performance target | (a) A 2022 mid-range Android at most 400 ms a year step, desktop light life under 160 ms, a world detail setting. (b) Desktop only | (a) | A.5, K.3 | R2 |
| D6 | Save compatibility horizon | (a) Every old save keeps loading. (b) Cut off at a version | (a) | K.4 | R1 |
| D7 | Global seed rebaseline | (a) Once, in R2, pinned seeds move to `findSeed`. (b) Never | (a) | K.2 | R2 |
| D8 | Repo, CI and dark flags | (a) Public repo for free CI, 4 shards, tracks dark behind flags with preview deploys. (b) Private repo with paid minutes | (a) | K.1, K.5 | R1 |
| D9 | History versus freedom | (a) History is fixed. (b) Pre-2026 stays on script for NPCs, a President may diverge for their own country inside the divergence budget, 2026 conflicts stay open, the future is emergent | (b) | B.1, B.2, C.2 | R7 |
| D10 | Content level | (a) Graphic. (b) No nuclear use, aggregate casualties, a detail toggle, fictional leaders, no violence against NPCs | (b) | B.3, B.5, D.5 | R7 |
| D11 | Honest odds under fog, and what hints are | (a) Exact odds and exact hints. (b) Odds from what you know, labeled estimate, rolled from truth. Hints become honest, fallible estimates | (b) | B.4, H.2 | R3 |
| D12 | The Investing gut | (a) Remove. (b) Keep as the one documented foresight exception, fenced from every purchasable source | (b) | H.1 | R1 |
| D13 | Exact mode, and fog at the start | (a) No Exact mode. (b) Settings offers Realistic (default) or Exact. Numbers for own-industry markets, words elsewhere | (b) | H.3, H.5 | R3 |
| D14 | Illegal intel and secrecy | (a) None. (b) Allowed, abstract, with real prison and scandal risk. Secrecy leaks are a yearly hazard, with no spy minigame | (b) | H.4, C.5 | R3 |
| D15 | Player personality and ambition | (a) Explicit sliders. (b) Inferred persona, ambition shown from age 18 with a visible yearly posture | (b) | C.1, D.2 | R3, R4 |
| D16 | Effort bookkeeping | (a) Keep counters. (b) A pool of about 12 focus weeks, and failed research banks knowledge up to +15 odds points | (b) | C.3, C.4 | R3 |
| D17 | NPC web and family initiative | (a) Full web shown. (b) Player-centered plus kin, feuds and company links, showing only what is known. Family may act unprompted inside the 3-popup budget | (b) | D.1, D.4 | R4 |
| D18 | Popups and Quiet Mode | (a) Demote in headless `ageUp` too. (b) Demote only in the store flow. Quiet Mode on by default, weight 0 to 1 outcomes log-only, bad-tone, health, legal and large-money stay modal | (b) | E.1, E.5, G.2 | R1 |
| D19 | News outlets and future events | (a) Real outlets. (b) Fictional outlets only. Scheduled events (fairs, Olympics) appear in the Paper, never their outcomes | (b) | E.2, E.3 | R5 |
| D20 | Digest placement | (a) Always a popup. (b) The last popup for 10 years, then an inline card | (b) | E.4 | R3 |
| D21 | Show Circuit names and resolution | (a) All invented, resolve instantly. (b) Real organizer names where the registry has them (TIFF, Glastonbury), invented elsewhere, real host cities. Resolve at the year step with one stance choice. Real-brand rivals can't crash. Hired-CEO companies attend by policy | (b) | F.1 to F.4 | R9 |
| D22 | Hosting an organizer | (a) Now. (b) Build the payee interface now, hosting after the trade and career adapters | (b) | F.5 | R9 |
| D23 | Navigation shape, and what "better system" means | (a) A new shell. (b) Keep the four tabs plus Age, open each on a cockpit, search and inbox in the header, no desktop two-pane now. Read "better system" as the systems under the features | (b) | G.1, G.4 | R1 |
| D24 | Chart money basis and depth | (a) Nominal per year. (b) Constant dollars with a "prices of {year}" chip, 30 years of company books and a whole-life series | (b) | G.3, G.5 | R1 |
| D25 | The depth gate | (a) A human review only. (b) The 17-dimension rubric for business and all 11 careers, advisory until the programme ends, then gating: no dimension under 2, 14 or more at 3, 45 of 51 | (b) | I.1, J.1, J.5 | R1, R12 |
| D26 | Careers: automation, franchises, Underworld, new jobs | (a) None. (b) Optional capped automation with a yearly letter. Sports franchises become trade 57 after the sports world. The Underworld gets a Special Careers entry, kept abstract. Journalist and Scientist are built, the other six Work Plan jobs wait unless counted as special jobs | (b) | J.2, I.2, I.3 | R6, R10 |
| D27 | Order of kit and families | (a) Families first. (b) Kit and careers first, families in parallel as table work | (b) | J.3 | R6, R9 |
| D28 | The perfect-foresight income | (a) Keep. (b) Remove it and give a real, non-monetary benefit. The owner's follow-up already points at removal | (b) | J.4 | R0 |

## 16. Out of scope and later

- **A Web Worker** for the engine (`K/K10`). It starts only if the p95 year step exceeds 400 ms on a mid-range phone after save v3 and the level-of-detail work.
- **The 3,000-entity light tier** from area K. Reviewed after save v3 has measured real storage.
- **A desktop two-pane layout** (`G/G13`). Palette and shortcuts come first.
- **Hosting an organizer** (`F/F9`) and any player-run fair, after the Show Circuit adapters exist (D22).
- **Goods for every product.** The first goods flows cover the four traded baskets, housing and labor-hours (`A/K7`). Per-item supply chains wait.
- **Market leftovers:** a wave history screen, per-stock beta, NPC stock prices, per-model API prices, rival lab events, tablets, consoles and an app store.
- **Six Work Plan jobs as kit careers:** Lawyer, Detective, Doctor, Chef, Pilot and Coach, unless the owner counts them as special jobs (D26).
- **A weekly or real-time simulation,** multiplayer, and cloud accounts.
- **Real living people,** graphic war, nuclear use and violence between NPCs, at any time.
- **A spy minigame.** Secrecy is a yearly hazard (D14).
- **Rewriting history before 2026.** The scripted history tables stay canon. Real-brand lists and era packs are not rewritten except where an exploit or a gate needs it.
- **Retuning the finished careers' balance,** beyond the exploit fixes in R0 and the gates in R12.
