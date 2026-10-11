import type { Json } from '../types'
import { clampN, num, rec, str } from './util'

export interface FamilyShare { id: string; share: number }

/** Finite, merged ownership records, bounded by the equity actually available. */
export function readFamilyShares(v: Json | undefined, available = 1): FamilyShare[] {
  const byId = new Map<string, number>()
  if (Array.isArray(v)) for (const row of v) {
    const d = rec(row), id = str(d?.id)
    if (id) byId.set(id, (byId.get(id) ?? 0) + clampN(num(d?.share), 0, 1))
  }
  const sum = [...byId.values()].reduce((s, x) => s + x, 0)
  const scale = sum > available ? Math.max(0, available) / sum : 1
  return [...byId].map(([id, share]) => ({ id, share: share * scale })).filter(x => x.share > 0)
}
