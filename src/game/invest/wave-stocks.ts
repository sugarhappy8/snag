// Tech waves for listed stocks (release 1b, docs/superpowers/specs/2026-10-19-waves-stocks-design.md, plan P1 to P11).
//
// A listed stock's price is the engine path times a level, and the level of a sector is what the live and the settled
// tech waves give its trade (`stockLevelFor` in the wave leaf). This module maps the 35 sector ids to trades and folds
// that level into the two seam functions in shocks.ts (`shockFactor`, `indexShockFactor`), so quotes, holdings, funds,
// bets and the Investing talent's gut agree by construction. Pure: no writes, no draws, and a world with no wave reads
// exactly 1 everywhere. Import direction: the engine, the clock, the era check, the market-event helpers, the country list and the
// leaf only, never business/tech-waves.ts.
import type { Industry } from '../data/markets'
import { noBase, readTechBase, readTechWaves, stockLevelFor, waveLevels } from '../business/tech-wave-factors'
import type { TechBase, TechWave, WaveLevel } from '../business/tech-wave-factors'
import { anachronismsIn } from '../events/era'
import { signed } from '../history/market-events'
import type { GameState } from '../types'
import { marketAnchor, marketFamily } from './clock'
import { COUNTRIES } from '../world'
import { companyDef, companyKey, exchangeByKey, exchangeInfo, exchangeYear, SECTORS, slotPlan, type ExInfo, type SectorId } from './engine'

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

interface Parsed { key: string; home: string; sector: SectorId }

/** The exchange home and engine sector of a company id or of one of its `~X` share-class lines; null for pennies, coins, bonds and junk. */
function parseSec(secId: string): Parsed | null {
  if (typeof secId !== 'string') return null
  const m = /^(.*)#s(\d+)g(\d+)$/.exec(companyKey(secId))
  if (!m) return null
  const info = exchangeByKey(m[1])
  if (!info) return null
  const sector = companyDef(info, Number(m[2]), Number(m[3])).sector
  return sector === 'penny' ? null : { key: info.key, home: info.home, sector }
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

// ---------------------------------------------------------------------------
// Presentation (plan P8, P10): the tag on a quote, the clause on the market line and the one news line. Pure reads of the
// same numbers the price carries; each text is dropped when the era check flags it for a country that trades there.

let tradersByKey: Map<string, string[]> | null = null

/** The countries whose brokers trade on an exchange: its home and every country that shares it (a country with no exchange of its own trades abroad). */
function tradersOn(info: ExInfo): readonly string[] {
  if (!tradersByKey) {
    const byKey = new Map<string, string[]>()
    for (const c of COUNTRIES) {
      const k = exchangeInfo(c.id).key
      const list = byKey.get(k)
      if (list) list.push(c.id)
      else byKey.set(k, [c.id])
    }
    tradersByKey = byKey
  }
  const list = tradersByKey.get(info.key) ?? []
  return list.includes(info.home) ? list : [info.home, ...list]
}

const eraMemo = new Map<string, boolean>()

/**
 * A text the era check passes in that year for every country that trades on the exchange (any of them can open its Stocks
 * screen, and a country with no exchange of its own reads another's), else null. Memoized per (exchange, year, text).
 */
function eraClean(text: string, year: number, info: ExInfo): string | null {
  const key = `${info.key}|${year}|${text}`
  let ok = eraMemo.get(key)
  if (ok === undefined) {
    ok = tradersOn(info).every((c) => anachronismsIn(text, year, [c]).length === 0)
    if (eraMemo.size > 2048) eraMemo.clear()
    eraMemo.set(key, ok)
  }
  return ok ? text : null
}

/** True when a level or factor shows as a non-zero percentage, so a line never says "+0%" (the 0.5% floor of the tag and the clause). */
function showsMove(factor: number): boolean {
  return Math.round(Math.abs(factor - 1) * 100) >= 1
}

/**
 * Each live wave's own level on one stock's sector in a calendar year, biggest `|level - 1|` first (a stable sort, so a tie
 * keeps the stored order). A stock with no trade, a wave with no role for it and a wave that has not begun are absent, and
 * a heavy wave never disrupts its pioneer trade (P9, applied by `waveLevels`). Empty with no wave. Pure.
 */
export function sectorWaves(g: Pick<GameState, 'flags'>, secId: string, year: number): WaveLevel[] {
  return sectorWavesOf(g, parseSec(secId), year)
}

function sectorWavesOf(g: Pick<GameState, 'flags'>, p: Parsed | null, year: number): WaveLevel[] {
  if (!p || !readTechWaves(g).length) return []
  const trade = SECTOR_TRADE[p.sector]
  if (!trade) return []
  return [...waveLevels(g, trade, p.home, year)].sort((a, b) => Math.abs(b.level - 1) - Math.abs(a.level - 1))
}

/** The tag a stock quote carries: the live wave with the largest effect on its sector, "Frontier AI wave: sector +12%". Null below 0.5%. Pure. */
export function waveTag(g: Pick<GameState, 'flags'>, secId: string, year: number): string | null {
  const p = parseSec(secId)
  const top = sectorWavesOf(g, p, year)[0]
  if (!p || !top || !showsMove(top.level)) return null
  const info = exchangeByKey(p.key)
  return info ? eraClean(`${top.name} wave: sector ${signed(top.level)}`, year, info) : null
}

/**
 * The market line's clause: the wave with the largest effect on the exchange's index, "Frontier AI wave: index +3%". Each
 * wave's effect is `1 + sum (level - 1) / n` over the stocks listed that year (P10), with the same `n` and the same 0.5 to
 * 1.5 clamp as `waveIndexFactor`. Null below 0.5%, with no wave, or when the era check flags it. Pure.
 */
export function waveClause(g: GameState, exKey: string, year: number): string | null {
  if (!readTechWaves(g).length) return null
  const info = exchangeByKey(exKey)
  if (!info || !Number.isFinite(year)) return null
  const n = Math.max(4, slotPlan(info).length)
  const byTrade = new Map<string, readonly WaveLevel[]>()
  const sums = new Map<string, { name: string; sum: number }>()
  for (const sector of listedSectors(g, exKey, year)) {
    const trade = SECTOR_TRADE[sector]
    if (!trade) continue
    let levels = byTrade.get(trade)
    if (!levels) byTrade.set(trade, (levels = waveLevels(g, trade, info.home, year)))
    for (const w of levels) {
      const e = sums.get(w.id) ?? { name: w.name, sum: 0 }
      e.sum += (w.level - 1) / n
      sums.set(w.id, e)
    }
  }
  let best: { name: string; factor: number } | null = null
  for (const e of sums.values()) {
    const factor = clamp(1 + e.sum, 0.5, 1.5)
    if (!best || Math.abs(factor - 1) > Math.abs(best.factor - 1)) best = { name: e.name, factor }
  }
  if (!best || !showsMove(best.factor)) return null
  return eraClean(`${best.name} wave: index ${signed(best.factor)}`, year, info)
}

/**
 * The one wave news line of a year: the listed sector (first in listing order on a tie) whose level moved most between the
 * year before and this year, at least 3%, named for the wave whose own level changed most on it. "Frontier AI wave moved
 * Semiconductors stocks up 9%." Null with no live wave, below 3%, or when the era check flags the text. Pure.
 */
export function waveNews(g: GameState, exKey: string, year: number): string | null {
  if (!readTechWaves(g).length) return null
  const info = exchangeByKey(exKey)
  if (!info || !Number.isFinite(year)) return null
  let best: { sector: SectorId; trade: string; move: number } | null = null
  const seen = new Set<SectorId>()
  for (const sector of listedSectors(g, exKey, year)) {
    if (seen.has(sector)) continue
    seen.add(sector)
    const trade = SECTOR_TRADE[sector]
    if (!trade) continue
    const move = stockLevelFor(g, trade, info.home, year) / stockLevelFor(g, trade, info.home, year - 1) - 1
    if (Math.abs(move) >= 0.03 && (!best || Math.abs(move) > Math.abs(best.move))) best = { sector, trade, move }
  }
  if (!best) return null
  const before = new Map(waveLevels(g, best.trade, info.home, year - 1).map((w) => [w.id, w.level] as const))
  let mover: WaveLevel | null = null
  let most = 0
  for (const w of waveLevels(g, best.trade, info.home, year)) {
    const change = Math.abs(w.level / (before.get(w.id) ?? 1) - 1)
    if (change > most) { mover = w; most = change }
  }
  if (!mover) return null
  const text = `${mover.name} wave moved ${SECTORS[best.sector].label} stocks ${best.move > 0 ? 'up' : 'down'} ${Math.round(Math.abs(best.move) * 100)}%.`
  return eraClean(text, year, info)
}
