import { describe, expect, it } from 'vitest'
import { roleOf } from '../src/game/business/tech-waves'
import { WAVE_KINDS } from '../src/game/business/tech-wave-data'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { companyDef, exchangeInfo, pennyDef, SECTORS } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec } from '../src/game/invest/wave-stocks'

const IDS = Object.keys(SECTORS) as (keyof typeof SECTORS)[]
describe('SECTOR_TRADE (S4)', () => {
  it('has exactly the 35 sector ids, 23 mapped to a real trade and 12 to none', () => {
    expect([Object.keys(SECTOR_TRADE).sort(), IDS]).toEqual([[...IDS].sort(), IDS]); expect(IDS).toHaveLength(35)
    const mapped = IDS.filter((s) => SECTOR_TRADE[s] !== null); expect(mapped).toHaveLength(23)
    expect(IDS.filter((s) => SECTOR_TRADE[s] === null).sort()).toEqual(['agri', 'airlines', 'banks', 'cosmetics', 'fashion', 'hotels', 'insurance', 'leisure', 'mining', 'property', 'shipping', 'supermarkets'])
    for (const s of mapped) expect(INDUSTRY_IDS).toContain(SECTOR_TRADE[s])
  })
  it('gives every mapped trade a role in some wave kind, maps each deep sector to its own driver, and has exactly three non-driver rows', () => {
    for (const s of IDS) { const t = SECTOR_TRADE[s]; if (t) expect((Object.keys(WAVE_KINDS) as (keyof typeof WAVE_KINDS)[]).some((k) => roleOf(k, t) !== null), `${s} -> ${t}`).toBe(true) }
    for (const s of ['semis', 'ai', 'robotics', 'biotech', 'space', 'ev', 'quantum', 'cyber'] as const) expect(SECTOR_TRADE[s]).toBe(SECTORS[s].drivers[0])
    expect(IDS.filter((s) => SECTOR_TRADE[s] && !SECTORS[s].drivers.includes(SECTOR_TRADE[s]!)).sort()).toEqual(['electronics', 'pharma', 'telecom'])
  })
  it('sectorOfSec reads a company id and its share-class line, and rejects pennies, coins, bonds and junk', () => {
    const info = exchangeInfo('us'), def = companyDef(info, 0, 0)
    expect([sectorOfSec(def.id), sectorOfSec(`${def.id}~B`)]).toEqual([def.sector, def.sector])
    expect([sectorOfSec(pennyDef(info, 0, 0).id), sectorOfSec('crypto#c0g0'), sectorOfSec('bond:us'), sectorOfSec(''), sectorOfSec('constructor')]).toEqual([null, null, null, null, null])
  })
})
