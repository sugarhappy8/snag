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

// ---------------------------------------------------------------------------
// Seeded generators: stable for a key, no g.rng consumption. Moved verbatim from assets.ts (R2-K5), which still re-exports seeded and SRng.

export interface SRng {
  next(): number
  int(min: number, max: number): number
  float(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(xs: readonly T[]): T
  weighted<T>(xs: readonly T[], w: (x: T) => number): T
}

/** FNV-1a over the UTF-16 units of `s`, as a signed 32-bit integer: a stable seed from a text key. */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/** A generator that depends only on `key`: the same key gives the same draws, and nothing reads or advances g.rng. */
export function seeded(key: string): SRng {
  let state = hashString(key)
  const next = (): number => {
    const [v, s] = nextRandom(state)
    state = s
    return v
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: (xs, w) => {
      const total = xs.reduce((s, x) => s + Math.max(0, w(x)), 0)
      let roll = next() * total
      for (const x of xs) {
        roll -= Math.max(0, w(x))
        if (roll < 0) return x
      }
      return xs[xs.length - 1]
    },
  }
}
