import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { authorMut, authorView } from '../src/game/special/author-state'
import { gdMut, gdView } from '../src/game/special/gamedev-state'
import { luxuryLifestyleMenu } from '../src/game/shops/luxury'
import {
  attendLuxuryExperience,
  LUXURY_EXPERIENCES,
  LUXURY_EXPERIENCES_PER_YEAR,
  luxuryExperiencePrice,
  luxuryExperiencesMenu,
} from '../src/game/shops/luxury-pamper'
import type { GameState, Json, MenuAction } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 42, money: 10_000_000, countryId: 'us', city: 'Chicago' })
  g.log = [{ age: 42, year: g.year, entries: [] }]
  return g
}

function experience(id: (typeof LUXURY_EXPERIENCES)[number]['id']) {
  const found = LUXURY_EXPERIENCES.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing ${id}`)
  return found
}

function action(g: GameState, id: string): MenuAction {
  const node = luxuryExperiencesMenu.children(g).find((candidate) => candidate.id === `lux-experience-${id}`)
  if (!node || node.type !== 'action') throw new Error(`missing action ${id}`)
  return node
}

function concierge(g: GameState): void {
  g.flags['luxury.staff'] = {
    concierge: { name: 'Casey Concierge', gender: 'female', hiredAge: g.character.age, skill: 1, quirk: 'knows everyone' },
  } as Json
}

describe('bespoke luxury experiences', () => {
  it('is wired into Luxury Lifestyle with real action rows', () => {
    const g = game()
    expect(luxuryLifestyleMenu.children(g).map((node) => node.id)).toContain('luxuryExperiences')
    expect(luxuryExperiencesMenu.children(g).map((node) => node.id)).toEqual([
      'lux-experience-familyRetreat',
      'lux-experience-patronSalon',
      'lux-experience-learningSabbatical',
    ])
  })

  it('makes the concierge discount every experience by a visible 15%', () => {
    const g = game(2)
    for (const entry of LUXURY_EXPERIENCES) {
      const full = luxuryExperiencePrice(g, entry)
      concierge(g)
      const reduced = luxuryExperiencePrice(g, entry)
      expect(reduced).toBeLessThan(full)
      expect(reduced / full).toBeCloseTo(.85, 1)
      delete g.flags['luxury.staff']
    }
    concierge(g)
    const subtitle = action(g, 'learningSabbatical').subtitle
    expect(typeof subtitle === 'function' ? subtitle(g) : subtitle).toMatch(/concierge rate/i)
    expect(luxuryExperiencesMenu.header?.(g)).toMatch(/15%/)
  })

  it('turns a family retreat into stronger relationships, not just flavor text', () => {
    const g = game(3)
    const child = createPerson(g, { relation: 'child', age: 18, relationship: 40 })
    const parent = createPerson(g, { relation: 'parent', age: 68, relationship: 55 })
    const friend = createPerson(g, { relation: 'friend', age: 40, relationship: 50 })
    const price = luxuryExperiencePrice(g, experience('familyRetreat'))
    const money = g.character.money
    expect(attendLuxuryExperience(g, 'familyRetreat')).toBe(true)
    expect(g.character.money).toBe(money - price)
    expect(child.relationship).toBeGreaterThan(40)
    expect(parent.relationship).toBeGreaterThan(55)
    expect(friend.relationship).toBe(50)
    expect(g.counters.familyRetreats).toBe(1)
  })

  it('revalidates a stale retreat after the last family member is gone', () => {
    const g = game(4)
    const child = createPerson(g, { relation: 'child', age: 22 })
    const stale = action(g, 'familyRetreat')
    child.alive = false
    const money = g.character.money
    const rng = g.rng
    stale.run(g)
    expect(g.character.money).toBe(money)
    expect(g.rng).toBe(rng)
    expect(g.yearActions['luxury.experience']).toBeUndefined()
  })

  it('makes a patron salon strengthen friends and add one actual network contact', () => {
    const g = game(5)
    const oldFriend = createPerson(g, { relation: 'friend', age: 41, relationship: 45 })
    const beforeIds = new Set(g.people.map((person) => person.id))
    expect(attendLuxuryExperience(g, 'patronSalon')).toBe(true)
    expect(oldFriend.relationship).toBeGreaterThan(45)
    const newcomer = g.people.find((person) => !beforeIds.has(person.id))
    expect(newcomer).toMatchObject({ relation: 'friend', alive: true })
    expect(newcomer?.data.metAt).toBe('a private patron salon')
    expect(g.counters.patronSalons).toBe(1)
  })

  it('makes a learning sabbatical improve smarts and recover existing creative burnout', () => {
    const g = game(6)
    const author = authorMut(g)
    author.burnout = 65
    const developer = gdMut(g)
    developer.burnout = 48
    const smarts = g.character.stats.smarts
    expect(attendLuxuryExperience(g, 'learningSabbatical')).toBe(true)
    expect(g.character.stats.smarts).toBeGreaterThan(smarts)
    expect(authorView(g).burnout).toBe(45)
    expect(gdView(g).burnout).toBe(28)
    expect(g.counters.learningSabbaticals).toBe(1)
  })

  it('shares a finite two-booking annual cap across all experiences', () => {
    const g = game(7)
    createPerson(g, { relation: 'sibling', age: 40 })
    expect(attendLuxuryExperience(g, 'familyRetreat')).toBe(true)
    expect(attendLuxuryExperience(g, 'patronSalon')).toBe(true)
    expect(g.yearActions['luxury.experience']).toBe(LUXURY_EXPERIENCES_PER_YEAR)
    const money = g.character.money
    const rng = g.rng
    expect(attendLuxuryExperience(g, 'learningSabbatical')).toBe(false)
    expect(g.character.money).toBe(money)
    expect(g.rng).toBe(rng)
  })

  it('enforces adulthood, prison, wealth, cash, and valid experience IDs before spending', () => {
    for (const mode of ['minor', 'prison', 'poor', 'illiquid'] as const) {
      const g = game(8)
      if (mode === 'minor') g.character.age = 17
      if (mode === 'prison') g.character.prison = {} as never
      if (mode === 'poor') g.character.money = 10
      if (mode === 'illiquid') {
        g.character.money = 10
        g.assets.push({ id: 'home', kind: 'house', name: 'Estate', emoji: '🏡', purchasePrice: 10_000_000, value: 10_000_000, condition: 100, purchasedAge: 40, upkeep: 0, details: {} })
      }
      const before = g.character.money
      expect(attendLuxuryExperience(g, 'learningSabbatical')).toBe(false)
      expect(g.character.money).toBe(before)
      expect(g.yearActions['luxury.experience']).toBeUndefined()
    }
    const g = game(9)
    const before = JSON.stringify(g)
    expect(attendLuxuryExperience(g, 'fake' as never)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })
})
