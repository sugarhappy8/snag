// ci: fast
// R2-B1 (K.3, design 13.3): the world-RNG guard. A world step (a file under src/game/kernel/, world/ or modules/, a file that
// calls registerModule(, or a file that says `// world-step` in its first 10 lines) takes its luck from a named stream
// (kernel/streams.ts: stream, outcomeStream), never from g.rng. Reading g.rng ties a world step to the order of the player's
// own draws, so one extra roll in a menu would change a war ten years on. The guard reads tokens (test/scan-kit.ts), so a
// mention in a string, a template text or a comment never counts.
//
// In a guarded file it flags
//   a call of rand, randInt, randFloat, chance, pick, weightedPick, shuffle or bell      (a bare name or name<T>(...); a method
//                                                                                          such as `s.pick(` is a different thing)
//   a property read `.rng`
//   Math.random, Date.now and new Date
//   uid(                                                                                  (src/game/kernel/ only, open question 1)
// A player-linked roll that has to stay in such a file carries `// rng-ok: <12 or more characters>` on its own line or on the
// line before it; the test prints how many there are. A pragma with a shorter reason is itself a finding.
//
// And the kernel is a leaf (the L0 contract): every import in src/game/kernel/ is `import type`, or from src/game/rng (only
// nextRandom), from src/game/types, or from another kernel file.
//
// Limits, on purpose: the guard knows tokens, not types. An alias (`import { pick as p }`), a namespace import of the rng
// module, a destructured `{ rng } = g` and a method that happens to be called `pick` are not seen as draws, and a declaration
// such as `pick(items) {` in an object literal reads as a call. Review and the pragma cover those.
import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'
import { K_ID, K_PUNCT, K_STR, K_TMPL, isId, isPunct, lineOf, loadSources, toSource, type SourceFile, type Tok } from './scan-kit'

const BANNED = new Set(['rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell'])
const FIX = 'draw from stream(g, tag, year, id) in src/game/kernel/streams.ts, or mark a player-linked roll with `// rng-ok: <reason of 12 or more characters>`'

interface Finding {
  line: number
  /** `pick(`, `.rng`, `Math.random`, `Date.now`, `new Date`, `uid(`, `pragma`. */
  rule: string
}

/** Why a file is guarded, or null when it is not. */
function guardedBy(src: SourceFile): string | null {
  if (src.path.startsWith('src/game/kernel/')) return 'kernel'
  if (src.path.startsWith('src/game/world/')) return 'world'
  if (src.path.startsWith('src/game/modules/')) return 'modules'
  const { toks } = src
  for (let i = 0; i + 1 < toks.length; i++) {
    if (isId(toks[i], 'registerModule') && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) return 'registerModule('
  }
  if (src.text.split('\n').slice(0, 10).some((l) => /\/\/\s*world-step\b/.test(l))) return '// world-step'
  return null
}

/** True when toks[i] (an identifier) is called: `name(` or `name<T>(`. */
function isCall(toks: readonly Tok[], i: number): boolean {
  if (isPunct(toks[i + 1], '(')) return true
  if (!isPunct(toks[i + 1], '<')) return false
  let depth = 0
  for (let j = i + 1; j < toks.length && j < i + 40; j++) {
    const t = toks[j]!
    if (t.k !== K_PUNCT) continue
    if (t.v === '<') depth++
    else if (t.v === '>') depth--
    else if (t.v === '>>') depth -= 2
    else if (t.v === '>>>') depth -= 3
    else if (t.v === ';') return false
    if (depth <= 0) return depth === 0 && isPunct(toks[j + 1], '(')
  }
  return false
}

interface Pragmas {
  /** Lines a valid pragma allows: its own and the next. */
  allowed: Set<number>
  /** Valid pragmas. */
  count: number
  /** Lines of pragmas whose reason is too short. */
  short: number[]
}

/** The `// rng-ok: reason` comments of a file. A `//` inside a string or a template is not a comment. */
function pragmasOf(src: SourceFile): Pragmas {
  const literal = src.toks.filter((t) => t.k === K_STR || t.k === K_TMPL)
  const inLiteral = (off: number): boolean => literal.some((t) => off > t.p && off < t.e)
  const out: Pragmas = { allowed: new Set(), count: 0, short: [] }
  let offset = 0
  const lines = src.text.split('\n')
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!
    const m = /\/\/\s*rng-ok:(.*)$/.exec(line)
    if (m && !inLiteral(offset + m.index)) {
      if (m[1]!.trim().length >= 12) {
        out.allowed.add(n + 1)
        out.allowed.add(n + 2)
        out.count++
      } else out.short.push(n + 1)
    }
    offset += line.length + 1
  }
  return out
}

/** What a guarded file does that it may not, with pragmas applied. `pragmas` counts the valid ones. */
function scan(src: SourceFile): { findings: Finding[]; pragmas: number } {
  const { toks } = src
  const pragma = pragmasOf(src)
  const findings: Finding[] = []
  const kernel = src.path.startsWith('src/game/kernel/')
  const flag = (t: Tok, rule: string): void => {
    const line = lineOf(src.text, t.p)
    if (!pragma.allowed.has(line)) findings.push({ line, rule })
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID) continue
    const prev = toks[i - 1]
    const afterDot = isPunct(prev, '.') || isPunct(prev, '?.')
    if (BANNED.has(t.v) && !afterDot && !isId(prev, 'function') && isCall(toks, i)) flag(t, `${t.v}(`)
    else if (kernel && t.v === 'uid' && !afterDot && !isId(prev, 'function') && isCall(toks, i)) flag(t, 'uid(')
    else if (t.v === 'rng' && afterDot) flag(t, '.rng')
    else if (t.v === 'Math' && isPunct(toks[i + 1], '.') && isId(toks[i + 2], 'random')) flag(t, 'Math.random')
    else if (t.v === 'Date' && isPunct(toks[i + 1], '.') && isId(toks[i + 2], 'now')) flag(t, 'Date.now')
    else if (t.v === 'Date' && isId(prev, 'new')) flag(t, 'new Date')
  }
  for (const line of pragma.short) findings.push({ line, rule: 'pragma' })
  return { findings, pragmas: pragma.count }
}

interface ModuleRef {
  line: number
  spec: string
  typeOnly: boolean
  /** The imported names that are not marked `type`. */
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
    const side = isId(toks[i - 1], 'import')
    if (!side && !isId(toks[i - 1], 'from')) continue
    // Walk back to the `import` or `export` that opens the statement, collecting what sits between.
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
      else if (inBraces && n.k === K_ID && n.v !== 'type' && n.v !== 'as') {
        // `type X` marks X as a type, and in `X as Y` it is X that is imported.
        if (!isId(toks[j - 1], 'type') && !isId(toks[j - 1], 'as')) names.push(n.v)
      }
    }
    out.push({ line: lineOf(src.text, t.p), spec: t.v, typeOnly, names, dynamic: false })
  }
  return out
}

/** The problems with the imports of one kernel file, as `line: what`. */
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
      const extra = r.names.filter((n) => n !== 'nextRandom')
      if (extra.length > 0 || r.names.length === 0) out.push(`${r.line}: only nextRandom may come from rng (found ${extra.join(', ') || 'a bare import'})`)
    } else if (target === 'src/game/types') continue
    else if (target.startsWith('src/game/kernel/')) continue
    else out.push(`${r.line}: ${r.spec} is not a kernel file, rng or types (use \`import type\` for a type)`)
  }
  return out
}

const rules = (code: string, path = 'src/game/world/step.ts'): string[] => scan(toSource(path, code)).findings.map((f) => f.rule)

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())
const guarded = (): SourceFile[] => real().filter((s) => guardedBy(s) !== null)

describe('world streams: the real source', () => {
  it('has no guarded file that draws g.rng, reads the clock or calls Math.random', () => {
    const bad: string[] = []
    let pragmas = 0
    for (const s of guarded()) {
      const r = scan(s)
      pragmas += r.pragmas
      for (const f of r.findings) bad.push(`${s.path}:${f.line} ${f.rule}  (${FIX})`)
    }
    console.info(`world streams: ${guarded().length} guarded file(s), ${pragmas} rng-ok pragma(s)`)
    expect(bad).toEqual([])
  })

  it('guards a non-empty set that holds the stream and fork files', () => {
    const paths = guarded().map((s) => s.path)
    expect(paths).toContain('src/game/kernel/streams.ts')
    expect(paths).toContain('src/game/kernel/forks.ts')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(paths.filter((p) => p.startsWith('src/game/kernel/')).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the kernel a leaf: type imports, nextRandom from rng, types, and other kernel files', () => {
    const kernel = real().filter((s) => s.path.startsWith('src/game/kernel/'))
    expect(kernel.length).toBeGreaterThanOrEqual(2)
    const bad = kernel.flatMap((s) => leafProblems(s).map((p) => `${s.path}:${p}`))
    expect(bad).toEqual([])
  })

  it('lets the kernel read what it needs: streams imports nextRandom, forks imports a type', () => {
    const streams = real().find((s) => s.path === 'src/game/kernel/streams.ts')!
    const specs = moduleRefs(streams).map((r) => r.spec)
    expect(specs).toContain('../rng')
    expect(specs).toContain('./forks')
  })
})

describe('world streams: which files are guarded', () => {
  const by = (path: string, code = 'export const x = 1\n'): string | null => guardedBy(toSource(path, code))

  it('guards kernel, world and modules by path, so the day those directories appear they are covered', () => {
    expect(by('src/game/kernel/streams.ts')).toBe('kernel')
    expect(by('src/game/kernel/sub/deep.ts')).toBe('kernel')
    expect(by('src/game/world/wars.ts')).toBe('world')
    expect(by('src/game/world/nations/yearly.ts')).toBe('world')
    expect(by('src/game/modules/trade.ts')).toBe('modules')
    expect(by('src/game/modules/trade/step.ts')).toBe('modules')
  })

  it('does not guard the rest of src, nor a path that only looks alike', () => {
    expect(by('src/game/core.ts')).toBeNull()
    expect(by('src/game/nation/yearly.ts')).toBeNull()
    expect(by('src/game/worldview.ts')).toBeNull()
    expect(by('src/game/kernelish/x.ts')).toBeNull()
    expect(by('src/game/events/world/x.ts')).toBeNull()
    expect(by('src/ui/modules/x.tsx')).toBeNull()
  })

  it('guards a file that calls registerModule(, wherever it lives', () => {
    expect(by('src/game/trade/index.ts', "registerModule({ id: 'trade' })")).toBe('registerModule(')
    expect(by('src/game/trade/index.ts', 'reg.registerModule(spec)')).toBe('registerModule(')
    expect(by('src/game/trade/index.ts', "const s = 'registerModule(x)'; // registerModule(y)")).toBeNull()
    expect(by('src/game/registry.ts', 'export function registerModule(spec: Spec) {}')).toBeNull()
  })

  it('guards a file with `// world-step` in its first 10 lines, and not one with it on line 11', () => {
    expect(by('src/game/x/a.ts', '// world-step\nexport const x = 1\n')).toBe('// world-step')
    expect(by('src/game/x/a.ts', `${'// header\n'.repeat(9)}// world-step: wars\n`)).toBe('// world-step')
    expect(by('src/game/x/a.ts', `${'// header\n'.repeat(10)}// world-step\n`)).toBeNull()
    expect(by('src/game/x/a.ts', 'export const x = 1\n')).toBeNull()
  })
})

describe('world streams: what is flagged', () => {
  it('flags a call of each banned draw', () => {
    for (const name of BANNED) {
      expect(rules(`const v = ${name}(g, 1)`), name).toEqual([`${name}(`])
      expect(rules(`return ${name}(g)`), name).toEqual([`${name}(`])
    }
  })

  it('flags a call with type arguments', () => {
    expect(rules('const v = pick<string>(g, xs)')).toEqual(['pick('])
    expect(rules('const v = pick<Array<string>>(g, xs)')).toEqual(['pick('])
    expect(rules('const v = weightedPick<{ a: number }>(g, xs, (x) => x.a)')).toEqual(['weightedPick('])
  })

  it('flags a property read of .rng, also with ?.', () => {
    expect(rules('const s = g.rng')).toEqual(['.rng'])
    expect(rules('const s = state.g.rng + 1')).toEqual(['.rng'])
    expect(rules('const s = g?.rng')).toEqual(['.rng'])
    expect(rules('g.rng = 5')).toEqual(['.rng'])
  })

  it('flags Math.random, Date.now and new Date', () => {
    expect(rules('const r = Math.random()')).toEqual(['Math.random'])
    expect(rules('const t = Date.now()')).toEqual(['Date.now'])
    expect(rules('const d = new Date()')).toEqual(['new Date'])
    expect(rules('const d = new Date(2020, 1)')).toEqual(['new Date'])
  })

  it('flags uid( in the kernel and nowhere else', () => {
    expect(rules('const id = uid(g, "p")', 'src/game/kernel/ids.ts')).toEqual(['uid('])
    expect(rules('const id = uid(g, "p")', 'src/game/world/step.ts')).toEqual([])
    expect(rules('const id = uid(g, "p")', 'src/game/modules/step.ts')).toEqual([])
  })

  it('reports each use, in the order they appear', () => {
    expect(rules('pick(g, a)\nchance(g, 0.5)\nconst t = Date.now()\ng.rng')).toEqual(['pick(', 'chance(', 'Date.now', '.rng'])
  })

  it('does not flag a method, an object that merely has the name, a declaration or a bare name', () => {
    expect(rules('const v = s.pick(items)')).toEqual([])
    expect(rules('const v = rng.chance(0.5)')).toEqual([])
    expect(rules('const v = seeded(key).int(1, 6)')).toEqual([])
    expect(rules('const v = stream(g, "econ", y)()')).toEqual([])
    expect(rules('const v = items?.shuffle(g)')).toEqual([])
    expect(rules('function pick(items: string[]) { return items[0] }')).toEqual([])
    expect(rules('const f = pick')).toEqual([])
    expect(rules('const bell = 3; const rand = bell + 1')).toEqual([])
    expect(rules('const o = { pick: 1, rng: 2, chance: 0.5 }')).toEqual([])
    expect(rules('import { nextRandom } from "../rng"; nextRandom(1)')).toEqual([])
    expect(rules('const x = a < b && c > d')).toEqual([])
    expect(rules('const x = pick < 3')).toEqual([])
    expect(rules('const t = Math.floor(1.5); const d = Date')).toEqual([])
    expect(rules('const u = uid')).toEqual([])
  })

  it('does not flag a mention in a string, a template text or a comment', () => {
    expect(rules("const s = 'pick(g, xs) and g.rng and Math.random() and Date.now()'")).toEqual([])
    expect(rules('const s = "chance(g, 0.5) new Date()"')).toEqual([])
    expect(rules('const s = `shuffle(g, xs) then g.rng`')).toEqual([])
    expect(rules('// pick(g, xs); g.rng; Math.random()\nconst x = 1')).toEqual([])
    expect(rules('/* randInt(g, 1, 6) and Date.now() */\nconst x = 1')).toEqual([])
    expect(rules("const s = 'uid(g)'", 'src/game/kernel/ids.ts')).toEqual([])
  })

  it('does flag the code inside a template hole', () => {
    expect(rules('const s = `a ${pick(g, xs)} b`')).toEqual(['pick('])
    expect(rules('const s = `a ${g.rng}`')).toEqual(['.rng'])
  })
})

describe('world streams: the pragma', () => {
  const reason = 'a player-linked roll'

  it('allows the line it sits on and the line after it, and only those', () => {
    expect(rules(`pick(g, xs) // rng-ok: ${reason}`)).toEqual([])
    expect(rules(`// rng-ok: ${reason}\npick(g, xs)`)).toEqual([])
    expect(rules(`// rng-ok: ${reason}\nconst a = 1\npick(g, xs)`)).toEqual(['pick('])
    expect(rules(`pick(g, xs)\n// rng-ok: ${reason}`)).toEqual(['pick('])
    expect(rules(`// rng-ok: ${reason}\npick(g, xs)\npick(g, ys)`)).toEqual(['pick('])
  })

  it('allows every banned thing on its line', () => {
    expect(rules(`const a = pick(g, xs) + chance(g, 0.5) // rng-ok: ${reason}`)).toEqual([])
    expect(rules(`// rng-ok: ${reason}\nconst s = g.rng + Math.random()`)).toEqual([])
  })

  it('needs a reason of 12 or more characters: 12 passes, 11 is a finding', () => {
    expect(rules('pick(g, xs) // rng-ok: 123456789012')).toEqual([])
    expect(rules('pick(g, xs) // rng-ok: 12345678901')).toEqual(['pick(', 'pragma'])
    expect(rules('pick(g, xs) // rng-ok:')).toEqual(['pick(', 'pragma'])
    expect(rules('pick(g, xs) // rng-ok:    short   ')).toEqual(['pick(', 'pragma'])
    expect(rules('const a = 1 // rng-ok: x')).toEqual(['pragma'])
  })

  it('counts the valid ones, and ignores a pragma that sits in a string or a template', () => {
    const src = toSource(
      'src/game/world/step.ts',
      ['pick(g, a) // rng-ok: the player picks first', '// rng-ok: the court rolls for the player', 'chance(g, 0.1)', 'const s = "// rng-ok: not a comment at all"', 'const t = `// rng-ok: nor this one here`'].join('\n'),
    )
    expect(scan(src)).toEqual({ findings: [], pragmas: 2 })
    expect(rules('const s = "// rng-ok: not a comment at all"\npick(g, a)')).toEqual(['pick('])
  })
})

describe('world streams: the kernel is a leaf', () => {
  const problems = (code: string, path = 'src/game/kernel/x.ts'): string[] => leafProblems(toSource(path, code))

  it('accepts type imports, nextRandom from rng, types, and kernel files', () => {
    expect(problems("import type { GameState } from '../types'")).toEqual([])
    expect(problems("import type { Thing } from '../core'")).toEqual([])
    expect(problems("import { nextRandom } from '../rng'")).toEqual([])
    expect(problems("import { nextRandom, type Picker } from '../rng'")).toEqual([])
    expect(problems("import { type Picker, nextRandom } from '../rng'")).toEqual([])
    expect(problems("import { GameState } from '../types'")).toEqual([])
    expect(problems("import { outcomeTag } from './forks'")).toEqual([])
    expect(problems("export type { TimelineFork } from './forks'")).toEqual([])
    expect(problems("export { forkTag } from './forks'")).toEqual([])
    expect(problems("import './setup'")).toEqual([])
    expect(problems("import { x } from './sub/y'")).toEqual([])
    expect(problems("import { x } from '../kernel/forks'")).toEqual([])
    expect(problems('export const a = 1\nexport function f() {}\nexport type T = number')).toEqual([])
  })

  it('refuses a value import from core, timeMachine or text, and anything but nextRandom from rng', () => {
    expect(problems("import { log } from '../core'")).toHaveLength(1)
    expect(problems("import { outcomeTag } from '../timeMachine'")).toHaveLength(1)
    expect(problems("import { pickLine } from '../text/pick'")).toHaveLength(1)
    expect(problems("import { rand } from '../rng'")).toHaveLength(1)
    expect(problems("import { nextRandom, rand } from '../rng'")).toHaveLength(1)
    expect(problems("import * as R from '../rng'")).toHaveLength(1)
    expect(problems("import '../rng'")).toHaveLength(1)
    expect(problems("import { x } from 'node:fs'")).toHaveLength(1)
    expect(problems("import { seeded } from '../assets'")).toHaveLength(1)
  })

  it('refuses an export-from that reaches outside, and a dynamic import', () => {
    expect(problems("export { log } from '../core'")).toHaveLength(1)
    expect(problems("export * from '../core'")).toHaveLength(1)
    expect(problems("const m = await import('./forks')")).toHaveLength(1)
  })

  it('resolves the path against the file it sits in', () => {
    expect(problems("import { nextRandom } from '../../rng'", 'src/game/kernel/sub/x.ts')).toEqual([])
    expect(problems("import { log } from '../../core'", 'src/game/kernel/sub/x.ts')).toHaveLength(1)
    expect(problems("import { x } from '../forks'", 'src/game/kernel/sub/x.ts')).toEqual([])
  })

  it('names the line of each problem', () => {
    const out = problems("import type { A } from '../types'\n\nimport { log } from '../core'\nimport { rand } from '../rng'")
    expect(out).toHaveLength(2)
    expect(out[0]).toMatch(/^3:/)
    expect(out[1]).toMatch(/^4:/)
  })
})
