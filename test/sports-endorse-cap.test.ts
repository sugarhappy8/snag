// R0-7: endorsement deals and Olympic medal bonuses read the year, the country and the brand.
// A deal never tops 40 typical local incomes per point of the brand's fame; the committee's medal
// bonus (a table of today's dollars) is paid in the dollars of the year of the Games.
import { describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { typicalIncome } from '../src/game/events/wealth-core'
import { realWealthFactor } from '../src/game/history/events-people'
import { runScript } from '../src/game/scripts'
import '../src/game/special/sports'
import { dealCeiling, sponsorCall, sportsProfile, tidy, yearlySponsors } from '../src/game/special/sports-core'
import type { GameState, Json, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

function star(year: number, countryId: string, seed: number): GameState {
  const g = makeTestGame(seed, { age: 27, countryId })
  g.year = year
  g.log = [{ age: 27, year, entries: [] }]
  g.character.hidden.fame = 100
  sportsProfile(g).buzz = 100
  return g
}

/** Answer every queued choice with `choice` (notices are just dropped). */
function answer(g: GameState, choice: string): void {
  for (let guard = 0; g.queue.length && guard < 50; guard++) {
    const m = g.queue.shift()!
    if (m.kind === 'choice') runScript(g, m.scriptId!, choice, m.data, m)
  }
}

/**
 * Several registry records can share a name (a rival firm, a regional branch), so the bound used
 * here is the best known one of that name: never lower than the brand the offer came from.
 */
const fameOf = (brand: string): number => {
  const fames = allBrands().filter((b) => b.name === brand).map((b) => b.fame ?? 5)
  return fames.length ? Math.max(...fames) : 5
}

/** The ceiling, worked out here from the rule in the task rather than through the function under test. */
const ceilingFor = (g: GameState, brand: string): number => typicalIncome(g) * 40 * fameOf(brand)

interface Offer {
  brand: string
  yearly: number
}

const offerOf = (g: GameState): Offer => (g.queue.find((m) => m.kind === 'choice') as unknown as { data: Offer }).data

const YEARS = [1930, 1975, 2026]
const COUNTRIES = ['us', 'ng', 'de']
const SEEDS = 200

describe('R0-7: endorsement deals have a ceiling', () => {
  it('names the ceiling: 40 typical incomes per point of brand fame', () => {
    const us26 = star(2026, 'us', 1)
    expect(dealCeiling(us26, { fame: 1 })).toBe(1_800_000)
    expect(dealCeiling(us26, { fame: 10 })).toBe(18_000_000)
    const us30 = star(1930, 'us', 1)
    expect(dealCeiling(us30, { fame: 1 })).toBe(540_000)
    expect(dealCeiling(us30, { fame: 10 })).toBe(5_400_000)
    expect(dealCeiling(us30, undefined)).toBe(typicalIncome(us30) * 40 * 5)
  })

  it('no offer tops the ceiling for its brand, year and country', () => {
    const biggest: Record<string, number> = {}
    const seen: Record<string, number> = {}
    for (const year of YEARS) {
      for (const cid of COUNTRIES) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const g = star(year, cid, seed)
          if (!sponsorCall(g, 'Tennis', 1.2, true)) continue
          const o = offerOf(g)
          const key = `${year}/${cid}`
          seen[key] = (seen[key] ?? 0) + 1
          biggest[key] = Math.max(biggest[key] ?? 0, o.yearly)
          expect(o.yearly, `${key} seed ${seed} ${o.brand}`).toBeLessThanOrEqual(ceilingFor(g, o.brand))
        }
      }
    }
    // The cases the plan names must really have offers, or the loop above proves nothing.
    for (const key of ['1930/us', '1975/us', '2026/us', '2026/de', '1975/de']) expect(seen[key] ?? 0, key).toBeGreaterThan(20)
    expect(Math.max(...Object.keys(seen).filter((k) => k.endsWith('/ng')).map((k) => seen[k]), 0)).toBeGreaterThan(0)
    // 1930 is at most $5.4M a year, whatever the brand.
    expect(biggest['1930/us']).toBeLessThanOrEqual(5_400_000)
  })

  it('a haggled deal is capped too, and the best modern deals still pay in full', () => {
    let modernBest = 0
    let pastBest = 0
    let signed = 0
    for (const year of YEARS) {
      for (const cid of COUNTRIES) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const g = star(year, cid, seed)
          if (!sponsorCall(g, 'Tennis', 1.2, true)) continue
          answer(g, 'haggle')
          const deals = sportsProfile(g).sponsors
          if (!deals.length) continue
          signed++
          const d = deals[0]
          expect(d.yearly, `${year}/${cid} seed ${seed} ${d.brand}`).toBeLessThanOrEqual(ceilingFor(g, d.brand))
          if (year === 2026 && cid === 'us') modernBest = Math.max(modernBest, d.yearly)
          if (year === 1930 && cid === 'us') pastBest = Math.max(pastBest, d.yearly)
        }
      }
    }
    expect(signed).toBeGreaterThan(100)
    expect(modernBest).toBeGreaterThanOrEqual(10_000_000)
    expect(pastBest).toBeLessThanOrEqual(5_400_000)
  })

  it('a plain accept in 2026 for the US keeps the offer as quoted', () => {
    let best = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = star(2026, 'us', seed)
      if (!sponsorCall(g, 'Tennis', 1.2, true)) continue
      const quoted = offerOf(g).yearly
      answer(g, 'accept')
      const d = sportsProfile(g).sponsors[0]
      expect(d.yearly).toBe(quoted)
      best = Math.max(best, d.yearly)
    }
    expect(best).toBeGreaterThanOrEqual(5_000_000)
  })

  it('a renewal is capped', () => {
    let renewed = 0
    for (const [year, cid] of [[1930, 'us'], [2026, 'us'], [1975, 'ng']] as const) {
      const famous = allBrands().filter((b) => b.fame === 10)
      for (let seed = 1; seed <= 60; seed++) {
        const g = star(year, cid, seed)
        const brand = famous[seed % famous.length].name
        const ceiling = typicalIncome(g) * 40 * 10
        const p = sportsProfile(g)
        // A deal signed right at the ceiling, up for renewal, from a star at fame 100.
        p.sponsors.push({ brand, product: 'drinks', yearly: ceiling, yearsLeft: 1, sinceAge: 20 })
        g.character.job = null
        yearlySponsors(g, 'Tennis', 1.2)
        const again = sportsProfile(g).sponsors.find((d) => d.brand === brand)
        if (!again) continue
        renewed++
        expect(again.yearly, `${year}/${cid} seed ${seed} ${brand}`).toBeLessThanOrEqual(ceiling)
      }
    }
    expect(renewed).toBeGreaterThan(30)
  })
})

describe('R0-7: Olympic medal bonuses are paid in the dollars of the year', () => {
  const NO_MODAL = {} as ModalItem
  const entry = (rating: number) => ({ sport: 'Swimming', event: 'Swimming', rating, team: false, squad: 0 })

  /** One final in `year` for a swimmer from `cid`: the medal won and the bonus that landed. */
  function final(year: number, cid: string, seed: number, rating = 100): { medal: string | null; paid: number } {
    const g = star(year, cid, seed)
    g.character.money = 0
    g.flags.taxableIncome = 0
    runScript(g, 'sports.olympics.final', 'gold', { year, entry: entry(rating) } as unknown as Json, NO_MODAL)
    const medals = sportsProfile(g).medals
    return { medal: medals.length ? medals[medals.length - 1].medal : null, paid: g.character.money }
  }

  const SHARE = { gold: 1, silver: 0.5, bronze: 0.33 }

  it('1932 pays the table in 1932 dollars: the US at most $11,800, Singapore at most $229,000', () => {
    expect(tidy(38_000 * realWealthFactor(1932))).toBe(11_800)
    expect(tidy(740_000 * realWealthFactor(1932))).toBe(229_000)
    let golds = 0
    for (let seed = 1; seed <= 60; seed++) {
      const us = final(1932, 'us', seed)
      if (us.medal === 'gold') {
        golds++
        expect(us.paid, `us seed ${seed}`).toBeLessThanOrEqual(11_800)
        expect(us.paid, `us seed ${seed}`).toBe(11_800)
      }
      const sg = final(1932, 'sg', seed)
      if (sg.medal === 'gold') {
        expect(sg.paid, `sg seed ${seed}`).toBeLessThanOrEqual(229_000)
        expect(sg.paid, `sg seed ${seed}`).toBe(229_000)
      }
    }
    expect(golds).toBeGreaterThan(10)
  })

  it('2028 still pays $38,000 for a US gold; silver is half and bronze a third', () => {
    const seen: Record<string, number> = { gold: 0, silver: 0, bronze: 0 }
    for (let seed = 1; seed <= 120; seed++) {
      const r = final(2028, 'us', seed, 60 + (seed % 40))
      if (!r.medal) continue
      seen[r.medal]++
      expect(r.paid, `seed ${seed} ${r.medal}`).toBe(tidy(38_000 * SHARE[r.medal as keyof typeof SHARE]))
    }
    expect(tidy(38_000 * SHARE.gold)).toBe(38_000)
    expect(tidy(38_000 * SHARE.silver)).toBe(19_000)
    expect(seen.gold).toBeGreaterThan(0)
    expect(seen.silver).toBeGreaterThan(0)
    expect(seen.bronze).toBeGreaterThan(0)
  })

  it('a mid-century medal is read in that year: 1975 Singapore bronze', () => {
    let bronze = 0
    for (let seed = 1; seed <= 150 && bronze < 3; seed++) {
      const r = final(1975, 'sg', seed, 60 + (seed % 40))
      if (!r.medal) continue
      expect(r.paid, `seed ${seed} ${r.medal}`).toBe(tidy(740_000 * SHARE[r.medal as keyof typeof SHARE] * realWealthFactor(1975)))
      if (r.medal === 'bronze') bronze++
    }
    expect(bronze).toBeGreaterThan(0)
  })

  it('Britain, Sweden and Norway still pay nothing', () => {
    let medals = 0
    for (const cid of ['gb', 'se', 'no']) {
      for (let seed = 1; seed <= 30; seed++) {
        const r = final(2028, cid, seed, 60 + (seed % 40))
        if (!r.medal) continue
        medals++
        expect(r.paid, `${cid} seed ${seed}`).toBe(0)
      }
    }
    expect(medals).toBeGreaterThan(10)
  })
})
