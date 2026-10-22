// ci: fast
// R2-B1 (K.7b, F.1 "Pinned seeds"): the seed kit. A test that needs a life with some property (a seed that is born rich,
// a seed that marries) asks findSeed(pred) for one instead of pinning a number that the next rebaseline moves. The kit scans
// from, from + 1, ... and returns the first seed whose predicate is true, so the answer is deterministic for a given code
// base and moves with it.
import { describe, expect, it } from 'vitest'
import { SeedSearchError, findSeed, findSeeds } from './seed-kit'

/** A predicate that counts its own calls. */
function counted(pred: (seed: number) => boolean): { calls: number[]; pred: (seed: number) => boolean } {
  const calls: number[] = []
  return {
    calls,
    pred: (seed) => {
      calls.push(seed)
      return pred(seed)
    },
  }
}

describe('findSeed', () => {
  it('returns the first seed that passes, scanning up from 1', () => {
    const c = counted((s) => s % 7 === 0)
    expect(findSeed(c.pred)).toBe(7)
    expect(c.calls).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('starts at `from`', () => {
    expect(findSeed((s) => s % 7 === 0, { from: 8 })).toBe(14)
    expect(findSeed((s) => s % 7 === 0, { from: 14 })).toBe(14)
    expect(findSeed(() => true, { from: 0 })).toBe(0)
    expect(findSeed((s) => s > 0, { from: -3 })).toBe(1)
  })

  it('looks at 200 seeds by default and at `tries` when given', () => {
    expect(findSeed((s) => s === 200)).toBe(200)
    expect(() => findSeed((s) => s === 201)).toThrow(SeedSearchError)
    expect(findSeed((s) => s === 500, { tries: 500 })).toBe(500)
    expect(() => findSeed((s) => s === 6, { tries: 5 })).toThrow(SeedSearchError)
    expect(findSeed((s) => s === 5, { tries: 5 })).toBe(5)
    expect(findSeed((s) => s === 1005, { from: 1000, tries: 6 })).toBe(1005)
  })

  it('names the label and the range it searched when nothing passes', () => {
    let error: unknown
    try {
      findSeed(() => false, { label: 'a rich heir', from: 10, tries: 20 })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SeedSearchError)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('a rich heir')
    expect(message).toContain('10')
    expect(message).toContain('29')
    expect(message).toContain('20')
    expect(() => findSeed(() => false)).toThrow(/1\D+200/)
  })

  it('stops at the first hit and never calls the predicate again', () => {
    const c = counted((s) => s === 3)
    findSeed(c.pred)
    expect(c.calls).toEqual([1, 2, 3])
  })

  it('throws on a predicate that returns something other than true or false, naming the seed', () => {
    const bad: [string, (s: number) => unknown][] = [
      ['a number', (s) => s],
      ['undefined', () => undefined],
      ['a string', () => 'yes'],
      ['null', () => null],
      ['an object', () => ({})],
    ]
    for (const [what, f] of bad) {
      expect(() => findSeed(f as (s: number) => boolean, { from: 41 }), what).toThrow(/41/)
      expect(() => findSeed(f as (s: number) => boolean, { from: 41 }), what).not.toThrow(SeedSearchError)
    }
    // A false for the early seeds does not hide a non-boolean on a later one.
    expect(() => findSeed(((s: number) => (s < 5 ? false : 1)) as (s: number) => boolean)).toThrow(/\b5\b/)
  })

  it('rethrows a predicate that throws, with the seed in the message and the cause kept', () => {
    const boom = new Error('no such country')
    let error: unknown
    try {
      findSeed((s) => {
        if (s === 4) throw boom
        return false
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SeedSearchError)
    expect((error as Error).message).toContain('4')
    expect((error as Error).message).toContain('no such country')
    expect((error as Error).cause).toBe(boom)
    // A thrown string is reported as well.
    expect(() =>
      findSeed(() => {
        throw 'plain text'
      }),
    ).toThrow(/plain text/)
  })

  it('rejects options that cannot describe a search', () => {
    expect(() => findSeed(() => true, { tries: 0 })).toThrow(RangeError)
    expect(() => findSeed(() => true, { tries: -1 })).toThrow(RangeError)
    expect(() => findSeed(() => true, { tries: 1.5 })).toThrow(RangeError)
    expect(() => findSeed(() => true, { from: 1.5 })).toThrow(RangeError)
    expect(() => findSeed(() => true, { from: Number.NaN })).toThrow(RangeError)
  })

  it('runs the search again every time when there is no label', () => {
    const c = counted((s) => s === 2)
    findSeed(c.pred)
    findSeed(c.pred)
    expect(c.calls).toEqual([1, 2, 1, 2])
  })
})

describe('findSeed with a label', () => {
  it('remembers the answer for the process: the second call does not run the predicate', () => {
    const c = counted((s) => s === 9)
    expect(findSeed(c.pred, { label: 'memo: nine' })).toBe(9)
    const n = c.calls.length
    expect(findSeed(c.pred, { label: 'memo: nine' })).toBe(9)
    expect(c.calls).toHaveLength(n)
  })

  it('throws when a label is reused for a different predicate', () => {
    expect(findSeed((s) => s === 3, { label: 'memo: three' })).toBe(3)
    expect(() => findSeed((s) => s === 4, { label: 'memo: three' })).toThrow(/memo: three/)
    // The same predicate text is the same search, whoever wrote it.
    expect(findSeed((s) => s === 3, { label: 'memo: three' })).toBe(3)
  })

  it('does not remember a failed search', () => {
    expect(() => findSeed(() => false, { label: 'memo: none', tries: 3 })).toThrow(SeedSearchError)
    expect(() => findSeed(() => false, { label: 'memo: none', tries: 3 })).toThrow(SeedSearchError)
  })

  it('keeps labels apart, and keeps findSeed and findSeeds apart under one label', () => {
    expect(findSeed((s) => s === 5, { label: 'memo: five' })).toBe(5)
    expect(findSeed((s) => s === 6, { label: 'memo: six' })).toBe(6)
    expect(findSeeds((s) => s % 2 === 0, 2, { label: 'memo: five' })).toEqual([2, 4])
  })

  it('searches again when the same labelled predicate is given another range', () => {
    const f = (s: number): boolean => s % 10 === 0
    expect(findSeed(f, { label: 'memo: tens' })).toBe(10)
    expect(findSeed(f, { label: 'memo: tens', from: 11 })).toBe(20)
    expect(findSeed(f, { label: 'memo: tens' })).toBe(10)
  })
})

describe('findSeeds', () => {
  it('returns the first `count` seeds that pass, in order', () => {
    expect(findSeeds((s) => s % 3 === 0, 4)).toEqual([3, 6, 9, 12])
    expect(findSeeds((s) => s % 3 === 0, 2, { from: 4 })).toEqual([6, 9])
    expect(findSeeds(() => true, 1)).toEqual([1])
  })

  it('stops once it has enough', () => {
    const c = counted((s) => s % 2 === 0)
    expect(findSeeds(c.pred, 3)).toEqual([2, 4, 6])
    expect(c.calls).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('throws SeedSearchError, naming the label, when fewer than `count` pass in the range', () => {
    let error: unknown
    try {
      findSeeds((s) => s % 50 === 0, 5, { label: 'five fifties' })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SeedSearchError)
    expect((error as Error).message).toContain('five fifties')
    expect((error as Error).message).toMatch(/4\b/)
    expect(findSeeds((s) => s % 50 === 0, 4)).toEqual([50, 100, 150, 200])
  })

  it('applies the same rules about the predicate and the options', () => {
    expect(() => findSeeds(((s: number) => s) as unknown as (s: number) => boolean, 2)).toThrow(/\b1\b/)
    expect(() =>
      findSeeds((s) => {
        if (s === 3) throw new Error('bad life')
        return false
      }, 2),
    ).toThrow(/3.*bad life|bad life.*3/s)
    expect(() => findSeeds(() => true, 0)).toThrow(RangeError)
    expect(() => findSeeds(() => true, -2)).toThrow(RangeError)
    expect(() => findSeeds(() => true, 1.5)).toThrow(RangeError)
    expect(() => findSeeds(() => true, 1, { tries: 0 })).toThrow(RangeError)
  })

  it('remembers a labelled answer and refuses a different predicate under that label', () => {
    const c = counted((s) => s % 5 === 0)
    expect(findSeeds(c.pred, 2, { label: 'memo: fives' })).toEqual([5, 10])
    const n = c.calls.length
    expect(findSeeds(c.pred, 2, { label: 'memo: fives' })).toEqual([5, 10])
    expect(c.calls).toHaveLength(n)
    expect(() => findSeeds((s) => s % 6 === 0, 2, { label: 'memo: fives' })).toThrow(/memo: fives/)
  })

  it('hands back a copy: changing the list does not change what the label remembers', () => {
    const first = findSeeds((s) => s % 5 === 0, 2, { label: 'memo: copy' })
    first.push(999)
    expect(findSeeds((s) => s % 5 === 0, 2, { label: 'memo: copy' })).toEqual([5, 10])
  })
})
