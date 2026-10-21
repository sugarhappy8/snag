// Seeded RNG stored in GameState so lives are reproducible and testable.
// mulberry32: small, fast, good enough for a game.
import type { GameState } from './types'

export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0
  const next = t
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** Uniform float in [0, 1). Advances g.rng. */
export function rand(g: GameState): number {
  const [value, next] = nextRandom(g.rng)
  g.rng = next
  return value
}

/** Integer in [min, max] inclusive. */
export function randInt(g: GameState, min: number, max: number): number {
  if (max < min) [min, max] = [max, min]
  return min + Math.floor(rand(g) * (max - min + 1))
}

/** Float in [min, max). */
export function randFloat(g: GameState, min: number, max: number): number {
  return min + rand(g) * (max - min)
}

/** True with probability p (0-1). */
export function chance(g: GameState, p: number): boolean {
  return rand(g) < p
}

export function pick<T>(g: GameState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list')
  return items[Math.floor(rand(g) * items.length)]
}

/** A function that picks one item of a list. pick is one; so is a text draw that closes over its own stream (R2-B2: flavor passes one to the helpers it calls). */
export type Picker = <T>(g: GameState, items: readonly T[]) => T

/** Pick by weight; items with weight <= 0 are never picked. */
export function weightedPick<T>(g: GameState, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0)
  if (total <= 0) return pick(g, items)
  let roll = rand(g) * total
  for (const item of items) {
    roll -= Math.max(0, weight(item))
    if (roll < 0) return item
  }
  return items[items.length - 1]
}

export function shuffle<T>(g: GameState, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Roughly normal value via the average of 3 uniforms, scaled to [min, max]. */
export function bell(g: GameState, min: number, max: number): number {
  const r = (rand(g) + rand(g) + rand(g)) / 3
  return Math.round(min + r * (max - min))
}

/** Unique id within this life, e.g. "p42". */
export function uid(g: GameState, prefix = 'id'): string {
  g.nextId += 1
  return `${prefix}${g.nextId}`
}

/** A fresh seed from Math.random (only used when starting a new life). */
export function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
