# AnotherLife: year system handoff

The year-system continuation is integrated on `claude/fervent-cerf-1iuzn5`, draft PR **#6**
against `main`. Read `docs/ARCHITECTURE.md` for the module contracts and golden rules.
The code is prepared as **v1.5.0**. The user requested commit and release on 7 October 2026
after being informed of the browser-testing limitation below.

## Completed in this continuation

- Connected Time Machine settings, sandbox persistence, market-family forks, business fiscal
  outcomes and special-career stable rolls. Heirs retain their family timeline but start a new
  snapshot history and jump allowance.
- Connected monetary script inputs to local-currency parsing, bounds and defaults. AI effect
  validation preserves decimals and very large historical denominations before conversion.
  Currency names follow the year; currency changeovers log once without consuming RNG/IDs.
  Ancestors and graves retain their country, and money context follows the mutable action draft.
- Added immigration status to the AI context; business summaries already include competition.
- Finished era-sensitive CV projects/internships, campaigns, auditions, sports, sponsors,
  business blurbs and health text found by historical-life play tests.
- Fixed options premium sampling to use the procedural return distribution. Fixed loss-making
  deep-tech revenue valuations that added all research and compute expenses back as profit;
  patent/pipeline asset values remain separate. Grant diagnostics respect the current-year limit.
- Fixed company sales that subtracted more personal founding debt than the sale proceeds:
  unpaid personal debt remains owed, and the player’s cash stays nonnegative.
- Fixed competition cache collisions between cloned saves with the same revision but different
  rivals, market moves or first-mover advantages.
- Corrected two test-context errors without removing assertions: history text is checked against
  the country where it was produced; the biotech pipeline test advances the real business clock
  instead of stalling after an unrelated accidental death in the general life simulation.
- Updated architecture documentation and added six cross-feature regressions plus heir-fork
  coverage. No tests were skipped or removed.

## Verification

- TypeScript: clean (`npm run build` includes `tsc --noEmit`).
- Full Vitest suite: **1,490 passed, 0 failed**.
- `ANACHRONISM_LIVES=120 npx vitest run test/anachronism.test.ts`: **6 passed**;
  120 historical lives, with the existing modern-content checks retained.
- `npm run build`: passed. Vite still warns about the large main bundle (~4.83 MB minified).
- Existing passing feature tests cover the 1999–2002 tech crash, era-dependent childhood
  computers/coding, early vs present-day AI market share, antitrust, golden-visa locks,
  historical migration rules, currency input/display, old saves and Time Machine failure recovery.
- **Browser playthrough remains unverified.** Attempted `scripts/e2e-play.mjs` with seeds 7 and 19,
  AI off, against a local production preview. Chromium 134 downloaded, but launch failed with
  `process_singleton_posix.cc: socket() failed: Operation not permitted`. This is a workspace
  restriction before the page loads, not a recorded game error. No live AI-provider test ran.

## Outstanding browser verification

Run the browser checks in an environment that permits Chromium:

```sh
npm ci
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
npx vite preview --host 127.0.0.1 --port 4199
# In another terminal:
node scripts/e2e-play.mjs http://127.0.0.1:4199/ --ai off --seed 7
node scripts/e2e-play.mjs http://127.0.0.1:4199/ --ai off --seed 19
```

Expect `errorCount: 0`. Also check the Born in picker, currency amount inputs, Settings →
Time Machine sandbox switch, rewinding from life/death, and a historical life in the browser.

## Deployment and release

Cloudflare’s Git integration can deploy a push to this PR branch to production. PR-branch
preparation commits use **`[skip ci]`**; the release squash merge into `main` runs the normal
production deployment. Live site: https://snag.sugarhappy8069.workers.dev.

The user has authorized version **1.5.0**. Publish tag **v1.5.0** against the merged version-1.5.0
commit using `release.yml` (`workflow_dispatch`: `tag`, exact `target` SHA, Markdown `notes`).
Browser verification remains outstanding because of the workspace restriction; do not describe
it as passed in release notes. Confirm release/tag status on GitHub rather than inferring it
from this preparation document.

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
