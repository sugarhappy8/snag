import { describe, expect, it } from 'vitest'
import { createNewLife, type NewLifeOptions } from '../src/game/life'
import { initializeRoyalBirth, royalStatus } from '../src/game/royalty'
import { nextRandom } from '../src/game/rng'

describe('chosen royal births', () => {
  it.each([['gb', 2026], ['jp', 1950], ['ae', 2026], ['kr', 1905], ['np', 2007]] as const)('guarantees an eligible royal family in %s in %s', (countryId, year) => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = createNewLife({ seed, countryId, year, royalty: 'royal' })
      const royal = royalStatus(g)
      expect(royal, `seed ${seed}`).not.toBeNull()
      expect(royal!.status).toBe('active')
      expect(g.people.some(p => p.id === royal!.parentId && p.relation === 'parent' && !p.data.adoptive)).toBe(true)
      expect(g.character.money).toBe(0)
      expect(royalStatus(JSON.parse(JSON.stringify(g)))).toEqual(royal)
    }
  })

  it.each([['us', 2026], ['kr', 1950], ['np', 2008], ['es', 1940]] as const)('cannot bypass country/year eligibility in %s in %s', (countryId, year) => {
    const opts = { seed: 42, countryId, year }
    expect(createNewLife({ ...opts, royalty: 'royal' })).toEqual(createNewLife(opts))
  })

  it('keeps the wealth roll independent of a royal choice, including unusual family seeds', () => {
    let incompatibleFamilies = 0
    const tiers = new Set<unknown>()
    for (let seed = 1; seed <= 50; seed++) {
      const opts = { seed, countryId: 'gb', year: 2026 }
      const random = createNewLife(opts), royal = createNewLife({ ...opts, royalty: 'royal' })
      if (!random.people.some(p => p.relation === 'parent' && p.gender === 'male' && !p.data.adoptive)) incompatibleFamilies++
      expect(royalStatus(royal)).not.toBeNull()
      expect(royal.flags.birthBackground).toBe(random.flags.birthBackground)
      tiers.add(royal.flags.birthBackground)
    }
    expect(incompatibleFamilies).toBeGreaterThan(0)
    expect(tiers.size).toBeGreaterThan(3)
  })

  it('preserves default seeded generation and makes chosen royal lives deterministic', () => {
    const opts = { seed: 87, countryId: 'jp', year: 2026 }
    expect(createNewLife({ ...opts, royalty: 'random' })).toEqual(createNewLife(opts))
    expect(createNewLife({ ...opts, royalty: 'royal' })).toEqual(createNewLife({ ...opts, royalty: 'royal' }))
  })

  it('can opt out even on a seed that would win the rare royal roll', () => {
    const g = createNewLife({ seed: 87, countryId: 'gb', year: 2026, royalty: 'royal' })
    delete g.flags.royalty
    let rare = 0
    while (nextRandom(rare)[0] >= .0001) rare++
    g.rng = rare
    const same = structuredClone(g)
    expect(initializeRoyalBirth(g, 'nonRoyal')).toBe(false)
    expect(royalStatus(g)).toBeNull()
    expect(initializeRoyalBirth(same)).toBe(true)
  })

  it('does not expose a wealth override through birth options', () => {
    const opts: NewLifeOptions = { seed: 6, countryId: 'gb', year: 2026, royalty: 'nonRoyal' }
    const forged = { ...opts, wealth: 'billionaire', birthBackground: 7 } as NewLifeOptions
    expect(createNewLife(forged)).toEqual(createNewLife(opts))
  })
})
