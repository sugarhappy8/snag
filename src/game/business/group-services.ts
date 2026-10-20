// Explicit internal contracts. Invoices move cash, and only avoided external costs less
// real delivery expense create consolidated profit. No unlimited sister-company revenue.
import { log, notice } from '../core'
import type { Asset, GameState, Json, MenuNode } from '../types'
import { ownerControls } from './board'
import { groupById, groupIdOf, liveGroup, type Group, type GroupMember } from './conglomerate-state'
import { refreshValue, valuationOf } from './economy'
import { industryEraBlock } from './competition-data'
import { techView } from './deeptech-core'
import { CHIP_RESERVE, CHIP_SHARE, SISTER_CUT, chipBook, chipSource, readChips, type ChipSupply } from './devices-data'
import { manageBlock } from './gate'
import { bizOf, businessAssets, readBiz, syncBookRow } from './state'
import type { BizState, Statement } from './state'
import { clampN, money, num, pct, rec, str } from './util'
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
  // The label only: chips are booked by assignChips and settleChips, never by the generic loops (share 0).
  semiconductor: { label: 'Chip supply', key: 'cogs', share: 0 },
}
const NO_BONUS = 'generic purchasing/back-office bonuses are excluded for this buyer.'
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
  // Chip supply: a sister fab serves device companies only. It amends no tax, so the outlet rule does not apply.
  if (p.b.industry === 'semiconductor') return q.b.industry === 'devices' && techView(p.b).stage >= 2
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
  const text = exists ? 'External procurement restored for this service.' : isChip(grp, c)
    ? `Chip supply is contracted from the next fiscal year, and only if this sister is a better source than your own fabs. While it supplies the buyer's chips it holds back capacity from external customers and replaces the buyer's cross-selling lift; ${NO_BONUS}`
    : `Internal service contracted from next fiscal settlement. Delivery is limited by provider capacity, buyer spending and real delivery cost; ${NO_BONUS}`
  notice(g, 'Internal Contract', text)
  return true
}
/** Add all eligible missing pairs in one write. Repeating the command never toggles anything off. */
export function assignAllServices(g: GameState, group: string): number {
  const grp = groupById(g, group)
  if (!grp || manageBlock(g, grp.members[0].a) || grp.core.share <= .5 || !grp.members.every(x => ownerControls(g, x.a))) return 0
  const list = serviceContracts(g), before = list.length
  let chips = 0
  for (const p of grp.members) for (const q of grp.members) {
    const c = { group, provider: p.a.id, customer: q.a.id }
    if (list.length >= 120 || !valid(g, grp, c) || list.some(x => x.group === group && x.provider === c.provider && x.customer === c.customer)) continue
    list.push(c)
    if (isChip(grp, c)) chips += 1
  }
  g.flags.groupServices = list as unknown as Json
  const lift = chips ? ' A chip contract replaces the device company\'s cross-selling lift only while the sister supplies its chips; own fabs can be the better source.' : ''
  notice(g, 'Internal Contracts Assigned', `${list.length - before} new eligible internal contracts assigned. Existing contracts were kept. The 120-contract portfolio limit, country rules, provider capacity and delivery costs still apply.${lift}`)
  return list.length - before
}
/** Hold back up to 20% of providers' delivery capacity from external customers. */
export function prepareInternalServices(g: GameState, fiscal: number): void {
  if (num(g.flags.groupServicesPrepared, -1) >= fiscal) return
  g.flags.groupServicesPrepared = fiscal
  for (const id of new Set(serviceContracts(g).map(x => x.group))) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    for (const provider of new Set(serviceContracts(g).filter(x => x.group === id && valid(g, grp, x) && !isChip(grp, x)).map(x => x.provider))) {
      const p = grp.members.find(x => x.a.id === provider)!
      if (!p.b.last || p.b.last.year >= fiscal) continue
      p.b.capacityLoss = 1 - (1 - p.b.capacityLoss) * .8
    }
  }
  assignChips(g, fiscal)
}
function amend(g: GameState, b: BizState, s: Statement, before: number): void {
  // Same domestic tax basis as the original settlement; all supported contracts are domestic.
  const oldTax = s.corpTax
  const marginalTax = allocatedCorporateTax(b.countryId, s.pbt, s.revenue + s.otherIncome, 0, 0, g, s.year, b.industry) - allocatedCorporateTax(b.countryId, before, s.revenue + s.otherIncome, 0, 0, g, s.year, b.industry)
  s.corpTax = Math.max(0, oldTax + marginalTax)
  const delta = s.pbt - before - (s.corpTax - oldTax)
  s.net += delta; b.cash += delta
  const h = b.history.find(x => x.year === s.year)
  // The booked row follows the statement: its cost lines (the invoice sits in one) and its books-close cash move with it.
  if (h) { h.revenue = s.revenue; h.profit = s.net; h.tax = s.corpTax; syncBookRow(h, s, delta) }
  if (!b.public) b.valuation = valuationOf(b)
}
export function settleInternalServices(g: GameState, fiscal: number): void {
  if (num(g.flags.groupServicesSettled, -1) >= fiscal) return
  g.flags.groupServicesSettled = fiscal
  const records: Json[] = []
  settleChips(g, fiscal, records)
  for (const id of new Set(serviceContracts(g).map(x => x.group))) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    const remaining = new Map<string, number>()
    for (const x of grp.members) remaining.set(x.a.id, Math.max(0, (x.b.last?.netRevenue ?? 0) * .25)) // external 80% → reserved 20%
    const spent = new Map<string, number>()
    for (const c of serviceContracts(g).filter(x => x.group === id).sort((a,b) => `${a.provider}|${a.customer}`.localeCompare(`${b.provider}|${b.customer}`))) {
      if (!valid(g, grp, c) || isChip(grp, c)) continue
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
  // Chip records have their own log line, so this one sums the generic contracts only.
  const plain = records.filter(x => !rec(x)?.chips)
  if (plain.length) log(g, `Group internal contracts replaced external purchases; net operating savings ${money(plain.reduce<number>((sum, x) => sum + num(rec(x)?.saved), 0))} before tax.`)
}
export function internalRevenue(g: GameState, group: string, fiscal: number): number {
  return (Array.isArray(g.flags.groupServiceResults) ? g.flags.groupServiceResults : []).reduce<number>((sum, x) => { const r = rec(x); return sum + (r?.group === group && r.year === fiscal ? num(r.invoice) : 0) }, 0)
}
// ---------------------------------------------------------------------------
// Chip supply (devices trade): a sister fab to a device company. The terms are written once a fiscal year in prepareInternalServices
// from last year's booked statements (no foresight), so costFactor reads the saving before the buyer books it. Settlement is keyed by
// that record, not by the contract list, so toggling a contract mid-year changes nothing until the next fiscal year.

/** Most of one sister's capacity that chip buyers hold across a fiscal year. */
const CHIP_HOLD_MAX = .5
/** Most of the sister's revenue one invoice may reach. */
const CHIP_INVOICE_MAX = .25

/** A chip pair is a semiconductor provider and a devices customer in the same group. */
function isChip(grp: Group, c: Contract): boolean {
  return grp.members.some(x => x.a.id === c.provider && x.b.industry === 'semiconductor') && grp.members.some(x => x.a.id === c.customer && x.b.industry === 'devices')
}
function byId(x: GroupMember, y: GroupMember): number { return x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0 }
/** A booked statement from before this fiscal year (the only numbers a record may read). */
function bookedBefore(b: BizState, fiscal: number): Statement | null { return b.last && b.last.year < fiscal ? b.last : null }

/** Why a sister can't supply a device company, as plain text. Null when it can, or when the pair is not a chip pair. */
export function chipBlock(g: GameState, p: GroupMember, q: GroupMember): string | null {
  if (p.b.industry !== 'semiconductor' || q.b.industry !== 'devices') return null
  if (p.b.countryId !== q.b.countryId) return `${p.a.name} can't supply chips. It's in another country.`
  if (p.m.own < .999) return `${p.a.name} can't supply chips. The group doesn't own all of it. Buy out its investors first.`
  if (q.m.own < .999) return `${q.a.name} can't take chips. The group doesn't own all of it. Buy out its investors first.`
  if (techView(p.b).stage < 2) return `${p.a.name} can't supply chips. It isn't shipping chips yet.`
  if (industryEraBlock(p.b.industry, p.b.countryId, g.year)) return `${p.a.name} can't supply chips. The technology isn't there yet.`
  return null
}

/** True when a contract for this customer has a semiconductor provider in the group. */
export function hasChipContract(g: GameState, grp: Group, customer: string): boolean {
  return serviceContracts(g).some(x => x.group === grp.core.id && x.customer === customer && isChip(grp, x))
}

/**
 * True when this buyer's chips come from a sister in this fiscal year: its record is stamped for the year, the sister is still in the
 * group and valid, and the sister is still the better source (own fabs win ties). Only then does the contract stand in for the
 * buyer's cross-selling lift. A contract that gave the buyer nothing, or one that went stale, leaves the lift alone.
 */
export function chipSupplied(g: GameState, grp: Group, customer: string, fiscal: number): boolean {
  const q = grp.members.find(x => x.a.id === customer)
  const chips = q ? readChips(q.b.chips as unknown as Json) : null
  if (!q || !chips || chips.year !== fiscal || chipSource(q.b).src !== 'sister') return false
  const c = { group: grp.core.id, provider: chips.from, customer }
  return isChip(grp, c) && valid(g, grp, c)
}

/** The latest chip settlement booked for this buyer: who supplied, what it saved and the fiscal year. */
export function chipResultFor(g: GameState, customer: string): { provider: string; saved: number; year: number } | null {
  for (const x of Array.isArray(g.flags.groupServiceResults) ? g.flags.groupServiceResults : []) {
    const r = rec(x)
    if (r && r.chips === true && r.customer === customer) return { provider: str(r.provider), saved: num(r.saved), year: num(r.year) }
  }
  return null
}

/** Up to two lines about the buyer's sister chip companies: the active supplier first, then what could supply and what can't. */
export function chipRows(g: GameState, buyer: Asset): string[] {
  const grp = groupById(g, groupIdOf(buyer.details))
  const q = grp?.members.find(x => x.a.id === buyer.id)
  if (!grp || !q || q.b.industry !== 'devices') return []
  const src = chipSource(q.b), chips = readChips(q.b.chips as unknown as Json)
  const rows: string[] = []
  if (src.src === 'sister' && chips) rows.push(`${chips.name} supplies your chips and covers ${pct(src.cover)} of what you need.`)
  for (const p of grp.members) {
    if (p.b.industry !== 'semiconductor' || (src.src === 'sister' && chips?.from === p.a.id)) continue
    const why = chipBlock(g, p, q)
    if (why) rows.push(why)
    else if (!serviceContracts(g).some(x => x.provider === p.a.id && x.customer === q.a.id)) rows.push(`${p.a.name} could supply your chips. Assign it under Group Services.`)
  }
  return rows.slice(0, 2)
}

/**
 * Before the year: each device buyer takes the best contracted sister (the larger cut, then the lower asset id) as one record for this
 * fiscal year. A sister that is not the better source (own fabs win or tie) writes nothing and holds nothing. Only a used sister holds
 * capacity back, at most half of it across all its buyers. Then every record not renewed this year is dropped.
 */
function assignChips(g: GameState, fiscal: number): void {
  const held = new Map<string, number>()
  for (const id of new Set(serviceContracts(g).map(x => x.group))) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    const contracts = serviceContracts(g).filter(x => x.group === id)
    for (const q of grp.members.filter(x => x.b.industry === 'devices').sort(byId)) {
      const mine = bookedBefore(q.b, fiscal)
      const bill = mine ? mine.cogs * CHIP_SHARE : 0
      if (!(bill >= 1)) continue
      let best: { p: GroupMember; chips: ChipSupply; cut: number; revenue: number; give: number } | null = null
      for (const c of contracts) {
        if (c.customer !== q.a.id) continue
        const p = grp.members.find(x => x.a.id === c.provider)
        const theirs = p ? bookedBefore(p.b, fiscal) : null
        if (!p || !theirs || !(theirs.netRevenue >= 1) || !isChip(grp, c) || !valid(g, grp, c)) continue
        // Cover is capacity the sister gives up, so it reads what the buyers before this one left of the half it may hold.
        const give = Math.min(CHIP_RESERVE, Math.max(0, CHIP_HOLD_MAX - (held.get(p.a.id) ?? 0)))
        if (!(give > 0)) continue
        const t = techView(p.b)
        const chips = readChips({ year: fiscal, from: p.a.id, name: p.a.name, stage: Math.min(4, t.stage), node: t.node, yield: t.yieldRate, cover: clampN(give * theirs.netRevenue / bill, 0, 1) })
        if (!chips) continue
        const cut = (SISTER_CUT[chips.stage] ?? 0) * chips.cover
        if (!best || cut > best.cut || (cut === best.cut && p.a.id < best.p.a.id)) best = { p, chips, cut, revenue: theirs.netRevenue, give }
      }
      if (!best || chipSource({ industry: q.b.industry, fabs: q.b.fabs, chips: best.chips }).src !== 'sister') continue
      q.b.chips = best.chips
      const hold = Math.min(best.give, bill / best.revenue)
      held.set(best.p.a.id, (held.get(best.p.a.id) ?? 0) + hold)
      best.p.b.capacityLoss = clampN(1 - (1 - best.p.b.capacityLoss) * (1 - hold), 0, .8)
    }
  }
  // A sold, removed, ungrouped or disqualified sister stops helping at the next fiscal year: whatever was not renewed goes.
  for (const a of businessAssets(g)) {
    if (!('chips' in a.details) || readBiz(g, a).chips?.year === fiscal) continue
    delete bizOf(g, a).chips
  }
}

/**
 * After the year: every buyer whose record is for this fiscal year, whose sister is still in its group and valid, and whose chips
 * still come from the sister, gets one settlement. The saving is already in the buyer's cogs, so the buyer's books don't move. The
 * invoice is profit-neutral on the provider, exactly as the generic contracts book it, and internalRevenue eliminates it.
 */
function settleChips(g: GameState, fiscal: number, records: Json[]): void {
  const groups = new Set<string>()
  for (const a of businessAssets(g)) if ('chips' in a.details && groupIdOf(a.details)) groups.add(groupIdOf(a.details))
  const room = new Map<string, number>() // what is left of each sister's invoice cap
  for (const id of groups) {
    const grp = liveGroup(g, id)
    if (!grp) continue
    for (const q of grp.members.filter(x => x.b.industry === 'devices').sort(byId)) {
      const chips = readChips(q.b.chips as unknown as Json), qs = q.b.last
      if (!chips || chips.year !== fiscal || !qs || qs.year !== fiscal) continue
      const p = grp.members.find(x => x.a.id === chips.from), ps = p?.b.last
      const c = { group: id, provider: chips.from, customer: q.a.id }
      const src = chipSource(q.b)
      if (!p || !ps || ps.year !== fiscal || src.src !== 'sister' || !isChip(grp, c) || !valid(g, grp, c)) continue
      // The cap is read from the sister's revenue before its first invoice and shared by all its buyers, as the generic loop shares `remaining`.
      if (!room.has(p.a.id)) room.set(p.a.id, Math.floor(CHIP_INVOICE_MAX * ps.netRevenue))
      const { saved, paid } = chipBook(qs.cogs, src.cut)
      const invoice = Math.max(0, Math.min(Math.round(paid * src.cover), room.get(p.a.id)!))
      if (!(saved >= 1) || !Number.isFinite(invoice)) continue
      room.set(p.a.id, room.get(p.a.id)! - invoice)
      const pbt = ps.pbt
      ps.revenue += invoice; ps.netRevenue += invoice; ps.cogs += invoice
      amend(g, p.b, ps, pbt)
      refreshValue(p.a, p.b)
      records.push({ group: id, provider: p.a.id, customer: q.a.id, invoice, saved: Math.round(saved), year: fiscal, chips: true })
      log(g, `${p.a.name} supplied chips to ${q.a.name} and saved it about ${money(saved)}.`, 'good')
    }
  }
}

export function groupServicesMenu(group: string): MenuNode {
  return { type: 'menu', id: `group.services.${group}`, label: 'Group Services / Internal Contracts', emoji: '🔗', children: g => {
    const grp = groupById(g, group)
    if (!grp) return []
    const rows: MenuNode[] = [{ type: 'info', id: 'group.services.info', emoji: 'ℹ️', text: 'Fully controlled divisions operating only in the same country can share services at delivery cost. Up to 20% of provider capacity is reserved, reducing external sales even if the contract later falls back to an external supplier. Internal invoices are eliminated from consolidated revenue. Disable contracts that are not worthwhile.' }]
    rows.push({ type: 'action', id: `group.services.assignAll.${group}`, label: 'Assign All', emoji: '✅', subtitle: 'Assign every eligible internal contract; keep existing assignments', disabledReason: gg => { const current = groupById(gg, group); return !current ? 'Group unavailable.' : manageBlock(gg, current.members[0].a) ?? (current.core.share <= .5 || !current.members.every(x => ownerControls(gg, x.a)) ? 'Control the group and each division first.' : null) }, run: gg => { assignAllServices(gg, group) } })
    let chipInfos = 0
    for (const p of grp.members) for (const q of grp.members) {
      const c = { group, provider: p.a.id, customer: q.a.id }
      const active = serviceContracts(g).some(x => x.provider === p.a.id && x.customer === q.a.id)
      if (!active && !valid(g, grp, c)) {
        // A chip pair that can't start says why, so the player knows what to fix (at most 6 such rows).
        const why = chipInfos < 6 ? chipBlock(g, p, q) : null
        if (why) { chipInfos += 1; rows.push({ type: 'info', id: `group.services.chip.${p.a.id}.${q.a.id}`, emoji: '\u{1F4BE}', text: why }) }
        continue
      }
      rows.push({ type: 'action', id: `service.${p.a.id}.${q.a.id}`, label: `${active ? 'Disable' : 'Assign'} ${p.a.name} → ${q.a.name}`, emoji: '🔗', subtitle: SERVICE[p.b.industry]?.label ?? 'Inactive service', run: gg => { toggleService(gg, group, p.a.id, q.a.id) } })
    }
    return rows
  } }
}
