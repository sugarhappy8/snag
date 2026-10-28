// ci: fast
// R4-S11 (X50, C25, X15): the registry's static scans. Three token scans over src/game (test/scan-kit.ts, so a mention in a comment, a
// string or a template is never a hit):
//
//   1. Money. The files of the registry book no dollar and draw no luck from g.rng: world/sid.ts, latent.ts, every met*.ts, axes.ts,
//      persona-me.ts and materialize.ts have no `.money` or `.cash` write, no `['money']`, no `Object.assign(` on anything but a local
//      object they just made, no `personPurse`, `bookMint`, `bookBurn`, `earnIncome`, `spend` or `addMoney`, no `Math.random`, and no call
//      of rand, randInt, chance, pick, shuffle or the like. The only money in them is the opening balance that materialize.ts hands to
//      createPerson (docs/LEDGER.md, rule 6), which is an option and not a write.
//   2. Streams. Every `stream(` and `outcomeStream(` call of those files names its tag as one string literal that has a row in
//      test/stream-tap.ts STREAM_SLICES (test/stream-isolation.test.ts holds the same rule for the whole tree and proves each row; this
//      one names the files of the registry, so a draw added there fails here first). Today the registry draws from none: its luck is
//      streamKey and streamUnit, which are hashes and not streams.
//   3. The sid. `Person.data.sid` renames the ledger account of the person (cash.ts), so it is written by two places only (X15):
//      src/game/materialize.ts and src/game/modules/heirs.ts (L9's heirSpouseOverrides). The scan finds a member write `x.sid = ...`,
//      a bracket write `x['sid'] = ...`, and a `sid` key (or shorthand) at the top of an object literal that is the value of a `data`
//      key, a `data = ...` assignment or an argument of Object.assign. kernel/person-ref.ts is E15's list, not this one.
//
// The self-test of each scan proves it can fail: a synthetic file for every rule, and clean files that must pass. Limits, on purpose: the
// scans read tokens and not types. A sid written through a variable that is built elsewhere (`const d = { sid }; ... data: d`) is not
// seen by scan 3; the acceptance probe (test/registry-acceptance.test.ts) checks the other end at run time, that every Person with a
// sid has a Met record and is not a child, stepchild or grandchild.
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, K_STR, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'
import { STREAM_SLICES } from './stream-tap'

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** The eight files the plan names (X50). The scan reads every `world/met*.ts` besides, and these must exist. */
const NAMED = [
  'src/game/world/sid.ts',
  'src/game/world/latent.ts',
  'src/game/world/met.ts',
  'src/game/world/met-names.ts',
  'src/game/world/met-ops.ts',
  'src/game/world/axes.ts',
  'src/game/world/persona-me.ts',
  'src/game/materialize.ts',
] as const

/** The two places that may write `data.sid` (X15). L9's file does not exist until the Life track merges; naming it here is the rule. */
const SID_WRITERS: readonly string[] = ['src/game/materialize.ts', 'src/game/modules/heirs.ts']

/** True for a file of the registry: a named file, or any `world/met-*.ts` that a later task adds. */
const inRegistry = (path: string): boolean => (NAMED as readonly string[]).includes(path) || /^src\/game\/world\/met-[a-z0-9-]+\.ts$/.test(path)

interface Finding {
  line: number
  /** The rule that fired: `.money =`, `['cash']`, `Object.assign(`, `spend`, `Math.random`, `rand(`, `.rng`, `stream(`, `sid`... */
  rule: string
}

const WRITE_OPS: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '??=', '||=', '&&=', '<<=', '>>=', '>>>=', '&=', '|=', '^='])
const BUMPS: ReadonlySet<string> = new Set(['++', '--'])
/** Names that move or make money outside a plain option. Any mention counts: the registry has no business with a purse. */
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

/** The money and luck findings of one file (scan 1). */
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
      } else if (DRAWS.has(t.v) && !member && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) at(t, `${t.v}(`)
      else if (t.v === 'rng' && member) at(t, '.rng')
    } else if (t.k === K_STR && (t.v === 'money' || t.v === 'cash') && isPunct(toks[i - 1], '[') && isPunct(toks[i + 1], ']')) {
      at(t, `['${t.v}']`)
    }
  }
  return out
}

/** The stream calls of one file whose tag is not one literal with a row in STREAM_SLICES (scan 2). */
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

/** True when the object literal that opens at toks[open] has `sid` as a key of its own top level: `{ sid: x }`, `{ ...a, sid }`, `{ 'sid': x }`. */
function literalHasSid(toks: readonly Tok[], open: number): boolean {
  let depth = 0
  for (let i = open; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_PUNCT && (t.v === '{' || t.v === '[' || t.v === '(')) depth++
    else if (t.k === K_PUNCT && (t.v === '}' || t.v === ']' || t.v === ')')) {
      if (--depth === 0) return false
    } else if (depth === 1 && (isId(t, 'sid') || (t.k === K_STR && t.v === 'sid'))) {
      const prev = toks[i - 1]
      const next = toks[i + 1]
      if ((isPunct(prev, '{') || isPunct(prev, ',')) && (isPunct(next, ':') || isPunct(next, ',') || isPunct(next, '}'))) return true
    }
  }
  return false
}

/** The writes of `data.sid` in one file (scan 3): see the header for the three shapes. */
function sidFindings(src: SourceFile): Finding[] {
  const out: Finding[] = []
  const { toks, text } = src
  const at = (t: Tok, rule: string): void => void out.push({ line: lineOf(text, t.p), rule })
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    const next = toks[i + 1]
    // x.sid = ...   x?.sid += ...   x.sid++
    if (isId(t, 'sid') && (isPunct(toks[i - 1], '.') || isPunct(toks[i - 1], '?.')) && next !== undefined && next.k === K_PUNCT && (WRITE_OPS.has(next.v) || BUMPS.has(next.v))) at(t, '.sid write')
    // x['sid'] = ...
    else if (t.k === K_STR && t.v === 'sid' && isPunct(toks[i - 1], '[') && isPunct(next, ']') && toks[i + 2]?.k === K_PUNCT && WRITE_OPS.has(toks[i + 2]!.v)) at(t, "['sid'] write")
    // data: { sid }   data = { ...d, sid: x }
    else if (isId(t, 'data') && (isPunct(next, ':') || isPunct(next, '=')) && isPunct(toks[i + 2], '{') && literalHasSid(toks, i + 2)) at(t, 'a sid in a data literal')
    // Object.assign(p.data, { sid })
    else if (isId(t, 'Object') && isPunct(next, '.') && isId(toks[i + 2], 'assign') && isPunct(toks[i + 3], '(')) {
      const close = closeParen(toks, i + 3)
      if (close < 0) continue
      let depth = 0
      for (let j = i + 4; j < close; j++) {
        const u = toks[j]!
        if (u.k === K_PUNCT && (u.v === '(' || u.v === '[')) depth++
        else if (u.k === K_PUNCT && (u.v === ')' || u.v === ']')) depth--
        else if (u.k === K_PUNCT && u.v === '{') {
          if (depth === 0 && literalHasSid(toks, j)) at(t, 'a sid in an Object.assign literal')
          depth++
        } else if (u.k === K_PUNCT && u.v === '}') depth--
      }
    }
  }
  return out
}

let cache: SourceFile[] | null = null
const sources = (): SourceFile[] => (cache ??= loadSources())

const lines = (f: readonly Finding[]): string[] => f.map((x) => `${x.line}: ${x.rule}`)
const money = (code: string): string[] => moneyFindings(toSource('src/game/world/x.ts', code)).map((f) => f.rule)
const streams = (code: string): string[] => streamFindings(toSource('src/game/world/x.ts', code)).map((f) => f.rule)
const sids = (code: string): string[] => sidFindings(toSource('src/game/x.ts', code)).map((f) => f.rule)

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Money and luck

describe('registry money scan: the real files', () => {
  const files = (): SourceFile[] => sources().filter((s) => inRegistry(s.path))

  it('has a file list that is not empty and names every file of the plan', () => {
    const paths = files().map((s) => s.path)
    expect(paths.length).toBeGreaterThanOrEqual(NAMED.length)
    for (const p of NAMED) expect(paths, `${p} is gone or renamed`).toContain(p)
    for (const s of files()) expect(s.toks.length, `${s.path} lexed to nothing`).toBeGreaterThan(50)
  })

  it('books no dollar, writes no purse and draws no g.rng in any of them', () => {
    const bad = files().flatMap((s) => lines(moneyFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('still lets materialize.ts hand the opening balance to createPerson as an option (the one money literal, LEDGER.md rule 6)', () => {
    const src = sources().find((s) => s.path === 'src/game/materialize.ts')!
    const hasOption = src.toks.some((t, i) => isId(t, 'money') && isPunct(src.toks[i + 1], ':') && isId(src.toks[i + 2], 'whole'))
    expect(hasOption).toBe(true)
    expect(moneyFindings(src)).toEqual([])
  })
})

describe('registry money scan: the self-test', () => {
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

  it('finds Math.random and a draw of g.rng, and an Object.assign that is not on a patch made in the file', () => {
    expect(money('const u = Math.random()')).toEqual(['Math.random'])
    expect(money('const a = rand(g)')).toEqual(['rand('])
    expect(money('const a = chance(g, 0.5) && pick(g, xs)')).toEqual(['chance(', 'pick('])
    expect(money('const s = g.rng')).toEqual(['.rng'])
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

  it('passes the shapes that look alike: an option, a read, a method, a comment and a string', () => {
    expect(money('const o = { money: whole(opts.money, 0, 1e12, 0) }')).toEqual([])
    expect(money('const m = p.money + q.cash')).toEqual([])
    expect(money('if (p.money === 5 || b.cash >= 3) return')).toEqual([])
    expect(money('const { money } = p')).toEqual([])
    expect(money('const a = xs.pick(1)\nconst b = s.rand()')).toEqual([])
    expect(money('function pick(xs) { return xs[0] }')).toEqual([])
    expect(money('// p.money = 5 and spend(g) and Math.random() and personPurse(p)\nconst a = 1')).toEqual([])
    expect(money("const s = 'spend(g) and p.money = 5 and addMoney'")).toEqual([])
    expect(money('const s = `Math.random ${x} bookMint`')).toEqual([])
    expect(money("const k = { rng: 1 }\nconst j = ks['rng']")).toEqual([])
    expect(money("const k = obj['moneyLine']")).toEqual([])
  })

  it('names the line of each finding', () => {
    const f = moneyFindings(toSource('src/game/world/x.ts', 'const a = 1\n\np.money = 5\nconst b = 2\nspend(g, 3)'))
    expect(f.map((x) => x.line)).toEqual([3, 5])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Streams

describe('registry stream scan', () => {
  const files = (): SourceFile[] => sources().filter((s) => inRegistry(s.path))

  it('finds no stream( or outcomeStream( call in the registry files with a tag that has no row in STREAM_SLICES', () => {
    const bad = files().flatMap((s) => lines(streamFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('reads the table it is given: the tags of today are listed, the tag of a registry draw would not be', () => {
    expect(Object.keys(STREAM_SLICES).length).toBeGreaterThan(5)
    expect(hasOwn(STREAM_SLICES, 'lod')).toBe(true)
    expect(hasOwn(STREAM_SLICES, 'registry.unlisted')).toBe(false)
  })

  it('has teeth: a listed tag passes, an unlisted tag, a computed tag and a missing tag are findings', () => {
    expect(streams("const r = stream(g, 'lod', 0, 'person:x')")).toEqual([])
    expect(streams("const r = outcomeStream(g, 'frontier', 2030, 'x')")).toEqual([])
    expect(streams("const r = stream(g, 'registry.unlisted', 0, 'x')")).toEqual(["stream( with the unlisted tag 'registry.unlisted'"])
    expect(streams("const r = outcomeStream(g, 'nowhere', 1, 'x')")).toEqual(["outcomeStream( with the unlisted tag 'nowhere'"])
    expect(streams('const r = stream(g, tag, 0)')).toEqual(['stream( with a tag that is not one string literal'])
    expect(streams("const r = stream(g, 'lod' + k, 0)")).toEqual(['stream( with a tag that is not one string literal'])
    expect(streams('const r = stream(g)')).toEqual(['stream( with a tag that is not one string literal'])
  })

  it('does not take streamKey, streamUnit, a method or a declaration for a draw, and reads a table of its own', () => {
    expect(streams("const k = streamKey(seed, 'soc.latent', 0, sid)\nconst u = streamUnit(k, 3)")).toEqual([])
    expect(streams("const r = bus.stream(g, 'nowhere', 0)")).toEqual([])
    expect(streams('function stream(g, tag, year) { return 1 }')).toEqual([])
    expect(streams("// stream(g, 'nowhere', 0)\nconst s = \"stream(g, 'nowhere', 0)\"")).toEqual([])
    expect(streamFindings(toSource('src/game/world/x.ts', "stream(g, 'mine', 0)"), { mine: 1 })).toEqual([])
    expect(streamFindings(toSource('src/game/world/x.ts', "stream(g, 'yours', 0)"), { mine: 1 })).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The sid

describe('registry sid scan (X15): data.sid is written by materialize.ts and modules/heirs.ts only', () => {
  it('finds no other write in src/game', () => {
    const bad = sources()
      .filter((s) => s.path.startsWith('src/game/') && !SID_WRITERS.includes(s.path))
      .flatMap((s) => lines(sidFindings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('is not blind: it sees the write that materialize.ts makes', () => {
    const src = sources().find((s) => s.path === 'src/game/materialize.ts')!
    expect(sidFindings(src).map((f) => f.rule)).toEqual(['a sid in a data literal'])
    expect(SID_WRITERS).toEqual(['src/game/materialize.ts', 'src/game/modules/heirs.ts'])
  })

  it('finds a member write, a bracket write and a sid in a data literal in each form', () => {
    expect(sids('p.data.sid = s')).toEqual(['.sid write'])
    expect(sids('p.data.sid ??= s')).toEqual(['.sid write'])
    expect(sids('p.data?.sid = s')).toEqual(['.sid write'])
    expect(sids("p.data['sid'] = s")).toEqual(["['sid'] write"])
    expect(sids('createPerson(g, { relation: x, data: { sid } })')).toEqual(['a sid in a data literal'])
    expect(sids('createPerson(g, { relation: x, data: { sid: s, a: 1 } })')).toEqual(['a sid in a data literal'])
    expect(sids('createPerson(g, { data: { ...extra, sid } })')).toEqual(['a sid in a data literal'])
    expect(sids("createPerson(g, { data: { a: 1, 'sid': s } })")).toEqual(['a sid in a data literal'])
    expect(sids('p.data = { ...p.data, sid: s }')).toEqual(['a sid in a data literal'])
    expect(sids('const o = { data: { sid } }')).toEqual(['a sid in a data literal'])
    expect(sids('Object.assign(p.data, { sid })')).toEqual(['a sid in an Object.assign literal'])
    expect(sids('Object.assign(p.data, { a: 1 }, { sid: s })')).toEqual(['a sid in an Object.assign literal'])
  })

  it('passes the shapes that look alike: a read, a type, a local, a nested key and a comment', () => {
    expect(sids('const s = p.data.sid')).toEqual([])
    expect(sids('if (p.data?.sid === key) return')).toEqual([])
    expect(sids('const sid = p.data?.sid')).toEqual([])
    expect(sids('interface Slot { sid: string; born: number }')).toEqual([])
    expect(sids('function f(seed: { sid: string; first: string }) {}')).toEqual([])
    expect(sids('return { sid, born, health }')).toEqual([])
    expect(sids('const { sid, born } = base')).toEqual([])
    expect(sids('createPerson(g, { data: { x: { sid } } })')).toEqual([])
    expect(sids('createPerson(g, { data: { skinTone: 3 } })\nconst sid = makeSid(slot)')).toEqual([])
    expect(sids('// p.data.sid = s and data: { sid }\nconst a = 1')).toEqual([])
    expect(sids("const s = 'data: { sid }'")).toEqual([])
    expect(sids('Object.assign(out, { born })')).toEqual([])
    expect(sids('const id = lat.sid\nlat.sidx = 5')).toEqual([])
  })

  it('names the line of each finding', () => {
    const f = sidFindings(toSource('src/game/x.ts', 'const a = 1\n\np.data.sid = s\nconst b = 2\ncreatePerson(g, { data: { sid } })'))
    expect(f.map((x) => x.line)).toEqual([3, 5])
  })
})
