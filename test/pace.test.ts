// ci: fast
// R3-Q8 (E.T5): the pace core. One family rule for every popup engine: a family that spoke lately weighs a quarter as much
// (events, company events, the career kit) or waits out a gap (asks). The memory is the text kit's family record
// (flags.textMem.f), so the whole rule costs no new saved field. Everything the rule reads is pure: no g.rng draw, no write,
// nothing after g.year. An ask family also has a lifetime cap (PACE.askLife, R3 lead decision L2): the family record of an ask
// keeps its years for the whole life, so the cap can count them.
import { describe, expect, it } from 'vitest'
import { familyLast, familyUses, isMemKey, noteFamily, readTextMem, familyStats } from '../src/game/text/memory'
import { KIN_FAMILIES, PACE, askGapOk, notePopup, paceKey, paceWeight, popupSeen, withPaceOff } from '../src/game/text/pace'
import type { GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

function game(year = 2030): GameState {
  const g = makeTestGame(1)
  g.year = year
  return g
}

describe('PACE', () => {
  it('holds the agreed numbers', () => {
    expect(PACE).toEqual({ window: 5, weight: 0.25, askGap: 4, askLife: 6, maxFamilies: 80 })
    expect(Object.isFrozen(PACE)).toBe(true)
  })
})

describe('paceKey', () => {
  it('writes pop.<engine>.<family>', () => {
    expect(paceKey('ev', 'scam')).toBe('pop.ev.scam')
    expect(paceKey('ask', 'wheels')).toBe('pop.ask.wheels')
    expect(paceKey('biz', 'regulator')).toBe('pop.biz.regulator')
    expect(paceKey('kit', 'work.crisis')).toBe('pop.kit.work.crisis')
    expect(paceKey('kin', 'feud')).toBe('pop.kin.feud')
  })

  // R4-E9 (X41): the fifth engine, `kin`, holds the three families that E10b (a lender calls), E11 (a secret leaks) and E12 (a falling out)
  // use. The list is closed: a fourth name is a typo or a task that has not asked for its family, and either way it throws when the table loads.
  it('has the kin engine with a closed list of three families', () => {
    expect([...KIN_FAMILIES]).toEqual(['feud', 'lender', 'leak'])
    expect(Object.isFrozen(KIN_FAMILIES)).toBe(true)
    expect(KIN_FAMILIES.map((f) => paceKey('kin', f))).toEqual(['pop.kin.feud', 'pop.kin.lender', 'pop.kin.leak'])
    for (const other of ['gossip', 'offer', 'Feud', 'feuds', 'feud.x', '']) expect(() => paceKey('kin', other), JSON.stringify(other)).toThrow(/pace/i)
  })

  it('notes a kin family like any other, and ignores a kin key outside the list', () => {
    const g = game(2030)
    for (const f of KIN_FAMILIES) notePopup(g, paceKey('kin', f))
    notePopup(g, 'pop.kin.gossip')
    notePopup(g, 'pop.kin.')
    expect(Object.keys(readTextMem(g).f).sort()).toEqual(['pop.kin.feud', 'pop.kin.leak', 'pop.kin.lender'])
    expect(popupSeen(g, 'pop.kin.lender')).toBe(true)
    expect(paceWeight(g, 'pop.kin.feud', 8)).toBe(2)
    // a kin family is a weighted family, not an ask: it keeps the ten years every non-ask family keeps
    expect(familyUses(g, 'pop.kin.leak')).toBe(1)
  })

  it('always makes a key the text memory accepts, also at the longest family', () => {
    const longest = 'a' + 'b'.repeat(39)
    expect(isMemKey(paceKey('ev', longest))).toBe(true)
    expect(isMemKey(paceKey('ev', 'siblingFriction'))).toBe(true)
  })

  it('throws at definition time on a bad family or engine', () => {
    for (const bad of ['', 'Scam', '1scam', 'a b', 'a-b', 'a_b', '.a', 'a'.repeat(41), '../x', 'a:b', 'a\nb']) {
      expect(() => paceKey('ev', bad), JSON.stringify(bad)).toThrow(/pace/i)
    }
    expect(() => paceKey('web' as never, 'scam')).toThrow(/pace/i)
    expect(() => paceKey('' as never, 'scam')).toThrow(/pace/i)
  })
})

describe('notePopup and popupSeen', () => {
  const key = paceKey('ev', 'scam')

  it('notes the family once a year: twice in one year keeps one entry', () => {
    const g = game(2030)
    notePopup(g, key)
    notePopup(g, key)
    expect(readTextMem(g).f[key]).toBe('2030')
    g.year = 2031
    notePopup(g, key)
    notePopup(g, key)
    expect(readTextMem(g).f[key]).toBe('2030,2031')
  })

  it('ignores a key that did not come from paceKey', () => {
    const g = game(2030)
    notePopup(g, 'scam')
    notePopup(g, 'pop.web.scam')
    notePopup(g, 'pop.ev.')
    notePopup(g, '')
    expect(g.flags.textMem).toBeUndefined()
  })

  it('has been seen this year and the 4 after it, not the 5th', () => {
    const g = game(2030)
    expect(popupSeen(g, key)).toBe(false)
    notePopup(g, key)
    for (const [year, seen] of [[2030, true], [2031, true], [2034, true], [2035, false], [2040, false]] as const) {
      g.year = year
      expect(popupSeen(g, key), String(year)).toBe(seen)
    }
  })

  it('takes its own window', () => {
    const g = game(2030)
    notePopup(g, key)
    g.year = 2032
    expect(popupSeen(g, key, 2)).toBe(false)
    expect(popupSeen(g, key, 3)).toBe(true)
  })

  it('never reads a year after g.year: a note in 2033 is ignored at 2030', () => {
    const g = game(2033)
    notePopup(g, key)
    g.year = 2030
    expect(popupSeen(g, key)).toBe(false)
    expect(paceWeight(g, key, 10)).toBe(10)
    expect(askGapOk(g, key)).toBe(true)
  })

  it('agrees with the text kit family record on any memory the kit wrote', () => {
    const g = game(2000)
    const fam = paceKey('ev', 'agree')
    for (const y of [2000, 2003, 2004, 2009, 2010, 2016, 2017, 2018, 2025]) {
      g.year = y
      noteFamily(g, fam)
      for (const at of [y, y + 1, y + 6]) {
        const was = g.year
        g.year = at
        expect(familyLast(g, fam), `${y}/${at}`).toBe(familyStats(g, fam).last)
        g.year = was
      }
    }
  })
})

describe('familyLast on hostile memory', () => {
  const key = paceKey('ev', 'scam')

  it('reads a damaged record as never seen', () => {
    for (const rec of ['2030,2029', 'x', '', '2030,', '1,2,3,4,5,6,7,8,9,10,11,12,13', 5, null, { a: 1 }]) {
      const g = game(2031)
      g.flags.textMem = { v: 1, p: {}, f: { [key]: rec }, r: {} } as never
      expect(familyLast(g, key), JSON.stringify(rec)).toBeNull()
      expect(popupSeen(g, key)).toBe(false)
    }
    const g = game(2031)
    for (const mem of [null, 7, 'x', [], { v: 2, f: { [key]: '2030' } }, { v: 1, f: [] }, { v: 1, f: 'x' }]) {
      g.flags.textMem = mem as never
      expect(familyLast(g, key)).toBeNull()
    }
  })

  it('reads a key the memory would not hold as never seen', () => {
    const g = game(2031)
    g.flags.textMem = { v: 1, p: {}, f: { '9bad': '2030' }, r: {} } as never
    expect(familyLast(g, '9bad')).toBeNull()
    expect(familyLast(g, 'toString')).toBeNull()
    expect(familyLast(g, '__proto__')).toBeNull()
  })

  it('answers as the sanitized memory does when the family map is over its cap', () => {
    const g = game(2031)
    const f: Record<string, string> = { [key]: '2030' }
    for (let i = 0; i < 130; i++) f[`pop.ev.f${i}`] = '2030'
    g.flags.textMem = { v: 1, p: {}, f, r: {} } as never
    // The sanitized memory keeps the newest 120 keys, so the oldest one (key) is dropped there.
    expect(familyLast(g, key)).toBe(familyStats(g, key).last)
    expect(familyLast(g, 'pop.ev.f129')).toBe(2030)
  })
})

describe('paceWeight', () => {
  const key = paceKey('ev', 'scam')

  it('is the base when there is no family or nothing was seen', () => {
    const g = game(2030)
    expect(paceWeight(g, undefined, 10)).toBe(10)
    expect(paceWeight(g, key, 10)).toBe(10)
  })

  it('is a quarter of the base within 5 years and the base after', () => {
    const g = game(2030)
    notePopup(g, key)
    expect(paceWeight(g, key, 10)).toBe(2.5)
    g.year = 2034
    expect(paceWeight(g, key, 10)).toBe(2.5)
    g.year = 2035
    expect(paceWeight(g, key, 10)).toBe(10)
  })

  it('keeps a base of 0 (or less) at itself', () => {
    const g = game(2030)
    notePopup(g, key)
    expect(paceWeight(g, key, 0)).toBe(0)
    expect(paceWeight(g, key, -3)).toBe(-3)
  })

  it('does not touch another family', () => {
    const g = game(2030)
    notePopup(g, key)
    expect(paceWeight(g, paceKey('ev', 'neighbors'), 10)).toBe(10)
  })
})

describe('askGapOk', () => {
  const key = paceKey('ask', 'wheels')

  it('is false inside 4 years of the family and true from the 4th year on', () => {
    const g = game(2030)
    expect(askGapOk(g, key)).toBe(true)
    notePopup(g, key)
    for (const [year, ok] of [[2030, false], [2031, false], [2033, false], [2034, true], [2050, true]] as const) {
      g.year = year
      expect(askGapOk(g, key), String(year)).toBe(ok)
    }
  })

  it('lets a storyline through and a missing family through', () => {
    const g = game(2030)
    notePopup(g, key)
    expect(askGapOk(g, key, true)).toBe(true)
    expect(askGapOk(g, undefined)).toBe(true)
    expect(askGapOk(g, undefined, false)).toBe(true)
  })
})

describe('familyUses', () => {
  const key = paceKey('ask', 'loan')

  it('counts the years the family was noted, not after g.year, and none for a family never noted', () => {
    const g = game(2030)
    expect(familyUses(g, key)).toBe(0)
    g.flags.textMem = { v: 1, p: {}, f: { [key]: '2020,2024,2028,2034' }, r: {} }
    for (const [year, uses] of [[2019, 0], [2020, 1], [2027, 2], [2028, 3], [2033, 3], [2034, 4], [2090, 4]] as const) {
      g.year = year
      expect(familyUses(g, key), String(year)).toBe(uses)
    }
  })

  it('reads a damaged record, a key the memory would not hold and a family map over its cap as the sanitized memory does', () => {
    for (const rec of ['2030,2029', 'x', '', '2030,', '1,2,3,4,5,6,7,8,9,10,11,12,13', 5, null, { a: 1 }]) {
      const g = game(2031)
      g.flags.textMem = { v: 1, p: {}, f: { [key]: rec }, r: {} } as never
      expect(familyUses(g, key), JSON.stringify(rec)).toBe(0)
    }
    const g = game(2031)
    g.flags.textMem = { v: 1, p: {}, f: { '9bad': '2030' }, r: {} } as never
    expect([familyUses(g, '9bad'), familyUses(g, 'toString'), familyUses(g, '__proto__')]).toEqual([0, 0, 0])
    const f: Record<string, string> = { [key]: '2030,2031' }
    for (let i = 0; i < 170; i++) f[`pop.ev.f${i}`] = '2030'
    g.flags.textMem = { v: 1, p: {}, f, r: {} } as never
    // The sanitized memory keeps the newest 160 keys, so the oldest one (key) is dropped there.
    expect(familyUses(g, key)).toBe(0)
    expect(familyUses(g, 'pop.ev.f169')).toBe(1)
  })
})

describe('askGapOk: the lifetime cap (lead decision L2: a popup family at most 6 times a life)', () => {
  const key = paceKey('ask', 'venture')
  /** Notes the family in each year, the way the engine does where it presents. */
  const told = (g: GameState, years: readonly number[]): void => {
    for (const y of years) {
      g.year = y
      notePopup(g, key)
    }
  }
  const SIX = [2030, 2034, 2038, 2042, 2046, 2050]

  it('refuses the 7th telling of a family however long it waited, and still offers the 6th', () => {
    const g = game(2030)
    told(g, SIX.slice(0, 5))
    g.year = 2054
    expect(askGapOk(g, key), 'after 5 tellings').toBe(true)
    told(g, [2054])
    for (const year of [2058, 2070, 2100]) {
      g.year = year
      expect(askGapOk(g, key), `after 6 tellings, at ${year}`).toBe(false)
    }
  })

  it('remembers a telling for the whole life: the 10 year window of the text kit does not make a family new again', () => {
    const g = game(2030)
    told(g, SIX)
    g.year = 2080
    expect(familyUses(g, key)).toBe(6)
    expect(askGapOk(g, key)).toBe(false)
  })

  it('keeps the gap as it was before the cap: 4 years from the last telling, whatever the count', () => {
    const g = game(2030)
    told(g, SIX.slice(0, 3))
    for (const [year, ok] of [[2038, false], [2039, false], [2041, false], [2042, true]] as const) {
      g.year = year
      expect(askGapOk(g, key), String(year)).toBe(ok)
    }
  })

  it('holds a storyline too: it is let through the gap, but not past the 6th telling', () => {
    const g = game(2030)
    told(g, [2030, 2031, 2032, 2033, 2034])
    expect(askGapOk(g, key, true)).toBe(true)
    told(g, [2035])
    expect(askGapOk(g, key, true)).toBe(false)
    expect(askGapOk(g, key, false)).toBe(false)
  })

  it('counts each family on its own and leaves a missing family and the pace-off seam alone', () => {
    const g = game(2030)
    told(g, SIX)
    g.year = 2060
    expect(askGapOk(g, key)).toBe(false)
    expect(askGapOk(g, paceKey('ask', 'loan'))).toBe(true)
    expect(askGapOk(g, undefined)).toBe(true)
    expect(withPaceOff(() => askGapOk(g, key))).toBe(true)
  })

  it('does not count a telling after g.year (no foresight)', () => {
    const g = game(2030)
    told(g, [2030, 2034, 2038, 2060, 2064, 2068])
    g.year = 2050
    expect(familyUses(g, key)).toBe(3)
    expect(askGapOk(g, key)).toBe(true)
    g.year = 2070
    expect(familyUses(g, key)).toBe(6)
    expect(askGapOk(g, key)).toBe(false)
  })

  it('keeps the life only for asks: an event family still forgets a telling 10 years behind', () => {
    const g = game(2030)
    const ev = paceKey('ev', 'scam')
    notePopup(g, ev)
    g.year = 2041
    notePopup(g, ev)
    expect(readTextMem(g).f[ev]).toBe('2041')
    const ask = paceKey('ask', 'loan')
    g.year = 2030
    notePopup(g, ask)
    g.year = 2041
    notePopup(g, ask)
    expect(readTextMem(g).f[ask]).toBe('2030,2041')
  })

  it('stays inside the memory caps: at most 12 years of a family, the newest, and the 6 that count are among them', () => {
    const g = game(2030)
    for (let i = 0; i < 20; i++) {
      g.year = 2030 + i * 5
      notePopup(g, key)
    }
    const years = readTextMem(g).f[key]!.split(',').map(Number)
    expect(years).toHaveLength(12)
    expect(years[11]).toBe(2125)
    expect(familyUses(g, key)).toBe(12)
  })

  it('is as pure as the gap: a deep-frozen state is fine and g.rng does not move', () => {
    const g = game(2030)
    told(g, SIX)
    const rng = g.rng
    const json = JSON.stringify(g)
    deepFreeze(g)
    expect(askGapOk(g, key)).toBe(false)
    expect(familyUses(g, key)).toBe(6)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
  })
})

describe('purity', () => {
  it('reads draw nothing and write nothing: a deep-frozen state is fine and g.rng does not move', () => {
    const g = game(2030)
    const key = paceKey('ev', 'scam')
    notePopup(g, key)
    const rng = g.rng
    const json = JSON.stringify(g)
    deepFreeze(g)
    expect(popupSeen(g, key)).toBe(true)
    expect(paceWeight(g, key, 10)).toBe(2.5)
    expect(askGapOk(g, key)).toBe(false)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('notePopup draws nothing from g.rng', () => {
    const g = game(2030)
    const rng = g.rng
    notePopup(g, paceKey('ev', 'scam'))
    notePopup(g, paceKey('biz', 'rivals'))
    expect(g.rng).toBe(rng)
  })
})

describe('withPaceOff', () => {
  const key = paceKey('ev', 'scam')

  it('turns the rule off: the weight is the base, an ask is always fine, nothing is noted', () => {
    const g = game(2030)
    notePopup(g, key)
    withPaceOff(() => {
      expect(popupSeen(g, key)).toBe(false)
      expect(paceWeight(g, key, 10)).toBe(10)
      expect(askGapOk(g, key)).toBe(true)
      notePopup(g, paceKey('ev', 'other'))
    })
    expect(readTextMem(g).f[paceKey('ev', 'other')]).toBeUndefined()
    expect(paceWeight(g, key, 10)).toBe(2.5)
  })

  it('nests, returns the value and turns back on when the function throws', () => {
    const g = game(2030)
    notePopup(g, key)
    expect(withPaceOff(() => withPaceOff(() => 7))).toBe(7)
    expect(paceWeight(g, key, 10)).toBe(2.5)
    expect(() =>
      withPaceOff(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(paceWeight(g, key, 10)).toBe(2.5)
    withPaceOff(() => {
      withPaceOff(() => undefined)
      expect(paceWeight(g, key, 10)).toBe(10)
    })
  })
})
