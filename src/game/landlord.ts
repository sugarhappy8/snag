// Rental operations, separate from property appreciation, mortgages and ordinary upkeep.
import { economyOf } from './economy'
import { householdPressure } from './economy/cohorts'
// Tenants live in the existing Asset.details fields; this optional record adds a save-safe
// lease, service budget, repair queue, vacancy and manager. Menus never mutate or roll.
import { seeded, refreshHouseValue } from './assets'
import { addMoney, earnIncome, formatMoney, log, notice, spend, useYearAction, yearActionsUsed } from './core'
import { taxAdditionalIncome } from './finance'
import { payForAction } from './activities/common'
import type { Asset, GameState, Json, MenuGroup, MenuNode } from './types'
import { getCountry, namePoolOf } from './world'

export interface LandlordState {
  v: number
  listed: boolean
  askingRent: number
  satisfaction: number
  arrears: number
  leaseUntil: number
  years: number
  maintenance: 'defer' | 'standard' | 'proactive'
  managerSkill: number
  managerFee: number
  issue: string
  repairCost: number
  vacancyYears: number
  lastYear: number
  lastGross: number
  lastExpenses: number
  lastNet: number
}

const finite = (v: Json | undefined, fallback = 0, max = 1e12, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback
const string = (v: Json | undefined, fallback = '') => typeof v === 'string' ? v.trim().slice(0, 100) : fallback

export function landlordView(a: Asset): LandlordState {
  const raw = a.details.landlord
  const x = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return { v: 1, listed: x.listed === true || !!a.rentedOutFor,
    askingRent: finite(x.askingRent, finite(a.rentedOutFor, rentalMarket(a))),
    satisfaction: finite(x.satisfaction, 70, 100), arrears: finite(x.arrears), leaseUntil: finite(x.leaseUntil, 0, 100_000), years: finite(x.years),
    maintenance: x.maintenance === 'defer' || x.maintenance === 'proactive' ? x.maintenance : 'standard',
    managerSkill: finite(x.managerSkill, 0, 100), managerFee: finite(x.managerFee, 0, .2),
    issue: string(x.issue), repairCost: finite(x.repairCost), vacancyYears: finite(x.vacancyYears),
    lastYear: finite(x.lastYear, -1, 100_000, -1), lastGross: finite(x.lastGross), lastExpenses: finite(x.lastExpenses), lastNet: finite(x.lastNet, 0, 1e12, -1e12) }
}

function save(a: Asset, p: LandlordState): void {
  a.details.landlord = p as unknown as Json
}

export function rentalMarket(a: Asset): number {
  return Math.round(Math.max(600, a.value * (a.details.commercial === true ? .072 : .054) * (.7 + .3 * Math.max(0, Math.min(100, a.condition)) / 100)))
}

/** A commercial fit-out and fixed-term lease use the same landlord books as homes. */
export function signCommercialLease(g: GameState, id: string, tenant: string): boolean {
  const a = ownedRental(g, id)
  if (!a || a.details.commercial !== true || a.rentedOutFor || !['office', 'shop', 'workshop'].includes(tenant) || a.condition < 40) return false
  const cost = Math.round(a.value * (tenant === 'workshop' ? .05 : .025))
  if (!payForAction(g, cost)) return false
  a.rentedOutFor = Math.round(rentalMarket(a) * (tenant === 'workshop' ? 1.15 : tenant === 'office' ? 1 : .9))
  a.details.tenant = `${tenant === 'office' ? 'Professional office' : tenant === 'shop' ? 'Local retailer' : 'Independent workshop'} tenant`
  a.details.tenantTrait = 'commercial lease'; a.details.tenantRisk = tenant === 'shop' ? .16 : tenant === 'workshop' ? .12 : .07
  a.details.commercialTenant = tenant; beginLandlordLease(g, a)
  const p = landlordView(a); p.leaseUntil = g.year + 5; save(a, p)
  notice(g, 'Commercial Lease Signed', `${formatMoney(cost)} funded the tenant fit-out. Five-year lease: ${formatMoney(a.rentedOutFor)}/year. Business conditions affect collection; service, repairs, upkeep and secured debt still cost money.`, { emoji: '🏢' })
  return true
}

function ownedRental(g: GameState, id: string): Asset | null {
  if (!g.character.alive || g.character.prison || g.character.age < 18) return null
  const a = g.assets.find((asset) => asset.id === id && asset.kind === 'house')
  if (!a || (g.character.residence.status === 'owned' && g.character.residence.assetId === id)) return null
  return a
}

/** Called on accepting an applicant. No new tenant principal/security deposit is invented. */
export function beginLandlordLease(g: GameState, a: Asset): void {
  const p = landlordView(a)
  p.listed = true; p.askingRent = finite(a.rentedOutFor, rentalMarket(a)); p.satisfaction = 75
  p.arrears = 0; p.years = 0; p.leaseUntil = g.year + (a.details.commercial === true ? 5 : 2); p.vacancyYears = 0
  save(a, p)
}

export function endLandlordLease(a: Asset): void {
  const p = landlordView(a)
  p.listed = false; p.arrears = 0; p.years = 0; p.leaseUntil = 0
  save(a, p)
}

export function setRentalRent(g: GameState, id: string, annual: number): void {
  const a = ownedRental(g, id)
  if (!a || !Number.isFinite(annual) || annual <= 0) return
  const p = landlordView(a), market = rentalMarket(a)
  if (a.rentedOutFor && g.year < p.leaseUntil) return notice(g, 'Fixed Lease', `The existing rent is fixed until ${p.leaseUntil}. You can change it at renewal.`, { emoji: '📜' })
  if (annual < market * .5 || annual > market * 1.5) return
  if (!useYearAction(g, `landlord.rent.${id}`, 1)) return
  const old = a.rentedOutFor ?? p.askingRent
  p.askingRent = Math.round(annual)
  if (a.rentedOutFor) {
    a.rentedOutFor = p.askingRent; p.leaseUntil = g.year + (a.details.commercial === true ? 5 : 2)
    p.satisfaction = Math.max(0, p.satisfaction - Math.max(0, annual / Math.max(1, old) - 1) * 80)
  }
  save(a, p)
  notice(g, 'Rental Price', `Annual rent is ${formatMoney(p.askingRent)} (${formatMoney(Math.round(p.askingRent / 12))}/month). Above-market rent and steep renewal increases raise vacancy and move-out risk.`, { emoji: '🔑' })
}

export function setRentalMaintenance(g: GameState, id: string, policy: LandlordState['maintenance']): void {
  const a = ownedRental(g, id)
  if (!a || !['defer', 'standard', 'proactive'].includes(policy)) return
  const p = landlordView(a); p.maintenance = policy; save(a, p)
  notice(g, 'Rental Service Budget', `${policy === 'defer' ? 'Deferred service costs less now, but tenants and the building suffer.' : policy === 'proactive' ? 'Proactive service reduces repair risk and improves retention.' : 'Standard service balances rental costs and tenant satisfaction.'} This is additional rental service, separate from property tax and basic asset upkeep.`, { emoji: '🛠️' })
}

export function hireRentalManager(g: GameState, id: string, skill: number): void {
  const a = ownedRental(g, id)
  if (!a || ![0, 65, 90].includes(skill)) return
  const p = landlordView(a)
  if (p.managerSkill === skill) return
  const fee = skill ? Math.round(Math.max(100, p.askingRent * .01)) : 0
  if (fee && !spend(g, fee, 'purchase')) return notice(g, 'Property Management', `A new management contract costs ${formatMoney(fee)} to set up.`, { emoji: '🏠' })
  p.managerSkill = skill; p.managerFee = skill === 90 ? .12 : skill === 65 ? .08 : 0
  save(a, p)
  notice(g, 'Property Management', skill ? `Your skill-${skill} manager takes ${Math.round(p.managerFee * 100)}% of rent actually collected. They screen replacements, follow up on arrears and arrange affordable repairs. Listing a vacant home is still your decision.` : 'You will manage leasing, tenant concerns and repairs yourself.', { emoji: '🏠' })
}

export function repairRental(g: GameState, id: string): void {
  const a = ownedRental(g, id)
  if (!a) return
  const p = landlordView(a)
  if (!p.issue || p.repairCost <= 0) return
  if (!spend(g, p.repairCost, 'purchase')) return notice(g, 'Rental Repair', `You need ${formatMoney(p.repairCost)} for ${p.issue}.`, { emoji: '🛠️' })
  const cost = p.repairCost
  p.issue = ''; p.repairCost = 0; p.satisfaction = Math.min(100, p.satisfaction + 15)
  a.condition = Math.min(100, a.condition + 5); refreshHouseValue(a); save(a, p)
  notice(g, 'Tenant Concern Resolved', `${formatMoney(cost)} fixed the outstanding repair. Tenant satisfaction and property condition improved.`, { emoji: '🛠️', tone: 'good' })
}

export function listRental(g: GameState, id: string): void {
  const a = ownedRental(g, id)
  if (!a || a.rentedOutFor) return
  if (a.details.commercial === true && !a.details.commercialTenant) return notice(g, 'Commercial Fit-Out Required', 'Choose and pay for an office, retail or workshop fit-out before advertising the premises.', { emoji: '🏢' })
  const p = landlordView(a); p.listed = !p.listed; save(a, p)
  notice(g, p.listed ? 'Rental Listed' : 'Listing Paused', p.listed ? `The property is advertised at your asking rent. A manager can screen and sign a replacement on age-up; without a manager, use ${a.details.commercial === true ? 'Fit Out & Lease' : 'Rent Out'} to choose a tenant yourself.` : 'No new tenant will be sought automatically.', { emoji: '🪧' })
}

/** Returns this year's net operating rental receipts, paying/taxing them exactly once. */
export function yearlyLandlord(g: GameState): number {
  if (!g.character.alive) return 0
  const year = g.year - 1
  let total = 0
  for (const a of g.assets) {
    if (a.kind !== 'house' || (!a.rentedOutFor && !a.details.landlord)) continue
    const upgraded = !!a.details.landlord
    const p = landlordView(a)
    if (p.lastYear >= year) continue
    p.lastYear = year
    if (g.character.residence.status === 'owned' && g.character.residence.assetId === a.id) { save(a, p); continue }
    const rng = seeded(`${g.lifeId}|rental|${a.id}|${year}`), market = rentalMarket(a)
    const economy = economyOf(g, string(a.details.countryId, g.character.countryId), year)
    // Lost work and lower household spending describe the same affordability
    // shock. Use the stronger signal once rather than charging two penalties.
    const affordabilityGap = a.details.commercial === true ? Math.max(0, 1 - economy.confidence, 1 - economy.sectors[a.details.commercialTenant === 'workshop' ? 'industry' : 'consumer'].demand) : Math.max(0, 1 - householdPressure(economy), (economy.unemployment - .06) * 2)
    let occupied = !!a.rentedOutFor, occupancy = 1, gross = 0, repairs = 0
    if (!occupied && p.listed) {
      p.vacancyYears += 1
      const fill = Math.max(.05, Math.min(.95, .8 + p.managerSkill / 500 - Math.max(0, p.askingRent / market - 1) * 1.5 - Math.max(0, 60 - a.condition) / 100 - affordabilityGap * .75))
      if (p.managerSkill > 0 && a.condition >= 20 && (a.details.commercial !== true || !!a.details.commercialTenant) && rng.chance(fill)) {
        const countryId = string(a.details.countryId, g.character.countryId), pool = namePoolOf(countryId)
        a.rentedOutFor = p.askingRent
        a.details.tenant = a.details.commercial === true ? 'Screened commercial tenant' : `${rng.pick(pool.male)} ${rng.pick(pool.last)}`
        a.details.tenantTrait = 'screened by your property manager'
        a.details.tenantRisk = Math.max(.015, .15 - p.managerSkill / 800)
        a.details.tenantLate = 0; p.arrears = 0; p.satisfaction = 75; p.leaseUntil = year + (a.details.commercial === true ? 5 : 2); p.years = 0
        occupied = true; occupancy = rng.float(.5, .85); p.vacancyYears = 0
        log(g, `My property manager found a new tenant for ${a.name}; rent covers ${Math.round(occupancy * 12)} occupied months.`, 'good')
      }
    }
    if (occupied) {
      p.years += 1
      const service = p.maintenance === 'proactive' ? 6 : p.maintenance === 'defer' ? -8 : 1
      p.satisfaction = Math.max(0, Math.min(100, p.satisfaction + service + p.managerSkill / 30 - Math.max(0, p.askingRent / market - 1) * 15 - (p.issue ? 12 : 0)))
      const issueRisk = Math.max(.015, .12 + Math.max(0, 60 - a.condition) / 250 + (p.maintenance === 'defer' ? .1 : p.maintenance === 'proactive' ? -.05 : 0) - p.managerSkill / 1500)
      if (!p.issue && upgraded && rng.chance(issueRisk)) {
        p.issue = rng.pick(['a leaking roof', 'failed plumbing', 'a broken heater', 'unsafe wiring'])
        const countryId = string(a.details.countryId, g.character.countryId)
        p.repairCost = Math.round(Math.max(150 * Math.max(.2, getCountry(countryId).wealth), a.value * rng.float(.0015, .006)))
        notice(g, 'Rental Repair Request', `${string(a.details.tenant, 'Your tenant')} reported ${p.issue} at ${a.name}. Repair estimate: ${formatMoney(p.repairCost)}. Ignoring it reduces satisfaction, rent collection and condition.`, { emoji: '🛠️' })
      }
      // A manager may only commit cash already on hand, not speculative future rent.
      if (p.issue && p.managerSkill > 0 && g.character.money >= p.repairCost) {
        repairs = p.repairCost; p.issue = ''; p.repairCost = 0; p.satisfaction = Math.min(100, p.satisfaction + 12)
        a.condition = Math.min(100, a.condition + 4)
      }
      if (p.issue) a.condition = Math.max(0, a.condition - 4)
      const tenantRisk = finite(a.details.tenantRisk, .08, .6)
      const risk = Math.min(.85, Math.max(.005, tenantRisk + Math.max(0, 45 - p.satisfaction) / 200 - p.managerSkill / 1400 + affordabilityGap * .65))
      const due = Math.round((a.rentedOutFor ?? 0) * occupancy * (p.issue ? .8 : 1))
      const missed = rng.chance(risk)
      gross = missed ? Math.round(due * rng.float(.1, .65)) : due
      p.arrears += due - gross
      a.details.tenantLate = missed ? finite(a.details.tenantLate) + 1 : 0
      if (!missed && p.arrears > 0) {
        const recovery = Math.min(p.arrears, Math.round(due * (p.managerSkill ? .2 + p.managerSkill / 500 : .1)))
        gross += recovery; p.arrears -= recovery
      }
      if (missed) log(g, `${string(a.details.tenant, 'My tenant')} missed part of the rent on ${a.name}; arrears are ${formatMoney(p.arrears)}.`, 'bad')
      const exit = Math.max(.015, .035 + Math.max(0, 55 - p.satisfaction) / 150 + Math.max(0, p.askingRent / market - 1.1) * .4)
      if (year >= p.leaseUntil && rng.chance(exit)) {
        log(g, `${string(a.details.tenant, 'My tenant')} moved out of ${a.name}. It is vacant and listed for a replacement.`, 'neutral')
        delete a.rentedOutFor; delete a.details.tenant; delete a.details.tenantTrait; delete a.details.tenantRisk; delete a.details.tenantLate
        p.years = 0; p.leaseUntil = 0; p.arrears = 0; p.listed = true; p.vacancyYears = 1
      }
    }
    // Migrating an old save does not silently charge a new service budget in its
    // first rental settlement. New leases and configured properties opt in normally.
    const serviceCost = occupied && upgraded ? Math.round(market * (p.maintenance === 'proactive' ? .06 : p.maintenance === 'defer' ? .005 : .025)) : 0
    const managerFee = Math.round(gross * p.managerFee)
    const expenses = serviceCost + managerFee + repairs, net = gross - expenses
    p.lastGross = gross; p.lastExpenses = expenses; p.lastNet = net
    if (net > 0) { earnIncome(g, net, 'rent'); taxAdditionalIncome(g, net) }
    else if (net < 0) addMoney(g, net, 'rent')
    total += net; refreshHouseValue(a); save(a, p)
  }
  return total
}

export function landlordMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `landlord.${a.id}`, label: 'Landlord Operations', emoji: '🔑',
    visible: (g) => a.kind === 'house' && !(g.character.residence.status === 'owned' && g.character.residence.assetId === a.id),
    children: (g): MenuNode[] => {
      const live = g.assets.find((x) => x.id === a.id && x.kind === 'house')
      if (!live) return []
      const p = landlordView(live), market = rentalMarket(live)
      const block = (gg: GameState) => ownedRental(gg, a.id) ? null : 'An adult owner must manage this property outside prison.'
      const action = (id: string, label: string, run: (gg: GameState) => void, subtitle?: string): MenuNode => ({ type: 'action', id: `landlord.${a.id}.${id}`, label, emoji: '🏠', subtitle, disabledReason: block, run })
      const nodes: MenuNode[] = [{ type: 'info', id: `landlord.${a.id}.summary`, emoji: '🔑', text: `${live.rentedOutFor ? `Tenant: ${string(live.details.tenant, 'Your tenant')} · satisfaction ${Math.round(p.satisfaction)}/100 · arrears ${formatMoney(p.arrears)} · lease fixed through ${p.leaseUntil}` : `Vacant${p.listed ? ' · listed' : ' · not listed'} · ${p.vacancyYears} vacant years`}.\nAsking rent ${formatMoney(p.askingRent)}/year; comparable ${formatMoney(market)}/year. Manager skill ${p.managerSkill || 'none'}; ${Math.round(p.managerFee * 100)}% of collected rent.\nLast rental year: gross ${formatMoney(p.lastGross)}, operating expenses ${formatMoney(p.lastExpenses)}, net ${formatMoney(p.lastNet)}. Property upkeep and mortgages are separate.` }]
      if (!live.rentedOutFor && (live.details.commercial !== true || !!live.details.commercialTenant)) nodes.push(action('listing', p.listed ? 'Pause Rental Listing' : 'Advertise a Rental Vacancy', (gg) => listRental(gg, a.id), 'Managers can fill an advertised, fitted-out vacancy automatically'))
      if (live.details.commercial === true && !live.rentedOutFor) for (const tenant of ['office', 'shop', 'workshop']) nodes.push(action(`commercial.${tenant}`, `Fit Out & Lease to a ${tenant === 'office' ? 'Professional Office' : tenant === 'shop' ? 'Retailer' : 'Workshop'}`, gg => { signCommercialLease(gg, a.id, tenant) }, `Fit-out ${formatMoney(live.value * (tenant === 'workshop' ? .05 : .025))}; five-year lease; ${tenant === 'workshop' ? 'higher rent, more collection risk' : tenant === 'shop' ? 'lower rent, sensitive to consumer demand' : 'standard rent, lower collection risk'}`))
      for (const multiplier of [.85, 1, 1.2]) nodes.push({ type: 'action', id: `landlord.${a.id}.rent.${multiplier}`, label: `${multiplier < 1 ? 'Affordable' : multiplier > 1 ? 'Premium' : 'Market'} Rent: ${formatMoney(Math.round(market * multiplier / 12))}/month`, emoji: '🔑',
        disabledReason: (gg) => block(gg) ?? (yearActionsUsed(gg, `landlord.rent.${a.id}`) ? 'Rent was already set this year.' : live.rentedOutFor && gg.year < landlordView(live).leaseUntil ? 'The current lease has a fixed rent until renewal.' : null), run: (gg) => { const current = gg.assets.find((x) => x.id === a.id); if (current) setRentalRent(gg, a.id, rentalMarket(current) * multiplier) } })
      for (const policy of ['defer', 'standard', 'proactive'] as const) nodes.push(action(`maintenance.${policy}`, `${policy[0].toUpperCase()}${policy.slice(1)} Rental Service`, (gg) => setRentalMaintenance(gg, a.id, policy), 'Extra rental service, separate from normal property upkeep'))
      for (const skill of [0, 65, 90]) nodes.push(action(`manager.${skill}`, skill ? `Hire ${skill === 90 ? 'Expert' : 'Standard'} Property Manager` : 'Manage the Property Yourself', (gg) => hireRentalManager(gg, a.id, skill), skill ? `${skill === 90 ? 12 : 8}% of collected rent; setup 1% of annual asking rent` : 'No management fee; find and screen replacement tenants yourself'))
      if (p.issue) nodes.push(action('repair', `Resolve ${p.issue}`, (gg) => repairRental(gg, a.id), `Current estimate ${formatMoney(p.repairCost)}; protects condition and tenant trust`))
      return nodes
    } }
}
