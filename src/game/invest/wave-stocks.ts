// Tech waves for listed stocks (release 1b, docs/superpowers/specs/2026-10-19-waves-stocks-design.md, plan P1 to P11).
//
// A listed stock's price is the engine path times a level, and the level of a sector is what the live and the settled
// tech waves give its trade (`stockLevelFor` in the wave leaf). This module maps the 35 sector ids to trades and folds
// that level into the two seam functions in shocks.ts (`shockFactor`, `indexShockFactor`), so quotes, holdings, funds,
// bets and the Investing talent's gut agree by construction. Pure: no writes, no draws, and a world with no wave reads
// exactly 1 everywhere. Import direction: the engine, the clock and the leaf only, never business/tech-waves.ts.
import type { Industry } from '../data/markets'
import { noBase, readTechBase, readTechWaves, stockLevelFor } from '../business/tech-wave-factors'
import type { TechBase, TechWave } from '../business/tech-wave-factors'
import type { GameState } from '../types'
import { marketAnchor, marketFamily } from './clock'
import { companyDef, companyKey, exchangeByKey, exchangeYear, slotPlan, type SectorId } from './engine'

/**
 * The trade whose wave role a sector's stocks take (S4), or null for a sector with no honest trade. The deep sectors map to
 * their own driver; three rows are not a driver, each for a reason: telecom (the sector has no drivers), electronics (the
 * chips inside gadgets, its blurb) and pharma (drug makers are the core of the drug kinds, and biotech is their trade).
 */
export const SECTOR_TRADE: Readonly<Record<SectorId, Industry | null>> = {
  telecom: 'telecom', utilities: 'energy', oil: 'energy', automakers: 'autoShop', electronics: 'semiconductor',
  industrials: 'manufacturing', tech: 'software', games: 'gameStudio', ecommerce: 'ecommerce', media: 'marketing',
  entertainment: 'entertainment', pharma: 'biotech', construction: 'construction', food: 'bakery', brewers: 'brewery',
  semis: 'semiconductor', ai: 'aiLab', robotics: 'robotics', biotech: 'biotech', space: 'spaceTech', ev: 'electricVehicles',
  quantum: 'quantum', cyber: 'cybersecurity',
  banks: null, insurance: null, mining: null, hotels: null, airlines: null, shipping: null, agri: null, property: null,
  supermarkets: null, fashion: null, cosmetics: null, leisure: null,
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

interface Parsed { home: string; sector: SectorId }

/** The exchange home and engine sector of a company id or of one of its `~X` share-class lines; null for pennies, coins, bonds and junk. */
function parseSec(secId: string): Parsed | null {
  if (typeof secId !== 'string') return null
  const m = /^(.*)#s(\d+)g(\d+)$/.exec(companyKey(secId))
  if (!m) return null
  const info = exchangeByKey(m[1])
  if (!info) return null
  const sector = companyDef(info, Number(m[2]), Number(m[3])).sector
  return sector === 'penny' ? null : { home: info.home, sector }
}

/** The engine sector of a company id or of one of its `~X` lines; null for pennies, coins, bonds and junk. */
export function sectorOfSec(secId: string): SectorId | null {
  return parseSec(secId)?.sector ?? null
}

/**
 * The sector of each stock an exchange lists in a calendar year, in slot order (P10). Not `slotPlan`: a real company sits in a
 * slot of another sector, so only the listing says which sectors the Stocks screen shows. Empty for an unknown exchange.
 */
export function listedSectors(g: GameState, exKey: string, year: number): readonly SectorId[] {
  const info = exchangeByKey(exKey)
  if (!info || !Number.isFinite(year)) return []
  return exchangeYear(marketFamily(g), marketAnchor(g), info, year).stocks
    .map((s) => companyDef(info, s.slot, s.gen).sector)
    .filter((s): s is SectorId => s !== 'penny')
}

/** True when there is nothing to apply: no stored wave and no settled factor. The early exit of both readers. */
function untouched(list: readonly TechWave[], base: Readonly<Record<string, TechBase>>): boolean {
  return !list.length && noBase(base)
}

/** The price level of one listed security in a calendar year (1 = no wave effect): its sector's trade level at its exchange's home market. */
export function waveStockFactor(g: Pick<GameState, 'flags'>, secId: string, year: number): number {
  const list = readTechWaves(g), base = readTechBase(g)
  if (untouched(list, base)) return 1
  const p = parseSec(secId)
  const trade = p ? SECTOR_TRADE[p.sector] : null
  return p && trade ? stockLevelFor(g, trade, p.home, year) : 1
}

// A memo per validated list, then per settled-factors object, then per (family, anchor, exchange, year).
const indexMemos = new WeakMap<readonly TechWave[], WeakMap<object, Map<string, number>>>()
const MAX_MEMO = 1024

/**
 * The index tilt of an exchange in a calendar year (P10): `1 + the sum over the stocks listed that year of (level - 1) / n`,
 * clamped 0.5 to 1.5, with `n = max(4, slotPlan(info).length)`, the divisor `indexShockFactor` already uses for news.
 * A sector with no trade counts level 1. Memoized per (list, settled object, family, anchor, exchange, year).
 */
export function waveIndexFactor(g: GameState, exKey: string, year: number): number {
  const list = readTechWaves(g), base = readTechBase(g)
  if (untouched(list, base)) return 1
  const info = exchangeByKey(exKey)
  if (!info || !Number.isFinite(year)) return 1
  let byBase = indexMemos.get(list)
  if (!byBase) indexMemos.set(list, (byBase = new WeakMap()))
  let memo = byBase.get(base)
  if (!memo) byBase.set(base, (memo = new Map()))
  const key = `${marketFamily(g)}|${marketAnchor(g)}|${exKey}|${year}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const n = Math.max(4, slotPlan(info).length)
  let sum = 0
  for (const sector of listedSectors(g, exKey, year)) {
    const trade = SECTOR_TRADE[sector]
    if (trade) sum += (stockLevelFor(g, trade, info.home, year) - 1) / n
  }
  const out = clamp(1 + sum, 0.5, 1.5)
  if (memo.size > MAX_MEMO) memo.clear()
  memo.set(key, out)
  return out
}
