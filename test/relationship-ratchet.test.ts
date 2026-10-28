// ci: fast
// R4-E1 (D.3, X4): the relationship-write ratchet. R4 puts every change to `Person.relationship` behind one door in core.ts
// (addRelationship and setRelationship, R4-E5) so the Edge mirror can follow it. Before that door exists this test counts the ways
// round it, per file, by tokens only (a call written inside a string, a template or a comment is never seen):
//
//   addRelationship(      every call, in src/ and in test/        (the definition is not a call)
//   addRelationship(p, d) the calls with exactly two arguments, the shape of v5.2.0 (src/ and test/); R4-E5 gives every
//                         call a game argument and drives this count to 0, and a two-argument call in a new test is counted
//   bumpRelationship(     every call, in src/ and in test/        (wealth-core.ts has one, activities/common.ts another)
//   .relationship =  +=  -=  *=  /=  ++  --     raw writes, in src/ only (a test sets up a value by hand and that is fine), except
//                         in the two files of the door itself (core.ts and kernel/relations.ts, R4-E5), which are not counted
//
// The rules: a count above the file's entry in test/relationship-ratchet.json fails, and so does a nonzero count in a file with no
// entry. The baseline only goes down. Since R4-E5 the baseline holds no raw write and no two-argument call: every write to
// Person.relationship goes through addRelationship or setRelationship (both take the game), and one of the cases below says so. A test that needs a relationship change goes through the parity kit's applyDelta
// (test/social-parity-kit.ts), the one place an oracle file calls addRelationship.
//
// To lower the baseline after sites are migrated (it refuses to raise or add):
//   UPDATE_RELATIONSHIP_RATCHET=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/relationship-ratchet.test.ts
// To write the first baseline from the tree (only when the file is missing, as at R4-E1):
//   UPDATE_RELATIONSHIP_RATCHET=init /Users/saeed/projects/anotherlife/wt/bin/vt test/relationship-ratchet.test.ts
// A pure rename of a file means moving its entry by hand.
//
// Known gap: a write through Object.assign, a destructuring or a bracket key (`p['relationship'] = 1`) is invisible to a token
// scan. The golden rows of R4-E2 to R4-E4 measure that gap as drift.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, ROOT, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile } from './scan-kit'

const BASELINE_PATH = join(ROOT, 'test', 'relationship-ratchet.json')

const KEYS = [
  'addRelationship(',
  'addRelationship(p, d)',
  'bumpRelationship(',
  '.relationship =',
  '.relationship +=',
  '.relationship -=',
  '.relationship *=',
  '.relationship /=',
  '.relationship ++',
  '.relationship --',
] as const
type Key = (typeof KEYS)[number]
type Counts = Partial<Record<Key, number>>

interface Baseline {
  v: 1
  files: Record<string, Counts>
}

const CALLS = new Set<string>(['addRelationship', 'bumpRelationship'])
/** The two files that hold the one write: setRelationship and addRelationship wrap the primitives of the second (R4-E5). */
const DOOR_FILES: ReadonlySet<string> = new Set(['src/game/core.ts', 'src/game/kernel/relations.ts'])
const RAW_OPS = new Set<string>(['=', '+=', '-=', '*=', '/=', '++', '--'])

/** One place the scan looked at. */
interface Site {
  key: Key
  line: number
}

const isSrc = (path: string): boolean => path.startsWith('src/')
/** Raw writes are counted in src/ outside the door. */
const countsRaw = (path: string): boolean => isSrc(path) && !DOOR_FILES.has(path)

/** Every call and raw write of one file, in source order. Raw writes count in src/ only. */
function scan(src: SourceFile): Site[] {
  const out: Site[] = []
  const { toks, text } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_ID && CALLS.has(t.v) && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) {
      out.push({ key: `${t.v}(` as Key, line: lineOf(text, t.p) })
      if (t.v === 'addRelationship') {
        const close = closeParen(toks, i + 1)
        if (close > 0 && splitArgs(toks, i + 1, close).length === 2) out.push({ key: 'addRelationship(p, d)', line: lineOf(text, t.p) })
      }
    } else if (t.k === K_PUNCT && RAW_OPS.has(t.v) && countsRaw(src.path) && isId(toks[i - 1], 'relationship') && isPunct(toks[i - 2], '.')) {
      out.push({ key: `.relationship ${t.v}` as Key, line: lineOf(text, toks[i - 1]!.p) })
    }
  }
  return out
}

/** The nonzero counts of one file. */
function countFile(src: SourceFile): Counts {
  const out: Counts = {}
  for (const s of scan(src)) out[s.key] = (out[s.key] ?? 0) + 1
  return out
}

/** Counts per file, nonzero only, with the files in path order and the keys in KEYS order. */
function countAll(sources: readonly SourceFile[]): Record<string, Counts> {
  const out: Record<string, Counts> = {}
  for (const s of [...sources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const c = countFile(s)
    if (KEYS.some((k) => c[k])) out[s.path] = Object.fromEntries(KEYS.filter((k) => c[k]).map((k) => [k, c[k]!])) as Counts
  }
  return out
}

function violations(current: Record<string, Counts>, base: Baseline): string[] {
  const out: string[] = []
  for (const [file, counts] of Object.entries(current)) {
    const allowed = base.files[file]
    for (const k of KEYS) {
      const n = counts[k] ?? 0
      const cap = allowed?.[k] ?? 0
      if (n <= cap) continue
      out.push(allowed ? `${file}: ${k} is ${n}, the baseline is ${cap}` : `${file}: ${k} is ${n} in a file that has no entry (a new relationship write must go through the shim)`)
    }
  }
  return out
}

/** One line per file that now has fewer sites than its entry says. */
function notes(current: Record<string, Counts>, base: Baseline): string[] {
  const out: string[] = []
  for (const [file, allowed] of Object.entries(base.files)) {
    const now = current[file] ?? {}
    const less = KEYS.filter((k) => (now[k] ?? 0) < (allowed[k] ?? 0))
    if (less.length) out.push(`${file}: ${less.map((k) => `${k} ${allowed[k]} -> ${now[k] ?? 0}`).join(', ')}`)
  }
  return out
}

/** The baseline with every entry lowered to the current counts. Throws on anything that would raise a count or add a file. */
function shrink(base: Baseline, current: Record<string, Counts>): Baseline {
  const up = violations(current, base)
  if (up.length) throw new Error(`the relationship ratchet only goes down:\n${up.join('\n')}`)
  const files: Record<string, Counts> = {}
  for (const file of Object.keys(base.files).sort()) if (current[file]) files[file] = current[file]!
  return { v: 1, files }
}

/** One line per file, so a diff reads one file at a time. */
function format(b: Baseline): string {
  const rows = Object.entries(b.files).map(([file, c]) => `    ${JSON.stringify(file)}: { ${KEYS.filter((k) => c[k]).map((k) => `${JSON.stringify(k)}: ${c[k]}`).join(', ')} }`)
  return `{\n  "v": ${b.v},\n  "files": {\n${rows.join(',\n')}\n  }\n}\n`
}

/** The text an UPDATE_RELATIONSHIP_RATCHET run writes: `init` over a missing file, `1` lowers an existing one. */
function rewritten(mode: string, raw: string | null, current: Record<string, Counts>): string {
  if (mode === 'init') {
    if (raw !== null) throw new Error('UPDATE_RELATIONSHIP_RATCHET=init writes the first baseline only; use UPDATE_RELATIONSHIP_RATCHET=1 to lower it')
    return format({ v: 1, files: current })
  }
  if (mode === '1') {
    if (raw === null) throw new Error('UPDATE_RELATIONSHIP_RATCHET=1 lowers a baseline; run UPDATE_RELATIONSHIP_RATCHET=init first')
    return format(shrink(JSON.parse(raw) as Baseline, current))
  }
  throw new Error(`UPDATE_RELATIONSHIP_RATCHET is 1 or init, not ${mode}`)
}

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= [...loadSources(ROOT, 'src'), ...loadSources(ROOT, 'test')])
const countsOf = (code: string, path = 'src/game/fake.ts'): Counts => countFile(toSource(path, code))

const sum = (counts: Record<string, Counts>, key: Key, keep: (file: string) => boolean = () => true): number =>
  Object.entries(counts).reduce((n, [file, c]) => (keep(file) ? n + (c[key] ?? 0) : n), 0)
const filesWith = (counts: Record<string, Counts>, key: Key, keep: (file: string) => boolean = () => true): number =>
  Object.entries(counts).filter(([file, c]) => keep(file) && (c[key] ?? 0) > 0).length

describe('relationship ratchet: the real tree', () => {
  it('writes no more relationships round the shim than the baseline, and none in a new file', () => {
    const current = countAll(real())
    const mode = process.env.UPDATE_RELATIONSHIP_RATCHET
    if (mode) writeFileSync(BASELINE_PATH, rewritten(mode, existsSync(BASELINE_PATH) ? readFileSync(BASELINE_PATH, 'utf8') : null, current))
    const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
    expect(base.v, 'test/relationship-ratchet.json is missing or not version 1: run UPDATE_RELATIONSHIP_RATCHET=init once').toBe(1)
    const raw = KEYS.filter((k) => k.startsWith('.relationship')).reduce((n, k) => n + sum(current, k), 0)
    const rawFiles = new Set(Object.entries(current).filter(([, c]) => KEYS.some((k) => k.startsWith('.relationship') && c[k])).map(([f]) => f))
    console.info(
      `relationship ratchet: ${sum(current, 'addRelationship(')} addRelationship calls in ${filesWith(current, 'addRelationship(')} files, ` +
        `${sum(current, 'addRelationship(p, d)')} with two arguments, ${sum(current, 'bumpRelationship(')} bumpRelationship calls, ${raw} raw writes in ${rawFiles.size} files`,
    )
    expect(violations(current, base)).toEqual([])
    for (const n of notes(current, base)) console.info(`relationship ratchet: ${n} (UPDATE_RELATIONSHIP_RATCHET=1 lowers the baseline)`)
  })

  it('looks at a good many places, so an empty scan cannot pass', () => {
    const current = countAll(real())
    expect(sum(current, 'addRelationship(')).toBeGreaterThan(300)
    expect(filesWith(current, 'addRelationship(', isSrc)).toBeGreaterThan(50)
    expect(sum(current, 'bumpRelationship(')).toBeGreaterThan(5)
  })

  it('scans test/ as well as src/: the test callers are counted, and since R4-E5 none has two arguments', () => {
    const current = countAll(real())
    expect(current['test/core.test.ts']?.['addRelationship(']).toBeGreaterThanOrEqual(1)
    expect(current['test/core.test.ts']?.['addRelationship(p, d)']).toBeUndefined()
    expect(current['test/social-parity-kit.ts']?.['addRelationship(']).toBe(1)
  })

  it('leaves no raw write and no two-argument call: every change goes through the shim (R4-E5)', () => {
    const current = countAll(real())
    const raw = KEYS.filter((k) => k.startsWith('.relationship'))
    const rawLeft = Object.entries(current).flatMap(([file, c]) => raw.filter((k) => c[k]).map((k) => `${file}: ${k} ${c[k]}`))
    expect(rawLeft).toEqual([])
    expect(sum(current, 'addRelationship(p, d)')).toBe(0)
    expect(sum(current, 'addRelationship(')).toBeGreaterThan(300)
  })

  it('counts raw writes in src/ only', () => {
    const current = countAll(real())
    const rawIn = (keep: (file: string) => boolean): number => KEYS.filter((k) => k.startsWith('.relationship')).reduce((n, k) => n + sum(current, k, keep), 0)
    expect(rawIn((f) => !isSrc(f))).toBe(0)
  })
})

describe('relationship ratchet: what counts', () => {
  it('counts every call, and the two-argument form again', () => {
    expect(countsOf('addRelationship(p, 3)')).toEqual({ 'addRelationship(': 1, 'addRelationship(p, d)': 1 })
    expect(countsOf('x.addRelationship(p, f(a, b)); addRelationship(p, d)')).toEqual({ 'addRelationship(': 2, 'addRelationship(p, d)': 2 })
    expect(countsOf('addRelationship(g, p, 3)')).toEqual({ 'addRelationship(': 1 })
    expect(countsOf('addRelationship(g, p, 3, "offence")')).toEqual({ 'addRelationship(': 1 })
    expect(countsOf('addRelationship(...args)')).toEqual({ 'addRelationship(': 1 })
    expect(countsOf('bumpRelationship(p, -2); bumpRelationship(p, 1)')).toEqual({ 'bumpRelationship(': 2 })
  })

  it('does not count a definition, an import, a type, a string, a template or a comment', () => {
    expect(countsOf('export function addRelationship(p: Person, delta: number): void {}')).toEqual({})
    expect(countsOf('function bumpRelationship(g, p, lo, hi) {}')).toEqual({})
    expect(countsOf("import { addRelationship, bumpRelationship } from './core'")).toEqual({})
    expect(countsOf('const f = addRelationship')).toEqual({})
    expect(countsOf('const s = "addRelationship(p, 1)"; const t = `bumpRelationship(p, 1)`')).toEqual({})
    expect(countsOf('// addRelationship(p, 1)\n/* bumpRelationship(p, 1) */')).toEqual({})
  })

  it('does not count a raw write in the two files of the door', () => {
    expect(countsOf('p.relationship = Math.round(x)', 'src/game/core.ts')).toEqual({})
    expect(countsOf('p.relationship = value; q.relationship += 1', 'src/game/kernel/relations.ts')).toEqual({})
    expect(countsOf('p.relationship = 1', 'src/game/kernel/other.ts')).toEqual({ '.relationship =': 1 })
    expect(countsOf('addRelationship(g, p, 1)', 'src/game/core.ts')).toEqual({ 'addRelationship(': 1 })
  })

  it('counts a raw write of .relationship in src/, by its operator', () => {
    expect(countsOf('p.relationship = 5')).toEqual({ '.relationship =': 1 })
    expect(countsOf('p.relationship += 5; q.relationship -= 1; r.relationship *= 2; s.relationship /= 2')).toEqual({
      '.relationship +=': 1,
      '.relationship -=': 1,
      '.relationship *=': 1,
      '.relationship /=': 1,
    })
    expect(countsOf('p.relationship++; q.relationship--')).toEqual({ '.relationship ++': 1, '.relationship --': 1 })
    expect(countsOf('this.rows[i].person.relationship = clamp(x)')).toEqual({ '.relationship =': 1 })
  })

  it('does not count a read, a comparison, an object key or a write in a test', () => {
    expect(countsOf('if (p.relationship === 5 || q.relationship == 6 || r.relationship >= 7) go()')).toEqual({})
    expect(countsOf('const x = p.relationship; const f = (p) => p.relationship')).toEqual({})
    expect(countsOf('const o = { relationship: 5 }; const { relationship = 3 } = o')).toEqual({})
    expect(countsOf('p.relationship = 5; q.relationship += 1', 'test/some.test.ts')).toEqual({})
  })

  it('counts the calls of a test file', () => {
    expect(countsOf('addRelationship(p, Number.NaN)', 'test/some.test.ts')).toEqual({ 'addRelationship(': 1, 'addRelationship(p, d)': 1 })
  })
})

describe('relationship ratchet: the baseline file', () => {
  const base: Baseline = { v: 1, files: { 'src/a.ts': { 'addRelationship(': 3, '.relationship =': 2 }, 'src/b.ts': { 'bumpRelationship(': 1 } } }

  it('shrinks to the current counts and drops a file that has none left', () => {
    const next = shrink(base, { 'src/a.ts': { 'addRelationship(': 2, '.relationship =': 2 } })
    expect(next).toEqual({ v: 1, files: { 'src/a.ts': { 'addRelationship(': 2, '.relationship =': 2 } } })
  })

  it('refuses to raise a count or to add a file', () => {
    expect(() => shrink(base, { 'src/a.ts': { 'addRelationship(': 4, '.relationship =': 2 } })).toThrow(/only goes down/)
    expect(() => shrink(base, { 'src/c.ts': { 'bumpRelationship(': 1 } })).toThrow(/no entry/)
  })

  it('fails a count above its entry and a count in a file with no entry, and names the file', () => {
    expect(violations({ 'src/a.ts': { 'addRelationship(': 4 } }, base)).toEqual(['src/a.ts: addRelationship( is 4, the baseline is 3'])
    expect(violations({ 'src/z.ts': { '.relationship +=': 1 } }, base)[0]).toMatch(/^src\/z\.ts: \.relationship \+= is 1 in a file that has no entry/)
    expect(violations({ 'src/a.ts': { 'addRelationship(': 3 } }, base)).toEqual([])
  })

  it('init writes over a missing file only, and 1 needs a file', () => {
    const cur = { 'src/a.ts': { 'addRelationship(': 1 } } as Record<string, Counts>
    expect(JSON.parse(rewritten('init', null, cur))).toEqual({ v: 1, files: cur })
    expect(() => rewritten('init', format(base), cur)).toThrow(/first baseline only/)
    expect(() => rewritten('1', null, cur)).toThrow(/run UPDATE_RELATIONSHIP_RATCHET=init first/)
    expect(() => rewritten('2', format(base), cur)).toThrow(/is 1 or init/)
  })

  it('writes one line per file', () => {
    expect(format(base)).toBe('{\n  "v": 1,\n  "files": {\n    "src/a.ts": { "addRelationship(": 3, ".relationship =": 2 },\n    "src/b.ts": { "bumpRelationship(": 1 }\n  }\n}\n')
  })
})
