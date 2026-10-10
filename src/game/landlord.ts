// Rental operations, separate from property appreciation, mortgages and ordinary upkeep.
import { economyOf } from './economy'
// Tenants live in the existing Asset.details fields; this optional record adds a save-safe
// lease, service budget, repair queue, vacancy and manager. Menus never mutate or roll.
import { seeded, refreshHouseValue } from './assets'
import { addMoney, earnIncome, formatMoney, log, notice, spend, useYearAction, yearActionsUsed } from './core'
import { taxAdditionalIncome } from './finance'
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
  return Math.round(Math.max(600, a.value * .054 * (.7 + .3 * Math.max(0, Math.min(100, a.condition)) / 100)))
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
  p.arrears = 0; p.years = 0; p.leaseUntil = g.year + 2; p.vacancyYears = 0
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
    a.rentedOutFor = p.askingRent; p.leaseUntil = g.year + 2
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
  if (fee && !spend(g, fee)) return notice(g, 'Property Management', `A new management contract costs ${formatMoney(fee)} to set up.`, { emoji: '🏠' })
  p.managerSkill = skill; p.managerFee = skill === 90 ? .12 : skill === 65 ? .08 : 0
  save(a, p)
  notice(g, 'Property Management', skill ? `Your skill-${skill} manager takes ${Math.round(p.managerFee * 100)}% of rent actually collected. They screen replacements, follow up on arrears and arrange affordable repairs. Listing a vacant home is still your decision.` : 'You will manage leasing, tenant concerns and repairs yourself.', { emoji: '🏠' })
}

export function repairRental(g: GameState, id: string): void {
  const a = ownedRental(g, id)
  if (!a) return
  const p = landlordView(a)
  if (!p.issue || p.repairCost <= 0) return
  if (!spend(g, p.repairCost)) return notice(g, 'Rental Repair', `You need ${formatMoney(p.repairCost)} for ${p.issue}.`, { emoji: '🛠️' })
  const cost = p.repairCost
  p.issue = ''; p.repairCost = 0; p.satisfaction = Math.min(100, p.satisfaction + 15)
  a.condition = Math.min(100, a.condition + 5); refreshHouseValue(a); save(a, p)
  notice(g, 'Tenant Concern Resolved', `${formatMoney(cost)} fixed the outstanding repair. Tenant satisfaction and property condition improved.`, { emoji: '🛠️', tone: 'good' })
}

export function listRental(g: GameState, id: string): void {
  const a = ownedRental(g, id)
  if (!a || a.rentedOutFor) return
  const p = landlordView(a); p.listed = !p.listed; save(a, p)
  notice(g, p.listed ? 'Rental Listed' : 'Listing Paused', p.listed ? 'The home is advertised at your asking rent. A manager can screen and sign a replacement on age-up; without a manager, use Rent Out to choose an applicant yourself.' : 'No new tenant will be sought automatically.', { emoji: '🪧' })
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
    let occupied = !!a.rentedOutFor, occupancy = 1, gross = 0, repairs = 0
    if (!occupied && p.listed) {
      p.vacancyYears += 1
      const fill = Math.max(.05, Math.min(.95, .8 + p.managerSkill / 500 - Math.max(0, p.askingRent / market - 1) * 1.5 - Math.max(0, 60 - a.condition) / 100 - Math.max(0, economy.unemployment - .06) * 1.5))
      if (p.managerSkill > 0 && a.condition >= 20 && rng.chance(fill)) {
        const countryId = string(a.details.countryId, g.character.countryId), pool = namePoolOf(countryId)
        a.rentedOutFor = p.askingRent
        a.details.tenant = `${rng.pick(pool.male)} ${rng.pick(pool.last)}`
        a.details.tenantTrait = 'screened by your property manager'
        a.details.tenantRisk = Math.max(.015, .15 - p.managerSkill / 800)
        a.details.tenantLate = 0; p.arrears = 0; p.satisfaction = 75; p.leaseUntil = year + 2; p.years = 0
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
      const risk = Math.min(.85, Math.max(.005, tenantRisk + Math.max(0, 45 - p.satisfaction) / 200 - p.managerSkill / 1400 + Math.max(0, economy.unemployment - .06) * 1.3))
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
    if (net > 0) { earnIncome(g, net); taxAdditionalIncome(g, net) }
    else if (net < 0) addMoney(g, net)
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
      if (!live.rentedOutFor) nodes.push(action('listing', p.listed ? 'Pause Rental Listing' : 'Advertise a Rental Vacancy', (gg) => listRental(gg, a.id), 'Managers can fill an advertised vacancy automatically; manual Rent Out lets you choose'))
      for (const multiplier of [.85, 1, 1.2]) nodes.push({ type: 'action', id: `landlord.${a.id}.rent.${multiplier}`, label: `${multiplier < 1 ? 'Affordable' : multiplier > 1 ? 'Premium' : 'Market'} Rent: ${formatMoney(Math.round(market * multiplier / 12))}/month`, emoji: '🔑',
        disabledReason: (gg) => block(gg) ?? (yearActionsUsed(gg, `landlord.rent.${a.id}`) ? 'Rent was already set this year.' : live.rentedOutFor && gg.year < landlordView(live).leaseUntil ? 'The current lease has a fixed rent until renewal.' : null), run: (gg) => { const current = gg.assets.find((x) => x.id === a.id); if (current) setRentalRent(gg, a.id, rentalMarket(current) * multiplier) } })
      for (const policy of ['defer', 'standard', 'proactive'] as const) nodes.push(action(`maintenance.${policy}`, `${policy[0].toUpperCase()}${policy.slice(1)} Rental Service`, (gg) => setRentalMaintenance(gg, a.id, policy), 'Extra rental service, separate from normal property upkeep'))
      for (const skill of [0, 65, 90]) nodes.push(action(`manager.${skill}`, skill ? `Hire ${skill === 90 ? 'Expert' : 'Standard'} Property Manager` : 'Manage the Property Yourself', (gg) => hireRentalManager(gg, a.id, skill), skill ? `${skill === 90 ? 12 : 8}% of collected rent; setup 1% of annual asking rent` : 'No management fee; find and screen replacement tenants yourself'))
      if (p.issue) nodes.push(action('repair', `Resolve ${p.issue}`, (gg) => repairRental(gg, a.id), `Current estimate ${formatMoney(p.repairCost)}; protects condition and tenant trust`))
      return nodes
    } }
}
