# Share Classes (Stocks, Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player can pick a share structure for their company when taking it public or from Capital & Ownership: one class, a founder class (A/B, 10 votes against 1), or a non-voting float. Board seats, being fired as CEO and every "you'd lose control" line follow votes, not shares. In Investments › Stocks the companies that really had classes show them in the years they had them, and their listed extra classes can be bought.

**Architecture:** Economics stay one pool (`BizState.share`). Votes are derived from it by one pure function, and `seatPlan` is the only place a stake becomes seats, so reading votes there moves every control decision. The new work goes in:
- `business/share-classes.ts`: the record's maths (`ownerVotes`, the price factor, bookkeeping helpers). A leaf: it imports `state.ts` and `util.ts` only.
- `business/share-classes-menu.ts`: choosing and changing classes (`classOption`, `changeClasses`) and the "Share Classes" rows.
- `invest/class-data.ts`: the curated table of real classes by year, and the second lines they make.
- A `companyKey` in `invest/engine.ts` so every line of one company is one security for news, inventions and politics.

Phase 1 planned for this: "every control question goes through `controlsWith` or `ownerControls`, the one place `ownerVotes` plugs in". Checked against the built code, that holds, and it holds one level lower: both end in `seatPlan`. The Phase 1 spec's list of other files to change (`executive.ts`, `group-services.ts`, `succession-review.ts`, `conglomerate-management.ts`, `yearly.ts`, `bank-events.ts`) is wrong: they compare economics or a group's stake. A source-scan test (Task 2) pins that.

**Tech Stack:** TypeScript (strict), Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-share-classes-phase2-design.md` (decisions D1-D11, the sketch check in section 2, risks in section 10). This plan builds all of it. Tasks 6 and 7 are the only risky ones and can be dropped together: without them, a real company's extra classes are facts on its screen and cannot be bought.

## Global Constraints

**Build and tests**
- Run tests one file at a time while developing: `npx vitest run <file>`. Typecheck with `npm run typecheck`. The full suite (`npm test`, about 20 minutes) runs only in Task 8.
- No `any`, no `@ts-ignore`, no new dependencies.
- A test fixture that would break `tsc` goes in a `.txt` file. Hostile values that are valid `Json` (`7`, `'ab'`, `null`) are written inline.
- Reuse Phase 1's `test/own-listing-kit.ts` (`founder`, `listed`, `privateCompany`, `listedGroup`, `findNode`). Do not duplicate it.

**Engineering rules (`docs/ARCHITECTURE.md`)**
- Rule 1: state is plain JSON. Rule 2: randomness only through `g.rng`, never `Math.random`. Rule 3: actions change `g` in place. Rule 5: yearly limits use `useYearAction`. Rule 8: menus are functions of state and render from a deep-frozen state (`test/fuzz-kit.ts` `deepFreeze`). Rule 9: `investments.ts` and `invest/*` import nothing from `business/`. Rule 11: money. Rule 13: voice.

**Determinism (spec section 6)**
- `ownerVotes`, `seatPlan`, `classOption`, previews, screen lines, `companyKey`, line quotes and line moves never read or advance `g.rng`.
- Only `changeClasses` on a listed company draws, through the board vote.

**Money and numbers**
- Money is internal constant-2026 US dollars, shown only at render time through `formatMoney`, `formatPrice`, `money` or `shortMoney`.
- The vote weights (10 and 1; 1 and 0) and the price factors (4% and 7%) live in `share-classes.ts` constants and nowhere else.

**Saves**
- The one new `BizState` field (`classes`) is optional and whitelisted in `normalizeBiz`. `BIZ_VERSION` stays 2.
- Every reader calls `readClasses(b.classes)`, never trusts the field: `bizOf` does not re-normalize a current record.
- A save without `classes` behaves exactly as today. Task 2's golden test pins `seatPlan`; Task 3's pins `ipoPreview`.

**Single-class behavior never changes**
- With no record, `ownerVotes(b) === b.share` exactly, `classFactor(b) === 1`, and every sentence a Phase 1 or older screen shows is the same string.

**Player-facing text**
- Follows `docs/VOICE.md`: short and factual, contractions, no morals, no em-dashes, no disclaimers. Colons only for prices and labels.
- Tooltips and notices at or under 120 characters, life-log lines at or under 90.
- The exact copy given in this plan is final. Never put model names in code or docs.

**Commits**
- One commit per task, after that task's tests and `npm run typecheck` pass.
- End every commit message with a blank line and the two trailer lines that the dispatching prompt gives you.
- Push after Task 8.

**Scope**
- Do not touch dividends (`payDividend`), net worth, estates, Sell Everything, the group IPO, or the Exit and Capital & Ownership logic beyond the lines this plan names.

## Review Focus

The inputs most likely to bite a player, most likely first. Each has a pinning test in the task named.

- **A writer that adds shares and has never heard of classes** (a Stocks buy, Buy Out Investors, Put In More Money, and the hedge fund and advisor work to come). Expected: the new shares are ordinary and never carry the founders' votes. Tests: Task 1 'shares bought from the market never carry the founders votes', Task 2 'a Stocks buy adds ordinary shares'.
- **Sell, then buy back.** Expected: sold shares leave the founders' class once the ordinary ones are gone, and buying again never revives them. Test: Task 2 'selling clamps the founders class and buying back does not revive it'.
- **A founder who does not control the board asks for a recap.** Expected: the vote can fail; a refused recap does not use up the year's `'merge'` slot; nothing changes. Test: Task 3 'a board that says no changes nothing'.
- **Old and hostile saves.** Expected: no record is one class; `{kind:'zz'}`, `7`, `'ab'`, `null`, a NaN `hi` and a record on a division are all harmless. Tests: Task 1, Task 3 (`detach`).
- **A line holding at the year step.** Expected: it moves with its company, splits with it, ends with it, and is cashed out as delisted only when its own last year has passed. Test: Task 7.
- **News on one line only.** Expected: a ban, contract or invention moves every line of a company together; the player's own order flow stays on the line they traded. Test: Task 6.
- **Preview against result.** Expected: the IPO preview, the recap subtitle and the buy preview use the same functions the action runs. Tests: Tasks 3 and 4.

## File ownership and order

`*` marks a file the in-progress Heavy R&D build also edits (`state.ts`, `manage.ts`, `economy.ts` here; none of `rd.ts`, `products.ts`, `product-market.ts` or `history/market-events.ts`). `†` marks a file the planned automatic-dividends work also edits. The hunks are in separate regions, listed in each task.

| Task | Creates | Modifies | Runs after | Can run alongside |
|---|---|---|---|---|
| 1 The record and the votes | `src/game/business/share-classes.ts`, `test/share-classes.test.ts` | `src/game/business/state.ts` *† | | 5, 6 |
| 2 Control reads votes | `test/share-classes-control.test.ts`, `test/control-sites.test.ts` | `src/game/business/board-state.ts`, `src/game/business/rescue.ts`, `src/game/business/exit.ts`, `src/game/business/own-trade.ts` | 1 | 5, 6 |
| 3 Choosing classes | `src/game/business/share-classes-menu.ts`, `test/share-classes-ipo.test.ts`, `test/share-classes-capital.test.ts` | `src/game/business/exit.ts`, `src/game/business/economy.ts` *, `src/game/business/board-vote.ts`, `src/game/business/conglomerate-state.ts`, `src/game/business/own-trade.ts` | 2 | 5, 6 |
| 4 Rows and screens | `test/share-classes-menu.test.ts` | `src/game/business/share-classes-menu.ts`, `src/game/business/manage.ts` *†, `src/game/business/own-listing.ts`, `src/game/business/own-listing-menu.ts` †, `src/game/business/own-trade.ts`, `test/own-listing.test.ts`, `test/own-listing-menu.test.ts` †, `test/own-trade.test.ts` | 3 | 5, 6 |
| 5 Real companies' classes | `src/game/invest/class-data.ts`, `test/class-data.test.ts` | `src/game/investments.ts` | | 1-4, 6 |
| 6 One key per company | `test/company-key.test.ts` | `src/game/invest/engine.ts`, `src/game/invest/shocks.ts`, `src/game/special/politics.ts` | | 1-5 |
| 7 Second listed lines | `test/class-lines.test.ts` | `src/game/invest/class-data.ts`, `src/game/investments.ts` | 5, 6 | 1-4 |
| 8 Story, docs, notes | `test/share-classes-story.test.ts` | `docs/ARCHITECTURE.md`, `docs/BUSINESS-AND-DYNASTIES.md`, `docs/RELEASE-v2.8.0.md` † (create it, or add a section if the dividends work made it) | 4, 7 | |

The files of parallel tasks are disjoint, but every task ends on the whole-project `npm run typecheck`, and Tasks 2-4 edit the same Phase 1 files in turn. So parallel tasks run in separate worktrees (superpowers:using-git-worktrees), each rebased onto the last finished task before it commits, and each commits only the files in its row. In a single tree, run 1, 2, 3, 4, 5, 6, 7, 8 in that order. The planned advisor work edits `investments.ts` in three hunks and will import `companyKey` in `review.ts` (one line): land Task 6 first. The hedge-fund work will also edit `investments.ts`: land Tasks 5 and 7 before it starts, or after it finishes.

---

### Task 1: The record and the votes

**Files:**
- Modify: `src/game/business/state.ts`. Add the types, `readClasses` and `classes` next to `isTicker` and `ipoPrice`. Whitelist it in `normalizeBiz` after the `ipoPrice` line. Scale `hi` in `diluteBusinessEquity` (three lines). Heavy R&D added `retired` and `heavyLast` elsewhere in the same file.
- Create: `src/game/business/share-classes.ts`
- Test: `test/share-classes.test.ts`

**Interfaces:**
- Produces, in `state.ts`:
  - `export type ClassKind = 'ab' | 'nv'`
  - `export interface ClassPlan { kind: ClassKind; hi: number }`. `hi` is the part of the whole company the owner holds in the founders' class.
  - `BizState.classes?: ClassPlan`
  - `export function readClasses(v: unknown): ClassPlan | null`. Null unless `v` is a plain object (not an array, not null) with `kind` exactly `'ab'` or `'nv'`. `hi` is clamped to 0-1, and is 0 when missing or not a finite number. Returns a new object. Never throws, never mutates.
- Produces, in `share-classes.ts` (imports `state.ts` and `util.ts`):
  - `export const CLASS_VOTES: Readonly<Record<ClassKind, { hi: number; lo: number }>>` = `{ ab: { hi: 10, lo: 1 }, nv: { hi: 1, lo: 0 } }`
  - `export const CLASS_DISCOUNT: Readonly<Record<ClassKind, number>>` = `{ ab: 0.04, nv: 0.07 }`
  - `export const CLASS_MERIT: Readonly<Record<ClassKind | 'single', number>>` = `{ single: 0.3, ab: -1, nv: -1.3 }`
  - `export const CLASS_PHRASE: Readonly<Record<ClassKind | 'single', string>>` = `{ single: 'one class of shares', ab: 'founder shares', nv: 'a non-voting float' }`
  - `export function activeClasses(b: BizState): ClassPlan | null`. The record only when `b.public`, `!b.group`, `b.sharesOut > 0` and `readClasses(b.classes)` is valid.
  - `export function ownerVotes(b: BizState): number`. The maths below. Always finite, 0 to 1.
  - `export function planFactor(kind: ClassKind | null): number` = `1 - CLASS_DISCOUNT[kind]`, or 1 for null.
  - `export function classFactor(b: BizState): number` = `planFactor(activeClasses(b)?.kind ?? null)`.
  - `export function scaleFounders(b: BizState, factor: number): void`. Multiplies `hi` by `factor` (a finite number above 0), clamped to 0-1; a no-op without a valid record.
  - `export function clampFounders(b: BizState): void`. Sets `hi = min(hi, share)`; a no-op without a valid record.
  - `export function afterIpo(b: BizState, retain: number, kind: ClassKind | null): BizState`. A copy as it would stand just after listing: `share`, family slices, `executiveEquity` and `manager.equity` times `retain`, `public: true`, `sharesOut` at least 1, no `group`, `classes` = `{ kind, hi: that share }` or none.
  - `export function votesAfterIpo(b: BizState, retain: number, kind: ClassKind | null): number` = `ownerVotes(afterIpo(b, retain, kind))`.

The maths, with `s = clamp(b.share, 0, 1)`, `fam` = the sum of the finite positive `familyShares`, `exec` = `executiveEquity(b)`, `out = max(0, 1 - s - fam - exec)`, `w` = `CLASS_VOTES[kind]`:

```
mine   = min(hi, s)
loMine = s - mine
total  = w.hi * (mine + fam) + w.lo * (loMine + exec + out)
votes  = (w.hi * mine + w.lo * loMine) / total        // total <= 0 or not finite: s
```

- [ ] **Step 1: Write the failing tests** in `test/share-classes.test.ts`, under `describe('the class record and the votes')`.
  - `'reads a record and drops anything else'`:
    - `{ kind: 'ab', hi: 0.4 }` reads as itself. `{ kind: 'nv', hi: 2 }` reads with `hi` 1. `{ kind: 'ab', hi: -1 }` and `{ kind: 'ab', hi: 'x' }` and `{ kind: 'ab' }` read with `hi` 0.
    - `{ kind: 'zz', hi: 0.5 }`, `'ab'`, `7`, `null`, `[]` and `undefined` read as `null`.
    - Reading a `Object.freeze`d record does not throw, and the result is a different object.
  - `'is whitelisted and saved'`:
    - `normalizeBiz({ ...a.details, classes: { kind: 'ab', hi: 0.3, extra: 1 } }, 2026).classes` equals `{ kind: 'ab', hi: 0.3 }`.
    - `classes: 7` and `classes: { kind: 'zz' }` give `undefined`.
    - `readBiz(g, a).classes` survives `a.details = JSON.parse(JSON.stringify(a.details))`.
  - `'one class: votes are the shares'`: with no record, `ownerVotes` at share 0, 0.3, 0.5 and 1 equals the share exactly. A record on a private company, on a company with a `group`, and on one with `sharesOut = 0` also equals the share. `share = NaN` gives 0; `share = 2` gives 1.
  - `'founder class'`, with `listed(g, { share })` and `b.classes = { kind: 'ab', hi }` set by hand:
    - Share 0.75, hi 0.75, no relatives: close to 0.9677 (4 digits).
    - Share 0.15, hi 0.15: close to 0.6383.
    - Share 0.3, hi 0.3, family `[{ id: 'p1', share: 0.1 }]`, `executive: 0.05`: close to 0.6522.
  - `'non-voting float'`: share 0.15, hi 0.15 gives 1. With family 0.05 it is close to 0.75. With hi 0.05 (0.10 of it ordinary) it is 1.
  - `'shares bought from the market never carry the founders votes'`: `ab`, share 0.4 and hi 0.4 is `v1`. Share 0.5 with hi still 0.4 is `v2`. The same share with hi 0.5 is `naive`. `v1 < v2 < naive`.
  - `'hi is clamped to the stake when read'`: share 0.2 with hi 0.5 equals share 0.2 with hi 0.2.
  - `'is always a finite number from 0 to 1'`: over a seeded grid of 2000 records (share, hi, family, executive, outside drawn from `[-1, 0, 0.01, 0.2, 0.5, 0.99, 1, 2, NaN, Infinity]`, both kinds, public and not), `Number.isFinite(v) && v >= 0 && v <= 1`. In the same sweep, for a valid record, buying from the float (share up by d, outside down by d, hi unchanged) never lowers the votes and never raises them above what the same purchase made in the founders' class (hi up by d) gives.
  - `'dilution scales hi'`: `diluteBusinessEquity(b, 0.8)` on `{ kind: 'ab', hi: 0.5 }` gives `hi` 0.4. With no record, `b.classes` stays `undefined`. A hostile record is left as it is.
  - `'buyback and sale bookkeeping'`: `scaleFounders(b, 1 / 0.9)` takes hi 0.95 to 1 (clamped). `clampFounders` with share 0.3 and hi 0.5 sets hi 0.3. Both are no-ops with no record.
  - `'the price factor'`: `planFactor(null)` is 1, `'ab'` 0.96, `'nv'` 0.93. `classFactor` is 1 on a private company with a plan and 0.96 on a listed `ab` one.
  - `'votes just after an IPO'`: a private company at share 1, retain 0.75: `votesAfterIpo(b, 0.75, 'ab')` is close to 0.9677, `'nv'` is 1, `null` is 0.75. The company is not changed (`JSON.stringify(b)` equal before and after).
- [ ] **Step 2: Run** `npx vitest run test/share-classes.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the `state.ts` additions and `share-classes.ts`. `normalizeBiz` reads `const classes = readClasses(d.classes)` once and spreads `...(classes ? { classes } : {})` after the `ipoPrice` line. `diluteBusinessEquity` ends with: `const plan = readClasses(b.classes); if (plan) b.classes = { kind: plan.kind, hi: plan.hi * clampN(retained, 0, 1) }`.
- [ ] **Step 4: Run** the test, `npx vitest run test/listing-id.test.ts test/own-listing.test.ts` (they build `BizState`s) and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat: share class record and the votes it gives`.

### Task 2: Control reads votes

**Files:**
- Modify: `src/game/business/board-state.ts`. `seatPlan` (line 298) and a new `controlsFor`.
- Modify: `src/game/business/rescue.ts`. The buyback branch of `transactEquity` (lines 61-69).
- Modify: `src/game/business/exit.ts`. `sellShares` (line 247).
- Modify: `src/game/business/own-trade.ts`. `controlsWith` (line 60) delegates to `controlsFor`.
- Test: `test/share-classes-control.test.ts`, `test/control-sites.test.ts`

**Interfaces:**
- Consumes: `ownerVotes`, `scaleFounders` and `clampFounders` from Task 1.
- Produces, in `board-state.ts`:
  - `seatPlan` reads `const votes = ownerVotes(b)` and uses it in `owner = Math.round(votes * size)` and in the 5% seat floor (`if (votes >= 0.05)`). Nothing else in it changes: board size still follows `outside = 1 - b.share`. With no record `votes === b.share`, so the result is identical.
  - `export function controlsFor(g: GameState, b: BizState): boolean`: `const plan = seatPlan(g, b); return plan.size === 0 || (plan.owner + plan.group) * 2 > plan.size`. This is the body `controlsWith` has today.
- Produces, in `own-trade.ts`: `controlsWith(g, b, share)` returns `controlsFor(g, { ...b, share })`. Its behavior and signature do not change. It exists so `share-classes-menu.ts` (Task 3) can ask the same rule without importing `own-trade.ts`, which imports `rescue.ts`.
- `rescue.ts`, buyback branch: after the `b.manager.equity /= 1 - q.units` line, `scaleFounders(b, 1 / (1 - q.units))`. Put In More Money needs nothing (it dilutes through `diluteBusinessEquity`), and Buy Out Investors adds ordinary shares, which is already right.
- `exit.ts`, `sellShares`: after `b.share = stake - sold`, `clampFounders(b)`.

- [ ] **Step 1: Write the failing tests** in `test/share-classes-control.test.ts`, under `describe('control follows the votes')`.
  - `'one class: the seat plan is what it was'`: copy the body of `seatPlan` as it stands before this task (`git show HEAD:src/game/business/board-state.ts`) into the test as `oldSeatPlan`. Over a grid of share in `[0, 0.01, 0.04, 0.05, 0.2, 0.49, 0.5, 0.51, 0.75, 0.999, 1]`, public and private, with and without `familyShares`, `seatPlan(g, b)` equals `oldSeatPlan(g, b)` field by field.
  - `'a founder class controls the board with 15% of the shares'`: `listed(g, { share: 0.15 })` with `classes = { kind: 'ab', hi: 0.15 }`. `seatPlan(g, b)` has `size` 11 and `owner` 7. `ownerControls(g, a)` is true. After `delete b.classes` it is false (2 seats).
  - `'a non-voting float'`: share 0.15, hi 0.15, `nv`: `seatPlan` has `owner` 9 of 11 and `independent` 2, and `controlsFor(g, b)` is true.
  - `'under half the votes is no control'`: `ab`, share 0.02, hi 0.02: `owner` 2 of 11, `controlsFor` false.
  - `'the board is seated by the votes'`: with the first case, `syncSeats(g, a, b, boardOf(b))` leaves `ownerSeats(boardOf(b))` at 7, and `controlsBoard(boardView(g, a, b))` is true.
  - `'controlsWith agrees with the board'`: for `ab` at share 0.15, 0.3 and 0.6 and for `nv` at 0.15, `controlsWith(g, b, b.share) === ownerControls(g, a)`.
  - `'a Stocks buy adds ordinary shares'`: `ab`, share 0.3, hi 0.3, cash enough. `const before = ownerVotes(b)`; `buyOwnShares(g, a, b, q.maxDollars)` is true; `b.classes.hi` is still 0.3; `ownerVotes(b)` is above `before` and below the same record with `hi` set to the new share; and `buyQuote(...).controls` from before the buy equals `ownerControls(g, a)` after it.
  - `'selling clamps the founders class and buying back does not revive it'`: `ab`, share 0.5, hi 0.5. `sellShares(g, a, b, 0.4)` leaves share 0.3 and `hi` 0.3. Then a buy of 0.15 leaves `hi` 0.3 and share 0.45.
  - `'Buy Out Investors needs the votes, not the shares'`: `ab` at share 0.15, hi 0.15, with the owner's seats at 7 of 11. `transactEquity(g, a.id, 'secondary', 1000)` never posts `'You need control of the board for this.'` (check the queued notices). With the record deleted it does.
  - `'the buyback keeps the founders class in step'`: share 0.9, hi 0.9, `ab`, and `b.cash = 2e9` so the buyback is affordable. For seeds 1 to 5, `transactEquity(g, a.id, 'buyback', x)` passes the vote (`passOdds` above 0.99 first) and `hi` becomes `0.9 / (1 - units)` (clamped to 1), the same factor `share` took.
- [ ] **Step 2: Write** `test/control-sites.test.ts`, `describe('every place that tests a share against half')`.
  - It reads every `.ts` file under `src/game` (`readdirSync(dir, { recursive: true })`) and counts the lines matching `/\.share\b[^;{}]{0,12}(>=|>|<=|<)\s*0?\.5[01]?\b/` per file.
  - It expects exactly this table, each entry classified in a comment. Today it finds 15 sites in 10 files:
    - `business/bank-events.ts` 1: economics (a buyout needs half).
    - `business/conglomerate-actions.ts` 1: group economics (the group IPO preview).
    - `business/conglomerate-management.ts` 1: group economics.
    - `business/executive.ts` 2: group economics.
    - `business/exit.ts` 1: the single-class branch of `ipoPreview`; the classed branch reads votes (Task 3).
    - `business/group-services.ts` 3: group economics.
    - `business/succession-review.ts` 2: economics ("own most of it").
    - `nation/drama.ts` 1, `nation/graft.ts` 2, `underworld.ts` 1: who profits from the firm.
  - The failure message says: "A new comparison of a share with half needs a class: if it decides who runs the board, read ownerVotes through seatPlan; if it is about money or a group, add it here."
- [ ] **Step 3: Run** `npx vitest run test/share-classes-control.test.ts test/control-sites.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the `seatPlan`, `controlsFor`, `controlsWith`, buyback and `sellShares` changes.
- [ ] **Step 5: Run** `npx vitest run test/share-classes-control.test.ts test/control-sites.test.ts test/board.test.ts test/board-exploits.test.ts test/own-trade.test.ts test/family-sellout.test.ts test/business.test.ts` and `npm run typecheck`. Expected: PASS. The last four are the Phase 1 and board suites that run `seatPlan`, `controlsWith`, `sellShares` and `transactEquity`.
- [ ] **Step 6: Commit** `feat: board seats follow votes, not shares`.

### Task 3: Choosing classes at the IPO and from Capital & Ownership

**Files:**
- Modify: `src/game/business/exit.ts`. `goPublic` (line 170) and `ipoPreview` (line 206), plus `ipoPlanFor` and `ipoRetain`.
- Modify: `src/game/business/economy.ts` *. One line in `updateSharePrice` (line 936).
- Modify: `src/game/business/board-vote.ts`. The new `'recap'` proposal kind (lines 35, 317, 482).
- Modify: `src/game/business/conglomerate-state.ts`. `detach` (line 561).
- Modify: `src/game/business/own-trade.ts`. The fundamental floor in `buyQuote` (line 91).
- Create: `src/game/business/share-classes-menu.ts` (the logic half; Task 4 adds the rows)
- Test: `test/share-classes-ipo.test.ts`, `test/share-classes-capital.test.ts`

**Interfaces:**
- Consumes: Task 1 (`readClasses`, `planFactor`, `classFactor`, `votesAfterIpo`, `CLASS_*`, `afterIpo`), Task 2 (`controlsFor`), `boardAllows` and `passOdds` (`board.ts`), `syncSeats` and `boardOf` (`board-state.ts`), `manageBlock` (`gate.ts`), `groupIdOf` (`conglomerate-state.ts`), `refreshValue` (`economy.ts`), `useYearAction` and `yearActionsUsed`, `notice`, `log` and `formatPrice` (`core.ts`).
- Produces, in `board-vote.ts`: `'recap'` in `ProposalKind`. `assess` treats it as `'merge'` does (merit from `p.merit`, clamped to -3..3, no self-dealing). `needsVote` returns `'The board decides this.'` for it. `stanceBias` falls to its default.
- Produces, in `exit.ts`:
  - `function ipoPlanFor(g, b, floatPct, kind: ClassKind | null)`: `ipoPlan(Math.max(1, valuationOf(b)) * planFactor(kind), shareCountOf(b), floatPct, listingMood(b.industry, b.countryId, g.year))`. `goPublic` and `ipoPreview` both call it, so the preview is the result.
  - `export function ipoRetain(g, b, floatPct, kind): number` = `ipoPlanFor(...).retain`.
  - `goPublic`: `const kind = readClasses(b.classes)?.kind ?? null`; the plan comes from `ipoPlanFor`. After `diluteBusinessEquity` and the share update, `kind ? b.classes = { kind, hi: b.share } : delete b.classes`. The notice text gets ` You hold ${pct(ownerVotes(b), 0)} of the votes.` when `kind` is set, and is unchanged otherwise.
  - `ipoPreview`: with no record the text is exactly today's, including the one line that tests `b.share >= 0.5`. With one, "You'd keep X." becomes "You'd keep X of the shares." and the tail is ` You'd hold ${pct(after, 0)} of the votes.` followed by one of: when `after >= 0.5` and `controlsFor(g, b)`, ` You keep control of the board.`; when `after >= 0.5` otherwise, ` You would control the board.`; when `after < 0.5` and `controlsFor(g, b)`, ` That is under half of the votes. Outside shareholders would control the board.`; else nothing. `after = votesAfterIpo(b, plan.retain, kind)`. The classed branch asks the board (`controlsFor`) and never compares a share with half, so `test/control-sites.test.ts` still counts one site in `exit.ts`.
- Produces, in `economy.ts`: `const fundamental = (valuationOf(b) / b.sharesOut) * classFactor(b)` in `updateSharePrice`. Nothing else in the file changes.
- Produces, in `own-trade.ts`: in `buyQuote`, the term `finite(valuationOf(b) / b.sharesOut)` becomes `finite(valuationOf(b) / b.sharesOut) * classFactor(b)`. The market's own price for a lower-vote company is what the buy floor follows.
- Produces, in `conglomerate-state.ts`: `detach`, inside `if (listing && !b.public)`, adds `delete b.classes`.
- Produces, in `share-classes-menu.ts`:
  - `export type ClassChoice = ClassKind | 'single'` and `export const CLASS_CHOICES: readonly ClassChoice[] = ['single', 'ab', 'nv']`
  - `export function classesKey(assetId: string): string` = `` `classes.${assetId}` ``
  - `export function currentChoice(b: BizState): ClassChoice` = `readClasses(b.classes)?.kind ?? 'single'`
  - `export function classBlock(g, a, b, choice): string | null`. The first that applies, with this copy: `manageBlock(g, a)`; `groupIdOf(b)` gives `"A division can't have its own share classes."`; `currentChoice(b) === choice` gives `'It already has this structure.'`; a listed company with `yearActionsUsed(g, classesKey(a.id)) > 0` gives `'Classes change once a year.'`.
  - `export interface ClassOption { choice: ClassChoice; current: boolean; reason: string | null; votes: number; controls: boolean; factor: number; odds: number | null }`
  - `export function classOption(g, a, b, choice): ClassOption`. Pure. Listed: `votes` and `controls` from a copy of `b` with the record the choice would set (`hi = b.share`, or none), `factor = planFactor(kind of choice) / classFactor(b)`, `odds = passOdds(g, a, b, recapProposal)`. Private: `votes = votesAfterIpo(b, ipoRetain(g, b, FLOAT_DEFAULT, kind), kind)`, `controls = controlsFor(g, afterIpo(...))`, `factor = planFactor(kind)`, `odds = null`.
  - `export function changeClasses(g: GameState, assetId: string, choice: ClassChoice): boolean`.
    - No asset, or any `classBlock` reason: post `notice(g, 'Share Classes', reason)` (no notice when there is no asset), return false.
    - Private: set `b.classes = { kind, hi: 1 }`, or `delete b.classes` for `'single'`. No year key, no vote. `log(g, ``I changed ${a.name} to ${CLASS_PHRASE[choice]}.``)`. Notice `'Share Classes'`: `` `${a.name} will list with ${CLASS_PHRASE[choice]}. ${optionLine}` `` where `optionLine` is `` `You'd hold ${pct(votes, 0)} of the votes after a ${FLOAT_DEFAULT}% float.` `` followed by `` ` The market pays ${pct(1 - factor, 0)} less.` `` when `factor < 1`. Return true.
    - Listed: `if (!boardAllows(g, a, b, recapProposal)) return false`, then `useYearAction(g, classesKey(a.id), 1)`. Set the record (`hi = b.share`) or delete it. `b.sharePrice = Math.max(0.01, round2(b.sharePrice * after / before))` with `before = classFactor(b)` read first and `after = planFactor(kind of choice)`. `b.valuation = Math.round(b.sharePrice * b.sharesOut)`. `syncSeats(g, a, b, boardOf(b))`, then `refreshValue(a, b)`. Log `` `I changed ${a.name} to ${CLASS_PHRASE[choice]}.` ``. Notice `'Share Classes'`: `` `${a.name} now has ${CLASS_PHRASE[choice]}. You hold ${pct(ownerVotes(b), 0)} of the votes. The price is ${formatPrice(b.sharePrice)}.` ``. Return true.
    - `recapProposal` is `{ kind: 'recap', by: 'owner', merit: CLASS_MERIT[choice], label: ``Change ${a.name} to ${CLASS_PHRASE[choice]}`` }`.

- [ ] **Step 1: Write the failing tests** in `test/share-classes-ipo.test.ts`, under `describe('the IPO with a share structure')`. Use `privateCompany(g)` and set `b.classes = { kind: 'ab', hi: 1 }` by hand.
  - `'one class: the preview is today's'`: share 0.6, float 60: `ipoPreview(g, b, 60)` contains `'Under half: outside shareholders would control the board.'` and does not contain `'of the votes'`.
  - `'a plan names the votes and the control'`: `ab`, share 0.3, float 25: contains `'of the votes'` and `"You would control the board."`. Share 0.6: contains `'You keep control of the board.'`. `nv`: contains `'of the votes'`.
  - `'the offer prices the lower-vote class at a discount'`: on `structuredClone`s with the same seed, `goPublic(g, a, b, 25)` for no record, `ab` and `nv`. `sharePrice` for `ab` over the one-class price is between 0.9 and 0.985; `nv` is lower than `ab`.
  - `'the preview and the listing share one plan'`: after `goPublic` on an `ab` company, `b.share / shareBefore` is close to `ipoRetain(g, bBefore, 25, 'ab')` (9 digits).
  - `'listing converts the owner's whole stake'`: after `goPublic` on `ab`: `b.classes` equals `{ kind: 'ab', hi: b.share }` and `ownerVotes(b)` is close to `10 * s / (10 * s + (1 - s))` with `s = b.share` (4 digits). On `nv` it is 1. With no record `b.classes` is `undefined` and the notice has no `'of the votes'`.
  - `'a hostile record lists as one class'`: `b.classes = { kind: 'zz' } as never` leaves `b.classes` undefined after listing, and the price equals the one-class price.
  - `'the yearly price step carries the factor'`: two clones of a listed company with the same `sharePrice` equal to its fundamental, one with `{ kind: 'ab', hi: 0.6 }`. After `updateSharePrice(g, b, g.year)` on each (same seed), the `ab` price over the other is between 0.95 and 0.995. With no record the price is what it was before this task (compare against a clone that never had the field).
  - `'the buy floor follows it'`: `listed(g, { marketCap: 10e9, profit: 5e9 })`: with `ab`, `buyQuote(g, a, b, 1).basePrice` is close to 0.96 times the one-class `basePrice`.
  - `'a company leaving a group lists as one class'`: `detach(g, a, b, { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 })` on a private company with a plan leaves `b.classes` undefined.
  - `'previews are pure'`: `JSON.stringify(g)` and `g.rng` are unchanged across `ipoPreview` and `ipoRetain` calls, also on a `deepFreeze`d copy.
- [ ] **Step 2: Write the failing tests** in `test/share-classes-capital.test.ts`, under `describe('changing the classes')`.
  - `'a private company keeps a plan, free'`: `changeClasses(g, a.id, 'ab')` is true; `b.classes` equals `{ kind: 'ab', hi: 1 }`; `yearActionsUsed(g, classesKey(a.id))` is 0. Then `'nv'`, then `'single'` (record deleted). The same choice twice gives false with `'It already has this structure.'` in the queued notice.
  - `'a listed company: vote, year key, price, seats'`: `listed(g, { share: 0.9 })`. For seeds 1 to 5 (fresh game each): `passOdds(g, a, b, recap)` is above 0.99 and `changeClasses(g, a.id, 'ab')` is true. Then `b.classes` equals `{ kind: 'ab', hi: b.share }`; `sharePrice` is the old price times 0.96 (within 0.01); `valuation === Math.round(sharePrice * sharesOut)`; `yearActionsUsed(g, classesKey(a.id))` is 1; `ownerSeats(boardOf(b))` equals `seatPlan(g, b).owner + seatPlan(g, b).group`.
  - `'once a year'`: a second change in the same year is false with `'Classes change once a year.'`. After `g.yearActions = {}` it works.
  - `'back to one class restores the price'`: `ab` then `single` (year reset): `sharePrice` is within 0.02 of the original.
  - `'a board that says no changes nothing'`: `listed(g, { share: 0.45 })`, `ab`; `passOdds` is between 0.2 and 0.8. Over seeds 1 to 30 (fresh game each): when `changeClasses` is false, `b.classes`, `sharePrice` and `valuation` are unchanged, the year key is unused, `refusedThisYear(g, b, 'recap')` is true and `refusedThisYear(g, b, 'merge')` is false. When it is true, the record and price changed as in the case above. Across the 30 seeds at least one of each happened.
  - `'a proposal of this kind needs the board'`: `needsVote(g, a, b, recap)` is `'The board decides this.'` on a listed company.
  - `'blocked reasons'`: a `listedGroup` member with `public` forced gives `"A division can't have its own share classes."`; age 17 gives a reason matching `/18/`; in prison matches `/prison/`; `alive = false` gives a reason.
  - `'options say what the choice would do'`: for a listed `single` company at share 0.15, `classOption(g, a, b, 'ab')` has `votes` close to 0.6383, `controls` true, `factor` close to 0.96 and `current` false; `'single'` has `current` true. For a private company at share 1, `classOption(g, a, b, 'ab').votes` is close to `votesAfterIpo(b, ipoRetain(g, b, 25, 'ab'), 'ab')`.
  - `'options are pure'`: `JSON.stringify(g)` and `g.rng` unchanged across `classOption` for all three choices, also from a `deepFreeze`d copy.
- [ ] **Step 3: Run** `npx vitest run test/share-classes-ipo.test.ts test/share-classes-capital.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the `'recap'` kind, `exit.ts`, `economy.ts`, `own-trade.ts`, `conglomerate-state.ts` and `share-classes-menu.ts` as specified.
- [ ] **Step 5: Run** `npx vitest run test/share-classes-ipo.test.ts test/share-classes-capital.test.ts test/share-classes-control.test.ts test/share-structure.test.ts test/board.test.ts test/own-trade.test.ts test/conglomerate.test.ts test/conglomerate-play.test.ts test/family-sellout.test.ts test/business.test.ts` and `npm run typecheck`. Expected: PASS. The conglomerate files cover `detach`; `share-structure` covers `ipoPlan`.
- [ ] **Step 6: Commit** `feat: choose share classes at the IPO and from Capital & Ownership`.

### Task 4: The rows and the screens

**Files:**
- Modify: `src/game/business/share-classes-menu.ts`. Add `classesNode`.
- Modify: `src/game/business/manage.ts` *†. Two small pushes (below).
- Modify: `src/game/business/own-listing.ts`. `OwnListing` gains two fields.
- Modify: `src/game/business/own-listing-menu.ts` †. The screen and the row subtitle.
- Modify: `src/game/business/own-trade.ts`. `buyPreview`.
- Test: `test/share-classes-menu.test.ts`; additions to `test/own-listing.test.ts`, `test/own-listing-menu.test.ts` †, `test/own-trade.test.ts`.

**Interfaces:**
- Consumes: Task 3 (`classOption`, `changeClasses`, `classBlock`, `CLASS_CHOICES`, `currentChoice`), Task 1 (`ownerVotes`, `activeClasses`, `CLASS_PHRASE`, `planFactor`, `classFactor`).
- Produces, in `share-classes-menu.ts`: `export function classesNode(a: Asset): MenuGroup`.
  - `id` `` `biz.classes.${a.id}` ``, label `'Share Classes'`, emoji `'🗳️'`.
  - Subtitle by `currentChoice`: `'One class: every share has one vote'`, `'Founder class: B has 10 votes, A has 1'`, `'Non-voting float: the public has no vote'`.
  - Header: private `` `Pick how ${name}'s shares are sold at the IPO. Investors pay less for shares with fewer votes.` ``; listed `'Changing the classes takes a board vote, once a year. The share price moves when it passes.'`.
  - Children: one action per `CLASS_CHOICES`, id `` `biz.classes.${a.id}.${choice}` ``, emoji `'🗳️'`, labels `'One Class of Shares'`, `'Founder Class (A/B)'`, `'Non-Voting Float'`.
    - Subtitle from `classOption`: current, listed `` `Current. You hold ${pct(votes, 0)} of the votes.` ``; current, private `` `Current. You'd hold ${pct(votes, 0)} of the votes after a ${FLOAT_DEFAULT}% float.` ``; otherwise `` `You'd hold ${pct(votes, 0)} of the votes${private ? ` after a ${FLOAT_DEFAULT}% float` : ''}. ${factor < 1 ? `The market pays ${pct(1 - factor, 0)} less.` : 'No price cost.'}` ``. A listed choice whose factor is above 1 says `` `The price rises about ${pct(factor - 1, 0)}.` `` in place of the last sentence.
    - `disabledReason` is `classBlock` (the asset re-found by id; `'You no longer own this.'` when gone).
    - Listed only, `confirm`: `` `Change ${name} to ${CLASS_PHRASE[choice]}? The board votes first. The price ${factor < 1 ? 'falls' : 'rises'} about ${pct(Math.abs(1 - factor), 0)}.` `` (omit the last sentence when `factor === 1`).
    - `run: (gg) => { changeClasses(gg, a.id, choice) }`.
- Produces, in `manage.ts`: (1) in the Capital & Ownership node (line 2166), `children: gg => { const aa = findBusiness(gg, a.id); return aa ? [...rescueNodes(gg, aa), ...(groupIdOf(readBiz(gg, aa)) ? [] : [classesNode(aa)])] : [] }`. (2) After the `act(a, 'ipo', 'Go Public (IPO)', ...)` push (line 1990), `nodes.push(classesNode(a))`. Both only where the company is not in a group. Heavy R&D's edits are in the Products screen and imports (lines 66-76 and 470-650); the dividends work adds its own import and one push.
- Produces, in `own-listing.ts`: `OwnListing.votes: number` (the group row: its stake) and `OwnListing.classKind: ClassKind | null` (the group row: null). For a company, `votes = ownerVotes(v)` and `classKind = activeClasses(v)?.kind ?? null`, with `v` the record `ownListings` already builds (stake as stored).
- Produces, in `own-listing-menu.ts`:
  - Row subtitle: with `classKind`, `` `${formatPrice(l.price)} · ${TIER_LABEL[l.tier]} · yours ${pct(l.stake, ...)} (${pct(l.votes, 0)} of votes) · ${l.exCode}` ``. Without it, unchanged.
  - Screen: after the "Listed on the ..." line, when `classKind` is set, two info lines. `ab`: `'Classes: B has 10 votes a share and is yours. A has 1 vote and trades.'`. `nv`: `'Classes: the voting shares are yours. The non-voting shares trade.'`. Then `` `Votes: you hold ${pct(cur.votes, 1)} of the votes with ${pct(cur.stake, 1)} of the shares.` ``. The control line becomes `` `At 50% or more of the votes you control the board. You hold ${pct(cur.votes, 1)}.` `` when `classKind` is set, and is unchanged otherwise.
- Produces, in `own-trade.ts`: `buyPreview`. When `activeClasses(b)` is set, after "You'd own X." insert `` ` ${kind === 'nv' ? 'These shares carry no vote.' : 'These shares carry 1 vote.'} You'd hold ${pct(ownerVotes({ ...b, share: q.newShare }), 0)} of the votes.` ``, then the existing control sentence. Without a record the text is unchanged.

- [ ] **Step 1: Write the failing tests** in `test/share-classes-menu.test.ts`, under `describe('the Share Classes rows')`. The file imports `'../src/game/business'`.
  - `'is under Capital and beside Go Public'`: for a private company, `findNode(g, businessAssetView(g, a), `biz.classes.${a.id}`)` exists, in both the Capital & Ownership children and the Exit children (`biz.ipo.${a.id}` sits just before it). For a listed company it exists under Capital & Ownership and not beside Go Public (there is none). For a division in a group it does not exist.
  - `'the rows say what each choice does'`: a private company at share 1: the `ab` subtitle contains `'of the votes after a 25% float'` and `'The market pays 4% less.'`; the `nv` one says 7%; the `single` one says `'No price cost.'`. The current choice says `'Current.'`.
  - `'the confirm names the vote and the price'`: a listed company: the `ab` confirm contains `'The board votes first.'` and `'falls about 4%'`; going back to one class says `'rises about 4%'`. A private company's rows have no confirm.
  - `'running a row changes the company'`: `run(g)` on the private `ab` row leaves `b.classes` with kind `ab`. On a listed company at share 0.9 (seed with high odds) it sets the record and the price.
  - `'a disabled row says why'`: the current choice's row has `'It already has this structure.'`; after a change, the others say `'Classes change once a year.'`.
  - `'renders from a frozen state'`: `deepFreeze(g)`, then render the node, its children, every subtitle, `disabledReason` and `confirm`. No throw, JSON unchanged.
- [ ] **Step 2: Add tests** to the Phase 1 files.
  - `test/own-listing.test.ts`: `'a classed company's row carries its votes'`: `ab`, share 0.15: `votes` close to 0.6383 and `classKind` is `'ab'`; a one-class company has `votes === stake` and `classKind` null; a group row has `classKind` null and `votes === stake`.
  - `test/own-listing-menu.test.ts`: `'shows the classes and the votes'`: info texts include the `ab` classes line, `'Votes: you hold 63.8% of the votes with 15.0% of the shares.'` and `'At 50% or more of the votes you control the board. You hold 63.8%.'`; the row subtitle contains `'(64% of votes)'`. `'a one-class company reads as before'`: no `'Classes:'` and no `'Votes:'` line, and the control line is `'At 50% or more you control the board. You hold 60.0%.'`.
  - `test/own-trade.test.ts`: `'the buy preview says whether the shares vote'`: `ab` contains `'These shares carry 1 vote.'` and `'of the votes.'`; `nv` contains `'These shares carry no vote.'`; one class is unchanged and has neither.
  - If a Phase 1 test compares a whole `OwnListing`, add the two fields to it.
- [ ] **Step 3: Run** the new and changed tests. Expected: FAIL.
- [ ] **Step 4: Implement** the rows and the two pushes in `manage.ts`, the `OwnListing` fields, the screen lines and the preview sentence.
- [ ] **Step 5: Run** `npx vitest run test/share-classes-menu.test.ts test/own-listing.test.ts test/own-listing-menu.test.ts test/own-trade.test.ts test/company-dashboard.test.ts test/business.test.ts test/board.test.ts test/fuzz-regressions.test.ts test/voice-guards.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: share class rows, votes and control in the company screens`.

### Task 5: What real companies had, by year

**Files:**
- Create: `src/game/invest/class-data.ts`
- Modify: `src/game/investments.ts`. `stocksMenu.children` (line 1647): one more info row per company.
- Test: `test/class-data.test.ts`

**Interfaces:**
- Consumes: `allRealCos` and `RealCo` (`invest/real.ts`), `companyDef` (`invest/engine.ts`).
- Produces, in `class-data.ts` (imports `./real` and types only):
  - `export interface ClassRow { letter: string; label: string; votes: number; listed: boolean; holder?: string; note?: string; from: number; to?: number }`. `letter` is one capital letter. `to` is the last year it exists. `votes` is votes a share against 1 for an ordinary vote. `note`, when present, replaces the generated sentence.
  - `export interface ClassEntry { id: string; main: { label: string; votes: number }; rows: ClassRow[] }`. `id` is the registry id (`'stock-us-alphabet'`).
  - `export const CLASS_ENTRIES: readonly ClassEntry[]`
  - `export function classEntryFor(co: Pick<RealCo, 'id'>): ClassEntry | undefined`
  - `export function classRowsIn(co: Pick<RealCo, 'id'>, year: number): ClassRow[]`. The rows with `from <= year` and (`to` missing or `year <= to`).
  - `export function votesText(v: number): string`: `0` gives `'no vote'`, `1` `'1 vote a share'`, `10` `'10 votes a share'`, `0.1` `'a tenth of a vote a share'`, other values below 1 `'0.15 of a vote a share'`, above 1 `'N votes a share'`.
  - `export function classFacts(co: Pick<RealCo, 'id'>, year: number): string | null`. Null when no row is open. Otherwise `` `Share classes: ${main.label} (this line) has ${votesText(main.votes)}.` `` followed, for each open row, by `` ` ${row.note ?? `${row.label} has ${votesText(row.votes)}${row.holder ? `, held by ${row.holder}` : ''}${row.listed ? ' and is listed too' : ''}.`}` ``.

The first batch. Each row is entered from a checked public source (name it in a comment above the entry); a row that cannot be confirmed is left out, not guessed. `from` and `to` are the first and last year the class existed; `from` is never before the company's listing year.

| Registry id | Main line | Other classes |
|---|---|---|
| `stock-us-alphabet` | Class A, 1 | B: 10, not listed, the founders, from 2004. C: 0, listed, from 2014 |
| `stock-us-meta-platforms` | Class A, 1 | B: 10, not listed, the founder, from 2012 |
| `stock-us-berkshire-hathaway` | Class A, 1 | B: 0.15, listed, from 1996 |
| `stock-us-ford-motor-company` | Common, 1 | B: not listed, the Ford family, from 1956, note "Class B, held by the Ford family, carries 40% of the votes." |
| `stock-ca-rogers-communications` | Class B, 0 | A: 1, listed, from 1979 |
| `stock-ca-shopify` | Class A, 1 | B: 10, not listed, the founder, from 2015 |
| `stock-de-volkswagen` | Ordinary, 1 | Preference: 0, listed, from 1986 |
| `stock-de-bmw` | Ordinary, 1 | Preference: 0, listed, from 1989 |
| `stock-de-porsche` | Preference, 0 | Ordinary: 1, not listed, Porsche SE and the VW group, from 2022 |
| `stock-de-henkel` | Ordinary, 1 | Preference: 0, listed, from 1985 |
| `stock-ch-richemont` | Class A, 1 | B: not listed, the Rupert family, from 1988, note "Class B, held by the Rupert family, carries half the votes with a tenth of the capital." |
| `stock-se-ericsson` | Class B, 0.1 | A: 1, listed, from 1919 |
| `stock-se-volvo` | Class B, 0.1 | A: 1, listed, from 1935 |
| `stock-se-h-and-m` | Class B, 1 | A: 10, not listed, the Persson family, from 1974 |
| `stock-se-electrolux` | Class B, 0.1 | A: 1, listed, from 1930 |
| `stock-dk-maersk` | Class B, 0 | A: 1, listed, from 1965 |
| `stock-fi-kone` | Class B, 0.1 | A: 1, listed, from 1967 |
| `stock-kr-samsung-electronics` | Common, 1 | Preferred: 0, listed, from 1989 |
| `stock-kr-hyundai-motor` | Common, 1 | Preferred: 0, listed, from 1990 |
| `stock-in-tata-motors` | Ordinary, 1 | DVR: 0.1, listed, 2008 to 2024 |
| `stock-hk-xiaomi` | Class B, 1 | A: 10, not listed, the founders, from 2018 |
| `stock-hk-meituan` | Class B, 1 | A: 10, not listed, the founders, from 2018 |

The 14 listed extra rows (Alphabet C, Berkshire B, Rogers A, the six preferred and ordinary lines of the German and Korean companies, Ericsson A, Volvo A, Electrolux A, Maersk A, Kone A, Tata DVR) become buyable lines in Task 7. Not here, on purpose: LVMH and L'Oréal (loyalty voting), Shell and Unilever (dual-listed pairs), BYD (A/H shares), Roche and Novo Nordisk (structure not confirmed for this batch).

- [ ] **Step 1: Write the failing tests** in `test/class-data.test.ts`, under `describe('classes of real companies')`.
  - `'every entry names a registry stock'`: each `CLASS_ENTRIES[i].id` is the id of a company in `allRealCos()`; no company appears twice.
  - `'every year sits inside the company's trading years'`: for each row, `from >= co.start`, `from <= (to ?? from)`, and `to` (when present) `<= (co.end ?? 9999)`.
  - `'letters are one capital letter, unique per company, and not the main line's'`: `/^[A-Z]$/`; the main label does not end in the row's letter.
  - `'votes are finite and not negative; a listed row has a numeric vote'`.
  - `'the batch is the size the plan says'`: 22 entries; 14 rows with `listed: true`.
  - `'votesText'`: the five cases above.
  - `'classFacts follows the year'`: Alphabet in 2003 gives null; in 2010 it names Class B and not Class C; in 2020 it names both and says Class C `'is listed too'`. Meta in 2011 gives null (not listed yet) and in 2020 names Class B. Berkshire in 1995 gives null and in 2000 names Class B. Ford names the Ford family sentence verbatim. Tata Motors in 2025 gives null.
  - `'the Stocks screen shows it'`: a US resident in 2020: the Alphabet offer node's children (find the secId with `investmentListing(g)` by name) contain an info text starting `'Share classes: Class A (this line) has 1 vote a share.'`. A company with no entry (Apple) has no such line. The number of `inv-offer-` menus equals `slotPlan(exchangeInfo('us')).length`.
- [ ] **Step 2: Run** `npx vitest run test/class-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `class-data.ts` and, in `stocksMenu.children`, append `classFacts(co, g.year)` (when not null) to the `extraInfo` array passed to `offerNode`, where `co = companyDef(l.info, slot, gen).real`.
- [ ] **Step 4: Run** `npx vitest run test/class-data.test.ts test/stocks-real.test.ts test/investments.test.ts test/history-markets.test.ts test/talent-investing.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the classes real companies had, by year, on their Stocks screen`.

### Task 6: One key for a company

**Files:**
- Modify: `src/game/invest/engine.ts`. Add `companyKey` and `lineLetter` next to `isRealSecId` (line 570), and make `isRealSecId` read through the suffix.
- Modify: `src/game/invest/shocks.ts`. `breakthroughStockFactor` (line 122), `addMarketShock` (line 237), `shockFactor` (line 279). `shockable` (line 232) needs no edit: it calls `isRealSecId`.
- Modify: `src/game/special/politics.ts`. `insiderPositions` (line 1709, compare at 1728); export it.
- Test: `test/company-key.test.ts`

**Interfaces:**
- Produces, in `engine.ts`:
  - `export const LINE_SEP = '~'`
  - `export function companyKey(secId: string): string`: strips a trailing `~` followed by 1-3 capital letters or digits (`/~[A-Z0-9]{1,3}$/`). Anything else, including `''`, is returned as it is.
  - `export function lineLetter(secId: string): string | null`: that suffix without the `~`, or null.
  - `isRealSecId(secId)` tests `companyKey(secId)` against the existing pattern.
- Produces, in `shocks.ts`:
  - `breakthroughStockFactor` parses `companyKey(secId)`.
  - `addMarketShock`: for any cause except `'liquidity'` the stored `secId` is `companyKey(secId)`. A liquidity shock stays on the id it was given (each line has its own book).
  - `shockFactor(g, secId, year)`: `const key = companyKey(secId)`. The breakthrough and economy factors use `key`. The loop over `bySec.get(secId)` stays (all causes on that exact id). When `key !== secId`, a second loop over `bySec.get(key)` adds the shocks whose `cause !== 'liquidity'`. For an id without a suffix this is the loop that exists today.
  - `orderFlowFactor` is unchanged.
- Produces, in `politics.ts`: `export function insiderPositions`, and `companyKey(str(a.details.secId)) === t.secId` in the shares loop.

- [ ] **Step 1: Write the failing tests** in `test/company-key.test.ts`, under `describe('one key per company')`.
  - `'strips only a line suffix'`: `companyKey('NYSE:S&P 500#s3g100012~C')` is `'NYSE:S&P 500#s3g100012'`; the same without the suffix, `'crypto#c0g0'`, `'NYSE:S&P 500#fund'`, `'bond:us:2030'`, `''`, `'x~'`, `'x~ab'` and `'x~ABCD'` come back unchanged; `lineLetter` gives `'C'` for the first and null for the others.
  - `'is the identity for every id the engine makes'`: for the United States, Japan, Germany, India and Hong Kong in 1930, 1990 and 2026, every `secId` in `investmentListing(founder(...))` has `companyKey(id) === id`.
  - `'isRealSecId reads through the suffix'`: a real company's id with `~C` is real; a made-up one (`gen` 0) with `~C` is not; both equal their unsuffixed answers.
  - `'news hits every line, order flow only its own'`: add a `'contract'` shock (mult 1.2) on a company id. `shockFactor(g, id + '~C')` equals `shockFactor(g, id)`. Add a `'liquidity'` shock (mult 1.1) on `id + '~C'`: `shockFactor(g, id + '~C')` is the news times 1.1, `shockFactor(g, id)` is unchanged, `orderFlowFactor(g, id + '~C')` is 1.1 and `orderFlowFactor(g, id)` is 1.
  - `'news written against a line is stored on the company'`: `addMarketShock` with `secId: id + '~C'` and cause `'contract'` stores `secId === id`; with cause `'liquidity'` it stores the line id.
  - `'an invention reaches every line'`: with a `MarketBreakthrough` that names the company's slot and generation, `breakthroughStockFactor(g, id + '~C', year)` equals `breakthroughStockFactor(g, id, year)` and is above 1.
  - `'a damaging story never sticks to a real company's line'`: `addMarketShock` with cause `'ban'` on a real id with `~C` has `mult` 1.
  - `'insider positions count a line'`: with a held investment (an `Asset` literal like the one at `test/investments.test.ts:659`, with `details: { type: 'stock', secId: id + '~C' }` and a `value`) and a target whose `secId` is `id`, `insiderPositions(g, t, false, { freshOnly: false }).shares` is above 0; with a different company's line it is 0.
  - `'only made-up companies are ever targets'`: `stockTargets(g)` has no `real` target and no id with a `~`; `listedTargets(g)` has no id with a `~`.
- [ ] **Step 2: Run** `npx vitest run test/company-key.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run** `npx vitest run test/company-key.test.ts test/insider-fairness.test.ts test/insider-escrow.test.ts test/politics-abuse.test.ts test/mp-insider-story.test.ts test/invest-self-impact.test.ts test/invest-safety.test.ts test/invest-order-notice.test.ts test/stocks-real.test.ts test/history-markets.test.ts test/business-expansion.test.ts` and `npm run typecheck`. Expected: PASS, with no change to any existing test.
- [ ] **Step 5: Commit** `feat: one security key per company, so every line of it moves together`.

### Task 7: Buy the second listed class of a real company

**Files:**
- Modify: `src/game/invest/class-data.ts`. Lines.
- Modify: `src/game/investments.ts`. `Quote`, `Listing`, `listing` (752), `holdingQuote` (925), `buySecurity` (1017), `offerNode` (1565), `pathMove` and `moveHolding` (2017, 2038), `renameForEra` (2212), `pruneShocks` (2251), `revalueHoldings` (2311).
- Test: `test/class-lines.test.ts`

**Interfaces:**
- Consumes: `companyKey` and `lineLetter` (Task 6), the rows of Task 5.
- Produces, in `class-data.ts`:
  - `export function lineSpread(mainVotes: number, votes: number): number`: `votes === mainVotes` gives 0; `votes > mainVotes` gives +0.03; `votes < mainVotes` gives -0.04 when `votes === 0` and -0.02 otherwise.
  - `export function lineSecId(companyId: string, letter: string): string` = `` `${companyId}~${letter}` ``
  - `export interface Line { secId: string; letter: string; label: string; votes: number; spread: number }`
  - `export function linesOf(co: Pick<RealCo, 'id'>, companyId: string, year: number): Line[]`. The listed rows open in `year`, with the spread against the entry's main line.
  - `export function lineOpen(co: Pick<RealCo, 'id'>, letter: string, year: number): boolean`
  - `export function lineYear(cur: SecYear, letter: string, spread: number): SecYear`. A copy with `id` the line's id, `price` times `1 + spread`, and, when `cur.ended` is set, `ended.id` the line's id for the ended company and `ended.perUnit` times `1 + spread`. `ratio`, `ret`, `event` and `payout` are kept.
- Produces, in `investments.ts` (no import from `business/`):
  - `Quote.lines?: Quote[]`.
  - `listing(g)` builds a line `Quote` for each of a real company's `linesOf(...)`: `type` `'stock'`, `secId` the line's, `name` `` `${era.name} (${line.label})` ``, `symbol` `` `${def.symbol}${line.letter}` `` (five letters), the company's price times `1 + spread`, risk, yield and `ret` of the company, `details` as the company's plus the line's `secId` and `symbol`, `classOf` (the company id) and `classLabel`. It goes through `withShock` with `shockFactor(g, line.secId, y)` and `y - 1`. It sits on `quote.lines`, not in `stocks`, not in `allQuotes`.
  - `function quotesWithLines(l: Listing): Quote[]` = `allQuotes(l)` plus every `stocks[i].lines`. `holdingQuote`, `buySecurity` and `revalueHoldings` look up through it. `investmentListing` and the Stocks list use `allQuotes` and `stocks` as before.
  - `offerNode`: after the main buy and sell actions, one section per line: a heading `` `inv-oline-${line.secId}` `` (label the line's `label`), the info rows (price and change, the votes text, the dividend), the `inv-oheld-` line when held, then `buyAction` and `sellActions` for that line. The ids are the line's `secId`, so they are unique.
  - `moveHolding` (stock case): when the holding's `secId` has a suffix, `const raw = list[slot]`, and the move is `pathMove(open ? lineYear(raw, letter, spread) : undefined, a, price)`, where `open` is `lineOpen(co, letter, g.year)` and `co` and `spread` come from the holding's `slot`, `gen` and exchange (`companyDef(...).real`, `linesOf`). `undefined` makes `pathMove` pay the position out as delisted at its last price, which is what happens when a class ends. The company ending is handled by `lineYear` mapping `ended`.
  - `renameForEra`: a holding with a `classOf` detail compares `def.id` with `companyKey(secId)` and is renamed `` `${era.name} (${classLabel})` ``.
  - `pruneShocks`: `alive` tests `ey.stocks[sh.slot]?.id === companyKey(sh.secId)` and, for a line, that the line was open in `last`.

- [ ] **Step 1: Write the failing tests** in `test/class-lines.test.ts`, under `describe('the second listed class of a real company')`.
  - `'a company with a listed second class shows it on its screen'`: a US resident in 2020: the Alphabet offer node has a heading `inv-oline-<id>~C` and a Buy action `inv-buy-<id>~C`. The line's price is the main price times 0.96 (within a cent); its symbol is five letters ending in `C`; its subtitle or info mentions `'no vote'`.
  - `'not before the class existed, and not after it ended'`: Alphabet in 2013 has no line; Berkshire in 1995 none, in 1996 one (`B`); Tata Motors in 2024 has one and in 2025 none.
  - `'lines stay out of the list and the helpers'`: no id from `investmentListing(g)` contains `~`; the `inv-offer-` count equals `slotPlan(exchangeInfo('us')).length`; the stock tickers are unique.
  - `'buying a line makes a holding'`: `buySecurity(g, lineId, 10_000)` is true; `investmentHoldings(g)` has one holding with `details.secId` the line's and `classOf` the company's; its name ends `'(Class C)'`; net worth falls by no more than the fee.
  - `'a holding moves with its company'`: buy 10,000 of the line and of the main line in the same year; step one year (`g.year += 1; yearlyInvestments(g)`). The two holdings' percentage changes agree to within 0.1 percentage points (same `ret`, a fixed spread; rounding and fees are the only difference).
  - `'a split splits the line'` and `'the company ending pays the line'` (pure): `lineYear` on a `SecYear` with `ratio: 2` keeps `ratio` and `event`; on one with `ended: { id: 'X', kind: 'acquired', perUnit: 10, premium: 0.2 }` it maps `ended.id` to `X~C` and `perUnit` to `10 * (1 + spread)`.
  - `'a line's own last year cashes it out'`: in an India game at 2024, buy the Tata Motors DVR line; step to 2025 (`g.year += 1; yearlyInvestments(g)`): the holding is gone and its value is back in the bank, within the market move. It is not a loss of the position.
  - `'selling a line pays like selling any stock'`: run the holding's `inv-sell-<asset id>` action for half its value: cash rises by about that value less the fee, the holding is half as big, and the line's order-flow shock is recorded under the line's id.
  - `'a reload keeps the holding'`: `JSON.parse(JSON.stringify(g))` then `holdingQuote`-based reads (the portfolio screen) give the same value; the next year's step works on the copy.
  - `'order flow stays on the line and is kept'`: after a line buy, a `'liquidity'` shock exists under the line's id; one year later (`yearlyInvestments`) it is still there.
  - `'a line is renamed with its company'`: buy Alphabet C in 2014 (`'Google (Class C)'`); in 2015 the name is `'Alphabet (Class C)'` and a log line says it was renamed.
  - `'no bets and no politics'`: `listedTargets(g)` has no line; `findTarget(g, lineId)` is undefined.
  - `'renders from a frozen state'`: the Alphabet offer screen from a `deepFreeze`d game renders, JSON unchanged.
- [ ] **Step 2: Run** `npx vitest run test/class-lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `class-data.ts` lines and the `investments.ts` changes.
- [ ] **Step 4: Run** `npx vitest run test/class-lines.test.ts test/class-data.test.ts test/company-key.test.ts test/investments.test.ts test/stocks-real.test.ts test/history-markets.test.ts test/invest-self-impact.test.ts test/invest-safety.test.ts test/invest-order-notice.test.ts test/talent-investing.test.ts test/plan-search-reads.test.ts test/release-182.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: buy the second listed class of a real company`.

### Task 8: Story test, docs and release notes

**Files:**
- Create: `test/share-classes-story.test.ts`
- Modify: `docs/ARCHITECTURE.md`: the Layout entry (line 91), the Boards bullet "Seats follow ownership..." (line 539), and a new bullet after "Your listed companies in Stocks" (ends at line 695).
- Modify: `docs/BUSINESS-AND-DYNASTIES.md`: one bullet.
- Create or modify: `docs/RELEASE-v2.8.0.md`: create it if the dividends work has not; otherwise add a "Share classes" section.

- [ ] **Step 1: Write the story test**, `it('a founder lists with founder shares, buys, recapitalizes and sells out')`, then `it('a real company's second class can be bought')`.
  1. A US founder's private company (the Phase 1 story's three years of 30e6 profit). Run the `ab` row (`biz.classes.<id>.ab`) from Capital & Ownership; `b.classes` is the plan. `ipoPreview` names the votes.
  2. `goPublic(g, a, b, 25)`. `ownerVotes(b)` is above 0.95. In Stocks the row is there, with the classes line and a votes line.
  3. Buy at the slider's `max`: `hi` is unchanged, `ownerVotes` rose by less than the naive amount, `controlsFor` still true, `investmentHoldings(g)` empty.
  4. Next year (`g.year += 1; g.character.age += 1; g.yearActions = {}; g.queue = []; yearlyBusinessImpl(g)`): the price is within 5% of 0.96 times the fundamental per share; the row still renders after `JSON.parse(JSON.stringify(g))`.
  5. Run the `single` row: the vote passes (seats are yours), `b.classes` is gone, the price rose about 4%, `seatPlan` is the single-class plan.
  6. Sell with `'100'` from the Stocks row: the company and its row are gone.
  7. A US game in 2020: the Alphabet screen shows `'Share classes:'`; buying the Class C line makes a holding; a year later it moved with the company.
- [ ] **Step 2: Run** `npx vitest run test/share-classes-story.test.ts`. Expected: PASS on the first run, since it only drives code from Tasks 1-7. If it fails, fix the owning task's code, not the test.
- [ ] **Step 3: Docs.**
  - **`ARCHITECTURE.md`, Layout:** list `business/share-classes.ts share-classes-menu.ts` (votes, price factor, choosing classes) and `invest/class-data.ts` (the classes real companies had).
  - **`ARCHITECTURE.md`, Boards:** change "owner seats ≈ share" to "owner seats ≈ votes (`share-classes.ownerVotes`; the same as the share with one class)".
  - **`ARCHITECTURE.md`, new bullet "Share classes":**
    - Economics are one pool (`BizState.share`). Votes are derived (`ownerVotes`) and read only by `seatPlan`; `test/control-sites.test.ts` lists every other place a share meets a half.
    - The record `{ kind, hi }`: what `hi` means, why market-bought shares are ordinary by default (D3), and the three writers that touch it (`diluteBusinessEquity`, the buyback, `sellShares`).
    - Classes act only while a standalone company is listed; a private record is the IPO plan; `detach` clears it.
    - Choosing: the Share Classes rows, the `'recap'` board proposal, the once-a-year key, the 4% and 7% factor in the IPO price, `updateSharePrice` and the recap.
    - Real companies: `invest/class-data.ts`, `companyKey`, lines inside the company's screen, `lineYear`, and why lines are not in `allQuotes`.
    - Anything that groups holdings by company (hedge funds, an advisor) must use `companyKey`.
  - **`BUSINESS-AND-DYNASTIES.md`:** one bullet: share classes change who runs the board, not who is paid.
- [ ] **Step 4: Release notes**, a "Share classes" section in `docs/RELEASE-v2.8.0.md` in the shape of `docs/RELEASE-v2.7.0.md`: **Your company**, **In Stocks**, **Real companies**, **Old saves**, **Not in this release**.
  - The figures: 10 votes against 1; the market pays 4% less for founder shares and 7% less for a non-voting float; one change a year with a board vote; 22 real companies; 14 second lines.
  - **Not in this release** lists the spec's section 11.
  - VOICE applies, with no em-dashes.
- [ ] **Step 5: Full verification.** `npm run typecheck`, `npm test` (all files), `node scripts/voice-report.mjs` and `npm run build`. Expected: all green. `voice-guards` still reports 24 or fewer em-dashes.
- [ ] **Step 6: Commit** `docs: share classes in Stocks; story test and release notes`, then push.

---

## Self-review

**Spec coverage**

| Spec item | Where it's covered |
|---|---|
| D1 votes derived, one choke point | Tasks 1, 2 (`seatPlan`, `control-sites`) |
| D2 two structures, one record | Task 1 |
| D3 `hi` and ordinary-by-default | Task 1 maths and dilution; Task 2 buyback, sale, buy, Buy Out Investors |
| D4 listed only; plan before; `detach` | Tasks 1 (`activeClasses`), 3 (`detach`, private plan) |
| D5 one choice, two places, `'recap'` vote | Tasks 3 (logic, kind) and 4 (rows, pushes) |
| D6 4% / 7% factor | Task 3 (IPO, `updateSharePrice`, recap, buy floor) |
| D7 one Stocks row, classes and votes lines | Task 4 |
| D8 curated table, facts, second lines | Tasks 5 and 7 |
| D9 `companyKey` | Task 6; used in 7 |
| D10 line price, moves, ends | Task 7 |
| D11 equal dividends | Not built: `payDividend` untouched. Noted in the release notes |
| Section 2 sketch check | Plan intro; Task 2 test; Task 6 tests |
| Section 5 data model | Task 1 |
| Section 6 determinism | Purity tests in Tasks 3, 4, 7 |
| Section 7 old saves | Task 1 (hostile), Task 2 and 3 (golden), Task 7 (reload) |
| Section 10 risks | Review Focus, with a pinning test each |

**Departures from the spec, each stated where it is made**
- `controlsWith`'s rule moves to `controlsFor` in `board-state.ts` (Task 2) so the new menu module can use it without a cycle through `rescue.ts`.
- The Capital & Ownership row is added in `manage.ts` (Task 4), not `rescue.ts`, for the same reason.
- `insiderPositions` is exported (Task 6) so its test can reach it.
- Roche and Novo Nordisk are left out of the first batch (Task 5): their structure was not confirmed. The spec's list of 24 is 22.

**Type consistency**

These names are spelled the same in every task that uses them: `ClassKind`, `ClassPlan`, `readClasses`, `CLASS_VOTES`, `CLASS_DISCOUNT`, `CLASS_MERIT`, `CLASS_PHRASE`, `activeClasses`, `ownerVotes`, `planFactor`, `classFactor`, `scaleFounders`, `clampFounders`, `afterIpo`, `votesAfterIpo`, `controlsFor`, `ipoPlanFor`, `ipoRetain`, `ClassChoice`, `CLASS_CHOICES`, `classesKey`, `currentChoice`, `classBlock`, `ClassOption`, `classOption`, `changeClasses`, `classesNode`, `ClassRow`, `ClassEntry`, `CLASS_ENTRIES`, `classRowsIn`, `votesText`, `classFacts`, `lineSpread`, `lineSecId`, `Line`, `linesOf`, `lineOpen`, `lineYear`, `LINE_SEP`, `companyKey`, `lineLetter`.

**Proportion**

The plan is about two thirds of Phase 1's, almost all of it test assertions and fixed player copy. The code that must be written is small: one maths module, one menu module, one data module, and edits of a few lines in about twelve files, with `investments.ts` the largest (Task 7).

**Known residual risk**

- Unit sizes are not modeled: Berkshire B trades near Class A's price here. Cosmetic.
- Family members hold the founders' class and executives the ordinary one, whatever the real grant was. An approximation that is conservative for the founder.
- A plan on a private company that later joins a group stays on the record, inert, until `detach` clears it.
- `nv` with a tiny stake keeps every vote. Counterweights: the 7% factor, the independents' veto on blatant self-dealing, and minority suits that grow with `1 - share`. A cap on the vote lead is the knob if play shows it.
- A class row's years are approximate public knowledge, like the rest of the registry. A wrong year changes which years show a line, nothing else.
- Hedge-fund and advisor work that groups holdings by company must call `companyKey`; nothing enforces it until they do.
