# Quiet years

Since R3 (v5.1.0) a year ends with one card instead of a pile of popups. This page is the vocabulary, the rules, the numbers and the
recipes. The code is `src/game/hubs/year-plan.ts` (the planner), `hubs/year-book.ts` (what the close remembers), `hubs/year-close.ts`
(the close), `src/game/text/pace.ts` (the family rule) and, for the screen, `src/ui/components/yearCardModel.ts` and `logModel.ts`.
Plain hyphens only: `test/quiet-integration.test.ts` fails on an em-dash or an en-dash here, and on an export this page does not name.

## The fields

A log line and a popup can say where they came from, how much money they are about and how much they matter. All three are optional,
and an old save has none of them.

- `s` is the source: the name of the yearly hook that was running (`health`, `wealth`, `business`), the id of a module (`world.frontier`)
  or `events` for the year events. It is 1 to 24 characters matching `/^[a-z][a-zA-Z0-9.]*$/`. `aging.ts` sets it around each hook with
  `withLogSource` in `src/game/core.ts` (it nests, and `currentLogSource` reads it), so no call site names it. A line or a popup the
  player's own action made has no `s`, and the close never touches it.
- `a` is an amount: a whole number, finite, at most 1e15 in size. A call passes it in `LogOptions` (the fifth argument of `log`) or in the
  options of `notice`. Anything else is dropped.
- `w` is the weight, 0 to 3 (`LogWeight` in `src/game/types.ts`). A `LogEntry` and a `NoticeModal` carry the three fields; a `ChoiceModal`
  carries `s`, which is how the close tells a choice nobody asked for from one the player started.

## The weight rubric

| w | Means | Example | What the close does |
|---|---|---|---|
| 0 | trivia | a reaction or an aside, a stranger turned down | log only |
| 1 | routine | a report card, a season over, a school milestone | log only |
| 2 | notable (the default) | a title with no row, and every bad, health, legal or large-money one | may stay a popup |
| 3 | life-changing | a wedding, a split, a diagnosis, an arrest | always stays a popup, never folded |

A notice carries its own `w`, else its title's row in `NOTICE_WEIGHTS` (`src/game/notice-weights.ts`, `noticeWeightOf` reads it, about 150
titles), else 1 when it has the R1 `weight: 'minor'`, else 2. `noticeWeight` in the planner is that rule, and one more: a notice that
`neverRoute` blocks (bad tone, a health or legal word, a large figure) is never under 2. What hurts or costs a lot is never trivia.
`noticeWeightFor` is the R1 reader and is unchanged. The table is a leaf: a title is added in one line, with a test row.

## The budget

`closeYear` runs in the store only (`ageUpAction` in `src/ui/store.ts`), in the same step as `ageUp`, when the flag `yearCard` and Quiet
Mode are both on. Headless `ageUp` never calls it, so a test that reads `g.queue` after `ageUp` sees what it always saw.

1. It resolves the queued year events task itself, with the same `applyFallback` the store would use, so the year's event and flavor
   lines exist before it counts.
2. It budgets the choices nobody asked for (a choice with an `s`): 3 unrequested choices a year (`YEAR_LIMITS.choices`). A choice of a
   script outside `DEFERRABLE_SCRIPTS` (a company, a career, a crime, a nation) is always kept and counted first. A choice of the
   three scripts in that set (`events.random`, `wealth.ask`, `wealth.bundle`) fills what is left; the asks that waited come back before
   this year's. What does not fit waits in `flags.pendingAsks`: at most 6 waiting asks, each for at most 2 years.
3. It plans the notices with `planNotices`: 3 notices stay popups (the room grows to 5 with the life-changing ones), chosen by weight,
   then by the money they are about. A notice right before a choice of its own source is that choice's context and stays. The rest fold:
   one line of the log for each, and a line of the card.
4. It queues the card last and writes `flags.yearBook` (`YearBook`: the last year closed, how many cards were popups, the newest 3
   cards). `readYearBook` and `readPending` sanitize what they read; `writeYearBook` and `writePending` sanitize first. A card dated
   after `g.year` is dropped, so nothing reads the future.

The close is idempotent by year: a second call for the same year changes nothing. It draws no number, moves no money and never
throws. A step that fails puts the game back as it came in (the queue with the year events task in it, the log, and the draws, counters
and flags the year events step touched), and the report (`CloseReport`) says `closed: false`, so the store plays the year the old way and
the task picks the events it would have picked.

## The card

`YearCard` (`src/game/types.ts`) is at most 8 lines, every string at most 90 characters: the headline, up to 3 stories, a money line
that equals the books (`moneyFacts` and `moneyLine`), up to 3 people, and the news line of the year. Everything else is counted in
collapsed groups (`YearGroup`: People, Health, Work, Your companies, Money, Law and order, The world, Everyday), each with its count
and its best 6 lines. `buildCard` makes it. `GROUP_OF_SOURCE` in `year-plan.ts` says which group a source belongs to, and an unknown
source is Everyday.

The card is a popup for the first 10 years of a life (`YEAR_LIMITS.popupYears`: the last popup of the year), then it is drawn inline in
the Life tab and nothing is queued. An heir starts a new count. The screen reads the card as `unknown`: `cleanCard` in
`yearCardModel.ts` bounds every list and string and gives a `CardView`, `cardOfModal` reads the one a popup carries and `inlineCard`
reads the one the book kept. The Life log folds a busy year the same way: `viewYearLog` in `logModel.ts` shows at most `LOG_VISIBLE`
(8) lines, the notable ones first, and folds the rest into one row for each group, with its count. `lineWeight` reads a line's weight
(a line with none is 2). `logModel.ts` keeps a copy of the group table; `test/quiet-integration.test.ts` fails if the two differ.

## The flag

`yearCard` in `src/game/flags.ts` (`FLAG_DEFS`) ships in 5.1.0 and is on by default since the release commit flipped it with the version
(`?flags=-yearCard` turns it off for one visit).
With it off, `ageUpAction` plays the year as it always did (`test/quiet-integration.test.ts` plays 12 years both ways). With it on and
Quiet Mode on, the year closes. Settings, under Quiet Mode, says so in one sentence while the flag is on.

## Pace: families

A popup family is a kind of thing the game keeps asking about. The rule is `PACE` in `src/game/text/pace.ts`, with one key for every
family (`paceKey`: `pop.<engine>.<family>`, the engines are `ev`, `ask`, `biz` and `kit`).

- Events, company events and the career kit are weighted. A family that spoke within the last 5 years (`PACE.window`) weighs x0.25
  (`paceWeight`, `popupSeen`). A roll is unchanged: the weights move the pick, not the chance that something happens.
- Asks wait, and they run out. A family that spoke within the last 4 years (`PACE.askGap`) is not offered again, unless a storyline
  holds it, and a family that was offered 6 times in a life (`PACE.askLife`) is not offered again at all, a storyline included
  (`askGapOk`, the one place: no ask site counts for itself). This is the roadmap's "a popup family at most 6 times a life" (lead
  decision L2) for the ask families, which the gap alone did not hold in a rich life: one family came 15 times in 60 years, 4 years
  apart. A family that has had its 6 is not asked about again that life, so a rich life gives away less once it has heard each family 6
  times.
- The memory is the text kit's family record (`flags.textMem.f`), so the rule adds no saved field, and every reader is pure: no draw,
  no write, nothing after `g.year`. The engine calls `notePopup`, the one writer, where it presents. The record of an ask family keeps its
  years for the whole life (`noteFamily` with `lifetime`; every other family forgets a year 10 behind), at most 12 of them, and
  `familyUses` counts the ones not after `g.year`. A new life starts a new count: the text memory is a personal key, so an heir starts
  clean.
- The text memory holds 120 families in all, so the engines declare at most 60 families (`PACE.maxFamilies`) between them and leave
  the rest to the text pools. Today that is 32 event families, 14 ask families and the company and career ones.

### How to add a family

1. Name it: a lower case letter, then letters, digits and dots, 40 characters at most. `paceKey` throws on a bad one when the table
   loads, so a typo fails at once.
2. Put the ids in the table of its engine. An event goes in `EVENT_FAMILIES` (`src/game/events/families.ts`, read with `eventFamily`),
   an ask in `ASK_FAMILIES` (`src/game/events/ask-families.ts`; an id ending in `!` is a storyline ask), a company event in
   `src/game/business/event-families.ts` and a career crisis in `src/game/special/kit/families.ts` (keyed by career and crisis id,
   because ids repeat across careers). A new ask or event with no family has only its own cooldown, and `test/ask-families.test.ts`
   fails on an ask that has none.
3. Count it: the families of all four engines stay under `PACE.maxFamilies` (60). `test/pace-families.test.ts` and `test/pace.test.ts`
   do the counting.
4. A script whose choices may wait for a year with room goes in `DEFERRABLE_SCRIPTS` in `year-close.ts`. Do that only for a choice
   that is still true a year later. A decision that cannot wait (a company, a crime) stays out and is counted first.
5. The picks move, so every seeded life moves: record `golden-digests.json`, `r2-parity.json` and `kernel-parity.json` again with
   `node scripts/golden.mjs update --reason`, `R2_PARITY_RECORD=update` and `RECORD_KERNEL_PARITY=1` under Node 22 (the CI version),
   and add a row for each moved test to `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md`.

## The numbers of the roadmap

`test/quiet-acceptance.test.ts` plays 6 ordinary lives, 4 rich ones and 3 founders of six companies the way the store does, and
asserts the hard caps of the close on every year: at most 3 unrequested choices, at most 5 kept notices, one card, a money line that
equals the books, and nothing folded without a record. It also states the roadmap's own numbers.

- **Popups a year count what arrives (lead decision L1, not yet the owner's).** Ordinary lives p90 3 and max 5, $50M lives p90 4 and max
  6, a tycoon's mean 4 plus the companies card: the modal popups that come by themselves after the store flow (the close, Quiet Mode, the
  digest). The outcome of a choice the player answered is a reply, not an arrival, and the card is the popup the roadmap adds. The other
  readings (every popup the player sees, as the audit counted, and what `ageUp` queued before the close) are measured and printed.
  The reading is consistent with the budget (3 unrequested choices and 3 notices is the $50M max of 6), and it is **not** what the player
  sees. On the audit's reading, every popup of the store flow with the outcomes of answered choices in, the roadmap is **not met**, and
  `test/quiet-acceptance.test.ts` only guards that it does not get worse. The numbers (p90 / max, tycoon mean) from the lives of that file:

  | reading | ordinary | $50M | tycoon |
  |---|---|---|---|
  | the roadmap | 3 / 5 | 4 / 6 | mean 4 plus the card |
  | arrives (asserted, L1) | 2 / 5 | 3 / 4 | mean 3.1 |
  | seen, answered outcomes in (guarded) | 4 / 10 | 6 / 10 | mean 6.1 |
  | seen, the close off (the old flow) | 4 / 9 | 7 / 10 | mean 5.9 |
  | seen, `YEAR_LIMITS.choices` 2 (measured once, not kept) | 4 / 8 | 5 / 6 | mean 4.4 |
  | seen, `YEAR_LIMITS.choices` 1 (measured once, not kept) | 3 / 7 | 3 / 5 | mean 2.4 |

  What is left is the owner's call, and none of it is a small change: either sign L1 and change the roadmap line to arrivals, or move the
  popups the player sees. The choices that move them are the budget (2 does not reach the ordinary p90 and a rich p90 of 4; 1 reaches
  everything but the ordinary max, which is the arrests, funerals and other chains of several decisions), more scripts in
  `DEFERRABLE_SCRIPTS` (the family and health choices that are still true a year later), and folding the outcome of an answered choice
  into the log when it is calm. A budget or a deferral also moves what a rich life is asked for, so the goldens and the money of a rich
  life move with it.
- **A tycoon's visible log** is at most 8 lines a year.
- **Repetition is about lines of the life log**, on the 13-life probe of `test/text-probe.ts`, with a line compared as
  `test/text-metrics.ts` compares it (lower case, every run of digits one `#`): repeated lines at most 5% (8% for a rich life), no line
  more than 3 times in a life, no line twice within 10 years, a state line once in 5 years. Popup scenes are not lines: they follow family
  pacing. Where the rule is a bar the case asserts it: the event library's popup titles at most 6 a life, as `test/pace-families.test.ts`
  does, an ask family at most once in 4 years (`PACE.askGap`, a storyline bar) and an ask family at most 6 times in a life (`PACE.askLife`,
  rich lives included, a storyline family too). Where the rule is a weight (events, company events, the career kit) a family may come
  again within 5 years, so those readings are printed for every engine and not asserted. On the 13 lives: events, one pace family 7 times
  in a life at most and two tellings as close as 1 year; asks, no family more than 6 times in a life and never closer than 4 years (before
  the cap one family came 15 times in a 60-year rich life, and 27 family-lives went over 6). A popup family "at most 6 a life" is held for
  event titles and for the ask families (R3 `00-crosscheck.md` L2); the rich lives meet the cap (5 of the 6 have a family at exactly 6
  tellings, and a family spends its 6 in 20 to 27 years).

A threshold is never loosened to fit a number: a miss is fixed in the text it comes from.

## Repetition: how a line is kept from saying the same thing twice

A bag or a window of lines keeps a pool from repeating at once, but nothing in a pool knows what the log said 8 years ago. These are the
mechanisms that do, and the order to reach for them.

1. **Put the difference in the line.** The probes fold every run of digits into `#`, so "my 4th pro season" and "my 9th pro season" are
   one line. `ordinalWord` in `src/game/text/ordinal.ts` writes the season, the school year and the like as a word up to the twentieth,
   so two of them are never the same line.
2. **Give a repeating line as many wordings as a life needs.** A pool in `src/game/text/pools.ts` (`defineLines`, `pickLine`, a
   row in `test/text-lines.test.ts`, at most 60 static characters a line, every line naming every slot). A pool of 12 lines or fewer
   is a bag: it deals every line before it starts again, but it can repeat a line at the seam of two cycles, so a line that comes round
   every 3 years wants more than 12 (a window: it never repeats one of its last 6 to 8 picks).
3. **An event outcome is not told twice in 10 years.** `res()` in `src/game/events/helpers.ts` writes the outcome sentence once;
   `text/told.ts` keeps a ring of the sentences with the year (`toldLately`, `noteTold`), and a sentence told within `TOLD_YEARS` is not
   written again (the popup still shows, the log id is still taken). The default event cooldown is 11 years for the same reason.
4. **One sentence in two pools is one sentence.** The flavor lines remember their words as well as their pool and index
   (`flavorText` ring in `events/flavor.ts`), because the era packs began as copies of each other.
5. **A state line speaks no faster than its row says.** `index.crash` and `index.boom` wait 6 years between lines, so four index days
   never fit in a decade.

## Where things are

| What | File |
|---|---|
| Types: `LogWeight`, `LogEntry`, `YearGroup`, `YearCard` | `src/game/types.ts` |
| `withLogSource`, `currentLogSource`, `LogOptions`, `log` | `src/game/core.ts` |
| `NOTICE_WEIGHTS`, `noticeWeightOf`, `noticeWeightFor` | `src/game/notice-weights.ts` |
| `YEAR_LIMITS`, `GROUP_OF_SOURCE`, `groupOf`, `noticeWeight`, `Story`, `YearMoney`, `moneyFacts`, `moneyLine`, `planNotices`, `buildCard` | `src/game/hubs/year-plan.ts` |
| `YearBook`, `PendingAsk`, `readYearBook`, `writeYearBook`, `readPending`, `writePending` | `src/game/hubs/year-book.ts` |
| `DEFERRABLE_SCRIPTS`, `CloseReport`, `closeYear` | `src/game/hubs/year-close.ts` |
| the `yearCard` flag, in `FLAG_DEFS` | `src/game/flags.ts` |
| `PACE`, `PaceEngine`, `paceKey`, `notePopup`, `popupSeen`, `paceWeight`, `askGapOk` | `src/game/text/pace.ts` |
| `TOLD_YEARS`, `toldLately`, `noteTold` | `src/game/text/told.ts` |
| `ordinalWord` | `src/game/text/ordinal.ts` |
| `EVENT_FAMILIES`, `eventFamily` | `src/game/events/families.ts` |
| `ASK_FAMILIES` | `src/game/events/ask-families.ts` |
| `withVariants` (the 60 most frequent events open with extra scenes) | `src/game/events/variants.ts` |
| `CardView`, `cleanCard`, `cardOfModal`, `inlineCard` | `src/ui/components/yearCardModel.ts` |
| `LOG_VISIBLE`, `lineWeight`, `viewYearLog` | `src/ui/components/logModel.ts` |
