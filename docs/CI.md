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
`main-character-life`, `sector-story` and `anachronism`. They are the `split` list in `scripts/test-timings.json`, they
use `test/shard-kit.ts`, and `ci-shard.mjs --verify` fails if the two ever disagree. The check goes by what a file does,
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
`text`. The file is `test/fixtures/golden-digests.json`, and the test has one case per slice.

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

Run `update` under Node 22, the version CI uses. Floating-point results can differ between Node majors (Node 24 moves one
float of a 1990 life by one unit in the last place, which moves its `people` digest), so the file records the major and
`update` refuses another one without `--allow-node`.

Never merge the file by hand. It is one line per life and checkpoint, so two branches that move different lives do not
conflict, but two that move the same line do, and a hand-picked line is a digest nobody played. After a rebase, take the
file from the base branch and run `update` again, with the reason for what your branch moved.

The `deep` plan (eight birth lives to age 90 and four founders for 60 years, with 12, 6, 3 and 1 companies) is not played
on a pull request. `GOLDEN_DEEP=1 npx vitest run test/golden-digest.test.ts` or `node scripts/golden.mjs check --plan deep`
plays it (about 30 seconds); the nightly deep tier is meant to set it. A pull request that moves a digest regenerates both
plans with the default `update`, so the nightly does not fail on what the pull request already explained.
