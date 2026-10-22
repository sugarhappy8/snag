// ci: fast
// R2-A1: the parity kit (test/r2-parity-kit.ts). It digests g.rng and ten non-text slices of a game state, so a track
// that must not move a seeded life can prove it, and one more slice ('text') that exists only to show that text did
// change. These cases pin the kit on synthetic states; the 12 real lives and the recorded fixture are checked by
// test/r2-codemod-parity.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChoiceModal, GameState, Person } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { makeTestGame } from './helpers'
import {
  PARITY_DIGITS,
  PARITY_LIVES,
  PARITY_SLICES,
  compareTraces,
  parityDigests,
  traceLife,
  type ParityDigests,
  type ParityFixture,
  type ParityLife,
  type ParitySlice,
  type ParityTrace,
} from './r2-parity-kit'

const KEYS = [...PARITY_SLICES, 'text'] as const

function person(): Person {
  return { id: 'p1', name: 'Ada', relation: 'mother', age: 40, money: 100, notes: ['Taught me to swim.'], data: { metAt: 'home' } } as unknown as Person
}

function choice(): ChoiceModal {
  return {
    kind: 'choice',
    id: 'q1',
    title: 'A fork',
    emoji: '?',
    text: 'Which way?',
    choices: [
      { id: 'left', label: 'Left', hint: 'Looks safe' },
      { id: 'right', label: 'Right' },
    ],
    source: 'script',
    scriptId: 'fork.script',
    data: { depth: 1 },
  }
}

/** A small state with something in every slice. */
function base(): GameState {
  const g = makeTestGame()
  g.people.push(person())
  g.assets.push({ id: 'a1', kind: 'house', name: 'Flat', value: 1000 } as unknown as GameState['assets'][number])
  g.queue.push(choice())
  g.counters.crimes = 1
  g.yearActions.gym = 1
  g.character.memories.push('The first snow.')
  g.log[0].entries.push({ id: 'l1', text: 'You woke up.', tone: 'neutral' })
  g.flags.worldEconomy = { v: 2, countries: { us: { year: 2030 } } }
  g.flags.marketShocks = []
  g.flags.pregnancy = false
  g.flags.milestonesLogged = [1]
  g.flags.textMem = { p: { a: 1 } }
  g.flags.flavorRecent = ['a']
  g.obituary = null
  return g
}

/** The slices whose digest differs between the base state and the same state after `mutate`. */
function moved(mutate: (g: GameState) => void): string[] {
  const a = parityDigests(base())
  const g = base()
  mutate(g)
  const b = parityDigests(g)
  return KEYS.filter((k) => a[k] !== b[k])
}

describe('parityDigests: what moves which slice', () => {
  it('writes eight lowercase hex digits for every slice, and nothing else', () => {
    const d: ParityDigests = parityDigests(base())
    expect(Object.keys(d).sort()).toEqual([...KEYS].sort())
    for (const k of KEYS) expect(d[k]).toMatch(/^[0-9a-f]{8}$/)
    expect(PARITY_SLICES).toEqual(['rng', 'meta', 'character', 'people', 'assets', 'counters', 'economy', 'flagsWorld', 'flagsPersonal', 'flagsCache', 'queue'])
  })

  it('is a pure read: the same state gives the same digests and the state is not touched', () => {
    const g = base()
    const before = JSON.stringify(g)
    expect(parityDigests(g)).toEqual(parityDigests(g))
    expect(JSON.stringify(g)).toBe(before)
  })

  it('1: money changes only the character slice', () => {
    expect(moved((g) => void (g.character.money += 1))).toEqual(['character'])
  })

  it('2: a log line, a memory, a person note, a queue label or hint, a queue text and flags.textMem change only text', () => {
    expect(moved((g) => g.log[0].entries.push({ id: 'l2', text: 'You slept.', tone: 'good' }))).toEqual(['text'])
    expect(moved((g) => void (g.log[0].entries[0].text = 'You woke up late.'))).toEqual(['text'])
    expect(moved((g) => g.character.memories.push('A second memory.'))).toEqual(['text'])
    expect(moved((g) => g.people[0].notes.push('Sang to me.'))).toEqual(['text'])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).choices[0].label = 'Go left'))).toEqual(['text'])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).choices[0].hint = 'Looks risky'))).toEqual(['text'])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).title = 'Another fork'))).toEqual(['text'])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).text = 'Which road?'))).toEqual(['text'])
    expect(moved((g) => void (g.flags.textMem = { p: { a: 2 } }))).toEqual(['text'])
    expect(moved((g) => void (g.flags.flavorRecent = ['b']))).toEqual(['text'])
    expect(moved((g) => void (g.obituary = 'A quiet life.'))).toEqual(['text'])
  })

  it('2b: a queue emoji, tone and data are in no slice', () => {
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).emoji = '!'))).toEqual([])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).data = { depth: 2 }))).toEqual([])
  })

  it('3: g.rng, the economy flag, a world, a personal, an unclassified and a cache flag, and a queue id each change exactly their slice', () => {
    const stranger = 'zzNobodyClassifiedThis'
    expect(classifyFlag('marketShocks')).toBe('world')
    expect(classifyFlag('pregnancy')).toBe('personal')
    expect(classifyFlag('milestonesLogged')).toBe('cache')
    expect(classifyFlag(stranger)).toBeNull()
    expect(moved((g) => void (g.rng += 1))).toEqual(['rng'])
    expect(moved((g) => void (g.flags.worldEconomy = { v: 2, countries: { us: { year: 2031 } } }))).toEqual(['economy'])
    expect(moved((g) => void (g.flags.marketShocks = [1]))).toEqual(['flagsWorld'])
    expect(moved((g) => void (g.flags.pregnancy = true))).toEqual(['flagsPersonal'])
    expect(moved((g) => void (g.flags[stranger] = 1))).toEqual(['flagsPersonal'])
    expect(moved((g) => void (g.flags.milestonesLogged = [1, 2]))).toEqual(['flagsCache'])
    expect(moved((g) => void (g.queue[0].id = 'q2'))).toEqual(['queue'])
  })

  it('3b: meta, people, assets and counters each change exactly their slice', () => {
    expect(moved((g) => void (g.nextId += 1))).toEqual(['meta'])
    expect(moved((g) => void (g.year += 1))).toEqual(['meta'])
    expect(moved((g) => void (g.ribbon = 'Long life'))).toEqual(['meta'])
    expect(moved((g) => void (g.people[0].money += 1))).toEqual(['people'])
    expect(moved((g) => void (g.assets[0].value += 1))).toEqual(['assets'])
    expect(moved((g) => void (g.counters.crimes += 1))).toEqual(['counters'])
    expect(moved((g) => void (g.yearActions.gym += 1))).toEqual(['counters'])
  })

  it('3c: the queue slice is the structure: a choice id, a script id and a kind move it, and so does a new item', () => {
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).choices[0].id = 'port'))).toEqual(['queue'])
    expect(moved((g) => void ((g.queue[0] as ChoiceModal).scriptId = 'other.script'))).toEqual(['queue'])
    expect(moved((g) => void g.queue.push({ kind: 'aiTask', id: 'q9', task: { type: 'yearEvents' } }))).toEqual(['queue'])
  })

  it('4: key order never matters, undefined is skipped, NaN differs from null and from 0', () => {
    const a = base()
    const b = base()
    a.flags = { pregnancy: true, marketShocks: [], zzFirst: 1, zzSecond: 2 }
    b.flags = { zzSecond: 2, zzFirst: 1, marketShocks: [], pregnancy: true }
    expect(parityDigests(a)).toEqual(parityDigests(b))

    const c = base()
    ;(c.character as unknown as Record<string, unknown>).extra = undefined
    expect(parityDigests(c)).toEqual(parityDigests(base()))

    const digestWith = (value: unknown): string => {
      const g = base()
      g.character.money = value as number
      return parityDigests(g).character
    }
    const nan = digestWith(Number.NaN)
    const inf = digestWith(Number.POSITIVE_INFINITY)
    const ninf = digestWith(Number.NEGATIVE_INFINITY)
    const all = new Set([nan, inf, ninf, digestWith(null), digestWith(0), digestWith('NaN')])
    expect(all.size).toBe(6)
  })
})

/** The next float away from zero (`up`) or toward it, for a finite float: one ulp of what another CPU or another V8 does to a result. */
function nudge(x: number, up: boolean): number {
  const buf = new Float64Array([x])
  const bits = new BigInt64Array(buf.buffer)
  bits[0] += up ? 1n : -1n // sign and magnitude: one more in the bits is one ulp more magnitude, whatever the sign
  return buf[0]
}

describe('parityDigests: an environment that rounds the last bit differently', () => {
  // Measured, not assumed: Node 22.23.3 on Linux x64 and on macOS arm64 differ in the last bit of Math.log on about 1 call in 130,
  // and Node 24 differs from Node 22 in the last bit of Math.pow. The engine keeps a few of those floats unrounded in its state.
  const LEAVES = { housingReturn: 0.053282687765047576, share: 0.00006621885472989687, money: 9115.301262679768, big: 123456789.123456789 }

  it('8: a float one ulp or a few ulps away digests the same in the economy, assets, people and character slices', () => {
    const at = (f: (x: number) => number): ParityDigests => {
      const g = base()
      g.flags.worldEconomy = { v: 2, previous: { pe: { housingReturn: f(LEAVES.housingReturn), year: 2030 } } }
      g.assets[0].value = f(LEAVES.big)
      ;(g.assets[0] as unknown as { details: unknown }).details = { market: { share: f(LEAVES.share), base: f(LEAVES.share) } }
      g.people[0].money = f(LEAVES.money)
      g.character.money = f(LEAVES.money)
      return parityDigests(g)
    }
    const exact = at((x) => x)
    expect(at((x) => nudge(x, true))).toEqual(exact)
    expect(at((x) => nudge(x, false))).toEqual(exact)
    expect(at((x) => nudge(nudge(nudge(x, true), true), true))).toEqual(exact)
    expect(at((x) => -x)).not.toEqual(exact)
  })

  it('8: a float that really moved still moves its slice, and so do an integer by one and a float by a millionth of itself', () => {
    expect(PARITY_DIGITS).toBeLessThanOrEqual(12)
    const withMoney = (m: number): ParityDigests => {
      const g = base()
      g.people[0].money = m
      return parityDigests(g)
    }
    const exact = withMoney(LEAVES.money).people
    expect(withMoney(LEAVES.money * (1 + 1e-6)).people).not.toBe(exact)
    expect(withMoney(LEAVES.money + 0.01).people).not.toBe(exact)
    expect(withMoney(9115).people).not.toBe(withMoney(9116).people)
    // An integer is never rounded: a count moving by one is a move however large it is.
    expect(withMoney(12345678901).people).not.toBe(withMoney(12345678902).people)
  })
})

const ROW_LENGTH = PARITY_SLICES.length + 1
const row = (c: string): string[] => Array.from({ length: ROW_LENGTH }, () => c.repeat(8))
const trace = (id: string, years: number): ParityTrace => ({ id, years: Array.from({ length: years }, (_, i) => row(String(i % 10))) })

describe('compareTraces', () => {
  it('5: equal traces compare as []', () => {
    expect(compareTraces([trace('a', 12), trace('b', 3)], [trace('a', 12), trace('b', 3)])).toEqual([])
  })

  it('5: one slice differing at year 7 is one divergence naming that life, year and slice', () => {
    const a = [trace('a', 12), trace('b', 12)]
    const b = [trace('a', 12), trace('b', 12)]
    const at: ParitySlice = 'assets'
    b[1].years[7][PARITY_SLICES.indexOf(at)] = 'deadbeef'
    expect(compareTraces(a, b)).toEqual([{ life: 'b', year: 7, slices: [at] }])
  })

  it('5: several slices in one year are listed in slice order, and a later year is its own divergence', () => {
    const a = [trace('a', 12)]
    const b = [trace('a', 12)]
    b[0].years[3][PARITY_SLICES.indexOf('people')] = 'deadbeef'
    b[0].years[3][PARITY_SLICES.indexOf('rng')] = 'deadbeef'
    b[0].years[5][PARITY_SLICES.indexOf('queue')] = 'deadbeef'
    expect(compareTraces(a, b)).toEqual([
      { life: 'a', year: 3, slices: ['rng', 'people'] },
      { life: 'a', year: 5, slices: ['queue'] },
    ])
  })

  it("5: the text column is never compared", () => {
    const a = [trace('a', 12)]
    const b = [trace('a', 12)]
    b[0].years[7][PARITY_SLICES.length] = 'deadbeef'
    expect(compareTraces(a, b)).toEqual([])
  })

  it('5: lists of a different shape throw', () => {
    expect(() => compareTraces([trace('a', 4)], [trace('a', 4), trace('b', 4)])).toThrow(/lives/)
    expect(() => compareTraces([trace('a', 4)], [trace('b', 4)])).toThrow(/life/)
    expect(() => compareTraces([trace('a', 4)], [trace('a', 5)])).toThrow(/years/)
    const short = trace('a', 4)
    short.years[2] = short.years[2].slice(1)
    expect(() => compareTraces([trace('a', 4)], [short])).toThrow(/slices/)
  })
})

describe('traceLife', () => {
  // Short clones of one birth life and one founder life, so the fast tier stays fast. The point is order: a module-level
  // cache that made a life depend on the one played before it would show as a different trace on the second play.
  const birth = PARITY_LIVES.find((l) => l.kind === 'birth')!
  const founder = PARITY_LIVES.find((l) => l.kind === 'founder')!
  const shortBirth: ParityLife = { ...birth, untilAge: 5 }
  const shortFounder: ParityLife = { ...founder, years: 2 }

  it('6: playing two lives twice in one process gives identical traces, whatever was played before', () => {
    const a1 = traceLife(shortBirth)
    const b1 = traceLife(shortFounder)
    const a2 = traceLife(shortBirth)
    const b2 = traceLife(shortFounder)
    expect(a1.id).toBe(shortBirth.id)
    expect(b1.id).toBe(shortFounder.id)
    // 0 after birth, then one row per year.
    expect(a1.years.length).toBeGreaterThan(1)
    expect(a1.years.length).toBeLessThanOrEqual(6)
    expect(b1.years.length).toBe(3)
    for (const t of [a1, b1]) for (const y of t.years) expect(y).toHaveLength(ROW_LENGTH)
    expect(a2).toEqual(a1)
    expect(b2).toEqual(b1)
    expect(compareTraces([a1, b1], [a2, b2])).toEqual([])
  }, 60_000)

  it('6: the rows move from year to year (the digests are not constant)', () => {
    const t = traceLife(shortBirth)
    const first = t.years[0]
    const last = t.years[t.years.length - 1]
    expect(last.slice(0, PARITY_SLICES.length)).not.toEqual(first.slice(0, PARITY_SLICES.length))
  }, 60_000)
})

/** Run `fn` with Math.log, exp, pow, log10 and log2 each returning a result one ulp off: what a CPU or V8 with a different last bit does. */
function withUlpNoise<T>(up: boolean, fn: () => T): T {
  const names = ['log', 'exp', 'pow', 'log10', 'log2'] as const
  const math = Math as unknown as Record<string, (...a: number[]) => number>
  const saved = names.map((n) => math[n])
  names.forEach((n, i) => {
    math[n] = (...a: number[]): number => {
      const r = saved[i].apply(Math, a)
      return Number.isFinite(r) && r !== 0 ? nudge(r, up) : r
    }
  })
  try {
    return fn()
  } finally {
    names.forEach((n, i) => {
      math[n] = saved[i]
    })
  }
}

describe('traceLife: the last bit of Math.log, Math.exp and Math.pow', () => {
  // The first year of a life stores unrounded economy floats (previous.<country>.housingReturn), a company's market share is a
  // float too, and all of them come through those three functions. The trace must not notice a different last bit, or the
  // fixture recorded on one machine fails on the next (CI on Linux x64 failed 11 of 12 lives, in year 1, on the economy slice).
  const birth = PARITY_LIVES.find((l) => l.kind === 'birth')!
  const founder = PARITY_LIVES.find((l) => l.kind === 'founder')!
  const lives: ParityLife[] = [{ ...birth, untilAge: 3 }, { ...founder, years: 3 }]

  it('9: a life traced with those functions one ulp up, or one ulp down, has the trace of the plain run', () => {
    const plain = lives.map((l) => traceLife(l))
    for (const up of [true, false]) {
      const noisy = lives.map((l) => withUlpNoise(up, () => traceLife(l)))
      expect(compareTraces(plain, noisy)).toEqual([])
    }
  }, 120_000)

  it('9: withUlpNoise moves each of those functions by exactly one ulp and puts them back', () => {
    const calls = (): number[] => [Math.log(7.5), Math.exp(1.5), Math.pow(1.7, 0.35), Math.log10(11.5), Math.log2(5.25)]
    const plain = calls()
    expect(withUlpNoise(true, calls)).toEqual(plain.map((x) => nudge(x, true)))
    expect(withUlpNoise(false, calls)).toEqual(plain.map((x) => nudge(x, false)))
    expect(calls()).toEqual(plain)
  })
})

describe('the 12 lives and the fixture', () => {
  it('there are 12 lives with distinct ids, built from tuples', () => {
    expect(PARITY_LIVES).toHaveLength(12)
    expect(new Set(PARITY_LIVES.map((l) => l.id)).size).toBe(12)
    expect(PARITY_LIVES.filter((l) => l.kind === 'birth')).toHaveLength(8)
    expect(PARITY_LIVES.filter((l) => l.kind === 'founder')).toHaveLength(4)
    expect(PARITY_LIVES.filter((l) => l.rich === true)).toHaveLength(2)
  })

  it('7: the fixture has v 1, the slice names, 12 lives and 12 eight-digit hex strings in every row', () => {
    const f = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'r2-parity.json'), 'utf8')) as ParityFixture
    expect(f.v).toBe(1)
    expect(typeof f.source).toBe('string')
    expect(f.source.length).toBeGreaterThan(0)
    expect(f.slices).toEqual([...PARITY_SLICES, 'text'])
    expect(f.lives).toHaveLength(12)
    expect(f.lives.map((l) => l.id)).toEqual(PARITY_LIVES.map((l) => l.id))
    for (const life of f.lives) {
      expect(life.years.length).toBeGreaterThan(1)
      for (const y of life.years) {
        expect(y).toHaveLength(12)
        for (const d of y) expect(d).toMatch(/^[0-9a-f]{8}$/)
      }
    }
  })
})
