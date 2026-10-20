# R1 (v4.1.0) plan, track "notices": notice digest, Quiet Mode, inbox, text picker

Base: v4.0.2 at a local clone (read-only for the planner). Roadmap items: G.11 (digest, weights, Quiet Mode, inbox, LifeLog fold), E.T1 (text kit), E.T2 (text harness), E.T7 (voice roles headline and deck). Roadmap lines: R1 block 169-183, D.7 923-928, D.9 934-942, D.11 954-976, G decisions 1097-1103 (D18 popups, D6 saves). Design: section 9.2 and 9.3 (text kit, digest), 12.4 (notifications), 13.

## Track summary

| | |
|---|---|
| Tasks | 10 (R1-T1 to R1-T10), in dependency order. Renamed by the cross-check: they were R1-N1 to R1-N10, which collided with the Navigation track |
| Source | about 1,580 lines (new files about 1,200, edits to existing files about 380) plus about 370 lines of test-side infrastructure (`test/play-kit.ts`, `test/text-metrics.ts`) |
| Tests | about 3,100 lines in 17 new test files plus pin edits in 3 existing ones. Every file runs in node, one worker, well under 2 minutes (the slowest, `test/text-kit.test.ts`, is about 30 s) |
| New state | `flags.textMem` (at most about 690 JSON nodes), `flags.inbox` (at most about 425 nodes). Together about 1,115 worst case, inside the roadmap budget of 1,300 for "textMem and inbox" |
| Wave | T1 and T2 in wave 0 (E.T1 must be in R2's base). T3 in wave 1. T4 to T8 in wave 2. T9 and T10 last (wave 3) |
| Hot files touched | `src/game/core.ts` (one expression; R1-P2 owns `types.ts` and the `NoticeOptions` fields), `src/ui/store.ts`, `src/ui/components/ModalHost.tsx`, `src/settings.ts`, `src/ui/screens/SettingsScreen.tsx`, `src/ui/components/LifeLog.tsx`, `src/game/events/flavor.ts`, `src/game/save-schema.ts`, `scripts/voice/rules.mjs`. All edits additive, in their own hunk. `global.css` is NOT touched: all new CSS goes in a new `src/ui/styles/notices.css` |
| Simulation output | R1 changes none. The only draw added anywhere is the single `rand(g)` inside `pickLine`, which has no production caller in R1. `events/flavor.ts` keeps its exact draw sequence (proved by a golden recorded from the unmodified file, R1-T2) |

### Features and flags

| Flag (`FLAGS` in `src/game/flags.ts`, created by R1-P3; this track never edits that file) | Default at merge | Flipped by | What it gates |
|---|---|---|---|
| `noticeDigest` | false | the lead's release commit | the digest card in `ModalHost` |
| `quietInbox` | false | the lead's release commit | routing of minor notices to the inbox in `store.processQueue`, the Settings "Notices" section, the header bell (built by R1-N7) |

The text kit (E.T1), the harness, the voice roles and the LifeLog fold ship live: they are parity-tested or presentation-only.

### Conventions that apply to every task below

1. Test first: write the named test file, see it fail for the right reason, then build. Run `NODE_OPTIONS=--max-old-space-size=2048 npx vitest run --maxWorkers=1 <the task's test files>` and `npm run typecheck`.
2. Test files must be `test/*.test.ts` (`vite.config.ts` includes only that glob) and plain `.ts`: build elements with `createElement`, not JSX. UI components are tested with `renderToStaticMarkup` and pure functions; no jsdom. The store is mocked the way `test/screens.test.ts` (lines 14-38) or `test/custom-voice.test.ts` does, or used for real the way `test/store.test.ts` does (copy its `vi.hoisted` localStorage shim, lines 8-41, without the legacy settings blob).
3. No U+2014 or U+2013 anywhere (src, tests, docs). Contractions. Caps: log 90, outcome 120, scene 140, tooltip 120, digest 110, choice label 5 words.
4. Stored shapes are `type` aliases, not `interface` (an interface is not assignable to `Json`, `types.ts:36`). Write `g.flags.x = value` without a cast where the type allows it. Component return types are `ReactElement` (`import type { ReactElement } from 'react'`): `@types/react` 19 has no global `JSX` namespace.
5. New modules named "leaf" import only `type` imports and other leaves (`src/game/rng.ts` is a leaf: it imports only types). The K.1 cycle ratchet fails on a new module inside a cycle. Checked: `core.ts`, `rng.ts`, `events/flavor.ts`, `ui/store.ts`, `ModalHost.tsx`, `settings.ts` and `save-schema.ts` are not in the 147-module baseline (the scan another planner left at `.../a scratch folder lists components of 19, 85, 7, 6 and 30 modules; none of these is in them). `events/helpers.ts`, which flavor imports, is in the 85-module component, so flavor must import only leaves from the new code.
6. No `earnIncome(`, `spend(`, `addMoney(`, `b.cash +=` or `p.money +=` in any new file (the X.G1 money ratchet). No read of year+1 (the foresight scan). Nothing here touches money.
7. Commits: explicit pathspecs, one task per commit, message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
8. Pure builders must survive `deepFreeze` (`test/fuzz-kit.ts:511`): `readTextMem`, `familyStats`, `readInbox`, `inboxUnread`, `neverRoute`, `routesToInbox`, `headNoticeRun`, `planHead`, `digestRows`, `yearViews`, `hunit`, `hpick` must not write.
9. Flags (cross-check): `FLAGS` is the readonly live view from R1-P3. Production code reads `FLAGS.noticeDigest` or `flagOn('quietInbox')` at use. Tests turn flags on with `withFlags({ ... }, () => ...)` or `setFlags({ ... })` in `beforeEach` and `resetFlags()` in `afterEach`; never `vi.mock` the flags module (R1-P3 has a guard test) and never assign to `FLAGS`. Nobody here edits `src/game/flags.ts` or `src/game/world-flags.ts`: R1-P3 declares `noticeDigest` and `quietInbox`, R1-P6 classifies `textMem` and `inbox` as `personal` and `flavorRecent` as `cache`. The lead's release commit flips the defaults.

---

## Ordered task list

### R1-T1 Text kit core (E.T1, part 1)

**Roadmap items.** E.T1 (D.9 first, second, third and fourth bullets; D.11 criterion 9). Wave 0.

**Files.**
- Create `src/game/text/hash.ts`, `src/game/text/memory.ts`, `src/game/text/registry.ts`, `src/game/text/pick.ts`, `src/game/text/index.ts`.
- Create `test/text-hash.test.ts`, `test/text-memory.test.ts`, `test/text-pick.test.ts`.
- No edit to `src/game/world-flags.ts`: R1-P6 pre-declares `textMem` as `personal` (cross-check). If the file is not in your base yet, R1-P6 has not merged: merge it first, do not create the file.

**Interfaces.**

```ts
// src/game/text/hash.ts (leaf, no imports)
export function fnv1a(text: string): number                 // 32-bit FNV-1a, unsigned
export function mix32(h: number): number                    // murmur3 finalizer, unsigned
/** A stable number in [0, 1) for this life, year and key. Draws nothing, reads no state. */
export function hunit(lifeId: string, year: number, key: string): number
/** Presentation text pick: a hash like the CEO coda (business/career.ts:392-413), never g.rng. Throws on an empty list, like pick(). */
export function hpick<T>(lifeId: string, year: number, key: string, lines: readonly T[]): T
/** 'p' + 8 hex digits of a hash over the lines (count and text). Cached per array in a WeakMap. */
export function poolHash(lines: readonly string[]): string

// src/game/text/memory.ts (imports `type` GameState and Json only)
export const TEXT_MEM_LIMITS: Readonly<{ pools: 300; families: 120; recent: 8; bag: 12; famYears: 12; famWindow: 10; rings: 4; ring: 64; ringKey: 80 }>
/** g.flags.textMem. Every value is a string or a string array so a pool costs one JSON node. */
export type TextMem = {
  v: 1
  /** pool key -> 'b<mask>' or 'b<mask>.<last>' (shuffle-bag, pools of 12 or fewer) or 'w<i>,<j>,...' (the last up to 8 indexes, oldest first). */
  p: Record<string, string>
  /** family key -> ascending years of use, '2031,2033,2040', at most 12 */
  f: Record<string, string>
  /** named rings of opaque keys, oldest first (the flavor ring, R1-T2) */
  r: Record<string, string[]>
}
export type PoolRecall =
  | { kind: 'bag'; used: number; last: number }          // used = bitmask of picked indexes this cycle, last = -1 when none
  | { kind: 'window'; recent: number[] }
/** Pure. A sanitized deep copy of g.flags.textMem (junk, wrong types, oversize maps are dropped or trimmed). Never throws, never writes. */
export function readTextMem(g: GameState): TextMem
/** The live, sanitized object stored at g.flags.textMem (created when missing). For code that already mutates a draft. */
export function writableTextMem(g: GameState): TextMem
export function recallPool(mem: TextMem, key: string, n: number): PoolRecall   // wrong kind or unparsable record -> empty recall
export function rememberPool(mem: TextMem, key: string, n: number, index: number): void  // touches the key (moves it last), evicts the oldest past 300
export function noteFamily(g: GameState, fam: string): void                    // appends g.year, drops years <= g.year - 10, keeps 12, evicts the oldest family past 120
export function familyStats(g: GameState, fam: string): { last: number | null; count10: number }  // pure; count10 counts years y with g.year - 10 < y <= g.year
export function ringRead(g: GameState, name: string): string[] | null          // null when the ring was never written; a copy
export function ringWrite(g: GameState, name: string, keys: readonly string[], cap?: number): void  // keeps the newest `cap` (default and maximum 64) strings of at most 80 characters; at most 4 rings

// src/game/text/registry.ts (leaf)
/** Registers a named pool and returns a frozen copy of the lines. Registering an id twice replaces it (HMR safe). */
export function defineLines<const T extends readonly string[]>(id: string, lines: T): T
export function linesId(lines: readonly string[]): string | undefined         // the id a frozen array was registered under
export function registeredLines(): ReadonlyMap<string, readonly string[]>

// src/game/text/pick.ts (imports ../rng rand, ./memory, ./registry, ./hash)
/**
 * Like pick(g, lines): exactly one rand(g) draw, and with an empty memory the same result.
 * Pools of 12 or fewer are shuffle-bags (no line twice before every line was used; a new cycle never starts on the last line of the old one).
 * Larger pools exclude the last min(8, floor(n / 2)) picks.
 * `fam` (letters, digits, _ . : -, at most 48 characters, starting with a letter) names the pool and the family; without it the pool's registered id, else poolHash(lines).
 * A named pool also notes the family (noteFamily). A pool of one line returns it after the draw and stores nothing.
 */
export function pickLine(g: GameState, lines: readonly string[], fam?: string): string
/** Pure core of the exclusion rule, exported for tests: the indexes pickLine may choose from, never empty. */
export function candidateIndexes(n: number, recall: PoolRecall | null): number[]
// src/game/text/index.ts re-exports all of the above.
```

**Behaviour.**
1. `pickLine` order of work: `n = lines.length`; `n === 0` throws `Error('pickLine() from empty list')`; `r = rand(g)` (the one and only draw, taken before anything else, so an exception later cannot change the draw count); `n === 1` returns `lines[0]`; resolve the key; `recallPool`; `allowed = candidateIndexes(n, recall)`; `index = allowed[Math.floor(r * allowed.length)]`; `rememberPool`; `noteFamily` if the pool is named; return `lines[index]`. With an empty memory `allowed` is `0..n-1`, so the index is `Math.floor(r * n)`, exactly what `pick` (`rng.ts:34`) computes.
2. Bag (`n <= 12`): `unused` = indexes whose bit is not in `used`; if none are left (cycle complete) the allowed set is every index except `last` (all of them when `n === 1`); `rememberPool` starts a new cycle with just the new bit when the old mask was full, else adds the bit; always sets `last`.
3. Window (`n > 12`): `k = Math.min(8, n >> 1)`; allowed = indexes not among the last `k` of `recent` (indexes `>= n` in `recent` are ignored, so a pool that changed size cannot crash); `rememberPool` pushes the index and keeps the newest 8. If `allowed` would be empty it is every index.
4. Pool and family keys always start with a letter (integer-like keys would reorder an object). `fam` that does not match the name pattern is ignored (hash key used). Keys of `p` and `f` match `^[A-Za-z][A-Za-z0-9_.:-]{0,47}$` or `^p[0-9a-f]{8}$`.
5. Record codecs (strict regexes, anything else reads as empty): bag `^b(\d{1,4})(?:\.(\d{1,2}))?$` with mask below 4096 and last below 12; window `^w\d{1,5}(?:,\d{1,5}){0,7}$`; family `^\d{1,6}(?:,\d{1,6}){0,11}$`.
6. Caps: 300 pools, 120 families, 4 rings of 64. `rememberPool`/`noteFamily` delete then re-add the key so insertion order is recency order, and evict from the front past the cap. `writableTextMem` trims oversize maps from the front and drops invalid entries, so a hostile save cannot make the state grow. Worst case about 690 JSON nodes.
7. Reset per generation needs no code: `continueAsChild` rebuilds `flags` from a whitelist (`life.ts:1509-1529`) and `textMem` is not on it. A test proves it.
8. `hunit`: `mix32(fnv1a(lifeId + '|' + year + '|' + key)) / 2**32`. `hpick` returns `lines[Math.floor(hunit(...) * lines.length)]`.
9. Nothing in `src/` calls `pickLine`, `hpick` or `defineLines` yet except R1-T2 (ring functions). The codemod is E.T3 in R2.

**Tests** (D.11 criterion 9; numbering is the order in the files).
- `test/text-pick.test.ts`:
  1. Parity: for seeds 1 to 20 and pool sizes 1, 2, 3, 5, 12, 13, 16, 40, the first `pickLine` returns what `pick` returns on a clone and leaves `g.rng` equal to the clone's.
  2. Draw count: 500 mixed calls; after each, `g.rng` equals the state of a reference stream that called `rand` once per call.
  3. Bags: n = 5 and n = 12, 60 picks: every aligned block of n picks is a permutation; the first pick of a block differs from the last pick of the previous block.
  4. Boundary: n = 12 behaves as a bag, n = 13 as a window. Windows: for n = 13 (k 6), 16 and 40 (k 8) no result equals any of the previous k results.
  5. n = 1 returns the line, writes nothing to `flags`; n = 0 throws.
  6. `fam`: a valid name keys the memory and the family (`familyStats` shows the call); an invalid name falls back to `poolHash`; two arrays under one name never crash (indexes beyond n are ignored).
  7. Registered ids: a `defineLines` array uses its id as key and notes the family; the returned array is frozen.
  8. Hostile `g.flags.textMem` (a string, an array, `{p: {x: 5}}`, 5,000 pool entries, NaN, a 10 MB string value): `pickLine` still works, memory ends bounded (at most 300 pools, 120 families) and valid.
  9. Purity: `readTextMem` and `familyStats` on a `deepFreeze`d state do not throw and return the same JSON twice.
  10. Reset per generation: `continueAsChild` on a game with `flags.textMem` set returns a state without it (set up as in `test/life.test.ts:127-158`).
  11. No production caller (cross-check; this is what makes the one new `rand(g)` draw harmless in R1): a source scan of `src/` finds no use of `pickLine(`, `hpick(` or `defineLines(` outside `src/game/text/`. R1-T2 uses only `ringRead`/`ringWrite`. E.T3 (R2) deletes this test when the codemod starts.
- `test/text-memory.test.ts`: codec round trips for bag and window; invalid strings read as empty; LRU eviction (301st pool drops the first, a touched key survives); family years: window pruning, 12-year cap, `count10` and `last`; ring caps (65 keys -> 64, key longer than 80 dropped, fifth ring ignored); `readTextMem` of junk returns a valid empty memory; JSON node count of a full memory (300 pools, 120 families, 4 full rings) is at most 700.
- `test/text-hash.test.ts`: `hpick` is deterministic and independent of call order; changes with year, key and life; chi-square-ish uniformity (10 lines, 10,000 keys, each line 700 to 1,300 hits); never calls `Math.random` (spy) and has no `GameState` parameter; throws on empty; `poolHash` is stable, depends on content and order, and is cached (same array -> same string without rehashing; spy on `fnv1a` is not needed, check the WeakMap by identity of result); registry: `defineLines` freezes, replaces on a second call, `registeredLines` lists it; every line registered in the test, run through `unitFlags(line, 'log')` from `../scripts/voice/rules.mjs`, raises none of `em-dash`, `chatbot`, `stock`, `no-contraction` (and a deliberately bad sample line is caught, so the check is real).

**Flag.** None (library code, no caller).
**Hot-file notes.** None (all new files).
**Depends on.** Nothing. (Platform K.1 ratchet only checks it.)
**Size.** Source about 440 (hash 60, memory 230, registry 45, pick 95, index 12). Tests about 680.

---

### R1-T2 `events/flavor.ts` onto the shared memory (E.T1, part 2)

**Roadmap items.** E.T1 first client (D.9 fifth bullet); D.11 criterion 9 and the "R1 changes no simulation output" probe. Wave 0 (after R1-T1).

**Files.**
- Modify `src/game/events/flavor.ts` (lines 570-573 `recentKeys`, line 637 the write; add one import and one constant).
- Create `test/flavor-memory.test.ts`.
- Create `test/fixtures/flavor-golden.json` (generated, about 6 KB).

**Interfaces.** No new exports. Constants in flavor.ts: `const FLAVOR_RING = 'flavor'`, cap `60`.

**Behaviour.**
1. Step 0, before touching `flavor.ts`: write the golden test (stage one of the test file) and generate the fixture from the UNMODIFIED file with `FLAVOR_GOLDEN=1 npx vitest run --maxWorkers=1 test/flavor-memory.test.ts`. The generator: four cases `{seed 11, birth 1925}`, `{12, 1960}`, `{13, 1990}`, `{14, 2012}`; for each, `g = createNewLife({ seed, year: birth })` (`src/game/life.ts`), `g.queue = []`, then for age 1 to 85 set `g.character.age = age` and `g.year = birth + age`, call `addFlavorLines(g)` and record `fnv1a(`${g.rng}|${lines added this step joined by newline}`)` (use `fnv1a` from `src/game/text/hash.ts`). The fixture is `{ v: 1, cases: [{ seed, birth, steps: string[85] }] }` with hex strings. Commit the fixture first, in its own commit. The normal run compares; `FLAVOR_GOLDEN=1` only rewrites.
2. Then change `flavor.ts`: `recentKeys(g)` returns `ringRead(g, FLAVOR_RING)` when that is not null; otherwise the old `g.flags.flavorRecent` filtered to strings (saves from v4.0.2); otherwise `[]`. At the end of `addFlavorLines` replace `g.flags.flavorRecent = recent.slice(-60)` by `ringWrite(g, FLAVOR_RING, recent, 60)` followed by `delete g.flags.flavorRecent`. Nothing else in the function changes: the `shuffle` (n-1 draws per attempt, `flavor.ts:616`), the `weightedPool` draw and every `chance` stay, so the draw sequence and the exclusion set are identical.
3. This is deliberately a ring inside `textMem` (key `r.flavor`, 60 keys of the form `pool:index`), not 6-index pool memory: the v4.0.2 memory is one 60-key window over all pools. Moving it onto per-pool memory would change which lines are excluded and so change the life log. A later family PR (E.T3) may convert it with a seeded re-baseline.

**Tests** (`test/flavor-memory.test.ts`).
1. Golden: the 4 cases by 85 steps match `test/fixtures/flavor-golden.json` (this proves draw count and output unchanged against v4.0.2).
2. Legacy save: a state with `flags.flavorRecent` holding 60 keys excludes exactly those keys on the next call (assert with a pool where the legacy keys cover every line but one) and afterwards `flags.flavorRecent` is gone and `readTextMem(g).r.flavor` has at most 60 keys.
3. Ring behaviour: after 120 calls the ring has at most 60 keys and its last entries are the newest lines' keys.
4. Reset per generation (heir): `textMem` absent after `continueAsChild`.
5. Hostile ring (`r.flavor` of numbers, 10,000 strings, an object): no throw, result bounded at 60.
6. The existing suites that touch flavor stay green: run `test/events.test.ts` and `test/era-early-lives.test.ts` (the 5% duplicate bound at line 150) once.

**Flag.** None.
**Hot-file notes.** `flavor.ts` is edited by no other track in R1.
**Depends on.** R1-T1.
**Size.** Source about 35 changed lines. Tests about 220.

---

### R1-T3 Voice roles headline and deck (E.T7)

**Roadmap items.** E.T7 (D.9 last bullet; design 9.4 and 14.4). Any wave; do it early.

**Files.**
- Modify `scripts/voice/rules.mjs` (lines 48 and 51: `LIMITS`, `AIMS`; the doc comment at 264).
- Modify `scripts/voice/rules.d.mts` (`LimitedRole`, line 15).
- Modify `docs/VOICE.md` (Lengths table: two rows).
- Modify `test/voice-report.test.ts` (lines 756-759, the pin).
- Create `test/voice-roles.test.ts`.

**Interfaces.**

```js
// rules.mjs
export const LIMITS = Object.freeze({ log: 90, scene: 140, outcome: 120, tooltip: 120, digest: 110, headline: 70, deck: 110 });
export const AIMS   = Object.freeze({ log: 60, scene: 110, outcome: 100, tooltip: 100, digest: 100, headline: 55, deck: 90 });
```
```ts
// rules.d.mts
export type LimitedRole = 'log' | 'scene' | 'outcome' | 'tooltip' | 'digest' | 'headline' | 'deck'
```

**Behaviour.** Add the two keys, keep the old keys and numbers exactly. `unitFlags(text, 'headline')` raises `over-cap` above 70 static characters and `over-aim` above 55; `deck` above 110 and 90. `FLAG_NAMES` and the em-dash guard (`test/voice-guards.test.ts`, still at most 24) are untouched. Do not touch `scripts/voice/units.mjs` (`ROLE_ORDER` at line 73): the classifier emits no headline or deck literal until the Paper (R5, E.N2), and `test/voice-batch.test.ts` pins its output. Do not add exports to `rules.mjs` (the test at `voice-report.test.ts` "rules.d.mts declares every export" would need a matching declaration). `docs/VOICE.md` Lengths table gets `| Headline (a news story's first line) | 70 | 55 |` and `| Deck (the line under a headline) | 110 | 90 |`; keep every banned phrase in the file (the test at `voice-report.test.ts:768` reads it).

**Tests.** `test/voice-roles.test.ts`: (1) `LIMITS` and `AIMS` equal the objects above; (2) `unitFlags` boundary for both roles: a 70-character headline has no `over-cap`, 71 has, 55 has no `over-aim`, 56 has; deck 110/111 and 90/91; (3) the five old roles are unchanged; (4) `rules.d.mts` text contains `'headline' | 'deck'`; (5) `docs/VOICE.md` contains both new rows with their numbers. Edit `test/voice-report.test.ts:757-758` to the new objects (a legitimate changed expectation: new roles; say so in the commit).

**Flag.** None.
**Hot-file notes.** `rules.mjs` is also touched by no other R1 track.
**Depends on.** Nothing.
**Size.** Source about 15 (plus 3 doc lines). Tests about 80.

---

### R1-T4 Notice digest card, step 1 (G.11 step 1)

**Roadmap items.** G.11 step 1 (D.7 first bullet; design 12.4). D.11 criterion 8, first clause. Wave 2.

**Files.**
- Create `src/ui/components/noticeModel.ts` (pure, no React, no store).
- Create `src/ui/styles/notices.css`.
- Modify `src/ui/components/ModalHost.tsx` (imports; `DigestCard`; the plan branch in `ModalHost`).
- Modify `src/ui/store.ts` (add `dismissNotices` right after `dismissNotice`, line 470-472).
- No edit to `src/game/flags.ts` (R1-P3 declares `noticeDigest`; the file does not exist in v4.0.2 until R1-P3 merges).
- Create `test/notice-digest.test.ts`.

**Interfaces.**

```ts
// noticeModel.ts
import type { ModalItem, NoticeModal, Tone } from '../../game/types'
export const DIGEST_MIN = 2
export const DIGEST_MAX = 8
/** A notice that may share a card: kind 'notice' without `support` (the self-harm help line always gets its own card). */
export function mergeable(m: ModalItem): boolean   // plain boolean on purpose: a type predicate would narrow a support notice to a non-notice
/** The maximal leading run of mergeable notices, at most DIGEST_MAX; [] when fewer than DIGEST_MIN or when `enabled` is false. Pure: never touches the queue. */
export function headNoticeRun(queue: readonly ModalItem[], enabled?: boolean): NoticeModal[]
/** 'bad' if any item is bad; 'good' if every item is good; otherwise undefined. */
export function digestTone(items: readonly NoticeModal[]): Tone | undefined
export function digestTitle(n: number): string                      // `${n} updates`
export interface DigestRow { id: string; emoji: string; title: string; text: string; tone: Tone }
export function digestRows(items: readonly NoticeModal[]): DigestRow[]   // emoji = modal.emoji ?? tone emoji ('😄' good, '😟' bad, '📣' event) ?? ''; tone defaults to 'neutral'
export type HeadPlan = { kind: 'digest'; items: NoticeModal[] } | { kind: 'single'; modal: ModalItem } | { kind: 'none' }
/** What ModalHost draws for this queue: a digest, the head modal as today, or nothing (empty queue or an 'aiTask' head). */
export function planHead(queue: readonly ModalItem[], digestOn: boolean): HeadPlan

// store.ts
/** One OK for a run of notices: removes the notices with these ids in one act(). Ids that are not notices in the queue are ignored; a second call is a no-op. */
export function dismissNotices(ids: readonly string[]): void

// ModalHost.tsx
export function DigestCard({ items }: { items: readonly NoticeModal[] }): ReactElement
```

**Behaviour.**
1. `ModalHost` computes `plan = game ? planHead(game.queue, FLAGS.noticeDigest) : { kind: 'none' }`. A `digest` plan returns `<DigestCard key={ids.join('+')} items=... />`; every other path is today's code unchanged (the `head`/`taskAtHead` effect at lines 37-46 stays).
2. The run stops at the first non-mergeable item, so a `choice`, `input`, `minigame` or `aiTask` is never inside a card, is never reordered, and is drawn by its own card as soon as it is the head (so a choice is never hidden behind a card that was built from items after it). A single notice (run of 1) uses today's `NoticeCard`. A run longer than 8 is shown 8 at a time; the rest forms the next card.
3. `DigestCard`: `PopupFrame` with `className` `tone-bad` (any bad item), `tone-good` (all good) or none; emoji `😟` for bad, `📋` otherwise; `<h2 class="popup-title">` with `digestTitle`; `<ul class="digest-list">` of `<li class="digest-item tone-<tone>">` each with an emoji span (`aria-hidden`), `<strong class="digest-title">` and `<span class="digest-text">` (title and text in full, never truncated: the popup already scrolls); one `OK` button (`autoFocus`, `btn btn-primary btn-block`) calling `dismissNotices(ids)`; Enter dismisses with the same guard as `NoticeCard` (`e.key === 'Enter'`, not `e.repeat`, not when `isTyping(e.target)`). Tone is also carried by the row emoji, never by colour alone.
4. `dismissNotices`: `want = new Set(ids)`; return when the game is missing, `want` is empty or no queue item is a notice in `want`; else `act((g) => { g.queue = g.queue.filter((m) => !(m.kind === 'notice' && want.has(m.id))) })`. One clone, one save for the whole card. It does not use `handleModal` (a notice's handler is empty).
5. The render never writes `g.queue`.
6. CSS in `notices.css` (imported by `ModalHost.tsx`): `.digest-list` (no bullets, grid, 10px gap, left aligned), `.digest-item` (3px left border in `--hairline`, `.tone-good/.tone-bad/.tone-event` borders in `--tone-good/--tone-bad/--tone-event`), `.digest-title` (800 weight, 15px), `.digest-text` (block, 14.5px, `white-space: pre-line`, `overflow-wrap: anywhere`). Works at 360 px width; no fixed heights. Do not edit `global.css`.
7. `ModalHost.tsx` keeps its local `TONE_EMOJI` (do not refactor `NoticeCard`); `noticeModel.ts` carries its own three-entry map.

**Tests** (`test/notice-digest.test.ts`).
1. `planHead`/`headNoticeRun` table: `[]`, `[N]`, `[N,N]`, `[N,N,C]`, `[C,N,N]`, `[N,C,N]`, `[N,aiTask,N]`, `[Nsupport,N,N]`, `[N,N,Nsupport]`, ten notices (first 8, then the next call on the rest gives 2), flag off (`digestOn` false -> `single`), an `aiTask` head -> `none`, empty -> `none`.
2. Queue untouched (D.11 criterion 8): `deepFreeze` a queue of mixed modals, call `planHead`, `headNoticeRun`, `digestRows`, `digestTone`; no throw and `JSON.stringify` unchanged.
3. `digestTone` table (any bad -> bad; all good -> good; good + neutral -> undefined; event only -> undefined; empty -> undefined).
4. `DigestCard` markup (store mocked as in `test/custom-voice.test.ts`): rows in queue order; exactly one `OK` button; `tone-bad` on the card when a bad item is present; a hostile title `<img onerror>` is escaped; no `popup-support`; 8 rows render 8 `digest-item`.
5. `dismissNotices` on the real store (`test/store.test.ts` pattern): queue `[N1,N2,N3,C]` -> after `dismissNotices([N1,N2,N3].map(id))` queue is `[C]`; a choice id and an unknown id are ignored; calling twice changes nothing; the dismissed run produced one state object (compare `store.getApp().game` identity before and after a repeated call).
6. Voice: `digestTitle(n)` for n 2 to 8 passes `unitFlags(text, 'tooltip')` with no flag and contains no U+2014; the stylesheet contains `.digest-list`.

**Flag.** `FLAGS.noticeDigest`, default false.
**Hot-file notes.** `ModalHost.tsx`: Charts G.4 (Year-End Desk) edits the `minigame` branch and `MinigameCard`; this task edits imports, adds `DigestCard`, and changes only the start of the `ModalHost` body and the line before `switch (head.kind)`. `store.ts`: one function in its own hunk after `dismissNotice`. G.12 (focus trap) changes `PopupFrame` in `Dialogs.tsx`; `DigestCard` only uses it and keeps `autoFocus` on OK.
**Depends on.** R1-P3 (`src/game/flags.ts`) and R1-A5 for the `PopupFrame` wrapper (merge order only). If `flags.ts` is not in your base, stop and report; do not create it.
**Size.** Source about 240 (noticeModel 70, ModalHost +90, store +22, CSS 58). Tests about 280.

---

### R1-T5 Quiet Mode setting, inbox state, never-route policy, notice weight plumbing (G.11 step 2, data layer)

**Roadmap items.** G.11 step 2 (D.7 second bullet), D18. D.11 criteria 4 and 8. Wave 2.

**Files.**
- Create `src/game/inbox.ts` (leaf: imports `type` GameState, Json, NoticeModal, Tone and `./notice-policy`).
- Create `src/game/notice-policy.ts` (leaf: types only).
- Create `src/game/notice-weights.ts` (leaf: no imports; the set is empty here and filled in R1-T7).
- Create `src/ui/components/NoticeSettings.tsx`.
- Modify `src/settings.ts` (interface at 19-26, defaults 28-32, `normalizeSettings` 57-65; add `quietModeOn`).
- Modify `src/ui/screens/SettingsScreen.tsx` (import plus one `<NoticeSettingsSection />` line after the Money `</section>`, before `<TimeMachineSettingsSection />`, line 219).
- No edit to `src/game/types.ts`: R1-P2 adds `NoticeModal.weight` and `NoticeModal.link` (cross-check). If they are missing from your base, R1-P2 has not merged: stop and tell the lead.
- Modify `src/game/core.ts` (`notice` at 444-447 only: one import and the single `weight` expression; R1-P2 already added `NoticeOptions.weight`/`link` and the conditional spreads).
- Modify `src/game/save-schema.ts` (`migrateLegacyAi`, the queue loop at lines 79-82).
- No edit to `src/game/flags.ts` (R1-P3 declares `quietInbox`) or `src/game/world-flags.ts` (R1-P6 classifies `inbox`).
- Create `test/quiet-settings.test.ts`, `test/inbox-state.test.ts`, `test/notice-policy.test.ts`, and the shared table module `test/notice-table.ts` (exports `NEVER_ROUTE_TABLE`, the rows described under Tests; R1-T6 and R1-T10 import it).
- Modify the pins in `test/store.test.ts` (lines 120, 121, 126) and `test/offline.test.ts` (lines 290, 293, 299, 311, 320).

**Interfaces.**

```ts
// settings.ts
export interface Settings { /* money, prices, sandboxTimeMachine, */ quietMode: boolean }   // routine notices wait in the inbox; default true
export const DEFAULT_SETTINGS: Settings                                                  // quietMode: true
export function quietModeOn(s: { quietMode?: boolean } | null | undefined): boolean     // s?.quietMode !== false
// normalizeSettings: quietMode: bool(raw.quietMode, d.quietMode)

// NoticeSettings.tsx
export function quietPatch(on: boolean): Partial<Settings>
export function NoticeSettingsSection(): ReactElement | null      // null unless FLAGS.quietInbox; a "Notices" card with one switch, same markup as TimeMachineSettingsSection

// types.ts (NoticeModal), added by R1-P2, quoted here for reference only
// weight?: 'minor'   Routine notice: Quiet Mode may send it to the inbox (ui/store.ts processQueue). Optional in saves; missing means ordinary.
// link?: string      Where the inbox row leads: a place key such as 'assets/home/mortgage' (Navigation's placeKey: tab, then group ids). Optional.

// core.ts: R1-P2 added NoticeOptions { weight?: 'minor'; link?: string } and the spreads
//   ...(opts.weight === 'minor' ? { weight: 'minor' as const } : {})   and   ...(opts.link ? { link: opts.link } : {})
// This task changes only the first one: `const weight = opts.weight ?? noticeWeightFor(title)` and the spread tests `weight === 'minor'`.

// notice-weights.ts
export const MINOR_NOTICE_TITLES: ReadonlySet<string>            // empty until R1-T7
export function noticeWeightFor(title: string): 'minor' | undefined

// notice-policy.ts
export const LARGE_FIGURE = 10_000
export type RouteBlock = 'support' | 'tone' | 'health' | 'legal' | 'money'
export const HEALTH_RE: RegExp
export const LEGAL_RE: RegExp
/** The biggest number in a text in display units ("$1.2M" -> 1,200,000, "12,500" -> 12500); 0 when there is none. */
export function largestFigure(text: string): number
/** Why a notice must stay a popup, or null. First match wins in the order support, tone, health, legal, money. */
export function neverRoute(m: Pick<NoticeModal, 'title' | 'text' | 'tone' | 'support'>): RouteBlock | null
/** True only for a notice with weight 'minor' that neverRoute lets through, while Quiet Mode is on. Choices, inputs, minigames and tasks are never routed. */
export function routesToInbox(m: ModalItem, quiet: boolean): boolean

// inbox.ts  (g.flags.inbox)
export const INBOX_MAX = 60
export const INBOX_TEXT_MAX = 160
export const INBOX_LINK_MAX = 80
export type InboxItem = { id: string; y: number; a: number; t: string; k?: 'good' | 'neutral' | 'event'; l?: string }
export type InboxState = { v: 1; total: number; seen: number; items: InboxItem[] }
export function readInbox(g: GameState): InboxState                   // pure, sanitized copy, never throws
export function inboxUnread(g: GameState | null | undefined): number // pure: min(items.length, max(0, total - seen))
export function clipInboxText(title: string, text: string): string    // `${title}: ${text}`, white space collapsed, cut at the last space before 157 characters + '...' when longer than 160
export function inboxItemOf(g: GameState, m: NoticeModal): InboxItem // y = g.year, a = g.character.age, k = good, event or neutral from the tone (a bad notice never routes), l = m.link when valid
export function pushInbox(g: GameState, items: readonly InboxItem[]): void   // dedupe by id, newest 60, total += added
export function markSeen(g: GameState): void                          // seen = total
export function emptyInbox(g: GameState): void                        // items = [], seen = total
export function routeMinorNotices(g: GameState): number               // removes every notice with routesToInbox(m, true) from g.queue (order of the rest kept), pushInbox them, returns the count; idempotent
```

**Behaviour.**
1. Quiet Mode default is on for everyone (D18). It only has an effect while `FLAGS.quietInbox` is on (R1-T6 reads both). The Settings section is hidden while the flag is off, so no dead switch ships.
2. `neverRoute` regexes (case-insensitive, whole words):
   - `HEALTH_RE`: health, sick, sickness, ill, illness, disease, diagnos*, hospital, surgery, surgeon, doctor, nurse, injur*, wound*, cancer, infection, infected, flu, fever, virus, symptom*, pregnan*, miscarriage, overdose, rehab, addict*, therap*, depress*, anxiety, panic, medic*, pill*, pain, hurt, accident, ambulance, emergency, died, dies, death, dead, dying, funeral.
   - `LEGAL_RE`: arrest*, police, cop, cops, court, judge, jury, lawsuit, sue, sued, suing, trial, convict*, prison, jail, sentence*, warrant, lawyer, attorney, legal, illegal, crime, criminal, investigat*, fine, fined, fines, penalty, probation, parole, bail, audit*, fraud, charged, indict*, subpoena, deport*, immigration.
   - Tone: `tone === 'bad'`. Support: `support === true`. Money: `largestFigure(title + ' ' + text) >= LARGE_FIGURE` (10,000 display units, or a K, M, B, T, thousand, million, billion, trillion suffix that reaches it). Deliberately conservative: a yen or rupiah amount reaches 10,000 sooner, which only keeps more notices modal.
   - `largestFigure` regex: `/(\d[\d,]*(?:\.\d+)?)(?:\s?(K|M|B|T|thousand|million|billion|trillion)\b)?/gi`; strip commas; multiply by 1e3, 1e6, 1e9, 1e12.
3. `readInbox` sanitizes: items must be objects; `id` string 1 to 24 characters; `y` integer 1000 to 100000; `a` integer 0 to 10000; `t` string trimmed and clipped to 160; `k` one of good, neutral, event (else dropped); `l` string matching `^[a-z]+(?:/[A-Za-z0-9._:-]{1,40}){0,6}$` and at most 80 characters (else dropped); duplicate ids dropped; newest 60 kept; `total` and `seen` finite integers 0 to 1e9, `seen <= total`, `total >= items.length`. `pushInbox` sanitizes first, so a hostile saved inbox is repaired the first time it is written. Node cost at the cap: 60 items by up to 7 nodes plus 5, about 425.
4. `routeMinorNotices` must not call `uid` or `g.rng`; the item `id` is the modal id.
5. `notice()` change is additive: all existing calls produce the same object as before except the titles in `MINOR_NOTICE_TITLES` (none yet). `scriptChoice` (core.ts:450) is unchanged: choices never carry a weight.
6. `save-schema.ts` `migrateLegacyAi` loop (lines 79-82): add `if ('weight' in modal && modal.weight !== 'minor') delete modal.weight` and `if ('link' in modal && (typeof modal.link !== 'string' || modal.link.length > INBOX_LINK_MAX)) delete modal.link` (import the constant from `./inbox`, or inline 80). `isModal` (lines 187-215) already accepts extra fields.
7. Settings pins to update in the same commit (new key, legitimate): `test/store.test.ts` lines 120, 121 and 126 gain `quietMode: true`; `test/offline.test.ts` line 290 (`normalizeSettings(legacy)`), 293 (`Object.keys(DEFAULT_SETTINGS).sort()` -> `['money', 'prices', 'quietMode', 'sandboxTimeMachine']`), 299, and the "leaves clean ones untouched" case: `clean` (line 311) and the expectation (line 320) gain `quietMode: true`, otherwise `loadSettings` rewrites storage and `writes` is 1. State in the commit message that these are changed expectations for a new setting.
8. `SettingsScreen` copy must not match `test/screens.test.ts:251` (`/\bAI\b|API key|narrat|provider|LM Studio|temperature|Advanced/i`) and must keep the order Time Machine, About, Danger Zone (`test/about.test.ts`).

**Section copy (voice-checked in the tests).** Heading "Notices". Help: "Routine news waits in the inbox instead of popping up. Decisions, money, health and legal news always pop up." Switch title: "Quiet Mode". Switch help: "On by default."

**Tests.**
- `test/quiet-settings.test.ts`: default true; `normalizeSettings({quietMode:false})` false; `{quietMode:'no'}` and junk -> true; `quietModeOn(null)` true; `quietPatch(false)`; `NoticeSettingsSection` renders `null` with the flag off and a `role="switch"` with `aria-checked="true"` with it on (render inside `withFlags({ quietInbox: true }, () => ...)`; no module mock); copy passes `unitFlags` with no `em-dash`, `chatbot`, `no-contraction`; `updateSettings({ quietMode: false })` on the real store persists to `anotherlife.settings.v1`.
- `test/notice-policy.test.ts`: (D.11 criterion 8) a table of at least 30 notices: bad tone ("Burglary victim"), support, every health word class, every legal word class, large money ("$250,000", "$1.2M", "12,500", "Rp 800,000"), and passing rows (a small raise "$1,200", a letter, "Your friend called") with weight minor -> routes; same notices without weight -> do not route; quiet false -> nothing routes; choice, input, minigame, aiTask -> never; `largestFigure` cases including "5 minutes" (no suffix match), "1.5M", "2,500", "12 players"; `deepFreeze` safe.
- `test/inbox-state.test.ts`: round trip; cap at 60 with `total` still counting; dedupe by id; `clipInboxText` at 160 and the word-boundary rule; `inboxUnread` after `markSeen`/`emptyInbox`; hostile `g.flags.inbox` (string, array, 500 items, items with NaN, 1e300, wrong types, `l` with `javascript:` or 200 characters) -> `readInbox` bounded and valid, `pushInbox` repairs it; `routeMinorNotices`: moves only routable notices, keeps order of the rest, idempotent, never touches choices; `JSON` node count of a full inbox at most 450; a hostile queue notice with `weight: 'major'` and `link: 5` is repaired by `migrateSave` (the v4.0.2 fixture `test/fixtures/save-v1.json.gz` still loads: assert through `test/save-schema.test.ts` helpers or `migrateSave`); `notice(g, 'T', 'x', { weight: 'minor', link: 'assets/home' })` queues both fields and `notice(g, 'T', 'x')` queues the exact object as before (no extra keys).

**Flag.** `FLAGS.quietInbox`, default false.
**Hot-file notes.** `types.ts` (wave-0 agent owns the other optional fields; own hunk), `core.ts` (own hunk around `notice`), `SettingsScreen.tsx` (one import, one JSX line), `settings.ts` (additive).
**Depends on.** R1-P3 (`flags.ts`), R1-P2 (`weight`, `link` and the `NoticeOptions` fields; stop and report if missing), R1-P6 (`inbox` classification).
**Size.** Source about 380 (inbox 170, policy 100, weights 25, settings +14, NoticeSettings 55, core +4, save-schema +8, screen +3; `types.ts` and `flags.ts` moved to R1-P2 and R1-P3). Tests about 610.

---

### R1-T6 Quiet routing in the store and the inbox view (G.11 step 2, flow and UI)

**Roadmap items.** G.11 step 2 (routing in `store.processQueue`, inbox view from the header bell). D.11 criterion 8 (Quiet Mode toggles). Wave 2.

**Files.**
- Modify `src/ui/store.ts` (`processQueue`, lines 517-530; add `routeQuietNotices`, `markInboxSeen`, `clearInbox`).
- Create `src/ui/components/InboxSheet.tsx`.
- Modify `src/ui/styles/notices.css` (created in R1-T4).
- Create `test/quiet-routing.test.ts`, `test/inbox-sheet.test.ts`.

**Interfaces.**

```ts
// store.ts
/** Moves routable notices to the inbox in one act() when FLAGS.quietInbox and Quiet Mode are on. Returns true when it moved any. */
function routeQuietNotices(): boolean            // module-private
export function markInboxSeen(): void            // act(markSeen) only when inboxUnread(game) > 0
export function clearInbox(): void               // act(emptyInbox)

// InboxSheet.tsx
export interface InboxSheetProps {
  onClose: () => void
  /** Called with the row's link ('assets/home/mortgage'); the host closes the sheet and opens that menu. Without it the Open buttons are not drawn. */
  onOpenLink?: (link: string) => void
}
export function InboxSheet(props: InboxSheetProps): ReactElement
export interface InboxGroup { key: string; heading: string; items: InboxItem[] }
export function inboxGroups(state: InboxState): InboxGroup[]    // newest first; heading `${y}, age ${a}`; items newest first inside
```

**Behaviour.**
1. New `processQueue` body (same guard, same `MAX_TASKS_PER_PASS`):

```ts
for (let i = 0; i < MAX_TASKS_PER_PASS; i++) {
  if (routeQuietNotices()) continue
  const head = state.game?.queue[0]
  if (!head || head.kind !== 'aiTask') return
  const task = head.task
  handleModal(head.id, (draft) => resolveTask(draft, task))
}
```
   `routeQuietNotices` first does a cheap read: `FLAGS.quietInbox && quietModeOn(state.settings) && state.game?.queue.some((m) => routesToInbox(m, true))`; only then `act((draft) => { routeMinorNotices(draft) })`. The `resolving` flag already makes the nested `processQueue()` inside `act` return at once. It routes from anywhere in the queue, because a notice has no dependency on the items before it.
2. This is the store flow only (D18 option b): headless `ageUp`, `g.queue` readers in the 256 test files and the fuzzers never see routing.
3. Which notices are routed is decided only by `routesToInbox`; nothing else in the store decides.
4. `InboxSheet` (uses `Sheet` from `./Sheet`, title "Inbox", emoji "📥"): groups from `inboxGroups(readInbox(g))`; each row is the item's text (`t`) and, when `l` is present and `onOpenLink` was passed, an `Open` button (44 px target); rows that were unread when the sheet opened get the class `is-new` (capture `inboxUnread(g)` in a `useRef` on first render; the first `unread` rows from the newest are new). On mount it calls `markInboxSeen()` once (guarded by the unread count). Footer: a `Clear` button (`clearInbox()`) shown when there are items, and one line "Quiet Mode is on." with a `Turn off` button (`updateSettings({ quietMode: false })`) when `quietModeOn(settings)`, or "Quiet Mode is off." with `Turn on`. Empty state: "Nothing here. Routine news waits here while Quiet Mode is on."
5. Hostile data renders as escaped plain text (React escapes; `readInbox` already clamps).
6. CSS: `.inbox-group`, `.inbox-heading`, `.inbox-row`, `.inbox-row.is-new` (a 3px left border in `--tone-event` plus the text "New" in a visually hidden span, so new is not colour-only), `.inbox-open` (min-height 44px), `.inbox-footer`. Tokens only (`--card`, `--hairline`, `--muted`, `--text`, `--tone-event`).

**The header bell contract (cross-check: pinned; R1-N7 builds the button and the sheet wiring, this task provides everything behind it).**
- R1-N7 (which depends on this task and on R1-T5) adds to `Header` the prop `inbox?: { count: number; onOpen: () => void }` and a button `className="hdr-icon hdr-bell"`, rendered only when the prop is passed; `GameScreen` passes it only while `flagOn('quietInbox')`, with `count = inboxUnread(g)` (import from `src/game/inbox`; O(1), pure, safe in render). The button has `aria-label` `Inbox` or `Inbox, N new` and a count pill (`9+` above 9).
- R1-N7 adds `'inbox'` to `SheetKind` in `GameScreen.tsx` and renders `<InboxSheet onClose={close} onOpenLink={openLink} />` for it, where `openLink(link)` is `parsePlaceKey(link)` (Navigation's `src/ui/nav/place.ts`) then `openPlace(place)`; an unparsable link is ignored (the sheet just closes). So the inbox link string is Navigation's `placeKey`, restricted to this task's `readInbox` pattern: tab, then group ids made of `[A-Za-z0-9._:-]`, no action id.
- R1 emitters set no `link`: the field, its validation and the Open button exist so deep links can be attached later without a save change.

**Tests.**
- `test/quiet-routing.test.ts` (real store; flags set with `setFlags({ quietInbox: true })` in `beforeEach` and `resetFlags()` in `afterEach`; `store.startNewLife({ seed: 3, year: 2026 })` as in `test/store.test.ts`; the store's `act()` is synchronous, so `withFlags` around a call works too):
  1. Flag on, Quiet Mode on: `setQueue([minor good notice])` -> queue empty, inbox has 1 item, text clipped at 160, `inboxUnread` 1.
  2. Bad-tone, health, legal and large-money minor notices stay in the queue (every row of `NEVER_ROUTE_TABLE` from `test/notice-table.ts`, run through the store).
  3. Quiet Mode off (`store.updateSettings({ quietMode: false })`) or flag off: nothing routes.
  4. Order: `[N1 minor, C, N2 minor, N3 plain]` -> queue `[C, N3]`, inbox `[N1, N2]` in order.
  5. A minor notice behind an `aiTask`: the task resolves, the notice routes, the task's own popups stay.
  6. Idempotent: `processQueue()` five times changes nothing after the first; StrictMode double call safe.
  7. A choice is never routed or reordered; the 60 cap holds after 70 routed notices; `total` is 70.
  8. `markInboxSeen` zeroes the unread count, makes one `act` only when unread > 0; `clearInbox` empties; both safe with no game.
  9. Headless `ageUp` and `g.queue` readers unaffected: with the flag off the store behaves exactly as `test/store.test.ts` expects (run that file in the same session).
- `test/inbox-sheet.test.ts` (store mocked): empty state text; groups newest first; rows escaped (hostile text `<script>`); `Open` buttons only when `l` and `onOpenLink`; `is-new` rows equal the unread count; footer toggles by `quietMode`; `inboxGroups` pure over a frozen state; copy passes `unitFlags` with no hard flag and no U+2014.

**Flag.** `FLAGS.quietInbox`.
**Hot-file notes.** `store.ts`: `routeQuietNotices` and the loop edit sit in the "Built-in tasks" section; `markInboxSeen`, `clearInbox` go in a new "Inbox" section at the end of the file. Other hunks in this file belong to R1-A2 (after line 115, `travelBack`, `commit`) and R1-C3 (`finalizeIfDead`); Navigation edits no part of `store.ts`. No shared hunk.
**Depends on.** R1-T5 (inbox state, policy, setting, flags), R1-T4 (`notices.css`).
**Size.** Source about 290 (store +45, InboxSheet 175, CSS +70). Tests about 420.

---

### R1-T7 Counting probe and the 20 minor emitters (G.11 step 2, weights)

**Roadmap items.** G.11 step 2: "the 20 most frequent emitters chosen by a counting probe". Wave 2 (after R1-T5).

**Files.**
- Create `test/play-kit.ts` (shared by R1-T9).
- Create `test/notice-probe.test.ts` (opt-in).
- Create `test/fixtures/notice-probe.json` (generated, then `chosen` reviewed by hand).
- Modify `src/game/notice-weights.ts` (fill `MINOR_NOTICE_TITLES`, at most 20).
- Create `test/notice-weights.test.ts`.

**Interfaces.**

```ts
// test/play-kit.ts  (no vitest imports; same style as test/fuzz-kit.ts and test/probe-life.ts)
export interface PlayOptions { seed: number; birthYear: number; untilAge?: number /* default 90 */; rich?: boolean /* money set to 60,000,000 the year the character first reaches 25 */ }
export interface PlayedPopup {
  kind: 'notice' | 'choice' | 'input' | 'minigame'
  title: string; text: string; tone?: Tone; weight?: 'minor'; support?: boolean
  /** false for popups created while answering a choice, input or minigame (an outcome the player asked for) */
  passive: boolean
  item: ModalItem            // structuredClone of the modal as queued
}
export interface PlayedYear { age: number; year: number; popups: PlayedPopup[]; lines: { text: string; tone: Tone }[] }
export function playLife(opts: PlayOptions): { g: GameState; years: PlayedYear[] }
```

**Behaviour.**
1. `playLife`: `createNewLife({ seed, year: birthYear })`; loop while alive and `age < untilAge`: `drain` then `ageUp(g)` then `drain`. `drain` is the loop of `test/simulate.test.ts` lines 66-103 (copy it; it is not exported; replace its `expect(...)` calls by `throw new Error(...)`, the kit has no vitest import): shift each modal; for `notice` just record; for `choice` pick with a seeded xorshift driver (`driver(seed)` as at `simulate.test.ts:16-27`) and run `runScript` (`source === 'script'`) or `applyFallback` (`resolveChoice`); `input` via `runScript` with a default or random number; `minigame` via `runScript` with a fixed result string per game (copy `minigameResult`, `simulate.test.ts:34`); `aiTask` via `applyFallback`. Guard 300 per drain. `passive`: before answering a choice, input or minigame take the set of queue ids; every id that appears afterwards and was not in the set is an outcome (`passive: false`). Notices created by an `aiTask` resolution are passive. Year lines = the log entries added during that year (`g.log` last year).
2. The probe (`describe.skipIf(process.env.NOTICE_PROBE !== '1')`, timeout 300 s, one worker, about 80 s): 13 lives, seeds 101 to 113, birth years cycling `[1925, 1950, 1975, 1990, 2010, 2026]`, `untilAge` 85. It aggregates `passive` notices by title (exact string) with count, first tone, one sample text, and `neverRoute(sample)`; aggregates outcome notices separately; writes `test/fixtures/notice-probe.json` as `{ v: 1, lives: 13, seeds, untilAge, passive: [top 60 by count], outcome: [top 30], chosen: [] }`, preserving an existing `chosen`.
3. Selection rule for `chosen` (done by hand after the probe, recorded in the fixture): walk `passive` by count; take a title only if (a) `neverRoute(sample)` is null, (b) the sample is not a bad tone, (c) a `grep -rn` of the title in `src/` shows every call site is yearly code, not a menu action `run` closure or a `defineScript` handler for something the player just chose (a notice the player asked for stays modal), (d) the title is an exact static string. Take the first 20. If fewer than 20 qualify, take fewer; do not pad.
4. `MINOR_NOTICE_TITLES = new Set([...chosen])`. `notice()` (R1-T5) now tags those titles `weight: 'minor'` in every call, in headless runs too; that adds an optional key to queued notices of those titles only.
5. Before committing the table, `grep -rn "<title>" test/` for each chosen title: any test that pins the whole queued modal with `toEqual` must get `weight: 'minor'` in its expectation in the same commit (a changed expectation for a new optional field, say so in the message); tests using `toMatchObject` or title-only checks need nothing. Do not weaken any assertion.

**Tests** (always on, `test/notice-weights.test.ts`).
1. The fixture parses: `v: 1`, `passive` sorted by count descending, at most 60 rows, titles unique.
2. `MINOR_NOTICE_TITLES` equals `new Set(fixture.chosen)`, size at most 20.
3. Every chosen title is within the first 40 `passive` rows, its sample has `neverRoute(sample) === null` and a tone other than bad.
4. Every chosen title occurs as a string literal in some file under `src/game` (read the files with `node:fs`; stops the table going stale).
5. `notice(g, title, 'x')` queues `weight: 'minor'` for each chosen title and no `weight` for 10 other titles; an explicit `{ weight: 'minor' }` option is honoured for any title.
6. No chosen title contains U+2014 or U+2013.

**Flag.** None (the table only matters while `quietInbox` is on; the `weight` key is inert otherwise).
**Hot-file notes.** `notice-weights.ts` is mine alone. The call sites of the chosen titles are NOT edited (this is why a title table was chosen over editing 20 call sites in files other tracks own).
**Depends on.** R1-T5.
**Size.** Source about 25 (the table) plus `test/play-kit.ts` about 150. Tests about 220 (plus the generated fixture).

---

### R1-T8 LifeLog: last 3 years open, older years collapsed (G.11, D.7 third bullet)

**Roadmap items.** D.7 third bullet (LifeLog fold; "bounds the DOM"). Wave 2 or 3.

**Files.**
- Modify `src/ui/components/LifeLog.tsx` (whole file is 101 lines; `YearBlock` 32-55, `LifeLog` 60-101).
- Modify `src/ui/styles/notices.css`.
- Create `test/lifelog-years.test.ts`.

**Interfaces.**

```ts
export const OPEN_YEARS = 3
export interface YearView { key: string; year: LogYear; open: boolean; collapsible: boolean }
export function yearKey(y: LogYear): string                         // `${y.age}-${y.year}`, the same key the list uses today
/** The last `openYears` entries are open and not collapsible; older ones are collapsed unless their key is in `expanded`. */
export function yearViews(log: readonly LogYear[], expanded: ReadonlySet<string>, openYears?: number): YearView[]
export function collapsedSummary(y: LogYear): string                // 'No lines' | '1 line' | `${n} lines`
/** Hook-free list (tests render this). */
export function YearList(props: { log: readonly LogYear[]; expanded: ReadonlySet<string>; onToggle: (key: string) => void; seen: number }): ReactElement
// ageHeading, toneClass, LifeLogProps and the LifeLog export keep their signatures.
```

**Behaviour.**
1. `LifeLog` keeps its effects, its `seen`/`freshFrom` logic (counted over all years, collapsed ones included, so the "new line" animation index stays right) and `role="log"`. It adds `const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())` (UI only, never saved; it resets with the component because `GameScreen` passes `key={g.lifeId}`).
2. A collapsed year renders only `<section class="lifelog-year is-collapsed" aria-label="Age: 12 years">` with `<h3 class="lifelog-age"><button type="button" class="lifelog-toggle" aria-expanded="false">` showing the age heading, the calendar year and `collapsedSummary`, plus a `+` glyph. An expanded older year shows its entries and the same button with `aria-expanded="true"` and `-`. The last 3 years render exactly as today (plain `h3`, no button). Do not set `aria-controls` (the target is absent while collapsed).
3. `YearBlock`'s memo comparator gains `open` so a toggle re-renders.
4. The button is at least 44 px tall (`.lifelog-toggle { min-height: 44px; width: 100% }`), tokens only, focus ring from the global `:focus-visible` rule.
5. Effect: a 90-year log of about 5 lines a year renders 15 entry elements instead of about 450.

**Tests** (`test/lifelog-years.test.ts`).
1. `yearViews` for 0, 1, 3, 4 and 90 years: open count `min(len, 3)`; the newest three are open and `collapsible` false; an older key in `expanded` is open and collapsible.
2. `renderToStaticMarkup(YearList)` for 90 years of 5 lines: 15 `lifelog-entry` elements, 87 `lifelog-toggle` buttons with `aria-expanded="false"`, each showing its age, calendar year and "5 lines"; total tag count under 700; with one older key expanded its 5 entries appear.
3. Year with no entries -> "No lines"; one entry -> "1 line".
4. Hostile entry text (`<b>x</b>`, 5,000 characters) is escaped and rendered.
5. `ageHeading` and `toneClass` unchanged (junk tone -> `tone-neutral`).
6. `OPEN_YEARS` is 3; the stylesheet has `.lifelog-toggle`.

**Flag.** None (presentation only; it is the "bounded DOM" part of G.11 and D.7 asks for it unconditionally).
**Hot-file notes.** `LifeLog.tsx` is edited by no other R1 track.
**Depends on.** R1-T4 (`notices.css`).
**Size.** Source about 130 (component +90, CSS +40). Tests about 180.

---

### R1-T9 Text harness (E.T2)

**Roadmap items.** E.T2 (D.9 sixth bullet; design 9.2 Tests). Records the baseline; thresholds off in R1. Wave 3.

**Files.**
- Create `test/text-metrics.ts` (pure, no vitest imports).
- Create `test/text-metrics.test.ts` (fast, synthetic traces).
- Create `test/text-kit.test.ts` (plays 4 lives).
- Create `test/fixtures/text-baseline.json` (recorded once with `TEXT_KIT_RECORD=1`).

**Interfaces.**

```ts
// test/text-metrics.ts
import type { PlayedYear } from './play-kit'
export interface LifeTrace { seed: number; birthYear: number; rich: boolean; years: PlayedYear[] }
export interface Spread { mean: number; p50: number; p90: number; max: number }   // nearest-rank percentiles
export interface TextMetrics {
  lines: number
  /** share of log lines whose normalized text was already in the life */
  repeatedShare: number
  /** consecutive repeats of one normalized line that are at most 10 years apart */
  sameWithin10: number
  /** distinct normalized lines seen more than 3 times, and the highest count */
  over3: { distinct: number; max: number }
  /** popups by normalized title: families, the biggest count in one life, families above 6, the shortest gap in years between two of one family (null when none repeats) */
  popupFamilies: { families: number; maxPerLife: number; over6: number; minGapYears: number | null }
  /** share of lines whose first three words are shared with at least one other line */
  openerShare: number
  /** popups a year over all years */
  popupsPerYear: Spread
  /** cards a year if the UI drew them: raw popups, after the digest merge, after the digest merge with Quiet Mode routing */
  cardsPerYear: { raw: Spread; digest: Spread; quiet: Spread }
}
export function normalize(text: string): string          // lower case, digits runs -> '#', money symbols removed, white space collapsed, trimmed
export function textMetrics(life: LifeTrace): TextMetrics
export function mergeMetrics(lives: readonly TextMetrics[]): TextMetrics   // line-weighted means, max of maxes
export function countCards(shown: readonly ModalItem[], opts: { digest: boolean; quiet: boolean }): number
export const DESIGN_THRESHOLDS: Readonly<{ repeatedShare: 0.05; repeatedShareRich: 0.08; sameWithin10: 0; over3Max: 3; popupFamilyMax: 6; popupFamilyMinGap: 4; openerShare: 0.12; openerShareRich: 0.20; popupsP90: 4 }>   // design 9.2, enforced only when TEXT_KIT_ENFORCE=1
```

**Behaviour.**
1. `countCards` uses the real modules: it removes `routesToInbox(m, true)` notices when `quiet`, then counts cards by walking the shown sequence: a run of `mergeable` notices of length at least `DIGEST_MIN` is `ceil(len / DIGEST_MAX)` cards when `digest` (chunks of 8), otherwise one card per modal. `choice`, `input`, `minigame` are one card each.
2. `popupsPerYear` counts `notice`, `choice`, `input`, `minigame` per played year.
3. `test/text-kit.test.ts`: four lives, one `it` each with a 120 s timeout: `{seed 1, birth 1950}`, `{seed 2, birth 1990}`, `{seed 3, birth 2005}`, `{seed 4, birth 1975, rich: true}`, played to age 90 with `playLife` (R1-T7). Assertions in R1: every metric is finite; `lines > 100`; a replay of seed 1 (second `it`, same file) gives byte-identical metrics (determinism); `cardsPerYear.quiet.mean <= cardsPerYear.digest.mean <= cardsPerYear.raw.mean`. It prints a table with `console.info`. With `TEXT_KIT_RECORD=1` it writes `test/fixtures/text-baseline.json` (`{ v: 1, recordedAt: 'v4.1.0 candidate', lives: [...metrics per life], merged }`); with `TEXT_KIT_ENFORCE=1` it also asserts `DESIGN_THRESHOLDS` (off by default; R2, R3 and R5 turn it on per metric).
4. The harness must not change the game: it only reads `g.log` and the drained popups.

**Tests.**
- `test/text-metrics.test.ts` (no life played): `normalize` cases; each metric on hand-built traces (a line repeated 3 times; a repeat 11 years apart not counted in `sameWithin10`; openers; a family with 7 popups and a gap of 2 years; `countCards` over `[N,N,N,C,N]` (raw 5, digest 3), over ten notices (digest 2), with a bad notice, and with a minor good notice under `quiet` (routed away); `mergeMetrics`; `Spread` nearest-rank values on a known list; `deepFreeze`d input does not throw.
- `test/text-kit.test.ts` as above (D.11 criteria 6 of the digest do not apply; this is E.T2).

**Flag.** None.
**Hot-file notes.** Test-side only.
**Depends on.** R1-T7 (`play-kit.ts`), R1-T4 (`headNoticeRun`/`mergeable`), R1-T5 (`routesToInbox`, `MINOR_NOTICE_TITLES` filled), R1-T1 and R1-T2 (so the baseline is recorded with the final text code).
**Size.** Test-side source about 220 (`text-metrics.ts`). Tests about 250 plus the generated fixture. Runtime: `text-kit.test.ts` about 30 s on one worker (4 lives to 90 at about 6 s each plus a 6 s replay), `text-metrics.test.ts` under 2 s.

---

### R1-T10 Acceptance sweep for the two flags (the lead flips them)

**Roadmap items.** D.11 criteria 4, 8, 9 for this track; "flipped on at release when their acceptance tests pass". Wave 3, last. Cross-check: this task no longer edits `flags.ts`. R1-P3's release test makes the flip a single lead commit (version bump plus all eight defaults), and a track-level flip would fail that test.

**Files.**
- Create `test/notice-acceptance.test.ts`.
- Edits to existing tests only where the flags-on run below legitimately changes an expectation (reason in the commit).

**Behaviour.**
1. Create the acceptance test first (every case runs inside `withFlags({ noticeDigest: true, quietInbox: true }, ...)`, so it passes now and after the lead's flip). It restates D.11 for this track in one file: (a) hostile `flags.inbox`, `flags.textMem` and `queue[].weight/link` survive `JSON.parse(JSON.stringify(g))` -> `migrateSave` -> `readInbox`, `readTextMem`, `inboxUnread`, `pickLine`, `pushInbox` and stay within the caps; (b) digest leaves `g.queue` unchanged; (c) the never-route table (import `NEVER_ROUTE_TABLE` from `test/notice-table.ts`, created in R1-T5; do not copy it); (d) Quiet Mode toggles through the real store with the two flags on; (e) the v4.0.2 fixture `test/fixtures/save-v1.json.gz` loads and `readInbox`/`readTextMem` of it are empty; (f) a seeded 25-year life through `ageUp` with `playLife` produces no `inbox` flag and no `quietMode` change in headless mode (routing is store-only) and `flags.textMem` holds only `r.flavor`.
2. Do not flip anything. Simulate the flip for the existing files below in a scratch working copy: set `noticeDigest` and `quietInbox` to `true` in `FLAG_DEFS` (R1-P3's release test will object to the version, so skip `test/flags.test.ts`), run the files, then revert the scratch edit before committing.
3. With the flags on, run these existing files and report, fixing or justifying any change (a changed expectation needs a stated reason, never a weakened assertion): `test/store.test.ts`, `test/time-machine.test.ts`, `test/ui-return.test.ts`, `test/screens.test.ts`, `test/about.test.ts`, `test/custom-voice.test.ts`, `test/main-character-ui.test.ts`, `test/talents-ui.test.ts`, `test/year-integration.test.ts`.
4. Manual check on a 360 px wide viewport in light and dark (the lead does this with Playwright for the PR screenshots): an 8-row digest card scrolls inside the popup and OK stays reachable; the inbox sheet lists rows; the Settings "Notices" section shows the switch.

**Flag.** None (the lead flips `noticeDigest` and `quietInbox`).
**Hot-file notes.** None.
**Depends on.** R1-T4 to R1-T8, R1-P3, and R1-N7 (the bell and the inbox sheet; for step 4 only).
**Size.** Source 0 lines. Tests about 160 plus the shared table move.

---

## Cross-track contracts

### I rely on (stated so the other plans can match them)

| # | From | Contract |
|---|---|---|
| C1 | Platform R1-P3 (K.11) | `src/game/flags.ts` exports `FLAGS` (readonly live view), `flagOn`, `setFlags`, `resetFlags`, `withFlags`, and declares `noticeDigest` and `quietInbox` (default false). My code reads `FLAGS.noticeDigest` and `FLAGS.quietInbox` at call time. Tests use `withFlags` or `setFlags` plus `resetFlags`; no `vi.mock` of the module (R1-P3 has a guard test), no assignment. The lead's release commit flips both defaults. |
| C2 | Platform R1-P2 | `NoticeModal.weight?: 'minor'` and `NoticeModal.link?: string` exist in `types.ts`, and `NoticeOptions.weight`/`link` with the conditional spreads exist in `core.ts` (cross-check: R1-P2 owns every optional field; R1-T5 verifies them and stops if they are missing). |
| C3 | Platform R1-P6 (A.K0) | `world-flags.ts` classifies `textMem: 'personal'`, `inbox: 'personal'` and the legacy `flavorRecent: 'cache'` (read once for migration, never written after R1-T2). All three reset on `continueAsChild` by construction. R1-P6 pre-declares them, so R1-P6 must merge before R1-T1 and R1-T5 write those keys; this track edits nothing there. |
| C4 | Platform K.1 and X.G1 | Ratchets: my new modules are leaves (no cycle), and no new file calls `earnIncome(`, `spend(`, `addMoney(`. |
| C5 | a11y R1-A4/A5 (G.12) | `PopupFrame` and `Sheet` get focus trap and restore. `DigestCard` and `InboxSheet` only compose them and keep `autoFocus` on OK and the close button. |
| C6 | Charts G.4 | Edits the `minigame` branch of `ModalHost`; mine edits imports and the head of the body. |

### I provide

| # | To | Contract |
|---|---|---|
| P1 | Navigation R1-N7 (header bell, `GameScreen`) | Section "The header bell contract" in R1-T6: `inboxUnread(g)`, `InboxSheet(props: { onClose; onOpenLink? })`, link string = Navigation's `placeKey`, bell visible while `flagOn('quietInbox')`. R1-N7 depends on R1-T5 and R1-T6. |
| P2 | R2 (E.T3 codemod) | Stable API: `pickLine(g, lines, fam?)`, `hpick`, `defineLines`, `linesId`, `ringRead/ringWrite`, `noteFamily/familyStats`, `TEXT_MEM_LIMITS`. Pool key = name, else registered id, else `poolHash`. |
| P3 | R3 (E.D2 `closeYear`) | `NoticeModal.weight: 'minor'` is the only weight in R1. E's `w` 0 to 3 maps `w <= 1` to `'minor'`; `routesToInbox` stays the one place that decides, and `neverRoute` stays the safety net. The title table `MINOR_NOTICE_TITLES` is the provisional version of E.D1's 120-title table. |
| P4 | R5 (Paper) | `headline` and `deck` roles in `rules.mjs`. |
| P5 | Release lead | The 30-life, 40-year identical-output probe must allow these differences and no others in this track: `flags.textMem` added; `flags.flavorRecent` removed; `weight` on queued notices of the chosen titles; plus the other tracks' keys (`lifeSeries`, `inbox`, new `YearRecord` fields, `MarketHistory.top`). R1-C3's `stripR1` removes all of them and rebuilds `flavorRecent` from `textMem.r.flavor`; the comparison harness is R1-P9. The log text and `g.rng` must be identical (R1-T2's golden proves this for flavor). `inbox` is never written in headless runs. |

---

## Plan vs code (corrections to the roadmap and design, each verified by reading v4.0.2)

1. **`processQueue` does not route today.** `ui/store.ts:517-530` only resolves `aiTask` heads in a loop guarded by `resolving` (line 507) with `MAX_TASKS_PER_PASS = 50` (line 505). Routing is new logic inside that loop (R1-T6). `ModalHost` today subscribes to `queue[0]` only (`ModalHost.tsx:37`) and switches on `head.kind` (line 51); the digest needs the queue prefix, so it selects `game` (already selected at line 38) and uses `planHead`.
2. **The 20 emitters are set by a title table, not by 20 call-site edits.** `notice(` has 1,832 call sites in `src` (grep; design says 1,716 to 1,831) in files owned by other tracks. `notice()` (`core.ts:444-447`) takes `NoticeOptions` (`core.ts:436-441`: emoji, tone, support). R1-T5 adds the `weight` and `link` options (so any emitter can opt in) and a leaf title table consulted when no option is given. Design 9.3 plans a 120-title table for E.D1, so this is the same shape. It also keeps every chosen call site untouched.
3. **Adding `quietMode` changes pinned settings shapes.** `normalizeSettings` returns every known field and `loadSettings` rewrites storage when the stored text differs (`settings.ts:93`). Pins: `test/store.test.ts` 120, 121, 126; `test/offline.test.ts` 290, 293, 299, 311, 320. They are updated in R1-T5 with the reason stated.
4. **The text memory spec contradicts itself.** Roadmap D.9 and design 9.2 say "300 pools by 6 indexes" but also "exclude the last half, at most 8". A window of 8 needs 8 remembered indexes, and a shuffle-bag of up to 12 lines needs more than 6 (it needs a used-set). The plan stores up to 8 indexes for windows and a 12-bit mask plus the last index for bags, packed as one short string per pool, so a pool is one JSON node and the cap of 300 pools costs 300 nodes (not 2,100). The worst case for all of `textMem` is about 690 nodes, inside the 1,300 budget shared with the inbox.
5. **`flavor.ts` memory is a 60-key global ring, not pool memory, and it draws with `shuffle`, not `pick`.** `recentKeys` (`flavor.ts:570-573`) reads `flags.flavorRecent`, a list of `pool:index` keys across all pools, written at line 637 as `recent.slice(-60)`. Each attempt shuffles the whole pool (`flavor.ts:616`, n-1 draws) and filters recents afterwards, so the draw count does not depend on the memory unless a pool is exhausted. "Draw count unchanged" is therefore easy, but exact log parity needs the same 60-key window, so R1-T2 moves it into `textMem.r.flavor` (a ring) instead of the per-pool structure, and proves parity with a golden recorded from the unmodified file. Consequence for the D.11 probe: `flags.flavorRecent` disappears and `flags.textMem` appears (P5). `pickLine` itself has no production caller in R1.
6. **`digest` already exists as a voice role.** `LIMITS`/`AIMS` (`rules.mjs:48-51`) hold `digest: 110/100`. E.T7 adds `headline` (70/55) and `deck` (110/90) and must edit the pin at `test/voice-report.test.ts:757-758`; `rules.d.mts` must stay in step (test "declares every export"); `units.mjs` `ROLE_ORDER` (line 73) is deliberately left alone.
7. **`flags.ts` and `world-flags.ts` do not exist in v4.0.2** (`ls src/game/flags.ts src/game/world-flags.ts` fails; R1-P3 and R1-P6 create them, with the keys this track needs already declared). My tasks state the dependency and neither create nor edit the files.
8. **`NoticeModal.weight` is not in `types.ts` yet** (`types.ts:503-515` holds title, emoji, text, tone, support). The roadmap lists it in the wave-0 `types.ts` edit; `link` is not listed there. Cross-check: R1-P2 now adds both `weight` and `link` (and the `NoticeOptions` fields and spreads in `core.ts`), so this track edits neither `types.ts` nor the `NoticeOptions` interface.
9. **`uid` lives in `rng.ts:69`**, not `core.ts` (core imports it). The inbox reuses the modal id, so no `uid` call is needed.
10. **Where Quiet Mode lives.** `Settings` is a three-field object (`settings.ts:19-26`); the Settings screen composes sections (`SettingsScreen.tsx` lines 162-219, `TimeMachineSettingsSection` is the pattern), so Quiet Mode is a new section component rather than an edit inside the screen.
11. **Heirs.** `continueAsChild` rebuilds `flags` from a whitelist (`life.ts:1509-1529`), so `textMem` and `inbox` reset per generation without code. The heir also gets a "Generation 2" notice (`test/life.test.ts:158`), which is an ordinary notice and can be part of a digest.
12. **`LifeLog` DOM bound.** The roadmap attaches "bounds the DOM" to G.14; the fold itself is in D.7 and is done here (R1-T8). A log year is `age`-`year` keyed (`LifeLog.tsx:97`); that key is reused.
13. **Test file count.** `ls test/*.test.ts | wc -l` is 389 and 256 files mention `.queue`, as the roadmap says. `vite.config.ts` includes only `test/**/*.test.ts` and caps `maxWorkers: 2`, and `tsconfig.json` type-checks `test/` too (so test helpers must pass `noUnusedLocals`).
14. **UI test patterns.** Existing patterns: `test/custom-voice.test.ts:16,100` renders `NoticeCard` imported from `ModalHost` with the real store module (it tolerates a missing `localStorage`); `test/screens.test.ts:14-38` mocks the store. `LifeLog` uses `useLayoutEffect`, so tests render the new hook-free `YearList` instead of the whole component.
15. **"Large-money" has no field to read.** Notices carry text only (design 9.3's amount field `a` does not exist yet). R1 uses a text heuristic (`largestFigure >= 10,000` display units) as a second safety net behind the per-title opt-in. This is conservative: it can only keep a notice modal.
16. **The roadmap's "13 lives digest E measured" are not in the repo.** The counting probe (R1-T7) re-measures with 13 seeded lives and commits its result as a fixture.
17. **Probe attribution.** A runtime probe cannot see call sites (modules import `notice` by name), so it counts by exact title; the by-hand review step in R1-T7 (c) inspects call sites for the chosen titles. Passive versus outcome is decided by queue ids around the answer of a choice, not by title.

---

## Changed by cross-check

Applied from `00-crosscheck.md` (decisions D1 to D3, D6, D12; section 3 collisions):

1. **Task ids renamed** from R1-N1 to R1-N10 to **R1-T1 to R1-T10** everywhere in this file; the Navigation track keeps R1-N1 to R1-N10.
2. **Flags.** This track no longer creates, edits or flips anything in `src/game/flags.ts` (R1-P3 declares `noticeDigest` and `quietInbox`; the lead's release commit flips them). Tests use `withFlags` or `setFlags` plus `resetFlags`; module mocks of `src/game/flags` and assignments to `FLAGS` are removed (conventions item 9, R1-T5, R1-T6 and the contracts C1). R1-T10 becomes an acceptance sweep with no flip.
3. **Types and core.** R1-P2 owns `NoticeModal.weight`, `NoticeModal.link`, `NoticeOptions.weight` and `NoticeOptions.link` with the spreads; R1-T5 edits only the single `weight` expression in `notice()` and its import.
4. **World flags.** R1-T1 and R1-T5 no longer edit `world-flags.ts` (R1-P6 pre-declares `textMem` and `inbox` as `personal`, `flavorRecent` as `cache`; contract C3).
5. **Header bell and inbox sheet.** Ownership moved to R1-N7 (prop `inbox?: { count, onOpen }`, `SheetKind` `'inbox'`, `onOpenLink` through `parsePlaceKey`); the link string is Navigation's `placeKey` (contract P1 and the bell contract in R1-T6).
6. **New test 11 in R1-T1:** a scan proving nothing in `src/` calls `pickLine(`, `hpick(` or `defineLines(` outside `src/game/text/`, which is what keeps the one new `rand(g)` draw harmless in R1.
7. **Release notes.** The roadmap's "repeated lines in the life log start to thin" is not delivered by R1-T2 (the flavor move is output-identical by design); the lead drops it from `docs/RELEASE-v4.1.0.md`.
8. **Merge order** (wave 0: T1, T2; wave 1: T3; wave 2: T4 to T8; wave 3: T9, T10) is in `00-crosscheck.md` section 4. `ModalHost.tsx` order is T4, then Charts C11, C12; `store.ts` hunks do not overlap with R1-A2 and R1-C3 (checked).
