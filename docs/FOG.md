# Fog

Since R3 (v5.1.0) the screens stop printing numbers the player cannot see. A rival's quality, a market the player does not sell in, a
candidate's skill, the odds of a vote, how much a stock swings, what a private company is worth, the figure in a talent's hint: each is an
estimate with a confidence chip, and a source (see `docs/KNOWLEDGE.md`) narrows it for a price. Knowledge is the model; Fog is the
screens that use it. This page says which screens, which numbers stay exact, the rules they all follow, and how to add one.

The default is Realistic. Exact (a card in Settings) prints every number as before, and the whole test suite runs in Exact
(`test/setup-exact.ts`), so every older assertion holds. A test of the fog flips the mode for one call with `inFog(fn)` from
`test/knowledge-kit.ts`, or `withInfoMode('realistic', fn)`; never with a setter, because the suite override beats the setting on purpose.

Four promises hold on every screen of the track, and each task's test checks them.

- **Honest.** A band the player sees holds the truth about 80% of the time (10,000 draws, 77% to 83%). After a purchase it holds at least 75%.
- **Stable.** The same screen twice in a year is the same text, and a second purchase of the same source in a year changes nothing.
- **Pure.** A menu builds on a deep-frozen state, draws nothing from `g.rng`, writes nothing, and asks the engine for no year after `g.year`.
- **Exact is today.** In Exact mode the text, the labels and the data are what they were, byte for byte.

## What is fogged

| Screen | What reads as an estimate | Key family | File |
|---|---|---|---|
| A rival's profile (R3-G1) | quality and technology as stars, the quality of each product line | `riv:<scope>:quality`, `:tech`, `:<family>:line` | `business/market-fog.ts`, `market-menu.ts` |
| Markets of an industry the player is not in (R3-G2) | demand, the leader's share, champions' shares | `mkt:<industry>:<country>:size`, `:share` | `business/market-fog.ts` |
| Antitrust and the what-if scenarios (R3-G2) | the chance of a case (a word), the profit of a move (a range) | `odds:<company>:antitrust:p`, `scn:<company>:<move>:value` | `business/market-fog.ts`, `market-menu.ts` |
| Hiring (R3-G4) | a candidate's skill as a range, the trait "not clear yet" until a background check | `cand:<shortlist>:<n>:skill` | `business/staff-fog.ts` |
| Scorecards (R3-G5) | the market, the best and your rank on a chip or device board, marked "(estimated)" | `cmp:<row>:<rival>:score` | `business/scorecard.ts` |
| Board and group votes (R3-G7) | the odds of a vote: a word, "about 65%" with the Business talent or a read | `odds:<id>:<kind>:p` | `fog/odds/odds.ts` |
| Politics and the bank (R3-G8) | a coup, a charge, how likely a case surfaces, a scheme's risk, the evidence, a borrower's recovery | `odds:<id>:<kind>:p` | `nation/odds-read.ts`, `business/bank-events.ts` |
| Single stocks, penny stocks, coins (R3-G9) | how much it swings in a year: steady, choppy, wild, extreme, or a range | `sec:<hash>:vol` | `invest/swing.ts` |
| A private company (R3-G10) | what it is worth, as an appraisal range, and your stake as the same band times your share | `val:<asset>:value` | `business/valuation-fog.ts` |
| Purple hints (R3-G11) | the figure after "about", "roughly", "around" or "~" | `hint:<hash>:<n>` | `fog/hint/lens.ts` |

The words and ranges come from `know` (`knowledge/contract.ts`): `$4.2M` when the reading is sharp, `about $4M`, `$3M to $5M`, or only a
word. The chip is three dots (a rough guess, a fair estimate, a good estimate, close to exact) and "as of 2023" once a reading is 2 or more
years old; `MenuList` draws it from the optional `conf` and `asOf` of a menu node.

The odds words are `almost no chance` (under 2%), `a long shot` (under 15%), `unlikely` (under 38%), `even money` (under 62%), `likely`
(under 85%), `very likely` (under 97%) and `almost certain`. The word is the player's reading of the chance, not the chance, so a
65% vote can read "even money" or "likely". A chance of 99% or more, or 1% or less, prints as it always did. The swing words end at 18%,
32% and 55% a year. Evidence reads thin, some, solid or heavy.

A percent is a privilege of the talent that suits the screen, or of a bought read of that very number: Business for a board and the bank,
Leadership for the political odds, Crime for the odds of being caught, Investing for a swing range. It is a multiple of 5 and it can be wrong.

## What is not fogged

- **The player's own books.** Cash, net worth, the asset rows, the player's own prices, own share, and anything under an `own:` key.
- **The player's own markets.** See the market rule below. Size, share, rank, concentration, demand and leaders of every country of an
  industry the player has a company in are published leaderboards and size classes.
- **Published rules and the player's own CV.** Visa odds (`emigrate.ts`) and career interview odds (`careers.ts`). Published AI boards say
  "(published)" and stay exact. Research odds are Effort's: they print "Odds 62%: team +9, funding +7" from `quote`, with the reveal policy
  that `fog/odds/odds.ts` binds (`bindRevealPolicy`): the player's own terms always, the field, the rivals and the public pool only with the
  talent or a read. Every screen that repeats the chance prints it through that policy (`researchOdds`, `oddsChip` and `hintOdds` in
  `effort/why.ts`): "62% odds" in Exact, "odds likely" or "odds about 60%" in Realistic, so a percent never sits next to "unknown factors"
  (`test/research-odds-screens.test.ts` reads every research screen and notice). A stored read of research odds (`odds:rd:`) opens the
  percent too; no screen sells one yet, so today the Business talent is the way in.
- **What a deal runs on.** Offers to buy and every event still use the true valuation; a hire stores the true skill and trait; a roll uses
  the true chance. Fog changes what is shown and nothing else, which is why no golden digest moves.
- **Posted quotes.** A listed company's market cap is a price, so it stays exact.

Left for later (listed here so nobody thinks it was forgotten):

- The Annual Report demand band (spec 6.7 step 4). It waits for R4 with `yearly.ts`.
- Net worth stays exact, so a player can infer a private valuation from it. Accepted for R3; hiding it needs a net-worth range everywhere.
- Segments place rivals by hidden quality (`segOfTier`, `market-view.ts`); the placement stays exact.
- A hint that names the best option still uses the real optimiser. Only the ranking in `markBest` and the numbers after "about" are
  fallible. An optimiser that runs on estimated inputs is planner work for R4 or later.
- The board's Look closer row ("Sound out the board"): a board's vote has no owner that can find its truth yet, so no source can read it
  and the vote shows a word (or a percent with the Business talent) and no chip.
- The valuation sites that still print the truth: the Annual Report, events and offers that name a valuation, the deep-tech and game studio
  statements, the cockpit charts, the Exit tile in `hubs/company.ts` and the "group worth about" line of the form screen.
- Company Watch, politics polls, people sheets and what a rival sees of the player (H.5, H.7, H.9, H.10) are other items.

## The market rule

`knownMarket(g, b, countryId, industry?)` in `business/market-fog.ts` is the one line that says which markets are the player's. The owner's
rule is "exact numbers for the player's own industry's markets", read literally: true in Exact mode, and for every country of an industry the
player has a company in. What fogs is a market of an industry the player has no company in (a screen that shows one passes `industry`), and
the internals of a rival everywhere: quality, technology and product-line quality. Narrowing the rule to the countries where the company
sells, or widening it, is an edit to that function and to nothing else.

## Keys and sd0

A key is `<kind>:<id>[:<id>]:<field>`, at most 64 characters, with ids of letters, digits and `. _ ~ -`. An id that is long or has other
characters is hashed (a rival's scope is a short hash of industry, market and rival, because one rival id is a different company in every
market; a security id such as `TSE:Nikkei 225#s3g0` is hashed to a tag). One key stands for one number, so a read bought for it is a read of
that number and no other.

`sd0` is the passive relative sd of a row in `knowledge/keys.ts` (the table is in `docs/KNOWLEDGE.md`). The classes the track uses:

| Class | sd0 | Rows |
|---|---|---|
| Hard to see | .30 | `riv.quality`, `riv.tech`, `riv.line`, `scn.*`, `val.*` |
| Local market | .25 | `mkt.size`, `mkt.share`, `sec.*` |
| Scorecard, odds, hint | .20 | `cmp.score`, `odds.*`, `hint.*` |
| An interview | .18 | `cand.skill` |

The relevant talent narrows a passive read by 0.6 and a source by 0.8 (Main Character every key), and no read is sharper than its source's
floor. A forecast (`scn`) is a signed amount read against the larger of the move's own value and a tenth of last year's sales, so a small
move does not read as a range wider than itself.

Every family with a Look closer group has an owner: the file that shows the number registers a `KeyKind` with `registerKeyKind` at module
load (`riv` and `mkt` in `market-fog.ts`, `scn` in `market-menu.ts`, `val` in `valuation-fog.ts`, `sec` in `invest/swing.ts`, and the one
`odds` kind in `fog/odds/odds.ts` with a `registerOddsOwner` per kind of hazard). Its `truth` is a pure read of the engine's own number. Without
a truth `lookCloser` offers nothing and no purchase works. `cmp` and `cand` have no owner on purpose: a scorecard is read in place, and a
candidate is read by the background check in the popup (`takeReading`, a fee of 3% of the role's local pay booked through the company, never
the cash on hand), so there is nothing to sell at a Look closer row. A Knowledge test that wants synthetic truths for a kind the game owns
holds them with `overrideKeyKind`, never `registerKeyKind` (a clash throws).

## How to add a screen

1. **Name the hidden number.** Pick or add a key (a rule row in `knowledge/keys.ts` is Knowledge's decision), and make sure the truth is the
   engine's own number, read by the same function the action resolves with.
2. **Read it through `know`.** `const est = know(g, key, truth, opts)`; in Exact `est.exact` is true and the old text stays. Otherwise print
   `est.words` (or a range of your own, from `est.lo` and `est.hi`) and put `conf` and `asOf` on the row. A figure the row derives from an
   estimate (a stake, a market share of a band) goes through `wordsFor`, so two lines never disagree.
3. **Register the owner** (`registerKeyKind`), with a label, the truth and a scope (a tier 1 to 3 and a country, which price the read).
4. **End the list with one Look closer group**: `lookCloser(g, { id, keys })` with at most 12 keys, or the screen's own helper (`lookFor`
   in `business/market-menu-kit.ts`, `swingLook`, `valueLook`, `oddsLook`). It is null in Exact and when no source can read the keys.
5. **Keep the door.** A screen of another domain imports `knowledge/contract.ts`, `fog/odds/contract.ts`, `fog/hint/contract.ts` or
   `invest/contract.ts` and nothing else of the folder (rule c of the layer ratchet). A file of `business/` needs no door.
6. **Test it first.** The Exact text recorded as literals before the edit, a Realistic case with the range and the chip, stable twice,
   pure on a deep-frozen state, an honest band over 10,000 draws, a repeat buy that changes nothing, and a screen row in `test/fog-acceptance.test.ts`.
7. **Words are in the voice.** Contractions, no em-dash or en-dash added, and the caps of `docs/VOICE.md` (a log line 90, an outcome 120, a
   scene 140). `test/voice-guards.test.ts` holds the dash count.

## The doors

A lane that other domains call has one door, a `contract.ts` (rule c of the layer ratchet counts an import between two layer 3 domains
unless its target is a `contract.ts`). The doors of the track:

- `fog/odds/contract.ts`. `oddsWord(p)` is the seven words and `exactOddsText(p)` today's "about 85%". `oddsKey(id, kind)` is the key of a
  vote or hazard. `oddsView` returns the `OddsView` a screen prints (text, the believed chance, whether it is a percent) and `oddsRead` its
  text; this is Fog's line, and `oddsLine` is Effort's research line, which is why the two have different names. `chanceRead` is for a row
  that printed a bare percent, `evidenceRead` and `evidenceWord` for the thin, some, solid and heavy of a case file, `oddsLean` for "will
  likely say yes" (it follows the player's reading, not the truth) and `oddsShown` for a caption that prints only when the player may see
  the odds. `hasOddsRead` is true when a stored read of that very key exists. `oddsLook` is the Look closer group of a screen of
  hazards, `registerOddsOwner` how a kind of hazard says what its true value is (the type `OddsOwner`), `oddsPolicy` the reveal policy the
  research lines read, and `RESEARCH_ODDS` the prefix of research odds. The types are `OddsWord`, `OddsView` and `EvidenceWord`.
- `fog/hint/contract.ts`. `lensHint`, `rankNoise` and `maskFigures`, as the lens rule below says.
- `invest/contract.ts`. `swingRead` says how much a security swings (a `Fogged` phrase with its confidence), `swingWord` and `SWING_WORDS`
  the four words (the type `SwingWord`), `swingKey`, `secTag` and `swingTruth` the key and the real swing behind it, `swingRow` and
  `swingLook` the row and the Look closer group of a security's screen, `analystNote` what a hired analyst said (null in Exact, and when
  the note is stale), and `stockVolOf` and `coinVolOf` the yearly swing the menus have always used. `marketRead`, `marketSignals` and
  the types `MarketSignal` and `SignalKind` are Knowledge's one hedged analyst line of the Financial News (R3-H8).
- `knowledge/contract.ts` is Knowledge's door (`docs/KNOWLEDGE.md`); every screen of this track reads and buys through it.

## The hazard

Illegal sources are allowed, and they are a yearly hazard only; there is no minigame. The hazard is Knowledge's (`knowledge/risk.ts`:
the heat of the illegal sources, `hazardOf`, `settleHazard`, the stream `intel.risk`). An illegal source asks first, adds heat, and the yearly
step can write a criminal record, a wanted level, notoriety and karma and a bad notice; the existing crime step then arrests. No source feeds
false data, because that would break the stated 80% band. Fog adds no second hazard: the screens only list the illegal sources, flagged, at
the Look closer row (`ILLEGAL_CONFIRM`).

## The lens rule

`talentHint` (`talents.ts`, layer 0) runs the text of a purple hint through the port `talents.hintLens`, which `fog/hint/lens.ts` binds when
`modules/index.ts` imports it for the effect. The 207 hint sites do not change.

- In Realistic only. Exact returns the text and the value untouched.
- A figure that follows "about", "roughly", "around" or "~" (a money amount in the money the player reads, a percent, or "N years") becomes
  the talent's reading: a hashed draw through `know` on a `hint:` key, sharpened by the rule table (x.6 with the talent).
- A percent that says it is a chance in its own words becomes the talent's reading too: "12% chance of an offer", "40% to fund", "70% they
  say yes", "20% delivery trouble", "10% of getting some money back". "odds" is not on that list ("(62% odds" is the research chance, which
  reads through the reveal policy), and neither is a rate or a share ("30% margin", "15% of the market"). A site whose words cannot say
  it (an emoji list) writes `hintPct(p)` ("12%" in Exact, "about 12%" in Realistic) or `hintLead()` (the lead word alone), so the lens reads
  it once and the Exact text is unchanged. `test/fog-hint-probability.test.ts` reads every `talentHint(` call in src and fails on a percent
  the lens leaves exact unless the figure is on its short list of things that are not a chance.
- The shape stays: the same currency and unit letter, at most three significant digits, a whole percent of 10 or more to the nearest 5.
- A limit written without "about" (a cap, a year, a horizon, "quality ~4", a count of things) is left alone. The chance of a research
  project in a hint is written "about 62%" in Realistic (`hintOdds`), so the lens reads it once.
- The key hashes the words of the hint with every figure masked (`maskFigures`), so a figure that drifts inside a year moves the reading
  instead of re-rolling it; a new year reads a new number.
- A number a screen already read through `know` must not go through a hint as well: it would be fogged twice.
- `markBest` ranks its options by `rankNoise`, the same draw on each value, so a close call can flip and the mark can land on an option that
  is a little worse. It never invents an option; the margin it names is a size, and its figure goes through the lens. `lensHint(g, id,
  text)` is the lens itself, which the port calls; the door `fog/hint/contract.ts` exports it with `maskFigures` and `rankNoise`.

## Guards

| Test | What it holds |
|---|---|
| `test/fog-market-rivals.test.ts`, `fog-market-regions.test.ts`, `fog-look-closer.test.ts` | rival, market and scenario reads, `knownMarket`, the Look closer rows of the market screens |
| `test/fog-hire.test.ts` | the shortlist, the background check, the fee, the readings forgotten when the popup closes |
| `test/fog-scorecard.test.ts` | published against estimated boards, the chip and device scorecards |
| `test/fog-odds.test.ts`, `fog-odds-sites.test.ts` | the odds helper, the reveal policy, the board, group, politics and bank rows |
| `test/fog-invest.test.ts`, `fog-valuation.test.ts` | swings and the analyst note, the private valuation and its appraisal |
| `test/fog-hint-lens.test.ts` | the lens rule and `markBest` |
| `test/fog-acceptance.test.ts` | the sweep on the merged tree: every screen has its chip or row in Realistic and none in Exact, a hire and a purchase from every source, three industries fuzzed in Realistic, the replay unchanged, these docs |
| `test/foresight-scan.test.ts` | only `invest/instinct.ts` reads a later year; the swing reads and the analyst note do not |
| `test/golden-digest.test.ts`, `kernel-parity.test.ts`, `replay-purity.test.ts`, `old-saves.test.ts` | fog moves no digest, no parity fixture and no old save |
