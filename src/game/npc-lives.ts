import { seeded } from './assets'
import { addMoney, earnIncome, log, notice, useYearAction } from './core'
import { firmCash, firmPurse, moveCash, personCash, personPurse, playerPurse, poolPurse } from './cash'
import { economyOf, recordEconomicActivity } from './economy'
import { educationAccess } from './economy/cohorts'
import { typicalIncome } from './events/wealth-core'
import { hasTech } from './history/timeline'
import { eraOccupation } from './history/events-people'
import type { Asset, GameState, Json, MenuNode, Person } from './types'
import { COUNTRIES, getCountry } from './world'
import { createBusinessAsset, initialProduction, newBiz } from './business/founding'
import { bestPlan, evolve, recordYear, simulateYear, startupCost, valuationOf, refreshValue } from './business/economy'
import { industryEraBlock } from './business/competition-data'
import { refreshMarket } from './business/competition'
import { marketKey } from './business/competition-core'
import { readJob } from './business/nepo-job'
import { readGroupJob } from './business/conglomerate-job'
import { holdsInfluenceJob } from './special/corruption'
import { blocAccess, exitRegime, personCitizenships } from './activities/immigration-state'
import { bestOpening, withOutlets } from './business/board-ceo'
import { runningCosts } from './business/board-vote'
import { installManager } from './business/career'
import { npcOccupationLabel } from './love'
import { markRoyalFamily, royalRule } from './royalty'
import { initializeRoyalEducation, royalAppointment, royalCourtActive, studyForRoyalCareer, type RoyalAppointment } from './royal-careers'
import { isIndustryLegal, type Industry } from './data/markets'
import type { BizState } from './business/state'
import { clampN, money, num, pct, rec } from './business/util'
import { npcLife, saveNpcLife, type NpcField, type NpcLife } from './npc-state'
import { personKey } from './kernel/person-ref'
import { metRecord } from './world/met'
import { isClose, peopleFog, readPerson } from './people-fog'
import { pickLine, pickSite } from './text/pick'
import { HOME_BOUGHT, HOME_BOUGHT_LINES, PROMO_LINES, PROMOTED } from './text/pools'
import { npcCompany } from './npc-company-state'
import { inheritFamilyTalent, npcHasMainCharacter } from './talents'
import { ageCeiling } from './mastery'
import { familyGroupStake } from './business/dynasty-ownership'
import { liveGroup, saveGroup } from './business/conglomerate-state'
import { isDeepTechIndustry } from './business/deeptech-state'
import { stampWave } from './business/tech-waves'

export { npcLife } from './npc-state'
export { npcCompany } from './npc-company-state'
const holdsFamilyJob = (p: Person) => !!readJob(p)
const managedEmployment = (g: GameState, p: Person) => holdsFamilyJob(p) || !!readGroupJob(p) || holdsInfluenceJob(g, p)
const IMPORTANT = ['parent','stepparent','sibling','halfSibling','stepsibling','child','stepchild','grandchild','grandparent','spouse','partner','fiance','friend','bestFriend','lover']

function syncRoyalAppointment(g: GameState, p: Person, l: NpcLife): RoyalAppointment | null {
  const previous = rec(p.data.royalAppointment)
  const managed = managedEmployment(g, p)
  if (p.data.royalSovereign === true && typeof p.data.royalCountry !== 'string') p.data.royalCountry = l.country
  if (p.data.royalSovereign === true && !royalCourtActive(g, p)) {
    p.data.royalSovereign = false
    if (!managed && p.occupation === p.data.royalRole) { p.occupation = 'Unemployed'; l.employer = ''; l.income = 0 }
  }
  const appointment = managed ? null : royalAppointment(g, p, l)
  if (appointment) {
    if (p.data.royalCountry === 'gb') p.data.royalHouse = royalRule('gb', g.year)!.house
    p.occupation = appointment.title; l.employer = appointment.employer
    if (previous?.title !== appointment.title || previous?.employer !== appointment.employer) {
      l.history = [...l.history, `${g.year}: ${appointment.title} at ${appointment.employer}`].slice(-24)
    }
    p.data.royalAppointment = { ...appointment }
  } else if (previous) {
    delete p.data.royalAppointment
    if (!managed && p.occupation === previous.title) { p.occupation = 'Unemployed'; l.employer = ''; l.income = 0 }
    l.history = [...l.history, `${g.year}: official royal appointment ended; public funds remain separate from private assets`].slice(-24)
  }
  return appointment
}

/** Birth and validated-save upgrade: no RNG consumption, salary payment or asset grants. */
export function refreshRoyalCareers(g: GameState, newBirth = false): void {
  markRoyalFamily(g)
  for (const p of g.people) {
    if (!p.alive || typeof p.data.royalHouse !== 'string') continue
    const knownLife = npcLife(p)
    const l = initializeNpc(g, p)
    if (newBirth) initializeRoyalEducation(g, p, l)
    else if (!knownLife) { l.education = 0; l.achievements = [] } // An old job label is not proof of a degree.
    syncRoyalAppointment(g, p, l)
    saveNpcLife(p, l)
    // At age zero an old save's birth description still describes the current household.
    // Do not rewrite decades of historical diary entries with today's appointment.
    if (g.character.age === 0 && p.relation === 'parent' && p.data.royalAppointment) {
      const prefix = `My ${p.gender === 'male' ? 'father' : 'mother'} is ${p.firstName} ${p.lastName}, `
      for (const year of g.log.filter(y => y.age === 0 && y.year === g.year)) {
        for (const entry of year.entries) if (entry.text.startsWith(prefix)) entry.text = `${prefix}a ${p.age} year old ${p.occupation}.`
      }
    }
  }
}

/**
 * Where a person's ambition starts, 5..98. The roll is the old one, for everyone who has no Met record: 35 plus 40 times a draw, 20 more
 * for `ambitious` and 25 less for `lazy`. A person with a Met record starts from the record's ambition axis instead; that axis already
 * counts their words (the record's words come from its axes), so no bonus is added. The draw is taken either way, so every person reads
 * their seed in the same order.
 */
function startingAmbition(p: Person, drawn: number, axis: number | null): number {
  if (axis !== null) return clampN(axis, 5, 98)
  return clampN(35 + drawn * 40 + (p.traits.includes('ambitious') ? 20 : 0) - (p.traits.includes('lazy') ? 25 : 0), 5, 98)
}

export function initializeNpc(g: GameState, p: Person): NpcLife {
  inheritFamilyTalent(g, p)
  const existing = npcLife(p)
  if (existing) return existing
  const roll = seeded(`npc-life|${personKey(p)}|${g.lifeId.replace(/-g\d+$/, '')}`)
  const met = metRecord(g, personKey(p))
  const local = typeof p.data.countryId === 'string' ? p.data.countryId : g.character.countryId
  let field: NpcField = /Finance|Bank|Account|Invest/.test(p.occupation) ? 'Finance' : /Doctor|Nurse|Dentist/.test(p.occupation) ? 'Medicine' : /Engineer|Mechanic/.test(p.occupation) ? 'Engineering' : /Law/.test(p.occupation) ? 'Law' : /Software/.test(p.occupation) ? 'Computer Science' : roll.pick(['Engineering','Finance','Mathematics','Law','Marketing','Business'])
  if (field === 'Computer Science' && g.year < 1965) field = 'Mathematics'
  const professional = /Doctor|Engineer|Lawyer|Accountant|Professor|Software|Architect/.test(p.occupation)
  const life: NpcLife = { v: 1, lastYear: g.year - 1, country: local, city: getCountry(local).cities[0], field, education: p.age >= 23 && professional ? 1 : 0,
    study: p.occupation === 'University Student' ? Math.min(3, Math.max(0, p.age - 18)) : 0,
    skill: clampN(p.stats.smarts * .3 + Math.max(0, p.age - 18) * .5, 10, 85), experience: Math.max(0, p.age - (professional ? 22 : 18)), income: 0,
    debt: 0, investments: 0, housing: 0, ambition: startingAmbition(p, roll.next(), met ? met.a[0] : null), employer: '', history: [], achievements: [], housingQuality: 50 }
  if (life.education) life.achievements.push(`Bachelor's in ${field}`)
  saveNpcLife(p, life)
  return life
}
export { PROMO_LINES }
/** `say`, when given, is what the player's log says instead of `text` (the person's own history keeps `text`): a line that comes round every few years varies; '' keeps it out of the player's log. */
function milestone(g: GameState, p: Person, l: NpcLife, text: string, say?: string): void {
  l.history = [...l.history, `${g.year}: ${text}`].slice(-24)
  if (say !== '' && (p.livesWithPlayer || p.relationship >= 55) && (g.yearActions['npc.news'] ?? 0) < 3) {
    g.yearActions['npc.news'] = (g.yearActions['npc.news'] ?? 0) + 1
    log(g, `${p.firstName}: ${say ?? (text === PROMOTED ? pickLine(g, PROMO_LINES) : text === HOME_BOUGHT ? pickLine(g, HOME_BOUGHT_LINES) : text)}`)
  }
}
function storeCompany(p: Person, a: Asset): void { p.data.npcCompany = a as unknown as Json }
/** A name no other company in this life uses: "Cooper Café", then "Jamie Cooper Café" for the spouse. */
function freshCompanyName(g: GameState, p: Person, kind: string): string {
  const taken = new Set([...g.assets.map((a) => a.name), ...g.people.flatMap((q) => { const name = rec(q.data.npcCompany)?.name; return typeof name === 'string' ? [name] : [] })])
  const full = `${p.firstName} ${p.lastName} ${kind}`
  const name = [`${p.lastName} ${kind}`, full].find((n) => !taken.has(n))
  if (name) return name
  let i = 2
  while (taken.has(`${full} ${i}`)) i++
  return `${full} ${i}`
}
export function startNpcCompany(g: GameState, p: Person, industry?: Industry): boolean {
  if (!p.alive || p.age < 21 || npcCompany(p, g.year)) return false
  const l = initializeNpc(g, p), local = getCountry(l.country)
  const chosen = industry ?? (l.field === 'Computer Science' && hasTech({ ...g, character: { ...g.character, countryId: l.country } }, 'homeComputer') ? 'software' : l.field === 'Marketing' ? 'marketing' : l.field === 'Engineering' ? 'manufacturing' : 'cafe')
  // These two classes need launch/R&D workflows rather than this independent operating model.
  // Do not create shell studios/labs that sell generic units without producing games or research.
  if (chosen === 'gameStudio' || isDeepTechIndustry(chosen)) return false
  if (!isIndustryLegal(l.country, chosen) || industryEraBlock(chosen, l.country, g.year)) return false
  const cost = startupCost(chosen, l.country, local.cities[0])
  if (p.money < cost.total * 1.5) return false
  if (npcHasMainCharacter(p)) l.skill = 100 // First real use of business mastery.
  const capital = cost.capital * 1.5
  // The capital goes to the pool of firms (the company has no account yet); the fee and the permits go to the state.
  moveCash(g, personPurse(p), poolPurse('firms'), capital, 'inject')
  personCash(g, p, -(cost.fee + cost.permits), { reason: 'fee.gov', country: l.country })
  const b = newBiz(g, chosen, l.country, local.cities[0], { founderName: `${p.firstName} ${p.lastName}`, npcOwnerId: p.id, cash: capital - cost.capital * .8, invested: capital, ceo: 'manager', manager: { firstName: p.firstName, lastName: p.lastName, gender: p.gender, skill: l.skill, salary: 0, since: g.year } })
  b.production = initialProduction(g, b); b.valuation = valuationOf(b)
  const a = createBusinessAsset(g, freshCompanyName(g, p, chosen === 'cafe' ? 'Café' : 'Company'), b, capital)
  refreshValue(a, b); storeCompany(p, a)
  p.occupation = 'Business Owner'; l.employer = a.name
  milestone(g, p, l, `founded ${a.name} using ${money(capital + cost.fee + cost.permits)} of personal savings`)
  saveNpcLife(p, l)
  return true
}
/** What the caller may ask of adoptNpcCompany. Both fields are new and the default is v5.2.0: 21 or over, a mortgage left where it is (R4-L8). */
export interface AdoptOptions {
  /** The youngest age that may own the firm (21 without it). A value that is not a finite number is the default. */
  minAge?: number
  /** The firm's mortgage joins its own debt and the record leaves the asset (a relabelled liability, no flow). Refused when the mortgage is not under the asset's value. */
  carryMortgage?: boolean
}
/**
 * A family firm passes to a living adult relative (the designated sibling of a player who died) and
 * runs on as their company, instead of being turned into cash. Refuses when the person is dead,
 * under `opts.minAge` (21) or already holds any company record. Draws nothing from g.rng.
 *
 * With `carryMortgage` (a stamped life, R4-L8) the asset's mortgage becomes the firm's own debt: the balance joins `b.debt`, the firm
 * pays the higher of its rate and the mortgage's (never above 60%), the record is deleted from the asset, and the firm is revalued net
 * of it. It books no flow: the same liability changes its label. A mortgage that is not under the asset's value stays cash (false, and
 * nothing is touched); a record with no usable balance is dropped as junk.
 */
export function adoptNpcCompany(g: GameState, p: Person, a: Asset, b: BizState, opts?: AdoptOptions): boolean {
  const minAge = typeof opts?.minAge === 'number' && Number.isFinite(opts.minAge) ? opts.minAge : 21
  if (!p.alive || p.age < minAge || npcCompany(p, g.year) || (p.data.npcCompany ?? null) !== null) return false
  const carry = opts?.carryMortgage === true && a.mortgage !== undefined
  const balance = carry ? mortgageOwed(a) : 0
  if (carry && balance > 0 && !(balance < a.value && Number.isFinite(b.debt + balance))) return false
  const l = initializeNpc(g, p)
  b.npcOwnerId = p.id; b.ceo = 'manager'
  b.manager = { firstName: p.firstName, lastName: p.lastName, gender: p.gender, skill: l.skill, salary: 0, since: g.year }
  a.details = b as unknown as Record<string, Json>
  if (carry) {
    if (balance > 0) {
      const rate = a.mortgage ? Number(a.mortgage.rate) : Number.NaN
      b.debt = b.debt + balance
      b.debtRate = clampN(Number.isFinite(rate) ? Math.max(b.debtRate, rate) : b.debtRate, 0, 0.6)
      b.valuation = valuationOf(b)
    }
    delete a.mortgage
  }
  refreshValue(a, b); storeCompany(p, a)
  p.occupation = 'Business Owner'; l.employer = a.name
  saveNpcLife(p, l)
  return true
}
/** The mortgage balance on an asset as a usable sum: 0 for a record that has none (not a number, not finite, not above 0). */
function mortgageOwed(a: Asset): number {
  const balance = Number(a.mortgage?.balance)
  return Number.isFinite(balance) && balance > 0 ? balance : 0
}
function claim(g: GameState, id: string): Asset | undefined { return g.assets.find(a => a.kind === 'investment' && a.details.npcCompanyId === id) }
/** One affordable, forecast-positive expansion at a time; the same site planner as player CEOs. */
export function expandNpcCompany(g: GameState, b: BizState, l: NpcLife, firm?: string): number {
  if (l.skill < 65 || !b.last || b.last.net <= 0 || b.outlets.reduce((n,o) => n + o.count, 0) >= 12) return 0
  const move = bestOpening(g, b, Math.max(0, b.cash - b.debt - runningCosts(b)), { abroad: false, maxPayback: 3, maxN: 1 })
  if (!move || move.cost <= 0 || move.cost > b.cash) return 0
  firmCash(g, b, -move.cost, 'capex', firm, { tally: false }) // an NPC's firm keeps no tally: it has no books to close
  b.outlets = withOutlets(b, move.countryId, move.city, move.n, g.year).outlets
  const plan = bestPlan(g, b, { quick: true }); b.price = plan.price; b.production = plan.production
  return move.cost
}
export function npcBusinessYear(g: GameState, p: Person, l: NpcLife, officialAppointment = false): void {
  const company = npcCompany(p, g.year)
  if (!company) return
  const { a, b } = company, fiscal = g.year - 1
  if (b.founded > fiscal || (b.last?.year ?? -1) >= fiscal) return
  const stake = claim(g, a.id)
  const playerShare = stake ? clampN(num(stake.details.share), 0, 1) : 0
  if (b.manager) b.manager.skill = l.skill
  if (l.skill >= 65 && (npcHasMainCharacter(p) || g.year % 3 === 0)) { const plan = bestPlan(g, b, { quick: true, year: fiscal }); b.price = plan.price; b.production = plan.production }
  const employmentBefore = b.employees
  const externalJob = officialAppointment || managedEmployment(g, p)
  const result = simulateYear(g, b, fiscal, externalJob ? 0 : typicalIncome(g, l.country) * .5, 1)
  // Settlement, not the planner/menu, owns the durable market-share observation.
  refreshMarket(g, a, b, fiscal, result.stmt, result.market ?? null)
  personCash(g, p, result.stmt.ownerPay * .8, 'wage')
  if (!externalJob) l.income = result.stmt.ownerPay
  if (b.cash < 0) {
    // Limited liability. Sell the firm's remaining assets; equity can be entirely wiped out.
    const residual = Math.max(0, valuationOf(b) * .6)
    // The books name the firm; its cash stays as it is (the record is dropped below and `failure` reads b.cash).
    const firm = firmPurse(b, a.id).acct
    if (stake) { addMoney(g, residual * playerShare, { reason: 'firm.sale', with: firm }); g.assets = g.assets.filter(x => x.id !== stake.id) }
    personCash(g, p, residual * b.share, { reason: 'firm.sale', with: firm })
    delete p.data.npcCompany
    if (!externalJob) { p.occupation = 'Unemployed'; l.employer = '' }
    milestone(g, p, l, `${a.name} failed; the business was liquidated and shareholders recovered ${money(residual)}`)
    recordEconomicActivity(g, `npc:${a.id}:${fiscal}`, b.countryId, b.industry, { jobs: -employmentBefore, investment: 0,
      failure: Math.max(0, -b.cash - (result.bank?.bankLoss ?? 0)), ...result.bank })
    return
  }
  const payout = Math.min(Math.max(0, result.stmt.net) * .2, Math.max(0, b.cash - b.debt - typicalIncome(g, l.country)))
  // The firm pays the dividend to the shareholders' pool and each holder takes a part of it. Three one-sided calls, not a move: the
  // float arithmetic of the firm's cash and the owner's money stays as it was (a move would book what the cash really lost).
  firmCash(g, b, -payout, 'dividend', a.id, { tally: false })
  personCash(g, p, payout * b.share * .8, 'dividend')
  if (stake) earnIncome(g, payout * playerShare, 'dividend')
  evolve(g, b, result.stmt, fiscal); stampWave(g, b, fiscal); recordYear(b, result.stmt, { lean: true }); b.history = b.history.slice(-12)
  const expansion = g.year % 3 === 0 ? expandNpcCompany(g, b, l, a.id) : 0
  if (expansion) {
    const spent = money(expansion)
    // It comes round every third year for as long as the firm grows: the log says it every sixth year and a different way each time (the person's history keeps every plain line).
    // The phrasing is drawn every time, so the text stream is the same either way.
    const say = pickSite(
      g,
      [
        `${a.name} reinvested ${spent} in a new operating location`,
        `${a.name} opened another location, ${spent} of the profits put back in`,
        `${a.name} put ${spent} into a new branch`,
      ],
      0x6a3f1d85,
    )
    milestone(g, p, l, `${a.name} reinvested ${spent} in a new operating location`, g.year % 6 === 0 ? say : '')
  }
  b.valuation = valuationOf(b); refreshValue(a, b)
  if (stake) stake.value = Math.round(b.valuation * playerShare)
  recordEconomicActivity(g, `npc:${a.id}:${fiscal}`, b.countryId, b.industry, { jobs: b.employees - employmentBefore, investment: expansion, failure: 0, ...result.bank })
  storeCompany(p, a)
}

/** One pass per important contact. Distant work/school acquaintances keep the lightweight model. */
export function yearlyNpcLife(g: GameState, p: Person): boolean {
  if (!p.alive || (!IMPORTANT.includes(p.relation) && typeof p.data.kin !== 'string' && !p.data.npcCompany)) return false
  const l = initializeNpc(g, p)
  if (typeof p.data.countryId === 'string' && p.data.countryId !== l.country) {
    l.country = p.data.countryId; l.city = getCountry(l.country).cities[0]
  }
  if (l.lastYear >= g.year) return true
  l.lastYear = g.year
  const local = getCountry(l.country), e = economyOf(g, l.country), income = typicalIncome(g, l.country)
  const learning = educationAccess(e)
  const roll = seeded(`npc-decision|${g.lifeId.replace(/-g\d+$/, '')}|${personKey(p)}|${g.year}`)
  const gifted = npcHasMainCharacter(p)
  const managedJob = managedEmployment(g, p)
  let appointment = syncRoyalAppointment(g, p, l)
  if (p.age < 18) {
    if (!managedJob) { p.occupation = appointment?.title ?? npcOccupationLabel(p.age); l.income = 0 }
    l.skill = clampN(l.skill + (p.stats.smarts / 100) * 1.2 * learning, 0, 60)
  } else if (appointment) {
    if (studyForRoyalCareer(g, p, l)) {
      if (!/University Student/.test(p.occupation)) { l.study = 0; milestone(g, p, l, `began studying ${l.field} before taking on senior royal appointments`) }
      p.occupation = 'University Student (Royal Family)'; l.study += 1
      const tuition = local.freeUniversity ? 0 : income * .18
      const paid = Math.min(Math.max(0, p.money), tuition); personCash(g, p, -paid, 'tuition'); l.debt += tuition - paid
      if (l.study >= (l.education === 0 ? 4 : l.education === 1 ? 2 : 4)) {
        l.education = Math.min(3, l.education + 1); l.study = 0
        const degree = `${['', "Bachelor's", "Master's", 'Doctorate'][l.education]} in ${l.field}`
        l.achievements = [...l.achievements, degree].slice(-12)
        l.skill = clampN(l.skill + (4 + p.stats.smarts / 25) * learning, 0, 97)
        p.occupation = 'Royal Family Member'; p.data.npcRecruitmentYear = g.year
        milestone(g, p, l, `completed ${degree}; qualified for more senior appointments`)
      }
    } else if (appointment.id !== 'retired' && appointment.id !== 'abroad') {
      l.experience += 1
      l.skill = clampN(l.skill + (p.stats.smarts * .5 + l.ambition * .5 - l.skill) * .07 + .4, 0, 99)
    }
    appointment = syncRoyalAppointment(g, p, l)
  } else if (!managedJob && !npcCompany(p, g.year)) {
    const access = clampN(((g.year < 1930 ? .08 : g.year < 1960 ? .18 : .55) * local.wealth + l.ambition / 500 + p.stats.smarts / 600) * learning, .02, .9)
    if (p.age === 18 && roll.chance(access) && (local.freeUniversity || p.money >= income * .1 || roll.chance(p.stats.smarts / 200))) {
      p.occupation = 'University Student'; l.study = 0; milestone(g, p, l, `began studying ${l.field}`)
    }
    if (p.occupation === 'University Student') {
      l.study += 1
      const tuition = local.freeUniversity ? 0 : income * .18
      const pay = Math.min(p.money, tuition); personCash(g, p, -pay, 'tuition'); l.debt += tuition - pay
      if (l.study >= (l.education === 0 ? 4 : 2)) {
        l.education = Math.min(3, l.education + 1); l.study = 0
        const degree = `${['', "Bachelor's", "Master's", 'Doctorate'][l.education]} in ${l.field}`
        l.achievements = [...l.achievements, degree].slice(-12)
        l.skill = clampN(l.skill + (4 + p.stats.smarts / 25) * learning, 0, 97)
        p.occupation = 'Unemployed'; milestone(g, p, l, `completed ${degree}; now looking for relevant work`)
        p.data.npcRecruitmentYear = g.year
      }
    } else if (p.age >= 67) p.occupation = 'Retired'
    else {
      if (/Student$|^Child$|^None$|Baby|Toddler|Preschooler/.test(p.occupation)) p.occupation = 'Unemployed'
      if (p.occupation !== 'Unemployed' && roll.chance(e.unemployment * .15)) { l.employer = ''; p.occupation = 'Unemployed'; milestone(g, p, l, 'lost their job during a difficult hiring year') }
      if (p.occupation === 'Unemployed' && roll.chance(clampN(.45 + l.skill / 250 - e.unemployment * 2, .05, .85))) {
        const roles: Record<NpcField, string> = { Engineering: 'Engineer', Finance: 'Accountant', Mathematics: 'Research Analyst', Law: 'Legal Clerk', Marketing: 'Marketing Specialist', Medicine: l.education >= 2 ? 'Doctor' : 'Medical Technician', Business: 'Operations Manager', 'Computer Science': 'Software Developer' }
        p.occupation = eraOccupation(l.education ? roles[l.field] : 'Clerk', g.year)
        l.employer = `${local.demonym} ${l.field} Services`; milestone(g, p, l, `started work as ${p.occupation}`)
      }
      if (p.occupation !== 'Unemployed') {
        l.experience += 1; l.skill = clampN(l.skill + (p.stats.smarts * .5 + l.ambition * .5 - l.skill) * .07 + .4, 0, 99)
        if (l.experience % 6 === 0 && l.skill >= 55 && e.growth > -.01) milestone(g, p, l, 'earned a promotion and higher pay')
        if (l.education >= 1 && l.education < 3 && p.age < 40 && l.ambition > 70 && p.money > income && roll.chance(.08)) { p.occupation = 'University Student'; l.study = 0 }
      }
    }
    if (!gifted && p.age >= 24 && p.age <= 60 && l.ambition > 65 && roll.chance(.035) && p.money > income * 3) { saveNpcLife(p, l); startNpcCompany(g, p); const updated = npcLife(p); if (updated) { l.history = updated.history; l.employer = updated.employer } }
  }
  // The same first-use mastery as the protagonist, with childhood ceilings and actual study/work
  // still required. This grants ability, never cash, fabricated degrees or an underage company.
  const practicing = p.age >= 5 && (p.age < 18 || managedJob || !!appointment || !/Unemployed|Retired|^None$/.test(p.occupation) || !!npcCompany(p, g.year))
  if (gifted && practicing) {
    l.skill = Math.max(l.skill, ageCeiling(p.age, { from: 5, full: 18, floor: 35 }))
    if (p.age < 18 || /Student/.test(p.occupation)) p.stats.smarts = 100
    const job = rec(p.data.nepo)
    if (job && job.kind === 'real') {
      job.skill = l.skill
      const asset = g.assets.find(a => a.id === job.assetId)
      const manager = asset && rec(asset.details.manager)
      if (manager?.personId === p.id) manager.skill = l.skill
    }
    const groupJob = rec(p.data.groupJob)
    if (groupJob) {
      groupJob.skill = l.skill
      const group = liveGroup(g, String(groupJob.groupId))
      if (group?.core.manager?.personId === p.id) { group.core.manager.skill = l.skill; saveGroup(g, group) }
    }
    if (!l.achievements.includes('Main Character Syndrome: first-use mastery')) {
      l.achievements = [...l.achievements, 'Main Character Syndrome: first-use mastery'].slice(-24)
      milestone(g, p, l, `used Main Character Syndrome to master ${p.age < 18 ? 'schoolwork' : l.field}`)
    }
  }
  if (gifted && !managedJob && !appointment && p.age >= 21 && p.age <= 70 && l.ambition >= 65 && !/Student/.test(p.occupation) && !npcCompany(p, g.year)) {
    // Ambition drives frequency and willingness to challenge the family, not talent inheritance.
    const ventureRoll = seeded(`npc-venture|${g.lifeId.replace(/-g\d+$/, '')}|${personKey(p)}|${g.year}`)
    if (ventureRoll.chance((l.ambition - 55) / 100)) {
      saveNpcLife(p, l)
      const rivals = g.assets.filter(a => a.kind === 'business').map(a => ({ a, b: a.details as unknown as BizState }))
        .filter(({ b }) => b.share > 0 && (marketKey(b) === 'world' || b.countryId === l.country) && b.industry !== 'gameStudio' && !isDeepTechIndustry(b.industry) && isIndustryLegal(l.country, b.industry) && !industryEraBlock(b.industry, l.country, g.year)
          && p.money >= startupCost(b.industry, l.country, local.cities[0]).total * 1.5)
        .sort((x, y) => y.a.value - x.a.value || x.a.id.localeCompare(y.a.id))
      const target = l.ambition >= 80 ? rivals[0] : undefined
      if (startNpcCompany(g, p, target?.b.industry)) {
        if (target) {
          p.data.rivalOf = target.a.id
          const updated = npcLife(p)!
          milestone(g, p, updated, `launched a rival to ${target.a.name}; ambition ${Math.round(l.ambition)}/100`)
          saveNpcLife(p, updated)
        }
        const updated = npcLife(p)!
        l.history = updated.history; l.employer = updated.employer; l.skill = updated.skill
      }
    }
  }
  const owns = !!npcCompany(p, g.year)
  if (!managedJob && (!owns || appointment) && p.age >= 18) {
    l.income = appointment ? income * appointment.pay : p.occupation === 'Retired' ? income * .3 : /Student|Unemployed/.test(p.occupation) ? 0 : income * (.65 + l.skill / 100 + l.education * .18 + Math.min(.5, Math.floor(l.experience / 6) * .08)) * e.wages
    personCash(g, p, l.income * .8, 'wage')
  }
  npcBusinessYear(g, p, l, !!appointment)
  if (p.age >= 18 && !managedJob) {
    // These are real relative prices, not nominal priceScale/display inflation.
    // Owners pay housing upkeep; only independent non-owners face the rent index.
    const housingCost = l.housing > 0 ? .6 + e.sectors.housing.costs * .4 : e.rent
    const basket = clampN(p.livesWithPlayer
      ? e.sectors.essentials.costs * .65 + e.sectors.consumer.costs * .35
      : e.sectors.essentials.costs * .45 + e.sectors.consumer.costs * .25 + housingCost * .3, .65, 1.8)
    const expenses = income * (p.livesWithPlayer ? .25 : .65) * (1 + num(p.data.kids) * .08) * basket
    const due = expenses + l.debt * .06
    const paid = Math.min(Math.max(0, p.money), due); personCash(g, p, -paid, 'purchase'); l.debt += due - paid
    const repay = Math.min(l.debt, Math.max(0, p.money - income * .2) * .15); personCash(g, p, -repay, 'loan.repay'); l.debt -= repay
    l.investments = Math.max(0, l.investments * (1 + clampN(e.growth + roll.float(-.1,.13) + (gifted ? .08 * l.skill / 100 : 0), -.6,.25)))
    l.housing = Math.max(0, l.housing * (1 + clampN((e.housing - 1) * .06, -.15,.15)))
    if (p.money > income * 2 && l.debt < income) { const invest = (p.money - income * 2) * .1; personCash(g, p, -invest, 'trade.buy'); l.investments += invest }
    if (!p.livesWithPlayer && l.housing === 0 && p.money > income * 3 && l.debt < income && p.age >= 25) {
      const price = income * 6, deposit = price * .4
      personCash(g, p, -deposit, 'property.buy'); l.debt += price - deposit; l.housing = price; l.housingQuality = 60
      milestone(g, p, l, HOME_BOUGHT)
    }
    l.ambition = clampN(l.ambition + (l.income > income * 1.5 ? .3 : p.occupation === 'Unemployed' ? -.5 : 0), 5, 98)
    if (l.debt > income * 8 && l.investments + l.housing < l.debt && roll.chance(.12)) {
      l.debt = 0; l.investments = 0; l.housing = 0; personCash(g, p, -p.money, 'loan.repay') // the creditors take what is left
      milestone(g, p, l, 'went through personal bankruptcy; creditors took the remaining assets')
    }
    if (!appointment && !p.livesWithPlayer && !owns && p.age < 55 && l.ambition > 65 && l.income < income && p.money > income && roll.chance(.012)) {
      const passports = personCitizenships(g, p)
      const abroad = !exitRegime(l.country, g.year) && roll.chance(.25) ? COUNTRIES.filter(c => c.id !== l.country && (passports.includes(c.id) || blocAccess(passports, c.id, g.year).some(a => !a.limitedUntil))) : []
      const destination = abroad.length ? roll.pick(abroad) : local
      const cities = destination.cities.filter(c => destination.id !== l.country || c !== l.city)
      if (cities.length) {
        personCash(g, p, -(income * (destination.id === l.country ? .2 : .6)), 'purchase')
        l.employer = ''; p.data.relocated = g.year; p.data.citizenships = passports
        l.country = destination.id; l.city = roll.pick(cities); p.data.countryId = l.country
        p.occupation = 'Unemployed'; l.income = 0
        milestone(g, p, l, `moved to ${l.city}, ${destination.name}, to search for better work${destination.id === local.id ? '' : ' using existing citizenship/free-movement rights'}`)
      }
    }
  }
  if (p.data.married === true && !['parent','stepparent','spouse','partner','fiance'].includes(p.relation) && roll.chance(.005 + (p.traits.includes('jealous') ? .015 : 0))) { p.data.married = false; milestone(g, p, l, 'divorced; their household split') }
  saveNpcLife(p, l)
  return true
}

export function npcWorth(p: Person, year: number, g?: GameState): number {
  const l = npcLife(p), company = npcCompany(p, year)
  return Math.max(0, p.money + (l?.investments ?? 0) + (l?.housing ?? 0) - (l?.debt ?? 0) + (company ? company.b.valuation * company.b.share : 0) + (g ? familyGroupStake(g, p.id) : 0))
}
/** Existing relationship events remain authoritative; keep their outcomes in the durable profile. */
export function recordNpcFamilyHistory(g: GameState): void {
  for (const p of g.people) {
    const l = npcLife(p)
    if (!l || !p.alive) continue
    const current = { married: p.data.married === true || p.relation === 'spouse' || typeof p.data.spouseId === 'string', kids: num(p.data.kids), home: p.livesWithPlayer }
    const prev = rec(p.data.npcFamilyRecord)
    if (prev) {
      const changes: string[] = []
      if (current.married && !prev.married) changes.push(`married${p.data.spouseName ? ` ${p.data.spouseName}` : ''}`)
      if (current.kids > num(prev.kids)) changes.push(`welcomed a child; now has ${current.kids} children`)
      if (prev.home && !current.home) changes.push('moved out of the family home')
      if (changes.length) l.history = [...l.history, `${g.year}: ${changes.join('; ')}`].slice(-24)
    }
    p.data.npcFamilyRecord = current; saveNpcLife(p, l)
  }
}
/** Assets are sold once into the estate before the existing inheritance split runs. */
export function liquidateNpcEstate(g: GameState, p: Person): void {
  const l = npcLife(p), c = npcCompany(p, g.year)
  if (c) {
    const a = claim(g, c.a.id), share = a ? num(a.details.share) : 0
    const realized = Math.max(0, c.b.valuation * .85)
    const firm = firmPurse(c.b, c.a.id).acct
    personCash(g, p, realized * c.b.share, { reason: 'firm.sale', with: firm })
    if (a) { addMoney(g, realized * share, { reason: 'firm.sale', with: firm }); g.assets = g.assets.filter(x => x.id !== a.id) }
    delete p.data.npcCompany
  }
  if (l) { personCash(g, p, Math.max(0, p.money + l.investments + l.housing - l.debt) - p.money, 'estate', 0); l.investments = 0; l.housing = 0; l.debt = 0; saveNpcLife(p, l) }
}
export function investInNpc(g: GameState, personId: string, amount: number, acquire = false): boolean {
  const p = g.people.find(x => x.id === personId), company = p && npcCompany(p, g.year)
  if (!p || !p.alive || !company || !g.character.alive || g.character.prison || g.character.age < 18 || !Number.isFinite(amount) || amount <= 0 || p.relationship < 35) return false
  amount = Math.round(amount)
  if (amount < 1) return false
  const { a, b } = company, holding = claim(g, a.id), current = holding ? num(holding.details.share) : 0
  const valuation = Math.max(1, b.valuation)
  const price = acquire ? Math.round(valuation * b.share * (p.traits.includes('loyal') ? 1.05 : 1.15)) : amount
  if (acquire && b.share + current < .9999) return false // external co-owners must also consent
  if (g.character.money < price || (acquire && p.traits.includes('ambitious') && b.last && b.last.net > 0 && p.relationship < 80)) return false
  if (!acquire && amount > valuation * .25) return false
  if (!useYearAction(g, `npc-invest.${a.id}`, 1)) return false
  if (acquire) {
    moveCash(g, playerPurse(g), personPurse(p), price, 'firm.sale')
    delete b.npcOwnerId
    if (holding) g.assets = g.assets.filter(x => x.id !== holding.id)
    b.share = 1; b.invested = price + (holding?.purchasePrice ?? 0); b.acquired = true
    // Buying the firm is not consent to hire its founder; use the existing interim CEO path.
    installManager(g, b)
    a.details = b as unknown as Record<string, Json>; refreshValue(a, b); g.assets.push(a)
    delete p.data.npcCompany
    if (!holdsFamilyJob(p) && !readGroupJob(p) && !holdsInfluenceJob(g, p)) { p.occupation = 'Unemployed'; const life = npcLife(p); if (life) { life.employer = ''; life.income = 0; saveNpcLife(p, life) } }
    notice(g, 'Company Acquired', `${a.name} is now in your Businesses list. ${p.firstName} received ${money(price)} for their stake and an interim CEO took over. You can separately recruit the founder or add the company to a conglomerate.`)
  } else {
    const share = (current * valuation + amount) / (valuation + amount)
    moveCash(g, playerPurse(g), firmPurse(b, a.id, { tally: false }), amount, 'inject')
    b.valuation += amount; b.share *= valuation / (valuation + amount)
    const asset: Asset = holding ?? { id: `npc-stake:${a.id}`, kind: 'investment', name: `${a.name} private stake`, emoji: '🤝', purchasePrice: 0, value: 0, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
    asset.purchasePrice += amount; asset.value = b.valuation * share
    asset.details = { npcCompanyId: a.id, npcPersonId: p.id, share, type: 'npcEquity' }
    if (!holding) g.assets.push(asset)
    storeCompany(p, a)
    notice(g, 'Business Partnership', `${money(amount)} entered ${a.name}, not ${p.firstName}'s wallet. You own ${pct(share, 2)}; profits may fund dividends, and losses can wipe out this investment.`)
  }
  return true
}

/** One number of an NPC as the player reads it: the text that goes in the row, the middle of the estimate and the chip it earns. */
interface Seen { text: string; mid: number | null; conf?: 0 | 1 | 2 | 3; asOf?: number }

/** The chip of a row that shows several reads: the weakest confidence and the oldest reading. Nothing when no read was an estimate. */
function chipOf(reads: readonly Seen[]): { conf?: 0 | 1 | 2 | 3; asOf?: number } {
  const confs = reads.flatMap((r) => (r.conf === undefined ? [] : [r.conf]))
  if (confs.length === 0) return {}
  const years = reads.flatMap((r) => (r.asOf === undefined ? [] : [r.asOf]))
  return { conf: Math.min(...confs) as 0 | 1 | 2 | 3, ...(years.length > 0 ? { asOf: Math.min(...years) } : {}) }
}

export function npcLifeNodes(g: GameState, p: Person): MenuNode[] {
  const l = npcLife(p)
  if (p.relation === 'pet') return []
  if (!l) return npcHasMainCharacter(p) ? [{ type: 'info', id: `npc.talent.${p.id}`, emoji: '🌟', text: 'Main Character Syndrome - inherited from family. Every talent; masters skills through first use as they grow up.' }] : []
  const close = isClose(p)
  const company = npcCompany(p, g.year)
  // With the profile (R4-U5) skill, ambition and net worth read as the estimate the player earns, and the row carries its chip; in Exact
  // and with the flag off they are today's figures. A key the contract refuses reads as not clear yet and never as the number.
  const fog = peopleFog()
  const seen = (field: string, truth: number, today: string): Seen => {
    if (!fog) return { text: today, mid: truth }
    const e = readPerson(g, p, field, truth)
    return e ? { text: e.words, mid: e.mid, conf: e.conf, ...(e.asOf !== undefined ? { asOf: e.asOf } : {}) } : { text: 'not clear yet', mid: null, conf: 0 }
  }
  const skill = close ? seen('skill', l.skill, `${Math.round(l.skill)}/100`) : null
  const worth = close ? npcWorth(p, g.year, g) : 0
  const wealth = close ? seen('worth', worth, `about ${money(worth)}`) : null
  const ambition = close ? seen('ambition', l.ambition, `${Math.round(l.ambition)}/100`) : null
  const nodes: MenuNode[] = [{ type: 'info', id: `npc.life.${p.id}`, emoji: '📖', ...chipOf([skill, wealth, ambition].flatMap((r) => (r === null ? [] : [r]))), text: `Life & Career - ${p.occupation}${l.employer ? ` at ${l.employer}` : ''}. Lives in ${l.city || getCountry(l.country).cities[0]}, ${getCountry(l.country).name}. ${l.achievements.join('; ') || (l.study > 0 ? `Studying ${l.field}` : 'No known higher qualification')}. ${close ? `Experience ${l.experience} years · professional skill ${skill!.text} · net worth incl. property & companies ${wealth!.text}. Ambition ${ambition!.text}.` : 'Private finances are not known to you.'}\n${close ? l.history.slice(-6).join('\n') : ''}` }]
  // The sentence after the ambition follows what the player believes (the estimate's middle), so it never gives the figure away.
  const drive = (m: number | null): string => (m === null ? '' : `: ${m >= 80 ? 'may build a competing family business' : m >= 65 ? 'wants an independent business' : 'prefers a career or a quieter life'}`)
  if (npcHasMainCharacter(p)) nodes.push({ type: 'info', id: `npc.talent.${p.id}`, emoji: '🌟', ...(ambition ? chipOf([ambition]) : {}), text: `Main Character Syndrome - every talent; masters skills through first use.${ambition ? ` Ambition ${ambition.text}${drive(ambition.mid)}.${typeof p.data.rivalOf === 'string' && company ? ` ${company.a.name} competes in your industry.` : ''}` : ''}` })
  if (!company || !p.alive || !close) return nodes
  const { a, b } = company
  nodes.push({ type: 'info', id: `npc.company.${p.id}`, emoji: '🏢', text: `${a.name}: revenue ${money(b.last?.revenue ?? 0)}, costs ${money((b.last?.netRevenue ?? 0) - (b.last?.pbt ?? 0))}, net ${money(b.last?.net ?? 0)}, cash ${money(b.cash)}, debt ${money(b.debt)}, valuation ${money(b.valuation)}. Ownership: ${p.firstName} ${pct(b.share, 1)}.` })
  const block = () => g.character.age < 18 || g.character.prison ? 'Adult business decisions only, outside prison.' : p.relationship < 35 ? 'Build trust first.' : null
  nodes.push({ type: 'action', id: `npc.invest.${p.id}`, label: 'Invest / Become a Business Partner', emoji: '🤝', disabledReason: block,
    input: { kind: 'slider', label: 'Subscribe to new shares', money: true, min: 1, max: Math.max(1, Math.floor(Math.min(g.character.money, b.valuation * .25))), preview: (_gg, v) => `${money(v)} into company cash, not personal income. About ${pct(v / (b.valuation + v), 2)} newly issued equity.`, defaultValue: () => String(Math.max(1, Math.floor(Math.min(g.character.money, b.valuation * .05)))) }, run: (gg, input) => { if (!investInNpc(gg, p.id, Number(input))) notice(gg, 'Offer Declined', 'The business, trust, annual offer limit or available funds no longer meets these terms.') } })
  const cost = b.valuation * (1 - num(claim(g, a.id)?.details.share)) * (p.traits.includes('loyal') ? 1.05 : 1.15)
  nodes.push({ type: 'action', id: `npc.acquire.${p.id}`, label: 'Propose an Acquisition', emoji: '🏢', subtitle: `Indicative price ${money(cost)}; ambitious profitable founders may refuse`, disabledReason: block, confirm: () => `Offer ${money(cost)} from personal funds for all remaining shares?`, run: gg => { if (!investInNpc(gg, p.id, 1, true)) notice(gg, 'Acquisition Declined', 'The founder declined, you have already negotiated this year, or available funds do not meet the current asking price.') } })
  return nodes
}
