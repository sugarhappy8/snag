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
| `aggregate` | Downloads the shard artifacts and merges the sliced files with `SLICE=merge`. Does nothing until a file is in `split`. Prints the timing summary. |
| `gate` | Named `CI gate`. Fails unless the four jobs above passed. This is the one required status check. |

## The shards

`scripts/ci-shard.mjs` plans the shards, not `vitest --shard`, because vitest cuts equal file counts and five files are
45% of the run time. It spreads files by seconds, longest first, from `scripts/test-timings.json`. A file missing
from that file weighs 5 seconds. `test/timings-sequencer.ts` (named in `vite.config.ts`) starts the heaviest files first
inside a shard. Locally, `npm test` still runs everything.

Useful commands: `node scripts/ci-shard.mjs --plan 4` (seconds and file counts per shard), `--verify 4` (coverage problems),
`2 4` (the files of shard 2).

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

## The required check

In branch protection, require `CI gate` and nothing else from this workflow. The matrix job names change with the shard
count, the gate does not.
