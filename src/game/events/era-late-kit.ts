// Shared building blocks for the late era packs (era-pack-1980*.ts and era-pack-2000*.ts):
// where in the world the player lives, how rich the household is likely to be, what a period
// price is in engine dollars, and a compact way to write popup events whose outcomes are a
// weighted list (so the purple talent hints can quote the exact odds the resolver rolls).
//
// Everything here is pure except `eraEvent`'s resolvers, which roll with g's RNG at resolve time
// (never in setup, hints or weights).
import { chance, weightedPick } from '../rng'
import { priceLevel, techOdds, type TechId } from '../history/timeline'
import { getCountry } from '../world'
import { hasTalent, talentHint, type TalentId } from '../talents'
import type { ChoiceOption, GameState, Tone } from '../types'
import { defineEvents, priceScale, res, type Ctx, type EvData, type EventDef, type Fx, type Setup } from './helpers'
import type { EraFlavorPool } from './era-life'
import { common, eraOk } from './era'

// ---------------------------------------------------------------------------
// Where and how rich

export type Region = 'us' | 'uk' | 'europe' | 'japan' | 'korea' | 'china' | 'india' | 'seasia' | 'brazil' | 'latam' | 'africa' | 'mideast' | 'oceania' | 'other'

const NORTH_AMERICA = new Set(['us', 'ca'])
const SOUTH_ASIA = new Set(['in', 'pk', 'bd', 'np'])
const CHINESE_SPEAKING = new Set(['cn', 'hk', 'tw'])
const SOUTHEAST_ASIA = new Set(['id', 'my', 'ph', 'th', 'vn', 'sg'])

/** The broad cultural region of a country id (for flavor that is true of a whole part of the world). */
export function regionOf(countryId: string): Region {
  if (NORTH_AMERICA.has(countryId)) return 'us'
  if (countryId === 'gb' || countryId === 'ie') return 'uk'
  if (countryId === 'jp') return 'japan'
  if (countryId === 'kr') return 'korea'
  if (CHINESE_SPEAKING.has(countryId)) return 'china'
  if (SOUTH_ASIA.has(countryId)) return 'india'
  if (SOUTHEAST_ASIA.has(countryId)) return 'seasia'
  if (countryId === 'br') return 'brazil'
  const continent = getCountry(countryId).continent
  switch (continent) {
    case 'Europe':
      return 'europe'
    case 'Africa':
      return 'africa'
    case 'Middle East':
      return 'mideast'
    case 'Oceania':
      return countryId === 'au' || countryId === 'nz' ? 'oceania' : 'other'
    case 'South America':
      return 'latam'
    case 'North America':
      return 'latam'
    default:
      return 'other'
  }
}

export function regionIs(g: GameState, ...regions: Region[]): boolean {
  return regions.includes(regionOf(g.character.countryId))
}

export function inCountry(g: GameState, ...ids: string[]): boolean {
  return ids.includes(g.character.countryId)
}

/** The English-speaking rich world, where the library's American scenes mostly fit. */
export function anglo(g: GameState): boolean {
  return inCountry(g, 'us', 'ca', 'gb', 'ie', 'au', 'nz')
}

export function wealthOf(g: GameState): number {
  const w = getCountry(g.character.countryId).wealth
  return typeof w === 'number' && Number.isFinite(w) ? w : 1
}

/** A rich country: the full consumer experience of the decade arrives on time. */
export function richCountry(g: GameState): boolean {
  return wealthOf(g) >= 0.7
}

/** A poorer country: shared TVs, public phones, cyber cafes before home computers. */
export function poorerCountry(g: GameState): boolean {
  return wealthOf(g) < 0.45
}

export function inYears(g: GameState, from: number, to: number): boolean {
  return g.year >= from && g.year <= to
}

/** True when roughly this share of households here have the technology (techOdds >= share). */
export function adoption(g: GameState, tech: Parameters<typeof common>[1], share: number): boolean {
  return common(g, tech, share)
}

/** The video rental chain that really traded where the player lives (null: a local video shop). */
export function videoChain(g: GameState): string | null {
  if (inCountry(g, 'us')) return g.year >= 1987 && g.year <= 2013 ? 'Blockbuster' : null
  if (inCountry(g, 'ca', 'gb', 'ie', 'au', 'nz')) return g.year >= 1991 && g.year <= 2013 ? 'Blockbuster' : null
  return null
}

// ---------------------------------------------------------------------------
// Whose household has what

/** A stable number in [0, 1) for a key (FNV-1a), the same on every call and every device. */
function fraction(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * Does this life's household own the technology this year? techOdds says what share of homes in the
 * country have it; each household has a fixed place in the queue (a stable draw from the life),
 * so it gets a home computer exactly when the country's adoption reaches its turn and keeps it.
 * Adults with plenty of money are earlier in the queue, adults with nothing later. A flag
 * `own.<tech>` (true/false) in g.flags overrides the draw (a computer the player bought).
 * Pure: no dice.
 */
export function householdHas(g: GameState, tech: TechId): boolean {
  const flag = g.flags[`own.${tech}`]
  if (typeof flag === 'boolean') return flag
  let odds = techOdds(g, tech)
  const c = g.character
  if (c.age >= 20) odds *= c.money >= 20_000 ? 1.8 : c.money < 500 ? 0.6 : 1
  return fraction(`${g.lifeId}|${tech}`) < Math.min(1, odds)
}

/**
 * Splits out the lines about things a household owns. A line tagged "own:smartphone" (next to
 * its year gates) moves into a pool of its own that applies only when the household has that
 * technology, with a weight in proportion to the lines it took, so owning a computer shows up as
 * often as it did before the split, but only in the homes that had one. Lines about a friend's
 * or the school's computer keep the plain "+tech" tag and stay where they are.
 */
export function ownerPools(pools: readonly EraFlavorPool[]): EraFlavorPool[] {
  const out: EraFlavorPool[] = []
  for (const pool of pools) {
    const rest: string[] = []
    const owned = new Map<TechId, string[]>()
    for (const line of pool.lines) {
      const m = /^@([\w!+,:-]+)\s+([\s\S]*)$/.exec(line)
      const own = m ? m[1].split(',').find((t) => t.startsWith('own:')) : undefined
      if (!m || !own) {
        rest.push(line)
        continue
      }
      const tech = own.slice(4) as TechId
      const tags = m[1].split(',').map((t) => (t === own ? `+${tech}` : t))
      const list = owned.get(tech) ?? []
      list.push(`@${tags.join(',')} ${m[2]}`)
      owned.set(tech, list)
    }
    if (rest.length) out.push({ ...pool, lines: rest })
    for (const [tech, lines] of owned) {
      out.push({
        ...pool,
        key: `${pool.key}~own.${tech}`,
        lines,
        weight: Math.max(0.2, Math.round(pool.weight * (lines.length / pool.lines.length) * 10) / 10),
        when: (g) => householdHas(g, tech) && (pool.when ? pool.when(g) : true) && lines.some((l) => eraOk(g, l)),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Prices

/**
 * A price written in US dollars of the current year, as engine (constant 2026) dollars, scaled
 * by the player's country the way helpers.dollars() does. Pure: no dice.
 */
export function eraPrice(g: GameState, nominalUsd: number): number {
  const level = priceLevel(g.year)
  const raw = (nominalUsd / (level > 0 ? level : 1)) * priceScale(g)
  const step = raw >= 10000 ? 500 : raw >= 1000 ? 50 : raw >= 100 ? 5 : 1
  return Math.max(1, Math.round(raw / step) * step)
}

// ---------------------------------------------------------------------------
// A compact popup-event format with weighted outcomes

export type Txt = string | readonly string[] | ((g: GameState, x: Ctx) => string | readonly string[])

export interface Out {
  /** Relative weight (default 1); may depend on the character. Must be pure. */
  w?: number | ((g: GameState) => number)
  /** Popup title, popup text and life-log line. */
  t: Txt
  x: Txt
  l?: Txt | null
  fx?: Fx | ((g: GameState, x: Ctx) => Fx)
  tone?: Tone
  e?: string
  /** Extra effects that need code (a new friend, a flag). Runs after the outcome is shown. */
  after?: (g: GameState, x: Ctx) => void
}

export interface Opt {
  id: string
  label: string | ((g: GameState) => string)
  emoji?: string
  /** Offer this choice only when true (for example, when the player can afford it). */
  when?: (g: GameState) => boolean
  /** Honest purple hint: the talent that reveals the odds of outcome `of`. */
  hint?: { talent: TalentId; of: number; text: (pct: number) => string }
  outs: Out[]
}

export interface EraEventSpec {
  id: string
  emoji: string
  title: string
  minAge: number
  maxAge: number
  /** Inclusive calendar years. */
  years: readonly [number, number]
  weight?: number | ((g: GameState) => number)
  cooldown?: number
  once?: boolean
  where?: 'free' | 'prison' | 'any'
  /** Extra eligibility on top of the age and year window. */
  when?: (g: GameState) => boolean
  /** Build the popup text (and data / people). Pure apart from picking among the player's people. */
  text: (g: GameState) => (Omit<Setup, 'choices'> & { text: string }) | null
  opts: Opt[]
}

function resolveTxt(t: Txt | null | undefined, g: GameState, x: Ctx): string | readonly string[] | null {
  if (t === null || t === undefined) return null
  return typeof t === 'function' ? t(g, x) : t
}

function weightOf(o: Out, g: GameState): number {
  const w = typeof o.w === 'function' ? o.w(g) : (o.w ?? 1)
  return Number.isFinite(w) && w > 0 ? w : 0
}

/** The chance (0-100) of outcome `index` of an option, from the same weights the resolver rolls. */
export function outcomePct(g: GameState, opt: Opt, index: number): number {
  const ws = opt.outs.map((o) => weightOf(o, g))
  const total = ws.reduce((a, b) => a + b, 0)
  return total > 0 ? Math.round((ws[index] / total) * 100) : 0
}

function runOpt(g: GameState, x: Ctx, opt: Opt): void {
  const live = opt.outs.filter((o) => weightOf(o, g) > 0)
  const pool = live.length ? live : opt.outs
  const o = pool.length === 1 ? pool[0] : weightedPick(g, pool, (item) => weightOf(item, g) || 1)
  const fx = typeof o.fx === 'function' ? o.fx(g, x) : o.fx
  const t = resolveTxt(o.t, g, x) ?? ''
  const body = resolveTxt(o.x, g, x) ?? ''
  const l = resolveTxt(o.l, g, x)
  res(g, x, { t, x: body, l: l ?? undefined, fx, tone: o.tone, e: o.e })
  o.after?.(g, x)
}

/** Build one EventDef from the compact spec (the era backstop of defineEvents applies on top). */
export function eraEvent(spec: EraEventSpec): EventDef {
  const [from, to] = spec.years
  const resolve: EventDef['resolve'] = {}
  for (const opt of spec.opts) resolve[opt.id] = (g, x) => runOpt(g, x, opt)
  return {
    id: spec.id,
    emoji: spec.emoji,
    title: spec.title,
    minAge: spec.minAge,
    maxAge: spec.maxAge,
    where: spec.where,
    weight: spec.weight ?? 18,
    cooldown: spec.cooldown ?? 8,
    once: spec.once,
    when: (g) => g.year >= from && g.year <= to && (spec.when ? spec.when(g) : true),
    setup: (g) => {
      const base = spec.text(g)
      if (!base) return null
      const choices: ChoiceOption[] = []
      for (const opt of spec.opts) {
        if (opt.when && !opt.when(g)) continue
        const idx = opt.hint?.of ?? 0
        const hint = opt.hint && hasTalent(g, opt.hint.talent) ? talentHint(g, opt.hint.talent, opt.hint.text(outcomePct(g, opt, idx))) : ''
        const label = typeof opt.label === 'function' ? opt.label(g) : opt.label
        choices.push({ id: opt.id, label, ...(opt.emoji ? { emoji: opt.emoji } : {}), ...(hint ? { hint } : {}) })
      }
      return { ...base, choices } as Setup
    },
    resolve,
  }
}

/** defineEvents over a list of specs: ids unique, era backstop applied. */
export function eraEvents(specs: EraEventSpec[]): EventDef[] {
  return defineEvents(specs.map(eraEvent))
}

/** A plain yes/no roll for resolvers that need a one-off check. */
export function roll(g: GameState, p: number): boolean {
  return chance(g, p)
}

export type { Ctx, EvData, Fx }
