# AnotherLife v5.1.0

Release R3, "Effort, fog and quiet years": work that answers to how hard you push, numbers you have
to find out, and a year that ends with one card. Saves from v5.0.0 and older load and continue.

## What's new

- **Odds with named reasons.** Research in product, Heavy and Operations R&D, deep tech, the AI
  capability tracks and the Workshop shows its odds with the terms that made them: "Odds 62%: team
  +9, funding +7, hard field -12, tired -4". The terms are team, funding, crew, tools, know-how,
  hard field, rival pressure, public research, bold plan and tired. A game studio has no odds, so
  its engines show their pace in words. At the default ambition and pace the numbers are the ones
  v5.0.0 gave.
- **Ambition and posture.** Ambition is hidden. It comes from willpower, discipline, five talents
  and what your results did to it, and nothing shows before 18. From 18 the Profile shows a word
  (Easygoing, Steady, Driven, Hungry or Relentless), and Life Priorities lets you pick a pace for
  the year: take it easy, keep a steady pace or push hard. The choice starts at the next age-up and
  holds until you change it. Ambition and pace move your speed between 15 percent slower and a
  quarter faster than steady, never more, and a bold plan shows as its own line in the odds.
- **Focus weeks and burnout.** You have 12 focus weeks a year. They replace the separate caps of
  Study Harder, club practice, lessons and computer tutorials, and the Workshop's builds and
  brainstorms count weeks too. A week inside the old cap is worth what it was. Past it, a week
  still works at half value, so a fourth Study Harder runs instead of being refused. After 12 weeks
  each extra week is overtime and adds fatigue, and the 25th week is refused: "You can't fit
  another week into this year." Tired work is slower and its odds drop. At fatigue 85 you burn out:
  "You pushed past your limit. You're easing off this year." The year ahead is lean, and ambition
  drops a little.
- **Failed research teaches.** A project that fails banks know-how in its own field, more the
  further it got, and the next try there starts with better odds. Know-how is worth at most 15 odds
  points whatever the plan, and an idle field loses 5 percent of it a year. A win banks none, but it
  lifts ambition a little. A failure says why it failed ("The budget was too thin for a field this
  hard.") and what it taught.
- **Estimates, with words and chips.** By default the game stops handing you every hidden number.
  A market of an industry you are not in, a rival's quality and technology, a candidate's skill,
  the odds of a vote or a coup, how much a stock swings, what a private company is worth and the
  figure after "about" in a purple hint read as estimates: `$4.2M` when the reading is sharp, `about
  $4M`, `$3M to $5M`, or only a word ("unlikely", "a long shot", "in the millions"). Three dots say
  how good the estimate is, and "as of 2023" shows once a reading is 2 years old. A band holds the
  true number about 8 times in 10. Your own books and the markets of your own industry stay exact.
- **Look closer.** A screen with estimates ends with one group, Look closer. Each row is a way to
  read those numbers (a trade title, a report, an analyst, diligence on a deal, an investigator),
  with its fee and how far it narrows the estimate. The fee follows the size of what is read and the
  country, never your cash. A row is greyed out with the reason when you can't buy it now. Buying
  the same source twice in a year is refused and costs nothing.
- **Illegal intel, with real risk.** An informant or a hacker (who needs the internet) reads
  sharper than a report or an analyst, asks before you buy, and adds heat. Every year the heat is a
  chance of being found out: 5 percent plus 6 percent for each point of heat, at most 50 percent. A
  hit puts Corporate Espionage on your record and raises your wanted level and notoriety. The heat
  halves each year.
- **The Intelligence Briefing.** One group in the Assets tab shows what you have researched,
  stalest first, how old each reading is, a Refresh for each, the Standing orders dial (0 to 3: the
  trade press, then analysts, then a desk on retainer) and your heat in words. It stays hidden
  until you have a reading, a dial or heat.
- **Realistic and Exact in Settings.** The Information card has two choices. Realistic is the
  default. Exact prints every number as before. It changes what is shown and nothing else: the
  same life plays the same in both.
- **The year card.** When a year ends, Quiet Mode (on by default) closes it with one card: a
  headline, up to 3 stories, a money line that matches the books, up to 3 people and the news of the
  year. It is a popup for the first 10 years of a life and then sits in the Life tab. Everything
  else is counted in groups (People, Health, Work, Your companies, Money, Law and order, The world,
  Everyday), each with its best lines. The Life log shows at most 8 lines of a busy year and folds
  the rest by group. The year digest line is shorter too: the year and one line of culture, with no
  prices.
- **Fewer popups.** A year brings at most 3 chance events and asks that nobody asked for. The rest
  wait, for 2 years at most, and 6 can wait at once. At most 3 notices stay popups (up to 5 when
  some are life-changing), chosen by how much they matter and what they cost. The others become one
  line of the log each. A wedding, a split, a diagnosis or an arrest always stays a popup, and a
  choice about a company, a career, a crime or a nation is never held back.
- **Less repetition.** A kind of event that spoke in the last 5 years is picked a quarter as often.
  An ask is not offered again within 4 years, and at most 6 times in a life. An event outcome is not
  told twice in 10 years, and an event waits 11 years to return unless it has its own wait. Seasons
  and school years are written as words, so "my fourth pro season" and "my ninth" are different
  lines. The 60 most frequent events open with extra scenes. A test holds repeated lines to 5
  percent of a life's log (8 percent for a rich life) on the 13-life probe.
- **The frontier.** From 2027 on, the world's research can run ahead of the calendar. A disclosed
  breakthrough, yours or a rival's, moves its field ahead by years (12 at most), puts public
  research into the field that anyone can use (up to 18 odds points), and a rival may follow in
  a few years and add rival pressure (up to 8 points). The odds line says "public research" and
  "rival pressure" when they apply. In the Workshop, a field that is ahead pulls the rival's
  deadline for a future idea closer, and the idea screen says by how many years. A life that never
  meets a breakthrough has no frontier at all.

## Under the hood

- **One effort engine** (`docs/EFFORT.md`, `src/game/effort/`). A task's quote gives the odds,
  years, quality and the reasons from the budget, the crew, the tools, know-how, the field, rivals,
  public research, the plan and the owner's fatigue. It draws no number, books no dollar and writes
  nothing, so it is safe in a menu. Money buys odds and speed, never a lower price, and a task's
  cost never scales with wealth. A slowdown of a quarter of a year or less does not add a year to a
  project. The one yearly step, `effort.you`, runs after the household and is idempotent.
- **Seven systems moved onto it** (`docs/EFFORT-MIGRATION.md`). Product, Heavy and Operations R&D,
  deep tech, the AI capability tracks, the studio engines and the Workshop keep their old function
  names as wrappers. `test/fixtures/effort-parity.json` was recorded on unmodified v5.0.0 code. At
  the default owner the odds and quality match it within 1 point, the years and prices match
  exactly, and a scripted life leaves `g.rng` as it was. One declared exception: a hired manager
  rated 90 or more adds up to 3 odds points to product, Heavy and Operations R&D, as a "steady CEO"
  line.
- **Knowledge** (`docs/KNOWLEDGE.md`, `src/game/knowledge/`). An estimate is a hashed draw of the
  life, the key, the year and the source, never `g.rng`, so the same screen twice in a year is the
  same text. Coverage is tested over 10,000 draws for a passive guess, every source, two sources
  merged and an aged reading. Your readings are kept in `flags.know`: at most 120 rows, none older
  than 12 years, none dated after the current year, and an heir starts clean. Fees go through the
  ledger under a new reason, `intel` (an illegal source pays under the existing `bribe`). The heat
  hazard rolls on the named stream `intel.risk`.
- **Fog** (`docs/FOG.md`). Ten screens read their hidden numbers through Knowledge. Offers, hires,
  events and rolls still use the true values, so fog changes what is shown and moves no golden
  digest. The test suite runs in Exact mode, so every older assertion holds.
- **The year close** (`docs/QUIET.md`). Log lines and popups can carry a source, an amount and a
  weight (`s`, `a`, `w`), all optional. `closeYear` runs in the store only, in the same step as
  `ageUp`, and is idempotent by year. It draws nothing, moves no money and never throws. If a step
  fails, the queue and the log are put back and the year plays the old way. Headless `ageUp` is
  untouched. What waits and what the close remembers sit in `flags.pendingAsks` and
  `flags.yearBook`, both personal and repaired to bounds on every read.
- **Pace families** (`src/game/text/pace.ts`). One rule, `PACE`, paces four engines (events, asks,
  company events and the career kit) from the text kit's family record, so it adds no saved field.
  Every reader is pure. The ask limit is held in one place, `askGapOk`.
- **The frontier** (`docs/WORLD.md`). `g.world.frontier` is a bounded shard, written by one
  function, `applyDisclosure`, which refuses history (2026 and earlier) and the future. Luck comes
  from the named stream `frontier`. The yearly step `world.frontier` fades public research and
  lets a rival follow. It is idempotent and does nothing with no shard.
- **A flag that ships on.** `yearCard` is the ninth key of `FLAG_DEFS`. It ships in 5.1.0 and is
  on by default, and `?flags=-yearCard` turns it off for a visit.
- **Ceilings and guards.** Every growth term has a cap and a 100x probe row. Long probes hold the
  engine, Knowledge and the frontier inside their caps, and a sweep holds each of the seven systems
  to 15 know-how points under every plan. An opt-in three-life playthrough
  (`R3_PLAY=1`, `scripts/r3-playthrough.ts`) plays the real store flow and writes the transcript
  and the saves for the screenshots. Every pinned number the release moved has a row in
  `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md`.

## Seeds

Existing seeds play differently again. Event, ask and company event picks are paced now, and an
event waits 11 years to return, so the same seed gives another life from this version on, and rich
lives hear fewer asks. The research systems draw in the same order as before. A save loads and
continues from where it was.

## Saves

Saves from v5.0.0 and older load. Every new field is optional, checked and bounded when it is
read: your ambition and pace, your readings, the year book, the waiting asks and the frontier. An
old save has none of them, so it starts with no readings, no frontier and a steady pace, and the
schema is still 3. The Information choice is kept with your other settings, and with none kept the
numbers are Realistic.
