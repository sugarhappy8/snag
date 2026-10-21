// ci: fast
// R2-A2: the three additions to the text kit's pick.ts. pickLine is generic over its element type (D8), pickSite names a
// pool by a numeric site key (D4) so a pool whose lines carry ${} holes does not flood the memory with one key per value,
// and a PickMode hook (memory, plain, rotate) lets a test turn the kit into a plain draw or into a rotation, which is how
// R2-A3 proves that a converted string never flows into state. The two compile-time cases at the end are checked by tc.
// R2-B2 (the rebaseline) moved the draw off g.rng onto the text stream: where these cases once compared with pick on a clone,
// they now compare with the n-th value of the game's text stream (textUnit), and they assert that g.rng never moves.
import { afterEach, describe, expect, it } from 'vitest'
import { textUnit } from '../src/game/kernel/streams'
import { poolHash } from '../src/game/text/hash'
import { readTextMem } from '../src/game/text/memory'
import { textCursor } from '../src/game/text/draw'
import { pickLine, pickSite, setPickHook, withPickMode, type PickCall, type PickMode } from '../src/game/text/pick'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const pool = (n: number, prefix = 'line'): string[] => Array.from({ length: n }, (_, i) => `${prefix} ${i}`)

/** The index of the line the n-th text draw of g's year points at, in a pool of `size` lines. */
const at = (g: GameState, n: number, size: number): number => Math.floor(textUnit(g, g.year, n) * size)

afterEach(() => setPickHook(null))

describe('pickSite', () => {
  it('takes the first text draw on an empty memory: lines[floor(unit * n)], one cursor step, g.rng untouched, for 20 lives', () => {
    for (const n of [2, 3, 5, 12, 13, 40]) {
      const lines = pool(n)
      for (let s = 1; s <= 20; s++) {
        const g = makeTestGame(s)
        g.lifeId = `site-life-${s}`
        expect(pickSite(g, lines, 0x1234abcd), `n=${n} s=${s}`).toBe(lines[at(g, 0, n)])
        expect(g.rng).toBe(s)
        expect(textCursor(g)).toEqual({ year: g.year, n: 1 })
      }
    }
  })

  it('a pool of one line draws nothing and writes nothing, and an empty list throws before anything is drawn', () => {
    const g = makeTestGame(4)
    expect(pickSite(g, ['solo'], 7)).toBe('solo')
    expect(g.rng).toBe(4)
    expect(g.flags).toEqual({})
    const h = makeTestGame(4)
    expect(() => pickSite(h, [], 7)).toThrow('pickSite() from empty list')
    expect(h.rng).toBe(4)
    expect(h.flags).toEqual({})
  })

  it('keys the memory by s plus eight hex digits and never writes a family', () => {
    const g = makeTestGame(2)
    const lines = pool(6)
    for (let i = 0; i < 20; i++) pickSite(g, lines, 0x2a)
    pickSite(g, pool(7), 0xdeadbeef)
    pickSite(g, pool(4), 0)
    const mem = readTextMem(g)
    expect(Object.keys(mem.p).sort()).toEqual(['s00000000', 's0000002a', 'sdeadbeef'])
    expect(mem.f).toEqual({})
    expect(readTextMem(g).r).toEqual({})
  })

  it('shares one memory between two pools with the same site and different values', () => {
    // The point of D4: the same site with a changed hole value is the same pool, so the shuffle-bag keeps working.
    const g = makeTestGame(9)
    const seen: number[] = []
    for (let i = 0; i < 12; i++) {
      const lines = [`Wave ${i} one`, `Wave ${i} two`, `Wave ${i} three`]
      seen.push(lines.indexOf(pickSite(g, lines, 0x77)))
    }
    for (let b = 0; b < 4; b++) expect([...seen.slice(b * 3, b * 3 + 3)].sort()).toEqual([0, 1, 2])
    expect(Object.keys(readTextMem(g).p)).toEqual(['s00000077'])
  })

  it('falls back to the pool hash for a site that is not an integer in 0..0xffffffff', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32, 2 ** 40]) {
      const g = makeTestGame(3)
      const lines = pool(5)
      pickSite(g, lines, bad)
      expect(Object.keys(readTextMem(g).p), String(bad)).toEqual([poolHash(lines)])
    }
    const g = makeTestGame(3)
    pickSite(g, pool(5), 0xffffffff)
    expect(Object.keys(readTextMem(g).p)).toEqual(['sffffffff'])
  })

  it('a bag of two alternates', () => {
    const g = makeTestGame(5)
    const lines = ['Yes it is', 'No it is not']
    const out = Array.from({ length: 10 }, () => lines.indexOf(pickSite(g, lines, 0x5)))
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
  })
})

describe('the pick hook', () => {
  /** The pool memory, the families and the rings of g: what the kit's memory holds, apart from the cursor. */
  const memory = (g: GameState): unknown => {
    const { p, f, r } = readTextMem(g)
    return { p, f, r }
  }

  it('plain mode is the plain text draw: lines[floor(unit * n)] call after call, no memory, g.rng untouched, for 40 calls', () => {
    for (const n of [2, 5, 13]) {
      const lines = pool(n)
      const g = makeTestGame(11)
      withPickMode('plain', () => {
        for (let i = 0; i < 40; i++) {
          expect(pickLine(g, lines), `n=${n} i=${i}`).toBe(lines[at(g, 2 * i, n)])
          expect(pickSite(g, lines, 9)).toBe(lines[at(g, 2 * i + 1, n)])
        }
      })
      expect(g.rng).toBe(11)
      expect(textCursor(g)).toEqual({ year: g.year, n: 80 })
      expect(memory(g)).toEqual({ p: {}, f: {}, r: {} })
    }
  })

  it('rotate mode returns the line after the one the text draw points at, wrapping, and writes no memory', () => {
    for (const n of [2, 3, 7, 13]) {
      const lines = pool(n)
      const g = makeTestGame(21)
      withPickMode('rotate', () => {
        for (let i = 0; i < 30; i++) {
          expect(lines.indexOf(pickLine(g, lines)), `n=${n} i=${i}`).toBe((at(g, i, n) + 1) % n)
        }
      })
      expect(g.rng).toBe(21)
      expect(textCursor(g)).toEqual({ year: g.year, n: 30 })
      expect(memory(g)).toEqual({ p: {}, f: {}, r: {} })
    }
  })

  it('memory mode, and a hook that answers undefined, behave as with no hook at all', () => {
    const lines = pool(5)
    const run = (): string[] => {
      const g = makeTestGame(31)
      return Array.from({ length: 20 }, () => pickLine(g, lines, 'hook.mem'))
    }
    const bare = run()
    expect(withPickMode('memory', run)).toEqual(bare)
    setPickHook(() => undefined)
    expect(run()).toEqual(bare)
  })

  it('every call of two or more lines reaches the hook with index 0, 1, 2, the memory key and n', () => {
    const calls: PickCall[] = []
    setPickHook((c) => {
      calls.push(c)
      return undefined
    })
    const g = makeTestGame(1)
    const six = pool(6)
    pickLine(g, six, 'hook.six')
    pickSite(g, pool(3), 0xab)
    pickLine(g, six)
    expect(calls).toEqual([
      { index: 0, key: 'hook.six', n: 6 },
      { index: 1, key: 's000000ab', n: 3 },
      { index: 2, key: poolHash(six), n: 6 },
    ])
  })

  it('setPickHook resets the counter, and null removes the hook', () => {
    const seen: number[] = []
    const hook = (c: PickCall): PickMode | undefined => {
      seen.push(c.index)
      return undefined
    }
    const g = makeTestGame(1)
    setPickHook(hook)
    pickLine(g, pool(3))
    pickLine(g, pool(3))
    setPickHook(hook)
    pickLine(g, pool(3))
    setPickHook(null)
    pickLine(g, pool(3))
    expect(seen).toEqual([0, 1, 0])
  })

  it('a pool of one line does not reach the hook, and draws nothing', () => {
    let reached = 0
    setPickHook(() => {
      reached++
      return 'rotate'
    })
    const g = makeTestGame(8)
    expect(pickLine(g, ['only one'])).toBe('only one')
    expect(pickSite(g, ['only one'], 3)).toBe('only one')
    expect(reached).toBe(0)
    expect(g.rng).toBe(8)
    expect(g.flags).toEqual({})
  })

  it('the hook can choose per call', () => {
    const modes: PickMode[] = ['plain', 'rotate', 'memory']
    setPickHook((c) => modes[c.index % 3])
    const lines = pool(5)
    const g = makeTestGame(2)
    const first = lines.indexOf(pickLine(g, lines))
    const second = lines.indexOf(pickLine(g, lines))
    const third = lines.indexOf(pickLine(g, lines))
    expect(first).toBe(at(g, 0, 5))
    expect(second).toBe((at(g, 1, 5) + 1) % 5)
    expect(third).toBe(at(g, 2, 5)) // memory is still empty, because the first two calls wrote nothing
  })

  it('withPickMode returns the value and restores the previous hook and its counter, also when the callback throws', () => {
    const seen: number[] = []
    setPickHook((c) => {
      seen.push(c.index)
      return undefined
    })
    const g = makeTestGame(6)
    const lines = pool(4)
    expect(withPickMode('plain', () => 42)).toBe(42)
    expect(() =>
      withPickMode('plain', () => {
        pickLine(g, lines)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(seen).toEqual([]) // the inner calls never reached the outer hook
    pickLine(g, lines)
    expect(seen).toEqual([0]) // the outer hook is back, and the inner calls did not advance its counter
    setPickHook(null)
    expect(() =>
      withPickMode('rotate', () => {
        throw new Error('again')
      }),
    ).toThrow('again')
    const h = makeTestGame(6)
    expect(pickLine(h, lines)).toBe(lines[at(h, 0, 4)]) // no hook is left behind: the empty-memory pick is the plain draw
  })

  it('withPickMode nests: the innermost mode wins and the outer mode returns after it', () => {
    const lines = pool(6)
    const g = makeTestGame(14)
    const got: number[] = []
    withPickMode('rotate', () => {
      got.push(lines.indexOf(pickLine(g, lines)))
      withPickMode('plain', () => got.push(lines.indexOf(pickLine(g, lines))))
      got.push(lines.indexOf(pickLine(g, lines)))
    })
    const p = [0, 1, 2].map((i) => at(g, i, 6))
    expect(got).toEqual([(p[0] + 1) % 6, p[1], (p[2] + 1) % 6])
  })
})

describe('pickLine keeps its R1 behaviour', () => {
  it('a bag of 5 deals each line once per block, as before', () => {
    const lines = pool(5)
    const g = makeTestGame(3)
    const out = Array.from({ length: 15 }, () => lines.indexOf(pickLine(g, lines, 'keep.bag')))
    for (let b = 0; b < 3; b++) expect([...out.slice(b * 5, b * 5 + 5)].sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('a valid fam is a family and an invalid one falls back to the pool hash; pickSite never notes a family', () => {
    const g = makeTestGame(3)
    pickLine(g, pool(4), 'keep.fam')
    pickLine(g, pool(4), '9 not a name')
    pickSite(g, pool(4), 12)
    const mem = readTextMem(g)
    expect(Object.keys(mem.f)).toEqual(['keep.fam'])
    expect(Object.keys(mem.p)).toHaveLength(3)
  })
})

// Compile-time cases (D8). Vitest does not run them for their types: tc does. A constraint such as `T extends string` would
// make TypeScript keep the literals and stop the first two from compiling.
describe('the result type of pickLine (checked by tc)', () => {
  it('an inline pool gives string, so the result can be reassigned and compared with another string', () => {
    const g = makeTestGame(1)
    let line = pickLine(g, ['a b', 'c d'])
    line = 'e f'
    expect(line).toBe('e f')
    expect(pickLine(g, ['a b', 'c d']) === 'e f').toBe(false)
    let site = pickSite(g, ['a ${x}', 'c d'], 1)
    site = 'e f'
    expect(site).toBe('e f')
  })

  it('an as-const pool gives its literal union, so the result can index a record', () => {
    const g = makeTestGame(1)
    const KINDS = ['a b', 'c d'] as const
    const rec: Record<(typeof KINDS)[number], number> = { 'a b': 1, 'c d': 2 }
    expect(rec[pickLine(g, KINDS)]).toBeGreaterThan(0)
    expect(rec[pickSite(g, KINDS, 5)]).toBeGreaterThan(0)
    const kind: 'a b' | 'c d' = pickLine(g, KINDS)
    expect(KINDS).toContain(kind)
  })
})
