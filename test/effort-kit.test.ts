// R3-E7 (C.1): the purity kit. test/effort-kit.ts holds the tools that prove "quote never reads u", "no g.rng in a read" and
// "bounded under a frozen state" (R3-E9 uses them on quote, the why lines, the menus and the Profile row), built before any
// caller exists. These tests pin the kit itself: each tool throws where it should and is silent where it should not (a read of
// another field, a named stream, a clone, a JSON.stringify of the frozen state), so a green purity proof means something.
//
// The seeds are named constants of the kit's own, not outcomes, so the seed-pin ratchet has nothing to count. Nothing here
// draws a random number except to show that the trap catches the draw.
import { describe, expect, it } from 'vitest'
import { stream, outcomeStream } from '../src/game/kernel/streams'
import { chance, rand, randInt } from '../src/game/rng'
import { RngTrapError, UTrapError, frozenGame, roundSig, trapRng, uTrap } from './effort-kit'
import { makeTestGame } from './helpers'

describe('trapRng', () => {
  it('throws on a read of g.rng and on a write to it, with the error the kit names', () => {
    const g = trapRng(makeTestGame(7))
    expect(() => g.rng).toThrow(RngTrapError)
    expect(() => {
      g.rng = 5
    }).toThrow(RngTrapError)
    expect(() => g.rng).toThrow(/g\.rng/)
  })

  it('catches every draw helper of rng.ts, which all go through g.rng', () => {
    const g = trapRng(makeTestGame(7))
    expect(() => rand(g)).toThrow(RngTrapError)
    expect(() => randInt(g, 1, 6)).toThrow(RngTrapError)
    expect(() => chance(g, 0.5)).toThrow(RngTrapError)
  })

  it('is silent on a read of any other field', () => {
    const g = trapRng(makeTestGame(7, { age: 41 }))
    expect(g.year).toBe(2026)
    expect(g.character.age).toBe(41)
    expect(g.flags).toEqual({})
    expect(g.people).toEqual([])
    expect(g.nextId).toBe(0)
    expect(g.lifeId).toBe('test-life')
  })

  it('is silent on a named stream, which is the way a world module gets luck without g.rng', () => {
    const g = trapRng(makeTestGame(7))
    const a = stream(g, 'effort', 2026, 'x')
    const b = stream(makeTestGame(99), 'effort', 2026, 'x')
    const draws = [a(), a(), a()]
    expect(draws.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(draws).toEqual([b(), b(), b()])
    expect(outcomeStream(g, 'effort.risk', 2026, 'x')()).toBeGreaterThanOrEqual(0)
  })

  it('is silent on a clone, a spread and JSON.stringify, and a clone is a plain state that carries no trap', () => {
    const g = trapRng(makeTestGame(7))
    const clone = structuredClone(g)
    expect(clone.year).toBe(2026)
    expect(Object.getOwnPropertyDescriptor(clone, 'rng')).toBeUndefined()
    const copy = { ...g }
    expect(copy.lifeId).toBe('test-life')
    const text = JSON.stringify(g)
    expect(text).toContain('test-life')
    expect(text).not.toContain('"rng"')
    expect(Object.keys(g)).not.toContain('rng')
    expect('rng' in g).toBe(true)
  })

  it('returns the same state, trapped in place, and trapping a trapped state is a no-op', () => {
    const g = makeTestGame(7)
    expect(trapRng(g)).toBe(g)
    expect(() => trapRng(g)).not.toThrow()
    expect(() => g.rng).toThrow(RngTrapError)
  })

  it('traps one state and no other: a second state still draws', () => {
    const a = makeTestGame(7)
    const b = trapRng(makeTestGame(7))
    expect(() => rand(b)).toThrow(RngTrapError)
    expect(rand(a)).toBeGreaterThanOrEqual(0)
    expect(typeof a.rng).toBe('number')
  })

  it('catches a read that draws, which is the point: a leaky function fails and a pure one passes', () => {
    const leaky = (g: ReturnType<typeof makeTestGame>) => (rand(g) < 0.5 ? 'hit' : 'miss')
    const pure = (g: ReturnType<typeof makeTestGame>) => g.character.stats.health + 1
    expect(() => leaky(trapRng(makeTestGame(3)))).toThrow(RngTrapError)
    expect(pure(trapRng(makeTestGame(3)))).toBe(91)
  })
})

describe('frozenGame', () => {
  it('is a test game frozen all the way down', () => {
    const g = frozenGame(7)
    expect(g.year).toBe(2026)
    expect(g.lifeId).toBe('test-life')
    for (const part of [g, g.character, g.character.stats, g.character.hidden, g.people, g.log, g.log[0], g.flags, g.counters, g.yearActions]) {
      expect(Object.isFrozen(part)).toBe(true)
    }
  })

  it('refuses a write anywhere in the state with a TypeError at the offending line', () => {
    const g = frozenGame(7)
    expect(() => {
      g.year = 2027
    }).toThrow(TypeError)
    expect(() => {
      g.character.stats.happiness = 1
    }).toThrow(TypeError)
    expect(() => {
      g.flags.seen = 1
    }).toThrow(TypeError)
    expect(() => {
      g.yearActions.study = 1
    }).toThrow(TypeError)
    expect(() => g.people.push({} as never)).toThrow(TypeError)
  })

  it('traps g.rng as well: a read and a write throw the kit error, not the frozen-write one', () => {
    const g = frozenGame(7)
    expect(() => g.rng).toThrow(RngTrapError)
    expect(() => {
      g.rng = 1
    }).toThrow(RngTrapError)
    expect(() => rand(g)).toThrow(RngTrapError)
  })

  it('trapping a frozen game again changes nothing and does not throw', () => {
    const g = frozenGame(7)
    expect(trapRng(g)).toBe(g)
    expect(() => g.rng).toThrow(RngTrapError)
  })

  it('is silent on a read, a JSON.stringify and a clone, and a clone is thawed', () => {
    const g = frozenGame(7)
    expect(g.character.stats.health).toBe(90)
    expect(JSON.stringify(g)).toContain('"lifeId":"test-life"')
    const clone = structuredClone(g)
    expect(Object.isFrozen(clone)).toBe(false)
    expect(Object.isFrozen(clone.character)).toBe(false)
    clone.year = 2030
    expect(clone.year).toBe(2030)
    expect(g.year).toBe(2026)
  })

  it('lets a named stream draw, because a stream reads the state and writes none of it', () => {
    const g = frozenGame(7)
    const u = stream(g, 'effort', 2026, 'x')
    expect(u()).toBeGreaterThanOrEqual(0)
    expect(outcomeStream(g, 'effort.risk', 2026, 'x')()).toBeLessThan(1)
  })

  it('takes the same character overrides as makeTestGame, so a read can be tried at an age', () => {
    expect(frozenGame(7, { age: 30 }).character.age).toBe(30)
    expect(frozenGame(7).character.age).toBe(0)
  })

  it('makes a new state every call, so one test cannot see another', () => {
    const a = frozenGame(7)
    const b = frozenGame(7)
    expect(a).not.toBe(b)
    expect(a.character).not.toBe(b.character)
    expect(a).toEqual(b)
  })

  it('fails a read that writes and a read that draws, and passes one that does neither', () => {
    const g = frozenGame(7)
    const writes = () => {
      g.counters.reads = (g.counters.reads ?? 0) + 1
    }
    const draws = () => rand(g)
    const clean = () => g.character.stats.smarts + g.year
    expect(writes).toThrow(TypeError)
    expect(draws).toThrow(RngTrapError)
    expect(clean()).toBe(2086)
  })
})

describe('uTrap', () => {
  it('throws on a read of u and on a write to it, with the error the kit names', () => {
    const input = uTrap({ k: 1, ambition: 50 }) as { k: number; ambition: number; u?: number }
    expect(() => input.u).toThrow(UTrapError)
    expect(() => {
      input.u = 0.5
    }).toThrow(UTrapError)
    expect(() => input.u).toThrow(/\bu\b/)
  })

  it('keeps every other field, so a quote reads the same input it would have read', () => {
    const base = { k: 1.5, ambition: 70, posture: 'push' as const, people: [{ fte: 2, skill: 60, morale: 50 }] }
    const input = uTrap(base)
    expect(input.k).toBe(1.5)
    expect(input.ambition).toBe(70)
    expect(input.posture).toBe('push')
    expect(input.people).toEqual(base.people)
  })

  it('returns a copy and leaves the input it was given alone', () => {
    const base = { k: 1 }
    const input = uTrap(base)
    expect(input).not.toBe(base)
    expect(Object.getOwnPropertyDescriptor(base, 'u')).toBeUndefined()
    expect(Object.keys(base)).toEqual(['k'])
    const frozen = Object.freeze({ k: 2 })
    expect(() => uTrap(frozen)).not.toThrow()
    expect(uTrap(frozen).k).toBe(2)
  })

  it('is silent on a spread, Object.keys, JSON.stringify and `in`, which are not a read of u', () => {
    const input = uTrap({ k: 1, ambition: 50 })
    expect({ ...input }).toEqual({ k: 1, ambition: 50 })
    expect(Object.keys(input)).toEqual(['k', 'ambition'])
    expect(JSON.stringify(input)).toBe('{"k":1,"ambition":50}')
    expect('u' in input).toBe(true)
  })

  it('traps a u the input already had', () => {
    const input = uTrap({ k: 1, u: 0.25 })
    expect(() => input.u).toThrow(UTrapError)
  })

  it('fails a quote that reads u and passes one that does not', () => {
    const readsU = (i: { k: number; u?: number }) => i.k * (i.u ?? 1)
    const ignoresU = (i: { k: number }) => i.k * 2
    expect(() => readsU(uTrap({ k: 1 }))).toThrow(UTrapError)
    expect(ignoresU(uTrap({ k: 3 }))).toBe(6)
    expect(ignoresU(uTrap({ k: 3 }))).toBe(ignoresU({ k: 3 }))
  })
})

describe('roundSig', () => {
  it('cuts a number that is not an integer to 9 significant digits, which is the cut the fixtures use', () => {
    expect(roundSig(0.1 + 0.2)).toBe(0.3)
    expect(roundSig(1 / 3)).toBe(0.333333333)
    expect(roundSig(Math.PI * 1000)).toBe(3141.59265)
    expect(roundSig(-2 / 3)).toBe(-0.666666667)
    expect(roundSig(123456.78912345)).toBe(123456.789)
  })

  it('keeps an integer exactly, however long, and keeps a non-finite number as it is', () => {
    expect(roundSig(123456789012)).toBe(123456789012)
    expect(roundSig(0)).toBe(0)
    expect(roundSig(-5)).toBe(-5)
    expect(roundSig(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(roundSig(Infinity)).toBe(Infinity)
    expect(roundSig(-Infinity)).toBe(-Infinity)
    expect(Number.isNaN(roundSig(NaN))).toBe(true)
  })

  it('writes -0 as 0, like the JSON a fixture is read from', () => {
    expect(Object.is(roundSig(-0), 0)).toBe(true)
    expect(Object.is(roundSig(0), 0)).toBe(true)
  })

  it('takes the digits as a second argument', () => {
    expect(roundSig(123.456, 3)).toBe(123)
    expect(roundSig(0.123456, 2)).toBe(0.12)
    expect(roundSig(1 / 3, 15)).toBe(0.333333333333333)
  })

  it('treats a last-bit difference as no difference and rounds twice as once', () => {
    const next = 0.3 + Number.EPSILON
    expect(next).not.toBe(0.3)
    expect(roundSig(next)).toBe(roundSig(0.3))
    for (const v of [Math.E, 1 / 7, 98.76543210987, 1e-7 / 3, 5e9 / 7]) {
      expect(roundSig(roundSig(v))).toBe(roundSig(v))
    }
  })

  it('agrees with toPrecision(9), the one cut every fixture of the repo uses', () => {
    for (const v of [Math.LN2, 12.3456789012, 0.000123456789012, 4.00000000049, 2 / 3 + 1e-14]) {
      expect(roundSig(v)).toBe(Number(v.toPrecision(9)))
    }
  })
})
