// Explicit internal contracts. Invoices move cash, and only avoided external costs less
// real delivery expense create consolidated profit. No unlimited sister-company revenue.
import { log, notice } from '../core'
import type { GameState, Json, MenuNode } from '../types'
import { ownerControls } from './board'
import { groupById, liveGroup, type Group } from './conglomerate-state'
import { refreshValue, valuationOf } from './economy'
import { industryEraBlock } from './competition-data'
import { manageBlock } from './gate'
import type { BizState, Statement } from './state'
import { clampN, money, num, rec } from './util'
import { allocatedCorporateTax } from './tax'

interface Contract { provider: string; customer: string; group: string }
type CostKey = 'marketing' | 'cogs' | 'upkeep' | 'rent' | 'interest'
const SERVICE: Record<string, { label: string; key: CostKey; share: number }> = {
  marketing: { label: 'Advertising', key: 'marketing', share: 1 },
  logistics: { label: 'Distribution', key: 'cogs', share: .1 },
  software: { label: 'Business software', key: 'upkeep', share: .4 },
  manufacturing: { label: 'Components', key: 'cogs', share: .2 },
  realEstate: { label: 'Commercial premises', key: 'rent', share: .3 },
  investmentFirm: { label: 'Treasury administration', key: 'upkeep', share: .15 },
}
export function serviceContracts(g: GameState): Contract[] {
  const list = g.flags.groupServices
  if (!Array.isArray(list)) return []
  return list.slice(0, 120).flatMap(x => { const v = rec(x); return v && typeof v.provider === 'string' && typeof v.customer === 'string' && typeof v.group === 'string' ? [{ provider: v.provider, customer: v.customer, group: v.group }] : [] })
}
export function hasInternalServices(g: GameState, customer: string): boolean { return serviceContracts(g).some(x => x.customer === customer) }
function valid(g: GameState, grp: Group, c: Contract): boolean {
  const p = grp.members.find(x => x.a.id === c.provider), q = grp.members.find(x => x.a.id === c.customer)
  if (!p || !q || p === q || p.m.own < .999 || q.m.own < .999 || p.b.countryId !== q.b.countryId || !SERVICE[p.b.industry]) return false
  if (industryEraBlock(p.b.industry, p.b.countryId, g.year)) return false
  if (p.b.outlets.some(o => o.countryId !== p.b.countryId) || q.b.outlets.some(o => o.countryId !== q.b.countryId)) return false
  if (p.b.industry === 'manufacturing' && !['manufacturing', 'fashion', 'furniture', 'packaging', 'robotics', 'electricVehicles', 'semiconductor'].includes(q.b.industry)) return false
  return true
}
export function toggleService(g: GameState, group: string, provider: string, customer: string): boolean {
  const grp = groupById(g, group), c = { group, provider, customer }
  if (!grp || manageBlock(g, grp.members[0].a) || grp.core.share <= .5 || !grp.members.every(x => ownerControls(g, x.a))) return false
  let list = serviceContracts(g)
  const exists = list.some(x => x.provider === provider && x.customer === customer)
  if (exists) list = list.filter(x => x.provider !== provider || x.customer !== customer)
  else { if (list.length >= 120 || !valid(g, grp, c)) return false; list.push(c) }
  g.flags.groupServices = list as unknown as Json
  notice(g, 'Internal Contract', exists ? 'External procurement restored for this service.' : 'Internal service contracted from next fiscal settlement. Delivery is limited by provider capacity, buyer spending and real delivery cost; generic purchasing/back-office bonuses are excluded for this buyer.')
  return true
}
/** Add all eligible missing pairs in one write. Repeating the command never toggles anything off. */
export function assignAllServices(g: GameState, group: string): number {
  const grp = groupById(g, group)
  if (!grp || manageBlock(g, grp.members[0].a) || grp.core.share <= .5 || !grp.members.every(x => ownerControls(g, x.a))) return 0
  const list = serviceContracts(g), before = list.length
  for (const p of grp.members) for (const q of grp.members) {
    const c = { group, provider: p.a.id, customer: q.a.id }
    if (list.length >= 120 || !valid(g, grp, c) || list.some(x => x.group === group && x.provider === c.provider && x.customer === c.customer)) continue
    list.push(c)
  }
  g.flags.groupServices = list as unknown as Json
  notice(g, 'Internal Contracts Assigned', `${list.length - before} new eligible internal contracts assigned. Existing contracts were kept. The 120-contract portfolio limit, country rules, provider capacity and delivery costs still apply.`)
  return list.length - before
}
/** Hold back up to 20% of providers' delivery capacity from external customers. */
export function prepareInternalServices(g: GameState, fiscal: number): void {
  if (num(g.flags.groupServicesPrepared, -1) >= fiscal) return
  g.flags.groupServicesPrepared = fiscal
  for (const id of new Set(serviceContracts(g).map(x => x.group))) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    for (const provider of new Set(serviceContracts(g).filter(x => x.group === id && valid(g, grp, x)).map(x => x.provider))) {
      const p = grp.members.find(x => x.a.id === provider)!
      if (!p.b.last || p.b.last.year >= fiscal) continue
      p.b.capacityLoss = 1 - (1 - p.b.capacityLoss) * .8
    }
  }
}
function amend(g: GameState, b: BizState, s: Statement, before: number): void {
  // Same domestic tax basis as the original settlement; all supported contracts are domestic.
  const oldTax = s.corpTax
  const marginalTax = allocatedCorporateTax(b.countryId, s.pbt, s.revenue + s.otherIncome, 0, 0, g, s.year, b.industry) - allocatedCorporateTax(b.countryId, before, s.revenue + s.otherIncome, 0, 0, g, s.year, b.industry)
  s.corpTax = Math.max(0, oldTax + marginalTax)
  const delta = s.pbt - before - (s.corpTax - oldTax)
  s.net += delta; b.cash += delta
  const h = b.history.find(x => x.year === s.year)
  if (h) { h.revenue = s.revenue; h.profit = s.net; h.tax = s.corpTax }
  if (!b.public) b.valuation = valuationOf(b)
}
export function settleInternalServices(g: GameState, fiscal: number): void {
  if (num(g.flags.groupServicesSettled, -1) >= fiscal) return
  g.flags.groupServicesSettled = fiscal
  const records: Json[] = []
  for (const id of new Set(serviceContracts(g).map(x => x.group))) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    const remaining = new Map<string, number>()
    for (const x of grp.members) remaining.set(x.a.id, Math.max(0, (x.b.last?.netRevenue ?? 0) * .25)) // external 80% → reserved 20%
    const spent = new Map<string, number>()
    for (const c of serviceContracts(g).filter(x => x.group === id).sort((a,b) => `${a.provider}|${a.customer}`.localeCompare(`${b.provider}|${b.customer}`))) {
      if (!valid(g, grp, c)) continue
      const p = grp.members.find(x => x.a.id === c.provider)!, q = grp.members.find(x => x.a.id === c.customer)!
      const ps = p.b.last, qs = q.b.last, service = SERVICE[p.b.industry]
      if (!ps || !qs || ps.year !== fiscal || qs.year !== fiscal) continue
      const key = `${q.a.id}|${service.key}`
      const gross = Math.floor(Math.min(remaining.get(p.a.id) ?? 0, Math.max(0, qs[service.key] * service.share - (spent.get(key) ?? 0))))
      if (gross < 1) continue
      const costRatio = clampN((ps.cogs + ps.wages + ps.keyStaff + ps.rent + ps.upkeep) / Math.max(1, ps.netRevenue), .35, 1.5)
      const cost = Math.ceil(gross * costRatio)
      if (cost >= gross || q.b.cash < cost || p.b.cash < cost) continue // external provider is better or delivery cannot be financed
      const pbtP = ps.pbt, pbtQ = qs.pbt
      // The invoice equals delivery cost: provider earns no transfer-price markup.
      qs[service.key] -= gross - cost; qs.pbt += gross - cost
      ps.revenue += cost; ps.netRevenue += cost; ps.cogs += cost
      amend(g, p.b, ps, pbtP); amend(g, q.b, qs, pbtQ)
      remaining.set(p.a.id, (remaining.get(p.a.id) ?? 0) - gross); spent.set(key, (spent.get(key) ?? 0) + gross)
      refreshValue(p.a, p.b); refreshValue(q.a, q.b)
      records.push({ group: id, provider: p.a.id, customer: q.a.id, invoice: cost, saved: gross - cost, year: fiscal })
    }
  }
  g.flags.groupServiceResults = records
  if (records.length) log(g, `Group internal contracts replaced external purchases; net operating savings ${money(records.reduce<number>((sum, x) => sum + num(rec(x)?.saved), 0))} before tax.`)
}
export function internalRevenue(g: GameState, group: string, fiscal: number): number {
  return (Array.isArray(g.flags.groupServiceResults) ? g.flags.groupServiceResults : []).reduce<number>((sum, x) => { const r = rec(x); return sum + (r?.group === group && r.year === fiscal ? num(r.invoice) : 0) }, 0)
}
export function groupServicesMenu(group: string): MenuNode {
  return { type: 'menu', id: `group.services.${group}`, label: 'Group Services / Internal Contracts', emoji: '🔗', children: g => {
    const grp = groupById(g, group)
    if (!grp) return []
    const rows: MenuNode[] = [{ type: 'info', id: 'group.services.info', emoji: 'ℹ️', text: 'Fully controlled divisions operating only in the same country can share services at delivery cost. Up to 20% of provider capacity is reserved, reducing external sales even if the contract later falls back to an external supplier. Internal invoices are eliminated from consolidated revenue. Disable contracts that are not worthwhile.' }]
    rows.push({ type: 'action', id: `group.services.assignAll.${group}`, label: 'Assign All', emoji: '✅', subtitle: 'Assign every eligible internal contract; keep existing assignments', disabledReason: gg => { const current = groupById(gg, group); return !current ? 'Group unavailable.' : manageBlock(gg, current.members[0].a) ?? (current.core.share <= .5 || !current.members.every(x => ownerControls(gg, x.a)) ? 'Control the group and each division first.' : null) }, run: gg => { assignAllServices(gg, group) } })
    for (const p of grp.members) for (const q of grp.members) {
      const c = { group, provider: p.a.id, customer: q.a.id }
      const active = serviceContracts(g).some(x => x.provider === p.a.id && x.customer === q.a.id)
      if (!active && !valid(g, grp, c)) continue
      rows.push({ type: 'action', id: `service.${p.a.id}.${q.a.id}`, label: `${active ? 'Disable' : 'Assign'} ${p.a.name} → ${q.a.name}`, emoji: '🔗', subtitle: SERVICE[p.b.industry]?.label ?? 'Inactive service', run: gg => { toggleService(gg, group, p.a.id, q.a.id) } })
    }
    return rows
  } }
}
