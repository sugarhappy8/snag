// Coding skill and related at-home computer stats (plain JSON in g.flags). Owned by the dev
// side (computer/dev.ts); the money side reads it (a better coder writes a slicker scam site).
import type { GameState } from '../types'

const KEY = 'codingSkill'

/** Coding skill 0-100 (0 = has never written a line). */
export function codingSkill(g: GameState): number {
  const v = g.flags[KEY]
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0
}

/** Add (or remove) coding skill, clamped to 0-100. Returns the new value. */
export function addCodingSkill(g: GameState, delta: number): number {
  const next = Math.max(0, Math.min(100, Math.round(codingSkill(g) + (Number.isFinite(delta) ? delta : 0))))
  g.flags[KEY] = next
  return next
}
