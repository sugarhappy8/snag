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
    workplace/*.ts       Shared Work Plan state, catalog, actions, menu and yearly resolution for
                         ordinary full-time jobs. All 179 full-time definitions map to one of nine
                         families or the 14-job professions.ts exemption; family progress follows
                         the character while employer trust and reviews stay with the appointment [career agent]
    professions.ts       Professional Practice cases for 14 full-time job IDs; those jobs do not
                         also enter the shared Work Plan loop                              [career agent]
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
    business.ts business/*.ts   Start/buy/run companies in 56 industries; yearly sim + Annual Report.
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
                         (deeptech-state readTech/TECH_VERSION — bump it when TechState gains fields (currently 4));
                         data, core, rd, funding, sim, events, menu, manager, found modules. Investor and
                         grant money sits in TechState.venture (the R&D account), never in b.cash; the
                         valuation nets out investors' 1x preference itself (so BizState.pref stays 0 for
                         deep tech); deepTechValue may be negative (cancels one-off windfalls); grants
                         count as income only up to the year's R&D spend and are repaid on cancellation.
                         invest/engine lists deep-tech companies as extra slots after each hub exchange's
                         classic plan (classicSlots()). Missing deep-tech demand defaults by income
    business/rd.ts products.ts  Product R&D with no yearly cap (BizState.rd projects, endless era-gated
                         ideas, a fixed development cost per idea) and the range's running costs
    business/heavy-rd.ts heavy-data.ts  Heavy R&D: a rare breakthrough (5 per trade), its records in
                         g.flags, the rival arrival schedule and the demand pulse (see "Business growth")
    business/lab-*.ts    R&D 3.0 (BizState.lab): lab-data.ts constants and tables, lab-state.ts the stored
                         state and its readers, lab-rules.ts prices, odds, blocks and values (pure),
                         lab-year.ts bookings and actions, lab-text.ts copy, lab-menu.ts the Research &
                         Operations screen (see "Business growth")
    business/product-market.ts product-data.ts  Product lines that compete head to head: kinds of
                         product with real-history demand curves, line quality vs the rivals'
                         versions, rivals' offerings, stacking, who loses customers (see "Business growth")
    business/devices-data.ts devices-specs.ts devices-menu.ts  Device and Platform trade: chip terms,
                         fabs, OS pull, spec sheets (see "Devices and chips" below)
    business/heavy-rd.ts heavy-data.ts  Heavy R&D: five breakthroughs per trade that a product company
                         can pioneer, kept as records in g.flags['heavy.<trade>|<market>'] (see
                         "Heavy R&D" below)
    business/tech-waves.ts tech-wave-factors.ts tech-wave-data.ts history/tech-waves.ts  Tech waves:
                         breakthrough-class events that move whole company markets together, in flags
                         techWaves and techBase and BizState.wave (see "Tech waves" below)
    business/ai-bench*.ts scorecard.ts deeptech-bench.ts  AI Lab 2.0: capability ratings and benchmark
                         generations, the rival lab board, world firsts and the Benchmarks lines (see
                         "AI lab benchmarks" below)
    invest/wave-stocks.ts invest/clock.ts business/wave-insider.ts  Tech waves for listed stocks: the
                         sector table and the level folded into the stock seam, the one market clock, and
                         the founder's insider rule (see "Tech waves and stocks" below)
    business/sector-*.ts  Sector families: the Operations Desk of 18 food, care and utility trades, kept in
                         BizState.sector (see "Sector families" below)
    business/board*.ts   Boards, mandates, votes and smart hired CEOs (BizState.board; see below)
    business/conglomerate*.ts  Groups of the player's companies (BizState.group copies; see below)
    business/share-classes.ts share-classes-menu.ts  Share classes of the player's company: the votes
                         a stake carries and the price factor (share-classes.ts), choosing the classes at
                         the IPO and from Capital & Ownership (share-classes-menu.ts; see "Share classes" below)
    business/own-listing.ts listing-id.ts own-trade.ts own-listing-menu.ts  The player's listed
                         companies in Stocks: tiers, ticker and exchange, buy and sell rules, the row
                         and its screen (see "Your listed companies in Stocks" below)
    business/dividend-policy.ts dividend-year.ts dividend-menu.ts  The yearly dividend rule, its
                         quote and year step, and its menu (see "Yearly dividends" below)
    business/hedge-record.ts hedge-model.ts hedge-fund.ts hedge-company.ts hedge-year.ts hedge-menu.ts
                         Personal, family and company hedge funds in Investments: the saved records
                         and their readers, the return model shared with the firm, funds as Assets,
                         the company's cash at work, the yearly hook and the menus (see "Hedge funds"
                         below)
    business/finance-firm.ts  Banks and investment firms: a thin dispatcher (simulateFinanceYear,
                         financeNodes, financeManagerTurn, financeEraBlock...) to bank*.ts (Banking 2.0:
                         rates, lending appetite, products, regulator, runs, events) and fund*.ts
                         (Investment Firms 2.0: asset manager, hedge fund, venture capital, brokerage).
                         Books live in BizState.financeFirm, read by readBank/readFund (which migrate
                         v2.1 records through finance-firm-state.financeView); client money never
                         enters b.cash (see "Banks' money rules" below)
    events/wealth*.ts    Being rich: money requests from kids, family and friends, allowances, loans,
                         the "Money Matters" person section (see "Being rich, felt" below)
    assetHooks.ts        businessGone(g, a): low-level code that removes a company (seizure,
                         repossession, divorce) notifies the business modules without importing them
    invest/instinct.ts   Investing talent: marketInstinct(g), an honest ~80% gut read of next year's
                         deterministic engine moves (per character + year, never rerolls)
    investments.ts invest/*.ts  Stocks, funds, bonds, savings, crypto, gold on the local exchange.
                         registerOwnListings(provider) is how business/own-listing-menu.ts adds rows
                         to Stocks, so investments.ts still imports nothing from business/
                         buySecurity and sellHolding take a trailing `quiet` flag (no popup, no log line).
                         managedBook(g) (pure) and managedOrder(g, bucket, side, dollars) are the seam for
                         the money manager: three buckets (the index fund, bonds, savings) of ordinary
                         holdings. advisors/ imports them; investments.ts imports nothing from advisors/
                         registerHedgeFunds(hooks) is how business/hedge-menu.ts adds the Hedge Funds
                         row and the fund screens, by the same rule
    advisors/*.ts        Money team (see "Money team" below): mandate (the manager's three dials and the
                         pure yearly plan), team (the g.flags['fin.team'] record, offers, fees, gates,
                         vetting, hire and release), review (the advisor's six findings), year (the
                         yearly hook) and menu (Assets, Business & Investments, Money Team)
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
    invest/class-data.ts The classes real companies had, by year (votes, who holds them, which are
                         listed), their Stocks screen line and the second listed lines that can be bought
    workshop/*.ts        Inventor's Workshop (Inventor 2.0): catalog, notebook, builds, patents, launch routes,
                         sales, events, menus and the old-save migration
    nation/*.ts          Politics 2.0: what governments do and what it does to the world (see "Politics 2.0"
                         below): state, data, effects (one pure overlay), trade-policy, company, office,
                         legislature, govern (measures and bills), laws, yearly (+ State of the Nation),
                         consequences, drama, graft (dirty money), regime (keeping power), menu
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
13. **Write text in the house voice.** Every string you add or touch follows `docs/VOICE.md`: bare
    facts, contractions, no morals, a joke only where the event is itself a joke, and the length caps
    (life-log line 90 characters, outcome 120, scene 140, tooltip 120, digest 110). The disclaimer that
    the game is fiction lives once, in Settings, About. `node scripts/voice-report.mjs` counts the
    result against the targets and runs in CI as a warning; two rules are tests (no chatbot phrases,
    no new em-dashes). Strings that need rewriting in bulk go through `scripts/voice-batch.mjs`
    (`extract` writes a JSON batch, `apply` validates and splices the rewrites, and changes nothing but
    string text).

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
`historyFirsts`, `rightsSold`, `openInventions`, and for Politics 2.0 `lawsPassed`, `votesBought`, `schemes`,
`corruptionScandals`, `exiles`, `overthrown`, `selfCoups`, `nepotismPosts`. (Old saves may still hold
`aiEvents`, from the retired AI narrator; nothing reads it.)
Add new keys freely, but use these names for these concepts.

Occupation menu composition (careers agent): school/university section from `educationMenuNodes(g)`,
current job actions (including `workplaceMenu` for an eligible ordinary full-time job), job listings,
part-time jobs, freelance gigs, `specialCareersMenu`, `militaryMenu`, and `specialJobNodes(g)` when
the player holds a special/military job. `careers.yearlyCareer` calls `yearlyWorkplace` from the
ordinary full-time job step; it settles only an earlier plan and then creates the safe default for
the new work year.

`workplace/parttime.ts` owns the lighter Shift Focus menu and next-year review for all 70
part-time definitions. It uses an appointment-local plan/trust/history, an owner-scoped portable
skill/reference profile, a private seeded stream, and global annual choice/review caps. It never
pays wages. `careers.yearlyCareer` calls it from the part-time step after updating performance.
`workplace/progression.ts` records completed working years after tenure increments: full-time
years and hours-weighted part-time equivalents, capped at one same-family year per calendar year.
Old ambiguous job-history titles are not backfilled. Pure readers supply the menu summary and
at most five percentage points of raise/promotion odds, after existing performance gates and
market scaling. Special jobs and businesses do not receive this layer. All new state is optional,
versioned and owner-stamped; the save schema remains 2.

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

`history/market-events.ts` is the business side of history: a table of real market events by
year (the Great Depression, the 1970s oil shocks, the Gulf War spike, Japan's bubble, the dot-com
boom and crash, the Asian and euro crises, the 2007–11 housing crash, the 2014–16 oil collapse, the
2020 crash, the 2022 crash, the 2023–26 AI boom fading by 2030), each with home countries, a
strength abroad, and effects on demand, input costs and valuation multiples for the exposed
markets (`exposureOf`: oil, fuel users, property, banks, internet, chips, AI, travel, going
out...) and a milder effect on everyone else. `marketEventFactors` is pure and cached; it feeds
`dynamics.nationalMarket` (every company's demand and costs: player, NPC, deep tech, studios,
planner), `economy.valuationOf` (the multiple, in the year of the last booked record),
`deeptech-core.operatingValue`, and economic rivals (`economic-actors.advanceActor`). World-market
industries take only a third of the demand effect because their size curves already carry their
booms and busts. In history years `economy.exchangeMove` is the real index return, so listed player
companies move with the real market. Nothing is invented for the future, and 2026 lifts only
AI-exposed markets. When an event first hits a country hard, the yearly pass announces it once
(`market.events` flag, deterministic notice id) with each company's exposure; the Annual Report
and Market & Competition list the year's events. Tech waves (below) add the same read-only lines.

`history/markets*.ts` overlays real historical index/sector crashes, gold, housing, inflation,
rates, exchange closures and expropriation on `invest/engine.ts`. Procedural markets start in
the present. Historical facts stay fixed across seeds and Time Machine jumps. Options premium
sampling (index and single-stock) must use the procedural distribution, not a mix of fixed
historical years; a real company's documented last year is priced at no less than what that
fixed ending certainly pays, so knowing history is never a risk-free return. Investing
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

### Heavy R&D (business/heavy-rd.ts, heavy-data.ts)

Each product trade has five breakthroughs (`heavy-data.ts`, for example a liquid-cooled GPU hall or
an autonomous agent platform) that a company can spend years and a fixed, large budget on. A hit is a
`HeavyRecord` (catalogue name, launch year, years taken, quality, cost, the pioneer's asset id) stored
as a list in `g.flags['heavy.<trade>|<market>']`; it is read through `readHeavy` (validated, clamped,
bounded) and written through `addHeavy`. The record drives the kind's demand curve (`heavyLevel`),
and `heavyPulse` lifts the market's potential in `marketCtxFor` (at most +40%, building over three
years, holding eight, then fading). Rivals follow on `heavyArrival` (later for smaller tiers) and the
first one to follow is reported once in the life log; the pioneer's launch is announced in
`market.news`, and `heavyWorldFlags` carries both the records and the news to the heirs. Only product companies take part: `heavyEligible` leaves out deep
tech, finance firms and game studios, which keep their own kind of R&D.

### Tech waves (business/tech-waves.ts, tech-wave-data.ts, history/tech-waves.ts)

A tech wave is a breakthrough big enough to move whole company markets together, as the real ones did:
demand for the trade that sells it, cheaper inputs, higher valuations, deep-tech investors chasing it,
rivals following, and the companies it replaces losing customers. It applies to every company the same
way (player, NPC, deep tech, rivals); listed stocks take a sector price level from the same waves (see
"Tech waves and stocks" below).

Records. A `TechWave` (`kind`, `name`, `source`, `year`, `market`, `size`, `hype`, `delivery`, `last`,
optional `origin`, `home`, `skip`, `mature`) lives in the list `g.flags.techWaves`, at most 64, always
replaced and never edited in place. The 23 kinds are in `tech-wave-data.ts` (`WAVE_KINDS`): each names
the trades that play three roles, **core** (sells the breakthrough), **supply** (suppliers and
complements) and **disrupted** (the incumbents it replaces), read through `roleOf`. A static table of
11 real waves (`history/tech-waves.ts`, the transistor and television through mRNA and GLP-1) covers
1946-2024 with control points for hype and delivery and its own reach abroad; it needs no stored
record and is quiet in 1962-1974, 2001-2005 and from 2025 on, where only written waves speak.

Five writers, all through one idempotent `announceWave` (id from source, kind, year and a hash of the
origin, so a second call returns the stored wave and writes nothing): a Heavy R&D launch listed in
`HEAVY_WAVES` (a hook in `advanceHeavy`, the pioneer only and only soon after the catalogue's real
date; `skip` names the one trade whose demand term is left out in that market, because `heavyPulse`
already lifts it, and where the wave's kind disrupts that trade the trade is left out whole, so a pioneer is never hurt by its own breakthrough); a deep-tech milestone in `DEEPTECH_WAVES`, an approved drug with a big peak, or a
lab's first model at the frontier (`afterResearch`); a Workshop first (`WORKSHOP_WAVES`, source
`workshop`) or a future Workshop win (source `race`); and a seeded rival landing (`landRivalWaves`, a
`YEARLY_HOOKS` entry for years after 2026 only, so history years never get an invented rival wave).
`announceWave` refuses an unknown kind, a 65th wave, a third non-rival wave in one year, and a heavy,
Workshop or race wave of a kind a history row already covers that year. Costs are never skipped.

Hype and delivery. A new wave starts at hype `0.3 + 0.7 size` and delivery 0. `advanceTechWaves`
runs once a year at the end of `yearlyBusinessImpl` (and on its no-company return), behind the `last`
marker. Delivery moves toward what really sold (a heavy record's adoption curve, a deep-tech lab's
share against a quarter of its market), by at most 0.25 a year; a Workshop, race or rival wave, or one
whose company or record is gone, gains `0.08 + 0.22 u` from a seeded draw with a 25% stall year (a stall cools hype only while delivery is under 0.9, so a delivered wave still matures).
Hype closes on delivery (faster when it lags), so a premium unwinds only when the breakthrough did not
ship, never just because a year went by. Five mature years settle a wave into `techBase` (permanent
demand and cost factors per `trade|market`, folded at the wave's own market; `waveFactors` also reads the `world` entry in every market, so a settled world wave leaves no cliff in a national-scope trade); a wave still under 0.1
delivery after six years is dropped. A delivery gain also feeds the home economy a small `innovation`
amount (never for Workshop or race waves).

One formula. `waveFactors(trade, market, year, waves, base, worldMarket)` is pure and returns
`{ demand, costs, value }` per trade, multiplied over every live wave and history row and clamped to
`FACTOR_BOUNDS` (value 0.3-3, demand 0.45-1.8, costs 0.75-1.5), with one shared frozen neutral when
nothing applies. Reach: market `world` reaches every country in full; a country wave is 1 at home and
`0.35 + 0.4 x delivery` elsewhere; history rows carry their own. World-scope trades take history
demand at a third, because their size curves already carry their booms. `waveFactorsFor(g, ...)` adds
`techBase`. The readers (`tech-wave-factors.ts`, a leaf module so the low-level market code can import
it without the company economy) are `readTechWaves` and `readTechBase`: they validate every field,
drop damage, clamp, cap lengths, never throw and never write, and cache by the raw stored array or
object (every writer replaces it), with a memo per trade, market and year on the validated list.

Where each reader applies its factor, once and with its own clamp: demand only in
`economy.marketCtxFor` (on the spread copy after `buildCtx`, whose cache stays free of game state,
together with the heavy pulse: `clampN(heavyPulse x demand, 0.45, 1.8)`); costs only in
`dynamics.nationalMarket` (`clampN(events.costs x costs, 0.75, 1.5)`); value in `economy.valuationOf`,
through `BizState.wave` (`{ v, y }`, stamped by `stampWave` when a classic company's year is booked,
never for deep tech or a quoted company, and validated on read) with history waves read directly, and
for deep tech in `deeptech-core.industryCycle`'s `wave` echo (value only). A quoted company is one listed
itself or a division of a listed group (`state.isQuoted`), because a group's share price is the sum of its
divisions' valuations: its valuation reads a stock-grade stamp (`q`) and no history row, and `operatingValue`
asks `industryCycle(..., 'stock')`, so it follows the sector level its peers show; rivals in
`economic-actors.advanceRivals`, which passes the factors to `advanceActor` for non-real rivals;
fast-follower entrants through `waveNewcomers` (competition.ts, one per delivery level crossed, never for
a heavy wave, which has rivals follow on `heavyArrival`);
and regulators through `waveScrutiny`, which multiplies `antitrustOf`'s chance (`antitrustChance`
itself is unchanged).

What the player reads. `waveLines` is pure: at most one line in the Annual Report and three rows in
Market Overview, two short sentences with the demand, cost and value changes, and any line the era
check flags for that country and year is skipped. Deep-tech and rival waves post a `wave-<id>`
`MarketNews` item only when they touch a player company's trade or came from the player.

Heirs and saves. `waveWorldFlags` hands the validated waves and settled factors to the next generation
(never `market.news`, which `heavyWorldFlags` already carries). Draws come from `seeded(...)` keyed by
`familyId(g.lifeId)` plus `outcomeTag(g, year)`, never `g.rng`, so heirs share them and a Time Machine
fork rerolls only the unfinished year. `techWaves`, `techBase` and `BizState.wave` are optional,
bounded and validated on read, `SAVE_SCHEMA` stays 2, and a life with no company writes none of them.

### Tech waves and stocks (invest/wave-stocks.ts, invest/clock.ts, business/wave-insider.ts)

Release 1b. When a breakthrough lands, listed stocks, index funds, fund returns, single-stock and index option
settlements, the Investing talent's gut and the player's own listed company move with the wave's sector level, and
a founder who trades ahead of their own launch is an insider. Spec `docs/superpowers/specs/2026-10-19-waves-stocks-design.md`;
the plan's decisions P1 to P11 refine it and win where they differ.

The trail and `nx`. Each `TechWave` keeps its last six steps (`trail`, `[year, hype, delivery]`, oldest first) and
one projected next step (`nx`, `[hype, delivery, fork tag]`), both optional and validated by `readTechWaves`.
`stepWave` is the delivery and `nextState` path `advanceTechWaves` runs, extracted so `projectWave` can run the
same step at `last + 1` ahead of time (a wave about to drop projects neutral, P2). `stateAt` reads the trail for a
year up to `last`, `nx` after it while its tag equals `nextStepTag` (the Time Machine fork tag of `outcomeTag`),
else the current state. So a level read before the yearly step (funds, the gut) and after it (quotes) is the same
number, and a jump to another timeline leaves `nx` ignored until the next step is written.

The level. `stockLevelFor(g, trade, market, year)` is `clamp(S x Product over waves (1 + STOCK_BETA x (v_w - 1)), 0.3, 3)`
with `STOCK_BETA = 1.5` and `v_w` one wave's own value factor from `effectsOf` (the per-wave product, P1: one wave
gives the spec table, and a settle keeps the level with several waves live). A heavy wave never disrupts its pioneer
trade at any exchange (P9, applied once in `waveLevels`). History rows count only from `PRESENT_YEAR`, because the
stock tables already carry the real booms (S6). A settled wave leaves `TechBase.stock` (0.3 to 3 like the level itself, so a settle keeps it; missing is 1)
and no scheduled fade (S7); it keeps its reach (P4): the `|world` entry counts in full everywhere, a country entry
in full at that country and at 0.75 of its strength in other countries, never in the `world` market. The reader is
pure, memoized per validated list and returns exactly 1 with no wave and no settled factor.

The sector table and the seam. `SECTOR_TRADE` maps the 35 `SectorId`s to one trade or none (23 mapped, 12 none: banks,
insurance, mining, hotels, airlines, shipping, agri, property, supermarkets, fashion, cosmetics, leisure).
`waveStockFactor(g, secId, year)` reads the sector of a company id or a `~B` share-class line (`companyKey`) and
its exchange's home market; pennies, coins, bonds, savings, gold and property trusts never parse as engine companies
and read 1. The level is folded into the two functions of `invest/shocks.ts`, `shockFactor` (times
`waveStockFactor`) and `indexShockFactor` (times `waveIndexFactor`), so quotes, holdings, stock history, bet
settlement, index options, `marketMove` (every fund strategy and the hedge funds) and the gut agree by construction.
The index tilt is `1 + sum over the stocks listed that year of (L - 1) / n`, clamped 0.5 to 1.5 with
`n = max(4, slotPlan(info).length)`; it reads the listing (`listedSectors`), never `slotPlan`, because a real
company sits in a slot of another sector (P10). Option premiums (`optionPrice`, `indexLogSamples`) take no game
state and are unchanged (S9). The gut's cache key gains `waveSignature(g)`.

The clock. `invest/clock.ts` is a leaf (`marketYearOf`, `marketFamily`, `marketAnchor`, `bookedMarketMove`;
`fund-model.ts` re-exports the first two). From `PRESENT_YEAR`, `economy.exchangeMove(g, c, fiscal)` is the engine's
own move of market year `fiscal + 1`, the year the Stocks screen and the funds show at the birthday that books
fiscal year `fiscal`, from the family seed (an heir's listed company sees the family's market). It carries no shock,
macro or wave term; history years keep their old code. `conglomerate-year.ts` follows because it calls the same function.

The quoted company. A company listed itself, or a division of a listed group, takes the wave through its fundamental
with a stock-grade stamp: `stampWave` writes `{ v, y: fiscal, q: true }` with `v = stockLevelFor` read at
`marketYearOf(fiscal)` (P5; `y` stays the fiscal year, the match key against the last booked record).
`valuationOf` uses the stamp only when `q` is set and `y` equals the last booked year, else the mood is 1 (C-12); an
unquoted company ignores a stock-grade stamp. `industryCycle(g, ind, year, 'stock')` gives deep tech the same grade,
and `waveLines` says `price` instead of `value` for a quoted company. There is no second level on its price. The
price blends half its last price and half a fundamental that now carries the wave, so it closes the gap by half each
booked year while peers jump at once. That lag is deliberate: own buys pay `max(price, fundamental) x 1.03`, so the lag is
no cheap entry, and own-listing keeps spec D12 as written.

The insider rule. `announceWave` takes an optional `by` (the originating asset id), passed by the Heavy R&D launch and every
deep-tech writer (program wins, drugs, the lab's first frontier model, the AI firsts of `claimFirsts` and the chip leap
of `afterYearSilicon`); for a new wave it calls `waveInsiderCases` after the news. In the announcement year, for a
founder (`founderName`, not acquired) or CEO of the player's own company (a hired CEO or a plain owner is no insider),
each listed stock on the player's exchange that is core or supply for the wave's kind, with shares bought in that year
or the year before (`insiderPositions(..., { freshOnly: true })`: open calls, longs, index calls), becomes a case when the
wave lifts it by at least 0.5% and the gain tops `local(g, 1000)`; the three largest stakes win. `openInsiderCase` in
`special/politics.ts` builds an `InsiderCase` (cause `wave`, optional `role` and `note`, id `wave-<hash>`, office `mayor`,
the inert default) and applies the same hidden effects as the other two builders; exposure, the regulator, frozen bets,
held money, give-back and the arrest are the existing code. The case lives in the owner-stamped politics profile, so an
heir never inherits it, and it does not make the player a politician. `INSIDER_WARNING` (a constant in
`tech-wave-data.ts`, so `manage.ts` and `deeptech-menu.ts` never import `politics.ts`) is shown in the Heavy R&D confirm
when the launch would still fall inside the wave window (`heavyStartsWave`) and in the confirm of a deep-tech program
that has a wave.

The tag, the clause and the news. Pure reads of the same numbers: `Quote.wave` (set in `listing`, shown as one row
after the sector row, "Frontier AI wave: sector +12%"), the clause on `marketLine` ("... wave: index +3%") and one news
line a year (`waveNews`, the listed sector with the biggest wave-driven move, at least 3%). Each is dropped when it
rounds to nothing or `anachronismsIn` flags it for a country that trades on the exchange.

Priority 0 notes. C-03 (personal gains omit capital-gains tax): the three new files add no sell, realize or money path,
only a bounded mark (at most 15% a step) that realizes through existing paths; a test reads them and asserts none
calls `addMoney`, `earnIncome`, `realize` or `spend`. C-04 (bond maturity pays the marked price): bonds never reach
a level, and a test holds one through maturity with a live wave. C-12 (stale booked marks): the stock-grade stamp
counts only for the last booked year, and the level does not depend on the order of the yearly hooks.

Not in this release: penny stocks, property trusts, coins, gold, bonds and savings (no wave term), option premiums
that see waves, a per-stock beta (one `STOCK_BETA`), put-side insider cases on disrupted sectors, and Workshop,
race and rival waves as insider origins. Heirs get the waves and the level through the existing validated readers
(`waveWorldFlags`), and `trail`, `nx`, `stock` and `q` are optional, so an old save loads flat and `SAVE_SCHEMA` stays 2.

### Devices and chips (business/devices-*.ts)

`devices` is the 56th trade (last in `INDUSTRY_IDS`, so no existing index moved), the Device and Platform
Company, on the classic product-lines engine so that Heavy R&D and the Products menu work unchanged. It sells
eight dated kinds (`DEMAND` in `product-data.ts`, first years in `ERA_FROM`): Home Computer 1977, Mobile Phone
1983, Desktop PC 1985, Laptop 1995, Smartphone 2007 (it follows the `smartphone` technology curve), VR Headset
2016, AR Glasses 2019 and the Device Operating System 1981 (it follows `homeComputer`). `MARKETS.devices` is a
world market with `network` 1.5. `devices-data.ts` is a pure leaf with no runtime imports: the constants, the
chip rules and `kindReference`, a private table of each kind's market price in 2026 dollars.

One chip source. `chipSource` takes the cut of the own fabs (`FAB_CUT` by fab count, at most 3) and the cut of
one sister (`SISTER_CUT` by its `TechState.stage`, times its `cover`) and the larger wins, own fabs on a tie.
They are never summed. The cut applies to the chip share of unit cost (`CHIP_SHARE` .35), so `chipCostFactor` is
never below .895, and with the dominance saving (`SCALE_SAVING` .10) never below .80. `chipTerms` adds the node,
the yield and the performance bump over the market's chips (`marketNode(year)`, `MARKET_YIELD` .70), and a
quality `lift` of `LIFT_K` .4 per point, at most `LIFT_MAX` 6. Performance has that one channel into demand.
Every function reads `fabs` and `chips` through `readFabs` and `readChips`, because `bizOf` hands out
`a.details` unscrubbed unless the version changed: a damaged value reads as the open market.

Saved state. `BizState.fabs` (integer 1 to 3) and `BizState.chips` (`ChipSupply`) are optional and read by
`normalizeBiz`, which keeps them for `devices` only and drops any bad field. `SAVE_SCHEMA` stays 2, `BIZ_VERSION`
stays 2 and `TechState` gets no field.

Three hooks in `economy.ts`, all pure reads of the business. `costFactor` multiplies in `chipCostFactor` (so
calm plans and hints include it), `evolve` adds `chipTerms(b, year).lift` to the quality target before its
clamp, and `bookYear` adds `fabUpkeep(b)` beside the capacity-line upkeep, so it carries the same finance, CEO
and head-office multipliers.

The fab is a fixed-price capex lever. `fabCost(b, n)` is `FAB_BASE` times `capitalIndex(b)` (the local capital
level against the trade's default) times a sum that rises 35% for each fab already built; it never reads cash,
revenue, valuation or a statement. `buildFabAction(a)` in `manage.ts` builds one: `act` runs `manageBlock` and
`disabled` (industry, `FAB_MAX`, cash), `run` repeats the cash check, asks `boardAllows` (kind `capex`) and
draws no random number. A fab can't be sold, a hired CEO never builds one (`board-ceo.ts` knows only capacity
lines), and it is not equipment: `equipmentValue` ignores it, so insurance, disaster damage, credit limits and
liquidation never see it. The hint comes from `fabGain`, the `bestPlan` profit difference, and says cost only.

The sister path reuses Group Services. In `group-services.ts` the `valid()` chip branch accepts a semiconductor
provider and a devices customer in the same country, both fully owned (`own >= .999`), with the provider at
stage 2 or later, and skips the outlet rule because chip supply amends no tax. `chipBlock` says in plain text
why a pair can't start, and `chipRows`, `chipResultFor`, `hasChipContract` and `chipSupplied` feed the Devices
screen and `groupYear`. `assignChips` runs inside `prepareInternalServices`, behind `groupServicesPrepared`: from
last year's booked statements it writes one `ChipSupply` record per buyer (`cover = the sister's hold x its
revenue / the buyer's chip bill`, the hold being at most `CHIP_RESERVE` and whatever earlier buyers left of the
half the sister may give up, so a small or shared sister can't feed a giant), holds back capacity only for a
sister that is used, and deletes every record not renewed that year. `settleChips` runs inside
`settleInternalServices`, behind `groupServicesSettled`, keyed by the buyer's record and not the contract list.
The saving is already in the buyer's cogs, because `costFactor` read the record before booking. The invoice is
profit-neutral on the provider, exactly as the other contracts book it, and `internalRevenue` eliminates it. All a
sister's invoices share one 25% of its revenue. No cash moves. `groupYear` drops the cross-selling lift of a buyer
only while `chipSupplied` is true: its record is for that fiscal year, the sister is still valid and in the group,
and the sister is still the better source. A contract that gave the buyer no chips leaves the lift alone.

The operating system. `osStrength(b, year)` (0 to 1) reads the best OS line's `effectiveQuality`, so it ages with
the line, and `osPull(base, strength)` is the network pull with `OS_BETA` .9 added to the exponent, never below
the plain pull and never above `OS_PULL_CAP` 3.0. `marketCtxFor` swaps it into `w` for `devices` only, after
`buildCtx` (whose cache stays free of the product list). Rivals keep `network x RIVAL_NETWORK`, a pull of .75,
and a rival with better quality still wins customers back through `edgeOf`. Nothing new is saved.

Spec sheets. `specSheet` (pure) sets the best line of each hardware kind against the rivals that sell it this
year, on performance, quality and price, each a `ScoreRow` from `scorecard.ts` (mean, best, rank and trend).
Rival performance is `devicePerf` at the market's node and yield, rival price is `kindReference x
rivalPriceIndex` (Silicon 2.0), and price is negated so the cheapest ranks first. Rival figures are the market's
and are modeled; no row names a rival. `devicesMenu` renders Devices & Chips with at most 12 rows (header, chip
source, the fab action, one sister row, the platform row and up to seven kinds), reads `readBiz`, `marketCtxFor`
and `fieldFor`, and never writes state or draws `g.rng`.

### Sector families (business/sector-*.ts)

The 18 trades of three families get an Operations Desk on top of the classic engine: food (restaurant, foodTruck,
cafe, bakery), care (clinic, education, gym, salon, petCare, homeCare, autoShop) and util (energy, solar, water,
telecom, dataCenter, farm, logistics). The layer is a sidecar, not a second simulator: `BizState.sector` is one
optional plain-JSON record that `normalizeBiz` whitelists next to `venueOwner` and `wave`, read only through
`readSector` (it clamps every number to its table range and never touches a record of another family or a newer
version). `familyOf(trade)` in `sector-state.ts` is the only door: a trade with no family (devices, deep tech,
finance, venues, the 17 generic trades whose families are still to come) returns null and every sector entry
point returns at once, so the 56th trade needs nothing here.

Four hook points. `prepareSectorYear` (`sector-core.ts`) runs in `yearlyBusinessImpl` right after
`prepareVenueYear`: the first fiscal year only measures and saves the record, so that year books exactly as before;
afterwards the family's `effects` move only `demandShock`, `costShock`, `capacityLoss` and `openFraction`, inside
`SECTOR_BOUNDS`, and book money through `bookIncome` and `bookCost` (cash and `yearIncome` or `yearCosts` together,
so `bookYear` counts it once). `maybeSectorEvent` runs before the generic owner events and takes the one event slot
of the company-year; `sectorOwnsEvent` (called from `weightFor` in `events.ts`) switches off the generic inspection
and critic for a food company with a live record. `sectorMenu` (`sector-menu.ts`) is the desk in `businessView`,
and `applyLever` is the one write path for the owner and for a hired CEO: `sectorTurn` (`sector-ceo.ts`, called from
`smartManagerTurn` in `board-ceo.ts`) works the desk above `SMART_SKILL`, at most two changes a year. Each trade also
gets one extra key role through `withSectorRoles` (`sector-data.ts`), which wraps the raw trade table in
`industries.ts` (`INDUSTRIES = withSectorRoles(RAW_INDUSTRIES)`) and returns every other trade untouched.

Family files (`sector-food.ts`, `sector-care.ts`, `sector-util.ts` with their `-play` files) register a model in the
registry of `sector-kit.ts` through the barrel `sector-families.ts`. `sectorEffects` has two modes: `book` reads the
year's draws and `expected` never reads past the year being lived, so hints, previews and the CEO match what the
resolver rolls. A draw is a hash of life, company, year and salt (`seasonIndex`), never `g.rng`; the only `g.rng`
draws are the event roll and branch roll in `sector-events.ts`, never in a menu or a pure read. Real history that the
engine's exposure map leaves out (the 2020 crash for clinics, schools, pets, home care and bakeries) is a row in
`SECTOR_HISTORY`. Spec: `docs/superpowers/specs/2026-10-19-sector-families-design.md`.

### AI lab benchmarks (business/ai-bench*.ts, scorecard.ts, deeptech-bench.ts)

An AI lab is scored on eight capabilities (language, coding, vision, speech, reasoning and math, agents,
robotics control, science), each with a **rating**: an integer where 100 points is one doubling of odds
against a test. `ai-bench-data.ts` holds the capabilities (weights, the era and delay that open each, and
stylized anchors up to 2026); `ai-bench.ts` is the roster-free formula layer. `capBest(fam, cap, year)` is
the best rating in the world: linear between anchors up to `PRESENT_YEAR`, then a seeded drift keyed
`${fam}|aicap|${cap}|${year}` that slows over time. `benchScore` turns a rating into a 0 to 99 score on
one **benchmark generation**; `benchHard` starts the first test with the best lab near 67 and retires a
generation, making the next 300 harder, once the best lab would score above 90 on it. A score can
therefore fall while a model doesn't change, so cross-year comparisons use ratings, never scores.
`scorecard.ts` (`scoreRow`, `scoreText`) is a pure, import-free leaf shared with Silicon 2.0: your figure
against everyone else's, with market mean, best, rank and trend.

The rival board (`ai-bench-market.ts`) is built from the existing `aiLab` roster: `rosterOf`,
`activeRivals` and `rawPull` pick the labs on the world market (a lab is on the board at a tenth of the
strongest pull), each lab's rating in a capability is `capBest` minus a gap from its pull and a seeded
specialty (`aiLab|${id}|${cap}`), and the top lab sits exactly on `capBest`. Real labs carry `modeled`.
Boards and capability fronts are cached in bounded maps. **Catch-up** is part of the lab's standing, not
the market: from two years after a released model (one for open weights) every rival rises by the same
amount so the best rival is within 70 points of it, so a lead is earned and fades. `labLead` is the cheap
read (composite rating minus the best rival's), `labStanding` the full one with a `ScoreRow` per capability,
and both read `bestModelAsOf` (the strongest unheld model by that year). Every function takes its year;
only `benchYear(g)` (the last closed fiscal year) derives one, and menus, the Annual Report note and the
profile line use it.

Training and demand. `trainWin` keeps its single roll. For a lab in 2012 or later it asks `modelRating`
(shared with the research hint) for each open capability: `capBest - 320` plus level, generation, compute,
20 per research level and a seeded model specialty, with no model leading its own year's best by more than
90. A lab with no `fam`, or a year before 2012, or a model with no rating keeps the old frontier formulas
untouched. `ProgCtx.rival` hands `trainWin` the best rival of the year without it importing roster code.
`labLead` drives `competitiveness` (`1 + lead / 190`, clamped) and the premium; `demandScale`, the pitch
odds and the pitch hint read the same number.

Research tracks. `capProgram(cap)` builds one program per capability (`cap.<id>`: two years, odds 0.65,
cost `3M x 1.4^level`, `ipShare` 0.3, no `unlocks`). A finished track adds a research level that every
later model uses. A track is gated on a rated model that covers the capability, `programBlock` allows
`max(1, floor(maxPrograms / 3))` at once (`trackLimit`), and `bestProgram` never picks one, so the general
manager and the Lab Report never start research. The Benchmarks menu (`benchMenu`) holds the Research
submenu, and the lab menu points to it.

Firsts and held models. Three milestones per capability sit above the 2026 market (`capMilestone`,
`marketYear`). `claimFirsts` runs when a model is released and records `${cap}.${k}` in `flags.aiFirsts`
(at most 24, validated by `readAiFirsts`, carried to heirs by `benchWorldFlags`), once for the whole
family and only before the market passes it, with a log line, hype, brand and a wave. A model held at
release is stored as `held`: it sells nothing, claims nothing, never counts for catch-up, and has its own
release action. `deeptech-bench.ts` builds every line (rows, series, firsts, the Compute & Models line, the
report note, the profile clause) so the screens share one source; menus read state and never draw the
dice. New saved fields (`rating`, `held`, `caps`, `firsts`, `flags.aiFirsts`) are optional and normalized by
`readModel`, `readTech` and `readAiFirsts`, `TECH_VERSION` is 4 and `SAVE_SCHEMA` stays 2.

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

Business growth has no hard caps; costs and diminishing returns are the limits. Product R&D (business/rd.ts): projects in BizState.rd (optional, so old saves load) are paid up front from company cash and booked as yearCosts. Every idea has a fixed development cost, rdCost(b, idea): RD_BASE scaled by a typical site's yearly sales in the home city (^0.75), the sort of line (KIND_COST) and the size of its kind's market — never the company's own cash or sales; the slider (rdRange) runs from RD_MIN 0.5× to RD_MAX 4× of it for every company. rdQuote(g, b, idea, budget) gives odds, whole years (1-4), the expected line quality (rdQuality: company quality, CEO, quality staff, talents and budgetQuality(k), fast gains then diminishing) and the quality of the rivals' versions; a team runs rdSlots(b) = 1 + ⌊log2(1 + sites)⌋ projects without strain, more crowd it (rdCrowding). rdValue values a line over 8 years with its kind's demand path, aging and pullValue (what a pull multiplier wins in the market model). Projects advance and resolve in economy.evolve → advanceRd: a launched line gets launched = year + 1 and a quality rolled within ±8 of the quote (+10 for a 15% hit). There is no yearly cap. Heavy R&D (business/heavy-rd.ts, heavy-data.ts) is the rare breakthrough every product company can work on (heavyEligible: not deep tech, finance or a game studio, so 40 trades): five catalogue entries per trade (heavy-data.ts BREAKTHROUGHS), a fixed price HEAVY_COST_X (8) times the first classic idea's development cost, 4 to 6 years, odds 55% of a normal launch's (8 to 60%) and a 5-year wait after a launch or a flop. A project is an RdProject with heavy: true in BizState.rd; startHeavy pays it up front and advanceHeavy, called from advanceRd, rolls it at year end (the only g.rng draw of Heavy R&D). A launch leaves one HeavyRecord per kind and market in g.flags (key 'heavy.<trade>|<market>', at most 12, checked field by field on every read), and three pure readers use only those records and the year: heavyLevel (the kind's demand curve), heavyArrival and heavyVersionQuality (the rival arrival schedule: the launch year plus the development years times a size lag, a year later for half the rivals, a version a little under the pioneer's and never above it) and heavyPulse (the lift on the market's potential, at most +40%). heavyArrivals reports the first rival to follow once in the life log. Product ideas come from business/products.ts productIdeas: an endless, era-filtered stream of classics, then variants, then next generations; a classic is offered only once its kind exists in the market (product-data demandLevel), topped up with TIMELESS and PERIOD_CLASSICS. Product markets (business/product-market.ts, pure): a line belongs to a kind (lineInfo/infoOf: family, kind, gen; stored on lines since 2.3, parsed for old ones); kinds follow real-history demand curves (product-data.ts: first year, mainstream year, size, peak, what is left, fall speed; or a technology's adoption), adopted later in poorer countries. Rivals offer a kind once it has caught on (rivalVersion: big rivals first, each at its own quality, deterministic hashes; some specialize and never take up a kind), so fieldOf gives each kind's offer share and pull-weighted quality (attached to MarketCtx.field by economy.marketCtxFor). productPull: each line's pull = SEGMENT · size · demand level · KIND_WEIGHT · edgeOf (2^((quality − field)/20), plus up to NOVELTY +80% while few rivals offer it); kinds stack one for one, a kind's other lines count half (capped at 1.8× its best), and the range is linear up to +80% then saturates toward RANGE_CAP; appealOf multiplies the company's pull by 1 + total. applyProductRivalry decides who pays: rivals whose version of a kind is worse than yours lose pull to those whose versions hold up, with the rivals' total unchanged. Line quality is fixed at launch and ages against the rivals' improving versions (effectiveQuality: 0.5-2 points a year by style, at most 30); old lines without one get qualityFromBoost(boost). complexityShare(n) = 0.002·n·(1+n/20) of net sales booked inside the Upkeep line, rangeBrand(n) capped at 16 brand points, lines retire after PRODUCT_LIFE = 30 years; retireOrder puts the weakest first. Buy-outs (competition-moves acquireRival) hand over the rival's product lines (rivalLines; better versions replace yours), its sites spread over the country's biggest cities (spreadSites), part of its quality lead (KNOWHOW 25%) and some brand. Storage guards: 400 products, 120 projects.

R&D 3.0 (business/lab-*.ts): the R&D between a new product line and a breakthrough, for every product company (heavyEligible), as one optional record, `BizState.lab`, plus a trade tier table and a per-trade ageing table. Pure rules and values are in lab-rules.ts, constants and tables in lab-data.ts, the stored state and its readers in lab-state.ts, bookings and actions in lab-year.ts, every string in lab-text.ts and the Research & Operations screen in lab-menu.ts.

- **Tiers and ageing.** industries.ts `RD_TIER` gives all 56 trades low (21), mid (13), high (10, the devices trade among them) or breakthrough (the 12 `DEEP_TECH_IDS`); `rdTierOf` reads an id that is not a trade as mid. Breakthrough trades keep their own lab, so they have none of what follows. products.ts `AGEING` (`ageStyleOf`) gives every trade an ageing style: the 27 ids of `STYLE` keep theirs (devices stays goods, so its operating system still ages 1.2 points a year) and the other 29 are set on purpose (goods 1.2 points a year for 9 trades, tech 2 for 5, service .7 for 15). `effectiveQuality` reads it (still at most 30 points); `STYLE` and `styleOf` stay because they choose idea names.
- **State.** `BizState.lab` is optional JSON. `readLab` normalizes it and returns a frozen object cached by identity (an absent or wrong-typed value reads as one shared empty state); `saveLab` replaces it whole and writers take `draftLab`, never mutating in place. It holds a level and a win count for each track (cost, yield, quality), the programs under way, the scientists' hire years, the patents, the families ever patented, the grant due, the last year booked and stepped, and a four-year ledger. Bounds: 3 programs (one per track), 6 scientists, 6 patents, 40 filed names, 4 ledger rows, 9 `done` ids, 12 wins counted per track, family names of at most 80 characters.
- **Operations R&D.** Nine programs, named the same in every trade (three tracks, three rungs, first years 1905 to 1995); a low trade is offered rungs 1 and 2, mid and high 1 to 3. The price is fixed per trade and rung, `roundBudget(RD_BASE x rdSiteScale(b)) x RUNG_X` with `RUNG_X` 1, 2.2 and 4.5 (`rdSiteScale` is the site-sales term of `rdCost`), and never reads the company's cash, sales or valuation. Years are `ceil(baseYears x [1, 1.5, 2])` from 1 to 4; odds are `0.9 x launchP` plus the tier's ease (low .25, mid .20, high .12) less 0, .05 or .10 by rung, held between .15 and .92. A win lifts the track's level by `(1 - level) x [.30, .40, .50] x 0.8^wins`, to at most .95, and a level fades 5% a year, so the benefit is a cost to keep. The level reaches the company through `opsEffectsOf`, which `businessEffects` adds to its sums before the old clamps (cost .65 to 1.5, demand .7 to 1.65, capacity at most 1.4): unit cost at most 5, 8 or 10% lower, output at most 6, 10 or 10% higher and demand (a quality system) at most 4, 5 or 7% higher by tier. A flop loses the price, a win starts a 3-year wait on that program, one program runs per track, and `opsBlock` gives the single reason a start is refused. `advanceLab` runs from `advanceRd`, guarded by `stepped`, and draws one `chance()` per finished program in track order (cost, yield, quality): the only `g.rng` draw of the lab.
- **Credit, grants and the ledger.** `bookLabYear` runs in `yearlyBusinessImpl` right after `bookHedgeYear`, guarded by `booked`. It pays the R&D tax credit on what was started in the fiscal year (`round(min(250,000, spend x the country's RD_CREDIT rate))`, the deep-tech rate, at most .5), a grant earned by a finished program (`LAB_GRANTS`: ten country rows, only for a company of at most 25 sites and 3 or more years after its last grant, at most half a program's price counting the credit) and royalties, and charges the team's pay. Credit, grant and royalty are `b.cash` and `yearIncome`; payroll is `b.cash` and `yearCosts`; `bookYear` counts them without moving cash again. Each amount has a `LabRow` field and a statement line ('R&D tax credit and grants', 'Patent licences', 'Research team', taken out of Other income and One-off costs). `valuationOf` leaves the credit, grant and royalty (after tax) out of its profit average and adds `labValue`, the patents' book.
- **Research team.** Scientists (cap 2, 4 or 6 by tier, none in a breakthrough trade) cost `teamPay = roundBudget(2.2 x the local wage)` a year, half of that to hire or let go, with 3 years' minimum service. Each adds 0.7 of the one before to a power (1, 1.7, 2.19, 2.53, 2.77, 2.94) that `launchP` multiplies by .03 inside its clamp, and `rdSlots` gains `min(2, floor(n / 2))`. A scientist is not key staff, so the key-staff cap and the quality target are untouched.
- **Patents and the shield.** `patentBlock` lets a company patent a family it developed itself and launched in the last 3 years, once ever per family, while no rival sells it (`offer` at most .02 in `fieldFor`) and with at most 6 live; a low trade may patent only a Heavy breakthrough. `patentTerms` gives a fixed plan price (the breakthrough's record cost, else `rdCost`), a fee of .12 of it plus the country's filing fee, a shield term of `max(2, round(SHIELD[tier] x the country's enforcement))` years (low 3, mid 6, high 5) counted from the launch of the company's own line of the family (the oldest within the 3 years; from now when it has none), so `until` is the same whenever it is filed and `years` is what is left of it (at least 1), and a book of .6 of the plan that fades x.9 a year. The shield works through the field: `fieldOf` takes a sixth argument, `FieldMarket { industry, shield }`, which is part of the cache key, and in `makeField` a held family keeps its existence and level but no rival or fringe offers it (offer 0, par quality, versions -1) while the shield lasts. `fieldMarketOf(b)` builds it for `marketCtxFor`; `heavyArrivals` holds back the first-rival report of a held Heavy family and the Products row's lead date names the shield's end when that is later. Licensing is one way: `lic` is the next year and the shield ends then. A licensed patent pays `min(capLeft, round(.30 x plan x offer x level))` each year until it runs out, at most 1.5 x plan over its life, and only while rivals really sell the kind.
- **Rival rise.** product-market.ts `riseOf` adds to a classic rival's version for every year it has sold the kind: `RISE_BASE` by tier (low .20, mid .30, high .45, breakthrough .60 points a year) x `RISE_SIZE` by rival size (giant 1.3 down to small .7) x a hash factor from .6 to 1.4, at most 8 points over 12 years, rounded to a whole number and at most 99. A Heavy kind rises from its arrival and never passes the pioneer's quality. A field built without a market has no rise and no shield. Pure, by hash: no `g.rng`.
- **Hints and the hired CEO.** `opsValue`, `teamValue` and `patentValue` are pure expected values over the same eight-year horizon and discount as ordinary R&D. The screen (group `biz.lab.<assetId>`, after Products in `businessView`, or after the Devices & Chips menu on a devices company, which keeps its place right after Products) shows them as Business-talent hints cached per company state. `bestLabMove` picks the hired CEO's move; board-ceo.ts `productTurn` makes up to `LAB_PER_YEAR` moves (growth 2, balanced 1, profit 1, cash 0, a cost-cutter may add one cost program), each paid through the board's budget and reserve, and calls the CEO's `judge` only for a candidate whose exact value is above 0.
- **Invariants.** `SAVE_SCHEMA` and `BIZ_VERSION` stay 2 and `lab` is the only new saved state (no world flag). `doOps`, `doPatent`, `doLicense`, `doHire` and `doRelease` re-find the live company and check `manageBlock`, their own block reason and `boardAllows` themselves, so a direct call or a restored menu cannot skip them. A year is booked once (`booked`) and stepped once (`stepped`). Menus, hints and quotes never draw `g.rng` or write state. Every price is fixed per trade, never by cash, sales or valuation.

Outlets: open and close are sliders up to what company cash pays for (manage.maxAffordable), with no per-year limit. economy.planFor applies city crowding (citySaturation = country saturation × city weight: 0.12 for the first-listed city, 0.07 for the next two, 0.04 otherwise, minimum 6; demand per outlet × (cs/n)^0.5). bookYear adds densityRent (1 + 0.35·sqrt(n/cs − 1)) and head-office overhead headOffice(n) = 0.015·log2(1 + n/8) of running costs. The deep-tech sim applies the same density rent, head office and range costs. Capacity lines (industries.CAPACITY_LINES; BizState.lines, optional; read with economy.linesOf): each adds LINE_CAP = 0.5 of a home site's capacity for LINE_CAPEX = 0.45 of its capital, plus upkeep and LINE_RENT. They count in equipmentValue (insurance, valuation floor, credit) and sell back for 35%.

Repeatable levers: equipment upgrades and training cost (1 + 0.5k) times as much and gain 1/(1 + 0.5k) as much, where k = times already done this year. Key-staff interviews have no cap; each round costs a headhunter fee (6% of the role's pay, ×(1 + 0.5k)). Marketing budget (0–300%) and pay (70–150%) are continuous sliders; a pay cut cancels that year's raiseYear credit.

Deep tech: deeptech-rd.maxPrograms = 2 + floor(log2(sites)) + (Series B or later) + (listed), clamped to 2–8 (readTech stores 8). programTerms(k) funds a program at 0.5–3× its plan: years ÷ k^0.55, failure odds × k^−0.35, cost × k. Every industry has a 'nextgen' program, open at the top stage, costing 1.35^n more each time with shrinking gains and ipShare 0.3. On success, patents book min(spent, planned budget) × ipShare (1.2 by default), so crash budgets can't pump the valuation. Fabs, GPU clusters, gigafactories, gigalines, biologics plants and SOCs have no count caps (rising cost, PLANT_MAX 200). AI training continues past 10 generations (modelGens). Satellites go up to SAT_MAX 40 with saturating revenue (satUnits). Venture rounds ask for a stage (deeptech-funding STAGE_FOR) or yearly sales; a trade with its own ladder sets DeepTechDef.seriesStage and is held to it, with no sales route and no Series B shortcut (only fusion does: its sales start after the pilot plant). A program with `unlocks` in deeptech-data (it raises the stage, or the next rung needs it first) counts five times in deeptech-rd.programScore, which ranks what the general manager and the Business talent start; a function there means it only counts while the lab is small.

Studios: gamestudio.maxPipeline(b) = max(4, floor(developers / 12)) games in development at once; team size, hiring and layoffs are sliders.

Business-talent hints: rd.bestRdBudget (grid plus the budgets where a project gets a year shorter, rounded up), manage bestCount (outlets maximizing 5-year gain minus cost), bestLines, linesToRetire, the best marketing level, staff.bestPay. All are computed with bestPlan/bizWorth and never consume g's RNG.

`MenuInput.unit` writes a unit after a non-money slider's number ('%' for budget and pay sliders).

Spending past the board's yearly budget (opening sites, capacity lines, product R&D) goes through
`board.boardAllows` with a `capex` proposal, and the sliders' captions add `board-menu.capexCaption`.

## Boards and hired CEOs (business/board*.ts)

- **When a company has a board.** When anyone else owns part of it (BizState.share < 0.999), when it is listed, or when a conglomerate claims it. Groups register through board-state.registerGroupBoard; their people fill the owner's seats.

- **Where the state lives.** Governance is plain JSON in BizState.board. Use board-state.readBoard for menus and boardOf for actions and yearly hooks; old saves get defaults. It holds:
  - directors, each with a seeded local name and stance (growth/profit/caution) and loyalty. Seats follow ownership through seatPlan/syncSeats, which never touch g.rng: owner seats ≈ votes (`share-classes.ownerVotes`; the same as the share with one class), investor directors, and at least two independents once listed;
  - the mandate (growth/balanced/profit/cash);
  - the limits: a yearly capex+R&D budget as a share of company value, a cash reserve in months of running costs, and a CEO pay cap as a multiple of career.ceoPayNorm;
  - recent votes, patience/misses/warnings, CEO churn, the CEO's last letter, and any rogue scheme.

- **Votes (board-vote.ts).**
  - Proposals: ownerPay, bonus, ceoPay, dividend, capex, debt, sell, ipo, merge, recap, close, fire, hire, takeOver, mandate, limits.
  - assess() gives the merit to all shareholders and how much the proposal favours the owner (self-dealing); each director gets a yes probability from that, their stance and their loyalty.
  - passOdds() is the exact probability vote() rolls; the Business hints use it.
  - needsVote()/boardAllows() gate actions. The player is held to the same limits as a hired CEO.
  - On a listed company the independents veto blatant self-dealing, and minority shareholders can sue over self-dealing that passes (the excess goes back to the company).
  - Payouts never exceed payableCash: cash minus debt minus earmarked game money.

- **Smart hired CEOs (board-ceo.ts).** Above career.SMART_SKILL (75), a hired CEO:
  - plans with economy.bestPlan, with mistakes of ±0.06×(100−skill)%;
  - tunes pay, marketing and supplier by value, one notch a year;
  - hires and lets go key staff;
  - retires lines that cost more to run than they win and funds the best R&D projects (rd.ts bestRdIdea);
  - closes loss-making sites and opens sites or capacity at the mandate's payback and growth pace, within the budget and reserve;
  - repays expensive debt and pays dividends under the cash/profit mandates (`payoutTurn`; while the
    owner has set a yearly dividend rule, `payoutTurn` returns at once and the rule pays instead, see
    "Yearly dividends");
  - writes one letter a year (career.ceoLetter).

  At 75 or below they keep yearly.autoPlan, tilted by style. Deep-tech managers (deeptech-manager.ts) and studio managers (gamestudio.studioManagerTurn) have their own versions of the upgrade. The what-if evaluators (bestOpening, bestLines, bestClosure, bestRdWithin, outlook, mandateScores) are pure and shared with the hints.

- **Corporate finance leaders (finance-leadership.ts).** A real bank or investment firm (recognized
  by its `financeFirm` books, not an industry label alone) gives new CEO candidates an optional
  specialty, approach, risk posture and bounded prior-career record. The profile is generated once
  from a local deterministic stream, stored with the Manager, normalized by `state.readFinanceProfile`
  and read safely even from a malformed current-version object. Old managers without one retain their
  raw skill exactly. A profileless direct appointment gets one deterministic target-specialist profile
  when installed; an existing profile is never regenerated. `financeLeadershipSkill` applies a modest
  specialty/record adjustment inside the bank and investment-firm models only. A synthetic `groupBiz`
  has no finance books and therefore keeps a generic group CEO; any industry-labeled object with no
  `financeFirm` record stays generic by design. Finance firms are explicitly excluded from the generic
  price/production optimizer and mandate outlook.

  An investment-firm CEO runs asset-manager, hedge-fund, brokerage and VC fundraising levers under
  the stored board mandate. Growth, Balanced, Profit and Cash change the decision horizon, risk
  penalty, company co-investment and client-campaign budget. Asset and hedge decisions also use the
  stored approach and risk posture. The CEO uses the same honest outlook functions as the player's
  hints and never reads a future market result or `g.rng`. `fund-actions.fundLeverBlock` enforces
  delegation inside every operating action as well as the menu. VC pitch, diligence and follow-on
  choices, an owner-inventor's algorithm and confessing to regulators remain explicit owner powers.
  `FundState.decisionYear` makes the post-book plan idempotent and preserves it through the next
  pre-book pass. That post-book pass writes one concise decision letter through `career.ceoLetter`;
  detached group forecasts cannot write one. Banks use the specialist skill adjustment and retain
  their existing CEO lever lock; bank-specific mandates and letters remain future work.

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

`business/executive.ts` adds bounded skill-scaled execution, gradual quality/morale/brand improvements and pre-booking turnaround planning for elite operating-company CEOs. Managers retain optional equity/equityAsked/groupEquity fields through normalization. A non-shareholder with skill 85/90/95 asks for an initial ownership-equivalent grant by seat (`business/executive-shares.ts` EQUITY_TIERS): a conglomerate's own CEO 2/3.5/5% (the only seat that reaches 5%), a standalone company's CEO 1/2/3%, a division's CEO 0.5/0.75/1% of the group's holding in it (paid in group shares by automatic retention); warning after three years, departure two years later. `state.hasExecutiveShares` recognizes any positive vested company or group stake (not retention credit alone). A shareholder never voluntarily resigns or retires; dilution and skill growth do not trigger top-ups, and yearly retention clears legacy departure deadlines. `board.ts` also blocks rival poaching and raise-refusal departures (including old queued popups), and its raise hints no longer price in a shareholder walking out. Family shareholder CEOs also remain despite estrangement, moving abroad or passing head-office retirement age. Grants transfer ownership, never mint cash; group grants update all look-through stakes, division grants reduce the controlling group's holding, and automatic retention uses value-weighted group awards to preserve subsidiary cash pooling. A CEO who leaves anyway (dismissed, replaced, the owner takes over, death) gives the shares back to the founder: standalone companies settle in career.installManager/becomeCeo/syncCeo and the yearly hook (executive-shares.returnFormerExecutiveShares), divisions and group CEOs whenever their group is saved (conglomerate-state.settleGroupExecutives: a division's own grants return to the group's holding, group awards to the player's group stake, with the cost basis), and the company screen's CEO changes settle at once (settleAfterCeoChange). A company leaving its group (spin-off, wind-up) leaves the group executives' seats: their slice of it returns to the founder (conglomerate-state.stakeOnLeaving/returnExecutiveSlice), except its own CEO's group shares, which `detach` converts into shares of that company. Groups where the player holds no shares return nothing to the player. Loyalty does not override owner/board dismissal, death or ordinary company failure. Automatic group recruitment filters out division candidates below the group CEO's rating.

`invest/liquidity.ts` integrates an exponential order book for share sales; stock, penny and crypto buys use its cash-denominated inverse. `liquidity` shocks update shared quotes and holdings (including immediately repricing foreign holdings), coalesce per security/year, and do not fade into a predictable rebound. Gameplay depth is not live market data. Splitting orders cannot remove impact, and immediate buy/sell round trips conserve value before fees and tax. The player's own net buying (`orderFlowFactor`) lifts the shared quote but never the player's own position: holdings are marked, paid dividends and bought out at the quote without it (`Asset.details.flow`), and single-stock options and coin bets settle without the player's order flow after the bet was placed. Owned-company and group share sales use the same sale curve. Receipts and sale estimates distinguish market impact from fees and taxes.

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
  (`manage.ipoDueDiligence`) or any division of a group (`groupIpo`). The player picks the float
  (5–60%, 25% default) on a slider; `business/share-structure.ts ipoPlan` prices it: new shares at
  the pre-money value over the share count (a private `BizState.shareCount` chosen at founding or
  in Capital & Ownership, else about $25 a share), with coverage from `retailAppeal(price)` (an
  affordable price brings retail buyers; penny-stock and very expensive prices put them off), the
  float size and the market's `listingMood`. Oversubscribed offers price up to +15% and pop more on
  day one; undersubscribed ones sell only part, at a discount. Later share sales get a market
  depth of `retailDepth(price)` (1 at $25). Selling out of a listed company or group where
  relatives hold family shares (`exit.leaveListedCompany`, `conglomerate-actions.leaveListedGroup`)
  removes it from the player's assets and turns each relative's stake into their own wealth at
  market value (`dynasty-ownership.cashOutFamilyHolders`); the yearly pass cleans up listed
  holdings already at 0% (`yearly.leaveUnownedListed`).
- **Share classes** (`business/share-classes.ts`, `share-classes-menu.ts`, `invest/class-data.ts`): the
  player's company can list with founder shares or a non-voting float, and a few real companies show the
  classes they had.
  - **One pool, derived votes (D1).** Economics stay one number, `BizState.share`. Votes are derived by
    `share-classes.ownerVotes`, which is `b.share` exactly when there is no live record. `board-state.seatPlan`
    is the only place a stake becomes seats and it reads votes, so every board decision, firing rule and
    "you'd lose control" line follows them (`controlsFor` is the rule, `own-trade.controlsWith` delegates to
    it). Board size still follows economics. `test/control-sites.test.ts` lists every other place a share
    meets a half and classifies it (economics, a group, who profits); a new one fails until someone does.
  - **The record (D2, D3).** `BizState.classes?: { kind: 'ab' | 'nv'; hi }` (optional, whitelisted in
    `normalizeBiz`, read through `readClasses` because `bizOf` does not re-normalize a current record). `ab`: the
    founders' class has 10 votes and the public's 1. `nv`: the founders' 1 and the public's 0. `hi` is the
    part of the whole company the owner holds in the founders' class, clamped to the stake when read; relatives
    hold the founders' class, executives and the float the ordinary one. A writer that adds shares and has
    never heard of classes (a Stocks buy, Buy Out Investors, an agent's buy) therefore adds ordinary shares,
    which is the safe answer. Only three writers keep `hi` in step: `diluteBusinessEquity` (scales it),
    the buyback in `rescue.transactEquity` (`scaleFounders`) and `exit.sellShares` (`clampFounders`). A stake
    can also shrink with no sale (a hired CEO's equity grant, an inheritance) and leave `hi` above it, so the
    two writers that add ordinary shares (`own-trade.buyOwnShares`, `rescue.transactEquity`) cap `hi` at the
    stake held first (`clampFounders`), and the buy quote and preview read `foundersCapped`: shares bought
    never bring a lost stake's founder votes back. An estate that splits a listed company's stake
    (`dynasty-ownership.inheritConglomerates`) keeps the founders' class as a whole (`foundersWhole`,
    `keepFoundersWhole`): the relatives' shares hold it by rule, so the heir who takes the company keeps
    what is left of it, and a sole heir keeps the record as it was.
  - **Only while listed (D4).** `activeClasses` returns the record only for a public company that stands
    alone and has shares. A private company's record is the plan its IPO will use, and `conglomerate-state.detach`
    clears it when a company comes out of a group and lists. Groups and divisions have none.
  - **Choosing (D5, D6).** The Share Classes rows (`classesNode`) sit under Capital & Ownership and beside Go
    Public. A private company sets its plan for free, any time. A listed company asks its board once a year
    (the `'recap'` proposal, merit +0.3 for one class, -1.0 for `ab`, -1.3 for `nv`; the year key is
    `classes.<id>`; a refused recap does not use up the `'merge'` slot), converts the owner's whole stake to the
    founders' class and re-seats the board. The market pays 4% less for `ab` and 7% less for `nv`
    (`CLASS_DISCOUNT`): `ipoPlanFor` scales the pre-money value, `updateSharePrice`, the Stocks buy floor and
    `rescue.equityQuote` (so a Capital & Ownership move doesn't re-mark the price) carry `classFactor`, and a
    recap moves the price once by the difference. A payout (`board-menu.payOut`, which the manual dividend
    and the yearly rule both end in, and a hired CEO's cash payout) and the buyback and new-money lines of
    `transactEquity` move the price by the cash times `classFactor`, so it lands on the structure's price and
    the yearly update has nothing to heal. `classOption`, `ipoPreview` and the
    row subtitles call the same functions the action runs, never `g.rng`.
  - **Real companies (D8 to D10).** `invest/class-data.ts` is a curated table (21 companies, each row from a
    public source named above it) of the classes a company had by year. The company's Stocks screen gets a
    "Share classes" line from it. A listed extra class (12 of them) is a line inside that screen with the id
    `<company id>~<letter>`: its price is the company's times `1 + spread` (`lineSpread`), with no new draw,
    so it splits and ends with the company by construction (`lineYear` maps a `SecYear`). A line's own last
    year cashes the holder out as delisted. Lines are not in `allQuotes`, `stocks` or `investmentListing`
    (they hang off `Quote.lines`), so the row counts and the unique-ticker tests stay as they were; look
    them up through `quotesWithLines`.
  - **`companyKey` (D9).** `invest/engine.companyKey` strips a line's `~X` suffix. `isRealSecId`,
    `breakthroughStockFactor`, `shockFactor`, `addMarketShock` (every cause but `'liquidity'`),
    `pruneShocks` and `politics.insiderPositions` use it, so one company is one security for news, inventions
    and insider cases. Order flow stays on the line that was traded. Anything that groups holdings by company
    (hedge funds, an advisor) must call `companyKey`; nothing enforces it until it does.
  - **Old saves.** A save without `classes` plays as before (`ownerVotes === share`, `classFactor === 1`; the
    golden tests pin `seatPlan` and `ipoPreview`). A damaged record reads as one class. A save holding a
    line whose data later goes cashes out as delisted at the last price, like any unknown id.
- **Your listed companies in Stocks** (`business/own-listing.ts`, `listing-id.ts`, `own-trade.ts`,
  `own-listing-menu.ts`): a company you've taken public shows in Investments › Stocks as a view and a
  trade door over the business.
  - **Not a security (D1, D2).** The row is never an investment Asset, because a second Asset on the
    same shares would count twice in net worth, in an estate and in Sell Everything. It is never a
    `Quote` either. `own-listing-menu.ts` builds it as its own node and hands it to `investments.ts`
    through `registerOwnListings`. `ownListings` is pure (no writes, no `g.rng`), so rows, previews and
    limits can be rebuilt on every render, from a deep-frozen state.
  - **Where it sits (D8).** `listing-id.listedExchange` finds the exchange from the company's own
    country and its stored exchange code, never from where you live (codes repeat: TSE is Tokyo and
    Tehran). On that exchange's list the row is the first in its tier. Anywhere else, or on a list with
    no size headings, it goes in a "Your listed companies" block at the top, with the exchange named.
  - **Tiers (D7).** `capTier(b.valuation)`: Mega-cap from $200B, Large-cap from $10B, Mid-cap from $2B,
    Small-cap below. They are fixed, in constant-2026 dollars, with no inflation step.
  - **Buying (D3, D4).** `own-trade.buyOwnShares` is a market purchase from the public float. It pays
    the larger of the share price, the market cap per share and the fundamental value per share, plus
    3%, plus an order-size premium (`buyImpact` with `retailDepth`). It never writes that impact into
    `BizState.sharePrice`, so a buy can't pump your own stake. It takes at most 15% of the company a
    year and never the last 1% of the float. The cash paid goes to `b.invested` and `b.share` rises. It
    isn't counted as `investTrades` or `moneyInvested`. It shares `rescue.equityYearKey` with all three
    Capital & Ownership kinds, which is the one move a year for the company: a Stocks buy also uses up
    Put In More Money and Company Buys Back Shares, and either of those uses up a Stocks buy.
  - **No control needed.** A Stocks buy needs no board control and holds no board vote, because it is a
    market purchase from the public float. It is how a founder who holds under half after the IPO wins
    control back, and its preview says "This gives you control of the board." when a buy crosses 50%.
    Buy Out Investors still needs control and a board vote (`rescue.ts` `block` and the `boardAllows`
    call in `transactEquity`). The Stocks door stays free of `g.rng`.
  - **Selling.** `own-trade.sellOwnShares` is Exit › Sell Shares: the same `exit.sellShares`, tax and
    price impact, and the same two sales a year (`shareSaleKey`, `SHARE_SALES_PER_YEAR`, also used by
    `manage.ts`). `sellNote` previews it, and says so when the sale would cost you control of the board or
    sell you out. Selling out, or going under 0.5%, removes the company through `leaveListedCompany` and pays
    relatives once. The preview judges the stake as stored (`own-listing.rawStake`), so a stored 0.6%
    isn't read as the 1% that `normalizeBiz` floors it to.
  - **State.** `BizState.ticker` (4 capital letters, from `listing-id.newTicker`, unique among the
    exchange's registry and first-generation tickers and your other companies on it) and
    `BizState.ipoPrice` are set by `goPublic` and `detach`. Both are optional and checked in
    `normalizeBiz`. A save without a ticker gets one derived on read (`tickerOf`), the same each time.
  - **Groups (D10).** A listed group gets one view-only row: its market cap, your group stake, its
    exchange and tier. It has no ticker and no Buy or Sell, and its divisions get no row. A group is
    traded from its own screen (`sellGroupShares`).
  - **Last dividend (D11).** A company's screen shows "Last dividend: $X a share for YEAR, N% of the
    price." when its dividend rule holds a last payment with a per-share amount above 0 (see "Yearly
    dividends"). The yield is left out when the price makes it meaningless. Groups show nothing.
- **Yearly dividends** (`business/dividend-policy.ts`, `dividend-year.ts`, `dividend-menu.ts`): a
  standing rule on a company you own pays a share of the year's profit, or of the spare cash, at year end.
  - **The record (D1).** `BizState.dividend?: DividendPolicy` holds `mode` (`profit` or `cash`), `pct`
    (5% to 100%, default 30%), `keep` (months of costs to keep, 0 to 24, default 3) and the `last` payment
    (`year`, `paid`, `mine`, `perShare`). `dividend-policy.ts` imports nothing, because `state.ts` imports
    it. `normalizeBiz` whitelists it through `dividendField`. `bizOf` doesn't re-normalize a
    current-version record, so every reader calls `readDividend(b.dividend)` and never reads the field
    raw. A damaged value reads as no rule. `withPolicy` is how the menu (and any later advisor) changes
    it, through the same clamps. `BIZ_VERSION` stays 2, and a save without the field behaves as before.
  - **The maths (D2 to D4, pure).** `dividendFloor` is the larger of `keep` months of `runningCosts` and,
    when a board exists, the board's `reserveDollars`. `spare = max(0, payoutCash - floor)`. The basis is
    the year's `Statement.net` (profit mode, never below 0) or the spare cash. `pay = min(spare,
    round(pct x basis))`, and under $1 is nothing. `dividendQuote` gives the numbers and, when nothing is
    paid, the one reason (`why`). Debt, investors' preference, unreleased-game money and a bank's capital
    all sit inside `payoutCash`/`payableCash`, so a payment never passes them and borrowing to pay can't
    work. Nothing carries over to the next year.
  - **Paying (D6).** `board-menu.payOut` is the one money move, extracted from the manual `payDividend`:
    cash out, the player's part through `earnIncome` (taxed as income where the player lives), relatives
    through `payFamilyBusinessProceeds`, and a listed company's `sharePrice` down by the payout per share
    with `valuation` re-marked. `autoDividendYear` calls it, stores `last` on the rule and returns the
    amounts, including an estimate of the income tax at the margin. `yearlyFinance` settles the real tax
    in the same age-up, because the `business` hook runs before `finance`.
  - **When it runs (D5).** `yearly.ts` calls `autoDividendYear` once per company inside the company
    loop, after the board review and milestones and before the cash-crunch exit, the annual report and the
    hired CEO's turn, so those plan on the cash left. A fiscal year pays once (`last.year >= s.year`
    returns). It uses no `g.rng` and takes no `g.nextId`. A game that never set a rule changes nothing.
  - **No vote (D7).** The rule never asks the board and records no vote. The board's reserve sits inside
    the floor, so a payment never passes the line that would need one.
  - **Who runs it (D8, D9).** The owner, a hired CEO, a player in prison and a young heir all get paid.
    While a rule is set, `board-ceo.payoutTurn` returns at once, so a Cash or Profit mandate can't pay on
    top. A division of a group is skipped and its menu hidden, because its cash is the group's.
  - **Reporting (D10).** One life-log line per company ("X paid me $N in dividends.", or "X paid no
    dividend." with the reason) and one bundled "Dividends" popup a year, only when something was paid.
    Its id is `div-<generation>-<year>`.
  - **The menu (D12).** Company › Money › Yearly Dividend (`dividendMenu`, after the manual dividend):
    Share of Profit, Share of Spare Cash, Cash to Keep and Turn Off. Each slider previews what it would
    pay now through `ruleNote`, from the same quote the year step uses. Menus are pure and render from a
    deep-frozen state.
- **Hedge funds** (`business/hedge-record.ts`, `hedge-model.ts`, `hedge-fund.ts`, `hedge-company.ts`,
  `hedge-year.ts`, `hedge-menu.ts`): Investments › Hedge Funds lets the player run a Personal fund and a
  Family fund with their own cash, and set an ordinary company's spare cash to work. The funds are not
  the hedge-fund firm.
  - **The model (D1).** The year is the firm's own maths in `fund-model.ts` (`marketMove`, `hedgeGross`,
    `financingCost`, `alphaMean`, `capacityOf`) with the firm's four strategies and blurbs.
    `capacityOf` and `outlookOf` were pulled out of `capacityFactor` and `strategyOutlook` so one formula
    serves both, and `test/fund-extract-pin.test.ts` pins the firm's numbers. `hedge-model.vehicleYear`
    is the whole year: `net = (1 + gross)(1 - 0.5%) - 1`. There is no fee. The fund pays a running cost of
    `RUNNING_COST` (0.5%) a year and nothing else. Skill is the runner's (`runnerSkill`, `leadOf`,
    `skillOf`), and a company's is `leaderSkill`. Noise comes from `hedgeRng` (company: `fundRng`), a
    seeded stream by life, outcome tag, fund id and year, so a Time Machine jump rerolls it.
  - **Person and family funds (D2, D3).** One Asset each: kind `investment`, `details.type` `'hedge'`,
    the record in `details.hf`. `Asset.value` is the player's own units at the unit price, so net worth
    and the estate count it once. `investments.ts` keeps a `SIDE_ACCOUNTS` set (`npcEquity`, `hedge`):
    `investmentHoldings` and `sellCore` skip it, so Sell Everything, the portfolio total and the politics
    insider count never see a fund. A family fund also holds relatives' units;
    their money is never in the player's net worth or estate. Money moves through `spend`, `realize`
    and the relatives' own `Person.money`, and a fund never creates any. Take Out sells units and pays
    tax on the gain through `investments.realize` (carried losses first); a take out of all of it, or
    nearly, closes the fund.
  - **Company fund (D4, D12).** `BizState.hedge` (a `CompanyHedge`) is a sleeve. The cash stays in
    `b.cash`. Each fiscal year, before `simulateYear`, `bookHedgeYear` (called in `yearly.ts` next to
    `bookFranchiseYear`) puts `work = min(target, payoutCash - floor)` to work. The floor is the larger
    of six months of running costs and the board's reserve. The result moves `b.cash` and goes into
    `yearIncome` (a gain) or `yearCosts` (a loss), so the statement and the corporate tax count it
    once, and loans, closure and the cash crunch need no change. `runningCosts` takes a loss out of the last
    year's costs (`hedgeResultFor`), so the floors built on it don't jump after a bad year. A year can lose a little over 95% of
    `work` at the most (`hedgeGross` stops at -0.95, then the running cost comes off), and `work` is
    spare cash above the floor, so after the worst year the company is as liquid as the floor. Banks,
    investment firms (their own fund is `coinvest`) and divisions of a group are refused. A hired CEO,
    or a player who is in prison or under 18, runs the firm's autopilot terms (`autoTerms`).
  - **The result is valued as cash (D4).** The result is in `b.cash`, which `valuationOf` already counts,
    but it is also in that year's profit, which `valuationOf` capitalizes at the industry multiple. Left
    alone, a gain would raise the company's value five or six times over. So the booking keeps the last
    three years' results in `CompanyHedge.marks`, and `valuationOf` takes `hedgeProfitIn` (the result
    less the tax it added, read back from the year's own record) out of the profit it capitalizes, the
    way it takes out one-off franchise fees. A deep-tech company works its value out from its own profit
    too (`deeptech-core.operatingValue`), so it takes the same amount out there. The company's value
    then moves by the cash and no more; `test/hedge-integration.test.ts` pins it.
  - **Macro lasts a year (D7).** A Macro call, with its 1x to 3x leverage, reverts to Long/Short, flat,
    1x after the year it is booked for. An office holder (`politicianJob`) cannot set it, and a stored
    Macro runs as Long/Short while they hold the job.
  - **Relatives (D9, D10).** The family fund is one pool in units. A relative is invited one by one, puts
    in 20% of their money and never more than your own units are worth, and joins at the going price.
    Each yearly step starts with `settleHolders`: a holder who is now the player merges into the player's
    units, a late holder's units go to `dynasty-ownership.familyStakeHeirs`, and one who has cooled
    (relationship under 15), was disowned or is estranged is paid out. Settling never changes the unit
    price. A year of -15% or worse cools every holder by 3. At death, `life.continueAsChild` first
    settles the funds (`settleFundsAtDeath`), so units of a relative who died first pass on; the units of
    the player are in the estate through `Asset.value`. A sole adult heir keeps the fund in kind and the
    relatives stay in it (`keptFundHolders` keeps them as contacts). Otherwise the fund is dropped and
    `payOutDroppedFunds` pays the relatives through `cashOutFamilyHolders` before the heir's money is
    built, with one line in the estate text.
  - **The yearly hook (`hedge-year.yearlyHedge`).** Registered in `aging.YEARLY_HOOKS` right after
    `investments`. It settles, books each fund once a birthday (`f.lastYear`), and queues one popup
    (`Hedge Funds`, id `hedge-<generation>-<year>`, which takes nothing from the id counter) that lists
    the funds and the companies' cash at work. It returns at once when the player is dead or there is
    no fund and no company record.
  - **Saves.** Every field is optional and read through `readHedge` or `readCompanyHedge`, which never
    throw or mutate their input. `hedge-record.ts` imports nothing at runtime, because `state.ts`
    imports it for `normalizeBiz`; it repeats the firm's strategy and call lists, and a test pins them
    equal. A damaged fund record reads as none: the Asset keeps its stored value in net worth, and its
    screen says the books are damaged. `BIZ_VERSION` stays 2.
  - **Rules it keeps.** No `g.rng` anywhere in the feature: not a menu, quote, preview, action or the
    yearly step. Menus are pure and every closure re-finds its Asset by id (`stayOpen` leaves stale
    nodes). `investments.ts` imports nothing from `business/`: `registerHedgeFunds` takes the row, the
    fund screen and the subtitle, and the Asset's own screen under Assets is the same fund screen
    (`investmentAssetView`).
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

## Money team (advisors/*.ts)

An adult can hire a financial advisor, who reports the biggest problems in their money, and a financial manager, who keeps a stated mix of stock funds, bonds and savings every year for a fee. Design: `docs/superpowers/specs/2026-10-14-advisor-manager-design.md` (D1 to D16). Plan: `docs/superpowers/plans/2026-10-14-advisor-manager.md`.

**The record.** All the state is one flag, `g.flags['fin.team']`, read only through `readTeam` and written only through `writeTeam` (team.ts).
- `readTeam` is the whitelist. It builds a fresh object from the known keys, clamps every field to the nearest legal value (names 1 to 40 characters, skills 20 to 99, rates 0.2% to 3%, limits 10 to 100, reserves 0 to 1e15) and returns null for junk. It never throws and never changes its input.
- The record is stamped `${character.id}:${g.year - age}`. A record for another character reads as no record, so an heir starts clean.
- A manager with no usable mandate gets the default one (60% stocks, a reserve of at least two typical incomes, a limit of 50). A mandate or a statement with no manager is dropped.
- Nothing is added to `Asset.details`, `BizState`, `Character` or the save schema. A save without the key plays exactly as before. There is no `Person` and no new `Asset`: the manager's trades are ordinary holdings the player can sell any day, so there is no mirror account to double count.
- `advisorEpoch` and `managerEpoch` count how many of that role were let go. `done` is the last year the yearly step ran.

**Offers, fees and gates (team.ts).**
- Three offers per role per year. They hash `lifeId|fin|role|year|epoch|slot` (FNV-1a, then `nextRandom`, the pattern of `special/common.ts stableRoll`), so they are the same on every call and never touch `g.rng`. Letting a hire go bumps that role's epoch and brings new faces.
- The menu shows a word (`ratingLabel`), never the skill number. About one manager in eight is a crook who claims 12 to 25 points above their real skill, to a ceiling of 97 (`OFFER_SKILL.claimCap`). The fee follows the claim.
- With an advisor, `vet` gives each manager offer a stable chance, equal to the advisor's skill in percent, of showing the true rating and whether the manager has padded bills before.
- Gates: net worth of 25 times `typicalIncome` for an advisor, a managed pool of 10 times for a manager. Fees: an advisor takes 0.15% to 0.4% of net worth by skill, a manager 0.4% to 1.4% of the money they run by claimed rating, each with a floor of a tenth of a typical income. `TERMS` holds the numbers.

**Three buckets, and why nothing else (D5, D6).**
- The manager runs the local index fund (before index funds exist, the investment trust, which has the same `index` type), the government bond and a savings account. Safe money goes to the bond when it pays clearly more than savings, otherwise to savings. Gold, REITs, term deposits, single stocks, pennies and coins are left out.
- Politics counts only a few things as an insider position (`insiderPositions`, `special/politics.ts`): open bets, index options, and held shares or coins whose `details.secId` is the target's. Targets are made-up listed companies and, from rank 2, coins. An index fund, a bond or a savings account is never a target. Because the manager buys only those three, it cannot create an insider position, and no politics code had to change. The mayor in `test/advisors-story.test.ts` ages five years with a manager, then passes laws on four policy keys both ways and gets no case; the same mayor with a hand-picked made-up stock does. `test/advisors-integration.test.ts` repeats the check across four offices and eras through the real `ageUp`.
- The manager trades only what the player could trade by hand. It reads each quote's `blocked` text, `tradeBlock` and `investingBlocked`. A shut exchange blocks only the fund. Banned private investing idles the manager: no fee and no trades, while the advisor still bills.

**The seam in investments.ts (D15).**
- `buySecurity` and `sellHolding` take a `quiet` flag. A quiet order has the same fees, tax, blocks and price impact as a hand order and queues no popup and no log line. Eight trades make no `Order Filled` popups.
- `managedBook(g)` is pure. It reports each bucket's value, why it can't be bought or sold, its yield, the cash, the broker's minimum and `idle`. `managedOrder(g, bucket, side, dollars)` places one quiet order and says what moved. A sale works through the bucket's holdings largest first and never touches a term deposit.

**The yearly step (D14).** `yearlyAdvisors` (year.ts) is the `advisors` entry in `YEARLY_HOOKS`, between `underworld` and `milestones`. Rent, tax and upkeep are already paid, so the cash it spends is real and the manager's reserve protects the living costs. Order:
1. Return with no record, no hire, a dead, young or imprisoned player, or `done === g.year`.
2. The advisor's retainer by `spend`. If it fails the advisor leaves.
3. The manager, unless the book is idle. The invoice (the agreed fee, plus a crook's padding cut to the cash left) is paid first by `spend`; if it fails the manager leaves and nothing else happens. Then the blunder roll, `planYear`, the sells, the buys (capped at the cash above the reserve, skipped under the broker's minimum) and the slippage on the money moved. Then the catch roll.
4. The advisor's review of the book as the manager left it.
5. One `Year-End Statement` popup and one log line.

Only this step draws from `g.rng`, and only after a manager has been paid: one `chance` for the blunder, one for its direction when it fires and one for the catch when a crook has padded a bill. A game with no record returns before any draw.

**Skill, the limit, the crook and the catch (D8 to D10).**
- Skill is execution, not returns (`PLAN` in mandate.ts). A weaker manager lets the mix drift further before selling (a band of 3 + (100 - skill) / 10 points), pays more slippage ((100 - skill) x 0.005% of the money moved) and blunders more often (12% x (100 - skill) / 100). A blunder aims the year's target 25 points off, says so in the statement, and next year's normal pass corrects it.
- The limit is the most of the pool that may change hands in a year, buys plus sells. It also caps theft: a crook pads each bill by `round(0.03 x limit x pool)`, cut to the cash left after the agreed fee.
- Every year a crook has padded a bill there is a catch chance of 4% plus half the advisor's skill (`catchOdds`; 4% with no advisor). A catch pays back 30% of all the padding once, lets the manager go and bumps the epoch. The statement shows the billed amount and the pool, so a careful player can compare it with the agreed rate.
- `planYear` is pure and `mandate.ts` is its own module, so the menu preview and the yearly step run the same function.

**The advisor (D1 to D4, D7, D16).**
- The advisor never forecasts. It reads the present: six pure findings in review.ts, none of which reads `g.rng`. Foresight stays with the Investing talent, and `MenuBase.hint` (the purple line) stays talent-only. Advice shows as plain info rows with a 💼.
- The findings and their weights; the list sorts by weight, then id: `insider` (95), `concentration` (76 to 100, which is `round(60 + 40 x share)` at a share of 40% or more, so a very large one passes `insider`), `loan` (70), `company-cash` (50), `idle-cash` (40, hidden while a manager is hired) and `losses` (30).
- `insider` uses the same targets and the same two-year window (`freshShare`) as the politics rule for laws, so the warning is exact for them. It fires for an office holder with a made-up listed company (or, from rank 2, a coin) bought this year or last. A market-moving announcement counts every holding of the target whatever its age (`insiderPositions` with `freshOnly: false`), so an older pick is not flagged here. The manager never sells these picks; the decision stays the player's.
- `company-cash` only points to Pay a Dividend (or Withdraw Profits for a sole owner). The standing dividend rule belongs to the dividends feature, so two payers can't pay one company twice.
- Skill is coverage: `shownCount(skill)` shows the top 2 to 5 and the menu says "Sees 3 of 5". A better advisor sees more of the list, never a different list.
- `concentration` groups investments by `companyKey(details.secId)`, one line in review.ts (`add(\`sec:${secId ? companyKey(secId) : a.id}\`, a)`), so two lines of one company, such as Alphabet and its Class C, add up. A holding with no `secId` is its own group. The manager's three types are never class lines.

**Menu (menu.ts).** `moneyTeamMenu` sits right after Investments in Business & Investments. It is a pure function of state and renders from a deep-frozen game. Every action re-reads the record and rebuilds its offer through `hire`; the three sliders (Stocks Share, Cash to Keep, Yearly Limit) parse, snap and clamp their input and write the mandate through `writeTeam`. Each preview calls `planYear`.

## Politics 2.0 (nation/*.ts)

Once in office the player changes real laws, and every system that prices, taxes or trades reads
them. Design: `docs/superpowers/specs/2026-10-13-politics-2-governing-corruption-design.md`.

- **State.** `g.flags['nation.policy']` is the world: one `CountryPolicy` per country that has laws
  of its own (national, regional and city layers of taxes and budget levels, new taxes, breaks,
  labor/environment rules, deregulated and nationalized sectors, legal/banned, tariffs, deals,
  sanctions, export bans, retaliation against it, institutions, legislature seats, one-off shocks,
  a pending debt write-down, graft, rating and the report history). It survives heirs: laws stay
  until repealed. `g.flags['nation.me']` is the character (owner-stamped, heirs start clean):
  political capital, legitimacy, fear, security loyalty, heat, the slush fund, offshore money,
  case files, rivals, cooldowns. Readers (`policyOf`, `meView`) normalize and never write; writers
  (`writePolicy`, `writeMe`) always replace the root so the WeakMap caches stay valid. No record =
  no overlay = the game as before.
- **One overlay.** `effects.nationOverlay(g, country, year, live)` turns a record into revenue and
  spending (GDP shares), fading growth/inflation/unemployment/inequality/confidence impulses, credit
  and services levels, sector and industry demand/cost levels, approval by voter group, and
  attributions (`parts`). The economy transition (`economy/index.yearlyEconomy` →
  `simulation.advanceCountry(..., nation)` → `government.budgetPlan(..., nation)`) uses `live =
  false` (measures count from the year after they pass, like the economy's own policies);
  `business/dynamics.nationalMarket` (every company: player, NPC, deep tech, studios, planner) uses
  `policyMarket` live. History years keep their real cycle and inflation; the overlay adds to them.
  A default's write-down is consumed by one transition (`consumeWriteDowns`).
- **Trade.** `trade-policy.tradeOverlay(g, year)` builds `economy/trade.TradeOverlay` lookups
  (extra tariffs by pair and input, sanction restrictions, export bans, deals); `countryTrade`,
  `shipment`, `retarget` and `exportOrders` take it (never inside the year-bucketed customs cache).
  `tariffWith`/`barriersWith` are the company-screen versions; `company.stampCompanyBarriers` writes
  each player company's extra barriers into `MarketState.barriers`, which `market-reach.entryStrength`
  reads, so retaliation shrinks the player's own export reach.
- **Taxes reach real money.** `finance.gameIncomeTax` (income points), `business/tax.allocatedCorporateTax`
  (now takes the industry: corporate points, windfall, breaks), `exit.capitalGainsRate`,
  `events/will-estate.planEstate` (`taxDelta`) and relatives' inheritances, `luxuryTaxRate`, shop prices
  (`data/markets.localPriceMult`/`salesTaxRate` through `registerPricePolicy`), and the yearly
  wealth tax and property-tax change in `yearly.personalTaxes`. `isIndustryLegal(country, industry, g)`
  honours legalizations and bans when given the game.
- **Offices.** `office.ts` owns the political systems moved out of `special/politics.ts`
  (titles, parliamentary/presidential, regional heads) plus `officeView`, `adjustApproval`, the
  minister portfolio (`Job.data.portfolio`; `setPortfolio` pays the 30% raise once and restores
  `Job.data.ministerBase` on leaving) and `powerFor(v, area)`: city (mayor), regional
  (governor/premier), national by vote (legislator, ministers in their portfolio, the head of
  government), decrees (presidents on trade, everyone under emergency rule or a self-coup).
  `special/politics.ts` registers `leaveOffice` and `policyMove` (insider bets on the player's own
  laws: a `policy` market-shock cause) through `registerOfficeHooks`; nation/ never imports the career.
- **Bills.** `govern.ts` has one `Measure` vocabulary, `measureBlock` (era, country and office gates;
  menus AND `resolveBill` call it), `previewOf` (overlay with minus without), `propose` (popup with
  the odds for a straight vote, leaning on the party, a pork deal, or bribes) and `resolveBill`
  (rolls exactly `legislature.voteOdds`, then veto, courts via `courtRisk`, retaliation, insider check).
  Desk bills from the career map to measures through `deskMeasure`.
- **Yearly** (`aging.ts` hook `nation`, after `special`): upkeep (shocks/retaliation expire, graft decays,
  ratings; the borrowing spread is measured from `ratingBase`, the rating a record started with, so a
  record alone never costs a country anything), personal taxes, company barriers, legislature reset when the player leaves the top job,
  minister reshuffles, meters, midterms, the State of the Nation (`minigame 'nationReport'`,
  `ui/minigames/NationReport.tsx`), then at most one of: debt crisis, consequences (case files,
  leaks, coups, removal votes, protests/uprisings, sanctions), or drama (crises, own companies,
  relatives, lobbyists, rivals). The career's approval drift aims at `yearly.approvalTarget`.
- **Abuse of power.** `graft.ts`: schemes pay dirty money into the slush fund (`schemeQuote` is what
  `runScheme` rolls; caps scale with GDP, office and corruption), steering contracts books markup as
  company income, laundering (65% through a company), offshore (12% fee), bringing money home (20% cut,
  taxable, capped yearly). Dirty and offshore money are not net worth and die with the character.
  `regime.ts`: keeping power, gated by `institutionStrength`; `electionEdge` (pure) and `countVotes`
  (rolls: a rigged count can be exposed and annulled). `consequences.ts`: open → pending → closed case
  files (`exposureChance`, `chargeChance`, `purgeChance` in corrupt countries), immunity, exile
  (`goIntoExile` → `immigration-move.relocate`), coups (`coupChance`), removal votes (`survivalOdds`).
- **Balance** is checked by `test/nation-balance.test.ts` (a few seeded lives per strategy) and the
  opt-in `FUZZ=1 npx vitest run test/fuzz-politics.test.ts` (many), both through `test/politics-kit.ts`.

## Music 2.0 (special/music-*.ts)

A label deal with a recoupment ledger, format eras, a seeded chart against named rival acts, a touring P&L, six
events plus a claim dispute, and a master buy-back an heir can inherit, on the career kit. Design:
`docs/superpowers/specs/2026-10-19-music2-design.md`.

- **Files.** `music-data` (tables, era helpers), `music-job` (profile and job moved out of `music.ts`, `signDeal`),
  `music-state` (the record), `music-market` (format mix, waterfall, chart, `bookRelease`, `stepCatalogue`),
  `music-label` (roster, negotiation, deal year, exits, Release Plan), `music-tour` (`tourModel`, settlement),
  `music-events` (six crises, the dispute, awards), `music-menu`, and `music-sim` (the one `settleYear` entry,
  registered in `kit/careers.ts`). `music-rights.ts` keeps its legacy calls and gains `adoptMaster`. New modules
  never import `music.ts` (a grep test pins it).
- **Record.** `special.music.sim` (key `music.sim`, version 1) is owner-stamped, normalized by its reader and
  bounded (ledger 40, history 8, tours 8, mods 6, awards 24). The legacy `special.music` profile and `Job.data`
  are never converted or rewritten: the migration is pure and `view` of a legacy life is the legacy state plus a
  derived record. `SAVE_SCHEMA` stays 2.
- **Grandfathering.** A labelled legacy solo becomes a `legacy` deal: the old advance salary pays once a year, a
  release keeps the legacy `sold` and $1 a copy, nothing is recouped, and the renewal comes at the tier's base
  royalty plus 0.02 with nothing carried.
- **Identities.** `waterfall`: `gross = costs + kept + recoup + bandCut + paid`, cash moves by `paid`, `recoup` is
  `min(unrecouped, round(0.8 x pool))` and a repayment to the label, never income. Tour: `gate + merch + absorbed =
  promoter + crew + travel + production + cogs + playerNet + bandCut`, taxed on net.
- **Order in `music-sim.ts`.** The first tick adopts and returns; then `stepDeal` and `stepDispute` (or `endDeal` with
  the job gone), `stepCatalogue`, the standing and the statement; the kit offers the generic crisis last.
  `yearlyMusic` has two guards: once adopted it skips only the solo deal year and the awards block.
- **Money.** Cash moves only through `c.earn`, `c.pay` or `Effects.money` with a named source or sink
  (`test/career-money-scan.test.ts` scans every `music-*.ts` but `music-rights.ts`).

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

## Careers 2.0 (special/kit and the three sims)

Actor, astronaut and model run on one shared kit and a `<id>-sim.ts` each. Design:
`docs/superpowers/specs/2026-10-19-careers-slice1-design.md`.

- **State.** One optional record per career at `special.actor.sim`, `special.astronaut.sim` and
  `special.model.sim` (store keys `actor.sim`, `astronaut.sim`, `model.sim`): owner-stamped, versioned,
  normalized by its reader. `KIT_LIMITS` rows 12 / memory 16 / cool 24 / done 24 / line 90; a full record
  stays under 6,000 JSON nodes and 40 KB (tested). `SAVE_SCHEMA` stays 2 and no `STEPS` entry exists.
  The legacy flags `special.actor`, `special.astronaut` and `special.model` are never written by new code.
- **Kit modules** (`special/kit/`, none imports a career file). `state`: `defineCareerState` (`view` is
  pure, `mut` is for actions and yearly hooks), `claimSettle`, junk-tolerant readers. `rivals`: derived
  rosters, `standingOf`, `noteRival` memory. `year`: `settleYear`, the `CareerCtx` ledger, the popup
  budget. `crisis`: `defineCrises` with `odds()` as the only probability source. `menu`: `gatedAction`
  and `standingMenu`. `careers`: the `CAREER_SIMS` registry and `yearlyCareerSims`.
- **Money only through `c.earn` / `c.pay`.** `test/career-money-scan.test.ts` fails any `earnIncome`,
  `spend`, `addMoney` or `payForAction` call in `actor-*.ts`, `astronaut-*.ts` and `model-*.ts`. Amounts
  are shown through `money()`; text tables are functions, so nothing prices at module load.
- **Derived rivals.** Peers come from the family seed (the lifeId without `-gN`), country and 5-year
  cohort, so nothing is stored and an heir meets the same names with an empty record. Only `memory` rows
  (who you met, beat or lost to) live in the record.
- **Budget.** The yearly hook may queue 1 choice and 2 notices; an action or script, 3 and 6. At most 2
  career choices (`career.*` scripts) wait in the queue; a notice over budget becomes a log line.
- **Legacy guards.** `yearlyActor` returns at its top once `actorStore.peek(g)?.migrated`; the sim then
  owns the project, residual, dry-year and agent steps, and `adoptLegacy` carries a legacy profile over
  (the legacy flag is left as it was). `yearlyModel` is untouched: the sim pays only net above `s.floor`,
  the retainer the legacy hook just paid. `astronaut.ts` gains only guarded edits that do nothing
  without a record: (a) the Academy closes before 1959, (b) `yearlyCadet` runs the selection board
  (the one deliberate behaviour change), (c) `astro.apply.<agency>` rows, (d) `astro.mission` is the
  Flight Board, (e) `astroPromotionOk` and retirement at 68 from level 6, (f) `trainSkills`, (g) pilot
  skill on asteroid sensors, (h) `flyOn(g, dest, text, paid)`, the bridge from `resolveFlight`.
  Every legacy script and menu id stays registered, so a queued modal from an old save still resolves.
- **Actor likeness.** The one thing an heir inherits: an Asset of kind other with
  `details.actorLikeness` (v1), chained in `menus.ts` as `actorLikenessNodes` after `musicMasterNodes`.
  It pays whoever holds it (`yearlyLikeness`, before the kit hook). Astronaut and model leave nothing.
- **A new career in four lines.** One import and one `CAREER_SIMS` entry in `kit/careers.ts`, one child
  in `specialCareersMenu`, one `...xJobNodes(g)` in `specialJobNodes`. Menus read `view` / `peek` only.
- **Tuning** lives in one file per career: `actor-data.ts`, `astronaut-data.ts`, `model-data.ts`.
- **Cut from slice 1:** Music 2.0, sector families, new minigames and screens (no `MinigameKind`, no
  `src/ui` change; the report card is a notice plus info rows), business trades.
- **Tests:** `test/career-kit.ts` (the playthrough kit), `career-*.test.ts` (kit),
  `actor-*`, `astronaut-*` and `model-*` tests, `careers-balance.test.ts` (3 careers x steady and
  reckless x 2 seeds x 10 years) and the opt-in `FUZZ=1 npx vitest run test/fuzz-careers.test.ts`.

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
