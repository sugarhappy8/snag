# R4 plan, People UI and fog track: the person profile, hired-staff and CEO reads, the People cockpit (track `people-ui-fog`)

> Cross-check (2026-10-26): `00-crosscheck.md` is written; read it first, then the closing section "Cross-check amendments" of this file. Where they disagree with the text below, they win. Task ids are the ones in `00-crosscheck.md` section 1; lead tasks are `R4-P1` to `R4-P6`; decisions are `X1` to `X52` and conflicts `C1` to `C39` there.

> Review (2026-10-26): the adversarial review was applied. The closing section "Review amendments (2026-10-26)" of `00-crosscheck.md` lists each change; the ones for this file are made inline below (the two-file exposure guard in U2, U6 and U7; the lazy profile chunk in U4; the `staff.ts` anchor in U6; the kids row in U9; the advisor case in U11; the trial-period note; lead action 2; U-A4, U-A6, U-A7, U-A8).

Base: `release/v5.3.0` = `main` a45d3a1 (v5.2.0, "Where the money went"). R4 ships as v5.3.0: the roadmap block calls it v5.2.0, which was already released (R5 is v5.4.0, R6 v5.5.0). Code read at a45d3a1 in `/home/user/snag` on 2026-10-26; nothing was edited except this file. Every "modify" path exists today and carries a path:line checked now; every "create" path does not exist (checked). Plain hyphens only (no U+2014, no U+2013). UNVERIFIED marks a claim I did not check in the code.

## 1. Track summary

**Items covered (11 tasks).** H.7 and D.10 share the person profile (U2 to U5, U9, U10), H.5 is hired staff and the CEO (U6, U7), G.10a is the People cockpit (U8), U1 is the Exact oracle and U11 the acceptance. D.10's reputation panel is not here (R5, D.7); its relationship web is a capped "how you're connected" card, not a graph (decision D17).

**The design in one paragraph.** Knowledge (R3) already turns a hidden number into an estimate with a band and a chip, and the Fog track used it on markets and on the staff shortlist; nothing yet fogs a person. This track makes the person screen say what the player can see. A pure builder `personFacts(g, p)` returns rows that are `known` (name, age, relation, job title, your own Relationship bar, notes), `estimate` (happiness, health, smarts, looks, cash, an NPC's skill and net worth, each a word or a range with the confidence chip) or `unknown` (a trait not yet seen, "Private" cash, "N more things you can't tell yet"). How sharp an estimate is comes from **exposure**, a pure number from `yearsKnown`, `relationship` and `livesWithPlayer` that Knowledge's `exp` option already accepts and no screen passes (`estimate.ts:161-162`). It needs no saved field, and an heir gets the exposure their re-rolled relationships earn (`life.ts:1370-1377`), so nothing is inherited. Eight new rule rows give observable things (looks) a tighter passive sd than inner ones (smarts, traits). One owner file `people-fog.ts` registers the `ppl` key kind, so "Look closer" can sell a private investigator's read of a person (the one source that reads `ppl`, `sources.ts:69`). Hired key staff and CEOs get the same treatment with tenure as exposure: the skill reads as a range that tightens, the trait is named after a year or a background check, and the "current contribution" sentence is recomputed on the player's read so it stops leaking the true skill by inversion. The People cockpit gets four tiles and two badges over facts the player already has. Everything is presentation: the simulation never reads the mode, the new layout sits behind one build flag `peopleProfile` and Realistic only, Exact and flag-off are byte-identical to v5.2.0 (recorded first, U1), and no life, save or golden digest moves.

What a new friend (exposure about .3) and a mother (exposure 1) read like in Realistic. A sketch: the words and ranges come from `know`, the chip is `ConfChip`, and the numbers are examples.

```
Dana Reed, friend - 31 years old            Anna Reed, mother - 58 years old
Relationship  72%  (your own feeling)       Relationship  80%
Happiness     30 to 85  [o..]               Happiness     45 to 90  [o..]
Health        35 to 85  [o..]               Health        about 60  [oo.]
Smarts        15 to 85  [o..]               Smarts        40 to 90  [o..]
Looks         about 70  [oo.]               Looks         about 65  [oo.]
Traits        Not clear yet.                Traits        kind, proud
Cash          Private.                      Cash          $6K to $15K  [o..]
```

| Rule | Value | Task |
|---|---|---|
| Exposure | `min(1, 0.1 + 0.6 [lives with you] + 0.4 min(1, yearsKnown/8) + 0.3 relationship/100)`; non-finite inputs read as 0; pure | U2 |
| What it buys | passive sd x (1 - 0.4 exposure), as `estimate.ts:162` already does; no source below its floor | U2 |
| Close | one function `isClose(p)` = `relationship >= 35 or lives with you`; it stays the gate for cash and NPC career detail; the trust gates of the invest and acquire actions (`npc-lives.ts:441,486`) are game rules and stay | U2, U5 |
| Trait reveal | first word at exposure .30, second at .60 (array order); the rest read "Not clear yet" | U2, U3 |
| Personality | at most 6 of the 15 stats as words, order by `fnv1a(personKey + stat)`; the rest is one `unknown` row | U3 |
| Look closer | one group `look.person`, at most 5 keys (smarts, health, happiness, cash; skill when the person has an NPC life), investigator only, priced by scope (tier 1, the person's country), never by cash | U5 |
| Hired staff | exposure `min(1, years/3)`; trait named at year 1, or at once after a background check at hire; the interview read is carried to the sheet | U6 |
| CEO and manager | the same on `Manager.since`; a background check on the shortlist (3% of the CEO pay norm, booked as `inputs`) | U7 |
| Cockpit | tiles Closest, Drifting, Owed to you, Estranged (a zero tile is not drawn); badges Estranged, Owes you, Drifting | U8 |
| Connections, memories | at most 6 connection rows; at most 3 memory lines, only on a life the Edges track stamped | U9, U10 |
| Forgetting | a researched person or staff member who left is forgotten by the yearly knowledge step, at most 12 rows a step | U2, U6 |
| Flag | `peopleProfile` in `FLAG_DEFS` (`default: false`, `ships: '5.3.0'`), added by the lead; it gates every screen of this track | lead |

The eight rule rows (U2). `sd0` is the passive relative sd, `drift` the yearly drift of the truth; the last column is the band at exposure 0 and 1 (+-1.298 sd, `estimate.ts:29`) and the chip it earns (`confOf`: sd up to .06 is 3 dots, .15 is 2, .30 is 1).

| Row | Unit | sd0 | drift | Talent | Band at exposure 0 / 1 | What it reads |
|---|---|---|---|---|---|---|
| `ppl.looks` | score | .12 | .02 | none | +-16 (2 dots) / +-9 (2) | a face; seen daily |
| `ppl.health` | score | .22 | .15 | none | +-29 (1 dot) / +-17 (2) | people hide illness |
| `ppl.happiness` | score | .28 | .30 | none | +-36 (1 dot) / +-22 (1) | moods move |
| `ppl.smarts` | score | .32 | .03 | none | +-42 (a word) / +-25 (1 dot) | inferred, not seen |
| `ppl.cash` | money | .50 | .25 | none | a factor of 1.9 either way (a word) / 1.5 (1 dot) | a private number |
| `ppl.skill` | score | .30 | .08 | none | +-39 (1 dot) / +-23 (1) | an NPC's craft |
| `ppl.worth` | money | .55 | .20 | none | a factor of 2.0 (a word) / 1.5 (a word) | net worth of an NPC; a passive read only, not for sale |
| `stf.skill` | score | .20 | .05 | Business | +-26 (1 dot) / +-16 (2) | a hire; .20 so a carried interview read (sd .18) stays the sharper one in the year of the hire (`estimate.ts:171`) |

`ppl.*` stays .45/.20 for traits, the 15 personality stats and ambition (+-58 points with no exposure, +-35 with all of it).

**Where the roadmap is stale** (the plan is written against the code).
1. Version: R4 is v5.3.0, not v5.2.0 (`roadmap:244`).
2. D.10 lists a reputation panel and a relationship web. Reputation, gossip and secrets are D.7 and dialogue memory is D.11, both R5 (`roadmap:271-279`); the web needs the Edges track. R4 ships the known/unknown profile, a capped connections card and a slot for the memory lines; the panel is R5 and gets a reserved card position.
3. H.5 names `advisors/team.ts` as a hot file. It is already words only: `ratingLabel` never shows a number (`team.ts:220-225`), a crooked manager's `claimed` is above the true skill (`team.ts:46-54`), `vet()` returns the true rating with the advisor's skill as its odds (`team.ts:366-377`), and the offer rows print the word (`advisors/menu.ts:100,123,142`). The real remaining H.5 sites are the hired-staff sheet and the CEO shortlist in `manage.ts`, which the roadmap does not list.
4. H.7 reads "word ladders, traits revealed one at a time" as UI work. In the engine nothing owns the `ppl` kind, no screen passes exposure, no free source reads `ppl`, and the passive band at `ppl.*` sd .45 is +-58 points (+-35 at full exposure). It needs the rule rows, an owner and the exposure wiring first (U2), and a guard test and a docs note change with it (`test/knowledge-unwired.test.ts:35-39`, `docs/KNOWLEDGE.md:169-173`).
5. The inputs count four copies of the "close" rule. Two are display gates (`PersonSheet.tsx:89`, `npc-lives.ts:479`); the other two (`npc-lives.ts:441,486`) are trust gates of actions and stay.
6. Design 6.6 stores sightings as a 2-bit mask per axis in the person's registry row. A registry row is normalized to `{ id, seen }` (`world/people.ts:48-57`), and a field in `Person.data` is copied to heirs (`life.ts:1371-1380`) against the table that resets personal knowledge. So no sightings are saved; exposure is pure.
7. Design 7.8 says a background check depends on investigator skill, money and time. The code has one fixed `investigator` source, flat per scope (`sources.ts:69`). The plan uses it unchanged.
8. The roadmap says features ship dark behind flags. R3's fog shipped on under Realistic with no flag, and `FLAG_DEFS` is a closed list only the lead edits (`flags.ts:6-9`). This track asks for one presentation key.
9. G.10a appears only as a table cell (`roadmap:254`). Today the Relationships cockpit has a summary line and no tile, and a test pins that (`hubs/cockpit.ts:216-220`, `test/nav-cockpit.test.ts:371-382`).
10. Roadmap line 829 says the CV lanes join the person profile. `charts/reveal.ts` is still the identity function (`reveal.ts:1-8`), so no chart goes on a person in R4.
11. The three U+2014 in `npc-lives.ts:478,481,482` sit in the rows this track rewrites. "Exact is today, byte for byte" (`docs/FOG.md:17`) and "no U+2014" meet there: U5 turns them into hyphens in both modes and logs the move.

**Not in this track, and why.**
- Reputation by group, gossip, secrets, the dialogue composer and `p.data.said` (D.7, D.11, E.T4): R5. U9 reserves the card position `rep` and draws nothing.
- Edges, memory kinds, the `addRelationship` shim, SocialActs, the shared popup budget (Edges and acts track); the registry, `sid` and persona axes (Registry track). This track only reads their pure APIs, in U10 and through `personKey`.
- A saved sightings mask or a per-person counter (rule 6 above). A new free source row for learning about a person: `own` reads at a floor of .25, no better than full exposure at .27, so it would add a row and no information (open question 2).
- Pets, the dead, and the player's own Relationship bar stay exact. `leadershipSummary` (rounded team percents) is observed output and stays.
- The dating Candidate and adoption candidate screens print Looks and Smarts exactly (`love.ts:331,2695`); H.5 and H.7 do not name them. U11 lists them under "Left for later" in `docs/FOG.md`.
- `advisors/team.ts` and `advisors/menu.ts`: no edit (rule 3). The acceptance sweep reads their screens (U11 case (j) proves "claimed versus true" for advisors).
- A separate trial-period hire (design 6, "resume versus interview versus trial"): no trial action is added. The hired-staff exposure `min(1, years / 3)` is the trial in effect: a first-year hire reads wide and tightens, and the trait is named after a year or a background check (U6).
- Cousins and in-laws as people: the profile shows what the Life track makes real (a spouse by name and a kid count from today's data, a materialized niece through `relationLabel`); cousins and the popup in-laws stay per-popup names (`00-crosscheck.md` X46).
- No new sheet or dialog: the Look closer group lives inside `personActions`, so the "Back to" chip, breadcrumbs and the Palette restore it (`ReturnChip.tsx:30-43`).
- `markBest` hints of the Business talent still compute on the truth; that is the R3 rule (`docs/FOG.md:67-68`).

**What I measured** (read, grep, one run of `node scripts/bundle-budget.mjs` on the existing dist, 2026-10-26).

| Fact | Value | Where |
|---|---|---|
| Person profile | exact bars for Relationship, Happiness, Health, Smarts, Looks and up to 15 data stats, trait pills, `Cash on hand` gated at relationship 35 or living together | `PersonSheet.tsx:89,115-141` |
| Tests that render it | one pin in Exact: `Cash on hand`, not `Money` | `test/screens.test.ts:296-302`; also `nav-people`, `nav-cockpit`, `nav-breadcrumbs`, `ui-return`, `nav-release` |
| Exact numbers lower in the sheet | NPC skill N/100, net worth, Ambition N/100 (close), `Entitlement N%`, will anger `(N/100)` | `npc-lives.ts:481-482`, `wealth-menu.ts:139`, `will-amends.ts:40` |
| `ppl` in Knowledge | rule `ppl.*` score .45/.20; investigator reads `riv cand ppl`; no `registerKeyKind` for `ppl`; the sites are market, rival, scenario, valuation, swing, odds | `keys.ts:85`, `sources.ts:69`, `valuation-fog.ts:63`, `market-fog.ts:230,363`, `swing.ts:146` |
| Exposure | `EXPOSURE = .4`; a screen passing `exp:` fails a guard test, which U2 turns into an allow-list of exactly two files (`people-fog.ts`, `business/leader-fog.ts`) | `estimate.ts:36,161-162`; `test/knowledge-unwired.test.ts:35-39` |
| A malformed key | `ruleOf` is null, so `estimate` returns the exact truth: a person key must be checked before `know` | `estimate.ts:152-154` |
| Same-sd tie | a stored row wins only if `rowSd < passiveSd`: an equal sd shows a new draw | `estimate.ts:171` |
| Know record | 120 rows, 12 years, shed stalest first; the Briefing lists 12; nothing drops a row whose subject left; `know` is a personal flag; a stored source token is never used to index `SOURCES` | `rows.ts:25`, `briefing.ts:24`, `module.ts:45-53`, `world-flags.ts:87`, `intel.ts:244` |
| Hired staff | subtitle `skill N`, header `Skill N/100`, trait label, a contribution to 0.1 point; `years` +1 a year | `staff.ts:376,383`, `economy.ts:882` |
| Staff shortlist (R3) | range and "not clear yet" until a check; readings dropped when the shortlist settles; trait-after-a-year deferred to H.5 | `staff-fog.ts:14,45-138`, `staff.ts:169-199` |
| CEO shortlist and rows | label `m.skill/100`, a star at 85, lines with skill and finance skill, hire notice, current CEO row, conglomerate rows, CEO letter | `manage.ts:1824-1825,1888,1913-1915,1971,2190`, `conglomerate-menu.ts:388,414`, `board-ceo.ts:719` |
| People cockpit and badge | summary line only, `tiles` pinned empty; badge `Drifting` for 6 relations under 25 | `cockpit.ts:216-220`, `people.ts:20-22,51-55,65` |
| Dialogs | the person sheet mounts beside the list sheet; `runner.overlay` can add a third; the same-commit freeze is fixed with a test | `RelationshipsSheet.tsx:56-91`, `PersonSheet.tsx:255`, `test/a11y-modal.test.ts:343-358` |
| Layers | `hubs/` is L4; rule (c) counts only L3 to L3 pairs and the baseline may only shrink, so a new root file importing `events/` or `business/` fails | `test/layer-kit.ts:226-272` |
| Bundle | +59,977 of +60,000 gzip bytes (dist not rebuilt here) | `scripts/bundle-budget.mjs`, `bundle-baseline.json` |
| Flags | nine keys, presentation only, lead-edited | `flags.ts:27-48`, `test/flags.test.ts:88-98` |
| U+2014 | the voice guard allows 24 in strings and reports 23; 3 are in `npc-lives.ts` | `test/voice-guards.test.ts:33-36` |

**Line budget.** About 2,270 source lines against the roadmap's 3,200 (the shortfall is the reputation panel, `advisors/team.ts`, a graph and any new screen) and about 4,120 test lines. Source-to-bundle cost is UNVERIFIED; at the 8.2 gzip bytes a line proxy in the R6 preflight it is about 18 KB (UNVERIFIED, not a basis for any limit); the profile branch is a lazy chunk from U4, the rest is eager.

| Task | Item | Lane | Source | Tests |
|---|---|---|---|---|
| R4-U1 Exact oracle | all | main | 0 | 430 |
| R4-U2 rule rows, exposure, `ppl` owner, guard | H.7 | main | 190 | 340 |
| R4-U3 `personFacts` builder | H.7, D.10 | main | 330 | 430 |
| R4-U4 profile layout, `FactRow`, lazy chunk, flag | H.7, D.10 | main | 290 | 360 |
| R4-U5 action rows and Look closer | H.7 | rows | 230 | 380 |
| R4-U6 hired key staff | H.5 | staff | 250 | 360 |
| R4-U7 CEO and manager reads | H.5 | staff | 330 | 380 |
| R4-U8 People cockpit and badges | G.10a | cockpit | 230 | 300 |
| R4-U9 connections card | D.10 | main | 200 | 280 |
| R4-U10 memory lines | D.10 | main | 130 | 200 |
| R4-U11 acceptance, ceilings, docs | all | main | 90 | 660 |
| Total | | | 2,270 | 4,120 |

**State budget.** No world shard, no `Person` field, no `KeyStaff` or `Manager` field. The only new saved data is rows in `flags.know` (one string node each, already capped at 120 by `KNOW_LIMITS`): at most 5 a person looked into and 1 for each carried hire. So the track adds at most 120 nodes and none to a life that never researches or hires with the flag on.

**Acceptance owned, and the test that proves each** (R4 block, roadmap lines 260-269; the UI half only).

| Criterion | The part this track owns | Proven by | Task |
|---|---|---|---|
| Menus pure under `deepFreeze` | every builder, row, tile and badge: JSON, `g.rng`, `g.nextId` unchanged, the same text twice | each task's purity case; the sweep | U3-U10, U11 |
| A person profile with "known" and "unknown" rows | Realistic profile of 14 persons: known, estimate and unknown rows, chips, "Private" below close, traits revealed by exposure | `person-facts-ui.test.ts`, `people-facts.test.ts` | U3, U4 |
| Fog honesty (RF7) | every new rule row holds the truth 77% to 83% of 10,000 draws at exposure 0 and 1; the same read twice in a year is equal | `people-fog.test.ts`, `fog-staff.test.ts`, `fog-leader.test.ts` | U2, U6, U7 |
| Exact is today | Exact and flag-off output equals the oracle recorded at v5.2.0, byte for byte | `people-ui-golden.test.ts` | U1, every task |
| Old saves and hostile records (RF4) | every `save-*.json.gz` renders every profile in Realistic; garbage stats, 500 traits, bad ids, 500 `ppl:` know rows load and stay bounded | `people-ui-acceptance.test.ts` | U11 |
| Replay (RF5) | a life with every profile walked in Realistic ends with the JSON of the same life in Exact | the sweep | U11 |
| Rows of someone who left | the yearly step forgets them, 12 a step, and twice is once | `people-fog.test.ts` | U2, U6 |

Not owned: the shared popup budget, the heir copy rule, eviction of people, the golden relationship files (other tracks).

**Ceilings: every growth term, with its probe at 100 times the input.** This track books no money and draws no `g.rng`.

| Growth term | Ceiling | Probe | Task |
|---|---|---|---|
| Exposure | 0 to 1 whatever `yearsKnown` and `relationship` (x100, 1e300, NaN) | grid | U2 |
| Sharpness | sd never below `SD_MIN` 3% and never below a source's floor | 100x spend and talent | U2, U5 |
| Look closer keys and fee | `PEOPLE_CAPS.lookKeys` 5 (the purchase cap is 12); the fee follows scope and the country, equal at 100x cash | 12,000 purchases | U5 |
| Know rows from people and staff | the shared 120 (`rows.ts:25`); `forgetPerStep` 12 | 12,000 rows of gone people | U2, U11 |
| Rows on a profile | personality 6, connections 6, memory lines 3, traits 2 | a person with 1,500 data stats, 500 kin links | U3, U9, U10 |
| Staff and CEO exposure | `min(1, years/3)` for any `years` | years x100 | U6, U7 |
| Cockpit tiles and badge text | 4 tiles, 12 characters | 5,000 people | U8 |

One ceiling-list entry `people-reads` (token `PEOPLE_CAPS`, `src/game/people-fog.ts`) carries the caps; its probe reaches a cap at 100x (U11).

**Hot files and who touches them** (every edit is its own hunk).

| File | Task | Edit |
|---|---|---|
| `src/ui/components/PersonSheet.tsx:70-152`, new `PersonProfile.tsx`, `people/lazy.tsx` | U4, U9, U10 | `PersonDetails` takes a branch: `usesProfile(p)` renders the lazy `PersonProfile` (the `personFacts` rows), else the legacy markup untouched; the connections card (U9) and memory lines (U10) are edited in `PersonProfile.tsx` |
| `src/game/relationships.ts:3704,3721` | U5 | one line after `willPersonNodes`: the Look closer group. The Edges track edits the same function (`socialNodes`, E10): adjacent one-line hunks, the lead keeps both |
| `src/game/npc-lives.ts:475-492` | U5 | `npcLifeNodes` rows through `readPerson` and `isClose`. The Registry track edits `:96,104,250,336`: different hunks |
| `src/game/business/staff.ts:169-224,369-383` | U6 | HIRE carries the read (a hunk after `b.staff.push(s)` at :222); `staffGroup` subtitle and header. Edges E13 edits the same few lines of HIRE (:222-224) and `:350,410-424,586-598,689`: E13 depends on U6 (review) |
| `src/game/business/manage.ts:1791-1830,1867-1930,1971,2190` | U7 | the shortlist, its check, the hire notice, two rows |
| `src/game/knowledge/keys.ts:85`, `kinds.ts:22-31`, `module.ts:45-53` | U2 | rule rows, the `gone` hook, `forgetGone` in the existing yearly step |
| `src/game/hubs/cockpit.ts:216-220`, `hubs/people.ts:20-22,51-65` | U8 | tiles; `personBadge` |
| `src/game/flags.ts:27-48`, `test/flags.test.ts:88-98` | lead | the key `peopleProfile` |
| `docs/KNOWLEDGE.md:64,123,128,169-173`, `docs/FOG.md:19-35,62-73,83-95` | U2, U11 | rows, the "Not wired" note, the screens table |
| `test/knowledge-estimate.test.ts:542-568`, `knowledge-unwired.test.ts:35-39`, `fog-acceptance.test.ts`, `a11y-modal.test.ts`, `nav-cockpit.test.ts:371-382`, `hub-entry.test.ts:21-53`, `ceiling-kit.ts:703`, `ceiling-list.json`, `ceiling-probe.test.ts:60` | U2, U4, U8, U11 | one entry or case each |

**Lanes and schedule.** Four lanes. `main`: U1, U2, U3, U4, U9, U10, U11. `rows`: U5 (needs U2). `staff`: U6 (needs U2), U7 (needs U6). `cockpit`: U8 (needs U1).
- Behaviour-preserving work goes first: U1 (the oracle) alone, then U2 (rows, helpers and an owner nothing calls yet), then the screens.
- Wave A: U1. Wave B: U2 and U8. Wave C (parallel): U3 in `main`, U5 in `rows`, U6 in `staff`. Wave D: U4, U7. Wave E: U9, then U10 (it needs the Edges track's E6 and E8, so it waits for their merge). Wave F: U11 after every lane is merged.
- The lead brings each head into the lanes that need it by `git merge`, as in R3. This track merges last of the four R4 tracks.

**Lead actions.**
1. Add `peopleProfile` to `FLAG_DEFS` (`{ default: false, ships: '5.3.0' }`) and to the key list in `test/flags.test.ts:88-98` before U4 (three R4 tracks add keys: edit the list once). It stays false until the exit-gate walk passes; the release commit flips it.
2. Re-capture `scripts/bundle-baseline.json` at v5.2.0 (23 bytes left; `node scripts/bundle-budget.mjs --update`). `allowGrowthBytes` stays 60,000 for all four tracks together (X48); this track gets no allowance of its own, and raising the total needs the owner's explicit OK. The profile branch is a lazy chunk from U4 on.
3. Approve the eight rule rows of U2 (Knowledge's decision per `docs/FOG.md:113`) and the `gone` hook on `KeyKind` (small, additive).
4. Tell the Registry planner: this track calls `personKey(p)` (R4-S1) for every `ppl` and `stf` key and never writes `data.sid`. Tell the Edges planner: U10 reads `readEdge`, `memoriesOf`, `socialOn`, and E13 rebases on U6.
5. No re-record of `golden-digests.json`, `r2-parity.json` or `kernel-parity.json` is expected: no module, hook, menu slot or written key joins a played life (the Look closer group is null in Exact, `look.ts:66`). If one moves, the task is wrong, not the fixture.
6. Add the new test files to `scripts/test-timings.json` at the next refresh (`people-ui-acceptance` about 30 s, the rest under 5 s). Append this track's heading to `moved-tests.md`.
7. Exit gate, manual (vitest runs in node, `vite.config.ts:18`): in Chromium at 360 px and 320 px with `?flags=peopleProfile`, open a person from the list, Back to the list, a Palette pick of a person, Look closer open then Back, a hire with a check, a CEO shortlist; the owner reads a 3-life playthrough.

## 2. Contracts

**Provided** (other tracks may rely on these exact names).

| Provided | By | Used by |
|---|---|---|
| `people-fog.ts`: `peopleFog`, `exposureOf`, `isClose`, `pplKey`, `readPerson`, `lookKeysOf`, `traitsShown`, `PEOPLE_CAPS`; the `ppl` key kind | U2 | U3, U5, U8; R6 teams and peers read persons by `ppl:<sid>:<field>` |
| `knowledge/kinds.ts`: `KeyKind.gone?` | U2 | any owner whose subject can leave |
| `hubs/people-facts.ts`: `FactState`, `FactRow`, `PersonFacts`, `personFacts`, `PERSON_SECTIONS` | U3 | U4, U9, U10; R5 adds `rep` |
| `hubs/people-web.ts`: `connectionsOf`; `hubs/people-memory.ts`: `memoryLines`, `MEMORY_PHRASE` | U9, U10 | the profile |
| `business/leader-fog.ts`: `staffExposure`, `staffSkillRead`, `traitNamed`, `leaderRead`, `skillText`; the `stf` key kind | U6, U7 | staff, CEO and conglomerate rows; R6 Game employee |
| `hubs/people.ts`: `personBadge`; `hubs/cockpit.ts`: People tiles | U8 | the sheets, the Palette |

```ts
// src/game/people-fog.ts   (domain life, L3: imports knowledge/contract, kernel/person-ref, flags, types, text/hash, npc-state; not npc-lives, which sits in import cycles)
export const PEOPLE_CAPS: { readonly lookKeys: 5; readonly personality: 6; readonly connections: 6; readonly memories: 3; readonly forgetPerStep: 12 }
export function peopleFog(): boolean                                   // flagOn('peopleProfile') && !isExact()
export function usesProfile(p: Pick<Person, 'alive' | 'relation'>): boolean   // peopleFog() && p.alive && p.relation !== 'pet': the one gate of the profile (eager; the profile itself is a lazy chunk, U4)
export function exposureOf(p: Pick<Person, 'yearsKnown' | 'relationship' | 'livesWithPlayer'>): number   // 0..1, total
export function isClose(p: Pick<Person, 'relationship' | 'livesWithPlayer'>): boolean                    // relationship >= 35 || livesWithPlayer
export function pplKey(p: Pick<Person, 'id' | 'data'>, field: string): string | null                    // `ppl:${personKey(p)}:${field}`, null when parseKey refuses it
export function readPerson(g: GameState, p: Person, field: string, truth: number): Estimate | null        // know(g, key, truth, { exp: exposureOf(p) }); null for a bad key, never the truth
export function lookKeysOf(g: GameState, p: Person): string[]                                            // at most PEOPLE_CAPS.lookKeys
export function traitsShown(p: Pick<Person, 'traits' | 'yearsKnown' | 'relationship' | 'livesWithPlayer'>): { shown: string[]; hidden: number }
// src/game/knowledge/kinds.ts: KeyKind gains  gone?(g: GameState, key: string): boolean   // true when the subject has left; module.ts forgets such rows
// src/game/hubs/people-facts.ts   (L4)
export type FactState = 'known' | 'estimate' | 'unknown'
export interface FactRow { id: string; label: string; emoji: string; text: string; state: FactState; conf?: 0 | 1 | 2 | 3; asOf?: number; bar?: number; how?: string }   // text 90 chars, how 120
export interface PersonFacts { rows: FactRow[]; exposure: number; unknown: number }
export const PERSON_SECTIONS: readonly ['facts', 'traits', 'personality', 'connections', 'rep', 'memories', 'notes']   // 'rep' draws nothing in R4
export function personFacts(g: GameState, p: Person): PersonFacts | null   // null: show the legacy layout (Exact, flag off, pet, the dead)
// src/game/hubs/people-web.ts, people-memory.ts
export function connectionsOf(g: GameState, p: Person): FactRow[]                 // at most PEOPLE_CAPS.connections
export function memoryLines(g: GameState, p: Person, n?: number): string[]        // [] unless socialOn(g); at most 3
// src/game/business/leader-fog.ts   (leaf: knowledge/contract, flags, text/hash and types only, so it joins no import cycle)
export function staffExposure(years: number): number                              // min(1, years / 3)
export function staffSkillRead(g: GameState, assetId: string, s: { id: string; skill: number; years: number }): Estimate | null
export function traitNamed(g: GameState, assetId: string, s: { id: string; years: number }): boolean   // years >= 1, or the carried read came from a check
export function leaderRead(g: GameState, key: string, skill: number, exposure: number): { text: string; conf?: 0 | 1 | 2 | 3 }
export function skillText(e: Estimate, skill: number): string                     // moved from staff-fog.ts:75
// src/game/hubs/people.ts: export function personBadge(g: GameState, p: Person | undefined): string | null   // 'Estranged' > 'Owes you' > 'Drifting'
```

**Needed.** From Registry and persona: `personKey(p: Pick<Person, 'id' | 'data'>): string` and `personEntity` (`kernel/person-ref.ts`, R4-S1). From Edges and acts: `readEdge(g, from: EntityRef, to: EntityRef)`, `memoriesOf(e)`, `MEMORY_KINDS`, `MemoryKind`, `socialOn(g)` (R4-E6, E8). Existing: `playerRef(g)` (`world/people.ts:36`), `isEstranged` (`will-core.ts:380`), `readTies` (`wealth-core.ts:220`), `readJob`, `holdsFamilyJob` (`nepo-job.ts:65,124`), `know`, `lookCloser`, `learn`, `forget`, `readKnow`, `registerKeyKind`, `isExact` (`knowledge/contract.ts`), `vetFee`, `shortlistId`, `candKey` (`staff-fog.ts`), `withFlags` (`flags.ts:109`). From the lead: the flag key.

## 3. Tasks

Every task also does the following, so the blocks below do not repeat it.
- (a) Test first: the red test is written and seen to fail for the stated reason.
- (b) Checks: `npm run typecheck`, then the named `npx vitest run --maxWorkers=1 <files>`, one run at a time, never the full suite.
- (c) Commit with explicit pathspecs (`git add <paths>`, never `-A`); the message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the session line the lead gives.
- (d) New test files start with `// ci: fast` unless stated; no `seed: <digits>` (positional `makeTestGame(n, ...)` tuples as the Fog tests do, or `findSeed(pred)`).
- (e) Every reader is total (NaN, `__proto__`, 500-row lists, another owner's record never throw) and bounded; every builder runs on a `deepFreeze`d copy with JSON, `g.rng` and `g.nextId` unchanged and the same text twice; a yearly step runs twice and the second run changes nothing.
- (f) Realistic cases go through `inFog` and `withFlags({ peopleProfile: true }, ...)`; the suite runs in Exact (`test/setup-exact.ts`).
- (g) Streams: none. The noise of an estimate is a hashed draw of life, key, year and source (`knowledge/normal.ts`), never `g.rng` and never a named stream, so `test/stream-tap.ts` gets no row.
- (h) Ledger: no new reason, mint or burn. Money moves only through `buyIntel` (reason `intel`) and the existing `payFee` and `firmCash(... 'inputs' ...)`; no file of this track writes `.money` or `.cash`, so the money ratchet stays.
- (i) Saved fields: none (see "State budget").
- (j) Text is static labels and fact lines, each at most 90 characters (a `how` line 120), contractions, no dash, facts first, no encouragement, naming the person where it can. None is a recurring log line, so no `defineLines` pool or `STATE_TABLE` row is needed. No popup, log line, pace family or notice weight is added: the CEO check is one more choice of the existing `business.manager` popup (label at most 5 words) and a Look closer purchase writes one existing investigator line (`intel.ts:95-99`). Copy for the unknown rows: `Not clear yet.` / `You haven't spent enough time with them.`; `Private.` / `You aren't close enough to know.`; `N more things you can't tell yet.` / `Time together shows more.`. The repetition gates (`quiet-acceptance`, `text-kit`, `text-repeat`) run in Exact, so they cannot move; U11 runs each once.
- (k) Seeded tests and fixtures: nothing moves unless the task says so.

### R4-U1 The Exact oracle
**Lane** `main`. **Depends on** nothing; records at the head the lead gives (the shim, E5, is behaviour-preserving, so the tree equals a45d3a1 for everything read here). **Size** 0 source, about 430 test.
**Goal.** Make "Exact is today" and "flag off is today" provable before any screen changes.
**Files.** Create `test/people-ui-kit.ts` (about 150: fourteen persons by `createPerson` with every field given so creation draws nothing, `people.ts:165-211`: parent, sibling, child, spouse, partner, friend, coworker, boss, ex, enemy, pet, a dead parent, a person with an NPC life and Main Character, a person with data stats; two companies from `market-kit` with six key staff; shortlists), `test/people-ui-golden.test.ts` (about 280) and `test/fixtures/people-ui-exact.json` (one row per line, about 60 KB).
**Records** (Exact, flag off, Node 22).
- `renderToStaticMarkup` of `PersonDetails` for the fourteen at relationship 20, 50 and 90.
- The `id` and `text`, `label`, `subtitle`, `disabledReason` of every `personActions` row of the same persons (`statusInfo` `relationships.ts:3666`, `npcLifeNodes` `npc-lives.ts:475`, `infoText` `wealth-menu.ts:132`, `statusLine` `will-amends.ts:35`).
- `staffGroup` subtitle and header for six staff (focus x trait x years 0, 1, 5) and the staff shortlist popup text, labels and data with a check and without.
- `pickManager` popups (standard, executive, finance firm), the current CEO rows (`manage.ts:1971,2190`), the conglomerate rows (`conglomerate-menu.ts:388,414`), the CEO letter's first line (`board-ceo.ts:719`) and the hire notice.
- `cockpitOf('relationships')` for four states, `personGroup(p).badge` for twelve people, and `needsYou(peopleMenu.children(g), g)`.
Every row is built twice on a frozen copy. A U+2014 is stored as a hyphen (the kit maps it), so the fixture holds none. Recorder guard: `RECORD_PEOPLE_UI=1`, `RECORD_REASON` through `checkReason` (`test/golden-cli.ts:49`), Node major 22, a header naming the head.
**Steps.** 1. Kit self-test red then green (rows twice equal; a one-character change to a label turns the file red). 2. Record twice on the clean tree and diff: byte-identical. 3. `npx vitest run --maxWorkers=1 test/people-ui-golden.test.ts test/screens.test.ts test/nav-people.test.ts test/nav-cockpit.test.ts`. 4. `git add test/people-ui-kit.ts test/people-ui-golden.test.ts test/fixtures/people-ui-exact.json`.
**Declares.** Moves nothing. Never re-recorded to make a task pass; an intended move needs a reason and a `moved-tests.md` row.

### R4-U2 Rule rows, exposure, the `ppl` owner, the guard
**Lane** `main`. **Depends on** U1 and R4-S1 (Registry: `personKey`). **Size** about 190 source, 340 test.
**Goal.** The Knowledge half of H.7: a person can be read, sharpened by time and bought. No screen uses it yet.
**Files.**
- Create `src/game/people-fog.ts` (about 140) and `test/people-fog.test.ts`.
- Modify `src/game/knowledge/keys.ts:85` (the eight rows, with a comment on why `stf.skill` is .20), `knowledge/kinds.ts:22-31,44-51` (`gone?` in `KeyKind`, `HOOKS` and `checked`), `knowledge/module.ts:45-53` (`forgetGone` after `recordFor(g)` in `yearlyKnowledge`: at most 12 stored rows whose kind answers `gone` are forgotten; a throw reads as false).
- Modify `test/knowledge-estimate.test.ts:542-568` (the `TABLE`), `test/knowledge-unwired.test.ts:35-39` (the exposure guard becomes an allow-list array of exactly two files, `src/game/people-fog.ts` and `src/game/business/leader-fog.ts`; `leader-fog.ts` must pass `exp:` to `know()` and U6 creates it, so the list holds both from this commit; the check that `exp:` in any other file fails stays; the docs test is reworded to match the new note), `docs/KNOWLEDGE.md:64,123,128,169-173` (the rows; the note reads "exposure is wired by two readers, the person profile and the hired-staff and CEO reads, and by no screen beyond them; `ingestSignal` is still wired by no screen" - the words "no screen" must follow "exposure" with no full stop between, so the docs regex `/exposure[^.]*no screen/i` of the test keeps matching), `test/hub-entry.test.ts:21-53` (`people-fog` in `HUBS`: it registers at load).
**Behaviour.** `exposureOf`, `isClose`, `traitsShown` (first word at .30, second at .60), `pplKey` (null when `parseKey` refuses the key, so a person with a spaced or long id reads `unknown`, never exact), `readPerson`, `lookKeysOf` (smarts, health, happiness, cash, then skill when `npcLife(p)` exists), and `registerKeyKind({ kind: 'ppl', label, truth, scope: { tier: 1, country }, gone })`. `truth` finds the person by `personKey(p) === id` in `g.people` and reads `p.stats.*`, `p.money`, `npcLife(p)` from `npc-state.ts` (skill; a leaf), or `p.data[stat]`; null when absent. Net worth has no truth here: `npcWorth` lives in `npc-lives.ts`, and importing it would put the file in that import cycle, so the worth row is a passive read at the call site and not for sale. `country` is `p.data.countryId` else the character's (the rule of `personCountry`, copied, because importing `events/` would add a `life->events` pair to `layers-baseline.json`). `gone` is true when no person has that key.
**Steps (test first).**
1. Red: the table test lists the eight rows; exposure is monotone in each input, 0 for NaN, at most 1 for 1e300; `pplKey` is null for `'p 1'` and for a 60-character id; `readPerson` on a hostile person (NaN stats, `traits` of 500 strings, `data` stat 1e300) returns an estimate or null and never the truth.
2. Red: coverage over 10,000 draws is 77% to 83% for each row at exposure 0 and 1; the same read twice in a year is equal, another year differs; `lookCloser(g, { id: 'person', keys })` offers the investigator and no other source, at a fee equal for cash x100; `buyIntel` stores rows that `storedEstimates` lists.
3. Red: a person removed from `g.people` has their rows forgotten by the next `yearlyKnowledge`, 12 a step, and a second call changes nothing; the guard test passes with the two allow-listed files and fails if `exp:` appears in a third.
4. Implement. `npx vitest run --maxWorkers=1 test/people-fog.test.ts test/knowledge-estimate.test.ts test/knowledge-unwired.test.ts test/knowledge-acceptance.test.ts test/knowledge-yearly.test.ts test/layers.test.ts test/layers-domains.test.ts test/hub-entry.test.ts`. Commit the files above.
**Declares.** Moves: the three test edits above (rows in `moved-tests.md`) and the docs note. Seeded lives and digests: none (`yearlyKnowledge` returns at once for a life with no record). Layer: `people-fog.ts` adds no cross-domain import.
**Risks.** A guard that allows two files is a promise; the test names both.

### R4-U3 The `personFacts` builder
**Lane** `main`. **Depends on** U2. **Size** about 330 source, 430 test.
**Goal.** One pure function says what the player may read about one person.
**Files.** Create `src/game/hubs/people-facts.ts`, `test/people-facts.test.ts`.
**Behaviour.** `personFacts(g, p)` is null unless `usesProfile(p)` (that is, `peopleFog()`, `p.alive` and `p.relation !== 'pet'`). Rows follow `PERSON_SECTIONS`.
- Known: Relationship (your own feeling, `bar`), Occupation, Known for, Met, Cause of death, the other parent, "Lives with you", "Expecting".
- Estimates through `readPerson`: Happiness, Health, Smarts, Looks, each `text` from the estimate's words with `conf` and `asOf`. Cash is an estimate when `isClose(p)` or a stored `ppl:<key>:cash` row exists (`readKnow`), else `unknown` "Private".
- Traits: `traitsShown` gives the words; the rest is one `unknown` row. Personality: the 15 stats of `PersonSheet.tsx:52-68` that are numbers 0 to 100, at most `PEOPLE_CAPS.personality` as words in `fnv1a(personKey + stat)` order, the rest one `unknown` row. No row carries a number from the truth.
**Steps (test first).** 1. Red, for each of the fourteen persons of the U1 kit: rows stable (twice equal) and frozen-safe, and none contains a true stat value as digits. 2. Red: a stranger (years 0, relationship 30) has no trait and no cash and at least 3 unknown rows; a parent living with you has both traits and cash; more exposure never reveals fewer traits. 3. Red: a pet, the dead, Exact and flag-off give null; hostile persons (NaN stats, 500 traits, a `data` stat of 1e9, a missing `data`, `traits` that is not an array) give rows within caps and no `NaN`, `undefined` or dash; text caps hold for 1,000 generated persons. 4. Implement. `npx vitest run --maxWorkers=1 test/people-facts.test.ts test/people-fog.test.ts test/people-ui-golden.test.ts`. Commit.
**Declares.** Moves nothing (no caller yet). 100x probe: a person with 1,500 data stats gives 6 personality rows and one unknown row.

### R4-U4 The profile layout, `FactRow`, the flag
**Lane** `main`. **Depends on** U3 and the lead's flag. **Size** about 290 source, 360 test.
**Goal.** The player sees the facts. Exact and flag-off draw today's markup.
**Files.**
- Create `src/ui/components/FactRow.tsx` (about 90: label, text, `ConfChip` from `ConfChip.tsx`, a state word for `unknown`, never colour alone), `src/ui/components/PersonProfile.tsx` (the new branch: the hero keeps avatar and name, trait pills become the revealed words, the bars card becomes a stack of `FactRow`s with the Relationship bar kept; U9 and U10 add their cards here; it is the only importer of `FactRow`, `people-facts`, `people-web` and `people-memory`), `src/ui/people/lazy.tsx` (the gate, in the style of `src/ui/nav/lazy.tsx`: `PersonProfileLazy = lazyView('person-profile', () => import('../components/PersonProfile'))`, about 20 lines) and `test/person-facts-ui.test.ts` (it awaits `PersonProfileLazy.preload()` before `renderToStaticMarkup`, as `test/lazy-view.test.ts` does). The profile loads through `lazyView` from this task on (review: the bundle gate has 60,000 bytes for all four tracks and the plans' own proxy estimates more; the lazy chunk is the planned relief, not a fallback; `prefetchLazyViews()` fetches it while the browser is idle).
- Modify `PersonSheet.tsx:70-152`: when `usesProfile(p)` (new in `people-fog.ts`: `peopleFog()` and the person is alive and not a pet; three lines, eager; `personFacts` returns null exactly when it is false) render `<PersonProfileLazy ...>`, else the old JSX runs unchanged. The lazy `fallback` is the hero only (avatar, name, relation, age): it must never be the legacy bars, which print the true stats in Realistic.
- Modify `test/lazy-zones.test.ts` (a zone `people-profile` after the games zone: members `PersonProfile.tsx` and `FactRow.tsx`, gate `src/ui/people/lazy.tsx`; nothing outside the zone imports a member except through the gate; the file's synthetic-tree self-tests cover the new rule; the zone table's exact shape is UNVERIFIED beyond the `GAMES_ZONE` precedent).
- Modify `src/ui/styles/global.css:1356` (append `.person-facts`, `.fact-row`, `.fact-text`, `.fact-how`: two-line rows that do not reuse the bar grid, because its `auto` value column squeezes the track on a word such as "outstanding" at 360 px) and `test/a11y-modal.test.ts` (a case: list sheet, person sheet and a popup from `runner.overlay` mount in one commit and the top one stays live).
**Steps (test first).** 1. Red: Exact and flag-off `renderToStaticMarkup` equals the U1 rows; `Cash on hand` still appears in Exact (`screens.test.ts:296-302` unedited). 2. Red: in Realistic with the flag the markup has no `statbar` for smarts, looks or the data stats, a chip per estimate row, `Private` for a stranger, and none of the true values; before the chunk is loaded the Realistic markup is the hero alone, with no stat bar and no true number; the stylesheet has the new selectors and no rule under 44px for an interactive element; the modal case; `lazy-zones` stays green. 3. Implement. `npx vitest run --maxWorkers=1 test/person-facts-ui.test.ts test/people-ui-golden.test.ts test/screens.test.ts test/a11y-modal.test.ts test/a11y-targets.test.ts test/nav-people.test.ts test/ui-return.test.ts test/lazy-zones.test.ts test/lazy-view.test.ts`. Commit.
**Declares.** Moves nothing in Exact. Bundle: the profile branch (about 350 lines, plus `people-facts`, `people-web` and `people-memory` from U3, U9 and U10) is a lazy chunk, so it stays out of the first download; `usesProfile` and `people-fog.ts` stay eager. The lead measures at B3 and B4 (X48).
**Risks.** The vitest environment is node, so layout and focus cannot be proven in CI: the manual gate (lead action 7) is part of the exit.

### R4-U5 Action rows through the same gate, and Look closer
**Lane** `rows`. **Depends on** U2. **Size** about 230 source, 380 test.
**Goal.** The numbers one scroll lower stop contradicting the profile, and the player can pay for a sharper read.
**Files.** Create `test/people-rows.test.ts`. Modify:
- `src/game/npc-lives.ts:475-492` (`npcLifeNodes`: skill, ambition and net worth through `readPerson` when `peopleFog()`, the close gate through `isClose`; the three U+2014 become hyphens in both modes).
- `relationships.ts:3721` (after `willPersonNodes`: `lookCloser(g, { id: 'person', keys: lookKeysOf(g, p) })` through `knowledge/contract`; null in Exact).
- `events/wealth-menu.ts:139` (`Entitlement N%` becomes `readPerson(g, p, 'entitlement', n)` words) and `events/will-amends.ts:40` (the `(N/100)` goes; `angerLabel` stays).
**Steps (test first).** 1. Red: with the flag and Realistic, none of the three rows prints the true skill, ambition, worth, entitlement or anger as a number, each prints words or a range with a chip; Exact output equals the U1 rows. 2. Red: a person with no NPC life gets 4 keys, with one gets 5; the group is `look.person`, its children are the investigator only, its fee is equal for cash x100 and follows the person's country; buying twice in a year refuses the second; the group is absent for the dead and a pet; the Palette index lists it without a throw. 3. Implement. `npx vitest run --maxWorkers=1 test/people-rows.test.ts test/people-ui-golden.test.ts test/nav-people.test.ts test/relationships.test.ts test/will-menu.test.ts test/ask-families.test.ts test/voice-guards.test.ts`. Commit.
**Declares.** Moves: `npc-lives.ts` Exact text by three characters (U+2014 to a hyphen; no test pins it; a `moved-tests.md` row; the voice count falls from 23 to 20). Ledger: `intel`. Log: one existing investigator line per purchase.
**Risks.** The Palette lists one "Look closer" per person; how `searchIndex.ts:246` ranks duplicates is UNVERIFIED, U11 reads it.

### R4-U6 Hired key staff
**Lane** `staff`. **Depends on** U2. **Size** about 250 source, 360 test.
**Goal.** H.5, first half: the trait appears after a year, the skill is a range that tightens, and the contribution stops leaking it.
**Files.** Create `src/game/business/leader-fog.ts`, `test/fog-staff.test.ts`. Modify `staff-fog.ts:75` (`skillText` moves to the leaf; the file imports it), `staff.ts:169-224` (HIRE: `dropVet` at :174 discards the background checks, so the shortlist read is taken before it; the staff id exists only at `id: uid(g, 'ks')` :209, so when `peopleFog()` the read is `learn`ed into `stf:<asset>:<id>:skill`, source `diligence` after a check and `interview` otherwise, right after `b.staff.push(s)` at :222; Edges E13 adds its `hired_me` memory at the same spot, :222-224, so E13 depends on this task), `test/knowledge-unwired.test.ts` (`leader-fog.ts` passes `exp:` to `know()`; the allow-list U2 wrote names it, so no edit is expected here, and this task adds the path if U2 did not), `staff.ts:369-383` (`staffGroup`: `subtitle` becomes a function `${role} · skill <range> · morale N%`; the header prints the range, names the trait only when `traitNamed`, and recomputes "current contribution" with `leadershipPower` on a copy of `b.staff` whose skill is `round(read.mid)`; the team summary is unchanged).
**Behaviour.** `staffExposure(years) = min(1, years/3)`. The leaf also registers an owner for `stf` that gives a label and `gone` only: it reads `a.details.staff` as raw JSON, because importing `business/state` would put the leaf in the 59-module cycle. No source reads `stf`, so nothing is for sale and `cand` stays ownerless (`fog-acceptance.test.ts` pins that). A carried row wins in the hire year because its sd (.18, or .108 with the Business talent) is below the passive .20 (.12); later the lower aged sd wins. `traitNamed` is true when `years >= 1` or the stored row's sources include `diligence`. The source token `interview` is safe: stored tokens are never used to index `SOURCES` (`intel.ts:244` only tests membership), and a test proves the Briefing and the standing orders read such a row.
**Steps (test first).** 1. Red: Exact equals the U1 rows. 2. Realistic year 0 shows the carried range equal to the shortlist's, year 1 names the trait, year 3 reads at exposure 1; a checked hire names the trait at year 0; the contribution sentence for two staff of different true skill and the same read is equal. 3. Coverage of `stf.skill` at 0 and 1; `years` x100 gives exposure 1 and sd at least 3%; a hostile `KeyStaff` (NaN skill, a missing `years`) prints without NaN; a staff member who quit or was fired has the row forgotten next year; `g.rng` unchanged by the sheet. 4. Implement. `npx vitest run --maxWorkers=1 test/fog-staff.test.ts test/fog-hire.test.ts test/people-ui-golden.test.ts test/knowledge-unwired.test.ts test/layers.test.ts test/architecture.test.ts`; also `test/company-dashboard.test.ts test/lab-team.test.ts test/ledger-flows-business.test.ts` (there is no `test/staff*.test.ts`; checked with ls). Commit.
**Declares.** Moves nothing in Exact. Saved: one `flags.know` row per carried hire, inside the 120 cap. `architecture.test.ts` proves the leaf joins no cycle.
**Risks.** E13 (staff loyalty) edits the same file in the same few lines of the HIRE script (:222-224), so E13 depends on U6 and rebases on this commit. Its other `staff.ts` hunks (:350, :410-424, :586-598, :689) are well away from U6's.

### R4-U7 The CEO and manager reads
**Lane** `staff`. **Depends on** U6. **Size** about 330 source, 380 test.
**Goal.** H.5, second half: the CEO shortlist, the hire notice, the CEO rows and the conglomerate rows read through the same helpers.
**Files.** Create `test/fog-leader.test.ts`. Modify:
- `business/manage.ts:1791-1830` (MANAGER_PICK: a `vet` choice that charges `payFee` once and reopens the list; the hire carries the read; the "New CEO" notice prints the read, `:1824-1825`, and the finance skill from `financeLeadershipSkill` on a copy of the manager whose skill is the read).
- `manage.ts:1867-1930` (`pickManager`: label and lines through `leaderRead` on keys `cand:<shortlistId>:<n>:skill` with role `ceo`; the check choice before "Never mind"; the star at `skill >= 85` is dropped in Realistic because it prints the truth), `:1971` and `:2190` (current CEO rows: key `stf:<asset>:ceo:skill`, exposure `staffExposure(g.year - m.since)`).
- `conglomerate-menu.ts:388,414`, `board-ceo.ts:719` (the letter says `competent`, `elite` or `world-class`, not `N/100`), `staff-fog.ts` (`shortlistId` accepts the role `ceo`).
**Behaviour.** The check costs `max(1, round(ceoPayNorm(b) * 0.03))` (the `VET_RATE` of `staff-fog.ts:45`), so it follows the pay norm and never the cash; it narrows the band to the diligence floor and names nothing new (a CEO's style is already shown). It covers the first 8 candidates; relatives come first in the list (`nepo-succession.ts:120`) and read passive beyond that. `markBest` hints stay as the talent's fallible hint (the R3 rule).
**Steps (test first).** 1. Red: Exact equals the U1 popups, rows, notice and letter. 2. Realistic shows ranges with no digit of the true skill outside the band, no star, the check only when company or owner can pay; the check charges once; the hire notice and the rows agree with the carried read; the finance-firm text keeps its profile summary; the fee is equal for cash x100; coverage as U6; `payFee` books `inputs` only. 3. Implement. `npx vitest run --maxWorkers=1 test/fog-leader.test.ts test/people-ui-golden.test.ts test/fog-hire.test.ts test/knowledge-unwired.test.ts test/ledger-flows-business.test.ts`; plus `test/board.test.ts test/ceo.test.ts test/ceo-letters.test.ts test/conglomerate-v2-management.test.ts test/sector-ceo.test.ts` (these exist; checked with ls). Commit.
**Declares.** Moves nothing in Exact. Ledger: `inputs`. Popup: one added choice of `business.manager`; no new family.
**Risks.** `manage.ts` is 2,368 lines and a hot file; the hunks are four and local.

### R4-U8 The People cockpit and badges (G.10a)
**Lane** `cockpit`. **Depends on** U1. **Size** about 230 source, 300 test.
**Goal.** The Relationships tab opens on something: who is close, who is drifting, who owes you, who has cut you off.
**Files.** Create `test/people-cockpit.test.ts`. Modify:
- `hubs/cockpit.ts:216-220` (`relationshipsModel`: with `flagOn('peopleProfile')`, tiles `closest` (name, relation, meter = relationship, `open: [personGroupId(id)]`), `drifting` (count, `open` the lowest), `owed` (sum of `readTies(g, p).owes` over the living, shown above 0), `estranged` (`isEstranged` count, shown above 0); the summary line stays).
- `hubs/people.ts:20-22,51-65` (`drifting` becomes `personBadge`: `Estranged`, then `Owes you`, then `Drifting`; the constants are shared by the tile).
- `test/nav-cockpit.test.ts:371-382` (the "no tiles" case runs under `withFlags({ peopleProfile: false })` so it survives the flip).
No UI file changes: `RelationshipsSheet.tsx:49-52` already opens a person from `path[0]`.
**Steps (test first).** 1. Red: flag off equals the U1 model and badges. 2. Flag on gives only known facts (no estimate, no hidden stat), at most 4 tiles, ties by id, a zero tile absent, text at most 40 characters, `open` ids that resolve to a living person; `needsYou` lists Estranged and Owes you rows; 5,000 people give 4 tiles in one pass; hostile persons (NaN relationship, a missing `data.w`) never throw; frozen, pure. 3. Implement. `npx vitest run --maxWorkers=1 test/people-cockpit.test.ts test/nav-cockpit.test.ts test/nav-people.test.ts test/nav-needs.test.ts test/people-ui-golden.test.ts`. Commit.
**Declares.** Moves: the one pin above (a `moved-tests.md` row). Nothing else; badges are not saved.

### R4-U9 The connections card (D.10)
**Lane** `main`. **Depends on** U4. **Size** about 200 source, 280 test.
**Goal.** "How you're connected": kin, company, feud and debt, only what the player knows.
**Files.** Create `src/game/hubs/people-web.ts`, `test/people-web.test.ts`. Modify `PersonProfile.tsx` (a card after the facts, from `connectionsOf`, with the `rep` position left empty).
**Behaviour.** At most 6 rows from today's data: the other parent and a spouse by name (`otherParentId`, `data.spouseName`, `exSpouseId`), a job at one of your companies (`readJob(p)` and the asset name), a family stake, estranged since (`isEstranged`), "owes you $N" (`readTies`), and "N kids" from `data.kids` (a count, so a sibling's new baby shows on a stamped life even though the baby is a Met-only record with no profile in R4). Nothing about the person's own secrets.
**Steps (test first).** 1. Red: each row appears for its fixture and not otherwise; at most 6 for a person with 500 links; no row names a person who is not in `g.people` unless the record stores the name; on a stamped life where a sibling marries and has a baby (found with `findSeed`) the sibling's profile shows the spouse by name and "1 kid". 2. Frozen, pure; Exact and flag-off give no card. 3. Implement. `npx vitest run --maxWorkers=1 test/people-web.test.ts test/person-facts-ui.test.ts test/people-ui-golden.test.ts test/nepo.test.ts`. Commit.
**Declares.** Moves nothing.

### R4-U10 Memory lines
**Lane** `main`. **Depends on** U9, R4-E6, R4-E8, R4-S1. **Size** about 130 source, 200 test.
**Goal.** On a life the Edges track stamped, the "Shared history" card starts with what the person remembers.
**Files.** Create `src/game/hubs/people-memory.ts` (`MEMORY_PHRASE`: one short sentence for each of the 40 kinds of `MEMORY_KINDS`, with a `{name}` slot and the direction in two variants), `test/people-memory.test.ts`. Modify `PersonProfile.tsx` (the notes card).
**Behaviour.** `memoryLines(g, p, n = 3)`: `[]` unless `socialOn(g)`; `readEdge(g, personEntity(p), playerRef(g))`, `memoriesOf`, strongest weight then newest, `${phrase} (${year})`. A phrase is a fact label, not a pick: the same memory reads the same, so no `pickLine` and no repetition risk.
**Steps (test first).** 1. Red: every kind of `MEMORY_KINDS` has a phrase of at most 60 characters, no dash, no banned phrase of `docs/VOICE.md`; an unstamped life gives `[]`. 2. A hostile edge gives at most 3 lines; frozen, pure. 3. Implement. `npx vitest run --maxWorkers=1 test/people-memory.test.ts test/people-web.test.ts test/people-ui-golden.test.ts test/voice-guards.test.ts`. Commit.
**Declares.** Moves nothing (stamped lives only).

### R4-U11 Acceptance, ceilings, docs
**Lane** `main`. **Depends on** U4, U5, U7, U8, U9, U10. **Size** about 90 source (kit rows), 660 test.
**Files.** Create `test/people-ui-acceptance.test.ts` (no `// ci: fast`; about 30 s). Modify `test/fog-acceptance.test.ts` (the owner list gains `ppl` and `stf`, `cand` stays null; a people scene), `test/ceiling-list.json` (after `waves-per-year`: `people-reads`, file `src/game/people-fog.ts`, token `PEOPLE_CAPS`), `test/ceiling-kit.ts:703` (a row: 100x people, data stats, kin links and purchases against the caps), `test/ceiling-probe.test.ts:60` (the id in `touching`), `docs/FOG.md:19-35,62-73,83-95` (the screens table gains the profile, hired staff, the CEO and the cockpit; the sd0 classes gain a face .12, a mood .28, a mind .32, a character .45; "Left for later" drops people sheets and adds the dating and adoption candidates), `moved-tests.md` (this track's heading).
**Cases.**
- (a) screens: Realistic has its chips and Look closer, Exact has none. (b) pure: every screen of the track on a frozen copy. (c) owners: `ppl` and `stf` registered once the game loads.
- (d) after a Look closer purchase, a hire with a check and a CEO check, every screen renders. (e) played: three lives of 40 years in Realistic with every profile, staff sheet and cockpit rendered each year. (f) replay: the same lives in Exact end with equal JSON.
- (g) old saves: every `save-*.json.gz` renders every profile; hostile: 500 `ppl:` know rows of gone people, garbage persons, ids with spaces. (h) docs name the rules. (i) the repetition gates run once, plain. (j) advisors (H.5 "claimed versus true" for the money team, no edit to `advisors/`): a crooked manager's `claimed` rating is above the true `skill` (`advisors/team.ts:46-54`) and the advisor screens print the rating as a word (`ratingLabel`, `team.ts:220-225`) and no skill number in Realistic.
**Steps.** 1. Red cases. 2. Ceiling entries and rows. 3. `npx vitest run --maxWorkers=1 test/people-ui-acceptance.test.ts test/fog-acceptance.test.ts test/ceiling-list.test.ts test/ceiling-probe.test.ts`; then `test/old-saves.test.ts test/golden-digest.test.ts test/r2-parity-kit.test.ts test/replay-purity.test.ts test/voice-guards.test.ts`; then, one at a time, `test/quiet-acceptance.test.ts test/text-kit.test.ts test/text-repeat.test.ts`. 4. Commit.
**Proves.** Honest, stable, pure, bounded, replayable; the digests did not move.

## 4. Risks

1. **Fog frustration.** Everyone reads vaguer; the free path is time (exposure), the paid path is a flat investigator fee. Defaults are words and ranges, and the flag stays off until the owner's playthrough.
2. **A read changes each January** (a new hashed draw), so a child's smarts word can flip between years. The chip and "as of" say so; R3's passive reads behave the same.
3. **Bundle.** 23 bytes left until P1 re-captures the baseline; the rules, exposure helpers, staff and cockpit code are eager, the profile branch is a lazy chunk (U4). Lead action 2 (P1) is a prerequisite for U4. The lead prints the delta at B3 and B4.
4. **Same-commit dialogs.** No new dialog, but vitest cannot see the freeze that v5.2.0 fixed; the manual gate and the new modal case are the guard.
5. **Palette and Briefing clutter.** One "Look closer" per person in the index, up to 5 rows a researched person in the Briefing. Both are bounded; neither is fixed here.
6. **Merge conflicts.** `PersonSheet.tsx` (U4, U9, U10 in one lane), `staff.ts` (E13), `personActions` (E10). Order: Registry, Edges, then this track.
7. **Dependencies not landed.** U2 needs R4-S1, U10 needs R4-E6 and E8; open question 4 has the fallback for U2.
8. **Stale line numbers.** Every anchor was read at a45d3a1; a lane re-greps its anchors before editing.

## 5. Open questions for the lead and the cross-check

1. **One flag for the whole track.** `peopleProfile` also gates the staff, CEO and cockpit screens, unlike R3's unflagged fog. Say if you prefer the staff and CEO reads unflagged (Realistic only).
2. **Free learning.** Exposure is the only free path; the investigator is flat per scope (15,000 at tier 1 and wealth 1), so a poor player cannot buy a read. A cheaper `acquaintance` source (a row in `SOURCES`, reads `ppl`, floor .15) is a Knowledge decision; the plan adds none.
3. **Briefing crowding.** Look closer reads up to 5 keys a person; the Briefing shows 12 rows stalest first. If that crowds markets, a per-kind heading is a small change in `briefing.ts`, not planned.
4. **Registry slip.** If R4-S1 slips, U2 can use a local `pplId(p)` (`data.sid` else `id`) and swap to `personKey` in one line; the key strings are equal for every person made before `sid` exists.
5. **Merge order.** E13 and U6 both edit `staff.ts`; E10 and U5 both add a line to `personActions`. Confirm Registry, Edges, then this track.

## Cross-check amendments

Written 2026-10-26 from `00-crosscheck.md`. Where this section and the text above disagree, this section wins. Plain hyphens only.

**U-A1 Dependencies (C17).** U2 depends on U1, S1 **and P3**: `peopleFog()` calls `flagOn('peopleProfile')`, which does not compile before the key exists, so the lead's flag action is P3 (before U2, not before U4). U8 depends on U1 and P3. U4 depends on U3 and P1 (the bundle baseline). U1 joins the oracle gate that merges before the Edges shim R4-E5 (X4). Lanes unchanged: main U1, U2, U3, U4, U9, U10, U11; rows U5; staff U6, U7; cockpit U8.

**U-A2 Flag (X7, X8).** `peopleProfile` flips in E16, in the same commit as the version bump and `social`; the release rule requires it. If the exit-gate walk fails, the release commit leaves it at `ships: '5.4.0'` and `default: false`.

**U-A3 U9 owns `relationLabel` (C19, X38).** `core.ts:845` returns the capitalized `data.kin` for a `friend` that has one and whose value matches `/^[a-z][a-z -]{0,19}$/` (a materialized niece or sister-in-law; a hostile value reads `Friend`), with a test and a check that no v5.2.0 fixture person is a `friend` with `data.kin` (the nepo kin are coworkers: `nepo-state.ts:127`). Source 190 to 205, tests 260 to 280. The connections card needs no `kinView` in R4.

**U-A4 The known mask (X44).** Nothing is saved per person; exposure is pure. The frozen reader list is `exposureOf`, `isClose`, `traitsShown`, `pplKey`, `readPerson`, `usesProfile`, `PEOPLE_CAPS`, the `ppl` and `stf` key kinds and `KeyKind.gone`. The exposure guard of `knowledge-unwired.test.ts` is an allow-list of exactly two files, `src/game/people-fog.ts` and `src/game/business/leader-fog.ts` (review: `leader-fog.ts` must pass `exp:` to `know()`; routing it through `people-fog.ts` would add a business-to-life import and risk the 59-module business cycle), and `docs/KNOWLEDGE.md` says exposure is wired by two readers and by no screen beyond them. The eight rule rows are approved with the numbers in this plan. The `ppl` truth provider reads Persons of `g.people` only; a Met-only record has no profile until it is materialized.

**U-A5 U10 (X45).** The test that holds one phrase per `MEMORY_KINDS` entry will fail the day R6 appends a kind without a phrase. That is intended.

**U-A6 U11.** Add a four-line money-scan case over `people-fog.ts`, `hubs/people-*.ts`, `business/leader-fog.ts` (X50). The display half of the "marriage for wealth" probe (a read or a shown row changes no money) is a purity case here and no longer counts as the probe's proof; the probe is owned by E15 case (b) (`00-crosscheck.md` section 7). Read how `searchIndex.ts:246` ranks the one "Look closer" entry each person adds (up to 80) and record it.

**U-A7 Merge order (C18).** Delete "this track merges last" as a rule. E13 now depends on U6 (review: both edit the HIRE script of `staff.ts` at :222-224, so the "20 or more lines apart" claim was false for that hunk; E13's other hunks are far from U6's). There is no ordering between E10 and U5 (adjacent lines at `relationships.ts:3721`: E10's `...socialNodes` first, U5's row second; keep both). Hot-file rules are in `00-crosscheck.md` section 2.

**U-A8 Bundle (X48).** The profile cards (`FactRow`, `people-facts`, `people-web`, `people-memory`, in `PersonProfile.tsx`) load through `lazyView` from U4 on: a planned task, not a fallback (review). `allowGrowthBytes` stays 60,000 for all four tracks; a breach at B3 or B4 is raised to the owner with the measured delta, never absorbed by raising the limit.

**U-A9 Cites and test names fixed inline.** `will-amends.ts:35` and `:40` (not :34 and :39); U6 and U7 name tests that exist (`company-dashboard`, `lab-team`, `ledger-flows-business`, `board`, `ceo`, `ceo-letters`, `conglomerate-v2-management`, `sector-ceo`). Other anchors were checked and are true.

**U-A10 Answers to the open questions.** Q1 X8; Q2 X43; Q3 X43; Q4 X21; Q5 X1 (no ordering).
