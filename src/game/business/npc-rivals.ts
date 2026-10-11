import type { GameState, Json } from '../types'
import { rec, num } from './util'
import type { BizState } from './state'
import type { FieldRival, MarketCtx } from './competition-core'

/** Real, funded NPC firms enter the same demand model as named competitors. Pure and cheap:
 * planners call this thousands of times, so read only the small operating snapshot, not an Asset
 * clone or another company's planner (which would recurse). A company never competes with itself.
 */
export function applyNpcRivals(g: GameState, b: BizState, ctx: MarketCtx): MarketCtx {
  const additions: FieldRival[] = []
  const add = (a: Record<string, Json> | null, prefix: string) => {
    const d = rec(a?.details)
    if (!a || !d || d.industry !== b.industry) return
    if (ctx.key !== 'world' && d.countryId !== ctx.key) return
    const founded = num(d.founded, g.year)
    if (founded > ctx.year || typeof a.id !== 'string' || typeof a.name !== 'string') return
    const last = rec(d.last)
    // The first year uses funded production capacity. Thereafter recorded sales determine scale.
    const units = last && num(last.year) <= ctx.year ? num(last.sold) : num(d.production)
    const pull = Math.min(50, Math.max(0, units / Math.max(.000001, ctx.dRef)))
    if (!pull) return
    additions.push({ id: `${prefix}:${a.id}`, name: a.name, hq: String(d.countryId ?? 'us'), founded,
      quality: num(d.quality, 50), tech: num(d.tech, 50), legacy: false, real: false,
      tier: pull >= 5 ? 'giant' : pull >= 1 ? 'major' : 'small', pull, prev: 0 })
  }
  for (const p of g.people) {
    if (p.alive && p.id !== b.npcOwnerId) add(rec(p.data.npcCompany), 'npc')
  }
  // Competition works both ways: an independent child also faces your operating companies.
  if (b.npcOwnerId) for (const a of g.assets) if (a.kind === 'business') add(a as unknown as Record<string, Json>, 'owned')
  if (!additions.length) return ctx
  return { ...ctx, rivals: [...ctx.rivals, ...additions], F: ctx.F + additions.reduce((sum, r) => sum + r.pull, 0) }
}
