// ci: fast
// R2-P6 (K.7b f): the nightly deep tier's workflow, checked as text (the way ci-shard.test.ts checks ci.yml). The workflow cannot
// run here, so what this file pins is everything that can be wrong without running it: the triggers (a scheduled run happens on
// the default branch only, so a pull request that touches the workflow or its scripts runs it at smoke size), the six jobs and
// their time limits, that no step runs the whole suite, that every action is one the repo already uses, and the contract between
// the YAML and the code it calls: every $NAME a run line reads is printed by `scripts/nightly.mjs sizes` (or set in the file),
// every file it names exists, and every shard count equals the matrix it runs in and the count in nightlySizes.
// The proof that it runs is the pull request itself (docs/CI.md, "The nightly deep tier").
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nightlySizes, type NightlySizes } from '../scripts/nightly-lib.mjs'
import { ROOT } from './scan-kit'

const yml = readFileSync(join(ROOT, '.github', 'workflows', 'nightly.yml'), 'utf8')
const lines = yml.split('\n')
const docs = readFileSync(join(ROOT, 'docs', 'CI.md'), 'utf8')

const JOBS = ['fuzz', 'balance', 'deep', 'anachronism', 'anachronism-merge', 'metrics'] as const
type Job = (typeof JOBS)[number]

/** A job's block of text: from its `  name:` line to the next job (or the end of the file). */
function jobBlocks(): Record<string, string> {
  const start = yml.indexOf('\njobs:\n')
  expect(start, 'a jobs: section').toBeGreaterThan(-1)
  const text = yml.slice(start + 1)
  const heads = [...text.matchAll(/^ {2}([a-z][a-z-]*):[ \t]*$/gm)]
  const out: Record<string, string> = {}
  heads.forEach((m, k) => {
    out[m[1]] = text.slice(m.index, k + 1 < heads.length ? heads[k + 1].index : text.length)
  })
  return out
}
const blocks = jobBlocks()

/** The steps of a job: each `      - ` item up to the next. */
function stepsOf(job: string): string[] {
  const text = blocks[job]
  const first = text.indexOf('\n    steps:\n')
  expect(first, `${job} has steps`).toBeGreaterThan(-1)
  return text
    .slice(first + '\n    steps:\n'.length)
    .split(/\n(?= {6}- )/)
    .map((s) => s.replace(/\n+$/, ''))
}

/** A workflow expression of the few shapes the file uses (names, quoted strings, ==, && and ||), worked out with a small context. */
function evaluate(expr: string, ctx: { event: string; scale?: string }): string {
  if (!/^[\w.' =&|]+$/.test(expr)) throw new Error(`not an expression this test understands: ${expr}`)
  const github = { event_name: ctx.event }
  const inputs = { scale: ctx.scale ?? '' }
  return String(new Function('github', 'inputs', `return (${expr})`)(github, inputs))
}

/** What `node scripts/nightly.mjs sizes <scale> --shard 1/8` prints, as names. */
function printedNames(scale: 'full' | 'smoke'): string[] {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'nightly.mjs'), 'sizes', scale, '--shard', '1/8'], { encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  return r.stdout
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => l.slice(0, l.indexOf('=')))
}

describe('the nightly workflow: triggers', () => {
  it('is named Nightly and has a schedule, a manual run and a pull request run on its own files', () => {
    expect(lines[0]).toBe('name: Nightly')
    expect(yml).toMatch(/^on:\n {2}schedule:\n {4}- cron: '(\S+ \S+ \S+ \S+ \S+)'$/m)
    expect(yml).toMatch(/^ {2}workflow_dispatch:$/m)
    expect(yml).toMatch(/^ {2}pull_request:$/m)
    const paths = /^ {2}pull_request:\n {4}paths: \[([^\]]*)\]$/m.exec(yml)?.[1]
    expect(paths, 'a paths list under pull_request').toBeDefined()
    expect((paths ?? '').split(',').map((p) => p.trim().replace(/^'|'$/g, ''))).toEqual(['.github/workflows/nightly.yml', 'scripts/nightly*', 'test/nightly-*'])
  })

  it('offers the scale on a manual run as full or smoke, full by default', () => {
    expect(yml).toMatch(/^ {6}scale:\n {8}description: .+\n {8}type: choice\n {8}options: \[full, smoke\]\n {8}default: full$/m)
  })

  it('runs a pull request at smoke size, a schedule in full and a manual run as asked', () => {
    const expr = /^ {2}NIGHTLY_SCALE: \$\{\{ (.+) \}\}$/m.exec(yml)?.[1]
    expect(expr, 'NIGHTLY_SCALE at the top level').toBeDefined()
    expect(evaluate(expr ?? '', { event: 'pull_request' })).toBe('smoke')
    expect(evaluate(expr ?? '', { event: 'pull_request', scale: 'full' })).toBe('smoke')
    expect(evaluate(expr ?? '', { event: 'schedule' })).toBe('full')
    expect(evaluate(expr ?? '', { event: 'workflow_dispatch', scale: 'smoke' })).toBe('smoke')
    expect(evaluate(expr ?? '', { event: 'workflow_dispatch', scale: 'full' })).toBe('full')
  })

  it('keeps a pull request, a schedule and a manual run in separate groups, and cancels only a pull request run', () => {
    const expr = /^ {2}group: (.+)$/m.exec(yml)?.[1] ?? ''
    const groupFor = (ctx: Record<string, string>): string =>
      expr.replace(/\$\{\{([^}]+)\}\}/g, (_all, e: string) => e.split('||').map((name) => ctx[name.trim()] ?? '').find((v) => v !== '') ?? '')
    const pr = groupFor({ 'github.event_name': 'pull_request', 'github.event.pull_request.number': '7', 'github.ref_name': '7/merge' })
    const pr2 = groupFor({ 'github.event_name': 'pull_request', 'github.event.pull_request.number': '8', 'github.ref_name': '8/merge' })
    const sched = groupFor({ 'github.event_name': 'schedule', 'github.ref_name': 'main' })
    const manual = groupFor({ 'github.event_name': 'workflow_dispatch', 'github.ref_name': 'main' })
    expect(new Set([pr, pr2, sched, manual]).size).toBe(4)
    expect(yml).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
  })

  it('reads the repository and the run list, and nothing more', () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read$/m)
  })
})

describe('the nightly workflow: jobs', () => {
  it('has the six jobs, in order', () => {
    expect(Object.keys(blocks)).toEqual([...JOBS])
  })

  it('gives every job a time limit: fuzz 120, balance 45, deep 45, anachronism 60, merge 20, metrics 15', () => {
    const limits: Record<Job, number> = { fuzz: 120, balance: 45, deep: 45, anachronism: 60, 'anachronism-merge': 20, metrics: 15 }
    for (const job of JOBS) expect(Number(/^ {4}timeout-minutes: (\d+)$/m.exec(blocks[job])?.[1]), job).toBe(limits[job])
  })

  it('runs every job on ubuntu-latest, and the shard jobs do not stop each other', () => {
    for (const job of JOBS) expect(blocks[job], job).toMatch(/^ {4}runs-on: ubuntu-latest$/m)
    for (const job of ['fuzz', 'balance', 'deep', 'anachronism'] as const) expect(blocks[job], job).toMatch(/^ {6}fail-fast: false$/m)
  })

  it('has a metrics job that always runs and needs every other job', () => {
    expect(blocks.metrics).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m)
    expect(blocks.metrics).toMatch(/^ {4}needs: \[fuzz, balance, deep, anachronism, anachronism-merge\]$/m)
    for (const job of ['fuzz', 'balance', 'deep', 'anachronism'] as const) expect(blocks[job], job).not.toMatch(/^ {4}needs:/m)
    expect(blocks['anachronism-merge']).toMatch(/^ {4}needs: anachronism$/m)
  })

  it('hands the outcome of each job to the merge, so a failed job is listed', () => {
    for (const job of JOBS.filter((j) => j !== 'metrics')) expect(blocks.metrics, job).toContain(`--result ${job}=\${{ needs.${job}.result }}`)
  })

  it('runs no whole-suite step: no npm test, and every vitest run names its files', () => {
    expect(lines.some((line) => /\bnpm (run )?test\b/.test(line))).toBe(false)
    const runs = lines.filter((line) => /vitest run/.test(line))
    expect(runs.length).toBeGreaterThan(0)
    for (const line of runs) expect(line, line).toMatch(/test\/[\w-]+\.test\.ts|\$\{\{ matrix\.files \}\}/)
  })

  it('uses only the actions ci.yml uses, at its versions', () => {
    const allowed = ['actions/checkout@v5', 'actions/setup-node@v5', 'actions/upload-artifact@v4', 'actions/download-artifact@v4']
    const used = [...yml.matchAll(/^\s*- uses: (\S+)\s*$/gm)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const u of used) expect(allowed, u).toContain(u)
    expect(lines.filter((l) => /\buses:/.test(l)).length).toBe(used.length)
    expect(yml.match(/node-version: (\S+)/g)?.every((x) => x === 'node-version: 22')).toBe(true)
  })

  it('starts each job with the checkout and the node setup, and asks nightly.mjs for its sizes', () => {
    for (const job of JOBS) {
      const steps = stepsOf(job)
      expect(steps[0], job).toContain('actions/checkout@v5')
      expect(steps[1], job).toContain('actions/setup-node@v5')
      if (job === 'metrics') continue
      expect(steps.some((s) => s.includes('npm ci')), job).toBe(true)
      expect(steps.some((s) => /node scripts\/nightly\.mjs sizes "\$NIGHTLY_SCALE"( --shard \$\{\{ matrix\.\w+ \}\}\/\d+)? >> "\$GITHUB_ENV"/.test(s)), job).toBe(true)
    }
  })

  it('sets shell: bash on every step that pipes through tee, so a failing command fails the step', () => {
    for (const job of JOBS) {
      for (const step of stepsOf(job)) {
        if (/\| tee\b/.test(step)) expect(step, `${job}: ${step.split('\n')[0]}`).toMatch(/^ {8}shell: bash$/m)
      }
    }
  })
})

describe('the nightly workflow: shards and sizes', () => {
  const full = nightlySizes('full')

  /** The matrix of a job, as the numbers in `shard: [1, 2, ...]` (or `slice:`), and the counts its run lines divide by. */
  function shardsOf(job: string): { key: string | null; list: number[]; counts: number[] } {
    const m = /^ {8}(shard|slice): \[([^\]]*)\]$/m.exec(blocks[job])
    const key = m?.[1] ?? null
    const list = m ? m[2].split(',').map((x) => Number(x.trim())) : []
    // Every `--shard X` is the matrix variable, with the count after it for sizes (`i/n`) and bare for fuzz-metrics; any other
    // spelling is a count that cannot be checked, which is a mistake.
    const counts: number[] = []
    for (const x of blocks[job].matchAll(/--shard (\$\{\{ [^}]+\}\}\S*|\S+)/g)) {
      const m = /^\$\{\{ matrix\.(?:shard|slice) \}\}(?:\/(\d+))?$/.exec(x[1])
      expect(m, `${job}: --shard ${x[1]}`).not.toBeNull()
      if (m?.[1] !== undefined) counts.push(Number(m[1]))
    }
    for (const x of blocks[job].matchAll(/^ {6}SLICE: \$\{\{ matrix\.slice \}\}\/(\d+)$/gm)) counts.push(Number(x[1]))
    return { key, list, counts }
  }

  it('has a matrix of 1 to n, and every shard count in a run line is n', () => {
    for (const job of ['fuzz', 'balance', 'anachronism'] as const) {
      const { key, list, counts } = shardsOf(job)
      expect(key, job).not.toBeNull()
      expect(list, job).toEqual(list.map((_, i) => i + 1))
      expect(counts.length, `${job}: the shard counts in its lines`).toBeGreaterThan(0)
      for (const c of counts) expect(c, job).toBe(list.length)
    }
  })

  it('has as many shards as nightlySizes says, at full size', () => {
    expect(shardsOf('fuzz').list.length).toBe(full.fuzz.shards)
    expect(shardsOf('balance').list.length).toBe(full.balance.shards)
    expect(shardsOf('anachronism').list.length).toBe(full.anachronism.slices)
  })

  it('has as many shards as nightlySizes says, at smoke size (the shape does not change)', () => {
    const smoke = nightlySizes('smoke')
    expect(smoke.fuzz.shards).toBe(full.fuzz.shards)
    expect(smoke.balance.shards).toBe(full.balance.shards)
    expect(smoke.anachronism.slices).toBe(full.anachronism.slices)
  })

  it('reads only variables that nightly.mjs sizes prints or the file sets (the runner has its own)', () => {
    const printed = printedNames('full')
    expect(printedNames('smoke')).toEqual(printed)
    const defined = new Set<string>([...printed, ...[...yml.matchAll(/^\s*([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1])])
    const reads = new Set<string>()
    for (const line of lines) {
      if (/^\s*#/.test(line)) continue
      // `${{ ... }}` is the workflow's own expression language, not the shell's.
      const shell = line.replace(/\$\{\{.*?\}\}/g, '')
      for (const m of shell.matchAll(/\$\{?([A-Z][A-Z0-9_]*)\}?/g)) reads.add(m[1])
    }
    const runner = (name: string): boolean => /^(GITHUB|RUNNER)_/.test(name) || name === 'CI'
    expect([...reads].filter((n) => !defined.has(n) && !runner(n)).sort()).toEqual([])
    // The contract is not one way: the sizes the jobs read at least include these.
    for (const name of ['FUZZ_START', 'FUZZ_SEEDS', 'FUZZ_YEARS', 'FUZZ_BUDGET', 'BALANCE_START', 'BALANCE_COUNT', 'BALANCE_YEARS', 'CEILING_START', 'CEILING_COUNT', 'CEILING_YEARS', 'CEILING_SCALE', 'ANACHRONISM_LIVES', 'OLD_SAVES_YEARS', 'OLD_SAVES_RESEEDS']) {
      expect(reads.has(name), `${name} is read by a run line`).toBe(true)
      expect(printed, name).toContain(name)
    }
  })

  it('names files that exist: every files: value and every test file in the text', () => {
    const matrixFiles = [...yml.matchAll(/^\s+files: (.+)$/gm)].flatMap((m) => m[1].trim().split(/\s+/))
    expect(matrixFiles.length).toBeGreaterThan(0)
    const named = [...yml.matchAll(/\b(?:test|scripts)\/[\w./*-]+\.(?:test\.ts|ts|mjs)\b/g)].map((m) => m[0])
    for (const f of new Set([...matrixFiles, ...named])) expect(existsSync(join(ROOT, f)), f).toBe(true)
  })

  it('mentions the switches the tests read: FUZZ_YEARS, GOLDEN_DEEP=1, CEILING_PROBE=deep, SLICE: merge, ANACHRONISM_LIVES', () => {
    for (const text of ['FUZZ_YEARS', 'GOLDEN_DEEP=1', 'CEILING_PROBE=deep', 'SLICE: merge', 'ANACHRONISM_LIVES']) expect(yml, text).toContain(text)
  })

  it('hands each test file a switch it reads', () => {
    const read = (file: string, name: string): boolean => readFileSync(join(ROOT, file), 'utf8').includes(name)
    expect(read('test/ceiling-probe.test.ts', 'CEILING_PROBE')).toBe(true)
    expect(read('test/old-saves.test.ts', 'OLD_SAVES_YEARS') && read('test/old-saves.test.ts', 'OLD_SAVES_RESEEDS')).toBe(true)
    expect(read('test/golden-digest.test.ts', 'GOLDEN_DEEP')).toBe(true)
    // (The slice switches SLICE and SLICE_DIR belong to test/shard-kit.ts, which ci-shard.mjs --verify keeps for the split files.)
    expect(read('test/anachronism.test.ts', 'ANACHRONISM_LIVES')).toBe(true)
    expect(read('test/anachronism.test.ts', 'anachronism.findings.sum')).toBe(true)
    expect(read('test/nightly-metrics.ts', 'NIGHTLY_METRICS_DIR')).toBe(true)
    expect(yml).toMatch(/matrix\.files \}\}/)
    for (const file of ['test/ceiling-probe.test.ts', 'test/old-saves.test.ts', 'test/golden-digest.test.ts', 'test/text-repeat.test.ts', 'test/text-kit.test.ts']) expect(yml, file).toContain(file)
  })

  it('has the deep matrix rows: ceilings, old-saves, text and golden', () => {
    // A row may have no env: the text row has none, because the repeat probe plays its fixed 13 lives and reads no size.
    const rows = [...blocks.deep.matchAll(/^ {10}- name: (\S+)\n {12}files: (.+)(?:\n {12}env: (.+))?$/gm)].map((m) => [m[1], m[2], m[3] ?? ''])
    expect(rows).toEqual([
      ['ceilings', 'test/ceiling-probe.test.ts', 'CEILING_PROBE=deep'],
      ['old-saves', 'test/old-saves.test.ts', 'OLD_SAVES_YEARS=$OLD_SAVES_YEARS OLD_SAVES_RESEEDS=$OLD_SAVES_RESEEDS'],
      ['text', 'test/text-repeat.test.ts test/text-kit.test.ts', ''],
      ['golden', 'test/golden-digest.test.ts', 'GOLDEN_DEEP=1'],
    ])
    // No variable is exported that no test file reads.
    expect(blocks.deep).not.toContain('TEXT_PROBE_LIVES')
    expect(blocks.deep).toContain('env ${{ matrix.env }} NIGHTLY_METRICS_DIR=metrics npx vitest run --maxWorkers=1 ${{ matrix.files }}')
  })
})

describe('the nightly workflow: the fuzzer, the probes and the previous night', () => {
  it('bundles the fuzzer and plays it with the sizes of its shard, under bash so a failure fails the step', () => {
    const fuzz = blocks.fuzz
    expect(fuzz).toContain('scripts/fuzz-engine.ts --bundle --platform=node --format=esm')
    const play = stepsOf('fuzz').find((s) => s.includes('fuzz-engine.mjs --'))
    expect(play, 'the step that plays the lives').toBeDefined()
    for (const flag of ['--start "$FUZZ_START"', '--seeds "$FUZZ_SEEDS"', '--years "$FUZZ_YEARS"', '--budget "$FUZZ_BUDGET"', '--fork', '--quiet', '--json']) expect(play, flag).toContain(flag)
    expect(play).toMatch(/^ {8}shell: bash$/m)
    expect(play).toContain('| tee ')
  })

  it('turns the fuzz log into metrics even when the fuzzer failed, and keeps the log and the list', () => {
    const steps = stepsOf('fuzz')
    const metrics = steps.find((s) => s.includes('nightly.mjs fuzz-metrics'))
    expect(metrics, 'a fuzz-metrics step').toBeDefined()
    expect(metrics).toContain('if: ${{ always() }}')
    expect(metrics).toContain('--out metrics/fuzz-${{ matrix.shard }}.json')
    expect(blocks.fuzz).toContain('name: metrics-fuzz-${{ matrix.shard }}')
    expect(blocks.fuzz).toContain('name: fuzz-${{ matrix.shard }}')
  })

  it('plays the balance probe, then the ceiling probe, with the shard number in the file', () => {
    const b = blocks.balance
    expect(b).toContain('scripts/nightly-probes.ts --bundle --platform=node --format=esm')
    expect(b).toMatch(/^ {4}env:\n {6}NIGHTLY_SHARD: \$\{\{ matrix\.shard \}\}$/m)
    expect(b).toContain('nightly-probes.mjs balance --start "$BALANCE_START" --count "$BALANCE_COUNT" --years "$BALANCE_YEARS" --out metrics/balance-${{ matrix.shard }}.json')
    expect(b).toContain('nightly-probes.mjs ceiling --start "$CEILING_START" --count "$CEILING_COUNT" --years "$CEILING_YEARS" --scale "$CEILING_SCALE" --out metrics/ceiling-${{ matrix.shard }}.json')
    expect(b.indexOf('probes.mjs balance')).toBeLessThan(b.indexOf('probes.mjs ceiling'))
    expect(b).toContain('name: metrics-balance-${{ matrix.shard }}')
  })

  it('slices the anachronism lint eight ways and merges the slices in a job of its own', () => {
    expect(blocks.anachronism).toMatch(/^ {4}env:\n {6}SLICE: \$\{\{ matrix\.slice \}\}\/8\n {6}SLICE_DIR: test-slices$/m)
    expect(blocks.anachronism).toContain('npx vitest run --maxWorkers=1 test/anachronism.test.ts')
    expect(blocks.anachronism).toContain('name: slices-${{ matrix.slice }}')
    expect(blocks.anachronism).toContain('path: test-slices')
    // Each slice writes its findings and lives as metrics (the hard rule anachronism.findings.sum reads the pooled sum), even when it fails.
    expect(blocks.anachronism).toContain('NIGHTLY_METRICS_DIR: metrics')
    expect(blocks.anachronism).toContain('NIGHTLY_SHARD: ${{ matrix.slice }}')
    expect(blocks.anachronism).toContain('name: metrics-anachronism-${{ matrix.slice }}')
    const upload = stepsOf('anachronism').find((s) => s.includes('name: metrics-anachronism-'))
    expect(upload, 'the step that uploads the slice metrics').toContain('if: ${{ always() }}')
    const merge = blocks['anachronism-merge']
    expect(merge).toMatch(/^ {4}env:\n {6}SLICE: merge\n {6}SLICE_DIR: test-slices$/m)
    expect(merge).toContain('pattern: slices-*')
    expect(merge).toContain('merge-multiple: true')
    expect(merge).toContain('path: test-slices')
    expect(merge).toContain('npx vitest run --maxWorkers=1 test/anachronism.test.ts')
    // The merge reads the same lives as the slices did.
    expect(merge).toMatch(/node scripts\/nightly\.mjs sizes "\$NIGHTLY_SCALE" >> "\$GITHUB_ENV"/)
  })

  it('keeps every artifact for a stated time, and the one the next night reads for 30 days', () => {
    for (const job of JOBS) {
      for (const step of stepsOf(job)) {
        if (!step.includes('upload-artifact')) continue
        expect(step, `${job}: ${step.split('\n')[0]}`).toMatch(/^ {10}retention-days: (14|30)$/m)
        expect(step).toMatch(/^ {10}overwrite: true$/m)
      }
    }
    const keep = stepsOf('metrics').find((s) => s.includes('name: nightly-metrics'))
    expect(keep, 'the upload of the merged file').toBeDefined()
    expect(keep).toContain('path: metrics/all.json')
    expect(keep).toMatch(/^ {10}retention-days: 30$/m)
  })

  it('finds the last good scheduled night and reads its merged file, without failing the run when there is none', () => {
    const steps = stepsOf('metrics')
    const fetch = steps.find((s) => s.includes('gh run list'))
    expect(fetch, 'a step that finds the previous night').toBeDefined()
    expect(fetch).toMatch(/^ {8}continue-on-error: true$/m)
    expect(fetch).toContain("gh run list --workflow nightly.yml --event schedule --status success --limit 1 --json databaseId --jq '.[0].databaseId'")
    expect(fetch).toContain('gh run download "$prev" -n nightly-metrics -D previous')
    expect(fetch).toContain('GH_TOKEN: ${{ github.token }}')
    // A smoke night is not comparable with a full one: only a full run looks for a previous night.
    expect(fetch).toContain("if: ${{ env.NIGHTLY_SCALE == 'full' }}")
    const diff = steps.find((s) => s.includes('nightly.mjs diff'))
    expect(diff, 'the diff step').toBeDefined()
    expect(diff).toContain('--cur metrics/all.json')
    expect(diff).toContain('"$GITHUB_STEP_SUMMARY"')
    expect(diff).toMatch(/^ {8}shell: bash$/m)
    expect(diff).toContain('--prev "${prev:-none}"')
  })

  it('pools every shard file but not the merged one, and says so when no job wrote a metrics file', () => {
    const merge = stepsOf('metrics').find((s) => s.includes('nightly.mjs merge'))
    expect(merge, 'the merge step').toBeDefined()
    expect(merge).toContain('--out metrics/all.json')
    expect(merge).toContain('metrics/*-*.json')
    expect(merge).toContain('nullglob')
    expect(merge).toContain('exit 1')
    expect(blocks.metrics).toContain('pattern: metrics-*')
    expect(blocks.metrics).toContain('merge-multiple: true')
  })
})

describe('docs/CI.md: The nightly deep tier', () => {
  const start = docs.indexOf('\n## The nightly deep tier\n')
  const section = start < 0 ? '' : docs.slice(start + 1)

  /** A size cell, as the table writes it. */
  const cells = (s: NightlySizes): Record<string, string> => ({
    fuzz: `${s.fuzz.shards} x ${s.fuzz.seedsPerShard} x ${s.fuzz.years}`,
    balance: `${s.balance.shards} x ${s.balance.lives} x ${s.balance.years}`,
    ceiling: `${s.ceiling.shards} x ${s.ceiling.lives} x ${s.ceiling.years} at ${s.ceiling.scale}x`,
    anachronism: `${s.anachronism.lives} in ${s.anachronism.slices}`,
    'old saves': `${s.oldSaves.years}, ${s.oldSaves.reseeds}`,
  })

  it('has the section, with the default-branch rule, the pull request smoke run and the artifact names', () => {
    expect(start, 'a "## The nightly deep tier" heading').toBeGreaterThan(-1)
    expect(section).toMatch(/default branch/)
    expect(section).toMatch(/smoke/)
    for (const name of ['metrics-fuzz-', 'fuzz-', 'metrics-balance-', 'metrics-anachronism-', 'metrics-deep-', 'slices-', 'nightly-metrics']) expect(section, name).toContain(`\`${name}`)
    expect(section).toContain('node scripts/nightly.mjs')
    expect(section).toContain('golden.mjs check --plan deep')
  })

  it('has a row for each job and each size, with the full and the smoke cell from nightlySizes', () => {
    const full = cells(nightlySizes('full'))
    const smoke = cells(nightlySizes('smoke'))
    for (const [job, cell] of Object.entries(full)) {
      const row = section.split('\n').find((l) => l.startsWith(`| ${job} |`))
      expect(row, `a table row for ${job}`).toBeDefined()
      expect(row, `${job}, full`).toContain(`| ${cell} |`)
      expect(row, `${job}, smoke`).toContain(`| ${smoke[job]} |`)
    }
  })

  it('explains each hard rule of the diff by its metric name', () => {
    for (const name of ['fuzz.failures.sum', 'balance.*.max', 'ceiling.life.maxNetWorth.max', 'ceiling.life.growth.max', 'balance.birth.msYear.p95', 'text.repeatedShare', 'oldsaves.failures.sum', 'anachronism.findings.sum']) {
      expect(section, name).toContain(`\`${name}\``)
    }
  })

  it('uses no long dash', () => {
    expect(section).not.toMatch(/[–—]/)
    expect(yml).not.toMatch(/[–—]/)
  })
})
