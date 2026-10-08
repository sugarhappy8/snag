// Shared helpers for the 1900-1979 era packs: where in the world a life is lived, how well off the
// family is, and a compact way to declare a flavor pool. A Nigerian child does not get an American
// drive-in, so every pool and popup names the places it fits.
import { children as childrenOf, currentPartner, parents, peopleBy } from '../core'
import { hasSnow } from '../data/locales'
import { homeFrontAt, warsAt } from '../history/events-wars'
import { realWealthFactor } from '../history/events-people'
import type { GameState } from '../types'
import { getCountry } from '../world'
import type { EraFlavorPool } from './era-life'

export type Place = 'us' | 'uk' | 'dominion' | 'europe' | 'japan' | 'china' | 'easia' | 'india' | 'brazil' | 'latam' | 'nigeria' | 'southafrica' | 'indonesia' | 'seasia' | 'mena' | 'other'

const UK = ['gb', 'ie']
const DOMINION = ['ca', 'au', 'nz']
const JAPAN = ['jp']
const CHINA = ['cn']
const INDIA = ['in', 'pk', 'bd', 'np']
const SUB_SAHARA = ['ng', 'ke', 'ug', 'et', 'cd', 'ao', 'zw', 'dj']
const SEASIA = ['my', 'ph', 'th', 'vn', 'sg']
const EASIA = ['kr', 'tw', 'hk', 'mn']
const MENA = ['eg', 'dz', 'ma', 'tn', 'tr', 'ir', 'iq', 'jo', 'lb', 'sy', 'sa', 'kw', 'qa', 'ae', 'il']

/** The broad place a life is lived in, for the packs' regional lines. */
export function placeOf(g: GameState): Place {
  const id = g.character.countryId
  if (id === 'us') return 'us'
  if (UK.includes(id)) return 'uk'
  if (DOMINION.includes(id)) return 'dominion'
  if (JAPAN.includes(id)) return 'japan'
  if (CHINA.includes(id)) return 'china'
  if (INDIA.includes(id)) return 'india'
  if (id === 'br') return 'brazil'
  if (id === 'za') return 'southafrica'
  if (id === 'id') return 'indonesia'
  if (SUB_SAHARA.includes(id)) return 'nigeria'
  if (SEASIA.includes(id)) return 'seasia'
  if (EASIA.includes(id)) return 'easia'
  if (MENA.includes(id)) return 'mena'
  const c = getCountry(id)
  if (c.continent === 'Europe') return 'europe'
  if (c.continent === 'North America' || c.continent === 'South America') return 'latam'
  return 'other'
}

export function at(g: GameState, ...places: Place[]): boolean {
  return places.includes(placeOf(g))
}

/** The country is one of these ids. */
export function inCountry(g: GameState, ...ids: string[]): boolean {
  return ids.includes(g.character.countryId)
}

/** The places where mid-century everyday life looked like the industrial West's (or its imitators'). */
export const WESTERN: readonly Place[] = ['us', 'uk', 'dominion', 'europe']

export function western(g: GameState): boolean {
  return WESTERN.includes(placeOf(g))
}

/** Rich-world dominions and Europe: the kind of country with paved streets and an iceman by the 1920s. */
export function richCountry(g: GameState): boolean {
  return getCountry(g.character.countryId).wealth >= 0.6
}

/** Wealth the family could count on: the engine money of the best-off living parent (a child) or the player. */
function familyMoney(g: GameState): number {
  const c = g.character
  if (c.age < 18) return Math.max(0, ...parents(g).filter((p) => p.alive).map((p) => p.money))
  return Math.max(0, c.money)
}

/** What a typical family had in this country and year (engine money). */
function reference(g: GameState): number {
  const w = Math.max(0.15, Math.min(1.3, getCountry(g.character.countryId).wealth))
  return 40_000 * w * realWealthFactor(g.year)
}

export type Station = 'poor' | 'middle' | 'rich'

/** How well off the household was compared with its neighbors that year. */
export function stationOf(g: GameState): Station {
  const ratio = familyMoney(g) / reference(g)
  if (ratio < 0.7) return 'poor'
  if (ratio >= 2.2) return 'rich'
  return 'middle'
}

export function poorFamily(g: GameState): boolean {
  return stationOf(g) === 'poor'
}

export function richFamily(g: GameState): boolean {
  return stationOf(g) === 'rich'
}

/** The country is at war (a world war or another) and fighting or bombs reach its own soil. */
export function homeFrontNow(g: GameState): boolean {
  return warsAt(g.character.countryId, g.year).some((w) => homeFrontAt(w, g.character.countryId))
}

/** Countries that rationed food in or after the Second World War (history/events RATIONING, abridged to the big ones). */
const RATIONED: Readonly<Record<string, readonly [number, number]>> = {
  gb: [1940, 1954], ie: [1942, 1952], de: [1939, 1950], at: [1939, 1950], fr: [1940, 1949], it: [1940, 1949], nl: [1940, 1949], be: [1940, 1949],
  no: [1940, 1952], dk: [1940, 1948], fi: [1939, 1954], jp: [1941, 1952], ru: [1941, 1947], pl: [1939, 1949], cz: [1939, 1953], hu: [1940, 1951],
  gr: [1941, 1949], us: [1942, 1946], ca: [1942, 1947], au: [1942, 1950], nz: [1942, 1950],
}

export function rationed(g: GameState): boolean {
  const r = RATIONED[g.character.countryId]
  return !!r && g.year >= r[0] && g.year <= r[1]
}

/** True if the player's country gets cold winters with snow. */
export function snowy(g: GameState): boolean {
  return hasSnow(g)
}

export interface PoolSpec {
  from?: number
  to?: number
  /** Inclusive age range. */
  age?: readonly [number, number]
  /** Places the pool fits (all places when omitted). */
  at?: readonly Place[]
  /** Places it does not fit. */
  not?: readonly Place[]
  /** Family station (a child's parents, an adult's own savings). */
  station?: Station
  /** Extra condition. */
  when?: (g: GameState) => boolean
}

/** One flavor pool: key, strength among the year's pools, who and when it fits, and its lines. */
/**
 * The village and small-town pools name 'seasia' as their catch-all for Asian places without a pool
 * of their own; Korea, Taiwan, Hong Kong, Mongolia and the rest of the world ('other': Oceania and
 * Central Asia) share them, so no life is left without period texture.
 */
function widen(places: readonly Place[] | undefined): readonly Place[] | undefined {
  if (!places || !places.includes('seasia')) return places
  return [...places, 'easia', 'other']
}

export function pool(key: string, weight: number, spec: PoolSpec, lines: readonly string[]): EraFlavorPool {
  const { not, station, when } = spec
  const places = widen(spec.at)
  const gate = places || not || station || when ? (g: GameState): boolean => (!places || places.includes(placeOf(g))) && (!not || !not.includes(placeOf(g))) && (!station || stationOf(g) === station) && (!when || when(g)) : undefined
  const out: EraFlavorPool = { key, lines, weight }
  if (spec.from !== undefined) out.from = spec.from
  if (spec.to !== undefined) out.to = spec.to
  if (spec.age) {
    out.minAge = spec.age[0]
    out.maxAge = spec.age[1]
  }
  if (gate) out.when = gate
  return out
}

// ---------------------------------------------------------------------------
// Lines about a household: no one remembers a honeymoon they never had

type Need = 'grand' | 'kids' | 'partner'

const GRAND = /\b(grandchild|grandchildren|great-grandchild|grandkids?)\b/i
const KIDS = /\b(my children|my child|my son|my daughter|our (baby|daughter|son|children)|the nursery|the baby|new baby|we had a baby|baby’s|the children|children’s)\b/i
const KIDS_SKIP = /Sunday school|bomb site|followed|ran after|neighbors’ children|children play/i
const PARTNER = /\b(I married|my husband|my wife|my spouse|honeymoon|mother-in-law|in-laws|church wedding|our wedding|married life|start married|getting married|get married|\{partner\})/i

function needOf(line: string): Need | null {
  const text = line.replace(/^@[\w!+,-]+\s+/, '')
  if (GRAND.test(text)) return 'grand'
  if (KIDS.test(text) && !KIDS_SKIP.test(text)) return 'kids'
  if (PARTNER.test(text)) return 'partner'
  return null
}

function hasNeed(g: GameState, need: Need): boolean {
  if (need === 'grand') return peopleBy(g, ['grandchild']).length > 0
  if (need === 'kids') return childrenOf(g).length > 0
  return !!currentPartner(g) || (g.counters.marriages ?? 0) > 0
}

/**
 * Adult and elder pools mention husbands, babies and grandchildren; a life without them must not
 * be told it had them. Each such line moves to a sibling pool that applies only when the player
 * has that household, with the original pool's weight shared out by line count. Pools for
 * children and teenagers (and any line about no one in particular) stay as written.
 */
export function familyAware(pools: readonly EraFlavorPool[]): EraFlavorPool[] {
  const out: EraFlavorPool[] = []
  for (const p of pools) {
    if ((p.minAge ?? 0) < 16) {
      out.push(p)
      continue
    }
    const groups: Record<Need | 'none', string[]> = { grand: [], kids: [], partner: [], none: [] }
    for (const line of p.lines) groups[needOf(line) ?? 'none'].push(line)
    for (const need of ['none', 'grand', 'kids', 'partner'] as const) {
      const lines = groups[need]
      if (!lines.length) continue
      const weight = Math.max(1, Math.round((p.weight * lines.length) / p.lines.length))
      const base = p.when
      out.push({
        ...p,
        key: need === 'none' ? p.key : `${p.key}+${need}`,
        lines,
        weight: need === 'none' ? Math.max(weight, Math.round(p.weight * 0.5)) : weight,
        when: need === 'none' ? base : (g) => (!base || base(g)) && hasNeed(g, need),
      })
    }
  }
  // The generic pools run at weight 3-10 and there are one or two lines a year: lean toward the year's own texture.
  return out.map((p) => ({ ...p, weight: Math.max(1, Math.round(p.weight * 1.4)) }))
}
