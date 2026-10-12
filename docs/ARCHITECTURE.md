# AnotherLife — architecture & module contract

AnotherLife is a browser life simulator that mirrors BitLife's gameplay (stat bars, yearly
"+ Age" loop, Occupation / Assets / Relationships / Activities menus, popups with choices,
crime & prison, ribbons, generations) with an original name and emoji art. Everything is built
in and runs in the player's browser: the year-by-year story comes from the event library
(`events.ts` + `events/*.ts`), "Do Anything" from a keyword resolver (`events/custom.ts`),
interviews from a scored question pool, application screening from the CV model (`cv.ts`) and
the obituary from the life that was lived. There is no AI narrator, no backend and no network call.

Stack: Vite + React 19 + TypeScript (strict), Vitest. No other runtime deps.

Hosting: a static site on the Cloudflare Worker `snag` (Workers Builds deploys every push to its
production branch; `wrangler.jsonc` runs `npm run build` and serves `dist/`).

The app opens on the main menu (no setup step). Old installs: `settings.ts` drops every setting
it doesn't know (the old AI provider, URLs, API keys, models) and rewrites the stored copy on the
first start, and `save.ts` `migrateLegacyAi` cleans saves from the AI-narrator days.

## Layout

```
src/
  settings.ts            Settings (money display, prices, Time Machine sandbox) in localStorage          [foundation]
  game/                  Pure TypeScript engine — no React, no fetch
    types.ts             ALL shared types (GameState, Character, Person, Job, Asset, ModalItem, MenuNode...) [foundation]
    rng.ts               Seeded RNG: rand, randInt, chance, pick, weightedPick, shuffle, bell, uid    [foundation]
    core.ts              Helpers: addStat, addMoney, spend, log, notice, scriptChoice, minigame,
                         queueAi (built-in tasks), endJob, people lookups, relationLabel, formatMoney... [foundation]
    scripts.ts           defineScript / runScript registry for choice/input/minigame modals          [foundation]
    people.ts            createPerson(g, opts), TRAITS, notePerson                                    [foundation]
    world.ts             Countries, cities, name pools                                                [world agent]
    effects.ts           applyEffects(g, GameEffects) with caps (scripted outcomes, Do Anything)      [foundation]
    death.ts             killCharacter(g, cause)                                                       [foundation]
    aging.ts             ageUp(g): runs yearly hooks in order, then queues the yearEvents task        [foundation]
    offline.ts           applyFallback / resolveTask: resolves every queued task offline (see "Built-in tasks") [foundation]
    menus.ts             Top-level Activities menu assembly                                           [foundation]
    save.ts              localStorage saves (+ migrateLegacyAi for old saves), ribbon collection, graveyard,
                         separate Time Machine snapshots                                              [foundation]
    life.ts health.ts ribbons.ts                                          [life agent]
    education.ts careers.ts data/jobs.ts                                  [career agent]
    special.ts                                                            [special-careers agent]
    relationships.ts love.ts                                              [relationships agent]
    finance.ts assets.ts gambling.ts                                      [money agent]
    crime.ts prison.ts                                                    [crime agent]
    activities.ts                                                         [activities agent]
    events.ts (+ events/*.ts if split)                                    [events agent]
    data/markets.ts      Per-country economy (taxes, wages, rents, rates, red tape, corruption, exchange,
                         industry demand, local prices); data in data/markets/<region>.ts
    talents.ts           Special talents picked before birth (New Life › Special Talents, max 3) plus the
                         one discovered in childhood. ALWAYS test with hasTalent(g, id) (never
                         c.talent). Helpers: characterTalents, pickedTalents, normalizeTalents,
                         talentMult, talentHint (purple 🔮 hint text), talentEmoji.
                         Purple hints reach the UI through ChoiceOption.hint, MenuBase.hint and
                         AnnualReportData.talentHint; hints must be honest (computed from the same
                         math the resolver uses, never consuming g's RNG in menus) and never make
                         anything risk-free. life.ts owns discovery (flags talentsRevealed,
                         talentNoticeAge: one talent popup a year) and heirs (40% inherit a pick).
                         Hidden per-year trends that hints reveal use special/common.ts
                         stableRoll/stableChoice; activities/creative.ts is Mind & Body › Creative
                         Arts (craftSkill writing/art/cooking/comedy in g.flags 'skill.<id>')
    data/locales.ts      Per-country culture (school naming, exams, emergency number, holidays, food,
                         sports, transport, snow, landmarks...); data in data/locales/<region>.ts.
                         Player-facing text must use localPick/fillLocal/localTerm, never US defaults
    business.ts business/*.ts   Start/buy/run companies in 51 industries; yearly sim + Annual Report.
                         Actions that spend/earn company cash move b.cash AND add to yearCosts/
                         yearIncome (for the P&L); simulateYear must not move that cash twice.
                         Owner payouts are capped at cash beyond company debt (no loan-then-bankrupt).
                         Investors hold a 1x liquidation preference (BizState.pref, exit.ownerProceeds):
                         on a sale/closure they're paid back first; it converts at an IPO.
                         Business talent: economy.bestPlan/bookYear (pure, no RNG) drive the Annual
                         Report talentHint; bizWorth/fxValue/markBest value event outcomes so hints
                         match the resolvers; price promises (util.priceCapOf) cap price until booked.
                         ownerTalent(g, b, id): Cooking (+food quality), Leadership (+morale) perks
    business/deeptech*.ts  8 deep-tech industries (DEEP_TECH_IDS): state in Asset.details.tech
                         (deeptech-state readTech/TECH_VERSION — bump it when TechState gains fields);
                         data, core, rd, funding, sim, events, menu, manager, found modules. Investor and
                         grant money sits in TechState.venture (the R&D account), never in b.cash; the
                         valuation nets out investors' 1x preference itself (so BizState.pref stays 0 for
                         deep tech); deepTechValue may be negative (cancels one-off windfalls); grants
                         count as income only up to the year's R&D spend and are repaid on cancellation.
                         invest/engine lists deep-tech companies as extra slots after each hub exchange's
                         classic plan (classicSlots()). Missing deep-tech demand defaults by income
    business/rd.ts products.ts  Product R&D with no yearly cap (BizState.rd projects, endless era-gated
                         ideas) and the product range economics (see "Business growth" below)
    business/board*.ts   Boards, mandates, votes and smart hired CEOs (BizState.board; see below)
    business/conglomerate*.ts  Groups of the player's companies (BizState.group copies; see below)
    events/wealth*.ts    Being rich: money requests from kids, family and friends, allowances, loans,
                         the "Money Matters" person section (see "Being rich, felt" below)
    assetHooks.ts        businessGone(g, a): low-level code that removes a company (seizure,
                         repossession, divorce) notifies the business modules without importing them
    invest/instinct.ts   Investing talent: marketInstinct(g), an honest ~80% gut read of next year's
                         deterministic engine moves (per character + year, never rerolls)
    investments.ts invest/*.ts  Stocks, funds, bonds, savings, crypto, gold on the local exchange
    shops.ts shops/*.ts         Everyday stores, memberships/subscriptions, tickets, Luxury Lifestyle
    cv.ts                The player's CV (Character.cv explicit entries + entries derived from state),
                         cvScore for admissions/jobs, national school rankings, the job market, and
                         the "Your CV" menu. Applications go through the 'screenApplication' task
                         (offlineScreen reads the CV + market and decides on an interview).
                         jobFit(g, def) scores how well a job suits the CV; the careers recruiter
                         ("Best Matches" / "Within Reach") sorts openings by it
    computer.ts computer/*.ts   The home computer (needs an owned computer asset): learn to code, side
                         projects, SaaS/app ventures, freelancing (dev-*.ts); crypto pump-and-dumps,
                         options, single-stock options and coin shorts (money-*.ts), online scams
    invest/shocks.ts     Market shocks (g.flags.marketShocks): a company/coin banned or hyped by a
                         head of state; investments and options read the price hit. Kept across heirs
    workshop/*.ts        Inventor's Workshop (Inventor 2.0): catalog, notebook, builds, patents, launch routes,
                         sales, events, menus and the old-save migration
    special/*.ts         Special careers split by section: politics.ts (incl. Abuse of Power:
                         market-moving announcements + insider trades),
                         sports*.ts (Special Careers > Sports: team sports, MMA/UFC, boxing, tennis,
                         golf, racing, esports...), gamedev*.ts (Game Industry: dev jobs, making games,
                         founding a game studio via business/gamestudio*.ts)
                         Sports: athlete.ts is Team Sports; sports-core/-data/-individual/-fight/
                         -sumo/-prowrestling/-esports/-youth/-olympics/-legacy. Job defIds 'athlete',
                         'sports.ind', 'sports.fighter', 'sports.sumo', 'sports.wrestler',
                         'sports.esports', 'sports.coach', 'sports.pundit'; profiles in
                         g.flags['special.sports*']. One pro start / esports signing a year
                         ('sports.ind.start', 'sports.es.sign'); fight cards cached until the next bout.
                         Game Industry: studio job defId 'game_dev'; solo profile g.flags['special.gamedev'].
                         Game studios are 'gameStudio' businesses simulated by simulateStudioYear;
                         advances/pledges for unreleased games are earmarkedCash and can't be paid out.
                         Indie game ventures moved from the Computer menu to Game Industry:
                         computer/dev-state ventureAssets() excludes them, allVentureAssets() doesn't
  ui/
    store.ts             App store + modal-queue game loop (resolves built-in tasks offline)      [foundation]
    components/Sheet.tsx components/StatBar.tsx                                                      [foundation]
    minigames/index.ts minigames/types.ts                                                            [foundation]
    minigames/Blackjack.tsx HorseRace.tsx Slots.tsx                       [money agent]
    minigames/Burglary.tsx PrisonEscape.tsx Pickpocket.tsx                [crime agent]
    everything else in ui/ + main.tsx, App.tsx, styles                    [ui agents]
```

## Golden rules for every module

### Living-world integration

`game/economy/` owns persistent country/industry aggregates, one synchronous annual transition,
lagged feedback from real company settlements and optional economic/credit menus. `household.ts`
owns persistent work/learning/family/recovery priorities. See [LIVING-WORLD.md](LIVING-WORLD.md)
for the assessment, causal model, tests and remaining scope.

The economic boundary runs before the ordinary yearly hooks. Opening cash and nominal debts
use the same inflation; new-year income is not retroactively eroded. Historical denominations
remain authoritative. Future display contexts carry the simulated nominal price scale.

Economy reads are pure and cached by immutable state root. Writers replace that root. Annual
uncertainty uses stable family/year hashes, never menu reads or iteration order. World state
survives heirs; household routines and credit history belong to the individual.

Main saves remain plain JSON. Time Machine snapshots share immutable economic frames and
history years, and use native gzip compression when available. The loader still accepts older
plain records. Quota failures must never prevent saving the current life.

### Engine contracts

1. **State is plain JSON.** `GameState` is saved to localStorage and cloned with `structuredClone`.
   Never store functions, class instances, Maps or Sets in it. Use `g.flags`, `g.counters`,
   `Enrollment.data`, `Job.data`, `Person.data`, `Asset.details` for module-specific data.
2. **All gameplay randomness goes through `rng.ts`** with the `g` argument (`rand(g)`,
   `chance(g, 0.3)`, `randInt(g, 1, 6)`, `pick(g, list)`). Never call `Math.random()` or
   `Date.now()` in `src/game`; the sole exception is `rng.ts` using `Math.random()` to choose the
   initial seed for a brand-new life before deterministic play begins.
3. **Engine code mutates `g` in place.** Menu `run` functions, script handlers and yearly hooks receive
   a mutable draft (the store clones before calling). Do not return new states.
4. **Report outcomes like BitLife does:**
   - `log(g, 'I went to the gym.', tone)` — first-person, past tense, short line in the life feed.
   - `notice(g, title, text, { emoji })` — popup with OK; text is second person ("You went to the gym...").
   - `scriptChoice(g, scriptId, title, text, choices, { data })` — popup with choices, resolved by a
     handler registered with `defineScript(id, handler)` at module load. Script ids are namespaced:
     `'crime.burglary.result'`, `'school.bully'`.
   - `scriptInput(g, {...})` — ask for text/number (e.g. name the baby), result goes to a script.
   - `minigame(g, kind, title, scriptId, data)` — show a minigame; its result string goes to the script.
   - `queueAi(g, task)` — queue a built-in task (year events, interview, screening, obituary...);
     the store resolves it offline the moment it reaches the head of the queue (see "Built-in tasks").
   Anything a handler queues is shown right after the current popup (the store moves it to the front).
5. **Per-year limits**: BitLife stops spam ("You're too tired to go to the gym again this year").
   Use `useYearAction(g, key, max)`; when it returns false show a notice instead.
6. **Stats** use `addStat(g, 'happiness', +5)`, `addHidden(g, 'karma', -10)`; all are clamped 0-100.
   Money: `addMoney`, `spend` (returns false if broke — show "You can't afford that"), `canAfford`.
7. **People** are created with `createPerson(g, { relation, age, ... })` (adds to `g.people`). Use
   `relationLabel(p)`, `fullName(p)`, `pronouns(p.gender)`. Remove people from contacts by filtering
   `g.people` (dead family members stay with `alive: false`).
8. **Menus** are `MenuGroup` / `MenuAction` / `MenuInfo` / `MenuHeading` objects (types.ts). They are
   functions of state, not stored in state. Use `visible` to hide rows that don't apply (age, prison),
   `disabledReason` to grey out with an explanation, `confirm` for costly actions, `input` for amounts/text.
   `children(g)` builds dynamic lists (job listings, houses for sale...).
9. **Imports between feature modules** are limited to the contract functions below, plus the
   foundation files. This keeps parallel work independent and avoids cycles.
10. **Ages**: babies (0-1) can't do activities; most activities unlock at 4-6; dating at 12-13+ (age
    appropriate), jobs at 18 (part-time 14+), driving test at the country's driving age,
    alcohol/nightlife at the drinking age, crime from ~11-14 depending on the crime. Prisoners only
    see prison activities. Dead characters can do nothing.
11. **Money stays in constant 2026 US dollars inside the engine.** Display with `formatMoney` /
    `shortMoney` (`tinyMoney` for narrow tiles) only, at render/action time. The settings select local currency or USD and nominal
    year prices or today's prices. Mark both `MenuInput` and `InputModal` money amounts with
    `money: true`; their bounds/defaults stay internal dollars and the UI converts exactly once.
    Never cache formatted strings at module load. Use `withMoneyContext` for another person's
    year/country (ancestors, graves, time stops); old entries with no country fall back to USD.
12. Keep text tasteful for a teen rating by default: dark humor is fine (BitLife-style), nothing sexually explicit, no slurs.

## Cross-module contract (exact exports)

| File | Exports (must exist with these signatures) |
|------|---------------------------------------------|
| `world.ts` | `COUNTRIES: Country[]`, `NAME_POOLS`, `getCountry(id)`, `randomCountry(g)`, `randomCity(g, country)`, `randomFirstName(g, countryId, gender)`, `randomLastName(g, countryId)`, `randomSkinTone(g, country)` |
| `life.ts` | `interface NewLifeOptions { firstName?; lastName?; gender?: Gender; countryId?; city?; sexuality?: Sexuality; seed?: number; year?: number; stats?: Partial<Stats> }` (stats = "Customize stats" on the New Life screen, keys in `START_STAT_KEYS`, clamped 0-100) (year = calendar year of birth, clamped to HISTORY_START–PRESENT_YEAR; defaults to PRESENT_YEAR), `createNewLife(opts: NewLifeOptions): GameState`, `continueAsChild(g: GameState, childId: string): GameState`, `yearlyMilestones(g): void` |
| `health.ts` | `yearlyHealth(g)`, `checkDeath(g)` (old age / health 0 → `killCharacter`), `doctorMenu: MenuGroup` |
| `ribbons.ts` | `interface RibbonDef { id; name; emoji; description }`, `RIBBONS: RibbonDef[]`, `getRibbon(id): RibbonDef \| undefined`, `computeRibbon(g): string \| null` |
| `education.ts` | `yearlyEducation(g)`, `educationMenuNodes(g): MenuNode[]` (school / university section of the Occupation menu), `hasDegree(g, kind: DegreeKind, major?: string): boolean`, `highestEducationLabel(g): string` |
| `careers.ts` | `yearlyCareer(g)`, `occupationMenu: MenuGroup`, `fallbackInterviewQuestion(g, job: InterviewJob): InterviewQuestion`, `presentInterview(g, job: InterviewJob, q: InterviewQuestion): void` |
| `special.ts` | `yearlySpecial(g)`, `specialCareersMenu: MenuGroup`, `militaryMenu: MenuGroup`, `specialJobNodes(g): MenuNode[]` (actions while holding a special/military job), `fameMenu: MenuGroup`, `socialMediaMenu: MenuGroup` |
| `relationships.ts` | `yearlyRelationships(g)`, `relationshipGroups(g): { title: string; people: Person[] }[]`, `personActions(g, person: Person): MenuNode[]` |
| `love.ts` | `loveMenu: MenuGroup`, `adoptionMenu: MenuGroup`, `petsMenu: MenuGroup` (plus partner/marriage/baby logic used by `relationships.ts` — same agent) |
| `finance.ts` | `yearlyFinance(g)` |
| `assets.ts` | `yearlyAssets(g)`, `assetsMenu: MenuGroup`, `shoppingMenu: MenuGroup` |
| `gambling.ts` | `casinoMenu: MenuGroup`, `lotteryMenu: MenuGroup` |
| `crime.ts` | `yearlyCrime(g)`, `crimeMenu: MenuGroup`, `arrestPlayer(g, crime: string, severity: number): void` (severity 1-5; trial, sentence, maybe prison) |
| `prison.ts` | `prisonMenu: MenuGroup`, `sendToPrison(g, crime: string, years: number, opts?: { life?: boolean; deathRow?: boolean }): void`, `releaseFromPrison(g, reason: string): void` |
| `activities.ts` | `mindBodyMenu`, `nightlifeMenu`, `vacationMenu`, `emigrateMenu`, `licensesMenu`, `moviesMenu` (all `MenuGroup`), `miscActivities: MenuNode[]` |
| `events.ts` | `queueFallbackYearEvents(g): void`, `fallbackChoiceOutcome(g, event: ChoiceModal, choiceId: string): void`, `fallbackCustomAction(g, text: string): void`, `fallbackObituary(g): string` |
| `offline.ts` | `applyFallback(g, task: AiTask): void`, `resolveTask` (the same function), `MAX_CUSTOM_ACTIONS_PER_YEAR`, `CUSTOM_ACTION_KEY` |

### Money flow (who pays what)

- `careers.yearlyCareer` pays salaries and pensions with `earnIncome(g, amount)` (taxable).
  `special.yearlySpecial` pays special-career income the same way.
- `finance.yearlyFinance` (runs after career & special) taxes `g.flags.taxableIncome` by country,
  charges rent (`residence.status === 'renting'` → `residence.rent`), adult living costs when not living
  with parents/partner, pays every `character.loans` entry (student/personal/car/business loans:
  interest + yearlyPayment, removes paid-off loans), and handles going broke (debt collectors,
  eviction to `homeless`).
- `assets.yearlyAssets` handles asset values, condition, upkeep and mortgages (`Asset.mortgage`),
  and rental income from rented-out houses (via `earnIncome`).
- Education creates `kind: 'student'` loans; assets creates `kind: 'car'` loans and mortgages.
- Moving out / renting an apartment / buying a home to live in is the assets agent's
  (Assets menu → Real Estate / Rentals), setting `character.residence`.

### Feature ownership for overlapping BitLife menus

- Plastic surgery, rehab, will & testament, surrender, identity, lawsuits, charity → `activities.ts` (`miscActivities`)
- Doctor, hospital, alternative / witch doctor, psychologist / psychiatrist → `health.ts` (`doctorMenu`)
- Drugs & alcohol from nightlife create `addiction` conditions (activities); health makes them hurt; rehab cures.
- Murder, assault-as-crime, mafia/organized crime → `crime.ts`. Assault/prank/insult as a person interaction → `relationships.ts`.
- Social media accounts, fame actions, special careers, military → `special.ts`.
- Engagement rings & weddings → `love.ts` (it may buy the ring itself; no dependency on assets).
- Sibling births, deaths of NPCs, funerals & inheritance from parents → `relationships.ts`.

### Counter keys (`count(g, key)`) — shared so ribbons can use them

`crimes`, `murders`, `arrests`, `convictions`, `prisonYears`, `escapes`, `riots`, `gym`, `library`,
`meditate`, `walks`, `martialArts`, `partners`, `hookups`, `marriages`, `divorces`, `cheated`,
`children`, `adoptions`, `pets`, `jobs`, `promotions`, `fired`, `degrees`, `casinoWins`,
`casinoLosses`, `moneyGambled`, `lotteryTickets`, `lotteryWins`, `vacations`, `emigrations`,
`surgeries`, `doctorVisits`, `donated`, `fights`, `pranks`, `insults`, `compliments`, `nightlife`,
`drugs`, `rehab`, `fameActions`, `albums`, `movies`, `housesBought`, `carsBought`, `purchases`,
`studied`, `skippedSchool`, `diseases`, `lawsuitsWon`, `customActions`, `wealthGifts`,
`wealthRefusals`, `wealthLoans`, `scammed`, `conglomerates`, `groupMergers`, `spinOffs`, `groupIpos`,
`groupAcquisitions`, `ideas`, `prototypes`, `kabooms`, `patents`, `inventions` (launches),
`historyFirsts`, `rightsSold`, `openInventions`. (Old saves may still hold
`aiEvents`, from the retired AI narrator; nothing reads it.)
Add new keys freely, but use these names for these concepts.

Occupation menu composition (careers agent): school/university section from `educationMenuNodes(g)`,
current job actions, job listings, part-time jobs, freelance gigs, `specialCareersMenu`, `militaryMenu`,
and `specialJobNodes(g)` when the player holds a special/military job.

Relationships UI: `relationshipGroups(g)` returns ordered groups (Parents, Siblings, Partner/Spouse,
Children, Grandchildren, Friends, Classmates, Coworkers, Exes, Pets, ...). Tapping a person shows
`personActions(g, person)`.

## Calendar, history and shared feature contracts

`history/timeline.ts` owns `HISTORY_START = 1900`, `PRESENT_YEAR = 2026`, `ERAS`,
`eraOf`, `priceLevel`, and country-specific `TECH` adoption through `techAdoption`, `hasTech`
and `techOdds`. Historical prices are presentation; do not deflate or inflate engine balances.
Use calendar year as well as age when unlocking technology, careers, stores or activities.
`events/era.ts` supplies tagged text (`eraPick`, `byEra`) and the anachronism lint. Gate both a
menu and its outcomes; hiding a label alone does not make the resolver era-safe.

`history/events.ts` provides `worldEvents`, `newsLine`, `yearlyHistory` and war
queries. `aging.ts` calls `yearlyHistory` first. Headlines cover every country/year and continue
procedurally after the present; historical life events live in `events/history*.ts`. News and
currency-change log IDs are stable and consume neither game RNG nor normal IDs. Era popups
only run before PRESENT_YEAR. `events-medicine.ts` adjusts historical medicine and mortality;
`events-people.ts` supplies occupations and names.

`history/markets*.ts` overlays real historical index/sector crashes, gold, housing, inflation,
rates, exchange closures and expropriation on `invest/engine.ts`. Procedural markets start in
the present. Historical facts stay fixed across seeds and Time Machine jumps. Options premium
sampling must use the procedural distribution, not a mix of fixed historical years. Investing
hints and settlement must use the same family seed, timeline and shock data.

`data/currencies.ts` registers the money converter and owns historical denominations, exchange
scales and `currencyChangeAt`. `core.ts` exposes `bindMoneyContext`, `withMoneyContext`,
`showMoney`, `moneyScale`, `moneyFromInput`, `moneyToInput` and display settings. The UI store
binds its mutable draft before actions (including emigration), then binds committed state.
`Dialogs.tsx`, `ModalHost.tsx` and Annual Report fields convert inputs.
Ancestors and graveyard entries store an optional country for historical currency display.

`timeMachine.ts` is pure: `stopOf`, `availableStops`, `travelBlock`, `arriveInPast`, jump counters
and timeline helpers. A life keeps 10 birthday stops and gets 3 jumps, or unlimited jumps when
`Settings.sandboxTimeMachine` is true. Snapshots are taken only after birthday popups finish.
`save.ts` stores them separately from the main save: IndexedDB first, bounded localStorage
fallback (1,500,000 characters), then memory. Its lifecycle APIs are `startTimeline`,
`resumeTimeline`, `clearTimeline`, `expectSnapshot`, `snapshotIfDue`, `loadSnapshot`,
`forgetFuture`, `timeStops` and `subscribeTimeStops`; tests can inject `setSnapshotBackend` and
await `snapshotWritesSettled`. Failed travel leaves the current life intact; undoing death
removes that life’s grave and ribbon. Heirs start a fresh snapshot history and jump allowance.

Rewinding changes `g.rng` and records `flags.timelineForks`. Heirs retain these family forks.
Per-year market seeds use `timelineFamily` and `familyAt`: prices through the restored birthday
stay unchanged, later prices reroll. Business fiscal outcomes and hidden career rolls use
`outcomeTag(g, year)`, which also rerolls the unfinished year. `timelineTag` is for prices
already visible at the start of a year. No fork means the original seed is returned unchanged.

`business/competition*.ts` owns deterministic rival rosters, era-dependent market sizes,
market share, installed-base effects, acquisitions and antitrust. `competition-state.ts` reads
old/malformed `BizState.market` safely. Classic businesses, studios and deep tech share
`buildCtx`/`marketDemand`; `refreshMarket` books actual sales before yearly evolution resets
plans. Cache keys must include every market-state input, since cloned alternatives can share
a revision. Early entrants can dominate growing markets; present-day entrants face a crowded
field. Every business exposes Market & Competition. Deep-tech revenue valuation uses margins
after research/compute spending; patent and pipeline value is accounted for separately.
Business sale proceeds service personal founding loans only up to available after-tax proceeds;
any unpaid personal balance remains owed after the company is gone.

### Era packs and the year digest

The life-event library is split into four calendar packs: `events/era-pack-1900*.ts`,
`era-pack-1946*.ts`, `era-pack-1980*.ts` and `era-pack-2000*.ts`. Each pack combines flavor pools
with choice events for the appropriate ages and regions. Early packs share
`era-pack-where.ts`, `era-pack-kit.ts` and `era-pack-jobs.ts`; late packs share
`era-late-kit.ts`. Regional, wealth and household predicates belong on the pool, not in invented
line tags. Every pool needs an untagged fallback, and a dated object needs both a start and end
gate when the technology or fashion later disappears.

`history/digest-{prices,early,late}.ts` provides a culture line and approximate period prices for
every year from 1900 through `PRESENT_YEAR`. `history/digest-menu.ts` exposes the read-only
**This Year** card under Activities. Nominal price rows are converted to constant engine dollars
with `priceLevel`; display is the only place they become period money, and small values retain
cents. `householdHas(g, tech)` makes a stable, per-life technology-adoption draw without consuming
`g.rng`; `ownerPools` reserves first-person ownership lines for households that actually have the
technology. `activities/pastimes.ts` is the era-aware **Hang Out** menu, while
`computer/online.ts` owns the BBS, web, dial-up, broadband and app-store progression.

Era rules extend beyond text. Education controls school-leaving ages, discipline, exams and the
pre-GED equivalency path; careers adds period jobs and only lowers hiring ages for plausible
school-leaver work; health covers historical treatment; military handles wartime deferment;
dating and relationship drift use the communication technology available that year. All new
text must pass the anachronism lint across countries, ages and technology adoption states.

### Real-brand registry, shopping and investments

`data/brands.ts` is the only shared registry for real names. Category files register luxury,
rival, consumer and stock brands; ids are stable and deduplicated first-wins. A row may record its
home, founding year, country footprint, sale year, real end year, tier and neutral module data.
Modules query the registry through `brandById`, `brandAvailable` and `brandsFor`; they do not copy
ungated display names into generic events. `shops/everyday-brands.ts` interprets consumer
footprints, embargoes, country exits and model lines. Deterministic selectors are safe in menus;
`pickBrand` is action-only because it advances `g.rng`. Negative claims use a generic employer or
fictional company, and scams, penny stocks, brokers, scandals and villains remain fictional.

Real listed companies live in `invest/stocks-*.ts` and are merged by
`data/brands-stocks.ts`. For these rows, `founded` means first home-exchange trading year and
`ended` means the last year-end quote. `data.fate = 'bankrupt'` is only for documented historical
bankruptcies; otherwise a real listing ends through a recorded merger or takeover and is never a
random victim. `invest/real.ts` builds deterministic exchange slot plans, preserves fictional
small caps, applies period names and coarse size classes, and keeps real-company paths bounded.
`invest/funds.ts` supplies era-gated funds; `investments.ts normalizeHoldings` migrates old saves
without changing their current value. Bitcoin, Ethereum and Dogecoin occupy the named crypto
slots; later coins, exchanges, analyst firms and market-abuse stories stay fictional. All returns,
prices, shares and outcomes are simulated gameplay data, never quotes or forecasts.

### Luxury collections and family access

`shops/luxury-brands-*.ts` owns the real-brand catalog, offers, auctions, trips, valuation and
holding screens. `LuxLine` records a registry id, model, sale years, approximate constant-2026
price and value class. `lineOnSale` combines brand, country, year and technology gates. Boutique,
luxury and ultra tiers unlock at $20K, $250K and $5M net worth. The valuation module owns market
value, condition, service, insurance, loss, bounded appreciation and selling costs; generic asset
aging must skip `Asset.details.lux === 1`. Unverified pieces are valued for counterfeit risk before
authentication, certified pre-owned and gray-market condition have floors, and restoration or
waitlist resale cannot create a risk-free trade.

Luxury state is plain JSON in `Asset.details` and `g.flags`. `ASSET_NODE_HOOKS` routes branded
holdings to their dedicated screen and appends Family Access to eligible ordinary holdings.
`shops/luxury-family.ts` stores permission per asset and person, stamped to the current character
so heirs start clean. Driving age, chauffeurs, crews, relationship and estrangement gates apply.
`yearlyFamilyUse` allows a bounded number of uses, bundles notable incidents and permits at most
one decision popup per year. Show-offs add only small, decaying fame and perceived-wealth heat;
family use never creates money.

### Global market and real rivals

`business/competition-roster.ts` builds a market's real competitors from
`data/brands-rivals.ts` and the `market-data-*.ts` rows, then adds a deterministic, locally named
fictional long tail. Each row records founding and market-entry years, price tier, relative pull,
strength arcs, country footprint and real exits. The roster and post-present drift are pure
functions of the family seed. Real-company profiles, star ratings and shares are explicitly
modelled; competition events never assign a fictional scandal, crime or lawsuit to a real rival.

`business/market-reach.ts` folds exports, joint ventures, subsidiaries, campaigns, home defence
and supplier diversification into the player's competitive pull. Terms ramp, expire and fade;
tariffs, red tape, currency exposure, capacity and saturation constrain them. Pure quotes in
`market-strategy.ts` feed the action, scenario table and Business-talent hint from the same math.
`market-regional.ts` derives country shares and antitrust exposure; `market-view.ts` provides the
screen's concentration, leaderboard, segments, regions, history and profiles. Optional fields in
`MarketState` keep old saves valid.

### Nepotism, succession and family employment

Nepo employment is stored on the relative as `Person.data.nepo`; the company-side family record is
`BizState.family`, read through `business/nepo-state.ts`. Stable per-person seeds drive aptitude,
department, title, CEO style and integrity without menu RNG. Skill trends toward a bounded ceiling;
pay is booked once as company cost and taxed as personal income. Family effects on demand, cost
and quality are deliberately small and shrink with company size. Disowned or estranged relatives
cannot ask for work and leave payroll on yearly cleanup.

Executive roles, invented jobs and excessive family pay go through a board `familyHire` proposal,
including minority-shareholder protections. `Family.succ` may name a relative or key employee;
the same record drives CEO handoff and inheritance, including a designated child inheriting the
company before the remaining estate is divided. Headhunter searches may include qualified family
candidates with explicit relationship labels. Counters are `familyHires`, `familyFired` and
`familyCeos`; popup volume shares the bounded `NEPO_POPUPS` allowance.

### Wills and family feuds

`activities/will.ts` owns the Will & Testament menu. `Character.willBeneficiaries` stores named
people; `g.flags['will.state']` stores shares, charity, the comparison snapshot and change history;
`Person.data.wl` stores per-character knowledge, anger, estrangement and repair state. All reads go
through `will-core.ts`, and every edit goes through `will-act.ts changeWill` plus `queueTells` so
cut-outs, restorations and discovery are consistent even when another feature changes the will.

`yearlyWillFeuds` handles discovery, anger drift, confrontations, ultimatums and reconciliation.
Estranged relatives receive no allowances, wealth asks, luxury access or nepo favors. Gifts have
diminishing relief and restored trust is capped. `will-estate.ts` settles tax, legal fees, court
awards and rounded-down shares; contests use the same pure odds and award calculations shown in
the UI. Escrow and a cut-out heir's claim survive into the next generation and return to the estate
if that heir dies first. A written will that omits an otherwise eligible spouse or child counts as
cutting them out at the reading.

### Main Character Syndrome and instant mastery

`talents.ts MainCharacter` occupies one of the three starting-talent slots. `hasTalent(g, id)` must
be used everywhere: it treats Main Character Syndrome as every special and childhood talent while
the profile, CV and obituary show one readable talent label. Old saves with a single
`character.talent` remain valid, and inherited picks are normalized before use.

`mastery.ts` stores a character-stamped record in `g.flags['mcs.mastered']`: mastered keys, the age
of first mastery and the last bundled-notice year. Mutating helpers such as `masterFirstTime`,
`liftSkill`, `masterJob` and `masterBusiness` run only from actions or yearly hooks—never menu
renderers. The first real attempt lifts the persistent skill to its practical age/body ceiling and
later use prevents decay, but it does not bypass access, age, health, money, licensing or equipment
requirements. It also never changes casino, lottery, capture, contract, opponent or other luck.
Purple hints continue to use each underlying talent's real resolver math and never promise a
guaranteed outcome.

`immigration.ts` owns `citizenshipsOf` and `yearlyImmigration`.
`data/immigration*.ts` provides era-aware borders, blocs and destination programs;
`activities/immigration-*.ts` handles route eligibility, applications, deposits and relocation.
Status is optional on old saves and advances from visa to permanent residence to citizenship.
Golden-visa investments stay locked; quitting a route or moving again must settle the lock.
Eligibility uses nationality, year, net worth, CV, education and family ties, not just cash.

## Sliders and business growth

Sliders and unlimited growth. MenuInput/InputModal kind 'slider' render components/Slider.tsx (SliderField; menus use it through Dialogs.InputDialog, queued prompts through SliderCard.SliderInputCard). The pure math lives in menuModel.ts: sliderScale/sliderValueAt/sliderNotchOf/sliderNudge/sliderClamp/sliderOutput/sliderStart/canSlide, plus sliderPreview, a safe wrapper for MenuInput.preview. Ranges with more than 400 steps use a log curve over 1,000 notches. Money sliders snap to two significant digits in the display currency. Values are always exact and inside [min, max], and run() and scripts get a string exactly like a number field's (money in whole internal dollars). A slider without finite min/max falls back to a number field. A slider dialog closes only with Cancel or Escape (no tap-outside). Previews are called with the committed state and must be pure (tested). Styles are in styles/slider.css.

Business growth has no hard caps; costs and diminishing returns are the limits. Product R&D (business/rd.ts): projects in BizState.rd (optional, so old saves load) are paid up front from company cash and booked as yearCosts. rdQuote(budget) gives odds, whole years (1-4) and boost; a bigger budget means likelier, faster and stronger with diminishing returns, and each running project crowds the team (rdCrowding). Projects advance and resolve in economy.evolve → advanceRd: a launched line gets launched = year + 1. There is no yearly cap. Product ideas come from business/products.ts productIdeas: an endless, era-filtered stream of classics, then variants, then next generations. Range economics: rangeBoost (each line adds less; the ceiling rises with log2 of the range), complexityShare(n) = 0.002·n·(1+n/20) of net sales booked inside the Upkeep line, rangeBrand(n) capped at 16 brand points, lines retire after PRODUCT_LIFE = 15 years. Storage guards: 400 products, 120 projects.

Outlets: open and close are sliders up to what company cash pays for (manage.maxAffordable), with no per-year limit. economy.planFor applies city crowding (citySaturation = country saturation × city weight: 0.12 for the first-listed city, 0.07 for the next two, 0.04 otherwise, minimum 6; demand per outlet × (cs/n)^0.5). bookYear adds densityRent (1 + 0.35·sqrt(n/cs − 1)) and head-office overhead headOffice(n) = 0.015·log2(1 + n/8) of running costs. The deep-tech sim applies the same density rent, head office and range costs. Capacity lines (industries.CAPACITY_LINES; BizState.lines, optional; read with economy.linesOf): each adds LINE_CAP = 0.5 of a home site's capacity for LINE_CAPEX = 0.45 of its capital, plus upkeep and LINE_RENT. They count in equipmentValue (insurance, valuation floor, credit) and sell back for 35%.

Repeatable levers: equipment upgrades and training cost (1 + 0.5k) times as much and gain 1/(1 + 0.5k) as much, where k = times already done this year. Key-staff interviews have no cap; each round costs a headhunter fee (6% of the role's pay, ×(1 + 0.5k)). Marketing budget (0–300%) and pay (70–150%) are continuous sliders; a pay cut cancels that year's raiseYear credit.

Deep tech: deeptech-rd.maxPrograms = 2 + floor(log2(sites)) + (Series B or later) + (listed), clamped to 2–8 (readTech stores 8). programTerms(k) funds a program at 0.5–3× its plan: years ÷ k^0.55, failure odds × k^−0.35, cost × k. Every industry has a 'nextgen' program, open at the top stage, costing 1.35^n more each time with shrinking gains and ipShare 0.3. On success, patents book min(spent, planned budget) × ipShare (1.2 by default), so crash budgets can't pump the valuation. Fabs, GPU clusters, gigafactories, gigalines, biologics plants and SOCs have no count caps (rising cost, PLANT_MAX 200). AI training continues past 10 generations (modelGens). Satellites go up to SAT_MAX 40 with saturating revenue (satUnits).

Studios: gamestudio.maxPipeline(b) = max(4, floor(developers / 12)) games in development at once; team size, hiring and layoffs are sliders.

Business-talent hints: rd.bestRdBudget (grid plus the budgets where a project gets a year shorter, rounded up), manage bestCount (outlets maximizing 5-year gain minus cost), bestLines, linesToRetire, the best marketing level, staff.bestPay. All are computed with bestPlan/bizWorth and never consume g's RNG.

`MenuInput.unit` writes a unit after a non-money slider's number ('%' for budget and pay sliders).

Spending past the board's yearly budget (opening sites, capacity lines, product R&D) goes through
`board.boardAllows` with a `capex` proposal, and the sliders' captions add `board-menu.capexCaption`.

## Boards and hired CEOs (business/board*.ts)

- **When a company has a board.** When anyone else owns part of it (BizState.share < 0.999), when it is listed, or when a conglomerate claims it. Groups register through board-state.registerGroupBoard; their people fill the owner's seats.

- **Where the state lives.** Governance is plain JSON in BizState.board. Use board-state.readBoard for menus and boardOf for actions and yearly hooks; old saves get defaults. It holds:
  - directors, each with a seeded local name and stance (growth/profit/caution) and loyalty. Seats follow ownership through seatPlan/syncSeats, which never touch g.rng: owner seats ≈ share, investor directors, and at least two independents once listed;
  - the mandate (growth/balanced/profit/cash);
  - the limits: a yearly capex+R&D budget as a share of company value, a cash reserve in months of running costs, and a CEO pay cap as a multiple of career.ceoPayNorm;
  - recent votes, patience/misses/warnings, CEO churn, the CEO's last letter, and any rogue scheme.

- **Votes (board-vote.ts).**
  - Proposals: ownerPay, bonus, ceoPay, dividend, capex, debt, sell, ipo, merge, close, fire, hire, takeOver, mandate, limits.
  - assess() gives the merit to all shareholders and how much the proposal favours the owner (self-dealing); each director gets a yes probability from that, their stance and their loyalty.
  - passOdds() is the exact probability vote() rolls; the Business hints use it.
  - needsVote()/boardAllows() gate actions. The player is held to the same limits as a hired CEO.
  - On a listed company the independents veto blatant self-dealing, and minority shareholders can sue over self-dealing that passes (the excess goes back to the company).
  - Payouts never exceed payableCash: cash minus debt minus earmarked game money.

- **Smart hired CEOs (board-ceo.ts).** Above career.SMART_SKILL (75), a hired CEO:
  - plans with economy.bestPlan, with mistakes of ±0.06×(100−skill)%;
  - tunes pay, marketing and supplier by value, one notch a year;
  - hires and lets go key staff;
  - retires faded lines and funds R&D (rd.ts);
  - closes loss-making sites and opens sites or capacity at the mandate's payback and growth pace, within the budget and reserve;
  - repays expensive debt and pays dividends under the cash/profit mandates;
  - writes one letter a year (career.ceoLetter).

  At 75 or below they keep yearly.autoPlan, tilted by style. Deep-tech managers (deeptech-manager.ts) and studio managers (gamestudio.studioManagerTurn) have their own versions of the upgrade. The what-if evaluators (bestOpening, bestLines, bestClosure, bestRdWithin, outlook, mandateScores) are pure and shared with the hints.

- **Yearly review (board.boardYear).** Runs after each company's year in yearly.ts and covers:
  - patience vs the mandate, warnings, director turnover;
  - the hired CEO's bonus within the pay policy;
  - raise requests: a popup when the owner can decide, otherwise a board vote, or trustees for minors and prisoners;
  - poaching of stars, and rare rogue-CEO schemes caught according to the board's oversight;
  - firing: the owner-CEO when they don't control the board (this absorbs the old public-slump rule and the deep-tech investor-pressure rule), and hired CEOs after missed years.

- **Replacing the CEO has no yearly cap.**
  - career.handOver pays career.ceoSeverance: half the pay left on a 3-year contract, or a tenure payout of up to two years' pay. There is none when the CEO is fired for cause or poached.
  - Churn costs morale and raises asking pay.
  - Each shortlist costs career.headhunterFee, +50% per search that year. Executive searches always include an 85-95 star.
  - career.ceoValue adds the optimizer's gain (career.optimizerGain) for candidates above 75.

- **Menus.** board-menu.boardMenuNodes (Leadership › Board of Directors) and briefNodes (the owner's brief when there is no board). manage.ts Money/CEO/Leadership/Exit rows go through boardAllows. board-menu.capexCaption is the pure "needs the board" caption for spending sliders.

Once the board rejects an owner proposal of a kind (or a court blocks it), the owner can't put that
kind again that year: `BoardState.refused`; `board-vote.refusedThisYear` for menus; `passOdds`
returns 0. Minority shareholders can sue over approved self-dealing pay (owner pay, bonus, raising
the pay policy while you're CEO): a judge blocks it before money moves and the owner pays legal
costs, and `passOdds` includes those odds so hints match `vote()`. `bestMandate` is null for
companies the planner doesn't model (studios, deep tech).

## National strategy, executive equity and the Workshop

`workshop/` is Inventor 2.0 (Activities › Inventor's Workshop; see [INVENTOR-CAREER.md](INVENTOR-CAREER.md)). State: `g.flags.workshop` (owner-stamped notebook, skill, reputation) and invention assets (`kind: 'invention'`, `details.inv2`). `market.ts`, `buildOdds`, `routeQuotes` and the event odds are pure and are exactly what the resolvers roll, so talent hints are honest. The `workshop` yearly hook runs before `business` and `finance`: personal royalties go through `earnIncome`; company-made inventions add to `b.cash` and `b.yearIncome` (booked once by the business sim). `migrate.ts` converts the retired research/IP/company-invention systems; `legacy-capital.ts` keeps their factory and stock book value in `equipmentValue`/`valuationOf`.

`business/dynamics.ts` provides pure, seeded country/industry/year conditions and bounded strategy effects. The bounded module cache stores only deterministic base conditions; confidence is read live from world flags and survives succession. `business/expansion.ts` stores programs and studies in optional `BizState.expansion` JSON (old research/patent keys are kept until the Workshop migrates them). Programs are paid up front (cash and yearCosts), are country-scoped, allow three concurrent choices per country, and expire automatically. All three business simulations use demand/cost effects. New sectors reuse calibrated operating models with separate markets, products and units.

`business/executive.ts` adds bounded skill-scaled execution, gradual quality/morale/brand improvements and pre-booking turnaround planning for elite operating-company CEOs. Managers retain optional equity/equityAsked/groupEquity fields through normalization. A non-shareholder with skill 85/90/95 asks for an initial 2/5/10% ownership-equivalent grant: warning after three years, departure two years later. `state.hasExecutiveShares` recognizes any positive vested company or group stake (not retention credit alone). A shareholder never voluntarily resigns or retires; dilution and skill growth do not trigger top-ups, and yearly retention clears legacy departure deadlines. `board.ts` also blocks rival poaching and raise-refusal departures (including old queued popups), and its raise hints no longer price in a shareholder walking out. Family shareholder CEOs also remain despite estrangement, moving abroad or passing head-office retirement age. Grants transfer ownership, never mint cash; group grants update all look-through stakes, division grants reduce the controlling group's holding, and automatic retention uses value-weighted group awards to preserve subsidiary cash pooling. Granted shares remain outside the player's stake after dismissal. Loyalty does not override owner/board dismissal, death or ordinary company failure. Automatic group recruitment filters out division candidates below the group CEO's rating.

`invest/liquidity.ts` integrates an exponential order book for share sales; stock, penny and crypto buys use its cash-denominated inverse. `liquidity` shocks update shared quotes and holdings (including immediately repricing foreign holdings), coalesce per security/year, and do not fade into a predictable rebound. Gameplay depth is not live market data. Splitting orders cannot remove impact, and immediate buy/sell round trips conserve value before fees and tax. Owned-company and group share sales use the same sale curve. Receipts and sale estimates distinguish market impact from fees and taxes.

## Conglomerates (business/conglomerate*.ts)

`business/conglomerate*.ts`: conglomerates (groups of the player's companies). There is no group asset. Every member keeps its membership plus a full copy of the group record in `BizState.group` (plain JSON). Writes go through `saveGroup`, which bumps `rev`, copies the record to every member and refreshes asset values. Reads (`groupsOf`, `groupById`, `liveGroup`) take the copy with the highest `rev`, so the group survives any member being sold, closed, seized or inherited, and a damaged copy falls back to the member's own stake. Ownership: the group owns `own` of each division (1 unless the division raised outside money after joining) and the player owns `share` S of the group. Each division's `BizState.share` is therefore the look-through stake S×own, and every existing payout path (dividends, sale proceeds, investor preferences) pays the player exactly that. The group's value multiplier `mult` (1 − the conglomerate discount, or the market's price for a listed group) applies to each division's operating value through `state.stakeValue`; cash and debt count at face value. Net worth sums the divisions once. A listed group's share price is always derived from the divisions (`sharePriceOf`); the stored price is only a display copy. Members of a live group always have a board (`registerGroupBoard` in conglomerate-state.ts), with the group's people in the owner's seats. The group itself has a board only when it has outside shareholders or is listed. That board is a synthetic consolidated company (`groupBiz`) voted on with `board.vote`, and its state is kept in `core.board`. Merging: value-weighted S at fair value (`mergeTerms`), investor preferences convert, a listed joiner hands its listing to the group (new shares go out at the market price), fees are `dealFee` (about 1.2% of value, with a local minimum), and integration (`integrationCost`) is charged in the first booked year. Synergies (`synergyPlan`, pure, weighted by the group CEO's capture): a shared back office credited as other income, cross-selling and purchasing applied as next year's `demandShock`/`costShock` (undone if the company leaves early), and complexity charged. The discount (`conglomerateDiscount`) counts only fully unrelated pairs and shrinks with strong results. The yearly step is `yearlyConglomerates` → conglomerate-year.ts: integration, synergies, the group CEO's pay and turn (above SMART_SKILL: debt paydown, mandates with hysteresis, one division CEO upgrade a year), the group board's review of the group CEO, the listing price and history. `yearly.ts` calls `groupRescue` before a division's cash crunch. Spin-offs keep S×own, and a listed group's spin-off lists at the group's market factor. A group of one dissolves (`dissolveIfAlone`); exit.ts calls `afterMemberGone` whenever a company is removed. Menus are pure and hints use the same functions as the actions. `manage.ts` `makeOffers` now applies buyers' premiums only to operating value; net cash is priced at face value.

Merging credits each newcomer at its value after the fees it pays from its own cash (a listed one
at its market price); the player's share S is value-weighted on those values (`mergeTerms`,
`planJoin` shows the same number). Group reads (`assemble`) reconcile each division's `own` from its
`BizState.share`, so outside money a division raises after joining is never written back to the
player. Group acquisitions count sister divisions in the same market for antitrust
(`groupAcquireBlock`). Purchasing and cross-selling synergies grow linearly with sister size (no
gain from splitting into shells). Companies removed outside exit.ts (debt seizure, repossession,
divorce) reach `afterMemberGone` through `assetHooks.businessGone`.

## Running a company: dashboard, milestones, franchising, events

- **Dashboard** (`business/dashboard.ts`, pure): `dashboardRows` opens every company screen with
  identity, cash · value · stake, last year's sales/profit with ▲▼ against the year before, market
  rank/share and `companyHealth` (Just opened / Thriving / Steady / Struggling / In danger plus one
  advice line). Finance firms get identity, money and profit only; `financeNodes` owns the rest.
  The full fact sheet (`manage.infoRows`) lives one tap away under Company Details.
- **Milestones** (`business/milestones.ts`): `BizState.milestones` maps id → year. `milestoneYear`
  runs in `yearly.ts` after the books close; a company first seen with ≥ 2 booked years (old saves)
  or bought records its past quietly, in the years it happened (history). A milestone's year is
  the fiscal year just booked (anniversaries: founding + N, the IPO: `ipoYear`). Amounts in labels
  are formatted at render time (`milestoneLabel`); one reached mid-year shows as reached, recorded
  at the close (`nextMilestones().pending`); cooked books never count toward the unicorn. New ones
  log, give capped happiness/fame and share one "Milestones!" popup a year across all companies
  (`g.flags['biz.milestonePopup']`).
- **Franchising** (`business/franchise.ts`, consumer-facing classic industries only):
  `BizState.franchise` holds units, a 4-year ledger and the booked year. Sales book the fee net of
  onboarding through `b.cash`/`b.yearIncome`; `bookFranchiseYear` (before `simulateYear`) books net
  royalties (6% − 1% support of modeled franchisee sales, capped at one site's capacity, shrinking
  as the home network nears `networkRoom`) once per fiscal year, applies exact churn (fractions
  carry, no dice) and may raise one franchisee scandal popup (a hired CEO handles it silently).
  Buyers a year are set by the network the year started with; buy-backs and terminations never
  give them back. Buy-backs are capital spending (cash only), become company outlets and cost at
  least a fresh outlet's fit-out plus the fee, so selling to buy back always loses money. The
  ledger readers live in `franchise-state.ts`: `valuationOf` takes one-off fees (after tax) out of
  the earnings it capitalizes (their cash already counts once). The statement shows
  "Franchise fees & royalties" (`franchiseIncomeFor`) taken out of other income.
- **More events** (`business/events-extra.ts`): `EXTRA_EVENTS` joins `events.ts EVENTS`, so the
  yearly roll and the one-event-a-year cap are unchanged. Every hint uses the resolver's own odds
  (`expectedFx`, `rdValue`, `franchiseValue`, `equityGain`) and no RNG. Banks and investment firms
  draw only the industry-neutral generic events (`events.ts ANY_COMPANY`); their own sets live in
  the bank/fund modules. The celebrity investor buys ordinary shares (no preference) and skips deep
  tech (outside money goes to its R&D account) and cooked books.
- **IPO**: `exit.IPO_PROFIT` is $25M of last year's profit (studios and deep tech keep their own
  rules; groups take the strictest member's); the board still votes, then the underwriters audit:
  cooked books sink the listing `exit.IPO_COLLAPSE` (50%) of the time, for a company
  (`manage.ipoDueDiligence`) or any division of a group (`groupIpo`).
- **National strategy** stays off financial firms; `national-view.tidyNationalStrategy` shows the
  `COMPARE_SHOWN` best foreign markets and a one-line summary.
- **Banks' money rules** (`business/bank*.ts`): deposits and loans are client money; equity is
  `b.cash − b.debt + advance` (the run-time advance funded by the central-bank debt), and
  `valuationOf`/`closeBusiness` count it (`bankAdvanceOf`). `payableCash` stops at the capital the
  regulator requires (`bankPayoutRoom`), so dividends, group sweeps and buybacks can't strip it.
  `newBiz` opens a bank's books at once (`openBank`). Rescues (bailout, "too big to fail") take at
  least the fair stake plus a quarter. Bank statements opt out of perfect-foresight income. The
  market line shows rank and share of deposits (funds: of money invested); finance firms get no
  rival-buyout quotes. Founding advice comes from `startOutlook` (the year's model without dice).

## Being rich, felt (events/wealth*.ts)

`yearlyWealth` (aging.ts YEARLY_HOOKS, after finance) runs these steps in order:
- Pays the allowances the player set. A payment only goes out if cash covers it plus the year's upkeep and mortgage payments still due. Two missed years, disowning or death stops an allowance.
- Collects loan repayments, never more than was lent. A borrower who doesn't repay may start avoiding you.
- Settles funded ventures and tips. Success pays 1.25×, a partial outcome 0.5×, otherwise nothing; expected return is always below 1×.
- Ages kids' entitlement, lets gifted cars crash, and asks once (one "All Grown Up" popup) whether to keep paying kids who turned 18.
- Queues this year's money requests.

**Wealth tiers.** Requests need an adult player and tier >= 1. Tier comes from `wealth-core.wealthTier`: net worth ÷ `typicalIncome` (45,000 × country wealth × history realWealthFactor). Tiers start at 25, 80, 400 and 4,000 years of income: comfortable, rich, very rich, ultra rich. `TIER_RATE` sets how many asks a year each tier gets, and `TIER_POPUP_CAP` caps the popups at 1, 2 or 3 (`WEALTH_POPUP_CAP`). In prison the rate is ×0.25 and the cap is 1, and requests arrive as letters. Small asks are bundled into one "Everybody Wants Something" popup.

**The catalog.** Entries are `AskDef`s (wealth-ask.ts) in wealth-kids, wealth-family and wealth-world, registered in wealth-catalog. Each entry has who asks, minTier, cooldown, era/age gates, weight and build. A built `Ask` is plain JSON in the popup's data. wealth-resolve.ts turns it into honest options:
- give
- a cheaper alternative
- give less (a money slider capped at cash)
- lend (tracked per person)
- say no
- set boundaries (no asks from that person for 5 years)
- custom extras: allowance set/fair/pick, postnup, scam report, gate the door, charity tiers

Money only leaves through spend(). Amounts use local price multipliers (goods, electronics, luxury, car and housing scales) and are capped at a share of net worth. Items are era-gated through hasTech, era.ts cars/flights/landline and computer/era.

**Per-person state.**
- `Person.data.w` (`WealthTies`, read with `readTies` and written with `updateTies`) holds allowance, owes, given, yes/no counts, boundaries, marks, the gifted car and the last few asks. It is stamped with the character id, so heirs start clean.
- `Person.data.entitlement` (0-100) is how spoiled the person is. The 'spoiled' trait shows at 60 and above. It raises ask sizes, lowers gratitude, makes refusals sting more and costs smarts. Fair parenting (a 30–80% yes rate) gives a small smarts and relationship bonus.

**Game flags.** `wealth.pending` (ventures, keyed by investor), `wealth.cd` (cooldowns for outsiders), `wealth.donated` (per character, for diminishing karma and fame) and `wealth.bound.door|strangers|charity`.

**Person menu.** relationships.ts `personActions` appends `wealthNodes` (wealth-menu.ts): a "Money Matters" group for family and friends while the player is an adult. It has an allowance slider with a live caption, lend, ask to be paid back, forgive, buy a car, pay for a vacation, help with a house, and fund their idea. The Business talent hint shows the same odds the payout rolls. statusInfo shows the allowance and what they owe.

## Built-in tasks (offline resolution)

`ModalItem` of kind `aiTask` (the historical name, kept so saves with a queued task still load)
holds a serializable `AiTask`. Engine code queues one with `queueAi(g, task)`. It is never shown:
when it reaches the head of the queue, `store.processQueue()` resolves it synchronously with
`offline.ts` `resolveTask(draft, task)` (= `applyFallback`) inside the normal `act()` commit, so
the popups it produces take its place at the same position. There is no spinner and no busy
state. `processQueue` is idempotent and re-entrancy safe (calls made during a pass fold into it;
a task is found by id in the latest state and removed in the same commit, so React StrictMode's
double effects can't resolve it twice); a resolver that throws drops the task instead of
leaving the queue stuck. `ModalHost` renders nothing for a task at the head and calls
`processQueue()` in an effect as a safety net.

| Task | Resolved by |
|------|-------------|
| `yearEvents` | `events.ts` `queueFallbackYearEvents(g)`: 1-2 flavor lines and, most years, one event popup |
| `resolveChoice` | `events.ts` `fallbackChoiceOutcome(g, event, choiceId)`: a generic outcome from the option's wording. Only events written by the old AI narrator (`ChoiceModal.source === 'ai'`, older saves) have no script; `store.chooseOption` resolves them directly |
| `customAction` | "Do Anything": `events/custom.ts` keyword resolver, at most `MAX_CUSTOM_ACTIONS_PER_YEAR` (5) a year (`useYearAction(g, 'doAnything')`; the menu row is greyed out once they're used, and a task that still arrives gets an "Exhausted" notice) |
| `interview` | `careers.ts` `presentInterview(g, job, fallbackInterviewQuestion(g, job))` |
| `screenApplication` | `careers.ts` `applyScreening(g, app, cv.offlineScreen(g, app))` |
| `obituary` | `g.obituary = fallbackObituary(g)` (`events/obituary.ts`) |

A dead character only gets the obituary; every other task is a no-op once the life is over, and
an unknown task type (a future or broken save) is a no-op too.

Old saves: `save.ts` `migrateLegacyAi` (run by `loadGame` and `loadSnapshot`, idempotent) drops
the `ai` narration request from queued notices, turns log entries with the retired tone `'ai'`
into `'neutral'`, and deletes the narrator-only flags `aiRecentEvents` and `obituarySource`.
The persistence boundary rejects non-finite state and malformed save/snapshot shells, sanitizes
ribbon and graveyard collections, and keeps only queue entries with the renderer and handler
fields their modal kind requires (including valid choices, tasks, games, and finite input bounds).
This prevents damaged browser data from resuming into an unrenderable or unclosable popup.
`LifeLog` and the death screen's journal draw any unknown tone as a plain line.

## UI contract

- `src/ui/store.ts`: `useApp(selector)`, `goTo(screen)`, `goBack()`, `startNewLife(opts)`,
  `resumeSavedGame()`, `hasSavedGame()`, `continueAs(childId)`, `abandonLife()`, `ageUpAction()`,
  `runMenuAction(action, input?)`, `dismissNotice(id)`, `chooseOption(id, choiceId)`,
  `submitInput(id, value)`, `finishMinigame(id, result)`, `processQueue()`, `act(mutator)`,
  `updateSettings(patch)` (keeps only known fields), `travelBack(age)`, `clearTimeTravelError()`.
  Screens: `'home' | 'newLife' | 'game' | 'settings' | 'ribbons' | 'graveyard'`.
- Purple talent hints: `components/TalentHint.tsx` renders them; `menuModel` `nodeHint` reads
  `MenuBase.hint` safely and `cleanHint` strips a leading 🔮 and caps at `HINT_MAX` (220 chars).
  CSS tokens `--hint-text`, `--hint-bg`, `--hint-border`, `--hint-ring`. The Death screen's
  "Live again" keeps the picked talents (`liveAgainOptions`).
- Return point: when an action in one menu sheet sends the player to another screen/sheet, the store
  remembers where they were (`returnPoint`, `setReturnPoint`, `clearReturnPoint`, `returnPointLive`,
  `returnChipVisible`). `components/ReturnChip.tsx` (`resolveReturnPoint`, `ReturnChip`, `MENU_SHEETS`,
  `openingClearsReturn`) shows a "Back to ..." chip that reopens that menu at the same submenu.
- Shared components: `Sheet` (bottom sheet with title, back, close, footer) and `StatBar`.
- Minigames: components in `src/ui/minigames/<Name>.tsx`, named export matching the file name,
  props `MinigameProps { modal, onDone(result) }`. Use the shared CSS classes below and inline styles.
- Shared CSS classes (defined in `src/ui/styles/global.css` by the UI shell agent):
  `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger`, `.btn-ghost`, `.btn-block`, `.btn-small`,
  `.card`, `.muted`, `.stack` (vertical flex gap), `.row` (horizontal flex gap, centered), `.grid-2`, `.grid-3`,
  `.pill`, `.badge`, `.center`, `.spacer`. CSS variables: `--blue`, `--blue-dark`, `--green`, `--green-dark`,
  `--red`, `--orange`, `--yellow`, `--purple`, `--bg`, `--card`, `--text`, `--muted`, `--border`, `--radius`,
  `--stat-red`, `--stat-orange`, `--stat-yellow`, `--stat-green`.
