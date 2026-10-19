// A small persistent financial layer on the existing canonical rival roster, not a
// second cast of companies. Only the annual world boundary creates or advances it.
import { marketEventFactors, type MarketFactors } from '../history/market-events'
import { INDUSTRY_IDS, type Industry } from '../data/markets'
import { normalizeRivals, RIVAL_LIMIT, rivalActorKey, type RivalActor, type RivalOutcome, type RivalPoint } from '../economy/actors-state'
import { bound, economyState, initialCountry, sectorOf, type CountryEconomy } from '../economy/model'
import { PRESENT_YEAR } from '../history/timeline'
import type { GameState, Json } from '../types'
import { COUNTRIES } from '../world'
import { marketKey, marketStateOf, type MarketCtx } from './competition-core'
import { marketDef } from './competition-data'
import { activeRivals, familyId, rawPull, rosterOf, type Rival } from './competition-roster'
import { waveFactorsFor } from './tech-wave-factors'

/** What the tech waves do to a market's rivals (business/tech-waves.ts): nothing, unless advanceRivals passes the market's factors. */
const NO_WAVE: MarketFactors = { demand: 1, costs: 1, value: 1 }
const industries = new Set<string>(INDUSTRY_IDS)
const countries = new Set(COUNTRIES.map(c => c.id))
const MAX_MARKETS = 24, PER_MARKET = 8
interface RelevantMarket { industry: Industry; scope: string; home: string; priority: number; pressure: number; gone: Set<string> }
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

/** Stable relevance, independent of menu visits and asset/person array order. */
function relevantMarkets(g: GameState, year: number): RelevantMarket[] {
  const markets = new Map<string, RelevantMarket>()
  const add = (industry: string, home: string, priority: number, market?: Json) => {
    if (!industries.has(industry) || !countries.has(home)) return
    const scope = marketKey({ industry, countryId: home }), key = `${industry}|${scope}`
    const row = markets.get(key) ?? { industry: industry as Industry, scope, home, priority, pressure: 0, gone: new Set<string>() }
    row.priority = Math.min(row.priority, priority)
    // A deterministic fallback for world markets with several operating countries.
    row.home = [row.home, home].sort()[0]
    const state = marketStateOf({ industry, countryId: home, market })
    if (state) {
      if (state.year < year && state.year >= year - 2) row.pressure = bound(row.pressure + state.share, 0, .85)
      for (const id of state.gone) row.gone.add(id)
    }
    markets.set(key, row)
  }
  for (const asset of [...g.assets].sort((a, b) => a.id.localeCompare(b.id))) if (asset.kind === 'business') {
    const d = asset.details
    add(String(d.industry), String(d.countryId), 0, d.market)
  }
  for (const person of [...g.people].sort((a, b) => a.id.localeCompare(b.id))) {
    const a = rec(person.data.npcCompany), d = rec(a.details)
    if (a.kind === 'business') add(String(d.industry), String(d.countryId), 1, d.market as Json | undefined)
  }
  for (const industry of ['grocery', 'construction', 'manufacturing', 'software']) add(industry, g.character.countryId, 2)
  return [...markets.values()].sort((a, b) => a.priority - b.priority || `${a.industry}|${a.scope}`.localeCompare(`${b.industry}|${b.scope}`)).slice(0, MAX_MARKETS)
}
const round = (n: number) => Math.round(n * 1e6) / 1e6
function snapshot(a: RivalActor): RivalPoint { return { year: a.year, cash: a.cash, debt: a.debt, capacity: a.capacity, adoption: a.adoption, strength: a.strength, outcome: a.outcome } }
function seededActor(r: Rival, market: RelevantMarket, year: number): RivalActor {
  return { key: rivalActorKey(market.industry, market.scope, r.id), industry: market.industry, scope: market.scope, id: r.id,
    hq: r.hq, real: r.real === true, year, cash: round(.35 + r.quality / 100), debt: round(.15 + (100 - r.quality) / 150),
    capacity: 1, adoption: round(bound(r.tech / 200, 0, 1)), strength: 1, outcome: 'steady', history: [], cause: 'Established operating business.' }
}

function advanceActor(old: RivalActor, r: Rival, m: RelevantMarket, opening: Record<string, CountryEconomy>, year: number, wave: MarketFactors = NO_WAVE): RivalActor {
  if (old.year >= year) return old
  const operatingCountry = m.scope === 'world' ? r.hq : m.scope
  const e = opening[operatingCountry] ?? opening[m.home] ?? initialCountry(m.home, year - 1), s = e.sectors[sectorOf(m.industry)]
  const next = { ...old, year, hq: r.hq, real: r.real === true, history: old.history.map(h => ({ ...h })) }
  // Registry dates and strength arcs are authoritative in recorded history. Never
  // claim that an observed historical real firm failed because of this simulation.
  if (r.real && year <= PRESENT_YEAR) {
    next.strength = 1; next.outcome = 'steady'; next.cause = 'Historical company dates and strength follow the brand record.'
  } else if (old.outcome === 'failed') {
    next.strength = 0; next.cause = 'Closed after unfunded losses; its customers remain available to surviving competitors.'
  } else {
    const skill = bound((r.quality / 100 + e.skills) / 2, .1, 1)
    // Rivals live through the same real booms and busts as the player (history/market-events.ts).
    const fx = marketEventFactors(m.industry, operatingCountry, year, m.scope === 'world')
    // A tech wave lifts the rivals that sell it and the ones that supply it, and shrinks the ones it disrupts;
    // a real brand's recorded years (the first branch) are never touched by it.
    const demand = bound(s.demand * fx.demand * wave.demand * (1 - .65 * m.pressure) * (.88 + .24 * skill), .1, 2.5)
    const delivered = Math.min(old.capacity * s.availability * Math.min(1, s.workforce), demand)
    const revenue = delivered * (1.13 + skill * .18 + old.adoption * .12)
    const running = delivered * .48 * s.costs * fx.costs * wave.costs + old.capacity * (.3 / (1 + old.adoption * .35) + .06 * e.wages)
    const profit = revenue - running - old.debt * bound(e.rate + .025, .01, .35)
    let cash = old.cash + profit, debt = old.debt, capacity = old.capacity, adoption = old.adoption
    // Bank lending finances a bounded buffer, not unlimited loss support.
    if (cash < .25 && e.credit >= .7 && debt < 2) {
      const loan = Math.max(0, Math.min(.25 - cash, 2 - debt, e.credit * .35))
      cash += loan; debt += loan
    }
    let outcome: RivalOutcome = profit < -.08 || cash < .25 ? 'distressed' : 'steady'
    let cause = profit < -.08 ? (s.availability < .8 ? 'Input shortages left equipment idle while fixed costs continued.' : s.costs > 1.2 ? 'Higher input costs exhausted operating margins.' : m.pressure > .2 ? 'Customer losses to competing businesses squeezed margins.' : 'Weak demand could not cover payroll, premises and debt service.') : 'Sales cover operating costs and debt service.'
    if (cash < 0) {
      outcome = 'failed'; cash = 0; cause = 'Operating losses exhausted cash and available credit; the business closed.'
    } else {
      if (profit > 0 && cash > .55 && demand > delivered * 1.03 && s.availability > .75 && s.workforce > .75 && capacity < 3) {
        const investment = Math.min((cash - .4) * .18, .18, (3 - capacity) * 1.5)
        cash -= investment; capacity += investment / 1.5; outcome = 'expanded'; cause = 'Retained profits funded additional capacity to serve unmet demand.'
      }
      if (profit > 0 && cash > .5 && skill > .45 && adoption < .95) {
        const research = Math.min(.04, cash - .5, (.95 - adoption) / (.5 + skill + s.adoption))
        cash -= research; adoption += research * (.5 + skill + s.adoption)
        if (outcome === 'steady') { outcome = 'adopting'; cause = 'Affordable training and technology improved productivity.' }
      }
      if (cash > 1.2 && debt > 0) { const repayment = Math.min(debt, (cash - 1.2) * .25); cash -= repayment; debt -= repayment }
      if (outcome === 'distressed') capacity = Math.max(.15, capacity * .97)
    }
    const target = Math.pow(capacity, .6) * (.8 + adoption * .25 + skill * .1) * (.55 + .45 * Math.min(1, cash)) * (.65 + .35 * s.availability)
    Object.assign(next, { cash: bound(cash, 0, 8), debt: bound(debt, 0, 8), capacity: bound(capacity, .15, 3), adoption: bound(adoption, 0, 1),
      strength: outcome === 'failed' ? 0 : bound(old.strength * .7 + target * .3, .1, 3), outcome, cause })
  }
  for (const k of ['cash', 'debt', 'capacity', 'adoption', 'strength'] as const) next[k] = round(next[k])
  next.history = [...next.history.filter(h => h.year < year), snapshot(next)].slice(-6)
  return next
}

/** Annual-only pure transition from the same opening country frame for every rival.
 * The caller stores the returned frame once. Menus and planners never call this. */
export function advanceRivals(g: GameState, opening: Record<string, CountryEconomy>, prior: RivalActor[], year: number): RivalActor[] {
  const old = new Map(normalizeRivals(prior, year).filter(a => industries.has(a.industry) && (a.scope === 'world' || countries.has(a.scope))).map(r => [r.key, r])), result = new Map<string, RivalActor>()
  const markets = relevantMarkets(g, year), acquired = new Set(markets.flatMap(m => [...m.gone].map(id => rivalActorKey(m.industry, m.scope, id))))
  // Terminal records reserve their bounded slots even while the player leaves a
  // market. Losing relevance must never resurrect a failed company on re-entry.
  // Only a canonical exit (which can never trade again) makes that slot reusable.
  for (const actor of old.values()) if (actor.outcome === 'failed' && !acquired.has(actor.key)) {
    const r = rosterOf(familyId(g.lifeId), actor.industry, actor.scope).byId.get(actor.id)
    if (!r || year < (r.from ?? r.founded) || year >= r.exit || (r.real && year <= PRESENT_YEAR)) continue
    const m: RelevantMarket = { industry: actor.industry as Industry, scope: actor.scope, home: actor.hq, priority: 3, pressure: 0, gone: new Set() }
    result.set(actor.key, advanceActor(actor, r, m, opening, year))
  }
  for (const m of markets) {
    const roster = rosterOf(familyId(g.lifeId), m.industry, m.scope), def = marketDef(m.industry)
    // What the tech waves do to this market this year (one lookup per market; neutral with no wave).
    const wave = waveFactorsFor(g, m.industry, m.scope, year)
    const active = activeRivals(roster, year).filter(r => !m.gone.has(r.id))
    // Existing actors (including failed firms) retain their slots until the roster's
    // canonical exit. This prevents a failed company from respawning on the next turn.
    active.sort((a, b) => Number(old.has(rivalActorKey(m.industry, m.scope, b.id))) - Number(old.has(rivalActorKey(m.industry, m.scope, a.id))) || rawPull(def, b, year) - rawPull(def, a, year) || a.id.localeCompare(b.id))
    for (const r of active.slice(0, PER_MARKET)) {
      const key = rivalActorKey(m.industry, m.scope, r.id)
      if (result.has(key) || result.size >= RIVAL_LIMIT) continue
      result.set(key, advanceActor(old.get(key) ?? seededActor(r, m, year - 1), r, m, opening, year, wave))
    }
  }
  return [...result.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Clone and scale each existing row. Never add a second identity, revive an
 * acquisition, mutate buildCtx's cache, or redistribute the lost pull to all rivals. */
export function applyEconomicRivals(g: GameState, ctx: MarketCtx): MarketCtx {
  const economy = economyState(g)
  const actors = economy?.year === ctx.year ? economy.rivals : economy?.year === ctx.year + 1 ? economy.previousRivals : []
  if (!actors?.length) return ctx
  const byId = new Map(actors.filter(a => a.industry === ctx.industry && a.scope === ctx.key && a.year === ctx.year).map(a => [a.id, a]))
  if (!byId.size) return ctx
  const rivals = ctx.rivals.map(r => {
    const actor = r.extra ? undefined : byId.get(r.id)
    const strength = r.real && ctx.year <= PRESENT_YEAR ? 1 : actor?.strength ?? 1
    return { ...r, pull: r.pull * strength }
  })
  return { ...ctx, rivals, F: Math.max(.02, ctx.fringe + rivals.reduce((sum, r) => sum + r.pull, 0)) }
}
