# The world

Since R2 (v5.0.0) the game keeps a small, bounded, saved model of the people, companies and homes around the player, next to the
books of `docs/LEDGER.md`. It lives in one place, `g.world`. In R2 it only indexes: it names who and what exists and who owns what,
and nothing in the simulation reads it yet, so no life changes. The later releases build their world steps on it. The code is
`src/game/world/` (never a `src/game/world/index.ts`: `./world` is the file `src/game/world.ts`, the countries and the name pools)
and `src/game/kernel/ids.ts`.

## g.world

- `GameState.world?: WorldState` is `{ v: 1, y?, ledger?, people?, firms?, homes?, holdings?, lod?, ...other shards }`. `v` is the
  root's version, `y` the year the world last stepped (an integer from 1900 to 100000, or absent).
- Absent reads as empty. `readWorld(g)` is pure and returns a frozen `{ v: 1 }` for an absent, garbage or wrong-version `g.world`, so
  a save from before R2 needs no migration. `ensureWorld(g)` is the writer: it creates `{ v: 1 }` and drops garbage on the first
  write, never on a read.
- A shard is a named part of the world. `worldShard(g, name)` is pure and reads it through the shard's registered reader (cached per
  saved object), so a hostile shard reads as a valid one. `shardNames()` lists the registered names, sorted.
- Every shard registers itself at module load with `registerShard(name, { normalize })`. A name is 1 to 16 lower case letters and
  digits, never `v` or `y`. The same definition twice is fine, a different one for a taken name throws. `world/shards.ts` is the
  registration hub (it imports each shard module for its effect); `world/state.ts` imports no shard module, so the root can never be
  part of a cycle with the shards it holds. A test or module that calls `normalizeWorld` or `worldShard` imports `world/shards`.
- The shards of R2: `ledger` (the books, `kernel/ledger.ts`), `people`, `firms`, `homes`, `holdings` and `lod`. The module registry
  of the Kernel track adds `facts` (the facts the bus recorded, at most 400, `world/facts.ts`); it joins the hub with one line.
  R3 adds `frontier` (how far the world's research is ahead of the calendar path, `world/frontier.ts`, see "The frontier" below).
- A shard is written by replacing its root (`ensureWorld(g).people = { ...next }`, or `commitShard`), never by editing it in place,
  because the save layer shares each shard root between drafts, frozen. The one exception is `ledger`, which every booking edits in
  place and which the save layer therefore treats as a core slice. Every writer has a test that runs it on a state whose shard roots
  are deep-frozen one by one.
- Nothing under `world/` or `kernel/` draws from `g.rng`, `Math.random` or a clock (`world/budget.ts` only measures time). The one
  luck is `seededEntity`, which draws from the named stream `stream(g, 'lod', ...)`. `test/ledger-guards.test.ts` and
  `test/world-streams.test.ts` guard both.

## Ids and EntityRef

- An `EntityRef` is `<kind>:<key>`: `person:p42`, `firm:a7`, `home:a3`, `gov:us`, `pool:hh:us`. The kind is 2 to 16 lower case
  letters and digits. The key is up to 52 characters of letters, digits, dot, underscore and dash, and may hold single colons.
- `ref(kind, key)` builds one for code and throws a `RangeError` on a bad kind or key. `parseRef(x)` splits at the first colon and
  returns `null` for anything else, and `isRef(x)` agrees. Saved data uses `parseRef`: a string that fails it is dropped, never trusted.
- A person is `person:<data.sid>` when the record has a text `sid`, else `person:<id>` (`personRef`), the same account the ledger
  uses. R4 introduces `sid`; until then it is the id. A company is `firm:<asset id>` (`firmRef`), a home `home:<asset id>`
  (`homeRef`), the player `person:<character id>` (`playerRef`).

## The three levels

How much of the world the game keeps by name, in `world/lod.ts` and `world/caps.ts`:

- Named. A row in an index shard, capped. The `Person`, `Asset` or old NPC firm stays where it was; the row says the world knows it.
- Pooled. Only counted: the `over` of each index shard (copied into `lod.pooled` by the sweep) and the pool accounts of the ledger.
- Seeded. A stranger that is a pure function of the life and an id (`seededEntity`). It exists nowhere until something touches it, and
  only `promote` makes it persist. Strangers persist only when touched.

The caps (`LOD_CAPS`, each an entry of `test/ceiling-list.json`): 400 people of which 80 intimate, 60 firms of which 20 full, 150
homes, 600 job slots (no shard yet). The holdings table keeps at most 1,200 rows. In R2 the index names the 80 intimate people, the
20 most valuable companies (the other firm rows are lite rows the sweep keeps) and the 150 most valuable homes. A player with more
than 20 companies has the 20 most valuable named and the rest counted in `over`.

## The indexes

- `people`: one row `{ id, seen }` for each of the 80 who matter most, ranked by owner of an old NPC firm, then closeness, then id.
  Pets are never indexed.
- `firms`: `{ id, form, owner, seen }` for each of the 20 most valuable companies, own companies before old NPC firms. A player
  company is an Asset of kind `business` (form `biz`); an old NPC firm lives inside its owner's `data.npcCompany` (form `npc`) and is
  indexed in place: read raw, never cloned, never rewritten.
- `homes`: `{ id, owner, seen }` for each house the player owns.
- `holdings`: rows `[owner, asset, share]` sorted by asset then owner, every asset summing to 1 (the part nobody is named for belongs
  to `pool:outside`), shares in whole millionths. Built from the records as they are, read raw.
- `lod`: `{ v, y, pooled: { person, firm, home }, demoted }`, the sweep's counts.
- `seen` is the last year the record was observed. A record that is gone leaves its row behind with its old `seen`, never later
  than last year, until the sweep lets it go. An index row never copies a record's fields.

## The invariants

`worldProblems(g, { live? })` (`world/invariants.ts`) is one pure function that names every way the stored world can be wrong, one
line each, "<shard>: <what>". The fuzz harness runs it after every step and again right after each hand-over to an heir; a probe or
a scenario test can run it on any state. It reads the shards raw, as they are stored, because a reader that normalizes would merge a
duplicate row and drop a bad one before the check could see it. It checks:

- the books: every problem of `checkLedger`, each line starting "ledger: ";
- the root: a v1 plain object, `y` a year;
- the three indexes and the holdings table: a v1 shard, a list of valid rows, one row for an id, at most the shard's cap of rows, and
  every asset in the holdings summing to 1 within 1e-6;
- the frontier (R3): a v1 shard of known fields, every row valid and in its caps, no lead over 12 years and no lead on an AI capability;
- the people of the game: unique ids and at most one living spouse;
- the index against the records, only when the world was stamped this year (or `live: true`): a row stamped with this year names a
  record that exists, there are no more fresh rows than the index may hold, and every held asset is in the firms or the homes index.

## Promotion and demotion

- `promote(g, kind, id)` names an entity. It returns false when the kind is full of protected rows. In R2 it moves no cash: no
  stranger holds any. A later release that gives a seeded entity an endowment buys it from the pool at `promotionPrice` and sells it
  back at `demotionProceeds`, so a promote and demote loop loses the spread.
- `demote(g, kind, id, why)` lets an entity go (`why` is `idle`, `cap` or `emigrated`) and folds its account, so the books never
  change: a person folds into `pool:hh:<country>`, a firm into `pool:firms`, a home into `pool:landlords`, a negative balance
  included. Emigration is the one exit that destroys money: a named person who leaves burns a positive balance (`burn:emigration`).
- `lodSweep(g)` is the yearly clean-up: idle rows (not seen for more than `DEMOTE_AFTER_YEARS`, 5, full years) and rows over the
  cap, in sorted id order, once a year. Protected means an obligation exists (a person of `g.people`, the owner of an old NPC firm, a
  holder in the table, a company or home whose record still exists, the player): a protected row is never let go by idleness or by
  the cap. The rows that survive depend only on the set of names, never on the order they came in.

## The budget

- A shard is bounded by its own reader (the caps above and the ledger's), and the whole world by `WORLD_NODE_CAP`, 40,000 nodes:
  `normalizeWorld` drops the largest shards first, ties by name, until it fits.
- The budget for a long life (`WORLD_BUDGET` in `world/budget.ts`): 25,000 nodes, 450,000 bytes of JSON and a world step of 60 ms.
  The 50-year probe in `test/world-budget.test.ts` asserts the nodes and bytes, and asserts the step at 240 ms so a loaded machine
  does not flake. The ledger's own part is at most 9,000 nodes and 600 flow rows.
- `worldBudget(g)` is pure and walks the whole world: per-shard nodes, the total, the bytes and a line for every breach. It is for
  tests, dev tools and the platform probe, never for a tap. `timed(label, fn)` adds the time of `fn` to a table that is never saved
  and never read by the simulation; `budgetReport()` and `resetBudgetReport()` read and empty it.

## The yearly step

`yearlyWorld(g)` is the one yearly hook of the world. In R2 it is last in `YEARLY_HOOKS` (`src/game/aging.ts`), after every yearly
module that books money or changes a record, so it reads the year's closing state; the ledger itself needs no hook, because it rolls
lazily on the first booking of a new year. When the registry of `src/game/modules/` takes over the yearly order, the world step stays
in the phase after every module that books money.

It is the last yearly hook, not the last thing that happens in a year. `ageUp` ends by queueing the year's events (flavor lines and a
random event), which `offline.ts` resolves on the spot, and then the player acts for the rest of the year. The shards are stamped
before that, so they are the frame the year closed on and not a live view of `g`: a world step of a later release (W1 to W6) that reads
them reads the opening frame of the next year's work. The library's year events add, remove and move none of the people, firms, homes
and holdings the shards list (`test/world-acceptance.test.ts` runs three lives and checks a fresh sync writes nothing after each year's
events); what the player buys, hires or founds shows in the shards at the next step.

- It is idempotent by the stamp `world.y`: a second call in the same year does nothing.
- It repairs a world that came in hostile (below), then calls `syncWorld(g)` (people, firms, homes, then holdings, each written only
  when it changed) and `lodSweep(g)`.
- It draws no luck and books nothing of its own, and it does not run when the character dies inside the hook loop.

## Heirs

`continueAsChild` clones the whole state, so `g.world` reaches the heir by clone. The people are rebuilt in the process, so it ends
with `syncWorld(heir)`: the heir's indexes and holdings describe the heir's records. The estate is booked through the ledger and the
dead player's account is folded, so the books still balance, and every shard of the old world is in the new one. Rows of records
that went in the same year (the dead player, a company the estate took) go back to last year, so no row says "seen this year" for a
record the heir does not have.

## Hostile loads

The save loader (`isLoadableGame`) bounds a save by 500,000 JSON nodes and does not look inside `g.world`; every reader normalizes.
So a hostile `world` is harmless in three steps: a reader never trusts what it reads (`worldShard`, `peekLedger` and each shard's
normalizer return a valid shard for any input, and a valid input comes back as itself); the first write replaces a garbage root
(`ensureWorld`); and the first world step replaces a world that holds a key the game does not know or more than 40,000 nodes with
what `normalizeWorld` makes of it. `test/world-acceptance.test.ts` loads twelve of them into the oldest fixture (a number, a string,
an array, a future version, a ledger of 50,000 accounts, a people shard of 500 rows, balances of 1e300 and minus 1e300, a ledger
whose identity is broken, holdings that sum to 7, an `lod` shard of strings, a `__proto__` key, an unknown shard that fills the
save): each still loads, three years play, the world ends under 40,000 nodes with no unknown key, and the books hold.

## The frontier

Since R3 (v5.1.0) `g.world.frontier` keeps how far the world's research is ahead of the calendar path. History up to 2026 is fixed,
so only the future is emergent: a push dated 2026 or earlier changes nothing. The code is `world/frontier.ts` (the shard, its one
writer and its reader), `world/frontier-fields.ts` (the fields), `world/frontier-step.ts` (the year), `world/frontier-terms.ts` (the
odds terms and the words) and the ceilings in `world/caps.ts` (`FRONTIER_CAPS`).

- A field is one of 20: the 12 future-facing wave kinds (`ai`, `chips`, `drug`, `space`, `ev`, `automation`, `quantum`, `security`,
  `fusion`, `neuro`, `drones`, `carbon`) and the 8 AI capabilities (`ai.language` to `ai.science`). The 8 `ai.*` fields are spill
  only: they give public research and rival pressure, to themselves and to `ai`, and never a lead. The table has room for 32 fields
  (medicine, software, weapons and finance wait for later releases and are rows of the same table).
- A field keeps `fold` plus its rows (the lead, in whole centi-years), `pub` (public research other researchers can use, in tenths
  of an odds point), `ly` (the year of the newest push), `yg` (what it gained in that year) and the newest rows `{ y, w, m, d, o }`:
  year, who (`you` or `rival`), market, centi-years added, origin hash.
- Nothing exists until a push. The shard is made by the first accepted disclosure, so an old save, and any life that never meets a
  push, has no `frontier` key and is byte for byte what v5.0.0 made.
- The one writer is `applyDisclosure(g, { field, year, size, origin, by, market?, shield? })`. It refuses, in this order, `bad` (the
  shape), `history` (a year up to 2026), `future` (a year after `g.year`: no foresight), `secret` (a secret is not disclosed) and
  `repeat` (the same year and origin is stored already), and a refusal writes nothing, not even a world. Otherwise it draws one luck
  number from the named stream `frontier` (`outcomeStream`, so a Time Machine jump re-rolls the year it lands in), adds one row and
  replaces the shard root. It reads no clock and never `g.rng`.
- Readers are pure: `readFrontier`, `frontierLead` (years, two places), `frontierSpill` (whole points), `frontierRows`, `lastPush`.
  An absent or hostile shard reads as an empty one and nothing is created.
- The year (R3-F2, `world/frontier-step.ts`, module `world.frontier`, aging phase `frontier`, order 10): `stepFrontier` fades public
  research to `floor(pub x 0.9)` and lets a rival follow each row of yours that has a lead, is one to four years old and is not
  followed yet, with a chance of 30% a year drawn from the named stream (`followDraw`). A follow marks your row (`f: 1`) and adds a
  rival row worth `floor(d / 2)` (at least 1, cut to the room the field has left). It is idempotent by `shard.y`, does nothing up to
  2026 or with no shard (so no `frontier` key appears), and logs nothing.

| Rule | Value |
|---|---|
| Lead from one disclosure | `size x 2.0` years (you) or `x 1.5` (a rival), times a luck of 0.8 to 1.2 |
| Most a field gains in a year, in all | at most 2 years a year (`FRONTIER_CAPS.yearYears`) |
| Most a field holds | 12 years (`FRONTIER_CAPS.leadYears`) |
| Spill from one disclosure | `1 + 5 size` points (1 to 6), so at most 6 points a disclosure (`FRONTIER_CAPS.spillPerDisclosure`), times the shield: open 1, patent 0.5 (the default), secret refused |
| Public research held | 18 points (`FRONTIER_CAPS.spillPoints`), fading 10% a year |
| Rows | 6 rows a market and 4 markets a field (24 rows); an older row folds into `fold`, so the lead is never lost |
| Fields | 20 today, 32 fields at most (`FRONTIER_CAPS.fields`) |
| State | at most 3,600 nodes for all 20 fields at their caps, 14% of the world's budget; a life with a few pushes is under 150 |

### Who writes

Every push goes through `applyDisclosure`, and no wave writer was edited to make one.

- A wave. `announceWave` (`business/tech-waves.ts`) is the one function every wave goes through (heavy, deep tech, workshop, race and
  effort). When it stores a NEW wave it calls `pushFromWave` (`business/frontier-waves.ts`): the field of the wave's kind, the wave's
  size, the wave id as the origin, a `rival` row for a rival wave and a `you` row for the rest. So there is one row for one wave, which
  is one wave for one origin. A repeat (the stored wave comes back), a refusal (the third wave of a year from the player's side, the
  65th stored) and a history kind (`cloud`, `smartphone`) push nothing. A wave dated 2026 or earlier pushes nothing either.
- A rival landing. `landRivalWaves` (the `techWaves` hook) announces a rival wave through `announceWave`, so it pushes a `rival` row in
  the field of its kind, in the company's market. Its seeded draw (`rivalWave`) is not touched, so the landings are the ones v5.0.0 had.
- Disclosed research. The port `business.discloseResearch` (`announceResearch`, wave source `effort`) is what the research domains of
  later releases call (the careers kit of R6, the war economy of R8, the show circuit of R9, and the Effort step wrappers that follow
  R3). In v5.1.0 nothing in the game calls it: the research that feeds the frontier today is the research that writes a wave, and
  every one of those writers (heavy R&D, deep tech, the Workshop race, a rival's landing) pushes through `announceWave`, as above. The
  product, operations and studio quotes only read the frontier. A size of 0.2 or more makes a wave, and the wave's push is the disclosure's (an `ai.<capability>` field
  narrows it, spill only). A smaller size, or a wave the rules refused, pushes by itself (`pushResearch`, origin `effort:<origin>`).
  A disclosure never counts twice.
- The year. `stepFrontier` fades public research and lets a rival follow, as above.

The waves have their own caps: one wave per origin (the wave id), at most 2 waves a year from the player's side (`MAX_PER_YEAR`, a
rival's do not count) and 64 stored.

### Who reads

All reads are pure: no write, no `g.rng`, the same number for the same source in the same year.

- The Workshop future race. `raceYear` (`workshop/market.ts`) is the deadline a rival gets there, rolled per family 10 to 40 years
  after the idea opens, less `raceShift`: the whole years of the lead of the idea's field, but never below `from + 10`, never above the
  old deadline and never before the year of the latest push. The 9 future ideas that write a wave have a field (`FUTURE_FIELD`); the 4
  novelties and every history idea are untouched. The idea screen says how many years the race was pulled in.
- The odds terms. `frontierTerms(g, field)` gives `spill` (the `public research` term, 0 to 18 odds points: the field's own pool and,
  for an AI capability, the `ai` pool), `rival` (the `rival pressure` term, 2 points for each rival row of the last 3 years, at most 8)
  and `lead`. Both terms are 0 with no shard, so the odds a research system had before R3 are the odds it has at default. The
  reasons carry the names in `FRONTIER_REASONS`. Effort migration passes the terms to `quote` and the fog layer wraps `frontierWords`
  and `fieldLine` ("on schedule" to "far ahead of schedule").
- Not read. The AI market (`capBest`, the board and `benchHard`) keeps its calendar drift in R3: 48 uses keyed by family, so the lead of
  `ai` is stored and unread. `heavyArrival`, `hasTech` and `techAdoption` are calendar pure and stay so.

### Bounded, hostile-proof and proven

- `normalizeFrontier` keeps only the known fields, whole numbers inside their ranges and valid rows (one for a year and an origin,
  oldest year first), applies the caps of 6 rows a market, 4 markets and 12 years of lead, forces the lead of an AI capability to 0,
  drops an empty field, and returns a valid shard as itself. The 2 years a year is the writer's cap: it cuts every push to the room the
  year has left, and `yg` remembers what the field gained, so folding rows away never gives the room back. `frontierProblems` names
  every way a stored shard is wrong, and `worldProblems` prints each as a "frontier: ..." line. `worldBudget` counts the rows against
  the caps.
- Load order: the shard registers itself when `world/frontier.ts` loads, and `world/shards.ts` imports it, like `facts`.
- The ceilings: `frontier-caps` and `waves-per-year` in `test/ceiling-list.json`, each with a probe row in `test/ceiling-kit.ts` that
  presses the inputs 100 times.
- The acceptance, `test/frontier-acceptance.test.ts`: the 200-year probe (2027 to 2226, five deep-tech companies, 20 disclosures of
  size 1 by both sides and 5 port calls a year) holds every cap above and the state at 3,600 nodes, books no money and leaves `g.rng`
  and `g.nextId` alone; a rerun, a clone and a JSON reload give equal JSON; an heir keeps the shard; every old fixture, a life to 2026
  and a modern life with no company have no `frontier` key; twelve hostile shards load into the oldest fixture and stay bounded.

## How to add a shard

1. A module with the shard's `v`, its reader (`normalize`: total, bounded, a valid input back as itself), its caps and its type in
   `world/types.ts`. A shard has its own `v`.
2. One line in `world/shards.ts`: `registerShard('name', { normalize: (raw) => normalizeName(raw) })`. An arrow, not the bare name.
3. Write it by replacing its root, only when it changed (`commitShard`), with a test on a deep-frozen shard.
4. Count it: add it to `capsOf` in `world/budget.ts` if it keeps lists, and keep the whole world inside the budget above.
5. Luck only from a named stream, with a literal tag and a row in the stream table; no `g.rng`.
6. Name it in this document (`test/world-acceptance.test.ts` fails until every registered shard is named here).
