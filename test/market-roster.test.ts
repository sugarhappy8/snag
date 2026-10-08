// The real rival roster: every industry has a believable field in every era and place, no company
// exists before it was founded or after it really ended, nothing real disappears after the present,
// fictional challengers never take a real name, and the whole cast is a pure function of the family
// seed (heirs, saves and the Time Machine share the world).
import { describe, expect, it } from 'vitest'
import { activeRivals, arcMult, baselineShares, familyId, futureDrift, isRealName, rawPull, realBrandsOf, rosterFill, rosterOf } from '../src/game/business/competition-roster'
import { marketDef } from '../src/game/business/competition-data'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { brandById } from '../src/game/data/brands'
import { PRESENT_YEAR } from '../src/game/history/timeline'

const NATIONAL = INDUSTRY_IDS.filter((i) => marketDef(i).scope === 'national')
const WORLD = INDUSTRY_IDS.filter((i) => marketDef(i).scope === 'world')
const COUNTRIES = ['us', 'jp', 'in', 'br', 'ng', 'de', 'id', 'gb', 'cn', 'eg']
const YEARS = [1950, 1985, 2005, PRESENT_YEAR]

function scopes(ind: Industry): string[] {
  return marketDef(ind).scope === 'world' ? ['world'] : COUNTRIES
}

describe('real roster: era and place', () => {
  it('never contains a company before it was founded, before it reached the place, or after it really ended', () => {
    for (const ind of INDUSTRY_IDS) {
      for (const sc of scopes(ind)) {
        const roster = rosterOf('fam-era', ind, sc)
        for (const year of [1900, 1925, 1950, 1975, 1985, 1995, 2005, 2015, PRESENT_YEAR, 2040, 2100]) {
          for (const r of activeRivals(roster, year)) {
            expect(year, `${r.name} in ${ind}/${sc}`).toBeGreaterThanOrEqual(r.founded)
            expect(year).toBeGreaterThanOrEqual(r.from ?? r.founded)
            if (r.real && r.brandId) {
              const b = brandById(r.brandId)!
              if (b.ended !== undefined) expect(year, `${r.name} ended ${b.ended}`).toBeLessThanOrEqual(b.ended)
              expect(year).toBeGreaterThanOrEqual(b.founded)
              if (marketDef(ind).scope === 'national' && b.hq !== sc) expect(year, `${r.name} reached ${sc}`).toBeGreaterThanOrEqual(b.sold?.[sc] ?? 9999)
            }
          }
        }
      }
    }
  })

  it('a 1975 life sees 1975: no software company founded later, an AI start-up of 2005 sees a thin real field', () => {
    const sw = activeRivals(rosterOf('fam-1975', 'software', 'world'), 1975).filter((r) => r.real).map((r) => r.name)
    expect(sw).toContain('IBM')
    expect(sw).toContain('SAP')
    for (const late of ['Oracle', 'Adobe', 'Salesforce', 'Amazon Web Services', 'Google']) expect(sw).not.toContain(late)
    const ai2005 = activeRivals(rosterOf('fam-ai', 'aiLab', 'world'), 2005).filter((r) => r.real)
    const ai2026 = activeRivals(rosterOf('fam-ai', 'aiLab', 'world'), PRESENT_YEAR).filter((r) => r.real)
    expect(ai2026.length).toBeGreaterThan(ai2005.length)
    expect(activeRivals(rosterOf('fam-ec', 'ecommerce', 'world'), 1990)).toHaveLength(0)
    expect(activeRivals(rosterOf('fam-q', 'quantum', 'world'), 1984)).toHaveLength(0)
  })

  it('every industry has a non-empty field in 1950/1985/2005/2026 once the industry exists, in several countries', () => {
    for (const ind of INDUSTRY_IDS) {
      const d = marketDef(ind)
      for (const sc of scopes(ind)) {
        const roster = rosterOf('fam-fill', ind, sc)
        for (const year of YEARS) {
          if (d.from !== undefined && year < d.from + 3) continue
          const act = activeRivals(roster, year)
          expect(act.length, `${ind}/${sc}/${year}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('has sane, normalized shares in every year: finite, non-negative, summing to the named share of the market', () => {
    for (const ind of INDUSTRY_IDS) {
      const d = marketDef(ind)
      for (const sc of scopes(ind).slice(0, 4)) {
        for (const year of [1950, 1985, 2005, PRESENT_YEAR, 2060]) {
          if (d.from !== undefined && year < d.from + 2) continue
          const shares = baselineShares('fam-sum', ind, sc, year)
          let sum = 0
          for (const [id, s] of shares) {
            expect(Number.isFinite(s) && s >= 0, `${ind}/${sc}/${year}/${id}`).toBe(true)
            sum += s
          }
          if (shares.size > 0) expect(sum, `${ind}/${sc}/${year}`).toBeCloseTo(1 - d.fringe, 4)
          const fill = rosterFill(rosterOf('fam-sum', ind, sc), year)
          expect(Number.isFinite(fill) && fill > 0).toBe(true)
        }
      }
    }
  }, 60_000)

  it('keeps the real cast after the present: real brands never end after 2026 and always keep some pull', () => {
    for (const ind of INDUSTRY_IDS) {
      for (const sc of scopes(ind).slice(0, 3)) {
        const roster = rosterOf('fam-future', ind, sc)
        const d = marketDef(ind)
        for (const r of roster.rivals.filter((x) => x.real)) {
          const b = brandById(r.brandId!)!
          const left = ((b.data ?? {}) as { x?: Record<string, number> }).x?.[sc]
          if (b.ended === undefined && left !== undefined) expect(r.exit, `${r.name} left ${sc} in ${left}`).toBe(left + 1)
          else if (b.ended === undefined) {
            expect(r.exit, `${r.name} must not end`).toBeGreaterThan(2200)
            if (activeRivals(roster, PRESENT_YEAR).includes(r)) {
              for (const y of [2030, 2060, 2100, 2150]) {
                const p = rawPull(d, r, y)
                expect(p, `${r.name} in ${y}`).toBeGreaterThan(0)
                expect(futureDrift(r, y)).toBeGreaterThanOrEqual(0.35)
                expect(futureDrift(r, y)).toBeLessThanOrEqual(2.5)
              }
            }
          } else expect(b.ended).toBeLessThan(PRESENT_YEAR)
        }
      }
    }
  })

  it('names fictional challengers apart from every real brand, uniquely within a market', () => {
    for (const ind of INDUSTRY_IDS) {
      for (const sc of scopes(ind).slice(0, 4)) {
        const roster = rosterOf('fam-names', ind, sc)
        const seen = new Set<string>()
        for (const r of roster.rivals) {
          expect(seen.has(r.name.toLowerCase()), `${r.name} twice in ${ind}/${sc}`).toBe(false)
          seen.add(r.name.toLowerCase())
          if (!r.real) expect(isRealName(r.name), `${r.name} (${ind}/${sc}) is a real brand`).toBe(false)
          else expect(isRealName(r.name)).toBe(true)
        }
      }
    }
  })

  it('is a pure function of the family seed: the same for heirs, repeat calls and the Time Machine, different for another world', () => {
    const sig = (fam: string, ind: Industry, sc: string) => JSON.stringify(rosterOf(fam, ind, sc).rivals.map((r) => [r.id, r.name, r.founded, r.from, r.exit, r.pot, r.hq, r.arc]))
    expect(familyId('life-1980-abc-g3')).toBe('life-1980-abc')
    for (const [ind, sc] of [['software', 'world'], ['restaurant', 'jp'], ['aiLab', 'world'], ['cafe', 'br']] as [Industry, string][]) {
      const a = sig('life-1980-abc', ind, sc)
      expect(sig('life-1980-abc', ind, sc)).toBe(a)
      expect(sig(familyId('life-1980-abc-g2'), ind, sc)).toBe(a)
    }
    // The real cast is the same in every world; only the fictional tail and the future drift differ.
    const real = (fam: string) => rosterOf(fam, 'software', 'world').rivals.filter((r) => r.real).map((r) => `${r.name}|${r.founded}|${r.pot}`)
    expect(real('life-A')).toEqual(real('life-B'))
    const tail = (fam: string) => rosterOf(fam, 'software', 'world').rivals.filter((r) => !r.real).map((r) => r.name)
    expect(tail('life-A')).not.toEqual(tail('life-B'))
  })

  it('applies strength arcs: Atari fades after 1983, a real brand rises along its arc', () => {
    const roster = rosterOf('fam-arc', 'gameStudio', 'world')
    const atari = roster.rivals.find((r) => r.name === 'Atari')!
    expect(atari).toBeTruthy()
    expect(arcMult(atari.arc, 1982)).toBeGreaterThan(arcMult(atari.arc, 1990))
    const d = marketDef('gameStudio')
    expect(rawPull(d, atari, 1982)).toBeGreaterThan(rawPull(d, atari, 1990))
  })

  it('knows its real cast for every industry', () => {
    for (const ind of INDUSTRY_IDS) expect(realBrandsOf(ind).length, ind).toBeGreaterThanOrEqual(15)
    expect(WORLD.length + NATIONAL.length).toBe(33)
  })
})
