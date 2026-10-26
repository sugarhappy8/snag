# Social: edges, memories and acts

How people feel about each other, and what they remember, as the engine keeps it (R4, v5.3.0). This note starts with the
**edge model** (R4-E6a): the record, the 40 memory kinds, the caps and the rules of the normalizer. R4-E6b adds the writer, the
stamp and the slice; R4-E7 the mirror and the yearly step; the later tasks of the Edges and acts track add the acts. Until a
section below says otherwise, `docs/superpowers/plans/2026-10-26-r4-v5.3.0/00-crosscheck.md` section 3.1 is the authority for every
name and signature. Plain hyphens only: no long dashes anywhere in this file.

Nothing in this part is stored or written yet. `world/edges.ts` and `world/edge-memory.ts` are pure code in layer 2 (`world/`): no
`g.rng`, no clock, no write, no shard registered. A life is not touched by them.

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
of a person who is not a pet whose `f` differs from `Person.relationship`. E6b wires it into the world invariant.

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

## 6. What the next tasks add here

- R4-E6b: the writer `putEdge` and `remember`, the `social` stamp and the `world.edges` entity slice.
- R4-E7: the mirror of `Person.relationship`, the yearly step (resentment x0.9, memory decay, orphans) and the stamp in `createNewLife`.
- R4-E8 to E16: memory writers and odds, the family-act budget, the acts, loans, secrets, feuds, staff.
