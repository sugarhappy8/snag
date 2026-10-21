# R2 plan, Ledger and world (track `ledger-world`)

Base: `release/v5.0.0` after wave 0 (the E.T3 codemod, the one seed rebaseline, `src/game/kernel/streams.ts`, `test/seed-kit.ts`). Code read at v4.1.1 (`a65349a`, the R1 head) in the worktree `wt/r2-release`; nothing was edited. Every path marked "modify" exists today and every "create" path does not (checked with `ls`). Line numbers are v4.1.1; wave 0 moves some of them, so each citation also quotes a token to grep. All text below uses plain hyphens (no U+2014, no U+2013).

## 1. Track summary

**Items covered (19 tasks, R2-L1 to R2-L19; R2-L19 was added by the cross-check to own the roadmap's "cash walk with no everything else row").**

| Id | Task | Item | Source lines | Test lines | Depends on |
|---|---|---|---|---|---|
| R2-L1 | World root, entity ids, the hostile-load reader | A.K2 (a) | 460 | 330 | none |
| R2-L2 | Ledger core: reasons, mints and burns, `book`, flows, checks | A.K1 (a) | 1,050 | 800 | L1 |
| R2-L3 | The three wrappers, the cash helpers, erosion, `addLoan` | A.K1 (b) | 520 | 520 | L2 |
| R2-L4 | The reasoned-call ratchet (replaces the R1 money ratchet) | A.K1 (c) | 40 | 520 + 150 data | L3 |
| R2-L5 | The 100-year, 40-life conservation probe (fast and sliced tiers) | A.K1 (d) | 120 | 650 | L3, L4 |
| R2-L6 | Migration 1: home, family, love, NPC lives | A.K1 (e) | 190 | 300 | L5 |
| R2-L7 | Migration 2: body, law, work, workshop, nation, advisors | A.K1 (e) | 130 | 280 | L6 |
| R2-L8 | Migration 3: events, activities, the estate in `life.ts` | A.K1 (e) | 170 | 320 | L7 |
| R2-L9 | Migration 4: shops and computer | A.K1 (e) | 150 | 260 | L8 |
| R2-L10 | Migration 5: special careers | A.K1 (e) | 130 | 240 | L9 |
| R2-L11 | Migration 6: business A | A.K1 (e) | 150 | 300 | L10 |
| R2-L12 | Migration 7: business B, then `why` becomes required if the count is zero | A.K1 (e) | 130 | 260 | L11 |
| R2-L13 | F37 bond par, F38 capital gains and transaction tax, `investments.ts` | A.K1 (f) | 350 | 500 | L4 |
| R2-L14 | World indexes over Person, Asset and npcCompany | A.K2 (b) | 520 | 450 | L1 |
| R2-L15 | Holdings, world invariants in `fuzz-kit`, heir resync | A.K2 (c) | 600 | 500 | L14, L2 |
| R2-L16 | The level-of-detail framework | K.6 (a) | 600 | 600 | L15, wave 0 streams |
| R2-L17 | Budget meter, the world step, the 50-year size probe | K.6 (b) | 450 | 400 | L16, L3 |
| R2-L19 | The cash walk without a residual: per-company reason tally | A.K1 (g) | 330 | 300 | L12, L3 |
| R2-L18 | Acceptance sweep and docs | A.K1, A.K2 | 0 | 450 + 400 docs | all (L1 to L17, L19) |

Totals: about 6,090 source lines (with R2-L19's 330) against the roadmap's 6,000 (A.K1 2,500 + A.K2 2,500 + K.6 1,000), and about 8,000 test lines (the probes are heavy), plus 150 data lines and about 400 doc lines. The migration batches count lines edited, not added.

**Not in this track.** The save chunks and slices (K.5), the module registry and bus (K.3), the golden digests (K.7b), the E.T3 codemod and the rebaseline (wave 0). Where they touch this track's files, section 2 says who calls whom. The "exact cash walk" row of the roadmap's player-visible list is a consumer of the ledger (`src/game/charts/books.ts:230` still builds an "Everything else" row). It is not one of items A.K1, A.K2 or K.6, but nobody else owns it, so the cross-check assigned it here as R2-L19 (section 5, point 1).

**Measured baseline (the roadmap asked for the real numbers).** Counted with the repo's lexer (`scripts/voice/lexer.mjs`, the tokens `test/scan-kit.ts` reads) over all of `src/` at v4.1.1: **773 money sites in 171 files**.

| Kind | Count | Roadmap said |
|---|---|---|
| `addMoney(` | 184 | about 460 calls together |
| `spend(` | 176 | |
| `earnIncome(` | 96 | (measured 456 together) |
| `.cash +=` and `.cash -=` | 50 + 110 = 160 | about 160 |
| `.money +=`, `.money -=`, `.money /=` | 31 + 34 + 1 = 66 | about 65 |
| `.cash =` and `.money =` (direct assignment) | 11 + 80 = 91 | not counted by anyone |

R1's `test/money-ratchet.json` counts only the calls and the `+=` forms (537 sites in 134 files); it cannot see a `-=` or an `=`, which is how `g.character.money -= cost` (for example `activities/rehab.ts:109`, `special/gamedev-career.ts:913`) escapes it. The reasoned-call ratchet of R2-L4 counts all 773. By directory: `business` 208, `special` 93, `events` 73, `shops` 61, `computer` 54, `activities` 47, `workshop` 16, `nation` 9, `advisors` 4, and 208 in the top-level files (`assets.ts` 40, `love.ts` 26, `relationships.ts` 24, `npc-lives.ts` 23, `health.ts` 13, `crime.ts` 11, `finance.ts` 11, `investments.ts` 7, and 25 smaller files). The numbers were counted with a throwaway script over the same lexer; R2-L4 recomputes them inside the test and prints the total.

**Acceptance owned by this track, and where each is proved.**

| Acceptance (lead's list) | Task | Test |
|---|---|---|
| 100-year probe, 40 seeded lives, heirs: accounts sum to previous plus mint minus burn each year within $1; each year's flows net to zero per reason; fits CI by `seedSlice` over 4 shards; a 3-life fast tier | R2-L5 (strict drift run in R2-L18) | `test/ledger-conservation.test.ts` (sliced), `test/ledger-conservation-fast.test.ts` |
| Unreasoned `addMoney`, `earnIncome`, `spend`, `.cash` and `.money` writes never rise | R2-L4 (falls in L6 to L12) | `test/money-ratchet.test.ts` |
| F37: the government pays bond par less any default haircut, with a named payer | R2-L13 | `test/ledger-invest.test.ts` |
| F38: capital gains and the nation's transactions tax reach `gov:<country>` through the ledger | R2-L13 | `test/ledger-invest.test.ts`, `test/investments.test.ts` (one test renamed and tightened) |
| Declared mints and burns, each capped, each with a log row (inflation erosion in `aging.ts`, lending creation, write-offs, emigration) | R2-L2 (tables, caps, rows), L3 (erosion, lending), L7 (write-offs), L16 (emigration) | `test/ledger.test.ts`, `test/ledger-wrappers.test.ts`, `test/ledger-flows-law.test.ts`, `test/world-lod.test.ts` |
| Pool prices carry bid-ask spreads: buy from the pool and sell to it loses money | R2-L2 (`SPREADS`), L6 (same-year house resale), L13 (markets), L16 (promotion and demotion) | `test/ledger.test.ts`, `test/ledger-flows-home.test.ts`, `test/ledger-invest.test.ts`, `test/world-lod.test.ts` |
| `g.world` absent reads as empty, reaches heirs by clone (RF3), hostile and garbage loads bounded (RF4) | R2-L1 (root), L15 (heir resync), L18 (fixture, matrix) | `test/world-state.test.ts`, `test/world-acceptance.test.ts` |
| K.6 caps (400 people, 60 firms of which 20 full, 150 properties, 600 job slots), promotion keyed on sorted ids, demotion folds cash through the ledger, budget meter | R2-L16, L17 | `test/world-lod.test.ts`, `test/world-budget.test.ts` |
| Replay, reload and fork give identical JSON, the world half (the primary owner of the whole-state check is Platform R2-P3; Save R2-S4 and R2-S9 own the storage half) | R2-L18 | `test/world-acceptance.test.ts` |
| Strangers persist only when touched; old NPC firms indexed in place (D3) | R2-L14 | `test/world-index.test.ts` |
| Ledger does not slow the year step (light-life `ageUp` at most 160 ms desktop); `flows` bounded (country x reason x 2 years) | R2-L2 (micro-benchmark, caps), L5 (bookings per year), L17 (50-year probe) | `test/ledger.test.ts`, `test/world-budget.test.ts` |
| The player-visible "cash walk with no everything else row" and D.3's pinned zero (cross-check addition) | R2-L19 | `test/ledger-cashwalk.test.ts` |

**Hot files and who touches them** (every edit additive, in its own hunk).

| File | Touched by | How |
|---|---|---|
| `src/game/types.ts` | R2-L1 only | one `import type { WorldState }` line after line 5, and `world?: WorldState` in `GameState` after `flags` (line 710). Nobody else edits it: Kernel, Save and Platform reach shards through `worldShard` and `registerShard` |
| `src/game/core.ts` | R2-L3 (replaces the three primitives, lines 63-95 `addMoney`, `spend`, `earnIncome`, and adds one import); R2-L12 only if the unreasoned count is zero (one signature edit) | the file's `canAfford` (line 92) and `moneyScale` code stay as they are |
| `src/game/cash.ts` (new) | R2-L3 creates it; L6 to L12 only call it and may append a helper at the end | |
| `src/game/kernel/reasons.ts` (new) | R2-L2 creates it; L6 to L13 may append a reason (one line, alphabetical inside its group) | |
| `src/game/aging.ts` | R2-L3 (line 119 `c.money /= 1 + economyOf(g).inflation` and one import); R2-L17 (one `YEARLY_HOOKS` entry after `['milestones', yearlyMilestones]` at line 89, one import) | The Kernel track converts `YEARLY_HOOKS`; it must keep `world` last (section 2) |
| `src/game/life.ts` | R2-L8 (estate booking in `continueAsChild`, line 1138; `n.character.money +=` at 1508; the two `spend` calls at 1939 and 1948); R2-L15 (one `syncWorld(n)` call at the end of `continueAsChild`) | different hunks |
| `src/game/finance.ts` | R2-L3 (`addLoan`, line 344, books the lending mint); R2-L7 (the 11 sites) | |
| `src/game/assets.ts` | R2-L3 (one line, 4279: `noMint: true` on the deficiency loan); R2-L6 (the 40 sites and the same-year resale rule at `makeOffers`, line 2689) | |
| `src/game/investments.ts` | R2-L13 only (all 7 sites, F37, F38) | |
| `src/game/business/exit.ts` | R2-L13 (lines 40-50: `capitalGainsRate` and `capitalGainsTax` become re-exports of `nation/rates.ts`) | |
| `src/game/business/state.ts`, `src/game/business/economy.ts`, `src/game/charts/books.ts` | R2-L19 (cross-check addition: `tally`, `flows`, `recordYear`, `cashWalkSpec`); R2-L11 and R2-L12 touch `state.ts` and `economy.ts` money sites; Kernel R2-K5 moves `localPay` out of `economy.ts` | additive hunks in different functions |
| `src/game/special/kit/year.ts` | R2-L3 only (lines 75-103: `earn` and `pay` pass two reasons) | |
| `test/fuzz-kit.ts` | R2-L5 (`LifeStats.ledger` and drift at lines 757-767 and the year loop, the rich boost at 1049, a ledger call in `checkInvariants` at 540); R2-L15 (swap that call for `worldProblems`) | |
| `test/money-ratchet.test.ts`, `test/money-ratchet.json` | R2-L4 rewrites both; L6 to L13 only shrink the JSON and append to `MIGRATED` | one entry per line, so merges do not collide |
| `scripts/test-timings.json` | R2-L5 (adds the probe to `split` and a weight) | |
| `test/ceiling-list.json` | R2-L2, L13, L16 (each appends entries) | |

**Order and schedule** (the machine runs three test-running agents at once; every task is test first).

1. R2-L1, then R2-L2, R2-L3, R2-L4, R2-L5 in a chain (about 12 agent-hours). R2-L5 is the earliest proof that the ledger holds on real lives, so it comes before the migration, not after it. The ratchet (R2-L4) also comes before the batches, not after them as the lead's list reads: each batch's red test is an entry in the ratchet's `MIGRATED` list, and with the ratchet last the unreasoned count could rise while seven batches land.
2. R2-L14 can start as soon as R2-L1 has merged, and R2-L15 once R2-L2 has: the K2 chain (L14, L15, L16, L17) runs beside the K1 chain.
3. R2-L6 to R2-L12 are sequential by default. They are independent of each other in code (different directories), and the shared files are one-line-per-entry, so the lead may run two at once; the one rule is that each batch rebases on the previous baseline JSON before it runs `UPDATE_MONEY_RATCHET=1`.
4. R2-L13 can run any time after R2-L4 (it owns all of `investments.ts`; no migration batch touches that file).
5. R2-L19 (the cash walk) runs after R2-L12, because it needs every company cash write to go through `firmCash`. R2-L18 is last. Merge order into `release/v5.0.0` is the lead's: wave 0, this track, Kernel, Save, Platform.
6. Wall estimate with three test slots: the K1 chain is about 24 hours with the batches in series, about 18 with two batches at a time; the K2 chain (about 10 hours) hides inside it.

**Lead actions** (none can be done by an implementer).

1. After R2-L5 merges, read the first sharded CI run: the probe adds an estimated 90 to 150 seconds to each shard (R2-L5, risks). If a shard goes past the 12-minute wall, lower `PROBE_ACTIONS` in `test/ledger-probe.ts` (one constant) before touching the lives or the years.
2. After the last batch (R2-L12) merges, decide whether the type of `why` stays optional (section 5, point 4).
3. Rule on the open points of section 5: the cash-walk consumer, the revaluation mint, the bond inflation basis, the caps.
4. After the first green sharded run with the probe, refresh `scripts/test-timings.json` as `docs/CI.md` says (the probe's weight of 400 is an estimate).

## 2. Cross-track contracts

**Provided by this track (other tracks may rely on these exact names).**

| Provided | By | Used by |
|---|---|---|
| `GameState.world?: WorldState`, `WorldState`, row types and `LOD_CAPS` | R2-L1 | Save (the `world` slice), Platform (`sliceDigests` world slice), every later world module |
| `EntityRef`, `ref`, `isRef`, `parseRef` (`src/game/kernel/ids.ts`) | R2-L1 | all |
| `ensureWorld`, `readWorld`, `worldShard`, `registerShard`, `normalizeWorld`, `shardNames` (`src/game/world/state.ts`) | R2-L1 | Kernel (`facts` shard), Save (slice `normalize`), R3 to R11 shards |
| `src/game/world/shards.ts`: the registration hub for the world's own shards (`ledger` from R2-L2, then `people`, `firms`, `homes`, `holdings`, `lod`; the Kernel track adds `import './facts'`) | R2-L2 | Save (`save-slices.ts` imports it for effect), `world/sync.ts`, tests |
| `Reason`, `REASONS`, `MINTS`, `BURNS`, `POOLS`, `counterparty` (`kernel/reasons.ts`); `SPREADS`, `bid`, `ask` (`kernel/spreads.ts`) | R2-L2 | every module that moves money, from R2 on |
| `book`, `bookMint`, `bookBurn`, `bookPlayer`, `foldAccount`, `acctBalance`, `peekLedger`, `ledgerRoot`, `flowsOf`, `checkLedger`, `LEDGER_CAPS` (`kernel/ledger.ts`) | R2-L2 | Platform (golden digests), R3 and later (any flow), the charts track (`flowsOf`) |
| `addMoney`, `spend`, `earnIncome` with `why?: Why` (`core.ts`) | R2-L3 | everyone |
| `moveCash`, `personCash`, `firmCash`, `payPerson`, `lend`, `writeoff`, `erodeCash`, `erodeFirm`, the purses (`src/game/cash.ts`) | R2-L3 | everyone, from R2 on |
| The reasoned-call ratchet and its `MIGRATED` list | R2-L4 | every track: a new file may call the three with a reason and may write no `.cash` or `.money` |
| `test/ledger-kit.ts` (`booksOf`, `driftSince`, `flowTotal`, `acctOf`, `expectConserved`) | R2-L3 | scenario tests of every later track |
| `syncWorld`, `yearlyWorld`, `worldProblems`, `worldBudget`, `timed` (`world/sync.ts`, `yearly.ts`, `invariants.ts`, `budget.ts`) | R2-L15 to R2-L17 | Kernel (`yearlyWorld` registration), Platform (`worldBudget` in the 50-year probe) |
| `promote`, `demote`, `lodSweep`, `seededEntity`, `LOD_CAPS`, `DEMOTE_AFTER_YEARS` (`world/lod.ts`) | R2-L16 | R4 (people), R10 (rosters), R6 (jobs, `LOD_CAPS.jobs`) |

```ts
// src/game/kernel/ids.ts (L0 leaf: imports nothing)
export type EntityRef = `${string}:${string}`
export function ref(kind: string, key: string | number): EntityRef            // throws RangeError on a bad kind or key; for code, never for saved data
export function isRef(x: unknown): x is EntityRef
export function parseRef(r: unknown): { kind: string; key: string } | null    // splits at the first colon; null for anything else
```

```ts
// src/game/kernel/ledger.ts (L0 leaf: type-only import of ../types, value imports only from other kernel files)
export type AcctRef = EntityRef | 'abroad'
export const ACCT_CLASSES: readonly ['person', 'firm', 'bank', 'gov', 'pool', 'abroad', 'mint', 'burn']
export type AcctClass = (typeof ACCT_CLASSES)[number]
export interface BookOpts { with?: AcctRef; country?: string; token?: string }
export type Why = Reason | ({ reason: Reason } & BookOpts)
export const LEDGER_CAPS: { readonly accounts: 500; readonly flowRows: 480; readonly flowCountries: 8; readonly receipts: 600; readonly closes: 4; readonly logRows: 40; readonly maxBooking: 1e15; readonly maxBalance: 9e15 }
export function playerAcct(g: GameState): AcctRef                              // `person:${g.character.id}`
export function book(g: GameState, reason: Reason, from: AcctRef, to: AcctRef, amount: number, token?: string): number   // whole dollars booked; 0 when rejected, replayed (token) or capped
export function bookMint(g: GameState, name: MintName, to: AcctRef, amount: number, reason?: Reason, token?: string): number  // clipped to the yearly cap
export function bookBurn(g: GameState, name: BurnName, from: AcctRef, amount: number, reason?: Reason, token?: string): number
export function mintRoom(g: GameState, name: MintName): number                 // pure: cap left this year
export function bookPlayer(g: GameState, why: Why | undefined, delta: number): number   // the wrappers' booking: the sign of delta picks the side
export function foldAccount(g: GameState, from: AcctRef, into: AcctRef, token?: string): number   // moves a whole balance, sum unchanged
export function acctBalance(g: GameState, acct: AcctRef): number              // pure
export function peekLedger(g: GameState): Readonly<LedgerShard>               // pure: absent or garbage reads as empty; never writes
export function ledgerRoot(g: GameState): LedgerShard                         // writer: creates and validates once per object identity
export function normalizeLedger(raw: unknown): LedgerShard                    // total, bounded; returns raw itself when it is already valid
export interface FlowRow { year: number; country: string; reason: Reason; net: Readonly<Record<AcctClass, number>> }
export function flowsOf(g: GameState, year?: number): FlowRow[]               // pure, sorted; rows of this year and last year
export interface LedgerReport { ok: boolean; problems: string[]; sum: number; mint: number; burn: number; accounts: number; flowRows: number; bookings: number }
export function tokenSeen(g: GameState, token: string): boolean              // pure: has this token been booked this year
export function checkLedger(g: GameState, opts?: { allowHeal?: boolean }): LedgerReport   // pure
export function ledgerProblems(g: GameState): string[]
```

```ts
// src/game/core.ts (replaces lines 63-95; all three behave exactly as today when `why` is absent, apart from booking)
export function addMoney(g: GameState, delta: number, why?: Why): number     // the delta applied (0 when refused)
export function spend(g: GameState, amount: number, why?: Why): boolean      // false and nothing booked when short
export function earnIncome(g: GameState, amount: number, why?: Why): number  // also adds to flags.taxableIncome, as today
```

```ts
// src/game/cash.ts (imports ./core, ./kernel/ledger, ./kernel/reasons and types; no business, no nation)
export interface Purse { readonly acct: AcctRef; add(delta: number): number }          // add applies the change to the record and returns what was applied
export function playerPurse(g: GameState): Purse
export function personPurse(p: Person, floor?: number): Purse                           // account person:<data.sid or id>; floor clamps the record (0 for "never below zero")
export function firmPurse(b: { cash: number }, firm?: string | { id: string }): Purse   // account firm:<id>, or pool:firms when no id is known
export function poolPurse(name: PoolName, country?: string): Purse                      // account only; add does nothing
export function moveCash(g: GameState, from: Purse, to: Purse, amount: number, reason: Reason, token?: string): number
export function personCash(g: GameState, p: Person, delta: number, why: Why, floor?: number): number   // one-sided: the reason's default counterparty on the other side; no rounding added
export function firmCash(g: GameState, b: { cash: number }, delta: number, why: Why, firm?: string | { id: string }): number
export function payPerson(g: GameState, p: Person, amount: number, reason: Reason): boolean            // the player pays p.money; false when short
export function lend(g: GameState, principal: number, to?: AcctRef, token?: string): number            // the lending mint, to pool:sellers by default
export function writeoff(g: GameState, amount: number, from?: AcctRef): number                          // burn:writeoff from pool:banks by default
export function erodeCash(g: GameState, inflation: number): number                                     // the player's cash: burn or revaluation mint
export function erodeFirm(g: GameState, b: { cash: number }, amount: number, firm?: string | { id: string }): number
```

```ts
// src/game/world/state.ts and world/types.ts (L2; never add src/game/world/index.ts, see section 4 point 2)
export const WORLD_V = 1
export interface WorldState { v: 1; y?: number; ledger?: LedgerShard; people?: PeopleShard; firms?: FirmsShard; homes?: HomesShard; holdings?: HoldingsShard; lod?: LodShard; [other: string]: unknown }
export function readWorld(g: GameState): Readonly<WorldState>                          // pure: absent or garbage reads as { v: 1 }
export function ensureWorld(g: GameState): WorldState                                  // writer: creates { v: 1 }, drops garbage
export function worldShard<T = unknown>(g: GameState, name: string): Readonly<T> | undefined   // pure, normalized by the registered reader
export function registerShard(name: string, def: { normalize: (raw: unknown) => unknown }): void   // at module load; unregistered shards are dropped by normalizeWorld
export function normalizeWorld(raw: unknown): WorldState                               // total and bounded; what the Save track's `world` slice calls
export function shardNames(): readonly string[]                                        // sorted names of the registered shards: read by docs checks (R2-L18) and by the Save track's slice guard
```

```ts
// src/game/world/lod.ts (R2-L16) and budget.ts (R2-L17)
export type LodKind = 'person' | 'firm' | 'home'
export const LOD_CAPS: { readonly people: 400; readonly intimate: 80; readonly firms: 60; readonly fullFirms: 20; readonly homes: 150; readonly jobs: 600 }
export const DEMOTE_AFTER_YEARS: 5
export function promote(g: GameState, kind: LodKind, id: EntityRef): boolean           // false when the kind is full of protected rows
export function demote(g: GameState, kind: LodKind, id: EntityRef, why: 'idle' | 'cap' | 'emigrated'): number   // folds the entity's account; returns what it folded
export function lodSweep(g: GameState): number                                         // idle and over-cap rows, sorted ids, idempotent per year; returns rows demoted
export function seededEntity<T>(g: GameState, kind: string, key: string, make: (rand: () => number) => T): T   // pure, keyed on the id only
export interface WorldBudget { nodes: Record<string, number>; total: number; bytes: number; over: string[] }
export function worldBudget(g: GameState): WorldBudget                                 // pure
export function timed<T>(label: string, fn: () => T): T                                // never saved, never read by the simulation
```

**Consumed (this track relies on these).**

- Wave 0: `stream(g, tag, year, id?)` and `worldSeed(g)` from `src/game/kernel/streams.ts` (only R2-L16's `seededEntity` draws; nothing else in this track draws at all), `findSeed(pred, opts?)` from `test/seed-kit.ts` (for any scenario that needs a particular life; this track pins no `seed: N`), and the codemod's merged tree (the money call sites in `src/game/text/**` and `events/**` may have moved lines).
- R1: `test/scan-kit.ts` (`loadSources`, `splitArgs`, `closeParen`, `isId`, `isPunct`, `lineOf`), `test/shard-kit.ts` (`readSlice`, `seedSlice`, `recordSlice`, `mergedSlices`), the `// ci: fast` marker, `test/fuzz-kit.ts` (`fuzzLife`, `FailureLog`, `deepFreeze`), `test/probe-life.ts`, `test/helpers.ts`.
- From the Kernel track: nothing. `yearlyWorld` is a plain function; the registry wraps it. The bus is not used: this track emits no facts.
- From the Save track: nothing. `g.world` loads whole through `isLoadableGame` today (`save-schema.ts:522`, node cap `finiteJsonTree` at 222) and every reader normalizes, so no `save-schema.ts` edit is needed.

**Rules this track sets for every other track** (R2 on; enforced by tests listed in brackets).

1. Money moves only through `addMoney`, `spend`, `earnIncome` with a `Why`, or the helpers of `cash.ts`, or `book`. A new file may write no `.cash` or `.money` and may not call the three without a reason. [R2-L4]
2. A reason comes from `REASONS`. A track that needs a new one appends one line to `kernel/reasons.ts` in its own commit, with its default counterparties. A new mint or burn needs a lead decision and a ceiling-list entry. [R2-L2, `test/ceiling-list.test.ts`]
3. Nothing in `src/game/kernel/**` or `src/game/world/**` draws from `g.rng`, `Math.random`, `Date` or `performance` (the one exception is `world/budget.ts`, which only measures). [R2-L2 and R2-L17 guards]
4. World state lives in `g.world`, never in `flags`. A new shard registers itself with `registerShard`, ships with its own `v`, normalizer and caps, and is counted by `worldBudget`. [R2-L1, R2-L17]
5. `yearlyWorld` runs last in `YEARLY_HOOKS` (after `milestones`). If the Kernel track's registry converts the list, the phase of `world` must stay after every module that books money. [R2-L17]
6. A flow that crosses countries names `country` in `BookOpts`; the default is the player's country. Tokens embed the year (`redeem:${assetId}:${year}`) so a replayed year books nothing twice. [R2-L2]
7. A shard is written by replacing its root, never by editing it in place: `ensureWorld(g).<name> = { ...next }`. The Save track shares every `g.world.<name>` root between `act()` drafts, deep-frozen, so an in-place write throws a TypeError in every build. `facts`, `people`, `firms`, `homes`, `holdings` and `lod` follow the rule; the one exception is `ledger`, which every booking edits in place, and which the Save track therefore declares as a core slice (`world.ledger`, `write: 'inplace'`: cloned on every tap, never shared, never frozen). Each shard writer has a test that runs it on a state whose shard roots are deep-frozen one by one (the `g.world` container left writable). [R2-L14 to R2-L16; Save R2-S1]

---

## 3. Tasks

### 3.0 Shared design (every task below builds on this; it is the one place the rules are written)

**3.0.1 The ledger model.**

- An account is a string `AcctRef`: `person:<id>`, `firm:<id>`, `bank:<id>`, `gov:<country>`, `pool:<name>`, `pool:hh:<country>`, or `abroad`. Its balance is the **cumulative net flow in whole dollars since the ledger began** and may be negative. Nothing invents an opening balance, so a v4.0.2 save loads with an empty ledger and every pool starts at 0. A balance that returns to 0 is deleted. The player is `person:<character.id>` (`uid(g, 'me')` at `life.ts:750`; an heir keeps the `Person.id` of the child, so an heir's NPC history is already under the right key). A person is `person:<data.sid ?? id>` (R4 introduces `sid`; until then the id).
- Double entry. `book` takes `amount` from `from` and gives it to `to`. A mint credits `to` only and adds to `m[name]`; a burn debits `from` only and adds to `b[name]`. The identity is `sum(a) = sum(m) - sum(b)`. `abroad` is an ordinary account (tax paid abroad is a flow to it, not a burn); only the named mint and burn sinks create or destroy a dollar.
- Whole dollars. Every amount is `Math.round`ed; an amount under 1, a non-finite one or one over `LEDGER_CAPS.maxBooking` (1e15) is rejected and returns 0. A balance may not pass `maxBalance` (9e15, under `Number.MAX_SAFE_INTEGER`), so every sum stays exact.
- Flows. `f["<year>:<country>:<reason>"]` is `[person, firm, bank, gov, pool, abroad, mint, burn]`, the net each class gained (positive) or lost. A booking subtracts from the payer's class and adds to the payee's, so **each row sums to zero**; that is "each year's flows net to zero per reason". `acctClass` maps `person`, `firm`, `bank`, `gov`, `abroad`, `mint`, `burn` to themselves and every other kind (`pool`, `home`, ...) to `pool`. At most 8 distinct countries a year have their own rows (the rest share `*`) and at most 480 rows exist (extra rows go to `*`): country x reason x 2 years, about 4,000 nodes.
- The yearly roll is lazy: the first booking of a new `g.year` pushes a close `[year, sum, cumulative mint, cumulative burn]` (the last 4 are kept), clears `ym`, `yb` and the tokens, and drops flow rows older than `year - 1`. If `g.year` moves backwards (a Time Machine restore, a test) the counters reset with no close. `ageUp` books `settleIncomeTax` before it adds one to `g.year` (`aging.ts:102`), so the old year is closed correctly.
- Tokens. A booking with `token` is skipped when the token is in `r` (a ring of 600 for this year). Tokens embed the year. A wrapper given a token checks `tokenSeen` first and changes no cash on a replay, so a re-run year books and pays nothing twice. This is the pattern of `economy.receipts` (`economy/index.ts:85`, capped at 3,000 there).
- Caps. More than 500 accounts: a booking to a new account is redirected to `pool:other` (log row `redirect`), and the roll deletes zero balances and, above 450, folds the smallest person and firm accounts into `pool:other` (log row `fold`). The log `l` keeps 40 rows `[year, kind, name, amount]`, merged per (year, kind, name).
- Mints and burns are closed lists with a yearly cap (3.0.3). A mint over its room is **clipped** and a `cap` row is logged; the wrapper applies the clipped amount to the cash, so the books and the cash never part. Nothing else clips: a ledger refusal (a replayed token excepted) never changes the player's cash.
- Purity. `peekLedger` and `acctBalance` never write and work on a frozen state; `ledgerRoot` writes, and so throws on a frozen state, which is exactly what the `fuzz-kit` purity walk wants. `ledgerRoot` validates a shard once per object identity (a `WeakSet`), so a `structuredClone` per tap costs one pass over about 5,000 nodes.
- Normalization is total: invalid account keys fold into `pool:other`, non-integers round, over-cap lists are cut, a flow row that does not sum to zero is dropped, and any remaining break of the identity is healed by a mint or burn named `heal` with a log row. `checkLedger` reports a nonzero `heal` as a problem (the probes assert it is 0); a hostile-load test passes `{ allowHeal: true }`.

**3.0.2 The reason table** (initial vocabulary, 63 rows; `kernel/reasons.ts`). `pay` is who receives when the entity pays; `get` is who pays when it receives. A booking names its counterparty by default from this table; `with` overrides it. `hh` is `pool:hh:<country>`, `gov` is `gov:<country>`; the rest are `pool:<name>`; `mint:x` and `burn:x` are the sinks of 3.0.3.

| Group | Reason | pay | get | Use |
|---|---|---|---|---|
| Work | `wage` | employers | employers | salary, job pay, prison wages |
| | `severance` | employers | employers | |
| | `pension` | gov | gov | state and private pension |
| | `benefit` | gov | gov | welfare, allowance, subsidy, royal allowance |
| | `prize` | other | other | contests, awards, windfall prizes |
| | `royalty` | markets | markets | royalties, residuals, advances, licences |
| | `career.income` | employers | employers | the kit's `c.earn` |
| | `career.cost` | other | other | the kit's `c.pay` |
| Tax and law | `tax.income` `tax.capgains` `tax.estate` `tax.property` `tax.sales` `tax.corp` `tax.transaction` `fine` `fee.gov` | gov | gov | `fee.gov`: licences, permits, visas |
| | `legal` | legal | legal | lawyers, settlements, court costs |
| | `bribe` | crime | crime | |
| Living | `rent` | landlords | hh | paying rent goes to landlords, receiving rent comes from households |
| | `living` | retail | retail | cost of living |
| | `purchase` | retail | retail | everyday goods, repairs, upkeep, refunds |
| | `leisure` | leisure | leisure | travel, nightlife, clubs, memberships |
| | `health` | health | health | |
| | `tuition` | edu | edu | |
| | `premium` | insurers | insurers | |
| | `claim` | insurers | insurers | |
| Assets | `property.buy` `property.sell` | sellers | sellers | |
| | `asset.buy` `asset.sell` | retail | retail | vehicles, jewelry, art, instruments |
| Credit | `loan.principal` | banks | `mint:lending` | the lender creates what it lends |
| | `loan.repay` `loan.interest` `fee.bank` | banks | banks | |
| Markets | `trade.buy` `trade.sell` `invest.income` `dividend` | markets | markets | dividends, coupons, interest |
| | `bond.redeem` | gov | gov | F37; always with `with: gov:<issuer>` |
| Luck | `gamble` | leisure | leisure | |
| | `luck` | other | other | an event's money effect with no named party |
| Family | `gift` `inheritance` `support` `divorce` `estate` | family | family | |
| | `donation` | charity | charity | |
| Crime | `crime.take` `crime.cost` | crime | crime | |
| Business | `sales` `payroll` | hh | hh | revenue; wages and benefits paid to staff |
| | `inputs` `capex` | retail | retail | supplies, rent and services of a firm; equipment, buildings |
| | `rnd` `marketing` `draw` `inject` `firm.sale` | other | other | `draw` and `inject` move cash between an owner and a firm: use `moveCash` |
| Sinks | `inflation` | `burn:inflation` | `mint:revaluation` | only `erodeCash` and `erodeFirm` use it |
| | `writeoff` | `burn:writeoff` | `burn:writeoff` | only `writeoff()` uses it |
| | `emigration` | `burn:emigration` | `burn:emigration` | only `demote(..., 'emigrated')` uses it |
| Default | `unreasoned` | other | other | what a call without a reason books; the ratchet counts it |

Pools (`POOLS`, 17 names, closed): `banks`, `charity`, `crime`, `edu`, `employers`, `family`, `firms`, `health`, `hh`, `insurers`, `landlords`, `legal`, `leisure`, `markets`, `other`, `retail`, `sellers`. Reasons are sorted inside their group and there are at most 80 of them (a test). A reason in a saved flow row that is not in the table drops that row on load.

**3.0.3 Mints, burns, spreads** (all in `kernel/reasons.ts` and `kernel/spreads.ts`; each cap is a ceiling-list entry).

| Sink | Cap per year | Why it exists |
|---|---|---|
| `mint:lending` | 2,500,000,000 | the lender creates the deposit it lends (`loan.principal`). The cap is a ceiling for one family's year of new credit; real years in the probe stay far under it |
| `mint:printing` | 0 | central-bank printing in a declared war; R7 raises the cap with its own commit |
| `mint:immigrants` | 500,000,000 | savings that immigrants bring; first used by the R4 world step |
| `mint:revaluation` | 1,000,000,000,000 | falling prices raise what held cash buys (the engine stores purchasing power, so `c.money /= 1 + inflation` at `aging.ts:119` is a gain when inflation is negative: the economy allows -0.5, `economy/model.ts:120`) and an inflating debt shrinks. The spec lists only the erosion burn; this mint keeps conservation exact (section 5, point 2) |
| `burn:inflation` | 1,000,000,000,000 | erosion of held cash and company cash |
| `burn:writeoff` | 1,000,000,000,000 | a debt removed without payment: the lender's loss destroys the deposit it created |
| `burn:emigration` | 1,000,000,000,000 | what a named entity takes out of the world when it leaves |

`SPREADS` (fraction of the mid price each side): `markets` 0.001, `sellers` 0.03, `retail` 0.10, `other` 0.05, `banks` 0.002, every other pool 0.05. `ask(mid, pool) = mid * (1 + s)`, `bid(mid, pool) = mid * (1 - s)`. They are the floors the round-trip probes assert (a buy from a pool followed by a sale to it loses at least `2 * s * mid` unless the path has a larger cost of its own, as the broker fee and price impact of `investments.ts` are).

**3.0.4 The migration recipe** (R2-L6 to R2-L12 follow it; a Sonnet agent can apply it site by site).

1. One-sided calls: add the third argument. `addMoney(g, x)` -> `addMoney(g, x, 'purchase')`. Keep the call's own rounding and clamps; add nothing else.
2. A known counterparty: the object form, `addMoney(g, x, { reason: 'bond.redeem', with: ref('gov', cid) })`.
3. Raw writes on the player's cash keep their exact behavior and become wrapper calls. `g.character.money -= cost` -> `addMoney(g, -cost, 'reason')` (not `spend`: `-=` never checked affordability). `c.money = Math.round(c.money - x)` -> `addMoney(g, -x, ...)`. `c.money = 0` -> `addMoney(g, -c.money, ...)` with the reason of what took it.
4. Raw writes on a `Person` -> `personCash(g, p, delta, 'reason', floor?)`; a site that wrote `Math.max(0, ...)` passes `floor` 0. **Do not add rounding**: NPC wealth is a float in places (`npc-lives.ts:187` `p.money += result.stmt.ownerPay * .8`); `personCash` books `Math.round(delta)` and applies `delta` as it was.
5. Raw writes on a company's cash -> `firmCash(g, b, delta, 'reason', a.id)` (pass the asset id when the asset is in scope).
6. A move between two purses (player and a person, a firm and its owner, two firms) is one call: `moveCash(g, from, to, amount, 'reason')`. Never book it as two one-sided calls.
7. A site that mixes flows in one number (proceeds net of a debt): book the net under the reason of the larger part and say so in a short comment (`// one booking: net of the payoff`). Split only when the split is one line.
8. Loans: a place that creates a `Mortgage` literal or pushes a loan record without `addLoan` calls `lend(g, principal, to)`; a place that removes a loan or mortgage that had a positive balance and was not paid in cash calls `writeoff(g, balance)`.
9. Never touch: the bodies of `core.ts` and `cash.ts`, anything under `kernel/`, and the `money:` literals of a new `Character` or `Person` (an opening balance is not a flow).
10. A site that is not a purse (a local slice's `cash` field, a display struct) gets the comment `ledger-ok: <why>` on its line and is not counted. Never on `character.money`, `Person.money` or `BizState.cash`. A test caps the markers at 12 and R2-L18 lists them.
11. A site that cannot be mapped (rare): leave it, list `file:line` in the PR, keep it in the baseline. Do not use `'unreasoned'` as a literal: the ratchet counts it as unreasoned.
12. If the table has no fitting reason, append one row to `kernel/reasons.ts` (alphabetical in its group, default counterparties, a note) and say so in the PR.

**3.0.5 Conventions for every task.**

- Test first: write the red test, run it, see it fail for the stated reason, then change the source. The check commands run from `/Users/saeed/projects/anotherlife/wt/r2-release`: `/Users/saeed/projects/anotherlife/wt/bin/tc` and `/Users/saeed/projects/anotherlife/wt/bin/vt <files>`. Never the full suite, never `npm install`, never a build except `/Users/saeed/projects/anotherlife/wt/bin/vb` when a task says so.
- After each source change that adds an import, run `vt test/architecture.test.ts`: the cycle ratchet fails when a module joins one of the five cycles (`finance.ts`, `assets.ts`, `nation/effects.ts`, `business/exit.ts` and `careers.ts` are inside them; `core.ts`, `life.ts`, `aging.ts`, `investments.ts`, `cash.ts` and everything new are not, and must stay out).
- Dash check, before every commit: `perl -CSD -ne 'print "$ARGV:$.\n" if /[\x{2013}\x{2014}]/' <each new file>` prints nothing, and `git diff -U0 -- <each modified file> | perl -CSD -ne 'print if /^\+.*[\x{2013}\x{2014}]/'` prints nothing (`src` is capped at exactly 24 em-dashes by `test/voice-guards.test.ts`; `assets.ts` holds three of them).
- No pinned `seed: N` in new tests. A scenario that needs a particular life uses `findSeed(pred)`; most scenarios here build the state with `makeTestGame` (`test/helpers.ts:66`) and need no seed.
- A pinned number changes only when the new rule legitimately changes it, with the reason in the commit message. Never skip, delete or weaken a test.
- Commit with explicit pathspecs (`git add <path> ...`, never `-A` or `.`); the message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### R2-L1 World root, entity ids, the hostile-load reader

**Goal.** Give every later task a home for world state and one id scheme, with a reader that is empty when the field is absent and bounded when it is hostile, before any money moves.

**Items.** A.K2 (a): the `g.world` skeleton, `EntityRef`, `ensureWorld`; RF3 and RF4 for the root.

**Files.**
- Create: `src/game/kernel/ids.ts` (about 60 lines), `src/game/kernel/ledger-types.ts` (types only, about 45), `src/game/world/caps.ts` (about 25), `src/game/world/types.ts` (types only, about 90), `src/game/world/state.ts` (about 240), `test/world-state.test.ts` (first line `// ci: fast`).
- Modify: `src/game/types.ts`: line 5 is `import type { ChartSpec } from './charts/spec'`; add `import type { WorldState } from './world/types'` under it, and add `world?: WorldState` with a one-line doc comment after `flags: Record<string, Json>` (line 710, inside `GameState`, which spans 685-714).
- Read, do not edit: `src/game/save-schema.ts` (`finiteJsonTree` 222, `isLoadableGame` 522: unknown top-level keys pass, bounded by the 500,000-node cap), `src/game/life.ts` (`continueAsChild` 1138, `structuredClone(g)` 1143), `src/game/world.ts` (1,580 lines of countries and names; it keeps owning the specifier `./world`: see section 4 point 2).

**Interfaces.** The signatures of `ids.ts`, `state.ts` and `types.ts` are in section 2. The rest:

```ts
// src/game/kernel/ledger-types.ts
export interface LedgerShard {
  v: 1
  y: number                               // the calendar year of the yearly counters
  a: Record<string, number>               // account -> net balance, whole dollars
  m: Record<string, number>               // cumulative mint by name
  b: Record<string, number>               // cumulative burn by name
  ym: Record<string, number>              // this year's mint by name (the caps read it)
  yb: Record<string, number>              // this year's burn by name
  f: Record<string, number[]>             // "<year>:<country>:<reason>" -> [person, firm, bank, gov, pool, abroad, mint, burn]
  r: string[]                             // tokens booked this year
  c: [number, number, number, number][]   // closes, newest last: [year, sum, cumulative mint, cumulative burn]
  l: [number, string, string, number][]   // log, newest last: [year, kind, name, amount]
  k: number                               // bookings since the ledger began
}
// src/game/world/caps.ts
export const LOD_CAPS = { people: 400, intimate: 80, firms: 60, fullFirms: 20, homes: 150, jobs: 600 } as const
export const HOLDING_ROWS_CAP = 1_200
export const WORLD_NODE_CAP = 40_000        // nodes of g.world after normalization
export const DEMOTE_AFTER_YEARS = 5
// src/game/world/types.ts (types only; the shard readers arrive in R2-L14 to R2-L16)
export interface PersonRow { id: EntityRef; seen: number }
export interface PeopleShard { v: 1; rows: PersonRow[]; over: number }
export interface FirmRow { id: EntityRef; form: 'biz' | 'npc'; owner: EntityRef; seen: number }
export interface FirmsShard { v: 1; rows: FirmRow[]; over: number }
export interface HomeRow { id: EntityRef; owner: EntityRef; seen: number }
export interface HomesShard { v: 1; rows: HomeRow[]; over: number }
export type HoldingRow = [owner: EntityRef, asset: EntityRef, share: number]
export interface HoldingsShard { v: 1; y: number; rows: HoldingRow[] }
export interface LodShard { v: 1; y: number; pooled: { person: number; firm: number; home: number }; demoted: number }
```

**Behavior.**
- `readWorld`: `g.world` is a plain object with `v === 1` -> it; anything else -> a frozen `{ v: 1 }`. It never writes.
- `ensureWorld`: the same test; on failure it assigns `g.world = { v: 1 }` (garbage is dropped here, on the first write, never on a read).
- `registerShard(name, def)`: `name` matches `^[a-z][a-z0-9]{0,15}$` and is neither `v` nor `y`; registering the same `def` twice is fine, a different one for the same name throws. `shardNames()` returns the registered names, sorted (cross-check addition: R2-L18 test 8 and the Save track's guard need the list).
- `worldShard(g, name)`: undefined when the shard is absent or unregistered; otherwise `def.normalize(raw)`, cached in a `WeakMap` by the identity of `raw` (valid input comes back as the same object, so a second call is free; a `structuredClone` normalizes once more).
- `normalizeWorld(raw)`: not a plain object or `v !== 1` -> `{ v: 1 }`; keeps `y` only as an integer in 1900 to 100000; for each own key in sorted order that is a registered shard, keeps `def.normalize(value)` when it is not undefined and drops every other key; if the result passes `WORLD_NODE_CAP` it drops shards, largest node count first (ties by name), until it fits. Never throws, whatever the input (a `__proto__` key, an array, a number).
- Nothing in this task registers a shard; R2-L2 registers `ledger`.

**Steps.**
1. Write `test/world-state.test.ts` first (red: the modules do not exist):
   1. `readWorld(makeTestGame())` is `{ v: 1 }` and the state's JSON is unchanged; on a `deepFreeze`d state it does not throw.
   2. `ensureWorld` creates `{ v: 1 }` once (the same object on the second call) and replaces `world` set to `5`, `'x'`, `[]`, `null`, `{ v: 2 }`, `{ v: 1.5 }`.
   3. `normalizeWorld` over a table of hostile inputs (null, undefined, a number, an array, `{ v: 1, y: 'x' }`, `{ v: 1, y: 1e9 }`, an unregistered shard, a `__proto__` key built with `JSON.parse`): always a valid `{ v: 1, ... }`, `y` dropped when bad, unknown shards dropped.
   4. With a synthetic registered shard (`probe`, normalizer keeps at most 3 rows of finite numbers): 500 rows come back as 3; a shard of 100,000 nodes is dropped by the node cap; the result never exceeds 40,000 nodes; `y` survives when valid.
   5. `worldShard` is undefined for an absent or unregistered shard; the normalizer runs once for the same object and once more after a `structuredClone`.
   6. `shardNames()` lists the registered names sorted (the synthetic `probe` shard appears after it registers). `registerShard` rejects `'v'`, `'y'`, `'Bad'` and a 17-character name; the same `def` twice is fine; a different `def` for a taken name throws.
   7. Heir by clone (RF3): a game with `world = { v: 1, y: 2026, probe: { v: 1, rows: [1, 2] } }`, a dead player (`character.alive = false`) and a child made with `createPerson` (as `test/life.test.ts` does): `continueAsChild(g, child.id).world` deep-equals the old one, is a different object, and `.probe` is a different object too.
   8. Ids: `ref('person', 'me1')` is `person:me1`; `ref('pool', 'hh:us')` is `pool:hh:us`; `ref('Person', 'x')`, `ref('person', '')`, a key with a space and a 53-character key throw `RangeError`; `parseRef('pool:hh:us')` is `{ kind: 'pool', key: 'hh:us' }`; `parseRef('abroad')`, `parseRef(5)` and `parseRef('a:b')` are null; `isRef` agrees on all of them.
2. Create the files; the types hunk.
3. Run `tc` and `vt test/world-state.test.ts test/life.test.ts test/heir-world-flags.test.ts test/save-hydrate.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** "`g.world` absent reads as empty" (test 1), "reaches heirs by clone, RF3" (test 7), the root of "hostile and garbage `g.world` loads bounded, RF4" (tests 2 to 4; the end-to-end load is in R2-L18).
**Size.** About 470 source lines, 330 test lines.
**Risks.** (1) `world.ts` and `world/` coexist: `./world` resolves to the file first in TypeScript's bundler mode and in Vite, and 172 imports rely on it; never add `world/index.ts` (it would be shadowed and confusing). (2) `types.ts` and `world/types.ts` import each other as types only; the cycle ratchet reads runtime edges, and `vt test/architecture.test.ts` proves it. (3) The index signature `[other: string]: unknown` on `WorldState` keeps the named fields typed (`g.world.ledger` is `LedgerShard | undefined`).

---

### R2-L2 Ledger core: reasons, mints and burns, `book`, flows, checks

**Goal.** Build the ledger core as a leaf: accounts, double entry, declared and capped mints and burns, flows, year closes, tokens and the invariant check.

**Items.** A.K1 (a): the ledger, declared mints and burns with yearly caps and a log row, the flows table, the invariant check, the bid-ask spreads.

**Files.**
- Create: `src/game/kernel/reasons.ts` (about 260 lines: the table of 3.0.2, `POOLS`, `MINTS`, `BURNS`, `counterparty`), `src/game/kernel/spreads.ts` (about 45), `src/game/kernel/ledger.ts` (about 700), `test/ledger.test.ts` (first line `// ci: fast`), `test/ledger-guards.test.ts` (first line `// ci: fast`).
- Create: `src/game/world/shards.ts` (about 15 lines, the registration hub, a cross-check addition: it imports `./state` and `../kernel/ledger` and calls `registerShard('ledger', { normalize: (raw) => normalizeLedger(raw) })`; each later shard task appends one line). `state.ts` imports no shard module: every shard module imports `state.ts`, so the reverse import would be a 2-module cycle that `test/architecture.test.ts` rejects. A test or module that calls `normalizeWorld` or `worldShard` imports `./world/shards` for effect.
- Modify: `test/ceiling-list.json` (append four entries, see below).
- Read, do not edit: `src/game/economy/index.ts` (receipts at 85 and 108), `src/game/economy/model.ts` (inflation range at 120).

**Interfaces.** The signatures are in section 2. Internals worth fixing now:

```ts
// reasons.ts
export const REASONS = { wage: { pay: 'employers', get: 'employers', note: '...' }, /* 63 rows, 3.0.2 */ } as const satisfies Record<string, ReasonDef>
export type Reason = keyof typeof REASONS
export type Cp = PoolName | 'gov' | 'abroad' | `mint:${MintName}` | `burn:${BurnName}`
export interface ReasonDef { pay: Cp; get: Cp; note: string }
export const MINTS: { lending: { cap: 2_500_000_000; why: string }; printing: { cap: 0; why: string }; immigrants: { cap: 500_000_000; why: string }; revaluation: { cap: 1_000_000_000_000; why: string } }
export const BURNS: { emigration: ...; inflation: ...; writeoff: ... }          // each cap 1_000_000_000_000
export function counterparty(cp: Cp, country: string): AcctRefString            // 'hh' -> `pool:hh:${country}`, 'gov' -> `gov:${country}`, pool names -> `pool:${name}`, the rest as written
// ledger.ts internals (not exported unless a test needs them): roll(g, L), touch(L, acct), flowRow(L, year, country, reason), the WeakSet of validated shards
export function tokenSeen(g: GameState, token: string): boolean                 // pure; the wrappers check it before they move cash
export function checkLedger(g: GameState, opts?: { allowHeal?: boolean }): LedgerReport
```

**Behavior.**
- `ledger.ts` also re-exports the two tables (`export { MINTS, BURNS } from './reasons'`), so the lead's fixed names ("declared MINTS and BURNS in ledger.ts") resolve from either file; Platform's integration pass (R2-P11) imports them from `kernel/reasons`. `ledgerRoot` may not import `world/state.ts` (a kernel file imports only kernel files), so it applies the `ensureWorld` rule itself in six lines: a `g.world` that is a plain object with `v === 1` is kept, anything else is replaced by `{ v: 1 }` on the first booking.
- `book(g, reason, from, to, amount, token?)`: round; reject (0) a bad amount, a bad or equal account pair, an unknown reason, a `mint:` payer or a `burn:` payee (those go through `bookMint` and `bookBurn`) and any booking that would push a balance past `maxBalance`. Then `ledgerRoot`, roll the year, take the token, redirect a new account over the cap, move the balances (delete a balance that reaches 0), add to the flow row, `k += 1`, return the amount.
- `bookMint(g, name, to, amount, reason?, token?)`: the reason defaults per sink (`lending` -> `loan.principal`, `revaluation` -> `inflation`, `printing` -> `benefit`, `immigrants` -> `wage`). Clips to `MINTS[name].cap - ym[name]`; the clipped part is logged as a `cap` row; adds to `m`, `ym`, credits `to`, books the flow row (mint class negative, payee class positive), logs a `mint` row. `bookBurn` mirrors it.
- `bookPlayer(g, why, delta)`: `why` is a reason string, an object, or undefined (`unreasoned`). Positive delta: the payer is `with` or `counterparty(def.get, country)`; if that is `mint:x` it calls `bookMint`; negative delta mirrors it with `def.pay` and `bookBurn`. The country is `why.country ?? g.character.countryId`.
- `foldAccount`: moves the whole balance (which may be negative), deletes the source, logs a `fold` row, books no flow (it is a relabel, not money moving).
- `checkLedger`: recomputes the sum from the accounts and tests `|sum - (sum m - sum b)| <= 1`; every pair of closes against its mint and burn deltas (within $1); the live sum against the last close the same way; every flow row sums to 0 and has 8 integers; the yearly mint and burn against their caps; list sizes against `LEDGER_CAPS`; the closes' years strictly increase; `heal` totals are 0 unless `allowHeal`.
- `normalizeLedger`: as 3.0.1 (a valid shard is returned as the same object; garbage is rebuilt, overflow folded into `pool:other`, the identity healed).

**Steps.** Write the tests first (red: nothing exists), then the files.
1. `test/ledger.test.ts`:
   1. Double entry: bookings between `person:a`, `pool:retail`, `gov:us` keep `sum(a)` at 0; an account that returns to 0 is deleted; flows rows for `purchase` and `tax.income` have the expected class vectors.
   2. Rejections return 0 and change nothing: `NaN`, `Infinity`, 0.4, `-5`, 2e15, equal accounts, `'bad'` as an account, an unknown reason, `mint:lending` as a payer, a balance that would pass 9e15.
   3. Mint: `bookMint('lending')` credits only the payee and `sum(a)` equals the mint; two mints that together pass 2.5e9 in one year clip the second and log a `cap` row; setting `g.year += 1` gives the room back; `printing` (cap 0) always books 0; `bookBurn` mirrors all of it.
   4. Tokens: the same token twice books once; the token is free again next year; the ring holds 600 and drops the oldest; `tokenSeen` agrees.
   5. Flows: every row sums to 0 after 2,000 random bookings (a local seeded PRNG in the test, not `g.rng`); the ninth distinct country in a year lands in `*`; the 481st row lands in `*`; the roll drops rows older than last year; `flowsOf` is sorted and returns this year and last year only.
   6. Closes and the identity: six simulated years of random bookings, mints and burns; after each, `checkLedger(g).ok` and the close rows satisfy `s2 - s1 = (m2 - m1) - (b2 - b1)` within 1; at most 4 closes are kept; a clock that moves backwards resets the counters without a close.
   7. Account cap: 600 distinct `person:` accounts leave at most 500 keys, the extra bookings land in `pool:other` with a `redirect` row, and the sum is unchanged; the roll folds the smallest person and firm accounts when over 450.
   8. Hostile `normalizeLedger`: 50,000 accounts, `1e300`, `-0`, 2.5 balances, invalid keys, a mismatched sum, a flow row that does not sum to 0, 1,000 tokens, a closes list of 50: always valid, within every cap, `heal` logged when the identity had to be restored; `checkLedger(g, { allowHeal: true }).ok` is true afterwards and `checkLedger(g).ok` is false when `heal` is nonzero; a valid shard comes back as the same object.
   9. Purity: `peekLedger` and `acctBalance` work on a `deepFreeze`d state and return the empty shard; `ledgerRoot` on the frozen state throws a `TypeError`; a garbage `world.ledger` reads as empty through `peekLedger` without writing.
   10. Table sanity: every reason's `pay` and `get` resolve through `counterparty(cp, 'us')` to a valid `AcctRef` or sink; the reasons are sorted inside their groups and number at most 80; every mint and burn has a finite cap; `REASONS` has the 63 rows of 3.0.2 (a pinned list, so a deletion is a decision).
   11. Determinism: the same bookings give the same JSON; a JSON round trip, then more bookings, equals the uninterrupted run.
   12. Cost: 100,000 `book` calls between 40 accounts finish in under 400 ms (generous; the budget is about 100 ms); `ledgerRoot` after a `structuredClone` of a 450-account ledger with full flows takes under 10 ms.
   13. Spreads: for every pool `bid(ask(x, p), p) < x`, `ask > mid > bid`, and `SPREADS` has an entry for every pool name.
   14. A garbage `g.world` (a number, an array, `{ v: 2 }`) is replaced by `{ v: 1, ledger }` on the first `book`, and a valid `g.world` with other shards keeps them (the six-line copy of the `ensureWorld` rule agrees with `world/state.ts`: run both on the same table of inputs).
2. `test/ledger-guards.test.ts` (reads `src/` with `test/scan-kit.ts`):
   1. Every file in `src/game/kernel/` imports, at runtime, only other kernel files and `../rng`; `../types` only as `import type`. Wave 0's `streams.ts` is held to the same rule.
   2. No file in `src/game/kernel/` and none in `src/game/world/` (except `budget.ts` for `performance`) has a call token `rand`, `randInt`, `randFloat`, `chance`, `pick`, `weightedPick`, `shuffle`, `bell`, `uid`, or the tokens `Math.random`, `Date`, `.rng`.
   3. No U+2013 or U+2014 in `src/game/kernel/**`, `src/game/world/**`, `src/game/cash.ts`, `test/ledger*.ts`, `test/world-*.ts`, `docs/LEDGER.md`, `docs/WORLD.md` (a file that does not exist yet is skipped, so later tasks are covered without edits here).
3. Write the source. Then append to `test/ceiling-list.json`: `{ "id": "mint-caps", "file": "src/game/kernel/reasons.ts", "token": "MINTS", "cap": "every mint has a yearly cap: lending 2.5e9, printing 0, immigrants 5e8, revaluation 1e12 (R2-L2)" }`, `burn-caps` (`BURNS`), `ledger-caps` (`src/game/kernel/ledger.ts`, token `LEDGER_CAPS`: "500 accounts, 480 flow rows, 1e15 per booking, 9e15 per balance"), `pool-spreads` (`src/game/kernel/spreads.ts`, token `SPREADS`: "no pool round trip is free").
4. Run `tc`; `vt test/ledger.test.ts test/ledger-guards.test.ts test/world-state.test.ts test/ceiling-list.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** Declared mints and burns each capped with a log row (tests 3, 6), conservation by construction and its check (tests 1, 6, 8), flows net to zero per reason (test 5), bounded flows (test 5, 7), pool prices carry spreads (test 13), the ledger is cheap (test 12).
**Size.** About 1,065 source lines (the hub 15 included), 800 test lines.
**Risks.** (1) The ledger is hot: no allocation in the fast path of `book` beyond the flow-row key; the micro-benchmark guards it. (2) The 63-row table is a vocabulary decision; later batches may append rows, never rename. (3) `bookMint` clipping is the only place the ledger can change play; the caps are far above anything a life reaches (the probe asserts the largest yearly mint stays under a quarter of its cap for `lending`).

---

### R2-L3 The three wrappers, the cash helpers, erosion, `addLoan`

**Goal.** Make the three money primitives and the person and company cash helpers book every dollar once, with named default counterparties, the inflation burn and the lending mint.

**Items.** A.K1 (b): wrap the three money primitives, the company cash helpers, the declared inflation burn, the lending mint.

**Files.**
- Modify: `src/game/core.ts`: imports at lines 2 and 3 (`./notice-weights`, `./rng`); replace `addMoney` (63), `spend` (70) and `earnIncome` (82) with the versions below; `canAfford` (92) and everything after it are untouched.
- Modify: `src/game/finance.ts`: `addLoan` (344): `NewLoan` (declared just above it) gains `to?: AcctRef` and `noMint?: boolean`; after `g.character.loans.push(loan)` it calls `bookMint(g, 'lending', l.to ?? 'pool:sellers', loan.balance, 'loan.principal')` unless `noMint`.
- Modify: `src/game/assets.ts`: the one line at 4279, `addLoan(g, { kind: 'personal', lender: m?.lender ?? 'The bank', principal: shortfall, ... })`, gains `noMint: true` (a foreclosure shortfall turned into a personal loan creates no new money). R2-L6 does the rest of the file.
- Modify: `src/game/special/kit/year.ts`: `earn` (75-89) calls `earnIncome(g, n, 'career.income')`, `pay` (90-103) calls `spend(g, n, 'career.cost')`.
- Modify: `src/game/aging.ts`: line 119 `c.money /= 1 + economyOf(g).inflation` becomes `erodeCash(g, economyOf(g).inflation)`; add `import { erodeCash } from './cash'`.
- Create: `src/game/cash.ts` (about 300 lines), `test/ledger-kit.ts` (about 90, no vitest import), `test/ledger-wrappers.test.ts` (first line `// ci: fast`).

**Interfaces.** `core.ts` and `cash.ts` signatures are in section 2. The wrapper bodies keep today's validation and rounding exactly:

```ts
export function addMoney(g: GameState, delta: number, why?: Why): number {
  const before = g.character.money
  if (!Number.isFinite(before) || !Number.isFinite(delta) || !Number.isFinite(before + delta)) return 0
  const w = typeof why === 'string' ? { reason: why } : why
  if (w?.token && tokenSeen(g, w.token)) return 0
  const d = delta > 0 ? Math.min(delta, roomFor(g, w)) : delta     // roomFor: the mint's room when the reason's `get` is a mint, else Infinity
  const after = Math.round(before + d)
  g.character.money = after
  bookPlayer(g, why, after - before)
  return after - before
}
// spend: amount <= 0 -> true (nothing booked); money < amount -> false; else money = Math.round(money - amount); bookPlayer(g, why, money_after - money_before)
// earnIncome: amount <= 0 -> 0; money = Math.round(money + amount); taxableIncome = Math.round(prev + amount); bookPlayer(g, why, money_after - money_before)
```

`cash.ts` behavior:
- `playerPurse(g)`: acct `playerAcct(g)`; `add(d)` is `addMoney(g, d)` without booking (the purse only applies; `moveCash` books). Implemented with the same finite checks and `Math.round`.
- `personPurse(p, floor?)`: acct `person:${p.data.sid ?? p.id}` (a string `sid` only); `add(d)` sets `p.money = Math.max(floor ?? -Infinity, p.money + d)` (no rounding) and returns the applied change.
- `firmPurse(b, firm?)`: acct `firm:<id>` (`firm` as a string or as `{ id }`), else `pool:firms`; `add(d)` is `b.cash += d`.
- `poolPurse(name, country?)`: acct `pool:<name>` (`pool:hh:<country>` for `hh`); `add` returns its argument and does nothing.
- `moveCash(g, from, to, amount, reason, token?)`: finite and positive or return 0; token replay returns 0; `give = -from.add(-amount)` (what the payer really gave, after any floor); `to.add(give)`; `book(g, reason, from.acct, to.acct, give, token)`; return `give`.
- `personCash` and `firmCash` are one-sided: apply, then `bookPlayer`-style booking with the entity's account (`bookEntity(g, acct, why, applied)`: the same sign rule as `bookPlayer`, the entity instead of the player).
- `payPerson`: false unless `canAfford(g, amount)`; else `moveCash(playerPurse, personPurse(p), amount, reason)`.
- `lend`: `bookMint(g, 'lending', to ?? 'pool:sellers', principal, 'loan.principal', token)`. `writeoff`: `bookBurn(g, 'writeoff', from ?? 'pool:banks', amount, 'writeoff')`.
- `erodeCash(g, inflation)`: not finite or `inflation <= -1`: return 0. `after = Math.round(before / (1 + inflation))` (a deliberate whole-dollar rounding: it keeps cash and books equal; it moves money by under $0.5 a year and is the one rounding change of the track); `after < before` -> `bookBurn(g, 'inflation', me, before - after, 'inflation')`; `after > before` (deflation, or a negative balance shrinking) -> `bookMint(g, 'revaluation', me, after - before, 'inflation')`; the cash is set to what the ledger booked (a clipped mint leaves the rest unapplied). Returns the signed change.
- `erodeFirm(g, b, amount, firm?)`: `b.cash -= amount` (amount may be negative) and the same burn or mint under the firm's account; it is the company-cash version used by the sims that write `cashErosion`.

**Steps.** Write the tests first.
1. `test/ledger-wrappers.test.ts`:
   1. Parity: reference copies of the v4.1.1 bodies of the three functions live in the test; over a table of 30 inputs (integer and fractional starts, 0, negative, `NaN`, `Infinity`, huge) the new wrappers leave `money` and `flags.taxableIncome` identical and return the same boolean from `spend`.
   2. Every dollar booked once: 500 random calls (a local PRNG) over the three wrappers and ten reasons from an integer start: after each call `driftSince(g, before)` is 0 and `checkLedger(g).ok`.
   3. Counterparties: `addMoney(g, -500, 'tax.income')` makes the `tax.income` row show `gov` +500 and `person` -500; `'rent'` pays `pool:landlords` and receives from `pool:hh:us`; `{ reason: 'bond.redeem', with: 'gov:fr' }` books the French government; `{ country: 'fr' }` switches `hh` and `gov`; no reason books `pool:other` under `unreasoned`.
   4. Mint clip: `addMoney(g, 5e9, 'loan.principal')` raises cash by 2.5e9 only, logs a `cap` row, a second call that year adds 0, and one year later the room is back.
   5. Tokens: `earnIncome(g, 100, { reason: 'wage', token: 't' })` twice changes cash once.
   6. Erosion: 1,000,000 with inflation 0.1 burns 90,909 and leaves 909,091; inflation -0.5 doubles the cash and mints `revaluation`; cash -1,000 with inflation 0.1 mints 91; `NaN` and `-1` do nothing; `createNewLife` then three `ageUp` calls keep `checkLedger(g).ok` and book an `inflation` row.
   7. Helpers: `personCash` with `floor` 0 never goes below 0 and books what it applied; `moveCash` applies both sides and books once, and books only what a floor-0 payer really had; `payPerson` returns false and books nothing when short; `firmCash` without an id uses `pool:firms`; `lend` clips like a mint; `writeoff` burns from `pool:banks`; `poolPurse` changes nothing.
   8. `addLoan` books the lending mint to `pool:sellers` by default, to `to` when given and nothing with `noMint`.
   9. The kit: `c.earn('Fee', 500)` and `c.pay('Agent', 200)` book `career.income` and `career.cost` (use `careerCtx` from `special/kit/year.ts`).
2. Write `test/ledger-kit.ts`: `booksOf(g)` (cash and the player's account), `driftSince(g, before)` (cash change minus account change; 0 when every change was booked), `flowTotal(g, reason, cls, year?, country?)`, `acctOf(g, acct)`, `expectConserved(g)` (throws with the `checkLedger` problems).
3. Write the source, then:
   `tc`; `vt test/ledger-wrappers.test.ts test/ledger.test.ts test/core.test.ts test/finance.test.ts test/assets.test.ts test/life.test.ts test/career-year.test.ts test/career-state.test.ts test/investments.test.ts test/architecture.test.ts`.
4. Wave 0's canary (`test/fixtures/r2-parity.json`, `test/r2-codemod-parity.test.ts`) moves here on purpose: `erodeCash` rounds the player's cash to whole dollars, so the `character` digests change in every life. Run `vt test/r2-codemod-parity.test.ts` once (it must fail only on `character`, and `rng` must not move: no draw was added), then `R2_PARITY_RECORD=update /Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod-parity.test.ts` and put "moved character: erodeCash rounds cash to whole dollars" in the commit message. R2-L6, R2-L13 and the Save track's R2-S10 do the same for their own legitimate moves (cross-check contract: the canary is re-recorded by the task that moves it, never by hand).
   Dash check. Commit.

**Acceptance proved.** Every dollar through the three primitives is booked once (test 2); the inflation erosion of cash is a declared burn (test 6); the lending mint exists and is capped (tests 4, 8).
**Size.** About 520 source lines (core 70, cash 300, finance 15, kit 10, aging 5, assets 1, plus the kit file 90 counted as test), 520 test lines.
**Risks.** (1) The rounding in `erodeCash` can move a pinned money number by under $0.5; if a pinned test moves, say so in the commit message. (2) `addMoney` and `earnIncome` now return a number; callers that ignore it are unaffected, and no caller uses the result in a condition today. (3) Hot path cost: every wrapper call books; the R2-L2 micro-benchmark and the R2-L5 bookings-per-year bound are the guard.

---

### R2-L4 The reasoned-call ratchet

**Goal.** Freeze the count of unreasoned money calls and raw writes so it can only fall, and give each migration batch a red test.

**Items.** A.K1 (c): unreasoned `addMoney`, `earnIncome`, `spend` calls and raw `.cash` and `.money` writes never rise.

**Files.**
- Rewrite: `test/money-ratchet.test.ts` (282 lines today; the header explains the R1 rule and names this task as its replacement), `test/money-ratchet.json` (139 lines, version 1, 134 files).
- Read: `test/scan-kit.ts` (`splitArgs`, `closeParen`, `isId`, `isPunct`, `lineOf`, `loadSources`).

**Behavior.** For every file of `src/` (not tests, not `.d.ts`), tokens only:
- Calls of `earnIncome`, `addMoney`, `spend` (a call is an identifier followed by `(`, not after `function`). A call is **reasoned** when it has a third argument and that argument is not the single token `undefined` or `null` and not the string `'unreasoned'`. A string literal as that argument must be a key of `REASONS` (imported from `src/game/kernel/reasons.ts`, a leaf), else the test fails with the unknown name; an object literal must start `{ reason:`; any other expression (a variable `why`) counts as reasoned.
- Raw writes: `.cash` or `.money` followed by `=`, `+=`, `-=`, `*=` or `/=`, on any receiver, ignoring a site whose own source line carries the comment `ledger-ok:` (3.0.4 point 10).
- The counted keys, nonzero only, per file: `earnIncome`, `addMoney`, `spend` (unreasoned calls only), then `.cash +=`, `.cash -=`, `.cash =`, `.cash *=`, `.cash /=` and the same five for `.money`.
- Rules: a count above the file's baseline fails; a nonzero count in a file with no entry fails; every path prefix in `MIGRATED` (an array, one prefix per line, empty at first) must hold zero counted sites, and the failure lists `file:line` for each; the number of `ledger-ok:` markers in `src/` is at most 12.
- Baseline `{ "v": 2, "files": { "src/game/assets.ts": { "addMoney": 22, "spend": 17, ".money =": 1 }, ... } }`, one line per file, files and keys sorted. `UPDATE_MONEY_RATCHET=1` lowers entries and refuses to raise or add; `UPDATE_MONEY_RATCHET=init` writes version 2 from the current tree and only when the file is missing or still version 1. The first commit of this task uses `init`; the commit message states the measured total (expected 773 sites in 171 files on the R2 base).

**Steps.**
1. Write the new test first. Keep every `it` of the R1 file (the real-source ratchet, "counts a good many places", the what-counts group, the failing-on-violation group, the baseline-update group, the baseline-file group, the anchored spot checks); widen them to version 2 and to the new keys, and do not weaken any threshold. Add:
   1. A reasoned call is not counted; `addMoney(g, 5)`, `spend(g, 5, undefined)`, `earnIncome(g, 5, null)` and `addMoney(g, 5, 'unreasoned')` are; `addMoney(g, 5, why)` and `addMoney(g, 5, { reason: 'wage', token: t })` are not.
   2. An unknown literal reason fails and names it; `{ with: x }` without `reason` is counted.
   3. Raw writes: `c.money -= 1`, `b.cash = 0`, `c.money /= 2`, `x.y.cash *= 3` are counted; `money = 5` (a bare name), `a.cashier += 1`, `{ money: 5 }`, a comment and a string are not; a line carrying `// ledger-ok: local slice` is not counted.
   4. `MIGRATED` fails on one site with `file:line`, passes with none; a synthetic file under a migrated prefix with a reasoned call passes.
   5. The scan sees everything the R1 rules saw: the test keeps the R1 counting function as `legacyCount` and asserts that, over the real tree, the v2 scan's total calls (reasoned or not) equal `legacyCount`'s call totals and its `+=` counts per file are at least the legacy ones.
   6. The anchored spot checks (R0 guard lines) now assert total **calls** per file, reasoned or not, so they stay true after migration: `special/social.ts` `earnIncome` 3, `special/sports-core.ts` 1, `special/sports-olympics.ts` 1, `special/military.ts` earn plus add 2, `special/hustler.ts` add plus spend 6.
   7. The baseline file: version 2, sorted, positive integers, known keys in order, every path exists; written the way `UPDATE` writes it.
   8. The marker cap (12) and that no marker sits on a `character.money`, `p.money` or `b.cash` receiver (a token check).
2. Generate the baseline with `UPDATE_MONEY_RATCHET=init`.
3. Run `tc`; `vt test/money-ratchet.test.ts test/scan-kit.test.ts test/career-money-scan.test.ts test/ceiling-list.test.ts`. Dash check. Commit.

**Acceptance proved.** "Unreasoned `addMoney`, `earnIncome`, `spend`, `b.cash +=` and `p.money +=` never rise" (the real-source test), D.11 criterion 10 (a synthetic unreasoned call fails), and the measured baseline.
**Size.** About 40 source lines (none: the test infrastructure is the deliverable), 520 test lines plus 150 data lines.
**Risks.** (1) The scan is by tokens: a money write through `Object.assign`, a destructuring or a bracket key is invisible; the R2-L5 probe measures that gap as drift. (2) A false positive (a non-purse `.cash`) needs a marker; the cap of 12 keeps that honest. (3) `core.ts`, `cash.ts` and the constructors stay in the baseline for good: that is expected, not a failure of the migration.

---

### R2-L5 The conservation probe: 40 lives, 100 years, heirs

**Goal.** Prove on real lives that the ledger conserves money over 100 years with heirs, in a fast tier and a sliced full tier.

**Items.** A.K1 (d): the mandatory acceptance probe, a sliced full tier and a fast tier.

**Files.**
- Create: `test/ledger-probe.ts` (about 160 lines, no vitest import), `test/ledger-conservation.test.ts` (sliced, about 90), `test/ledger-conservation-fast.test.ts` (first line `// ci: fast`, about 120).
- Modify: `test/fuzz-kit.ts`: `LifeStats` (757-767) gains `ledger?: LedgerStats` (defined there, see below); `checkInvariants` (540) gains `for (const p of ledgerProblems(g)) fail(`ledger: ${p}`)` before `return ok`; the rich boost at line 1049 `g.character.money += richAmount` becomes `addMoney(g, richAmount, 'prize')` (import `addMoney` from `../src/game/core`, line 25 already imports `bindMoneyContext, netWorth`); `fuzzLife` (969) tracks drift and the reason set at each `'year end'` and `'heir'` checkpoint and writes `stats.ledger` at the end (line 1137, `stats.ms = Date.now() - t0`).
- Modify: `scripts/test-timings.json`: `split` (line 418) gains `"test/ledger-conservation.test.ts"` (sorted position: after `test/era-features.test.ts`), and `files` gains `"test/ledger-conservation.test.ts": 400`.
- Modify: `docs/CI.md` (the section "The seed-sliced files", line 27): one sentence saying a sixth file, `ledger-conservation` (R2), is sliced the same way.

**Interfaces.**

```ts
// test/fuzz-kit.ts
export interface LedgerStats {
  sum: number; mint: Record<string, number>; burn: Record<string, number>
  accounts: number; flowRows: number; bookings: number
  maxYearMint: Record<string, number>   // the largest single-year mint per name seen at a year end
  reasons: string[]                     // every reason that had a flow row at some year end, sorted
  drift: number                         // total unbooked change of the player's cash over all generations (0 when every write was booked)
  firstDrift: { year: number; age: number; delta: number } | null   // the first year drift appeared, how a surviving raw writer is found
}
// test/ledger-probe.ts
export const LEDGER_SEEDS: readonly number[]          // 101 to 140
export const PROBE_YEARS = 100
export const PROBE_ACTIONS = 2                        // random actions per year; the one knob the lead may lower
export const PROBE_HEIRS = 2
export interface LedgerLifeRow { seed: number; years: number; generations: number; ms: number; failures: string[]; ledger: LedgerStats }
export async function runLedgerLife(seed: number, over?: Partial<FuzzOptions>): Promise<LedgerLifeRow>
export function judge(rows: readonly LedgerLifeRow[], opts?: { merged?: boolean }): string[]   // problems; pure
```

`runLedgerLife` calls `fuzzLife(seed, log, { ...DEFAULT_OPTIONS, actionsPerYear: PROBE_ACTIONS, walkEvery: 100_000, maxYears: PROBE_YEARS, saveEvery: 25, heirs: PROBE_HEIRS, sweepEvery: 0, sweepMax: 0, timeMachine: false, ...over })` and returns the failures of the `FailureLog` that are not `note-` kinds.

`judge` (per row): no failures; `ledger.bookings / years <= 3,000` (a cost proxy: about 4 ms of ledger time a year); `maxYearMint[name] <= MINTS[name].cap` and, for `lending`, at most a quarter of it; `mint.heal` and `burn.heal` absent or 0. Merged: 40 rows; at least 34 with `years >= 90`; total bookings at least 40,000; the union of `reasons` has at least 20 names; some life minted `lending` and some burned `inflation`. Drift is **reported, not asserted** (a `console.info` line with the largest and the total); R2-L18 asserts it in strict mode.

**Steps.**
1. Write `test/ledger-conservation-fast.test.ts` first (red: the kit does not exist). It has two groups: `judge` on synthetic rows (a row with a failure, a row over the bookings bound, a row whose mint passes its cap, a row with `heal`, a merged set that is too small or too narrow: each yields a problem; a good row yields none), and three real lives (`LEDGER_SEEDS.slice(0, 3)`, `actionsPerYear` 1, 100 years, heirs 2) whose `judge` is empty. Timeout 300 s; measure the file once and note the time in the PR (target under 60 s; if over, lower the years of the fast tier to 60 before touching anything else, and say so).
2. Write `test/ledger-conservation.test.ts`:
   ```ts
   const slice = readSlice()
   const mine = seedSlice(LEDGER_SEEDS, 'ledger-probe', slice)
   // it 1: play `mine`, recordSlice('ledger-probe', rows, slice), expect(judge(rows)).toEqual([])   (timeout 1_800_000)
   // it 2: if (slice.mode === 'part') return; const all = slice.mode === 'merge' ? mergedSlices<LedgerLifeRow>('ledger-probe', slice) : rows; expect(all).toHaveLength(40); expect(judge(all, { merged: true })).toEqual([])
   ```
   Locally: `SLICE=1/20 SLICE_DIR=$TMPDIR/s /Users/saeed/projects/anotherlife/wt/bin/vt test/ledger-conservation.test.ts` plays two lives.
3. Edit `test/fuzz-kit.ts` (the hunks above), `scripts/test-timings.json`, `docs/CI.md`.
4. Run `tc`; `node scripts/ci-shard.mjs --verify 4` (every file that imports the shard kit is in `split` and the reverse); `vt test/ledger-conservation-fast.test.ts test/ci-shard.test.ts test/shard-kit.test.ts test/fuzz-regressions.test.ts test/collection-bounds.test.ts`; then one slice: `SLICE=1/20 SLICE_DIR=$TMPDIR/s vt test/ledger-conservation.test.ts`. Dash check. Commit.

**Acceptance proved.** The 100-year, 40-life conservation probe with heirs (flows net to zero per reason, accounts equal cumulative mint minus burn, caps respected, no `heal`), CI fit by `seedSlice` over 4 shards with a 3-life fast tier, and the per-year booking count of a real life.
**Size.** About 120 source lines of test kit, 650 test lines.
**Risks.** (1) CI time: 10 lives of 100 years per shard at about 15 seconds each is 150 seconds (an estimate; fuzz actions dominate). Lower `PROBE_ACTIONS` first. (2) The first real run may fail on a defect the new invariants expose in the ledger itself (fix it in R2-L2 or R2-L3, with a regression test) or in an old module (a pre-existing bug the fuzz finds: do not weaken the check; fix a one-function bug, otherwise record it in the PR and downgrade that single check to a `note-` kind). (3) Drift is expected to be large until R2-L6 to R2-L12 land; it is only printed here.

---

### The migration batches R2-L6 to R2-L12 (one procedure, seven batches)

The recipe is 3.0.4. Each batch is a directory group chosen so that no batch holds more than about 130 sites. Together the seven batches cover 762 of the 773 sites; the other 11 are `aging.ts:119` and the two kit calls (R2-L3), `investments.ts` (7, R2-L13) and `core.ts` (3, the primitives themselves, which stay in the baseline for good). Sites per file below are the measured counts of the lexer, raw writes included.

**Procedure for every batch (the steps are the same, so they are written once).**
1. Red test, part one: append the batch's path prefixes to `MIGRATED` in `test/money-ratchet.test.ts`, one per line. Run `vt test/money-ratchet.test.ts`: it fails and lists every remaining site as `file:line`. That list is the work list.
2. Red test, part two: write the batch's scenario test (named in each batch). Every scenario plays one real flow of the batch through the public function, then asserts (a) `driftSince(g, before) === 0` for the player's cash (`test/ledger-kit.ts`), (b) the expected reason rows and counterparty classes with `flowTotal`, (c) `expectConserved(g)`. Scenario tests are not in the fast tier.
3. Migrate site by site (3.0.4). A batch changes behavior nowhere: every rounding, clamp and condition stays as it was. If a site's `spend` guards an action, keep the guard.
4. `UPDATE_MONEY_RATCHET=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/money-ratchet.test.ts` lowers the baseline JSON; commit it with the code.
5. Check: `tc`; `vt` on the money ratchet, the scenario test, the regression files named in the batch, `test/architecture.test.ts` and wave 0's canary `test/r2-codemod-parity.test.ts` (about 90 s; a batch is behavior neutral, so it must stay green; only R2-L3, R2-L6 and R2-L13 move it, and they say so and re-record it with `R2_PARITY_RECORD=update`); then one probe slice, `SLICE=1/20 SLICE_DIR=$TMPDIR/s vt test/ledger-conservation.test.ts`, and copy the printed `drift` line into the commit message body (it must not rise from batch to batch; it falls as the batches land). Dash check. Commit.

Every batch: **Depends on** the previous batch only for the baseline file (rebase before step 4); no code depends on another batch. **Risks** common to all: a reason chosen for a mixed number (3.0.4 point 7); a `p.money` site that was float-valued and got rounded (point 4 forbids it, the batch's regression tests catch a pinned NPC number that moved); the cycle ratchet (the batches add only `from '../cash'` and `from '../kernel/ledger'`, both outside the cycles).

---

### R2-L6 Migration 1: home, family, love, NPC lives (127 sites)

**Goal.** Book every money call and raw write of the home, family, love and NPC files under a reason and a named counterparty, with no change of play except the same-year house resale spread.

**Items.** A.K1 (e); the bid-ask spread of the housing pool.

**Files (modify).** `src/game/assets.ts` 40, `love.ts` 26, `relationships.ts` 24, `npc-lives.ts` 23, `immigration.ts` 4, `landlord.ts` 4, `birth-background.ts` 2, `development.ts` 2, `household.ts` 1, `royalty.ts` 1. Create `test/ledger-flows-home.test.ts`. Edit `test/money-ratchet.test.ts` (`MIGRATED`) and `test/money-ratchet.json`.

**Reason guide.**
- `assets.ts`: houses `property.buy` and `property.sell` (`buyHouse` at 752, `sellAsset` at 2749, `addMoney(g, net)` at 2761); vehicles, jewelry, art, instruments `asset.buy` and `asset.sell` (`buyCar` 1457, `buyVehicle` 1656, `buyItem` 2196); upkeep, repairs, scrap `purchase`; fines `fine` (lines 3225, 3236, 3545); insurance `premium` and `claim` (the 4324 to 4443 block); mortgage payments `loan.repay` (4238, 4490). A financed vehicle already books its lending through `addLoan` (R2-L3). A literal `Mortgage` (assets.ts:776, `development.ts:75`, `shops/luxury-islands.ts:322` in R2-L9) calls `lend(g, d.principal, 'pool:sellers')` once, next to the down payment, so the sellers' pool receives the whole price: down payment under `property.buy` and the principal as the lending mint.
- `love.ts`: weddings and ceremonies `leisure`; rings `asset.buy`; divorce settlements `divorce` (the equity moves at 1649 to 1675 are a person-to-player move: `moveCash`); child support and alimony `support`; lawyers and adoption fees `legal`; matchmaker `leisure`.
- `relationships.ts`: a gift to a person is `payPerson(g, p, amount, 'gift')` (it replaces the pair `spend` plus `p.money +=`); money a person gives the player is `moveCash(g, personPurse(p, 0), playerPurse(g), amount, 'gift')`; the inheritance at 1063 is booked net of the tax under `inheritance` with a comment; a child's tuition `tuition`; allowances `support`.
- `npc-lives.ts` (NPC wealth is a float; use `personCash` with the floor the site had and no rounding): wages `wage`, tuition `tuition`, debt service and rent of an NPC `purchase`, an NPC's investing and housing moves between `p.money` and the NPC's own `NpcLife` fields are not cash flows and need no booking (`l.debt`, `l.investments`, `l.housing`). A company founded by an NPC (136): the capital moves with `moveCash(g, personPurse(p), poolPurse('firms'), capital, 'inject')` and the fee and permits are `fee.gov`. A stake of the player paid out by an NPC company (192, 203, 407) is `moveCash(g, firmPurse(b, a.id), playerPurse(g), x, 'dividend')`. `b.cash -= payout` and `p.money += payout * b.share * .8` (202) become `moveCash(g, firmPurse(b, id), personPurse(p), ..., 'dividend')` for the owner's part. `p.money = 0` (357): if the branch is a departure use `bookBurn(g, 'emigration', personPurse(p).acct, p.money)`, else `personCash(g, p, -p.money, 'luck')`. `investInNpc` (412): the player's purchase of a stake is `moveCash(g, playerPurse(g), firmPurse(b, a.id), amount, 'inject')`.
- Small files: `landlord.ts` rent income `rent` (the counterparty is the households' pool), repairs and fees `purchase`; `immigration.ts` `trade.sell` for a redeemed investor lock; `household.ts` `living`; `royalty.ts` `benefit` (the royal allowance, from `gov`); `development.ts` escrow and proceeds `property.buy` and `property.sell`; `birth-background.ts` `gift`.
- The spread rule (housing): in `makeOffers` (2689), a `house` bought in the same year of age (`a.purchasedAge === g.character.age`) never gets an offer above `Math.round(a.purchasePrice * (1 - SPREADS.sellers))`; today the best first-time-buyer offer is up to 1.03 times the value, so a same-year flip can gain 3 percent. Export `makeOffers` so the test can call it. Older houses keep the offers as they are.

**Scenario tests (`test/ledger-flows-home.test.ts`).**
1. The mortgage purchase of `test/assets.test.ts:109`: cash falls by the down payment; the `property.buy` row shows the player's class `-down` and `pool` `+down`; a `loan.principal` row shows `mint` `-principal`; the two rows together put exactly the price into `pool:sellers`; drift 0.
2. A year of `yearlyAssets` with that mortgage: a `loan.repay` row with `pool` positive and `person` negative; drift 0.
3. `sellAsset` of the house: `property.sell`, the player gains the net.
4. The spread: 300 calls of `makeOffers` on a house bought this year never exceed 97 percent of its price; on a house bought earlier at least one of 300 does exceed 97 percent of the value.
5. `payPerson` for a gift moves the person's money and the player's cash and books one `gift` row; a person's gift to the player books the opposite.
6. `startNpcCompany` then `npcBusinessYear` for a family NPC: every change of `p.money` and of the company's cash has a row; the sum of the NPC's account and the firm's account changes only by flows to the `pool` and `gov` classes; `expectConserved`.
7. A car bought with a loan: the sellers' pool receives the down payment plus the lending mint.

**Regression files.** `test/assets.test.ts test/love.test.ts test/relationships.test.ts test/landlord.test.ts test/immigration.test.ts test/npc-dynasty-overhaul.test.ts test/gameplay-development.test.ts test/royal-careers.test.ts test/luxury-asset-events.test.ts test/heir-world-flags.test.ts`.
**Size.** About 190 lines changed (127 sites, imports, the `makeOffers` rule), 300 test lines. **Risks.** The spread rule moves a same-year flip; if a pinned test sells a just-bought house above 97 percent, change its expectation with the reason in the commit message (this is a legitimate rule change). If wave 0's canary (`test/r2-codemod-parity.test.ts`) moves in a life that flips a house, re-record it as in R2-L3 step 4 and name the slice (`assets` or `character`) and the reason in the commit message; it must not move on `rng`.

---

### R2-L7 Migration 2: body, law, work, workshop, nation, advisors (94 sites)

**Goal.** Book every money call and raw write of the body, law, work, workshop, nation and advisor files, and make loan write-offs a declared burn.

**Items.** A.K1 (e); declared write-offs.

**Files (modify).** `health.ts` 13, `crime.ts` 11, `finance.ts` 11, `workshop/events.ts` 8, `careers.ts` 6, `gambling.ts` 6, `prison.ts` 6, `workshop/launch.ts` 5, `advisors/year.ts` 4, `cv.ts` 4, `underworld.ts` 4, `education.ts` 3, `nation/graft.ts` 3, `nation/yearly.ts` 3, `workshop/yearly.ts` 2, `effects.ts` 1, `nation/drama.ts` 1, `nation/govern.ts` 1, `nation/regime.ts` 1, `workshop/build.ts` 1. Create `test/ledger-flows-law.test.ts`.

**Reason guide.**
- `health.ts`: doctors, surgery, therapy, glasses `health`; a random loss at 772 `luck`; 1820 (a pay line) `wage`. `gambling.ts`: every site `gamble`. `crime.ts`: loot and robbery pay `crime.take` (193, 3549), a cut paid out `crime.cost` (199), refunds and bail `legal`, lawyer fees `legal` (683), fines `fine`. `prison.ts`: the job wage `wage` (713), fees `legal`, a heist share `crime.take` (1886). `underworld.ts`: quotes and launderer fees `crime.cost`; the one `.cash +=` is the dirty-cash ledger (read it: if it is not a purse, mark it `ledger-ok`).
- `finance.ts`: `settleIncomeTax` (593) and `taxAdditionalIncome` (159) `tax.income`; rent `rent` (627); living `living` (637); `payOffLoan` (368) and the yearly payment in `yearlyLoans` (712, the `pay` at about 747) `loan.repay`; refinance fees `fee.bank`; the repossession surplus (793) and the seizure proceeds `asset.sell` (net, with a comment); the parent bail-out in `handleDebt` is `moveCash(g, personPurse(parent, 0), playerPurse(g), amount, 'gift')` (it replaces `parent.money = ...` and `addMoney`).
- Write-offs: **a loan or mortgage removed with a positive balance that was not paid in cash calls `writeoff(g, balance)`.** In this batch: `seizeAssetsForDebt` (the loans removed there when `0.7 * value` does not cover `owed`: write off `max(0, owed - round(a.value * 0.7))`), `yearlyLoans` when a loan melts below $1 in a hyperinflation (the lender's loss of the remaining cents is not booked: under $1 is below the ledger's unit), and the education loan creation `education.ts:2675` (`loans.push`) which calls `lend(g, principal, 'pool:edu')`.
- `careers.ts`: salary (1363) `wage`, severance (1426, 1439) `severance`, pension (1640) `pension`, 2142 `wage`; the one `.money =` is a reset: read it, then `addMoney(g, -c.money, ...)` with the cause. `cv.ts`: prizes `prize`, pay `wage`; the `.money =` likewise. `education.ts`: tuition `tuition`.
- `nation/*`: bribes in `graft.ts` `bribe`, personal taxes under laws in `nation/yearly.ts` `tax.income`, `tax.property` or `tax.corp` by the tax id, subsidies and benefits `benefit`, fines in `drama.ts` `fine`.
- `advisors/year.ts`: the money team's bills `fee.bank`, its trades `trade.buy` and `trade.sell`. `workshop/*`: royalties and launch income `royalty` (`workshop/yearly.ts:54` `b.cash += income` is `firmCash(g, b, income, 'royalty', a.id)`), lawyers `legal`, builds and launches `purchase`, a prize `prize`. `effects.ts:57` generic event money `luck`.

**Scenario tests (`test/ledger-flows-law.test.ts`).**
1. `earnIncome(g, 100_000, 'wage')` then `settleIncomeTax`: the `tax.income` row shows `gov` positive by the tax and `person` negative; drift 0.
2. `yearlyFinance` for a renter with rent 12,000: a `rent` row and a `living` row, drift 0.
3. A $20,000 loan with a yearly payment: `yearlyLoans` books `loan.repay`; the `loan.principal` mint was booked by `addLoan`; the sum of accounts equals mint minus burn.
4. A broke player with a car and its loan, `flags.brokeYears = 2`, then `yearlyFinance`: seizure books the net proceeds, a `burn:writeoff` row for the uncovered part, and `expectConserved` holds (no `heal`).
5. A parent bail-out: the parent's money falls, the player's cash rises, one `gift` row, drift 0.
6. A crime and a gamble through their public functions book `crime.take` and `gamble`; a fine books `fine` to `gov`.
7. The student loan: `education.ts` creation books the lending mint to `pool:edu`.

**Regression files.** `test/finance.test.ts test/finance-firm.test.ts test/health.test.ts test/crime.test.ts test/gambling.test.ts test/prison.test.ts test/careers.test.ts test/cv.test.ts test/underworld.test.ts test/education.test.ts test/nation.test.ts test/nation-balance.test.ts test/advisors-engine.test.ts test/advisors-year.test.ts test/workshop.test.ts test/workshop-money.test.ts`.
**Size.** About 130 lines changed, 280 test lines. **Risks.** `taxAdditionalIncome` and `settleIncomeTax` are the income-tax settlement; their arithmetic (the `taxesPaid` credit) must not change, only the third argument.

---

### R2-L8 Migration 3: events, activities, and the estate in `life.ts` (125 sites)

**Goal.** Book every money call and raw write of the events and activities, and settle estates through the ledger in `continueAsChild`.

**Items.** A.K1 (e); estates settle through the ledger (design 4.2.7, 4.5).

**Files (modify).** `events/will-estate.ts` 12, `events/adult.ts` 8, `events/wealth-menu.ts` 8, `activities/nightlife.ts` 7, `events/wealth.ts` 7, `events/family.ts` 6, `events/history.ts` 6, `events/wealth-resolve.ts` 6, `activities/immigration-apply.ts` 5, `activities/mindBody.ts` 5, `events/will-scenes.ts` 5, `life.ts` 5, `activities/licenses.ts` 4, `activities/misc.ts` 4, `events/nepo-life.ts` 4, `activities/common.ts` 3, `events/wealth-world.ts` 3, and 20 files with 1 or 2 sites each (`activities/diet.ts`, `emigrate.ts`, `immigration-move.ts`, `lawsuit.ts`, `vacation.ts`, `charity.ts`, `creative.ts`, `identity.ts`, `immigration-lock.ts`, `pastimes.ts`, `rehab.ts`, `salon.ts`, `shared-projects.ts`, `surgery.ts`, `events/elder.ts`, `helpers.ts`, `wealth-kids.ts`, `will-feud.ts`, `era-pack-1980-events-life.ts`, `era-pack-2000-events-life.ts`). Create `test/ledger-flows-estate.test.ts`.

**Reason guide.**
- Activities: licences, permits, visas `fee.gov` (`licenses.ts`, `immigration-apply.ts`, `identity.ts`); lawyers `legal` (`lawsuit.ts`); nightlife `leisure`, `gamble` and `fine` as the line says; vacation `leisure`; charity `donation`; rehab, diet, surgery, salon `health`; relocation `purchase` (`emigrate.ts:365`: the player moving abroad keeps their money, so no burn); `immigration-lock.ts` `trade.sell`; `creative.ts` `royalty`; `mindBody.ts` found money `luck`, and `parent.money` costs `personCash(g, parent, -cost, 'leisure', 0)`; `activities/common.ts` the shared `payForAction` helper books the caller's reason: give it a `reason` parameter with a default of `purchase` and keep its two callers' behavior.
- Events: `events/helpers.ts:285` and `effects.ts` style generic money effects `luck`; `adult.ts` wins `prize` or `gamble`, costs `purchase`; `history.ts` `luck`; `family.ts`, `elder.ts`, `wealth*.ts` person-to-player money is `moveCash` or `payPerson` (`gift`, `support`, or `inheritance`); `p.money = Math.round(p.money + amt)` patterns pair with the player's `spend` in the same block: replace the pair, never book both; `nepo-life.ts` wages `wage`, costs `purchase`; `wealth-world.ts` `purchase`.
- The estate. In `continueAsChild` (`life.ts:1138`, after `planEstate` returns `plan` at about 1240) the dead player's account `person:<old.id>` pays, with `book(n, reason, from, to, amount)` and the token `estate:${old.id}:${n.year}`:
  1. `inheritance`: `plan.heirCash` to `person:<childId>`;
  2. `tax.estate`: `plan.tax` to `gov:<old.countryId>`;
  3. `legal`: `plan.fees` to `pool:legal`;
  4. `donation`: `plan.charityCash` to `pool:charity`;
  5. every other heir's cash share (the `will-estate.ts` sites 186, 385, 415, 498, 585, and the sibling `unit.recipient.money = Math.round(unit.recipient.money + inheritedEquity)` at `life.ts:1224`): `inheritance` to `person:<that heir>`, applied with `personCash`-style code that does not touch the dead player;
  6. `n.character.money += ...` at 1508 (the heir's own modeled portfolio realized): `book(n, 'asset.sell', 'pool:markets', person:<childId>, amount)`.
  The payer is whoever `n.character` is at that moment: inside `planEstate` the dead player, so `playerAcct(n)`; inside `settleReading` (`will-estate.ts:464`, called at `life.ts:1673`, which runs on the new state once the heir is `n.character`, with the dead player passed as `old`) the heir, and the sibling who shares an inheritance with the heir (`will-estate.ts:497` to `498`) is a person-to-player `moveCash`. Read each site before choosing the payer.
  Then `foldAccount(n, person:<old.id>, 'pool:hh:<old.countryId>')` clears the dead player's account. The dead character's cash is not a purse any more (the object is replaced); do not call `playerPurse` on it. The heir's opening cash (`life.ts:1339`, `money: Math.max(0, Math.round(heirP.money)) + cashInherited`) is a constructor value and stays.
- `life.ts:1939` and `1948` (mid-life crisis spends) `leisure`; the other `life.ts` sites are the estate lines above.

**Scenario tests (`test/ledger-flows-estate.test.ts`).**
1. A dead player with $1,000,000 and one child, no will: `continueAsChild` books `inheritance`, `tax.estate`, `legal` and `donation` rows equal to the plan's numbers (`test/will-estate.test.ts` shows how to read a plan), all from `person:<old>`; the old account is gone afterwards; `expectConserved`; the heir's cash is exactly what it was before this task (`heirP.money + plan.heirCash`).
2. A will with a charity slice books a `donation` row; a sibling heir's share books `inheritance` to that sibling.
3. `continueAsChild(g, id)` called twice from the same state gives the same JSON (the token and the pure flow make it replayable).
4. A family event that moves money between the player and a relative (`events/family.ts`) books one `gift` row, with the person's side changed and drift 0.
5. A licence fee (`activities/licenses.ts`) books `fee.gov` to `gov:<country>`.

**Regression files.** `test/will-estate.test.ts test/will-feud.test.ts test/will-menu.test.ts test/will-review.test.ts test/wealth.test.ts test/wealth-review.test.ts test/wealth-catalog.test.ts test/events.test.ts test/nepo-life.test.ts test/activities.test.ts test/life.test.ts test/dynasty-main-character.test.ts test/heir-world-flags.test.ts test/immigration-play.test.ts`.
**Size.** About 170 lines changed, 320 test lines. **Risks.** The estate is the riskiest edit of the batch (the roadmap names `continueAsChild` and the will code as the riskiest edits of the kernel): the golden test is scenario 1 (run it before editing, red only for the rows), and the old assertions of `will-estate.test.ts` must pass untouched.

---

### R2-L9 Migration 4: shops and computer (115 sites)

**Goal.** Book every money call and raw write of the shops and the computer.

**Items.** A.K1 (e).

**Files (modify).** `computer/money-options.ts` 13, `computer/dev-venture.ts` 12, `shops/luxury-fleet.ts` 10, `computer/money-crypto.ts` 8, `shops/luxury-family.ts` 8, `shops/everyday.ts` 7, `shops/luxury-brands-deal.ts` 6, `shops/luxury-islands.ts` 6, `computer/dev-common.ts` 5, `computer/online.ts` 5, `computer/money-scams.ts` 4, `shops/fleet-operations.ts` 4, `shops/luxury-staff.ts` 4, `computer/dev-learn.ts` 3, `shops/luxury-brands-rooms.ts` 3, `shops/luxury-pamper.ts` 3, `shops/luxury-societies.ts` 3, `shops/memberships.ts` 3, `computer/money-stocks.ts` 2, `shops/luxury-brands-assets.ts` 2, `shops/memberships-tickets.ts` 2, `computer/dev-projects.ts` 1, `computer/money-common.ts` 1. Create `test/ledger-flows-shops.test.ts`.

**Reason guide.** Shops: luxury goods and fleets `asset.buy` (sales `asset.sell`), everyday goods `purchase`, memberships and tickets `leisure`, pampering `leisure`, staff wages `wage` (the player pays household staff: `spend(g, wages, 'wage')`), islands and estates `property.buy` (the literal `Mortgage` at `luxury-islands.ts:322` calls `lend(g, principal, 'pool:sellers')`), fines `fine`, insurance deductibles `premium`. A cancelling pair (`fleet-operations.ts:52` `addMoney(g, -p.net); earnIncome(g, p.net)`, which makes cash taxable without moving it) keeps both calls: the first `purchase`, the second `royalty` (two rows that cancel in the player's cash). Computer: options, stocks and crypto `trade.buy`, `trade.sell` (a premium paid `trade.buy`, a payout `trade.sell`; a friend paying the player is `moveCash` from `personPurse`); scams the player runs `crime.take`, refunds `crime.cost`; online shopping and subscriptions `purchase`; lessons `tuition`; ventures: income `royalty`, costs `purchase` or `rnd`; `dev-common.ts:81` (`p.money = Math.round(p.money - amount)`) a person paying: `personCash(g, p, -amount, ..., 0)`.

**Scenario tests (`test/ledger-flows-shops.test.ts`).** (1) A luxury purchase and its resale book `asset.buy` then `asset.sell` against `pool:retail`; the round trip loses money (the resale value is under the price: assert strictly less cash, the spread probe for goods). (2) A stock bought through `computer/money-stocks.ts` and settled books `trade.buy` and `trade.sell`. (3) A membership books `leisure`. (4) The island mortgage purchase puts the whole price into `pool:sellers`. (5) A scam run books `crime.take`. (6) A friend paying the player books `gift` with both sides moved.

**Regression files.** `test/luxury.test.ts test/luxury-brands.test.ts test/luxury-experiences.test.ts test/luxury-review.test.ts test/luxury-secretary.test.ts test/computer-dev.test.ts test/computer-money.test.ts test/gamedev.test.ts`.
**Size.** About 150 lines changed, 260 test lines. **Risks.** If the goods round trip (scenario 1) does not lose money for some category, that is a finding: record the category in the PR and open point 5 of section 5; do not tune a price in this task.

---

### R2-L10 Migration 5: special careers (91 sites)

**Goal.** Book every money call and raw write of the special careers.

**Items.** A.K1 (e).

**Files (modify).** `special/fame.ts` 11, `model.ts` 7, `gamedev-make.ts` 6, `hustler.ts` 6, `politics.ts` 6, `author-career.ts` 5, `gamedev-career.ts` 5, `social.ts` 5, `music.ts` 4, `sports-esports.ts` 4, `sports-individual.ts` 4, `astronaut.ts` 3, `corruption.ts` 3, `music-rights.ts` 3, `sports-core.ts` 3, `actor.ts` 2, `athlete.ts` 2, `military.ts` 2, `sports-fight.ts` 2, `sports-legacy.ts` 2, `sports-prowrestling.ts` 2, `actor-pipeline.ts` 1, `author-story.ts` 1, `sports-olympics.ts` 1, `sports-sumo.ts` 1 (`special/kit/year.ts` was done in R2-L3). Create `test/ledger-flows-careers.test.ts`.

**Reason guide.** A salary is `wage`; a tournament, award or bonus `prize`; advances, residuals, rights sales and merch `royalty` (`music-rights.ts:99` selling rights is `royalty`); endorsements `royalty`; fines and seized money `fine`; lawyers `legal`; costs of making a game or a record `inputs`-like personal costs `purchase`; `g.character.money -= cost` becomes `addMoney(g, -cost, 'purchase')`; a bribe is `moveCash(g, playerPurse(g), personPurse(person), cost, 'bribe')` (`corruption.ts:116` and `202`); a hustle's take `crime.take`, its fines `fine`; a politician's pension `pension`, seized money (`politics.ts:2432`) `fine`; a campaign spend (`politics.ts:657`) `purchase`; `sports-individual.ts:1109` `if (c.money > 0) c.money = 0` is read first (a bankruptcy or a seizure) and booked as `addMoney(g, -c.money, 'fine')` or `'luck'` by its cause; a parent paying for the athlete (`sports-core.ts:264`) is `personCash(g, parent, -cost, 'purchase', 0)`. The career-kit careers already pass through `c.earn` and `c.pay` (R2-L3).

**Scenario tests (`test/ledger-flows-careers.test.ts`).** One flow per family through its public function with `makeTestGame`: a salary year of `special/military.ts` or `astronaut.ts` books `wage`; an esports prize books `prize`; a book advance (`author-career.ts`) books `royalty`; a hustle (`hustler.ts`) books `crime.take`; a bribe (`corruption.ts`) moves both purses with one `bribe` row; a politician's pension books `pension`. Each asserts drift 0 and `expectConserved`. `test/career-money-scan.test.ts` must still pass.

**Regression files.** `test/special.test.ts test/model-flow.test.ts test/model-year.test.ts test/music-sim.test.ts test/music-lifetime.test.ts test/author.test.ts test/fame-career.test.ts test/social-fake.test.ts test/sports-endorse-cap.test.ts test/politics-abuse.test.ts test/gamedev.test.ts test/career-money-scan.test.ts test/career-year.test.ts`.
**Size.** About 130 lines changed, 240 test lines. **Risks.** The R0 guard lines (`social.ts` three `earnIncome`, `sports-core.ts` one, `military.ts` two) are call counts and stay true: the anchored ratchet tests prove it.

---

### R2-L11 Migration 6: business A (113 sites)

**Goal.** Book the first half of the business directory through the company purse, and make company cash erosion a declared burn.

**Items.** A.K1 (e); the company cash helpers; the company inflation burn.

**Files (modify).** `business/gamestudio.ts` 15, `manage.ts` 15, `board-ceo.ts` 12, `conglomerate-actions.ts` 12, `bank-events.ts` 8, `fund-events.ts` 7, `nepo-year.ts` 7, `lab-year.ts` 6, `staff.ts` 6, `competition-events.ts` 5, `conglomerate-year.ts` 5, `hedge-fund.ts` 5, `market-strategy.ts` 5, `yearly.ts` 5. Create `test/ledger-flows-business.test.ts`.

**Reason guide (the firm purse).** The receiver `b` is a `BizState`; pass the asset id when `a` is in scope (`firmCash(g, b, delta, 'reason', a.id)`).
- A company's yearly operating result is booked as one flow: `sales` when positive, `inputs` when negative (the sims keep one net number; do not split it). Wages `payroll`; supplies, rent and services `inputs`; research `rnd`; campaigns `marketing`; equipment and outlets `capex`; corporate tax `tax.corp`; fines `fine`; lawyers `legal`; interest and repayment `loan.interest` and `loan.repay`; insurance `premium` and `claim`.
- Owner and firm: a draw or dividend to the owner is `moveCash(g, firmPurse(b, a.id), playerPurse(g), amount, 'draw')`; money the owner puts in is `moveCash(g, playerPurse(g), firmPurse(b, a.id), amount, 'inject')`; a person paid by the firm is `moveCash(g, firmPurse(b, id), personPurse(p), amount, 'payroll')`; a transfer between sister companies is `moveCash(g, firmPurse(from, fromId), firmPurse(to, toId), amount, 'inject')`.
- Inflation on company cash: `gamestudio.ts:445 to 450` (`cashErosion = Math.round(b.cash * real); b.cash -= cashErosion`) becomes `erodeFirm(g, b, cashErosion, a.id)`; R2-L12 does the same at `deeptech-sim.ts:175 to 179`.
- `bank-events.ts` (player banks, segregated books): a client loss is `bookBurn(g, 'writeoff', firmPurse(b, id).acct, loss)`; fees and spreads `fee.bank`.
- `hedge-fund.ts:238, 259`: the calls of `realize` are R2-L13's; here only the cash writes of the fund itself.

**Scenario tests (`test/ledger-flows-business.test.ts`).** Use `probeLife({ seed, birthYear: 1990, businesses: 1, years: 0, keepAlive: true })` (`test/probe-life.ts`) to get a funded company, then: (1) one `yearlyBusiness` books a `sales` or `inputs` row of the company's cash change (`firmAcct` balance change equals `b.cash` change within the rounding of the sim); (2) an owner draw moves both purses with one `draw` row, drift 0; (3) an injection books `inject`; (4) a year with inflation 0.1 on company cash books a `burn:inflation` row equal to `cashErosion`; (5) a transfer between two sister companies books one `inject` row; (6) `expectConserved`.

**Regression files.** `test/business.test.ts test/business-financial-overhaul.test.ts test/business-tax.test.ts test/board.test.ts test/board-exploits.test.ts test/conglomerate.test.ts test/conglomerate-play.test.ts test/bank.test.ts test/fund-events.test.ts test/nepo-year.test.ts test/hedge-fund.test.ts test/competition.test.ts test/franchise.test.ts`.
**Size.** About 150 lines changed, 300 test lines. **Risks.** Companies hold floats; `firmCash` must not round (3.0.4 point 5 and the `b.cash` baseline numbers in the business tests).

---

### R2-L12 Migration 7: business B, then `why` becomes required if the count is zero (95 sites)

**Goal.** Book the second half of the business directory, then lock the type of `why` when no unreasoned call is left.

**Items.** A.K1 (e); closing the call-site migration.

**Files (modify).** `business/bank.ts` 4, `board.ts` 4, `deeptech-sim.ts` 4, `dynasty-ownership.ts` 4, `events-extra.ts` 4, `events.ts` 4, `exit.ts` 4, `founding.ts` 4, `franchise.ts` 4, `nepo-actions.ts` 4, `rescue.ts` 4, `career.ts` 3, `competition-moves.ts` 3, `conglomerate-family.ts` 3, `conglomerate-management.ts` 3, `fund-actions.ts` 3, `group-treasury.ts` 3, `supply-policy.ts` 3, and 20 files with 1 or 2 sites each (`bank-actions`, `board-menu`, `deeptech-core`, `economy`, `fund-manager`, `gamestudio-engines`, `group-ventures`, `hedge-company`, `sector-core`, `venues`, `board-vote`, `deeptech-funding`, `deeptech-manager`, `expansion`, `fund-sim`, `group-services`, `heavy-rd`, `own-trade`, `rd`, `state`). `core.ts` (only the last step). Create `test/ledger-flows-business2.test.ts`.

**Reason guide.** As R2-L11, plus: a sale of a company (`exit.ts` `sellBusiness`: `addMoney(g, net)`) is `firm.sale` net of the capital gains tax, the loan payoff and the family's part (one booking, with a comment; the tax part is a second line, `addMoney(g, -tax, 'tax.capgains')`, only if the code already separates it); founding a company (`founding.ts`: the opening cash of the new `BizState` is a constructor value; the founder's payment is `moveCash(g, playerPurse(g), poolPurse('firms'), cost, 'inject')` and the founding loan is booked by `addLoan` with `to: 'pool:firms'`); `deeptech-sim.ts:175 to 179` `erodeFirm`; a rescue by a group treasury is `moveCash` between firm purses; `business/state.ts` (1 site): read it; a normalizer or constructor stays in the baseline. A loan removed unpaid (`business/exit.ts:66` after the payoff in `settleFoundingLoan` is paid from proceeds, so no write-off).

**Scenario tests (`test/ledger-flows-business2.test.ts`).** (1) `sellBusiness` of a company with a loan: the player's cash gain equals the booked rows; the founding-loan payoff is `loan.repay`; the capital gains tax is `tax.capgains`; drift 0. (2) Founding a company with a loan books the lending mint to `pool:firms`. (3) A franchise or rescue transfer books one row. (4) The deeptech inflation year books `burn:inflation`. (5) `expectConserved` after each.

**Last step, only if the real count of unreasoned calls is now 0 in the baseline** (read `test/money-ratchet.json`: no `addMoney`, `earnIncome` or `spend` key remains): change `why?: Why` to `why: Why` in the three signatures of `core.ts` and fix the compile errors (about 44 calls in `test/` pass two arguments: `grep -rnE "\b(addMoney|spend|earnIncome)\(" test`), so the compiler holds the line from then on. If any unreasoned call survives (a site that cannot be mapped), leave the type optional and say so in section 5, point 4.

**Regression files.** `test/business-flip.test.ts test/business-expansion.test.ts test/business-venues.test.ts test/franchise.test.ts test/deeptech.test.ts test/deeptech-review.test.ts test/fund.test.ts test/conglomerate-v2-management.test.ts test/hedge-company.test.ts test/elite-business-v2.test.ts`.
**Size.** About 130 lines changed, 260 test lines. **Risks.** Same as R2-L11; plus the type change (a compile error in a test file is fixed by adding the reason the test means, never by weakening the call).

---

### R2-L13 F37 bond par, F38 capital gains and transaction tax, `investments.ts`

**Goal.** Fix F37 and F38: bonds redeem at par less any haircut paid by a named government, personal gains and the transactions law are taxed to `gov:<country>`, and the markets carry a spread.

**Items.** A.K1 (f); findings F37 and F38; the markets spread probe.

**Files.**
- Create: `src/game/nation/rates.ts` (a leaf, about 90 lines), `test/ledger-invest.test.ts`.
- Modify: `src/game/investments.ts` (all of it that this task needs, listed under Behavior), `src/game/nation/effects.ts` (the `personalTax` function at 294 to 303 moves to `rates.ts`; `effects.ts` imports it and re-exports it, `export { personalTax } from './rates'`, so every importer keeps working), `src/game/business/exit.ts` (`capitalGainsRate` 40 to 45 and `capitalGainsTax` 47 to 50 become `export { capitalGainsRate, capitalGainsTax } from '../nation/rates'`; drop the imports they leave unused: `noUnusedLocals` is on), `test/investments.test.ts` (the test at 294), `test/money-ratchet.test.ts` and `.json` (MIGRATED `src/game/investments.ts`, `src/game/nation/rates.ts`), `test/ceiling-list.json` (two entries).
- Why a new leaf: `investments.ts` is outside the import cycles and `business/exit.ts`, `nation/effects.ts`, `finance.ts` are inside them. If `investments.ts` imported `business/exit` it would join the 85-module cycle (the cycle ratchet would fail). `rates.ts` imports only `../data/markets`, `./state`, `./data` (all leaves) and `../types`, so it is safe from both sides.

**Interfaces.**

```ts
// src/game/nation/rates.ts
export const TRANSACTION_TAX_PER_LEVEL = 0.001                                // 0.1 percent of a trade per level of the law (levels 0 to 3), the size of real stamp duties and financial transactions taxes
export function personalTax(g: GameState, id: TaxId, country?: string): number      // moved unchanged from nation/effects.ts:294
export function capitalGainsRate(g: GameState): number                        // moved unchanged from business/exit.ts:40: clampN(m.corporateTax * 0.8 + change, 0, 0.6) with a law in force, clampN(m.corporateTax * 0.8, 0, 0.3) without
export function capitalGainsTax(g: GameState, proceeds: number, basis: number): number   // moved unchanged from business/exit.ts:47
export function transactionsLevel(g: GameState): number                       // 0 to 3, read like luxuryLevel (nation/effects.ts:322): hasPolicy, newTaxAvailable('transactions', year), policyOf(...).newTaxes.transactions?.level
export function transactionsLevy(g: GameState, amount: number): number        // Math.round(amount * transactionsLevel(g) * TRANSACTION_TAX_PER_LEVEL), 0 for a bad amount
```

**Behavior.**
- F38 (`realize`, 533 to 548). A gain is still reduced by the carried-forward losses (`offset`, `taxable`). The tax is now `capitalGainsTax(g, taxable, 0)` (the nation's `capitalGains` law is inside `capitalGainsRate`), withheld at the sale in both modes: `addMoney(g, cash, why)` with `why` a new optional last parameter of `realize` (default `'trade.sell'`), then `addMoney(g, -tax, 'tax.capgains')` to `gov:<country>`. The gain no longer goes into `flags.taxableIncome` and no longer passes `taxAdditionalIncome`; `flags.taxesPaid` is not touched (it is the credit `settleIncomeTax` subtracts from the income tax due: crediting capital gains tax there would cut the income tax); the lifetime `count(g, 'taxesPaid', tax)` stays. `Realized.tax` is the tax in both modes, `immediate` only decides whether the caller shows it. `estimateTax` (552 to 565) uses the same formula for the screen's estimate. The comment at lines 6 to 11 is rewritten (no dashes).
- F38 (transactions law). `buySecurity` (the spend at about 1109) and `sellHolding` (the realize calls at 1202 and 1229) add `levy = transactionsLevy(g, gross)`: `addMoney(g, -levy, 'tax.transaction')`, one clause in the order notice only when `levy > 0` (so the text of every order under no law is unchanged). A year-end auto-close (a maturity, a delisting) is not a trade and pays no levy.
- F37 (`case 'bond'`, 2428 to 2452, and the screen text at 1674). `BOND_PAR = 1_000` replaces the literal `price: 1_000` of the quote (842). Each holding carries `details.par`, the face value per unit in engine dollars: absent on an older holding, it starts at `Math.min(BOND_PAR, unitPrice)` the first time the yearly move sees it (no windfall for an old holding). Each year `par *= 1 - dep` (the same erosion cash suffers, so the face value is what the nominal face buys) and, in a default year, `par *= 1 - fx.haircut`. The marked price is pulled to par: with `left = maturity - g.year + 1`, `newPrice += (par - newPrice) / left`, so the price equals par in the maturity year. At maturity the move returns `ended: { kind: 'matured', perUnit: par, premium: 0 }`, so the holder receives `units * par`, never the marked price. The payer is named: the yearly loop calls `realize(g, proceeds, proceeds - basis(a), false, { reason: 'bond.redeem', with: ref('gov', cid) })`, `cid` being the bond's country (`details.country`). The screen text at 1674 stays true ("the government pays back the face value").
- Payers of income. The yearly loop (2745 to 2800) collects `income` by payer: a bond's coupon from `gov:<country>`, a deposit's interest from `pool:banks`, everything else from `pool:markets`, and books each with `earnIncome(g, amount, { reason: 'invest.income', with: payer })`; the log line still reports the sum. The credited-interest pair (`earnIncome(g, interest)` then `addMoney(g, -interest)` at 2781 and 2782) keeps both calls with `invest.income` and `trade.buy` against `pool:banks`.
- The 7 raw sites become reasoned (`spend` at 1109 `trade.buy`, `addMoney`s at 539 and 545 `trade.sell`, `earnIncome`s at 546, 2781, 2846 as above).

**Steps.**
1. Write `test/ledger-invest.test.ts` first (red):
   1. F37, three cases with `vi.mock('../src/game/invest/engine', ...)` replacing `fxYear` by a wrapper of the real one that overrides `dep`, `bondMove`, `defaulted` and `haircut` (the foresight spy test of R1-P5 uses the same pattern): (a) `dep` 0 and `bondMove` +0.3 for ten years: the marked price runs far above par, yet the cash at maturity rises by exactly `units * 1000` less the capital gains tax, and the `bond.redeem` row shows `gov:<country>` paying; (b) a default in year 3 with haircut 0.4: the payout is `units * 1000 * 0.6`; (c) `dep` 0.05 a year: the payout is `units * 1000 * 0.95^10` rounded; each also asserts `details.par` and that the marked price in the maturity year equals par.
   2. F37 old holding: a bond holding without `details.par` and marked at 700 gets `par` 700 and is never paid more than its eroded 700 at maturity.
   3. F38: selling a holding with a $50,000 gain books `tax.capgains` equal to `Math.round(taxable * capitalGainsRate(g))` (read the rate from the module), `flags.taxableIncome` is unchanged by the gain, `flags.taxesPaid` is unchanged, the player's cash change equals the proceeds minus the tax, and the `gov` class gained exactly the tax.
   4. F38 law: with `editPolicy(g, 'us')`, `p.national.taxes.capitalGains = 5` and `writePolicy(g, p)` (the helpers `test/nation.test.ts:265` uses; it also imports `capitalGainsRate`, which the re-export in `business/exit.ts` keeps working) the same sale pays five points more.
   5. Transactions: with `p.newTaxes.transactions = { level: 2 }` written the same way a $100,000 buy books `tax.transaction` 200 and a sale of $100,000 books 200; with no law no row exists and the order notice text equals today's.
   6. Income payers: a bond's coupon year books `invest.income` with `gov` as payer; a savings year books it with `pool:banks`; the cancelling pair leaves cash unchanged and taxable income raised.
   7. The spread probe for every security type (stock, index, bond, gold, crypto, savings): buy $10,000 and sell it in the same year: the cash after is strictly below the cash before, and `pool:markets` gained.
   8. Hostile: a holding with `details.par` of `NaN`-like garbage (a string, a negative, 1e300) is treated as absent.
2. Edit `test/investments.test.ts:294`: rename "taxes realized gains at the income tax rate, after carried-forward losses" to "taxes realized gains at the nation's capital gains rate, after carried-forward losses" and replace `const tax = g.flags.taxesPaid as number` (line 306) with the tax read from the `tax.capgains` row via `flowTotal`; keep the loss-carry assertions (`investLossCarry` to 0) and the net-cash assertion. This is a legitimate rule change; say so in the commit message.
3. Create `nation/rates.ts`, move the three functions, edit `effects.ts` and `exit.ts`, edit `investments.ts`.
4. Add to `test/ceiling-list.json`: `bond-par` (`src/game/investments.ts`, token `BOND_PAR`, "a bond redeems at its eroded face value, never at its marked price (F37)") and `transaction-levy` (`src/game/nation/rates.ts`, token `TRANSACTION_TAX_PER_LEVEL`, "0.1 percent of a trade per level, levels 0 to 3").
5. Run `tc`; `vt test/ledger-invest.test.ts test/investments.test.ts test/invest-order-notice.test.ts test/invest-safety.test.ts test/invest-self-impact.test.ts test/talent-investing.test.ts test/hedge-fund.test.ts test/hedge-menu.test.ts test/business-tax.test.ts test/nation.test.ts test/money-ratchet.test.ts test/ceiling-list.test.ts test/foresight-scan.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** F37 (the government is a named payer of par less any default haircut), F38 (capital gains and the transactions law reach `gov:<country>` through the ledger), pool prices carry spreads for the markets (test 7), no new import cycle.
**Size.** About 350 source lines (rates 90, investments 230, effects and exit 30), 500 test lines.
**Risks.** (1) Balance: capital gains tax is now lower than the marginal income rate for high earners and flatter for others, and bonds no longer drift in value at maturity; both are the intended rules (state them in the PR). Pinned tests that move: `investments.test.ts:294` and possibly bond-maturity assertions elsewhere (search `Bond Matured` and `matured` in `test/`). (2) `moveHolding` already mutates `details` (`d.yield` at 2458), so writing `d.par` there adds no new impurity; it runs once per holding per year (`updatedYear` guard at 2749). (3) Wave 0's canary (`test/fixtures/r2-parity.json`) moves here on purpose, in the `character`, `flagsPersonal` and `assets` digests of lives that sell a holding (capital gains no longer enter `taxableIncome`); re-record it as in R2-L3 step 4 with the reason in the commit message; `rng` must not move. Platform's R2-P9 later edits two index lines of `investments.ts` (a separate hunk; it rebases onto this one). (4) Hedge funds call `realize` (`business/hedge-fund.ts:238, 259`); they now pay capital gains tax at the sale instead of income tax: their tests assert the loss carry only, and the PR says so. (5) Declared layer edge: `nation/effects.ts` (layer L2 in the Kernel track's table) re-exports from `nation/rates.ts` (layer L3 by default), one new upward import that the Kernel track's `UPDATE_LAYER_BASELINE=rebase` accepts and lists in its commit (see `00-crosscheck.md`, "Layer edges"). (6) The architecture test is the proof that `rates.ts` is a safe leaf; if it reports a merge, the fallback is to leave `personalTax` in `effects.ts` and keep only the three new functions in `rates.ts` with a local copy of the nine-line policy lookup (state it in the PR).

---

### R2-L14 World indexes over Person, Asset and npcCompany

**Goal.** Index existing people, firms and homes without copying or rewriting them, within the caps.

**Items.** A.K2 (b): registries as indexes over existing records; strangers persist only when touched; old NPC firms indexed in place (D3).

**Files.**
- Create: `src/game/world/people.ts` (about 170 lines), `src/game/world/firms.ts` (about 170), `src/game/world/homes.ts` (about 110), `test/world-index.test.ts` (first line `// ci: fast`).
- Modify: `src/game/world/shards.ts` (three `registerShard` lines: `people`, `firms`, `homes`; not `state.ts`, see R2-L2).
- Read, do not edit: `src/game/npc-company-state.ts` (`npcCompany`, lines 6 to 14: it `structuredClone`s the record and runs `normalizeBiz`; the index must not use it), `src/game/npc-lives.ts` (`startNpcCompany` 124 and `adoptNpcCompany` 151 show the raw shape: `p.data.npcCompany` is `{ id, name, kind: 'business', details }`), `src/game/business/util.ts` (`rec`, `str`, `num`), `src/game/types.ts` (`Person` 378 to 411, `Asset` 452 to 470).

**Interfaces.**

```ts
// world/people.ts
export function personRef(p: Pick<Person, 'id' | 'data'>): EntityRef        // person:<data.sid when a non-empty string, else id>
export function playerRef(g: GameState): EntityRef                          // the player's account as an EntityRef
export function readPeople(g: GameState): Readonly<PeopleShard>            // pure; absent reads as { v: 1, rows: [], over: 0 }
export function syncPeople(g: GameState): void                              // writer, idempotent, replaces the shard root only when it changed
// world/firms.ts
export function firmRef(assetId: string): EntityRef                         // firm:<assetId>
export function readFirms(g: GameState): Readonly<FirmsShard>
export function syncFirms(g: GameState): void
// world/homes.ts
export function homeRef(assetId: string): EntityRef                         // home:<assetId>
export function readHomes(g: GameState): Readonly<HomesShard>
export function syncHomes(g: GameState): void
```

**Behavior.**
- Rows are `{ id, seen }` (people), `{ id, form, owner, seen }` (firms) and `{ id, owner, seen }` (homes), sorted by `id`. `seen` is the last year the record was observed in `g`. A row is never copied from its record: the record stays where it is (the old `Person`, `Asset` and `BizState` readers are untouched).
- `syncPeople`: candidates are the persons of `g.people` except pets. The first `LOD_CAPS.intimate` (80) by the key `[owns an NPC company ? 0 : 1, -relationship, id]` get a row; a present person ranked beyond the cap is counted in `over` and gets none. A person who is present gets `seen = g.year`. A row whose person is absent is kept unchanged (R2-L16's sweep demotes it after 5 idle years).
- `syncFirms`: a row of form `biz` for each `g.assets` entry of kind `business` (owner `playerRef(g)`), and a row of form `npc` for each person whose `data.npcCompany` is a record with a string `id`, read raw (no clone, no `normalizeBiz`: the old record is **indexed in place, not rewritten**) with owner `personRef(p)`. At most `LOD_CAPS.fullFirms` (20) rows are written, ranked by `value` descending for `biz` and after them for `npc`, ties by id; the rest are counted in `over` (a tycoon with 30 companies keeps 20 indexed). `normalizeFirms` caps the shard at `LOD_CAPS.firms` (60) rows for the later `FirmLite` rows.
- `syncHomes`: a row for each asset of kind `house`, owner the player, ranked by value, at most `LOD_CAPS.homes` (150).
- Each `normalize*` (registered with `registerShard`): a plain object with `v` 1, rows an array cut at the cap, ids valid refs of the right kind (`person:`, `firm:`, `home:`), `seen` an integer in 1900 to 100000, duplicates merged by keeping the latest `seen`, rows sorted by id, `over` an integer in 0 to 100000, `form` one of `biz` and `npc`.
- Strangers: no code here creates a row for anything that is not already a record of `g`; a candidate, a classmate who left and a rival exist only as seeded data until touched.

**Steps.** Write `test/world-index.test.ts` first (red: the modules do not exist):
1. `personRef` with and without `data.sid`; a pet has no row.
2. A family (spouse, two children, five friends): `syncPeople` writes a row each, sorted by id, `seen` the current year; remove a friend and sync again: the row stays with its old `seen`; a second sync is byte-identical; a `deepFreeze`d state reads fine through `readPeople`.
3. 100 friends: exactly 80 rows, `over` 20, the 80 are the highest `relationship` (ties by id); an NPC company owner at relationship 0 beats a friend at 90.
4. `syncFirms`: three own companies and one person with `data.npcCompany` (built with `startNpcCompany` or by hand): four rows with the right forms and owners; `structuredClone` is not called during the sync (spy on `globalThis.structuredClone`), and `p.data.npcCompany` is still the same object afterwards.
5. 25 own firms: 20 rows by value, `over` 5.
6. `syncHomes`: houses only; 160 houses give 150 rows.
7. Hostile shards through `worldShard`: garbage rows, duplicate ids, wrong prefixes, `seen` of `'x'`, `NaN`-like numbers, 500 rows: always valid and bounded.
8. A game with only the player has no rows; `createPerson` adds a person but no row until `syncPeople` runs.
9. Replace discipline (section 2, rule 7): with `deepFreeze` applied to each of `g.world.people`, `.firms` and `.homes` alone (the `g.world` container left writable), `syncPeople`, `syncFirms` and `syncHomes` do not throw, a changed index comes back as a new root, and the frozen originals are unchanged.
10. Run `tc`; `vt test/world-index.test.ts test/world-state.test.ts test/sibling-firm.test.ts test/npc-dynasty-overhaul.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** Strangers persist only when touched; old NPC firms indexed in place (D3); the caps of 4.2.3 for the index shards.
**Size.** About 520 source lines, 450 test lines.
**Risks.** `business/util.ts` is a leaf (it imports `core` and `talents` only), so the world modules stay outside the cycles; the architecture test proves it. Declared layer edge: `world/firms.ts` imports `business/util.ts` and (R2-L15) `world/holdings.ts` imports `business/family-share-state.ts`, two L2 to L3 imports in the Kernel track's layer table; its `UPDATE_LAYER_BASELINE=rebase` accepts exactly these (listed in `00-crosscheck.md`, "Layer edges"). Do not add a third: read domain records through the two helpers only. A person who changes `data.sid` later (R4) changes their ref: R4 must set `sid` to the existing id for old records, or fold.

---

### R2-L15 Holdings, world invariants, heir resync

**Goal.** One holdings table, the world invariants in the fuzz harness, and heirs that keep the index current.

**Items.** A.K2 (c): one `holdings` table, invariants in `test/fuzz-kit.ts` `checkInvariants`, heirs by clone (RF3).

**Files.**
- Create: `src/game/world/holdings.ts` (about 220 lines), `src/game/world/invariants.ts` (about 260), `src/game/world/sync.ts` (about 90), `test/world-holdings.test.ts` (first line `// ci: fast`), `test/world-heirs.test.ts`.
- Modify: `src/game/world/shards.ts` (register `holdings`), `src/game/life.ts` (one call `syncWorld(n)` just before the final `return n` of `continueAsChild`, which starts at 1138 and rebuilds `n.people` at 1465), `test/fuzz-kit.ts` (in `checkInvariants`, line 540, replace the R2-L5 call `ledgerProblems(g)` by `worldProblems(g)`, which includes it).
- Read: `src/game/business/family-share-state.ts` (`readFamilyShares`, 7 to 19), `src/game/npc-lives.ts:439` (`npc-stake:<assetId>`), `src/game/business/state.ts` (`BizState.share`, `familyShares`, `npcOwnerId`, 296 to 340).

**Interfaces.**

```ts
// world/holdings.ts
export const OUTSIDE: EntityRef                                                       // 'pool:outside', the unnamed remainder of a company's equity
export function buildHoldings(g: GameState): HoldingRow[]                             // pure, sorted by asset then owner
export function readHoldings(g: GameState): Readonly<HoldingsShard>
export function syncHoldings(g: GameState): void
export function holdersOf(g: GameState, asset: EntityRef): { owner: EntityRef; share: number }[]
export function holdingsOf(g: GameState, owner: EntityRef): { asset: EntityRef; share: number }[]
// world/sync.ts
export function syncWorld(g: GameState): void                                         // people, firms, homes, holdings in that order; idempotent; stamps world.y = g.year
// world/invariants.ts
export function worldProblems(g: GameState): string[]                                 // pure
```

**Behavior.**
- `buildHoldings` reads the raw asset details (no `normalizeBiz`): for an own company row, the player's share `clamp(num(details.share, 1), 0, 1)`, the family's `readFamilyShares(details.familyShares, 1 - share)` as `[person:<Person ref>, firm, share]` (the id is looked up in `g.people` so a `sid` ref is used when present), and `OUTSIDE` for the rest when it is above 1e-9. For an NPC company: the owner's `details.share` and the player's `npc-stake:<id>` asset share (clamped so the total is at most 1), `OUTSIDE` for the rest. Homes: `[playerRef, home, 1]`. Shares are rounded to 6 places and the last row is adjusted so each asset sums to 1 within 1e-6. At most `HOLDING_ROWS_CAP` (1,200) rows: whole assets are dropped from the lowest-ranked end.
- `worldProblems(g)`: `ledger: <problem>` for each `checkLedger` problem; people (unique ids, valid refs, at most 80 rows, at most one living spouse in `g.people`, unique person ids); firms (unique, at most 60 rows, valid owners); homes (unique, at most 150); holdings (each asset sums to 1 within 1e-6, shares in (0, 1], owners and assets valid refs, at most 1,200 rows). **Index against live record** checks (a row with `seen === g.year` must point at an existing record; every held asset is in the firm or home index) run only when `readWorld(g).y === g.year`, i.e. right after `syncWorld`; otherwise only the structural checks run, because the index is rebuilt once a year and a mid-year action can make it a year stale.
- `syncWorld` calls the four syncs and sets `world.y`; it is what `continueAsChild` calls after it rebuilds `n.people`.

**Steps.** Write the tests first (red):
1. `test/world-holdings.test.ts`: a company with share 0.6 and one family holder at 0.1 gives rows 0.6, 0.1 and `OUTSIDE` 0.3; a company with share 1 has one row; family shares above the available equity are scaled and the sum is still 1; garbage details (a string, `NaN`-like, negative) fall back to the defaults and no share is 0 or less; an NPC company with owner 0.7 and the player's stake 0.2 gives 0.7, 0.2, `OUTSIDE` 0.1, and a stake that would pass 1 is clamped; houses have one row of share 1; 40 firms with 8 holders each stay within 1,200 rows and every kept asset still sums to 1; `buildHoldings` does not depend on the order of `g.assets` (shuffle it); `holdersOf` and `holdingsOf` agree with the rows; it works on a frozen state.
2. `test/world-heirs.test.ts`: (a) from a 40-year `probeLife` state with three companies, killed and continued with `continueAsChild`: `n.world.ledger` pool and `gov` accounts equal the old ones except for the estate rows, the dead player's account is gone, the holdings rows list the companies the heir keeps, and `worldProblems(n)` is empty; (b) a non-heir sibling who owns the family NPC firm shows as a `form: 'npc'` row owned by that sibling and the firm record was not rewritten; (c) `syncWorld(n)` twice gives the same JSON; (d0) replace discipline: with each shard deep-frozen alone (the container left writable), `syncHoldings` and `syncWorld` do not throw and write new roots; (d) `worldProblems` reports each synthetic break with a message: a duplicate person row, two living spouses, holdings summing to 0.9, a fresh firm row whose asset is gone, an identity break in the ledger.
3. Write the files; the `life.ts` call; the `fuzz-kit.ts` swap.
4. Run `tc`; `vt test/world-holdings.test.ts test/world-heirs.test.ts test/world-index.test.ts test/world-state.test.ts test/ledger.test.ts test/life.test.ts test/sibling-firm.test.ts test/npc-dynasty-overhaul.test.ts test/fuzz-regressions.test.ts test/architecture.test.ts`; then one short opt-in fuzz to exercise the new invariants on real play: `FUZZ=1 FUZZ_SEEDS=3 FUZZ_YEARS=40 /Users/saeed/projects/anotherlife/wt/bin/vt test/fuzz-deep.test.ts` (about 3 minutes). Dash check. Commit.

**Acceptance proved.** Holdings sum to 1; one spouse; indexes in place; invariants wired into `checkInvariants`; `g.world` reaches heirs by clone (RF3) and the index follows the rebuilt people list.
**Size.** About 600 source lines, 500 test lines.
**Risks.** If the opt-in fuzz finds a living second spouse or another old defect, do not weaken the check: fix a one-function bug, otherwise downgrade that single check to a `note-` kind in `fuzz-kit` (like `noteWindfall`) and list the defect in the PR and in section 5.

---

### R2-L16 The level-of-detail framework

**Goal.** The three levels of detail with their caps, promotion that does not depend on order, and demotion that folds cash back through the ledger.

**Items.** K.6 (a): the framework named, pooled, seeded; promotion and demotion; caps; demotion folds cash back through the ledger.

**Files.**
- Create: `src/game/world/lod.ts` (about 450 lines), `test/world-lod.test.ts`.
- Modify: `src/game/world/shards.ts` (register `lod`), `test/ceiling-list.json` (entry `lod-caps`: file `src/game/world/caps.ts`, token `LOD_CAPS`, cap "400 people (80 intimate), 60 firms (20 full), 150 homes, 600 job slots").
- Read: wave 0's `src/game/kernel/streams.ts` (`stream`, `worldSeed`).
- `lod.ts` re-exports `LOD_CAPS` and `DEMOTE_AFTER_YEARS` from `world/caps.ts` (R2-L1 defined them), so both names are importable from either file.

**Interfaces.** Section 2 gives `promote`, `demote`, `lodSweep`, `seededEntity`, `LOD_CAPS`, `DEMOTE_AFTER_YEARS`. The rest:

```ts
export function lodShard(g: GameState): Readonly<LodShard>                         // pure; absent reads as { v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 }
export function promotionPrice(mid: number, kind: LodKind): number                // ask(mid, POOL_OF[kind]): what taking an entity out of its pool costs
export function demotionProceeds(mid: number, kind: LodKind): number              // bid(mid, POOL_OF[kind]): what folding it back returns
// POOL_OF: person -> 'hh', firm -> 'firms', home -> 'sellers'
```

**Behavior.**
- The three levels. Named: a row in an index shard (R2-L14), capped by `LOD_CAPS`. Pooled: the counts above the caps (`over` of each index shard, copied into `lod.pooled`) and the ledger's pool accounts. Seeded: `seededEntity(g, kind, key, make)` calls `make(stream(g, 'lod', 0, `${kind}:${key}`))` (the tag is the literal `lod`, never built from `kind`: Platform's stream table reads literal tags only, R2-P3): pure, keyed on the id only, stateless (a second call returns an equal value, `g.rng` is untouched).
- `promote(g, kind, id)`: if the kind's shard has room, insert the row at its sorted position; if it is full, evict the lowest-ranked unprotected row (`demote(..., 'cap')`); if every row is protected return false. The final row set depends only on the set of ids promoted (sorted insertion, eviction by `[protected, relevance, id]`), so **promotion order does not matter**. A promoted entity moves no cash in R2 (no stranger holds any yet); later releases that give seeded entities an endowment buy it from the pool at `promotionPrice` and sell back at `demotionProceeds`, which is what makes a promote-demote loop lose money.
- Protected (an obligation exists, 4.2.3): a person who is in `g.people` now, or who owns an NPC company, or who holds a `holdings` row; a firm or home whose record still exists. Protected rows are never demoted by idleness or by the cap.
- `demote(g, kind, id, why)`: removes the row and folds the entity's ledger account: `'idle'` and `'cap'` fold it into `pool:hh:<country>` (person), `pool:firms` (firm) or `pool:landlords` (home), negative balances included, so the sum is unchanged; `'emigrated'` (people only) burns a positive balance with `bookBurn(g, 'emigration', acct, bal)` and folds a negative one; `lod.demoted += 1`; returns the amount folded or burned. The country is the player's (`g.character.countryId`).
- `lodSweep(g)` (the W7 step of 4.2.5): (1) demote every unprotected row with `seen < g.year - DEMOTE_AFTER_YEARS` in sorted-id order; (2) if a shard still passes its cap (a hostile load), keep the top `cap` by `[protected, relevance, id]` and demote the rest in sorted-id order; (3) copy the `over` counts into `pooled`; stamp `lod.y = g.year`. Idempotent per year. Returns the number of rows demoted.
- `relevance(g, kind, row)` is pure: `row.seen` (recency) plus 1,000 for an NPC company owner or a holder; nothing reads a year after `g.year`.

**Steps.** Write `test/world-lod.test.ts` first (red):
1. The caps equal the spec (400, 80, 60, 20, 150, 600) and `DEMOTE_AFTER_YEARS` is 5 (pinned, so a change is a decision).
2. `promote` and `demote` basics; a person present in `g.people` is never demoted by idleness or by the cap; an unprotected row is demoted after exactly 5 idle years and not after 4; a hostile 500-row people shard is cut to 80 by `lodSweep`, deterministically (the same 80 on a second run).
3. Order independence: 120 ids promoted in 50 seeded shuffles (a local PRNG) give identical `JSON.stringify(g.world)` every time; the same for demotion order.
4. Folding: after `book(...)` gives `person:x` a balance of 1,234, `demote(..., 'idle')` deletes the account, adds exactly 1,234 to `pool:hh:us`, and `checkLedger` is ok; a negative balance folds too.
5. Emigration: `demote(..., 'emigrated')` burns a positive balance (a `burn:emigration` row, the sum falls by exactly that amount, `checkLedger` is ok) and folds a negative one.
6. `lodSweep` twice in a year gives the same JSON; `lod.y` is stamped; `pooled` equals the `over` counts.
7. `seededEntity`: equal inputs give equal outputs across two calls and after a `structuredClone`; a different key differs; `g.rng` is unchanged; it works on a frozen state.
8. Spread: for every kind `promotionPrice(x) > x > demotionProceeds(x)` and the round trip loses at least `2 * s * x` (`s` from `SPREADS`).
9. Replace discipline (section 2, rule 7): `promote`, `demote` and `lodSweep` on a state whose `people`, `firms`, `homes` and `lod` shards are deep-frozen one by one (the container left writable) do not throw, write new roots, and leave the frozen originals unchanged.
10. `test/ledger-guards.test.ts` still passes with `lod.ts` present (no draws, no clock).
11. Write `lod.ts`, register the shard, add the ceiling entry. Run `tc`; `vt test/world-lod.test.ts test/world-index.test.ts test/world-heirs.test.ts test/ledger-guards.test.ts test/ceiling-list.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** K.6: caps of 400 people (80 intimate), 60 firms (20 full), 150 properties, 600 job slots as constants, enforced for the shards that exist; promotion keyed on sorted ids so order does not matter; demotion folds cash through the ledger; emigration is a declared, capped burn with a log row; promotion and demotion carry a spread.
**Size.** About 600 source lines (lod 450 plus the wiring), 600 test lines.
**Risks.** `LOD_CAPS.jobs` and the people cap of 400 have no shard in R2 (jobs arrive with A.K3 and R6; named non-intimate people with R4): the constants and the framework are provided, not exercised. If wave 0's `stream` is not merged when this task starts, only `seededEntity` is blocked; build the rest and add it last.

---

### R2-L17 Budget meter, the world step, the 50-year size probe

**Goal.** Meter the world's size and time, add the one yearly hook, and prove the budgets over 50 years.

**Items.** K.6 (b): the budget meter; the one world hook in `aging.ts`; the 50-year probe of the registry's size and time.

**Files.**
- Create: `src/game/world/budget.ts` (about 200 lines), `src/game/world/yearly.ts` (about 80), `test/world-budget.test.ts`.
- Modify: `src/game/aging.ts`: add `import { yearlyWorld } from './world/yearly'` and the entry `['world', yearlyWorld]` after `['milestones', yearlyMilestones]` (line 89) in `YEARLY_HOOKS`; nothing else.
- Read: `test/probe-life.ts` (`probeLife`, lines 31 to 60).

**Interfaces.** `worldBudget`, `timed` in section 2; also:

```ts
export const WORLD_BUDGET: { readonly nodes: 25_000; readonly bytes: 450_000; readonly stepMs: 60 }
export function budgetReport(): { label: string; calls: number; ms: number; max: number }[]   // module state, never saved
export function resetBudgetReport(): void
// world/yearly.ts
export function yearlyWorld(g: GameState): void    // no-op when world.y is already g.year; else timed('world', syncWorld + lodSweep) and stamps y
```

**Behavior.**
- `yearlyWorld` is one hook, last in `YEARLY_HOOKS`, so it reads the year's closing records and writes the indexes, holdings and LOD rows for next year to read: nothing reads a later step's output of the same year (14.5). It draws nothing. It is idempotent by the `world.y` stamp. It does not run when the character dies inside the hook loop (the loop returns early); `continueAsChild` calls `syncWorld` instead (R2-L15). The roadmap says "right after `yearlyEconomy`": the later world steps W1 to W7 will read the opening frame there; this R2 step only indexes, and indexing at the end of the year is what keeps `checkInvariants` right at the `'year end'` checkpoint (section 5, point 8).
- `worldBudget(g)`: per-shard node counts of `g.world`, the total, `JSON.stringify(g.world).length`, and `over` listing every breach (total nodes above 25,000, bytes above 450,000, a shard above its cap). It is pure and costs a walk of the world, so it is for tests, dev tools and the Platform track's probe, never for a tap.
- `timed(label, fn)`: measures with `performance.now()` into a module-level table that is never saved and never read by the simulation.

**Steps.** Write `test/world-budget.test.ts` first (red):
1. `YEARLY_HOOKS` ends with the name `world`; `yearlyWorld` twice in a year gives the same JSON and stamps `y`. (The Kernel track deletes `YEARLY_HOOKS` in R2-K9 and rewrites this one assertion there, as `yearlyEntries('aging')` ending with the id `yearly.world`; it lists this file in its commit.)
2. A 50-year life, `probeLife({ seed: LEDGER_SEEDS[4]!, birthYear: 1975, businesses: 12, years: 50, keepAlive: true })` (`LEDGER_SEEDS` from `test/ledger-probe.ts`, R2-L5; wave 0's pin ratchet forbids a new `seed: <digits>` literal): `worldBudget(g).over` is empty, total nodes at most 25,000, bytes at most 450,000, ledger nodes at most 9,000, flow rows at most 600, `checkLedger(g).ok`, `worldProblems(g)` empty. Print the numbers with `console.info` (the PR quotes them).
3. The step time: the `world` entry of `budgetReport()` has `max` at most 240 ms over those 50 years (four times the spec's 60 ms, so a loaded CI machine does not flake; the PR quotes the real figure).
4. A light life (`businesses: 0`, 20 years): `peekLedger(g).k / years` is at most 1,500 bookings a year, the cost proxy for the 160 ms `ageUp` budget.
5. A synthetic maximal world (80 people, 20 firms, 150 homes, 1,200 holding rows, 500 accounts, 480 flow rows, 40 log rows): `worldBudget` total under 25,000 nodes and `normalizeWorld` keeps every row.
6. `timed` is not saved: the state's JSON has no timing, and two runs of the same life give identical JSON although their timings differ.
7. `world/budget.ts` is the only world file that uses `performance` (the R2-L2 guard covers it).
8. Write the files and the `aging.ts` hunk. Run `tc`; `vt test/world-budget.test.ts test/world-state.test.ts test/world-lod.test.ts test/life.test.ts test/probe-life.test.ts test/ledger-conservation-fast.test.ts test/architecture.test.ts`. Dash check. Commit.

**Acceptance proved.** The state budget of 4.2.8 for the registry (nodes and bytes), the world step time budget (reported against 60 ms, asserted at 240 ms), the ledger's cost proxy, the K.6 budget meter.
**Size.** About 450 source lines (budget 200, yearly 80, tests helpers excluded; the rest is the `aging.ts` hunk), 400 test lines.
**Risks.** `aging.ts` is the Kernel track's hot file: the hunk is two lines and an import. If that track has converted `YEARLY_HOOKS` to registry phases before this merges, register `yearlyWorld` in the phase after every money-booking module instead, and keep the rule of section 2 (rule 5).

---

### R2-L19 The cash walk without a residual: per-company reason tally

**Goal.** Make the company "Where the cash went" waterfall exact: every move of a company's cash since the last books close is named by its ledger reason, so the "Everything else" row disappears for a company with ledger-era books and a test pins it.

**Items.** A.K1 (g): the roadmap's player-visible "a cash walk with no 'everything else' row" and its D.3 rule "a test then pins it to 0". Added by the cross-check: the plan's own section 5, point 1 found that the specified `flows` table (country x reason x 2 years, summed over a class) cannot explain one company's year, so this task keeps a small tally per company.

**Files.**
- Modify: `src/game/cash.ts` (`firmCash`, `moveCash` when a side is a firm purse, and `erodeFirm` add the applied amount to the company's tally), `src/game/business/state.ts` (`BizState` gains optional `tally?: Record<string, number>`; `YearRecord` gains optional `flows?: Record<string, number>`; `readRecord` and the `BizState` reader keep only keys that are `REASONS` names, finite numbers, whole dollars, held to 1e15, at most 16 keys), `src/game/business/economy.ts` (`recordYear` at about line 1004: for a non-lean row it copies the tally into `rec.flows` and clears `b.tally`; a second call for the same year keeps the first row's `flows` when the tally is empty, so the function stays idempotent), `src/game/charts/books.ts` (`cashWalkSpec` at about line 205 and `WALK_NOTE`), `test/money-ratchet.json` only if a site moves.
- Create: `test/ledger-cashwalk.test.ts`.
- Read: `src/game/charts/pl.ts` (the P and L walk keeps its own Rounding row), `test/report-book.test.ts` (it pins synthetic specs that carry an "Everything else" row; those stay valid because old rows still produce one).

**Interfaces.**

```ts
// business/state.ts (additive, both optional)
interface BizState { /* existing */ tally?: Record<string, number> }          // net applied cash by reason since the last books close; never for a lean (NPC) company
interface YearRecord { /* existing */ flows?: Record<string, number> }        // the tally of that year's books, whole dollars
// cash.ts: firmCash(g, b, delta, why, firm?, opts?: { tally?: boolean })     // tally defaults to true; the NPC-company sites of R2-L6 pass false
// charts/books.ts: the same cashWalkSpec(g, b): ChartSpec | null
```

**Behavior.**
- A booking on a firm purse adds `Math.round(applied)` to `b.tally[reason]` (the reason of the booking, `inflation` for `erodeFirm`); a key that reaches 0 is deleted; at most 16 keys (a 17th reason folds into `luck`). `recordYear` moves the tally into the new row's `flows` and resets it. The tally and `flows` are plain data, so they survive saves and heirs; a row without `flows` (an old save, a lean row, the first year after the upgrade) draws the walk exactly as R1 does, "Everything else" included.
- `cashWalkSpec` with a row that has `flows`: the four named steps stay as they are (Net profit, Inflation on cash, Change in debt, Dividends paid). The old residual `rest` is split by reason: each reason in `flows` that those four steps do not already cover (the operating booking `sales` or `inputs` is the net profit, `inflation` is the inflation step, `loan.principal`, `loan.repay` and `loan.interest` are the debt step, `draw` and `dividend` the dividend step) becomes one step with a plain label from a `CASH_LABELS` table (about 20 reasons, plain narrator, no dashes: `inject` "Money you put in", `capex` "Equipment and buildings", `rnd` "Research", `marketing` "Marketing", `tax.corp` "Company tax", `legal` "Lawyers", `fine` "Fines", `firm.sale` "Sale of a part of the business", and so on), the five largest by size kept and the rest summed as "Other moves". What is still unexplained after that is under a dollar a year of rounding (company cash is a float, the books are whole dollars) and is a "Rounding" row only when it is 1 or more; the label "Everything else" is written only for a row with no `flows`. `WALK_NOTE` is shown only for such a row.
- The coverage list above is the plan's reading of R2-L11 and R2-L12 (one operating booking a year, then the owner and debt moves); the test below is what holds it. If a real life leaves a residual, print the (reason, amount) pairs and fix the booking in the batch that owns the site (a missed `.cash` write or a wrong reason), never the walk.
- State: at most 16 numbers a year, 30 rows a company, so about 480 numbers a company (about 5,800 at 12 companies), against the 500,000 cap: stated in the PR next to R1's books budget.

**Steps.** Write `test/ledger-cashwalk.test.ts` first (red):
1. For three founder lives (`probeLife` with `businesses` 1, 3 and 6, 12 years, seeds from `findSeed(...)` or `LEDGER_SEEDS`) with an owner draw, an injection and a rescue played in year 6 by their public functions: for every company and every year with `flows`, `cashWalkSpec` has no "Everything else" step, its first total plus every step equals its last total exactly, and the only unnamed step is a "Rounding" row of at most 2 dollars.
2. `flows` of a year sums, with the named steps' coverage, to the cash change of that year within the float rounding; a booking of `moveCash` between two firm purses shows on both firms with opposite signs.
3. `recordYear` is idempotent: calling it twice for one year keeps the first `flows`; a lean (NPC) company never gets `tally` or `flows`; the tally is empty after a close.
4. Hostile: a `tally` and `flows` with unknown keys, strings, `NaN`-like numbers, 1e300, 40 keys read back as at most 16 valid whole-dollar numbers; an old row (no `flows`) still produces the R1 walk with its "Everything else" row (reuse a row of `test/report-book.test.ts`).
5. A save of a company with flows loads back to the same JSON; 30 rows of 16 keys stay under 2,000 nodes a company (a ceiling test).
6. Write the code; run `tc`; `vt test/ledger-cashwalk.test.ts test/report-book.test.ts test/chart-books.test.ts test/ledger-flows-business.test.ts test/ledger-flows-business2.test.ts test/money-ratchet.test.ts test/business.test.ts test/save-hydrate.test.ts test/architecture.test.ts`; then wave 0's canary `test/r2-codemod-parity.test.ts` (it must stay green: the tally is new optional state in `assets` details, so if it moves on `assets` re-record as in R2-L3 step 4 with that reason; `rng` must not move). Dash check. Commit.

**Acceptance proved.** The roadmap's player-visible "a cash walk with no everything else row" and D.3's pinned zero, for every company with ledger-era books.
**Size.** About 330 source lines (cash 40, state 80, economy 25, books 140, labels 45), 300 test lines.
**Risks.** (1) `business/state.ts` and `charts/books.ts` are R1 hot files: the edits are additive and old rows keep the old walk. (2) A company cash write that bypassed `firmCash` (a constructor, an unmigrated site) shows as a Rounding or a large unexplained step in test 1: that is the finding, fix the site. (3) `YearRecord` grows by up to 16 numbers; if the PR's node count is a concern, lower the key cap to 12 and the "Other moves" row absorbs the rest.

---

### R2-L18 Acceptance sweep and docs

**Goal.** Prove the acceptance no single task owns (fixture, hostile loads, replay, reload, fork, strict drift) and write the two docs.

**Items.** The mandatory acceptance of A.K1 and A.K2 that no single task proves: the v4.0.2 fixture, hostile loads end to end, replay, reload and fork, strict drift, the docs.

**Files.**
- Create: `test/world-acceptance.test.ts`, `docs/LEDGER.md` (about 220 lines), `docs/WORLD.md` (about 180 lines).
- Modify: no `src` file. A defect found here is fixed in the owning task's file with a regression test beside it.

**Tests (`test/world-acceptance.test.ts`; write first).**
1. The oldest fixture (`test/fixtures/save-v1.json.gz`, a schema-1 save written by v2.6.0, the one six tests call "the v4.0.2 fixture"; `test/notice-acceptance.test.ts:747` loads it the same way; the real v4.0.2 save, `test/fixtures/save-v4.0.2.json.gz`, arrives with the Save track's R2-S2, which merges after this track, and Platform's `old-saves.test.ts` runs every `save-*.json.gz` it finds, with R2-P11 adding the world check for the new ones): `migrateSave` is `ready`; `g.world` is undefined; `readWorld(g)` is `{ v: 1 }`; `peekLedger(g)` is the empty shard; with `g.queue = []` before each, 5 calls of `ageUp` do not throw; afterwards `checkLedger(g).ok`, `worldProblems(g)` is empty, `g.world.y === g.year`, and the ledger holds bookings.
2. Hostile matrix (RF4): twelve hostile values for `world` put into that fixture (a number, a string, an array, `{ v: 2 }`, a ledger with 50,000 accounts, a people shard of 500 rows, balances of 1e300 and -1e300, a ledger whose identity is broken, a holdings shard whose shares sum to 7, an `lod` shard with string numbers, a `__proto__` key, a 499,000-node unknown shard): each still passes `isLoadableGame`, survives 3 `ageUp` calls without throwing, ends with `g.world` under 40,000 nodes after the first year, and `checkLedger(g, { allowHeal: true }).ok`.
3. Replay: `playLife({ seed: LEDGER_SEEDS[30]!, birthYear: 1990, untilAge: 45 })` twice gives the same JSON, `world` included.
4. Reload: `JSON.parse(JSON.stringify(g))` through `migrateSave`, then 5 more `ageUp` calls, equals the original state continued for 5 years (nothing hides in a cache or a `WeakSet`).
5. Fork (the Time Machine): with `setSnapshotBackend(memorySnapshotBackend())`, `startTimeline`, `takeSnapshot(g)` and `loadSnapshot(lifeId, age)` the restored state's JSON equals the original's (`world` included), and 3 years played from each give the same JSON.
6. Heirs, the world half of design 4.2.7: from a 40-year life with three companies, `continueAsChild` keeps every shard, folds the dead player's account, and leaves `worldProblems` empty.
7. Strict drift, only when `LEDGER_STRICT=1` (`it.skipIf`): plays the lives of the current slice with `runLedgerLife` and asserts `ledger.drift === 0` for each; on a failure it prints the seed and `firstDrift` (year, age, amount), which is how a surviving raw writer is found. The agent runs it once over all 40 lives (about 15 minutes on one worker, so run it as `SLICE=1/4` to `4/4` one after another) and records the result in `docs/LEDGER.md`, section "Known unbooked writers": each survivor with `file:line` and why it is not a purse flow (a constructor, a reset), each matching a baseline entry or a `ledger-ok:` marker.
8. Doc checks: every key of `REASONS`, `MINTS` and `BURNS` appears in `docs/LEDGER.md`; every shard name registered by the world modules appears in `docs/WORLD.md`; every `ledger-ok:` marker in `src/` appears in the "Known unbooked writers" section (file name at least); the R2-L2 guard already forbids dashes in both files.

**Docs.** `docs/LEDGER.md`: the model (3.0.1), the reason table, the mints and burns and their caps, how to book money (the recipes of 3.0.4, short), the ratchet and `MIGRATED`, the probes and how to run a slice (`SLICE=1/20 SLICE_DIR=$TMPDIR/s`), the strict drift run, known unbooked writers, how to add a reason. `docs/WORLD.md`: `g.world`, the shard registry and `registerShard`, ids and `EntityRef`, the three levels and the caps, promotion and demotion, the budget numbers, the yearly step and its place, heirs, hostile loads. Plain voice, no dash characters, no emoji. Per-track docs replace appends to `docs/ARCHITECTURE.md`: do not edit that file.

**Steps.** Write the test and the docs, run it all, fix what it finds in the owning file. Run `tc`; `vt test/world-acceptance.test.ts test/ledger-guards.test.ts test/money-ratchet.test.ts test/world-state.test.ts test/save-hydrate.test.ts test/architecture.test.ts`; then the strict run in four slices. Dash check on both docs. Commit.

**Acceptance proved.** `g.world` absent reads as empty; the v4.0.2 fixture runs 5 years; hostile loads bounded (RF4); replay, reload and fork give identical JSON (RF5); heirs keep the world (RF3); every dollar the player holds is booked (strict drift) or listed.
**Size.** No source lines, 450 test lines, about 400 doc lines.
**Risks.** Strict drift may find survivors beyond the token scan (an `Object.assign`, a bracket key, a destructured write). Each is fixed with the recipe of 3.0.4 or listed; the ratchet baseline and the markers must agree with the list, and the doc check enforces it.

---

## 4. Plan vs code (where the roadmap and the code differ, and what I did)

1. **The money counts are higher than the roadmap's, and R1's ratchet sees only part of them.** Measured with the lexer over `src/` at v4.1.1: 773 sites (456 calls, 160 `.cash` compound writes, 66 `.money` compound writes, 91 direct assignments) in 171 files. R1's `money-ratchet.json` holds 537 (calls and `+=` only; 134 files). The reasoned-call ratchet counts `-=`, `=`, `*=` and `/=` as well, because `g.character.money -= cost` (`activities/rehab.ts:109`) and `p.money = Math.round(p.money - amount)` (`computer/dev-common.ts:81`) are real money moves the old scan could not see.
2. **`src/game/world.ts` already exists** (1,580 lines: countries, cities, name pools; 172 files import `./world`). The lead's `src/game/world/` coexists with it because `./world` resolves to the file first, in TypeScript's bundler mode and in Vite. Never create `src/game/world/index.ts`; every import of the new modules names a file (`./world/state`).
3. **"The v4.0.2 fixture" is not `test/fixtures/save-v1.json.gz`.** That file is a schema-1 save (`"version":1`, no `schemaVersion`) added at v2.6.0; six tests call it "the v4.0.2 fixture" by habit. No v4.0.2 save exists in the repo until the Save track's R2-S2 makes `save-v4.0.2.json.gz` from the git tag (cross-check finding). This track runs the oldest fixture; the Save and Platform tracks run the new ones.
4. **`checkInvariants` is at `test/fuzz-kit.ts:540`, not 538, and is not exported.** It runs inside `fuzzLife`, `fuzzBusiness` and `fuzzPolitics`; `test/fuzz-deep.test.ts` is opt-in (`FUZZ=1`). So the invariants added there run in CI only through R2-L5's probe, which is why the probe exists in the fast and the sliced tier.
5. **`isLoadableGame` passes unknown top-level keys** (`save-schema.ts:522`), bounded only by the 500,000-node check in `finiteJsonTree` (222). `g.world` therefore loads whole, and every reader normalizes; no `save-schema.ts` edit is needed. The Save track's `world` slice calls `normalizeWorld`.
6. **`continueAsChild` already clones** (`life.ts:1143`, `structuredClone(g)`), so `g.world` reaches the heir by default and the flag whitelist at 1518 (the source of X4 and X5) never sees it. What it does not do is keep an index current: it rebuilds `n.people` at 1465. R2-L15 adds the one `syncWorld(n)` call.
7. **`addLoan` creates a record only** (`finance.ts:344`): cash never flows through it and the lender is never booked. Mortgages are built as literals (`assets.ts:776`, `development.ts:75`, `shops/luxury-islands.ts:322`) and the student loan is pushed (`education.ts:2675`). The lending mint is therefore booked in `addLoan` and by `lend()` at the literals. `assets.ts:4279` is a foreclosure shortfall turned into a personal loan: it creates no money, hence `noMint`.
8. **Inflation can be negative**: `economy/model.ts:120` allows -0.5 and `simulation.ts:119` clamps at -0.035 in the live model. `c.money /= 1 + inflation` (`aging.ts:119`) then raises cash, and a negative balance shrinks toward 0, so the erosion line both burns and mints. The spec lists only the burn; the plan adds `mint:revaluation` (section 5, point 2).
9. **NPC wealth is a float** (`npc-lives.ts:187`, `p.money += result.stmt.ownerPay * .8`) and company cash is a float. The helpers `personCash` and `firmCash` therefore apply the delta as given and book the rounded amount; only the player's cash (already rounded by the three primitives) is exact.
10. **F37 and F38 line numbers.** The matured-bond payout is `investments.ts:2450` to `2451` (`perUnit: newPrice`); the screen text is at 1674; `realize` is at 533. The roadmap's "transaction tax" is the nation law `newTaxes.transactions` (`nation/data.ts:97`, "a small tax on every trade and transfer"), which exists with no personal reader; F38 gives it one (`transactionsLevy`). A pitfall found while reading: `flags.taxesPaid` is the credit `settleIncomeTax` subtracts from the income tax due (`finance.ts:593`), so capital gains tax must not be added to it.
11. **Cycle membership decides where code may live.** `finance.ts`, `assets.ts`, `nation/effects.ts`, `economy/*`, `landlord.ts` are in the 19-module cycle; `business/exit.ts`, `careers.ts` and most of `business` and `special` are in the larger ones; `core.ts`, `life.ts`, `aging.ts`, `investments.ts`, `people.ts` and `business/util.ts` are in none (`test/architecture-baseline.json`). The new modules (`cash.ts`, `kernel/*`, `world/*`, `nation/rates.ts`) import only leaves, which is why F38 needs `rates.ts` instead of importing `business/exit`.
12. **The career kit already routes through the primitives** (`special/kit/year.ts:75` to `103`: `c.earn` calls `earnIncome`, `c.pay` calls `spend`), so the "thin callers of `book`" of design 4.2.4 are two reasons, `career.income` and `career.cost`. The kit's own `ledgerOf(c)` (`year.ts:115`) is a different thing; the kernel avoids that name (`peekLedger`, `ledgerRoot`).
13. **The `ledger-ok:` marker is new.** A few `.cash` receivers are not purses (a local slice of the will in `will-estate.ts:178`, a display struct). The ratchet needs a way to say so without a baseline entry that hides a real purse; the marker is capped at 12 and listed in the docs.
14. **Roadmap acceptance "pool prices carry bid-ask spreads" has few pools to apply to in R2.** The priced pools that exist are the securities markets (broker fee, price impact, `investments.ts`), housing offers (`assets.ts:2689`, a first-time buyer pays up to 1.03 times value) and goods. R2 asserts the markets (R2-L13) and the housing flip (R2-L6), measures goods (R2-L9) and gives later pools `SPREADS`, `bid` and `ask`.
15. **Cash walk.** The roadmap's player-visible "cash walk with no 'everything else' row" is a company chart (`charts/books.ts:202`, `charts/pl.ts:182`) and the flows table is per class, not per account, so it cannot explain one company's year: see section 5, point 1. Assigned to R2-L19 by the cross-check.

## 5. Assumptions and open points

1. **The exact cash walk needs per-company yearly flows that the specified `flows` table does not hold.** `flows` is country x reason x 2 years, summed over accounts of a class. Resolved by the cross-check: R2-L19 keeps a small per-company tally by reason (`BizState.tally`, `YearRecord.flows`, at most 16 numbers a company-year) set by `firmCash`, `moveCash` and `erodeFirm`, and `cashWalkSpec` names every move from it. `flowsOf` stays the country-level view. The lead may still cut R2-L19 (about 330 lines) and keep the honest residual row; if so, the roadmap's player-visible line moves to R3.
2. **`mint:revaluation`.** Negative inflation makes `c.money /= 1 + inflation` a gain, and an inflating debt shrinks. Conservation stays exact only if that gain is a declared mint. The alternative (clamp negative inflation to 0 in `erodeCash`) changes the 1930s economy. Default taken: the mint, capped at 1e12 a year.
3. **Bond par erodes with `dep`.** The lead's instruction is "par less any default haircut". The engine stores money as purchasing power, so a nominal face value that did not erode would be an inflation-proof bond (a free real gain). The plan lets `details.par` erode like cash. If the lead wants constant par, delete the `par *= 1 - dep` line in R2-L13; the tests name the line.
4. **`why` stays optional until the call count is zero.** R2-L12 makes it required only if no unreasoned call survives; the raw-write ratchet stays either way. Survivors (constructors, resets) are listed in `docs/LEDGER.md`.
5. **Goods and vehicles are measured, not asserted, for the spread probe.** R2-L9 asserts luxury goods lose money on a round trip but a category that does not is recorded, not tuned. Housing is asserted for a same-year flip only (R2-L6); an older house sells at offers of 0.85 to 1.03 times value, which is the housing pool's own spread and belongs to A.K4.
6. **The caps are this plan's numbers.** Lending 2.5e9 a year, immigrants 5e8, revaluation and the burns 1e12, `SPREADS` (markets 0.001, sellers 0.03, retail 0.10), `TRANSACTION_TAX_PER_LEVEL` 0.001, `WORLD_BUDGET` 25,000 nodes and 450,000 bytes. The lead confirms or changes them in one place each; every one is a ceiling-list entry and a pinned test.
7. **CI time.** The probe adds an estimated 90 to 150 seconds to every shard and the fast tier gains a file of under a minute. Lower `PROBE_ACTIONS` first (R2-L5), then the fast tier's years, never the 40 lives.
8. **Where the world hook sits.** The spec says "right after `yearlyEconomy`"; this plan puts the R2 indexing step last in `YEARLY_HOOKS`, because R2 only indexes and the `checkInvariants` checkpoint is the year's end. When A.K3 and later add W1 to W7, they move to right after the economy with the registry (K.3) and keep reading the opening frame; the ledger itself needs no hook (it rolls lazily on the first booking of a new year).
9. **Old NPC firms are indexed in place.** The `firms` shard holds only a ref and an owner for `data.npcCompany`; nothing is rewritten and nothing is cloned. A 22-company family is about 22 rows.
10. **Person ids.** Accounts and index rows use `person:<id>` until R4 introduces `sid`; `personRef` already prefers `data.sid`. R4 must set `sid` equal to the existing id for old records, or fold the account.
11. **Tycoons.** A life with more than 20 companies indexes the 20 most valuable (R2-L14); the rest are counted as pooled. Nothing in the simulation depends on the index in R2, so no life changes.
12. **The opt-in fuzz may surface an old defect** when the new invariants run (a second living spouse, a duplicate id). The rule: fix a one-function bug with its regression test, otherwise downgrade that one check to a `note-` kind and list the defect; never weaken a check silently.
13. **Docs.** `docs/LEDGER.md` and `docs/WORLD.md` are the only docs this track adds; the release notes and `docs/ARCHITECTURE.md` are the lead's.
