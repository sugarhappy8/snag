// ci: fast
// R1-C1: the permanent guard for the Charts track (R1-C1 to R1-C17). Every file the track adds is read as tokens
// (comments and strings never count) and must stay pure, deterministic, money-free and out of the import cycles:
//
//   - no U+2013 or U+2014 anywhere (docs/VOICE.md), comments included
//   - no Math.random, Date.now, new Date, .rng, rand(    (a chart is a pure read of settled years)
//   - no earnIncome, addMoney, spend(, .cash +=, .money +=    (a chart books no dollar)
//   - src/game/charts/*.ts: every relative runtime import is on the allow-list below, and none reaches
//     business/yearly, manage, economy or competition (members of the big import cycle)
//   - business/state.ts, economy.ts and competition.ts import nothing from a charts path
//
// The scan passes for a file that does not exist yet, so later tasks only have to add their file. The zone rule for
// src/ui/charts/ (nothing outside imports it except lazy.tsx) belongs to test/lazy-zones.test.ts.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K_ID, K_STR, ROOT, isId, isPunct, toSource, type SourceFile } from './scan-kit'

/** Directories whose every .ts and .tsx file is guarded. */
const GUARDED_DIRS = ['src/game/charts', 'src/ui/charts'] as const

/** Single files of the track that live elsewhere. Each is guarded once it exists. */
const GUARDED_FILES = [
  'src/game/life-series.ts',
  'src/game/business/books-menu.ts',
  'src/ui/components/LifeLine.tsx',
  'src/ui/minigames/bookModel.ts',
  'src/ui/minigames/yearEnd.ts',
] as const

/** The files R1-C1 itself adds or extends; if a path moved, the scan above would silently read nothing. */
const C1_FILES = ['src/game/charts/spec.ts', 'src/game/charts/reveal.ts', 'src/game/charts/money.ts', 'src/game/charts/index.ts'] as const

/** What src/game/charts/*.ts may import at runtime, besides its own siblings (./x). `import type` is always fine. */
const IMPORT_ALLOW: ReadonlySet<string> = new Set([
  '../types',
  '../core',
  '../flags',
  '../life-series',
  '../history/timeline',
  '../business/state',
  '../business/economic-report',
  '../business/franchise-state',
  '../business/lab-state',
  '../business/lab-text',
  '../business/dividend-policy',
  '../business/industries',
  '../business/util',
  '../business/competition-state',
])

/** Members of the 85-module import cycle (and the yearly step that calls the report builder): never imported by a chart file. */
const CYCLE_MEMBERS = ['../business/yearly', '../business/manage', '../business/economy', '../business/competition'] as const

// ---------------------------------------------------------------------------
// The scan

interface ImportRef {
  spec: string
  /** False for `import type` and `export type ... from`. */
  runtime: boolean
}

/** Every module this file imports or re-exports from, with whether it is a runtime import. */
function importsOf(src: SourceFile): ImportRef[] {
  const t = src.toks
  const out: ImportRef[] = []
  for (let i = 0; i < t.length; i++) {
    const tok = t[i]!
    if (tok.k !== K_ID || isPunct(t[i - 1], '.')) continue
    if (tok.v === 'import') {
      if (isPunct(t[i + 1], '(')) {
        const arg = t[i + 2]
        if (arg && arg.k === K_STR) out.push({ spec: arg.v, runtime: true })
        continue
      }
      if (isPunct(t[i + 1], '.')) continue
      const typeOnly = isId(t[i + 1], 'type') && !isId(t[i + 2], 'from')
      for (let j = i + 1; j < t.length; j++) {
        if (t[j]!.k === K_STR) {
          out.push({ spec: t[j]!.v, runtime: !typeOnly })
          break
        }
      }
    } else if (tok.v === 'export') {
      const next = t[i + 1]
      if (isId(next, 'type')) {
        // `export type { X } from 'y'` is type only; find its module so a charts path is still seen.
        for (let j = i + 2; j < Math.min(t.length, i + 400); j++) {
          if (isPunct(t[j], ';') || isId(t[j], 'export')) break
          if (isId(t[j], 'from') && t[j + 1]?.k === K_STR) {
            out.push({ spec: t[j + 1]!.v, runtime: false })
            break
          }
        }
      } else if (isPunct(next, '*')) {
        for (let j = i + 2; j < Math.min(t.length, i + 8); j++) {
          if (isId(t[j], 'from') && t[j + 1]?.k === K_STR) {
            out.push({ spec: t[j + 1]!.v, runtime: true })
            break
          }
        }
      } else if (isPunct(next, '{')) {
        let close = i + 2
        while (close < t.length && !isPunct(t[close], '}')) close++
        if (isId(t[close + 1], 'from') && t[close + 2]?.k === K_STR) out.push({ spec: t[close + 2]!.v, runtime: true })
      }
    }
  }
  return out
}

/** The banned constructs in one file, by name. Tokens only, so a mention in a comment or a string is fine. */
function bannedUses(src: SourceFile): string[] {
  const t = src.toks
  const found = new Set<string>()
  for (let i = 0; i < t.length; i++) {
    const tok = t[i]!
    if (tok.k === K_ID) {
      const next = t[i + 1]
      const afterDot = isPunct(t[i - 1], '.') || isPunct(t[i - 1], '?.')
      if (tok.v === 'Math' && isPunct(next, '.') && isId(t[i + 2], 'random')) found.add('Math.random')
      else if (tok.v === 'Date' && isPunct(next, '.') && isId(t[i + 2], 'now')) found.add('Date.now')
      else if (tok.v === 'new' && isId(next, 'Date')) found.add('new Date')
      else if (tok.v === 'rng' && afterDot) found.add('.rng')
      else if (tok.v === 'rand' && isPunct(next, '(') && !isId(t[i - 1], 'function')) found.add('rand(')
      else if (tok.v === 'earnIncome' || tok.v === 'addMoney') found.add(tok.v)
      else if (tok.v === 'spend' && isPunct(next, '(') && !isId(t[i - 1], 'function')) found.add('spend(')
      else if ((tok.v === 'cash' || tok.v === 'money') && afterDot && isPunct(next, '+=')) found.add(`.${tok.v} +=`)
    }
  }
  return [...found]
}

/** Runtime imports of a src/game/charts/*.ts file that are neither a sibling nor on the allow-list. */
function offAllowList(src: SourceFile): string[] {
  return importsOf(src)
    .filter((m) => m.runtime && m.spec.startsWith('.') && !m.spec.startsWith('./') && !IMPORT_ALLOW.has(m.spec))
    .map((m) => m.spec)
}

function cycleImports(src: SourceFile): string[] {
  return importsOf(src)
    .filter((m) => m.runtime && (CYCLE_MEMBERS as readonly string[]).includes(m.spec))
    .map((m) => m.spec)
}

const CHARTS_PATH = /(^|\/)charts(\/|$)/
function chartsImports(src: SourceFile): string[] {
  return importsOf(src)
    .filter((m) => CHARTS_PATH.test(m.spec))
    .map((m) => m.spec)
}

const DASH = /[\u2013\u2014]/

// ---------------------------------------------------------------------------
// The real files

function sourceFile(path: string): SourceFile {
  return toSource(path, readFileSync(join(ROOT, path), 'utf8'))
}

function walk(dir: string, into: string[]): void {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = relative(ROOT, join(abs, e.name)).split(sep).join('/')
    if (e.isDirectory()) walk(rel, into)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) into.push(rel)
  }
}

function guardedPaths(): string[] {
  const paths: string[] = []
  for (const d of GUARDED_DIRS) walk(d, paths)
  for (const f of GUARDED_FILES) if (existsSync(join(ROOT, f))) paths.push(f)
  return paths.sort()
}

describe('chart hygiene: the real files', () => {
  const paths = guardedPaths()
  const files = paths.map(sourceFile)
  const gameCharts = files.filter((f) => /^src\/game\/charts\/[^/]+\.ts$/.test(f.path))

  it('reads the files R1-C1 adds (so a moved path cannot make the scan vacuous)', () => {
    for (const f of C1_FILES) expect(paths, f).toContain(f)
    expect(gameCharts.length).toBeGreaterThanOrEqual(C1_FILES.length)
  })

  it('has no en-dash or em-dash character', () => {
    for (const f of files) expect(DASH.test(f.text), f.path).toBe(false)
  })

  it('reads no clock or random number, no rng, and books no dollar', () => {
    for (const f of files) expect(bannedUses(f), f.path).toEqual([])
  })

  it('imports at runtime only what the allow-list names (type imports are free)', () => {
    for (const f of gameCharts) expect(offAllowList(f), f.path).toEqual([])
  })

  it('never imports yearly, manage, economy or competition at runtime', () => {
    for (const f of gameCharts) expect(cycleImports(f), f.path).toEqual([])
  })

  it('is not imported by the business modules the charts read (state, economy, competition)', () => {
    for (const p of ['src/game/business/state.ts', 'src/game/business/economy.ts', 'src/game/business/competition.ts']) {
      expect(existsSync(join(ROOT, p)), p).toBe(true)
      expect(chartsImports(sourceFile(p)), p).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// The scan itself must be able to fail, so each rule is shown on a synthetic file.

describe('chart hygiene: the scanner', () => {
  const at = (path: string, text: string) => toSource(path, text)

  it('finds each banned construct in code', () => {
    const cases: [string, string][] = [
      ['Math.random', 'const r = Math.random()'],
      ['Date.now', 'const t = Date.now()'],
      ['new Date', 'const d = new Date(0)'],
      ['.rng', 'const s = g.rng'],
      ['.rng', 'const s = g?.rng'],
      ['rand(', 'const n = rand(g)'],
      ['earnIncome', 'import { earnIncome } from "../economy"'],
      ['addMoney', 'addMoney(g, 5)'],
      ['spend(', 'spend(g, 5)'],
      ['.cash +=', 'b.cash += 5'],
      ['.money +=', 'g.character.money += 5'],
    ]
    for (const [name, code] of cases) expect(bannedUses(at('src/game/charts/x.ts', code)), code).toContain(name)
  })

  it('ignores the same words in comments, strings and unrelated names', () => {
    const code = [
      '// Math.random, Date.now, new Date, g.rng, rand(, earnIncome, spend(, b.cash += 1',
      'const note = "Math.random() and b.cash += 1"',
      'const t = `${1} earnIncome spend(`',
      'const spender = 1, grand = 2, random = 3, cashier = 4',
      'function spend(x: number) { return x }',
      'const cash = 5, money = 6',
      'const total = cash + money',
    ].join('\n')
    expect(bannedUses(at('src/game/charts/x.ts', code))).toEqual([])
  })

  it('reads runtime and type imports and re-exports', () => {
    const code = [
      'import { a } from "../core"',
      'import type { B } from "../business/economy"',
      'import C from "./spec"',
      'import "../side"',
      'import { type D } from "../business/competition"',
      'export * from "./money"',
      'export { e } from "../business/manage"',
      'export type { F } from "../business/yearly"',
      'export const x = "../not/an/import"',
      'const lazy = import("../business/yearly")',
    ].join('\n')
    const got = importsOf(at('src/game/charts/x.ts', code))
    expect(got).toEqual([
      { spec: '../core', runtime: true },
      { spec: '../business/economy', runtime: false },
      { spec: './spec', runtime: true },
      { spec: '../side', runtime: true },
      { spec: '../business/competition', runtime: true },
      { spec: './money', runtime: true },
      { spec: '../business/manage', runtime: true },
      { spec: '../business/yearly', runtime: false },
      { spec: '../business/yearly', runtime: true },
    ])
  })

  it('flags an import that is off the allow-list or in the cycle, and lets siblings and types through', () => {
    const bad = at(
      'src/game/charts/x.ts',
      'import { a } from "../business/economy"\nimport { b } from "../world"\nimport { c } from "../business/competition-state"\nimport { d } from "./spec"',
    )
    expect(offAllowList(bad)).toEqual(['../business/economy', '../world'])
    expect(cycleImports(bad)).toEqual(['../business/economy'])
    const fine = at(
      'src/game/charts/y.ts',
      'import type { A } from "../business/economy"\nimport type { M } from "../business/competition"\nimport { n } from "../business/util"\nimport { s } from "./spec"',
    )
    expect(offAllowList(fine)).toEqual([])
    expect(cycleImports(fine)).toEqual([])
    // competition-state is allowed; competition itself is not.
    expect(cycleImports(at('src/game/charts/z.ts', 'import { x } from "../business/competition"'))).toEqual(['../business/competition'])
  })

  it('sees a charts path in any kind of import', () => {
    expect(chartsImports(at('src/game/business/state.ts', 'import type { S } from "../charts/spec"'))).toEqual(['../charts/spec'])
    expect(chartsImports(at('src/game/business/state.ts', 'import { x } from "./charts"'))).toEqual(['./charts'])
    expect(chartsImports(at('src/game/business/state.ts', 'import { x } from "./chartsy"'))).toEqual([])
  })

  it('spots a dash character', () => {
    expect(DASH.test('a \u2014 b')).toBe(true)
    expect(DASH.test('a \u2013 b')).toBe(true)
    expect(DASH.test('a - b')).toBe(false)
  })
})
