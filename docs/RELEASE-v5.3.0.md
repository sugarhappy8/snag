# AnotherLife v5.3.0

"People who remember": the people around you stop being names that turn up for one popup and vanish. A
sibling's wedding and babies leave people behind with the same faces next time, a relative's death
settles an estate among the family, what you did to someone changes what they'll do for you, and the
family you leave to your heir arrives with its feelings, its friends and its feuds. The People screen
shows what you actually know about someone, and says "Private" where you don't. Saves from v5.2.0 and
older load and continue, and they play exactly as they did.

## Who gets the new behaviour

Only new lives. A life made on v5.3.0 is stamped when it's created, and everything social in this
release asks that stamp and nothing else (X6). A v5.2.0 save has no stamp, so it plays as v5.2.0 did,
byte for byte, and so does every heir of an unstamped life. A stamped life's heir is stamped too.
There's no Settings switch to turn it on for an old life. The People screen (the profile, the hired
staff and CEO reads and the cockpit tiles) is different: it's presentation only, so it applies to
every life, stamped or not.

## What's new

- **Relatives have partners and children who stay the same people.** When a sibling, a child or a
  parent marries and has babies, the spouse and each baby are kept as records with a name and a face
  that never change. A sibling's profile now says "Married to Linda Campbell" and shows a row for
  their children when they have some.
- **A relative's death settles the estate.** The cash of a relative who dies goes to the family the game
  knows, once, through the books. A niece reads as "Niece" and a brother-in-law as "Brother-in-law",
  never as "Friend". Relatives you had only heard of become people when they inherit. At most 7 heirs
  a death, 12 relatives made people in a year and 30 alive at once.
- **What people remember changes the odds.** A loan repaid or left unpaid, a gift, a betrayal, a secret
  kept or leaked, being cut from the will (41 kinds of memory in all) is remembered by the other
  person and moves how likely they are to repay you, make peace or say yes, by at most 15 points either
  way. Their profile shows the memories that matter on a "Shared history"
  card, three lines at most.
- **Favors, loans, secrets, gossip, peace and a mentor.** Call in a favor from someone close to you (the
  odds are shown honestly: "About 60% to say yes, once in 3 years, you'll owe them"). Ordinary people
  lend at 5 to 10% a year, sharks at 25 to 60%, and a loan can't grow past 3 times what was lent. An
  unpaid loan makes a grudge, and a lender can call: "A Lender Calls". A secret (an affair, a debt)
  can be known by up to 6 people and can leak, and gossip goes at most two hops. A betrayal costs you
  something real, "Make peace" is a row on the person, and you can take up to 3 people under a wing,
  which helps their skills by at most 15%.
- **Feuds climb a ladder.** A grudge of 45 or more, with a betrayal, an unpaid loan or a cut from the
  will behind it, can turn cold, then gossip, then sabotage, then a legal suit. At most 12 feuds are
  live at once. The suit's fee is about 1.5 to 2.5 typical incomes and never more than a quarter of
  your cash. "A Falling Out" asks you whether to make peace, hold firm or pay it off. A grudge a will
  reading leaves between two of your relatives cools within about 9 years, so it never keeps one of
  the 12 places for good.
- **The people who hear gossip remember hearing it.** Their profile reads "Ana heard gossip about you",
  not that they spread it.
- **Key staff and a hired CEO can lose faith in you.** How they feel about you now decides whether they
  quit or can be poached, instead of a flat morale roll.
- **Three family choices a year, no more.** Wealth asks, the family business, the will and feuds share
  one budget, so a rich life no longer gets up to seven family popups in a year.
- **A divorce you can't pay for is owed, not forgiven.** The part of the order your cash can't cover
  becomes a debt to your ex: a fifth of your cash a year, let go after 10 years or when the ex is gone.
  The ex's own shortfall is still forgiven.
- **Your heir inherits the family, not a blank page.** Relatives start at a blend of their old feeling
  and the usual new roll (a sibling at 10 starts near 42, not 5). Your best friends, your foes and the
  people you were tied to by a job carry over. The heir's spouse keeps the same face. What you owed
  people is paid from the estate (an heir is never liable for more), and what people owed you passes by
  the will's share. A sibling can keep a mortgaged firm instead of being paid out in cash. A will that
  cuts someone out can start quarrels between the relatives themselves.
- **The People screen shows what you know.** A person's page gives happiness, health, smarts, looks and
  cash as words or ranges with confidence dots, and "Private. You aren't close enough to know." for a
  stranger. "Look closer" lets you pay for a sharper number. It adds a "How you're connected" card
  (six rows at most) and the Shared history card. Relationships gets four tiles: Closest, Drifting,
  Owed to you and Estranged.
- **Hires and CEOs are read the same way.** A hired key person's skill is a range that tightens with
  the years, a trait shows after a year or after a background check, and a CEO shortlist reads as ranges
  with no star rating.
- **A persona for you, kept quietly.** The game now infers five hidden axes for you (ambition, honesty,
  empathy, risk and steadiness) and stores them. Nothing reads them yet. What they change for the
  player comes in R5.

## The flags

| Key | Default | What it does |
|---|---|---|
| `social` | on since 5.3.0 | Stamps a new life at creation. Everything social asks the stamp, never the flag, so `?flags=-social` only leaves a life made in that visit unstamped. |
| `peopleProfile` | on since 5.3.0 | The profile, the staff and CEO reads and the cockpit tiles, for every life. `?flags=-peopleProfile` turns them off for a visit. |

`peopleProfile` shipped on because case 5 of the walk passed (below). The two keys flipped in their own
commit, with the version bump.

## The caps

| What | Cap |
|---|---|
| People met and kept as records | 400, with 200 tombstones; relatives 160 |
| Kin per anchor | 6 kids; 30 relatives alive as people; 7 heirs a death; 12 made people a year |
| Edges | 1,200; 8 memories on an edge and 4,000 in all; talk on 120 edges |
| Feuds, debts, secrets | 12 live feuds; 40 debts; 40 secrets of up to 6 holders each |
| Family choices | 3 a year, in one budget |
| Favors | one call-in per person per 3 years; strength `min(1, 0.5 + reach / 24)` |
| Loans | a quarter of the lender's cash and twice a typical income at most; a debt up to 3 times the principal |
| Mentor | 3 people at a time, ages 14 to 40, at most 15% on a skill gain |
| The world | 80,000 nodes (40,000 before), a budget of 55,000 nodes and 800,000 bytes; the drop order never takes the books, holdings, met, edges or the stamp while anything else can go |

Every growth term has a cap and a probe at 100 times its input. Twenty rows were added to the ceiling
kit.

## The bundle

The initial bundle is measured against the v5.2.0 baseline of 2,969,098 gzip bytes (main at a45d3a1).

| When | Delta | Initial total |
|---|---:|---:|
| CP2 (the freeze point) | +16,014 | 2,985,112 |
| CP3 (after the last track merge) | +49,637 | 3,018,735 |
| E16 head (bda16a4), `vite build` and `node scripts/bundle-budget.mjs` | +53,676 | 3,022,774 |
| Final head after the review fixes (f542034), the same two commands | +54,001 | 3,023,099 |

The final head is 5,999 bytes under the +60,000 allowance, which stays as it is. The start of the release
recorded about 4.13 gzip bytes per net source line. The final head measures 4.06 over the 13,218 net lines
of `src` (13,956 added, 738 deleted), a little under that rate. The owner approved a raise up to +120,000
if it was needed, and it wasn't, so nothing was raised. The People profile is a lazy chunk
of 5,213 gzip bytes and isn't in the initial total. R5 and R6 start with 5,999 bytes of room, and R5
carries the bundle work (a first download 35% smaller).

## The walk

The lead walked a NEW life (`social` is a stamp, so it has to be created after the flags are on) on the
release preview at 360 by 780, with `?flags=peopleProfile,social`, on release/v5.3.0 at 4678385 (all the
tasks merged, before the rehearsal's defect fixes). It was a random custom life, United States, born
1980. The first years were played by hand; from age 8 a small in-page script pressed "Age up one year"
and answered each popup with OK or its first choice, to reach 2036, age 56.

| Case | Result | What was seen |
|---|---|---|
| 1 Sibling wedding | Pass for the spouse; the kids row wasn't exercised | A brother's profile read "Married to Linda Campbell", and the shared history had the wedding at 46. A sister's said she married at 26 and showed no current spouse. |
| 2 Estate | Partial | Both parents died (father at 86, mother at 83), one "Rest in Peace" choice came once, and the player held $4.48M in cash at 56. No niece or in-law was made in this life, so "reads as niece, not Friend" wasn't seen. |
| 3 Divorce debt | Not reached | The player never married. |
| 4 Will fight | Not reached | No will was written. Family money asks came often from 2029 to 2036, each at most one choice in a popup run, and a Family Loan was paid back in full. |
| 5 People screen fog | Pass | A stranger read "UNKNOWN / Private"; ranges had confidence dots and no true digit; Back returned to the list; "Pay for a sharper number" was offered; favors showed honest odds. |
| An old life, `?flags=peopleProfile` only | Pass | The same fog rendered on an unstamped life. |

Not walked: a Palette pick onto a person, a hire with a check, a CEO shortlist and the cockpit tiles,
because they need a company. Their scripted acceptance tests cover them and the walk didn't. Only 360
pixels was walked, not 320. The walk's play (always give, always the first choice) isn't a normal
player, so its happiness and cash aren't a balance reading. Outcome for `peopleProfile`: case 5 passed,
so the flag ships on.

## The net-worth drift: an open owner decision

The rehearsal compared 200 seeds before and after the flip (CI runs 40470151509 and 40464717451: the
release head with the flags off against the same head with them on). Odd seeds are birth lives played to
80, even seeds are founders. All numbers are net worth in dollars. The tolerance was p50 within 10%, p90
and p95 within 20%, p10 within 25%, and lives alive at 80 within 5.

| Row (lives) | p10 | p50 | p90 | p95 |
|---|---|---|---|---|
| Birth, age 25 (96) | 0 to 0 | 27 to 27 | 150,131 to 150,131 | 605,411 to 605,411 |
| Birth, age 40 (89) | 0 to 0 | 4,753 to 4,753 | 439,769 to 439,769 | 1,186,258 to 1,186,258 |
| Birth, age 60 (65) | -25,261 to -25,113 | 4,707 to 7,059 **breach, +50%** | 399,851 to 714,414 **breach, +79%** | 1,542,177 to 2,429,646 **breach, +58%** |
| Birth, age 80 (16, then 12) | -55,551 to -55,466 | -6,221 to 0 **breach** | 736,479 to 380,936 **breach, -48%** | 1,247,612 to 472,307 **breach, -62%** |
| Birth, final (100) | -40,823 to -36,238 | 0 to 437 **breach** | 299,897 to 380,936 **breach, +27%** | 736,479 to 1,538,479 **breach, +109%** |
| Founder, final (100) | 4,632,815 to 4,809,892 | 14,188,253 to 14,188,253 | 38,446,802 to 38,446,802 | 52,886,490 to 52,886,490 |
| Founder, peak (100) | 7,913,386 to 7,913,386 | 17,369,297 to 17,369,297 | 39,133,063 to 39,133,063 | 52,886,490 to 52,886,490 |
| Lives alive at 80 | 14 to 8 **breach, -6** | | | |

Ten cells breach. The founders and the age 25 and 40 rows are inside the tolerance, and no net worth
passed the hard cap of 1e13. The bisect (nothing was tuned) found this:

- The drift is the new family behaviour and no rate or amount. L5 (a relative's estate), L4 (a kin
  spouse can die and widow a relative), E8 (the memory term in the odds) and E9 (the shared family
  choice budget) change how many people the yearly loops draw for, so the shared dice stream slips and
  a life is drawn again from that year. None of the four pays the player by a rule. With all four off,
  all 200 lives are bit-identical to the flags-off run. With any one on, some come back.
- The extra wealth at 60 is two parents' estates that came out differently in two lives ($6.12M of the
  $6.24M rise in inheritances), and fewer lives alive at 80 is the same re-draw.
- On 800 seeds (400 birth lives) the direction doesn't hold: 75 lives up and 76 down, 57 alive at 80
  before and 58 after, and five breaches, none of them the ones above.
- The unchanged code on another block of 200 seeds breaches 13 to 19 of the 29 cells against seeds 1 to
  200, so 10% and 20% on 100 lives can't be held even by identical code.
- The probe can't see the hand-over (debts, receivables, the sibling's firm), loan menus or favors the
  player chooses, or the divorce debt and the legal fee, which fire in none of the 200 lives.

The owner decides, and it's open. The options are:

1. **Accept the drift and say so.** For it: the cause is a deliberate rule and no tuning knob, and the
   800-seed run shows no direction. New lives play differently from a relative's first death with cash,
   and a single life diverges for good from there.
2. **Tune before shipping.** Against it: nothing in the four causes is a number to tune. L5 moves
   nothing to the player, L4 and E9 are rules, E8 is a term of 0.15 at most.
3. **Ship the cause dark.** All four sit behind `social`, but only all four off restore the 200 lives.
   L5 off alone leaves 13 birth lives moved and seven breaches.

Whichever the owner picks, the gate needs a better measure than a 100-life percentile table: pooled
seeds (12 more shards of 2 to 4 minutes) or a paired design with a measured noise band.

## The fuzz verification

The nightly dispatch on the flipped scratch head found real defects: 3,338 fuzz failures from four
causes, which were fixed in three branches before the flip. They were a prison letter writing through a
frozen state, a kin flag that outlived its last anchor, and an orphan sweep that missed the pair edge of
a spouse and the kin edge of a child when a relative had become a person. After the fixes,
`fuzz-engine` with `--heirs 1 --fork` (8 seeds, 968 life-years) and `--heirs 2 --fork` (8 seeds, 1,042
life-years) on the flipped head found 0 failures. The one finding is
the `note-windfall` the rehearsal already listed: seed 4, 2034, "Cook the Books" took net worth from
$20.3M to $66.3M in one action, for review and not a failure. The 600-second budget still cuts seeds 1,
3 and 4 short of year 160, so the late years of those three aren't covered. The ledger itself never
drifted in the nightly dispatch (drift 0). The three repetition gates (`text-repeat`, `quiet-acceptance`,
`text-kit`) passed with no miss after the flip.

## Under the hood

- **Registry** (`docs/PEOPLE.md`). A person who isn't in `g.people` yet is a slot named by a sid
  (`world/sid.ts`), and `world/latent.ts` makes the same name, face and facts from the family seed every
  time. `g.world.met` (`world/met.ts`) keeps who you've met: 400 records, tombstones that keep an
  obligation, one writer. `materializePerson` turns a record into a person with no random draw.
- **Persona** (`world/axes.ts`, `world/persona-me.ts`). Five axes, a trait bridge and `persona.me`, a
  store of at most four nudges within 15 points. The readers run at parity and nothing is wired.
- **Edges** (`docs/SOCIAL.md`). `g.world.edges` maps `person > player` to trust, affection, respect,
  resentment, obligation and an optional feud, debt and memories, written only through `putEdge` and
  `remember`. `Person.relationship` stays the authority and the edge mirrors it through the hook in
  `kernel/relations.ts` (X22). A yearly edge step keeps them in step. Both `met` and `edges` are
  entity slices of eight chunks each, so a tap writes one chunk.
- **Society** (`src/game/society/`). A `SocialAct` is a pure `blocked` and a pure `plan`, and `runAct`
  is the one place that writes. Luck comes from the named stream `social`, never `g.rng`. Favors, loans
  and debts (`serviceDebt`, `DEBT_KIND`, `debtToken`), secrets, gossip, betrayal, peace, mentorship,
  the feud ladder and the family-act budget live here, and staff loyalty in `business/staff-loyalty.ts`.
  Every dollar moves through `cash.moveCash` under `support` (a divorce debt under `divorce`), booked
  once by a token, so no new ledger reason exists and no money is minted or burned.
- **Kin and the hand-over** (`docs/KIN.md`). `world/kin.ts` and `kin.ts` hold the links, `life.kin`,
  `life.estates` and `life.debts` are aging modules, and `modules/heirs.ts` and `life.ts` carry the
  family across. `kinProblems` names a drift in the links, and a flag now ends with its last anchor.
- **People UI** (`docs/FOG.md`). `people-fog.ts` and `business/leader-fog.ts` are the only two files
  that pass an exposure to Knowledge. The profile, `hubs/people-facts.ts`, `people-web.ts` and
  `people-memory.ts` build the cards, and the profile loads as a lazy chunk.
- **Platform.** CI runs at 8 shards. The world cap and budget were raised, with a fixed drop order.
  `typicalIncome` moved to the layer-2 leaf `world/typical-income.ts`. Every pinned number the release
  moved has a row in `docs/superpowers/plans/2026-10-26-r4-v5.3.0/moved-tests.md`.
- **Tests.** The 13 test files that assumed an unstamped or flag-off life now name the flag they mean
  with `withFlags`, and no assertion was weakened. One audit is narrower: the 120-year registry probe
  checks a played life with `worldProblems(g, { live: false })`, as the fuzzer and the life probe already
  did, because a choice that cuts a friend off leaves a row that is fresh only at the next world step
  (its own row in `moved-tests.md`). The 120-year probes of the registry, the social
  track and the life track are the acceptance of the release, along with `people-ui-acceptance`.

## Seeds

New lives are stamped, so the same seed gives another life from this version on. The golden digests, the
r2 parity canary, the kernel parity fixture, the social parity lives and the scripted lives were
re-recorded under Node 22, each with its reason in the commit and a row in `moved-tests.md`. An unstamped
life, which means any old save, draws exactly as it did on v5.2.0, and the parity tests hold that byte
for byte. No new code path draws from `g.rng`, and a read never does. What moves the dice is that a
stamped life has more people in the old yearly loops (see the drift above). The seven re-rolls of a
hand-over keep their order.

## Saves

Saves from v5.2.0 and older load and continue. Every new field is optional, checked and bounded when it's
read: the stamp (`social`), `met`, `edges`, the kin links on a person and the persona. An old save has
none of them, so it starts with no records and no edges and no social behaviour, and the schema is still
3. Three fixtures cover this. `save-v5.2.0-social.json.gz` is the pre-stamp fixture (22 exes, a loan, a
family firm, a will that cuts a child out). `save-v5.3.0-heavy.json.gz` is the 20-year heavy life on the
release commit, stamped. `save-v5.3.0-stamped.json.gz` is a stamped life after one hand-over with a
loan, a divorce debt, a secret, a feud, kin records and 22 exes. The `save-v5.3.0-` files are the stamped
fixtures that R5, R6 and the nightly old-saves job must keep loading, and a test that wants an unstamped
life picks fixtures by the version in the file name.

## Known limits

- **Dialogue that remembers is R5, and recurring people who aren't kin are R5 and R6.** R4 shifts odds
  and shows memory lines on the profile. The banker you met in 2031 who is the minister in 2040 needs
  live writers for people who aren't kin (R6) and politics slots (R7); R4 delivers the mechanism and
  proves it with kin and an heir's spouse.
- **Cousins and the popup in-laws of your own spouse stay per-popup names (X46).** They're made up for
  one popup and not kept. Real in-laws and nieces exist for NPC weddings, babies and estates only, and
  a niece shows as a person only after her relative dies and leaves an estate of at least half a year's
  income.
- **The player-facing half of the persona is R5 (X18).** Feedback on who you are, narrator lines, guilt
  for acting against honesty or empathy and how NPCs read you come with the composer.
  `personaOf`, `nudgePersona` and `axesFromStaff` have no caller yet.
- **F18 is only partly closed (X37).** An NPC's wage is booked from a named pool, `pool:employers`, under
  a ceiling of 2.5 times the typical income, and the payer is a pool. A named employer that pays and a
  job that is held is R6 (A.K3).
- **Fixtures for R5 and R6.** `save-v5.2.0-social` is the pre-stamp fixture. `save-v5.3.0-heavy` and
  `save-v5.3.0-stamped` are the stamped fixtures that R5 and R6, and the nightly old-saves job, must
  keep loading.
- **The NPC web is mirrored, not authoritative (X22).** `Person.relationship`, `married`, `spouseName`
  and `kids` stay the source, and a later release flips it once the records have run live.
- **An ex's shortfall stays forgiven (X35).** Only the player's own is a debt.
- **Houses and cars of non-heir siblings, and a sibling who already owns a firm, stay cash** until an NPC
  property entity exists.
- **The nightly gate for balance** can't tell a changed rule from a changed seed (see the drift above).
- The list of the other limits, each with its test, is in `docs/KIN.md` section 15.

## Design 7 departures in R4

The roadmap says the design wins on design questions. R4 departs from design 7 and 6.6 in six places.
Each was settled by a cross-check decision, was a lead default, and is listed here for the owner.

| Design text | What R4 does | Reason | Decision |
|---|---|---|---|
| 7.4 `addRelationship` becomes a shim onto affection and resentment; `WealthTies.owes` and `Wl.anger` migrate into obligation and resentment on first read | `Person.relationship` stays the authority; the edge mirrors it at every write; `owes` and `anger` are mirrored at their two writers and read through a pure overlay; nothing migrates on read | A write on first read breaks menu purity, and flipping the authority would move every seeded life | X22, X23 |
| 7.5 NPC marriages and children become real records, replacing `spouseName` and `kids` | The records mirror `married`, `spouseName` and `kids`, which stay authoritative | Four writers and about a dozen readers depend on them, one of them moving money | X22, X32 |
| 6.6 sightings are a saved 2-bit mask per axis in the registry row | Nothing is saved; `exposureOf` is computed from years known, relationship and living together | A registry row holds only an id and a seen year, and a saved field would be copied to heirs against the personal-knowledge reset | X44 |
| 7.2 named people live in `g.world.people`; `createPerson` becomes a wrapper that materializes a slot first | A new shard `g.world.met` and `materializePerson`; `createPerson` is untouched | The `people` shard is an index, and `createPerson` has 54 call sites and a fixed draw order | X9 |
| 7.8 and 5.10: mentorship and reconciliation are `practice` runs | Capped formulas of their own (mentor gain at most x1.15, `reconcileOdds` from peace and memory odds); the focus-week hookup is left to R6 | The `practice` machinery isn't in the R4 tracks, and the capped formulas are pinned by probes | E11, E12 |
| 7.6 favor capacity is the giver's reach and wealth and it decays; staff loyalty includes whistleblowing | Capacity is reach with a 3-year call-in cooldown; no wealth term and no decay; whistleblowing isn't built | There's no wrongdoing state to blow the whistle on, and `Edge.o` mirrors `WealthTies.owes`, so a decay would fight the sync | E10a, E13 |

## For the owner

The calls that deserve an eye before merge and tag, each taken as the lead's default:

- Only new lives get the stamped behaviour (X6).
- `peopleProfile` ships on because the walk's case 5 passed, and the walk didn't reach cases 3 and 4.
- The balance drift above, and whether the numbers the planners invented deserve a review: the favor
  rule (affection at least 50 and trust at least 40), the loan rate and debt cap, the feud start chance
  `0.10 + (s - 45) / 200` a year, the staff quit and poach formulas, the mentor cap and the legal fee.
- A direct relative's feeling at the hand-over is a blend, not half (X33). If the owner wants the strict
  0.5, keep the seven draws and set `relationship = round(0.5 x old)` for kept kin.
- Heirs are never liable, and receivables pass by the will's share (X34).
- The family budget counts choices only (X40).
- Cousins and spouse's in-laws aren't delivered, so the "People who remember" headline promises a little
  more than three of the roadmap's "player sees" lines (X46).
- The whole-diff review appended a 41st memory kind, `heard_gossip`, to the append-only list frozen at
  E6a, with its `MEMORY_FX` row and its phrase in the same commit (17af4e7). R5 and R6 code against 41.
- The bundle is 5,999 bytes under the allowance, with a raise to +120,000 pre-approved if needed.
- The world node cap went from 40,000 to 80,000 (X47), and CI went to 8 shards (X49).

## The size of the release

Counted on release/v5.3.0 at bda16a4 against main at a45d3a1 (`git diff --shortstat origin/main`).

| What | Plan (roadmap, then cross-check) | Built |
|---|---|---|
| `src` | 16,900; 14,135 | 180 files, +13,956 and -738 lines (net 13,218) |
| `test` | 20,024; 26,383 | 147 files, +59,699 and -455 lines; 128 files and +54,299 of them are test code and kits, 19 files and +5,400 are recorded JSON fixtures |
| `docs` (without the plans) | 1,800 | 16 files, +2,222 and -51 lines, before this file |
| `scripts` | not planned | 5 files, +584 and -7 lines |
| Tasks | 15 in the roadmap; 59 in the cross-check | 54 plan tasks merged |
| Wall time | 21.1 hours (roadmap) | about 34 hours, from the first commit on the branch (2026-10-26, 11:44 UTC) to the E16 head (2026-10-27, 21:40 UTC); agent-hours weren't tracked |
| World nodes | R4 about 29,000 | at the caps: `met` 10,401 and `edges` 19,929, about 30,300 in all; the whole world at every cap about 45,600 nodes and 443,000 bytes. A played stamped fixture holds about 1,000 nodes in its world |

The roadmap planned 16,900 source lines, and the 13,218 net lines built are 78% of that. The tests came to
nearly three times the 20,024 planned, counting the fixtures, and the cross-check had already moved
that plan to 26,383.

## CI

The E16 head bda16a4 was green on the push run 40590186417 and the pull request run 40590193092. After
the whole-diff review fixes, f542034 was green on the push run 40602788414, the pull request run
40602790857 and the dispatched run 40603088615, with all 8 shards, the guards, the typecheck, voice and
build step, and the gate, and on Preview. `scripts/test-timings.json`
was refreshed from run 40590186417 (619 files from 8 reports).
