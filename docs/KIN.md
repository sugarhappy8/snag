# Kin: a relative's spouse and children

The note for the kin links of R4 (v5.3.0). A sibling, a child or a parent of the player marries and has babies. Before R4 that was
three fields on the relative (`married`, `spouseName`, `kids`) and a log line. R4 adds the people behind those fields as Met records
(`docs/PEOPLE.md`, section 5), so their faces never change, and links the relative to them. This file is the saved shape of the
links, the caps, the pure readers and the problems list (R4-L3, `src/game/world/kin.ts`), from section 9, the writers, the yearly
step and the frozen table of the face (R4-L4, `src/game/kin.ts`), from section 10 the estate (R4-L5, `src/game/modules/kin-estates.ts`) and
from section 11 the debts and claims of the hand-over (R4-L6, `src/game/modules/heirs.ts`) and from section 12 the divorce debt (R4-L7,
`src/game/divorce-debt.ts`).
Later tasks add their sections: the rest of the hand-over (R4-L9) and the known limits (R4-L12). Plain hyphens only: no long dashes here.

## 1. The rules

- **New behaviour runs only on a stamped life** (X6). A life made before the `social` flag, and every heir of one, keeps `married`,
  `spouseName` and `kids` as they were, gets no link and no Met record. The readers of sections 1 to 8 write nothing; the only
  writers are `adoptSpouse`, `adoptChild`, `unlinkSpouse` and `syncKin` of section 9, and they return at once on a life that is not
  stamped.
- **The legacy fields stay authoritative** (X22). The links mirror them; `kinProblems` names a drift, and a writer that clears
  `married` is caught the next year, not the same one.
- **A read is pure.** No `g.rng`, no stream, no `g.nextId`, no write; each reader returns new objects and works on a deep-frozen
  state. The luck of a record that is not a Person comes from `ageTo` (`world/life-path.ts`, the stream `life.path`), which is itself
  pure. Nothing here reads a year after `g.year` (no foresight).
- **Every saved key is optional, validated and bounded.** An old save has none of them. A value that is not what the reader wants
  reads as no link; it never throws and it is never repaired in place.
- **`data.sid` is never written on a relative that already exists** (X15). A kin sid lives in the Met shard; a Person gets one only
  when it is made from a record (R4-L5), and never a child, a stepchild or a grandchild: `heirUnsafe` (`kernel/person-ref.ts`, C36)
  names that shape, and `kinProblems` reports it.
- **Layer 2.** `world/kin.ts` imports the kernel's `personKey` and `heirUnsafe`, the sid grammar, the Met reader, the life path and
  the types. It imports no layer 3 file, so `business/dynasty-ownership.ts` can use `kinHeirIds` without a new domain pair.

## 2. The links

All on `Person.data` of the **anchor**, the relative that has the spouse and the children. Each is read by `readKin` and nothing else.

| Key | Meaning | Reader |
|---|---|---|
| `spouseSid` | the sid of the anchor's spouse: one, a sid of the strict grammar (`world/sid.ts`) | `readKin` drops anything else |
| `kidSids` | the sids of the anchor's children: a list of at most 6, no repeat, none of them the spouse | `readKin` keeps the first 6 valid and distinct of the first 64 entries |
| `kinY` | the year Life last looked at the links; the next look starts after it | `readKin` cuts it into 1700..2600 and reads 0 for none |
| `estateY` | the year the anchor's estate was settled (R4-L5) | not read here |
| `widowed` | the anchor lost its spouse (R4-L4) | not read here |
| `kin` | the label of a relative who became a Person (`niece`, `sister-in-law`), 20 characters at most, `/^[a-z][a-z -]{0,19}$/` | `relationLabel` (R4-U9) |

The sid of a kin record is `kin.<country>.<year>.<ord>` (X16). A spouse's record carries the Met stake flag 2 and a child's flag 4
while the link stands (Life writes them with `markMet`); the record is evictable again when the link ends.

## 3. The caps (`KIN_CAPS`)

| Cap | Value | Held by |
|---|---|---|
| `kids` | 6 an anchor | `readKin` cuts; `kinProblems` names more |
| `records` | 160 kin records in the Met shard | R4-L4 refuses a 161st |
| `heirs` | 7: the spouse and 6 kids | `kinView`, `kinHeirIds` |
| `persons` | 30 relatives alive as Persons at once | R4-L5 |
| `deadYears` | 10 years that the links of a dead anchor hold their records | `kinProblems`, R4-L4's sweep |

Two scan bounds, so a hostile state costs a bounded amount: `g.people` is read to its first 5,000 entries (the scan of the Met
shard; a game keeps a few hundred) and a kid list to its first 64.

## 4. The readers

| Name | Answer |
|---|---|
| `readKin(p): KinLinks` | `{ spouse, kids, y }`, total |
| `kinView(g, p): KinMember[]` | the spouse, then the kids by birth; at most 7 |
| `kinHeirIds(g, dead): string[]` | ids of the living Persons among them: the spouse, then the kids, the older first |
| `kinPending(g, dead): string[]` | sids of the living records among them that are not Persons yet |
| `kinLabel(role, gender, anchor): string` | the word for `data.kin`, or `''` |
| `kinProblems(g): string[]` | every fault of the links, at most 64 lines and `and more` |

A **member** (`KinMember`) is `{ key, role, first, last, gender, born, country, age, alive, unwell, person }`. It is read from

- **the Person** that holds the sid (`personKey(p) === sid`, alive or dead), when there is one: its names, gender and country
  (`data.countryId`, else the place of the kin sid), its age, and its birth as the year it died (`data.diedYear`, else this year) less
  its age; it is unwell when it is alive and its health is under 40, the line `ageTo` draws for a record. `person` is that Person.
- **else the Met record**: its names, gender (`g` 1 is male), birth and country, aged by `ageTo(g, base, g.year, { since: kinY, died:
  record.d })` with the health `35 + steadiness / 2` (the fifth axis of the record, 35 to 85). `person` is null.

A link to nobody (no Person, no record, a tombstone only) and a link to the anchor itself are absent. A Person is read in
preference to a record: the Person is the live truth, the record the stored one. `kinY` is the anchor's word that the relatives were
alive in that year, so only the years after it are rolled; the record's `d` wins over the roll. So the view of a Person and the view
of a record of the same face give the same member, apart from `person`.

`kinHeirIds` and `kinPending` split the view: an heir is a living Person (an estate can be paid to it, `will-estate.ts`); a pending
relative is alive but has no Person yet, and R4-L5 makes one only when an estate is settled.

## 5. The labels (`kinLabel`)

| Anchor is | A spouse is | A child is |
|---|---|---|
| a sibling, half sibling or step sibling | `sister-in-law`, `brother-in-law` | `niece`, `nephew` |
| a child or step child | `daughter-in-law`, `son-in-law` | (a grandchild: a relation of its own) |
| anything else, a friend's kin included | `''` | `''` |

Every non-empty word matches `/^[a-z][a-z -]{0,19}$/`, the rule `relationLabel` applies to `data.kin` (X38). The anchor's gender is
part of the signature and decides nothing.

## 6. What `kinProblems` names

One line each, prefixed `kin: ` by `worldProblems`. The design's invariant 10 is "one spouse, mutual"; the link half is checked on every life, the edge
half (R4-L4) on a stamped life only.

- a link to a sid that is neither a Person of `g.people` nor a Met record (a tombstone is not a record);
- more than 6 kids; a `spouseSid` or a kid that is no sid; `kidSids` that is no list;
- a link to the anchor itself; a sid linked as the spouse and as a kid; a link on the player's own spouse (relation `spouse`);
- a sid on a child, a stepchild or a grandchild (`heirUnsafe`);
- a spouse sid linked by two living anchors;
- a Met record of the kin kind (`kin.*`) with the spouse or heir flag (`fl` bit 2 or 4) that no living anchor, and no anchor dead for
  under `deadYears`, links. Life flags only the records it mints, and those are kin records (X16); a record of another kind is not
  Life's link, so the check leaves it alone (a classmate whose `fl` a hostile save cut to 63 is the reader's business, not a drift).

An anchor dead for 10 years or more is let go: its links need not resolve and hold no record. A dead anchor with no `diedYear` is not
known to be old, so it holds. Life's yearly sweep (R4-L4) clears an orphan flag in the year it appears, so after any year a flagged
orphan is a real fault and not a lag.

## 7. A relative who became a Person (X38)

When an estate is settled (R4-L5) a relative that was a record becomes a Person with the relation `friend` and `data.kin` set from
`kinLabel`; no `RelationKind` is added, because that would touch every exhaustive switch. A string `data.kin` makes `yearlyNpcLife`
(`npc-lives.ts`) give the person a full NpcLife every year, with keyed decisions, wages from `pool:employers` and marriage rolls. That
is deliberate, a niece has a life, and it is bounded by `KIN_CAPS.persons` and the `npc-wage` ceiling. `data.kin` is not new: the
nepo code (`business/nepo-state.ts`) already puts a string there for in-laws and cousins it hires, on a `coworker`; the two uses do
not meet, because a materialized relative is a `friend`.

## 8. Where it is used

| Reader | By |
|---|---|
| `kinView`, `kinLabel` | the People UI profile (R4-U9 reads `data.kin` through `relationLabel`; `kinView` has no UI reader in R4) |
| `kinHeirIds` | `business/dynasty-ownership.ts` (R4-L5): the stake heirs of an NPC with a family |
| `kinPending`, `kinHeirIds` | `modules/kin-estates.ts` (R4-L5): who inherits |
| `kinProblems` | `worldProblems`, the fuzz harness, the 120-year probe (R4-L12) |

## 9. The writers (R4-L4, `src/game/kin.ts`)

Legacy fields stay the authority (X22): an NPC's `married`, `spouseName` and `kids` are written on four lines and read on about a
dozen, and one reader moves money (`npc-lives.ts`, expenses read `kids`). The records MIRROR them, the way the Edge mirrors
`Person.relationship`: when a relative marries or has a baby, the same name, gender and year become a Met record, so the face never
changes, linked from the relative (the anchor) and joined to it by edges. Nothing here runs on a life the `social` flag did not stamp
(X6): an unstamped life, every v5.2.0 save and every heir of one gets no key, no record and no edge, and keeps its draws and its ids.

| Call | What it does |
|---|---|
| `adoptSpouse(g, anchor, identity?)` | The anchor is alive, married, has no spouse link, and is not a spouse, partner, fiance or pet. `spouseName` is split at the first space (`Juan Carlos de Cuba` is `Juan` and `Carlos de Cuba`, so the joined name is unchanged); the gender is `identity.gender` (the legacy caller passes the one it drew) or a keyed draw; the birth year is the anchor's plus a keyed offset, 18 or more at the wedding. Makes the record (weight 6, stake flag 2), `spouseSid`, the two `pair` edges and the fact `life.wed`. Returns the sid, or null |
| `adoptChild(g, anchor, identity)` | A baby of an anchor that is not a child or a stepchild (those get a real grandchild Person): name, surname and gender are the legacy draws, born this year, weight 4, stake flag 4, appended to `kidSids` (at most 6), the two `kin` edges, the fact `life.birth`. Returns the sid, or null |
| `unlinkSpouse(g, anchor)` | The link ends: `spouseSid` is removed, flag 2 is cleared on the record or tombstone, both pair edges go. The record stays and is evictable. `married` and `spouseName` are not touched |
| `syncKin(g)` | The yearly step, the module `life.kin` (aging seam, `life` phase, order 37, after `effort.you` and before `relationships`; group `people`) |

Every refusal returns null with nothing written. The checks run before the first write: the sid, the 160-record cap, the room in the
edge map for two bound edges. The one write that can still fail (the record is read back and must equal the face given, and the
edges must land) is undone.

### The sid

`kin.<country>.<year>.<ord>` (X16, C38). The country is the anchor's own `data.countryId` when that is text, else the player's, and
must be a valid place (`[A-Za-z0-9_-]{1,12}`); the year is `g.year`, 1850 to 2400; the ord is one above the highest ord among the Met
keys and tombstones with that prefix (0 when there is none), at most 9999. The builder returns null for anything else and never calls
the throwing `makeSid` with saved data. A hostile year, a hostile country, a full Met, 160 kin records already, or a full edge map
makes `adoptSpouse` and `adoptChild` return null and leave no half link.

### The frozen table `KIN_IDENTITY` (X57)

| Value | Meaning |
|---|---|
| `spouseBornOffset` `[-4, 4]` | the spouse's birth year less the anchor's, a keyed whole number, all nine values equally likely |
| `minWedAge` 18 | the spouse is 18 or more on the day of the wedding (the offset is cut down to it) |
| `oppositeGender` 0.92 | the keyed draw mirrors the legacy `chance(g, 0.92)`; the legacy caller passes its own gender |
| `tag` `soc.kin`, `facet` `spouseGender` 0, `spouseOffset` 1 | `streamUnit(streamKey(worldSeed(g), 'soc.kin', year, anchorKey), facet)`; facets 2 to 15 are reserved and unused |

The baby's name, surname and gender are the legacy draws, so the table holds no baby number. A kin record's face comes only from these
values and never changes, so the table freezes at its first recording: after R4 a changed value needs a `RECORD_REASON`, a row in
`moved-tests.md` and the lead's OK. The keyed values are hashes, not streams: no generator, no stream-table row (`docs/STREAMS.md`).

### The edges

Each link has two edges, anchor > relative and relative > anchor, kind `pair` (spouses, first numbers t 70, f 70, r 70 both ways) or
`kin` (a parent and a baby: t 80, f 80, r 70 one way, t 70, f 80, r 70 the other). The kind alone binds the edge (`edgeLocalBound`), so
the edge map never evicts one while the link stands and the orphan rule of the edge step keeps it. `kinProblems` names a link whose
edge is missing in either direction (invariant 10, the edge half). The edges are written and removed with the link, never separately.

### The step (`syncKin`)

Once a year per anchor, stamped by the anchor's `kinY` (a second call in the same year changes nothing; a `kinY` from the future is
stepped once and put right):

1. a married anchor with no spouse link adopts (the three other writers of a wedding, `wealth-family.ts` and `wealth-kids.ts`, and a
   wedding the cap refused);
2. a spouse link on an anchor that is no longer married ends (an NPC divorce, `npc-lives.ts`): flag cleared, pair edges removed;
3. a spouse or a child that `ageTo` says is dead (it scans the years after `kinY`, or after the year the record was made, to this
   year, never past it) has the death year written into its record. A spouse's death widows the anchor: `married` false, `widowed`
   true, a line in their history, one line for the player when they are close (relationship 55 or more, or they live with the player;
   the `npc.news` budget of 3 a year), the fact `life.death`, and the link ends. A child's death ends the child's link and says the
   fact. A link to a record that is nowhere is dropped without a word;
4. every linked record is kept fresh (its last-seen year stamped when it is 3 years old), so the Met sweep, which turns a record not
   seen for 6 years into a tombstone, never takes a spouse or an heir;
5. the orphan sweep: the flags 2 and 4 of a kin record that no living anchor, and no anchor dead for under 10 years, links are
   cleared, and so are its `pair` and `kin` edges, so an anchor that left the game leaves no bound edge behind.

A widowed anchor is `married = false`, so the marriage and baby rolls of `familyLifeCycle` treat it as single from then on (a stamped
life only: those rolls draw from `g.rng`). A record that is no longer linked is an ordinary Met record and is dropped by the sweep
after 6 idle years; its name was told once and the legacy fields keep the story.

The step draws nothing from `g.rng` and its only id is the one log line. It reads no year after `g.year` (no foresight): `ageTo` is
asked about `g.year` and never later. The facts `life.wed`, `life.birth` and `life.death` stop at 8 a year across Life
(`g.yearActions['life.facts']`, shared with R4-L5) and are declared by the module.

### Limits

- A relative's baby becomes a record only when the legacy code rolls it, and only for an anchor that is not a child or a stepchild.
- At most 160 kin records at once. Past that `adoptSpouse` returns null and the step tries a wedding again next year; a baby is not
  retried.
- A record is not stepped: it has an age, a spouse, children, an illness and a death by `ageTo`, and nothing else until an estate
  (section 10) makes a Person of it.

## 10. The estate (R4-L5, `src/game/modules/kin-estates.ts`)

When a relative dies, the cash on their record goes to the family the game models, through the ledger, once. Before R4 it stayed on the
record for ever: the legacy death (`relationships.ts` `handleDeath`) sells the NPC's investments, housing and firm into cash, passes the
player's share and leaves the rest where it is. The module `life.estates` (aging seam, `life` phase, order 55, group `people`) settles
it in the year of the death: relationships (40) is where a death happens, so 55 comes after it and before `givingFund` (60). 45 stays
free and the society phase stays empty (`test/kernel-aging.test.ts`). It runs on a stamped life only (X6); an unstamped life, a v5.2.0
save and every heir of one are left exactly as they are.

| Step | Rule |
|---|---|
| Who | a dead Person with no `estateY` that is not a pet, an ex, an ex spouse or a disowned relative (their cash legacy leaves with them) |
| Means | cash of a dollar or more and at least half the last yearly `NpcLife.income`, or a holding in the holdings table (a stake the family reads). Below that the record keeps its dust, as before, and gets no `estateY` |
| Heirs | `kinHeirIds` (the living Persons the links name: the spouse, then the kids by birth) and then `kinPending` (the living relatives that are Met records only), each made a Person by `materializePerson` as a `friend` with `data.kin` (`kinLabel`: `niece`, `brother-in-law`; none for a friend's kin) and relationship 40 |
| Caps | 7 heirs for a death, 12 relatives made Persons in a year (`g.yearActions['kin.persons']`), 30 kin Persons alive (a Person with a kin sid; a dead one or a nepo coworker with `data.kin` is not counted). A relative the caps leave out is not an heir |
| Cash | the whole dollars of the record, split equally, the remainder to the first heir (the Persons who existed before the Persons made now). One booking per heir by `moveCash`, reason `inheritance`, token `estate:<id>:<year>:<heir>`. With no heir, the rest goes to the pool under `estate` |
| Stamp | `estateY`, the year. A second call, a clone, a reload or the next year changes nothing |
| Fact | `life.estate` (subject the dead, other party the first heir, magnitude the cash that moved), within Life's 8 a year (`g.yearActions['life.facts']`, shared with `life.kin`) |

**The stake.** A dead co-owner's `familyShares` need no move here. `business/dynasty-ownership.ts` `settleLateFamilyOwners` asks
`familyStakeHeirs`, which for a sibling, a child or a grandchild with a family of their own (`married` or `kids`) used to answer nobody
and let the stake leave the family records; it now answers `kinHeirIds`, the Person ids this step has just made, and the stake lands on
the spouse and the kids in equal parts. For a relative with no links the answer is `[]`, as before. `continueAsChild` calls
`settleKinEstates` right before `settleLateFamilyOwners`, so a death the yearly step has not seen yet is settled before the late
player's own estate reads the stakes.

**Materialized kin have a life (X38).** A relative made a Person is a `friend` with a kin sid, so `yearlyNpcLife` gives them a full
`NpcLife` every year, as it does to every relation in `IMPORTANT` and to any person with a string `data.kin`: keyed decisions (no
`g.rng`), a wage from `pool:employers` under the `npc-wage` ceiling, expenses, and a marriage roll that can add kin records of their
own. That is deliberate (a niece has a life). It is bounded by the 30 Persons and by the ceiling, and tested for a `g.rng` draw. The
nepo code puts a string `data.kin` on a coworker too (in-laws and cousins it hires); the two do not meet, because a materialized
relative is a `friend` and the count of 30 reads the kin sid, not `data.kin`.

**Limits.**

- The heirs are the links of the dead and nobody else: a dead parent's cash goes to the pool, not to the siblings; a dead child's
  grandchildren are real Persons and hold the stake by the old rule, while the cash goes to the spouse record, if any.
- An estate over the booking cap of the ledger (1e15) pays the cap and leaves the rest on the record.
- The holdings table is as last written (the settle phase of the year before), so a stake given and left in the same year may read as
  none; the stake then leaves the family records, as it did before R4.
- The part of a relative the caps leave out is shared by the others, not sent to the pool; the pool takes a whole estate only when no
  heir is left.

## 11. Debts and claims at the hand-over (R4-L6, `src/game/modules/heirs.ts`)

A hand-over used to forget two kinds of private money. What the dead player owed to people (a divorce settlement, a loan from a sibling)
went nowhere, and what people owed the dead player (a friend who borrowed $40,000) was lost with the allowance and the history, because
the readers of that record are stamped by the owner (`readTies` compares `by` with the character's id, so after the switch it reads the
late player's records as blank). On a stamped life (X6; an unstamped life, a v5.2.0 save and every heir of one get the old hand-over to
the byte) `continueAsChild` now does two things, both with no `g.rng`, no id and no new ledger reason (X24, X34).

| When | Call | Rule |
|---|---|---|
| Before the slices, right after the will is read | `heirShareOf(n, childId)` | the heir's fraction under the will (`willSlices`): 0 to 1, 0 for a child the will leaves out. Read before `planEstate`, which can change who is in line. Pure |
| Before `planEstate` | `payPersonalDebts(n, old, available)` | `available` is the cash plus the equity of the property that is sold, less the bank loans (which are paid first, exactly as before, and still burn what the estate cannot cover). The debts `debtsOf` lists with the late player as the debtor are paid oldest first, by the age of the debt and not by its kind, each by `serviceDebt(n, key, min(owed, left), debtToken('estate', year, key, old.id), estatePurse(n))`: a divorce under `divorce`, a loan under `support`, out of the late player's account to the creditor's purse. `estate` and `cashAfterDebts` both drop by what was paid, so a sole keeper is not paid twice |
| After `n.character = heir` | `carryReceivables(n, old, share)` | each kept Person's stored claim (`data.w.owes`, read through a view whose character is the late player) passes as `round(claim x share)`, re-stamped to the heir by `updateTies` (the allowance, the history and the marks stay blank: they were the late player's), and E7's mirror writes the claim on the edge person > heir. The rest is forgiven |
| After the heir is the player | `estateSentences(old, debts, claims)` | at most one sentence for the debts and one for the claims, in the heir's currency, added to the `Generation` notice. No popup |

**What lapses.** What the estate cannot pay lapses: no deposit was ever made for it, so it moves no money and burns nothing (the
`writeoff` burn is for bank loans only). A debt whose creditor is no longer a living Person of the game (gone from the list, dead or a
pet), and a debt of a kind nobody serves (2 to 9), lapses the same way. The heir is never liable (D4 b): an insolvent estate pays what
it has, the heir gets nothing and keeps what was theirs, and the cash of nobody goes below 0.

**Every debt that was listed is closed.** Paid in full or lapsed, each debt's edge (the key starts at the late ego) is removed with
`putEdge(n, key, null)`. The hand-over's edge carry takes the edges that END at the ego, so it never sees these; a `dv` left behind
would bind the edge for good (`edgeLocalBound`) and count against `EDGE_CAPS.debts` (40), which counts every valid `dv`, paid or not.
Only the edges `debtsOf` listed go, nothing wider. After five generations the count of open debts does not creep.

**Tokens.** `debtToken('estate', year, key, old.id)` is `estate:<year>:<8 hex of fnv1a(old.id|key)>`, under 40 characters. The ledger
cuts a token at 80 and an edge key can be 95, so a token built from the key would lose its tail; two debts whose keys differ only in
the last characters of two 40-character sids get two tokens, in every year.

**Claims.** The claim is the legacy record and stays the authority (C10). `heirEdges` drops `dv`, so the edge carry of R4-L9 makes no
second copy. A claim is carried at most at 1e12 (the edge model's bound for a debt) and never above itself; a share outside 0 to 1
reads as the nearest end and a share that is not a number as 0. A dead debtor's claim is forgiven (`settleTheDead` zeroes it in the
legacy yearly step anyway), and a record of any other owner reads blank, so a third owner sees nothing. The title of
`wealth.test.ts:446` ("heirs inherit the people, not their parent's allowances or loans") is stale for loans on a stamped life: the
test stays true and green, because the allowance and the history are still the late player's, but the loan now passes at the share.

**Limits.**

- The mirror of a claim the late player held, the edge person > late ego with its `dv`, is not touched here. The edge carry of the
  hand-over (R4-L9) removes every edge that ends at the late ego, so the stale copy stays until that task, and the heir's own edge
  person > heir is the one `updateTies` writes (a new edge starts at trust 50, respect 50, with the person's relationship as affection).
- A creditor the hand-over would not keep as a contact is still paid: the payment is booked to their account before the list is
  rebuilt, and the person is gone from the heir's list afterwards.
- A person's loan is paid from the cash and from the equity of the property that is sold, as the bank's is. A sole keeper keeps the
  property only while the cash after the debts is not below zero; when the cash cannot pay the debts alone the property is sold into
  the estate, exactly as it is for a bank loan.

## 12. The divorce debt (R4-L7, `src/game/divorce-debt.ts`)

A divorce the player cannot pay in full used to forgive the rest: `love.ts` `divorce` moved the cash, sold property for the ex and then let the
shortfall vanish, so the judge's order was a number in a notice. On a stamped life (X6; an unstamped life, a v5.2.0 save and every heir of one
keep the old forgiveness to the byte) the shortfall is a debt of the player's, owed and paid over years, in the open (X24, X35).

| Piece | Rule |
|---|---|
| The record | the edge `player > ex` carries `dv = [owed, 0, year, 1, paid]`, kind 1 (`DEBT_KIND.divorce`). It is the one record of the edge model: no separate store, no new ledger reason. An unpaid `dv` binds the edge at the edge alone (`edgeLocalBound`), so the edge cap and the orphan rule of the edge step keep it. It counts against `EDGE_CAPS.debts` (40) |
| Opening | `openDivorceDebt(g, ex, owed)` is called by `divorce` after the asset loop and before `p.relation = 'exSpouse'`, so the partner is still a `spouse` there: it takes a `spouse`, an `exSpouse` or an `ex` and nothing else. It moves no cash and draws nothing. The notice gains one paragraph, "You still owe {name} {money}." It answers false, with nothing written, for an unstamped life, a dead player, a person who is not in the game or is dead (the live Person is read, not the copy it is given), a sum under a dollar or not a number, an edge that already carries a loan, and a full table of debts. A second order for the same ex joins the first as one debt that starts over |
| Paying | `serveDivorceDebts(g)` is the yearly step of the module `life.debts` (aging seam, `money` phase, order 75, between `wealth` 70 and `familyUse` 80, group `people`). Oldest first, each debt pays `min(still owed, floor(0.2 x cash))` by `serviceDebt` (reason `divorce`, token `debtToken('divorce', year, key)`, `dv[4]` holds the total paid), reading the cash that is left after the debts before it: a payment never takes the cash below 0, k debts take at most `1 - 0.8^k` of it, and a second call in the year pays nothing |
| Saying it | the state row `divorce.pay` (one record per ex, the value the share of the debt paid, a line each time another fifth is paid, or after 4 quiet years) |
| Lapsing | what is left lapses with one `DIVORCE_LAPSE` line and no money moved (no deposit was created, so there is no `writeoff` burn) in the tenth year after the debt began, after that year's payment, or at once when the ex is gone from the game, dead or a pet. A debt down to less than a dollar is let go without a word |
| Death | nothing runs for a dead player. L6 (`payPersonalDebts`) pays what is left out of the estate, before the shares, and closes the edge |
| The loans | E10b's pass inside `society.acts` serves kind 0 only, so the two never touch the same debt |

The ex's shortfall to the player (the richer ex who cannot pay what the judge orders) stays forgiven: an NPC ex has no income path in R4 (X35).
The ex is never dropped while the debt stands: `cleanupPeople` drops only dead exes past 10 and live `ex` rows past 20, and an `exSpouse` is
neither. The step draws nothing from `g.rng`, uses no stream and writes no money outside the ledger.
