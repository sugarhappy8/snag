// ci: fast
// R2-B1 (K.3, design 13.3): named streams. stream(g, tag, year, id) is the only source of luck a world module may use. It is
// a pure function of the family, a tag, a year and an entity id: it never reads or writes g.rng, g.nextId or a flag, so one
// extra draw on one stream cannot move any other stream. outcomeStream adds the Time Machine's fork tag, so a jump re-rolls the
// year it lands in. textUnit is the n-th value of the text stream (the cursor that picks n lives in text/draw.ts, R2-B2).
// The Time Machine's fork readers moved to kernel/forks.ts in the same task; timeMachine.ts re-exports them.
import { describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { FORKS_FLAG, forkTag, outcomeTag, timelineForks, timelineTag } from '../src/game/kernel/forks'
import {
  STREAM_TAG,
  hashKey,
  outcomeStream,
  stream,
  streamKey,
  streamUnit,
  textStreamKey,
  textUnit,
  worldSeed,
} from '../src/game/kernel/streams'
import { nextRandom } from '../src/game/rng'
import * as tm from '../src/game/timeMachine'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const US = '\u001f'

function take(f: () => number, n: number): number[] {
  return Array.from({ length: n }, f)
}

function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) freeze(x)
  }
  return v
}

function life(lifeId: string, forks?: Json): Pick<GameState, 'lifeId' | 'flags'> {
  return { lifeId, flags: forks === undefined ? {} : { [FORKS_FLAG]: forks } }
}

describe('hashKey and streamKey', () => {
  it('is FNV-1a over UTF-16 code units, as an int32', () => {
    // The published FNV-1a 32-bit test vectors.
    expect(hashKey('')).toBe(0x811c9dc5 | 0)
    expect(hashKey('a')).toBe(0xe40c292c | 0)
    expect(hashKey('foobar')).toBe(0xbf9cf968 | 0)
    // A code unit above 0xff counts as one unit, not as its UTF-8 bytes.
    expect(hashKey('é')).not.toBe(hashKey('e'))
    expect(Number.isInteger(hashKey('anything at all'))).toBe(true)
  })

  it('hashes a key the way assets.ts seeded() does, so a key means the same thing in both', () => {
    for (const key of ['', 'x', 'life-2026-abc|econ|2030', `a${US}b${US}2020${US}`]) {
      expect(seeded(key).next()).toBe(nextRandom(hashKey(key))[0])
    }
  })

  it('joins seed, tag, year and id with U+001F, and an absent id reads as an empty one', () => {
    expect(streamKey('s', 'econ', 2030, 'us')).toBe(['s', 'econ', '2030', 'us'].join(US))
    expect(streamKey('s', 'econ', 2030, 7)).toBe(streamKey('s', 'econ', 2030, '7'))
    expect(streamKey('s', 'econ', 2030)).toBe(streamKey('s', 'econ', 2030, ''))
    expect(streamKey('s', 'econ', 2030, 'a')).not.toBe(streamKey('s', 'econ', 2030, 'b'))
  })
})

describe('worldSeed', () => {
  it('strips the generation suffix, so heirs share the family and a missing id reads as life', () => {
    const table: [string | undefined, string][] = [
      ['life-2026-abc-g3', 'life-2026-abc'],
      ['life-2026-abc', 'life-2026-abc'],
      ['life-2026-abc-g12', 'life-2026-abc'],
      ['life-2026-abc-g3-g4', 'life-2026-abc-g3'],
      ['life-2026-abc-gx', 'life-2026-abc-gx'],
      ['life-2026-abc-g', 'life-2026-abc-g'],
      ['test-life', 'test-life'],
      ['', 'life'],
      [undefined, 'life'],
    ]
    for (const [lifeId, want] of table) expect(worldSeed({ lifeId } as Pick<GameState, 'lifeId'>)).toBe(want)
  })
})

describe('stream', () => {
  const g = life('life-2026-abc')

  it('gives the same first values for the same arguments', () => {
    const a = take(stream(g, 'econ', 2030, 'us'), 5)
    const b = take(stream(g, 'econ', 2030, 'us'), 5)
    expect(a).toEqual(b)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(a).size).toBe(5)
  })

  it('gives different values for a different tag, year, id or world seed', () => {
    const base = take(stream(g, 'econ', 2030, 'us'), 5)
    expect(take(stream(g, 'wars', 2030, 'us'), 5)).not.toEqual(base)
    expect(take(stream(g, 'econ', 2031, 'us'), 5)).not.toEqual(base)
    expect(take(stream(g, 'econ', 2030, 'uk'), 5)).not.toEqual(base)
    expect(take(stream(g, 'econ', 2030), 5)).not.toEqual(base)
    expect(take(stream(life('life-2026-abd'), 'econ', 2030, 'us'), 5)).not.toEqual(base)
  })

  it('is shared by the heirs of one family and by a numeric and a string id', () => {
    const base = take(stream(g, 'econ', 2030, 7), 5)
    expect(take(stream(life('life-2026-abc-g2'), 'econ', 2030, 7), 5)).toEqual(base)
    expect(take(stream(life('life-2026-abc-g9'), 'econ', 2030, '7'), 5)).toEqual(base)
  })

  it('is not disturbed by another generator: interleaved streams with equal arguments each agree with a solo one', () => {
    const solo = take(stream(g, 'econ', 2030, 'us'), 4)
    const a = stream(g, 'econ', 2030, 'us')
    const b = stream(g, 'econ', 2030, 'us')
    const other = stream(g, 'econ', 2030, 'uk')
    const fromA: number[] = []
    const fromB: number[] = []
    for (let i = 0; i < 4; i++) {
      fromA.push(a())
      other()
      fromB.push(b())
      other()
    }
    expect(fromA).toEqual(solo)
    expect(fromB).toEqual(solo)
  })

  it('works on a deep-frozen state and never touches g.rng, g.nextId or a flag', () => {
    const game = makeTestGame(7)
    game.flags.timelineForks = [{ year: 2020, salt: 'abc' }]
    game.flags.keep = 'me'
    const before = structuredClone(game)
    freeze(game)
    for (let i = 0; i < 1000; i++) {
      const s = stream(game, 'econ', 2030 + (i % 7), i)
      s()
      const o = outcomeStream(game, 'wars', 2030 + (i % 7), `c${i}`)
      o()
    }
    expect(game.rng).toBe(before.rng)
    expect(game.nextId).toBe(before.nextId)
    expect(game.flags).toEqual(before.flags)
    expect(game).toEqual(before)
  })

  it('draws a state with no flags at all (the kernel asks stream for nothing but the life id)', () => {
    expect(() => stream({ lifeId: 'x' }, 'econ', 2030)()).not.toThrow()
  })

  it('throws on a bad tag', () => {
    for (const tag of ['', 'Econ', 'e'.repeat(33), 'a b', '1abc', 'a/b', 'café']) {
      expect(() => stream(g, tag, 2030), JSON.stringify(tag)).toThrow('stream: bad tag')
      expect(() => outcomeStream(g, tag, 2030), JSON.stringify(tag)).toThrow('stream: bad tag')
    }
    for (const tag of ['a', 'econ', 'wars.east', 'a_b-c.d9', 'e'.repeat(32)]) {
      expect(() => stream(g, tag, 2030)()).not.toThrow()
      expect(STREAM_TAG.test(tag)).toBe(true)
    }
  })

  it('is uniform: the first draw of 4,000 sibling ids has a flat mean and flat tenths', () => {
    const first = Array.from({ length: 4000 }, (_, id) => stream(g, 'econ', 2030, id)())
    const mean = first.reduce((s, v) => s + v, 0) / first.length
    expect(mean).toBeGreaterThan(0.48)
    expect(mean).toBeLessThan(0.52)
    const bins = new Array<number>(10).fill(0)
    for (const v of first) bins[Math.min(9, Math.floor(v * 10))]++
    for (const n of bins) {
      expect(n).toBeGreaterThanOrEqual(300)
      expect(n).toBeLessThanOrEqual(500)
    }
  })

  it('does not correlate sibling ids on the first draw (the warm-up output is discarded)', () => {
    // Without the warm-up, the first outputs of nearby seeds track each other. Compare each id with the next.
    const first = Array.from({ length: 2000 }, (_, id) => stream(g, 'econ', 2030, id)())
    let sx = 0
    let sy = 0
    let sxy = 0
    let sxx = 0
    let syy = 0
    const n = first.length - 1
    for (let i = 0; i < n; i++) {
      const x = first[i]!
      const y = first[i + 1]!
      sx += x
      sy += y
      sxy += x * y
      sxx += x * x
      syy += y * y
    }
    const corr = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
    expect(Math.abs(corr)).toBeLessThan(0.08)
  })

  it('is pinned: the first values of one stream, so a change to the definition is seen at once', () => {
    // seed hashKey(streamKey('life-2026-abc', 'econ', 2030, 'us')), one warm-up output discarded, then mulberry32.
    const key = streamKey('life-2026-abc', 'econ', 2030, 'us')
    let state = hashKey(key)
    state = nextRandom(state)[1]
    const want: number[] = []
    for (let i = 0; i < 3; i++) {
      const [v, s] = nextRandom(state)
      want.push(v)
      state = s
    }
    expect(take(stream(life('life-2026-abc-g4'), 'econ', 2030, 'us'), 3)).toEqual(want)
    // The numbers themselves: other tracks record goldens on these streams, so they move only by a decision.
    expect(want).toEqual([0.7138032345101237, 0.31670832983218133, 0.8794228273909539])
  })
})

describe('outcomeStream', () => {
  it('equals stream when the life never jumped', () => {
    const g = life('life-2026-abc')
    expect(take(outcomeStream(g, 'econ', 2030, 'us'), 5)).toEqual(take(stream(g, 'econ', 2030, 'us'), 5))
    expect(take(outcomeStream(g, 'econ', 2030), 5)).toEqual(take(stream(g, 'econ', 2030, ''), 5))
    expect(take(outcomeStream(g, 'econ', 2030, 4), 5)).toEqual(take(stream(g, 'econ', 2030, '4'), 5))
  })

  it('re-rolls every year at or after a fork and keeps the years before it', () => {
    const F = 2030
    const forked = life('life-2026-abc', [{ year: F, salt: 'k3' }])
    const plain = life('life-2026-abc')
    for (const y of [F - 5, F - 2, F - 1]) {
      expect(outcomeTag(forked, y), `tag ${y}`).toBe('')
      expect(take(outcomeStream(forked, 'econ', y, 'us'), 4), `year ${y}`).toEqual(take(stream(plain, 'econ', y, 'us'), 4))
    }
    for (const y of [F, F + 1, F + 10]) {
      expect(outcomeTag(forked, y), `tag ${y}`).toBe('~k3')
      expect(take(outcomeStream(forked, 'econ', y, 'us'), 4), `year ${y}`).not.toEqual(take(stream(plain, 'econ', y, 'us'), 4))
    }
    // The tag is appended to the id: the same as asking stream for it by hand.
    expect(take(outcomeStream(forked, 'econ', F, 'us'), 4)).toEqual(take(stream(forked, 'econ', F, 'us~k3'), 4))
  })

  it('gives a different salt a different future', () => {
    const a = life('life-2026-abc', [{ year: 2030, salt: 'k3' }])
    const b = life('life-2026-abc', [{ year: 2030, salt: 'k4' }])
    expect(take(outcomeStream(a, 'econ', 2031, 'us'), 4)).not.toEqual(take(outcomeStream(b, 'econ', 2031, 'us'), 4))
  })
})

describe('streamUnit and textUnit', () => {
  const g = life('life-2026-abc-g2')

  it('streamUnit is pure, in [0, 1) and different for each n', () => {
    const key = streamKey('s', 'text', 2030)
    const a = Array.from({ length: 50 }, (_, n) => streamUnit(key, n))
    expect(Array.from({ length: 50 }, (_, n) => streamUnit(key, n))).toEqual(a)
    expect(new Set(a).size).toBe(50)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(streamUnit(key, 3)).toBe(streamUnit(key, 3))
    expect(streamUnit(`${key}x`, 3)).not.toBe(streamUnit(key, 3))
  })

  it('streamUnit is the value after one warm-up output of the key with the count appended', () => {
    const key = streamKey('s', 'text', 2030)
    for (const n of [0, 1, 7, 1000]) {
      const state = nextRandom(hashKey(`${key}${US}${n}`))[1]
      expect(streamUnit(key, n)).toBe(nextRandom(state)[0])
    }
  })

  it('textUnit equals streamUnit of the text key, and the key is the life id (not the family) plus the outcome tag', () => {
    expect(textStreamKey(g, 2030)).toBe(streamKey('life-2026-abc-g2', 'text', 2030))
    for (const n of [0, 1, 5]) expect(textUnit(g, 2030, n)).toBe(streamUnit(textStreamKey(g, 2030), n))
    const forked = life('life-2026-abc-g2', [{ year: 2030, salt: 'k3' }])
    expect(textStreamKey(forked, 2030)).toBe(streamKey('life-2026-abc-g2~k3', 'text', 2030))
    expect(textStreamKey(forked, 2029)).toBe(textStreamKey(g, 2029))
  })

  it('textUnit differs by life, year, n and by a fork at or before the year', () => {
    const base = textUnit(g, 2030, 0)
    expect(textUnit(life('life-2026-abc-g3'), 2030, 0)).not.toBe(base)
    expect(textUnit(life('life-2026-abc'), 2030, 0)).not.toBe(base)
    expect(textUnit(g, 2031, 0)).not.toBe(base)
    expect(textUnit(g, 2030, 1)).not.toBe(base)
    const forkedAt = (y: number) => life('life-2026-abc-g2', [{ year: y, salt: 'k3' }])
    expect(textUnit(forkedAt(2030), 2030, 0)).not.toBe(base)
    expect(textUnit(forkedAt(2020), 2030, 0)).not.toBe(base)
    // A fork after the year leaves it alone: the year had ended when the jump landed.
    expect(textUnit(forkedAt(2031), 2030, 0)).toBe(base)
  })

  it('textUnit reads nothing but the life id and the fork flag, and is safe on a frozen state', () => {
    const frozen = freeze(life('life-2026-abc-g2', [{ year: 2030, salt: 'k3' }]))
    expect(textUnit(frozen, 2030, 2)).toBe(textUnit(structuredClone(frozen), 2030, 2))
  })
})

describe('the text stream, pinned', () => {
  it('gives these first values for one life, and others after a fork at the year', () => {
    const g = life('life-2026-abc-g2')
    expect([0, 1, 2].map((n) => textUnit(g, 2030, n))).toEqual([0.40061591821722686, 0.3353050062432885, 0.6917788586579263])
    const forked = life('life-2026-abc-g2', [{ year: 2030, salt: 'k3' }])
    expect([0, 1].map((n) => textUnit(forked, 2030, n))).toEqual([0.43228361872024834, 0.6430285254027694])
  })
})

describe('kernel/forks and the timeMachine re-exports', () => {
  it('timeMachine.ts still exports the four readers, and they are the kernel functions', () => {
    expect(tm.timelineForks).toBe(timelineForks)
    expect(tm.forkTag).toBe(forkTag)
    expect(tm.timelineTag).toBe(timelineTag)
    expect(tm.outcomeTag).toBe(outcomeTag)
    expect(FORKS_FLAG).toBe('timelineForks')
  })

  it('keeps the rest of the Time Machine where it was', () => {
    expect(typeof tm.addFork).toBe('function')
    expect(typeof tm.timelineFamily).toBe('function')
    expect(typeof tm.familyAt).toBe('function')
    expect(typeof tm.arriveInPast).toBe('function')
    expect(tm.addFork([{ year: 2001, salt: 'a' }, { year: 2005, salt: 'b' }], 2003, 'c')).toEqual([
      { year: 2001, salt: 'a' },
      { year: 2003, salt: 'c' },
    ])
  })

  it('reads forks with the old rules: junk is dropped, years are floored, a salt is lower case letters and digits', () => {
    const junk = life('x', [{ year: 'x', salt: 1 }, null, { year: 2001, salt: 'a,b' }, { year: 2002.9, salt: 'ok1' }, 5, [], { year: Infinity, salt: 'z' }])
    expect(timelineForks(junk)).toEqual([{ year: 2002, salt: 'ok1' }])
    expect(timelineForks({ flags: {} })).toEqual([])
    expect(timelineForks({ flags: { timelineForks: 'nope' } })).toEqual([])
    expect(timelineForks({ flags: { timelineForks: { year: 1, salt: 'a' } } })).toEqual([])
  })

  it('keeps the newest 128 forks of a flag that holds 500 (it runs on every text draw)', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ year: 1900 + i, salt: `s${i.toString(36)}` }))
    const out = timelineForks({ flags: { timelineForks: many } })
    expect(out).toHaveLength(128)
    expect(out[0]).toEqual(many[372])
    expect(out[127]).toEqual(many[499])
    // The cap comes before validation: junk among the newest 128 is dropped, older valid forks are not pulled in.
    const mixed = [...many.slice(0, 400), ...Array.from({ length: 100 }, () => null), ...many.slice(400, 428)]
    expect(timelineForks({ flags: { timelineForks: mixed } })).toHaveLength(28)
    // At or under the cap nothing is lost.
    expect(timelineForks({ flags: { timelineForks: many.slice(0, 128) } })).toHaveLength(128)
    expect(timelineForks({ flags: { timelineForks: many.slice(0, 3) } })).toEqual(many.slice(0, 3))
  })

  it('forkTag, timelineTag and outcomeTag keep their meaning, and timelineTag takes a bare flags object', () => {
    const forks = [{ year: 2010, salt: 'a1' }, { year: 2015, salt: 'b2' }]
    expect(forkTag(forks, 2010)).toBe('')
    expect(forkTag(forks, 2011)).toBe('~a1')
    expect(forkTag(forks, 2016)).toBe('~b2')
    expect(forkTag(forks, Number.NaN)).toBe('')
    expect(forkTag([], 2020)).toBe('')
    const flags = { timelineForks: forks }
    expect(timelineTag({ flags }, 2011)).toBe('~a1')
    expect(outcomeTag({ flags }, 2010)).toBe('~a1')
    expect(outcomeTag({ flags }, 2009)).toBe('')
    expect(outcomeTag({ flags }, Number.NaN)).toBe('')
  })
})
