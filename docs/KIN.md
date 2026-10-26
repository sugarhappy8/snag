# Kin: a relative's spouse and children

The note for the kin links of R4 (v5.3.0). A sibling, a child or a parent of the player marries and has babies. Before R4 that was
three fields on the relative (`married`, `spouseName`, `kids`) and a log line. R4 adds the people behind those fields as Met records
(`docs/PEOPLE.md`, section 5), so their faces never change, and links the relative to them. This file is the saved shape of the
links, the caps, the pure readers and the problems list (R4-L3, `src/game/world/kin.ts`). Later tasks add their sections: the
writers (R4-L4), the estate (R4-L5), the hand-over (R4-L9) and the known limits (R4-L12). Plain hyphens only: no long dashes here.

## 1. The rules

- **New behaviour runs only on a stamped life** (X6). A life made before the `social` flag, and every heir of one, keeps `married`,
  `spouseName` and `kids` as they were, gets no link and no Met record. This task writes nothing at all: it is the shape and the
  readers, and a played life does not call them yet.
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

One line each, prefixed `kin: ` by `worldProblems`. The design's invariant 10 is "one spouse, mutual"; this task checks the link half
and R4-L4 adds the pair and kin edges once edges exist.

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
