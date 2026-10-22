// ci: fast
// R1-P7 (K.7a b): the seed-slice kit that lets the five slowest test files run a part of their seeds in each CI shard,
// and the merge step that runs their aggregate assertions on the whole set. The kit is plain Node (no vitest), so these
// tests drive it directly with temp directories and a scratch SLICE_DIR. The layout tests at the end tie the kit to
// scripts/test-timings.json (the split list) and to the files that use it (the five slow ones, and the conservation probe of R2-L5).
//
// This file reaches the kit as ../test/shard-kit on purpose: scripts/ci-shard.mjs treats any test file that imports
// the kit by its sibling path as a sliced file, and this one is a guard in the fast tier, not a sliced file.
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { listTestFiles, readTimings, verifyCoverage } from '../scripts/ci-shard.mjs'
import { decodeRows, encodeRows, mergedSlices, ownedHere, readSlice, recordSlice, seedSlice, sliceDir, type SliceSpec } from '../test/shard-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// The five slow files of R1-P7 and the conservation probe of R2-L5 (forty lives of a hundred years).
const SLICED = ['test/anachronism.test.ts', 'test/era-features.test.ts', 'test/ledger-conservation.test.ts', 'test/main-character-life.test.ts', 'test/sector-story.test.ts', 'test/simulate.test.ts']

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shard-kit-'))
  scratch.push(dir)
  return dir
}

/** Runs fn with some environment variables set (undefined removes one), then puts them back. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const old = Object.fromEntries(Object.keys(vars).map((name) => [name, process.env[name]]))
  const put = (set: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(set)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  put(vars)
  try {
    return fn()
  } finally {
    put(old)
  }
}

const part = (i: number, n: number): SliceSpec => readSlice(`${i}/${n}`)
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

describe('readSlice', () => {
  it('reads unset, empty, merge and i/n', () => {
    const full: SliceSpec = { mode: 'full', index: 0, count: 1 }
    expect(readSlice('')).toEqual(full)
    expect(withEnv({ SLICE: undefined }, () => readSlice())).toEqual(full)
    expect(withEnv({ SLICE: '' }, () => readSlice())).toEqual(full)
    expect(readSlice('merge').mode).toBe('merge')
    expect(readSlice('1/4')).toEqual({ mode: 'part', index: 0, count: 4 })
    expect(readSlice('4/4')).toEqual({ mode: 'part', index: 3, count: 4 })
    expect(readSlice('1/1')).toEqual({ mode: 'part', index: 0, count: 1 })
    expect(readSlice('64/64')).toEqual({ mode: 'part', index: 63, count: 64 })
    // With no argument it reads the environment at the time of the call.
    expect(withEnv({ SLICE: '3/8' }, () => readSlice())).toEqual({ mode: 'part', index: 2, count: 8 })
    expect(withEnv({ SLICE: 'merge' }, () => readSlice()).mode).toBe('merge')
  })

  it('throws on anything else, naming SLICE and the bad value', () => {
    for (const bad of ['0/4', '5/4', '1/65', 'x', '1/0', '1/', '/4', '01/4', '+1/4', '1.5/4', ' 1/4', '1/4 ', 'Merge', 'MERGE', '1-4', '1 of 4', '-1/4']) {
      expect(() => readSlice(bad), bad).toThrow(/SLICE/)
      expect(() => readSlice(bad), bad).toThrow(JSON.stringify(bad))
    }
    expect(() => withEnv({ SLICE: 'nope' }, () => readSlice())).toThrow(/SLICE/)
  })
})

describe('seedSlice', () => {
  it('partitions a list: the slices concatenate to the original, never overlap, differ by at most one, and keep order', () => {
    for (const len of [0, 1, 3, 40, 400, 401]) {
      const all = range(len)
      for (let n = 1; n <= 8; n++) {
        const slices = range(n).map((i) => seedSlice(all, 'k', part(i + 1, n)))
        const where = `${len} items in ${n} slices`
        expect(slices.flat(), where).toEqual(all)
        expect(new Set(slices.flat()).size, where).toBe(len)
        const sizes = slices.map((s) => s.length)
        expect(Math.max(...sizes) - Math.min(...sizes), where).toBeLessThanOrEqual(1)
      }
    }
  })

  it('gives full everything (as a copy) and merge nothing', () => {
    const all = ['a', 'b', 'c']
    const full = seedSlice(all, 'k', readSlice(''))
    expect(full).toEqual(all)
    expect(full).not.toBe(all)
    expect(seedSlice(all, 'k', readSlice('merge'))).toEqual([])
    expect(seedSlice([], 'k', readSlice('merge'))).toEqual([])
    // The default spec is the environment's.
    expect(withEnv({ SLICE: '2/3' }, () => seedSlice(range(9), 'k'))).toEqual([3, 4, 5])
    expect(withEnv({ SLICE: undefined }, () => seedSlice(range(9), 'k'))).toEqual(range(9))
  })

  it('needs a key', () => {
    expect(() => seedSlice([1], '', readSlice(''))).toThrow(/key/)
    expect(() => ownedHere('', readSlice(''))).toThrow(/key/)
  })
})

describe('ownedHere', () => {
  it('names exactly one owner slice per key', () => {
    const keys = [...range(20).map((i) => `sample:key-${i}`), 'era:rest', 'mcl:careers', 'anachronism:units']
    for (const n of [1, 2, 3, 4, 5, 8]) {
      for (const key of keys) {
        const owners = range(n).filter((i) => ownedHere(key, part(i + 1, n)))
        expect(owners, `${key} in ${n} slices`).toHaveLength(1)
      }
    }
  })

  it('is true in full, false in merge, and the same answer every time', () => {
    expect(ownedHere('era:rest', readSlice(''))).toBe(true)
    expect(ownedHere('era:rest', readSlice('merge'))).toBe(false)
    const again = range(4).map((i) => ownedHere('era:rest', part(i + 1, 4)))
    expect(range(4).map((i) => ownedHere('era:rest', part(i + 1, 4)))).toEqual(again)
    expect(withEnv({ SLICE: undefined }, () => ownedHere('era:rest'))).toBe(true)
  })
})

describe('encodeRows and decodeRows', () => {
  it('round trips numbers that JSON cannot hold, nested arrays and null', () => {
    const rows = [1, NaN, Infinity, -Infinity, null, [2, [NaN, 'NaN']], { a: NaN, b: { c: -Infinity, d: [Infinity] }, e: 'x', f: true }, 0.5, -3, '']
    const text = encodeRows(rows)
    expect(() => JSON.parse(text)).not.toThrow()
    expect(text).toContain('"__num"')
    expect(decodeRows<unknown[]>(text)).toEqual(rows)
    expect(decodeRows(encodeRows([]))).toEqual([])
    expect(decodeRows(encodeRows(null))).toBeNull()
  })
})

describe('recordSlice and mergedSlices', () => {
  const ALL = [1, 2, NaN, 4, 5, 6, Infinity, 8, 9, 10, 11]

  function recordAll(dir: string, key: string, n: number): void {
    withEnv({ SLICE_DIR: dir }, () => {
      for (let i = 1; i <= n; i++) {
        const spec = part(i, n)
        recordSlice(key, seedSlice(ALL, key, spec), spec)
      }
    })
  }
  const merged = (dir: string, key: string) => withEnv({ SLICE_DIR: dir }, () => mergedSlices<number>(key, readSlice('merge')))

  it('puts the slice files in SLICE_DIR, defaulting to test-slices', () => {
    expect(withEnv({ SLICE_DIR: undefined }, () => sliceDir())).toBe('test-slices')
    expect(withEnv({ SLICE_DIR: '/somewhere/else' }, () => sliceDir())).toBe('/somewhere/else')
  })

  it('merges four recorded parts into the original list, in order', () => {
    const dir = tempDir()
    recordAll(dir, 'simulate:lives', 4)
    expect(readdirSync(dir).sort()).toEqual([1, 2, 3, 4].map((i) => `simulate-lives.${i}of4.json`))
    expect(merged(dir, 'simulate:lives')).toEqual(ALL)
    // Another key in the same directory is its own set.
    recordAll(dir, 'other key/2', 3)
    expect(readdirSync(dir)).toContain('other-key-2.2of3.json')
    expect(merged(dir, 'other key/2')).toEqual(ALL)
    expect(merged(dir, 'simulate:lives')).toEqual(ALL)
  })

  it('sanitises a key into a file name', () => {
    const dir = tempDir()
    withEnv({ SLICE_DIR: dir }, () => recordSlice('a b:c/d.e_f-g', [1], part(2, 4)))
    expect(readdirSync(dir)).toEqual(['a-b-c-d.e_f-g.2of4.json'])
  })

  it('creates the directory when it is not there yet', () => {
    const dir = join(tempDir(), 'nested', 'slices')
    withEnv({ SLICE_DIR: dir }, () => recordSlice('k', [1, 2], part(1, 2)))
    expect(existsSync(join(dir, 'k.1of2.json'))).toBe(true)
  })

  it('writes nothing in full or merge mode, and hands back nothing outside merge mode', () => {
    const dir = join(tempDir(), 'never')
    withEnv({ SLICE_DIR: dir }, () => {
      recordSlice('k', [1, 2, 3], readSlice(''))
      recordSlice('k', [1, 2, 3], readSlice('merge'))
      expect(mergedSlices('k', readSlice(''))).toEqual([])
      expect(mergedSlices('k', part(1, 2))).toEqual([])
    })
    expect(existsSync(dir)).toBe(false)
  })

  it('refuses rows that are not a list', () => {
    const dir = tempDir()
    expect(() => withEnv({ SLICE_DIR: dir }, () => recordSlice('k', { not: 'a list' }, part(1, 2)))).toThrow(/"k"/)
    expect(readdirSync(dir)).toEqual([])
  })

  it('throws, naming the key and the index, when a slice is missing', () => {
    const dir = tempDir()
    recordAll(dir, 'k', 4)
    rmSync(join(dir, 'k.3of4.json'))
    expect(() => merged(dir, 'k')).toThrow(/slice 3 of 4 is missing for "k"/)
    // Nothing recorded at all is the same problem for slice 1.
    expect(() => merged(dir, 'never-recorded')).toThrow(/slice 1 of "never-recorded" is missing/)
    expect(() => merged(join(dir, 'no-such-dir'), 'k')).toThrow(/slice 1 of "k" is missing/)
  })

  it('throws, naming the key and the index, when a slice shows up twice', () => {
    const dir = tempDir()
    recordAll(dir, 'k', 4)
    // A slice file copied over another one: file 3 holds slice 2 again.
    copyFileSync(join(dir, 'k.2of4.json'), join(dir, 'k.3of4.json'))
    expect(() => merged(dir, 'k')).toThrow(/slice 2 of "k" appears twice/)
    expect(() => merged(dir, 'k')).toThrow(/k\.3of4\.json/)
  })

  it('throws, naming the key and the index, when a slice comes from a run of a different size', () => {
    const dir = tempDir()
    recordAll(dir, 'k', 4)
    withEnv({ SLICE_DIR: dir }, () => recordSlice('k', [7, 7], part(2, 3)))
    expect(() => merged(dir, 'k')).toThrow(/slice 2 of "k" comes from a run of 3 slices, not 4/)
    expect(() => merged(dir, 'k')).toThrow(/k\.2of3\.json/)
  })

  it('throws, naming the key, on a slice file it cannot read', () => {
    const dir = tempDir()
    recordAll(dir, 'k', 2)
    writeFileSync(join(dir, 'k.2of2.json'), '{ not json')
    expect(() => merged(dir, 'k')).toThrow(/slice 2 of "k" cannot be read/)
    writeFileSync(join(dir, 'k.2of2.json'), JSON.stringify({ slice: 2, of: 2, rows: 'nope' }))
    expect(() => merged(dir, 'k')).toThrow(/slice 2 of "k" cannot be read/)
  })

  it('ignores files that are not slices of the key', () => {
    const dir = tempDir()
    recordAll(dir, 'k', 2)
    writeFileSync(join(dir, 'shard-1.txt'), 'shard 1\n')
    writeFileSync(join(dir, 'k.1of2.json.bak'), 'old')
    writeFileSync(join(dir, 'kk.1of9.json'), '{}')
    expect(merged(dir, 'k')).toEqual(ALL)
  })
})

describe('the layout of the sliced files', () => {
  const importsKit = /^[ \t]*import\s[^'"`;]*?['"]\.\/shard-kit(?:\.ts)?['"]/m
  const text = (file: string) => readFileSync(join(ROOT, file), 'utf8')

  it('lists in split exactly the test files that import the kit, and those are the sliced files', () => {
    const importing = listTestFiles().filter((file) => importsKit.test(text(file)))
    const split = readTimings().split
    expect([...importing].sort()).toEqual([...split].sort())
    expect([...split].sort()).toEqual(SLICED)
    for (const n of [1, 2, 4, 8]) expect(verifyCoverage(n), `${n} shards`).toEqual([])
  })

  it('has no afterAll in the sliced files, and one readSlice call in each', () => {
    for (const file of SLICED) {
      const source = text(file)
      expect(source.includes('afterAll('), `${file} still has afterAll`).toBe(false)
      expect(source.split('readSlice(').length - 1, `${file} readSlice calls`).toBe(1)
    }
  })
})
