# AnotherLife — architecture & module contract

AnotherLife is a browser life simulator that mirrors BitLife's gameplay (stat bars, yearly
"+ Age" loop, Occupation / Assets / Relationships / Activities menus, popups with choices,
crime & prison, ribbons, generations) with an original name and emoji art. An **LLM the
player brings** writes the year-by-year story: random events with choices, outcomes,
conversations, interview questions, free-form "Do Anything" actions and obituaries. It can be a
local server (LM Studio, Ollama, llama.cpp, KoboldCpp, Jan, any OpenAI-compatible server) or a
cloud API with the player's own key (Claude, OpenAI, Gemini, OpenRouter, Groq, Mistral,
DeepSeek, xAI, Together, any OpenAI-compatible API). Everything also works offline from a
built-in event library.

Stack: Vite + React 19 + TypeScript (strict), Vitest. No other runtime deps.

Hosting: a static site on the Cloudflare Worker `snag` (Workers Builds deploys every push to its
production branch; `wrangler.jsonc` runs `npm run build` and serves `dist/`). There is no
backend: the browser talks **directly** to the provider the player chose.

- **Local servers** (`kind: 'local'`) are reached at their own address, e.g. LM Studio at
  `http://localhost:1234/v1`. From the hosted https page that needs the server's CORS setting
  ("Enable CORS", `OLLAMA_ORIGINS`, ...) and the browser's local-network-access permission;
  Safari may refuse https → `http://localhost` altogether.
- **Cloud APIs** (`kind: 'cloud'`) are called with the player's API key. The key lives only in
  this browser's localStorage (`settings.ts`) and is sent only to that provider.
- **Dev convenience only:** under `npm run dev`, LM Studio's default URL is `/lmstudio/v1`,
  which the Vite server proxies to LM Studio (no CORS needed; `vite preview` has the same proxy
  if you type that URL). Every other provider, and the hosted site, uses direct URLs.

UI copy and error messages must name the active provider (`providerFor(settings).name`), never
assume LM Studio, and explain both the local and the cloud case.

**First run:** until `settings.setupDone` is true, `App.tsx` shows only the "Choose your AI"
screen (`ui/screens/AiSetupScreen.tsx`): local server / cloud API with own key / play without AI
→ pick a provider → URL, key, setup steps, Test connection, model → Start playing (or Save
anyway). No AI server is contacted before the player chooses one. The same provider picker and
connection form (`ui/components/AiProviderForm.tsx`) power Settings → AI Connection.

## Layout

```
src/
  settings.ts            Settings (provider, per-provider URL/key/model, AI level, setupDone...) in localStorage [foundation]
  game/                  Pure TypeScript engine — no React, no fetch
    types.ts             ALL shared types (GameState, Character, Person, Job, Asset, ModalItem, MenuNode...) [foundation]
    rng.ts               Seeded RNG: rand, randInt, chance, pick, weightedPick, shuffle, bell, uid    [foundation]
    core.ts              Helpers: addStat, addMoney, spend, log, notice, scriptChoice, minigame,
                         queueAi, endJob, people lookups, relationLabel, formatMoney, avatarEmoji... [foundation]
    scripts.ts           defineScript / runScript registry for choice/input/minigame modals          [foundation]
    people.ts            createPerson(g, opts), TRAITS, notePerson                                    [foundation]
    world.ts             Countries, cities, name pools                                                [world agent]
    effects.ts           applyEffects(g, GameEffects) with caps (AI + scripted outcomes)              [foundation]
    death.ts             killCharacter(g, cause)                                                       [foundation]
    aging.ts             ageUp(g): runs yearly hooks in order, then queues the yearEvents AI task     [foundation]
    menus.ts             Top-level Activities menu assembly                                           [foundation]
    save.ts              localStorage saves, ribbon collection, graveyard, separate Time Machine snapshots                             [foundation]
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
                         talentMult, talentHint (purple 🔮 hint text), talentEmoji, talentsSummary.
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
    business.ts business/*.ts   Start/buy/run companies in 25 industries; yearly sim + Annual Report.
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
    invest/instinct.ts   Investing talent: marketInstinct(g), an honest ~80% gut read of next year's
                         deterministic engine moves (per character + year, never rerolls)
    investments.ts invest/*.ts  Stocks, funds, bonds, savings, crypto, gold on the local exchange
    shops.ts shops/*.ts         Everyday stores, memberships/subscriptions, tickets, Luxury Lifestyle
    cv.ts                The player's CV (Character.cv explicit entries + entries derived from state),
                         cvScore for admissions/jobs, national school rankings, the job market, and
                         the "Your CV" menu. Applications go through the 'screenApplication' AI task
                         (AI reads the CV + market and decides on an interview; offline fallback).
                         jobFit(g, def) scores how well a job suits the CV; the careers recruiter
                         ("Best Matches" / "Within Reach") sorts openings by it
    computer.ts computer/*.ts   The home computer (needs an owned computer asset): learn to code, side
                         projects, SaaS/app ventures, freelancing (dev-*.ts); crypto pump-and-dumps,
                         options, single-stock options and coin shorts (money-*.ts), online scams
    invest/shocks.ts     Market shocks (g.flags.marketShocks): a company/coin banned or hyped by a
                         head of state; investments and options read the price hit. Kept across heirs
    special/*.ts         Special careers split by section: politics.ts (incl. Abuse of Power:
                         market-moving announcements + insider trades, abuseSummary for the AI),
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
  ai/                    Provider clients + "director"                    [ai agent]
    providers.ts         Provider registry (local servers + cloud APIs), defaults, setup steps
    client.ts            Routes requests to openai-compat.ts or anthropic.ts; JSON parse/validate/retry
    openai-compat.ts anthropic.ts errors.ts lmstudio.ts (compat re-exports)
    json.ts prompts.ts schemas.ts director.ts
  ui/
    store.ts             App store + modal-queue game loop + AI task runner                         [foundation]
    components/Sheet.tsx components/StatBar.tsx                                                      [foundation]
    minigames/index.ts minigames/types.ts                                                            [foundation]
    minigames/Blackjack.tsx HorseRace.tsx Slots.tsx                       [money agent]
    minigames/Burglary.tsx PrisonEscape.tsx Pickpocket.tsx                [crime agent]
    screens/AiSetupScreen.tsx components/AiProviderForm.tsx   first-run "Choose your AI" + shared provider form
    everything else in ui/ + main.tsx, App.tsx, styles                    [ui agents]
```

## Golden rules for every module

1. **State is plain JSON.** `GameState` is saved to localStorage and cloned with `structuredClone`.
   Never store functions, class instances, Maps or Sets in it. Use `g.flags`, `g.counters`,
   `Enrollment.data`, `Job.data`, `Person.data`, `Asset.details` for module-specific data.
2. **All randomness goes through `rng.ts`** with the `g` argument (`rand(g)`, `chance(g, 0.3)`,
   `randInt(g, 1, 6)`, `pick(g, list)`). Never call `Math.random()` or `Date.now()` in `src/game`.
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
   - `queueAi(g, task)` — hand work to the AI director (see "AI tasks").
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
    `shortMoney` only, at render/action time. The settings select local currency or USD and nominal
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
| `ai/director.ts` | see below |

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
`studied`, `skippedSchool`, `diseases`, `lawsuitsWon`, `aiEvents`, `customActions`.
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

`history/events.ts` provides `worldEvents`, `newsLine`, `eraSummary`, `yearlyHistory` and war
queries. `aging.ts` calls `yearlyHistory` first. Headlines cover every country/year and continue
procedurally after the present; historical life events live in `events/history*.ts`. News and
currency-change log IDs are stable and consume neither game RNG nor normal IDs. Era popups
only run before PRESENT_YEAR. `events-medicine.ts` adjusts historical medicine and mortality;
`events-people.ts` supplies occupations and names. The AI prompt includes era, immigration and
business-share summaries.

`history/markets*.ts` overlays real historical index/sector crashes, gold, housing, inflation,
rates, exchange closures and expropriation on `invest/engine.ts`. Procedural markets start in
the present. Historical facts stay fixed across seeds and Time Machine jumps. Options premium
sampling must use the procedural distribution, not a mix of fixed historical years. Investing
hints and settlement must use the same family seed, timeline and shock data.

`data/currencies.ts` registers the money converter and owns historical denominations, exchange
scales and `currencyChangeAt`. `core.ts` exposes `bindMoneyContext`, `withMoneyContext`,
`showMoney`, `moneyScale`, `moneyFromInput`, `moneyToInput` and display settings. The UI store
binds its mutable draft before actions (including emigration), then binds committed state.
`Dialogs.tsx`, `ModalHost.tsx` and Annual Report fields convert inputs; AI effects are converted
in `director.ts`, after schema validation preserves fractional and hyperinflated amounts.
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

`immigration.ts` owns `citizenshipsOf`, `yearlyImmigration` and `immigrationSummary`.
`data/immigration*.ts` provides era-aware borders, blocs and destination programs;
`activities/immigration-*.ts` handles route eligibility, applications, deposits and relocation.
Status is optional on old saves and advances from visa to permanent residence to citizenship.
Golden-visa investments stay locked; quitting a route or moving again must settle the lock.
Eligibility uses nationality, year, net worth, CV, education and family ties, not just cash.

## AI tasks & the director

`ModalItem` of kind `aiTask` holds a serializable `AiTask`. When one reaches the head of the queue
the store calls the director and shows a "thinking" card with a **Skip** button (skip/timeout/error →
offline fallback). Tasks:

| Task | AI does | Offline fallback (events.ts / careers.ts) |
|------|---------|-------------------------------------------|
| `yearEvents` | 1-3 first-person log lines for the year + optionally one event popup with 2-4 choices (`source: 'ai'`) | `queueFallbackYearEvents(g)` |
| `resolveChoice` | outcome text + `GameEffects` for the chosen option | `fallbackChoiceOutcome(g, event, choiceId)` |
| `customAction` | decides what happens when the player "Does Anything": outcome text + `GameEffects` (may arrest, injure...) | `fallbackCustomAction(g, text)` |
| `interview` | one interview question with 3-4 scored answers → `presentInterview(g, job, q)` | `presentInterview(g, job, fallbackInterviewQuestion(g, job))` |
| `obituary` | a short obituary stored in `g.obituary` | `g.obituary = fallbackObituary(g)` |

Notices may carry `ai: { when: 'balanced' | 'full', facts }`; the store asks the director to rewrite
the text in its own words while keeping the facts (used for conversations and other interactions).

`src/ai/director.ts` exports:

```ts
runAiTask(g: GameState, task: AiTask, settings: Settings, signal: AbortSignal): Promise<(draft: GameState) => void>
applyFallback(g: GameState, task: AiTask): void
narrateNotice(g: GameState, notice: NoticeModal, settings: Settings, signal: AbortSignal): Promise<string>
interface ChatTurn { from: 'player' | 'npc'; text: string }
chatReply(g: GameState, personId: string, history: ChatTurn[], message: string, settings: Settings, signal: AbortSignal): Promise<{ reply: string; relationshipDelta: number }>
testConnection(settings: Settings, signal?: AbortSignal): Promise<{ ok: boolean; message: string; models: string[] }>
```

AI output is never trusted: effects go through `applyEffects` (caps money and stat swings), person
references are resolved by name to existing ids, and malformed JSON falls back offline.

## UI contract

- `src/ui/store.ts`: `useApp(selector)`, `goTo(screen)`, `goBack()`, `startNewLife(opts)`,
  `resumeSavedGame()`, `hasSavedGame()`, `continueAs(childId)`, `abandonLife()`, `ageUpAction()`,
  `runMenuAction(action, input?)`, `dismissNotice(id)`, `chooseOption(id, choiceId)`,
  `submitInput(id, value)`, `finishMinigame(id, result)`, `skipAi()`, `act(mutator)`,
  `updateSettings(patch)`, `checkAi()`, `travelBack(age)`, `clearTimeTravelError()`. Screens: `'home' | 'newLife' | 'game' | 'settings' | 'ribbons' | 'graveyard'`.
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
