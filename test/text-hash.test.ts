// Text kit, part 1 (R1-T1, E.T1): the hash, the presentation pick and the pool registry.
// hpick never touches g.rng or Math.random: it is a pure function of (life, year, key), like the CEO coda
// in business/career.ts. The registry names pools so the memory can key them.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STOCK_VERDICTS, unitFlags } from '../scripts/voice/rules.mjs'
import { fnv1a, hpick, hunit, mix32, poolHash } from '../src/game/text/hash'
import { defineLines, linesId, registeredLines } from '../src/game/text/registry'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fnv1a and mix32', () => {
  it('match the published FNV-1a and murmur3 finalizer vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    expect(mix32(0)).toBe(0)
    expect(mix32(1)).toBe(0x514e28b7)
  })

  it('always return an unsigned 32-bit integer', () => {
    for (const text of ['', 'x', 'a longer string with spaces', 'café', '😀 emoji', 'z'.repeat(5000)]) {
      const h = fnv1a(text)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
      const m = mix32(h)
      expect(Number.isInteger(m)).toBe(true)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThan(2 ** 32)
    }
    for (const n of [0, 1, -1, 2 ** 31, 2 ** 32 - 1, 0xdeadbeef]) {
      const m = mix32(n)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThan(2 ** 32)
    }
  })

  it('spreads neighbouring inputs apart', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(mix32(fnv1a('k' + i)))
    expect(seen.size).toBe(1000)
  })
})

describe('hunit and hpick', () => {
  const LINES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

  it('hunit is in [0, 1) and is the mixed hash of life, year and key', () => {
    for (let y = 1990; y < 2090; y++) {
      const u = hunit('life-a', y, 'weather')
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
    expect(hunit('life-a', 2031, 'weather')).toBe(mix32(fnv1a('life-a|2031|weather')) / 2 ** 32)
  })

  it('is deterministic and independent of call order', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f']
    const forward = keys.map((k) => hpick('life-1', 2030, k, LINES))
    const backward = [...keys].reverse().map((k) => hpick('life-1', 2030, k, LINES)).reverse()
    expect(backward).toEqual(forward)
    expect(keys.map((k) => hpick('life-1', 2030, k, LINES))).toEqual(forward)
  })

  it('changes with the year, the key and the life', () => {
    const base = Array.from({ length: 60 }, (_, i) => hunit('life-1', 2000 + i, 'k'))
    const otherKey = Array.from({ length: 60 }, (_, i) => hunit('life-1', 2000 + i, 'j'))
    const otherLife = Array.from({ length: 60 }, (_, i) => hunit('life-2', 2000 + i, 'k'))
    expect(new Set(base).size).toBe(60)
    expect(otherKey).not.toEqual(base)
    expect(otherLife).not.toEqual(base)
    expect(hpick('life-1', 2030, 'k', LINES) === hpick('life-1', 2031, 'k', LINES) && hpick('life-1', 2030, 'k', LINES) === hpick('life-1', 2032, 'k', LINES) && hpick('life-1', 2030, 'k', LINES) === hpick('life-1', 2033, 'k', LINES)).toBe(false)
  })

  it('picks the line at floor(hunit * length)', () => {
    for (let i = 0; i < 50; i++) {
      const key = 'key' + i
      expect(hpick('life-x', 2040, key, LINES)).toBe(LINES[Math.floor(hunit('life-x', 2040, key) * LINES.length)])
    }
  })

  it('is uniform: 10 lines, 10,000 keys, each line 700 to 1,300 hits', () => {
    const hits = new Array<number>(LINES.length).fill(0)
    for (let i = 0; i < 10_000; i++) hits[LINES.indexOf(hpick('life-u', 2030, 'k' + i, LINES))]++
    for (const h of hits) {
      expect(h).toBeGreaterThanOrEqual(700)
      expect(h).toBeLessThanOrEqual(1300)
    }
  })

  it('never calls Math.random and takes no game state', () => {
    const spy = vi.spyOn(Math, 'random')
    for (let i = 0; i < 200; i++) hpick('life-r', 2030 + (i % 7), 'k' + i, LINES)
    hunit('life-r', 2030, 'k')
    poolHash(LINES)
    expect(spy).not.toHaveBeenCalled()
    // (lifeId, year, key, lines): four parameters, and the first is the life id string, not a GameState.
    expect(hpick.length).toBe(4)
    expect(hunit.length).toBe(3)
    expect(typeof hpick('life-r', 2030, 'k', LINES)).toBe('string')
  })

  it('throws on an empty list, like pick()', () => {
    expect(() => hpick('life-1', 2030, 'k', [])).toThrow('hpick() from empty list')
  })

  it('returns the only line of a one-line list', () => {
    expect(hpick('life-1', 2030, 'k', ['only'])).toBe('only')
  })
})

describe('poolHash', () => {
  it('is p and 8 hex digits, and stable', () => {
    const h = poolHash(['a', 'b', 'c'])
    expect(h).toMatch(/^p[0-9a-f]{8}$/)
    expect(poolHash(['a', 'b', 'c'])).toBe(h)
    expect(poolHash([])).toMatch(/^p[0-9a-f]{8}$/)
  })

  it('depends on the count, the text and the order', () => {
    const all = [['a', 'b'], ['b', 'a'], ['a'], ['a', 'b', 'c'], ['ab'], ['a', ''], ['', 'a'], ['a\u001fb'], []].map((l) => poolHash(l))
    expect(new Set(all).size).toBe(all.length)
  })

  it('is cached per array: the same array gives the same string, a copy gives an equal one', () => {
    const lines = ['x', 'y', 'z']
    const first = poolHash(lines)
    // The pool arrays are constants. A cache hit is the only way a later change is not seen.
    lines.push('w')
    expect(poolHash(lines)).toBe(first)
    // A different array with the same content hashes to the same string.
    expect(poolHash(['x', 'y', 'z'])).toBe(first)
    expect(poolHash(['x', 'y', 'z', 'w'])).not.toBe(first)
  })
})

describe('registry', () => {
  it('defineLines returns a frozen copy and registers it under its id', () => {
    const src = ['one', 'two', 'three']
    const L = defineLines('hash.test.a', src)
    expect(L).toEqual(src)
    expect(L).not.toBe(src)
    expect(Object.isFrozen(L)).toBe(true)
    expect(() => (L as string[]).push('x')).toThrow()
    expect(linesId(L)).toBe('hash.test.a')
    expect(registeredLines().get('hash.test.a')).toBe(L)
  })

  it('linesId is undefined for an array that was never registered, and for the unfrozen source', () => {
    const src = ['one', 'two']
    defineLines('hash.test.b', src)
    expect(linesId(src)).toBeUndefined()
    expect(linesId(['one', 'two'])).toBeUndefined()
  })

  it('registering an id twice replaces it (hot reload safe)', () => {
    const first = defineLines('hash.test.c', ['old one', 'old two'])
    const second = defineLines('hash.test.c', ['new one', 'new two', 'new three'])
    expect(registeredLines().get('hash.test.c')).toBe(second)
    expect(linesId(second)).toBe('hash.test.c')
    expect(linesId(first)).toBeUndefined()
    expect([...registeredLines().keys()].filter((k) => k === 'hash.test.c')).toHaveLength(1)
  })

  it('lists every registered pool', () => {
    defineLines('hash.test.d', ['d one', 'd two'])
    expect(registeredLines().has('hash.test.d')).toBe(true)
    expect(registeredLines().get('hash.test.d')).toEqual(['d one', 'd two'])
  })
})

describe('registered lines obey the voice rules', () => {
  const RAISED = ['em-dash', 'chatbot', 'stock', 'no-contraction']

  it('raise none of em-dash, chatbot, stock or no-contraction', () => {
    defineLines('hash.test.voice', [
      "You didn't need the umbrella after all.",
      'The bus came early and the day got easier.',
      "It isn't the money. It's the quiet.",
      'A neighbor waved, and you waved back.',
    ])
    const bad: string[] = []
    for (const [id, lines] of registeredLines()) {
      for (const line of lines) {
        const hit = unitFlags(line, 'log').filter((f) => RAISED.includes(f))
        if (hit.length) bad.push(`${id}: ${line} -> ${hit.join(',')}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('catches a deliberately bad line, so the check is real', () => {
    const dash = String.fromCharCode(0x2014)
    expect(unitFlags('I did not go.', 'log')).toContain('no-contraction')
    expect(unitFlags('Look at you, kid.', 'log')).toContain('chatbot')
    expect(unitFlags('You waited ' + dash + ' then left.', 'log')).toContain('em-dash')
    expect(unitFlags(STOCK_VERDICTS[0] + '.', 'log')).toContain('stock')
  })
})
