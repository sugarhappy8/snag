// ci: fast
// R1-P5 (X.G1): the money ratchet. Every dollar is booked once, and the places that book money may only shrink.
// It counts, per file of src/ (never tests, never .d.ts), by tokens only:
//
//   earnIncome(   addMoney(   spend(     call sites (a declaration after `function` is skipped)
//   .cash +=      .money +=              compound assignments on any receiver
//
// A count above the file's entry in test/money-ratchet.json fails, and so does a nonzero count in a file that has no
// entry (a new file). A count below the baseline passes with a note. The receiver is not named on purpose: renaming
// `b.cash` to `biz.cash` must not dodge the ratchet.
//
// To shrink the baseline after money paths are removed (it refuses to raise):
//   UPDATE_MONEY_RATCHET=1 npx vitest run --maxWorkers=1 test/money-ratchet.test.ts
// A pure rename of a file means moving its entry by hand.
//
// Known gap: a direct assignment such as `c.money = c.money + x` is not counted. R2's reasoned-call ratchet replaces
// this test.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, ROOT, isId, isPunct, loadSources, toSource, type SourceFile } from './scan-kit'

const BASELINE_PATH = join(ROOT, 'test', 'money-ratchet.json')

const KEYS = ['earnIncome', 'addMoney', 'spend', '.cash +=', '.money +='] as const
type Key = (typeof KEYS)[number]
type Counts = Partial<Record<Key, number>>

interface Baseline {
  v: 1
  files: Record<string, Counts>
}

interface Violation {
  file: string
  key: Key | null
  count: number
  allowed: number
  text: string
}

const CALLS = new Set<string>(['earnIncome', 'addMoney', 'spend'])

/** The nonzero counts of one file. */
function countFile(src: SourceFile): Counts {
  const out: Counts = {}
  const bump = (k: Key): void => {
    out[k] = (out[k] ?? 0) + 1
  }
  const { toks } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_ID && CALLS.has(t.v) && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) bump(t.v as Key)
    else if (t.k === K_PUNCT && t.v === '+=' && isPunct(toks[i - 2], '.') && toks[i - 1]!.k === K_ID) {
      if (toks[i - 1]!.v === 'cash') bump('.cash +=')
      else if (toks[i - 1]!.v === 'money') bump('.money +=')
    }
  }
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

function violations(current: Record<string, Counts>, base: Baseline): Violation[] {
  const out: Violation[] = []
  for (const [file, counts] of Object.entries(current)) {
    const allowed = base.files[file]
    for (const k of KEYS) {
      const n = counts[k] ?? 0
      const cap = allowed?.[k] ?? 0
      if (n <= cap) continue
      out.push({
        file,
        key: k,
        count: n,
        allowed: cap,
        text: allowed
          ? `${file}: ${k} is ${n}, the baseline is ${cap}`
          : `${file}: ${k} is ${n} in a file that has no entry (a new file books money)`,
      })
    }
  }
  return out
}

/** One line per file that now books less than its entry says. */
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
  if (up.length) throw new Error(`the money ratchet only goes down:\n${up.map((v) => v.text).join('\n')}`)
  const files: Record<string, Counts> = {}
  for (const file of Object.keys(base.files).sort()) if (current[file]) files[file] = current[file]!
  return { v: 1, files }
}

/** One line per file, so a diff reads one file at a time. */
function format(b: Baseline): string {
  const rows = Object.entries(b.files).map(([file, c]) => `    ${JSON.stringify(file)}: { ${KEYS.filter((k) => c[k]).map((k) => `${JSON.stringify(k)}: ${c[k]}`).join(', ')} }`)
  return `{\n  "v": ${b.v},\n  "files": {\n${rows.join(',\n')}\n  }\n}\n`
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())
const countsOf = (code: string, path = 'src/game/fake.ts'): Counts => countFile(toSource(path, code))

describe('money ratchet: the real source', () => {
  it('books no more money than the baseline, and no money in a new file', () => {
    const current = countAll(real())
    if (process.env.UPDATE_MONEY_RATCHET === '1') {
      writeFileSync(BASELINE_PATH, format(existsSync(BASELINE_PATH) ? shrink(readBaseline(), current) : { v: 1, files: current }))
    }
    const base = readBaseline()
    expect(violations(current, base).map((v) => v.text)).toEqual([])
    for (const n of notes(current, base)) console.info(`money ratchet: ${n} (UPDATE_MONEY_RATCHET=1 lowers the baseline)`)
  })

  it('counts a good many places, so an empty scan cannot pass', () => {
    const total = Object.values(countAll(real())).reduce((sum, c) => sum + KEYS.reduce((s, k) => s + (c[k] ?? 0), 0), 0)
    expect(total).toBeGreaterThan(400)
    expect(Object.keys(countAll(real())).length).toBeGreaterThan(100)
  })
})

describe('money ratchet: what counts', () => {
  it('counts a call to each of the three, with or without a receiver', () => {
    expect(countsOf('earnIncome(g, 5)')).toEqual({ earnIncome: 1 })
    expect(countsOf('addMoney(g, 5); ctx.addMoney(g, 6)')).toEqual({ addMoney: 2 })
    expect(countsOf('spend(g, 5, "x"); spend(g, 1)')).toEqual({ spend: 2 })
  })

  it('counts a compound assignment on any receiver', () => {
    expect(countsOf('a.cash += 1')).toEqual({ '.cash +=': 1 })
    expect(countsOf('p.money += 2')).toEqual({ '.money +=': 1 })
    expect(countsOf('g.character.money += 3')).toEqual({ '.money +=': 1 })
    expect(countsOf('b.cash+=1; biz.cash += 2')).toEqual({ '.cash +=': 2 })
    expect(countsOf('x.y.z.cash += 4; this.money += 5')).toEqual({ '.cash +=': 1, '.money +=': 1 })
  })

  it('does not count a declaration, a longer name, a method of another name, or a plain variable', () => {
    expect(countsOf('function spend(g: GameState, n: number) { return n }')).toEqual({})
    expect(countsOf('export async function earnIncome(g: GameState) {}')).toEqual({})
    expect(countsOf('overspend(g, 1)')).toEqual({})
    expect(countsOf('x.spent(1)')).toEqual({})
    expect(countsOf('myAddMoney(g, 1); spendable(g)')).toEqual({})
    expect(countsOf('const spend = 3; import { addMoney } from "./core"; export { earnIncome }')).toEqual({})
    expect(countsOf('let cash = 0; cash += 5; money += 6')).toEqual({})
    expect(countsOf('a.cash -= 1; a.money = a.money + 1; a.cashier += 1; a.moneyBack += 1')).toEqual({})
    expect(countsOf('const f = spend')).toEqual({})
  })

  it('does not count a mention in a comment, a string or a template', () => {
    expect(countsOf('// earnIncome(g, 5); a.cash += 1')).toEqual({})
    expect(countsOf('/* addMoney(g, 5) and spend(g, 1) and p.money += 2 */')).toEqual({})
    expect(countsOf("const s = 'earnIncome(g, 5)'; const t = \"a.cash += 1\"")).toEqual({})
    expect(countsOf('const u = `spend(g, 1) then p.money += 2`')).toEqual({})
    expect(countsOf('const v = `${addMoney(g, 1)}`')).toEqual({ addMoney: 1 })
  })

  it('counts calls inside TSX, and sorts files and keys when it totals a tree', () => {
    const tree = countAll([
      toSource('src/z.ts', 'spend(g, 1); earnIncome(g, 2); a.money += 3'),
      toSource('src/a.tsx', 'export const X = () => <b onClick={() => addMoney(g, 1)} />'),
      toSource('src/none.ts', 'export const y = 1'),
    ])
    expect(Object.keys(tree)).toEqual(['src/a.tsx', 'src/z.ts'])
    expect(tree['src/z.ts']).toEqual({ earnIncome: 1, spend: 1, '.money +=': 1 })
    expect(Object.keys(tree['src/z.ts']!)).toEqual(['earnIncome', 'spend', '.money +='])
    expect(tree['src/a.tsx']).toEqual({ addMoney: 1 })
  })
})

describe('money ratchet: failing on a violation', () => {
  const base: Baseline = { v: 1, files: { 'src/game/old.ts': { earnIncome: 2, spend: 1 } } }
  const check = (code: string, path: string): string[] => violations(countAll([toSource(path, code)]), base).map((v) => v.text)

  it('fails a new file that books money (D.11 criterion 10)', () => {
    const out = check('earnIncome(g, 5)', 'src/game/new.ts')
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('src/game/new.ts')
    expect(out[0]).toContain('no entry')
    expect(check('p.money += 2', 'src/game/new.ts')).toHaveLength(1)
  })

  it('fails a baseline file one above its count, passes it at its count and below', () => {
    expect(check('earnIncome(g, 1); earnIncome(g, 2); earnIncome(g, 3); spend(g, 1)', 'src/game/old.ts')).toEqual(['src/game/old.ts: earnIncome is 3, the baseline is 2'])
    expect(check('earnIncome(g, 1); earnIncome(g, 2); spend(g, 1)', 'src/game/old.ts')).toEqual([])
    expect(check('earnIncome(g, 1)', 'src/game/old.ts')).toEqual([])
    expect(check('export const nothing = 1', 'src/game/old.ts')).toEqual([])
  })

  it('fails a kind the file did not book before, even when the file is in the baseline', () => {
    expect(check('addMoney(g, 1)', 'src/game/old.ts')).toEqual(['src/game/old.ts: addMoney is 1, the baseline is 0'])
  })

  it('notes a file that books less than its entry, and stays quiet otherwise', () => {
    expect(notes(countAll([toSource('src/game/old.ts', 'earnIncome(g, 1)')]), base)).toEqual(['src/game/old.ts: earnIncome 2 -> 1, spend 1 -> 0'])
    expect(notes(countAll([toSource('src/game/old.ts', 'earnIncome(g, 1); earnIncome(g, 2); spend(g, 1)')]), base)).toEqual([])
    expect(notes({}, base)).toEqual(['src/game/old.ts: earnIncome 2 -> 0, spend 1 -> 0'])
  })
})

describe('money ratchet: updating the baseline', () => {
  const base: Baseline = { v: 1, files: { 'src/a.ts': { earnIncome: 3, spend: 1 }, 'src/b.ts': { addMoney: 2 }, 'src/gone.ts': { spend: 1 } } }

  it('lowers counts, drops a file that no longer books money, and keeps the rest', () => {
    const now = countAll([toSource('src/a.ts', 'earnIncome(g, 1); spend(g, 1)'), toSource('src/b.ts', 'addMoney(g, 1); addMoney(g, 2)')])
    expect(shrink(base, now)).toEqual({ v: 1, files: { 'src/a.ts': { earnIncome: 1, spend: 1 }, 'src/b.ts': { addMoney: 2 } } })
  })

  it('refuses to raise a count or add a file', () => {
    expect(() => shrink(base, countAll([toSource('src/b.ts', 'addMoney(g, 1); addMoney(g, 2); addMoney(g, 3)')]))).toThrow(/only goes down/)
    expect(() => shrink(base, countAll([toSource('src/new.ts', 'spend(g, 1)')]))).toThrow(/src\/new\.ts/)
  })

  it('writes one line per file and reads back what it wrote', () => {
    const text = format(base)
    expect(text.split('\n')).toHaveLength(Object.keys(base.files).length + 6)
    expect(JSON.parse(text)).toEqual(base)
    expect(format(JSON.parse(text) as Baseline)).toBe(text)
    expect(text).toContain('"src/a.ts": { "earnIncome": 3, "spend": 1 }')
  })
})

describe('money ratchet: the baseline file', () => {
  it('is sorted, has positive whole numbers, known keys in order, and points at files that exist', () => {
    const base = readBaseline()
    const sources = new Map(real().map((s) => [s.path, s]))
    expect(base.v).toBe(1)
    const files = Object.keys(base.files)
    expect(files.length).toBeGreaterThan(100)
    expect(files).toEqual([...files].sort())
    for (const file of files) {
      expect(sources.has(file), `${file} is gone: move its entry by hand`).toBe(true)
      const keys = Object.keys(base.files[file]!)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys, file).toEqual(KEYS.filter((k) => keys.includes(k)))
      for (const k of keys) {
        const n = base.files[file]![k as Key]!
        expect(Number.isInteger(n) && n > 0, `${file} ${k} = ${n}`).toBe(true)
      }
    }
  })

  it('is written the way the update writes it, so a diff shows only the files that changed', () => {
    expect(readFileSync(BASELINE_PATH, 'utf8')).toBe(format(readBaseline()))
  })

  it('is anchored to the guard lines of the roadmap (spot checks of the merged R0 tree)', () => {
    const base = readBaseline()
    const at = (file: string, ...keys: Key[]): number => keys.reduce((sum, k) => sum + (base.files[file]?.[k] ?? 0), 0)
    // R0-1: bought followers no longer pay, social.ts books three earnIncome calls.
    expect(at('src/game/special/social.ts', 'earnIncome')).toBe(3)
    // R0-7: one endorsement payout and one Olympic bonus, each booked once.
    expect(at('src/game/special/sports-core.ts', 'earnIncome')).toBe(1)
    expect(at('src/game/special/sports-olympics.ts', 'earnIncome')).toBe(1)
    // R0-12: military pay is one earn and one add, the Street Hustler takes are the other six.
    expect(at('src/game/special/military.ts', 'earnIncome', 'addMoney')).toBe(2)
    expect(at('src/game/special/hustler.ts', 'addMoney', 'spend')).toBe(6)
  })
})
