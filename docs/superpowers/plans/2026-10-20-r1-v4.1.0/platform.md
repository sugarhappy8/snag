# R1 plan, Wave 0: Platform and shared types (track `platform`)

Base: `release/v4.1.0` cut from `release/v4.0.3` (R0 merged). Code read at v4.0.2 (`main`, fc50555) in a local clone; nothing was edited. Every path marked "modify" exists today; "create" paths do not. All text below uses plain hyphens (no U+2014, no U+2013).

## 1. Track summary

**Items covered (9 tasks; R1-P9 added by the cross-check).** K.7a CI sharding (two tasks: R1-P1 the shards and the gate, R1-P7 the seed slicing of the five slow files), the shared optional types of D.1 wave 0 (R1-P2), K.11 `FLAGS` and previews (R1-P3), K.1 import-cycle ratchet (R1-P4), X.G1 guards (R1-P5: foresight scan, money ratchet, ceiling list), A.K0 flag classification (R1-P6), J.1 advisory depth rubric (R1-P8), and the R1 parity and cost probe (R1-P9: the roadmap's 30-life, 40-year identical-output run and the per-tap cost numbers, which no other task builds).

**Not in this track.** K.5a (IndexedDB wiring: `src/main.tsx`, `src/game/save-store.ts`) and E.T1 (text kit) are wave 0 in the roadmap but were given to other planners. Where they touch my files I say so below.

**Line budget.** About 2,950 lines of kit, guard, config and probe code (R1-P9 adds about 340) plus about 1,820 test lines, plus data files (the timings JSON about 395 lines, the cycle baseline about 160, the money baseline about 140). The roadmap's Platform line is 3,400 with K.5a (600): 2,800 without it. J.1 is smaller than the roadmap's 1,000 because the registry is 12 rows of data; the rest of that budget is the R2 to R11 updates of the rows.

**D.11 criteria proven here.** Criterion 10 (shards cover every test file: P1 and P7; the cycle ratchet fails on a synthetic cycle: P4; the money ratchet and the foresight scan fail on synthetic violations: P5; sharded wall at most 12 minutes: measured by the lead on the first green run) and criterion 13 (v4.0.2 saves still load: P2 reruns the save tests), the cost half of criterion 12 and the "R1 changes no simulation output" probe (P9). Review focus RF1, RF2, RF3 and RF8 get their guards from P5, P6 and P1.

**Hot files and who touches them** (every edit additive, in its own hunk):

| File | Touched by | Note |
|---|---|---|
| `.github/workflows/ci.yml` | R1-P1 (rewrite); R1-A9 adds one step to the `checks` job after P1 | rewritten once; R1-P7 needs no workflow edit (P1 already has the aggregate job) |
| `vite.config.ts` | R1-P1 only | one import and one `sequence` key; R3 adds `setupFiles` later, in another hunk |
| `src/game/types.ts` | R1-P2 only (every track's new optional field; cross-check) | four hunks: one type import, `NoticeModal`, `MenuBase` plus `MenuInfo`, `AnnualReportData` |
| `src/game/core.ts` | R1-P2 (`NoticeOptions.weight`/`link` and the `notice()` spreads), then R1-T5 (one import and the single `weight` expression) | additive, in order P2 then T5 |
| `.gitignore` | R1-P1 only | three lines (`test-results/`, `test-slices/`, `shard-files.txt`) |
| `package.json`, `package-lock.json` | lead; R1-A9 adds one `size` script line | esbuild devDependency (R1-P4), version bump and flag flip at release |
| `test/voice-guards.test.ts` | R1-P1 | one comment line (the `// ci: fast` marker) |
| `test/simulate.test.ts`, `era-features`, `main-character-life`, `sector-story`, `anachronism` | R1-P7 only | restructured to the slice recipe |

**Order and schedule** (the machine runs at most 3 test-running agents at once; all tasks are test first):

1. R1-P1 alone, first, merged in about 2.5 h, so every later CI run is sharded.
2. Then R1-P2, R1-P3, R1-P4 in parallel (each under 2 h). P2 unblocks the Charts and Navigation tracks, so merge it first of the three.
3. Then R1-P5 (beside the a11y and text wave-0 tasks); R1-P6 starts when P5 is merged (it reuses `test/scan-kit.ts`).
4. Cross-check: **R1-P7 and R1-P8 are not wave 0.** Wave 0 (R2's base) is P1 to P6 with R1-A1 to A3 and R1-T1, T2: about 12 agent-hours, about 7 hours wall with three test-running agents; adding P7 and P8 would push it past 9. They run in wave 1, beside the Charts and Navigation core (P7 needs only P1).
5. R1-P8 is advisory and can slip to wave 3 without harm. R1-P9 is wave 3: it needs R1-C3's `test/r1-strip.ts`.
6. Global merge order across all five tracks: `00-crosscheck.md` section 4.

**Lead actions** (none can be done by an implementer):

1. Before R1-P4 merges: make esbuild an explicit devDependency and keep the lockfile in sync: `npm install --save-dev esbuild@^0.28.2 --package-lock-only`, then `npm ci --dry-run` must pass. (0.28.2 is already locked; `npm ci` fails if only `package.json` changes.)
2. After R1-P1 merges: change the required status check in GitHub branch protection from `test` to `CI gate`. The workflow name stays `CI` (`release.yml` listens to `workflow_run: ['CI']`).
3. After the first green sharded run, and again after wave 3 has merged (every new test file weighs `DEFAULT_SECONDS` until then, and the plans add about 76): `gh run download <run-id> -p 'shard-*' -D dl`, then `node scripts/ci-shard.mjs --update dl/shard-*/test-results/*.json`, and commit `scripts/test-timings.json` (the seeded numbers are an estimate, see R1-P1).
4. Previews: either add the repo secret `CLOUDFLARE_API_TOKEN` (an "Edit Cloudflare Workers" token, the same one `deploy.yml` wants) or switch on non-production branch builds in Cloudflare Workers Builds (see R1-P3).
5. At the release commit: bump `package.json` to 4.1.0 and flip the eight defaults in `src/game/flags.ts` in the same commit. `test/flags.test.ts` fails on either half alone (R1-P3). No other task flips a flag (cross-check: Navigation's N10 and Notices' T10 are acceptance sweeps).
6. Before the release PR is marked ready: run R1-P9 on the R0 head (`release/v4.0.3`) and on the R1 head (`--flags none` and `--flags all`), and read its `cost` table (see R1-P9).

## 2. Cross-track contracts

**Provided by this track (other tracks may rely on these exact names):**

| Provided | By | Used by |
|---|---|---|
| `MenuBase.keywords?: readonly string[]`, `section?`, `badge?`, `conf?`, `spark?`; `MenuInfo.chart?`, `MenuInfo.conf?`; `NoticeModal.weight?`, `NoticeModal.link?`; `AnnualReportData.chart?`; `NoticeOptions.weight?`, `NoticeOptions.link?`; `src/game/charts/spec.ts` (types and `CHART_LIMITS`) | R1-P2 | G.1, G.2, G.4, G.6, G.8, G.9, G.11 (nobody else edits `types.ts`) |
| `FLAGS`, `flagOn`, `setFlags`, `resetFlags`, `withFlags`, `FLAG_DEFS` with the eight R1 keys `chartKit`, `annualReport2`, `navRegroup`, `navPalette`, `cockpits`, `noticeDigest`, `quietInbox`, `idbSaves` (cross-check list) | R1-P3 | Charts G.2/G.4/G.6/G.7 (`chartKit`, `annualReport2`), Navigation G.8 (`navRegroup`), G.9 (`navPalette`), G.5 (`cockpits`), Notices G.11 (`noticeDigest`, `quietInbox`), a11y K.5a (`idbSaves`). No key for E.T1: the flavor move ships live (parity-proven). Only the lead's release commit changes a default |
| Cycle ratchet: a new module in an import cycle fails CI | R1-P4 | every track. Chart builders (`src/game/charts/*`) must take data as arguments and import only types from `business/*` (type imports are erased), otherwise the ratchet catches them. Menu modules inside the 85-module component must not import `charts/*` values that import business values back |
| Money ratchet and foresight scan | R1-P5 | every track: R1 adds no `earnIncome(`, `addMoney(`, `spend(`, `.cash +=`, `.money +=` and no future-year market read |
| Flag classification: a new `flags.<key>` must be classified in `src/game/world-flags.ts` in the same commit. `lifeSeries` (G.3), `inbox` (G.11) and `textMem` (E.T1) are pre-declared `personal`, and `flavorRecent` `cache`, so those tracks edit nothing there (R1-P6 must merge before they write the keys) | R1-P6 | G.3, G.11, E.T1 |
| `test/scan-kit.ts` (lexer-based scans), `test/shard-kit.ts` (slices), `test/depth-registry.ts` (DEPTH) | P5, P7, P8 | R2 reasoned-call ratchet, R5 8 shards, R3 to R11 rubric updates |
| `// ci: fast` marker: a test file whose first 10 lines contain it runs in the fast job, not in a shard | R1-P1 | every guard test |
| `scripts/r1-parity.mjs` (`play`, `compare`, `cost`) and its library | R1-P9 | the lead's release gate; consumes `stripR1` from R1-C3 |

**Relied on by this track:**

- R0 merged into the base. R1-P5 and R1-P6 generate baselines from it; if R0 is not merged when they start, they rebase first. R1-P6 needs R0-4 (`nationWorldFlags`, `test/heir-world-flags.test.ts`).
- The lead actions in section 1.
- G.3, G.11 and E.T1 write the flags `lifeSeries`, `inbox`, `textMem` (the registry only declares them). R1-C3 provides `test/r1-strip.ts` (`stripR1`), which R1-P9 imports.
- K.5a edits `src/main.tsx` and `save-store.ts`; nothing here edits those, so there is no overlap (the flags module reads the URL itself and needs no `main.tsx` hunk).

---

## 3. Tasks

### R1-P1 K.7a (a): four time-balanced shards, a fast tier and one gate job

**Roadmap items.** K.7a (D.10), F.1 tiers, D.11 criteria 10 and 13. This must be the first task merged.

**Files.**
- Create: `scripts/ci-shard.mjs`, `scripts/ci-shard.d.mts` (the repo's precedent is `scripts/voice/rules.d.mts`, needed because `tsc` checks `test/` and cannot import untyped `.mjs`), `scripts/test-timings.json`, `test/timings-sequencer.ts`, `test/ci-shard.test.ts`, `docs/CI.md`.
- Modify: `.github/workflows/ci.yml` (22 lines today, one job `test`; rewrite whole), `vite.config.ts` (line 16 `test: {...}`: add `sequence: { sequencer: TimingsSequencer }` and one import; keep `maxWorkers: 2`, `testTimeout: 15_000`), `.gitignore` (append `test-results/`, `test-slices/` and `shard-files.txt`), `test/voice-guards.test.ts` (line 1: add the comment `// ci: fast`).
- Do not touch `package.json`. `vite.config.ts` keeps `maxWorkers: 2`; the shard command passes `--maxWorkers=2` as well so a later config change cannot silently change CI. Two workers per shard assumes the 4-vCPU runner that public repos get.

**Why a script and not `vitest --shard`.** Vitest 5 has `--shard i/n` (checked in `node_modules/vitest/dist/chunks/index.DpLw24bj.js`, `BaseSequencer.shard`): it sorts files by the sha1 of their path and cuts equal counts, so it balances file counts, not seconds. The five slow files are 45% of the time (1,727 of 3,869 worker-seconds; the top ten files are 58%), so a count split can put three of them in one shard. The script balances seconds.

**Why a sequencer.** With no vitest cache (always true in CI), `BaseSequencer.sort` leaves the files in discovery order (the glob result, roughly alphabetical). `simulate.test.ts` (494 s) and `sector-story` (278 s) would start near the end of a shard and set its wall time. `TimingsSequencer` sorts longest first from `scripts/test-timings.json`.

**Interfaces.**

```ts
// scripts/ci-shard.d.mts
export interface Timings { v: 1; source: string; files: Record<string, number>; split: string[] }
export const DEFAULT_SECONDS: number          // 5, for a file missing from the timings
export const FILE_OVERHEAD_SECONDS: number    // 1.5, added when planning (the JSON reporter leaves out import time)
export function listTestFiles(root?: string): string[]                 // 'test/x.test.ts', posix, sorted, every *.test.ts under test/ (same rule as vite.config include)
export function listFastFiles(root?: string): string[]                 // test files whose first 10 lines contain "// ci: fast"
export function readTimings(file?: string): Timings
export function weightOf(t: Timings, file: string): number            // files[file] ?? DEFAULT_SECONDS
export function planShards(files: readonly string[], t: Timings, count: number): string[][]   // fast files excluded; split files in every shard; LPT for the rest
export function shardLoads(plan: readonly string[][], t: Timings, count: number): number[]
export function parseTimingReport(text: string, name: string): Record<string, number>        // vitest json report or default-reporter log; keys repo-relative
export function mergeTimings(prev: Timings, reports: readonly Record<string, number>[], source: string): Timings
export function estimateTimings(root?: string): Timings
export function shardSummary(reports: readonly { name: string; text: string }[]): string       // markdown
export function verifyCoverage(count: number, root?: string): string[]                         // problems; [] means ok
```

```ts
// test/timings-sequencer.ts
import { BaseSequencer, type TestSpecification } from 'vitest/node'
export default class TimingsSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]>   // weight descending, then path
}
```

`scripts/test-timings.json`: `{ "v": 1, "source": "estimate", "files": { "test/a.test.ts": 12.3, ... }, "split": [] }`, keys sorted, one decimal, trailing newline. `split` stays `[]` in this task; R1-P7 fills it.

**Behaviour.**

CLI (`node scripts/ci-shard.mjs ...`; Node builtins only; exit 0 ok, 1 problem, 2 bad usage):
- `<i> <n>`: print the files of shard i of n (1-based), one per line. Exit 1 when the list is empty (an empty list would make `vitest run` run everything).
- `--fast`: print the fast-tier files. `--split`: print `timings.split`. `--verify <n>`: print each coverage problem, exit 1 if any. `--plan <n>`: print per-shard seconds and file counts (stderr-friendly diagnostics). `--estimate`: print a fresh seeded timings JSON. `--update <report...>`: rewrite `scripts/test-timings.json` from one or more vitest JSON reports or default-reporter logs (decided by `.json` extension). `--summary <report...>`: markdown of per-shard wall time and the 10 slowest files, for `$GITHUB_STEP_SUMMARY` (with no readable report it prints one note line and exits 0).

Planning rules (all deterministic):
1. Files = `listTestFiles()` minus `listFastFiles()`. Weight = `weightOf(file) + FILE_OVERHEAD_SECONDS`.
2. Each shard starts with the sum of `weight / count` of every `split` file (split files appear in every shard; each shard runs its `SLICE=i/n` part, see R1-P7).
3. The other files, sorted by weight descending then path, each go to the shard with the lowest load (ties: lowest index). Return each shard's files sorted by path.
4. `verifyCoverage(n)`: every test file is in the fast tier, or in exactly one shard, or (if in `split`) in all n shards; no listed file is missing from disk; every file that imports `./shard-kit` is in `split` and every `split` file imports it (vacuously true until R1-P7); the fast list and the shard lists are disjoint.

`parseTimingReport`:
- JSON: vitest's JSON reporter writes `testResults[].name` (absolute path), `startTime`, `endTime` (milliseconds; checked in `JsonReporter` in vitest 5.0.3). Seconds per file = `(endTime - startTime) / 1000`, path made repo-relative with posix slashes. These times exclude module import (about 8% of the total, per digest K), which is why planning adds `FILE_OVERHEAD_SECONDS`.
- Log: lines of the form `<mark> test/x.test.ts (12 tests) 1234ms` (also `1.2s`), where the mark is the reporter's check, cross or down arrow; ANSI codes are stripped first.
- A file that appears in several reports (the split files, once per shard) is summed by `mergeTimings`.

`mergeTimings(prev, reports, source)`: sum the reports per file; start from `prev.files` for files not in any report (so a partial update loses nothing); drop files that no longer exist on disk; round to one decimal; keep `split`; set `source` (for example `ci:run-39420764187`).

`estimateTimings`: the five files measured in digest K are pinned (`simulate` 494, `era-features` 401, `main-character-life` 340, `sector-story` 278, `anachronism` 214; sum 1,727). Every other file gets `raw = 1 + bytes / 30000 + 0.15 * min(sims, 30) + sumTimeoutsMs / 8000`, where `sims` counts `createNewLife|ageUp(|playYear|yearlyBusiness|playLife|makeTestGame` and `sumTimeoutsMs` sums the explicit timeouts (`}, 120_000)`, `timeout: 60_000`, `const TIMEOUT = 300_000`). Then all raw values are scaled by one factor so the total is 3,869 s (digest K: file times sum to 3,869 worker-seconds; 3,869 minus 1,727 = 2,142 for the rest). I prototyped this on v4.0.2: it ranks the files with the largest timeouts first, which is a reasonable prior; the first CI run replaces it. `source` is `"estimate"`.

`test/timings-sequencer.ts`: reads `readTimings()` once; the key of a spec is `relative(root, spec.moduleId)` in posix form; sort by `weightOf` descending, ties by path. Add to `vite.config.ts`: `import TimingsSequencer from './test/timings-sequencer'` and `sequence: { sequencer: TimingsSequencer }` inside `test`. (`tsconfig.json` already includes `vite.config.ts` and `test/`.)

`.github/workflows/ci.yml` (write exactly this shape; the workflow name stays `CI`):

```yaml
name: CI

# Fast guards, four time-balanced test shards, the merge of the seed-sliced files, and one gate job to require.
# The shards come from scripts/ci-shard.mjs and scripts/test-timings.json (see docs/CI.md).
on:
  pull_request:
  push:
    branches: [main, 'release/**']
  workflow_dispatch:

concurrency:
  group: ci-${{ github.head_ref || github.ref_name }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read

jobs:
  checks:
    name: Typecheck, voice, build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: node scripts/ci-shard.mjs --verify 4
      - run: npm run typecheck
      - name: Voice report (warning only)
        continue-on-error: true
        run: node scripts/voice-report.mjs --ci
      - run: npx vite build

  fast:
    name: Guards (fast tier)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx vitest run --maxWorkers=2 $(node scripts/ci-shard.mjs --fast)

  test:
    name: Tests, shard ${{ matrix.shard }} of 4
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    env:
      SLICE: ${{ matrix.shard }}/4
      SLICE_DIR: test-slices
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: List this shard's files
        run: node scripts/ci-shard.mjs ${{ matrix.shard }} 4 | tee shard-files.txt
      - name: Run the shard
        run: npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=test-results/shard-${{ matrix.shard }}.json $(cat shard-files.txt)
      - name: Keep timings and slices
        if: ${{ always() }}
        run: |
          mkdir -p test-results test-slices
          echo "shard ${{ matrix.shard }}" > test-slices/shard-${{ matrix.shard }}.txt
      - uses: actions/upload-artifact@v4
        if: ${{ always() }}
        with:
          name: shard-${{ matrix.shard }}
          path: |
            test-results
            test-slices
          if-no-files-found: ignore
          retention-days: 14

  aggregate:
    name: Merge sliced results
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: shard-*
          merge-multiple: true
      - name: Merge the seed slices
        env:
          SLICE: merge
          SLICE_DIR: test-slices
        run: |
          files="$(node scripts/ci-shard.mjs --split)"
          if [ -z "$files" ]; then echo "No sliced files yet."; exit 0; fi
          npx vitest run --maxWorkers=1 $files
      - name: Timing summary
        if: ${{ always() }}
        run: node scripts/ci-shard.mjs --summary test-results/*.json >> "$GITHUB_STEP_SUMMARY"

  gate:
    name: CI gate
    if: ${{ always() }}
    needs: [checks, fast, test, aggregate]
    runs-on: ubuntu-latest
    steps:
      - name: Require every job
        run: |
          echo "checks=${{ needs.checks.result }} fast=${{ needs.fast.result }} test=${{ needs.test.result }} aggregate=${{ needs.aggregate.result }}"
          test "${{ needs.checks.result }}" = success
          test "${{ needs.fast.result }}" = success
          test "${{ needs.test.result }}" = success
          test "${{ needs.aggregate.result }}" = success
```

The old `npm test` step is gone; local `npm test` still runs everything (no `SLICE`, so `full` mode). `docs/CI.md` (about 45 lines): the jobs, how to read the summary, how to refresh timings, the `// ci: fast` marker, the required check name, and that a track wanting CI before merging opens a draft PR against the release branch (pushes to `claude/**` branches get previews, not CI).

**Tests** (`test/ci-shard.test.ts`, first line `// ci: fast`; write first, red):
1. `listTestFiles()` equals the sorted `*.test.ts` files found with `readdirSync('test')`, has at least 389 entries (the v4.0.2 count; never an exact number, R1 adds files) and contains no `*-kit.ts` helper.
2. For n in 1, 2, 3, 4, 5, 8: `verifyCoverage(n)` is `[]` and the union of `planShards` plus `listFastFiles()` is every test file. This is D.11 criterion 10 "shards cover all test files".
3. A synthetic timings object with `split: ['test/a.test.ts']` puts `a` in all n shards and every other file in exactly one; fast files appear in no shard.
4. Balance on the committed timings: n=4 max load at most 1.08 times the mean, n=8 at most 1.15 times.
5. `planShards` is deterministic (two calls equal); a file missing from the timings weighs `DEFAULT_SECONDS`.
6. `parseTimingReport`: a hand-written vitest JSON sample with absolute paths and a three-line log sample (one `ms`, one `s`, one with ANSI codes) give the expected repo-relative seconds.
7. `mergeTimings`: sums a split file across four reports; keeps an entry absent from the reports; drops a deleted file; rounds to one decimal; output keys sorted; `JSON.stringify(x, null, 2)` round-trips.
8. `estimateTimings`: the five pinned values exactly; total within 1 s of 3,869; the five are the five largest; every test file present.
9. `shardSummary` contains each shard's wall seconds and the slowest file name.
10. CLI smoke with `spawnSync(process.execPath, ['scripts/ci-shard.mjs', '1', '4'])`: exit 0, every line is a real test file; `'5', '4'` exits 2; `--verify 4` exits 0.
11. Workflow text checks on `.github/workflows/ci.yml`: first line `name: CI`; contains `shard: [1, 2, 3, 4]` and `SLICE: ${{ matrix.shard }}/4` and `ci-shard.mjs ${{ matrix.shard }} 4`; has the five job keys `checks`, `fast`, `test`, `aggregate`, `gate`; `gate` has `if: ${{ always() }}`; no line runs `npm test`.
12. `listFastFiles()` includes `test/ci-shard.test.ts` and `test/voice-guards.test.ts`.

Run: `npx vitest run --maxWorkers=1 test/ci-shard.test.ts test/voice-guards.test.ts` and `npm run typecheck`. D.11 criterion 10's "sharded wall at most 12 minutes" is measured by the lead on the first green run of the PR (note the number in the PR).

**Flag.** None.
**Hot-file notes.** `ci.yml` is rewritten once, here. `vite.config.ts` hunk is the import line plus one key. Cross-check: R1-A9 later adds one step (`node scripts/bundle-budget.mjs`) to the `checks` job directly after `npx vite build`; keep that job's step list stable so the hunk is trivial.
**Depends on.** Nothing (this is the first task).
**Size.** About 430 code lines (`ci-shard.mjs` 260, `.d.mts` 35, `ci.yml` 135) plus the 395-line data file and `docs/CI.md` (45); tests about 240.

---

### R1-P2 The shared optional types (one agent edits `types.ts` once)

**Roadmap items.** D.1 wave 0 row ("the `types.ts` optional fields"), D.2 (spec types), D.6, D.7 step 2.

**Files.**
- Modify: `src/game/types.ts` (`NoticeModal` at line 503; `AnnualReportData` at 542; `interface MenuBase` at 755; `interface MenuInfo` at 788; the file has no imports today), `src/game/core.ts` (`interface NoticeOptions` at 436; `notice()` at 444).
- Create: `src/game/charts/spec.ts`, `test/shared-menu-types.test.ts`.

**Interfaces.**

```ts
// src/game/charts/spec.ts  (no imports; types and one constant only, Charts G.1 appends readChartSpec below in its own hunk)
export type ChartTone = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'good' | 'bad' | 'muted'
export type ChartKind = 'line' | 'bars' | 'stack' | 'waterfall' | 'ladder' | 'timeline' | 'meter' | 'kpi'
export type ChartUnit = 'money' | 'pct' | 'count' | 'rank' | 'years'
export interface ChartSeries { id: string; label: string; tone: ChartTone; values: (number | null)[] }
export interface ChartStep { label: string; value: number; kind: 'total' | 'delta' }
export interface ChartMark { at: number; label: string }
export interface ChartSpec {
  v: 1
  kind: ChartKind
  title: string              // at most CHART_LIMITS.title
  unit: ChartUnit
  x: (number | string)[]     // at most CHART_LIMITS.points
  series: ChartSeries[]      // at most CHART_LIMITS.series
  steps?: ChartStep[]        // waterfall, at most CHART_LIMITS.steps
  marks?: ChartMark[]        // at most CHART_LIMITS.marks
  summary: string            // the accessible text; strings at most CHART_LIMITS.text
}
export const CHART_LIMITS = { title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 } as const
```

```ts
// src/game/types.ts (additive)
import type { ChartSpec } from './charts/spec'       // type-only: erased, types.ts stays an import-free leaf at runtime

// in NoticeModal, after `support?`:
/** 'minor': the store may route it to the Quiet Mode inbox (G.11). Written only by notice(); anything else is ignored. */
weight?: 'minor'
/** Where an inbox row leads: a place key such as 'assets/home/mortgage' (Navigation's placeKey). Validated by R1-T5's readers; R1 emitters set none. */
link?: string

// in MenuBase, after `hint?`:
/** Extra search words (G.9). */
keywords?: readonly string[]
/** The heading id this row sits under in its parent list (G.8). Free text; the nav track owns the vocabulary. */
section?: string
/** A "Needs you" count or word on a root or hub row (G.8); null or 0 shows nothing. Must be pure. */
badge?: (g: GameState) => string | number | null
/** Information confidence 0 to 3 (H.3, R3 renders it). */
conf?: 0 | 1 | 2 | 3
/** A tiny trend drawn at the end of a row (stock lists, G.6). Null, or fewer than 2 points, draws nothing. Must be pure and read settled years only. */
spark?: (g: GameState) => (number | null)[] | null

// in MenuInfo, after `visible?`:
/** A chart for this info row (G.2); `text` stays the accessible summary and the test surface. Must be pure and read settled years only. */
chart?: (g: GameState) => ChartSpec | null
conf?: 0 | 1 | 2 | 3

// in AnnualReportData, after `talentHint?`:
/** Annual Report 2.0 data (src/game/charts/report.ts ReportCharts). Missing or damaged: the text layout. */
chart?: Json
```

```ts
// src/game/core.ts (additive)
export interface NoticeOptions { /* existing fields */ weight?: 'minor'; link?: string }
// notice() body: the object literal gains  ...(opts.weight === 'minor' ? { weight: 'minor' as const } : {})  and  ...(opts.link ? { link: opts.link } : {})
// directly after the existing support spread, so a notice without a weight or link is saved exactly as before.
// R1-T5 later changes only the weight expression to `opts.weight ?? noticeWeightFor(title)`.
```

**Behaviour.** Types only, plus two conditional spreads. Nothing renders and nothing reads the new fields yet. `MenuHeading` is unchanged. `save-schema.ts` `isModal` (line 192, `case 'notice'`) is not changed here: it checks only `title` and `text`, and the store (G.11) routes only on `weight === 'minor'`, so a hostile `weight` or `link` in a save is inert; R1-T5 sanitises both in `migrateLegacyAi` and owns the hostile-field test. Cross-check: this task is the only one that edits `types.ts` for R1; Charts (`spark`, `AnnualReportData.chart`), Notices (`link`) and Navigation (`keywords`, `section`, `badge`) verify their field exists and stop if it does not. `keywords` is `readonly string[]`.

**Tests** (`test/shared-menu-types.test.ts`):
1. Compile-time (`expectTypeOf`, checked by `npm run typecheck`): `MenuAction['keywords']` is `readonly string[] | undefined`; `badge` returns `string | number | null`; `MenuAction['spark']` returns `(number | null)[] | null`; `conf` is `0 | 1 | 2 | 3 | undefined` on both `MenuAction` and `MenuInfo`; `MenuInfo['chart']` returns `ChartSpec | null`; `NoticeModal['weight']` is `'minor' | undefined` and `NoticeModal['link']` is `string | undefined`; `AnnualReportData['chart']` is `Json | undefined`; `MenuHeading` has none of the new keys (`// @ts-expect-error`).
2. `notice(g, 't', 'x')` pushes an item whose `Object.keys` are exactly `kind,id,title,text,emoji,tone` and whose `JSON.stringify` equals the pre-change string (golden literal in the test), so no seeded save changes.
3. `notice(g, 't', 'x', { weight: 'minor' })` adds exactly one key, `weight: 'minor'`; `{ weight: 'major' as never }` adds none; `{ link: 'assets/home' }` adds exactly `link`; `{ link: '' }` adds none.
4. `CHART_LIMITS` equals the D.2 numbers; a literal `ChartSpec` of each `kind` compiles; `charts/spec.ts` has no `import` line (read the file text).
5. Regression: `test/save-schema.test.ts` and `test/save-store.test.ts` stay green (run them; the v4.0.2 fixture still loads).

**Flag.** None. **Depends on.** Nothing. Land it right after R1-P1.
**Hot-file notes.** `types.ts`: four separate hunks (the import after the header comment, the `NoticeModal` fields, the `AnnualReportData` field, the `MenuBase`/`MenuInfo` fields). `core.ts`: the interface and the `notice()` body only.
**Size.** About 110 source lines, 100 test lines.

---

### R1-P3 K.11: the `FLAGS` object and per-branch previews

**Roadmap items.** K.11 (D.10), D8 (part G), decision "features ship dark behind flags".

**Files.**
- Create: `src/game/flags.ts`, `test/flags.test.ts` (first line `// ci: fast`), `.github/workflows/preview.yml`, `docs/PREVIEWS.md`.
- No edit to `src/main.tsx` (K.5a edits it); the module reads the URL itself.

**Naming warning for readers.** `GameState.flags` (saved misc flags, classified by R1-P6) is a different thing from `FLAGS` (build-time feature switches, never saved). The header comment of both files says so. Likewise the player setting `Settings.quietMode` (R1-T5) is not the build flag `quietInbox`.

**Cross-check rules for the other four tracks (this task's header comment repeats them):** these eight keys are the complete R1 set; no other task adds, renames or flips a key; production code reads `FLAGS.key` or `flagOn('key')` at use; tests use `withFlags` or `setFlags` plus `resetFlags`, never a module mock and never an assignment. There is no key for E.T1: the flavor move ships live because it is parity-proven (R1-T2's golden).

**Interfaces.**

```ts
// src/game/flags.ts  (imports nothing; read FLAGS at use, never in a module-level const)
export interface FlagDef { readonly default: boolean; readonly ships: string }   // ships: the package.json version that turns it on
export const FLAG_DEFS = {
  chartKit:      { default: false, ships: '4.1.0' },   // chart rows in menus, ladders, stock sparklines, Books group, net-worth line (G.2, G.6, G.7)
  annualReport2: { default: false, ships: '4.1.0' },   // tabbed Annual Report data, Year-End Desk and company strip (G.4)
  navRegroup:    { default: false, ships: '4.1.0' },   // regrouped Activities, "Needs you" badges, breadcrumbs (G.8)
  navPalette:    { default: false, ships: '4.1.0' },   // header search, palette, shortcuts, pins, recents (G.9)
  cockpits:      { default: false, ships: '4.1.0' },   // company, wealth and tab cockpits (G.5)
  noticeDigest:  { default: false, ships: '4.1.0' },   // ModalHost digest merge (G.11 step 1)
  quietInbox:    { default: false, ships: '4.1.0' },   // minor notices to the inbox, Settings section, header bell (G.11 step 2); the Settings value Quiet Mode defaults to on
  idbSaves:      { default: false, ships: '4.1.0' },   // IndexedDB boot (K.5a)
} as const satisfies Record<string, FlagDef>
export type FlagKey = keyof typeof FLAG_DEFS
export type FlagOverrides = Partial<Record<FlagKey, boolean>>
export const FLAGS: Readonly<Record<FlagKey, boolean>>      // a live view: reads reflect setFlags/withFlags
export function flagOn(key: FlagKey): boolean
export function setFlags(over: FlagOverrides): void         // replaces all overrides; defaults fill the rest
export function resetFlags(): void
export function withFlags<T>(over: FlagOverrides, fn: () => T): T   // restores in a finally block
export function parseFlagList(raw: string | null | undefined): FlagOverrides
```

`FLAGS` is one object whose properties `setFlags`, `resetFlags` and `withFlags` rewrite in place (typed readonly for consumers), so `import { FLAGS }` stays valid after an override. Use comments, not prose strings, for the notes (the voice report measures strings in `src`).

**Behaviour.**
- `parseFlagList('chartKit,-navRegroup')` gives `{ chartKit: true, navRegroup: false }`; `'all'` turns every flag on, `'none'` every flag off; unknown names are ignored; input longer than 200 characters or more than 20 tokens gives `{}`.
- At module load, only when `typeof location !== 'undefined'` and always inside try and catch: `?flags=...` from `location.search` wins over `localStorage['anotherlife.flags']`, which wins over the defaults. Node and tests never see a `location`, so they always get the defaults.
- Rule recorded in the header: R1 flags change presentation only. A flag that changes simulation output (R2 on) must be stamped into the save at life creation and read from the save, never from `FLAGS` at runtime, so replays stay deterministic. "A flag never changes a saved field's meaning" (design 14.7).
- Release rule (enforced by test): with `package.json` version V and a flag's `ships` S, `V >= S` means the default must be `true`, otherwise it must be `false`. The lead's release commit bumps the version and flips the eight defaults together; either half alone fails CI. Nobody else flips a default: R1-N10 and R1-T10 are acceptance sweeps, not flips. A flag deferred to a later release gets `ships: '5.0.0'` and stays dark.

**Previews, what is feasible.** `deploy.yml` deploys to the Worker `snag` only when the repo secret `CLOUDFLARE_API_TOKEN` exists (it prints a notice and skips otherwise), with the account id `ffa768ebc2ffc3bcd0bf7847c956b9df` in the file; nothing in the repo shows whether the secret is set. `wrangler.jsonc` has `workers_dev: true`, a build command, and a comment saying the Worker is connected to Cloudflare Workers Builds. The installed wrangler is 4.149.0, which supports `versions upload --preview-alias` (checked in `wrangler-dist/cli.js`). So:
1. `preview.yml` (new) uploads a non-promoted version per branch with a preview alias, guarded by the same `HAS_CLOUDFLARE_API_TOKEN` pattern as `deploy.yml`, so it is safe with or without the secret.
2. If the secret is absent, the owner can instead enable non-production branch builds in Workers Builds (no code change). `docs/PREVIEWS.md` says both.
3. Neither can be proven from code. The workflow's first real run (with a token) is the test; say so in the PR.

`preview.yml` shape: `on: push: branches: ['release/**', 'claude/**']` plus `workflow_dispatch`; `permissions: contents: read`; `concurrency: group: preview-${{ github.ref_name }}, cancel-in-progress: true`; one job with `env: HAS_CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}`; steps (skipped unless the token exists): checkout with `persist-credentials: false`, setup-node 22 with npm cache, `npm ci`, compute the alias (`printf '%s' "$GITHUB_REF_NAME" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40 | sed -E 's/-+$//'`), then `npx wrangler versions upload --preview-alias "$ALIAS" --message "$GITHUB_SHA" | tee upload.log`, then write the `https://` line of the log into `$GITHUB_STEP_SUMMARY`. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are passed as `env` on the upload step only. Never use `pull_request_target`. The build runs through `wrangler.jsonc`'s `build.command` (`npm run build`), so a broken branch never uploads. Preview URLs are for the owner's phone check of a track branch; the dark flags are turned on in the preview with `?flags=all` or a list.

`docs/PREVIEWS.md` (about 35 lines): how to open a preview, `?flags=` syntax, `localStorage['anotherlife.flags']`, the token-or-Workers-Builds choice, and that previews and flags are presentation-only in R1.

**Tests** (`test/flags.test.ts`, first line `// ci: fast`; write first):
1. Every `FLAG_DEFS` key matches `^[a-z][A-Za-z0-9]*$`, `ships` is `x.y.z`, `default` is boolean; the keys are exactly `annualReport2, chartKit, cockpits, idbSaves, navPalette, navRegroup, noticeDigest, quietInbox` (sorted; the list agreed by the cross-check).
2. Release rule against the real `package.json` version (import with `resolveJsonModule`): flags with `ships` at or below the version default true, the others false. Also unit-tested with a synthetic version table.
3. `parseFlagList` table of 10 inputs (empty, null, `all`, `none`, list, negation, unknown, mixed case, 201 characters, 21 tokens).
4. `withFlags` applies and restores, also when the callback throws; nested calls restore in order; `FLAGS.chartKit` and `flagOn('chartKit')` agree; `setFlags({})` then `resetFlags()` returns to defaults; an assignment to `FLAGS.chartKit` is a compile error (`// @ts-expect-error`).
5. In node (no `location`) the live `FLAGS` equals the defaults at import.
6. Source guards over `src/**`: no top-level `const|let X = FLAGS.` or `= flagOn(` at column 0 (read at use only); `src/game/flags.ts` has no `import` line.
7. No U+2014 or U+2013 in `flags.ts`, `preview.yml`, `PREVIEWS.md`.
7b. Cross-check guard: no file under `test/` mocks the flags module (no `vi.mock(` whose first argument ends in `game/flags`, and no `vi.doMock(` of it), and no file under `src/` or `test/` other than `flags.ts` and `flags.test.ts` assigns to a property of `FLAGS` (text scan for `FLAGS.<key> =` that is not `==`/`===`). The failure message says to use `withFlags` or `setFlags` with `resetFlags`.
8. `preview.yml` text: contains `HAS_CLOUDFLARE_API_TOKEN`, `--preview-alias`, `contents: read`, and does not contain `pull_request_target`.

**Flag.** This task defines them; all default false until the release commit.
**Depends on.** Nothing hard; it can run beside R1-P2. Rebase on R1-P1 for the `// ci: fast` marker to take effect.
**Hot-file notes.** All new files.
**Size.** About 265 source lines (150 + 80 + 35), 150 test lines.

---

### R1-P4 K.1: the import-cycle ratchet

**Roadmap items.** K.1 (D.10), D.11 criterion 10 ("the cycle ratchet fails on a synthetic new cycle"), exit gate "no new import cycle".

**Files.**
- Create: `test/arch-kit.ts`, `test/architecture.test.ts` (first line `// ci: fast`), `test/architecture-baseline.json`.
- The lead adds the esbuild devDependency first (lead action 1). The task only imports `esbuild`.

**Prototype result (run during planning, nothing written to the repo).** Building one esbuild graph over all of `src` at v4.0.2 gives 627 modules, 5,213 import records (5,116 distinct edges) and exactly the roadmap's cycle shape: 5 components of 85, 30, 19, 7 and 6 modules, 147 in all. It takes about 250 ms. `menus.ts`, `aging.ts`, `life.ts`, `core.ts`, `types.ts`, `business/state.ts` and `business/economic-report.ts` are not in a cycle today (they sit above the 85-module component), so new chart builders may import them freely as long as nothing inside a cycle imports the builders back.

**Interfaces.**

```ts
// test/arch-kit.ts
export type Graph = ReadonlyMap<string, readonly string[]>          // 'src/game/a.ts' -> modules it imports at runtime
export async function readImportGraph(root: string, files?: readonly string[]): Promise<Graph>
export function cycleComponents(g: Graph): string[][]               // strongly connected components with more than one module or a self-import; each sorted; list sorted by size descending, then first path
export interface ArchBaseline { v: 1; components: string[][] }
export interface Violation { kind: 'new-module' | 'merged' | 'stale'; modules: string[]; hint: string }
export function compareToBaseline(current: readonly string[][], baseline: ArchBaseline): Violation[]
export function shrinkBaseline(current: readonly string[][], baseline: ArchBaseline): ArchBaseline   // throws if current has a module not in baseline
export function cyclePath(g: Graph, from: string): string[]         // one shortest import path from `from` back to itself, for the failure message
```

`readImportGraph`: list every `.ts`/`.tsx` under `src` (not `.d.ts`), sorted; call esbuild's `build` with `stdin: { contents: <one 'import "<abs path>"' line per file>, resolveDir: root, sourcefile: 'all.ts', loader: 'ts' }`, `bundle: true`, `write: false`, `metafile: true`, `format: 'esm'`, `platform: 'browser'`, `logLevel: 'silent'`, `packages: 'external'`, `outdir: <root>/.arch-out` (never created), `loader: { '.css': 'empty' }`, `tsconfig: <root>/tsconfig.json` (only when that file exists, so the temp-directory fixture works), `absWorkingDir: root`. Edges are `metafile.inputs[x].imports` with `kind === 'import-statement'`, not `external`, and present in `inputs`; drop the `<stdin>` input; normalise `\` to `/`. Dynamic `import()` is not an edge (it runs lazily, so it is not a load-order hazard; K.8 will add some). Type-only imports never appear because esbuild erases unused imports in TypeScript files; the fixture test below pins that.

`test/architecture-baseline.json`: `{ "v": 1, "components": [[...85 paths], [...30], [...19], [...7], [...6]] }`, one path per line. Generate it from the post-R0 base with `UPDATE_ARCH_BASELINE=1 npx vitest run --maxWorkers=1 test/architecture.test.ts`; say in the PR if the counts differ from 85, 30, 19, 7, 6.

**Behaviour of the test.**
- Violations: (a) `new-module`: a module in a cycle now that is not in the baseline; (b) `merged`: a current component that is not a subset of one baseline component (two components fused, the v4.0.0 failure mode, even though no module is new); (c) `stale`: a baseline module that is no longer in any cycle (the list may only shrink, so the PR must run `UPDATE_ARCH_BASELINE=1`, which writes `shrinkBaseline`).
- Each failure message names the module, prints `cyclePath`, and says: "make the import type-only, move the shared value into a leaf module, or register through a seam (see YEARLY_HOOKS and registerFamily)".
- `UPDATE_ARCH_BASELINE=1` rewrites the file only through `shrinkBaseline`; it refuses to add a module.
- Layer rules (b) to (e) of digest K arrive with the registry in R2; not here.

**Tests** (`test/architecture.test.ts`, vitest `timeout: 60_000` on the graph test):
1. Real graph sanity: at least 500 modules, contains `src/game/core.ts` and `src/ui/store.ts`, every edge target is a key.
2. Real ratchet: `compareToBaseline(cycleComponents(graph), baseline)` is `[]`.
3. Synthetic: `a -> b -> a` over a three-node graph gives one component; adding `c -> a` and `b -> c` grows it (kind `new-module`); fusing two baseline components with one edge gives `merged`; a self-import counts; removing the edge gives `stale`. This is D.11 criterion 10 "fails on a synthetic new cycle".
4. `shrinkBaseline` keeps the intersection, preserves order, and throws on a new module.
5. `cyclePath` returns a closed path through the module and `[]` when it is not in a cycle.
6. Fixture in `os.tmpdir()` (written and removed inside the test): `a.ts` with `import type { T } from './b'` and `b.ts` importing a value from `a.ts` gives no cycle; two value imports give a cycle; an `import('./b')` in a function gives no edge.
7. Baseline file shape: sorted, unique, each path exists on disk, component sizes sum to the module count.

**Flag.** None. **Depends on.** Lead action 1 (esbuild devDependency); R0 merged; rebase on R1-P1 for the `fast` marker.
**Hot-file notes.** All new files.
**Size.** About 140 lines of kit, 120 lines of test, 160 lines of baseline data.

---

### R1-P5 X.G1: foresight scan, money ratchet, ceiling list (and the scan kit)

**Roadmap items.** X.G1 (D.10), the "Guard" lines of R0-1, R0-2, R0-3, R0-7, R0-8, R0-12, R0-14 and F16, D.11 criterion 10, decision D12.

**Files.**
- Create: `test/scan-kit.ts`, `scripts/voice/lexer.d.mts`, `test/scan-kit.test.ts`, `test/foresight-scan.test.ts`, `test/money-ratchet.test.ts`, `test/money-ratchet.json`, `test/ceiling-list.test.ts`, `test/ceiling-list.json`. All test files start with `// ci: fast`.
- Reads (does not edit): `scripts/voice/lexer.mjs` (433 lines; `lex(src, tsx)` returns `{ toks, errors }`; it was validated against the TypeScript parser on all 486 files of v2.4.0 and lexes the 619 files of v4.0.2 in about 370 ms with 0 errors), `src/game/invest/engine.ts` (`exchangeYear` 1278, `cryptoYear` 1387, `goldYear` 1456, `fxYear` 1602), `src/game/invest/instinct.ts`, `test/fuzz-kit.ts` (`renderAll` 430, `FailureLog` 76), `test/helpers.ts` (`makeTestGame` 56).

**Interfaces.**

```ts
// scripts/voice/lexer.d.mts
export const K_ID: number, K_NUM: number, K_PUNCT: number, K_STR: number, K_TMPL: number, K_REGEX: number, K_JSXTEXT: number
export interface LexToken { k: number; v: string; p: number; e: number; nl: boolean; td: number; raw?: string; parts?: string[]; nExpr?: number }
export function lex(src: string, tsx: boolean): { toks: LexToken[]; errors: string[] }
```

```ts
// test/scan-kit.ts
export { K_ID, K_NUM, K_PUNCT, K_STR, K_TMPL } from '../scripts/voice/lexer.mjs'
export type Tok = LexToken
export interface SourceFile { path: string; text: string; toks: Tok[] }      // path is repo-relative posix, e.g. 'src/game/core.ts'
export const ROOT: string                                                    // repository root
export function loadSources(root?: string, dir?: string): SourceFile[]       // every .ts/.tsx under dir (default 'src'), not .d.ts, sorted by path
export function toSource(path: string, text: string): SourceFile             // for synthetic fixtures; tsx decided by the extension
export function isId(t: Tok | undefined, v?: string): boolean
export function isPunct(t: Tok | undefined, v: string): boolean
export function closeParen(toks: readonly Tok[], open: number): number      // index of the ')' that closes toks[open], or -1
export function splitArgs(toks: readonly Tok[], open: number, close: number): Tok[][]   // top-level comma split
export function lineOf(text: string, offset: number): number
```

**Behaviour: foresight scan** (`test/foresight-scan.test.ts`).
- Watched calls: `exchangeYear` (year is argument 4), `cryptoYear` (3), `goldYear` (3), `fxYear` (3). A call is a K_ID token followed by `(` whose previous token is not `function`.
- Rule 1 (direct): any argument contains a `+` followed by a number token of value 1 or more. This is the roadmap's rule, tokenised so strings and comments never match.
- Rule 2 (alias, new): the year argument is a bare identifier bound in the same file within the previous 40 lines by `const|let ID = <expr>` where the expression has `+ N` (N at least 1) right after an identifier named like `year` (case-insensitive) or exactly `y`. The roadmap's rule misses this form, and v4.0.2 has one: `src/game/computer/money-stocks.ts` `settlePrice` (line 288, `const year = bet.year + 1`, used at 295 and 301). Prototype on v4.0.2: rule 1 flags `invest/instinct.ts` lines 114, 142, 147 and `investments.ts` 2139 (which R0-2 removes); rule 2 flags only money-stocks 295 and 301.
- Exemptions, each a named constant with a reason: file `src/game/invest/instinct.ts` (the one documented exception, D12); alias binding `{ file: 'src/game/computer/money-stocks.ts', id: 'year' }` ("settlePrice settles a bet one year after it was placed; its caller only settles bets with `bet.year < g.year`", line 353).
- Fence (F16): only these files may import `invest/instinct`: `src/game/investments.ts`, `src/game/business/fund-events.ts`, `src/game/computer/money-options.ts`, `src/game/computer/money-stocks.ts`. A fifth importer fails with the message "the Investing gut reads next year; keep it behind the talent (`hasTalent(g, 'Investing')` at instinct.ts:177)". The exemption list has exactly one file (asserted).
- Runtime spy (design 14.1 invariant 1, "a spy test"): `vi.mock('../src/game/invest/engine', ...)` wrapping the four functions to record the year asked (the pattern of R0-2's `test/analyst-tip.test.ts`). Six lives built like `investor()` in R0-2's `test/analyst-tip.test.ts` (`makeTestGame(seed, { age, money: 5_000_000, countryId, talents })`, then set `g.lifeId`, `g.year` and `g.log`) for 1975, 2000 and 2026 in two countries, without the Investing talent, each rendered with `renderAll(g, new FailureLog(), 3)` (it walks every menu on a frozen copy and calls every pure read; cross-check: depth 3 for these six, one `it` for them and a 90 s timeout, so the file stays well under two minutes on one worker): the maximum year asked is at most `g.year`. Then two lives with `talents: ['Investing']` in a second `it` at depth 4: the maximum is `g.year + 1` and at least one future ask happened (a spy that never fires proves nothing). Measure the file once and note the time in the PR; if either `it` takes over 60 s, cut the depth, not the lives.

**Behaviour: money ratchet** (`test/money-ratchet.test.ts`, `test/money-ratchet.json`).
- Counted per file in `src` (not tests, not `.d.ts`), tokens only: `earnIncome(`, `addMoney(`, `spend(` (call sites; a declaration after `function` is skipped), and the two compound assignments `.cash +=` and `.money +=` with any receiver. The roadmap names `b.cash +=` and `p.money +=` only; any receiver is a superset (v4.0.2 comments-stripped counts: `.cash +=` 51 against 44, `.money +=` 31 against 22) so renaming the receiver cannot dodge the ratchet. Totals at v4.0.2: `spend` 176, `earnIncome` 96, `addMoney` 183, in about 135 files.
- Baseline `{ "v": 1, "files": { "src/game/careers.ts": { "earnIncome": 4, ... } } }`, nonzero counts only, sorted. Failure: a count above its baseline, or a nonzero count in a file not in the baseline (a new file). A count below baseline passes and the test prints a one-line note; `UPDATE_MONEY_RATCHET=1` rewrites the JSON but only downward (it refuses to raise). A pure rename of a file means moving its entry by hand.
- Spot checks pinned in the test so the baseline is anchored to the roadmap's guard lines: `special/social.ts` `earnIncome` 3 (R0-1), `special/sports-core.ts` 1 and `special/sports-olympics.ts` 1 (R0-7), `special/military.ts` earn+add 2 and `special/hustler.ts` add+spend 6 (the "2 and 6" of R0-12). R0 changes some of these; the test pins what the merged base has, and the PR states any difference.
- Known gap, stated in the file header: direct assignments such as `c.money = c.money + x` are not counted. R2's reasoned-call ratchet replaces this test.

**Behaviour: ceiling list** (`test/ceiling-list.test.ts`, `test/ceiling-list.json`). R0-14's guard line says "R1 X.G1's ceiling list names every growth term with a cap", but D.10 does not define it. Minimal version: `ceiling-list.json` is `[ { "id": "podcast-audience", "file": "src/game/special/fame.ts", "token": "MAX_AUDIENCE", "cap": "30,000,000 listeners (R0-14)" }, ... ]`. The test passes when the token still exists as an identifier token in that file; removing a cap constant fails with the cap description. Seed the list from the merged R0: R0-14 `MAX_AUDIENCE`, the `MAX_FAME_LEDGER` of `fame.ts`, the R0-12 `payScale` helper in `special/common.ts`, the R0-7 and R0-8 caps (read their names from the merged code; if a task used a different identifier, use that), and the studio trillion-loop fix of v4.0.1 (find the cap constant in `business/gamestudio*.ts`). At least 6 entries; every entry's file must exist.

**Tests** (numbered; write first):
- `test/scan-kit.test.ts`: (1) `loadSources` returns more than 600 files, sorted, with zero lexer errors; (2) a call inside a string, a template or a comment is not seen; (3) `closeParen` and `splitArgs` handle nested calls, arrays, arrow functions and template strings; (4) `lineOf`.
- `test/foresight-scan.test.ts`: (1) the real source has no violation outside the exemptions; (2) synthetic `exchangeYear(f, a, i, y + 1)` is flagged (D.11 criterion 10); also `cryptoYear(f, a, g.year + 2)`, `goldYear(f, a, y+1)`, `fxYear(f, c, g.year + 1)`; (3) `exchangeYear(f, a, i, g.year)` and `exchangeYear(f, a, i, y - 1)` are not; (4) `const ny = g.year + 1` followed within 40 lines by `goldYear(f, a, ny)` is flagged by rule 2, and the same with the binding 45 lines up is not; (5) a mention in a comment or string is not flagged; (6) the exemption list has exactly one file and the importer fence passes for the real tree and fails for a synthetic fifth importer; (7) the spy tests above.
- `test/money-ratchet.test.ts`: (1) the real counts do not exceed the baseline; (2) a synthetic `earnIncome(g, 5)` in a new file fails (D.11 criterion 10), in a baseline file one above its count fails, at its count passes; (3) `function spend(`, `overspend(`, `x.spent(`, a mention in a comment and a string are not counted; `a.cash += 1`, `p.money += 2` and `g.character.money += 3` are; (4) the spot checks; (5) baseline shape (sorted, positive integers, each file exists).
- `test/ceiling-list.test.ts`: every entry's token is found; a synthetic file without the token fails; at least 6 entries.

Run: `npx vitest run --maxWorkers=1 test/scan-kit.test.ts test/foresight-scan.test.ts test/money-ratchet.test.ts test/ceiling-list.test.ts` (the spy test renders eight lives in two `it`s; expect under a minute and a half) and `npm run typecheck`.

**Flag.** None. **Depends on.** R0 merged (R0-2 removes the `+ 1` in `seededTip`; baselines come from the merged tree); R1-P1 for the `fast` marker.
**Hot-file notes.** All new files; `src` is not edited.
**Size.** About 520 lines of kit and guard code (`scan-kit` 120, `lexer.d.mts` 30, foresight 230, money 150 and its JSON 140, ceiling 90), about 330 test lines in `scan-kit.test.ts` and the synthetic cases.

---

### R1-P6 A.K0: classify every `flags` key as world, personal or cache

**Roadmap items.** A.K0 (D.10), R0-4 guard ("the table is the seed of A.K0"), review focus RF3.

**Files.**
- Create: `src/game/world-flags.ts`, `test/world-flags-kit.ts`, `test/world-flags.test.ts` (first line `// ci: fast`).
- Reads: `src/game/life.ts` (`continueAsChild` at 1137; the flag whitelist is `n.flags = {` at about 1509 to 1535, plus `heavyWorldFlags`, `waveWorldFlags`, `benchWorldFlags`, and from R0-4 `nationWorldFlags`), `test/heir-world-flags.test.ts` (created by R0-4), `test/scan-kit.ts` (R1-P5), `test/helpers.ts`, `src/game/death.ts` (`killCharacter` at 11), `src/game/people.ts` (`createPerson` at 165).

**What the scan sees at v4.0.2** (prototype with the lexer; the roadmap's "about 190" is only the first of five access forms):
1. 190 literal keys: `flags.name`, `flags?.name`, `flags['name']`.
2. 55 keys behind string constants, 32 of them not in the first list (222 distinct exact keys in all): `flags[SOME_KEY]` where `const SOME_KEY = 'x'` is declared in the file (for example `POLICY_KEY = 'nation.policy'`, `ECONOMY_KEY = 'worldEconomy'`, `WILL_KEY`, `STAFF_KEY`, and the new-only ones such as `fugitive`, `diet`, `will.pot`, `luxury.society`).
3. 14 template sites, 10 distinct prefixes: `skill.`, `biz.ipoHint.`, `own.`, `wealth.bound.`, `relEventAt.`, `relEventPerson.`, `special.`, `special.list.`, `special.own.`, `fame.scene.` (plus `heavy.` built by `heavyKey(industry, market)`).
4. 36 `flags[expr]` sites whose key is a variable or a call (a `key` parameter in `finance.ts`, `health.ts`, `special/common.ts`, `activities/common.ts`, and so on) that no static scan can resolve.
5. 22 whole-object token uses of `flags` (not followed by `.`, `?.` or `[`): spreads (`{ ...g.flags }`), `Object.keys(g.flags)`, `'recordedGrave' in g.flags`, `flags: {}` in `life.ts:732`, the `n.flags = {` rebuild, the type in `types.ts:699`, and 7 aliases whose later reads the scan cannot see (`const raw = g.flags` in `heavy-rd.ts`, `tech-wave-factors.ts` x3 and `market-events.ts`; `const world = g.flags` in `save.ts`; `const f = g.flags` in `ui/components/ProfileSheet.tsx`).
Also `previousGeneration` is written only inside the `n.flags = {` literal and never read. Scan `src` (not only `src/game`): `deathRecorded` and `finalOccupation` are read from `src/ui/store.ts` and screens.

**Interfaces.**

```ts
// src/game/world-flags.ts   (imports only `type Json` from './types')
export type FlagClass = 'world' | 'personal' | 'cache'
export interface FlagRule {
  readonly match: string               // exact key, or a prefix when `prefix` is true
  readonly prefix?: true
  readonly cls: FlagClass
  readonly sample?: Json               // world only: a value that survives the handoff verbatim
  readonly needs?: string              // world only: a companion key the handoff carries only when this other key is truthy (set both)
  readonly loose?: true                // world only: assert presence and typeof, not equality (the handoff itself writes the key)
  readonly covered?: string            // world only, when there is no sample: a string that must appear in test/heir-world-flags.test.ts (the helper name)
}
export const WORLD_FLAG_RULES: readonly FlagRule[]
export function classifyFlag(key: string): FlagClass | null       // exact match first, then the longest prefix; null when unclassified
export const DECLARED_AHEAD: readonly string[]                    // ['lifeSeries', 'inbox', 'textMem']: personal, written by G.3, G.11, E.T1 later; exempt from the no-stale-rule check
export const DYNAMIC_FLAG_SITES: Readonly<Record<string, number>> // file -> count of flags[expr] sites with an unresolvable expr (36 across 12 files today)
export const WHOLE_FLAGS_SITES: Readonly<Record<string, number>>  // file -> count of whole-object token uses, aliases included (22 today)
```

Compact the rules: three arrays of strings (`WORLD`, `CACHE`, `PERSONAL`) and a prefix array, expanded into rules, so the file stays near 190 lines. Notes go in `//` comments, not strings.

**Classes.**
- `world`: survives `continueAsChild`. From `life.ts`: `givingFund`, `heirOccupation`, `marketShocks`, `marketBreakthroughs`, `business.confidence`, `business.confidenceYear`, `worldEconomy`, `groupServices`, `groupServicesPrepared`, `groupServicesSettled`, `groupServiceResults`, `timelineForks`, `workshop.firsts`; from R0-4 `nation.policy`. Through helpers (no `sample`, `covered` = the helper name): prefix `heavy.` and `market.news` (`heavyWorldFlags`), `techWaves` and `techBase` (`waveWorldFlags`), `aiFirsts` (`benchWorldFlags`). Samples for the plain ones: arrays `[]` for `marketShocks`, `marketBreakthroughs`, `timelineForks`, `workshop.firsts`; a short string for `heirOccupation`; a non-empty object for `givingFund`, `worldEconomy`, `groupServices`; numbers for the two `business.confidence` keys. Companions: `business.confidenceYear` has `needs: 'business.confidence'`; `groupServicesPrepared`, `groupServicesSettled` and `groupServiceResults` have `needs: 'groupServices'` (the `life.ts` literal carries them only inside that conditional). `heirOccupation` is `loose`: `life.ts:1282` writes it for the heir, so the test asserts a string is present, not its value. R0-4's table does not list `givingFund`, `heirOccupation` or the group-service companions, which is why they get samples instead of `covered`.
- `cache`: derived or regenerable; deleting it changes no later outcome except repeated text or duplicate popups. Starting set to confirm by reading the code: `flavorRecent`, `eventMemory`, `offlineEventHistory`, `offlineEventGeneration`, `core.resolvedScriptModals`, `aiRecentEvents`, `milestonesLogged`. Cache keys are also dropped at the heir.
- `personal`: everything else (the heir starts clean). When in doubt, `personal`. Pre-declare `lifeSeries`, `inbox`, `textMem` here.

**Behaviour of the scan** (`test/world-flags-kit.ts`, pure, takes `SourceFile[]` so synthetic sources work): returns `{ literal: Map<key, files[]>, resolved: Map<key, files[]>, templates: Map<prefix, files[]>, dynamic: Record<file, number>, whole: Record<file, number> }`. A constant resolves when `const|export const NAME = '<string>'` exists in the same file, otherwise in any other file (the first declaration with that name; report an ambiguous name so a reviewer sees it). `'<key>' in X.flags` counts as a literal. A template site contributes `parts[0]` as a prefix.

**Tests** (`test/world-flags.test.ts`; write first):
1. Every literal and resolved key found in `src` is classified (`classifyFlag` non-null); the failure lists each key with its file and says "add it to src/game/world-flags.ts (world, personal or cache)". This is the roadmap's "fails on an unclassified key".
2. Every template prefix has a prefix rule.
3. No stale rule: every exact rule is seen by the scan, except `DECLARED_AHEAD` and helper-produced keys (`market.news`, `techWaves`, `techBase`, `aiFirsts`, `heavy.` are produced by helpers but also read with literal or constant access, so they are normally seen; the implementer lists any that are not).
4. Ratchets: for each file, the count of dynamic sites and whole-object uses is at most the baseline; a file not listed with a nonzero count fails ("use a declared constant key, or add a prefix rule"). The three baselines are generated from a real run.
5. Heir survival, world keys: for each exact world rule with a `sample`, build a dead parent with `makeTestGame(1, { age: 70 })`, a living child via `createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })`, set the flag, `killCharacter(g, 'Old Age')`, `g.queue = []`, `continueAsChild(g, child.id)`, and assert the heir has the key equal to the sample, or just a string for a `loose` rule (the pattern of `test/heavy-handoff.test.ts`). Every world rule without a `sample` has its `covered` string present in `test/heir-world-flags.test.ts` (read as text). This is "the heir-survival table of R0-4 covers every world key". If `test/heir-world-flags.test.ts` or `nationWorldFlags` is missing, stop and tell the lead (R0-4 not merged).
6. Heir survival, personal and cache keys (cross-check: batched, about 220 keys): one parent with **every** exact personal and cache key set to the sentinel `'__parent__'` (and `prefix + 'x'` for each prefix rule), one handoff, then assert per key that `n.flags[key] !== '__parent__'`. Only when the batched handoff throws, bisect: rerun the keys in halves until the throwing key is found, retry that key with `{ __leak: true }`, and if it still throws list it in a `HANDOFF_THROWS` constant with a comment (a hostile-flag robustness bug for the lead, not this task), then continue with the rest. One game build instead of 220 keeps the file under about 20 s.
7. Unit tests of the kit on synthetic sources: literal, optional chain, bracket string, constant, template prefix, `in`, alias, whole-object, a mention in a comment (ignored).
8. `classifyFlag`: exact beats prefix, longest prefix wins, unknown is null; rules have unique `match` values; no rule is both world and cache.

Run: `npx vitest run --maxWorkers=1 test/world-flags.test.ts test/heavy-handoff.test.ts test/heir-world-flags.test.ts` and `npm run typecheck`.

**Flag.** None. **Depends on.** R0-4 merged, R1-P5 (`scan-kit.ts`, `lexer.d.mts`), R1-P1 for the `fast` marker.
**Hot-file notes.** All new files. Later tracks add a key to `world-flags.ts` only if it is not one of the three declared ahead; a one-line addition to the `PERSONAL` array.
**Size.** About 330 lines (`world-flags.ts` 190, kit 140), about 260 test lines.

---

### R1-P7 K.7a (b): split the five slow files by seed range (`test/shard-kit.ts`)

**Roadmap items.** K.7a (D.10), design 13.6. The five files are 1,727 of 3,869 worker-seconds; with them whole, the longest single file (494 s) sets a floor close to the whole target.

**Files.**
- Create: `test/shard-kit.ts`, `test/shard-kit.test.ts` (first line `// ci: fast`).
- Modify: `test/simulate.test.ts` (lines 4, 200 to 251), `test/era-features.test.ts` (5, 121 to 156, 158 to 441, 444+), `test/main-character-life.test.ts` (165 to 213), `test/sector-story.test.ts` (124 to 208), `test/anachronism.test.ts` (242 to 344), `scripts/test-timings.json` (fill `split` with exactly those five paths).
- No workflow edit (R1-P1's `aggregate` job already runs the merge).

**The problem each file poses** (read from the code at v4.0.2):

| File | Today | Aggregate over seeds? |
|---|---|---|
| `simulate.test.ts` | `it.each` of 40 seeds (line 206), `afterAll` (212) asserts 40 results and a median age above 50; one `it` loops 6 heir seeds 100 to 105 (231) | yes (count and median) |
| `era-features.test.ts` | `it.each` of 2 years x 200 seeds (129), `afterAll` (133) asserts 200 per year and statistical thresholds; many cheap describes; two `it`s of whole lives (434, 438) | yes (thresholds over all 400) |
| `main-character-life.test.ts` | one `it` plays 14 seeds twice (166 to 177) then asserts a mean and a max; one `it` with 12 career seeds (204) | yes (mean, max, sums) |
| `sector-story.test.ts` | four `it`s (food, care, util at 126; hired at 183), each pooled over its own seeds | no: pooled inside one test, so the unit to split is the test |
| `anachronism.test.ts` | `lint(LIVES = 48, ...)` in one `it` (327) asserting zero findings; 8 lives asserting `hits > 20` (334) | lint: no (zero is per life); present-year: yes (`hits`) |

Splitting by seed must not weaken an assertion, so aggregates run on the union through a merge step, never on a slice alone.

**Interfaces.**

```ts
// test/shard-kit.ts  (vitest-free; Node builtins only)
export type SliceMode = 'full' | 'part' | 'merge'
export interface SliceSpec { mode: SliceMode; index: number; count: number }      // index is 0-based
export function readSlice(raw?: string): SliceSpec        // default process.env.SLICE; ''/unset -> full (0,1); 'merge' -> merge; 'i/n' with 1<=i<=n<=64 -> part (i-1, n); anything else throws
export function seedSlice<T>(all: readonly T[], key: string, spec?: SliceSpec): T[]   // full: all; merge: []; part: all.slice(floor(index*len/count), floor((index+1)*len/count))
export function ownedHere(key: string, spec?: SliceSpec): boolean     // full: true; merge: false; part: fnv1a(key) % count === index
export function recordSlice(key: string, rows: unknown, spec?: SliceSpec): void    // part only: writes <SLICE_DIR>/<key>.<i>of<n>.json; otherwise a no-op
export function mergedSlices<T = unknown>(key: string, spec?: SliceSpec): T[]      // merge only: concatenation of every slice's rows in slice order; throws, naming the key and the missing index, if a slice file is absent, duplicated, or from a different n
export function encodeRows(rows: unknown): string                      // JSON; non-finite numbers become {"__num":"NaN"|"Infinity"|"-Infinity"}
export function decodeRows<T>(text: string): T
export function sliceDir(): string                                      // process.env.SLICE_DIR ?? 'test-slices'
```

The `key` is sanitised for file names (`[^A-Za-z0-9._-]` becomes `-`). `it.each([])` is a no-op in vitest 5 (checked in `run.BTlFXlnv.js`: `cases.forEach` over an empty array), so an empty slice list needs no guard; a file must still register at least one test in every mode (the aggregate `it` always exists).

**Recipe for the aggregate pattern** (used by simulate, era-features, main-character-life, present-year):

```ts
const slice = readSlice()
const SEEDS = seedSlice(allSeeds, 'simulate:lives', slice)
it.each(SEEDS)('plays seed %i without errors', seed => { results.push(playLife(seed, 4).result) }, 120_000)   // unchanged body
it('summarises the lives', () => {                        // was afterAll
  recordSlice('simulate:lives', results, slice)
  if (slice.mode === 'part') { expect(results).toHaveLength(SEEDS.length); return }
  const all = slice.mode === 'merge' ? mergedSlices<LifeResult>('simulate:lives', slice) : results
  expect(all).toHaveLength(40)
  /* the old afterAll body, run on `all` */
})
```

Per file:
1. **simulate**: slice the 40 seeds as above (rows are `LifeResult`); the heirs `it` becomes `for (const seed of seedSlice([100,...,105], 'simulate:heirs', slice))` inside the same `it` (an empty loop in merge mode passes). Replace the `afterAll` import by nothing (it is unused afterwards, `noUnusedLocals`).
2. **era-features**: slice `samples` (key `era:childhoods`); rows `{ year, seed, by13, computer, coded }`; the `afterAll` becomes an `it` that rebuilds the per-year maps from `all` and runs the existing assertions unchanged (they compare to `n = 200`). Slice the two whole-life `it`s' seed loops (keys `era:lives1950`, `era:lives1910-1980`). Wrap the cheap describes at lines 158, 284 and 444 in `if (ownedHere('era:rest'))` (one owner slice runs them; they are about 20 short tests).
3. **main-character-life**: replace the first `it` by `it.each(seedSlice(SEEDS, 'mcl:lives', slice))` that plays both lives for the seed and pushes `{ seed, mcs, plain }`; per-seed timeout 300_000; then the aggregate `it` runs the four existing `expect`s on the union. Wrap the careers describe in `if (ownedHere('mcl:careers'))`.
4. **sector-story**: `const mine = seedSlice(['food', 'care', 'util', 'hired'], 'sector:tests', slice)`; register the family `it` only `if (mine.includes(family))` and the hired `it` only `if (mine.includes('hired'))`. No aggregate; with 4 shards each shard gets one test. Add a trivial always-present test only if `mine` can be empty (n larger than 4): `it('has no share in this slice', () => {})` when `mine.length === 0 && slice.mode !== 'full'`.
5. **anachronism**: change `lint(lives, first, last, actions)` to also accept an index list (default every index below `lives`) and call it with `seedSlice(range(LIVES), 'anachronism:lint', slice)` (the year and country of life i still come from i and `lives`, so each life is identical to today). The zero-findings assertion stays per slice (the union is empty exactly when every slice is). The detector and vocabulary describes get `if (ownedHere('anachronism:units'))`. The PRESENT_YEAR test slices its 8 lives (rows are the per-life `hits` count), its per-text `expect(...).toEqual([])` stays per item, and the `hits > 20` assertion moves to an aggregate `it` on the union.

In merge mode all `seedSlice` lists are empty and all `ownedHere` are false, so the five files run only their aggregate `it`s (a few seconds including module load). In full mode (no `SLICE`, the local `npm test`) every assertion runs exactly as today.

**Tests** (`test/shard-kit.test.ts`, write first):
1. `readSlice` table: unset, empty, `merge`, `1/4`, `4/4`, `0/4`, `5/4`, `1/65`, `x`, `1/0` (valid ones parse, the rest throw).
2. `seedSlice` partitions: for lengths 0, 1, 3, 40, 400, 401 and n in 1 to 8 the slices concatenate to the original list, are disjoint, differ in size by at most 1, and keep order; `full` returns everything, `merge` nothing.
3. `ownedHere`: for n = 4 exactly one slice owns each of 20 sample keys; `full` true, `merge` false.
4. `encodeRows`/`decodeRows` round trip including `NaN`, `Infinity`, nested arrays and `null`.
5. Record and merge round trip in a temp `SLICE_DIR`: four parts record, `mergedSlices` returns the union in order; a missing slice, a duplicate and a mismatched `n` each throw a message that names the key and the index; `recordSlice` in `full` and `merge` mode writes nothing.
6. Layout invariant with R1-P1: the set of `test/*.test.ts` files whose text imports `./shard-kit` equals `scripts/test-timings.json` `split`, and `split` is exactly the five files.
7. Text check on the five files: none contains `afterAll(` any more, and each calls `readSlice(` exactly once.

Local verification on the 8 GB machine (one worker): `npx vitest run --maxWorkers=1 test/shard-kit.test.ts test/ci-shard.test.ts`; then for each of the five files run `SLICE=1/4` once and check it passes and writes its slice JSON; run `anachronism` and `sector-story` as `SLICE=1/2`, `2/2`, then `SLICE=merge` to prove the merge path end to end; for `simulate`, `era-features` and `main-character-life` the first full 4-shard CI run is the check of the aggregate path (they are 5 to 8 minutes each unsliced). `npm run typecheck`.

**Flag.** None. **Depends on.** R1-P1 (timings file, workflow, `// ci: fast`).
**Hot-file notes.** Only the five test files and the `split` array; nothing else in the programme edits those five.
**Size.** About 170 lines of kit, about 150 changed lines across the five files, about 190 test lines.

---

### R1-P8 J.1: the advisory depth rubric

**Roadmap items.** J.1 (D.10), decision D25, R12 gate (X.G12) later.

**Files.**
- Create: `test/depth-registry.ts`, `test/depth-rubric.test.ts` (first line `// ci: fast`).

**Interfaces.**

```ts
// test/depth-registry.ts
export type ModuleId = 'business' | 'actor' | 'astronaut' | 'model' | 'musician' | 'author' | 'influencer' | 'politician' | 'sports' | 'gameIndustry' | 'hustler' | 'military'
export type Score = 0 | 1 | 2 | 3
export interface Dimension { n: number; key: DimKey; label: string; bar: string }     // n is 1..17 (digest J's R1..R17); bar is the checkable text for a 3, at most 140 characters
export type DimKey = 'ladder' | 'field' | 'money' | 'assets' | 'team' | 'law' | 'crises' | 'research' | 'reports' | 'fog' | 'exit' | 'automation' | 'history' | 'news' | 'showcase' | 'text' | 'tests'
export const DIMENSIONS: readonly Dimension[]                                           // 17, in this order
export interface DepthMetrics { rungs?: number; rows?: number; rules?: number }        // R1 ladder rungs, R7 event rows, R6 rules; filled by the owning release
export interface DepthEntry {
  id: ModuleId
  label: string
  baseline: number                                  // digest J's total at v4.0.2
  scores: readonly Score[]                          // 17, in DIMENSIONS order; the only field releases change routinely
  metrics: DepthMetrics
  evidence: Partial<Record<DimKey, string>>         // one sentence or a file path, at most 140 characters
  substitute: Partial<Record<DimKey, string>>       // a named substitute where a dimension cannot apply (hustler automation becomes a crew)
}
export const DEPTH: readonly DepthEntry[]           // 12 entries in the ModuleId order above
export const ENFORCE_GATE = false                   // R12 flips this to true
export const GATE = { minEach: 2, minThrees: 14, minTotal: 45, max: 51 } as const
export const BUSINESS_MUST_BE_3: readonly DimKey[]  // research, reports, fog, news, showcase, text
export function total(e: DepthEntry): number
export function threes(e: DepthEntry): number
export function below(e: DepthEntry, min: number): DimKey[]
export function gateStatus(e: DepthEntry): { ok: boolean; failing: string[] }
export function formatDepthTable(entries: readonly DepthEntry[]): string
```

**Behaviour.** The 17 dimensions and their bars are digest J section 3 (R1 Ladder through R17 Tests; the digest's `R1`..`R17` collide with release names, so the code uses `n` and `key`). Seed `scores` from digest J's table (verified by summing its columns during planning: business 43, actor 34, astronaut 31, model 32, musician 36, author 17, influencer 14, politician 34, sports 30, game industry 32, hustler 8, military 18; the checked column sums match the roadmap's list). `baseline` holds those totals. Evidence seeds from digest J: R2 `kit/rivals.ts` 386 lines, R5 `actor-team.ts` 461, R8 `rd.ts` odds from budget only, R12 `board-ceo.ts` 729, R15 `music-tour.ts` 316, business R3 "foresight mint removed in R0-3" (the digest scored business R3 at 3 before the fix; keep 3). `gateStatus` applies D25: no dimension under 2, at least 14 dimensions at 3, total at least 45 of 51; for business also every `BUSINESS_MUST_BE_3` dimension at 3. The test prints `formatDepthTable(DEPTH)` (17 rows by 12 modules, then Total, Threes, Under-2 and Gate rows) with `console.log`, and only malformed entries fail. A score below `baseline` prints a warning line, it does not fail.

**Tests** (`test/depth-rubric.test.ts`; write first):
1. Registry shape (the only failing checks): exactly the 12 ids once each; 17 integer scores in 0 to 3; `baseline` equals the pinned digest totals above (a constant in the test); evidence and substitute strings at most 140 characters, no U+2014 or U+2013; metrics are nonnegative integers when present; `DIMENSIONS` has 17 unique keys and `n` runs 1 to 17.
2. `total`, `threes`, `below` on a synthetic entry.
3. `gateStatus`: a synthetic all-3 entry passes; one dimension at 1 fails naming it; 13 threes fails; total 44 fails; a business-shaped entry with a `BUSINESS_MUST_BE_3` dimension at 2 fails. These keep R12's flip safe.
4. `ENFORCE_GATE` is pinned `false` with a comment "R12 flips this and the real-registry assertion below".
5. Advisory: prints the table; if `ENFORCE_GATE` were true, every real entry would have to pass (the assertion is behind the flag, so today it cannot fail).
6. `formatDepthTable` is deterministic and contains each module label and the total 43 for business.

**Flag.** None. **Depends on.** Nothing hard (rebase on R1-P1 for the marker).
**Hot-file notes.** All new files; R3 to R11 tasks edit one entry's `scores` line each, in their own hunk.
**Size.** About 300 lines of registry and helpers, 220 test lines.

---

### R1-P9 The R1 parity and cost probe: 30 lives, 40 years (added by the cross-check)

**Why this task exists.** The roadmap's balance probe ("R1 changes no simulation output: a 30-life, 40-year run with the same seeds before and after R1 gives identical `JSON.stringify` of everything except the new optional keys"), the R1 exit gate ("the 30-life identical-output probe passes") and the first clause of D.11 criterion 12 ("per-tap cost within 5% of v4.0.2") had no task. R1-C3 provides the stripper (`test/r1-strip.ts`), R1-T5 lists the allowed differences, but nobody builds the harness that plays the lives, compares them and times the per-tap work. `act()` (`ui/store.ts`) does `structuredClone` of the whole state and then `saveGame` (a `JSON.stringify`) on every tap, so those two operations on the final states are the honest per-tap proxy.

**Roadmap items.** D.11 "Balance and exploit probes", R1 exit gate, D.11 criterion 12 (cost), review focus RF5 and RF8.

**Files.**
- Create: `scripts/r1-parity.mjs` (the CLI), `scripts/r1-parity-lib.mjs` and `scripts/r1-parity-lib.d.mts` (pure functions; `.d.mts` because `tsc` checks `test/` and the repo's precedent is `scripts/voice/rules.d.mts`), `test/r1-parity.test.ts`.
- Reads, does not edit: `test/probe-life.ts` (`probeLife`), `test/r1-strip.ts` (R1-C3), `src/game/life.ts` (`createNewLife`), `src/game/aging.ts` (`ageUp`), `src/game/flags.ts` (`setFlags`, `FLAG_DEFS`), `scripts/save-size.ts` (the esbuild bundle-and-run pattern to copy).
- Nothing in `src/` changes. `package.json` is untouched: `esbuild` is the explicit devDependency from lead action 1.

**Interfaces.**

```ts
// scripts/r1-parity-lib.d.mts
export interface LifeSpec { seed: number; kind: 'birth' | 'founder'; birthYear: number; businesses: number; years: number }
/** 30 specs by default: seeds 1..lives; odd seeds are 'birth' lives (createNewLife, played from age 0), even seeds 'founder' lives (probeLife with 1 to 3 companies). Birth years cycle 1925, 1950, 1975, 1990, 2010. */
export function lifeSpecs(lives?: number, years?: number): LifeSpec[]          // defaults 30 and 40
/** The JSON pointer of the first difference ('/flags/lifeSeries/rows/3'), or null. Key order is ignored, NaN equals NaN, arrays compare by index and length. */
export function firstDiff(a: unknown, b: unknown): { path: string; a: unknown; b: unknown } | null
/** Every array, object and primitive counts one, as the save loader counts nodes. */
export function countNodes(v: unknown): number
export function median(xs: readonly number[]): number
export function costRatio(base: readonly number[], r1: readonly number[]): { perLife: number[]; mean: number }
export function formatCostTable(rows: readonly { seed: number; baseMs: number; r1Ms: number; baseNodes: number; r1Nodes: number }[]): string   // markdown
```

CLI (`node scripts/r1-parity.mjs <command> ...`; Node builtins plus esbuild; exit 0 ok, 1 a difference or a cost over the limit, 2 bad usage):

```
play    --repo <dir> --out <dir> [--lives 30] [--years 40] [--flags none|all]
compare --base <dir> --r1 <dir> [--repo-r1 <dir>]
cost    --base <dir> --r1 <dir> [--reps 15]
```

**Behaviour.**
1. `play` bundles, with esbuild (`stdin` that imports absolute paths under `--repo`: `test/probe-life`, `src/game/life`, `src/game/aging`, and `src/game/flags` when that file exists), a small driver for `platform: 'node'`, writes the bundle to a temp `.mjs` and runs it. So the same CLI, run from the R1 tree, plays either tree: the baseline (a git worktree of `release/v4.0.3`, the R0 head; see Plan vs code 18) and the R1 head. For each `LifeSpec`: a `'birth'` life is `createNewLife({ seed, year: birthYear })` followed by `years` times `g.queue = []; ageUp(g)` (stop when dead); a `'founder'` life is `probeLife({ seed, birthYear, businesses, years, keepAlive: false })`. Birth lives matter: they run childhood, school and the early-life events, where the flavor ring (R1-T2) and the text code act; founder lives alone would miss them. The queue is cleared each year (as `probeLife` does), so no choice driver is needed and nothing depends on R1 code. `--flags all` (R1 tree only) first calls `setFlags` with every `FLAG_DEFS` key true, so the builders behind flags (`reportData` charts, Books group, cockpit rows) run too. Output: `<out>/life-<seed>-<kind>.json.gz` (gzip of `JSON.stringify(g)`) and `<out>/index.json` (`seed, kind, age, alive, bytes, nodes, ms` per life).
2. `compare` reads both folders. For each life: parse the baseline JSON `A`; parse the R1 JSON and pass it through `stripR1` (bundled from `<repo-r1>/test/r1-strip.ts`, default `.`) to get `B`; `firstDiff(A, B)`. Print one line per life (`ok` or the path and both values, cut to 120 characters). Print also, per run, how many keys the stripper removed, by name, so the lead sees the new optional keys (`cash`, `lifeSeries`, `textMem`, `weight`, ...). Exit 1 on any difference. Three runs must compare equal to the baseline run: R1 with `--flags none`, R1 with `--flags all`, and R1 again (determinism).
3. `cost` reads both folders. For each life, after 3 warm-up rounds, times `reps` rounds of `structuredClone(g)` and of `JSON.stringify(g)` on the parsed final state, takes the median of the sum in milliseconds, counts nodes, and prints `formatCostTable`. Exit 1 when `costRatio(...).mean` is above 1.05, and prints "advisory: D.11 criterion 12 is a decision for the lead; state growth of 3 to 5% is the roadmap's own estimate". The ratio is of final states of the same seeds, so it also shows how much the optional keys cost.
4. Runtime: 30 lives by 40 years is about 4 to 6 minutes a tree, so this is a script for the lead (lead action 6), not a test; the test below uses 2 lives by 3 years.

**Tests** (`test/r1-parity.test.ts`, first line not `// ci: fast`, under 40 s; write first):
1. `lifeSpecs()` returns 30 specs, 15 'birth' and 15 'founder', seeds 1 to 30 unique, `years` 40, `businesses` 1 to 3 on founders and 0 on birth lives; `lifeSpecs(4, 3)` returns 4 specs of 3 years.
2. `firstDiff`: equal objects with different key order give null; arrays differing at index 1 give `/a/1`; an extra key on one side is reported with the pointer; `NaN` equals `NaN`; different array lengths are reported; a difference deep in nested objects gives the full pointer.
3. `countNodes({ a: [1, 2], b: { c: null } })` is 6 (the root, `a`, `1`, `2`, `b`, `c`) and agrees with `jsonNodes` from `test/charts-kit.ts` (R1-C1) on that object and on a nested array of objects.
4. `median`, `costRatio` and `formatCostTable` on fixed numbers (including an even-length list and a zero baseline, which must not divide by zero).
5. CLI smoke through `spawnSync(process.execPath, ['scripts/r1-parity.mjs', ...])` with `--repo .`: `play --out <tmp>/a --lives 2 --years 3` then `play --out <tmp>/b` with the same arguments, then `compare --base <tmp>/a --r1 <tmp>/b` exits 0 (determinism and `stripR1` identity on the R1 tree); then flip one number in a gzip of `<tmp>/b` and `compare` exits 1 and the output contains the JSON pointer; `cost` on the same folders exits 0 with a ratio near 1.
6. `play --flags all` against `--flags none` on the R1 tree (2 lives by 3 years): `compare` exits 0 (flags change presentation only).
7. Usage errors exit 2 (unknown command, missing `--repo`).

**Flag.** None. **Depends on.** R1-C3 (`test/r1-strip.ts`), R1-P1 (shard listing sees the new test), lead action 1 (esbuild), R0 merged. **Hot-file notes.** All new files.
**Size.** About 340 lines (CLI 220, library 120), about 170 test lines.

---

## 4. Plan vs code (where the roadmap and the code differ, and what I did)

1. **`CLAUDE.md` does not exist in the repo** (`git ls-files` has no such file; the roadmap's "Models (`CLAUDE.md`)" line and the run prompt's "read CLAUDE.md" cannot be followed). The rules the tasks need are restated here (test first, explicit pathspecs, voice caps, no dashes, one commit per task).
2. **Vitest already has `--shard`** (count-balanced, sha1 of path). The roadmap does not mention it. The custom time-balanced script is still right (the five slow files are 45% of the time, the top ten 58%), and a sequencer is needed because without a cache vitest runs files in discovery order.
3. **The five slow files are not all splittable "by seed range".** `main-character-life` runs 28 lives in one `it` with aggregate assertions; `sector-story` pools seeds inside each of four tests; `era-features` and `simulate` assert aggregates in `afterAll`; `anachronism` has a per-life lint plus one aggregate. R1-P7 therefore adds a record-and-merge step (`SLICE=merge` in the gate's aggregate job) so no assertion is weakened.
4. **"All 389 test files"**: 389 `*.test.ts` files exist (confirmed; 22 more `.ts` files in `test/` are helper kits and are not tests). R1 adds files, so the coverage test uses the live listing with a floor of 389, not the number.
5. **CI trigger gap.** `ci.yml` runs on `pull_request` and pushes to `main` only, so pushing `release/v4.1.0` early (the run prompt says to) starts nothing. R1-P1 adds `release/**` pushes and `workflow_dispatch`. Track branches get previews (R1-P3), not CI; a track opens a draft PR for CI.
6. **Required check name.** The old job is `test`; the new required check is `gate` ("CI gate"). The workflow name `CI` is kept because `release.yml` has `workflow_run: ['CI']`.
7. **K.1 numbers.** The esbuild graph at v4.0.2 has 627 modules and 5,213 import records (5,116 distinct edges), not "4,488 edges", but the cycle result is exactly the roadmap's: components 85, 30, 19, 7, 6 = 147 modules, built in about 250 ms (the roadmap says about 1 s). `package-lock.json` has esbuild 0.28.2 as a transitive dev package (wrangler pins `0.28.2`, vite allows `^0.27.0 || ^0.28.0`), and the root has no esbuild entry; adding the devDependency must update the lockfile root too or `npm ci` fails.
8. **K.1 "baseline module that left the cycle" is not enough.** Two components fusing adds no new module (the v4.0.0 failure was a 60-module cycle growing to 177). R1-P4 also fails on a component that is not a subset of one baseline component.
9. **X.G1 foresight rule `+ 1` in the call arguments misses an alias** that exists today (`computer/money-stocks.ts` `settlePrice`, `const year = bet.year + 1`). Added a bounded alias rule, an importer fence for `invest/instinct` (four importers today, one gated by `hasTalent` at `instinct.ts:177`) and a runtime spy as design 14.1 asks. `investments.ts:2139` is the only direct hit outside `instinct.ts`; R0-2 removes it.
10. **X.G1 money ratchet patterns.** The roadmap's `b.cash +=` and `p.money +=` are widened to any receiver (counts 51 and 31 against 44 and 22 at v4.0.2). The roadmap's "5 `earnIncome(` lines in `author-career.ts`" is 4 `earnIncome(` plus 1 `spend(` in the code; the baseline records them separately.
11. **"Ceiling list"** is cited by R0-14's guard line ("R1 X.G1's ceiling list names every growth term with a cap") but D.10 does not define it. R1-P5 adds the minimal token list.
12. **A.K0 "about 190 keys"** is only the literal-access count (190 distinct). Resolving string constants adds 32 more (222 exact keys), template sites add 10 prefixes, and 36 `flags[expr]` sites plus 22 whole-object uses (7 of them aliases) cannot be resolved and are ratcheted by count. Scope is all of `src`, not `src/game` (two keys are read from `src/ui`).
13. **`MenuInfo` is a separate interface**; it does not extend `MenuBase`, so `conf` and `chart` are added to it by hand. `MenuHeading` gets nothing. `types.ts` has no imports today; the `ChartSpec` import is `import type`, so the file stays a runtime leaf.
14. **Preview deploys need a Cloudflare token that the repo may not have.** `deploy.yml` skips cleanly without `CLOUDFLARE_API_TOKEN`. R1-P3 ships a guarded `preview.yml` (works the moment a token exists) and documents Workers Builds branch previews as the no-secret route; neither is provable from code.
15. **JSON reporter times exclude module import** (`JsonReporter` computes start and end from test results), so planning adds a 1.5 s per-file overhead; the roadmap's 3,869 worker-seconds likely include import.
16. **Charts-track FYI (not mine):** `recordYear` is defined at `src/game/business/state.ts:997`; the `slice(-10)` that caps history is `business/economy.ts:1009` (the roadmap cites `economy.ts:996` for the function). The normaliser `slice(-12)` is at `state.ts:683` and `readRecord` at `state.ts:581` as stated.
17. **R0 is in flight** (local branches `claude/r0-money`, `claude/r0-world`, `claude/r0-verify`, `release/v4.0.3`; R0-1, R0-2 and R0-15 commits exist). R1-P5 and R1-P6 baselines must be generated after R0 merges.
18. **The parity baseline is the R0 head, not v4.0.2** (cross-check). R0 changes balance (R0-3 removes the minted CEO income), so "a 30-life, 40-year run before and after R1" compares `release/v4.0.3` with `release/v4.1.0`. R1-P9 therefore asks for a worktree of the R0 head as `--repo` for the baseline run.
19. **No task built the roadmap's identical-output probe or measured the per-tap cost** (cross-check). `scripts/save-size.ts` and `test/probe-life.ts` already give the bundle-and-run pattern and a seeded long life; R1-P9 reuses them. `act()` in `ui/store.ts` clones and saves the whole state per tap, which is what the `cost` mode times.

## 5. Assumptions and open points

- Quiet Mode's Settings default (on) and the `quietInbox` flag are separate: the flag gates whether the routing code, the Settings section and the bell exist in the build; `Settings.quietMode` defaults to on from the day R1-T5 merges (G.11 owns that).
- All eight R1 flags are presentation-only. If a track needs an engine-affecting flag it must say so; the rule in the flags header (stamp it in the save) applies.
- If the lead prefers fewer flags, merge `annualReport2` into `chartKit` and `navPalette` into `navRegroup` by editing the `FLAG_DEFS` list once in R1-P3 (and the consumers' tests, which name the keys); the tests derive the count from the file except test 1, which pins eight.
- Tests that ship with this track stay under two minutes each on one worker except the five sliced files, which are verified in sliced form (see R1-P7).
- `docs/CI.md` and `docs/PREVIEWS.md` are the only docs this track adds; the release notes are the lead's.

---

## Changed by cross-check

Applied from `00-crosscheck.md` (decisions D2, D3, D9, D10, D14; collisions table):

1. **Flag set (D2).** `FLAG_DEFS` is now `chartKit`, `annualReport2`, `navRegroup`, `navPalette`, `cockpits`, `noticeDigest`, `quietInbox`, `idbSaves` (was `navHubs`, `searchPalette`, `quietMode`, `textMemory` in place of the middle five). Test 1 pins the list, `parseFlagList` examples use the new names, and a new guard (test 7b) fails when a test mocks the flags module or assigns to `FLAGS`. The cross-check rules for the other tracks are written into the task. Only the lead's release commit flips defaults.
2. **R1-P2 owns every new optional field in `types.ts`** (D3): adds `NoticeModal.link`, `MenuBase.spark`, `AnnualReportData.chart` and `NoticeOptions.link` with the spread, besides the fields it already had. Four hunks in `types.ts`. `keywords` is `readonly string[]`.
3. **R1-P5:** the foresight spy test is split into two `it`s (six no-talent lives at depth 3, two talent lives at depth 4) with a measured-time rule. **R1-P6:** the heir-survival test for personal and cache keys is batched into one handoff (about 220 games down to one) with a bisect fallback.
4. **Schedule (D10):** R1-P7 and R1-P8 leave wave 0 (wave 0 is P1 to P6 with the a11y and text wave-0 tasks).
5. **New R1-P9** (D9): the parity and cost probe. Lead actions 3, 5 and 6 updated (timings refresh after wave 3; no other task flips a flag; run P9 before the release PR is ready).
6. **Hot-file table:** `ci.yml` gains R1-A9's single step; `core.ts` is P2 then R1-T5; `package.json` gains A9's `size` script line.
