# Effort migration

How the seven research systems of v5.1.0 moved onto one engine without moving the balance, how that is proven, and how the next system
joins. The engine is `src/game/effort/` (the Effort core track; its own doc is `docs/EFFORT.md`). This file is about what the migration
promises and the guards that keep it.

## The promise

At the default actor (ambition 50, steady posture, no fatigue, no banked know-how) every migrated system returns what v5.0.0 returned:
the odds and the quality within 1 point, the years and the price exact, and a scripted life to its end leaves `g.rng` and what it made
(lines on sale, levels, records) byte for byte. Anything the engine adds shows only when the actor is not the default: a tired owner, a
bold plan, know-how a failure banked, a steady hired CEO. Each of those is a labelled line of the odds ("Odds 62%: team +9, funding +7,
know-how +8"), never a hidden number.

The one declared exception is J.8: a hired manager rated 90 or more adds up to 3 odds points to product, Heavy and Operations R&D, as
one labelled line ("steady CEO", `business/ceo-edge.ts`). It moves no money. The parity tests give those rows `TOL.topCeoSlack` (3)
above the record and nothing below it.

## The seven systems

| System | Wrapper kept (names and signatures) | Leaf adapter | Test |
|---|---|---|---|
| Product R&D | `rdQuote`, `launchP`, `advanceRd` (`business/rd.ts`) | `business/rd-effort.ts` | `test/effort-rd.test.ts` |
| Heavy R&D | `heavyOdds`, `heavyYears`, `heavyCost`, `heavyQuality` (`heavy-rd.ts`) | `business/heavy-effort.ts` | `test/effort-heavy.test.ts` |
| Operations R&D | `opsOdds`, `opsPrice`, `opsYears` (`lab-rules.ts`), `advanceLab` | `business/lab-effort.ts` | `test/effort-ops.test.ts` |
| Deep tech | `programTerms`, `finalOdds` (`deeptech-rd.ts`) | `business/deeptech-effort.ts` | `test/effort-deeptech.test.ts` |
| AI capability tracks | `capProgram` (`deeptech-data.ts`), `modelRating` (untouched) | `business/aicap-effort.ts` | `test/effort-aicaps.test.ts` |
| Studio engines | `simulateStudioEngines` (`gamestudio-engines.ts`) | `business/studio-effort.ts` | `test/effort-studio.test.ts` |
| Workshop | `buildOdds`, `brainstormOdds`, `buildCost` (`workshop/build.ts`) | `workshop/effort.ts`, `workshop/bench.ts` | `test/effort-workshop.test.ts`, `test/effort-workshop-inputs.test.ts` |

The seam every company system shares is `business/research-effort.ts` (the inputs of one run, `bookResearch`). `test/effort-mig-acceptance.test.ts`
is the sweep: it holds what only the seven together can show.

## How parity is proven

`test/fixtures/effort-parity.json` is the oracle. It was recorded once, on the unmodified v5.0.0 research code (head `85e147b`) under
Node 22, by `test/effort-parity-kit.ts`. For each system it holds a grid of points built from the real test kits (a company, a lab, a
studio, a notebook) with the exported functions of v5.0.0 read at each point, and one scripted lifecycle (projects started together and
run to their end). Floats are cut to 9 significant digits, because the engine's `Math.log`, `Math.exp` and `Math.pow` differ in the last
bit between macOS and Linux.

| System | Grid points | Lifecycle |
|---|---|---|
| rd | 310 | three projects to their end: lines, brand, years, `g.rng` |
| heavy | 27 | one breakthrough: line, record, news, `g.rng` |
| ops | 162 | two programs on different tracks: levels, `g.rng` |
| deeptech | 652 | four programs: stage, `ipBook`, notes, `g.rng` |
| aicaps | 672 | one track won, one lost: levels, hype, `g.rng` |
| studio | 360 | one engine built to the end |
| workshop | 1,224 | one inventor year: three builds, two brainstorms |

A migrated system keeps its legacy names as wrappers over `quote`, so `probe(system)` after a change is the same call on new code. The
rule (`TOL` in the kit) is 1 point on odds, 1 on quality, 0 on years, 1 dollar on a price. The grid has a hash, and the sweep pins the
sizes above, so a grid that lost a point or a part fails. A grid state sets willpower and discipline so that ambition is exactly 50
(`neutralAmbition`).

A test that asserted a legacy odds number for an owner-run company at a character whose ambition was not 50 moves to
`neutralAmbition(g)` in its setup (a row in the plan's `moved-tests.md`), never to a new expected number.

## How to record

Never record to make a migration pass: a moved number is a change of balance. The oracle is recorded by the first task of a track that
adds a system, on the code before that system moves, and its commit says "recorded on the unmodified research code at <hash>".

```
RECORD_EFFORT_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/effort-parity-kit.test.ts
```

The recorder refuses to run without the variable, writes `{ v, node, head, digits, systems }` and names the head it ran on. Run it
under Node 22 (`vt22`); a recording from another Node is a different file. A change that has to move the record carries a reason in the
commit and a row in `moved-tests.md`, and the owner has agreed to the balance change.

## The adapter rule

1. A system gets one leaf file (`<system>-effort.ts`) with a task builder and an input builder, pure functions of numbers and plain
   records. It imports only modules outside the 59-module `business/` import cycle (`util`, `state`, `lab-state`, `lab-data`,
   `leadership`, `dynamics`, `board-state`, `deeptech-state`, the engine). A member of the cycle (`ceoSkill`, `staffPower`, `rdCost`) is
   called by the legacy function, which hands the result in. A new file that joined the cycle would fail the architecture ratchet.
2. The legacy exports keep their names and signatures and become wrappers over `quote`. The hint sites and every menu row stay as they
   are; no call site changes.
3. No module-level `const X = importedValue` in an adapter (rule (d) of the layer ratchet): literals only.
4. Every draw stays where it is, in v5.0.0's order. `quote` and `step` are called around the draws, never between two of them in a way
   that adds one. `quote` is called from reads (menus, hints, planners), so an adapter writes nothing and draws nothing.
5. Only the player's own companies bank know-how: the asset is found, and with none it is an NPC company and `bookResearch` does
   nothing, so the NPC economy and the golden digests keep their bytes.
6. A new `fx` key is written only when it carries information (a stored posture other than steady, a setback, a banked cause). At the
   default the saved shape is v5.0.0's, so `toEqual` pins and the old-save fixtures hold.
7. New text follows `docs/VOICE.md`: a log line at most 90 characters, an outcome 120, no em-dash or en-dash. A string a test pins is
   never edited; a cause and what it taught are appended to a notice or a results line after it, never to a log line.

## What the sweep holds across systems

- The record is complete: seven systems, the sizes above, no gap, the hashes, the header (Node 22, v5.0.0), and every system's grid and
  lifecycle still hold.
- Every system's file asks `quote`, and none of the old inline formulas is left in a wrapper (`Math.pow(k, -0.4)` in `rd.ts`,
  `HEAVY_ODDS_X *` in `heavy-rd.ts`, `0.9 * launchP` in `lab-rules.ts`, `0.75 + skill / 200` in `deeptech-rd.ts`).
- Money buys odds and speed and never a lower price. 100 times the cash, the valuation and the head count change nothing of any task,
  price, wrapper answer or engine quote; the budget stops at the task's own ceiling (product 4, Heavy 1, Operations 1, deep tech and
  the capability tracks 3, a studio engine 1, a build 1; never more than `K_MAX`, 4); the odds stay under the legacy clamp (.95, .6,
  .92, .98; a track's base odds are .65 at every research level; a studio engine never fails).
- 200 years of direct steps at maximum inputs, one founder holding every system: k within kmax and 4, know-how within 100 and 40
  fields to a map, the odds inside the clamp, the quality inside each ceiling, the books balanced and unchanged, no dollar made.
- 12 companies of an owner who starts every idea every year and pushes, over 50 real years, carry at most 3,000 nodes in `fx` records
  and `knowHow` maps (measured: about 300 at the peak, with 27 effort records at once). One `fx` is 10 nodes and a full know-how map 41.
- A read draws nothing from `g.rng` and reads a deep-frozen game, in every system, in its quotes and on every screen.
- Every migrated screen shows the odds line with its labelled terms (a studio, which has no odds, shows its pace in words), and every
  failed result says what went wrong and what it taught (the Workshop tells its cause as the story it always had). Public research
  and rival pressure are printed with the frontier's own words.

## What the sweep found, and what the engine fix changed

The first sweep measured know-how worth more than 15 odds points under the boldest plan (ambition 100, pushing): 19.96 for a product
project (76% base, clamp .05 to .95), 17.2 for a deep tech program and 16.3 for a capability track, and up to 20, 27 and 32 for the
longest shots. Those figures were true of the engine as that track first saw it, where know-how was a shift in logit space that grew
when a bold plan pulled the odds toward even. R3-E9 had already added know-how, rival pressure and public research in odds points
after the logit terms (`deviate`, `effort/factors.ts`); the sweep's figures reproduce to the digit on the curve before that change and
not on the release head, where every system is worth exactly 15 under every plan (measured 15.000000000000002 in all seven, the last
digit being the subtraction of two odds). The
engine fix that followed makes that a rule of the engine and not a result of its curve, in one place and held by tests:

- `deviate` cuts the know-how term at `KNOW_ODDS_MAX` where it enters the odds, whatever a caller hands in, so no plan, clamp, budget,
  crew or tired owner can make it worth more (`test/effort-know-cap.test.ts`, a grid of 189,000 inputs, with and without know-how).
- The line the player reads could still say more: `attribute` put what the other terms do together (rounding, the way logit shifts
  compound, a clamp) on the largest line, which for a long shot with a crew was know-how, so a term that adds 15 read "know-how +41".
  A capped term (know-how 15, public research 18, rival pressure 8) takes no share of that now: its line stays inside its cap and on
  its own side of 0, and what the cap cuts goes to the largest line that has no cap. The lines still add up to the odds.
- The sweep holds every system to it, in every year of the 200-year probe: the worth under the plan in force and under the boldest at
  most 15, the line at most 15 under four plans, and the system's own wrapper at most 15 (`bounded` in
  `test/effort-mig-acceptance.test.ts`).

## How a later system joins

1. Add the system id to `SYSTEMS` and a grid to `GRIDS` in `test/effort-parity-kit.ts`, from the real kits, with the life as a tuple.
2. Record the oracle on the unmodified code first (above), and commit it alone.
3. Write the adapter (the rule above), put the legacy names on `quote`, and keep the parity test green: `expectParity(system)` and
   `expectLifecycle(system)`.
4. Give it the same set of tests as the seven: a flop banks know-how in its own field (higher by more than 0 and at most 15 points, no
   other field moves, the reasons name it), a read draws nothing, 100 times the wealth changes no price, a default life saves what
   v5.0.0 saved, and the screen and the results line say why.
5. Add its rig to the sweep (`rigs` in `test/effort-mig-acceptance.test.ts`) so it is held to the 200-year probe and the 100x probe.
