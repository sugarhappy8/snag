// ci: fast
// R3-F5 (C.6 e): the Workshop future race as a frontier crossing (src/game/workshop/market.ts raceYear and raceShift, menu.ts).
//
// A rival leap in a field pulls a future idea's rival deadline in, and the player is told. With no push anything is as it was.
// What this file pins: with no shard, over the 13 ideas, 40 families and years 2027 to 2060, raceYear is the old formula (copied
// here) and raceShift is 0; with a shard the ideas whose field moved lose floor(lead) years and no others; the deadline never
// goes under `from + 10`, never above the old one and never before the year of the latest push; the next year a leap that
// reached the deadline closes the idea with the existing log line; the table of fields agrees with the wave table; the info
// row shows only when the shift is positive; the menu builds on a deep-frozen state; and nothing here draws from g.rng.
import { describe, expect, it } from 'vitest'
import { workshopWaveFor } from '../src/game/business/tech-wave-data'
import { economicRoll } from '../src/game/economy'
import { ALL_IDEAS, catalogIdea, FUTURE, HISTORY, type IdeaDef } from '../src/game/workshop/catalog'
import { FUTURE_FIELD, familyOf, isFirst, raceOpen, raceShift, raceYear } from '../src/game/workshop/market'
import { workshopMenu } from '../src/game/workshop/menu'
import { readWorkshop } from '../src/game/workshop/notebook'
import { yearlyWorkshop } from '../src/game/workshop/yearly'
import type { GameState, MenuNode } from '../src/game/types'
import { applyDisclosure, frontierLead, readFrontier } from '../src/game/world/frontier'
import { fieldOfKind, type FieldId } from '../src/game/world/frontier-fields'
import '../src/game/world/shards'
import { deepFreeze } from './fuzz-kit'
import { give, ideaMenu, inventor, nextYear, walk } from './workshop-fixtures'

/** The deadline before R3-F5: copied from the old raceYear so the new one is held to it. */
const oldRaceYear = (g: GameState, def: IdeaDef): number => def.from + 10 + Math.floor(economicRoll(`${familyOf(g)}|ws-future|${def.id}`) * 31)

const FAMILIES = Array.from({ length: 40 }, (_, i) => `ws-frontier-${i}`)
/** The future ideas that write a wave (WORKSHOP_WAVES), by id; the other four are novelties. Written out, so the table under test is not its own oracle. */
const FIELDED_IDS = ['fut-fusion-cell', 'fut-superwire', 'fut-dream-recorder', 'fut-pocket-quantum', 'fut-organ-printer', 'fut-cold-cure', 'fut-tooth-gel', 'fut-plastic-bin', 'fut-robot-chef']
const FIELDED = FUTURE.filter((d) => FIELDED_IDS.includes(d.id))
const NOVELTIES = FUTURE.filter((d) => !FIELDED_IDS.includes(d.id))

/** A hand-built shard: each field is the given years ahead of the calendar, its newest push in `ly`. */
function withFields(g: GameState, fields: Partial<Record<FieldId, number>>, ly = g.year): GameState {
  const f: Record<string, unknown> = {}
  for (const [field, years] of Object.entries(fields)) f[field] = { fold: Math.round(years * 100), pub: 0, ly, rows: [] }
  ;(g as { world?: unknown }).world = { v: 1, frontier: { v: 1, y: 0, f } }
  return g
}
const withLead = (g: GameState, field: FieldId, years: number, ly = g.year): GameState => withFields(g, { [field]: years }, ly)

/** The deadline the new rule gives, worked out on its own from the old one. */
function expectedYear(def: IdeaDef, base: number, cut: number, ly: number): number {
  const floor = Math.max(def.from + 10, Math.min(base, ly))
  return base - Math.max(0, Math.min(cut, base - floor))
}

const lines = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const infoText = (n: MenuNode, g: GameState): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')

describe('the table of fields', () => {
  it('names the field of the 9 future ideas that write a wave, and none of the 4 novelties', () => {
    expect(FUTURE.length).toBe(13)
    expect(FIELDED.length).toBe(9)
    expect(NOVELTIES.map((d) => d.id).sort()).toEqual(['fut-air-umbrella', 'fut-clean-clothes', 'fut-float-board', 'fut-free-chocolate'])
    for (const d of FIELDED) {
      const w = workshopWaveFor(d)
      expect(w, d.id).not.toBeNull()
      expect(FUTURE_FIELD[d.id], d.id).toBe(fieldOfKind(w!.kind))
    }
    for (const d of NOVELTIES) expect(workshopWaveFor(d), d.id).toBeNull()
    expect(Object.keys(FUTURE_FIELD).sort()).toEqual(FIELDED.map((d) => d.id).sort())
    expect(FUTURE_FIELD).toMatchObject({ 'fut-fusion-cell': 'fusion', 'fut-superwire': 'fusion', 'fut-dream-recorder': 'neuro', 'fut-pocket-quantum': 'quantum', 'fut-organ-printer': 'drug', 'fut-cold-cure': 'drug', 'fut-tooth-gel': 'drug', 'fut-plastic-bin': 'carbon', 'fut-robot-chef': 'automation' })
  })
})

describe('with no push the race is as it was', () => {
  it('raceYear is the old formula and raceShift is 0, over 13 ideas, 40 families and the years 2027 to 2060', () => {
    const g = inventor({ genius: true, year: 2030 })
    for (const lifeId of FAMILIES) {
      g.lifeId = lifeId
      for (let year = 2027; year <= 2060; year++) {
        g.year = year
        for (const d of FUTURE) {
          expect(raceYear(g, d), `${lifeId} ${year} ${d.id}`).toBe(oldRaceYear(g, d))
          expect(raceShift(g, d), `${lifeId} ${year} ${d.id}`).toBe(0)
        }
      }
    }
    expect(g.world).toBeUndefined()
  })

  it('leaves the history race and everyday ideas alone, whatever the frontier holds', () => {
    const g = inventor({ genius: true, year: 2040 })
    withLead(g, 'fusion', 12)
    for (const d of HISTORY) {
      expect(raceYear(g, d)).toBe(d.real)
      expect(raceShift(g, d)).toBe(0)
    }
    for (const d of ALL_IDEAS.filter((i) => !i.future && i.real === undefined)) {
      expect(raceYear(g, d)).toBeNull()
      expect(raceShift(g, d)).toBe(0)
    }
  })

  it('reads a hostile id as no field', () => {
    const g = withLead(inventor({ genius: true, year: 2040 }), 'fusion', 12)
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '']) {
      expect(raceShift(g, { id, from: 2000, real: undefined, future: true })).toBe(0)
    }
  })
})

describe('a leap in a field pulls its ideas in', () => {
  it('takes floor(lead) years off the two fusion ideas and nothing off the others, never under from + 10', () => {
    const g = inventor({ genius: true, year: 2035 })
    withLead(g, 'fusion', 3.5, 2035)
    expect(frontierLead(g, 'fusion')).toBe(3.5)
    let lost3 = 0
    for (const lifeId of FAMILIES) {
      g.lifeId = lifeId
      for (const d of FUTURE) {
        const base = oldRaceYear(g, d)
        const fusion = FUTURE_FIELD[d.id] === 'fusion'
        const want = fusion ? expectedYear(d, base, 3, 2035) : base
        expect(raceYear(g, d), `${lifeId} ${d.id}`).toBe(want)
        expect(raceShift(g, d), `${lifeId} ${d.id}`).toBe(base - want)
        expect(raceYear(g, d)!, `${lifeId} ${d.id}`).toBeGreaterThanOrEqual(d.from + 10)
        expect(raceYear(g, d)!, `${lifeId} ${d.id}`).toBeLessThanOrEqual(base)
        if (fusion && base - want === 3) lost3++
      }
    }
    // Some families have room for the whole 3 years, so the cut is not just a clamp.
    expect(lost3).toBeGreaterThan(10)
  })

  it('takes the shift of a real rival disclosure from the writer, not only from a hand-built shard', () => {
    const g = inventor({ genius: true, year: 2032 })
    expect(applyDisclosure(g, { field: 'fusion', year: 2032, size: 1, origin: 'wave:b', by: 'rival' })).toMatchObject({ applied: true })
    const cut = Math.floor(frontierLead(g, 'fusion'))
    expect(cut).toBeGreaterThanOrEqual(1)
    const lastYear = readFrontier(g).f.fusion!.ly
    expect(lastYear).toBe(2032)
    let moved = 0
    for (const lifeId of FAMILIES) {
      g.lifeId = lifeId
      for (const d of FIELDED) {
        const base = oldRaceYear(g, d)
        const want = FUTURE_FIELD[d.id] === 'fusion' ? expectedYear(d, base, cut, 2032) : base
        expect(raceYear(g, d), `${lifeId} ${d.id}`).toBe(want)
        if (want !== base) moved++
      }
    }
    expect(moved).toBeGreaterThan(20)
  })

  it('never moves a deadline before the year of the latest push', () => {
    const g = inventor({ genius: true, year: 2030 })
    withLead(g, 'fusion', 12, 2030)
    for (const lifeId of FAMILIES) {
      g.lifeId = lifeId
      for (const d of FIELDED) {
        const base = oldRaceYear(g, d)
        const r = raceYear(g, d)!
        expect(r, `${lifeId} ${d.id}`).toBeGreaterThanOrEqual(Math.min(base, g.year))
        expect(r, `${lifeId} ${d.id}`).toBeGreaterThanOrEqual(d.from + 10)
        expect(r, `${lifeId} ${d.id}`).toBeLessThanOrEqual(base)
      }
    }
    // The next year the push is a year old, and the era floor is all that holds the deadline.
    g.year = 2031
    for (const lifeId of FAMILIES) {
      g.lifeId = lifeId
      for (const d of FIELDED) expect(raceYear(g, d)!, `${lifeId} ${d.id}`).toBeGreaterThanOrEqual(d.from + 10)
    }
  })

  it('closes an idea in the notebook the year after a leap reached its deadline, with the existing log line', () => {
    const def = catalogIdea('fut-fusion-cell')!
    const g = inventor({ genius: true, year: 2030 })
    const family = FAMILIES.find((lifeId) => {
      g.lifeId = lifeId
      const base = oldRaceYear(g, def)
      return base >= 2032 && base <= 2042
    })
    expect(family).toBeDefined()
    g.lifeId = family!
    give(g, def.id, 50)
    withLead(g, 'fusion', 12, 2030)
    // The year of the push is inside the race, and the shift is the whole way to it.
    expect(raceYear(g, def)).toBe(2030)
    expect(isFirst(g, def)).toBe(true)
    expect(raceOpen(g, def)).toBe(true)
    nextYear(g)
    yearlyWorkshop(g)
    expect(readWorkshop(g).ideas.some((i) => i.id === def.id)).toBe(false)
    expect(lines(g)).toContain(`A rival lab unveiled a ${def.name} this year. The future arrived without me.`)

    // The same life with no leap keeps the idea.
    const calm = inventor({ genius: true, year: 2030 })
    calm.lifeId = family!
    give(calm, def.id, 50)
    nextYear(calm)
    yearlyWorkshop(calm)
    expect(readWorkshop(calm).ideas.some((i) => i.id === def.id)).toBe(true)
    expect(lines(calm).some((t) => t.includes('The future arrived without me'))).toBe(false)
  })
})

describe('the idea row tells the player', () => {
  const def = catalogIdea('fut-fusion-cell')!

  /** A life in 2030 whose fusion cell would have had the whole shift to take, and whose race is open (its old deadline is 2040 to 2054). */
  function raced(lead: number | null): GameState {
    const g = inventor({ genius: true, year: 2030 })
    const family = FAMILIES.find((lifeId) => {
      g.lifeId = lifeId
      const base = oldRaceYear(g, def)
      return base >= 2040 && base <= 2054
    })
    g.lifeId = family!
    give(g, def.id, 50)
    give(g, 'fut-cold-cure', 50)
    if (lead !== null) withLead(g, 'fusion', lead, 2030)
    return g
  }

  it('shows "Recent leaps pulled this race in by N years." only when the shift is positive', () => {
    const calm = raced(null)
    expect(ideaMenu(calm, def.id).children(calm).some((n) => n.id === `ws.idea.race.shift.${def.id}`)).toBe(false)
    expect(ideaMenu(calm, def.id).children(calm).some((n) => n.id === `ws.idea.race.${def.id}`)).toBe(true)

    const g = raced(3.5)
    const nodes = ideaMenu(g, def.id).children(g)
    const row = nodes.find((n) => n.id === `ws.idea.race.shift.${def.id}`)
    expect(row).toBeDefined()
    const text = infoText(row!, g)
    expect(text).toBe('Recent leaps pulled this race in by 3 years.')
    expect(raceShift(g, def)).toBe(3)
    expect(text.length).toBeLessThanOrEqual(90)
    expect(text).not.toMatch(/[\u2014\u2013]/)
    // It sits right after the race row.
    const ids = nodes.map((n) => n.id)
    expect(ids.indexOf(`ws.idea.race.shift.${def.id}`)).toBe(ids.indexOf(`ws.idea.race.${def.id}`) + 1)

    // A field that did not move shows no row, and one year is "1 year".
    expect(ideaMenu(g, 'fut-cold-cure').children(g).some((n) => n.id.startsWith('ws.idea.race.shift.'))).toBe(false)
    const one = raced(1.2)
    expect(infoText(ideaMenu(one, def.id).children(one).find((n) => n.id === `ws.idea.race.shift.${def.id}`)!, one)).toBe('Recent leaps pulled this race in by 1 year.')
    const none = raced(0.6)
    expect(ideaMenu(none, def.id).children(none).some((n) => n.id === `ws.idea.race.shift.${def.id}`)).toBe(false)
  })

  it('shows the new year in the idea subtitle and the race row', () => {
    for (const lead of [null, 2.5, 12]) {
      const g = raced(lead)
      const year = raceYear(g, def)!
      const row = ideaMenu(g, def.id)
      expect(typeof row.subtitle === 'string' ? row.subtitle : '').toContain(`beat ${year}`)
      const race = row.children(g).find((n) => n.id === `ws.idea.race.${def.id}`)!
      expect(infoText(race, g)).toContain(`by ${year} `)
    }
    expect(raceYear(raced(2.5), def)).toBe(raceYear(raced(null), def)! - 2)
  })
})

describe('reads are pure', () => {
  it('builds the whole Workshop menu on a deep-frozen state and leaves g.rng, g.nextId and g.world alone', () => {
    const g = inventor({ genius: true, year: 2030 })
    for (const d of FIELDED) give(g, d.id, 50)
    withFields(g, { fusion: 4, drug: 2 }, 2030)
    const before = JSON.stringify(g)
    const rng = g.rng
    const nextId = g.nextId
    deepFreeze(g)
    for (const d of FUTURE) {
      raceYear(g, d)
      raceShift(g, d)
      isFirst(g, d)
      raceOpen(g, d, 2035)
    }
    expect(walk(g, workshopMenu.children(g))).toBeGreaterThan(20)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
  })

  it('gives the same number twice and the same deadline to an heir', () => {
    const g = withLead(inventor({ genius: true, year: 2035 }), 'fusion', 3.5, 2035)
    const heir = { ...g, lifeId: `${g.lifeId}-g2` }
    for (const d of FUTURE) {
      expect(raceYear(g, d)).toBe(raceYear(g, d))
      expect(raceYear(heir, d)).toBe(raceYear(g, d))
    }
  })
})
