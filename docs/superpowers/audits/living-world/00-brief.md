# Living World programme: audit brief (read first)

You are one of eleven read-only auditors. Together your digests will feed ONE master design and roadmap for the next big stage of AnotherLife (a browser life simulator: Vite + React 19 + strict TypeScript, Vitest; engine in `src/game` is pure TS with a seeded RNG, state is plain JSON, tests in `test/`, docs in `docs/`). The code to read is a read-only checkout of main (v4.0.2) at:

    /tmp/claude-0/-home-user-snag/91204518-72c3-5880-a3f8-357fc9b44d53/scratchpad/the main checkout (v4.0.2)

DO NOT edit anything inside it. Write exactly one digest file (path given in your task) and return a SHORT summary (max 12 lines) of it. You may run read-only commands (grep, wc, cat, git log) and small throwaway scripts in the scratchpad, never in the main checkout (v4.0.2). Do not run the full test suite. Use Sonnet-level effort: be concrete and fast, no padding.

## What the player (the game's owner) asked for, verbatim

"Scope and write a full plan to make it actually matter: everything is accounted for. All features are fleshed out like wars, invention, relationship dynamics, news, showing off your product at events, dialogue not repeating, text showing your year isn't cluttered, better profit and loss graphics, better player navigation, better system, not everything the player should know unless they do research, research of all types shouldn't be tied to nothing but something like quality of staff, player ambition, money, labor; this for everything in the game. Every single special job fleshed out as much as business with so so much to do and experience."

Earlier framing: the dream is a game "with almost everything accounted for and simulated" (the world is entities that exist once: every person, company, home, job and product; money, goods and people are conserved; the player is one agent in a world that keeps running). Player feedback so far: wants war and politics agency as President (declare war, United Nations), better graphs for Profit and Loss and rankings, game studio was a money exploit (fixed in 4.0.1), AI lab research limits.

## Repo rules every proposal must respect (read docs/ARCHITECTURE.md, docs/FEATURE-ROADMAP.md invariants, docs/VOICE.md)

no foresight (nothing reads the future), deterministic seeded RNG (no g.rng draws in pure reads), accounting conservation (every dollar booked once; there are money-scan tests), action-level authorization, all new saved fields optional and validated (SAVE_SCHEMA = 2, old saves load), yearly idempotence (a year step can be re-run safely), pure presentation, bounded state (every list capped), plain narrator voice (docs/VOICE.md: contractions, no em-dash, line caps), "R&D must not scale with how rich the company is" (costs belong to the product; but outcomes may depend on inputs like staff quality, ambition, labor and money invested with diminishing returns), no exploit loops (the game once had a trillion-dollar studio loop: every growth term needs a real-world ceiling).

## What exists (do not re-propose it, extend it)

v4.0.2 shipped: tech waves, listed stocks and funds on one market clock, AI Lab 2.0 (benchmarks, capability research), Silicon 2.0, device companies (56 trades), sector families (Operations Desk for 18 trades), R&D 3.0 (process R&D, patents, tax credit, research team), Careers 2.0 slice 1 on a shared kit (src/game/special/kit: Actor, Astronaut, Model, Musician with named rivals, report cards, crisis choices with odds), Politics 2.0, Heavy R&D, Inventor's Workshop, boards and conglomerates, hedge funds, dynasties. Roughly 264,000 lines of source (14 MB) and 131,000 lines of tests; full CI takes 25 to 35 minutes. Specs and plans of every past release are in docs/superpowers/specs and docs/superpowers/plans: read the ones for your area.

## Your digest format (markdown file, at most 1,800 words, concrete, with file paths and rough line counts)

1. WHAT EXISTS TODAY in your area: files, sizes, how deep, what is a real simulation versus a statistic or a menu. Be honest about thin spots.
2. GAPS against the player's requirements that touch your area (numbered, concrete).
3. DESIGN PROPOSAL: how it should work in a fully accounted world: entities, state (optional fields, bounds), the yearly step, player actions, what the player can see and how information is revealed (see area H), how outcomes depend on inputs (staff quality, ambition, money, labor, time; see area C), and how it connects to other areas.
4. WORK BREAKDOWN: workstream items with a size (S about 300 lines, M 1,000, L 3,000, XL 8,000+ of source) and the dependencies on other areas (use the area letters below).
5. RISKS: balance and exploit risks, save and performance risks, tests needed (conservation scans, long-run probes).
6. OPEN QUESTIONS for the owner: at most five, each with your recommended default.

Area letters: A world and accounting kernel; B wars, geopolitics, nations and government; C invention and research of all types; D relationships and people; E news, events, dialogue and the year text; F product showcase and company events; G navigation, charts and Annual Report UI; H information model (what the player knows, fog and research); I remaining special careers; J business depth benchmark and the depth rubric; K engineering, performance and test strategy.
