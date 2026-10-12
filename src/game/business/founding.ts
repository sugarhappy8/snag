// Starting a company (industry → name → city → funding → registration) and buying one that is
// for sale. Everything is priced in the player's local market: capital, fees, permits,
// registration days, loan rates, and in some countries an official's "facilitation fee".
import { hasTech } from '../history/timeline'
import { seeded, yearKey } from '../assets'
import { addHidden, addStat, count, formatMoney, fullName, log, notice, remember, scriptChoice, scriptInput, spend } from '../core'
import { arrestPlayer } from '../crime'
import { INDUSTRY_IDS, industryDemand, isIndustryLegal, localMarket, marketOf, type Industry } from '../data/markets'
import { addLoan, baseLoanRate, creditScore, offeredRate } from '../finance'
import { chance, rand, randInt, uid } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { hasTalent, talentHint } from '../talents'
import { outcomeTag } from '../timeMachine'
import { becomeCeo, installManager, managerCandidate } from './career'
import { industryHint, localEcon, openFractionFor, planFor, maxProduction, simulateYear, startupCost, valuationOf, refreshValue, niceAmount } from './economy'
import { industryEraBlock, marketDef } from './competition-data'
import { eraNote } from './era'
import { refreshTechValue } from './deeptech-core'
import { DEEP_TECH } from './deeptech-data'
import { COFOUNDER_EQUITY, DEEP_TECH_OWN_SHARE, backgroundNote, cofounderName, deepHubHint, expertHire, expertSalary, hasBackground, initTech, seedOffer } from './deeptech-found'
import { isDeepTechIndustry, type DeepTechIndustry } from './deeptech-state'
import { financeEraBlock, isFinanceFirm } from './finance-firm'
import { bankAdvice, bankCapitalPreview, isBank } from './bank'
import { startOutlook, type StartOutlook } from './bank-model'
import { openBank } from './bank-state'
import { fundTypeBlock, initFund } from './fund'
import { TYPE_INFO } from './fund-model'
import { FUND_TYPES, readFund, type FundType } from './fund-state'
import { foundingNote } from './fund-text'
import { investorFirm } from './flavor'
import { foundBlock } from './gate'
import { industryDef, isIndustry, INDUSTRIES } from './industries'
import { BIZ_VERSION, ceoJob, type BizState } from './state'
import { aIndustry, aYearsOld, clampN, cleanName, industryNoun, money, num, pct, rec, runwayText, stars, str, toJson } from './util'

// ---------------------------------------------------------------------------
// Requirements

/** Why the player can't run this industry here (not counting money), or null. */
export function industryProblem(g: GameState, industry: Industry): string | null {
  const c = g.character
  const country = getCountry(c.countryId)
  const def = industryDef(industry)
  const financialEra = financeEraBlock(g, industry)
  if (financialEra) return financialEra
  if (!isIndustryLegal(c.countryId, industry)) return `Not allowed in ${country.name}. ${eraNote(g, c.countryId, marketOf(c.countryId).businessNote)}`.trim()
  const era = industryEraBlock(industry, c.countryId, g.year)
  if (era) return era
  if (def.needs === 'drinking' && c.age < country.drinkingAge) return `You must be ${country.drinkingAge} to hold a liquor license in ${country.name}.`
  if (def.needs === 'driver' && !c.licenses.includes('driver')) return `You need a driver's license to run ${aIndustry(def.label)}.`
  return null
}

/**
 * Personal money needed with the cheapest funding route: investors cover 90% of the capital for
 * classic businesses; deep-tech founders put in a quarter of the first lab (a bank may lend the
 * rest) because their investors fund the R&D, not the founder's equipment.
 */
export function minimumOutlay(industry: Industry, countryId: string, city: string): number {
  const cost = startupCost(industry, countryId, city)
  return Math.round(cost.fee + cost.permits + cost.capital * ownShare(industry, countryId))
}

/** Share of the first site the founder must pay (deep tech: what a bank won't lend). */
function ownShare(industry: Industry, countryId: string): number {
  if (!isDeepTechIndustry(industry)) return 0.1
  return marketOf(countryId).easeOfBusiness >= 60 ? DEEP_TECH_OWN_SHARE : 0.4
}

function outlayText(industry: Industry, countryId: string, need: number): string {
  return isDeepTechIndustry(industry)
    ? `You need at least ${formatMoney(need)} of your own (${pct(ownShare(industry, countryId))} of the first ${industryDef(industry).site} plus fees; a bank may lend the rest) before investors will take a meeting.`
    : `You need at least ${formatMoney(need)} of your own (10% of the startup cost plus fees) before investors will even take a meeting.`
}

export function demandStars(countryId: string, industry: Industry): number {
  const d = industryDemand(countryId, industry)
  return d >= 1.8 ? 5 : d >= 1.3 ? 4 : d >= 0.9 ? 3 : d >= 0.6 ? 2 : 1
}

function defaultName(g: GameState, industry: Industry): string {
  const def = industryDef(industry)
  const words = localMarket(g).nameWords
  const s = seeded(yearKey(g, `biz.name.${industry}`))
  const first = words.length && s.chance(0.7) ? s.pick(words) : g.character.lastName
  return cleanName(`${first} ${s.pick(def.suffixes)}`, `${g.character.lastName} ${def.label}`)
}

function bankName(countryId: string, roll: number): string {
  const words = marketOf(countryId).nameWords
  const w = words.length ? words[Math.floor(clampN(roll, 0, 0.9999) * words.length)] : getCountry(countryId).demonym
  return `${w} ${roll < 0.5 ? 'Bank' : 'Commercial Bank'}`
}

// ---------------------------------------------------------------------------
// The founding flow

type Funding = 'savings' | 'loan' | 'investors'

interface Plan {
  capital?: number
  investmentModel?: FundType
  mode: 'found' | 'buy'
  industry: Industry
  name: string
  city: string
  countryId: string
  funding: Funding
  loan: number
  rate: number
  lender: string
  investor: number
  equity: number
  investorName: string
  extraFees: number
  days: number
  listingId: string
  noLoan: boolean
  /** Deep tech: technical co-founder's name ('' for none). */
  cofounder: string
  /** Deep tech: hire an expert instead of a co-founder. */
  expert: boolean
  /** Deep tech: seed round taken (0 for none). */
  seed: number
  seedEquity: number
  seedInvestor: string
}

function readPlan(data: Json | undefined): Plan | null {
  const d = rec(data)
  if (!d || !isIndustry(d.industry)) return null
  const f = str(d.funding)
  return {
    capital: clampN(num(d.capital), 0, 1e15),
    investmentModel: fundTypeOf(d.investmentModel),
    mode: d.mode === 'buy' ? 'buy' : 'found',
    industry: d.industry as Industry,
    name: str(d.name),
    city: str(d.city),
    countryId: str(d.countryId),
    funding: f === 'loan' || f === 'investors' ? f : 'savings',
    loan: Math.max(0, num(d.loan)),
    rate: Math.max(0, num(d.rate)),
    lender: str(d.lender, 'the bank'),
    investor: Math.max(0, num(d.investor)),
    equity: clampN(num(d.equity), 0, 0.9),
    investorName: str(d.investorName, 'investors'),
    extraFees: Math.max(0, num(d.extraFees)),
    days: Math.max(1, num(d.days, 7)),
    listingId: str(d.listingId),
    noLoan: d.noLoan === true,
    cofounder: str(d.cofounder),
    expert: d.expert === true,
    seed: Math.max(0, num(d.seed)),
    seedEquity: clampN(num(d.seedEquity), 0, 0.5),
    seedInvestor: str(d.seedInvestor),
  }
}

/** Investment-firm type from a plan (old in-flight popups used retail / private / brokerage). */
function fundTypeOf(v: Json | undefined): FundType {
  if (v === 'retail') return 'asset'
  if (v === 'private') return 'hedge'
  if (v === 'brokerage') return 'broker'
  return typeof v === 'string' && (FUND_TYPES as readonly string[]).includes(v) ? v as FundType : 'asset'
}

function planJson(p: Plan): Json {
  return toJson(p)
}

const NAME = defineScript('business.found.name', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || foundBlock(g)) return
  p.name = cleanName(choice, defaultName(g, p.industry))
  if (p.industry === 'investmentFirm') scriptChoice(g, MODEL, 'What Kind of Firm?', 'Clients’ money is never the firm’s cash: you earn fees, commissions or a share of the profits.',
    [...FUND_TYPES.filter(t => !fundTypeBlock(t, g.year)).map(t => ({ id: t, label: `${TYPE_INFO[t].label}: ${TYPE_INFO[t].blurb}`, emoji: TYPE_INFO[t].emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' }],
    { emoji: '📈', data: planJson(p) })
  else askCity(g, p)
})

function askCity(g: GameState, p: Plan): void {
  const country = getCountry(p.countryId)
  const cities = country.cities.slice(0, 10)
  const choices: ChoiceOption[] = cities.map((city, i) => ({
    id: `city${i}`,
    label: `${city} · ${money(startupCost(p.industry, p.countryId, city).total)}${i === 0 ? ' (big city: pricier, busier)' : ''}`,
    emoji: '\u{1F3D9}\u{FE0F}',
  }))
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' })
  const why = p.industry === 'gameStudio' ? 'Big cities charge more rent but have more developers to hire.' : isDeepTechIndustry(p.industry) ? 'Big cities charge more rent but have more engineers, scientists and investors.' : 'Big cities charge more rent but bring more customers.'
  scriptChoice(g, CITY, `Where Will ${p.name} Be?`, `Pick a city in ${country.name} for your first ${industryDef(p.industry).site}. ${why}`, choices, {
    emoji: '\u{1F4CD}',
    data: planJson(p),
  })
}

const CITY = defineScript('business.found.city', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || choice === 'cancel' || foundBlock(g)) return
  const city = getCountry(p.countryId).cities[Number(choice.replace('city', ''))]
  if (!city) return
  p.city = city
  if (isDeepTechIndustry(p.industry) && !hasBackground(g, p.industry)) askBackground(g, p)
  else askCapital(g, p)
})

/** A new bank's expected first years with `cash` of starting capital beyond the fit-out (pure). */
function bankStart(g: GameState, industry: Industry, countryId: string, city: string, cash: number): StartOutlook {
  return startOutlook(g, newBiz(g, industry, countryId, city, { cash: Math.max(0, cash), ownerSalary: 0 }))
}
const adviceCache = new Map<string, number | null>()
/**
 * Starting cash (beyond the fit-out) to advise for a bank founded here now, or null when no amount
 * makes one viable (bank.ts bankAdvice). Pure; cached per life, year, place and the founder's skill.
 */
export function bankAdvisedCash(g: GameState, industry: Industry, countryId: string, city: string): number | null {
  const c = g.character
  const key = `${g.lifeId}|${outcomeTag(g, g.year)}|${g.year}|${industry}|${countryId}|${city}|${c.stats.smarts}|${c.hidden.discipline}|${hasTalent(g, 'Business')}|${hasTalent(g, 'Investing')}`
  if (adviceCache.has(key)) return adviceCache.get(key) ?? null
  const v = bankAdvice(countryId, g.year, (cash) => bankStart(g, industry, countryId, city, cash))
  adviceCache.set(key, v)
  if (adviceCache.size > 64) adviceCache.delete(adviceCache.keys().next().value as string)
  return v
}

export function startupCapitalPreview(g: GameState, data: Json | undefined, amount: number): string {
  const p = readPlan(data)
  if (!p) return ''
  const cost = startupCost(p.industry, p.countryId, p.city), e = localEcon(p.industry, p.countryId, p.city)
  const cash = Math.max(0, amount - cost.capital * .8)
  if (isBank({ industry: p.industry })) return `Fit-out ${money(cost.capital * .8)}; fees ${money(cost.fee + cost.permits)}. ${bankCapitalPreview(cash, bankStart(g, p.industry, p.countryId, p.city, cash), bankAdvisedCash(g, p.industry, p.countryId, p.city))} ${whoPays(g, p, amount)}`
  const burn = e.rent + industryDef(p.industry).staff * e.wage
  return `Equipment/fit-out ${money(cost.capital * .8)}; fees ${money(cost.fee + cost.permits)}. Starting cash ${money(cash)}; roughly ${runwayText(cash / Math.max(1, burn))} of base wages/rent before sales and other costs. ${cash < burn ? 'High funding risk.' : 'A cash buffer, not guaranteed profit.'} ${whoPays(g, p, amount)}`
}

/** How much of `capital` (plus fees) is the player's own money, and who could cover the rest. */
function whoPays(g: GameState, p: Plan, capital: number): string {
  const cost = startupCost(p.industry, p.countryId, p.city)
  const fees = cost.fee + cost.permits
  const own = g.character.money
  if (own >= capital + fees) return `You can pay all ${money(capital + fees)} from your own ${money(own)}, or borrow or raise some of it next.`
  const routes: string[] = []
  const loan = loanTerms(g, p, capital)
  if (own >= capital - loan.amount + fees) routes.push(`borrow ${money(loan.amount)} from a bank (you put in ${money(capital - loan.amount + fees)}, if they approve)`)
  if (!isDeepTechIndustry(p.industry)) {
    const deal = investorDeals(g, p, capital)[0]
    if (own >= capital - deal.amount + fees) routes.push(`take ${money(deal.amount)} from investors for ${pct(deal.equity)} of the company (you put in ${money(capital - deal.amount + fees)})`)
  }
  if (!routes.length) return `That's more than your ${money(own)}, and more than a bank or investors would cover on top of it.`
  return `That's more than your ${money(own)}. To cover the rest: ${routes.join(', or ')}.`
}

function askCapital(g: GameState, p: Plan): void {
  const c = startupCost(p.industry, p.countryId, p.city)
  const max = Math.max(c.capital, Math.min(1e15, (g.character.money - c.fee - c.permits) / ownShare(p.industry, p.countryId)))
  // A bank starts at the advised capital (as far as the founder can go); where no amount is viable, at the minimum.
  const advised = isBank({ industry: p.industry }) ? bankAdvisedCash(g, p.industry, p.countryId, p.city) : null
  const start = advised === null ? c.capital : Math.round(Math.max(c.capital, Math.min(c.capital * .8 + advised, max)))
  const yours = Math.max(0, g.character.money - c.fee - c.permits)
  const others = isDeepTechIndustry(p.industry) ? 'a bank loan' : 'a bank loan or investors'
  scriptInput(g, { title: 'Choose Starting Capital', emoji: '💵', text: `At least ${money(c.capital)} to open, plus ${money(c.fee + c.permits)} in fees; anything above that stays in the company as cash. Your own money covers up to ${money(yours)}. More than that needs ${others}: you pick how to pay next, or back out.`, input: 'slider', money: true,
    min: c.capital, max, defaultValue: String(start), scriptId: CAPITAL, data: planJson(p) })
}
const CAPITAL = defineScript('business.found.capital', (g, input, data) => {
  const p = readPlan(data), n = Number(input)
  if (!p || foundBlock(g) || !Number.isFinite(n)) return
  const c = startupCost(p.industry, p.countryId, p.city)
  if (n < c.capital || n > Math.max(c.capital, (g.character.money - c.fee - c.permits) / ownShare(p.industry, p.countryId))) return
  p.capital = Math.round(n)
  askFunding(g, p)
})

const MODEL = defineScript('business.found.investmentModel', (g, input, data) => {
  const p = readPlan(data)
  if (!p || ![...FUND_TYPES, 'retail', 'private', 'brokerage'].includes(input) || foundBlock(g)) return
  const type = fundTypeOf(input)
  if (fundTypeBlock(type, g.year)) return notice(g, 'Not Yet', fundTypeBlock(type, g.year)!, { emoji: '📈' })
  p.investmentModel = type
  askCity(g, p)
})

// Deep tech: a founder without the background brings in a technical co-founder or an expert.
function askBackground(g: GameState, p: Plan): void {
  const ind = p.industry as DeepTechIndustry
  const d = DEEP_TECH[ind]
  const salary = expertSalary(ind, p.countryId)
  const co = cofounderName(g, p.countryId)
  const choices: ChoiceOption[] = [
    { id: 'cofounder', label: `Bring in ${co} as technical co-founder (${pct(COFOUNDER_EQUITY)} of the company)`, emoji: '\u{1F91D}' },
    { id: 'expert', label: `Hire a ${d.expert} (${money(salary)} a year)`, emoji: '\u{1F9D1}\u{200D}\u{1F52C}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  const hint = talentHint(g, 'Business', 'Take the co-founder: equity is cheaper than a big salary when cash is this tight, and investors like technical founders.')
  if (hint) choices[0] = { ...choices[0], hint }
  scriptChoice(
    g,
    BACKGROUND,
    'You Need a Scientist',
    `Investors only back ${aIndustry(industryDef(ind).label)} with a technical founder: ${d.req.text}. You don't have that, so you need someone who does.`,
    choices,
    { emoji: '\u{1F52C}', data: { ...(planJson(p) as Record<string, Json>), cofounderName: co } },
  )
}

const BACKGROUND = defineScript('business.found.background', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || choice === 'cancel' || foundBlock(g)) return
  if (choice === 'cofounder') p.cofounder = str(rec(data)?.cofounderName, cofounderName(g, p.countryId))
  else p.expert = true
  askCapital(g, p)
})

// Deep tech: the seed round (money for the R&D account, not for the founder's lab).
function askSeed(g: GameState, p: Plan): void {
  const ind = p.industry as DeepTechIndustry
  const offer = seedOffer(g, ind, p.countryId, investorFirm(p.countryId, rand(g), rand(g)), hasBackground(g, ind) || !!p.cofounder)
  // Investors are paid back first in a sale, so the seed costs you equity only if the company
  // takes off, and if it fails it's their money that's gone. Bootstrapping pays only when the
  // seed is pocket change next to your savings.
  const rich = g.character.money >= offer.amount * 20
  const hint = talentHint(g, 'Business', rich ? 'Bootstrap: the seed is pocket change next to your savings, and keeping 100% pays off big if this works.' : 'Take the seed: deep tech eats cash, and if the lab fails it is the investors’ money that’s gone, not yours.')
  const choices: ChoiceOption[] = [
    { id: 'seed', label: `Seed round: ${money(offer.amount)} for ${pct(offer.equity)} of the company`, emoji: '\u{1F331}' },
    { id: 'bootstrap', label: 'Bootstrap: keep 100% and fund R&D yourself', emoji: '\u{1F4AA}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  const withHint = choices.map((c) => (hint && c.id === (rich ? 'bootstrap' : 'seed') ? { ...c, hint } : c))
  scriptChoice(
    g,
    SEED,
    'Seed Round',
    `${offer.investor} likes the idea. They'll put ${formatMoney(offer.amount)} into ${p.name}'s R&D account for ${pct(offer.equity)} of the company. Investor money pays for research, compute and payroll; it can never be paid out to you, and if you ever sell, they get it back before you see a cent. Or you can go it alone and pay for R&D from your own pocket.`,
    withHint,
    { emoji: '\u{1F331}', data: { ...(planJson(p) as Record<string, Json>), offerAmount: offer.amount, offerEquity: offer.equity, offerInvestor: offer.investor } },
  )
}

const SEED = defineScript('business.found.seed', (g, choice, data) => {
  const p = readPlan(data)
  const d = rec(data)
  if (!p || !d || choice === 'cancel' || foundBlock(g)) return
  if (choice === 'seed') {
    p.seed = Math.max(0, num(d.offerAmount))
    p.seedEquity = clampN(num(d.offerEquity), 0.05, 0.5)
    p.seedInvestor = str(d.offerInvestor, 'investors')
  }
  maybeAskBribe(g, p)
})

function loanTerms(g: GameState, p: Plan, capital: number): { amount: number; rate: number } {
  const m = marketOf(p.countryId)
  const ltv = m.easeOfBusiness >= 60 ? 0.75 : 0.6
  return { amount: Math.round(capital * ltv), rate: offeredRate(g, 'business') }
}

function investorTerms(g: GameState, p: Plan, capital: number): { amount: number; equity: number } {
  const def = industryDef(p.industry)
  const amount = Math.round(capital * 0.9)
  const smarts = g.character.stats.smarts
  const track = Math.min(0.1, num(g.counters.businessesSold) * 0.04)
  const equity = clampN(0.2 + 0.9 * 0.45 * (1.3 - def.growth * 0.5) - (smarts - 50) / 400 - track, 0.15, 0.75)
  return { amount, equity: Math.round(equity * 100) / 100 }
}

interface InvestorDeal {
  id: string
  amount: number
  equity: number
}

/**
 * Three investor offers at one honest price: the valuation the biggest offer implies before their
 * money (pre-money) holds for every offer, so more money simply costs more of the company.
 */
function investorDeals(g: GameState, p: Plan, capital: number): InvestorDeal[] {
  const big = investorTerms(g, p, capital)
  const pre = investorPreMoney(big)
  const offers: [string, number][] = [['investors', 1], ['investors.mid', 2 / 3], ['investors.small', 1 / 3]]
  return offers.map(([id, f]) => {
    const amount = Math.round(big.amount * f)
    return { id, amount, equity: f === 1 ? big.equity : Math.round((amount / (pre + amount)) * 100) / 100 }
  })
}

function investorPreMoney(big: { amount: number; equity: number }): number {
  return (big.amount * (1 - big.equity)) / Math.max(0.01, big.equity)
}

function askFunding(g: GameState, p: Plan): void {
  const cost = startupCost(p.industry, p.countryId, p.city)
  cost.capital = Math.max(cost.capital, p.capital ?? 0)
  const fees = cost.fee + cost.permits
  const m = marketOf(p.countryId)
  const loan = loanTerms(g, p, cost.capital)
  const money0 = g.character.money
  const deep = isDeepTechIndustry(p.industry)
  const choices: ChoiceOption[] = []
  if (money0 >= cost.capital + fees) choices.push({ id: 'savings', label: `Pay it all myself (${money(cost.capital + fees)})`, emoji: '\u{1F4B0}' })
  if (!p.noLoan && money0 >= cost.capital - loan.amount + fees)
    choices.push({ id: 'loan', label: `Bank loan: ${money(loan.amount)} at ${pct(loan.rate, 1)} (you put in ${money(cost.capital - loan.amount + fees)})`, emoji: '\u{1F3E6}' })
  // Deep-tech investors fund the R&D (the seed round comes next), not the founder's lab.
  const deals = deep ? [] : investorDeals(g, p, cost.capital).filter((d) => money0 >= cost.capital - d.amount + fees)
  for (const d of deals) choices.push({ id: d.id, label: `Investors: ${money(d.amount)} for ${pct(d.equity)} of the company (you put in ${money(cost.capital - d.amount + fees)})`, emoji: '\u{1F4BC}' })
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' })
  const permits = cost.permits > 0 ? ` plus ${formatMoney(cost.permits)} in licences and permits` : ''
  const days = cost.days > 30 ? ` Registration takes about ${cost.days} days, so you'll lose part of your first year.` : ` Registration takes about ${cost.days} ${cost.days === 1 ? 'day' : 'days'}.`
  const what = p.industry === 'gameStudio' ? 'workstations, dev kits, software licences and the office' : deep ? `your first ${industryDef(p.industry).site} (equipment and a small team's workspace; the R&D money comes from investors next)` : 'the fit-out, equipment and opening stock'
  const equipment = startupCost(p.industry, p.countryId, p.city).capital * .8
  const terms = deals.length ? ` Investors value ${p.name} at about ${money(investorPreMoney(investorTerms(g, p, cost.capital)))} before their money, the same for every offer: more money costs more of the company. If you sell or close it, they get their money back first.` : ''
  const text = `Opening ${p.name} in ${p.city}: ${formatMoney(equipment)} for ${what}, ${formatMoney(Math.max(0, cost.capital - equipment))} starting working cash, and a ${formatMoney(cost.fee)} registration fee${permits}.${days} ${choices.length === 1 ? `You can't cover even a small share of that right now.` : 'How will you pay for it?'}${terms}`
  scriptChoice(g, FUND, 'Funding', text + (m.interestRate >= 0.15 ? ` (Interest rates here are brutal: the central bank sits at ${pct(m.interestRate)}.)` : ''), choices, {
    emoji: '\u{1F4B5}',
    data: planJson({ ...p, days: cost.days }),
  })
}

const FUND = defineScript('business.found.funding', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || choice === 'cancel' || foundBlock(g)) return
  const cost = startupCost(p.industry, p.countryId, p.city)
  cost.capital = Math.max(cost.capital, p.capital ?? 0)
  const deal = choice.startsWith('investors') ? investorDeals(g, p, cost.capital).find((d) => d.id === choice) : undefined
  p.funding = choice === 'loan' ? 'loan' : deal ? 'investors' : 'savings'
  if (p.funding === 'loan') {
    const m = marketOf(p.countryId)
    const score = creditScore(g)
    const approve = clampN((score - 540) / 220 + (m.easeOfBusiness - 60) / 150 + (g.character.stats.smarts - 50) / 500, 0.05, 0.95)
    const terms = loanTerms(g, p, cost.capital)
    p.lender = bankName(p.countryId, rand(g))
    if (!chance(g, approve)) {
      notice(g, 'Loan Denied', `${p.lender} looked at your credit score (${score}) and your business plan and said no. ${score < 640 ? 'Your credit needs work.' : 'Banks here are cautious with new businesses.'}`, { emoji: '\u{1F3E6}', tone: 'bad' })
      askFunding(g, { ...p, noLoan: true })
      return
    }
    p.loan = terms.amount
    p.rate = terms.rate
  } else if (deal && !isDeepTechIndustry(p.industry)) {
    p.investor = deal.amount
    p.equity = deal.equity
    p.investorName = investorFirm(p.countryId, rand(g), rand(g))
  }
  if (isDeepTechIndustry(p.industry)) {
    if (p.funding === 'investors') p.funding = 'savings'
    askSeed(g, p)
    return
  }
  maybeAskBribe(g, p)
})

// In corrupt markets an official may hint at a "facilitation fee".
function maybeAskBribe(g: GameState, p: Plan): void {
  const m = marketOf(p.countryId)
  if (m.corruption < 55 || !chance(g, ((m.corruption - 45) / 100) * 0.9)) {
    askRunner(g, p)
    return
  }
  const fee = niceAmount(Math.max(150, m.startupFee * (0.6 + rand(g)) * localEcon(p.industry, p.countryId, p.city).level * 2))
  const clerk = `${randomFirstName(g, p.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, p.countryId)}`
  scriptChoice(
    g,
    BRIBE,
    'Paperwork Problems',
    `At the registry office, ${clerk} studies your forms for a long time, sighs, and explains that ${p.name}'s permits "could take many months". Unless, of course, you'd like to pay a ${formatMoney(fee)} "facilitation fee". In cash.`,
    [
      { id: 'pay', label: `Pay the "fee" (${money(fee)})`, emoji: '\u{2709}\u{FE0F}' },
      { id: 'refuse', label: 'Refuse and wait', emoji: '\u{23F3}' },
      { id: 'report', label: 'Report them', emoji: '\u{1F46E}' },
      { id: 'cancel', label: `Never mind: don't open ${p.name}`, emoji: '\u{2716}\u{FE0F}' },
    ],
    { emoji: '\u{1F5C3}\u{FE0F}', data: { ...(planJson(p) as Record<string, Json>), bribe: fee, clerk } },
  )
}

const BRIBE = defineScript('business.found.bribe', (g, choice, data) => {
  const p = readPlan(data)
  const d = rec(data)
  if (!p || !d || choice === 'cancel' || foundBlock(g)) return
  const fee = num(d.bribe)
  const clerk = str(d.clerk, 'the clerk')
  if (choice === 'pay') {
    p.extraFees += fee
    p.days = Math.max(1, Math.round(p.days * 0.3))
    addHidden(g, 'karma', -6)
    if (chance(g, 0.04 + (100 - marketOf(p.countryId).corruption) / 600)) {
      notice(g, 'Sting Operation', `${clerk} was wearing a wire. Anti-corruption investigators were very interested in your envelope.`, { emoji: '\u{1F575}\u{FE0F}', tone: 'bad' })
      arrestPlayer(g, 'Bribery', 2, { evidence: 0.75, noResist: true, context: `You were caught bribing ${clerk} at the company registry.` })
      return
    }
    notice(g, 'Fast-Tracked', `The envelope disappeared and your permits appeared, stamped, within the week. Funny how that works.`, { emoji: '\u{1F4DD}' })
  } else if (choice === 'report') {
    addHidden(g, 'karma', 6)
    if (chance(g, 0.5)) {
      notice(g, 'Reported', `You reported ${clerk}. To your surprise, they were suspended and your paperwork went through on schedule.`, { emoji: '\u{1F46E}', tone: 'good' })
    } else {
      p.days += randInt(g, 30, 90)
      p.extraFees += Math.round(marketOf(p.countryId).startupFee * 0.5)
      notice(g, 'Reported', `You reported ${clerk}. Nothing happened to them, but your file was "misplaced" and had to be resubmitted, with new fees.`, { emoji: '\u{1F5C3}\u{FE0F}', tone: 'bad' })
    }
  } else {
    p.days += randInt(g, 45, 120)
    p.extraFees += Math.round(marketOf(p.countryId).startupFee * 0.5)
    notice(g, 'The Slow Lane', `You politely declined. Your application went to the bottom of a very tall pile, and a few "missing stamps" later cost extra fees.`, { emoji: '\u{23F3}' })
  }
  askRunner(g, p)
})

function askRunner(g: GameState, p: Plan): void {
  const job = g.character.job
  if (!job) {
    finalize(g, p, true)
    return
  }
  const other = ceoJob(g)
  const text = other
    ? `You already run ${other.company}. Who will run ${p.name} day to day?`
    : `You work as ${job.title}${job.company ? ` at ${job.company}` : ''}. Who will run ${p.name} day to day?`
  scriptChoice(
    g,
    RUNNER,
    'Who Runs It?',
    text,
    [
      { id: 'me', label: other ? `Me (${other.company} gets a manager)` : `Me (quit my job as ${job.title})`, emoji: '\u{1F454}' },
      { id: 'manager', label: 'Hire a general manager', emoji: '\u{1F9D1}\u{200D}\u{1F4BC}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
    ],
    { emoji: '\u{1F4BC}', data: planJson(p) },
  )
}

const RUNNER = defineScript('business.found.runner', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || choice === 'cancel' || foundBlock(g)) return
  finalize(g, p, choice === 'me')
})

/** A fresh BizState for a new company. */
export function newBiz(g: GameState, industry: Industry, countryId: string, city: string, opts: Partial<BizState> = {}): BizState {
  const e = localEcon(industry, countryId, city)
  const c = g.character
  const b: BizState = {
    v: BIZ_VERSION,
    industry,
    countryId,
    city,
    founded: g.year,
    founderName: fullName(c),
    acquired: false,
    share: 1,
    invested: 0,
    cash: 0,
    debt: 0,
    debtRate: baseLoanRate(countryId, 'business'),
    employees: industryDef(industry).staff,
    wageLevel: 1,
    morale: 70,
    staff: [],
    quality: 50,
    brand: Math.round(clampN(15 + c.hidden.fame / 4, 0, 60)),
    price: e.goingPrice,
    production: 0,
    inventory: 0,
    marketingLevel: 1,
    campaignBoost: 0,
    products: [],
    outlets: [{ countryId, city, count: 1, opened: g.year }],
    history: [],
    last: null,
    valuation: 0,
    public: false,
    sharesOut: 0,
    sharePrice: 0,
    exchange: '',
    ipoYear: 0,
    ceo: 'owner',
    manager: null,
    ownerSalary: 0,
    supplier: 'standard',
    insured: false,
    cooked: 0,
    pressure: 0,
    costShock: 1,
    demandShock: 1,
    capacityLoss: 0,
    openFraction: 1,
    yearCosts: 0,
    yearIncome: 0,
    raiseYear: 0,
    lastEvent: 0,
    loanId: '',
    slump: 0,
    ...opts,
  }
  // Financial firms open real books at founding: an investment firm is an asset manager (legal in
  // every era) unless the caller picks a type with initFund; a bank's books are sized to its capital.
  if (b.industry === 'investmentFirm') initFund(g, b, 'asset')
  else if (isBank(b)) openBank(b)
  return b
}

/** Plan production for the coming year at the current price. */
export function initialProduction(g: GameState, b: BizState): number {
  if (isFinanceFirm(b)) return 0
  const plan = planFor(g, b, g.year, { cycle: () => 1 })
  return Math.round(clampN(plan.demand, 0, maxProduction(g, b)))
}

/** A kind 'business' asset for a company (the caller pushes it onto g.assets). */
export function createBusinessAsset(g: GameState, name: string, b: BizState, purchasePrice: number): Asset {
  return businessAsset(g, name, b, purchasePrice)
}

function businessAsset(g: GameState, name: string, b: BizState, purchasePrice: number): Asset {
  const def = industryDef(b.industry)
  const a: Asset = {
    id: uid(g, 'biz'),
    kind: 'business',
    name,
    emoji: def.emoji,
    purchasePrice: Math.max(0, Math.round(purchasePrice)),
    value: 0,
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: b as unknown as Record<string, Json>,
  }
  return a
}

function finalize(g: GameState, p: Plan, runIt: boolean): void {
  if (p.mode === 'buy') {
    finalizePurchase(g, p, runIt)
    return
  }
  if (isDeepTechIndustry(p.industry)) {
    finalizeDeepTech(g, p, runIt)
    return
  }
  const c = g.character
  const def = industryDef(p.industry)
  const cost = startupCost(p.industry, p.countryId, p.city)
  const fees = cost.fee + cost.permits + p.extraFees
  const outside = p.funding === 'loan' ? p.loan : p.funding === 'investors' ? p.investor : 0
  const capital = Math.max(cost.capital, p.capital ?? 0)
  const personal = Math.max(0, capital - outside) + fees
  if (!spend(g, personal)) {
    notice(g, "Can't Afford It", `You need ${formatMoney(personal)} of your own money to open ${p.name}, and you have ${formatMoney(c.money)}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  let loanId = ''
  if (p.funding === 'loan' && p.loan > 0) {
    loanId = addLoan(g, { kind: 'business', lender: p.lender, principal: p.loan, rate: p.rate, years: 7 }).id
  }
  const b = newBiz(g, p.industry, p.countryId, p.city, {
    share: p.funding === 'investors' ? Math.round((1 - p.equity) * 100) / 100 : 1,
    invested: personal,
    // Investors hold preferred shares: in a sale or closure they get their money back first.
    ...(p.funding === 'investors' && p.investor > 0 ? { pref: Math.round(p.investor) } : {}),
    cash: Math.round(capital - cost.capital * .8),
    openFraction: openFractionFor(p.days),
    loanId,
    quality: Math.round(clampN(45 + (c.stats.smarts - 50) / 8, 30, 65)),
  })
  if (b.industry === 'investmentFirm') initFund(g, b, p.investmentModel ?? 'asset')
  b.production = initialProduction(g, b)
  b.valuation = Math.max(valuationOf(b), Math.round(cost.capital * 0.8))
  const a = businessAsset(g, p.name, b, personal)
  g.assets.push(a)
  refreshValue(a, b)
  count(g, 'businessesFounded')
  let quit: string | null = null
  if (runIt) quit = becomeCeo(g, a, b, 'Founder & CEO')
  else installManager(g, b, managerCandidate(g, b))
  addStat(g, 'happiness', 8)
  const country = getCountry(p.countryId)
  const funding =
    p.funding === 'loan'
      ? ` ${p.lender} lent you ${formatMoney(p.loan)} at ${pct(p.rate, 1)} over 7 years (you're personally on the hook).`
      : p.funding === 'investors'
        ? ` ${p.investorName} put in ${formatMoney(p.investor)} for ${pct(p.equity)} of the company (if you ever sell or close it, they get their money back first).`
        : ''
  const open = b.openFraction < 0.95 ? ` Paperwork in ${country.name} took about ${p.days} days, so you'll only trade for part of this first year.` : ''
  const run = runIt
    ? ` You're the Founder & CEO${quit ? `, and you ${quit}` : ''}.`
    : ` ${b.manager ? `${b.manager.firstName} ${b.manager.lastName}` : 'A general manager'} will run it day to day.`
  const plan =
    isBank(b) ? ' Set savings and loan rates, lending appetite and products in Financial Operations. Deposits belong to your savers; the capital is yours to lose.'
    : b.industry === 'investmentFirm'
      ? foundingNote(readFund(b))
      : isFinanceFirm(b)
      ? ' Set risk, rates and client policies in Financial Operations. Customer principal is segregated; you earn fees and banking spreads, never free deposits.'
      : p.industry === 'gameStudio'
      ? ` Greenlight your first game from the company screen: your ${b.employees} developers are waiting for something to make.`
      : " Every year you'll get an Annual Report to set prices and production."
  const text = `${p.name} is officially registered in ${country.name}! Your first ${def.site} is opening in ${p.city}. You put in ${formatMoney(personal)} of your own money, including ${formatMoney(fees)} in fees and permits.${funding}${open}${run}${plan}`
  log(g, `I founded ${p.name}, ${aIndustry(def.label)} in ${p.city}.`, 'good')
  remember(g, `Founded ${p.name} (${industryNoun(def.label)}) in ${p.city}, ${country.name}.`)
  notice(g, 'Open for Business!', text, { emoji: def.emoji, tone: 'good' })
}

function finalizeDeepTech(g: GameState, p: Plan, runIt: boolean): void {
  const c = g.character
  const ind = p.industry as DeepTechIndustry
  const def = industryDef(ind)
  const cost = startupCost(ind, p.countryId, p.city)
  const fees = cost.fee + cost.permits + p.extraFees
  const outside = p.funding === 'loan' ? p.loan : 0
  const capital = Math.max(cost.capital, p.capital ?? 0)
  const personal = Math.max(0, capital - outside) + fees
  if (!spend(g, personal)) {
    notice(g, "Can't Afford It", `You need ${formatMoney(personal)} of your own money to open ${p.name}, and you have ${formatMoney(c.money)}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  let loanId = ''
  if (p.funding === 'loan' && p.loan > 0) loanId = addLoan(g, { kind: 'business', lender: p.lender, principal: p.loan, rate: p.rate, years: 7 }).id
  let share = 1
  if (p.cofounder) share *= 1 - COFOUNDER_EQUITY
  if (p.seed > 0) share *= 1 - p.seedEquity
  const b = newBiz(g, ind, p.countryId, p.city, {
    share: Math.round(share * 10000) / 10000,
    invested: personal,
    cash: Math.round(capital - cost.capital * .8),
    openFraction: openFractionFor(p.days),
    loanId,
    quality: Math.round(clampN(45 + (c.stats.smarts - 50) / 8, 30, 65)),
    production: 0,
  })
  const t = initTech(g, b, { cofounder: p.cofounder || undefined, expert: p.expert, seed: p.seed > 0 ? { amount: p.seed, equity: p.seedEquity, investor: p.seedInvestor } : null })
  const expert = p.expert ? expertHire(g, b) : null
  if (expert) b.staff.push(expert)
  refreshTechValue(g, b, t)
  b.valuation = valuationOf(b)
  const a = businessAsset(g, p.name, b, personal)
  g.assets.push(a)
  refreshValue(a, b)
  count(g, 'businessesFounded')
  let quit: string | null = null
  if (runIt) {
    quit = becomeCeo(g, a, b, 'Founder & CEO')
    // Startup founders pay themselves like one of their engineers, not like a CEO.
    b.ownerSalary = Math.min(b.ownerSalary, localEcon(ind, p.countryId, p.city).wage)
    const job = ceoJob(g, a.id)
    if (job) job.salary = b.ownerSalary
  } else installManager(g, b, managerCandidate(g, b))
  addStat(g, 'happiness', 8)
  const country = getCountry(p.countryId)
  const parts = [`${p.name} is officially registered in ${country.name}! Your first ${def.site} opens in ${p.city}. You put in ${formatMoney(personal)} of your own money, including ${formatMoney(fees)} in fees and permits.`]
  if (p.funding === 'loan') parts.push(`${p.lender} lent you ${formatMoney(p.loan)} at ${pct(p.rate, 1)} over 7 years (you're personally on the hook).`)
  if (p.seed > 0) parts.push(`${p.seedInvestor} put ${formatMoney(p.seed)} into the R&D account for ${pct(p.seedEquity)} of the company.`)
  else parts.push('No investors: every dollar of R&D comes from you and your sales.')
  if (p.cofounder) parts.push(`${p.cofounder} joined as your technical co-founder with ${pct(COFOUNDER_EQUITY)}.`)
  if (expert) parts.push(`You hired ${expert.firstName} ${expert.lastName} as ${expert.role} (${formatMoney(expert.salary)} a year).`)
  if (b.openFraction < 0.95) parts.push(`Paperwork in ${country.name} took about ${p.days} days.`)
  parts.push(runIt ? `You're the Founder & CEO${quit ? `, and you ${quit}` : ''}.` : `${b.manager ? `${b.manager.firstName} ${b.manager.lastName}` : 'A general manager'} will run it day to day.`)
  parts.push(`Next: start your first R&D program from the company's R&D Lab. ${DEEP_TECH[ind].stages[0].blurb}`)
  const text = parts.join(' ')
  log(g, `I founded ${p.name}, ${aIndustry(def.label)} in ${p.city}.`, 'good')
  remember(g, `Founded ${p.name} (${industryNoun(def.label)}) in ${p.city}, ${country.name}.`)
  notice(g, 'Open for Business!', text, { emoji: def.emoji, tone: 'good' })
}

// ---------------------------------------------------------------------------
// Start a Business menu

/** Why the player can't start a company in this industry right now (block, rules, money), or null. */
export function foundingProblem(g: GameState, industry: Industry): string | null {
  const block = foundBlock(g)
  if (block) return block
  const problem = industryProblem(g, industry)
  if (problem) return problem
  const c = g.character
  const need = minimumOutlay(industry, c.countryId, c.city)
  if (c.money < need) return outlayText(industry, c.countryId, need)
  return null
}

/** Open the founding flow (name → city → funding → registration) for one industry. */
export function startFounding(g: GameState, industry: Industry): void {
  const reason = foundingProblem(g, industry)
  if (reason) {
    notice(g, industryDef(industry).label, reason, { emoji: industryDef(industry).emoji })
    return
  }
  const row = industryRow(industry)
  row.run(g)
}

function homeCity(g: GameState): string {
  const c = g.character
  return getCountry(c.countryId).cities.includes(c.city) ? c.city : getCountry(c.countryId).cities[0]
}

function industryRow(industry: Industry): MenuAction {
  const def = INDUSTRIES[industry]
  const deep = isDeepTechIndustry(industry)
  return {
    type: 'action',
    id: `biz.start.${industry}`,
    label: def.label,
    emoji: def.emoji,
    subtitle: (g) => {
      const c = g.character
      const city = homeCity(g)
      if (!isIndustryLegal(c.countryId, industry)) return 'Not allowed here'
      if (industryEraBlock(industry, c.countryId, g.year)) return 'Not invented yet'
      const cost = startupCost(industry, c.countryId, city)
      if (deep) {
        const note = backgroundNote(g, industry as DeepTechIndustry)
        return `${stars(demandStars(c.countryId, industry))} local demand · first ${def.site} ${money(cost.total)}, you put in ${money(minimumOutlay(industry, c.countryId, city))}+ · ${note || 'your background fits'}`
      }
      const md = def.needs === 'medical' && !c.education.degrees.some((d) => d.kind === 'md') ? ' · no MD: doctors cost extra' : ''
      return `${stars(demandStars(c.countryId, industry))} local demand · from ${money(cost.total)}${md}`
    },
    hint: (g) => {
      const c = g.character
      if (!isIndustryLegal(c.countryId, industry)) return null
      // Classic rows: the industries that pay back fastest here, simulated with the same model
      // the company will run on. Deep tech: the real hubs (investors, talent, customers).
      if (!deep) return industryHint(g, industry, c.countryId, homeCity(g))
      const text = deepHubHint(c.countryId, industry)
      return text ? talentHint(g, 'Business', text) || null : null
    },
    disabledReason: (g) => {
      const block = foundBlock(g)
      if (block) return block
      const problem = industryProblem(g, industry)
      if (problem) return problem
      const c = g.character
      const need = minimumOutlay(industry, c.countryId, c.city)
      if (c.money < need) return outlayText(industry, c.countryId, need)
      return null
    },
    run: (g) => {
      const c = g.character
      const p: Plan = {
        mode: 'found',
        industry,
        name: '',
        city: '',
        countryId: c.countryId,
        funding: 'savings',
        loan: 0,
        rate: 0,
        lender: '',
        investor: 0,
        equity: 0,
        investorName: '',
        extraFees: 0,
        days: 7,
        listingId: '',
        noLoan: false,
        cofounder: '',
        expert: false,
        seed: 0,
        seedEquity: 0,
        seedInvestor: '',
      }
      scriptInput(g, {
        title: `Name Your ${def.label}`,
        emoji: def.emoji,
        text: `${industry === 'cafe' && (!hasTech(g, 'homeComputer') || g.year < 1990) ? 'Coffee, pastries and customers who never leave.' : industry === 'grocery' && g.year < 1955 ? 'Everybody eats. Margins thinner than the paper bags.' : def.blurb} What will you call it?`,
        input: 'text',
        placeholder: defaultName(g, industry),
        defaultValue: defaultName(g, industry),
        scriptId: NAME,
        data: planJson(p),
      })
    },
  }
}

export const startBusinessMenu: MenuGroup = {
  type: 'menu',
  id: 'biz.start',
  label: 'Start a Business',
  emoji: '\u{1F680}',
  subtitle: (g) => `Register a company in ${getCountry(g.character.countryId).name}`,
  visible: (g) => g.character.alive && !g.character.prison,
  disabledReason: (g) => foundBlock(g),
  header: (g) => {
    const m = localMarket(g)
    const country = getCountry(g.character.countryId)
    return [
      `Doing business in ${country.name}: corporate tax ${Math.round(m.corporateTax * 100)}%, ${m.salesTaxName} ${Math.round(m.salesTax * 100)}%, registration in about ${m.startupDays} ${m.startupDays === 1 ? 'day' : 'days'} for ${formatMoney(m.startupFee)}, business loans from ${pct(offeredRate(g, 'business'), 1)}.`,
      eraNote(g, g.character.countryId, m.businessNote),
      `You have ${formatMoney(g.character.money)}.`,
    ]
      .filter((x) => x)
      .join('\n')
  },
  children: (): MenuNode[] => [
    { type: 'heading', id: 'biz.start.classicH', label: 'Classic Businesses' },
    ...INDUSTRY_IDS.filter((i) => !isDeepTechIndustry(i)).map(industryRow),
    { type: 'heading', id: 'biz.start.deepH', label: 'Deep Tech' },
    {
      type: 'info',
      id: 'biz.start.deepInfo',
      emoji: '\u{1F52C}',
      text: 'High risk, high reward: R&D programs, venture rounds, breakthroughs and big exits. You pay for part of your first lab (a bank may lend the rest); investors fund the research. Each needs a technical background, a co-founder or a hired expert.',
    },
    ...INDUSTRY_IDS.filter((i) => isDeepTechIndustry(i)).map(industryRow),
  ],
}

// ---------------------------------------------------------------------------
// Buying a business that is for sale

interface ForSale {
  id: string
  name: string
  biz: BizState
  price: number
  profit: number
  revenue: number
  years: number
}

/** This year's businesses for sale in the player's country (stable within a year, no RNG use). */
export function listingsForSale(g: GameState): ForSale[] {
  const c = g.character
  const country = getCountry(c.countryId)
  const s = seeded(yearKey(g, 'biz.forSale'))
  // Deep-tech startups are founded, not bought off the shelf (and leaving them out keeps the
  // classic listings exactly as they were).
  const legal = INDUSTRY_IDS.filter((i) => isIndustryLegal(c.countryId, i) && !isDeepTechIndustry(i) && !industryEraBlock(i, c.countryId, g.year) && !financeEraBlock(g, i))
  const out: ForSale[] = []
  const bought = Array.isArray(g.flags['biz.bought']) ? (g.flags['biz.bought'] as Json[]) : []
  const words = marketOf(c.countryId).nameWords
  for (let i = 0; i < 3 && legal.length; i++) {
    const industry = s.weighted(legal, (x) => industryDemand(c.countryId, x) / Math.sqrt(Math.max(1, INDUSTRIES[x].capital / 100_000)))
    const def = industryDef(industry)
    const city = s.pick(country.cities)
    // Nobody sells a 15-year-old online store in 1998.
    const years = Math.max(1, Math.min(s.int(2, 18), g.year - (marketDef(industry).from ?? g.year - 99)))
    const outlets = 1 + (s.chance(0.35) ? s.int(1, 3) : 0)
    const b = newBiz(g, industry, c.countryId, city, {
      founded: g.year - years,
      founderName: `${s.pick(['The', 'A'])} previous owner`,
      acquired: true,
      quality: s.int(35, 80),
      brand: s.int(15, 65),
      morale: s.int(35, 85),
      outlets: [{ countryId: c.countryId, city, count: outlets, opened: g.year - years }],
      ceo: 'manager',
      manager: { firstName: 'Interim', lastName: 'Manager', gender: 'female', skill: s.int(40, 70), salary: 0, since: g.year },
    })
    // An investment firm for sale is one of the types legal this year (a venture firm's funds and
    // portfolio aren't sold off the shelf). Its own stream keeps the other listings unchanged.
    if (industry === 'investmentFirm') initFund(g, b, seeded(yearKey(g, `biz.forSale.fund.${i}`)).pick(FUND_TYPES.filter(t => t !== 'vc' && !fundTypeBlock(t, g.year))))
    b.production = isFinanceFirm(b) ? 0 : Math.round(planFor(g, b, g.year - 1, { calm: true }).demand)
    const clone = JSON.parse(JSON.stringify(b)) as BizState
    const stmt = simulateYear(g, clone, g.year - 1, 0, 1).stmt
    clone.history = [{ year: stmt.year, revenue: stmt.revenue, profit: stmt.net, tax: stmt.corpTax, units: stmt.sold, price: stmt.price, staff: stmt.employees, valuation: 0, outlets }]
    clone.cash = Math.max(0, Math.round(stmt.revenue * 0.05))
    const value = Math.max(valuationOf(clone), 10_000)
    const id = `${g.year}:${i}:${industry}`
    if (bought.includes(id)) continue
    const name = `${words.length && s.chance(0.6) ? s.pick(words) : randomLastNameSeeded(s.next())} ${s.pick(def.suffixes)}`
    out.push({ id, name: cleanName(name, def.label), biz: clone, price: niceAmount(value * s.float(1, 1.25)), profit: stmt.net, revenue: stmt.revenue, years })
  }
  return out
}

const SURNAMES = ['Grant', 'Novak', 'Silva', 'Okafor', 'Tanaka', 'Moreau', 'Rossi', 'Khan', 'Larsen', 'Haddad', 'Kowalski', 'Mendez']
function randomLastNameSeeded(roll: number): string {
  return SURNAMES[Math.floor(clampN(roll, 0, 0.9999) * SURNAMES.length)]
}

const BUY = defineScript('business.buy.funding', (g, choice, data) => {
  const p = readPlan(data)
  if (!p || choice === 'cancel' || foundBlock(g)) return
  const listing = listingsForSale(g).find((l) => l.id === p.listingId)
  if (!listing) {
    notice(g, 'Already Sold', 'Someone else bought that business first.', { emoji: '\u{1F937}' })
    return
  }
  p.funding = choice === 'loan' ? 'loan' : 'savings'
  if (p.funding === 'loan') {
    const score = creditScore(g)
    const m = marketOf(p.countryId)
    const approve = clampN((score - 540) / 220 + (m.easeOfBusiness - 60) / 150 + 0.1, 0.05, 0.95)
    p.lender = bankName(p.countryId, rand(g))
    if (!chance(g, approve)) {
      notice(g, 'Loan Denied', `${p.lender} turned down the acquisition loan. Your credit score is ${score}.`, { emoji: '\u{1F3E6}', tone: 'bad' })
      return
    }
    p.loan = Math.round(listing.price * 0.65)
    p.rate = offeredRate(g, 'business')
  }
  askRunner(g, p)
})

function finalizePurchase(g: GameState, p: Plan, runIt: boolean): void {
  const listing = listingsForSale(g).find((l) => l.id === p.listingId)
  if (!listing) return
  const fee = Math.round(marketOf(p.countryId).startupFee * 0.5)
  const personal = listing.price - (p.funding === 'loan' ? p.loan : 0) + fee
  if (!spend(g, personal)) {
    notice(g, "Can't Afford It", `You need ${formatMoney(personal)} to close the deal.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  let loanId = ''
  if (p.funding === 'loan' && p.loan > 0) loanId = addLoan(g, { kind: 'business', lender: p.lender, principal: p.loan, rate: p.rate, years: 8 }).id
  const b = listing.biz
  b.invested = personal
  b.loanId = loanId
  b.founderName = b.founderName || 'a previous owner'
  b.manager = null
  b.ceo = 'owner'
  b.ownerSalary = 0
  b.valuation = valuationOf(b)
  const a = businessAsset(g, listing.name, b, personal)
  g.assets.push(a)
  refreshValue(a, b)
  g.flags['biz.bought'] = [...(Array.isArray(g.flags['biz.bought']) ? (g.flags['biz.bought'] as Json[]).filter((x) => typeof x === 'string' && x.startsWith(`${g.year}:`)) : []), listing.id]
  count(g, 'businessesAcquired')
  let quit: string | null = null
  if (runIt) quit = becomeCeo(g, a, b, 'Owner & CEO')
  else installManager(g, b, managerCandidate(g, b))
  addStat(g, 'happiness', 6)
  const def = industryDef(b.industry)
  const text = `You bought ${listing.name}, ${aYearsOld(listing.years)} ${industryNoun(def.label)} in ${b.city}, for ${formatMoney(listing.price)}${p.funding === 'loan' ? ` (${p.lender} financed ${formatMoney(p.loan)})` : ''}. ${runIt ? `You're the new Owner & CEO${quit ? `; you ${quit}` : ''}.` : 'A general manager runs it for you.'}`
  log(g, `I bought ${listing.name}.`, 'good')
  remember(g, `Bought ${listing.name} (${industryNoun(def.label)}) in ${b.city}.`)
  notice(g, 'Deal Closed!', text, { emoji: def.emoji, tone: 'good' })
}

function listingRow(l: ForSale): MenuAction {
  const def = industryDef(l.biz.industry)
  // An investment firm says what kind it is (an asset manager and a brokerage are different buys).
  const kind = l.biz.industry === 'investmentFirm' ? TYPE_INFO[readFund(l.biz).type].label : def.label
  return {
    type: 'action',
    id: `biz.buy.${l.id}`,
    label: l.name,
    emoji: def.emoji,
    subtitle: `${kind} · ${l.biz.city} · ${l.years} yrs old · ${money(l.price)} · ${l.profit >= 0 ? `${money(l.profit)} profit` : `${money(-l.profit)} loss`} last year`,
    disabledReason: (g) => {
      const block = foundBlock(g)
      if (block) return block
      const problem = industryProblem(g, l.biz.industry)
      if (problem) return problem
      const need = Math.round(l.price * 0.35)
      if (g.character.money < need) return `You need at least ${formatMoney(need)} (a 35% down payment) to make an offer.`
      return null
    },
    run: (g) => {
      const c = g.character
      const listing = listingsForSale(g).find((x) => x.id === l.id)
      if (!listing) return
      const p: Plan = {
        mode: 'buy',
        industry: listing.biz.industry,
        name: listing.name,
        city: listing.biz.city,
        countryId: c.countryId,
        funding: 'savings',
        loan: 0,
        rate: 0,
        lender: '',
        investor: 0,
        equity: 0,
        investorName: '',
        extraFees: 0,
        days: 1,
        listingId: listing.id,
        noLoan: false,
        cofounder: '',
        expert: false,
        seed: 0,
        seedEquity: 0,
        seedInvestor: '',
      }
      const choices: ChoiceOption[] = []
      if (c.money >= listing.price) choices.push({ id: 'savings', label: `Pay cash (${money(listing.price)})`, emoji: '\u{1F4B0}' })
      if (c.money >= listing.price * 0.35) choices.push({ id: 'loan', label: `Acquisition loan for 65% at ~${pct(offeredRate(g, 'business'), 1)}`, emoji: '\u{1F3E6}' })
      choices.push({ id: 'cancel', label: 'Walk away', emoji: '\u{2716}\u{FE0F}' })
      const s = listing.biz
      scriptChoice(
        g,
        BUY,
        `Buy ${listing.name}?`,
        `${listing.name} is ${aIndustry(def.label)} in ${s.city} with ${s.outlets[0]?.count ?? 1} ${(s.outlets[0]?.count ?? 1) === 1 ? def.site : def.sitePlural}. Last year: ${money(listing.revenue)} in sales and ${listing.profit >= 0 ? `${money(listing.profit)} profit` : `a ${money(-listing.profit)} loss`}. Quality ${s.quality}%, brand ${s.brand}%, staff morale ${s.morale}%. Asking price: ${formatMoney(listing.price)}.`,
        choices,
        { emoji: def.emoji, data: planJson(p) },
      )
    },
  }
}

export const buyBusinessMenu: MenuGroup = {
  type: 'menu',
  id: 'biz.buy',
  label: 'Buy a Business',
  emoji: '\u{1F3F7}\u{FE0F}',
  subtitle: 'Companies for sale near you',
  visible: (g) => g.character.alive && !g.character.prison,
  disabledReason: (g) => foundBlock(g),
  header: (g) => `Established businesses for sale in ${getCountry(g.character.countryId).name} this year. Buying one skips the startup risk, but you pay for the goodwill.`,
  children: (g) => {
    const list = listingsForSale(g)
    if (list.length === 0) return [{ type: 'info', id: 'biz.buy.none', text: 'Nothing for sale right now. Check back next year.', emoji: '\u{1F937}' }]
    return list.map(listingRow)
  },
}
