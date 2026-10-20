// ci: fast
// R1-P5 (X.G1, decision D12): nothing in the game reads a year after g.year, except the Investing talent's gut
// (invest/instinct.ts). Three guards hold that line.
//
//   1. A token scan of src/ for the four market readers (exchangeYear, cryptoYear, goldYear, fxYear). Rule 1 flags a
//      `+ N` (N at least 1) inside the arguments. Rule 2 flags a bare identifier in the year slot that an earlier
//      `const|let` in the same file (within 40 lines) built as `<year-like name> + N`. The scan reads tokens, so a
//      mention in a string, a template or a comment never counts.
//   2. A fence: only four files may import invest/instinct, so the gut cannot spread to a menu that has no talent check.
//   3. A runtime spy: lives rendered with every menu and every pure read ask for no year after g.year without the talent,
//      and for g.year + 1 (never more) with it.
//
// A new exemption needs the owner's decision. The lists below are named constants with their reasons on purpose.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ years: [] as number[] }))

// The spy wraps the four readers and records the year each call asked for (the pattern of analyst-tip.test.ts).
vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    exchangeYear: (...args: Parameters<typeof real.exchangeYear>) => {
      asked.years.push(args[3])
      return real.exchangeYear(...args)
    },
    cryptoYear: (...args: Parameters<typeof real.cryptoYear>) => {
      asked.years.push(args[2])
      return real.cryptoYear(...args)
    },
    goldYear: (...args: Parameters<typeof real.goldYear>) => {
      asked.years.push(args[2])
      return real.goldYear(...args)
    },
    fxYear: (...args: Parameters<typeof real.fxYear>) => {
      asked.years.push(args[2])
      return real.fxYear(...args)
    },
  }
})

import type { GameState } from '../src/game/types'
import { FailureLog, renderAll } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { K_ID, K_NUM, K_PUNCT, K_STR, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'

// ---------------------------------------------------------------------------
// The scan

/** The watched readers, and where the year sits among their arguments (0-based). */
const WATCHED: Readonly<Record<string, number>> = { exchangeYear: 3, cryptoYear: 2, goldYear: 2, fxYear: 2 }

/** Files the scan skips. Exactly one, on purpose. */
const EXEMPT_FILES: readonly { file: string; why: string }[] = [
  { file: 'src/game/invest/instinct.ts', why: 'the Investing gut reads next year by design (D12); marketInstinct returns null without the talent' },
]

/** Year aliases the scan lets through: a binding that builds `year + 1` on purpose. */
const EXEMPT_ALIASES: readonly { file: string; id: string; why: string }[] = [
  {
    file: 'src/game/computer/money-stocks.ts',
    id: 'year',
    why: 'settlePrice settles a bet one year after it was placed; its caller only settles bets with bet.year < g.year (line 353)',
  },
]

/** Files that may import invest/instinct (F16). A fifth importer fails the fence. */
const INSTINCT_IMPORTERS: readonly string[] = [
  'src/game/investments.ts',
  'src/game/business/fund-events.ts',
  'src/game/computer/money-options.ts',
  'src/game/computer/money-stocks.ts',
]

const INSTINCT_MODULE = 'src/game/invest/instinct'
const GATE_LINE = 177
const FENCE_MESSAGE = `the Investing gut reads next year; keep it behind the talent (\`hasTalent(g, 'Investing')\` at instinct.ts:${GATE_LINE})`

/** How many lines above the call an alias binding may sit. */
const ALIAS_WINDOW = 40

interface Violation {
  file: string
  line: number
  rule: 'direct' | 'alias' | 'unreadable' | 'fence'
  text: string
}

const describeAll = (vs: readonly Violation[]): string[] => vs.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`)

function numberOf(t: Tok | undefined): number {
  return t !== undefined && t.k === K_NUM ? Number(t.v.replace(/_/g, '')) : NaN
}

/** True when a `+` is followed by a number of 1 or more somewhere in the tokens. */
function hasPlusN(toks: readonly Tok[]): boolean {
  for (let i = 0; i + 1 < toks.length; i++) if (isPunct(toks[i], '+') && numberOf(toks[i + 1]) >= 1) return true
  return false
}

/** An identifier that names a year: `y`, or anything with "year" in it (case does not matter). */
const yearish = (t: Tok | undefined): boolean => t !== undefined && t.k === K_ID && (t.v === 'y' || /year/i.test(t.v))

/** True when the tokens hold `<year-like name> + N` with N at least 1. */
function hasYearPlusN(toks: readonly Tok[]): boolean {
  for (let i = 0; i + 2 < toks.length; i++) if (yearish(toks[i]) && isPunct(toks[i + 1], '+') && numberOf(toks[i + 2]) >= 1) return true
  return false
}

const CONTINUES = new Set(['+', '-', '*', '/', '%', '**', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '??', '?', ':', '.', '?.', '&', '|', '^', '<<', '>>', '>>>', '=>', ','])

/** The end (exclusive) of the expression that starts at `start`: a `;`, a `,` at the top level, or a new line that does not continue it. */
function exprEnd(toks: readonly Tok[], start: number): number {
  let depth = 0
  for (let j = start; j < toks.length; j++) {
    const t = toks[j]!
    if (t.k === K_PUNCT) {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++
      else if (t.v === ')' || t.v === ']' || t.v === '}') {
        if (depth === 0) return j
        depth--
      } else if (depth === 0 && (t.v === ';' || t.v === ',') && j > start) return j
    }
    if (depth === 0 && j > start && t.nl) {
      const prev = toks[j - 1]!
      const joins = (t.k === K_PUNCT && CONTINUES.has(t.v)) || (prev.k === K_PUNCT && CONTINUES.has(prev.v)) || isId(t, 'as') || isId(t, 'satisfies')
      if (!joins) return j
    }
  }
  return toks.length
}

/** The nearest `const|let <id> = <expr>` above the call, within the window: the tokens of its expression, or null. */
function bindingOf(src: SourceFile, id: string, callAt: number): readonly Tok[] | null {
  const { toks, text } = src
  const callLine = lineOf(text, toks[callAt]!.p)
  for (let i = callAt - 1; i >= 0; i--) {
    const t = toks[i]!
    if (!(isId(t, 'const') || isId(t, 'let')) || !isId(toks[i + 1], id)) continue
    if (callLine - lineOf(text, t.p) > ALIAS_WINDOW) return null
    let j = i + 2
    if (isPunct(toks[j], ':')) {
      while (j < toks.length && j < i + 14 && !isPunct(toks[j], '=')) j++
    }
    if (!isPunct(toks[j], '=')) continue
    return toks.slice(j + 1, exprEnd(toks, j + 1))
  }
  return null
}

/** Every watched call that reads past g.year, minus the exemptions. */
function foresightViolations(sources: readonly SourceFile[], exempt = true): Violation[] {
  const out: Violation[] = []
  for (const src of sources) {
    if (exempt && EXEMPT_FILES.some((e) => e.file === src.path)) continue
    const { toks } = src
    for (let i = 0; i + 1 < toks.length; i++) {
      const t = toks[i]!
      if (t.k !== K_ID || !Object.hasOwn(WATCHED, t.v) || !isPunct(toks[i + 1], '(') || isId(toks[i - 1], 'function')) continue
      const line = lineOf(src.text, t.p)
      const open = i + 1
      const close = closeParen(toks, open)
      if (close < 0) {
        out.push({ file: src.path, line, rule: 'unreadable', text: `${t.v}( never closes` })
        continue
      }
      if (hasPlusN(toks.slice(open + 1, close))) {
        out.push({ file: src.path, line, rule: 'direct', text: `${t.v} is asked for a year after g.year` })
        continue
      }
      const arg = splitArgs(toks, open, close)[WATCHED[t.v]!]
      if (!arg || arg.length !== 1 || arg[0]!.k !== K_ID) continue
      const id = arg[0]!.v
      const bound = bindingOf(src, id, i)
      if (!bound || !hasYearPlusN(bound)) continue
      if (exempt && EXEMPT_ALIASES.some((e) => e.file === src.path && e.id === id)) continue
      out.push({ file: src.path, line, rule: 'alias', text: `${t.v} is asked for \`${id}\`, which is built as a year plus N above` })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The fence

/** The module a string token names when it follows `from`, `import`, `import(` or `require(`; null otherwise. */
function specifiers(src: SourceFile): { spec: string; at: number }[] {
  const out: { spec: string; at: number }[] = []
  src.toks.forEach((t, i) => {
    if (t.k !== K_STR || t.attr) return
    const p = src.toks[i - 1]
    const viaCall = isPunct(p, '(') && (isId(src.toks[i - 2], 'import') || isId(src.toks[i - 2], 'require'))
    if (isId(p, 'from') || isId(p, 'import') || viaCall) out.push({ spec: t.v, at: t.p })
  })
  return out
}

/** Repo-relative module path (no extension) that a relative specifier in `from` points at; null for a package. */
function resolveModule(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const dirs = from.split('/').slice(0, -1)
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') dirs.pop()
    else dirs.push(part)
  }
  return dirs.join('/').replace(/\.(?:tsx?|mjs|js)$/, '')
}

function instinctImporters(sources: readonly SourceFile[]): string[] {
  return sources.filter((s) => specifiers(s).some((x) => resolveModule(s.path, x.spec) === INSTINCT_MODULE)).map((s) => s.path)
}

function fenceViolations(sources: readonly SourceFile[]): Violation[] {
  const out: Violation[] = []
  for (const src of sources) {
    if (INSTINCT_IMPORTERS.includes(src.path) || src.path === `${INSTINCT_MODULE}.ts`) continue
    for (const x of specifiers(src)) {
      if (resolveModule(src.path, x.spec) === INSTINCT_MODULE) out.push({ file: src.path, line: lineOf(src.text, x.at), rule: 'fence', text: FENCE_MESSAGE })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The tests

const sourceOf = (code: string, path = 'src/game/fake.ts'): SourceFile => toSource(path, code)
const flagged = (code: string, path?: string): Violation[] => foresightViolations([sourceOf(code, path)])

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())

describe('foresight scan: the real source', () => {
  it('has no watched call that reads past g.year outside the exemptions', () => {
    expect(describeAll(foresightViolations(real()))).toEqual([])
  })

  it('sees what the plan says it sees when the exemptions are switched off', () => {
    const all = foresightViolations(real(), false)
    const byFile = new Map<string, Set<string>>()
    for (const v of all) byFile.set(v.file, (byFile.get(v.file) ?? new Set()).add(v.rule))
    // The Investing gut asks for next year directly; settlePrice reaches it through an alias.
    expect([...byFile.keys()].sort()).toEqual(['src/game/computer/money-stocks.ts', 'src/game/invest/instinct.ts'])
    expect([...byFile.get('src/game/invest/instinct.ts')!]).toEqual(['direct'])
    expect([...byFile.get('src/game/computer/money-stocks.ts')!]).toEqual(['alias'])
  })

  it('reads the calls it guards: the watched readers are called in a good many places', () => {
    let calls = 0
    for (const s of real()) {
      for (let i = 0; i + 1 < s.toks.length; i++) {
        const t = s.toks[i]!
        if (t.k === K_ID && Object.hasOwn(WATCHED, t.v) && isPunct(s.toks[i + 1], '(') && !isId(s.toks[i - 1], 'function')) calls++
      }
    }
    expect(calls).toBeGreaterThan(30)
  })
})

describe('foresight scan: rule 1, a plus N inside the arguments', () => {
  it('flags a year plus one in each watched reader', () => {
    expect(flagged('const x = exchangeYear(f, a, i, y + 1)').map((v) => v.rule)).toEqual(['direct'])
    expect(flagged('const x = cryptoYear(f, a, g.year + 2)').map((v) => v.rule)).toEqual(['direct'])
    expect(flagged('const x = goldYear(f, a, y+1)').map((v) => v.rule)).toEqual(['direct'])
    expect(flagged('const x = fxYear(f, c, g.year + 1)').map((v) => v.rule)).toEqual(['direct'])
  })

  it('reports the line of the call', () => {
    const v = flagged('const a = 1\n\nconst b = goldYear(\n  f, a, y + 1,\n)')
    expect(v).toHaveLength(1)
    expect(v[0]!.line).toBe(3)
    expect(v[0]!.file).toBe('src/game/fake.ts')
  })

  it('flags a plus N nested inside another call or a template hole', () => {
    expect(flagged('exchangeYear(f, a, i, Math.min(y + 1, 3000))')).toHaveLength(1)
    expect(flagged('goldYear(f, a, Number(`${y + 1}`))')).toHaveLength(1)
    expect(flagged('goldYear(f, a, y + 1_000)')).toHaveLength(1)
  })

  it('lets the current year and the past through', () => {
    expect(flagged('exchangeYear(f, a, i, g.year)')).toEqual([])
    expect(flagged('exchangeYear(f, a, i, y - 1)')).toEqual([])
    expect(flagged('cryptoYear(f, a, g.year - 3)')).toEqual([])
    expect(flagged('goldYear(f, a, y + 0)')).toEqual([])
    expect(flagged('fxYear(f, c, Math.min(g.year, last))')).toEqual([])
  })

  it('does not count a declaration, and does not count a mention in a comment or a string', () => {
    expect(flagged('export function exchangeYear(fam: string, anchor: number, info: ExInfo, year: number) { return y + 1 }')).toEqual([])
    expect(flagged('// exchangeYear(f, a, i, y + 1)')).toEqual([])
    expect(flagged('/* goldYear(f, a, y + 1) */')).toEqual([])
    expect(flagged("const s = 'cryptoYear(f, a, y + 1)'")).toEqual([])
    expect(flagged('const s = `fxYear(f, c, y + 1)`')).toEqual([])
    expect(flagged('const x = exchangeYear2(f, a, i, y + 1)')).toEqual([])
  })

  it('does not flag a plus N that is outside the call', () => {
    expect(flagged('const z = goldYear(f, a, y) + 1')).toEqual([])
    expect(flagged('const z = [goldYear(f, a, y), 1 + 1]')).toEqual([])
  })

  it('reports a call it cannot read to the end', () => {
    expect(flagged('goldYear(f, a, (y').map((v) => v.rule)).toEqual(['unreadable'])
  })
})

describe('foresight scan: rule 2, a year alias built as year plus N', () => {
  const alias = (gap: number, bind = 'const ny = g.year + 1', call = 'const p = goldYear(f, a, ny)'): string =>
    [bind, ...Array.from({ length: gap }, () => '// filler'), call].join('\n')

  it('flags a bare identifier bound to `g.year + 1` within 40 lines above the call', () => {
    const v = flagged(alias(10))
    expect(v.map((x) => x.rule)).toEqual(['alias'])
    expect(v[0]!.line).toBe(12)
    expect(flagged(alias(0)).map((x) => x.rule)).toEqual(['alias'])
  })

  it('draws the window at 40 lines: 40 above is in, 41 above is out, 45 above is out', () => {
    expect(flagged(alias(39))).toHaveLength(1)
    expect(flagged(alias(40))).toEqual([])
    expect(flagged(alias(44))).toEqual([])
  })

  it('knows the other ways the plan names: let, a type annotation, y, a name with year in it', () => {
    expect(flagged(alias(1, 'let ny = y + 1'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny: number = g.year + 1'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny = bet.year + 2'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny = nextYear + 1'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny = Math.max(1, g.year + 1)'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny =\n  g.year + 1'))).toHaveLength(1)
  })

  it('does not flag an alias that is not a year plus N', () => {
    expect(flagged(alias(1, 'const ny = g.year'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year - 1'))).toEqual([])
    expect(flagged(alias(1, 'const ny = base + 1'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year + 0'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year; const other = base + 1'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year\nconst other = g.year + 1'))).toEqual([])
  })

  it('goes by the nearest binding, and needs a binding at all', () => {
    expect(flagged(`const ny = g.year + 1\nconst ny2 = 0\n${alias(1, 'const ny = g.year')}`)).toEqual([])
    expect(flagged('const p = goldYear(f, a, ny)')).toEqual([])
    expect(flagged('function f(ny: number) { return goldYear(f, a, ny) }')).toEqual([])
  })

  it('looks only at a bare identifier in the year slot', () => {
    expect(flagged(alias(1, 'const ny = g.year + 1', 'const p = goldYear(f, a, ny - 1)'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year + 1', 'const p = fxYear(f, ny, g.year)'))).toEqual([])
    expect(flagged(alias(1, 'const ny = g.year + 1', 'const p = fxYear(f, c, ny)'))).toHaveLength(1)
    expect(flagged(alias(1, 'const ny = g.year + 1', 'const p = exchangeYear(f, a, i, ny)'))).toHaveLength(1)
  })

  it('lets the named alias in money-stocks through and nothing else in that file', () => {
    const code = 'const year = bet.year + 1\nconst c = cryptoYear(f, a, year)'
    expect(flagged(code, 'src/game/computer/money-stocks.ts')).toEqual([])
    expect(flagged(code, 'src/game/computer/money-crypto.ts')).toHaveLength(1)
    expect(flagged(code.replaceAll('year)', 'when)').replace('const year', 'const when'), 'src/game/computer/money-stocks.ts')).toHaveLength(1)
    expect(flagged('const c = cryptoYear(f, a, g.year + 1)', 'src/game/computer/money-stocks.ts')).toHaveLength(1)
  })
})

describe('foresight scan: the exemptions', () => {
  it('lists exactly one exempt file, and it is the Investing gut', () => {
    expect(EXEMPT_FILES).toHaveLength(1)
    expect(EXEMPT_FILES[0]!.file).toBe(`${INSTINCT_MODULE}.ts`)
    expect(real().map((s) => s.path)).toContain(EXEMPT_FILES[0]!.file)
    expect(EXEMPT_ALIASES).toHaveLength(1)
    expect(real().map((s) => s.path)).toContain(EXEMPT_ALIASES[0]!.file)
    for (const e of [...EXEMPT_FILES, ...EXEMPT_ALIASES]) expect(e.why.length).toBeGreaterThan(20)
  })

  it('skips the exempt file whole, and only that file', () => {
    const code = 'const x = exchangeYear(f, a, i, y + 1)'
    expect(flagged(code, 'src/game/invest/instinct.ts')).toEqual([])
    expect(flagged(code, 'src/game/invest/engine.ts')).toHaveLength(1)
    expect(flagged(code, 'src/game/instinct.ts')).toHaveLength(1)
  })
})

describe('foresight scan: the instinct fence', () => {
  it('passes for the real tree: only the four known files import invest/instinct', () => {
    expect(describeAll(fenceViolations(real()))).toEqual([])
    const importers = instinctImporters(real())
    expect(importers.length).toBeGreaterThan(0)
    for (const f of importers) expect(INSTINCT_IMPORTERS).toContain(f)
    expect(INSTINCT_IMPORTERS).toHaveLength(4)
  })

  it('fails for a fifth importer, with the reason', () => {
    const fifth = sourceOf("import { marketInstinct } from './invest/instinct'\nexport const x = marketInstinct", 'src/game/menus.ts')
    const v = fenceViolations([...real().filter((s) => INSTINCT_IMPORTERS.includes(s.path)), fifth])
    expect(v).toHaveLength(1)
    expect(v[0]!.file).toBe('src/game/menus.ts')
    expect(v[0]!.line).toBe(1)
    expect(v[0]!.text).toBe("the Investing gut reads next year; keep it behind the talent (`hasTalent(g, 'Investing')` at instinct.ts:177)")
  })

  it('resolves relative paths from the importing file, however it imports', () => {
    const at = (path: string, code: string): Violation[] => fenceViolations([sourceOf(code, path)])
    expect(at('src/game/business/x.ts', "import { a } from '../invest/instinct'")).toHaveLength(1)
    expect(at('src/game/invest/other.ts', "import { a } from './instinct'")).toHaveLength(1)
    expect(at('src/ui/x.tsx', "import { a } from '../game/invest/instinct.ts'")).toHaveLength(1)
    expect(at('src/game/x.ts', "export { a } from './invest/instinct'")).toHaveLength(1)
    expect(at('src/game/x.ts', "const m = await import('./invest/instinct')")).toHaveLength(1)
    expect(at('src/game/x.ts', "import './invest/instinct'")).toHaveLength(1)
    expect(at('src/game/business/x.ts', "import { a } from './instinct'")).toEqual([])
    expect(at('src/game/x.ts', "import { a } from './invest/instinct-notes'")).toEqual([])
    expect(at('src/game/x.ts', "import { a } from 'instinct'")).toEqual([])
    expect(at('src/game/x.ts', "// import { a } from './invest/instinct'")).toEqual([])
    expect(at('src/game/x.ts', "const s = \"from './invest/instinct'\"")).toEqual([])
  })

  it('does not fence the module itself or the four importers', () => {
    const code = "import { a } from './invest/instinct'"
    expect(fenceViolations(INSTINCT_IMPORTERS.map((p) => sourceOf(code, p)))).toEqual([])
    expect(fenceViolations([sourceOf("import { a } from './instinct'", 'src/game/invest/instinct.ts')])).toEqual([])
  })

  it('names a gate that is still there: instinct.ts checks the Investing talent on the line the message cites', () => {
    const src = real().find((s) => s.path === `${INSTINCT_MODULE}.ts`)!
    const gate = src.toks.findIndex((t, i) => isId(t, 'hasTalent') && isPunct(src.toks[i + 1], '(') && isId(src.toks[i + 2], 'g') && src.toks[i + 4]?.k === K_STR && src.toks[i + 4]!.v === 'Investing')
    expect(gate).toBeGreaterThan(-1)
    expect(lineOf(src.text, src.toks[gate]!.p)).toBe(GATE_LINE)
  })
})

// ---------------------------------------------------------------------------
// The spy

const NO_TALENT_LIVES = [
  { year: 1975, countryId: 'us' },
  { year: 1975, countryId: 'gb' },
  { year: 2000, countryId: 'us' },
  { year: 2000, countryId: 'gb' },
  { year: 2026, countryId: 'us' },
  { year: 2026, countryId: 'gb' },
] as const

const TALENT_LIVES = [
  { year: 2000, countryId: 'us' },
  { year: 2026, countryId: 'gb' },
] as const

/**
 * A rich forty-year-old in `year`, built like investor() in analyst-tip.test.ts. Every life has its own lifeId, because
 * marketInstinct caches its answer by life and year: a second render of the same life would not look ahead again.
 */
function life(seed: number, year: number, countryId: string, talents?: string[]): GameState {
  const g = makeTestGame(seed, { age: 40, money: 5_000_000, countryId, ...(talents ? { talents } : {}) })
  g.lifeId = `foresight-${countryId}-${year}-${seed}`
  g.year = year
  g.log = [{ age: g.character.age, year, entries: [] }]
  return g
}

beforeEach(() => {
  asked.years.length = 0
})

describe('foresight spy: the years that menus and reads ask the market for', () => {
  it('asks for no year after g.year in six lives without the Investing talent', { timeout: 90_000 }, () => {
    const seen: string[] = []
    NO_TALENT_LIVES.forEach(({ year, countryId }, n) => {
      const g = life(n + 1, year, countryId)
      asked.years.length = 0
      renderAll(g, new FailureLog(), 3)
      expect(asked.years.length, `${countryId} ${year}: the spy never fired, so it proves nothing`).toBeGreaterThan(0)
      const worst = Math.max(...asked.years)
      seen.push(`${countryId} ${year}: asked up to ${worst}`)
      expect(worst, `${countryId} ${year}: asked for ${worst}`).toBeLessThanOrEqual(g.year)
    })
    expect(seen).toHaveLength(6)
  })

  it('asks for g.year + 1 and never further with the Investing talent', { timeout: 90_000 }, () => {
    TALENT_LIVES.forEach(({ year, countryId }, n) => {
      const g = life(n + 11, year, countryId, ['Investing'])
      asked.years.length = 0
      renderAll(g, new FailureLog(), 4)
      const worst = Math.max(...asked.years)
      expect(worst, `${countryId} ${year}: the gut never looked ahead, so the spy proves nothing`).toBe(g.year + 1)
    })
  })
})
