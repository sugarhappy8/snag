// Private financial methods never enter the product, patent or public-news systems.
import { formatMoney, notice } from '../core'
import { inventionTopic } from '../inventor-data'
import { readInventionIp, type InventionIp } from '../inventor-state'
import type { Asset, GameState, Json, MenuNode } from '../types'
import { ownerControls } from './board'
import { isFinanceFirm } from './finance-firm-state'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { leadershipPower } from './leadership'

export interface ClosedInvention { id: string; name: string; topic: string; kind: InventionIp['kind']; created: number; updated: number; quality: number; inventor: string; contributors: string }
const bounded = (v: unknown, fallback: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback
export function closedInventions(b: BizState): ClosedInvention[] {
  const seen = new Set<string>()
  return (Array.isArray(b.closedInventions) ? b.closedInventions : []).flatMap(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const d = value, topic = typeof d.topic === 'string' ? inventionTopic(d.topic) : null
    if (typeof d.id !== 'string' || !d.id || seen.has(d.id) || !topic || topic.field !== 'finance') return []
    seen.add(d.id)
    return [{ id: d.id, name: typeof d.name === 'string' ? d.name.slice(0, 80) : topic.name, topic: topic.id, kind: topic.tier, created: bounded(d.created, 0, 100000), updated: bounded(d.updated, bounded(d.created, 0, 100000), 100000), quality: bounded(d.quality, 50, 100), inventor: typeof d.inventor === 'string' ? d.inventor.slice(0, 160) : '', contributors: typeof d.contributors === 'string' ? d.contributors.slice(0, 160) : '' }]
  }).slice(-40)
}
export function installClosedInvention(b: BizState, a: Asset): boolean {
  const ip = readInventionIp(a), rows = closedInventions(b)
  if (!ip?.closedLoop || ip.field !== 'finance' || !isFinanceFirm(b) || rows.some(row => row.id === a.id || row.topic === ip.topic)) return false
  rows.push({ id: a.id, name: a.name, topic: ip.topic, kind: ip.kind, created: ip.created, updated: ip.created, quality: Math.min(100, (ip.reliability ?? 1) * 60 + (ip.marketFit ?? 1) * 20), inventor: ip.inventor ?? '', contributors: ip.contributors ?? '' })
  b.closedInventions = rows as unknown as Json
  return true
}
export function closedInventionEffects(b: BizState, year: number) {
  let alpha = 0, risk = 0, execution = 0
  for (const row of closedInventions(b).filter(row => row.created <= year)) {
    const freshness = 1 / (1 + Math.max(0, year - row.updated) * .12)
    const strength = freshness * row.quality / 100 * (.5 + .25 * Math.min(2, leadershipPower(b, 'quality') + leadershipPower(b, 'finance')))
    if (row.topic === 'private-risk-model') risk += .28 * strength
    if (row.topic === 'private-execution') execution += .25 * strength
    if (row.topic === 'private-market-model') alpha += .22 * strength
    if (row.topic === 'private-capital-engine') { alpha += .4 * strength; risk += .2 * strength; execution += .15 * strength }
  }
  return { alpha: Math.min(.65, alpha), risk: Math.min(.55, risk), execution: Math.min(.5, execution) }
}
export function refreshClosedInvention(g: GameState, assetId: string, id: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !ownerControls(g, a)) return false
  const b = bizOf(g, a), rows = closedInventions(b), row = rows.find(row => row.id === id)
  if (!row || !isFinanceFirm(b) || row.updated >= g.year) return false
  const cost = { small: 5000, middle: 25000, big: 100000, generational: 500000 }[row.kind]
  if (b.cash < cost) return false
  b.cash -= cost; b.yearCosts += cost; row.updated = g.year
  row.quality = Math.min(100, row.quality + 3 + leadershipPower(b, 'quality') * 4)
  b.closedInventions = rows as unknown as Json
  notice(g, 'Private Model Revalidated', `${a.name} paid ${formatMoney(cost)} for fresh data and confidential validation. The system stays internal. Its performance still depends on your team and strategy capacity.`, { emoji: '🔒' })
  return true
}
export function closedInventionNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), effect = closedInventionEffects(b, g.year)
  return [{ type: 'info', id: `finance.secrets.${a.id}`, text: `Closed-loop research: ${closedInventions(b).length} confidential systems. Modeled research edge +${(effect.alpha * 100).toFixed(1)} percentage points before capacity limits; credit/operational risk −${Math.round(effect.risk * 100)}%; execution costs −${Math.round(effect.execution * 100)}%. No patents, public announcements, product sales or external licences. Systems age as markets change; revalidation restores freshness.` },
    ...closedInventions(b).map((row): MenuNode => ({ type: 'action', id: `finance.secret.${a.id}.${row.id}`, label: `Revalidate ${row.name}`, emoji: '🔒', subtitle: `Lead inventor: ${row.inventor} · quality ${Math.round(row.quality)}/100 · last validated ${row.updated} · ${formatMoney({ small: 5000, middle: 25000, big: 100000, generational: 500000 }[row.kind])} company funds`, disabledReason: gg => { const aa = findBusiness(gg, a.id); if (!aa) return 'Company unavailable.'; const bb = readBiz(gg, aa), rr = closedInventions(bb).find(r => r.id === row.id); return manageBlock(gg, aa) ?? (!ownerControls(gg, aa) ? 'Requires company control.' : !rr ? 'System unavailable.' : rr.updated >= gg.year ? 'Already validated this year.' : bb.cash < { small: 5000, middle: 25000, big: 100000, generational: 500000 }[rr.kind] ? 'Not enough company cash.' : null) }, run: gg => { refreshClosedInvention(gg, a.id, row.id) } }))]
}
