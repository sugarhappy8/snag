# Area J: business depth benchmark and the depth rubric

Read-only audit of main (v4.0.2). Paths under `src/game/`, tests under `test/`. Line counts from `wc -l`; "rows" are grep estimates.

## 1. What exists today

**Business is 63,065 lines in 189 files in `business/`**, plus about 13k in `economy/`, `nation/`, `workshop/`, `invest/`. 209 test files import it (61k lines).

| System | Files / lines | Honest depth |
|---|---|---|
| Core: founding, manage, economy, yearly, state, exit, milestones, dashboard, tax, industries | 17 / 8,792 | Real. 56 trades, 102 countries, one statement a year, 10 years of 9-field history. |
| Events (generic, competition, bank, fund, sector, deep tech, nepo) | about 120 rows | Real choices with resolver-odds hints. One generic event a company-year. |
| Products, R&D, Heavy R&D, supply, R&D 3.0 lab | 16 / 5,261 | Real. Budget sets odds (diminishing returns). Staff skill, ambition and labor are not inputs. |
| Markets and competition (roster, moves, antitrust, rival rows, views) | 24 / 8,100 | Real cast of actual firms by year and country plus a procedural tail; 192 tracked rivals with cash, debt and outcome (`economy/actors-state.ts`). Rival books are modeled, not P&L. |
| Deep tech (12 trades), AI bench, silicon, devices, tech waves | 26 / 9,750 | Deepest part. Tests thin: 2.7k lines for 7.2k. |
| Sector families (food, care, util) | 14 / 3,186 | Real, but only 18 of 56 trades. About 22 event rows, 4 levers each. |
| Staff, CEOs, boards, conglomerates, franchise, nepo | 42 / 13.2k | Real. 13 staff traits, mandates, letters, votes. General staff are a head count. Tests 4.9k, thin. |
| Finance: banks, investment firms, hedge, dividends, share classes, own listing | 39 / 9.1k | Real. |
| Game studio (`gamestudio*.ts`) | 4 / 2,969 | Real; trillion loop fixed in 4.0.1. |
| Reports: Annual Report (`ui/minigames/AnnualReport.tsx` 684), `dashboard.ts` 205, leaderboard | small | Text rows with arrows. No chart exists in `src/ui`. |
| Hints and talents | 253 refs | Business talent prints exact dollars. Only fog: a paid market study (`expansion.ts`, 0.3% of revenue). |

Menu or statistic, not simulation: showcase (only `deeptech-menu.ts` `SHOWCASE`, 4 trades) and news (popups and logs, no feed).

**Special careers (source / dedicated test lines):** actor 5,062/5,103, astronaut 3,742/4,163, model 3,646/3,677, musician 3,777/4,593 (all on `special/kit`, 1,316/2,414, with `career-money-scan`); politics 7,693/1,728 plus fuzz (`special/politics.ts` and `nation/`); sports 9,188/903; game industry 4,369/2,040; author 1,159/1,280; influencer 2,190 (`social.ts`, `fame.ts`)/38; military 1,082/0; hustler 817/0. The Inventor workshop (3,123/1,701) is near kit level.

## 2. Gaps

1. **17 trades run only the classic engine**: Industrial (manufacturing, battery, packaging, furniture, recycling, brewery), Hospitality (hotel, entertainment, travel; bar, casino, nightclub, stripClub sit on a venue sidecar), Retail (grocery, fashion, beauty, ecommerce), Projects (construction, realEstate), Digital (software, marketing). The table is in the sector-families spec, section 5.
2. Built families still lack: bars on the food grade, education terms, clinic doctor-hours, telecom spectrum, data-center pre-leasing, a CEO resume per family, plant condition in valuation, family rows in the Annual Report.
3. R&D leftovers: Heavy R&D for deep tech, CEO-hired scientists, patent suits, trolls, cross-licensing, universities, contract research, spin-outs.
4. Market leftovers: no wave history screen, per-stock beta, NPC stock prices, per-model API prices, rival lab events, tablets, consoles or app store.
5. FEATURE-ROADMAP (v2.9 baseline) lists C-02 to C-10, C-12, Money Team 2.0, hedge liquidity and bank letters as PLANNED. v4.0.2 status unverified (A and K re-check).
6. **Benchmark defects:** `business/executive-foresight.ts` mints "strategic trading income" for any skill-100 CEO (breaks no-foresight and conservation); no graphable P&L; one fog mechanic; no showcase; no news feed.
7. Careers: seven of eleven are off the kit. None has automation, fog, or a research loop fed by staff, ambition and labor. Hustler and military have no tests.

## 3. Proposal: the depth rubric

Per dimension: 0 absent, 1 token (a stat or menu row), 2 working (state, yearly step, choice, test), 3 meets the bar, which is also the acceptance test. It extends the careers-slice-1 five-layer rubric (loop, choices, world, rivals, arcs).

| # | Dimension | Bar for 3 (checkable) |
|---|---|---|
| R1 | Ladder | 5+ named rungs in a data table, each gated (year, country, skill, money, standing), with a ceiling and a way down. Seeded walk reaches all; none opens before its era. |
| R2 | Living field | Named rivals by era, country, cohort (derived from family seed, or stored, max 192), ranked by a pure function, with memory, competing for the same slot under the same odds. Same seed, same names; no peers where no field exists. |
| R3 | Money and books | One ledger, a named source and sink per dollar, yearly statement, gross equals parts. Scan test (extend `career-money-scan`) plus a 30-year identity test. No minted money. |
| R4 | Assets | 3+ kinds that hold value, can be sold or licensed, pass to an heir (records do not). Capped; counted once in net worth. |
| R5 | Team | 3+ hire roles as `Person` entities (as `actor-team.ts`), with skill, loyalty, cut, poaching. Quality feeds 2+ outcome formulas (fixed-seed swap test). |
| R6 | Law | 6+ country or era rules enforced inside actions (a direct call is refused), one regulator, claim or audit event, 10+ countries differ. |
| R7 | Crises | 20+ event rows, 3 stances, odds from one function the hint prints, at most one choice and two notices a year. 100-life cadence probe. |
| R8 | Research and craft | 3+ tracks. Price fixed by the project, not wealth. Outcome rises with money (double budget, under 2x odds), staff quality, ambition, labor; ceilings and flops. |
| R9 | Reports | Statement, 30-year series (6 numbers a year), rank against the field, milestones. Pure; idempotent re-run. |
| R10 | Fog | Each hidden fact (rival size, true odds, a hire's integrity) has a paid or earned reveal kept as state; default is an estimate band; no text leaks it; no foresight. |
| R11 | Exit and legacy | 3+ exits that settle money, a legacy score, an heir fixture test. |
| R12 | Automation | Hired manager or agent mode with mandate, limits, a yearly letter (12 words a line), no irreversible moves, lockouts enforced in actions. |
| R13 | History and country | First-year tables, 10+ countries differ, no anachronism over a 1900 to 2040 start-year sweep. |
| R14 | World hooks, news | Reads 2+ world signals (war, cycle, wave, policy); writes at most one news item a year; a war-year test changes output. |
| R15 | Showcase | A yearly public event (launch, premiere, tour, fair, ceremony) with spend, odds and a bounded reputation or sales result. |
| R16 | Text and clutter | 3+ variants per branch, no repeat in 10 years, VOICE caps, a voice test, counted over 200 lives. |
| R17 | Tests | Unit, seeded balance (3 styles x 2 seeds x 10 years), opt-in fuzz, money scan, old-save fixture, idempotence, ceiling test (160 years under an era cap, like `growth.test.ts`). |

**Scores** (B business, A actor, S astronaut, M model, U musician; then author, influencer, politician, sports, game industry, hustler, military):

```
         B A S M U | Au In Po Sp Ga Hu Mi
R1  Ladder    3 2 3 2 2 | 1 1 2 3 3 1 3
R2  Field     3 3 3 3 3 | 0 0 3 2 1 1 0
R3  Money     3 3 2 3 3 | 2 1 2 2 2 1 1
R4  Assets    3 2 1 1 3 | 2 1 1 1 3 0 0
R5  Team      3 3 1 2 2 | 1 0 2 1 2 0 0
R6  Law       3 2 2 2 3 | 1 1 3 2 1 1 2
R7  Crises    3 2 2 2 2 | 1 2 3 3 2 1 2
R8  Research  2 1 1 1 1 | 2 1 1 2 2 1 1
R9  Reports   2 2 2 2 2 | 1 0 2 2 2 0 1
R10 Fog       1 1 1 1 1 | 1 0 1 1 1 0 0
R11 Exit      3 2 2 2 2 | 1 1 2 3 2 0 2
R12 Auto      3 0 0 0 0 | 0 0 0 0 1 0 0
R13 History   3 3 3 3 3 | 1 2 3 1 3 1 3
R14 News      2 1 2 1 1 | 0 1 3 1 2 0 2
R15 Showcase  1 2 1 2 3 | 0 1 2 3 2 0 0
R16 Text      2 2 2 2 2 | 1 1 2 2 1 1 1
R17 Tests     3 3 3 3 3 | 2 1 2 1 2 0 0
Total /51    43 34 31 32 36| 17 14 34 30 32 8 18
```

Evidence: R2 `kit/rivals.ts` 386; R5 `actor-team.ts` 461; R8 `rd.ts` odds from budget only; R12 only in business (`board-ceo.ts` 729, `sector-ceo.ts`, `fund-manager.ts`); R15 `music-tour.ts` 316. Business R3 carries the foresight defect.

**Gap table** (mean of the 11 careers against business): R12 0.1 vs 3; R10 0.7 vs 1; R5 1.3 vs 3; R8 1.3 vs 2; R14 1.3 vs 2; R4 1.4 vs 3; R9, R16 1.5 vs 2; R2, R11 1.7 vs 3; R6, R17 1.8 vs 3. Near already: R13 2.4, R1 2.1, R3 and R7 2.0.

**Gate:** every module, business included, has no dimension under 2, at least 14 at 3 and 45 of 51 in total. Business must itself reach 3 on R8, R9, R10, R14, R15, R16.

## 4. Work breakdown

- J1 (M): `test/depth-rubric.test.ts` with a `DEPTH` registry per module (rungs, rows, rules); advisory first. Needs K.
- J2 (XL): kit extensions for R3 to R5, R9, R10, R12, R15: `kit/team`, `books`, `series`, `fog`, `auto`, `showcase`. Needs A, D, E, F, G, H.
- J3 (M x4): actor, astronaut, model, musician finish R8, R10, R12, R14, R16 (area I).
- J4 (L to XL each): author, influencer, military, hustler onto the kit; sports and game industry gain rival cohorts, ledger, era leagues; politician gains books, automation, showcase. Areas I, B.
- J5 (M x5): the five sector families by the existing recipe, about 1,000 lines each; Industrial first (6 trades).
- J6 (L): gap 2 items.
- J7 (M): staff skill, ambition and labor into R&D odds. Needs C.
- J8 (S): replace the foresight mint with a real benefit. Needs A.
- J9 (L): business 30-year series, fog, showcase, news. Needs E, F, G, H.
- J10 (M): re-verify roadmap C-02 to C-12; add tests for thin zones (competition 1.9k test lines for 8.1k source, deep tech, governance).

## 5. Risks

- Row counts are a proxy; keep one human playthrough per module.
- Every new money term needs a ceiling and a 160-year test.
- Events: families already raised load from about .30 to .40 per company-year; 17 more trades need one global popup budget (E).
- Each family moves that trade's RNG stream; re-baseline seeded tests.
- Business settles in 1.7 to 2.2 s a year at elite load; saves reach 1.7 MB; kit records stay under 6,000 JSON nodes (K).
- New state optional; heirs inherit assets, never records.

## 6. Open questions

1. Is "as business" the gate above for all 11 careers? Default: yes, with a named substitute where a dimension cannot apply (hustler R12 becomes a crew).
2. Should careers get automation (an agent runs the year under a mandate)? Default: yes, optional, capped, with a letter.
3. Careers first or the five families first? Default: kit and careers first; families in parallel as table work.
4. Remove the perfect-foresight income? Default: yes.
5. Does the rubric test gate CI? Default: advisory until the programme ends, then gate.
