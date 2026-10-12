# AnotherLife v2.2.0 — The Workshop, Banking 2.0, Investment Firms 2.0 & a Bug Sweep

This release replaces the inventor career with a new Inventor's Workshop, rebuilds banks and
investment firms from scratch, makes running any company clearer and more eventful, and fixes a
large batch of bugs found by fuzzing, browser playthroughs and code review.

## 💡 The Inventor's Workshop (replaces the inventor research career)

- **Activities → Inventor's Workshop**, open to everyone from age 8. The **Inventor talent**
  (and Main Character Syndrome) makes you a genius: about three times as many ideas, better
  prototypes, double skill growth, half the explosions, the history race and honest purple hints.
- **An idea notebook** (12 pages) fills from sparks in everyday life, brainstorming and popups.
  165 era-aware ideas in 10 categories, from the Pizza Scissors to the Runaway Alarm Clock.
- **Build prototypes**: play it safe, go bold or go cheap. Results run from 💥 kaboom to
  🌟 masterpiece, and every build teaches you something.
- **Patent it** at home or worldwide; a patented idea becomes an asset you own, sell and pass on.
- **Six ways to launch**: sell the rights, license it for royalties, pitch to investors (a TV pitch
  show from 2001, a trade fair before), crowdfund (2009+), make it in your own company, or give it
  to the world.
- **Sales rise, peak and fade**; patents slow the copycats. Knockoffs, recalls, viral moments,
  buyout offers, patent trolls, a rival inventor, science fairs and Inventor of the Year.
- **Race history**: 34 real inventions under generic names (the pop-up toaster, the pocket
  telephone…) can be invented first by a genius in the 25 years before their real date.
- Reputation ranks from Tinkerer to Legendary Inventor.
- Old saves: inventor progress, ideas in progress and owned inventions carry over without losing
  value or gaining free money.

## 🏦 Banking 2.0

- Clear books: customers' deposits and loans are never your cash; your capital is. A dashboard
  shows deposits, loans, capital ratio against the regulator's minimum, trust, bad loans, profit
  and your rank among the country's banks.
- **Levers**: savings and loan rates against the market rate, lending appetite (prime / balanced /
  high-yield), era-gated products (mortgages, business loans, auto loans, credit cards, wealth
  management, investment banking, a mobile app, a crypto desk), branches and campaigns.
- **Drama**: bank runs (go on TV or radio, borrow from the central bank, sell loans, ask for a
  bailout), a regulator that warns, fines and seizes, rogue employees, audits (with a bribe option
  that is a crime), merger offers, fintech rivals, cyber attacks, laundering temptations and real
  historical crises.
- Founding advice: the game tells you how much capital a bank needs to survive its first years.

## 📈 Investment Firms 2.0

- Choose your firm: **Asset Manager** (fund styles, peer league table, flows that chase
  performance), **Hedge Fund** (strategies, a yearly bull/bear/flat market call with leverage,
  performance fees above the high-water mark), **Venture Capital** (3–5 startup pitches a year,
  due diligence, follow-ons, unicorns and exits, carry, the next fund) or **Brokerage**
  (commissions through the eras, the online boom and the zero-commission age).
- Events: star managers poached, insider tips, rogue traders, crash redemptions, pension mandates,
  Ponzi temptation, activists and lawsuits.
- The old "perfect foresight" returns for finance firms are gone: firms earn what their books earn.

## 🏢 Running a company

- A compact **dashboard** opens every company: cash, value, your stake, last year's sales and
  profit with ▲▼, market rank and a health line with one piece of advice.
- **Milestones** (first profit, revenue and location records, #1 in the market, unicorn, IPO,
  anniversaries) with one celebration a year.
- **Twelve new business events** with real trade-offs: franchise pitches, food critics,
  influencers, data breaches, union drives, contract tenders, copycats, an employee's big idea,
  rent hikes, location bidding wars, celebrity investors and trend waves.
- **Franchising** for consumer businesses: fees and royalties without building outlets yourself.
- **IPO within reach**: exchanges now want about $25M of yearly profit (was $300M), and
  underwriters audit the books.
- Clearer founding (whose money pays, three investor deals, cancel at every step), plainer
  wording throughout, a tidier company screen, and buy-outs that need a booked year and a target
  within reach.

## 🐞 Bug fixes (highlights)

- Heirs without talents no longer break the childhood talent reveal.
- Money leaks closed: an elite CEO's "foresight" refilling the owner's own bonus, investors' fresh
  money paid straight to the founder, embezzled money vanishing off the books, severance paid for a
  relative never reaching them, a break-up fee skipping tax, deep-tech rounds minting a stake for a
  0% heir, a rich relative's savings wiped by an influence job.
- Banking: a government rescue no longer enriches the owner; dividends respect capital rules.
- The right currency from birth; correct articles and plurals ("an AI company", "bakeries");
  anachronisms removed (1950s moon landings, 1948 color TVs and e-bikes); investment percentages
  that agree with each other; slider and Annual Report fixes; texts that no longer cut off on a phone.
- More money leaks and exploits closed: a dead family co-owner's dividends now reach their heirs
  (and the will's charity slice is really paid), game engines can't be built and resold for more
  than they cost, broke players no longer get free repairs, cancelling a development returns unspent
  money in full, options on a real company's last year are no longer risk-free, buying a company
  and flipping it straight back out loses money, and your own big orders can't inflate the value of
  your own stock position.
- Gifts of luxury goods and the will's make-up actions now actually stick; special-career menus
  (fighters, politicians, musicians, esports) no longer change the game just by being opened.
- Investor money no longer inflates the founder's net worth or gets paid straight back out;
  borrowed money counts in a company's cost basis; royal siblings keep their titles across reloads.
- A failing year no longer freezes the Age button.
- Faster yearly simulation: the world economy step is about a quarter cheaper and the business
  planner about three times faster.
- An optional deep engine fuzzer (`FUZZ=1 npx vitest run test/fuzz-deep.test.ts`) for future bug
  hunts.

See [INVENTOR-CAREER.md](INVENTOR-CAREER.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for details,
and `docs/superpowers/specs/2026-10-12-business-finance-inventor-rework-design.md` for the design.

## Validation

(Filled in at release.)
