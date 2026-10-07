# AnotherLife: handoff (year system round, unfinished)

This repo is **AnotherLife**: a BitLife-style life simulator in the browser where the player's own AI narrates, with offline fallbacks. Vite + React 19 + TypeScript + Vitest. The pure engine is in `src/game`, the UI is in `src/ui` and the AI layer is in `src/ai`. **Read `docs/ARCHITECTURE.md` first**: it has the golden rules and module contract.

- Repo: `sugarhappy8/snag`. Work branch: `claude/fervent-cerf-1iuzn5`. Draft PR: **#6** (base `main`).
- Live site: https://snag.sugarhappy8069.workers.dev. The last release is **v1.4.0** (talents + deep tech), and `main` is that release.
- **Deploy gotcha:** Cloudflare's Git integration deploys **every push to the PR branch to production**. Until the work is finished and verified, put `[skip ci]` in the commit message so it doesn't deploy. Pushes to `main` deploy through `.github/workflows/deploy.yml`.
- **Release:** squash-merge the PR with a `(#N)` title, bump `package.json` and `package-lock.json` (the next version is **1.5.0**), then run the `release.yml` workflow (`workflow_dispatch` with inputs `tag`, `target` = merge SHA, `notes` = Markdown).

## What the user asked for (this round)

> "Add a year system, for example if I set that I was born in 1980 then I grew up and invested my money into different shares and index's then the dot com bubble wiped me out in 2000. Things like that that are all historical. Also like if I was born then then my parents wouldn't have bought me a pc and I wouldn't know how to code and like a year context sense. Also if in 2005 I start a quantum or ai business and it works I basically have a monopoly. Business now shows users global competition and world wide market dominance/share."

Plus three items they kept from a suggestion list:
- **(6) Money in local currency** (rupiah, yen…; dollars stay internal).
- **(9) A Time Machine** to rewind a few years, like BitLife.
- **(11) Immigration** based on net worth and where you're from: passports, free-movement blocs and routes (work/CV, student, spouse, golden visa by net worth, retirement, asylum, lottery, sneaking in). Status goes visa → permanent residency → citizenship, with dual citizenship, deportation and exit tax.

## Contract already in the tree (keep these exports)

- **`src/game/history/timeline.ts`** (real data):
  - `PRESENT_YEAR = 2026`: history before it is real, after it is the procedural future.
  - `HISTORY_START = 1900`.
  - `priceLevel(year)`: US CPI relative to 2026.
  - `TECH` adoption table, `techAdoption(countryId, tech, year)`, `hasTech(g, tech)`, `techOdds(g, tech)`.
  - `ERAS` / `eraOf`.
  - **Engine money is always constant 2026 US dollars.**
- **`src/game/history/events.ts`** (history core): `worldEvents`, `yearlyHistory` (the first yearly hook in `aging.ts`) and `eraSummary` (the AI line).
- **`src/game/history/markets.ts`** (markets): `marketHistory`, `historicalCycle`. `business/economy.ts` `cycleOf` already calls the latter.
- **`src/game/core.ts` money display:**
  - `formatMoney` / `shortMoney` go through a converter registered by `data/currencies.ts`.
  - `setMoneyDisplay`, `bindMoneyContext(g)`, `showMoney`, `moneyScale`, `moneyFromInput`.
  - The default is plain USD, so tests are unaffected.
- **`types.ts`:** `MenuInput.money?`, `Character.citizenships?`, `Character.immigration?` (`ImmigrationStatus`).
- **`src/game/immigration.ts`:** `citizenshipsOf`, `yearlyImmigration` (yearly hook after finance), `immigrationSummary`.

## Status when work stopped

Eight features were built in parallel. Two builders finished; the other six ran out of time partway (a usage limit, then the user stopped the session). **Everything is committed on the branch as is.**

- `npx tsc --noEmit`: **clean**.
- `npx vitest run`: **1476 passed, 8 failed** (failures listed below).

| Feature | State | Main files |
|---|---|---|
| Time Machine | **Built** (reviewer pass cut off) + 5 pending shared changes below | `src/game/timeMachine.ts`, `src/game/save.ts`, `src/ui/store.ts`, `src/ui/components/TimeMachine*.tsx`, `src/ui/screens/DeathScreen.tsx`, `GameScreen.tsx`, `test/time-machine.test.ts` |
| Local currency | **Built** (reviewer pass cut off) + 9 pending shared changes below | `src/game/data/currencies.ts`, `src/game/core.ts`, `src/settings.ts`, `src/ui/components/Dialogs.tsx`, `src/ai/director.ts`, `test/currency*.test.ts` |
| History core | Partial, far along: events data 1900–2026, wars/drafts, medicine, Born-in picker, AI era line | `src/game/history/events*.ts`, `src/ui/screens/NewLifeScreen.tsx`, `src/ai/prompts.ts`, `src/game/special/military.ts`, `src/game/health.ts`, `test/history.test.ts` |
| Historical markets | Partial, far along: index/sector/gold/housing/crypto/inflation/rates data, engine overlay, finance rates | `src/game/history/markets*.ts`, `src/game/invest/*.ts`, `src/game/investments.ts`, `src/game/finance.ts`, `test/history-markets.test.ts` |
| Era features | Partial: computers/coding/social/gamedev/shops/love/careers gated by era | `src/game/computer/**` (incl. `computer/era.ts`), `special/social.ts`, `fame.ts`, `gamedev*.ts`, `sports-esports.ts`, `shops/**`, `assets.ts`, `love.ts`, `careers.ts`, `data/jobs.ts`, `education.ts`, `test/era-features*.test.ts` |
| Anachronism sweep | Partial: era variants in events/activities; lint test still failing | `src/game/events/**` (incl. `events/era.ts`), `src/game/activities/**`, `relationships.ts`, `crime.ts`, `prison.ts`, `test/anachronism.test.ts` |
| Global competition | Partial, far along: roster, shares, era curves, moves, menu | `src/game/business/competition*.ts`, `business/era.ts`, `business/*.ts`, `test/competition*.test.ts` |
| Immigration | Partial, far along: blocs/countries/programs data, routes, apply/move/lock, status clock | `src/game/immigration.ts`, `src/game/data/immigration*.ts`, `src/game/activities/emigrate.ts`, `activities/immigration-*.ts`, `test/immigration*.test.ts` |

### Failing tests (8)

1. `test/anachronism.test.ts`: never mentions things before they existed. The anachronism sweep isn't finished.
2. `test/history.test.ts`: history popups and news never mention things before their time.
3. `test/computer-money.test.ts`: options: every strike can actually pay, and is a losing bet for buyers and sellers. This is the markets overlay vs options pricing.
4. `test/deeptech.test.ts` ×2: grant limits; biotech pipeline. Likely affected by competition/era changes in `business/*`.
5. `test/deeptech-review.test.ts`: the founder can't blitz R&D on investor money and flip in 3 years.
6. `test/gamedev.test.ts`: random Game Industry play for 25 years never breaks numbers. Era-gated gamedev.
7. `test/talent-business.test.ts`: popup hints point at the best choice under the resolvers' odds. Competition changed event resolvers; keep hints honest.

Fix the root cause in each; **never** weaken or skip a test. Each test exists because an earlier reviewer found a real bug or exploit.

### Pending shared changes from the finished Time Machine builder
- 1. src/settings.ts (currency agent / lead): add `sandboxTimeMachine: boolean` to `Settings` with a doc comment ('Sandbox: unlimited Time Machine jumps'). Add `sandboxTimeMachine: false` to DEFAULT_SETTINGS, and `sandboxTimeMachine: bool(raw.sandboxTimeMachine, d.sandboxTimeMachine)` in normalizeSettings. Until this is done the toggle works only for the current session, because normalizeSettings drops the unknown field on reload. game/timeMachine.ts `sandboxTimeMachine(settings)` already reads it defensively.
- 2. src/ui/screens/SettingsScreen.tsx: render the Time Machine section. Add `import { TimeMachineSettingsSection } from '../components/TimeMachineSettings'` and put `<TimeMachineSettingsSection />` right after the Money section (before Advanced). It is self-contained: it reads `useApp(s => s.settings)` and calls `updateSettings(sandboxPatch(on))`, using the existing al-card / set-section / set-toggle-row / set-switch classes.
- 3. Timeline forks, so a jump re-rolls the seeded future instead of replaying it as a crystal ball for stocks and crypto. Real history stays the same in every timeline. Helpers in src/game/timeMachine.ts: `timelineFamily(g, base)`, `familyAt(fam, year?)`, `timelineTag(g, year)`. All of them return their input unchanged for a life that never jumped, so old saves and PRESENT_YEAR lives keep identical seeds. (a) src/game/investments.ts:167, src/game/invest/instinct.ts:63 and src/game/computer/money-common.ts:582: `fam(g)` returns `timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))`. All three must change together. (b) src/game/invest/engine.ts: every `${fam}|...|${year}` seed uses `${familyAt(fam, year)}|...`; this covers world:166, ix:203, house:872, ex/exdt:890-891, crypto:1025, coins:1080 (yr), gold:1149 (yr) and fx:1276. The year-less seeds use `${familyAt(fam)}|...`: init/initdt:739-741, coin0:1038, gold0:1135. The cache keys at 965/1062/1131 keep the full `fam`. Every `${fam}|` seed must be converted, otherwise the encoded forks would change past years too. (c) Optional, same idea: special/common.ts stableRoll seed `${g.lifeId}${timelineTag(g, g.year)}|${g.year}|${key}`, plus business/economy.ts:196 bizcycle, economy.ts:781 bizexchange and business/deeptech-core.ts:145 dtcycle seeds, each with `${g.lifeId}${timelineTag(g, year)}|...`.
- 4. src/game/life.ts continueAsChild (around line 1349, next to marketShocks): keep the family's timeline for the heir with `...(Array.isArray(n.flags.timelineForks) ? { timelineForks: n.flags.timelineForks } : {})`. This only matters once change 3 is applied. Do NOT carry `flags.timeMachine` (jumps are per life), nor deathRecorded / recordedRibbon / recordedGrave / bumpedGraves.
- 5. docs/ARCHITECTURE.md: add a Time Machine entry. (a) game/timeMachine.ts: rules (TIME_MACHINE_STOPS = 10, TIME_MACHINE_JUMPS = 3, arriveInPast, the timeline-fork helpers); per-life state in g.flags.timeMachine {used} and g.flags.timelineForks. (b) save.ts: snapshot API (startTimeline / resumeTimeline / clearTimeline / expectSnapshot / snapshotIfDue / loadSnapshot / forgetFuture / timeStops / subscribeTimeStops / setSnapshotBackend / snapshotWritesSettled; IndexedDB, else localStorage within LOCAL_SNAPSHOT_BUDGET, else memory) plus recordDeath / unrecordDeath. (c) UI contract: store exports travelBack(age) and clearTimeTravelError(); AppState.timeStops and AppState.timeTravel.

### Pending shared changes from the finished currency builder
- MUST (money pop-ups opened from scripts): src/game/types.ts, interface InputModal: add `/** True when the number is an amount of money: min/max/defaultValue/placeholder stay internal dollars; the UI shows and accepts the display currency and submits internal dollars. */ money?: boolean`.
- MUST (same fix, UI side): src/ui/components/ModalHost.tsx, InputCard. (1) Import `moneyDefault` from './Dialogs'. (2) First line: `const money = modal.money === true && modal.input === 'number'`. (3) Initial state: `useState(() => (money ? moneyDefault(modal.defaultValue) : (modal.defaultValue ?? '')))`. (4) `validateInput(modal.input, value, modal.min, modal.max, money)`. (5) `submitInput(modal.id, normalizeInput(modal.input, value, money, modal.min, modal.max))`. (6) `rangeHint(modal.input, modal.min, modal.max, money)`. (7) On <InputField>: `placeholder={money ? moneyDefault(modal.placeholder) : modal.placeholder}` and `money={money}`.
- MUST (after the two changes above): add `money: true,` right after `input: 'number',` in these five money pop-ups: src/game/special/politics.ts ~line 1762 (crony bet), src/game/computer/money-stocks.ts ~567, src/game/computer/money-options.ts ~442, ~461 and ~585. Until then a yen or rupiah player who types an amount there has it read as dollars, and min/max are checked in dollars.
- SHOULD: src/ai/schemas.ts line ~459, `money: int(v.money, -1e9, 1e9)`. AI money is now in display units, so raise the limit to ±1e40; otherwise hyperinflation lives (1923 marks, 2008 Zimbabwe dollars) get AI amounts cut to almost nothing. Better still, accept decimals (a NUM schema, no rounding) so 1900 pounds or 1925 dollars can be fractional; the director already rounds after converting to dollars. Also, int()'s string pattern only skips '$' between the sign and the digits: allow any short symbol, e.g. `/([-+−]?)\s*[^\d\s+-]{0,4}\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB])?/`, so '-¥75,000' stays negative.
- SHOULD: docs/ARCHITECTURE.md golden rule 11 is out of date. Replace it with: 'Money is kept in constant PRESENT_YEAR US dollars; the player sees local currency and the prices of the year (Settings › Money). Always use formatMoney/shortMoney/formatCents/formatPrice/moneyWith, never build money strings by hand or at module load (test/currency-static.test.ts), and mark money inputs `money: true`.' Add `data/currencies.ts` (CurrencyDef, currencyOf, currencyChangeAt, unitsPerDollar, exchangeRate, convertMoney; registered when settings.ts is imported) to the layout list.
- SHOULD: the graveyard and the family-tree ancestors show net worth in whatever life is currently on screen. Add `countryId?: string` to AncestorSummary in types.ts and fill it where summaries are built. Then in GraveyardScreen.tsx (lines ~127, ~163, ~174) and ProfileSheet.tsx (~670) format with `withMoneyContext(e.countryId ? { countryId: e.countryId, year: e.diedYear } : null, () => shortMoney(e.netWorth))`.
- SHOULD: in historical years, use the currency of that year in prose, not today's (no 'the Euro lost 40%' in 1985 Germany). Replace `marketOf(cid).currencyName` with `currencyOf(cid, g.year).name` (import from game/data/currencies) in: src/ai/prompts.ts LOCAL ECONOMY line (~425), src/game/business/events.ts (~533, ~554), src/game/investments.ts (~612, 663, 1057, 1476).
- NICE: history/events.ts yearlyHistory(g): announce currency changeovers in the life log, e.g. `const ch = currencyChangeAt(g.character.countryId, g.year); if (ch) log(g, `💱 The ${ch.to.name} replaced the ${ch.from.name}${ch.per !== 1 ? ` (${ch.per.toLocaleString('en-US')} old for 1 new)` : ''}.`, 'neutral')`. Example: Germany 2002, 1.95583 DM for 1 €.
- NICE: src/ui/store.ts, in the helper that clones the game and runs a menu action or popup answer: call `bindMoneyContext(draft)` before the mutation, so text written in the same action after an emigration uses the new country's money. commit() already rebinds afterwards.

## What to do next (in order)

1. **Finish each partial feature against its spec** (appendix), one at a time, reading its files first.
   - **History core:** make the history popup/news lint pass. Wire `immigrationSummary`, the competition share line and the currency changeover log line into `prompts.ts` / `yearlyHistory`.
   - **Markets:** make the options test pass. Check that a 1999 US tech-heavy portfolio loses about 70%+ by 2002, that there is no crypto before 2009, that real rates are about 0 in 1980, and that Investing-talent honesty holds.
   - **Era features:** fix the gamedev monkey test; check that kids born in 1980 rarely get a PC or code, and that kids born in 2000 often do.
   - **Anachronism sweep:** make `test/anachronism.test.ts` pass (lives born 1900–1995 never see smartphones, apps, the internet and so on before their years).
   - **Competition:**
     - Fix the deeptech and talent-business tests.
     - An AI lab founded in 2005 in the US and run well should reach >50% world share by about 2020.
     - The same lab founded in 2026 should rarely pass 10%.
     - Antitrust should trigger at dominance.
     - The "Market & Competition" screen should be on every company.
   - **Immigration:** finish routes, the status clock and tests (EU free movement only after 1993; Eastern Bloc exit restrictions before 1989; a golden visa needs net worth and locks the money).
2. **Apply the pending shared changes** above: Time Machine settings and timeline forks; currency `InputModal.money`, AI schema limits and the old currency in prose.
3. **Update `docs/ARCHITECTURE.md`** for history/, currencies, timeMachine, immigration and competition.
4. **Verify:**
   - `npx tsc --noEmit`, `npx vitest run` (all green) and `npm run build`.
   - A headless playthrough: `npm i --no-save playwright && npx vite preview --port 4199 &` then `node scripts/e2e-play.mjs http://localhost:4199/ --ai off --seed 7`. Expect `errorCount: 0`; try a few seeds.
   - Manually play a life born in 1980 in the US: buy tech stocks in 1999 and watch 2000–02; try a PC as a kid; start an AI company in 2005.
   - Check a life born in 2026: it should play like v1.4.0, plus local currency and the news line.
5. **Push without `[skip ci]`** (this deploys to the live site), update PR #6's description, then merge and release v1.5.0 when the user asks.

## Ground rules (from `docs/ARCHITECTURE.md`)

- **State:** plain-JSON `GameState`. All randomness goes through `rng.ts` with `g`. Menus must be pure (use `seeded()`; never consume `g`'s RNG or mutate state while building a menu).
- **Reporting:** `log` / `notice` / `scriptChoice` / `minigame`. Per-year limits use `useYearAction`.
- **Content:** no real brands, companies or living private people. Teen-rated, with tact for wars and tragedies.
- **Saves and money:** old saves must keep working. Hunt for infinite-money exploits. Purple talent hints must be honest (computed from the same math the resolver uses).
- **Money strings:** only via `formatMoney` / `shortMoney` (never hand-built, never at module load). Mark money inputs `money: true`.

## Appendix: original specs given to the builders

Common brief (all builders):

```text
You are building a feature for "AnotherLife" in /home/user/snag: a browser life simulator that plays like BitLife (original names/emoji art, no real brands, no real companies or real living private people) where the player's own AI narrates, with offline fallbacks when AI is off. Pure TypeScript engine in src/game, React UI in src/ui, AI layer in src/ai. Read docs/ARCHITECTURE.md first (golden rules: plain-JSON state; all randomness via rng.ts with g (or seeded() for menus, which must never consume g's RNG or mutate state); mutate g in place; report with log()/notice()/scriptChoice()/scriptInput()/minigame(); per-year limits via useYearAction; menus are MenuGroup/MenuAction/MenuInfo/MenuHeading; teen-rated BitLife-style dark humor; purple talent hints via talents.ts talentHint when relevant).

THE USER ASKED (verbatim, then the three list items they kept):
"Add a year system, for example if I set that I was born in 1980 then I grew up and invested my money into different shares and index's then the dot com bubble wiped me out in 2000. Things like that that are all historical. Also like if I was born then then my parents wouldn't have bought me a pc and I wouldn't know how to code and like a year context sense. Also if in 2005 I start a quantum or ai business and it works I basically have a monopoly. Business now shows users global competition and world wide market dominance/share."
Kept items: (6) "Money in local currency: an Indonesian life should earn rupiah and a Japanese one yen; keep dollars internally." (9) "A Time Machine: rewind a few years after a disaster, like BitLife." (11) "Immigration based on net worth and where you're from: today the destination and your origin don't matter... passports/free-movement blocs, destination selectivity, routes (work visa scored on CV, student, spouse, investor/golden visa by net worth with money locked, retirement/remote worker, asylum, lottery, sneaking in), temporary visa → permanent residency → citizenship, dual-citizenship rules, deportation, tax residency, exit tax, family visas, talent hints for the best route."

CONTRACT ALREADY IN THE TREE (written by the lead; keep every export/signature):
- src/game/history/timeline.ts (real data): PRESENT_YEAR = 2026 (history before it is real, after it the procedural future), HISTORY_START = 1900, priceLevel(year) (what one PRESENT_YEAR dollar was worth in that year's US dollars; 1980 ≈ 0.25), usInflation(year), TECH table (radio, tv, colorTv, creditCards, atm, videoGameConsole, homeComputer, mobilePhone, internet, onlineShopping, onlineBanking, onlineBrokerage, socialMedia, videoSharing, smartphone, streaming, crypto, datingApps, rideHailing, esports, deepLearning, aiAssistants, electricCars, privateSpace, quantumComputers) with invented/mainstream years and poor-country lag, techAdoption(countryId, tech, year) (0-1 share), hasTech(g, tech, year?) (exists here at all), techOdds(g, tech, year?) (chance a typical family has it), ERAS/eraOf(year), isHistorical(year). ENGINE MONEY IS ALWAYS CONSTANT PRESENT_YEAR US DOLLARS (real terms).
- src/game/history/events.ts (stub, history builder): WorldEvent, worldEvents(year, countryId), yearlyHistory(g) (already the FIRST yearly hook in aging.ts), eraSummary(g) (AI line).
- src/game/history/markets.ts (stub, markets builder): MarketYear, marketHistory(countryId, year), historicalCycle(countryId, year, synthetic) (already called by business/economy.ts cycleOf).
- src/game/history/index.ts re-exports all three.
- core.ts money display: formatMoney/shortMoney now go through a converter (registerMoneyConverter(fn)); setMoneyDisplay({ mode: 'usd'|'local', nominal: boolean }); bindMoneyContext(g) (called at the start of ageUp, at the end of createNewLife and in the UI store's commit); showMoney(n) → { amount, symbol, code, suffix? }; moneyScale() (display units per internal dollar); moneyFromInput(x). The default is plain US dollars in today's money, so tests and old behavior are unchanged until the currency builder registers its converter and the UI applies the player's setting. Every money string must go through formatMoney/shortMoney (or a module money() helper that calls them).
- types.ts: MenuInput.money?: boolean (money inputs: min/max/default stay internal dollars, the UI converts); Character.citizenships?: string[] (createNewLife sets [birth country]); Character.immigration?: ImmigrationStatus { countryId, status: 'citizen'|'permanent'|'visa'|'asylum'|'undocumented', visa?, since, expires? }.
- src/game/immigration.ts (stub, immigration builder): citizenshipsOf(g), yearlyImmigration(g) (yearly hook after finance), immigrationSummary(g).
- New Life already passes NewLifeOptions.year (birth year; the UI currently passes the real current year).

WORKING RULES (eight agents edit this tree at the same time):
- Edit ONLY the files you own (your task lists them) plus new files with the prefixes you're given and your own test files. Need a change elsewhere? Don't make it: describe it exactly in sharedChangesNeeded (the lead applies them after everyone finishes).
- NEVER run git commands that change the tree or index. Read-only git is fine.
- Typecheck: npx tsc --noEmit 2>&1 | grep -E '<your files>' (ignore other agents' half-written files). Run your tests; finish with npx vitest run test/simulate.test.ts and once the full suite (npx vitest run), fixing failures caused by your files. Don't leave scratch test files behind.
- Quality bar: ships to real players. Historically grounded but playful copy; no TODOs/placeholders; no NaN/undefined/negative-money bugs; no infinite-money exploits; plain-JSON state; old saves keep working (a life born in PRESENT_YEAR must play like before, minus nothing); ages, prison and death handled; localized to the player's country; teen-appropriate; wars, pandemics and tragedies handled with tact (headlines and choices, no graphic detail, no real living private individuals; well-known public events are fine).
```

### History core (birth year, world events, era AI context, drafts, era medicine)

```text
TASK: the history core — make every year feel like its year. You own src/game/history/events.ts (+ new src/game/history/events-*.ts data files), src/game/history/timeline.ts (refine data only; keep exports), src/game/life.ts (birth-year parts: parents born and living in the right era, era-appropriate parent occupations via your own era data, grandparents' wars...), src/game/people.ts (era-appropriate occupations/names only if you can do it cleanly), src/ui/screens/NewLifeScreen.tsx (birth year), src/ai/prompts.ts (EXCEPT the effectsGuide function, which the currency agent owns), src/game/special/military.ts (wartime drafts and national service by era), src/game/health.ts (era medicine and pandemics only), new src/game/events/history*.ts, and new tests test/history*.test.ts (+ updates to existing tests your change legitimately requires). Dev-server/Playwright port if needed: 4331 (Chromium at /opt/pw-browsers/chromium via executablePath).
1. New Life: a "Born in" year control (HISTORY_START…PRESENT_YEAR, default the present; quick decade chips like 1950s/1980s/2000s; Random Life keeps the present unless the player picks "Random era") passed as NewLifeOptions.year; show a one-line era preview ("1980: no home internet yet; the Cold War; disco's hangover"). Mobile-first, accessible, light/dark.
2. World history data 1900-PRESENT_YEAR in history/events*.ts: several headlines per year (world + continent + country-specific for the bigger countries: wars, crashes, firsts, inventions, space, sport, culture, elections/independence, pandemics), as WorldEvent records. worldEvents(year, countryId) returns those that matter where the character lives.
3. yearlyHistory(g): one "📰 <year>:" world-news log line a year (most relevant headline), occasional era popups for big moments that touch the player (the Moon landing on the family TV, the Berlin Wall falling for Germans, a pandemic lockdown, rationing, a war breaking out with draft-age characters → special/military.ts draft choices: serve, conscientious objector, medical exemption, flee), applied tactfully and only in the affected countries/years.
4. Era health: life expectancy and medicine by era and country (no antibiotics before the 1940s, polio era, the 1918 flu, the 2020 pandemic — generic naming is fine for pandemics), applied gently in health.ts so a 1900 life is harder than a 2000 one without being miserable.
5. prompts.ts: an ERA line in the character context (eraSummary: year, era label, what exists and what doesn't yet via TECH/hasTech — 'no smartphones, no internet; home computers are rare' — plus this year's headlines), and filter the yearly AI themes so they're era-appropriate (no 'a group chat' in 1975). The narrator must never put modern tech in old years.
6. A life born in PRESENT_YEAR must behave exactly as before (except the yearly news line).
Tests: era summary content by year; worldEvents coverage (every year 1900-PRESENT_YEAR has at least one world headline); draft only in war years/countries; a 1900-born and 1950-born life simulate to death without errors; New Life passes the chosen year.
```

### Era features (computers, coding, social media, game platforms, shops, dating, jobs, education by year)

```text
TASK: gate the game's features by era so a 1980 childhood is a 1980 childhood. You own src/game/computer/** (all), src/game/special/social.ts, src/game/special/fame.ts, src/game/special/gamedev*.ts, src/game/special/sports-esports.ts, src/game/shops/** and src/game/assets.ts, src/game/love.ts, src/game/careers.ts and src/game/data/jobs.ts, src/game/education.ts, and new tests test/era-features*.test.ts (+ updates to existing tests your change legitimately requires). Use history/timeline.ts (hasTech, techOdds, techAdoption, eraOf, priceLevel) — don't edit it.
- The home computer: parents buying a kid a computer follows techOdds('homeComputer') (and family wealth): rare in 1985, common by 2005, depending on the country. Buying one yourself: only once it exists, with era models/names (8-bit micro, beige PC, laptop, gaming PC) and era prices. Learning to code by era: BASIC on an 80s micro, Pascal/C in the 80s-90s, the web after the internet arrives, apps after smartphones; projects, SaaS/ventures, freelancing platforms, crypto pump-and-dumps, online options trading and online scams only once their tech exists (internet, onlineBrokerage, crypto...). Someone born in 1980 usually didn't code as a kid — unless their family got a computer.
- Social media & fame: no social platforms before socialMedia/videoSharing exist; earlier fame runs through TV, radio, newspapers and magazines (adapt the fame paths' copy and options).
- Game industry by era: platforms (arcade, home consoles, PC, handhelds, mobile after smartphones, VR late), engines, genres and team sizes by year; studios can't ship mobile games in 1995. Esports only once esports exists.
- Shops/assets: electronics, phones, consoles, computers, streaming subscriptions, cars (no modern EVs before electricCars) exist and are named for their era; era prices come for free from internal dollars (don't double-apply priceLevel).
- Love: dating apps/online dating only when they exist; before that, classifieds, dances, matchmakers, friends of friends.
- Careers/jobs & education: jobs exist only in their era (no Social Media Manager before social media, no App Developer before smartphones, no Data Scientist before ~2010; switchboard operators, typists and lamplighter-era jobs in the past), degrees/online courses/bootcamps by era; layoffs and hiring freezes follow historicalCycle (history/markets.ts) in recessions.
Tests: born-1980 kids rarely get a computer and rarely code; born-2000 often do; no smartphone/social/crypto/app features before their years; jobs by era; a 1950-born life plays to death without errors; PRESENT_YEAR lives unchanged.
```

### Anachronism sweep (all offline text fits its year)

```text
TASK: the anachronism sweep — offline text and actions must fit the year. You own src/game/events/** (except new events/history*.ts, owned by the history agent), src/game/activities/** (except activities/emigrate.ts and any activities/immigration*.ts, owned by the immigration agent), src/game/relationships.ts, src/game/crime.ts, src/game/prison.ts, and new tests test/anachronism*.test.ts (+ updates to existing tests your change legitimately requires). Use history/timeline.ts (hasTech, techOdds, eraOf) — don't edit it.
- Audit every offline event, notice, log line and activity for modern assumptions: phones/texting/group chats/social posts/apps/the internet/streaming/selfies/online shopping/video games/ATMs/credit cards/GPS/rideshares... Gate them with hasTech or give era variants (letters, landline calls, payphones, pagers in the 90s, instant messengers in the 2000s, the family TV, the radio, the drive-in, the arcade, the cinema newsreel).
- Era-specific activities and crimes: no hacking/identity theft online before the internet; bootlegging/speakeasies during US Prohibition (1920-1933); era-appropriate nightlife, vacations (air travel was a luxury before the 1970s), fashion/salon, movies (silent films → talkies → color → blockbusters → streaming), books (only books published by that year), martial arts and diets by era.
- Relationships: how people keep in touch by era (letters, calls, messages), what kids fight over, what gifts look like.
Build a lint test that simulates many lives born across 1900-1995 (AI off, offline fallbacks) and scans every log/notice/choice text for modern words before their tech year (smartphone, app, text message, social media, online, internet, email, streaming, selfie, Wi-Fi, laptop, GPS, Uber-like, crypto...), plus your fixes until it's clean. PRESENT_YEAR lives must keep their modern texts.
```

### Historical markets (dot-com, 2008, 1929, crypto, inflation, real rates)

```text
TASK: historical markets — the dot-com bubble must be able to wipe you out in 2000. You own src/game/history/markets.ts (+ new src/game/history/markets-*.ts data), src/game/invest/** (engine.ts, shocks.ts, instinct.ts...), src/game/investments.ts, src/game/finance.ts, and new tests test/history-markets*.test.ts (+ updates to existing investment/finance tests your change legitimately requires). Read business/economy.ts (cycleOf already calls historicalCycle) and computer/money-*.ts (options and coins read the engine) but don't edit them.
- Data 1900→PRESENT_YEAR-1: real (inflation-adjusted) yearly index returns for the US (accurate), and the major markets (UK, Japan, Germany, France, Canada, Australia, China/HK, India, Brazil, Mexico, South Korea, Taiwan, South Africa, Russia...), with regional proxies for the rest; crashes and bubbles (1929-32, 1937, 1973-74, 1987, Japan 1990-2003, Mexico 1994-95, Asia 1997-98, Russia 1998, the dot-com run-up 1995-99 and crash 2000-02 with tech down ~75-80%, 2008, the euro crisis 2010-12, 2020's crash and rebound, 2022), sector years (tech, banks 2008, energy 1973/1979/2014-15/2020, airlines 2001/2020, housing 2006-11 in the US, Spain/Ireland, Japan 1991+), gold (1980 and 2011 peaks), local inflation and policy rates (1970s-80s inflation, Volcker's 1981 rates, hyperinflations: Weimar 1923, Argentina, Brazil 1990s, Zimbabwe 2007-08, Venezuela 2016-20), exchanges that didn't exist yet or were closed (wartime closures, communist economies before reopening), and crypto: no crypto before 2009; the first fictional coin follows Bitcoin's real path (fractions of a cent in 2010 → ~$1,000 in 2013 → ~$14K end of 2017 → ~$3.7K end of 2018 → ~$47K end of 2021 → ~$16K end of 2022 → ~$90K+ by 2024-25, in real terms), later coins appear in their eras.
- invest/engine.ts: for years < PRESENT_YEAR, exchange/sector/security/coin/gold/housing/fx years follow the history overlay (per-security idiosyncratic noise on top of the sector path, so a tech-heavy portfolio really loses ~70-80% in 2000-02 and a diversified index ~40-50% real) deterministically and without consuming g's RNG; future years stay procedural. Keep the family-seed design (heirs see the same market). The Investing talent's gut (instinct.ts) must stay honest with the overlay (it reads next year's real moves).
- Rates: engine money is constant (real) dollars, so savings/bonds/loans/mortgages must use REAL rates (nominal minus inflation) internally while showing the era's nominal rates in text (1981: savings 15%, mortgages 18%; real returns about zero or negative). finance.ts: loan/mortgage availability and rates by era.
- historicalCycle(countryId, year, synthetic): real recessions/booms by country (Great Depression, 1973-75, early 80s, early 90s, 2001, 2008-09, 2020; Japan's lost decade; Asia 1997-98; etc.) blended with the synthetic noise; future unchanged.
Tests: a US investor buying tech stocks in 1999 loses ~70%+ by 2002; the index loses ~40%+ real 2000-02 and recovers by ~2007; 2008 hits; 1929-32 hits; Japan 1990-2003; no crypto before 2009 and the first coin's path; real savings rates ~0 in 1980; instinct honesty with history; PRESENT_YEAR+ markets unchanged.
```

### Global competition & world market share (first-mover, monopoly, antitrust)

```text
TASK: global competition and world-wide market share for businesses. You own src/game/business/** (all files) and src/game/business.ts, plus new tests test/competition*.test.ts (+ updates to existing business/deeptech/talent-business tests your change legitimately requires). Use history/timeline.ts (hasTech, techAdoption, eraOf, PRESENT_YEAR) and history/markets.ts (historicalCycle is already wired in cycleOf) — don't edit them.
1. Competition model (plain JSON on the business, refreshed yearly, deterministic per life/industry/country/year where it isn't the player's doing): each industry has a local market (city/country) and, for tradable industries (software, ecommerce, gameStudio, manufacturing, energy and all 8 deep-tech industries), a global market; market size grows by era (industry era curves: e.g. AI small before deep learning, exploding after 2012 and again after 2022; quantum lab-only before ~2016; EVs tiny before 2008; private space near-impossible before ~2002-08; ecommerce/software booms in the late 90s, dot-com bust 2000-02; mobile apps after 2008) and shrinks in recessions; named fictional competitors (local shops for restaurants; global players with HQ countries for tradables) with founding years, quality/tech/brand and shares; new entrants arrive as markets grow and as you make big profits; competitors respond (price wars, copying, poaching).
2. First-mover and dominance: a well-run company founded early in an industry's era (e.g. an AI lab in 2005, a quantum company in 2005 if it can survive the long runway) faces few or no serious competitors and can reach a dominant world share as the market explodes — network effects/winner-take-most in software, AI and platforms; the same company founded in PRESENT_YEAR faces a crowded field. Share must DRIVE the simulation (demand, pricing power, margins), not just display; keep business/economy.ts bookYear/bestPlan and the deep-tech sim consistent so the Business talent's plan hint stays honest.
3. Dominance tiers (startup → niche player → contender → market leader → dominant → near-monopoly) with antitrust by country and era (fines, forced divestitures, blocked acquisitions; stricter in the EU and after the 1990s, lax in some places), and fun events (a giant tries to buy you, a competitor copies your product, a price war, a scandal at your rival).
4. UI data: a "Market & Competition" screen on every company (local and world market size, your share and rank, top competitors with shares, trend, dominance tier, antitrust risk), a share line in the company info rows and in businessSummary/deepTechSummary for the AI, and Business-talent purple hints on competitive moves.
Tests: an AI company founded in 2005 in the US and run well reaches >50% world share by ~2020 in most seeds; the same company founded in PRESENT_YEAR rarely exceeds 10%; a restaurant's competition is local and its world share is ~0 unless it becomes a big chain abroad; antitrust triggers at dominance; competitor list deterministic and menus pure; old business saves load; finite numbers over 30 years in us/jp/tw/ng/de.
```

### Time Machine

```text
TASK: the Time Machine. You own src/game/save.ts, src/ui/store.ts, src/ui/screens/DeathScreen.tsx, src/ui/screens/GameScreen.tsx, new src/game/timeMachine.ts, new src/ui/components/TimeMachine*.tsx, related styles in src/ui/styles/*.css (only new rules for your components), and new tests test/time-machine*.test.ts (+ updates to existing UI/save tests your change legitimately requires). Dev-server/Playwright port if needed: 4332 (Chromium at /opt/pw-browsers/chromium via executablePath).
- Snapshots: keep the life as it was at the start of each of the last several years (e.g. 10) without blowing the browser's storage: measure a 60-80 year late-game GameState, store snapshots compactly (separate storage keys or IndexedDB; prune oldest; never let a failed snapshot write break saving the main game), and survive reloads.
- Travel: a Time Machine button (in the game screen's menu/top bar and on the Death screen: "Use the Time Machine") that lists the available years ("Go back to age 34 (2014)") with a confirm, restores that snapshot exactly (queue, flags, money display context via core.ts bindMoneyContext, return chip cleared, any running AI task aborted), and logs "⏳ I used the Time Machine and went back to <year>." in the restored life.
- Rules: limited jumps per life (e.g. 3; decide and show remaining), unlimited when a Settings "Sandbox: unlimited Time Machine" option is on (add it if src/settings.ts allows; it's shared with the currency agent who owns src/settings.ts — if you need a field there, put it in sharedChangesNeeded and read it defensively). A death undone must not be recorded in the graveyard/ribbons (check store.finalizeIfDead timing so the Death screen can still offer the Time Machine before anything is recorded, or undo the record safely). Heirs (continue as child) clear the snapshot history.
Tests: snapshots are taken each year and pruned; travel restores exact state; jump limits; death → time machine → alive again with no graveyard entry; storage failure doesn't break saving; UI renders (follow test/screens.test.ts patterns).
```

### Local currency & prices of the year

```text
TASK: money in local currency and in the prices of the year. You own src/game/data/currencies.ts (new) and its converter, the money functions in src/game/core.ts (formatMoney/shortMoney/showMoney/moneyScale... keep the exports), every module's own money() helper and inline money-formatting expressions anywhere in src/game (only those expressions: route them through formatMoney/shortMoney — other agents own those files, so keep each edit tiny and local), MenuInput.money flags on money inputs anywhere (tiny edits), src/game/effects.ts and src/ai/director.ts (AI money conversion only), the effectsGuide function in src/ai/prompts.ts, src/settings.ts, src/ui/screens/SettingsScreen.tsx, src/ui/components/Dialogs.tsx and the input handling in src/ui/components/MenuList.tsx, src/ui/minigames/*.tsx (money display/inputs), the money display in src/ui/components/StatPanel.tsx/Header.tsx, and new tests test/currency*.test.ts (+ updates to existing tests your change legitimately requires).
- data/currencies.ts: for every country in world.ts (and markets.ts currencyName/currencyCode), symbol, suffix/prefix, typical decimals, the PRESENT_YEAR exchange rate per USD, and history: the currency in use each year (Deutsche Mark/franc/lira/peseta... → euro 1999/2002, Soviet ruble → Russian ruble 1992 and the 1998 redenomination, Brazil's cruzeiros → real 1994, Turkish new lira 2005, Zimbabwe dollar → US dollar 2009, Venezuela's bolívar redenominations 2008/2018/2021, Argentina's pesos, Ghana 2007, Mexico 1993, pre-independence currencies where simple) with approximate historical exchange rates (anchors per decade for major currencies; inflation differentials for the rest). Register the converter: amount_display = internal × (nominal ? priceLevel(year) : 1) × fx(country, year) — think carefully about combining US price level with the local currency's own inflation for nominal mode so 1980 yen amounts look like 1980 yen.
- Settings: "Money" — Local currency / US dollars (default local), "Prices" — As they were that year / Today's money (default as they were); apply with setMoneyDisplay on load and change (settings.ts may import core.ts).
- Inputs: mark money inputs (MenuInput.money) across the game and convert in the UI (labels, min/max/defaults shown in display units; the typed amount converted back with moneyFromInput before run()); minigames (Annual Report prices, casino bets...) display and accept display units.
- AI: the AI sees local money in prompts, so AI-returned money effects are in display units: convert them back to internal dollars in the director/effects path (moneyFromInput with the right context), and update effectsGuide ranges to display units. Never let a yen-denominated AI effect pay out ¥ as dollars.
- Check every place money is formatted by hand (toLocaleString, `$${...}`, '$' + ...) and route it through the helpers; non-money numbers stay as they are.
Tests: plain USD mode is byte-identical to before for representative texts; local mode in jp/id/ng/br/de shows the right symbol and magnitude; nominal mode 1980 US ≈ 0.25× and 1980 Japan in yen; Germany shows marks before 2002 and euros after; inputs and AI effects round-trip; shortMoney with suffix currencies.
```

### Immigration by passport, net worth, CV, era

```text
TASK: immigration by passport, net worth, CV, family and era. You own src/game/immigration.ts, new src/game/data/immigration.ts (+ data/immigration-*.ts), src/game/activities/emigrate.ts and new src/game/activities/immigration*.ts, and new tests test/immigration*.test.ts (+ updates to existing emigrate tests your change legitimately requires). Read netWorth (core.ts), cv.ts (cvScore/jobFit), finance.ts and history/timeline.ts but don't edit them.
- Data: passport strength by country and era, free-movement blocs with their years (EU/EEA free movement 1993+ and enlargements 2004/2007/2013, Schengen, the UK leaving free movement 2021, the Nordic union, GCC, Mercosur residency, ECOWAS, Trans-Tasman, Commonwealth quirks), destination selectivity (points systems, work-permit states, strict countries), programs with years: skilled work visas, student visas, spouse/family visas, investor/golden visas and citizenship-by-investment with net-worth thresholds and a locked investment (approximate, era-appropriate; programs that ended), retirement and remote-worker visas, asylum (from countries in crisis that year), visa lotteries, per-nationality quotas/backlogs, exit restrictions (Eastern Bloc before 1989-91, etc.).
- Activities › Emigrate: pick a country → see which routes you qualify for (and why not), odds, cost, wait time; apply; results by route (CV scored with cvScore/jobFit for work visas; net worth for investor routes, with the investment locked for years and able to lose value; marriage for spouse visas...). Keep sneaking in as the illegal route (undocumented status: deportation risk, no legal job, amnesties sometimes).
- Status clock in yearlyImmigration: visas expire/renew, years toward permanent residency and citizenship (citizenship test, oath), dual-citizenship rules (some countries make you renounce), deportation after serious convictions, partner and kids' visas/citizenship (citizenshipsOf already handles old saves), heirs inherit the parent's passports where rules allow, tax residency (taxes follow countryId already) and an exit tax for the very rich leaving some countries.
- Business/Investing talent purple hints for the best route; immigrationSummary for the AI.
Tests: EU citizen → EU country nearly automatic after 1993 but not in 1980; a weak passport faces lower odds and waits; golden visa needs the net worth and locks the money; work visa uses the CV; visa → PR → citizenship over the years; deportation; exit restrictions in the Eastern Bloc pre-1989; old saves without citizenships.
```
