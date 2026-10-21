// R1-P9: the parity and cost probe (scripts/r1-parity.mjs). The lead plays 30 lives of 40 years on the R0 head and on the
// R1 head and compares them (lead action 6); this file checks the pure functions and runs the CLI on 2 lives of 3 years,
// so the harness is known to work before it is trusted with the release gate. Not a fast-tier file: it bundles the
// engine with esbuild a few times (about 30 seconds in all).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { costRatio, countNodes, firstDiff, formatCostTable, lifeSpecs, median } from '../scripts/r1-parity-lib.mjs'
import { jsonNodes } from './charts-kit'
import { stripR1 } from './r1-strip'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TIMEOUT = 90_000

const tmp = mkdtempSync(join(tmpdir(), 'r1-parity-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function cli(...args: string[]): { status: number | null; out: string } {
  const run = spawnSync(process.execPath, ['scripts/r1-parity.mjs', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

describe('lifeSpecs', () => {
  it('is 30 lives of 40 years: 15 birth lives and 15 founders, seeds 1 to 30', () => {
    const specs = lifeSpecs()
    expect(specs).toHaveLength(30)
    expect(specs.map((s) => s.seed)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(specs.filter((s) => s.kind === 'birth')).toHaveLength(15)
    expect(specs.filter((s) => s.kind === 'founder')).toHaveLength(15)
    for (const s of specs) {
      expect(s.years).toBe(40)
      expect(s.kind === 'birth' ? s.seed % 2 === 1 : s.seed % 2 === 0).toBe(true)
      if (s.kind === 'founder') expect([1, 2, 3]).toContain(s.businesses)
      else expect(s.businesses).toBe(0)
    }
    expect(new Set(specs.filter((s) => s.kind === 'founder').map((s) => s.businesses))).toEqual(new Set([1, 2, 3]))
  })

  it('cycles the birth years 1925, 1950, 1975, 1990, 2010 and takes its size from the arguments', () => {
    const years = lifeSpecs().map((s) => s.birthYear)
    expect(new Set(years)).toEqual(new Set([1925, 1950, 1975, 1990, 2010]))
    expect(years.slice(0, 5).sort()).toEqual([1925, 1950, 1975, 1990, 2010])
    const small = lifeSpecs(4, 3)
    expect(small.map((s) => s.seed)).toEqual([1, 2, 3, 4])
    expect(small.every((s) => s.years === 3)).toBe(true)
  })
})

describe('firstDiff', () => {
  it('ignores key order and treats NaN as equal to NaN', () => {
    expect(firstDiff({ a: 1, b: { c: [1, 2], d: 'x' } }, { b: { d: 'x', c: [1, 2] }, a: 1 })).toBeNull()
    expect(firstDiff({ a: NaN }, { a: NaN })).toBeNull()
    expect(firstDiff([], [])).toBeNull()
    expect(firstDiff(null, null)).toBeNull()
  })

  it('gives the JSON pointer of the first difference', () => {
    expect(firstDiff({ a: [1, 2, 3] }, { a: [1, 9, 3] })).toEqual({ path: '/a/1', a: 2, b: 9 })
    expect(firstDiff({ a: { b: { c: [{ d: 1 }, { d: 2 }] } } }, { a: { b: { c: [{ d: 1 }, { d: 3 }] } } })).toEqual({ path: '/a/b/c/1/d', a: 2, b: 3 })
    expect(firstDiff({ flags: { lifeSeries: { rows: [] } } }, { flags: {} })).toEqual({ path: '/flags/lifeSeries', a: { rows: [] }, b: undefined })
    expect(firstDiff(1, 2)).toEqual({ path: '', a: 1, b: 2 })
  })

  it('reports an extra key on either side, and arrays of different length at the first index that is missing', () => {
    expect(firstDiff({ a: 1 }, { a: 1, extra: 5 })).toEqual({ path: '/extra', a: undefined, b: 5 })
    expect(firstDiff({ a: 1, extra: 5 }, { a: 1 })).toEqual({ path: '/extra', a: 5, b: undefined })
    expect(firstDiff({ a: [1, 2] }, { a: [1, 2, 3] })).toEqual({ path: '/a/2', a: undefined, b: 3 })
    expect(firstDiff({ a: [1, 2, 3] }, { a: [1, 2] })).toEqual({ path: '/a/2', a: 3, b: undefined })
  })

  it('tells an array from an object, null from an object, and escapes / and ~ in a key as RFC 6901 does', () => {
    expect(firstDiff({ a: [] }, { a: {} })?.path).toBe('/a')
    expect(firstDiff({ a: null }, { a: {} })?.path).toBe('/a')
    expect(firstDiff({ 'a/b': 1, 'c~d': 1 }, { 'a/b': 1, 'c~d': 2 })?.path).toBe('/c~0d')
    expect(firstDiff({ 'a/b': 1 }, { 'a/b': 2 })?.path).toBe('/a~1b')
  })
})

describe('countNodes', () => {
  it('counts every array, object and primitive once', () => {
    expect(countNodes({ a: [1, 2], b: { c: null } })).toBe(6)
    expect(countNodes(7)).toBe(1)
    expect(countNodes([])).toBe(1)
  })

  it('agrees with the save loader count in test/charts-kit.ts', () => {
    const nested = { rows: [{ year: 1, v: [1, 2, { z: null }] }, { year: 2, v: [] }], meta: { a: 'x', b: { c: [true, false] } } }
    expect(countNodes(nested)).toBe(jsonNodes(nested))
    expect(countNodes([[{ a: 1 }, [2, [3, { b: [4] }]]], 'x'])).toBe(jsonNodes([[{ a: 1 }, [2, [3, { b: [4] }]]], 'x']))
  })
})

describe('median, costRatio and formatCostTable', () => {
  it('takes the middle of an odd list and the mean of the middle two of an even one', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([5])).toBe(5)
    expect(Number.isNaN(median([]))).toBe(true)
    const xs = [9, 1, 5]
    median(xs)
    expect(xs).toEqual([9, 1, 5])
  })

  it('gives a ratio per life and their mean, and never divides by zero', () => {
    const r = costRatio([10, 20], [11, 20])
    expect(r.perLife[0]).toBeCloseTo(1.1, 10)
    expect(r.perLife[1]).toBe(1)
    expect(r.mean).toBeCloseTo(1.05, 10)
    const zero = costRatio([0, 10], [5, 10])
    expect(zero.perLife).toEqual([1, 1])
    expect(zero.mean).toBe(1)
    expect(costRatio([], [])).toEqual({ perLife: [], mean: 1 })
    expect(() => costRatio([1], [1, 2])).toThrow()
  })

  it('writes a markdown table with a mean row, and no NaN or Infinity for a zero baseline', () => {
    const table = formatCostTable([
      { seed: 1, baseMs: 10, r1Ms: 10.5, baseNodes: 1000, r1Nodes: 1030 },
      { seed: 2, baseMs: 20, r1Ms: 20, baseNodes: 2000, r1Nodes: 2000 },
    ])
    const lines = table.split('\n')
    expect(lines[0]).toBe('| Seed | Base ms | R1 ms | Time ratio | Base nodes | R1 nodes | Node ratio |')
    expect(lines[1]).toBe('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    expect(lines[2]).toBe('| 1 | 10.00 | 10.50 | 1.050 | 1,000 | 1,030 | 1.030 |')
    expect(lines[3]).toBe('| 2 | 20.00 | 20.00 | 1.000 | 2,000 | 2,000 | 1.000 |')
    expect(lines[4]).toBe('| mean | | | 1.025 | | | 1.015 |')
    const zero = formatCostTable([{ seed: 3, baseMs: 0, r1Ms: 4, baseNodes: 0, r1Nodes: 9 }])
    expect(zero).not.toMatch(/NaN|Infinity/)
  })
})

/**
 * What the R0 head would have saved for the lives in `from`: the same files with everything R1 adds taken out. The R1 tree
 * writes keys the baseline never had (the 14 book keys, flags.lifeSeries, ...), so a run of the R1 tree is only comparable
 * with a baseline after stripR1. The CLI strips the R1 side; this stands in for the baseline side.
 */
function strippedCopy(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (!name.endsWith('.json.gz')) copyFileSync(join(from, name), join(to, name))
    else writeFileSync(join(to, name), gzipSync(JSON.stringify(stripR1(JSON.parse(gunzipSync(readFileSync(join(from, name))).toString('utf8'))))))
  }
}

describe('the CLI', () => {
  // Two lives (seed 1 a birth life, seed 2 a founder) of 3 years, played twice from the same tree, then once with every
  // flag on. "a" is the R1 tree's first run, "b" its second, "c" a run with flags; "base" is "a" without the R1 keys.
  const a = join(tmp, 'a')
  const b = join(tmp, 'b')
  const c = join(tmp, 'c')
  const base = join(tmp, 'base')

  it('plays lives into gzip files and an index, the same way twice', () => {
    const first = cli('play', '--repo', '.', '--out', a, '--lives', '2', '--years', '3')
    expect(first.status, first.out).toBe(0)
    const second = cli('play', '--repo', '.', '--out', b, '--lives', '2', '--years', '3')
    expect(second.status, second.out).toBe(0)
    for (const dir of [a, b]) {
      expect(existsSync(join(dir, 'life-1-birth.json.gz'))).toBe(true)
      expect(existsSync(join(dir, 'life-2-founder.json.gz'))).toBe(true)
      const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, unknown>[]
      expect(index.map((r) => [r.seed, r.kind])).toEqual([
        [1, 'birth'],
        [2, 'founder'],
      ])
      for (const row of index) {
        expect(Object.keys(row).sort()).toEqual(['age', 'alive', 'bytes', 'kind', 'ms', 'nodes', 'seed'])
        expect(row.nodes as number).toBeGreaterThan(1000)
        expect(row.bytes as number).toBeGreaterThan(1000)
      }
    }
    const state = JSON.parse(gunzipSync(readFileSync(join(a, 'life-1-birth.json.gz'))).toString('utf8')) as { character: { age: number } }
    expect(state.character.age).toBe(3)
    strippedCopy(a, base)
  }, TIMEOUT)

  it('compare passes when the R1 run (stripped) equals the baseline, and fails with the JSON pointer when one number changes', () => {
    const same = cli('compare', '--base', base, '--r1', b)
    expect(same.status, same.out).toBe(0)
    expect(same.out).toMatch(/seed 1 birth: ok/)
    expect(same.out).toMatch(/seed 2 founder: ok/)
    expect(same.out).toMatch(/stripped from the R1 run/)

    const file = join(b, 'life-2-founder.json.gz')
    const json = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { year: number }
    json.year += 1
    writeFileSync(file, gzipSync(JSON.stringify(json)))
    const changed = cli('compare', '--base', base, '--r1', b)
    expect(changed.status, changed.out).toBe(1)
    expect(changed.out).toMatch(/seed 2 founder: \/year/)
    expect(changed.out).toMatch(/seed 1 birth: ok/)
  }, TIMEOUT)

  it('cost times the same final states and finds a ratio near 1 (the limit is loosened: this is a smoke run of tiny states)', () => {
    const run = cli('cost', '--base', a, '--r1', a, '--reps', '3', '--limit', '3')
    expect(run.status, run.out).toBe(0)
    const mean = /^\| mean \| \| \| (\d+\.\d{3}) \| \| \| (\d+\.\d{3}) \|$/m.exec(run.out)
    expect(mean, run.out).not.toBeNull()
    expect(Number(mean?.[2])).toBe(1)
    expect(Number(mean?.[1])).toBeGreaterThan(0.2)
    expect(Number(mean?.[1])).toBeLessThan(3)
  }, TIMEOUT)

  it('cost exits 1 when the mean ratio is over the limit and says it is advisory', () => {
    const run = cli('cost', '--base', a, '--r1', a, '--reps', '3', '--limit', '0.01')
    expect(run.status, run.out).toBe(1)
    expect(run.out).toMatch(/advisory: D\.11 criterion 12 is a decision for the lead/)
  }, TIMEOUT)

  it('--flags all gives the same lives as --flags none (the flags change presentation only)', () => {
    const played = cli('play', '--repo', '.', '--out', c, '--lives', '2', '--years', '3', '--flags', 'all')
    expect(played.status, played.out).toBe(0)
    const same = cli('compare', '--base', base, '--r1', c)
    expect(same.status, same.out).toBe(0)
  }, TIMEOUT)

  it('exits 2 on a usage error', () => {
    expect(cli('frobnicate').status).toBe(2)
    expect(cli().status).toBe(2)
    expect(cli('play', '--out', join(tmp, 'x')).status).toBe(2)
    expect(cli('play', '--repo', '.').status).toBe(2)
    expect(cli('play', '--repo', '.', '--out', join(tmp, 'x'), '--lives', 'many').status).toBe(2)
    expect(cli('play', '--repo', '.', '--out', join(tmp, 'x'), '--flags', 'some').status).toBe(2)
    expect(cli('compare', '--base', a).status).toBe(2)
    expect(cli('cost', '--base', a, '--r1', a, '--reps', '0').status).toBe(2)
    expect(cli('play', '--repo', '.', '--out', join(tmp, 'x'), '--bogus', '1').status).toBe(2)
  })
})
