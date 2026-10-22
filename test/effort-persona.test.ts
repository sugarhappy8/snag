// ci: fast
// R3-E4 (C.2, the person): the player's effort record flags['effort.you'], the hidden ambition that shows from 18, the yearly posture,
// the drive of a staff trait and the fatigue read. Everything here is a total reader or a bounded writer: nothing draws a number,
// nothing books a dollar, and an untouched life never gets the key (so no golden digest moves).
//
// A save may hold anything, so the hostile cases come first: a record of the wrong shape, another life's record, numbers out of range
// and 500 keys must read as bounded values and never throw.
//
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { STAFF_TRAITS } from '../src/game/business/flavor'
import {
  AGE_REVEAL, AMBITION_BASE, BURNOUT_F, BURNOUT_SHIFT, KNOW_HOW_FIELDS, OVERTIME_STRAIN, POSTURE_STRAIN, SHIFT_MAX, WIN_SHIFT,
} from '../src/game/effort/limits'
import {
  POSTURE_LABELS, STAFF_DRIVE, YOU_KEY, ambitionOf, ambitionReveal, ambitionWord, burnedOut, effortStrain, fatigueOf, postureOf, readYou,
  recordBurnout, recordWin, setPosture, staffDrive, writeYou, youInput,
} from '../src/game/effort/persona'
import { householdView } from '../src/game/household'
import type { GameState, Json } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** The same life every case starts from: 30 years old, willpower 50 and discipline 50 (the helper's own), no talent. */
const adult = (age = 30): GameState => makeTestGame(7, { age })

/** The owner string of a life, the one household.ts stamps. */
const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

/** Stores a raw record under the key, stamped for this life unless the record says otherwise. */
function store(g: GameState, raw: Record<string, unknown>): void {
  g.flags[YOU_KEY] = { owner: ownerOf(g), ...raw } as unknown as Json
}

/** A state whose rng cannot be read or written: any draw in a read throws. */
function noRng(g: GameState): GameState {
  Object.defineProperty(g, 'rng', {
    get() {
      throw new Error('a read touched g.rng')
    },
    set() {
      throw new Error('a read wrote g.rng')
    },
    configurable: true,
  })
  return g
}

const YEAR_MAX = 9999

describe('the key', () => {
  it('is effort.you and is personal, so an heir starts clean', () => {
    expect(YOU_KEY).toBe('effort.you')
    expect(classifyFlag(YOU_KEY)).toBe('personal')
  })

  it('belongs to layer 2 and imports nothing from the domains above it', () => {
    expect(layerOf('src/game/effort/persona.ts')).toBe(2)
    const text = readFileSync(join(ROOT, 'src', 'game', 'effort', 'persona.ts'), 'utf8')
    expect(text).not.toMatch(/from '\.\.\/household'/)
    expect(text).not.toMatch(/from '\.\.\/business/)
    expect(DASH.test(text)).toBe(false)
  })
})

describe('readYou', () => {
  it('reads the defaults for a life that never touched it, and never writes', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const y = readYou(g)
    expect(y).toEqual({
      v: 1, owner: ownerOf(g), shift: 0, posture: 'steady', effective: 'steady', over: 0, fieldK: {}, at: {}, burnouts: 0, burnAt: -1, last: -1,
    })
    expect(JSON.stringify(g)).toBe(before)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('hands out a fresh object each time, so a caller can edit it before it writes', () => {
    const g = adult()
    const a = readYou(g)
    a.shift = 9
    a.fieldK['rd.beverage'] = 50
    expect(readYou(g).shift).toBe(0)
    expect(readYou(g).fieldK).toEqual({})
  })

  it('reads another life\'s record as the defaults (the heir starts clean)', () => {
    const g = adult()
    store(g, { owner: '0:somebody-else', shift: 8, posture: 'push', effective: 'push', over: 20, fieldK: { 'rd.beverage': 70 }, burnouts: 3 })
    expect(readYou(g)).toEqual(readYou(adult()))
    const other = adult()
    other.generation = 2
    store(other, { owner: ownerOf(g), shift: 8, posture: 'push' })
    expect(readYou(other).posture).toBe('steady')
    expect(readYou(other).shift).toBe(0)
    const noOwner = adult()
    noOwner.flags[YOU_KEY] = { shift: 5 }
    expect(readYou(noOwner).shift).toBe(0)
  })

  it('reads its own record back', () => {
    const g = adult()
    store(g, {
      v: 1, shift: 3.5, posture: 'push', effective: 'lean', over: 4, fieldK: { 'rd.beverage': 41.5 }, at: { 'rd.beverage': 2030 },
      burnouts: 2, burnAt: 2028, last: 2030,
    })
    expect(readYou(g)).toEqual({
      v: 1, owner: ownerOf(g), shift: 3.5, posture: 'push', effective: 'lean', over: 4, fieldK: { 'rd.beverage': 41.5 }, at: { 'rd.beverage': 2030 },
      burnouts: 2, burnAt: 2028, last: 2030,
    })
  })

  it('reads anything that is not a record as the defaults', () => {
    for (const raw of [null, undefined, 'push', 42, true, [], [1, 2, 3], NaN, Infinity, () => 1]) {
      const g = adult()
      g.flags[YOU_KEY] = raw as unknown as Json
      expect(readYou(g)).toEqual(readYou(adult()))
    }
  })

  it('cuts every field to its range', () => {
    const g = adult()
    store(g, { shift: 1e9, over: 1e9, burnouts: 1e9, burnAt: 1e9, last: -1e9, posture: 'turbo', effective: 7 })
    const y = readYou(g)
    expect(y.shift).toBe(SHIFT_MAX)
    expect(y.over).toBe(60)
    expect(y.burnouts).toBeLessThanOrEqual(999)
    expect(y.burnAt).toBe(YEAR_MAX)
    expect(y.last).toBe(-1)
    expect(y.posture).toBe('steady')
    expect(y.effective).toBe('steady')
    store(g, { shift: -1e9, over: -5 })
    expect(readYou(g).shift).toBe(-SHIFT_MAX)
    expect(readYou(g).over).toBe(0)
  })

  it('reads a value that is not a finite number as its default', () => {
    for (const bad of [NaN, Infinity, -Infinity, 'x', null, [], {}, true]) {
      const g = adult()
      store(g, { shift: bad, over: bad, burnouts: bad, burnAt: bad, last: bad, posture: bad, effective: bad, fieldK: bad, at: bad })
      expect(readYou(g)).toEqual(readYou(adult()))
    }
  })

  it('keeps at most KNOW_HOW_FIELDS fields of each map, valid keys and values only', () => {
    const g = adult()
    const fieldK: Record<string, number> = {}
    const at: Record<string, number> = {}
    for (let i = 0; i < 500; i++) {
      fieldK[`rd.f${i}`] = 1 + (i % 99)
      at[`rd.f${i}`] = 2000 + (i % 90)
    }
    fieldK['Bad Key'] = 50
    fieldK['rd.nan'] = NaN
    fieldK['rd.big'] = 1e9
    fieldK['rd.neg'] = -4
    at['Bad Key'] = 2000
    at['rd.nan'] = NaN
    at['rd.huge'] = 1e12
    store(g, { fieldK, at })
    const y = readYou(g)
    expect(Object.keys(y.fieldK).length).toBeLessThanOrEqual(KNOW_HOW_FIELDS)
    expect(Object.keys(y.at).length).toBeLessThanOrEqual(KNOW_HOW_FIELDS)
    expect(Object.keys(y.fieldK).length).toBeGreaterThan(0)
    expect(y.fieldK['rd.big']).toBe(100)
    expect(y.fieldK['rd.neg']).toBeUndefined()
    for (const [k, v] of Object.entries(y.fieldK)) {
      expect(k).toMatch(/^[a-z][a-zA-Z0-9.]{0,39}$/)
      expect(v).toBeGreaterThanOrEqual(0.5)
      expect(v).toBeLessThanOrEqual(100)
    }
    for (const [k, v] of Object.entries(y.at)) {
      expect(k).toMatch(/^[a-z][a-zA-Z0-9.]{0,39}$/)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(YEAR_MAX)
    }
    // sorted keys, so the stored JSON never depends on save order
    expect(Object.keys(y.fieldK)).toEqual([...Object.keys(y.fieldK)].sort())
    expect(Object.keys(y.at)).toEqual([...Object.keys(y.at)].sort())
  })

  it('does not let a hostile key reach the prototype', () => {
    const g = adult()
    g.flags[YOU_KEY] = JSON.parse(
      `{"owner":${JSON.stringify(ownerOf(g))},"fieldK":{"__proto__":{"polluted":1},"constructor":5,"rd.ok":20},"at":{"__proto__":{"polluted":1},"toString":2030},"posture":"__proto__"}`,
    ) as Json
    const y = readYou(g)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(y.fieldK)).toBe(Object.prototype)
    expect(y.fieldK['rd.ok']).toBe(20)
    expect(y.posture).toBe('steady')
    expect(Object.keys(y.fieldK)).not.toContain('__proto__')
  })

  it('is a pure read: a deep-frozen life reads it with no throw and no draw', () => {
    const g = adult()
    store(g, { shift: 2, posture: 'push', fieldK: { 'rd.beverage': 30 } })
    deepFreeze(g)
    const before = JSON.stringify(g)
    expect(() => readYou(g)).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
    const h = noRng(adult())
    expect(() => readYou(h)).not.toThrow()
  })
})

describe('writeYou', () => {
  it('stores nothing for the defaults, so an untouched life has no key', () => {
    const g = adult()
    const before = JSON.stringify(g)
    writeYou(g, readYou(g))
    expect(YOU_KEY in g.flags).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('stores a changed record and reads it back', () => {
    const g = adult()
    const y = readYou(g)
    y.shift = 2.5
    y.posture = 'push'
    y.fieldK['rd.beverage'] = 12.34
    writeYou(g, y)
    expect(YOU_KEY in g.flags).toBe(true)
    expect(readYou(g)).toEqual(y)
  })

  it('writes the keys in one fixed order, whatever order the caller built them in', () => {
    const g = adult()
    const y = readYou(g)
    const shuffled = { last: 2031, burnAt: 2030, burnouts: 1, at: {}, fieldK: {}, over: 3, effective: 'lean', posture: 'push', shift: -1, owner: 'x', v: 1 }
    writeYou(g, shuffled as unknown as typeof y)
    expect(Object.keys(g.flags[YOU_KEY] as object)).toEqual(['v', 'owner', 'shift', 'posture', 'effective', 'over', 'fieldK', 'at', 'burnouts', 'burnAt', 'last'])
  })

  it('removes the key when the record goes back to the defaults', () => {
    const g = adult()
    const y = readYou(g)
    y.shift = 4
    writeYou(g, y)
    expect(YOU_KEY in g.flags).toBe(true)
    y.shift = 0
    writeYou(g, y)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('cuts a hostile record before it stores it', () => {
    const g = adult()
    const fieldK: Record<string, number> = {}
    for (let i = 0; i < 500; i++) fieldK[`rd.f${i}`] = 50
    const hostile = { v: 1, owner: ownerOf(g), shift: 99, posture: 'push', effective: 'x', over: 999, fieldK, at: {}, burnouts: -3, burnAt: NaN, last: 1e12 }
    writeYou(g, hostile as unknown as ReturnType<typeof readYou>)
    const stored = g.flags[YOU_KEY] as unknown as ReturnType<typeof readYou>
    expect(stored.shift).toBe(SHIFT_MAX)
    expect(stored.over).toBe(60)
    expect(stored.effective).toBe('steady')
    expect(stored.burnouts).toBe(0)
    expect(stored.burnAt).toBe(-1)
    expect(stored.last).toBe(YEAR_MAX)
    expect(Object.keys(stored.fieldK).length).toBe(KNOW_HOW_FIELDS)
  })

  it('stamps this life as the owner, whatever the object carried', () => {
    const g = adult()
    const y = readYou(g)
    y.owner = '9:stranger'
    y.shift = 1
    writeYou(g, y)
    expect((g.flags[YOU_KEY] as unknown as { owner: string }).owner).toBe(ownerOf(g))
    expect(readYou(g).shift).toBe(1)
  })

  it('overwrites another life\'s record with this life\'s', () => {
    const g = adult()
    store(g, { owner: '0:old', shift: 9, posture: 'push' })
    const y = readYou(g)
    expect(y.shift).toBe(0)
    y.over = 2
    writeYou(g, y)
    expect(readYou(g)).toEqual({ ...readYou(adult()), over: 2 })
  })

  it('is idempotent: writing what it read changes nothing', () => {
    const g = adult()
    store(g, { shift: 3.14159, posture: 'lean', fieldK: { 'rd.beverage': 44.444 }, at: { 'rd.beverage': 2029 }, burnouts: 1, burnAt: 2027, last: 2029 })
    writeYou(g, readYou(g))
    const once = JSON.stringify(g.flags[YOU_KEY])
    writeYou(g, readYou(g))
    expect(JSON.stringify(g.flags[YOU_KEY])).toBe(once)
  })

  it('makes no draw', () => {
    const g = noRng(adult())
    const y = readYou(g)
    y.shift = 1
    expect(() => writeYou(g, y)).not.toThrow()
  })
})

describe('ambition', () => {
  const withHidden = (willpower: number, discipline: number, extra: Partial<GameState['character']> = {}): GameState => {
    const g = adult()
    g.character.hidden.willpower = willpower
    g.character.hidden.discipline = discipline
    Object.assign(g.character, extra)
    return g
  }

  it('is 46 at willpower 50 and discipline 50, with nothing else in play', () => {
    expect(ambitionOf(withHidden(50, 50))).toBeCloseTo(46, 9)
    expect(AMBITION_BASE).toBe(6)
  })

  it('centres a mean life (55 and 55) on 50', () => {
    expect(ambitionOf(withHidden(55, 55))).toBeCloseTo(50, 9)
  })

  it('follows willpower by half and discipline by three tenths', () => {
    const base = ambitionOf(withHidden(40, 40))
    expect(ambitionOf(withHidden(60, 40)) - base).toBeCloseTo(10, 9)
    expect(ambitionOf(withHidden(40, 60)) - base).toBeCloseTo(6, 9)
  })

  it('stays within 0 to 100 at the extremes', () => {
    const low = withHidden(0, 0)
    store(low, { shift: -12 })
    expect(ambitionOf(low)).toBe(0)
    const high = withHidden(100, 100, { talents: ['MainCharacter'] })
    store(high, { shift: 12 })
    expect(ambitionOf(high)).toBe(100)
    expect(ambitionOf(withHidden(100, 100))).toBeCloseTo(86, 9)
  })

  it('adds 4 for each of the five ambitious talents, at most 10 in all', () => {
    const base = ambitionOf(withHidden(50, 50))
    for (const t of ['Inventor', 'Business', 'Leadership', 'Academics', 'Athletics']) {
      expect(ambitionOf(withHidden(50, 50, { talents: [t] })) - base).toBeCloseTo(4, 9)
    }
    expect(ambitionOf(withHidden(50, 50, { talents: ['Inventor', 'Business'] })) - base).toBeCloseTo(8, 9)
    expect(ambitionOf(withHidden(50, 50, { talents: ['Inventor', 'Business', 'Leadership'] })) - base).toBeCloseTo(10, 9)
    expect(ambitionOf(withHidden(50, 50, { talents: ['Inventor', 'Business', 'Leadership', 'Academics', 'Athletics'] })) - base).toBeCloseTo(10, 9)
  })

  it('adds nothing for a talent that is not about drive', () => {
    const base = ambitionOf(withHidden(50, 50))
    for (const t of ['Music', 'Art', 'Cooking', 'Comedy', 'Investing']) {
      expect(ambitionOf(withHidden(50, 50, { talents: [t] }))).toBeCloseTo(base, 9)
    }
  })

  it('adds 8 for Main Character Syndrome, not the 10 its five borrowed talents would', () => {
    const base = ambitionOf(withHidden(50, 50))
    expect(ambitionOf(withHidden(50, 50, { talents: ['MainCharacter'] })) - base).toBeCloseTo(8, 9)
    expect(ambitionOf(withHidden(50, 50, { talent: 'MainCharacter' })) - base).toBeCloseTo(8, 9)
  })

  it('moves with the shift the results have given it', () => {
    const g = withHidden(50, 50)
    store(g, { shift: 5 })
    expect(ambitionOf(g)).toBeCloseTo(51, 9)
    store(g, { shift: -5, owner: '0:other' })
    expect(ambitionOf(g)).toBeCloseTo(46, 9)
  })

  it('reads a hidden value that is not a number as the middle (50), so it never reaches a formula as NaN', () => {
    const g = adult()
    ;(g.character.hidden as unknown as Record<string, unknown>).willpower = NaN
    ;(g.character.hidden as unknown as Record<string, unknown>).discipline = 'x'
    expect(ambitionOf(g)).toBeCloseTo(46, 9)
    ;(g.character.hidden as unknown as Record<string, unknown>).willpower = 1e9
    expect(ambitionOf(g)).toBeCloseTo(50 + 15 + 6, 9)
  })

  it('is a pure read: frozen life, no draw', () => {
    const g = withHidden(70, 30)
    store(g, { shift: 2 })
    deepFreeze(g)
    expect(() => ambitionOf(g)).not.toThrow()
    expect(() => ambitionReveal(g)).not.toThrow()
    const h = noRng(adult())
    expect(() => ambitionOf(h)).not.toThrow()
    expect(() => ambitionReveal(h)).not.toThrow()
  })
})

describe('the reveal at 18', () => {
  it('is hidden at 17 and shown at 18', () => {
    const g17 = makeTestGame(7, { age: 17 })
    expect(AGE_REVEAL).toBe(18)
    expect(ambitionReveal(g17).shown).toBe(false)
    const g18 = makeTestGame(7, { age: 18 })
    expect(ambitionReveal(g18).shown).toBe(true)
  })

  it('gives a hidden ambition no word and no number, so nothing can leak under 18', () => {
    const g = makeTestGame(7, { age: 12 })
    g.character.hidden.willpower = 100
    expect(ambitionReveal(g)).toEqual({ shown: false, word: '', value: 0 })
  })

  it('names an ambition of 46 Driven and shows the rounded number', () => {
    const r = ambitionReveal(makeTestGame(7, { age: 25 }))
    expect(r).toEqual({ shown: true, word: 'Driven', value: 46 })
  })

  it('cuts the words at 25, 45, 65 and 85', () => {
    const table: [number, string][] = [
      [0, 'Easygoing'], [24, 'Easygoing'], [24.4, 'Easygoing'], [25, 'Steady'], [44, 'Steady'], [45, 'Driven'], [64, 'Driven'], [65, 'Hungry'],
      [84, 'Hungry'], [85, 'Relentless'], [100, 'Relentless'],
    ]
    for (const [v, word] of table) expect(ambitionWord(v), String(v)).toBe(word)
  })

  it('shows the word that matches the number it shows', () => {
    for (let w = 0; w <= 100; w += 5) {
      for (let d = 0; d <= 100; d += 10) {
        const g = makeTestGame(7, { age: 30 })
        g.character.hidden.willpower = w
        g.character.hidden.discipline = d
        const r = ambitionReveal(g)
        expect(r.word).toBe(ambitionWord(r.value))
        expect(r.value).toBe(Math.round(ambitionOf(g)))
      }
    }
  })

  it('has five distinct words and no dash in any of them', () => {
    const words = new Set([0, 30, 50, 70, 90].map(ambitionWord))
    expect(words.size).toBe(5)
    for (const w of words) expect(w).not.toMatch(DASH)
  })
})

describe('posture', () => {
  it('is steady for a life that never chose, and for anyone under 18 whatever the record says', () => {
    expect(postureOf(adult())).toBe('steady')
    const kid = makeTestGame(7, { age: 17 })
    store(kid, { posture: 'push', effective: 'push' })
    expect(postureOf(kid)).toBe('steady')
    const grown = makeTestGame(7, { age: 18 })
    store(grown, { posture: 'push', effective: 'push' })
    expect(postureOf(grown)).toBe('push')
  })

  it('takes a choice from 18, stored as the choice and not yet in force', () => {
    const g = makeTestGame(7, { age: 18 })
    expect(setPosture(g, 'push')).toBe(true)
    expect(readYou(g).posture).toBe('push')
    expect(readYou(g).effective).toBe('steady')
    expect(postureOf(g)).toBe('steady')
  })

  it('refuses under 18, an unknown posture and a character who is not alive, and stores nothing', () => {
    const kid = makeTestGame(7, { age: 17 })
    expect(setPosture(kid, 'push')).toBe(false)
    expect(YOU_KEY in kid.flags).toBe(false)
    const g = adult()
    expect(setPosture(g, 'turbo' as never)).toBe(false)
    expect(setPosture(g, undefined as never)).toBe(false)
    expect(YOU_KEY in g.flags).toBe(false)
    const dead = adult()
    dead.character.alive = false
    expect(setPosture(dead, 'push')).toBe(false)
    expect(YOU_KEY in dead.flags).toBe(false)
  })

  it('does not create a record when the choice is the one already there', () => {
    const g = adult()
    expect(setPosture(g, 'steady')).toBe(true)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(setPosture(g, 'push')).toBe(true)
    expect(setPosture(g, 'steady')).toBe(true)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('keeps the rest of the record when the choice changes', () => {
    const g = adult()
    store(g, { shift: 3, fieldK: { 'rd.beverage': 20 } })
    setPosture(g, 'lean')
    const y = readYou(g)
    expect(y.posture).toBe('lean')
    expect(y.shift).toBe(3)
    expect(y.fieldK).toEqual({ 'rd.beverage': 20 })
  })

  it('has a plain label for each of the three, short and without a dash', () => {
    expect(Object.keys(POSTURE_LABELS).sort()).toEqual(['lean', 'push', 'steady'])
    for (const label of Object.values(POSTURE_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
      expect(label.length).toBeLessThanOrEqual(30)
      expect(label.split(' ').length).toBeLessThanOrEqual(5)
      expect(label).not.toMatch(DASH)
    }
    expect(new Set(Object.values(POSTURE_LABELS)).size).toBe(3)
  })
})

describe('effort strain', () => {
  it('is 0 for a life with no record', () => {
    expect(effortStrain(adult())).toBe(0)
  })

  it('is the closing year\'s posture strain plus 1.5 for each week of overtime', () => {
    expect(POSTURE_STRAIN).toEqual({ lean: -4, steady: 0, push: 10 })
    expect(OVERTIME_STRAIN).toBe(1.5)
    const g = adult()
    store(g, { effective: 'push' })
    expect(effortStrain(g)).toBe(10)
    store(g, { effective: 'lean' })
    expect(effortStrain(g)).toBe(-4)
    store(g, { effective: 'push', over: 4 })
    expect(effortStrain(g)).toBe(16)
    store(g, { effective: 'steady', over: 2 })
    expect(effortStrain(g)).toBe(3)
  })

  it('reads the posture in force, not the choice that waits for the next age-up', () => {
    const g = adult()
    store(g, { posture: 'push', effective: 'steady' })
    expect(effortStrain(g)).toBe(0)
  })

  it('ignores a posture under 18, and still counts overtime', () => {
    const kid = makeTestGame(7, { age: 15 })
    store(kid, { effective: 'push', over: 2 })
    expect(effortStrain(kid)).toBe(3)
  })

  it('ignores another life\'s record and a hostile one', () => {
    const g = adult()
    store(g, { owner: '0:old', effective: 'push', over: 30 })
    expect(effortStrain(g)).toBe(0)
    store(g, { effective: 'push', over: 1e9 })
    expect(effortStrain(g)).toBe(10 + OVERTIME_STRAIN * 60)
    store(g, { effective: 'push', over: NaN })
    expect(effortStrain(g)).toBe(10)
  })
})

describe('fatigue', () => {
  const household = (g: GameState, raw: unknown): void => {
    g.flags.household = raw as Json
  }

  it('equals householdView(g).fatigue in every case the household record can be in', () => {
    const cases: ((g: GameState) => void)[] = [
      () => undefined,
      (g) => household(g, { owner: ownerOf(g), fatigue: 40.5 }),
      (g) => household(g, { owner: ownerOf(g), fatigue: 0 }),
      (g) => household(g, { owner: ownerOf(g), fatigue: 100 }),
      (g) => household(g, { owner: ownerOf(g), fatigue: 500 }),
      (g) => household(g, { owner: ownerOf(g), fatigue: -20 }),
      (g) => household(g, { owner: ownerOf(g), fatigue: NaN }),
      (g) => household(g, { owner: ownerOf(g), fatigue: 'tired' }),
      (g) => household(g, { owner: ownerOf(g) }),
      (g) => household(g, { owner: '0:somebody', fatigue: 70 }),
      (g) => household(g, { fatigue: 70 }),
      (g) => household(g, 'tired'),
      (g) => household(g, [70]),
      (g) => household(g, null),
      (g) => household(g, 70),
    ]
    for (const [i, set] of cases.entries()) {
      const g = adult()
      set(g)
      expect(fatigueOf(g), `case ${i}`).toBe(householdView(g).fatigue)
    }
  })

  it('follows a real yearly settle of the household', () => {
    const g = adult()
    g.character.job = null
    household(g, { owner: ownerOf(g), priority: 'ambition', fatigue: 20, training: 0, lastYear: 2020, effective: 'balanced', spent: 0 })
    expect(fatigueOf(g)).toBe(20)
    ageUp(g)
    expect(fatigueOf(g)).toBe(householdView(g).fatigue)
  })

  it('is a read: it creates no household key and draws nothing', () => {
    const g = adult()
    const before = JSON.stringify(g.flags)
    expect(fatigueOf(g)).toBe(0)
    expect(JSON.stringify(g.flags)).toBe(before)
    deepFreeze(g)
    expect(() => fatigueOf(g)).not.toThrow()
    expect(() => fatigueOf(noRng(adult()))).not.toThrow()
  })

  it('burns out at 85 and not before', () => {
    expect(BURNOUT_F).toBe(85)
    const g = adult()
    household(g, { owner: ownerOf(g), fatigue: 84.9 })
    expect(burnedOut(g)).toBe(false)
    household(g, { owner: ownerOf(g), fatigue: 85 })
    expect(burnedOut(g)).toBe(true)
    household(g, { owner: ownerOf(g), fatigue: 100 })
    expect(burnedOut(g)).toBe(true)
    household(g, { owner: '0:somebody', fatigue: 100 })
    expect(burnedOut(g)).toBe(false)
    household(g, undefined)
    expect(burnedOut(g)).toBe(false)
  })
})

describe('recordWin', () => {
  it('adds WIN_SHIFT to the shift and ambition follows', () => {
    const g = adult()
    const before = ambitionOf(g)
    expect(recordWin(g)).toBe(WIN_SHIFT)
    expect(readYou(g).shift).toBe(WIN_SHIFT)
    expect(ambitionOf(g) - before).toBeCloseTo(WIN_SHIFT, 9)
  })

  it('stops at SHIFT_MAX and reports what it actually added', () => {
    const g = adult()
    store(g, { shift: SHIFT_MAX - 0.1 })
    expect(recordWin(g)).toBeCloseTo(0.1, 9)
    expect(readYou(g).shift).toBe(SHIFT_MAX)
    expect(recordWin(g)).toBe(0)
    expect(readYou(g).shift).toBe(SHIFT_MAX)
  })

  it('never goes past SHIFT_MAX over a thousand wins, and its sums stay clean to two decimals', () => {
    const g = adult()
    for (let i = 0; i < 1000; i++) recordWin(g)
    expect(readYou(g).shift).toBe(SHIFT_MAX)
    const h = adult()
    for (let i = 0; i < 3; i++) recordWin(h)
    expect(readYou(h).shift).toBe(1.2)
  })

  it('lifts a burnout\'s drop, so a win and a burnout can cancel', () => {
    const g = adult()
    recordBurnout(g)
    expect(readYou(g).shift).toBe(BURNOUT_SHIFT)
    for (let i = 0; i < 3; i++) recordWin(g)
    expect(readYou(g).shift).toBe(0.2)
  })

  it('draws nothing', () => {
    expect(() => recordWin(noRng(adult()))).not.toThrow()
  })
})

describe('recordBurnout', () => {
  it('drops the shift by one, counts the burnout, stamps the year and leaves the year lean', () => {
    const g = adult()
    store(g, { posture: 'push', effective: 'push' })
    const r = recordBurnout(g)
    expect(r).toEqual({ recorded: true, notice: true })
    const y = readYou(g)
    expect(y.shift).toBe(BURNOUT_SHIFT)
    expect(y.burnouts).toBe(1)
    expect(y.burnAt).toBe(g.year)
    expect(y.effective).toBe('lean')
    expect(y.posture).toBe('push')
  })

  it('does nothing the second time in one year', () => {
    const g = adult()
    expect(recordBurnout(g).recorded).toBe(true)
    const once = JSON.stringify(g.flags[YOU_KEY])
    expect(recordBurnout(g)).toEqual({ recorded: false, notice: false })
    expect(JSON.stringify(g.flags[YOU_KEY])).toBe(once)
  })

  it('asks for a notice at most every 3 years', () => {
    const g = adult()
    g.year = 2030
    expect(recordBurnout(g).notice).toBe(true)
    g.year = 2031
    expect(recordBurnout(g)).toEqual({ recorded: true, notice: false })
    g.year = 2032
    expect(recordBurnout(g)).toEqual({ recorded: true, notice: false })
    g.year = 2035
    expect(recordBurnout(g)).toEqual({ recorded: true, notice: true })
    expect(readYou(g).burnouts).toBe(4)
  })

  it('never takes the shift below minus SHIFT_MAX or the count past its cap', () => {
    const g = adult()
    for (let i = 0; i < 40; i++) {
      g.year = 2030 + i
      recordBurnout(g)
    }
    const y = readYou(g)
    expect(y.shift).toBe(-SHIFT_MAX)
    expect(y.burnouts).toBe(40)
    store(g, { burnouts: 998, burnAt: 2000 })
    g.year = 2100
    recordBurnout(g)
    recordBurnout(g)
    g.year = 2101
    recordBurnout(g)
    expect(readYou(g).burnouts).toBeLessThanOrEqual(999)
  })

  it('draws nothing', () => {
    expect(() => recordBurnout(noRng(adult()))).not.toThrow()
  })
})

describe('staff drive', () => {
  it('has an entry for every staff trait and none for a trait that does not exist', () => {
    expect(STAFF_TRAITS.length).toBe(13)
    expect(Object.keys(STAFF_DRIVE).sort()).toEqual(STAFF_TRAITS.map((t) => t.id).sort())
    for (const t of STAFF_TRAITS) expect(staffDrive(t.id), t.id).toBe(STAFF_DRIVE[t.id])
  })

  it('runs from workaholic (85) down to lazy (15), with the steady staffer at 50', () => {
    expect(staffDrive('workaholic')).toBe(85)
    expect(staffDrive('visionary')).toBe(80)
    expect(staffDrive('perfectionist')).toBe(70)
    expect(staffDrive('steady')).toBe(50)
    expect(staffDrive('lazy')).toBe(15)
    const all = STAFF_TRAITS.map((t) => staffDrive(t.id))
    expect(Math.max(...all)).toBe(85)
    expect(Math.min(...all)).toBe(15)
    expect(staffDrive('workaholic')).toBeGreaterThan(staffDrive('visionary'))
    expect(staffDrive('visionary')).toBeGreaterThan(staffDrive('perfectionist'))
    expect(staffDrive('perfectionist')).toBeGreaterThan(staffDrive('steady'))
    expect(staffDrive('steady')).toBeGreaterThan(staffDrive('lazy'))
  })

  it('keeps every drive in 0..100 and the table frozen', () => {
    for (const v of Object.values(STAFF_DRIVE)) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(Object.isFrozen(STAFF_DRIVE)).toBe(true)
  })

  it('reads an unknown or hostile trait as 50', () => {
    for (const bad of ['nope', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 42, null, undefined, {}, []]) {
      expect(staffDrive(bad as unknown as string), String(bad)).toBe(50)
    }
  })
})

describe('youInput', () => {
  it('reads a plain life as ambition 46, steady, no fatigue and no know-how', () => {
    const input = youInput(adult(), 'rd.beverage')
    expect(input.ambition).toBeCloseTo(46, 9)
    expect({ posture: input.posture, fatigue: input.fatigue, knowledge: input.knowledge }).toEqual({ posture: 'steady', fatigue: 0, knowledge: 0 })
    expect(Object.keys(input).sort()).toEqual(['ambition', 'fatigue', 'knowledge', 'posture'])
  })

  it('carries the posture in force, the household\'s fatigue and the field\'s know-how', () => {
    const g = adult()
    store(g, { posture: 'lean', effective: 'push', fieldK: { 'rd.beverage': 33.5, 'rd.pharma': 10 }, shift: 4 })
    g.flags.household = { owner: ownerOf(g), fatigue: 62 }
    const input = youInput(g, 'rd.beverage')
    expect(input.posture).toBe('push')
    expect(input.fatigue).toBe(62)
    expect(input.knowledge).toBe(33.5)
    expect(input.ambition).toBeCloseTo(50, 9)
    expect(youInput(g, 'rd.pharma').knowledge).toBe(10)
  })

  it('reads a field the record does not hold as 0, however the name is spelled', () => {
    const g = adult()
    store(g, { fieldK: { 'rd.beverage': 33.5, constructor: 12 } })
    for (const f of ['rd.unknown', '', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) expect(youInput(g, f).knowledge, f).toBe(0)
    expect(youInput(g, 'constructor').knowledge).toBe(12)
  })

  it('shows steady under 18', () => {
    const g = makeTestGame(7, { age: 16 })
    store(g, { effective: 'push' })
    expect(youInput(g, 'rd.beverage').posture).toBe('steady')
  })

  it('is a pure read: frozen life, no draw, no write', () => {
    const g = adult()
    store(g, { shift: 1, fieldK: { 'rd.beverage': 20 } })
    const before = JSON.stringify(g)
    deepFreeze(g)
    expect(() => youInput(g, 'rd.beverage')).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
    const h = adult()
    store(h, { shift: 1, fieldK: { 'rd.beverage': 20 } })
    expect(() => youInput(noRng(h), 'rd.beverage')).not.toThrow()
  })
})

describe('an untouched life', () => {
  it('never gets the key over 40 age-ups, whatever reads happen in between', () => {
    const g = makeTestGame(7, { age: 18, money: 50_000 })
    let years = 0
    for (let i = 0; i < 40 && g.character.alive; i++) {
      g.queue = []
      ageUp(g)
      years++
      readYou(g)
      ambitionOf(g)
      ambitionReveal(g)
      postureOf(g)
      effortStrain(g)
      fatigueOf(g)
      burnedOut(g)
      youInput(g, 'rd.beverage')
      expect(YOU_KEY in g.flags, `age ${g.character.age}`).toBe(false)
    }
    expect(years).toBeGreaterThanOrEqual(10)
    expect(JSON.stringify(g.flags)).not.toContain('effort.you')
  })

  it('stays out of the save when a menu or the Profile only looks', () => {
    const g = adult()
    const before = JSON.stringify(g)
    for (let age = 10; age <= 40; age += 5) {
      g.character.age = age
      ambitionReveal(g)
      postureOf(g)
    }
    g.character.age = 30
    expect(JSON.stringify(g)).toBe(before)
  })
})
