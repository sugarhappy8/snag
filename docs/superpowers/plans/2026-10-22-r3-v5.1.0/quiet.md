# R3 plan, Quiet years track: s/a/w fields, the year close, the year card, pacing and variants (track `quiet`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0` cut from v5.0.0 (main 85e147b). Code read at that commit in `/Users/saeed/projects/anotherlife/wt/r3-release`; only this file was written. Every "modify" path exists today, every "create" path does not. Plain hyphens only (no U+2014, no U+2013).

## 1. Track summary

**Items (13 tasks).** E.D1 (R3-Q1 fields and sources, R3-Q2 the 120-title weight table). E.D2 (R3-Q3 the pure year planner, R3-Q4 `closeYear`, the year book, pending asks and the store wiring, R3-Q5 the store-flow harness and acceptance). E.D3 (R3-Q6 the year card, R3-Q7 the collapsed log). E.D4 (R3-Q11 the 127 culture lines). E.T5 (R3-Q8 pace core and the event library, R3-Q9 wealth asks, R3-Q10 company events and the career kit). E.T6 (R3-Q12 variants for the top 60 events). R3-Q13 closes the track after the lanes merge (integration checks, `docs/QUIET.md`).

**Not in this track.** E.T4 (composer), E.N1 to E.N8 (the Paper) are R4+/R5. Exact and Realistic mode, `know()` and every fog item are the Knowledge and Fog tracks. The Effort tracks own research. `docs/VOICE.md` caps are used, not edited.

**What I measured** (greps and one node script over the two culture files; the tasks regenerate them with the real kits).

| Fact | Value | How |
|---|---|---|
| Yearly aging entries | 36, run by one loop at `src/game/aging.ts:48` over `yearlyEntries('aging')`; ids `yearly.<name>` | `grep -c "^  hook('" src/game/modules/yearly-aging.ts` |
| Popup and line sites | `notice(` 1,835, `log(g` 1,913, `scriptChoice(` 481 in `src/game` | grep |
| Culture lines | 80 early (mean 148, max 205) and 47 late (mean 269, max 338); all 127 are over 110 | regex over `digest-early.ts`, `digest-late.ts` |
| Digest log line | `digestLine` = `"📅 {year}: {culture} {prices}"` (`src/game/history/digest.ts:97-100`), the 41% of log characters in the audit | read |
| Wealth asks | 57 (24 in `wealth-kids.ts`, 22 `wealth-family.ts`, 11 `wealth-world.ts`), cooldown 1 to 12, `TIER_POPUP_CAP` `[0,1,2,3,3]` (`wealth-core.ts`) | grep `minTier:` |
| Existing family code | 15 `EVENT_KINDS` (`src/game/events.ts:70-86`), hard 3-year gate (`KIND_COOLDOWN`, line 89); text kit `noteFamily`/`familyStats` (`text/memory.ts:223,238`) is used by nobody outside `text/` | read, grep |
| Existing digest and Quiet code (R1) | `noticeModel.ts` `planHead`/`headNoticeRun` (merges a run of plain notices, UI only), `notice-policy.ts` `neverRoute`, `inbox.ts` `routeMinorNotices`, `store.ts:574` `routeQuietNotices`, `notice-weights.ts` (10 minor titles, a leaf, "E.D1 later replaces it with a bigger table") | read |
| Where hook popups end up | `ageUp` queues `{type:'yearEvents'}` last (`aging.ts:63`); the store resolves it only when it reaches the head (`store.ts:599`), so the year event arrives after the hook popups are answered | read |
| What the digests hash | log, queue and `flags.textMem` all sit in the `text` golden slice (`test/golden-kit.ts:206`); `queueShape` in `test/r2-parity-kit.ts:112` hashes ids only | read |

**Design decisions of this plan** (the owner's list in the task text is not reopened; these fill what it leaves open).
1. **Source name.** `s` is the aging entry id without `yearly.`: `health`, `wealth`, `business`. Another track's module `world.frontier` keeps its full id. The year events task sets `events`. `s` is a string of 1 to 24 characters matching `/^[a-z][a-zA-Z0-9.]*$/`. A line or popup made by a player action has no `s` and is never touched by `closeYear`.
2. **Where the year closes.** `closeYear` first resolves the queued `yearEvents` task itself (so the event choice and the flavor lines exist), then budgets, folds and queues the card last. It runs in `ageUpAction` inside the same `act()` as `ageUp`, only when `FLAGS.yearCard` and Quiet Mode are on. Headless `ageUp` is untouched (tests that read `g.queue` stay green).
3. **One shared pacing memory.** Popup families are `flags.textMem.f` keys `pop.<engine>.<family>` (text kit, 120 families, 12 years). No new saved field. The track declares at most 60 pace families (test), leaving 60 for text pools. `EVENT_KINDS` keeps its hard 3-year gate; the shared rule adds the x0.25 weight on top.
4. **Weights.** `w` 0 trivia, 1 routine, 2 notable (the default for a title not in the table), 3 life-changing (never folded). `weight:'minor'` stays (R1 tests are not touched): the table's w<=1 titles are a superset of `MINOR_NOTICE_TITLES`, and `closeYear` reads `weight:'minor'` as w=1 when `w` is absent. A notice `neverRoute` blocks is raised to w=2, so bad-tone, health, legal and large-money notices are never log-only (D18).
5. **Choices.** A queued choice made in a hook or the year events task is an unrequested choice (`s` set). Budget 3 a year. Only choices of the scripts in `DEFERRABLE_SCRIPTS` (`events.random`, `wealth.ask`, `wealth.bundle`) may wait in `pendingAsks`; every other script (company, career, crime, nation) is kept and counted first. Extras past the budget wait at most 2 years, 6 at a time.
6. **The card.** One `NoticeModal` with `digest: YearCard`, id `year-<generation>-<year>`, `text` = the headline (so any reader that ignores `digest` still shows something). It is a popup while `yearBook.shown < 10` (D20, "the last popup for 10 years"), then an inline card (`YearCard.inline = true`, nothing queued).

**Line budget.** About 4,600 source against the roadmap's 4,300 (E.D1 500, E.D2 1,500, E.D3 600, E.D4 200, E.T5 700, E.T6 800; the 7% overrun is the planner, the close and the variants data) and about 4,200 test lines, plus data (`test/fixtures/notice-titles.json`, `test/fixtures/event-top60.json`) and `docs/QUIET.md` (about 110).

| Task | Item | Lane | Source | Tests |
|---|---|---|---|---|
| R3-Q1 | E.D1 | main | 330 | 300 |
| R3-Q2 | E.D1 | main | 260 | 220 |
| R3-Q3 | E.D2 | main | 700 | 650 |
| R3-Q4 | E.D2 | main | 720 | 600 |
| R3-Q5 | E.D2 | main | 150 | 450 |
| R3-Q6 | E.D3 | ui | 420 | 330 |
| R3-Q7 | E.D3 | ui | 220 | 230 |
| R3-Q8 | E.T5 | pace | 330 | 280 |
| R3-Q9 | E.T5 | pace | 230 | 240 |
| R3-Q10 | E.T5 | pace | 180 | 200 |
| R3-Q11 | E.D4 | ui | 190 | 120 |
| R3-Q12 | E.T6 | var | 830 | 330 |
| R3-Q13 | all | main | 40 | 250 |
| Total | | | 4,600 | 4,200 |

**Acceptance owned (roadmap R3 block), and the test that proves each.** Everything else in that block belongs to another track.

| Criterion | Proven by | Task |
|---|---|---|
| Popups a year: ordinary p90 3 and max 5, $50M p90 4 and max 6, tycoon mean 4 plus one "Your companies" card (the `companies` group of the year card) | `test/quiet-acceptance.test.ts`: hard caps with `closeYear` alone in R3-Q5; the p90/max thresholds with all lanes merged in R3-Q13 | Q5, Q13 |
| A tycoon's visible log lines from 12.5 to 8 | `viewYearLog` on a recorded tycoon year (Q7); on a real seeded tycoon life in Q13 | Q7, Q13 |
| The digest is at most 8 lines; money line equals the books; no notice folded before its choice; weight 0 and 1 outcomes are log-only; `closeYear` idempotent by year | `test/year-plan.test.ts`, `test/year-close.test.ts` | Q3, Q4 |
| Every culture line at most 110 characters | `test/culture-lines.test.ts` plus the voice report | Q11 |
| Popup family at most 6 a life with a gap of 4 or more years | `test/pace-families.test.ts` (4 lives, `popupFamilies` of `test/text-metrics.ts`) | Q8, Q9, Q10 |
| Repeated lines at most 5% (8% rich), same line in 10 years 0, any line at most 3 times | Shared with E.T2/E.T3 (state lines, pools). This track moves it only through T5 and T6 and reports it in Q13 (`textMetrics` printed, enforced only for popup titles). See open question 7 | Q13 |

**Hot files and who touches them** (every edit is additive and in its own hunk).

| File | Task | Edit |
|---|---|---|
| `src/game/types.ts:483,509,527` | Q1 | optional `s,a,w` on `LogEntry`, `NoticeModal`; `s` on `ChoiceModal`; `digest?: YearCard`; the new types |
| `src/game/core.ts:490,538-566,568` | Q1 | `log` 5th arg, `NoticeOptions.a/w`, the source stamp, `withLogSource` |
| `src/game/aging.ts:48`, `src/game/offline.ts:34` | Q1 | wrap each entry and the year events case in `withLogSource` |
| `src/game/save-schema.ts:85-116` | Q1 | `migrateLegacyAi` cleans the new fields |
| `src/game/history/events.ts:183`, `src/game/life.ts:2014`, `src/game/events/helpers.ts:274` | Q1 | news line `s/w:0`; quiet test; `res()` passes `a` and `w` |
| `src/game/notice-weights.ts` | Q2 | the table, `noticeWeightOf` |
| `src/game/flags.ts:26-47`, `src/game/world-flags.ts:72-110`, `src/ui/store.ts:484` | Q4 | `yearCard` flag; `yearBook`, `pendingAsks` as personal; `ageUpAction` |
| `test/play-kit.ts:205` | Q5 | `PlayOptions.close` (additive) |
| `src/ui/components/ModalHost.tsx:74`, `noticeModel.ts:21,94`, `LifeLog.tsx`, `src/ui/screens/GameScreen.tsx:196`, `src/ui/styles/notices.css` | Q6, Q7 | year card branch, `mergeable` skips a card, collapsed log, inline card |
| `src/game/events.ts:234,240,273` | Q8 | family weight in `weightOf`, `notePopup` at the pick |
| `src/game/events.ts:37` | Q12 | one line: `EVENT_LIBRARY = withVariants([...])` |
| `src/game/events/wealth.ts:308,336` | Q9 | gap and family note |
| `src/game/business/events.ts:1018,1050`, `src/game/special/kit/year.ts:178,183` | Q10 | family weight, year ledger |
| `src/game/history/digest.ts:97`, `digest-early.ts`, `digest-late.ts` | Q11 | line text, `digestLine` |

**Lanes (4, run at the same time in separate worktrees, merged at the end; no task depends on code of another lane).**

| Lane | Tasks in order | Files |
|---|---|---|
| `main` | Q1, Q2, Q3, Q4, Q5, then Q13 after the merge | types, core, aging, offline, save-schema, notice-weights, `hubs/year-*`, store, flags, world-flags, play-kit |
| `ui` | Q6, Q7, Q11 | `src/ui/components`, `GameScreen.tsx`, `notices.css`, `history/digest*` |
| `pace` | Q8, Q9, Q10 | `text/pace.ts`, `events.ts`, `events/families.ts`, `events/ask-families.ts`, `events/wealth.ts`, `business/events.ts`, `special/kit/*` |
| `var` | Q12 | `events/variants*.ts`, one line in `events.ts` |

The lanes share no new code. The year card and the source groups are a contract by shape (section 2); the UI reads `unknown` and cleans it, so the `ui` lane compiles alone, and R3-Q13 checks that the two group tables and the card shape agree.

**Order and schedule.** Lanes start together. Within `main` the order is forced (types, then weights, then the planner, then the close). Q13 needs all four lanes merged; if the orchestrator cannot wait mid-track, run it first thing at the merge. Integration into `release/v5.1.0` is after `knowledge` (its `types.ts`, `settings.ts` hunks are elsewhere) and before `frontier`.

**Lead actions** (an implementer cannot do these).
1. Confirm the new dark flag `yearCard` (ships 5.1.0, default off until the release commit). It is the ninth key; `test/flags.test.ts:88` ("has the eight agreed keys") is a moved test and R3-Q4 edits it. Flip the default in the release commit.
2. After the lanes merge, regenerate in this order: `node scripts/golden.mjs update --reason`, `R2_PARITY_RECORD=update` and `RECORD_KERNEL_PARITY=1` (Q8 to Q10 move event picks, so every slice moves; Q1 moves only `text`). Never merge those files by hand.
3. Add the new files to `scripts/test-timings.json` at the next refresh: `quiet-acceptance` (about 60 s), `year-close`, `pace-families`, `event-variants`.
4. Rows for `moved-tests.md` are listed per task as "expected moves"; each implementer adds the real rows to `/Users/saeed/projects/anotherlife/wt/r3-release/docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` (create it with the header `| file | test | before | after | why |`).

## 2. Contracts

**Provided by this track** (exact names; other tracks may rely on them).

```ts
// src/game/types.ts (Q1). All new fields optional; absent means "not set".
export type LogWeight = 0 | 1 | 2 | 3                  // 0 trivia, 1 routine, 2 notable, 3 life-changing
export interface LogEntry { id: string; text: string; tone: Tone; s?: string; a?: number; w?: LogWeight }
// NoticeModal gains s?: string; a?: number; w?: LogWeight; digest?: YearCard.  ChoiceModal gains s?: string.
export type YearGroup = 'people' | 'body' | 'work' | 'companies' | 'money' | 'law' | 'world' | 'life'
export interface YearCard {
  v: 1; year: number; age: number
  head: string                      // headline of the year, at most 90 characters
  stories: string[]                 // at most 3, each at most 90
  money?: string                    // the ledger line, at most 90
  people?: string[]                 // at most 3, each at most 90
  world?: string                    // the news headline of the year, at most 90
  groups: { k: YearGroup; n: number; lines: string[] }[]   // collapsed categories: count and at most 6 lines of at most 90
  inline?: true                     // not queued as a popup; the Life tab draws it
}
```

```ts
// src/game/core.ts (Q1)
export function withLogSource<T>(name: string, fn: () => T): T        // sets, restores in finally, nests
export function currentLogSource(): string | undefined
export interface LogOptions { a?: number; w?: LogWeight }              // a: whole, finite, |a| <= 1e15, else dropped
export function log(g: GameState, text: string, tone?: Tone, id?: string, opts?: LogOptions): void
// NoticeOptions gains a?: number; w?: LogWeight. notice() stamps s (current source), a, and w = opts.w ?? noticeWeightOf(title).
// src/game/notice-weights.ts (Q2; a leaf, no imports)
export const NOTICE_WEIGHTS: Readonly<Record<string, 0 | 1 | 2 | 3>>   // at least 120 titles
export function noticeWeightOf(title: string): 0 | 1 | 2 | 3 | undefined
export function noticeWeightFor(title: string): 'minor' | undefined    // unchanged
```

```ts
// src/game/hubs/year-plan.ts (Q3, layer L4, pure, draws nothing, reads only g.year and earlier)
export const YEAR_LIMITS: { readonly choices: 3; readonly notices: 3; readonly noticesMax: 5; readonly lines: 8; readonly head: 90; readonly story: 90; readonly stories: 3; readonly people: 3; readonly group: 90; readonly groupLines: 6; readonly pending: 6; readonly pendingYears: 2; readonly popupYears: 10 }
export const GROUP_OF_SOURCE: Readonly<Record<string, YearGroup>>      // the 36 hook names, 'events', unknown -> 'life'
export function groupOf(s: string | undefined): YearGroup
export function noticeWeight(m: NoticeModal): LogWeight                // m.w ?? table ?? (weight==='minor' ? 1 : 2); neverRoute(m) !== null and w<2 gives 2
export interface Story { id: string; s: string; group: YearGroup; w: LogWeight; a: number; title: string; text: string; tone: Tone }
export interface YearMoney { cash: number; netWorth: number; delta: number; income: number }
export function moneyFacts(g: GameState): YearMoney | null            // cash = acctBalance(g, playerAcct(g)); netWorth, income from the newest life-series row, delta against the one before
export function moneyLine(f: YearMoney): string
export function planNotices(g: GameState, queue: readonly ModalItem[]): { keep: Set<string>; fold: Story[]; merged: Story[] }
export function buildCard(g: GameState, kept: readonly Story[], folded: readonly Story[], log: readonly LogEntry[]): YearCard
```

```ts
// src/game/hubs/year-book.ts (Q4, L4)
export interface YearBook { v: 1; last: number; shown: number; cards: YearCard[] }       // last year closed; cards: newest 3
export interface PendingAsk { y: number; m: Omit<ChoiceModal, 'id'> }                    // y: year it was deferred; m: the choice
export function readYearBook(g: GameState): YearBook                  // sanitizes; a card of a year after g.year is dropped (no foresight)
export function writeYearBook(g: GameState, b: YearBook): void
export function readPending(g: GameState): PendingAsk[]                // at most 6, y within 2 years of g.year, titles/texts/choices bounded
export function writePending(g: GameState, list: readonly PendingAsk[]): void
// src/game/hubs/year-close.ts (Q4, L4)
export const DEFERRABLE_SCRIPTS: ReadonlySet<string>                   // 'events.random', 'wealth.ask', 'wealth.bundle'
export interface CloseReport { closed: boolean; kept: number; folded: number; deferred: number; requeued: number; card: 'popup' | 'inline' | 'none' }
export function closeYear(g: GameState): CloseReport                  // never throws; idempotent: yearBook.last >= g.year returns { closed: false }
// src/game/flags.ts: FLAG_DEFS.yearCard = { default: false, ships: '5.1.0' }
```

```ts
// src/game/text/pace.ts (Q8, layer L1, pure reads, no draw)
export const PACE: { readonly window: 5; readonly weight: 0.25; readonly askGap: 4; readonly maxFamilies: 60 }
export type PaceEngine = 'ev' | 'ask' | 'biz' | 'kit'
export function paceKey(engine: PaceEngine, family: string): string    // 'pop.ev.scam'; a bad family throws at definition time
export function notePopup(g: GameState, key: string): void             // noteFamily once; the writer
export function popupSeen(g: GameState, key: string, years?: number): boolean   // familyStats(g,key).last within years (default PACE.window)
export function paceWeight(g: GameState, key: string | undefined, base: number): number   // base x0.25 when popupSeen, else base
export function askGapOk(g: GameState, key: string | undefined, storyline?: boolean): boolean   // false within PACE.askGap years unless storyline
// src/game/events/families.ts (Q8): EVENT_FAMILIES: Readonly<Record<string, string>>; eventFamily(id): string | undefined
// src/game/events/ask-families.ts (Q9): ASK_FAMILIES: Readonly<Record<string, { family: string; storyline?: true }>>
// src/game/events/variants.ts (Q12): withVariants(list: EventDef[]): EventDef[]
```

```ts
// src/ui/components/yearCardModel.ts (Q6; the ui lane's own reader, so it needs no game type)
export interface CardView { year: number; age: number; head: string; stories: string[]; money: string; people: string[]; world: string; groups: { k: string; label: string; n: number; lines: string[] }[]; inline: boolean; lineCount: number }
export function cleanCard(raw: unknown): CardView | null               // total; bounds every list and string like inbox.ts
export function cardOfModal(m: unknown): CardView | null              // reads m.digest
export function inlineCard(flags: unknown, year: number): CardView | null   // flags.yearBook newest card of `year` with inline true
// src/ui/components/logModel.ts (Q7)
export const LOG_VISIBLE = 8
export function lineWeight(e: { s?: string; w?: number }): 0 | 1 | 2 | 3   // w, else 2
export function viewYearLog(entries: readonly { id: string; text: string; tone: string; s?: string; w?: number }[], visible?: number): { shown: typeof entries; collapsed: { k: string; label: string; n: number; lines: typeof entries }[] }
```

**Group table (the shape contract between lanes).** `people`: household, relationships, sharedProjects, background, royalty, royalCareers, familyUse, nepo, willFeuds. `body`: health. `work`: education, professions, career, special, advisors. `companies`: workshop, corruption, business, techWaves, hedge. `money`: development, investments, shops, computer, finance, wealth, assets. `law`: immigration, crime, underworld, nation. `world`: history, digest, world. `life`: events, milestones, givingFund and any unknown source. Labels: People, Health, Work, Your companies, Money, Law and order, The world, Everyday. `YearGroup` order above is the display order. The ui lane keeps a copy in `logModel.ts`; R3-Q13 compares the two.

**Consumed (all exist at v5.0.0).** `yearlyEntries` (`kernel/registry.ts`), `withYearly`; `acctBalance`, `playerAcct` (`kernel/ledger.ts:288,294`); `readLifeSeries` (`life-series.ts:67`); `neverRoute`, `largestFigure` (`notice-policy.ts`); `quietModeOn` (`settings.ts:72`); `noteFamily`, `familyStats`, `pickLine`, `pickSite` (`text/`); `applyFallback` (`offline.ts`); `findSeed(s)` (`test/seed-kit.ts:108`); `playLife` (`test/play-kit.ts:205`), `probeLife` (`test/probe-life.ts`), `textMetrics` (`test/text-metrics.ts`). From other R3 tracks: nothing.

---

## 3. Tasks

Every task: red test first, run with `/Users/saeed/projects/anotherlife/wt/bin/vt22 <files>` (a few at a time), `/Users/saeed/projects/anotherlife/wt/bin/tc` before commit, explicit `git add` paths, commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New tests use `findSeed`, never `seed: <digits>`. Golden and fixtures are recorded under Node 22 (`vt22`; for `scripts/golden.mjs` use `PATH=$HOME/.local/node22/bin:$PATH node /Users/saeed/projects/anotherlife/wt/bin/slot.mjs heavy -- node scripts/golden.mjs ...`).

### R3-Q1 E.D1 (a): `s`, `a`, `w` on log and notice, set by aging

**Lane** main. **Depends on** none. **Source** about 330, **tests** about 300.

**Goal.** Every line and popup made inside a yearly hook carries its source; a caller may add an amount and a weight; nothing else about saved lines changes.

**Files.**
- Modify `src/game/types.ts:483-489` (`LogEntry`), `:509-525` (`NoticeModal`), `:527` (`ChoiceModal`); add `LogWeight`, `YearGroup`, `YearCard` (section 2).
- Modify `src/game/core.ts:490` (`log`), `:538-548` (`NoticeOptions`), `:550-566` (`notice`), `:568` (`scriptChoice`); add `withLogSource`, `currentLogSource`. Fields are written only when set, as `notice` already does for `support`, `weight`, `link`.
- Modify `src/game/aging.ts:48` (wrap `e.run(g)`: `withLogSource(sourceOf(e.id), () => e.run(g))`, `sourceOf` strips `yearly.`), `src/game/offline.ts:34` (the `yearEvents` case runs under source `events`).
- Modify `src/game/save-schema.ts:85-116` (`migrateLegacyAi`, which already walks queue modals and log entries): drop a bad `s` (not a string of 1 to 24 characters matching the pattern), a bad `a` (not finite or over 1e15), a bad `w` (not 0 to 3), and a `digest` that is not a plain object (the UI cleans the rest).
- Modify `src/game/history/events.ts:183-190` (`logNews` pushes `{ id, text, tone, s: 'history', w: 0 }`), `src/game/life.ts:2014` (`quiet = entries.every((e) => e.w === 0)`; today's value is identical because only the news line has `w` 0 this release; the 📅 line still counts as something that happened, see open question 6), `src/game/events/helpers.ts:274` (`res()` passes `{ a: |fx.money|, w }` to `log` when the money effect or the title weight is known).
- Create `test/log-fields.test.ts`, `test/log-source.test.ts`.

**Steps (test first).**
1. Red tests. `log-source`: with `withYearly('aging', [entry that calls log, notice and scriptChoice])` the three carry `s` equal to the entry name; outside `ageUp` no entry has an `s`, `a` or `w` key (`'s' in e` is false, so JSON is unchanged); a hook that throws leaves `currentLogSource()` undefined; sources nest and restore; the `yearEvents` task writes flavor lines with `s: 'events'`; `logNews` entries carry `s:'history', w:0` and `yearlyMilestones` stays quiet exactly as before (a life with a news line only prints the age 1 toddler line, a life with a 📅 line does not). `log-fields`: `log(g,'x','neutral',undefined,{a:1234.6,w:1})` stores `a:1235,w:1`; `NaN`, `1e16`, `7`, `-1`, `'2'` are dropped; `notice(..., {a, w})` and the table weight (`'Report Card'`) stamp; `opts.w` beats the table; `weight:'minor'` is unchanged for the 10 titles; `migrateLegacyAi` repairs hostile `s/a/w/digest` on queue and log and keeps valid ones; `test/old-saves.test.ts` still passes.
2. Implement. `sourceOf` is a pure string function exported from `core.ts` for the planner.
3. Run `node scripts/golden.mjs check`: only the `text` slice may move (queue and log are in it; `queueShape` hashes ids, so the parity slices hold). Then `update --reason "R3-Q1: log entries and notices gain s, a, w"`.
4. Run `test/log-fields test/log-source test/notice-weights test/quiet-routing test/store test/save-schema test/history test/old-saves test/golden-digest test/kernel-parity test/r2-codemod-parity`.

**Proves.** The foundation of the digest; "no new saved field outside the declared slices" (these live in the `log` and `queue` slices). **Expected moves:** `test/fixtures/golden-digests.json` (`text` only). Any test that deep-compares a log entry made inside `ageUp` with `toEqual` gets a row.

### R3-Q2 E.D1 (b): the 120-title weight table

**Lane** main. **Depends on** R3-Q1. **Source** about 260 (140 of it data), **tests** about 220.

**Goal.** `noticeWeightOf(title)` knows at least 120 titles, picked from a probe of the titles that actually arrive, so most of a year's notices are weighted.

**Files.** Modify `src/game/notice-weights.ts` (keep `MINOR_NOTICE_TITLES` and `noticeWeightFor` byte for byte; add `NOTICE_WEIGHTS`, `noticeWeightOf`; still a leaf). Create `test/notice-title-probe.test.ts` (opt-in with `NOTICE_TITLES=1`, the pattern of `test/notice-probe.test.ts`), `test/fixtures/notice-titles.json`, `test/notice-weight-table.test.ts`.

**Steps.**
1. Red: `notice-weight-table.test.ts` fails (no `NOTICE_WEIGHTS`). It asserts: at least 120 rows, unique, every title is a string literal somewhere in `src/` (the `literals()` scan of `test/notice-weights.test.ts:30`); every `MINOR_NOTICE_TITLES` title has w<=1; every probe sample that `neverRoute` blocks has w>=2; every probe title with tone `bad` has w>=2; the table covers at least 85% of the notices in the fixture; the w=3 list equals an explicit array in the test (a reviewed list: death, birth, marriage, divorce, diagnosis, arrest, sentencing, bankruptcy, inheritance, IPO, election, plus what the probe shows); `noticeWeightOf('not a title')` is undefined.
2. Write the probe: 24 ordinary lives (seeds by `findSeeds`), 6 rich and 4 founder lives (`playLife`, `probeLife`) to age 85; count every notice by title with tone, `neverRoute` result and a sample, passive only (a notice the player asked for stays out). Record `test/fixtures/notice-titles.json` with `NOTICE_TITLES=1 .../vt22 test/notice-title-probe.test.ts`.
3. Pick the top titles by count to reach 120 and assign weights by the rubric: 0 trivia (a stat-only update, a season line), 1 routine (report card, graduation), 2 notable, 3 life-changing. Do not touch the R1 fixture or its tests.
4. Run `test/notice-weight-table test/notice-weights test/notice-policy test/notice-acceptance`.

**Proves.** The 120-title table of E.D1. **Expected moves:** none (R1 tests are untouched by design).

### R3-Q3 E.D2 (a): the pure year planner

**Lane** main. **Depends on** R3-Q2. **Source** about 700, **tests** about 650.

**Goal.** From a queue and a log, decide what stays a popup, what folds, what merges and what the card says. No write to `g`, no draw.

**Files.** Create `src/game/hubs/year-plan.ts` (section 2; layer L4, so it may read `notice-policy`, `kernel/ledger`, `life-series`; no module-level `const` of an import), `test/year-plan.test.ts`. Modify nothing else.

**Rules (the tests pin each).**
- In play: a notice with `s` and no `support`. Everything else (no `s`, input, minigame, task, support) is untouched.
- Kept as popups: every w=3 notice; fill to `YEAR_LIMITS.notices` (3) with the best w>=2 by (w desc, `a ?? largestFigure(text)` desc, queue index asc); the cap grows with the count of w=3 up to `noticesMax` (5). A notice directly followed by a choice with the same `s` is context for it and is kept (never fold a notice before its choice).
- Folded: the rest. Each becomes a `Story` (title and text cut to 90 with the `clipInboxText` rule). Two folded stories with the same `(s, title)` merge into one: "{title}, {n} times" plus the summed `a` as money when every part has an `a`; a `MERGE_TEMPLATES` table of at most 6 titles (company results first) writes the nicer line ("3 companies lost $1.7M on $18M"). A folded story whose source already has a log line this year adds none; one without gets a log line with id `fold-<generation>-<year>-<modal id>`, tone kept, `w` kept.
- Card: `head` is the top kept or folded story by (w, magnitude), else the year's top log line by weight, else the culture line. `stories` the next 3. `money` is `moneyLine(moneyFacts(g))`, omitted when there is no life-series row. `people` up to 3 stories of group `people` not already used. `world` is the news headline of the year (the `s:'history'`, `w:0` line, emoji stripped). `groups` count every remaining story and log line by `groupOf(s)`, in display order, `lines` cut to 6. The sum of head, stories, money, people and world is at most 8 lines (people and then stories are trimmed first).
- `moneyFacts`: `cash` is `acctBalance(g, playerAcct(g))`; `netWorth` and `income` come from the newest life-series row; `delta` is against the row before. `moneyLine` prints "Net worth $X (up $Y). Income $Z. Cash $C." at most 90 characters and passes `unitFlags(text,'log')`.

**Steps.** 1. Red: the table-driven cases above on synthetic queues (a noisy tycoon year with 14 notices, a quiet year, a w=3 year with 4 life events, a notice before a choice, a duplicate pair, a `neverRoute` notice at w=1, a support notice); a property loop over 200 random queues (seeded by the file's own tiny generator) asserting the card never exceeds 8 lines, every string is within its cap, nothing is lost (kept + folded + untouched = input), and the planner is a pure function (deepFreeze the inputs, run twice, equal output); `moneyFacts.cash` equals the books for 5 seeded lives; no en-dash or em-dash (U+2013, U+2014) in any template; templates pass `unitFlags`. 2. Implement. 3. Run `test/year-plan test/notice-policy`.

**Proves.** Digest at most 8 lines; weight 0 and 1 outcomes folded; no fold before a choice; money line equals the books. **Expected moves:** none.

### R3-Q4 E.D2 (b): `closeYear`, the year book, pending asks and the store

**Lane** main. **Depends on** R3-Q3. **Source** about 720, **tests** about 600.

**Goal.** One call at the end of the store's year: resolve the year events, budget the choices, fold, queue the card, remember it; stamped by year.

**Files.**
- Create `src/game/hubs/year-book.ts`, `src/game/hubs/year-close.ts` (section 2), `test/year-close.test.ts`, `test/year-book.test.ts`, `test/year-close-store.test.ts`.
- Modify `src/game/flags.ts:26-47` (add `yearCard: { default: false, ships: '5.1.0' }` with its comment), `test/flags.test.ts:88` (eight keys becomes nine; moved-tests row), `src/game/world-flags.ts:72-110` (`'yearBook'`, `'pendingAsks'` in `PERSONAL`; the heir starts clean), `src/ui/store.ts:484` (`ageUpAction`: `const close = FLAGS.yearCard && quietModeOn(state.settings); act(close ? (g) => { ageUp(g); closeYear(g) } : ageUp)`; the catch path is unchanged).
- Modify `docs/SAVE.md` "Adding saved state": one line naming the two flags keys (they are `flags` subkeys, so `test/save-slices.test.ts` needs no row).

**Behaviour.**
1. `yearBook.last >= g.year` returns `{closed:false}` at once; a dead character does nothing.
2. Resolve the queued `yearEvents` task: remove it and call `applyFallback(g, task)` (source `events`), so the event choice and the flavor lines exist before the budget.
3. Choices: unrequested = `kind:'choice'` with `s`. Order: pending asks from earlier years first (re-queued with new ids, expired ones dropped), then this year's. Keep every choice whose script is not in `DEFERRABLE_SCRIPTS`; keep deferrable ones while the kept count is under `YEAR_LIMITS.choices`; defer the rest to `pendingAsks` (6 at most, the oldest dropped at the cap, none older than 2 years).
4. Notices through `planNotices`; the queue is rebuilt in the original relative order of what is kept; fold log lines are appended to `currentLogYear(g)`.
5. The card: `shown < YEAR_LIMITS.popupYears` pushes the `NoticeModal` last (`digest`, `text` = head, emoji 📋); otherwise the card gets `inline:true` and nothing is queued. `shown` counts cards that were popups. `yearBook` keeps the newest 3 cards.
6. Never throws: every step works on copies and assigns `g.queue` and the log once at the end; an exception returns `{closed:false}` and leaves `g` as it came in (the year is then played the old way).

**Steps.** 1. Red: `year-close`: budget (7 choices, 5 of them deferrable: 3 kept, 4 pending), a non-deferrable choice is never deferred, pending re-queue and expiry in 2 years, the card is the last item, 11th year makes an inline card, idempotent (second call changes nothing, JSON equal), a replay from an earlier state works (no foresight: a card dated after `g.year` is ignored), answering a deferred ask whose asker died does not throw (`runScript` or the `handleModal` fallback), headless `ageUp` leaves the same queue as before except `s/a/w`. `year-book`: hostile `flags.yearBook` and `flags.pendingAsks` (non-objects, 10,000 cards, 3 MB strings, a choice with 500 options) are repaired to bounds, the heir (`continueAsChild`) starts without them. `year-close-store` (the real store with the localStorage shim of `test/quiet-routing.test.ts`): `ageUpAction` with the flag off equals today; on, the queue ends with the card, `dismissNotice` on the card clears it, a mocked `closeYear` that throws leaves a playable year. 2. Implement. 3. Run `test/year-close test/year-book test/year-close-store test/flags test/world-flags test/store test/quiet-routing test/save-slices test/hub-entry`.

**Proves.** Three unrequested choices a year; extras wait 2 years; weight 0 and 1 outcomes log-only in the store flow only; the digest is the last popup for 10 years then inline; idempotent by year. **Expected moves:** `test/flags.test.ts:88`.

### R3-Q5 E.D2 (c): the store-flow harness and the acceptance sweep

**Lane** main. **Depends on** R3-Q4. **Source** about 150, **tests** about 450.

**Goal.** Play lives the way the store does and measure what the player sees.

**Files.** Modify `test/play-kit.ts:205` (`PlayOptions.close?: boolean`: after `ageUp(g)` call `closeYear(g)`; `PlayedPopup` gains `card?: boolean`; additive, default off so every other test is unchanged). Create `test/close-kit.ts` (`popupsPerYear(years)`, `spread`, `ledgerClean(g)`), `test/quiet-acceptance.test.ts` (`// ci: fast` is not used: it plays lives).

**Steps.** 1. Red: with `close:true`, per year the queue holds at most 3 unrequested choices, at most 5 kept notices and one card; the card is at most 8 lines and its money line equals `acctBalance`; every folded notice has a log line or a card line (nothing lost: text search by title in log plus card); no kept notice is folded before its choice. Lives: 6 ordinary to age 80, 4 rich (`rich:true`), 3 founders with 6 companies (`probeLife`). Print `popupsPerYear` p90, max and mean per class and the visible-log count; assert only the hard caps here (the numeric targets are asserted in R3-Q13 when the pace lane is merged). 2. Implement the kit. 3. Run `test/quiet-acceptance test/play-kit-smoke` (whichever of the existing play-kit tests exists: `grep -l "play-kit" test/*.test.ts`).

**Proves.** The caps of E.D2 on real lives. **Expected moves:** none.

### R3-Q6 E.D3 (a): the year card

**Lane** ui. **Depends on** none (it reads `unknown`). **Source** about 420 (CSS 80), **tests** about 330.

**Goal.** Draw `NoticeModal.digest` as a popup and the newest `inline` card in the Life tab; collapsed categories expand on demand.

**Files.**
- Create `src/ui/components/yearCardModel.ts` (pure leaf: `CardView`, `cleanCard`, `cardOfModal`, `inlineCard`, `GROUP_LABEL`, bounds identical to section 2), `src/ui/components/YearCard.tsx` (`YearCardPopup`, `YearCardInline`; groups as `<details><summary>People 3</summary>` so the markup is testable and works with the keyboard), `test/year-card-ui.test.ts`.
- Modify `src/ui/components/noticeModel.ts:21` (`mergeable` is false for a notice with a `digest`, read as `(m as { digest?: unknown }).digest`) and `:94` (`planHead` returns `{kind:'yearCard', modal}` when the head has a valid card), `src/ui/components/ModalHost.tsx:74` (render `YearCardPopup` before the digest merge; OK dismisses with `dismissNotice`; Enter works like `NoticeCard`), `src/ui/screens/GameScreen.tsx:196` (render `YearCardInline card={inlineCard(g.flags, g.year)}` just above `LifeLog` in the same container; `LifeLog` itself is only touched in R3-Q7), `src/ui/styles/notices.css` (tokens from `global.css`, dark mode through the existing variables).

**Steps.** 1. Red (`renderToStaticMarkup`, the pattern of `test/notice-digest.test.ts`): a full card renders headline, 3 stories, money, people, world and N group summaries with counts, the groups closed; an empty group is not drawn; `cleanCard` repairs hostile input (long strings cut, 100 groups cut to 8, non-string lines dropped, `v` wrong gives null); a card notice is not merged by `headNoticeRun`; `planHead` gives `yearCard`; every label and the aria text pass `unitFlags(text,'tooltip')` and have no dash; the markup has exactly one OK button and the heading is the first focus target (`focusWithoutScroll`); inline card has no OK. 2. Implement. 3. Run `test/year-card-ui test/notice-digest test/a11y-dialogs`.

**Proves.** The year card UI of E.D3. **Expected moves:** none.

### R3-Q7 E.D3 (b): the collapsed log

**Lane** ui. **Depends on** R3-Q6. **Source** about 220, **tests** about 230.

**Goal.** A year's lines of weight 2 or more stay visible (at most 8); lines of weight 0 and 1, and the overflow, fold into category rows with counts.

**Files.** Create `src/ui/components/logModel.ts` (`LOG_VISIBLE`, `lineWeight`, `GROUP_OF_SOURCE` copy, `viewYearLog`), `test/log-view.test.ts`. Modify `src/ui/components/LifeLog.tsx` (`entryLines` at the bottom and `YearBlock`: a year with 5 lines or fewer, or with no `w` on any line, renders exactly as today; otherwise `shown` lines then one `<details>` per collapsed group; the memo comparison adds `a.year.entries.length` it already has), `src/ui/styles/notices.css`.

**Steps.** 1. Red: a recorded tycoon year (13 lines: 3 at w=3, 6 at w=2, 4 at w=1) shows 8 and folds 5 under groups with the right counts; order inside `shown` is the log order; the lowest weights fold first when more than 8 have w>=2; entries without `s`/`w` (old saves) render as before (the existing `YearList` tests in `test/` that render `LifeLog` stay green: `grep -l LifeLog test/*.test.ts`); folded rows are keyboard operable and have a count in the accessible name. 2. Implement. 3. Run `test/log-view` and the LifeLog tests.

**Proves.** Visible log 12.5 to 8 (shape). **Expected moves:** none.

### R3-Q8 E.T5 (a): pace core and the event library

**Lane** pace. **Depends on** none. **Source** about 330, **tests** about 280.

**Goal.** One family rule for every engine, and the 372-def event library gets families without a `family` field on each def.

**Files.** Create `src/game/text/pace.ts` (section 2; imports `./memory` only), `src/game/events/families.ts` (a table: the 15 `EVENT_KINDS` of `events.ts:70-86` plus new families by theme: `ev.money` (borrow, adult-child, grandkid asks), `ev.scam`, `ev.neighbor`, `ev.partner`, `ev.health`, `ev.work.<theme>`, `ev.school.<theme>`, `ev.teen.<theme>`, `ev.era.<theme>`; only families with 2 or more members; at most 40 event families), `test/pace.test.ts`, `test/pace-families.test.ts`. Modify `src/game/events.ts:234` (`weightOf` multiplies by `paceWeight(g, key(ev), w)`), `:273` (`queueRandomEvent` calls `notePopup` when it presents). `KIND_COOLDOWN` and `EVENT_KINDS` are left in place (the families file imports `EVENT_KINDS` through a small export added at line 70).

**Steps.** 1. Red: `pace`: `paceWeight` is x0.25 within 5 years and base after, never reads a later year (state at year 2030 with a note in 2033 ignores it), `askGapOk` is false inside 4 years and true for a storyline, `paceKey` rejects a bad family, `notePopup` twice in one year keeps one entry, no `g.rng` draw (rng unchanged), a family key past the cap of 60 declared families fails the table test. `pace-families`: every `EVENT_LIBRARY` id maps to a family or to itself; each multi-member family has 2 or more real ids; across 4 seeded lives (ordinary and rich) to 80 via `playLife`: no popup family more than 6 times a life with a gap under 4 years between two (`textMetrics(...).popupFamilies`), and the same four lives have fewer repeats than with the multiplier off (`withPaceOff` test seam). 2. Implement; add the 5-year window on the 15 existing kinds as well. 3. Record `R2_PARITY_RECORD=update`, `RECORD_KERNEL_PARITY=1` and golden with the reason "event picks: family weight x0.25 within 5 years". 4. Run `test/pace test/pace-families test/events test/text-memory test/notice-acceptance test/golden-digest test/r2-codemod-parity test/kernel-parity`.

**Proves.** One shared family memory (E.T5), popup family cap. **Expected moves:** golden (all slices), `r2-parity.json`, `kernel-parity.json`; seeded event tests that pin an event id get rows.

### R3-Q9 E.T5 (b): wealth ask families

**Lane** pace. **Depends on** R3-Q8. **Source** about 230, **tests** about 240.

**Goal.** An ask family at most once in 4 years unless a storyline holds it; the 57 asks stop cycling every 2 to 4 years.

**Files.** Create `src/game/events/ask-families.ts` (all 57 ask ids in `wealth-kids/family/world.ts` mapped: for example `kid.pocket` allowance; `kid.toy kid.console kid.phone kid.computer kid.clothes kid.concert kid.party` gifts; `kid.car kid.newcar` wheels; `kid.trip kid.camp kid.vacation` trips; `kid.tuition kid.gradschool` school; `kid.bail kid.rehab kid.gamble` crisis with `storyline`; `kid.inherit kid.willfight` estate with `storyline`; friend and sibling loans share `loan`; weddings share `wedding`). Create `test/ask-families.test.ts`. Modify `src/game/events/wealth.ts:308` (`requestCandidates` skips a def whose family fails `askGapOk`, before the weight), `:336` (`queueRequests` calls `notePopup` for each presented ask; a bundle notes each part). `AskDef` and the three catalogs are not edited.

**Steps.** 1. Red: every `askDefs()` id has a family; with a stamped family 2 years ago a non-storyline ask is not a candidate and a storyline one is; across a 40-year rich life no ask family appears twice within 4 years except storylines; the per-tier popup cap `TIER_POPUP_CAP` is unchanged (`popupBudget`); a secretary-routed ask still notes the family. 2. Implement. 3. Run `test/ask-families test/wealth* test/secretary* test/golden-digest` (`ls test | grep -i "wealth\|ask"` for the real names).

**Proves.** Wealth asks as families; "asks cycle every 2 to 4 years" gone. **Expected moves:** wealth tests that pin counts of asks in a seeded rich life get rows.

### R3-Q10 E.T5 (c): company events and the career kit

**Lane** pace. **Depends on** R3-Q9. **Source** about 180, **tests** about 200.

**Goal.** The same family rule for company events (across the whole portfolio) and for the career kit's crises, and a year ledger so a tycoon's companies share one choice slot.

**Files.** Create `src/game/business/event-families.ts` (the ids in `business/events.ts:989-1014` plus `COMPETITION_EVENTS`, `EXTRA_EVENTS`: for example `inspection audit` regulator, `competitor` rivals, `lawsuit`, `strike`), `src/game/special/kit/families.ts` (crisis ids by career into 8 or fewer families), `test/biz-pace.test.ts`, `test/kit-pace.test.ts`. Modify `src/game/business/events.ts:1018` (`weightFor` x `paceWeight`) and `:1050` (`maybeBusinessEvent`: `useYearAction(g, 'pace.biz', 2)` first, so at most 2 company choices a year across all companies; `notePopup` after a present), `src/game/special/kit/year.ts:178` (`choiceRoom` also requires `useYearAction`-style room in `pace.kit`: 1 kit choice a year across careers; read-only check there, the take is in `offerChoice` at `:183`), `src/game/special/kit/crisis.ts:210` (`offer` weights by family).

**Steps.** 1. Red: a 10-company founder over 30 years gets at most 2 company choices a year and no company event family more than once in 5 years unless alone eligible; the kit gives at most 1 career choice a year across 3 careers; `YEARLY_BUDGET` and `ACTION_BUDGET` are unchanged; the existing career probes (`test/career-probe.ts` users) stay green. 2. Implement. 3. Run `test/biz-pace test/kit-pace test/career-year test/career-kit* test/business* test/company-events`.

**Proves.** Family pacing for business and the kit. **Expected moves:** tycoon and career seeded tests that pin event counts get rows.

### R3-Q11 E.D4: the 127 culture lines to 110

**Lane** ui. **Depends on** none. **Source** about 190 (127 literals plus `digestLine`), **tests** about 120.

**Goal.** Every culture line is at most 110 characters, and the log line carries no prices (they stay in the This Year menu).

**Files.** Modify `src/game/history/digest-early.ts` (80 lines), `src/game/history/digest-late.ts` (47 lines), `src/game/history/digest.ts:97-100` (`digestLine` returns `📅 {year}: {culture}`; `pricesLine` stays exported for the menu and tests), `test/era-late-digest.test.ts:19-21` (length rule becomes `> 60` and `<= 110`; moved-tests row), `test/era-early.test.ts:34-36` (upper bound becomes `<= 110`; row). Create `test/culture-lines.test.ts`.

**Steps.** 1. Red: `culture-lines`: all 127 lines are at most 110 characters, at least 60, end in `.`, pass `unitFlags(line,'digest')` with no `over-cap`, contain no U+2014 or U+2013, `digestLine(y)` equals the emoji, the year and the culture and nothing else, `thisYearNodes` still lists the prices. 2. `node scripts/voice-batch.mjs extract --files digest-early.ts,digest-late.ts --flags over-cap --out <scratch>/batch.json`, rewrite the literals (facts first, contractions, one concrete thing per line, keep the brands and the year's anchors, keep the anachronism rules: no technology before it reached any country). 3. Run `test/culture-lines test/era-early test/era-late-digest test/anachronism test/voice-batch test/voice-report test/voice-guards test/history`.

**Proves.** Every culture line at most 110. **Expected moves:** the two length asserts above; the voice report fixtures under `test/fixtures/voice` if they hold digest counts (check, add rows).

### R3-Q12 E.T6: variants for the top 60 events

**Lane** var. **Depends on** none. **Source** about 830 (700 data), **tests** about 330.

**Goal.** The 60 events that fire most get two or more extra scenes each, chosen on the text stream, so the same popup reads differently.

**Files.** Create `test/event-top-probe.test.ts` (opt-in `EVENT_TOP=1`: 20 ordinary and 10 rich lives to 85 through `playLife`, counts of `data.eventId`), `test/fixtures/event-top60.json`, `src/game/events/variants.ts` (`withVariants`), `src/game/events/variants-data-a.ts`, `variants-data-b.ts` (about 30 events each), `test/event-variants.test.ts`. Modify `src/game/events.ts:37` only: wrap the library, `export const EVENT_LIBRARY: EventDef[] = withVariants([ ... ])`.

**Design.** `VARIANTS[eventId] = { scenes: string[] }`. A scene is a template with tokens `{p}` (the person's first name), `{he}` `{his}` (from `pronouns`), `{amt}` (money in `setup.data.amt`), `{why}` (`setup.data.why`), and may start with an era gate (`@smartphone ...`, `events/era.ts`). `withVariants` wraps `setup`: call the original, then `v(g, [original.text, ...scenes])` (`events/helpers.ts:227`, one text-stream draw, shuffle-bag memory), fill tokens, run `anachronistic(g, text)` and fall back to the original text on a hit. Choices, data and `resolve` are never touched. No `g.rng` draw is added.

**Steps.** 1. Red: `event-variants`: `event-top60.json` lists 60 ids that exist; every id has at least 2 scenes; each scene is at most 140 static characters (`unitFlags(s,'scene')` has no `over-cap`), ends with "What will you do?" like the original, uses only known tokens, no dash; for each event 30 setups in different seeded states show at least 3 distinct texts and the choices and `data` equal the unwrapped setup; no new `g.rng` draw (rng after `setup` equal with and without the wrapper); a scene that mentions an era item is gated. 2. Run the probe once to write the fixture. 3. Write the data (60 events x 2 or 3 scenes). 4. Run `test/event-variants test/events test/anachronism test/text-kit test/golden-digest` and update the `text` golden slice with the reason "R3-Q12 event scene variants".

**Proves.** E.T6 and the popup-text part of the repetition targets. **Expected moves:** golden `text` slice; `test/fixtures/text-baseline-r2.json` is not re-recorded (the lead decides).

### R3-Q13 Integration and docs (runs after the four lanes merge)

**Lane** main. **Depends on** R3-Q5, R3-Q7, R3-Q10, R3-Q11, R3-Q12 (all merged first). **Source** about 40, **tests** about 250, docs about 110.

**Goal.** Prove the lanes fit and write down how the year closes.

**Files.** Create `test/quiet-integration.test.ts`, `docs/QUIET.md`. Modify `test/quiet-acceptance.test.ts` (turn on the numeric targets), `src/ui/components/NoticeSettings.tsx` (one sentence under Quiet Mode: "At the end of a year, routine news folds into one card."), `docs/KERNEL.md` section 9 index line.

**Steps.** 1. Red: `quiet-integration`: `GROUP_OF_SOURCE` in `hubs/year-plan.ts` equals the copy in `logModel.ts` for all 36 hook names plus `events`; a `YearCard` made by `closeYear` on a seeded rich life passes `cleanCard` unchanged in every field and renders through `YearCardPopup`; a tycoon life's real year gives `viewYearLog(...).shown.length <= 8`; the dark flag `yearCard` off leaves `ageUpAction` as today. `quiet-acceptance` now asserts popups a year: ordinary p90 3 and max 5, $50M p90 4 and max 6, tycoon mean 4 plus the `companies` group; and prints `textMetrics` repeated share and popup families. 2. If a number misses, tune only `YEAR_LIMITS` and the family tables, never the thresholds. 3. `docs/QUIET.md`: the fields, the weight rubric, the budget, the card, the flag, how to add a family. Test that it has no dash and names every export of section 2. 4. Run `test/quiet-integration test/quiet-acceptance test/kernel-acceptance`.

**Proves.** The popup and log acceptance of the R3 block. **Expected moves:** none.

---

## Open questions

1. R3-Q13 needs the lanes merged. If the orchestrator only merges lanes at the very end, run Q13 as the first step of the merge.
2. D20 reads as "popup for the first 10 years of a life's digests, then inline". If the owner meant the first 10 years of the feature or the player's account, only `YEAR_LIMITS.popupYears` and the `shown` counter change.
3. `closeYear` resolves the year event at age-up (the event is picked before the player answers the hook popups). The order the player sees is unchanged. If the owner wants the old timing, the card must instead be inserted before the tail task and will not be the last popup.
4. `yearCard` is a ninth flag; the R1 rule says the eight keys were "complete" (`src/game/flags.ts:7-9`). The alternative is no flag and gating on Quiet Mode alone.
5. The log line drops prices (R3-Q11) so the digest can meet its 110 cap; the `This Year` menu keeps them.
6. The quiet-year test keeps today's meaning (only the news line is ambient, so the 📅 line blocks the toddler lines in historical lives). Making the digest ambient too would print them and move seeded historical lives.
7. Nepo asks and will popups are not given families here (`business/nepo-asks.ts`, `events/will-act.ts`); `closeYear` budgets them only if their script is in `DEFERRABLE_SCRIPTS`. The line-repetition targets (5%, 8%, 3 times, 10 years) depend on the E.T3 state lines and pools; this track enforces only popup titles and reports the rest.

---

## Cross-check amendments (2026-10-22)

These override the text above. Numbered decisions are in `00-crosscheck.md` section 6.

- **C1 Group table (D31).** `GROUP_OF_SOURCE` (R3-Q3) and its copy in `logModel.ts` (R3-Q7) also map this release's module sources: `'effort.you'` to `work`, `'knowledge.core'` to `money`, `'world.frontier'` to `world`. `s` of a module entry is the module id (the entry id is the module id, `kernel/registry.ts`), which satisfies the pattern in decision 1. R3-Q13 compares the two copies for these three as well.
- **C2 Flag (D4).** R3-Q4 also edits the header comment of `src/game/flags.ts` ("These eight keys are the complete R1 set") to name the ninth key `yearCard` (R3). The moved row for `test/flags.test.ts:88` stands. The flag ships dark; the lead flips the default and the version together in the release commit and runs the store tests that call `ageUpAction` (`store`, `quiet-routing`, `year-integration`, `year-close-store`) with the card on.
- **C3 Repetition (D32).** R3-Q13 asserts on the 13-life probe through `textMetrics`: repeated share at most 5% (ordinary) and 8% (rich), no line more than 3 times in a life, no popup scene text twice in 10 years; state lines once in 5 years where the R2 `stateLine` kit already enforces it. A miss is reported with the numbers and the lead decides; the threshold is never relaxed in the test. After the other tracks merge, the lead re-runs `test/quiet-acceptance.test.ts` (R3-G12 lists it) because Knowledge, Effort and Fog add notices and log lines.
- **C4 Close timing (D33).** Accepted: `closeYear` resolves the queued `yearEvents` task with `applyFallback` (the same function the store calls at the head of the queue, `offline.ts` `resolveTask`), so the event is picked before the hook popups are answered. Only with the flag on. Add one case to `year-close-store.test.ts`: the year event is chosen from the same state as the old order when the hook popups change no money.
- **C5 Sources of this release.** The Effort burnout notice and the Knowledge standing-order lapse line carry no weight; `noticeWeight` defaults them to 2 (kept). The Knowledge hazard notice is bad-tone, so `neverRoute` keeps it at 2 or more. No row is needed in `NOTICE_WEIGHTS` for them.
- **C6 Hot files.** `types.ts` hunks (483 to 527) are Quiet's; Knowledge's `asOf` hunks (788, 821) are elsewhere. `world-flags.ts` PERSONAL gains `'yearBook'` and `'pendingAsks'` in the same array other tracks edit. `test/fixtures/golden-digests.json`, `r2-parity.json`, `kernel-parity.json` are regenerated at the merge (`00-crosscheck.md` section 4); the per-task re-record steps above run on the track branch only.
