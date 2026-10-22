// ci: fast
// R2-B1 (F.1 "Pinned seeds"): the seed-pin ratchet. A test that names a seed in the form `seed: <digits>` pins a life to
// the code base of the day: the next change that moves one draw moves the life, and the test breaks for a reason that has
// nothing to do with what it checks. The wave-0 rebaseline moves every seeded life once, and this ratchet keeps the count of
// such pins from growing. A test that needs a life with some property asks test/seed-kit.ts for one: findSeed(pred).
//
// It counts, per file under test/ (not test/fixtures/, not this file, not the seed kit and its test), the lines that match
// \bseed:\s*\d+  (a line, not an occurrence). A count above the file's entry in test/seed-pins-baseline.json fails, and so does
// a nonzero count in a file that has no entry. An entry above the real count fails as stale, so the baseline only goes down.
//
// To lower the baseline after pins are removed (it refuses to raise, and with no file yet it writes the first):
//   UPDATE_SEED_PINS=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/seed-pins.test.ts
// A new test writes a fixed life as a tuple (const LIFE = [7, 1990] as const) or finds one with findSeed. A pure rename of a
// test file means moving its entry by hand.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './scan-kit'

const BASELINE_PATH = join(ROOT, 'test', 'seed-pins-baseline.json')
const PIN = /\bseed:\s*\d+/

interface Baseline {
  v: 1
  files: Record<string, number>
}

/** The pinned lines of one file's text. */
function countPins(text: string): number {
  let n = 0
  for (const line of text.split('\n')) if (PIN.test(line)) n++
  return n
}

/** True for the files the ratchet does not read: fixtures, this file, the seed kit and its test. */
function exempt(path: string): boolean {
  return path.startsWith('test/fixtures/') || path === 'test/seed-pins.test.ts' || /^test\/seed-kit[^/]*\.ts$/.test(path)
}

/** Every test source file under `dir` of `root`, repo-relative and sorted. */
function testFiles(root: string = ROOT, dir = 'test'): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const next = join(abs, e.name)
      if (e.isDirectory()) walk(next)
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(relative(root, next).split(sep).join('/'))
    }
  }
  walk(join(root, dir))
  return out.filter((p) => !exempt(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Nonzero counts per file, from file paths. */
function countFiles(paths: readonly string[], read: (path: string) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of paths) {
    const n = countPins(read(p))
    if (n > 0) out[p] = n
  }
  return out
}

function above(current: Record<string, number>, base: Baseline): string[] {
  const out: string[] = []
  for (const [file, n] of Object.entries(current)) {
    const allowed = base.files[file]
    if (allowed === undefined) out.push(`${file}: ${n} pinned seed line(s) in a file with no baseline entry (use findSeed(pred) from test/seed-kit.ts, or a tuple)`)
    else if (n > allowed) out.push(`${file}: ${n} pinned seed lines, the baseline is ${allowed} (use findSeed(pred) from test/seed-kit.ts, or a tuple)`)
  }
  return out
}

function stale(current: Record<string, number>, base: Baseline): string[] {
  const out: string[] = []
  for (const [file, allowed] of Object.entries(base.files)) {
    const n = current[file] ?? 0
    if (allowed > n) out.push(`${file}: the baseline says ${allowed} but there are ${n} (run UPDATE_SEED_PINS=1 to lower it)`)
  }
  return out
}

/** The baseline lowered to the current counts. Throws on anything that would raise a count or add a file. */
function shrink(base: Baseline, current: Record<string, number>): Baseline {
  const up = above(current, base)
  if (up.length) throw new Error(`the seed-pin ratchet only goes down:\n${up.join('\n')}`)
  const files: Record<string, number> = {}
  for (const file of Object.keys(base.files).sort()) if (current[file]) files[file] = current[file]!
  return { v: 1, files }
}

/** One line per file, so a diff reads one file at a time. */
function format(b: Baseline): string {
  const rows = Object.entries(b.files).map(([file, n]) => `    ${JSON.stringify(file)}: ${n}`)
  return `{\n  "v": ${b.v},\n  "files": {\n${rows.join(',\n')}\n  }\n}\n`
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

const realCounts = (): Record<string, number> => countFiles(testFiles(), (p) => readFileSync(join(ROOT, p), 'utf8'))

describe('seed pins: the real tests', () => {
  it('has no more pinned seed lines per file than the baseline, and none in a new file', () => {
    const current = realCounts()
    if (process.env.UPDATE_SEED_PINS === '1') {
      writeFileSync(BASELINE_PATH, format(existsSync(BASELINE_PATH) ? shrink(readBaseline(), current) : { v: 1, files: current }))
    }
    expect(existsSync(BASELINE_PATH), 'test/seed-pins-baseline.json is missing: UPDATE_SEED_PINS=1 writes the first').toBe(true)
    const base = readBaseline()
    expect(base.v).toBe(1)
    expect(above(current, base)).toEqual([])
    expect(stale(current, base)).toEqual([])
  })

  it('reads a good many files, so an empty scan cannot pass', () => {
    const files = testFiles()
    expect(files.length).toBeGreaterThan(400)
    const current = realCounts()
    expect(Object.keys(current).length).toBeGreaterThan(30)
    expect(Object.values(current).reduce((s, n) => s + n, 0)).toBeGreaterThan(100)
  })

  it('does not read fixtures, this file or the seed kit, and the new R2 tests hold no pin', () => {
    const files = testFiles()
    expect(files).not.toContain('test/seed-pins.test.ts')
    expect(files).not.toContain('test/seed-kit.ts')
    expect(files).not.toContain('test/seed-kit.test.ts')
    expect(files.some((p) => p.startsWith('test/fixtures/'))).toBe(false)
    expect(files).toContain('test/kernel-streams.test.ts')
    expect(files).toContain('test/world-streams.test.ts')
    const current = realCounts()
    for (const f of files.filter((p) => /^test\/(r2-|kernel-streams|world-streams|text-pick-site)/.test(p))) {
      expect(current[f], f).toBeUndefined()
    }
  })

  it('is written with plain keys: the baseline lists test files only, with whole positive counts', () => {
    const base = readBaseline()
    for (const [file, n] of Object.entries(base.files)) {
      expect(file).toMatch(/^test\/[^]+\.tsx?$/)
      expect(existsSync(join(ROOT, file)), file).toBe(true)
      expect(Number.isInteger(n) && n > 0, file).toBe(true)
    }
  })
})

describe('seed pins: what counts', () => {
  const count = (text: string): number => countPins(text)

  it('counts a line that pins a seed, once, however many pins the line holds', () => {
    expect(count('const g = createNewLife({ seed: 7, birthYear: 1990 })')).toBe(1)
    expect(count('a({ seed: 7 }); b({ seed: 8 })')).toBe(1)
    expect(count('a({ seed: 7 })\nb({ seed: 8 })')).toBe(2)
    expect(count('{seed:808,year:1980}')).toBe(1)
    expect(count('startNewLife({ seed:   41, year: 1980 })')).toBe(1)
    expect(count('  seed: 123456,')).toBe(1)
  })

  it('counts a mention in a comment or a string, as the plain-text scan the plan names', () => {
    expect(count('// the old pin was seed: 5')).toBe(1)
    expect(count("const s = 'seed: 5'")).toBe(1)
  })

  it('does not count a seed that is a name, an expression or a longer word', () => {
    expect(count('createNewLife({ seed, birthYear: 1990 })')).toBe(0)
    expect(count('createNewLife({ seed: s })')).toBe(0)
    expect(count('createNewLife({ seed: findSeed(pred) })')).toBe(0)
    expect(count('createNewLife({ seed: base + 1 })')).toBe(0)
    expect(count('const seed = 7')).toBe(0)
    expect(count('makeTestGame(7)')).toBe(0)
    expect(count('const LIFE = [7, 1990] as const')).toBe(0)
    expect(count('reseed: 7')).toBe(0)
    expect(count('seeds: 7')).toBe(0)
    expect(count('seed: -7')).toBe(0)
  })
})

describe('seed pins: failing on a violation', () => {
  const base: Baseline = { v: 1, files: { 'test/old.test.ts': 2 } }
  const files = (o: Record<string, string>): Record<string, number> => countFiles(Object.keys(o), (p) => o[p]!)

  it('fails a new file that pins a seed', () => {
    const out = above(files({ 'test/new.test.ts': 'f({ seed: 7 })' }), base)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('test/new.test.ts')
    expect(out[0]).toContain('findSeed')
  })

  it('fails a file whose count grew', () => {
    expect(above(files({ 'test/old.test.ts': 'f({ seed: 1 })\ng({ seed: 2 })\nh({ seed: 3 })' }), base)).toHaveLength(1)
  })

  it('lets a file stay or shrink, and calls a shrunk entry stale', () => {
    expect(above(files({ 'test/old.test.ts': 'f({ seed: 1 })\ng({ seed: 2 })' }), base)).toEqual([])
    expect(stale(files({ 'test/old.test.ts': 'f({ seed: 1 })\ng({ seed: 2 })' }), base)).toEqual([])
    const shrunk = files({ 'test/old.test.ts': 'f({ seed: 1 })' })
    expect(above(shrunk, base)).toEqual([])
    expect(stale(shrunk, base)).toHaveLength(1)
    expect(stale({}, base)).toHaveLength(1)
  })

  it('shrink lowers an entry, drops a cleared file, and refuses to raise or to add', () => {
    expect(shrink({ v: 1, files: { 'test/a.test.ts': 3, 'test/b.test.ts': 1 } }, { 'test/a.test.ts': 2 })).toEqual({
      v: 1,
      files: { 'test/a.test.ts': 2 },
    })
    expect(() => shrink(base, { 'test/old.test.ts': 3 })).toThrow(/only goes down/)
    expect(() => shrink(base, { 'test/old.test.ts': 1, 'test/new.test.ts': 1 })).toThrow(/only goes down/)
  })

  it('writes one line per file, in path order', () => {
    const text = format({ v: 1, files: { 'test/a.test.ts': 2, 'test/b.test.ts': 1 } })
    expect(text).toBe('{\n  "v": 1,\n  "files": {\n    "test/a.test.ts": 2,\n    "test/b.test.ts": 1\n  }\n}\n')
    expect(JSON.parse(text)).toEqual({ v: 1, files: { 'test/a.test.ts': 2, 'test/b.test.ts': 1 } })
  })

  it('exempts fixtures, this file and the seed kit, and nothing else under test/', () => {
    expect(exempt('test/fixtures/save.json')).toBe(true)
    expect(exempt('test/seed-pins.test.ts')).toBe(true)
    expect(exempt('test/seed-kit.ts')).toBe(true)
    expect(exempt('test/seed-kit.test.ts')).toBe(true)
    expect(exempt('test/seed-kit-extra.ts')).toBe(true)
    expect(exempt('test/seed-pins-other.test.ts')).toBe(false)
    expect(exempt('test/kernel-streams.test.ts')).toBe(false)
    expect(exempt('test/seeds.test.ts')).toBe(false)
  })
})
