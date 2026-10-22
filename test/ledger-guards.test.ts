// ci: fast
// R2-L2 (A.K1 a): the guards of the ledger's home. The kernel is a leaf, so the ledger can be read and tested without the game;
// a kernel or world file never draws luck or reads the clock, so the same bookings always give the same books; and the files of
// the ledger and the world keep to the plain voice (no em-dash or en-dash). A guard that finds nothing proves nothing, so each
// rule is also run on a synthetic file that breaks it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K_ID, K_STR, ROOT, isId, isPunct, lineOf, loadSources, toSource, type SourceFile } from './scan-kit'

/** Calls the kernel and the world never make: luck from g.rng, a fresh id, a shuffle. */
const BANNED_CALLS = new Set(['rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell', 'uid'])

/** The files that may measure time: world/budget.ts reads performance and nothing else. */
const MAY_MEASURE = new Set(['src/game/world/budget.ts'])

interface Finding {
  line: number
  what: string
}

/** What a kernel or world file does that it may not. Tokens only, so a mention in a string or a comment never counts. */
function draws(src: SourceFile): Finding[] {
  const out: Finding[] = []
  const { toks } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID) continue
    const prev = toks[i - 1]
    const afterDot = isPunct(prev, '.') || isPunct(prev, '?.')
    const at = lineOf(src.text, t.p)
    if (BANNED_CALLS.has(t.v) && !afterDot && !isId(prev, 'function') && isPunct(toks[i + 1], '(')) out.push({ line: at, what: `${t.v}(` })
    else if (t.v === 'rng' && afterDot) out.push({ line: at, what: '.rng' })
    else if (t.v === 'Math' && isPunct(toks[i + 1], '.') && isId(toks[i + 2], 'random')) out.push({ line: at, what: 'Math.random' })
    else if (t.v === 'Date') out.push({ line: at, what: 'Date' })
    else if (t.v === 'performance' && !MAY_MEASURE.has(src.path)) out.push({ line: at, what: 'performance' })
  }
  return out
}

interface ModuleRef {
  line: number
  spec: string
  typeOnly: boolean
  names: string[]
  dynamic: boolean
}

/** Every static import, export-from and dynamic import of a file. */
function moduleRefs(src: SourceFile): ModuleRef[] {
  const { toks } = src
  const out: ModuleRef[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (isId(t, 'import') && isPunct(toks[i + 1], '(')) {
      out.push({ line: lineOf(src.text, t.p), spec: '', typeOnly: false, names: [], dynamic: true })
      continue
    }
    if (t.k !== K_STR) continue
    if (!isId(toks[i - 1], 'import') && !isId(toks[i - 1], 'from')) continue
    let head = i - 1
    while (head >= 0 && !isId(toks[head], 'import') && !isId(toks[head], 'export')) head--
    if (head < 0) continue
    const typeOnly = isId(toks[head + 1], 'type') && !isId(toks[head + 2], 'from')
    const names: string[] = []
    let inBraces = false
    for (let j = head + 1; j < i; j++) {
      const n = toks[j]!
      if (isPunct(n, '{')) inBraces = true
      else if (isPunct(n, '}')) inBraces = false
      else if (inBraces && n.k === K_ID && n.v !== 'type' && n.v !== 'as' && !isId(toks[j - 1], 'type') && !isId(toks[j - 1], 'as')) names.push(n.v)
    }
    out.push({ line: lineOf(src.text, t.p), spec: t.v, typeOnly, names, dynamic: false })
  }
  return out
}

/** Problems with the imports of one kernel file, as `line: what`. */
function leafProblems(src: SourceFile): string[] {
  const out: string[] = []
  for (const r of moduleRefs(src)) {
    if (r.dynamic) {
      out.push(`${r.line}: a dynamic import() hides what the kernel depends on`)
      continue
    }
    if (r.typeOnly) continue
    const target = r.spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(src.path), r.spec)) : r.spec
    if (target === 'src/game/rng') {
      if (r.names.length === 0 || r.names.some((n) => n !== 'nextRandom')) out.push(`${r.line}: only nextRandom may come from rng`)
    } else if (target === 'src/game/types') out.push(`${r.line}: ../types may only be imported as a type (use \`import type\`)`)
    else if (!target.startsWith('src/game/kernel/')) out.push(`${r.line}: ${r.spec} is not a kernel file or rng (use \`import type\` for a type)`)
  }
  return out
}

let sources: SourceFile[] | null = null
const real = (): SourceFile[] => (sources ??= loadSources())
const kernel = (): SourceFile[] => real().filter((s) => s.path.startsWith('src/game/kernel/'))
const world = (): SourceFile[] => real().filter((s) => s.path.startsWith('src/game/world/'))

describe('ledger guards: the kernel is a leaf', () => {
  it('imports, at runtime, only other kernel files and nextRandom from rng, and ../types only as a type', () => {
    const files = kernel()
    for (const name of ['ids', 'ledger', 'ledger-types', 'reasons', 'spreads', 'streams', 'forks']) expect(files.map((s) => s.path), name).toContain(`src/game/kernel/${name}.ts`)
    const bad = files.flatMap((s) => leafProblems(s).map((p) => `${s.path}:${p}`))
    expect(bad).toEqual([])
  })

  it('finds a runtime import of the game, a value import of types, a bad rng name and a dynamic import', () => {
    const at = (code: string): string[] => leafProblems(toSource('src/game/kernel/x.ts', code))
    expect(at("import { addMoney } from '../core'\n")).toHaveLength(1)
    expect(at("import { GAME_VERSION } from '../types'\n")).toHaveLength(1)
    expect(at("import { rand } from '../rng'\n")).toHaveLength(1)
    expect(at("const m = await import('./other')\n")).toHaveLength(1)
    expect(at("export { MINTS } from '../world/state'\n")).toHaveLength(1)
    expect(at("import type { GameState } from '../types'\nimport type { X } from '../core'\n")).toEqual([])
    expect(at("import { nextRandom } from '../rng'\nimport { MINTS, BURNS } from './reasons'\nexport { MINTS } from './reasons'\n")).toEqual([])
  })
})

describe('ledger guards: no luck and no clock', () => {
  it('keeps every kernel and world file free of g.rng, Math.random, Date, the draw helpers and uid', () => {
    const files = [...kernel(), ...world()]
    expect(files.length).toBeGreaterThanOrEqual(10)
    const bad = files.flatMap((s) => draws(s).map((f) => `${s.path}:${f.line} ${f.what}`))
    expect(bad).toEqual([])
  })

  it('finds each of them in a synthetic file, and ignores a mention in a string or a comment', () => {
    const at = (code: string, path = 'src/game/world/x.ts'): string[] => draws(toSource(path, code)).map((f) => f.what)
    expect(at('const x = g.rng + 1\n')).toEqual(['.rng'])
    expect(at('const x = Math.random()\n')).toEqual(['Math.random'])
    expect(at('const t = new Date()\n')).toEqual(['Date'])
    expect(at('const t = Date.now()\n')).toEqual(['Date'])
    expect(at('const a = pick(xs)\nconst b = chance(g, 0.5)\nconst c = uid(g, "x")\n')).toEqual(['pick(', 'chance(', 'uid('])
    expect(at('const t = performance.now()\n')).toEqual(['performance'])
    expect(at('const t = performance.now()\n', 'src/game/world/budget.ts')).toEqual([])
    expect(at("const s = 'g.rng Math.random Date pick(x)' // rand(1) Date\n")).toEqual([])
    expect(at('const a = s.pick(1)\nfunction pick(x: number) { return x }\n')).toEqual([])
  })
})

describe('ledger guards: the plain voice', () => {
  /** The dashes are built from their code points so that this file holds neither character. */
  const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

  /** Every file under `dir` (repo-relative) whose name passes `keep`, recursively. A missing directory has none. */
  function walk(dir: string, keep: (name: string) => boolean): string[] {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) return []
    const out: string[] = []
    for (const name of readdirSync(abs)) {
      const next = join(abs, name)
      if (statSync(next).isDirectory()) out.push(...walk(relative(ROOT, next).split(sep).join('/'), keep))
      else if (keep(name)) out.push(relative(ROOT, next).split(sep).join('/'))
    }
    return out
  }

  it('has no em-dash and no en-dash in the kernel, the world, cash.ts, the ledger and world tests, and their docs', () => {
    const files = [
      ...walk('src/game/kernel', () => true),
      ...walk('src/game/world', () => true),
      'src/game/cash.ts',
      ...walk('test', (n) => /^ledger.*\.ts$/.test(n) || /^world-.*\.ts$/.test(n)),
      'docs/LEDGER.md',
      'docs/WORLD.md',
    ].filter((p) => existsSync(join(ROOT, p)))
    expect(files.length).toBeGreaterThanOrEqual(10)
    const bad: string[] = []
    for (const p of files) {
      readFileSync(join(ROOT, p), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (DASH.test(line)) bad.push(`${p}:${i + 1}`)
        })
    }
    expect(bad).toEqual([])
  })

  it('finds a dash on a line, and nothing on a plain hyphen', () => {
    expect(DASH.test(`a ${String.fromCharCode(0x2014)} b`)).toBe(true)
    expect(DASH.test(`1${String.fromCharCode(0x2013)}2`)).toBe(true)
    expect(DASH.test('a - b, c-d')).toBe(false)
  })
})
