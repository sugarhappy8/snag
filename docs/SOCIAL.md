# Social: edges, memories and acts

How people feel about each other, and what they remember, as the engine keeps it (R4, v5.3.0). This note starts with the
**edge model** (R4-E6a): the record, the 40 memory kinds, the caps and the rules of the normalizer. R4-E6b adds the writer, the
stamp and the slice; R4-E7 the mirror and the yearly step (sections 9 and 10); R4-E8 the memory writers, the odds terms and the heir copy (section 11); the later tasks of the Edges and acts track add the acts. Until a
section below says otherwise, `docs/superpowers/plans/2026-10-26-r4-v5.3.0/00-crosscheck.md` section 3.1 is the authority for every
name and signature. Plain hyphens only: no long dashes anywhere in this file.

Sections 1 to 5 are pure code: `world/edges.ts` and `world/edge-memory.ts` are in layer 2 (`world/`) and draw no number, read no clock
and write nothing. Sections 6 to 8 (R4-E6b) are the writer, the stamp and the slice: `world/edge-write.ts`, `world/social.ts` and
`world/edges-slice.ts`. R4-E7 is their first caller: it stamps new lives, mirrors the relationship numbers into the edges and steps them once a year.

## 1. The edge

An edge is `first end > second end` and says what the first end feels about the second. In R4 the first end is a person and the
second is the ego, the player. `Person.relationship` stays the authority for affection through R4 (X22); the edge mirrors it.

| Field | Meaning | Range |
|---|---|---|
| `t` | trust | 0 to 100 |
| `f` | affection, equal to `Person.relationship` for the ego's people (E7 makes that true, `edgeProblems` checks it) | 0 to 100 |
| `r` | respect | 0 to 100 |
| `s` | resentment | 0 to 100 |
| `o` | obligation, positive when the first end owes the second | -100 to 100 |
| `y`, `l` | since, last touched (years) | whole years, 1900 to 100000 |
| `m` | memories `kind.year.weight.by`, oldest first | at most 8 |
| `n`, `d` | callback keys told and topic ids said: the dialogue store, reserved for R5 and written by nobody in R4 (X27) | 6 and 8 entries, on 120 edges at most |
| `q` | the feud `[rung, since, cause]`; rung 1 cold, 2 gossip, 3 sabotage, 4 legal | rung 1 to 4, cause 0 to 255 |
| `dv` | the debt `[owed, ratePct, since, kind, paid]`, dollars the first end owes the second; kind 0 a loan, 1 a divorce | rate 0 to 60, money 0 to a trillion, kind 0 to 9 |
| `c` | the year of the last favor call-in | whole year |
| `k` | the link: `kin`, `rival`, `company`, `staff`, `pair` (append-only; an unknown value is dropped) | one of the five |

The numbers `t`, `f`, `r`, `s` and `o` may be fractions inside their range (the heir copy scales by exactly 0.5 and 0.6). The
years `y`, `l`, `c` and the years inside `m`, `q`, `dv` are whole numbers.

**The map.** `g.world.edges` is one keyed map from `'person:p12>person:p3'` to the edge. Keys ascend by code unit, start with a
letter, hold two refs that pass `parseRef` (`kernel/ids.ts`) joined by one `>`, and are 140 characters at most. There is no `v` key
(the version is in the slice table) and `__proto__` is no key. A person's end is `personEntity(p)` (`kernel/person-ref.ts`), so a
person with a sid is found under `person:<sid>`. A staff end is `staff:<ks id>` and a manager end `mgr:<asset id>` (E13).

**Secrets** live in the same map under `secret:<n>` (a whole number of nine digits at most, no leading zero). A secret is
`{ a, k, v, h, y, p? }`: `a` the ref it is about, `k` `affair` or `debt`, `v` the severity 1 to 5, `h` the holders (valid refs, each
once, 6 at most), `y` the year it began, `p` the year it leaked. E11 writes them; this part only checks them. A secret is not an
edge: `readEdge`, `edgesOf`, `liveFeuds` and `openDebts` skip it, and it does not count against the 1,200 edges.

## 2. The caps

`EDGE_CAPS` in `world/caps.ts`:

| Cap | Value | What it bounds |
|---|---|---|
| `edges` | 1,200 | edges in the map (secrets are counted apart) |
| `memPerEdge` | 8 | memories on one edge |
| `memTotal` | 4,000 | memories in the whole map |
| `talkEdges` | 120 | edges that hold `n` or `d` |
| `feuds` | 12 | edges that carry a feud rung `q` |
| `debts` | 40 | edges that carry a debt `dv` |
| `secrets` | 40 | secret records |
| `holders` | 6 | holders of one secret |

`n` keeps 6 callback keys and `d` 8 topic ids (constants of `edges.ts`, not of `EDGE_CAPS`).

The worst case the model can reach is 19,409 nodes: 1 for the map, 9,600 for 1,200 edges of seven numbers, 2,400 for a link kind and
a call-in stamp on every edge, 1,200 memory arrays, 4,000 memory strings, 1,920 for `n` and `d`, and 288 for the feuds and debts.
The 17,000 of the allotment comment in `world/caps.ts` leaves out `k` and `c`. 40 full secrets add 520. The slice that E6b registers
(`world.edges`, 24,000 nodes) holds the larger figure, and `test/world-edges.test.ts` builds the map and counts it.

## 3. The normalizer

`normalizeEdges(raw)` is **total**: any value in, a valid map out, never a throw, and it does not change its input. A map that is
already valid comes back as itself, entries and all. It works in this order, and every cut is by salience (the most salient kept,
ties by key), so the result depends on the set of edges and never on the order they came in:

1. A value that is not a plain object is an empty map. A key that is no edge key or secret key goes, with its value.
2. Each edge: `t f r s o y l` must be finite numbers (an edge with one that is not is dropped) and are cut to their range, years
   rounded; every optional field is kept only when valid, otherwise dropped alone; an empty list is left out; no other key stays.
3. Memories: text that is not exactly `kind.year.weight.by` of a known kind goes; the rest in year order (a stable sort); over 8 an
   edge, the oldest **unpinned** goes first and only then the oldest pinned. `n` keeps its last 6 well formed entries, `d` its last 8.
4. `n` and `d` on 120 edges at most: the most salient edges that hold them keep them.
5. 4,000 memories in all: the lowest-salience edge gives up its oldest unpinned memories first; pinned ones go only when nothing
   else is left.
6. 12 feuds and 40 debts: the most salient keep their `q` and `dv`, the others lose that field and stay edges.
7. 40 secrets, 6 holders each (invalid and repeated holders go first): unleaked before leaked, then the heavier, then the newer.
8. 1,200 edges, the lowest salience first. An edge that is **bound** (`edgeLocalBound`) goes last.

`salience(e, role)` is `f + s + abs(o) + role`; `role` is the weight of the link (`kin` 40, `pair` 60, `staff` 20, any other 0) unless
the caller gives one (E14's registered salience gives 0). **Bound by the edge alone** (`edgeLocalBound`): a link kind, a debt with
more owed than paid, a feud, or a pinned memory. E6b's `putEdge` refuses to evict such an edge and E7's orphan rule keeps it; E14
widens the predicate to `isBound` with the person-level cases.

`edgeProblems(raw, people?, ego?)` names every fault of a stored map in one line each (60 lines at most, then a count of the rest):
shape, ranges, empty or over-long lists, unknown or malformed memories, keys out of order, a bad feud, debt or secret, and every cap.
It is empty exactly when `normalizeEdges` gives the map back as itself. With `people` and `ego` it also names an edge `person>ego`
of a person who is not a pet whose `f` differs from `Person.relationship`. `worldProblems` (`world/invariants.ts`) prints each line as
`edges: ...`.

## 4. The reads

Pure and total, on the raw `readWorld(g).edges` run through the normalizer and cached by the identity of the root (a shard root is
replaced, never edited in place). They never create `g.world`, never draw a number and never write.

- `edgeKey(from, to)`: the key, or null.
- `readEdge(g, from, to)`: the edge or null.
- `edgesOf(g, ref)`: every edge that has `ref` at either end, as frozen `[key, edge]` pairs sorted by key.
- `memoriesOf(e)`: the memories as `{ kind, year, w, by }`, oldest first, newest last.
- `liveFeuds(g)`, `openDebts(g)`: the number of edges with a valid `q`, a valid `dv`; never above 12 and 40.

## 5. The 40 memory kinds

`MEMORY_KINDS` in `world/edge-memory.ts`, in this order. **Append-only**: a stored memory carries its kind id, so an id is never
renamed, reordered or removed. R6 appends after the 40th, and U10 holds one phrase for every id, so a kind that is appended needs
its phrase in the same commit.

1. Money and favors: `loan_given loan_repaid loan_unpaid loan_forgiven gift_given gift_refused allowance_cut bailed_out asked_too_often`
2. The will and the family: `cut_from_will restored_to_will told_gently told_bluntly olive_branch took_my_side estranged reconciled`
3. Love: `betrayal proposed_yes proposed_no broke_up divorced`
4. Loyalty and secrets: `stood_by_me saved_me covered_for_me kept_secret leaked_secret gossiped_about_me outed_me reported_me`
5. Career: `hired_me fired_me promoted_me demoted_me passed_over poached_me signed_me referred_me mentored_me beat_me`

A memory is the text `kind.year.weight.by`, for example `betrayal.2031.3.e`: the weight is 1 to 3 (it decays to 0 and the memory
goes), `by` is `e` when the ego did it and `t` when they did. `parseMemory` and `formatMemory` read and write it; the reader accepts
canonical text only.

**The five pinned kinds** never decay and they bind the edge they sit on: `betrayal`, `saved_me`, `cut_from_will`, `estranged`,
`divorced`.

**`MEMORY_FX`** is the frozen table of what a kind does the day it is made: per kind `{ t, r, s, o, decay }`, each of `t r s o` a
whole number within plus or minus 25 (the change at the full weight of 3; `remember` scales it by weight / 3), and `decay` the
years one point of weight lasts: 4 for most kinds, 2 for `asked_too_often`, 0 for the pinned five. No row moves all four fields by
the full 25, and every row moves something. A row is read from the first end's side: what the person feels about the ego after the
memory. The table is written for the usual direction of each kind, and `by` does not flip it. The values are in the source; after R4
a changed value needs a `RECORD_REASON`, a row in `moved-tests.md` and the lead's OK (cross-check section 3.3, X57).

## 6. The writer (R4-E6b)

`world/edge-write.ts` is the one place `g.world.edges` is written. It is layer 2, draws no number and books no dollar.

**`putEdge(g, key, patch)`** merges the patch into the edge under `key`, or removes the edge for `null`. It returns true when the map
holds the edge as asked (written, already so, or nothing to remove) and false when the write was refused and nothing was written.

- The key must be an edge key: both ends parse, 140 characters at most, exactly one `>`. A secret key is no edge key.
- The patch must be a plain object. A new edge needs all seven of `t f r s o y l`; an edge that is there keeps the fields the patch
  leaves out. The merged edge is read back through the normalizer, so a number out of range is cut, a field that is not valid is
  dropped, an unknown key is ignored and `undefined` clears an optional field. A required field that cannot be read refuses the write.
- Nothing is written when the edge comes out as it was.
- The root is replaced, never edited. Keys stay ascending (a sorted insert), every entry that is not touched is the same object, and
  what is stored is frozen: the root, the new edge and its lists. A list the caller passed is copied, never frozen in place. A stray
  in-place write on a stored root is a `TypeError`, which is the alarm the Save track relies on.
- A new edge in a map of 1,200 evicts the lowest-salience edge that is not bound (`edgeLocalBound`; among equals the highest key, as the
  normalizer cuts). The edge being written is kept. If all 1,200 are bound, the write is refused.
- A feud on a 13th edge, a debt on a 41st, the dialogue store (`n`, `d`) on a 121st are refused, not cut: a cut would take the field
  from an edge the caller did not name. Memories are kept at 4,000 by eviction, as the normalizer does it: the oldest unpinned memory
  of the lowest-salience edge goes first, and a pinned one only when no unpinned memory is left anywhere.
- A root this file wrote is known to be valid and is not read again; any other root (a load, a clone, a hostile save) is normalized
  once before it is trusted.

**`remember(g, who, kind, o)`** makes a memory and applies what the kind does, once. `who` is a Person (named by `personEntity`) or an
`EntityRef`; the edge is `who > (o.with ?? the player)`. `o.w` is 1 (the default), 2 or 3 and `o.by` is `'ego'` (the default) or `'them'`.

- It does nothing, and returns false, unless `socialOn(g)`. It also does nothing for an unknown kind, a weight or side that is not
  allowed, an end that is not a ref, a person with no name (`pool:other`) and a year that is not a year.
- It writes the memory string `kind.year.weight.by` (in year order) and applies `MEMORY_FX[kind]` once to `t`, `r`, `s` and `o`,
  scaled by weight / 3, cut to the field ranges and rounded to hundredths so a stored number stays short.
- A second call of the same kind on the same edge in the same year writes nothing: no second memory and no second effect.
- An edge it makes starts at `t` 50, `r` 50, `s` 0, `o` 0, with `y` and `l` this year. Its `f` is the Person's relationship when the
  edge points at the player (the affection invariant), else 50. An edge that is there keeps its `f` and `y`; `l` becomes this year.
- 8 memories an edge (the oldest unpinned first) and 4,000 in all.

## 7. The stamp (R4-E6b, X6)

A life plays the social track when `g.world.social` is there. The shard is `{ v: 1, on: 1, y, fy }` with two optional fields: `ay`,
the year `society.acts` last ran, and `ms`, the mentor baseline, at most 3 `[person ref, skill]` pairs with a skill of 0 to 100.
`y` is the year the yearly edge step last ran and `fy` the year of the stamp. It is 5 nodes, 16 with a full baseline, and a derived
row of the `world` chunk (it changes once a year, with the world).

`world/social.ts`:

| Name | What it does |
|---|---|
| `stampSocial(g)` | writes the shard for this year, once; a life that has it keeps its very shard. `createNewLife` calls it when the build key `social` is on (R4-E7). Every v5.2.0 save, every unstamped life and every heir of one has no `social` key and keeps v5.2.0 behaviour (X6) |
| `socialOn(g)` | true when the stamp is there and valid. Pure and total on any world |
| `readSocial(g)` | the shard through its reader, or null |
| `patchSocial(g, patch)` | the one writer of `y`, `ay` and `ms`: replaces the root, keeps a value that did not change by identity, writes nothing for an unchanged patch, and cannot make the stamp or change `v`, `on` or `fy`. A year that is not a year refuses the whole patch |
| `normalizeSocial`, `socialProblems` | the reader (total, a valid shard comes back as itself) and every way a stored shard is wrong, printed by `worldProblems` as `social: ...` |

The reader is strict about the stamp: a value that is not a plain object, or whose `v` or `on` is not 1, is no shard and the world
drops it. A damaged year is repaired from the other one when one is good and the shard is dropped when neither is. Fields are read off
the object itself, never off its prototype.

## 8. The slice (R4-E6b)

`g.world.edges` is the second entity slice of the game (`world/edges-slice.ts`, the pattern of the Met store in `docs/SAVE.md`): version
1, chunk `entities`, `entities: { kind: 'edge', shards: 8 }`, `write: 'replace'`, caps of 24,000 nodes and 420,000 characters for all
eight records together. The codec cuts the map into `e.edge.0` to `e.edge.7` by a hash of the key, so a tap that changes one edge
writes one chunk and the head, and never the `world` chunk. Eviction can touch a second chunk (the one the victim sits in), and so can
the 4,000-memory cap. The secrets live in the same map and share its chunks.

The worst case the model can reach is 19,929 nodes and about 310,000 characters, so the row has room. The hash is FNV-1a modulo 8,
which reads only the low three bits of every character: keys that differ in a few characters can fall unevenly (a test with 1,200
keys that share a long prefix put about 600 in each of two chunks). Keys of real lives, which differ in a whole id, spread better.

## 9. The mirror (R4-E7, X22, X23)

`Person.relationship`, the money ties `data.w` and the will's feelings `data.wl` stay the authority through R4; the edge follows them
(X22). `world/edge-mirror.ts` is the hook that `kernel/relations.ts` calls after every change `core.ts` makes
(`addRelationship(g, p, delta, kind?)` and `setRelationship(g, p, value, kind?)`). It is a hook, not a port (X23): importing the file
binds it, and `world/edge-step.ts` and `life.ts` import it for that effect, so it is bound after entering through `aging` and `menus`
and wherever a stamped life is made. `test/world-edge-mirror.test.ts` proves both entries.

What it does, in the order it asks:

- Nothing unless the life is stamped (`socialOn`). An unstamped life writes no edge and no shard: every v5.2.0 save and every heir of
  one plays as it always did.
- Nothing for a pet, for a change that leaves the number as it was (a zero delta, a bound, a raw write of the same value), for a number
  that is not finite, or for a person who has no ref (an id that is no name gives `pool:other`).
- Otherwise the edge `personEntity(p) > playerRef(g)`. At the first touch it starts at `t` 50, `r` 50, `s` 0, `o` 0, with `y` and `l`
  this year. It gets `f = after`, so `edge.f === p.relationship` after every call for a number from 0 to 100 (the model cuts to that
  range). The kind of the change says what it was: an `offence` adds what was lost (`before - after`) to the resentment `s`, up to 100;
  an `affection` and a `decay` add nothing. The default kind is the sign of the change; `decay` is named by the yearly drift of
  `driftRelationships` (both of its writes) and by the two nepo mood steps. `l` moves to this year; every other field is left alone.
- Everything goes through `putEdge`. A map of 1,200 bound edges refuses a new edge and the mirror lets it go: the number has moved all
  the same, because the edge only follows it.

The yearly negative call sites were read by hand (the list is in `test/world-edge-mirror.test.ts`). Only the drift and the mood steps
are `decay`; a missed allowance, a chased loan, a quarrel, a partner's drama and a relative who leaves are `offence`, because they are
slights somebody did and the resentment should keep them.

**The legacy readers** (`world/edge-legacy.ts`). `readTies` and `readWl` live in `events/` (layer 3) and `world/` and `society/` may not
import `events/`, so two small total readers of the raw records are here: `legacyTies(p, ego)` gives `{ owes, since }` of `data.w` and
`legacyWl(p, ego)` gives `{ anger, cut, estr }` of `data.wl`. A record whose `by` is not the ego's character id reads as blank, and so
does anything hostile. A test holds them equal to `readTies` and `readWl` on every shape. The later tasks that need the cut-out and
estranged flags (`familyLive`, the broker, the will-owned test, `isBound`) read them through this file.

**`syncLegacy(g, p)`** follows the two records of one person into the edge. `updateTies` and `updateWl` call it after they write (when
the life is stamped), and the yearly step calls it for everyone.

- The debt. While the ego's record says the person owes, the edge carries a kind-0 debt `[owed, 0, since, 0, 0]` (no interest, nothing
  paid: the legacy record keeps its own books) and obligation is at least `min(100, 20 + 10 x years owed)`; it only ever raises `o`.
  When they owe nothing a kind-0 debt is removed and `o` is left to the acts. A debt of another kind (a divorce debt) is never touched
  and never overwritten. A debt cannot begin after today and is at most a trillion.
- The anger. `s` is at least the anger of the ego's will record and is never lowered.
- No edge is made for a person whose records say nothing to follow. The numbers 20 and 10 are the planner's; the tests prove the range.

## 10. The yearly step (R4-E7, X42, C14)

`world/edge-step.ts` is the module `world.edges` (layer 2): one yearly entry in the `close` phase of the aging seam at order 5, so it
runs right before `milestones`, and it owns the slice `world.edges`. Its group row is `people` in the planner, the log view and the
integration test (X42). Once a year, on a stamped life, and idempotent by `social.y` (written with `patchSocial`):

1. Resentment fades: `s` x 0.9, rounded down to hundredths, so it reaches 0.
2. Memories lose weight: every memory loses 1 every `decay` years of its `MEMORY_FX` row (4 for most kinds, 2 for a petty one),
   counted from the year it was made, and at 0 it goes. The pinned five never lose any. A gap of years pays every decay that fell in it.
3. The legacy sync for every person of the game.
4. Orphan edges go: the person is gone from the game, the edge is not bound by its own fields (`edgeLocalBound`), it has no debt at all,
   `l` is five years old or more and `f + s + |o|` is under 40. E14 widens "bound" to `isBound`.

It draws nothing, makes no id, books no dollar and logs nothing. A stamp from the future is stepped once and put right. A calm map is
left as it is, the very object. A tap of 10 writes at 1,200 edges is measured by the test and stays under a millisecond on the
reference machine; the step itself writes only the edges that changed.

## 11. The memory writers, the odds terms and the heir copy (R4-E8, X22, X27, X28, X33, C10)

Three things use the edges that sections 6 to 10 keep. Each is a no-op on a life that is not stamped (X6): the writers return at
once, the odds terms are 0, and the heir copy is not called by an unstamped hand-over.

**The writers.** Twenty-four of the 40 kinds are made by the game, one `remember` line at each site. `by` is the side of the edge:
`ego` is the second end (the player on every `person > player` edge), `them` the first end. Weights are 1 to 3.

| Site | Kind | Weight | By |
|---|---|---|---|
| `events/wealth-resolve.ts` `lend` | `loan_given` | 2 | ego |
| `events/wealth-resolve.ts` `refuse` | `gift_refused` | 1, 2 for a boundary | ego |
| `events/wealth-resolve.ts` `refuse` | `asked_too_often` | 2, on a boundary or the third ask in four years | them |
| `events/wealth.ts` `payAllowances`, a missed payment | `allowance_cut` | 1, 2 when it stops | ego |
| `events/wealth.ts` `collectLoans`, a payment | `loan_repaid` | 1, 2 for the last | them |
| `events/wealth.ts` `collectLoans`, avoiding you | `loan_unpaid` | 1, 2 from the third year | them |
| `events/will-act.ts` `learn` | `cut_from_will` | 3 from anger 55, 2 from 30, else 1 | ego |
| `events/will-act.ts` `restore` | `restored_to_will` | 2 for a full share, else 1 | ego |
| `events/will-act.ts` `estrange` | `estranged` | 3 | them |
| `events/will-act.ts` `reconcile` | `reconciled` | 2 | ego |
| `events/will-amends.ts` `heartToHeart`, it got through | `olive_branch` | 2, 3 for an estranged child | ego |
| `events/will-amends.ts` `explainReasons`, `events/will-scenes.ts` the telling (kind) | `told_gently` | 2 | ego |
| `events/will-scenes.ts` the telling (blunt) | `told_bluntly` | 2 | ego |
| `events/will-feud.ts` `takeSides` | `took_my_side` | 1 | ego |
| `love.ts` a hook-up found out | `betrayal` | 3 | ego |
| `love.ts` `breakUp` | `broke_up` | 2, 3 for an engagement | who ended it |
| `love.ts` `divorce` | `divorced` | 3 | who filed |
| `love.ts` a proposal answered | `proposed_yes`, `proposed_no` | 2 and 1 (the player proposes), 2 and 2 (they do) | who proposed |
| `business/nepo-actions.ts` `hireRelative` | `hired_me` | 2, 1 for a summer job | ego |
| `business/nepo-actions.ts` `promote`, `demote`, `fire` | `promoted_me`, `demoted_me`, `fired_me` | 2; 3 if spoiled, else 2; 3 for a child, else 2 | ego |
| `business/nepo-year.ts` `siblingDrama`, the one passed over | `passed_over` | 2 | ego |
| `relationships.ts` `rumor` | `gossiped_about_me` | 2 | ego |

`took_my_side` is the one memory on an edge between two people: the angry relative remembers who took their side, so it sits on
`angry > relative`, and the relative, the second end, is `ego`. On `relative > player` the table would read as goodwill toward the
player. A kind is written once per edge and year (`remember` refuses a second one, and applies its effect once), so a site reached
twice in a year keeps the first weight. The writers draw nothing and book nothing. `test/edge-writers.test.ts` holds this list as
data and proves each line on a stamped game, on a game that is not stamped (nothing written, and the game equal to the stamped one but
for the world) and by mutation.

**The odds terms** (`world/edge-odds.ts`). `memoryOdds(g, p, group)` reads the memories of the edge `person > player` and gives a
signed number for one group, within plus or minus 0.15 in all and plus or minus 0.05 for any one kind. The table `MEMORY_ODDS` has
a row for each kind and an entry for each group in hundredths at weight 3; a memory of weight 1 or 2 is a third or two thirds of it.
The group `repay` is added inside `repayOdds` (the game is an optional third argument; `collectLoans` and the Ask to Be Paid Back
action pass it), `peace` inside `peaceOdds`, and `ask` multiplies the weight of an ask in `requestCandidates` by `1 + term`. The term is
0 for a life that is not stamped, for a person with no edge and for an edge with no memory, so `x + 0` and `x * 1` leave every old
number to the last digit. It is pure: no draw, no write, no world made. `test/edge-odds.test.ts` prints the table. The numbers are
tuning, not a frozen table: a changed entry moves only stamped lives and takes a row in `moved-tests.md`.

**The heir copy** (`world/edge-heir.ts`). `heirEdges(map, fromEgo, toEgo, year)` is the pure half of the hand-over: Life's `carryEdges`
(R4-L9) calls it over the edges that end at the late player and merges the answer as returned. Every edge `X > fromEgo` comes back as
`X > toEgo`; `t`, `f` and `r` are halved, `s` is scaled by 0.6 and `o` by 1 (`EGO_COPY`), each rounded to hundredths and never
raised; every memory keeps one point less of weight and a memory at weight 1 goes, the pinned five too; `n`, `d`, `c` and `dv` are
dropped (C10: the legacy record carries what the late player was owed, and a debt the late player owed was settled before the
switch); `q` and `k` stay only for a link kind in `HEIR_KEEP_KINDS` (`kin`, X28), so a rival's feud ends at the hand-over. The last touch
`l` is the hand-over year. A direct kin's `f` is then set by Life to the blended `Person.relationship` (X33), so it is not half of the
old number. The answer goes back through `normalizeEdges`: a hostile map copies to a valid one and 100 times any cap comes out inside
`EDGE_CAPS`.

## 12. What the next tasks add here

- R4-E9 to E16: the family-act budget, the acts, loans, secrets, feuds, staff.
