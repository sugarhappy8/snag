# AnotherLife v2.9.0: More R&D, more deep-tech lab work and four new deep-tech companies

This release has three parts.

**More R&D for every company.** Every trade with products has three more classic ideas to develop, each with its own real-history demand (smash burgers from 2015, a car wash tunnel from 1946, an edge computing site from 2016). The Products screen now shows eight ideas at a time instead of five. Heavy R&D has five breakthroughs in every trade instead of three, still offered in the order history made them possible: a bakery gets steam-injection deck ovens in 1950 and a dedicated gluten-free bakehouse in 2008, a bank gets a drive-through teller lane and an instant payments rail.

**More lab work in deep tech.** Each of the eight deep-tech trades has three more R&D programs in its lab. Some examples: silicon photonics for chipmakers, licensed data deals for AI labs, a human-safe certification for robots, an orbital transfer vehicle and a space station module for rockets, a solid-state battery and an electric semi for car makers, quantum sensors, and industrial control security. They follow the same rules as every program: a cost a year, a number of years, odds, and what they need first.

**Four new deep-tech companies.** Start one from the Deep Tech heading.

- **Fusion Energy Company** (from 1998). Magnets, record plasma shots, net energy gain, a tritium breeding blanket, then a pilot power plant and a fleet. The longest and most expensive ladder in the game.
- **Neurotech Company** (from 1998). Electrode arrays and a neural decoder, then a first-in-human trial and a device approval, both with odds that rise with the safety record. Implant factories after approval.
- **Drone & Air Taxi Company** (from 2005). Autonomous flight, a beyond-sight flight permit, a delivery network, then an air taxi prototype and its type certificate.
- **Carbon Removal Company** (from 2008). A better sorbent, a demonstration plant, permanent storage, verification, a big buyer offtake deal, then capture plants.

Each has its own ladder, funding rounds, founder requirements, an expert to hire, an endless next-generation program at the top, a yearly public showcase on its screen, Heavy R&D entries, products and procedurally named world rivals. US grant programs and the existing research grants in the US, the EU and the UK cover them where they fit. They are not listed on stock exchanges yet, so exchanges and existing saves keep the same listings.

## Details

- **Ideas.** `industries.ts` products lists grew by three per trade (venues in `venues-data.ts`), and `product-data.ts` carries a demand curve for every new idea. `IDEAS_SHOWN` in `manage.ts` is 8.
- **Breakthroughs.** `heavy-data.ts` has five per trade, sorted by first year. Costs, odds, years and who follows are unchanged (`heavy-rd.ts`).
- **Lab programs.** `deeptech-data.ts` PROGRAMS. New helpers: `safe` (raises the safety record) and `clampOdds` (odds that depend on the safety record).
- **New trades.** `DEEP_TECH_IDS` and `INDUSTRY_IDS` in `data/markets.ts`; definitions in `industries.ts`, `deeptech-data.ts` (ladder, programs, next generation, grants), `competition-data.ts` (market size, founding year, hubs, rival names), `deeptech-state.ts` (listing stage), `conglomerate-econ.ts`, `deeptech-events.ts` (talk-show topic) and `deeptech-menu.ts` (one shared screen with a status line and a showcase).
- **Stocks.** `invest/engine.ts` only adds deep-tech hub listings for trades with a listed sector, so the four new trades never change an exchange's slot plan.
- **Tests.** Deep-tech tests set in 2000 found the trades open that year (drones and carbon removal come later). The Heavy R&D catalogue test expects five entries per trade.
