# R3 playthrough: three lives through the store flow

Realistic mode, Quiet Mode on, FLAGS.yearCard on. Every tap is a menu row found by its label; every popup is answered through the store. Lines that say "not what the player sees" or show a truth column print the real number so a reader can check the estimate.

## Summary

### The three lives

- **Life 1 (seed 11).** A café founder. 1 product line launched after 2 flops; then two years of pushing hard (fatigue 10).
- **Life 2 (seed 41).** A restaurant founder. Bought an analyst's read of the valuation; hired 2 key people: Owen Jackson (read about 0 to 55, true skill 42); Charles Phillips (read about 48 to 62 after the check, true skill 62).
- **Life 3 (seed 71).** A fashion brand founder. Read a rival's profile, the what-ifs and the antitrust row, then bought a market report and an analyst for one rival's numbers and read them again two years on.

### What a player sees

- **Research.** The slider caption says the odds in a word and lists the terms that moved them, in points: "Odds likely: funding +9" at twice the normal budget on the first try, and "Odds likely: funding +9, know-how +5" once a flop has taught the field. At the normal budget with nothing else going on the line is only the word. A flop's notice says what failed and what it taught ("Seasonal Spiced Latte flopped in testing ($32,749 of R&D). The Seasonal Spiced Latte work hit a dead end. The failure still taught you the field: know-how 18. (bad news)"). Two years of "Push hard" (fatigue 10) left the line at the same budget at "Odds likely: funding +8": the pace shows no term until fatigue passes 35.
- **Hiring.** The interview prints a skill range per candidate ("about 35 to 85") and "trait not clear yet", with a footer in words for how sure the reads are. The background check costs a small share of the role's pay, names each trait and narrows every range: median width 50 points before and 14 after. A hire's true skill then shows on the Employees screen.
- **Market.** The player's own industry keeps its numbers (overview, leaderboard, regions). What is fogged is a rival's strengths (a range of stars with a chip), its product lines (a range of 0 to 100 each), the what-if profits (a range with a chip) and the antitrust chance (a word). Each fogged screen ends with a Look closer group: the sources, their prices and how far each sharpens. A purchase is kept in the Intelligence Briefing and ages (the same profile two years on was back to a wide range, with the year of the reading on its chip).
- **The year.** Quiet Mode and the year card replace the pile of popups: a few screens arrive and the card closes the year. The card is a popup for the first ten years of a life (30 cards here) and is drawn on the Life tab after that (72 cards, every founder year), so a grown life never sees it as a popup.

### Numbers

- **Popups a year, ordinary years (ages 18 to 30, 39 years in the 3 lives):** screens arriving median 1, p90 2, most 3; the old flow would have queued median 1, p90 3, most 4; asked for an answer median 1, p90 2, most 3.
- **Popups a year, founder years (ages 31 on, 12 years):** screens arriving median 4, p90 5, most 5; the old flow median 4, p90 6, most 6; asked median 4, p90 4, most 4; every screen once the replies to the answers are counted median 6, p90 7, most 8; 0.0 notices a year went to the inbox.
- **The year card:** 102 cards in 102 years. Lines (headline, stories, money, people, news) median 3, p90 3, most 5 against a limit of 8; folded groups median 2, p90 4, most 5, holding median 2, p90 6, most 8 lines. Founder years alone: lines median 3, p90 3, most 3, folded median 2, p90 5, most 6.
- **Estimates against the truth.** 34 bands read. Before any purchase: 9 of 12 inside (75%). After a purchase from a source: 21 of 22 inside (95%). The design says 80%.
  - Score bands (skills, ratings; 32 read): median width 50 points of 100 before a purchase and 26 after one.
  - Money bands (2 read, the company valuation): median ratio of the top to the bottom 1.4.
  - What-if profit ranges holding the Exact-mode figure: 3 of 4.

### Anything confusing

- **Card lines cut in the middle of a sentence.** 32 of the 102 cards have a headline or a story line cut at 90 characters (a founder's headline: "Seasonal Spiced Latte flopped in testing ($32,749 of R&D). The Seasonal Spiced Latte..."); a headline is the title of a notice and its text run together.
- **A "fair estimate" that spans 52 points.** 8 of the 11 passive score bands were 40 points or more wide (Nike quality: 24 to 100; Nike technology: 0 to 70; Owen Jackson's skill: 0 to 55), under the words "a fair estimate" and one filled dot. The range is honest and carries almost nothing.
- **Candidates who read the same.** 1 interview printed an identical range for every candidate, so the player cannot tell them apart without paying for the check.
- **The company card contradicts itself.** It prints the valuation as a range while the Exit tile on the same screen prints the exact worth ("Worth $911K" under "value $1M to $2.1M"). docs/FOG.md lists the Exit tile as left for later; on the screen it undoes the fog a row above it.
- **No market screen of another industry exists.** `knownMarket` would fog the demand and shares of a trade the player has no company in, but every screen asks it for the company's own industry, so that fog never shows in play. Life 3 read the fog that does exist: rivals, what-ifs, antitrust.
- **"Unknown factors" never appeared.** A hidden term (a hard field, a rival, public research) needs frontier research; the products of a cafe never meet one, so that wording was not read in these lives.


## Life 1: a founder runs product research to a launch (seed 11)

### Growing up: ages 1 to 30 (played through the same flow, counted and not told)

Grace Wright was born in 1996 in Seattle and is 30 in 2026. Screens arriving at a birthday: median 1, p90 2, most 3; the old flow would have queued median 1, p90 2, most 4.

| age | arrived | asked | old flow | inbox | year card |
| --- | --- | --- | --- | --- | --- |
| 3 | 3 | 1 | 2 | 0 | 3 lines, a popup |
| 6 | 2 | 1 | 1 | 0 | 3 lines, a popup |
| 9 | 2 | 1 | 2 | 0 | 3 lines, a popup |
| 12 | 2 | 2 | 2 | 0 | 3 lines, on the Life tab |
| 15 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |
| 18 | 2 | 2 | 4 | 1 | 4 lines, on the Life tab |
| 21 | 0 | 0 | 0 | 0 | 3 lines, on the Life tab |
| 24 | 3 | 3 | 3 | 0 | 3 lines, on the Life tab |
| 27 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |
| 30 | 0 | 0 | 1 | 0 | 3 lines, on the Life tab |

At 30 a relative's gift of $5,000,000 arrives, booked through the ledger as a gift (a stand-in for the years of saving a founder has; test/probe-life.ts writes the cash instead).

### Age 30, 2026: founding Maple Café

- Tap: Assets > Businesses > Start a Business > Café

> **Input: Name Your Café**
> Coffee, pastries and laptops that never leave. What will you call it?
> answer: Maple Café

> **Choice: Where Will Maple Café Be?**
> Pick a city in United States for your first café. Big cities charge more rent but bring more customers.
> [x] New York · $191K (big city: pricier, busier)
> [ ] Los Angeles · $181K
> [ ] Chicago · $181K
> [ ] Houston · $181K
> [ ] Miami · $181K
> [ ] Tucson · $181K
> [ ] San Francisco · $181K
> [ ] Seattle · $181K
> [ ] Boston · $181K
> [ ] Atlanta · $181K
> [ ] Never mind

> **Input: Choose Starting Capital**
> At least $190K to open, plus $600 in fees; anything above that stays in the company as cash. Your own money covers up to $5.0M. More than that needs a bank loan or investors: you pick how to pay next, or back out.
> answer: 570000 (the slider runs from 190000 to 49994000)

> **Input: Choose the Number of Shares**
> How many shares Maple Café is split into. It changes nobody's ownership, only what one share is worth. Many cheap shares appeal to retail investors if you take it public one day; a few expensive ones put them off. You can change it any time before listing.
> answer: 10000000 (the slider runs from 1000 to 10000000000)

> **Choice: Funding**
> Opening Maple Café in New York: $152,000 for the fit-out, equipment and opening stock, $418,000 starting working cash, and a $600 registration fee. Registration takes about 4 days. How will you pay for it? Investors value Maple Café at about $356K before their money, the same for every offer: more money costs more of the company. If you sell or close it, they get their money back first.
> [x] Pay it all myself ($571K)
> [ ] Bank loan: $428K at 7.6% (you put in $143K)
> [ ] Investors: $513K for 59% of the company (you put in $57,600)
> [ ] Investors: $342K for 49% of the company (you put in $229K)
> [ ] Investors: $171K for 32% of the company (you put in $400K)
> [ ] Never mind

> **Notice: Open for Business!**
> Maple Café is officially registered in United States! Your first café is opening in New York. You put in $570,600 of your own money, including $600 in fees and permits. You're the Founder & CEO. Every year you'll get an Annual Report to set prices and production. (good news)

### Age 30, 2026: choosing a research project

- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte  (opens the budget slider, from $16,000 to $130,000; read here, not run)
  - 0.5 x the normal budget ($16,000): $16,000 · ready in about 2 years · Odds even money: funding -12 · quality ~40 vs rivals' 48 · about +5% customers at launch
    - what Exact mode would say, not what the player sees: $16,000 · ready in about 2 years · Odds 51%: funding -12 · quality ~40 vs rivals' 48 · about +5% customers at launch
    - the terms: funding -12
  - 1 x the normal budget ($32,000): $32,000 · ready in about a year · Odds likely · quality ~54 vs rivals' 48 · about +7% customers at launch
    - what Exact mode would say, not what the player sees: $32,000 · ready in about a year · Odds 63% · quality ~54 vs rivals' 48 · about +7% customers at launch
    - the terms: none moved the odds
  - 2 x the normal budget ($64,000): $64,000 · ready in about a year · Odds likely: funding +9 · quality ~66 vs rivals' 48 · about +11% customers at launch
    - what Exact mode would say, not what the player sees: $64,000 · ready in about a year · Odds 72%: funding +9 · quality ~66 vs rivals' 48 · about +11% customers at launch
    - the terms: funding +9
  - 4 x the normal budget ($128,000): $128K · ready in about a year · Odds likely: funding +15 · quality ~73 vs rivals' 48 · about +14% customers at launch
    - what Exact mode would say, not what the player sees: $128K · ready in about a year · Odds 78%: funding +15 · quality ~73 vs rivals' 48 · about +14% customers at launch
    - the terms: funding +15
- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte
  - slider caption: $32,000 · ready in about a year · Odds likely · quality ~54 vs rivals' 48 · about +7% customers at launch

> **Notice: R&D Underway**
> Maple Café's team is developing Seasonal Spiced Latte on a $32,000 budget. It should be ready in about a year, with a quality around 54 (rivals' versions: 48). Odds it works: likely. 1 project in development now.

- the Products screen now lists the project: Seasonal Spiced Latte: ready at year-end · odds likely · quality ~54 · $32,000 budget

### Age 31, 2027

> **Notice: Maple Café: R&D Results**
> 💥 Seasonal Spiced Latte flopped in testing ($32,749 of R&D). The Seasonal Spiced Latte work hit a dead end. The failure still taught you the field: know-how 18. (bad news)

> **Minigame: Maple Café: Annual Report**
> annualReport: answer {"price":5.07,"production":96356}

> **Choice: Medical Bills**
> Your father Mark needs a hip replacement ($63,247). His insurance covers "a portion," which turns out to be a small one.
> [ ] Give $63,247
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Medical Bills**
> You told Mark no. Mark pointed out how much you have. Several times. He is on the waiting list.

> **Choice: Tax Audit**
> You've been selected for a random tax audit. What will you do?
> [ ] Cooperate fully
> [ ] Hire an accountant
> [ ] Shred my receipts
> [x] Ignore the letters

> **Notice: Penalties and interest**
> You ignored every letter. The penalties added up to $3,326. (bad news)

> **Year card (drawn on the Life tab)**
> Headline: Seasonal Spiced Latte flopped in testing ($32,749 of R&D). The Seasonal Spiced Latte...
> Age 31, 2027
> $ Net worth $5.0M (up $5.0M). Income $61K. Cash $4.5M.
> ~ 2027: A fusion reactor breaks its own record for sustained power.
> + Your companies (2): Maple Café's Seasonal Spiced Latte flopped. / Maple Café lost $56,680 on $456K of sales.
> + Money (2): The S&P 500 climbed 40% this year, and I missed the ride. / The tax man took $10,036 of my income.
> + Everyday (1): I visited a museum in Seattle.

- screens: 4 arrived (3 asked for an answer), 6 in all with the replies; the old flow would have queued 4; 0 notices went to the inbox
- year card: 3 lines, 3 folded groups holding 5 lines, drawn on the Life tab

- research result: Seasonal Spiced Latte flopped (0 launched, 1 flopped so far)

### Age 31, 2027: choosing a research project

- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte  (opens the budget slider, from $16,375 to $133,044; read here, not run)
  - 1 x the normal budget ($32,749): $32,749 · ready in about a year · Odds likely: know-how +5 · quality ~55 vs rivals' 48 · about +8% customers at launch
    - what Exact mode would say, not what the player sees: $32,749 · ready in about a year · Odds 69%: know-how +5 · quality ~55 vs rivals' 48 · about +8% customers at launch
    - the terms: know-how +5
  - 2 x the normal budget ($65,499): $65,499 · ready in about a year · Odds likely: funding +9, know-how +5 · quality ~67 vs rivals' 48 · about +12% customers at launch
    - what Exact mode would say, not what the player sees: $65,499 · ready in about a year · Odds 78%: funding +9, know-how +5 · quality ~67 vs rivals' 48 · about +12% customers at launch
    - the terms: funding +9, know-how +5
  - 4 x the normal budget ($130,997): $131K · ready in about a year · Odds likely: funding +15, know-how +5 · quality ~74 vs rivals' 48 · about +15% customers at launch
    - what Exact mode would say, not what the player sees: $131K · ready in about a year · Odds 84%: funding +15, know-how +5 · quality ~74 vs rivals' 48 · about +15% customers at launch
    - the terms: funding +15, know-how +5
- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte
  - slider caption: $65,499 · ready in about a year · Odds likely: funding +9, know-how +5 · quality ~67 vs rivals' 48 · about +12% customers at launch

> **Notice: R&D Underway**
> Maple Café's team is developing Seasonal Spiced Latte on a $65,499 budget. It should be ready in about a year, with a quality around 67 (rivals' versions: 48). Odds it works: likely. 1 project in development now.

- the Products screen now lists the project: Seasonal Spiced Latte: ready at year-end · odds likely · quality ~67 · $65,499 budget

### Age 32, 2028

> **Choice: 💡 An Idea Strikes**
> In the shower, you had an idea: the Crumb-Catching Plate. A plate with a built-in crumb drawer.
> [ ] Write it down
> [x] Forget it

> **Notice: Maple Café: R&D Results**
> 💥 Seasonal Spiced Latte flopped in testing ($66,952 of R&D). The Seasonal Spiced Latte work hit a dead end. The failure still taught you the field: know-how 31. (bad news)

> **Minigame: Maple Café: Annual Report**
> annualReport: answer {"price":5.08,"production":94168}

> **Choice: Family Business**
> Your stepsister Taylor needs $74,170 to keep her barbershop open "just one more year." It has been "just one more year" for six years. She swears it's a loan.
> [ ] Give $74,170
> [ ] Give less...
> [ ] Lend it ($74,170), to be paid back
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Family Business**
> You told Taylor no. Dinner was very quiet.

> **Choice: The Old House**
> Your stepmother Lily still owes $244,791 on the house you grew up in. Nobody asked outright. The bank statement was just left very visibly on the kitchen table.
> [ ] Give $244,791
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: The Old House**
> You told Lily no. Lily said "fine." It was not fine.

> **Year card (drawn on the Life tab)**
> Headline: Seasonal Spiced Latte flopped in testing ($66,952 of R&D). The Seasonal Spiced Latte...
> Age 32, 2028
> $ Net worth $4.9M (down $172K). Income $63K. Cash $4.5M.
> ~ 2028: Los Angeles hosts the Summer Olympics for the third time.
> + Your companies (2): Maple Café's Seasonal Spiced Latte flopped. / Maple Café lost $123K on $484K of sales.
> + Everyday (2): I started a new workout routine and quit after two weeks. / I microwaved fish in the break room at Maple Café. People were upset.

- screens: 5 arrived (4 asked for an answer), 7 in all with the replies; the old flow would have queued 6; 0 notices went to the inbox
- year card: 3 lines, 2 folded groups holding 4 lines, drawn on the Life tab

- research result: Seasonal Spiced Latte flopped (0 launched, 2 flopped so far)

### Age 32, 2028: choosing a research project

- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte  (opens the budget slider, from $16,738 to $135,995; read here, not run)
  - 1 x the normal budget ($33,476): $33,476 · ready in about a year · Odds likely: know-how +9 · quality ~55 vs rivals' 48 · about +8% customers at launch
    - what Exact mode would say, not what the player sees: $33,476 · ready in about a year · Odds 73%: know-how +9 · quality ~55 vs rivals' 48 · about +8% customers at launch
    - the terms: know-how +9
  - 2 x the normal budget ($66,952): $66,952 · ready in about a year · Odds likely: funding +9, know-how +8 · quality ~67 vs rivals' 48 · about +12% customers at launch
    - what Exact mode would say, not what the player sees: $66,952 · ready in about a year · Odds 81%: funding +9, know-how +8 · quality ~67 vs rivals' 48 · about +12% customers at launch
    - the terms: funding +9, know-how +8
  - 4 x the normal budget ($133,903): $134K · ready in about a year · Odds very likely: funding +16, know-how +8 · quality ~74 vs rivals' 48 · about +15% customers at launch
    - what Exact mode would say, not what the player sees: $134K · ready in about a year · Odds 88%: funding +16, know-how +8 · quality ~74 vs rivals' 48 · about +15% customers at launch
    - the terms: funding +16, know-how +8
- Tap: Assets > Businesses > Maple Café > Run > Products > Seasonal Spiced Latte
  - slider caption: $66,952 · ready in about a year · Odds likely: funding +9, know-how +8 · quality ~67 vs rivals' 48 · about +12% customers at launch

> **Notice: R&D Underway**
> Maple Café's team is developing Seasonal Spiced Latte on a $66,952 budget. It should be ready in about a year, with a quality around 67 (rivals' versions: 48). Odds it works: likely. 1 project in development now.

- the Products screen now lists the project: Seasonal Spiced Latte: ready at year-end · odds likely · quality ~67 · $66,952 budget

### Age 33, 2029

> **Notice: Maple Café: R&D Results**
> 🚀 Seasonal Spiced Latte launches: quality 70 (rivals' versions 48), customers will switch to you. It worked. Know-how in the field holds at 31. (good news)

> **Minigame: Maple Café: Annual Report**
> annualReport: answer {"price":5.15,"production":106805}

> **Choice: Starbucks Makes a Move**
> Starbucks (United States), a competitor, just kicked off a huge promotional season. Expect it to win customers from everyone in the market, Maple Café included.
> [x] Counter with a promotion (~$27,290)
> [ ] Trim prices 8%
> [ ] Carry on as usual

> **Notice: Counter-Programming**
> You spent $27,290 on a promotion of your own the week Starbucks made its move. Customers stayed put, mostly. (good news)

> **Choice: Long-Lost Family**
> A woman named Ava showed up at your door claiming to be your long-lost cousin from the other side of the family. She brought a casserole, a family tree drawn on a napkin and a request for $14,846. The family resemblance is mostly in the asking.
> [ ] Give $14,846
> [ ] Give less...
> [ ] Stop answering the door
> [x] Say no

> **Notice: Long-Lost Family**
> You said no.

> **Choice: Big Question**
> While walking through the park, a businessman stops you and loudly asks if you trust in a higher power. What will you say?
> [ ] Of course, 100%
> [x] Absolutely not
> [ ] Which one?

> **Year card (drawn on the Life tab)**
> Headline: Seasonal Spiced Latte launches: quality 70 (rivals' versions 48), customers will...
> Age 33, 2029
> $ Net worth $4.9M (down $265K). Income $65K. Cash $4.6M.
> ~ 2029: The asteroid Apophis passes closer to Earth than many satellites, harmlessly.
> + Your companies (2): Maple Café launched Seasonal Spiced Latte. / Maple Café lost $128K on $489K of sales.
> + Everyday (2): The shops near me couldn't keep things in stock. Energy & resources... / I threw a dinner party that went surprisingly well.

- screens: 5 arrived (4 asked for an answer), 7 in all with the replies; the old flow would have queued 6; 0 notices went to the inbox
- year card: 3 lines, 2 folded groups holding 4 lines, drawn on the Life tab

- research result: Seasonal Spiced Latte launched (1 launched, 2 flopped so far)

### Age 33, 2029: after the launch

- Tap: Assets > Businesses > Maple Café > Run > Products (read only)
  - Seasonal Spiced Latte | Quality 70 vs rivals' 48 · demand steady · 11% of your customers · wins customers from Dunkin' and Tim Hortons · tap to retire
  - Retire Weak Lines | The weakest go first (outdated, or in a kind nobody wants any more)
  - Cold Brew on Tap | Costs ~$33K to develop · demand steady · rivals' 48
  - Oat Milk Everything | Costs ~$33K to develop · demand steady · rivals' 48
  - Coffee Subscription | Costs ~$27K to develop · demand steady · rivals' 49
  - House-Roasted Beans | Costs ~$32K to develop · demand steady · rivals' 45
  - Matcha Bar | Costs ~$27K to develop · demand steady · rivals' 48
  - Breakfast Sandwiches | Costs ~$35K to develop · demand steady · rivals' 48
  - Avocado Toast | Costs ~$32K to develop · demand steady · rivals' 48
  - Flat White | Costs ~$35K to develop · demand steady · rivals' 49
- Profile ambition: Driven (the number 53 is not shown in Realistic); posture steady; fatigue 0
- Tap: Activities > Life Priorities > Push hard

> **Notice: Work Pace Set**
> You'll push hard from next year. Results come faster, but fatigue builds, and you can burn out.

### Age 34, 2030

> **Minigame: Maple Café: Annual Report**
> annualReport: answer {"price":5.19,"production":115204}

> **Choice: Anniversary**
> Your stepmother Lily has always dreamed of a cruise for a big anniversary ($27,443). There will be a captain's dinner. There will be a buffet. There will be photos of the buffet.
> [ ] Give $27,443
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Anniversary**
> You told Lily no. Lily pointed out how much you have. Several times.

> **Choice: Rough Patch**
> Your stepbrother Ryan is behind on rent ($36,241). He got laid off.
> [ ] Give $36,241
> [ ] Give less...
> [ ] Lend it ($36,241), to be paid back
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Rough Patch**
> You told Ryan no. Ryan said "fine." It was not fine.

> **Choice: Feeling Lucky?**
> The clerk slides a strip of scratch-off tickets across the counter at $5.46 each. Today is supposedly your day. What will you do?
> [ ] Buy one ($5.46)
> [ ] Buy ten ($55)
> [x] No thanks

> **Year card (drawn on the Life tab)**
> Headline: Maple Café lost $33,774 on $628K of sales.
> Age 34, 2030
> $ Net worth $4.9M (down $142K). Income $68K. Cash $4.6M.
> ~ 2030: The World Cup turns 100 with games on three continents.
> + Everyday (1): I took a week of vacation and checked my email every day.

- screens: 4 arrived (4 asked for an answer), 6 in all with the replies; the old flow would have queued 4; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 1 lines, drawn on the Life tab

### Age 35, 2031

> **Minigame: Maple Café: Annual Report**
> annualReport: answer {"price":5.21,"production":107306}

> **Choice: Medical Bills**
> Your father Mark needs cataract surgery ($70,461). His insurance covers "a portion," which turns out to be a small one.
> [ ] Give $70,461
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Medical Bills**
> You told Mark no. Dinner was very quiet. He is on the waiting list.

> **Choice: Sibling Wedding**
> Your stepsister Taylor is marrying Grace Scott and asked you to "chip in" on the wedding ($45,021). Your chip would be the size of the venue.
> [ ] Give $45,021
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Sibling Wedding**
> You told Taylor no. Taylor pointed out how much you have. Several times.

> **Choice: Big Mistake**
> You emailed the whole company a picture of your cat instead of the quarterly report. Nobody knows it was you yet. What will you do?
> [ ] Confess
> [ ] Quietly try to fix it
> [x] Blame the new intern

> **Notice: Exposed**
> The intern had a timestamped alibi. Now everyone knows it was you and that you'll throw people under the bus. (bad news)

> **Year card (drawn on the Life tab)**
> Headline: Maple Café lost $39,074 on $639K of sales.
> Age 35, 2031
> $ Net worth $4.9M (down $119K). Income $70K. Cash $4.7M.
> ~ 2031: Astronauts walk on the Moon again, the first since 1972.
> + Everyday (1): I did my taxes three hours before the deadline.

- screens: 4 arrived (4 asked for an answer), 7 in all with the replies; the old flow would have queued 3; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 1 lines, drawn on the Life tab

### Age 35, 2031: two years of pushing hard

- pace in force push; fatigue 10; burnouts 0

### Age 35, 2031: Heavy R&D, the other research screen

- Tap: Assets > Businesses > Maple Café > Money > Invest My Own Money
  - slider caption: Personal funds $3.5M · company cash $1.2M · 31.9 years of losses. Ownership unchanged; not revenue.

> **Notice: Cash Injected**
> You moved $1,168,508 into Maple Café. Company cash: $1,244,617.

- the row: Espresso Bar Counter | $304K · 4 years · odds unlikely · rivals could follow about 2039
- tapped, it asks: Start Espresso Bar Counter? It costs $304K, takes 4 years. If it flops, the money is gone. Odds unlikely: skill +2.

### The same odds line after the pushed years

- Tap: Assets > Businesses > Maple Café > Run > Products > Cold Brew on Tap  (opens the budget slider, from $17,528 to $140,221; read here, not run)
  - 1 x the normal budget ($35,055): $35,055 · ready in about a year · Odds likely · quality ~55 vs rivals' 48 · about +6% customers at launch
    - what Exact mode would say, not what the player sees: $35,055 · ready in about a year · Odds 65% · quality ~55 vs rivals' 48 · about +6% customers at launch
    - the terms: none moved the odds
  - 2 x the normal budget ($70,110): $70,110 · ready in about a year · Odds likely: funding +8 · quality ~67 vs rivals' 48 · about +9% customers at launch
    - what Exact mode would say, not what the player sees: $70,110 · ready in about a year · Odds 73%: funding +8 · quality ~67 vs rivals' 48 · about +9% customers at launch
    - the terms: funding +8

## Life 2: a founder hires through the fogged screen and uses Look closer (seed 41)

### Growing up: ages 1 to 30 (played through the same flow, counted and not told)

Madison Scott was born in 1996 in Seattle and is 30 in 2026. Screens arriving at a birthday: median 2, p90 3, most 4; the old flow would have queued median 2, p90 3, most 4.

| age | arrived | asked | old flow | inbox | year card |
| --- | --- | --- | --- | --- | --- |
| 3 | 2 | 1 | 1 | 0 | 3 lines, a popup |
| 6 | 3 | 1 | 2 | 0 | 4 lines, a popup |
| 9 | 2 | 1 | 2 | 0 | 3 lines, a popup |
| 12 | 1 | 1 | 2 | 0 | 3 lines, on the Life tab |
| 15 | 4 | 3 | 3 | 0 | 3 lines, on the Life tab |
| 18 | 3 | 2 | 4 | 1 | 5 lines, on the Life tab |
| 21 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |
| 24 | 2 | 2 | 2 | 0 | 3 lines, on the Life tab |
| 27 | 3 | 3 | 3 | 0 | 3 lines, on the Life tab |
| 30 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |

At 30 a relative's gift of $5,000,000 arrives, booked through the ledger as a gift (a stand-in for the years of saving a founder has; test/probe-life.ts writes the cash instead).

### Age 30, 2026: founding Harbor Grill

- Tap: Assets > Businesses > Start a Business > Restaurant

> **Input: Name Your Restaurant**
> Sit-down dining. Thin margins, long hours, loyal regulars. What will you call it?
> answer: Harbor Grill

> **Choice: Where Will Harbor Grill Be?**
> Pick a city in United States for your first restaurant. Big cities charge more rent but bring more customers.
> [x] New York · $481K (big city: pricier, busier)
> [ ] Los Angeles · $461K
> [ ] Chicago · $461K
> [ ] Houston · $441K
> [ ] Miami · $441K
> [ ] Tucson · $441K
> [ ] San Francisco · $441K
> [ ] Seattle · $441K
> [ ] Boston · $441K
> [ ] Atlanta · $441K
> [ ] Never mind

> **Input: Choose Starting Capital**
> At least $480K to open, plus $600 in fees; anything above that stays in the company as cash. Your own money covers up to $6.1M. More than that needs a bank loan or investors: you pick how to pay next, or back out.
> answer: 960000 (the slider runs from 480000 to 61006010)

> **Input: Choose the Number of Shares**
> How many shares Harbor Grill is split into. It changes nobody's ownership, only what one share is worth. Many cheap shares appeal to retail investors if you take it public one day; a few expensive ones put them off. You can change it any time before listing.
> answer: 10000000 (the slider runs from 1000 to 10000000000)

> **Choice: Funding**
> Opening Harbor Grill in New York: $384,000 for the fit-out, equipment and opening stock, $576,000 starting working cash, and a $600 registration fee. Registration takes about 4 days. How will you pay for it? Investors value Harbor Grill at about $652K before their money, the same for every offer: more money costs more of the company. If you sell or close it, they get their money back first.
> [x] Pay it all myself ($961K)
> [ ] Bank loan: $720K at 7.8% (you put in $241K)
> [ ] Investors: $864K for 57% of the company (you put in $96,600)
> [ ] Investors: $576K for 47% of the company (you put in $385K)
> [ ] Investors: $288K for 31% of the company (you put in $673K)
> [ ] Never mind

> **Notice: Open for Business!**
> Harbor Grill is officially registered in United States! Your first restaurant is opening in New York. You put in $960,600 of your own money, including $600 in fees and permits. You're the Founder & CEO. Every year you'll get an Annual Report to set prices and production. (good news)

### Age 31, 2027

> **Notice: Milestones!**
> 2027: Big days at the office. 💵 Harbor Grill: First profitable year 💰 Harbor Grill: $1M in yearly sales (good news)

> **Minigame: Harbor Grill: Annual Report**
> annualReport: answer {"price":27.9,"production":45739}

> **Choice: Long-Lost Family**
> A man named Anthony showed up at your door claiming to be your great-uncle by marriage. He brought a casserole, a family tree drawn on a napkin and a request for $13,158. The family resemblance is mostly in the asking.
> [ ] Give $13,158
> [ ] Give less...
> [ ] Stop answering the door
> [x] Say no

> **Notice: Long-Lost Family**
> You passed.

> **Choice: Can't Miss**
> Your cousin Tyler has a can't-miss opportunity: a sure-thing racehorse. Tyler needs $58,593 from you by Friday and "can't say more over the phone."
> [ ] Give $58,593
> [ ] Give less...
> [x] Say no

> **Notice: Can't Miss**
> You said no.

> **Choice: Team Building**
> Mason, your supervisor at Harbor Grill, is sponsoring a team building activity: the whole team is going to do an escape room. Will you go?
> [ ] Sure, I'll go
> [x] No, that sounds lame

> **Notice: Lone wolf**
> You skipped it. Everyone came back with inside jokes you will never understand.

> **Year card (drawn on the Life tab)**
> Headline: Big days at the office. Harbor Grill: First profitable year Harbor Grill:...
> Age 31, 2027
> $ Net worth $6.1M (up $5.0M). Income $67K. Cash $5.2M.
> ~ 2027: A fusion reactor breaks its own record for sustained power.
> + Your companies (3): Harbor Grill made $29,013 in profit on $1.1M of sales. / Harbor Grill: first profitable year! / Harbor Grill: $1M in yearly sales!
> + Money (1): The tax bill came to $11,425 this year.
> + Everyday (2): I adopted a sourdough starter. / I got a "Best Attitude" certificate at Harbor Grill.

- screens: 5 arrived (4 asked for an answer), 8 in all with the replies; the old flow would have queued 5; 0 notices went to the inbox
- year card: 3 lines, 3 folded groups holding 6 lines, drawn on the Life tab

### Age 31, 2027: the company card, before and after Look closer

- Tap: Assets > Businesses > Harbor Grill (read only)
  - Restaurant · New York, United States · since 2026 · 1 restaurant · you are CEO
  - Cash $598K · value $1M to $2.1M · all yours | 2026: sales $1.1M · profit $29,013
  - <0.01% of the United States' restaurant market · one of thousands
  - Steady: Few people know you yet: a marketing campaign builds the brand.
  - Look closer | Pay for a sharper number
- the valuation on the card: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Harbor Grill valuation | $1M to $2.1M | $1.0M to $2.3M | [●○○] | $911K | NO |

- the Exit tile on the same screen says: Exit | Worth $911K
- Tap: Assets > Businesses > Harbor Grill > Look closer (read only)
  - An analyst | $31K · sharpens ±30% to ±12%
  - Due diligence | $8,224 · sharpens ±30% to ±5%
  - A hacker for hire | $21K · sharpens ±30% to ±7%
- Tap: Assets > Businesses > Harbor Grill > Look closer > An analyst
- Tap: Assets > Businesses > Harbor Grill (read only)
  - Restaurant · New York, United States · since 2026 · 1 restaurant · you are CEO
  - Cash $598K · value about $1M · all yours | 2026: sales $1.1M · profit $29,013
  - <0.01% of the United States' restaurant market · one of thousands
  - Steady: Few people know you yet: a marketing campaign builds the brand.
- the valuation after the analyst: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Harbor Grill valuation | about $1M | $918K to $1.3M | [●●○] | $911K | NO |

- a second analyst the same year: You already have this year's reading.

### Age 31, 2027: a hire from the interview alone

- Tap: Assets > Businesses > Harbor Grill > Run > Employees > Hire Key Staff (read only)
  - Head Chef | Raises quality · about $63,732/yr · headhunter $3,824
  - Sous Chef | Raises quality · about $49,341/yr · headhunter $2,960
  - Front-of-House Manager | Brings in customers · about $53,453/yr · headhunter $3,207
  - Sommelier | Brings in customers · about $51,397/yr · headhunter $3,084
  - Bookkeeper | Cuts costs and keeps the books clean · about $46,257/yr · headhunter $2,775
  - General Manager | More capacity, lower unit costs · about $71,956/yr · headhunter $4,317
  - Food Safety Lead | Raises hygiene and quality · about $53,453/yr · headhunter $3,207
  - Look closer: after an interview, background checks (3% of the role's pay) name each trait and narrow the skill read.
- Tap: Assets > Businesses > Harbor Grill > Run > Employees > Hire Key Staff > Head Chef
- the shortlist as the interview leaves it: the printed range against the true skill (the player never sees the last columns)

| candidate | skill reads | chip | trait | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Owen Jackson | about 0 to 55 | [●○○] | not clear yet | 42 | yes |
| Megan Adams | about 0 to 55 | [●○○] | not clear yet | 46 | yes |

> **Choice: Hiring a Head Chef**
> You interviewed 2 candidates in New York: • Owen Jackson, 38: skill about 0 to 55, asks $53,453, trait not clear yet. • Megan Adams, 37: skill about 0 to 55, asks $58,593, trait not clear yet. Skill reads are a fair estimate. A background check ($1,912) sharpens them and names each trait.
> [x] Owen Jackson · about 0 to 55 · $53,453
> [ ] Megan Adams · about 0 to 55 · $58,593
> [ ] Check backgrounds · $1,912
> [ ] Hire nobody

> **Notice: Hired!**
> Owen Jackson accepted your offer to become Harbor Grill's Head Chef for $53,453 a year. He starts Monday. (good news)

### Age 32, 2028

> **Minigame: Harbor Grill: Annual Report**
> annualReport: answer {"price":28.32,"production":45862}

> **Choice: The Old House**
> Your stepmother Charlotte still owes $307,943 on the house you grew up in. Nobody asked outright. The bank statement was just left very visibly on the kitchen table.
> [ ] Give $307,943
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: The Old House**
> You told Charlotte no. Dinner was very quiet.

> **Choice: Office Rumor**
> Your coworker Abigail started a rumor that you faked a doctor's note to go to a theme park. What will you do?
> [ ] Confront them
> [ ] Have a talk with them
> [ ] Start a rumor about them
> [x] Pay no attention

> **Notice: Unbothered**
> You paid no attention. The rumor died within a week.

> **Year card (drawn on the Life tab)**
> Headline: Harbor Grill lost $19,352 on $1.3M of sales.
> Age 32, 2028
> $ Net worth $6.1M (down $138K). Income $69K. Cash $5.2M.
> ~ 2028: Los Angeles hosts the Summer Olympics for the third time.
> + Everyday (2): I flew first class and got a warm towel. / I spent a weekend doing absolutely nothing.

- screens: 3 arrived (3 asked for an answer), 5 in all with the replies; the old flow would have queued 3; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 2 lines, drawn on the Life tab

### Age 32, 2028: a hire after the background check

- Tap: Assets > Businesses > Harbor Grill > Run > Employees > Hire Key Staff > Sous Chef
- the shortlist as the interview leaves it: the printed range against the true skill (the player never sees the last columns)

| candidate | skill reads | chip | trait | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Megan Williams | about 0 to 30 | [●○○] | not clear yet | 40 | NO |
| Charles Phillips | about 45 to 95 | [●○○] | not clear yet | 62 | yes |
| Sophia Davis | about 10 to 60 | [●○○] | not clear yet | 53 | yes |

> **Choice: Hiring a Sous Chef**
> You interviewed 3 candidates in New York: • Megan Williams, 46: skill about 0 to 30, asks $44,445, trait not clear yet. • Charles Phillips, 61: skill about 45 to 95, asks $61,377, trait not clear yet. • Sophia Davis, 50: skill about 10 to 60, asks $70,372, trait not clear yet. Skill reads are a fair estimate. A background check ($1,524) sharpens them and names each trait.
> [ ] Megan Williams · about 0 to 30 · $44,445
> [ ] Charles Phillips · about 45 to 95 · $61,377
> [ ] Sophia Davis · about 10 to 60 · $70,372
> [x] Check backgrounds · $1,524
> [ ] Hire nobody

- the shortlist after the background check: the printed range against the true skill (the player never sees the last columns)

| candidate | skill reads | chip | trait | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Megan Williams | about 38 to 52 | [●●●] | penny-pincher | 40 | yes |
| Charles Phillips | about 48 to 62 | [●●●] | perfectionist | 62 | yes |
| Sophia Davis | about 46 to 60 | [●●●] | overqualified | 53 | yes |

> **Choice: Hiring a Sous Chef**
> You interviewed 3 candidates in New York: • Megan Williams, 46: skill about 38 to 52, asks $44,445, trait penny-pincher. • Charles Phillips, 61: skill about 48 to 62, asks $61,377, trait perfectionist. • Sophia Davis, 50: skill about 46 to 60, asks $70,372, trait overqualified. Background checks are in: the traits are named and the skill reads are tighter.
> [ ] Megan Williams · about 38 to 52 · $44,445
> [x] Charles Phillips · about 48 to 62 · $61,377
> [ ] Sophia Davis · about 46 to 60 · $70,372
> [ ] Hire nobody

> **Notice: Hired!**
> Charles Phillips accepted your offer to become Harbor Grill's Sous Chef for $61,377 a year. He starts Monday. (good news)

- Tap: Assets > Businesses > Harbor Grill > Run > Employees (read only)
  - -- Leadership team (2/3) --
  - Owen Jackson | Head Chef · skill 42 · morale 73%
  - Charles Phillips | Sous Chef · skill 62 · morale 76%
  - -- Everyone --
  - Team Building | Backyard barbecue... · about $2,095
  - Give Everyone a Raise | Pay up 5% for good (keeps up with inflation)
  - Pay Policy | Market rate pay (100% of the going rate)

### Age 33, 2029

> **Minigame: Harbor Grill: Annual Report**
> annualReport: answer {"price":29.1,"production":47295}

> **Choice: Supplier Price Hike**
> Your main supplier says a bad harvest sent ingredient prices soaring: prices go up 15% next year.
> [ ] Absorb the cost (+15%)
> [ ] Negotiate a long-term contract
> [x] Switch to a cheaper supplier

> **Notice: Cheaper Supplier**
> You switched to a budget supplier. Costs are down; so is quality (49%). Customers may notice.

> **Choice: Medical Bills**
> Your stepmother Charlotte needs cataract surgery ($87,205). Her insurance covers "a portion," which turns out to be a small one.
> [ ] Give $87,205
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Medical Bills**
> You told Charlotte no. Charlotte pointed out how much you have. Several times. She is on the waiting list.

> **Choice: Class Reunion**
> The reunion is on Saturday. Someone from your old class keeps asking if you'll come. What will you do?
> [ ] Go and catch up
> [ ] Go and brag
> [x] Skip it

> **Year card (drawn on the Life tab)**
> Headline: Harbor Grill lost $46,805 on $1.4M of sales.
> Age 33, 2029
> $ Net worth $6.2M (down $138K). Income $71K. Cash $5.3M.
> ~ 2029: The asteroid Apophis passes closer to Earth than many satellites, harmlessly.
> + Everyday (2): I spent a weekend reorganizing my closet. / I microwaved fish in the break room at Harbor Grill. People were up...

- screens: 4 arrived (4 asked for an answer), 6 in all with the replies; the old flow would have queued 4; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 2 lines, drawn on the Life tab

### The Intelligence Briefing after the purchases

- Tap: Assets > Intelligence Briefing (read only)
  - -- What you know --
  - Harbor Grill valuation: $872K to $1.1M [●○○ as of 2027]
  - Refresh Harbor Grill valuation | Due diligence · $8,720 · sharpens ±24% to ±5%
  - -- Standing orders --
  - Standing orders | Off

## Life 3: a founder reads a fogged market and buys intel (seed 71)

### Growing up: ages 1 to 30 (played through the same flow, counted and not told)

Brittany Wright was born in 1996 in Chicago and is 30 in 2026. Screens arriving at a birthday: median 1, p90 3, most 4; the old flow would have queued median 1, p90 2, most 5.

| age | arrived | asked | old flow | inbox | year card |
| --- | --- | --- | --- | --- | --- |
| 3 | 3 | 1 | 2 | 0 | 3 lines, a popup |
| 6 | 2 | 1 | 1 | 0 | 3 lines, a popup |
| 9 | 3 | 2 | 2 | 0 | 3 lines, a popup |
| 12 | 2 | 2 | 2 | 0 | 3 lines, on the Life tab |
| 15 | 2 | 2 | 1 | 0 | 3 lines, on the Life tab |
| 18 | 1 | 1 | 3 | 1 | 4 lines, on the Life tab |
| 21 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |
| 24 | 2 | 2 | 2 | 0 | 3 lines, on the Life tab |
| 27 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |
| 30 | 1 | 1 | 1 | 0 | 3 lines, on the Life tab |

At 30 a relative's gift of $5,000,000 arrives, booked through the ledger as a gift (a stand-in for the years of saving a founder has; test/probe-life.ts writes the cash instead).

### Age 30, 2026: founding Harbor Fashion

- Tap: Assets > Businesses > Start a Business > Fashion Brand

> **Input: Name Your Fashion Brand**
> Clothes, hype and a very opinionated creative director. What will you call it?
> answer: Harbor Fashion

> **Choice: Where Will Harbor Fashion Be?**
> Pick a city in United States for your first boutique. Big cities charge more rent but bring more customers.
> [x] New York · $321K (big city: pricier, busier)
> [ ] Los Angeles · $311K
> [ ] Chicago · $311K
> [ ] Houston · $291K
> [ ] Miami · $291K
> [ ] Tucson · $291K
> [ ] San Francisco · $291K
> [ ] Seattle · $291K
> [ ] Boston · $291K
> [ ] Atlanta · $291K
> [ ] Never mind

> **Input: Choose Starting Capital**
> At least $320K to open, plus $600 in fees; anything above that stays in the company as cash. Your own money covers up to $5.0M. More than that needs a bank loan or investors: you pick how to pay next, or back out.
> answer: 640000 (the slider runs from 320000 to 49994000)

> **Input: Choose the Number of Shares**
> How many shares Harbor Fashion is split into. It changes nobody's ownership, only what one share is worth. Many cheap shares appeal to retail investors if you take it public one day; a few expensive ones put them off. You can change it any time before listing.
> answer: 10000000 (the slider runs from 1000 to 10000000000)

> **Choice: Funding**
> Opening Harbor Fashion in New York: $256,000 for the fit-out, equipment and opening stock, $384,000 starting working cash, and a $600 registration fee. Registration takes about 4 days. How will you pay for it? Investors value Harbor Fashion at about $733K before their money, the same for every offer: more money costs more of the company. If you sell or close it, they get their money back first.
> [x] Pay it all myself ($641K)
> [ ] Bank loan: $480K at 7.7% (you put in $161K)
> [ ] Investors: $576K for 44% of the company (you put in $64,600)
> [ ] Investors: $384K for 34% of the company (you put in $257K)
> [ ] Investors: $192K for 21% of the company (you put in $449K)
> [ ] Never mind

> **Notice: Open for Business!**
> Harbor Fashion is officially registered in United States! Your first boutique is opening in New York. You put in $640,600 of your own money, including $600 in fees and permits. You're the Founder & CEO. Every year you'll get an Annual Report to set prices and production. (good news)

### Age 31, 2027

> **Notice: Milestones!**
> 2027: A big day at the office. 💰 Harbor Fashion: $1M in yearly sales (good news)

> **Minigame: Harbor Fashion: Annual Report**
> annualReport: answer {"price":60.97,"production":19841}

> **Choice: The Old House**
> Your stepmother Abigail still owes $249,336 on the house you grew up in. Nobody asked outright. The bank statement was just left very visibly on the kitchen table.
> [ ] Give $249,336
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: The Old House**
> You told Abigail no. Dinner was very quiet.

> **Choice: Second Act**
> Your mother Elizabeth wants to finally open an antique shop and asked you to invest ($72,441). "It's my dream, and you're the only one in the family with money," she said, while three other relatives nodded.
> [ ] Give $72,441
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Second Act**
> You told Elizabeth no. Elizabeth pointed out how much you have. Several times.

> **Year card (drawn on the Life tab)**
> Headline: A big day at the office. Harbor Fashion: $1M in yearly sales
> Age 31, 2027
> $ Net worth $5.0M (up $5.0M). Income $81K. Cash $4.4M.
> ~ 2027: A fusion reactor breaks its own record for sustained power.
> + Your companies (3): I had an idea: the Glow-in-the-Dark Kite. 🪁 / Harbor Fashion lost $9,301 on $1.1M of sales. / Harbor Fashion: $1M in yearly sales!
> + Money (1): I handed $15,663 over to the government in taxes.
> + Everyday (1): I spent a weekend doing absolutely nothing.

- screens: 4 arrived (3 asked for an answer), 6 in all with the replies; the old flow would have queued 4; 0 notices went to the inbox
- year card: 3 lines, 3 folded groups holding 5 lines, drawn on the Life tab

### Age 32, 2028

> **Minigame: Harbor Fashion: Annual Report**
> annualReport: answer {"price":61.1,"production":19504}

> **Choice: Long-Lost Family**
> A woman named Mary showed up at your door claiming to be your second cousin twice removed. She brought a casserole, a family tree drawn on a napkin and a request for $10,538. The family resemblance is mostly in the asking.
> [ ] Give $10,538
> [ ] Give less...
> [ ] Stop answering the door
> [x] Say no

> **Notice: Long-Lost Family**
> You politely declined.

> **Year card (drawn on the Life tab)**
> Headline: Harbor Fashion lost $52,554 on $1.2M of sales.
> Age 32, 2028
> $ Net worth $5.1M (down $85K). Income $83K. Cash $4.5M.
> ~ 2028: Los Angeles hosts the Summer Olympics for the third time.
> + Everyday (1): I went to the Harbor Fashion holiday party.

- screens: 2 arrived (2 asked for an answer), 3 in all with the replies; the old flow would have queued 2; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 1 lines, drawn on the Life tab

### Age 32, 2028: the market screens

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition (read only)
  - $109B a year in the United States, steady. You: <0.01%, #39 of 39 named players, Startup. Leader: Nike 1.1%
  - -- Explore the Market --
  - Market Overview | About $109B a year · steady · fragmented
  - Leaderboard | Nike leads with 1.1% · you are #39
  - Segments | You play in high street
  - Regions & Countries | the United States and the countries where you could expand
  - History | Share <0.01% · ▇█
  - Rival Profiles | 38 named competitors · tap one for its story
  - -- Strategy --
  - Competitive Moves | Price offensive, talent raid, buy-outs, lobbying
  - Regional Brand Campaigns | Win one country’s customers for 3 years
  - Protect & Partner | Defend your home market, diversify suppliers
  - What-If Scenarios | What each move should do to your share and profit
  - Look closer | Pay for a sharper number

Market Overview is the player's own industry, so it keeps its numbers (the owner's rule). What follows is what is fogged.

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Market Overview (read only)
  - Market size: about $109B a year in the United States · steady
  - Home vs world: this trade is local to the United States. Your share of the world's fashion spending is <0.01% (it takes a global chain to register)
  - You: <0.01% · #39 of 39 named players · Startup
  - Concentration: index ≈ 8 (fragmented), like 1250.0 equal-sized firms. The top three hold 2.9%.
  - The field: 33 real companies in the top 38, plus thousands of independents holding 85%
  - Antitrust: no risk at your size (regulators here only go after companies with more than about 35% of a market)
  - It's the future. The business is local: you compete with everyone else in the United States.
- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles (read only)
  - Nike | 1.1% → · giant · est. 1964
  - Gap | 0.93% → · giant · est. 1969
  - Zara | 0.84% → · major · est. 1975
  - H&M | 0.74% → · major · est. 1947
  - Prairie Threads | 0.68% → · major · local challenger · est. 2013
  - Uniqlo | 0.63% ↗ · major · est. 1984
  - Old Navy | 0.63% → · major · est. 1994
  - Levi's | 0.62% → · major · est. 1853
  - adidas | 0.60% → · major · est. 1949
  - Forever 21 | 0.48% → · major · est. 1984
  - American Eagle Outfitters | 0.48% → · major · est. 1977
  - Abercrombie & Fitch | 0.46% → · major · est. 1892
  - …and 26 smaller named players.
  - Look closer | Pay for a sharper number

### Nike: the profile the player reads

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike (read only)
  - A real company · founded 1964 (63 years) · based in United States
  - Size: giant · 1.1% of the market → · segment mass
  - Strengths (estimated): quality ⭐⭐⭐ to ⭐⭐⭐⭐⭐ · technology ⭐⭐⭐ to ⭐⭐⭐⭐ · prices like yours [●○○]
  - Plays in: United States, Canada, United Kingdom, Germany, Japan, France, Australia, Brazil
  - Sells: Workwear Line (60 to 100) · Athleisure Range (50 to 100) · Denim Line (55 to 100) · Kidswear Line (60 to 100) · +10 more [●○○]
  - In 2027 it signed a distribution partnership (simulated)
  - In 2026 it ran a heavy promotional season (simulated)
  - Likely next (our guess): Likely to hold its position and defend its customers
  - Buy out Nike | $1.8B · its customers, 284 boutiques, 14 product lines and its know-how come with it | greyed out: Nike is more than 3 times your size. Grow first, or buy a smaller rival.
- Nike's numbers: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Nike quality | 25 to 100 | 24 to 100 | [●○○] | 75 | yes |
| Nike technology | 0 to 70 | 0 to 70 | [●○○] | 79 | NO |
| Nike Workwear Line quality | 60 to 100 | 61 to 100 | [●○○] | 88 | yes |
| Nike Athleisure Range quality | 50 to 100 | 48 to 100 | [●○○] | 70 | yes |
| Nike Denim Line quality | 55 to 100 | 54 to 100 | [●○○] | 84 | yes |
| Nike Kidswear Line quality | 60 to 100 | 61 to 100 | [●○○] | 84 | yes |

### What-If Scenarios: ranges of profit, and what Exact mode would print

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > What-If Scenarios (read only)
  - If you cut prices hard: share up 0.01 pts, roughly +$63K to +$211K profit (15% off for the year, two years of extra customers). [●○○]
    - Exact mode: If you cut prices hard: share up 0.01 pts, about +$116K profit (15% off for the year, two years of extra customers).
  - If you poach a team from Nike: share unchanged, roughly -$84K to +$6,323 profit (signing bonuses; a better product, a weaker rival). [●○○]
    - Exact mode: If you poach a team from Nike: share unchanged, about -$37,267 profit (signing bonuses; a better product, a weaker rival).
  - If you run a brand campaign in United States: share up 0.01 pts, roughly +$211K to +$316K profit, costs $106K (3 years, fades without a renewal). [●○○]
    - Exact mode: If you run a brand campaign in United States: share up 0.01 pts, about +$164K profit, costs $106K (3 years, fades without a renewal).
  - If you defend your home market: share unchanged, roughly -$53K to +$42K profit, costs $73,767 (stickier customers for 3 years). [●○○]
    - Exact mode: If you defend your home market: share unchanged, about +$2,091 profit, costs $73,767 (stickier customers for 3 years).
- 3 of 4 profit ranges hold the Exact-mode figure

### Look closer: what each source costs, and the one that is illegal

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike > Look closer (read only)
  - Do the homework yourself | Free · sharpens ±30% to ±25%
  - A year of the trade press | $2,740 · stays at ±30%
  - A market report | $21K · sharpens ±30% to ±18%
  - An analyst | $70K · sharpens ±30% to ±12%
  - A private investigator | $35K · sharpens ±30% to ±14%
  - An informant on the inside | $14K · sharpens ±30% to ±10%
  - A hacker for hire | $46K · sharpens ±30% to ±7%
- tapping "An informant on the inside" first asks: It's illegal. If it comes out, expect trouble.
- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike > Look closer > A market report

### Nike again, after a market report

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike (read only)
  - A real company · founded 1964 (63 years) · based in United States
  - Size: giant · 1.1% of the market → · segment mass
  - Strengths (estimated): quality ⭐⭐⭐ to ⭐⭐⭐⭐ · technology ⭐⭐⭐ to ⭐⭐⭐⭐⭐ · prices like yours [●○○]
  - Plays in: United States, Canada, United Kingdom, Germany, Japan, France, Australia, Brazil
  - Sells: Workwear Line (75 to 100) · Athleisure Range (45 to 90) · Denim Line (75 to 100) · Kidswear Line (60 to 100) · +10 more [●○○]
  - In 2027 it signed a distribution partnership (simulated)
  - In 2026 it ran a heavy promotional season (simulated)
  - Likely next (our guess): Likely to hold its position and defend its customers
  - Buy out Nike | $1.8B · its customers, 284 boutiques, 14 product lines and its know-how come with it | greyed out: Nike is more than 3 times your size. Grow first, or buy a smaller rival.
- Nike's numbers after the report: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Nike quality | 35 to 85 | 37 to 84 | [●○○] | 75 | yes |
| Nike technology | 55 to 100 | 57 to 100 | [●○○] | 79 | yes |
| Nike Workwear Line quality | 75 to 100 | 77 to 100 | [●○○] | 88 | yes |
| Nike Athleisure Range quality | 45 to 90 | 44 to 91 | [●○○] | 70 | yes |
| Nike Denim Line quality | 75 to 100 | 77 to 100 | [●○○] | 84 | yes |
| Nike Kidswear Line quality | 60 to 100 | 62 to 100 | [●○○] | 84 | yes |

- the same report again this year: You already have this year's reading.
- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike > Look closer > An analyst

### Nike again, after an analyst as well (two independent readings merged)

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike (read only)
  - A real company · founded 1964 (63 years) · based in United States
  - Size: giant · 1.1% of the market → · segment mass
  - Strengths (estimated): quality about ⭐⭐⭐ · technology about ⭐⭐⭐⭐ · prices like yours [●●○]
  - Plays in: United States, Canada, United Kingdom, Germany, Japan, France, Australia, Brazil
  - Sells: Workwear Line (about 90) · Athleisure Range (about 60) · Denim Line (about 85) · Kidswear Line (about 75) · +10 more [●●○]
  - In 2027 it signed a distribution partnership (simulated)
  - In 2026 it ran a heavy promotional season (simulated)
  - Likely next (our guess): Likely to hold its position and defend its customers
  - Buy out Nike | $1.8B · its customers, 284 boutiques, 14 product lines and its know-how come with it | greyed out: Nike is more than 3 times your size. Grow first, or buy a smaller rival.
- Nike's numbers after the report and the analyst: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Nike quality | about 70 | 56 to 82 | [●●○] | 75 | yes |
| Nike technology | about 75 | 60 to 86 | [●●○] | 79 | yes |
| Nike Workwear Line quality | about 90 | 76 to 100 | [●●○] | 88 | yes |
| Nike Athleisure Range quality | about 60 | 45 to 71 | [●●○] | 70 | yes |
| Nike Denim Line quality | about 85 | 72 to 98 | [●●○] | 84 | yes |
| Nike Kidswear Line quality | about 75 | 61 to 87 | [●●○] | 84 | yes |

### Other industries: is there a market screen to read?

- knownMarket for another industry (the rule that would fog it): restaurant fogged, semiconductor fogged, software fogged
- Read from the code (business/market-menu.ts): every market screen of a company asks `unknownMarket` for the company's own industry, so Regions & Countries, Market Overview and the leaderboards print numbers, and no screen asks for the market of a trade the player has no company in.

### Age 33, 2029

> **Minigame: Harbor Fashion: Annual Report**
> annualReport: answer {"price":61.23,"production":19887}

> **Choice: Buyout Offer**
> Bayou Holdings wants to buy Harbor Fashion outright for $740,108. Your accountant estimates it is worth about $538K.
> [ ] Accept
> [ ] Counter 15% higher
> [x] Decline

> **Notice: Not for Sale**
> You told Bayou Holdings that Harbor Fashion is not for sale. They said to call if you change your mind.

> **Choice: Anniversary**
> Your mother Elizabeth has always dreamed of a cruise for a big anniversary ($24,917). There will be a captain's dinner. There will be a buffet. There will be photos of the buffet.
> [ ] Give $24,917
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Anniversary**
> You told Elizabeth no. Elizabeth said "fine." It was not fine.

> **Choice: Medical Bills**
> Your father Joshua needs a hip replacement ($70,526). His insurance covers "a portion," which turns out to be a small one.
> [ ] Give $70,526
> [ ] Give less...
> [x] Say no
> [ ] Set boundaries (no more money talk for a while)

> **Notice: Medical Bills**
> You told Joshua no. Dinner was very quiet. He is on the waiting list.

> **Year card (drawn on the Life tab)**
> Headline: Harbor Fashion lost $59,031 on $1.2M of sales.
> Age 33, 2029
> $ Net worth $5.0M (down $191K). Income $86K. Cash $4.5M.
> ~ 2029: The asteroid Apophis passes closer to Earth than many satellites, harmlessly.
> + Everyday (2): I spent a weekend at the beach. / I flew first class and got a warm towel.

- screens: 4 arrived (4 asked for an answer), 7 in all with the replies; the old flow would have queued 4; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 2 lines, drawn on the Life tab

### Age 34, 2030

> **Minigame: Harbor Fashion: Annual Report**
> annualReport: answer {"price":61.49,"production":19983}

> **Choice: Family Loan**
> Your mother, Elizabeth, is asking to borrow $2,230 to fix their car. What will you do?
> [ ] Give it to them
> [ ] Lend it, but expect it back
> [ ] Offer half
> [x] Refuse

> **Notice: Tough love**
> You told Elizabeth no. Family dinners will be awkward for a while. (bad news)

> **Year card (drawn on the Life tab)**
> Headline: Harbor Fashion lost $131K on $1.2M of sales.
> Age 34, 2030
> $ Net worth $5.0M (down $169K). Income $88K. Cash $4.5M.
> ~ 2030: The World Cup turns 100 with games on three continents.
> + Everyday (1): I complained about my commute to anyone who would listen.

- screens: 2 arrived (2 asked for an answer), 3 in all with the replies; the old flow would have queued 2; 0 notices went to the inbox
- year card: 3 lines, 1 folded groups holding 1 lines, drawn on the Life tab

### Age 34, 2030: the same profile two years after the purchase

- Tap: Assets > Businesses > Harbor Fashion > Run > Market & Competition > Rival Profiles > Nike (read only)
  - A real company · founded 1964 (65 years) · based in United States
  - Size: giant · 1.1% of the market → · segment mass
  - Strengths (estimated): quality ⭐⭐⭐ to ⭐⭐⭐⭐⭐ · technology ⭐⭐⭐ to ⭐⭐⭐⭐⭐ · prices like yours [●○○ as of 2028]
  - Plays in: United States, Canada, United Kingdom, Germany, Japan, France, Australia, Brazil
  - Sells: Workwear Line (65 to 100) · Athleisure Range (35 to 80) · Denim Line (65 to 100) · Kidswear Line (50 to 95) · +10 more [●○○ as of 2028]
  - In 2029 it trimmed prices on its entry range (simulated)
  - In 2028 it opened a wave of new flagship locations (simulated)
  - Likely next (our guess): Likely to tweak its range and wait for you to move
  - Buy out Nike | $1.9B · its customers, 281 boutiques, 14 product lines and its know-how come with it | greyed out: Nike is more than 3 times your size. Grow first, or buy a smaller rival.
- Nike's numbers two years on: estimates against the truth (the player never sees the truth column)

| number | the screen says | the 80% band | chip | truth | inside |
| --- | --- | --- | --- | --- | --- |
| Nike quality | 45 to 90 | 46 to 91 | [●○○ as of 2028] | 75 | yes |
| Nike technology | 50 to 95 | 51 to 96 | [●○○ as of 2028] | 79 | yes |
| Nike Workwear Line quality | 65 to 100 | 67 to 100 | [●○○ as of 2028] | 88 | yes |
| Nike Athleisure Range quality | 35 to 80 | 36 to 80 | [●○○ as of 2028] | 70 | yes |
| Nike Denim Line quality | 65 to 100 | 63 to 100 | [●○○ as of 2028] | 84 | yes |
| Nike Kidswear Line quality | 50 to 95 | 51 to 96 | [●○○ as of 2028] | 84 | yes |

- the research record holds 6 readings

### The Intelligence Briefing

- Tap: Assets > Intelligence Briefing (read only)
  - -- What you know --
  - Nike Athleisure Range quality: 35 to 80 [●○○ as of 2028]
  - Refresh Nike Athleisure Range quality | Do the homework yourself · Free · sharpens ±17% to ±14%
  - Nike Denim Line quality: 65 to 100 [●○○ as of 2028]
  - Refresh Nike Denim Line quality | Do the homework yourself · Free · sharpens ±17% to ±14%
  - Nike Kidswear Line quality: 50 to 95 [●○○ as of 2028]
  - Refresh Nike Kidswear Line quality | Do the homework yourself · Free · sharpens ±17% to ±14%
  - Nike quality: 45 to 90 [●○○ as of 2028]
  - Refresh Nike quality | Do the homework yourself · Free · sharpens ±17% to ±14%
  - Nike technology: 50 to 95 [●○○ as of 2028]
  - Refresh Nike technology | Do the homework yourself · Free · sharpens ±17% to ±14%
  - Nike Workwear Line quality: 65 to 100 [●○○ as of 2028]
  - Refresh Nike Workwear Line quality | Do the homework yourself · Free · sharpens ±17% to ±14%
  - -- Standing orders --
  - Standing orders | Off
