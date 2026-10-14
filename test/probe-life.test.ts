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
})
