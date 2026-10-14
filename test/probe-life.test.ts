// probeLife is the seeded, reproducible "big save" the save-safety work measures and tests against.
import { describe, expect, it } from 'vitest'
import { businessAssets } from '../src/game/business/state'
import { economyState } from '../src/game/economy/model'
import { probeLife } from './probe-life'

describe('probeLife', () => {
  it('builds an adult with the requested companies and a populated previous-year economy', () => {
    const g = probeLife({ seed: 7, birthYear: 1996, businesses: 2, years: 3 })
    expect(g.character.alive).toBe(true)
    expect(businessAssets(g)).toHaveLength(2)
    expect(Object.keys(economyState(g)!.previous).length).toBeGreaterThan(100)
  })

  it('keepAlive carries a founder past the untreated illness that kills them without it', () => {
    // Seed 8 gets appendicitis at 35 and, with no doctor, dies of it at 39.
    const life = { seed: 8, birthYear: 1926, businesses: 2, years: 10 }
    expect(probeLife(life).character.alive).toBe(false)
    const g = probeLife({ ...life, keepAlive: true })
    expect(g.character.alive).toBe(true)
    expect(g.character.stats.health).toBeGreaterThan(90)
    expect(g.character.conditions.filter((c) => c.age < g.character.age)).toEqual([])
  })
})
