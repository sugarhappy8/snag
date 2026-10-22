# Knowledge

Since R3 (v5.1.0) the game stops handing the player every hidden number. A market's size, a rival's quality, a candidate's skill, the
odds of a vote, what a private company is worth: each is something the player estimates, and a better source narrows the estimate for
a price. This page is the model, the rules, the vocabulary and the recipes for the next author. The code is `src/game/knowledge/`
(a layer 3 domain with one door, `knowledge/contract.ts`), the Settings card is `src/ui/components/InfoSettings.tsx`, and the guards
are listed at the end. The screens that call it, which numbers they fog and which stay exact are in `docs/FOG.md`.

Three promises hold everywhere, and the tests check each one.

- **Honest.** A band the player sees holds the real number about 80% of the time (77% to 83% over 10,000 draws), for a passive guess,
  for every source, for two sources merged and for a reading that has aged.
- **Stable.** The same source asked twice in one year gives the same number, and a second purchase is refused and costs nothing. A
  reading is a hashed draw of the life, the key, the year and the source, never `g.rng`.
- **Pure.** Showing an estimate never moves the simulation: a menu renders on a deep-frozen state, `g.rng` is not touched, and nothing
  in here reads a year after `g.year` or looks at a market.

## What the player sees

- **Words and ranges by default (Realistic).** A number the player has not researched reads as an estimate: `$4.2M` when it is sharp,
  `about $4M`, `$3M to $5M`, or only a word ("in the millions", "average", "a long shot") when it is a rough guess. Odds show as a
  percent only after a talent or a reading ("about 65%"); before that they are words ("unlikely", "even money", "likely").
- **A confidence chip and a date.** An estimate row carries three dots (a rough guess, a fair estimate, a good estimate, close to
  exact) and, once the reading is 2 or more years old, "as of 2023". The chip is drawn by `MenuList` from the optional `conf` and `asOf`
  of a menu node.
- **Look closer.** A screen with estimates ends with one group, `Look closer` (a magnifying glass). Its rows are the sources that can
  read these numbers, each with its fee and how far it sharpens ("$9,000 · sharpens ±25% to ±18%"), greyed out with the reason when it
  cannot be bought now (no cash, already read this year, too early for it, in prison). An illegal source asks first.
- **The Intelligence Briefing.** One group in the Assets tab: what the player has researched (stalest first, at most 12 rows and a
  "N more" line), how old each reading is, a Refresh for each, the Standing orders dial and the heat in words. It is hidden in a default
  life (no record), and in Exact mode unless a dial or heat is set, so they can always be cancelled.
- **Exact numbers for the player's own books.** An `own:` key is never fogged, and Exact mode shows every number as before.

## The information mode

Settings has an Information card with two choices. Realistic is the default and shows estimates; Exact shows every number, as the game
always did. It is a presentation switch and nothing else: the simulation never reads it (`test/info-mode.test.ts` scans `aging`,
`life`, `core`, `economy/`, `world/` and `kernel/` for an import of this folder), and the acceptance sweep plays one seeded life in both
modes and compares the JSON.

- `infoMode()` is the test override, else the player's setting, else `'realistic'`. `isExact()` is the same as a boolean.
- `Settings.info` is optional and stored only when it is `'exact'`; absent means Realistic.
- The suite runs in Exact: `vite.config.ts` lists `test/setup-exact.ts` under `setupFiles`. A test of the fog flips the mode for one call
  with `withInfoMode('realistic', fn)` (or `inFog(fn)` from `test/knowledge-kit.ts`), never with a setter: `setInfoOverride` beats the
  player's setting on purpose, so a file that imports the store is still Exact. The type is `InfoMode`.
- The standing orders and the yearly heat run in either mode, so a setting can never change a replay.

## How a screen calls know

`know(g, key, truth)` is the call most screens make. The truth is an argument: the caller reads its own number and hands it in, so
this folder never reaches into a market, a rival or a company.

```ts
const est = know(g, `mkt:${industry}:${country}:size`, trueSize)
{ type: 'info', id, text: est.exact ? oldText : `Market size: ${est.words}`, ...(est.exact ? {} : { conf: est.conf, asOf: est.asOf }) }
// at the end of the list:
...[lookCloser(g, { id: 'market', keys: [...] })].filter(Boolean)
```

An `Estimate` is `{ key, mid, lo, hi, sd, conf, y, src, exact, asOf?, words }`. `lo..hi` is the 80% band in the unit of the truth, `sd` is
the relative sd it was built from, `conf` is 3 for an sd of .06 or less, 2 up to .15, 1 up to .30 and 0 above, `y` and `src` are the year
and source of the reading (`'passive'`, a source id, or `'exact'`), and `exact` is true in Exact mode, for an `own:` key and for a truth
that cannot be fogged: the caller keeps its old text. `EstimateOpts` is `{ unit?, exp?, ladder?, scale?, talent? }`: `unit` overrides the
rule row (a `hint:` key has none), `exp` is exposure from 0 to 1 (the player's own presence cuts the passive sd by up to 40%), `ladder`
is the caller's own words for a rough guess (a `Ladder` is a list of `[upper bound, word]`), `scale` is what a signed amount is measured
against, and `talent` names the talent that sharpens a `hint:` key.

- `estimate(g, key, truth, { row })` is the same with the stored row explicit (tests, tools). `readValue` is `know(...).mid`, the number a
  hint helper ranks on.
- `storedEstimates(g)` lists what the player has researched, stalest first, with no truth needed (the hub).
- A menu never writes. A purchase is a `run`, and it goes through `buyIntel`.

### The math

- The noise `z` is the sum of six hashed uniform values, minus 3, times the square root of 2: a unit-variance, near-normal draw within
  4.25 sd, from the named hash of life, key, year and source (`normal.ts`). `BAND_Z = 1.298` is the 80% point of that draw, so the band
  `mid +- BAND_Z sd` holds the truth with probability .80 because the draw has the same distribution.
- Money, count and pct live on a log scale (the sd is relative, the band is a ratio, the truth must be above 0). Score (0 to 100) and
  odds (0 to 1) are additive and clipped to their range; the sd is in hundredths of the range. A signed amount is additive with an
  absolute sd of `sd x scale`.
- The passive sd is `sd0 x talent x (1 - .4 exp)`, never below `SD_MIN = .03`. A talent in the row of the rule table sharpens the
  passive read by x.6 and a source by x.8; Main Character Syndrome sharpens every key.
- A stored row ages: `agedSd(sd, drift, years)` is `sqrt(sd^2 + (drift sqrt(years))^2)`. The estimate shows whichever of the aged row and
  the passive read has the lower sd. That choice never looks at the truth, so coverage holds.
- `mergeReadings` combines two independent readings by inverse variance in the scale of the unit (geometric on a log unit), floored at
  `SD_MIN`. No merged band is sharper than 3%.
- A truth that is not finite, or not above 0 on a log scale, returns the exact estimate. There is never a NaN.

## The rule table

One row per `kind.field` in `knowledge/keys.ts`, `kind.*` for the rest of a kind. A key is `<kind>:<id>[:<id>]:<field>`, at most 64
characters, for example `mkt:cafe:us:size`; an owner whose natural id is longer hashes it. `sd0` is the passive relative sd, `drift` the
yearly drift of the truth. Later tracks add rows, they never edit these.

| Row | Unit | sd0 | drift | Talents |
|---|---|---|---|---|
| `mkt.size` | money | .25 | .06 | Business |
| `mkt.share` | pct | .25 | .15 | Business |
| `mkt.*` | count | .25 | .08 | Business |
| `riv.quality` | score | .30 | .10 | Business |
| `riv.tech` | score | .30 | .10 | Business |
| `riv.line` | score | .30 | .10 | Business |
| `riv.cash` | money | .60 | .35 | Business |
| `riv.*` | money | .30 | .15 | Business |
| `cmp.score` | score | .20 | .10 | Business |
| `cmp.*` | money | .25 | .10 | Business |
| `scn.*` | delta | .30 | .15 | Business |
| `hint.*` | the caller's | .20 | 0 | the caller's |
| `cand.skill` | score | .18 | 0 | Business |
| `odds.*` | odds | .20 | .05 | Business |
| `ev.*` | money | .30 | 0 | Business |
| `sec.*` | pct | .25 | .20 | Investing |
| `fund.*` | pct | .25 | .20 | Investing |
| `val.*` | money | .30 | .15 | Investing |
| `cast.*` | score | .25 | .15 | Acting, Modeling |
| `peer.*` | score | .25 | .15 | Acting, Modeling |
| `eco.*` | pct | .05 | .02 | none |
| `pol.*` | score | .25 | .25 | none |
| `ppl.*` | score | .45 | .20 | none |
| `war.*` | score | .30 | .25 | none |
| `story.*` | score | .30 | .25 | none |
| `show.*` | score | .30 | .25 | none |

`ppl`, `war`, `story` and `show` are reserved for R4 to R9 with their numbers already set. A key whose kind has no row is not fogged. An
`own:` key needs no row and is always exact. A `hint:` key carries no unit of its own: the caller passes `unit` and the talent.

## The record

What the player researched is kept in one flags key, `flags.know` (`KNOW_FLAG`), classed personal in `world-flags.ts`, so an heir
starts clean. It is `{ v: 1, o, k, d?, h?, sy? }`.

- `o` is the owner stamp, `v2:<generation>:<character id>` (the text `special/common.ts` `ownerKey` makes; knowledge may not import
  `special`). A record whose `o` is not the current character's reads as absent.
- `k` maps a key to one row, a string `mid|sdPermille|year|src[+src]`. Each field is parsed strictly (the reading to 9 significant digits,
  the sd in permille from 30 to 1000, the year, the sources merged that year); a row that fails any rule reads as absent.
- `d` is the dial of the standing orders (0 to 3), `h` the heat of the illegal sources (0 to 20), `sy` the year of the last yearly step.
- `KNOW_LIMITS` is `{ keys: 120, years: 12, heat: 20 }`. At most 120 rows, shed stalest first (ties by key), never the row just learned. A
  row older than 12 years, or stamped after `g.year` (no foresight, and a Time Machine jump back), reads as absent. 120 rows are at most
  400 JSON nodes.
- `readKnow(g)` is the pure read (a trimmed, frozen copy, or null; type `KnowRec`; a row is a `StoredRow`). `learn(g, key, reading)` merges a
  new reading with the aged row and writes in place; it returns null, writing nothing, when that source already read that key this year,
  so a repeat never averages. `widen(g, prefix, factor)` doubles the sd under a prefix after an event (never past .8, never narrower).
  `forget(g, key)` removes one row. A life that never researches anything never has a record.

## The sources

Every way to sharpen a number is one row of `SOURCES` in `knowledge/sources.ts`. A `SourceId` is one of the ids below. The floor is the
sharpest a source ever reads, whatever the spend, the quality or the talent; a second read of the same source in the same year is
refused, so nothing averages the noise away, and a different source helps only through its own independent draw.

| Id | Kind | Base sd | Floor | Price at tier 1 | Reads |
|---|---|---|---|---|---|
| `own` | free, 3 year actions | .45 x (1.5 - smarts / 100) | .25 | 0 | mkt, riv, cmp, eco, pol, sec, fund, odds, scn |
| `news` | free, through `ingestSignal` | .30 | .20 | 0 | any |
| `press` | a year of a trade title | .30 | .20 | 1,200 | mkt, riv, cmp, eco, pol, sec, scn |
| `report` | once | .18 | .12 | 9,000 | mkt, riv, cmp, eco, scn, odds |
| `analyst` | engaged | .12 | .08 | 30,000 | mkt, riv, cmp, val, sec, fund, scn, odds |
| `diligence` | per deal | .05 | .03 | the greater of 8,000 x wealth and 2% of the deal | val, cmp, cand |
| `investigator` | once | .14 | .10 | 15,000 | riv, cand, ppl |
| `informant` | illegal, heat 3 | .10 | .07 | 6,000 | riv, cmp, mkt |
| `hacker` | illegal, heat 6, needs the internet | .07 | .05 | 20,000 | riv, cmp, val, cand |
| `desk` | standing orders only | .14 | .10 | .6 x analyst | as analyst |
| `lab` | research results only, free | .20 | .15 | 0 | riv, mkt, cmp |

- **Price** is `round100(base x [1, 2.2, 4.5][tier - 1] x (1 + .25 (countries - 1)) x clamp(country wealth, .3, 1.5))`: the scope of the
  keys and the wealth of the country read, never the buyer's cash. A hundred times the money pays the same fee. A key kind says its scope
  (tier 1 a business or a street, 2 a country, 3 the world, how many countries, the deal size for diligence).
- **Sharpness** of a reading is `base x (1.5 - quality) x (spend / ref)^-.35`, times .8 on a talent key, never below the floor.
- **`buyIntel(g, src, keys)`** refuses, writing nothing, in this order: Exact mode (nothing to buy), the dead, a source that is not for
  sale, the era (a research trade needs its decade, a hacker needs the internet), a key with no provider truth, prison for an illegal
  source, every key already read this year ("You already have this year's reading"), the year's time for `own`, cash. Then it books the
  fee once through the ledger under the reason `intel` (an illegal source pays under the existing `bribe`) with a token of source, year
  and keys, so a replayed call books nothing; makes one reading per key (at most 12 a call), keeps it with `learn`, adds the heat of an
  illegal source and writes one log line from a pool of three.
- **`takeReading(g, src, key, truth, opts)`** is the same read for a caller that already paid or that costs nothing (a research result, a
  vet in hiring): it books and logs nothing, refuses a (source, year) already merged, and returns the estimate. `ingestSignal` is the free
  `news` source: an item that says something about a key, once a year per key. `offersFor(g, keys)` lists the `Offer`s a screen can show
  before the player picks: `{ src, label, price, sdFrom, sdTo, block }`.
- Fees are paid to `pool:other`. No source ever gives false data.

### Illegal intel

An informant or a hacker works, and adds heat to the record. Each year the heat is a hazard and there is no minigame: the chance of being
found out is `min(.5, .05 + .06 heat)`, rolled from the named stream `intel.risk` (hashed from the life, the year and `'you'`, never
`g.rng`). A hit puts an uncaught `Corporate Espionage` crime on the record, raises the wanted level by 2 (at most 5), notoriety by 8 and
lowers karma by 4, with a bad-tone notice; the ordinary yearly crime step then arrests at its own rate. The heat halves every year, hit
or not. `hazardOf(g)` is the pure read, `settleHazard(g)` the yearly step, idempotent by the year stamp `sy`.

## The module

`knowledgeModule` (`knowledge/module.ts`, id `knowledge.core`, listed first in `modules/index.ts`) adds three things.

- A yearly entry in the aging seam, phase close, order 20. `yearlyKnowledge` returns at once for the dead and for a life with no record; it
  prunes what can no longer be read, runs the standing orders and settles the heat. A lapse (no cash) logs once and charges nothing.
- A menu row in the slot `assets.money` at order 45, between the Money Team and Banking: the Intelligence Briefing (`intelBriefingMenu`,
  id `intel.briefing`).
- A sink bound to the Effort track's reveal hook at load. When research finishes, `applyReveals` gives a `lab` reading to each stored row
  whose key kind lists the researched field in `revealedBy`, at most 12 rows a call, never in Exact mode, once a year per key. The game's own kinds that name research: `riv` (a rival's quality, technology and lines: the `rd.<family>` of each family it sells, the `dt.<trade>` of a deep-tech trade, `studio.engine` for a studio) and `mkt` (a market's size and shares: the same fields over the families sold in it). The other kinds (`scn`, `val`, `sec`, `odds`) have no research that bears on them, so no `revealedBy`.

### Standing orders

A dial from 0 to 3, kept in the record. Level 0 does nothing. Level 1 buys the trade press for every tracked key (one fee for 12 keys, at
most ten fees). Level 2 adds an analyst for the 3 stalest keys. Level 3 adds the desk (an analyst on retainer, .6 of the fee, a little less
sharp) for the 8 stalest keys. The fee follows the scope, never the cash: it is flat from 1x to 100x of the player's wealth.

## How to add a key kind

A key kind is a family of hidden numbers and the one owner who can say what they really are. A track that fogs a screen does this once.

1. **Pick the kind and the row.** The kind is a lower case word of at most 12 letters (`mkt`, `riv`). If the kind has a row in the rule table
   already, use it. If not, add one row to `RULES` in `knowledge/keys.ts` (unit, sd0, drift, talents) and a line to the table above.
2. **Register the owner at module load.** `registerKeyKind({ kind, label, truth, scope?, scale?, revealedBy? })`. `label(g, key)` is the words
   a menu prints; `truth(g, key)` is the real value today, or null when there is nothing to read (a rival that left); `scope(g, key)` is the
   `Scope` that prices a source; `scale(g, key)` is what a signed amount is measured against; `revealedBy(g, key)` lists the Effort research
   fields whose results sharpen the key. The same def twice is fine; a different def for a taken kind throws. A `KeyKind` holds code, not the
   game, so nothing here is saved.
3. **Keep the truth honest.** `truth` is a plain read of this year's state: it never draws, never reads a year after `g.year`, and never
   reaches the Investing gut or any market reader (`test/knowledge-fence.test.ts` scans this folder).
4. **Call `know` in the menu**, with the truth as an argument, and end the list with `lookCloser(g, { id, keys })`. It is null in Exact
   mode, when no key has an owner and when every offer is blocked. Its group id is `look.<id>`.
5. **Test it in the fog.** Flip the mode with `inFog` or `withInfoMode`, never with a setter. `test/knowledge-kit.ts` has `fogGame(i)` (a
   cheap life of its own for each draw), `coverage(n, make)`, `registerTestKinds` and `testTruth` (kinds with pure truths), `readerGame`
   (a cheap life that can keep a record) and `deepFreeze`. A coverage case holds the band at 77% to 83% over a few thousand draws.

To add a source, add one row to `SOURCES` with its floor and its reach, a docs row above, and a case in the acceptance sweep. A source
that changes the floors of another is a decision for the owner.

## The contract

`knowledge/contract.ts` is the one door. Another domain (the Fog track, the Effort migration, the UI) imports this file and nothing else
of the folder; an import of `knowledge/mode.ts` or `knowledge/estimate.ts` from outside fails `layers-domains`. It exports:

- the estimate core: `know`, `estimate`, `readValue`, `mergeReadings`, `agedSd`, `wordsFor` (the one formatter, for a band a screen derives from
  an estimate, such as a stake as a share of a valuation), `BAND_Z`, `SD_MIN`, and the types `Estimate`, `EstimateOpts`, `Ladder`, `StoredRow` and
  `Unit`;
- the mode: `infoMode`, `isExact`, `setInfoOverride`, `withInfoMode` and the type `InfoMode`;
- the record: `KNOW_FLAG`, `KNOW_LIMITS`, `readKnow`, `storedEstimates`, `learn`, `widen`, `forget` and the type `KnowRec`;
- the sources: `buyIntel`, `takeReading`, `ingestSignal`, `offersFor` and the types `Offer`, `Scope` and `SourceId`;
- the owners: `registerKeyKind` and the type `KeyKind`;
- the screens: `lookCloser` and `intelBriefingMenu`.

## Guards

| Test | What it holds |
|---|---|
| `test/knowledge-estimate.test.ts`, `test/knowledge-format.test.ts` | the estimate core: honest, stable, pure; the rule table; the words |
| `test/knowledge-record.test.ts` | the record: hostile input, the cap, no foresight, an heir starts clean, old saves load |
| `test/knowledge-sources.test.ts`, `test/knowledge-intel.test.ts` | the floors, the prices, the fees booked once, the repeat refused, the heat |
| `test/knowledge-hub.test.ts`, `test/knowledge-yearly.test.ts` | Look closer, the hub, the standing orders, the module and the reveal sink |
| `test/knowledge-fence.test.ts` | no file here reaches the market or the Investing gut; the gut stays behind the talent |
| `test/knowledge-acceptance.test.ts` | the sweep: coverage of 10,000 draws, the same number twice, a frozen fog life, no year after `g.year`, the books, a 100 year run, the mode never read, these docs |
| `test/info-mode.test.ts`, `test/info-settings.test.ts` | the mode, Exact through `setupFiles`, the Settings card |
| `test/ceiling-list.json` rows `intel-floors`, `intel-price`, `know-keys` | a floor, a price scope and the 120 rows, each with a 100x probe |

## Left out on purpose

- A source that feeds false data (a turned informant). It would break the stated 80% band for that source until the owner says how to
  state its band.
- A real consultancy as the payee of a fee. Area A has no such firm, so the fee goes to `pool:other`; switch the counterparty in `buyIntel`
  when one exists.
- Company-bound records that an heir keeps. Heirs start with no record in R3; "people who remember" is R4.
- A standing orders dial that follows the Effort posture. It is its own 0 to 3 so the two tracks do not depend on each other.
