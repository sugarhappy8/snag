# R3 plan, Frontier track: the world frontier, rival ledgers and the future race (track `frontier`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0` (`main` 85e147b, v5.0.0 = R2). Code read in `/Users/saeed/projects/anotherlife/wt/r3-release` on 2026-10-22; nothing was edited except this file. Every "modify" path exists today and carries a path:line; "create" paths do not. Plain hyphens only (no U+2014, no U+2013).

## 1. Track summary

**Item covered (1 item, 7 tasks).** C.6, the world frontier: the shard `g.world.frontier`, rival ledgers, disclosures and spillover, the wave rules (one wave per origin, two a year), history fixed, and the Workshop future race as a frontier crossing.

**The design in one paragraph.** The frontier is a small ledger per field (the 12 future-facing wave kinds plus the 8 AI capabilities). A field holds `fold` plus its rows = how many years the world is ahead of the calendar path (`lead`, 0 to 12 years, stored as whole centi-years), `pub` = public research other researchers can use (odds points, 0 to 18, fades 10% a year), and the newest 6 pushes per market (who, when, how much). Nothing exists until a push: the shard is created by the first accepted **Disclosure** `{ field, year, size, origin, by, market?, shield? }`, so every save, every life up to 2026 and every modern life that never meets a push has no `frontier` key and is byte-identical to v5.0.0 (this is how "the default seed reproduces today" holds). A disclosure dated 2026 or earlier changes nothing (history is fixed). Pushes come from three places and no existing writer is edited: every wave `announceWave` stores (heavy, deep-tech, workshop and race writers), every rival landing of `landRivalWaves` (its seeded draw is unchanged), and the new `effort` source (`discloseResearch`, for R6 and later domains). After a player push a rival follows within 4 years (30% a year, luck from the named stream `frontier`) and adds half the lead. Two readers use it: the Workshop race deadline (`raceYear` loses `floor(lead)` years, never below the era floor and never inside the year of the push) and the two odds terms "public research +N" and "rival pressure -N" (`frontierTerms`) that Effort migration passes to `quote`.

| Rule | Value | Task |
|---|---|---|
| Lead from one disclosure | `size x 2.0` years (player) or `x 1.5` (rival), times a hashed luck of 0.8 to 1.2 | F1 |
| Most a field gains in a year, in all | 2 years, 12 years (`FRONTIER_CAPS`) | F1 |
| Spill from one disclosure | `1 + 5 size` points (1 to 6) x shield (open 1, patent 0.5 the default, secret 0 = refused) | F1 |
| Public research held, fade | 18 points, x0.9 a year | F1, F2 |
| Ledger | 6 rows per field-market, 4 markets per field, older rows fold into `fold`, so `lead` is never lost | F1 |
| Rival follow | once per player row, 30% a year for ages 1 to 4, adds `max(1, floor(d/2))` | F2 |
| Rival pressure | 2 points per rival row of the last 3 years, at most 8 | F6 |
| Waves | one per origin (the wave id), 2 non-rival a year (`MAX_PER_YEAR`, tech-waves.ts:46), 64 stored | F3, F4 |
| State | worst case about 3,600 JSON nodes (20 fields x 24 rows), a life with a few pushes under 150 | F1 |

**Not in this track, and why.**
- The AI market (`capBest`, the board, `benchHard`) keeps its calendar drift. It has 48 uses in 8 deep-tech files, all keyed by the family string `fam`; a lead would change every cache key, and `ai-bench*.ts` and `deeptech-*.ts` are Effort migration's. The shard keeps `ai` and `ai.*` so the migration can read them; the 8 `ai.*` fields are spill-only (no lead).
- `heavyArrival` and `riseOf` (heavy-rd.ts:227, product-market.ts:223) stay hash arithmetic: catch-up lag by protection (patent 1.6, secret 2.5, open 0.5) is C.7.
- `hasTech`, `techAdoption` and `TECH` (history/timeline.ts:121, 172) are not touched: they are calendar-pure with 200+ call sites, and the fictional future techs they would serve arrive with the C.8 domains. The history tech tables are read-only here.
- Medicine after 2026 (`eraCureFactor`), weapons, software, finance, art, sport fields: C.8 and C.9. `FIELDS` has room for 32 and is the one table they extend. Protection mechanics (leaks, suits): C.7; `shield` exists on `Disclosure` and `secret` is refused.
- No new hub screen. The player meets the frontier in the Workshop race row, the existing rival-wave market news, and the odds reasons of migrated screens. Fog wraps `frontierWords`.

**What I measured** (read and grep, 2026-10-22).

| Fact | Value | Where |
|---|---|---|
| The `frontier` phase | exists and is empty: `YEARLY_PHASES.aging[2]` | kernel/registry.ts:34, docs/KERNEL.md:19 |
| Rival landing | `landRivalWaves`, hook `techWaves` firms 40, draw `rivalWave` = 1 year in 9 per core trade, only years after 2026 and only with a company | tech-waves.ts:383 and :216, modules/yearly-aging.ts:89 |
| Wave writer | one function, 9 call sites in 6 files (launch.ts:233, heavy-rd.ts:532, silicon.ts:127, deeptech-sim.ts:252/258/267, ai-bench-claims.ts:78, tech-waves.ts:400) | tech-waves.ts:122-153 |
| Future-facing kinds | 12 (ai chips drug space ev automation quantum security fusion neuro drones carbon): kinds with no `HISTORY_WAVES` row | tech-wave-data.ts:25-36, history/tech-waves.ts |
| Future race | 13 ideas, deadline `from + 10 + floor(roll x 31)`, 9 of them have a wave kind | workshop/market.ts:64-68, catalog.ts:302-315, tech-wave-data.ts:178 |
| Race readers | `raceOpen`, `isFirst`, `closeHistory`, the idea menu | market.ts:71-80, yearly.ts:105-114, menu.ts:121, 130, 152 |
| Domain pairs | `workshop->business` is 10 and held; workshop to `world/` (L2) is not a domain pair | test/layers-baseline.json:102 |
| Ports | 4 today | test/kernel-acceptance.test.ts:17, test/hub-entry.test.ts:57 |
| Shard rules | self-registers like `facts`, hub imports it, replace root, chunk `world` | world/facts.ts, world/shards.ts, docs/SAVE.md |
| Flags JSON | the 63-year wave run compares `JSON.stringify(g.flags)`; the frontier lives in `g.world`, so it stays equal | test/tech-waves-wiring.test.ts:93 |

**Line budget.** About 1,350 source lines against the roadmap's 2,000 (the AI and heavy ties are out, see above) and about 2,290 test lines.

| Task | Lane | Source | Tests |
|---|---|---|---|
| R3-F1 shard, fields, writer | main | 560 | 540 |
| R3-F2 yearly step, follows, registry | main | 200 | 330 |
| R3-F3 `effort` wave source and port | waves | 130 | 230 |
| R3-F4 pushes from waves and landings | waves | 150 | 340 |
| R3-F5 Workshop race crossing | race | 70 | 210 |
| R3-F6 odds terms and words | terms | 130 | 210 |
| R3-F7 acceptance, ceilings, docs | main | 110 | 430 |
| Total | | 1,350 | 2,290 |

**Acceptance owned, and the test that proves each** (R3 block, roadmap lines 226-242).

| Criterion | The part this track owns | Proven by | Task |
|---|---|---|---|
| 200-year probe at maximum inputs: no field above frontier plus headroom, no money beyond the market | the frontier half: lead, public research, rows, waves a year and the race deadline stay in their caps at 100x; the frontier books no money. The `k` and knowledge halves are Effort core's (C.12) | `test/frontier-acceptance.test.ts`, ceiling rows `frontier-caps` and `waves-per-year` | F1, F7 |
| Spillover at most 6 points a disclosure, one wave per origin, 2 waves a year | all three | `world-frontier.test.ts` (6 points, one row per origin), `tech-waves-frontier.test.ts` (waves) | F1, F3, F4 |
| Same source twice in a year returns the same number; no `g.rng` in any read | frontier reads, `raceYear` and `frontierTerms` on a deep-frozen state; `g.rng` and `g.nextId` unchanged | F1, F5, F6 tests | F1, F5, F6 |
| Parity grid within 1 point | both odds terms are exactly 0 at default (no shard, years up to 2026) | `world-frontier-terms.test.ts` | F6 |
| "Odds 62%: ... " lines with rival pressure and public research | the two terms, their words and reasons names (Effort migration passes them) | F6 | F6 |
| Old saves load; history fixed; state +3,000 nodes | no key in a v5.0.0 save or a life to 2026; worst case 3,600 nodes inside `WORLD_BUDGET` | F1, F7 | F1, F7 |

Not owned: popups, repeated lines, ambition, banking at most 15 points, intel floors, the parity grid itself (Quiet, Effort core, Knowledge, Effort migration).

**Hot files and who touches them** (every edit is additive in its own hunk).

| File | Task | Edit |
|---|---|---|
| `src/game/world/caps.ts`, `shards.ts:7`, `budget.ts:75-78`, `invariants.ts:142` | F1 | `FRONTIER_CAPS`; `import './frontier'`; a `case 'frontier'`; one `frontierProblems` loop |
| `src/game/modules/index.ts:14-19` | F2 | one import, one list line |
| `src/game/business/tech-wave-factors.ts:47-48` | F3 | `'effort'` in `WaveSource` and `SOURCES` |
| `src/game/business/tech-waves.ts` | F3 (news :161, `announceResearch`, port bind), F4 (`WaveInput.field` :48-64, hook after :153, no-wave push) | the same lane, in order |
| `src/game/business/contract.ts` | F3 | one port |
| `src/game/workshop/market.ts:64-68`, `menu.ts:130` | F5 | `raceYear`, `raceShift`, one info row. Effort migration (C.4) merges after this and rebases onto the `raceYear` hunk |
| `docs/WORLD.md:22`, `KERNEL.md:19`, `STREAMS.md` | F1 + F7, F2, F2 | the shard section; the phase row; one bullet |
| `test/hub-entry.test.ts` (:50 HUBS, :57 EXPECTED_PORTS), `test/kernel-acceptance.test.ts:17`, `test/stream-tap.ts:149`, `test/stream-isolation.test.ts:71`, `test/ceiling-kit.ts:483`, `test/ceiling-list.json`, `test/ceiling-probe.test.ts:60` | F2, F3, F7 | one entry each; the two files two lanes touch are 7 lines apart |

**Lanes and schedule.** Four lanes, 3 test-running agents at a time are enough (the machine has 6 heavy slots).

| Lane | Tasks in order | Needs |
|---|---|---|
| `main` | F1, F2, F7 | nothing; F7 needs every lane merged |
| `waves` | F3, F4 | F3 nothing; F4 needs F1 |
| `race` | F5 | F1 |
| `terms` | F6 | F1 |

Wave A (parallel): F1 in `main`, F3 in `waves`. Wave B (parallel, after F1): F2, F4, F5, F6. Wave C: F7 after the other lanes are merged into the track branch. **Protocol for the cross-lane needs:** F4, F5 and F6 import files F1 creates. The lead brings the F1 commit into those lane worktrees before they start (a `git merge` of the `main` lane branch at F1; F1 only adds files and appends to six shared files, so it merges clean). F3 needs nothing and starts with F1. No other file is edited by two lanes except the two test lists above.

**Lead actions.**
1. Bring F1 into the `waves` (before F4), `race` and `terms` lanes as above.
2. Tell the Effort core and Effort migration planners (cross-check): `quote` takes two optional numeric inputs `spill` and `rival` (odds points, default 0) and names their lines with `FRONTIER_REASONS`; migrated systems pass `frontierTerms(g, fieldOfTrade(industry) ?? fieldOfCap(cap))`.
3. `test/fixtures/kernel-parity.json` is re-recorded in F2 (a new aging entry). Other R3 tracks add modules too: after the last merge regenerate it once (`RECORD_KERNEL_PARITY=1`), never hand-merge. Same for `test/fixtures/golden-digests.json` (F7 checks it).
4. Add the new test files to `scripts/test-timings.json` at the next refresh (`frontier-acceptance` about 25 s, the rest under 5 s).
5. Merge order inside R3: after Knowledge and Quiet, before Effort migration.

## 2. Contracts

**Provided** (other tracks may rely on these exact names).

| Provided | By | Used by |
|---|---|---|
| `world/frontier-fields.ts`: `FIELD_IDS`, `FieldId`, `FIELDS`, `isFieldId`, `fieldLabel`, `parentField`, `fieldOfKind`, `fieldOfTrade`, `fieldOfCap` | F1 | F4, F5, F6; Effort migration (`Task.field`); C.8 and C.9 add rows |
| `world/frontier.ts`: `Disclosure`, `DisclosureResult`, `FrontierShard`, `readFrontier`, `frontierLead`, `frontierSpill`, `frontierRows`, `lastPush`, `applyDisclosure`, `normalizeFrontier`, `frontierProblems` | F1 | F2, F4, F5, F6; R5 detectors read rows |
| `world/caps.ts`: `FRONTIER_CAPS` | F1 | the ceiling list |
| `world/frontier-step.ts`: `stepFrontier`, `followDraw`, `frontierModule` (id `world.frontier`, slice `world.frontier`, aging / `frontier` / 10) | F2 | modules/index.ts |
| `business/contract.ts`: port `business.discloseResearch` (`discloseResearch`), `ResearchDisclosure` | F3 | R6, R8, R9 domains, Effort `step` wrappers |
| `business/tech-waves.ts`: `announceResearch`, `EFFORT_WAVE_MIN`, `WaveSource` with `'effort'`, `WaveInput.field` | F3, F4 | the port; every wave writer, unchanged |
| `workshop/market.ts`: `raceShift`, `FUTURE_FIELD`; `raceYear` keeps its signature | F5 | menus, `closeHistory`, tests |
| `world/frontier-terms.ts`: `frontierTerms`, `FRONTIER_REASONS`, `frontierWords`, `fieldLine` | F6 | Effort migration (odds lines), Fog migration (words) |

```ts
// src/game/world/frontier-fields.ts   (L2, imports nothing)
export type FieldId =
  | 'ai' | 'chips' | 'drug' | 'space' | 'ev' | 'automation' | 'quantum' | 'security' | 'fusion' | 'neuro' | 'drones' | 'carbon'
  | 'ai.language' | 'ai.coding' | 'ai.vision' | 'ai.speech' | 'ai.reasoning' | 'ai.agents' | 'ai.robotics' | 'ai.science'
export interface FieldDef { id: FieldId; label: string; lead: boolean; parent?: FieldId }  // lead false: the 8 ai.* fields (spill only); parent 'ai'
export const FIELD_IDS: readonly FieldId[]
export const FIELDS: Readonly<Record<FieldId, FieldDef>>
export function isFieldId(x: unknown): x is FieldId                // own keys only: 'constructor' and '__proto__' are not ids
export function fieldLabel(f: FieldId): string                     // 'fusion power', 'AI reasoning'; at most 30 characters
export function parentField(f: FieldId): FieldId | null
export function fieldOfKind(kind: string): FieldId | null          // the 12 future-facing wave kinds map to the same id; a history kind or junk is null
export function fieldOfTrade(trade: string): FieldId | null        // aiLab->ai semiconductor->chips biotech->drug spaceTech->space electricVehicles->ev robotics->automation quantum cybersecurity->security fusion neurotech->neuro drones carbonCapture->carbon
export function fieldOfCap(cap: string): FieldId | null            // 'reasoning' -> 'ai.reasoning'

// src/game/world/frontier.ts   (L2: ../types, ../kernel/streams, ../history/timeline (PRESENT_YEAR), ./state, ./rows (sameJson), ./caps, ./frontier-fields)
export type Shield = 'open' | 'patent' | 'secret'
export interface FrontierRow { y: number; w: 'you' | 'rival'; m: string; d: number; o: string; f?: 1 } // year, who, market, centi-years, origin hash (base 36, 1-8 chars), followed
export interface FieldRec { fold: number; pub: number; ly: number; rows: FrontierRow[] }              // centi-years folded, tenths of a point, last push year, newest last
export interface FrontierShard { v: 1; y: number; f: Partial<Record<FieldId, FieldRec>> }            // y: last year stepped, 0 = never
export interface Disclosure { field: FieldId; year: number; size: number; origin: string; by: 'you' | 'rival'; market?: string; shield?: Shield }
export type DisclosureResult =
  | { applied: true; lead: number; spill: number }                                   // centi-years and tenths of a point actually added
  | { applied: false; why: 'bad' | 'history' | 'future' | 'secret' | 'repeat' }
export function normalizeFrontier(raw: unknown): FrontierShard                        // total, bounded, a valid input comes back as itself; registers the shard at load
export function readFrontier(g: Pick<GameState, 'world'>): Readonly<FrontierShard>   // pure; absent reads as a frozen { v: 1, y: 0, f: {} }
export function frontierLead(g: Pick<GameState, 'world'>, field: FieldId): number    // years, 0 to 12, two places
export function frontierSpill(g: Pick<GameState, 'world'>, field: FieldId): number   // whole odds points, 0 to 18
export function frontierRows(g: Pick<GameState, 'world'>, field: FieldId): readonly FrontierRow[]
export function lastPush(g: Pick<GameState, 'world'>, field: FieldId): number        // year of the newest row, 0 for none
export function applyDisclosure(g: GameState, d: Disclosure): DisclosureResult       // the one writer; replaces the shard root; one luck draw
export function frontierProblems(raw: unknown): string[]                              // for worldProblems: "<what>" lines, [] when sound

// src/game/world/frontier-step.ts
export function followDraw(g: Pick<GameState, 'lifeId' | 'flags'>, field: FieldId, o: string, year: number): number  // outcomeStream(g, 'frontier', year, `${field}|f|${o}`)(), pure
export function stepFrontier(g: GameState): void                                      // idempotent by shard.y; no-op up to 2026 and with no shard
export const frontierModule: ModuleDef

// src/game/world/frontier-terms.ts
export interface FrontierTerms { spill: number; rival: number; lead: number }         // odds points (0 to 18), odds points (0 to 8), years
export const FRONTIER_REASONS: { readonly spill: 'public research'; readonly rival: 'rival pressure' }
export function frontierTerms(g: Pick<GameState, 'world' | 'year'>, field: FieldId | null, year?: number): FrontierTerms  // pure; field null or no shard = zeros; year clamps to g.year
export function frontierWords(lead: number): string                                   // 'on schedule', 'a little ahead of schedule', 'ahead of schedule', 'well ahead of schedule', 'far ahead of schedule'
export function fieldLine(g: Pick<GameState, 'world'>, field: FieldId): string       // 'Fusion power: ahead of schedule.' (at most 90 characters)

// src/game/business/contract.ts, tech-waves.ts, frontier-waves.ts
export interface ResearchDisclosure { field: string; name: string; size: number; origin: string; market?: string; home?: string; by?: string }
export const discloseResearch: Port<[GameState, ResearchDisclosure], TechWave | null>  // 'business.discloseResearch'; unbound = null; bound by tech-waves.ts
export function announceResearch(g: GameState, d: ResearchDisclosure): TechWave | null
export const EFFORT_WAVE_MIN = 0.2
export function kindOfField(field: string): WaveKind | null                           // fusion -> fusion, ai.science -> ai, cloud / junk -> null
export function pushFromWave(g: GameState, w: TechWave, field?: string): DisclosureResult | null

// src/game/workshop/market.ts
export const FUTURE_FIELD: Readonly<Record<string, FieldId>>                           // the 9 future ideas that have a wave kind
export function raceShift(g: GameState, def: Pick<IdeaDef, 'id' | 'from' | 'real' | 'future'>): number  // whole years raceYear lost to the frontier, 0 by default
```

**Consumed.** From R2: `registerShard`, `worldShard`, `ensureWorld` (world/state.ts), `outcomeStream`, `hashKey` (kernel/streams.ts), `ModuleDef` (kernel/registry.ts), `definePort` (kernel/ports.ts), `PRESENT_YEAR` (history/timeline.ts), `announceWave`, `readTechWaves` (tech-waves.ts), and the kits `makeTestGame`, `adult`, `company` (market-kit), `deepFreeze` (fuzz-kit), `tightest` (ceiling-kit). From Effort core: nothing at compile time (it merges first and must not import this code); the seam is two optional numeric inputs on `quote`, see lead action 2. From Quiet: nothing; the step logs nothing, so a `{ s, a, w }` on `log` changes no call. From Knowledge: nothing; `frontierWords` is plain words for the fog layer to wrap.

## 3. Tasks

### R3-F1 C.6 (a): the frontier shard, the fields and the one writer
**Lane** `main`. **Depends on** nothing. **Size** about 560 source, 540 test.
**Goal.** `g.world.frontier` exists as a bounded, versioned, registered shard with a total reader and one writer, `applyDisclosure`. Nothing calls the writer yet, so no life changes.
**Files.** Create `src/game/world/frontier-fields.ts`, `src/game/world/frontier.ts`, `test/world-frontier-fields.test.ts`, `test/world-frontier.test.ts`. Modify `src/game/world/caps.ts` (append `FRONTIER_CAPS = { leadYears: 12, yearYears: 2, spillPoints: 18, spillPerDisclosure: 6, rowsPerMarket: 6, marketsPerField: 4, fields: 32 }`), `world/shards.ts:7` (`import './frontier'`; the file registers itself like `facts.ts`, so the hub adds no `registerShard` line, because a second, different definition would throw), `world/budget.ts:75-78` (a `case 'frontier'` with rows against `rowsPerMarket x marketsPerField x fields`), `world/invariants.ts:142` (`for (const p of frontierProblems(world.frontier)) out.push(\`frontier: ${p}\`)`), `docs/WORLD.md:22` (name `frontier` in the shard list and add a section "The frontier": the numbers table above; `test/world-acceptance.test.ts:466` fails until it is named). `world/types.ts` is not touched (the index signature carries it).
**Behaviour.** Units: lead in centi-years, `pub` in tenths of a point, so every stored number is a whole number. `applyDisclosure` checks in this order: bad (unknown field, size not finite, origin empty or over 64 characters, market not `world` or `^[a-z][a-z0-9._-]{0,15}$`, year not an integer), `history` (year at most 2026), `future` (year after `g.year`, no foresight), `secret`, `repeat` (a row with the same year and `o = hashKey(origin).toString(36)` exists). Luck: one draw, `outcomeStream(g, 'frontier', year, \`${field}|d|${o}\`)()` (literal tag, so the stream table sees it). Gain = `round(base x size x (0.8 + 0.4 u))` centi-years, base 200 (you) or 150 (rival), cut to the room left (`200 - this year's rows of the field`, `1200 - lead`); a `lead: false` field gets 0. Spill = `round(10 x (1 + 5 size) x shieldFactor)` tenths, added to `pub` up to 180. A row `{ y, w, m, d, o }` is always written (d may be 0), then `boundRows` keeps 6 per market and 4 markets (the newest by year), folding the rest into `fold`; `ly` = year. The root is replaced, never edited (`ensureWorld(g).frontier = next`), and only when it changed (`sameJson`). `normalizeFrontier` keeps only known fields, integer ranges, valid rows (deduped by year and `o`, sorted by year), recomputes the bounds, forces `d = 0` and `fold = 0` on a `lead: false` field, drops an empty field, and returns its input when already valid. Reads never create `g.world`.
**Steps (test first).**
1. Write the two test files (`// ci: fast`); red because the modules do not exist. Cases: the field table (20 ids; the 12 kinds equal the kinds of `WAVE_KINDS` that have no `HISTORY_WAVES` row; the 8 `ai.*` ids equal `CAP_IDS`; `fieldOfTrade(t)` equals `WAVE_KINDS[kind].core[0]`'s kind for the 12; `'cloud'`, `'constructor'`, `'__proto__'` map to null; labels at most 30 characters, no dash); hostile shards (a number, an array, `v: 2`, unknown field ids, `__proto__`, rows with NaN, a year of 1999, `d` of 1e9, 10,000 rows, strings of 10,000 characters, `fold` over the cap): the reader returns a valid shard, at most 3,600 nodes, never throws, and a valid shard comes back as itself; the writer: history year, future year, bad input, repeat and secret each return their reason and leave `g.world` undefined or equal; 100 disclosures of size 1 in one year give at most 2.00 years and over 20 years at most 12.00; spill of one disclosure is at most 60 tenths over a grid of sizes 0.05 to 1 and the three shields, `pub` at most 180; the same disclosure on two clones gives the same gain, another `lifeId` may differ, a `timelineForks` entry before the year changes the draw of the year after it and not of a finished one; the 7th row of a market and the 5th market fold into `fold` with `lead` unchanged; the writer works on a state whose shard root is deep-frozen; reads on a deep-frozen state leave `g.rng`, `g.nextId` and `g.world` unchanged; `frontierProblems` names a lead over 12, a row in 2020, a 7th row; a 20-field worst-case shard stays under `WORLD_BUDGET` and `worldBudget(g).over` is empty.
2. Implement. Keep the comment header in the style of `world/facts.ts` (what it keeps, why it is safe, load order).
3. Checks: `/Users/saeed/projects/anotherlife/wt/bin/tc`; `/Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-frontier.test.ts test/world-frontier-fields.test.ts test/world-state.test.ts test/world-streams.test.ts`; then `vt22 test/world-acceptance.test.ts test/layers.test.ts test/layers-domains.test.ts test/architecture.test.ts` (no upward import, no new cycle, the docs name the shard).
**Proves.** Spill at most 6 points a disclosure; one row per origin; history fixed; no foresight; bounded state; hostile loads; no `g.rng` in a read.
**Risks.** (1) `world-streams` guards `world/`: no `rand`, `pick`, `chance`, `.rng`, `Date` in either file. (2) The list of 12 and 8 ids is a literal in an L2 file (it may not import `business/`), so the table test is what keeps it equal to the data.

### R3-F2 C.6 (b): the yearly step, rival follows and the registry line
**Lane** `main`. **Depends on** F1. **Size** about 200 source, 330 test.
**Goal.** The aging seam's `frontier` phase gets its one module: public research fades, and a rival follows a player's disclosure with luck from the named stream. One line in `modules/index.ts`.
**Files.** Create `src/game/world/frontier-step.ts`, `test/world-frontier-step.test.ts`, `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` if missing (header `| file | test | before | after | why |`). Modify `src/game/modules/index.ts:14-19` (import and `frontierModule,` after `factsModule`, which keeps the list sorted by id), `test/stream-tap.ts:149` (row `frontier: { slices: ['world', 'flagsPersonal', 'text'], driven: true, why: ... }`, the why saying the shard feeds the Workshop race year, which drops an idea from the notebook flag and logs it), `test/stream-isolation.test.ts:71` (DRIVERS `frontier: (g) => void followDraw(g, 'fusion', 'probe', g.year)`), `test/hub-entry.test.ts:50` (`world/frontier` and `world/frontier-step`), `docs/KERNEL.md:19` (the `frontier` row names `world.frontier 10`), `docs/STREAMS.md` (one bullet under "Named streams": tag `frontier`, `outcomeStream`, a Time Machine jump re-rolls the unfinished year), `test/fixtures/kernel-parity.json` (re-record).
**Behaviour.** `stepFrontier(g)`: return if `g.year <= 2026`, if there is no shard, or if `shard.y === g.year`. Otherwise one pass in `FIELD_IDS` order: `pub = floor(pub x 0.9)`; for each row of a `lead` field with `w 'you'`, `d > 0`, no `f` and age 1 to 4: if `followDraw(...) < 0.3`, set `f: 1` and append a rival row `{ y: year, w: 'rival', m: row.m, d: max(1, floor(d / 2)) cut to the year and lead room, o: 'f' + row.o }`; then `boundRows`, `ly`, and `y = g.year`. Written once, only if changed. No log line (the player learns of it through the race row and the odds term). Module `{ id: 'world.frontier', layer: 2, slices: ['world.frontier'], yearly: [{ seam: 'aging', phase: 'frontier', order: 10, run: stepFrontier }] }`.
**Steps (test first).**
1. Red cases: no shard or a year up to 2026 leaves `g.world` undefined; a second call in a year changes nothing (JSON equal); `pub` 100 tenths becomes 90, 1 becomes 0; a player row of age 1 to 4 is followed at most once and never at age 0 or 5; over 2,000 `o` strings `followDraw` is below 0.3 in 25% to 35% of cases and is the same number twice; a follow adds `floor(d/2)` and respects the 2-year room; `g.rng` and `g.nextId` are unchanged by the step; a clone steps to the same JSON as the original (replay), a fork tag before the year changes the draw and an earlier year keeps it; the module is registered (`registeredSlices()` has `world.frontier`, `yearlyEntries('aging')` lists it before `yearly.history`); `ageUp` on a life with a hand-built shard in 2030 fades it; the stream-isolation test passes with the new row.
2. Implement, add the module line, add the table rows and the docs.
3. Re-record: `RECORD_KERNEL_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/kernel-parity.test.ts`, check that only the aging list and the hook digests moved (the four life digests must not), put the reason and a row in `moved-tests.md`.
4. Checks: `tc`; `vt22 test/world-frontier-step.test.ts test/kernel-registry.test.ts test/kernel-acceptance.test.ts test/hub-entry.test.ts`; `vt22 test/stream-isolation.test.ts test/replay-purity.test.ts test/kernel-aging.test.ts`.
**Proves.** Rivals push the frontier from the named stream; yearly step idempotent by its year stamp and registered through the registry; luck replays and forks correctly.
**Risks.** The stream row is `driven` (no played life calls the stream), so the driver is a pure read; the row's slices are the honest reach, not the minimum.

### R3-F3 C.6 (c): the `effort` wave source and the disclose port
**Lane** `waves`. **Depends on** nothing (it does not use the frontier yet). **Size** about 130 source, 230 test.
**Goal.** A new wave source `effort` that follows the same rules as the others, and the port a future domain calls to disclose research (spec 5.9: "new `source: 'effort'`, still 2 a year").
**Files.** Create `src/game/business/frontier-waves.ts` (a leaf, kept out of the business cycle: in F3 it imports types only and holds `kindOfField` with the 12-kind literal; F4 adds the `world/frontier` import), `test/tech-waves-effort.test.ts`. Modify `business/tech-wave-factors.ts:47-48` (`'effort'` in `WaveSource` and `SOURCES`), `business/tech-waves.ts` (`announceWaveNews` :161-163 treats `effort` like `deeptech`: one market news item, and a notice when `by` is the player's own asset; `ResearchDisclosure`, `EFFORT_WAVE_MIN`, `announceResearch`; bind the port at the end of the file with an arrow), `business/contract.ts` (the port `business.discloseResearch`, fallback returns null), `test/hub-entry.test.ts:57` and `test/kernel-acceptance.test.ts:17` (the name goes between `activities.relocate` and `business.revalueCompany`, the list is sorted).
**Behaviour.** `announceResearch(g, d)`: `kindOfField(d.field)` is null, or `d.size < 0.2`, gives null with no throw; else `announceWave(g, { kind, source: 'effort', origin: d.origin, name: d.name, size: d.size, market: d.market ?? 'world', home: d.home, by: d.by })`. The `announceWave` rules apply unchanged: one wave per id, 2 non-rival a year, 64 stored, refused when a history row of the kind is live. `deliveryTarget` (tech-waves.ts:254) returns null for `effort`, so the seeded path in `stepWave` (:288) moves it. `feedEconomy` feeds it (innovation), as a deep-tech wave.
**Steps (test first).**
1. Red cases (`announceWave` returns null for source `effort` today because `cleanWave` rejects it): an `effort` wave stores and survives a JSON reload and `waveWorldFlags` through `continueAsChild`; a third non-rival wave of the year is refused whatever the source, a rival wave is not counted; a rival-heavy flood stops at 64; news: one item for a trade the player runs, none for a trade they do not, one notice for an own asset, none twice; `announceResearch` maps `ai.reasoning` to kind `ai`, refuses `cloud`, junk and `__proto__`, refuses size 0.19 and takes 0.2, returns the stored wave on a repeat, writes nothing on a deep-frozen read path; `advanceTechWaves` steps an `effort` wave deterministically; the port is unbound with a stand-alone import (returns null) and bound after entering through `aging` (hub-entry `EXPECTED_PORTS`).
2. Implement.
3. Checks: `tc`; `vt22 test/tech-waves-effort.test.ts test/tech-waves.test.ts test/tech-waves-readers.test.ts test/tech-waves-writers.test.ts`; `vt22 test/hub-entry.test.ts test/kernel-acceptance.test.ts test/tech-wave-data.test.ts test/layers-domains.test.ts`.
**Proves.** One wave per origin and 2 a year hold for the new source; the port exists and binds.
**Risks.** `kernel-acceptance` compares `portStatus()` with a literal list; two lanes of other tracks may add ports too, the lead keeps both entries.

### R3-F4 C.6 (d): every wave and every rival landing pushes the frontier
**Lane** `waves`. **Depends on** F3 and F1. **Size** about 150 source, 340 test.
**Goal.** A wave that `announceWave` stores moves its field, with no edit to any wave writer; the research disclosed through the port moves it too when no wave is made.
**Files.** Modify `business/frontier-waves.ts` (add `pushFromWave`), `business/tech-waves.ts` (`WaveInput.field?` at :48-64; the hook after `announceWaveNews(g, stored)` at :150-153; the no-wave push in `announceResearch`). Create `test/tech-waves-frontier.test.ts`.
**Behaviour.** In `announceWave`, only for a wave that is new (the `prior` return at :129 skips it): `pushFromWave(g, stored, a.field)` = `applyDisclosure(g, { field: a.field ?? fieldOfKind(w.kind), year: w.year, size: w.size, origin: w.id, by: w.source === 'rival' ? 'rival' : 'you', market: w.market })`. A history kind, a year up to 2026 and an unknown field push nothing. `announceResearch` pushes by itself (`origin: 'effort:' + d.origin`) only when no wave comes back (size under 0.2 or the wave refused); when a wave is made the hook pushed already, so a disclosure never counts twice.
**Steps (test first).**
1. Red cases: a deep-tech, heavy, workshop, race and effort wave of a future kind in 2030 each add one `you` row to the field of its kind (lead within `size x 2 x 0.8..1.2` years, spill `round(5 x (1 + 5 size))` tenths of a point, the patent default); a repeat adds nothing; a wave of `cloud` or `smartphone`, or announced for 2026, leaves `g.world` undefined; `a.field = 'ai.reasoning'` pushes that field (spill only, lead 0); `landRivalWaves` in a landing year adds a `rival` row in `ai` with the company's market, and `rivalWave(...)` returns the same tuples as before for 60 years (the draw is not touched); the third non-rival wave of a year is refused and pushes nothing; `announceResearch` with size 0.1 pushes once and a repeat pushes nothing, with size 0.5 makes a wave and pushes once, with a refused wave still pushes once; `kindOfField` and `FIELDS` agree for all 20 ids; the 63-year run of `test/tech-waves-wiring.test.ts:93` still gives equal `g.flags` JSON; a Time Machine fork changes the luck of the year after it.
2. Implement.
3. Checks: `tc`; `vt22 test/tech-waves-frontier.test.ts test/tech-waves-effort.test.ts test/tech-waves-wiring.test.ts test/wave-insider.test.ts`; `vt22 test/heir-world-flags.test.ts test/heavy-story.test.ts test/layers.test.ts`.
**Proves.** Disclosures, waves and landings feed the frontier; one wave per origin, one push per origin; 2 waves a year; the rival draw is untouched.
**Risks.** `tech-waves.ts` is in the 59-module business cycle; the new leaf imports only `world/` and types, so it stays out of the cycle (`architecture.test.ts` proves it).

### R3-F5 C.6 (e): the Workshop future race as a frontier crossing
**Lane** `race`. **Depends on** F1. **Size** about 70 source, 210 test.
**Goal.** A rival leap in a field pulls a future idea's rival deadline in, and the player is told; with no push everything is as before.
**Files.** Modify `src/game/workshop/market.ts` (imports 3-9; `raceYear` at :64-68 becomes `base - raceShift`; add `FUTURE_FIELD` and `raceShift`), `src/game/workshop/menu.ts:130` (one more info node after the race row, id `ws.idea.race.shift.<id>`). Create `test/workshop-frontier.test.ts`.
**Behaviour.** `FUTURE_FIELD`: `fut-fusion-cell` and `fut-superwire` fusion, `fut-dream-recorder` neuro, `fut-pocket-quantum` quantum, `fut-organ-printer`, `fut-cold-cure` and `fut-tooth-gel` drug, `fut-plastic-bin` carbon, `fut-robot-chef` automation; the 4 novelties are absent (they write no wave). `raceShift`: 0 unless `def.future` and the id is in the table; `cut = floor(frontierLead(g, field))`; `floor = max(def.from + 10, min(base, lastPush(g, field)))`; shift = `max(0, min(cut, base - floor))`. So the deadline never goes below `from + 10` (the old lower bound), never above the old one, and never before the year of the latest push. History ideas (`def.real`) are untouched. The new info row reads `Recent leaps pulled this race in by N years.` (N at least 1, at most 90 characters, no dash). `closeHistory` (yearly.ts:105-114) and `raceOpen` pick the new year up with no edit.
**Steps (test first).**
1. Red cases: over the 13 ideas, 40 `lifeId`s and years 2027 to 2060 with no shard, `raceYear` equals the old formula (copied into the test) and `raceShift` is 0; with a hand-built shard (fusion lead 3.5, `ly` = `g.year`) the two fusion ideas lose 3 years, others lose nothing, none goes under `from + 10`; with lead 12 and `ly` = this year the deadline is not below this year; the next year it is not below `from + 10` and `closeHistory` drops the idea with the existing log line; `FUTURE_FIELD[id]` equals the field of `workshopWaveFor(def).kind` for the 9 and the 4 novelties have none; the row appears only when the shift is positive, the idea subtitle's `beat YYYY` follows `raceYear`; the menu builds on a deep-frozen state; `g.rng` and `g.nextId` are unchanged; `test/workshop-race.test.ts` runs unedited.
2. Implement.
3. Checks: `tc`; `vt22 test/workshop-frontier.test.ts test/workshop-race.test.ts test/workshop.test.ts test/workshop-notebook.test.ts test/voice-guards.test.ts`.
**Proves.** The future-race deadline is a frontier crossing; history fixed; default unchanged.
**Risks.** Effort migration (C.4) edits `workshop/*` and merges after this track; the `raceYear` hunk is 5 lines.

### R3-F6 C.6 (f): the odds terms and the words
**Lane** `terms`. **Depends on** F1. **Size** about 130 source, 210 test.
**Goal.** The pure read API Effort migration and the fog layer use: two named odds terms, and plain words for a lead.
**Files.** Create `src/game/world/frontier-terms.ts`, `test/world-frontier-terms.test.ts`.
**Behaviour.** `frontierTerms(g, field, year = g.year)`: a null field or no shard gives `{ spill: 0, rival: 0, lead: 0 }`; `year` is clamped to `g.year` (no foresight); `spill = min(18, frontierSpill(field) + frontierSpill(parent))`; `rival = min(8, 2 x count)` where count is the rival rows of the field and its parent with `y` in `[year - 2, year]`; `lead = frontierLead(field)` (own, not the parent's). `frontierWords`: under 0.25 years `on schedule`, under 1 `a little ahead of schedule`, under 3 `ahead of schedule`, under 6 `well ahead of schedule`, else `far ahead of schedule`. `fieldLine` is `Label: words.` capitalized. Reasons names are constants so Effort and Fog print the same words.
**Steps (test first).**
1. Red cases: zeros for null, an absent shard and every year up to 2026; a disclosure raises `spill` by its points, never over 18; `ai.reasoning` also sees the `ai` field's spill and rival rows; the window of 3 years and the cap of 8; a call with `year` after `g.year` equals one at `g.year`; a deep-frozen state is read without a write and `g.rng` stays; `frontierTerms` called twice gives the same object values (same source, same number); words at the five edges, `fieldLine` at most 90 characters for all 20 fields, no U+2014 or U+2013, no banned phrase of `docs/VOICE.md`.
2. Implement.
3. Checks: `tc`; `vt22 test/world-frontier-terms.test.ts test/voice-guards.test.ts test/layers.test.ts`.
**Proves.** Odds terms are 0 at default (the parity grid keeps its numbers); reads are pure and stable; words follow the voice guide.

### R3-F7 C.6 (g): acceptance, ceilings and docs
**Lane** `main`. **Depends on** F2, F4, F5, F6 (all lanes merged). **Size** about 110 source (kit rows), 430 test.
**Goal.** The 200-year probe, the 100x ceiling rows, old saves, hostile loads, heirs, replay and the docs, run once on the merged track.
**Files.** Create `test/frontier-acceptance.test.ts`. Modify `test/ceiling-list.json` (after the `lod-caps` entry: `frontier-caps` with file `src/game/world/caps.ts` and token `FRONTIER_CAPS`, and `waves-per-year` with file `src/game/business/tech-waves.ts` and token `MAX_PER_YEAR`), `test/ceiling-kit.ts:483` (two rows built with `tightest()`: the first applies `20 x scale` disclosures of size 1 and shield open to every lead field across `scale` years and reports lead against 1200, one year's gain against 200, `pub` against 180, one spill against 60, rows against 24; the second announces `2 x scale` distinct non-rival waves in one year and reports the stored count against 2), `test/ceiling-probe.test.ts:60` (both ids in `touching`), `docs/WORLD.md` (the frontier section completed: who writes, who reads, the caps, the load order), `moved-tests.md` (any row from a re-record).
**Steps (test first).**
1. Red cases in `frontier-acceptance.test.ts` (no `// ci: fast` tag, it is the long one): the probe: one founder with aiLab, fusion, quantum, drones and spaceTech companies, years 2027 to 2226, each year `stepFrontier`, `landRivalWaves`, `advanceTechWaves`, 20 disclosures of size 1 over the 12 kinds by both sides, 5 `discloseResearch` calls; after every year `worldProblems(g)` is empty, lead at most 12, `pub` at most 18, rows at most 24 a field, non-rival waves of the year at most 2, `g.rng` and `g.nextId` equal to the start, and every future idea's `raceYear` inside `[from + 10, from + 40]`; at the end nodes at most 3,600 and `worldBudget(g).over` empty; the `ai` field has rival rows from real landings; replay: the same run twice, a `structuredClone` continued, and a JSON reload give equal JSON; heirs: `continueAsChild` keeps the shard; old saves: every `test/fixtures/save-*.json.gz` migrates with no `frontier` key, and a life played from 1990 to 2026 stays without one; hostile: 12 hostile frontier shards (as `test/world-acceptance.test.ts` builds its hostile worlds) load into the oldest fixture, three years play, reads stay valid; the docs name every cap number.
2. Add the ceiling entries and rows (the list test and the probe test fail until both exist).
3. Checks: `tc`; `vt22 test/frontier-acceptance.test.ts test/ceiling-list.test.ts test/ceiling-probe.test.ts`; `vt22 test/old-saves.test.ts test/world-acceptance.test.ts test/save-world-adapter.test.ts`; `vt22 test/golden-digest.test.ts test/r2-parity-kit.test.ts test/replay-purity.test.ts test/seed-pins.test.ts test/voice-guards.test.ts`. If a golden or the canary moved (only a life that crosses 2026 with a deep-tech company can): `PATH="$HOME/.local/node22/bin:$PATH" node /Users/saeed/projects/anotherlife/wt/bin/slot.mjs heavy -- node scripts/golden.mjs update --reason "R3 frontier: <which life, which slice>"`, plus a row in `moved-tests.md`. One build at the end: `/Users/saeed/projects/anotherlife/wt/bin/vb`.
**Proves.** The frontier half of the 200-year probe; the 100x ceilings; old saves, heirs, replay and hostile loads; the digests moved only where the new rule moves them.
**Risks.** The probe is the slowest test of the track (about 25 s); it uses direct steps, not 200 `ageUp` calls. It adds no `seed: <digits>` pin: states come from `adult(n, year, 'us')` and `makeTestGame(n)` positional arguments, and a roll-dependent check searches the year as `tech-waves-wiring.test.ts:80` does or uses `findSeed`.

## 4. Open questions for the lead and the cross-check

1. **Fields: 20, not about 24.** 12 future-facing kinds and 8 AI capabilities have a producer or a reader in R3. The other four of the spec (medicine, software, weapons, finance) wait for C.8 and C.9; `FIELDS` takes them as rows.
2. **AI `capBest` is not lifted.** 48 uses, keyed by `fam`. Effort migration's AI-caps task rewrites `modelRating` anyway and can add `capBest(fam, cap, year, lead = 0)` with the lead from `frontierLead(g, 'ai')`, threaded through the board and `benchHard`. Until then `ai` is stored and unread, and `ai.*` give spill and pressure only. Say if you want it in this track instead; it would be a fifth lane and about 450 lines.
3. **Cross-lane dependency.** F4, F5, F6 need F1's files. The plan asks the lead to merge the `main` lane at F1 into those worktrees; if the orchestrator cannot, run F1 before the other lanes start and the lanes still finish in parallel.
4. **Effort seam.** Effort core must accept optional numeric `spill` and `rival` on `quote` and print `FRONTIER_REASONS`; Effort migration must pass `frontierTerms`. Without it, "research must pay visibly" shows no frontier line, but nothing breaks.
5. **Race deadlines can move earlier after a rival landing.** The rule keeps the whole year of the push and the era floor (`from + 10`). Confirm that is the intended feel.
6. **Re-records.** `kernel-parity.json` moves in F2 (one aging entry); regenerate once at the end of R3 integration. Goldens move only if a golden life crosses 2026 with a deep-tech company; F7 checks.

---

## Cross-check amendments (2026-10-22)

These override the text above. Numbered decisions are in `00-crosscheck.md` section 6.

- **D-F1 Stream row moves to R3-F1 (D37).** The first `outcomeStream(g, 'frontier', ...)` call is in R3-F1 (`applyDisclosure`), and a tag with a caller in `src/` needs a row in `test/stream-tap.ts` in the same commit. R3-F1 adds the row (`driven: true`, slices `world`, `flagsPersonal`, `text`) and the driver in `test/stream-isolation.test.ts`; R3-F2 keeps the `follow` draws (same tag), the docs bullet and the `hub-entry` HUBS line.
- **D-F2 Labels (D9).** `FRONTIER_REASONS` stay `'public research'` and `'rival pressure'`; R3-F6 compares them with string literals (this track imports nothing from `effort/`); R3-M11 asserts they equal Effort's `TERM_LABEL.spill` and `.rival`.
- **D-F3 Caps seen by `quote`.** `frontierTerms().spill` is at most 18 odds points (Effort's `SPILL_TERM_MAX`), `.rival` at most 8 (`RIVAL_PTS`). The per-disclosure 6 points stay in `FRONTIER_CAPS`.
- **D-F4 Callers.** R3-M1 (Effort migration) is the only caller of `frontierTerms` in R3 (company research through `researchInputs`, AI capabilities through `capTask` inputs). The Workshop does not read the frontier for builds: its race deadline is the crossing. The migration depends on R3-F6.
- **D-F5 Ports.** `business.discloseResearch` is the only port this track defines; R3-F3 adds it to `EXPECTED_PORTS` and `PORTS` and binds it in the same task. Knowledge and Effort add no port.
- **D-F6 AI lead (D37).** `capBest` keeps its calendar drift in R3; `frontierLead(g, 'ai')` is stored and unread, and `ai.*` fields give spill and pressure through the parent. Lifting the AI market is an R4+ item (48 uses in 8 files, keyed by `fam`).
- **D-F7 Hot files.** `modules/index.ts`: `frontierModule` goes after `factsModule` (id `world.frontier` sorts after `world.facts`). `test/ceiling-kit.ts` and `ceiling-list.json` get rows from four tracks; keep all. Re-records at the merge only.
