// World-changing fiction has world-state consequences. Market repricing and leaked knowledge
// survive generations; a queued government's request belongs to its actual current owner.
import { seeded } from './assets'
import { formatMoney, log, notice, scriptChoice, spend } from './core'
import { marketOf } from './data/markets'
import { EXCHANGE_RULES } from './history/markets-world'
import { ownerControls } from './business/board'
import { bizOf, readBiz, type BizState } from './business/state'
import { refreshValue } from './business/economy'
import { isResearchKind, isInventionTier, type InventionTier } from './business/inventions'
import { exchangeInfo, exchangeStatus, exchangeYear } from './invest/engine'
import { addMarketBreakthrough, marketBreakthroughs, publicBusinessShockFactor, type MarketBreakthrough } from './invest/shocks'
import { revalueHoldings } from './investments'
import { readInventionIp } from './inventor-state'
import { defineScript } from './scripts'
import { ownerKey, ownerMatches } from './special/common'
import { timelineFamily } from './timeMachine'
import type { Asset, GameState, Json, MenuNode } from './types'
import { COUNTRIES, getCountry } from './world'

export interface InventionBreakthrough { id: string; name: string; kind: InventionTier; field: string; created: number; country: string; evidenceBased?: boolean }
interface Pressure { token: string; year: number; owner: string; companyId: string; country: string }
export interface InventionImpact extends InventionBreakthrough {
  announced: number; securityUntil: number; lastYear: number
  leaks: { year: number; factor: number; reason: string }[]
  pending: Pressure | null
}
const KEY = 'inventionImpact'
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const num = (v: unknown, fallback = 0, max = 1e12, min = 0): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback
const text = (v: unknown, max = 100): string => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : ''

/** Pure JSON reader. Never rolls, persists defaults, or transfers a previous owner's request. */
export function inventionImpactView(g: GameState): InventionImpact[] {
  const root = rec(g.flags[KEY]), rows = Array.isArray(root.events) ? root.events : [], seen = new Set<string>()
  return rows.map(rec).filter(r => {
    const id = text(r.id)
    if (!id || seen.has(id) || !isResearchKind(r.kind) || !isInventionTier(r.kind)) return false
    seen.add(id); return true
  }).map(r => {
    const p = rec(r.pending)
    return { id: text(r.id), name: text(r.name) || 'An invention', kind: r.kind as InventionTier, field: text(r.field), created: num(r.created, g.year, 100_000), country: text(r.country, 8) || 'us', announced: num(r.announced, g.year, 100_000),
      securityUntil: num(r.securityUntil, 0, 100_000), lastYear: num(r.lastYear, -1, 100_000, -1), evidenceBased: r.evidenceBased === true,
      leaks: (Array.isArray(r.leaks) ? r.leaks : []).map(rec).filter(x => typeof x.year === 'number' && Number.isFinite(x.year) && typeof x.factor === 'number' && Number.isFinite(x.factor)).map(x => ({ year: num(x.year, 0, 100_000), factor: num(x.factor, 1, 1, .2), reason: text(x.reason, 180) })),
      pending: text(p.token, 512) && text(p.owner, 256) ? { token: text(p.token, 512), owner: text(p.owner, 256), year: num(p.year, 0, 100_000), companyId: text(p.companyId), country: text(p.country, 8) || 'us' } : null,
    }
  })
}
function save(g: GameState, events: InventionImpact[]): void { g.flags[KEY] = { v: 1, events } as unknown as Json }

/** Only monopoly strength changes. IP, patent filing dates and licence expiry never reset. */
export function inventionLeakFactor(g: GameState, id: string, year: number): number {
  if (!Number.isFinite(year)) return 1
  const event = inventionImpactView(g).find(x => x.id === id)
  let factor = 1
  for (const leak of event?.leaks ?? []) if (leak.year <= year) factor *= leak.factor
  return Math.max(.2, Math.min(1, factor))
}

interface Target { a: Asset; b: BizState | null }
function target(g: GameState, id: string, companyId?: string): Target | null {
  if (companyId === undefined || companyId === '') {
    const ip = g.assets.find(a => a.id === id && a.kind === 'invention' && !!readInventionIp(a))
    if (ip) return { a: ip, b: null }
    if (companyId === '') return null
  }
  for (const a of g.assets) {
    if (a.kind !== 'business' || (companyId && a.id !== companyId)) continue
    const b = readBiz(g, a)
    if (!ownerControls(g, a)) continue
    const products = Array.isArray(b.inventionProducts) ? b.inventionProducts : []
    if (products.some(raw => { const p = rec(raw); return (p.ipId === id || p.id === id) && p.rights === 'owned' })) return { a, b }
  }
  return null
}
function blocked(g: GameState): boolean { return !g.character.alive || g.character.age < 18 || !!g.character.prison }
function securityCost(event: InventionImpact): number { return event.kind === 'generational' ? 200_000 : event.kind === 'big' ? 50_000 : 10_000 }

function captureMarket(g: GameState, event: InventionBreakthrough, mult: number): MarketBreakthrough {
  const family = timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
  const first = g.ancestors?.[0]?.bornYear, own = g.year - g.character.age
  const anchor = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  const exchanges: MarketBreakthrough['exchanges'] = [], seen = new Set<string>()
  for (const c of COUNTRIES) {
    if (!marketOf(c.id).exchange) continue
    const info = exchangeInfo(c.id)
    if (seen.has(info.key) || exchangeStatus(info, g.year) !== 'open') continue
    seen.add(info.key)
    const ey = exchangeYear(family, Number.isFinite(anchor) ? anchor : g.year, info, g.year)
    exchanges.push({ key: info.key,
      stocks: ey.stocks.map(s => s.price > 0 && !s.unlisted ? s.gen : null),
      pennies: ey.pennies.map(s => s.price > 0 && !s.unlisted ? s.gen : null), indexId: ey.fund.price > 0 ? ey.fund.id : '',
      ends: EXCHANGE_RULES[info.home]?.expropriated?.find(year => year > g.year) ?? 0,
    })
  }
  const businesses = g.assets.filter(a => {
    if (a.kind !== 'business') return false
    const b = readBiz(g, a)
    return b.public && b.sharesOut > 0 && b.sharePrice > 0 && exchanges.some(ex => ex.key === exchangeInfo(b.countryId).key)
  }).map(a => a.id)
  return { id: event.id, name: event.name, year: g.year, mult, exchanges, businesses }
}

function queuePressure(g: GameState, event: InventionImpact, owned: Target): void {
  const countries = COUNTRIES.filter(c => c.id !== event.country && c.wealth >= .7)
  const rng = seeded(`${g.lifeId}|invention-pressure|${event.id}|${g.year}`)
  const foreign = countries.length ? rng.pick(countries).id : 'us'
  event.pending = { token: `${event.id}:${g.year}:${ownerKey(g)}`, year: g.year, owner: ownerKey(g), companyId: owned.b ? owned.a.id : '', country: foreign }
}
function presentPressure(g: GameState, event: InventionImpact): void {
  const p = event.pending
  if (!p) return
  scriptChoice(g, PRESSURE_SCRIPT, 'Strategic Technology Under Pressure', `A fictional state-backed delegation from ${getCountry(p.country).name} wants access to ${event.name}. Your advisers warn that refusing may prompt an industrial leak. The invention will remain yours, but exclusivity—and its monopoly profit—can weaken.\n\nSecurity is funded by ${p.companyId ? 'the owning company' : 'your personal cash'}. Cooperation creates lasting non-exclusive access; it does not restart or extend a patent.`, [
    { id: 'security', label: `Invest ${formatMoney(securityCost(event))} in security & legal defence`, emoji: '🛡️' },
    { id: 'cooperate', label: 'Agree to limited licensed cooperation', emoji: '🤝' },
    { id: 'refuse', label: 'Refuse and accept the leak risk', emoji: '🚪' },
  ], { emoji: '🏛️', data: { id: event.id, token: p.token } })
}

/** Complete once globally, even when the same completion hook is replayed or inherited. */
export function registerInventionBreakthrough(g: GameState, input: InventionBreakthrough): boolean {
  if (!g.character.alive || !input || !isResearchKind(input.kind) || !isInventionTier(input.kind) || !Number.isFinite(input.created) || input.created > g.year) return false
  const clean: InventionBreakthrough = { ...input, id: text(input.id), name: text(input.name), field: text(input.field), country: text(input.country, 8) || g.character.countryId, created: Math.max(0, Math.floor(input.created)) }
  if (!clean.id || !clean.name) return false
  const events = inventionImpactView(g)
  if (events.some(x => x.id === clean.id) || marketBreakthroughs(g).some(x => x.id === clean.id)) return false
  const event: InventionImpact = { ...clean, announced: g.year, securityUntil: 0, lastYear: -1, leaks: [], pending: null }
  events.push(event); save(g, events)
  if (event.kind === 'generational' && !event.evidenceBased) {
    // Normalize old holdings before changing quotes; otherwise a legacy unit rebasing
    // could swallow the genuine price jump. Neither mark creates spendable cash.
    revalueHoldings(g, false, true)
    const market = captureMarket(g, clean, 12)
    const before = new Map(g.assets.filter(a => market.businesses.includes(a.id)).map(a => [a.id, publicBusinessShockFactor(g, bizOf(g, a), g.year)]))
    addMarketBreakthrough(g, market)
    revalueHoldings(g, false, true)
    for (const a of g.assets) if (market.businesses.includes(a.id)) {
      const b = bizOf(g, a), ratio = publicBusinessShockFactor(g, b, g.year) / (before.get(a.id) ?? 1)
      b.sharePrice *= ratio; b.valuation = Math.round(b.sharePrice * b.sharesOut); refreshValue(a, b)
    }
    notice(g, 'World-Changing Breakthrough: Global Markets Reprice', `${clean.name} is front-page news worldwide. Every currently open stock exchange repriced its existing stocks, penny stocks and index funds 12× (+1100%). This is an immediate, lasting valuation change—not a cash payment or a repeating annual bonus. Closed exchanges, future listings, bonds, bank deposits, gold and crypto are not pumped. Governments now regard the technology as strategically important.`, { emoji: '🌐', tone: 'good' })
    log(g, `${clean.name} changed the world: open stock markets repriced +1100% on the breakthrough.`, 'good')
    const owned = target(g, clean.id)
    if (owned && !blocked(g)) { queuePressure(g, event, owned); save(g, events); presentPressure(g, event) }
  } else {
    notice(g, event.evidenceBased ? 'A Prototype Worth Testing in the Market' : 'Invention Makes the News', `${clean.name} is ready for commercialization. Its success depends on production, staff, pricing, real demand and territorial patent protection. ${event.evidenceBased ? 'Independent testing earned technical credibility. Recognition and economic impact grow when people actually use it; a patent does not automatically raise every stock price.' : 'Larger breakthroughs attract more attention; no guaranteed cash is awarded.'}`, { emoji: '💡', tone: 'good' })
    log(g, `My invention ${clean.name} is ready to seek customers.`, 'good')
  }
  return true
}

export function resolveInventionPressure(g: GameState, id: string, token: string, choice: string): boolean {
  if (blocked(g) || !['security', 'cooperate', 'refuse'].includes(choice)) return false
  const events = inventionImpactView(g), event = events.find(x => x.id === id), p = event?.pending
  if (!event || !p || p.token !== token || !ownerMatches(g, p.owner) || p.year !== g.year) return false
  const owned = target(g, id, p.companyId)
  if (!owned) return false
  const rng = seeded(`${g.lifeId}|invention-pressure-resolution|${token}`)
  let factor = 1, message = ''
  if (choice === 'security') {
    const cost = securityCost(event)
    if (owned.b) {
      const b = bizOf(g, owned.a)
      if (b.cash < cost) { notice(g, 'Technology Defence Budget', 'The company no longer has enough of its own cash. You may still cooperate or refuse.', { emoji: '🛡️' }); return false }
      b.cash -= cost; b.yearCosts += cost
      if (!b.public) b.valuation = Math.max(0, b.valuation - cost)
      refreshValue(owned.a, b)
    } else if (!spend(g, cost)) { notice(g, 'Technology Defence Budget', `You need ${formatMoney(cost)} for the security and legal defence program.`, { emoji: '🛡️' }); return false }
    event.securityUntil = g.year + 3
    factor = rng.chance(.08) ? .8 : 1
    message = factor < 1 ? 'Defence contained most of the leak, but some knowledge escaped.' : 'The funded defence protected the technology. Security is strengthened for three years, not guaranteed forever.'
  } else if (choice === 'cooperate') {
    factor = .7
    message = 'Limited non-exclusive cooperation reduced confrontation, but competitors can now reproduce part of the advantage. Monopoly strength is permanently lower; existing patent and licence dates are unchanged.'
  } else {
    factor = rng.chance(event.securityUntil > g.year ? .15 : .75) ? .5 : 1
    message = factor < 1 ? 'A state-backed industrial leak spread key knowledge. You retain the invention, but imitation permanently weakened its monopoly strength.' : 'The request was refused. This time, no damaging leak was confirmed; the strategic pressure can return.'
  }
  if (factor < 1) event.leaks.push({ year: g.year, factor, reason: choice === 'cooperate' ? 'Licensed state cooperation' : 'Industrial knowledge leak' })
  event.pending = null; save(g, events)
  notice(g, 'Strategic Technology Decision', `${message}\nRemaining monopoly strength: ${Math.round(inventionLeakFactor(g, id, g.year) * 100)}%. IP ownership and manufacturing remain intact.`, { emoji: factor < 1 ? '⚠️' : '🛡️', tone: factor < 1 ? 'bad' : 'good' })
  log(g, `${event.name}: ${choice === 'security' ? 'funded technology defence' : choice === 'cooperate' ? 'accepted limited government licensing' : 'refused state access'}${factor < 1 ? '; exclusivity weakened' : ''}.`, factor < 1 ? 'bad' : 'neutral')
  return true
}
const PRESSURE_SCRIPT = defineScript('invention.strategicPressure', (g, choice, data) => { const d = rec(data); resolveInventionPressure(g, text(d.id), text(d.token, 512), choice) })

/** A genuine same-owner IP assignment carries its strategic request to the new owning
 * company. A new token makes the old personal-funded popup stale, never silently rebills it. */
export function transferInventionImpact(g: GameState, id: string, companyId: string): boolean {
  if (blocked(g) || !companyId || !target(g, id, companyId)) return false
  const events = inventionImpactView(g), event = events.find(x => x.id === id), p = event?.pending
  if (!event || !p || !ownerMatches(g, p.owner) || p.year !== g.year || p.companyId) return false
  p.companyId = companyId
  p.token = `${id}:${g.year}:assignment:${companyId}:${ownerKey(g)}`
  save(g, events)
  presentPressure(g, event)
  return true
}

/** Deterministic, one pass per fiscal year; actions and menus never reroll an incident. */
export function yearlyInventionImpact(g: GameState): void {
  if (!g.character.alive) return
  const events = inventionImpactView(g), fiscal = g.year - 1
  if (!events.length) return
  for (const event of events) {
    if (event.lastYear >= fiscal || event.created > fiscal) continue
    event.lastYear = fiscal
    const owned = target(g, event.id)
    if (!owned) { event.pending = null; continue }
    if (event.pending && (!ownerMatches(g, event.pending.owner) || event.pending.year < g.year)) {
      if (ownerMatches(g, event.pending.owner) && event.pending.year < g.year) {
        event.leaks.push({ year: g.year, factor: .65, reason: 'Unanswered strategic access request' })
        log(g, `${event.name}: an unanswered strategic request was followed by a damaging knowledge leak.`, 'bad')
      }
      event.pending = null
    }
    if (blocked(g) || event.pending || g.year - event.created > 25 || inventionLeakFactor(g, event.id, g.year) <= .2) continue
    const probability = event.kind === 'generational' ? .5 : event.kind === 'big' ? .18 : event.kind === 'middle' ? .04 : 0
    const protectedNow = event.securityUntil > g.year
    const rng = seeded(`${g.lifeId}|invention-pressure-incident|${event.id}|${fiscal}`)
    if (rng.chance(probability * (protectedNow ? .25 : 1))) { queuePressure(g, event, owned); presentPressure(g, event) }
  }
  save(g, events)
}

/** Optional owner menu rows for personal IP and company-owned product catalogues. */
export function inventionImpactNodes(g: GameState, id: string, companyAssetId?: string): MenuNode[] {
  const event = inventionImpactView(g).find(x => x.id === id)
  if (!event) return []
  const p = event.pending, active = !!p && p.year === g.year && ownerMatches(g, p.owner)
  const nodes: MenuNode[] = [{ type: 'info', id: `invention.impact.${id}`, emoji: '🌐', text: `Strategic technology: ${event.kind}. Monopoly strength ${Math.round(inventionLeakFactor(g, id, g.year) * 100)}%${event.securityUntil > g.year ? `; defence funded until ${event.securityUntil}` : ''}. Leaks weaken exclusivity without deleting the invention or extending patent terms.${active ? ' A government access request is waiting for your decision.' : ''}` }]
  if (!active || (companyAssetId && p!.companyId && p!.companyId !== companyAssetId)) return nodes
  for (const choice of ['security', 'cooperate', 'refuse']) nodes.push({ type: 'action', id: `invention.pressure.${id}.${choice}`, label: choice === 'security' ? `Fund Technology Defence (${formatMoney(securityCost(event))})` : choice === 'cooperate' ? 'Accept Limited Government Licensing' : 'Refuse Strategic Access', emoji: choice === 'security' ? '🛡️' : choice === 'cooperate' ? '🤝' : '🚪',
    disabledReason: gg => blocked(gg) ? 'An adult owner outside prison must make this decision.' : target(gg, id, p!.companyId) ? null : 'You no longer control this invention.',
    confirm: () => choice === 'cooperate' ? 'Permanently reduce monopoly strength through non-exclusive cooperation? Patent and existing licence dates will not change.' : choice === 'refuse' ? 'Refuse and risk a permanent industrial knowledge leak?' : `Pay ${formatMoney(securityCost(event))} from ${p!.companyId ? 'company' : 'personal'} cash? Security reduces, but cannot eliminate, leak risk.`,
    run: gg => { resolveInventionPressure(gg, id, p!.token, choice) },
  })
  return nodes
}
