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
    save.ts              localStorage saves, ribbon collection, graveyard                             [foundation]
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
    data/locales.ts      Per-country culture (school naming, exams, emergency number, holidays, food,
                         sports, transport, snow, landmarks...); data in data/locales/<region>.ts.
                         Player-facing text must use localPick/fillLocal/localTerm, never US defaults
    business.ts business/*.ts   Start/buy/run companies in 25 industries; yearly sim + Annual Report.
                         Actions that spend/earn company cash move b.cash AND add to yearCosts/
                         yearIncome (for the P&L); simulateYear must not move that cash twice.
                         Owner payouts are capped at cash beyond company debt (no loan-then-bankrupt)
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
11. Money is shown in dollars everywhere (like BitLife). Use `formatMoney` / `shortMoney`.
12. Keep text tasteful for a teen rating by default: dark humor is fine (BitLife-style), nothing sexually explicit, no slurs.

## Cross-module contract (exact exports)

| File | Exports (must exist with these signatures) |
|------|---------------------------------------------|
| `world.ts` | `COUNTRIES: Country[]`, `NAME_POOLS`, `getCountry(id)`, `randomCountry(g)`, `randomCity(g, country)`, `randomFirstName(g, countryId, gender)`, `randomLastName(g, countryId)`, `randomSkinTone(g, country)` |
| `life.ts` | `interface NewLifeOptions { firstName?; lastName?; gender?: Gender; countryId?; city?; sexuality?: Sexuality; seed?: number; year?: number; stats?: Partial<Stats> }` (stats = "Customize stats" on the New Life screen, keys in `START_STAT_KEYS`, clamped 0-100) (year = calendar year of birth; the UI passes the real current year), `createNewLife(opts: NewLifeOptions): GameState`, `continueAsChild(g: GameState, childId: string): GameState`, `yearlyMilestones(g): void` |
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
  `updateSettings(patch)`, `checkAi()`. Screens: `'home' | 'newLife' | 'game' | 'settings' | 'ribbons' | 'graveyard'`.
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
