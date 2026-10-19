# Careers 2.0, slice 1: kit, actor, astronaut, model (design)

Date: 2026-10-19
Status: approved by standing instruction (the user approved the scope in advance; the orchestrator cut it to this slice). Path: architectural.
Branch: `claude/special-careers-design` (off `main`, v3.0.0). Ships with the integration release. Release notes, version bump and the full suite run happen there, not in this slice.
Inputs: five research digests (kit, actor, astronaut, model, music). Where they disagree, the kit's APIs win; section 4.8 lists every resolution.

## 1. What the player asked for

The Special Careers should get systems as big as Business without becoming nonsensical.

Success looks like this, one play session per career:

1. **Actor.** A 1962 life in Los Angeles works studio terms and early TV. A 1995 life in Lagos works a home-video industry. Take a lead, pick a contract (points, exclusive, or push), lose a part to a named rival, get nominated against named rivals, and
   leave a likeness trust an heir collects.
2. **Astronaut.** The Academy row is closed in 1950. In 1985 a graduate sits a selection board ("You placed 9th of 62. The class took 14."), bids for a seat against a named rival, picks a tour length and regimen, pays in bone, radiation dose and family
   strain, sits through an inquiry after a lost crew, and leaves as speaker, author, administrator, commercial flyer or politician with a legacy score.
3. **Model.** Read a Season Board (couture, autumn, spring, year-round, with day caps). Sign a guarantee or a commission-only contract. Watch strain build, rank against fictional rivals, and leave as photographer, label founder or agent.
4. In all three, a hint states odds from the same function that rolls, money balances to the dollar, and nothing from the wrong era appears.

Assumptions (mine): "as big as Business" means the same layers (record, rivals, ledger, era, crises, exits), not the same line count. "Nonsensical" means money from nowhere, a Moon walk in 1925, a streaming role in 1960, or a hint that promises a roll.

## 2. What the audit found

Rubric, 0 to 5, one point per layer, counted by reading the code and not by size:

1. **Loop:** a job, pay, a ladder.  2. **Choices:** levers with a trade-off.  3. **World:** era, country and market change what is offered.
4. **Rivals:** named peers, a ranking, memory of who beat whom.  5. **Arcs:** contracts or ledgers over years, crises with stakes, legacy and exits.

Business scores 5. Actor, astronaut and model score **2 each**: layers 1 and 2 exist, layer 3 is nearly absent (actor reads the brand registry, a genre tweak for `in` and Latin countries and `hasTech tv`; astronaut and model read no era or country),
layers 4 and 5 are absent. Target after this slice: **4 each**. The fifth point needs new screens, minigames or sector families, all cut.

- **Actor** (`actor.ts`, 948 lines): one dice sum lands a role, one tick settles a project, pay and budgets ignore year and country, the agent is a bare `{name, firm, quality, cut}`, residuals die with the owner, and streaming roles are offered in 1960.
- **Astronaut** (`astronaut.ts`, 980): no year gate (a 1925 life walks on the Moon), no rivals, crews or funding, no body or family cost, launch death is one 0.4% roll, and the only exit is Retire.
- **Model** (`model.ts`, 694): a flat retainer, bookings are one marketability roll three times a year, and there is no calendar, brand, rival, ranking, strain or exit.
- **Shared:** all three need the same plumbing (owner-stamped record, idempotent year, popup budget, honest hint). Built three times it drifts. Built once it is the kit.

## 3. Scope

- **In:** the kit (`src/game/special/kit/*`), Actor 2.0, Astronaut 2.0, Model 2.0 (each an `<id>-sim.ts` entry plus helper files), one short `docs/ARCHITECTURE.md` section, and the tests in section 10.
- **Cut, later release:** Music 2.0 (largest design, balance risk for existing saves; its registry slot, `CareerId` entry and test setup arrive with it), sector families, new business trades (no `INDUSTRY_IDS` change, no business trade is added or
  edited), new screens and minigames (no `MinigameKind`, no `src/ui` change; the report card is a notice plus info rows).
- **Not touched** (another track edits them): `business/economy.ts`, `dynamics.ts`, `state.ts`, `yearly.ts`, `heavy-rd.ts`, `deeptech-*.ts`, `life.ts`, `history/market-events.ts`. Careers read business, nation and economy state and never write it.
- **Shared edits, and only these:** `special.ts` (one import, one `YEARLY` tuple), `menus.ts` (one chained `??` for the actor likeness asset), `politics.ts` (the astronaut poll edge, two lines, droppable), `docs/ARCHITECTURE.md`, `test/special.test.ts`
  (astronaut block), `test/special-common-safety.test.ts` (key list). `scripts/voice/units.mjs` is not edited; the test kit lints kit text instead (4.7). The careers' own legacy files (`actor.ts`, `astronaut.ts`, `model.ts`) take the exports and edits named in sections 5 to 7 and nothing else.
- **Check budget per task:** typecheck plus the targeted vitest files named in section 12. No full suite here.

## 4. The shared kit

About 1,010 source lines and 740 test lines. No career logic, no edit to `special/common.ts` (the kit imports `ownerKey`, `ownerMatches`, `peek`, `prof`, `stableRoll`, `stableChoice`, `withHint`, `say`, `tell`, `blocked`, `myJob`, `hire`, `clamp100`,
`money`, `addFame` as exported today).

### 4.1 State (`kit/state.ts`, 190)

- One versioned, owner-stamped, bounded record per career at `g.flags['special.<key>']`. `KIT_LIMITS`: rows 12, memory 16, cool 24, done 24, line 90. `CareerBase` = `{v, owner, settledYear, settledAge, seq, standing 0-100, peak, years, appt, rows:
  YearRow[], memory: MemoryRow[], cool: Record<string, number>, done: string[]}`. `YearRow` = `{y, income, spent, rank, of, standing, note}` (rank 0 of 0 means no peers). `MemoryRow` = `{id, name, met, won, lost, grudge, last}`.
- `defineCareerState({key, version, migrate, extra, start})` returns a `CareerStore`: `has`, `peek` (pure normalized copy, null for another owner or none), `view` (peek, else a fresh record built by the migration chain from nothing; pure, never writes;
  for menus, hints, subtitles), `mut` (created through `common.prof`, migrated and normalized in place, stale keys pruned; for actions, scripts and yearly hooks only), `read` (pure, for tests).
- `migrate` has `version` entries; step i lifts v_i to v_(i+1); no `v` means v0; each step gets a shallow copy and `g`, so a step may read a legacy profile and never writes one. `extra(raw, g)` clamps and defaults every career field and never throws.
  `start` is the initial standing (default 20).
- Helpers: `claimSettle(s, g)` (false when this (year, age) is already settled, else writes the marker first, then true), `nextId`, `appointmentId(job)`, `cap` (keeps the newest), and junk-tolerant readers `rec arr int flt txt readRows readMemory`
  (control characters stripped, strings cut).
- Heirs: `life.ts` rebuilds flags from a whitelist, so a record never reaches an heir. Rosters derive from the family seed, so an heir meets the same peers with an empty record. No kit edit to `life.ts`.

### 4.2 Rivals (`kit/rivals.ts`, 210)

- Peers are derived, never stored: `rosterAt(g, spec, year?, country?)` builds named fictional rivals per career, country and 5-year cohort from `familySeed(g)` (lifeId without `-gN`), cached by key (200 entries). A rival is `{id, name, gender, country,
  born, debut, exit, peak, arc, edge}`. Arcs: rising .30, steady .30, comet .20, late .20. Names come from the country's pool with era-fitting first names (`nameFitsYear`), never a brand.
- `RivalSpec` = `{career, edges, field(year, country) 0-40, debutAge [18,30], length [8,30], peak [35,95], foreignShare .15, depth(g, year, country) 0.5-1.3}`. `field` returning 0 is the era and country gate: no such field yet, no peers, `rank 0 of 0`.
- `strengthAt(r, year)` is 0 to peak and 0 outside [debut, exit). `formOf(g, spec, r, year)` is a hidden but deterministic integer -8 to +8. `activeField` returns the top 24 by score. `standingOf(g, spec, me, memory)` returns `{rank, of, me, top, beat,
  lostTo}`; an empty field gives rank 1 of 1.
- `beatOdds(me, rival, spread 10)` = clamp((me - rival + spread) / (2 x spread), 0, 1). `rollScore(g, base)` = base + `randInt(-10, 10)`, actions and settle bodies only. `remember` (cap 16, evicts lowest `met + 2 x grudge`, then oldest), `noteRival(rows, {id, name}, year, {met, won, lost,
  grudge})` (one named contest, same cap and eviction; the careers use it for auditions, bids and castings, since `remember` works on a whole `Standing`), `cool` (grudge -1
  yearly when `last < year - 1`), `grudgeBonus` = min(9, 3 x grudge). Roster, `activeField`, `standingOf` and `formOf` never touch `g.rng`, so menus and hints can call them.

### 4.3 Year wrapper (`kit/year.ts`, 240)

- `settleYear({career, store, incomeLabel, active, run, peers, crises, prison})` returns a hook that is a pure no-op without a job or a record. With one: `claimSettle` writes the marker before any roll or payment, `run(c, live)` runs (`live` is false once
  the job is gone, so only already-earned items pay out), peers are ranked, one `YearRow` is booked, and the popup budget is enforced. `prison` defaults to `'skip'`.
- `CareerCtx` = `{g, career, s, year, budget, field, earn(source, amount), pay(sink, amount)}`. `earn` wraps `earnIncome`, rounds, refuses empty sources, non-finite and sub-1 amounts, and audits. `pay` wraps `spend`, returns false and moves nothing when
  short, and audits. These two are the only ways a career moves money.
- Budget per career-year: **1 choice and 2 notices** from the yearly hook, 3 and 6 inside an action. `careerSay` (a free function so the voice tooling can find it) uses `notice()` within budget and a log line beyond it; `careerLog` fits to 90 characters.
  `pendingCareerChoices(g)` counts queued choices whose `scriptId` starts `career.` and caps them at 2 across careers.
- `AuditEvent` (test sink, null in production): `earn`, `pay`, `text` (role log, outcome, scene, title), `books` (delta, booked, moves; emitted at every settle and every `gatedAction` boundary) and `crisis`. `fit(text, max)` cuts at the last space.
  `budgetLevel(g, line)` reads `policyOf(g, country).national.budget[line] ?? 1`.

### 4.4 Crisis (`kit/crisis.ts`, 230)

- `defineCrises({career, store, talent, defs})` registers one script per def, `career.<career>.<id>`, and returns `{offer(c)}` (false when the budget, a cooldown or the pending cap blocks). An offer happens with chance `CRISIS_ODDS = 0.35` per active
  career-year, drawn from `g.rng` after the settle marker, then `weightedPick` among eligible defs (`weight` is pure, 0 means not eligible, per-def `cool` defaults to 4 years).
- A def has `make` (data from `seeded`, keyed by family seed, career, def id, year and the Time Machine `outcomeTag`, never `g.rng`), `scene` (at most 140 static characters, ends "What will you do?") and 2 or 3 options keyed `safe`, `bold`, `cash`. Each
  option: label (5 words or fewer, imperative), `odds` (pure, clamped .05 to .95, **the only probability source** for both the roll and the hint), and `good` and `bad` branches of `{text (at most 120), fx}`.
- `Effects` = `{money, standing, fame, happiness, health, grudge}`. `applyEffects` clamps a negative `money` to cash on hand (no debt) and keeps standing and peak in 0 to 100. A replayed script, a wrong owner or a wrong year changes nothing (one-shot
  guard plus `done` ids).
- `bestStance` maximises p x `fxValue(good)` + (1 - p) x `fxValue(bad)`, where `fxValue` = standing + .6 fame + 6 money / typicalIncome + .4 happiness + .5 health; ties keep the order safe, bold, cash. `oddsText(p)` prints `about ${5 x round(20p)}%`.
  `hot(g, career, items)` is the shared `stableChoice`. `honest(g, talent, text)` returns a hint only with the talent.
- **Three additions this spec makes** (the careers need them, the kit digest lacks them): `Branch` gains an optional `then(s, g)`, a mutation of the live record (no money, no rng) so a crisis can set a career field such as typecast, loyalty or safety, and
  can move karma or notoriety (`addHidden`), a flag skill or a relationship; money, standing, fame, happiness and health still move only through `Effects`. A fixed outcome (an `Option` with no `odds`) sets `good` and `bad` to one branch and prints no percentage in its hint.
  `Effects.grudge` is `{id, name, by}`: action and script contexts have no peer ranking, so the effect carries the rival's name and `applyEffects` writes the memory row itself through `noteRival`.

### 4.5 Menu helpers (`kit/menu.ts`, 120)

- `gatedAction({id, label, emoji, career, store, gate, hint, confirm, input, once, run})`: `disabledReason` is `blocked(g) ?? gate(g, store.view(g))`, and `run()` re-checks both, says why on refusal, applies `once` through `useYearAction`, then calls
  `store.mut`, builds the ctx and emits a `books` audit. Gates are enforced inside `run()`, never only in the menu.
- `standingMenu({id, label, emoji, store, standingLabel, incomeLabel, peers})` is the report card as info rows: standing, the last 5 years (`reportLines`, 3 lines of at most 90), top peers, rivals who remember you. Labels: 'Reputation', 'Marketability',
  'Readiness'. It reads `view` and `standingOf` only.
- Menus, hints and subtitles use `view` and `peek` only. A `mut` or a `g.rng` draw in a menu throws under the fuzz `deepFreeze`.

### 4.6 Registry and wiring (`kit/careers.ts`, 30)

- `CAREER_SIMS` holds `{id, key, yearly}` entries in alphabetical order: slice 1 has `actorSim`, `astronautSim`, `modelSim`. `yearlyCareerSims(g)` runs each, stopping when the character is dead.
- `special.ts`: `import { yearlyCareerSims } from './special/kit/careers'` after the `./special/astronaut` import, and `['careers2', yearlyCareerSims],` between `['astronaut', yearlyAstronaut]` and `['hustler', yearlyHustler]`. The legacy actor, model and
  astronaut hooks have booked their year by then. `specialCareersMenu` and `specialJobNodes` need no edit: each career spreads `standingMenu` and its `gatedAction` rows into its own menu functions.
- A new career later costs four lines in `special.ts`: one import, one `YEARLY` tuple, one `specialCareersMenu` child, one `...xJobNodes(g)`.

### 4.7 Test kit (about 740 lines)

- `test/career-kit.ts` (helpers, no vitest import, like `fuzz-kit` and `politics-kit`; reuses `FailureLog`, `driver`, `deepFreeze`, `renderAll`, `probeActions`, `installStorageShim`, `diffSummary`; `fuzz-kit.ts` is not edited). `CareerId` = actor,
  astronaut, model. Strategies: `steady` (stance safe), `greedy` (cash), `reckless` (bold), `idle` (no menu actions).
- `newCareerGame(id, seed, country='us', year=1995)` (age 24, money 200,000, hired), `playCareer(...)`, `drainCareer`, `pickStance`, `checkLedger`, `voiceProblems` (the `scripts/voice/rules.mjs` flags: over-cap with 30 slack, em-dash, chatbot, stock,
  no-contraction, Nobody, Everyone, disclaimer, banned phrases; applies only to text events from kit helpers, so legacy text is never judged), `finiteJson`, `roundTrip`, `assertHonestOdds`.
- Each simulated year: purity (`renderAll` on a frozen state), up to 4 strategy actions on clones with a `books` ledger check, `probeActions` every third year, `ageUp` on a clone, drain, then `checkLedger`, `finiteJson`, voice, and a save round trip every
  5 years.
- CI matrix `test/careers-balance.test.ts`: 3 careers x steady and reckless x seeds 11 and 12 x 10 years (12 runs, 180 s). Asserts empty text, steady keeps standing above 5 and is never fired before year 3, reckless income stays under 60 x `typicalIncome`
  a year, idle changes the sim record only in `rows` and `years`. Opt-in `fuzz-careers.test.ts` (`FUZZ=1`, 30 seeds, 16 years; `note-` kinds print and do not fail).

### 4.8 How the digests were reconciled (rules every career follows)

1. **Keys:** `special.actor.sim`, `special.astronaut.sim`, `special.model.sim` (not `actor2`, `astronaut.corps`, `model2`). Career fields live in `extra`.
2. **Base fields replace career copies:** `standing` (actor star, astronaut standing, model ranking score), `rows` (the reports), `memory` (tracked rivals and grudges), `cool` (cooldowns and temporary modifiers, value = last year it applies), `done` (seen
   events), the settle marker (replaces `claimYearly` ids and per-row `lastYear` as the primary guard).
3. **Rivals are derived, none stored:** the actor 72-slot pool and the model `MdRival` rows become kit rosters. Astronaut peers keep no flights or levels; a lost crew is named once inside an `Inquiry`.
4. **Popups:** 1 choice and 2 notices a career-year. The event chance is the kit's 0.35 (the digests said .55 and .45), and each digest probability becomes a def `weight`. Forced choices (contract renewal, inquiry testimony, medical board) take the slot
   first and a loser waits a year.
5. **Menus** read `view` and `peek`. **Gates** live in `gatedAction.run()`.
6. **Money:** every move goes through `c.earn` and `c.pay`. No `addMoney`, so the two capital moves in the digests (actor rights sale, model signing advance) are booked as income and taxed like a fee. Digest calls to `payForAction` and `spend` become
   `c.pay`.
7. **Talents:** actor `Acting`, model `Modeling`, astronaut `Academics` for every hint (the digest's Leadership and Athletics variants are dropped).
8. **Scripts:** new ids are `career.<id>.<name>`; every legacy id stays registered so a queued modal from an old save still resolves. Non-crisis scripts (contract, board, plan, renewal) may offer 4 options; `pickStance` falls back to the first option when
   its stance is absent.
9. **Legacy yearly hooks** behave line for line as today for a life with no sim record (the pinned tests build such lives). The only edits are the guards named in the Yearly sim bullets of sections 5 and 6 (the model needs none).
10. **Saves and text:** `SAVE_SCHEMA` stays 2, zero new em-dash literals, no new `MinigameKind`. Real-world dates carry the digests' approximations.

## 5. Actor 2.0 (`actor-state`, `-data`, `-world`, `-pipeline`, `-team`, `-events`, `-legacy`, `-menu`, `-sim`)

- **State.** `special.actor.sim`, an optional, owner-stamped, versioned record (v1, start 20). `standing` is the star score = 0.40 fame + 0.25 rep + 0.20 mean popularity of the last three credits + 0.15 acting skill, rewritten at year close. `memory`
  holds tracked rivals (beat, lost, grudge). `extra`:
  ```ts
  { migrated: boolean; rep: number; noms: number; dry: number; scandal: number   // meters 0-100, rep starts 50
    layLow: number; studioFrom: number                                           // years, 0 = none
    type: Record<'action'|'comedy'|'drama'|'genre'|'romance', number>            // typecast 0-100, starts 0
    team: { agent: Rep | null; manager: Rep | null; press: Press | null }
    pipeline: Proj[]; credits: Credit[]; awards: string[]                        // caps 4, 64, 40
    totals: { gross: number; net: number; cuts: number; spent: number } }
  ```
  `Rep` = `{personId, name, firm, quality 20-95, cut .05-.20, loyalty 0-100, since}` (a `createPerson` Person). `Press` = `{firm, quality 30-90, since}`. `Proj` = id, title, kind film or tv, genre, type, role (Extra, Supporting, Lead), studio and
  `studioId`, industry, budget, `terms {fee, points 0-.12, exclusive}`, stage offer, shoot or post, developed, buzz, campaign 0-30, season 1-9, director 40-90 (seeded at landing), at most 8 co-stars, window (normal, awards, dodge), quality, since,
  `lastYear`. `Credit` = the legacy fields plus id, type, industry, studio, year, gross, backend, `trust`.
- **Migration.** `migrate[0]` lifts the legacy `special.actor` profile: rep from `reputation`; credits copied (type from `TYPE_OF[genre]`, industry from the home country, gross 0, backend 0, trust false); awards, noms, dry copied; the agent becomes
  `team.agent {personId '', loyalty 60, since g.year}`; `Job.data.project` becomes `pipeline[0]` (stage shoot, fee = pay, points 0, director 65). It is pure, so `view` shows it. The first `mut` (action or settle) sets `migrated` and clears
  `job.data.project`. The legacy flag is never written again, so a rollback still reads it. Likeness lives in `Asset.details.actorLikeness`, not in a flag.
- **Yearly sim.** `actorSim.yearly` = `yearlyLikeness(g)` (any holder, per-asset `lastYear`) then the kit hook. **Legacy guard:** `yearlyActor` returns at the top when `store.peek(g)?.migrated`; the sim then owns project, residual, dry-year and agent
  steps and must keep the legacy duties `syncTenure`, `masterActing`, `count('movies')` and the own-flags `special.actor.bollywood`, `.telenovela`, `.dropped`. A tick that finds `migrated` false means the legacy hook already settled that year, so it
  adopts the legacy data and returns. Steps in order:
  1. Context (pure): industry, heat, hot type, pool rank. Only later steps draw `g.rng`.
  2. Residuals: each credit not in a trust pays its residual, then it becomes residual x (0.75 + 0.12 x `techOdds(streaming)`); under 25 it zeroes. Studio-system years add a retainer of 40% of last fee in dry years, seven years at most.
  3. Team: loyalty +3 if net pay > 0, +2 on a hit (popularity >= 65), -5 in a dry year; quality drifts 2 toward star. Poach risk = clamp(0.03 + max(0, q-55)/250 + max(0, 55-loyalty)/250 + 0.05 x agencyHeat, 0, 0.35), one draw per rep.
  4. Shoot wrap, per project in id order with `lastYear < year`: quality = 0.5 skill + 15 (Acting talent) + developed + budget qBase + (director-65)/6 + chemistry 0-5 + fit (+3 or -5) - 8 per extra concurrent shoot + `randInt(0,35)`; extras +10. The fee
     pays through `payActor`. Studio and blockbuster films move to `post` (no pay) for a year; indie films and every TV season release in the same tick. Extras skip offers, post and slot limits.
  5. Film release: gross = base x scale x heat x leisure x (0.25 + 1.5(q/100)^1.6) x (1 + buzz/200) x trend x window x clash x luck (one `g.rng` draw, 0.6 to 1.5); heat, leisure and trend read the release year. Popularity = 50 + 28 ln(gross/breakEven),
     breakEven = 2.2 x cost. Back-end = points x max(0, gross - breakEven). Budgets (cost, base gross at scale 1, qBase): indie 2M, 4M, -5; studio 40M, 70M, +5; blockbuster 180M, 420M, +15.
  6. TV season: gross = base x scale x audience x (0.3 + 1.2q/100) x (1 + buzz/200) x trend x luck, breakEven 1.5 x cost. Popularity >= 45 and season < 9 renews at min(0.92, 0.35 + pop/150), fee x (1.1 + pop/500); else it ends. Budgets (cost, base gross):
     cable 3M, 6M (qBase -5, from 1980); network 4M, 8M (+5); streaming 8M, 14M (+5, needs `hasTech streaming`). Audience = `techOdds(tv)` (`streaming` for streaming) x the industry TV multiplier.
  7. After a release: fame +1 + round(pop/30) supporting, +3 + round(pop/14) lead, +1 with the Acting talent; rep += (q-50)/8; typecast +10 for a lead and +5 supporting in that type, other types -3; credit row; residual = fee x 0.03 x pop/50 (none for
     extras).
  8. Dry year (no wrap, no release): dry +1, fame -1 to -3 above 10, agent leaves at loyalty < 30 and dry >= 2. Scandal falls 10 a year (18 with press quality >= 60); 50+ costs fame 1, 75+ costs 2; fees x (1 - scandal/250).
  9. Awards: the best release with q >= 70 and popularity >= 55 is nominated at 0.4 + campaign/100. Win = clamp(0.2 + (q-60)/60 + (pop-55)/150 + campaign/100 + window + studioFame/60 - fieldPressure, 0.03, 0.75).
  10. Crisis offer, then close: `standing` = star, rank, one `YearRow`, `job.salary` = sum of shoot fees, caps, one 'Year in Film' notice under 120.
- **Levers** (all `gatedAction`; ids kept where legacy):
  - `actor.audition` (id kept): listings 4 + 1 talent + 2 agent + 1 manager (quality >= 60); auditions a year 3 + 2 agent + 1 manager. An exclusive deal, a same-kind second shoot or lay-low blocks it inside `openAuditions`, `pickRoleScript` and
    `landRole`.
  - Slots: one film shoot and one series shoot at once, four projects counting post, extras exempt. Two shoots cost -8 quality each and -3 happiness a year.
  - Contract choice after a landed lead or supporting role (`career.actor.contract`, stage `offer`): Sign as offered; Points (fee x0.8, points x2.5, max 12%); Exclusive (fee x1.2, no second shoot); Push (fee x1.3 at the odds below, else 35% the offer
    lapses). Push odds = clamp(0.30 + star/250 + agentQ/300 + managerQ/500 + 0.06 x min(3, other listings paying as much), 0.10, 0.85). Standard points: lead with star >= 45 gets 2%, supporting with star >= 60 gets 0.5%.
  - Team menu `actor.team` (`actor.agent.hire` and `.fire` kept, adds `actor.manager.*`): three candidates cached by `yearlyList`, 2 searches a year per role. Pull = 0.6 star + 0.2 rep + 3 min(6, credits) + roll 0-30 must reach 0.8 quality. Cuts: agent
    8-14%, manager 11-17%, combined cap 30%.
  - Project menu `actor.project.<id>`: Develop (once a year, +8-15, plus manager q/12 free), Co-Stars, Press Tour (4% of fee, buzz +6, twice a year), Release Date (post only; awards window gross x0.92 and odds +0.08; dodge window gross x0.95 removes a
    clash), Awards Campaign (5% of last year's net, min 1,000 x scale, campaign +10 once per project), Walk Away (rep -15, shoot dropped).
  - Range Work (manager only): 8% of last year's net, min 1,500 x scale, one type -15 typecast, once a year. Typecast >= 50 gives that type +20% fees and +10 audition base; every other type -10 audition base and -5 quality. Press retainer: max(1,000, 5%
    of last year's net) x scale a year, quality 30-90, buzz +quality/10 per release, 8 extra scandal decay at 60+; unpaid means they leave, no debt.
  - Scandal menu (scandal > 0): Apologize (free, once, scandal -25, fame -1), Crisis PR (10% of last year's net, scandal -40), Lie Low (no auditions this year, scandal -30). Kept: practice, stunt (`actor.stunt`, risky), retire, quit. `scale` is the
    industry scale from the Era and country bullet.
- **Rivals and market.** Kit roster, `career 'actor'`, edges = the five types, `peak [38,98]`, `debutAge [19,26]`, `length [20,40]`, `foreignShare .05`. The digest's tier A, B, C shares collapse into the kit arcs. `field` = 0 before the industry's film
  start, else round(base x (0.7 + 0.3 x min(1.3, heat))) with base 20 hollywood, 16 bollywood, kdrama, hongkong and domestic, 14 nollywood (about 10 to 22 active).
  - Rank = `standingOf(g, spec, star, memory)`; the top 3 is A-list (casting pressure vanishes, agents ask 2 more points of cut).
  - Casting pressure = clamp((mean score of the top 3 active rivals of the role's type - star)/8, 0, 8) x (lead 1, supporting 0.5, extra 0), subtracted from the audition score, cap 4 for supporting. A loss names the top rival and adds grudge +10. A rival
    who beat you twice adds +1 pressure. Grudge >= 30 or lost >= 2 opens `rivalFeud`.
  - Release clash is a seeded fact per industry, type and year; calendars are public a year ahead, so menus show next year's. A clash cuts gross x0.85 unless dodged. Hot type = top two of exp(0.22 x normal) trends, known for the current year only.
  - Awards field: nominees are the top three active rivals of the type. fieldPressure = clamp((mean score - q)/200, 0, 0.25). Winning beside a nominated rival gives grudge +15; losing to one gives lost +1. Poaching: invented rival agencies, seeded
    `agencyHeat` 0-1 per industry and year.
  - Market: `economyOf(g, country).sectors.leisure.demand` clamped 0.7-1.3, heat keyframes, TV audience from `techOdds`. Nothing in business or nation is written.
- **Era and country.** Resolved from `g.character.countryId` each time (`actor-data.ts`).
  - Industry (scale): hollywood us ca gb ie au nz (1.0); bollywood in pk bd (0.30); nollywood ng gh (0.02); kdrama kr (0.14); hongkong hk (0.16); domestic everyone else (0.25 x country wealth, min 0.05). Film start: hollywood 1910, bollywood 1913, kdrama
    1955, hongkong 1950, nollywood 1992, domestic 1900; before its start a named industry plays domestic.
  - Heat keyframes (linear): hollywood 1910 0.3, 1927 0.8, 1946 1.2, 1960 0.7, 1977 0.9, 2000 1.2, 2019 1.3, 2020 0.5, 2023 1.0; bollywood 1.3-1.4 over 1994-2019; Hong Kong 1.5 in 1993 falling to 1.0 by 1998; all end at 2026.
  - Studio system: hollywood 1928-1955, bollywood 1935-1955, domestic 1930-1960; terms forced (points 0, exclusive, fee x0.7) plus the dry-year retainer; it ends by year, never by a flag. Sound shift: hollywood-type industries 1927-1931, once. TV needs
    `hasTech tv`, cable needs 1980, streaming needs `hasTech streaming` (fixes the 1960 streaming roles). Blockbuster budgets open 1975 (epic before). Korean TV export 1.0 in 1997 to 1.6 by 2013. Nollywood theatrical gross x0.3 before 2010.
  - Signature genres join `TYPE_OF` (Bollywood, K-Drama to romance; Nollywood Drama to drama; Martial Arts for hongkong to action; Telenovela stays for Latin domestic) and take 40% of that industry's listings. Awards, invented: Golden Reel (hollywood
    film, 1929), Primetime Glow (hollywood TV, 1949), Silver Lotus (bollywood, 1954), Jade Crane (kdrama, 1963), Lantern (hongkong, 1982), Palm Screen (nollywood, 2005), National Film or Television Prize (domestic, 1946), Viewers Choice (streaming, 2013).
  - Studios and networks come from `brandPool(g, 'film-studio')` and `brandPool(g, 'streaming', {segment})`; `Brand.fame` 1-10 is clout; an invented name where the registry has none. Censorship risk = (100 - `institutionStrength`)/200 + `mediaControl` x
    0.3 + 0.15 if authoritarian; it only gates the censor event; regimes are never named.
- **Events** (eleven crisis defs, weight = the digest probability, cooldown 3 to 10 years, effects through `Effects` and `Branch.then`; labels abridged):
  - `redScare` (hollywood-type, 1947-1957, 1+ credit): Name them (fees +10% for 3 years, rep -15, karma -10), Refuse (fees -30% for 3 years, rep +5, karma +8), Stall (0.35 + rep/200 else counts as refuse).
  - `soundShift` (1927-1931, once): Voice lessons (3,000 x scale, +6 acting, keeps leads at 0.5 + voice/200), Wait (fees x0.75 until 1932), Stage (pipeline paused a year, rep +3).
  - `guildStrike` (1960, 1980, 2007, 2023, with an active shoot): Picket (fee x0.5, rep +6, loyalty +2), Cross (fee kept, rep -12, rival grudge +10), Wait (shoot slips to post).
  - `techShift` (first year `techOdds` of tv or streaming passes 0.10, once each): Embrace (+2 listings of the new kind, buzz +5, film rep -3), Resist (film fees +10% for 3 years, no new kind for 3).
  - `scandalLeak` (fame >= 25): Deny (0.35 + rep/200 + press q/200 ends it, scandal +5, else +40), Apologize (scandal +15, fame -1), Sue (5% of last year's net, wins at 0.45, else +30).
  - `poach` (from the poaching roll): Follow (cut +2 points, loyalty 50), Stay (replacement 15 quality lower, new Person). Loyalty < 40 skips the choice; they leave with a notice.
  - `franchise` (lead, star >= 40): Sign (next 3 projects of that type pay fee x1.5, typecast +25), Ask for points (5% at 0.4 + agentQ/250), Decline (rep +2, typecast -5).
  - `shelved` (a film in post): Lobby (3% of fee, date holds at 0.5 else slips a year), Accept (no release, credit unreleased, rep -3). The wrap fee is paid either way.
  - `censor` (release, risk > 0.25): Re-edit (quality -8), Release abroad (gross x0.6, rep +2), Fight (4% of fee, releases at 0.3 + `institutionStrength`/200 else gross x0.4).
  - `injury` (action or genre, shoot year, 0.25): Double (1% of fee, quality -3), Do it yourself (0.4 + athleticism/250: buzz +8, happiness +4; else health -10 to -25, quality -5).
  - `rivalFeud` (grudge >= 30 or lost >= 2): Trade barbs (buzz +6, notoriety +2, grudge +20), Ignore (grudge -5), Joint project (0.5 + rep/300: grudge -25, a co-star slot; else +5).
- **Hints** (`honest(g, 'Acting', ...)`, never a future roll, luck, trend or award result): `bestListing` (highest odds, biggest part, biggest check, by the same `auditionBase` the resolver uses, which now includes pressure, typecast and scandal); best
  approach (with typecast >= 50 the read is safer); best contract by `contractEV` = net fee + points x max(0, projectedGross - breakEven) - 0.25 fee for exclusive, projected on this year's heat, trend and median luck, worded "on average"; best
  representative = highest quality - 120 x cut among those with pull + 30 >= 0.8 quality (states cut and quality, never loyalty); the industry row (hot type, next year's clash flag); every crisis through `bestStance`.
- **Legacy and exits.** Likeness trust: an Asset of kind other with `details.actorLikeness` v1 `{author, actor, country, industry, streams, likeness, classics, licenseUntil, advance, unrecouped, receipts, lastPaid, lastYear}`, modeled on
  `music-rights.ts`; `menus.ts` chains `actorLikenessNodes` after `musicMasterNodes`.
  - Create Trust costs 25,000 x scale (waived once on Retire); credit residuals move in (`trust: true`) and stop paying personally. Likeness at creation = min(100, 0.45 peak star + 3 awards + 4 classics + 0.5 credits); classics are credits with q >= 85 or
    an award.
  - `yearlyLikeness`: streams x (0.88 + 0.015 min(4, classics)); licensing = likeness x 150 x scale x leisure demand when likeness >= 20, paid by `c.earn` to the holder. Value = streams x 6 + likeness x 400 x scale. License Five Years pays an advance of 3
    x annual licensing; 35% of licensing then recoups it, the rest expires. Sell Rights pays 70% of value (booked as income, rule 6) and removes the asset. Heirs lose 5 likeness a year; Promote Estate (5% of value, +8, once) offsets it. Minors cannot act
    on it (gate age 18).
  - Inheritance needs no new code: the asset is divisible property in `continueAsChild`. Retire (age >= 55 or 10 credits, no active shoot): `leave(g, 'retired')`, a farewell notice. Quit mid-shoot drops each shoot (rep -15, floor -30, fame -3) as today.
    Death moves only the asset.
- **Money.** `payActor(c, gross, label)`: cuts = round(gross x min(0.30, agentCut + managerCut)), net = gross - cuts, `c.earn(net)`; `totals` proves gross - cuts = net. Studio, network and the credit or likeness stream are the sources; every cost is a
  `c.pay` re-checked inside `run()` and paid to nobody. Listing fees keep the old formulas x industry scale (hollywood 1.0 keeps the pinned tests identical); agents add fee x (1 + q/400) at landing, so the gifted-versus-plain pay test is untouched. A
  lapsed offer pays nothing and a departed rep leaves no balance.
- **Caps.** Points 12%; back-end 8,000,000 x scale a film; fee 25,000,000 x scale; buzz 100; campaign 30; press tour twice a year per project (press spend lifts buzz at most +12 a project, gross at most 6%); pipeline 4, credits 64, awards 40. **Cut:**
  stage and touring theatre, voice acting, producing pivots, moving abroad, scene minigames, rival Persons, unions beyond the strike, co-star romance, merch, a full studio contract screen, Time Machine forks.

## 6. Astronaut 2.0 (`astronaut-data`, `-state`, `-world`, `-class`, `-flight`, `-events`, `-exits`, `-sim`)

- **State.** `special.astronaut.sim`, an optional, owner-stamped, versioned record (v1, start 40). Base `standing` gates promotion (needs 50/55/60/66/74 for the next rank and a free slot, caps 12/8/4/1 for ranks 2 to 5); `memory` holds rivals met in bids;
  `rows` income = flight pay, lectures and memoir (salary is the legacy hook's). `extra`:
  ```ts
  { agency: string; stint: string
    bone: number; muscle: number; dose: number; family: number          // 15-100 (start 100), 15-100, 0-100 (100 = flight ban), 0-100 strain
    mood: number; safety: number; lobby: number                         // 0-100, 15-95 (start 60), -6..20
    skills: { eva: number; pilot: number; fit: number; team: number }   // 0-100
    fund: number[]                                                      // last 6 funding values
    classes: ClassRec[]; flights: FlightRec[]; inquiries: Inquiry[]     // caps 6, 12, 4
    tally: { flights; days; evas; commands; lunar; mars; own; concerns; blame: number; firsts: string[] }   // firsts 8
    mark: { groundedYear: number; rush: boolean }
    legacy: { hall: boolean; memoirs: { year; advance; last; paid }[] } }   // memoirs 3
  ```
  `ClassRec` = year, agency, seats, finalists, rank, cut, mates (names). `FlightRec` = year, type, role, days, regimen (light, standard, intense), result (clean, abort, anomaly), crew names, bone, dose. `Inquiry` = id, year, cause (hardware, procedure,
  schedule, crew), lost (names), involved, yearsOpen, status, stance, coverup. Once-a-year markers use `useYearAction` through `gatedAction.once` (bids and lectures call it with their own limit inside `run()`); names are cut to 40.
- **Migration.** `migrate[0]`: tally from legacy `{missions, spacewalks, moonLandings, marsLandings}`, standing = `job.performance`, skills = round(0.6 x performance), mood = the year's target, safety 60, bone and muscle 100, dose 0, agency from
  `Job.data.agency`. No retroactive damage. Legacy `special.astronaut` and `Job.data` stay as they are (`politics.ts` sets the own-flag `marsFunding`, `mindBody.ts` counts `spaceCamp`). A new `readAstro()` reads the legacy profile tolerating junk
  (`planets: 'bad'`). Admin state lives in `Job.data.admin {years, stance}`.
- **Yearly sim** (after the legacy hook, which still pays salary, bumps performance, retires, promotes and runs `yearlyCadet`). **Legacy edits, all no-ops without a record:** promotion gains `&& astroPromotionOk(g, next)`; mandatory retirement reads age
  68 when `job.level >= 6`; `yearlyCadet` runs the selection board instead of the 75% offer roll (the one deliberate behaviour change; section 9). The sim never pays salary. With no astronaut job (cadet, retired) only the memoir tail runs. Flights reach the legacy mission code through a
  bridge: `resolveFlight` rolls the launch, pays flight pay and books the body costs, then hands the surviving flight to the legacy asteroid chain and `arrive` (`flyOn`, flagged `paid` so `arrive` skips its own bonus); hop, orbit, orbiter and own flights use a
  generic `flight` arrival scene, so no era-wrong station, Moon or Mars text appears. The legacy `DEST_SCRIPT` stays for stale modals. Steps:
  1. Marker first, prison skipped, then the world (pure): F = clamp(round(base x line^0.85 x econ x (0.7 + 0.6 x mood/100) + lobby), 5, 100); base 70/30/52/46/56 by era; line = `budgetLevel(g, 'space')`; econ = 1 + 2 x growth, minus .06 if the deficit is
     over 5%.
  2. Mood: += round(.25 x (target - mood)) + shock(year, country) + 2 per clean flight - 4 per abort - 18 per own lost crew, clamp 0-100; targets 70/40/52/50/55 by era; it starts at the year's target.
  3. Safety: +2 when F >= 60, -3 when F < 35, -3 when the space line was cut below 100% in the last 2 years, +10 when an inquiry closes with the true cause named.
  4. Body: a year without a flight gives bone +3 and muscle +8; a flight year +1 and +3. Bone under 70 costs health -ceil((70 - bone)/10), max -3; under 60 adds a 10% stress-fracture roll. Dose never recovers.
  5. Family strain: flights add days/30 x 1.4 (+4 with a child under 12); a year at home -10. At 50+ with a partner, relationship -min(6, round((strain-40)/6)); at 60+ each child under 18 loses 2. A home-front crisis at 70+.
  6. Manifest: n = clamp(round(base x F/50), 0, 6) flights (base 5/1/5/4/5 by era). Each rolls `launchRisk` on `g.rng`; a loss names 1 to 3 crew from the roster inside a new Inquiry, mood -18, safety -10. Your flight counts as one of n.
  7. Class intake in class years (every 2/6/3/4/2 years by era): seats = clamp(round(base x F/50), 0, 40), base 10/3/14/10/12; one `ClassRec` logged.
  8. Standing += round(.25 x (performance - standing)) + 4 per clean flight + 2 per command - 3 per concern - 2 after two idle years.
  9. Inquiries age one year a tick. At `yearsOpen` 1 the player gets the testimony choice if involved or level 3+; otherwise it closes with safety +4. A cover-up leaks at 20% a year for 3 years (standing -8, mood -8). Unanswered at `yearsOpen` 3 it closes
     as recuse.
  10. Crisis offer with forced choices first (medical board at dose >= 85 or bone < 55, then testimony), one report-card notice when something moved ('Funding 58, down 6. Mood 41. Safety 63. Bone 91, strain 34.'). Admin years (level 6-7): no flights, one
      push-or-safety choice a year through `career.astronaut.admin`.
- **Levers.**
  - `astro.academy` (id kept): closed before 1959 with the reason shown. Two-year cadet job and four drills stay. Graduation runs the board per open agency (academy cohort: seats x0.6, 3 finalists a seat) and lists only agencies you cleared.
    `astro.apply.<agency>` is enabled only in a class year with access, one try a year; its subtitle reads 'Class 2029, 14 seats, 62 finalists, cut about 64'. `run()` rechecks age 50, health 45, access and class year. A miss keeps Academy status.
  - `astro.mission` (id kept) becomes the Flight Board: up to 4 eligible offers a year (type, days, seat, risk %, edge over a named rival); funding under 20 reads 'No flights are scheduled this year.' Bid (`career.astronaut.board`): two bids a year, the
    second at -3 edge; win when `bidScore` + `randInt(-5,5)` beats the rival's score + seeded(-4..4). A win spends the single `astro.mission` year action; a lost bid spends only the bid; no rival means a sure seat.
  - Plan (`career.astronaut.plan`): tour length (station 90/180/365, 365 needs 2015 and level 3; outpost 28/56/84; others fixed) then regimen for tours over 30 days (light x1.0, standard x0.7, intense x0.45 of bone loss). Bone loss = days/30 x 1.3 x mult
    x (1.25 - fit/200); muscle uses 2.0; dose rate 0.12 a day; strain days/30 x 1.4. Intense adds an injury roll of max(1%, 8% - fit/15) and cuts research 30%. The script refuses when dose + days x rate would pass 100.
  - `astro.train` (2 a year; eva, simulator pilot, centrifuge fit, survival team, +3 to 8 each; one session before a flight drops prep from 1.2 to 1.0). `astro.rehab` (once a year, `c.pay` of `localPrice(g, 6000)`, bone +2.5 and muscle +6 beyond free
    recovery). `astro.lobby` (level 3+ or fame 20+, once a year, lobby +6, +3 if mood under 40, halves yearly, cap 20; a hostile hearing costs standing -3). `astro.concern` (standing -3, safety +3 if under 70, concerns +1; each concern cuts your blame by
    1). `astro.family` (strain 40+: no flights this year, strain -25, happiness +6, standing -3). `astro.research` (three lines, one hot via `hot()` pays x1.5; points round(2 + (smarts-40)/10 + 0..4) x role factor, lifetime cap 200). Corps page (read-only
    child of `spaceLogMenu`) and `astro.public` (lecture, memoir).
- **Rivals and market.** Kit roster `career 'astronaut'`, edges pilot, engineer, scientist, physician; `debutAge [26,40]`, `length [14,26]`; `field` = 0 before 1959 or without access, else era base 4/3/8/6/8; `depth` = clamp(F/50, 0.5, 1.3). Bid rivals
  are the top active rivals whose edge fits the seat.
  - Selection field: `seededCandidates(g, agency, classYear, n)` from `seeded('astro|lifeId|agency|year|i')`, never `g.rng`; score = 34 + 24u1 + 22u2 (mean 57, sd 9.4), +3 when the background matches the class bias (seeded weighted pick by era: race .7
    pilot; shuttle .35/.25/.25/.15; station and later .15/.3/.35/.2 across pilot, engineer, scientist, physician). Player score = 8 + .30 smarts + .18 athleticism + .14 health + .22 readiness + degree (3, STEM 6, MD or doctorate 8) + min(6, 2 x spaceCamp)
    - 5 x convictions, +3 on bias, plus `randInt(-6,6)` in actions only. Finalists = seats x 4 + 6 (14 seats, 62 finalists, about 23% pass); a smarts-65 graduate clears about 45%, smarts 90 about 95%.
  - Crew roles: commander level 4+, pilot level 2+ and pilot skill 50+, specialist level 1+; seats hop 1, orbit 2, orbiter 6, station 3, lunar 3, deep 4, mars 6, own 3. One crewmate becomes a coworker through `addColleague` (3 living contacts at most).
    Private market: Rocketeer pays x1.35 at launch risk x2.2, runs a class every year from 2008 (`privateSpace`), funded from 40 + 2 x (year - 2008), cap 90, scaled by mood; commercial crew seats from 2020.
- **Era and country.** Era key: race 1957-75, lull 1976-80, shuttle 1981-99, station 2000-19, commercial 2020+. The Academy opens 1959, crewed flights 1961.
  - Access: own launchers us and ru from 1961, cn from 2003; any country in `SPACE_AGENCIES` as partner from 1983; consortium `sfa` from 1983; rocketeer needs `hasTech privateSpace` (crewed seats 2020). Others read 'No agency here flies crews yet.' Agency
    names by year: us 1958, fr 1961, in 1969, ESA 1975, it 1988, ca 1989, ru 1992, cn 1993, jp 2003, gb 2010, ae 2014, kr 2024; earlier or unlisted reads 'National Space Program'. When unsure, leave a country out.
  - Mission windows: hop 1961-75 (us, ru) and 2021+; orbit 1961+; orbiter 1981-2011; satellite 1981+; station outpost 1973-99, expedition 2000+; moon 1969-72 (us) and 2031+; deep 2030+; mars 2041+ with F >= 60 or `marsFunding`; own 2020+. Dates follow
    `events-future.ts`; no real vehicle, crew or mission is named; no text before 1969 says 'moon landing'.
  - Launch risk base: hop .004, orbit .007, orbiter .008, station .008 x (1 + days/720), lunar .014, deep .012, mars .020, own .010; era multiplier 2.0/1.2/1.5/0.9/1.0; fatal share 0.6 of a loss, so player death stays near 0.4% a flight. Mood shocks
    (year, scope, delta): 1957 world +8; 1961 world +8; 1967 us -12; 1969 world +12; 1972 world -6; 1981 world +6; 1986 us -16 and world -4; 2000 world +4; 2003 us -10 and cn +8; 2031 world +8; 2041 world +12. Politics link, read only:
    `policyOf(...).national.budget.space` (0.5-2); a politician who sets the line moves F next tick; `marsFunding` adds +8 to F.
- **Events** (crisis defs unless noted; weights are the digest conditions):
  - Selection board (graduation or class year): a notice, no choice: 'You placed 9th of 62. The class took 14.' A pass hires you with a `ClassRec` and 3 named mates; a miss keeps you eligible.
  - Schedule squeeze (safety < 50, F < 45): Sign off (standing +3, next flight risk x1.3), File a concern (standing -3, safety +4), Refuse (standing -6, safety +6).
  - Appropriations hearing (F < 50 or the line cut in 2 years; level 2+): Testify (lobby +6, standing -3 if mood < 40), Brief reporters (mood +4, fame +1), Stay out.
  - Anomaly in orbit (flight over 7 days, 10% x (1.3 - team/100)): Fix it outside (.55 + eva/200, else hull -20 and an abort roll), Wait for ground (+3 days of dose and strain), Abort (half flight pay, mood -2).
  - Crew friction (stay over 90 days, team < 55): Mediate (.5 + team/200: team +3, else standing -3), Split shifts (research -20%), Say nothing (team -4).
  - Bone scan (after a flight, bone < 75): Full rehab (paid, bone +2.5, muscle +6), Standard, Return early (standing +4, 15% stress fracture next flight). Home front (strain 70+ with a partner or child): Take leave (strain -25, no flight, happiness +6),
    Send a video (strain -6), Keep flying (partner relationship -6, -10 more at strain 85+).
  - Lost crew (from a flight loss): Speak at the memorial (fame +1, mood +3) or Stay with the families (standing +2, strain -4).
  - Forced choices take the choice slot before any random crisis: Inquiry testimony (Name the cause: safety +10 if it matches the stored truth, +3 if not, standing -4 when the truth is schedule; Protect the agency: standing +3, safety -6, cover-up;
    Recuse: blame +1 if involved) and Medical board (Accept a ground job; Appeal at .4 + health/200 else grounded; Retire; dose 100 bans flights inside `run()`).
- **Hints** (`honest(g, 'Academics', ...)`): apply rows and the board notice print `classBias(g, agency, year)`, the same value that adds +3 ('This class wants scientists. You read as an engineer.'); the Flight Board marks the largest edge from
  `bidScore()` (the bid's own function; your +-5 and the rival's seeded +-4 stay unseen, so it never promises a win); regimen marks the lowest bone loss plus injury cost from `projectBody()` and shows 'bone 91 after this tour'; research marks the hot
  line; inquiry choices mark the option matching `Inquiry.cause`.
- **Legacy and exits.** Legacy points = 4 x flights + floor(days/30) + 15 x lunar + 25 x mars + 3 x commands + 2 x evas + 6 x firsts - 10 x blame, shown on the Corps page. Retiring at 60+ fires the Hall of Fame notice once (fame +4, one `remember` line).
  Five exits:
  - Administrator: `astro.admin` needs level 3+, age 42+, flights 2+, standing 65+ or a medical ground; levels 6 and 7 of the same job (Deputy 150,000, Administrator 210,000 after 3 years), retire at 68. Yearly: Push for funding (lobby +8, safety -4),
    Fund safety review (safety +8, lobby -3), Hold; a schedule-cause inquiry after a push year gives 55% dismissal and blame +1. No `cv.ts` or `fame.ts` change.
  - Politician: no new job. `astroPoliticsEdge(g)` = min(6, 2 flown + 2 landing + 1 over 180 days + 1 hall) - 3 x blame, added to the poll in `politics.ts` (two lines; droppable, fame already feeds the poll).
  - Commercial: `ownedSpaceCompany(g)` reads `g.assets` raw and guarded for `details.industry 'spaceTech'` with `tech.done` holding `crew`; unlocks `astro.own` from 2020 with `privateSpace` and 1+ flight; risk .010 x clamp((1+booms)/(1+wins), .6, 2.4) x
    (1.5 - tech.safety/100); fame +3, no pay, no writes, hidden on a shape mismatch.
  - Speaker: `astro.lecture`, 3 a year, fee = round(clamp(600 + fame x 160, 800, 30000) x wealth), strain +2, fame +1, mood +1. Author: `astro.memoir` every 8 years, max 3, advance A = round(clamp(20000 + 15000 x flights + 4000 x fame, 20000, 600000) x
    wealth), tail .4A, .24A, .14A over three yearly hooks (1.78A), each guarded by its last-paid marker.
- **Money.** In: flight pay min(0.4 x salary, salary x dest.bonus x (0.8 to 1.3) + 0.0006 x salary x days), lectures, memoir; all `c.earn`, taxed. Out: only the full rehab. Wealth factor clamp(country.wealth, 0.3, 1.2) on new fees. F and mood are ratings,
  never converted to money. Nothing pays after death; an heir inherits no tail, hall or standing.
- **Caps.** 3 lectures a year, 3 memoirs a life, flight pay 40% of salary, peers via the roster (24 active), 6 classes, 12 flights, 4 inquiries. **Cut:** new minigames or screens (asteroid steering stays, plus pilot/400 on sensor reliability), peer
  Persons, language skill, analog missions, multi-flight years, real vehicles or crews, author-career links, writes to business, nation, economy or history. Drop first if short: memoir, Corps page, admin dismissal, the 365-day tour.

## 7. Model 2.0 (`model-state`, `-data`, `-core`, `-board`, `-agency`, `-events`, `-exit`, `-sim`)

- **State.** `special.model.sim`, an optional, owner-stamped, versioned record (v1, start 20). Base `standing` = score = 0.35 lookValue + 0.30 book + 0.20 buzz + 0.15 rep (rivals scored the same way); `rows` replaces the reports; `memory` holds rival
  grudges. The contract stays in `Job.data.contract` (dies with the job), validated by `appointmentId` like `workplace/state.ts`. `extra`:
  ```ts
  { focus: 'runway'|'editorial'|'commercial'; focusYear: number; restYear: number; planYear: number
    book: number; buzz: number; rep: number; strain: number; mood: number           // 0-100
    mother: { agency: string; booker: string; since: number; overrideUntil: number } | null
    floor: number                                                                   // retainer the legacy hook pays next tick
    board: { year: number; items: MdOffer[] }                                       // 8 offers
    windows: MdWindow[]; photographers: string[]; agencies: { name; from; to }[]     // 8 each
    ledger: MdRow[]                                                                 // 24
    life: { gross; net; agency; mother; recoup; booked; faces; shows; peak; peakYear: number }
    proteges: MdProtege[]; exit: '' | 'photographer' | 'label' | 'agent'; likeness: number; announced: string[] }
  ```
  `MdOffer` = id, kind (catalogue, commercial, digital, editorial, cover, runway, couture, campaign, face), season (couture, aw, ss, year), circuit, brand, house, fee, days, minLook, minTitle, abroad, window, rivals (ids), status (open, booked, lost,
  passed, paid), `terms {agency, commission, mother}` snapshotted at cast. `MdContract` = appointmentId, agency, tier, commission, guarantee, exclusive, since, until, advance, unrecouped, bookerId, bookerName. `MdRow` = year, src, gross, agency, mother,
  recoup, net.
- **Migration.** `migrate[0]`: book = round(headshot x 0.35 + min(30, gigs x 1.5)) from `special.model`; rep 50, strain 10, mood 60; focus runway if age <= 25 and looks >= 70 else editorial; mother = `job.company`. The first `mut` builds the contract from
  the Job (tier from `data.tier` or the `AGENCIES` row, guarantee true, commission base+3, until = year + 2) and sets `floor = job.salary`. `special.model` keeps owning headshot, couture and `rejectedBy`.
- **Yearly sim** (after the legacy hook, which keeps `maybeScouted` first with its draw order, the retainer, performance, the looks-bar drop, promotion at the 1.0 odds, and Fashion Week). Zero edits to `yearlyModel`; `bookingScript`, `BOOKINGS` and the
  Fashion Week script stay registered, and the old promotion odds stand (the digest's book gate and Show invitation are cut). Steps:
  1. Marker first; with no job, only booked rows settle (`live` false). Refresh: market = clamp(0.6 x consumer.demand + 0.4 x leisure.demand, 0.6, 1.4) from `economyOf`; luxury and ultra fees lose 4% per `luxuryLevel` step; `eraOf` wwi and wwii close
     abroad circuits and cut the board by 2.
  2. Settle: read booked rows (days, trips, wins), flip each to `paid`, then split: agency = round(fee x c%), mother = round(fee x m%), recoup = min(unrecouped, rest), net the remainder, so gross = agency + mother + recoup + net exactly (a 20,000 fee at
     25% agency, 5% mother, 2,000 unrecouped leaves 12,000). Paid through `payOut` with a ledger row.
  3. **Retainer offset** (replaces the digest's top-up, because `yearlyModel` is unchanged and already paid `job.salary`): under a Guarantee contract the sim pays only net above `s.floor`, the retainer the legacy hook just paid, so total = max(floor, net
     fees). `s.floor` is rewritten at the end of each settle to the salary the next legacy tick will pay (0 once the job is gone or commission-only). Commission-only sets `job.salary` to 0 (reset each settle, since the legacy promotion rewrites it) and
     offsets nothing. A legacy job with salary 10,000 and no bookings still gets exactly 10,000.
  4. Strain: strain' = clamp100(0.5 strain + 1.2 days + 6 trips - 10 - rest); rest is 30 if `restYear == year-1`, plus 15 if `planYear == year-1`. Above 75 costs 2 health a year. `strainRisk` = 0.02 + 0.006 x max(0, strain-55), cap 0.29, is the injury
     weight.
  5. Look: base = 0.6 looks + 0.15 headshot x fresh + 0.15 skill + 10 (fresh 1 within 3 years of `headshotAge`, else 0.8); lookValue = base x shelf x (1 - 0.006 x max(0, strain-60)). A New Face (looks 60, headshot 40, skill 20) has base 55. Shelf by
     focus: prime ends at 24 runway, 30 editorial, 36 commercial (+2 with Modeling); after it 1 - decay x years, decay 0.07/0.05/0.035, floors 0.25/0.35/0.45, +0.05 from 1990, +0.10 from 2010; before prime 0.75 at 16, +0.05 a year.
  6. Book: each win adds (100-book) x min(0.5, points/100) at once; yearly x0.93. points = kind points x tier prestige (1.5/2.5/4/6/8) x focus mult (a luxury campaign is 1.2 x 6 = 7.2); four a year settle near 79. Buzz' = 0.7 buzz + 8 x min(3, wins) +
     0.15 fame + min(12, 3 log10(1 + followers/1000)); rep +2 per paid booking, -8 per cancelled injury job; mood' = 0.8 mood + 12 + 0.25 (performance - 50) - 10 x cancels - 8 when strain > 75.
  7. Ranking and report: standing = score; ranking = `standingOf().rank` + round(40 x clamp((70-score)/60, 0, 1)^1.5), above 50 reads 'outside the top 50'; rank 1 is Model of the Year (fame +5, once a year). One `YearRow` and a log line such as 'Ranking
     14, up 3. Kept $158K.'
  8. Contract: at `contract.until`, mood < 35 or lookValue < 28 drops you (`leave 'fired'`, 'Dropped' notice, `careerHistory`), else the renewal choice takes the year's choice slot. Then a crisis offer unless the slot is used, then `buildBoard` for the
     new year from `seeded` and `streamBrand` (never `g.rng`), then exit unlocks and protege income.
- **Levers.** `model.board` replaces the `model.book` row (`model.cast.<id>`): up to 3 + floor(title/2) castings a year (+1 commercial, -2 after a rest season; a lost casting still uses one). Season day caps: couture 8, autumn shows 12, spring shows 12,
  year-round 24; `castBlock` refuses an overflow; days feed strain at 1.2.
  - Direction (`model.focus`): runway, editorial or commercial; one change a year, free the first time, then book -3 and buzz x0.8. Runway: book x1.3 on shows, light work fees x0.8. Commercial: fees x1.25, book x0.6, +1 slot.
  - Contract menu `model.contract` (commission, floor, term, exclusivity, advance, mother override). Signing offers Guarantee (floor = retainer x title multiplier, exclusive, commission base+3) or Commission-only (no floor, non-exclusive, base). Base
    18/20/20/22 by tier; reputation trims up to 3; range 12-30. Terms run 2 years at tier 0, 3 at tiers 1-2, 4 at tier 3. Under 23 with book < 30 adds an advance of 3,000 x (tier+1), booked as income, recouped from later nets, written off at the end with
    no debt.
  - Renewal (`career.model.renewal`): renew as is, push (odds logistic((rep + book - 90)/20) clamped .10 to .85; a win trims commission 3, a miss costs 10 mood) or walk.
  - Switch agency (`model.switch`): needs the new agency's looks, headshot and book gates; release fee max(2,000, half of last year's commission) by `c.pay`, free once `until` has passed, mid-term exit costs 10 reputation; done as leave plus hire so
    `appointmentId` changes. Rest (`model.rest`): a rest season (strain -30, slots -2, buzz -6) and a recovery plan (`c.pay` 1,500 x `priceLevel`, strain -15, health +2), each once a year; copy is abstract workload only, no body, weight or diet words.
    Portfolio Shoot (`model.shoot`): once a year, `PHOTOGRAPHERS` at 150, 1,200, 7,500 for 2, 5 or 9 book points, recording a named fictional photographer (8 at most).
  - Kept ids: `model.agency` (needs headshots), `model.headshot`, `model.practice`, `model.freelance` (blocked by an exclusive contract inside `run()`, +1 book point), `model.sabotage` (targets one of the three nearest rivals above you: that rival leaves
    this year's shortlists via a cool key; caught chance 0.25 + 0.10 per past attempt + 0.10 per grudge; caught: fired 50% as before, else mood -25, rep -15, fame -2; karma -8 stays), `model.quit` (now Retire).
- **Rivals and market.** Kit roster `career 'model'`, edges = the three focuses, `debutAge [16,22]`, `length [8,20]`, `field` 0 before 1925, else 12 (kit cap 40); the digest's stored `MdRival` rows are dropped.
  - Each offer shortlists two active rivals of its niche. `castPlan`: fit = clamp100(50 + 0.8 x (standing - req) + 6 niche + 4 home brand + up to 8 digital followers + 6 talent), req 15/28/42/58/72 by brand tier; odds = clamp(logistic((fit - mean rival
    fit - 4)/12), 0.05, 0.92). Reactions: a lost casting gives the winner `remember` won +1 and you lost +1; a win gives shortlisted rivals grudge +1 (max 3); grudge fades 1 a year (kit `cool`); at 2 or more it can trigger the rumor event.
  - Social: `totalFollowers(g)` is read only; it adds buzz, unlocks `digital` offers from 20,000 followers once `socialMedia` exists, and raises press-storm odds from 500,000. Nothing writes `social.ts` or `fame.ts`.
- **Era and country.**
  - Circuits (approximate first formal week): Paris couture 1900, New York 1943, Milan 1958, Paris ready-to-wear 1966, London 1984, Tokyo 1985, Sao Paulo 1996, Berlin 2007; home circuit by country: fr, us, it, gb, jp, br, de; others travel. Abroad runway
    or couture costs 1,800 (`c.pay`, refused if short), +6 strain, full international fees; home-circuit fees x1.10; local work scales by `priceLevel(g)`.
  - Kinds by year: catalogue 1900, editorial and cover 1920, campaign 1930, commercial with `hasTech tv`, face 1970, digital with `hasTech socialMedia` and followers >= 20,000; catalogue reads 'e-commerce shoot' once `onlineShopping` exists. Agencies are
    four fictional tiers from 1925, keyed by the legacy agency names that `Job.company` holds: Hometown Faces 1925, Silhouette Models 1925 (book 12), Prestige Model Management 1946 (book 30), Icon Elite 1960 (book 50); before 1925 only freelance gigs run and `maybeScouted` waits.
  - Brands come only from `streamBrand` over `brandPool` (fashion, handbag, jewelry, watch, eyewear, cosmetics, sneakers, sportswear, clothing-retail, department-store, shampoo), so `brandAvailable`, embargo and ended years hold; an empty pool falls back
    to fictional DESIGNERS or magazines. Failures name a rival or 'the client', never a real house. Likeness licensing only from 2023 via `hasTech aiAssistants`.
- **Events** (crisis defs, weights from the digest probabilities; renewal is the forced choice):
  - Rival agency approach (p .25 when a higher tier's gates are met, mood < 80): Switch (pays the release fee, 5% mother override), Stay (commission -2, mood +6), Play them off (55%: commission -2, floor +10%; a miss mood -10).
  - Window conflict (same-category offer inside an exclusivity window): Honor it (rep +3) or Take it (fee paid, rep -10, mood -10, window voided, 3,000 settlement); copy blames 'the first client'.
  - Injury on set (weight strainRisk): Work through it (health -6, strain +10, rep +1) or Cancel the job (smallest booked fee forfeited, health -1, strain -15, rep -3).
  - Photographer test shoot (book >= 20, .30): Pay the day rate 1,500 (book +5) or Trade for prints (book +2); either records a photographer. Rival rumor (grudge >= 2, rep < 60, .30): Ignore (buzz -4), Confront (50%: retracts and grudge resets, else rep
    -5 and fame +2), Leave it to the agent (mood -5).
  - Younger faces (age >= 27, runway, shelf < 0.85): Move to editorial or Move to commercial (focus changes once, no book penalty), Stay on runway (strain +6, one fewer slot). Likeness licence (once a life, 2023+ with `aiAssistants`): Full (15% of last
    year's gross, min 5,000, cap 150,000; digital fees x0.95 for three years), Limited (half, no penalty), Refuse (mood -5). Press storm (fame >= 30 or followers >= 500,000, .12): Apologize (buzz -8, rep +2), Say nothing (50% passes, else buzz -15, fame
    -3), Lawyer (4,000, 70% quiet).
- **Hints** (`honest(g, 'Modeling', ...)`): board rows 'Odds about 55%: your fit 64 against two rivals near 58.' from `castPlan`, the function the roll uses, rounded to 5%; agency rows keep `bestAgency()` (same predicate as the apply gate); rest 'Injury
  risk this year at your workload: about 14%.' from `strainRisk` (shown above strain 40); direction 'Your runway look stays in its prime for 3 more years.' (nothing past prime); renewal Push 'About 55% the agent gives ground.'; exits 'A label starts at
  brand 31 of 60.' from `labelHeadStart(g)` = round(clamp(15 + fame/4, 0, 60)), pinned by a test to `newBiz(...).brand`. No forecast of fees or ranking.
- **Legacy and exits.** Retire: `leave 'retired'` with one notice (bookings, faces, shows, peak ranking and year, gross, kept) and a `remember` line; the profile is owner-stamped, so an heir starts clean and nothing becomes an Asset. `model.exits` appears
  once a threshold passes or after retiring; unlocks fire once and log in `announced`.
  - Photographer (`model.exit.photo`): 3 collaborators, book >= 50, age >= 22, and `getJobDef('photographer')` passing `jobRequirementProblem`; `hireForJob` at the Photographer rung. Label (`model.exit.label`): fame >= 30, book >= 50, 10 bookings; `run()`
    calls `foundingProblem(g, 'fashion')` then `startFounding(g, 'fashion')` (existing trade, no business file touched). Agent desk (`model.exit.agent`): rep >= 55, age >= 28 or retired, 10 bookings; `c.pay` 6,000 x `priceLevel` once; a scouting trip a
    year (`c.pay` 1,200) signs a seeded newcomer, at most 2 proteges, 8 years each.
  - Protege income: 10% of 40,000 x `RANK_MULT[tier+1]` x (0.5 + standing/100), at most 25,000 each, `c.earn` with the protege named as source; a protege past book 60 in year 3 leaves at .25 and pays one finder's fee.
- **Money.** Every cash flow goes through `payOut(c, src, amount, parts)`: `c.earn`, one `MdRow` (24 kept), `life` totals. A static source scan test fails any `earnIncome`, `spend` or `addMoney` call in `model*.ts`, `actor*.ts`, `astronaut*.ts` outside
  the kit (as `currency-static.test.ts` scans hand-formatted money). Sources: client fees (registry brand or 'Client'), fees above the retainer, freelance gigs, likeness licence, protege override. Sinks: travel, shoots, recovery, release fee, desk,
  settlement. Booked fees pay only at the yearly settle, flipped to `paid` first; terms are snapshotted at cast, so a switch cannot backdate commission; a failed `c.pay` refunds its `useYearAction` slot as in 1.0.
- **Caps.** Offer fee 2,000,000; paid gross 6,000,000 a year; protege override 25,000 each; likeness 150,000; board 8, ledger 24, photographers 8, agencies 8. **Cut:** campaign pieces as Assets and image-rights estates, visas, month-by-month calendars,
  anything about bodies or diets, more agencies, agency finances, rival careers beyond the roster, crossovers to acting or influencer, heirs inheriting agencies. Drop first if short: events 6 to 9 and the agent desk.

## 8. Determinism, saves, voice

- **Determinism.** Rivals, candidates, boards, listings and crisis data come from `seeded`, `stableRng` and the family seed, never `g.rng`; `g.rng` is drawn only in actions and settle bodies, after `claimSettle`. Each generated list (board, candidates,
  crisis data) is written once, so a reload never regenerates it. A Time Machine jump rerolls a year's hidden form (`outcomeTag`) and never the cast. Lives without a career are byte-identical (the hook is a no-op without a job or record); lives with one
  roll a different downstream sequence.
- **Saves.** `SAVE_SCHEMA` stays 2 and no `STEPS` entry is added: every record is an optional flag normalized by its reader, absent in every old save including `test/fixtures/save-v1.json.gz`. Readers never throw and keep every number finite and bounded.
  Records are owner-stamped (`ownerKey` v2, the legacy name key still matches), so heirs start empty. Legacy flags are never written. Each record stays under 6,000 JSON nodes and 40 KB after 40 simulated years (tested). Store keys are only `<id>.sim`:
  pointing a store at a legacy key would delete legacy fields when `mut` prunes stale keys.
- **Voice** (`docs/VOICE.md`). Log lines 90, outcomes 120, scenes 140 ending "What will you do?", tooltips 120, digests 110, choice labels 5 words, imperative. Contractions, no `Nobody` or `Everyone` openers, no disclaimers, no em-dash (zero new literals;
  the guard caps all of `src` at 24). Hints say "about NN%", never "will". Real brand names appear only in neutral or positive lines; fictional rivals carry no brand, biography or real affiliation; no real people, vehicles or missions. The only dates
  after 2026 are the astronaut windows `history/events-future.ts` already carries.

## 9. Pinned legacy behaviour

Must keep passing unchanged:
- `special-common-safety.test.ts:69-73`: a hand-built model job with an unknown company pays exactly 10,000 once and `g.rng` is unchanged on replay (`yearlyModel` is untouched). The garbage-profile test (line 168) must not throw in `yearlySpecial` or
  menus.
- `special.test.ts`: line 103 (nine menu ids, `toContain`), 122 (`actor.audition` disabled with `/18/`), 151 (`model.agency` needs headshots), 377 (a New Face pays at least 15,000 once).
- `talent-perks.test.ts:142,175,202` and `talent-perks-review.test.ts:180,374`: scripts `special.actor.audition`, `special.actor.pick`, `special.music.title`, `special.model.scout` (accept, decline, the two-decline cap, plain lives get no choice), the
  flag `special.list.actor.roles` under the legacy owner key, and raw `special.music` discography reads. Legacy records stay flat; new ids use `career.<id>`.
- `fuzz-regressions.test.ts:183`: `specialJobNodes` renders from frozen states with hand-written legacy job data and no sim record. New rows read `store.view` and tolerate a missing record.
- `hedge-year`, `advisors-year:129`, `dividend-wiring:274` compare the JSON of an aged plain life: the no-op rule holds. `voice-guards` (24 em-dashes), the exhaustive `minigameResult` switches in `fuzz-kit.ts` and `anachronism.test.ts`, `save-schema.ts`
  `MINIGAME_KINDS`: no new `MinigameKind`.
- Script ids kept registered: `special.actor.audition`, `.pick`, `.agent`, `.speech`; `special.model.scout` and the legacy booking, Fashion Week and gift scripts; the seven legacy `special.astro.*` scripts (offer, train, dest, asteroid, spacewalk, words, planet). Menu ids kept: `actor.audition`,
  `actor.practice`, `actor.agent.hire`, `actor.agent.fire`, `actor.stunt`, `astro.academy`, `astro.mission`, `astro.train`, `astro.research`, `model.agency`, `model.headshot`, `model.freelance`, `model.practice`, `model.sabotage`, `model.quit`. Only `model.book` is
  replaced (by `model.board`).

Test rewrites needed (two files, the only ones):
- `test/special.test.ts:260-298` (astronaut block): graduation now yields the board-result notice (not an instant hire; a smarts-100 fixture passes), the fame test uses a `soloCorps` fixture so the bid is uncontested and expects no Moon in 2026, and
  `astro.mission` for a candidate still reads 'not cleared'.
- `test/special-common-safety.test.ts:168`: append `'actor.sim'`, `'astronaut.sim'`, `'model.sim'` to the key list.

## 10. Tests

All new files run through targeted vitest; none uses `createNewLife` or `ageUp` except `playCareer` (kit), to avoid `life.ts` churn from the other track.
- **Kit:** `career-state` (a synthetic 3-step spec migrates every stored shape to one record, idempotent; junk stays finite and under 3,000 nodes; another owner reads fresh; `view` on a `deepFreeze`d state never throws; `claimSettle` false the second
  time), `career-rivals` (same roster for `x` and `x-g2`; a different country differs; `field` 0 gives an empty list; at most 24 active; names unique, not in the brand registry, fit `nameFitsYear`; no `g.rng` or JSON change; `remember` caps at 16),
  `career-year` (no job and no record leaves JSON and `g.rng` identical; twice in one (year, age) pays once; prison skips; budget 1 choice and 2 notices; `earn` rejects NaN, negatives, empty source), `career-crisis` (ids, 2 to 3 stances, replay and
  wrong-owner no-ops, hint only with the talent and on `bestStance`, `assertHonestOdds` at n = 1500 with fixed seeds and tolerance 0.045, every branch passes `voiceProblems`), `careers-balance`, opt-in `fuzz-careers`.
- **Actor** (`actor-state`, `-world`, `-pipeline`, `-team`, `-legacy`, `-events`): migration leaves `view` JSON byte-identical and `mut` writes v1 once with the legacy flag untouched; pool identical across calls, saves and heirs, 10 to 25 active, heat
  1946 hollywood 1.2, 2020 0.5, nollywood 0 before 1992; film plus series together, two films blocked, exclusivity blocks inside `pickRoleScript` with the menu bypassed; gross and popularity at q 55, 70, 85 (a q70 studio film near breakEven, q85 at 1.3 to
  1.5x); back-end only above breakEven; two yearly calls equal; money delta equals net; trust folds residuals with no double pay; sale adds exactly 70% of value; an heir keeps and collects (as `gameplay-creative-society.test.ts` does for masters); no 1960
  streaming role.
- **Astronaut** (`astronaut-world`, `-class`, `-flight`, `-events`, `-exits`): era and access table (1950 closed; 1962 hop and orbit for us and ru; 1970 moon us only; 1978 nothing; 1985 orbiter; 2005 station; 2024 own and hop; 2035 moon; 2045 mars);
  agency names not before `AGENCY_FROM`; `fundingIndex` at line 0.5, 1, 2 by hand; reading leaves `nation.policy` and `g.rng`; seeded candidates stable; smarts-95 passes and smarts-45 fails over 30 seeds; 180 days standard at fit 70 gives bone -4.9,
  muscle -7.6, dose +21.6, strain +8.4; 300 seeded station flights give 0.2 to 1.0% player deaths; one accident opens one inquiry; two yearly calls pay once; over 10 yearly cycles the money delta equals salary + flight pay + fees; stale modals rejected;
  admin refused by direct `run()` below its gates, then paid 150,000 and 210,000; memoir total 1.78A with the 8-year cooldown; `ownedSpaceCompany` leaves a fixture asset deep-equal; heirs read an empty record.
- **Model** (`model-state`, `-math`, `-year`, `-flow`, `-voice`): state survives null, arrays, NaN and 500 rows with caps held; shelf table by focus, age, talent, 1990, 2010; `settleFee` conserves over 500 random inputs; commission stays 12 to 30; odds
  0.05 to 0.92; the retainer offset leaves total = max(floor, net) and a legacy job still gets exactly its salary; 1935 has no commercial or digital offers, 1950 US home circuit New York, 1999 JP Tokyo, no agencies before 1925, every brand passes
  `brandAvailable`, market factor 0.6 to 1.4 over 1930 to 2025; `castOffer` refuses prison, age < 16, strain >= 95, unsigned couture, an exclusivity conflict and season overflow with no state change; the sign, renew, switch chain; exits gated and logged
  once; `labelHeadStart` equals `newBiz(...).brand`; every event, notice and log passes the voice rules and no registry brand is named negatively.
- **Everywhere:** double menu render leaves JSON and `g.rng` unchanged; `SAVE_SCHEMA` is 2; `ANACHRONISM_LIVES=60` on `anachronism.test.ts`; the static money scan; `docs/ARCHITECTURE.md` gets one section (state keys, caps, the legacy guards).

## 11. Risks and mitigations

- **Scope.** The digests total about 5,700 source and 2,500 test lines, estimated before the kit absorbed their shared code, so the real figure should be lower. Cut ladders: kit (standingMenu body, then the registry, then rival memory; keep state,
  `settleYear`, `gatedAction`, crisis); actor (events 11 to 6, then press retainer, rival grudges, studio retainer); astronaut and model as listed in their Caps lines.
- **Legacy guards.** `yearlyActor`'s top guard and the three astronaut edits are the only legacy-hook changes. Mitigation: a JSON-equality test on a no-record life for each (as `hedge-year` does) and the pinned tests above.
- **RNG order.** Lives with a career roll a different downstream sequence, so a test asserting exact seeded outcomes after `ageUp` on a career life may need new expectations or find a popup in the queue; tests call `yearlySpecial` through a single
  `nextYear` helper and fixed seeds (`stableRng` keys on lifeId, age and year, so year-only bumps change boards).
- **Money truthfulness.** `YearRow.income` is the kit ledger only and legacy pay bypasses it, so cards show `incomeLabel` ('Bookings', 'Residuals', 'Stipend') and never imply total earnings. The two capital moves are taxed as income (rule 6); the static
  scan stops stray payments.
- **Balance.** The hint-honesty statistical test flakes about 0.1% unless seeds are fixed, so they are. Actor gross constants are tuned by hand; the three-point test (q 55, 70, 85) makes later tuning deliberate. Astronaut F saturates at 100 once the space
  line passes about 1.5, and peer accidents (about 5% of years) may read harsh; player death is held near 0.4% a flight by the 300-seed test. Model income shifts if the retainer floor is tuned; a seeded check brackets lifetime net. Every number sits in
  the career's `-data.ts` for one-file tuning. A smarts-65 graduate clears the board about 45%, so check the Academy path with real stats.
- **Cross-track drift.** `ownedSpaceCompany` depends on `details.industry` and `tech.done` while another track edits `deeptech-*.ts`: read raw JSON with guards, import nothing from `business/`, pin the shape with a fixture, hide the exit on a mismatch.
  `labelHeadStart` is pinned to `newBiz`. `menus.ts` (one chained `??`) and `politics.ts` (two lines) may collide; the poll edge is droppable.
- **Import cycle.** `careers.ts` imports `special.ts`, so `model-exit` may use `hireForJob`, `eraPayShape` and `companyName` only inside `run()` bodies; on a TDZ error fall back to `hire(g, {category: 'fulltime'})` and lose only boss and coworker
  staffing.
- **Names and dates.** Rival names may coincide with a real person by chance (initial plus surname, no biography); a deny list can go in `*-data.ts` if review finds a hit. Circuit, award and agency years are approximate and labelled so; when unsure a
  country or year is left out.
- **Migration chain.** Only the synthetic spec exercises more than one step until the first real v2, so that test stays and every `migrate` step stays pure.

## 12. Build order

Each step ends with typecheck plus the named targeted tests; nothing runs the full suite. Steps 3 to 5 depend only on steps 1 and 2, so they may run in any order, one at a time (the plan numbers actor, astronaut, model); model first is the safer order, as it proves the kit on the smallest legacy overlap.
1. **Kit state and rivals:** `kit/state.ts`, `kit/rivals.ts`, `test/career-state.test.ts`, `test/career-rivals.test.ts`.
2. **Kit year, crisis, menu, registry, wiring:** `kit/year.ts`, `kit/crisis.ts`, `kit/menu.ts`, `kit/careers.ts`, the two `special.ts` lines, `test/career-kit.ts`, `career-year`, `career-crisis`.
3. **Model** (smallest legacy overlap, proves the kit): state and math with tests, board, agency and contract, events, exits; `special.test.ts` model cases, `special-common-safety`, `talent-perks` stay green; `careers-balance` gains model.
4. **Actor:** data and state with migration, world, pipeline and the `yearlyActor` guard, team, events, legacy and the `menus.ts` line; `talent-perks`, `special.test.ts` actor cases, `gameplay-creative-society`.
5. **Astronaut:** data, state, world, class and board, flight, events, exits, the three legacy edits and the `politics.ts` lines; rewrite the `special.test.ts` astronaut block; `ANACHRONISM_LIVES=60`.
6. **Close:** the `special-common-safety` key list, the `docs/ARCHITECTURE.md` section, `careers-balance` with all three careers, and one opt-in `FUZZ=1 fuzz-careers` run.
