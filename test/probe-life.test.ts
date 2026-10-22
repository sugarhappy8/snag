// probeLife is the seeded, reproducible "big save" the save-safety work measures and tests against.
import { describe, expect, it } from 'vitest'
import { businessAssets } from '../src/game/business/state'
import { economyState } from '../src/game/economy/model'
import { probeLife } from './probe-life'

describe('probeLife', () => {
  it('builds an adult with the requested companies and a previous-year economy for its own countries', () => {
    const g = probeLife({ seed: 7, birthYear: 1996, businesses: 2, years: 3 })
    expect(g.character.alive).toBe(true)
    expect(businessAssets(g)).toHaveLength(2)
    // R2-S10 (A.K9): last year's frame is kept for the countries a reader can name, not for all 102. The founder lives in one
    // country, so the residence is there and the count is far under the 40 that the focus allows.
    const previous = Object.keys(economyState(g)!.previous)
    expect(previous).toContain(g.character.countryId)
    expect(previous.length).toBeLessThanOrEqual(40)
  })

  it('keepAlive carries a founder past the untreated illness that kills them without it', () => {
    // Seed 226 gets appendicitis at 32 and, with no doctor, dies of it at 35. A seed is only good for one version of the yearly rng
    // stream: when a release adds yearly draws, rescan for one that still dies without keepAlive and lives with it.
    const life = { seed: 226, birthYear: 1926, businesses: 2, years: 10 }
    expect(probeLife(life).character.alive).toBe(false)
    const g = probeLife({ ...life, keepAlive: true })
    expect(g.character.alive).toBe(true)
    expect(g.character.stats.health).toBeGreaterThan(90)
    expect(g.character.conditions.filter((c) => c.age < g.character.age)).toEqual([])
  })
})
