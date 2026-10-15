# AnotherLife v2.9.0: More R&D, more deep-tech lab work and four new deep-tech companies

This release has three parts.

**More R&D for every company.** Every trade that sells products has three more classic ideas to develop, each with its own real-history demand (smash burgers from 2015, a car wash tunnel from 1946, an edge computing site from 2016). The Products screen now shows eight ideas at a time instead of five. Heavy R&D has five breakthroughs in every trade instead of three, still offered in the order history made them possible: a bakery gets steam-injection deck ovens in 1880 and a dedicated gluten-free bakehouse in 2008, a bank gets a drive-through teller lane and an instant payments rail.

**More lab work in deep tech.** Each of the eight older deep-tech trades has three more R&D programs in its lab. Some examples: silicon photonics for chipmakers, licensed data deals for AI labs, a human-safe certification for robots, an orbital transfer vehicle and a space station module for rockets, a solid-state battery and an electric semi for car makers, quantum sensors, and industrial control security. They follow the same rules as every program: a cost a year, a number of years, odds, and what they need first.

**Four new deep-tech companies.** Start one from the Deep Tech heading.

- **Fusion Energy Company** (from 1998). Magnets, record plasma shots, net energy gain, a tritium breeding blanket, then a pilot power plant and a fleet. A five-stage ladder, and its pilot plant is the most expensive program in the game: 400 million dollars a year for four years.
- **Neurotech Company** (from 1998). Electrode arrays and a neural decoder, then a first-in-human trial and a device approval, both with odds that rise with the safety record. Implant factories after approval.
- **Drone & Air Taxi Company** (from 2005). Autonomous flight, a beyond-sight flight permit, a delivery network, then an air taxi prototype and its type certificate.
- **Carbon Removal Company** (from 2008). A better sorbent, a demonstration plant, permanent storage, verification, a big buyer offtake deal, then capture plants.

Each has its own ladder, funding rounds, founder requirements, an expert to hire, an endless next-generation program at the top, a yearly public showcase on its screen, products and procedurally named world rivals. US grant programs and the existing research grants in the US, the EU and the UK cover them where they fit. They are not listed on stock exchanges yet, so exchanges and existing saves keep the same listings. Each trade has ideas to develop from the year it opens, three or more in every year to 2040.

## What changes for companies you already have

- **Heavy R&D prices can move.** A breakthrough costs eight times the development cost of the trade's first classic idea (`heavyCost` in `heavy-rd.ts`). The three new ideas sort ahead of the period fallback ideas in the eras where a trade has fewer than four modern classics, so the price of a breakthrough is different from v2.8.0 for some trades in some eras. It matters only to a project started after this release. A project already running keeps the cost it was started at. Odds, years and who follows do not depend on the idea, and are as before.
- **Heavy R&D entries are dated again.** Six entries have new first years, so a company is offered them earlier: steam-injection deck ovens (1880), hop extract (1970), electronic shelf labels (1995), UV disinfection (1955), bidirectional charging (2012) and cruise holiday packages (1900). A changed first year changes what a company is offered, never what a running project costs.
- **Three new classic ideas have new first years.** The lager six-pack line starts in 1940 (it was 1900), windshield repair in 1972 (it was 1950) and cruise bookings in 1920 (it was 1960).

## Details

- **Ideas.** `industries.ts` products lists grew by three per trade (venues in `venues-data.ts`), and `product-data.ts` carries a demand curve for every new idea. `IDEAS_SHOWN` in `manage.ts` is 8. The new trades' early ideas have first years three to eight years before the trade opens, because a world market starts about two years after a product's first year. The early drone ideas are named for what existed before consumer drones (aerial survey, aerial inspection, unmanned crop sprayer), since the shared era rule blocks the word before 2012.
- **Breakthroughs.** `heavy-data.ts` has five per trade, sorted by first year. Odds, years and who follows are unchanged (`heavy-rd.ts`). The Heavy R&D menu is offered to product companies only (`heavyEligible`), so the entries for the twelve deep-tech trades are in the catalogue but not used yet. The carbon removal hub breakthrough is called Megaton Removal Hub, since it removes a million tonnes a year.
- **Lab programs.** `deeptech-data.ts` PROGRAMS. New helpers: `safe` (raises the safety record) and `clampOdds` (odds that depend on the safety record). A program can carry `unlocks`, which the general manager and the Business talent's hint rank first (`programScore` in `deeptech-rd.ts`). The detect-and-avoid program of the drone trade is `avoid`, so it no longer borrows the bonus of the security trade's `detect`.
- **New trades.** `DEEP_TECH_IDS` and `INDUSTRY_IDS` in `data/markets.ts`, 55 trades in all. Definitions in `industries.ts`, `deeptech-data.ts` (ladder, programs, next generation, grants), `competition-data.ts` (market size, founding year, hubs, rival names), `deeptech-state.ts` (listing stage), `conglomerate-econ.ts`, `deeptech-events.ts` (talk-show topic) and `deeptech-menu.ts` (one shared screen with a status line and a showcase). Neurotech follows the health cycle (`economy/model.ts`). The Workshop lets fusion and carbon removal make energy inventions, neurotech health inventions and drones gadget and transport inventions (`workshop/catalog.ts`, `migrate.ts`).
- **Funding.** A trade can set its own ladder of stages for venture rounds (`seriesStage`, read in `deeptech-funding.ts`). Fusion does: record plasmas open Series B and C, net energy opens D and E, and sales are not asked for. Its US seed round is 14 million dollars and its first program, High-Field Magnets, is one year long. Every other trade asks for the same as before.
- **Showcases.** The yearly showcase of the four new trades opens at the first stage where its "too early" text stops being true (`stage` in the table in `deeptech-menu.ts`).
- **Stocks.** `invest/engine.ts` only adds deep-tech hub listings for trades with a listed sector, so the four new trades never change an exchange's slot plan.
- **Share Count.** The row under Capital & Ownership writes a tiny share price in full ('<$0.000001' below a millionth of a dollar) instead of scientific notation.
- **Tests.** Deep-tech tests set in 2000 found the trades open that year (drones and carbon removal come later). The Heavy R&D catalogue test expects five entries per trade, in order of first year. New tests: ideas for the four trades in every year they are open, every text of the four trades against the shared era rules, the showcase gates, fusion funding over 25 years next to chips and drugs, the autopilot's ranking, the sector of every trade, the Workshop categories and the Share Count row.

## Not in this release

- **Heavy R&D for deep tech.** The twelve deep-tech trades keep their own R&D. The catalogue has five breakthroughs for each of them, but the menu does not offer them. Making them offered is a design change of its own (prices, odds and what a deep-tech lab already does in its lab).
- **Listed deep-tech champions for the four new trades.** They have no listed sector, so no exchange lists them.
