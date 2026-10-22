// The frontier side of the tech waves (R3-F3, R3-F4): which research field a wave kind belongs to, and the push of a wave or of
// disclosed research into the world frontier (world/frontier.ts, g.world.frontier). A leaf: it imports the world layer and types
// only, so it stays out of the 59-module business cycle (test/architecture.test.ts proves it). tech-waves.ts calls it from the
// one wave writer (`announceWave`) and from `announceResearch`, so no wave writer is edited.
import type { GameState } from '../types'
import { applyDisclosure, originKey, type DisclosureResult } from '../world/frontier'
import { fieldOfKind, isFieldId } from '../world/frontier-fields'
import type { TechWave } from './tech-wave-factors'
import type { WaveKind } from './tech-wave-data'

/** The 12 future-facing wave kinds (the kinds no history row uses), which are also the 12 non-AI-capability field ids of world/frontier-fields.ts. test/tech-waves-effort.test.ts keeps the list equal to the data. */
const FUTURE_KINDS: readonly WaveKind[] = ['ai', 'chips', 'drug', 'space', 'ev', 'automation', 'quantum', 'security', 'fusion', 'neuro', 'drones', 'carbon']
/** The 8 AI capabilities (ai-bench-data.ts CAP_IDS), the `ai.<cap>` fields: each is a part of the `ai` kind. */
const AI_CAPS: readonly string[] = ['language', 'coding', 'vision', 'speech', 'reasoning', 'agents', 'robotics', 'science']

/**
 * The wave kind a research field writes, or null: the 12 future-facing kinds map to themselves, an `ai.<capability>` field to `ai`.
 * A history kind (`cloud`), an unknown field and junk (`constructor`, `__proto__`, a non-string) are null. Pure.
 */
export function kindOfField(field: string): WaveKind | null {
  if (typeof field !== 'string') return null
  const head = field.startsWith('ai.') && AI_CAPS.includes(field.slice(3)) ? 'ai' : field
  const i = FUTURE_KINDS.indexOf(head as WaveKind)
  return i < 0 ? null : FUTURE_KINDS[i]
}

/**
 * Push a wave `announceWave` has just stored into the frontier. The field is the wave kind's own (`fieldOfKind`), or `field` when the
 * caller narrows it to an AI capability (`ai.reasoning`: spill only, no lead). A field that is not one, or that does not belong to
 * the wave's kind, and a history kind (`cloud`, `smartphone`) push nothing and give null. The row is the wave's `id`, so one wave is
 * one row, and a rival wave is a `rival` row (everything else is the player's side). It is dated the wave's year, but never after
 * `g.year`: a heavy launch is dated the year after the project finished, and the research is disclosed now (no foresight, so the
 * frontier never reads a year that has not come). A year up to 2026 changes nothing (history is fixed). The answer is the writer's;
 * the luck is its named stream and nothing here draws on `g.rng`.
 */
export function pushFromWave(g: GameState, w: TechWave, field?: string): DisclosureResult | null {
  const f = field === undefined ? fieldOfKind(w.kind) : field
  if (!isFieldId(f) || kindOfField(f) !== w.kind) return null
  return applyDisclosure(g, { field: f, year: Math.min(w.year, Math.round(g.year)), size: w.size, origin: w.id, by: w.source === 'rival' ? 'rival' : 'you', market: w.market })
}

/** Research that made no wave: the field, how big, what it came from and where. */
export interface ResearchPush {
  field: string
  size: number
  origin: string
  market?: string
}

/**
 * Push disclosed research that made no wave (a size under the wave minimum, or a wave the rules refused) into the frontier, dated
 * `g.year` and always the player's side. The row's origin is `effort:` and the disclosure's origin (hashed when that would not fit
 * the 64 characters a row may name), so a repeat of the same disclosure in a year is refused by the writer, and a disclosure that
 * made a wave (pushed by `pushFromWave` under the wave id) is never pushed again. Null for a field that is not one.
 */
export function pushResearch(g: GameState, r: ResearchPush): DisclosureResult | null {
  if (!isFieldId(r.field)) return null
  const named = `effort:${r.origin}`
  const origin = named.length <= 64 ? named : `effort:#${originKey(r.origin)}`
  return applyDisclosure(g, { field: r.field, year: Math.round(g.year), size: r.size, origin, by: 'you', market: r.market ?? 'world' })
}
