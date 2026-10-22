// R3-Q12 (E.T6): scene variants for the 60 events that fire most (test/fixtures/event-top60.json, written by
// test/event-top-probe.test.ts). A variant is another opening scene for the same popup: the choices, the data and the
// resolvers are never touched, the pick is one draw of the text stream with the text kit's shuffle-bag memory, and g.rng
// is not drawn from. This file pins the data (rules of docs/VOICE.md, tokens, era gates), the wrapper (what it changes
// and what it leaves alone) and the library (every id exists, the order is the old one).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { currentLogYear } from '../src/game/core'
import { EVENT_LIBRARY, eventEligible, foreignToLocale, getEventDef } from '../src/game/events'
import { anachronismsIn, eraOk, eraStrip } from '../src/game/events/era'
import type { EventDef, Setup } from '../src/game/events/helpers'
import { createPerson } from '../src/game/people'
import { prisonLife } from '../src/game/prison'
import { textCursor } from '../src/game/text/draw'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

import { FIXED_TOKENS, fillScene, sceneCandidates, unvaried, variantTable, withVariants } from '../src/game/events/variants'

const VARIANTS = variantTable()

const TOP: string[] = (JSON.parse(readFileSync(join(__dirname, 'fixtures', 'event-top60.json'), 'utf8')) as { top: string[] }).top

// ---------------------------------------------------------------------------
// A lived-in life (the shape of test/events.test.ts richGame, cut to what these 60 events read).

interface Ctx {
  age: number
  seed: number
  alt?: boolean
  year?: number
  country?: string
}

function life(ev: EventDef, o: Ctx): GameState {
  const g = makeTestGame(o.seed, { age: o.age, money: 25_000, gender: 'male' })
  // The text stream is keyed by the life, so a state per seed needs its own life id (as every real life has).
  g.lifeId = `life-${o.seed}`
  const c = g.character
  const age = o.age
  if (age < 75) {
    createPerson(g, { relation: 'parent', age: age + 28, gender: 'female', firstName: 'Linda', livesWithPlayer: age < 18 })
    createPerson(g, { relation: 'parent', age: age + 30, gender: 'male', firstName: 'Brian', livesWithPlayer: age < 18 })
  }
  createPerson(g, { relation: 'sibling', age: Math.max(1, age + 2), gender: 'female', firstName: 'Sophie', livesWithPlayer: age < 18 })
  createPerson(g, { relation: 'friend', age: Math.max(4, age), firstName: 'Marcus' })
  createPerson(g, { relation: 'bestFriend', age: Math.max(4, age), firstName: 'Priya' })
  if (age >= 16) createPerson(g, { relation: age >= 25 ? 'spouse' : 'partner', age, gender: 'female', firstName: 'Maria', livesWithPlayer: age >= 25, relationship: 70 })
  if (age >= 22) createPerson(g, { relation: 'child', age: Math.min(age - 20, 8), firstName: 'Tommy', gender: 'male', livesWithPlayer: true })
  if (age >= 5 && age <= 10) c.education.current = { level: 'elementary', school: 'Maple Elementary', year: 1, totalYears: 4, grades: 60, data: {} }
  else if (age >= 11 && age <= 13) c.education.current = { level: 'middle', school: 'Oak Middle School', year: 1, totalYears: 4, grades: 60, data: {} }
  else if (age >= 14 && age <= 17) c.education.current = { level: 'high', school: 'Central High', year: 1, totalYears: 4, grades: 60, data: {} }
  else if (age >= 18 && age <= 21) c.education.current = { level: 'university', school: 'State University', year: 1, totalYears: 4, grades: 60, data: {} }
  if (age >= 22) c.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Central High', age: 18 })
  if (age >= 18 && age < 65 && !c.education.current) {
    c.job = { defId: 'accountant', title: 'Accountant', company: 'Acme Corp', category: 'fulltime', salary: 55_000, level: 1, performance: 75, yearsInRole: 2, yearsAtCompany: 3, data: {} }
  }
  if (age >= 65) {
    c.retired = true
    c.pension = 20_000
  }
  if (age >= 18) {
    g.assets.push({ id: 'car1', kind: 'car', name: '2015 Honda Civic', emoji: '🚗', purchasePrice: 15_000, value: 9_000, condition: 70, purchasedAge: age - 2, upkeep: 800, details: {} })
  }
  if (age >= 30) {
    g.assets.push({ id: 'house1', kind: 'house', name: '12 Elm Street', emoji: '🏠', purchasePrice: 250_000, value: 300_000, condition: 80, purchasedAge: age - 5, upkeep: 4_000, details: {} })
    c.residence = { status: 'owned', assetId: 'house1' }
  } else if (age >= 18) {
    c.residence = { status: 'renting', rent: 12_000 }
  }
  if (age >= 19) c.education.completed.push('elementary', 'middle', 'high')
  if (o.alt) {
    c.gender = 'female'
    if (age >= 16) c.licenses.push('driver')
  }
  if (ev.where === 'prison') {
    c.prison = { name: 'Blackrock Penitentiary', security: 'medium', crime: 'Burglary', sentenceYears: 8, yearsServed: 1, respect: 40, appealed: false, escapeAttempts: 0 }
    c.residence = { status: 'prison', description: 'Blackrock Penitentiary' }
    c.job = null
    prisonLife(g)
  }
  if (o.year !== undefined) g.year = o.year
  if (o.country !== undefined) c.countryId = o.country
  currentLogYear(g)
  return g
}

/** The first context in which an event can fire and shows a popup, or null. */
function findContext(ev: EventDef): Ctx | null {
  const ages = [...new Set([Math.min(ev.maxAge, Math.max(ev.minAge, 30)), ev.minAge, Math.min(ev.maxAge, ev.minAge + 3), Math.min(ev.maxAge, 70), ev.maxAge])]
  const era = ev.id.startsWith('era.')
  const years = era ? Array.from({ length: 127 }, (_, i) => 2026 - i) : [2026]
  const countries = era ? ['us', 'gb', 'ng', 'br', 'jp', 'in', 'de', 'ru', 'cn'] : ['us']
  for (const age of ages) {
    for (const year of years) {
      for (const country of countries) {
        for (const alt of [false, true]) {
          const c: Ctx = { age, seed: 3, alt, year, country }
          const g = life(ev, c)
          if (eventEligible(g, ev) && ev.setup(g)) return c
        }
      }
    }
  }
  return null
}

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)

/** The closing question of a text: its last sentence, cut to its first three words (a branch may end "spend it" or "spend the day"). */
function closer(text: string): string {
  const m = /(?:^|[.!?]["']?\s+)([^.!?]*\?)$/.exec(text)
  return (m ? m[1] : text).split(' ').slice(0, 3).join(' ')
}

const known = new Set<string>(FIXED_TOKENS)

// ---------------------------------------------------------------------------

describe('the 60 events and their scenes (the data)', () => {
  it('the probe fixture lists 60 distinct events that exist, and exactly those have scenes', () => {
    expect(TOP.length).toBe(60)
    expect(new Set(TOP).size).toBe(60)
    for (const id of TOP) expect(getEventDef(id), id).toBeDefined()
    expect(Object.keys(VARIANTS).sort()).toEqual([...TOP].sort())
  })

  it('every event has at least two scenes, all different, none longer than the scene cap', () => {
    for (const id of TOP) {
      const spec = VARIANTS[id]
      expect(spec.scenes.length, id).toBeGreaterThanOrEqual(2)
      expect(spec.scenes.length, id).toBeLessThanOrEqual(10)
      const seen = new Set<string>()
      for (const raw of spec.scenes) {
        const scene = eraStrip(raw)
        expect(seen.has(raw), `${id}: ${raw} twice`).toBe(false)
        seen.add(raw)
        expect(scene.length, `${id}: ${scene}`).toBeLessThanOrEqual(140)
        // The guide's scene rules: the cap, contractions, no verdict tails, no chatbot openers, no dashes.
        const bad = unitFlags(raw, 'scene').filter((f) => f !== 'over-aim')
        expect(bad, `${id}: ${raw}`).toEqual([])
        expect(raw, id).not.toMatch(/[\u2013\u2014]/)
        expect(scene, id).toMatch(/\?$/)
        expect(scene, id).toMatch(/^[A-Z{"]/)
        // A gate is the only thing that may start with @.
        expect(raw.replace(/^@[\w!+,-]+ /, ''), id).not.toContain('@')
      }
    }
  })

  it('a scene uses only the known tokens, and states every fact of its event', () => {
    for (const id of TOP) {
      const spec = VARIANTS[id]
      const allowed = new Set<string>([...known, ...(spec.facts ?? [])])
      for (const raw of spec.scenes) {
        const used = [...raw.matchAll(/\{([A-Za-z]\w*)(?:\|lc)?\}/g)].map((m) => m[1])
        for (const t of used) expect(allowed.has(t), `${id}: {${t}} in ${raw}`).toBe(true)
        // No brace is left outside a token.
        expect(raw.replace(/\{[A-Za-z]\w*(?:\|lc)?\}/g, ''), `${id}: ${raw}`).not.toMatch(/[{}]/)
        for (const f of spec.facts ?? []) expect(used, `${id}: ${raw} misses {${f}}`).toContain(f)
      }
    }
  })

  it('no scene paints a scene that only fits the United States', () => {
    const g = makeTestGame(1, { age: 30 })
    g.character.countryId = 'jp'
    for (const id of TOP) {
      for (const raw of VARIANTS[id].scenes) {
        const text = eraStrip(raw)
        expect(foreignToLocale(g, text, 'jp'), `${id}: ${text}`).toBe(false)
        expect(foreignToLocale(g, text, 'de'), `${id}: ${text}`).toBe(false)
      }
    }
  })
})

describe('fillScene (the tokens)', () => {
  const pal = (extra: Partial<Setup> = {}): Setup => ({ text: 'orig', choices: [], ...extra })
  const sis = { id: 'p1', firstName: 'Sophie', gender: 'female', relation: 'sibling' } as never
  const bro = { id: 'p2', firstName: 'Leo', gender: 'male', relation: 'sibling' } as never

  it('fills the person, the pronouns, the other person and the relation', () => {
    const s = pal({ person: sis, other: bro })
    expect(fillScene('{p} and {q}: {he}, {his}, {him}, {He}, {His}', s, {}, 'T')).toBe('Sophie and Leo: she, her, her, She, Her')
    expect(fillScene('Your {rel} {p}.', s, {}, 'T')).toBe('Your sister Sophie.')
  })

  it('writes money with the money helper and takes the amount from the key the event names', () => {
    expect(fillScene('Cost {amt}.', pal({ data: { amt: 1500 } }), {}, 'T')).toBe('Cost $1,500.')
    expect(fillScene('Cost {amt}.', pal({ data: { cash: 80 } }), { amt: 'cash' }, 'T')).toBe('Cost $80.')
  })

  it('fills data keys as text or numbers, with an optional lower case', () => {
    const s = pal({ data: { first: 'Dana', days: 7, species: 'Dog' } })
    expect(fillScene('{first} waits {days} days. A {species|lc}.', s, {}, 'T')).toBe('Dana waits 7 days. A dog.')
  })

  it('gives the title token the setup title, else the event title', () => {
    expect(fillScene('{title}!', pal({ title: 'Chess' }), {}, 'Fallback')).toBe('Chess!')
    expect(fillScene('{title}!', pal(), {}, 'Fallback')).toBe('Fallback!')
  })

  it('returns null when a token cannot be filled, so the scene is not used', () => {
    expect(fillScene('{p} waves.', pal(), {}, 'T')).toBeNull()
    expect(fillScene('{he} waves.', pal(), {}, 'T')).toBeNull()
    expect(fillScene('Cost {amt}.', pal({ data: { amt: Number.NaN } }), {}, 'T')).toBeNull()
    expect(fillScene('Cost {amt}.', pal(), {}, 'T')).toBeNull()
    expect(fillScene('{nope}.', pal({ data: { first: 'x' } }), {}, 'T')).toBeNull()
    expect(fillScene('{first}.', pal({ data: { first: '' } }), {}, 'T')).toBeNull()
  })
})

describe('the wrapper', () => {
  it('keeps the library: unique ids, the same ids in the same order, every def still has its resolvers', () => {
    const ids = EVENT_LIBRARY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(EVENT_LIBRARY.length).toBeGreaterThanOrEqual(372)
    // Wrapping the unwrapped list again gives the same ids in the same order.
    expect(withVariants(EVENT_LIBRARY.map(unvaried)).map((e) => e.id)).toEqual(ids)
    for (const id of TOP) {
      const ev = getEventDef(id)!
      const base = unvaried(ev)
      expect(base).not.toBe(ev)
      expect(Object.keys(ev.resolve)).toEqual(Object.keys(base.resolve))
      expect(ev.minAge).toBe(base.minAge)
      expect(ev.maxAge).toBe(base.maxAge)
    }
    // An event without scenes is the very same object.
    const plain = EVENT_LIBRARY.find((e) => !VARIANTS[e.id])!
    expect(unvaried(plain)).toBe(plain)
  })

  it('withVariants is a no-op for a list without scenes', () => {
    const def: EventDef = { id: 'test.none', emoji: '🧪', title: 'T', minAge: 0, maxAge: 9, setup: () => ({ text: 'x?', choices: [] }), resolve: {} }
    const [out] = withVariants([def])
    expect(out).toBe(def)
  })

  for (const id of TOP) {
    it(`${id}: choices, data, people, title and emoji are the original's; the text is the original or a scene; g.rng is not drawn from`, () => {
      const ev = getEventDef(id)!
      const base = unvaried(ev)
      const c = findContext(base)
      expect(c, `${id} never fires in any tested context`).not.toBeNull()
      const texts = new Set<string>()
      let varied = 0
      let tried = 0
      for (const seed of SEEDS) {
        const a = life(base, { ...c!, seed })
        if (!eventEligible(a, base)) continue
        const b = structuredClone(a)
        const sa = base.setup(a)
        const sb = ev.setup(b)
        if (!sa || !sb) continue
        tried++
        expect(sb.choices, id).toEqual(sa.choices)
        expect(sb.data, id).toEqual(sa.data)
        expect(sb.person?.id, id).toBe(sa.person?.id)
        expect(sb.other?.id, id).toBe(sa.other?.id)
        expect(sb.title, id).toBe(sa.title)
        expect(sb.emoji, id).toBe(sa.emoji)
        // g.rng is exactly where the original left it: the pick is a text draw.
        expect(b.rng, id).toBe(a.rng)
        const options = sceneCandidates(b, base, sa)
        expect([sa.text, ...options], `${id}: ${sb.text}`).toContain(sb.text)
        expect(sb.text, id).not.toMatch(/undefined|NaN|\[object|[{}@]/)
        expect(closer(sb.text), id).toBe(closer(sa.text))
        expect(anachronismsIn(sb.text, b.year, [b.character.countryId]), `${id}: ${sb.text}`).toEqual([])
        if (sb.text !== sa.text) varied++
        texts.add(sb.text)
      }
      expect(tried, id).toBeGreaterThanOrEqual(20)
      // 30 seeded lives read at least three different openings, and a scene does get used.
      expect(texts.size, `${id}: ${[...texts].join(' | ')}`).toBeGreaterThanOrEqual(3)
      expect(varied, id).toBeGreaterThan(0)
    })
  }

  it('a scene is drawn from the text stream: the cursor moves, the rng does not', () => {
    const ev = getEventDef('adult.powerOutage')!
    const g = life(unvaried(ev), { age: 30, seed: 5 })
    const rng = g.rng
    const before = textCursor(g).n
    ev.setup(g)
    expect(g.rng).toBe(rng)
    expect(textCursor(g).n).toBe(before + 1)
  })

  it('the pool has a stable key: an event with a constant text runs through every opening before one repeats', () => {
    const ev = getEventDef('adult.powerOutage')!
    const base = unvaried(ev)
    const g = life(base, { age: 30, seed: 9 })
    const pool = 1 + VARIANTS['adult.powerOutage'].scenes.length
    const seen: string[] = []
    for (let i = 0; i < pool; i++) seen.push(ev.setup(g)!.text)
    expect(new Set(seen).size).toBe(pool)
    // A pool of this size is a bag: the next round starts again without the last one dealt.
    expect(ev.setup(g)!.text).not.toBe(seen[pool - 1])
  })

  it('the memory key does not depend on the person: the same event with another name still uses one pool', () => {
    const ev = getEventDef('friend.advice')!
    const base = unvaried(ev)
    const g = life(base, { age: 30, seed: 4 })
    const keys = () => Object.keys((g.flags.textMem as { p?: Record<string, string> } | undefined)?.p ?? {})
    for (let i = 0; i < 12; i++) ev.setup(g)
    // The original text holds the friend's name, so a pool keyed by its lines would be a new pool per name.
    expect(keys().filter((k) => /^s[0-9a-f]{8}$/.test(k)).length).toBe(1)
    expect(keys().length).toBeLessThanOrEqual(3)
  })

  it('every context where an event can fire has at least two scenes to choose from, and the gates hold the anachronisms back', () => {
    const years = [1905, 1925, 1945, 1965, 1985, 1995, 2005, 2015, 2026]
    const countries = ['us', 'ng', 'jp']
    const thin: string[] = []
    const dropped: string[] = []
    const checked = new Set<string>()
    for (const id of TOP) {
      const ev = getEventDef(id)!
      const base = unvaried(ev)
      const spec = VARIANTS[id]
      for (const year of years) {
        for (const country of countries) {
          for (const age of [Math.min(base.maxAge, Math.max(base.minAge, 30)), base.minAge, base.maxAge]) {
            const g = life(base, { age, seed: 3, year, country })
            if (!eventEligible(g, base)) continue
            const s = base.setup(g)
            if (!s) continue
            const usable = sceneCandidates(g, base, s)
            checked.add(id)
            if (usable.length < 2) thin.push(`${id} ${year} ${country} age ${age}: ${usable.length}`)
            // A scene whose gate holds and whose tokens fill must not be thrown out as anachronistic.
            for (const raw of spec.scenes) {
              if (!eraOk(g, raw)) continue
              const text = fillScene(eraStrip(raw), s, spec, base.title)
              if (text !== null && anachronismsIn(text, year, [country]).length) dropped.push(`${id} ${year} ${country}: ${text}`)
            }
          }
        }
      }
    }
    expect(dropped).toEqual([])
    expect(thin).toEqual([])
    // Not vacuous: every one of the 60 was met in at least one era and country of the grid.
    expect([...checked].sort()).toEqual([...TOP].sort())
  })
})

describe('the source files', () => {
  it('hold no em-dash and no en-dash', () => {
    for (const f of ['variants.ts', 'variants-data-a.ts', 'variants-data-b.ts']) {
      const text = readFileSync(join(__dirname, '..', 'src', 'game', 'events', f), 'utf8')
      expect(text, f).not.toMatch(/[\u2013\u2014]/)
    }
  })
})
