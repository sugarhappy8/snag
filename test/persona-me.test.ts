// ci: fast
// R4-S9 (D.2 b): the player's persona, flags['persona.me'] and src/game/world/persona-me.ts. Five axes for the player: ambition is
// `ambitionOf(g)` exactly (the effort record keeps its own key, X18), the other four are inferred from the hidden stats and the
// lifetime counters, and a small owner-stamped store holds at most four nudges within +-15 and 40 year stamps. Nothing in R4 reads
// the persona, so nothing a played life draws, books or saves can move through this file.
//
// What the tests hold is direction and bounds, never the constants of the table: more karma never lowers honesty, a count at
// 1e9 reads as the count at its cap, every axis stays in 0..100, 10,000 nudges stay inside +-NUDGE_MAX and happen once per
// (axis, reason, year). A save may hold anything, so the hostile records come early. No pinned seed: every life is makeTestGame's own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { GameState, Json } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { AXIS_IDS, VOICES, voiceOf, type AxisId } from '../src/game/world/axes'
import {
  AT_MAX, NUDGE_MAX, NUDGE_SLOTS, NUDGE_STEP, PERSONA_KEY, inferAxes, nudgePersona, personaOf, readPersona, writePersona,
} from '../src/game/world/persona-me'
import { frozenGame, trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'
import { ROOT, loadSources } from './scan-kit'
import { scanFlags } from './world-flags-kit'

const FILE = 'src/game/world/persona-me.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

type Mover = Exclude<AxisId, 'ambition'>
/** The four axes a nudge may move, written out here, independent of the module. */
const MOVERS: readonly Mover[] = ['honesty', 'empathy', 'risk', 'steadiness']

/** The same life every case starts from: 30 years old, no talent, karma 50, craziness 20, willpower 50, discipline 50 (the helper's own). */
const adult = (age = 30): GameState => makeTestGame(7, { age })

/** The owner string of a life, the one household.ts and effort/persona.ts stamp. */
const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

/** Stores a raw record under the key, stamped for this life unless the record says otherwise. */
function store(g: GameState, raw: Record<string, unknown>): void {
  g.flags[PERSONA_KEY] = { owner: ownerOf(g), ...raw } as unknown as Json
}

/** How many nodes a JSON value has (every object, array and leaf), the measure of the world budget. */
function nodes(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1
  return 1 + Object.values(v as object).reduce<number>((n, c) => n + nodes(c), 0)
}

const isWhole = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n)
const inRange = (n: unknown, lo: number, hi: number): boolean => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi

/** A life with the named hidden stats and counters set, everything else as `adult()` has it. */
function life(hidden: Record<string, number> = {}, counters: Record<string, unknown> = {}): GameState {
  const g = adult()
  Object.assign(g.character.hidden, hidden)
  Object.assign(g.counters, counters)
  return g
}

const GRID = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const COUNTS_BIG = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 1000, 1e9]
/** The lifetime counts that lower honesty and empathy, and the two that raise them (the plan's list). */
const LOWERS = ['crimes', 'thefts', 'cheated', 'murders', 'fights', 'insults', 'sabotage'] as const
const RAISES = ['donated', 'livesSaved'] as const
const ALL_COUNTS = [...LOWERS, ...RAISES, 'lotteryTickets'] as const

describe('the key and the file', () => {
  it('is persona.me and is personal, so an heir starts clean', () => {
    expect(PERSONA_KEY).toBe('persona.me')
    expect(classifyFlag(PERSONA_KEY)).toBe('personal')
  })

  it('exports the limits the ceiling row names: NUDGE_MAX 15, NUDGE_STEP 3, NUDGE_SLOTS 4, AT_MAX 40', () => {
    expect([NUDGE_MAX, NUDGE_STEP, NUDGE_SLOTS, AT_MAX]).toEqual([15, 3, 4, 40])
    expect(NUDGE_SLOTS).toBe(MOVERS.length)
    // S11's ceiling entry persona-nudge names this token in this file, and test/ceiling-list.test.ts fails without it.
    expect(readFileSync(join(ROOT, FILE), 'utf8')).toMatch(/export const NUDGE_MAX\b/)
  })

  it('belongs to layer 2, imports nothing above it, and has no draw, no booking and no dash', () => {
    expect(layerOf(FILE)).toBe(2)
    const text = readFileSync(join(ROOT, FILE), 'utf8')
    for (const up of ['household', 'people', 'life', 'aging', 'menus', 'business', 'events']) {
      expect(text, up).not.toMatch(new RegExp(`from '\\.\\./${up}[/']`))
    }
    for (const word of ['Math.random', 'moveCash', 'outcomeStream', 'streamKey', 'Date.now', 'new Date']) expect(text.includes(word), word).toBe(false)
    expect(/\.rng\b/.test(text)).toBe(false)
    expect(DASH.test(text)).toBe(false)
  })

  it('is read and written through a declared constant, so the flags scan resolves it and the dynamic-site ratchet does not grow', () => {
    const scan = scanFlags(loadSources(ROOT, 'src'))
    expect(scan.resolved.get(PERSONA_KEY)).toContain(FILE)
    expect(scan.literal.has(PERSONA_KEY)).toBe(false)
    expect(scan.dynamic[FILE]).toBeUndefined()
    expect(scan.whole[FILE]).toBeUndefined()
    expect(scan.ambiguous).toEqual({})
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
      readPersona(g)
      inferAxes(g)
      personaOf(g)
      voiceOf(personaOf(g))
      expect(PERSONA_KEY in g.flags, `age ${g.character.age}`).toBe(false)
    }
    expect(years).toBeGreaterThanOrEqual(10)
    expect(JSON.stringify(g.flags)).not.toContain('persona.me')
  })

  it('reads the defaults and writes nothing', () => {
    const g = adult()
    const before = JSON.stringify(g)
    expect(readPersona(g)).toEqual({ v: 1, owner: ownerOf(g), n: {}, at: {} })
    inferAxes(g)
    personaOf(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(PERSONA_KEY in g.flags).toBe(false)
  })

  it('hands out a fresh record each time, so a caller can edit it before it writes', () => {
    const g = adult()
    const a = readPersona(g)
    a.n.honesty = 9
    a.at['honesty.x'] = 2026
    expect(readPersona(g)).toEqual({ v: 1, owner: ownerOf(g), n: {}, at: {} })
  })
})

describe('hostile records', () => {
  const many = (n: number, f: (i: number) => unknown): Record<string, unknown> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, f(i)]))
  const proto = JSON.parse('{"n":{"__proto__":{"honesty":9},"constructor":{"honesty":9}},"at":{"__proto__":{"x":1},"constructor":2026}}') as Record<string, unknown>
  const HOSTILE: [string, unknown][] = [
    ['a string', 'persona'],
    ['a number', 7],
    ['NaN', Number.NaN],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['strings in n', { n: { honesty: 'high', empathy: '9', risk: Number.NaN, steadiness: {} } }],
    ['1e9 in n', { n: { honesty: 1e9, empathy: -1e9, risk: Number.POSITIVE_INFINITY, steadiness: Number.NEGATIVE_INFINITY } }],
    ['fractions in n', { n: { honesty: 2.6, empathy: -3.4 } }],
    ['n as a list', { n: [3, 3, 3, 3, 3] }],
    ['500 keys in n', { n: many(500, () => 3) }],
    ['500 keys in at', { at: many(500, (i) => 2000 + i) }],
    ['500 valid-looking stamps', { at: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`honesty.r${i}`, 2000 + (i % 90)])) }],
    ['5000 valid-looking stamps', { at: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`risk.r${i}`, 2000 + (i % 90)])) }],
    ['bad stamps', { at: { 'honesty.x': 'soon', 'empathy.y': Number.NaN, 'risk.z': 1e300, 'steadiness.w': -5, 'ambition.q': 2020, 'honesty.UP': 2020 } }],
    ['prototype keys', proto],
  ]

  for (const [name, raw] of HOSTILE) {
    it(`reads ${name} as a bounded record, and never throws or writes`, () => {
      const g = adult()
      store(g, typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {})
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) g.flags[PERSONA_KEY] = raw as Json
      const before = JSON.stringify(g)
      const rec = readPersona(g)
      expect(rec.v).toBe(1)
      expect(rec.owner).toBe(ownerOf(g))
      expect(Object.keys(rec.n).length).toBeLessThanOrEqual(NUDGE_SLOTS)
      for (const [axis, v] of Object.entries(rec.n)) {
        expect(MOVERS as readonly string[], axis).toContain(axis)
        expect(isWhole(v) && inRange(v, -NUDGE_MAX, NUDGE_MAX), `${axis}: ${v}`).toBe(true)
        expect(v, `${axis} is stored only when it is not zero`).not.toBe(0)
      }
      const stamps = Object.entries(rec.at)
      expect(stamps.length).toBeLessThanOrEqual(AT_MAX)
      for (const [key, year] of stamps) {
        expect(key, key).toMatch(/^(honesty|empathy|risk|steadiness)\.[a-z][a-z0-9-]{0,15}$/)
        expect(isWhole(year), `${key}: ${year}`).toBe(true)
      }
      const axes = personaOf(g)
      for (const id of AXIS_IDS) expect(inRange(axes[id], 0, 100), `${id}: ${axes[id]}`).toBe(true)
      for (const id of MOVERS) expect(isWhole(axes[id]), id).toBe(true)
      expect(VOICES).toContain(voiceOf(axes))
      expect(JSON.stringify(g)).toBe(before)
      expect(nodes(rec)).toBeLessThanOrEqual(60)
    })
  }

  it('cuts 1e9 to the bounds and a fraction to a whole number', () => {
    const g = adult()
    store(g, { n: { honesty: 1e9, empathy: -1e9, risk: 2.6, steadiness: -3.4 } })
    expect(readPersona(g).n).toEqual({ honesty: NUDGE_MAX, empathy: -NUDGE_MAX, risk: 3, steadiness: -3 })
  })

  it('keeps the 40 latest stamps of 500 and drops the rest, in one fixed key order', () => {
    const g = adult()
    store(g, { at: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`honesty.r${i}`, 1900 + i])) })
    const at = readPersona(g).at
    const keys = Object.keys(at)
    expect(keys).toHaveLength(AT_MAX)
    expect(keys).toEqual([...keys].sort())
    expect(Math.min(...Object.values(at))).toBe(1900 + 500 - AT_MAX)
  })

  it("reads another life's record, and a record with no owner, as the defaults", () => {
    const g = adult()
    store(g, { owner: '9:somebody-else', n: { honesty: 9 }, at: { 'honesty.x': 2026 } })
    expect(readPersona(g)).toEqual({ v: 1, owner: ownerOf(g), n: {}, at: {} })
    g.flags[PERSONA_KEY] = { n: { honesty: 9 }, at: { 'honesty.x': 2026 } } as unknown as Json
    expect(readPersona(g)).toEqual({ v: 1, owner: ownerOf(g), n: {}, at: {} })
    expect(personaOf(g)).toEqual(inferAxes(g))
  })

  it('a hostile character or counter bag reads as neutral and never throws', () => {
    for (const hidden of [null, 'x', 7, [], { karma: 'bad', craziness: Number.NaN, willpower: Infinity, discipline: {} }]) {
      const g = adult()
      ;(g.character as unknown as { hidden: unknown }).hidden = hidden
      const axes = inferAxes(g)
      for (const id of AXIS_IDS) expect(inRange(axes[id], 0, 100), `${String(hidden)} ${id}`).toBe(true)
    }
    for (const counters of [null, 'x', 7, [], { crimes: 'many', thefts: Number.NaN, murders: Infinity, fights: -5, cheated: {}, insults: [3] }]) {
      const g = adult()
      ;(g as unknown as { counters: unknown }).counters = counters
      expect(inferAxes(g)).toEqual(inferAxes(adult()))
    }
  })
})

describe('inferAxes', () => {
  it('has ambition equal to ambitionOf(g) exactly, unrounded, over a grid of hidden stats, talents and shifts', () => {
    const TALENTS: string[][] = [[], ['Inventor'], ['Inventor', 'Business', 'Leadership'], ['Inventor', 'Business', 'Leadership', 'Academics', 'Athletics'], ['MainCharacter']]
    let fractional = 0
    for (const willpower of [0, 25, 50, 75, 100]) {
      for (const discipline of [0, 25, 50, 75, 100]) {
        for (const talents of TALENTS) {
          for (const shift of [0, 3.45, -7.77, 12, -12]) {
            const g = life({ willpower, discipline })
            g.character.talents = talents
            const y = readYou(g)
            y.shift = shift
            writeYou(g, y)
            const a = inferAxes(g).ambition
            expect(a, `${willpower}/${discipline}/${talents.join('+')}/${shift}`).toBe(ambitionOf(g))
            if (!Number.isInteger(a)) fractional++
          }
        }
      }
    }
    // The shift carries two decimals, so this one axis can be fractional; the player sees Math.round of it.
    expect(fractional).toBeGreaterThan(0)
  })

  it('has four whole axes, all five in 0..100, and ambition independent of karma and the counters', () => {
    const base = inferAxes(adult()).ambition
    for (const karma of GRID) expect(inferAxes(life({ karma })).ambition).toBe(base)
    for (const id of ALL_COUNTS) expect(inferAxes(life({}, { [id]: 1e9 })).ambition).toBe(base)
    for (const karma of [0, 100]) {
      for (const craziness of [0, 100]) {
        for (const willpower of [0, 100]) {
          for (const discipline of [0, 100]) {
            for (const big of [0, 1e9]) {
              const g = life({ karma, craziness, willpower, discipline }, Object.fromEntries(ALL_COUNTS.map((c) => [c, big])))
              const a = inferAxes(g)
              for (const id of AXIS_IDS) expect(inRange(a[id], 0, 100), `${id} ${karma}/${craziness}/${willpower}/${discipline}/${big}: ${a[id]}`).toBe(true)
              for (const id of MOVERS) expect(isWhole(a[id]), id).toBe(true)
            }
          }
        }
      }
    }
  })

  /** Reads `axis` of a life across `values` of one input, and checks the sign of the whole walk: 1 never falls, -1 never rises, and it moves. */
  function walk(axis: Mover, make: (v: number) => GameState, values: readonly number[], dir: 1 | -1, what: string): void {
    const seen = values.map((v) => inferAxes(make(v))[axis])
    for (let i = 1; i < seen.length; i++) {
      const step = (seen[i] as number) - (seen[i - 1] as number)
      expect(dir * step, `${what} -> ${axis} at ${values[i]}: ${seen[i - 1]} then ${seen[i]}`).toBeGreaterThanOrEqual(0)
    }
    const total = (seen[seen.length - 1] as number) - (seen[0] as number)
    expect(dir * total, `${what} does move ${axis}`).toBeGreaterThan(0)
  }

  it('lifts honesty and empathy with karma, and never lowers them', () => {
    for (const axis of ['honesty', 'empathy'] as const) walk(axis, (karma) => life({ karma }), GRID, 1, 'karma')
  })

  it('lowers honesty and empathy with each of the seven counts, and raises them with donated and livesSaved', () => {
    for (const axis of ['honesty', 'empathy'] as const) {
      for (const id of LOWERS) walk(axis, (n) => life({}, { [id]: n }), COUNTS_BIG, -1, id)
      for (const id of RAISES) walk(axis, (n) => life({}, { [id]: n }), COUNTS_BIG, 1, id)
    }
  })

  it('lifts risk with craziness, lottery tickets and fights', () => {
    walk('risk', (craziness) => life({ craziness }), GRID, 1, 'craziness')
    walk('risk', (n) => life({}, { lotteryTickets: n }), COUNTS_BIG, 1, 'lotteryTickets')
    walk('risk', (n) => life({}, { fights: n }), COUNTS_BIG, 1, 'fights')
  })

  it('lifts steadiness with discipline and willpower, and lowers it with craziness', () => {
    walk('steadiness', (discipline) => life({ discipline }), GRID, 1, 'discipline')
    walk('steadiness', (willpower) => life({ willpower }), GRID, 1, 'willpower')
    walk('steadiness', (craziness) => life({ craziness }), GRID, -1, 'craziness')
  })

  it('holds under mixed inputs: a counter pile never lifts honesty or empathy past a clean life with the same karma', () => {
    for (const karma of [0, 30, 55, 80, 100]) {
      const clean = inferAxes(life({ karma }))
      const dirty = inferAxes(life({ karma }, Object.fromEntries(LOWERS.map((c) => [c, 1e9]))))
      expect(dirty.honesty).toBeLessThanOrEqual(clean.honesty)
      expect(dirty.empathy).toBeLessThanOrEqual(clean.empathy)
      const kind = inferAxes(life({ karma }, Object.fromEntries(RAISES.map((c) => [c, 1e9]))))
      expect(kind.honesty).toBeGreaterThanOrEqual(clean.honesty)
      expect(kind.empathy).toBeGreaterThanOrEqual(clean.empathy)
    }
  })

  it('caps each count: 1e9 reads as 1000, and a count that is not a number reads as none', () => {
    const none = inferAxes(adult())
    for (const id of ALL_COUNTS) {
      expect(inferAxes(life({}, { [id]: 1e9 })), id).toEqual(inferAxes(life({}, { [id]: 1000 })))
      expect(inferAxes(life({}, { [id]: Number.MAX_VALUE })), id).toEqual(inferAxes(life({}, { [id]: 1000 })))
      for (const bad of [Number.NaN, Infinity, -Infinity, -5, '12', null, {}, [7], true]) expect(inferAxes(life({}, { [id]: bad })), `${id} ${String(bad)}`).toEqual(none)
    }
  })

  it('does not use amounts: moneyStolen, moneyGambled and moneyDonated at 1e9 move nothing', () => {
    const none = inferAxes(adult())
    for (const id of ['moneyStolen', 'moneyGambled', 'moneyDonated']) expect(inferAxes(life({}, { [id]: 1e9 })), id).toEqual(none)
  })

  it('reads the hidden stats cut to 0..100, so a hostile 1e9 reads as 100 and a negative as 0', () => {
    expect(inferAxes(life({ karma: 1e9, craziness: 1e9, willpower: 1e9, discipline: 1e9 }))).toEqual(inferAxes(life({ karma: 100, craziness: 100, willpower: 100, discipline: 100 })))
    expect(inferAxes(life({ karma: -1e9, craziness: -1e9, willpower: -1e9, discipline: -1e9 }))).toEqual(inferAxes(life({ karma: 0, craziness: 0, willpower: 0, discipline: 0 })))
  })

  it('puts a mean newborn (karma 55, craziness 35, willpower 55, discipline 55) near the middle of every axis', () => {
    const a = inferAxes(life({ karma: 55, craziness: 35, willpower: 55, discipline: 55 }))
    for (const id of AXIS_IDS) expect(Math.abs(a[id] - 50), id).toBeLessThanOrEqual(5)
  })
})

describe('nudgePersona', () => {
  it('cuts a nudge to whole steps of at most NUDGE_STEP, and returns what it added', () => {
    const g = adult()
    expect(nudgePersona(g, 'honesty', 100, 'a')).toBe(NUDGE_STEP)
    expect(nudgePersona(g, 'honesty', -100, 'b')).toBe(-NUDGE_STEP)
    expect(nudgePersona(g, 'empathy', 2.4, 'a')).toBe(2)
    expect(nudgePersona(g, 'risk', -1, 'a')).toBe(-1)
    expect(readPersona(g).n).toEqual({ empathy: 2, risk: -1 })
  })

  it('refuses a nudge that is not a whole step: zero, under a half, NaN, infinity and a non-number write nothing', () => {
    const g = adult()
    for (const by of [0, 0.4, -0.4, Number.NaN, Infinity, -Infinity, '3', null, {}]) {
      expect(nudgePersona(g, 'honesty', by as number, 'x'), String(by)).toBe(0)
    }
    expect(PERSONA_KEY in g.flags).toBe(false)
  })

  it('refuses ambition and any word that is not one of the other four axes', () => {
    const g = adult()
    for (const axis of ['ambition', 'luck', '', '__proto__', 'constructor', 'toString']) expect(nudgePersona(g, axis as Mover, 3, 'x'), axis).toBe(0)
    expect(PERSONA_KEY in g.flags).toBe(false)
  })

  it('refuses a reason that is not a short lower-case word', () => {
    const g = adult()
    for (const why of ['', ' ', 'Upper', '1abc', 'with space', 'a.b', 'x'.repeat(17), 'café']) expect(nudgePersona(g, 'honesty', 3, why), JSON.stringify(why)).toBe(0)
    for (const why of [7, null, undefined, {}]) expect(nudgePersona(g, 'honesty', 3, why as unknown as string)).toBe(0)
    expect(PERSONA_KEY in g.flags).toBe(false)
    expect(nudgePersona(g, 'honesty', 3, 'a')).toBe(3)
    expect(nudgePersona(g, 'honesty', 3, 'x'.repeat(16))).toBe(3)
    expect(nudgePersona(g, 'honesty', 3, 'cheated-friend')).toBe(3)
  })

  it('happens once per (axis, reason, year)', () => {
    const g = adult()
    g.year = 2030
    expect(nudgePersona(g, 'honesty', 3, 'lied')).toBe(3)
    expect(nudgePersona(g, 'honesty', 3, 'lied')).toBe(0)
    expect(nudgePersona(g, 'honesty', -3, 'lied')).toBe(0)
    expect(nudgePersona(g, 'honesty', 3, 'told-truth')).toBe(3)
    expect(nudgePersona(g, 'empathy', 3, 'lied')).toBe(3)
    expect(readPersona(g).n).toEqual({ honesty: 6, empathy: 3 })
    g.year = 2031
    expect(nudgePersona(g, 'honesty', 3, 'lied')).toBe(3)
    expect(readPersona(g).n.honesty).toBe(9)
  })

  it('stops at +-NUDGE_MAX in all, returns only what fits, and a call that adds nothing stamps nothing', () => {
    const g = adult()
    const got = [3, 3, 3, 3, 3].map((by, i) => nudgePersona(g, 'risk', by, `r${i}`))
    expect(got).toEqual([3, 3, 3, 3, 3])
    expect(readPersona(g).n.risk).toBe(NUDGE_MAX)
    expect(nudgePersona(g, 'risk', 3, 'r5')).toBe(0)
    expect(readPersona(g).at['risk.r5']).toBeUndefined()
    // The refused call used no stamp, so the same reason can still pull the other way this year.
    expect(nudgePersona(g, 'risk', -3, 'r5')).toBe(-3)
    expect(readPersona(g).n.risk).toBe(NUDGE_MAX - 3)
    // Two short of the top: a step of 3 adds 2.
    const h = adult()
    expect([3, 3, 3, 3, 2].map((by, i) => nudgePersona(h, 'empathy', by, `r${i}`))).toEqual([3, 3, 3, 3, 2])
    expect(nudgePersona(h, 'empathy', 3, 'r9')).toBe(1)
    expect(readPersona(h).n.empathy).toBe(NUDGE_MAX)
  })

  it('moves the persona by exactly what it returns, cut to 0..100 on top of the inference', () => {
    const g = adult()
    const base = personaOf(g)
    expect(nudgePersona(g, 'steadiness', 3, 'calm')).toBe(3)
    const after = personaOf(g)
    expect(after.steadiness).toBe(base.steadiness + 3)
    for (const id of AXIS_IDS) if (id !== 'steadiness') expect(after[id]).toBe(base[id])
    // At the floor and the ceiling the cut holds.
    const low = life({ karma: 0 }, Object.fromEntries(LOWERS.map((c) => [c, 1e9])))
    for (let i = 0; i < 5; i++) nudgePersona(low, 'honesty', -3, `r${i}`)
    expect(personaOf(low).honesty).toBe(0)
    const high = life({ karma: 100 }, { donated: 1e9, livesSaved: 1e9 })
    for (let i = 0; i < 5; i++) nudgePersona(high, 'honesty', 3, `r${i}`)
    expect(personaOf(high).honesty).toBeLessThanOrEqual(100)
    expect(personaOf(high).honesty).toBeGreaterThanOrEqual(inferAxes(high).honesty)
  })

  it('refuses a dead character and writes nothing', () => {
    const g = adult()
    g.character.alive = false
    expect(nudgePersona(g, 'honesty', 3, 'x')).toBe(0)
    expect(PERSONA_KEY in g.flags).toBe(false)
  })

  it("starts a new record when the stored one is another life's, instead of adding to it", () => {
    const g = adult()
    store(g, { owner: '9:somebody-else', n: { honesty: 9 }, at: { 'honesty.x': g.year } })
    expect(nudgePersona(g, 'honesty', 3, 'x')).toBe(3)
    expect(readPersona(g)).toEqual({ v: 1, owner: ownerOf(g), n: { honesty: 3 }, at: { 'honesty.x': g.year } })
  })

  it('keeps the year stamps of a net-zero year, so the same reason cannot be nudged twice', () => {
    const g = adult()
    expect(nudgePersona(g, 'honesty', 3, 'a')).toBe(3)
    expect(nudgePersona(g, 'honesty', -3, 'b')).toBe(-3)
    expect(readPersona(g).n).toEqual({})
    expect(PERSONA_KEY in g.flags).toBe(true)
    expect(nudgePersona(g, 'honesty', 3, 'a')).toBe(0)
  })

  it('draws nothing: a nudge on a state whose rng cannot be read still works', () => {
    const g = adult()
    Object.defineProperty(g, 'rng', {
      get() {
        throw new Error('a nudge touched g.rng')
      },
      set() {
        throw new Error('a nudge wrote g.rng')
      },
      configurable: true,
    })
    expect(nudgePersona(g, 'empathy', 3, 'kind')).toBe(3)
    expect(g.nextId).toBe(0)
    expect(g.world).toBeUndefined()
  })
})

describe('the store', () => {
  it('writes the defaults as no key at all, and anything else cut to its ranges with the keys in one order', () => {
    const g = adult()
    store(g, { n: { honesty: 3 } })
    writePersona(g, { v: 1, owner: ownerOf(g), n: {}, at: {} })
    expect(PERSONA_KEY in g.flags).toBe(false)

    writePersona(g, { v: 1, owner: 'somebody-else', n: { steadiness: 99, risk: 0, honesty: -99 }, at: { 'risk.z': 2030, 'honesty.a': 2029, 'ambition.q': 2030 } })
    expect(g.flags[PERSONA_KEY]).toEqual({
      v: 1,
      owner: ownerOf(g),
      n: { honesty: -NUDGE_MAX, steadiness: NUDGE_MAX },
      at: { 'honesty.a': 2029, 'risk.z': 2030 },
    })
    expect(Object.keys(g.flags[PERSONA_KEY] as object)).toEqual(['v', 'owner', 'n', 'at'])
  })

  it('stays inside its node budget after 10,000 nudges and a 500-key hostile record', () => {
    const g = adult()
    for (let i = 0; i < 10_000; i++) {
      g.year = 2000 + Math.floor(i / 100)
      nudgePersona(g, MOVERS[i % 4] as Mover, 3, `r${(i * 7) % 11}`)
    }
    const stored = g.flags[PERSONA_KEY]
    expect(nodes(stored)).toBeLessThanOrEqual(60)
    store(g, { n: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, 1])), at: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`honesty.r${i}`, 2000 + i])) })
    expect(nodes(readPersona(g))).toBeLessThanOrEqual(60)
  })
})

describe('10,000 nudges', () => {
  it('stay within +-NUDGE_MAX on every axis, happen once per (axis, reason, year), and return what the record changed by', () => {
    const g = adult()
    const seen = new Set<string>()
    const wrong: string[] = []
    let moved = 0
    for (let i = 0; i < 10_000; i++) {
      // One hundred calls a year for a hundred years: the years never go back, 44 distinct (axis, reason) pairs a year.
      g.year = 1950 + Math.floor(i / 100)
      const axis = MOVERS[(i * 3) % 4] as Mover
      const why = `r${(i * 7) % 11}`
      const by = ((i * 5) % 9) - 4
      const before = readPersona(g).n[axis] ?? 0
      const added = nudgePersona(g, axis, by, why)
      const rec = readPersona(g)
      const after = rec.n[axis] ?? 0
      const key = `${axis}|${why}|${g.year}`
      if (after - before !== added) wrong.push(`${i}: ${axis} ${before} -> ${after}, returned ${added}`)
      if (Math.abs(after) > NUDGE_MAX || !Number.isInteger(after)) wrong.push(`${i}: ${axis} is ${after}`)
      if (Math.abs(added) > NUDGE_STEP) wrong.push(`${i}: returned ${added}`)
      if (added !== 0) {
        if (seen.has(key)) wrong.push(`${i}: ${key} nudged twice`)
        seen.add(key)
        moved++
      }
      if (Object.keys(rec.at).length > AT_MAX) wrong.push(`${i}: ${Object.keys(rec.at).length} stamps`)
    }
    expect(wrong.slice(0, 5)).toEqual([])
    expect(moved).toBeGreaterThan(1000)
    const axes = personaOf(g)
    for (const id of AXIS_IDS) expect(inRange(axes[id], 0, 100), id).toBe(true)
  })

  it('stay once-per even in one year with more reasons than there are stamps', () => {
    const g = adult()
    g.year = 2040
    const moved: string[] = []
    for (let round = 0; round < 3; round++) {
      for (let r = 0; r < 60; r++) {
        for (const axis of MOVERS) if (nudgePersona(g, axis, round % 2 === 0 ? 1 : -1, `r${r}`) !== 0) moved.push(`${axis}.r${r}`)
      }
    }
    expect(new Set(moved).size).toBe(moved.length)
    expect(Object.keys(readPersona(g).at).length).toBeLessThanOrEqual(AT_MAX)
    for (const axis of MOVERS) expect(Math.abs(readPersona(g).n[axis] ?? 0)).toBeLessThanOrEqual(NUDGE_MAX)
  })
})

describe('a pure read', () => {
  it('works on a deep-frozen state with g.rng trapped, and leaves g.rng, g.nextId and g.world alone', () => {
    const g = frozenGame(7, { age: 30 })
    expect(() => inferAxes(g)).not.toThrow()
    expect(() => personaOf(g)).not.toThrow()
    expect(() => readPersona(g)).not.toThrow()
    expect(g.nextId).toBe(0)
    expect(g.world).toBeUndefined()
    expect(VOICES).toContain(voiceOf(personaOf(g)))
  })

  it('also reads a stored record on a frozen state', () => {
    const g = adult()
    expect(nudgePersona(g, 'honesty', 3, 'x')).toBe(3)
    expect(nudgePersona(g, 'risk', -3, 'y')).toBe(-3)
    const expected = personaOf(g)
    const before = JSON.stringify(g)
    const f = adult()
    f.flags = JSON.parse(JSON.stringify(g.flags)) as GameState['flags']
    deepFreeze(trapRng(f))
    expect(personaOf(f)).toEqual(expected)
    expect(readPersona(f).n).toEqual({ honesty: 3, risk: -3 })
    expect(JSON.stringify(g)).toBe(before)
  })

  it('has voiceOf(personaOf(g)) defined for every life on a grid', () => {
    for (const karma of [0, 50, 100]) {
      for (const craziness of [0, 50, 100]) {
        for (const big of [0, 1e9]) {
          const g = life({ karma, craziness }, { crimes: big, donated: big })
          expect(VOICES, `${karma}/${craziness}/${big}`).toContain(voiceOf(personaOf(g)))
        }
      }
    }
  })
})

describe('the hand-over', () => {
  it('starts the heir clean: no key, no nudges, and the axes come from the heir\'s own hidden stats and counters', () => {
    const g = makeTestGame(1, { age: 70 })
    const heirP = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    g.counters.crimes = 12
    g.counters.murders = 2
    g.character.hidden.karma = 3
    expect(nudgePersona(g, 'honesty', -3, 'lied')).toBe(-3)
    expect(nudgePersona(g, 'steadiness', 3, 'calm')).toBe(3)
    expect(PERSONA_KEY in g.flags).toBe(true)
    const parent = personaOf(g)

    killCharacter(g, 'Old Age')
    g.queue = []
    const heir = continueAsChild(g, heirP.id)
    expect(heir).not.toBe(g)
    expect(heir.generation).toBe(2)

    expect(PERSONA_KEY in heir.flags).toBe(false)
    expect(readPersona(heir)).toEqual({ v: 1, owner: ownerOf(heir), n: {}, at: {} })
    // The heir infers from their own hidden stats and their own (empty) counters: the same numbers a bare life with those stats reads.
    const bare = adult()
    bare.character.hidden = { ...heir.character.hidden }
    bare.character.talents = heir.character.talents
    const mine = inferAxes(heir)
    const reference = inferAxes(bare)
    for (const id of MOVERS) expect(mine[id], id).toBe(reference[id])
    expect(mine.ambition).toBe(ambitionOf(heir))
    expect(personaOf(heir)).toEqual(mine)
    // And nothing of the parent's record or counters reached them.
    expect(personaOf(heir).honesty).toBeGreaterThan(parent.honesty)
    expect(heir.counters.crimes).toBeUndefined()
  })

  it("does not read the parent's record from the heir even when the key is copied by hand: the owner string differs", () => {
    const g = adult()
    expect(nudgePersona(g, 'honesty', 3, 'x')).toBe(3)
    const copy = adult()
    copy.generation = 2
    copy.character.id = 'someone-else'
    copy.flags[PERSONA_KEY] = g.flags[PERSONA_KEY] as Json
    expect(readPersona(copy)).toEqual({ v: 1, owner: ownerOf(copy), n: {}, at: {} })
  })
})
