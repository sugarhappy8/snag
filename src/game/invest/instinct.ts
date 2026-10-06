// The Investing talent's gut feeling about next year's markets (purple hints in Investments and
// on the home computer's trading screens).
//
// The market engine is deterministic, so next year's moves already exist. The gut senses which
// way each security goes in g.year + 1 (direction only: a moonshot feels no surer than a solid
// year, so the gut can't single out the biggest winners), clouded by noise, and calls something
// "set to rise" only when the feeling clears a margin. It reads the whole market, gold and
// property more clearly than single companies, and meme coins and penny stocks barely at all
// (one of those at most). First comes a feeling for the market as a whole: in a year that reads
// bad, it names nothing but gold. The noise is seeded by the character and the year: reopening a
// menu never rerolls it, an heir gets a gut of their own, and nothing here touches g.rng or the
// state. Calibrated so picks rise about four times in five: a real edge, never a sure thing
// (test/talent-investing.test.ts; following it beats the index by roughly ten points a year).
import { seeded } from '../assets'
import { hasTalent } from '../talents'
import type { GameState } from '../types'
import { coinDef, companyDef, cryptoYear, exchangeInfo, exchangeYear, goldHedge, goldYear, pennyDef, type ExInfo, type SecYear } from './engine'
import { indexShockFactor, shockFactor } from './shocks'

export type GutKind = 'stock' | 'penny' | 'index' | 'reit' | 'gold' | 'crypto'

export interface GutPick {
  secId: string
  kind: GutKind
  name: string
  symbol: string
}

export interface Instinct {
  /** The calendar year the gut is about (the move at the next age-up). */
  year: number
  /** Up to MAX_PICKS securities the gut likes, strongest feeling first (empty: nothing looks good). */
  picks: GutPick[]
  /** The gut's call on the local index. */
  market: 'up' | 'down' | 'unsure'
  /** The gut expects a bad year across the board (only gold may still look good). */
  gloomy: boolean
  exKey: string
  /** Index name, e.g. 'Nikkei 225'. */
  index: string
}

/** Noise on the gut's feeling for each security (its signal is ±CLARITY: up or down). */
export const GUT_NOISE = 1.8
/**
 * How clearly the gut reads each kind of asset: the whole market, gold and property move for
 * reasons you can feel; single companies less so; meme coins and penny stocks barely at all.
 */
export const CLARITY: Record<GutKind, number> = { index: 1.2, gold: 1.2, reit: 1.2, stock: 1, penny: 0.35, crypto: 0.35 }
/** Most coins or penny stocks the gut names in a year. */
const MAX_WILD = 1
/** A feeling must clear this margin to count as "set to rise". */
export const GUT_MARGIN = 1.0
/** Noise on the gut's feeling for the market as a whole, and how bad it must read to call a bad year. */
export const MOOD_NOISE = 0.5
export const MOOD_MARGIN = 0.4
/** Most securities the gut names in a year. */
export const MAX_PICKS = 3

/** The family market seed and history anchor (the same as investments.ts and computer/money-common.ts). */
function fam(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

function anchor(g: GameState): number {
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const a = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  return Number.isFinite(a) ? a : g.year
}

/** Roughly standard-normal draw from a seeded stream (sum of six uniforms). */
function normal(r: { next: () => number }): number {
  let s = 0
  for (let i = 0; i < 6; i++) s += r.next()
  return (s - 3) * Math.SQRT2
}

function clampNum(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}

interface Candidate extends GutPick {
  /** Next year's real change (shocks included). Never leaves this module. */
  ret: number
  /** Typical yearly swing. */
  sigma: number
}

/** Next year's change for a listing slot: the same move the holding will make at the next age-up. */
function slotMove(next: SecYear | undefined, id: string, now: number, later: number): number | null {
  if (!next) return null
  if (next.id === id) return Math.max(-1, (1 + next.ret) * (later / (now > 0 ? now : 1)) - 1)
  if (next.ended && next.ended.id === id) return next.ended.kind === 'bankrupt' ? -1 : Math.max(-1, (1 + next.ended.premium) * (later / (now > 0 ? now : 1)) - 1)
  return null
}

function exVol(info: ExInfo): number {
  return clampNum(info.ex.volatility, 0.05, 0.8)
}

/** Everything the gut can have a feeling about, with next year's real moves. */
function candidates(g: GameState, cryptoOk: boolean): { list: Candidate[]; info: ExInfo } {
  const f = fam(g)
  const an = anchor(g)
  const y = g.year
  const info = exchangeInfo(g.character.countryId)
  const now = exchangeYear(f, an, info, y)
  const next = exchangeYear(f, an, info, y + 1)
  const vol = exVol(info)
  const list: Candidate[] = []
  for (const s of now.stocks) {
    const def = companyDef(info, s.slot, s.gen)
    const ret = slotMove(next.stocks[s.slot], def.id, shockFactor(g, def.id, y), shockFactor(g, def.id, y + 1))
    if (ret === null) continue
    list.push({ secId: def.id, kind: 'stock', name: def.name, symbol: def.symbol, ret, sigma: Math.sqrt((def.beta * vol * 0.85) ** 2 + def.idio ** 2) })
  }
  for (const s of now.pennies) {
    const def = pennyDef(info, s.slot, s.gen)
    const ret = slotMove(next.pennies[s.slot], def.id, shockFactor(g, def.id, y), shockFactor(g, def.id, y + 1))
    if (ret === null) continue
    list.push({ secId: def.id, kind: 'penny', name: def.name, symbol: def.symbol, ret, sigma: Math.sqrt((1.5 * vol * 0.85) ** 2 + 0.36) })
  }
  if (next.fund.id === now.fund.id) {
    const ret = Math.max(-1, (1 + next.fund.ret) * (indexShockFactor(g, info.key, y + 1) / indexShockFactor(g, info.key, y)) - 1)
    list.push({ secId: now.fund.id, kind: 'index', name: `${info.ex.index} Index Fund`, symbol: info.ex.index, ret, sigma: vol * 0.85 })
  }
  if (next.reit.id === now.reit.id) list.push({ secId: now.reit.id, kind: 'reit', name: 'the local property fund', symbol: 'REIT', ret: next.reit.ret, sigma: Math.sqrt(0.06 ** 2 + (0.5 * vol * 0.85) ** 2 + 0.05 ** 2) })
  const gold = goldYear(f, an, y + 1)
  list.push({ secId: `gold:${g.character.countryId}`, kind: 'gold', name: 'gold', symbol: 'XAU', ret: (1 + gold.ret) * (1 + goldHedge(g.character.countryId)) - 1, sigma: 0.14 })
  if (cryptoOk) {
    const cy = cryptoYear(f, an, y)
    const cn = cryptoYear(f, an, y + 1)
    for (const c of cy.coins) {
      const def = coinDef(c.slot, c.gen)
      if (def.stable) continue
      const ret = slotMove(cn.coins[c.slot], def.id, shockFactor(g, def.id, y), shockFactor(g, def.id, y + 1))
      if (ret === null) continue
      list.push({ secId: def.id, kind: 'crypto', name: def.name, symbol: def.symbol, ret, sigma: Math.min(2, Math.sqrt((def.beta * 0.5) ** 2 + def.idio ** 2)) })
    }
  }
  return { list, info }
}

/**
 * The gut's feeling about one security: which way it is going (anything beyond a fifth of its
 * usual swing feels the same), seen through character-and-year noise.
 */
function read(g: GameState, c: Candidate): number {
  const noise = normal(seeded(`${g.lifeId}|${g.character.id}|gut|${g.year + 1}|${c.secId}`))
  const sigma = Math.max(0.02, c.sigma)
  // Direction only: anything beyond a fifth of a swing feels the same, up or down.
  return clampNum((c.ret / sigma) * 5, -1, 1) * CLARITY[c.kind] + GUT_NOISE * noise
}

const cache = new Map<string, Instinct>()

/**
 * Next year's gut feeling for a character with the Investing talent (null without it, or for the
 * dead). `cryptoOk` is false where crypto is banned (no feelings about coins you can't trade).
 */
export function marketInstinct(g: GameState, cryptoOk = true): Instinct | null {
  if (!hasTalent(g, 'Investing') || !g.character.alive) return null
  const shocks = JSON.stringify(g.flags.marketShocks ?? null)
  const key = `${g.lifeId}|${g.character.id}|${g.year}|${g.character.age}|${g.character.countryId}|${cryptoOk ? 1 : 0}|${shocks}`
  const hit = cache.get(key)
  if (hit) return hit
  const { list, info } = candidates(g, cryptoOk)
  const reads = list.map((c) => ({ c, z: read(g, c) }))
  // First the mood: how much of the market rises next year (coins and penny stocks aside). When it
  // reads bad, the gut names nothing at all, except gold if gold itself feels like a riser.
  const steady = list.filter((c) => c.kind !== 'crypto' && c.kind !== 'penny')
  const breadth = steady.length ? steady.filter((c) => c.ret > 0).length / steady.length : 0.5
  const moodNoise = normal(seeded(`${g.lifeId}|${g.character.id}|gutMood|${g.year + 1}`))
  const gloomy = clampNum((breadth - 0.5) / 0.15, -1, 1) + MOOD_NOISE * moodNoise <= -MOOD_MARGIN
  const picks: GutPick[] = []
  let wild = 0
  for (const { c } of reads.filter((x) => x.z >= GUT_MARGIN && (!gloomy || x.c.kind === 'gold')).sort((x, y) => y.z - x.z)) {
    if (picks.length >= MAX_PICKS) break
    const isWild = c.kind === 'crypto' || c.kind === 'penny'
    if (isWild && wild >= MAX_WILD) continue
    if (isWild) wild++
    picks.push({ secId: c.secId, kind: c.kind, name: c.name, symbol: c.symbol })
  }
  const idx = reads.find((x) => x.c.kind === 'index')
  const market: Instinct['market'] = !idx ? 'unsure' : idx.z >= GUT_MARGIN ? 'up' : idx.z <= -GUT_MARGIN ? 'down' : 'unsure'
  const out: Instinct = { year: g.year + 1, picks, market: gloomy && market === 'up' ? 'unsure' : market, gloomy, exKey: info.key, index: info.ex.index }
  cache.set(key, out)
  if (cache.size > 32) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return out
}

/** True when the gut likes this security for next year. */
export function gutLikes(inst: Instinct | null, secId: string): boolean {
  return !!inst && inst.picks.some((p) => p.secId === secId)
}

/** 'Pacific Motors (PMC)', 'gold', 'the Nikkei 225 index fund'. */
export function pickLabel(p: GutPick): string {
  if (p.kind === 'gold') return 'gold'
  if (p.kind === 'reit') return 'the local property fund (REIT)'
  if (p.kind === 'index') return `the ${p.symbol} index fund`
  return `${p.name} (${p.symbol})`
}

/** 'A, B and C'. */
export function listPicks(picks: GutPick[]): string {
  const names = picks.map(pickLabel)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The one-line market instinct (without the 🔮; callers add talentHint or an info emoji). */
export function instinctLine(inst: Instinct): string {
  const mood = inst.market === 'up' ? `the ${inst.index} should climb` : inst.market === 'down' ? `the ${inst.index} looks shaky` : `the ${inst.index} could go either way`
  if (inst.gloomy) return `Market instinct for ${inst.year}: nothing looks good next year. ${inst.picks.some((p) => p.kind === 'gold') ? 'If anything, gold feels safest.' : 'Cash and bonds feel safer.'} Gut feelings, not guarantees.`
  if (!inst.picks.length) return `Market instinct for ${inst.year}: ${mood}, but no single investment stands out. Gut feelings, not guarantees.`
  return `Market instinct for ${inst.year}: ${mood}. Your gut likes ${listPicks(inst.picks)}. Gut feelings, not guarantees.`
}
