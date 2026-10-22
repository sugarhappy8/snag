// probeLife is the seeded, reproducible "big save" the save-safety work measures and tests against.
import { describe, expect, it } from 'vitest'
import { businessAssets } from '../src/game/business/state'
import { economyState } from '../src/game/economy/model'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'

describe('probeLife', () => {
  it('builds an adult with the requested companies and a populated previous-year economy', () => {
    const seed = findSeed((s) => probeLife({ seed: s, birthYear: 1996, businesses: 2, years: 3 }).character.alive, { label: 'a founder born in 1996 who is alive three years into two companies' })
    const g = probeLife({ seed, birthYear: 1996, businesses: 2, years: 3 })
    expect(g.character.alive).toBe(true)
    expect(businessAssets(g)).toHaveLength(2)
    // R2-S10 (A.K9): populated means the countries a reader can name, not all 102. The founder lives in one country, so the
    // residence is there and the count is far under the 40 that the focus allows. (The title is the name moved-seeds.md row 11 holds.)
    const previous = Object.keys(economyState(g)!.previous)
    expect(previous).toContain(g.character.countryId)
    expect(previous.length).toBeLessThanOrEqual(40)
  })

  // The search plays one ten-year life per seed it tries (about 0.2 s each) and a death by illness is rare, so it can take
  // a few dozen lives: the file's timeout is raised for it.
  it('keepAlive carries a founder past the untreated illness that kills them without it', { timeout: 120_000 }, () => {
    // The seed is found, not pinned: one whose founder falls ill and, with no doctor, dies of that illness within the ten
    // years, and who lives through the same ten years when keepAlive puts their health back every year. A seed is only good
    // for one version of the yearly rng stream, so the search finds a fresh one whenever a release adds yearly draws.
    const base = { birthYear: 1926, businesses: 2, years: 10 }
    const seed = findSeed(
      (s) => {
        const dead = probeLife({ ...base, seed: s }).character
        return !dead.alive && dead.conditions.some((c) => c.name === dead.causeOfDeath) && probeLife({ ...base, seed: s, keepAlive: true }).character.alive
      },
      { label: 'a founder born in 1926 who dies of an untreated illness within ten years and lives with keepAlive' },
    )
    const life = { ...base, seed }
    expect(probeLife(life).character.alive).toBe(false)
    const g = probeLife({ ...life, keepAlive: true })
    expect(g.character.alive).toBe(true)
    expect(g.character.stats.health).toBeGreaterThan(90)
    expect(g.character.conditions.filter((c) => c.age < g.character.age)).toEqual([])
  })
})
