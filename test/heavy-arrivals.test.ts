// Heavy R&D, the report of the first rival to follow (heavy-rd.ts heavyArrivals). It runs at every
// company's year-end, the NPC companies' too, and an NPC company sees the player's own companies in its
// rival list as 'owned:<id>' (npc-rivals.ts). A player's own company is not a rival launching its own
// version: it must never be reported as the first to follow, and it must never use up the one report.
import { describe, expect, it } from 'vitest'
import { marketCtxFor } from '../src/game/business/economy'
import { BREAKTHROUGHS } from '../src/game/business/heavy-data'
import { addHeavy, heavyArrival, heavyArrivals, readHeavy, type HeavyRecord } from '../src/game/business/heavy-rd'
import { readBiz } from '../src/game/business/state'
import { initializeNpc, npcCompany, startNpcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { Asset, GameState } from '../src/game/types'
import { adult, company, nextYear } from './market-kit'

const TRADE = 'petCare'
const COUNTRY = 'gb'
const PLAYER_CO = 'Pioneer Pets'
const ALL_FAMILIES = Object.values(BREAKTHROUGHS).flat().map((x) => x.name)

/** The player's pioneer and an NPC company in the same trade and country: the NPC's year-end is what reports. */
function world(): { g: GameState; npc: ReturnType<typeof npcCompany> & object; playerId: string } {
  const g = adult(5, 2030, COUNTRY, 1e9)
  const a = company(g, TRADE, { name: PLAYER_CO })
  nextYear(g)
  nextYear(g)
  const friend = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 80_000_000, occupation: 'Engineer', relationship: 90 })
  initializeNpc(g, friend)
  expect(startNpcCompany(g, friend, TRADE)).toBe(true)
  return { g, npc: npcCompany(friend, g.year)!, playerId: a.id }
}

const reported = (g: GameState): string | undefined => readHeavy(g, TRADE, COUNTRY)[0]?.rival
const lines = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))

/** A kind whose development finishes with the player's own company the earliest to be able to follow (the bug's setup). */
function pioneered(): { g: GameState; npc: ReturnType<typeof npcCompany> & object; playerId: string; a: Asset; rec: HeavyRecord } {
  const { g, npc, playerId } = world()
  const a = g.assets.find((x) => x.id === playerId)!
  const rivalsOf = (year: number) => marketCtxFor(g, npc.b, year).rivals
  // The NPC sees the player's company among its rivals.
  expect(rivalsOf(g.year + 1).some((r) => r.id === `owned:${playerId}`)).toBe(true)
  const start = 2030
  const years = 4
  const pick = ALL_FAMILIES.map((family) => ({ family, year: start, years, quality: 80, cost: 3_000_000, by: playerId }) as HeavyRecord).find((r) => {
    const rivals = rivalsOf(start + years)
    let best = -1
    let at = Number.POSITIVE_INFINITY
    rivals.forEach((x, i) => {
      if (x.legacy || !(x.pull > 0)) return
      const when = heavyArrival(r, x)
      if (when < at) {
        at = when
        best = i
      }
    })
    return best >= 0 && rivals[best].id === `owned:${playerId}`
  })
  expect(pick, "this market has a kind the player's own company would be first to follow").toBeDefined()
  addHeavy(g, TRADE, COUNTRY, pick as HeavyRecord)
  return { g, npc, playerId, a, rec: pick as HeavyRecord }
}

describe('the first rival to follow a breakthrough', () => {
  it("is never the player's own company, even when the NPC company's year-end does the reporting", () => {
    const { g, npc, rec } = pioneered()
    // The real first rival: the earliest of every rival that is not the player's own company.
    const real = marketCtxFor(g, npc.b, rec.year + rec.years).rivals.filter((x) => !x.id.startsWith('owned:') && !x.legacy && x.pull > 0)
    const firstAt = Math.min(...real.map((x) => heavyArrival(rec, x)))
    const firsts = real.filter((x) => heavyArrival(rec, x) === firstAt).map((x) => x.name)

    const sawAt: number[] = []
    for (let year = rec.year + rec.years - 1; year <= rec.year + rec.years + 10 && sawAt.length === 0; year++) {
      heavyArrivals(g, npc.b, year)
      if (reported(g) !== undefined) sawAt.push(year)
      // Whoever it is, it isn't the player's own company, and nothing is reported before the first real rival can follow.
      expect(reported(g), `year ${year}`).not.toBe(PLAYER_CO)
      if (year + 1 < firstAt) expect(reported(g), `year ${year}`).toBeUndefined()
    }
    // The real report was not used up by the player's own company: it comes in the year the first real rival can follow.
    expect(sawAt).toEqual([firstAt - 1])
    expect(firsts).toContain(reported(g))
    expect(lines(g).filter((t) => t.includes('launches its own'))).toEqual([`${reported(g)} launches its own ${rec.family}.`])
    expect(lines(g).some((t) => t.includes(PLAYER_CO) && t.includes('launches its own'))).toBe(false)
  })

  it("reports the same rival in the same year whether the player's company or an NPC company's year-end does it", () => {
    const { g, npc, a, rec } = pioneered()
    const byNpc = structuredClone(g)
    const byPlayer = structuredClone(g)
    for (let year = rec.year + rec.years - 1; year <= rec.year + rec.years + 10; year++) {
      heavyArrivals(byNpc, npc.b, year)
      heavyArrivals(byPlayer, readBiz(byPlayer, byPlayer.assets.find((x) => x.id === a.id)!), year)
      expect(reported(byNpc), `year ${year}`).toBe(reported(byPlayer))
    }
    expect(reported(byPlayer)).toBeDefined()
    expect(reported(byPlayer)).not.toBe(PLAYER_CO)
  })
})
