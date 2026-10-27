// ci: fast
// R4-L12 (X50, X37, X15): the static scans of the Life track. Three token scans over the ten files that carry the kin links, the estate,
// the debts, the hand-over helpers and the quarrel of the will (test/scan-kit.ts reads tokens, so a mention in a comment, a string or a
// template is never a hit):
//
//   1. Money. None of them writes a purse around the ledger or makes a dollar: no `.money` or `.cash` write (`=`, `+=`, `++` and the
//      rest, prefix or postfix), no `['money']` or `['cash']`, no `Object.assign(` on anything but a patch the file just made, no
//      `personPurse` (the one door to a person's cash is cash.ts `moveCash` and `personCash`, and they are not a hit), no `bookMint`,
//      `bookBurn`, `earnIncome`, `spend` or `addMoney`, no `Math.random`. A dollar these files move goes through `moveCash`,
//      `personCash`, `serviceDebt` or `payHeirs`, each of which books it with a named counterparty.
//   2. Luck. None draws from `g.rng` (the draw functions of rng.ts as a bare call, and the member `.rng`). The only luck of the track is
//      keyed (`outcomeStream`, `streamKey`, `streamUnit`, the text kit), and the draw-free values of the Met face.
//   3. Streams. Every `stream(` and `outcomeStream(` call of those files names its tag as one string literal that has a row in
//      test/stream-tap.ts STREAM_SLICES (test/stream-isolation.test.ts holds the same rule for the whole tree and proves each row; this
//      one names the files of the track, so a draw added there fails here first).
//
// The files are the ones of X50: src/game/kin.ts, divorce-debt.ts, world/kin.ts, world/life-path.ts, world/mortality.ts, modules/heirs.ts,
// modules/kin-estates.ts, modules/kin-years.ts, modules/divorce-years.ts and events/will-strife.ts. The list may not be empty, and each
// file must exist and lex to something. A self-test proves every rule can fail (a synthetic file for each, and clean ones that must pass).
//
// Limits, on purpose: the scans read tokens and not types. A purse written through a variable that was made elsewhere
// (`const p = who(); p.money = 1` is seen, `Reflect.set(p, 'money', 1)` is not) is the business of test/money-ratchet.test.ts and of the
// strict ledger drift of test/life-acceptance.test.ts, which checks the other end at run time.
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, K_STR, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'
import { STREAM_SLICES } from './stream-tap'

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** The ten files of the track (X50). Every one of them must exist. */
const FILES = [
  'src/game/kin.ts',
  'src/game/divorce-debt.ts',
  'src/game/world/kin.ts',
  'src/game/world/life-path.ts',
  'src/game/world/mortality.ts',
  'src/game/modules/heirs.ts',
  'src/game/modules/kin-estates.ts',
  'src/game/modules/kin-years.ts',
  'src/game/modules/divorce-years.ts',
  'src/game/events/will-strife.ts',
] as const

interface Finding {
  line: number
  /** The rule that fired: `.money =`, `['cash']`, `Object.assign(`, `spend`, `Math.random`, `rand(`, `.rng`, `stream(`... */
  rule: string
}

const WRITE_OPS: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '??=', '||=', '&&=', '<<=', '>>=', '>>>=', '&=', '|=', '^='])
const BUMPS: ReadonlySet<string> = new Set(['++', '--'])
/** Names that move or make money outside the ledger's doors. Any mention counts: the track has no business with a purse of its own. */
const MONEY_NAMES: ReadonlySet<string> = new Set(['personPurse', 'bookMint', 'bookBurn', 'earnIncome', 'spend', 'addMoney'])
/** The draws of g.rng (rng.ts), as a bare call. A method of another name is a different thing. */
const DRAWS: ReadonlySet<string> = new Set(['rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell'])

/** The index of the first identifier of the member chain that ends at toks[i] (`a.b?.c[d].e` walked back), so a prefix `++` or `--` can be seen. */
function chainStart(toks: readonly Tok[], i: number): number {
  let j = i
  for (;;) {
    if (!isPunct(toks[j - 1], '.') && !isPunct(toks[j - 1], '?.')) return j
    let k = j - 2
    // The receiver may end in an index or a call: walk back over its brackets to the name before them.
    while (isPunct(toks[k], ']') || isPunct(toks[k], ')')) {
      const close = toks[k]!.v
      const open = close === ']' ? '[' : '('
      let depth = 0
      for (; k >= 0; k--) {
        if (isPunct(toks[k], close)) depth++
        else if (isPunct(toks[k], open) && --depth === 0) break
      }
      k -= 1
    }
    if (k < 0 || toks[k]!.k !== K_ID) return j
    j = k
  }
}

/** True when `name` was declared in the file as an empty object: `const name = {}` or `const name: T = {}` (a patch built here, not a Person). */
function madeHere(toks: readonly Tok[], name: string): boolean {
  for (let i = 0; i + 2 < toks.length; i++) {
    if (!(isId(toks[i], 'const') || isId(toks[i], 'let')) || !isId(toks[i + 1], name)) continue
    for (let j = i + 2; j < toks.length && j < i + 16; j++) {
      if (isPunct(toks[j], ';')) break
      if (isPunct(toks[j], '=')) {
        if (isPunct(toks[j + 1], '{') && isPunct(toks[j + 2], '}')) return true
        break
      }
    }
  }
  return false
}

/** The money findings of one file (scan 1). */
function moneyFindings(src: SourceFile): Finding[] {
  const out: Finding[] = []
  const { toks, text } = src
  const at = (t: Tok, rule: string): void => void out.push({ line: lineOf(text, t.p), rule })
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_ID) {
      const member = isPunct(toks[i - 1], '.') || isPunct(toks[i - 1], '?.')
      if ((t.v === 'money' || t.v === 'cash') && member) {
        const next = toks[i + 1]
        if (next !== undefined && next.k === K_PUNCT && (WRITE_OPS.has(next.v) || BUMPS.has(next.v))) at(t, `.${t.v} ${next.v}`)
        else {
          const before = toks[chainStart(toks, i) - 1]
          if (before !== undefined && before.k === K_PUNCT && BUMPS.has(before.v)) at(t, `${before.v} .${t.v}`)
        }
      } else if (MONEY_NAMES.has(t.v) && !member) at(t, t.v)
      else if (t.v === 'Math' && isPunct(toks[i + 1], '.') && isId(toks[i + 2], 'random')) at(t, 'Math.random')
      else if (t.v === 'Object' && isPunct(toks[i + 1], '.') && isId(toks[i + 2], 'assign') && isPunct(toks[i + 3], '(')) {
        // Object.assign on a Person is how a purse is written around the ledger. A patch the file just made (`const out = {}`) is not a Person.
        const close = closeParen(toks, i + 3)
        const first = close < 0 ? undefined : splitArgs(toks, i + 3, close)[0]
        const local = first !== undefined && first.length === 1 && first[0]!.k === K_ID && madeHere(toks, first[0]!.v)
        if (!local) at(t, 'Object.assign(')
      }
    } else if (t.k === K_STR && (t.v === 'money' || t.v === 'cash') && isPunct(toks[i - 1], '[') && isPunct(toks[i + 1], ']')) {
      at(t, `['${t.v}']`)
    }
  }
  return out
}

/** The draws of g.rng in one file (scan 2): a bare call of a draw function, and the member `.rng`. */
function luckFindings(src: SourceFile): Finding[] {
  const out: Finding[] = []
  const { toks, text } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID) continue
    const member = isPunct(toks[i - 1], '.') || isPunct(toks[i - 1], '?.')
    if (DRAWS.has(t.v) && !member && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) out.push({ line: lineOf(text, t.p), rule: `${t.v}(` })
    else if (t.v === 'rng' && member) out.push({ line: lineOf(text, t.p), rule: '.rng' })
  }
  return out
}

/** The stream calls of one file whose tag is not one literal with a row in STREAM_SLICES (scan 3). */
function streamFindings(src: SourceFile, rows: Readonly<Record<string, unknown>> = STREAM_SLICES): Finding[] {
  const out: Finding[] = []
  const { toks, text } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID || (t.v !== 'stream' && t.v !== 'outcomeStream') || !isPunct(toks[i + 1], '(')) continue
    if (isPunct(toks[i - 1], '.') || isId(toks[i - 1], 'function')) continue
    const close = closeParen(toks, i + 1)
    const tag = close < 0 ? undefined : splitArgs(toks, i + 1, close)[1]
    const literal = tag !== undefined && tag.length === 1 && tag[0]!.k === K_STR ? tag[0]!.v : null
    if (literal === null) out.push({ line: lineOf(text, t.p), rule: `${t.v}( with a tag that is not one string literal` })
    else if (!hasOwn(rows, literal)) out.push({ line: lineOf(text, t.p), rule: `${t.v}( with the unlisted tag '${literal}'` })
  }
  return out
}

let cache: SourceFile[] | null = null
const sources = (): SourceFile[] => (cache ??= loadSources())
const files = (): SourceFile[] => sources().filter((s) => (FILES as readonly string[]).includes(s.path))

const lines = (f: readonly Finding[]): string[] => f.map((x) => `${x.line}: ${x.rule}`)
const money = (code: string): string[] => moneyFindings(toSource('src/game/kin.ts', code)).map((f) => f.rule)
const luck = (code: string): string[] => luckFindings(toSource('src/game/kin.ts', code)).map((f) => f.rule)
const streams = (code: string): string[] => streamFindings(toSource('src/game/kin.ts', code)).map((f) => f.rule)

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Money

describe('life money scan: the real files', () => {
  it('has a file list that is not empty, names every file of X50, and lexes each of them to something', () => {
    const paths = files().map((s) => s.path)
    expect(paths.length).toBeGreaterThanOrEqual(FILES.length)
    expect(new Set(FILES).size).toBe(FILES.length)
    for (const p of FILES) expect(paths, `${p} is gone or renamed`).toContain(p)
    for (const s of files()) expect(s.toks.length, `${s.path} lexed to nothing`).toBeGreaterThan(50)
  })

  it('books no dollar, writes no purse, and mints, burns and earns nothing in any of them', () => {
    const bad = files().flatMap((s) => lines(moneyFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('is not blind: the files that move money do it through the doors the scan lets through', () => {
    const calls = (path: string, name: string): number => {
      const src = files().find((s) => s.path === path)!
      return src.toks.filter((t, i) => isId(t, name) && isPunct(src.toks[i + 1], '(')).length
    }
    // the estate pays its heirs through moveCash, the debts through serviceDebt (which books under the reason of the debt)
    expect(calls('src/game/modules/kin-estates.ts', 'moveCash')).toBeGreaterThan(0)
    expect(calls('src/game/modules/heirs.ts', 'serviceDebt')).toBeGreaterThan(0)
    expect(calls('src/game/divorce-debt.ts', 'serviceDebt')).toBeGreaterThan(0)
  })
})

describe('life money scan: the self-test', () => {
  it('finds a write of .money and .cash in each form', () => {
    expect(money('p.money = 5')).toEqual(['.money ='])
    expect(money('p.money += 5')).toEqual(['.money +='])
    expect(money('p.character.money -= x')).toEqual(['.money -='])
    expect(money('b.cash *= 2')).toEqual(['.cash *='])
    expect(money('b.cash /= 2')).toEqual(['.cash /='])
    expect(money('g.character.money ??= 0')).toEqual(['.money ??='])
    expect(money('p.money++')).toEqual(['.money ++'])
    expect(money('--p.money')).toEqual(['-- .money'])
    expect(money('++a.b[0].money')).toEqual(['++ .money'])
    expect(money('p?.money = 3')).toEqual(['.money ='])
  })

  it('finds a bracket key, a purse, a mint, a burn, an income, a spend and an addMoney', () => {
    expect(money("p['money'] = 5")).toEqual(["['money']"])
    expect(money("const v = b['cash']")).toEqual(["['cash']"])
    expect(money('personPurse(p).add(5)')).toEqual(['personPurse'])
    expect(money('const purse = personPurse(p)')).toEqual(['personPurse'])
    expect(money("bookMint(g, 'x', acct, 5)")).toEqual(['bookMint'])
    expect(money("bookBurn(g, 'x', acct, 5)")).toEqual(['bookBurn'])
    expect(money('earnIncome(g, 5)')).toEqual(['earnIncome'])
    expect(money('spend(g, 5)')).toEqual(['spend'])
    expect(money('addMoney(g, 5)')).toEqual(['addMoney'])
  })

  it('finds Math.random and an Object.assign that is not on a patch made in the file', () => {
    expect(money('const u = Math.random()')).toEqual(['Math.random'])
    expect(money('Object.assign(p, { money: 5 })')).toEqual(['Object.assign('])
    expect(money('Object.assign(g.people[0], x)')).toEqual(['Object.assign('])
    expect(money('Object.assign(createPerson(g, o), x)')).toEqual(['Object.assign('])
  })

  it('lets a patch that the file just made take an Object.assign, and nothing else', () => {
    expect(money('const out: Patch = {}\nObject.assign(out, stake)')).toEqual([])
    expect(money('let out = {}\nObject.assign(out, stake)')).toEqual([])
    // A parameter is not made here, a non-empty literal is not a fresh patch, and a name made after a different one does not count.
    expect(money('function f(out: Patch) {\n  Object.assign(out, stake)\n}')).toEqual(['Object.assign('])
    expect(money('const out = { a: 1 }\nObject.assign(out, stake)')).toEqual(['Object.assign('])
    expect(money('const other = {}\nObject.assign(out, stake)')).toEqual(['Object.assign('])
  })

  it('passes the shapes that look alike: a read, a method, the doors of the ledger, a comment and a string', () => {
    expect(money('const m = p.money + q.cash')).toEqual([])
    expect(money('if (p.money === 5 || b.cash >= 3) return')).toEqual([])
    expect(money('const { money } = p')).toEqual([])
    expect(money("const k = obj['moneyLine']")).toEqual([])
    expect(money("moveCash(g, wholePurse(dead), wholePurse(heir), 5, 'inheritance', token)")).toEqual([])
    expect(money("serviceDebt(g, key, 5, token) + personCash(g, p, -5, 'estate', 0)")).toEqual([])
    expect(money('// p.money = 5 and spend(g) and Math.random() and personPurse(p)\nconst a = 1')).toEqual([])
    expect(money("const s = 'spend(g) and p.money = 5 and addMoney'")).toEqual([])
    expect(money('const s = `Math.random ${x} bookMint`')).toEqual([])
  })

  it('names the line of each finding', () => {
    const f = moneyFindings(toSource('src/game/kin.ts', 'const a = 1\n\np.money = 5\nconst b = 2\nspend(g, 3)'))
    expect(f.map((x) => x.line)).toEqual([3, 5])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Luck

describe('life luck scan', () => {
  it('finds no draw of g.rng in any file of the track', () => {
    const bad = files().flatMap((s) => lines(luckFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('has teeth: every draw function as a bare call and the member .rng are findings', () => {
    expect(luck('const a = rand(g)')).toEqual(['rand('])
    expect(luck('const a = randInt(g, 1, 3) + randFloat(g, 0, 1)')).toEqual(['randInt(', 'randFloat('])
    expect(luck('const a = chance(g, 0.5) && pick(g, xs)')).toEqual(['chance(', 'pick('])
    expect(luck('const a = weightedPick(g, xs) + bell(g) + shuffle(g, xs)')).toEqual(['weightedPick(', 'bell(', 'shuffle('])
    expect(luck('const s = g.rng')).toEqual(['.rng'])
    expect(luck('n.rng = old.rng')).toEqual(['.rng', '.rng'])
  })

  it('passes the keyed values, a method of the same name, a declaration, a comment and a string', () => {
    expect(luck("const u = streamUnit(streamKey(worldSeed(g), 'soc.kin', year, key), 0)")).toEqual([])
    expect(luck("const r = outcomeStream(g, 'life.path', y, sid)()")).toEqual([])
    expect(luck('const a = xs.pick(1)\nconst b = s.rand()')).toEqual([])
    expect(luck('function pick(xs) { return xs[0] }')).toEqual([])
    expect(luck('const line = pickLine(g, POOL)')).toEqual([])
    expect(luck('// rand(g) and g.rng\nconst s = "chance(g, 1)"')).toEqual([])
    expect(luck("const k = { rng: 1 }\nconst j = ks['rng']")).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Streams

describe('life stream scan', () => {
  it('finds no stream( or outcomeStream( call in the files of the track with a tag that has no row in STREAM_SLICES', () => {
    const bad = files().flatMap((s) => lines(streamFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('is not blind: the life path draws from its own tag, which has a row', () => {
    const src = files().find((s) => s.path === 'src/game/world/life-path.ts')!
    const tags = src.toks.filter((t, i) => isId(t, 'outcomeStream') && isPunct(src.toks[i + 1], '(')).length
    expect(tags).toBeGreaterThan(0)
    expect(hasOwn(STREAM_SLICES, 'life.path')).toBe(true)
  })

  it('has teeth: a listed tag passes, an unlisted tag, a computed tag and a missing tag are findings', () => {
    expect(streams("const r = stream(g, 'lod', 0, 'person:x')")).toEqual([])
    expect(streams("const r = outcomeStream(g, 'life.path', 2030, 'x')")).toEqual([])
    expect(streams("const r = stream(g, 'life.unlisted', 0, 'x')")).toEqual(["stream( with the unlisted tag 'life.unlisted'"])
    expect(streams("const r = outcomeStream(g, 'nowhere', 1, 'x')")).toEqual(["outcomeStream( with the unlisted tag 'nowhere'"])
    expect(streams('const r = stream(g, tag, 0)')).toEqual(['stream( with a tag that is not one string literal'])
    expect(streams("const r = stream(g, 'life' + k, 0)")).toEqual(['stream( with a tag that is not one string literal'])
    expect(streams('const r = stream(g)')).toEqual(['stream( with a tag that is not one string literal'])
  })

  it('does not take streamKey, streamUnit, a method or a declaration for a draw, and reads a table of its own', () => {
    expect(streams("const k = streamKey(seed, 'soc.kin', 0, sid)\nconst u = streamUnit(k, 3)")).toEqual([])
    expect(streams("const r = bus.stream(g, 'nowhere', 0)")).toEqual([])
    expect(streams('function stream(g, tag, year) { return 1 }')).toEqual([])
    expect(streams("// stream(g, 'nowhere', 0)\nconst s = \"stream(g, 'nowhere', 0)\"")).toEqual([])
    expect(streamFindings(toSource('src/game/kin.ts', "stream(g, 'mine', 0)"), { mine: 1 })).toEqual([])
    expect(streamFindings(toSource('src/game/kin.ts', "stream(g, 'yours', 0)"), { mine: 1 })).toHaveLength(1)
  })
})
