// R2-P5 (K.7b f): the two life probes the nightly runs beside the vitest files, and the entry the workflow bundles. They play real
// lives, so this file is sharded, not fast tier (test/nightly-lib.test.ts has the pure half). What it pins: the documented metric
// names, finite numbers, a replay that gives the same file (the clock is injected, so the milliseconds do not differ), a life that
// does not depend on the lives played before it, the new `scale` option of probeLife, and the bundled entry.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkMetricsFile, mergeMetricFiles, type MetricsFile } from '../scripts/nightly-lib.mjs'
import { balanceProbe, ceilingProbe } from './nightly-probes'
import { probeLife } from './probe-life'
import { ROOT } from './scan-kit'
import { netWorth } from '../src/game/core'
import { bizOf } from '../src/game/business/state'

const TIMEOUT = 120_000
const SEED = 2
const BORN = 1950

/** A clock that moves 10 ms every time it is read, so the milliseconds a probe records are the same on every run. */
function fakeClock(): () => number {
  let t = 0
  return () => (t += 10)
}

const BALANCE_SAMPLES = [
  'balance.birth.age25',
  'balance.birth.age40',
  'balance.birth.age60',
  'balance.birth.age80',
  'balance.birth.final',
  'balance.birth.msYear',
  'balance.birth.msYearMax',
  'balance.founder.final',
  'balance.founder.msYear',
  'balance.founder.msYearMax',
  'balance.founder.peak',
]

describe('balanceProbe', () => {
  let both: MetricsFile
  beforeAll(() => {
    both = balanceProbe({ start: 1, count: 2, clock: fakeClock() })
  }, TIMEOUT)

  it('returns a metrics file of the balance job with the documented names and only finite numbers', () => {
    expect(checkMetricsFile(both, 'balance probe')).toBe(both)
    expect(both).toMatchObject({ v: 1, job: 'balance' })
    expect(Object.keys(both.samples ?? {}).sort()).toEqual([...BALANCE_SAMPLES].sort())
    expect(Object.keys(both.metrics).sort()).toEqual(['balance.alive80.sum', 'balance.lives.sum'])
    expect(both.metrics['balance.lives.sum']).toBe(2)
    expect([0, 1]).toContain(both.metrics['balance.alive80.sum'])
    for (const [name, list] of Object.entries(both.samples ?? {})) for (const x of list) expect(Number.isFinite(x), `${name} ${x}`).toBe(true)
  }, TIMEOUT)

  it('life 1 is a birth life and life 2 a founder: one final each, and one year step for every year played', () => {
    const s = both.samples ?? {}
    expect(s['balance.birth.final']).toHaveLength(1)
    expect(s['balance.founder.final']).toHaveLength(1)
    expect(s['balance.founder.peak']).toHaveLength(1)
    expect(s['balance.birth.msYearMax']).toHaveLength(1)
    expect(s['balance.founder.msYearMax']).toHaveLength(1)
    // a founder lives 40 years from 30 unless it dies sooner; a birth life plays every year it has, to age 80 at most
    expect(s['balance.founder.msYear'].length).toBeGreaterThanOrEqual(1)
    expect(s['balance.founder.msYear'].length).toBeLessThanOrEqual(40)
    expect(s['balance.birth.msYear'].length).toBeGreaterThanOrEqual(1)
    expect(s['balance.birth.msYear'].length).toBeLessThanOrEqual(80)
    // the clock moves 10 ms a read and a year takes one read, so every year step is 10 and so is each maximum
    expect(new Set(s['balance.birth.msYear'])).toEqual(new Set([10]))
    expect(new Set(s['balance.founder.msYear'])).toEqual(new Set([10]))
    expect(s['balance.birth.msYearMax']).toEqual([10])
    // a founder's peak is at least what it ended with
    expect(s['balance.founder.peak'][0]).toBeGreaterThanOrEqual(s['balance.founder.final'][0])
  })

  it('samples a birth life at 25, 40, 60 and 80 as far as it gets, and no further than untilAge', () => {
    // three birth lives (seeds 1, 3 and 5) played to 45, and two founders for a year
    const mid = balanceProbe({ start: 1, count: 5, years: 1, untilAge: 45, clock: fakeClock() }).samples ?? {}
    expect(mid['balance.birth.final']).toHaveLength(3)
    expect(mid['balance.founder.final']).toHaveLength(2)
    expect(mid['balance.birth.age25'].length).toBeGreaterThanOrEqual(1)
    expect(mid['balance.birth.age25'].length).toBeLessThanOrEqual(3)
    expect(mid['balance.birth.age40'].length).toBeLessThanOrEqual(mid['balance.birth.age25'].length)
    expect(mid['balance.birth.age60']).toEqual([])
    expect(mid['balance.birth.age80']).toEqual([])
    expect(mid['balance.founder.msYear']).toHaveLength(2)
  }, TIMEOUT)

  it('a replay is the same file', () => {
    expect(balanceProbe({ start: 1, count: 2, clock: fakeClock() })).toEqual(both)
  }, TIMEOUT)

  it('a life does not depend on the lives played before it: life 2 alone gives the founder numbers it gave inside the pair', () => {
    const alone = balanceProbe({ start: 2, count: 1, clock: fakeClock() })
    expect(alone.metrics['balance.lives.sum']).toBe(1)
    expect(alone.samples?.['balance.birth.final']).toEqual([])
    expect(alone.samples?.['balance.founder.final']).toEqual(both.samples?.['balance.founder.final'])
    expect(alone.samples?.['balance.founder.peak']).toEqual(both.samples?.['balance.founder.peak'])
  }, TIMEOUT)

  it('years and untilAge shorten the lives, for the smoke run', () => {
    const short = balanceProbe({ start: 1, count: 2, years: 2, untilAge: 5, clock: fakeClock() })
    expect(short.samples?.['balance.birth.msYear']).toHaveLength(5)
    expect(short.samples?.['balance.founder.msYear']).toHaveLength(2)
    expect(short.samples?.['balance.birth.age25']).toEqual([])
    expect(short.metrics['balance.alive80.sum']).toBe(0)
  }, TIMEOUT)

  it('refuses a count or start that is not a whole number above zero', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => balanceProbe({ start: bad, count: 1 }), `start ${bad}`).toThrow(/start/)
      expect(() => balanceProbe({ start: 1, count: bad }), `count ${bad}`).toThrow(/count/)
    }
  })

  it('merges with a second shard into one file the diff can read', () => {
    const merged = mergeMetricFiles([both, balanceProbe({ start: 3, count: 1, years: 2, untilAge: 30, clock: fakeClock() })])
    expect(merged['balance.lives.sum']).toBe(3)
    expect(merged['balance.birth.final.n']).toBe(2)
    expect(merged['balance.founder.final.n']).toBe(1)
    for (const [name, value] of Object.entries(merged)) expect(Number.isFinite(value), name).toBe(true)
  }, TIMEOUT)
})

describe('ceilingProbe', () => {
  let at100: MetricsFile
  beforeAll(() => {
    at100 = ceilingProbe({ start: 2, count: 1, years: 2, scale: 100 })
  }, TIMEOUT)

  it('returns a metrics file of the ceiling job: one life, its highest net worth, and that over the net worth it started with', () => {
    expect(checkMetricsFile(at100, 'ceiling probe')).toBe(at100)
    expect(at100).toMatchObject({ v: 1, job: 'ceiling' })
    expect(Object.keys(at100.samples ?? {}).sort()).toEqual(['ceiling.life.growth', 'ceiling.life.maxNetWorth'])
    expect(at100.metrics).toEqual({ 'ceiling.lives.sum': 1 })
    const [maxNetWorth] = at100.samples?.['ceiling.life.maxNetWorth'] ?? []
    const [growth] = at100.samples?.['ceiling.life.growth'] ?? []
    expect(Number.isFinite(maxNetWorth)).toBe(true)
    expect(Number.isFinite(growth)).toBe(true)
    // the founder starts with 5e6 and companies funded 3e6 each, a hundred times over
    expect(maxNetWorth).toBeGreaterThan(1e8)
    // the highest net worth includes the one it started with, so the growth is at least 1
    expect(growth).toBeGreaterThanOrEqual(1)
  }, TIMEOUT)

  it('a hundred times the inputs gives a bigger net worth than one times, and a replay is the same file', () => {
    const at1 = ceilingProbe({ start: 2, count: 1, years: 2, scale: 1 })
    expect(at100.samples?.['ceiling.life.maxNetWorth'][0]).toBeGreaterThan((at1.samples?.['ceiling.life.maxNetWorth'][0] ?? 0) * 10)
    expect(ceilingProbe({ start: 2, count: 1, years: 2, scale: 100 })).toEqual(at100)
  }, TIMEOUT)

  it('refuses a scale that is not a number above zero, and years or count below one', () => {
    for (const bad of [0, -3, NaN, Infinity]) expect(() => ceilingProbe({ start: 2, count: 1, years: 1, scale: bad }), `scale ${bad}`).toThrow(/scale/)
    expect(() => ceilingProbe({ start: 2, count: 0, years: 1, scale: 1 })).toThrow(/count/)
    expect(() => ceilingProbe({ start: 2, count: 1, years: 0, scale: 1 })).toThrow(/years/)
  })
})

describe('probeLife scale', () => {
  const opts = { seed: SEED, birthYear: BORN, businesses: 2, years: 2 } as const
  /** The state at year 0 (before any year is lived) and at the end. */
  function lived(scale?: number): { start: { money: number; cash: number[]; netWorth: number }; end: string } {
    let start = { money: 0, cash: [] as number[], netWorth: 0 }
    const g = probeLife({
      ...opts,
      ...(scale === undefined ? {} : { scale }),
      onYear: (state, y) => {
        if (y === 0) start = { money: state.character.money, cash: state.assets.filter((a) => a.kind === 'business').map((a) => bizOf(state, a).cash), netWorth: netWorth(state) }
      },
    })
    return { start, end: JSON.stringify(g) }
  }

  it('scale 1 is the life the option did not exist for: the same state as no scale at all', () => {
    expect(lived(1).end).toBe(lived().end)
  }, TIMEOUT)

  it('multiplies the founder money and every company cash, and nothing else it starts with', () => {
    const one = lived(1).start
    const big = lived(100).start
    expect(one.money).toBe(5e6)
    expect(big.money).toBe(5e8)
    expect(one.cash).toEqual([3_000_000, 3_000_000])
    expect(big.cash).toEqual([3e8, 3e8])
    // net worth counts the money and the assets' value, which the scale does not touch, so it is at most a hundred times
    expect(big.netWorth).toBeGreaterThan(one.netWorth * 10)
    expect(big.netWorth).toBeLessThanOrEqual(one.netWorth * 100)
  }, TIMEOUT)

  it('refuses a scale that is not a finite number above zero', () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(() => probeLife({ ...opts, scale: bad }), String(bad)).toThrow(/scale/)
  })
})

describe('scripts/nightly-probes.ts, bundled the way the workflow does', () => {
  const work = mkdtempSync(join(tmpdir(), 'nightly-probes-'))
  afterAll(() => rmSync(work, { recursive: true, force: true }))
  let entry = ''
  const run = (...args: string[]) => spawnSync(process.execPath, [entry, ...args], { cwd: work, encoding: 'utf8' })

  it('ceiling --start --count --years --scale --out writes the metrics file, and balance does too', async () => {
    const { build } = await import('esbuild')
    const out = await build({ entryPoints: [join(ROOT, 'scripts', 'nightly-probes.ts')], absWorkingDir: ROOT, bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false, logLevel: 'silent' })
    entry = join(work, 'nightly-probes.mjs')
    writeFileSync(entry, out.outputFiles[0].text)

    const ceilingOut = join(work, 'ceiling-1.json')
    const ceiling = run('ceiling', '--start', '2', '--count', '1', '--years', '2', '--scale', '100', '--out', ceilingOut)
    expect(ceiling.status, ceiling.stderr).toBe(0)
    const written = JSON.parse(readFileSync(ceilingOut, 'utf8')) as unknown
    expect(checkMetricsFile(written, ceilingOut)).toMatchObject({ job: 'ceiling', metrics: { 'ceiling.lives.sum': 1 } })

    const balanceOut = join(work, 'balance-1.json')
    const balance = run('balance', '--start', '2', '--count', '1', '--years', '2', '--until-age', '5', '--out', balanceOut)
    expect(balance.status, balance.stderr).toBe(0)
    expect(checkMetricsFile(JSON.parse(readFileSync(balanceOut, 'utf8')), balanceOut)).toMatchObject({ job: 'balance', metrics: { 'balance.lives.sum': 1 } })
  }, TIMEOUT)

  it('takes the shard number from NIGHTLY_SHARD, as writeMetrics does', () => {
    const out = join(work, 'shard.json')
    const r = spawnSync(process.execPath, [entry, 'ceiling', '--start', '2', '--count', '1', '--years', '1', '--scale', '1', '--out', out], { cwd: work, encoding: 'utf8', env: { ...process.env, NIGHTLY_SHARD: '4' } })
    expect(r.status, r.stderr).toBe(0)
    expect((JSON.parse(readFileSync(out, 'utf8')) as { shard: number }).shard).toBe(4)
  }, TIMEOUT)

  it('exits 2 on a missing option, a bad number, an unknown flag or an unknown command', () => {
    expect(run('ceiling', '--start', '1', '--count', '1', '--years', '1', '--scale', '1').status).toBe(2)
    expect(run('ceiling', '--start', 'x', '--count', '1', '--years', '1', '--scale', '1', '--out', join(work, 'x.json')).status).toBe(2)
    expect(run('balance', '--start', '1', '--count', '1', '--out', join(work, 'x.json'), '--nope', '1').status).toBe(2)
    expect(run('bogus').status).toBe(2)
    expect(run().status).toBe(2)
  })
})
