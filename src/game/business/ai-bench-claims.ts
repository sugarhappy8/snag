// AI Lab 2.0 world firsts: the milestones a lab reached before any rival, kept in g.flags.aiFirsts
// (world state: the whole family shares it, so an heir can't claim a first again). This file reads and
// validates the record, and claimFirsts writes it when a model is released.
import { log } from '../core'
import type { Asset, GameState, Json } from '../types'
import { benchYear, capMilestone } from './ai-bench'
import { CAPS, CAP_IDS, isCapId } from './ai-bench-data'
import { marketYear } from './ai-bench-market'
import { familyId } from './competition-roster'
import type { AiModel, TechState } from './deeptech-state'
import type { BizState } from './state'
import { announceWave } from './tech-waves'
import { clampN, num, rec, str } from './util'

export const AI_FIRSTS_KEY = 'aiFirsts'

/** One recorded first. A type alias (not an interface) so it stays assignable to Json in g.flags. */
export type AiFirst = { year: number; lab: string }

/** Most claims kept: three milestones for each of the eight capabilities. */
const MAX_FIRSTS = 24
const MAX_LAB = 60
const FIRST_KEY = /^([a-z]+)\.([123])$/

/** The recorded firsts, keyed `${CapId}.${1|2|3}`: well-formed entries only, at most 24. Never writes. */
export function readAiFirsts(g: Pick<GameState, 'flags'>): Readonly<Record<string, AiFirst>> {
  const out: Record<string, AiFirst> = {}
  const raw = rec(g.flags?.[AI_FIRSTS_KEY])
  if (!raw) return out
  let kept = 0
  for (const key of Object.keys(raw)) {
    if (kept >= MAX_FIRSTS) break
    const m = FIRST_KEY.exec(key)
    if (!m || !isCapId(m[1])) continue
    const v = rec(raw[key])
    if (!v || typeof v.year !== 'number' || !Number.isFinite(v.year)) continue
    const lab = str(v.lab).trim().slice(0, MAX_LAB)
    if (!lab) continue
    out[key] = { year: clampN(Math.round(num(v.year)), 2012, 2300), lab }
    kept++
  }
  return out
}

/** The part of the world's AI firsts an heir inherits (validated, and nothing at all when there are none). */
export function benchWorldFlags(g: Pick<GameState, 'flags'>): Record<string, Json> {
  const firsts = readAiFirsts(g)
  return Object.keys(firsts).length ? { [AI_FIRSTS_KEY]: firsts } : {}
}

/**
 * Claims every milestone `m` reaches before the market does, once for the whole family: a world record,
 * hype, brand, a sliver of price premium, one log line and a wave each. Runs when a model is released, not
 * trained, because a held model isn't public. A model with no rating claims nothing. The claim year is the
 * later of the model's year and the last closed fiscal year, so a model held for years can't claim what the
 * market has passed since, and the market wins a tie. Draws nothing. Returns the keys it claimed.
 */
export function claimFirsts(g: GameState, a: Asset, b: BizState, t: TechState, m: AiModel): string[] {
  if (!m.rating) return []
  const fam = familyId(g.lifeId)
  const year = Math.max(m.year, benchYear(g))
  const claimed: string[] = []
  let known = readAiFirsts(g)
  for (const c of CAP_IDS) {
    const rating = m.rating[c]
    if (rating === undefined) continue
    for (const k of [1, 2, 3] as const) {
      const key = `${c}.${k}`
      if (rating < capMilestone(c, k) || key in known || !(year < marketYear(fam, c, k))) continue
      known = { ...known, [key]: { year, lab: a.name } }
      g.flags[AI_FIRSTS_KEY] = known
      if (!t.firsts.includes(key)) t.firsts.push(key)
      t.hype = clampN(t.hype + 12, 0, 100)
      b.brand = clampN(b.brand + 4, 0, 100)
      t.premium = clampN(t.premium + 0.01, 0, 1)
      log(g, `${a.name} reached ${capMilestone(c, k)} in ${CAPS[c].label.toLowerCase()} before any rival.`, 'good')
      // The claim stands even when the wave is refused (a third non-rival wave in a year). `by` makes it a deep-tech wave of the player's own company for the insider rule (wave-insider.ts).
      announceWave(g, { kind: 'ai', source: 'deeptech', origin: `${a.id}#first.${key}`, name: `Frontier ${CAPS[c].label.toLowerCase()}`, size: 0.2 + 0.1 * k, market: 'world', home: b.countryId, by: a.id })
      claimed.push(key)
    }
  }
  return claimed
}
