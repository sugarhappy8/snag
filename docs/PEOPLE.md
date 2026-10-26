# People: the registry freeze note

The note R5 and R6 code against (R4, v5.3.0). It starts here with the sid, the latent person and the inventory of the eight
parallel named-person shapes (R4-S3). R4-S4 and R4-S7 add the Met store and promotion and demotion, R4-E6a adds the edge model,
and R4-S11 completes it. Until a section below says otherwise, `docs/superpowers/plans/2026-10-26-r4-v5.3.0/00-crosscheck.md`
section 3.1 is the authority for every name and signature. Plain hyphens only: no long dashes anywhere in this file.

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
(R4-S6). Units 30 and up are free: a task that takes one records the number here. `latentUnit(familySeed, sid, n)` reads a unit.

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

Caps in force or fixed by the plan (the Met store is R4-S4's; the figures are the contract of cross-check 3.1):

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
| dating `Candidate` | `Candidate`, `love.ts:251` | `makeCandidate`, `love.ts:285`, from `dateCandidate`, the hookup and the memberships; draws `g.rng` (age, looks, stats, names, traits) | only inside the data of the pending popup (`candidate` in `showDateCandidate`) until the player chooses; then `personFromCandidate` makes a Person with `createPerson` | `dat` |
| `strangerName` | `strangerName`, `events/helpers.ts:454`; the result is `{ first, last, gender }` | called at 36 sites in nine files of `events/`; draws `g.rng` (`crime.ts:243` has a second, local function of the same name that returns one string) | no: the name lives in the log line or the popup text, and the person is not added to the contacts | none fits a one-off passer-by; R6 decides (`frn` or `cow` by the scene, or a kind it appends) |
| election opponent | `opponent: string` of the `Campaign` state, `special/politics.ts:583` | `opponentName`, `special/politics.ts:594`, called when the campaign is launched (`:681`); draws `g.rng` | only in the data of the three campaign popups (`trailChoice`, `:777`; read back at `:868`); afterwards it is a log line | `pol` |
| `CareerRival` | `CareerRival`, `special/kit/rivals.ts:32` (the roadmap's `Me.rivals`) | `rosterAt`, derived from the family seed with `seeded()`, never stored; draws no `g.rng`; the id `<career>.<country>.<cohort>.<i>` is already a sid | no: only the career record's memory rows, keyed by the rival id | the career id: `actor`, `model`, `music`, `astronaut` today (`author`, `gamedev`, `sport` for the specs R6 adds); a career outside the seven needs a kind R6 appends |
| `Director` | `Director`, `business/board-state.ts:22` | `makeDirector`, `business/board-state.ts:374`, seeded from the life id, the asset and a key; draws no `g.rng` | yes, in the board state `members` of the company (names stored, read back by `readDirector`) | `dir` |
| `KeyStaff` | `KeyStaff`, `business/state.ts:24` | the hire script `business.hire` in `business/staff.ts`, from a shortlist built by `candidatesFor` (a local `Candidate` type, age 22 to 61); draws `g.rng` | yes, in the company's `staff` list | `stf` |
| `Manager` | `Manager`, `business/state.ts:282` | `managerCandidate` and `installManager` in `business/career.ts`, `interimCeo` in `business/conglomerate-actions.ts`; draws `g.rng`. A relative who is CEO links to a Person through `personId` | yes, as the company's (or group's) `manager` | `exe` is the nearest of the 18; R6 appends `mgr` if a hired CEO must be told apart from a group executive |
| nepo `Outsider` | `Outsider`, `business/nepo-actions.ts:135` | `rollOutsider`, `business/nepo-actions.ts:170`, for the ask popups; draws `g.rng`. The stand-in id is `pseudoId` (`out.<First>.<Last>.<kin>.<age>.<smarts>`) | only inside a pending ask popup, until hired; `materialize` then makes a coworker Person with `data.nepoSeed` | `kin` (an in-law or a cousin); the `out.` stand-in id stays outside the grammar |

Counted from the code: six of the eight draw `g.rng` when they are created, so none of them can move onto a pure
`latent` without moving a seeded life. That is why R4 ships the registry dark (no writer in a played life) and R6 D.6 moves them
with its own goldens.

## 5. What the next tasks add here

- R4-S4: the Met shard `g.world.met`, `MetRecord`, `Tomb`, `MET_CAPS` in `world/caps.ts`, the readers and the one writer.
- R4-S7: `touchMet`, `markMet`, `evictMet`, `tombstoneMet`, `sweepMet`, the protector and salience contract.
- R4-E6a: the edge model (`Edge`, `EdgeKey`, `MEMORY_KINDS`).
- R4-S11: completes this note (the acceptance figures, the scans, the closing caps).
