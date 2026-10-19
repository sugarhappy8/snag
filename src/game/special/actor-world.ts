// Actor 2.0 world model: pure functions over (game, industry, year). The industry a life plays, its
// heat and scale, the rival field, casting pressure, the gross curve and award odds. Nothing here draws
// g.rng or writes state, so menus, hints and the yearly sim can all call it and agree. Every seeded
// fact keys on the family seed and the Time Machine outcome tag, so heirs share the same calendars.
import { seeded } from '../assets'
import { economyOf } from '../economy/model'
import { techOdds } from '../history/timeline'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { BUDGETS, INDUSTRIES, SOUND_SHIFT, TYPE_IDS, industryAt, type IndustryId, type TypeId } from './actor-data'
import type { ActorState, Proj, Role } from './actor-state'
import { actingSkill, fameOf } from './common'
import { activeField, familySeed, standingOf, type RivalSpec, type Standing } from './kit/rivals'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

// ---------------------------------------------------------------------------
// Industry, scale, heat

/** The industry this life plays in `year` (default this year). A named industry before its film start plays domestic. */
export function industryOf(g: GameState, year: number = g.year): IndustryId {
  return industryAt(g.character.countryId, year)
}

/** Money multiplier: the industry's own, or for domestic 0.25 x the country's wealth, at least 0.05. */
export function scaleOf(g: GameState, industry: IndustryId = industryOf(g)): number {
  const def = INDUSTRIES[industry] ?? INDUSTRIES.domestic
  if (def.id !== 'domestic') return def.scale
  return Math.max(0.05, def.scale * fin(getCountry(g.character.countryId).wealth, 1))
}

/** Industry heat by year: linear keyframes, 0 before the film start, the last keyframe (2026) held after. */
export function heat(industry: IndustryId, year: number): number {
  const def = INDUSTRIES[industry]
  if (!def || !Number.isFinite(year) || year < def.filmStart) return 0
  const k = def.heat
  if (year <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++) {
    if (year <= k[i][0]) {
      const [y0, h0] = k[i - 1]
      const [y1, h1] = k[i]
      return h0 + ((h1 - h0) * (year - y0)) / (y1 - y0)
    }
  }
  return k[k.length - 1][1]
}

/** Studio-system years of this industry, inclusive: terms are forced while it lasts. Ends by year, never by a flag. */
export function studioYear(industry: IndustryId, year: number): boolean {
  const w = INDUSTRIES[industry]?.studio
  return !!w && Number.isFinite(year) && year >= w[0] && year <= w[1]
}

/** The talkies years (1927-1931) for a studio-system industry; the sound-shift event runs once inside them. */
export function soundShiftYear(industry: IndustryId, year: number): boolean {
  return !!INDUSTRIES[industry]?.studio && Number.isFinite(year) && year >= SOUND_SHIFT[0] && year <= SOUND_SHIFT[1]
}

// ---------------------------------------------------------------------------
// The rival field

/** Rivals: five genre types as edges, the industry in play sets how many are active (about 10 to 22). */
export const ACTOR_SPEC: RivalSpec = {
  career: 'actor',
  edges: TYPE_IDS,
  peak: [38, 98],
  debutAge: [19, 26],
  length: [20, 40],
  foreignShare: 0.05,
  field: (year, country) => {
    const id = industryAt(country, year)
    const h = heat(id, year)
    return h > 0 ? Math.round(INDUSTRIES[id].field * (0.7 + 0.3 * Math.min(1.3, h))) : 0
  },
}

/** .40 fame + .25 reputation + .20 mean popularity of the last three credits + .15 acting skill, 0-100. */
export function starPower(g: GameState, s: ActorState): number {
  const last = s.credits.slice(-3)
  const pop = last.length ? last.reduce((n, c) => n + fin(c.popularity), 0) / last.length : 0
  return clamp(Math.round(0.4 * fameOf(g) + 0.25 * fin(s.rep) + 0.2 * pop + 0.15 * actingSkill(g)), 0, 100)
}

/** Where the star power ranks against this year's whole field (rank 1 of 1 when there is no field yet). */
export function rankOf(g: GameState, s: ActorState): Standing {
  return standingOf(g, ACTOR_SPEC, starPower(g, s), s.memory)
}

const ROLE_WEIGHT: Record<Role, number> = { Extra: 0, Supporting: 0.5, Lead: 1 }

/**
 * Casting pressure on an audition score: clamp((mean of the top three active rivals of the type - star) / 8, 0, 8),
 * x1 for a lead, x0.5 for a supporting role, none for an extra, plus 1 for each of those rivals who beat you
 * twice. A supporting role caps at 4.
 */
export function pressure(g: GameState, s: ActorState, type: TypeId, role: Role): number {
  const weight = ROLE_WEIGHT[role] ?? 0
  if (weight === 0) return 0
  const field = activeField(g, ACTOR_SPEC, s.memory).filter((x) => x.rival.edge === type)
  if (!field.length) return 0
  const top = field.slice(0, 3)
  const mean = top.reduce((n, x) => n + x.score, 0) / top.length
  const lost = new Map(s.memory.map((m) => [m.id, m.lost]))
  const feud = field.filter((x) => (lost.get(x.rival.id) ?? 0) >= 2).length
  return clamp(clamp((mean - starPower(g, s)) / 8, 0, 8) * weight + feud, 0, role === 'Supporting' ? 4 : 8)
}

// ---------------------------------------------------------------------------
// Seeded facts: trend and release clashes

function normal(r: { next(): number }): number {
  const u = Math.max(r.next(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next())
}

/** The year's appetite for a type: exp(0.22 x a seeded normal), about 0.6 to 1.7. Seeded, never g.rng. */
export function trendOf(g: GameState, type: TypeId, year: number = g.year): number {
  if (!Number.isFinite(year)) return 1
  const y = Math.floor(year)
  const r = seeded(`${familySeed(g)}|trend|actor|${industryOf(g, y)}|${type}|${y}${outcomeTag(g, y)}`)
  return Math.exp(0.22 * clamp(normal(r), -2.5, 2.5))
}

/** The two types in favour. Known for this year and the past only: a future year reads empty. */
export function hotTypes(g: GameState, year: number = g.year): TypeId[] {
  if (!(year <= g.year)) return []
  const order = new Map(TYPE_IDS.map((t, i) => [t, i]))
  return [...TYPE_IDS]
    .sort((a, b) => trendOf(g, b, year) - trendOf(g, a, year) || (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .slice(0, 2)
}

/** Another big release lands the same weekend: a seeded fact per industry, type and year (public a year ahead). */
export function clashOf(g: GameState, industry: IndustryId, type: TypeId, year: number): boolean {
  if (!Number.isFinite(year)) return false
  const y = Math.floor(year)
  return seeded(`${familySeed(g)}|clash|actor|${industry}|${type}|${y}${outcomeTag(g, y)}`).chance(0.3)
}

// ---------------------------------------------------------------------------
// Gross, break-even, awards

const WINDOW_GROSS: Record<Proj['window'], number> = { normal: 1, awards: 0.92, dodge: 0.95 }
const KDRAMA_EXPORT = { from: 1997, to: 2013, top: 1.6 }

function leisureOf(g: GameState, year: number): number {
  return clamp(fin(economyOf(g, g.character.countryId, year).sectors.leisure.demand, 1), 0.7, 1.3)
}

/** Korean TV export multiplier: 1.0 until 1997, rising to 1.6 by 2013. */
function exportOf(year: number): number {
  const { from, to, top } = KDRAMA_EXPORT
  return year <= from ? 1 : year >= to ? top : 1 + ((top - 1) * (year - from)) / (to - from)
}

/**
 * The gross a release earns, one formula for the hint and the roll. Film: base x scale x heat x leisure x
 * (0.25 + 1.5 (q/100)^1.6) x (1 + buzz/200) x trend x window x clash x luck (x0.3 for Nollywood before
 * 2010). TV season: base x scale x audience x (0.3 + 1.2 q/100) x (1 + buzz/200) x trend x luck, where the
 * audience is TV (or streaming) adoption times the Korean export multiplier. Heat, leisure and trend read
 * the release year (`o.year`, default this year); `o.luck` is the one random input, drawn by the caller.
 */
export function grossOf(g: GameState, p: Proj, o: { luck: number; year?: number; leisure?: number; trend?: number }): number {
  const b = BUDGETS[p.budget] ?? BUDGETS.indie
  const year = fin(o.year, g.year)
  const scale = scaleOf(g, p.industry)
  const q = clamp(fin(p.quality), 0, 100) / 100
  const buzz = 1 + clamp(fin(p.buzz), 0, 100) / 200
  const trend = clamp(fin(o.trend, trendOf(g, p.type, year)), 0, 10)
  const luck = clamp(fin(o.luck, 1), 0, 10)
  let gross: number
  if (b.kind === 'film') {
    const leisure = clamp(fin(o.leisure, leisureOf(g, year)), 0.7, 1.3)
    const window = WINDOW_GROSS[p.window] ?? 1
    const clash = p.window !== 'dodge' && clashOf(g, p.industry, p.type, year) ? 0.85 : 1
    const theatrical = p.industry === 'nollywood' && year < 2010 ? 0.3 : 1
    gross = b.gross * scale * heat(p.industry, year) * leisure * (0.25 + 1.5 * q ** 1.6) * buzz * trend * window * clash * theatrical * luck
  } else {
    const audience = techOdds(g, p.budget === 'streaming' ? 'streaming' : 'tv', year) * (p.industry === 'kdrama' ? exportOf(year) : 1)
    gross = b.gross * scale * audience * (0.3 + 1.2 * q) * buzz * trend * luck
  }
  return Number.isFinite(gross) ? Math.max(0, gross) : 0
}

/** The bar a release has to clear: 2.2 x cost x scale for a film, 1.5 x for a TV season. */
export function breakEvenOf(p: Pick<Proj, 'budget'>, scale: number): number {
  const b = BUDGETS[p.budget] ?? BUDGETS.indie
  const v = (b.kind === 'tv' ? 1.5 : 2.2) * b.cost * fin(scale, 0)
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

/**
 * Odds of winning once nominated: clamp(0.2 + (q-60)/60 + (pop-55)/150 + campaign/100 + window + studioFame/60
 * - fieldPressure, 0.03, 0.75). The awards window adds 0.08. fieldPressure = clamp((mean of the top three
 * active rivals of the type - q) / 200, 0, 0.25); with no `type` the rivals of every type compete.
 */
export function awardOdds(g: GameState, s: ActorState, c: { quality: number; popularity: number; campaign: number; window: Proj['window']; studioFame: number; type?: TypeId }): number {
  const q = clamp(fin(c.quality), 0, 100)
  const field = activeField(g, ACTOR_SPEC, s.memory)
    .filter((x) => !c.type || x.rival.edge === c.type)
    .slice(0, 3)
  const mean = field.length ? field.reduce((n, x) => n + x.score, 0) / field.length : 0
  const fieldPressure = field.length ? clamp((mean - q) / 200, 0, 0.25) : 0
  const odds = 0.2 + (q - 60) / 60 + (clamp(fin(c.popularity), 0, 100) - 55) / 150 + clamp(fin(c.campaign), 0, 30) / 100 + (c.window === 'awards' ? 0.08 : 0) + clamp(fin(c.studioFame), 0, 10) / 60 - fieldPressure
  return clamp(odds, 0.03, 0.75)
}
