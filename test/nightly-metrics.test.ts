// ci: fast
// R2-P4 (K.7b e, f): writeMetrics, the one way a test file hands a number to the nightly metric diff (test/nightly-metrics.ts).
// It writes only when NIGHTLY_METRICS_DIR names a folder, so a pull request run leaves no file behind; it checks what it is
// given either way, so a bad name or a NaN fails in a pull request and not only at three in the morning.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeMetrics } from './nightly-metrics'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nightly-metrics-'))
  vi.stubEnv('NIGHTLY_METRICS_DIR', '')
  vi.stubEnv('NIGHTLY_SHARD', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))

describe('writeMetrics', () => {
  it('writes nothing when NIGHTLY_METRICS_DIR is not set', () => {
    writeMetrics('old-saves', { 'oldsaves.fixtures.sum': 1 })
    expect(readdirSync(dir)).toEqual([])
  })

  it('writes <dir>/<job>-0.json with the version, the job, the shard and the metrics', () => {
    vi.stubEnv('NIGHTLY_METRICS_DIR', dir)
    writeMetrics('old-saves', { 'oldsaves.fixtures.sum': 2, 'oldsaves.years.sum': 10, 'oldsaves.failures.sum': 0 })
    expect(readdirSync(dir)).toEqual(['old-saves-0.json'])
    expect(read('old-saves-0.json')).toEqual({ v: 1, job: 'old-saves', shard: 0, metrics: { 'oldsaves.fixtures.sum': 2, 'oldsaves.years.sum': 10, 'oldsaves.failures.sum': 0 } })
  })

  it('names the file after NIGHTLY_SHARD and carries the samples when given', () => {
    vi.stubEnv('NIGHTLY_METRICS_DIR', dir)
    vi.stubEnv('NIGHTLY_SHARD', '3')
    writeMetrics('balance', { 'balance.lives.sum': 2 }, { 'balance.birth.final': [1, 2.5, 3] })
    expect(read('balance-3.json')).toEqual({ v: 1, job: 'balance', shard: 3, metrics: { 'balance.lives.sum': 2 }, samples: { 'balance.birth.final': [1, 2.5, 3] } })
  })

  it('makes the folder when it is not there yet, nested', () => {
    const nested = join(dir, 'a', 'b')
    vi.stubEnv('NIGHTLY_METRICS_DIR', nested)
    writeMetrics('text', { 'text.lives.sum': 1 })
    expect(existsSync(join(nested, 'text-0.json'))).toBe(true)
  })

  it('writes the same file again for the same job and shard (a rerun replaces it)', () => {
    vi.stubEnv('NIGHTLY_METRICS_DIR', dir)
    writeMetrics('text', { 'text.lives.sum': 1 })
    writeMetrics('text', { 'text.lives.sum': 4 })
    expect(readdirSync(dir)).toEqual(['text-0.json'])
    expect((read('text-0.json') as { metrics: Record<string, number> }).metrics['text.lives.sum']).toBe(4)
  })

  it('refuses a metric that is not a finite number, with the name in the message, even with no folder set', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => writeMetrics('old-saves', { 'oldsaves.years.sum': bad }), String(bad)).toThrow(/oldsaves\.years\.sum/)
    }
    expect(readdirSync(dir)).toEqual([])
  })

  it('refuses a sample list with a non-finite entry, and a name or job that is not a dotted word', () => {
    expect(() => writeMetrics('balance', {}, { 'balance.birth.final': [1, NaN] })).toThrow(/balance\.birth\.final/)
    for (const name of ['', 'Upper.case', 'has space', 'trailing.', '.leading', 'a..b', '1starts.digit']) {
      expect(() => writeMetrics('balance', { [name]: 1 }), name).toThrow(/metric name/)
    }
    for (const job of ['', 'Old Saves', '../escape', 'a/b']) {
      expect(() => writeMetrics(job, { 'a.b': 1 }), job).toThrow(/job/)
    }
  })

  it('accepts the camel-case segments the nightly rules use (msYear, maxNetWorth)', () => {
    vi.stubEnv('NIGHTLY_METRICS_DIR', dir)
    writeMetrics('balance', { 'balance.birth.msYear.p95': 25, 'ceiling.life.maxNetWorth.max': 4.1e9 })
    expect(readdirSync(dir)).toEqual(['balance-0.json'])
  })

  it('refuses a shard that is not a whole number', () => {
    vi.stubEnv('NIGHTLY_METRICS_DIR', dir)
    for (const bad of ['x', '-1', '1.5', '1e3']) {
      vi.stubEnv('NIGHTLY_SHARD', bad)
      expect(() => writeMetrics('text', { 'text.lives.sum': 1 }), bad).toThrow(/NIGHTLY_SHARD/)
    }
    expect(readdirSync(dir)).toEqual([])
  })
})
