// ci: fast
// R4-E15 (X50, C25; part A): the static money scan of the social track. One token scan over src/game (test/scan-kit.ts, so a mention in a
// comment, a string or a template is never a hit) of the files that make, keep and step the web of people:
//
//   society/*.ts                the acts, the favors, the loans and debts, the secrets, the feuds, the mentor and the menu
//   world/edge*.ts              the edge model, its writer, its memory, its mirror, its yearly step, its odds, its heir copy, its bound test
//   world/social.ts             the stamp
//   business/staff-loyalty.ts   the staff edges of E13
//   kernel/relations.ts         the one door of Person.relationship (E5)
//   kernel/person-ref.ts        the person's name in the world (E5)
//
// Every dollar these files move goes through cash.moveCash with a named counterparty (docs/LEDGER.md, rule 6), and every number of luck
// comes from a named stream (outcomeStream), so none of them has:
//
//   - a call of earnIncome, spend, addMoney or payForAction (the unreasoned movers of core.ts), or of bookMint or bookBurn;
//   - a write of `.money` or `.cash` (an assignment, a compound assignment, `++` or `--`), or a bracket key `['money']` or `['cash']`;
//   - an `Object.assign(` on anything but a patch the file just made (`const out = {}`): that is how a purse is written around the ledger;
//   - a `.add(` on a purse (`personPurse(p).add(5)`, or a variable that was made from a purse constructor): only cash.ts adds to a purse;
//   - Math.random, or a draw from g.rng (rand, randInt, chance, pick, ... as a bare call, or any `.rng` member).
//
// Reads of `.money` and `.cash` are fine, and so is handing a purse to moveCash: a purse that is passed is not a purse that is written.
//
// The three self-tests prove the scan can fail: every rule has a synthetic file that must be found, the look-alikes that must pass, and a
// real file of the list with one planted violation that must be found at the planted line. The file list is not empty, names every file the
// plan names, and each file lexes to something. Limits, on purpose: the scan reads tokens and not types. A write through a destructuring or
// through a variable that is built elsewhere is not seen; the acceptance probe (test/social-acceptance.test.ts) measures that gap at run
// time, as strict ledger drift, and checkLedger holds after every year of every life.
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, K_STR, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'

/** The files the plan names (X50). The scan reads every `society/*.ts` and `world/edge*.ts` besides, and these must exist. */
const NAMED = [
  'src/game/society/acts.ts',
  'src/game/society/budget.ts',
  'src/game/society/contract.ts',
  'src/game/society/debt.ts',
  'src/game/society/favor.ts',
  'src/game/society/feud.ts',
  'src/game/society/gossip.ts',
  'src/game/society/loan.ts',
  'src/game/society/mentor.ts',
  'src/game/society/menu.ts',
  'src/game/society/module.ts',
  'src/game/society/reconcile.ts',
  'src/game/society/seam.ts',
  'src/game/society/secret.ts',
  'src/game/world/edge-bound.ts',
  'src/game/world/edge-heir.ts',
  'src/game/world/edge-legacy.ts',
  'src/game/world/edge-memory.ts',
  'src/game/world/edge-mirror.ts',
  'src/game/world/edge-odds.ts',
  'src/game/world/edge-step.ts',
  'src/game/world/edge-write.ts',
  'src/game/world/edges-slice.ts',
  'src/game/world/edges.ts',
  'src/game/world/social.ts',
  'src/game/business/staff-loyalty.ts',
  'src/game/kernel/relations.ts',
  'src/game/kernel/person-ref.ts',
] as const

/** True for a file of the list: the single files above, or any `society/*.ts` or `world/edge*.ts` that a later task adds. */
const inList = (path: string): boolean => (NAMED as readonly string[]).includes(path) || /^src\/game\/society\/[a-z0-9-]+\.ts$/.test(path) || /^src\/game\/world\/edge[a-z0-9-]*\.ts$/.test(path)

interface Finding {
  line: number
  /** The rule that fired: `.money =`, `['cash']`, `Object.assign(`, `spend`, `.add( on a purse`, `Math.random`, `rand(`, `.rng`... */
  rule: string
}

const WRITE_OPS: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '??=', '||=', '&&=', '<<=', '>>=', '>>>=', '&=', '|=', '^='])
const BUMPS: ReadonlySet<string> = new Set(['++', '--'])
/** The unreasoned movers of core.ts and the two ledger primitives that make or destroy money. Any mention counts, as a call or as a member call. */
const MONEY_NAMES: ReadonlySet<string> = new Set(['earnIncome', 'spend', 'addMoney', 'payForAction', 'bookMint', 'bookBurn'])
/** The four purse constructors of cash.ts. */
const PURSES: ReadonlySet<string> = new Set(['personPurse', 'playerPurse', 'firmPurse', 'poolPurse'])
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

/** True when `name` was declared in the file from a purse constructor: `const name = personPurse(...)` (a type annotation may sit between). */
function purseHere(toks: readonly Tok[], name: string): boolean {
  for (let i = 0; i + 2 < toks.length; i++) {
    if (!(isId(toks[i], 'const') || isId(toks[i], 'let')) || !isId(toks[i + 1], name)) continue
    for (let j = i + 2; j < toks.length && j < i + 16; j++) {
      if (isPunct(toks[j], ';')) break
      if (isPunct(toks[j], '=')) {
        const made = toks[j + 1]
        return made !== undefined && made.k === K_ID && PURSES.has(made.v) && isPunct(toks[j + 2], '(')
      }
    }
  }
  return false
}

/** True when the receiver that ends just before the `.` at toks[dot] is a purse: a purse constructor's result, or a name made from one or called `...purse...`. */
function receiverIsPurse(toks: readonly Tok[], dot: number): boolean {
  const end = dot - 1
  if (isPunct(toks[end], ')')) {
    let depth = 0
    let k = end
    for (; k >= 0; k--) {
      if (isPunct(toks[k], ')')) depth++
      else if (isPunct(toks[k], '(') && --depth === 0) break
    }
    const callee = toks[k - 1]
    return callee !== undefined && callee.k === K_ID && PURSES.has(callee.v)
  }
  const name = toks[end]
  return name !== undefined && name.k === K_ID && (/purse/i.test(name.v) || purseHere(toks, name.v))
}

/** The money and luck findings of one file. */
function findings(src: SourceFile): Finding[] {
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
      else if (MONEY_NAMES.has(t.v) && member && isPunct(toks[i + 1], '(')) at(t, `.${t.v}(`)
      else if (t.v === 'add' && member && isPunct(toks[i + 1], '(') && receiverIsPurse(toks, i - 1)) at(t, '.add( on a purse')
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

let cache: SourceFile[] | null = null
const sources = (): SourceFile[] => (cache ??= loadSources())
const listed = (): SourceFile[] => sources().filter((s) => inList(s.path))

const lines = (f: readonly Finding[]): string[] => f.map((x) => `${x.line}: ${x.rule}`)
const rules = (code: string): string[] => findings(toSource('src/game/society/x.ts', code)).map((f) => f.rule)

// ---------------------------------------------------------------------------------------------------------------------------
// The real files

describe('social money scan: the real files', () => {
  it('has a file list that is not empty and names every file of the plan', () => {
    const paths = listed().map((s) => s.path)
    expect(paths.length).toBeGreaterThanOrEqual(NAMED.length)
    for (const p of NAMED) expect(paths, `${p} is gone or renamed`).toContain(p)
    for (const s of listed()) expect(s.toks.length, `${s.path} lexed to nothing`).toBeGreaterThan(20)
    // The directories are read whole: every society file and every edge file is on the list, so a new one cannot hide.
    expect(paths.filter((p) => p.startsWith('src/game/society/')).length).toBeGreaterThanOrEqual(14)
    expect(paths.filter((p) => /^src\/game\/world\/edge/.test(p)).length).toBeGreaterThanOrEqual(10)
  })

  it('books no unreasoned dollar, mints and burns nothing, writes no purse and draws no g.rng in any of them', () => {
    const bad = listed().flatMap((s) => lines(findings(s)).map((l) => `${s.path}:${l}`))
    expect(bad).toEqual([])
  })

  it('still moves the dollars it does move through cash.moveCash: the act applier and the debt file call it', () => {
    // The scan above would pass a society that moved no money at all. These two files do book dollars (E10a, E10b), and the way they do
    // is a moveCash call, so the clean result above means "moved by the door", not "never moved".
    for (const path of ['src/game/society/acts.ts', 'src/game/society/debt.ts']) {
      const src = listed().find((s) => s.path === path)!
      expect(src.toks.some((t, i) => isId(t, 'moveCash') && isPunct(src.toks[i + 1], '(')), `${path} calls moveCash`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The self-tests

describe('social money scan: the self-test, rule by rule', () => {
  it('finds a write of .money and .cash in each form, and a bracket key', () => {
    expect(rules('p.money = 5')).toEqual(['.money ='])
    expect(rules('p.money += 5')).toEqual(['.money +='])
    expect(rules('p.character.money -= x')).toEqual(['.money -='])
    expect(rules('b.cash *= 2')).toEqual(['.cash *='])
    expect(rules('b.cash /= 2')).toEqual(['.cash /='])
    expect(rules('g.character.money ??= 0')).toEqual(['.money ??='])
    expect(rules('p.money++')).toEqual(['.money ++'])
    expect(rules('--p.money')).toEqual(['-- .money'])
    expect(rules('++a.b[0].money')).toEqual(['++ .money'])
    expect(rules('p?.money = 3')).toEqual(['.money ='])
    expect(rules("p['money'] = 5")).toEqual(["['money']"])
    expect(rules("const v = b['cash']")).toEqual(["['cash']"])
  })

  it('finds earnIncome, spend, addMoney, payForAction, bookMint and bookBurn as a call, a reference and a member call', () => {
    for (const name of ['earnIncome', 'spend', 'addMoney', 'payForAction', 'bookMint', 'bookBurn']) {
      expect(rules(`${name}(g, 5)`), name).toEqual([name])
      expect(rules(`const f = ${name}`), name).toEqual([name])
      expect(rules(`import { ${name} } from '../core'`), name).toEqual([name])
      expect(rules(`core.${name}(g, 5)`), name).toEqual([`.${name}(`])
    }
    expect(rules("bookMint(g, 'x', acct, 5)")).toEqual(['bookMint'])
    expect(rules("bookBurn(g, 'x', acct, 5)")).toEqual(['bookBurn'])
  })

  it('finds an add to a purse: a constructor call, a variable made from one, a name that says purse', () => {
    expect(rules('personPurse(p).add(5)')).toEqual(['.add( on a purse'])
    expect(rules('playerPurse(g).add(-5, "gift")')).toEqual(['.add( on a purse'])
    expect(rules('firmPurse(b, f).add(5)')).toEqual(['.add( on a purse'])
    expect(rules('poolPurse("legal").add(5)')).toEqual(['.add( on a purse'])
    expect(rules('const wallet = personPurse(p)\nwallet.add(5)')).toEqual(['.add( on a purse'])
    expect(rules('const wallet: Purse = personPurse(p)\nwallet.add(5)')).toEqual(['.add( on a purse'])
    expect(rules('theirPurse.add(5)')).toEqual(['.add( on a purse'])
    expect(rules('a.b.purse.add(5)')).toEqual(['.add( on a purse'])
  })

  it('finds Math.random, a draw of g.rng in each form, and an Object.assign that is not on a patch made in the file', () => {
    expect(rules('const u = Math.random()')).toEqual(['Math.random'])
    expect(rules('const a = rand(g)')).toEqual(['rand('])
    expect(rules('const a = chance(g, 0.5) && pick(g, xs)')).toEqual(['chance(', 'pick('])
    expect(rules('const a = randInt(g, 1, 6) + bell(g)')).toEqual(['randInt(', 'bell('])
    expect(rules('const s = g.rng')).toEqual(['.rng'])
    expect(rules('g.rng = next')).toEqual(['.rng'])
    expect(rules('Object.assign(p, { money: 5 })')).toEqual(['Object.assign('])
    expect(rules('Object.assign(g.people[0], x)')).toEqual(['Object.assign('])
    expect(rules('Object.assign(createPerson(g, o), x)')).toEqual(['Object.assign('])
    // A parameter is not made here, a non-empty literal is not a fresh patch, and a name made after a different one does not count.
    expect(rules('function f(out: Patch) {\n  Object.assign(out, stake)\n}')).toEqual(['Object.assign('])
    expect(rules('const out = { a: 1 }\nObject.assign(out, stake)')).toEqual(['Object.assign('])
    expect(rules('const other = {}\nObject.assign(out, stake)')).toEqual(['Object.assign('])
  })

  it('passes the shapes that look alike: a patch made here, a read, a purse that is handed on, a method, a comment and a string', () => {
    // The patch the file just made takes an Object.assign.
    expect(rules('const out: Patch = {}\nObject.assign(out, stake)')).toEqual([])
    expect(rules('let out = {}\nObject.assign(out, stake)')).toEqual([])
    // Reads of money and cash, and the shapes of a name that is not one.
    expect(rules('const m = p.money + q.cash')).toEqual([])
    expect(rules('if (p.money === 5 || b.cash >= 3) return')).toEqual([])
    expect(rules('const { money } = p')).toEqual([])
    expect(rules('const cash = Number.isFinite(g.character.money) ? Math.floor(g.character.money) : 0')).toEqual([])
    expect(rules('const room = spendable(g) + earnIncomeRate(1) + respend(2) + bookMinted(3)')).toEqual([])
    // A purse is built and handed to the door; adding is the door's job.
    expect(rules('const given = moveCash(g, playerPurse(g), personPurse(p), 50, "support", token)')).toEqual([])
    expect(rules('const purse = personPurse(p)\nreturn purse')).toEqual([])
    expect(rules('export { moveCash, personPurse, playerPurse, poolPurse }')).toEqual([])
    // add() of a Set or a Map, a method of another name on a purse, and a draw that is a method.
    expect(rules('const seen = new Set<string>()\nseen.add(key)')).toEqual([])
    expect(rules('const wallet = new Set()\nwallet.add(5)')).toEqual([])
    expect(rules('personPurse(p).acct')).toEqual([])
    expect(rules('const a = xs.pick(1)\nconst b = s.rand()')).toEqual([])
    expect(rules('function pick(xs) { return xs[0] }')).toEqual([])
    expect(rules('const r = actRoll(g, "favor", key)()\nconst s = outcomeStream(g, "social", 2030, "x")')).toEqual([])
    // Comments, strings and templates.
    expect(rules('// p.money = 5 and spend(g) and Math.random() and personPurse(p).add(5)\nconst a = 1')).toEqual([])
    expect(rules("const s = 'spend(g) and p.money = 5 and addMoney and g.rng'")).toEqual([])
    expect(rules('const s = `Math.random ${x} bookMint`')).toEqual([])
    expect(rules("const k = { rng: 1 }\nconst j = ks['rng']")).toEqual([])
    expect(rules("const k = obj['moneyLine']")).toEqual([])
  })

  it('names the line of each finding', () => {
    const f = findings(toSource('src/game/society/x.ts', 'const a = 1\n\np.money = 5\nconst b = 2\nspend(g, 3)\nconst c = personPurse(p)\nc.add(1)'))
    expect(f.map((x) => x.line)).toEqual([3, 5, 7])
  })

  it('has teeth on the real files: one planted violation in a file of the list is found, at the line it was planted on', () => {
    const real = listed().find((s) => s.path === 'src/game/society/loan.ts')!
    expect(findings(real)).toEqual([])
    const planted = (code: string): Finding[] => findings(toSource(real.path, `${real.text}\n${code}\n`))
    const last = real.text.split('\n').length + 1
    for (const [code, rule] of [
      ['export const x1 = (p: Person) => { p.money += 5 }', '.money +='],
      ["export const x2 = (g: GameState) => spend(g, 5, 'x')", 'spend'],
      ['export const x3 = (p: Person) => personPurse(p).add(5)', '.add( on a purse'],
      ['export const x4 = () => Math.random()', 'Math.random'],
      ['export const x5 = (g: GameState) => chance(g, 0.5)', 'chance('],
      ["export const x6 = (g: GameState, a: Acct) => bookMint(g, 'x', a, 5)", 'bookMint'],
    ] as const) {
      const found = planted(code)
      expect(found.map((f) => f.rule), code).toEqual([rule])
      expect(found[0]!.line, code).toBe(last)
    }
  })
})
