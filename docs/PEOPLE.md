# People: the registry freeze note

The note R5 and R6 code against (R4, v5.3.0). It is complete as of R4-S11: the sid and the latent person (sections 1 and 2), the caps
and the rules for writers (3), the inventory of the eight parallel named-person shapes (4), the Met store (5), the edge model (6), the
persona (7), the Person bridge (8) and the contract itself, the signatures, the promises and the figures of the acceptance (9).
`docs/superpowers/plans/2026-10-26-r4-v5.3.0/00-crosscheck.md` section 3.1 is where the names were first fixed; this file is what the
code has. Plain hyphens only: no long dashes anywhere in this file. `test/registry-acceptance.test.ts` checks that it names the eight
shapes, that every line it cites exists and that every name of section 9 is exported by the file it is listed under.

The one idea: a person who is not in `g.people` yet is a **slot** `(kind, place, cohort, ord)`. The text of a slot is the
person's **sid**. The person of a slot is a pure function of the family seed and the slot (`latent`), so nothing is stored for a
stranger. A person the game has met, or is bound to by a debt, a spouse, an heir, a company or a feud, becomes a Met record
(R4-S4). A Met record stores the identity it resolved the day it was first met, so a later edit to a name table never renames
anyone.

## 1. The sid grammar (`src/game/world/sid.ts`, layer 2)

`<kind>.<place>.<cohort>.<ord>`, for example `cls.us.2004.12` or `actor.us.1985.0`.

| Part | Rule |
|---|---|
| kind | one of `SID_KINDS`, a closed table of 18, append-only: R6 and R7 append, nobody renames |
| place | 1 to 12 characters of `[A-Za-z0-9_-]`: a country id, or a firm, school or town id |
| cohort | a whole year, 1850 to 2400 (the range `rosterAt` allows), plain decimal, no leading zero |
| ord | a whole number, 0 to 9999, plain decimal, no leading zero. `rosterAt` numbers the rivals of a cohort from 0 |
| whole text | 40 characters at most (the longest possible is 32), no colon, so `person:<sid>` is a valid ref of 52 characters at most |

- `makeSid(slot)` writes the text and throws a `RangeError` for a slot the grammar refuses. It is for code, never for saved data.
- `parseSid(x)` is total: any value in, the slot or null out. It accepts canonical text only, so `makeSid(parseSid(x)) === x`.
- `isSid(x)` is `parseSid(x) !== null`. `SID_LIMITS` states the numbers once.
- No sid equals `p<n>`, `ks<n>`, `a<n>` or `out.*`. That is why `out` is not a kind: the nepo stand-in ids start with `out.`
  (`pseudoId`, `business/nepo-actions.ts`).
- The strict grammar is for the sids the registry mints and for Met keys. The reader of an account name stays lenient
  (`validSid` in `kernel/person-ref.ts` accepts `s77` and `s-42`), so an old save keeps reading.
- The ids `rosterAt` already makes (`actor.us.1985.3`) are sids. `parseSid` gives back career, country, cohort and index.

### The 18 kinds

| Kind | Meaning | Age band (`KIND_AGE`) |
|---|---|---|
| `actor`, `model`, `music`, `astronaut` | career rivals, the ids of the career kit specs that exist today | 18-30, 15-23, 17-30, 26-42 |
| `author`, `gamedev`, `sport` | career rivals for the specs R6 adds | 22-50, 20-42, 16-32 |
| `cls` | a classmate of the cohort that starts school | 5-7 |
| `tch` | a teacher | 28-60 |
| `cow` | a coworker | 20-60 |
| `boss` | a boss | 30-62 |
| `dat` | a dating candidate | 18-45 |
| `frn` | a friend | 14-60 |
| `kin` | a relative | 20-75 |
| `dir` | a company director | 40-70 |
| `stf` | key staff | 22-61 |
| `exe` | an executive | 35-65 |
| `pol` | a politician | 30-70 |

The list stays 18 in R4. R6 appends the kinds the inventory in section 4 names (a `Manager`, a career outside the seven), with new
rows appended to the golden file in the same commit; existing rows never change.

## 2. The latent person (`src/game/world/latent.ts`, layer 2)

`latent(familySeed, slot, home?)` returns a `LatentPerson` `{ v, sid, gender, born, country, first, last, axes, stats, skin, wealth,
path }`. `familySeed` is `worldSeed(g)`: the life id without its `-g<n>` suffix, so heirs, reloads and the Time Machine see the same
person. Pure: no `g`, no `g.rng`, no generator, no clock; a new plain object every call.

Every number comes from `streamUnit(streamKey(familySeed, 'soc.latent', 0, sid), facet)`. It is a hash and not a stream, so there is
no row in `test/stream-tap.ts` and nothing to carry. `LATENT_V` is 1.

### Facets (`FACET`, append-only)

| Facet | Field | Rule |
|---|---|---|
| 0 | gender | male when the unit is under 0.5 (the rule of `createPerson`) |
| 1 | born | `cohort - age`, age uniform over the band of the kind |
| 2, 3 | first, last | from the pool of the home country; first names filtered by `nameFitsYear(name, born)`, the whole pool when none fits (as `rivals.ts` does) |
| 4 to 8 | axes | ambition, honesty, empathy, risk, steadiness (the order of `AXIS_IDS`), whole numbers scaled onto 5 to 95, uniform |
| 9 to 12 | stats | happiness, health, smarts, looks (the order of `STAT_KEYS`), one draw each through a triangular transform over `STAT_RANGE` (30-100, 50-100, 10-100, 10-100: the ranges `createPerson` rolls with) |
| 13 | skin | the tone itself, an element of the country's `skinTones` list (a tone 1 to 5, weighted by repetition), never an index, because S8 passes it to `createPerson` as `skinTone` |
| 14 | wealth | a band 0 to 9 (deciles, so uniform) |
| 15 | path | a 31 bit whole number. **Reserved**: computed and pinned by the golden file, read by no R4 task (C34). Life's `ageTo` uses `outcomeStream(g, 'life.path', y, sid)` |

Units 16 and up: the name alternates. `nameDraw(familySeed, sid, k, gender, born, country)` with `k = 0` is the latent name (facets 2
and 3); `k = 1..7` use units `16 + 2(k-1)` and one above it (up to 28 and 29). The hyphenated `k = 8` belongs to the name registry
(R4-S6, `world/met-names.ts`). Unit 30 is taken: it sets the start of the walk over the second last names of that surname (the pool
of the home country, from `floor(unit x length)`, each last name once). Units 31 and up are free: a task that takes one records the
number here. `latentUnit(familySeed, sid, n)` reads a unit.

Names are held one to a person (R4-S6): `resolveName(g, lat)` gives the first `k` in 0 to 7 whose `nameDraw` nobody holds (the
player, every Person of `g.people` alive or dead, every Met record and tombstone, and `BRAND_PAIRS`), else the `k = 8` surname. It is
pure and draws nothing, and the Met record stores the answer with its `k`, so a name never changes after the first sight. Of two
people who collide the first promoted keeps the pure name, so the order of promotion is the one thing a name depends on beyond the
seed. `BRAND_PAIRS` is a copied constant of the 7 brand names the pools can spell (4 of them within one pool); the module imports
neither `data/brands` nor `data/locales` (R5 makes them lazy), and `test/world-met-names.test.ts` recomputes the list from
`allBrands()`, so a brand added later fails it until the copy is updated.

The home country is the one given for an entity-placed slot (a firm id as the place), else the place when it is a country id, else
`us`. `fromSeeded(seed, familySeed)` returns a `LatentPerson` for a name the caller already has (a `rosterAt` rival) and never
regenerates the name: first, last, gender, born and country are kept, and the rest comes from the facets of the sid.

### The frozen tables

`KIND_AGE` (the band of each of the 18 kinds, table above), `FACET` and `STAT_RANGE` freeze at the first recording of
`test/fixtures/latent-golden.json`: 162 rows, 18 kinds x 3 families x 3 cohorts, each with the person and the seven name
alternates, recorded once under Node 22 (the CI version) after the lead has read the tables. The test only reads the file, which is
never re-recorded. After R4 a changed value needs `LATENT_V` 2, a `RECORD_REASON` (20 to 200 characters, one line, at least four
words, no long dash), a row in `moved-tests.md` and the lead's OK, because it renames every person nobody has met yet. Name tables
change between releases too; only a never-met slot feels that, because a Met record stores the resolved identity.

## 3. Caps and writer rules

Caps in force or fixed by the plan (the Met caps are `MET_CAPS` in `world/caps.ts`, section 5; the figures are the contract of
cross-check 3.1):

| Cap | Value |
|---|---|
| `MET_CAPS` | records 400, tombstones 200, 5,000 entries scanned, 24 nodes a record, key 40 characters |
| Met worst case | 10,401 nodes: 400 records of 22 nodes (with the reserved `d`, `r`, `j`) + 200 tombstones of 8 + the map root |
| sid | 40 characters, ord 9999, cohort 1850 to 2400 |
| `latent` | 40,000 slots (100 times the 400 cap) give finite whole numbers, a birth year inside the band and a pool name, in well under a second |
| gender share | 4,000 slots measured 0.4873 male; the test accepts 0.45 to 0.55 (a tolerance, UNVERIFIED) |

Writer rules (cross-check X15, X16, C21, C36):

- `Person.data.sid` is written by exactly two places: `materializePerson` (R4-S8) and the heir-spouse rebuild in `continueAsChild`
  (R4-L9), always on a NEW person whose relation is in `SID_RELATIONS`. Never on an existing Person, a child, a stepchild, a
  grandchild, a pet or the former player: the ledger already names `person:<data.sid>` (`cash.ts`), so a sid stamped later renames
  an account. `heirUnsafe` (`kernel/person-ref.ts`) names the unsafe shape.
- Kin sids are `kin.<country>.<year>.<ord>`, minted by Life (R4-L4) with `ord` one above the highest ord of that prefix, at most
  9999. The builder returns null for a year outside 1850 to 2400; it never calls the throwing `makeSid` with saved data.
- Every read is pure: no `g.rng`, no write, no `g.nextId`. A write runs only in an action or in a yearly step that is idempotent
  by a year stamp. Nothing here is read by a played life until the first writers land (L4, L9), and those run only on a life
  stamped by the `social` flag (X6).
- New luck for a person comes from named streams only (`outcomeStream`, `streamKey`, `streamUnit`), never from `g.rng`.

## 4. Inventory: the eight parallel named-person shapes

Eight shapes name a person today, each with its own type, its own creator and its own way of (not) being saved. The registry does
not replace them in R4; R6 D.6 moves them onto sids one at a time. "Kind for R6" is the sid kind that fits the shape; where no kind
of the 18 fits, the name R6 appends is a working name.

| Shape | Type and path:line | Built by | Saved? | Kind for R6 |
|---|---|---|---|---|
| dating `Candidate` | `Candidate`, `love.ts:252` | `makeCandidate`, `love.ts:286`, from `dateCandidate`, the hookup and the memberships; draws `g.rng` (age, looks, stats, names, traits) | only inside the data of the pending popup (`candidate` in `showDateCandidate`) until the player chooses; then `personFromCandidate` makes a Person with `createPerson` | `dat` |
| `strangerName` | `strangerName`, `events/helpers.ts:454`; the result is `{ first, last, gender }` | called at 36 sites in nine files of `events/`; draws `g.rng` (`crime.ts:244` has a second, local function of the same name that returns one string) | no: the name lives in the log line or the popup text, and the person is not added to the contacts | none fits a one-off passer-by; R6 decides (`frn` or `cow` by the scene, or a kind it appends) |
| election opponent | `opponent: string` of the `Campaign` state, `special/politics.ts:583` | `opponentName`, `special/politics.ts:594`, called when the campaign is launched (`:681`); draws `g.rng` | only in the data of the three campaign popups (`trailChoice`, `:777`; read back at `:868`); afterwards it is a log line | `pol` |
| `CareerRival` | `CareerRival`, `special/kit/rivals.ts:32` (the roadmap's `Me.rivals`) | `rosterAt`, derived from the family seed with `seeded()`, never stored; draws no `g.rng`; the id `<career>.<country>.<cohort>.<i>` is already a sid | no: only the career record's memory rows, keyed by the rival id | the career id: `actor`, `model`, `music`, `astronaut` today (`author`, `gamedev`, `sport` for the specs R6 adds); a career outside the seven needs a kind R6 appends |
| `Director` | `Director`, `business/board-state.ts:22` | `makeDirector`, `business/board-state.ts:374`, seeded from the life id, the asset and a key; draws no `g.rng` | yes, in the board state `members` of the company (names stored, read back by `readDirector`) | `dir` |
| `KeyStaff` | `KeyStaff`, `business/state.ts:24` | the hire script `business.hire` in `business/staff.ts`, from a shortlist built by `candidatesFor` (a local `Candidate` type, age 22 to 61); draws `g.rng` | yes, in the company's `staff` list | `stf` |
| `Manager` | `Manager`, `business/state.ts:282` | `managerCandidate` and `installManager` in `business/career.ts`, `interimCeo` in `business/conglomerate-actions.ts`; draws `g.rng`. A relative who is CEO links to a Person through `personId` | yes, as the company's (or group's) `manager` | `exe` is the nearest of the 18; R6 appends `mgr` if a hired CEO must be told apart from a group executive |
| nepo `Outsider` | `Outsider`, `business/nepo-actions.ts:136` | `rollOutsider`, `business/nepo-actions.ts:171`, for the ask popups; draws `g.rng`. The stand-in id is `pseudoId` (`out.<First>.<Last>.<kin>.<age>.<smarts>`) | only inside a pending ask popup, until hired; `materialize` then makes a coworker Person with `data.nepoSeed` | `kin` (an in-law or a cousin); the `out.` stand-in id stays outside the grammar |

Counted from the code: six of the eight draw `g.rng` when they are created, so none of them can move onto a pure
`latent` without moving a seeded life. That is why R4 ships the registry dark (no writer in a played life) and R6 D.6 moves them
with its own goldens.

## 5. The Met store (`src/game/world/met.ts`, layer 2)

`g.world.met` is where a person the game has met, or is bound to, lives when the person is not (or no longer) in `g.people`. A plain
object keyed by sid, with no `v` and no `y` (the version of the slice travels in `sv`). It is absent until a writer runs: nothing in
a played life calls `writeMet` in R4 except through the yearly sweep, which does nothing for a life with no shard, so an old save and
a life that never meets anyone have no `met` key. The writers are the registry's own behaviour (`world/met-ops.ts`, R4-S7, below) and
its first callers are Life's (R4-L4, R4-L9); they run only on a life stamped by the `social` flag (X6).

```ts
export interface MetRecord { f: string; l: string; g: 0 | 1; b: number; c: string; k: number; a: AxisTuple; y: number; s: number; w: number; fl: number; gr: number; ob: number; d?: number; r?: string; j?: string }
export type Tomb = readonly [y: number, gr: number, ob: number, fl: number, first: string, last: string, gb: number]
export type MetShard = { [key: string]: MetRecord | Tomb }
```

| Field | Meaning | Range |
|---|---|---|
| `f`, `l` | first and last name, resolved the day the person was first met | 1 to 24 and 1 to 32 characters, no control characters, trimmed |
| `g` | gender | 0 or 1 (1 male) |
| `b` | born | 1700 to 100000. Wider than the other years on purpose: a person is born before the life starts, so an elder of a 1900 life, or a latent person of cohort 1850 aged 90 (born 1760), comes back as stored and not cut |
| `c` | the person's own country | 1 to 12 of `[A-Za-z0-9_-]` |
| `k` | which name was drawn | 0 to 8 (0 the latent name, 1 to 7 the stored alternates, 8 the hyphenated surname; S6 writes it) |
| `a` | the five axes, in `AXIS_IDS` order | exactly five whole numbers, 0 to 100 |
| `y`, `s`, `d` | first met, last seen, died | 1900 to 100000, because a life starts no earlier than `HISTORY_START` (1900) |
| `w` | role weight | 0 to 9 |
| `fl` | stake flags | 0 to 63: 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will |
| `gr`, `ob` | grudge, obligation | 0 to 100 and -100 to 100 |
| `r`, `j` | role tag, job or firm ref | reserved for R6 (X17): `[a-z][a-z0-9.-]{0,15}` and a valid ref of 52 characters at most. Sanitized, written by nobody in R4 |

A tombstone is what is left of a person who is only owed, remembered or feuded with: `[year, grudge, obligation, flags, first, last,
gb]`. `gb = born * 2 + gender` (`packGb`, `unpackGb`), saved state that `test/world-met.test.ts` pins, so waking a tombstone gives
the born year and the gender back; its range is 3400 to 200001. A key is a sid of the strict grammar, or a legacy person id
`p<digits>` when the value is a tombstone (a debt outlives its Person). A record uses 22 of its 24 nodes (`MET_CAPS.nodes`).

| Cap (`MET_CAPS`) | Value |
|---|---|
| `records` | 400 |
| `tombs` | 200 |
| `scan` | 5,000 entries looked at when a shard is read |
| `nodes` | 24 in one record |
| `key` | 40 characters |
| worst case | 10,401 nodes (400 x 22 + 200 x 8 + the map root), about 90,000 characters |

What the code gives (R4-S4; behaviour is S6 and S7):

- `normalizeMet(raw)` is total and bounded; a valid shard comes back as itself. It cuts a field into its range, drops what cannot be
  read, drops unknown keys and a record of more than 24 nodes, keeps 400 records and 200 tombstones (the ones held on the entry itself
  first: a flag, an obligation, a grudge of 20 or more; then the freshest; then by key) and returns the keys in plain code-unit order
  (`a < b`, never `localeCompare`, because the entity codec tests `prev < k`).
- `readMet(g)`, `metRecord(g, key)`, `metTomb(g, key)`, `isTomb(x)` and `metKinds(g)` (records per sid kind, every kind present, 0 when
  none; R6 counts career peers with it) are pure.
- `writeMet(g, next)` is the one writer: it replaces the root only when something changed, keeps every unchanged entry by identity,
  writes nothing for an absent shard and an empty `next`, and seals what it stores (frozen). S7's `touchMet`, `markMet`, `evictMet`
  and `tombstoneMet` are built on it.
- `metProblems(raw, people?)` names every way a stored shard is wrong; with `g.people` it also names a living Person whose
  `data.sid` is a sid of the strict grammar and has no record (a lenient text such as `s77` needs none), and a sid on a child,
  stepchild or grandchild (`heirUnsafe`). `worldProblems` prints each as a "met: ..." line.
- `worldBudget` counts records and tombstones against `MET_CAPS`. `met` is in the keep-last class of the over-cap order.

### Touch, mark, evict, tombstone, sweep (`src/game/world/met-ops.ts`, R4-S7)

How a person becomes Met, what keeps a record, how it is let go. All of it is action or yearly-step code: it draws nothing, reads
no clock and takes no id, and every write hands the next shard to `writeMet`, which replaces the root.

| Call | What it does |
|---|---|
| `touchMet(g, key, patch?, home?, identity?)` | Makes the record of a sid, or stamps `s` and lays `patch` over the one it has. A new record comes from `identity` when one is given (the face the legacy code already drew, from `fromSeeded`; stored exactly, `k = 0`, its `sid` must be `key`), else from `latent` and `resolveName`; `home` is the country of an entity-placed slot. A tombstone wakes with its stored names, gender, birth year and stake; the axes and country come back from `latent`. A key that is no sid of the strict grammar returns false and writes nothing (a legacy person id has a tombstone only) |
| `markMet(g, key, stake)` | SET semantics on `fl`, `gr`, `ob` of a record or a tombstone: a bit can be cleared when a link ends. It does not stamp the record |
| `evictMet(g, key, why)` | `why` is `idle`, `cap` or `gone` (the reason is the caller's; the rules are the same). Returns `dropped`, `tomb`, `kept` or `absent` |
| `tombstoneMet(g, key, stake?)` | Makes the tombstone of a key whatever holds it, setting the stake given. A legacy id `p<digits>` is allowed, so a debt outlives its Person; for a key with no entry the names are read from the Person still in `g.people`, so call it before the Person is removed. False for a full list of held tombstones: the cap never drops an obligation |
| `sweepMet(g)` | The yearly clean-up, called by `lodSweep` inside the `lod.y` stamp. A life with no shard writes nothing and returns 0 |
| `isProtected(g, key)`, `salienceOf(g, key)` | Pure reads |
| `registerProtector(id, fn)`, `registerSalience(id, fn)` | The two hooks the Edges track fills at module load: `edges.bound` and `edges.salience` of `world/edge-bound.ts` (R4-E14, X13; `docs/SOCIAL.md` section 15) |

Stake bits (`STAKE`, `MetRecord.fl`): 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will. Who writes what (X14): Life writes only
bits 2 and 4 with `markMet` (L4); Edges write none and protect through `registerProtector`; by that rule `gr` and `ob` are written only
through `tombstoneMet` and by synthetic tests (`markMet` can set them, and the callers leave them alone: the Edges own obligation and
grudge on `Edge.o`, `Edge.s`, `Edge.dv`).

What holds a key (`isProtected`): a stake on the entry itself (a flag, an obligation of either sign, a grudge of 20 or more), a Person
of `g.people` with that `personKey`, a holder in the holdings table, or a registered protector. A protector returns `personKey` values
(a legacy person is protected by its id), runs in id order, and one that throws, or fails half way through its keys, protects nothing.
A registered salience returns the edge part only, `f + s + abs(o)` of the edge person>player; Met adds the role weight `w x 10`
(`MET_RULES.roleRank`), so a weight is never counted twice. A salience that throws or answers no finite number ranks 0 and one is cut to
0..1,000,000. The same id with another function throws, for both.

Letting go:

- A record held by a Person, a holder or a protector is `kept` as it is, never a tombstone. A record held only by its own stake becomes a
  tombstone `[last seen, gr, ob, fl, first, last, gb]` that keeps the obligation. A plain record is dropped. The account `person:<key>` is
  folded into `pool:hh:<the person's own country>` (not the player's): a relabel, the sum of the books never changes and no flow is booked.
- The cap on records: the newcomer is ranked with the 400 held by `[protected, salience, recency, key]` (higher salience, newer, smaller key
  rank higher; a protected entry ranks above all others). The lowest ranked unprotected one goes. If that is the newcomer, `touchMet`
  returns false and nothing changes; if every record is held it returns false too. The rank never reads a name, so the 400 that stay depend
  only on the set of names touched, in any order. (The names of two colliding people can depend on the order: of a colliding pair the first
  promoted keeps the pure name, S6.)
- A tombstone is let go only when nothing holds it (no flag, obligation 0, grudge under 20, no Person, no holder, no protector) and it is
  20 years old (`MET_RULES.tombYears`, counted from the year it carries). The cap on tombstones makes room by dropping such a one, the
  oldest first; if there is none, a record that would need the room stays a record.
- `sweepMet`: first the tombstones that may go, then every record not seen for more than 5 full years (`s < year - 5`, the rule of
  `lodSweep`) is let go as `evictMet` does. It is a fixed point of the year, and it returns how many records left the list (dropped or
  turned into tombstones), which `lodSweep` adds to `lod.demoted`.

## 6. The edge model and its caps (R4-E6a)

How people feel about each other is an **edge** `first end > second end` in the keyed map `g.world.edges` (R4-E6a, pure code in
`world/edges.ts` and `world/edge-memory.ts`; nothing is stored until R4-E6b registers the shard, and a life is stamped by the
`social` flag before any of it runs, X6). The full model, the normalizer rules and the 40 memory kinds are in `docs/SOCIAL.md`; this
section is the freeze note for R5 and R6 (cross-check section 3.1, "Edge model, memory and stamp").

- An edge key is `<ref>><ref>`, for example `person:p12>person:p3` or `person:cls.us.2004.12>person:you`: the first end is named by
  `personEntity(p)` (a person with a sid is found under `person:<sid>`), the second is the ego. At most 140 characters, both ends pass
  `parseRef`, keys ascend by code unit, and there is no `v` key.
- An edge holds trust `t`, affection `f` (the mirror of `Person.relationship`), respect `r`, resentment `s`, obligation `o`, since `y`
  and last touched `l`, and optionally memories `m`, the dialogue store `n` and `d` (reserved for R5, written by nobody in R4, X27),
  a feud `q`, a debt `dv`, a favor stamp `c` and a link kind `k`. `Edge.d` and `Edge.n` are the store; `p.data.said` is not created (C22).
- Caps (`EDGE_CAPS`, `world/caps.ts`): 1,200 edges, 8 memories an edge and 4,000 in all, `n` and `d` on 120 edges, 12 feuds, 40 debts,
  40 secrets of 6 holders. Over a cap the normalizer cuts by salience and an edge that is bound goes last. The worst case is 19,409 nodes.
- Two lists are append-only and frozen at the merge of E6a: `MEMORY_KINDS` (the 40 ids; R6 appends after the 40th and U10 adds a
  phrase in the same commit) and `LINK_KINDS` (R6 appends). `MEMORY_FX` is a frozen table the lead reads before the merge (section 3.3).
- A strife edge written by Life (C12) sets `s` always and a feud rung `q` only while `liveFeuds(g)` is under 12; the normalizer would
  strip the surplus rung silently.
- Every read is pure: no `g.rng`, no write, no `g.world` created. A writer replaces the shard root and never edits it in place.

## 7. The persona (`world/axes.ts`, `world/persona-me.ts`, `npc-state.ts`; R4-S2, S9, S10)

Five axes describe a person in numbers: `AXIS_IDS` is `ambition, honesty, empathy, risk, steadiness`, always in that order, which is the
order of a stored tuple (`MetRecord.a`). They are whole numbers 0 to 100 with 50 neutral. The one exception is the player's ambition,
`ambitionOf(g)`, which has two decimals.

- `axesFromTraits(traits)` turns the words of a person into axes: each word is a delta around 50 (`TRAIT_AXES`: the 30 words of `TRAITS`
  and `spoiled`), and a person is 50 plus the deltas of their words, cut to 5..95. `labelsFromAxes(a, n = 2)` is the way back, the
  words a set of axes wears, so a person made from a slot has words that every old reader already understands (`temper`, `driveOf`,
  `integrityFor`, `styleFor`). `axesFromStaff(traitId)` does the same for the 13 staff traits (`STAFF_AXES`).
- `VOICES` are the six narrator voices `warm, blunt, dry, anxious, grand, sly`. Each has a prototype in axis space
  (`VOICE_PROTOTYPES`) and `voiceOf(axes)` returns the nearest. R5's composer picks a voice with it.
- `TRAIT_SETS`, `DRIVE_TRAITS` and `INTEGRITY_TRAITS` are the tables of the four readers that used to keep their own (will feuds, the
  nepo model, succession and the nepo job), moved here word for word. The readers keep their signatures (they take no `g`).
  `axesOfPerson(g, p)` in `npc-state.ts` is the reader that has the game: the Met axes for a person with a record, else the axes of the
  words with the person's `NpcLife` ambition. It is the one name the Edges track calls.
- The player has an inferred persona. `inferAxes(g)` reads honesty and empathy from karma and the lifetime counts of crimes, thefts,
  cheating, murders, fights, insults and sabotage (lowering them) and of donating and saving lives (raising them); risk from craziness,
  lottery tickets and fights; steadiness from discipline, willpower and the absence of craziness. Every count is cut to a cap first, so a
  counter of 1e9 moves nothing past its cap. `personaOf(g)` is `inferAxes` plus the nudges, cut to 0..100.
- `nudgePersona(g, axis, by, why)` leans one axis a little and answers what it added (0 when nothing changed). `by` is cut to a whole
  number within +-`NUDGE_STEP` (3); the axis is one of `honesty, empathy, risk, steadiness` (ambition is `ambitionOf`, never a nudge);
  `why` is a short lower-case word; a second call for the same (axis, reason, year) is refused; all the nudges of an axis add up to
  `NUDGE_MAX` (15) at most, either way; the record keeps `AT_MAX` (40) year stamps. The record is `flags['persona.me']`, personal and
  owner-stamped (an heir starts clean, another life's record reads as the defaults), created on the first nudge, and removed when it is
  empty. A life that never nudged has no `persona.me` key.
- `effort.you` stays where it is: the ambition axis reads `ambitionOf`. `Manager.integrity` and `KeyStaff.trait` stay stored; R5 names the
  owner of moving them onto axes.
- Nothing in a played life calls `inferAxes`, `personaOf`, `nudgePersona` or `axesFromStaff` in R4 (X18). The player-facing half of the
  persona (inferred feedback, narrator pools, guilt costs, how NPCs read the player) is R5's, and R5's composer is their first caller.

## 8. The Person bridge (`src/game/materialize.ts`, R4-S8)

`materializePerson(g, sid, opts)` makes the Person of a sid, or returns the one that already holds it. It touches the Met store
(`touchMet`: the record's own identity when there is one, `latent` and the name registry on a first sight, a tombstone wakes with its
stored names) and builds the Person with `createPerson`, given every field, so `g.rng` does not move and `g.nextId` moves by one (for
a new Person only). A field the caller leaves out comes from a fixed default (the occupation by age, relationship 50, money 0, not
living with the player); the stats and the skin tone come from `latent`, the traits from the record's axes, the name, gender, birth
year and country from the record. It returns null for a text that is not a sid of the strict grammar, a relation outside
`SID_RELATIONS`, or a touch the registry refuses (every held record is protected and the store is full).

- `SID_RELATIONS` is every relation except `child`, `stepchild`, `grandchild` and `pet`. A child, a stepchild or a grandchild is what
  the hand-over spreads into the heir, so a sid on one would rename the heir's account; a pet has no account of a stranger.
  `heirUnsafe(p)` (defined in `kernel/person-ref.ts`, re-exported here) is the test for that shape.
- `personOfSid(g, sid)` is the Person whose `personKey` is the sid, or undefined. Pure.
- The opening `money` is the literal that `docs/LEDGER.md` rule 6 exempts: it is the balance of a new Person and is never booked.
- `data.sid` has two writers in the whole game, this function and the heir-spouse rebuild of `continueAsChild` (R4-L9, in
  `modules/heirs.ts`), and `test/registry-money-scan.test.ts` scans all of `src/game` for a third.

## 9. The contract: what R5 and R6 may rely on (R4-S11)

### 9.1 Signatures

```ts
// kernel/person-ref.ts (layer 0)
validSid(x: unknown): string | null          // text that parses as 'person:' + x; 's77', 's9' and 's-42' stay valid
personSid(p: Pick<Person, 'data'>): string | null           // validSid(p.data.sid): the one read of data.sid outside the kernel file
personKey(p: Pick<Person, 'id' | 'data'>): string          // personSid(p) ?? p.id
personEntity(p: Pick<Person, 'id' | 'data'>): EntityRef     // 'person:' + personKey(p), or 'pool:other' for an id that is no name
heirUnsafe(p: Pick<Person, 'relation' | 'data'>): boolean   // a valid sid on a child, stepchild or grandchild
// world/sid.ts (layer 2)
SID_KINDS; SidKind; Slot { kind; place; cohort; ord }; SID_LIMITS
makeSid(slot: Slot): string      // throws RangeError, for code only
parseSid(x: unknown): Slot | null; isSid(x: unknown): x is string
// world/latent.ts
LATENT_V = 1; FACET; KIND_AGE; STAT_RANGE; LatentPerson; SeededIdentity
latent(familySeed: string, slot: Slot, home?: string): LatentPerson
fromSeeded(seed: SeededIdentity, familySeed: string): LatentPerson
latentUnit(familySeed: string, sid: string, n: number): number
nameDraw(familySeed, sid, k, gender, born, country): { first: string; last: string }
// world/met.ts, world/caps.ts
MetRecord; Tomb; MetShard; MET_LIMITS; MET_CAPS
normalizeMet(raw: unknown): MetShard; readMet(g): Readonly<MetShard>; metRecord(g, key); metTomb(g, key); isTomb(x)
metKinds(g): Readonly<Record<string, number>>; metProblems(raw, people?): string[]; writeMet(g, next): void
packGb(born, g): number; unpackGb(gb): { born; g }
// world/met-names.ts
takenNames(g): Set<string>; nameFree(g, first, last): boolean; resolveName(g, lat): { first; last; k }; BRAND_PAIRS
// world/met-ops.ts
STAKE; MET_RULES; MetPatch
touchMet(g, key, patch?, home?, identity?): boolean       markMet(g, key, stake): boolean
evictMet(g, key, why): 'dropped' | 'tomb' | 'kept' | 'absent'      tombstoneMet(g, key, stake?): boolean
sweepMet(g): number          isProtected(g, key): boolean          salienceOf(g, key): number
registerProtector(id, fn: (g) => Iterable<string>): void           registerSalience(id, fn: (g, key) => number): void
// materialize.ts (layer 3)
MaterializeOpts; SID_RELATIONS; heirUnsafe
materializePerson(g, sid, opts): Person | null          personOfSid(g, sid): Person | undefined
// world/axes.ts, npc-state.ts
AXIS_IDS; Axes; AxisTuple; TRAIT_AXES; TRAIT_SETS; STAFF_AXES; VOICES; VOICE_PROTOTYPES; DRIVE_TRAITS; INTEGRITY_TRAITS
axesFromTraits(traits): Axes; labelsFromAxes(a, n = 2): string[]; axesFromStaff(traitId): Axes; voiceOf(a: Axes): VoiceId
axesOfPerson(g: Pick<GameState, 'world'>, p: Person): Axes
// world/persona-me.ts
PERSONA_KEY = 'persona.me'; NUDGE_MAX = 15; NUDGE_STEP = 3; NUDGE_SLOTS = 4; AT_MAX = 40; NudgeAxis; PersonaMe
inferAxes(g): Axes; personaOf(g): Axes; readPersona(g): PersonaMe; writePersona(g, p): void
nudgePersona(g, axis: NudgeAxis, by: number, why: string): number
```

### 9.2 Rules for writers

1. **Touch only in an action or in a yearly step that is idempotent by a year stamp, never in a read.** The writers are `touchMet`,
   `markMet`, `evictMet`, `tombstoneMet`, `sweepMet` (called by `lodSweep` inside its year stamp), `writeMet`, `materializePerson`,
   `nudgePersona` and `writePersona`. Every other name of section 9.1 is a read: pure on a deep-frozen state, with no `g.rng`, no
   write and no `g.nextId`.
2. **A sid goes on new persons only.** Never on an existing Person, a child, a stepchild, a grandchild, a pet or the former player. The
   two writers are `materializePerson` and L9's heir-spouse rebuild. Kin sids are `kin.<country>.<year>.<ord>`, minted by Life with
   the builder returning null outside 1850 to 2400; no code calls the throwing `makeSid` with saved data.
3. **A protector registers at module load**, with `registerProtector(id, fn)`; the same id with another function throws; protectors run
   in id order, return `personKey` values (a legacy person is protected by its id), and one that throws protects nothing. A salience
   returns the edge part only (`f + s + abs(o)` of the edge person>player): Met adds the role weight itself.
4. **Stake bits** (`fl`): 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will. Life writes bits 2 and 4 with `markMet`, and only for a
   person a living or recently dead Person links (`kinProblems` names a kin record that carries either bit with no link); Edges write none and
   protect through a protector. `gr` and `ob` are written by `tombstoneMet` and by synthetic tests only.
5. **New luck comes from named streams only** (`outcomeStream`, `streamKey`, `streamUnit`). The registry draws from no stream: `latent`
   is a hash of the family seed and the sid. A new `stream(` tag gets its rows in `test/stream-tap.ts` and
   `test/stream-isolation.test.ts`.
6. **Every dollar goes through the ledger.** The registry books none; the one money literal is the opening balance that
   `materializePerson` hands to `createPerson`. A person who leaves the record list has the account `person:<key>` folded into the
   household pool of the person's own country, which is a relabel and books nothing.
7. **Every new saved field is optional, validated by its own reader, and bounded.** A writer replaces the shard root and never edits it
   in place. The new behaviour runs only on a life the `social` flag stamped (X6); nothing in the registry reads a flag.

### 9.3 What R5 and R6 may rely on

- The sid grammar, `SID_KINDS` (append-only: R6 and R7 append, nobody renames), the facet numbers and `KIND_AGE` (frozen by
  `test/fixtures/latent-golden.json`), `AXIS_IDS` and `VOICES`. A changed value needs a `RECORD_REASON`, a row in `moved-tests.md` and
  the lead's OK.
- The same name for the same person: a Met record stores the identity it resolved the day it was first met, a tombstone keeps the
  names, and a record that was dropped comes back through the name registry with the same name while nobody has taken it. The same
  seed gives the same Met keys and names after a replay, a clone, a reload, a hand-over and a Time Machine fork (a fork may differ only
  in people met after its snapshot).
- A record held by a stake, an obligation, a grudge of 20 or more, a Person, a holder or a protector is never lost, by idleness or by
  the cap: one held by a Person, a holder or a protector stays a record, and one held only by its own stake becomes a tombstone that
  keeps what is owed. A tombstone goes only when nothing holds it and it is 20 years old, and the cap on tombstones never drops an
  obligation.
- The shard is at most 10,401 nodes (400 records of 22, 200 tombstones of 8 and the map root), whatever is touched: 40,000 touches or a
  hostile save of 40,000 entries leave the same bounded shard (`met-caps`, a row of `test/ceiling-list.json`). The persona record is at
  most about 50 nodes and its nudges stay within 15 (`persona-nudge`).
- An old save has no `met` key and no `persona.me` key, and a life that no writer touched never gets one. A save from v5.3.0 on may
  hold the shard, and it loads and saves again byte for byte.
- `r` (a role tag) and `j` (a job or firm ref) of a record are reserved for R6, sanitized and written by nobody in R4. Facet 15 (`path`)
  is reserved. `LinkKind`, `MEMORY_KINDS` and `SID_KINDS` are append-only.

### 9.4 What R5 and R6 may not rely on

- A live writer. Nothing in a played life calls the registry in R4 until Life's L4 (NPC weddings and babies) and L9 (the heir's spouse),
  and those run only on a stamped life. Classmates, coworkers, the dating pool, strangers, directors, key staff, managers and the nepo
  outsider wait for R6 D.6. The banker met in 2031 who is the minister in 2040 needs those writers and R7's politics slots; R4 delivers
  and proves the mechanism (the same name after eviction), with kin and the heir's spouse as the first users.
- Name order. Of two people who collide the first promoted keeps the pure name, so the order of promotion is the one thing a name
  depends on beyond the seed. A career rival of `rosterAt` and a Met person may share a name until R6 D.6. `BRAND_PAIRS` is a copy of
  data (7 names today): a brand added later fails `test/world-met-names.test.ts` until the copy is updated.
- The persona. It is unwired. `personaOf`, `nudgePersona`, `inferAxes` and `axesFromStaff` have no caller in R4, and the numbers of the
  inference are tuned to read as 50 for a mean life, not to be right.
- `Person.relationship`, `Manager.integrity` and `KeyStaff.trait` still hold their numbers; the axes do not replace them in R4.

### 9.5 How it is proven (R4-S11)

- `test/registry-acceptance.test.ts`: a 120-year probe of a life found with `findSeed` (born 1930, alive at 50), played one year at a
  time through two hand-overs, with a scripted caller that touches three slots a year, puts and clears stakes, leaves tombstones, makes
  a person every ten years, nudges the persona and floods the store with 450 people twice. After every year the world has no problem,
  the books hold, the Met store is inside its caps, every number is finite, no Person with a sid is a child, every stake and debt the
  caller left is still in the store, the persona is inside its bounds and the world is inside its budget. Then the same names for the
  same seed (a rerun, a clone and a JSON reload of year 60, an heir, a Time Machine fork), the banker mechanism through a played life
  from 1990, every old fixture by the rule of its release, twelve hostile mets played through the whole game, pure reads on a
  deep-frozen state, and this file.
- `test/registry-money-scan.test.ts`: the registry files book no dollar and draw no luck, call no stream with an unlisted tag, and
  `Person.data.sid` is written by `materialize.ts` and `modules/heirs.ts` only.
- `test/ceiling-list.json` and `test/ceiling-kit.ts`: `met-caps` (touches and tombstones at 100 times the caps, a hostile shard of
  40,000 entries, the sweep) and `persona-nudge` (10,000 nudges, counters of 1e9).
