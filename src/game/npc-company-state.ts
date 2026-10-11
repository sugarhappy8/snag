import type { Asset, Json, Person } from './types'
import { normalizeBiz, type BizState } from './business/state'
import { rec } from './business/util'

/** Pure shared reader: market planners must not depend on NPC settlement or mutate saves. */
export function npcCompany(p: Person, year: number): { a: Asset; b: BizState } | null {
  const raw = rec(p.data.npcCompany), d = rec(raw?.details)
  if (!raw || !d || typeof raw.id !== 'string' || typeof raw.name !== 'string' || raw.kind !== 'business') return null
  const a = structuredClone(raw) as unknown as Asset
  const b = normalizeBiz(d, year)
  b.npcOwnerId = p.id
  a.details = b as unknown as Record<string, Json>
  return { a, b }
}
