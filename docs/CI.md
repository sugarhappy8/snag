# CI

The workflow is `.github/workflows/ci.yml`, named `CI` (`release.yml` listens for that name). It runs on pull requests,
on pushes to `main` and `release/**`, and by hand from the Actions tab. Pushes to other branches start nothing here: a
track that wants CI before it merges opens a draft PR against the release branch.

## The jobs

| Job | What it does |
|---|---|
| `checks` | `ci-shard.mjs --verify 4` (every test file is in the fast tier or a shard), typecheck, the voice report (warning only), `vite build`. |
| `fast` | The guard tests marked `// ci: fast`, one run, two workers. |
| `test` | Four shards in a matrix. Each runs the files `ci-shard.mjs <i> 4` prints, with `SLICE=<i>/4` set for the seed-sliced files. |
| `aggregate` | Downloads the shard artifacts and merges the sliced files with `SLICE=merge` (see the seed-sliced files below). Prints the timing summary. |
| `gate` | Named `CI gate`. Fails unless the four jobs above passed. This is the one required status check. |

## The shards

`scripts/ci-shard.mjs` plans the shards, not `vitest --shard`, because vitest cuts equal file counts and five files are
45% of the run time. It spreads files by seconds, longest first, from `scripts/test-timings.json`. A file missing
from that file weighs 5 seconds. `test/timings-sequencer.ts` (named in `vite.config.ts`) starts the heaviest files first
inside a shard. Locally, `npm test` still runs everything.

Useful commands: `node scripts/ci-shard.mjs --plan 4` (seconds and file counts per shard), `--verify 4` (coverage problems),
`2 4` (the files of shard 2).

## The seed-sliced files

Five files are 45% of the run time, so each shard runs a slice of their seeds: `simulate`, `era-features`,
`main-character-life`, `sector-story` and `anachronism`. A sixth file, `ledger-conservation` (R2: forty seeded lives of a
hundred years with heirs, the books checked after every step), is sliced the same way, ten lives to a shard;
`ledger-conservation-fast` plays three of them in the fast tier. If a shard goes past the 12 minute wall, lower
`PROBE_ACTIONS` in `test/ledger-probe.ts` before touching the lives or the years. The six are the `split` list in
`scripts/test-timings.json`, they use `test/shard-kit.ts`, and `ci-shard.mjs --verify` fails if the two ever disagree. The check goes by what a file does,
not by how it spells the import: any other test file that imports the kit (`./shard-kit`, `../test/shard-kit`, with or
without `.js`, a `require` or a dynamic `import()`) or names `readSlice`, `seedSlice`, `ownedHere`, `recordSlice`,
`mergedSlices` or `process.env.SLICE` is reported until it is in `split`, because a sliced file outside `split` would play
one quarter of its seeds and the merge step would never run it. `shard-kit.test.ts` and `ci-shard.test.ts` are the
two files that mention the kit on purpose. The shard sets `SLICE=<i>/4` and `SLICE_DIR=test-slices`; the `aggregate` job
sets `SLICE=merge`.

| `SLICE` | What the file does |
|---|---|
| unset | Everything, as `npm test` does locally. |
| `i/n` | Plays its share of the seeds (`seedSlice`), runs the per-seed assertions, and writes its rows to `test-slices/<key>.<i>of<n>.json` (`recordSlice`). |
| `merge` | Plays no seeds. Reads every slice's rows (`mergedSlices`) and runs the assertions that need all the seeds (a count, a median, a threshold). |

An assertion over all the seeds never runs on one slice alone. A describe that is cheap and not worth splitting runs in
one owner slice (`ownedHere`). A slice file that is missing, appears twice or comes from a run of another size fails the
merge and names the key. Locally, `SLICE=1/4 SLICE_DIR=$TMPDIR/s npx vitest run test/anachronism.test.ts` plays one slice.

## The fast tier

A test file whose first 10 lines contain `// ci: fast` runs in the `fast` job and in no shard. Put it on guard tests,
the ones that scan the source and finish in seconds.

## Exact information mode

Every test file starts in Exact information mode: `vite.config.ts` lists `test/setup-exact.ts` under `setupFiles`, and it calls
`setInfoOverride('exact')` (`src/game/knowledge/mode.ts`). Players get Realistic by default (estimates, ranges and words); the
suite stays Exact so the hint and menu tests that pin exact text pass unchanged. A test of the fog flips the mode for one call with
`withInfoMode('realistic', fn)`, never with `setInfoMode`: the override beats the player's setting, so a file that imports the
store (which applies the setting at load) is still Exact. The mode lives on `globalThis`, so `vi.resetModules()` does not lose it.

## Reading a run

Open the run, then the summary: one table of wall time per shard and one of the 10 slowest files. The target is a
sharded wall time of 12 minutes or less. The shard artifacts (`shard-1` to `shard-4`, kept 14 days) hold the JSON reports.

## Refreshing the timings

The committed numbers start as an estimate. After a green run, and again when many test files have been added:

    gh run download <run-id> -p 'shard-*' -D dl
    node scripts/ci-shard.mjs --source ci:run-<run-id> --update dl/shard-*/test-results/*.json

Commit `scripts/test-timings.json`. The update sums a file over the reports, keeps files no report mentions, and
drops files that no longer exist.

## Re-runs and cancelling

A newer run of the same branch cancels the older one, except on `main`. The group is the event plus the PR number (or
the branch name for a push), so the `push` run and the `pull_request` run of a release branch do not cancel each other,
and two fork PRs that both call their branch `main` stay apart. A shard uploads its artifact with `overwrite: true`, so
Re-run failed jobs can repeat one shard in the same run; the `aggregate` job still sees one `shard-N` per shard, from
the latest attempt.

## The required check

In branch protection, require `CI gate` and nothing else from this workflow. The matrix job names change with the shard
count, the gate does not.

## Golden digests

The fast tier plays three seeded lives and compares them with a committed file, so a change that moves a draw is caught
on the pull request, and the failure says where. `test/golden-digest.test.ts` plays the `pr` plan of `test/golden-run.ts`
(a birth life of 1950 to age 20, a rich life of 1990 to age 32, a 1975 founder with 2 companies for 20 years) and takes a
digest at years 5, 10 and 20 and at the end. A digest is one canonical-JSON FNV hash per slice of the state
(`test/golden-kit.ts`): `rng`, `character`, `people`, `assets`, `world`, `economy`, `flagsWorld`, `flagsPersonal` and
`text`. The file is `test/fixtures/golden-digests.json`, and the test has one case per slice. A number that is not an
integer is digested rounded to 9 significant digits (an integer exactly), because `Math.log`, `Math.exp` and `Math.pow`
differ in the last bit between CPUs and Node majors (measured: macOS arm64 against Linux x64, Node 22 against 24) and the
engine keeps a few unrounded floats; nine digits drop that noise and keep every real move.

A failure names the slice, the first life and checkpoint it moved at, the two digests and the Node major of the file
against the running one. It means a draw moved, was added or was removed, or a rule that reads state changed. The slice is
the clue: `text` alone is a text draw or a line, `rng` with the others is an extra or a missing draw. To see the first path
inside a slice, call `explainMove(a, b, slice)` from the kit on two played states.

    node scripts/golden.mjs check  [--plan pr|deep|all]          play and compare; exit 1 if a digest moved (default: pr)
    node scripts/golden.mjs update --reason "why" [--plan ...]   rewrite the file and add a history entry (default: all)
    node scripts/golden.mjs show   [--plan ...]                  print the committed digests; plays nothing

Moving a digest on purpose needs a written reason: 20 to 200 characters on one line, at least four words, no long dash,
and not only a stock phrase like "rebaseline". `update` plays the plans, and if nothing moved it says so and writes
nothing. Otherwise it records `{ at, plan, reason, moved }` in the file's `history` (the newest 40) and prints the line to
paste into the commit message, `Golden: moved <slices>: <reason>`. Those lines are the release's written list of every
seeded number that moved and why.

Run `update` under Node 22, the version CI uses. The 9-digit rule above makes the file the same on every CPU, but the file
still records the Node major and `update` refuses another one without `--allow-node`, so a digest is never written by a
runtime CI does not use.

Never merge the file by hand. It is one line per life and checkpoint, so two branches that move different lives do not
conflict, but two that move the same line do, and a hand-picked line is a digest nobody played. After a rebase, take the
file from the base branch and run `update` again, with the reason for what your branch moved.

The `deep` plan (eight birth lives to age 90 and four founders for 60 years, with 12, 6, 3 and 1 companies) is not played
on a pull request. `GOLDEN_DEEP=1 npx vitest run test/golden-digest.test.ts` or `node scripts/golden.mjs check --plan deep`
plays it (about 30 seconds); the nightly deep tier is meant to set it. A pull request that moves a digest regenerates both
plans with the default `update`, so the nightly does not fail on what the pull request already explained.

### The tables a track adds a row to

Three data tables keep the golden digests, the stream test and the ceiling probes true as the game grows. A change that adds
the thing a table names adds its row in the same commit, and the guard test of each table says what is missing.

| Table | File | A row is added when | Guard |
|---|---|---|---|
| `TOP_KEYS` | `test/golden-kit.ts` | `GameState` gets a new top-level key (it says which of the nine slices holds it) | `test/golden-kit.test.ts` |
| `STREAM_SLICES` | `test/stream-tap.ts` | a module calls `stream(g, 'tag', ...)` or `outcomeStream(g, 'tag', ...)` (the tag is a string literal; the row names the slices one extra draw may move) | `test/stream-isolation.test.ts` |
| `CEILING_PROBES` | `test/ceiling-kit.ts` | `test/ceiling-list.json` gets an entry (one probe row, or an exemption with a reason, at most 3 and none today) | `test/ceiling-probe.test.ts` |

A stream row has two optional marks. `driven` is for a stream that a module draws from but no played life reaches yet (the
`lod` stream of `seededEntity` in R2): the isolation test calls the module's entry point itself, in the tapped year, and the
row says which slices the stream may move once the module writes what it draws. `idle` is for a tag nothing draws from at all,
and the guard fails the day a caller appears. A leak outside a row is a bug in the module, never a reason to widen the row.

The ceiling list has 17 entries: ten from R0 and R1 (the podcast audience, the fame ledger, pay, endorsements, the Olympic
bonus, adaptation fees and royalties, the studio tail and copies) and seven from the ledger and the world (R2): `mint-caps`,
`burn-caps`, `ledger-caps`, `pool-spreads`, `bond-par`, `transaction-levy` and `lod-caps`. The world rows run at scales 1 and
100 on a pull request and up to 1000 in the nightly (`CEILING_PROBE=deep`); `lod-caps` walks at most 1,000 ids through
`promote` (it rewrites a shard on every call) and feeds the rest of its `scale * 400` rows to the readers as a hostile save.

## The nightly deep tier

`.github/workflows/nightly.yml` (named `Nightly`) runs what is too slow or too wide for a pull request: 40 fuzzed lives of
160 years, 200 balance lives with net-worth percentiles, the 100x ceiling probes, the anachronism lint over 400 lives,
the strict ledger drift check over the 40 probe lives, every old save fixture migrated and played for 20 years, the repeat
probe, the deep golden plan, and a diff of tonight's metrics against the last good night. It starts at 03:23 UTC, by hand
from the Actions tab (with the scale `full` or `smoke`), and on a pull request that changes `nightly.yml`, `scripts/nightly*`
or `test/nightly-*`.

A scheduled workflow, and the manual run button, exist only for a workflow that is on the default branch (`main`). A
release branch does not get the schedule. That is why a pull request that touches the workflow or its scripts runs the same
jobs at smoke size: the whole matrix in a few minutes, which is the proof that a change to it works before it reaches the
default branch. To run the full size earlier, land that one file on `main` first.

| Job | Shards x size | Full | Smoke | What it runs |
|---|---|---|---|---|
| fuzz | shards x seeds x years | 8 x 5 x 160 | 8 x 1 x 3 | `scripts/fuzz-engine.ts --fork`; a life is capped at 600 s (60 s at smoke) and the years it reached are recorded |
| balance | shards x lives x years | 4 x 50 x 40 | 4 x 2 x 2 | `lifeSpecs`: odd seeds birth lives to age 80, even seeds founders; net worth at 25, 40, 60 and 80, the year step in ms |
| ceiling | shards x lives x years | 4 x 6 x 20 at 100x | 4 x 2 x 2 at 100x | founders with a hundred times the money, 3 to 12 companies: the richest net worth and the growth over the start |
| anachronism | lives in slices | 400 in 8 | 16 in 8 | `test/anachronism.test.ts`, one job per slice, then `anachronism-merge` checks the union |
| ledger strict | lives in slices | 40 in 4 | 4 in 4 | `ledger-strict`: the `strict drift` describe of `test/world-acceptance.test.ts`, one job per slice, no merge (below) |
| old saves | years, reseeds | 20, 8 | 3, 2 | `test/old-saves.test.ts`: every `save-*.json.gz` fixture migrates and runs, once per reseed; it invents no world, plays a first year with balanced books, and reads back from the save store (a chunked save v3) with the same digests |

Two jobs have no size of their own. `deep` runs the table's `old saves` row and three more runs: `test/text-repeat.test.ts` and
`test/text-kit.test.ts` (the repeat probe plays its fixed 13 lives, the lives R1 was measured on and the R2 gate is stated over, so
there is no size to set: the cap on `text.repeatedShare` is half of R1's share over those 13), `test/ceiling-probe.test.ts` with
`CEILING_PROBE=deep` (scales 1, 10, 100 and 1000) and `test/golden-digest.test.ts` with `GOLDEN_DEEP=1` (the `deep` plan of the
golden digests above). `metrics` pools everything. Every size comes from
`nightlySizes` in `scripts/nightly-lib.mjs`, and each job prints its own with
`node scripts/nightly.mjs sizes <full|smoke> [--shard i/n]` into `$GITHUB_ENV`. To resize a night, change that one function;
`test/nightly-workflow.test.ts` (fast tier) keeps the YAML in step with it: the shard counts, the variables the run lines
read, and the files they name.

### The strict ledger drift job

`ledger-strict` runs the strict drift check of the ledger (`docs/LEDGER.md`, "The strict drift run"): the 40 lives of the ledger probe,
a hundred years each with two heirs, and for every life the cash the player held must have changed only by what the books
recorded. Nothing else in CI plays it (the pull request shards skip the describe, because `LEDGER_STRICT` is not set), so a raw
writer of cash that the token scan cannot see would otherwise be found only by someone who remembered to run it.

All 40 lives take 879 s on one worker (Node 22, one local run), so the job has four slices of 10 lives, one job each, with
`LEDGER_STRICT=<slice>/4` and a limit of 20 minutes; slice 1 took 141 s locally (10 lives, drift 0). The file has its own switch and not
the seed-slice kit above: `SLICE` belongs to the six files in the `split` list, which `ci-shard.mjs --verify` keeps, and a
file that read it would have to be in that list. Every assertion of the run is per life, so there are no slice files and no merge
job. The size is `LEDGER_STRICT_LIVES`, printed by `nightly.mjs sizes`: 40 at full size and 4 at smoke size (the first four lives,
one to a slice). The job selects the test by the title of its describe (`-t "strict drift"`), and vitest passes when a name filter
selects nothing, so `test/nightly-workflow.test.ts` pins that the file still has a describe by that title.

Each slice writes `ledger-strict-<slice>.json` with `ledger.lives.sum`, `ledger.years.sum`, `ledger.bookings.sum` and
`ledger.drift.sum` after every life and before it checks that life, so the drift of a failing slice still reaches the diff. If a
slice passes its 20 minute limit, raise the slice count in `nightlySizes` and the matrix together (the workflow test keeps them
equal), or lower `PROBE_ACTIONS` in `test/ledger-probe.ts` as for the sliced probe.

### The hard rules

The `metrics` job pools the files of every job (`test/nightly-metrics.ts` `writeMetrics`, the probes, `fuzz-metrics`) and
holds tonight to `RULES` in `scripts/nightly-lib.mjs`. A hard rule fails the run; a soft one only prints a warning row.

| Metric | Limit | Why |
|---|---|---|
| `fuzz.failures.sum`, `fuzz.nototal.sum` | 0 | a fuzz failure is a bug; a shard with no `TOTAL:` line did not finish |
| `balance.*.max` | 1e13 | 20 times the richest person ever; a runaway loop is far above it |
| `ceiling.life.maxNetWorth.max` | 1e12 | a founder with 100x the money (measured 4.1e9) |
| `ceiling.life.growth.max` | 40 | growth must fall as inputs rise (measured 8.2 at 100x, 24.1 at 1x) |
| `balance.birth.msYear.p95` | 160 | F.1: a light-life year step on desktop |
| `text.repeatedShare` | 0.0415 | R2: at most half of R1's 0.0831 |
| `oldsaves.failures.sum` | 0 | an old save that cannot run is a lost game |
| `anachronism.findings.sum` | 0 | each `anachronism` slice writes its findings (and `anachronism.lives.sum`) before it checks them; a line that names a thing before it existed is a bug |
| `ledger.drift.sum` | 0 | each `ledger-strict` slice writes its drift (and `ledger.lives.sum`, `ledger.years.sum`, `ledger.bookings.sum`) before it checks it; a change of the player's cash that nothing booked is a raw writer the books cannot see |

Soft rules: a median (`balance.*.p50`) that moved more than a quarter, any other metric that moved more than half. A metric
new tonight prints `new`, one that was not written prints `gone`, and a job that failed is listed first and fails the run.
A new metric is written with `writeMetrics` and gets a rule here if it has a hard cap.

### Reading a night

Open the run, then the summary: the failed jobs, the counts, a table of every failure and warning with its reason, and the
other metrics folded below. The previous night is the last successful scheduled run's `nightly-metrics` artifact; a full run
looks for it, a smoke run does not (smoke numbers are not comparable), and with none the diff judges tonight alone.

### Running one job by hand

    node scripts/nightly.mjs sizes full --shard 2/8                      # the variables a shard reads
    node_modules/.bin/esbuild scripts/fuzz-engine.ts --bundle --platform=node --format=esm --sourcemap --outfile=/tmp/fuzz-engine.mjs
    node --enable-source-maps /tmp/fuzz-engine.mjs --start 1 --seeds 2 --years 20 --fork --quiet --json /tmp/fuzz.json
    node_modules/.bin/esbuild scripts/nightly-probes.ts --bundle --platform=node --format=esm --outfile=/tmp/nightly-probes.mjs
    node /tmp/nightly-probes.mjs balance --start 1 --count 4 --out /tmp/b.json
    node /tmp/nightly-probes.mjs ceiling --start 1 --count 2 --years 20 --scale 100 --out /tmp/c.json
    CEILING_PROBE=deep npx vitest run test/ceiling-probe.test.ts
    OLD_SAVES_YEARS=20 OLD_SAVES_RESEEDS=8 npx vitest run test/old-saves.test.ts
    node scripts/golden.mjs check --plan deep
    ANACHRONISM_LIVES=400 SLICE=1/8 SLICE_DIR=/tmp/s npx vitest run test/anachronism.test.ts
    LEDGER_STRICT=1/4 LEDGER_STRICT_LIVES=40 npx vitest run test/world-acceptance.test.ts -t "strict drift"

Set `NIGHTLY_METRICS_DIR=/tmp/m` to have a test file write its metrics, and `node scripts/nightly.mjs merge --out /tmp/all.json
/tmp/m/*.json` then `diff --prev none --cur /tmp/all.json` to see the verdict the `metrics` job would give.

### Artifacts

`metrics-fuzz-<shard>`, `metrics-balance-<shard>` (the balance and the ceiling file), `metrics-anachronism-<slice>`,
`metrics-ledger-strict-<slice>` and `metrics-deep-<name>` hold one job's metrics file; `fuzz-<shard>` holds the fuzzer's log and
its list of findings; `slices-<i>` holds an anachronism slice's rows. All are kept 14 days. `nightly-metrics` is the merged `all.json`, kept 30 days (R12 wants seven nights of history).
