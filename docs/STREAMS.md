# Streams

Where luck comes from since R2 (v5.0.0), and the rules that keep one draw from moving another.

## Why

`g.rng` is one shared sequence. Every roll the player causes takes the next number, so one extra roll in a menu changes everything
drawn after it. That is fine for the player's own luck. It is wrong for the world (a war ten years on must not depend on whether
you opened a menu) and for words (one more line in a pool must not change the next fight). So those two have streams of their own.

## Named streams (`src/game/kernel/streams.ts`)

- `stream(g, tag, year, id?)` returns a generator of numbers in [0, 1). It is stateless: the same arguments give the same sequence,
  and it never reads or writes `g.rng`, `g.nextId` or a flag. The seed is the life without its generation suffix, so heirs share it.
- `outcomeStream(g, tag, year, id?)` is the same for a roll whose result only shows once `year` is over. A Time Machine jump back to
  that year re-rolls it, and every year that ended before the jump keeps its luck.
- A tag matches `^[a-z][a-z0-9._-]{0,31}$`. One tag per module. The id is the entity (a country, a company, a person).
- A world step takes luck from a stream only. `test/world-streams.test.ts` guards `src/game/kernel/`, `world/`, `modules/`, any file
  that calls `registerModule(` and any file with `// world-step` in its first 10 lines. In those files `rand`, `randInt`, `chance`,
  `pick`, `shuffle`, `.rng`, `Math.random` and `Date` are findings.
- A roll that is really the player's own, inside such a file, carries `// rng-ok: <reason of 12 or more characters>` on its own
  line or on the line before it.

## Words: `pickLine` and `pick`

- A prose pool (lines the player reads) uses `pickLine(g, lines)`, or `pickSite(g, lines, site)` when the lines carry `${}` holes.
  Both remember what was said lately (`flags.textMem`) and draw from the text stream, never from `g.rng`. A pool of one line draws
  nothing.
- An identity pool (a name, a title or anything stored on a person, an asset, a flag, or something the code branches on) stays
  `pick(g, ...)`. `eraPickPlain` and `vPlain` are the identity versions of `eraPick` and `v`.
- A status line that comes back every year (a market, an allowance, "around me") is a row of `STATE_TABLE` in
  `src/game/text/state-table.ts` and one `stateLine(g, key, value, { id?, slots? })` call, never a hand-written "once in five
  years" gate. It speaks when the value's band changes (at least 2 years after the last line) or after 5 quiet years, in 3 to 6
  variants that never repeat the last two. It draws nothing (a hash of the life, year and key picks the variant) and keeps its
  records in `flags.textMem.s`, at most 120.
- `scripts/codemod-pickline.mjs` finds the prose pools still written with `pick`. A pool that must stay `pick` is listed in
  `scripts/codemod-pickline-skip.json` with a reason, and `test/r2-pickline-ratchet.test.ts` fails on any other.

## The text stream

- The n-th text draw of a year is a pure function of the life id, the Time Machine outcome tag and the year: `textUnit(g, year, n)`.
  `n` is the cursor, the string `'<year>,<count>'` in `flags.textMem.c`. It restarts at 0 when `g.year` changes, so a yearly step
  is idempotent by its year stamp. Reload, replay and `structuredClone` carry it with the state.
- `textRand(g)` takes the next value. `textRng(g)` gives `int`, `chance`, `pick` and `shuffle` on it. `textLineId(g)` is a log id
  for a line whose count depends on text, so that count never moves `g.nextId`.
- Anything that decides state (which age a milestone lands on) must not read the cursor. It reads a keyed stream, for example
  `outcomeStream(g, 'flavor.milestone', g.year, id)`.
- An heir has a new life id and an empty memory, so their text is their own. A Time Machine jump re-keys the year it lands in.

## Tests

- No new `seed: <digits>` pin. `test/seed-kit.ts` has `findSeed(pred)` for a life with some property, and the ratchet is
  `test/seed-pins.test.ts`. Remember that `makeTestGame` has one life id, so vary `g.lifeId` to vary text.
- `test/r2-text-isolation.test.ts` plays lives with one extra text draw every year. It must change text and nothing else.
- `test/fixtures/r2-parity.json` is a canary: `g.rng` and ten slices after every year of 12 lives. A moved canary means a draw
  was added, removed or reordered. Do not re-record it without a reason: `R2_PARITY_RECORD=update` with `R2_PARITY_REASON`.
  A digest rounds a number that is not an integer to 9 significant digits (`PARITY_DIGITS`): `Math.log`, `Math.exp` and
  `Math.pow` differ in the last bit between CPUs and between Node 22 and 24, and the engine keeps a few unrounded floats, so the
  exact bits would fail on every machine but the one that recorded them. A divergence the canary reports is a real move.
- `test/stream-isolation.test.ts` adds one draw to one stream in one year and checks that only the slices of that stream's row in
  `STREAM_SLICES` (`test/stream-tap.ts`) change. A new `stream(g, 'tag', ...)` or `outcomeStream(g, 'tag', ...)` needs a row in the
  same commit, and the tag must be a string literal so the table can see it. A leak outside the row is a bug, never a reason to
  widen the row.
- `test/replay-purity.test.ts` ages one life five more years three ways (a `structuredClone`, a JSON reload through `migrateSave`,
  a Time Machine snapshot loaded at the same age) and compares the nine slice digests each year. A failure is a purity bug.
