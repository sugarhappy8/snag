# R2 plan, Wave 0: the text codemod and the one seed rebaseline (track `wave0`)

Base: `release/v5.0.0` at a65349a (v4.1.1, `git rev-parse --short HEAD` must print it before R2-A1 starts). Code read at that commit; nothing was edited except this file. Every path marked "modify" exists today; "create" paths do not. All text below uses plain hyphens (no U+2014, no U+2013).

Wave 0 lands first and alone, before Ledger-world, Kernel, Save and Platform branch. It does two things: it moves prose picks onto the text kit (E.T3, the codemod half), then it moves every text draw off `g.rng` onto a named stream (the one global seed rebaseline, design 13.3 and decision D7). Nothing else in R2 may shift a seeded run.

## 1. Track summary

**Items covered (6 tasks).** E.T3 codemod (R2-A1 parity kit and base fixture, R2-A2 the script and the kit hooks, R2-A3 apply, route `eraPick` and `v`, prove parity); K.3 streams half (R2-B1 `src/game/kernel/streams.ts`, `kernel/forks.ts`, `test/seed-kit.ts`, the world-RNG guard, the pin ratchet); the rebaseline (R2-B2 the text stream, flavor, re-recorded goldens); the fix-up recipe (R2-C).

**Not in this track.** The registry and bus (Kernel track K.3), ids and ledger (Ledger-world), slices and chunking (Save), `test/golden-kit.ts` (Platform K.7b), state lines, the composer and family pacing (E.T4, E.T5), the 13-life repetition probe (Platform E.T2). Wave 0 does not touch `g.world`, the ledger, the save schema or any menu.

**Line budget.**

| Task | Source lines | Test lines | Notes |
|---|---|---|---|
| R2-A1 | 0 | about 540 | plus `test/fixtures/r2-parity.json` (about 55 KB); two additive hunks in `test/play-kit.ts`, `test/probe-life.ts` |
| R2-A2 | about 610 (script 480, `.d.mts` 45, `pick.ts` 85) | about 440 | no `src` file outside `src/game/text/pick.ts` changes |
| R2-A3 | about 970 changed lines in 107 files (generated) plus 21 by hand | about 480 | the only task with a wide diff |
| R2-B1 | about 170 net (streams 120, forks 50, `timeMachine.ts` minus 45 plus 5) | about 720 | seed kit 90 and guards count as tests |
| R2-B2 | about 245 | about 500 | plus docs `docs/STREAMS.md` (about 55) and three re-recorded fixtures |
| R2-C | root-cause fixes only | edits in about 15 files | recipe in task C |

Wave total: about 2,000 source lines (about 1,000 generated) and about 2,700 test lines, 6 tasks, about 12 agent-hours at 4.1 per 1,000 source lines plus the loops in R2-A3 and R2-C. Nothing here approaches the 1,100-line cap except R2-A3, whose diff is mechanical (one-token edits).

**Acceptance criteria owned (from the R2 block of the roadmap, lines 185-212).**
- "One extra draw on a named stream changes only that slice" (text half): R2-B2 `test/r2-text-isolation.test.ts` (one extra text draw at the start of every year for 20 years changes no `g.rng` value and no non-text slice, for 4 lives). `stream()` itself never touches `g.rng`: R2-B1.
- "Replay, reload and a Time Machine fork give identical JSON" (text half): R2-B2 `test/text-draw.test.ts`.
- "119 pinned seed tests move to `findSeed(pred)`": R2-B1 provides the kit and a ratchet that forbids new pins; R2-C moves the files that CI shows (measured estimate: 16 files moved by new draws plus 3 by design, not 119, see 1.4).
- "A written list of every seeded test that moved and why": R2-C `moved-seeds.md`.
- Guard: new world modules never draw `g.rng`: R2-B1 `test/world-streams.test.ts`.
- "The repeated-line rate of E.T2's 13-life probe is at most half of R1's": not proven here (the 13-life probe is Platform E.T2). R2-B2 records the 4-life harness into `test/fixtures/text-baseline-r2.json` and prints the ratio to the R1 baseline; the lead decides the gate.

### 1.1 Facts verified at a65349a (all by grep or by reading; the lead's numbers in brackets)

| Fact | Measured | Where |
|---|---|---|
| `pick(g,` call sites (token scan, so a call split over two lines counts) | 1,348 in 130 files (lead 1,350 in 165 files; a plain `grep -c` of the text `pick(g` finds 1,277 because it misses split calls) | `src/game/**` only, none in `src/ui` |
| inline `pick(g, [...])` | 822 (lead 785, a line count) | |
| `pick(g, CONST)` where CONST is a module-level array | 168 (lead 168); 158 are all strings | |
| other `pick(g, X)` arguments | 163 other identifiers (function-local pools and computed lists), 102 member lists (`x.names`), 14 imported lists, 6 `eraLines(...)` results | stay `pick` |
| `pick(` sites whose first argument is not named `g` | 14 (`gg` in `prison.ts`, `gamestudio.ts`, `music.ts`, `sports-*.ts`; `g2` in `relationships.ts:3262`), 9 of them inline prose pools; the codemod takes any bare identifier as the state argument (rule 1), so they convert too | grep for `pick(` with a first argument other than `g` |
| `eraPick(` sites / `v(g,` sites | 77 / 45 (lead 77 / 45); of the inline-array ones, 16 `eraPick` and 29 `v` sites, of which 2 and 2 carry `${}` holes | `events/era.ts:110`, `events/helpers.ts:223` |
| pool strings that land in state | a `pick`, `eraPick` or `v` result is stored on a `Person`, an `Asset`, a condition, a company or a flag at sites the receiver list cannot see: `love.ts:296` (`RICH_JOBS`), `activities/movies.ts:164` (film titles), `relationships.ts:2661` (`MOVIES`), `careers.ts:1407` (`FIRE_REASONS`), `events/wealth-kids.ts:723` and `wealth-menu.ts:603` (business ideas), `special/social.ts:748` (`DEV_CURSES`, a condition name) and `:1194` (`CELEBS`, stored in `celebFollowers`) | read; why rule 4b, the helper review in R2-A3 and the dynamic filter all exist |
| production callers of the kit's `pickLine` | none (lead says 5): the only `pickLine(` in `src/` is a local hash helper in `business/nepo-asks.ts:269`; the kit is called by `test/text-pick.test.ts` and `test/notice-acceptance.test.ts` only | grep |
| prose pools the codemod converts | 801 sites in 107 files: 431 inline static, 263 inline with `${}` holes, 107 module consts; 31 more are held back by the identity-receiver list; 73 single-word pools and 70 non-string arrays stay | prototype in the scratchpad, rule in R2-A2 |
| `seed: <digits>` pins in `test/` | 183 lines in 68 files with `\bseed:\s*\d+` (the lead's figure; a spaced `seed: ` search finds 182 in 67 because `test/npc-dynasty-overhaul.test.ts:224` writes `{seed:808,...}` without a space). `makeTestGame(<digits>` (588 lines) and `const seed = <digits>` (529) are not counted by the ratchet and are not pins in the lead's sense | |
| test files | 488 (the lead's 389 is the v4.0.2 figure) | |
| `g.rng` draw sites in `nation/*` | 57 in 7 files; `business/competition-events.ts` 12 | |
| `uid(g` call sites | 69; `log()` and `notice()` both call it (`core.ts:446`, `:509`, `:531`) | |

### 1.2 Decisions

**D1. The text stream is counter based, keyed by life, year and outcome tag, with its cursor in `flags.textMem.c`.**
`textRand(g)` returns `textUnit(g, g.year, n)` (kernel/streams.ts: `streamUnit` of the key `lifeId + outcomeTag(g, year)`, tag `text`, `year`) where `n` is the number of text draws already made this year. The keyed stream lives in `kernel/streams.ts` as the lead specified; only the cursor lives in the text kit, because it is stored in `flags.textMem`, which the kernel may not import. The cursor is one validated string `'<year>,<count>'` in `flags.textMem.c` (the memory already lives in `flags.textMem`, is classified personal in `src/game/world-flags.ts:104`, is reset for heirs, and is bounded). The count restarts at 0 when `g.year` changes, so a yearly step is idempotent by its year stamp. Keying by `lifeId` (not the family seed) gives every generation its own text luck; keying by `outcomeTag` (`timeMachine.ts:193`, a Time Machine jump re-rolls the year it jumped to) makes a rerolled year read different lines; reload and replay are identical because the cursor is in the saved state. Why not a sequential PRNG with a saved state: a counter makes "the n-th text draw of year Y" a pure function, which the tests pin.

**D2. `nation/*` and `business/competition-events.ts` do NOT move to named streams in this rebaseline.** Read: all 57 draws in `nation/*` are the outcomes of the player's own office (coups, prosecutions, votes, purges in `consequences.ts`, `regime.ts`, `govern.ts`, `graft.ts`, `drama.ts`, `menu.ts`); the one yearly draw is `yearly.ts:303` (the player's own party). The 12 draws in `competition-events.ts` resolve the player's company decisions (bids, lawsuits, lobbying). They are player-linked luck, which belongs on the player stream. Moving them needs an entity id and a year per draw, a cursor where one entity rolls twice a year, and a fresh pin audit of every `nation` and `competition` test, for no wave-0 benefit. The autonomous world steps of R7 (wars) are built on `stream()` from scratch. The rebaseline therefore stays text only: this keeps wave 0 explainable ("g.rng lost the text draws").

**D3. A pool of one line draws nothing after R2-B2** (it draws once before, in R2-A2, to keep `g.rng` parity). No choice exists to make; skipping the draw writes nothing to `flags` and keeps `eraPick` over an era-filtered list from moving the cursor by how many lines survive the filter.

**D4. `pickSite(g, lines, site: number)` names a pool by a numeric site key.** Pools with `${}` holes change content at run time, so `poolHash(lines)` would give a new memory key per value and flood the 300-pool memory. The codemod writes a stable number (FNV of file path plus the array's source text) as the third argument. It is a number, not a string, for two reasons: the voice report would count a key string as a text unit, and `pickLine`'s `fam` argument also notes a family (`pick.ts:49-62` calls `noteFamily` for named pools), which would flood the 120-family memory that E.T5 needs for events. `pickSite` never notes a family.

**D5. Flavor becomes fully text-side.** `addFlavorLines` (`flavor.ts:609`) draws today with `chance`, `randInt`, `shuffle` and `pick` from `g.rng` (imports at `flavor.ts:5`; the draw sites are on 15 lines: 428, 450, 455, 460, 467, 472, 477, 479, 489, 494, 516, 600, 613, 624 and 652). R2-B2 moves all of them to the text stream, including the four helpers it calls that draw (`showName` `era.ts:308`, `radioShow` `era.ts:314`, `localPick` `locales.ts:177`, `localSoftDrink` `locales.ts:241`; each draws only through `pick`, none goes through `fillLocal`), which get an optional trailing `draw: Picker` argument. Everything else `addFlavorLines` calls (`kidPrize`, `movieKind`, `playSport`, `eraFlavorPools`, `anachronistic`, `mother`, `father`, `peopleBy`) was read and draws nothing. Three leaks are closed on purpose: (a) the toddler milestone `chance` (`flavor.ts:600`) decides the age written to `flags.milestonesLogged` (a cache flag, `world-flags.ts:69`, but one the isolation test compares), so it must use a keyed stream (`outcomeStream(g, 'flavor.milestone', g.year, m.id)`), not the cursor; (b) every `log()` consumes `uid(g, 'l')` (`core.ts:446`), so a text draw that changes how many flavor lines print would shift `g.nextId` and every later id, and ids feed hashed picks (40 `seeded(...id...)` sites). Flavor lines therefore take a text-side id (`log(g, text, tone, id?)`, one optional parameter, id from `textLineId(g)`), so the flavor count never moves `nextId`; (c) the first-word milestone line draws `pick(g, FIRST_WORDS)` inside `MILESTONES[0].line` (`flavor.ts:428`), a `g.rng` draw the helper list above does not name; `FIRST_WORDS` is single words, so A3 leaves it on `pick`, and B2 gives `line` the text picker (`line: (g, t: TextRng) => ...`, `logMilestones(g, t)`); without it the "flavor draws no `g.rng`" test fails at age 1 or 2.

**D6. The three fork readers move to `kernel/forks.ts`** (`timelineForks`, `forkTag`, `timelineTag`, `outcomeTag`, plus `TimelineFork` and `FORKS_FLAG`), and `timeMachine.ts` re-exports them, so the 33 files that import from `timeMachine.ts` keep working and the kernel stays a leaf (`timeMachine.ts` imports `./core`). `timelineForks` gains a cap (the newest 128 forks), because it runs on every text draw and today has none.

**D7. The proof has three layers.** (1) A one-shot fixture recorded at the unmodified base: `g.rng` and ten non-text slice digests for 12 lives, every year (R2-A1). It must hold unchanged after R2-A3 (the codemod moved no draw). (2) A standing isolation test: the same lives played with `pickLine` forced to behave as plain `pick` and again forced to return the next line, must agree on `g.rng` and every non-text slice (R2-A3). This is mutation testing for text sinks: a converted site whose string flows into state shows on its first call, not only when memory happens to exclude a line. (3) After R2-B2, an extra text draw every year changes nothing but text. The fixture is re-recorded once in R2-B2 under the new rule (the legitimate pinned-number change, reason in the commit message) and from then on it is a canary: a track that moves it by accident has reordered or added a draw.

**D8. `pickLine` becomes generic over the element type, `pickLine<T>(g, lines: readonly T[] & readonly string[], fam?): T`,** so a converted site infers exactly the type `pick<T>` gave it: `string` for an inline pool, the literal union for an `as const` pool (a plain `string` return would break an `as const` pool whose result indexes a record). Do not write `<T extends string>`: the constraint makes TypeScript keep literals, so `let line = pickLine(g, ['a b', 'c d']); line = 'e f'` and `pickLine(g, ['a b', 'c d']) === 'e f'` stop compiling (checked with the repo's tsc; the intersection form compiles both). The `& readonly string[]` half only restricts the argument; `T` is inferred from the first half, and `lines[index]` is a `T & string`, so the body needs no cast. `test/text-pick-site.test.ts` pins both inferences as compile-time cases (tsc checks `test/`).

**D9. The voice tooling keys on the callee name.** `scripts/voice/units.mjs:82` is `const PICKERS = new Set(['pick', 'v'])`; a call in that set is "transparent", so its strings keep the context of the argument it sits in. R2-A3 adds `pickLine` and `pickSite`; without it every converted string moves out of its role and the voice report numbers change.

**D10. Reverted sites are remembered.** `scripts/codemod-pickline-skip.json` lists sites that must stay `pick` (identity strings), each with a reason. A fast test (`test/r2-pickline-ratchet.test.ts`) runs the codemod in dry-run over `src/` and fails on any prose pool still written with `pick` that is not on the list, so the repetition fix survives later tracks. This also gives every later track a one-line rule: prose pool, `pickLine`; identity pool, `pick`.

### 1.3 Hot files (every edit is a small, separate hunk)

| File | Task | How |
|---|---|---|
| `src/game/text/pick.ts` (62 lines) | R2-A2, R2-B2 | A2: generic signature, `pickSite`, `PickMode` hook (hunk at lines 49-62 plus new exports); B2: the draw line becomes `textRand(g)` and moves after the one-line early return |
| `src/game/text/memory.ts` (207 lines) | R2-B2 | `TextMem.c?: string` (type at line 29), `clean()` at line 102 keeps a valid `c`, `writableTextMem` at line 125 gets the validity cache |
| `src/game/events/era.ts` | R2-A3, R2-B2 | A3: `eraPick` body at lines 110-116 plus `eraPickPlain`; B2: `showName` (308), `radioShow` (314) take an optional picker |
| `src/game/events/helpers.ts` | R2-A3 | `v()` at lines 223-235 routes string lists through `pickLine`; `vPlain` only if the attribution names a site |
| `src/game/events/flavor.ts` | R2-B2 | import line 5, `tokens` (442-515), `localizeLine` (505), `logMilestones` (592-607), `addFlavorLines` (609-647), `weightedPool` (649-657) |
| `src/game/data/locales.ts` | R2-B2 | `localPick` (177) and `localSoftDrink` (241) take an optional picker |
| `src/game/rng.ts` | R2-B2 | one type, `Picker`, after `pick` (line 36) |
| `src/game/core.ts` | R2-B2 | `log()` at line 443 takes an optional id |
| `src/game/timeMachine.ts` | R2-B1 | the block at lines 139-195 minus `addFork` moves to `kernel/forks.ts`; re-exports added |
| `scripts/voice/units.mjs` | R2-A3 | one line, 82 |
| 107 files with prose picks | R2-A3 | one-token edits plus one import line each |
| `test/play-kit.ts` (224), `test/probe-life.ts` (80) | R2-A1 | additive optional `onYear` |
| `test/text-pick.test.ts`, `test/notice-acceptance.test.ts`, `test/flavor-memory.test.ts`, `test/text-kit.test.ts` | R2-A3, R2-B2 | the by-design rewrites listed in R2-A3 and R2-B2 |
| `test/fixtures/r2-parity.json` | R2-A1 (record), R2-B2 (re-record) | |

### 1.4 Order, schedule and the moved-test estimate

Order: R2-A1, then R2-A2, then R2-A3. R2-B1 shares no file with A1 to A3 (it only creates files and edits `timeMachine.ts`), so it may run beside A2. R2-B2 needs A3 and B1. R2-C starts from the first CI run of B2. The only commit that moves `g.rng` is R2-B2; A1 to A3 and B1 are proven draw neutral. The machine runs at most 3 test-running agents: the heavy files are `test/r2-codemod-parity.test.ts` (about 90 s) and `test/r2-text-isolation.test.ts` (about 3 minutes); run each alone through `vt`.

**Moved tests, measured.** I built a scratch copy of the tree outside the repo (it is deleted; only the result files remain, in `/private/tmp/claude-501/-Users-saeed-projects-anotherlife/4e69034a-0731-4cd1-a642-90b0c46bf54d/scratchpad/wave0-experiment-results/`), applied a prototype of A3 and B2 (801 sites renamed, `eraPick`, `v()` and flavor drawing from a hash stream with a cursor, `pickLine` skipping the draw for one-line pools), and ran, through `vt` in three runs of about ten minutes each (a one-time planning measurement that the implementers must not repeat; it is a large part of the suite, so it was done once, on purpose), the 234 test files that pin a seed or play the yearly loop, plus 161 more that mention `createNewLife`, `ageUp` or `seed` (the five slowest files were not run). Of those 395 files (93 further files mention neither seeds nor the loop and cannot move), 19 had a red test, 38 tests in all: 3 files by design (17 tests that encode the old rule: `text-pick` 6, `notice-acceptance` 10, `flavor-memory` 1) and 16 files moved by the new draws (21 tests), one of those a latent text defect that a new life reached. Three more red files were artifacts of the scratch copy (the experiment's own cursor flag was unclassified in `world-flags`, and `docs/` was not copied for two doc tests) and are not counted. So the roadmap's "119 pinned seed tests move" is a large over-estimate: most pinned seeds feed invariant assertions that hold for any life. Expect about 19 red files on the first CI run, plus whatever the five unmeasured slow files add.

The files are in the table of task R2-C ("Expected files", with the kind of fix). The experiment is an approximation: it did not move the four flavor helpers, it left flavor ids on `uid`, and it had no identity list, so the real B2 shifts slightly more (ids feed hashed picks) and A3's identity list keeps 31 sites on `pick` (slightly less). Treat the table as a lower bound for the first CI run and the oracle as CI.

### 1.5 Lead actions (none can be done by an implementer)

1. Before R2-A1: confirm `git rev-parse --short HEAD` is a65349a on `release/v5.0.0` and that nothing else has merged. The base fixture records this tree.
2. After R2-A3 and R2-B1 are merged and before R2-B2: nothing to do, but note R2-B2's PR is the rebaseline: it must be reviewed as such (the one commit where every seeded run shifts).
3. After R2-B2: push, let CI run once, paste the failing file list into R2-C's agents (split by the batches in task R2-C), and run the five slowest files first (`simulate`, `era-features`, `main-character-life`, `sector-story`, `anachronism`): they were not measured here, and a neighbour (`era-features-more`) already showed a real text defect once a new life reached it.
4. After CI is green: refresh `scripts/test-timings.json` (new test files weigh `DEFAULT_SECONDS` until then) and announce the wave-0 merge commit to the four track agents as their branch point.
5. Decide the two open questions in 1.6 before R2-B1 starts.
6. After R2-B2 is green: run `/Users/saeed/projects/anotherlife/wt/bin/vb` once, then `node scripts/bundle-budget.mjs`. Wave 0 adds a few KB gzip to the initial bundle (the 263 numeric site keys are the largest part, then the kernel and the text stream), and `scripts/bundle-baseline.json` allows 60,000 bytes over v4.0.3, of which R1 already spent some. No task in this wave builds; if the printed delta is within 5,000 bytes of the limit, raise it before the other tracks merge.

### 1.6 Open questions

1. Should `uid(g` also be forbidden in `world/**` and `modules/**`? Entity ids are meant to come from `kernel/ids.ts` (Ledger-world A.K2), which does not exist yet; the guard bans `uid` only in `kernel/**` for now. Default: yes in `kernel/**`, revisit when A.K2 lands.
2. May Platform K.7b replace the `r2-parity.json` canary with its golden digests? Default: yes, if it ports the 12 lives and the same slice names (R2-A1 uses `rng, meta, character, people, assets, counters, economy, flagsWorld, flagsPersonal, flagsCache, queue, text`, which are K.7b's names plus `meta`, `counters`, `flagsCache`, `queue`).
3. The 31 identity-listed sites (and the few `decision` sites and extra receivers of rules 4 and 4b) and the 163 other-identifier pools, 102 member lists, 14 imported lists and 6 `eraLines` pools stay `pick` in wave 0. `scripts/codemod-pickline.mjs --report` lists them for E.T5.

### 1.7 Reconciliation notes for the cross-check (read against the four sibling plans in this folder)

1. **Platform R2-P3 (stream tap).** `platform.md` lines 78-84 and 268-296 wrap the exports of `kernel/streams.ts` and expect each to return a PRNG that the tap advances once. The text stream here is a number-returning `textUnit(g, year, n)` in `kernel/streams.ts` plus the cursor function `textRand(g)` in `src/game/text/draw.ts`. The tap should wrap `textRand` (module `src/game/text/draw`, tag `text`, year `g.year`; one extra call is one extra text draw) or call `skipTextDraws(g, year, 1)`, which R2-B2 exports for exactly this. R2-P3's own fallback ("add a row if wave 0 exports a dedicated text stream function") covers it.
2. **`onYear`.** Platform R2-P2 adds the same optional `onYear(g, yearsPlayed)` to `test/play-kit.ts` and `test/probe-life.ts`. R2-A1 adds it first with that exact signature; Platform must reuse it, not add a second.
3. **The `text` slice.** Platform's `text` slice (`platform.md` line 131) also holds every flag classified `cache`; R2-A1's `text` does not (`flagsCache` is compared). Mine is the stricter test, which is why wave 0's milestone roll uses a keyed stream (D5a). Neither definition needs to change; the two canaries are independent.
4. **`timeMachine.ts` line numbers.** After R2-B1 the block at lines 139-195 is gone: `arriveInPast` moves from line 226 to about 186 (the budget table says minus 45 plus 5; Save cites 226 in `save.md` lines 42 and 520); `stopOf` (line 38) does not move.
5. **Shared test files.** R2-C edits `test/time-machine.test.ts` and `test/probe-life.test.ts` (kind `seed`); Save edits both as well (`save.md` lines 536 and 574). Wave 0 lands first, so Save rebases onto the `findSeed` version.
6. **`hashKey` and `hashString`.** `kernel/streams.ts` has its own `hashKey` (same function as `assets.ts:148`). The Kernel plan does not move `seeded` into `kernel/`: its cut 11 (`kernel.md` row 11, near line 440, and open question 5 near line 923) appends `SRng`, a private `hashString` and `seeded` to the end of `src/game/rng.ts`, which is L0 and outside the world-RNG guard (the guard would trip on `seeded`'s `chance` and `pick` methods). So `streams.ts` keeps its own `hashKey` for good; nothing to change here.
7. **Layers.** `kernel/streams.ts` and `kernel/forks.ts` import only `../rng` (`nextRandom`), `import type` from `../types`, and each other, which is what the Kernel plan expects of wave 0 (`kernel.md` near line 361: "expect wave 0's `streams.ts` to import only `../types`, `../rng` and kernel files; if it does not, stop and report it") and what `ledger-world.md` declares for its own L0 files (lines 118 and 126). `text/draw.ts` (L-text) is allowed to import the kernel; the kernel never imports `text/`.
8. **Sibling line numbers drift.** Every `kernel.md`, `ledger-world.md`, `platform.md` and `save.md` line cited in this section was read at the time of the check (`platform.md` 78-84, 131, 180 and 268-296; `save.md` 42 and 520 for `arriveInPast`, 536 and 574 for the shared tests); re-find them by their text, not by number, once those files change.

## 2. Cross-track contracts

**Provided by wave 0 (other tracks may rely on these exact names).**

| Provided | By | Used by |
|---|---|---|
| `src/game/kernel/streams.ts`: `worldSeed`, `hashKey`, `streamKey`, `stream`, `outcomeStream`, `streamUnit`, `textStreamKey`, `textUnit`, `STREAM_TAG` (signatures below) | R2-B1 | every track with a world step: Ledger-world A.K2 (`worldShard`), Kernel K.3 (registry phases), Save, R3 to R11 modules. `stream` is the only allowed source of world luck |
| `src/game/kernel/forks.ts`: `TimelineFork`, `FORKS_FLAG`, `timelineForks`, `forkTag`, `timelineTag`, `outcomeTag` (re-exported by `timeMachine.ts`) | R2-B1 | Kernel track (leaf imports), anyone needing a Time Machine aware key |
| `src/game/text/pick.ts`: `pickLine<T>`, `pickSite<T>` (both over `readonly T[] & readonly string[]`, see D8), `PickMode`, `PickCall`, `setPickHook`, `withPickMode` | R2-A2 | every track writing prose pools (use `pickLine`); tests (`withPickMode`) |
| `src/game/text/draw.ts`: `textRand`, `textRng`, `textCursor`, `textLineId`, `skipTextDraws`, `TextRng` | R2-B2 | flavor, later composer (E.T4), Platform's stream tap |
| `TextMem.c?: string` (cursor `'year,count'`), `writableTextMem` validity cache | R2-B2 | Save track: the slice `text` reads `flags.textMem` whole; `c` is inside it |
| `src/game/rng.ts`: `type Picker` | R2-B2 | helpers that take a draw function |
| `log(g, text, tone?, id?)` | R2-B2 | nobody else needs it; text-side ids are for lines whose count depends on text |
| `test/seed-kit.ts`: `findSeed`, `findSeeds`, `SeedSearch`, `SeedSearchError` | R2-B1 | every track's tests; R2-C |
| `test/seed-pins.test.ts` ratchet and `test/seed-pins-baseline.json` | R2-B1 | no new `seed: <digits>` pin in any test file; tracks use `findSeed` |
| `test/world-streams.test.ts` guard and the pragma `// rng-ok: <reason of 12 or more characters>` | R2-B1 | a world step file may not call `rand`, `randInt`, `randFloat`, `chance`, `pick`, `weightedPick`, `shuffle`, `bell`, read `.rng`, or use `Math.random` or `Date`. Guarded: `src/game/kernel/**`, `src/game/world/**`, `src/game/modules/**`, any file containing `registerModule(`, any file whose first 10 lines contain `// world-step`. A player-linked roll inside such a file carries the pragma on its own or the previous line |
| `test/r2-parity-kit.ts`: `PARITY_SLICES`, `ParitySlice`, `parityDigests`, `PARITY_LIVES`, `traceLife`, `compareTraces`, `bisectOffenders` | R2-A1, A3 | Platform K.7b may build `sliceDigests` on `parityDigests` |
| `test/fixtures/r2-parity.json` canary and `R2_PARITY_RECORD` | R2-A1, B2 | every track (a moved canary is a reordered or added draw) |
| `scripts/codemod-pickline.mjs`, `scripts/codemod-pickline-skip.json`, `test/r2-pickline-ratchet.test.ts` | R2-A2, A3 | E.T5: new prose pools use `pickLine`; identity pools stay `pick` with a skip entry |
| `docs/STREAMS.md` | R2-B2 | track agents: tags, the pragma, the pick rule |

**Exact signatures.**

```ts
// src/game/kernel/streams.ts  (L0 leaf: imports `nextRandom` from '../rng', `import type` from '../types', './forks')
export const STREAM_TAG: RegExp                                    // /^[a-z][a-z0-9._-]{0,31}$/
export function worldSeed(g: Pick<GameState, 'lifeId'>): string    // (lifeId || 'life') without a '-g<digits>' suffix; the familySeed idea of special/kit/rivals.ts:70
export function hashKey(key: string): number                       // FNV-1a over UTF-16 code units, int32
export function streamKey(seed: string, tag: string, year: number, id?: string | number): string   // joined with U+001F
export function stream(g: Pick<GameState, 'lifeId'>, tag: string, year: number, id?: string | number): () => number
export function outcomeStream(g: Pick<GameState, 'lifeId' | 'flags'>, tag: string, year: number, id?: string | number): () => number
export function streamUnit(key: string, n: number): number          // the n-th value of the stream named by `key`, pure, in [0, 1)
export function textStreamKey(g: Pick<GameState, 'lifeId' | 'flags'>, year: number): string   // streamKey(lifeId + outcomeTag(g, year), 'text', year)
export function textUnit(g: Pick<GameState, 'lifeId' | 'flags'>, year: number, n: number): number   // streamUnit(textStreamKey(g, year), n): the text stream (the cursor that picks n lives in text/draw.ts)
```

`stream` is stateless: two calls with the same arguments return two generators that give the same sequence, and it never reads or writes `g.rng`, `g.nextId` or any flag. It throws `Error('stream: bad tag')` when `tag` does not match `STREAM_TAG`. `outcomeStream` appends `outcomeTag(g, year)` to the id, so a Time Machine jump re-rolls the year, exactly as `outcomeTag` does for the older hash helpers (`seeded` `assets.ts:157`, `seededStream` `cv.ts:90`, `stableRoll` `special/common.ts:102`, `economicRoll` `economy/model.ts:211`, which stay as they are).

```ts
// src/game/kernel/forks.ts  (moved from timeMachine.ts:139-195 without addFork and FORK_MARK, plus the cap; FORKS_FLAG becomes exported,
// timelineTag widens its parameter from GameState to Pick<GameState, 'flags'>, and the file declares its own private isObj, because the
// original at timeMachine.ts:51 stays for jumpsUsed)
export interface TimelineFork { year: number; salt: string }
export const FORKS_FLAG = 'timelineForks'
export function timelineForks(g: Pick<GameState, 'flags'>): TimelineFork[]      // newest 128 only
export function forkTag(forks: readonly TimelineFork[], year: number): string
export function timelineTag(g: Pick<GameState, 'flags'>, year: number): string
export function outcomeTag(g: Pick<GameState, 'flags'>, year: number): string
```

```ts
// src/game/text/pick.ts
export type PickMode = 'memory' | 'plain' | 'rotate'
export interface PickCall { index: number; key: string; n: number }
export function setPickHook(hook: ((call: PickCall) => PickMode | undefined) | null): void   // resets the call counter
export function withPickMode<T>(mode: PickMode, fn: () => T): T                            // restores in a finally block
export function pickLine<T>(g: GameState, lines: readonly T[] & readonly string[], fam?: string): T
export function pickSite<T>(g: GameState, lines: readonly T[] & readonly string[], site: number): T   // key 's' + 8 hex digits, never a family

// src/game/text/draw.ts  (R2-B2)
export function textRand(g: GameState): number                      // next text-stream value; advances flags.textMem.c
export function textCursor(g: GameState): { year: number; n: number }   // pure read of the cursor for g.year
export function textLineId(g: GameState): string                    // 't<year>.<n>', consumes one text draw
export function skipTextDraws(g: GameState, year: number, n: number): void   // test aid: start `year` with the cursor at n
export interface TextRng { next(): number; int(min: number, max: number): number; chance(p: number): boolean; pick<T>(items: readonly T[]): T; shuffle<T>(items: readonly T[]): T[] }
export function textRng(g: GameState): TextRng

// src/game/rng.ts
export type Picker = <T>(g: GameState, items: readonly T[]) => T
```

```ts
// test/seed-kit.ts
export interface SeedSearch { from?: number; tries?: number; label?: string }     // defaults: from 1, tries 200
export class SeedSearchError extends Error {}
export function findSeed(pred: (seed: number) => boolean, opts?: SeedSearch): number
export function findSeeds(pred: (seed: number) => boolean, count: number, opts?: SeedSearch): number[]
```

**Relied on by this track (R1 and the lead).**
- The R1 text kit as it stands: `src/game/text/{pick,memory,hash,registry,index}.ts`, `TEXT_MEM_LIMITS`, `writableTextMem`, `ringRead`, `ringWrite`, and its tests (`test/text-pick.test.ts`, `text-memory.test.ts`, `text-hash.test.ts`, `text-kit.test.ts`, `notice-acceptance.test.ts`, `flavor-memory.test.ts`).
- `scripts/voice/lexer.mjs` (`lex`, token fields `p`, `e`, `td`, `nExpr`, `parts`), `test/scan-kit.ts` (`loadSources`, `toSource`, `isId`, `isPunct`, `closeParen`, `splitArgs`).
- `test/play-kit.ts` `playLife` (line 203) and `test/probe-life.ts` `probeLife` (line 33), `src/game/world-flags.ts` `classifyFlag`.
- The lead's merge order: this wave first and alone.

## 3. Tasks

Conventions for every task: tests first (red), then the change, then `/Users/saeed/projects/anotherlife/wt/bin/tc` (typecheck, from the worktree root) and `/Users/saeed/projects/anotherlife/wt/bin/vt <files>` (never the full suite, never `npm install`). Commits use explicit paths (never `git add -A` or `git add .`) and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New test files whose first line is `// ci: fast` run in the fast job; the two slow files are left to the shards. No new `seed: <digits>` pin (R2-B1's ratchet), so new fixed lives are written as tuples.

---

### R2-A1 The parity kit and the base fixture (no `src` change)

**Goal.** Record, at the unmodified code, `g.rng` and a digest of every non-text slice after every year of 12 lives, and a test that replays the lives and compares. This is the "before" of the codemod. The recorder is a mode of the test, not a separate script (precedent: `FLAVOR_GOLDEN=1` in `test/flavor-memory.test.ts`, `TEXT_KIT_RECORD=1` in `test/text-kit.test.ts`), so it runs under the same transform as the tests.

**Items covered.** E.T3 step 0 (parity fixture), D7 layer 1.

**Files.**
- Create: `test/r2-parity-kit.ts` (no vitest import: it may later run as a bundled script, like `test/play-kit.ts`), `test/r2-parity-kit.test.ts` (first line `// ci: fast`, synthetic states only), `test/r2-codemod-parity.test.ts` (the 12 lives, slow), `test/fixtures/r2-parity.json`.
- Modify: `test/play-kit.ts` (`PlayOptions` at line 22: add `onYear`; `playLife` at line 203: call it after each `play()`), `test/probe-life.ts` (`ProbeOptions` at line 17; the loop of `probeLife` at line 33: call it with 0 before the loop and after each `ageUp(g)`). Platform's R2-P2 plans the same optional `onYear` with the same signature (`platform.md` line 180); wave 0 lands first, so Platform finds the hunk in place and must not add a second one.

**Interfaces.**

```ts
// test/play-kit.ts
export interface PlayOptions { /* existing */ onYear?: (g: GameState, yearsPlayed: number) => void }   // 0 after birth, then 1, 2, ... after each year's popups are answered
// test/probe-life.ts
export interface ProbeOptions { /* existing */ onYear?: (g: GameState, yearsPlayed: number) => void }   // 0 before the first year, then 1, 2, ... after each ageUp

// test/r2-parity-kit.ts
export const PARITY_SLICES = ['rng', 'meta', 'character', 'people', 'assets', 'counters', 'economy', 'flagsWorld', 'flagsPersonal', 'flagsCache', 'queue'] as const
export type ParitySlice = (typeof PARITY_SLICES)[number]
export type ParityDigests = Record<ParitySlice | 'text', string>        // eight lowercase hex digits each
export function parityDigests(g: GameState): ParityDigests
export interface ParityLife { id: string; kind: 'birth' | 'founder'; seed: number; birthYear: number; untilAge?: number; rich?: boolean; businesses?: number; years?: number }
export const PARITY_LIVES: readonly ParityLife[]                       // 12, built from tuples so the seed-pin ratchet does not count them
export interface ParityTrace { id: string; years: string[][] }         // per year: PARITY_SLICES digests in order, then 'text'
export function traceLife(life: ParityLife): ParityTrace
export interface Divergence { life: string; year: number; slices: ParitySlice[] }
export function compareTraces(a: readonly ParityTrace[], b: readonly ParityTrace[]): Divergence[]   // 'text' is never compared; lists of different shape throw
export interface ParityFixture { v: 1; source: string; slices: string[]; lives: ParityTrace[] }
```

**What `parityDigests` hashes** (shallow projections, then a canonical JSON with sorted keys, non-finite numbers written as strings, `undefined` skipped, then `fnv1a` from `src/game/text/hash.ts`):
- `rng`: `g.rng`. `meta`: `version, year, generation, nextId, lifeId, ribbon`. `character`: `g.character` without `memories`. `people`: `g.people` with `notes` removed from each. `assets`: `g.assets`. `counters`: `counters` and `yearActions`.
- `economy`: `flags.worldEconomy`. `flagsWorld`, `flagsPersonal`, `flagsCache`: every other flag by `classifyFlag(key)` (`src/game/world-flags.ts`); an unclassified key counts as personal; `textMem` and `flavorRecent` are in none of them.
- `queue`: structure only: for each item `kind, id, scriptId, source, personId, game` and the choice ids; titles, texts, emoji, tones, labels, hints and `data` are left out. In a birth life every popup is answered by the driver the same year (`playLife` drains the queue), so a real flow into state shows in the other slices. In a founder life it does not: `probeLife` sets `g.queue = []` before every `ageUp` and never answers anything, so the year's popups, the `yearEvents` task (and with it `addFlavorLines`) never run there; a founder life only exercises the draws inside the yearly hooks, and its `queue` slice is the structure of the unanswered items. Text sinks reached only through popups and flavor are covered by the birth lives alone.
- `text`: `g.log`, `character.memories`, each person's `notes`, `flags.textMem`, `flags.flavorRecent`, `obituary`, and every queue title, text, label and hint. Never compared; it exists so a test can show that text did change.

**The 12 lives** (tuples `[id, kind, seed, birthYear, extra]`): birth lives played with `playLife({ seed, birthYear, untilAge: 40, onYear })` for birth years 1925, 1950, 1975, 1990, 2010, 1960, 2000, 1985 (the 1960 and 2000 lives with `rich: true`, so the wealth events run), and founders with `probeLife({ seed, birthYear, businesses, years, onYear })` for birth years 1950 (1 company, 25 years), 1975 (2, 25), 1990 (3, 25), 1950 (1, 30). Choose seeds that do not die before age 30 at the base commit (try 101 to 112; record which in the tuple). A founder seed must also not make `probeLife` throw: it throws when fewer than `businesses` industries are open to a founder in that country and year (`test/probe-life.ts` line 63), and the country comes from the seed, so check each founder tuple by running it (a 3-company life is the likeliest to throw; move to the next seed, never lower `businesses`). About 90 seconds for all 12 in one process.

**Steps.**
- [ ] Write `test/r2-parity-kit.test.ts` first (red: the kit does not exist). Cases: (1) changing `g.character.money` changes only `character`; (2) a log line, a memory, a person note, a queue label or `flags.textMem` changes only `text`; (3) `g.rng`, `flags.worldEconomy`, a `world`-classified flag, a `personal` flag, an unclassified flag, a `cache` flag and a queue item id each change exactly their slice; (4) key order never matters; NaN differs from null and from 0; (5) `compareTraces` of equal traces is `[]`, of traces differing in one slice at year 7 is `[{ life, year: 7, slices: [slice] }]`, and ignores `text`; (6) `traceLife` of two of the lives (one birth, one founder) twice in one process gives identical traces (no order dependence); (7) fixture shape: `v` 1, `slices` equals `PARITY_SLICES` plus `'text'`, 12 lives, every row has 12 eight-digit hex strings.
- [ ] Add the two `onYear` hunks (optional parameters; no behaviour change for existing callers).
- [ ] Write `test/r2-parity-kit.ts`: digests, canonical JSON, tuples, `traceLife`, `compareTraces`.
- [ ] Write `test/r2-codemod-parity.test.ts`: one `it` per life (timeout 300_000) comparing `traceLife(life)` with the fixture row; a recorder: `R2_PARITY_RECORD=base|rebase|update` rewrites `test/fixtures/r2-parity.json` and skips the comparison. `base` refuses to run when any `src/` file outside `src/game/text/` calls `pickLine(` or `pickSite(` (scan-kit tokens; `business/nepo-asks.ts` is exempt, it declares its own local `pickLine` at line 269), so it cannot record a converted tree; `rebase` (used by R2-B2) refuses unless `src/game/text/draw.ts` exists; `update` needs a non-empty `R2_PARITY_REASON`, which is written into `source`. The failure message names the life, the year and the slices, and says "a moved fixture means a draw moved: do not re-record without a reason".
- [ ] Record at the unmodified tree: `R2_PARITY_RECORD=base /Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod-parity.test.ts`, with `source` set to `base a65349a: v4.1.1, before the pickline codemod`. Run it again without the variable (green).
- [ ] `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/r2-parity-kit.test.ts test/r2-codemod-parity.test.ts test/text-kit.test.ts test/notice-probe.test.ts` (the last two use `playLife`; they prove the `onYear` hunk changed nothing).
- [ ] Commit the five new files, the two hunks and the fixture by explicit path.

**Acceptance proven.** The base is recorded and replayable (D7 layer 1); two plays of a life in one process agree.
**Estimated lines.** Source 0; tests about 540; fixture about 55 KB.
**Risks.** Run time: each life plays 25 to 40 years; if the 12-life run exceeds 150 s, drop `untilAge` to 35 (then re-record). Module-level caches could make a life depend on the one before it: test (6) is the guard, and a failure there means the kit must reset that cache between lives, not that the lives are wrong. A seed that dies at 20 gives a shorter trace, which is fine as long as the fixture records what the base did.

---

### R2-A2 The codemod script and the kit hooks

**Goal.** A committed, tested, idempotent script that rewrites prose pools from `pick` to `pickLine` or `pickSite`, and the three additions to `src/game/text/pick.ts` the later tasks need (generic signature, `pickSite`, the mode hook). It does not touch any other `src` file.

**Items covered.** E.T3 (script), D4, D8, D10.

**Files.**
- Create: `scripts/codemod-pickline.mjs`, `scripts/codemod-pickline.d.mts` (tsc checks `test/` and cannot import an untyped `.mjs`; precedent `scripts/voice/lexer.d.mts`), `scripts/codemod-pickline-skip.json` (`{"v":1,"skip":[]}`), `test/r2-codemod.test.ts` (first line `// ci: fast`), `test/text-pick-site.test.ts` (first line `// ci: fast`).
- Modify: `src/game/text/pick.ts` (lines 1-8 imports; `pickLine` at lines 49-62 becomes a wrapper over one private core).

**Interfaces.**

```ts
// scripts/codemod-pickline.d.mts
export interface SkipEntry { file: string; site: string; reason: string }          // site: 's' + 8 hex digits (inline) or 'const:NAME'
export interface SkipList { v: 1; skip: SkipEntry[] }
export interface CodemodOptions { skip?: SkipList; textModule?: string }          // textModule default 'src/game/text/pick'
export type KeepReason = 'single-word' | 'not-strings' | 'argument' | 'extra-args' | 'identity' | 'decision' | 'skip-list' | 'local-pick' | 'no-rng-import'
export interface CodemodSite { file: string; line: number; col: number; action: 'line' | 'site' | 'keep'; reason?: KeepReason; pool?: 'inline' | 'const'; key?: number; receiver?: string; id: string }
export interface RewriteResult { text: string; sites: CodemodSite[]; changed: boolean }
export function rewrite(path: string, source: string, opts?: CodemodOptions): RewriteResult   // pure
// The sites of the two shared helpers, which are routed wholesale (R2-A3) and so need a human read:
export interface HelperSite { file: string; line: number; callee: 'eraPick' | 'v'; receiver?: string; pool: 'inline-static' | 'inline-hole' | 'const' | 'other' }
export function helperSites(path: string, source: string): HelperSite[]   // pure; calls of `eraPick` or `v` imported from a specifier ending in `/era` or `/helpers` (a file that declares its own `v` has none), first argument a bare identifier, second an array literal or an identifier
export function siteId(path: string, raw: string): string        // 8 hex digits: fnv1a(path + U+001F + raw), lowercase
export function siteKey(path: string, raw: string): number       // parseInt(siteId, 16)
export function relativeImport(fromFile: string, toModule: string): string   // './x' or '../x', posix, no extension
export const IDENTITY_RECEIVERS: readonly string[]
```

CLI: `node scripts/codemod-pickline.mjs [--apply] [--list] [--helpers] [--report <file.json>] [--root <dir>] [--only <path-substring>]`. Default is a dry run that prints, per action and per keep reason, the counts, and the receiver histogram of the held-back sites. `--list` prints `path:line:col action key preview` for every converted site. `--helpers` prints `path:line callee receiver pool` for every `eraPick` and `v` site (about 125 today: 62 and 19 take an identifier, the rest an inline array), the input of the helper review in R2-A3. `--apply` writes the changed files (one write per file) and prints the changed paths one per line so the agent can pass them to `git add`. Exit 0; 2 on bad usage. Node builtins plus `scripts/voice/lexer.mjs` only; the FNV-1a for `siteId` is a six-line copy of `fnv1a` in `src/game/text/hash.ts` (a `.mjs` script cannot import a `.ts` file), and a test pins that the two give the same value for five strings.

**The rules** (the lexer gives token kinds, offsets `p`/`e`, `td` template depth and `nExpr`; the codemod never edits text outside token ranges).
1. A candidate is the token sequence `pick` `(` IDENT `,` not preceded by `.`, in a file that imports `pick` (not `pick as x`) from a specifier ending in `/rng`; IDENT is any bare identifier (the state variable: `g` at 1,349 sites, `gg`, `g2` and `n` at 14), because the rng import already makes the first argument a `GameState` and `tc` checks it. A file with its own `function pick`/`const pick`/`let pick` anywhere (even inside a function: `business/board-ceo.ts` and `economy.ts` have a local `const pick = ...` in a function) or without the import keeps (`local-pick`, `no-rng-import`).
2. The call must have exactly two arguments, the second being (a) an array literal whose every top-level element is one string or template token (elements inside `${}` are ignored by `td`; a trailing comma is fine; a spread, an identifier or an object keeps as `not-strings`; a trailing `as const` after the `]` is allowed, the four `as const` pools in `src/` are all single words and stay anyway), or (b) a bare identifier that names a module-level `const NAME = [ ... ]` or `const NAME: readonly string[] = [ ... ]` (a type annotation is allowed: `RADIO_SHOWS` in `events/era.ts` has one) with the same element rule (module level means brace, paren and bracket depth 0 at the declaration; a function-local array, a `let`, an imported name, a member expression or a call result keeps as `argument`). Extra arguments keep as `extra-args`. An array of lambdas (`TAX_LINES` in `finance.ts:513` is `pick(g, TAX_LINES)(formatMoney(tax))`) is `not-strings` by the element rule.
3. Prose means at least one element whose static text (a string's value, a template's static parts joined) contains whitespace; otherwise `single-word` (names, kinds, ids stay `pick`, which is also what the lead specified).
4. Identity: when the call is directly the right-hand side of `receiver = ` or `receiver:` (after an optional `const`/`let` and type annotation) and `receiver` is in `IDENTITY_RECEIVERS` (`name, firstName, lastName, company, brand, city, job, occupation, title, venue, team, org, client, lender, injury, disease, crime, school, product, celeb, curse, std, condition`), it keeps as `identity`. 31 sites hit the first 19 names today; the last 4 (found by reading `special/social.ts` and `activities/nightlife.ts`) add a few more. A call inside an array literal that is itself the value of a listed key (`traits: [pick(g, PET_TRAITS)]` in `life.ts:962`) is not matched; the dynamic filter has to find those.
4b. Decision: when the call is the right-hand side of `const NAME =` or `let NAME =` (a type annotation is allowed) and `NAME` later appears in the same file as an operand of `===`, `!==`, `==` or `!=`, after `case`, as a `switch (NAME)` subject, as an index `[NAME]`, or as the receiver of `.includes(`, `.startsWith(`, `.endsWith(`, `.indexOf(`, `.test(` or `.match(`, or as the argument of `.includes(` or `.indexOf(`, or when the call itself is such an operand, receiver or argument, it keeps as `decision`. The check reads the whole file, not the scope (it only ever keeps more). A bag over line indexes is a rotation, not a dice roll: a pool whose outcome code branches on would alternate instead of rolling, which is a balance change, not a text change. A scan of the `const X = pick(g, [...]|CONST)` form found 14 of 161 such sites (`memberships.ts:215` `reason.includes('online')`, `social.ts:748` `curse`, `social.ts:1194` `celeb`, `nightlife.ts:520` `std !== 'Herpes'`, and others); most are single words or already identity, so the rule moves only a handful of prose pools, and the dry-run count says which.
5. Conversion: an inline array without `${}` holes and every const array becomes `pickLine(g, X)`; an inline array with at least one `${}` hole becomes `pickSite(g, X, 0x<8 hex>)`, the number being `siteKey(path, raw array text)`. The edit renames the `pick` token and, for a site, inserts `, 0x...` before the closing `)`. Two sites in one file with the same raw array text share a key on purpose (the same lines are one pool); two different texts that hash to the same key throw (a collision: add a space to one array).
6. Imports: the new names are imported from `relativeImport(file, 'src/game/text/pick')` on a new line right after the rng import. After the edits, if no reference to `pick` remains outside the import (a reference is an identifier `pick` not preceded by `.` and not followed by `:`), `pick` leaves the rng import (the other names stay; if `pick` was the only name the statement is removed with its newline), because `tsc` has `noUnusedLocals`.
7. A site on the skip list (`file` plus `site`) keeps as `skip-list`; a skip entry that matches no live site is reported as stale (the CLI prints it; the ratchet test fails on it).
8. Strings, comments and template text are never edited (lexer); the rewrite is idempotent (a second run finds no prose `pick` site that is not on the skip list).

**pick.ts additions (behaviour of `memory` mode is exactly today's).** `choose` is one private function: it takes the lines, a lazy key and `named`, throws on an empty list, draws `rand(g)` first (so an exception cannot change the draw count; one-line pools still draw in A2), returns the line for `n === 1`, asks the hook, and then follows today's code. Hook semantics: `hook` is `null` in the game; with a hook, each call with `n >= 2` gets `{ index, key, n }` (index counts from the last `setPickHook`) and returns the mode for that call: `memory` (default when it returns undefined), `plain` (return `lines[Math.floor(r * n)]`, read and write no memory, so `pickLine` equals `pick`) or `rotate` (return the line after that one, no memory). `pickSite` validates `site` as an integer in `0..0xffffffff`; an invalid one falls back to the pool hash.

**Steps.**
- [ ] Write `test/r2-codemod.test.ts` first (red). Cases, on small synthetic sources through `rewrite()`: (1) static prose pool to `pickLine`; (2) pool with `${}` holes to `pickSite` with the same key on two runs and a different key when one character of the array changes or the path changes; (3) a single-word pool, a name pool and a pool with a spread, an identifier or an object stay; (4) module const to `pickLine`, a function-local const, a `let`, an imported name, `x.names` and a call result stay; (5) `p.firstName = pick(g, ['Mary Ann', 'Jo Beth'])` stays (`identity`, receiver reported) and `const text = pick(g, [...])` converts; (6) `.pick(` method calls, `seeded(k).pick(`, and the text `pick(g, ['a b'])` inside a string, a template or a comment are untouched; (7) a file with its own `pick` or no rng import is untouched; (8) imports: the new line is placed after the rng import with the right relative path from `src/game/x.ts`, `src/game/special/kit/y.ts` and `src/game/events/z.ts`; `pick` leaves a multi-line rng import when unused, stays when still used, and a statement holding only `pick` disappears; (9) idempotence: `rewrite(rewrite(s).text).changed` is false; (10) skip list honoured, stale entry reported; (11) every rewritten source still parses: `esbuild.transform(text, { loader: 'ts' })` does not throw (esbuild is a devDependency); (12) two equal arrays in one file share one key and do not throw, two different texts forced to one key throw; (13) `relativeImport` table of 6 pairs; (14) `pick(gg, [...])` and `pick(n, [...])` convert, `pick(f(), [...])` and `pick(g.x, [...])` stay; (15) `const X: readonly string[] = [...]` and a prose array followed by `as const` convert; an array of lambdas stays (`not-strings`); (16) decision: `const r = pick(g, ['a b', 'c d']); if (r === 'a b') ...`, `switch (r)`, `REC[r]` and `r.includes('b')` each keep (`decision`), while a `const r = pick(...)` whose `r` only reaches a template converts; (17) `helperSites` classifies `eraPick(g, ['a b'])` as inline-static, one with `${}` as inline-hole, `eraPick(g, POOL)` as const (a module-level array) or other, and returns nothing for a file that declares its own `v`.
- [ ] Write `test/text-pick-site.test.ts` first (red): `pickSite` is `pick` on an empty memory for 20 seeds (same index, same `g.rng`, one draw), never writes a family, keys the memory by `'s' + hex`, falls back for an invalid site; `pickLine` with `plain` mode equals `pick` always and writes nothing; `rotate` returns the next index; the hook sees `index` 0, 1, 2 and `key` and `n`; `withPickMode` restores the previous hook when the callback throws; a one-line pool does not reach the hook; two compile-time cases that only `tc` checks (D8): `let line = pickLine(g, ['a b', 'c d']); line = 'e f'` and `pickLine(g, ['a b', 'c d']) === 'e f'` compile (the result is `string`), and `const KINDS = ['a b', 'c d'] as const; const r: Record<(typeof KINDS)[number], number> = ...; r[pickLine(g, KINDS)]` compiles (the result is the literal union).
- [ ] Implement `src/game/text/pick.ts` (generic, `choose`, `pickSite`, hook) and make the existing R1 tests green: `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-pick.test.ts test/text-memory.test.ts test/text-hash.test.ts test/notice-acceptance.test.ts test/flavor-memory.test.ts` (they must pass unchanged; `test/text-pick.test.ts` test 11 still passes because no `src` file calls the kit yet).
- [ ] Implement the script and its `.d.mts`. Dry run on the real tree: `node scripts/codemod-pickline.mjs`. The prototype that gave the figures in 1.1 used rules 1 (state variable named `g` only), 2, 3, 4 (the first 19 receivers) and 5, and printed 801 converted sites in 107 files (431 `line` inline, 263 `site`, 107 `line` const), 31 `identity`, 73 `single-word`, 70 `not-strings`. With the state-variable widening (about 9 more prose pools) and the new keeps (`decision`, four more receivers) expect the converted count within about 25 of 801 and a `decision` count in the low tens; if a number is further off, run `--report` and read the differences before going on. Also run `--helpers` and keep its output for R2-A3. Do not apply.
- [ ] `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod.test.ts test/text-pick-site.test.ts`.
- [ ] Commit the new files and `src/game/text/pick.ts` by explicit path.

**Acceptance proven.** The script's rules are pinned on synthetic code (the unit half of D.11 "guards fail on a synthetic violation"); the hook modes exist; R1 tests still pass.
**Estimated lines.** Source about 610 (script 480, `.d.mts` 45, `pick.ts` 85); tests about 440.
**Risks.** The lexer treats `<` after `)` as an operator; a generic call `pick<T>(g, ...)` is not matched (three exist, `events/custom.ts:953`, `:962` and `:970`, all object pools, which would stay anyway). A pool whose array text contains the sequence `${` inside a nested template in an element is fine, because elements are read at the array's own template depth. The identity list is short on purpose; R2-A3's mutation test is the real filter.

---

### R2-A3 Apply the codemod, route `eraPick` and `v`, prove nothing moved

**Goal.** Convert about 800 prose pools to the kit, route the two shared helpers through it, and prove, with the R2-A1 fixture and a mutation test, that no draw moved and no converted string leaks into state.

**Items covered.** E.T3 (apply, `eraPick`, `v()`), D7 layers 1 and 2, D9, D10.

**Files.**
- Modify (generated): the 107 files the codemod lists (`node scripts/codemod-pickline.mjs --apply` prints them); `src/game/events/era.ts` (`eraPick` at lines 110-116; add `eraPickPlain`); `src/game/events/helpers.ts` (`v()` at lines 223-235); `scripts/voice/units.mjs` (line 82); `test/text-pick.test.ts` (test 11 at line 404); `test/r2-parity-kit.ts` (add `bisectOffenders`); `scripts/codemod-pickline-skip.json`.
- Create: `test/r2-pickline-ratchet.test.ts` (first line `// ci: fast`), `test/r2-text-isolation.test.ts`, `test/r2-voice-pickers.test.ts` (first line `// ci: fast`).

**Interfaces.**

```ts
// src/game/events/era.ts
export function eraPick(g: GameState, lines: readonly string[]): string        // now pickLine over the era-filtered list
export function eraPickPlain(g: GameState, lines: readonly string[]): string   // today's body (pick), for sites the mutation test names
// src/game/events/helpers.ts
export function v<T>(g: GameState, items: T | readonly T[]): T                 // string lists through pickLine; other lists still pick
export function vPlain<T>(g: GameState, items: T | readonly T[]): T            // today's body (pick), added together with eraPickPlain: the helper review and the mutation test route sites to it
// test/r2-parity-kit.ts
export function bisectOffenders(life: ParityLife): { key: string; where: string[] }[]   // pool keys whose rotation changes a non-text slice, with the first stack frames that called them
```

**The two helper edits.** `eraPick`: `pick(g, ok)` becomes `pickLine(g, ok)` and `pick(g, plain.length ? plain : lines)` becomes `pickLine(...)`; the memory key is the hash of the era-filtered list (a different filter result is a different pool; bounded by the 300-pool LRU). `v()`: in the string branch, `pick(g, from)` becomes `pickLine(g, from)`; the non-string branch (objects) keeps `pick`. Both draw exactly once, like before.

**The helper review (by hand, before the mutation test).** Routing `eraPick` and `v` wholesale reaches about 125 sites that the codemod's receiver list never sees, and the mutation test only sees the sites the 12 lives happen to run. So read `node scripts/codemod-pickline.mjs --helpers` once and decide each site by what is done with the result. The site goes to `eraPickPlain`/`vPlain` when the result (a) is stored on a `Person`, an `Asset`, a condition, a company, a flag or the character (`love.ts:296` occupation from `RICH_JOBS`; `activities/movies.ts:164` film title; `relationships.ts:2661` `MOVIES`; `careers.ts:1407` `FIRE_REASONS`; `events/wealth-kids.ts:723` and `events/wealth-menu.ts:603` business ideas; the rest of the 62 `eraPick(g, IDENT)` and 19 `v(g, IDENT)` sites needs the declaration read), (b) is branched on, or (c) comes from an inline array with `${}` holes (2 `eraPick` and 2 `v` sites today: a pool whose text changes per value gets a new memory key per value, which writes one throwaway pool per call into the 300-pool memory and evicts real history; `pickSite` is for `pick`, and the helpers take no site argument). Prose goes through the kit. The edit is the call itself (`eraPick(` becomes `eraPickPlain(`), so no skip entry is needed; list the rerouted `file:line` pairs in the commit message. No ratchet covers helper sites (the codemod only rewrites `pick`), so say in `docs/STREAMS.md` that a new identity result must use the Plain helper.

**`bisectOffenders(life)`**: play the life with `withPickMode('plain')` and record every distinct pool key and, once per key, the top four stack frames inside `src/` (from `new Error().stack` in the hook). Then delta-debug: while playing the life with only the keys in set S rotated (hook returns `rotate` for a key in S, `plain` otherwise) still diverges from the plain trace, split S in halves, keep the half that still diverges, and finish with one key; report it, put it back to plain, and repeat on the remaining keys until the full rotation matches plain. About log2(keys) plays of one life per offender (about 9 plays, a minute). It runs only when `R2_PARITY_ATTRIBUTE=1` or after a failing comparison.

**The ratchet test** (`test/r2-pickline-ratchet.test.ts`, uses `rewrite()` over `loadSources()` from `test/scan-kit.ts`): (1) no prose pool in `src/` is still written with `pick(g, ...)` unless it is on the skip list; (2) no stale skip entry; (3) every skip entry has a reason of at least 6 characters and no U+2014 or U+2013; (4) all `pickSite` numeric keys in `src/` are distinct; (5) no `src` file outside `src/game/text/` declares its own `pickLine` or `pickSite` except `business/nepo-asks.ts` (its local hash helper, `nepo-asks.ts:269`).

**The isolation test** (`test/r2-text-isolation.test.ts`, A3 part; B2 appends the extra-draw block): for six of the lives (three birth, one rich, two founder), `withPickMode('plain', () => traceLife(life))` and `withPickMode('rotate', () => traceLife(life))` must give `compareTraces(...)` equal to `[]`; also the `memory` mode (the game) must agree with `plain` on every non-text slice, and at least one life's `text` digest must differ between `plain` and `memory` in some year (the conversion has teeth). A failure prints the first divergence and "run R2_PARITY_ATTRIBUTE=1 vt test/r2-text-isolation.test.ts". All 12 lives run under `R2_PARITY_FULL=1`. Two properties to know when reading a failure: `rotate` also flags a pool that is called once in a life (its first call on an empty memory equals `pick`, so `memory` mode would not differ), which is conservative and costs nothing to revert; and the founder lives never reach `addFlavorLines` or the popups (see the `queue` slice note in R2-A1), so a text sink that only the yearly popups reach is tested by the birth lives alone.

**Steps.**
- [ ] Write the three new test files first (red: `r2-pickline-ratchet` fails listing about 800 pools; `r2-voice-pickers` fails because `pickLine` is not a picker; the isolation test fails to import `eraPickPlain`/`bisectOffenders`, or passes vacuously, so write the "teeth" assertion first).
- [ ] `r2-voice-pickers`: build a temp tree with `notice(g, 'Title', pick(g, ['Alpha beta gamma.', 'Delta epsilon zeta.']))` and the same with `pickLine` and with `pickSite(g, [...], 0x1)`, run `extractUnits` (`scripts/voice/units.mjs:630`) and assert the three give the same roles, texts and contexts. Then change `PICKERS` at `units.mjs:82` to `new Set(['pick', 'v', 'pickLine', 'pickSite'])`. Run `/Users/saeed/projects/anotherlife/wt/bin/vt test/voice-batch.test.ts test/voice-report.test.ts test/voice-guards.test.ts test/r2-voice-pickers.test.ts` (the existing voice tests must stay green: the metrics must not move).
- [ ] Edit `eraPick` and `v()`; add `eraPickPlain` and `vPlain`; do the helper review above and reroute the sites it finds. These two helpers are the widest door (about 125 sites, and `love.ts:296` stores an `eraPick` result as a person's occupation), and the review comes first because the mutation test only sees what the lives run. Then run `R2_PARITY_ATTRIBUTE=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/r2-text-isolation.test.ts`: it either passes or names the pools whose rotation moves state; for each, edit the call site to `eraPickPlain` or `vPlain` and repeat. Then run `/Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod-parity.test.ts`: green (no draw moved: both helpers draw once, and the memory only changes text, which the fixture ignores). If the parity test is red while the isolation test is green, a draw count changed: fix the edit, never the fixture.
- [ ] Dry run `node scripts/codemod-pickline.mjs`, then `--apply`; `git diff --name-only` lists exactly the printed files (plus the helper edits; `git status --short` also shows untracked files such as `node_modules` and the plan folder, which are not yours to add); `/Users/saeed/projects/anotherlife/wt/bin/tc` must pass (a converted site whose result type matters shows here: revert that site to `pick` and add a skip entry with the reason "typed result").
- [ ] Run `/Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod-parity.test.ts` again (must be green: parity with the base fixture after the conversion) then `R2_PARITY_ATTRIBUTE=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/r2-text-isolation.test.ts`. For every offending pool the attribution prints, revert that site: edit `pickLine`/`pickSite` back to `pick`, add a skip entry (`file`, the `site` id the dry run prints, a reason such as "name stored on Person"), run `node scripts/codemod-pickline.mjs` (dry) to see the new count. Repeat until green. Time box: if more than 60 sites need reverting after the third round, stop and report to the lead (the identity list needs widening or a pool kind was misjudged); do not weaken the test.
- [ ] Rewrite test 11 of `test/text-pick.test.ts` (it says "E.T3 (R2) deletes this test when the codemod starts"): keep `strays` and 11b (the scan's own self-test, which still treats `pickLine` as a name) as they are, and change only 11: the real-tree scan keeps `hpick` and `defineLines` (no `src` file outside `src/game/text/` calls them, that half still holds) and drops `pickLine`; add that every `src` file outside `src/game/text/` that calls `pickLine` or `pickSite` (bar `business/nepo-asks.ts`, which declares its own) imports it from a specifier ending in `text/pick` or `/text` (the ratchet covers the rest). Put the reason in the commit message.
- [ ] Run the neighbours: `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-pick.test.ts test/text-kit.test.ts test/notice-acceptance.test.ts test/flavor-memory.test.ts test/architecture.test.ts test/world-flags.test.ts test/voice-guards.test.ts test/r2-pickline-ratchet.test.ts` (the architecture test proves no module joined an import cycle: the text kit imports only `../rng`, `../types` and itself).
- [ ] Commit by explicit paths: the codemod's printed list, the helper edits, `units.mjs`, the skip file, the tests.

**Acceptance proven.** `g.rng` and every non-text slice are identical to the base for 12 lives of 25 to 40 years (the codemod moved no simulation draw); no converted site leaks into state on the lives played; the voice report does not move; no new import cycle; a new prose `pick` fails the fast tier.
**Estimated lines.** About 970 generated lines plus 21 by hand; tests about 480.
**Risks.**
- Coverage: the lives exercise a subset of the 801 sites. A leak in an unexercised site shows later as a text choice moving a seeded run (low severity: still deterministic). The static identity list and `tc` are the first filter; R2-B2's every-year extra draw is a second look.
- `pickLine` turns a pool of two or three lines into a strict rotation (a bag): the line after A is always B. That is the design (9.2); say so in the PR.
- Performance: `writableTextMem` re-validates the whole memory on every call (up to 300 pools and 120 families); R2-B2 adds the validity cache, and until then a heavy year makes a few hundred calls (about 10 ms). Re-measure the 12-company year at R2-B2.
- Era anachronism: lines that were never reachable together with a given date may now surface in new lives; that is C's `bug` kind, not a codemod fault.

---

### R2-B1 Kernel streams, the fork move, the seed kit and the guards

**Goal.** The named-stream primitive and everything that keeps world code on it, plus the test kit that replaces pinned seeds. No draw moves in this task.

**Items covered.** K.3 streams half (design 13.3), K.7b `findSeed` half (F.1 "Pinned seeds"), the world-RNG lint.

**Files.**
- Create: `src/game/kernel/streams.ts`, `src/game/kernel/forks.ts`, `test/seed-kit.ts`, `test/seed-kit.test.ts` (first line `// ci: fast`), `test/kernel-streams.test.ts` (first line `// ci: fast`), `test/world-streams.test.ts` (first line `// ci: fast`), `test/seed-pins.test.ts` (first line `// ci: fast`), `test/seed-pins-baseline.json`.
- Modify: `src/game/timeMachine.ts` (lines 139-195: remove `TimelineFork`, `FORKS_FLAG`, `timelineForks`, `forkTag`, `timelineTag`, `outcomeTag`; keep `FORK_MARK`, `addFork`, `timelineFamily`, `familyAt`, `arriveInPast`; add `import { FORKS_FLAG, forkTag, timelineForks, type TimelineFork } from './kernel/forks'` and `export { forkTag, outcomeTag, timelineForks, timelineTag } from './kernel/forks'` and `export type { TimelineFork } from './kernel/forks'`; `FORKS_FLAG` is used at line 233).

**Interfaces.** As in section 2. Behaviour:
- `worldSeed`: strips `-g<digits>` (`life-2026-abc-g3` and `life-2026-abc` agree); `''` and a missing `lifeId` give `'life'`.
- `hashKey`: FNV-1a over UTF-16 code units, `| 0` (the `hashString` of `assets.ts:148`, so a key hashed here equals a key hashed there).
- `stream`: seed `hashKey(streamKey(worldSeed(g), tag, year, id))`, one warm-up output discarded (nearby seeds correlate on the first output, which is why `cv.ts` `unit` also discards one), then `nextRandom` per call.
- `streamUnit(key, n)`: `hashKey(key + U+001F + n)`, discard one output, return the next value. Pure.
- `outcomeStream`: `stream(g, tag, year, String(id ?? '') + outcomeTag(g, year))`; with no fork it equals `stream(g, tag, year, id ?? '')`.
- `textStreamKey(g, year)`: `streamKey(g.lifeId + outcomeTag(g, year), 'text', year)` (the life id, not `worldSeed`: each generation has its own text luck). `textUnit(g, year, n)`: `streamUnit(textStreamKey(g, year), n)`.
- `timelineForks`: unchanged rules plus `raw.slice(-128)` before validation.
- `findSeed(pred, { from = 1, tries = 200, label })`: scans `from, from + 1, ...` and returns the first seed for which `pred(seed) === true`; a non-boolean return throws; a predicate that throws is rethrown with the seed in the message; no hit in `tries` throws `SeedSearchError` naming the label and the range. With a `label` the result is memoised per process (a reused label with a different predicate source throws). `findSeeds` returns the first `count` seeds.

**The guard** (`test/world-streams.test.ts`, lexer based with `test/scan-kit.ts`): (1) in every guarded file no call of `rand`, `randInt`, `randFloat`, `chance`, `pick`, `weightedPick`, `shuffle`, `bell` (identifier followed by `(` and not preceded by `.`), no property access `.rng`, no `Math.random`, `Date.now` or `new Date`; `uid` is also banned in `src/game/kernel/**` (open question 1); a pragma `// rng-ok: <12 or more characters>` on the same or the previous line allows one line and the test prints the count; (2) strings, comments and templates that mention a banned name are not flagged (`toSource` fixtures); (3) the guarded set is non-vacuous: `src/game/kernel/streams.ts` and `kernel/forks.ts` are in it; `src/game/world/**` and `src/game/modules/**` are guarded when they exist; (4) the kernel is a leaf: every `import` in `src/game/kernel/*` is `import type`, or from `'../rng'` (only `nextRandom` is allowed from it), `'../types'`, or `'./x'`; (5) synthetic violations in each category fail the check.

**The pin ratchet** (`test/seed-pins.test.ts`): counts `\bseed:\s*\d+` per file (lines, not occurrences) over `test/**/*.ts` except `test/fixtures/**`, `test/seed-pins.test.ts` and `test/seed-kit*.ts`; a file may not exceed its baseline entry (zero when absent) and a baseline entry above the real count fails as stale (`UPDATE_SEED_PINS=1 vt test/seed-pins.test.ts` rewrites it, and only ever lowers; with no file it writes the first). Generate the first baseline at the end of this task (183 lines in 68 files; the new test files of A1 to A3 contain none, and neither must B1's own: a `findSeed` call or a tuple, never `{ seed: 7 }`).

**Steps.**
- [ ] Write `test/kernel-streams.test.ts`, `test/world-streams.test.ts`, `test/seed-kit.test.ts`, `test/seed-pins.test.ts` first (red). `kernel-streams` cases: (1) same arguments give the same first 5 values; a different tag, year, id or world seed gives different ones; (2) two interleaved generators with equal arguments do not disturb each other; (3) a `deepFreeze`d state works and `g.rng`, `g.nextId` and `g.flags` are unchanged after 1,000 draws; (4) `worldSeed` table; (5) uniformity: the first draw of 4,000 sibling ids (`id` 0 to 3999) has a mean between 0.48 and 0.52 and every tenth-bin count within 25% of 400 (deterministic data, so it cannot flake; check the bounds once and keep them); (6) `outcomeStream` equals `stream` without forks; with a fork at year F it differs from `stream` for every year at or after F and equals it for years before F (`outcomeTag(g, y)` is empty when `y + 1 <= F`); (7) bad tags (empty, upper case, 33 characters, a space) throw; (8) `streamUnit` is pure and differs by `n`; `textUnit(g, year, n)` differs by `lifeId`, `year`, `n` and by a fork at or after `year`, and equals `streamUnit(textStreamKey(g, year), n)`; (9) `timeMachine.ts` still exports the four functions and they are the same function objects as the kernel's; `timelineForks` with 500 stored forks returns 128; (10) the existing Time Machine suite is the regression: `test/time-machine.test.ts`.
- [ ] Create `kernel/forks.ts` and the `timeMachine.ts` hunk; `/Users/saeed/projects/anotherlife/wt/bin/vt test/time-machine.test.ts test/kernel-streams.test.ts` (the time-machine file has 3 pinned seeds; if CI later shows it moving, that is R2-C's, not this task's).
- [ ] Create `kernel/streams.ts`, `test/seed-kit.ts`, the baseline file; run `UPDATE_SEED_PINS=1`.
- [ ] `/Users/saeed/projects/anotherlife/wt/bin/tc`, then `/Users/saeed/projects/anotherlife/wt/bin/vt test/kernel-streams.test.ts test/world-streams.test.ts test/seed-kit.test.ts test/seed-pins.test.ts test/time-machine.test.ts test/architecture.test.ts test/world-flags.test.ts` (`world-flags` scans `flags.<key>` literals; `forks.ts` uses `FORKS_FLAG`, a declared constant that the scan resolves).
- [ ] Commit by explicit paths.

**Acceptance proven.** `stream()` is deterministic, stateless and never touches `g.rng`; the kernel is a leaf (L0 contract); the guard fails on a synthetic violation; no new pinned seed can enter `test/`.
**Estimated lines.** Source about 170 net; tests about 720.
**Risks.** The `timeMachine.ts` move touches a Save-track file, harmless because wave 0 merges first. `world/**` and `modules/**` do not exist yet: the guard must pass vacuously for them and bite the day they appear (test 3 pins that). The uniformity bounds are deterministic; if they ever fail the stream is wrong, not flaky.

---

### R2-B2 The text stream, flavor on it, and the rebaseline

**Goal.** `pickLine`, `pickSite` (so every converted site, `eraPick` and `v()`) and the whole of `addFlavorLines` draw from the text stream instead of `g.rng`. This is THE rebaseline: after this commit `g.rng` has lost those draws and every seeded run is different once. Everything else here supports proving that it changed nothing but text.

**Items covered.** The rebaseline (design 13.3, D7), design 14.5 "pickLine keeps one g.rng draw for parity until the world modules move", D1, D3, D5.

**Files.**
- Create: `src/game/text/draw.ts`, `test/text-draw.test.ts` (first line `// ci: fast`), `docs/STREAMS.md`, `test/fixtures/text-baseline-r2.json`.
- Modify: `src/game/text/pick.ts` (the draw line in `choose`: `textRand(g)` instead of `rand(g)`, moved after the `n === 1` return; remove the `rand` import), `src/game/text/memory.ts` (`TextMem` at line 29 gains `c?: string`; `clean()` at line 102 keeps a `c` that matches `^\d{1,7},\d{1,9}$`; `writableTextMem` at line 125 returns an object it validated before without cleaning again, via a `WeakSet`), `src/game/events/flavor.ts` (see below), `src/game/events/era.ts` (`showName` line 308, `radioShow` line 314: optional trailing `draw: Picker = pick`), `src/game/data/locales.ts` (`localPick` line 177, `localSoftDrink` line 241: optional trailing `draw: Picker = pick`), `src/game/rng.ts` (type `Picker`), `src/game/core.ts` (`log` at line 443), `test/text-pick.test.ts`, `test/notice-acceptance.test.ts`, `test/flavor-memory.test.ts`, `test/text-kit.test.ts`, `test/r2-text-isolation.test.ts`, `test/fixtures/flavor-golden.json`, `test/fixtures/r2-parity.json`.

**Behaviour.**
- `textRand(g)`: `mem = writableTextMem(g)`; `n` = the cursor's count when the cursor's year equals `g.year` (a year outside `0..999999` counts as 0), else 0; set `mem.c = '<year>,<n+1>'`; return `textUnit(g, g.year, n)`.
- Imports: `text/draw.ts` imports `./memory`, `../kernel/streams` and `import type` from `../types`; `text/pick.ts` imports `./draw`; the kernel imports nothing from `text/`, `core` or `timeMachine`, so no cycle forms (`test/architecture.test.ts` pins it). After B2 the text kit is no longer a leaf that sees only `../rng`.
- `skipTextDraws(g, year, n)`: a test aid, pre-advances the cursor of `year` by `n` draws without drawing (it writes `c` as `'<year>,<n>'` when the cursor is not already on that year), so a test can shift a coming year's text by one draw. It writes only `flags.textMem`, so a frozen state throws exactly where `rand(g)` did.
- `textCursor(g)`: pure, sanitised read; a missing, malformed or other-year cursor reads `{ year: g.year, n: 0 }`.
- `textLineId(g)`: consumes one text draw and returns `'t' + year + '.' + n` (unique within a year; any string is a valid log id, `save-schema.ts:507`).
- `textRng(g)`: `next` is `textRand(g)`; `int(a, b)` is `a + floor(next * (b - a + 1))` (inclusive, `a > b` swaps like `randInt`); `chance(p)` is `next < p`; `pick` and `shuffle` follow `rng.ts` `pick` and `shuffle`.
- `pickLine`/`pickSite`: for `n === 1` return the line with no draw and no write (D3); otherwise one `textRand`, then the mode logic and the memory exclusion as before.
- `clean()`: a hostile or malformed `c` is dropped, so `readTextMem` of junk still equals `{ v: 1, p: {}, f: {}, r: {} }` (existing tests pin that shape; `c` appears only after a draw).
- Validity cache: `const VALID = new WeakSet<object>()`; `writableTextMem` adds the object it stores (not the copy `readTextMem` returns, which nobody stores) and returns `g.flags.textMem` when it is already in the set. A `structuredClone` or a JSON round trip yields a new object, which is cleaned once, so a hostile save still gets repaired on its first write.
- flavor.ts: replace the rng import (`chance, pick, randInt, shuffle`) by `textRng`: a local `const t = textRng(g)` at the top of `addFlavorLines`, `logMilestones(g, t)` (the `MILESTONES` type becomes `line: (g: GameState, t: TextRng) => string`; the first-word line uses `t.pick(FIRST_WORDS)`, the other four ignore `t`), `tokens(g, t)`, `localizeLine(g, line, t)`, `weightedPool(t, pools)`; pass `(gg, items) => t.pick(items)` as the `draw` of `showName`, `radioShow`, `localPick` and `localSoftDrink` (compute `t.softDrink` once in `tokens` and use it in `localizeLine`, so the lemonade line does not draw inside the attempt loop). The toddler milestone roll is `outcomeStream(g, 'flavor.milestone', g.year, m.id)() < m.chance` (D5a). Every `log` of a flavor line passes `textLineId(g)` as its id (D5b); milestone lines keep `uid`, their count is stable.
- `log(g, text, tone = 'neutral', id?: string)`: `id ?? uid(g, 'l')`.

**Steps.**
- [ ] Write `test/text-draw.test.ts` and the extra block of `test/r2-text-isolation.test.ts` first (red). `text-draw` cases: (1) 500 mixed `pickLine`/`pickSite` calls over pools of 1, 2, 3, 12, 13, 40 lines leave `g.rng` unchanged and advance the cursor by exactly the number of calls with `n >= 2`; (2) a one-line pool writes nothing (`g.flags` equals `{}`); (3) the cursor restarts at 0 in a new year and `textCursor` is pure under `deepFreeze`; (4) the n-th draw of year Y equals `streamUnit(...)` computed by hand; (5) reload: a state taken through `migrateSave(JSON.parse(JSON.stringify(g)))` mid-year (the real load path and `isLoadableGame`, as `loaded()` does in `test/notice-acceptance.test.ts`) continues with the same lines and the same cursor as the original, and so does one rebuilt by `structuredClone` (what `act()` in `src/ui/store.ts` does on every action); (6) replay: two fresh lives of one seed give identical JSON after 10 years; (7) Time Machine: `arriveInPast` from a later year to a snapshot gives different text draws for the jumped-to year than the original run and identical draws for the years before it; (8) an heir (`continueAsChild`) gets a fresh cursor and different lines from the parent's year-for-year; (9) hostile `c` (`'x'`, `'1,'`, `'99999999,1'`, a number, an object, a 10 MB string) reads as empty and is repaired by the next draw; textMem stays under 700 JSON nodes after 2,000 draws over 400 pools (the worst case is 686: `c` adds one node to the 685 of `test/notice-acceptance.test.ts`'s `TEXT_MEM_NODES` budget); (10) validity cache, tested by behaviour: a JSON-loaded hostile memory is repaired by its first write; after that, an invalid pool value written by hand into the returned object survives the next `writableTextMem` call (the cache hit returned the same object), and a `structuredClone` of the state gets it cleaned again (a new object is validated once); (11) `skipTextDraws(g, y + 1, 1)` makes the first draw of year `y + 1` equal the second draw of an untouched run. Isolation extra block: (a) for 4 lives of 20 years, one extra text draw at the start of every year changes no `g.rng` value and no non-text slice digest (all years): in `onYear` (which runs at the end of a year) call `skipTextDraws(g, g.year + 1, 1)`, so the coming year starts its cursor at 1 (an extra draw made at the end of a year would be wasted, the cursor restarts with the year); (b) `addFlavorLines` never changes `g.rng` over 85 years for 4 lives; (c) the lives' `text` digest does differ (the stream is live).
- [ ] Implement `memory.ts`, `draw.ts`, `pick.ts`; `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-draw.test.ts test/text-memory.test.ts` (existing memory tests must pass unchanged).
- [ ] Implement `rng.ts` type, `era.ts`, `locales.ts`, `core.ts`, `flavor.ts`.
- [ ] Rewrite the tests that encode the old rule, one by one, with the reason in the commit message (this is the design change, not a weakening): in `test/text-pick.test.ts` tests 1, 2, the single-line test (line 57) and test 5 (line 180-190) now assert "zero `g.rng` draws, one text-cursor step per call with `n >= 2`, the first pick equals `lines[floor(streamUnit(...) * n)]`, a one-line pool draws and writes nothing"; the hostile-memory test 8 (line 291-301) asserts `g.rng` is unchanged. In `test/notice-acceptance.test.ts` the line `expect(g.rng).toBe(nextRandom(rng)[1])` (line 367) becomes `expect(g.rng).toBe(rng)`. In `test/flavor-memory.test.ts`: the golden test (line 52-66) keeps its shape and its description changes to "text stream, g.rng unchanged"; record with `FLAVOR_GOLDEN=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/flavor-memory.test.ts` (the hash includes `g.rng`, which is now constant over each life, plus the lines); add an assertion that `g.rng` is the same after all 85 years. In `test/text-kit.test.ts` add `TEXT_KIT_RECORD=r2` which writes `test/fixtures/text-baseline-r2.json` (the R1 baseline `text-baseline.json` is left alone: `test/text-metrics.test.ts` pins its `recordedAt`) and prints the ratio of `repeatedShare` and `sameWithin10` to the R1 numbers.
- [ ] Re-record the canary: `R2_PARITY_RECORD=rebase /Users/saeed/projects/anotherlife/wt/bin/vt test/r2-codemod-parity.test.ts`, with `source` `rebaseline <short sha>: text off g.rng`. Before recording, confirm the isolation block is green: a canary recorded over a leak would pin the leak.
- [ ] Write `docs/STREAMS.md` (about 55 lines, no dashes): the `stream` and `outcomeStream` rules with the tag naming (`^[a-z][a-z0-9._-]{0,31}$`, one tag per module, the id is the entity), when to use `pickLine` (prose) and `pick` (identity), the `// rng-ok:` pragma, the text cursor, "a moved canary means a reordered draw".
- [ ] `/Users/saeed/projects/anotherlife/wt/bin/tc`; then `/Users/saeed/projects/anotherlife/wt/bin/vt test/text-draw.test.ts test/r2-text-isolation.test.ts test/r2-codemod-parity.test.ts test/text-pick.test.ts test/text-pick-site.test.ts test/text-memory.test.ts test/flavor-memory.test.ts test/notice-acceptance.test.ts test/text-kit.test.ts test/text-metrics.test.ts test/world-flags.test.ts test/architecture.test.ts test/voice-guards.test.ts test/r2-pickline-ratchet.test.ts test/save-hydrate.test.ts test/inbox-state.test.ts` (the last two load `test/fixtures/save-v1.json.gz`, and `flavor-memory` carries the v4.0.2 `flavorRecent` case: together they are the "every old save keeps loading" evidence for a wave that adds `textMem.c`).
- [ ] Measure the heavy year: `probeLife` with 12 companies for 10 years before and after (one tap clone plus stringify and the year step); the year step must not grow by more than 5%. If it does, the validity cache is not being hit: find out why (a `structuredClone` per call).
- [ ] Commit by explicit paths. The message names this commit as the rebaseline and lists the rewritten test cases.

**Acceptance proven.** An extra text draw every year for 20 years changes no `g.rng` value and no non-text slice (4 lives); flavor draws no `g.rng`; replay, reload and a Time Machine fork give identical or deliberately different text as stated; heirs differ; the memory stays bounded and a hostile cursor is repaired; the canary is re-recorded under the new rule.
**Estimated lines.** Source about 245; tests about 500; docs about 55; three fixtures re-recorded.
**Risks.**
- This commit moves every seeded run. Everything after it in CI that goes red is R2-C's job, and a red file whose reason is not a moved draw is a bug to fix, not a pin to move.
- `makeTestGame` has one `lifeId` (`'test-life'`) and year 2026, so after this commit a test that varied the seed to vary text gets the same text for every seed. R2-C: set `g.lifeId` to vary text.
- Flavor ids: a test that read log ids of flavor lines as `l<n>` will see `t<year>.<n>`; none is known (grep `entries` ids in `test/` before starting).
- `skipTextDraws(g, y + 1, 1)` pre-advances the cursor of the coming year, so it works only while no text draw runs between the `onYear` call and the `g.year += 1` of the next `ageUp` (`aging.ts:110`): a draw at year `y` would read a cursor of another year, count from 0 and overwrite it. Read today: `ageUp` runs `settleIncomeTax` and `ensureEconomy` first and neither draws text, and `playLife` calls `onYear` after the queue is drained. If a later change puts a text draw there, extra-draw block (a) still passes but proves less; the fix is to key the pre-advance by year in `c`, not to loosen the test.
- A Time Machine snapshot is taken at the start of year `Y` after that year's popups, so its cursor reads `'Y,k'` with `k` draws already made. After `arriveInPast` the draws continue at `k` but under the fork's new key, so the lines already in the log stay and everything drawn after the jump is new; `textUnit(g, y, n)` for `y` before the fork year equals the original run, which test (7) pins.
- `eraPick` over an era-filtered list keys its memory by the list's content hash, so a line's history resets at an era boundary: cosmetic.
- If the isolation block fails on a site the A3 mutation test did not catch, revert that site to `pick` (skip list, reason) as in A3, never relax the test.

---

### R2-C Fix-up after the first CI run

**Goal.** Turn every red file of the first CI run on the wave-0 branch into a green file, with a written reason for each moved test, and lower the pin ratchet. Nothing in this task changes a rule; it adapts tests to the new draws and fixes real defects the new lives expose.

**Items covered.** The roadmap's "a written list of every seeded test that moved and why" and "119 pinned seed tests move to `findSeed(pred)`".

**Files.**
- Create: `docs/superpowers/plans/2026-10-21-r2-v5.0.0/moved-seeds.md`, `test/moved-seeds.test.ts` (first line `// ci: fast`).
- Modify: the failing test files (and a `src` file only for a `bug` row), `test/seed-pins-baseline.json` (lowered at the end).

**Inputs.** The lead's list of failing files from the first CI run on the branch after R2-B2. Work in batches of at most 12 files per agent, never more than one `vt` at a time per agent (the machine has 3 test slots).

**The triage recipe (per failing test).**
1. Run the file alone: `/Users/saeed/projects/anotherlife/wt/bin/vt test/<file>`. Read the first failure message. Do not edit before you can say which row of this table it is.

| Kind | How to tell | Fix | Never |
|---|---|---|---|
| `design` | the assertion states the old rule: `pickLine` draws `g.rng`, a golden hash includes `g.rng`, a text baseline | rewrite to the new rule (section R2-B2), re-record the fixture through its env switch | keep an assertion that cannot hold |
| `seed` | the file pins `seed: <n>`, `makeTestGame(<n>)` or `rng: <n>` and needs a situation (a death, a rare event, a pregnancy, a win) the old draws gave | `findSeed(pred, { label })` where `pred` states the situation, not the old numbers; replace every pin of that file; the assertion text stays unchanged | change the assertion to fit the new life |
| `number` | an exact pinned value (money, count, a person total) moved on a seeded life and the exactness is the point | check it by a second route (recompute from the inputs, or play two other `findSeed` seeds and see the same relationship), then re-pin the new value | widen it to a range |
| `text` | an exact line from a pool | `findSeed` for a life that shows the line, or pin the new line | assert pool membership instead of the line |
| `bug` | a crash, NaN, a conservation or invariant failure, or an anachronism guard fires on a line a new life reached | fix the cause in `src` (for example the missing `@-1950` gate on the line the guard names), add a regression test with `findSeed` or a built state | change the guard, raise a threshold, skip the case |
| `flake` | passes on a rerun, timeouts under contention | rerun once; if the new life is simply slower, raise the file's own timeout | skip |

2. `findSeed` template: `import { findSeed } from './seed-kit'`, then `const seed = findSeed((s) => { const g = createNewLife({ seed: s, year: 2000 }); /* build the situation */ return /* predicate */ }, { label: 'a woman who lives past 40' })`. Keep the predicate cheap (a few years at most); the search is deterministic, memoised per label, and stops at 200 tries with a clear error. If a file has a helper that took a seed (`signed({ seed })`, `ready({ seed })`), pass the found seed in; a loop over `seed: 30 + i` is not a pin and needs no change unless it fails.
3. After each file: run it again green, run `/Users/saeed/projects/anotherlife/wt/bin/tc`, add rows to `moved-seeds.md`, then commit that batch (explicit paths, the trailer) with a message that lists the files and kinds.
4. At the end: `UPDATE_SEED_PINS=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/seed-pins.test.ts` (it only lowers), then `/Users/saeed/projects/anotherlife/wt/bin/vt test/moved-seeds.test.ts test/seed-pins.test.ts`.
5. If a file stays red for a reason none of the rows covers, or a `bug` row needs a design decision, stop and report it to the lead with the failing message; do not force it green.

**The `moved-seeds.md` format.**

```
# R2 wave 0: tests that moved
Rebaseline commit: <sha of R2-B2>. Recipe: wave0.md, task R2-C. Totals: <files> files, <tests> tests.

| file | test | kind | before | after | why |
|---|---|---|---|---|---|
| test/time-machine.test.ts | snapshots keeps the start of each year | seed | seed: 8 | findSeed(alive at 30, label "a life that reaches 30") | the old draws gave a life that reached 30; text draws left g.rng |

## Bugs found
| file | what | fixed in |
|---|---|---|
```

Rules: one row per test (the `describe > it` name, cut to 80 characters); `kind` is one of `design`, `seed`, `number`, `text`, `bug`; `before` and `after` at most 80 characters (for a number, the two numbers; for text, the two lines); `why` at most 120 characters, no U+2014 or U+2013, and for `design` and `number` the reason names the rule ("text draws left g.rng", "ids no longer shift"). `test/moved-seeds.test.ts` parses the table and checks: every `file` exists, every `kind` is valid, each `seed` row's file contains `findSeed(` and no `seed: <digits>`, no row is longer than the caps, and the totals line matches the row count.

**Expected files (measured by the experiment in 1.4; the first CI run is the oracle).**

| File | Red tests | What failed in the experiment | Kind |
|---|---|---|---|
| `test/text-pick.test.ts` | 6 | tests 1, 2, the single-line test and test 5 compare `pickLine` with `pick()` and `g.rng` | design |
| `test/notice-acceptance.test.ts` | 10 | `expect(g.rng).toBe(nextRandom(rng)[1])` (line 367) in the hostile text memory sweep | design |
| `test/flavor-memory.test.ts` | 1 | the golden holds `g.rng` after every year | design |
| `test/time-machine.test.ts` | 2 | helper `live()`: "died at 22: Breast Cancer" (3 pinned seeds in the file) | seed |
| `test/probe-life.test.ts` | 1 | the `keepAlive` founder survives where it used to die | seed |
| `test/board.test.ts` | 1 | `bizOf` of undefined: no company for this seed | seed |
| `test/will-estate.test.ts` | 1 | estate 1,183,250, expected 1,500,000 | seed |
| `test/nav-cockpit.test.ts` | 1 | "10 people in your life.", expected 11 | seed |
| `test/nav-people.test.ts` | 1 | pet name 'Mochi', expected 'Rex' (a pet name is an identity pick, it stays `pick`) | seed |
| `test/chart-purity.test.ts` | 1 | an owner-CEO with eight years of books has 7 | seed |
| `test/family-use.test.ts` | 1 | repair cost 198, expected 1,000 | seed |
| `test/music-legacy.test.ts` | 1 | the five legacy years pin (a deep equal of money and four more numbers) | number |
| `test/fame-career.test.ts` | 1 | podcast audience at year 10, 2,070,070, expected 7,718,721 (the R0 ceiling pin) | number, then seed |
| `test/deeptech-fusion.test.ts` | 1 | Series C at 6, expected at least 8 | seed |
| `test/devices-story.test.ts` | 1 | the title says "(seed 11)"; -12.54 where it expected above -11.208 | seed |
| `test/report-live.test.ts` | 2 | helper `unmoney` throws "not money: +$24K" | seed, or the helper |
| `test/social-delete-era.test.ts` | 1 | one notice, expected two | seed |
| `test/localize-life.test.ts` | 3 | cats against dogs 27 to 30, the prom line, the "called 911" line | seed, text |
| `test/era-features-more.test.ts` | 2 | the anachronism guard (a celebrity role in 1915); the 1962 committee loop | bug, seed |

Batches for the pre-split (at most 12 files each, one agent each, one `vt` at a time):
- Batch C-a, the by-design rewrites, done inside R2-B2 itself (they cannot be separated from the change): `test/text-pick.test.ts`, `test/notice-acceptance.test.ts`, `test/flavor-memory.test.ts`.
- Batch C-b, life situation files (all `seed` unless noted): `test/time-machine.test.ts` (2 tests), `test/probe-life.test.ts`, `test/board.test.ts`, `test/will-estate.test.ts`, `test/nav-cockpit.test.ts`, `test/nav-people.test.ts`, `test/chart-purity.test.ts`, `test/family-use.test.ts`.
- Batch C-c, number and mixed files: `test/music-legacy.test.ts` (`number`), `test/fame-career.test.ts` (`number`, then `seed`), `test/deeptech-fusion.test.ts`, `test/devices-story.test.ts` (its title names "seed 11"; drop the number from the title), `test/report-live.test.ts` (check the helper `unmoney` first: it meets "+$24K", a signed money string, so the test helper may be the defect), `test/social-delete-era.test.ts`, `test/localize-life.test.ts` (3 tests: `seed`, `text`).
- Batch C-d, `test/era-features-more.test.ts` (2 tests). The anachronism guard names `shopping>lux-vip-wedding` with "the talk show host" in 1915: a `bug` (a celebrity role without an era gate; fix the data in `src`, never the guard). The 1962 committee test loops `makeTestGame(seed)` for 80 seeds and needs both lines of a pool to appear: all 80 games share `lifeId` `'test-life'`, so they now draw the same text; this is the D1 consequence, kind `seed`: set `g.lifeId = 'test-life-' + seed` inside the loop.
- Batch C-e, the five slow files, run first when CI is red or after a local `vt` per file: `test/simulate.test.ts`, `test/era-features.test.ts`, `test/main-character-life.test.ts`, `test/sector-story.test.ts`, `test/anachronism.test.ts`. They play many lives and assert invariants and lints; they were not measured, and a new life is the likeliest way to reach a defect (as `era-features-more` showed).

**Estimated lines.** Test edits about 300 lines across about 15 files; `src` only for `bug` rows.
**Risks.** An anachronism or era guard (`era-features-more`, `anachronism`, `era-features`) can fire on a line that was always wrong but never reached; fix the line. The five slowest files were not run in the experiment and are the likeliest to show more than the table.
