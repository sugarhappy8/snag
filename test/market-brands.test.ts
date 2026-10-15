// The real-rival data: every row is well formed, ids are unique, places and years are valid, every
// industry has a cast, nothing real ends after the present, and nothing negative is written.
import { describe, expect, it } from 'vitest'
import { allBrands, brandExists } from '../src/game/data/brands'
import { EXPANSION_INDUSTRY_IDS, INDUSTRY_IDS, PROCEDURAL_DEEP_TECH_IDS } from '../src/game/data/markets'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { marketDef } from '../src/game/business/competition-data'
import { NATIONAL_INDUSTRIES, rivalIndustry } from '../src/game/business/market-rows'
import { knownPlace } from '../src/game/business/market-places'

const rivals = allBrands().filter((b) => rivalIndustry(b))
const curated = INDUSTRY_IDS.filter(id => !(EXPANSION_INDUSTRY_IDS as readonly string[]).includes(id) && !(PROCEDURAL_DEEP_TECH_IDS as readonly string[]).includes(id))

describe('real rival data', () => {
  it('knows which industries are fought one country at a time, the same way the market model does', () => {
    for (const ind of INDUSTRY_IDS) expect(NATIONAL_INDUSTRIES.includes(ind), ind).toBe(marketDef(ind).scope === 'national')
  })

  it('preserves all 33 curated industries with a real cast', () => {
    expect(curated).toHaveLength(33)
    for (const ind of curated) {
      const n = rivals.filter((b) => rivalIndustry(b) === ind).length
      expect(n, ind).toBeGreaterThanOrEqual(15)
    }
  })

  it('has unique ids and sane facts', () => {
    const seen = new Set<string>()
    const bad: string[] = []
    for (const b of rivals) {
      if (seen.has(b.id)) bad.push(`dup ${b.id}`)
      seen.add(b.id)
      if (!knownPlace(b.hq ?? '')) bad.push(`hq ${b.id} ${b.hq}`)
      if (!(b.founded >= 1000 && b.founded <= PRESENT_YEAR)) bad.push(`founded ${b.id}`)
      if (b.ended !== undefined && (b.ended < b.founded || b.ended >= PRESENT_YEAR)) bad.push(`ended ${b.id}`)
      // Trading places the game doesn't model are harmless (ignored); they must still be country codes.
      for (const k of Object.keys(b.sold ?? {})) if (!/^[a-z]{2}$/.test(k)) bad.push(`sold ${b.id} ${k}`)
      const d = (b.data ?? {}) as Record<string, unknown>
      for (const key of ['w', 'x']) for (const k of Object.keys((d[key] as object) ?? {})) if (!/^[a-z]{2}$/.test(k)) bad.push(`${key} ${b.id} ${k}`)
      for (const k of Object.keys((d.x as object) ?? {})) if (!(k in (b.sold ?? {})) && k !== b.hq) bad.push(`x without presence ${b.id} ${k}`)
      if (typeof d.pot !== 'number' || !(d.pot > 0) || d.pot > 20) bad.push(`pot ${b.id}`)
      if (d.since !== undefined && (d.since as number) < b.founded) bad.push(`since<founded ${b.id}`)
      if (d.since !== undefined && b.ended !== undefined && (d.since as number) > b.ended) bad.push(`since>ended ${b.id}`)
    }
    expect(bad).toEqual([])
  })

  it('never ends a real brand after the present and keeps the present field alive', () => {
    for (const ind of curated) {
      const alive = rivals.filter((b) => rivalIndustry(b) === ind && brandExists(b, PRESENT_YEAR))
      expect(alive.length, ind).toBeGreaterThanOrEqual(12)
    }
  })

  it('writes nothing negative about real companies', () => {
    const text = JSON.stringify(rivals).toLowerCase()
    for (const w of ['scandal', 'fraud', 'lawsuit', 'recall', 'bankrupt', 'breach', 'cartel', 'tobacco', 'gambling']) expect(text.includes(w), w).toBe(false)
  })
})
