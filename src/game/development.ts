// Site assets are the single ownership/estate record for unfinished developments.
// Escrow is included in their value, never also held in the personal bank balance.
import { addMoney, formatMoney, log, notice } from './core'
import { mortgageDecision, refreshHouseValue } from './assets'
import { gate, payForAction } from './activities/common'
import { economyOf } from './economy'
import { chance, uid } from './rng'
import { getCountry } from './world'
import { marketOf } from './data/markets'
import { bizOf, readBiz } from './business/state'
import { cityFactor, lineCost, linesOf, refreshValue, valuationOf } from './business/economy'
import { lineOf } from './business/industries'
import type { Asset, GameState, Json, MenuGroup, MenuNode } from './types'

export interface Development {
  v: 1; kind: 'residential' | 'commercial' | 'industrial'; stage: 'permits' | 'contractor' | 'building' | 'commission';
  country: string; city: string; company: string; units: number; base: number; escrow: number; spent: number; progress: number;
  quality: number; contractor: 'economy' | 'bonded' | ''; lastYear: number; started: number; setbacks: number; note: string
}
const num = (v: unknown, fallback = 0, max = 1e12, min = 0) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback
export function developmentOf(a: Asset): Development | null {
  const raw = a.details.development
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!['residential', 'commercial', 'industrial'].includes(String(raw.kind)) || !['permits', 'contractor', 'building', 'commission'].includes(String(raw.stage)) || typeof raw.country !== 'string' || typeof raw.city !== 'string') return null
  return { v: 1, kind: raw.kind as Development['kind'], stage: raw.stage as Development['stage'], country: raw.country, city: raw.city,
    company: typeof raw.company === 'string' ? raw.company : '', units: Math.floor(num(raw.units, 1, 20, 1)), base: num(raw.base, 100000, 1e12, 1000), escrow: num(raw.escrow), spent: num(raw.spent), progress: num(raw.progress, 0, 100), quality: num(raw.quality, 50, 100),
    contractor: raw.contractor === 'economy' || raw.contractor === 'bonded' ? raw.contractor : '', lastYear: num(raw.lastYear, -1, 100000, -1), started: num(raw.started, 1900, 100000), setbacks: num(raw.setbacks, 0, 1000), note: typeof raw.note === 'string' ? raw.note.slice(0, 240) : '' }
}
function save(a: Asset, d: Development) {
  a.details.development = d as unknown as Json
  // Distressed-sale value, not a guarantee of recovering the construction budget.
  a.value = Math.round(d.escrow + d.base * (.16 + .64 * d.progress / 100) * (.7 + d.quality / 250))
}
function owned(g: GameState, id: string) { const a = g.assets.find(a => a.id === id); return a && developmentOf(a) ? a : null }
function payable(g: GameState, id: string) { return !gate(g, { minAge: 18 }) ? owned(g, id) : null }
export function developmentQuote(g: GameState, kind: Development['kind'], units = 1, company = '', city = g.character.city): number {
  const a = g.assets.find(a => a.id === company && a.kind === 'business')
  if (kind === 'industrial') return a ? Math.round(lineCost(readBiz(g, a), units) * .88) : 0
  const e = economyOf(g)
  return Math.round((kind === 'commercial' ? 450000 : 220000) * Math.max(.25, getCountry(g.character.countryId).wealth) * e.sectors.housing.costs * cityFactor(g.character.countryId, city).rent * units)
}
export function startDevelopment(g: GameState, kind: Development['kind'], units = 1, company = '', city = g.character.city): Asset | null {
  if (gate(g, { minAge: 18 }) || !['residential', 'commercial', 'industrial'].includes(kind) || !Number.isInteger(units) || units < 1 || units > 20 || g.assets.filter(a => developmentOf(a)).length >= 12) return null
  if (city !== g.character.city && !getCountry(g.character.countryId).cities.includes(city)) return null
  if (kind === 'industrial') {
    const target = g.assets.find(a => a.id === company && a.kind === 'business'), b = target && readBiz(g, target)
    if (!b || !lineOf(b.industry) || b.share < .999 || b.countryId !== g.character.countryId || b.group) return null
    city = b.city
  }
  const base = developmentQuote(g, kind, units, company, city)
  if (!base || !payForAction(g, Math.round(base * .2))) return null
  const d: Development = { v: 1, kind, stage: 'permits', country: g.character.countryId, city, company, units, base, escrow: 0, spent: Math.round(base * .2), progress: 0, quality: 50, contractor: '', lastYear: g.year, started: g.year, setbacks: 0, note: 'Site acquired. Obtain permits, select a contractor and fund the construction reserve.' }
  const a: Asset = { id: uid(g, 'development'), kind: 'other', name: `${kind === 'industrial' ? 'Capacity project' : kind === 'commercial' ? 'Commercial development' : 'Residential development'} · ${d.city}`, emoji: '🏗️', purchasePrice: d.spent, value: d.spent, condition: 100, purchasedAge: g.character.age, upkeep: Math.round(base * .002), details: { countryId: d.country, city: d.city } }
  save(a, d); g.assets.push(a)
  notice(g, 'Site Acquired', `${formatMoney(d.spent)} bought the site in ${d.city}. Base budget: ${formatMoney(base)}; materials, delays and contractor terms can change it. Open this project under Assets → Development Projects. It produces no income until commissioned.`, { emoji: '🏗️' })
  return a
}
export function fundDevelopment(g: GameState, id: string, amount: number): boolean {
  const a = payable(g, id)
  if (!a || !Number.isFinite(amount) || amount <= 0) return false
  const d = developmentOf(a)!
  if (amount > d.base * 3 - d.escrow || !payForAction(g, amount)) return false
  d.escrow += amount; save(a, d)
  notice(g, 'Construction Reserve', `${formatMoney(amount)} moved from personal cash into the project. Unspent funds are returned on commissioning or cancellation.`, { emoji: '🏦' })
  return true
}
export function financeDevelopment(g: GameState, id: string): boolean {
  const a = payable(g, id)
  if (!a) return false
  const d = developmentOf(a)!
  if (a.mortgage || d.kind === 'industrial' || d.stage === 'commission') return false
  const q = mortgageDecision(g, d.base * .8, { id: 'development', down: .5, years: 15 })
  if (!q.ok) { notice(g, 'Development Finance', q.reason, { emoji: '🏦' }); return false }
  if (!payForAction(g, q.down)) return false
  a.mortgage = { lender: 'Development lender', balance: q.principal, yearlyPayment: q.payment, yearsLeft: 15, rate: q.rate, rateType: 'fixed' }
  d.escrow += q.down + q.principal; save(a, d)
  notice(g, 'Secured Development Loan', `You contributed ${formatMoney(q.down)} and borrowed ${formatMoney(q.principal)}. Annual payments: ${formatMoney(q.payment)}. The loan remains attached to the property after completion or inheritance.`, { emoji: '🏦' })
  return true
}
export function permitDevelopment(g: GameState, id: string): boolean {
  const a = payable(g, id)
  if (!a) return false
  const d = developmentOf(a)!, fee = Math.round(d.base * (.01 + (100 - marketOf(d.country).easeOfBusiness) / 5000))
  if (d.stage !== 'permits' || !payForAction(g, fee)) return false
  d.spent += fee; d.stage = 'contractor'; d.note = 'Permits approved. Select the delivery contract.'; save(a, d)
  notice(g, 'Permits Approved', `${formatMoney(fee)} paid in planning and regulatory fees. Your site is cleared for its stated use.`, { emoji: '📋' }); return true
}
export function contractDevelopment(g: GameState, id: string, contractor: Development['contractor']): boolean {
  const a = payable(g, id)
  if (!a || !['economy', 'bonded'].includes(contractor)) return false
  const d = developmentOf(a)!
  if (d.stage !== 'contractor') return false
  d.contractor = contractor; d.quality = contractor === 'bonded' ? 80 : 55; d.stage = 'building'; d.lastYear = g.year
  d.note = contractor === 'bonded' ? 'Bonded team: higher bills, fewer defects and delays.' : 'Economy team: cheaper bills, more delay and defect risk.'; save(a, d)
  notice(g, 'Contract Signed', `${d.note} Construction begins next year when reserves cover a progress payment.`, { emoji: '🤝' }); return true
}
export function yearlyDevelopment(g: GameState): void {
  if (!g.character.alive) return
  for (const a of g.assets) {
    const d = developmentOf(a)
    if (!d || d.lastYear >= g.year || d.stage !== 'building') continue
    d.lastYear = g.year
    const e = economyOf(g, d.country), step = d.kind === 'industrial' ? 34 : d.kind === 'commercial' ? 25 : 50
    const progress = Math.min(step, 100 - d.progress)
    const cost = Math.round(d.base * .8 * progress / 100 * Math.max(.7, Math.min(1.8, e.sectors.housing.costs * e.wages)) * (d.contractor === 'bonded' ? 1.12 : .95))
    if (d.escrow < cost) { d.note = `Paused: next progress payment needs ${formatMoney(cost)}, reserve ${formatMoney(d.escrow)}.`; save(a, d); continue }
    const delay = Math.min(.65, (d.contractor === 'bonded' ? .04 : .17) + Math.max(0, 1 - e.sectors.industry.availability) * .4 + Math.max(0, e.sectors.housing.workforce - 1) * .1)
    if (chance(g, delay)) {
      const loss = Math.round(cost * (d.contractor === 'bonded' ? .03 : .12)); d.escrow -= loss; d.spent += loss; d.setbacks++
      d.quality = Math.max(30, d.quality - (d.contractor === 'bonded' ? 1 : 5)); d.note = `Materials or contractor delay: ${formatMoney(loss)} in remobilization costs; no progress this year.`
      log(g, `${a.name} suffered a construction delay.`, 'bad')
    } else {
      d.escrow -= cost; d.spent += cost; d.progress += progress; d.note = `Paid ${formatMoney(cost)}; construction ${d.progress}% complete.`
      if (d.progress >= 100) { d.stage = 'commission'; d.note = 'Construction finished. Arrange inspection and commissioning.'; log(g, `${a.name} was ready for commissioning.`, 'good') }
    }
    save(a, d)
  }
}
export function commissionDevelopment(g: GameState, id: string): boolean {
  const a = payable(g, id)
  if (!a) return false
  const d = developmentOf(a)!
  if (d.stage !== 'commission') return false
  const target = g.assets.find(a => a.id === d.company && a.kind === 'business'), b = target && readBiz(g, target)
  if (d.kind === 'industrial' && (!b || !lineOf(b.industry) || b.share < .999 || b.group)) return false
  const inspection = Math.round(d.base * .01)
  const fromReserve = Math.min(d.escrow, inspection)
  if (!payForAction(g, inspection - fromReserve)) return false
  d.escrow -= fromReserve; d.spent += inspection; addMoney(g, d.escrow)
  if (d.kind === 'industrial' && target) {
    const live = bizOf(g, target); live.lines = linesOf(live) + d.units; live.invested += d.spent; live.valuation = valuationOf(live); refreshValue(target, live)
    g.assets = g.assets.filter(x => x.id !== id)
    log(g, `I commissioned ${d.units} capacity line(s) for ${target.name}; its existing production, staffing and upkeep rules now apply.`, 'good')
  } else {
    a.kind = 'house'; a.name = `${d.kind === 'commercial' ? 'Commercial building' : 'New residence'} · ${d.city}`; a.emoji = d.kind === 'commercial' ? '🏢' : '🏠'; a.condition = Math.min(100, d.quality + 20); a.purchasePrice = d.spent
    a.details = { countryId: d.country, city: d.city, type: d.kind === 'commercial' ? 'commercial' : 'house', typeLabel: d.kind === 'commercial' ? 'Commercial building' : 'Residence', commercial: d.kind === 'commercial', built: g.year, beds: d.units * 3, baths: d.units * 2, sqft: d.units * 1800, acres: .15 * d.units, marketValue: Math.round(d.base * (1 + d.quality / 500)), upkeepRate: .012, amenities: [], developmentHistory: `${d.started}–${g.year}: ${formatMoney(d.spent)} spent; ${d.setbacks} setbacks.` }
    refreshHouseValue(a)
    log(g, `I commissioned ${a.name}. It is ready for ${d.kind === 'commercial' ? 'commercial leasing' : 'occupation, rental or sale'}.`, 'good')
  }
  notice(g, 'Development Complete', `Inspection paid ${formatMoney(inspection)}. Returned ${formatMoney(d.escrow)} in unused reserves. Total development cost: ${formatMoney(d.spent)}.`, { emoji: '🏗️', tone: 'good' }); return true
}
/** Unspent reserves come back in full; only the site and the work in place sell at a 15% discount. */
export function cancelDevelopment(g: GameState, id: string): boolean {
  const a = payable(g, id)
  if (!a) return false
  const d = developmentOf(a)!
  const reserve = Math.min(d.escrow, a.value), site = Math.round((a.value - reserve) * .85)
  const proceeds = reserve + site - (a.mortgage?.balance ?? 0)
  addMoney(g, proceeds); g.assets = g.assets.filter(x => x.id !== id)
  notice(g, 'Development Sold', `The site and work in place sold for ${formatMoney(site)} after a 15% distressed discount, and ${formatMoney(reserve)} of unspent reserves came back in full. After repaying the secured loan, your cash changed by ${formatMoney(proceeds)}. This can be negative for an underwater site.`, { emoji: '🏗️' }); return true
}
export function developmentNodes(g: GameState, a: Asset): MenuNode[] | null {
  const d = developmentOf(a)
  if (!d) return null
  return [
    { type: 'info', id: `development.status.${a.id}`, text: `${d.city}, ${getCountry(d.country).name} · ${d.stage}\nProgress ${d.progress}% · Quality ${d.quality}/100 · Started ${d.started}\nSpent ${formatMoney(d.spent)} · Reserve ${formatMoney(d.escrow)} · Secured debt ${formatMoney(a.mortgage?.balance ?? 0)}\n${d.note}` },
    { type: 'action', id: `development.fund.${a.id}`, label: 'Fund Construction Reserve', emoji: '🏦', input: { kind: 'slider', label: 'Transfer from personal cash', money: true, min: 1, max: Math.max(1, Math.min(g.character.money, d.base * 3 - d.escrow)), defaultValue: () => String(Math.max(1, Math.min(g.character.money, d.base))) }, run: (gg, v) => { fundDevelopment(gg, a.id, Number(v)) } },
    { type: 'action', id: `development.finance.${a.id}`, label: 'Secured Development Finance', emoji: '🏦', visible: () => d.kind !== 'industrial' && !a.mortgage, subtitle: '50% of remaining base budget from savings, 50% borrowed; 15-year mortgage', run: gg => { financeDevelopment(gg, a.id) } },
    { type: 'action', id: `development.permit.${a.id}`, label: 'Obtain Planning Permits', emoji: '📋', visible: () => d.stage === 'permits', subtitle: `Fee ${formatMoney(Math.round(d.base * (.01 + (100 - marketOf(d.country).easeOfBusiness) / 5000)))}`, run: gg => { permitDevelopment(gg, a.id) } },
    ...(['economy', 'bonded'] as const).map(contractor => ({ type: 'action' as const, id: `development.contract.${contractor}.${a.id}`, label: `${contractor === 'bonded' ? 'Bonded' : 'Economy'} Contractor`, emoji: '👷', visible: () => d.stage === 'contractor', subtitle: contractor === 'bonded' ? '12% premium; better quality and fewer delays' : '5% discount; more defects and overruns', run: (gg: GameState) => { contractDevelopment(gg, a.id, contractor) } })),
    { type: 'action', id: `development.commission.${a.id}`, label: 'Inspect & Commission', emoji: '✅', visible: () => d.stage === 'commission', subtitle: `Inspection ${formatMoney(d.base * .01)}; unused reserves refunded`, disabledReason: gg => d.kind === 'industrial' && !gg.assets.some(x => x.id === d.company && x.kind === 'business' && readBiz(gg, x).share >= .999 && !readBiz(gg, x).group) ? 'The original standalone, wholly owned company must still be yours. Otherwise sell the site.' : null, run: gg => { commissionDevelopment(gg, a.id) } },
    { type: 'action', id: `development.cancel.${a.id}`, label: 'Sell Unfinished Development', emoji: '💸', confirm: () => 'Sell the site at a 15% distressed discount and repay its secured debt? Unspent reserves are returned in full.', run: gg => { cancelDevelopment(gg, a.id) } },
  ]
}
export const developmentMenu: MenuGroup = {
  type: 'menu', id: 'development', label: 'Development Projects', emoji: '🏗️', disabledReason: g => gate(g, { minAge: 18 }),
  header: () => 'Acquire a site, secure permits, choose a contractor and fund construction. Residential builds need at least two years; commercial four; industrial three. Budget for delays. All prices are real purchasing power.',
  children: g => [
    ...g.assets.filter(a => developmentOf(a)).map(a => ({ type: 'menu' as const, id: `development.${a.id}`, label: a.name, emoji: a.emoji, children: (gg: GameState) => { const live = gg.assets.find(x => x.id === a.id); return live ? developmentNodes(gg, live) ?? [] : [] } })),
    ...(['residential', 'commercial'] as const).map(kind => ({ type: 'menu' as const, id: `development.start.${kind}`, label: kind === 'residential' ? 'Develop a Residence' : 'Develop a Commercial Building', emoji: kind === 'residential' ? '🏠' : '🏢', children: (gg: GameState) => [...new Set([gg.character.city, ...getCountry(gg.character.countryId).cities])].map(city => ({ type: 'action' as const, id: `development.site.${kind}.${city}`, label: city, emoji: '📍', subtitle: `Site ${formatMoney(developmentQuote(gg, kind, 1, '', city) * .2)} · base budget ${formatMoney(developmentQuote(gg, kind, 1, '', city))}`, confirm: () => 'Buy this site? The 20% site cost is paid now. Construction is funded separately and can overrun.', run: (ggg: GameState) => { startDevelopment(ggg, kind, 1, '', city) } })) })),
    ...g.assets.filter(a => a.kind === 'business' && lineOf(readBiz(g, a).industry) && readBiz(g, a).share >= .999 && !readBiz(g, a).group && readBiz(g, a).countryId === g.character.countryId).map(a => ({ type: 'action' as const, id: `development.industrial.${a.id}`, label: `Develop Capacity: ${a.name}`, emoji: '🏭', input: { kind: 'slider' as const, label: 'Capacity lines', min: 1, max: 20, defaultValue: () => '1', preview: (gg: GameState, value: number) => `Personal site payment ${formatMoney(developmentQuote(gg, 'industrial', value, a.id) * .2)}; base budget ${formatMoney(developmentQuote(gg, 'industrial', value, a.id))}. No output until commissioned.` }, run: (gg: GameState, v?: string) => { startDevelopment(gg, 'industrial', Number(v), a.id) } })),
  ],
}
