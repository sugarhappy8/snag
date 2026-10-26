// ci: fast
// R4-U2 (People UI and fog track, H.7): the Knowledge half of the person profile. A person can be read (a band and a chip, sharper with
// the time you spent with them), sharpened by time (exposure) and bought (a private investigator, through Look closer). No screen
// uses it yet: U3 to U5 call these helpers.
//
//   the rows      eight rule rows (ppl.looks, health, happiness, smarts, cash, skill, worth and stf.skill); ppl.* stays .45 / .20
//   exposure      a pure number from yearsKnown, relationship and livesWithPlayer, 0 to 1, total, monotone in each input
//   the owner     people-fog.ts registers the `ppl` key kind: a label, the truth of a person by personKey, a tier 1 scope in the
//                 person's country and `gone` (true when no person has that key)
//   forgetting    knowledge/module.ts forgets the stored rows of a subject that has left, 12 a yearly step, and twice is once
//   the guard     test/knowledge-unwired.test.ts holds `exp:` to two files (people-fog.ts and business/leader-fog.ts)
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog; the flag is always named with withFlags.
import { describe, expect, it } from 'vitest'
import { withFlags } from '../src/game/flags'
import { checkLedger } from '../src/game/kernel/ledger'
import { personKey } from '../src/game/kernel/person-ref'
import { buyIntel, know, learn, lookCloser, offersFor, readKnow, storedEstimates } from '../src/game/knowledge/contract'
import { RULES, parseKey, ruleOf } from '../src/game/knowledge/keys'
import { kindOf, labelOfKey, overrideKeyKind, registerKeyKind } from '../src/game/knowledge/kinds'
import { FORGET_ROWS, yearlyKnowledge } from '../src/game/knowledge/module'
import { saveNpcLife, type NpcLife } from '../src/game/npc-state'
import { PEOPLE_CAPS, exposureOf, isClose, lookKeysOf, peopleFog, pplKey, readPerson, traitsShown, usesProfile } from '../src/game/people-fog'
import type { GameState, Person } from '../src/game/types'
import { makeTestGame } from './helpers'
import { coverage, deepFreeze, fogGame, inFog, nextYear, unitAt } from './knowledge-kit'
import { flowTotal } from './ledger-kit'

const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the profile exists. */
const profile = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))

/** A person with every field given, so nothing is drawn. */
function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    firstName: 'Dana',
    lastName: 'Reed',
    gender: 'female',
    age: 31,
    alive: true,
    relation: 'friend',
    relationship: 50,
    stats: { happiness: 60, health: 70, smarts: 55, looks: 65 },
    money: 40_000,
    occupation: 'Nurse',
    traits: ['kind', 'proud', 'calm'],
    yearsKnown: 3,
    livesWithPlayer: false,
    notes: [],
    data: { countryId: 'us' },
    ...over,
  }
}

const LIFE: NpcLife = {
  v: 1, lastYear: 2025, country: 'us', field: 'Engineering', education: 2, study: 0, skill: 62, experience: 8, income: 90_000, debt: 0,
  investments: 0, housing: 0, ambition: 70, employer: '', history: [], achievements: [], housingQuality: 50,
}

function lifeWith(people: Person[], money = 5_000_000): GameState {
  const g = makeTestGame(1, { age: 40, money })
  g.people.push(...people)
  return g
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The eight rule rows

describe('the eight rule rows (X44)', () => {
  const ROWS: Array<[string, 'score' | 'money', number, number, string[]]> = [
    ['ppl.looks', 'score', 0.12, 0.02, []],
    ['ppl.health', 'score', 0.22, 0.15, []],
    ['ppl.happiness', 'score', 0.28, 0.3, []],
    ['ppl.smarts', 'score', 0.32, 0.03, []],
    ['ppl.cash', 'money', 0.5, 0.25, []],
    ['ppl.skill', 'score', 0.3, 0.08, []],
    ['ppl.worth', 'money', 0.55, 0.2, []],
    ['stf.skill', 'score', 0.2, 0.05, ['Business']],
  ]

  it('holds each row with its unit, sd0, drift and talents, and leaves ppl.* at .45 / .20', () => {
    for (const [name, unit, sd0, drift, talents] of ROWS) {
      const r = RULES[name]
      expect(r, name).toBeDefined()
      expect(r!.unit, name).toBe(unit)
      expect(r!.sd0, name).toBe(sd0)
      expect(r!.drift, name).toBe(drift)
      expect([...r!.talents], name).toEqual(talents)
    }
    expect(RULES['ppl.*']).toMatchObject({ unit: 'score', sd0: 0.45, drift: 0.2 })
  })

  it('finds the row of a key by kind.field, and the ppl.* row for any other field', () => {
    for (const field of ['looks', 'health', 'happiness', 'smarts', 'cash', 'skill', 'worth']) {
      expect(ruleOf(`ppl:p1:${field}`), field).toBe(RULES[`ppl.${field}`])
    }
    expect(ruleOf('ppl:p1:ambition')).toBe(RULES['ppl.*'])
    expect(ruleOf('ppl:p1:kindness')).toBe(RULES['ppl.*'])
    expect(ruleOf('stf:a1:s7:skill')).toBe(RULES['stf.skill'])
    expect(ruleOf('stf:a1:s7:trait')).toBeNull()
  })

  it('keeps the bands the plan prints: a face is tight, a private number is wide', () => {
    const sd = (key: string, exp: number): number => inFog(() => know(fogGame(1), key, key.endsWith('cash') || key.endsWith('worth') ? 1e5 : 50, { exp }).sd)
    expect(sd('ppl:p1:looks', 0)).toBeCloseTo(0.12, 9)
    expect(sd('ppl:p1:looks', 1)).toBeCloseTo(0.12 * 0.6, 9)
    expect(sd('ppl:p1:smarts', 0)).toBeCloseTo(0.32, 9)
    expect(sd('ppl:p1:smarts', 1)).toBeCloseTo(0.192, 9)
    expect(sd('ppl:p1:cash', 0)).toBeCloseTo(0.5, 9)
    expect(sd('ppl:p1:worth', 1)).toBeCloseTo(0.33, 9)
    expect(sd('stf:a1:s7:skill', 0)).toBeCloseTo(0.2, 9)
    expect(sd('ppl:p1:looks', 0)).toBeLessThan(sd('ppl:p1:health', 0))
    expect(sd('ppl:p1:health', 0)).toBeLessThan(sd('ppl:p1:smarts', 0))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// exposure, close, the gate

describe('exposureOf', () => {
  const at = (yearsKnown: number, relationship: number, livesWithPlayer = false): number => exposureOf({ yearsKnown, relationship, livesWithPlayer })

  it('is min(1, 0.1 + 0.6 lives + 0.4 min(1, years / 8) + 0.3 relationship / 100)', () => {
    expect(at(0, 0)).toBeCloseTo(0.1, 12)
    expect(at(4, 50)).toBeCloseTo(0.1 + 0.2 + 0.15, 12)
    expect(at(0, 0, true)).toBeCloseTo(0.7, 12)
    expect(at(8, 100)).toBeCloseTo(0.8, 12)
    expect(at(8, 100, true)).toBe(1)
    expect(at(2, 20)).toBeCloseTo(0.1 + 0.1 + 0.06, 12)
  })

  it('is monotone in each input and stays in 0..1', () => {
    for (const lives of [false, true]) {
      let prevYears = -1
      for (let y = 0; y <= 20; y++) {
        const v = at(y, 40, lives)
        expect(v).toBeGreaterThanOrEqual(prevYears)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        prevYears = v
      }
      let prevRel = -1
      for (let r = 0; r <= 100; r += 5) {
        const v = at(3, r, lives)
        expect(v).toBeGreaterThanOrEqual(prevRel)
        prevRel = v
      }
    }
    for (const [y, r] of [[0, 0], [3, 30], [8, 90], [20, 100]] as const) expect(at(y, r, true)).toBeGreaterThanOrEqual(at(y, r, false))
  })

  it('is total: a bad input counts as 0 for its term, and a huge one cannot pass 1', () => {
    const floor = at(0, 0)
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number, 'x' as unknown as number]) {
      expect(at(bad, 0), String(bad)).toBe(floor)
      expect(at(0, bad), String(bad)).toBe(floor)
      expect(at(bad, bad), String(bad)).toBe(floor)
    }
    expect(at(-5, -50)).toBe(floor)
    expect(at(1e300, 1e300)).toBeCloseTo(0.8, 12)
    expect(at(1e300, 1e300, true)).toBe(1)
    expect(at(1e300, 0)).toBeCloseTo(0.5, 12)
    expect(at(0, 1e300)).toBeCloseTo(0.4, 12)
    expect(exposureOf({ livesWithPlayer: true } as never)).toBeCloseTo(0.7, 12)
    expect(exposureOf({} as never)).toBe(floor)
  })

  it('reads the same twice and touches nothing', () => {
    const p = deepFreeze(person({ yearsKnown: 5, relationship: 70 }))
    expect(exposureOf(p)).toBe(exposureOf(p))
  })
})

describe('isClose', () => {
  it('is relationship 35 or more, or living with you', () => {
    expect(isClose({ relationship: 34, livesWithPlayer: false })).toBe(false)
    expect(isClose({ relationship: 35, livesWithPlayer: false })).toBe(true)
    expect(isClose({ relationship: 0, livesWithPlayer: true })).toBe(true)
    expect(isClose({ relationship: NaN, livesWithPlayer: false })).toBe(false)
  })
})

describe('peopleFog and usesProfile', () => {
  it('peopleFog needs the flag and Realistic', () => {
    expect(withFlags(ON, () => peopleFog())).toBe(false) // the suite runs in Exact
    expect(withFlags(OFF, () => inFog(() => peopleFog()))).toBe(false)
    expect(withFlags(ON, () => inFog(() => peopleFog()))).toBe(true)
  })

  it('usesProfile is false in Exact, with the flag off, for a pet and for the dead', () => {
    const friend = person()
    expect(withFlags(ON, () => usesProfile(friend))).toBe(false)
    expect(withFlags(OFF, () => inFog(() => usesProfile(friend)))).toBe(false)
    expect(profile(() => usesProfile(friend))).toBe(true)
    expect(profile(() => usesProfile(person({ relation: 'pet' })))).toBe(false)
    expect(profile(() => usesProfile(person({ alive: false })))).toBe(false)
    for (const relation of ['parent', 'sibling', 'child', 'spouse', 'partner', 'coworker', 'boss', 'ex', 'enemy'] as const) {
      expect(profile(() => usesProfile(person({ relation }))), relation).toBe(true)
    }
  })
})

describe('traitsShown', () => {
  /** A person whose exposure is exactly `target` (years known make up what the relationship does not). */
  const traits = ['kind', 'proud', 'calm', 'funny']
  const withExposure = (yearsKnown: number, relationship = 0, livesWithPlayer = false): Person => person({ traits, yearsKnown, relationship, livesWithPlayer })

  it('names the first word at .30 and the second at .60, in array order', () => {
    expect(traitsShown(withExposure(0))).toEqual({ shown: [], hidden: 4 }) // .10
    expect(traitsShown(withExposure(3))).toEqual({ shown: [], hidden: 4 }) // .25
    expect(traitsShown(withExposure(4))).toEqual({ shown: ['kind'], hidden: 3 }) // .30
    expect(traitsShown(withExposure(6))).toEqual({ shown: ['kind'], hidden: 3 }) // .40
    expect(traitsShown(withExposure(8, 25))).toEqual({ shown: ['kind'], hidden: 3 }) // .575
    expect(traitsShown(withExposure(8, 33))).toEqual({ shown: ['kind'], hidden: 3 }) // .599
    expect(traitsShown(withExposure(8, 34))).toEqual({ shown: ['kind', 'proud'], hidden: 2 }) // .602
    expect(traitsShown(withExposure(0, 0, true))).toEqual({ shown: ['kind', 'proud'], hidden: 2 }) // .70
    expect(traitsShown(withExposure(8, 100, true))).toEqual({ shown: ['kind', 'proud'], hidden: 2 }) // never a third
  })

  it('is monotone: more exposure never hides a word', () => {
    let last = 0
    for (let y = 0; y <= 12; y++) {
      const n = traitsShown(withExposure(y, 20)).shown.length
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })

  it('is total: no traits, 500 traits, bad entries, a very long word', () => {
    expect(traitsShown(person({ traits: [] }))).toEqual({ shown: [], hidden: 0 })
    expect(traitsShown(person({ traits: undefined as never }))).toEqual({ shown: [], hidden: 0 })
    const many = Array.from({ length: 500 }, (_, i) => `t${i}`)
    const out = traitsShown(person({ traits: many, livesWithPlayer: true }))
    expect(out.shown).toEqual(['t0', 't1'])
    expect(out.hidden).toBe(498)
    const messy = traitsShown(person({ traits: [7, null, '', 'ok', { x: 1 }, 'fine'] as never, livesWithPlayer: true }))
    expect(messy.shown).toEqual(['ok', 'fine'])
    expect(messy.hidden).toBe(0)
    const long = traitsShown(person({ traits: ['x'.repeat(5000)], livesWithPlayer: true }))
    expect(long.shown[0]!.length).toBeLessThanOrEqual(40)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The key

describe('pplKey', () => {
  it('is ppl:<personKey>:<field>', () => {
    expect(pplKey(person({ id: 'p12' }), 'smarts')).toBe('ppl:p12:smarts')
    const withSid = person({ id: 'p9', data: { sid: 'cls.us.2004.12' } })
    expect(personKey(withSid)).toBe('cls.us.2004.12')
    expect(pplKey(withSid, 'cash')).toBe('ppl:cls.us.2004.12:cash')
    // a bad sid is not a key: the id is
    expect(pplKey(person({ id: 'p9', data: { sid: 'not a sid' } }), 'cash')).toBe('ppl:p9:cash')
  })

  it('is null when the contract refuses the key, so such a person reads unknown and never exact', () => {
    expect(pplKey(person({ id: 'p 1' }), 'smarts')).toBeNull()
    expect(pplKey(person({ id: 'p'.repeat(60) }), 'smarts')).toBeNull()
    expect(pplKey(person({ id: 'p1' }), 'bad field')).toBeNull()
    expect(pplKey(person({ id: 'p1' }), '')).toBeNull()
    expect(pplKey(person({ id: 'a:b:c' }), 'smarts')).toBeNull()
    expect(pplKey(person({ id: undefined as never }), 'smarts')).toBeNull()
    expect(pplKey(person({ id: 'A'.repeat(40) }), 'happiness')).not.toBeNull()
    expect(pplKey(person({ id: 'A'.repeat(41) }), 'happiness')).toBeNull()
  })

  it('every key it makes parses as a ppl key of 64 characters at most', () => {
    for (const id of ['p1', 's-42', 'cls.us.2004.12', 'x'.repeat(40), 'a:b']) {
      for (const field of ['looks', 'happiness', 'worth', 'x'.repeat(40)]) {
        const key = pplKey(person({ id }), field)
        if (key === null) continue
        expect(key.length).toBeLessThanOrEqual(64)
        expect(parseKey(key)?.kind).toBe('ppl')
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// readPerson

describe('readPerson', () => {
  it('is the know() read with the exposure of the person', () => {
    const p = person({ yearsKnown: 4, relationship: 60 })
    const g = fogGame(7)
    const e = profile(() => readPerson(g, p, 'smarts', 55))!
    expect(e.exact).toBe(false)
    expect(e.sd).toBeCloseTo(0.32 * (1 - 0.4 * exposureOf(p)), 9)
    expect(e).toEqual(inFog(() => know(g, 'ppl:p1:smarts', 55, { exp: exposureOf(p) })))
  })

  it('sharpens with time together and with a closer bond', () => {
    const g = fogGame(8)
    const stranger = person({ yearsKnown: 0, relationship: 10 })
    const mother = person({ yearsKnown: 30, relationship: 90, livesWithPlayer: true })
    const a = profile(() => readPerson(g, stranger, 'happiness', 60))!
    const b = profile(() => readPerson(g, mother, 'happiness', 60))!
    expect(b.sd).toBeLessThan(a.sd)
    expect(b.sd).toBeCloseTo(0.28 * 0.6, 9)
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo)
  })

  it('is the same twice in a year, another number another year, another life another number', () => {
    const p = person()
    const g = fogGame(9, { year: 2030 })
    const first = profile(() => readPerson(g, p, 'smarts', 55))
    expect(profile(() => readPerson(g, p, 'smarts', 55))).toEqual(first)
    expect(profile(() => readPerson(fogGame(9, { year: 2031 }), p, 'smarts', 55))!.mid).not.toBe(first!.mid)
    expect(profile(() => readPerson(fogGame(10, { year: 2030 }), p, 'smarts', 55))!.mid).not.toBe(first!.mid)
    expect(profile(() => readPerson(g, p, 'health', 55))!.mid).not.toBe(first!.mid)
  })

  it('is null for a key the contract refuses, and never the truth', () => {
    const g = fogGame(11)
    expect(profile(() => readPerson(g, person({ id: 'p 1' }), 'smarts', 55))).toBeNull()
    expect(profile(() => readPerson(g, person({ id: 'p'.repeat(60) }), 'cash', 5e4))).toBeNull()
    expect(profile(() => readPerson(g, person(), 'smarts', NaN))).toBeNull()
    expect(profile(() => readPerson(g, person(), 'smarts', Infinity))).toBeNull()
    expect(profile(() => readPerson(g, person(), 'smarts', 'x' as never))).toBeNull()
  })

  it('reads a money truth of 0 or less as a band around nothing, never as an exact 0', () => {
    const g = fogGame(12)
    for (const money of [0, -5, -1e9]) {
      for (const field of ['cash', 'worth']) {
        const e = profile(() => readPerson(g, person({ money }), field, money))!
        expect(e, `${field} ${money}`).not.toBeNull()
        expect(e.exact, `${field} ${money}`).toBe(false)
        expect(e.hi, `${field} ${money}`).toBeGreaterThan(e.lo)
        expect(e.hi, `${field} ${money}`).toBeLessThan(100)
      }
    }
  })

  it('survives a hostile person: NaN stats, 500 traits, a data stat of 1e300, a huge purse', () => {
    const g = fogGame(13)
    const hostile = person({
      stats: { happiness: NaN, health: Infinity, smarts: -1e300, looks: 1e300 },
      traits: Array.from({ length: 500 }, (_, i) => `t${i}`),
      money: 1e300,
      data: { countryId: 'us', kindness: 1e300, loyalty: NaN },
    })
    for (const [field, truth] of [
      ['happiness', hostile.stats.happiness],
      ['health', hostile.stats.health],
      ['smarts', hostile.stats.smarts],
      ['looks', hostile.stats.looks],
      ['cash', hostile.money],
      ['worth', hostile.money],
      ['kindness', hostile.data.kindness as number],
      ['loyalty', hostile.data.loyalty as number],
    ] as const) {
      const e = profile(() => readPerson(g, hostile, field, truth))
      if (e === null) continue
      expect(e.exact, field).toBe(false)
      expect(Number.isFinite(e.mid) && Number.isFinite(e.lo) && Number.isFinite(e.hi), field).toBe(true)
      expect(e.words.length, field).toBeLessThanOrEqual(40)
    }
    expect(profile(() => readPerson(g, hostile, 'happiness', NaN))).toBeNull()
    expect(profile(() => readPerson(g, hostile, 'cash', 1e300))!.exact).toBe(false)
  })

  it('shows the truth in Exact, as every know() does (the screens call it only in Realistic)', () => {
    expect(withFlags(ON, () => readPerson(fogGame(14), person(), 'smarts', 55))!.exact).toBe(true)
  })

  it('is pure on a frozen life and person', () => {
    const g = lifeWith([person()])
    const before = JSON.stringify(g)
    const rng = g.rng
    const nextId = g.nextId
    const frozen = deepFreeze(JSON.parse(before) as GameState)
    const p = frozen.people[0]!
    const a = profile(() => [readPerson(frozen, p, 'smarts', 55), readPerson(frozen, p, 'cash', 4e4), lookKeysOf(frozen, p), traitsShown(p)])
    const b = profile(() => [readPerson(frozen, p, 'smarts', 55), readPerson(frozen, p, 'cash', 4e4), lookKeysOf(frozen, p), traitsShown(p)])
    expect(a).toEqual(b)
    expect(JSON.stringify(frozen)).toBe(before)
    expect(frozen.rng).toBe(rng)
    expect(frozen.nextId).toBe(nextId)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Honesty: 77% to 83% over 10,000 draws

describe('every row holds the truth about 80% of the time, at exposure 0 and at 1 (RF7)', () => {
  const N = 10_000
  const LOW = 0.77
  const HIGH = 0.83
  // Away from both ends of the 0..100 scale: the widest band (smarts, 41 points) is clipped there, and a clip only ever helps.
  const score = (tag: string) => (i: number): number => 42 + 16 * unitAt(tag, i)
  const money = (tag: string) => (i: number): number => 10 ** (3 + 5 * unitAt(tag, i))
  const KEYS: Array<[string, (i: number) => number]> = [
    ['ppl:p1:looks', score('looks')],
    ['ppl:p1:health', score('health')],
    ['ppl:p1:happiness', score('happiness')],
    ['ppl:p1:smarts', score('smarts')],
    ['ppl:p1:cash', money('cash')],
    ['ppl:p1:skill', score('skill')],
    ['ppl:p1:worth', money('worth')],
    ['stf:a1:s7:skill', score('stf')],
  ]
  for (const [key, truth] of KEYS) {
    for (const exp of [0, 1]) {
      it(`${key} at exposure ${exp}`, () => {
        const share = inFog(() =>
          coverage(N, (i) => {
            const t = truth(i)
            return { est: know(fogGame(i), key, t, { exp }), truth: t }
          }),
        )
        expect(share).toBeGreaterThan(LOW)
        expect(share).toBeLessThan(HIGH)
      })
    }
  }

  it('readPerson holds it for a stranger and for a mother', () => {
    for (const [name, p] of [['stranger', person({ yearsKnown: 0, relationship: 5 })], ['mother', person({ yearsKnown: 40, relationship: 100, livesWithPlayer: true })]] as const) {
      for (const [field, truth] of [['smarts', score('rp-smarts')], ['cash', money('rp-cash')]] as const) {
        const share = profile(() =>
          coverage(N, (i) => {
            const t = truth(i)
            return { est: readPerson(fogGame(i), p, field, t)!, truth: t }
          }),
        )
        expect(share, `${name} ${field}`).toBeGreaterThan(LOW)
        expect(share, `${name} ${field}`).toBeLessThan(HIGH)
      }
    }
  })

  it('the Business talent narrows a hired skill and the band still holds', () => {
    const wide = inFog(() => know(fogGame(1), 'stf:a1:s7:skill', 50))
    const sharp = inFog(() => know(fogGame(1, { talents: ['Business'] }), 'stf:a1:s7:skill', 50))
    expect(sharp.sd).toBeCloseTo(wide.sd * 0.6, 9)
    const share = inFog(() =>
      coverage(N, (i) => {
        const t = 42 + 16 * unitAt('stf-talent', i)
        return { est: know(fogGame(i, { talents: ['Business'] }), 'stf:a1:s7:skill', t), truth: t }
      }),
    )
    expect(share).toBeGreaterThan(LOW)
    expect(share).toBeLessThan(HIGH)
  })

  it('sd never goes below SD_MIN whatever the exposure or the talent', () => {
    for (const [key] of KEYS) {
      for (const exp of [0, 0.5, 1, 100, 1e300, NaN]) {
        const sd = inFog(() => know(fogGame(1, { talents: ['MainCharacter', 'Business'] }), key, 50 + (key.endsWith('cash') || key.endsWith('worth') ? 1e4 : 0), { exp }).sd)
        expect(sd, `${key} ${exp}`).toBeGreaterThanOrEqual(0.03)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// lookKeysOf, the owner and Look closer

describe('lookKeysOf', () => {
  it('is [] unless peopleFog(): in Exact, and in Realistic with the flag off', () => {
    const p = person()
    const g = lifeWith([p])
    expect(withFlags(ON, () => lookKeysOf(g, p))).toEqual([])
    expect(withFlags(OFF, () => lookKeysOf(g, p))).toEqual([])
    expect(withFlags(OFF, () => inFog(() => lookKeysOf(g, p)))).toEqual([])
    expect(inFog(() => lookKeysOf(g, p))).toEqual([]) // the default is off until the release flips it
  })

  it('is smarts, health, happiness, cash, then skill when the person has an NPC life', () => {
    const p = person()
    const g = lifeWith([p])
    expect(profile(() => lookKeysOf(g, p))).toEqual(['ppl:p1:smarts', 'ppl:p1:health', 'ppl:p1:happiness', 'ppl:p1:cash'])
    saveNpcLife(p, LIFE)
    const keys = profile(() => lookKeysOf(g, p))
    expect(keys).toEqual(['ppl:p1:smarts', 'ppl:p1:health', 'ppl:p1:happiness', 'ppl:p1:cash', 'ppl:p1:skill'])
    expect(keys.length).toBeLessThanOrEqual(PEOPLE_CAPS.lookKeys)
  })

  it('leaves out a key the contract refuses', () => {
    const p = person({ id: 'p 1' })
    expect(profile(() => lookKeysOf(lifeWith([p]), p))).toEqual([])
  })
})

describe('the ppl key kind', () => {
  const kind = (): NonNullable<ReturnType<typeof kindOf>> => kindOf('ppl')!

  it('is registered by people-fog.ts, once, with a label, a truth, a scope and gone', () => {
    const k = kind()
    expect(k).not.toBeNull()
    expect(k.kind).toBe('ppl')
    for (const hook of ['label', 'truth', 'scope', 'gone'] as const) expect(typeof k[hook], hook).toBe('function')
  })

  it('truth finds the person by personKey and reads the stat, the purse, the NPC skill or a data stat', () => {
    const p = person({ id: 'p1', money: 40_000, stats: { happiness: 61, health: 72, smarts: 53, looks: 64 }, data: { countryId: 'us', kindness: 44 } })
    saveNpcLife(p, LIFE)
    const sid = person({ id: 'p2', data: { sid: 's77', countryId: 'us' }, money: 7 })
    const g = lifeWith([p, sid])
    const truth = (key: string): number | null => kind().truth(g, key)
    expect(truth('ppl:p1:happiness')).toBe(61)
    expect(truth('ppl:p1:health')).toBe(72)
    expect(truth('ppl:p1:smarts')).toBe(53)
    expect(truth('ppl:p1:looks')).toBe(64)
    expect(truth('ppl:p1:cash')).toBe(40_000)
    expect(truth('ppl:p1:skill')).toBe(62)
    expect(truth('ppl:p1:kindness')).toBe(44)
    // the key is the sid when there is one, never the id
    expect(truth('ppl:s77:cash')).toBe(7)
    expect(truth('ppl:p2:cash')).toBeNull()
  })

  it('floors a purse at 1, so a broke person reads as a band and not an exact 0', () => {
    const g = lifeWith([person({ id: 'p1', money: 0 }), person({ id: 'p3', money: -9 })])
    expect(kind().truth(g, 'ppl:p1:cash')).toBe(1)
    expect(kind().truth(g, 'ppl:p3:cash')).toBe(1)
  })

  it('has no truth for net worth (a passive read only), a missing person, a missing life or a bad field', () => {
    const p = person({ id: 'p1', data: { countryId: 'us', life: 'junk', kindness: 'x', odd: 400, loyalty: NaN } })
    const g = lifeWith([p])
    const truth = (key: string): number | null => kind().truth(g, key)
    expect(truth('ppl:p1:worth')).toBeNull()
    expect(truth('ppl:p9:smarts')).toBeNull()
    expect(truth('ppl:p1:skill')).toBeNull()
    expect(truth('ppl:p1:kindness')).toBeNull()
    expect(truth('ppl:p1:odd')).toBeNull()
    expect(truth('ppl:p1:loyalty')).toBeNull()
    expect(truth('ppl:p1:__proto__')).toBeNull()
    expect(truth('ppl:p1:constructor')).toBeNull()
    expect(truth('not a key')).toBeNull()
    expect(truth('mkt:cafe:us:size')).toBeNull()
  })

  it('truth is total over a hostile life: 500 people, bad rows, NaN stats', () => {
    const many = Array.from({ length: 500 }, (_, i) => person({ id: `p${i}` }))
    many.push(null as never, 7 as never, { id: 'q', data: null } as never, person({ id: 'nan', stats: { happiness: NaN, health: NaN, smarts: NaN, looks: NaN } }))
    const g = lifeWith(many)
    expect(kind().truth(g, 'ppl:p499:smarts')).toBe(55)
    expect(kind().truth(g, 'ppl:nan:smarts')).toBeNull()
    expect(kind().truth(g, 'ppl:q:smarts')).toBeNull()
    expect(kind().gone!(g, 'ppl:p499:smarts')).toBe(false)
    const broken = lifeWith([])
    broken.people = undefined as never
    expect(kind().truth(broken, 'ppl:p1:smarts')).toBeNull()
    expect(kind().gone!(broken, 'ppl:p1:smarts')).toBe(false) // it cannot tell, so it forgets nothing
  })

  it('scope is tier 1 in the country of the person, else of the player', () => {
    const abroad = person({ id: 'p1', data: { countryId: 'fr' } })
    const home = person({ id: 'p2', data: {} })
    const g = lifeWith([abroad, home])
    expect(kind().scope!(g, 'ppl:p1:smarts')).toEqual({ tier: 1, country: 'fr' })
    expect(kind().scope!(g, 'ppl:p2:smarts')).toEqual({ tier: 1, country: g.character.countryId })
    expect(kind().scope!(g, 'ppl:p9:smarts')).toEqual({ tier: 1, country: g.character.countryId })
  })

  it('label names the person and the number, 60 characters at most, with no dash', () => {
    const g = lifeWith([person({ id: 'p1' }), person({ id: 'p2', firstName: 'X'.repeat(80) })])
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    for (const field of ['looks', 'health', 'happiness', 'smarts', 'cash', 'skill', 'worth', 'ambition', 'kindness']) {
      const text = labelOfKey(g, `ppl:p1:${field}`)
      expect(text, field).toContain('Dana')
      expect(text.length, field).toBeLessThanOrEqual(60)
      expect(text, field).not.toMatch(dashes)
      expect(text, field).not.toBe(`ppl:p1:${field}`)
    }
    expect(labelOfKey(g, 'ppl:p2:smarts').length).toBeLessThanOrEqual(60)
    expect(labelOfKey(g, 'ppl:p9:smarts')).not.toBe('ppl:p9:smarts') // someone who left still has words
  })

  it('registerKeyKind holds gone like the other hooks: a function or nothing, and part of the def', () => {
    const base = { kind: 'gonetest', label: () => 'x', truth: () => 1 }
    expect(() => registerKeyKind({ ...base, gone: 5 as never })).toThrow(/gone is not a function/)
    registerKeyKind({ ...base, gone: () => true })
    registerKeyKind({ ...base, gone: () => true }) // the same code again is the same def
    expect(() => registerKeyKind({ ...base, gone: () => false })).toThrow(/already registered/)
    expect(() => registerKeyKind(base)).toThrow(/already registered/)
  })

  it('gone is true when no person has the key, by personKey', () => {
    const dead = person({ id: 'p1', alive: false })
    const sid = person({ id: 'p2', data: { sid: 's77' } })
    const g = lifeWith([dead, sid])
    expect(kind().gone!(g, 'ppl:p1:smarts')).toBe(false) // the dead are still in the book
    expect(kind().gone!(g, 'ppl:s77:smarts')).toBe(false)
    expect(kind().gone!(g, 'ppl:p2:smarts')).toBe(true) // the key is the sid, not the id
    expect(kind().gone!(g, 'ppl:p9:smarts')).toBe(true)
    g.people = g.people.filter((p) => p.id !== 'p1')
    expect(kind().gone!(g, 'ppl:p1:smarts')).toBe(true)
    expect(kind().gone!(g, 'garbage')).toBe(true)
  })
})

describe('Look closer on a person', () => {
  const keysOf = (p: Person): string[] => ['smarts', 'health', 'happiness', 'cash'].map((f) => pplKey(p, f)!)

  it('offers the private investigator and no other source', () => {
    const p = person()
    const g = lifeWith([p])
    const offers = inFog(() => offersFor(g, keysOf(p)))
    expect(offers.map((o) => o.src)).toEqual(['investigator'])
    expect(offers[0]!.block).toBeNull()
    const group = inFog(() => lookCloser(g, { id: 'person', keys: keysOf(p) }))!
    expect(group.id).toBe('look.person')
    const kids = inFog(() => group.children(g))
    expect(kids.map((c) => c.id)).toEqual(['look.person.investigator'])
  })

  it('is no group in Exact, nothing to buy and nothing offered', () => {
    const p = person()
    const g = lifeWith([p])
    expect(lookCloser(g, { id: 'person', keys: keysOf(p) })).toBeNull()
    expect(offersFor(g, keysOf(p))).toEqual([])
  })

  it('charges the same fee for 100 times the cash, and follows the country of the person', () => {
    const p = person()
    const poor = lifeWith([p], 200_000)
    const rich = lifeWith([person()], 20_000_000)
    const feeOf = (g: GameState, q: Person): number => inFog(() => offersFor(g, keysOf(q)))[0]!.price
    expect(feeOf(poor, p)).toBe(feeOf(rich, rich.people[0]!))
    expect(feeOf(poor, p)).toBeGreaterThan(0)
    const far = person({ data: { countryId: 'ht' } })
    const g2 = lifeWith([far])
    expect(feeOf(g2, far)).not.toBe(feeOf(poor, p))
  })

  it('buys through the ledger once and stores rows that storedEstimates lists', () => {
    const p = person()
    const g = lifeWith([p])
    saveNpcLife(p, LIFE)
    const keys = [...keysOf(p), pplKey(p, 'skill')!]
    const before = g.character.money
    const fee = inFog(() => offersFor(g, keys))[0]!.price
    expect(inFog(() => buyIntel(g, 'investigator', keys))).toEqual({ ok: true })
    expect(before - g.character.money).toBe(fee)
    expect(flowTotal(g, 'intel', 'person')).toBe(-fee)
    expect(checkLedger(g).ok).toBe(true)
    const listed = storedEstimates(g).map((e) => e.key)
    expect(listed.sort()).toEqual([...keys].sort())
    // a second buy in the year is refused and books nothing
    const again = inFog(() => buyIntel(g, 'investigator', keys))
    expect(again.ok).toBe(false)
    expect(before - g.character.money).toBe(fee)
    // the bought read is sharper than the passive one and the screen reads it
    const e = profile(() => readPerson(g, p, 'smarts', 55))!
    expect(e.src).toBe('investigator')
    expect(e.sd).toBeLessThan(0.32 * (1 - 0.4 * exposureOf(p)))
  })

  it('cannot read net worth: there is nothing for sale', () => {
    const p = person()
    const g = lifeWith([p])
    const worth = [pplKey(p, 'worth')!]
    expect(inFog(() => offersFor(g, worth))).toEqual([])
    expect(inFog(() => buyIntel(g, 'investigator', worth)).ok).toBe(false)
    expect(readKnow(g)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Forgetting what left

describe('rows of someone who left are forgotten, 12 a step', () => {
  const people = (n: number): Person[] => Array.from({ length: n }, (_, i) => person({ id: `p${String(i).padStart(3, '0')}`, firstName: `N${i}` }))
  const rowKeys = (g: GameState): string[] => Object.keys(readKnow(g)?.k ?? {}).sort()
  const read = (g: GameState, ps: Person[]): void => {
    for (const p of ps) expect(learn(g, pplKey(p, 'smarts')!, { mid: 55, sd: 0.2, src: 'investigator' }), p.id).not.toBeNull()
  }

  it('the step is 12 rows, as the caps say', () => {
    expect(FORGET_ROWS).toBe(12)
    expect(PEOPLE_CAPS.forgetPerStep).toBe(FORGET_ROWS)
  })

  it('forgets the rows of people who left, 12 a step, and a second call in the year changes nothing', () => {
    const ps = people(30)
    const g = lifeWith(ps)
    read(g, ps)
    expect(rowKeys(g)).toHaveLength(30)
    g.people = []
    yearlyKnowledge(g)
    expect(rowKeys(g)).toHaveLength(18)
    const json = JSON.stringify(g)
    yearlyKnowledge(g)
    expect(JSON.stringify(g)).toBe(json)
    nextYear(g)
    yearlyKnowledge(g)
    expect(rowKeys(g)).toHaveLength(6)
    const json2 = JSON.stringify(g)
    yearlyKnowledge(g)
    expect(JSON.stringify(g)).toBe(json2)
    nextYear(g)
    yearlyKnowledge(g)
    expect(rowKeys(g)).toHaveLength(0)
    expect(g.flags.know).toBeUndefined() // an emptied record goes with it
  })

  it('keeps the rows of the people who are still there, and of the dead', () => {
    const ps = people(20)
    const g = lifeWith(ps)
    read(g, ps)
    g.people = ps.slice(0, 5)
    g.people[0]!.alive = false
    yearlyKnowledge(g)
    const left = rowKeys(g)
    expect(left).toHaveLength(20 - FORGET_ROWS)
    for (const p of g.people) expect(left).toContain(pplKey(p, 'smarts'))
    nextYear(g)
    yearlyKnowledge(g)
    expect(rowKeys(g)).toEqual(g.people.map((p) => pplKey(p, 'smarts')!).sort())
  })

  it('forgets nothing for a key kind with no gone, and a gone that throws reads as false', () => {
    overrideKeyKind({ kind: 'cand', label: () => 'x', truth: () => 50, scope: () => ({ tier: 1, country: 'us' }) })
    overrideKeyKind({ kind: 'riv', label: () => 'x', truth: () => 50, scope: () => ({ tier: 1, country: 'us' }), gone: () => { throw new Error('no') } })
    const g = lifeWith([])
    expect(learn(g, 'cand:k1:skill', { mid: 55, sd: 0.2, src: 'investigator' })).not.toBeNull()
    expect(learn(g, 'riv:r1:quality', { mid: 55, sd: 0.2, src: 'investigator' })).not.toBeNull()
    yearlyKnowledge(g)
    expect(rowKeys(g)).toEqual(['cand:k1:skill', 'riv:r1:quality'])
  })

  it('keeps the rows of a gone person in Exact and in Realistic alike: the step reads no mode', () => {
    const ps = people(3)
    const a = lifeWith(ps)
    const b = lifeWith(ps)
    read(a, ps)
    read(b, ps)
    a.people = []
    b.people = []
    yearlyKnowledge(a)
    inFog(() => yearlyKnowledge(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(rowKeys(a)).toHaveLength(0)
  })

  it('probe: 12,000 rows of people who left never grow the record past its cap, and clear 12 a step', () => {
    const g = lifeWith([])
    for (let i = 0; i < 12_000; i++) learn(g, `ppl:g${i}:smarts`, { mid: 55, sd: 0.2, src: 'investigator' })
    const full = rowKeys(g).length
    expect(full).toBeLessThanOrEqual(120)
    let steps = 0
    let last = full
    while (g.flags.know !== undefined && steps < 20) {
      yearlyKnowledge(g)
      const now = rowKeys(g).length
      expect(last - now).toBeLessThanOrEqual(FORGET_ROWS)
      last = now
      nextYear(g)
      steps++
    }
    expect(g.flags.know).toBeUndefined()
    expect(steps).toBe(Math.ceil(full / FORGET_ROWS))
  })
})

describe('the no-draw rule', () => {
  it('nothing here moves g.rng or g.nextId', () => {
    const p = person()
    const g = lifeWith([p])
    saveNpcLife(p, LIFE)
    const rng = g.rng
    const nextId = g.nextId
    profile(() => {
      for (const field of ['looks', 'health', 'happiness', 'smarts', 'cash', 'skill', 'worth']) readPerson(g, p, field, 50)
      lookKeysOf(g, p)
      traitsShown(p)
      usesProfile(p)
      exposureOf(p)
    })
    yearlyKnowledge(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    // a purchase writes one log line (and takes its uid), but draws nothing
    inFog(() => buyIntel(g, 'investigator', ['ppl:p1:smarts', 'ppl:p1:cash']))
    yearlyKnowledge(g)
    expect(g.rng).toBe(rng)
  })
})
