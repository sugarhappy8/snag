// Bounded, plain-JSON state only. This module deliberately has no runtime imports
// from the economy or business engines, so it is safe at the persistence boundary.
export const RIVAL_LIMIT = 192
export type RivalOutcome = 'steady' | 'expanded' | 'adopting' | 'distressed' | 'failed'
export interface RivalPoint {
  year: number; cash: number; debt: number; capacity: number; adoption: number; strength: number; outcome: RivalOutcome
}
export interface RivalActor extends RivalPoint {
  key: string; industry: string; scope: string; id: string; hq: string; real: boolean
  /** Cash and debt are annual operating-cost buffers, never dollars in a player account. */
  history: RivalPoint[]
  cause: string
}
const outcomes: RivalOutcome[] = ['steady', 'expanded', 'adopting', 'distressed', 'failed']
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const n = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
const identifier = (v: unknown, max = 100) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[a-zA-Z0-9_.:-]+$/.test(v) ? v : ''
export function rivalActorKey(industry: string, scope: string, id: string): string { return `${industry}|${scope}|${id}` }
function point(raw: Record<string, unknown>, year: number): RivalPoint {
  const outcome = outcomes.includes(raw.outcome as RivalOutcome) ? raw.outcome as RivalOutcome : 'steady'
  return { year: Math.floor(n(raw.year, year, 1900, year)), cash: n(raw.cash, .5, 0, 8), debt: n(raw.debt, 0, 0, 8),
    capacity: n(raw.capacity, 1, .15, 3), adoption: n(raw.adoption, 0, 0, 1),
    strength: outcome === 'failed' ? 0 : n(raw.strength, 1, .1, 3), outcome }
}
/** Unknown/missing old-save fields create no actors; canonical identities are checked
 * against the existing roster by the annual engine before an actor can affect a market. */
export function normalizeRivals(value: unknown, year: number): RivalActor[] {
  if (!Array.isArray(value)) return []
  const rows = new Map<string, RivalActor>()
  for (const item of value.slice(0, RIVAL_LIMIT * 4)) {
    const raw = rec(item), industry = identifier(raw.industry, 40), scope = identifier(raw.scope, 10), id = identifier(raw.id)
    if (!industry || !scope || !id || (scope !== 'world' && !/^[a-z]{2}$/.test(scope))) continue
    const key = rivalActorKey(industry, scope, id)
    if (raw.key !== key || rows.has(key)) continue
    const current = point(raw, Math.max(1900, year))
    const history = new Map<number, RivalPoint>()
    if (Array.isArray(raw.history)) for (const item of raw.history.slice(-12)) {
      const row = rec(item)
      if (typeof row.year !== 'number' || !Number.isFinite(row.year) || row.year < 1900 || row.year > current.year) continue
      const h = point(row, current.year)
      history.set(h.year, h)
    }
    rows.set(key, { key, industry, scope, id, hq: /^[a-z]{2}$/.test(String(raw.hq)) ? String(raw.hq) : 'us', real: raw.real === true,
      ...current, history: [...history.values()].sort((a, b) => a.year - b.year).slice(-6), cause: typeof raw.cause === 'string' ? raw.cause.slice(0, 160) : '' })
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, RIVAL_LIMIT)
}
