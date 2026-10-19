// AI Lab 2.0 world firsts: the milestones a lab reached before any rival, kept in g.flags.aiFirsts
// (world state: the whole family shares it, so an heir can't claim a first again). This file reads and
// validates the record; the writer that claims a first is added with the release code.
import type { GameState, Json } from '../types'
import { isCapId } from './ai-bench-data'
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
