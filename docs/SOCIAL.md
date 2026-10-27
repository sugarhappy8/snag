# Social: edges, memories and acts

How people feel about each other, and what they remember, as the engine keeps it (R4, v5.3.0). This note starts with the
**edge model** (R4-E6a): the record, the 41 memory kinds, the caps and the rules of the normalizer. R4-E6b adds the writer, the
stamp and the slice; R4-E7 the mirror and the yearly step (sections 9 and 10); R4-E8 the memory writers, the odds terms and the heir copy (section 11); R4-E9 the family-act budget (section 12); R4-E10a the act engine and the favors (section 13); the later tasks of the Edges and acts track add the rest. Until a
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

## 5. The 41 memory kinds

`MEMORY_KINDS` in `world/edge-memory.ts`, in this order. **Append-only**: a stored memory carries its kind id, so an id is never
renamed, reordered or removed. E6a made 40 of them and the whole-diff review of R4 appended the 41st, `heard_gossip`, so that the people a
leak or a feud tells have a memory that reads "heard gossip about you" and not "gossiped about you" (a `them` memory names the person on the
edge as the one who did it). R6 appends after the 41st, and U10 holds one phrase for every id, so a kind that is appended needs its phrase
in the same commit.

1. Money and favors: `loan_given loan_repaid loan_unpaid loan_forgiven gift_given gift_refused allowance_cut bailed_out asked_too_often`
2. The will and the family: `cut_from_will restored_to_will told_gently told_bluntly olive_branch took_my_side estranged reconciled`
3. Love: `betrayal proposed_yes proposed_no broke_up divorced`
4. Loyalty and secrets: `stood_by_me saved_me covered_for_me kept_secret leaked_secret gossiped_about_me outed_me reported_me`
5. Career: `hired_me fired_me promoted_me demoted_me passed_over poached_me signed_me referred_me mentored_me beat_me`
6. Appended after E6a: `heard_gossip`

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

**`MEMORY_PHRASE`** (R4-U10, `hubs/people-memory.ts`) is the frozen table of what a player reads: two sentences for each kind, one for
each side of `by` (`ego` is "You lent Ana money", `them` is "Ana lent you money"), with one `{name}` slot and at most 60 characters. The
same fact has to read right from both ends. `memoryLines(g, p, n)` turns the memories of the edge `person > player` into up to three
lines on the "Shared history" card of the profile, the strongest weight first and then the newest, each `phrase (year)`; it is empty for
a life the social flag never stamped. The table is typed `Record<MemoryKind, ...>` and `test/people-memory.test.ts` compares its rows to
`MEMORY_KINDS`, so a kind appended without a phrase fails the build and the test, by design (X45). A changed phrase after R4 needs a
`RECORD_REASON`, a row in `moved-tests.md` and the lead's OK (cross-check section 3.3, X57).

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

**`putEdges(g, writes)`** (CP4) takes a list of `[key, patch]` pairs and answers one boolean for each, in order. The answers and the map it
leaves are exactly what `putEdge` gives for the same pairs one after the other; the only difference is the cost. `putEdge` copies the
root (1,240 keys at the cap), so a year that wrote 1,200 edges one by one copied about 1.5 million entries. A write that changes or
removes an edge the map holds can't add an edge and can't push a count over a cap, so these are gathered and stored with one copy.
The rest goes to `putEdge` on the root as the gathered writes leave it: a write for an edge the map doesn't hold (a new edge may evict
another), a write that would leave more than 4,000 memories (the trim), and a key that's already waiting in the batch (it has to read the
earlier write). Nothing changes for a caller that writes one edge. `test/edge-write-batch.test.ts` proves the equality on 500 random
batches, a full map of edges and a full map of memories, and that the yearly step stores the root once.

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
reference machine; the step itself writes only the edges that changed, and writes them with one `putEdges` call, so the root is copied
once a year and not once for every edge that faded (CP4, section 20).

## 11. The memory writers, the odds terms and the heir copy (R4-E8, X22, X27, X28, X33, C10)

Three things use the edges that sections 6 to 10 keep. Each is a no-op on a life that is not stamped (X6): the writers return at
once, the odds terms are 0, and the heir copy is not called by an unstamped hand-over.

**The writers.** Twenty-four of the first 40 kinds are made by the game, one `remember` line at each site (`heard_gossip` is written by the leak and the feud, sections 16 and 18). `by` is the side of the edge:
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

## 12. The family-act budget (R4-E9, X40, X41, C13, C14, C15)

A life the social stamp marks shares three family choices a year. Before R4 each source counted for itself: the wealth asks 3, the
luxury choice 1, nepo 2 and the will 1, so a rich family life could be put 3 + 1 + 2 + 1 times in a year. The shared counter is
`g.yearActions['fam.act']`, reset with the other year actions (`aging.ts`, and the hand-over in `life.ts`), and the old caps stay
inside it as `min(old, room)`. A life that is not stamped has no counter: `useFamilyAct` is true and writes nothing, so every v5.2.0
save and every heir of one keeps today's numbers. The code is `society/budget.ts`; other domains reach it through `society/contract.ts`.

**The unit is a choice.** A notice is not counted (notices keep the year close's own budget of 5). So the one outcome notice of the
family company spends its local `nepo.pop` cap and no shared slot. A choice that finds no slot is dropped, not deferred: the year
close keeps these scripts and counts them first, `DEFERRABLE_SCRIPTS` is the three literals it was, and a family choice that waits
a year changes the thing it asks about.

**The calls.**
- `useFamilyAct(g, source)` spends one slot for a choice about to be queued, `source` one of `wealth`, `use`, `nepo`, `will`, `social`;
  false when none is left, and then the caller drops the choice.
- `familyRoom(g, source)` is the pure look before the spend: how many more choices that source may queue now (Infinity when the life is
  not stamped). `popupBudget` and `useChoicePopup` use it, because they must not let a local cap go before the shared one has said yes.
- `familyLive(g)` is pure and reads only the world (edges, `edge-legacy`, `holdings`, `firms`), `core` and the kernel. It is true when
  someone is cut out of the will (the ego's `data.wl` record says `cut`, or the edge to the player carries a `cut_from_will` memory that
  no `restored_to_will` has answered, for a living person), when `liveFeuds(g) > 0` or `openDebts(g) > 0`, or when a living relative's
  raw job key `data.nepo` (a plain object with a non-empty text `assetId`) names a firm that the firms index lists and the holdings
  table gives the player a share of. The index is the frame the last year closed on, so a firm hired into this year counts from next year.

**The reserve.** When `familyLive(g)`, one of the three is held back from the two sources that run before `nepo` in the money phase,
`wealth` (money 70) and `use` (the luxury choice, money 80): between them they may spend at most 3 less the reserve, counted in
`g.yearActions['fam.early']`. So `nepo` (90), `will` (100) and `social` (the close) can still take the third. Without that rule the
luxury choice would take it first and the reserve would protect nothing. A life with none of the three stakes has no reserve and
draws exactly the wealth popups it always had; a test holds that against the recorded E3 rows, year by year.

**Where it is spent** (each only where a choice is queued):

| Source | Place | One spend for |
|---|---|---|
| `wealth` | `events/wealth.ts queueRequests` | each big ask, and one for the bundle (or the one small ask), made before `presentAsk` and `presentBundle` can hand the ask to a secretary's inbox, so an inbox ask takes a slot too |
| `wealth` | `events/wealth.ts askAboutGrownKids` | the "All Grown Up" popup |
| `use` | `shops/luxury-family.ts yearlyFamilyUse` | the year's one decision (a crash, a pawned watch, a party), just before it runs |
| `nepo` | `business/nepo-year.ts useChoicePopup` | the ask (`nepo-asks.ts`), the life event (`nepo-life.ts`) and the baton prompt |
| `will` | `events/will-feud.ts tryScene` | the scene, together with `will.scene` |
| `social` | the close | the acts of R4-E10b, E11 and E12 (a lender calls, a secret leaks, a falling out) |

`usePopup` keeps meaning the local `nepo.pop` cap. `useChoicePopup` checks the room, spends the local cap, then the shared key. The
baton prompt spends before it marks `handYear`, so a prompt the budget refuses leaves the year alone and the question comes next year.
A falling out (E12) needs both a slot and `will.scene` unspent, so there is one scene a year across the two ladders.

**The pace engine `kin`.** `PaceEngine` gains `kin`, a closed list `KIN_FAMILIES` of three: `pop.kin.feud`, `pop.kin.lender` and
`pop.kin.leak`. `PACE.maxFamilies` goes from 60 to 80 and `TEXT_MEM_LIMITS.families` from 120 to 160, once for the release (X41): 63 of
the 80 are declared, 17 are left for R5 and R6. At 160 families a full text memory is 725 JSON nodes, so the ceilings in
`test/text-memory.test.ts` and `test/notice-acceptance.test.ts` are 740. `docs/QUIET.md` has the rule for adding a family.

**Proof.** `test/family-budget.test.ts`: the counter and its bounds; `familyLive` clause by clause; each spend point alone; a scripted
saturated year in which every source is eligible at once (exactly 3 queued, counted by script id; wealth and use at most 2 together;
the reserved slot to nepo, will or social; every later call false; the outcome notice not counted; a falling out and `will.scene`
never both), then each of nepo, will and social alone; 30 years of the tier-4 household against the E3 rows; 40 years through
`ageUp` with a second run of each yearly entry. The whole-life canaries (`golden-digest`, `kernel-parity`, `r2-codemod-parity`) pass
unchanged, which is the proof that an unstamped life does not move.

## 13. The acts and the favors (R4-E10a, D.4, X24, X26, X40, X42, C7, C9, C14, C31, C39)

What people do to each other is a **SocialAct**: `society/acts.ts`. An act is a pure `blocked(g, c)` (the reason it can't be run now, in
words, or null) and a pure `plan(g, c)` (the consequence as data, an `ActPatch`), and `runAct(g, act, key, person)` is the one place an
act writes. A patch carries the edge fields to set, memories to make, relationship deltas, money lines, a log line and a notice. Money
lines (`{ from, to, amount, token }`, the player or a Person at either end) are booked once through `cash.moveCash` under the reason
`support`, so a replayed token books nothing and the dollars that leave one purse arrive in the other. A patch may also carry `also`, the
same shapes for a second edge and person (the third person of a vouch, the relative of a brokered peace); it is an optional addition to
the frozen shape of the cross-check (3.1), and money, log and notice belong to the patch as a whole.

**Authorization is inside the function** (design 14.1, invariant 4). `runAct` checks the stamp, that the key is an edge of the current ego
(one end is the player's own ref, so an edge between two other people or one of an earlier ego is refused), that the person is the other end
of the key and is in the game, then runs `blocked`, and only then plans. It writes the edges first (a new edge may be refused by the cap;
the edges made so far are taken back and the answer is null), then the money, the memories, the relationship deltas through the shim of
`core.ts`, the log and the notice. A blocked call answers null and changes nothing: not a byte of the state, not a draw of `g.rng`, not an
id. `test/social-act-auth.test.ts` calls `runAct` directly in each blocked state for each act; later acts add rows to its table.

**Luck** comes from the stream `social` only: `actRoll(g, act, key, year)` is `outcomeStream(g, 'social', year, '<act>|<key>')`, which is
`ActCtx.roll`. It draws nothing from `g.rng`, and a Time Machine jump re-rolls the year it lands in. A plan is a pure function of the state
and that stream; its log line is picked with the same roll, because a plan may not touch the text memory.

**The favors** (`society/favor.ts`) are calls-in on a person who is fond of the player and trusts them. The giver is the person, the edge
is `giver > player`.

| Rule | Value |
|---|---|
| Who can be asked | alive, not a pet, not estranged; the player alive and 16 or older |
| Standing | `f` 50 or more and `t` 40 or more (a person with no edge reads as t 50 and f their relationship) |
| Cooldown | one call-in an edge every 3 years (`Edge.c`); a refusal counts, so asking again is no way round it |
| Strength | `min(1, 0.5 + reach / 24)`, reach the giver's living family and friends in `g.people` (the same circle) |
| Odds of yes | 0.25 to 0.95: `0.3 + 0.5 x strength + (t - 40) / 300`, a little for honesty and temper; no wealth term |
| A favor done | `o` of the edge goes down by 20 (the player owes), not below -100, and nothing decays it; the bond warms by 2 |
| A favor refused | one point of relationship (an offence); no obligation |
| Strain | the third favor within 6 years while two are still owed (`o` -40 or less, last call-in 6 years back or less) also writes `asked_too_often` |
| Vouch | the third person's relationship rises by `round(15 x strength)`, 8 to 15, at most 100 |
| Broker | the cut-out or estranged relative's `o` toward the player rises by 20 a brokered peace, at most 100 |

`o` is positive when the first end owes the second, so a favor the player is owed by nobody and owes lands as a negative number on the
giver's edge and passes to an heir with the edge (`EGO_COPY.o` is 1; the call-in year `c` is dropped). E11's `reconcileOdds` reads the
relative's `o` at 0.0015 a point, so a brokered peace adds at most 0.15 to the peace odds (`BROKER_OBLIGATION`, `BROKER_ODDS_PER_POINT`
and `BROKER_ODDS_MAX` are exported for it); the 20 and the 0.0015 are the planner's and the tests hold them as ranges. Two people know each
other when they share a circle: the family, the friends, or the same school or firm (`contextId`); the model has no other acquaintance graph yet.
`FavorKind` is an open union, so a later release adds the kinds that need a consumer outside the people systems (references,
introductions, votes, hires; R9).

**The menu** (`society/menu.ts`): `socialNodes(g, p)` is spliced into `personActions` before the will's rows. It is a plain empty list on
a life that is not stamped, so every v5.2.0 save shows the rows it always did. On a stamped life a friend or relative gets 'Ask for a
Favor' and, when there is a third person the friend knows who thinks least of the player, 'Ask {name} to Vouch for You'; a cut-out or
estranged relative gets 'Ask {name} to Speak for You' (the way back), through the best giver who can be asked now. A row that is blocked
greys itself out with the reason.

**The module** `society.acts` (`society/module.ts`): the `close` phase of the aging seam at order 6, between the edge step (5) and the
milestones (10), one entry. Once a year on a stamped life, idempotent by `social.ay`, a no-op on any other life. Its step list was empty
in E10a; E10b appended the debt servicing (section 14), E11 adds the leak pass and the mentor settle, E12 the feuds.

**What it did to the oracles.** The stamped replay of `test/relationship-parity.test.ts` compares the page of each of the 16 people with the
recording of the plain engine. A stamped page now gains the rows `social.*`, so the replay leaves them out of the comparison (and counts
them: more than 0 stamped, exactly 0 unstamped); every other row is still compared to the last digit. `test/relationship-ratchet.json`
has one new entry, `society/acts.ts` with one `addRelationship(` call: the applier is a new caller of the shim, which is what the shim is for.

**The seam** (`society/seam.ts`): the axes of a person (`axesOfPerson`, npc-state.ts), as `honestyOf` and `temperOf`. With `acts.ts`
importing `cash.ts`, this is the `society->life` pair of the layer baseline, and the only two files it names (X26).

## 14. Loans and debts (R4-E10b, D.4, X24, X26, X40, X54, C9, C37, C39)

A person lends the player money and the player owes it back with interest. The debt is one record in one place, `Edge.dv`, on the edge
**from the debtor to the creditor**, so a loan the player owes sits on `player > lender` and a key that starts at the ego is a debt the ego
owes (C37). There is no separate shard, no new ledger reason, and no mint or burn: the principal, the service and the interest all move
from one purse to another through `cash.moveCash`, under `support` (a divorce debt, L7, under `divorce`). `docs/LEDGER.md` shows interest
under Family, as it shows every other transfer between people.

**The record** `dv = [owed, ratePct, since, kind, paid]`. `owed` is what the debt has grown to (the principal and the interest added so far)
and `paid` what has been paid, so `owed - paid` is what is still owed and `owed > paid` is exactly "an unpaid debt" of `edgeLocalBound`. A
debt that is paid in full has its record taken off the edge (the edge stays), so the 40 slots of `EDGE_CAPS.debts` are the debts that are
open. `readDv` reads a record the way the normalizer does and answers null for anything else: NaN, a negative, 1e300, a wrong length, a
rate over 60, a kind over 9 or a prototype's field all read as no debt. Kind 0 is a loan, kind 1 a divorce (`DEBT_KIND`); a kind from 2 to 9
is valid in the record and is never serviced.

**The door** (`society/contract.ts`, one export line from `society/debt.ts`):

| Name | What it does |
|---|---|
| `debtsOf(g, ego)` | the debts that touch the ego, oldest first (ties by key): `{ key, owed, owedBy, kind }`. `owed` is what is still owed. `owedBy` is true when the key starts at the ego (the ego is the debtor) and false when the ego is owed: the mirror of the legacy record `data.w.owes` that E7's `syncLegacy` keeps on `person > ego`, whose repayment stays in `collectLoans` |
| `serviceDebt(g, key, amount, token, from?)` | pays down the ego's debt on `key` by up to `amount` (whole dollars), out of `from` (the player's purse; then never more than the cash the player has), into the creditor's purse, once per token. Answers what was paid, 0 for anything that is not a payment, and records it in `dv[4]`; a payment that leaves less than a dollar owed takes the record off. Reason `support` for kind 0, `divorce` for kind 1, nothing for another kind |
| `debtToken(kind, year, key, extra?)` | `<kind>:<year>:<8 hex of fnv1a(extra\|key)>`, under 40 characters. The ledger cuts a token at 80 and an edge key can be 95, so a token built from the key and ending in the year would lose the year (a later year would read as a replay) and two long keys would collide. The year comes first |
| `DEBT_KIND` | `{ loan: 0, divorce: 1 }`, frozen |

`serviceDebt` checks its own authorization: an unstamped life, a key that does not start at the current ego (an earlier ego's debt, a debt the
person owes the player, an edge between two other people), a creditor who is not in the game, is dead or is a pet, an amount that is not a
number of at least a dollar, an empty or a booked token, and a payer with no cash all answer 0 and change nothing. An estranged creditor is
still paid. `test/social-act-auth.test.ts` holds the table.

**The loan** (`society/loan.ts`). `loanTerms(g, p)` is pure and says what a lender offers:

| Term | Value |
|---|---|
| `cap` | the most the lender will lend: `min(25% of the lender's cash, 2 x typicalIncome(g))`, a whole number. The typical income is the P7 leaf (`world/typical-income.ts`), reached through `society/seam.ts`, so `society/` joins no domain pair (X54) |
| `min` | 1% of a typical year's pay, never under $100 (the 40 debt slots are not for dust) |
| `rate` | the lender's, a whole percent a year fixed by a hash of their key: 5 to 10 for an ordinary lender, 25 to 60 for a sneaky, manipulative or stingy one (`sharp`) |
| `odds` | the chance of a yes, 0.15 to 0.9: the call-in odds of the favors less 0.1, and 0.15 more from a sharp lender. The planner's numbers, tested as ranges |

Two acts share the rules and the consequence: `loanAct(amount)`, the ask (a roll of the stream `social` decides), and `lendAct(amount)`,
the loan as a fact (a lender who has agreed). `askLoan` and `lend` run them through `runAct`. The rules are the favors' (`favorBlock`: the
lender alive, not a pet, not estranged, `f` 50 and `t` 40, the player alive, the call-in 3 years back or more, so a loan is a call-in and a
refusal counts) and on top: the player and the lender 18 or older, nothing owed to this lender, fewer than three loans open
(`LOAN_OPEN_MAX`), room in the table of debts, an amount from `min` to `cap`. The key of the act is the lender's edge to the player (the
favors' key); the debt is the second side of the patch, on `player > lender`: `dv = [principal, rate, year, 0, 0]` and the memory
`loan_given` (weight 2), which the table reads from the debtor's side. The principal moves from the lender to the player once, with the
token `debtToken('loan', year, key of the debt)`. A yes warms the lender's regard by a point; a no costs one and stamps the call-in.

**The yearly step** (`serviceDebts` in `society/debt.ts`, inside the one `society.acts` entry; kind 0 only, L7's pass serves kind 1). For each
loan the player owes that was taken in an earlier year, oldest first:

1. A lender who is gone, dead or a pet lets the debt lapse: the record goes, no money moves.
2. Interest. In each of the first `accrualYears(rate)` years after the loan, `floor(rate% x what is still owed)` is added to `owed`.
   `accrualYears` is the most years that keep `(1 + rate)^years` at 3 or less, and the interest is on what is still owed, so a debt never
   passes 3 x its principal whatever is paid or missed. A shark at 60% adds interest twice (2.56 x), an ordinary lender at 5% for 22 years.
3. Payment: `min(still owed, floor(20% x the cash above the reserve))`, the reserve being a quarter of a typical year's pay. It is booked
   with `serviceDebt` under `debtToken('debt', year, key)`, so the cash never goes below the reserve for a payment, and so never below 0.
4. The year is told. A part payment speaks through the status row `debt.owe` (when the debt has halved, or after 5 quiet years), the last
   payment through a line of the repay pool, a missed year through the default pool (once, then again only after 3 quiet years). A paid
   year writes `loan_repaid` (weight 2 for the last payment) and warms the lender by 1 or 3. A missed year (nothing paid) writes
   `loan_unpaid` (weight 2 when the last is from the 3 years before), costs the lender's regard 3 points and, for a sharp lender (a rate of
   25 or more), queues `A Lender Calls`.

The step is idempotent by the entry's stamp `social.ay`, by the ledger token of the year and by the memory it writes, so a second run of the
entry, a run of the step alone, a clone and a reload change nothing. Nothing is due in the year a loan is taken.

**A Lender Calls** is a choice for a sharp lender and a missed year: pay what you can (up to half the cash), ask for more time (the stream
`social` against the lender's regard) or ignore the call. It spends one of the year's three family choices (`useFamilyAct(g, 'social')`),
waits `PACE.askGap` years between calls in the family `pop.kin.lender` and is not deferrable at the year close (`DEFERRABLE_SCRIPTS` is
unchanged). The answers go through `serviceDebt`, `remember` and the shim.

**The menu** (`society/menu.ts`): after the favor rows, 'Ask {name} for a Loan' (a money slider from `min` to `cap`, the rate and the odds in
the subtitle, greyed with the reason when `actBlock` says so) and, while the player owes that person, an info row. A child, a dead person, a
pet and a life that is not stamped get neither.

**Text.** Three pools of four lines, each naming the person: `social.borrow`, `social.repay`, `social.default`; one row of `STATE_TABLE`,
`debt.owe` (three variants, `{who}` and `{money}`). A debt line fires about six times in a life. **Ceilings, each probed at 100 x**: the
principal (2 x a typical income whatever the lender holds), the interest (3 x), the payment (what is owed, and the cash above the reserve),
the open loans (3) and the debts (40).

**Where it lives.** `society/acts.ts` re-exports the purses of `cash.ts`, because the layer baseline counts the files of a domain that reach
another and `society->life` stays at the two files the lead approved (`acts.ts` and `seam.ts`); `society/debt.ts` registers its script
through the kernel's `scripts.ts`. `test/relationship-ratchet.json` has one new entry, `society/debt.ts` with one `addRelationship(` call.

## 15. The bound edge (R4-E14, X13, X14, X25, C4, C5, C6)

`world/edge-bound.ts` (layer 2) decides which edges are never let go, and is where the Edges track answers the Met store. It is pure and
total: no write, no draw, no id; a hostile game, a person with a getter that throws or a record of the wrong shape answers false, 0 or an
empty list.

**`isBound(g, key)`** is true when the edge is bound by its own fields (`edgeLocalBound` of `world/edges.ts`: a link kind, an unpaid debt, a
feud rung, a pinned memory) or when a person at one of its ends is held at the person level (the player's own end counts for nothing):

- owes the player: `data.w.owes` above 0, read through `world/edge-legacy.ts` (a dead person too, until `settleTheDead` writes the loan off);
- is a living spouse or fiance, or a child or stepchild;
- holds a share of a company in the holdings table (`readHoldings`), owns an old NPC firm (`npcFirmId`), or holds a family job (`data.nepo`
  with a company id);
- is cut out of the will or estranged (`legacyWl`).

The person-level reasons need no edge, so a key with no edge behind it answers for the people at its ends. A secret key, a text that is no
edge key and anything that is not a text is not bound. `boundTest(g, map?)` is the same predicate for a pass over many keys: the held people
are read once (12 microseconds with 80 people), and only when an edge is not already bound by its own fields. `society/contract.ts`
re-exports `isBound` (C4), which is how a domain outside `world/` reaches it.

**The guards.** `putEdge` (section 6) evicts the weakest edge that is not bound, by salience with ties to the highest key, and refuses a new
edge when all 1,200 are bound; E6b and E7 could use only the edge-local part, and this task swapped them. The orphan rule of the yearly step
(section 10) removes an edge only when it is not bound. The normalizer has no game in hand and keeps `edgeLocalBound`: it cuts only a hostile
or over-full map. A held person's weak edge now outlives a stronger stranger's.

**`cleanupPeople`** (`relationships.ts`, life 40) on a stamped life:

- the dead who still owe stay. It runs before `settleTheDead` (`events/wealth.ts`, money phase) in the same year, so a friend who died this
  year and owed was gone from the list before the loan was written off and told. The rule is `data.w.owes` above 0, or an open debt on the
  edge person>player (`debtsOf` of the society door). A dead ex over the limit of ten is kept the same way. At most 40 of them
  (`EDGE_CAPS.debts`, in the order of the list). Once the record says nothing is owed the next cleanup lets them go;
- a live ex whom the edge model holds is skipped when the list is cut to 20, so the next in line goes instead and the list still ends at 20
  when it can. The list never passes 40 live exes (`HELD_EXES_MAX`, twice the old limit): past it the least regarded of the held go too, so a
  hundred debtors cannot grow it. 20 and 40 are the planner's numbers, tested as a range.

An unstamped life runs the old statements and nothing else.

**The Met hooks** (S7 defined them, X13). `registerProtector('edges.bound', boundFarEnds)` names the personKey of the person at the far end
of every bound edge: both person ends of an edge bound by its own fields, the held end of an edge bound through a person. A Met record that
is named there is never swept, so a sid-born debtor with an edge debt survives the yearly sweeps (the integration case of X14 is E15's, a
three-sweep version is in `test/edge-bound.test.ts`). `registerSalience('edges.salience', playerEdgeSalience)` returns `f + s + abs(o)` of
the edge `person:<key>>player` and nothing for the link role: Met adds `w x 10` itself, so a weight is never counted twice. Both are
registered when the file loads, and a second registration with another function throws. `world/lod.ts` is not edited (C5): its guard covers
every person of `g.people`, the player and the holders already, and the real guard for a sid-born person who is not in `g.people` is the
protector.

**Cost.** The protector reads the 1,200 edges of a full map in about 0.7 ms and is called by the Met store when it makes room or sweeps, not
by the writers. An eviction in `putEdge` is one pass over the map plus one look at the people.

## 16. Secrets and gossip (R4-E11, D.4, X27, X29, C39)

Something the player did that a few people know. A secret is a record under `secret:<n>` in the **edges map** (it shares the map's chunks and
caps; every reader of edges skips it, `isSecretKey`):

```
{ a: the ref it is about, k: 'affair' | 'debt', v: severity 1..5, h: holders (6), y: the year it began, p?: the year it leaked }
```

At most 40 (`EDGE_CAPS.secrets`), 6 holders each. The normalizer (`world/edges.ts`, E6a) keeps a record only as it is valid and cuts to the 40 that
matter (an unleaked one over a leaked one, a heavier one over a lighter, a newer over an older); `readSecrets(g)` lists them in number order
(`secret:2` before `secret:10`). The one writer is `putSecret(g, key, secret | null)` in `world/edge-write.ts`: it reads the record back through
the normalizer, refuses an edge key, refuses a 41st record (one of the 40 can be replaced) and replaces the root, frozen, like `putEdge`.
`society/secret.ts` is the layer above, and the only caller:

| Name | What it does |
|---|---|
| `addSecret(g, about, kind, v, holders)` | begins a secret and answers its id (`secret:<n>`, the next after the largest held), or `null`: a life that is not stamped, an `about` that is not the player (a record about an earlier player is inert, X28), a kind other than `affair` and `debt`, a severity that is not a whole number from 1 to 5, no holder who is a living person of the game (6 are kept, each once), the same kind with the same holders begun already this year, or 40 held none of which is spent. A **spent** secret is dropped to make room: one about an earlier player, or one that leaked `LEAK.spentAfter` (10) years ago or more, inert ones first and then the longest gone |
| `secretsOf(g)`, `readSecret(g, id)` | the records in number order, with their ids; pure, total, a hostile record reads as none |
| `leakOdds(g, holder)` | the odds that a holder tells in a year, below |
| `leakPass(g)` | the yearly pass, below |
| `betray(g, key, severity)` | the cost of a betrayal and the secret a found affair begins: section 17 |

**The odds.** `0.02 + 0.10 x resentment + 0.06 x (1 - honesty) + 0.04 x temper x resentment`, with resentment the `s` of the edge
`holder > player` over 100, honesty the honesty axis over 100 and temper the other end of the steadiness axis over 100 (the seam, `society/seam.ts`).
The temper term only counts when there is a grudge to spill, so a holder who is honest and holds none leaks at **0.02, whatever their temper**
(under 3% a year); the odds never pass **0.22**. Honesty from a person's words is cut to 5..95, so only a person with a Met record reaches 100.

**The pass** runs inside the one `society.acts` entry, after the debts (`society/module.ts`), so it is stamped by `social.ay` like the rest. For
each secret that is about the player, has not leaked and began in an earlier year, each holder in the order of the list (a holder who is dead, a
pet or not in the game does not roll) draws once from the stream `social`, `actRoll(g, 'leak', '<secret id>|<holder ref>')`; the first holder
under their odds who has someone to tell leaks it. A `debt` secret is moot while the player owes nobody a loan (it reads the record of section 14,
`debtsOf`). Nothing but that stream is drawn: `g.rng` and `g.nextId` are untouched by the decision.

**A leak** (`society/gossip.ts`): the holder tells at most 2 people, their best-liked contacts, and each of those at most 1 more, then it stops
(hop cap 2, so 4 people at most, each once, never a holder). The contacts of a person are the living people of the game they know (the same
circle as the favors: family, friends, or one school or firm), best liked first: the `f` of the edge `person > contact` when the map holds
it, else a base of 55 for family, 50 for friends and 45 for a school or firm, ties by person key. (The model has no other acquaintance graph, so
without an edge the order is the key order.) `spread` itself takes the lists as an argument, so the cap holds for any graph, a hostile one
included. Everyone told gets the memory `heard_gossip` (weight 1, 2 or 3 by severity; the effect of the old `gossiped_about_me` row, under a name that says they heard it) and a relationship hit of `3 x severity` as an
`offence` through the shim, bounded so that no person loses more than `LEAK.damageYear` (30) points to leaks in one pass whatever the number of
secrets (40 of severity 5 with 6 holders each cost a person 30, not 600). The holder who told pays too (`betray`, section 17), out of the same
allowance of 30. The secret's `p` is set to the year **first**: the secret leaks at most
once, the hits apply once for each (secret, person), and the pass skips a record whose `p` is set.

**What the player hears.** One line of `LEAK_LINES` (four phrasings, each names the holder and the first person told) in the life log, and the
notice `Word Got Around` once in `PACE.askGap` years (the kin family `leak`, `pop.kin.leak`; at most `PACE.askLife` in a life): a notice, not a
choice, so it spends no family act (X40). The fact `social.leak` goes on the bus, subject the player's ref, other party the holder's key, `v`
the number told, severity 40, 53, 65, 78 or 90 for a secret of 1 to 5, at most 8 a pass; the module declares it in `facts`, and the bus drops a
kind nobody declared. Reputation by group, leak timing and scandal stories are R5's.

Tests: `test/social-gossip.test.ts` (the record, the cap, the spread over 10,000 simulated leaks, the odds, the pass, the fact),
`test/social-act-auth.test.ts` (the leak and `addSecret` in the states that block them). Betrayal, reconciliation and mentorship are section 17.

## 17. Betrayal, reconciliation and mentorship (R4-E11, D.4, X27, C39)

Three small things that lean on the edges. None draws a number of its own and none books money.

**Betrayal.** `betray(g, key, severity)` in `society/secret.ts`, exported by the door (`society/contract.ts`, C39). The key is an edge of the
current player and the severity a whole number from 1 to 5.

| Key | Who did it | What is written |
|---|---|---|
| `person > player` | the player (an affair found out) | the pinned memory `betrayal` on the person's edge toward the player; the person's relationship falls as an `offence`; the person becomes the holder of a new secret about the player, an `affair` of this severity, begun this year |
| `player > person` | the person (a holder who told) | the pinned memory `betrayal` on the player's edge toward the person; the person's relationship falls as a cooling (`decay`: it adds no resentment, so telling does not make a holder likelier to tell the next secret) |

The relationship falls by `15 + 5 x severity`, 20 to 40, through the shim. The memory's weight is 1 for a severity of 1 or 2, 2 for 3 or 4 and
3 for 5. A betrayal is one event a year on an edge: `remember` makes the memory once for a (kind, edge, year), and only the call that makes it pays
the cost, so a second call the same year changes nothing, not even the secret (`addSecret` refuses the same kind, holders and year). A full table of
40 secrets leaves the secret out and keeps the memory and the cost. Nothing is written for a life that is not stamped, a player who is dead, a
severity that is not 1 to 5, a person who is dead, a pet or not in the game, or a key that is not an edge of the player (another owner's, one
between two other people, one with the player at both ends).

Two callers. The leak (section 16) betrays the holder who told: the same call with the key `player > holder`, the cost held to what is left of the
holder's 30 points for the pass (`LEAK.damageYear`, shared with the people told), so no person loses more than 30 to leaks in a pass, however many
secrets they hold or are told. `love.ts` calls it for a hook-up behind a partner's back that the partner finds out (severity 4), through the door
only. The old lines there stay as they were: the hit of 25 to 45 and the memory of weight 3 are this event's cost, so `betray` finds the betrayal made
and pays nothing more, and adds the secret alone; a life that is not stamped is untouched and a stamped one plays the same numbers (the stamped replay
of `test/love-parity.test.ts`). A defaulted loan keeps the memory `loan_unpaid` of section 14; it does not call `betray`.

**Reconciliation.** `reconcileOdds(g, p)` in `society/reconcile.ts`, also through the door, is what the society side adds to the odds of a
heart-to-heart with a relative who is cut out or estranged: `clamp(0.0015 x max(0, o), 0, 0.15)`, with `o` the obligation of the edge
`person > player`. What raises `o`: a brokered peace (section 13, 20 a time) and the mirror of a debt the person owes the player. It is 0 on a life
that is not stamped, for a pair with no edge, with no obligation or with one owed the other way, and for an `o` that is not a number; it is 0.15
at 100 and never more. It signs for `Pick<GameState, 'world' | 'character'>`: the edge needs the player's ref, which is made from the character.
It does not repeat the memory term (`peaceOdds` already holds what the person remembers, section 11), and it cannot call the will's `peaceOdds`
(that needs the whole state, and a `society->events` import is not an approved pair). `events/will-amends.ts` adds the two at both of its sites,
the odds the row shows and the odds the roll uses (`talkOdds`): `clamp(peaceOdds + reconcileOdds, 0.05, 0.85)` when the addition is above 0, else
`peaceOdds` itself, so a life that is not stamped, and a stamped pair with no obligation, roll exactly as before.

**Mentorship.** `society/mentor.ts`. A younger relative (a sibling, half or step sibling, child, step child or grandchild) or coworker of 14 to
40, with a career to measure (`npcLife`), can be taken under the player's wing from the person's page (the row `Take {name} Under Your Wing`,
`social.mentor`, a greyed-out row with the reason once 3 are taken, and an info row once the person is one). The enrolment is the SocialAct
`mentor.enrol` (blocked for a life that is not stamped, a player who is dead or under 16, a person who is dead, a pet, estranged or not in the
game, not younger than the player, under 14 or over 40, already enrolled, or a fourth): it writes the memory `mentored_me`, a log line and a
notice, and `enrolMentor` then writes the baseline pair `[ref, skill]` into the `social` shard (`ms`, 3 pairs at most, `patchSocial`).

Each year `mentorSettle` runs inside the one `society.acts` entry, after the leak pass (`close` 6; the NPC year it measures ran inside
`relationships` at life 40, before the close phase, and there is no second aging entry and nothing in the `society` phase). For each pair it takes
the protege's gain since the baseline, adds **0.15 x the gain** (never negative, never past a skill of 100) through `npcLife` and `saveNpcLife`
(reached through the seam, so `society->life` stays at two files), and rewrites the baseline to the skill with the bonus. A protege who is no longer
one (dead, a pet, estranged, over 40, gone from the game, no life) leaves the baseline. So the bonus is never taken on a bonus, a year with no gain
or a fall adds nothing, a second settle in one state adds nothing, and over any run of years a mentored protege is at most 1.15 x the unmentored
gain ahead of the control. A baseline that is missing or hostile reads as none (the shard's reader keeps three valid pairs, each person once, a
skill held between 0 and 100). `npc-lives.ts` is not edited.

Tests: `test/social-reconcile.test.ts` (reconciliation, the peace odds of the will, `betray`, the callers), `test/social-mentor.test.ts`
(enrolment, the settle, the 40-year probe, the baseline, the menu row), `test/social-act-auth.test.ts` (the enrolment and `betray` in the states
that block them).

## 18. The feud ladder (R4-E12, D.4, X29, X31, X40, X54, C12)

What a grudge becomes when nobody stops it. A feud is the rung `q = [rung, since, cause]` of the edge `person > player` (the only thing it saves):
rung 1 cold, 2 gossip, 3 sabotage, 4 legal. At most 12 are live in the map (`EDGE_CAPS.feuds`); Life's strife edges between two relatives carry a rung
too and count toward the 12 (X31, C12), but `stepFeuds` plays only the feuds that are the player's and only cools the others (below). The will keeps its own ladder
(`events/will-feud.ts`): a pair whose person is cut out or estranged under the will (`cutOff` of `society/favor.ts`, the raw record) belongs to it, so
this ladder neither starts a feud on such a pair nor plays one that is already there (it ends quietly, handed back to the will).

**The step.** `stepFeuds(g)` in `society/feud.ts` is the last step of the one `society.acts` entry (`close` 6, after the debts, the leak and the mentor):
the live feuds first, in key order, then the cooling of the strife rungs of others (below), then the new ones, so a feud that ends frees its slot before a new one asks for it. For each live feud not yet
stepped this year (the tick, below):

| Case | What happens |
|---|---|
| the person is not in the game | the feud ends, quietly |
| the person died | the feud ends with a line of `FEUD_GONE_LINES` and the fact |
| a pet, or the will has come to own the pair | the feud ends, quietly |
| resentment under 25 for the second year in a row | `Feud Cooled` (notice, weight 1: it folds into the log), the feud ends, the fact |
| rung 1, cold | the person's regard falls 2 a year, as a drift (`decay`: it adds no resentment); the status row `feud.cold` speaks the year the feud starts and after 3 quiet years |
| rung 2, gossip | one leak: the two best-liked contacts of the person and one more through each (`society/gossip.ts`, hop cap 2) lose 3 points as an offence and get the memory `heard_gossip`; no person loses more than 9 to the gossip of a pass whatever the number of feuds; a line of `FEUD_GOSSIP_LINES` |
| rung 3, sabotage | happiness down 3 and job performance down 2 (never below 0), no money, **once a year in all** however many feuds are on this rung (the first takes it, the others say their line); a line of `FEUD_SABOTAGE_LINES` |
| rung 4, legal | the suit is decided: the fee, a line, the settlement (below) |

Then, for rungs 1 to 3, the rise: with the roll of `feud.up|<key>` under 0.25 and resentment at least `40 + 10 x rung` (50, 60, 70) the rung goes up.
A rise into 3 or 4 says the fact `social.feud` and asks the player (`A Falling Out`, below). A rung that was raised this year is not played until
next year, so rung 4 is a year in which the player can still answer, and the suit is decided in the next step. The fastest feud is 4 years, from the
cold year to the suit; the resentment that keeps a feud going also fades by a tenth a year (the edge step), so most cool before they get there.

**New feuds.** A person with an edge to the player is asked when resentment is 45 or more, the edge holds a memory of `betrayal`, `loan_unpaid` or
`cut_from_will` from the last 5 years (younger than 5: the year of the memory and the 4 after it; a memory dated after this year is not read), the
stamp `Edge.c` is not from the last 5 years, the person is alive, not a pet and not the will's, and fewer than 12 feuds are live. The biggest
grudges are asked first (resentment, then key). The chance is `0.10 + (s - 45) / 200` a year (0.10 at 45, 0.375 at 100), drawn from the stream
`social` as `feud.start|<key>`. A new feud is cold, carries the cause of its trigger and is not played in the year it starts.

**The cause byte.** The model keeps three numbers for a feud and reads the third as a code from 0 to 255, so `q[2]` holds three things (`packCause`,
`unpackCause`, `tickOf`): bits 0 to 2 the cause (0 none, 1 betrayal, 2 loan_unpaid, 3 cut_from_will), bits 3 and 4 the calm years (0 to 3), bits 5 to
7 the tick of the year the feud was last stepped (`1 + year mod 7`, never 0). The tick makes the step idempotent in a year on its own, whatever the
stamp of the entry says: a second call finds every feud already stepped, and the new feuds are the same ones because every roll is the stream's. A rung
written by another task (the strife edges write `[1, year, 0]`) is a feud with no cause, no calm years and no tick, stepped at its first chance when
it is the player's (an edge `person > player`) and cooled when it is not (below).

**Strife rungs of others** (the whole-diff review). A strife edge `a > b` between two relatives, neither the player, carries a cold rung that counts
toward the 12, and nothing played or ended it: `stepFeuds` reads only the edges `person > player`, the edge step keeps an edge with a rung (it is bound),
and the hand-over removes only the late player's own edges. A reading with 4 cut-out relatives and 3 favored each wrote all 12 rungs, and they held every
slot of the map for the rest of the lineage: the player could never start a feud, and `familyLive` kept one of the year's three family choices reserved
for a quarrel the player has no part in. So `coolStrife` (after the live feuds, before the new ones) ends such a rung quietly, with no notice, line,
fact or stamp, and leaves the edge as it is: at once when either person is dead, a pet or no longer in the game, and by the rule of the ladder when
resentment is under 25 for 2 years in a row (the calm years sit in the same cause byte, and the tick keeps the count to once a year). A rung whose
grudge is 25 or more is written nothing. The edge step fades a grudge a tenth a year and a reading writes at most 50, so a rung is over within about 9
years. A rung on an edge that starts at the player is not a quarrel between two relatives and is left alone. The probe `strife-edges` presses on it at
100 times: with the 12 rungs of a reading live and 100 people at resentment 100 against the heir, the heir's own feuds start within 40 years and the map
never holds more than 12.

**The stamp `Edge.c`.** The year of the last call-in on the edge (section 13). This task also writes it for a peace tried (it holds the next try off 3
years, the cooldown of the favors) and for a settlement or a peace made (it holds a new feud off 5 years). The favors read it the same way, so a pair
that has just settled can't call in a favor for 3 years, which is the intent. A stamp dated after this year is not read.

**The legal fee** is priced by the object and never by the payer's wealth (design P9, 14.2): `1.5 x typicalIncome` for a first suit and `2.5 x` once
the feud has run 4 years, so never above 3 x (`typicalIncome` is the P7 leaf, reached through `society/seam.ts`), held to **a quarter of the payer's
cash** as an affordability guard only; the suits of one year take a quarter of the cash between them (the cash the pass began with). The only thing about the payer that is read is the cash: net worth times 100 gives the same fee, and an
asset-rich, cash-poor payer pays little, never a negative balance. It is booked through `cash.moveCash` from the player to `pool:legal` under `legal`,
once, by the token `feudToken` (`feud.suit:<year>:<8 hex>`; a replay books nothing). A payer with nothing pays nothing, the line says the suit was
settled, and the settlement still happens. **The settlement:** resentment down 30 on the person's edge and, if the model holds one, the player's edge
to the person; the feud ends; `Edge.c` is stamped; the fact of the end.

**`A Falling Out`** is a choice, queued by a rise into rung 3 or 4: *Try to make peace*, *Hold firm*, *Pay it off*. It is one of the year's three
family choices (`useFamilyAct(g, 'social')`) and the year's one scene of the will's ladder as well: it is queued only if `will.scene` is unspent and
a family choice is left, and it spends both, so a year has one popup across the two ladders. It waits `PACE.askGap` years in the family `pop.kin.feud`
and is not deferrable at the year close. The answers re-read the state they are answered in (a forged or stale one changes nothing):

| Answer | What happens |
|---|---|
| peace | the same roll as the row below; a yes ends the feud, a no costs a point and holds the next try off |
| firm | resentment up 5, the person's regard cooled by 2; the feud goes on |
| pay | `payoffFee`: one typical income, a quarter of the cash at most, through the ledger under `legal` (token `feud.pay`); then the settlement. With nothing to offer, a point is lost and the feud goes on |

**Make peace.** `peaceAct` (id `feud.peace`) is a SocialAct on the edge `person > player`, the row `Make Peace with {name}` (`social.peace`, on the page
of a person in a feud, whatever the person feels, greyed out with the reason) and the answer *peace*. Odds: `clamp(0.22 + 0.3 x f/100 - 0.3 x s/100 +
memoryOdds(peace) + reconcileOdds, 0.05, 0.85)` from the pair edge, the shape of the will's `peaceOdds` without its temper and will terms
(`society/` may not import it; a pair the will owns keeps `peaceOdds` through `events/will-amends.ts`, so the act refuses it). A yes ends the feud,
makes the memory `reconciled` (weight 2), warms the person by 6, stamps `c` and says the fact of the end; a no costs a point as an offence and
stamps `c`, so the next try waits 3 years. Blocked for a life that is not stamped, a player who is dead or under 16, a person who is dead or a pet,
a pair the will owns, a pair with no feud and a try in the last 3 years.

**The fact `social.feud`** (X29): subject the player's ref, other party the person's key, `v` the rung (3 or 4, or 0 for an end), severity 65, 90 and 40.
The module declares it. At most 8 a year (`g.yearActions['feud.facts']`). The facts store keeps one row for a kind, year, subject and other party, so a
rise and an end of the same person in the same year are one row, the first.

**Text.** Four lines a rung, each naming the person (`FEUD_GOSSIP_LINES`, `FEUD_SABOTAGE_LINES`, `FEUD_LEGAL_LINES`; `FEUD_SETTLED_LINES` for a payer
with nothing and for *pay it off*; `FEUD_PEACE_LINES`, `FEUD_COOLED_LINES`, `FEUD_GONE_LINES`) and the status row `feud.cold`: a feud has about 3
tellings. Luck is the stream `social` (`docs/STREAMS.md`); the lines come from the text kit's own stream. Nothing here draws from `g.rng`.

**Ceilings.** Live feuds 12 (100 people at resentment 100 hold at 12); the fee a quarter of the cash, in all for a year, and never above 3 typical incomes
for one suit; sabotage 3 happiness and 2 performance a year in all; gossip 3 a person told and 9 a pass; facts 8 a year. Tests: `test/social-feud.test.ts` (starting, the rungs, the rise and the
cooling, the scene, Make peace, the fact, the fee, the 100 times and 60-year probes, purity), `test/social-act-auth.test.ts` (Make peace and
`stepFeuds` in the states that block them).

## 19. Staff loyalty (R4-E13, D.4, X1, X22)

What the people who run a company feel about the player, and the year-end rule that lets them go (`business/staff-loyalty.ts`, a leaf of the business
cycle: it imports no other business module at run time). A key person (`KeyStaff`) and a hired CEO (`Manager`) are not people of the game, so their edges
name them by a ref of their own: `staff:<ks id>` and `mgr:<asset id>` (a Manager has no id; the company is what it follows). Every edge is `ref > player`,
like the edge of a relative. `staffRef(s)` and `mgrRef(a)` make the refs and answer `pool:other` for an id that is no name.

**The year end**, `staffLoyaltyYear(g, a, b)`, called by `staffTurnover` (`business/staff.ts`) on a stamped life; an unstamped life keeps the old rule
(morale under 30 and a 35% roll from `g.rng`) byte for byte. In order: a manager edge that was written for another manager is reset; a staff edge whose
person is in no company any more drops; each key person gets two numbers from the stream `social` (`outcomeStream(g, 'social', year, 'staff|<id>')`). The first
decides a quit, with odds `clamp(0.04 + (35 - morale)/150 + s/500 - (f - 50)/600, 0, 0.6)`, where `s` and `f` are the resentment and the affection of the edge
(0 and 50 when there is none). The second decides a poaching, for a person of skill 70 or more who is resentful (`s` 40 or more) or paid under the going
rate, with odds `0.03 + 0.10 x s/100 x (1 - honesty)`. A person who quits leaves the old line and their edge goes; a person who is poached leaves a line of
four phrasings and a plain edge that holds `poached_me`. The rule is idempotent without a stamp of its own: its two numbers are a function of the year and the
person, and a person who left is gone from the list.

**What the player does**, written by the callers: a hire leaves `hired_me` (weight 2), a raise `gift_given`, a yell `told_bluntly` (3, with resentment), a
firing, a walk-out or a lawsuit drops the edge, and a hired CEO who is poached leaves `poached_me` on `mgr:<asset id>`. Wages and severance stay on the
company's books (`firmCash`, `payroll`); nothing here books money. A staff edge is bound (`k: 'staff'`) while the person works there, so a hire into a map of
1,200 bound edges simply has no edge and the rule reads that person as resentment 0 and affection 50. Both odds are clamped, so 100 times any input gives the
same ceiling.

## 20. The acceptance (R4-E15, D.12, X14, X30, X50, X56)

Six files hold the track to the plan's lines. None of them is `// ci: fast` but the scan, the purity test and the ceiling test.

| File | What it proves |
|---|---|
| `test/social-acceptance.test.ts` | the 120-year probe of three stamped lives; determinism; the yearly step at the caps; the size of a save; the sid-born debtor; marriage for wealth; the old-save matrix; twelve hostile worlds; the hand-over; every yearly entry twice |
| `test/social-accept-kit.ts` | the lives (a family founder, a romantic life, a rich life with a will fight), the scripted caller and the audit that runs after every year |
| `test/social-money-scan.test.ts` | the token scan of the files of the track (X50), with three self-tests and a non-empty list |
| `test/edge-purity.test.ts` | every menu and reader of the track on a state frozen all the way down with a g.rng that throws |
| `test/social-ceilings.test.ts` and the seven rows of `test/ceiling-kit.ts` | the ceilings below, at 1, 10, 30 and 100 times |
| `test/social-act-auth.test.ts` | the table of authorization (E10a to E13), run by this task's command (invariant 4) |

**The probe.** Each life is played 120 years, one year at a time, with a scripted caller between the years that does what a player and the popups do: asks for
favors, loans and vouches, betrays and keeps secrets, tries peace, takes a mentee, marries, bears children, divorces, has flings, hires a child into the company,
writes one out of the will and hands the life over (twice by age and again when the player dies). Twice a life is flooded with more edges, memories, debts, feuds,
secrets and talk records than the caps hold. After every year: `worldProblems` is empty, `checkLedger` holds, no number is not finite, the world is inside its
budget, the edges are inside their caps as stored, and `edge.f` equals `Person.relationship` for the current ego. A kin record that still carries a spouse or
heir flag after the year's sweep may show for one audit and no more. At the end the ledger has strict drift 0.

**What the probe found.** The hand-over left the edges that start at the late player. The late player stays in the list as the heir's dead parent, so an edge
`late player > heir` (a loan the heir once had repaid, a leak the heir told) read as the parent's edge to the new ego with an affection that was not the
parent's relationship. `carryEdges` (`modules/heirs.ts`) now removes every edge of the late ego, the ones that end at them and the ones that start at them.

**Determinism.** A life continued from year 60 by a `structuredClone`, by a JSON reload through the save loader, and (for the romantic life) from a copy of its
first year, ends at the very JSON of the original. A Time Machine jump to year 60 keeps the rolls of the stream `social` for the years that ended before it and
re-rolls the year it lands in and every one after it; the fork plays 20 years on with every check of the audit holding.

**The year at the caps (X56).** A stamped life of 40 holding 1,200 edges (4,000 memories, 40 debts, 12 feuds, 120 edges with talk, 40 secrets of 6 holders) and a
Met store of 400 records, 160 of them of the kin kind, ages up in the budget of `test/save-perf.test.ts` (160 ms, and 200 ms for the clone, the age-up and the
encode, both times the machine factor). Every edge holds resentment, so the step rewrites all 8 chunks `e.edge.0` to `e.edge.7` each year. Measured on a busy
machine (factor 2.5): the year takes 224 ms against 31 ms for the same life with no web, so the web at its caps adds about 75 ms on the reference desktop.
That figure hid a cost: the factor of a busy machine stretched the budget, and on a CI runner (factor 1.28) the year took 223 ms against a budget
of 205. The step wrote its 1,200 faded edges with 1,200 calls of `putEdge`, and each call copied the 1,240 keys of the root; two thirds of the
year went there. Since CP4 the step makes one `putEdges` call (section 6), and the same life measures 56 ms against 17 ms with no web on a machine
of factor 1.91 (it was 131 ms): the web adds about 39 ms, and the clone, the age-up and the encode take 70 ms (they took 148). The save is the
same bytes. The
save of that life has a head of 26,170 characters, a world chunk of 395,939 (104,310 gzipped), eight edge chunks of 200,626 characters together, ten taps that write
no chunk, and ten Time Machine snapshots of ten years of it that take 764,837 characters, 51% of the localStorage budget and less than the 1,227,273 of v4.1.1.

**Across the two tracks (X14).** A sid-born debtor (a Met record, no Person) with an edge `person:<sid> > player` that carries a debt keeps its record, as a
record and not as a tombstone, through 30 years of the Met sweep of a played life, while 150 idle strangers around it are let go.

**Marriage for wealth.** Marrying an NPC with $50M and playing ten years does not make the player rich. A divorce pays from the ex's own cash (half the gap, 0.5 to
1 of it); a widowing inherits 0.7 to 1 of the estate the death turns to cash (cash and holdings less debt); in both the books balance and nothing is minted or
burned. 100 times the spouse's wealth raises what the rule allows at most 100 times and the gain stays under it. The gain is not linear in the spouse's wealth
(it is the gap), so the test bounds it by the rule and not by 100 times the small gain. Wealth that is only shown, behind a prenup, moves nothing.

**The old saves.** Every `save-*.json.gz` loads and plays five years with no `edges` key, no `social` key and an unstamped life; the 22-exes life keeps its debtor
and its cut-out child. Twelve hostile `edges` and `social` worlds are put into the oldest fixture and played three years: a stamp that is not a valid one is no
stamp and the life plays as it always did (the world names it as a `social:` line and leaves the edges beside it as they were loaded); a valid stamp with a hostile
map ends with a map inside its caps and the books balanced.

**Ceilings.** Seven rows, each probed at 1 and 100 times (and 10 and 1,000 in the nightly): `edge-caps` (1,200 edges, 40 debts, 12 feuds, 120 edges with talk, 40
secrets of 6 holders, 24,000 nodes; a world full of bound edges refuses a new one), `memory-total` (25 points a memory, 8 an edge, 4,000 in all), `loan-cap` (2
typical incomes, a quarter of a small purse, 3 open loans, 40 years of default under 3 times the principal), `favor-callin` (one call-in a person in 3 years, 2
points of regard, no more than 100 owed), `gossip-hops` (2 hops, 4 people told, 30 points a person a year), `feud-live` (12 live feuds, a suit at 3 typical incomes
and a quarter of the cash at most, sabotage 3 happiness a year in all) and `mentor-gain` (3 proteges, 15 percent). At 100 times the tightest case of each row is
exactly at its limit.

**Idempotence.** `stepEdges`, `yearlyActs` and each of its steps (`serviceDebts`, `leakPass`, `mentorSettle`, `stepFeuds`) run twice in the year they ran and in the
next change nothing the second time, and so does `staffLoyaltyYear`.

## 21. What the next task adds here

- R4-E16 flips the stamp (`social` at `default: true` with the 5.3.0 bump) and re-records the golden lives; nothing in this note changes, but every test that
  asserted an unstamped state on a `createNewLife` life gives the flag explicitly.
