// ci: fast
// R4 fix (rehearsal-2 item 4, root cause A): a token scan of src/game for the slip that R4-E5's mechanical diff (645d6cd) made once.
//
// The store builds a menu from the committed state, which it treats as frozen, and then runs the chosen action on a draft
// (store.runMenuAction, cloneForAct). A menu builder that is `(g) => ...` and hands out `run: (gg) => ...` therefore has two game
// states in reach, and the codemod wrote `addRelationship(g, ...)` in one such closure (prison.ts, the letter home): on a stamped life
// the edge mirror wrote the edge into the frozen outer state ("Cannot assign to read only property 'edges'"), and in the app it would
// have gone to the object the menu was built from and not to the one the action runs on.
//
// The rule: inside a closure that is the value of a property `run`, a call of addRelationship, setRelationship or bumpRelationship
// whose first argument is a plain name must name a state the closure has: one of its own parameters, or a name it declares itself
// (a const, a let, a destructured binding, the parameter of a callback inside it). Anything else is a game captured from outside,
// which is the menu's state and not the one the action runs on.
//
// What it reads: tokens (test/scan-kit.ts), so a mention in a comment, a string or a template is never a call. It knows brackets and
// commas, not types. A first argument that is not a single name (`c.g`) is not judged. Only the property `run` is scanned: the other
// callbacks that take a state (`children`, `disabledReason`, `subtitle`) do not write, and the script answers are defined at module
// level, where no outer game exists to capture. The hand audit of the whole codemod (every one of the 430 calls in src, checked by
// the function that declares its first argument and by what the other helpers of the same function are given) found this one site.
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, ROOT, isId, isPunct, lineOf, loadSources, toSource, type SourceFile, type Tok } from './scan-kit'

/** The writers that take the game first. A new writer with that shape is added here. */
const WRITERS: ReadonlySet<string> = new Set(['addRelationship', 'setRelationship', 'bumpRelationship'])

/** One call in a run closure whose first argument is a game the closure does not have. */
interface Slip {
  path: string
  line: number
  callee: string
  /** The name given as the game. */
  arg: string
  /** The first parameter of the closure, or '(none)'. */
  param: string
}

const isOpen = (t: Tok | undefined): boolean => t !== undefined && t.k === K_PUNCT && (t.v === '(' || t.v === '[' || t.v === '{')
const isClose = (t: Tok | undefined): boolean => t !== undefined && t.k === K_PUNCT && (t.v === ')' || t.v === ']' || t.v === '}')

/** For every bracket token its partner's index, open and close alike; -1 for none. A template's `${ }` hole is inside its token, and its content is balanced. */
function matchTable(toks: readonly Tok[]): Int32Array {
  const match = new Int32Array(toks.length).fill(-1)
  const stack: number[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_PUNCT) continue
    if (t.v === '(' || t.v === '[' || t.v === '{') stack.push(i)
    else if (t.v === ')' || t.v === ']' || t.v === '}') {
      const open = stack.pop()
      if (open === undefined) continue
      match[open] = i
      match[i] = open
    }
  }
  return match
}

const BIND_BEFORE: ReadonlySet<string> = new Set(['(', ',', '{', '[', '...'])
const BIND_AFTER: ReadonlySet<string> = new Set([',', ')', ':', '?', '=', '}', ']'])

/** The names bound between toks[open] and toks[close] (a parameter list or a pattern): an identifier between a separator and a separator. */
function bindingsIn(toks: readonly Tok[], open: number, close: number, into: Set<string>): void {
  for (let k = open + 1; k < close; k++) {
    const t = toks[k]!
    if (t.k !== K_ID) continue
    const before = toks[k - 1]!
    const after = toks[k + 1]!
    if (before.k === K_PUNCT && BIND_BEFORE.has(before.v) && after.k === K_PUNCT && BIND_AFTER.has(after.v)) into.add(t.v)
  }
}

/** The names declared inside toks[from..to]: const, let and var (a name or a pattern), the parameters of every function and arrow, a catch. */
function declaredIn(toks: readonly Tok[], match: Int32Array, from: number, to: number): Set<string> {
  const names = new Set<string>()
  for (let k = from; k <= to; k++) {
    const t = toks[k]!
    if (t.k === K_ID && (t.v === 'const' || t.v === 'let' || t.v === 'var')) {
      const next = toks[k + 1]
      if (next !== undefined && next.k === K_ID) names.add(next.v)
      else if ((isPunct(next, '{') || isPunct(next, '[')) && match[k + 1]! > 0) bindingsIn(toks, k + 1, match[k + 1]!, names)
    } else if (t.k === K_PUNCT && t.v === '=>') {
      const prev = toks[k - 1]
      if (isPunct(prev, ')') && match[k - 1]! >= 0) bindingsIn(toks, match[k - 1]!, k - 1, names)
      else if (prev !== undefined && prev.k === K_ID) names.add(prev.v)
    } else if (t.k === K_ID && (t.v === 'function' || t.v === 'catch')) {
      const open = isPunct(toks[k + 1], '(') ? k + 1 : isId(toks[k + 1]) && isPunct(toks[k + 2], '(') ? k + 2 : -1
      if (open >= 0 && match[open]! > 0) bindingsIn(toks, open, match[open]!, names)
    }
  }
  return names
}

interface Closure {
  /** The first parameter's name when it is a plain name; null for none or a pattern. */
  first: string | null
  params: Set<string>
  bodyFrom: number
  bodyTo: number
}

/** The closure that is the value of the property `run` at toks[i] (`run`, `:`, then an arrow or a function expression), or null for any other value. */
function closureAt(toks: readonly Tok[], match: Int32Array, i: number): Closure | null {
  let j = i + 2
  if (isId(toks[j], 'async')) j++
  const params = new Set<string>()
  let first: string | null = null
  let k: number
  if (isId(toks[j], 'function')) {
    j++
    if (isId(toks[j])) j++
    if (!isPunct(toks[j], '(') || match[j]! < 0) return null
    bindingsIn(toks, j, match[j]!, params)
    first = plainFirst(toks, j)
    k = match[j]! + 1
    while (k < toks.length && !isPunct(toks[k], '{')) k++
    if (k >= toks.length || match[k]! < 0) return null
    return { first, params, bodyFrom: k, bodyTo: match[k]! }
  }
  if (isPunct(toks[j], '(')) {
    if (match[j]! < 0) return null
    bindingsIn(toks, j, match[j]!, params)
    first = plainFirst(toks, j)
    k = match[j]! + 1
    if (isPunct(toks[k], ':')) {
      // A return type: walk to the arrow, stepping over bracketed parts.
      for (k++; k < toks.length && !isPunct(toks[k], '=>'); k++) {
        if (isOpen(toks[k]) && match[k]! > 0) k = match[k]!
        else if (isClose(toks[k]) || isPunct(toks[k], ',') || isPunct(toks[k], ';')) return null
      }
    }
  } else if (isId(toks[j]) && isPunct(toks[j + 1], '=>')) {
    params.add(toks[j]!.v)
    first = toks[j]!.v
    k = j + 1
  } else return null
  if (!isPunct(toks[k], '=>')) return null
  const b = k + 1
  if (b >= toks.length) return null
  if (isPunct(toks[b], '{')) return match[b]! < 0 ? null : { first, params, bodyFrom: b, bodyTo: match[b]! }
  // An expression body ends before the comma, the semicolon or the closing bracket that belongs to what holds the property.
  const hole = toks[b]!.td
  let e = b
  for (; e < toks.length; e++) {
    const t = toks[e]!
    if (isOpen(t)) {
      if (match[e]! < 0) break
      e = match[e]!
    } else if (isClose(t) || (t.td === hole && (isPunct(t, ',') || isPunct(t, ';')))) break
  }
  return { first, params, bodyFrom: b, bodyTo: e - 1 }
}

/** The first parameter of the list that opens at toks[open], when it is a single plain name (`(gg)`, `(gg: GameState, ...)`, `(gg = 1)`). */
function plainFirst(toks: readonly Tok[], open: number): string | null {
  const a = toks[open + 1]
  const b = toks[open + 2]
  if (a === undefined || a.k !== K_ID || b === undefined || b.k !== K_PUNCT) return null
  return b.v === ',' || b.v === ')' || b.v === ':' || b.v === '?' || b.v === '=' ? a.v : null
}

/** What the scan saw: the slips, how many `run` closures it read and how many writer calls were inside them. */
interface ScanResult {
  slips: Slip[]
  closures: number
  calls: number
}

/** The scan: every `run` closure of the files, and in it every writer call whose first argument is a name the closure does not have. */
function scanRunClosures(files: readonly SourceFile[]): ScanResult {
  const slips = new Map<string, Slip>()
  let closures = 0
  let calls = 0
  for (const f of files) {
    const toks = f.toks
    if (!f.text.includes('Relationship')) continue
    const match = matchTable(toks)
    for (let i = 1; i + 2 < toks.length; i++) {
      if (!isId(toks[i], 'run') || !isPunct(toks[i + 1], ':')) continue
      if (isPunct(toks[i - 1], '.') || isPunct(toks[i - 1], '?')) continue
      const c = closureAt(toks, match, i)
      if (c === null) continue
      closures++
      const own = new Set([...c.params, ...declaredIn(toks, match, c.bodyFrom, c.bodyTo)])
      for (let k = c.bodyFrom; k <= c.bodyTo; k++) {
        const t = toks[k]!
        if (t.k !== K_ID || !WRITERS.has(t.v) || !isPunct(toks[k + 1], '(')) continue
        const prev = toks[k - 1]
        if (isPunct(prev, '.') || isPunct(prev, '?.') || isId(prev, 'function')) continue
        calls++
        const a = toks[k + 2]
        if (a === undefined || a.k !== K_ID || !(isPunct(toks[k + 3], ',') || isPunct(toks[k + 3], ')'))) continue
        if (own.has(a.v)) continue
        const line = lineOf(f.text, t.p)
        slips.set(`${f.path}:${line}:${t.p}`, { path: f.path, line, callee: t.v, arg: a.v, param: c.first ?? '(none)' })
      }
    }
  }
  return { slips: [...slips.values()], closures, calls }
}

/** One line per slip, for the failure message. */
function describeSlips(slips: readonly Slip[]): string {
  return slips
    .map((s) => `${s.path}:${s.line} ${s.callee}(${s.arg}, ...) inside run: (${s.param}) => ...: the action runs on ${s.param === '(none)' ? 'the state it is given' : s.param}, and ${s.arg} is the state the menu was built from`)
    .join('\n')
}

const at = (text: string): ScanResult => scanRunClosures([toSource('src/game/fixture.ts', text)])
const lines = (...l: string[]): string => l.join('\n')

// ---------------------------------------------------------------------------------------------------------------------
// The scan of the game

describe('relationship writes in run closures (src/game)', () => {
  const sources = loadSources(ROOT, 'src/game')
  const result = scanRunClosures(sources)

  it('every addRelationship, setRelationship and bumpRelationship in a run closure names a state the closure has', () => {
    expect(result.slips, describeSlips(result.slips)).toEqual([])
  })

  it('reads a real number of closures and calls, so a change of the lexer or of the shapes cannot make it pass by seeing nothing', () => {
    expect(sources.length).toBeGreaterThan(500)
    expect(result.closures).toBeGreaterThan(300)
    expect(result.calls).toBeGreaterThan(30)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The scan itself

describe('the scan itself', () => {
  it('finds the defect of prison.ts as the codemod left it: the menu builder g inside run: (gg)', () => {
    const text = lines(
      'function letterNodes(g: GameState): MenuNode[] {',
      '  return g.people.map((person): MenuAction => ({',
      "    type: 'action',",
      '    disabledReason: (gg) => (yearActionsUsed(gg, person.id) >= 1 ? "no" : null),',
      '    run: (gg) => {',
      '      const target = getPerson(gg, person.id)',
      '      if (chance(gg, 0.2)) return',
      '      addRelationship(g, target, randInt(gg, 4, 10))',
      "      addStat(gg, 'happiness', randInt(gg, 2, 5))",
      '    },',
      '  }))',
      '}',
    )
    const r = at(text)
    expect(r.closures).toBe(1)
    expect(r.calls).toBe(1)
    expect(r.slips).toEqual([{ path: 'src/game/fixture.ts', line: 8, callee: 'addRelationship', arg: 'g', param: 'gg' }])
  })

  it('passes the same closure once the call names gg', () => {
    const text = lines('function letterNodes(g: GameState) {', '  return { run: (gg) => { addRelationship(gg, target, randInt(gg, 4, 10)) } }', '}')
    expect(at(text).slips).toEqual([])
    expect(at(text).calls).toBe(1)
  })

  describe.each([
    ['setRelationship, parameter ng', 'const a = { run: (ng) => { setRelationship(g, p, 5) } }', 'setRelationship', 'ng'],
    ['bumpRelationship, parameter game', 'const a = { run: (game) => { bumpRelationship(g, p, 3) } }', 'bumpRelationship', 'game'],
    ['an expression body', 'const a = { run: (gg) => addRelationship(g, p, 1), other: 1 }', 'addRelationship', 'gg'],
    ['an async arrow', 'const a = { run: async (gg) => { addRelationship(g, p, 1) } }', 'addRelationship', 'gg'],
    ['a function expression', 'const a = { run: function (gg) { addRelationship(g, p, 1) } }', 'addRelationship', 'gg'],
    ['typed parameters and a return type', 'const a = { run: (gg: GameState, input?: string): void => { addRelationship(g, p, 1) } }', 'addRelationship', 'gg'],
    ['no parameter at all', 'const a = { run: () => { addRelationship(g, p, 1) } }', 'addRelationship', '(none)'],
    ['a bare single parameter', 'const a = { run: gg => addRelationship(g, p, 1) }', 'addRelationship', 'gg'],
    ['a callback inside the closure that has only a person', 'const a = { run: (gg) => { ps.forEach((p) => addRelationship(g, p, 1)) } }', 'addRelationship', 'gg'],
    ['a template hole', "const a = { run: (gg) => { log(gg, `x ${addRelationship(g, p, 1)}`) } }", 'addRelationship', 'gg'],
    ['a destructured first parameter that does not bind g', 'const a = { run: ({ s }) => { addRelationship(g, p, 1) } }', 'addRelationship', '(none)'],
  ])('flags %s', (_name, text, callee, param) => {
    it('one slip, named', () => {
      const r = at(text)
      expect(r.slips).toHaveLength(1)
      expect(r.slips[0]).toMatchObject({ callee, arg: 'g', param })
    })
  })

  describe.each([
    ['the closure parameter itself', 'const a = { run: (gg) => { addRelationship(gg, p, 1) } }'],
    ['any parameter of the closure, not only the first', 'const a = { run: (a, g) => addRelationship(g, p, 1) }'],
    ['a destructured parameter', 'const a = { run: ({ g }) => addRelationship(g, p, 1) }'],
    ['a name destructured inside', 'const a = { run: (c) => { const { g } = c; addRelationship(g, p, 1) } }'],
    ['a const declared inside', 'const a = { run: (c) => { const g = c.g; setRelationship(g, p, 1) } }'],
    ['a callback with its own game parameter', 'const a = { run: (gg) => { fns.forEach((g) => addRelationship(g, p, 1)) } }'],
    ['a first argument that is not a single name', 'const a = { run: (gg) => addRelationship(c.g, p, 1) }'],
    ['a mention in a comment and in a string', "const a = { run: (gg) => { /* addRelationship(g, p, 1) */ log(gg, 'addRelationship(g, p, 1)') } }"],
    ['a method of something else', 'const a = { run: (gg) => { kit.addRelationship(g, p, 1) } }'],
    ['a value that is a reference and not a closure', 'const a = { run: startDating }'],
    ['a sibling callback that is not run', 'const a = { run: (gg) => log(gg, 1), subtitle: (g) => addRelationship(g, p, 1) }'],
    ['a call that follows the closure in the same object', 'const a = { run: (gg) => { addRelationship(gg, p, 1) }, next: (g) => addRelationship(g, p, 1) }'],
    ['a helper outside any run', 'function helper(g: GameState, p: Person) { addRelationship(g, p, 1) }'],
    ['a type that declares run', 'interface A { run: (g: GameState) => void }'],
  ])('passes %s', (_name, text) => {
    it('no slip', () => {
      expect(at(text).slips).toEqual([])
    })
  })

  it('reports every slip of a file, in order, with its own line', () => {
    const text = lines('const a = {', '  run: (gg) => addRelationship(g, p, 1),', '  run2: 0,', '}', 'const b = {', '  run: (ng) => {', '    setRelationship(g, p, 2)', '  },', '}')
    const r = at(text)
    expect(r.closures).toBe(2)
    expect(r.slips.map((s) => [s.line, s.callee, s.param])).toEqual([
      [2, 'addRelationship', 'gg'],
      [7, 'setRelationship', 'ng'],
    ])
  })

  it('counts a closure and its calls even when nothing is wrong', () => {
    const r = at('const a = { run: (g) => { addRelationship(g, p, 1); setRelationship(g, q, 2) }, run: (g) => { log(g, 1) } }')
    expect(r).toEqual({ slips: [], closures: 2, calls: 2 })
  })

  it('does not look at a file that never mentions a relationship writer', () => {
    expect(scanRunClosures([toSource('src/game/other.ts', 'const a = { run: (gg) => { add(g, 1) } }')])).toEqual({ slips: [], closures: 0, calls: 0 })
  })
})
