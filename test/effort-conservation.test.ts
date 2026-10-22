// R3-E9 (C.12, conservation): the effort engine moves no money. It works out odds, years and quality, and `spend` is `k * cost`, a
// number it reports and never pays: a caller books the dollars through the ledger, with a reason, and the engine only says how
// much. So nothing under src/game/effort/ may touch a purse, and these cases prove it three ways.
//
//   around calls   500 `quote`, `resolve` and `step` calls (the player's own record, a company's map, and both at once) leave the
//                  player's cash, the player's account, the ledger and the whole state alone, bar the one record the engine owns
//   a played life  two twins of a 30-year life, one with the engine called every year (a quote, a roll, a step, a settle), one
//                  without, end with the same cash, the same account, the same books and the same state, bar that record; the
//                  engine never rolled g.rng, or the lives would have parted at the first draw
//   tokens         a token scan finds no import of cash, ledger, spend or book in the folder, no call to a money function and no
//                  `.money` or `.cash` property: it reads no purse, so it cannot write one
//
// And money buys odds and speed, never a lower price: a quote is the same for a pauper and a billionaire.
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments, and the draws come from a local generator.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { quote } from '../src/game/effort/engine'
import { newFx } from '../src/game/effort/fx'
import { YOU_KEY, readYou } from '../src/game/effort/persona'
import { yearlyEffort } from '../src/game/effort/module'
import { resolve, step } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Fx, Outcome, Posture, Task, Worker } from '../src/game/effort/types'
import { checkLedger, peekLedger } from '../src/game/kernel/ledger'
import type { GameState } from '../src/game/types'
import { trapRng } from './effort-kit'
import { booksOf, driftSince } from './ledger-kit'
import { makeTestGame } from './helpers'
import { ROOT, K_ID, K_PUNCT, K_STR, isId, isPunct, loadSources, toSource, type SourceFile } from './scan-kit'

/** A deterministic generator in 0..1: a local one, nothing here touches g.rng. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** The three kinds of work the calls walk through: a product, a soft-ceiling lab and a study with a crew and know-how speed. */
function tasks(): Task[] {
  return [
    defineTask({
      field: 'rd.beverage', mode: 'project', cost: 30_000, p0: 0.4, baseYears: 1.5, minYears: 1, maxYears: 4, oddsLo: 0.05, oddsHi: 0.95,
      fteCap: 6, refCrew: { fte: 3, skill: 60 }, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 }, hit: { p: 0.15, bonus: 10 }, partial: 0.1,
    }),
    defineTask({
      field: 'dt.aiLab.cap.reasoning', mode: 'project', cost: 2_000_000, p0: 0.3, baseYears: 3, minYears: 1, maxYears: 6, hardness: 1.5, fteCap: 40,
      refCrew: { fte: 20, skill: 80 }, quality: { up: 40, down: 20, exp: 0.7, ceiling: 1200, room: 200, lo: 0, hi: 5000 }, spread: 30,
    }),
    defineTask({ field: 'studio.engine', mode: 'project', cost: 800_000, p0: 0.6, baseYears: 2, minYears: 1, maxYears: 5, knowYears: 0.15, quality: null, hit: null }),
  ]
}

const POSTURES: readonly Posture[] = ['lean', 'steady', 'push']

/** A varied input for call `i`: some fields given, some left to the record, some hostile. */
function inputOf(r: () => number, i: number): EffortInput {
  const people: Worker[] = [{ fte: 1 + Math.floor(r() * 30), skill: r() * 100, morale: r() * 100, drive: r() * 100, fatigue: r() * 60 }]
  const input: EffortInput = { k: [0.2, 0.7, 1, 2.5, 4, 400][i % 6]!, base: 0.1 + r() * 0.8, quality0: r() * 100, tools: r(), rival: r() * 12, spill: r() * 30 }
  if (i % 2 === 0) input.people = people
  if (i % 3 !== 0) input.who = 'you'
  if (i % 4 === 0) {
    input.ambition = r() * 100
    input.posture = POSTURES[i % 3]
    input.fatigue = r() * 100
    input.knowledge = r() * 100
  }
  if (i % 5 === 0) input.baseTerms = [{ key: 'team', label: 'team', pts: Math.round(r() * 12) }]
  return input
}

/** The state as text, without the one record the engine owns (and the rng, which a trapped state does not show). */
function withoutRecord(g: GameState): string {
  const copy = structuredClone(g)
  delete copy.flags[YOU_KEY]
  return JSON.stringify(copy)
}

describe('around 500 quote, resolve and step calls', () => {
  it('leave the cash, the account, the ledger and the whole state alone, bar the engine record', () => {
    const g = trapRng(makeTestGame(7, { age: 30, money: 123_456 }))
    const t = tasks()
    const r = lcg(5)
    const books = booksOf(g)
    const ledger = JSON.stringify(g.world ?? null)
    const state = withoutRecord(g)
    const fxs = new Map<string, Fx>()
    const maps = new Map<string, Record<string, number>>()
    let wins = 0
    let fails = 0
    for (let i = 0; i < 500; i++) {
      const task = t[Math.floor(i / 3) % t.length]!
      const q = quote(g, task, inputOf(r, i))
      const outcome: Outcome = resolve(q, r(), { drawHit: () => r(), done: r(), partial: task.partial })
      if (outcome.kind === 'works' || outcome.kind === 'hit') wins++
      if (outcome.kind === 'fail') fails++
      const key = `${task.field}#${i % 7}`
      if (!fxs.has(key)) fxs.set(key, newFx(g.year))
      if (!maps.has(task.field)) maps.set(task.field, {})
      // Three ways to call it: the player's record alone, a company's map alone, and an owner-run company (both).
      const ctx = { year: g.year + Math.floor(i / 3), k: q.k, weeks: 2, quality: q.quality ?? 0, fx: fxs.get(key)! }
      if (i % 3 === 0) step(g, task, outcome, { ...ctx, who: 'you' })
      else if (i % 3 === 1) step(g, task, outcome, { ...ctx, know: maps.get(task.field)! })
      else step(g, task, outcome, { ...ctx, who: 'you', know: maps.get(task.field)! })
      expect(q.spend).toBe(q.k * task.cost)
      expect(g.character.money, `call ${i}`).toBe(123_456)
      expect(booksOf(g), `call ${i}`).toEqual(books)
    }
    expect(wins).toBeGreaterThan(50)
    expect(fails).toBeGreaterThan(50)
    expect(driftSince(g, books)).toBe(0)
    expect(JSON.stringify(g.world ?? null)).toBe(ledger)
    expect(withoutRecord(g)).toBe(state)
    // The engine did write what it owns: the player's record, and nothing else.
    expect(YOU_KEY in g.flags).toBe(true)
    expect(Object.keys(readYou(g).fieldK).length).toBeGreaterThan(0)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('leave the books alone around the yearly settle too, even for a body that gave out', () => {
    const g = trapRng(makeTestGame(7, { age: 30, money: 99_000 }))
    const t = tasks()[0]!
    step(g, t, { kind: 'fail', margin: -10, cause: 'deadEnd', done: 1 }, { year: g.year, who: 'you' })
    g.flags.household = { owner: `${g.generation}:${g.character.id}`, priority: 'balanced', fatigue: 95, training: 0, lastYear: 2025, effective: 'balanced', spent: 0 }
    const books = booksOf(g)
    for (let i = 0; i < 12; i++) {
      g.year += 1
      yearlyEffort(g)
      expect(booksOf(g), `settle ${i}`).toEqual(books)
      expect(g.character.money).toBe(99_000)
    }
    // The burnout was real (a notice and a lean year), and it cost no dollar.
    expect(readYou(g).burnouts).toBeGreaterThan(0)
    expect(driftSince(g, books)).toBe(0)
  })
})

describe('a played 30-year life', () => {
  it('has the same cash, account and state with the engine called every year as without it', () => {
    const lives = [makeTestGame(7, { age: 18, money: 50_000 }), makeTestGame(7, { age: 18, money: 50_000 })] as const
    const [withEngine, plain] = lives
    const t = tasks()
    const r = lcg(9)
    const fx = newFx(withEngine.year)
    const company: Record<string, number> = {}
    const start = booksOf(withEngine)
    let years = 0
    for (let y = 0; y < 30 && withEngine.character.alive; y++) {
      for (const g of lives) g.queue = []
      // The engine, in the year before the age-up: a quote, a roll, a step, as a migrated system would.
      const task = t[y % 2]!
      const q = quote(withEngine, task, inputOf(r, y))
      const outcome = resolve(q, r(), { drawHit: () => r(), done: r(), partial: task.partial })
      const before = booksOf(withEngine)
      step(withEngine, task, outcome, { year: withEngine.year, who: 'you', know: company, fx, k: q.k, weeks: 1, quality: q.quality ?? 0 })
      yearlyEffort(withEngine)
      expect(booksOf(withEngine), `year ${y}: the engine's own calls`).toEqual(before)
      ageUp(withEngine)
      ageUp(plain)
      years++
      expect(withEngine.character.alive, `year ${y}`).toBe(plain.character.alive)
      expect(withEngine.character.money, `year ${y}: cash`).toBe(plain.character.money)
      expect(booksOf(withEngine), `year ${y}: books`).toEqual(booksOf(plain))
    }
    expect(years).toBeGreaterThanOrEqual(20)
    expect(withEngine.year).toBe(plain.year)
    expect(withoutRecord(withEngine)).toBe(withoutRecord(plain))
    expect(withEngine.rng).toBe(plain.rng)
    expect(driftSince(withEngine, start)).toBe(driftSince(plain, start))
    expect(JSON.stringify(peekLedger(withEngine))).toBe(JSON.stringify(peekLedger(plain)))
    expect(checkLedger(withEngine).ok).toBe(checkLedger(plain).ok)
    // The record is the engine's own, and it is bounded.
    expect(YOU_KEY in withEngine.flags).toBe(true)
    expect(YOU_KEY in plain.flags).toBe(false)
  }, 120_000)
})

describe('money buys odds and speed, never a lower price', () => {
  it('quotes the same for a pauper and a billionaire, and spends exactly k times the cost', () => {
    const r = lcg(3)
    const wealth = [0, 1_000, 1e9, 1e15, -5e8]
    for (const task of tasks()) {
      for (let i = 0; i < 40; i++) {
        const input = inputOf(r, i)
        const answers = wealth.map((money) => {
          const g = makeTestGame(7, { age: 30, money })
          const q = quote(g, task, input)
          expect(q.spend).toBe(q.k * task.cost)
          return JSON.stringify(q)
        })
        for (const a of answers) expect(a).toBe(answers[0])
      }
    }
  })
})

describe('the folder touches no purse', () => {
  const files = (): SourceFile[] => loadSources(ROOT, 'src/game/effort')

  /** Money-moving functions of core.ts, cash.ts and the ledger: the engine imports none and calls none. */
  const MONEY_FNS = [
    'spend', 'earnIncome', 'addMoney', 'moveCash', 'playerPurse', 'personPurse', 'firmPurse', 'poolPurse', 'personCash', 'firmCash', 'payPerson', 'lend', 'writeoff', 'erodeCash',
    'erodeFirm', 'book', 'bookMint', 'bookBurn', 'bookAcct', 'bookPlayer', 'foldAccount',
  ]
  /** Modules that hold the books: nothing in the folder imports one. */
  const MONEY_MODULES = /(^|\/)(cash|ledger|spend|book|books|reasons|spreads)$/

  interface Import {
    from: string
    names: string[]
  }

  /** The imports of a file, read from tokens: the module string and the names between `import` and it. */
  function importsOf(f: SourceFile): Import[] {
    const out: Import[] = []
    for (let i = 0; i < f.toks.length; i++) {
      if (!isId(f.toks[i], 'import')) continue
      const names: string[] = []
      let j = i + 1
      while (j < f.toks.length && f.toks[j]!.k !== K_STR) {
        if (f.toks[j]!.k === K_ID) names.push(f.toks[j]!.v)
        j++
      }
      if (j < f.toks.length) out.push({ from: f.toks[j]!.v, names })
      i = j
    }
    return out
  }

  /** Every problem of a file: a money import, a money call, a purse property. */
  function problems(f: SourceFile): string[] {
    const out: string[] = []
    for (const imp of importsOf(f)) {
      if (MONEY_MODULES.test(imp.from)) out.push(`${f.path}: imports ${imp.from}`)
      for (const n of imp.names) if (MONEY_FNS.includes(n)) out.push(`${f.path}: imports ${n}`)
    }
    f.toks.forEach((t, i) => {
      if (t.k !== K_ID) return
      if (MONEY_FNS.includes(t.v) && isPunct(f.toks[i + 1], '(')) out.push(`${f.path}: calls ${t.v}`)
      if ((t.v === 'money' || t.v === 'cash') && (isPunct(f.toks[i - 1], '.') || isPunct(f.toks[i - 1], '?.'))) out.push(`${f.path}: touches .${t.v}`)
    })
    return out
  }

  it('imports no cash, ledger, spend or book, calls no money function and reads no .money or .cash', () => {
    const all = files()
    expect(all.length).toBeGreaterThanOrEqual(12)
    expect(all.flatMap(problems)).toEqual([])
  })

  it('imports from the core, the registry, the talents and its own folder only', () => {
    const allowed = /^(\.\/[a-zA-Z]+|\.\.\/core|\.\.\/types|\.\.\/talents|\.\.\/kernel\/registry)$/
    const found: string[] = []
    for (const f of files()) for (const imp of importsOf(f)) if (!allowed.test(imp.from)) found.push(`${f.path}: ${imp.from}`)
    expect(found).toEqual([])
  })

  it('has a scan that can fail: a synthetic file that books, spends or reads a purse is caught', () => {
    const bad = toSource(
      'src/game/effort/bad.ts',
      "import { spend, notice } from '../core'\nimport { book } from '../kernel/ledger'\nimport { moveCash } from '../cash'\nexport const f = (g) => { spend(g, 5, 'rd'); g.character.money -= 1; return g.character?.cash }\n",
    )
    const found = problems(bad)
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining('imports ../kernel/ledger'),
        expect.stringContaining('imports ../cash'),
        expect.stringContaining('imports spend'),
        expect.stringContaining('imports book'),
        expect.stringContaining('imports moveCash'),
        expect.stringContaining('calls spend'),
        expect.stringContaining('touches .money'),
        expect.stringContaining('touches .cash'),
      ]),
    )
    // A field named `spend` (the quote's own number) and prose are not findings.
    const fine = toSource('src/game/effort/fine.ts', "// we never call spend( or book( here\nexport const q = (k: number, cost: number) => ({ spend: k * cost, text: 'cash and money' })\n")
    expect(problems(fine)).toEqual([])
    expect(fine.toks.some((t) => t.k === K_PUNCT)).toBe(true)
  })
})
